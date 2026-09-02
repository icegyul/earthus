"""V2-P5 (Live/Modelled Mission Tracking, E16~E19) 증거 생성기.

지시서의 V2-P5 hard gate는 "mission→orbit E2E"다. 발사체가 텔레메트리로 관측되고,
그 기록이 타임라인에 남고, 재생 가능하며, 끝에 궤도 객체로 인계되는 한 줄이 닫혀야
한다.

파일명이 `generate_p5_mission_evidence.py` 인 이유: 이 저장소에는 **두 개의 P5**가
있다. 하나는 여기의 V2 단계 P5(임무 추적)이고, 다른 하나는 궤도 서비스 쪽의
"P5 준수 반사실"(SCREENING_RECOMPUTE_V1)이다. 서로 다른 계보이고 `tests/*/test_p5_*`
는 후자를 가리킨다. 이름이 같다는 이유로 한쪽 증거를 다른 쪽 관문에 붙이면 그게
이 단계에서 가장 하기 쉬운 거짓말이다.

이 단계가 지키는 정직성 규칙:

* **관측과 모델을 섞지 않는다.** 라이브 피드가 없으면 샘플은 OBSERVED 가 아니라
  MODEL_SIGNAL 이다. E16 이 그 구분을 EvidenceClass 로 새긴다.
* **인계는 근거 없이 확정되지 않는다.** E19 의 handover 는 근거가 붙기 전까지
  PROVISIONAL 이며, PROVISIONAL 을 CONFIRMED 로 읽는 것이 이 단계의 실패 방식이다.
* **텔레메트리를 지어내지 않는다.** 연결된 피드가 없으면 저장소는 비어 있고 읽기
  경로가 그렇게 말한다. 빈 것을 0으로 채우지 않는다.

실행: services/aetherus-orbital에서 .venv/Scripts/python tools/generate_p5_mission_evidence.py
"""

import sys
from datetime import datetime, timedelta, timezone
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
from blocker_class import BUILDABLE_NOW, EXTERNAL_PARTNER_GATED  # noqa: E402
from phase_evidence import (  # noqa: E402
    attempt, digest, on_path, probe, pytest_summary, server_state, write_evidence,
)

TESTS = [
    "tests/acceptance/test_master_acceptance.py",
    "tests/integration/test_engine_connections.py",
]

PROBES = ["/v1/missions/APOLLO11/state", "/v1/missions/APOLLO11/telemetry"]

T0 = datetime(2026, 9, 1, 0, 0, tzinfo=timezone.utc)


def telemetry_fusion() -> dict:
    """E16 keeps observed and modelled telemetry apart, and rejects bad units."""
    on_path()
    from aetherus_control import TelemetryFusionEngine
    from aetherus_domain import EvidenceClass

    engine = TelemetryFusionEngine()
    live = engine.ingest(
        timestamp_utc=T0, metrics={"altitude": 120.0}, units={"altitude": "km"},
        source_id="OPERATOR_FEED", live=True, sequence=1,
    )
    modelled = engine.ingest(
        timestamp_utc=T0 + timedelta(seconds=10), metrics={"altitude": 140.0},
        units={"altitude": "km"}, source_id="NOMINAL_PROFILE", live=False, sequence=2,
    )

    wrong_unit = False
    try:
        engine.ingest(
            timestamp_utc=T0, metrics={"altitude": 1.0}, units={"altitude": "m"},
            source_id="X", live=True,
        )
    except ValueError:
        wrong_unit = True

    non_numeric = False
    try:
        engine.ingest(
            timestamp_utc=T0, metrics={"altitude": "high"}, units={"altitude": "km"},
            source_id="X", live=True,
        )
    except ValueError:
        non_numeric = True

    return {
        "live_is_observed": live.evidence_class == EvidenceClass.OBSERVED,
        "modelled_is_not_observed": modelled.evidence_class == EvidenceClass.MODEL_SIGNAL,
        "samples_ordered": [s.timestamp_utc for s in engine.samples()]
        == sorted(s.timestamp_utc for s in engine.samples()),
        "rejects_wrong_unit": wrong_unit,
        "rejects_non_numeric_metric": non_numeric,
        "empty_engine_has_no_current": TelemetryFusionEngine().current() is None,
    }


