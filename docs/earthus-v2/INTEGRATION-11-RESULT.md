# EARTHUS V2 INTEGRATION-11 RESULT

```text
STATUS:   BLOCKED
PARENT:   c9d14bc8
COMMIT:   이 문서와 같은 커밋
DATE:     2026-09-08
```

새 기능을 만들지 않았고 코드도 고치지 않았다. 회귀 505건 전부 통과.
블로커 둘은 그대로다 — **둘 다 이 세션 밖의 일이다.**

---

## LIVE

```text
before:      25,522
forbidden:       95
deleted:          0   ← s3:DeleteObject 권한 없음
remaining:       95
UNKNOWN:          0
```

| 분류 | 건수 |
|---|---:|
| KEEP_PUBLIC | 14,592 |
| KEEP_PRIVATE | 10,831 |
| **DELETE_CANDIDATE** | **95** |
| EXEMPT_PRODUCT_PATH | 4 |
| **UNKNOWN** | **0** |

버킷 전체를 새로 훑었다. 기존 95건 목록을 재사용하지 않았다.
총수만 25,498 → 25,522 로 늘었고 전부 수집 람다의 정상 피드다.
`reports/` 2건(색인·발행본)은 KEEP_PUBLIC 이고 **삭제 후보에 없다**(확인함).

산출물 — 전부 도구가 만든다. 손으로 적은 목록 없음:

```text
docs/earthus-v2/integration-11-live-audit.json
docs/earthus-v2/integration-11-delete-candidates.json   95건
docs/earthus-v2/integration-11-cleanup-command.txt      키 지정 삭제 명령 95줄
docs/earthus-v2/integration-11-write-paths.json
```

삭제 후보 각 항목은 §3 이 요구한 필드를 갖는다:
`key` · `size` · `sha256` · `reason` · `safe_to_delete`.

## DELETE PERMISSION

존재하지 않는 키로 확인했다 — 운영 파일을 먼저 지워서 시험하지 않았다.

```text
aws s3api delete-object --bucket earthus-cache-kr \
  --key "_integration11-permission-probe/does-not-exist.txt"
→ AccessDenied: ... not authorized to perform: s3:DeleteObject
  ... because no identity-based policy allows the s3:DeleteObject action
```

```text
BLOCKED_NO_DELETE_PERMISSION
```

§3 의 삭제와 §4 의 되읽기는 **수행하지 않았다.** deleted = 0 · forbidden_remaining = 95.
지우지 않았으므로 지웠다고 적지 않는다. 빈 파일로 덮는 우회는 쓰지 않았다.

## PUBLIC

삭제를 하지 않았으므로 사라진 정상 파일도 없다. 전부 200:

```text
200  app/index.html · app/v2/index.html · app/v3/index.html
200  app/aetherus/manifest.json · app/tourism/seoul-flow.json
200  app/v2/data/current-earth/snow-ice.meta.json
200  app/v3/characters/catalog.json
200  reports/published/index.json
200  reports/published/report/2026-08/v1.json
```

## PRIVATE

```text
403  archive/ · archive/social-drafts.json     ← 실객체 10,806건을 실제로 막고 있다
403  analysis/aurora-reports.json              ← 실객체 9건
403  reports/index.json · reports/draft/x.json
403  reports/published-ish/x.json              ← 접두사 흉내도 막힌다
403  서명 없는 PUT
403  character-studio/ · character-studio/jobs/x.json
     ⚠️ 이 둘은 **공허한 통과**다 — 그 접두사에 객체가 0건이다.
        정책이 그 접두사를 열지 않는다는 것만 보여 줄 뿐, 지키고 있는 것은 아직 없다.
        (그 람다가 쓰기 시작하면 그때 의미가 생긴다)
```

## UNKNOWN

```text
0
```

접두사 표에 없는 자리에는 `check_public_write` 가 **쓰기를 거부한다**(fail closed).

## REPORT

```text
GET reports/published/report/2026-08/v1.json   200 · 116,878 bytes
  reportId report:2026-08 · version 1 · lifecycle PUBLISHED
  publishedAt 2026-09-08T11:38:53Z · immutableRef report:2026-08 · DATA_PARTIAL
  approval by=dalur · CLI_CONFIRM · APPROVED
  팩트 60 · 스토리 21 · 절 15

GET reports/published/index.json   200 · report:2026-08 · immutableRef 있음
```

