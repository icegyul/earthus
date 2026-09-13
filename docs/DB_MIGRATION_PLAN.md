# DB 마이그레이션 계획 — EarthEvent 색인

작성 2026-09-13 · PHASE 3 STEP 3
대상 SQL `aws/_shared/sql/20260913_earth_event_core.sql`
관련 [EARTHUS_STORAGE_ARCHITECTURE.md](EARTHUS_STORAGE_ARCHITECTURE.md) ·
[EARTH_EVENT_CANONICAL_MODEL.md](EARTH_EVENT_CANONICAL_MODEL.md) §7

## 상태: **PARTIAL**

| 항목 | 상태 | 근거 |
|---|---|---|
| SQL 작성 | **PASS** | 표 15개 · 도메인 4개 · 인덱스·제약 완비 |
| 구조 검증 | **PASS** | `test_migration_sql.py` 31개 통과 · 어휘 2건은 실제 코드와 교차대조 |
| 되돌리기 준비 | **PASS** | 표 15개 전부에 대한 `drop` 이 주석으로 준비돼 있고 시험이 확인 |
| **실제 적용** | **BLOCKED** | Supabase CLI 없음 · DB 자격 없음. 적용은 사람이 SQL Editor 에서 한다 |
| **적용 후 검증** | **미실시** | 위와 같은 이유 |

**아직 적용하지 않았다.** 이 문서는 적용 계획이고, 적용 결과가 아니다.

---

## 1. 파일 위치와 그 이유

```
aws/_shared/sql/20260913_earth_event_core.sql      ← 지금 (적용 전 초안)
prototype/supabase/migrations/<타임스탬프>_earth_event_core.sql   ← 적용할 때 복사
```

`prototype/supabase/migrations/` 는 **적용된** 마이그레이션 15개가 사는 곳이다.
적용되지 않은 초안을 그 사이에 두면 다음 사람이 적용된 줄로 읽는다.
`prototype/js/earthus2/v11/postgres/*.sql`(미적용 DDL 초안 3개)이 같은 이유로 밖에 있고,
이 파일도 그 선례를 따른다. 시험이 이 배치를 검사한다
(`test_sql_exists_and_is_not_in_the_applied_migrations_directory`).

## 2. 만드는 것 — 표 15개

| # | 표 | 역할 | 정본은 어디 |
|---|---|---|---|
| 1 | `earthus_source` | 출처 (얇은 조인 표) | `provider_registry` · `provenance.DATASET_PROVENANCE` |
| 2 | `earthus_earth_event` | 사건 색인 | **S3** `events/earth-events/<event_id>.json` |
| 3 | `earthus_event_relation` | 사건↔사건 관계 (6종) | Postgres |
| 4 | `earthus_news_article` | 기사 메타데이터 | **S3** `events/global.json` 등 |
| 5 | `earthus_article_dedup_group` | 중복 묶음 | Postgres |
| 6 | `earthus_article_lineage` | 기사 계보 (관계 4종) | Postgres |
| 7 | `earthus_evidence_node` | 증거 노드 | Postgres |
| 8 | `earthus_evidence_edge` | 증거 관계 (9종) | Postgres |
| 9 | `earthus_event_evidence` | 사건↔증거 | Postgres |
| 10 | `earthus_claim` | 주장 | Postgres |
| 11 | `earthus_claim_evidence` | 주장↔증거 | Postgres |
| 12 | `earthus_event_timeline` | 타임라인 (8종) | **S3**(사건 파일 안) + 여기 색인 |
| 13 | `earthus_context_snapshot` | 문맥 포인터 | **S3** `events/context/…`(불변) |
| 14 | `earthus_impact_assessment` | 영향 | Postgres |
| 15 | `earthus_index_consistency_audit` | 일관성 감사 기록 | Postgres |

도메인 4개: `earthus_truth_status`(8) · `earthus_source_kind`(6) · `earthus_data_state`(4) ·
`earthus_release_state`(3). 표마다 CHECK 를 베껴 쓰지 않고 도메인으로 박았다 —
베끼면 한 곳만 고쳐지는 사고가 난다.

