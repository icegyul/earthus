# Ocean Surf Foundation — O2 shadow

## 상태

`LOCAL_SHADOW_COMPLETE / PUBLIC_GATES_CLOSED`. 72시간 정규화·정책 점수·안전 우선 차단
계약은 fixture로 완료했다. 운영 점수 정책, 미래 시점별 공식 안전 evidence, provider 권리,
알림 발송 승인이 없으므로 공개 Surf UI에는 연결하지 않았다.

## 구현

- `normalizeOpenMeteoMarineHourlyPoint`
  - 시간별 파고·파향·주기·너울·수온·해류를 동일 `validFrom`으로 묶는다.
  - offset 없는 시각은 응답 timezone offset으로만 UTC화한다.
  - 최대 72시간 forecast는 `FUTURE`이지만 승인 horizon 안에서만 usable이다.
- `surf-scoring-policy.v1.json`
  - production 상태 `DRAFT`, skills와 임계값 0개. 따라서 운영 score는 항상 null이다.
- `scoreSurfFrame`
  - skill별 axis·band·weight를 승인 정책에서만 읽는다.
  - 해변 방향과 너울 방향의 각도차는 기하 계산만 하며 임계값은 정책에서 받는다.
  - explanation, confidence와 canonical input key를 남긴다.
- `buildSurfDecision`, `buildSurfTimeline`
  - 안전 gate가 `BLOCKED/UNKNOWN`이면 점수는 null이다.
  - provider display 권리가 없으면 계산된 fixture 점수도 `displayScore=null`이다.
  - positive recommendation, safe claim, 출발 CTA, alert send는 모두 false다.

## 검증

- 72개 hourly frame × 9개 metric 정규화.
- 72개 frame 모두 source/valid time을 보존.
- fixture-only 승인 정책에서 동일 입력 score 90과 3개 explanation 확인.
- production DRAFT 정책에서 score null 확인.
- 낙뢰 활성 시 score null·BLOCKED 확인.
- candidate score null이 JavaScript 숫자 0으로 승격되던 공통 gate 오류를 수정하고 회귀 추가.

## 닫힌 gate

1. skill별 임계값의 근거·승인·버전·rollback.
2. 72시간 각 frame과 같은 유효시각의 낙뢰·태풍·통제·극단 파고 evidence.
3. Open-Meteo 상업 이용·attribution과 production freshness.
4. 알림 dedup·quiet hours·명시적 발송 승인.
5. 기존 공개 Surf 화면을 새 reader로 전환한 실기기·접근성 회귀.
