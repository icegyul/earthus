# -*- coding: utf-8 -*-
"""원자료 보관 — 같은 입력이면 **같은 바이트**, 실패하면 **아무것도 남기지 않는다**.

왜 이 파일이 까다로운가
  상류 `events/global.json` 은 30분마다 덮어쓰인다. 지금 보관하지 않으면 그 회차는 영원히
  사라지고, 나중에 판정 기준이 바뀌었을 때 다시 계산할 재료가 없다.
  그리고 보관이 회차마다 다른 바이트를 만들면 "같은 것을 두 번 보관했는지" 알 수 없다.
"""
import gzip
import pathlib
import tempfile
import unittest

import fixtures as fx

import assembler                                       # noqa: E402
import raw_archive as raw                              # noqa: E402

h = fx.load_handler()


class DeterministicBytes(unittest.TestCase):
    def test_same_input_gives_the_same_gzip_bytes(self):
        """① 같은 입력 → 같은 gzip 바이트. 실행 시각이 섞이면 깨진다."""
        document = fx.document([fx.gdelt_event(event_id="1"),
                                fx.gdelt_event(event_id="2", url="https://b.example.com/x")])
        body = fx.body_of(document)
        first = raw.build(document, source_key="events/global.json",
                          source_body=body, generated_iso=fx.GENERATED)
        second = raw.build(document, source_key="events/global.json",
                           source_body=body, generated_iso=fx.GENERATED)
        self.assertEqual(first["body"], second["body"])
        self.assertEqual(first["sha256"], second["sha256"])
        self.assertEqual(first["key"], second["key"])

    def test_same_input_gives_the_same_hash_through_the_pipeline(self):
        """② 조립기를 통째로 두 번 돌려도 원자료 해시가 같다."""
        document = fx.document([fx.gdelt_event()])
        a = fx.assemble(document)["stages"]["RAW_ARCHIVE"]
        b = fx.assemble(document)["stages"]["RAW_ARCHIVE"]
        self.assertEqual(a["sha256"], b["sha256"])
        self.assertEqual(a["key"] if "key" in a else a["object"], b["object"])

    def test_gzip_header_carries_no_timestamp(self):
        """③ gzip 머리말의 MTIME 4바이트가 0 이다 — 시각이 바이트에 섞이지 않는다."""
        body = raw.gzip_bytes("hello")
        self.assertEqual(body[0:2], b"\x1f\x8b")         # gzip 마법수
        self.assertEqual(body[4:8], b"\x00\x00\x00\x00")  # MTIME = 0
        self.assertEqual(body[9], raw.GZIP_OS_UNKNOWN)   # OS 바이트 고정
        self.assertEqual(raw.GZIP_MTIME, 0)

    def test_record_order_is_sorted_not_upstream_order(self):
        """④ 보관 순서는 상류 순서가 아니라 **정렬된 id 순서**다.

        ⚠️ 그래도 `sourceIndex` 로 원래 자리를 남기므로, 상류가 같은 집합을 다른 순서로
           보내면 **바이트는 달라진다.** 그것이 맞다 — 그때는 상류 파일 자체가 다른 바이트이고
           (원본 sha256 도 다르다) 다른 키에 보관된다. 여기서 고정하는 것은
           "한 입력 안에서 순서가 결정적이다" 이고, 바이트 재현성은 ①②가 고정한다.
        """
        one = fx.gdelt_event(event_id="100000001")
        two = fx.gdelt_event(event_id="100000002", url="https://b.example.com/x")
        for document in (fx.document([one, two]), fx.document([two, one])):
            built = raw.build(document, source_key="k", source_body=fx.body_of(document),
                              generated_iso=fx.GENERATED)
            _, records = raw.read(built["body"])
            self.assertEqual([r["id"] for r in records],
                             ["100000001", "100000002"])      # 항상 정렬된 순서
        # 원래 자리는 잃지 않는다 — 역순 입력이면 sourceIndex 가 뒤집혀 있다
        reverse = fx.document([two, one])
        built = raw.build(reverse, source_key="k", source_body=fx.body_of(reverse),
                          generated_iso=fx.GENERATED)
        import gzip as _gzip
        import json as _json
        lines = _gzip.decompress(built["body"]).decode("utf-8").splitlines()
        seq = [_json.loads(line) for line in lines if '"EVENT"' in line]
        self.assertEqual([(row["seq"], row["sourceIndex"]) for row in seq],
                         [(0, 1), (1, 0)])

    def test_non_numeric_source_id_does_not_break_ordering(self):
        """⑤ 상류 id 가 숫자가 아니어도 정렬이 죽지 않는다(바이트 순서를 쓴다)."""
        odd = fx.gdelt_event(event_id="gd-α-1")
        built = raw.build(fx.document([odd, fx.gdelt_event(event_id="2")]),
                          source_key="k", source_body=b"x", generated_iso=fx.GENERATED)
        _, records = raw.read(built["body"])
        self.assertEqual(len(records), 2)


