# SNS PROVIDER MATRIX (2026-09-10)

> 실측 기준. credential 없으면 Current=NOT_CONFIGURED (코드 실패 아님).
> 토큰 값 0건 원칙.

| provider | OAuth | credential source | publish | publish identity | analytics | permissions | provenance | current | known limitations |
|---|---|---|---|---|---|---|---|---|---|
| threads | MANUAL | social-admin vault | container→threads_publish | media id | insights (views/likes/replies/reposts/quotes) | threads_basic/content_publish/manage_insights | unavailable (구조 live/stub/error) | NOT_CONFIGURED | per-media insights 첫 live 후 확정 |
| instagram | MANUAL (Professional 필수) | vault | container→media_publish | media id | insights (UNVERIFIED shape, 있는 키만) | 게시 권한 + Professional ID | unavailable | NOT_CONFIGURED | 미디어 필수라 executor 단독 TEXT 불가. endpoint shape UNVERIFIED |
| facebook | MANUAL (Page 전용) | vault | feed/photos/video_reels | post id | insights (UNVERIFIED shape, 있는 키만) | pages_*_posts | unavailable | NOT_CONFIGURED | Page/개인 혼동 금지. endpoint shape UNVERIFIED |
| linkedin | MANUAL (authorUrn) | vault | rest/posts (x-restli-id) | post URN | MISSING (읽기 경로 없음) | w_member/organization_social | unavailable | NOT_CONFIGURED | 조직/개인 권한 다름 |
| tiktok | MANUAL (Direct Post) | vault | video/init→PUT (publish_id) | publish_id = REQUESTED (최종 아님) | MISSING (scope 밖) | video.publish + privacy | unavailable | NOT_CONFIGURED | 비동기. 접수≠게시. privacy 필수 |
| youtube | MANUAL (offline) | vault | resumable upload | video id (처리 중 가능) | MISSING (readonly scope gap) | youtube.upload | unavailable | NOT_CONFIGURED | 비동기 처리. title/privacy 필수. 심사前 제한 가능 |
| x | MANUAL (PKCE) | vault | tweets + media/upload | tweet id | MISSING (tier-dependent) | tier별 상이 | unavailable | NOT_CONFIGURED | 등급별 게시량·비용 |

## identity 관계

- publish 와 analytics 는 `postId` 로 잇는다 (아카이브 `postId` 필드).
- TikTok `publish_id`, YouTube 처리 중 id, LinkedIn URN 은
  "provider accepted" 식별자다. 최종 게시 보장은 provider 측 상태다.
- token 을 identifier 로 쓰지 않는다.

## canonical metrics

`impressions / reach / likes / comments / shares / views / clicks`.
어댑터 어휘 밖 키는 브릿지 응답에만 유지, 아카이브 적재는
어댑터 `metrics` 목록内 (live 확인 후 어휘 확장).

## rate limit

전 provider `configured=false, enforced=false` (공식 수치 미확인).
임의 숫자 0건.

## live verification (2026-09-10 PHASE 01)

- 전 provider Current=NOT_CONFIGURED (credential 없음 — 코드 실패 아님).
- BRIDGE: threads/instagram/facebook (publish+analytics 경로).
- MISSING analytics: linkedin/tiktok/youtube/x (honest).
- REQUESTED 분리: TikTok publish_id, YouTube 미processed (`pending`).
- UI LIVE badge 없음 감사 완료 (주석 1줄 외 `LIVE` 표현 없음).
- 상세: `docs/SNS_LIVE_VERIFICATION.md` · `docs/SNS_ANALYTICS_STATUS.md`.
