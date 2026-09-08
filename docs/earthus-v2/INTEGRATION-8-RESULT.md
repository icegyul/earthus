# EARTHUS V2 INTEGRATION-8 RESULT

```text
STATUS:   BLOCKED
PARENT:   cd52baae
COMMIT:   이 문서와 같은 커밋
DATE:     2026-09-08
```

여섯 가지만 본다: LIVE 금지 0 · 공개 쓰기 경로 · 승인 문 · 리포트/미디어 E2E ·
SOURCE = DEPLOY · 운영 발행 판정.

---

## 1. LIVE

버킷 전체를 **새로 훑었다**. 앞 단계의 목록을 재사용하지 않았다.

```text
before:      25,337
forbidden:       95   LEGACY_PUBLIC_FORBIDDEN
deleted:          0   ← s3:DeleteObject 권한 없음
remaining:       95
UNKNOWN:          0
```

| 분류 | 건수 |
|---|---:|
| KEEP_PUBLIC | 14,435 |
| KEEP_PRIVATE | 10,803 |
| **LEGACY_PUBLIC_FORBIDDEN** | **95** |
| EXEMPT_PRODUCT_PATH | 4 |
| **UNKNOWN** | **0** |

INTEGRATION-7 대비 새로 샌 것 0. 총수만 25,322 → 25,337 로 늘었고 전부 수집 람다의 정상 피드다.

권한은 **존재하지 않는 키**로 확인했다 — 운영 파일을 먼저 지워서 시험하지 않았다.

```text
arn:aws:iam::294951922100:user/earthus-deploy
aws s3api delete-object --key "_integration8-permission-probe/does-not-exist.txt"
→ AccessDenied: ... not authorized to perform: s3:DeleteObject
```

`PutObject` 는 된다. 빈 파일로 덮는 길은 기술적으로 있으나 **쓰지 않는다** —
금지된 우회이고, 덮어도 객체는 남아 200 을 돌려주므로 `LIVE_FORBIDDEN = 0` 을 만족시키지도 못한다.

산출물:

```text
docs/earthus-v2/integration-8-live-audit.json
docs/earthus-v2/integration-8-delete-candidates.json   95건 · 키·크기·sha256·근거
docs/earthus-v2/integration-8-cleanup-command.txt      키 지정 삭제 명령 95줄
docs/earthus-v2/integration-8-production-blocker.md
```

## 2. PUBLIC WRITE PATH

**이번부터 문자열을 찾지 않는다. 값을 따라간다.**

```text
상수/변수 대입 → (전파) → 쓰기 싱크 호출 → 버킷 / 키 / 접두사
```

파이썬은 `ast` 로 진짜 구문 트리를 읽고, 자바스크립트·셸은 상수 전파로 따라간다.
새 도구: [`aws/_shared/write_path.py`](../../aws/_shared/write_path.py)(값 추적) ·
[`aws/_shared/write_policy.py`](../../aws/_shared/write_policy.py)(허용 판정) ·
[`aws/write-path-audit.py`](../../aws/write-path-audit.py)(실사).

```text
쓰기 지점        264   aws · tools · services 전수 (.py .mjs .js .sh)
  ALLOW_FEED     140   람다가 만든 자료 피드
  ALLOW_APP       60   app/ · 허용 목록에 사유와 함께 적힌 자리만
  ALLOW_PRIVATE   38   archive/ · analysis/ · character-studio/
  SKIP_WRAPPER    25   감싸개 정의 (실제 키는 같은 파일 호출 자리에서 해석됨)
  ALLOW_OTHER      1   로컬 MinIO 증거 하네스
  DENY             0
```

`app/` 에 쓰는 자리는 **19곳**이고 전부 목록에 있다. 값 추적이 이번에 새로 밝힌 것:

