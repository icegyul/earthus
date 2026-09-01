"""Covariance-gated collision probability.

Pc is computed only when a valid combined covariance, finite relative state,
and explicit hard-body radius are all present. Any missing or invalid
prerequisite yields an explicit unavailable status — never zero, never an
estimate. SOCRATES MaxProbability and screening metrics stay separate channels.
"""

import math
from typing import Any

import numpy as np

from backend.conjunction.models import (
    PC_METHOD,
    PC_MODEL_ID,
    PC_MODEL_VERSION,
    PcOutcome,
)

_DILUTION_RATIO = 2.0
_SUPPORTED_COVARIANCE_UNITS = frozenset({"KM2", "KM^2", "KM**2"})
_COMBINED_HBR_SEMANTICS = "COMBINED_HBR"


def _as_3x3(matrix: Any) -> np.ndarray | None:
    """Coerce a full 6x6 CDM covariance or a 3x3 block into finite position 3x3."""
    if matrix is None:
        return None
    array = np.asarray(matrix, dtype=float)
    if array.shape == (6, 6):
        array = array[:3, :3]
    if array.shape != (3, 3):
        return None
    if not np.all(np.isfinite(array)):
        return None
    return array


def covariance_check(
    cov_primary: Any,
    cov_secondary: Any,
    frame_primary: str | None,
    frame_secondary: str | None,
    unit_primary: str | None = None,
    unit_secondary: str | None = None,
) -> tuple[np.ndarray | None, str]:
    """Validate both covariances and return the combined position block.

    Returns ``(combined_covariance, ok_reason)`` on success or
    ``(None, failure_reason)`` with an explicit machine-readable reason.
    """
    primary = _as_3x3(cov_primary)
    secondary = _as_3x3(cov_secondary)
    if primary is None or secondary is None:
        return None, "COVARIANCE_MISSING_OR_NONFINITE"
    combined = primary + secondary
    if not np.allclose(combined, combined.T, rtol=0.0, atol=1e-9):
        return None, "COVARIANCE_NOT_SYMMETRIC"
    try:
        np.linalg.cholesky(combined)
    except np.linalg.LinAlgError:
        return None, "COVARIANCE_NOT_POSITIVE_DEFINITE"
    smallest = float(np.min(np.linalg.eigvalsh(combined)))
    if smallest <= 0.0:
        return None, "COVARIANCE_NOT_POSITIVE_DEFINITE"
    if frame_primary is None or frame_secondary is None:
        return None, "COVARIANCE_FRAME_MISSING"
    normalized_primary = str(frame_primary).upper()
    normalized_secondary = str(frame_secondary).upper()
    for label, frame in (("primary", normalized_primary), ("secondary", normalized_secondary)):
        if frame != "TEME":
            return None, f"FRAME_UNSUPPORTED_{label}"
    if normalized_primary != normalized_secondary:
        return None, "COVARIANCE_FRAME_MISMATCH"
    if unit_primary is None or unit_secondary is None:
        return None, "COVARIANCE_UNIT_MISSING"
    normalized_unit_primary = _normalize_covariance_unit(unit_primary)
    normalized_unit_secondary = _normalize_covariance_unit(unit_secondary)
    if normalized_unit_primary not in _SUPPORTED_COVARIANCE_UNITS:
        return None, "COVARIANCE_UNIT_UNSUPPORTED_primary"
    if normalized_unit_secondary not in _SUPPORTED_COVARIANCE_UNITS:
        return None, "COVARIANCE_UNIT_UNSUPPORTED_secondary"
    if normalized_unit_primary != normalized_unit_secondary:
        return None, "COVARIANCE_UNIT_MISMATCH"
    return combined, "COMBINED_COVARIANCE_VALID"


def _normalize_covariance_unit(value: str) -> str:
    """Normalize a declared covariance unit without inferring missing units."""
    normalized = value.strip().upper().replace(" ", "")
    if normalized in _SUPPORTED_COVARIANCE_UNITS:
        return "KM2"
    return normalized


