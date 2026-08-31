-- EARTHUS 2.0 v0.7 BACKEND METADATA CONTRACT
-- IMPORTANT: contract/reference only. Do not apply to production automatically.
-- Raw payload bytes stay in immutable S3/Object Storage; PostgreSQL stores control-plane metadata/indexes.

create table if not exists earthus_ingestion_run (
  run_id text primary key, provider_id text not null, operation_id text not null,
  state text not null, requested_at timestamptz not null, updated_at timestamptz not null,
  trace_id text, cursor_json jsonb, attempts integer not null default 0,
  raw_artifact_key text, normalized_ref text, failure_code text
);
create index if not exists earthus_ingestion_run_provider_time_idx on earthus_ingestion_run(provider_id, requested_at desc);

create table if not exists earthus_raw_artifact_meta (
  raw_hash text primary key, object_key text not null unique, provider_id text not null,
  operation_id text not null, run_id text references earthus_ingestion_run(run_id),
  observed_at timestamptz, received_at timestamptz not null, byte_length bigint not null,
  content_type text not null, immutable boolean not null default true
);

create table if not exists earthus_schema_contract (
  provider_id text not null, operation_id text not null, contract_version text not null,
  schema_fingerprint text not null, contract_json jsonb not null, active boolean not null default false,
  created_at timestamptz not null default now(), primary key(provider_id,operation_id,contract_version)
);

create table if not exists earthus_provider_watermark (
  provider_id text not null, operation_id text not null, watermark timestamptz,
  revision_cursor text, updated_at timestamptz not null default now(),
  primary key(provider_id,operation_id)
);

create table if not exists earthus_dedupe_key (
  dedupe_key text primary key, raw_hash text, first_seen_at timestamptz not null,
  expires_at timestamptz not null, provider_id text not null, operation_id text not null
);
create index if not exists earthus_dedupe_expiry_idx on earthus_dedupe_key(expires_at);

create table if not exists earthus_quarantine_record (
  quarantine_id text primary key, provider_id text not null, operation_id text,
  reason text not null, raw_artifact_key text, details_json jsonb,
  status text not null, created_at timestamptz not null, released_at timestamptz,
  release_evidence_json jsonb
);

create table if not exists earthus_outbox_event (
  event_id text primary key, event_type text not null, payload_json jsonb not null,
  status text not null, priority text not null default 'NORMAL', attempts integer not null default 0,
  dedupe_key text, created_at timestamptz not null, available_at timestamptz not null,
  lease_until timestamptz, delivered_at timestamptz, last_error text
);
create index if not exists earthus_outbox_ready_idx on earthus_outbox_event(status,available_at,priority);

create table if not exists earthus_canonical_event (
  event_id text primary key, event_type text, title text, status text,
  country text, region text, city text, occurred_at timestamptz,
  truth_class text, confidence numeric, event_json jsonb not null,
  created_at timestamptz not null default now(), updated_at timestamptz not null default now()
);
create index if not exists earthus_canonical_event_geo_time_idx on earthus_canonical_event(country,region,occurred_at desc);

create table if not exists earthus_event_lineage (
  from_id text not null, relation text not null, to_id text not null,
  evidence_json jsonb, created_at timestamptz not null default now(),
  primary key(from_id,relation,to_id)
);

create table if not exists earthus_source_fetch_state (
  source_id text primary key, etag text, last_modified text, last_status integer,
  last_checked_at timestamptz, next_allowed_at timestamptz, consecutive_failures integer not null default 0
);

create table if not exists earthus_release_config_snapshot (
  release_id text primary key, environment text not null, sha256 text not null,
  config_json jsonb not null, created_at timestamptz not null
);

create table if not exists earthus_publish_pointer (
  subject_key text primary key, object_key text not null, version text not null,
  previous_object_key text, previous_version text, published_at timestamptz not null
);
