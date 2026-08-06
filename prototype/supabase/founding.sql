-- ═══════════════════════════════════════════════════════════
-- earthus — 창립 멤버 500 · 평생 반값
--
-- 근거: 이용약관 제2조 제6항 (정의) · 제8조 제7항 (할인)
--       2026-08-06 개정. 사전등록 화면에 이미 약속이 걸려 있다.
--
-- ⚠️⚠️ 이 파일이 하는 일은 **돈을 깎는 것**이다. 세 가지를 지킨다.
--   ① 자격은 서버가 정한다. 클라이언트가 보낸 값은 어디서도 믿지 않는다.
--   ② 값을 정하는 곳은 **한 군데**다 (price_for). 두 군데면 반드시 갈라진다.
--   ③ 한 번 창립 멤버가 된 사람은 내려가지 않는다 (약관에 그렇게 적었다).
--
-- 적용:  supabase db push   또는 대시보드 SQL 편집기에 붙여넣기
-- ═══════════════════════════════════════════════════════════


-- ── 0. 상수 ────────────────────────────────────────────────
-- ⚠️ 정원과 할인율은 **약관에 적힌 수**다. 여기서 바꾸면 약관도 같이 고쳐야 한다.
--    코드만 바꾸면 우리가 우리 약관을 어기게 된다.
create or replace function public.founding_seats()
returns integer language sql immutable as $$ select 500 $$;

create or replace function public.founding_rate()
returns numeric language sql immutable as $$ select 0.5 $$;


-- ── 1. 창립 멤버 자격 판정 ──────────────────────────────────
-- 사전등록 선착순 500명. 순번은 등록 시각 오름차순.
--
-- ⚠️ row_number() 를 쓰는 이유 — created_at 이 같은 행이 있을 수 있다.
--    그때 순번이 흔들리면 501번째가 들어오거나 500번째가 빠진다. id 로 마지막을 끊는다.
-- ⚠️ security definer — waitlist 는 RLS 로 읽기가 막혀 있다 (이메일 목록 보호).
--    그래서 함수 안에서만 읽고, 밖으로는 true/false 만 내보낸다.
create or replace function public.is_founding_email(p_email text)
returns boolean
language sql security definer stable set search_path = public as $$
  select exists (
    select 1
    from (
      select email,
             row_number() over (order by created_at, id) as rn
      from public.waitlist
    ) t
    where t.email = lower(trim(p_email))
      and t.rn <= public.founding_seats()
  );
$$;

-- ⚠️ anon 에게 주지 않는다. 남의 이메일을 넣어 "이 사람 창립 멤버냐"를
--    확인하는 조회 도구가 되면 안 된다 (가입 여부가 새어 나간다).
revoke all on function public.is_founding_email(text) from public, anon, authenticated;
grant execute on function public.is_founding_email(text) to service_role;


-- ── 2. 방어벽에 문 하나 내기 ────────────────────────────────
-- ⚠️⚠️ **이걸 안 하면 아래 claim_founding 이 조용히 실패한다.**
--    schema.sql 의 guard_profile_columns() 트리거는 인증된 세션의 update 에서
--    founding_member 를 old 값으로 되돌린다 (tier·구독도 같이).
--    claim_founding 은 security definer 여도 **호출자의 세션**에서 돌기 때문에
--    auth.uid() 도 auth.role() 도 그대로 'authenticated' 다 → 트리거가 걸린다.
--    결과: 함수는 true 를 돌려주고 값은 false 로 남는다. 제일 나쁜 종류의 실패다.
--
-- ⚠️ 그렇다고 founding_member 를 그냥 열면 안 된다. 열면 누구나
--    PATCH /profiles {founding_member:true} 로 평생 반값을 자기에게 준다.
--    그래서 **거래(transaction) 안에서만 사는 표식**을 보고 문을 연다.
--    PostgREST 로는 임의 SQL 을 못 돌리므로 사용자가 이 표식을 스스로 세울 수 없다.
create or replace function public.guard_profile_columns()
returns trigger language plpgsql security definer as $$
begin
  if auth.uid() is not null and auth.role() = 'authenticated'
     and coalesce(current_setting('app.trusted_write', true), '') <> '1'
  then
    new.tier              := old.tier;
    new.founding_member   := old.founding_member;
    new.subscription_id   := old.subscription_id;
    new.subscription_ends := old.subscription_ends;
  end if;
  new.updated_at := now();
  return new;
end $$;

drop trigger if exists trg_guard_profile on public.profiles;
create trigger trg_guard_profile before update on public.profiles
  for each row execute function public.guard_profile_columns();


