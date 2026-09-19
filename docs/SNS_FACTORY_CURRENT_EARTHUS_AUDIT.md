# SNS FACTORY — 현행 EARTHUS 감사 (실측, 2026-09-10)

- 대상: `D:\## APP\EARTHUS v2_APP` @ `392a86f6` / branch `earthus-v2/real-living-earth-render` / WORKTREE MODIFIED
- 방법: 아래 파일 원문 Read + Grep. README 추측 없음. 코드 수정 없음.
- 원칙(원문 주석): **자동으로 올리지 않는다. 후보까지만 만든다. 올리는 손은 사람이다.**

## 1. 실측 파일 목록

| 영역 | 파일 | 핵심 원문 근거 |
|---|---|---|
| 콘텐츠 생성 | `aws/distribution/generator.py` | `build()` 마스터 1개 → 플랫폼 판 파생. 사실을 만들지 않는다(§1). 검증 실패 시 DRAFT에 머문다 |
| 콘텐츠 계약 | `aws/_shared/content_contract.py` | `CONTENT_TYPES` 10종, `CONTENT_STATUS` 9종 + `STATUS_TRANSITIONS`, `PLATFORMS` 7종, `PLATFORM_LIMITS` |
| 자격/우선순위 | `aws/distribution/eligibility.py` | `SIGNALS` 7종 가중치, `UNKNOWN`은 분모 제외, `HUMAN_ONLY_MARKERS` 사망·실종·대피령 |
| 캡션 | `aws/distribution/caption.py` | `BLOCKS` 9종(HOOK..CTA), `NEVER_TRIM=(CONFIDENCE,SOURCE)`, LLM 통과 금지(claim-문장 어긋남) |
| 해시태그 | `aws/distribution/hashtags.py` | `BASE` 3종 + 통제 목록만. 즉석 태그 금지. 플랫폼별 개수 상한 |
| 비주얼 | `aws/distribution/visual.py` | 템플릿 10종 + `REQUIRED_AREAS` 7종 + `CANVAS` 플랫폼 규격. 그림을 그리지 않고 사양만(한글폰트·Three.js 사유) |
| 사실검증 | `aws/distribution/validation.py` | `numeric_pool` 3출처만 허용, 반올림 허용·자릿수변경 금지, bool→숫자 누수 차단, `PLACEHOLDERS` 거부 |
| 출처 | `aws/_shared/provenance.py` | `DATASET_PROVENANCE` ref→공급자·수집기·라이선스. 사슬 끊기면 명시 |
| 승인/거버넌스 | `aws/_shared/governance.py` | `PUBLISH_STATES` 8종 + `ALLOWED_TRANSITIONS` + `FORBIDDEN_NOTES`. 리포트·SNS 동일 문 |
| 후보생성 | `aws/distribution/handler.py` | `MAX_DAILY=8`, `events/distribution-content.json` 색인. 게시 경로 없음 |
| 레거시 초안 | `aws/social-draft/handler.py` | 태풍 SNS초안, `archive/social-drafts.json`(비공개). `LIMITS` x280/threads500/ig2200/fb2000 |
| 큐/스케줄 | `aws/distribution/publish_queue.py` | `APPROVED/SCHEDULED`만 `enqueue`. `BACKOFF_MINUTES=(1,5,20,60)`. `SCHEDULES` 5종=생성주기(게시시각 아님) |
| 아카이브/성과 | `aws/distribution/archive.py` | `archive_publication` 불변 + 되짚기 사슬. 지표 0채움 금지(`NOT_AVAILABLE`). `MUTABLE_FIELDS` 5종만 수정 |
| 어댑터 | `aws/distribution/sns_adapters/*.py` | 7종 + `PRIMARY` 5종. `MOCK/PREVIEW/LIVE`, LIVE는 transport 주입 없으면 `NOT_CONFIGURED`. 멱등키 |
| 실제발행 | `prototype/supabase/functions/social-admin/index.ts` (824줄) | `PROVIDERS` 7종, AES-GCM 볼트(`SOCIAL_VAULT_KEY` 32B, bucket `earthus-social-private` 비공개). cron/webhook 자동게시 없음. `confirmed=true`+멱등키 POST만. `publish-locks`+`publish-log`. TikTok/YouTube/X 토큰갱신, Meta `appsecret_proof` |
| 관리UI | `prototype/distribution.html` + `prototype/js/distribution-admin.js` (444줄) | 탭: 콘텐츠/달력/큐/성과/채널. **게시 버튼 없음**. Supabase 관리자 게이트. 자격증명 코드 없음 |
| CLI | `aws/distribution/cli.py` | `daily/weekly/event/scorecard/from-report/validate/preview/publish/audit`. `publish` 기본 MOCK |
| 시험 | `aws/distribution/tests/test_distribution.py` + `tools/test_distribution_reporting.mjs` | 어댑터·큐·아카이브 단위 + 파이썬↔프런트 계약 대조(현상표·플랫폼어휘·한도·상태어휘) |
| 리포트→SNS | `aws/distribution/sources/report_bridge.py` + `lab_report.py` + `verify_scorecard.py` + `aws/report-engine/publisher.py` + `social_publish.py` | 리포트 계약→배포 후보 연결. 발행본 `reports/published/` immutable |

