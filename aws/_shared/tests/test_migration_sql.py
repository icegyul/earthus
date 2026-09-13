# -*- coding: utf-8 -*-
"""마이그레이션 SQL 구조 검증 (PHASE 3 STEP 3).

DB 없이 파일만 읽어 검사한다. Postgres 문법(jsonb·domain·generated identity)은 SQLite 로 실행할 수
없으므로, 실행 대신 **구조 계약**을 검사한다: 기본키·외래키·인덱스·유일성·nullability·역호환·계보 제약.

그리고 두 곳은 **실제 코드와 교차대조**한다 — 어휘를 SQL 에 베껴 쓰고 한쪽만 고치는 사고를 막는다:
  · DATA_STATE 4종        ← prototype/js/earthus2/v11/core/contracts.js
  · 중복제거 관계 4종      ← aws/_shared/article_dedup.RELATIONS
"""
import pathlib
import re
import sys
import unittest

SHARED = pathlib.Path(__file__).parent.parent
REPO = SHARED.parent.parent
sys.path.insert(0, str(SHARED))
import article_dedup as dd  # noqa: E402

SQL_PATH = SHARED / "sql" / "20260913_earth_event_core.sql"

# 적용된 마이그레이션이 이미 만든 표. 이 파일이 손대면 안 된다.
EXISTING_TABLES = (
    "admins", "staff_roles", "admin_audit_log", "member_invites", "member_access_audit",
    "analytics_events", "usage_counters", "usage_daily", "forme_funnel_daily",
    "provider_registry", "provider_credential_meta", "provider_health",
    "earthus_forecast_revisions", "earthus_forecast_release_audit",
    "aetherus_personal_universes", "aetherus_personal_records", "aetherus_observation_archives",
    "aetherus_privacy_events", "aetherus_data_subject_requests", "aetherus_deletion_receipts",
)


def raw():
    return SQL_PATH.read_text(encoding="utf-8")


def executable():
    """주석을 지운 본문. 되돌리기 블록은 주석이므로 여기서 사라진다."""
    return "\n".join(re.sub(r"--.*$", "", line) for line in raw().splitlines())


def created_tables(text):
    return re.findall(r"create table if not exists public\.([a-z_]+)", text)


def table_body(text, name):
    start = text.index(f"create table if not exists public.{name}")
    depth, index = 0, text.index("(", start)
    for position in range(index, len(text)):
        if text[position] == "(":
            depth += 1
        elif text[position] == ")":
            depth -= 1
            if depth == 0:
                return text[index:position + 1]
    raise AssertionError(f"{name}: 괄호가 닫히지 않았다")


class FilePlacementTests(unittest.TestCase):
    def test_sql_exists_and_is_not_in_the_applied_migrations_directory(self):
        self.assertTrue(SQL_PATH.exists(), SQL_PATH)
        applied = REPO / "prototype" / "supabase" / "migrations"
        self.assertTrue(applied.is_dir())
        self.assertNotIn("earth_event_core", " ".join(p.name for p in applied.iterdir()),
                         "적용되지 않은 초안을 적용된 것들 사이에 두면 다음 사람이 적용된 줄로 읽는다")

    def test_header_says_it_is_not_applied(self):
        head = raw()[:2000]
        self.assertIn("ADDITIVE CONTRACT ONLY", head)
        self.assertIn("아직 적용하지 않았다", head)