-- ── 3. 자격 굳히기 — 본인만, 본인 것만 ──────────────────────
-- 로그인한 사람이 스스로 부른다. 이메일을 **인자로 받지 않는다** —
-- 받으면 남의 이메일을 넣어 남의 자격을 자기 계정에 붙일 수 있다.
-- auth.uid() 로 본인을 찾고, auth.users 에서 **서버가 읽은** 이메일만 쓴다.
create or replace function public.claim_founding()
returns boolean
language plpgsql security definer set search_path = public as $$
declare
  uid   uuid := auth.uid();
  mail  text;
  cur   boolean;
  n     integer;
begin
  if uid is null then
    return false;                       -- 로그인 안 했으면 아무 일도 없다
  end if;

  select founding_member into cur from public.profiles where id = uid;
  if not found then
    return false;                       -- ⚠️ 프로필이 아직 없다 (가입 트리거 직후).
  end if;                               --    update 는 0행이 되는데 true 를 돌려주면 거짓말이다.
  if cur then
    return true;                        -- ⚠️ 이미 창립 멤버면 다시 판정하지 않는다.
  end if;                               --    약관상 한 번 얻으면 내려가지 않는다.

  select email into mail from auth.users where id = uid;
  if mail is null or not public.is_founding_email(mail) then
    return false;
  end if;

  -- ⚠️ 문을 열고 → 쓰고 → 반드시 닫는다.
  --    is_local=true 라 거래가 끝나면 저절로 사라지지만, 같은 거래 안의
  --    뒤따르는 문장까지 무방비가 되지 않도록 여기서 닫는다.
  perform set_config('app.trusted_write', '1', true);
  update public.profiles
     set founding_member = true, updated_at = now()
   where id = uid;
  get diagnostics n = row_count;
  perform set_config('app.trusted_write', '', true);

  return n > 0;                       -- 안 써졌으면 true 라고 하지 않는다
end $$;

revoke all on function public.claim_founding() from public, anon;
grant execute on function public.claim_founding() to authenticated;


-- ── 4. 주문에 할인 근거 남기기 ──────────────────────────────
-- ⚠️ 왜 반값이었는지 남기지 않으면 나중에 아무도 모른다.
--    환불 계산에도 필요하고, 정가가 바뀐 뒤 대사할 때도 필요하다.
alter table public.orders
  add column if not exists discount_kind text,
  add column if not exists discount_rate numeric(4,3),
  add column if not exists list_amount   integer;

comment on column public.orders.discount_kind is
  '할인 근거. null=정가, ''founding''=창립 멤버(약관 제8조 제7항)';
comment on column public.orders.list_amount is
  '할인 전 정가. ⚠️ 정가는 나중에 바뀐다 — 결제 시점 값을 여기 박아 둔다.';


-- ── 5. 값을 정하는 **유일한** 곳 ────────────────────────────
-- checkout 함수는 계산하지 않고 이것만 부른다.
-- ⚠️ 산술을 TypeScript 로 옮기지 말 것. plans 표가 여기 있고,
--    값이 두 군데서 계산되기 시작하면 반드시 갈라진다.
create or replace function public.price_for(p_user uuid, p_plan text)
returns table (
  amount        integer,
  list_amount   integer,
  currency      text,
  discount_kind text,
  discount_rate numeric
)
language plpgsql security definer stable set search_path = public as $$
declare
  p    public.plans%rowtype;
  fnd  boolean;
begin
  select * into p from public.plans where id = p_plan and active = true;
  if not found then
    raise exception 'UNKNOWN_PLAN';
  end if;

  select coalesce(founding_member, false) into fnd
    from public.profiles where id = p_user;

  list_amount := p.krw;
  currency    := 'KRW';

  if coalesce(fnd, false) then
    discount_kind := 'founding';
    discount_rate := public.founding_rate();
    -- ⚠️ floor 다. 반올림하면 1원 더 받는 경우가 생긴다 —
    --    약속은 "정가의 반값"이므로 애매할 때는 손님 쪽으로 내린다.
    -- ⚠️ KRW 는 최소 단위가 원이라 그대로 쓴다. 통화가 늘면 여기부터 고친다.
    amount := floor(p.krw * (1 - public.founding_rate()))::integer;
  else
    discount_kind := null;
    discount_rate := null;
    amount := p.krw;
  end if;

  return next;
end $$;

revoke all on function public.price_for(uuid, text) from public, anon, authenticated;
grant execute on function public.price_for(uuid, text) to service_role;


-- ── 6. 남은 자리 ────────────────────────────────────────────
-- ⚠️ 화면은 waitlist_count() 로 이미 세고 있다 (schema.sql).
--    여기서는 서버가 쓸 잔여 수만 따로 둔다.
create or replace function public.founding_left()
returns integer
language sql security definer stable set search_path = public as $$
  select greatest(0, public.founding_seats() - (select count(*)::int from public.waitlist));
$$;
grant execute on function public.founding_left() to anon, authenticated, service_role;