| | 앞 단계에서 | 이번 |
|---|---|---|
| `character-studio/handler.py` | 키 미상 | `app/v3/characters/catalog.json` · `…/{cid}/versions/…` |
| `current-earth-snow-ice/index.mjs` | 접두사 미상 | `app/v2/data/current-earth/snow-ice.{png,meta.json}` |
| `tourism-flow/kto_details.py` | 안 잡힘 | `app/tourism/kto/details/…` 4곳 |
| 셸 배포기 | 안 봄 | 19개 파일 · 44 쓰기 지점 |

### 값 추적이 닿지 않은 5곳 — 사람이 읽고 목적지를 적었다

`aws/_shared/write_policy.py` 의 `REVIEWED_UNPROVEN` 에 **근거 줄과 함께** 있다.
여기 없는 미증명 쓰기는 거부되고, 새로 생기면 시험이 깨진다.

```text
character-studio/handler.py  put ×2   → character-studio/   (handler.py:346 job_key)
gk2a-clouds/handler.py       put_object → clouds/           (handler.py:257 prefix)
signal-foundation/handler.py _put      → archive/canonical/v1
source-governance/handler.py _put      → archive/governance/v1
```

### 거부 0 이 무엇을 뜻하는지

**그 자체로는 아무것도 뜻하지 않는다.** 그래서 시험이 CASE A/B/C 를 심어 넣고
지금도 잡히는지를 본다 — `aws/report-engine/tests/test_integration8_write_path.py` 29건.

```text
CASE A  키 = 리터럴                          → 잡힘 · DENY_APP
CASE B  키 = 모듈 상수  (7단계가 놓친 모양)   → 잡힘 · DENY_APP
CASE C1 감싸개 뒤에 숨은 키                   → 잡힘 · DENY_APP
CASE C2 os.environ.get 기본값                → 잡힘 · DENY_APP
CASE C3 함수가 돌려준 키                      → 잡힘 · DENY_APP
CASE C4 put_object(**args)  사전 전개         → 잡힘 · DENY_APP
CASE C5 for 루프 변수                         → 잡힘 · DENY_APP
CASE C6 자바스크립트 템플릿 + process.env      → 잡힘 · DENY_APP
CASE C7 셸 for 루프 + 역슬래시 이어붙인 줄     → 잡힘 · DENY_APP
읽기 전용 코드                                → 쓰기 0건 (오탐 없음)
실제 읽기 전용 람다 4종                       → app/ 키 0건
```

### 고친 검사기 구멍 (전부 이번에 표본으로 재현했다)

| 구멍 | 무엇이 문제였나 |
|---|---|
| 모듈 상수를 지역에서 못 봤다 | 함수 안의 `key = f'{PRIVATE}…'` 가 `…` 로 뭉개졌다. 지역 표를 빈 채로 시작했기 때문 |
| 남의 `args` 사전을 끌어 썼다 | 범위를 안 나눠서 감싸개 정의가 **다른 함수의 키**로 해석됐다 |
| JS 정규식 안의 `+` 를 이어붙이기로 봤다 | `(process.env.X \|\| 'app/v2/…').replace(/^\/+\|\/+$/g,'')` 에서 접두사를 통째로 잃었다 |
| JS `Key:` 를 `}` 에서 잘랐다 | 템플릿 `` `${PREFIX}/x.json` `` 의 닫는 중괄호. 목적지가 있는데 "모른다"고 답했다 |
| 셸 이어붙인 줄을 못 봤다 | `--bucket … \` 다음 줄의 `--key` 를 놓쳐 11곳이 미상이었다 |

### 접두사 표를 실측으로 고쳤다

```text
character-studio/   → PRIVATE_PREFIXES 에 추가
                      버킷 정책 PublicReadData 에 그 접두사가 없다 · 지금 객체 0건
