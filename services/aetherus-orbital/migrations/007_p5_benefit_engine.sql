-- P5 Intervention Benefit Engine: immutable baseline risk-graph snapshots,
-- IDEALIZED_REMOVAL counterfactual scenarios, append-only benefit results.
-- The P5 tables from the canonical schema already exist with zero rows, so
-- tightening them with constraints and triggers is safe.

CREATE TABLE IF NOT EXISTS baseline_graph_snapshot (
  id text PRIMARY KEY,
  created_at timestamptz NOT NULL DEFAULT now(),
  horizon_start timestamptz NOT NULL,
  horizon_end timestamptz NOT NULL,
  event_count integer NOT NULL DEFAULT 0,
  edge_count integer NOT NULL DEFAULT 0,
  object_count integer NOT NULL DEFAULT 0,
  model_id text NOT NULL,
  model_version text NOT NULL,
  config_json jsonb NOT NULL,
  config_hash text NOT NULL,
  input_hash text NOT NULL,
  graph_hash text NOT NULL,
  data_status text NOT NULL
    CHECK (data_status IN ('OK', 'PARTIAL', 'INSUFFICIENT_DATA', 'UNAVAILABLE')),
  status_reason text,
  validation_state text NOT NULL
    CHECK (validation_state IN ('PUBLIC_SCREENING', 'SIMULATION_ONLY')),
  provenance_json jsonb NOT NULL DEFAULT '{}'::jsonb
);

CREATE INDEX IF NOT EXISTS baseline_graph_created_idx
  ON baseline_graph_snapshot (created_at DESC);

CREATE INDEX IF NOT EXISTS baseline_graph_validation_idx
  ON baseline_graph_snapshot (validation_state, created_at DESC);

-- Baseline risk edges: one row per (baseline, ordered pair, metric channel,
-- horizon). Metric channels are never merged; MISS_DISTANCE stays a feature,
-- never a benefit number.
ALTER TABLE risk_edge
  ADD COLUMN IF NOT EXISTS created_at timestamptz NOT NULL DEFAULT now(),
  ADD COLUMN IF NOT EXISTS validation_state text NOT NULL DEFAULT 'PUBLIC_SCREENING';

ALTER TABLE risk_edge
  DROP CONSTRAINT IF EXISTS risk_edge_no_self_edge;
ALTER TABLE risk_edge
  ADD CONSTRAINT risk_edge_no_self_edge CHECK (object_a <> object_b);

ALTER TABLE risk_edge
  DROP CONSTRAINT IF EXISTS risk_edge_baseline_fk;
ALTER TABLE risk_edge
  ADD CONSTRAINT risk_edge_baseline_fk
  FOREIGN KEY (baseline_snapshot_id) REFERENCES baseline_graph_snapshot(id);

ALTER TABLE risk_edge
  DROP CONSTRAINT IF EXISTS risk_edge_metric_channel_check;
ALTER TABLE risk_edge
  ADD CONSTRAINT risk_edge_metric_channel_check
  CHECK (metric_type IN ('PC', 'MAX_PC', 'CONJUNCTION_EXPOSURE'));

CREATE INDEX IF NOT EXISTS risk_edge_baseline_idx
  ON risk_edge (baseline_snapshot_id);

CREATE INDEX IF NOT EXISTS risk_edge_object_a_idx ON risk_edge (object_a);
CREATE INDEX IF NOT EXISTS risk_edge_object_b_idx ON risk_edge (object_b);

-- Scenario definitions are immutable once created; runs and benefits append.
ALTER TABLE intervention_scenario
  ADD COLUMN IF NOT EXISTS requested_metrics jsonb NOT NULL DEFAULT '[]'::jsonb;

ALTER TABLE intervention_scenario
  DROP CONSTRAINT IF EXISTS intervention_scenario_kind_check;