### 2.1 `simulation_run` 표는 **없다**

`SimulationRun` 원장은 research-runtime SQLite 다. Postgres 에 복제하지 않는다.
타임라인·관계·영향이 실행을 가리킬 때는 **불투명한 참조 문자열 하나**만 둔다:

```
simulation_run_ref text      -- {runtime}:{runId}
```

모델 id·버전·manifest·검증값을 옮겨 적지 않는다. 그것을 알아야 하면 원장에서 읽는다.
시험이 이를 검사한다(`test_simulation_run_is_not_replicated_into_postgres`).

## 3. 구조 계약 — 무엇을 명시했나

### 3.1 기본키

15개 표 전부 `primary key` 가 있다(시험 `test_every_table_has_a_primary_key`).
연결 표 4개는 복합 PK 다: `earthus_evidence_edge(from,to,relation)` ·
`earthus_event_evidence(event_id,evidence_id)` · `earthus_claim_evidence(claim_id,evidence_id)`.

### 3.2 외래키

전부 이 파일이 만드는 표를 가리킨다(시험 `test_every_foreign_key_targets_a_table_this_file_creates`).
기존 19개 표를 참조하지 않는다 — `provider_registry` 연결은 FK 가 아니라
`provider_ref text` 로 느슨하게 둔다(그 표를 이 스키마가 잠그지 않게).

`on delete` 정책:

| 관계 | 정책 | 이유 |
|---|---|---|
| 사건 → 관계·타임라인·증거연결·주장·문맥·영향 | `cascade` | 사건이 사라지면 그 부속도 의미가 없다 |
| 기사 → 계보 | `cascade` | 같은 이유 |
| 기사 → 사건 (`event_id`) | `set null` | 사건이 사라져도 **기사는 남는다** (지우지 않는다) |
| 타임라인 → 기사 (`article_id`) | `set null` | 같은 이유 |
| 증거 → 출처 | `restrict` | 증거가 붙은 출처를 지울 수 없다 — 근거 사슬이 끊긴다 |
| 기사 → 출처 | `restrict` | 같은 이유 |

### 3.3 유일성

```
earthus_earth_event_canonical_key_uidx   (canonical_s3_key)            한 S3 키 = 한 사건
earthus_earth_event_source_uidx          (source_system, source_event_id)  원본 사건 중복 색인 금지
earthus_event_relation_directed          (from, to, relation_type)     한 방향만 저장
earthus_event_timeline_unique            (event_id, kind, at, title)
earthus_context_snapshot_unique          (event_id, captured_at)
earthus_article_dedup_group_root_unique  (root_article_id)             뿌리는 묶음 하나에만
```

### 3.4 nullability — "모른다" 를 0 으로 채우지 않는다

시각 4분법(`intel-feed.js` F01 기록)을 스키마로 지킨다:

```
occurred_at   nullable   일어난 때 — 모를 수 있다
issued_at     nullable   기관 발표 때
updated_at    nullable   갱신 때
retrieved_at  NOT NULL   우리가 받은 때 — 이것만은 항상 안다
```

좌표는 둘 다 있거나 둘 다 없다: `check ((latitude is null) = (longitude is null))`.
한쪽만 있는 좌표는 지도에서 0도로 찍힌다.

### 3.5 인덱스 (조회 경로)

```
사건   (kind, occurred_at desc) · (lifecycle, updated_at desc) · (phenomenon_id) 부분 · (release_state)
관계   (from_event_id) · (to_event_id) · (relation_type)
기사   (event_id) · (source_id, published_at desc) · (normalized_url)
계보   (dedup_group_id) · (root_article_id) · (relation)
증거   (source_id) · (evidence_kind, observed_at desc) · 엣지 (to_evidence_id)
주장   (event_id) · (truth_status)
타임라인 (event_id, at) · (kind) · (simulation_run_ref) 부분
문맥   (event_id, captured_at desc)
영향   (event_id) · (status)
출처   (independence_group) · (source_kind)
```

### 3.6 계보 제약

