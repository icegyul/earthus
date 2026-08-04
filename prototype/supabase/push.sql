-- earthus — 웹푸시 (schema.sql 다음에 실행)
--
-- ⚠️⚠️ **먼저 알아야 하는 한계 셋.** 이걸 모르면 안 되는 걸 팔게 된다.
--   ① iOS 는 **홈 화면에 추가한 PWA** 여야만 웹푸시가 온다. 사파리 탭에서는 안 온다.
--      → 아이폰 사용자에게는 "홈 화면에 추가" 안내를 먼저 띄운다.
--   ② 웹에는 **배경 위치 추적이 없다.** 앱이 닫힌 채로 사용자를 따라다닐 수 없다.
--      → 알림은 **저장해 둔 지점** 기준이다. "지금 내가 있는 곳"이 아니다.
--         이걸 흐리게 적으면 사용자는 해변에 도착하면 알림이 올 거라 믿는다.
--   ③ 구독은 브라우저가 **말없이 만료시킨다** (앱 삭제·캐시 정리·기기 초기화).
--      → 보낼 때 404/410 이 오면 그 구독을 지운다. 안 지우면 죽은 구독이 쌓인다.

-- ═══════════════════════════════════════════════════════════
-- 1. push_subscriptions — 브라우저가 준 구독 정보
--    ⚠️ endpoint 는 사실상 **그 기기로 알림을 보낼 수 있는 주소**다.
--       남이 읽으면 그 사람에게 알림을 보낼 수 있다 → 절대 공개하지 않는다.
-- ═══════════════════════════════════════════════════════════
create table if not exists public.push_subscriptions (
  id          bigint generated always as identity primary key,
  user_id     uuid not null references auth.users(id) on delete cascade,
  endpoint    text not null unique,
  -- 브라우저가 준 암호화 키. ⚠️ 이게 없으면 본문을 못 실어 보낸다.
  p256dh      text not null,
  auth        text not null,
  -- 어디서 왔는지 (문제 추적용). ⚠️ 전체 UA 를 넣지 않는다 — 지문이 된다.
  platform    text,
  lang        text not null default 'ko' check (lang in ('ko','en','ja')),
  failed      integer not null default 0,
  last_ok     timestamptz,
  created_at  timestamptz not null default now()
);
alter table public.push_subscriptions enable row level security;

-- 본인 것만 보고, 만들고, 지운다.
create policy push_sel on public.push_subscriptions
  for select using (auth.uid() = user_id);
create policy push_ins on public.push_subscriptions
  for insert with check (auth.uid() = user_id);
create policy push_del on public.push_subscriptions
  for delete using (auth.uid() = user_id);
create policy push_upd on public.push_subscriptions
  for update using (auth.uid() = user_id) with check (auth.uid() = user_id);

create index if not exists idx_push_user on public.push_subscriptions(user_id);


-- ═══════════════════════════════════════════════════════════
-- 2. alert_spots — "여기를 지켜봐 주세요" 지점
--    ⚠️ 배경 위치 추적이 안 되므로 **사용자가 직접 저장한 지점**이 전부다.
-- ═══════════════════════════════════════════════════════════
create table if not exists public.alert_spots (
  id          bigint generated always as identity primary key,
  user_id     uuid not null references auth.users(id) on delete cascade,
  label       text not null check (char_length(label) between 1 and 40),
  lat         double precision not null check (lat between -90 and 90),
  lon         double precision not null check (lon between -180 and 180),
  -- 무엇을 알릴까. ⚠️ 기본은 **안전 항목만** 켠다.
  --    나머지를 기본으로 켜면 알림이 잦아져 정작 위험할 때 무시당한다.
  rip         boolean not null default true,   -- 이안류 경계 이상
  quake       boolean not null default true,   -- 가까운 지진
  warn        boolean not null default true,   -- 기상특보
  tsunami     boolean not null default true,
  -- 지진은 규모·거리 기준이 사람마다 다르다
  quake_min_mag  numeric(3,1) not null default 3.5 check (quake_min_mag >= 0),
  quake_max_km   integer not null default 150 check (quake_max_km > 0),
  created_at  timestamptz not null default now()
);
alter table public.alert_spots enable row level security;
create policy spot_all on public.alert_spots
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
create index if not exists idx_spot_user on public.alert_spots(user_id);

-- ⚠️⚠️ **지점 개수 제한을 트리거로 막는다.**
--    무료는 1곳, 유료는 20곳이다. 클라이언트에서 막으면 우회할 수 있고,
--    무제한이면 한 사람이 수천 곳을 넣어 발송 비용을 터뜨릴 수 있다.
create or replace function public.spot_limit()
returns trigger language plpgsql security definer set search_path = public as $$
declare n integer; tier text;
begin
  select count(*) into n from public.alert_spots where user_id = new.user_id;
  select p.tier into tier from public.profiles p where p.id = new.user_id;
  if n >= (case when tier = 'paid' then 20 else 1 end) then
    raise exception 'SPOT_LIMIT';
  end if;
  return new;
