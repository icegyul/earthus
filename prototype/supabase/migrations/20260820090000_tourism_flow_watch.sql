-- EARTHUS 관광 흐름 지켜보기 + FREE_OPEN 상한 + 분석 이벤트 계약.
-- 서울시 공식 현재 혼잡 등급만 발송하며, 운영·입장·안전 판단을 저장하지 않는다.

alter table public.alert_spots
  add column if not exists tourism boolean not null default false,
  add column if not exists tourism_place_code text,
  add column if not exists tourism_min_rank integer not null default 3;

alter table public.alert_spots drop constraint if exists alert_spots_tourism_code_valid;
alter table public.alert_spots add constraint alert_spots_tourism_code_valid
  check (tourism_place_code is null or tourism_place_code ~ '^POI[0-9]{3}$');
alter table public.alert_spots drop constraint if exists alert_spots_tourism_rank_valid;
alter table public.alert_spots add constraint alert_spots_tourism_rank_valid
  check (tourism_min_rank between 1 and 4);
alter table public.alert_spots drop constraint if exists alert_spots_tourism_has_place;
alter table public.alert_spots add constraint alert_spots_tourism_has_place
  check (tourism = false or tourism_place_code is not null);

create unique index if not exists idx_alert_spots_user_tourism_place
  on public.alert_spots(user_id, tourism_place_code)
  where tourism_place_code is not null;

-- SALES_OPEN=false · MONETIZATION_MODE=FREE_OPEN 동안 지켜보기는 전부 무료다.
-- 무제한은 발송 비용 공격이 되므로 계정당 20곳 상한은 서버에서 유지한다.
create or replace function public.spot_limit()
returns trigger language plpgsql security definer set search_path = public, pg_temp as $$
declare n integer;
begin
  select count(*) into n from public.alert_spots where user_id = new.user_id;
  if n >= 20 then raise exception 'SPOT_LIMIT'; end if;
  return new;
end $$;

-- 반환 열이 늘어나므로 create or replace가 아니라 transaction 안에서 교체한다.
drop function if exists public.push_targets();
create function public.push_targets()
returns table (
  user_id uuid, endpoint text, p256dh text, auth text, lang text,
  spot_id bigint, label text, lat double precision, lon double precision,
  rip boolean, quake boolean, warn boolean, tsunami boolean,
  quake_min_mag numeric, quake_max_km integer,
  tourism boolean, tourism_place_code text, tourism_min_rank integer, tier text
) language sql security definer stable set search_path = public, pg_temp as $$
  select s.user_id, s.endpoint, s.p256dh, s.auth, s.lang,
         a.id, a.label, a.lat, a.lon,
         a.rip, a.quake, a.warn, a.tsunami,
         a.quake_min_mag, a.quake_max_km,
         a.tourism, a.tourism_place_code, a.tourism_min_rank,
         coalesce(p.tier, 'free')
    from public.push_subscriptions s
    join public.alert_spots a on a.user_id = s.user_id
    left join public.profiles p on p.id = s.user_id
   where s.failed < 5;
$$;
revoke all on function public.push_targets() from public, anon, authenticated;
grant execute on function public.push_targets() to service_role;

-- 20260814194500의 값 수준 방어를 유지하면서 관광 이벤트 세 가지만 추가한다.
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
    'confidenceBand','impactClass','providerResultClass','reasonCode','surface','staleBand','actionType',
    'placeClass','forecastClass'
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
    when 'tourism.place_viewed' then array['placeClass','sourceStatusClass']
    when 'tourism.forecast_selected' then array['forecastClass','sourceStatusClass']
    when 'tourism.watch_changed' then array['state','sourceStatusClass']
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