```
earthus_article_lineage_root_is_original
  check ((article_id = root_article_id) = (relation = 'ORIGINAL'))
  → 뿌리는 자기를 가리키고 관계가 ORIGINAL 이다. 그 밖은 ORIGINAL 이 될 수 없다.

earthus_article_lineage_inferred_is_not_high
  → TRANSLATION_OF·REWRITE_OF 는 본문 없이 한 추정이므로 HIGH 로 올릴 수 없다.
    단 basis 에 url-identity·content-identity 가 있으면 예외(확정적 근거가 있다).

earthus_article_dedup_group
  independence_units integer not null default 1 check (independence_units = 1)
  → 묶음 하나가 독립 출처 1 이다. gdelt-events 결함 ① 재발 방지.
```

### 3.7 "값을 지어내지 않는다" 를 제약으로 박은 것 (시험 12개가 확인)

| 제약 | 막는 것 |
|---|---|
| `earthus_news_article` 에 본문·요약 칸 **없음** | 저작권 (`regional-news` 머리말) |
| `not location_doubt or truth_status not in ('FACT','CORROBORATED')` | 위치를 못 믿는 사건의 확정 승격 |
| `conflict is null or truth_status <> 'CORROBORATED'` | 충돌 중인 주장의 교차검증 주장 |
| `label is null or (gate_result->>'allowed')::boolean is true` | 게이트 미통과 주장의 화면 노출 |
| `relation_type <> 'MODELLED_CASCADE' or simulation_run_ref is not null` | 근거 없는 연쇄 인과 |
| `CONFIRMED_CAUSAL` 값 부재 (실행 문장에) | 인과 단정 우회로 |
| `(exposed_population is null and exposed_assets is null) or model_ref is not null` | 근거 없는 노출 인구 숫자 |
| `status <> 'MODELLED' or model_ref is not null` | 모델 없는 MODELLED 표시 |
| `truth_status not in ('FACT','CORROBORATED')` (영향) | 영향을 관측으로 표시 |
| `jsonb_array_length(assumptions) > 0` · `uncertainty > 0` | 가정·불확실성 없는 영향 |
| `status <> 'COMPLETE' or jsonb_array_length(provenance) > 0` | 무엇을 읽었는지 못 대는 COMPLETE |
| `(kind = 'SIMULATION') = (simulation_run_ref is not null)` | 실행 없는 SIMULATION 줄 |
| `earthus_event_relation_basis_not_empty` | 근거 없는 사건 관계 |
| `release_state default 'SHADOW'` | 기본 공개 |

## 4. 역호환

| 항목 | 보장 |
|---|---|
| 재실행 | 전부 `create table/index if not exists` · 도메인은 `pg_type` 존재 확인 후 생성 |
| 기존 19개 표 | `alter`·`drop` **0건** (시험 `test_it_does_not_touch_the_existing_tables`) |
| 이름 충돌 | 없음 (2026-09-13 실측: 기존 19개와 겹치는 이름 0) |
| 파괴적 문장 | 실행 구간에 `drop`·`truncate`·`delete from`·`alter` **0건** (시험이 검사) |
| 기본 공개 여부 | 만들어지는 모든 사건 행이 `SHADOW` |
| 개인정보 | 없음. 사건은 공개 자료이므로 RLS 가 필요한 표가 없다 |
| 트랜잭션 | `begin; … commit;` 로 감싸 부분 적용을 막는다 |

## 5. 적용 절차 (사람이 한다)

```
1. Supabase SQL Editor 를 연다 (프로젝트 ref: ltpupicvdijxkrxxsfky)
2. aws/_shared/sql/20260913_earth_event_core.sql 전체를 붙여 실행한다
   ⚠️ 맨 끝 "되돌리기" 주석 블록은 주석이므로 함께 붙여도 실행되지 않는다
3. 성공하면 표 15개 · 도메인 4개가 생긴다. 다음으로 확인한다:
     select table_name from information_schema.tables
      where table_schema='public' and table_name like 'earthus_%' order by 1;
4. 이 파일을 prototype/supabase/migrations/<YYYYMMDDHHMMSS>_earth_event_core.sql 로 복사해
   커밋한다. 그때부터 그 사본이 정본이다.
5. docs/DB_MIGRATION_PLAN.md 의 이 절에 적용 일시와 결과를 적는다.
```

