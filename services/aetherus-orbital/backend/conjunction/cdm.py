"""CDM parsing that preserves the immutable raw artifact and its source grade.

The parser reads CCSDS-CDM-shaped JSON documents (as published by the TraCSS
specification examples), keeps the raw byte hash for provenance, and never
manufactures a missing field. Fixture documents stay explicitly graded — they
are never represented as live operational events.
"""

import hashlib
import json
from dataclasses import dataclass, field
from typing import Any


class CdmParseError(ValueError):
    """The CDM document is structurally unusable; nothing is fabricated."""


@dataclass(frozen=True)
class CdmObjectState:
    """One object half of a CDM document."""

    catalog_id: str
    name: str | None
    covariance_km2: list[list[float]] | None
    covariance_reference_frame: str | None
    covariance_unit: str | None
    hbr_m: float | None
    covariance_method: str | None
    # Published state vector (frame per REF_FRAME) and AREA_PC. Optional so the
    # JSON dialect, which carries neither, keeps constructing this unchanged.
    state_position_km: tuple[float, float, float] | None = None
    state_velocity_km_s: tuple[float, float, float] | None = None
    state_frame: str | None = None
    area_pc_m2: float | None = None


@dataclass(frozen=True)
class ParsedCdm:
    """Canonical fields extracted from one CDM document."""

    conjunction_id: str | None
    creation_date: str | None
    tca: str | None
    miss_distance_m: float | None
    relative_speed_mps: float | None
    primary: CdmObjectState
    secondary: CdmObjectState
    combined_hbr_m: float | None
    hbr_semantics: str | None
    source_grade: str
    content_sha256: str
    warnings: list[str] = field(default_factory=list)

    @property
    def is_validation_fixture(self) -> bool:
        """True when the document declares a non-operational validation grade."""
        return "SPEC_EXAMPLE" in self.source_grade or "NOT_OPERATIONAL" in self.source_grade


def parse_cdm(raw_bytes: bytes, source_grade: str) -> ParsedCdm:
    """Parse raw CDM bytes into canonical fields; missing fields stay absent."""
    content_sha256 = hashlib.sha256(raw_bytes).hexdigest()
    try:
        document = json.loads(raw_bytes.decode("utf-8"))
    except (UnicodeDecodeError, json.JSONDecodeError) as error:
        raise CdmParseError(f"CDM payload is not valid UTF-8 JSON: {error}") from error
    if not isinstance(document, dict):
        raise CdmParseError("CDM payload must be a JSON object")

    default_frame = _optional_str(
        document.get("covariance_reference_frame", document.get("ref_frame"))
    )
    default_unit = _optional_str(
        document.get("covariance_unit", document.get("covariance_units"))
    )
    primary = _parse_object_state(document, "obj1", "primary", default_frame, default_unit)
    secondary = _parse_object_state(document, "obj2", "secondary", default_frame, default_unit)
    warnings: list[str] = []
    if not source_grade:
        warnings.append("CDM carried no source grade; treated as unspecified.")

    return ParsedCdm(
        conjunction_id=_optional_str(document.get("conjunction_id")),
        creation_date=_optional_str(document.get("creation_date")),
        tca=_optional_str(document.get("tca")),
        miss_distance_m=_optional_number(document, "miss_distance_m", warnings),
        relative_speed_mps=_optional_number(document, "relative_speed_m_s", warnings),
        primary=primary,
        secondary=secondary,
        combined_hbr_m=_optional_number(document, "combined_hbr_m", warnings),
        hbr_semantics=_optional_str(document.get("hbr_semantics")),
        source_grade=source_grade,
        content_sha256=content_sha256,
        warnings=warnings,
    )


def _parse_object_state(
    document: dict[str, Any],
    key: str,
    label: str,
    default_frame: str | None,
    default_unit: str | None,
) -> CdmObjectState:
    entry = document.get(key)
    if not isinstance(entry, dict):
        raise CdmParseError(f"CDM {label} block '{key}' is missing or not an object")
    catalog_value = entry.get("norad", entry.get("catalog_id"))
    if catalog_value is None:
        raise CdmParseError(f"CDM {label} has no catalog identifier")
    return CdmObjectState(
        catalog_id=str(catalog_value),
        name=_optional_str(entry.get("name")),
        covariance_km2=_covariance_block(entry, label),
        covariance_reference_frame=_optional_str(
            entry.get("covariance_reference_frame", entry.get("ref_frame", default_frame))
        ),
        covariance_unit=_optional_str(
            entry.get("covariance_unit", entry.get("covariance_units", default_unit))
        ),
        hbr_m=_optional_number(entry, "hbr_m", []),
        covariance_method=_optional_str(entry.get("covariance_method")),
    )


def _covariance_block(entry: dict[str, Any], label: str) -> list[list[float]] | None:
    matrix = entry.get("covariance_km2", entry.get("covariance"))
    if matrix is None:
        return None
    if not isinstance(matrix, list) or len(matrix) != 6:
        raise CdmParseError(f"CDM {label} covariance must be a 6x6 array")
    parsed: list[list[float]] = []
    for row in matrix:
        if not isinstance(row, list) or len(row) != 6:
            raise CdmParseError(f"CDM {label} covariance row must have 6 values")
        try:
            parsed.append([float(value) for value in row])
        except (TypeError, ValueError) as error:
            raise CdmParseError(f"CDM {label} covariance holds a non-numeric value") from error
    return parsed


def _optional_str(value: Any) -> str | None:
    return str(value) if value is not None else None


def _optional_number(
    document: dict[str, Any], key: str, warnings: list[str]
) -> float | None:
    value = document.get(key)
    if value is None:
        warnings.append(f"CDM omitted '{key}'.")
        return None
    try:
        number = float(value)
    except (TypeError, ValueError):
        return None
    return number if number == number else None  # reject NaN without fabricating
