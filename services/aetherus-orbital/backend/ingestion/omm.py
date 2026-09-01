"""Parse CelesTrak's OMM-compatible JSON without TLE-width assumptions."""

import json
import math
from datetime import UTC, datetime
from typing import Any

from backend.ingestion.errors import OmmParseError
from backend.ingestion.models import OmmRecordCandidate, ParsedOmmRecord

CELESTRAK_JSON_DEFAULTS = {
    "REF_FRAME": "TEME",
    "TIME_SYSTEM": "UTC",
    "MEAN_ELEMENT_THEORY": "SGP4",
}
"""Defaults documented by CelesTrak for omitted redundant OMM JSON fields."""

_REQUIRED_MEAN_ELEMENT_FIELDS = (
    "MEAN_MOTION",
    "ECCENTRICITY",
    "INCLINATION",
    "RA_OF_ASC_NODE",
    "ARG_OF_PERICENTER",
    "MEAN_ANOMALY",
)


def parse_omm_document(content: bytes) -> list[ParsedOmmRecord]:
    """Normalize an OMM-compatible JSON document into canonical records.

    The provider bytes are deliberately not modified here. Missing scientific values
    are rejected instead of inferred, except CelesTrak's documented OMM defaults.
    """
    try:
        decoded: Any = json.loads(content)
    except (UnicodeDecodeError, json.JSONDecodeError) as error:
        raise OmmParseError("Provider response is not valid JSON") from error

    rows = decoded if isinstance(decoded, list) else [decoded]
    if not rows:
        raise OmmParseError("Provider response contains no OMM records")
    if not all(isinstance(row, dict) for row in rows):
        raise OmmParseError("Provider response contains a non-object OMM record")

    return [parse_omm_record(row) for row in rows]


def parse_omm_candidates(content: bytes) -> list[OmmRecordCandidate]:
    """Parse each response row independently so malformed rows can be quarantined.

    Invalid document-level JSON remains a document failure; a decoded array may
    contain independently traceable valid and invalid record candidates.
    """
    try:
        decoded: Any = json.loads(content)
    except (UnicodeDecodeError, json.JSONDecodeError) as error:
        raise OmmParseError("Provider response is not valid JSON") from error
    rows = decoded if isinstance(decoded, list) else [decoded]
    if not rows:
        raise OmmParseError("Provider response contains no OMM records")

    candidates: list[OmmRecordCandidate] = []
    for index, raw in enumerate(rows):
        fragment = json.dumps(raw, sort_keys=True, separators=(",", ":")).encode("utf-8")
        if not isinstance(raw, dict):
            candidates.append(
                OmmRecordCandidate(
                    index=index,
                    fragment=fragment,
                    record=None,
                    error=OmmParseError("Provider response contains a non-object OMM record"),
                )
            )
            continue
        try:
            record = parse_omm_record(raw)
        except OmmParseError as error:
            candidates.append(
                OmmRecordCandidate(index=index, fragment=fragment, record=None, error=error)
            )
        else:
            candidates.append(
                OmmRecordCandidate(index=index, fragment=fragment, record=record, error=None)
            )
    return candidates


def parse_omm_record(raw: dict[str, Any]) -> ParsedOmmRecord:
    """Normalize a single OMM-compatible JSON record."""
    catalog_id = _catalog_id(raw.get("NORAD_CAT_ID"))
    epoch = _utc_datetime(raw.get("EPOCH"), "EPOCH")
    mean_elements = {
        "mean_motion_rev_per_day": _number(raw, "MEAN_MOTION"),
        "eccentricity": _number(raw, "ECCENTRICITY"),
        "inclination_deg": _number(raw, "INCLINATION"),
        "ra_of_asc_node_deg": _number(raw, "RA_OF_ASC_NODE"),
        "arg_of_pericenter_deg": _number(raw, "ARG_OF_PERICENTER"),
        "mean_anomaly_deg": _number(raw, "MEAN_ANOMALY"),
        "bstar": _optional_number(raw, "BSTAR"),
        "mean_motion_dot": _optional_number(raw, "MEAN_MOTION_DOT"),
        "mean_motion_ddot": _optional_number(raw, "MEAN_MOTION_DDOT"),
        "element_set_no": _optional_integer(raw, "ELEMENT_SET_NO"),
        "rev_at_epoch": _optional_integer(raw, "REV_AT_EPOCH"),
    }
    limitations: list[str] = [
        "PUBLIC_GP source; this record is not an operational conjunction assessment.",
        "No covariance was supplied by this OMM response; Pc is NOT_COMPUTED.",
    ]
    object_type = _optional_string(raw.get("OBJECT_TYPE"))
    if object_type is None:
        object_type = "UNKNOWN"
        limitations.append("Provider response did not declare OBJECT_TYPE.")

    return ParsedOmmRecord(
        catalog_id=catalog_id,
        object_name=_optional_string(raw.get("OBJECT_NAME")),
        international_designator=_optional_string(raw.get("OBJECT_ID")),
        object_type=object_type,
        epoch=epoch,
        frame=_optional_string(raw.get("REF_FRAME")) or CELESTRAK_JSON_DEFAULTS["REF_FRAME"],
        time_system=_optional_string(raw.get("TIME_SYSTEM"))
        or CELESTRAK_JSON_DEFAULTS["TIME_SYSTEM"],
        theory=_optional_string(raw.get("MEAN_ELEMENT_THEORY"))
        or CELESTRAK_JSON_DEFAULTS["MEAN_ELEMENT_THEORY"],
        mean_elements=mean_elements,
        covariance=None,
        quality_grade="PUBLIC_GP",
        limitations=tuple(limitations),
    )


