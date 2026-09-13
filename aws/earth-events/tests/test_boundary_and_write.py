# -*- coding: utf-8 -*-
"""공개 경계와 쓰기 — 3G 는 공개 승격을 하지 않는다 (결정 ①⑨).

정본은 `archive/earth-events/canonical/v1/` 아래다. `events/` 는 **익명 공개** 접두사이고
(`aws/_shared/publication_privacy.py` BUCKET_PUBLIC_PREFIXES), 거기 쓰는 순간 초안이 공개된다.
2026-09-13 실측으로 배포 엔진에서 같은 구멍이 있었다 — 후보 8건 중 7건이 익명 공개 대상이었다.
"""
import os
import pathlib
import tempfile
import unittest

import fixtures as fx

import assembler                                       # noqa: E402
import publication_privacy as priv                     # noqa: E402

h = fx.load_handler()


class CanonicalKeyShape(unittest.TestCase):
    def test_canonical_key_matches_decision_one(self):
        """⑮ 정본 키는 결정 ① 그대로다."""
        key = assembler.canonical_key("evt_" + "0" * 20)
        self.assertEqual(key, "archive/earth-events/canonical/v1/event_id=evt_%s.json"
                              % ("0" * 20))
        self.assertEqual(priv.prefix_visibility(key), "PRIVATE")

    def test_canonical_key_refuses_foreign_id(self):
        """⑯ 우리 형식이 아닌 id 로 키를 만들지 않는다 — 남의 주소 공간에 쓰지 않는다."""
        for bad in ("CNT-2026-000001", "evt_short", "evt_" + "0" * 21, "", None):
            with self.assertRaises(assembler.AssemblyError):
                assembler.canonical_key(bad)


class PublicWriteRefused(unittest.TestCase):
    def test_public_prefix_is_refused(self):
        """⑰ 공개 접두사 쓰기는 거부된다 — 3G 는 `events/` 에 쓰지 않는다."""
        for key in ("events/earth-events.json", "events/global.json",
                    "app/index.html", "reports/published/x.json"):
            with self.assertRaises(assembler.PublicWriteRefused):
                assembler.assert_not_public(key)

    def test_unknown_prefix_is_refused(self):
        """⑱ 모르는 접두사도 거부된다 — 모르는 것을 안전하다고 하지 않는다."""
        for key in ("earth-events/x.json", "tmp/x.json", ""):
            with self.assertRaises(assembler.PublicWriteRefused):
                assembler.assert_not_public(key)

    def test_private_prefix_passes(self):
        """⑲ PRIVATE 접두사만 지난다."""
        self.assertEqual(
            assembler.assert_not_public("archive/earth-events/canonical/v1/x.json"),
            "PRIVATE")


