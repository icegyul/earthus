# SNS FACTORY — GitHub 벤치마크 (실코드 감사, 2026-09-10)

- 분석용 clone 위치: `D:\SNS_FACTORY_REFERENCE\` (EARTHUS repo 외부. EARTHUS 내부에 넣지 않음)
- 방법: Glob/Grep/Read 실측. README만 보고 판단하지 않음. 각 핵심 후보 6개 이상 실파일 확인.
- 코드 수정 없음. clone 외 EARTHUS 변경 없음.

## 0. 후보 확정 상태

| 후보 | 저장소 | HEAD(실측) | 상태 |
|---|---|---|---|
| BrightBean | `brightbeanxyz/brightbean-studio` | `d85fce1` 2026-08-13 | CLONED·AUDITED |
| Mixpost | `inovector/mixpost` | `df57648` 2026-03-16 | CLONED·AUDITED |
| Postiz | `gitroomhq/postiz-app` | `36d5fc7` 2026-09-03 | CLONED·AUDITED |
| Ddalkkak Threads Factory | — | — | NOT_FOUND (GitHub 검색 3회 무관결과. 추측 clone 금지) |
| TryPost | `trypostit/trypost` | `ed7365a` 2026-09-08 | CLONED·AUDITED |
| Post4U | `ShadowSlayer03/Post4U-Schedule-Social-Media-Posts` | `0998552` 2026-03-28 | CLONED·AUDITED |
| threads.js | `threadsjs/threads.js` | `74b4a51` 2024-06-18 | CLONED·AUDITED |
| threads-cli | `saadiq/threads-cli` | `e74bca3` 2026-08-20 | CLONED·AUDITED |
| sm-scheduler | `HillzKillzIt/social-media-scheduler` | `8d72bb9` 2026-04-16 | CLONED·AUDITED |
| threads-publisher | `thalesholleben/threads-publisher` | `8509f6a` 2026-06-23 | CLONED·AUDITED |
| threads_api(참고샘플) | `fbsamples/threads_api` | `854fc14` 2026-03-24 | CLONED·AUDITED |

## 1. BrightBean — Django 모놀리스, 18/18 FOUND

- 스택: `requirements.txt` Django>=5.1,<5.2 + `django-background-tasks` (Celery 없음, 0 hits) + `django-ninja` + `mcp` + Postgres16 + Redis(선택).
- Provider: `providers/__init__.py` `PROVIDER_REGISTRY` 13종. Threads: `providers/threads.py` `ThreadsProvider` (container→`threads_publish`, `_publish_carousel`, `_wait_for_container` 40회폴, `get_post_metrics`).
- OAuth: `apps/social_accounts/views.py` `connect_platform/oauth_callback` + `get_auth_url/exchange_code`.
- 발행: `apps/publisher/engine.py` `PublishEngine.poll_and_publish` (15초 폴, `Coalesce(scheduled_at)` due, `select_for_update`, `ThreadPoolExecutor` fan-out, `_dispatch_to_provider`).
- 스케줄/큐/워커: `apps/calendar/models.py` `Queue/QueueEntry/RecurrenceRule/PostingSlot` + `generate_recurring_posts` (90일). 워커 `process_tasks` (Procfile·compose).
- 재시도/레이트: `RETRY_BACKOFF=[60,300,1800]` `MAX_RETRIES=3` + `providers/exceptions.py` retryable. `RateLimitState` + `rate_limits()` + `PLATFORM_DAILY_POST_LIMIT`.
- 승인: `apps/approvals/` `ApprovalAction/PostComment/ApprovalReminder` + `PlatformPost.Status` 전이. 팀승인 완비.
- 분석: 스냅샷 UPSERT + 시간감쇠 수집(`post_sync_interval`).
- API: Ninja REST `/api/v1` + MCP (`apps/mcp/transport.py`) + ApiKey/OAuth2.1.
- 라이선스: `LICENSE:1` AGPL-3.0 → RED.

## 2. Mixpost — Laravel 패키지, Threads 없음 확인

- 스택: PHP^8.2, host Laravel 10/11/12용 패키지(`/mixpost` 마운트), Horizon+Redis(호스트), Vue3+Inertia+Tailwind.
- Provider: `src/SocialProviderManager.php` 3종만(twitter/facebook_page/mastodon). `grep Threads` 0 hits. Instagram은 OAuth scope 언급뿐.
- 발행: `src/Actions/PublishPost.php` `Bus::batch→onQueue('publish-post')` + `AccountPublishPost` per-account job.
- 스케줄: `src/Schedule.php` `mixpost:run-scheduled-posts` everyMinute + 지표수집 2~3h.
- 재시도/레이트: `HasSocialProviderJobRateLimit` (`tries=0`, `retryUntil +24h`, `release`, backoff 없음) + per-provider rate-limit concerns.
- Carousel: `grep carousel` 0 hits → NONE. Approval: `grep -i approval` 0 hits → NONE.
- 분석: 3종 Reports + Metric/Audience/FacebookInsight 수집기.
- API: 공개 REST 없음(`routes/api.php` 부재, web.php Inertiaのみ).
- 라이선스: `LICENSE.md:1` MIT → GREEN.

## 3. Postiz — NestJS+Temporal, 36 통합

- 스택: NextJS16 + NestJS11 + Prisma6 + Postgres17 + Temporal1.14 + Redis7. BullMQ 0 hits.
- Provider: `integration.manager.ts` 36종. `threads.provider.ts` (carousel·refreshCron·maxConcurrentJob=2).
- 발행: `postWorkflowV112` (sleep/poke) + per-provider activity queue. `intervalInDays` 반복.
- 재시도/레이트: Temporal retry(3회/2분) + Throttler(Redis) + Bottleneck per-provider.
- 승인: PARTIAL — 마켓(`APPROVED_SUBMIT_FOR_ORDER`)만. 팀 게이트 없음.
- 분석: `analytics.controller` + provider `postAnalytics` + Redis 캐시.
- API: 20+ controllers + public-api + MCP RFC7591. UI: launches/calendar/media/analytics.
- 라이선스: `LICENSE:1` AGPL-3.0 → RED.

## 4. 추가 후보 요약 (실측)

- TryPost(AGPL): Laravel13+Horizon+Passport. `ThreadsPublisher/ThreadsAnalytics`·`PublishPost/PublishToSocialPlatform`·Socialite·`refreshThreadsToken` 실재. 승인 없음.
- Post4U(MIT): FastAPI+APScheduler+MongoDB. `scheduler.py`/`publisher.py` 실재. Threads 없음(`ALLOWED_PLATFORMS` 5종). 분석·승인 없음.
- threads.js(MIT): Threads 전용 Node lib. `PostManager.post`(container→publish), `RESTManager` 토큰. 스케줄·분석 없음.
- threads-cli(라이선스 없음): Bun CLI. `api-publish.ts`(carousel·컨테이너폴)·`auth.ts`(60일·자동갱신)·insights 조회 실재. 데몬 없음.
- sm-scheduler(MIT): Python+APScheduler. 4종 poster·`TokenStore(0600)`·`with_retry` 실재. Threads·승인·분석 없음.
- threads-publisher(MIT): 단일 스크립트. container/publish/list/delete + WP 브리지 실재. 스케줄 없음.
- threads_api(Meta 샘플): Express 데모. publish/insights/OAuth 실재. 제품 아님.

## 5. Ddalkkak 기록

- `Ddalkkak Threads Factory` GitHub 검색 3회(`Ddalkkak Threads Factory` / `brightbean-studio` 대조제외 / `"ddalkkak" OR "dalkkak" threads factory`) 모두 무관결과, `github.com/search?q=ddalkkak` 429 포함 식별불가.
- 판정: NOT_FOUND. clone·점수·매트릭스 열 생성 금지. 동명이인 추측대체 금지.