```

## 3. APPROVAL GATE

```text
DRAFT / FACT_CHECK / REVIEW / BLOCKED / PRIVATE → public write 금지   PASS
APPROVED         사람 승인만                                          PASS
PUBLISHED        실제 발행 + 되읽기 이후에만                            PASS
AUTO             금지                                                 PASS
APPROVAL_HASH    현재 내용 해시와 일치해야 함                           PASS
```

승인 우회 9종 전부 막힘(`test_integration3_governance.py::NegativeCases` 1~9).
승인·발행 관련 시험 93건 전부 통과.

## 4. REPORT / MEDIA E2E

지구 그림을 **이번 단계에서 새로 찍었다**. 옛 산출물을 재사용하지 않았다.

```text
node tools/earthus_capture.mjs --base http://localhost:*/v2-three/index.html \
  --link '#v=1&at=20.000,130.000,4.7671,0.000&live=sstfield,sstanom' \
  --expect-layers sstfield,sstanom --expect-at 20,130,4.7671
→ 1280x720 · 61,826 bytes · 분산 34.87 · 확인됨
```

```text
[OK] DATA          받은 자료 6종
[OK] REPORT        report:2026-08 · 팩트 60 · 스토리 21 · DATA_PARTIAL
[OK] VISUAL        build/capture/i8-sst-2026-08.jpg · 조건 6/6
[OK] VISUAL_GATE   확인 1 · 제외 0
[OK] EXPORT        html · json · md
[OK] CONTENT       CNT-2026-000001 · MONTHLY_EARTH · REVIEW_REQUIRED
[OK] SINGLE_FACT   리포트 숫자 113 = 콘텐츠 숫자 113
[OK] SNS_PAYLOAD   instagram · x
[OK] CONTENT_READY PAYLOAD_READY
[OK] APPROVAL      사람 승인 전이면 여기서 멈춘다 (자동 승인 경로 없음)
[OK] PUBLISH       실제 발행 0건
=> PASS
```

```text
CARD              PASS
VISUAL            PASS   되읽기·해시·픽셀검사 6/6
REPORT HIGHLIGHT  PASS   html · json · md
VIDEO             NOT_AVAILABLE   ← 영상 엔진이 이 저장소에 없다
```

가짜 성공을 적지 않는다. 영상은 만들지 않았고, 없다고 적는다.

### ⚠️ 새로 찾은 것 — 발행해도 아무도 못 읽는다

리포트 발행 경로가 **공개 읽기 정책 밖**이다.

```text
publisher.report_key()      → "reports/<id>/v<n>.json"
prototype .../js/ui-shell.js:596
    fetch('https://earthus-cache-kr.s3.us-east-2.amazonaws.com/reports/index.json')
