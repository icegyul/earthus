-- EARTHUS EarthEvent 색인 — RLS 동반 파일 (R0, 2026-09-20)
--
-- ⚠️⚠️ **아직 적용하지 않았다.** 20260913_earth_event_core.sql 을 적용한 **바로 뒤에** 같은 SQL Editor
--   창에서 이어 실행한다. 절차는 docs/R0-POSTGRES-APPLY-GUIDE-2026-09-20.md (PD 가 직접 적용 — D2).
--
-- 왜 필요한가
--   20260913_earth_event_core.sql 은 새 표 15개를 만들면서 RLS 를 켜지 않는다. 저장소의 다른
--   migration 은 모두 켠다(예: prototype/supabase/migrations/20260821120000_earthus_v8_forecast_private.sql).
--   Supabase 에서 RLS 가 꺼진 public 표는 anon 키로 읽고 쓸 수 있다 — 그러면 release_state='SHADOW'
--   (검토 전) 사건이 공개 앱의 anon 키로 새어 나간다.
--
-- 무엇을 하나
--   `enable row level security` 만 한다. 정책(policy)을 만들지 않는다 → anon·authenticated 는 전부 막히고
--   service_role(Lambda)만 RLS 를 우회해 접근한다. 공개 읽기가 필요해지면 그때 SELECT 정책을 따로 더한다.
--   DROP·ALTER COLUMN 0건. 재실행해도 안전하다(이미 켜진 표에 다시 켜도 같다).
--
-- 되돌리기 (필요할 때만, 주석을 풀어서)
--   alter table public.<표> disable row level security;

begin;

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

commit;

-- 적용 후 확인 (15행 모두 relrowsecurity = true 여야 한다)
--   select relname, relrowsecurity from pg_class
--    where relnamespace = 'public'::regnamespace and relname like 'earthus\_%' escape '\' and relkind = 'r'
--    order by 1;