## 2. 15기능 판정

| # | 기능 | 상태 | 분류 | 근거 |
|---|---|---|---|---|
| 1 | 콘텐츠 생성 | 동작(후보) | KEEP | generator+contract+sources 실재 |
| 2 | draft | 동작 | KEEP | DRAFT 어휘·전이상태·social-draft |
| 3 | preview | 동작 | KEEP | PREVIEW payload + 관리UI 미리보기. 게시버튼 없음 확인 |
| 4 | approval | 동작(강함) | KEEP | governance 상태기계 + confirmed 게이트. EARTHUS 강점, 유지 |
| 5 | scheduler | 약함(생성주기만) | IMPROVE | 게시시각 실행기 없음(의도적). 승인후 예약발행 실행경로가 과제 |
| 6 | queue | 동작 | KEEP | BACKOFF·멱등·APPROVED가드 실재 |
| 7 | publish | 분리보관(LIVE는 social-admin) | KEEP | 어댑터 LIVE는 payload까지. 전송=Edge Function. 구조 유지 |
| 8 | SNS adapters | 7종 동작(MOCK/PREVIEW) | KEEP | Threads 포함 7종 실파일. PRIMARY 5종 |
| 9 | media | 사양만 | IMPROVE | visual spec+스튜디오 렌더. 서버 라이브러리·재시도대기(컨테이너폴) 보강余地 |
| 10 | history | 동작 | KEEP | archive 불변+history+publish-log |
| 11 | analytics | 수집기초 | IMPROVE | `record_metrics`+성과탭. 플랫폼 지표 자동수집 없음 |
| 12 | auth/OAuth | 동작(social-admin) | KEEP | AES-GCM 볼트+refresh 3종. 분산금지(§111·112) 유지 |
| 13 | provider 상태 | 운영상태 외부(`provider_registry/health`) | KEEP | provenance가 참조만. 중복 레지스트리 만들지 않음 |
| 14 | 테스트 | 동작 | KEEP | py 단위 + JS 계약대조 |
| 15 | production 연결 | UNKNOWN(코드만으로 단정불가) | ADD(관측) | LIVE 전송코드는 실재. 볼트·키·계정연결 실측은 운영확인 필요. 추측기재 금지 |

## 3. EARTHUS가 이미 잘 만든 것 (외부 때문에 제거 금지)

DATA(수집기·검증채점) / REPORT(불변발행) / INTELLIGENCE(shadow evidence-only) / PROVENANCE(사슬) / APPROVAL(상태기계+사람게이트) / REPORT→SNS 연결(bridge).

## 4. 없는 것 (정직 기록)

- 승인 후 자동 예약발행 실행기 (의도적 부재 — MARKETING-STUDIO-SPEC 규칙과 정합)
- 플랫폼 rate-limit 모듈 (미확인 → UNKNOWN, FULL 표기 금지)
- 지표 자동수집기 (수동/미수집 상태)
- 공개 REST/MCP, 팀워크스페이스 (없음)
