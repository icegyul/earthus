"""Six engines that were constructed and never called are now on a code path.

Each of these engines existed, was instantiated in ``ProductRuntime.__init__``,
and had zero call sites. Their routes returned a hardcoded literal (E12), fell
through to a different source (E15), or read a dict nothing ever wrote (E16);
E35 was not even imported, and E37's tokens reached no response. The engine was
never the missing part — the path was.

These tests assert the path, and assert just as hard that connecting it invented
no data: with no telemetry feed the read route still says UNAVAILABLE, with no
deep-space ingestion the list is still empty, and importance refuses to score
when an input is absent instead of substituting a default.
"""

from __future__ import annotations

from datetime import UTC, datetime, timedelta

import pytest
from httpx import AsyncClient

pytestmark = pytest.mark.integration


@pytest.fixture
async def client():
    from services.api.integrated import app

    async with AsyncClient(app=app, base_url="http://test") as async_client:
        yield async_client


async def _first_mission_id(client: AsyncClient) -> str:
    response = await client.get("/v1/missions")
    assert response.status_code == 200
    missions = response.json()["data"]
    if not missions:
        pytest.skip("no mission is registered in this runtime")
    return str(missions[0]["id"] if "id" in missions[0] else missions[0]["mission_id"])


class TestE12DeepSpaceRunsTheEngine:
    async def test_empty_store_reports_data_absence_not_a_literal(self, client):
        """The route used to return a hardcoded []; now it runs E12 over the store."""
        response = await client.get("/v1/space/missions")
        assert response.status_code == 200
        body = response.json()
        assert body["data"] == []
        assert body["data_status"] == "UNAVAILABLE"
        assert any("ingested" in w for w in body["warnings"]), (
            "the empty case must state that nothing was ingested"
        )


class TestE15LaunchStateMachineExists:
    async def test_every_registered_mission_has_a_machine(self, client):
        mission_id = await _first_mission_id(client)
        response = await client.get(f"/v1/missions/{mission_id}/state")
        assert response.status_code == 200
        data = response.json()["data"]
        assert data["source"] == "E15_STATE_MACHINE", (
            "the route still falls through to the registry record"
        )
        assert data["state"], "the machine reports no state"
        assert "transitions" in data

    async def test_no_transition_is_invented(self, client):
        mission_id = await _first_mission_id(client)
        body = (await client.get(f"/v1/missions/{mission_id}/state")).json()
        if not body["data"]["transitions"]:
            assert any("No state transition" in w for w in body["warnings"]), (
                "an empty history must say so rather than read as a settled state"
            )

    async def test_an_official_transition_without_evidence_is_refused(self, client):
        mission_id = await _first_mission_id(client)
        response = await client.post(
            f"/v1/missions/{mission_id}/state",
            json={
                "to_state": "COUNTDOWN",
                "at_utc": datetime.now(UTC).isoformat(),
                "official": True,
            },
        )
        assert response.status_code == 422, response.text
        assert "evidence" in response.text.lower()

    async def test_an_illegal_transition_is_refused(self, client):
        mission_id = await _first_mission_id(client)
        response = await client.post(
            f"/v1/missions/{mission_id}/state",
            json={"to_state": "COMPLETE", "at_utc": datetime.now(UTC).isoformat()},
        )
        assert response.status_code == 422, "the state machine accepted an illegal jump"


class TestE16TelemetryHasAWriterButNoData:
    async def test_read_route_still_refuses_to_fabricate(self, client):
        mission_id = await _first_mission_id(client)
        body = (await client.get(f"/v1/missions/{mission_id}/telemetry")).json()
        if not body["data"]:
            assert body["data_status"] == "UNAVAILABLE"
            assert any("not fabricated" in w for w in body["warnings"])

    async def test_the_writer_exists_and_enforces_units(self, client):
        mission_id = await _first_mission_id(client)
        bad = await client.post(
            f"/v1/missions/{mission_id}/telemetry",
            json={
                "timestamp_utc": datetime.now(UTC).isoformat(),
                "metrics": {"altitude": 120.0},
                "units": {"altitude": "m"},  # engine requires km
                "source_id": "EVIDENCE_PROBE",
                "live": False,
            },
        )
        assert bad.status_code == 422, "the unit contract was not enforced"

    async def test_a_modelled_sample_is_never_recorded_as_observed(self, client):
        mission_id = await _first_mission_id(client)
        response = await client.post(
            f"/v1/missions/{mission_id}/telemetry",
            json={
                "timestamp_utc": datetime.now(UTC).isoformat(),
                "metrics": {"altitude": 120.0},
                "units": {"altitude": "km"},
                "source_id": "EVIDENCE_PROBE",
                "live": False,
            },
        )
        assert response.status_code == 200, response.text
        assert response.json()["data"]["evidence_class"] != "OBSERVED"
        assert any("never as observed" in w for w in response.json()["warnings"])


