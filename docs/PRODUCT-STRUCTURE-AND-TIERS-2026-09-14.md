# EARTHUS 제품 구조·요금제 정본 (2026-09-14)

PD 확정 2026-09-14. 이 문서가 요금제의 최신 정본이다. 09-06·09-07의 요금제 정의(FREE/EXPLORER/INTELLIGENCE, BUSINESS 소비자 사다리 밖 B2B, 09-07 분할)는 이 문서로 대체된다.
바뀌지 않은 것: 과금 id·상품 코드·가격(billing.sql), Paywall 원칙(기관 발표 전부 무료), 유료 유도 문법(메뉴마다 다음 질문 하나, 배너 금지), 개인→기업 개발 순서.

## 1. 제품 구조 — 4층

```
DATA          지구에서 지금 무슨 일이 일어나는가          (실제 지구 데이터, 3D Living Earth)
INTELLIGENCE  그 현상이 무엇을 의미하는가                 (WHAT·CHANGE·ANOMALY·WHY·RELATION·IMPACT·FORECAST)
SIMULATION    조건을 바꾸면 어떻게 되는가                 (SCENARIO → 계산 → RESULT)
REPORT        분석·시뮬레이션 결과를 가져갈 수 있는 형태로 (별도 지능층 아님, 출력층)
```

순환: DATA → INTELLIGENCE → (REPORT | SCENARIO → SIMULATION → RESULT → INTELLIGENCE → REPORT).

규율(기존 그대로):
- 배지 어휘는 `EVIDENCE_KIND` 10종 하나. Truth/Inference/Model/Simulation 은 화면 묶음일 뿐이다.
- FORECAST 는 기관 예보 인용 + EARTHUS 기준선(§M). 자체 예보를 만들지 않는다.
- IMPACT 는 FOR ME 와 같은 것이다. 별도 기능으로 만들지 않는다.
- WHY 는 "함께 나타난 조건". 인과 문장·피해 문장·확률 생성 금지(09-05 지시서 J).
- Simulation 결과 해석 = SIMULATION 배지 숫자 + 기준선 대비 차이 + 입력 기여. 시뮬레이션이 세지 않은 영향은 말하지 않는다.

## 2. Simulation 3분법

| 종류 | 정의 | 지금 있는 것 | 요금 |
|---|---|---|---|
| Visual | 데이터가 시간에 따라 움직이는 것을 보여준다 | 태풍 트랙 재생·바람 입자·해류·위성 궤도·연출용 파도 표현 | FREE (시뮬레이션이라 부르지 않는다) |
| Scenario | 사용자가 조건을 바꾼다 | 태풍 가정 실험 baseline(§F: 풍속 ±15 m/s·눈까지 거리, baselineEventId 기록) | PRO |
| Physics | 물리 모델로 계산한다. 09-05 §N 다섯 기준(교과서 물리·입력 보유·독립 채점·CPU 초 단위·안전 판단 승격 금지)을 모두 만족하는 것만 | 쓰나미 도달시간(aws/tsunami-eta, SIMULATION_ONLY) | PRO |

Physics 후보와 순서는 §N 그대로: 쓰나미 도달시간(있음) → 표류(ADR-001) → 여진 시퀀스 → 재진입·위성 → 황사·연기 궤적 → 해수면 노출 셈(SIMULATION_ONLY).
개념도의 강수→침수 면적·빙하 +2°C 는 수문·빙하 파이프라인이 없어 후보가 아니다. 해수면 +1 m 는 §N 6번으로만 한다.

## 3. 요금제

### 소비자 (CONSUMER)

| | FREE | EXPLORER | PRO |
|---|---|---|---|
| 한 문장 | 지구를 본다 | 지구를 이해하고 분석하고 보고서를 만든다 | 지구의 조건을 바꾸어 시뮬레이션한다 |
| 사용자의 질문 | "지금 뭐지?" | "왜 이런 거지?" "정리해서 보고 싶다" | "조건을 바꾸면?" "실제로 계산해 보자" |
| Living Earth · 기본 데이터 | ✓ | ✓ | ✓ |
| 기본 Intelligence(WHAT·CHANGE·기관 예보·특보) | ✓ | ✓ | ✓ |
| 고급 Intelligence(ANOMALY·WHY·RELATION·IMPACT/FOR ME·Confidence·변화 추적·과거 비교) | 제한(결과 일부 노출) | ✓ | ✓ |
| Ask Earthus | 기본(한도) | ✓ | ✓ |
| REPORT | — | ✓ | ✓ |
| SCENARIO · SIMULATION · 결과 해석 | — | — | ✓ |

두 경계: **EXPLORER = Report**, **PRO = Simulation**.
API 는 소비자 요금제에 넣지 않는다.

