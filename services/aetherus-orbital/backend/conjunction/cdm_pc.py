"""Take a parsed CDM from *readable* to *Pc-computable*, naming every transform.

The KVN parser (``cdm_kvn``) reads a CCSDS 508.0-B-1 document and reports what
it found: per-object state vectors in the frame the document declares, and
per-object covariance in RTN — the frame a CDM covariance is always in. Our Pc
engine wants both objects' covariance and the relative state in one inertial
frame, TEME, because that is what our own propagation produces. This module is
the bridge, and it does exactly three things, each with a method identifier
recorded in provenance:

1. **State frame → TEME.** ITRF states are rotated by the same IAU-82 GMST model
   the rest of the service uses (the exact inverse of ``frames.teme_to_itrf``,
   verified by round trip). TEME states pass through. EME2000/GCRF states are
   refused by name: the repository has no precession/nutation model, and the
   difference is real — faking it would be the silent-error case this module
   exists to avoid.
2. **RTN covariance → TEME covariance.** The RTN basis is built from the
   object's TEME state (R̂ = r/|r|, N̂ = r×v/|r×v|, T̂ = N̂×R̂); the position
   block transforms as ``M C Mᵀ``. Rotation is orthogonal, so trace and
   eigenvalues are invariant — the tests check that, plus analytic cases.
3. **Combined hard-body radius.** A CDM carries per-object AREA_PC, never a
   combined HBR. Radii are recovered as √(AREA_PC/π) and summed — the CARA
   convention — and the method is stamped on the result. Without AREA_PC on
   both objects the caller must supply the combined value or the gate stays
   shut.

What this module does NOT claim: that the resulting Pc is validated. Every
number here has been checked against internal invariants and analytic cases,
not against an externally published Pc for the same document — no such golden
case exists in the repository yet. ``validation_state`` says so.
"""

from __future__ import annotations

import math
from dataclasses import dataclass, field
from datetime import UTC, datetime
from typing import Any

import numpy as np

from backend.config import settings
from backend.conjunction.cdm import CdmObjectState, ParsedCdm
from backend.conjunction.pc import PcOutcome, compute_pc
from backend.orbit.frames import EARTH_ROTATION_RATE_RAD_S, FrameAssumptions, gmst_rad_from_ut1

ROTATION_METHOD = "RTN_TO_TEME_V1"
STATE_FRAME_METHOD = "ITRF_TO_TEME_GMST_IAU82_V1"
HBR_METHOD = "SUM_OF_RADII_FROM_AREA_PC_V1"
VALIDATION_STATE = "VALIDATION_PENDING"

_SUPPORTED_STATE_FRAMES = frozenset({"ITRF", "TEME"})
_COMBINED_HBR = "COMBINED_HBR"


def rtn_basis(r_km: np.ndarray, v_km_s: np.ndarray) -> np.ndarray:
    """Columns R̂, T̂, N̂ of the local orbital frame, in the frame of (r, v).

    Degenerate geometry (zero position, zero velocity, or r ∥ v) has no defined
    normal and is refused rather than patched.
    """
    r = np.asarray(r_km, dtype=float)
    v = np.asarray(v_km_s, dtype=float)
    r_norm = np.linalg.norm(r)
    h = np.cross(r, v)
    h_norm = np.linalg.norm(h)
    if not (math.isfinite(r_norm) and math.isfinite(h_norm)) or r_norm == 0.0 or h_norm == 0.0:
        raise ValueError("RTN basis undefined: position or angular momentum is degenerate")
    radial = r / r_norm
    normal = h / h_norm
    transverse = np.cross(normal, radial)
    return np.column_stack((radial, transverse, normal))


def rotate_rtn_covariance_to_inertial(
    cov_rtn: np.ndarray, r_km: np.ndarray, v_km_s: np.ndarray
) -> np.ndarray:
    """``M C Mᵀ`` for the 3x3 position block, with M the RTN basis of (r, v)."""
    c = np.asarray(cov_rtn, dtype=float)
    if c.shape != (3, 3):
        raise ValueError(f"expected a 3x3 position covariance, got {c.shape}")
    m = rtn_basis(r_km, v_km_s)
    rotated = m @ c @ m.T
    # Symmetry is exact in theory; enforce it against floating-point drift so
    # the Pc gate's symmetry check measures the input, not our arithmetic.
    return 0.5 * (rotated + rotated.T)


