-- EARTHUS v8 — 자체 예보 결과의 서버 전용 저장소.
--
-- 공식 관측·공식 예보·공식 경보 저장소가 아니다. Earthus 융합/보정 결과만 들어간다.
-- ⚠️ RLS 정책을 만들지 않는다. anon/authenticated는 읽기 권한이 없고 Edge Function의
--    service_role만 읽는다. 무료 클라이언트에 JSON을 보낸 뒤 화면에서 숨기면 안 된다.
-- ⚠️ 이 migration을 적용해도 출시되는 것은 아니다. RELEASED 행과 5개 gate가 모두
--    참인 현재 유효 revision이 없으면 forecast-v8 함수는 503으로 닫힌다.

create table if not exists public.earthus_forecast_revisions (
  id              text primary key,
  scope_key       text not null check (scope_key ~ '^[A-Za-z0-9._:-]{3,128}$'),
  schema_version  text not null default '8.0',
  data_class      text not null default 'EARTHUS_DERIVED'
                  check (data_class = 'EARTHUS_DERIVED'),
  access_class    text not null default 'PREMIUM'
                  check (access_class = 'PREMIUM'),
  release_state   text not null default 'SHADOW'
                  check (release_state in ('DRAFT','SHADOW','RELEASED','ROLLED_BACK')),
  sample_gate     boolean not null default false,
  skill_gate      boolean not null default false,
  freshness_gate  boolean not null default false,
  rights_gate     boolean not null default false,
  rollback_gate   boolean not null default false,
  issued_at       timestamptz not null,
  valid_from      timestamptz not null,
  valid_until     timestamptz not null,
  published_at    timestamptz,
  source_refs     text[] not null check (cardinality(source_refs) > 0),
  outputs         jsonb not null
                  check (jsonb_typeof(outputs) = 'array' and jsonb_array_length(outputs) > 0),
  created_by      uuid references auth.users(id) on delete set null,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),
  check (valid_until > valid_from),
  check (release_state <> 'RELEASED' or published_at is not null)
);

alter table public.earthus_forecast_revisions enable row level security;
alter table public.earthus_forecast_revisions force row level security;
revoke all on table public.earthus_forecast_revisions from anon, authenticated;
grant select, insert, update on table public.earthus_forecast_revisions to service_role;

create index if not exists earthus_forecast_scope_current
  on public.earthus_forecast_revisions(scope_key, release_state, valid_from, valid_until, published_at desc);

create or replace function public.guard_earthus_forecast_release()
returns trigger language plpgsql set search_path = public as $$
begin
  new.updated_at := now();
  if new.release_state <> 'RELEASED' then return new; end if;

  if not (new.sample_gate and new.skill_gate and new.freshness_gate
          and new.rights_gate and new.rollback_gate) then
    raise exception 'FORECAST_RELEASE_GATE_CLOSED';
  end if;
  if new.published_at is null or new.valid_until <= new.valid_from then
    raise exception 'FORECAST_RELEASE_TIME_INVALID';
  end if;
  if new.data_class <> 'EARTHUS_DERIVED' or new.access_class <> 'PREMIUM' then
    raise exception 'FORECAST_PREMIUM_BOUNDARY_INVALID';
  end if;
  if jsonb_typeof(new.outputs) <> 'array' or jsonb_array_length(new.outputs) = 0 then
    raise exception 'FORECAST_OUTPUTS_MISSING';
  end if;
  if exists (
    select 1
      from jsonb_array_elements(new.outputs) as output
     where coalesce(output->>'dataClass', '') <> 'EARTHUS_DERIVED'
        or coalesce(output->>'accessClass', '') <> 'PREMIUM'
        or coalesce(output->>'releaseState', '') <> 'RELEASED'
        or coalesce(jsonb_typeof(output->'sourceRefs'), '') <> 'array'
        or jsonb_array_length(output->'sourceRefs') = 0
  ) then
    raise exception 'FORECAST_OUTPUT_BOUNDARY_INVALID';
  end if;
  return new;
end $$;

drop trigger if exists trg_guard_earthus_forecast_release on public.earthus_forecast_revisions;
create trigger trg_guard_earthus_forecast_release
before insert or update on public.earthus_forecast_revisions
for each row execute function public.guard_earthus_forecast_release();

-- 상태 변경 이력은 수정/삭제 API 없이 누적한다. rollback 조사와 release 책임 추적용이다.
create table if not exists public.earthus_forecast_release_audit (
  id                     bigint generated always as identity primary key,
  revision_id            text not null references public.earthus_forecast_revisions(id),
  previous_release_state text,
  next_release_state     text not null,
  gate_snapshot          jsonb not null,
  actor_id               uuid references auth.users(id) on delete set null,
  changed_at             timestamptz not null default now()
);
alter table public.earthus_forecast_release_audit enable row level security;
alter table public.earthus_forecast_release_audit force row level security;
revoke all on table public.earthus_forecast_release_audit from anon, authenticated;
grant select, insert on table public.earthus_forecast_release_audit to service_role;

create or replace function public.audit_earthus_forecast_release()
returns trigger language plpgsql set search_path = public as $$
begin
  if tg_op = 'INSERT' or old.release_state is distinct from new.release_state then
    insert into public.earthus_forecast_release_audit(
      revision_id, previous_release_state, next_release_state, gate_snapshot, actor_id
    ) values (
      new.id,
      case when tg_op = 'INSERT' then null else old.release_state end,
      new.release_state,
      jsonb_build_object(
        'sample', new.sample_gate, 'skill', new.skill_gate,
        'freshness', new.freshness_gate, 'rights', new.rights_gate,
        'rollback', new.rollback_gate
      ),
      auth.uid()
    );
  end if;
  return new;
end $$;

drop trigger if exists trg_audit_earthus_forecast_release on public.earthus_forecast_revisions;
create trigger trg_audit_earthus_forecast_release
after insert or update on public.earthus_forecast_revisions
for each row execute function public.audit_earthus_forecast_release();

-- 운영 확인 (migration 적용 뒤 수동 검증):
-- select tablename, rowsecurity from pg_tables where tablename like 'earthus_forecast_%';
-- set role authenticated; select * from public.earthus_forecast_revisions; -- permission denied가 정상
-- reset role;
