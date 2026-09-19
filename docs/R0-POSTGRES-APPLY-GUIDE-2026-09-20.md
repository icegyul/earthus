# R0 — EarthEvent 색인 SQL 적용 절차서 (PD용)

작성 2026-09-20 · 상태 **미적용 — PD 적용 대기** · 결정 D2: PD가 Supabase SQL Editor에서 직접 적용하고, Claude는 결과를 대조한다. Claude는 자격증명을 요구하지 않는다.

대상 파일
- `aws/_shared/sql/20260913_earth_event_core.sql` (538줄, 표 15 · 도메인 4 · 인덱스 32 · CHECK 50, 전체가 `begin … commit` 한 트랜잭션)
- `aws/_shared/sql/20260920_earth_event_core_rls.sql` — 위 파일 **바로 뒤에** 실행하는 RLS 동반 파일(15표 enable, 정책 없음)

---

## 0. 적용 전에 정한 것

> 2026-09-20 야간 실행에서 PD 지시("웬만해서는 너 추천으로 진행해줘")에 따라 권장안으로 정했다. 바꾸려면 적용 전에 말하면 된다.

| # | 결정 | 정한 것 | 이유 |
|---|---|---|---|
| A | 새 표 15개에 RLS를 켤까 | **켠다** — 동반 파일로 | 저장소의 다른 migration 8개는 모두 켠다. 이 파일만 끈 채로 둔다. Supabase에서 public 표는 anon 키로 읽고 쓸 수 있는 것으로 보인다(4단계에서 확인). 그러면 SHADOW(검토 전) 사건이 새어 나간다 |
| B | LIVE 대조 방식 | 이번엔 SQL Editor 확인 쿼리로 대신한다 | `index_consistency` LIVE 어댑터가 아직 없다. 빈 표에 돌리면 **아무것도 대조하지 않고 PASS**가 나왔다 — `require_live` 에 빈 대조 거부 가드를 넣었다(2026-09-20) |
| C | v11 초안 superseded 표시 | 표시한다 | v11도 `earthus_evidence_node/edge`를 같은 이름으로 만든다 |
| D | 백업 수단 | 대시보드 백업 확인 + 스키마 덤프 | 아래 1단계 |

A는 핵심 SQL 파일을 고치지 않고 **동반 파일** `20260920_earth_event_core_rls.sql` 로 만들었다. 핵심 파일 실행 직후 같은 창에서 이어 실행한다. 새 표는 적용 직후 비어 있으므로(아직 Postgres 에 쓰는 코드가 없다) 두 실행 사이의 틈에 새어 나갈 행은 없다.

---

## 1. 적용 전 백업

이 SQL은 기존 표를 건드리지 않는다(ALTER·DROP 0건). 그래서 백업은 "되돌릴 기준점"을 남기는 용도다.

1. Supabase 대시보드 → Database → Backups에서 최근 자동 백업 시각을 확인해 적어 둔다(요금제에 따라 없을 수 있다).
2. (선택) PD 컴퓨터에서 스키마만 덤프한다. 값은 PD가 직접 넣고 어디에도 붙여 넣지 않는다.
   ```
   pg_dump "<SUPABASE_DB_CONNECTION_STRING>" --schema-only --schema=public -f before-earth-event-core.sql
   ```
3. SQL Editor에서 **읽기 전용** 조회 3개를 돌리고 결과를 Claude에게 붙여 준다.
   ```sql
   -- ① 지금 public 표 목록 (기록상 19개인데, 저장소 migration 정의는 28개다)
   select table_name from information_schema.tables
    where table_schema = 'public' and table_type = 'BASE TABLE' order by 1;

   -- ② 새로 만들 이름이 이미 있는가 (0행이어야 한다)
   select table_name from information_schema.tables
    where table_schema = 'public' and table_name in (
      'earthus_source','earthus_earth_event','earthus_event_relation','earthus_news_article',
      'earthus_article_dedup_group','earthus_article_lineage','earthus_evidence_node',
      'earthus_evidence_edge','earthus_event_evidence','earthus_claim','earthus_claim_evidence',
      'earthus_event_timeline','earthus_context_snapshot','earthus_impact_assessment',
      'earthus_index_consistency_audit','earthus_event_cluster');

   -- ③ 같은 이름의 타입이 어느 스키마에든 있는가 (0행이어야 한다)
   select n.nspname, t.typname from pg_type t join pg_namespace n on n.oid = t.typnamespace
    where t.typname in ('earthus_truth_status','earthus_source_kind','earthus_data_state','earthus_release_state');
   ```
   ②나 ③이 0행이 아니면 **여기서 멈춘다.** 파일 안의 가드는 세 경우만 잡고 나머지는 조용히 지나간다.

