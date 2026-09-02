"""The shared phase-evidence helpers must not blur two different failures.

These helpers decide what a phase scorecard says, so a defect here writes wrong
evidence rather than raising. One such defect already happened: ``server_state``
read any 404 as "the running process predates this route", so a healthy
``/v1/missions/APOLLO11/state`` answering "mission not found" was filed as a
stale build. A 404 answers two questions with one number, and only one of them
is about the deployment.
"""

from __future__ import annotations

import sys
from pathlib import Path

import pytest

TOOLS = Path(__file__).resolve().parents[2] / "tools"
sys.path.insert(0, str(TOOLS))

import phase_evidence  # noqa: E402


class TestTheRouteTemplateIsRecovered:
    @pytest.mark.parametrize(
        ("concrete", "expected"),
        [
            ("/v1/missions/APOLLO11/state", "/v1/missions/{mission_id}/state"),
            ("/v1/missions/APOLLO11/telemetry", "/v1/missions/{mission_id}/telemetry"),
            ("/v1/intelligence/events/abc/confidence", "/v1/intelligence/events/{event_id}/confidence"),
            ("/v1/counterfactual/jobs/j-1", "/v1/counterfactual/jobs/{job_id}"),
            ("/health", "/health"),
            ("/v1/intelligence/events", "/v1/intelligence/events"),
        ],
    )
    def test_a_concrete_path_maps_to_its_route(self, concrete, expected):
        assert phase_evidence._template(concrete) == expected

    def test_a_query_string_is_dropped(self):
        assert phase_evidence._template("/v1/llm/explain?audience=RESEARCHER") == "/v1/llm/explain"

    def test_an_already_templated_path_is_left_alone(self):
        path = "/v1/missions/{mission_id}/state"
        assert phase_evidence._template(path) == path


class TestServerStateSeparatesThreeDifferentFailures:
    def _patch(self, monkeypatch, responses):
        monkeypatch.setattr(phase_evidence, "probe", lambda path, timeout=30: responses[path])

    def test_no_server_is_named_as_such(self, monkeypatch):
        self._patch(monkeypatch, {"/health": {"path": "/health", "http_status": None, "error": "refused"}})
        assert phase_evidence.server_state(["/v1/anything"])["state"] == "NO_SERVER"

    def test_a_missing_route_is_a_stale_build(self, monkeypatch):
        self._patch(monkeypatch, {
            "/health": {"http_status": 200},
            "/openapi.json": {"http_status": 200, "body": {"paths": {"/health": {}}}},
        })
        state = phase_evidence.server_state(["/v1/llm/audiences"])
        assert state["state"] == "STALE_BUILD"
        assert state["missing_routes"] == ["/v1/llm/audiences"]

    def test_a_declared_route_is_current_even_when_the_resource_is_absent(self, monkeypatch):
        """The bug this test exists for: 'mission not found' is the route working.

        A 404 on a declared route says the resource is absent. Reading it as a
        stale deployment blamed the code for an empty database.
        """
        self._patch(monkeypatch, {
            "/health": {"http_status": 200},
            "/openapi.json": {"http_status": 200, "body": {
                "paths": {"/health": {}, "/v1/missions/{mission_id}/state": {}}
            }},
        })
        state = phase_evidence.server_state(["/v1/missions/NO_SUCH_MISSION/state"])
        assert state["state"] == "CURRENT"

    def test_a_server_without_a_schema_is_unknown_not_stale(self, monkeypatch):
        """Unable to read the route set is not the same as knowing it is short."""
        self._patch(monkeypatch, {
            "/health": {"http_status": 200},
            "/openapi.json": {"http_status": 404, "error": "Not Found"},
        })
        assert phase_evidence.server_state(["/v1/anything"])["state"] == "UNKNOWN_BUILD"


class TestAttemptRecordsAFailureRatherThanRaising:
    def test_a_raising_probe_is_recorded(self):
        result = phase_evidence.attempt(lambda: 1 / 0)
        assert result["ok"] is False
        assert "ZeroDivisionError" in result["error"]

    def test_a_working_probe_carries_its_value(self):
        assert phase_evidence.attempt(lambda: {"x": 1}) == {"ok": True, "value": {"x": 1}}


class TestTheGateIsDerivedNotDeclared:
    def test_any_unmet_check_makes_the_gate_partial(self, tmp_path, monkeypatch):
        monkeypatch.setattr(phase_evidence, "EVIDENCE_DIR", tmp_path)
        monkeypatch.setattr(phase_evidence, "git", lambda *args: "stub")
        evidence = phase_evidence.write_evidence(
            phase="ptest", phase_name="T", hard_gate="G",
            checks={"a": True, "b": False},
            blockers={"b": (phase_evidence_blocker(), "reason")},
            limitations=[], next_allowed="none",
        )
        assert evidence["gate"] == "PARTIAL"
        assert evidence["failed_checks"] == ["b"]

    def test_all_met_checks_make_the_gate_pass(self, tmp_path, monkeypatch):
        monkeypatch.setattr(phase_evidence, "EVIDENCE_DIR", tmp_path)
        monkeypatch.setattr(phase_evidence, "git", lambda *args: "stub")
        evidence = phase_evidence.write_evidence(
            phase="ptest", phase_name="T", hard_gate="G",
            checks={"a": True}, blockers={}, limitations=[], next_allowed="none",
        )
        assert evidence["gate"] == "PASS" and evidence["failed_checks"] == []


def phase_evidence_blocker() -> str:
    from blocker_class import BUILDABLE_NOW

    return BUILDABLE_NOW
