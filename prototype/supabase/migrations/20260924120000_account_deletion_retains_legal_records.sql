-- EARTHUS — 계정 삭제가 법정 보존 기록(결제 주문·동의 이력)까지 지우던 것을 막는다 (2026-09-24)
--
-- ⚠️ 초안이다. 이 세션에서 운영 DB 에 적용하지 않았다. PD 가 검토하고 SQL 편집기에서 적용한다.
-- ⚠️ 판매가 닫혀 있는 지금(SALES_OPEN=false) 운영 orders 에 실결제 행은 없다(FOUNDING-500 §0 — 검증 행은 롤백됨).
--    그래서 지금은 동의 이력 쪽만 실제로 쓰인다. 판매를 열기 **전에** 적용해 두어야 첫 결제부터 보존된다.
--
-- 무엇이 잘못돼 있었나
--   ① orders.user_id  → references auth.users(id) on delete cascade   (billing.sql:93)
--   ② consents.user_id → references auth.users(id) on delete cascade   (schema.sql:82)
--   delete_own_account() 가 auth.users 를 지우면(schema.sql:158 — 2026-09-24 정정 주석을 더한 뒤 번호) 이 둘이 **함께 지워진다.**
--   - 전자상거래법 제6조 · 시행령 제6조: 계약·청약철회 기록 5년, 대금결제·재화공급 기록 5년 보존.
--     유료 판매가 열린 뒤 구매자가 계정을 지우면 그 5년 기록이 즉시 사라진다 — 법 위반이다.
--   - schema.sql:150-152 주석("동의 이력은 … 개인 식별자만 끊는다", 삭제문은 주석 처리)과
--     schema.sql:100 주석("아무도 못 고치고 못 지운다")은 **사실이 아니었다.** 삭제문을 주석으로 막아도
--     외래키 cascade 가 지운다. RLS 는 cascade 를 막지 못한다.
--   - 약관 제5조 제3항("관계 법령에 따라 보존 의무가 있는 정보는 해당 기간 동안 분리 보관")도 코드와 달랐다.
--
-- 어떻게 고치나 — 원본 표는 그대로, 삭제 직전에 **최소 항목만** 분리 보관 표로 옮긴다
--   - auth.users 에 BEFORE DELETE 행 트리거를 건다. 앱 안 삭제(delete_own_account)뿐 아니라
--     대시보드·관리 API 로 지운 경우도 같은 길을 탄다. (선례: on_auth_user_created 도 auth.users 트리거다)
--   - 트리거는 cascade **전에** 돈다 — 그때 orders·consents 행과 auth.users.email 이 아직 있다.
--     ⚠️ orders·consents 에 트리거를 걸면 안 된다: delete_own_account() 가 profiles 를 먼저 지우고,
--        cascade 시점에는 누구의 기록인지 이을 방법이 없다.
--   - 원본 orders·consents 의 외래키·cascade 는 **건드리지 않는다.** 살아 있는 표의 뜻(본인 주문만 읽기 등)이
--     그대로이고, 되돌리기도 트리거 하나 지우면 끝난다.
--
-- 무엇을 남기고 무엇을 남기지 않나 (개인정보 보호법 제21조 제3항 — 분리 보관 · 최소한)
--   - 이메일 **평문을 남기지 않는다.** lower(trim(email)) 의 SHA-256 만 남긴다(email_sha256).
--     분쟁·환불 문의가 오면 문의자의 이메일을 같은 식으로 바꿔 대조한다. 이름·로그인 방식·계정 id 는 남기지 않는다.
--     ⚠️ SHA-256 은 비밀 키가 없어 흔한 주소는 사전 대입으로 되돌릴 수 있다 — 가명 수준이지 익명이 아니다.
--        평문 이메일이나 이름이 법정 보존에 꼭 필요하다고 변호사가 보면 그때 칸을 더한다(지금은 더하지 않는다).
--   - 주문: status 가 paid·refunded 인 것만(계약이 성립한 것). pending·failed·canceled 는 계약이 아니므로 옮기지 않는다.
--     금액·통화·상품·결제수단·PG 결제키·승인·환불(PG 환불 거래키 포함)·할인 근거·적용 기간만. 카드 정보는 원래 우리 DB 에 없다.
--     환불 사유(refund_reason)는 자유 글이라 개인 사정이 섞일 수 있어 옮기지 않는다.
--   - 보존 기한: 주문 = 거래 시각(환불 > 승인 > 생성) + 5년. 이미 5년이 지난 주문은 옮기지 않는다.
--   - 동의 이력: 동의 항목·문서 버전·시각 + email_sha256. 보존 기한 = 계정 삭제 + 3년.
--     ⚠️⚠️ 동의 이력 보존은 **PD 결정 대기**다 — 처리방침 개정안 제3조·계정 삭제 안내 초안의
--        {{PD 택1 — A: 계정 삭제 후 3년 / B: 즉시 파기}}. 이 파일은 **A** 를 구현한다.
--        B 로 정하면 아래 §3 의 consents 부분(표·insert)을 빼고 적용한다 — 파일 끝 '동의 B 선택 시' 참고.
--   - 기한이 지난 행은 purge_expired_retained_records() 가 지운다. **스케줄은 걸지 않았다** —
--     expiry-cron.sql 처럼 PD 가 pg_cron 에 건다(아래 '적용 뒤' 참고).
--
-- 남은 한계 (이 파일이 풀지 않는 것)
--   - 계정을 지운 구매자의 7일 안 청약철회: payment-refund 함수는 살아 있는 orders 표를 읽는다.
--     삭제 뒤 환불은 PD 가 토스·Play 콘솔에서 직접 하고, retained_orders 에 환불을 손으로 적는다.
--   - member_invites.claimed_by · member_access_audit · admin_audit_log · staff_roles.granted_by 등은
--     auth.users 를 on delete 규칙 없이(=NO ACTION) 가리킨다 — 그런 행이 있는 계정은 **삭제 자체가 실패**한다.
--     이 파일의 범위가 아니다(별도 작업으로 확인할 것).
--   - 소비자 불만·분쟁 처리 기록(3년)은 지금 DB 에 표가 없다(메일로 받는다). 메일 보관으로 채운다.

