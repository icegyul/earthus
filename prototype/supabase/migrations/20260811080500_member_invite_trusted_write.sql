-- 초대 claim은 인증 세션에서 실행된다. trusted_write를 열지 않으면 보호 트리거가
-- 성공처럼 값을 되돌리므로, 운영에 사용되기 전에 원자적으로 바로잡는다.

create or replace function public.guard_profile_columns()
returns trigger language plpgsql security definer as $$
begin
  if auth.uid() is not null and auth.role() = 'authenticated'
     and coalesce(current_setting('app.trusted_write', true), '') <> '1'
  then
    new.tier                 := old.tier;
    new.founding_member      := old.founding_member;
    new.subscription_id      := old.subscription_id;
    new.subscription_ends    := old.subscription_ends;
    new.manual_access_until  := old.manual_access_until;
    new.manual_access_kind   := old.manual_access_kind;
    new.manual_access_reason := old.manual_access_reason;
  end if;
  new.updated_at := now();
  return new;
end $$;

create or replace function public.claim_member_invite()
returns boolean language plpgsql security definer set search_path = public, auth as $$
declare
  uid uuid := auth.uid();
  mail text;
  inv public.member_invites%rowtype;
  n integer;
begin
  if uid is null then return false; end if;
  select lower(email) into mail from auth.users where id = uid;
  if mail is null then return false; end if;
  select * into inv from public.member_invites
   where lower(email) = mail and revoked_at is null and claimed_at is null
     and starts_at <= now() and ends_at > now()
   order by ends_at desc limit 1 for update skip locked;
  if not found then return false; end if;

  perform set_config('app.trusted_write', '1', true);
  update public.profiles set tier='paid', manual_access_until=inv.ends_at,
    manual_access_kind=inv.kind, manual_access_reason=inv.reason, updated_at=now()
   where id=uid;
  get diagnostics n = row_count;
  perform set_config('app.trusted_write', '', true);
  if n <> 1 then return false; end if;

  update public.member_invites set claimed_by=uid, claimed_at=now() where id=inv.id;
  insert into public.member_access_audit(actor_id,target_user_id,invite_id,action,detail)
  values(inv.created_by,uid,inv.id,'invite_claimed',jsonb_build_object('ends_at',inv.ends_at,'kind',inv.kind));
  return true;
end $$;
revoke all on function public.claim_member_invite() from public, anon;
grant execute on function public.claim_member_invite() to authenticated;