```

버킷 정책(`aws s3api get-bucket-policy`, 2026-09-08)의 두 Allow 문 어디에도
`reports/*` 가 없다:

```text
PublicReadData        app/* celestrak/* clouds/* wind/* events/* ocean/* solar/*
AllowCloudFrontRead   app/* wind/* events/* ocean/* solar/* clouds/* celestrak/*
```

앱은 CloudFront 를 거치지 않고 S3 REST 주소로 직접 받으므로 `PublicReadData` 만 걸린다.
실행 중인 앱 안에서 확인했다:

```text
fetch('…/reports/index.json') → 403
```

그리고 `loadReportIndex` 는 `r.ok ? r.json() : null` 이라 403 을 **"아직 발행된
보고서가 없습니다"** 로 표시한다. 지금은 객체가 0건이라 그 문장이 참이지만,
발행하는 순간부터는 **조용한 거짓말**이 된다.

지금 실피해는 없다(`reports/ 0건`). 발행 전에 정책 한 줄을 붙여야 한다 —
IAM 권한이 없어 내가 붙이지 못한다. [블로커 문서](integration-8-production-blocker.md) 참고.

## 5. SOURCE = DEPLOY

```text
BUNDLE_BLOCKED_OTHER_SESSION
SOURCE = DEPLOY:  FAIL
```

먼저 `git status` 를 봤다. 다른 세션의 변경이 그대로 남아 있다:

```text
 M prototype/v2-three/index.html
 M prototype/v2-three/js/main.js
 M prototype/v2-three/js/pop-sculpture.js
?? prototype/v2-three/js/pop-metric-menu.js
```

번들을 다시 만들지 않았다. 만들면 그 미완성 코드가 `v2-deploy` 에 박힌다.

§11 탭 의도는 양쪽 다 정상:

```text
tabIntent            소스 3 · 번들 3
setTimeout(reassert) 소스 0 · 번들 0
```

공개 빌드는 새로 만들었다(배포하지 않았다):

```text
build/public-app   복사 2 · 삭제 0 · 지문 e7b3a6e9ba47b1b8
매니페스트         3,598 파일 · e7b3a6e9…4687dc91
  .sql / .py / .sh   0건
  forbidden_class    0건
```

## 6. BROWSER

```text
1440 KO   PASS      1440 EN   PASS
 375 KO   PASS       375 EN   PASS
```

각 칸에서 확인: 지구 렌더 · 메뉴 · 가로 넘침 0 · 요소 넘침 0 · 언어 전환.

시뮬레이션은 **실제로 눌렀다**:

```text
시뮬레이션 → 태풍 시나리오 → 시나리오 시작 →
  태풍 시뮬레이션 · 카테고리 3 (최대풍속 ~53 m/s) · 눈까지 거리 35 km
  라벨 "SCENARIO — 공식 예보 아님" · SIMULATION_ONLY
```

쓰나미 시뮬은 지금 화면에 **입구가 없다**. 대상 사건이 있어야 나오고
(`events/tsunami*.json` 없음 · 도달시간 엔진은 대상이 없으면 404),
지금은 대상 사건이 없다. 없는 것을 눌렀다고 적지 않는다.

```text
CONSOLE   우리 것 0
          외부 2  (s3.amazonaws.com/elevation-tiles-prod 지형 타일 403 — 서드파티)
OVERFLOW  0
```

## TESTS

```text
TOTAL   474
PASS    474
FAIL    0

  report-engine + _shared 시험    289   (+29 INTEGRATION-8 쓰기 경로)
  distribution                     71
  cyclone-analog + lab-events + _shared  69
  npm (mjs)                        45
```

> `aws/distribution` 과 `aws/report-engine` 을 **한 번에** 돌리면 모듈 이름이 부딪혀
> 50건이 깨진다(둘 다 `handler.py` 를 갖는다). 앞 단계와 같이 따로 돌린다. 새 문제 아니다.

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

| 조건 | 상태 |
|---|---|
| LIVE_FORBIDDEN = 0 | ❌ **95** (삭제 권한 없음) |
| PUBLIC_WRITE_PATH 전수 · DENY 0 | ✅ 264 지점 · 값 추적 |
| UNKNOWN_DESTINATION = 0 | ✅ 5건은 사람이 읽고 근거를 적었다 |
| UNKNOWN_PUBLIC_WRITE = 0 | ✅ 모르는 접두사는 거부 |
| AUTO_APPROVAL = 0 | ✅ |
| UNVERIFIED_VISUAL_PUBLIC = 0 | ✅ |
| REPORT E2E | ✅ 11/11 (새로 찍은 그림으로) |
| **REPORT 발행 경로 읽기 가능** | ❌ **`reports/` 가 공개 읽기 정책 밖** |
| MEDIA E2E | ✅ (VIDEO 는 NOT_AVAILABLE) |
| SOURCE = DEPLOY | ❌ 다른 세션 미커밋 |
| BROWSER 4/4 · OVERFLOW 0 | ✅ |
| UNRELATED = 0 | ✅ |

## BLOCKERS

1. **공개 금지 객체 95건.** `s3:DeleteObject` 권한 없음 → [블로커](integration-8-production-blocker.md)
2. **`reports/` 가 공개 읽기 정책에 없다.** 발행해도 앱이 못 읽고, UI 는 그것을
   "발행된 보고서 없음"으로 표시한다. 정책 한 줄 · IAM 권한 필요 (신규)
3. **SOURCE ≠ DEPLOY** — 다른 세션의 `PopMetricMenu` 미커밋
4. 영상 엔진 없음 — MEDIA 의 VIDEO 는 `NOT_AVAILABLE`

## HANDOFF

[INTEGRATION-8-HANDOFF.md](INTEGRATION-8-HANDOFF.md)
