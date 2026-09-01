"""CelesTrak SOCRATES: ingest a published screening metric without claiming to compute it.

SOCRATES publishes, for each screened conjunction, a maximum-probability value
(``MAX_PROB``) computed by CelesTrak under the Alfano formulation: the projected
covariance ellipse sized and oriented to produce the maximum probability, at
fixed 100 m / 300 m / 100 m radial / in-track / cross-track uncertainty.

Two things follow, and both are contractual here rather than advisory:

1. **This is not Pc.** It is a screening bound under CelesTrak's stated
   assumptions, not an operational collision probability derived from real
   covariance. The project rule is explicit — never relabel SOCRATES
   MaxProbability as CDM collision probability. Every row this module produces
   carries ``basis=OBSERVED_EXTERNAL``, which the payload layer refuses to
   report as ``COMPUTED``.

2. **We did not compute it.** The value is attributed to CelesTrak with the
   retrieval URI and the sha256 of the exact bytes we read, so a reader can tell
   our arithmetic from someone else's.

Usage policy (celestrak.org, 2026-05-15, upd. 2026-05-22) is enforced, not merely
noted: machine-to-machine clients must **stop immediately on any non-200** and
alert a human, and the directory endpoint may be polled at most hourly.
Repeatedly ignoring this gets the source IP firewalled — which would cost us the
feed entirely — so this module deliberately does not retry, unlike the shared
live-provider client.
"""

from __future__ import annotations

import csv
import io
from dataclasses import dataclass, field
from datetime import datetime
from typing import Any

from backend.ingestion.errors import InsufficientDataError
from backend.providers_live import LiveProviderClient, RawResponse

SOURCE_ID = "CELESTRAK_SOCRATES"

#: Bulk product. The HTML query endpoint caps at 1000 rows and is not machine-readable.
SOCRATES_CSV_URI = "https://celestrak.org/SOCRATES/sort-minRange.csv"
#: Directory endpoint carrying FILE_MTIME. Policy caps this at once per hour.
SOCRATES_DIR_URI = "https://celestrak.org/SOCRATES/jsonDir.php"

#: The value is a screening bound under CelesTrak's declared uncertainty, not a Pc.
METRIC_METHOD = "SOCRATES_MAX_PROB"
METRIC_BASIS_OBSERVED_EXTERNAL = "OBSERVED_EXTERNAL"
METRIC_STATUS_OBSERVED = "OBSERVED"

_EXPECTED_COLUMNS = (
    "NORAD_CAT_ID_1",
    "OBJECT_NAME_1",
    "DSE_1",
    "NORAD_CAT_ID_2",
    "OBJECT_NAME_2",
    "DSE_2",
    "TCA",
    "TCA_RANGE",
    "TCA_RELATIVE_SPEED",
    "MAX_PROB",
    "DILUTION",
)

_ASSUMPTION_NOTE = (
    "CelesTrak SOCRATES maximum probability (Alfano): covariance ellipse sized and "
    "oriented to maximise probability at 100 m radial / 300 m in-track / 100 m "
    "cross-track. A screening bound under stated assumptions, not an operational "
    "collision probability, and not derived from observed covariance."
)


class SocratesUsagePolicyError(RuntimeError):
    """Raised on any non-200 so a human is alerted before the IP is firewalled.

    Deliberately not a retryable provider error: the usage policy requires
    stopping, and an automated retry is the exact behaviour that gets the source
    address blocked.
    """

    def __init__(self, message: str, details: dict[str, Any]) -> None:
        super().__init__(message)
        self.details = details


@dataclass(frozen=True)
class SocratesConjunction:
    """One published screening row, carrying its origin rather than our authority."""

    primary_catalog_id: str
    primary_name: str
    secondary_catalog_id: str
    secondary_name: str
    tca: str
    tca_range_km: float
    relative_speed_km_s: float
    max_probability: float
    dilution_km: float | None

    def to_metric_payload(self, artifact_id: str | None = None) -> dict[str, Any]:
        """Shape this row for the MAX_PC channel, never for the PC channel."""
        return {
            "max_pc": self.max_probability,
            "max_pc_method": METRIC_METHOD,
            "max_pc_basis": METRIC_BASIS_OBSERVED_EXTERNAL,
            "max_pc_status": METRIC_STATUS_OBSERVED,
            "max_pc_artifact_id": artifact_id,
            # Deliberately absent: pc, pc_method, pc_status. A screening bound
            # must not populate the operational probability channel.
        }


