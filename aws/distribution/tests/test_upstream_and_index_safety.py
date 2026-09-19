# -*- coding: utf-8 -*-
"""상류 실패와 색인 덮어쓰기 — 재실행·상류 장애로 기존 산출물이 오염되지 않는지 본다.

고친 결함 두 가지 (둘 다 2026-09-13 실측으로 확인됐다)

① FAILURE 를 EMPTY 로 읽었다
   `_get()` 두 번의 실패를 `problems` 목록에 담고 **그대로 진행**했다. 상류가 죽은 날
   "오늘은 사건이 없다"는 후보 0건 산출물이 만들어지고, 그것이 이미 올라가 있던
   색인을 덮어썼다. `aws/gfs-cloud-forecast/handler.py:35` 의 정직 규칙과 어긋난다 —
   "받지 못한 스텝은 매니페스트에 넣지 않는다. 빈 프레임을 만들지 않는다."

② 색인을 새로 만들었다
   `build_index(contents)` 가 이번 실행분만으로 색인을 만들고 무조건 put 했다.
   패키지 전체에 `get_object` 가 0건이어서 병합이 구조적으로 불가능했다.
   `aws/report-engine/publisher.py:110-134` 가 같은 문제를 같은 방법으로 이미 풀어 뒀다 —
   "색인을 새로 만들지 않는다. 있는 것을 읽어서 더한다."

⚠️ AWS 를 건드리지 않는다. `_get` 은 픽스처로, S3 는 호출을 기록하는 대역으로 바꾼다.
   대역은 검사를 우회하기 위한 것이 아니라 **쓰기 횟수를 세기 위한** 것이다 —
   실제 S3 에 쓰면 운영 데이터가 바뀐다.
"""
import io
import json
import os
import sys
import unittest

HERE = os.path.dirname(os.path.abspath(__file__))
FN = os.path.dirname(HERE)
AWS = os.path.dirname(FN)
sys.path.insert(0, FN)
sys.path.insert(0, os.path.join(AWS, "_shared"))

import generator as gen                         # noqa: E402
import handler                                  # noqa: E402

# 2026-09-13 08:15 최초 LIVE 실행이 운영에 실제로 만든 8개 contentId.
# 이 시험이 지키는 것: 어떤 재실행도 이 여덟을 색인에서 지우지 않는다.
LIVE_20260913_IDS = (
    "CNT-172c678c20da", "CNT-1cd5f3f8507a", "CNT-354b74ac6d0a", "CNT-438be48bc9a6",
    "CNT-527bf7dc57dd", "CNT-6feba80e1725", "CNT-d6a801150425", "CNT-e58229b3f778",
)


class _S3Error(Exception):
    """botocore ClientError 와 같은 모양 — 코드로 갈래를 판별하는지 보기 위해."""

    def __init__(self, code):
        super().__init__("An error occurred (%s)" % code)
        self.response = {"Error": {"Code": code}}


class FakeS3:
    def __init__(self, objects=None, get_error=None):
        self.objects = dict(objects or {})
        self.puts = []
        self.get_error = get_error

    def put_object(self, **kw):
        self.puts.append(kw)
        self.objects[kw["Key"]] = kw["Body"]

    def get_object(self, Bucket=None, Key=None):
        if self.get_error:
            raise _S3Error(self.get_error)
        if Key not in self.objects:
            raise _S3Error("NoSuchKey")
        return {"Body": io.BytesIO(self.objects[Key])}

    def put_keys(self):
        return [p["Key"] for p in self.puts]


def report(rid, *, day="2026-09-13", kind="earthquake", title=None):
    return {"id": rid, "reportId": rid, "kind": kind,
            "title": title or ("M5.0 %s" % rid), "status": "FINAL",
            "lastSeen": "%sT00:00:00Z" % day,
            "detail": {"headline": "시험", "facts": [{"label": "규모", "value": 5.0}],
                       "position": {"lat": 35.0, "lon": 133.0},
                       "timeline": [{"at": "%sT00:00:00Z" % day}]}}


def lab(*reports):
    return {"generatedAt": "2026-09-13T00:00:00Z", "reports": list(reports)}


