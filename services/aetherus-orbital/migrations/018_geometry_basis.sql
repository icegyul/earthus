SET search_path TO public;

-- 기하 채널(miss_distance_m · relative_speed_mps)의 계보 판별자.
--
-- 016 이 MAX_PC 에서 고친 결함을 같은 행의 옆 채널에서 재생산했다. 페이로드는
--
--     "status": "COMPUTED" if row["miss_distance_m"] is not None else "NOT_COMPUTED"
--
-- 로 상태를 값의 존재에서 추론했고, SOCRATES 수집이 CelesTrak 의 TCA_RANGE 를
-- miss_distance_m 에 쓰는 순간(2026-09-02 실측 수집, 4행) 남이 공표한 거리가
-- "우리가 계산함"으로 서빙되기 시작했다. 016 머리말의 경고가 그대로 재현된 것이다.
-- (적발: 2026-09-02 SOCRATES 체인 적대 검증, CRITICAL 판정)
--
-- 두 기하값은 항상 같은 원산지를 공유하므로 컬럼 하나로 충분하다:
--   COMPUTED_INTERNAL — 우리 TCA 정밀화가 도출
--   OBSERVED_EXTERNAL — 외부 공표값을 출처와 함께 수집
--
-- 백필 불가(append-only 트리거, 016 과 동일한 이유). 기존 행의 판별은 코드가
-- **기록된 생산자 신원(model_version)** 을 내부 모델 허용목록과 대조해 해석한다 —
-- 값의 존재가 아니라 기록된 계보를 읽는 것이므로 추론이 아니라 조회다.
-- 이 마이그레이션 시점의 외부 기하 행은 model_version='CELESTRAK_SOCRATES' 4행뿐이며
-- 이들은 허용목록 밖이라 BASIS_UNRECORDED 로 표면화된다(정직: 컬럼 이전에 기록됨).

ALTER TABLE conjunction_snapshot
  ADD COLUMN IF NOT EXISTS geometry_basis text;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'conjunction_snapshot_geometry_basis_check'
  ) THEN
    ALTER TABLE conjunction_snapshot
      ADD CONSTRAINT conjunction_snapshot_geometry_basis_check
      CHECK (
        geometry_basis IS NULL
        OR geometry_basis IN ('COMPUTED_INTERNAL', 'OBSERVED_EXTERNAL')
      );
  END IF;
END $$;

-- 재수집 중복 방지 검사(동일 이벤트·동일 원본 바이트)를 인덱스로 뒷받침한다.
CREATE INDEX IF NOT EXISTS conjunction_snapshot_event_input_idx
  ON conjunction_snapshot (event_id, input_hash);

COMMENT ON COLUMN conjunction_snapshot.geometry_basis IS
  'miss_distance_m·relative_speed_mps 의 원산지. NULL 은 018 이전 행 — 코드가 '
  'model_version 허용목록으로 해석하며, 목록 밖이면 BASIS_UNRECORDED 로 표면화된다.';
