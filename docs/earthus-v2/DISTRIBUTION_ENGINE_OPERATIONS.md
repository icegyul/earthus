# EARTHUS 배포 엔진 — 운영 문서

| 항목 | 값 |
|---|---|
| 작성일 | 2026-09-08 |
| 대상 | `aws/distribution/` · `prototype/distribution.html` |
| 상태 | 후보 생성 · 검증 · 미리보기 · MOCK 발행까지 동작. LIVE 발행은 기존 `social-admin` 이 담당 |

---

## 0. 한 문장

**지구 자료에서 SNS 후보를 만들고, 모든 숫자가 출처에 실재하는지 확인하고, 사람이 올릴 수 있게 넘긴다.**
이 엔진은 아무것도 게시하지 않는다.

---

## 1. 왜 자동 게시가 없는가

기존 `aws/social-draft/handler.py` 가 이미 내린 결정을 그대로 유지한다:

> 공개 게시는 되돌릴 수 없다. 화면의 오류는 고치면 되지만 게시물은 이미 퍼진다.
> 실제로 하루 만에 NHC 경도 부호 오류(동태평양 허리케인이 서태평양에 찍힘)와
> 파고를 최대가 아니라 평균으로 보여준 오류(2.3배 축소)를 찾았다.

그래서:
- 후보 생성 Lambda 에 게시 경로가 **없다**
- 배포 관리 화면에 게시 버튼이 **없다**
- 어댑터의 LIVE 모드는 전송 경로가 주입되지 않으면 `TRANSPORT_NOT_CONFIGURED` 로 끝난다
- 큐는 `APPROVED` 상태의 콘텐츠만 받는다

`tools/test_distribution_reporting.mjs` 가 이 세 가지를 매번 확인한다.

---

## 2. 파이프라인

```
ocean/lab-reports.json (사건 분석 보고서 218건)
wind/series/verify-daily.json (예보 채점)
        │
        ▼  sources/*.py — 원문을 우리 어휘로 옮긴다. 숫자를 만들지 않는다
     후보(candidate)
        │
        ▼  eligibility.py — 자격·우선순위·신뢰도·안전등급을 근거와 함께 판정
     마스터 콘텐츠 (content_contract.make_content)
        │
        ├─ caption.py    구조화 캡션 (관측/분석/해석 3분법)
        ├─ hashtags.py   통제 목록에서만
        ├─ visual.py     카드 사양 + 카메라 (그림은 브라우저가 그린다)
        │
        ▼  sns_adapters/ — 플랫폼 판 파생. 숫자를 다시 만들지 않는다
     플랫폼 판 5종
        │
        ▼  validation.py — 숫자·날짜·인과·예측·고아참조·출처사슬 검사
     검증 실패 → eligibility 를 BLOCKED 로 되돌린다
        │
        ▼  events/distribution-content.json
     배포 관리 화면 → 사람 → studio.html → social-admin → 실제 게시
```

---

## 3. 명령

```bash
# 후보 목록 (오늘 갱신된 사건)
python aws/distribution/cli.py daily --limit 8 --out out/

# 주간
python aws/distribution/cli.py weekly --out out/

# 사건/현상 하나
python aws/distribution/cli.py event --id earthquake:us6000tgb9

# 예보 성적표 (기온·바람 — 유일한 완전 루프)
python aws/distribution/cli.py scorecard --period 2026-08

# 리포트에서 SNS 후보
python aws/distribution/cli.py from-report --report out/report_2026-08.json

# 검증 · 미리보기 · 모의 발행 · 감사
python aws/distribution/cli.py validate --content out/CNT-2026-000001.json
python aws/distribution/cli.py preview  --content out/CNT-2026-000001.json --platform x
python aws/distribution/cli.py publish  --content out/CNT-2026-000001.json --platform x --mode MOCK
python aws/distribution/cli.py audit    --content out/CNT-2026-000001.json

# 플랫폼 능력표 (관리 화면이 버튼을 그릴 때 쓰는 표)
python aws/distribution/cli.py capabilities

# 관리 화면용 색인을 로컬에 만든다 (배포 없이 화면을 볼 수 있다)
python aws/distribution/handler.py --out prototype
```

---

## 4. 배포

```bash
# Lambda 로 올릴 때 함께 담아야 하는 것
aws/distribution/**          (sns_adapters/ · sources/ 포함)
aws/_shared/content_contract.py
aws/_shared/provenance.py
aws/_shared/report_contract.py
aws/_shared/report_period.py
aws/report-engine/adapters/kma_verify_adapter.py   # verify_scorecard 가 파일 경로로 읽는다

# 환경변수
CACHE_BUCKET=earthus-cache-kr
CACHE_REGION=us-east-2
DIST_MAX_DAILY=8            # 하루에 만들 후보 수 (사람이 볼 수 있는 만큼만)
EARTHUS_APP_BASE=https://earthus.net
```

일정은 `publish_queue.SCHEDULES` 가 정본이다. **이 표는 언제 만들지를 정한다. 언제 올릴지가 아니다.**

---

## 5. 검증기가 실제로 막는 것

