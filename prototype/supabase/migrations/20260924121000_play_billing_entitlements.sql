-- EARTHUS — Google Play 결제(앱 안 선불형 기간 이용권) 권한 기록 + v2 등급 서버 판정 (2026-09-24)
--
-- 근거: docs/APP-ANDROID-CHROME-NEWTAB-DIRECTIVE-2026-09-24.md §3-3 · §3-5 · Phase 2
--       PD 결정 2026-09-24: 2027-01-01 유료 시작 · 무료 앱 + Play 선불형 기간 이용권(자동 갱신 없음, 약관 제8조 제2항 그대로)
--       · 창립 멤버 50%(약관 제8조 제7항 · docs/FOUNDING-500.md) · 가격 미정(이 파일에 금액 없음).
--
-- ⚠️ 초안이다. 이 세션에서 운영 DB 에 적용하지 않았다. PD 가 검토하고 적용한다.
-- ⚠️ 선행: 20260908120000_tier_vocabulary_unification.sql (tier_rank() · profiles.tier CHECK 에 explorer/intelligence).
--    `supabase db push` 는 파일 이름 순서로 적용하므로 그 파일이 먼저 돈다. 대시보드에 손으로 붙인다면 그 파일부터.
--    그것 없이 이 파일만 적용하면 apply_play_purchase 가 profiles.tier='explorer' 쓰기에서 check_violation 으로 멈춘다.
-- ⚠️ 선행: founding.sql (profiles.founding_member · claim_founding) · billing.sql (plans · orders).
--
-- 이 파일이 하는 일
--   1) play_products — Play 상품 id → plans 행 + 창립 여부. **금액 없음**(Play 는 Console 가격을 청구한다).
--   2) play_purchases — 검증을 통과해 권한을 준 구매. purchase_token 하나 = 계정 하나(먼저 검증한 계정).
--   3) play_rejections — 받지 않은 구매의 기록(acknowledge 하지 않았으므로 Play 가 3일 뒤 자동 환불한다).
--   4) apply_play_purchase / revoke_play_purchase — 서버(service_role)만. 멱등. 약관 제8조 제3항 이어 붙이기.
--   5) earthus_my_entitlement() — **v2 가 믿는 유일한 등급 판정.** localStorage earthus.tier 를 대신한다(§3-5-1).

begin;

-- ── 1. 상품 대응표 ─────────────────────────────────────────────────────────────────────────
create table if not exists public.play_products (
  product_id  text primary key check (product_id ~ '^[a-z0-9][a-z0-9._]{0,139}$'),
  plan_id     text not null references public.plans(id),
  founding    boolean not null default false,
  active      boolean not null default true,
  created_at  timestamptz not null default now()
);
comment on table public.play_products is
  'Play 구독 상품(선불형 기본 요금제 하나, 오퍼 없음) → plans 행. 금액은 없다 — Play Console 이 정본이고, 정가를 바꾸는 날 plans.krw 와 Play 두 상품(정가·.founding)을 같은 날 2:1 로 맞춘다(PD).';
alter table public.play_products enable row level security;
drop policy if exists play_products_read on public.play_products;
create policy play_products_read on public.play_products for select using (active = true);

-- 8개 = EXPLORER(pro)·PRO(intelligence) × 월·연 × 정가·창립. id 는 billing.js:45-56 의 plans id + '.founding'.
-- ⚠️ on conflict do nothing — PD 가 대시보드에서 끈(active=false) 상품을 이 파일을 다시 돌려 되살리지 않는다.
insert into public.play_products (product_id, plan_id, founding) values
  ('earthus.pro.monthly',                   'earthus.pro.monthly',          false),
  ('earthus.pro.monthly.founding',          'earthus.pro.monthly',          true),
  ('earthus.pro.yearly',                    'earthus.pro.yearly',           false),
  ('earthus.pro.yearly.founding',           'earthus.pro.yearly',           true),
  ('earthus.intelligence.monthly',          'earthus.intelligence.monthly', false),
  ('earthus.intelligence.monthly.founding', 'earthus.intelligence.monthly', true),
  ('earthus.intelligence.yearly',           'earthus.intelligence.yearly',  false),
  ('earthus.intelligence.yearly.founding',  'earthus.intelligence.yearly',  true)
on conflict (product_id) do nothing;

