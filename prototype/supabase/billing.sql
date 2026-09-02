-- earthus — 결제·구독 스키마 (schema.sql 다음에 실행)
--
-- ⚠️⚠️ 이 파일의 전제: **클라이언트는 절대 자기 tier 를 바꿀 수 없다.**
--    schema.sql 의 guard_profile_columns() 트리거가 이미 막고 있다.
--    여기서는 "누가 얼마를 결제했는가"를 서버만 쓸 수 있는 자리에 기록한다.
--
-- ⚠️ 결제 금액을 클라이언트가 보내게 하면 안 된다.
--    "월 3,900원"을 브라우저에서 39원으로 바꿔 보낼 수 있다.
--    → 주문은 **planId 만 받고 금액은 서버가 표에서 찾는다** (아래 plans 테이블).
--
-- ⚠️ 웹훅/승인은 반드시 **멱등**이어야 한다.
--    PG 는 같은 웹훅을 여러 번 보낼 수 있고, 사용자가 새로고침하면 승인이 두 번 불린다.
--    → orders.status 를 조건으로 UPDATE 해서 이미 처리된 건은 조용히 넘긴다.

-- ═══════════════════════════════════════════════════════════
-- 1. plans — 상품과 가격 (금액의 정본)
--    ⚠️ 가격을 코드에 박지 않고 표에 둔다. 바꿀 때 배포가 필요 없고,
--       무엇보다 **서버가 금액을 검증할 근거**가 여기 있어야 한다.
-- ═══════════════════════════════════════════════════════════
create table if not exists public.plans (
  id          text primary key,              -- 'earthus.pro.monthly'
  name_ko     text not null,
  name_en     text not null,
  krw         integer not null check (krw >= 0),
  usd         numeric(6,2),
  period      text not null check (period in ('month','year')),
  months      integer not null check (months > 0),   -- 이용권 길이
  active      boolean not null default true,
  -- 선착순 상품(창립회원)용. null 이면 수량 제한 없음.
  max_seats   integer,
  sort        integer not null default 0
);

-- ⚠️⚠️ 2026-09-02 — v5.3 §1.4 의 3단계(free / explorer / intelligence)로 바뀌었다.
--    또 돌려도 안전하도록 if not exists 로 붙인다.
--    기본값이 'explorer' 인 이유: 기존 상품(Personal Pro)이 그 자리를 승계했기 때문이다.
alter table public.plans
  add column if not exists tier text not null default 'explorer'
  check (tier in ('explorer', 'intelligence'));

alter table public.plans enable row level security;
-- 가격표는 누구나 읽어야 한다 (로그인 전 요금제 화면).
create policy plans_read on public.plans for select using (active = true);
-- 쓰기 정책 없음 = 클라이언트는 못 바꾼다. 관리자는 대시보드/서비스키로.

insert into public.plans (id, name_ko, name_en, krw, usd, period, months, max_seats, sort, tier)
values
  -- ⚠️⚠️ **금액의 정본은 이 표다.** 화면(billing.js DEFAULT_PLANS)은 표시용일 뿐이고
  --    checkout 함수는 planId 만 받아 금액을 여기서 찾는다. 값을 바꾸면 여기부터 바꾼다.
  --
  -- ⚠️⚠️ 2026-09-02 가격 개정 — 3단계 전환. **읽기 전에 반드시 확인할 것:**
  --    · EXPLORER      월 ₩9,900   (예전 Personal Pro 월 ₩5,900 에서 인상)
  --    · INTELLIGENCE  월 ₩49,000
  --    ⚠️⚠️ ₩49,000 은 **예전 'Personal Pro 연 요금'과 숫자만 같고 뜻이 완전히 다르다.**
  --       예전: earthus.pro.yearly = 연 ₩49,000 / 지금: earthus.intelligence.monthly = **월** ₩49,000.
  --       (2026-09-02 확인: ₩49,000 은 인텔리전스 등급의 요금이 맞다.)
  --       이 둘을 헷갈리면 월 요금을 연 요금으로 받거나 그 반대가 된다. 12배 사고다.
  --       그래서 아래에서 pro.yearly 를 꺼 둔다 — 같은 숫자가 두 뜻으로 표에 남아 있지 않게.
  --    ⚠️ 연 요금 = 10개월치(2개월분 할인, 17%) — 2026-09-02 결정.
  --       ⚠️ 할인율을 키우지 말 것: 창립회원 상품이 연간을 8배 싸게 매겨 월간을 죽였다.
  --    ⚠️ USD 가격도 아직 없다. 해외 표시가는 환율이 아니라 **결정**이라 비워 둔다.
  ('earthus.pro.monthly',          '한 달 이용권',        'Monthly',              9900, null, 'month', 1, null, 10, 'explorer'),
  ('earthus.pro.yearly',           '1년 이용권',          'Yearly',              99000, null, 'year', 12, null, 20, 'explorer'),
  -- ⚠️ 2026-09-02 재검토: ₩49,000 → ₩29,000. API 가 상업 요금제로 빠지면서
  --    ₩49,000 을 지탱하던 근거가 이 등급에서 사라졌다. 상업·기관은 별도 문의다.
  ('earthus.intelligence.monthly', '인텔리전스 한 달',    'Intelligence monthly', 29000, null, 'month', 1, null, 30, 'intelligence'),
  ('earthus.intelligence.yearly',  '인텔리전스 1년',      'Intelligence yearly', 290000, null, 'year', 12, null, 40, 'intelligence'),
  -- ⚠️ 창립회원(earthus.founding.500)은 **뺐다** (받은 결정).
  --    당시 월 ₩12,000 대비 연 ₩19,000이 월 환산 8배 싸서 아무도 월간을 안 사고,
  --    500명이 다 차도 초기 자금이 950만원에서 멈춘다는 판단이었다.
  --    Personal Pro 가격이 바뀌어도 이 상품은 되살리지 않는다.
  --    '초기에 결제해 주시면'(기간 2배·이름 등재·우선 초대)이 같은 일을 더 정직하게 한다.
  --    ⚠️ 줄을 지우지 않고 **꺼 둔다**(아래 update). 이미 산 사람이 있으면 기록이 남아야 한다.
  ('earthus.founding.500', '창립회원 1년', 'Founding year', 19000, 14.99, 'year', 12,  500,  5)
