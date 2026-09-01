from __future__ import annotations

import hashlib
import json
from dataclasses import asdict, dataclass
from typing import Any

import numpy as np
from aetherus_domain import Scenario

from .intervention import EARTH_MU_KM3_S2, _rk4, _state, _trajectory
from .runtime import FragmentationScenarioEngine, OrbitalEnvironmentCongestionEngine

EARTH_RADIUS_KM = 6378.137


def _hash(payload: Any) -> str:
    return hashlib.sha256(
        json.dumps(payload, sort_keys=True, separators=(",", ":"), default=str).encode("utf-8")
    ).hexdigest()


@dataclass(frozen=True)
class PropagatedFragment:
    fragment_id: str
    delta_v_m_s: tuple[float, float, float]
    area_to_mass: float
    final_position_km: tuple[float, float, float]
    final_velocity_km_s: tuple[float, float, float]
    final_altitude_km: float
    orbital_shell: str
    closest_approaches_km: dict[str, float]


@dataclass(frozen=True)
class FragmentCloudPropagationResult:
    scenario_id: str
    parent_object_id: str
    fragments: tuple[PropagatedFragment, ...]
    shell_counts: dict[str, int]
    affected_object_ids: tuple[str, ...]
    seed: int
    model_version: str
    validation_state: str
    observed_debris: bool
    spacecraft_command: None
    provenance: dict[str, Any]
    result_hash: str


class FragmentCloudPropagationEngine:
    """Deterministic research fragment cloud propagation and encounter screening."""

    id = "E26"
    model_version = "E26-FRAGMENT-CLOUD-RK4-v1"

    def __init__(self) -> None:
        self.fragmentation = FragmentationScenarioEngine()
        self.environment = OrbitalEnvironmentCongestionEngine()

    def run(
        self,
        *,
        scenario: Scenario,
        parent_state: dict[str, Any],
        encounter_states: list[dict[str, Any]],
        fragment_count: int,
        horizon_s: float,
        step_s: float,
        affected_distance_km: float,
        gravity_mu_km3_s2: float = EARTH_MU_KM3_S2,
    ) -> FragmentCloudPropagationResult:
        if scenario.seed is None:
            raise ValueError("fragmentation scenario requires a fixed seed")
        if not (1 <= fragment_count <= 10000):
            raise ValueError("invalid fragment_count")
        if not (0 < step_s <= horizon_s <= 7 * 86400):
            raise ValueError("invalid horizon or step")
        if affected_distance_km <= 0:
            raise ValueError("affected_distance_km must be positive")
        parent_id, parent_position, parent_velocity = _state(parent_state)
        if parent_id not in set(scenario.target_object_ids):
            raise ValueError("parent_state must belong to a scenario target")
        encounters = [_state(item) for item in encounter_states]
        encounter_paths = {
            object_id: _trajectory(position, velocity, horizon_s, step_s, gravity_mu_km3_s2)
            for object_id, position, velocity in encounters
        }
        generated = self.fragmentation.run(scenario, fragment_count=fragment_count)
        propagated: list[PropagatedFragment] = []
        affected: set[str] = set()
        shell_counts = {"LEO": 0, "MEO": 0, "GEO": 0}

        for fragment in generated.fragments:
            state = np.concatenate(
                (parent_position, parent_velocity + np.asarray(fragment.delta_v_m_s, dtype=float) / 1000.0)
            )
            positions = [state[:3].copy()]
            elapsed = 0.0
            while elapsed < horizon_s:
                dt = min(step_s, horizon_s - elapsed)
                state = _rk4(state, dt, gravity_mu_km3_s2)
                positions.append(state[:3].copy())
                elapsed += dt
            path = np.asarray(positions)
            closest = {}
            for object_id, encounter_path in encounter_paths.items():
                distance = float(np.min(np.linalg.norm(path - encounter_path, axis=1)))
                closest[object_id] = distance
                if distance <= affected_distance_km:
                    affected.add(object_id)
            altitude = float(np.linalg.norm(state[:3])) - EARTH_RADIUS_KM
            shell = self.environment.classify(max(0.0, altitude))
            shell_counts[shell] += 1
            propagated.append(
                PropagatedFragment(
                    fragment_id=fragment.fragment_id,
                    delta_v_m_s=fragment.delta_v_m_s,
                    area_to_mass=fragment.area_to_mass,
                    final_position_km=tuple(float(x) for x in state[:3]),
                    final_velocity_km_s=tuple(float(x) for x in state[3:]),
                    final_altitude_km=altitude,
                    orbital_shell=shell,
                    closest_approaches_km=closest,
                )
            )

        provenance = {
            "engine_id": self.id,
            "model_version": self.model_version,
            "method": "DETERMINISTIC_FRAGMENT_DV_PLUS_TWO_BODY_RK4",
            "source_scenario_hash": generated.result_hash,
            "observed_debris": False,
            "command_path": "FORBIDDEN",
        }
        payload = {
            "parent_object_id": parent_id,
            "fragments": [asdict(item) for item in propagated],
            "shell_counts": shell_counts,
            "affected_object_ids": sorted(affected),
            "seed": scenario.seed,
            "provenance": provenance,
        }
        return FragmentCloudPropagationResult(
            scenario_id=str(scenario.id),
            parent_object_id=parent_id,
            fragments=tuple(propagated),
            shell_counts=shell_counts,
            affected_object_ids=tuple(sorted(affected)),
            seed=scenario.seed,
            model_version=self.model_version,
            validation_state="RESEARCH_ONLY",
            observed_debris=False,
            spacecraft_command=None,
            provenance=provenance,
            result_hash=_hash(payload),
        )