@dataclass(frozen=True)
class SocratesResult:
    raw: RawResponse
    conjunctions: tuple[SocratesConjunction, ...]
    skipped_rows: tuple[dict[str, Any], ...] = field(default=())

    @property
    def source_uri(self) -> str:
        return self.raw.source_uri

    @property
    def retrieved_at(self) -> datetime:
        return self.raw.retrieved_at

    @property
    def raw_sha256(self) -> str:
        return self.raw.raw_sha256

    @property
    def status(self) -> str:
        return "AVAILABLE" if self.conjunctions else "INSUFFICIENT_DATA"

    def to_dict(self) -> dict[str, Any]:
        return {
            "source_id": SOURCE_ID,
            "source_uri": self.source_uri,
            "retrieved_at": self.retrieved_at.isoformat(),
            "raw_sha256": self.raw_sha256,
            "status": self.status,
            "metric_channel": "MAX_PC",
            "metric_basis": METRIC_BASIS_OBSERVED_EXTERNAL,
            "assumptions": _ASSUMPTION_NOTE,
            "licence_note": (
                "CelesTrak publishes under a usage policy, not an open-data licence; "
                "attribute CelesTrak and honour the stop-on-error rule."
            ),
            "conjunction_count": len(self.conjunctions),
            "skipped_row_count": len(self.skipped_rows),
            "skipped_rows": list(self.skipped_rows[:20]),
        }


def _catalog_id(value: str) -> str:
    """Normalise a catalogue number without assuming its width.

    CelesTrak exhausted 5-digit numbers at 69999 and 6-digit identifiers are
    already live in this feed, so anything that pads or truncates to five
    characters would silently corrupt current data.
    """
    return value.strip()


def parse_socrates_csv(raw: RawResponse) -> SocratesResult:
    """Parse the bulk CSV, accounting for every row we could not use."""
    text = raw.content.decode("utf-8-sig", errors="strict")
    reader = csv.DictReader(io.StringIO(text))

    header = reader.fieldnames or []
    missing = [column for column in _EXPECTED_COLUMNS if column not in header]
    if missing:
        raise InsufficientDataError(
            "SOCRATES CSV is missing expected columns; the feed format may have changed",
            {"source_id": SOURCE_ID, "missing_columns": missing, "header": header},
        )

    conjunctions: list[SocratesConjunction] = []
    skipped: list[dict[str, Any]] = []
    for index, row in enumerate(reader, start=2):  # row 1 is the header
        try:
            max_probability = float(row["MAX_PROB"])
            conjunctions.append(
                SocratesConjunction(
                    primary_catalog_id=_catalog_id(row["NORAD_CAT_ID_1"]),
                    primary_name=(row["OBJECT_NAME_1"] or "").strip(),
                    secondary_catalog_id=_catalog_id(row["NORAD_CAT_ID_2"]),
                    secondary_name=(row["OBJECT_NAME_2"] or "").strip(),
                    tca=(row["TCA"] or "").strip(),
                    tca_range_km=float(row["TCA_RANGE"]),
                    relative_speed_km_s=float(row["TCA_RELATIVE_SPEED"]),
                    max_probability=max_probability,
                    dilution_km=_optional_float(row.get("DILUTION")),
                )
            )
        except (TypeError, ValueError, KeyError) as error:
            # Counted, never silently dropped: a feed that starts failing to parse
            # must be visible as a changed skip count, not as a shorter result.
            skipped.append({"row": index, "reason": type(error).__name__, "detail": str(error)})

    return SocratesResult(
        raw=raw, conjunctions=tuple(conjunctions), skipped_rows=tuple(skipped)
    )


def _optional_float(value: str | None) -> float | None:
    if value is None or not value.strip():
        return None
    try:
        return float(value)
    except ValueError:
        return None


async def fetch_socrates(client: LiveProviderClient) -> SocratesResult:
    """Retrieve and parse the bulk SOCRATES product.

    The client must be constructed with ``max_retries=0``. Retrying a non-200
    against CelesTrak is what the usage policy forbids, and the penalty is an IP
    ban that would remove the feed for everyone behind this address.
    """
    if client.max_retries != 0:
        raise SocratesUsagePolicyError(
            "SOCRATES client must not retry; CelesTrak requires stopping on any non-200",
            {"source_id": SOURCE_ID, "configured_max_retries": client.max_retries},
        )
    raw = await client.fetch_raw(SOCRATES_CSV_URI, source_id=SOURCE_ID)
    return parse_socrates_csv(raw)
