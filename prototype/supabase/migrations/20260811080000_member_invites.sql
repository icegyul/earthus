-- 관리자 유료 초대 — 결제 구독과 별도로 보존한다.
-- ⚠️ profiles.tier 는 빠른 화면 판정용 캐시다. 결제 또는 수동 초대 중 하나가
-- 살아 있으면 paid 이며, 한쪽을 취소해 다른 쪽 자격까지 없애면 안 된다.

alter table public.profiles
  add column if not exists manual_access_until timestamptz,
  add column if not exists manual_access_kind text,
  add column if not exists manual_access_reason text;

create table if not exists public.member_invites (
  id uuid primary key default gen_random_uuid(),
  email text not null,
  kind text not null check (kind in ('test','academic','operations')),
  reason text not null check (char_length(reason) between 2 and 300),
  starts_at timestamptz not null default now(),
  ends_at timestamptz not null,
  created_by uuid not null references auth.users(id),
  claimed_by uuid references auth.users(id),
  claimed_at timestamptz,
  revoked_by uuid references auth.users(id),
  revoked_at timestamptz,
  created_at timestamptz not null default now(),
  check (ends_at > starts_at)
);
create unique index if not exists member_invites_one_active_email
  on public.member_invites (lower(email)) where revoked_at is null and claimed_at is null;
create index if not exists member_invites_claimed on public.member_invites(claimed_by, ends_at desc);
alter table public.member_invites enable row level security;
-- 정책 없음: 브라우저에서 직접 읽고 쓰지 않는다. 관리자 Edge Function만 service_role로 처리.

create table if not exists public.member_access_audit (
  id bigint generated always as identity primary key,
  actor_id uuid references auth.users(id),
  target_user_id uuid references auth.users(id),
  invite_id uuid references public.member_invites(id),
  action text not null check (action in ('invite_created','grant_applied','grant_extended','grant_revoked','invite_claimed')),
  detail jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);
create index if not exists member_access_audit_target
  on public.member_access_audit(target_user_id, created_at desc);
alter table public.member_access_audit enable row level security;
-- 감사 기록도 정책 없음. 삭제·수정 API를 만들지 않는다.

create or replace function public.claim_member_invite()
returns boolean language plpgsql security definer set search_path = public, auth as $$
declare
  uid uuid := auth.uid();
  mail text;
  inv public.member_invites%rowtype;
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
  update public.profiles
     set tier = 'paid', manual_access_until = inv.ends_at,
         manual_access_kind = inv.kind, manual_access_reason = inv.reason,
         updated_at = now()
   where id = uid;
  perform set_config('app.trusted_write', '', true);
  update public.member_invites set claimed_by = uid, claimed_at = now() where id = inv.id;
  insert into public.member_access_audit(actor_id,target_user_id,invite_id,action,detail)
  values(inv.created_by,uid,inv.id,'invite_claimed',jsonb_build_object('ends_at',inv.ends_at,'kind',inv.kind));
  return true;
end $$;
revoke all on function public.claim_member_invite() from public, anon;
grant execute on function public.claim_member_invite() to authenticated;

-- 본인 PATCH가 초대 필드를 바꾸지 못하게 기존 보호 트리거를 확장한다.
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

-- 만료된 초대를 비우고, 결제와 초대 둘 다 끝난 회원만 free로 내린다.
create or replace function public.expire_subscriptions()
returns integer language plpgsql security definer set search_path = public as $$
declare n integer;
begin
  update public.profiles
     set manual_access_until = null, manual_access_kind = null,
         manual_access_reason = null, updated_at = now()
   where manual_access_until is not null and manual_access_until < now();

  update public.profiles
     set tier = case when (subscription_ends is not null and subscription_ends > now())
                          or (manual_access_until is not null and manual_access_until > now())
                     then 'paid' else 'free' end,
         updated_at = now()
   where tier is distinct from
         case when (subscription_ends is not null and subscription_ends > now())
                       or (manual_access_until is not null and manual_access_until > now())
                  then 'paid' else 'free' end;
  get diagnostics n = row_count;
  return n;
end $$;
revoke all on function public.expire_subscriptions() from public, anon, authenticated;
grant execute on function public.expire_subscriptions() to service_role;
