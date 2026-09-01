"""Adapter turning persisted P4 conjunction screenings into Intelligence Signals.

The intelligence pipeline (E38-E44) was wired only to the fixed Apollo 11 official
fixture, so nothing real ever reached it. This module bridges the gap in the one
direction that is safe: it *reads* what P4 already persisted and re-expresses it in
the SignalRecord/EvidenceRecord contract. It is advisory-only and read-only -- it
never screens, never propagates, never commands, and never derives a metric that
P4 itself declined to compute.

Three honesty rules drive every design choice here:

1. A screening result is a *computed* product, not an observation, so its evidence
   is EvidenceClass.DERIVED. Dressing it as OBSERVED would let downstream fusion
   weight it as if a sensor had seen it.
2. Pc and miss distance are separate channels. When P4 records Pc as NOT_COMPUTED
   (PUBLIC_GP carries no covariance) the signal says so explicitly and carries the
   reason; the miss distance never moves into the Pc slot.
3. SignalRecord.significance stays None. Any number there would be read downstream
   as a calibrated collision-risk strength, and no such calibration exists for
   screening-only input. Promotion is instead earned through event_hint, which the
   SignalPromotionGate accepts without a significance score.
"""

from __future__ import annotations

from collections.abc import Callable, Sequence
from dataclasses import dataclass
from datetime import UTC, datetime
from typing import Any
from uuid import UUID

from aetherus_domain.models import (
    EvidenceClass,
    EvidenceRecord,
    SignalRecord,
    SourceGrade,
    ValidationState,
    canonical_hash,
)

ADAPTER_ID = "P4_CONJUNCTION_SIGNAL_ADAPTER"
ADAPTER_VERSION = "0.1.0"

#: Identity this adapter publishes as. Deliberately not one of the E2x module ids:
#: impersonating a screening module would silently change validation-state defaults
#: inside IntelligenceOrchestrator._validation.
PRODUCER_MODULE_ID = "P4_CA_SCREENING_ADAPTER"

SIGNAL_TYPE = "CONJUNCTION_SCREENING_CANDIDATE"

#: Promotion hint. The gate promotes on a hint without a significance score, which
#: is exactly what we want: a real candidate reaches the pipeline without anyone
#: inventing a risk number for it.
EVENT_HINT = "CONJUNCTION_SCREENING_CANDIDATE"

#: The only metric P4 actually computes for PUBLIC_GP screening input.
METRIC_TYPE = "MISS_DISTANCE"
METRIC_UNITS = "m"

SIGNIFICANCE_STATUS = "NOT_ASSESSED"
SIGNIFICANCE_REASON = "NO_CALIBRATED_SEVERITY_MODEL_FOR_SCREENING_ONLY_INPUT"

PROHIBITED_CLAIMS: tuple[str, ...] = (
    "Do not present miss_distance_m as, or convert it into, a collision probability.",
    "Do not present this signal as an observation; it is a computed screening result.",
    "Do not present a screening candidate as a conjunction warning or a manoeuvre trigger.",
    "Do not aggregate signals with pc_status NOT_COMPUTED into any Pc-based ranking.",
)

ALLOWED_CLAIMS: tuple[str, ...] = (
    "A bounded SGP4 coarse screening over stored public GP solutions retained this pair.",
    "miss_distance_m and relative_speed_mps come from the refined TCA of that screening.",
)

#: P4 speaks its own vocabulary ("PUBLIC_GP", "PUBLIC_SCREENING"); the domain enums
#: do not contain those literals. We map to the nearest defined member so the typed
#: contract holds, and preserve the raw literal verbatim next to it so nothing about
#: the upstream grading is lost or upgraded.
_SOURCE_GRADE_MAP: dict[str, SourceGrade] = {
    "PUBLIC_GP": SourceGrade.PUBLIC_SCREENING,
    "PUBLIC_SCREENING": SourceGrade.PUBLIC_SCREENING,
    "OPERATIONAL": SourceGrade.OPERATIONAL,
    "OFFICIAL_PUBLIC": SourceGrade.OFFICIAL_PUBLIC,
    "VALIDATION_FIXTURE": SourceGrade.VALIDATION_FIXTURE,
    "RESEARCH": SourceGrade.RESEARCH,
    "USER_OBSERVATION": SourceGrade.USER_OBSERVATION,
    "UNKNOWN": SourceGrade.UNKNOWN,
}

