-- EARTHUS 2.0 membership + staff RBAC
-- Additive migration. Existing billing/manual invite flows remain authoritative.

-- 1) Canonical membership/account state exposed to v2.
alter table public.profiles
  add column if not exists membership_class text,
  add column if not exists account_state text not null default 'active';

alter table public.profiles drop constraint if exists profiles_membership_class_check;
alter table public.profiles add constraint profiles_membership_class_check
  check (membership_class is null or membership_class in ('free','paid','invite'));
alter table public.profiles drop constraint if exists profiles_account_state_check;
alter table public.profiles add constraint profiles_account_state_check
  check (account_state in ('active','invited','suspended','cancelled','expired'));

create or replace function public.earthus_membership_class(p public.profiles)
returns text language sql stable as $$
  select case
    when p.manual_access_until is not null and p.manual_access_until > now() then 'invite'
    when p.tier = 'paid' then 'paid'
    else 'free'
  end;
$$;

update public.profiles p set membership_class = public.earthus_membership_class(p)
where membership_class is distinct from public.earthus_membership_class(p);

create or replace function public.sync_profile_membership_class()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  new.membership_class := case
    when new.manual_access_until is not null and new.manual_access_until > now() then 'invite'
    when new.tier = 'paid' then 'paid'
    else 'free'
  end;
  return new;
end $$;

drop trigger if exists trg_sync_profile_membership_class on public.profiles;
create trigger trg_sync_profile_membership_class
before insert or update of tier, manual_access_until on public.profiles
for each row execute function public.sync_profile_membership_class();

-- Existing client profile PATCH must not change server-owned class/state.
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
    new.membership_class     := old.membership_class;
    new.account_state        := old.account_state;
  end if;
  new.updated_at := now();
  return new;
end $$;

-- 2) Staff roles. Membership and staff authorization are intentionally separate.
create table if not exists public.staff_roles (
  user_id uuid not null references auth.users(id) on delete cascade,
  role text not null check (role in ('SUPER_ADMIN','DEVELOPER','OPERATIONS')),
  granted_by uuid references auth.users(id),
  granted_at timestamptz not null default now(),
  primary key(user_id, role)
);
alter table public.staff_roles enable row level security;

-- Migrate all legacy admin rows to SUPER_ADMIN without relying on email in the client.
insert into public.staff_roles(user_id, role, granted_by)
select a.id, 'SUPER_ADMIN', a.id from public.admins a
on conflict(user_id, role) do nothing;

create or replace function public.has_staff_role(required_role text)
returns boolean language sql security definer stable set search_path = public as $$
  select auth.uid() is not null and exists(
    select 1 from public.staff_roles r
    where r.user_id = auth.uid() and r.role = required_role
  );
$$;
revoke all on function public.has_staff_role(text) from public, anon;
grant execute on function public.has_staff_role(text) to authenticated;

create or replace function public.has_staff_capability(capability text)
returns boolean language sql security definer stable set search_path = public as $$
  select case capability
    when 'member.read' then public.has_staff_role('SUPER_ADMIN') or public.has_staff_role('OPERATIONS')
    when 'member.write' then public.has_staff_role('SUPER_ADMIN') or public.has_staff_role('OPERATIONS')
    when 'staff.manage' then public.has_staff_role('SUPER_ADMIN')
    when 'provider.read' then public.has_staff_role('SUPER_ADMIN') or public.has_staff_role('DEVELOPER') or public.has_staff_role('OPERATIONS')
    when 'provider.secret.write' then public.has_staff_role('SUPER_ADMIN') or public.has_staff_role('DEVELOPER')
    when 'sns.read' then public.has_staff_role('SUPER_ADMIN') or public.has_staff_role('OPERATIONS') or public.has_staff_role('DEVELOPER')
    when 'sns.publish' then public.has_staff_role('SUPER_ADMIN') or public.has_staff_role('OPERATIONS')
    when 'feature_gate.manage' then public.has_staff_role('SUPER_ADMIN')
    else false
  end;
$$;
revoke all on function public.has_staff_capability(text) from public, anon;
grant execute on function public.has_staff_capability(text) to authenticated;

create policy staff_roles_select_own on public.staff_roles
for select to authenticated using (user_id = auth.uid());

-- 3) Immutable privileged audit log. No direct browser write policy.
create table if not exists public.admin_audit_log (
  id bigint generated always as identity primary key,
  actor_id uuid not null references auth.users(id),
  action text not null,
  target_user_id uuid references auth.users(id),
  object_kind text,
  object_id text,
  detail jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);
alter table public.admin_audit_log enable row level security;
create index if not exists idx_admin_audit_created on public.admin_audit_log(created_at desc);
create index if not exists idx_admin_audit_target on public.admin_audit_log(target_user_id, created_at desc);

-- 4) Current session context. This is the only v2 client authorization input.
create or replace function public.earthus_staff_context()
returns jsonb language plpgsql security definer stable set search_path = public as $$
declare
  uid uuid := auth.uid();
  p public.profiles%rowtype;
  roles jsonb;
