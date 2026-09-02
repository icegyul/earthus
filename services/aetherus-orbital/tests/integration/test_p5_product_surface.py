"""The P5-compliant counterfactual is now reachable from the product surface.

Two counterfactual engines exist and they are not interchangeable. The research
one deletes every edge incident to the target and calls the remainder the
scenario — the directive names that shape and states it cannot satisfy P5. The
compliant one re-propagates and re-screens over the affected region
(SCREENING_RECOMPUTE_V1).

The research engine was already honest about itself: restricted to VAL-*
fixtures and labelled RESEARCH_ONLY at three layers. What was missing was a
route to the compliant engine from /v1 at all, so a product client could obtain
the simulation and nothing else.

These tests hold both halves: the compliant path is reachable and identifies
itself, and the research path still refuses to be mistaken for it.
"""

from __future__ import annotations

import pytest
from httpx import AsyncClient

pytestmark = pytest.mark.integration


@pytest.fixture
async def client():
    from services.api.integrated import app

    async with AsyncClient(app=app, base_url="http://test") as async_client:
        yield async_client


async def _a_real_catalog_id() -> str:
    from backend.conjunction.repository import ConjunctionRepository

    rows = await ConjunctionRepository().load_screenable_solutions(1)
    if not rows:
        pytest.skip("the stored catalogue holds no screenable object")
    return str(rows[0]["catalog_id"])


async def _an_absent_catalog_id() -> str:
    """An identifier confirmed not to be in the catalogue right now."""
    from backend.conjunction.repository import ConjunctionRepository

    repository = ConjunctionRepository()
    for candidate in (f"ABSENT-{n}" for n in range(1, 50)):
        if not await repository.resolve_objects_by_catalog([candidate]):
            return candidate
    pytest.skip("could not find a catalog id that is absent from the store")


class TestTheResearchPathRefusesToPassAsP5:
    async def test_it_says_which_gate_it_does_not_satisfy(self, client):
        created = await client.post(
            "/v1/scenarios",
            json={"kind": "REMOVE", "target_object_ids": ["VAL-A"], "assumptions": ["IDEALIZED_REMOVAL"]},
        )
        if created.status_code != 200:
            pytest.skip("scenario creation unavailable in this runtime")
        scenario_id = created.json()["data"]["id"]

        response = await client.post(f"/v1/scenarios/{scenario_id}/run")
        assert response.status_code == 200, response.text
        body = response.json()
        assert body["data_status"] == "RESEARCH_ONLY"
        assert any("SIMULATION_ONLY" in w and "P5" in w for w in body["warnings"]), (
            "the research path must name the gate it does not satisfy"
        )
        assert any("/v1/counterfactual/remove" in w for w in body["warnings"]), (
            "a client told 'not P5' must be told where the compliant engine is"
        )

    async def test_it_still_refuses_catalogue_objects(self, client):
        catalog_id = await _a_real_catalog_id()
        created = await client.post(
            "/v1/scenarios",
            json={"kind": "REMOVE", "target_object_ids": [catalog_id], "assumptions": ["IDEALIZED_REMOVAL"]},
        )
        if created.status_code == 200:
            run = await client.post(f"/v1/scenarios/{created.json()['data']['id']}/run")
            assert run.status_code >= 400, (
                "edge deletion ran on a catalogue object; it is fixture-only by contract"
            )


class TestTheCompliantPathIsOnTheProductSurface:
    async def test_a_val_fixture_is_refused_by_the_physical_route(self, client):
        """A fixture result must never arrive labelled as the physical engine."""
        response = await client.post(
            "/v1/counterfactual/remove", json={"target_catalog_id": "VAL-A"}
        )
        assert response.status_code == 422, response.text
        assert "research fixture" in response.text.lower()

    async def test_an_unknown_object_is_a_named_404(self, client):
        """The absent identifier is verified absent, not assumed.

        A literal like "999999999" looked safe and turned out to be a real row
        left by an earlier test — the same "the test assumes what the database
        contains" fault this suite has hit repeatedly.
        """
        absent = await _an_absent_catalog_id()
        response = await client.post(
            "/v1/counterfactual/remove", json={"target_catalog_id": absent}
        )
        assert response.status_code == 404, response.text
        assert "catalog id" in response.text.lower()

    async def test_a_catalogue_object_is_accepted_as_a_job(self, client):
        """The work is long — 446 s for a 150-object scope, measured 2026-09-03 —
        so the route accepts a job instead of blocking a request on it."""
        catalog_id = await _a_real_catalog_id()
        response = await client.post(
            "/v1/counterfactual/remove",
            json={"target_catalog_id": catalog_id, "horizon_hours": 6.0, "max_objects": 20},
        )
        assert response.status_code == 202, response.text
        body = response.json()
        if body["data"] is None:
            assert body["data_status"] == "UNAVAILABLE"
            return
        job = body["data"]
        assert body["data_status"] == "PENDING"
        assert job["job_id"] and job["poll"].endswith(job["job_id"])
        assert job["status"] == "RUNNING"

        polled = await client.get(f"/v1/counterfactual/jobs/{job['job_id']}")
        assert polled.status_code == 200
        assert polled.json()["data"]["status"] in {"RUNNING", "SUCCEEDED", "FAILED"}

    async def test_an_unknown_job_is_a_404(self, client):
        response = await client.get("/v1/counterfactual/jobs/not-a-job")
        assert response.status_code == 404

    async def test_wait_true_returns_the_result_directly(self, client):
        """The synchronous path stays available for a small scope."""
        catalog_id = await _a_real_catalog_id()
        response = await client.post(
            "/v1/counterfactual/remove",
            json={
                "target_catalog_id": catalog_id,
                "horizon_hours": 0.25,
                "max_objects": 4,
                "wait": True,
            },
        )
        assert response.status_code in {200, 202}, response.text
        body = response.json()
        if body["data"] is None:
            assert body["data_status"] in {"UNAVAILABLE", "INSUFFICIENT_DATA"}
            return
        data = body["data"]
        assert data["engine"] == "SCREENING_RECOMPUTE_V1", (
            "the product surface served something other than the compliant engine"
        )
        assert data["gate"] == "P5_COMPLIANT"
        assert data["coverage"]["scope"] == "CATALOG_SUBSET", (
            "a bounded run must record that it was bounded"
        )
        assert any("never an observed outcome" in w for w in body["warnings"])