화면에서도 네 칸 전부에서 열었다 — `data-report-id="report:2026-08"` · 17절.
**"아직 발행된 보고서가 없습니다" 는 분기·연간·전망에서만 나온다** — 그게 사실이기
때문이다(발행된 것은 월간 하나뿐). 못 읽어서 나오는 문장이 아니다.

## REPORT READ-BACK

```text
verify()  ok=True · httpStatus=200 · 실패 항목 []
확인 5항목  HTTP_NOT_200 · REPORT_ID_MISMATCH · VERSION_MISMATCH
            LIFECYCLE_NOT_PUBLISHED · HASH_MISMATCH
```

`public_base` 는 서명 없는 주소다 — 이 확인은 "누구나 읽을 수 있나"를 묻는다.

## IMMUTABILITY

운영 자격증명으로 **실제 덮어쓰기를 시도했다**(변조본 · 새 published_at).

```text
publish(변조본) → ok=True · published=False · alreadyPreserved=True

                    시도 전                          시도 후
sha256   201c31d7b29f6f4afa55f458b56f49db…   201c31d7b29f6f4afa55f458b56f49db…   동일
ETag     "09c32b0b08c039129200c373628cd14d"  "09c32b0b08c039129200c373628cd14d"  동일
Last-Modified  Tue, 08 Sep 2026 11:38:56 GMT  Tue, 08 Sep 2026 11:38:56 GMT      동일
Content-Length 116878                         116878                             동일
```

두 겹으로 막힌다 — 버전이 **키 안에** 있고(`…/v1.json`), 그 위에
`IfNoneMatch="*"` 조건부 쓰기가 있다(`publisher.py:236`). 412 는 오류가 아니라 보존이다.

새 판 경로:

```text
next_version(v1) → version 2 · lifecycle DRAFT · supersedes report:2026-08#v1
                   publishedAt·immutableRef **제거됨** · 키 …/v2.json (익명 403)
gate(v2)          → APPROVAL_INVALID   (v1 승인이 넘어오지 않는다)
검증 후            → 여전히 APPROVAL_INVALID
사람 승인 후        → APPROVED → PUBLISHING ok=True
```

## APPROVAL

실행으로 확인했다.

```text
DRAFT · FACT_CHECK · REVIEW · BLOCKED  (승인 없음)   → NOT_APPROVED
BLOCKED · PENDING · RUNNING · 빈값 · 오타 + 사람 승인 → FORBIDDEN_TRANSITION
                                                       (허용 목록 밖이라 바탕 상태가 DRAFT)
AUTO 승인                                            → 예외로 거부
승인자 없음(approvedBy=None)                          → APPROVAL_INVALID
APPROVED + 내용 변조(해시 불일치)                      → APPROVAL_INVALID
APPROVED + 승인 뒤 상태 변조                          → APPROVAL_STATE_MOVED
사람 + APPROVED + 해시 일치                           → APPROVED → PUBLISHING ✅
발행                                                 → 익명 되받기 성공 뒤에만 PUBLISHED
```

시스템 계정은 영문 44 · 한국어 19 낱말로 막고, 사람 이름은 통과한다(오탐 0).

## WRITE PATH

```text
쓰기 지점 264 · 거부 0
회귀 시험 29건 통과 · 건너뜀 0
```

아홉 가지 키 모양이 전부 영구 시험으로 고정돼 있다 — 리터럴 · 모듈 상수 · 감싸개 ·
환경변수 · 함수 반환 · `**args` · for 루프 · JS 템플릿 · 셸 이어붙인 줄.
`UNKNOWN → DENY`. 읽기 전용 람다 4종 `app/` 키 0건(오탐 없음).
새 공개 writer 를 넣으면 미증명 건수를 못 박는 시험이 깨진다.

## FORECAST

```text
17건 통과 · 건너뜀 0
리드 6h · 12h · 24h · 48h · 72h · 120h  각각 독립
교차리드 순위 0 · 교차모델 집계 0
값 없음 → None (0 이 되지 않는다) · bool → 숫자 거부
NOT_EVALUABLE 사유 보존
표본 수       어댑터가 n 과 nByMetric 을 낸다 (kma_verify_adapter.py:98) · 시험이 못 박는다
```

