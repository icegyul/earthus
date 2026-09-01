SET search_path TO public;

-- P6: PROTECT/OCM 런은 후보(candidate)마다 같은 수혜자·채널의 benefit 행을
-- 남기므로, P5 단일 개입을 전제한 UNIQUE(run, beneficiary, metric, horizon)를
-- 후보 판별자를 포함한 키로 교체한다. REMOVE 런은 candidate_ref=''(기본값)로
-- 기존 유일성이 그대로 유지된다. (멱등형)

ALTER TABLE benefit_result
  ADD COLUMN IF NOT EXISTS candidate_ref text NOT NULL DEFAULT '';

ALTER TABLE benefit_result
  DROP CONSTRAINT IF EXISTS benefit_result_scenario_run_id_beneficiary_object_id_metric_key;

CREATE UNIQUE INDEX IF NOT EXISTS benefit_result_run_beneficiary_metric_candidate_ux
  ON benefit_result (scenario_run_id, beneficiary_object_id, metric_type, horizon, candidate_ref);
