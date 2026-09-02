"""The L01-L08 contract, held where the directive's purposes differ.

The directive repeats one identical block of implementation requirements under
all eight headings, so the purpose line is what separates the layers. Four of
those purposes had no implementation: routing by tier (L02), minimum context
(L04), audience levels (L05), and report types (L08). These tests hold the new
behaviour and, more importantly, hold the honesty rules that come with it.

The rule under all of them is the one the metric-provenance work spent the week
establishing: a value that was not produced is not zero, and a route that did
not run is not the route to report.
"""

from __future__ import annotations

import pytest
from httpx import AsyncClient

from aetherus_llm import (
    AudienceLevel,
    AuditContext,
    CircuitBreaker,
    ContextComposer,
    DeterministicLocalProvider,
    ExplanationAgent,
    LLMGateway,
    ModelRouter,
    ModelTier,
    ReportType,
    BriefingReportGenerator,
)

pytestmark = pytest.mark.integration


@pytest.fixture
def packet():
    from tests.acceptance.cases import packet_fixture

    return packet_fixture()


@pytest.fixture
async def client():
    from services.api.integrated import app

    async with AsyncClient(app=app, base_url="http://test") as async_client:
        yield async_client


class TestL02RoutesByTierAndReportsWhatRan:
    def test_the_served_tier_is_the_one_that_will_execute(self):
        """A request for REASONING served by a template must not claim REASONING."""
        router = ModelRouter()
        decision = router.decide("SCENARIO_NARRATIVE", plan="PRO / RESEARCH")
        assert decision.requested_tier == ModelTier.REASONING.value
        assert decision.served_tier == ModelTier.TEMPLATE.value, (
            "no reasoning provider is registered, so nothing else can have run"
        )
        assert decision.downgraded is True
        assert "no provider is registered for" in decision.reason

    def test_a_plan_ceiling_is_stated_not_silent(self):
        router = ModelRouter()
        decision = router.decide("BRIEFING", plan="FREE")
        assert decision.downgraded is True
        assert "FREE" in decision.reason and "FAST" in decision.reason

    def test_a_registered_tier_is_served_without_downgrade(self):
        router = ModelRouter(
            tier_routes={
                ModelTier.TEMPLATE: ("local", "aetherus-safe-local"),
                ModelTier.FAST: ("local", "fast-model"),
            }
        )
        decision = router.decide("EXPLANATION", plan="AETHERUS+")
        assert decision.served_tier == ModelTier.FAST.value
        assert decision.downgraded is False and decision.reason is None

    def test_a_latency_budget_forces_the_deterministic_route(self):
        router = ModelRouter(
            tier_routes={
                ModelTier.TEMPLATE: ("local", "aetherus-safe-local"),
                ModelTier.FAST: ("local", "fast-model"),
            }
        )
        decision = router.decide("EXPLANATION", latency_budget_ms=200)
        assert decision.served_tier == ModelTier.TEMPLATE.value
        assert "latency budget" in decision.reason

    def test_the_plan_ceiling_never_withholds_packet_content(self):
        """The directive forbids putting public-safety information behind a plan.

        A ceiling may change which model composes the answer. It must never make
        the deterministic route unreachable, because that route is the one that
        can always state what the packet holds.
        """
        router = ModelRouter()
        for plan in ModelRouter.PLAN_TIER_CEILING:
            decision = router.decide("EXPLANATION", plan=plan)
            assert decision.served_tier == ModelTier.TEMPLATE.value
            assert decision.provider == "local"


