# EARTHUS V2 INTEGRATION-9 RESULT

```text
STATUS:   PARTIAL
PARENT:   0f4f8718
COMMIT:   이 문서와 같은 커밋
DATE:     2026-09-08
```

P0 두 개 중 **하나를 닫았다.** 리포트는 이제 실제로 발행되고 실제로 읽힌다.
남은 것은 삭제 권한 하나와 다른 세션의 커밋 하나다.

---

## 1. REPORT PUBLIC READ — 닫힘 ✅

### 무엇이 문제였나

`reports/*` 가 버킷 공개 읽기 정책에 없었다. 발행해도 익명 GET 이 403 이고,
앱은 그것을 "아직 발행된 보고서가 없습니다" 로 표시했다 — 못 읽는 것과 없는 것을
구분하지 못했다.

### 어떻게 고쳤나 — 접두사를 갈랐다

`reports/*` 를 통째로 열지 **않았다**. §1 이 "모든 reports/ 객체를 공개하는 것이
아니다" 라고 했고, 그 편이 실제로 더 안전하다.

```text
reports/published/…    ← 발행본·색인. 버킷 정책이 여는 유일한 reports 자리
reports/…  그 밖       ← 정책 부여 없음(403) · 표에도 없어 **쓰기 자체가 거부**
```

지금도 초안은 못 올라간다(`lifecycle != PUBLISHED` 거부 + `check_public_write`).
그러나 그건 **쓰는 쪽 한 겹**이다. 그 한 겹이 깨지는 날 `reports/` 가 통째로 열려
있으면 초안이 그 순간 공개된다. 접두사를 가르면 **쓰는 쪽이 깨져도 읽히지 않는다.**

버킷 정책은 **읽어서 한 줄 더하는 방식**으로 고쳤다. 새로 쓰지 않았고, 더한 것
말고 아무것도 달라지지 않았음을 구조로 대조한 뒤 적용하고 되읽어 확인했다.

```text
PublicReadData        Resource 7 → 8   + arn:…:earthus-cache-kr/reports/published/*
AllowCloudFrontRead   Resource 7 → 8   + 같은 항목
되읽기 대조            일치
```

원본과 적용본: [integration-9-bucket-policy.json](integration-9-bucket-policy.json)

## 2. REPORT POLICY VERIFICATION — PASS ✅

익명(자격증명 없음) 실측:

```text
200  reports/published/index.json
200  reports/published/report/2026-08/v1.json      ← 실제 발행본
403  reports/published/report/2026-08/v2.json      (없는 판)
403  reports/report/2026-08/v1.json                (옛 자리)
403  reports/index.json                            (옛 색인)
403  reports/draft/x.json
403  reports/review/x.json
403  reports/published-ish/x.json                  ← 접두사 흉내도 막힌다
```

앱 화면(§2-8):

```text
전    "아직 발행된 보고서가 없습니다"
후    지구 회고 · 전망 → 2026-08 [읽기] → 본문 렌더
      data-report-id="report:2026-08" · 17절 · 실제 S3 객체에서 받아 그린다
```

## 3. REPORT PUBLICATION READ-BACK — 사슬을 고쳤다 ✅

### ⚠️ 운영 발행 경로가 죽어 있었다

```text
pipeline.py --publish
  → generator.run_publication_pipeline()   ← 여기서 publishedAt·immutableRef 를 찍었다
  → publisher.publish_pipeline()
      → governance.gate(want="PUBLISHING")
          _derive_state: publishedAt 이 있으면 상태는 PUBLISHED
          PUBLISHED → PUBLISHING 은 금지 전이
      → FORBIDDEN_TRANSITION.  adapter.publish() 에 **도달하지 못한다.**
```

운영 입구로는 **한 건도 올릴 수 없었다.** 그러면서 올린 적 없는 문서가
"발행됨" 도장과 `immutableRef` 를 달고 디스크에 남았다.

**고침**: 발행 증거는 업로드 사실의 기록이므로 **올리는 쪽만** 찍는다.
generator 는 검증만 하고 `validatedAt` 을 남긴다. publisher 가 승인 문을 지난 뒤
`put_object` 직전에 도장을 찍는다. (`publishedAt`·`immutableRef` 는
`UNSIGNED_FIELDS` 라 나중에 찍어도 승인 해시를 깨지 않는다.)

이제 §3 이 요구한 순서가 실제로 그 순서로 일어난다:

```text
BUILD → VALIDATE → 사람 승인 → PUBLISH → 익명 되받기 → PUBLISHED
```

### 되받기는 항목별로 본다

```text
HTTP_NOT_200 · REPORT_ID_MISMATCH · VERSION_MISMATCH
LIFECYCLE_NOT_PUBLISHED · HASH_MISMATCH
```

