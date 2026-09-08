# EARTHUS V2 INTEGRATION-10 RESULT

```text
STATUS:   BLOCKED
PARENT:   cac73114
COMMIT:   이 문서와 같은 커밋
DATE:     2026-09-08
```

새 기능을 만들지 않았다. 남은 블로커 둘을 다시 재고, 닫힌 것들이 **정말 닫혀 있는지**
실행으로 확인했다. 코드 변경 없음 — 회귀가 전부 통과했다.

블로커 둘은 그대로다. **둘 다 이 세션이 풀 수 없는 것이다** — 권한 하나와 다른 세션 하나.

---

## LIVE

```text
before:      25,498
forbidden:       95
deleted:          0   ← s3:DeleteObject 권한 없음
remaining:       95
UNKNOWN:          0
```

| 분류 | 건수 |
|---|---:|
| KEEP_PUBLIC | 14,581 |
| KEEP_PRIVATE | 10,818 |
| **DELETE_CANDIDATE** | **95** |
| EXEMPT_PRODUCT_PATH | 4 |
| **UNKNOWN** | **0** |

버킷 전체를 새로 훑었다. 기존 95건 목록을 재사용하지 않았다.
총수만 25,360 → 25,498 로 늘었고 전부 수집 람다의 정상 피드다.
`reports/` 에 2건이 새로 생겼다 — 이번에 발행한 색인과 발행본이며 KEEP_PUBLIC 이다
(삭제 후보에 들어가지 않았음을 확인했다).

### ⚠️ 이 95건이 무엇인지 — 지금까지의 표현이 너무 약했다

앞 단계들은 "DB 스키마·마이그레이션"이라고만 적었다. 실제로는 **서버 소스**가 섞여 있다.

```text
.sql  34   스키마·마이그레이션(RBAC · 결제 · 환불 · 초대 · 개인정보 버전 · 소셜 자격증명)
.ts   15   Supabase Edge Function **서버 소스**
.md   13   저장소 안쪽 문서
.js   12   QA 하네스 · 개발 설정 서식 · 정책 모듈
그 밖  21   .temp · config.toml · 옛 파노라마 · 카나리 산출물 · devserver.py
```

`.ts` 15건에는 이런 것들이 있다 — 전부 익명 200 으로 확인:

```text
app/v2/supabase/functions/checkout/index.ts
app/v2/supabase/functions/payment-confirm/index.ts
app/v2/supabase/functions/payment-refund/index.ts
app/v2/supabase/functions/member-admin/index.ts
app/v2/supabase/functions/social-admin/index.ts
app/v2/supabase/functions/_shared/admin-access.ts
app/v2/supabase/functions/_shared/social-credentials.ts
```

**자격증명은 없다.** 표본을 받아 `sk_live_` · `service_role_key` · JWT · `AKIA` 를 훑었고
하나도 나오지 않았다. `social-credentials.ts` 는 값이 아니라 vault 추상화를 쓴다.
`app/supabase/schema.sql` 은 이미 46바이트 비석("삭제 예정 파일입니다. 내용 없음.")이다.

즉 **키 유출이 아니라 설계·공격면 노출**이다 — 결제·환불·관리자 접근 제어의 서버 로직,
RPC 이름, vault 경로 규칙, 테이블·함수 서명. 그래도 지워야 할 것은 그대로다.

산출물(도구가 만든다 · 손으로 적은 목록 없음):

```text
docs/earthus-v2/integration-10-live-audit.json          key·size·lastModified·httpStatus·classification
docs/earthus-v2/integration-10-delete-candidates.json   key·size·sha256·reason·safe_to_delete (95건)
docs/earthus-v2/integration-10-cleanup-command.txt      키 지정 삭제 명령 95줄
```

## DELETE PERMISSION

존재하지 않는 키로 확인했다 — 운영 파일을 먼저 지워서 시험하지 않았다.

