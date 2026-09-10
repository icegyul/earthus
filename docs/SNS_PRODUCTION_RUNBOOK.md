# SNS PRODUCTION RUNBOOK (2026-09-10, HEAD 99df89d1 이후)

> 이 문서는 절차서다. 토큰 값을 적는 곳이 아니다.
> 실제 `accessToken`·`refreshToken`·`clientSecret`·`SOCIAL_VAULT_KEY` 값을
> 여기에 쓰지 않는다. 쓴 즉시 사고다.

## 1. credential architecture (실측)

- 자격증명은 한 곳에만 산다: Supabase Storage 비공개 버킷
  `earthus-social-private` 아래 `credentials/<provider>.vault`
  (AES-GCM, `SOCIAL_VAULT_KEY` 32B).
- 읽는 주체는 Edge Function `social-admin` 하나다.
  Python/Lambda/브라우저는 토큰 원문을 보지 않는다. 이 설계를 깨지 않는다.
  `SOCIAL_VAULT_KEY` 를 Python runtime 으로 복사하지 않는다.
- 상태는 `credential-status/<provider>.json` 에 있다:
  `fields[]`·`updatedAt`·`verifiedAt`·`account`.
  `verifiedAt` 이 없으면 publish 가 409 `ACCOUNT_NOT_VERIFIED` 로 막힌다.

## 2. provider 연결 방법 (운영자 수동, 1 provider 씩)

1. `prototype/social-settings.html` 을 연다 (관리자 로그인).
2. 해당 provider 의 OAuth 토큰을 `save_credentials` 로 저장한다.
   서버가 `ALLOWED_FIELDS` 밖은 버리고 `REQUIRED` 를 검사한다.
   REQUIRED: x `accessToken` / threads·instagram `accessToken+userId` /
   facebook `pageAccessToken+pageId` / tiktok 4종 / linkedin
   `accessToken+authorUrn` / youtube 4종.
3. `test_credentials` 를 눌러 실제 계정 확인을 한다.
   성공하면 `verifiedAt` + `account` 가 찍힌다. 실패하면 거기서 멈춘다.
4. `status` 로 `verifiedAt` 존재를 확인한다.
5. Python 쪽에는 토큰을 주지 않는다. 넘기는 것은 증거뿐이다:
   `{"source": "live", "authenticated": true, "publish": bool,
   "analytics": bool, "at": iso, "by": 운영자ID}`.
   출처가 `live` 가 아니면 live 상태로 올리지 않는다
   (`provider_health.inspect` 가 강제한다).

## 3. OAuth 흐름

- 최초 토큰 발급은 각 플랫폼 개발자 콘솔 OAuth 로 운영자가 직접 받는다.
- 갱신은 social-admin 이 한다 (TikTok·YouTube·X refresh, Meta
  `appsecret_proof`). 갱신 후에도 기존 `verifiedAt`·`account` 는 유지된다
  (`saveRefreshedCredentials`).
- 연결 해제는 `clear_credentials` (vault + status 함께 삭제).

## 4. single publish 검증 (1 provider → 전부 확인 후 다음)

1. 하네스: `verify_live.verify(provider, context, content(TEST 표시),
   versions, adapters, confirm_live=True)`.
   TEST 표시(`[TEST] `) 없는 콘텐츠는 D 단계에서 거부된다. 일괄 금지.
2. PHASE A–C 가 PASS 여야 D 로 간다. 아니면 NOT_EXECUTED 로 멈춘다.
3. D 성공 → E 에서 `postId` 실재 + mock 아님을 확인한다.
4. F 는 `via="live"` + health `analytics_ready` 일 때만 `provenance=live`.
5. G 에서 archive 에 provider·postId·publishedAt·status·provenance 확인,
   비밀 키 없음 확인.
6. H 에서 동일 release 재실행 → 발행 0건 (`DUPLICATE PUBLISH = 0`).
7. 다음 provider 로. 한 provider 실패가 다른 provider 를 막지 않는다
   (`check_all`·executor 배치 격리).

## 5. analytics 검증

- 실제 응답의 지표만 담는다. 플랫폼 목록(`adapter.metrics`) 밖은 버린다.
- 없는 지표는 `NOT_AVAILABLE` (0 채움 금지).
- `provenance`: live(실제 응답+증거) / stub(시험) /
  unavailable(미연결) / error(실패) / unverified(증거 없음).
- 읽기 실패는 publish 실패가 아니다.

## 6. scheduler·executor 검증

- `scheduled_release.release_due`: APPROVED 중 예약 경과만. DRAFT 는 거부.
- `executor.run_once`: queue→claim→publish→archive. 멱등키
  `REL:cid:plat:at` + `is_queued` + 종결가드(PUBLISHED/FAILED/CANCELLED).
- 재시도는 `BACKOFF_MINUTES (1,5,20,60)` 그대로. 무한 retry 없음.
- LIVE 는 `confirmed` 없으면 손도 안 댄다.

## 7. idempotency 검증

- 동일 release 재실행 → `ALREADY_PROCESSED`, 발행 0.
- social-admin 측도 `publish-locks/<lockId>` + idempotencyKey 로 2중 차단.
- 발행 로그는 `publish-log/<id>.json`.

## 8. failure recovery

- TEMPORARY(429·timeout·5xx·망): QUEUED 유지, backoff 후 자동 재시도.
- PERMANENT(인증·권한·형식): FAILED 종결. 손으로 고치고 `retry_now` 로만.
- AUTH_FAILED: 토큰 갱신 확인 → `test_credentials` 다시 → `verifiedAt` 갱신.
- RATE_LIMITED: `retryAfterAt`·`resetAt` 대기. 상한 수치 지어내기 금지.

## 9. secret handling

- 토큰·비밀은 UI·로그·응답·아카이브·하네스 결과에 없다
  (`scrub`·`safe_error` 시험).
- `credential-status` 에는 값 없이 필드명·시각만 있다.

## 10. NOT_CONFIGURED 의미

- 코드 실패가 아니다. "이 맥락에 자격증명이 없다"는 사실이다.
- `get_rate_limit() → None` (미강제), `fetch_analytics` 빈그릇,
  health NOT_CONFIGURED, 하네스 D–H NOT_EXECUTED 가 정상 동작이다.

## 11. production checklist

- [ ] provider 1종 `verifiedAt` 확인
- [ ] TEST 표시 콘텐츠로 하네스 A–H PASS
- [ ] 실제 postId 확인 (mock 아님)
- [ ] archive 계약 필드 + 비밀 0
- [ ] analytics provenance=live (응답 있을 때)
- [ ] 재실행 duplicate 0
- [ ] approval bypass 0
- [ ] 브라우저 4종 PASS·secret 0
- [ ] 다음 provider 로 (1씩)
- [ ] rate limit: 공식 수치 있을 때만 설정, 없으면 미강제 유지
