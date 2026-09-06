-- FOR ME 깔때기 계측 (2026-09-06)
--
-- 왜: 클릭 수만 세면 어디서 새는지 모른다. "무엇을 눌렀는지 + 그 뒤 어디까지 갔는지"를
--     단계별로 센다 (docs/V1-V2-UPSELL-MAP-2026-09-06.md 「계측 — 깔때기」).
--     2주 뒤 메뉴별 클릭률 표 한 장이 항만 고객에게 들고 갈 자료가 된다.
--
-- ⚠️ 허용 목록은 prototype/js/for-me-row.js formeEventNames() 에서 생성했다.
--    손으로 고치지 말 것 — tools/v1/test_for_me_row.mjs 가 둘이 같은지 검사한다.
--    개인 식별자는 여전히 아무것도 저장하지 않는다 (날짜·이벤트명·횟수뿐).
--    행동 횟수이지 사람 수가 아니다 — 보고서 각주에 반드시 적는다.
--
-- 적용: Supabase SQL Editor 에 이 파일을 그대로 붙여 실행한다 (20260903 마이그레이션과 같은 방식).

create or replace function public.usage_bump(p_events jsonb)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  allowed text[] := array[
    'app.opened',
    'travel.discover_opened',
    'travel.region_opened',
    'travel.purpose_opened',
    'travel.related_opened',
    'event.room_opened',
    'event.layer_from_room',
    'forme.set_location',
    'forme.shown.cyclone',
    'forme.signal.cyclone',
    'forme.clicked.cyclone',
    'forme.v2_opened.cyclone',
    'forme.explorer_cta.cyclone',
    'forme.intelligence_cta.cyclone',
    'forme.shown.quake',
    'forme.signal.quake',
    'forme.clicked.quake',
    'forme.v2_opened.quake',
    'forme.explorer_cta.quake',
    'forme.intelligence_cta.quake',
    'forme.shown.tsunami',
    'forme.signal.tsunami',
    'forme.clicked.tsunami',
    'forme.v2_opened.tsunami',
    'forme.explorer_cta.tsunami',
    'forme.intelligence_cta.tsunami',
    'forme.shown.wave',
    'forme.signal.wave',
    'forme.clicked.wave',
    'forme.v2_opened.wave',
    'forme.explorer_cta.wave',
    'forme.intelligence_cta.wave',
    'forme.shown.weather',
    'forme.signal.weather',
    'forme.clicked.weather',
    'forme.v2_opened.weather',
    'forme.explorer_cta.weather',
    'forme.intelligence_cta.weather',
    'forme.shown.air',
    'forme.signal.air',
    'forme.clicked.air',
    'forme.v2_opened.air',
    'forme.explorer_cta.air',
    'forme.intelligence_cta.air',
    'forme.shown.search',
    'forme.signal.search',
    'forme.clicked.search',
    'forme.v2_opened.search',
    'forme.explorer_cta.search',
    'forme.intelligence_cta.search'
  ];
  item jsonb;
  ev text;
  n integer;
  applied integer := 0;
begin
  if p_events is null or jsonb_typeof(p_events) <> 'array' then
    raise exception 'p_events must be a json array';
  end if;
  if jsonb_array_length(p_events) > 32 then
    raise exception 'too many events in one call';
  end if;

  for item in select * from jsonb_array_elements(p_events) loop
    ev := item ->> 'event';
    -- 한 번 호출에서 한 이벤트가 늘릴 수 있는 양을 제한한다 (오작동·장난 완화)
    n := least(greatest(coalesce((item ->> 'count')::int, 0), 0), 50);
    if ev is null or not (ev = any(allowed)) or n = 0 then
      continue;
    end if;
    insert into public.usage_counters as u (day, event_name, count)
      values ((now() at time zone 'utc')::date, ev, n)
    on conflict (day, event_name)
      do update set count = u.count + excluded.count, updated_at = now();
    applied := applied + 1;
  end loop;

  return applied;
end;
$$;

revoke all on function public.usage_bump(jsonb) from public;
grant execute on function public.usage_bump(jsonb) to anon, authenticated;