```text
aws s3api delete-object --bucket earthus-cache-kr \
  --key "_integration10-permission-probe/does-not-exist.txt"
→ AccessDenied: ... not authorized to perform: s3:DeleteObject
```

```text
BLOCKED_NO_DELETE_PERMISSION
```

§4 는 수행하지 않았다. **deleted = 0.** 지우지 않았으므로 지웠다고 적지 않는다.
빈 파일로 덮는 우회는 쓰지 않았다.

## PUBLIC BOUNDARY · PRODUCT PATHS

```text
200  reports/published/index.json
200  reports/published/report/2026-08/v1.json
200  app/index.html · app/v2/index.html · app/v3/index.html
200  app/aetherus/manifest.json · app/tourism/seoul-flow.json
200  app/v2/data/current-earth/snow-ice.meta.json · app/v3/characters/catalog.json
200  ocean/lab-reports.json
```

삭제를 하지 않았으므로 사라진 정상 파일도 없다. `app/orbital/` 은 여전히 0건이고,
없는 것을 지웠다고 적지 않는다.

## REPORT

익명(자격증명 없음)으로 받아 확인했다.

```text
GET reports/published/report/2026-08/v1.json
  200 · application/json; charset=utf-8 · 116,878 bytes
  Cache-Control: public, max-age=31536000, immutable
  reportId report:2026-08 · type RETROSPECTIVE_MONTHLY · version 1
  lifecycle PUBLISHED · publishedAt 2026-09-08T11:38:53Z · immutableRef report:2026-08
  dataLabel DATA_PARTIAL · 팩트 60 · 스토리 21 · 절 15
  approval  by=dalur · CLI_CONFIRM · state=APPROVED

GET reports/published/index.json
  200 · 321 bytes · Cache-Control: public, max-age=300 (색인은 의도적으로 가변)
  years.2026 에 report:2026-08 · immutableRef 있음
```

화면에서도 열었다:

```text
지구 회고 · 전망 → 최신/월간 → 2026-08 [읽기] → data-report-id="report:2026-08" · 17절
"아직 발행된 보고서가 없습니다" 는 분기·연간·전망에서만 나온다 — **그게 사실이기 때문**이다
(발행된 것은 월간 하나뿐). 못 읽어서 나오는 문장이 아니다.
```

## REPORT READ-BACK · IMMUTABILITY

덮어쓰기를 **운영 자격증명으로 실제로 시도했다**(`available()` ok=True → 진짜 PutObject 발행).

```text
publish(변조본, published_at=2026-09-09) →
  {'ok': True, 'published': False, 'alreadyPreserved': True}

sha256 전  201c31d7b29f6f4afa55f458b56f49dbf807315b2ee179e88be4b08292aa15be
sha256 후  201c31d7b29f6f4afa55f458b56f49dbf807315b2ee179e88be4b08292aa15be   동일
ETag       "09c32b0b08c039129200c373628cd14d"  변화 없음
Last-Modified  Tue, 08 Sep 2026 11:38:56 GMT   변화 없음 → 새 판이 쓰이지 않았다
```

두 겹으로 막힌다: 버전이 **키 안에** 있고(`…/v1.json`), 그 위에
`IfNoneMatch="*"` 조건부 쓰기가 있다(`publisher.py:236`). 412 는 오류가 아니라 보존이다.

> 한계도 적어 둔다: 이 불변성은 **응용 계층 + S3 조건부 쓰기**로 지켜진다.
> 버킷 Object Lock 은 아니다 — 이 자격증명은 versioning·object-lock 설정을 읽을 권한이 없어
> 버킷 차원의 보존 장치가 있는지 **확인하지 못했다**.

새 판 경로도 확인했다(§7):

