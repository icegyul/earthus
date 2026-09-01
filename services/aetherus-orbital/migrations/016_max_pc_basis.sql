SET search_path TO public;

-- MAX_PC 채널의 계보 판별자.
--
-- 결함: conjunction_snapshot 은 pc 에는 pc_status 를 주었으나 max_pc 에는 주지
-- 않았다. 그래서 API 페이로드(_event_payload)가 상태를 값의 존재로부터 추론했다:
--
--     "status": "COMPUTED" if row["max_pc"] is not None else "NOT_COMPUTED"
--
-- 바로 네 줄 위 PC 채널은 저장된 pc_status 를 그대로 통과시킨다. MAX_PC 만
-- 추론했고, 그 추론은 언제나 우리에게 유리한 방향("우리가 계산했다")이었다.
--
-- 지금은 무해하다 — 이 시점 운영 데이터에 max_pc 비어있지 않은 행 0건.
-- 그러나 외부 스크리닝 지표(CelesTrak SOCRATES MAX_PROB, 벤더 피드, 고객 업로드)를
-- 넣는 순간 발화한다: 남이 계산한 값이 우리 계산으로 보고된다. 이는 절대규칙
-- "계보 보존"과 "지표 분리" 위반이며, 값이 존재하기 전에 계약을 고정한다.
--
-- basis 는 값이 어디서 왔는지이고, status 는 그것을 어떻게 읽어야 하는지다.
-- 둘을 분리해야 "관측된 외부값"과 "우리가 계산한 값"이 같은 단어를 쓰지 않는다.

ALTER TABLE conjunction_snapshot
  ADD COLUMN IF NOT EXISTS max_pc_basis text,
  ADD COLUMN IF NOT EXISTS max_pc_status text,
  -- max_pc 를 실어온 원본 아티팩트. 스냅샷 자체의 raw_artifact_id 와 다를 수 있다:
  -- 궤도해는 CelesTrak GP 에서, MAX_PROB 는 SOCRATES 에서 올 수 있기 때문이다.
  ADD COLUMN IF NOT EXISTS max_pc_artifact_id uuid REFERENCES raw_artifact(id);

-- 값의 출처 구분. 이 세 가지 외의 경로가 생기면 조용히 통과시키지 말고 실패해야 한다.
--   COMPUTED_INTERNAL — 우리 엔진이 실제 공분산으로 도출
--   OBSERVED_EXTERNAL — 제3자가 공표한 값을 출처와 함께 수집 (우리는 계산하지 않음)
--   ASSUMED_FAMILY    — 선언된 불확실성 계열 가정 하의 상한 (사건이 아니라 가정의 성질)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'conjunction_snapshot_max_pc_basis_check'
  ) THEN
    ALTER TABLE conjunction_snapshot
      ADD CONSTRAINT conjunction_snapshot_max_pc_basis_check
      CHECK (
        max_pc_basis IS NULL
        OR max_pc_basis IN ('COMPUTED_INTERNAL', 'OBSERVED_EXTERNAL', 'ASSUMED_FAMILY')
      );
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'conjunction_snapshot_max_pc_status_check'
  ) THEN
    ALTER TABLE conjunction_snapshot
      ADD CONSTRAINT conjunction_snapshot_max_pc_status_check
      CHECK (
        max_pc_status IS NULL
        OR max_pc_status IN (
          'COMPUTED', 'OBSERVED', 'ASSUMED', 'NOT_COMPUTED', 'BASIS_UNRECORDED'
        )
      );
  END IF;
END $$;

-- 값이 있으면 근거가 있어야 한다. 근거 없는 값은 데이터 결함이며,
-- 유리한 쪽으로 추측되는 대신 여기서 거부되어야 한다.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'conjunction_snapshot_max_pc_needs_basis'
  ) THEN
    ALTER TABLE conjunction_snapshot
      ADD CONSTRAINT conjunction_snapshot_max_pc_needs_basis
      CHECK (max_pc IS NULL OR max_pc_basis IS NOT NULL);
  END IF;
END $$;

-- 외부에서 관측한 값은 출처 아티팩트 없이는 방어할 수 없다.
-- (우리 계산과 가정 상한은 아티팩트가 없어도 된다 — 입력 계보는 스냅샷이 이미 들고 있다.)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'conjunction_snapshot_external_max_pc_needs_artifact'
  ) THEN
    ALTER TABLE conjunction_snapshot
      ADD CONSTRAINT conjunction_snapshot_external_max_pc_needs_artifact
      CHECK (max_pc_basis IS DISTINCT FROM 'OBSERVED_EXTERNAL' OR max_pc_artifact_id IS NOT NULL);
  END IF;
END $$;

-- 기존 행은 백필하지 않는다.
--
-- 처음에는 max_pc_status='NOT_COMPUTED' 로 채우려 했으나 append-only 트리거가
-- 거부했다("conjunction_snapshot is append-only; refreshes must INSERT a new
-- snapshot"). 트리거가 옳다. 과학 기록은 사후에 고쳐 쓰는 것이 아니며, 편의를
-- 위해 트리거를 잠시 끄는 것은 이 프로젝트가 막으려는 바로 그 행위다.
--
-- 백필은 불필요하기도 하다: 기존 행은 max_pc 가 전부 NULL 이므로(이 마이그레이션
-- 시점 실측 0건) 소급 판정할 값 자체가 없고, _max_pc_channel 이 값 없는 행의
-- NULL 상태를 NOT_COMPUTED 로 읽는다. 새 행은 INSERT 가 명시적으로 채운다.

COMMENT ON COLUMN conjunction_snapshot.max_pc_basis IS
  'MAX_PC 값의 출처 구분. NULL 이면 값도 NULL 이어야 한다(needs_basis 제약).';
COMMENT ON COLUMN conjunction_snapshot.max_pc_status IS
  'MAX_PC 표시 상태. COMPUTED 는 basis=COMPUTED_INTERNAL 일 때만 허용된다(코드 계약).';
COMMENT ON COLUMN conjunction_snapshot.max_pc_artifact_id IS
  'MAX_PC 를 실어온 원본 아티팩트. OBSERVED_EXTERNAL 이면 필수.';