class KeyShape(unittest.TestCase):
    def test_key_matches_decision_one(self):
        """⑥ `archive/earth-events/raw/dt=YYYY-MM-DD/hh=HH/part-*.jsonl.gz`"""
        built = raw.build(fx.document([fx.gdelt_event()]), source_key="k",
                          source_body=b"body", generated_iso="2026-09-13T10:35:00Z")
        self.assertTrue(built["key"].startswith(
            "archive/earth-events/raw/dt=2026-09-13/hh=10/part-"))
        self.assertTrue(built["key"].endswith(".jsonl.gz"))
        import publication_privacy as priv
        self.assertEqual(priv.prefix_visibility(built["key"]), "PRIVATE")

    def test_part_name_comes_from_the_source_hash(self):
        """⑦ 이름이 내용에서 나온다 — 같은 입력은 같은 키, 다른 입력은 다른 키."""
        name = raw.part_name(raw.sha256_hex(b"body"))
        self.assertEqual(name, "part-%s.jsonl.gz" % raw.sha256_hex(b"body")[:12])
        self.assertNotEqual(raw.part_name(raw.sha256_hex(b"body")),
                            raw.part_name(raw.sha256_hex(b"other")))

    def test_partition_comes_from_the_envelope_not_the_clock(self):
        """⑧ 파티션은 봉투 시각으로 정한다 — 나중에 다시 돌려도 같은 칸이다."""
        self.assertEqual(raw.partition("2026-09-13T10:35:00Z"), "dt=2026-09-13/hh=10")
        self.assertEqual(raw.partition("2026-09-13T23:59:59Z"), "dt=2026-09-13/hh=23")
        # 시간대가 붙어 오면 UTC 로 옮겨서 본다
        self.assertEqual(raw.partition("2026-09-13T19:35:00+09:00"), "dt=2026-09-13/hh=10")

    def test_unreadable_generated_is_refused(self):
        """⑨ 시각을 못 읽으면 파티션을 지어내지 않는다."""
        for bad in (None, "", "어제", "2026-13-45T99:99:99Z"):
            with self.assertRaises(raw.RawArchiveError):
                raw.partition(bad)


