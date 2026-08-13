-- AETHERUS private user-data boundary.
-- This migration is intentionally NOT a public/community publishing surface.
-- Apply only after backup + canary project review, then run tools/verify_aetherus_rls.mjs
-- with two independent authenticated user sessions.

create table if not exists public.aetherus_personal_universes (
  universe_id text not null check (universe_id ~ '^[A-Za-z0-9._:-]{1,160}$'),
  owner_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  privacy text not null default 'PRIVATE' check (privacy = 'PRIVATE'),
  revision integer not null default 1 check (revision > 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (owner_id, universe_id)
);

create table if not exists public.aetherus_personal_records (
  owner_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  universe_id text not null,
  record_id text not null check (record_id ~ '^[A-Za-z0-9._:-]{1,160}$'),
  record_type text not null check (record_type in (
    'DISCOVERY', 'OBSERVATION_REFERENCE', 'MISSION_BOOKMARK',
    'EQUIPMENT_ACHIEVEMENT', 'LEARNING_NOTE'
  )),
  subject_id text not null check (char_length(subject_id) between 1 and 240),
  provenance jsonb not null,
  privacy jsonb not null default '{"visibility":"PRIVATE","locationPolicy":"NOT_STORED"}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (owner_id, universe_id, record_id),
  foreign key (owner_id, universe_id)
    references public.aetherus_personal_universes(owner_id, universe_id)
    on delete cascade,
  check (privacy ->> 'visibility' = 'PRIVATE'),
  check (privacy ->> 'locationPolicy' in ('NOT_STORED', 'COARSE_REGION')),
  check (not (privacy ?| array['latitude', 'longitude', 'preciseLocation'])),
  check (provenance ?& array['classification', 'sourceRevision', 'freshness', 'precision']),
  check (provenance ->> 'classification' in (
    'observation', 'calculated', 'reconstruction', 'simulation', 'ai', 'user-content'
  )),
  check ((privacy ->> 'locationPolicy') <> 'COARSE_REGION'
    or char_length(privacy ->> 'coarseRegion') between 1 and 120)
);

create table if not exists public.aetherus_observation_archives (
  archive_id text not null check (archive_id ~ '^[A-Za-z0-9._:-]{1,160}$'),
  owner_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  raw_digest text not null check (raw_digest ~ '^[0-9a-f]{64}$'),
  byte_length bigint not null check (byte_length >= 0),
  media_type text not null,
  storage_state text not null default 'LOCAL_METADATA_ONLY'
    check (storage_state in ('LOCAL_METADATA_ONLY', 'REMOTE_CHECKPOINTED', 'DELETED')),
  exact_location_stored boolean not null default false check (exact_location_stored = false),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (owner_id, archive_id)
);

create table if not exists public.aetherus_privacy_events (
  event_id bigint generated always as identity primary key,
  owner_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  event_type text not null check (event_type in (
    'CONSENT_GRANTED', 'CONSENT_WITHDRAWN', 'EXPORT_REQUESTED', 'DELETE_REQUESTED'
  )),
  scope text not null check (char_length(scope) between 1 and 160),
  policy_version text not null check (char_length(policy_version) between 1 and 120),
  occurred_at timestamptz not null default now()
);

create table if not exists public.aetherus_data_subject_requests (
  owner_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  request_id text not null check (request_id ~ '^[A-Za-z0-9._:-]{1,160}$'),
  request_type text not null check (request_type in ('EXPORT', 'DELETE', 'CONSENT_WITHDRAWAL')),
  status text not null check (status in ('RECEIVED', 'COMPLETED', 'BLOCKED')),
  requested_at timestamptz not null default now(),
  completed_at timestamptz,
  reason text,
  primary key (owner_id, request_id)
);

create table if not exists public.aetherus_deletion_receipts (
  receipt_id uuid primary key default gen_random_uuid(),
  owner_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  request_id text not null,
  completed_at timestamptz not null default now(),
  scope jsonb not null,
  limitations jsonb not null default '[
    "auth-user-account-not-deleted",
    "provider-backups-require-separate-expiry-proof",
    "community-and-ai-memory-have-separate-owners"
  ]'::jsonb,
  unique (owner_id, request_id),
  foreign key (owner_id, request_id)
    references public.aetherus_data_subject_requests(owner_id, request_id)
    on delete restrict
);

alter table public.aetherus_personal_universes enable row level security;
alter table public.aetherus_personal_records enable row level security;
alter table public.aetherus_observation_archives enable row level security;
alter table public.aetherus_privacy_events enable row level security;
alter table public.aetherus_data_subject_requests enable row level security;
alter table public.aetherus_deletion_receipts enable row level security;

alter table public.aetherus_personal_universes force row level security;
alter table public.aetherus_personal_records force row level security;
alter table public.aetherus_observation_archives force row level security;
alter table public.aetherus_privacy_events force row level security;
alter table public.aetherus_data_subject_requests force row level security;
alter table public.aetherus_deletion_receipts force row level security;