class TestL01RecordsWhatItMeasuredAndNothingElse:
    def test_an_unreported_token_count_is_not_zero(self, packet):
        gateway = LLMGateway()
        audit = AuditContext(request_id="req-1", feature="LLM_EXPLANATION")
        response = gateway.generate(
            provider="local", prompt="ok", model="m", packet=packet, audit=audit
        )
        usage = response.usage
        assert usage.tokens_in is None and usage.tokens_out is None, (
            "the local provider reports no token count; 0 would be a measurement "
            "that was never taken"
        )
        assert usage.tokens_status == "NOT_REPORTED_BY_PROVIDER"

    def test_cost_without_a_price_table_is_unavailable_not_free(self, packet):
        gateway = LLMGateway()
        response = gateway.generate(provider="local", prompt="ok", model="m", packet=packet)
        assert response.usage.cost_usd is None
        assert response.usage.cost_status == "UNAVAILABLE"
        assert "price table" in response.usage.cost_reason

    def test_latency_is_ours_to_report(self, packet):
        gateway = LLMGateway()
        response = gateway.generate(provider="local", prompt="ok", model="m", packet=packet)
        assert response.usage.latency_basis == "COMPUTED_INTERNAL"
        assert response.usage.latency_ms >= 0.0

    def test_a_reporting_provider_is_believed(self, packet):
        class Reporting(DeterministicLocalProvider):
            name = "REPORTING_LOCAL"
            last_usage = {"tokens_in": 11, "tokens_out": 7}

        gateway = LLMGateway(providers={"local": Reporting()})
        response = gateway.generate(provider="local", prompt="ok", model="m", packet=packet)
        assert response.usage.tokens_in == 11
        assert response.usage.tokens_status == "REPORTED_BY_PROVIDER"

    def test_the_trace_records_the_prompt_by_hash(self, packet):
        """A stored trace must not become a copy of private context."""
        gateway = LLMGateway()
        secret = "workspace private fleet designation ZZZ"
        gateway.generate(provider="local", prompt=secret, model="m", packet=packet)
        entry = gateway.trace[-1]
        assert "prompt_sha256" in entry and secret not in str(entry)

    def test_a_broken_provider_opens_the_circuit_and_never_raises(self, packet):
        class Broken(DeterministicLocalProvider):
            def generate(self, prompt, *, model="m", timeout_s=5.0):
                raise TimeoutError("provider timeout")

        gateway = LLMGateway(providers={"local": Broken()}, breaker=CircuitBreaker(failure_threshold=2))
        first = gateway.generate(provider="local", prompt="x", model="m", packet=packet)
        second = gateway.generate(provider="local", prompt="x", model="m", packet=packet)
        third = gateway.generate(provider="local", prompt="x", model="m", packet=packet)

        assert first.warnings == ("PROVIDER_TIMEOUT",)
        assert second.warnings == ("PROVIDER_TIMEOUT",)
        assert third.warnings == ("PROVIDER_CIRCUIT_OPEN",), (
            "after the threshold the breaker must answer without calling again"
        )
        assert all(r.validation_state == "UNAVAILABLE" for r in (first, second, third))

    def test_a_provider_fault_does_not_mutate_the_packet(self, packet):
        before = packet.model_dump(mode="json")
        gateway = LLMGateway()
        gateway.generate(provider="local", prompt="x", model="m", packet=packet, timeout_s=0)
        assert packet.model_dump(mode="json") == before


class TestL04ComposesTheMinimumAndSaysWhatItLeftOut:
    def test_an_intent_narrows_the_context(self, packet):
        composer = ContextComposer()
        minimal = composer.compose_minimal(packet, intent="WHAT_HAPPENED")
        assert "what_happened" in minimal
        assert "scenario_results" not in minimal

    def test_omission_is_labelled_so_it_is_not_read_as_absence(self, packet):
        composer = ContextComposer()
        minimal = composer.compose_minimal(packet, intent="WHAT_HAPPENED")
        scope = minimal["context_scope"]
        assert "scenario_results" in scope["omitted_sections"]
        assert "not evidence that the packet lacks them" in scope["note"]

    def test_claim_guardrails_are_in_every_profile(self, packet):
        """Dropping the guardrails to save context is how a bad claim gets out."""
        composer = ContextComposer()
        for intent in ContextComposer.INTENT_PROFILES:
            minimal = composer.compose_minimal(packet, intent=intent)
            for guard in ("allowed_claims", "prohibited_claims", "known_limitations"):
                assert guard in minimal, f"{intent} dropped {guard}"

    def test_an_unknown_section_is_refused(self, packet):
        with pytest.raises(KeyError):
            ContextComposer().compose_minimal(packet, sections=("event", "invented_section"))

    def test_private_context_still_needs_authorisation(self, packet):
        composer = ContextComposer()
        minimal = composer.compose_minimal(
            packet, intent="WHAT_HAPPENED", workspace_context={"secret": "x"}
        )
        assert minimal["workspace_private"] == {}


class TestL05SpeaksAtFourLevelsWithoutInventingContent:
    def test_every_level_is_producible(self, packet):
        agent = ExplanationAgent()
        for level in AudienceLevel:
            assert agent.explain(packet, audience=level)

    def test_a_narrower_level_is_a_narrower_selection(self, packet):
        agent = ExplanationAgent()
        general = agent.explain(packet, audience=AudienceLevel.GENERAL)
        operator = agent.explain(packet, audience=AudienceLevel.OPERATOR)
        assert len(general) < len(operator)

    def test_validation_state_survives_every_level(self, packet):
        """A shorter answer that drops 'this is screening grade' is not shorter."""
        agent = ExplanationAgent()
        for level in AudienceLevel:
            assert packet.event.validation_state.value in agent.explain(packet, audience=level)

    def test_limitations_survive_every_level(self, packet):
        agent = ExplanationAgent()
        if not packet.known_limitations:
            pytest.skip("the fixture packet declares no limitation to carry")
        for level in AudienceLevel:
            text = agent.explain(packet, audience=level)
            assert any(limitation[:24] in text for limitation in packet.known_limitations)

    def test_no_level_introduces_a_number_the_packet_lacks(self, packet):
        """Every level goes through L06 before it is returned."""
        from aetherus_llm import ClaimCitationValidator

        agent = ExplanationAgent()
        validator = ClaimCitationValidator()
        for level in AudienceLevel:
            text = agent.explain(packet, audience=level)
            assert not text.startswith("Claim withheld"), f"{level} produced an unsupported claim"
            assert validator.validate(text, packet)["valid"], f"{level} introduced an unsupported number"

    def test_the_operator_boundary_travels_as_data_not_prose(self, packet):
        """A prohibited claim quoted into a paragraph is one copy-paste from
        being read as the system's own assertion, and L06 withholds any text
        that contains one. The boundary is returned as a list instead."""
        composed = ExplanationAgent().compose(packet, audience=AudienceLevel.OPERATOR)
        assert composed["guardrails"]["prohibited_claims"] == list(packet.prohibited_claims)
        for claim in packet.prohibited_claims:
            assert claim not in composed["text"]
        assert "prohibited_claims" in composed["text"]

    def test_a_general_level_gets_no_guardrail_list(self, packet):
        assert ExplanationAgent().compose(packet, audience=AudienceLevel.GENERAL)["guardrails"] == {}

    def test_an_unknown_level_is_refused(self, packet):
        with pytest.raises(ValueError):
            ExplanationAgent().explain(packet, audience="EXECUTIVE")


