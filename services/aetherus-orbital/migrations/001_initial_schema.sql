-- Aetherus Orbital Environment canonical schema (PostgreSQL/PostGIS)
-- Migration 001: Initial schema from Master Spec schema.sql

-- Required extensions
CREATE EXTENSION IF NOT EXISTS postgis;
CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- Data sources
CREATE TABLE data_source (
  id text PRIMARY KEY,
  name text NOT NULL,
  base_url text,
  license text,
  auth_type text NOT NULL DEFAULT 'none',
  max_poll_seconds integer,
  terms_checked_at timestamptz,
  enabled boolean NOT NULL DEFAULT true
);

-- Ingestion tracking
CREATE TABLE ingestion_run (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  source_id text REFERENCES data_source(id),
  started_at timestamptz NOT NULL,
  finished_at timestamptz,
  status text NOT NULL CHECK(status IN ('RUNNING','SUCCEEDED','FAILED','PARTIAL')),
  request_fingerprint text,
  record_count integer DEFAULT 0,
  error_json jsonb
);

-- Raw artifacts (immutable source data)
CREATE TABLE raw_artifact (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  source_id text REFERENCES data_source(id),
  ingestion_run_id uuid REFERENCES ingestion_run(id),
  retrieved_at timestamptz NOT NULL,
  source_uri text,
  content_sha256 text NOT NULL,
  media_type text,
  object_uri text NOT NULL,
  UNIQUE(source_id,content_sha256)
);