_VALIDATION_STATE_MAP: dict[str, ValidationState] = {
    "PUBLIC_SCREENING": ValidationState.SCREENING_ONLY,
    "SCREENING_ONLY": ValidationState.SCREENING_ONLY,
    "UNVALIDATED": ValidationState.UNVALIDATED,
    "VALIDATION_PENDING": ValidationState.VALIDATION_PENDING,
    "VALIDATED_PIPELINE": ValidationState.VALIDATED_PIPELINE,
    "RESEARCH_ONLY": ValidationState.RESEARCH_ONLY,
    "INSUFFICIENT_DATA": ValidationState.INSUFFICIENT_DATA,
}


@dataclass(frozen=True)
class ConjunctionSignalBundle:
    """Signals plus their evidence, carrying P4's own status verbatim.

    An empty ``signals`` list is a first-class result, never an error to paper over:
    ``data_status``/``status_reason`` say why nothing was produced.
    """

    request_id: str
    generated_at: str
    data_status: str
    status_reason: str | None
    signals: list[SignalRecord]
    evidence: list[EvidenceRecord]
    skipped: list[dict[str, Any]]
    warnings: list[str]
    provenance: dict[str, Any]

    @property
    def evidence_by_id(self) -> dict[UUID, EvidenceRecord]:
        return {record.id: record for record in self.evidence}

    def evidence_lookup(self, evidence_id: UUID | str) -> EvidenceRecord | None:
        """Callable shape SignalPromotionGate expects for provenance verification."""
        key = evidence_id if isinstance(evidence_id, UUID) else UUID(str(evidence_id))
        return self.evidence_by_id.get(key)

    def to_payload(self) -> dict[str, Any]:
        """House-style envelope so an API route can serve this without reshaping."""
        return {
            "request_id": self.request_id,
            "generated_at": self.generated_at,
            "data_status": self.data_status,
            "status_reason": self.status_reason,
            "data": {
                "count": len(self.signals),
                "signals": [s.model_dump(mode="json") for s in self.signals],
                "evidence": [e.model_dump(mode="json") for e in self.evidence],
                "skipped": self.skipped,
            },
            "provenance": self.provenance,
            "warnings": self.warnings,
        }


def signals_from_conjunction_payload(
    payload: dict[str, Any],
    *,
    retrieved_at: datetime | None = None,
) -> ConjunctionSignalBundle:
    """Convert one ``ConjunctionService.list_conjunctions`` envelope into signals.

    Pure and synchronous, so tests can drive it from a recorded envelope without a
    database or a network hop.
    """
    received_at = _require_aware(retrieved_at) if retrieved_at else datetime.now(UTC)
    data = payload.get("data") or {}
    events = data.get("events") or []
    run_provenance = payload.get("provenance") or {}
    upstream_status = str(payload.get("data_status") or "UNAVAILABLE")
    upstream_reason = payload.get("status_reason")
    warnings: list[str] = list(payload.get("warnings") or [])

    signals: list[SignalRecord] = []
    evidence: list[EvidenceRecord] = []
    skipped: list[dict[str, Any]] = []

    for event in events:
        try:
            record, signal = _convert_event(event, received_at=received_at)
        except _UnconvertibleEvent as error:
            # A malformed row is dropped with its reason, never repaired with defaults.
            skipped.append({"event_id": event.get("event_id"), "reason": error.reason})
            continue
        evidence.append(record)
        signals.append(signal)

    if not signals:
        # No conjunction -> no signal. The status is echoed from P4 so the caller
        # can tell "screening ran and found nothing" from "screening never ran".
        data_status = upstream_status
        # P4 may leave status_reason empty (an upstream run can end UNAVAILABLE with
        # no recorded reason); an empty bundle must still state why it is empty, so
        # we add our own reason without overwriting one that exists.
        status_reason = upstream_reason or "NO_CONJUNCTION_EVENT_AVAILABLE_FOR_SIGNAL_CONVERSION"
        warnings.append(
            "No stored conjunction was convertible; zero signals emitted and none fabricated."
        )
    elif skipped:
        data_status = "PARTIAL"
        status_reason = "SOME_CONJUNCTION_EVENTS_LACKED_REQUIRED_LINEAGE_FIELDS"
        warnings.append(
            f"{len(skipped)} stored conjunction(s) lacked lineage fields and were dropped, not defaulted."
        )
    else:
        data_status = upstream_status
        status_reason = upstream_reason

    return ConjunctionSignalBundle(
        request_id=str(payload.get("request_id") or ""),
        generated_at=str(payload.get("generated_at") or received_at.isoformat()),
        data_status=data_status,
        status_reason=status_reason,
        signals=signals,
        evidence=evidence,
        skipped=skipped,
        warnings=warnings,
        provenance={
            **run_provenance,
            "adapter_id": ADAPTER_ID,
            "adapter_version": ADAPTER_VERSION,
            "producer_module_id": PRODUCER_MODULE_ID,
            "retrieved_at": received_at.isoformat(),
            "upstream_data_status": upstream_status,
            "upstream_status_reason": upstream_reason,
        },
    )