| 코드 | 무엇을 막나 |
|---|---|
| `NUMBER_NOT_IN_SOURCE` | 출처 어디에도 없는 숫자 |
| `DATE_NOT_IN_SOURCE` | 출처 메타데이터에 없는 날짜 |
| `UNSUPPORTED_CAUSALITY` | 승인된 분석 없이 쓴 "때문에" |
| `UNSUPPORTED_PREDICTION` | 우리가 생산하지 않는 예보 (`-ㄹ 것이다` 를 문법으로 잡는다) |
| `SENSATIONAL_LANGUAGE` | "사상 최악" 류 |
| `NO_SOURCE` | 출처 없는 관측 문장 |
| `ORPHAN_REFERENCE` | 없는 팩트를 가리키는 문장 |
| `CONFIDENCE_WITHOUT_REASON` | 이유 없는 신뢰도 |
| `BROKEN_PROVENANCE` | 출처를 풀 수 없는 자료 |
| `UNRESOLVED_PLACEHOLDER` | TODO 가 남은 글 |
| `INVALID_LOCATION` | 범위 밖 좌표 |
| `PLATFORM_INVALID` | 한도 초과 · 지원하지 않는 형식 |

### 숫자 풀 — 무엇이 "출처에 있는" 숫자인가

세 곳에서만 온다:
1. 팩트의 **값**과 **지표 이름** (`"여진 M3+ / M4+"` 의 3·4 도 원문 글자다)
2. 기간 경계
3. 어댑터가 **원문 그대로**라고 명시한 문자열(`sourceTexts`) — 기관이 준 제목·헤드라인

> ⚠️ **생성된 글에서는 풀을 만들지 않는다.** 만들면 지어낸 숫자가 스스로를 인가한다.
> `test_생성물로_숫자_풀을_만들지_않는다` 가 이것을 지킨다.

반올림은 허용하고(1.35 → 1.4) **자릿수 변경은 허용하지 않는다**(6.3 → 63 은 거부).

---

## 6. 자격 판정 산식

`eligibility.SIGNALS` 가 그대로 산식이다. 가중치 합으로 나누지 않고
**알 수 있는 기준의 가중치로만 정규화**한다 — 자료가 없는 기준이 0점으로 순위를 끌어내리지 않게.

| 기준 | 가중치 |
|---|--:|
| 규모 | 0.25 |
| 평년 대비 | 0.15 |
| 영향 범위 | 0.15 |
| 지속 | 0.10 |
| 새로움 | 0.05 |
| 공적 관련성 | 0.15 |
| 자료 완결성 | 0.15 |

우선순위 경계: P0 ≥ 0.80 · P1 ≥ 0.62 · P2 ≥ 0.45 · P3 ≥ 0.25 · 그 밖 P4.
`BREAKING` 은 한 단계 올린다.

안전등급은 **인명 관련 표현이 있으면 무조건 LEVEL_3(사람만)** 이다. 우선순위가 낮아도 그렇다.

---

## 7. 지금 못 하는 것 (그리고 왜)

| 못 하는 것 | 이유 |
|---|---|
| 자동 게시 | 설계상 만들지 않았다(§1). 자격증명은 `social-admin` 볼트에만 있다 |
| 파이썬에서 LIVE 발행 | 토큰이 두 곳에 살게 된다. 전송 경로를 주입해야만 가능 |
| 실제 카드 이미지 생성 | Lambda 에 한글 폰트가 없고, 지구 장면은 Three.js 씬 안에만 있다. 사양만 만들고 브라우저가 그린다 |
| 성과 지표 수집 | 발행한 게시물이 없다. 구조는 있고 값이 없다 — 0 으로 채우지 않는다 |
| 평년 대비 이상 판정 | 사건 이력의 기후값이 없다 |
| 해석(INTERPRETED) 문장 자동 생성 | 승인된 분석 메타데이터 없이는 만들지 않는다. 사람이 붙인다 |

---

## 8. 알아 둘 함정

1. **`aws/distribution/sns_adapters` 와 `aws/report-engine/adapters` 는 다른 패키지다.**
   처음에는 둘 다 `adapters` 였고 서로를 가렸다(`ImportError`). 이름을 나눠 해결했다.
   두 엔진을 같은 프로세스에서 쓸 때 `sys.path` 에 둘 다 넣어도 이제 안전하다.

2. **`publish_queue.py` 는 `queue.py` 가 아니다.** 표준 라이브러리 `queue` 를 가린다.

3. **`prototype/events/distribution-content*` 는 로컬 미리보기 산출물이다.** `.gitignore` 에 있다.
   운영 정본은 S3 의 같은 키다.

4. **후보 색인은 공개 S3 경로에 쓴다** (`events/` — 기존 `social-drafts.json` 과 같은 자리).
   미발행 초안이 공개적으로 읽힌다는 뜻이다. 기존 관행과 같지만, 비공개가 필요하면
   `INDEX_KEY`·`BODY_PREFIX` 를 `analysis/` 접두사로 바꾸고 관리 화면이 서명 URL 로 읽게 해야 한다.

5. **사건 시각과 추적 기간은 다르다.** `lab-reports` 의 `detectedAt` 은 우리 계산기가
   처음 본 때다. 사건 시각은 `detail.timeline[0].at` 에 있을 때만 쓴다.
   섞으면 7월 지진이 9월에 난 것처럼 나간다(실제로 그렇게 나왔다).

---

## 9. 시험

```bash
python -m unittest discover -s aws/distribution/tests -p "test_*.py"   # 71건
node --test tools/test_distribution_reporting.mjs                      # 9건
```

`test_distribution.py` 의 `FactTests` 가 §117 이다 — **일부러 틀린 입력을 넣고 거부되는지 본다.**
지어낸 숫자·날짜, 출처 없는 관측, 고아 참조, 이유 없는 신뢰도, 근거 없는 인과와 예측을 전부 넣는다.
