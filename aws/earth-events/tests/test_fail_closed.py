# -*- coding: utf-8 -*-
"""FAIL-CLOSED — 실패를 빈 결과로 바꾸지 않는다.

이 파일이 지키는 한 문장: **FAILURE ≠ EMPTY.**
상류가 죽은 날 "사건 없음"이 정본을 덮어쓴 일이 이 저장소에 실제로 있었다
(커밋 f2eaf85f). 같은 경로를 3G 에서 되풀이하지 않는다.

자격증명이 필요 없다. S3 는 판독기를 주입해 흉내 낸다.
"""
import pathlib
import tempfile
import unittest

import fixtures as fx

import assembler                                       # noqa: E402

h = fx.load_handler()


class BrokenS3:
    """get_object 가 실패하는 판독기. NoSuchKey·AccessDenied 를 구별하지 않는다."""

    def __init__(self, error):
        self.error = error
        self.calls = []

    def get_object(self, **kwargs):
        self.calls.append(kwargs)
        raise self.error


class OkS3:
    def __init__(self, body):
        self.body = body

    def get_object(self, **kwargs):
        class _Body:
            def __init__(self, data):
                self.data = data

            def read(self):
                return self.data
        return {"Body": _Body(self.body)}


class InputUnreadable(unittest.TestCase):
    def test_missing_local_file_is_failure_not_empty(self):
        """① 입력 파일이 없으면 실패다. 빈 사건 목록을 만들지 않는다."""
        with self.assertRaises(h.InputUnavailable):
            h.read_input(local=str(pathlib.Path(tempfile.gettempdir()) / "없는파일-3g.json"))

    def test_s3_error_is_failure_not_empty(self):
        """② S3 오류는 전부 실패다 — 403 과 404 를 구별해 한쪽을 '없음'으로 읽지 않는다."""
        s3 = BrokenS3(RuntimeError("AccessDenied"))
        with self.assertRaises(h.InputUnavailable):
            h.read_input(s3)
        self.assertEqual(len(s3.calls), 1)

    def test_non_json_input_is_failure(self):
        """③ JSON 이 아니면 실패다. 깨진 본문에서 건질 수 있는 것을 건지지 않는다."""
        with self.assertRaises(h.InputUnavailable):
            h.read_input(OkS3(b"<html>503</html>"))


class EnvelopeGuard(unittest.TestCase):
    def test_unknown_source_is_failure(self):
        """④ 다른 출처 파일을 읽고 있으면 실패다."""
        doc = fx.document([fx.gdelt_event()], source="GDACS 3.0")
        with self.assertRaises(assembler.AssemblyError):
            fx.assemble(doc)

    def test_missing_generated_is_failure(self):
        """⑤ `generated` 가 없으면 시간을 복원할 수 없다 — 실패다."""
        doc = fx.document([fx.gdelt_event()], drop=("generated",))
        with self.assertRaises(assembler.AssemblyError):
            fx.assemble(doc)

    def test_future_generated_is_failure(self):
        """⑥ 봉투가 미래를 말하면 실패다 — 나이가 음수가 되면 신선도 판정이 무의미하다."""
        doc = fx.document([fx.gdelt_event()])
        with self.assertRaises(assembler.AssemblyError):
            fx.assemble(doc, ahead_min=-120.0)

    def test_stale_input_is_failure_not_empty(self):
        """⑦ 창(3시간)보다 오래된 파일은 지금을 말하지 않는다 — 실패다."""
        doc = fx.document([fx.gdelt_event()])
        with self.assertRaises(assembler.StaleInputError):
            fx.assemble(doc, ahead_min=60 * 3 + 1)

    def test_events_not_a_list_is_failure(self):
        """⑧ `events` 가 목록이 아니면 실패다."""
        doc = fx.document([])
        doc["events"] = {"1": {}}
        with self.assertRaises(assembler.AssemblyError):
            fx.assemble(doc)


