# SNS PROVIDER CONNECTION RUNBOOK (2026-09-10)

> 연결 절차서. 토큰 값을 적는 곳이 아니다.
> `accessToken`·`refreshToken`·`clientSecret`·`SOCIAL_VAULT_KEY` 값을
> 여기에 쓰지 않는다.

## 1. 사전 준비

- Supabase 프로젝트 + `social-admin` 배포 (`supabase/config.toml` 존재 확인).
- 서버 secrets: `SOCIAL_VAULT_KEY`(32B base64) · `SOCIAL_ADMIN_UIDS` ·
  `APP_ORIGIN`. 로컬 env에는 두지 않는다 (2026-09-10 실측 전부 MISSING).
- 관리자 Google 계정 (ADMIN_UIDS 또는 contentsdalur 운영 계정).
- 연결은 1 provider 씩. 7개 동시 금지.

## 2. provider별 OAuth 준비사항 (social-settings.html 가이드 7종 실재)

| provider | 준비물 | 비고 |
|---|---|---|
| X | Project+App, OAuth 2.0, 콜백 등록, scope tweet.read/write users.read media.write offline.access | 등급별 게시량·비용 주의 |
| Threads | Meta 앱 Threads 사용사례, 테스트/운영 사용자 등록, scope threads_basic+threads_content_publish | 심사용 Meta 승인 필요 가능 |
| Instagram | Business/Creator 전환, Meta 앱 Instagram 제품, Professional Account ID | 일반 개인계정 게시 불가 |
| Facebook | Facebook Login for Business, Page 게시 권한, scope pages_show_list/read_engagement/manage_posts | Page 에만 게시 |
| TikTok | Login Kit, Content Posting API Direct Post, scope user.info.basic+video.publish | 심사 클라이언트 올림 제한 |
| LinkedIn | 앱 + 회원/조직 권한, scope openid profile + w_member/organization_social, authorUrn | 조직 게시는 관리자 권한 필요 |
| YouTube | Cloud 프로젝트 + Data API v3, Web Client + 콜백, scope youtube.upload offline | 미심사 프로젝트 업로드 제한 가능 |

공통: authorization URL 생성·callback 교환은 서버가 안 한다.
운영자가 플랫폼에서 코드→토큰을 받아 붙여넣는다 (수동).
서버 콜백 자동교환: NOT_IMPLEMENTED. state 검증: NOT_IMPLEMENTED.

## 3. OAuth 연결 절차 (1 provider)

1. 위 표대로 플랫폼에서 토큰 발급 (브라우저, 운영자 손).
2. `social-settings.html` → 해당 카드에 붙여넣기
   (`type=password`, `autocomplete=new-password`).
3. `save_credentials` → 서버가 `ALLOWED_FIELDS` 밖 버림 +
   `REQUIRED` 검사 → `credentials/<p>.vault` 암호 저장 +
   `credential-status/<p>.json` (fields·updatedAt, verifiedAt 없음).
4. `test_credentials` → 실제 계정 확인 API 호출 →
   성공 시 `verifiedAt` + `account` 기록. 실패하면 거기서 멈춤.
5. `status` 에서 `verifiedAt` 존재 확인.

## 4. Social Vault 저장 과정

- `saveCredentials`: AES-GCM 암호화 → Storage 업로드(upsert) →
  status 기록. 값은 응답·로그에 안 남긴다.
- `saveRefreshedCredentials`: 갱신 후에도 기존 `verifiedAt`·`account` 유지.
- `clear_credentials`: vault + status 함께 삭제.
- Python/Lambda 는 vault 를 읽지 않는다. 읽는 주체는 social-admin 하나다.

## 5. 연결 상태 확인법

- `status` 액션: 7종 `credential-status` 목록 (값 없이 필드명·시각만).
- `verifiedAt` 없음 → publish 409 `ACCOUNT_NOT_VERIFIED`.
- Python 쪽: 운영자가 `verifiedAt`·`account` 확인 후 handshake 증거를
  직접 넘긴다 (`source: live` + publish/analytics + at + by).
  `provider_health.inspect` 가 증거 없이 live 로 올리지 않는다.