ALTER TABLE intervention_scenario
  ADD CONSTRAINT intervention_scenario_kind_check
  CHECK (kind IN ('REMOVE'));

ALTER TABLE intervention_scenario
  DROP CONSTRAINT IF EXISTS intervention_scenario_baseline_fk;
ALTER TABLE intervention_scenario
  ADD CONSTRAINT intervention_scenario_baseline_fk
  FOREIGN KEY (baseline_snapshot_id) REFERENCES baseline_graph_snapshot(id);

-- Scenario runs gain the recompute-mode / equivalence / benchmark provenance
-- required by BEN-003. Terminal rows are protected by trigger below.
ALTER TABLE scenario_run
  ADD COLUMN IF NOT EXISTS data_status text
    CHECK (data_status IN ('OK', 'PARTIAL', 'INSUFFICIENT_DATA', 'UNAVAILABLE')),
  ADD COLUMN IF NOT EXISTS status_reason text,
  ADD COLUMN IF NOT EXISTS recompute_mode text
    CHECK (recompute_mode IN ('FULL', 'AFFECTED_SUBGRAPH')),
  ADD COLUMN IF NOT EXISTS model_id text,
  ADD COLUMN IF NOT EXISTS input_hash text,
  ADD COLUMN IF NOT EXISTS config_hash text,
  ADD COLUMN IF NOT EXISTS thresholds_json jsonb,
  ADD COLUMN IF NOT EXISTS affected_edge_count integer,
  ADD COLUMN IF NOT EXISTS reused_baseline_edge_count integer,
  ADD COLUMN IF NOT EXISTS peak_memory_bytes bigint,
  ADD COLUMN IF NOT EXISTS warnings_json jsonb NOT NULL DEFAULT '[]'::jsonb;

ALTER TABLE scenario_run
  DROP CONSTRAINT IF EXISTS scenario_run_terminal_status_check;
ALTER TABLE scenario_run
  ADD CONSTRAINT scenario_run_status_check
  CHECK (status IN ('RUNNING', 'SUCCEEDED', 'FAILED', 'PARTIAL'));

CREATE INDEX IF NOT EXISTS scenario_run_scenario_idx
  ON scenario_run (scenario_id, started_at DESC);

-- A beneficiary is any object improved by the scenario except the target
-- itself; self-benefit is structurally impossible.
ALTER TABLE benefit_result
  DROP CONSTRAINT IF EXISTS benefit_result_no_self_benefit;
ALTER TABLE benefit_result
  ADD CONSTRAINT benefit_result_no_self_benefit
  CHECK (
    target_object_id IS NULL OR beneficiary_object_id IS NULL
    OR target_object_id <> beneficiary_object_id
  );

ALTER TABLE benefit_result
  DROP CONSTRAINT IF EXISTS benefit_result_class_check;
ALTER TABLE benefit_result
  ADD CONSTRAINT benefit_result_class_check
  CHECK (benefit_class IN ('DIRECT', 'INDIRECT_FRAGMENTATION', 'ENVIRONMENT'));

ALTER TABLE benefit_result
  DROP CONSTRAINT IF EXISTS benefit_result_metric_channel_check;
ALTER TABLE benefit_result
  ADD CONSTRAINT benefit_result_metric_channel_check
  CHECK (metric_type IN ('PC', 'MAX_PC', 'CONJUNCTION_EXPOSURE'));

CREATE INDEX IF NOT EXISTS benefit_result_run_idx
  ON benefit_result (scenario_run_id);