def timeline_and_replay() -> dict:
    """E18 records the mission and E19 replays it from what was recorded."""
    on_path()
    from aetherus_control import MissionReplayOrbitHandoverEngine, MissionTimelineRecorderEngine

    timeline = MissionTimelineRecorderEngine()
    timeline.append(
        event_id="LIFTOFF", event_type="LIFTOFF", timestamp_utc=T0,
        evidence_ids=["E-1"], payload={"pad": "LC-39A"},
    )
    timeline.append(
        event_id="MECO", event_type="MECO", timestamp_utc=T0 + timedelta(minutes=8),
        evidence_ids=["E-2"], payload={},
    )
    # A corrected event is a new revision of the same event, not a second event.
    revised = timeline.append(
        event_id="LIFTOFF", event_type="LIFTOFF", timestamp_utc=T0,
        evidence_ids=["E-1", "E-3"], payload={"pad": "LC-39A", "corrected": True},
    )

    replayer = MissionReplayOrbitHandoverEngine()
    early = replayer.replay(timeline, at_utc=T0 + timedelta(minutes=1))
    late = replayer.replay(timeline, at_utc=T0 + timedelta(minutes=30))
    return {
        "distinct_events": len(timeline.ordered()),
        "revision_number": revised.revision_no,
        "revision_supersedes_rather_than_duplicates": len(timeline.ordered()) == 2,
        "replay_is_time_bounded": len(early["events"]) < len(late["events"]),
        # A replay that shows events after its cursor is not a replay.
        "replay_excludes_the_future": early["events"] == ["LIFTOFF"],
        "replay_is_reproducible": replayer.replay(timeline, at_utc=T0 + timedelta(minutes=1))["record_hash"]
        == early["record_hash"],
        # A replay must not be able to author a new current event.
        "replay_cannot_create_a_current_event": early.get("may_create_current_event") is False
        and early.get("mode") == "REPLAY",
    }


def handover_requires_evidence() -> dict:
    """E19 will not hand a payload to the catalogue on an unsupported claim."""
    on_path()
    from aetherus_control import MissionReplayOrbitHandoverEngine

    engine = MissionReplayOrbitHandoverEngine()
    provisional = engine.handover(
        mission_id="M1", payload_id="P1", object_id="OBJ-1",
        object_type="SATELLITE", evidence_ids=["E-1"],
    )
    confirmed = engine.confirm("M1", "P1", evidence_id="E-2")

    no_evidence = False
    try:
        engine.handover(
            mission_id="M2", payload_id="P2", object_id="OBJ-2",
            object_type="SATELLITE", evidence_ids=[],
        )
    except ValueError:
        no_evidence = True

    bad_type = False
    try:
        engine.handover(
            mission_id="M3", payload_id="P3", object_id="OBJ-3",
            object_type="UFO", evidence_ids=["E-9"],
        )
    except ValueError:
        bad_type = True

    return {
        "starts_provisional": provisional.status == "PROVISIONAL",
        "confirmation_adds_evidence": confirmed.status == "CONFIRMED"
        and len(confirmed.evidence_ids) > len(provisional.evidence_ids),
        "refuses_handover_without_evidence": no_evidence,
        "refuses_unknown_object_type": bad_type,
        "cross_links_both_directions": set(provisional.origin_relation) == {"GO_TO_LAUNCH", "WHERE_IS_IT_NOW"},
    }


def live_telemetry_store() -> dict:
    """With no operator feed connected the store is empty and says so."""
    payload = probe("/v1/missions/APOLLO11/telemetry")
    body = payload.get("body") or {}
    data = body.get("data")
    rows = data if isinstance(data, list) else (data or {}).get("samples") or []
    return {
        "http_status": payload.get("http_status"),
        "data_status": body.get("data_status"),
        "sample_count": len(rows),
        # Empty is a legitimate answer. It must be labelled, not filled with zeros.
        "emptiness_is_labelled": bool(rows)
        or body.get("data_status") in {"UNAVAILABLE", "INSUFFICIENT_DATA", "OK"},
    }


