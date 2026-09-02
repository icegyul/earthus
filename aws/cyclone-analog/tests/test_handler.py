"""종료 보고서 오차표가 비지 않는지 지킨다.

⚠️⚠️ 이 테스트가 생긴 이유 — 2026-09-02 실측:
   운영 중이던 종료 보고서 22건의 `scores` 가 **전부 빈 배열**이었다.
   원인은 IBTrACS 점 시각을 iso_time() 으로 읽은 것.
   iso_time 의 계약은 "시간대가 없으면 None"(CWA 지역시각을 UTC로 추측하지 않으려는 것)인데,
   parse_ibtracs 가 저장하는 시각은 `iso[:13]` = 'YYYY-MM-DD HH' 로 시간대가 없다.
   그래서 best track 시각이 전부 None 이 되고 _score 의 nearby 가 항상 빈 배열이었다.
   화면은 빈 표를 조용히 그렸고, 아무도 오류를 못 봤다 — 그래서 테스트로 못박는다.
"""

import importlib.util
import pathlib
import sys
import types
import unittest


class _FakeS3:
    pass


if "boto3" not in sys.modules:
    boto3 = types.ModuleType("boto3")
    boto3.client = lambda *args, **kwargs: _FakeS3()
    sys.modules["boto3"] = boto3
if "botocore.config" not in sys.modules:
    botocore = types.ModuleType("botocore")
    config = types.ModuleType("botocore.config")
    config.Config = lambda *args, **kwargs: None
    sys.modules.setdefault("botocore", botocore)
    sys.modules["botocore.config"] = config
if "botocore.exceptions" not in sys.modules:
    exceptions = types.ModuleType("botocore.exceptions")
    exceptions.ClientError = type("ClientError", (Exception,), {})
    sys.modules["botocore.exceptions"] = exceptions

import os

os.environ.setdefault("CACHE_BUCKET", "test-bucket")

HANDLER = pathlib.Path(__file__).parent.parent / "handler.py"
SPEC = importlib.util.spec_from_file_location("cyclone_analog", HANDLER)
MODULE = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(MODULE)


# parse_ibtracs 가 실제로 저장하는 형태: [lat, lon, windKt, iso[:13], nature]
# 실측 예 — 'ocean/ibtracs-wp.json' 2026-09-02
_PTS = [
    [20.0, 130.0, 45, "2026-07-01 00", "TS"],
    [20.5, 129.5, 50, "2026-07-01 06", "TS"],
    [21.0, 129.0, 55, "2026-07-01 12", "TS"],
    [21.5, 128.5, 60, "2026-07-01 18", "TS"],
    [22.0, 128.0, 60, "2026-07-02 00", "TS"],
    [22.5, 127.5, 55, "2026-07-02 06", "TS"],
    [23.0, 127.0, 50, "2026-07-02 12", "TS"],
    [23.5, 126.5, 45, "2026-07-02 18", "TS"],
]
_HISTORY = {"storms": [{"sid": "WP012026", "season": 2026, "name": "Testy", "pts": _PTS}]}


class IbtracsTimeTest(unittest.TestCase):
    def test_stored_ibtracs_stamp_expands_to_utc(self):
        """저장 형식 'YYYY-MM-DD HH' 를 완전한 UTC 시각으로 편다."""
        self.assertEqual(MODULE._ibtracs_time("2026-07-01 06"), "2026-07-01T06:00:00Z")

    def test_expanded_stamp_is_readable_by_iso_time(self):
        """편 결과는 iso_time 이 반드시 읽을 수 있어야 한다 — 이것이 버그의 핵심이었다."""
        self.assertIsNone(MODULE.iso_time("2026-07-01 06"))          # 원래 형식은 못 읽는다
        self.assertIsNotNone(MODULE.iso_time(MODULE._ibtracs_time("2026-07-01 06")))

    def test_garbage_stays_none(self):
        """모르는 값을 시각으로 지어내지 않는다."""
        for bad in (None, "", "2026-07-01", "not-a-time", "2026-07-01 xx"):
            self.assertIsNone(MODULE._ibtracs_time(bad), bad)


class FinalTrackTest(unittest.TestCase):
    def test_track_times_are_parseable(self):
        track = MODULE._final_track(_HISTORY, "Testy", 2026)
        self.assertEqual(len(track), len(_PTS))
        for point in track:
            self.assertIsNotNone(MODULE.iso_time(point["at"]),
                                 f"best track 시각을 못 읽는다: {point['at']!r}")


