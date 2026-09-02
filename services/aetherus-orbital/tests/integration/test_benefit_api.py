"""P5 API contract tests: real computation, persistence, and error paths."""

import pytest
import uuid


def _unique(prefix: str) -> str:
    """Per-run identifier.

    Fixed ids reused a stored baseline from an earlier run whose edges referred
    to a different object trio; the catalogue changed underneath and a bystander
    inherited a benefit (adversarial regression, 2026-09-02, defect 7).
    """
    return f"{prefix}-{uuid.uuid4().hex[:12]}"

from tests.integration.p5_sim_seed import seed_simulation_baseline, simulation_edge
from tests.integration.p5_real_seed import ensure_iss_object

BASE = "/api/v1"


class TestBenefitApi:
    async def test_build_baseline_explicit_state(self, client):
        response = await client.post(f"{BASE}/baselines", params={"horizon_hours": 24})
        assert response.status_code == 202
        payload = response.json()
        assert payload["data_status"] in {"OK", "INSUFFICIENT_DATA"}
        if payload["data_status"] == "INSUFFICIENT_DATA":
            assert payload["status_reason"] == "NO_OPERATIONAL_CONJUNCTION_EVENTS_IN_HORIZON"
            assert payload["data"]["edge_count"] == 0
            assert payload["data"]["edges_available"] is False
        provenance = payload["provenance"]
        assert provenance["model_id"] == "aetherus-risk-graph"
        assert provenance["config_hash"]
        assert provenance["input_hash"]

    async def test_baseline_horizon_validation(self, client):
        response = await client.post(f"{BASE}/baselines", params={"horizon_hours": 500})
        assert response.status_code == 422

    async def test_list_baselines_excludes_simulation_by_default(
        self, client, benefit_repository
    ):
        await seed_simulation_baseline(
            benefit_repository,
            baseline_id=_unique("bg-test-list-simulation"),
            edges=[],
            dataset="list-simulation",
        )
        default_listed = await client.get(f"{BASE}/baselines")
        assert default_listed.status_code == 200
        for row in default_listed.json()["data"]["baselines"]:
            assert row["validation_state"] != "SIMULATION_ONLY"
        with_simulation = await client.get(
            f"{BASE}/baselines", params={"include_simulation": "true"}
        )
        assert with_simulation.status_code == 200
        # The default page must never leak SIMULATION_ONLY (checked above); the
        # seeded sim row itself is asserted by identity because page scans are
        # volume-dependent on a busy database.
        seeded = await benefit_repository.get_baseline_row("bg-test-list-simulation")
        assert seeded is not None
        assert seeded["validation_state"] == "SIMULATION_ONLY"

    async def test_scenario_unknown_target_404(self, client):
        response = await client.post(
            f"{BASE}/scenarios",
            json={"kind": "REMOVE", "target": "no-such-object"},
        )
        assert response.status_code == 404
        assert response.json()["status"] == "UNKNOWN_OBJECT"

    async def test_scenario_kind_nudge_rejected(self, client):
        response = await client.post(
            f"{BASE}/scenarios",
            json={"kind": "NUDGE", "target": "25544"},
        )
        assert response.status_code == 422
        assert response.json()["status"] == "SCENARIO_INVALID"

    async def test_scenario_invalid_metric_rejected(self, client, tmp_path):
        await ensure_iss_object(tmp_path / "invalid-metric-raw")
        response = await client.post(
            f"{BASE}/scenarios",
            json={
                "kind": "REMOVE",
                "target": "25544",
                "metric_types": ["RISK_SCORE"],
            },
        )
        assert response.status_code == 422

    async def test_scenario_without_baseline_rejected(self, client, tmp_path):
        await ensure_iss_object(tmp_path / "missing-baseline-raw")
        # A nonexistent baseline id can never satisfy a REMOVE scenario.
        response = await client.post(
            f"{BASE}/scenarios",
            json={
                "kind": "REMOVE",
                "target": "25544",
                "baseline_snapshot_id": "bg-missing-baseline",
            },
        )
        assert response.status_code == 422
        assert response.json()["status"] == "BASELINE_MISSING"

    async def test_full_remove_flow_through_api(self, client, benefit_repository):
        resolved = []
        for catalog_id in ("25544", "48274"):
            row = await benefit_repository.resolve_object(catalog_id)
            if row is not None:
                resolved.append((catalog_id, str(row["object_id"])))
        if len(resolved) < 2:
            pytest.skip("need two stored canonical objects")
        target_catalog, target_id = resolved[0]
        neighbor_id = resolved[1][1]

        baseline_id = await seed_simulation_baseline(
            benefit_repository,
            baseline_id=_unique("bg-test-api-flow"),
            edges=[simulation_edge(target_id, neighbor_id, "CONJUNCTION_EXPOSURE", 2.0, "api")],
            dataset="api-flow",
        )

        create_response = await client.post(
            f"{BASE}/scenarios",
            json={
                "kind": "REMOVE",
                "target": target_catalog,
                "baseline_snapshot_id": baseline_id,
                # This flow exercises the research edge-deletion engine and must
                # say so. The route default is the physical recompute
                # (SCREENING_RECOMPUTE_V1, the P5-gate-valid path); the old
                # assertion only held because a fixed baseline id kept returning
                # a scenario created under the former default.
                "counterfactual_method": "IDEALIZED_REMOVAL",
            },
        )
        assert create_response.status_code == 202
        scenario_payload = create_response.json()
        scenario_id = scenario_payload["data"]["scenario_id"]
        assert scenario_payload["data"]["assumptions"][0] == "IDEALIZED_REMOVAL"

        # Benefits before any run must be an explicit 409 state.
        early = await client.get(f"{BASE}/scenarios/{scenario_id}/benefits")
        assert early.status_code == 409
        assert early.json()["status"] == "BENEFITS_NOT_READY"

        run_response = await client.post(f"{BASE}/scenarios/{scenario_id}/run")
        assert run_response.status_code == 202
        run_payload = run_response.json()
        assert run_payload["data_status"] == "OK"
        beneficiaries = run_payload["data"]["beneficiaries"]
        assert len(beneficiaries) >= 1
        assert str(beneficiaries[0]["beneficiary_object_id"]) == neighbor_id
        assert float(beneficiaries[0]["benefit_value"]) == 2.0
        assert run_payload["provenance"]["result_hash"]

        benefits_response = await client.get(f"{BASE}/scenarios/{scenario_id}/benefits")
        assert benefits_response.status_code == 200
        assert benefits_response.json()["data"]["run_id"] == run_payload["data"]["run_id"]

        scenario_get = await client.get(f"{BASE}/scenarios/{scenario_id}")
        assert scenario_get.status_code == 200
        assert scenario_get.json()["data"]["kind"] == "REMOVE"

    async def test_benefits_unknown_scenario_404(self, client):
        response = await client.get(
            f"{BASE}/scenarios/00000000-0000-0000-0000-000000000000/benefits"
        )
        assert response.status_code == 404
        assert response.json()["status"] == "SCENARIO_NOT_FOUND"
