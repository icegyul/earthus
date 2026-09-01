SET search_path TO public;

-- 012/013 적대 감사(2026-09-01) 후속 교정.
--
-- 1) observed_at → declared_at
--    궤도요소의 EPOCH(상태 유효시각)를 넣고 있었으나, OBJECT_TYPE 은 그 시각에
--    '관측'된 값이 아니라 프로바이더가 응답에서 '선언'한 값이다. 잘못된 시계로
--    계보 타임라인을 정렬하면 도착 순서가 뒤집힌다.
--
-- 2) 멱등성
--    같은 raw 아티팩트를 재처리하면 새 증거 0건으로 계보 행이 증식했다. 계보 행
--    수를 '몇 번 확증되었나'로 읽는 순간 그 수치가 재처리 횟수가 된다.
--    (object_id, field_name, source_id, raw_artifact_id) 를 유일하게 만든다.
--
-- 3) SAME_SOURCE_REAFFIRMED
--    CONFIRMED 는 '다른 소스가 일치'를 뜻하도록 좁히고, 같은 소스의 반복 수집은
--    별도 결과값으로 분리한다. 한 소스의 메아리를 교차 확증으로 읽히게 두지 않는다.

ALTER TABLE object_metadata_revision
  RENAME COLUMN observed_at TO declared_at;

-- 4) ingestion_run_id 제거
--    선언만 해두고 어떤 코드도 채우지 않아 항상 NULL 이었다. 채울 수 없는 필드를
--    남겨두면 감사자는 '수집되지 않음'과 '기록하지 않음'을 구별할 수 없다.
--    실행 연결은 raw_artifact_id → ingestion_run_artifact 로 추적한다.
ALTER TABLE object_metadata_revision
  DROP COLUMN IF EXISTS ingestion_run_id;

COMMENT ON COLUMN object_metadata_revision.declared_at IS
  '프로바이더가 이 값을 선언한 응답의 수신 시각(관측 시각이 아니다).';

ALTER TABLE object_metadata_revision
  DROP CONSTRAINT IF EXISTS object_metadata_revision_outcome_check;

ALTER TABLE object_metadata_revision
  ADD CONSTRAINT object_metadata_revision_outcome_check
  CHECK (outcome IN (
    'ESTABLISHED', 'ADOPTED', 'CONFLICT', 'CONFIRMED', 'SAME_SOURCE_REAFFIRMED'
  ));

CREATE UNIQUE INDEX IF NOT EXISTS object_metadata_revision_unique_claim_ux
  ON object_metadata_revision (object_id, field_name, source_id, raw_artifact_id);

COMMENT ON TABLE object_metadata_revision IS
  '객체 메타데이터의 출처 계보. ESTABLISHED=최초 확립, ADOPTED=결측 자리표시자를 출처로 채움, '
  'CONFLICT=값 불일치(덮어쓰지 않음), CONFIRMED=다른 소스가 일치, '
  'SAME_SOURCE_REAFFIRMED=같은 소스의 재선언(교차 확증 아님).';
