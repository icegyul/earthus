-- EARTHUS 익명 이용 집계 v1 (v2-three 공개 배포용)
--
-- 배경: analytics_events 는 RLS 가 `to authenticated` 라 로그인+동의 사용자만 기록된다.
-- v2-three(earthus.net/v2/)에는 로그인이 없어 그대로는 아무것도 세지 못한다.
-- CloudFront 접근 로그를 켜는 대안은 IP·User-Agent 를 저장하게 되는데,
-- earthus_validate_analytics_event() 가 바로 그 키들을 금지해 왔다. 원칙과 충돌한다.
--
-- 그래서 개인을 식별할 수 있는 것을 아무것도 저장하지 않는 집계 테이블만 둔다.
--   * user_id 없음 · session 없음 · IP 없음 · properties 없음
--   * 저장하는 것은 (날짜, 허용된 이벤트 이름, 횟수) 뿐이다
--   * 익명 클라이언트는 테이블에 직접 쓰지 못한다. 허용 목록을 검사하는 RPC 만 실행할 수 있다.
--
-- 한계: 개인을 세지 않으므로 "이용자 수"가 아니라 "행동 횟수"다.
--       공개 anon 키로 호출되므로 카운터를 부풀리는 것을 막지 못한다.
--       공모전 계량성과로 인용할 때 이 두 가지를 함께 적을 것.

create table if not exists public.usage_counters (
  day         date not null default (now() at time zone 'utc')::date,
  event_name  text not null,
  count       bigint not null default 0,
  updated_at  timestamptz not null default now(),
  primary key (day, event_name)
);

comment on table public.usage_counters is
  'EARTHUS v2-three 익명 이용 집계. 개인 식별자를 저장하지 않는다 (날짜·이벤트명·횟수만).';

alter table public.usage_counters enable row level security;
alter table public.usage_counters force row level security;

-- 읽기는 공개. 집계 숫자뿐이라 개인정보가 없다.
drop policy if exists usage_counters_read_all on public.usage_counters;
create policy usage_counters_read_all on public.usage_counters
  for select to anon, authenticated using (true);

-- 쓰기는 정책으로 열지 않는다. 아래 RPC(security definer)만 증가시킬 수 있다.

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
    'event.layer_from_room'
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

-- 조회용 뷰: 서식4 계량성과에 그대로 옮길 수 있는 모양
create or replace view public.usage_daily as
  select day,
         max(count) filter (where event_name = 'app.opened')             as app_opened,
         max(count) filter (where event_name = 'travel.discover_opened') as discover_opened,
         max(count) filter (where event_name = 'travel.region_opened')   as region_opened,
         max(count) filter (where event_name = 'travel.purpose_opened')  as purpose_opened,
         max(count) filter (where event_name = 'event.room_opened')      as room_opened,
         round(
           100.0 * coalesce(max(count) filter (where event_name = 'travel.region_opened'), 0)
           / nullif(max(count) filter (where event_name = 'travel.discover_opened'), 0), 1
         ) as discover_to_region_pct
    from public.usage_counters
   group by day
   order by day desc;

comment on view public.usage_daily is
  '일자별 이용 집계. discover_to_region_pct 는 개인을 잇지 않고 집계끼리 나눈 값이다 (개별 전환 추적 아님).';