`public_base` 는 서명 없는 주소다. 그래서 이 확인은 "우리가 읽을 수 있나"가 아니라
**"누구나 읽을 수 있나"** 를 묻는다. 되받기가 실패하면 색인을 건드리지 않는다 —
못 읽는 것을 목록에 올리지 않는다.

### 실제 발행 (사람 승인)

사용자가 이 작업 중 직접 승인했다. 시스템 계정 승인 경로는 없다.

```text
VALIDATE   PUBLISHED · validatedAt 2026-09-08T11:38:53Z
APPROVE    APPROVED → PUBLISHING ok=True · by dalur · CLI_CONFIRM
PUBLISH    key=reports/published/report/2026-08/v1.json · production=True
READ-BACK  ok=True http=200 reportId=report:2026-08 version=1 lifecycle=PUBLISHED
           확인 5항목 · 실패 0
INDEX      reports/published/index.json
PUBLISHED  publishedAt=2026-09-08T11:38:53Z immutableRef=report:2026-08
```

내용: RETROSPECTIVE_MONTHLY · 팩트 60 · 스토리 21 · 15절 · `DATA_PARTIAL` · 137 KB.

운영에서 함께 확인한 것:

```text
같은 키에 다시 올리기      → published=False · alreadyPreserved=True (원본 그대로)
초안 섞인 색인 올리기      → INDEX_CONTAINS_UNPUBLISHED 로 거부
```

## 4. LIVE 95 LEGACY OBJECTS — BLOCKED ❌

버킷 전체를 **새로 훑었다**. 앞 단계 목록을 재사용하지 않았다.

```text
before:      25,360
forbidden:       95
deleted:          0   ← s3:DeleteObject 권한 없음
remaining:       95
UNKNOWN:          0
```

| 분류 | 건수 |
|---|---:|
| KEEP_PUBLIC | 14,446 |
| KEEP_PRIVATE | 10,815 |
| **LEGACY_PUBLIC_FORBIDDEN** | **95** |
| EXEMPT_PRODUCT_PATH | 4 |
| **UNKNOWN** | **0** |

## 5. DELETE PERMISSION — 없다

존재하지 않는 키로 확인했다 — 운영 파일을 먼저 지워서 시험하지 않았다.

```text
aws s3api delete-object --key "_integration9-permission-probe/does-not-exist.txt"
→ AccessDenied: ... not authorized to perform: s3:DeleteObject
                because no identity-based policy allows the s3:DeleteObject action
```

```text
BLOCKED_NO_DELETE_PERMISSION
```

지우지 않았으므로 지웠다고 적지 않는다. 빈 파일로 덮는 우회는 쓰지 않았다.

산출물: [integration-9-delete-candidates.json](integration-9-delete-candidates.json) ·
[integration-9-cleanup-command.txt](integration-9-cleanup-command.txt) ·
[integration-9-live-audit.json](integration-9-live-audit.json)

## 6. PRODUCTION PRODUCTS SANITY — PASS ✅

정책을 바꾼 **뒤** 실측했다. 23/23 일치.

```text
200  app/index.html · app/v3/index.html · app/v2/index.html
200  app/aetherus/manifest.json · app/tourism/{seoul-flow,health}.json
200  app/v2/data/current-earth/snow-ice.meta.json · app/v3/characters/catalog.json
200  ocean/lab-reports.json · events/… · wind/… · clouds/… · solar/… · celestrak/…
200  reports/published/index.json
403  archive/ · archive/social-drafts.json · analysis/aurora-reports.json
403  character-studio/… · reports/{index.json,draft/,review/,published-ish/}
403  서명 없는 PUT
```

`app/orbital/` 은 여전히 **객체 0건**이다. 없는 것을 지웠다고 적지 않는다.
(원인은 세 단계째 같은 것 — 그 스크립트만 `--delete` 를 쓰는데 권한이 없다.)

## 7. PUBLIC WRITE PATH FINAL — PASS ✅

INTEGRATION-8 의 값 추적 검사가 그대로 살아 있고, 리포트 키가 바뀐 뒤에도 따라간다.

```text
쓰기 지점 264 · 거부 0
  aws/report-engine/publisher.py:233  reports/published/…/v….json
  aws/report-engine/publisher.py:261  reports/published/index.json
```

회귀 시험 29건 전부 통과 — 리터럴 · 모듈 상수 · 감싸개 · 환경변수 · 함수 반환 ·
`**args` · for 루프 · JS 템플릿 · 셸 이어붙인 줄, 그리고 읽기 전용 오탐 0.
`UNKNOWN → DENY` 유지. 새 writer 가 생기면 시험이 깨진다.

산출물: [integration-9-write-paths.json](integration-9-write-paths.json)

## 8. APPROVAL FINAL — 구멍 셋을 찾아 막았다 ⚠️→✅

