"""Read a CCSDS 508.0-B-1 Conjunction Data Message in its published encoding.

The existing parser accepts JSON with a 6x6 nested covariance declared TEME/km2 —
the conventions Aetherus already wanted. A real CDM is KVN (or XML) and carries,
per object, the 21-element lower triangle of a 6x6 covariance in the RTN frame,
expressed in m**2. The 2026-09-02 reality test recorded five gates that a
spec-shaped document hits; this module opens three of them:

* the KVN encoding itself,
* the lower triangle to a symmetric 6x6 matrix,
* m**2 to km2 (an exact scalar, 1e-6 on position blocks).

It deliberately does NOT rotate the covariance. A CDM covariance is expressed
in RTN, and rotating it into TEME requires the object state vector and a
correctly derived rotation — real orbital mechanics whose errors are silent.
That transform lives in ``cdm_pc`` with its own invariant tests and method
identifiers; this parser reports the frame as published and now also captures
the state vector (``REF_FRAME``, X..Z_DOT) and ``AREA_PC`` that ``cdm_pc``
needs. ``covariance_reference_frame`` says RTN, and the caller decides.

What this module buys is the honest half: we can now read the document, see what
it contains, and state exactly what remains. Before, a real CDM died at
``json.loads`` and nothing downstream could be evaluated at all.
"""

from __future__ import annotations

import hashlib
import re
from dataclasses import dataclass
from typing import Any

from backend.conjunction.cdm import CdmObjectState, CdmParseError, ParsedCdm

#: The lower triangle a CDM publishes, in the order CCSDS 508.0-B-1 lists it.
#: Index i of this tuple is element (row, col) of the 6x6 in row-major lower
#: triangular order: (0,0), (1,0), (1,1), (2,0), ...
COVARIANCE_KEYS: tuple[str, ...] = (
    "CR_R",
    "CT_R", "CT_T",
    "CN_R", "CN_T", "CN_N",
    "CRDOT_R", "CRDOT_T", "CRDOT_N", "CRDOT_RDOT",
    "CTDOT_R", "CTDOT_T", "CTDOT_N", "CTDOT_RDOT", "CTDOT_TDOT",
    "CNDOT_R", "CNDOT_T", "CNDOT_N", "CNDOT_RDOT", "CNDOT_TDOT", "CNDOT_NDOT",
)

#: CDM position covariance is published in m**2; the Pc gate works in km2.
#: Exact, not a tolerance: 1 m**2 = 1e-6 km2.
_M2_TO_KM2 = 1.0e-6

#: A KVN line is ``KEY = VALUE`` with an optional bracketed unit.
_LINE = re.compile(r"^\s*([A-Z0-9_]+)\s*=\s*(.*?)\s*$")
_UNIT = re.compile(r"^(?P<value>.*?)\s*\[(?P<unit>[^\]]+)\]\s*$")


@dataclass(frozen=True)
class KvnField:
    """One parsed KVN assignment, keeping the declared unit rather than assuming."""

    value: str
    unit: str | None


def _split_unit(raw: str) -> KvnField:
    match = _UNIT.match(raw)
    if match is None:
        return KvnField(value=raw.strip(), unit=None)
    return KvnField(value=match.group("value").strip(), unit=match.group("unit").strip())


def _as_float(field: KvnField, key: str) -> float:
    try:
        return float(field.value)
    except (TypeError, ValueError) as error:
        raise CdmParseError(f"CDM field {key} is not numeric: {field.value!r}") from error


def parse_kvn_sections(text: str) -> tuple[dict[str, KvnField], list[dict[str, KvnField]]]:
    """Split a KVN CDM into its header/relative block and its per-object blocks.

    A CDM has one header followed by exactly two ``OBJECT = OBJECT1|OBJECT2``
    sections. Keys repeat across sections, so they cannot be flattened into one
    mapping without silently letting the secondary object overwrite the primary.
    """
    header: dict[str, KvnField] = {}
    objects: list[dict[str, KvnField]] = []
    current: dict[str, KvnField] | None = None

    for line in text.splitlines():
        stripped = line.strip()
        if not stripped or stripped.startswith("COMMENT"):
            continue
        match = _LINE.match(stripped)
        if match is None:
            continue
        key, raw = match.group(1), match.group(2)
        if key == "OBJECT" and raw.strip().upper().startswith("OBJECT"):
            current = {}
            objects.append(current)
            continue
        target = header if current is None else current
        target[key] = _split_unit(raw)

    return header, objects


def lower_triangle_to_matrix(values: list[float]) -> list[list[float]]:
    """Expand the 21 published elements into the symmetric 6x6 they describe.

    A CDM stores only the lower triangle because the matrix is symmetric by
    construction. Reconstructing it here keeps that symmetry exact rather than
    approximately: each off-diagonal is written to both positions from the one
    published number, so no rounding asymmetry can creep in and be mistaken for
    a real correlation.
    """
    if len(values) != 21:
        raise CdmParseError(
            f"CDM covariance needs 21 lower-triangle elements, received {len(values)}"
        )
    matrix = [[0.0] * 6 for _ in range(6)]
    index = 0
    for row in range(6):
        for col in range(row + 1):
            value = values[index]
            matrix[row][col] = value
            matrix[col][row] = value
            index += 1
    return matrix


