-- 결제 환불은 관리자 초대 자격을 취소하지 않는다.
create or replace function public.refund_paid_order(
  p_order_id text, p_refund_amount integer, p_reason text,
  p_transaction_key text default null
) returns table (ok boolean, tier text, ends timestamptz, already boolean)
language plpgsql security definer set search_path = public as $$
declare
  o public.orders%rowtype;
  current_order text; previous_order text;
  previous_ends timestamptz; manual_ends timestamptz;
  next_tier text; next_ends timestamptz;
begin
  select * into o from public.orders where id=p_order_id for update;
  if not found then raise exception 'ORDER_NOT_FOUND'; end if;
  if o.status='refunded' then
    select p.tier,p.subscription_ends into tier,ends from public.profiles p where p.id=o.user_id;
    ok:=true; already:=true; return next; return;
  end if;
  if o.status<>'paid' then raise exception 'ORDER_NOT_PAID'; end if;
  if p_refund_amount is null or p_refund_amount<>o.amount then raise exception 'REFUND_AMOUNT_MISMATCH'; end if;
  select p.subscription_id,p.manual_access_until into current_order,manual_ends
    from public.profiles p where p.id=o.user_id for update;
  if current_order is distinct from p_order_id then raise exception 'NOT_LATEST_ORDER'; end if;
  select po.id,po.grants_until into previous_order,previous_ends from public.orders po
   where po.user_id=o.user_id and po.id<>o.id and po.status='paid'
     and po.grants_until is not null
   order by po.grants_until desc,po.created_at desc limit 1;
  if previous_ends is not null and previous_ends>now() then
    next_ends:=previous_ends;
  else
    next_ends:=null; previous_order:=null;
  end if;
  next_tier:=case when next_ends is not null or (manual_ends is not null and manual_ends>now())
                   then 'paid' else 'free' end;
  update public.profiles set tier=next_tier,subscription_id=previous_order,
    subscription_ends=next_ends,updated_at=now() where id=o.user_id;
  update public.orders set status='refunded',refunded_at=now(),refund_amount=o.amount,
    refund_reason=left(coalesce(p_reason,''),200),
    refund_transaction_key=nullif(left(coalesce(p_transaction_key,''),200),''),updated_at=now()
   where id=o.id;
  ok:=true;tier:=next_tier;ends:=next_ends;already:=false;return next;
end $$;
revoke all on function public.refund_paid_order(text,integer,text,text) from public,anon,authenticated;
grant execute on function public.refund_paid_order(text,integer,text,text) to service_role;