def _catalog_id(value: Any) -> str:
    """Preserve every catalog-ID digit as a canonical string."""
    if isinstance(value, bool) or value is None:
        raise OmmParseError("NORAD_CAT_ID is required")
    catalog_id = str(value).strip()
    if not catalog_id:
        raise OmmParseError("NORAD_CAT_ID is required")
    if not catalog_id.isdecimal():
        raise OmmParseError("NORAD_CAT_ID must be numeric")
    return catalog_id


def _utc_datetime(value: Any, field_name: str) -> datetime:
    """Require a timezone-aware provider timestamp and normalize it to UTC."""
    if not isinstance(value, str) or not value.strip():
        raise OmmParseError(f"{field_name} is required")
    try:
        parsed = datetime.fromisoformat(value.replace("Z", "+00:00"))
    except ValueError as error:
        raise OmmParseError(f"{field_name} is not a valid ISO-8601 timestamp") from error
    if parsed.tzinfo is None:
        # CelesTrak JSON intentionally omits the redundant OMM TIME_SYSTEM=UTC
        # field. This default is documented by the provider, not inferred here.
        parsed = parsed.replace(tzinfo=UTC)
    return parsed.astimezone(UTC)


def _number(raw: dict[str, Any], field_name: str) -> float:
    """Require a finite OMM element from a JSON number or provider numeric string."""
    value = raw.get(field_name)
    if isinstance(value, bool) or value is None:
        raise OmmParseError(f"{field_name} is required and must be numeric")
    if isinstance(value, str):
        value = value.strip()
        if not value:
            raise OmmParseError(f"{field_name} is required and must be numeric")
    if not isinstance(value, int | float | str):
        raise OmmParseError(f"{field_name} is required and must be numeric")
    try:
        parsed = float(value)
    except ValueError as error:
        raise OmmParseError(f"{field_name} is required and must be numeric") from error
    if not math.isfinite(parsed):
        raise OmmParseError(f"{field_name} must be finite")
    return parsed


def _optional_number(raw: dict[str, Any], field_name: str) -> float | None:
    """Return an optional finite element without assigning a replacement value."""
    value = raw.get(field_name)
    if value is None:
        return None
    if isinstance(value, bool):
        raise OmmParseError(f"{field_name} must be numeric when present")
    if isinstance(value, str):
        value = value.strip()
        if not value:
            raise OmmParseError(f"{field_name} must be numeric when present")
    if not isinstance(value, int | float | str):
        raise OmmParseError(f"{field_name} must be numeric when present")
    try:
        parsed = float(value)
    except ValueError as error:
        raise OmmParseError(f"{field_name} must be numeric when present") from error
    if not math.isfinite(parsed):
        raise OmmParseError(f"{field_name} must be finite when present")
    return parsed


def _optional_integer(raw: dict[str, Any], field_name: str) -> int | None:
    """Return an optional integer from an integer JSON value or decimal provider string."""
    value = raw.get(field_name)
    if value is None:
        return None
    if isinstance(value, bool):
        raise OmmParseError(f"{field_name} must be an integer when present")
    if isinstance(value, int):
        return value
    if isinstance(value, str) and value.strip().isdecimal():
        return int(value.strip())
    raise OmmParseError(f"{field_name} must be an integer when present")


def _optional_string(value: Any) -> str | None:
    """Return a nonempty provider string or no value."""
    if not isinstance(value, str):
        return None
    stripped = value.strip()
    return stripped or None