class TestE35SemanticZoomIsReachable:
    async def test_focus_does_not_change_the_scientific_set(self, client):
        response = await client.post(
            "/v1/scene/ORBIT/zoom", json={"action": "focus_object", "object_id": "VAL-A"}
        )
        assert response.status_code == 200, response.text
        data = response.json()["data"]
        assert data["selected_object"] == "VAL-A"
        assert data["scientific_hash_unchanged"] is True, (
            "a camera action altered the scientific object set"
        )

    async def test_back_returns_to_the_previous_state(self, client):
        await client.post("/v1/scene/ORBIT/zoom", json={"action": "focus_object", "object_id": "VAL-A"})
        response = await client.post("/v1/scene/ORBIT/zoom", json={"action": "back"})
        assert response.status_code == 200
        assert response.json()["data"]["action"] == "back"

    async def test_an_unknown_action_is_refused(self, client):
        response = await client.post("/v1/scene/ORBIT/zoom", json={"action": "teleport"})
        assert response.status_code == 422


class TestE37VisualSemanticsReachResponses:
    async def test_every_layer_carries_a_token_and_badge(self, client):
        response = await client.get("/v1/scene/ORBIT/semantics")
        assert response.status_code == 200, response.text
        layers = response.json()["data"]["layers"]
        assert layers, "the scene reported no layers"
        for layer in layers:
            assert layer["token"]["badge"], "a layer was drawn with no evidence badge"
            assert layer["token"]["pattern"]
            assert layer["accessible"] is True, (
                "evidence must be encoded by pattern and badge, not colour alone"
            )

    async def test_a_model_layer_is_not_badged_as_observed(self, client):
        layers = (await client.get("/v1/scene/ORBIT/semantics")).json()["data"]["layers"]
        for layer in layers:
            if layer["evidence_class"] in {"MODEL_SIGNAL", "SIMULATION_ONLY", "COUNTERFACTUAL"}:
                assert layer["token"]["badge"] not in {"OBSERVED", "OFFICIAL"}


class TestE44ImportanceAndDecisionAreReachable:
    """The directive's P11 decision packet. Both had zero call sites."""

    async def test_decision_refuses_scenarios_that_were_never_run(self, client):
        response = await client.post(
            "/v1/intelligence/decision",
            json={
                "baseline_scenario_id": "00000000-0000-0000-0000-000000000000",
                "option_scenario_ids": ["no-such-scenario-a", "no-such-scenario-b"],
                "criteria": ["screening_score"],
            },
        )
        assert response.status_code == 200
        body = response.json()
        assert body["data_status"] == "INSUFFICIENT_DATA"
        assert any("no stored execution" in w for w in body["warnings"]), (
            "a decision was attempted over scenarios that never ran"
        )

    async def test_a_single_option_without_policy_is_refused(self, client):
        """The engine's own rule: one option needs an explicit policy."""
        created = await client.post(
            "/v1/scenarios",
            json={"kind": "REMOVE", "target_object_ids": ["VAL-A"], "assumptions": ["IDEALIZED_REMOVAL"]},
        )
        if created.status_code != 200:
            pytest.skip("scenario creation unavailable in this runtime")
        scenario_id = created.json()["data"]["id"]
        run = await client.post(f"/v1/scenarios/{scenario_id}/run")
        assert run.status_code == 200, run.text

        response = await client.post(
            "/v1/intelligence/decision",
            json={
                "baseline_scenario_id": scenario_id,
                "option_scenario_ids": [scenario_id],
                "criteria": ["screening_score"],
            },
        )
        assert response.status_code == 422, (
            "a single-option recommendation was produced without a stated policy"
        )

    async def test_a_comparison_is_advisory_and_carries_no_command(self, client):
        ids = []
        for target in ("VAL-A", "VAL-B"):
            created = await client.post(
                "/v1/scenarios",
                json={"kind": "REMOVE", "target_object_ids": [target], "assumptions": ["IDEALIZED_REMOVAL"]},
            )
            if created.status_code != 200:
                pytest.skip("scenario creation unavailable in this runtime")
            scenario_id = created.json()["data"]["id"]
            assert (await client.post(f"/v1/scenarios/{scenario_id}/run")).status_code == 200
            ids.append(scenario_id)

        response = await client.post(
            "/v1/intelligence/decision",
            json={
                "baseline_scenario_id": ids[0],
                "option_scenario_ids": ids,
                "criteria": ["screening_score"],
            },
        )
        assert response.status_code == 200, response.text
        data = response.json()["data"]
        assert data["advisory_only"] is True
        assert "NO_AUTOMATIC_SPACECRAFT_COMMAND" in data["limitations"]
        assert len(data["ranked_options"]) == 2
        for option in data["ranked_options"]:
            assert not {"command", "execute", "spacecraft_command", "maneuver_command"} & set(option)
        assert any("never a spacecraft command" in w for w in response.json()["warnings"])

    async def test_importance_names_missing_inputs_instead_of_defaulting(self, client):
        events = (await client.get("/v1/intelligence/events")).json()["data"]
        if not events:
            pytest.skip("no intelligence event is stored in this runtime")
        event_id = events[0]["id"]
        response = await client.get(f"/v1/intelligence/events/{event_id}/importance")
        assert response.status_code == 200, response.text
        body = response.json()
        if body["data"] is None:
            assert body["data_status"] == "INSUFFICIENT_DATA"
            assert any("not substituted" in w for w in body["warnings"]), (
                "an absent input must be named, never replaced by a default"
            )
        else:
            assert 0.0 <= body["data"]["score"] <= 1.0
            assert body["data"]["reasons"], "a score with no traceable factors"