-- 적용 전 확인 (DB 접근이 필요해 이 세션에서 못 했다)
--   트리거 함수가 orders 의 refunded_at·refund_amount·refund_transaction_key(refund.sql)와 discount_kind·discount_rate·list_amount(founding.sql)를 읽는다.
--   plpgsql 은 만들 때가 아니라 **처음 돌 때** 칸을 찾는다 — 칸이 없으면 그때 계정 삭제가 실패한다. 먼저 본다:
--     select column_name from information_schema.columns
--      where table_schema = 'public' and table_name = 'orders'
--        and column_name in ('refunded_at','refund_amount','refund_transaction_key','discount_kind','discount_rate','list_amount');
--   → 여섯 줄이 나와야 한다. 모자라면 refund.sql · founding.sql 을 먼저 적용한다.

-- ═══════════════════════════════════════════════════════════
-- 1. 분리 보관 표 — 주문
-- ═══════════════════════════════════════════════════════════
create table if not exists public.retained_orders (
  order_id        text primary key,            -- orders.id 그대로(PG 에 보낸 주문번호 — 토스·Play 대사용)
  email_sha256    text,                        -- lower(trim(email)) 의 SHA-256 hex. 평문 없음
  plan_id         text not null,
  amount          integer not null,            -- 최소 단위(KRW=원, USD=센트) — orders.amount 와 같다
  currency        text not null,
  status          text not null check (status in ('paid','refunded')),
  provider        text not null,
  payment_key     text,
  approved_at     timestamptz,
  grants_until    timestamptz,
  refunded_at     timestamptz,
  refund_amount   integer,
  refund_transaction_key text,                 -- PG 환불 거래키(토스 cancel transactionKey) — 청약철회 기록을 PG 와 대사할 때
  discount_kind   text,                        -- 'founding' = 창립 멤버 50%(약관 제8조 제7항) — 왜 반값이었는지
  discount_rate   numeric(4,3),
  list_amount     integer,
  order_created_at timestamptz not null,
  account_deleted_at timestamptz not null default now(),
  retain_until    timestamptz not null         -- 거래 시각 + 5년(전자상거래법 시행령 제6조)
);

-- ═══════════════════════════════════════════════════════════
-- 2. 분리 보관 표 — 동의 이력 (PD 선택 A)
-- ═══════════════════════════════════════════════════════════
create table if not exists public.retained_consents (
  consent_id       bigint primary key,         -- consents.id 그대로
  email_sha256     text,
  tos_agreed       boolean not null,
  privacy_agreed   boolean not null,
  over_14          boolean not null,
  marketing_agreed boolean not null,
  location_agreed  boolean not null,
  usage_agreed     boolean not null,
  tos_version      text,
  privacy_version  text,
  agreed_at        timestamptz not null,
  account_deleted_at timestamptz not null default now(),
  retain_until     timestamptz not null        -- 계정 삭제 + 3년(처리방침 개정안 제3조 선택 A)
);

