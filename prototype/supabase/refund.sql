-- earthus — 토스 전액 환불 반영
--
-- payment-refund Edge Function 이 PG 취소 성공 뒤 호출한다.
-- ⚠️ 환불액의 정본은 plans.krw 가 아니라 orders.amount 다.
-- ⚠️ 이용권 회수와 주문 상태 변경은 같은 거래에서 끝낸다.

alter table public.orders
  add column if not exists refunded_at timestamptz,
  add column if not exists refund_amount integer,
  add column if not exists refund_reason text,
  add column if not exists refund_transaction_key text;

create or replace function public.refund_paid_order(
  p_order_id text,
  p_refund_amount integer,
  p_reason text,
  p_transaction_key text default null
) returns table (ok boolean, tier text, ends timestamptz, already boolean)
language plpgsql security definer set search_path = public as $$
declare
  o public.orders%rowtype;
  current_order text;
  previous_order text;
  previous_ends timestamptz;
  next_tier text;
  next_ends timestamptz;
begin
  select * into o from public.orders where id = p_order_id for update;
  if not found then
    raise exception 'ORDER_NOT_FOUND';
  end if;

  if o.status = 'refunded' then
    select p.tier, p.subscription_ends into tier, ends
      from public.profiles p where p.id = o.user_id;
    ok := true; already := true;
    return next;
    return;
  end if;

  if o.status <> 'paid' then
    raise exception 'ORDER_NOT_PAID';
  end if;
  if p_refund_amount is null or p_refund_amount <> o.amount then
    raise exception 'REFUND_AMOUNT_MISMATCH';
  end if;

  select p.subscription_id into current_order
    from public.profiles p where p.id = o.user_id for update;
  -- ⚠️ 과거 주문을 중간에서 빼면 뒤 주문의 기간을 다시 계산해야 한다.
  --    지금은 최신 주문만 받아 조용히 기간이 꼬이는 길을 닫는다.
  if current_order is distinct from p_order_id then
    raise exception 'NOT_LATEST_ORDER';
  end if;

  select po.id, po.grants_until into previous_order, previous_ends
    from public.orders po
   where po.user_id = o.user_id
     and po.id <> o.id
     and po.status = 'paid'
     and po.grants_until is not null
   order by po.grants_until desc, po.created_at desc
   limit 1;

  if previous_ends is not null and previous_ends > now() then
    next_tier := 'paid'; next_ends := previous_ends;
  else
    next_tier := 'free'; next_ends := null;
    previous_order := null;
  end if;

  update public.profiles
     set tier = next_tier,
         subscription_id = previous_order,
         subscription_ends = next_ends,
         updated_at = now()
   where id = o.user_id;

  update public.orders
     set status = 'refunded',
         refunded_at = now(),
         refund_amount = o.amount,
         refund_reason = left(coalesce(p_reason, ''), 200),
         refund_transaction_key = nullif(left(coalesce(p_transaction_key, ''), 200), ''),
         updated_at = now()
   where id = o.id;

  ok := true; tier := next_tier; ends := next_ends; already := false;
  return next;
end $$;

revoke all on function public.refund_paid_order(text, integer, text, text)
  from public, anon, authenticated;
grant execute on function public.refund_paid_order(text, integer, text, text)
  to service_role;
