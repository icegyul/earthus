# ADR-0005 — 전환은 fixture→shadow→canary→rollback rehearsal 순서

- 상태: 승인 제안
- 결정일: 2026-08-12

## 결정

새 signal/decision/reservation 경로를 한 번에 100% 전환하지 않는다. dev/staging/prod를
분리하고 old/new 결과를 shadow로 비교한 뒤 단계적 canary와 rollback rehearsal을 거친다.

## 이유

Safety·결측·권리·행동은 일반 UI 회귀보다 피해가 크다. 직접 S3/Lambda 배포 구조에서는
문서상의 rollback이 아니라 실제 구 reader/writer/cache 호환 증거가 필요하다.

## 결과

- 설명되지 않은 Safety/UNKNOWN 차이는 canary를 중지한다.
- action 중복 0과 데이터 손실 0을 확인한다.
- 구 경로 제거는 rollback window 뒤 별도 PR이다.