async def build_conjunction_signals(
    service: Any | None = None,
    *,
    object_ref: str | None = None,
    start: str | None = None,
    stop: str | None = None,
    source_grade: str | None = None,
    limit: int | None = None,
    retrieved_at: datetime | None = None,
) -> ConjunctionSignalBundle:
    """Read persisted P4 conjunctions and express them as Intelligence Signals.

    ``service`` is injectable so tests never need to construct a real repository;
    when omitted, the live :class:`ConjunctionService` over PostGIS is used.
    """
    if service is None:
        from backend.conjunction.service import ConjunctionService

        service = ConjunctionService()

    payload = await service.list_conjunctions(
        object_ref=object_ref,
        start_raw=start,
        stop_raw=stop,
        source_grade=source_grade,
        # Metric filters are intentionally not exposed: a threshold on PC would
        # silently drop every PUBLIC_GP screening, which is the whole population.
        metric_type=None,
        threshold_min=None,
        threshold_max=None,
        limit_raw=limit,
    )
    return signals_from_conjunction_payload(payload, retrieved_at=retrieved_at)


class _UnconvertibleEvent(Exception):
    def __init__(self, reason: str) -> None:
        super().__init__(reason)
        self.reason = reason


def _convert_event(
    event: dict[str, Any], *, received_at: datetime
) -> tuple[EvidenceRecord, SignalRecord]:
    event_id = event.get("event_id")
    snapshot = event.get("latest_snapshot") or {}
    snapshot_id = snapshot.get("snapshot_id")
    if not event_id:
        raise _UnconvertibleEvent("EVENT_ID_MISSING")
    if not snapshot_id:
        raise _UnconvertibleEvent("LATEST_SNAPSHOT_MISSING")

    tca = _parse_aware(event.get("tca"))
    if tca is None:
        raise _UnconvertibleEvent("TCA_MISSING_OR_NAIVE")
    # observed_at is when the screening produced this result, not when the close
    # approach occurs; conflating the two would date every signal into the future.
    snapshot_at = _parse_aware(snapshot.get("snapshot_at"))
    if snapshot_at is None:
        raise _UnconvertibleEvent("SNAPSHOT_AT_MISSING_OR_NAIVE")

    primary = event.get("primary") or {}
    secondary = event.get("secondary") or {}
    primary_catalog = _text(primary.get("catalog_id"))
    secondary_catalog = _text(secondary.get("catalog_id"))
    if primary_catalog is None or secondary_catalog is None:
        raise _UnconvertibleEvent("CATALOG_ID_MISSING_ON_BOTH_SIDES_REQUIRED")

    primary_object = _text(primary.get("object_id")) or f"catalog:{primary_catalog}"
    secondary_object = _text(secondary.get("object_id")) or f"catalog:{secondary_catalog}"

    metrics = snapshot.get("metrics") or {}
    pc_block = _pc_block(metrics, snapshot)
    miss_distance = _number(snapshot.get("miss_distance_m"))
    miss_status = "COMPUTED" if miss_distance is not None else "NOT_COMPUTED"

    raw_grade = _text(snapshot.get("source_grade"))
    grade = _SOURCE_GRADE_MAP.get((raw_grade or "").upper(), SourceGrade.UNKNOWN)
    raw_validation = _text(snapshot.get("validation_state"))
    validation = _VALIDATION_STATE_MAP.get(
        (raw_validation or "").upper(), ValidationState.UNVALIDATED
    )

    snapshot_provenance = (
        snapshot.get("provenance") if isinstance(snapshot.get("provenance"), dict) else {}
    ) or {}
    model_version = _text(snapshot.get("model_version"))
    input_hash = _text(snapshot.get("input_hash"))

    lineage = {
        "event_id": str(event_id),
        "snapshot_id": str(snapshot_id),
        "source_event_id": _text(event.get("source_event_id")),
        "snapshot_at": snapshot_at.isoformat(),
        "tca": tca.isoformat(),
        "primary_catalog_id": primary_catalog,
        "secondary_catalog_id": secondary_catalog,
        "primary_object_id": primary_object,
        "secondary_object_id": secondary_object,
        "miss_distance_m": miss_distance,
        "relative_speed_mps": _number(snapshot.get("relative_speed_mps")),
        "pc": pc_block,
        "model_version": model_version,
        "input_hash": input_hash,
        "config_hash": _text(snapshot_provenance.get("config_hash")),
        "screening_run_id": _text(snapshot_provenance.get("screening_run_id")),
        "source_grade_raw": raw_grade,
        "validation_state_raw": raw_validation,
    }
    # The checksum covers exactly the derived content this evidence stands for, so a
    # re-read of an unchanged snapshot reproduces it bit for bit.
    checksum = canonical_hash(lineage)
    source_uri = f"aetherus://conjunction/event/{event_id}/snapshot/{snapshot_id}"

    record = EvidenceRecord(
        evidence_class=EvidenceClass.DERIVED,
        source_id=_text(snapshot_provenance.get("model_id")) or "aetherus-ca-screening",
        source_record_id=str(snapshot_id),
        observed_at=snapshot_at,
        received_at=received_at,
        checksum_sha256=checksum,
        source_grade=grade,
        metadata={
            "source_uri": source_uri,
            "source_uri_scheme": "INTERNAL_RESOURCE_URI",
            "retrieved_at": received_at.isoformat(),
            "checksum_basis": "CANONICAL_JSON_OF_DERIVED_SNAPSHOT_LINEAGE",
            "adapter_id": ADAPTER_ID,
            "adapter_version": ADAPTER_VERSION,
            # Raw upstream grading kept verbatim: the enum above is a mapping, not a
            # replacement, and PUBLIC_GP must stay legible downstream.
            "source_grade_raw": raw_grade,
            "validation_state_raw": raw_validation,
            "upstream_source_ids": list(snapshot_provenance.get("source_ids") or []),
            "upstream_input_artifact_hashes": list(
                snapshot_provenance.get("input_artifact_hashes") or []
            ),
            "upstream_retrieved_at": snapshot_provenance.get("retrieved_at"),
            "source_snapshot_at": snapshot_provenance.get("source_snapshot_at"),
            "secondary_source_snapshot_at": snapshot_provenance.get(
                "secondary_source_snapshot_at"
            ),
            "source_age_seconds_max": snapshot_provenance.get("source_age_s_max"),
            "model_id": snapshot_provenance.get("model_id"),
            "model_version": model_version,
            "config_hash": snapshot_provenance.get("config_hash"),
            "input_hash": input_hash,
            "screening_run_id": snapshot_provenance.get("screening_run_id"),
            "pc_rule": snapshot_provenance.get("pc_rule"),
            "evidence_class_reason": (
                "Screening output is computed from stored GP solutions; it is DERIVED, "
                "never OBSERVED."
            ),
        },
    )

    signal = SignalRecord(
        signal_type=SIGNAL_TYPE,
        evidence_class=EvidenceClass.DERIVED,
        producer_module_id=PRODUCER_MODULE_ID,
        observed_at=snapshot_at,
        object_ids=sorted({primary_object, secondary_object}),
        event_hint=EVENT_HINT,
        metric_type=METRIC_TYPE,
        value=miss_distance,
        units=METRIC_UNITS if miss_distance is not None else None,
        # Never a number: see module docstring, rule 3.
        significance=None,
        evidence_ids=[record.id],
        payload={
            **lineage,
            "signal_type": SIGNAL_TYPE,
            "metric_type": METRIC_TYPE,
            "metric_status": miss_status,
            "metric_units": METRIC_UNITS,
            "significance_status": SIGNIFICANCE_STATUS,
            "significance_reason": SIGNIFICANCE_REASON,
            "risk_ranking_basis": "PC" if pc_block["computed"] else "MISS_DISTANCE_ONLY",
            "tca_boundary_flag": snapshot.get("tca_boundary_flag"),
            "dilution_state": snapshot.get("dilution_state"),
            "event_status": event.get("event_status"),
            "first_seen_at": event.get("first_seen_at"),
            "last_seen_at": event.get("last_seen_at"),
            "primary_canonical_name": primary.get("canonical_name"),
            "secondary_canonical_name": secondary.get("canonical_name"),
            "source_uri": source_uri,
            "adapter_id": ADAPTER_ID,
            "adapter_version": ADAPTER_VERSION,
            # Mapped enum literal: the orchestrator constructs ValidationState from
            # this, so it must be a member name, while the raw P4 literal lives in
            # validation_state_raw above.
            "validation_state": validation.value,
            # One P4 conjunction event <-> one Intelligence event. Without this the
            # correlator would bucket by calendar day and merge unrelated pairs.
            "correlation_bucket": str(event_id),
            "allowed_claims": list(ALLOWED_CLAIMS),
            "prohibited_claims": list(PROHIBITED_CLAIMS),
        },
    )
    return record, signal