```text
next_version(v1) → version 2 · lifecycle DRAFT · supersedes report:2026-08#v1
                   publishedAt·immutableRef **제거됨** · 키 …/v2.json (익명 403 — 미발행)
gate(v2)  → APPROVAL_INVALID   ← v1 승인이 새 내용으로 넘어오지 않는다
검증 후    → 여전히 APPROVAL_INVALID (사람 승인 필요)
사람 승인  → APPROVED → PUBLISHING ok=True → 발행 가능
```

## APPROVAL

실행으로 확인했다(읽기가 아니라).

```text
DRAFT / FACT_CHECK / REVIEW / BLOCKED, 승인 없음        → FAIL
BLOCKED + 사람 승인                                     → FAIL (바탕 상태가 DRAFT 로 떨어진다)
PENDING · RUNNING · 빈 값 · 없음 · 오타 + 사람 승인      → 전부 FAIL
AUTO · HUMAN_REVIEW 등 사람 아닌 승인 방법               → 예외로 거부
시스템 계정 영문(system·system1·bot·ci·lambda…)          → 예외로 거부
시스템 계정 한국어(스크립트·자동화·봇·크론잡·에이전트…)   → 예외로 거부
사람 이름(dalur·김철수·이영희·박지훈·정민수·Dalur Kim)   → 통과 (오탐 0)
APPROVED + 내용 변조                                     → APPROVAL_INVALID
APPROVED + 승인 뒤 status 변조                           → APPROVAL_STATE_MOVED
approvedFrom 기록 삭제                                   → 통과시키지 않음
검증 지난 상태 + 사람 승인                                → APPROVED → PUBLISHING ✅
PUBLISHED 선언은 되받기 성공 뒤에만                       → ✅
```

## WRITE PATH

```text
쓰기 지점 264 · 거부 0
  ALLOW_FEED 140 · ALLOW_APP 60 · ALLOW_PRIVATE 38 · SKIP_WRAPPER 25 · ALLOW_OTHER 1
회귀 시험 29건 통과 · 건너뜀 0
```

아홉 가지 키 모양이 전부 영구 시험으로 고정돼 있다 — 리터럴 · 모듈 상수 · 감싸개 ·
환경변수 기본값 · 함수 반환 · `**args` 사전 전개 · for 루프 · JS 템플릿 · 셸 이어붙인 줄.
`UNKNOWN → DENY`. 읽기 전용 람다 4종(air-state · health · obis-summary · space-archive)
`app/` 키 0건 — 오탐 없음.

새 공개 writer 를 넣으면 시험이 깨진다(`test_사람확인_건수가_실제와_같다` 가 미증명 건수를 못 박는다).

## FORECAST

```text
17건 통과 · 건너뜀 0   (-rA 로 SKIPPED 0 확인)
```

17건 중 9건이 `skipTest` 가드를 달고 있어 파일이 없으면 조용히 초록 무의미가 된다.
그래서 건너뜀 0 을 따로 센다.

```text
리드 6h · 12h · 24h · 48h · 72h · 120h  각각 독립 (집계 키가 모델·변수·리드를 붙여 만든다)
교차리드 순위      0
교차모델 집계      0
값 없음 → None    0 이 되지 않는다
bool → 숫자       거부
NOT_EVALUABLE     사유 보존 · 값 없음
```

## MEDIA · VIDEO

```text
CARD              PASS
VISUAL            PASS   verified=true · 되읽기·해시·픽셀 6/6
REPORT HIGHLIGHT  PASS   html · json · md · 화면 공유(⤴) 있음
VIDEO             DEFERRED
```

§14 확인 — **배포 UI 는 영상을 만들 수 있다고 말하지 않는다.**

```text
prototype/v2-deploy · v2-three   VIDEO 주장 0건
                                 '영상' 은 전부 기상 의미(위성영상 · 레이더 합성영상 · 태양 관측 영상)
studio.html 릴스 탭              "1단계 출력은 순번이 붙은 PNG 묶음입니다"  ← 정직
VIDEO_AVAILABLE 토큰             저장소 전체에 존재하지 않음
```

