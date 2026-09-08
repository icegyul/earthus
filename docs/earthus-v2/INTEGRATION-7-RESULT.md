# EARTHUS V2 INTEGRATION-7 RESULT

```text
STATUS:   BLOCKED  (BLOCKED_NO_DELETE_PERMISSION)
PARENT:   86816cdb
COMMIT:   이 문서와 같은 커밋
DATE:     2026-09-08
```

---

## LIVE

```text
before:      25,322   버킷 전체를 새로 훑었다 (기존 목록 재사용 없음)
forbidden:       95   LEGACY_PUBLIC_FORBIDDEN · 익명 200
deleted:          0   ← s3:DeleteObject 권한 없음 (존재하지 않는 키로 확인)
remaining:       95
```

| 분류 | 건수 |
|---|---:|
| KEEP_PUBLIC | 14,429 |
| KEEP_PRIVATE | 10,794 |
| **LEGACY_PUBLIC_FORBIDDEN** | **95** |
| EXEMPT_PRODUCT_PATH | 4 |
| **UNKNOWN** | **0** |

산출물 넷 — 전부 도구가 만든다(§17):

```text
docs/earthus-v2/integration-7-live-audit.json          50 KB · 금지·예외 99건 전량 + 접두사 집계
docs/earthus-v2/integration-7-delete-candidates.json   95건 · 키·크기·sha256·근거·안전판정
docs/earthus-v2/integration-7-cleanup-command.txt      키 지정 삭제 명령
docs/earthus-v2/integration-7-production-blocker.md    블로커
```

INTEGRATION-6 대비 변화 없음 — 새로 샌 것도, 저절로 사라진 것도 없다.
객체 총수만 25,310 → 25,322 로 늘었는데 전부 수집 람다가 만든 정상 피드다.

## PUBLIC

```text
app/index.html                              200  PASS
app/v3/index.html                           200  PASS  (종이 지구 그대로)
app/aetherus/manifest.json                  200  PASS
app/tourism/seoul-flow.json                 200  PASS
app/v2/data/current-earth/snow-ice.meta.json 200  PASS
app/orbital/*                               객체 0건 — 배포된 적이 없다
```

> `app/orbital/` 이 비어 있는 것은 INTEGRATION-6 인계 B 를 확증한다:
> 그 스크립트만 `--delete` 를 쓰는데 권한이 없어 `set -euo pipefail` 에서 죽는다.
> **한 번도 성공한 적이 없는 것이다.**

## PRIVATE

```text
archive/                          403  PASS
archive/social-drafts.json        403  PASS
analysis/aurora-reports.json      403  PASS
서명 없는 PUT                      403  PASS
```

## UNKNOWN

```text
0
```

§2 의 fail-closed 원칙이 코드에 있다: `check_public_write` 는 표에 없는 접두사에
**쓰기를 거부**한다(INTEGRATION-6 에서 뒤집었다). UNKNOWN 은 삭제 대상도,
공개 허용 대상도 아니다 — 사람 검토로 남는다. 이번 실사에서는 0건이었다.

## UPLOADERS

```text
16  전수 (확장자로 거르지 않는다)
12  FILTERED   build/public-app 을 원본으로 쓴다
 4  EXEMPT     이유를 코드와 시험에 적었다
 3  람다가 app/ 에 직접 쓴다 (생성 자료 — tourism-flow · current-earth-snow-ice · character-studio)
```

### 이번에 고친 것 — 내 탐지기의 구멍 셋

INTEGRATION-6 직후 도착한 감사가 **내가 쓴 시험**의 결함 셋을 짚었고,
표본으로 재현해 전부 사실임을 확인한 뒤 고쳤다.

| 구멍 | 무엇이 문제였나 |
|---|---|
| 람다 조사가 **0건**을 잡았다 | `Key="app/…"` 같은 호출 자리 리터럴만 봤다. 이 저장소 람다는 키를 상수로 빼 둔다(`OUTPUT_KEY = "app/tourism/…"` → `put_json(OUTPUT_KEY, …)`). 시험은 통과했지만 **아무것도 지키지 않았다** |
| `_writes_up` 이 SDK 를 몰랐다 | `aws s3 cp` 같은 CLI 동사만 알았다. `s3.put_object(...)` · `new PutObjectCommand(...)` 는 전부 통과. INTEGRATION-4 의 "확장자로 거르지 마라"가 **업로드 API 한 층 아래로 옮겨간 것** |
| `prototype/` 검사가 헛돌았다 | 정규식이 `prototype/` **바로 앞에 따옴표**를 요구했다. 이 저장소에 흔한 `"$ROOT/prototype/…"` 는 그대로 통과 — 잡으려던 모양을 못 잡았다 |

고친 뒤 재현 확인:

```text
탐지된 람다  character-studio · current-earth-snow-ice · tourism-flow   (누락 0 · 오탐 0)
```

> 한 번 더 틀렸다는 것도 적어 둔다. 넓히기만 했더니 app/ 를 **읽는** 람다 넷
> (air-state·health·obis-summary·space-archive)까지 잡혔다. 잘못 잡는 검사기는
> 곧 무시당하므로, 문자열을 조립하는 대입만 파생으로 따라가도록 좁혔다.

## APPROVAL

```text
DRAFT / FACT_CHECK / REVIEW / BLOCKED / PRIVATE → public write 금지   PASS
APPROVED        사람 승인만                                            PASS
PUBLISHED       실제 발행 + 되읽기 이후에만                             PASS
AUTO            금지                                                   PASS
APPROVAL_HASH   현재 내용 해시와 일치해야 함                            PASS
```