class TestL08ProducesTheFourNamedReports:
    def test_every_report_type_is_producible(self, packet):
        generator = BriefingReportGenerator()
        for report_type in ReportType:
            briefing = generator.generate([packet], report_type=report_type)
            assert briefing.report_type == report_type.value

    def test_report_types_differ_in_what_they_select(self, packet):
        generator = BriefingReportGenerator()
        daily = generator.generate([packet], report_type=ReportType.DAILY_SPACE_BRIEF)
        event = generator.generate([packet], report_type=ReportType.EVENT_REPORT)
        assert set(daily.sections[0]) < set(event.sections[0]), (
            "the event report must carry more of the packet than the daily brief"
        )

    def test_every_report_carries_validation_state_and_limitations(self, packet):
        generator = BriefingReportGenerator()
        for report_type in ReportType:
            section = generator.generate([packet], report_type=report_type).sections[0]
            assert section["validation_state"]
            assert "limitations" in section

    def test_a_scenario_report_without_a_scenario_is_insufficient_not_empty(self, packet):
        """An empty scenario report reads as a scenario that found nothing."""
        assert not packet.scenario_results, "fixture unexpectedly carries scenario results"
        briefing = BriefingReportGenerator().generate(
            [packet], report_type=ReportType.RESEARCH_SCENARIO_REPORT
        )
        assert briefing.data_status == "INSUFFICIENT_DATA"
        assert "no scenario result" in briefing.status_reason

    def test_a_scenario_report_is_labelled_simulated(self, packet):
        briefing = BriefingReportGenerator().generate(
            [packet], report_type=ReportType.RESEARCH_SCENARIO_REPORT
        )
        assert any("never an observed outcome" in w for w in briefing.warnings)

    def test_no_packets_is_insufficient_data(self):
        briefing = BriefingReportGenerator().generate([])
        assert briefing.data_status == "INSUFFICIENT_DATA"

    def test_the_report_hash_separates_the_types(self, packet):
        generator = BriefingReportGenerator()
        daily = generator.generate([packet], report_type=ReportType.DAILY_SPACE_BRIEF)
        mission = generator.generate([packet], report_type=ReportType.MISSION_BRIEF)
        assert daily.report_hash != mission.report_hash


class TestTheLayersAreOnTheProductSurface:
    async def test_the_audience_levels_are_listed(self, client):
        response = await client.get("/v1/llm/audiences")
        assert response.status_code == 200, response.text
        assert set(response.json()["data"]) == {a.value for a in AudienceLevel}

    async def test_the_report_types_are_listed(self, client):
        response = await client.get("/v1/briefings/types")
        assert response.status_code == 200, response.text
        assert set(response.json()["data"]) == {r.value for r in ReportType}

    async def test_an_explanation_can_be_asked_for_by_level(self, client):
        response = await client.get("/v1/llm/explain", params={"audience": "RESEARCHER"})
        assert response.status_code == 200, response.text
        body = response.json()
        assert body["data"]["audience"] == "RESEARCHER"

    async def test_the_response_names_the_tier_that_served_it(self, client):
        response = await client.get("/v1/llm/explain", params={"plan": "FREE"})
        assert response.status_code == 200, response.text
        body = response.json()
        routing = body["data"].get("routing")
        if routing is None:
            assert body["data_status"] == "UNAVAILABLE"
            return
        assert routing["served_tier"] == "TEMPLATE"
        assert body["provenance"]["served_tier"] == "TEMPLATE"
        if routing["downgraded"]:
            assert any("served by" in w for w in body["warnings"])

    async def test_an_unknown_level_is_a_422_naming_the_valid_ones(self, client):
        response = await client.get("/v1/llm/explain", params={"audience": "EXECUTIVE"})
        assert response.status_code == 422, response.text
        assert "GENERAL" in response.text

    async def test_a_report_type_can_be_asked_for(self, client):
        response = await client.get(
            "/v1/briefings/current", params={"report_type": "EVENT_REPORT"}
        )
        assert response.status_code == 200, response.text
        data = response.json()["data"]
        if data.get("sections"):
            assert data["report_type"] == "EVENT_REPORT"

    async def test_an_unknown_report_type_is_a_422(self, client):
        response = await client.get(
            "/v1/briefings/current", params={"report_type": "QUARTERLY_SUMMARY"}
        )
        assert response.status_code == 422, response.text
