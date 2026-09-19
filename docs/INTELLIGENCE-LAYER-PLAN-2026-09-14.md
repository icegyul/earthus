# EARTHUS Intelligence — 현상별 분석 층 개발 계획 (2026-09-14)

개념도(2026-09-14, PD)에 대한 개발 계획이다. 코드는 승인 뒤에 시작한다.
선행 문서: `INTELLIGENCE-DEV-DIRECTIVE-2026-09-05.md`(A~N 완료), `INTELLIGENCE-BENCHMARK-2026-09-05.md`, `INTELLIGENCE-EXEC-REPORT-2026-09-05.md`.

## 0. 한 줄 판단

개념도가 요구하는 것은 새 AI 기능이 아니라 **"현상 하나를 고르면 CURRENT → CHANGE → ANOMALY → PATTERN → INTELLIGENCE(WHY·WHAT NEXT·IMPACT·RELATED·REPORT) 순서로 읽히는 띠"**다.
09-05 작업은 이 띠를 **사건(태풍) 단위·우측 패널**에 만들었다. 이번 일은 그 부품을 **현상 단위·현상 문맥 자리**로 옮기고, 태풍 밖 현상으로 넓힐 수 있게 계약을 일반화하는 것이다.

이미 있는 것 → 그대로 쓴다:

| 개념도 항목 | 있는 부품 | 위치 |
|---|---|---|
| 상태 규약(못 답하면 이유) | SIM_STATUS 5종 | `prototype/v2-three/js/sim-questions.js` |
| 진리 배지 | EVIDENCE_KIND 10종 · LAYER_TRUTH 89레이어 · SLA 신선도 | `js/earthus2/v02/core/constants.js`, `engine-bridge.js` |
| 사건 패킷(회차·변경·중요이유·신뢰·불확실) | `ocean/cyclone-events/{id}.json` 3시간 주기 | `aws/cyclone-analog/handler.py` |
| 과거 비교 | 유사 태풍 세기(건수 앞·5건 미만 퍼센트 금지) | 같은 파일 |
| 문맥 인식 질문 · 도구 제안 · 게이트 | `ask-earth.js` + `aws/earthus-llm` 규칙 1~6 | |
| 기후값 | SST 일별 366장, 한국 바람 일별 시계열 | `aws/climatology/` |
| 시계열 보관(관측/사건/예보 분리) | `archive/` Hive 파티션 JSONL | `aws/archiver/` |
| 교차도메인(인과 금지·추세 제거 상관) · 중요도(위험 아님) | report-engine crossdomain/significance | `aws/report-engine/` |
| 보고서 발행 사슬 | report-engine → publisher → `reports/published/` | |

없는 것 → 만든다:

1. 현상별 **인텔 패킷 계약**(태풍 패킷의 일반형)과 그것을 쓰는 Lambda
2. 현상별 **질문 레지스트리**(`intel-questions.js`, sim-questions의 자매)
3. **평년값·변화** 산출(기후값이 있는 현상부터)
4. **현상 연결표**(`phenomenon-relations.js`)
5. 셸의 **분석 띠** 렌더러
6. report-engine의 **현상 보고서 종류**

## 1. 설계 원칙 (개념도에서 채택 · 정정)

- Intelligence는 1차 메뉴가 아니다. 현상 문맥(현재 `simQuestionsHtml`이 그려지는 자리) 아래에 띠로 붙는다. 우측 패널의 사건 피드는 그대로 둔다(사건 단위 재방문 표면).
- 배지 어휘는 EVIDENCE_KIND 하나. 개념도의 VERIFIED/INFERENCE/UNCERTAIN을 새 어휘로 만들지 않는다. UNCERTAIN은 종류가 아니라 `confidence` 필드의 낮은 값이다.
- WHY는 "원인"이 아니라 **함께 나타난 조건**이다. 조건마다 배지가 붙고, 교과서 관계는 `reference`로 따로 표시한다. 인과 문장 생성 금지(지시서 J·report_contract FORBIDDEN_CAUSAL)는 그대로다.
- RELATED·IMPACT는 **레지스트리에 있는 현상 사이의 연결표**로만 만든다. 연결마다 `computed / co_located / reference` 중 하나. 자료 없는 연결(전력·농업·건강)은 표에 넣지 않고, 물으면 `not_available`로 이유를 말한다.
- ANOMALY는 평년값이 있는 현상만 켠다. 5° 격자로 한국 도시 평년을 만들지 않는다(격자 vs 실측 규칙).
- CONFIDENCE는 `_confidence(source_n, agreement, freshness)` 같은 정의된 식의 출력만 찍는다. 식이 없는 현상은 칸을 비운다.
- LLM 없이 띠 전체가 동작한다. LLM은 WHY·WHAT NEXT의 **서술**만 맡고, 패킷에 없는 값은 못 말한다(earthus-llm 규칙 1·2·5 그대로).
- 분류는 하나다: 백엔드 능력 = 동사 7개(detect/compare/connect/explain/assess/forecast/simulate)의 상태, 사용자에겐 현상별 질문만.
- 메뉴 나무·레이어 id는 건드리지 않는다. 조회 키는 레지스트리의 `domain.phenomenon`이다.

