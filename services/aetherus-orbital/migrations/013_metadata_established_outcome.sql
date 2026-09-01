SET search_path TO public;

-- 012 후속: 객체가 처음 만들어질 때의 계보를 CONFIRMED로 적으면 "다른 소스가
-- 확증했다"는 오해를 낳는다. 실제로는 그 소스가 값을 최초로 확립한 것이므로
-- ESTABLISHED 를 별도 결과값으로 둔다. 계보가 스스로를 과장하지 않게 하는 교정.

ALTER TABLE object_metadata_revision
  DROP CONSTRAINT IF EXISTS object_metadata_revision_outcome_check;

ALTER TABLE object_metadata_revision
  ADD CONSTRAINT object_metadata_revision_outcome_check
  CHECK (outcome IN ('ESTABLISHED', 'ADOPTED', 'CONFLICT', 'CONFIRMED'));

COMMENT ON TABLE object_metadata_revision IS
  '객체 메타데이터의 출처 계보. ESTABLISHED=최초 확립, ADOPTED=결측을 출처로 채움, CONFLICT=값 불일치(덮어쓰지 않음), CONFIRMED=다른 소스가 기존 값과 일치.';