VERIFY = {"collectingSince": "2026-09-01", "leadsHours": [24], "days": {}}


def seeded_index(ids, *, generated="2026-09-13T08:15:48Z"):
    """운영에 올라가 있는 색인을 흉내낸 문서. items 는 판정에 쓰이는 필드만."""
    return {"schemaVersion": "earthus.distribution-index.v1", "generated": generated,
            "count": len(ids),
            "items": [{"contentId": i, "title": "이전 실행 %s" % i, "status": "DRAFT",
                       "eligibility": "REVIEW_REQUIRED", "publicEligible": False,
                       "publicWithheldReason": "자격 판정이 REVIEW_REQUIRED — 허용 목록에 없다"}
                      for i in ids],
            "publicItems": [], "summary": {}, "coverage": {}}


class Harness:
    """`_get` 과 `_s3` 를 바꿔 끼운다. 원래 것은 반드시 되돌린다."""

    def __init__(self, *, lab_doc=None, verify_doc=None, s3=None, raise_on=None):
        # 목록이면 정상 리포트 목록으로 감싼다. 사전·문자열 등은 **그대로** 넘긴다
        # (모양이 틀린 상류를 흉내내기 위한 것이므로 고쳐 주면 시험이 무의미해진다).
        self.lab_doc = lab(*lab_doc) if isinstance(lab_doc, list) and all(
            isinstance(x, dict) for x in lab_doc) else lab_doc
        self.verify_doc = VERIFY if verify_doc is None else verify_doc
        self.s3 = s3 if s3 is not None else FakeS3()
        self.raise_on = raise_on or {}

    def __enter__(self):
        self._get, self._s3 = handler._get, handler._s3

        def fake_get(url):
            if url in self.raise_on:
                raise self.raise_on[url]
            return self.lab_doc if url == handler.LAB_REPORTS else self.verify_doc

        handler._get, handler._s3 = fake_get, (lambda: self.s3)
        return self

    def __exit__(self, *exc):
        handler._get, handler._s3 = self._get, self._s3
        return False


class UpstreamFailureTests(unittest.TestCase):
    """요구 1·2·3 — 실패는 EMPTY 가 아니다. 쓰기가 한 건도 없어야 한다."""

    def test_1_upstream_get_failure_writes_nothing(self):
        from urllib.error import URLError
        s3 = FakeS3(objects={handler.INDEX_KEY: json.dumps(
            seeded_index(LIVE_20260913_IDS), ensure_ascii=False).encode()})
        with Harness(lab_doc=[report("lab-1")], s3=s3,
                     raise_on={handler.LAB_REPORTS: URLError("연결 실패")}):
            with self.assertRaises(handler.UpstreamError) as caught:
                handler.handler({"date": "2026-09-13"})
        self.assertIn("lab-reports", str(caught.exception))
        self.assertEqual([], s3.put_keys(), "상류가 죽으면 한 건도 쓰지 않는다")

    def test_2_json_parse_failure_writes_nothing(self):
        s3 = FakeS3()
        with Harness(lab_doc=[report("lab-1")], s3=s3,
                     raise_on={handler.VERIFY_DAILY: ValueError("Expecting value: line 1")}):
            with self.assertRaises(handler.UpstreamError) as caught:
                handler.handler({"date": "2026-09-13"})
        self.assertIn("verify-daily", str(caught.exception))
        self.assertEqual([], s3.put_keys())

    def test_3_schema_error_writes_nothing(self):
        """200 으로 왔는데 내용이 딴 것일 때 — '자료 없음' 으로 읽지 않는다."""
        cases = [
            ("객체가 아니다", ["목록이 왔다"]),
            ("키가 없다", {"generatedAt": "2026-09-13T00:00:00Z"}),
            ("자료형이 다르다", {"reports": {"이건": "사전"}}),
        ]
        for label, bad in cases:
            s3 = FakeS3()
            with Harness(lab_doc=bad, s3=s3):
                with self.assertRaises(handler.UpstreamError, msg=label):
                    handler.handler({"date": "2026-09-13"})
            self.assertEqual([], s3.put_keys(), label)

    def test_3b_a_bad_verify_shape_also_stops(self):
        s3 = FakeS3()
        with Harness(lab_doc=[report("lab-1")], verify_doc={"days": []}, s3=s3):
            with self.assertRaises(handler.UpstreamError):
                handler.handler({"date": "2026-09-13"})
        self.assertEqual([], s3.put_keys())

    def test_3c_an_unreadable_existing_index_stops_before_writing(self):
        """색인을 못 읽으면 모른다고 말한다 — publisher.current_index 와 같은 규칙."""
        s3 = FakeS3(get_error="AccessDenied")
        with Harness(lab_doc=[report("lab-1")], s3=s3):
            with self.assertRaises(handler.UpstreamError) as caught:
                handler.handler({"date": "2026-09-13"})
        self.assertIn("AccessDenied", str(caught.exception))
        self.assertEqual([], s3.put_keys(), "읽기 장애가 기존 목록을 지우면 안 된다")


