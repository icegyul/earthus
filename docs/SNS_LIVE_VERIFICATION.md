# SNS LIVE VERIFICATION (2026-09-10)

> 어휘 정의 (혼용 금지):
> - BRIDGE: 코드 경로 완성, 실제 응답 없음
> - VERIFIED: 실제 provider response 로 확인됨
> - LIVE: credential + request + response + object/status 전부 확인됨
> - NOT_CONFIGURED: credential 없음 (코드 실패 아님)
> - MISSING: 읽기 경로 없음 (정상 결과)

## 상태기계 (실측 매핑)

| 요구 어휘 | EARTHUS 실재 위치 | 비고 |
|---|---|---|
| NOT_CONFIGURED | provider_health ST_NOT_CONFIGURED | credential 없음 |
| CONFIGURED | ST_CONFIGURED | 자격증명 존재 확인됨 |
| READY | ST_PUBLISH/ANALYTICS_READY | live handshake + confirmed |
| REQUESTED | bridge `pending:true` + executor result `pending` | TikTok publish_id, YouTube 미processed |
| PROCESSING | publish_queue PROCESSING | 시도 횟수 센다 |
| PUBLISHED | queue PUBLISHED + archive | 응답 ID 필수 |
| FAILED | queue FAILED (+executor FAILED) | PERMANENT 종결 |
| RATE_LIMITED | rate_limit RETRYABLE 판정 → backoff 재시도 | 수치 미설정 시 미발동 |
| UNAVAILABLE | analytics NOT_AVAILABLE/provenance unavailable | 0 채움 금지 |

## Threads 현재

- Health: READY 구조 PASS / Current NOT_CONFIGURED (credential 없음)
- Publish: BRIDGE (MOCK 계약 PASS) / VERIFIED 아님
- Analytics: BRIDGE (필드 5종 매핑) / VERIFIED 아님 (실제 응답 없음)
- LIVE badge 조건 미충족 → UI 에 LIVE 표시 없음 (감사 완료)

## LIVE 증거 규칙

1. `postId` 실재 + mock 아님 (E)
2. 응답 보관 `response_archive` (비밀 소독)
3. analytics `provenance=live` 는 실제 응답 + `via=live` 증거 때만
4. 재실행 duplicate 0 (H)

## VERIFIED 승격 절차

실제 응답 확보 시: 해당 필드 대조 → 다르면 매핑 수정 →
`BRIDGE → VERIFIED` 로 문서 상태 변경 → 시험에 실형상 추가
(값이 아닌 모양만). 없는 필드는 추가하지 않는다.