## 2. 계약

### 2.1 인텔 패킷 v1 — `intel/{phenomenonId}.json` (+ 사건형은 `intel/{phenomenonId}/{eventId}.json`)

태풍 패킷(`cyclone-events`)의 필드를 상위 계약으로 올린다. 값을 못 만드는 칸은 `null`이 아니라 **칸 자체를 빼고** `coverage`에 이유를 적는다(report-engine 규칙과 동일).

```
{
  "schema": 1, "phenomenonId": "hazards.typhoon", "eventId": "cyclone:1001234" | null,
  "time": { "observedAt", "issuedAt", "retrievedAt" },
  "current":  { "values": [{ "key","value","unit","kind"(EVIDENCE_KIND),"source","at" }] },
  "change":   { "windows": { "1h","6h","24h","7d" }, "items": [{ "key","delta","from","to","kind" }] },
  "anomaly":  { "baseline": { "name","source","period" }, "items": [{ "key","value","baseline","delta","percentile" }] },
  "pattern":  { "motion","spread","persistence" },
  "conditions": [{ "key","value","kind","source" }],            // WHY 재료 — 인과 아님
  "related":  [{ "phenomenonId","relation"(computed|co_located|reference),"evidence" }],
  "importance": { "reasons": [], "inputs": {} , "note": "점수 아님" },
  "confidence": { "grade","inputs" } , "uncertainty": { ... },
  "sources": [{ "id","kind","ageMin","slaMin","state" }],
  "coverage": { "missing": [{ "section","reason" }] }
}
```

### 2.2 질문 레지스트리 — `prototype/v2-three/js/intel-questions.js`

`SIM_CAPABILITIES`와 같은 꼴. 현상 키마다 질문 5종(why·next·impact·related·report)과 **상태 계산 규칙**: 패킷의 해당 절이 있으면 `available`, 절이 `coverage.missing`에 있으면 `not_available`(이유 동봉), 패킷 자체가 없으면 `not_evaluable`. 액션 이름은 `intel-q`. 시험이 레지스트리·패킷 스키마·`main.js` 분기 이름을 대조한다.

### 2.3 연결표 — `prototype/v2-three/js/phenomenon-relations.js`

`{ from, to, relation, evidenceRef }` 목록. `computed`는 report-engine crossdomain의 `rDetrended` 판정이나 사건 패킷의 거리 판정(특보구역 ≤350 km)만 인정. `reference`는 문헌 표기와 함께 화면에 "교과서 관계"로만.

## 3. 단계와 완료 기준

보고 형식은 09-05 지시서와 같다: 코드 / 실제 데이터 / 로컬 / 운영 / 실기기 다섯 칸.