### 전문 (PROFESSIONAL) — 별도 계약, 소비자 사다리의 위 단계가 아니다

| | RESEARCH | ENTERPRISE |
|---|---|---|
| 한 문장 | EARTHUS 를 연구에 활용한다 | EARTHUS 를 기업 시스템에 연결한다 |
| 내용 | 연구용 접근·대규모 Simulation·연구용 Export/API·프로젝트 지원 | API · DATA/INTELLIGENCE/SIMULATION 을 기업 서비스 안에서 사용 |
| 가격 | 계약 | 계약 |

09-06 의 BUSINESS(항만 자산등록부·임계값·알림, 50자산 ₩490,000/월 가설)는 **ENTERPRISE 의 첫 제품**으로 옮긴다. 엔진은 FOR ME 와 같고(개인 1위치 = 기업 다수 자산), 개발 순서 개인 → 기업은 그대로다. Custom Run 은 ENTERPRISE 안에서 API 뒤에 온다.
RESEARCH 는 원자료 판매가 아니다(09-06 ⑤ 유지). 파는 것은 계산·시뮬레이션 접근이다.

## 4. 구현 대응표 — 이름은 바꾸고 id 는 안 바꾼다

| 화면 이름 | 과금 id (billing.sql) | 상품 코드 | 가격 | entitlement RANK |
|---|---|---|---|---|
| FREE | (없음) | — | 0 | FREE 0 |
| EXPLORER | `explorer` (레거시 `paid` 동치) | earthus.pro.monthly/yearly | ₩9,900 / ₩99,000 | PLUS 1 |
| PRO | `intelligence` | earthus.intelligence.monthly/yearly | ₩29,000 / ₩290,000 | CONTROL 2 |
| ENTERPRISE(B2B) | 계약 | — | — | BUSINESS 3 (add-on 자리) |

⚠️ `tier in ('explorer','intelligence')` 체크와 레거시 `paid` 는 그대로 둔다. id 를 바꾸면 기존 구독자가 무료로 떨어진다(access-mode.js 경고).
⚠️ PRO 표시명은 09-02 에 뗀 "EXPLORER PRO / INTELLIGENCE PRO" 접미사와 다르다. 접미사는 다시 쓰지 않는다. 셋째 단의 이름이 PRO 다.

## 5. 정합해야 할 곳 (후속 작업, 코드 승인 뒤)

| 대상 | 무엇을 | 비고 |
|---|---|---|
| `prototype/js/earthus2/v02/paid/entitlement.js` | 탭 권한: COMPARE·EVIDENCE 를 CONTROL → PLUS 로. SCENARIO 는 CONTROL 유지 | Intelligence 전체가 EXPLORER 로 내려온 결과 |
| `prototype/js/access-mode.js` | 사다리 주석: INTELLIGENCE → PRO "SIMULATE THE EARTH". TIER 상수 id 는 유지 | 다른 세션의 미커밋 변경 있음, 내 hunk 만 |
| `prototype/v2-three/js/i18n.js` whyPro·nextPro | "EXPLORER PRO —" 문구 제거. WHY/NEXT 는 EXPLORER 영역이므로 잠금 문구 자체를 EXPLORER 기준으로 | |
| `prototype/supabase/billing.sql` 주석 | 53행 "INTELLIGENCE 월 ₩49,000" 오기 → 실제 상품행은 29,000. 주석만 정정 | 값은 안 바꿈 |
| `docs/pricing-plan.md`, `docs/earthus-v2/subscription-capability-map.md` | 이 문서를 가리키고 표를 교체 | |
| `docs/MARITIME-INTELLIGENCE-PRODUCT-SPEC-2026-09-06.md` | BUSINESS → ENTERPRISE 첫 제품으로 표기 | |
| `docs/FOR-ME-DEV-DIRECTIVE-v2.0-2026-09-07.md` §7 | 09-07 분할(Confidence·변화 추적 = 셋째 단) 폐기 → EXPLORER | |
| `docs/INTELLIGENCE-LAYER-PLAN-2026-09-14.md` | P5 보고서 = EXPLORER, 시뮬레이션 연결 = PRO 로 표기 | 이 문서에서 반영함 |
| v5.3 §1.4 | 정본 사다리 문구를 이 문서로 갱신 | |

## 6. 알려진 제약

PRO 가 오늘 팔 수 있는 것은 쓰나미 도달시간 1건 + 태풍 가정 실험 1건이다. PRO 의 상품 가치는 §N 후보가 채워지는 속도에 달려 있다. 이것은 결정을 바꿀 이유가 아니라 개발 순서의 근거다: Intelligence 층(EXPLORER 가치) 다음이 §N 물리 시뮬레이션(PRO 가치)이다.