def main() -> None:
    tests = pytest_summary(TESTS)
    build = server_state(PROBES)
    fusion = attempt(telemetry_fusion)
    timeline = attempt(timeline_and_replay)
    handover = attempt(handover_requires_evidence)
    store = attempt(live_telemetry_store)

    f = fusion.get("value") or {}
    t = timeline.get("value") or {}
    h = handover.get("value") or {}
    s = store.get("value") or {}
    live = build["state"] == "CURRENT"

    checks = {
        "tests_pass": tests.get("exit_code") == 0,
        "observed_and_modelled_telemetry_stay_separate": bool(f.get("live_is_observed"))
        and bool(f.get("modelled_is_not_observed")),
        "telemetry_rejects_bad_units_and_types": bool(f.get("rejects_wrong_unit"))
        and bool(f.get("rejects_non_numeric_metric")),
        "no_telemetry_means_no_current_sample": bool(f.get("empty_engine_has_no_current")),
        "timeline_replay_is_time_bounded": bool(t.get("replay_is_time_bounded"))
        and bool(t.get("replay_excludes_the_future")),
        "timeline_revision_supersedes_not_duplicates": bool(t.get("replay_is_reproducible"))
        and bool(t.get("revision_supersedes_rather_than_duplicates")),
        "replay_cannot_author_a_current_event": bool(t.get("replay_cannot_create_a_current_event")),
        "handover_starts_provisional": bool(h.get("starts_provisional")),
        "handover_refuses_an_unsupported_claim": bool(h.get("refuses_handover_without_evidence"))
        and bool(h.get("refuses_unknown_object_type")),
        "mission_and_orbit_are_cross_linked": bool(h.get("cross_links_both_directions")),
        "telemetry_surface_live": live and s.get("http_status") == 200,
        "empty_telemetry_is_labelled_not_zeroed": bool(s.get("emptiness_is_labelled")),
        "operator_or_official_live_feed_connected": (s.get("sample_count") or 0) > 0,
    }
    blockers = {
        "tests_pass": (BUILDABLE_NOW, "임무 추적 테스트 미통과 — 내부 작업"),
        "observed_and_modelled_telemetry_stay_separate": (
            BUILDABLE_NOW,
            "관측 텔레메트리와 모델 텔레메트리가 같은 EvidenceClass 로 저장된다. "
            "지시서 절대 원칙 4 위반 — 내부 작업",
        ),
        "telemetry_rejects_bad_units_and_types": (
            BUILDABLE_NOW, "단위·자료형 검증 없이 텔레메트리를 받는다 — 내부 작업",
        ),
        "no_telemetry_means_no_current_sample": (
            BUILDABLE_NOW, "샘플이 없는데 현재값이 만들어진다 — 내부 작업",
        ),
        "timeline_replay_is_time_bounded": (
            BUILDABLE_NOW, "재생이 커서 이후 사건을 포함한다 — 내부 작업",
        ),
        "timeline_revision_supersedes_not_duplicates": (
            BUILDABLE_NOW,
            "정정된 사건이 같은 사건의 개정이 아니라 두 번째 사건으로 쌓인다 — 내부 작업",
        ),
        "replay_cannot_author_a_current_event": (
            BUILDABLE_NOW,
            "재생 모드가 현재 사건을 만들 수 있다. 과거 재구성이 현재 상태를 쓰면 둘의 구분이 무너진다 — 내부 작업",
        ),
        "handover_starts_provisional": (
            BUILDABLE_NOW, "인계가 근거 확인 전에 확정으로 시작된다 — 내부 작업",
        ),
        "handover_refuses_an_unsupported_claim": (
            BUILDABLE_NOW, "근거 없는 인계 또는 미지의 객체 유형이 통과한다 — 내부 작업",
        ),
        "mission_and_orbit_are_cross_linked": (
            BUILDABLE_NOW, "임무↔궤도 양방향 링크 부재 — 내부 작업",
        ),
        "telemetry_surface_live": (
            BUILDABLE_NOW,
            f"텔레메트리 표면 미확인 (server state={build['state']}) — 내부 작업",
        ),
        "empty_telemetry_is_labelled_not_zeroed": (
            BUILDABLE_NOW,
            "빈 텔레메트리가 상태 표기 없이 반환된다. 없음과 0을 구분해야 한다 — 내부 작업",
        ),
        "operator_or_official_live_feed_connected": (
            EXTERNAL_PARTNER_GATED,
            "실 발사 텔레메트리는 운영자 또는 공식 기관이 피드를 제공해야 들어온다. "
            "키 발급이 아니라 상대의 승인과 연동이 필요하므로 파트너 차단이다. "
            "피드가 없는 동안 저장소를 합성 샘플로 채우지 않는다.",
        ),
    }

    write_evidence(
        phase="p5-mission",
        phase_name="Live/Modelled Mission Tracking (V2-P5, E16~E19)",
        hard_gate="mission→orbit E2E",
        checks=checks,
        blockers=blockers,
        tests_mission_tracking=tests,
        telemetry_fusion=fusion,
        timeline_and_replay=timeline,
        handover=handover,
        live_telemetry_store=store,
        live_build=build,
        live_api={"telemetry": digest(probe("/v1/missions/APOLLO11/telemetry"))},
        naming_note=(
            "이 저장소에는 P5 가 둘이다. 여기(V2-P5)는 임무 추적이고, "
            "tests/*/test_p5_* 와 궤도 서비스의 'P5 준수'는 반사실 엔진 쪽 계보다. "
            "증거 파일명을 p5-mission.json 으로 분리한 이유다."
        ),
        limitations=[
            "실 발사 텔레메트리 피드가 연결돼 있지 않다. E16~E19 의 계약은 검증되지만 "
            "실 임무 한 건의 종단 통과는 피드가 있어야 보일 수 있다.",
            "재생은 기록된 이벤트에서 재구성한다. 기록되지 않은 순간의 상태를 보간하지 않는다.",
            "인계는 궤도 객체 식별자를 잇는 것이지 궤도 결정을 수행하는 것이 아니다.",
        ],
        next_allowed="운영자/공식 텔레메트리 피드 확보 후 실 임무 종단 검증",
    )


if __name__ == "__main__":
    main()
