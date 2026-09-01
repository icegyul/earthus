from __future__ import annotations

import hashlib
import json
from dataclasses import asdict, dataclass
from math import isfinite
from typing import Any

import numpy as np

EARTH_MU_KM3_S2 = 398600.4418


def _hash(payload: Any) -> str:
    return hashlib.sha256(
        json.dumps(payload, sort_keys=True, separators=(",", ":"), default=str).encode("utf-8")
    ).hexdigest()


def _vector(payload: dict[str, Any], field: str) -> np.ndarray:
    value = np.asarray(payload.get(field), dtype=float)
    if value.shape != (3,) or not np.all(np.isfinite(value)):
        raise ValueError(f"{field} must contain three finite values")
    return value


def _state(payload: dict[str, Any]) -> tuple[str, np.ndarray, np.ndarray]:
    object_id = str(payload.get("object_id") or "").strip()
    if not object_id:
        raise ValueError("object_id is required")
    position = _vector(payload, "position_km")
    velocity = _vector(payload, "velocity_km_s")
    if float(np.linalg.norm(position)) < 1.0:
        raise ValueError("position magnitude is invalid")
    return object_id, position, velocity


def _derivative(state: np.ndarray, mu: float) -> np.ndarray:
    position = state[:3]
    radius = float(np.linalg.norm(position))
    acceleration = -mu * position / (radius**3)
    return np.concatenate((state[3:], acceleration))


def _rk4(state: np.ndarray, dt: float, mu: float) -> np.ndarray:
    k1 = _derivative(state, mu)
    k2 = _derivative(state + 0.5 * dt * k1, mu)
    k3 = _derivative(state + 0.5 * dt * k2, mu)
    k4 = _derivative(state + dt * k3, mu)
    return state + dt * (k1 + 2 * k2 + 2 * k3 + k4) / 6.0


def _trajectory(position: np.ndarray, velocity: np.ndarray, horizon_s: float, step_s: float, mu: float) -> np.ndarray:
    state = np.concatenate((position, velocity))
    samples = [state[:3].copy()]
    elapsed = 0.0
    while elapsed < horizon_s:
        dt = min(step_s, horizon_s - elapsed)
        state = _rk4(state, dt, mu)
        if not np.all(np.isfinite(state)):
            raise ValueError("propagation produced non-finite state")
        samples.append(state[:3].copy())
        elapsed += dt
    return np.asarray(samples)


def _minimum_distance_km(a: np.ndarray, b: np.ndarray) -> float:
    if a.shape != b.shape:
        raise ValueError("trajectory grids must match")
    return float(np.min(np.linalg.norm(a - b, axis=1)))


def _risk_score(distance_km: float, threshold_km: float) -> float:
    return max(0.0, (threshold_km - distance_km) / threshold_km)


@dataclass(frozen=True)
class CandidateOCMEvaluation:
    candidate_id: str
    delta_v_m_s: tuple[float, float, float]
    delta_v_norm_m_s: float
    protected_risk_before: float
    protected_risk_after: float
    protected_benefit: float
    new_risk_penalty: float
    new_risk_object_ids: tuple[str, ...]
    beneficiary_attribution: tuple[dict[str, Any], ...]
    closest_approaches_km: dict[str, dict[str, float]]
    score: float
    candidate_hash: str


@dataclass(frozen=True)
class CandidateOCMComparisonResult:
    protected_object_id: str
    candidates: tuple[CandidateOCMEvaluation, ...]
    horizon_s: float
    step_s: float
    risk_threshold_km: float
    validation_state: str
    advisory_only: bool
    spacecraft_command: None
    provenance: dict[str, Any]
    result_hash: str


