-- EARTHUS V2 PHASE 2 STEP 2.2 — 등급 어휘 통일
--
-- ⚠️ 초안이다. 이 세션에서 운영 DB 에 적용하지 않았다. 사람이 검토하고 적용한다.
-- ⚠️ 적용 전에 아래 "적용 전 확인" 세 가지를 반드시 실측하라. 저장소만으로는 확정할 수 없다.
--
-- 무엇이 깨져 있었나
--   profiles.tier 는 CHECK (tier in ('free','paid')) 인데            (schema.sql:17)
--   plans.tier 는 CHECK (tier in ('explorer','intelligence')) 이고   (billing.sql:39)
--   apply_paid_order 가 plans.tier 값을 profiles.tier 에 그대로 쓴다  (billing.sql:160,172)
--   → 첫 실결제에서 check_violation 이 난다. 결제가 통과된 적이 없어서 아직 안 터졌을 뿐이다.
--
-- 왜 새 이름을 만들지 않았나
--   free / explorer / intelligence 세 값은 이미 저장소에 있다.
--   plans.tier CHECK 가 정의하고, prototype/js/access-mode.js:33-37 TIER 가 얼려 두었고,
--   prototype/js/billing.js TIER_NAMES 가 이미 그 키로 한국어 표시를 색인한다.
--   'paid' 는 지우지 않는다 — 기존 행이 전부 그 값이라 빼면 이 ALTER 자체가 실패한다.
--   explorer 동급(서열 1)의 영구 입력 별칭으로 남긴다.
--
-- ⚠️ 이 마이그레이션만 적용하면 상황이 나빠진다.
--   prototype/supabase/functions/_shared/forecast-v8-policy.js 가 `tier !== 'paid'` 였기 때문에,
--   결제가 성공해 tier='explorer' 가 되는 순간 유료 구독자가 전부 예보에서 차단된다.
--   그 파일은 같은 작업에서 등급 서열 비교로 이미 고쳤다(커밋 동봉). 둘은 한 몸이다.

-- ── 적용 전 확인 (DB 접근이 필요해 이 세션에서 못 했다) ────────────────────────
--  1) CHECK 제약의 실제 이름:
--     select conname from pg_constraint
--      where conrelid = 'public.profiles'::regclass and contype = 'c';
--     아래는 인라인 CHECK 의 관례 이름 profiles_tier_check 를 가정한다.
--  2) plans.tier 컬럼이 운영에 실재하는지:
--     select column_name from information_schema.columns
--      where table_schema='public' and table_name='plans' and column_name='tier';
--  3) expire_subscriptions 가 두 벌이다. 운영에 살아 있는 정의를 확인하라:
--       prototype/supabase/billing.sql:215-226            → where tier='paid'
--       migrations/20260811080000_member_invites.sql:97-117 → tier 를 'paid'/'free' 로 되씀
--     select prosrc from pg_proc where proname = 'expire_subscriptions';
--     둘 다 3단계 어휘에서 깨진다. 아래 3) 블록은 살아 있는 쪽에 맞춰 조정해야 한다.
-- ──────────────────────────────────────────────────────────────────────────────

begin;

-- 1) CHECK 확장. 'paid' 존치가 핵심이다.
alter table public.profiles drop constraint if exists profiles_tier_check;
alter table public.profiles add constraint profiles_tier_check
  check (tier in ('free', 'paid', 'explorer', 'intelligence'));

-- 2) 등급 서열을 DB 안에서도 한 곳에서만 말한다.
--    ⚠️ prototype/js/access-mode.js 의 TIER_RANK 와 정수가 같아야 한다.
--    ⚠️ prototype/supabase/functions/_shared/forecast-v8-policy.js 의 표와도 같아야 한다.
--    세 곳이 어긋나면 서버·화면·DB 가 서로 다른 판정을 한다.
create or replace function public.tier_rank(p_tier text)
returns integer
language sql
immutable
as $$
  select case lower(coalesce(p_tier, ''))
    when 'free'         then 0
    when 'paid'         then 1   -- 레거시 별칭 — explorer 와 동급
    when 'explorer'     then 1
    when 'intelligence' then 2
    when 'business'     then 3   -- 소비자 티어 아님
    else 0                       -- 모르는 값은 무료로 읽는다. 오타가 권한을 열어주면 안 된다.
  end;
$$;

-- 3) 만료 처리를 등급 서열로 바꾼다.
--    기존 `where tier = 'paid'` 는 explorer·intelligence 구독자를 영원히 안 내려보낸다.
--    ⚠️ 위 "적용 전 확인 3)" 에서 운영에 살아 있는 정의를 확인한 뒤 그쪽에 맞춰 적용하라.
create or replace function public.expire_subscriptions()
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  n integer;
begin
  update public.profiles
     set tier = 'free'
   where public.tier_rank(tier) > 0
     and coalesce(subscription_ends,   'epoch'::timestamptz) < now()
     and coalesce(manual_access_until, 'epoch'::timestamptz) < now();
  get diagnostics n = row_count;
  return n;
end;
$$;

-- 4) membership_class 동기화의 구멍 둘.
--
--    (a) 세 번째 가지가 `new.tier = 'paid'` 문자열 일치라(20260827193000:21),
--        subscription_ends 가 비어 있는 explorer/intelligence 행이 'free' 로 찍힌다.
--        서열 비교로 바꾼다.
--        ※ PHASE 1 문서(docs/earthus-v2/subscription-capability-map.md)에서 이것을
--          "유료 가입자가 전부 free 로 찍힌다"고 적었는데 과장이었다. precedence fix 가
--          subscription_ends 를 먼저 보므로, 구독 기간이 살아 있으면 'paid' 로 바르게 찍힌다.
--          실제 피해 범위는 '기간 필드가 빈 유료 등급 행'으로 좁다. 문서는 정정했다.
--
--    (b) 더 큰 구멍: 트리거가 `before insert or update of tier, manual_access_until` 이라
--        (20260827090000:41) **subscription_ends 만 갱신하면 트리거가 안 돈다.**
--        구독을 연장/변경하는 흔한 쓰기가 membership_class 를 낡은 채로 남긴다.
create or replace function public.sync_profile_membership_class()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  new.membership_class := case
    when new.subscription_ends is not null and new.subscription_ends > now() then 'paid'
    when new.manual_access_until is not null and new.manual_access_until > now() then 'invite'
    when public.tier_rank(new.tier) > 0 then 'paid'
    else 'free'
  end;
  return new;
end $$;

drop trigger if exists trg_sync_profile_membership_class on public.profiles;
create trigger trg_sync_profile_membership_class
before insert or update of tier, manual_access_until, subscription_ends on public.profiles
for each row execute function public.sync_profile_membership_class();

-- 기존 행 재계산 — 위 두 구멍으로 낡아 있던 값을 한 번 맞춘다.
update public.profiles set tier = tier;

commit;

-- ── 적용 후 확인 ──────────────────────────────────────────────────────────────
-- select public.tier_rank('intelligence');  -- 2
-- select public.tier_rank('paid');          -- 1
-- select public.tier_rank('gold');          -- 0  (모르는 값은 무료)
-- select tier, count(*) from public.profiles group by tier;
--
-- 되돌리기: CHECK 를 ('free','paid') 로 되돌리려면 explorer/intelligence 행을 먼저
-- 'paid' 로 접어야 한다. 그러지 않으면 ALTER 가 실패한다.
