# -*- coding: utf-8 -*-
"""S3 ↔ Postgres 일관성 validator (PHASE 3 STEP 4).

자격증명이 필요 없다. 판독기를 딕셔너리로 주입한다.
그리고 **FIXTURE PASS 가 운영 PASS 로 새지 않는지**를 시험이 직접 검사한다.
"""
import pathlib
import sys
import unittest

SHARED = pathlib.Path(__file__).parent.parent
sys.path.insert(0, str(SHARED))
import index_consistency as ic  # noqa: E402

SCHEMA = ic.SUPPORTED_SCHEMAS[0]
KEY_A = "events/earth-events/eq-us7000aaa.json"
KEY_B = "events/earth-events/tc-1000001.json"
SHA_A = "a" * 64
SHA_B = "b" * 64


def canonical(**overrides):
    base = {KEY_A: {"eventId": "eq-us7000aaa", "sha256": SHA_A, "schema": SCHEMA},
            KEY_B: {"eventId": "tc-1000001", "sha256": SHA_B, "schema": SCHEMA}}
    base.update(overrides)
    return base


def rows(*extra, drop=()):
    base = [{"eventId": "eq-us7000aaa", "canonicalS3Key": KEY_A, "canonicalSha256": SHA_A,
             "canonicalSchema": SCHEMA},
            {"eventId": "tc-1000001", "canonicalS3Key": KEY_B, "canonicalSha256": SHA_B,
             "canonicalSchema": SCHEMA}]
    base = [r for r in base if r["eventId"] not in drop]
    return base + list(extra)


def kinds(result):
    return sorted(f["kind"] for f in result["findings"])


class HappyPathTests(unittest.TestCase):
    def test_matching_canonical_and_index_pass(self):
        result = ic.check(canonical(), rows(), mode=ic.FIXTURE)
        self.assertEqual(ic.PASS, result["status"], result["findings"])
        self.assertEqual([], result["findings"])
        self.assertEqual({"canonical": 2, "indexRows": 2, "findings": 0, "blocking": 0}, result["counts"])
        self.assertEqual(ic.CONSISTENCY_SCHEMA, result["schema"])

    def test_empty_both_sides_pass(self):
        self.assertEqual(ic.PASS, ic.check({}, [], mode=ic.FIXTURE)["status"])


class BlockingTests(unittest.TestCase):
    def test_orphan_index_fails(self):
        """색인이 없는 S3 객체를 가리킨다 — 색인이 거짓말을 하고 있다."""
        extra = {"eventId": "eq-gone", "canonicalS3Key": "events/earth-events/eq-gone.json",
                 "canonicalSha256": "c" * 64, "canonicalSchema": SCHEMA}
        result = ic.check(canonical(), rows(extra), mode=ic.FIXTURE)
        self.assertEqual(ic.FAIL, result["status"])
        self.assertIn("ORPHAN_INDEX", kinds(result))

    def test_checksum_mismatch_fails(self):
        bad = rows(drop=("eq-us7000aaa",)) + [
            {"eventId": "eq-us7000aaa", "canonicalS3Key": KEY_A, "canonicalSha256": "9" * 64,
             "canonicalSchema": SCHEMA}]
        result = ic.check(canonical(), bad, mode=ic.FIXTURE)
        self.assertEqual(ic.FAIL, result["status"])
        self.assertIn("CHECKSUM_MISMATCH", kinds(result))

    def test_duplicate_canonical_event_fails(self):
        dupe = canonical()
        dupe["events/earth-events/eq-us7000aaa.copy.json"] = {
            "eventId": "eq-us7000aaa", "sha256": SHA_A, "schema": SCHEMA}
        result = ic.check(dupe, rows(), mode=ic.FIXTURE)
        self.assertEqual(ic.FAIL, result["status"])
        self.assertIn("DUPLICATE_CANONICAL", kinds(result))

    def test_duplicate_index_row_fails(self):
        result = ic.check(canonical(), rows(rows()[0]), mode=ic.FIXTURE)
        self.assertEqual(ic.FAIL, result["status"])
        self.assertIn("DUPLICATE_INDEX", kinds(result))

    def test_event_id_mismatch_fails(self):
        crossed = rows(drop=("tc-1000001",)) + [
            {"eventId": "tc-9999999", "canonicalS3Key": KEY_B, "canonicalSha256": SHA_B,
             "canonicalSchema": SCHEMA}]
        result = ic.check(canonical(), crossed, mode=ic.FIXTURE)
        self.assertEqual(ic.FAIL, result["status"])
        self.assertIn("EVENT_ID_MISMATCH", kinds(result))

    def test_canonical_without_event_id_fails(self):
        broken = canonical(**{KEY_A: {"sha256": SHA_A, "schema": SCHEMA}})
        result = ic.check(broken, rows(drop=("eq-us7000aaa",)), mode=ic.FIXTURE)
        self.assertEqual(ic.FAIL, result["status"])
        self.assertIn("EVENT_ID_MISMATCH", kinds(result))

    def test_unsupported_schema_fails(self):
        future = rows(drop=("tc-1000001",)) + [
            {"eventId": "tc-1000001", "canonicalS3Key": KEY_B, "canonicalSha256": SHA_B,
             "canonicalSchema": "earthus.earth-event.v99"}]
        result = ic.check(canonical(), future, mode=ic.FIXTURE)
        self.assertEqual(ic.FAIL, result["status"])
        self.assertIn("UNSUPPORTED_SCHEMA", kinds(result))

    def test_schema_disagreement_between_sides_fails(self):
        shifted = canonical(**{KEY_A: {"eventId": "eq-us7000aaa", "sha256": SHA_A,
                                       "schema": "earthus.earth-event.v0"}})
        result = ic.check(shifted, rows(), mode=ic.FIXTURE)
        self.assertEqual(ic.FAIL, result["status"])
        self.assertIn("UNSUPPORTED_SCHEMA", kinds(result))