class ValidEmptyTests(unittest.TestCase):
    """요구 4 — 상류는 살아 있고 결과가 정말 0건인 경우."""

    def test_4_valid_empty_on_a_fresh_bucket_writes_only_an_empty_index(self):
        s3 = FakeS3()
        with Harness(lab_doc=[], s3=s3):
            out = handler.handler({"date": "2026-09-13"})
        self.assertTrue(out["ok"])
        self.assertEqual(0, out["count"])
        self.assertEqual([handler.INDEX_KEY], s3.put_keys(), "본문은 없고 색인만")
        idx = json.loads(s3.objects[handler.INDEX_KEY])
        self.assertEqual(0, idx["count"])
        self.assertEqual([], idx["publicItems"])

    def test_4b_valid_empty_does_not_erase_an_existing_index(self):
        """**이것이 핵심이다.** 오늘 사건이 없다고 어제 목록이 사라지면 안 된다."""
        s3 = FakeS3(objects={handler.INDEX_KEY: json.dumps(
            seeded_index(LIVE_20260913_IDS), ensure_ascii=False).encode()})
        with Harness(lab_doc=[], s3=s3):
            out = handler.handler({"date": "2026-09-14"})
        self.assertTrue(out["ok"])
        self.assertEqual(0, out["count"], "이번 실행이 만든 것은 0건")
        idx = json.loads(s3.objects[handler.INDEX_KEY])
        self.assertEqual(8, idx["count"], "그러나 색인은 여덟을 그대로 들고 있다")
        self.assertEqual(sorted(LIVE_20260913_IDS),
                         sorted(i["contentId"] for i in idx["items"]))
        self.assertEqual([], out["wroteIds"])
        self.assertEqual(sorted(LIVE_20260913_IDS), sorted(out["carriedIds"]))


class FirstCreationTests(unittest.TestCase):
    """요구 5 — 색인이 없을 때."""

    def test_5_first_run_creates_bodies_and_index(self):
        s3 = FakeS3()
        with Harness(lab_doc=[report("lab-1"), report("lab-2")], s3=s3):
            out = handler.handler({"date": "2026-09-13"})
        self.assertTrue(out["ok"])
        self.assertEqual(2, out["count"])
        self.assertFalse(out["indexExisted"])
        self.assertEqual(3, len(s3.puts), "본문 2 + 색인 1")
        self.assertIn(handler.INDEX_KEY, s3.put_keys())
        for key in s3.put_keys():
            self.assertTrue(key.startswith("archive/"), key)
        idx = json.loads(s3.objects[handler.INDEX_KEY])
        self.assertEqual(2, idx["count"])