class StructureTests(unittest.TestCase):
    def setUp(self):
        self.text = executable()
        self.tables = created_tables(self.text)

    def test_all_targets_from_the_directive_are_present(self):
        expected = {
            "earthus_earth_event", "earthus_event_relation", "earthus_news_article", "earthus_source",
            "earthus_claim", "earthus_evidence_node", "earthus_event_timeline",
            "earthus_context_snapshot", "earthus_impact_assessment",
            # 계보·중복 구조
            "earthus_article_dedup_group", "earthus_article_lineage",
        }
        self.assertTrue(expected <= set(self.tables), expected - set(self.tables))

    def test_every_create_table_is_if_not_exists(self):
        plain = re.findall(r"create table (?!if not exists)", self.text)
        self.assertEqual([], plain, "재실행 안전해야 한다")

    def test_every_create_index_is_if_not_exists(self):
        plain = re.findall(r"create (?:unique )?index (?!if not exists)", self.text)
        self.assertEqual([], plain)

    def test_every_table_has_a_primary_key(self):
        for name in self.tables:
            with self.subTest(table=name):
                self.assertIn("primary key", table_body(self.text, name), name)

    def test_every_foreign_key_targets_a_table_this_file_creates(self):
        targets = set(re.findall(r"references public\.([a-z_]+)", self.text))
        self.assertTrue(targets, "외래키가 하나도 없다면 색인 층이 아니다")
        self.assertTrue(targets <= set(self.tables), targets - set(self.tables))

    def test_it_does_not_touch_the_existing_tables(self):
        for name in EXISTING_TABLES:
            with self.subTest(table=name):
                self.assertNotIn(f"alter table public.{name}", self.text)
                self.assertNotIn(f"drop table public.{name}", self.text)
                self.assertNotIn(f"drop table if exists public.{name}", self.text)

    def test_no_destructive_statement_outside_the_commented_rollback(self):
        for forbidden in ("drop table", "drop index", "truncate", "delete from", "alter table"):
            with self.subTest(statement=forbidden):
                self.assertNotIn(forbidden, self.text,
                                 f"{forbidden} 은 되돌리기 주석 안에만 있어야 한다")

    def test_rollback_block_exists_but_is_commented_out(self):
        text = raw()
        self.assertIn("되돌리기 (down migration)", text)
        # 되돌리기 구문은 주석 줄에만 있어야 한다
        for line in text.splitlines():
            if "drop table if exists public.earthus_" in line:
                self.assertTrue(line.strip().startswith("--"), line)
        # 이 파일이 만든 표 전부에 대한 drop 이 준비돼 있어야 한다
        dropped = set(re.findall(r"--\s*drop table if exists public\.([a-z_]+);", text))
        self.assertTrue(set(self.tables) <= dropped, set(self.tables) - dropped)

    def test_uniqueness_and_indexes_on_the_lookup_paths(self):
        self.assertIn("earthus_earth_event_canonical_key_uidx", self.text)      # 한 S3 키 = 한 사건
        self.assertIn("earthus_earth_event_source_uidx", self.text)             # 원본 사건 중복 색인 금지
        self.assertIn("unique (from_event_id, to_event_id, relation_type)", self.text)
        self.assertIn("unique (event_id, kind, at, title)", self.text)
        self.assertIn("unique (event_id, captured_at)", self.text)


class VocabularyTests(unittest.TestCase):
    """어휘를 SQL 에 베껴 쓰고 한쪽만 고치는 사고를 막는다."""

    def setUp(self):
        self.text = executable()

    def check_values(self, domain_or_column):
        pattern = rf"{domain_or_column}[^;]*?check \(\s*(?:value|[a-z_]+) in \(([^)]*)\)"
        match = re.search(pattern, self.text, re.DOTALL)
        self.assertIsNotNone(match, domain_or_column)
        return {v.strip().strip("'") for v in match.group(1).split(",")}

    def test_truth_status_is_the_eight_confirmed_values(self):
        self.assertEqual({"FACT", "CORROBORATED", "REPORTED", "CLAIM",
                          "INFERRED", "FORECAST", "SIMULATION", "UNKNOWN"},
                         self.check_values("earthus_truth_status as text"))

    def test_source_kind_is_the_six_confirmed_values(self):
        self.assertEqual({"OFFICIAL", "OBSERVATION", "SATELLITE", "NEWS", "OSINT", "MODEL"},
                         self.check_values("earthus_source_kind as text"))

    def test_data_state_matches_the_v11_contract_in_code(self):
        """교차대조 ①: 저장소의 DATA_STATES 를 읽어서 비교한다."""
        contracts = (REPO / "prototype" / "js" / "earthus2" / "v11" / "core" / "contracts.js"
                     ).read_text(encoding="utf-8")
        listed = re.search(r"DATA_STATES\s*=\s*Object\.freeze\(\[([^\]]*)\]", contracts)
        self.assertIsNotNone(listed)
        from_code = {v.strip().strip("'\"") for v in listed.group(1).split(",") if v.strip()}
        self.assertEqual(from_code, self.check_values("earthus_data_state as text"))

    def test_dedup_relations_match_the_module_in_code(self):
        """교차대조 ②: article_dedup.RELATIONS 를 읽어서 비교한다."""
        match = re.search(r"relation\s+text not null check \(relation in \(([^)]*)\)", self.text)
        self.assertIsNotNone(match)
        from_sql = {v.strip().strip("'") for v in match.group(1).split(",")}
        self.assertEqual(set(dd.RELATIONS), from_sql)

    def test_event_relation_has_the_six_confirmed_values_and_no_confirmed_causal(self):
        match = re.search(r"relation_type\s+text\s+not null\s*check \(relation_type in \(([^)]*)\)",
                          self.text, re.DOTALL)
        self.assertIsNotNone(match)
        values = {v.strip().strip("'") for v in match.group(1).split(",")}
        self.assertEqual({"TEMPORAL", "SPATIAL", "CORRELATED",
                          "POSSIBLE_CASCADE", "MODELLED_CASCADE", "UNKNOWN"}, values)
        self.assertNotIn("CONFIRMED_CAUSAL", values)

    def test_confirmed_causal_is_absent_from_every_executable_statement(self):
        """DECISION 2: 이번 범위에서 도입하지 않는다.

        주석에는 **있어야 한다** — 왜 빼는지 적어 두지 않으면 다음 사람이 그냥 추가한다
        (report_contract.py 가 FORBIDDEN_NOTES 로 같은 일을 한다). 그래서
        실행되는 문장에는 없고 설명은 남아 있는지를 둘 다 검사한다.
        """
        self.assertNotIn("CONFIRMED_CAUSAL", self.text, "실행되는 SQL 에는 없어야 한다")
        self.assertIn("CONFIRMED_CAUSAL", raw(), "왜 빼는지 주석으로 남아 있어야 한다")
        self.assertIn("도입하지 않는다", raw())

    def test_timeline_kinds_are_the_eight_adopted_ones(self):
        match = re.search(r"kind\s+text not null\s*check \(kind in \(([^)]*)\)", self.text)
        self.assertIsNotNone(match)
        values = {v.strip().strip("'") for v in match.group(1).split(",")}
        self.assertEqual({"ARTICLE", "EVIDENCE", "OBSERVATION", "WARNING",
                          "FORECAST", "IMPACT", "SIMULATION", "SYSTEM"}, values)

    def test_evidence_kinds_are_the_v11_eight(self):
        contracts = (REPO / "prototype" / "js" / "earthus2" / "v11" / "core" / "contracts.js"
                     ).read_text(encoding="utf-8")
        listed = re.search(r"EVIDENCE_KINDS\s*=\s*Object\.freeze\(\[([^\]]*)\]", contracts)
        from_code = {v.strip().strip("'\"") for v in listed.group(1).split(",") if v.strip()}
        match = re.search(r"evidence_kind\s+text not null\s*check \(evidence_kind in \(([^)]*)\)",
                          self.text, re.DOTALL)
        from_sql = {v.strip().strip("'") for v in match.group(1).split(",")}
        self.assertEqual(from_code, from_sql)