-- ⚠️ RLS 를 켜고 정책을 **하나도 두지 않는다** = anon·authenticated 는 읽지도 쓰지도 못한다.
--    service_role(대시보드·Edge Function)만 본다. 삭제된 계정은 로그인할 수 없으니 '본인 읽기'도 두지 않는다.
alter table public.retained_orders   enable row level security;
alter table public.retained_consents enable row level security;
revoke all on public.retained_orders   from public, anon, authenticated;
revoke all on public.retained_consents from public, anon, authenticated;

create index if not exists idx_retained_orders_email   on public.retained_orders(email_sha256);
create index if not exists idx_retained_orders_until   on public.retained_orders(retain_until);
create index if not exists idx_retained_consents_email on public.retained_consents(email_sha256);
create index if not exists idx_retained_consents_until on public.retained_consents(retain_until);

comment on table public.retained_orders is
  '계정 삭제 뒤 분리 보관하는 결제 기록(전자상거래법 5년). 평문 이메일 없음 — email_sha256 = sha256(lower(trim(email))). 2026-09-24';
comment on table public.retained_consents is
  '계정 삭제 뒤 분리 보관하는 동의 이력(삭제 후 3년, PD 선택 A). 2026-09-24';

-- ═══════════════════════════════════════════════════════════
-- 3. 삭제 직전에 옮기는 트리거 — auth.users BEFORE DELETE
-- ═══════════════════════════════════════════════════════════
create or replace function public.retain_legal_records_before_user_delete()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  -- ⚠️ sha256() 는 PostgreSQL 11+ 기본 함수다(pgcrypto 불필요).
  h text := case when old.email is null or trim(old.email) = '' then null
                 else encode(sha256(convert_to(lower(trim(old.email)), 'UTF8')), 'hex') end;
begin
  -- 주문 — 계약이 성립한 것(paid·refunded)만, 거래 시각 + 5년이 아직 안 지난 것만
  insert into public.retained_orders (
    order_id, email_sha256, plan_id, amount, currency, status, provider, payment_key,
    approved_at, grants_until, refunded_at, refund_amount, refund_transaction_key, discount_kind, discount_rate, list_amount,
    order_created_at, retain_until)
  select o.id, h, o.plan_id, o.amount, o.currency, o.status, o.provider, o.payment_key,
         o.approved_at, o.grants_until, o.refunded_at, o.refund_amount, o.refund_transaction_key, o.discount_kind, o.discount_rate, o.list_amount,
         o.created_at,
         coalesce(o.refunded_at, o.approved_at, o.created_at) + interval '5 years'
    from public.orders o
   where o.user_id = old.id
     and o.status in ('paid', 'refunded')
     and coalesce(o.refunded_at, o.approved_at, o.created_at) + interval '5 years' > now()
  on conflict (order_id) do nothing;         -- 두 번 불려도 한 줄

  -- 동의 이력 — PD 선택 A(삭제 후 3년). B 로 정하면 이 insert 를 뺀다.
  insert into public.retained_consents (
    consent_id, email_sha256, tos_agreed, privacy_agreed, over_14, marketing_agreed, location_agreed, usage_agreed,
    tos_version, privacy_version, agreed_at, retain_until)
  select c.id, h, c.tos_agreed, c.privacy_agreed, c.over_14, c.marketing_agreed, c.location_agreed, c.usage_agreed,
         c.tos_version, c.privacy_version, c.agreed_at,
         now() + interval '3 years'
    from public.consents c
   where c.user_id = old.id
  on conflict (consent_id) do nothing;

  -- ⚠️ 여기서 예외를 삼키지 않는다. 옮기지 못했으면 삭제도 멈춰야 한다 —
  --    기록 없이 계정만 지워지는 것이 이 파일이 막으려는 사고다. (사용자는 '삭제 실패'를 보고 다시 시도한다)
  return old;
end $$;

revoke all on function public.retain_legal_records_before_user_delete() from public, anon, authenticated;

drop trigger if exists trg_retain_legal_records_before_user_delete on auth.users;
create trigger trg_retain_legal_records_before_user_delete
  before delete on auth.users
  for each row execute function public.retain_legal_records_before_user_delete();