def itrf_to_teme(
    r_itrf_km: np.ndarray,
    v_itrf_km_s: np.ndarray,
    moment_utc: datetime,
    assumptions: FrameAssumptions,
) -> tuple[np.ndarray, np.ndarray]:
    """Exact inverse of ``frames.teme_to_itrf`` (GMST about Z, ω×r on velocity)."""
    theta = gmst_rad_from_ut1(moment_utc, assumptions.ut1_utc_offset_seconds)
    c, s = math.cos(theta), math.sin(theta)
    # teme_to_itrf applies A = [[c, s, 0], [-s, c, 0], [0, 0, 1]]; invert with Aᵀ.
    a_t = np.array([[c, -s, 0.0], [s, c, 0.0], [0.0, 0.0, 1.0]])
    r_i = np.asarray(r_itrf_km, dtype=float)
    v_i = np.asarray(v_itrf_km_s, dtype=float)
    omega_cross_r = np.array(
        [-EARTH_ROTATION_RATE_RAD_S * r_i[1], EARTH_ROTATION_RATE_RAD_S * r_i[0], 0.0]
    )
    r_t = a_t @ r_i
    v_t = a_t @ (v_i + omega_cross_r)
    return r_t, v_t


def _parse_tca(raw: str | None) -> datetime | None:
    if not raw:
        return None
    try:
        parsed = datetime.fromisoformat(raw)
    except ValueError:
        return None
    return parsed.replace(tzinfo=UTC) if parsed.tzinfo is None else parsed.astimezone(UTC)


def _position_block(cov: list[list[float]] | None) -> np.ndarray | None:
    if cov is None:
        return None
    arr = np.asarray(cov, dtype=float)
    if arr.shape != (6, 6):
        return None
    return arr[:3, :3]


@dataclass(frozen=True)
class CdmPcPreparation:
    """Everything compute_pc needs, plus the reasons if it cannot have it."""

    r_rel_km: tuple[float, float, float] | None
    v_rel_km_s: tuple[float, float, float] | None
    cov_primary_teme_km2: list[list[float]] | None
    cov_secondary_teme_km2: list[list[float]] | None
    hbr_m: float | None
    hbr_semantics: str | None
    blockers: tuple[str, ...]
    provenance: dict[str, Any] = field(default_factory=dict)

    @property
    def ready(self) -> bool:
        return not self.blockers


def _object_to_teme(
    state: CdmObjectState,
    role: str,
    tca: datetime,
    assumptions: FrameAssumptions,
    blockers: list[str],
    provenance: dict[str, Any],
) -> tuple[np.ndarray | None, np.ndarray | None, np.ndarray | None]:
    if state.state_position_km is None or state.state_velocity_km_s is None:
        blockers.append(f"{role}_state_vector_missing")
        return None, None, None
    frame = (state.state_frame or "").upper()
    if frame not in _SUPPORTED_STATE_FRAMES:
        blockers.append(f"{role}_state_frame_{frame or 'MISSING'}_unsupported")
        return None, None, None

    r = np.asarray(state.state_position_km, dtype=float)
    v = np.asarray(state.state_velocity_km_s, dtype=float)
    if frame == "ITRF":
        r, v = itrf_to_teme(r, v, tca, assumptions)
        provenance[f"{role}_state_frame_path"] = f"ITRF->TEME ({STATE_FRAME_METHOD})"
    else:
        provenance[f"{role}_state_frame_path"] = "TEME (as published)"

    cov = _position_block(state.covariance_km2)
    if cov is None:
        blockers.append(f"{role}_covariance_missing")
        return r, v, None
    cov_frame = (state.covariance_reference_frame or "").upper()
    unit = (state.covariance_unit or "").upper()
    if unit != "KM2":
        blockers.append(f"{role}_covariance_unit_{unit or 'MISSING'}")
        return r, v, None
    if cov_frame == "RTN":
        try:
            cov_teme = rotate_rtn_covariance_to_inertial(cov, r, v)
        except ValueError as error:
            blockers.append(f"{role}_rtn_basis_degenerate")
            provenance[f"{role}_rotation_error"] = str(error)
            return r, v, None
        provenance[f"{role}_covariance_rotation"] = ROTATION_METHOD
    elif cov_frame == "TEME":
        cov_teme = cov
        provenance[f"{role}_covariance_rotation"] = "none (published in TEME)"
    else:
        blockers.append(f"{role}_covariance_frame_{cov_frame or 'MISSING'}_unsupported")
        return r, v, None
    return r, v, cov_teme