-- 2주 보고서 한 장: 메뉴별 보임·신호·클릭·v2 도착·CTA 와 클릭률(클릭 ÷ 보임)
create or replace view public.forme_funnel_daily as
  select day,
         max(count) filter (where event_name = 'forme.set_location') as set_location,
         max(count) filter (where event_name = 'forme.shown.cyclone') as cyclone_shown,
         max(count) filter (where event_name = 'forme.signal.cyclone') as cyclone_signal,
         max(count) filter (where event_name = 'forme.clicked.cyclone') as cyclone_clicked,
         max(count) filter (where event_name = 'forme.v2_opened.cyclone') as cyclone_v2_opened,
         max(count) filter (where event_name = 'forme.explorer_cta.cyclone') as cyclone_explorer_cta,
         max(count) filter (where event_name = 'forme.intelligence_cta.cyclone') as cyclone_intelligence_cta,
         max(count) filter (where event_name = 'forme.shown.quake') as quake_shown,
         max(count) filter (where event_name = 'forme.signal.quake') as quake_signal,
         max(count) filter (where event_name = 'forme.clicked.quake') as quake_clicked,
         max(count) filter (where event_name = 'forme.v2_opened.quake') as quake_v2_opened,
         max(count) filter (where event_name = 'forme.explorer_cta.quake') as quake_explorer_cta,
         max(count) filter (where event_name = 'forme.intelligence_cta.quake') as quake_intelligence_cta,
         max(count) filter (where event_name = 'forme.shown.tsunami') as tsunami_shown,
         max(count) filter (where event_name = 'forme.signal.tsunami') as tsunami_signal,
         max(count) filter (where event_name = 'forme.clicked.tsunami') as tsunami_clicked,
         max(count) filter (where event_name = 'forme.v2_opened.tsunami') as tsunami_v2_opened,
         max(count) filter (where event_name = 'forme.explorer_cta.tsunami') as tsunami_explorer_cta,
         max(count) filter (where event_name = 'forme.intelligence_cta.tsunami') as tsunami_intelligence_cta,
         max(count) filter (where event_name = 'forme.shown.wave') as wave_shown,
         max(count) filter (where event_name = 'forme.signal.wave') as wave_signal,
         max(count) filter (where event_name = 'forme.clicked.wave') as wave_clicked,
         max(count) filter (where event_name = 'forme.v2_opened.wave') as wave_v2_opened,
         max(count) filter (where event_name = 'forme.explorer_cta.wave') as wave_explorer_cta,
         max(count) filter (where event_name = 'forme.intelligence_cta.wave') as wave_intelligence_cta,
         max(count) filter (where event_name = 'forme.shown.weather') as weather_shown,
         max(count) filter (where event_name = 'forme.signal.weather') as weather_signal,
         max(count) filter (where event_name = 'forme.clicked.weather') as weather_clicked,
         max(count) filter (where event_name = 'forme.v2_opened.weather') as weather_v2_opened,
         max(count) filter (where event_name = 'forme.explorer_cta.weather') as weather_explorer_cta,
         max(count) filter (where event_name = 'forme.intelligence_cta.weather') as weather_intelligence_cta,
         max(count) filter (where event_name = 'forme.shown.air') as air_shown,
         max(count) filter (where event_name = 'forme.signal.air') as air_signal,
         max(count) filter (where event_name = 'forme.clicked.air') as air_clicked,
         max(count) filter (where event_name = 'forme.v2_opened.air') as air_v2_opened,
         max(count) filter (where event_name = 'forme.explorer_cta.air') as air_explorer_cta,
         max(count) filter (where event_name = 'forme.intelligence_cta.air') as air_intelligence_cta,
         max(count) filter (where event_name = 'forme.shown.search') as search_shown,
         max(count) filter (where event_name = 'forme.signal.search') as search_signal,
         max(count) filter (where event_name = 'forme.clicked.search') as search_clicked,
         max(count) filter (where event_name = 'forme.v2_opened.search') as search_v2_opened,
         max(count) filter (where event_name = 'forme.explorer_cta.search') as search_explorer_cta,
         max(count) filter (where event_name = 'forme.intelligence_cta.search') as search_intelligence_cta,
         round(100.0 * coalesce(max(count) filter (where event_name = 'forme.clicked.cyclone'), 0) / nullif(max(count) filter (where event_name = 'forme.shown.cyclone'), 0), 1) as cyclone_click_pct,
         round(100.0 * coalesce(max(count) filter (where event_name = 'forme.clicked.quake'), 0) / nullif(max(count) filter (where event_name = 'forme.shown.quake'), 0), 1) as quake_click_pct,
         round(100.0 * coalesce(max(count) filter (where event_name = 'forme.clicked.tsunami'), 0) / nullif(max(count) filter (where event_name = 'forme.shown.tsunami'), 0), 1) as tsunami_click_pct,
         round(100.0 * coalesce(max(count) filter (where event_name = 'forme.clicked.wave'), 0) / nullif(max(count) filter (where event_name = 'forme.shown.wave'), 0), 1) as wave_click_pct,
         round(100.0 * coalesce(max(count) filter (where event_name = 'forme.clicked.weather'), 0) / nullif(max(count) filter (where event_name = 'forme.shown.weather'), 0), 1) as weather_click_pct,
         round(100.0 * coalesce(max(count) filter (where event_name = 'forme.clicked.air'), 0) / nullif(max(count) filter (where event_name = 'forme.shown.air'), 0), 1) as air_click_pct,
         round(100.0 * coalesce(max(count) filter (where event_name = 'forme.clicked.search'), 0) / nullif(max(count) filter (where event_name = 'forme.shown.search'), 0), 1) as search_click_pct
    from public.usage_counters
   where event_name like 'forme.%'
   group by day
   order by day desc;

comment on view public.forme_funnel_daily is
  'FOR ME 깔때기 일자별 집계. *_click_pct 는 개인을 잇지 않고 집계끼리 나눈 값(행동 횟수 기준, 사람 수 아님).';