class ReplayTests(unittest.TestCase):
    """요구 6·7·10 — 재실행과 다른 날짜가 기존 색인을 오염시키지 않는다."""

    def test_6_same_input_rerun_keeps_the_same_keys_and_count(self):
        s3 = FakeS3()
        docs = [report("lab-1"), report("lab-2")]
        with Harness(lab_doc=docs, s3=s3):
            first = handler.handler({"date": "2026-09-13"})
        keys_after_first = sorted(set(s3.put_keys()))
        s3.puts.clear()
        with Harness(lab_doc=docs, s3=s3):
            second = handler.handler({"date": "2026-09-13"})
        self.assertEqual(sorted(set(s3.put_keys())), keys_after_first,
                         "같은 입력은 같은 키만 만진다 — 새 키가 쌓이지 않는다")
        self.assertEqual(first["count"], second["count"])
        idx = json.loads(s3.objects[handler.INDEX_KEY])
        self.assertEqual(2, idx["count"], "색인이 부풀지 않는다")
        self.assertTrue(second["indexExisted"])
        self.assertEqual([], second["carriedIds"], "둘 다 이번 실행이 갈아치웠다")

    def test_7_a_different_date_does_not_evict_earlier_items(self):
        s3 = FakeS3(objects={handler.INDEX_KEY: json.dumps(
            seeded_index(LIVE_20260913_IDS), ensure_ascii=False).encode()})
        with Harness(lab_doc=[report("lab-new", day="2026-09-20")], s3=s3):
            out = handler.handler({"date": "2026-09-20"})
        idx = json.loads(s3.objects[handler.INDEX_KEY])
        ids = {i["contentId"] for i in idx["items"]}
        for old in LIVE_20260913_IDS:
            self.assertIn(old, ids, "%s 가 사라졌다" % old)
        self.assertEqual(9, idx["count"], "여덟 + 새것 하나")
        self.assertEqual(1, len(out["wroteIds"]))
        self.assertEqual(8, len(out["carriedIds"]))

    def test_10_the_real_20260913_live_result_survives_every_case(self):
        """운영에 실제로 있는 여덟이 어떤 갈래에서도 색인에서 빠지지 않는다."""
        seed = json.dumps(seeded_index(LIVE_20260913_IDS), ensure_ascii=False).encode()
        cases = {
            "정상 empty (다음 날)": ([], "2026-09-14"),
            "새 사건 하나": ([report("lab-new", day="2026-09-21")], "2026-09-21"),
            "과거 날짜 replay": ([report("lab-old", day="2026-09-01")], "2026-09-01"),
        }
        for label, (docs, date) in cases.items():
            s3 = FakeS3(objects={handler.INDEX_KEY: seed})
            with Harness(lab_doc=docs, s3=s3):
                handler.handler({"date": date})
            idx = json.loads(s3.objects[handler.INDEX_KEY])
            ids = {i["contentId"] for i in idx["items"]}
            self.assertTrue(set(LIVE_20260913_IDS) <= ids, "%s 에서 유실됐다" % label)
        # 상류 실패 갈래는 아예 쓰지 않는다 — 색인이 원본 그대로다
        from urllib.error import URLError
        s3 = FakeS3(objects={handler.INDEX_KEY: seed})
        with Harness(lab_doc=[], s3=s3, raise_on={handler.LAB_REPORTS: URLError("끊김")}):
            with self.assertRaises(handler.UpstreamError):
                handler.handler({"date": "2026-09-14"})
        self.assertEqual(seed, s3.objects[handler.INDEX_KEY], "바이트 하나도 안 바뀐다")


class ProductRuleTests(unittest.TestCase):
    """요구 8 — MAX_DAILY 는 제품 규칙이다. 고친 것이 이것을 바꾸지 않았다."""

    def test_8_max_daily_still_caps_at_eight(self):
        many = [report("lab-%02d" % i, day="2026-09-13") for i in range(20)]
        cands = handler.build_candidates(lab(*many), VERIFY, today="2026-09-13")
        self.assertEqual(8, len(cands), "상한이 여전히 여덟이다")
        self.assertEqual(8, handler.MAX_DAILY)

    def test_8b_the_cap_reaches_the_write_path(self):
        many = [report("lab-%02d" % i, day="2026-09-13") for i in range(20)]
        s3 = FakeS3()
        with Harness(lab_doc=many, s3=s3):
            out = handler.handler({"date": "2026-09-13"})
        self.assertEqual(8, out["count"])
        self.assertEqual(9, len(s3.puts), "본문 8 + 색인 1")


