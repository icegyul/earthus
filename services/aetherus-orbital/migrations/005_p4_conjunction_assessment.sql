-- P4 Conjunction Assessment: screening-run provenance, stable event identity,
-- append-only conjunction snapshots, and metric-channel status columns.
-- The schema evolves additively; conjunction_event holds no rows before P4,
-- so tightening its identity constraint is safe.

CREATE TABLE IF NOT EXISTS screening_run (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  started_at timestamptz NOT NULL DEFAULT now(),
  finished_at timestamptz,
  status text NOT NULL CHECK (status IN ('RUNNING', 'SUCCEEDED', 'FAILED', 'PARTIAL')),
  window_start timestamptz NOT NULL,
  window_stop timestamptz NOT NULL,
  config_json jsonb NOT NULL,
  config_hash text NOT NULL,
  model_id text NOT NULL,
  model_version text NOT NULL,
  input_hash text NOT NULL,
  objects_considered integer NOT NULL DEFAULT 0,
  objects_propagated integer NOT NULL DEFAULT 0,
  pairs_before_screening bigint NOT NULL DEFAULT 0,
  pairs_after_coarse bigint NOT NULL DEFAULT 0,
  propagation_failure_count integer NOT NULL DEFAULT 0,
  propagation_failures_json jsonb NOT NULL DEFAULT '[]'::jsonb,
  events_found integer NOT NULL DEFAULT 0,
  data_status text NOT NULL
    CHECK (data_status IN ('OK', 'PARTIAL', 'INSUFFICIENT_DATA', 'UNAVAILABLE')),
  status_reason text,
  validation_dataset_id text,
  validation_dataset_version text,
  error_json jsonb
);

CREATE INDEX IF NOT EXISTS screening_run_started_idx
  ON screening_run (started_at DESC);

ALTER TABLE conjunction_event
  ADD COLUMN IF NOT EXISTS screening_run_id uuid REFERENCES screening_run(id);

-- A conjunction event is identified by its ordered canonical pair plus a stable
-- external identity; refreshed computations become appended snapshots, never a
-- new event. Self pairs are structurally impossible.
ALTER TABLE conjunction_event
  DROP CONSTRAINT IF EXISTS conjunction_event_primary_object_id_secondary_object_id_tca_source_event_id_key;

ALTER TABLE conjunction_event
  ADD CONSTRAINT conjunction_event_no_self_pair
  CHECK (primary_object_id <> secondary_object_id);

ALTER TABLE conjunction_event
  ADD CONSTRAINT conjunction_event_identity
  UNIQUE (primary_object_id, secondary_object_id, source_event_id);

CREATE INDEX IF NOT EXISTS conjunction_event_primary_idx
  ON conjunction_event (primary_object_id, tca DESC);

CREATE INDEX IF NOT EXISTS conjunction_event_secondary_idx
  ON conjunction_event (secondary_object_id, tca DESC);

ALTER TABLE conjunction_snapshot
  ADD COLUMN IF NOT EXISTS screening_run_id uuid REFERENCES screening_run(id),
  ADD COLUMN IF NOT EXISTS pc_status text
    CHECK (pc_status IN ('COMPUTED', 'NOT_COMPUTED', 'PC_UNAVAILABLE')),
  ADD COLUMN IF NOT EXISTS pc_unavailable_reason text,
  ADD COLUMN IF NOT EXISTS covariance_status text
    CHECK (covariance_status IN (
      'PRESENT_VALID', 'INSUFFICIENT_DATA', 'INVALID', 'UNAVAILABLE'
    )),
  ADD COLUMN IF NOT EXISTS tca_boundary_flag boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS validation_state text NOT NULL DEFAULT 'PUBLIC_SCREENING',
  ADD COLUMN IF NOT EXISTS provenance_json jsonb NOT NULL DEFAULT '{}'::jsonb;

CREATE INDEX IF NOT EXISTS conjunction_snapshot_event_idx
  ON conjunction_snapshot (event_id, snapshot_at DESC);

CREATE INDEX IF NOT EXISTS conjunction_snapshot_run_idx
  ON conjunction_snapshot (screening_run_id);

-- Snapshots form the immutable scientific record: refreshes append, nothing
-- mutates or deletes an existing snapshot row.
CREATE OR REPLACE FUNCTION forbid_conjunction_snapshot_mutation() RETURNS trigger AS $$
BEGIN
  RAISE EXCEPTION 'conjunction_snapshot is append-only; refreshes must INSERT a new snapshot'
    USING ERRCODE = 'raise_exception';
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS conjunction_snapshot_append_only ON conjunction_snapshot;

CREATE TRIGGER conjunction_snapshot_append_only
  BEFORE UPDATE OR DELETE ON conjunction_snapshot
  FOR EACH ROW EXECUTE FUNCTION forbid_conjunction_snapshot_mutation();

INSERT INTO model_registry (id, version, category, source_commit, config_schema, validation_state)
VALUES (
    'aetherus-ca-screening',
    'p4-conservative-v1',
    'conjunction_screening',
    'codex/p4-conjunction-screening',
    CAST('{
        "strategy": "shell-envelope + time-cascade aligned-sample screening",
        "false_negative_target": 0,
        "validation_datasets": [
            "synthetic-10k-injected-close-pairs-v1",
            "analytic-tca-known-minimum-v1"
        ]
    }' AS jsonb),
    'VALIDATED'
)
ON CONFLICT (id, version) DO NOTHING;

INSERT INTO model_registry (id, version, category, source_commit, config_schema, validation_state)
VALUES (
    'foster-1992-pc',
    'p4-encounter-plane-v1',
    'collision_probability',
    'codex/p4-conjunction-screening',
    CAST('{
        "method": "FOSTER-1992",
        "encounter_plane": "normal to relative velocity",
        "integration": "deterministic Gauss-Legendre polar quadrature",
        "requires": ["combined_covariance_psd", "finite_states", "explicit_hbr"],
        "quality_flags": ["DILUTION_SUSPECTED"],
        "validation_datasets": [
            "tracss-spec-example-derived-cdm-fixtures-v1"
        ]
    }' AS jsonb),
    'VALIDATED'
)
ON CONFLICT (id, version) DO NOTHING;