revoke all on public.aetherus_personal_universes from public, anon;
revoke all on public.aetherus_personal_records from public, anon;
revoke all on public.aetherus_observation_archives from public, anon;
revoke all on public.aetherus_privacy_events from public, anon;
revoke all on public.aetherus_data_subject_requests from public, anon;
revoke all on public.aetherus_deletion_receipts from public, anon;
revoke all on sequence public.aetherus_privacy_events_event_id_seq from public, anon;
grant select, insert, update, delete on public.aetherus_personal_universes to authenticated;
grant select, insert, update, delete on public.aetherus_personal_records to authenticated;
grant select, insert, update, delete on public.aetherus_observation_archives to authenticated;
grant select, insert on public.aetherus_privacy_events to authenticated;
grant usage, select on sequence public.aetherus_privacy_events_event_id_seq to authenticated;
grant select, insert on public.aetherus_data_subject_requests to authenticated;
grant select on public.aetherus_deletion_receipts to authenticated;

drop policy if exists aetherus_universe_select_own on public.aetherus_personal_universes;
create policy aetherus_universe_select_own on public.aetherus_personal_universes
  for select to authenticated using (auth.uid() = owner_id);
drop policy if exists aetherus_universe_insert_own on public.aetherus_personal_universes;
create policy aetherus_universe_insert_own on public.aetherus_personal_universes
  for insert to authenticated with check (auth.uid() = owner_id);
drop policy if exists aetherus_universe_update_own on public.aetherus_personal_universes;
create policy aetherus_universe_update_own on public.aetherus_personal_universes
  for update to authenticated using (auth.uid() = owner_id) with check (auth.uid() = owner_id);
drop policy if exists aetherus_universe_delete_own on public.aetherus_personal_universes;
create policy aetherus_universe_delete_own on public.aetherus_personal_universes
  for delete to authenticated using (auth.uid() = owner_id);

drop policy if exists aetherus_record_select_own on public.aetherus_personal_records;
create policy aetherus_record_select_own on public.aetherus_personal_records
  for select to authenticated using (auth.uid() = owner_id);
drop policy if exists aetherus_record_insert_own on public.aetherus_personal_records;
create policy aetherus_record_insert_own on public.aetherus_personal_records
  for insert to authenticated with check (auth.uid() = owner_id);
drop policy if exists aetherus_record_update_own on public.aetherus_personal_records;
create policy aetherus_record_update_own on public.aetherus_personal_records
  for update to authenticated using (auth.uid() = owner_id) with check (auth.uid() = owner_id);
drop policy if exists aetherus_record_delete_own on public.aetherus_personal_records;
create policy aetherus_record_delete_own on public.aetherus_personal_records
  for delete to authenticated using (auth.uid() = owner_id);

drop policy if exists aetherus_archive_select_own on public.aetherus_observation_archives;
create policy aetherus_archive_select_own on public.aetherus_observation_archives
  for select to authenticated using (auth.uid() = owner_id);
drop policy if exists aetherus_archive_insert_own on public.aetherus_observation_archives;
create policy aetherus_archive_insert_own on public.aetherus_observation_archives
  for insert to authenticated with check (auth.uid() = owner_id);
drop policy if exists aetherus_archive_update_own on public.aetherus_observation_archives;
create policy aetherus_archive_update_own on public.aetherus_observation_archives
  for update to authenticated using (auth.uid() = owner_id) with check (auth.uid() = owner_id);
drop policy if exists aetherus_archive_delete_own on public.aetherus_observation_archives;
create policy aetherus_archive_delete_own on public.aetherus_observation_archives
  for delete to authenticated using (auth.uid() = owner_id);

drop policy if exists aetherus_privacy_event_select_own on public.aetherus_privacy_events;
create policy aetherus_privacy_event_select_own on public.aetherus_privacy_events
  for select to authenticated using (auth.uid() = owner_id);
drop policy if exists aetherus_privacy_event_insert_own on public.aetherus_privacy_events;
create policy aetherus_privacy_event_insert_own on public.aetherus_privacy_events
  for insert to authenticated with check (auth.uid() = owner_id);

drop policy if exists aetherus_request_select_own on public.aetherus_data_subject_requests;
create policy aetherus_request_select_own on public.aetherus_data_subject_requests
  for select to authenticated using (auth.uid() = owner_id);
drop policy if exists aetherus_request_insert_own on public.aetherus_data_subject_requests;
create policy aetherus_request_insert_own on public.aetherus_data_subject_requests
  for insert to authenticated with check (auth.uid() = owner_id);

drop policy if exists aetherus_receipt_select_own on public.aetherus_deletion_receipts;
create policy aetherus_receipt_select_own on public.aetherus_deletion_receipts
  for select to authenticated using (auth.uid() = owner_id);