-- ---------------------------------------------------------------------------
-- Immutability: the scientific record is append-only. Refreshes INSERT new
-- snapshot/run/benefit rows; UPDATE and DELETE are rejected at the database.
-- scenario_run keeps exactly one guarded transition window (RUNNING ->
-- terminal) because timing/status finalization is part of the record.
CREATE OR REPLACE FUNCTION forbid_p5_record_mutation() RETURNS trigger AS $$
BEGIN
  IF TG_OP = 'UPDATE' AND TG_TABLE_NAME = 'scenario_run' THEN
    IF OLD.status = 'RUNNING' AND NEW.status IN ('SUCCEEDED', 'FAILED', 'PARTIAL') THEN
      RETURN NEW;
    END IF;
    RAISE EXCEPTION 'scenario_run % is immutable after finalization', OLD.id
      USING ERRCODE = 'raise_exception';
  END IF;
  RAISE EXCEPTION '% is append-only; refreshes must INSERT a new row',
    TG_TABLE_NAME
    USING ERRCODE = 'raise_exception';
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS baseline_graph_snapshot_append_only ON baseline_graph_snapshot;
CREATE TRIGGER baseline_graph_snapshot_append_only
  BEFORE UPDATE OR DELETE ON baseline_graph_snapshot
  FOR EACH ROW EXECUTE FUNCTION forbid_p5_record_mutation();

DROP TRIGGER IF EXISTS risk_edge_append_only ON risk_edge;
CREATE TRIGGER risk_edge_append_only
  BEFORE UPDATE OR DELETE ON risk_edge
  FOR EACH ROW EXECUTE FUNCTION forbid_p5_record_mutation();

DROP TRIGGER IF EXISTS intervention_scenario_append_only ON intervention_scenario;
CREATE TRIGGER intervention_scenario_append_only
  BEFORE UPDATE OR DELETE ON intervention_scenario
  FOR EACH ROW EXECUTE FUNCTION forbid_p5_record_mutation();

DROP TRIGGER IF EXISTS scenario_run_immutable_after_final ON scenario_run;
CREATE TRIGGER scenario_run_immutable_after_final
  BEFORE UPDATE OR DELETE ON scenario_run
  FOR EACH ROW EXECUTE FUNCTION forbid_p5_record_mutation();

DROP TRIGGER IF EXISTS benefit_result_append_only ON benefit_result;
CREATE TRIGGER benefit_result_append_only
  BEFORE UPDATE OR DELETE ON benefit_result
  FOR EACH ROW EXECUTE FUNCTION forbid_p5_record_mutation();

INSERT INTO model_registry (id, version, category, source_commit, config_schema, validation_state)
VALUES (
    'aetherus-risk-graph',
    'p5-baseline-v1',
    'risk_graph',
    'codex/p5-benefit-engine',
    CAST('{
        "edge_sources": ["conjunction_event", "conjunction_snapshot(latest per event)"],
        "metric_channels": {
            "PC": "sum of COMPUTED snapshot pc; covariance-gated upstream",
            "MAX_PC": "max of present snapshot max_pc",
            "CONJUNCTION_EXPOSURE": "event count within horizon (EVENT_COUNT_V1)"
        },
        "miss_distance_policy": "screening feature only; never converted into a risk score"
    }' AS jsonb),
    'VALIDATED'
)
ON CONFLICT (id, version) DO NOTHING;

INSERT INTO model_registry (id, version, category, source_commit, config_schema, validation_state)
VALUES (
    'aetherus-benefit-engine',
    'p5-idealized-removal-v1',
    'intervention_benefit',
    'codex/p5-benefit-engine',
    CAST('{
        "formula": "Benefit_i(s,h,m) = R_i(G0,h,m) - R_i(Gs,h,m)",
        "aggregation": "SUM_INCIDENT_EDGES_V1",
        "assumption": "IDEALIZED_REMOVAL",
        "beneficiary_rule": "non-target objects with Benefit_i > threshold(metric)",
        "self_benefit": "EXCLUDED",
        "environment_benefit": "NOT_COMPUTED_IN_P5",
        "equivalence_datasets": [
            "synthetic-remove-direct-v1",
            "synthetic-remove-equivalence-v1"
        ]
    }' AS jsonb),
    'VALIDATED'
)
ON CONFLICT (id, version) DO NOTHING;