class FreshnessWindowTests(unittest.TestCase):
    """00:00 UTC 예약 실행이 방금 끝난 하루를 본다 — 09-14~18 다섯 번 연속 0건의 재발 방지."""

    def test_midnight_run_sees_yesterday(self):
        cands = handler.build_candidates(lab(report("lab-y", day="2026-09-13")), VERIFY,
                                         today="2026-09-14")
        self.assertEqual(["lab-y"], [c["raw"]["id"] for c in cands])

    def test_two_days_old_is_not_fresh(self):
        cands = handler.build_candidates(lab(report("lab-old", day="2026-09-12")), VERIFY,
                                         today="2026-09-14")
        self.assertEqual([], cands)


class OrphanAndPublicTests(unittest.TestCase):
    """요구 9 — 고아 본문이 생겨도 공개로 새지 않는다."""

    def test_9_a_carried_item_is_never_marked_public(self):
        """이어받은 항목도 공개 자격 판정을 그대로 들고 온다 — 공개로 승격되지 않는다."""
        s3 = FakeS3(objects={handler.INDEX_KEY: json.dumps(
            seeded_index(LIVE_20260913_IDS), ensure_ascii=False).encode()})
        with Harness(lab_doc=[report("lab-new", day="2026-09-22")], s3=s3):
            out = handler.handler({"date": "2026-09-22"})
        idx = json.loads(s3.objects[handler.INDEX_KEY])
        self.assertEqual([], idx["publicItems"])
        self.assertEqual([], out["publicItems"])
        self.assertEqual([], [i["contentId"] for i in idx["items"] if i.get("publicEligible")])

    def test_9b_an_orphan_body_stays_on_the_private_prefix(self):
        """색인에서 빠진 본문도 비공개 접두사에 있다 — 위치가 공개를 정하지 않는다."""
        import publication_privacy as priv
        orphan = handler.BODY_PREFIX + "CNT-deadbeef0000.json"
        self.assertEqual("PRIVATE", priv.prefix_visibility(orphan))
        with self.assertRaises(RuntimeError):
            handler._assert_write_allowed(
                "events/distribution-content/CNT-deadbeef0000.json", {"status": "DRAFT"})

    def test_9c_every_written_key_is_private(self):
        s3 = FakeS3()
        with Harness(lab_doc=[report("lab-1")], s3=s3):
            handler.handler({"date": "2026-09-13"})
        import publication_privacy as priv
        for key in s3.put_keys():
            self.assertEqual("PRIVATE", priv.prefix_visibility(key), key)


class MergeUnitTests(unittest.TestCase):
    """merge_index 를 직접 — publisher.merge_index 와 같은 규약인지."""

    def test_no_existing_index_returns_the_fresh_one(self):
        fresh = seeded_index(("CNT-a",))
        self.assertIs(fresh, handler.merge_index(None, fresh))

    def test_same_id_is_replaced_not_duplicated(self):
        existing = seeded_index(("CNT-a", "CNT-b"), generated="2026-09-13T00:00:00Z")
        fresh = seeded_index(("CNT-a",), generated="2026-09-14T00:00:00Z")
        fresh["items"][0]["title"] = "새 판"
        out = handler.merge_index(existing, fresh)
        self.assertEqual(2, out["count"])
        by_id = {i["contentId"]: i for i in out["items"]}
        self.assertEqual("새 판", by_id["CNT-a"]["title"], "이번 실행 것으로 갈아친다")
        self.assertIn("CNT-b", by_id)

    def test_generation_records_what_was_touched(self):
        existing = seeded_index(("CNT-a", "CNT-b"))
        fresh = seeded_index(("CNT-a", "CNT-c"))
        out = handler.merge_index(existing, fresh)
        self.assertEqual(["CNT-a", "CNT-c"], out["generation"]["writtenIds"])
        self.assertEqual(["CNT-b"], out["generation"]["carriedIds"])

    def test_items_are_sorted_deterministically(self):
        out = handler.merge_index(seeded_index(("CNT-z",)), seeded_index(("CNT-a",)))
        self.assertEqual(["CNT-a", "CNT-z"], [i["contentId"] for i in out["items"]])


if __name__ == "__main__":
    unittest.main()