지정된 아홉 가지는 전부 막혀 있었다. 그런데 **한 발 더 밀어 보니 세 개가 뚫렸다.**
전부 실측으로 재현한 뒤 고쳤다.

| | 무엇이 뚫렸나 | 어떻게 고쳤나 |
|---|---|---|
| 1 | **거부 목록으로 걸렀다.** `if life in ("DRAFT","GENERATING"): return "DRAFT"` 다음이 곧바로 `return "APPROVED"` — 아는 이름이 아닌 상태는 전부 통과했다. `BLOCKED` 도, 빈 값도, 오타(`banana`)도 승인만 있으면 발행 단계로 갔다. 바로 그 줄 **위에** 정반대가 적혀 있었다 | 허용 목록(`VALIDATED_STATES`)으로 뒤집었다. 표에 없으면 DRAFT |
| 2 | **상태를 정하는 칸이 서명 밖이었다.** `life = lifecycle or status` 인데 `status` 는 `UNSIGNED_FIELDS`. lifecycle 없는 문서는 승인 뒤 `status` 만 바꿔치면 승인이 그대로 유효했다 (`DRAFT`→`REVIEW` 로 금지 전이가 허용 전이가 된다) | 승인이 **어느 바탕 상태에서 났는지**(`approvedFrom`)를 함께 적고 문이 대조한다. 기록이 없으면 통과시키지 않는다 |
| 3 | **시스템 계정 목록이 영문 전용이었다.** `_TOKEN` 이 한글을 구분자로 지워서 `스크립트`·`자동화`·`봇` 으로 승인하면 낱말이 하나도 안 남아 사람으로 통과했다 | 한국어 목록을 부분일치로 따로 본다. 사람 이름 오탐 0 확인 |

고친 뒤:

```text
DRAFT / FACT_CHECK / REVIEW / BLOCKED / PUBLISHED(검증만) → 승인 없이 발행 금지  PASS
BLOCKED / PENDING / 빈 값 / 오타 + 사람 승인             → DRAFT 로 떨어짐      PASS
승인 뒤 내용 변조                                        → APPROVAL_INVALID    PASS
승인 뒤 상태 변조                                        → APPROVAL_STATE_MOVED PASS
시스템 계정(영문 44 · 한국어 19)                          → 거부                PASS
사람 아닌 승인 방법                                       → 거부                PASS
검증 지난 상태 + 사람 승인                                → APPROVED → PUBLISHING PASS
발행 뒤 되받기 없이는 PUBLISHED 아님                       → PASS
```

## 9. FORECAST FINAL — PASS ✅

`test_integration7_forecast_rules.py` **17건 통과 · 건너뜀 0** (`-rA` 로 확인).
17건 중 9건이 `skipTest` 가드를 달고 있어, 파일이 없으면 조용히 초록 무의미가 된다 —
그래서 건너뜀 0 을 따로 확인한다.

```text
교차리드 순위        0   공개 화면 5개 · intel-feed.js 두 벌 모두 이름 정렬
교차모델 집계        0   집계 키가 모델·변수·리드를 붙여 만든다
값 없음 → None      PASS  0 이 되지 않는다
bool → 숫자         0   어댑터가 bool 지표를 None 으로
NOT_EVALUABLE       보존  사유 있고 값 없음
표본 수             n · nByMetric 둘 다
```

> 적어 둘 것(규칙 위반 아님): 실제 산출물의 채점표는 `evaluatedCount: 0` 이다 —
> 모든 줄이 NOT_EVALUABLE 이다. 검증 입력(`wind/series/verify-daily.json`)이
> 저장소에 없어 점수가 실린 줄은 **단위 픽스처로만** 증명된다.

## 10. REPORT E2E FINAL — PASS ✅

```text
[OK] DATA · REPORT · VISUAL · VISUAL_GATE · EXPORT · CONTENT
[OK] SINGLE_FACT   리포트 숫자 113 = 콘텐츠 숫자 113
[OK] SNS_PAYLOAD · CONTENT_READY · APPROVAL · PUBLISH
=> PASS
```

ID 사슬: `report:2026-08` → `story:2026-08:sst.tropics` → `ocean.sst` →
`fact:2026-08:sst:tropics:mean` → `vis:report_2026-08:earth` → `CNT-2026-000001`.

## 11. MEDIA E2E FINAL

```text
CARD              PASS
VISUAL            PASS   verified=true · 되읽기·해시·픽셀 6/6
REPORT HIGHLIGHT  PASS   html · json · md
VIDEO             NOT_AVAILABLE = DEFERRED
```

판정 근거는 별도 문서에 적었다 — 임의 판단이 아니라 계약 문서 인용이다:
[integration-9-video-decision.md](integration-9-video-decision.md)

## 12. BUNDLE — BLOCKED ❌

