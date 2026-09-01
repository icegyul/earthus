SET search_path TO public;

-- 객체 메타데이터(분류·국제식별자·명칭)의 출처 추적.
--
-- 배경: CelesTrak GP는 OBJECT_TYPE을 선언하지 않고 Space-Track GP는 선언한다.
-- 두 소스는 같은 등급(PUBLIC_GP)이므로 "등급이 높은 쪽이 덮어쓴다"는 규칙은
-- 성립하지 않는다. 대신 결측을 채우되(ADOPTED) 값이 서로 다르면 덮어쓰지 않고
-- 충돌로 기록한다(CONFLICT) — identity_conflict 와 같은 철학이다.
--
-- 특허 관점: 파편 분류가 이름 패턴 추론('...DEB')이 아니라 출처가 명시된 사실이
-- 되어야 계보/기원 주장(E25)과 개입 효과 산출이 증거로 뒷받침된다. 이 표는
-- "왜 이 객체가 DEBRIS인가"에 대해 원문 아티팩트까지 답할 수 있게 한다.

CREATE TABLE IF NOT EXISTS object_metadata_revision (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  object_id uuid NOT NULL REFERENCES space_object(id) ON DELETE RESTRICT,
  field_name text NOT NULL CHECK (
    field_name IN ('object_type', 'cospar_id', 'canonical_name')
  ),
  previous_value text,
  incoming_value text,
  outcome text NOT NULL CHECK (outcome IN ('ADOPTED', 'CONFLICT', 'CONFIRMED')),
  reason text NOT NULL,
  source_id text NOT NULL REFERENCES data_source(id),
  raw_artifact_id uuid NOT NULL REFERENCES raw_artifact(id) ON DELETE RESTRICT,
  ingestion_run_id uuid REFERENCES ingestion_run(id) ON DELETE SET NULL,
  observed_at timestamptz NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS object_metadata_revision_object_idx
  ON object_metadata_revision (object_id, field_name, created_at DESC);

CREATE INDEX IF NOT EXISTS object_metadata_revision_conflict_idx
  ON object_metadata_revision (outcome, created_at DESC)
  WHERE outcome = 'CONFLICT';

-- 과학 기록과 동일하게 추가 전용: 한 번 쓴 계보는 고쳐 쓰지 않는다.
CREATE OR REPLACE FUNCTION object_metadata_revision_append_only()
RETURNS trigger AS $$
BEGIN
  RAISE EXCEPTION 'object_metadata_revision is append-only (attempted %)', TG_OP;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS object_metadata_revision_no_mutation ON object_metadata_revision;
CREATE TRIGGER object_metadata_revision_no_mutation
  BEFORE UPDATE OR DELETE ON object_metadata_revision
  FOR EACH ROW EXECUTE FUNCTION object_metadata_revision_append_only();

COMMENT ON TABLE object_metadata_revision IS
  '객체 메타데이터의 출처 계보. ADOPTED=결측을 출처로 채움, CONFLICT=값 불일치(덮어쓰지 않음), CONFIRMED=기존 값과 일치 재확인.';