def _pc_block(metrics: dict[str, Any], snapshot: dict[str, Any]) -> dict[str, Any]:
    """Report Pc exactly as P4 left it, including why it does not exist."""
    raw = metrics.get("PC")
    if not isinstance(raw, dict):
        # Absent is not the same as NOT_COMPUTED; say which one it is.
        return {
            "value": None,
            "method": None,
            "status": "UNAVAILABLE",
            "unavailable_reason": "PC_METRIC_ABSENT_FROM_SNAPSHOT",
            "covariance_status": _text(snapshot.get("covariance_status")) or "UNAVAILABLE",
            "computed": False,
            "explanation": "P4 snapshot carried no PC metric channel.",
        }
    value = _number(raw.get("value"))
    status = _text(raw.get("status")) or "UNAVAILABLE"
    reason = _text(raw.get("unavailable_reason"))
    covariance_status = _text(snapshot.get("covariance_status")) or "UNAVAILABLE"
    computed = status == "COMPUTED" and value is not None
    if computed:
        explanation = f"Pc computed by {_text(raw.get('method')) or 'UNSPECIFIED_METHOD'}."
    else:
        explanation = (
            f"Pc is {status}"
            + (f" because {reason}" if reason else "")
            + f"; covariance_status={covariance_status}. "
            "miss_distance_m is not a probability and must not be read as one."
        )
    return {
        "value": value if computed else None,
        "method": _text(raw.get("method")),
        "status": status,
        "unavailable_reason": reason,
        "covariance_status": covariance_status,
        "computed": computed,
        "explanation": explanation,
    }