-- Space objects (canonical identity)
CREATE TABLE space_object (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  catalog_id text UNIQUE,
  cospar_id text,
  canonical_name text,
  object_type text NOT NULL,
  origin_code text,
  launch_date date,
  decay_date date,
  mass_kg double precision,
  rcs_m2 double precision,
  status text,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

CREATE INDEX space_object_cospar_idx ON space_object(cospar_id);
CREATE INDEX space_object_origin_idx ON space_object(origin_code, object_type);

-- Object aliases from different sources
CREATE TABLE space_object_alias (
  object_id uuid REFERENCES space_object(id) ON DELETE CASCADE,
  source_id text,
  source_key text,
  source_name text,
  PRIMARY KEY(object_id,source_id,source_key)
);

-- Orbit solutions (versioned GP/OMM/OEM)
CREATE TABLE orbit_solution (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  object_id uuid REFERENCES space_object(id),
  source_id text,
  source_artifact_id uuid REFERENCES raw_artifact(id),
  epoch timestamptz NOT NULL,
  format text NOT NULL,
  frame text NOT NULL,
  time_system text NOT NULL,
  theory text,
  state_json jsonb,
  mean_elements_json jsonb,
  covariance_json jsonb,
  quality_json jsonb,
  model_version text,
  created_at timestamptz DEFAULT now(),
  UNIQUE(object_id, source_id, epoch, format)
);

CREATE INDEX orbit_object_epoch_idx ON orbit_solution(object_id,epoch DESC);

-- Propagated states
CREATE TABLE propagation_snapshot (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  object_id uuid REFERENCES space_object(id),
  orbit_solution_id uuid REFERENCES orbit_solution(id),
  sample_time timestamptz NOT NULL,
  frame text NOT NULL,
  x_km double precision,
  y_km double precision,
  z_km double precision,
  vx_kms double precision,
  vy_kms double precision,
  vz_kms double precision,
  lat_deg double precision,
  lon_deg double precision,
  alt_km double precision,
  position geometry(PointZ,4978),
  model_version text NOT NULL,
  input_hash text NOT NULL
);

CREATE INDEX propagation_time_idx ON propagation_snapshot(sample_time);
CREATE INDEX propagation_geom_idx ON propagation_snapshot USING gist(position);

-- Conjunction events
CREATE TABLE conjunction_event (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  primary_object_id uuid REFERENCES space_object(id),
  secondary_object_id uuid REFERENCES space_object(id),
  tca timestamptz NOT NULL,
  source_event_id text,
  first_seen_at timestamptz,
  last_seen_at timestamptz,
  status text NOT NULL DEFAULT 'OPEN',
  UNIQUE(primary_object_id,secondary_object_id,tca,source_event_id)
);

CREATE INDEX conjunction_event_tca_idx ON conjunction_event(tca);

-- Conjunction snapshots (versioned CDM data)
CREATE TABLE conjunction_snapshot (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  event_id uuid REFERENCES conjunction_event(id) ON DELETE CASCADE,
  snapshot_at timestamptz NOT NULL,
  miss_distance_m double precision,
  relative_speed_mps double precision,
  pc double precision,
  pc_method text,
  max_pc double precision,
  max_pc_method text,
  primary_covariance_json jsonb,
  secondary_covariance_json jsonb,
  dilution_state text,
  source_grade text NOT NULL,
  raw_artifact_id uuid REFERENCES raw_artifact(id),
  model_version text,
  input_hash text
);

-- Risk edges (baseline/scenario graphs)
CREATE TABLE risk_edge (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  baseline_snapshot_id text NOT NULL,
  object_a uuid REFERENCES space_object(id),
  object_b uuid REFERENCES space_object(id),
  horizon_start timestamptz,
  horizon_end timestamptz,
  metric_type text NOT NULL,
  metric_value double precision NOT NULL,
  feature_json jsonb NOT NULL,
  provenance_json jsonb NOT NULL,
  UNIQUE(baseline_snapshot_id,object_a,object_b,metric_type,horizon_start,horizon_end)
);

-- Intervention scenarios
CREATE TABLE intervention_scenario (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  kind text NOT NULL,
  target_object_id uuid REFERENCES space_object(id),
  protected_object_id uuid REFERENCES space_object(id),
  baseline_snapshot_id text NOT NULL,
  effective_time timestamptz,
  parameters jsonb NOT NULL,
  assumptions jsonb NOT NULL,
  status text NOT NULL DEFAULT 'DRAFT',
  model_version text NOT NULL,
  input_hash text NOT NULL,
  created_at timestamptz DEFAULT now()
);

-- Scenario runs
CREATE TABLE scenario_run (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  scenario_id uuid REFERENCES intervention_scenario(id) ON DELETE CASCADE,
  started_at timestamptz,
  finished_at timestamptz,
  status text NOT NULL,
  affected_object_count integer,
  baseline_edge_count integer,
  scenario_edge_count integer,
  compute_ms bigint,
  validation_state text,
  result_hash text,
  error_json jsonb
);

-- Benefit results
CREATE TABLE benefit_result (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  scenario_run_id uuid REFERENCES scenario_run(id) ON DELETE CASCADE,
  target_object_id uuid REFERENCES space_object(id),
  beneficiary_object_id uuid REFERENCES space_object(id),
  benefit_class text NOT NULL,
  metric_type text NOT NULL,
  baseline_value double precision NOT NULL,
  scenario_value double precision NOT NULL,
  benefit_value double precision NOT NULL,
  confidence double precision,
  uncertainty_low double precision,
  uncertainty_high double precision,
  horizon text,
  provenance_json jsonb NOT NULL,
  UNIQUE(scenario_run_id,beneficiary_object_id,metric_type,horizon)
);

CREATE INDEX benefit_beneficiary_idx ON benefit_result(beneficiary_object_id, metric_type);

-- Environment metrics
CREATE TABLE environment_metric (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  snapshot_id text NOT NULL,
  shell_id text NOT NULL,
  metric_type text NOT NULL,
  metric_value double precision NOT NULL,
  method_version text NOT NULL,
  assumptions jsonb NOT NULL,
  provenance_json jsonb NOT NULL,
  UNIQUE(snapshot_id,shell_id,metric_type,method_version)
);

-- Visual assets
CREATE TABLE visual_asset (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  object_id uuid REFERENCES space_object(id),
  event_key text,
  asset_type text NOT NULL,
  source_org text NOT NULL,
  source_url text NOT NULL,
  media_url text NOT NULL,
  license text,
  captured_at timestamptz,
  label text NOT NULL,
  is_primary boolean DEFAULT false,
  confidence double precision,
  verified_at timestamptz
);

-- Observation stations
CREATE TABLE observation_station (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_user_id text,
  name text NOT NULL,
  station_type text NOT NULL,
  lat double precision NOT NULL,
  lon double precision NOT NULL,
  alt_m double precision NOT NULL,
  equipment_json jsonb NOT NULL,
  timing_grade text,
  calibration_state text,
  public boolean DEFAULT false,
  reputation double precision DEFAULT 0.5
);

-- Observation requests
CREATE TABLE observation_request (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  object_id uuid REFERENCES space_object(id),
  reason text NOT NULL,
  priority double precision NOT NULL,
  start_time timestamptz NOT NULL,
  end_time timestamptz NOT NULL,
  required_measurement_type text NOT NULL,
  min_quality jsonb NOT NULL,
  expected_information_gain double precision,
  model_version text NOT NULL,
  status text NOT NULL DEFAULT 'OPEN'
);

-- Observation submissions
CREATE TABLE observation_submission (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  request_id uuid REFERENCES observation_request(id),
  station_id uuid REFERENCES observation_station(id),
  observed_at timestamptz NOT NULL,
  measurement_type text NOT NULL,
  measurements jsonb NOT NULL,
  raw_artifact_id uuid REFERENCES raw_artifact(id),
  time_accuracy_ms double precision,
  qa_state text NOT NULL DEFAULT 'PENDING',
  qa_json jsonb,
  created_at timestamptz DEFAULT now()
);

-- Model registry
CREATE TABLE model_registry (
  id text NOT NULL,
  version text NOT NULL,
  category text NOT NULL,
  source_commit text NOT NULL,
  config_schema jsonb NOT NULL,
  validation_state text NOT NULL,
  created_at timestamptz DEFAULT now(),
  PRIMARY KEY(id,version)
);

-- Validation runs
CREATE TABLE validation_run (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  model_id text NOT NULL,
  model_version text NOT NULL,
  dataset_id text NOT NULL,
  dataset_version text NOT NULL,
  started_at timestamptz,
  finished_at timestamptz,
  metrics jsonb NOT NULL,
  config jsonb NOT NULL,
  input_hash text NOT NULL,
  result_hash text NOT NULL,
  pass boolean NOT NULL
);

-- Research datasets
CREATE TABLE research_dataset (
  id text PRIMARY KEY,
  name text NOT NULL,
  description text,
  license text NOT NULL,
  access_level text NOT NULL
);

-- Research dataset versions
CREATE TABLE research_dataset_version (
  dataset_id text REFERENCES research_dataset(id),
  version text NOT NULL,
  snapshot_at timestamptz NOT NULL,
  manifest_uri text NOT NULL,
  sha256 text NOT NULL,
  model_versions jsonb NOT NULL,
  PRIMARY KEY(dataset_id,version)
);

-- Schema version tracking (outside schema_migrations for discoverability)
INSERT INTO model_registry (id, version, category, source_commit, config_schema, validation_state, created_at)
VALUES (
  'canonical_schema',
  'v1.0.0-p0',
  'database',
  'migration-001',
  '{"migration": "001_initial_schema.sql", "source": "Aetherus_Orbital_Environment_Codex_Package_v1.2/schema.sql"}'::jsonb,
  'APPLIED',
  now()
);
