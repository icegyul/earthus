SET search_path TO public;

-- CelesTrak SOCRATES 를 출처 레지스트리에 등록한다.
--
-- raw_artifact.source_id 는 data_source 로의 FK 다. 미등록 출처의 원본을 저장할
-- 수 없게 한 이 제약은 설계 의도대로 작동했다 — SOCRATES 첫 수집 시도가 여기서
-- 거부되었고, 우회 대신 등록이 올바른 응답이다. (E27 교정과 같은 원칙: 등급과
-- 신뢰는 사전 구성된 레지스트리에서만 나온다.)
--
-- max_poll_seconds = 36000 (10시간): SOCRATES 는 10~11시간 주기로 갱신되며,
-- CelesTrak 이용정책은 갱신당 1회 다운로드를 요구한다. 이 값은 그 정책의
-- 기계적 표현이다. 정책의 나머지(비200 즉시 중단, 사람에게 통지)는
-- backend/providers_live/socrates.py 가 강제한다.

INSERT INTO data_source (
  id, name, base_url, license, auth_type, max_poll_seconds, enabled
)
VALUES (
  'celestrak_socrates',
  'CelesTrak SOCRATES',
  'https://celestrak.org/SOCRATES/',
  'CelesTrak usage policy (not an open-data licence): attribute CelesTrak; '
  'download once per feed update; stop immediately on any non-200 and alert '
  'a human. Values are Alfano maximum-probability screening bounds, never '
  'operational collision probabilities.',
  'none',
  36000,
  true
)
ON CONFLICT (id) DO NOTHING;