-- ── 2. 권한을 준 구매 ──────────────────────────────────────────────────────────────────────
create table if not exists public.play_purchases (
  purchase_token        text primary key,
  user_id               uuid not null references auth.users(id) on delete cascade,
  product_id            text not null references public.play_products(product_id),
  plan_id               text not null references public.plans(id),
  tier                  text not null,
  months                integer not null check (months > 0),
  founding              boolean not null default false,
  status                text not null default 'granted' check (status in ('granted', 'revoked')),
  google_order_id       text,
  google_state          text,
  -- ⚠️ 권한을 줄 때 Google 이 말한 만료 시각. 나중에 이보다 당겨지면 '회수'로 본다(RTDN · play-billing-core decideRevocation).
  google_expiry         timestamptz,
  linked_purchase_token text,
  test_purchase         boolean not null default false,
  flags                 text[] not null default '{}',
  granted_at            timestamptz not null default now(),
  grants_until          timestamptz,
  acknowledged_at       timestamptz,
  revoked_at            timestamptz,
  revoke_reason         text,
  created_at            timestamptz not null default now(),
  updated_at            timestamptz not null default now()
);
alter table public.play_purchases enable row level security;
drop policy if exists play_purchases_select_own on public.play_purchases;
create policy play_purchases_select_own on public.play_purchases for select using (auth.uid() = user_id);
-- 쓰기 정책 없음 = 브라우저는 못 쓴다. Edge Function(service_role)만.
create index if not exists idx_play_purchases_user on public.play_purchases(user_id, granted_at desc);

create table if not exists public.play_rejections (
  id          bigint generated always as identity primary key,
  user_id     uuid references auth.users(id) on delete set null,
  purchase_token_hash text not null,         -- ⚠️ 원문 토큰을 남기지 않는다(남의 토큰일 수 있다)
  product_id  text,
  reason      text not null,
  flags       text[] not null default '{}',
  created_at  timestamptz not null default now()
);
alter table public.play_rejections enable row level security;   -- 정책 없음 = service_role 전용

-- ── 3. 기간 사슬 — 약관 제8조 제3항 '남은 기간 뒤에 이어 붙임' ─────────────────────────────────────
-- ⚠️ play-billing-core.js chainEnd() 와 같은 규칙이다. 한쪽만 고치지 말 것.
--    end_i = greatest(paid_i, end_{i-1}) + months_i  (웹 orders 'paid' + Play 'granted' 를 결제 시각 순서로)
create or replace function public.earthus_paid_chain_end(p_user uuid, p_exclude text default null)
returns timestamptz language plpgsql stable security definer set search_path = public as $$
declare
  r record;
  e timestamptz := null;
begin
  for r in
    select x.paid_at, x.months, x.ref from (
      select o.approved_at as paid_at, pl.months, o.id as ref
        from public.orders o join public.plans pl on pl.id = o.plan_id
       where o.user_id = p_user and o.status = 'paid' and o.approved_at is not null
      union all
      select pp.granted_at, pp.months, 'play:' || pp.purchase_token
        from public.play_purchases pp
       where pp.user_id = p_user and pp.status = 'granted'
    ) x order by x.paid_at, x.ref
  loop
    continue when p_exclude is not null and r.ref = p_exclude;
    e := greatest(r.paid_at, coalesce(e, r.paid_at)) + make_interval(months => r.months);
  end loop;
  return e;
end $$;
revoke all on function public.earthus_paid_chain_end(uuid, text) from public, anon, authenticated;
grant execute on function public.earthus_paid_chain_end(uuid, text) to service_role;

-- ── 4. 권한 주기 — 멱등 ─────────────────────────────────────────────────────────────────────
create or replace function public.apply_play_purchase(
  p_user uuid, p_token text, p_product text,
  p_google_order text, p_google_state text, p_google_expiry timestamptz,
  p_linked text, p_test boolean, p_flags text[]
) returns table (ok boolean, tier text, ends timestamptz, already boolean)
language plpgsql security definer set search_path = public as $$
declare
  pp public.play_purchases%rowtype;
  prod public.play_products%rowtype;
  pl public.plans%rowtype;
  prof public.profiles%rowtype;
  base timestamptz;
  new_ends timestamptz;
