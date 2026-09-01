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