⚠️ 다만 **어느 산출물에도 `nByMetric` 이 실려 있지 않다**(실측: 0건).
채점표의 `evaluatedCount` 가 0 이라 점수가 실린 줄이 한 번도 만들어진 적이 없기 때문이다.
규칙은 어댑터 계약과 시험으로 지켜지고 있지만, **제품 산출물에서 확인된 적은 없다.**

## MEDIA

```text
[OK] DATA · REPORT · VISUAL · VISUAL_GATE · CONTENT
[OK] SINGLE_FACT   리포트 숫자 113 = 콘텐츠 숫자 113
[OK] SNS_PAYLOAD · CONTENT_READY · APPROVAL · PUBLISH
=> PASS
```

```text
CARD              PASS
VISUAL            verified=true · 조건 6/6
                  fileHash sha256:2fb890b3…
                  readBack {bytes 61826 · decoded ok · hashMatches true}
                  pixelCheck {mean 17.9 · stdev 34.87 · minStdev 6 · passed true}
HIGHLIGHT         PASS   html · json · md · 공유(⤴) 있음
VIDEO             DEFERRED
```

영상을 구현했다고 주장하지 않는다. 저장소에 영상 생성 경로가 없고, 배포 UI 어디에도
영상을 만들 수 있다는 표시가 없다(릴스 탭은 "1단계 출력은 순번이 붙은 PNG 묶음"이라고 적는다).

⚠️ 그런데 **어느 산출물에도 VIDEO 가 `NOT_AVAILABLE` 로 적혀 있지 않다**(실측: 0건).
파이프라인은 영상에 대해 그냥 **침묵한다.** 이 저장소 자신의 §119 교리와 어긋난다:

```text
aws/report-engine/sections.py:5
  자료가 없다고 절을 지우지 않는다 — 지우면 독자는 그런 주제가 아예 없다고 읽는다.
  대신 `NOT_AVAILABLE` 과 사유를 적는다(§119).
```

리포트 절은 그 교리를 지킨다(채점표가 `NOT_EVALUABLE` 과 사유를 남긴다).
미디어 매니페스트만 지키지 않는다. **거짓말은 아니지만 침묵이고**, 그래서
"VIDEO = DEFERRED" 는 지금 이 문서들에만 있고 시스템 안에는 없다.
§11 의 요구("구현했다고 주장하지 않는다")는 충족하므로 이번 단계에서 고치지 않았다 —
새 개발 금지이기도 하다. 인계에 P2 로 적는다.

## BUNDLE

```text
BUNDLE_BLOCKED_OTHER_SESSION
```

먼저 `git status` 를 봤다. 다른 세션의 변경이 그대로 남아 있다:

```text
 M prototype/v2-three/index.html · js/main.js · js/pop-sculpture.js
?? prototype/v2-three/js/pop-metric-menu.js
```

번들을 재생성하지 않았고 그 파일들에 손대지 않았다.
미완성 변경을 섞어 맞추지 않았다.

## SOURCE=DEPLOY

```text
FAIL
```

⚠️ 그래서 **라이브 앱은 아직 발행된 보고서를 보여 주지 못한다.**
지금 배포돼 있는 `app/v2/js/report-center.js` 는 403(없음)이고,
`app/v2/js/ui-shell.js` 는 52 KB(로컬 소스 86 KB)로 리포트 화면 자체가 없는 옛 판이다.
저장소 경계는 닫혔고, 화면에 나오려면 배포뿐이다.

## BROWSER

```text
1440 KO   PASS      1440 EN   PASS
 375 KO   PASS       375 EN   PASS
```

각 칸에서 확인한 것:

```text
Earth              캔버스 렌더
domain / 사건       오늘의 지구 사건 14 · M5.3 지진(Tonga, 55분 전) · 공식 관측
phenomenon / 선택 자료  태양 · 지형 · 표현 (전역 z4 + 지역 z5~z9 스트리밍)
Intelligence / 자료의 근거  WHY — 인과 주장 게이트
Forecast / 예보·예정  NEXT — "관측은 지나간 것, 예보는 기관이 말한 앞입니다 — 섞지 않습니다"
History / 이력       "현상을 고르면 그 현상의 과거 기록을 봅니다"
Simulation / 시뮬레이션  태풍 시나리오 · 기준선 확인 불가
Evidence            근거 5종 · 갱신 시각·출처 라벨
Report Center       탭 5종(최신·월간·분기·연간·전망)
published report    2026-08 [읽기] → data-report-id="report:2026-08" · 17절
report → phenomenon  live=sstfield · 출처 패널 NOAA OISST v2.1 · 공식 관측
report → Intelligence  live=sstfield,tempgrid · WHY 패널
report → Simulation  배선돼 있다(report-center.js:165). 이 보고서에는 안 붙는다 —
                     스토리 현상이 sstfield·tempgrid·seaice 이고 simulation 가능한 현상은
                     ocean.wave · hazards.tsunami 둘뿐이다. 데이터 기준 정상
media               카드·하이라이트·교차분야 링크 렌더
share               ⤴ "이 화면 공유 (링크 복사 · 그림 저장)"
모바일 내비게이션      지금·탐색·내 지역·리포트·우주 (EN: Now·Explore·My place·Report·Space)
```

```text
CONSOLE   0
OVERFLOW  0   (가로 스크롤 0 · 요소 넘침 0)
```

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

## OBJECT LOCK

```text
NOT_VERIFIED
```

§15 대로 **추측하지 않는다.** 둘 다 읽을 권한이 없다:

```text
aws s3api get-object-lock-configuration --bucket earthus-cache-kr
→ AccessDenied: ... s3:GetBucketObjectLockConfiguration

aws s3api get-bucket-versioning --bucket earthus-cache-kr
→ AccessDenied: ... s3:GetBucketVersioning
```

위 IMMUTABILITY 절에서 증명한 것은 **응용 계층 불변성**이다(키 안의 버전 +
`IfNoneMatch="*"` 조건부 쓰기). 버킷 차원 보존(Object Lock · versioning)은
**있다고도 없다고도 적지 않는다.** 둘은 별개 개념이다.

## UNRELATED

```text
0
```

다른 세션 파일에 손대지 않았다. 코드 변경 없음 — 이번 산출물은 문서와 실사 결과뿐이다.

---

## PRODUCTION_BOUNDARY_LOCK

```text
NOT_CREATED
```

§14 의 필수 조건 중 둘이 차지 않았다(`LIVE_FORBIDDEN = 0`, `SOURCE = DEPLOY`).
차지 않은 채로 잠금 문서를 만들지 않는다.

| 조건 | 상태 |
|---|---|
| LIVE_FORBIDDEN = 0 | ❌ **95** |
| UNKNOWN_PUBLIC_WRITE = 0 | ✅ |
| PRIVATE_DIRECT_ACCESS = 0 | ✅ |
| REPORT_PUBLIC_READ = PASS | ✅ |
| REPORT_READBACK = PASS | ✅ |
| APPROVAL = PASS | ✅ |
| AUTO_APPROVAL = 0 | ✅ |
| UNVERIFIED_VISUAL_PUBLIC = 0 | ✅ |
| CROSS_LEAD_RANKING = 0 | ✅ |
| NO_DATA_SCORE = 0 | ✅ |
| REPORT_E2E = PASS | ✅ |
| MEDIA_E2E = PASS | ✅ |
| BROWSER_4/4 = PASS | ✅ |
| CONSOLE = 0 | ✅ |
| OVERFLOW = 0 | ✅ |
| SOURCE = DEPLOY | ❌ 다른 세션 미커밋 |
| UNRELATED = 0 | ✅ |

## PRODUCTION_PUBLISH_READY

```text
NO
```

## BLOCKERS

1. **공개 금지 객체 95건** — `s3:DeleteObject` 권한 없음.
   그중 15건은 Supabase Edge Function **서버 소스**(결제·환불·체크아웃·관리자 접근 제어).
   자격증명은 없지만 설계·공격면이 공개돼 있다.
   → [integration-11-production-blocker.md](integration-11-production-blocker.md)
2. **SOURCE ≠ DEPLOY** — 다른 세션의 `PopMetricMenu` 미커밋.
   그 때문에 라이브 앱이 아직 발행된 보고서를 보여 주지 못한다.

**이 둘 말고 열다섯 조건은 전부 초록이다.** 둘이 풀리는 날 곧바로 판정할 수 있다.

## HANDOFF

[INTEGRATION-11-HANDOFF.md](INTEGRATION-11-HANDOFF.md)