begin
  -- 같은 사람의 행을 한 번에 하나씩만 고친다(동시 두 요청이 기간을 두 번 더하지 않게).
  select * into prof from public.profiles where id = p_user for update;
  if not found then raise exception 'PROFILE_NOT_FOUND'; end if;

  select * into pp from public.play_purchases where purchase_token = p_token for update;
  if found then
    if pp.user_id <> p_user then raise exception 'TOKEN_BOUND_TO_OTHER_ACCOUNT'; end if;
    ok := true; tier := prof.tier; ends := prof.subscription_ends; already := true;
    return next; return;
  end if;

  select * into prod from public.play_products where product_id = p_product and active = true;
  if not found then raise exception 'UNKNOWN_PRODUCT'; end if;
  select * into pl from public.plans where id = prod.plan_id and active = true;
  if not found then raise exception 'UNKNOWN_PLAN'; end if;

  -- ⚠️ 서버 판정(play-billing-core)과 겹쳐 두는 두 번째 문. 반값은 창립 멤버만(약관 제8조 제7항).
  if prod.founding and not coalesce(prof.founding_member, false) then
    raise exception 'FOUNDING_NOT_ELIGIBLE';
  end if;
  -- 높은 등급이 남아 있을 때 낮은 등급을 붙이면 남은 높은 등급을 잃는다 — 받지 않는다.
  if prof.subscription_ends is not null and prof.subscription_ends > now()
     and public.tier_rank(prof.tier) > public.tier_rank(pl.tier) then
    raise exception 'TIER_DOWNGRADE_WHILE_ACTIVE';
  end if;

  -- 약관 제8조 제3항 — 남은 기간 뒤에 이어 붙인다(billing.sql apply_paid_order 와 같은 규칙).
  base := greatest(coalesce(prof.subscription_ends, now()), now());
  new_ends := base + make_interval(months => pl.months);

  update public.profiles
     set tier = pl.tier,
         subscription_id = 'play:' || coalesce(p_google_order, left(p_token, 32)),
         subscription_ends = new_ends,
         updated_at = now()
   where id = p_user;

  insert into public.play_purchases (purchase_token, user_id, product_id, plan_id, tier, months, founding,
    google_order_id, google_state, google_expiry, linked_purchase_token, test_purchase, flags, grants_until)
  values (p_token, p_user, prod.product_id, pl.id, pl.tier, pl.months, prod.founding,
    p_google_order, p_google_state, p_google_expiry, p_linked, coalesce(p_test, false), coalesce(p_flags, '{}'), new_ends);

  ok := true; tier := pl.tier; ends := new_ends; already := false;
  return next;
end $$;
revoke all on function public.apply_play_purchase(uuid, text, text, text, text, timestamptz, text, boolean, text[])
  from public, anon, authenticated;
grant execute on function public.apply_play_purchase(uuid, text, text, text, text, timestamptz, text, boolean, text[])
  to service_role;

create or replace function public.mark_play_acknowledged(p_token text)
returns void language sql security definer set search_path = public as $$
  update public.play_purchases set acknowledged_at = coalesce(acknowledged_at, now()), updated_at = now()
   where purchase_token = p_token;
$$;
revoke all on function public.mark_play_acknowledged(text) from public, anon, authenticated;
grant execute on function public.mark_play_acknowledged(text) to service_role;

-- ── 5. 권한 회수 — 환불·취소·차지백 (RTDN 이 Google 재확인 뒤에만 부른다) ───────────────────────
-- ⚠️ 'N달 빼기'가 아니다. 이 구매가 기간 사슬을 늘린 만큼만 줄인다(사슬을 있이/없이 두 번 센 차이).
--    그래야 이미 써 버린 앞 구매를 돌려받았을 때 뒤 구매의 기간이 깎이지 않고, 원장 밖 시간(수동 초대 등)도 남는다.
create or replace function public.revoke_play_purchase(p_token text, p_reason text)
returns table (ok boolean, tier text, ends timestamptz, already boolean)
language plpgsql security definer set search_path = public as $$
declare
  pp public.play_purchases%rowtype;
  prof public.profiles%rowtype;
  with_end timestamptz;
  without_end timestamptz;
  delta interval;
  new_ends timestamptz;
  next_tier text;
