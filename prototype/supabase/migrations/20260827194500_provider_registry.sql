-- EARTHUS 2.0 provider/API registry metadata.
-- Secret values are NOT stored in these tables. provider-admin encrypts them into a private Storage bucket.

create table if not exists public.provider_registry (
  code text primary key check (code ~ '^[A-Z0-9_]+$'),
  display_name text not null,
  category text not null,
  auth_mode text not null default 'api_key' check (auth_mode in ('api_key','oauth','public','mixed')),
  credential_required boolean not null default true,
  enabled boolean not null default true,
  docs_url text,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
alter table public.provider_registry enable row level security;

create table if not exists public.provider_credential_meta (
  id uuid primary key,
  provider_code text not null references public.provider_registry(code) on delete cascade,
  environment text not null check (environment in ('development','staging','production')),
  alias text not null check (char_length(alias) between 1 and 80),
  credential_type text not null check (char_length(credential_type) between 1 and 80),
  fingerprint text not null,
  field_names text[] not null default '{}',
  object_path text not null,
  expires_at timestamptz,
  created_by uuid not null references auth.users(id),
  created_at timestamptz not null default now(),
  revoked_by uuid references auth.users(id),
  revoked_at timestamptz
);
alter table public.provider_credential_meta enable row level security;
create index if not exists idx_provider_credential_active
  on public.provider_credential_meta(provider_code, environment, created_at desc)
  where revoked_at is null;

create table if not exists public.provider_health (
  provider_code text not null references public.provider_registry(code) on delete cascade,
  environment text not null check (environment in ('development','staging','production')),
  status text not null default 'UNCONFIGURED'
    check (status in ('UNCONFIGURED','CONFIGURED','TESTING','OK','DEGRADED','ERROR','ADAPTER_PENDING','DISABLED')),
  last_test_at timestamptz,
  last_success_at timestamptz,
  last_failure_at timestamptz,
  last_error_code text,
  latest_data_at timestamptz,
  rate_limit_note text,
  updated_at timestamptz not null default now(),
  primary key(provider_code, environment)
);
alter table public.provider_health enable row level security;

insert into public.provider_registry(code,display_name,category,auth_mode,credential_required,notes)
values
  ('KMA','Korea Meteorological Administration','weather','api_key',true,'KMA API Hub / official weather data'),
  ('AIRKOREA','AirKorea','air_quality','api_key',true,'Official Korean air-quality data'),
  ('KTO','Korea Tourism Organization','tourism','api_key',true,'TourAPI / tourism data'),
  ('SEOUL_CITY','Seoul Open Data','city_realtime','api_key',true,'Seoul real-time city/population data'),
  ('ECMWF','ECMWF Open Data / AIFS','weather_model','mixed',false,'Open-data products may not require a credential; commercial/provider-specific access can be added separately.'),
  ('JMA','Japan Meteorological Agency','weather_typhoon','public',false,'Official JMA public products'),
  ('NOAA','NOAA / NWS','weather_ocean_satellite','public',false,'Official NOAA/NWS public products')
on conflict(code) do update set
  display_name=excluded.display_name,
  category=excluded.category,
  auth_mode=excluded.auth_mode,
  credential_required=excluded.credential_required,
  notes=excluded.notes,
  updated_at=now();

insert into public.provider_health(provider_code, environment, status)
select r.code, e.env,
  case when r.credential_required then 'UNCONFIGURED' else 'CONFIGURED' end
from public.provider_registry r
cross join (values ('development'),('staging'),('production')) as e(env)
on conflict(provider_code,environment) do nothing;

-- No browser RLS policies are intentionally created. All access goes through provider-admin.
