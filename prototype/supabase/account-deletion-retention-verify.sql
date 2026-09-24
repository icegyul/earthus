-- EARTHUS — 계정 삭제 보존 트리거 검증 (2026-09-24)
--
-- migrations/20260924120000_account_deletion_retains_legal_records.sql 을 적용한 **뒤에** SQL 편집기에서 통째로 돌린다.
-- 전부 한 거래 안에서 하고 마지막에 rollback 한다 — 운영 표에 아무것도 남지 않는다(founding-verify.sql · refund-verify.sql 과 같은 방식).
-- 끝까지 가면 NOTICE 로 SCENARIO_OK · PRIV_AUTH_OK · PRIV_ANON_OK · PURGE_OK 네 줄이 나온다. 하나라도 틀리면 ASSERT 가 멈춘다.
--
-- ⚠️ 이 파일은 2026-09-24 검수에서 로컬 postgres:17-alpine 컨테이너(auth.users·auth.uid()·역할 anon/authenticated/service_role 을
--    흉내 낸 가짜)에 schema.sql·refund.sql·founding.sql 과 위 마이그레이션을 올려 **실제로 돌려 통과한 것**을 옮겨 적었다.
--    운영 Supabase 의 auth.users 는 칸이 더 많다 — insert 가 막히면 대시보드에서 시험 계정을 만들고 그 id 로 바꿔 돌린다.
-- ⚠️ plans 에 'earthus.pro.monthly' 행이 있어야 한다(billing.sql). 금액 9900 은 그 행의 현행 값을 그대로 쓴 시험값이다.

begin;

-- 사용자 A: 앱 안 삭제(delete_own_account) 경로 — 이메일 앞뒤 공백·대문자는 해시 전에 정규화된다
insert into auth.users (id, email) values ('00000000-0000-0000-0000-00000000d00a', '  Retain.Test@Example.com ');
insert into public.consents (user_id, tos_agreed, privacy_agreed, over_14, tos_version)
  values ('00000000-0000-0000-0000-00000000d00a', true, true, true, 'verify-1');
insert into public.consents (user_id, tos_agreed, privacy_agreed, over_14, marketing_agreed, tos_version)
  values ('00000000-0000-0000-0000-00000000d00a', true, true, true, true, 'verify-2');
insert into public.orders (id, user_id, plan_id, amount, status, approved_at, payment_key) values
  ('verify-A-paid',    '00000000-0000-0000-0000-00000000d00a', 'earthus.pro.monthly', 9900, 'paid',    now(), 'pk_verify_a'),
  ('verify-A-pending', '00000000-0000-0000-0000-00000000d00a', 'earthus.pro.monthly', 9900, 'pending', null,  null),
  ('verify-A-failed',  '00000000-0000-0000-0000-00000000d00a', 'earthus.pro.monthly', 9900, 'failed',  null,  null),
  ('verify-A-old',     '00000000-0000-0000-0000-00000000d00a', 'earthus.pro.monthly', 9900, 'paid',    now() - interval '6 years', 'pk_verify_old');
insert into public.orders (id, user_id, plan_id, amount, status, approved_at, refunded_at, refund_amount, refund_reason,
                           refund_transaction_key, discount_kind, discount_rate, list_amount) values
  ('verify-A-refunded', '00000000-0000-0000-0000-00000000d00a', 'earthus.pro.monthly', 4950, 'refunded',
   now() - interval '10 days', now() - interval '3 days', 4950, '자유 글 사유(옮기면 안 됨)', 'rtk_verify', 'founding', 0.5, 9900);

-- 사용자 B: 대시보드·관리 API 경로(auth.users 직접 삭제) · 이메일 없음
insert into auth.users (id, email) values ('00000000-0000-0000-0000-00000000d00b', null);
insert into public.consents (user_id, tos_agreed, privacy_agreed, over_14)
  values ('00000000-0000-0000-0000-00000000d00b', true, true, true);

select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-00000000d00a', true);
select set_config('request.jwt.claim.role', 'authenticated', true);
select public.delete_own_account();
select set_config('request.jwt.claim.sub', '', true);
delete from auth.users where id = '00000000-0000-0000-0000-00000000d00b';

do $$
declare h text := encode(sha256(convert_to('retain.test@example.com', 'UTF8')), 'hex');
begin
  assert (select count(*) from public.orders where id like 'verify-A-%') = 0, 'orders 원본은 cascade 로 지워져야 한다';
  assert (select count(*) from public.consents where user_id in ('00000000-0000-0000-0000-00000000d00a', '00000000-0000-0000-0000-00000000d00b')) = 0,
    'consents 원본은 cascade 로 지워져야 한다';
  assert (select array_agg(order_id order by order_id) from public.retained_orders where order_id like 'verify-A-%')
         = array['verify-A-paid', 'verify-A-refunded'], 'paid·refunded 이고 5년 안인 주문만 보존(pending·failed·6년 지난 것 제외)';
  assert (select bool_and(email_sha256 = h) from public.retained_orders where order_id like 'verify-A-%'), '이메일은 lower(trim()) 해시로만';
  assert (select retain_until between now() + interval '5 years' - interval '4 days' and now() + interval '5 years'
            from public.retained_orders where order_id = 'verify-A-refunded'), '보존 기한 = 환불 시각 + 5년';
  assert (select discount_kind = 'founding' and discount_rate = 0.5 and list_amount = 9900 and refund_amount = 4950
                 and refund_transaction_key = 'rtk_verify'
            from public.retained_orders where order_id = 'verify-A-refunded'), '할인 근거·환불 금액·환불 거래키가 옮겨져야 한다';
  assert (select count(*) from public.retained_consents where email_sha256 = h and tos_version like 'verify-%') = 2, '동의 2건 보존';
  assert (select count(*) from public.retained_consents where email_sha256 is null
            and account_deleted_at >= now() - interval '1 minute') >= 1, '이메일 없는 계정의 동의도 보존(해시 null)';
  raise notice 'SCENARIO_OK';
end $$;

-- 권한: authenticated·anon 은 보존 표를 못 읽고 파기 함수를 못 부른다
set local role authenticated;
do $$ begin
  begin perform 1 from public.retained_orders;   raise exception 'authenticated 가 retained_orders 를 읽었다';
  exception when insufficient_privilege then null; end;
  begin perform 1 from public.retained_consents; raise exception 'authenticated 가 retained_consents 를 읽었다';
  exception when insufficient_privilege then null; end;
  begin perform public.purge_expired_retained_records(); raise exception 'authenticated 가 파기 함수를 불렀다';
  exception when insufficient_privilege then null; end;
  raise notice 'PRIV_AUTH_OK';
end $$;
reset role;
set local role anon;
do $$ begin
  begin perform 1 from public.retained_orders; raise exception 'anon 이 retained_orders 를 읽었다';
  exception when insufficient_privilege then null; end;
  raise notice 'PRIV_ANON_OK';
end $$;
reset role;

-- 파기: 기한이 지난 행만 지운다(service_role 로)
update public.retained_orders set retain_until = now() - interval '1 second' where order_id = 'verify-A-paid';
set local role service_role;
select * from public.purge_expired_retained_records();
reset role;
do $$ begin
  assert (select array_agg(order_id) from public.retained_orders where order_id like 'verify-A-%') = array['verify-A-refunded'],
    '기한 지난 행만 파기';
  raise notice 'PURGE_OK';
end $$;

rollback;