승인 우회 9종 전부 막힘(§9 · INTEGRATION-5 시험이 계속 지킨다).

## FORECAST

§10 의 규칙 여덟 가지를 **영구 회귀 시험**으로 고정했다 —
`aws/report-engine/tests/test_integration7_forecast_rules.py` 17건, 건너뛴 것 0.

| | 규칙 | 어떻게 지키나 |
|---|---|---|
| A | 교차리드 순위 금지 | 공개 화면 5개를 훑어 합산 오차 정렬이 없음을 확인. 람다는 `crossLead:True · rankingBasis:False` 를 단다. 리드별 비교 함수는 남아 있다 |
| B | 모델별 독립 | 같은 변수·리드라도 모델이 다르면 따로 집계 (실제 호출로 확인) |
| C | 변수별 독립 | 〃 |
| D | 표본 수 표시 | `n` 과 `nByMetric` 둘 다 |
| E | 값 없음 → None | `mae:None` 이 0 이 되지 않는다 |
| F | bool → 숫자 금지 | `_numeric(True)` 거짓 · 어댑터가 bool 지표를 None 으로 |
| G | NOT_EVALUABLE 보존 | **실제 산출물**에서 확인 — 사유 있고 값은 null |
| H | UNKNOWN → DENY | 모르는 접두사·모르는 상태·콘텐츠가 아닌 것 전부 비공개 |

## REPORT

`integration_e2e.py --period 2026-08` **11단계 전부 OK** (오늘 편집 뒤 재실행)

```text
report_id        report:2026-08            팩트 60 · 스토리 21 · DATA_PARTIAL
story_id         story:2026-08:sst.tropics
phenomenon_id    ocean.sst
fact_id          fact:2026-08:sst:tropics:mean
visual_asset_id  vis:report_2026-08:earth   verified=true · 조건 6/6
content_id       CNT-2026-000001            DRAFT · REVIEW_REQUIRED
SINGLE_FACT      리포트 숫자 113 = 콘텐츠 숫자 113
```

화면에서도 눌렀다: REPORT CENTER 15절 · 스토리 37 · 근거 37 ·
→ PHENOMENON(now) · INTELLIGENCE(why) · SIMULATION(scenario, 두 현상 모두).

## MEDIA

```text
CARD              PASS   x · instagram 판 생성
VISUAL            PASS   verified=true · 되읽기·해시·픽셀검사 6/6
REPORT HIGHLIGHT  PASS   html · json · md, 위 ID 사슬 연결
VIDEO             NOT_AVAILABLE   ← 영상 엔진이 이 저장소에 없다
```

가짜 성공을 적지 않는다. 영상은 만들지 않았고(§0 · 새 기능 금지), 없다고 적는다.

## BROWSER

```text
1440 KO   PASS
1440 EN   PASS
375  KO   PASS
375  EN   PASS
```

각 칸에서 확인한 것: 지구 렌더 · 메뉴 5탭 · 리포트 15절 · 스토리 37 ·
근거 37 · 시뮬 버튼 2 · 분석 버튼 21 · 자료 라벨 4종(자료 충분 / 일부 / 부족 / **평가 불가**).
상호작용: 현상(now) · 분석(why) · 시뮬레이션 2종(scenario) · 공유 버튼 존재.

```text
CONSOLE   0
OVERFLOW  0   (가로 스크롤 0 · 요소 넘침 0)
```

## BUNDLE

```text
BUNDLE_BLOCKED_OTHER_SESSION
SOURCE = DEPLOY:  FAIL
```

§12 대로 먼저 `git status` 를 확인했다. 다른 세션의 변경이 **그대로 남아 있다**:

```text
 M prototype/v2-three/index.html
 M prototype/v2-three/js/main.js
 M prototype/v2-three/js/pop-sculpture.js
?? prototype/v2-three/js/pop-metric-menu.js
```

그래서 번들을 다시 만들지 않았다. 만들면 그 미완성 코드가 `v2-deploy` 에 박힌다.

내가 이번 단계에서 고친 `intel-feed.js` 는 소스와 번들 **양쪽에 같은 수정**을 넣어
그 파일만은 일치시켰다(재작성 규칙인 vendor 경로 한 줄만 다르다).

§11 탭 의도는 양쪽 다 정상:

```text
tabIntent            소스 3 · 번들 3
setTimeout(reassert) 소스 0 · 번들 0
```

## TESTS

```text
TOTAL   445
PASS    445
FAIL    0

  report-engine + _shared   297   (+17 INTEGRATION-7 예보 규칙 · +1 람다 탐지기)
  distribution               71
  cyclone-analog             26
  lab-events                  6
  npm (mjs)                  45
  N1 watch coverage        통과
  공개 빌드 누출 시험       통과
```

## UNRELATED

```text
0
```

다른 세션 파일에 손대지 않았다.

---

## PRODUCTION_PUBLISH_READY

```text
NO
```

## BLOCKERS

1. **공개 금지 객체 95건** (익명 200). `s3:DeleteObject` 권한 없음.
   → [integration-7-production-blocker.md](integration-7-production-blocker.md)
2. **SOURCE ≠ DEPLOY** — 다른 세션의 `PopMetricMenu` 미커밋. 그쪽이 커밋해야 재생성 가능.
3. 영상 엔진 없음 — MEDIA 의 VIDEO 는 `NOT_AVAILABLE`.
4. `build/orbital` 이 거름망을 지나지 않는다(지금은 객체 0건이라 실피해 없음).

## HANDOFF

[INTEGRATION-7-HANDOFF.md](INTEGRATION-7-HANDOFF.md)