class RoundTrip(unittest.TestCase):
    def test_archived_records_are_the_upstream_records_verbatim(self):
        """⑩ 해석하지 않는다 — 되읽으면 상류 레코드가 그대로 나온다."""
        record = fx.gdelt_event(event_id="777", title="Wildfire", alt=["https://b.ex/1"])
        built = raw.build(fx.document([record]), source_key="events/global.json",
                          source_body=b"body", generated_iso=fx.GENERATED)
        manifest, records = raw.read(built["body"])
        self.assertEqual(records, [record])
        self.assertEqual(manifest["type"], "MANIFEST")
        self.assertEqual(manifest["schema"], raw.SCHEMA)

    def test_manifest_records_the_source_and_provenance(self):
        """⑪ manifest 한 줄만 읽어도 무엇을 받았는지 안다 — 출처·해시·잘림까지."""
        document = fx.document([fx.gdelt_event()], capped=True)
        body = fx.body_of(document)
        built = raw.build(document, source_key="events/global.json",
                          source_body=body, generated_iso=fx.GENERATED)
        manifest, _ = raw.read(built["body"])
        self.assertEqual(manifest["source"]["key"], "events/global.json")
        self.assertEqual(manifest["source"]["sha256"], raw.sha256_hex(body))
        self.assertEqual(manifest["source"]["bytes"], len(body))
        self.assertEqual(manifest["source"]["provider"], "GDELT 2.0 Events")
        self.assertTrue(manifest["upstream"]["cappedByLimit"])
        self.assertTrue(manifest["provenance"]["resolved"])
        self.assertEqual(manifest["provenance"]["truthType"], "UNKNOWN")

    def test_corrupt_archive_is_refused_on_read(self):
        """⑫ 깨진 원자료를 조용히 통과시키지 않는다."""
        with self.assertRaises(raw.RawArchiveError):
            raw.read(b"not gzip at all")
        broken = gzip.compress(b'{"type":"EVENT","event":{}}\n')   # MANIFEST 없음
        with self.assertRaises(raw.RawArchiveError):
            raw.read(broken)


class FailureWritesNothing(unittest.TestCase):
    def test_malformed_input_writes_neither_raw_nor_canonical(self):
        """⑬ 깨진 입력 → 원자료 0 · 정본 0. 부분 결과를 남기지 않는다."""
        staging = pathlib.Path(tempfile.mkdtemp())
        for document in (fx.document([fx.gdelt_event()], source="GDACS 3.0"),
                         fx.document([fx.gdelt_event()], drop=("generated",)),
                         fx.document([fx.gdelt_event(), "사건이 아니다"])):
            source = staging / "in.json"
            source.write_text(fx.body_of(document).decode("utf-8"), encoding="utf-8")
            out = staging / "out"
            with self.assertRaises(assembler.AssemblyError):
                h.handler({"localInput": str(source), "dryRun": False,
                           "stagingDir": str(out), "nowEpoch": fx.now_for()})
            self.assertEqual(list(out.rglob("*")) if out.exists() else [], [],
                             "실패했는데 파일이 남았다")

    def test_unavailable_input_writes_nothing(self):
        """⑭ 입력을 못 읽으면 아무것도 쓰지 않는다."""
        staging = pathlib.Path(tempfile.mkdtemp())
        out = staging / "out"
        with self.assertRaises(h.InputUnavailable):
            h.handler({"localInput": str(staging / "없는파일.json"), "dryRun": False,
                       "stagingDir": str(out), "nowEpoch": fx.now_for()})
        self.assertFalse(out.exists())

    def test_raw_write_failure_blocks_canonical_write(self):
        """⑮ 원자료 쓰기가 실패하면 정본을 쓰지 않는다 (§12).

        재료를 못 남긴 정본은 다시 계산할 수 없는 정본이다.
        """
        document = fx.document([fx.gdelt_event()])
        wrote = []

        def writer(key, body):
            if key.startswith("archive/earth-events/raw/"):
                raise OSError("디스크가 꽉 찼다")
            wrote.append(key)

        with self.assertRaises(assembler.AssemblyError) as caught:
            fx.assemble(document, mode=assembler.STAGING, writer=writer)
        self.assertIn("원자료 쓰기 실패", str(caught.exception))
        self.assertEqual(wrote, [])

    def test_missing_source_body_blocks_everything(self):
        """⑯ 원본 본문이 없으면 조립을 끝내지 않는다 — 원자료를 만들 수 없기 때문이다."""
        import assembler as asm
        with self.assertRaises(asm.AssemblyError) as caught:
            asm.assemble(fx.document([fx.gdelt_event()]), now_epoch=fx.now_for(),
                         source_body=None)
        self.assertIn("원자료", str(caught.exception))