def compute_pc(
    r_rel_km: tuple[float, float, float],
    v_rel_km_s: tuple[float, float, float],
    cov_primary_km2: Any,
    cov_secondary_km2: Any,
    hbr_m: float,
    frame_primary: str | None = None,
    frame_secondary: str | None = None,
    covariance_unit_primary: str | None = None,
    covariance_unit_secondary: str | None = None,
    hbr_semantics: str | None = None,
) -> PcOutcome:
    """Foster-1992 encounter-plane Pc with full prerequisite gating."""
    checks: dict[str, Any] = {
        "method": PC_METHOD,
        "model_id": PC_MODEL_ID,
        "model_version": PC_MODEL_VERSION,
    }
    speed = math.sqrt(sum(component**2 for component in v_rel_km_s))
    checks["relative_speed_km_s"] = speed
    if speed <= 0.0:
        return _unavailable("RELATIVE_VELOCITY_DEGENERATE", checks)

    combined, reason = covariance_check(
        cov_primary_km2,
        cov_secondary_km2,
        frame_primary,
        frame_secondary,
        covariance_unit_primary,
        covariance_unit_secondary,
    )
    checks["covariance_check"] = reason
    if combined is None:
        status_reason = (
            "COVARIANCE_MISSING"
            if reason == "COVARIANCE_MISSING_OR_NONFINITE"
            else reason
        )
        covariance_status = (
            "INSUFFICIENT_DATA"
            if reason == "COVARIANCE_MISSING_OR_NONFINITE"
            else "INVALID"
        )
        return PcOutcome(
            pc=None,
            method=None,
            status="PC_UNAVAILABLE",
            unavailable_reason=status_reason,
            covariance_status=covariance_status,
            dilution_state=None,
            checks=checks,
        )

    if not isinstance(hbr_m, int | float) or isinstance(hbr_m, bool):
        return _unavailable("HBR_INVALID", checks)
    if not math.isfinite(hbr_m) or hbr_m <= 0.0:
        return _unavailable("HBR_INVALID", checks)
    if hbr_semantics != _COMBINED_HBR_SEMANTICS:
        return _unavailable("HBR_SEMANTICS_MISSING", checks)
    if covariance_unit_primary is None:
        return _unavailable("COVARIANCE_UNIT_MISSING", checks)

    miss_km = math.sqrt(sum(component**2 for component in r_rel_km))
    checks["miss_distance_m"] = miss_km * 1000.0
    checks["hbr_m"] = hbr_m
    checks["hbr_semantics"] = hbr_semantics
    checks["covariance_frame"] = frame_primary
    checks["covariance_unit"] = _normalize_covariance_unit(covariance_unit_primary)

    pc_value = _foster_pc(r_rel_km, v_rel_km_s, combined, hbr_m / 1000.0)
    checks["quadrature_nodes"] = list(_QUADRATURE_ORDER)
    if pc_value is None or not math.isfinite(pc_value) or pc_value < 0.0 or pc_value > 1.0:
        return PcOutcome(
            pc=None,
            method=None,
            status="PC_UNAVAILABLE",
            unavailable_reason="NUMERICAL_FAILURE",
            covariance_status="PRESENT_VALID",
            dilution_state=None,
            checks=checks,
        )

    dilution = _dilution_flag(r_rel_km, v_rel_km_s, combined, hbr_m / 1000.0, pc_value)
    return PcOutcome(
        pc=pc_value,
        method=PC_METHOD,
        status="COMPUTED",
        unavailable_reason=None,
        covariance_status="PRESENT_VALID",
        dilution_state=dilution,
        checks=checks,
    )


def _unavailable(reason: str, checks: dict[str, Any]) -> PcOutcome:
    return PcOutcome(
        pc=None,
        method=None,
        status="PC_UNAVAILABLE",
        unavailable_reason=reason,
        covariance_status="UNAVAILABLE",
        dilution_state=None,
        checks=checks,
    )