create or replace function public.aetherus_export_my_data()
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  principal uuid := auth.uid();
begin
  if principal is null then raise exception 'AETHERUS_AUTH_REQUIRED'; end if;
  return jsonb_build_object(
    'schema', 'aetherus.account-export.v1',
    'ownerId', principal,
    'exportedAtUtc', now(),
    'universes', coalesce((select jsonb_agg(to_jsonb(u)) from public.aetherus_personal_universes u where u.owner_id = principal), '[]'::jsonb),
    'records', coalesce((select jsonb_agg(to_jsonb(r)) from public.aetherus_personal_records r where r.owner_id = principal), '[]'::jsonb),
    'archiveMetadata', coalesce((select jsonb_agg(to_jsonb(a)) from public.aetherus_observation_archives a where a.owner_id = principal), '[]'::jsonb),
    'privacyEvents', coalesce((select jsonb_agg(to_jsonb(e)) from public.aetherus_privacy_events e where e.owner_id = principal), '[]'::jsonb),
    'dataSubjectRequests', coalesce((select jsonb_agg(to_jsonb(r)) from public.aetherus_data_subject_requests r where r.owner_id = principal), '[]'::jsonb),
    'deletionReceipts', coalesce((select jsonb_agg(to_jsonb(d)) from public.aetherus_deletion_receipts d where d.owner_id = principal), '[]'::jsonb),
    'limitations', jsonb_build_array('raw-media-bytes-are-exported-by-archive-owner')
  );
end;
$$;

create or replace function public.aetherus_withdraw_my_consent(
  p_request_id text,
  p_scope text,
  p_confirmation text
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  principal uuid := auth.uid();
begin
  if principal is null then raise exception 'AETHERUS_AUTH_REQUIRED'; end if;
  if p_confirmation <> 'WITHDRAW_MY_AETHERUS_CONSENT' then
    raise exception 'AETHERUS_EXPLICIT_CONFIRMATION_REQUIRED';
  end if;
  if exists (
    select 1 from public.aetherus_data_subject_requests
    where owner_id = principal and request_id = p_request_id
      and request_type = 'CONSENT_WITHDRAWAL' and status = 'COMPLETED'
  ) then
    return jsonb_build_object(
      'status', 'COMPLETED', 'requestId', p_request_id,
      'scope', p_scope, 'duplicate', true
    );
  end if;
  insert into public.aetherus_data_subject_requests(owner_id, request_id, request_type, status, completed_at)
    values (principal, p_request_id, 'CONSENT_WITHDRAWAL', 'COMPLETED', now());
  insert into public.aetherus_privacy_events(owner_id, event_type, scope, policy_version)
    values (principal, 'CONSENT_WITHDRAWN', p_scope, 'aetherus-privacy-v1');
  return jsonb_build_object(
    'status', 'COMPLETED', 'requestId', p_request_id,
    'scope', p_scope, 'completedAtUtc', now(), 'duplicate', false
  );
end;
$$;

create or replace function public.aetherus_delete_my_data(
  p_request_id text,
  p_confirmation text
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  principal uuid := auth.uid();
  universe_count integer;
  record_count integer;
  archive_count integer;
  receipt public.aetherus_deletion_receipts%rowtype;
begin
  if principal is null then raise exception 'AETHERUS_AUTH_REQUIRED'; end if;
  if p_confirmation <> 'DELETE_MY_AETHERUS_DATA' then
    raise exception 'AETHERUS_EXPLICIT_CONFIRMATION_REQUIRED';
  end if;
  select * into receipt
    from public.aetherus_deletion_receipts
    where owner_id = principal and request_id = p_request_id;
  if found then return to_jsonb(receipt); end if;
  select count(*) into universe_count from public.aetherus_personal_universes where owner_id = principal;
  select count(*) into record_count from public.aetherus_personal_records where owner_id = principal;
  select count(*) into archive_count from public.aetherus_observation_archives where owner_id = principal;
  insert into public.aetherus_data_subject_requests(owner_id, request_id, request_type, status)
    values (principal, p_request_id, 'DELETE', 'RECEIVED');
  insert into public.aetherus_privacy_events(owner_id, event_type, scope, policy_version)
    values (principal, 'DELETE_REQUESTED', 'AETHERUS_PRIVATE_DATA', 'aetherus-privacy-v1');
  delete from public.aetherus_personal_records where owner_id = principal;
  delete from public.aetherus_personal_universes where owner_id = principal;
  delete from public.aetherus_observation_archives where owner_id = principal;
  update public.aetherus_data_subject_requests
    set status = 'COMPLETED', completed_at = now()
    where owner_id = principal and request_id = p_request_id;
  insert into public.aetherus_deletion_receipts(owner_id, request_id, scope)
    values (principal, p_request_id, jsonb_build_object(
      'personalUniversesDeleted', universe_count,
      'personalRecordsDeleted', record_count,
      'archiveMetadataDeleted', archive_count,
      'privacyAuditEventsRetained', true,
      'dataSubjectRequestRetained', true,
      'authAccountDeleted', false,
      'communityDeleted', false,
      'aiMemoryDeleted', false
    )) returning * into receipt;
  return to_jsonb(receipt);
end;
$$;

revoke all on function public.aetherus_export_my_data() from public, anon;
revoke all on function public.aetherus_withdraw_my_consent(text, text, text) from public, anon;
revoke all on function public.aetherus_delete_my_data(text, text) from public, anon;
grant execute on function public.aetherus_export_my_data() to authenticated;
grant execute on function public.aetherus_withdraw_my_consent(text, text, text) to authenticated;
grant execute on function public.aetherus_delete_my_data(text, text) to authenticated;