적용 전 확인할 것:

```
· 같은 이름의 표가 이미 없는지 (3번 질의를 먼저 돌려 본다)
· v11/postgres/20260826_v11_advanced_intelligence.sql 을 **같이 적용하지 않는다.**
  그 파일의 겹치는 4개(evidence_node/edge · event_cluster/member)는 대체됐다(§7).
```

파일 맨 앞의 가드가 이 충돌을 **적용 시점에 다시 검사한다**(§7.1) — 이미 적용된 v11 표를 발견하면
`SCHEMA_CONFLICT` 로 중단하고 아무것도 만들지 않는다. 사람이 잊어도 조용히 망가지지 않는다.

## 6. 되돌리기

파일 맨 끝에 주석으로 준비돼 있다. 표 15개 + 도메인 4개를 참조 역순으로 지운다.
시험이 (a) 모든 생성 표에 대한 `drop` 이 준비돼 있고 (b) 그 줄이 전부 주석임을 검사한다.

```
되돌려도 잃는 것은 색인이다. EarthEvent 정본은 S3 에 있고,
events/earth-events.json 에서 색인을 다시 만들 수 있다. 그것이 S3 를 정본으로 둔 이유다.
```

## 7. v11 DDL 초안과의 중복 — **해결됨**

전문 비교와 결정은 [EVIDENCE_SCHEMA_RECONCILIATION.md](EVIDENCE_SCHEMA_RECONCILIATION.md) 에 있다.
여기에는 결론만 적는다.

**정본 = 이 파일.** v11 초안의 겹치는 4개 표는 **대체됨(superseded)** 이고 적용하지 않는다.

| 개념 | v11 초안 (대체됨) | 이 파일 (정본) |
|---|---|---|
| 증거 노드·관계 | `earthus_evidence_node` · `earthus_evidence_edge` | 같은 이름 (CHECK·FK·3축 파생값 추가) |
| 사건 | `earthus_event_cluster` + `…_member` | `earthus_earth_event` (+ `event_evidence` · `news_article.event_id` · `event_timeline`) |
| 그 밖 15개 | 여행·오염·기억·보정·릴리스 — **유효. 대체 대상 아님** | 없음 |

정본으로 고른 근거 6개 (전문은 화해 문서 §5):

1. 사용자가 "EarthEvent canonical source = S3, Postgres = index/trace" 를 확정했고,
   v11 설계에는 **S3 포인터 칸이 없다** → 그 결정을 담을 수 없다
2. v11 `confidence double precision (0~1)` 은 임의 신뢰도 퍼센트를 담을 자리다 —
   "임의 confidence percentage 를 생성하지 않는다"(PHASE 5)와 충돌
3. v11 `status` 한 칸이 생애와 진리를 섞는다 — ZIP `EventStatus` 에서 채택하지 않은 그 혼합
4. 이 파일은 `evidence.source_id` → `earthus_source` FK 가 있어 근거 사슬이 DB 수준에서 끊기지 않는다
5. v11 쪽에는 어휘 CHECK 가 없다 (DB 가 어휘 밖 값을 받는다)
6. **질의하는 코드가 0건** → 역호환 view·alias·단계적 이행이 필요 없다

### 7.1 조용히 망가지는 경로를 막았다 — 적용 전 가드

양쪽 다 `create table if not exists` 다. **v11 을 먼저 적용한 DB 에 이 파일을 돌리면
`create table` 이 no-op 으로 지나가고 아무 오류도 나지 않는다** — 파생 칸·FK·CHECK 가 빠진 채
"적용 성공"으로 보인다.

그래서 이 파일 맨 앞(`begin;` 직후, 어떤 표보다 먼저)에 가드를 넣었다:

```
① earthus_evidence_node 가 있는데 source_kind 칸이 없다   → SCHEMA_CONFLICT 로 중단
② earthus_event_cluster 가 이미 있다                      → SCHEMA_CONFLICT 로 중단
③ earthus_earth_event 가 있는데 canonical_s3_key 가 없다   → SCHEMA_CONFLICT 로 중단
```