-- ═══════════════════════════════════════════════════════════
-- 4. 기한이 지난 보존 기록 파기 — 부르는 쪽은 service_role(pg_cron) 뿐
-- ═══════════════════════════════════════════════════════════
create or replace function public.purge_expired_retained_records()
returns table (orders_purged integer, consents_purged integer)
language plpgsql security definer set search_path = public as $$
begin
  delete from public.retained_orders where retain_until <= now();
  get diagnostics orders_purged = row_count;
  delete from public.retained_consents where retain_until <= now();
  get diagnostics consents_purged = row_count;
  return next;
end $$;

revoke all on function public.purge_expired_retained_records() from public, anon, authenticated;
grant execute on function public.purge_expired_retained_records() to service_role;

-- ═══════════════════════════════════════════════════════════
-- 적용 뒤 (PD)
-- ═══════════════════════════════════════════════════════════
-- 1) 트리거가 걸렸는지:
--      select tgname from pg_trigger where tgrelid = 'auth.users'::regclass and not tgisinternal;
--    → trg_retain_legal_records_before_user_delete 가 보여야 한다.
-- 2) 시험(거래 안에서 하고 되돌린다 — founding-verify.sql 과 같은 방식):
--      begin;
--        insert into auth.users (id, email) values ('00000000-0000-0000-0000-00000000d001', 'Retain.Test@Example.com');
--        insert into public.consents (user_id, tos_agreed, privacy_agreed, over_14) values ('00000000-0000-0000-0000-00000000d001', true, true, true);
--        insert into public.orders (id, user_id, plan_id, amount, status, approved_at)
--          values ('retain-test-1', '00000000-0000-0000-0000-00000000d001', 'earthus.pro.monthly', 9900, 'paid', now());
--        delete from auth.users where id = '00000000-0000-0000-0000-00000000d001';
--        select count(*) from public.orders where id = 'retain-test-1';               -- 0 (원본은 cascade 로 지워짐)
--        select email_sha256 = encode(sha256(convert_to('retain.test@example.com','UTF8')),'hex'), retain_until > now() + interval '4 years'
--          from public.retained_orders where order_id = 'retain-test-1';               -- t, t
--        select count(*) from public.retained_consents where email_sha256 = encode(sha256(convert_to('retain.test@example.com','UTF8')),'hex');  -- 1
--      rollback;
--    ⚠️ auth.users 에 직접 insert 가 막혀 있으면 대시보드에서 시험 계정을 만들어 같은 순서로 본다.
--    (2026-09-24 검수 추가) 더 넓은 시험은 prototype/supabase/account-deletion-retention-verify.sql 이다 — 통째로 돌리면
--    pending·failed·6년 지난 주문 제외 · 환불·할인 칸 · 이메일 없는 계정 · anon/authenticated 차단 · 파기까지 보고 rollback 한다.
--    로컬 postgres:17(가짜 auth 스키마)에서 이 마이그레이션을 두 번 적용하고 그 파일을 돌려 통과한 것을 확인했다(운영 적용은 아님).
-- 3) 파기 스케줄(expiry-cron.sql 과 같은 꼴 — 이름으로 지우고 다시 건다, UTC 15:47 = KST 00:47):
--      select cron.unschedule(jobid) from cron.job where jobname = 'earthus-purge-retained-records';
--      select cron.schedule('earthus-purge-retained-records', '47 15 * * *',
--        $cron$select public.purge_expired_retained_records();$cron$);
-- 4) 처리방침 개정안 제3조·계정 삭제 안내 초안의 {{PD 택1}} 을 'A: 계정 삭제 후 3년' 으로 채운다.

-- ═══════════════════════════════════════════════════════════
-- 롤백
-- ═══════════════════════════════════════════════════════════
-- 트리거와 함수만 지운다. 그러면 계정 삭제가 예전처럼(보존 없이 cascade) 돌아간다.
--   drop trigger if exists trg_retain_legal_records_before_user_delete on auth.users;
--   drop function if exists public.retain_legal_records_before_user_delete();
--   drop function if exists public.purge_expired_retained_records();
-- ⚠️⚠️ retained_orders · retained_consents 표는 **롤백에서 지우지 않는다.** 이미 옮겨진 행은 법정 보존 기록이다 —
--    표를 지우는 것은 되돌리기가 아니라 기록 파기다. 비어 있는 것을 확인한 뒤에만 사람이 따로 지운다:
--      select (select count(*) from public.retained_orders) as o, (select count(*) from public.retained_consents) as c;

-- 동의 B 선택 시(계정 삭제 때 즉시 파기):
--   §2 표를 만들지 않고, §3 함수에서 retained_consents insert 문을 뺀 채 적용한다.
--   §4 함수의 retained_consents 줄도 뺀다.
