-- AETHERUS V2 Integrated Product Runtime (E08-E44, L01-L08, S01-S12)
-- Additive PostgreSQL/PostGIS contract. This migration does not imply that a
-- production database was executed in the package-build environment.

CREATE TABLE IF NOT EXISTS universe_revision (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id text NOT NULL,
  revision_no integer NOT NULL CHECK(revision_no >= 1),
  state_hash text NOT NULL,
  state_json jsonb NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(session_id, revision_no),
  UNIQUE(session_id, state_hash)
);
CREATE INDEX IF NOT EXISTS universe_revision_latest_idx ON universe_revision(session_id, revision_no DESC);

CREATE TABLE IF NOT EXISTS product_record (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  domain text NOT NULL CHECK(domain IN ('SPACE','CONTROL','ORBIT','INTELLIGENCE','ARCHIVE','PLATFORM','LLM')),
  record_type text NOT NULL,
  entity_key text NOT NULL,
  version integer NOT NULL CHECK(version >= 1),
  observed_at timestamptz NOT NULL,
  evidence_class text,
  validation_state text,
  payload_hash text NOT NULL,
  payload_json jsonb NOT NULL,
  UNIQUE(domain, record_type, entity_key, version),
  UNIQUE(domain, record_type, entity_key, payload_hash)
);
CREATE INDEX IF NOT EXISTS product_record_lookup_idx ON product_record(domain, record_type, entity_key, version DESC);

-- CONTROL
CREATE TABLE IF NOT EXISTS launch_window_revision (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), mission_id uuid NOT NULL REFERENCES mission(id),
  revision_no integer NOT NULL, opens_at timestamptz, closes_at timestamptz,
  status text NOT NULL, evidence_id uuid REFERENCES evidence(id), created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(mission_id, revision_no)
);
CREATE TABLE IF NOT EXISTS mission_state_transition (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), mission_id uuid NOT NULL REFERENCES mission(id),
  from_state text, to_state text NOT NULL, transition_time timestamptz NOT NULL,
  evidence_class text NOT NULL, evidence_id uuid REFERENCES evidence(id), reason text,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS telemetry_sample (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), mission_id uuid NOT NULL REFERENCES mission(id),
  sample_time timestamptz NOT NULL, evidence_class text NOT NULL,
  telemetry_kind text NOT NULL CHECK(telemetry_kind IN ('OFFICIAL_TELEMETRY','MODELLED_TRAJECTORY')),
  units jsonb NOT NULL DEFAULT '{}'::jsonb, payload jsonb NOT NULL,
  evidence_id uuid REFERENCES evidence(id), created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS telemetry_mission_time_idx ON telemetry_sample(mission_id, sample_time);
CREATE TABLE IF NOT EXISTS trajectory_manifest (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), mission_id uuid NOT NULL REFERENCES mission(id),
  frame text NOT NULL, source_label text NOT NULL, evidence_class text NOT NULL,
  assumptions jsonb NOT NULL DEFAULT '[]'::jsonb, trajectory_hash text NOT NULL UNIQUE,
  payload jsonb NOT NULL, created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS mission_orbit_handover (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), mission_id uuid NOT NULL REFERENCES mission(id),
  object_entity_id uuid REFERENCES canonical_entity(id), relation_type text NOT NULL,
  evidence_id uuid REFERENCES evidence(id), created_at timestamptz NOT NULL DEFAULT now()
);

-- SPACE
CREATE TABLE IF NOT EXISTS celestial_state_product (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), target_key text NOT NULL, observer_key text,
  state_time timestamptz NOT NULL, frame text NOT NULL, provider text NOT NULL,
  kernel_version text, evidence_class text NOT NULL, validation_state text NOT NULL,
  state_hash text NOT NULL UNIQUE, payload jsonb NOT NULL, created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS space_weather_state_product (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), observed_at timestamptz NOT NULL,
  forecast_valid_at timestamptz, source_id text, evidence_class text NOT NULL,
  validation_state text NOT NULL, stale boolean NOT NULL DEFAULT false,
  payload_hash text NOT NULL UNIQUE, payload jsonb NOT NULL, created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS small_body_state (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), object_key text NOT NULL, state_time timestamptz NOT NULL,
  source_grade text NOT NULL, evidence_class text NOT NULL, validation_state text NOT NULL,
  uncertainty jsonb, payload_hash text NOT NULL UNIQUE, payload jsonb NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS deep_space_mission_state (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), mission_key text NOT NULL, state_time timestamptz NOT NULL,
  state_class text NOT NULL, evidence_class text NOT NULL, validation_state text NOT NULL,
  payload_hash text NOT NULL UNIQUE, payload jsonb NOT NULL, created_at timestamptz NOT NULL DEFAULT now()
);

-- ORBIT
CREATE TABLE IF NOT EXISTS orbit_state_product (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), object_key text NOT NULL, epoch timestamptz NOT NULL,
  frame text NOT NULL, source_id text, source_age_seconds double precision,
  validation_state text NOT NULL, state_hash text NOT NULL UNIQUE, payload jsonb NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS orbit_state_product_object_epoch_idx ON orbit_state_product(object_key, epoch DESC);