> 검사 중 하나가 `social-settings.html:108` 의 "현재 earthus 연결은 영상 게시를
> 지원합니다" 를 §14 위반(FAIL)으로 올렸다. **직접 확인한 뒤 내렸다.**
> 그 문장은 TikTok **자격증명 설정 안내** 안에 있고, TikTok Content Posting API 가
> 영상 전용이라 연결이 `video.publish` 범위를 받는다는 뜻이다. 같은 화면들이
> "영상만 게시할 수 있습니다"(studio.html:364·365) 라고 명시하고, 매체는 운영자가
> **가져오는**("사진·영상 가져오기") 것이며, 실제 사람 업로드 발행 경로가 존재한다.
> 영상 **생성**을 할 수 있다고 말하는 자리는 없다. → §14 PASS.
> 다만 채널 선택 줄이 "영상은 직접 올려야 한다"를 따로 말하지 않는 점은 P2 로 남긴다
> (이미 [integration-9-video-decision.md](integration-9-video-decision.md) 에 기록돼 있다).

## BUNDLE · SOURCE = DEPLOY

```text
BUNDLE_BLOCKED_OTHER_SESSION
SOURCE = DEPLOY:  FAIL
```

먼저 `git status` 를 봤다. 다른 세션의 변경이 그대로 남아 있다:

```text
 M prototype/v2-three/index.html · js/main.js · js/pop-sculpture.js
?? prototype/v2-three/js/pop-metric-menu.js
```

번들을 재생성하지 않았고 그 파일들에 손대지 않았다.

⚠️ 그래서 **라이브 앱은 아직 발행된 보고서를 보여 주지 못한다.**
지금 배포돼 있는 `app/v2/js/report-center.js` 는 403(없음)이고, `app/v2/js/ui-shell.js` 는
52 KB(로컬 소스 86 KB)로 리포트 화면 자체가 없는 옛 판이다.
저장소 경계는 닫혔고, 화면에 나오려면 배포뿐이다.

## BROWSER

```text
1440 KO   PASS      1440 EN   PASS
 375 KO   PASS       375 EN   PASS
```

각 칸에서 실제로 눌러 확인:

```text
리포트 센터        열림 · 탭 5종(최신·월간·분기·연간·전망)
발행 보고서        2026-08 [읽기] → data-report-id="report:2026-08" · 17절
색인               월간·최신에만 2026-08 · 분기·연간·전망은 "아직 없음"(사실)
예보 검증          "예보가 없어 맞다·틀리다를 말할 수 없는 현상 6개" · "평가할 스냅샷이 없습니다"
리포트 → 현상      자세히 보기 → live=sstfield · 출처 패널(NOAA OISST v2.1 · 공식 관측)
리포트 → 인텔리전스 분석 → live=sstfield,tempgrid · "WHY — 인과 주장 게이트"
리포트 → 시뮬레이션 배선돼 있다(report-center.js:165 "조건을 바꿔보기").
                   이 보고서에는 안 나온다 — 스토리 현상이 sstfield·tempgrid·seaice 이고
                   simulation 가능한 현상은 ocean.wave · hazards.tsunami 둘뿐이다. 데이터 기준 정상
시뮬레이션 자체     따로 눌러 실행 — 태풍 카테고리 3 · 눈까지 35km · SCENARIO 라벨
미디어 하이라이트   ⤴ "이 화면 공유 (링크 복사 · 그림 저장)" · 리포트 교차분야 링크 렌더
모바일 내비게이션   지금·탐색·내 지역·리포트·우주 (EN: Now·Explore·My place·Report·Space)
```

```text
CONSOLE   0
OVERFLOW  0   (가로 스크롤 0 · 요소 넘침 0)
```

## SECURITY

