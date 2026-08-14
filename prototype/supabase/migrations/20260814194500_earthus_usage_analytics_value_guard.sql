-- EARTHUS 선택 이용행태 v1 값 수준 방어.
-- 허용된 key 안에 이메일·질문 같은 자유문구를 숨기는 우회를 DB에서 막는다.

alter table public.analytics_events
  add column if not exists privacy_version text;

update public.analytics_events
   set privacy_version = '2026-08-04'
 where privacy_version is null;

alter table public.analytics_events
  alter column privacy_version set not null;

alter table public.analytics_events
  drop constraint if exists analytics_events_consent_version_v1;
alter table public.analytics_events
  add constraint analytics_events_consent_version_v1
  check (consent_version = 'earthus.usage-consent.v1');

alter table public.analytics_events
  drop constraint if exists analytics_events_privacy_version_current;
alter table public.analytics_events
  add constraint analytics_events_privacy_version_current
  check (privacy_version = '2026-08-04');

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
         and c.privacy_version = analytics_events.privacy_version
         and c.id = (
           select max(c2.id) from public.consents c2 where c2.user_id = auth.uid()
         )
    )
  );

create or replace function public.earthus_validate_analytics_event()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  allowed_keys text[];
  forbidden text[] := array[
    'latitude','longitude','lat','lon','address','searchText','questionText','healthState',
    'reservationId','paymentKey','email','phone','accessToken','serviceKey','rawProviderPayload',
    'preciseCameraState','sensitiveSpeciesCoordinate','ip','userAgent','stack','message'
  ];
  id_keys text[] := array[
    'layerId','signalType','activityProfile','profileId','sceneId','cacheVersion'
  ];
  category_keys text[] := array[
    'viewportBucket','entryKind','state','sourceStatusClass','evidenceClass','safetyClass',
    'confidenceBand','impactClass','providerResultClass','reasonCode','surface','staleBand','actionType'
  ];
  boolean_keys text[] := array['recoverable','confirmationRequired'];
  expected_surface text;
  key text;
  value jsonb;
  scalar text;
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
  if allowed_keys is null then raise exception 'ANALYTICS_EVENT_NOT_CATALOGUED'; end if;

  expected_surface := case
    when new.event_name like 'aetherus.%' then 'aetherus'
    when new.event_name in ('offline.entered','error.shown') then 'system'
    else 'earth'
  end;
  if new.surface <> expected_surface then raise exception 'ANALYTICS_SURFACE_MISMATCH'; end if;

  for key, value in select * from jsonb_each(new.properties) loop
    if key = any(forbidden) or not (key = any(allowed_keys)) then
      raise exception 'ANALYTICS_PROPERTY_NOT_ALLOWED:%', key;
    end if;
    if jsonb_typeof(value) = 'null' then continue; end if;
    if key = any(boolean_keys) then
      if jsonb_typeof(value) <> 'boolean' then
        raise exception 'ANALYTICS_PROPERTY_NOT_BOOLEAN:%', key;
      end if;
      continue;
    end if;
    if jsonb_typeof(value) <> 'string' then
      raise exception 'ANALYTICS_PROPERTY_NOT_CATEGORICAL:%', key;
    end if;
    scalar := value #>> '{}';
    if length(scalar) > 80 then raise exception 'ANALYTICS_PROPERTY_TOO_LONG:%', key; end if;
    if key = 'locale' and scalar !~ '^[a-z]{2}(-[A-Z]{2})?$' then
      raise exception 'ANALYTICS_LOCALE_INVALID';
    elsif key = any(id_keys) and scalar !~ '^[A-Za-z0-9][A-Za-z0-9_.:-]{0,79}$' then
      raise exception 'ANALYTICS_ID_INVALID:%', key;
    elsif key = any(category_keys) and scalar !~ '^[A-Z][A-Z0-9_.:-]{0,79}$' then
      raise exception 'ANALYTICS_CATEGORY_INVALID:%', key;
    end if;
  end loop;

  delete from public.analytics_events where expires_at <= now();
  new.created_at := now();
  new.expires_at := now() + interval '365 days';
  return new;
end;
$$;
