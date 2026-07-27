-- earthus — Supabase 스키마
-- Supabase Dashboard → SQL Editor 에 붙여넣고 실행하세요.
--
-- 원칙
--   1. 모든 테이블에 RLS(행 수준 보안)를 켠다. 끄면 anon 키로 남의 데이터가 읽힌다.
--   2. 개인정보는 필요한 것만 저장한다 (개인정보 최소수집 원칙).
--   3. 동의 기록은 지우지 않는다 — 분쟁 시 근거.

-- ═══════════════════════════════════════════════════════════
-- 1. profiles — 회원 프로필
-- ═══════════════════════════════════════════════════════════
create table if not exists public.profiles (
  id                uuid primary key references auth.users(id) on delete cascade,
  email             text,
  provider          text,                       -- 'google' | 'apple'
  display_name      text,
  tier              text not null default 'free' check (tier in ('free','paid')),
  founding_member   boolean not null default false,
  -- 구독: 실제 판정은 Apple/Google 영수증을 서버가 검증해서 갱신한다.
  -- 클라이언트는 절대 이 값을 쓰지 못한다 (아래 RLS 참조).
  subscription_id   text,
  subscription_ends timestamptz,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now()
);

alter table public.profiles enable row level security;

-- 본인 것만 읽기
create policy "profiles_select_own" on public.profiles
  for select using (auth.uid() = id);

-- 본인 것만 수정하되, tier/구독 관련 컬럼은 못 바꾼다.
-- (트리거로 강제 — 정책만으로는 컬럼 단위 제한이 안 된다)
create policy "profiles_update_own" on public.profiles
  for update using (auth.uid() = id) with check (auth.uid() = id);

create or replace function public.guard_profile_columns()
returns trigger language plpgsql security definer as $$
begin
  if auth.uid() is not null and auth.role() = 'authenticated' then
    new.tier              := old.tier;
    new.founding_member   := old.founding_member;
    new.subscription_id   := old.subscription_id;
    new.subscription_ends := old.subscription_ends;
  end if;
  new.updated_at := now();
  return new;
end $$;

drop trigger if exists trg_guard_profile on public.profiles;
create trigger trg_guard_profile before update on public.profiles
  for each row execute function public.guard_profile_columns();

-- 가입 시 프로필 자동 생성
create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  insert into public.profiles (id, email, provider, display_name)
  values (
    new.id,
    new.email,
    new.raw_app_meta_data->>'provider',
    coalesce(new.raw_user_meta_data->>'full_name', new.raw_user_meta_data->>'name')
  )
  on conflict (id) do nothing;
  return new;
end $$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created after insert on auth.users
  for each row execute function public.handle_new_user();


-- ═══════════════════════════════════════════════════════════
-- 2. consents — 동의 이력
--    개인정보보호법상 동의 사실을 입증할 책임은 사업자에게 있다.
--    행을 갱신하지 말고 매번 새로 쌓는다 (이력 보존).
-- ═══════════════════════════════════════════════════════════
create table if not exists public.consents (
  id               bigserial primary key,
  user_id          uuid not null references auth.users(id) on delete cascade,
  tos_agreed       boolean not null,            -- 필수
  privacy_agreed   boolean not null,            -- 필수
  over_14          boolean not null,            -- 필수 (만 14세 이상)
  marketing_agreed boolean not null default false,  -- 선택
  location_agreed  boolean not null default false,  -- 선택
  tos_version      text,
  privacy_version  text,
  agreed_at        timestamptz not null default now()
);

alter table public.consents enable row level security;

create policy "consents_select_own" on public.consents
  for select using (auth.uid() = user_id);
create policy "consents_insert_own" on public.consents
  for insert with check (auth.uid() = user_id);
-- update/delete 정책 없음 = 아무도 못 고치고 못 지운다 (이력 보존)


-- ═══════════════════════════════════════════════════════════
-- 3. waitlist — 사전등록 (§7)
--    로그인 없이 이메일만 받는다.
-- ═══════════════════════════════════════════════════════════
create table if not exists public.waitlist (
  id               bigserial primary key,
  email            text not null unique,
  marketing_agreed boolean not null default false,
  privacy_version  text,
  created_at       timestamptz not null default now()
);

alter table public.waitlist enable row level security;

-- 누구나 등록만 가능. 읽기는 불가 (이메일 목록이 노출되면 안 된다).
create policy "waitlist_insert_anon" on public.waitlist
  for insert to anon, authenticated with check (true);

-- 진행률 게이지용 인원수만 공개하는 함수.
-- 테이블 자체를 열지 않고 숫자만 돌려준다.
create or replace function public.waitlist_count()
returns integer language sql security definer stable set search_path = public as $$
  select count(*)::int from public.waitlist;
$$;

grant execute on function public.waitlist_count() to anon, authenticated;


-- ═══════════════════════════════════════════════════════════
-- 4. delete_own_account — 앱 내 계정 삭제
--    ⚠️ App Store Review Guideline 5.1.1(v) 필수 요건.
--    anon 키로는 auth.users 를 지울 수 없어 security definer 함수가 필요하다.
-- ═══════════════════════════════════════════════════════════
create or replace function public.delete_own_account()
returns void language plpgsql security definer set search_path = public, auth as $$
declare
  uid uuid := auth.uid();
