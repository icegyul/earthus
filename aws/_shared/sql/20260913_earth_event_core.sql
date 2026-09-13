-- EARTHUS EarthEvent 색인 — PHASE 3 STEP 3
--
-- ⚠️⚠️ ADDITIVE CONTRACT ONLY. **아직 적용하지 않았다.**
--   적용 방법은 이 저장소의 기존 방식과 같다: Supabase SQL Editor 에 이 파일을 그대로 붙여 실행한다
--   (prototype/supabase/migrations/20260906_forme_funnel_events.sql 머리말). 자동 적용 파이프라인은 없다.
--   적용할 때 이 파일을 prototype/supabase/migrations/<타임스탬프>_earth_event_core.sql 로 복사해 두고,
--   그때부터 그 사본이 정본이 된다. 지금 이 파일이 migrations/ 밖에 있는 이유는
--   prototype/js/earthus2/v11/postgres/*.sql 과 같다 — 적용되지 않은 초안을 적용된 것들 사이에 두면
--   다음 사람이 적용된 줄로 읽는다.
--
-- 원칙 (docs/EARTHUS_STORAGE_ARCHITECTURE.md)
--   EarthEvent 의 **정본은 S3** 다: events/earth-events.json + events/earth-events/<event_id>.json
--   이 스키마는 **색인·관계·추적(trace)** 층이다. 여기 있는 행은 S3 레코드를 가리키는 포인터이고,
--   S3 가 진실이다. 불일치가 생기면 S3 를 옳다고 보고 색인을 다시 만든다.
--
--   SimulationRun 은 **research-runtime SQLite 가 원장**이다. Postgres 에 복제하지 않는다.
--   그래서 이 파일에는 simulation_run 표가 **없다.** 타임라인이 실행을 가리킬 때는
--   불투명한 참조 문자열({runtime}:{runId}) 하나만 둔다 — 모델·manifest·검증값을 옮겨 적지 않는다.
--
-- 역호환
--   · 전부 create table if not exists / create index if not exists — 재실행 안전
--   · 기존 19개 표(admins·analytics_events·provider_registry·earthus_forecast_* 등)를
--     alter 하거나 drop 하지 않는다. 이름 충돌 없음(2026-09-13 실측 확인)
--   · release_state 기본값은 SHADOW — 만들어지는 모든 행은 기본 비공개
--   · 개인정보 없음. 사건은 공개 자료이므로 RLS 가 필요한 표가 없다
--     (사용자별 관심 사건을 저장할 때는 earthus_user_context_v2 방식을 따른다)
--
-- 되돌리기는 이 파일 맨 끝 주석 블록에 있다.

begin;

-- ── 정본 어휘 (docs/TRUTH_VOCABULARY_CANONICAL.md) ───────────────────────────
-- 도메인으로 박는다. 표마다 CHECK 를 베껴 쓰면 한 곳만 고쳐지는 사고가 난다.
-- ⚠️ 새 어휘를 만들지 않는다. 아래 네 도메인이 정본이고, 값은 그 문서 §2 와 같다.

do $$ begin
  if not exists (select 1 from pg_type where typname = 'earthus_truth_status') then
    create domain earthus_truth_status as text
      check (value in ('FACT','CORROBORATED','REPORTED','CLAIM','INFERRED','FORECAST','SIMULATION','UNKNOWN'));
  end if;
  if not exists (select 1 from pg_type where typname = 'earthus_source_kind') then
    -- 지시서가 개념을 EVIDENCE_KIND 라 부른 축. 심볼은 SOURCE_KIND 로 확정했다(DECISION 1) —
    -- EVIDENCE_KIND 라는 이름은 v02(10종)·v11(8종)이 이미 다른 뜻으로 쓰고 있다.
    create domain earthus_source_kind as text
      check (value in ('OFFICIAL','OBSERVATION','SATELLITE','NEWS','OSINT','MODEL'));
  end if;
  if not exists (select 1 from pg_type where typname = 'earthus_data_state') then
    -- v02/core/constants.js DATA_STATE · v11/core/contracts.js DATA_STATES 와 같은 4종
    create domain earthus_data_state as text
      check (value in ('LIVE','DEGRADED','STALE','UNAVAILABLE'));
  end if;
  if not exists (select 1 from pg_type where typname = 'earthus_release_state') then
    -- v11/postgres 초안과 같은 승격 사다리. publicReleaseAllowed() 는 ACTIVE·CANARY 만 통과시킨다.
    create domain earthus_release_state as text
      check (value in ('SHADOW','CANARY','ACTIVE'));
  end if;
end $$;

-- ── sources — 출처 ──────────────────────────────────────────────────────────
-- ⚠️ 새 출처 레지스트리가 아니다. aws/_shared/provenance.py §68 이 그것을 금지한다:
--    공급자 정본은 provider_registry / provider_health 와 DATASET_PROVENANCE 다.
--    이 표는 그 둘을 가리키는 얇은 조인 표다.
create table if not exists public.earthus_source (
  source_id           text primary key,                 -- {system}:{identifier} 예 usgs:comcat · gdelt:reuters.com
  publisher           text not null,                    -- 사람이 읽는 표기
  source_kind         earthus_source_kind not null,
  independence_group  text not null,                    -- 교차검증 단위. 같은 그룹은 1로 센다
  provider_ref        text,                             -- → provider_registry.id (있을 때만)
  dataset_ref         text,                             -- → provenance.DATASET_PROVENANCE 키(S3 키) 또는 외부 URL
  language            text,
  region              text,
  -- v07/news/source-registry.js 의 rights/policy 구조를 그대로 담는다.
  -- 기본값이 전부 거부 쪽인 것이 그 모듈의 설계다 — 여기서 풀지 않는다.
  rights_json         jsonb not null default '{}'::jsonb,
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now()
);
create index if not exists earthus_source_independence_idx on public.earthus_source(independence_group);
create index if not exists earthus_source_kind_idx on public.earthus_source(source_kind);

-- ── earth_event — 사건 색인 (정본은 S3) ─────────────────────────────────────
create table if not exists public.earthus_earth_event (
  event_id            text primary key,                 -- {kind}-{sourceId}  ← 잠긴 정본 주소
                                                        -- tools/test_v2_ui_information_architecture.mjs 2건이 검사한다
  kind                text not null,                    -- TC EQ FLOOD WILDFIRE … (CAMEO 코드가 아니다)
  phenomenon_id       text,                             -- phenomenon-registry PHENOMENA 의 domain.snake (66종). 없으면 null
  title               text not null,
  where_text          text,
  latitude            double precision,
  longitude           double precision,
  bbox                jsonb,
  location_precision  text not null default 'NONE'
                        check (location_precision in ('EXACT_SOURCE','CITY','REGION','COUNTRY','NONE')),
  location_doubt      boolean not null default false,   -- gdelt placeDoubt 계보. true 면 확정 승격 금지(§아래 CHECK)
  -- 시각 4분법 (intel-feed.js F01 기록). null 을 now() 로 채우지 않는다 — 그래서 전부 nullable 이고
  -- retrieved_at 만 not null 이다(우리가 받은 시각은 항상 안다).
  occurred_at         timestamptz,
  issued_at           timestamptz,
  updated_at          timestamptz,
  retrieved_at        timestamptz not null,
  lifecycle           text not null default 'DETECTED'
                        check (lifecycle in ('DETECTED','WATCH','ACTIVE','VERIFYING',
                                             'PRELIMINARY_REPORT','FINAL_REPORT','RESOLVED')),
  truth_status        earthus_truth_status not null default 'UNKNOWN',   -- 파생값. 직접 쓰지 않는다
  data_state          earthus_data_state not null default 'UNAVAILABLE',
  severity            text,                             -- 기관이 준 등급만 (GDACS Red/Orange/Green, 특보 단계)
                                                        -- 우리가 만든 등급은 여기 넣지 않는다
  source_system       text not null,                    -- gdacs | usgs | gdelt | kma | lab | …
  source_event_id     text not null,                    -- 원본 id 문자열
  revision            integer not null default 0,       -- GDACS episodeid / USGS updated
  independence_count  integer not null default 0 check (independence_count >= 0),
  official_safety     boolean not null default false,   -- 공식 특보가 걸린 사건 → 무료 공개 대상
  release_state       earthus_release_state not null default 'SHADOW',
  -- S3 정본 포인터. 이 셋이 없으면 색인 행은 의미가 없다.
  canonical_s3_key    text not null,                    -- events/earth-events/<event_id>.json
  canonical_sha256    char(64) not null,                -- 그 객체의 sha256. 불일치 탐지의 기준값
  canonical_schema    text not null,                    -- 예 earthus.earth-event.v1
  canonical_written_at timestamptz not null,
  payload             jsonb not null default '{}'::jsonb,
  created_at          timestamptz not null default now(),
  -- 위치를 못 믿는 사건은 확정으로 올리지 않는다. gdelt handler 가 이미 confirmed→unconfirmed 로
  -- 내리고 있고(placeDoubt), 같은 규칙을 색인에서도 지킨다.
  constraint earthus_earth_event_doubt_not_confirmed
    check (not location_doubt or truth_status not in ('FACT','CORROBORATED')),
  -- 좌표는 둘 다 있거나 둘 다 없다. 한쪽만 있는 좌표는 지도에서 0도로 찍힌다.
  constraint earthus_earth_event_point_complete
    check ((latitude is null) = (longitude is null)),
  constraint earthus_earth_event_point_range
    check (latitude is null or (latitude between -90 and 90 and longitude between -180 and 180)),
  -- 공개되는 사건은 S3 정본이 반드시 있어야 한다.
  constraint earthus_earth_event_public_needs_canonical
    check (release_state = 'SHADOW' or length(canonical_sha256) = 64)
);
create unique index if not exists earthus_earth_event_canonical_key_uidx
  on public.earthus_earth_event(canonical_s3_key);          -- 같은 S3 키를 두 사건이 가리키지 못한다
create unique index if not exists earthus_earth_event_source_uidx
  on public.earthus_earth_event(source_system, source_event_id);  -- 같은 원본 사건의 중복 색인 금지
create index if not exists earthus_earth_event_kind_time_idx
  on public.earthus_earth_event(kind, occurred_at desc);
create index if not exists earthus_earth_event_lifecycle_idx
  on public.earthus_earth_event(lifecycle, updated_at desc);
create index if not exists earthus_earth_event_phenomenon_idx
  on public.earthus_earth_event(phenomenon_id) where phenomenon_id is not null;
create index if not exists earthus_earth_event_release_idx
  on public.earthus_earth_event(release_state);

-- ── event_relation — 사건끼리의 관계 ────────────────────────────────────────
-- 어휘는 DECISION 2 로 확정한 6종이다. CONFIRMED_CAUSAL 은 **도입하지 않는다** —
-- report_contract.FORBIDDEN_CAUSAL 이 인과 단정 문구를 이미 금지하고 있고,
-- 이 값을 만들면 그 금지를 우회하는 문이 생긴다. 스키마로도 막는다.
create table if not exists public.earthus_event_relation (
  relation_id       text primary key,
  from_event_id     text not null references public.earthus_earth_event(event_id) on delete cascade,
  to_event_id       text not null references public.earthus_earth_event(event_id) on delete cascade,
  relation_type     text not null
                      check (relation_type in ('TEMPORAL','SPATIAL','CORRELATED',
                                               'POSSIBLE_CASCADE','MODELLED_CASCADE','UNKNOWN')),
  evidence_level    text check (evidence_level in ('COINCIDING','ASSOCIATED','CONSISTENT_WITH',
                                                   'CONNECTED','POSSIBLE_INFLUENCE')),  -- report_contract.py:329
  simulation_run_ref text,                            -- {runtime}:{runId}. 복제가 아니라 참조다
  basis_json        jsonb not null,                   -- 판정 근거(거리·시간차·상관계수·모델 id). 비울 수 없다
  created_at        timestamptz not null default now(),
  -- 한 방향만 저장한다. 양방향 2행이면 한쪽만 지워지는 사고가 난다 — 조회에서 양방향으로 읽는다.
  constraint earthus_event_relation_directed unique (from_event_id, to_event_id, relation_type),
  constraint earthus_event_relation_no_self check (from_event_id <> to_event_id),
  -- 모델이 계산한 연쇄는 그 실행을 반드시 댄다.
  constraint earthus_event_relation_modelled_needs_run
    check (relation_type <> 'MODELLED_CASCADE' or simulation_run_ref is not null),
  -- 근거 없는 관계를 만들 수 없다.
  constraint earthus_event_relation_basis_not_empty check (basis_json <> '{}'::jsonb)
);
create index if not exists earthus_event_relation_from_idx on public.earthus_event_relation(from_event_id);
create index if not exists earthus_event_relation_to_idx on public.earthus_event_relation(to_event_id);
create index if not exists earthus_event_relation_type_idx on public.earthus_event_relation(relation_type);

-- ── news_article — 기사 메타데이터 (정본 파일은 S3) ─────────────────────────
-- ⚠️⚠️ **본문 칸이 없다. 만들지 않는다.**
--   aws/regional-news/handler.py 머리말: "기사 본문을 절대 담지 않는다. 담는 것은
--   제목·링크·시각·매체뿐이다. 요약도 하지 않는다 — 요약은 원문을 재구성하는 것이라 마찬가지다."
--   ZIP 의 NewsArticle.content 를 채택하지 않은 이유가 이것이다.
--   summary 칸도 두지 않는다. 우리가 쓴 문장은 claim 으로 들어간다.
create table if not exists public.earthus_news_article (
  article_id          text primary key,                 -- {source_id}:{canonical_url} (v07/news 계보)
  source_id           text not null references public.earthus_source(source_id) on delete restrict,
  title               text not null,
  canonical_url       text not null,
  normalized_url      text not null,                    -- article_dedup.normalize_url() 결과
  published_at        timestamptz,
  updated_at          timestamptz,
  language            text,
  latitude            double precision,
  longitude           double precision,
  location_precision  text not null default 'NONE'
                        check (location_precision in ('EXACT_SOURCE','CITY','REGION','COUNTRY','NONE')),
  mappable            boolean not null default false,   -- v11/news 계보: 좌표가 실제로 있는가
  event_id            text references public.earthus_earth_event(event_id) on delete set null,
  link_score          double precision check (link_score is null or link_score between 0 and 1),
  truth_status        earthus_truth_status not null default 'REPORTED',
  retrieved_at        timestamptz not null,
  s3_key              text not null,                    -- 이 기사가 실린 배치 산출물 (events/global.json 등)
  created_at          timestamptz not null default now(),
  constraint earthus_news_article_point_complete check ((latitude is null) = (longitude is null)),
  constraint earthus_news_article_mappable_has_point check (not mappable or latitude is not null),
  -- 사건에 붙지 않았으면 점수도 없다. 점수만 남아 "붙은 것처럼" 보이지 않게 한다.
  constraint earthus_news_article_score_needs_event check (event_id is not null or link_score is null)
);
create index if not exists earthus_news_article_event_idx on public.earthus_news_article(event_id);
create index if not exists earthus_news_article_source_time_idx
  on public.earthus_news_article(source_id, published_at desc);
create index if not exists earthus_news_article_normalized_url_idx
  on public.earthus_news_article(normalized_url);

-- ── 기사 중복 묶음과 계보 (PHASE 3H) ───────────────────────────────────────
-- ARTICLE DEDUP ≠ EVENT FUSION. 이 두 표에는 event_id 가 없다 — 있으면 두 층이 섞인다.
create table if not exists public.earthus_article_dedup_group (
  dedup_group_id    text primary key,
  root_article_id   text not null references public.earthus_news_article(article_id) on delete cascade,
  member_count      integer not null check (member_count >= 1),
  confidence        text not null check (confidence in ('HIGH','MEDIUM','LOW')),
  -- 교차검증 회계: 묶음 하나가 독립 출처 1 이다. 구성원·매체가 몇이든 마찬가지다
  -- (gdelt-events 결함 ①: 합치면서 점수를 지어낸 것). 그래서 이 값은 항상 1 이고,
  -- 열로 둔 이유는 집계 질의가 이 규칙을 눈으로 보게 하려는 것이다.
  independence_units integer not null default 1 check (independence_units = 1),
  publishers        jsonb not null default '[]'::jsonb,
  languages         jsonb not null default '[]'::jsonb,
  created_at        timestamptz not null default now(),
  constraint earthus_article_dedup_group_root_unique unique (root_article_id)
);

create table if not exists public.earthus_article_lineage (
  article_id        text primary key references public.earthus_news_article(article_id) on delete cascade,
  dedup_group_id    text not null references public.earthus_article_dedup_group(dedup_group_id) on delete cascade,
  root_article_id   text not null references public.earthus_news_article(article_id) on delete cascade,
  relation          text not null check (relation in ('ORIGINAL','TRANSLATION_OF','SYNDICATION_OF','REWRITE_OF')),
  dedup_confidence  text not null check (dedup_confidence in ('HIGH','MEDIUM','LOW')),
  basis             jsonb not null default '[]'::jsonb,
  variant_urls      jsonb not null default '[]'::jsonb,
  created_at        timestamptz not null default now(),
  -- 뿌리는 자기 자신을 가리키고 관계는 ORIGINAL 이다. 그 밖은 ORIGINAL 이 될 수 없다.
  constraint earthus_article_lineage_root_is_original
    check ((article_id = root_article_id) = (relation = 'ORIGINAL')),
  -- 번역·재작성 판정은 본문 없이 한 추정이다. HIGH 로 올릴 수 없다.
  constraint earthus_article_lineage_inferred_is_not_high
    check (relation not in ('TRANSLATION_OF','REWRITE_OF') or dedup_confidence <> 'HIGH'
           or basis::text like '%url-identity%' or basis::text like '%content-identity%')
);
create index if not exists earthus_article_lineage_group_idx on public.earthus_article_lineage(dedup_group_id);
create index if not exists earthus_article_lineage_root_idx on public.earthus_article_lineage(root_article_id);
create index if not exists earthus_article_lineage_relation_idx on public.earthus_article_lineage(relation);

-- ── evidence — 증거 그래프 (v11/postgres 초안 승격) ─────────────────────────
-- v11/evidence/evidence-graph.js 의 노드/엣지를 그대로 옮긴다. 어휘를 바꾸지 않는다.
create table if not exists public.earthus_evidence_node (
  evidence_id    text primary key,
  evidence_kind  text not null
                   check (evidence_kind in ('OBSERVED','OFFICIAL_FORECAST','OFFICIAL_WARNING','REPORTED',
                                            'DETECTED','MODELLED','HISTORICAL','SIMULATION')),  -- v11 EVIDENCE_KINDS 8종
  source_id      text not null references public.earthus_source(source_id) on delete restrict,
  external_id    text,
  title          text,
  observed_at    timestamptz,
  source_url     text,
  payload        jsonb not null default '{}'::jsonb,
  -- 파생 3축 (docs/TRUTH_VOCABULARY_CANONICAL.md §3.2)
  source_kind    earthus_source_kind not null,
  truth_status   earthus_truth_status not null default 'UNKNOWN',
  created_at     timestamptz not null default now()
);
create index if not exists earthus_evidence_node_source_idx on public.earthus_evidence_node(source_id);
create index if not exists earthus_evidence_node_kind_time_idx
  on public.earthus_evidence_node(evidence_kind, observed_at desc);

create table if not exists public.earthus_evidence_edge (
  from_evidence_id text not null references public.earthus_evidence_node(evidence_id) on delete cascade,
  to_evidence_id   text not null references public.earthus_evidence_node(evidence_id) on delete cascade,
  relation         text not null
                     check (relation in ('OBSERVATION_OF','REPORTED_BY','OFFICIAL_NOTICE_OF','ACTION_RESPONDS_TO',
                                         'DERIVED_FROM','SUPPORTS','CONTRADICTS','CALIBRATES','HISTORICAL_ANALOG_OF')),
  metadata         jsonb not null default '{}'::jsonb,
  created_at       timestamptz not null default now(),
  primary key (from_evidence_id, to_evidence_id, relation),
  constraint earthus_evidence_edge_no_self check (from_evidence_id <> to_evidence_id)
);
create index if not exists earthus_evidence_edge_to_idx on public.earthus_evidence_edge(to_evidence_id);

create table if not exists public.earthus_event_evidence (
  event_id    text not null references public.earthus_earth_event(event_id) on delete cascade,
  evidence_id text not null references public.earthus_evidence_node(evidence_id) on delete cascade,
  created_at  timestamptz not null default now(),
  primary key (event_id, evidence_id)
);
create index if not exists earthus_event_evidence_evidence_idx on public.earthus_event_evidence(evidence_id);

-- ── claim — 주장 ────────────────────────────────────────────────────────────
create table if not exists public.earthus_claim (
  claim_id       text primary key,
  event_id       text not null references public.earthus_earth_event(event_id) on delete cascade,
  claim_type     text not null
                   check (claim_type in ('SOURCE_ATTRIBUTION','TRANSPORT','DISCOVERY_RECOMMENDATION',
                                         'FORECAST','SAFETY_ACTION')),   -- v11/claims/claim-gate.js RULES
  claim_text     text not null,                        -- 우리가 쓴 문장
  truth_status   earthus_truth_status not null default 'UNKNOWN',
  gate_result    jsonb not null,                       -- evaluateClaim() { allowed, missing[] }
  label          text,                                 -- claimLabel(). 게이트 미통과면 null → 표시 금지
  conflict       jsonb,                                -- 충돌 시 양쪽 보존 (TRUTH_VOCABULARY §2.4)
  created_at     timestamptz not null default now(),
  -- 게이트를 통과하지 못한 주장에는 라벨이 없다. 라벨 없는 주장은 화면에 나가지 않는다.
  constraint earthus_claim_label_needs_gate
    check (label is null or (gate_result->>'allowed')::boolean is true),
  -- 충돌 중인 주장은 CORROBORATED 로 올라가지 않는다.
  constraint earthus_claim_conflict_not_corroborated
    check (conflict is null or truth_status <> 'CORROBORATED')
);
create index if not exists earthus_claim_event_idx on public.earthus_claim(event_id);
create index if not exists earthus_claim_status_idx on public.earthus_claim(truth_status);

create table if not exists public.earthus_claim_evidence (
  claim_id    text not null references public.earthus_claim(claim_id) on delete cascade,
  evidence_id text not null references public.earthus_evidence_node(evidence_id) on delete cascade,
  created_at  timestamptz not null default now(),
  primary key (claim_id, evidence_id)
);
create index if not exists earthus_claim_evidence_evidence_idx on public.earthus_claim_evidence(evidence_id);

-- ── event_timeline — 사건 타임라인 (ZIP 에서 채택한 유일한 자료구조) ────────
create table if not exists public.earthus_event_timeline (
  entry_id           text primary key,
  event_id           text not null references public.earthus_earth_event(event_id) on delete cascade,
  at                 timestamptz not null,
  kind               text not null
                       check (kind in ('ARTICLE','EVIDENCE','OBSERVATION','WARNING',
                                       'FORECAST','IMPACT','SIMULATION','SYSTEM')),  -- ZIP TimelineKind 8종
  title              text not null,
  source_ids         jsonb not null default '[]'::jsonb,
  article_id         text references public.earthus_news_article(article_id) on delete set null,
  evidence_ids       jsonb not null default '[]'::jsonb,
  -- research-runtime 실행 참조. **복제가 아니다** — {runtime}:{runId} 문자열 하나뿐이고
  -- 모델·manifest·검증값은 원장에서 읽는다.
  simulation_run_ref text,
  metadata           jsonb not null default '{}'::jsonb,
  created_at         timestamptz not null default now(),
  constraint earthus_event_timeline_unique unique (event_id, kind, at, title),
  -- SIMULATION 줄은 그 실행을 반드시 댄다. 그 반대(참조가 있는데 종류가 다른 것)도 막는다.
  constraint earthus_event_timeline_simulation_needs_ref
    check ((kind = 'SIMULATION') = (simulation_run_ref is not null)),
  constraint earthus_event_timeline_article_kind
    check (article_id is null or kind = 'ARTICLE')
);
create index if not exists earthus_event_timeline_event_time_idx
  on public.earthus_event_timeline(event_id, at);
create index if not exists earthus_event_timeline_kind_idx on public.earthus_event_timeline(kind);
create index if not exists earthus_event_timeline_run_idx
  on public.earthus_event_timeline(simulation_run_ref) where simulation_run_ref is not null;

-- ── context_snapshot — 지구 문맥 (내용은 S3, 여기는 포인터) ─────────────────
create table if not exists public.earthus_context_snapshot (
  snapshot_id     text primary key,
  event_id        text not null references public.earthus_earth_event(event_id) on delete cascade,
  captured_at     timestamptz not null,
  window_start    timestamptz not null,
  window_end      timestamptz not null,
  status          text not null check (status in ('COMPLETE','PARTIAL','UNKNOWN')),  -- ZIP ContextSnapshot 계보
  data_state      earthus_data_state not null default 'UNAVAILABLE',
  s3_key          text not null,                       -- events/context/<event_id>/<captured_at>.json (불변)
  s3_sha256       char(64),
  provenance      jsonb not null default '[]'::jsonb,  -- 읽은 S3 키 + 각 키의 generated 시각
  adapter_states  jsonb not null default '{}'::jsonb,  -- 어댑터별 5분법 OK|EMPTY|FAILED|STALE|OUT_OF_SCOPE
  created_at      timestamptz not null default now(),
  constraint earthus_context_snapshot_window check (window_end >= window_start),
  constraint earthus_context_snapshot_unique unique (event_id, captured_at),
  -- COMPLETE 이라고 적으려면 무엇을 읽었는지 대야 한다.
  constraint earthus_context_snapshot_complete_has_provenance
    check (status <> 'COMPLETE' or jsonb_array_length(provenance) > 0)
);
create index if not exists earthus_context_snapshot_event_time_idx
  on public.earthus_context_snapshot(event_id, captured_at desc);

-- ── impact_assessment — 영향 ────────────────────────────────────────────────
-- ⚠️ 오늘 이 표에 들어갈 수 있는 값은 거의 없다. 노출 인구·자산 계산기가 저장소에 없다
--    (docs/SIMULATION_PLATFORM_MAPPING.md §0.3). 그래서 제약으로 못을 박는다:
--    모델 참조가 없으면 MODELLED 이라고 적을 수 없고, 숫자도 넣을 수 없다.
create table if not exists public.earthus_impact_assessment (
  assessment_id        text primary key,
  event_id             text not null references public.earthus_earth_event(event_id) on delete cascade,
  snapshot_id          text references public.earthus_context_snapshot(snapshot_id) on delete set null,
  hazard_family        text not null,
  status               text not null default 'UNKNOWN'
                         check (status in ('OBSERVED','MODELLED','UNKNOWN','NOT_AVAILABLE')),
  severity             text,                            -- 기관 등급만
  exposed_population   bigint check (exposed_population is null or exposed_population >= 0),
  exposed_assets       bigint check (exposed_assets is null or exposed_assets >= 0),
  geometry_s3_key      text,
  assumptions          jsonb not null,                  -- 비울 수 없다
  uncertainty          jsonb not null,                  -- 비울 수 없다
  source_ids           jsonb not null default '[]'::jsonb,
  model_ref            text,                            -- {runtime}:{modelId} 또는 {runtime}:{runId}
  truth_status         earthus_truth_status not null default 'UNKNOWN',
  created_at           timestamptz not null default now(),
  constraint earthus_impact_assumptions_not_empty check (jsonb_array_length(assumptions) > 0),
  constraint earthus_impact_uncertainty_not_empty check (jsonb_array_length(uncertainty) > 0),
  -- 모델이 없으면 MODELLED 도 OBSERVED 도 아니다.
  constraint earthus_impact_modelled_needs_model
    check (status <> 'MODELLED' or model_ref is not null),
  -- 숫자를 적으려면 그 숫자를 낸 것을 대야 한다. 근거 없는 노출 인구를 만들 수 없다.
  constraint earthus_impact_numbers_need_model
    check ((exposed_population is null and exposed_assets is null) or model_ref is not null),
  -- 영향은 관측이 아니다. FACT·CORROBORATED 로 적을 수 없다.
  constraint earthus_impact_never_fact
    check (truth_status not in ('FACT','CORROBORATED'))
);
create index if not exists earthus_impact_event_idx on public.earthus_impact_assessment(event_id);
create index if not exists earthus_impact_status_idx on public.earthus_impact_assessment(status);

-- ── 색인 일관성 감사 기록 (STEP 4 validator 가 쓴다) ────────────────────────
create table if not exists public.earthus_index_consistency_audit (
  audit_id      bigint generated by default as identity primary key,
  checked_at    timestamptz not null default now(),
  mode          text not null check (mode in ('FIXTURE','LIVE')),   -- mock PASS 를 production PASS 로 쓰지 않는다
  status        text not null check (status in ('PASS','PARTIAL','FAIL')),
  checks        jsonb not null,
  findings      jsonb not null default '[]'::jsonb
);
create index if not exists earthus_index_consistency_audit_time_idx
  on public.earthus_index_consistency_audit(checked_at desc);

commit;

-- ═══════════════════════════════════════════════════════════════════════════
-- 되돌리기 (down migration)
--
-- 이 파일이 만든 것만 지운다. 기존 19개 표는 손대지 않았으므로 아래를 실행하면
-- 적용 직전 상태로 정확히 돌아간다. 참조 순서 때문에 역순으로 지운다.
-- ⚠️ 실수로 실행되지 않게 주석으로 둔다. 되돌릴 때 사람이 주석을 풀고 실행한다.
--
-- begin;
-- drop table if exists public.earthus_index_consistency_audit;
-- drop table if exists public.earthus_impact_assessment;
-- drop table if exists public.earthus_context_snapshot;
-- drop table if exists public.earthus_event_timeline;
-- drop table if exists public.earthus_claim_evidence;
-- drop table if exists public.earthus_claim;
-- drop table if exists public.earthus_event_evidence;
-- drop table if exists public.earthus_evidence_edge;
-- drop table if exists public.earthus_evidence_node;
-- drop table if exists public.earthus_article_lineage;
-- drop table if exists public.earthus_article_dedup_group;
-- drop table if exists public.earthus_news_article;
-- drop table if exists public.earthus_event_relation;
-- drop table if exists public.earthus_earth_event;
-- drop table if exists public.earthus_source;
-- drop domain if exists earthus_release_state;
-- drop domain if exists earthus_data_state;
-- drop domain if exists earthus_source_kind;
-- drop domain if exists earthus_truth_status;
-- commit;
--
-- 되돌려도 잃는 것은 **색인**이다. EarthEvent 정본은 S3 에 있고, 색인은
-- events/earth-events.json 에서 다시 만들 수 있다. 그것이 S3 를 정본으로 둔 이유다.
-- ═══════════════════════════════════════════════════════════════════════════
