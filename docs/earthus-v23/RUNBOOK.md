# RUNBOOK — EARTHUS v2.3

## 1. 공통 사고 원칙

1. 영향을 받는 source/layer/action을 좁힌다.
2. 사용자에게 마지막 성공 시각과 `STALE/UNKNOWN/POLICY_BLOCKED`를 보인다.
3. 안전을 긍정하거나 값 0을 만들어 서비스가 정상인 척하지 않는다.
4. 자동화는 격리·flag off·증거 수집까지만 한다.
5. 안전·권리·판매·외부 action 변경은 PD가 승인한다.
6. 원인·영향·복구·rollback·재발 fixture를 기록한다.

## 2. Provider 장애

- provider health에서 DNS/TLS/auth/quota/HTTP/parser/cache를 분리한다.
- last-good는 원 시각과 함께 표시하고 freshness 한계를 넘으면 `STALE`다.
- retry는 Retry-After와 exponential backoff를 따른다.
- 다른 모델/기관 값을 같은 source의 성공처럼 대체하지 않는다.
- 안전 provider 장애는 CTA를 완화하지 않는다.

## 3. 잘못된 Safety

- 영향 revision과 region을 즉시 격리한다.
- 공식 원문과 발표/대치/해제 시각을 보존한다.
- Safety CTA를 더 안전한 방향으로 제한하되 근거 없는 새 경보를 만들지 않는다.
- correction notification은 이전 notificationId와 연결한다.
- parser/rule/mapping 중 원인을 분리하고 Golden replay를 추가한다.

## 4. Stale·결측

- `lastSuccessfulAt`, `sourceObservedAt`, `receivedAt`, `staleSince`를 분리한다.
- 결측 reason과 버린 행 수를 표시한다.
- cache miss를 0/맑음/안전/예약 가능으로 바꾸지 않는다.
- offline은 쓰기 action을 차단하고 마지막 시각을 고정한다.

### 4-1. TPW 수증기 통로

- `wind/tpw-ea.json`이 없거나 98% 미만이면 `TPW_READY`를 켜지 않는다.
- `issuedAt/validAt`이 없으면 `receivedAt`으로 메우지 않고 publish하지 않는다.
- PWAT 변수·kg m⁻² 단위가 아니면 격자를 publish하지 않는다. 범위 밖은 건조색이 아니라 null이다.
- 높은 TPW를 강수·호우·안전 판정으로 승격하지 않는다. 강수·불안정·공식 특보는 별도 신호다.
- NOMADS 장애 때 Open-Meteo나 다른 모델로 조용히 바꾸지 않는다. last-good/stale을 표시한다.
- NOAA attribution, 공개 S3 metadata, 운영 화면 검증 전에는 export·SLA를 열지 않는다.

### 4-2. Canonical shadow

- `signal-foundation`은 기존 공개 source를 수정하지 않고 `archive/canonical/v1/`에만 쓴다.
- 이전 shadow의 `NoSuchKey`만 첫 실행으로 허용한다. `AccessDenied`, 리전, 네트워크 오류를
  없는 파일처럼 삼키지 않는다. 정정 계보가 끊기면 해당 adapter 결과는 실패다.
- 한 adapter 실패가 다른 shadow 생성을 막지는 않지만 호출 전체는 `ok=false`이며 실패 이유를 남긴다.
- shadow 실패 때 기존 UI/Safety/Activity reader로 전환하지 않는다. 애초에 기존 reader가 정본이다.
- 공개 원본 hash 변화, `archive/` 익명 접근, `processor.version=dev`, NaN/Infinity가 하나라도 있으면
  schedule을 중지하고 shadow 객체를 authoritative 경로에서 제외한다.

## 5. 예약·결제·알림 action 실패

- idempotency key와 provider receipt를 조회한다.
- 성공 여부가 불명확하면 `PENDING`, 성공으로 낙관하지 않는다.
- 재시도 전 최신 Safety/price/availability와 사용자 confirmation을 다시 확인한다.
- 중복 action이 생기면 보상 절차와 감사 로그를 남긴다.
- 카드/토큰/예약 원문은 로그에 남기지 않는다.

## 6. 권리 만료

- source registry를 `EXPIRED/BLOCKED`로 바꾼다.
- 새 ingest/publish/export/AI를 차단한다.
- 기존 공개 cache는 계약·보존 의무에 따라 숨김/삭제/보존을 구분한다.
- 대체 source는 별도 승인 전 자동 연결하지 않는다.

### 6-1. Governance shadow

- policy, freshness, providerHealth를 하나의 `ok` 값으로 합치지 않는다.
- 번들 registry가 `APPROVED`이거나 approval actor/evidence가 비어 있으면 실행을 중지한다.
  로컬 번들 정본은 반드시 `DRAFT`다.
- sourceId/license/terms/source URL/attribution drift는 최신 registry로 추정 보정하지 않고
  `POLICY_BLOCKED`로 격리한다.
- `AGING`은 갱신 대기 표시, `STALE`은 last-good 시각 고정, `FUTURE/UNKNOWN`은 data display
  차단이다. 어느 상태도 안전·폐쇄 없음·0으로 읽지 않는다.
- 특보 0건은 provider 정상일 수 있지만 Safety `SAFE`의 증거는 아니다.
- `archive/governance/v1/` 실패는 기존 reader를 바꾸지 않는다. 운영 reader는 아직 구 경로다.

## 7. 비용 이상

- NAT bytes, provider calls, storage, egress, LLM을 feature/source/tenant로 나눈다.
- fan-out과 background refresh를 먼저 제한한다.
- 안전 정보 자체를 paywall하거나 숨겨 비용을 줄이지 않는다.
- 예산 상한을 넘는 실험/canary는 중지하고 last-good read path를 유지한다.

## 8. 교차 tenant/보안

- 관련 API/export를 flag off하고 credential을 회전한다.
- raw payload·정밀 위치를 일반 로그로 복제하지 않는다.
- tenant A/B 재현 fixture와 scope/cache key를 대조한다.
- 사용자 영향·삭제·통지 의무는 PD/법무 판단으로 분리한다.

## 9. Rollback

```text
feature flag off → authoritative path를 구 reader/writer로 복원
→ 새 queue/action 중지 → cache namespace 확인
→ 데이터·action 중복 대조 → 사용자 상태 확인
→ 원인 fixture 추가 → 별도 재출시 승인
```

정적 배포 rollback도 이전 S3 객체/version과 Content-Type/Cache-Control을 확인하고
CloudFront 무효화 뒤 운영 URL·hash·console을 다시 검증한다.

## 10. 사고 보고 최소 형식

```text
발생/탐지 시각, 영향 사용자·지역·source·revision,
사용자에게 보인 상태, 자동/수동 조치, 승인자,
last-good, 데이터/action 손실, 비용, rollback 결과,
재발 fixture와 owner/reviewDueAt
```