def _covariance_from_object(
    block: dict[str, KvnField], role: str, warnings: list[str]
) -> tuple[list[list[float]] | None, str | None]:
    """Build the 6x6 and report the unit it ended up in.

    Missing covariance is absence, not zero: a CDM may legitimately omit it, and
    inventing zeros would hand the Pc engine a perfectly certain state vector.
    """
    present = [key for key in COVARIANCE_KEYS if key in block]
    if not present:
        return None, None
    if len(present) != len(COVARIANCE_KEYS):
        missing = [key for key in COVARIANCE_KEYS if key not in block]
        warnings.append(
            f"{role} covariance is incomplete; missing {len(missing)} of 21 elements "
            f"({', '.join(missing[:4])}...). Treated as absent rather than padded."
        )
        return None, None

    raw_units = {block[key].unit for key in COVARIANCE_KEYS if block[key].unit}
    values = [_as_float(block[key], key) for key in COVARIANCE_KEYS]
    matrix = lower_triangle_to_matrix(values)

    # Position-block units are what the Pc gate checks. CDMs mix m**2, m**2/s and
    # m**2/s**2 across the triangle; converting the whole matrix by one factor
    # would corrupt the velocity blocks, so only the 3x3 position block is
    # converted and the rest is carried through untouched and unused.
    position_units = {block[key].unit for key in COVARIANCE_KEYS[:6] if block[key].unit}
    if position_units == {"m**2"}:
        for row in range(3):
            for col in range(3):
                matrix[row][col] *= _M2_TO_KM2
        unit = "KM2"
        warnings.append(
            f"{role} position covariance converted from m**2 to km2 (exact, 1e-6). "
            "Velocity blocks are carried through in their published units and are "
            "not used by the Pc gate."
        )
    elif position_units in ({"km**2"}, {"km2"}):
        unit = "KM2"
    elif not position_units:
        unit = None
        warnings.append(f"{role} covariance declares no unit; none assumed.")
    else:
        unit = ", ".join(sorted(position_units))
        warnings.append(
            f"{role} covariance declares unhandled position unit(s) {unit}; "
            "carried through unconverted so the Pc gate rejects it rather than "
            "silently mis-scaling."
        )

    if raw_units - position_units - {"m**2/s", "m**2/s**2", "km**2/s", "km**2/s**2"}:
        warnings.append(f"{role} covariance carries unexpected units: {sorted(raw_units)}")

    return matrix, unit


def _object_state(block: dict[str, KvnField], role: str, warnings: list[str]) -> CdmObjectState:
    designator = block.get("OBJECT_DESIGNATOR")
    if designator is None:
        raise CdmParseError(f"CDM {role} object carries no OBJECT_DESIGNATOR")

    covariance, unit = _covariance_from_object(block, role, warnings)
    frame = block.get("COVARIANCE_REF_FRAME")
    position, velocity, state_frame = _state_from_object(block, role, warnings)
    area = _area_pc(block, role, warnings)
    return CdmObjectState(
        # Not padded to five digits: CelesTrak exhausted five-digit numbers at
        # 69999 and six-digit identifiers are already in circulation.
        catalog_id=designator.value.strip(),
        name=block["OBJECT_NAME"].value if "OBJECT_NAME" in block else None,
        covariance_km2=covariance,
        # RTN unless the document says otherwise. Carried verbatim: rotating it
        # into TEME needs the state vector and is deliberately not done here.
        covariance_reference_frame=(frame.value if frame else "RTN") if covariance else None,
        covariance_unit=unit,
        hbr_m=None,
        covariance_method=block["COVARIANCE_METHOD"].value
        if "COVARIANCE_METHOD" in block
        else None,
        state_position_km=position,
        state_velocity_km_s=velocity,
        state_frame=state_frame,
        area_pc_m2=area,
    )


def _state_from_object(
    block: dict[str, KvnField], role: str, warnings: list[str]
) -> tuple[tuple[float, float, float] | None, tuple[float, float, float] | None, str | None]:
    """The state vector as published: km and km/s, in the declared REF_FRAME."""
    keys = ("X", "Y", "Z", "X_DOT", "Y_DOT", "Z_DOT")
    if not all(key in block for key in keys):
        return None, None, None
    for key in ("X", "Y", "Z"):
        if block[key].unit not in (None, "km"):
            warnings.append(f"{role} {key} declares unit {block[key].unit!r}; state left unconverted")
            return None, None, None
    for key in ("X_DOT", "Y_DOT", "Z_DOT"):
        if block[key].unit not in (None, "km/s"):
            warnings.append(f"{role} {key} declares unit {block[key].unit!r}; state left unconverted")
            return None, None, None
    position = tuple(_as_float(block[key], key) for key in ("X", "Y", "Z"))
    velocity = tuple(_as_float(block[key], key) for key in ("X_DOT", "Y_DOT", "Z_DOT"))
    frame = block["REF_FRAME"].value.strip().upper() if "REF_FRAME" in block else None
    return position, velocity, frame  # type: ignore[return-value]