```text
BUNDLE_BLOCKED_OTHER_SESSION
SOURCE = DEPLOY:  FAIL
```

다른 세션의 `PopMetricMenu` 가 아직 미커밋이다:

```text
 M prototype/v2-three/index.html · js/main.js · js/pop-sculpture.js
?? prototype/v2-three/js/pop-metric-menu.js
```

번들을 재생성하지 않았다. 내가 고친 두 파일(`ui-shell.js` · `report-center.js`)은
소스와 번들 **양쪽에 같은 수정**을 넣어 그 파일만은 일치시켰다.

```text
tabIntent            소스 3 · 번들 3
setTimeout(reassert) 소스 0 · 번들 0
```

### ⚠️ 그래서 라이브 앱은 아직 이 보고서를 못 보여 준다

발행본은 올라갔고 **누구나 받을 수 있다**(200). 그런데 지금 배포돼 있는 앱은
리포트 화면 자체가 없는 옛 판이다:

```text
app/v2/js/report-center.js   403   (없다)
app/v2/js/ui-shell.js        52,426 bytes  ·  로컬 소스 86,546 bytes
                             reportBase · report-center 문자열 0건
```

저장소 쪽은 닫혔고, **화면에 나오려면 배포가 필요하다.** 배포는 §12 가 막고 있다.

## 13. BROWSER FINAL 4×

```text
1440 KO   PASS      1440 EN   PASS
 375 KO   PASS       375 EN   PASS
```

각 칸에서 리포트를 **실제로 열었다**: 색인 → `2026-08` → 읽기 →
`data-report-id="report:2026-08"` 본문 렌더 (EN 은 "2026-08 Partial data").

```text
OVERFLOW  0  (가로 스크롤 0 · 요소 넘침 0)
CONSOLE   우리 것 0
          외부 3  s3.amazonaws.com/elevation-tiles-prod 지형 타일 403 (서드파티)
```

## TESTS

```text
TOTAL   505
PASS    505
FAIL    0

  report-engine + _shared 시험         320   (+26 INTEGRATION-9)
  distribution                          71
  cyclone-analog + lab-events + _shared 69
  npm (mjs)                             45
```

> `distribution` 과 `report-engine` 을 한 번에 돌리면 모듈 이름이 부딪혀 깨진다
> (둘 다 `handler.py` 를 갖는다). 앞 단계와 같이 따로 돌린다. 새 문제 아니다.

## SECURITY

```text
PUBLIC_LEAK (앞으로 올라갈 것)   0
PRIVATE_DIRECT_ACCESS            0   archive/ · analysis/ · character-studio/ 403
UNSIGNED_WRITE                   0   서명 없는 PUT 403
UNKNOWN_PUBLIC_WRITE             0   모르는 접두사는 거부
APPROVAL_BYPASS                  0   (이번에 셋 막았다 — §8)
```

## UNRELATED

```text
0
```

다른 세션 파일에 손대지 않았다.

---

## PRODUCTION_BOUNDARY_LOCK

```text
NOT CREATED
```

§15 의 조건이 다 차지 않았다. 차지 않은 채로 잠금 문서를 만들지 않는다.

## PRODUCTION_PUBLISH_READY

```text
NO
```

| 조건 | 상태 |
|---|---|
| LIVE_FORBIDDEN = 0 | ❌ **95** (삭제 권한 없음) |
| **REPORT_PUBLIC_READ** | ✅ **PASS** (200 실측) |
| **PRIVATE_REPORT_ACCESS** | ✅ **BLOCKED** (403 실측) |
| **REPORT_READBACK** | ✅ **PASS** (5항목) |
| UNKNOWN_WRITE = DENY | ✅ |
| AUTO_APPROVAL = 0 | ✅ (구멍 셋 막은 뒤) |
| UNVERIFIED_VISUAL_PUBLIC = 0 | ✅ |
| CROSS_LEAD_RANKING = 0 | ✅ |
| NO_DATA_SCORE = 0 | ✅ |
| REPORT_E2E · MEDIA_E2E | ✅ |
| BROWSER 4/4 · CONSOLE 0 · OVERFLOW 0 | ✅ |
| SOURCE = DEPLOY | ❌ 다른 세션 미커밋 |
| UNRELATED = 0 | ✅ |
| VIDEO | DEFERRED (blocker 아님) |

## BLOCKERS

1. **공개 금지 객체 95건.** `s3:DeleteObject` 권한 없음 →
   [integration-9-production-blocker.md](integration-9-production-blocker.md)
2. **SOURCE ≠ DEPLOY** — 다른 세션의 `PopMetricMenu` 미커밋.
   그 때문에 **라이브 앱이 아직 발행된 보고서를 보여 주지 못한다.**

## HANDOFF

[INTEGRATION-9-HANDOFF.md](INTEGRATION-9-HANDOFF.md)