class Lineage(unittest.TestCase):
    def test_canonical_documents_point_at_the_raw_object(self):
        """⑰ 계보 — 정본이 자기를 만든 원자료 키와 해시를 들고 있다."""
        result = fx.assemble(fx.document([fx.gdelt_event()]))
        rawstage = result["stages"]["RAW_ARCHIVE"]
        document = result["documents"][0]
        self.assertEqual(document["input"]["rawObject"], rawstage["object"])
        self.assertEqual(document["input"]["rawSha256"], rawstage["sha256"])
        self.assertEqual(document["input"]["sourceSha256"], rawstage["sourceSha256"])
        self.assertTrue(result["stages"]["CANONICAL_OUTPUT"]["lineageComplete"])

    def test_raw_archive_runs_before_canonical_write(self):
        """⑱ 단계 순서가 계보 방향과 같다 — 원자료가 정본보다 앞이다."""
        stages = list(assembler.STAGES)
        self.assertLess(stages.index("RAW_ARCHIVE"), stages.index("CANONICAL_OUTPUT"))
        self.assertLess(stages.index("RAW_ARCHIVE"), stages.index("CANONICAL_WRITE"))
        self.assertEqual(len(stages), 16)

    def test_staging_writes_raw_and_canonical_under_private_only(self):
        """⑲ staging 산출물은 원자료 1 + 정본 n 이고, 전부 `archive/` 아래다."""
        staging = pathlib.Path(tempfile.mkdtemp())
        source = staging / "global.json"
        document = fx.document([fx.gdelt_event()])
        source.write_text(fx.body_of(document).decode("utf-8"), encoding="utf-8")
        out = staging / "out"
        result = h.handler({"localInput": str(source), "dryRun": False,
                            "stagingDir": str(out), "nowEpoch": fx.now_for()})
        written = sorted(p.relative_to(out).as_posix() for p in out.rglob("*")
                         if p.is_file())
        self.assertEqual(len(written), 2, written)
        self.assertTrue(any(p.startswith("archive/earth-events/raw/dt=") for p in written))
        self.assertTrue(any(p.startswith("archive/earth-events/canonical/v1/") for p in written))
        for path in written:
            self.assertTrue(path.startswith("archive/"), path)
        self.assertEqual(result["summary"]["publicWrites"], 0)
        self.assertTrue(result["summary"]["rawWritten"])

    def test_written_raw_object_reads_back_to_the_same_events(self):
        """⑳ 실제로 쓴 파일을 다시 읽어 상류 레코드가 복원되는지 확인한다."""
        staging = pathlib.Path(tempfile.mkdtemp())
        source = staging / "global.json"
        record = fx.gdelt_event(event_id="424242")
        document = fx.document([record])
        source.write_text(fx.body_of(document).decode("utf-8"), encoding="utf-8")
        out = staging / "out"
        h.handler({"localInput": str(source), "dryRun": False,
                   "stagingDir": str(out), "nowEpoch": fx.now_for()})
        part = next(p for p in out.rglob("*.jsonl.gz"))
        manifest, records = raw.read(part.read_bytes())
        self.assertEqual(records, [record])
        self.assertEqual(manifest["archived"]["eventCount"], 1)


class DryRunWritesNothing(unittest.TestCase):
    def test_dry_run_plans_raw_without_writing(self):
        """㉑ dryRun 은 원자료도 쓰지 않는다 — 계획과 해시만 만든다."""
        result = fx.assemble(fx.document([fx.gdelt_event()]))
        rawstage = result["stages"]["RAW_ARCHIVE"]
        self.assertFalse(rawstage["written"])
        self.assertIsNotNone(rawstage["sha256"])
        self.assertEqual(result["stages"]["HEALTH"]["awsWrites"], 0)
        self.assertFalse(result["stages"]["HEALTH"]["rawWritten"])
        self.assertEqual(result["stages"]["HEALTH"]["status"], "SUCCESS")

    def test_live_raw_write_is_refused_without_approval(self):
        """㉒ 원자료도 LIVE 문을 지난다 — 승인 없이 운영에 쓰지 않는다."""
        with self.assertRaises(assembler.LiveWriteRefused):
            assembler.archive_raw(fx.document([fx.gdelt_event()]), source_body=b"x",
                                  generated_iso=fx.GENERATED, mode=assembler.LIVE)


if __name__ == "__main__":
    unittest.main(verbosity=2)