def _area_pc(block: dict[str, KvnField], role: str, warnings: list[str]) -> float | None:
    """AREA_PC in m**2, the only size information a CDM publishes."""
    if "AREA_PC" not in block:
        return None
    field = block["AREA_PC"]
    if field.unit not in (None, "m**2"):
        warnings.append(f"{role} AREA_PC declares unit {field.unit!r}; not converted")
        return None
    return _as_float(field, "AREA_PC")


def _metres(field: KvnField | None, key: str) -> float | None:
    if field is None:
        return None
    value = _as_float(field, key)
    if field.unit in (None, "m"):
        return value
    if field.unit == "km":
        return value * 1000.0
    raise CdmParseError(f"CDM field {key} declares unsupported unit {field.unit!r}")


def parse_cdm_kvn(raw_bytes: bytes, source_grade: str) -> ParsedCdm:
    """Parse a KVN CDM into the same canonical structure as the JSON path.

    Missing fields stay absent. The frame is reported as published, so a caller
    that needs TEME still fails the covariance gate — reading the document and
    being able to use it are separate claims, and only the first is made here.
    """
    content_sha256 = hashlib.sha256(raw_bytes).hexdigest()
    try:
        text = raw_bytes.decode("utf-8")
    except UnicodeDecodeError as error:
        raise CdmParseError(f"CDM payload is not valid UTF-8: {error}") from error

    if "CCSDS_CDM_VERS" not in text:
        raise CdmParseError("CDM payload carries no CCSDS_CDM_VERS; not a KVN CDM")

    header, objects = parse_kvn_sections(text)
    if len(objects) != 2:
        raise CdmParseError(
            f"a CDM describes exactly two objects; found {len(objects)}"
        )

    warnings: list[str] = []
    if not source_grade:
        warnings.append("CDM carried no source grade; treated as unspecified.")

    primary = _object_state(objects[0], "primary", warnings)
    secondary = _object_state(objects[1], "secondary", warnings)

    for role, state in (("primary", primary), ("secondary", secondary)):
        if state.covariance_km2 is not None and state.covariance_reference_frame != "TEME":
            warnings.append(
                f"{role} covariance is expressed in "
                f"{state.covariance_reference_frame}; the Pc gate requires TEME and "
                "will reject it. Rotating RTN to TEME needs the object state vector "
                "and is not performed here."
            )

    return ParsedCdm(
        conjunction_id=header["MESSAGE_ID"].value if "MESSAGE_ID" in header else None,
        creation_date=header["CREATION_DATE"].value if "CREATION_DATE" in header else None,
        tca=header["TCA"].value if "TCA" in header else None,
        miss_distance_m=_metres(header.get("MISS_DISTANCE"), "MISS_DISTANCE"),
        relative_speed_mps=(
            _as_float(header["RELATIVE_SPEED"], "RELATIVE_SPEED")
            if "RELATIVE_SPEED" in header
            else None
        ),
        primary=primary,
        secondary=secondary,
        # A CDM publishes each object's dimensions, never a combined hard-body
        # radius. Deriving one requires both objects' sizes and a stated
        # convention, so it is supplied out of band or not at all.
        combined_hbr_m=None,
        hbr_semantics=None,
        source_grade=source_grade,
        content_sha256=content_sha256,
        warnings=warnings,
    )


def looks_like_kvn(raw_bytes: bytes) -> bool:
    """Whether these bytes are a KVN CDM rather than the JSON dialect."""
    try:
        head = raw_bytes[:4096].decode("utf-8", errors="ignore")
    except Exception:  # noqa: BLE001 - detection must never raise
        return False
    return "CCSDS_CDM_VERS" in head


def parse_any_cdm(raw_bytes: bytes, source_grade: str) -> ParsedCdm:
    """Parse either dialect, choosing by content rather than by file extension."""
    from backend.conjunction.cdm import parse_cdm

    if looks_like_kvn(raw_bytes):
        return parse_cdm_kvn(raw_bytes, source_grade=source_grade)
    return parse_cdm(raw_bytes, source_grade=source_grade)


def covariance_summary(parsed: ParsedCdm) -> dict[str, Any]:
    """What a caller needs to decide whether Pc is reachable for this document."""
    blockers: list[str] = []
    for role, state in (("primary", parsed.primary), ("secondary", parsed.secondary)):
        if state.covariance_km2 is None:
            blockers.append(f"{role}_covariance_absent")
            continue
        if state.covariance_reference_frame != "TEME":
            blockers.append(f"{role}_frame_{state.covariance_reference_frame}")
        if state.covariance_unit != "KM2":
            blockers.append(f"{role}_unit_{state.covariance_unit}")
    if parsed.hbr_semantics != "COMBINED_HBR":
        blockers.append("hbr_semantics_absent")
    return {
        "pc_reachable": not blockers,
        "blockers": blockers,
        "content_sha256": parsed.content_sha256,
    }