class WriteModeGate(unittest.TestCase):
    def test_live_mode_is_refused_without_approval(self):
        """⑳ LIVE 쓰기는 승인 표시 없이 거부된다."""
        with self.assertRaises(assembler.LiveWriteRefused):
            assembler.write_canonical([], mode=assembler.LIVE)

    def test_unknown_mode_is_refused(self):
        """㉑ 모르는 모드는 거부된다 — 기본값으로 눌러 담지 않는다."""
        with self.assertRaises(assembler.AssemblyError):
            assembler.write_canonical([], mode="PROD")

    def test_no_writer_writes_nothing(self):
        """㉒ 판독·기록기를 주지 않으면 **아무것도 쓰지 않는다** — 쓰기 계획만 만든다.

        `AWS_WRITE = 0` 을 코드로 보장하는 자리다.
        """
        result = fx.assemble(fx.document([fx.gdelt_event()]))
        write = result["stages"]["CANONICAL_WRITE"]
        self.assertEqual(write["written"], 0)
        self.assertTrue(write["wroteNothing"])
        self.assertEqual(write["count"], 1)
        self.assertFalse(write["objects"][0]["written"])
        self.assertEqual(result["stages"]["HEALTH"]["awsWrites"], 0)

    def test_live_handler_needs_both_payload_and_env(self):
        """㉓ 핸들러의 LIVE 문은 payload 와 환경변수를 **둘 다** 요구한다."""
        source = pathlib.Path(tempfile.mkdtemp()) / "global.json"
        source.write_text(_json(fx.document([fx.gdelt_event()])), encoding="utf-8")
        previous = os.environ.pop(h.ALLOW_LIVE_ENV, None)
        try:
            with self.assertRaises(assembler.LiveWriteRefused):
                h.handler({"localInput": str(source), "mode": "LIVE",
                           "dryRun": False, "allowLive": True,
                           "nowEpoch": fx.now_for()})
        finally:
            if previous is not None:
                os.environ[h.ALLOW_LIVE_ENV] = previous

    def test_staging_write_needs_an_explicit_directory(self):
        """㉔ STAGING 쓰기도 어디에 쓸지 지어내지 않는다."""
        source = pathlib.Path(tempfile.mkdtemp()) / "global.json"
        source.write_text(_json(fx.document([fx.gdelt_event()])), encoding="utf-8")
        with self.assertRaises(assembler.AssemblyError):
            h.handler({"localInput": str(source), "dryRun": False,
                       "nowEpoch": fx.now_for()})


class StagingWrite(unittest.TestCase):
    def test_staging_writes_only_under_the_private_prefix(self):
        """㉕ staging 쓰기는 같은 키 구조를 쓰고, `events/` 아래에는 아무것도 만들지 않는다."""
        staging = pathlib.Path(tempfile.mkdtemp())
        source = staging / "global.json"
        source.write_text(_json(fx.document([fx.gdelt_event()])), encoding="utf-8")
        result = h.handler({"localInput": str(source), "dryRun": False,
                            "stagingDir": str(staging / "out"),
                            "nowEpoch": fx.now_for()})
        self.assertEqual(result["summary"]["canonicalWritten"], 1)
        self.assertEqual(result["summary"]["publicWrites"], 0)
        written = sorted(p.relative_to(staging / "out").as_posix()
                         for p in (staging / "out").rglob("*.json"))
        self.assertEqual(len(written), 1)
        self.assertTrue(written[0].startswith("archive/earth-events/canonical/v1/event_id=evt_"))
        self.assertFalse((staging / "out" / "events").exists())

    def test_release_state_is_always_shadow(self):
        """㉖ 산출물은 항상 SHADOW / PRIVATE 이고 공개 승격이 허용되지 않는다 (결정 ⑨)."""
        result = fx.assemble(fx.document([fx.gdelt_event()]))
        event = result["events"][0]
        document = result["documents"][0]
        self.assertEqual(event["release_state"], "SHADOW")
        self.assertFalse(event["public_release_allowed"])
        self.assertEqual(document["visibility"], "PRIVATE")
        self.assertEqual(document["releaseState"], "SHADOW")
        # v11 contracts.js:18 과 같은 판정이어야 한다
        self.assertFalse(assembler.public_release_allowed("SHADOW"))
        self.assertTrue(assembler.public_release_allowed("ACTIVE"))
        self.assertTrue(assembler.public_release_allowed("CANARY"))

    def test_canonical_document_refuses_non_shadow(self):
        """㉗ SHADOW 가 아닌 산출물은 정본 문서로 만들어지지 않는다."""
        result = fx.assemble(fx.document([fx.gdelt_event()]))
        event = dict(result["events"][0])
        event["release_state"] = "ACTIVE"
        with self.assertRaises(assembler.AssemblyError):
            assembler.canonical_document(event, envelope=result["envelope"],
                                        freshness=result["stages"]["FRESHNESS"])


def _json(document):
    import json
    return json.dumps(document, ensure_ascii=False)


if __name__ == "__main__":
    unittest.main(verbosity=2)