def _encounter_basis(
    r_rel_km: tuple[float, float, float],
    v_rel_km_s: tuple[float, float, float],
) -> tuple[np.ndarray, np.ndarray]:
    """Return the two tangent axes of the plane normal to relative velocity."""
    velocity = np.asarray(v_rel_km_s, dtype=float)
    normal_hat = velocity / np.linalg.norm(velocity)
    references = (
        np.asarray(r_rel_km, dtype=float),
        np.array([1.0, 0.0, 0.0]),
        np.array([0.0, 1.0, 0.0]),
        np.array([0.0, 0.0, 1.0]),
    )
    j_hat = None
    for reference in references:
        if not np.all(np.isfinite(reference)) or float(np.linalg.norm(reference)) < 1e-12:
            continue
        projected = reference - float(np.dot(normal_hat, reference)) * normal_hat
        projected_norm = float(np.linalg.norm(projected))
        if projected_norm > 1e-9:
            j_hat = projected / projected_norm
            break
    if j_hat is None:
        raise np.linalg.LinAlgError("Could not construct an encounter-plane basis")
    k_hat = np.cross(normal_hat, j_hat)
    k_norm = float(np.linalg.norm(k_hat))
    if k_norm <= 1e-12:
        raise np.linalg.LinAlgError("Could not construct a second encounter-plane axis")
    return j_hat, k_hat / k_norm


_QUADRATURE_ORDER = (48, 96)


def _gauss_legendre(n: int) -> tuple[np.ndarray, np.ndarray]:
    nodes, weights = np.polynomial.legendre.leggauss(n)
    return nodes, weights


def _pc_from_quadrature(
    miss_in_plane: np.ndarray,
    covariance_in_plane: np.ndarray,
    hbr_km: float,
) -> float:
    """Deterministic polar Gauss-Legendre integration of the 2D Gaussian over HBR."""
    nodes_r, weights_r = _gauss_legendre(_QUADRATURE_ORDER[0])
    nodes_t, weights_t = _gauss_legendre(_QUADRATURE_ORDER[1])

    determinant = float(np.linalg.det(covariance_in_plane))
    if determinant <= 0.0 or not math.isfinite(determinant):
        raise np.linalg.LinAlgError("Encounter-plane covariance block is not PD")
    normalization = 2.0 * math.pi * math.sqrt(determinant)
    inverse = np.linalg.inv(covariance_in_plane)

    radii = (nodes_r + 1.0) * (hbr_km / 2.0)
    radial_weight = weights_r * (hbr_km / 2.0)
    angles = (nodes_t + 1.0) * math.pi
    cos_a = np.cos(angles)
    sin_a = np.sin(angles)

    total = 0.0
    for radius, weight_r in zip(radii, radial_weight, strict=True):
        points_u = miss_in_plane[None, :] - np.stack([radius * cos_a, radius * sin_a], axis=1)
        exponents = -0.5 * np.einsum("ij,jk,ik->i", points_u, inverse, points_u)
        densities = np.exp(exponents) / normalization
        # ∫ f du over the disk = ∫∫ f r dθ dr with Gauss-Legendre weights.
        total += (
            weight_r
            * radius
            * math.pi
            * float(np.dot(weights_t, densities))
        )
    return total


def _foster_pc(
    r_rel_km: tuple[float, float, float],
    v_rel_km_s: tuple[float, float, float],
    combined: np.ndarray,
    hbr_km: float,
) -> float | None:
    try:
        basis_u, basis_w = _encounter_basis(r_rel_km, v_rel_km_s)
        plane_basis = np.stack([basis_u, basis_w])
        miss_in_plane = plane_basis @ np.asarray(r_rel_km, dtype=float)
        covariance_in_plane = plane_basis @ combined @ plane_basis.T
        return _pc_from_quadrature(
            miss_in_plane, covariance_in_plane, hbr_km
        )
    except np.linalg.LinAlgError:
        return None


def _dilution_flag(
    r_rel_km: tuple[float, float, float],
    v_rel_km_s: tuple[float, float, float],
    combined: np.ndarray,
    hbr_km: float,
    pc_full: float,
) -> str | None:
    """Flag suspected dilution: Pc must not increase as HBR shrinks."""
    pc_half = _foster_pc(r_rel_km, v_rel_km_s, combined, hbr_km / _DILUTION_RATIO)
    if pc_half is None:
        return None
    if pc_half > pc_full:
        return "DILUTION_SUSPECTED"
    return None