```text
200  reports/published/index.json · reports/published/report/2026-08/v1.json
403  reports/index.json · reports/report/2026-08/v1.json
403  reports/draft/x.json · reports/review/x.json
403  reports/published-ish/x.json          ← 접두사 흉내도 막힌다
403  reports/published/report/2026-08/v2.json  ← 미발행 판
403  archive/ · archive/social-drafts.json · analysis/aurora-reports.json
403  character-studio/jobs/x.json
403  서명 없는 PUT
```

버킷 정책: `reports/published/*` 는 있고 맨 `reports/*` 는 **없다**(두 Sid 모두 8개 Resource).

⚠️ 스키마·마이그레이션·Edge Function 은 **여전히 200** 이다. 위 LIVE 절의 95건이고,
삭제 권한이 없어 그대로다. 새로 샌 것은 없다.

> 구조적 지적 하나: 이 정책에는 Allow 만 있고 Deny 가 없다. 공개는 접두사 단위로 주어지므로
> `app/*` 아래에 **쓰이는 순간** 세상에 읽힌다. SQL 마이그레이션과 Edge Function 소스가
> 공개 웹에 있게 된 경로가 바로 이것이다. 지금은 거름망(`build-public.py`)과
> 값 추적 검사가 앞으로의 배포를 막고 있다. Deny 문을 넣는 것은 우리 배포 신원까지
> 함께 막을 수 있어 **이번에 손대지 않았다** — 인계에 적는다.

## TESTS

```text
TOTAL   505
PASS    505
FAIL    0

  report-engine + _shared 시험         320
  distribution                          71
  cyclone-analog + lab-events + _shared 69
  npm (mjs)                             45
```

## UNRELATED

```text
0
```

다른 세션 파일에 손대지 않았다. 코드 변경 없음 — 이번 단계 산출물은 문서와 실사 결과뿐이다.

---

## PRODUCTION_BOUNDARY_LOCK

```text
NOT CREATED
```

§15 의 필수 조건 중 둘이 차지 않았다(`LIVE_FORBIDDEN = 0`, `SOURCE = DEPLOY`).
차지 않은 채로 잠금 문서를 만들지 않는다.

## PRODUCTION_PUBLISH_READY

```text
NO
```

| 조건 | 상태 |
|---|---|
| LIVE_FORBIDDEN = 0 | ❌ **95** |
| UNKNOWN = 0 | ✅ |
| PUBLIC_LEAK = 0 (앞으로 올라갈 것) | ✅ |
| REPORT_PUBLIC_READ = PASS | ✅ |
| PRIVATE_DIRECT_ACCESS = 0 | ✅ |
| AUTO_APPROVAL = 0 | ✅ |
| UNVERIFIED_VISUAL_PUBLIC = 0 | ✅ |
| CROSS_LEAD_RANKING = 0 | ✅ |
| NO_DATA_SCORE = 0 | ✅ |
| REPORT_E2E = PASS | ✅ |
| MEDIA_E2E = PASS | ✅ (VIDEO 는 DEFERRED) |
| BROWSER 4/4 = PASS | ✅ |
| CONSOLE = 0 · OVERFLOW = 0 | ✅ |
| SOURCE = DEPLOY | ❌ 다른 세션 미커밋 |
| UNRELATED = 0 | ✅ |

## BLOCKERS

1. **공개 금지 객체 95건** — `s3:DeleteObject` 권한 없음.
   그중 15건은 Supabase Edge Function **서버 소스**(결제·환불·체크아웃·관리자 접근 제어)다.
   자격증명은 없지만 설계·공격면이 공개돼 있다.
   → [integration-10-production-blocker.md](integration-10-production-blocker.md)
2. **SOURCE ≠ DEPLOY** — 다른 세션의 `PopMetricMenu` 미커밋.
   그 때문에 라이브 앱이 아직 발행된 보고서를 보여 주지 못한다.

두 블로커 모두 **이 세션이 풀 수 없다.** 하나는 IAM 권한, 하나는 다른 사람의 커밋이다.

## HANDOFF

[INTEGRATION-10-HANDOFF.md](INTEGRATION-10-HANDOFF.md)