class RebuildableTests(unittest.TestCase):
    def test_canonical_without_index_is_partial_not_fail(self):
        """S3 가 정본이므로 색인 누락은 다시 만들면 된다."""
        result = ic.check(canonical(), rows(drop=("tc-1000001",)), mode=ic.FIXTURE)
        self.assertEqual(ic.PARTIAL, result["status"])
        self.assertEqual(["MISSING_INDEX"], kinds(result))
        plan = ic.rebuild_plan(result)
        self.assertEqual([KEY_B], plan["reindex"])
        self.assertEqual([], plan["needsHuman"])

    def test_missing_checksum_is_partial(self):
        blank = rows(drop=("eq-us7000aaa",)) + [
            {"eventId": "eq-us7000aaa", "canonicalS3Key": KEY_A, "canonicalSha256": None,
             "canonicalSchema": SCHEMA}]
        result = ic.check(canonical(), blank, mode=ic.FIXTURE)
        self.assertEqual(ic.PARTIAL, result["status"])
        self.assertEqual(["MISSING_CHECKSUM"], kinds(result))

    def test_blocking_and_rebuildable_together_report_fail(self):
        extra = {"eventId": "eq-gone", "canonicalS3Key": "events/earth-events/eq-gone.json",
                 "canonicalSha256": "c" * 64, "canonicalSchema": SCHEMA}
        result = ic.check(canonical(), rows(extra, drop=("tc-1000001",)), mode=ic.FIXTURE)
        self.assertEqual(ic.FAIL, result["status"])
        plan = ic.rebuild_plan(result)
        self.assertEqual([KEY_B], plan["reindex"])
        self.assertEqual(1, len(plan["needsHuman"]))


class ReferenceTests(unittest.TestCase):
    def index_with_refs(self, ref):
        row = dict(rows()[0])
        row["timelineRefs"] = [{"kind": "SIMULATION", "ref": ref}]
        return [row] + rows(drop=("eq-us7000aaa",))

    def test_reference_check_is_recorded_as_skipped_when_no_set_is_given(self):
        """참조 집합을 주지 않았으면 '검사했다'고 적지 않는다."""
        result = ic.check(canonical(), self.index_with_refs("research-runtime:run-1"), mode=ic.FIXTURE)
        self.assertFalse(result["checks"]["referenceConsistent"])
        self.assertEqual(ic.PASS, result["status"])

    def test_resolvable_reference_passes(self):
        result = ic.check(canonical(), self.index_with_refs("research-runtime:run-1"), mode=ic.FIXTURE,
                          references={"simulationRuns": ["research-runtime:run-1"]})
        self.assertTrue(result["checks"]["referenceConsistent"])
        self.assertEqual(ic.PASS, result["status"])

    def test_dangling_reference_fails(self):
        result = ic.check(canonical(), self.index_with_refs("research-runtime:run-missing"), mode=ic.FIXTURE,
                          references={"simulationRuns": ["research-runtime:run-1"]})
        self.assertEqual(ic.FAIL, result["status"])
        self.assertIn("DANGLING_REFERENCE", kinds(result))


class ModeGuardTests(unittest.TestCase):
    def test_mode_is_required(self):
        with self.assertRaises(TypeError):
            ic.check(canonical(), rows())          # mode 기본값이 없다

    def test_unknown_mode_is_rejected(self):
        with self.assertRaises(ValueError):
            ic.check(canonical(), rows(), mode="MOCK")

    def test_mode_is_recorded_in_the_result(self):
        self.assertEqual(ic.FIXTURE, ic.check(canonical(), rows(), mode=ic.FIXTURE)["mode"])
        self.assertEqual(ic.LIVE, ic.check(canonical(), rows(), mode=ic.LIVE)["mode"])

    def test_fixture_pass_cannot_be_used_as_production_pass(self):
        """이 시험이 STEP 4 의 핵심 요구다: mock PASS ≠ production PASS."""
        fixture = ic.check(canonical(), rows(), mode=ic.FIXTURE)
        self.assertEqual(ic.PASS, fixture["status"])
        with self.assertRaises(ic.ConsistencyError) as error:
            ic.require_live(fixture)
        self.assertIn("FIXTURE", str(error.exception))

    def test_live_failure_is_also_refused(self):
        live = ic.check(canonical(), rows(drop=("tc-1000001",)), mode=ic.LIVE)
        self.assertEqual(ic.PARTIAL, live["status"])
        with self.assertRaises(ic.ConsistencyError):
            ic.require_live(live)

    def test_live_pass_is_accepted(self):
        live = ic.check(canonical(), rows(), mode=ic.LIVE)
        self.assertIs(live, ic.require_live(live))


if __name__ == "__main__":
    unittest.main()
