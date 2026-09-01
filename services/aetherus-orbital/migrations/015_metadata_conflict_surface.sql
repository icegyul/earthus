SET search_path TO public;

-- 012/013/014 적대 감사(2026-09-01, 2차) 후속 교정.
--
-- 1) cospar_id × CONFLICT 은 사문(死文)이었다
--    012 의 CHECK 는 3필드 × 전 결과값을 허용해 "세 필드 모두 메타데이터 층에서
--    다툼을 기록한다"고 약속한다. 실제로는 ObjectIdentityResolver 가 값이 있는
--    COSPAR 불일치를 CATALOG_CONFLICTING_COSPAR / COSPAR_REUSED_DIFFERENT_CATALOG
--    로 먼저 격리하므로, 메타데이터 계보를 쓰는 경로에는 도달할 수 없다.
--    (검증: 이 마이그레이션 시점의 운영 데이터에 해당 조합 0건)
--
--    약속을 실제 도달 범위로 좁힌다. 이 조합이 나타난다는 것은 신원 게이트가
--    우회되었다는 뜻이며, 그때는 조용히 기록될 것이 아니라 실패해야 한다.
--    코드도 같은 지점에서 명시적으로 실패한다(repository._record_metadata_provenance).
--
-- 2) 메타데이터 충돌의 리뷰 지점
--    CONFLICT 의 reason 은 'preserved for review' 라고 적었으나 어떤 상태값에도
--    노출되지 않아 리뷰 지점이 없었다. 소비자 표면(get_object)의
--    metadata_status='DISPUTED' 가 그 지점이 된다. 스키마 쪽에서는 미해결 충돌을
--    한 번의 조회로 셀 수 있도록 필드별 부분 인덱스를 남긴다.

ALTER TABLE object_metadata_revision
  DROP CONSTRAINT IF EXISTS object_metadata_revision_cospar_conflict_unreachable_check;

ALTER TABLE object_metadata_revision
  ADD CONSTRAINT object_metadata_revision_cospar_conflict_unreachable_check
  CHECK (NOT (field_name = 'cospar_id' AND outcome = 'CONFLICT'));

COMMENT ON CONSTRAINT object_metadata_revision_cospar_conflict_unreachable_check
  ON object_metadata_revision IS
  'COSPAR 불일치는 신원 충돌(identity_conflict)로 격리되므로 메타데이터 충돌로는 도달할 수 없다. '
  '이 조합의 삽입 시도는 신원 게이트 우회를 뜻한다.';

CREATE INDEX IF NOT EXISTS object_metadata_revision_disputed_field_idx
  ON object_metadata_revision (object_id, field_name)
  WHERE outcome = 'CONFLICT';

COMMENT ON INDEX object_metadata_revision_disputed_field_idx IS
  '소비자 표면(metadata_status=DISPUTED)이 객체당 다투어지는 필드를 한 번에 읽기 위한 인덱스.';
