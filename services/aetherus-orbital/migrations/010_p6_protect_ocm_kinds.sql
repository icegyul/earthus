SET search_path TO public;

-- ORB-P6: PROTECT 역질의와 후보 OCM 시나리오 그룹을 허용한다.
-- 007이 kind를 REMOVE로 제한했으므로 P6 종류를 추가 개방한다 (멱등형).
-- PROTECT: protected_object_id 중심 역방향 후보 랭킹 (target은 NULL).
-- CANDIDATE_OCM: 명목 궤도 + 후보 기동(요소 치환)들을 공통 외부 집합에
--   대해 평가하고 해소/변경/신규 엣지를 보고한다. 자문 전용 — 지휘 경로 없음.

ALTER TABLE intervention_scenario
  DROP CONSTRAINT IF EXISTS intervention_scenario_kind_check;
ALTER TABLE intervention_scenario
  ADD CONSTRAINT intervention_scenario_kind_check
  CHECK (kind IN ('REMOVE', 'PROTECT', 'CANDIDATE_OCM'));
