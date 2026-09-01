-- P1 durable provider provenance, quarantine, and canonical-identity safeguards.
-- These changes are additive: original raw-artifact rows remain immutable and link to
-- their creating ingestion run instead of being rewritten for later cache-hit runs.

ALTER TABLE ingestion_run
  ADD COLUMN IF NOT EXISTS metadata_json jsonb NOT NULL DEFAULT '{}'::jsonb;

ALTER TABLE raw_artifact
  ADD COLUMN IF NOT EXISTS provenance_json jsonb NOT NULL DEFAULT '{}'::jsonb;

CREATE TABLE IF NOT EXISTS ingestion_run_artifact (
  ingestion_run_id uuid NOT NULL REFERENCES ingestion_run(id) ON DELETE CASCADE,
  raw_artifact_id uuid NOT NULL REFERENCES raw_artifact(id) ON DELETE RESTRICT,
  relation text NOT NULL CHECK (relation IN ('CREATED', 'REUSED')),
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (ingestion_run_id, raw_artifact_id)
);

INSERT INTO ingestion_run_artifact (ingestion_run_id, raw_artifact_id, relation)
SELECT ingestion_run_id, id, 'CREATED'
FROM raw_artifact
WHERE ingestion_run_id IS NOT NULL
ON CONFLICT (ingestion_run_id, raw_artifact_id) DO NOTHING;

CREATE TABLE IF NOT EXISTS ingestion_record_rejection (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  ingestion_run_id uuid NOT NULL REFERENCES ingestion_run(id) ON DELETE CASCADE,
  raw_artifact_id uuid NOT NULL REFERENCES raw_artifact(id) ON DELETE RESTRICT,
  source_record_index integer NOT NULL CHECK (source_record_index >= 0),
  record_fragment_sha256 text NOT NULL CHECK (record_fragment_sha256 ~ '^[0-9a-f]{64}$'),
  reason_code text NOT NULL,
  details_json jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS ingestion_record_rejection_raw_artifact_idx
  ON ingestion_record_rejection (raw_artifact_id, source_record_index);

CREATE TABLE IF NOT EXISTS identity_conflict (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  existing_object_id uuid REFERENCES space_object(id) ON DELETE RESTRICT,
  incoming_source_id text NOT NULL REFERENCES data_source(id),
  incoming_catalog_id text,
  incoming_cospar_id text,
  raw_artifact_id uuid NOT NULL REFERENCES raw_artifact(id) ON DELETE RESTRICT,
  conflict_type text NOT NULL CHECK (
    conflict_type IN ('CATALOG_CONFLICTING_COSPAR', 'COSPAR_REUSED_DIFFERENT_CATALOG')
  ),
  resolution_state text NOT NULL DEFAULT 'OPEN' CHECK (resolution_state IN ('OPEN', 'RESOLVED')),
  resolution_json jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  resolved_at timestamptz
);

CREATE INDEX IF NOT EXISTS identity_conflict_open_idx
  ON identity_conflict (resolution_state, created_at DESC);

-- Do not silently select one object when P0 aliases already conflict. Manual review
-- is required before the uniqueness rule can be applied safely.
DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM space_object_alias
    WHERE source_id IS NOT NULL AND source_key IS NOT NULL
    GROUP BY source_id, source_key
    HAVING count(*) > 1
  ) THEN
    RAISE EXCEPTION 'space_object_alias contains duplicate source_id/source_key pairs';
  END IF;
END
$$;

CREATE UNIQUE INDEX IF NOT EXISTS space_object_alias_source_key_unique
  ON space_object_alias (source_id, source_key);

-- P1 accepts catalog IDs as unmodified decimal strings of one through nine digits.
-- Existing invalid values are a migration stop condition, not a reason to coerce data.
DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM space_object
    WHERE catalog_id IS NOT NULL AND catalog_id !~ '^[0-9]{1,9}$'
  ) THEN
    RAISE EXCEPTION 'space_object contains catalog IDs outside the P1 one-to-nine-digit contract';
  END IF;
END
$$;

ALTER TABLE space_object
  DROP CONSTRAINT IF EXISTS space_object_catalog_id_decimal_1_9_check;

ALTER TABLE space_object
  ADD CONSTRAINT space_object_catalog_id_decimal_1_9_check
  CHECK (catalog_id IS NULL OR catalog_id ~ '^[0-9]{1,9}$');

INSERT INTO data_source (
  id, name, base_url, license, auth_type, max_poll_seconds, enabled
)
VALUES (
  'celestrak_gp',
  'CelesTrak GP',
  'https://celestrak.org/NORAD/elements/gp.php',
  'CelesTrak public GP data; usage policy applies',
  'none',
  7200,
  true
)
ON CONFLICT (id) DO UPDATE SET
  name = EXCLUDED.name,
  base_url = EXCLUDED.base_url,
  license = EXCLUDED.license,
  auth_type = EXCLUDED.auth_type,
  max_poll_seconds = EXCLUDED.max_poll_seconds,
  enabled = EXCLUDED.enabled;

INSERT INTO data_source (
  id, name, base_url, license, auth_type, max_poll_seconds, enabled
)
VALUES (
  'spacetrack_gp',
  'Space-Track GP',
  'https://www.space-track.org',
  'Space-Track user agreement; authenticated GP data',
  'password',
  3600,
  true
)
ON CONFLICT (id) DO UPDATE SET
  name = EXCLUDED.name,
  base_url = EXCLUDED.base_url,
  license = EXCLUDED.license,
  auth_type = EXCLUDED.auth_type,
  max_poll_seconds = EXCLUDED.max_poll_seconds,
  enabled = EXCLUDED.enabled;
