-- earthus — 전액 환불 DB 반영 자가 검증
-- 전체 거래를 rollback 하므로 시험 계정·주문이 남지 않는다.

begin;

do $$
declare
  uid uuid := '00000000-0000-4000-8000-0000000000fe';
  mail text := 'verify-refund-test@earthus.invalid';
  oid text := 'earthus-refund-verify-order';
  planid text;
  got_status text;
  got_amount integer;
  got_tier text;
  got_ends timestamptz;
  got_already boolean;
begin
  insert into auth.users (id, email, aud, role, instance_id)
    values (uid, mail, 'authenticated', 'authenticated',
            '00000000-0000-0000-0000-000000000000');

  insert into public.profiles
    (id, email, tier, subscription_id, subscription_ends)
  values
    (uid, mail, 'paid', oid, now() + interval '1 month')
  on conflict (id) do update
    set tier = excluded.tier,
        subscription_id = excluded.subscription_id,
        subscription_ends = excluded.subscription_ends;

  select id into planid from public.plans where active = true order by sort, id limit 1;
  if planid is null then raise exception '활성 요금제가 없다'; end if;

  insert into public.orders
    (id, user_id, plan_id, amount, currency, status, provider,
     payment_key, approved_at, grants_until)
  values
    (oid, uid, planid, 2950, 'KRW', 'paid', 'toss',
     'verify-payment-key', now(), now() + interval '1 month');

  -- 할인 전 정가를 잘못 쓰면 반드시 거절해야 한다.
  begin
    perform public.refund_paid_order(oid, 5900, 'wrong amount', null);
    raise exception '금액 불일치를 허용했다';
  exception when others then
    if sqlerrm = '금액 불일치를 허용했다' then raise; end if;
    if sqlerrm <> 'REFUND_AMOUNT_MISMATCH' then raise; end if;
  end;

  select status into got_status from public.orders where id = oid;
  if got_status <> 'paid' then raise exception '거절 뒤 주문 상태가 바뀌었다'; end if;

  select r.tier, r.ends, r.already
    into got_tier, got_ends, got_already
    from public.refund_paid_order(oid, 2950, '7일 이내 청약철회', 'verify-tx') r;
  if got_tier <> 'free' or got_ends is not null or got_already then
    raise exception '첫 환불의 이용권 회수가 틀렸다';
  end if;

  select status, refund_amount into got_status, got_amount
    from public.orders where id = oid;
  if got_status <> 'refunded' or got_amount <> 2950 then
    raise exception '실제 청구액 2950원이 환불 기록에 남지 않았다';
  end if;

  select r.already into got_already
    from public.refund_paid_order(oid, 2950, '재시도', 'verify-tx') r;
  if not got_already then raise exception '재시도가 멱등하지 않다'; end if;
end $$;

rollback;
