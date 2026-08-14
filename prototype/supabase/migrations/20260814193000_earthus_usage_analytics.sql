-- EARTHUS 선택 이용행태 분석 v1.
--
-- 원칙:
--   * 로그인 + 서버에 기록된 usage_agreed=true가 모두 있어야 insert 가능하다.
--   * 좌표·검색문·질문·연락처·토큰·provider 원문은 DB trigger가 거절한다.
--   * 원 event는 365일 뒤 만료하며, 새 insert 때마다 만료 행을 실제 삭제한다.
--   * 사용자는 본인 event export/delete가 가능하고, 동의 철회는 이력을 새 행으로 남긴다.

alter table public.consents
  add column if not exists usage_agreed boolean not null default false;

create table if not exists public.analytics_events (
  event_id             uuid primary key,
  user_id              uuid not null references auth.users(id) on delete cascade,
  event_name           text not null,
  event_version        integer not null default 1 check (event_version = 1),
  occurred_at          timestamptz not null,
  session_pseudonym    text not null check (session_pseudonym ~ '^[a-f0-9]{32}$'),
  consent_version      text not null,
  catalog_version      text not null check (catalog_version = 'earthus.analytics.v1'),
  retention_version    text not null check (retention_version = 'earthus.analytics-retention.365d.v1'),
  surface              text not null check (surface in ('earth','aetherus','account','system')),
  properties           jsonb not null default '{}'::jsonb,
  created_at           timestamptz not null default now(),
  expires_at           timestamptz not null default (now() + interval '365 days')
);

alter table public.analytics_events enable row level security;
alter table public.analytics_events force row level security;

drop policy if exists analytics_events_select_own on public.analytics_events;
create policy analytics_events_select_own on public.analytics_events
  for select to authenticated using (auth.uid() = user_id and expires_at > now());

drop policy if exists analytics_events_insert_consented on public.analytics_events;
create policy analytics_events_insert_consented on public.analytics_events
  for insert to authenticated with check (
    auth.uid() = user_id
    and exists (
      select 1
        from public.consents c
       where c.user_id = auth.uid()
         and c.usage_agreed = true
         and c.privacy_agreed = true
         and c.over_14 = true
         and c.id = (
           select max(c2.id) from public.consents c2 where c2.user_id = auth.uid()
         )
    )
  );

drop policy if exists analytics_events_delete_own on public.analytics_events;
create policy analytics_events_delete_own on public.analytics_events
  for delete to authenticated using (auth.uid() = user_id);

create or replace function public.earthus_validate_analytics_event()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  allowed_keys text[];
  forbidden text[] := array[
    'latitude','longitude','lat','lon','address','searchText','questionText','healthState',
    'reservationId','paymentKey','email','phone','accessToken','serviceKey','rawProviderPayload',
    'preciseCameraState','sensitiveSpeciesCoordinate','ip','userAgent','stack','message'
  ];
  key text;
  value jsonb;