가드는 **고치지 않고 멈춘다.** `alter`·`drop` 을 실행하지 않으며,
전체가 한 트랜잭션이므로 예외가 나면 아무것도 만들어지지 않는다.
시험 6개가 이를 검사한다(`test_migration_sql.py::ConflictGuardTests`).

### 7.2 v11 초안 파일은 수정하지 않았다

두 사본(`prototype/js/earthus2/v11/postgres/` · `prototype/v2-deploy/engine-v11/postgres/`)이
바이트 동일하고 둘 다 추적돼 있다. 나머지 15개 표가 유효하므로 파일을 건드리지 않고,
대체 관계는 문서와 가드로만 표현한다.

⚠️ v11 초안을 **부분 적용**(15개만)하려면 그 파일을 그대로 붙일 수 없다 — 겹치는 4개까지 만들어진다.
그때는 15개만 뽑은 새 파일을 만든다. 이번 범위가 아니다.

## 8. 검증 결과

```
python -m pytest aws/_shared/tests/test_migration_sql.py -q
→ 31 passed
```

검사 항목:

| 묶음 | 항목 |
|---|---|
| 배치 | 파일 존재 · 적용 디렉터리 밖 · 머리말이 미적용을 명시 |
| 구조 | 지시서 요구 표 전부 존재 · 전부 `if not exists` · 전부 PK 보유 · FK 전부 내부 참조 · 기존 19표 미접촉 · 실행 구간 파괴 문장 0 · 되돌리기 전부 주석 · 유일성 인덱스 존재 |
| 어휘 | `TRUTH_STATUS` 8 · `SOURCE_KIND` 6 · `EVENT_RELATION` 6 · 타임라인 8 · **`DATA_STATE` 4 = v11 contracts.js 와 대조** · **중복 관계 4 = `article_dedup.RELATIONS` 와 대조** · **`EVIDENCE_KINDS` 8 = v11 contracts.js 와 대조** · `CONFIRMED_CAUSAL` 실행문 부재 + 주석 존재 |
| 정직성 | §3.7 의 12개 제약 |

⚠️ 이 검증은 **구조 검사**다. Postgres 가 실제로 이 SQL 을 받아들이는지는 확인하지 않았다 —
`jsonb` · `domain` · `generated by default as identity` 는 SQLite 로 실행할 수 없다.
문법 오류는 적용 시점에 드러날 수 있다. 그것이 이 문서가 PARTIAL 인 이유의 하나다.

## 9. 적용 전 확인 4항목 (지시서 STEP 3)

| 항목 | 상태 | 근거 |
|---|---|---|
| schema conflict = 0 | **확보** | v11 겹침 4개를 대체로 확정(§7) · 가드가 적용 시점에 재검사(§7.1) · 질의 caller 0건 실측 |
| duplicate table = 0 | **확보** | 겹치는 4개는 한쪽만 적용. 이 파일 안 15개는 이름 중복 없음(시험이 `create table` 목록을 집합으로 검사) |
| orphan FK = 0 | **확보** | 모든 FK 가 이 파일이 만드는 표를 가리킨다(`test_every_foreign_key_targets_a_table_this_file_creates`) · 기존 19표를 참조하지 않는다 |
| naming ambiguity = 0 | **DB 는 확보 / Python 은 별건** | DB 표는 전부 `earthus_` 접두사이고 중복 없음. 단 Python 모듈명 모호성 4건(`generator`·`validation`·`cli`·`handler`)이 남아 있다 — DB 와 무관하고 [EVIDENCE_SCHEMA_RECONCILIATION.md](EVIDENCE_SCHEMA_RECONCILIATION.md) §9.1 에 기록했다 |

## 10. 남은 것

1. Supabase SQL Editor 에서 적용 (사람) → 문법 검증이 그때 끝난다
2. §7 의 v11 초안 중복 결정
3. 적용 후 `earthus_index_consistency_audit` 에 첫 LIVE 감사 기록
   ([S3_POSTGRES_CONSISTENCY.md](S3_POSTGRES_CONSISTENCY.md))
4. 조립기(3G)가 이 표에 쓰기 시작 — AWS 자격 필요
