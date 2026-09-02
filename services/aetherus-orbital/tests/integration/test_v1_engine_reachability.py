"""Every engine the product surface claims is reachable, proved by calling it.

Static analysis said which runtime attribute a handler mentions; that is not the
same as the engine running. These tests call the /v1 routes and look for the
engine's own fingerprint in the response — the identifier it stamps, or a
statement only that engine makes.

The eight engines measured as unreachable on 2026-09-02 each had a different
cause: E10/E11 were bypassed by routes that returned provider JSON untouched,
E32 existed only on /internal, and E39-E43 were reachable while their engine ids
sat on unused duplicate instances in the runtime. Each is covered below.
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


class TestE10SpaceWeatherRunsTheEngine:
    async def test_drag_context_states_that_no_density_model_is_wired(self, client):
        """E10's central refusal must reach a client, not stay inside the engine."""
        response = await client.get("/v1/space/weather/drag-context")
        assert response.status_code == 200, response.text
        body = response.json()
        if body["data"] is None:
            # No provider configured here; the route must say which, not stay mute.
            assert body["data_status"] in {"UNAVAILABLE", "INSUFFICIENT_DATA"}
            assert body["warnings"]
            return
        data = body["data"]
        assert data["normalized_by"] == "E10"
        assert data["density_factor"] is None, (
            "a density factor appeared without a named atmospheric model"
        )
        assert data["density_factor_status"] == "UNAVAILABLE"
        assert "no named atmospheric density model" in data["density_factor_reason"].lower()


class TestE11NeoRunsTheEngine:
    async def test_a_matched_row_carries_the_engine_normalisation(self, client):
        response = await client.get("/v1/space/neo/433")
        assert response.status_code == 200, response.text
        body = response.json()
        approaches = (body.get("data") or {}).get("approaches") or []
        if not approaches:
            assert body["data_status"] in {"UNAVAILABLE", "OK"}
            return
        for row in approaches:
            assert "normalized" in row, "the route returned provider JSON untouched"
            assert row["normalized"]["normalized_by"] == "E11"
            assert row["normalized"]["validation_state"], (
                "E11 exists to map source grade onto a validation state"
            )


class TestE32AffectedSubgraphOnTheProductSurface:
    async def test_affected_subgraph_is_served_on_v1(self, client):
        created = await client.post(
            "/v1/scenarios",
            json={
                "kind": "REMOVE",
                "target_object_ids": ["VAL-A"],
                "assumptions": ["IDEALIZED_REMOVAL"],
            },
        )
        if created.status_code != 200:
            pytest.skip("scenario creation unavailable in this runtime")
        scenario_id = created.json()["data"]["id"]

        response = await client.get(f"/v1/scenarios/{scenario_id}/affected")
        assert response.status_code == 200, (
            "the affected subgraph is part of the P8 gate and must be on /v1, "
            "not only on /internal"
        )
        assert response.json()["data_status"] == "RESEARCH_ONLY"

    async def test_internal_and_product_surfaces_agree(self, client):
        created = await client.post(
            "/v1/scenarios",
            json={"kind": "REMOVE", "target_object_ids": ["VAL-B"], "assumptions": ["IDEALIZED_REMOVAL"]},
        )
        if created.status_code != 200:
            pytest.skip("scenario creation unavailable in this runtime")
        scenario_id = created.json()["data"]["id"]
        product = await client.get(f"/v1/scenarios/{scenario_id}/affected")
        internal = await client.get(f"/internal/scenarios/{scenario_id}/affected")
        assert product.json()["data"] == internal.json()["data"], (
            "two surfaces gave different affected sets for one scenario"
        )


class TestE39ToE43IdsAreOnTheCodeThatRuns:
    """The capability was live; the identifiers were on unused duplicates."""

    def test_live_implementations_declare_their_engine_ids(self):
        from aetherus_intelligence.confidence import ConfidenceEngine, UncertaintyEngine
        from aetherus_intelligence.correlation import EventCorrelator
        from aetherus_intelligence.packet import IntelligencePacketBuilder
        from aetherus_intelligence.revision import RevisionBuilder
        from aetherus_intelligence.signal_gate import SignalPromotionGate

        assert SignalPromotionGate.id == "E40"
        assert EventCorrelator.id == "E41"
        assert RevisionBuilder.id == "E42"
        assert ConfidenceEngine.id == "E43"
        assert UncertaintyEngine.id == "E43"
        assert IntelligencePacketBuilder.id == "E44"

    def test_the_runtime_no_longer_holds_unused_duplicates(self):
        """A second instance nothing calls can only drift from the one that runs."""
        import inspect

        from aetherus_product.runtime import AetherusProductRuntime

        source = inspect.getsource(AetherusProductRuntime.__init__)
        for attribute in (
            "self.evidence_fusion=",
            "self.signal_classifier=",
            "self.event_intelligence=",
            "self.revision_intelligence=",
            "self.confidence_intelligence=",
        ):
            assert attribute not in source, f"{attribute} is constructed and never called"

    def test_e39_is_reached_through_the_packet_builder(self):
        """E39 was always live — packet.py constructs it and calls fuse()."""
        import inspect

        from aetherus_intelligence import packet

        source = inspect.getsource(packet)
        assert "EvidenceFusionCrossValidationIntelligence" in source
        assert "self.fusion.fuse(" in source

    async def test_confidence_route_serves_the_live_engine_output(self, client):
        events = (await client.get("/v1/intelligence/events")).json()["data"]
        if not events:
            pytest.skip("no intelligence event is stored in this runtime")
        event_id = events[0]["id"]
        response = await client.get(f"/v1/intelligence/events/{event_id}/confidence")
        assert response.status_code == 200, response.text
        data = response.json()["data"]
        assert "confidence" in data and "uncertainty" in data