CREATE TABLE IF NOT EXISTS conjunction_assessment (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), primary_key text NOT NULL, secondary_key text NOT NULL,
  tca timestamptz, miss_distance_km double precision, relative_speed_km_s double precision,
  validation_state text NOT NULL, provenance jsonb NOT NULL, assessment_hash text NOT NULL UNIQUE,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS collision_risk_assessment (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), conjunction_id uuid REFERENCES conjunction_assessment(id),
  pc double precision CHECK(pc IS NULL OR (pc >= 0 AND pc <= 1)), method text,
  covariance_available boolean NOT NULL, validation_state text NOT NULL,
  limitations jsonb NOT NULL DEFAULT '[]'::jsonb, provenance jsonb NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  CHECK(covariance_available OR pc IS NULL)
);
CREATE TABLE IF NOT EXISTS risk_graph_snapshot (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), snapshot_time timestamptz NOT NULL,
  config_version text NOT NULL, graph_hash text NOT NULL UNIQUE, payload jsonb NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS orbital_shell_snapshot (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), shell text NOT NULL CHECK(shell IN ('LEO','MEO','GEO')),
  snapshot_time timestamptz NOT NULL, coverage double precision,
  validation_state text NOT NULL, payload_hash text NOT NULL UNIQUE, payload jsonb NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS genealogy_link (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), child_key text NOT NULL, parent_key text,
  origin_status text NOT NULL, provenance jsonb NOT NULL, created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS fragmentation_run (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), parent_key text NOT NULL, seed bigint NOT NULL,
  model_version text NOT NULL, validation_state text NOT NULL DEFAULT 'RESEARCH_ONLY',
  output_hash text NOT NULL UNIQUE, payload jsonb NOT NULL, created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS reentry_revision (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), object_key text NOT NULL, revision_no integer NOT NULL,
  estimate_time timestamptz, window_json jsonb, evidence_class text NOT NULL, validation_state text NOT NULL,
  provenance jsonb NOT NULL, created_at timestamptz NOT NULL DEFAULT now(), UNIQUE(object_key, revision_no)
);
CREATE TABLE IF NOT EXISTS observation_record (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), object_key text, observed_at timestamptz NOT NULL,
  observer_class text NOT NULL, qa_state text NOT NULL, evidence_class text NOT NULL,
  license_policy text, payload_hash text NOT NULL UNIQUE, payload jsonb NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS scenario_validation_run (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), scenario_id uuid REFERENCES scenario(id),
  validation_kind text NOT NULL, result_state text NOT NULL, result_hash text NOT NULL UNIQUE,
  payload jsonb NOT NULL, created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS protect_ranking (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), protected_entity_key text NOT NULL,
  generated_at timestamptz NOT NULL, model_version text NOT NULL,
  ranking_hash text NOT NULL UNIQUE, ranked_candidates jsonb NOT NULL, provenance jsonb NOT NULL
);

-- INTELLIGENCE / PLATFORM / LLM operations
CREATE TABLE IF NOT EXISTS intelligence_task_run (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), trigger_key text NOT NULL, module_id text NOT NULL,
  status text NOT NULL, dependency_hash text, result_hash text, error_json jsonb,
  created_at timestamptz NOT NULL DEFAULT now(), UNIQUE(trigger_key, module_id, dependency_hash)
);
CREATE TABLE IF NOT EXISTS evidence_fusion_assessment (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), target_key text NOT NULL,
  policy_version text NOT NULL, assessment_hash text NOT NULL UNIQUE,
  source_conflicts jsonb NOT NULL DEFAULT '[]'::jsonb, payload jsonb NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS importance_assessment (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), target_key text NOT NULL,
  policy_version text NOT NULL, score double precision CHECK(score >= 0 AND score <= 1),
  reasons jsonb NOT NULL, scientific_hash text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS dataset_manifest (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), dataset_key text NOT NULL, version text NOT NULL,
  content_hash text NOT NULL, license_policy text NOT NULL, provenance jsonb NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(), UNIQUE(dataset_key, version, content_hash)
);
CREATE TABLE IF NOT EXISTS job_run (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), job_key text NOT NULL, idempotency_key text NOT NULL UNIQUE,
  status text NOT NULL, attempts integer NOT NULL DEFAULT 0, payload jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS audit_event (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), tenant_id text, actor_id text,
  action text NOT NULL, target_type text, target_id text, trace_id text,
  payload jsonb NOT NULL DEFAULT '{}'::jsonb, created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS llm_claim_audit (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), packet_id text NOT NULL,
  provider text NOT NULL, model text, claim_hash text NOT NULL,
  validation_state text NOT NULL, citations jsonb NOT NULL DEFAULT '[]'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- Scientific and historical outputs are append-only.
DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY[
    'universe_revision','product_record','launch_window_revision','mission_state_transition',
    'telemetry_sample','trajectory_manifest','mission_orbit_handover','celestial_state_product',
    'space_weather_state_product','small_body_state','deep_space_mission_state','orbit_state_product',
    'conjunction_assessment','collision_risk_assessment','risk_graph_snapshot','orbital_shell_snapshot',
    'genealogy_link','fragmentation_run','reentry_revision','observation_record','scenario_validation_run',
    'protect_ranking','intelligence_task_run','evidence_fusion_assessment','importance_assessment',
    'dataset_manifest','llm_claim_audit'
  ]
  LOOP
    EXECUTE format('DROP TRIGGER IF EXISTS %I_immutable ON %I', t, t);
    EXECUTE format('CREATE TRIGGER %I_immutable BEFORE UPDATE OR DELETE ON %I FOR EACH ROW EXECUTE FUNCTION aetherus_prevent_mutation()', t, t);
  END LOOP;
END $$;

INSERT INTO schema_version(version) VALUES ('0003_integrated_product_runtime') ON CONFLICT(version) DO NOTHING;