begin
  select * into pp from public.play_purchases where purchase_token = p_token for update;
  if not found then raise exception 'PURCHASE_NOT_FOUND'; end if;
  select * into prof from public.profiles where id = pp.user_id for update;
  if pp.status = 'revoked' then
    ok := true; tier := prof.tier; ends := prof.subscription_ends; already := true;
    return next; return;
  end if;

  with_end := public.earthus_paid_chain_end(pp.user_id, null);
  without_end := public.earthus_paid_chain_end(pp.user_id, 'play:' || p_token);
  delta := greatest(interval '0', with_end - coalesce(without_end, pp.granted_at));
  new_ends := prof.subscription_ends - delta;

  if new_ends is null or new_ends <= now() then
    -- next_tier := 'free'; new_ends := null;
    -- (2026-09-24 정정, 적대 검토) 위 줄은 관리자 초대(manual_access_until)가 살아 있어도 FREE 로 떨어뜨렸다 —
    --   웹 환불은 이미 초대를 보존한다(migrations/20260811081000_refund_preserves_invite.sql). Play 회수도 같은 규칙으로 맞춘다.
    --   초대 등급은 그 파일·claim_member_invite 와 같은 'paid'(explorer 와 동급)다. play-billing-core.js revocationPlan 과 같이 고친다.
    new_ends := null;
    next_tier := case when prof.manual_access_until is not null and prof.manual_access_until > now()
                      then 'paid' else 'free' end;
  else
    -- 남은 원장 중 아직 끝나지 않은 구매의 가장 높은 등급. 없으면(원장 밖 시간) 지금 등급을 둔다.
    select t.tier into next_tier from (
      select o_pl.tier, public.tier_rank(o_pl.tier) as rk
        from public.orders o join public.plans o_pl on o_pl.id = o.plan_id
       where o.user_id = pp.user_id and o.status = 'paid' and o.grants_until > now()
      union all
      select x.tier, public.tier_rank(x.tier)
        from public.play_purchases x
       where x.user_id = pp.user_id and x.status = 'granted' and x.purchase_token <> p_token and x.grants_until > now()
    ) t order by t.rk desc limit 1;
    next_tier := coalesce(next_tier, prof.tier);
  end if;

  update public.profiles
     set tier = next_tier, subscription_ends = new_ends, updated_at = now()
   where id = pp.user_id;
  update public.play_purchases
     set status = 'revoked', revoked_at = now(), revoke_reason = left(coalesce(p_reason, ''), 200), updated_at = now()
   where purchase_token = p_token;

  ok := true; tier := next_tier; ends := new_ends; already := false;
  return next;
end $$;
revoke all on function public.revoke_play_purchase(text, text) from public, anon, authenticated;
grant execute on function public.revoke_play_purchase(text, text) to service_role;

-- ── 6. v2 가 믿는 등급 — 본인 것만, 서버 시계로 ─────────────────────────────────────────────
-- ⚠️ 클라이언트의 localStorage earthus.tier 는 누구나 바꿀 수 있다. 판매가 열린 뒤(PAID) v2 는 이 값만 믿는다.
-- 유료 = tier_rank(tier) > 0 이고 (구독 끝 > 지금 또는 수동 초대 끝 > 지금). 끝이 비어 있는 유료 행은 무료로 본다
--   (apply_paid_order·apply_play_purchase 는 늘 끝을 적는다. 끝 없는 유료는 만료 작업이 놓친 옛 행이다).
create or replace function public.earthus_my_entitlement()
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare
  uid uuid := auth.uid();
  p public.profiles%rowtype;
  paid_until timestamptz;
  t text := 'free';
begin
  if uid is null then
    return jsonb_build_object('tier', 'free', 'signedIn', false, 'checkedAt', now());
  end if;
  select * into p from public.profiles where id = uid;
  if not found then
    return jsonb_build_object('tier', 'free', 'signedIn', true, 'checkedAt', now());
  end if;
  paid_until := greatest(
    case when p.subscription_ends > now() then p.subscription_ends end,
    case when p.manual_access_until > now() then p.manual_access_until end);
  if public.tier_rank(p.tier) > 0 and paid_until is not null then
    t := case when public.tier_rank(p.tier) >= 2 then 'intelligence' else 'explorer' end;
  end if;
  return jsonb_build_object(
    'tier', t,
    'signedIn', true,
    'ends', case when t = 'free' then null else paid_until end,
    'founding', coalesce(p.founding_member, false),
    'checkedAt', now());
end $$;
revoke all on function public.earthus_my_entitlement() from public, anon;
grant execute on function public.earthus_my_entitlement() to authenticated;

commit;

-- ── 적용 후 확인 ──────────────────────────────────────────────────────────────────────────
-- select product_id, plan_id, founding from public.play_products order by product_id;   -- 8행
-- select public.earthus_paid_chain_end('<uuid>');                                          -- 결제 없는 사람 → null
-- (로그인 세션으로) select public.earthus_my_entitlement();                                -- {"tier":"free",...}
-- anon 키로 select * from public.play_purchases;  → 0행이어야 정상