| 단계 | 내용 | 산출물 | 완료 기준 |
|---|---|---|---|
| **P0 계약** | 패킷 스키마·질문 레지스트리·연결표 파일과 시험. 화면 변경 없음. `phenomenon-registry`의 `intelligence:true` 66건 재감사(패킷 만들 자료가 있는 것만 true) | `aws/_shared/intel_contract.py`, `intel-questions.js`, `phenomenon-relations.js`, `tools/earthus-v53/intel-questions.test.mjs` | 시험 통과 · 감사표(true→false 내려간 현상 목록) |
| **P1 태풍 끝까지** | 기존 `cyclone-events` 패킷을 v1 계약으로 승격. 추가: `anomaly`(IBTrACS 같은 달·같은 해역 강도 백분위 — 이미 보관 중인 `ibtracs-wp.json`으로 계산), `pattern`(회차 간 이동속도·가속), `conditions`(경로 아래 SST 기후값 대비, 기관 일치도), `related`(특보구역·파고·해수온 co_located). 셸 띠 렌더러 `intel-strip.js`: 현상 문맥에 CURRENT/CHANGE/ANOMALY/PATTERN 카드 + 질문 5개 | Lambda 갱신, `intel-strip.js`, `ui-shell.js` 한 곳 삽입, `main.js` `intel-q` 분기 | 운영 /v2에서 태풍 고르면 띠 표시 · 5 질문 중 report 제외 4개 available · 금지 단어 시험(`test_lab_wording`) 통과 |
| **P2 변화·평년 창고** | (a) `intel/change/{layer}.json`: archiver가 이미 쌓는 관측(부이·태풍·태양·바람격자)에서 1h/6h/24h/7d 델타 롤업 Lambda. (b) 기후값 확장: SST(있음) → 한국 ASOS 30년 평년(기상자료개방포털 평년값 API, 도시 단위만) → 파고(Open-Meteo Marine 자체 아카이브 누적, 1년 뒤 사용 가능 표기) | `aws/intel-rollup/`, `aws/climatology/build_kma_normals.py` | 롤업 파일 생성 주기 확인 · 평년 출처·기간이 패킷 `baseline`에 찍힘 |
| **P3 현상 2·3** | `ocean.sst`(평년 있음 → ANOMALY 실값), `hazards.earthquake`(lab-events RJ 기준선 → PATTERN·NEXT, USGS 30일 → CHANGE). 같은 띠·같은 질문 레지스트리로 렌더 | 패킷 Lambda 2종 | 세 현상이 코드 분기 없이 같은 렌더러로 표시 |
| **P4 서술** | `earthus-llm` 스냅샷에 패킷 동봉. WHY 답은 `conditions`만, WHAT NEXT는 `sources` 중 FORECAST 종류만 인용. 규칙 7 추가: "패킷 `coverage.missing`에 있는 절은 없다고 말한다" | Lambda 프롬프트·스키마 | 게이트 시험(재료 없는 WHY → insufficient) |
| **P5 보고서** | report-engine에 `phenomenon-intel` 종류. 패킷 → 절 구성 → 서술 → 검증 → 발행 사슬 | `aws/report-engine/sections.py` 확장 | `reports/published/`에 한 건 · 색인 갱신 |
| **P6 넓히기** | 나머지 현상은 P0 감사표 순서대로. 자료 없는 현상은 띠가 "CURRENT만" 보이고 나머지 질문은 이유와 함께 잠김 | | 현상별 5칸 표 |

착수 순서: P0 → P1 → P2(a) → P3 → P4 → P2(b) → P5 → P6.
P1이 끝나면 개념도 13절 화면이 태풍 하나에 대해 그대로 나온다. P2(b) 평년값은 외부 API 계약이라 뒤로 뺐다.

## 3.1 요금제 대응 (정본: `PRODUCT-STRUCTURE-AND-TIERS-2026-09-14.md`)

- 띠의 CURRENT·CHANGE·기관 예보·특보 = FREE. ANOMALY·PATTERN·WHY·RELATED·IMPACT(FOR ME)·Confidence = EXPLORER(FREE 는 결과 일부 노출).
- P5 보고서 = EXPLORER. 잠금 화면은 안에 무엇이 있는지 목록으로 먼저 보여준다.
- 띠에서 시뮬레이션으로 넘어가는 질문(sim-q)과 결과 재해석 = PRO. 09-07 분할(Confidence·변화 추적 = 셋째 단)은 폐기됐다.

## 4. 하지 않을 일

- 새 1차 메뉴 INTELLIGENCE · 빈 채팅창 · "AI 분석" 유료 벽 · 확률/피해/대피 문장(09-05 J 그대로)
- 인과 사슬 서술(개념도 5절 예시 "고기압→일사→정체")을 데이터 없이 생성하는 것
- 도메인 밖 영향(전력·농업·건강) 표시
- 정의된 식 없는 CONFIDENCE 소수
- 메뉴 나무 재편·레이어 id 개명

## 5. 주의

- 작업 트리에 `main.js`·`ui-shell.js`·`sim-questions.js` 미커밋 변경(국가 문맥 질문 등)이 있다. 다른 세션의 hunk이므로 내 변경만 골라 커밋한다(부분 커밋 규칙).
- 배포는 v2-three → v2-deploy 거울, `app/v2/` 디렉터리 키, `earthus-llm` AWS_IAM 세 함정 그대로.