class PartialAssemblyRefused(unittest.TestCase):
    def test_one_broken_event_fails_the_batch(self):
        """⑨ 사건 하나가 깨지면 **전체**가 실패다. 나머지로 정본을 만들지 않는다.

        깨진 것을 빼고 쓰면 그 산출물은 '그때 있던 사건 전부'가 아닌데 색인은 전부라고 말한다.
        """
        good = fx.gdelt_event(event_id="1")
        broken = fx.gdelt_event(event_id="2")
        broken.pop("id")                                # 상류 id 가 없는 레코드
        doc = fx.document([good, broken])
        with self.assertRaises(assembler.AssemblyError):
            fx.assemble(doc)

    def test_non_object_event_fails_the_batch(self):
        """⑩ 사건 자리에 객체가 아닌 것이 오면 실패다."""
        doc = fx.document([fx.gdelt_event(), "사건이 아니다"])
        with self.assertRaises(assembler.AssemblyError):
            fx.assemble(doc)


class NormalEmptyIsNotFailure(unittest.TestCase):
    def test_zero_events_is_normal_empty(self):
        """⑪ 사건이 0건인 정상 입력은 **정상 empty** 다 — 예외가 아니다.

        그리고 그때도 쓰기는 0 이고, 색인 검사는 지나간다.
        """
        result = fx.assemble(fx.document([]))
        health = result["stages"]["HEALTH"]
        self.assertEqual(result["events"], [])
        self.assertTrue(health["normalEmpty"])
        self.assertEqual(health["canonicalWritten"], 0)
        self.assertEqual(health["publicWrites"], 0)
        self.assertEqual(result["stages"]["INDEX_CONSISTENCY"]["status"],
                         "PASS")
        self.assertEqual(result["stages"]["FRESHNESS"]["eventCount"], 0)

    def test_normal_empty_still_archives_raw_and_records_provenance(self):
        """⑫ 사건이 0건이어도 **원자료는 보관한다.**

        "그 시각에 상류가 0건을 보냈다"도 사실이고, 판정 기준이 바뀌어 다시 계산할 때
        그 사실이 필요하다. 보관하지 않으면 그 시각은 영원히 빈칸으로 남는다
        (상류 `events/global.json` 은 30분마다 덮어쓰인다).
        """
        result = fx.assemble(fx.document([]))
        raw = result["stages"]["RAW_ARCHIVE"]
        self.assertTrue(raw["prefix"].startswith("archive/earth-events/raw/dt="))
        self.assertTrue(raw["object"].endswith(".jsonl.gz"))
        self.assertEqual(raw["eventCount"], 0)
        self.assertEqual(raw["lines"], 1)               # MANIFEST 한 줄만
        prov = result["stages"]["FRESHNESS"]["provenance"]
        self.assertTrue(prov["resolved"])
        self.assertEqual(prov["truthType"], "UNKNOWN")  # 결정 ⑫


class TruncatedInputIsRecorded(unittest.TestCase):
    def test_capped_input_is_not_a_failure_but_is_marked(self):
        """⑬ 상류가 잘랐다면(cappedByLimit) 실패는 아니지만 **전부라고 말하지 않는다.**"""
        doc = fx.document([fx.gdelt_event()], capped=True)
        result = fx.assemble(doc)
        self.assertTrue(result["stages"]["FRESHNESS"]["truncated"])
        self.assertTrue(result["stages"]["HEALTH"]["truncatedInput"])
        document = result["documents"][0]
        self.assertTrue(document["input"]["truncated"])
        self.assertIn("전부가 아니다", document["input"]["truncatedNote"])

    def test_uncapped_input_has_no_truncation_note(self):
        """⑭ 잘리지 않았으면 잘렸다고 적지 않는다."""
        result = fx.assemble(fx.document([fx.gdelt_event()]))
        self.assertFalse(result["stages"]["FRESHNESS"]["truncated"])
        self.assertIsNone(result["documents"][0]["input"]["truncatedNote"])


if __name__ == "__main__":
    unittest.main(verbosity=2)