def _combined_hbr(
    parsed: ParsedCdm, override_m: float | None, blockers: list[str], provenance: dict[str, Any]
) -> tuple[float | None, str | None]:
    if override_m is not None:
        provenance["hbr_method"] = "SUPPLIED_BY_CALLER"
        return float(override_m), _COMBINED_HBR
    if parsed.combined_hbr_m is not None and parsed.hbr_semantics == _COMBINED_HBR:
        provenance["hbr_method"] = "DECLARED_IN_DOCUMENT"
        return float(parsed.combined_hbr_m), _COMBINED_HBR
    areas = (parsed.primary.area_pc_m2, parsed.secondary.area_pc_m2)
    if any(a is None or not math.isfinite(a) or a <= 0.0 for a in areas):
        blockers.append("hbr_inputs_missing (no combined HBR and no AREA_PC on both objects)")
        return None, None
    radii = [math.sqrt(a / math.pi) for a in areas]  # type: ignore[arg-type]
    provenance["hbr_method"] = HBR_METHOD
    provenance["hbr_radii_m"] = radii
    return radii[0] + radii[1], _COMBINED_HBR


def prepare_cdm_for_pc(
    parsed: ParsedCdm,
    *,
    assumptions: FrameAssumptions | None = None,
    combined_hbr_m: float | None = None,
) -> CdmPcPreparation:
    """Rotate, convert and derive; return inputs or the named reasons it cannot."""
    assumptions = assumptions or FrameAssumptions(
        ut1_utc_offset_seconds=settings.ut1_utc_offset_seconds
    )
    blockers: list[str] = []
    provenance: dict[str, Any] = {
        "validation_state": VALIDATION_STATE,
        "validation_note": (
            "transforms verified against internal invariants and analytic cases; "
            "no externally published Pc for this document has been compared"
        ),
        "content_sha256": parsed.content_sha256,
    }

    tca = _parse_tca(parsed.tca)
    if tca is None:
        blockers.append("tca_missing_or_unparseable")
        return CdmPcPreparation(None, None, None, None, None, None, tuple(blockers), provenance)
    provenance["tca_utc"] = tca.isoformat()

    r1, v1, c1 = _object_to_teme(parsed.primary, "primary", tca, assumptions, blockers, provenance)
    r2, v2, c2 = _object_to_teme(parsed.secondary, "secondary", tca, assumptions, blockers, provenance)
    hbr, semantics = _combined_hbr(parsed, combined_hbr_m, blockers, provenance)

    if r1 is None or r2 is None or v1 is None or v2 is None:
        return CdmPcPreparation(None, None, None, None, hbr, semantics, tuple(blockers), provenance)

    r_rel = tuple(float(x) for x in (r2 - r1))
    v_rel = tuple(float(x) for x in (v2 - v1))
    provenance["relative_state_frame"] = "TEME"
    return CdmPcPreparation(
        r_rel_km=r_rel,  # type: ignore[arg-type]
        v_rel_km_s=v_rel,  # type: ignore[arg-type]
        cov_primary_teme_km2=c1.tolist() if c1 is not None else None,
        cov_secondary_teme_km2=c2.tolist() if c2 is not None else None,
        hbr_m=hbr,
        hbr_semantics=semantics,
        blockers=tuple(blockers),
        provenance=provenance,
    )


def compute_cdm_pc(
    parsed: ParsedCdm,
    *,
    assumptions: FrameAssumptions | None = None,
    combined_hbr_m: float | None = None,
) -> tuple[PcOutcome | None, CdmPcPreparation]:
    """Prepare then compute; ``None`` outcome means the gate stayed shut, by name."""
    prep = prepare_cdm_for_pc(parsed, assumptions=assumptions, combined_hbr_m=combined_hbr_m)
    if not prep.ready or prep.r_rel_km is None or prep.v_rel_km_s is None:
        return None, prep
    outcome = compute_pc(
        r_rel_km=prep.r_rel_km,
        v_rel_km_s=prep.v_rel_km_s,
        cov_primary_km2=prep.cov_primary_teme_km2,
        cov_secondary_km2=prep.cov_secondary_teme_km2,
        hbr_m=prep.hbr_m,  # type: ignore[arg-type]
        frame_primary="TEME",
        frame_secondary="TEME",
        covariance_unit_primary="KM2",
        covariance_unit_secondary="KM2",
        hbr_semantics=prep.hbr_semantics,
    )
    return outcome, prep