begin
  if uid is null then
    raise exception 'NOT_SIGNED_IN';
  end if;

  -- 동의 이력은 법적 보존 필요가 있을 수 있으므로 개인 식별자만 끊는다.
  -- (완전 삭제가 필요하면 아래 주석을 해제)
  -- delete from public.consents where user_id = uid;

  delete from public.profiles where id = uid;
  delete from auth.users where id = uid;   -- on delete cascade 로 나머지 정리
end $$;

grant execute on function public.delete_own_account() to authenticated;


-- ═══════════════════════════════════════════════════════════
-- 5. 인덱스
-- ═══════════════════════════════════════════════════════════
create index if not exists idx_consents_user on public.consents(user_id, agreed_at desc);
create index if not exists idx_waitlist_created on public.waitlist(created_at desc);


-- ═══════════════════════════════════════════════════════════
-- 확인용 — 실행 후 아래로 RLS 가 다 켜졌는지 점검
-- ═══════════════════════════════════════════════════════════
-- select tablename, rowsecurity from pg_tables
--   where schemaname='public' and tablename in ('profiles','consents','waitlist');


-- ═══════════════════════════════════════════════════════════
-- 6. 커뮤니티 · 선착순 관심등록  (2026-07-26 추가)
-- ═══════════════════════════════════════════════════════════

-- ── 개발 요청 게시판 ────────────────────────────────────────
-- 로그인 없이도 쓸 수 있게 한다 (진입 장벽을 낮춘다).
-- 대신 수정·삭제는 로그인해서 쓴 글만 가능하고, 신고 수단을 함께 둔다.
create table if not exists public.feature_requests (
  id          bigint generated always as identity primary key,
  body        text not null check (char_length(body) between 5 and 1000),
  lang        text not null default 'ko' check (lang in ('ko','en')),
  status      text not null default 'open'
              check (status in ('open','planned','doing','done','hold')),
  votes       integer not null default 0 check (votes >= 0),
  hidden      boolean not null default false,   -- 신고 처리용 (삭제 대신 숨김)
  user_id     uuid references auth.users(id) on delete set null,
  created_at  timestamptz not null default now()
);
alter table public.feature_requests enable row level security;

-- 숨김 처리되지 않은 글만 누구나 읽는다
create policy fr_read on public.feature_requests
  for select using (hidden = false);
-- 누구나 쓸 수 있다 (익명 포함). 단 status/votes 는 기본값만 — 아래 트리거로 강제.
create policy fr_insert on public.feature_requests
  for insert with check (true);
-- 자기 글만 고칠 수 있다
create policy fr_update_own on public.feature_requests
  for update using (auth.uid() is not null and user_id = auth.uid());

-- ⚠️ 클라이언트가 status/votes 를 마음대로 넣지 못하게 막는다.
--    RLS 만으로는 컬럼 값을 제한할 수 없어 트리거로 되돌린다.
create or replace function public.fr_force_defaults()
returns trigger language plpgsql as $$
begin
  new.status := 'open';
  new.votes  := 0;
  new.hidden := false;
  new.user_id := auth.uid();      -- 남의 id 를 사칭할 수 없게
  return new;
end $$;
drop trigger if exists trg_fr_defaults on public.feature_requests;
create trigger trg_fr_defaults before insert on public.feature_requests
  for each row execute function public.fr_force_defaults();

-- ── 공감 ────────────────────────────────────────────────────
-- ⚠️ votes = votes + 1 을 클라이언트가 계산해 UPDATE 하면
--    동시에 눌렸을 때 값이 어긋나고, 임의의 숫자를 넣을 수도 있다.
--    서버 함수로 원자적으로 1 만 올린다.
create or replace function public.vote_feature_request(req_id bigint)
returns void language plpgsql security definer set search_path = public as $$
begin
  update public.feature_requests set votes = votes + 1
   where id = req_id and hidden = false;
end $$;
grant execute on function public.vote_feature_request(bigint) to anon, authenticated;

-- ── 신고 ────────────────────────────────────────────────────
-- 공개 게시판에 신고 수단이 없으면 안 된다.
create table if not exists public.reports (
  id          bigint generated always as identity primary key,
  target_type text not null,
  target_id   bigint not null,
  reason      text,
  user_id     uuid references auth.users(id) on delete set null,
  created_at  timestamptz not null default now()
);
alter table public.reports enable row level security;
-- 신고는 누구나 넣을 수 있지만, 목록은 아무도 못 읽는다 (운영자만 대시보드에서)
create policy rp_insert on public.reports for insert with check (true);

-- ── 서비스별 선착순 관심 등록 (항공기 · 선박) ────────────────
create table if not exists public.service_interest (
  id              bigint generated always as identity primary key,
  service         text not null check (service in ('flight','ship')),
  email           text not null,
  user_id         uuid references auth.users(id) on delete set null,
  privacy_version text,
  created_at      timestamptz not null default now(),
  unique (service, email)                       -- 같은 서비스에 중복 등록 방지
);
alter table public.service_interest enable row level security;
-- ⚠️ 이메일이 들어 있다. 절대 select 정책을 열지 말 것.
--    인원수는 아래 함수로만 센다 (개별 이메일은 나가지 않는다).
create policy si_insert on public.service_interest for insert with check (true);

create or replace function public.service_interest_count(svc text)
returns integer language sql security definer set search_path = public stable as $$
  select count(*)::int from public.service_interest where service = svc;
$$;
grant execute on function public.service_interest_count(text) to anon, authenticated;

create index if not exists idx_fr_votes on public.feature_requests(votes desc, created_at desc);
create index if not exists idx_si_service on public.service_interest(service);