class HonestyConstraintTests(unittest.TestCase):
    """"값을 지어내지 않는다" 를 스키마로 박았는지 검사한다."""

    def setUp(self):
        self.text = executable()

    def test_news_article_has_no_body_or_summary_column(self):
        body = table_body(self.text, "earthus_news_article")
        for forbidden in (" content ", " body ", " summary ", " full_text ", "content text", "summary text"):
            self.assertNotIn(forbidden, body, f"기사 본문·요약을 저장하지 않는다: {forbidden!r}")

    def test_simulation_run_is_not_replicated_into_postgres(self):
        self.assertNotIn("create table if not exists public.earthus_simulation_run", self.text)
        for name in created_tables(self.text):
            self.assertNotIn("simulation_run(", table_body(self.text, name))
        # 참조는 불투명 문자열 하나만 허용한다
        self.assertIn("simulation_run_ref text", self.text)

    def test_modelled_cascade_requires_a_simulation_reference(self):
        self.assertIn("relation_type <> 'MODELLED_CASCADE' or simulation_run_ref is not null", self.text)

    def test_impact_numbers_require_a_model(self):
        body = table_body(self.text, "earthus_impact_assessment")
        self.assertIn("model_ref is not null", body)
        self.assertIn("assumptions", body)
        self.assertIn("uncertainty", body)
        self.assertIn("truth_status not in ('FACT','CORROBORATED')", body)

    def test_location_doubt_blocks_confirmation(self):
        self.assertIn("not location_doubt or truth_status not in ('FACT','CORROBORATED')", self.text)

    def test_conflicting_claim_cannot_be_corroborated(self):
        self.assertIn("conflict is null or truth_status <> 'CORROBORATED'", self.text)

    def test_claim_label_requires_passing_the_gate(self):
        self.assertIn("(gate_result->>'allowed')::boolean is true", self.text)

    def test_dedup_group_counts_as_exactly_one_independent_source(self):
        body = table_body(self.text, "earthus_article_dedup_group")
        self.assertIn("independence_units integer not null default 1 check (independence_units = 1)", body)

    def test_lineage_root_relation_is_constrained(self):
        self.assertIn("(article_id = root_article_id) = (relation = 'ORIGINAL')", self.text)

    def test_everything_starts_private(self):
        self.assertIn("earthus_release_state not null default 'SHADOW'", self.text)

    def test_consistency_audit_records_fixture_versus_live(self):
        body = table_body(self.text, "earthus_index_consistency_audit")
        self.assertIn("mode in ('FIXTURE','LIVE')", body)

    def test_coordinates_are_complete_or_absent(self):
        self.assertIn("(latitude is null) = (longitude is null)", self.text)


if __name__ == "__main__":
    unittest.main()