class ScoreTest(unittest.TestCase):
    """⚠️ 이 클래스가 22건 전부 빈 오차표를 잡아냈어야 했다."""

    def _groups(self, track, offset_lat=0.0):
        issued = track[0]["at"]
        steps = [{"h": h, "lat": track[i]["lat"] + offset_lat, "lon": track[i]["lon"]}
                 for h, i in ((6, 1), (12, 2), (24, 4))]
        return [{"agency": "TEST", "issued": issued, "steps": steps}]

    def test_scores_are_not_empty(self):
        track = MODULE._final_track(_HISTORY, "Testy", 2026)
        scores = MODULE._score(self._groups(track), track)
        self.assertTrue(scores, "오차표가 비었다 — best track 시각 파싱을 확인할 것")
        self.assertEqual(scores[0]["n"], 3)

    def test_perfect_forecast_scores_zero(self):
        """경로를 정확히 맞히면 오차가 0 이어야 한다 — 대조 짝이 맞는지 검사."""
        track = MODULE._final_track(_HISTORY, "Testy", 2026)
        scores = MODULE._score(self._groups(track), track)
        self.assertEqual(scores[0]["meanErrorKm"], 0)

    def test_offset_forecast_scores_that_offset(self):
        """위도 0.27° ≈ 30km — 어긋난 만큼만 오차로 나와야 한다."""
        track = MODULE._final_track(_HISTORY, "Testy", 2026)
        scores = MODULE._score(self._groups(track, offset_lat=0.27), track)
        self.assertEqual(scores[0]["meanErrorKm"], 30)

    def test_verified_at_is_a_full_timestamp(self):
        """유료 보고서·CSV 에 잘린 시각('2026-07-01 06')을 내보내지 않는다."""
        track = MODULE._final_track(_HISTORY, "Testy", 2026)
        scores = MODULE._score(self._groups(track), track)
        for row in scores[0]["byLead"]:
            self.assertTrue(row["verifiedAt"].endswith("Z"), row["verifiedAt"])
            self.assertIsNotNone(MODULE.iso_time(row["verifiedAt"]))

    def test_no_actual_track_returns_empty(self):
        """best track 이 없으면 오차를 지어내지 않는다."""
        self.assertEqual(MODULE._score([{"agency": "X", "issued": "2026-07-01T00:00:00Z"}], []), [])


class BackfillTest(unittest.TestCase):
    """이미 FINAL_REPORT 로 굳은 보고서를 다시 채점하는가.

    ⚠️ 파싱만 고치면 **새 태풍만** 채점된다. 위 분기가 VERIFYING/PRELIMINARY 에서만
       채점하기 때문에, 2026-09-02 당시 이미 FINAL 이던 22건은 영원히 빈 채로 남는다.
       이 테스트가 그 재채점 경로를 지킨다.
    """

    def _run(self, session):
        """update_lifecycle 을 S3 없이 돌리고 (세션, 공개보고서) 를 돌려준다."""
        state = {"schema": 1, "sessions": [session]}
        docs = {MODULE.SESSION_KEY: state, MODULE.OFFICIAL_KEY: {}, MODULE.ECMWF_KEY: {}}
        published = {}

        real_safe, real_put, real_s3 = MODULE._safe_s3, MODULE.put, MODULE.s3
        MODULE._safe_s3 = lambda key, default: docs.get(key, default)
        MODULE.put = lambda key, doc, maxage: published.__setitem__(key, doc)
        MODULE.s3 = types.SimpleNamespace(put_object=lambda **kw: None)
        try:
            now = MODULE.datetime(2026, 9, 2, tzinfo=MODULE.timezone.utc)
            tracks = {"storms": [{"id": "WP012026", "name": "Testy", "live": False,
                                  "lastSeen": "2026-07-02T18:00:00Z", "track": []}]}
            MODULE.update_lifecycle(now, tracks, [], _HISTORY)
        finally:
            MODULE._safe_s3, MODULE.put, MODULE.s3 = real_safe, real_put, real_s3
        return published.get(MODULE.REPORT_KEY, {})

    def _session(self, **over):
        track = MODULE._final_track(_HISTORY, "Testy", 2026)
        steps = [{"h": h, "lat": track[i]["lat"], "lon": track[i]["lon"]}
                 for h, i in ((6, 1), (12, 2), (24, 4))]
        base = {
            "id": "WP012026", "name": "Testy", "status": "FINAL_REPORT",
            "detectedAt": "2026-07-01T00:00:00Z", "endedAt": "2026-07-02T18:00:00Z",
            "scores": [],
            "snapshots": [{"issuedAt": track[0]["at"], "algorithmVersion": 2,
                           "forecasts": [{"agency": "TEST", "issued": track[0]["at"],
                                          "steps": steps}]}],
            "events": [],
        }
        base.update(over)
        return base

    def test_empty_scores_on_final_report_are_refilled(self):
        report = self._run(self._session())
        scores = report["reports"][0]["scores"]
        self.assertTrue(scores, "이미 FINAL 인 보고서의 빈 오차표가 다시 채워지지 않는다")
        self.assertEqual(scores[0]["n"], 3)

    def test_existing_scores_are_not_recomputed_away(self):
        """이미 채점된 보고서는 건드리지 않는다."""
        kept = [{"agency": "OLD", "n": 9, "meanErrorKm": 42, "byLead": []}]
        report = self._run(self._session(scores=kept))
        self.assertEqual(report["reports"][0]["scores"], kept)


if __name__ == "__main__":
    unittest.main()