---

## 2. SQL Editor에 붙일 순서

1. New query를 연다.
2. `aws/_shared/sql/20260913_earth_event_core.sql` 전체를 붙인다.
   - 파일 끝의 되돌리기 블록은 주석이라 함께 붙여도 실행되지 않는다.
3. Run을 한 번 누른다.
4. 결과를 읽는다.
   - `Success. No rows returned`이면 적용 완료다.
   - `SCHEMA_CONFLICT: …`이면 가드가 멈춘 것이다. 트랜잭션 전체가 롤백되어 **아무것도 바뀌지 않았다.** 메시지 전문을 Claude에게 준다.
   - 문법 오류(`syntax error at or near …`)도 전체가 롤백된다. 이 파일은 실제 Postgres에서 한 번도 실행해 보지 않았으므로 이런 오류가 날 수 있다. 줄번호와 함께 Claude에게 준다.
5. **한 번만** 실행한다. 다시 실행해도 안전하지만(if not exists), 결과를 해석하기 헷갈려진다.
6. 성공했으면 New query 를 열어 `aws/_shared/sql/20260920_earth_event_core_rls.sql` 전체를 붙여 한 번 실행한다. `Success. No rows returned` 이면 끝.

---

## 3. 적용 직후 저장소 정리 (Claude 몫, PD 확인 뒤)

- SQL 머리말 6-7행대로 두 파일을 `prototype/supabase/migrations/<적용시각>_earth_event_core.sql`, `<적용시각>_earth_event_core_rls.sql` 로 복사한다. 그때부터 그 사본이 정본이다.
- `docs/DB_MIGRATION_PLAN.md` §10의 1번을 완료로 바꾸고, 실측한 표 수를 맞춘다.

---

## 4. 적용 후 대조 (PD가 SQL Editor에서 돌리고, Claude가 판정)

```sql
-- ① 새 표 15개가 모두 있는가 → 15
select count(*) from information_schema.tables
 where table_schema='public' and table_name like 'earthus\_%' escape '\'
   and table_name in ('earthus_source','earthus_earth_event','earthus_event_relation','earthus_news_article',
     'earthus_article_dedup_group','earthus_article_lineage','earthus_evidence_node','earthus_evidence_edge',
     'earthus_event_evidence','earthus_claim','earthus_claim_evidence','earthus_event_timeline',
     'earthus_context_snapshot','earthus_impact_assessment','earthus_index_consistency_audit');

-- ② 도메인 4개 → 4
select count(*) from pg_type where typname in
 ('earthus_truth_status','earthus_source_kind','earthus_data_state','earthus_release_state') and typtype='d';

-- ③ 파생 칸이 실제로 붙었는가 (v11 모양이 아닌가) → 2행
select column_name from information_schema.columns
 where table_schema='public' and table_name='earthus_evidence_node' and column_name in ('source_kind','truth_status');

-- ④ 기존 표 수가 그대로인가 → 1단계 ①의 개수 + 15
select count(*) from information_schema.tables where table_schema='public' and table_type='BASE TABLE';

-- ⑤ 누가 접근할 수 있는가 — anon·authenticated가 나오면 결정 A를 다시 본다
select table_name, grantee, string_agg(privilege_type, ',' order by privilege_type)
  from information_schema.role_table_grants
 where table_schema='public' and table_name like 'earthus\_%' escape '\'
   and grantee in ('anon','authenticated')
 group by 1,2 order by 1,2;

-- ⑥ RLS 상태
select relname, relrowsecurity from pg_class
 where relnamespace='public'::regnamespace and relname like 'earthus\_%' escape '\' and relkind='r' order by 1;
```

Claude의 판정 기준: ①=15, ②=4, ③=2행, ④=기존+15, ⑥ 15행 모두 true. ⑤에 anon·authenticated 권한이 보여도 RLS 가 켜져 있고 정책이 없으면 행은 막힌다 — ⑥이 기준이다.

