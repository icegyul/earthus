CREATE EXTENSION IF NOT EXISTS pgcrypto;
CREATE EXTENSION IF NOT EXISTS postgis;

CREATE TABLE IF NOT EXISTS schema_version (
  version text PRIMARY KEY,
  applied_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS data_source (
  id text PRIMARY KEY,
  name text NOT NULL,
  source_grade text NOT NULL,
  license_policy text,
  auth_type text NOT NULL DEFAULT 'none',
  enabled boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS ingestion_run (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  source_id text NOT NULL REFERENCES data_source(id),
  started_at timestamptz NOT NULL,
  finished_at timestamptz,
  status text NOT NULL CHECK (status IN ('RUNNING','SUCCEEDED','FAILED','PARTIAL')),
  request_fingerprint text,
  record_count integer NOT NULL DEFAULT 0,
  error_json jsonb
);

CREATE TABLE IF NOT EXISTS raw_artifact (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  source_id text NOT NULL REFERENCES data_source(id),
  ingestion_run_id uuid REFERENCES ingestion_run(id),
  retrieved_at timestamptz NOT NULL,
  observed_at timestamptz,
  source_uri text,
  media_type text,
  content_sha256 text NOT NULL,
  object_uri text NOT NULL,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  UNIQUE(source_id, content_sha256)
);

CREATE TABLE IF NOT EXISTS canonical_entity (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  entity_type text NOT NULL,
  canonical_name text,
  catalog_id text,
  cospar_id text,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(entity_type, catalog_id)
);
CREATE INDEX IF NOT EXISTS canonical_entity_cospar_idx ON canonical_entity(cospar_id);

CREATE TABLE IF NOT EXISTS entity_alias (
  entity_id uuid NOT NULL REFERENCES canonical_entity(id) ON DELETE CASCADE,
  source_id text NOT NULL REFERENCES data_source(id),
  source_key text NOT NULL,
  source_name text,
  PRIMARY KEY(entity_id, source_id, source_key)
);

CREATE TABLE IF NOT EXISTS evidence (
  id uuid PRIMARY KEY,
  evidence_class text NOT NULL,
  source_id text NOT NULL REFERENCES data_source(id),
  source_record_id text,
  observed_at timestamptz NOT NULL,
  received_at timestamptz NOT NULL,
  checksum_sha256 text NOT NULL,
  source_grade text NOT NULL,
  quality double precision CHECK (quality IS NULL OR (quality >= 0 AND quality <= 1)),
  coordinate_frame text,
  license_policy text,
  access_policy text,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb
);
CREATE INDEX IF NOT EXISTS evidence_source_time_idx ON evidence(source_id, observed_at DESC);

CREATE TABLE IF NOT EXISTS digital_state (
  id uuid PRIMARY KEY,
  entity_id uuid NOT NULL REFERENCES canonical_entity(id),
  state_time timestamptz NOT NULL,
  state_kind text NOT NULL,
  representation text NOT NULL,
  frame text,
  time_system text NOT NULL DEFAULT 'UTC',
  state_hash text NOT NULL,
  payload jsonb NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(entity_id, state_time, state_kind, representation, state_hash)
);
CREATE INDEX IF NOT EXISTS digital_state_entity_time_idx ON digital_state(entity_id, state_time DESC);

CREATE TABLE IF NOT EXISTS digital_state_evidence (
  digital_state_id uuid NOT NULL REFERENCES digital_state(id) ON DELETE CASCADE,
  evidence_id uuid NOT NULL REFERENCES evidence(id),
  PRIMARY KEY(digital_state_id, evidence_id)
);

CREATE TABLE IF NOT EXISTS mission (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  canonical_name text NOT NULL,
  organization text,
  launch_site_entity_id uuid REFERENCES canonical_entity(id),
  target_orbit jsonb,
  status text NOT NULL DEFAULT 'PLANNED',
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS mission_timeline_event (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  mission_id uuid NOT NULL REFERENCES mission(id) ON DELETE CASCADE,
  event_type text NOT NULL,
  event_time timestamptz,
  relative_seconds double precision,
  evidence_class text NOT NULL,
  evidence_id uuid REFERENCES evidence(id),
  payload jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS signal (
  id uuid PRIMARY KEY,
  signal_type text NOT NULL,
  evidence_class text NOT NULL,
  producer_module_id text NOT NULL,
  observed_at timestamptz NOT NULL,
  mission_id uuid REFERENCES mission(id),
  metric_type text,
  value_json jsonb,
  units text,
  significance double precision CHECK (significance IS NULL OR (significance >= 0 AND significance <= 1)),
  payload jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS signal_time_idx ON signal(observed_at DESC);

CREATE TABLE IF NOT EXISTS signal_entity (
  signal_id uuid NOT NULL REFERENCES signal(id) ON DELETE CASCADE,
  entity_id uuid NOT NULL REFERENCES canonical_entity(id),
  PRIMARY KEY(signal_id, entity_id)
);
CREATE TABLE IF NOT EXISTS signal_evidence (
  signal_id uuid NOT NULL REFERENCES signal(id) ON DELETE CASCADE,
  evidence_id uuid NOT NULL REFERENCES evidence(id),
  PRIMARY KEY(signal_id, evidence_id)
);

CREATE TABLE IF NOT EXISTS intelligence_event (
  id uuid PRIMARY KEY,
  event_type text NOT NULL,
  canonical_key text NOT NULL UNIQUE,
  status text NOT NULL,
  mission_id uuid REFERENCES mission(id),
  first_seen_at timestamptz NOT NULL,
  updated_at timestamptz NOT NULL,
  current_revision_id uuid,
  validation_state text NOT NULL,
  tags text[] NOT NULL DEFAULT '{}'
);
CREATE INDEX IF NOT EXISTS intelligence_event_type_update_idx ON intelligence_event(event_type, updated_at DESC);

CREATE TABLE IF NOT EXISTS event_entity (
  event_id uuid NOT NULL REFERENCES intelligence_event(id) ON DELETE CASCADE,
  entity_id uuid NOT NULL REFERENCES canonical_entity(id),
  PRIMARY KEY(event_id, entity_id)
);

CREATE TABLE IF NOT EXISTS event_revision (
  id uuid PRIMARY KEY,
  event_id uuid NOT NULL REFERENCES intelligence_event(id) ON DELETE CASCADE,
  revision_no integer NOT NULL CHECK(revision_no >= 1),
  created_at timestamptz NOT NULL,
  delta jsonb NOT NULL,
  snapshot_hash text NOT NULL,
  reason_codes text[] NOT NULL DEFAULT '{}',
  UNIQUE(event_id, revision_no)
);
ALTER TABLE intelligence_event DROP CONSTRAINT IF EXISTS intelligence_event_current_revision_fk;
ALTER TABLE intelligence_event ADD CONSTRAINT intelligence_event_current_revision_fk FOREIGN KEY(current_revision_id) REFERENCES event_revision(id);

CREATE TABLE IF NOT EXISTS revision_signal (
  revision_id uuid NOT NULL REFERENCES event_revision(id) ON DELETE CASCADE,
  signal_id uuid NOT NULL REFERENCES signal(id),
  PRIMARY KEY(revision_id, signal_id)
);
CREATE TABLE IF NOT EXISTS revision_evidence (
  revision_id uuid NOT NULL REFERENCES event_revision(id) ON DELETE CASCADE,
  evidence_id uuid NOT NULL REFERENCES evidence(id),
  PRIMARY KEY(revision_id, evidence_id)
);

CREATE TABLE IF NOT EXISTS confidence_assessment (
  id uuid PRIMARY KEY,
  target_type text NOT NULL,
  target_id text NOT NULL,
  score double precision CHECK (score IS NULL OR (score >= 0 AND score <= 1)),
  grade text NOT NULL,
  factors jsonb NOT NULL,
  policy_version text NOT NULL,
  limitations jsonb NOT NULL DEFAULT '[]'::jsonb,
  computed_at timestamptz NOT NULL
);
CREATE INDEX IF NOT EXISTS confidence_target_idx ON confidence_assessment(target_type, target_id, computed_at DESC);

CREATE TABLE IF NOT EXISTS uncertainty_assessment (
  id uuid PRIMARY KEY,
  target_type text NOT NULL,
  target_id text NOT NULL,
  representation text NOT NULL,
  lower_value double precision,
  upper_value double precision,
  units text,
  payload jsonb NOT NULL DEFAULT '{}'::jsonb,
  policy_version text NOT NULL,
  limitations jsonb NOT NULL DEFAULT '[]'::jsonb,
  computed_at timestamptz NOT NULL
);
CREATE INDEX IF NOT EXISTS uncertainty_target_idx ON uncertainty_assessment(target_type, target_id, computed_at DESC);

CREATE TABLE IF NOT EXISTS scenario (
  id uuid PRIMARY KEY,
  kind text NOT NULL,
  baseline_snapshot_id text NOT NULL,
  effective_time timestamptz,
  parameters jsonb NOT NULL,
  assumptions jsonb NOT NULL,
  model_version text NOT NULL,
  config_version text,
  seed bigint,
  status text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS scenario_target (
  scenario_id uuid NOT NULL REFERENCES scenario(id) ON DELETE CASCADE,
  entity_id uuid NOT NULL REFERENCES canonical_entity(id),
  role text NOT NULL CHECK(role IN ('TARGET','PROTECTED')),
  PRIMARY KEY(scenario_id, entity_id, role)
);

CREATE TABLE IF NOT EXISTS attribution_result (
  id uuid PRIMARY KEY,
  scenario_id uuid NOT NULL REFERENCES scenario(id) ON DELETE CASCADE,
  metric_type text NOT NULL,
  subject_entity_id uuid NOT NULL REFERENCES canonical_entity(id),
  baseline_value double precision NOT NULL,
  scenario_value double precision NOT NULL,
  delta double precision NOT NULL,
  units text,
  confidence_assessment_id uuid REFERENCES confidence_assessment(id),
  uncertainty_assessment_id uuid REFERENCES uncertainty_assessment(id),
  provenance jsonb NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS decision_comparison (
  id uuid PRIMARY KEY,
  baseline_scenario_id uuid NOT NULL REFERENCES scenario(id),
  criteria jsonb NOT NULL,
  ranked_options jsonb NOT NULL DEFAULT '[]'::jsonb,
  advisory_only boolean NOT NULL DEFAULT true,
  limitations jsonb NOT NULL DEFAULT '[]'::jsonb,
  generated_at timestamptz NOT NULL
);

CREATE TABLE IF NOT EXISTS workspace (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_subject_id text NOT NULL,
  name text NOT NULL,
  workspace_type text NOT NULL,
  layout jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS follow (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  subject_id text NOT NULL,
  target_type text NOT NULL,
  target_id text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(subject_id, target_type, target_id)
);
CREATE TABLE IF NOT EXISTS alert_rule (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  subject_id text NOT NULL,
  rule_type text NOT NULL,
  config jsonb NOT NULL,
  enabled boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now()
);
-- AETHERUS V2 Foundation Truth Core (E01-E07)
-- Additive migration only. PostgreSQL/PostGIS remains the production canonical store.

ALTER TABLE data_source ADD COLUMN IF NOT EXISTS access_policy text;
ALTER TABLE data_source ADD COLUMN IF NOT EXISTS stale_after_seconds integer NOT NULL DEFAULT 3600 CHECK (stale_after_seconds > 0);
ALTER TABLE canonical_entity ADD COLUMN IF NOT EXISTS origin text;

CREATE TABLE IF NOT EXISTS quarantine_record (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  source_id text NOT NULL REFERENCES data_source(id),
  raw_artifact_id uuid NOT NULL REFERENCES raw_artifact(id),
  record_index integer NOT NULL CHECK(record_index >= 0),
  reason text NOT NULL,
  payload_hash text NOT NULL,
  created_at timestamptz NOT NULL
);

CREATE TABLE IF NOT EXISTS identity_conflict (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  source_id text NOT NULL REFERENCES data_source(id),
  source_key text NOT NULL,
  conflict_type text NOT NULL,
  existing_object_id uuid REFERENCES canonical_entity(id),
  existing_value text,
  incoming_value text,
  quarantined boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL
);
CREATE INDEX IF NOT EXISTS identity_conflict_source_idx ON identity_conflict(source_id, created_at DESC);

CREATE TABLE IF NOT EXISTS provenance_bundle (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  evidence_id uuid NOT NULL REFERENCES evidence(id),
  engine_id text,
  engine_version text,
  model_version text,
  config_version text,
  provenance_hash text NOT NULL UNIQUE,
  created_at timestamptz NOT NULL
);

CREATE TABLE IF NOT EXISTS provenance_link (
  provenance_bundle_id uuid NOT NULL REFERENCES provenance_bundle(id) ON DELETE RESTRICT,
  parent_type text NOT NULL,
  parent_id text NOT NULL,
  relation text NOT NULL,
  parent_hash text,
  PRIMARY KEY(provenance_bundle_id, parent_type, parent_id, relation)
);

CREATE TABLE IF NOT EXISTS time_context_manifest (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  mode text NOT NULL CHECK(mode IN ('ARCHIVED_STATE','RECONSTRUCTED_STATE','NOW','PREDICTED_MODEL','SIMULATION','COUNTERFACTUAL')),
  cursor_utc timestamptz NOT NULL,
  resolved_from_timezone text,
  source_time_scale text NOT NULL DEFAULT 'UTC',
  archived_snapshot_id text,
  reconstructed_from_snapshot_ids jsonb NOT NULL DEFAULT '[]'::jsonb,
  model_id text,
  context_hash text NOT NULL UNIQUE,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS timeline_bookmark (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  subject_id text,
  cursor_id text NOT NULL,
  time_context_manifest_id uuid NOT NULL REFERENCES time_context_manifest(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(subject_id, cursor_id)
);

CREATE TABLE IF NOT EXISTS frame_transform_manifest (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  from_frame text NOT NULL,
  to_frame text NOT NULL,
  epoch_utc timestamptz NOT NULL,
  method text NOT NULL,
  validation_state text NOT NULL,
  eop_age_seconds double precision,
  input_hash text NOT NULL,
  output_hash text NOT NULL,
  limitations jsonb NOT NULL DEFAULT '[]'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS frame_transform_epoch_idx ON frame_transform_manifest(epoch_utc DESC);

CREATE TABLE IF NOT EXISTS snapshot_manifest (
  id uuid PRIMARY KEY,
  snapshot_hash text NOT NULL UNIQUE,
  time_context jsonb NOT NULL,
  state_ids uuid[] NOT NULL,
  evidence_ids uuid[] NOT NULL DEFAULT '{}',
  baseline boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL
);

CREATE TABLE IF NOT EXISTS state_version (
  snapshot_id uuid PRIMARY KEY REFERENCES snapshot_manifest(id) ON DELETE RESTRICT,
  parent_snapshot_id uuid REFERENCES snapshot_manifest(id) ON DELETE RESTRICT,
  revision_reason text,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS object_relation (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  subject_id text NOT NULL,
  relation_type text NOT NULL,
  object_id text NOT NULL,
  provenance_evidence_id uuid NOT NULL REFERENCES evidence(id),
  valid_from timestamptz,
  valid_to timestamptz,
  uncertainty_reason text,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  CHECK(valid_to IS NULL OR valid_from IS NULL OR valid_to >= valid_from),
  CHECK(relation_type <> 'UNKNOWN' OR uncertainty_reason IS NOT NULL)
);
CREATE INDEX IF NOT EXISTS object_relation_subject_idx ON object_relation(subject_id, relation_type);
CREATE INDEX IF NOT EXISTS object_relation_object_idx ON object_relation(object_id, relation_type);

CREATE TABLE IF NOT EXISTS archive_index (
  object_id text PRIMARY KEY,
  relation_ids uuid[] NOT NULL DEFAULT '{}',
  snapshot_ids uuid[] NOT NULL DEFAULT '{}',
  indexed_at timestamptz NOT NULL
);

CREATE TABLE IF NOT EXISTS collection_manifest (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  collection_type text NOT NULL,
  canonical_key text NOT NULL,
  member_ids jsonb NOT NULL,
  provenance_evidence_ids uuid[] NOT NULL DEFAULT '{}',
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(collection_type, canonical_key)
);

-- Immutable science/history helper. Applied only to append-only Foundation/history tables.
CREATE OR REPLACE FUNCTION aetherus_prevent_mutation() RETURNS trigger AS $$
BEGIN
  RAISE EXCEPTION 'Aetherus append-only table % does not allow %', TG_TABLE_NAME, TG_OP;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS raw_artifact_immutable ON raw_artifact;
CREATE TRIGGER raw_artifact_immutable BEFORE UPDATE OR DELETE ON raw_artifact
FOR EACH ROW EXECUTE FUNCTION aetherus_prevent_mutation();

DROP TRIGGER IF EXISTS evidence_immutable ON evidence;
CREATE TRIGGER evidence_immutable BEFORE UPDATE OR DELETE ON evidence
FOR EACH ROW EXECUTE FUNCTION aetherus_prevent_mutation();

DROP TRIGGER IF EXISTS digital_state_immutable ON digital_state;
CREATE TRIGGER digital_state_immutable BEFORE UPDATE OR DELETE ON digital_state
FOR EACH ROW EXECUTE FUNCTION aetherus_prevent_mutation();

DROP TRIGGER IF EXISTS snapshot_manifest_immutable ON snapshot_manifest;
CREATE TRIGGER snapshot_manifest_immutable BEFORE UPDATE OR DELETE ON snapshot_manifest
FOR EACH ROW EXECUTE FUNCTION aetherus_prevent_mutation();

DROP TRIGGER IF EXISTS event_revision_immutable ON event_revision;
CREATE TRIGGER event_revision_immutable BEFORE UPDATE OR DELETE ON event_revision
FOR EACH ROW EXECUTE FUNCTION aetherus_prevent_mutation();

INSERT INTO schema_version(version) VALUES ('0002_foundation_truth_core') ON CONFLICT(version) DO NOTHING;
CREATE UNIQUE INDEX IF NOT EXISTS object_relation_dedupe_idx
ON object_relation(subject_id, relation_type, object_id, provenance_evidence_id, valid_from, valid_to);