class CandidateOCMEvaluationEngine:
    """Research-only impulsive maneuver comparison with full catalog re-screening."""

    id = "E33"
    model_version = "E33-TWO-BODY-IMPULSE-RK4-v1"

    def evaluate(
        self,
        *,
        protected_object_id: str,
        primary_state: dict[str, Any],
        encounter_states: list[dict[str, Any]],
        candidates: list[dict[str, Any]],
        horizon_s: float,
        step_s: float,
        risk_threshold_km: float,
        gravity_mu_km3_s2: float = EARTH_MU_KM3_S2,
    ) -> CandidateOCMComparisonResult:
        if not protected_object_id:
            raise ValueError("protected_object_id is required")
        if not encounter_states:
            raise ValueError("encounter_states are required")
        if not candidates:
            raise ValueError("candidates are required")
        if not (0 < step_s <= horizon_s <= 7 * 86400):
            raise ValueError("invalid horizon or step")
        if not (0 < risk_threshold_km <= 1000):
            raise ValueError("invalid risk threshold")
        if not isfinite(gravity_mu_km3_s2) or gravity_mu_km3_s2 <= 0:
            raise ValueError("gravity parameter must be positive")

        primary_id, primary_position, primary_velocity = _state(primary_state)
        if primary_id != protected_object_id:
            raise ValueError("primary_state object_id must match protected_object_id")
        encounters = [_state(item) for item in encounter_states]
        if len({item[0] for item in encounters}) != len(encounters):
            raise ValueError("duplicate encounter object_id")

        baseline_primary = _trajectory(primary_position, primary_velocity, horizon_s, step_s, gravity_mu_km3_s2)
        encounter_paths = {
            object_id: _trajectory(position, velocity, horizon_s, step_s, gravity_mu_km3_s2)
            for object_id, position, velocity in encounters
        }
        baseline_distances = {
            object_id: _minimum_distance_km(baseline_primary, path)
            for object_id, path in encounter_paths.items()
        }
        baseline_risks = {
            object_id: _risk_score(distance, risk_threshold_km)
            for object_id, distance in baseline_distances.items()
        }
        protected_risk_before = sum(baseline_risks.values())

        evaluations: list[CandidateOCMEvaluation] = []
        for raw_candidate in candidates:
            candidate_id = str(raw_candidate.get("candidate_id") or "").strip()
            if not candidate_id:
                raise ValueError("candidate_id is required")
            delta_v = _vector(raw_candidate, "delta_v_m_s")
            delta_v_norm = float(np.linalg.norm(delta_v))
            if delta_v_norm > 500.0:
                raise ValueError("candidate delta-v exceeds research comparison limit")
            candidate_velocity = primary_velocity + delta_v / 1000.0
            candidate_path = _trajectory(
                primary_position, candidate_velocity, horizon_s, step_s, gravity_mu_km3_s2
            )
            scenario_distances = {
                object_id: _minimum_distance_km(candidate_path, path)
                for object_id, path in encounter_paths.items()
            }
            scenario_risks = {
                object_id: _risk_score(distance, risk_threshold_km)
                for object_id, distance in scenario_distances.items()
            }
            attributions = []
            new_risks = []
            for object_id in sorted(encounter_paths):
                benefit = baseline_risks[object_id] - scenario_risks[object_id]
                if baseline_risks[object_id] == 0 and scenario_risks[object_id] > 0:
                    new_risks.append(object_id)
                attributions.append(
                    {
                        "object_id": object_id,
                        "baseline_risk": baseline_risks[object_id],
                        "scenario_risk": scenario_risks[object_id],
                        "benefit": benefit,
                        "metric": "THRESHOLD_SCREENING_SCORE",
                    }
                )
            protected_risk_after = sum(scenario_risks.values())
            protected_benefit = protected_risk_before - protected_risk_after
            new_risk_penalty = sum(
                scenario_risks[object_id] for object_id in new_risks
            )
            score = protected_benefit - 2.0 * new_risk_penalty - delta_v_norm * 0.0001
            closest = {
                object_id: {
                    "baseline": baseline_distances[object_id],
                    "candidate": scenario_distances[object_id],
                }
                for object_id in sorted(encounter_paths)
            }
            candidate_payload = {
                "candidate_id": candidate_id,
                "delta_v_m_s": delta_v.tolist(),
                "closest_approaches_km": closest,
                "attribution": attributions,
                "new_risk_object_ids": new_risks,
                "score": score,
            }
            evaluations.append(
                CandidateOCMEvaluation(
                    candidate_id=candidate_id,
                    delta_v_m_s=tuple(float(x) for x in delta_v),
                    delta_v_norm_m_s=delta_v_norm,
                    protected_risk_before=protected_risk_before,
                    protected_risk_after=protected_risk_after,
                    protected_benefit=protected_benefit,
                    new_risk_penalty=new_risk_penalty,
                    new_risk_object_ids=tuple(new_risks),
                    beneficiary_attribution=tuple(attributions),
                    closest_approaches_km=closest,
                    score=score,
                    candidate_hash=_hash(candidate_payload),
                )
            )

        evaluations.sort(key=lambda item: (-item.score, item.delta_v_norm_m_s, item.candidate_id))
        provenance = {
            "engine_id": self.id,
            "model_version": self.model_version,
            "method": "TWO_BODY_IMPULSE_RK4",
            "gravity_mu_km3_s2": gravity_mu_km3_s2,
            "metric": "THRESHOLD_SCREENING_SCORE",
            "pc_computed": False,
            "covariance_used": False,
            "command_path": "FORBIDDEN",
        }
        result_payload = {
            "protected_object_id": protected_object_id,
            "candidates": [asdict(item) for item in evaluations],
            "horizon_s": horizon_s,
            "step_s": step_s,
            "risk_threshold_km": risk_threshold_km,
            "provenance": provenance,
        }
        return CandidateOCMComparisonResult(
            protected_object_id=protected_object_id,
            candidates=tuple(evaluations),
            horizon_s=float(horizon_s),
            step_s=float(step_s),
            risk_threshold_km=float(risk_threshold_km),
            validation_state="RESEARCH_ONLY",
            advisory_only=True,
            spacecraft_command=None,
            provenance=provenance,
            result_hash=_hash(result_payload),
        )