### `index_consistency.check(mode=LIVE)`에 대해 — 지금은 돌리지 않는다

- `aws/_shared/index_consistency.py`의 `check()`는 DB에 직접 붙지 않는다. 판독 결과를 넘겨받아 판정만 한다. S3·Postgres 판독 어댑터는 **아직 없다**(docs/S3_POSTGRES_CONSISTENCY.md §6·§8).
- 적용 직후에는 표가 비어 있다(아직 Postgres에 쓰는 코드가 없다). 빈 입력을 넣으면 `check({}, [], LIVE)`가 **PASS**를 내고 `require_live`도 통과시킨다(2026-09-20 실측). 이 PASS는 아무것도 대조하지 않은 PASS이므로 운영 근거로 쓰지 않는다.
- LIVE 판정은 다음 세 가지가 갖춰진 뒤에 한다. (1) 빈 대조를 거부하는 가드(✅ 2026-09-20 `require_live` 에 넣음), (2) 읽기 전용 어댑터 두 개, (3) PD가 자기 셸에 넣는 읽기 전용 연결 문자열(`<EARTHUS_PG_READONLY_DSN>` — 이름은 제안이고 값은 Claude가 보지 않는다). S3 쪽은 `aws login`이 필요하다.
- 그때 쓸 명령(초안):
  ```
  python -m earthus_index_check --mode LIVE --s3-prefix archive/earth-events/canonical/v1/   # 도구는 아직 없다
  ```

---

## 5. 되돌리는 법

이 파일이 만든 것만 지운다. 기존 표는 건드리지 않는다. 색인만 사라지고 정본(S3 archive/)은 그대로 남아 다시 만들 수 있다.

SQL Editor에 아래를 붙여 실행한다(파일 513-533행의 주석을 푼 것과 같다).

```sql
begin;
drop table if exists public.earthus_index_consistency_audit;
drop table if exists public.earthus_impact_assessment;
drop table if exists public.earthus_context_snapshot;
drop table if exists public.earthus_event_timeline;
drop table if exists public.earthus_claim_evidence;
drop table if exists public.earthus_claim;
drop table if exists public.earthus_event_evidence;
drop table if exists public.earthus_evidence_edge;
drop table if exists public.earthus_evidence_node;
drop table if exists public.earthus_article_lineage;
drop table if exists public.earthus_article_dedup_group;
drop table if exists public.earthus_news_article;
drop table if exists public.earthus_event_relation;
drop table if exists public.earthus_earth_event;
drop table if exists public.earthus_source;
drop domain if exists earthus_release_state;
drop domain if exists earthus_data_state;
drop domain if exists earthus_source_kind;
drop domain if exists earthus_truth_status;
commit;
```

⚠️ 표에 행이 쌓인 뒤에 되돌리면 그 행들은 사라진다. 되돌린 뒤에는 4단계 ④의 개수가 1단계 ①과 같아야 한다.

---

## 부록 1 — RLS 동반 파일의 내용 (참고)

실제로 붙일 것은 `aws/_shared/sql/20260920_earth_event_core_rls.sql` 이다(같은 15줄을 `begin … commit` 으로 감쌌다).

정책을 만들지 않으므로 anon·authenticated는 막히고, service_role(Lambda)만 접근할 수 있다. 기존 migration의 관례와 같다(`20260821120000_earthus_v8_forecast_private.sql` 38행).

```sql
alter table public.earthus_source                  enable row level security;
alter table public.earthus_earth_event             enable row level security;
alter table public.earthus_event_relation          enable row level security;
alter table public.earthus_news_article            enable row level security;
alter table public.earthus_article_dedup_group     enable row level security;
alter table public.earthus_article_lineage         enable row level security;
alter table public.earthus_evidence_node           enable row level security;
alter table public.earthus_evidence_edge           enable row level security;
alter table public.earthus_event_evidence          enable row level security;
alter table public.earthus_claim                   enable row level security;
alter table public.earthus_claim_evidence          enable row level security;
alter table public.earthus_event_timeline          enable row level security;
alter table public.earthus_context_snapshot        enable row level security;
alter table public.earthus_impact_assessment       enable row level security;
alter table public.earthus_index_consistency_audit enable row level security;
```

이 블록은 `alter … enable`만 한다. DROP은 없다. 반대로 되돌리려면 `disable row level security`를 쓴다.