end $$;
drop trigger if exists trg_spot_limit on public.alert_spots;
create trigger trg_spot_limit before insert on public.alert_spots
  for each row execute function public.spot_limit();


-- ═══════════════════════════════════════════════════════════
-- 3. alert_sent — 같은 것을 두 번 보내지 않기
--    ⚠️⚠️ **이게 없으면 5분마다 같은 경보가 간다.** 이안류 '위험'은 몇 시간
--       이어지는데, 그동안 매 주기마다 알림이 오면 사용자는 알림을 꺼 버린다.
--       그러면 정작 다음 위험을 못 받는다 — 안 보내느니만 못하다.
-- ═══════════════════════════════════════════════════════════
create table if not exists public.alert_sent (
  id          bigint generated always as identity primary key,
  user_id     uuid not null references auth.users(id) on delete cascade,
  -- 같은 사건을 가리키는 열쇠. 예: 'rip:GYEONGPO:위험' · 'quake:JMA:2026-08-04T07:12'
  event_key   text not null,
  sent_at     timestamptz not null default now(),
  unique (user_id, event_key)
);
alter table public.alert_sent enable row level security;
create policy sent_sel on public.alert_sent for select using (auth.uid() = user_id);
create index if not exists idx_sent_at on public.alert_sent(sent_at);

-- 오래된 기록은 지운다. ⚠️ 너무 빨리 지우면 같은 경보가 다시 간다 —
--    이안류는 하루 안에 등급이 오르내리므로 **하루**는 남긴다.
create or replace function public.alert_sent_prune()
returns integer language plpgsql security definer set search_path = public as $$
declare n integer;
begin
  delete from public.alert_sent where sent_at < now() - interval '24 hours';
  get diagnostics n = row_count;
  return n;
end $$;
revoke all on function public.alert_sent_prune() from public, anon, authenticated;
grant execute on function public.alert_sent_prune() to service_role;


-- ═══════════════════════════════════════════════════════════
-- 4. 보낼 대상 모으기 — 서버(서비스 롤)만 부른다
--    ⚠️ 이 함수는 **남의 endpoint 를 돌려준다.** 절대 authenticated 에 열지 않는다.
-- ═══════════════════════════════════════════════════════════
create or replace function public.push_targets()
returns table (
  user_id uuid, endpoint text, p256dh text, auth text, lang text,
  spot_id bigint, label text, lat double precision, lon double precision,
  rip boolean, quake boolean, warn boolean, tsunami boolean,
  quake_min_mag numeric, quake_max_km integer, tier text
) language sql security definer stable set search_path = public as $$
  select s.user_id, s.endpoint, s.p256dh, s.auth, s.lang,
         a.id, a.label, a.lat, a.lon,
         a.rip, a.quake, a.warn, a.tsunami,
         a.quake_min_mag, a.quake_max_km,
         coalesce(p.tier, 'free')
    from public.push_subscriptions s
    join public.alert_spots a on a.user_id = s.user_id
    left join public.profiles p on p.id = s.user_id
   -- ⚠️ 계속 실패하는 구독은 빼 둔다. 지우는 건 발송 쪽이 404/410 을 보고 한다.
   where s.failed < 5;
$$;
revoke all on function public.push_targets() from public, anon, authenticated;
grant execute on function public.push_targets() to service_role;


-- ═══════════════════════════════════════════════════════════
-- 5. 보냈다고 기록 (중복 방지) — 서버 전용
--    ⚠️ **먼저 기록하고 보낸다.** 보내고 기록하면, 그 사이에 함수가 죽었을 때
--       같은 알림이 다음 주기에 또 간다. 한 번 덜 가는 쪽이 낫다.
-- ═══════════════════════════════════════════════════════════
create or replace function public.alert_claim(p_user uuid, p_key text)
returns boolean language plpgsql security definer set search_path = public as $$
begin
  insert into public.alert_sent (user_id, event_key) values (p_user, p_key);
  return true;
exception when unique_violation then
  return false;      -- 이미 보냈다
end $$;
revoke all on function public.alert_claim(uuid, text) from public, anon, authenticated;
grant execute on function public.alert_claim(uuid, text) to service_role;


-- ═══════════════════════════════════════════════════════════
-- 확인용
-- ═══════════════════════════════════════════════════════════
-- select tablename, rowsecurity from pg_tables where schemaname='public'
--   and tablename in ('push_subscriptions','alert_spots','alert_sent');
-- -- ⚠️ anon 키로 아래가 **0행**이어야 정상 (남의 알림 주소가 안 보인다)
-- select count(*) from public.push_subscriptions;