def _require_aware(value: datetime) -> datetime:
    if value.tzinfo is None or value.utcoffset() is None:
        raise ValueError("retrieved_at must be an offset-aware UTC instant")
    return value.astimezone(UTC)


def _parse_aware(value: Any) -> datetime | None:
    if value is None:
        return None
    if isinstance(value, datetime):
        parsed = value
    else:
        try:
            parsed = datetime.fromisoformat(str(value))
        except ValueError:
            return None
    if parsed.tzinfo is None or parsed.utcoffset() is None:
        return None
    return parsed.astimezone(UTC)


def _text(value: Any) -> str | None:
    if value is None:
        return None
    text = str(value).strip()
    return text or None


def _number(value: Any) -> float | None:
    if value is None or isinstance(value, bool):
        return None
    try:
        return float(value)
    except (TypeError, ValueError):
        return None


__all__: Sequence[str] = (
    "ADAPTER_ID",
    "ADAPTER_VERSION",
    "ALLOWED_CLAIMS",
    "EVENT_HINT",
    "METRIC_TYPE",
    "METRIC_UNITS",
    "PRODUCER_MODULE_ID",
    "PROHIBITED_CLAIMS",
    "SIGNAL_TYPE",
    "ConjunctionSignalBundle",
    "build_conjunction_signals",
    "signals_from_conjunction_payload",
)

# Kept for the type checker's benefit only; the gate takes any callable.
EvidenceLookup = Callable[[UUID], EvidenceRecord | None]
