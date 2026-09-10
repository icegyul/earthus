# SNS LIVE PROVIDER BRIDGE (2026-09-10)

> 토큰 값을 적는 곳이 아니다. 값 0건 원칙.

## 1. 전체 구조

```text
APPROVAL → SCHEDULE → QUEUE → EXECUTOR (Python, 토큰 없음)
  → bridge transport (봉투만: action/provider/text/mediaId/idempotencyKey/confirmed)
  → social-admin Edge Function (vault 복호·provider 호출)
  → REAL PROVIDER API → publication ID → archive
  → provider_analytics → provenance=live → canonical metrics → amend
```

## 2. token boundary

- 토큰은 social-admin 안에서만: `loadCredentials → decrypt → fetch`.
- Python 봉투 금지키 11종
  (`accessToken`·`refreshToken`·`clientSecret`·`appSecret`·
  `pageAccessToken`·`vaultKey`·`SOCIAL_VAULT_KEY`·`authorization`·
  `password`·`token`·`client_secret`). 들어오면 봉투 미생성.
- Edge 인증용 admin JWT 는 운영자가 호출 때만 넘기고 저장하지 않는다.

## 3. social-admin 역할

- 기존: `status`·`save_credentials`·`clear_credentials`·
  `test_credentials`·`prepare/finalize_upload`·`list/delete_media`·`publish`
  (confirmed+멱등+lock+verifiedAt 게이트 유지).
- 신규: `provider_analytics` (FIRST PROVIDER threads 전용).
  `/{postId}/insights?metric=views,likes,replies,reposts,quotes` 호출 후
  있는 키만 매핑 (likes→likes, replies→comments,
  reposts+quotes→shares 합, views→views).
  다른 provider 는 `ANALYTICS_NOT_SUPPORTED` 로 막는다 (속이지 않음).

## 4. provider publish action

- 기존 `publish` 그대로 사용 (신규 액션 없음).
- 조건: `confirmed=true` + idempotencyKey + vault 존재 + `verifiedAt`.
- 응답 `{ok, postId, url, publishedAt, publishedBy, textDigest}` →
  `bridge_client.parse_publish_response` → executor → archive.
- postId 없으면 `NO_PUBLICATION_ID`, PUBLISHED 기록 금지.

## 5. provider analytics action

- 요청 `{action: provider_analytics, provider, postId}`.
- 응답 `{ok, provider, postId, metrics, reference, fetchedAt}`.
- Python `make_analytics_fetcher` → 어댑터 `fetch_analytics` 대체용으로
  주입 → `analytics_fetch.fetch(via)` → provenance 판정.
- `views` 는 브릿지 응답에 유지, 어댑터 어휘 편입은 live 확인 후
  (현 단계 미변경 — §8).

## 6. health check

- `provider_health.inspect` 그대로. live 증거(handshake source live +
  confirmed) 있을 때만 PUBLISH/ANALYTICS_READY.
- 증거 없으면 NOT_CONFIGURED. stub 은 STUB 표기.

## 7. OAuth connection

- 수동 붙여넣기 유지 (서버 콜백 미구현 — 무리하게 추가 안 함).
- 연결 방법 1가지: social-settings → save → test → verifiedAt.
- FIRST PROVIDER Threads: TEXT 발행이라 미디어 절차 불필요.

## 8. failure handling

- publish 실패 → FAILED (아카이브 없음). TEMPORARY 는 BACKOFF 재시도.
- auth 실패 → AUTH_FAILED. 미연결 → NOT_CONFIGURED.
- analytics 미지원 provider → ANALYTICS_NOT_SUPPORTED → FETCH_FAILED.
- rate limit → 대기, 중복발행 0.

## 9. live verification

- `verify_live.verify` PHASE A–H. `confirm_live=True` + TEST 표시 +
  단일 provider + live 증거가 다 있어야 D 진행.
- 아니면 NOT_EXECUTED (정상).

## 10. provider 추가 방법

1. social-admin 에 해당 provider 분기 추가 (testCredentials처럼).
2. `provider_analytics` 의 provider 가드 확장 + 지표 매핑 추가.
3. `bridge_client` 파서는 그대로 (정식 키만 통과).
4. 어댑터 `metrics` 변경은 live 확인 후.
5. `verify_live` 로 1종 검증 후 다음.

## 11. security rules

- 봉투·응답·예외·아카이브에 비밀 0 (22 tests 중 4).
- `confirmed` 없이 publish 봉투 미생성.
- idempotencyKey 없이 publish 봉투 미생성.
- mock 을 live 로 적지 않는다.

## 부록. 공식 API 리뷰 (2026-09-10)

- developers.facebook.com 직접 조회: 차단(400) → PARTIAL.
- 대체 근거: Meta 공식 샘플 `fbsamples/threads_api`
  (`me/threads_publish?creation_id=` → `{id}`,
  `me/threads_insights`, `me/threads_publishing_limit`,
  scopes threads_basic/content_publish/manage_insights/…),
  in-repo `publishThreads` 구현, social-settings 공식문서 링크 7종.
- per-media insights 형태는 live 확인 전이므로 매핑은
  "있는 키만" 방어형. 확정은 첫 live 응답 후.

## FIRST PROVIDER: threads

WHY: TEXT 전용 발행(미디어 불필요) · 어댑터 계약 최명확 ·
토큰 구조·갱신·검증 전부 in-repo 실재 · 공식 샘플 커버 ·
insights 패턴 확인. 나머지 6종은 동일 구조로 확장.