begin
  if uid is null then
    return jsonb_build_object('authenticated', false, 'membership_class', 'free', 'account_state', 'active', 'roles', '[]'::jsonb);
  end if;
  select * into p from public.profiles where id = uid;
  select coalesce(jsonb_agg(role order by role), '[]'::jsonb) into roles from public.staff_roles where user_id = uid;
  return jsonb_build_object(
    'authenticated', true,
    'membership_class', coalesce(p.membership_class, 'free'),
    'account_state', coalesce(p.account_state, 'active'),
    'roles', roles,
    'capabilities', jsonb_build_object(
      'member_read', public.has_staff_capability('member.read'),
      'member_write', public.has_staff_capability('member.write'),
      'staff_manage', public.has_staff_capability('staff.manage'),
      'provider_read', public.has_staff_capability('provider.read'),
      'provider_secret_write', public.has_staff_capability('provider.secret.write'),
      'sns_read', public.has_staff_capability('sns.read'),
      'sns_publish', public.has_staff_capability('sns.publish'),
      'feature_gate_manage', public.has_staff_capability('feature_gate.manage')
    )
  );
end $$;
revoke all on function public.earthus_staff_context() from public, anon;
grant execute on function public.earthus_staff_context() to authenticated;

-- 5) Bounded member list RPC. Raw auth table access never goes to the client.
create or replace function public.admin_list_members(
  class_filter text default null,
  state_filter text default null,
  search_text text default null,
  row_limit integer default 100,
  row_offset integer default 0
)
returns table(
  id uuid, email text, membership_class text, account_state text,
  subscription_ends timestamptz, manual_access_until timestamptz,
  created_at timestamptz, updated_at timestamptz
) language plpgsql security definer stable set search_path = public as $$
begin
  if not public.has_staff_capability('member.read') then raise exception 'FORBIDDEN'; end if;
  return query
  select p.id, p.email, coalesce(p.membership_class,'free'), p.account_state,
         p.subscription_ends, p.manual_access_until, p.created_at, p.updated_at
  from public.profiles p
  where (class_filter is null or p.membership_class = lower(class_filter))
    and (state_filter is null or p.account_state = lower(state_filter))
    and (search_text is null or search_text = '' or p.email ilike '%' || search_text || '%' or p.id::text = search_text)
  order by p.created_at desc
  limit least(greatest(row_limit,1),200) offset greatest(row_offset,0);
end $$;
revoke all on function public.admin_list_members(text,text,text,integer,integer) from public, anon;
grant execute on function public.admin_list_members(text,text,text,integer,integer) to authenticated;

-- 6) Account-state mutation: operations or super-admin only, server audited.
create or replace function public.admin_set_account_state(target uuid, next_state text, reason text default null)
returns void language plpgsql security definer set search_path = public as $$
declare old_state text;
begin
  if not public.has_staff_capability('member.write') then raise exception 'FORBIDDEN'; end if;
  if next_state not in ('active','invited','suspended','cancelled','expired') then raise exception 'INVALID_STATE'; end if;
  select account_state into old_state from public.profiles where id = target for update;
  if not found then raise exception 'MEMBER_NOT_FOUND'; end if;
  perform set_config('app.trusted_write','1',true);
  update public.profiles set account_state = next_state, updated_at = now() where id = target;
  perform set_config('app.trusted_write','',true);
  insert into public.admin_audit_log(actor_id,action,target_user_id,object_kind,object_id,detail)
  values(auth.uid(),'member.account_state',target,'profile',target::text,
    jsonb_build_object('from',old_state,'to',next_state,'reason',left(coalesce(reason,''),300)));
end $$;
revoke all on function public.admin_set_account_state(uuid,text,text) from public, anon;
grant execute on function public.admin_set_account_state(uuid,text,text) to authenticated;

-- 7) Staff role management: SUPER_ADMIN only, server audited.
create or replace function public.admin_set_staff_role(target uuid, staff_role text, enabled boolean)
returns void language plpgsql security definer set search_path = public as $$
begin
  if not public.has_staff_capability('staff.manage') then raise exception 'FORBIDDEN'; end if;
  if staff_role not in ('SUPER_ADMIN','DEVELOPER','OPERATIONS') then raise exception 'INVALID_ROLE'; end if;
  if not exists(select 1 from auth.users where id = target) then raise exception 'MEMBER_NOT_FOUND'; end if;
  if enabled then
    insert into public.staff_roles(user_id,role,granted_by) values(target,staff_role,auth.uid())
    on conflict(user_id,role) do nothing;
  else
    if target = auth.uid() and staff_role = 'SUPER_ADMIN'
       and (select count(*) from public.staff_roles where role='SUPER_ADMIN') <= 1 then
      raise exception 'LAST_SUPER_ADMIN';
    end if;
    delete from public.staff_roles where user_id=target and role=staff_role;
  end if;
  insert into public.admin_audit_log(actor_id,action,target_user_id,object_kind,object_id,detail)
  values(auth.uid(),'staff.role',target,'staff_role',staff_role,jsonb_build_object('enabled',enabled));
end $$;
revoke all on function public.admin_set_staff_role(uuid,text,boolean) from public, anon;
grant execute on function public.admin_set_staff_role(uuid,text,boolean) to authenticated;

-- 8) Privileged audit reader.
create or replace function public.admin_recent_audit(row_limit integer default 100)
returns setof public.admin_audit_log language plpgsql security definer stable set search_path = public as $$
begin
  if not (public.has_staff_role('SUPER_ADMIN') or public.has_staff_role('OPERATIONS') or public.has_staff_role('DEVELOPER')) then
    raise exception 'FORBIDDEN';
  end if;
  return query select * from public.admin_audit_log order by created_at desc limit least(greatest(row_limit,1),200);
end $$;
revoke all on function public.admin_recent_audit(integer) from public, anon;
grant execute on function public.admin_recent_audit(integer) to authenticated;