begin
  if auth.uid() is null or new.user_id <> auth.uid() then
    raise exception 'ANALYTICS_PRINCIPAL_MISMATCH';
  end if;
  if new.occurred_at < now() - interval '10 minutes'
     or new.occurred_at > now() + interval '2 minutes' then
    raise exception 'ANALYTICS_TIME_OUT_OF_RANGE';
  end if;
  if jsonb_typeof(new.properties) <> 'object' then
    raise exception 'ANALYTICS_PROPERTIES_NOT_OBJECT';
  end if;

  allowed_keys := case new.event_name
    when 'app.opened' then array['locale','viewportBucket','entryKind']
    when 'earth_style.opened' then array['entryKind']
    when 'layer.selected' then array['layerId','state','sourceStatusClass']
    when 'evidence.opened' then array['signalType','evidenceClass']
    when 'decision.viewed' then array['activityProfile','safetyClass','confidenceBand']
    when 'activity.profile_selected' then array['profileId']
    when 'reservation.impact_viewed' then array['impactClass','providerResultClass']
    when 'aetherus.opened' then array['entryKind']
    when 'aetherus.scene_selected' then array['sceneId']
    when 'error.shown' then array['reasonCode','surface','recoverable']
    when 'offline.entered' then array['cacheVersion','staleBand']
    when 'action.proposed' then array['actionType','confirmationRequired']
    else null
  end;
  if allowed_keys is null then
    raise exception 'ANALYTICS_EVENT_NOT_CATALOGUED';
  end if;

  for key, value in select * from jsonb_each(new.properties) loop
    if key = any(forbidden) or not (key = any(allowed_keys)) then
      raise exception 'ANALYTICS_PROPERTY_NOT_ALLOWED:%', key;
    end if;
    if jsonb_typeof(value) not in ('string','number','boolean','null') then
      raise exception 'ANALYTICS_PROPERTY_NOT_SCALAR:%', key;
    end if;
    if jsonb_typeof(value) = 'string' and length(value #>> '{}') > 80 then
      raise exception 'ANALYTICS_PROPERTY_TOO_LONG:%', key;
    end if;
  end loop;

  -- 보존기간은 클라이언트가 정하지 못한다. 새 수집이 있을 때 만료 event를 함께 지운다.
  delete from public.analytics_events where expires_at <= now();
  new.created_at := now();
  new.expires_at := now() + interval '365 days';
  return new;
end;
$$;

drop trigger if exists trg_earthus_validate_analytics_event on public.analytics_events;
create trigger trg_earthus_validate_analytics_event
  before insert on public.analytics_events
  for each row execute function public.earthus_validate_analytics_event();

create index if not exists idx_analytics_events_user_time
  on public.analytics_events(user_id, occurred_at desc);
create index if not exists idx_analytics_events_expiry
  on public.analytics_events(expires_at);

create or replace function public.earthus_withdraw_usage_consent()
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  uid uuid := auth.uid();
  removed bigint;
begin
  if uid is null then raise exception 'NOT_SIGNED_IN'; end if;
  -- 동의 이력 행은 클라이언트 saveConsent가 먼저 추가한다. 그 최신 행이 실제
  -- 철회인지 확인한 뒤에만 삭제한다. 이 함수가 별도 동의 행을 만들면 같은 순간의
  -- 마케팅·위치 선택을 false로 덮어쓰는 사고가 나므로 여기서는 삭제만 맡는다.
  if not exists (
    select 1 from public.consents c
     where c.user_id = uid
       and c.id = (select max(c2.id) from public.consents c2 where c2.user_id = uid)
       and c.usage_agreed = false
  ) then
    raise exception 'LATEST_USAGE_CONSENT_NOT_WITHDRAWN';
  end if;
  delete from public.analytics_events where user_id = uid;
  get diagnostics removed = row_count;
  return jsonb_build_object('withdrawn', true, 'deletedEvents', removed, 'at', now());
end;
$$;

revoke all on function public.earthus_withdraw_usage_consent() from public, anon;
grant execute on function public.earthus_withdraw_usage_consent() to authenticated;

create or replace function public.earthus_export_my_analytics()
returns setof public.analytics_events
language sql
security invoker
set search_path = public
as $$
  select * from public.analytics_events
   where user_id = auth.uid()
   order by occurred_at desc;
$$;

revoke all on function public.earthus_export_my_analytics() from public, anon;
grant execute on function public.earthus_export_my_analytics() to authenticated;

grant select, insert, delete on public.analytics_events to authenticated;
revoke all on public.analytics_events from anon;

-- 보존기간은 UI 문구가 아니라 매일 실행되는 물리 삭제로 강제한다.
-- 기존 유료 이용권 만료 작업과 같은 Supabase pg_cron을 사용한다.
create extension if not exists pg_cron with schema pg_catalog;
select cron.unschedule(jobid)
  from cron.job
 where jobname = 'earthus-purge-expired-analytics';
select cron.schedule(
  'earthus-purge-expired-analytics',
  '37 15 * * *',
  $cron$delete from public.analytics_events where expires_at <= now();$cron$
);