on conflict (id) do update
  set krw = excluded.krw, usd = excluded.usd, months = excluded.months,
      name_ko = excluded.name_ko, name_en = excluded.name_en,
      max_seats = excluded.max_seats, sort = excluded.sort,
      -- ⚠️ tier 를 빼먹으면 이 스크립트를 다시 돌려도 등급이 안 바뀐다.
      --    새로 만들 때만 맞고 갱신할 때 틀리는, 제일 늦게 발견되는 종류의 버그다.
      tier = excluded.tier;


-- ═══════════════════════════════════════════════════════════
-- 2. orders — 주문
--    ⚠️ 클라이언트가 직접 INSERT 하지 못한다. Edge Function(서비스 롤)만 만든다.
--       열어 두면 금액 0원짜리 주문을 만들어 승인 단계를 통과시킬 수 있다.
-- ═══════════════════════════════════════════════════════════
create table if not exists public.orders (
  id             text primary key,             -- 우리가 만든 주문번호 (PG 에 그대로 보낸다)
  user_id        uuid not null references auth.users(id) on delete cascade,
  plan_id        text not null references public.plans(id),
  -- ⚠️⚠️ 금액은 **최소 단위(minor unit)** 로 저장한다. 통화마다 다르다:
  --      KRW 는 소수점이 없어 amount = 원 그대로 (29000 = 29,000원)
  --      USD 는 센트다            (2199 = $21.99)
  --    ⚠️ 이걸 안 지키면 $21.99 결제가 $2,199 로 기록된다. 100배 사고다.
  --    ⚠️ 예전엔 컬럼 이름이 krw 였다. 해외 결제를 붙이는 순간 **USD 금액이
  --       "krw" 라는 이름의 칸에 들어가** 회계가 조용히 틀어진다. 그래서 갈랐다.
  amount         integer not null check (amount >= 0),
  currency       text not null default 'KRW' check (currency in ('KRW','USD')),
  status         text not null default 'pending'
                 check (status in ('pending','paid','failed','canceled','refunded')),
  -- ⚠️ 'toss' 는 국내 카드 전용이다. 해외는 별도 수단이 필요하다 —
  --    한국 사업자는 Stripe 계정을 못 열기 때문에(2026 기준) MoR 이나 앱스토어를 쓴다.
  --    docs/pricing-plan.md 「해외 결제」 참고.
  provider       text not null default 'toss', -- 'toss' | 'apple' | 'google' | 'paddle'
  payment_key    text,                         -- PG 가 준 결제 식별자
  approved_at    timestamptz,
  fail_reason    text,
  -- 적용 결과
  grants_until   timestamptz,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now()
);

alter table public.orders enable row level security;
-- 본인 주문만 **읽기**. 쓰기 정책은 일부러 두지 않는다 (서비스 롤 전용).
create policy orders_select_own on public.orders
  for select using (auth.uid() = user_id);

create index if not exists idx_orders_user on public.orders(user_id, created_at desc);
create index if not exists idx_orders_status on public.orders(status, created_at desc);


-- ═══════════════════════════════════════════════════════════
-- 3. 결제 반영 — 서버(서비스 롤)만 부른다
--    ⚠️⚠️ security definer + **멱등**. 두 번 불려도 기간이 두 배가 되지 않는다.
-- ═══════════════════════════════════════════════════════════
create or replace function public.apply_paid_order(
  p_order_id   text,
  p_payment_key text
) returns table (ok boolean, tier text, ends timestamptz)
language plpgsql security definer set search_path = public as $$
declare
  o public.orders%rowtype;
  m integer;
  v_tier text;
  base timestamptz;
  new_ends timestamptz;