## 6. single publish 테스트

1. `[TEST] ` 표시 콘텐츠 1건, provider 1종.
2. `verify_live.verify(..., confirm_live=True)` PHASE A–H.
3. E 에서 postId 실재 + mock 아님 확인. F 는 `via=live`+`analytics_ready`.
4. G archive 계약 필드 + 비밀 0. H 재실행 발행 0.
5. 다음 provider 로.

## 7. analytics 테스트

- social-admin 에 읽기 action 없음 (실측). 읽기는 Python
  `analytics_fetch` + 어댑터 `metrics` 목록으로 한다.
- 실제 응답만. 없는 지표 NOT_AVAILABLE, 0 채움 금지.
- provenance: live(증거) / stub / unavailable / error / unverified.

## 8. 실패 처리

- NOT_CONFIGURED: 연결 전 정상 상태. 코드 실패 아님.
- AUTH_FAILED: 토큰 갱신 확인 → 재발급·붙여넣기 → `test_credentials`.
- TikTok/YouTube/X: 자동 refresh. Meta 3종: 수동 재발급 (장기 토큰 만료 시).
- PERMANENT 발행실패: FAILED 종결, 수동 `retry_now` 로만.
- TEMPORARY: BACKOFF (1,5,20,60) 자동 재시도.

## 9. token refresh

| provider | 방식 | 실측 위치 |
|---|---|---|
| TikTok | refresh_token 자동 | `refreshTikTokToken` |
| YouTube | refresh_token 자동 | `refreshYouTubeToken` |
| X | refresh_token 자동 (+ rotation 저장) | `refreshXToken` |
| Threads/Instagram/Facebook | 자동 없음, 수동 재발급 | 해당 함수 없음 (실측) |

## 10. credential 교체

1. 새 토큰 발급 → `save_credentials` (upsert).
2. `test_credentials` → 새 `verifiedAt`.
3. 문제 시 `clear_credentials` 후 처음부터.

## 11. revoke 절차

- 플랫폼 측에서 앱 권한 해제 → `clear_credentials` →
  해당 provider health NOT_CONFIGURED 확인.

## 12. 운영 전 보안 점검

- [ ] 토큰 값 문서·로그·응답 0 (`scrub`·`safe_error` 시험 통과)
- [ ] vault 버킷 비공개 유지
- [ ] `SOCIAL_VAULT_KEY` 서버 secrets 에만
- [ ] 승인 없는 publish 경로 0 (confirmed+멱등+lock 실측)
- [ ] approval bypass 0, duplicate publish 0
- [ ] rate limit: 공식 수치 있을 때만, 없으면 미강제

## 13. Production 체크리스트 (provider 1종당)

- [ ] OAuth 토큰 저장 (`REQUIRED` 통과)
- [ ] `test_credentials` → `verifiedAt`
- [ ] 하네스 A–H (TEST 표시)
- [ ] 실제 postId (mock 아님)
- [ ] archive + 비밀 0
- [ ] analytics provenance=live (응답 있을 때)
- [ ] 재실행 duplicate 0
- [ ] 다음 provider (1씩)

## 부록. live 검증 명령 (credential 있을 때만)

```python
import verify_live as vl
r = vl.verify("threads",
              context={"credentials": {"__": "__"},  # 값 대신 증거 구조
                       "confirmed": True,
                       "handshake": {"source": "live", "authenticated": True,
                                     "publish": True, "analytics": True,
                                     "at": "<iso>", "by": "<operator>"}},
              content=<TEST 표시 APPROVED 콘텐츠>,
              versions={<(cid, "threads")>: <플랫폼 판>},
              adapters={"threads": <어댑터>},
              confirm_live=True)
# verdict == "LIVE_VERIFIED" 일 때만 live. 아니면 BLOCKED 사유를 본다.
```

- `confirm_live=True` 없이 D 이후는 NOT_EXECUTED.
- mock 결과는 verdict `MOCK_ONLY` 이하. live 로 적지 않는다.