begin
  -- ⚠️ 이미 처리된 주문이면 **아무것도 더 하지 않고** 현재 상태를 돌려준다.
  --    (PG 웹훅 재전송 · 사용자 새로고침으로 두 번 불리는 일이 실제로 흔하다)
  select * into o from public.orders where id = p_order_id for update;
  if not found then
    raise exception 'ORDER_NOT_FOUND';
  end if;

  if o.status = 'paid' then
    select p.tier, p.subscription_ends into tier, ends
      from public.profiles p where p.id = o.user_id;
    ok := true;
    return next;
    return;
  end if;

  -- ⚠️⚠️ 등급을 'paid' 로 고정하지 않는다 — **상품이 정한 등급을 따른다.**
  --    고정해 두면 INTELLIGENCE 를 산 사람도 EXPLORER 권한만 받는다.
  -- ⚠️ 반드시 테이블 별칭을 붙인다 — 이 함수의 OUT 파라미터 이름이 tier 라
  --    그냥 tier 라고 쓰면 "column reference tier is ambiguous" 로 터진다.
  select pl.months, pl.tier into m, v_tier from public.plans pl where pl.id = o.plan_id;
  if m is null then
    raise exception 'PLAN_NOT_FOUND';
  end if;

  -- ⚠️ 남은 기간이 있으면 **거기에 이어 붙인다.** now() 부터 다시 세면
  --    아직 안 쓴 기간을 빼앗는 것이 된다.
  select greatest(coalesce(p.subscription_ends, now()), now())
    into base from public.profiles p where p.id = o.user_id;
  new_ends := base + (m || ' months')::interval;

  update public.profiles
     set tier = v_tier,
         subscription_id = p_order_id,
         subscription_ends = new_ends,
         founding_member = founding_member or (o.plan_id like 'earthus.founding%'),
         updated_at = now()
   where id = o.user_id;

  update public.orders
     set status = 'paid', payment_key = p_payment_key,
         approved_at = now(), grants_until = new_ends, updated_at = now()
   where id = p_order_id;

  ok := true; tier := v_tier; ends := new_ends;
  return next;
end $$;

revoke all on function public.apply_paid_order(text, text) from public, anon, authenticated;
-- 실행 권한은 service_role 만. Edge Function 이 서비스키로 부른다.
grant execute on function public.apply_paid_order(text, text) to service_role;


-- ═══════════════════════════════════════════════════════════
-- 4. 창립회원 잔여 좌석 — 로그인 전에도 보여줘야 한다
--    ⚠️ orders 테이블 자체는 열지 않는다. 숫자만 돌려준다.
-- ═══════════════════════════════════════════════════════════
create or replace function public.plan_seats_left(p_plan_id text)
returns integer language sql security definer stable set search_path = public as $$
  select case
           when pl.max_seats is null then null
           else greatest(0, pl.max_seats - (
                  select count(*)::int from public.orders o
                   where o.plan_id = pl.id and o.status = 'paid'))
         end
    from public.plans pl where pl.id = p_plan_id;
$$;
grant execute on function public.plan_seats_left(text) to anon, authenticated;


-- ═══════════════════════════════════════════════════════════
-- 5. 만료 처리
--    ⚠️ 기간이 지났는데 tier 가 'paid' 로 남아 있으면 공짜로 계속 쓴다.
--       하루 한 번 이 함수를 부른다 (Supabase Cron 또는 EventBridge).
-- ═══════════════════════════════════════════════════════════
create or replace function public.expire_subscriptions()
returns integer language plpgsql security definer set search_path = public as $$
declare n integer;
begin
  update public.profiles
     set tier = 'free', updated_at = now()
   where tier = 'paid'
     and subscription_ends is not null
     and subscription_ends < now();
  get diagnostics n = row_count;
  return n;
end $$;
revoke all on function public.expire_subscriptions() from public, anon, authenticated;
grant execute on function public.expire_subscriptions() to service_role;


-- ═══════════════════════════════════════════════════════════
-- 확인용
-- ═══════════════════════════════════════════════════════════
-- select id, name_ko, krw, usd, months, max_seats from public.plans order by sort;
-- -- ⚠️ 금액이 최소 단위로 들어갔는지 확인 (USD 는 센트여야 한다)
-- select id, currency, amount, plan_id from public.orders order by created_at desc limit 10;
-- select tablename, rowsecurity from pg_tables
--   where schemaname='public' and tablename in ('plans','orders');
-- -- anon 키로 아래가 0행이어야 정상 (남의 주문이 안 보인다)
-- select count(*) from public.orders;

-- ⚠️ 창립회원을 화면에서 내린다. plans_read 정책이 active = true 만 보여준다.
update public.plans set active = false where id = 'earthus.founding.500';
-- ⚠️ earthus.pro.yearly 는 2026-09-02 에 ₩49,000 → ₩99,000 으로 **값이 바뀌었다.**
--    on conflict 갱신이 이 행의 금액을 덮으므로 스크립트를 다시 돌리면 새 값이 들어간다.
--    ⚠️ 이미 ₩49,000 으로 결제된 주문이 있다면 그 주문의 금액은 orders.amount 에 따로
--       박혀 있어 영향받지 않는다. 표를 고쳐도 과거 청구 기록은 바뀌지 않는다.
