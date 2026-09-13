# TRUTH VOCABULARY — 정본 통합 설계

작성 2026-09-13 · PHASE 2-1 · 대상 `earthus-v2/real-living-earth-render` @ `3c577d15`
선행 문서 [V3_UNIFIED_ENGINE_INTEGRATION_AUDIT.md](V3_UNIFIED_ENGINE_INTEGRATION_AUDIT.md)

이 문서는 **설계만** 담는다. 코드는 아직 고치지 않았다.
모든 수치는 이 세션에서 파일을 파싱해 얻었다.

---

## 0. 결론 먼저

### 0.1 축을 셋으로 나눈다 (지시서 요구 + 기존 필수축 보존)

```
TRUTH_STATUS   무엇으로서 참인가        FACT CORROBORATED REPORTED CLAIM
                                        INFERRED FORECAST SIMULATION UNKNOWN   (8)
SOURCE_KIND    어디서 왔는가            OFFICIAL OBSERVATION SATELLITE
                                        NEWS OSINT MODEL                        (6)
DATA_STATE     지금 살아 있는가          LIVE DEGRADED STALE UNAVAILABLE         (4)
```

보조축 둘은 **이미 저장소에 있다.** 새로 만들지 않고 그대로 쓴다.

```
TIME_MODE       LIVE FORECAST HISTORY SCENARIO        (v02/core/constants.js, 기존)
TRUTH_FIDELITY  NONE SUMMARY AGGREGATE GRID GEOMETRY
                PROBABILISTIC_VOLUME PRECISION       (v02/core/constants.js, 기존)
```

`TRUTH_STATUS` 와 `SOURCE_KIND` 는 **저장소 전체에서 쓰이지 않는 이름이다**(실측: 0 파일).
그래서 이 둘을 새 심볼로 도입해도 기존 어떤 것도 덮어쓰지 않는다.

### 0.2 이름 충돌 1건 — 결정 필요

지시서는 6종 축의 이름을 `EVIDENCE_KIND` 라고 했다. 그런데 **그 이름은 이미 두 번 쓰였다.**

| 이름 | 위치 | 값 | 묶여 있는 것 |
|---|---|---|---|
| `EVIDENCE_KIND` | `prototype/js/earthus2/v02/core/constants.js:26` | **10종** (OFFICIAL_OBSERVATION … VISUALIZATION_ONLY) | `LAYER_TRUTH` **89항목**, 배지 렌더러 `renderBadge()`·`layerBadge()`, `engine-bridge.js LEGACY_TO_KIND`, Python `truthType` **76곳**, `lab_report.py KIND_TRUTH` 9종 |
| `EVIDENCE_KINDS` | `prototype/js/earthus2/v11/core/contracts.js:2` | **8종** (OBSERVED … SIMULATION) | `requireEvidenceKind()`, `EvidenceGraph.addNode()` 의 필수 검사, v11 테스트 65건 |

`EVIDENCE_KIND` 라는 이름에 **세 번째 뜻**을 얹으면, 같은 런타임에서 같은 단어가 두 가지를
가리키게 된다. 그것이 이번에 없애려는 실패 모양 그 자체다.

**그래서 6종 축의 코드 심볼을 `SOURCE_KIND` 로 제안한다.**
개념 이름은 지시서대로 "EVIDENCE_KIND(어디서 왔는가)" 이고, 값도 지시서가 준 6종 그대로다.
바꾸는 것은 **심볼 하나**뿐이다.

> 근거: `SOURCE_KIND` 는 실측 0 파일(자유). ZIP `types.ts` 의 같은 개념 이름도
> `EVIDENCE_KIND` 가 아니라 **`SourceType`** 이다 — ZIP 자신도 이 축을 "출처 종류"로 불렀다.
> `SOURCE_TYPE` 은 못 쓴다: `weather-contract-v7.js`·`tourism-flow-contract.js`에서
> 서로 다른 값으로 이미 쓰고 있다(실측 3파일).

**대안(기각 권고):** 기존 10종을 `LAYER_EVIDENCE_GRADE` 로 개명하고 `EVIDENCE_KIND` 를 비운다.
→ 89 + 76 + 9 곳을 한꺼번에 고쳐야 하고, 배지 문구 회귀시험이 전부 다시 찍혀야 한다.
기존 구현 보존 원칙과 정면으로 어긋난다.

### 0.3 기존 10종은 버리지 않는다 — **파생층**으로 남긴다

v02 `EVIDENCE_KIND` 10종은 사실 `(SOURCE_KIND × TRUTH_STATUS)` 의 **표시용 곱**이었다.
그래서 지우는 대신 **10행 파생표**를 두고, 기존 값을 입력으로 받아 세 축을 계산한다.
`LAYER_TRUTH` 89항목을 **한 줄도 고치지 않는다.**

---

## 1. 실측 인벤토리 — 저장소 안의 truth/status 어휘 전부

### 1.1 진리·증거 축 (통합 대상)

| # | 심볼 | 파일 | 값 수 | 값 |
|---|---|---|---|---|
| 1 | `EVIDENCE_KIND` | `prototype/js/earthus2/v02/core/constants.js:26` | 10 | OFFICIAL_OBSERVATION, OFFICIAL_FORECAST, OFFICIAL_WARNING, PROVIDER_FORECAST, EARTHUS_ANALYSIS, EARTHUS_FORECAST, ESTIMATED_DISTRIBUTION, SIMULATION, HISTORY, VISUALIZATION_ONLY |
| 2 | `EVIDENCE_KINDS` | `prototype/js/earthus2/v11/core/contracts.js:2` | 8 | OBSERVED, OFFICIAL_FORECAST, OFFICIAL_WARNING, REPORTED, DETECTED, MODELLED, HISTORICAL, SIMULATION |
| 3 | `DATA_CLASS` | `prototype/js/v8/truth-contract.js:1` | 6 | OBSERVED, OFFICIAL_FORECAST, OFFICIAL_WARNING, MODEL_OUTPUT, EARTHUS_DERIVED, SIMULATION |
| 4 | `SOURCE_TYPE` | `prototype/js/weather-contract-v7.js` | 5 | OBSERVED, OFFICIAL_FORECAST, OFFICIAL_WARNING, MODEL_FORECAST, EARTHUS_ESTIMATE |
| 5 | `SOURCE_TYPE` | `prototype/js/tourism-flow-contract.js` | 3 | OFFICIAL_OBSERVATION, OFFICIAL_FORECAST, DERIVED_TREND |
| 6 | `truthType` (필드) | `aws/_shared/provenance.py` 외 | 5 실측값 | OFFICIAL_OBSERVATION(47), EARTHUS_ANALYSIS(26), OFFICIAL_WARNING(1), OFFICIAL_FORECAST(1), UNKNOWN(1) |
| 7 | `KIND_TRUTH` | `aws/distribution/sources/lab_report.py:46` | 9 매핑 | LAB 현상 9종 → v02 어휘 |
| 8 | `truthClass` (필드) | v11/news, greenfield, 기타 | 3 실측값 | NEWS_REPORT, SIMULATION_ONLY, OFFICIAL_NGO_SOURCE |
| 9 | `evidenceKind` (자료 manifest) | `services/research-runtime/research_runtime/datasets.py:17` | 5 | OBSERVATION, ANALYSIS, REANALYSIS, FORECAST, SYNTHETIC_TEST |
| 10 | `status` (사건) | `aws/gdelt-events/handler.py:496` | 2 | confirmed, unconfirmed (+ `placeDoubt` boolean) |
| 11 | `EVIDENCE_LEVELS` | `aws/_shared/report_contract.py:329` | 5 | COINCIDING, ASSOCIATED, CONSISTENT_WITH, CONNECTED, POSSIBLE_INFLUENCE |
| 12 | ZIP `VerificationState` | `engines/src/types.ts` | 8 | FACT, CORROBORATED, REPORTED, CLAIM, INFERRED, FORECAST, SIMULATION, UNKNOWN |

**진리 축이 12종이다** (ZIP 포함). 지시서 감사 때 "넷"이라 적었던 것을 정정한다 — 전수 조사 결과 12종이다.

### 1.2 신선도·가용성 축 (그대로 보존)

| 심볼 | 파일 | 값 |
|---|---|---|
| `DATA_STATE` | `v02/core/constants.js:19` · `v11/core/contracts.js:3` · `tourism-flow-contract.js` | LIVE, DEGRADED, STALE, UNAVAILABLE |
| `DATA_STATE` | `weather-contract-v7.js` | AVAILABLE, MISSING, STALE, ESTIMATED, INVALID, NOT_SUPPORTED, **CONFLICTING** |
| `SOURCE_STATE` | `prototype/v2-three/js/event-room.js:29` | OK, EMPTY, FAILED, STALE, OUT_OF_SCOPE |
| `SOURCE_STATE` | `aws/_shared/provenance.py:20` | ACTIVE, DEGRADED, STALE, UNAVAILABLE, UNKNOWN |
| `DATASET_STATE` | `aws/_shared/report_contract.py:214` | AVAILABLE, PARTIAL, STALE, UNAVAILABLE |
| `slaMin` | `LAYER_TRUTH` 각 항목 | 52항목 숫자 · 37항목 `null`(늙지 않음) |

### 1.3 능력·발행 축 (진리 축이 아니다 — 섞지 않는다)

| 심볼 | 파일 | 값 수 |
|---|---|---|
| `SIM_STATUS` | `v2-three/js/sim-questions.js:18` | 5 (available, limited, not_available, not_evaluable, unavailable) |
| `INTELLIGENCE_STATES` / `MODEL_STATUS` | `v11/core/contracts.js:1` · `v02:92` | 6 (DRAFT SHADOW CANARY ACTIVE ROLLBACK RETIRED) |
| `CONTENT_STATUS` | `aws/_shared/content_contract.py:56` | 9 + 전이표 |
| `PUBLISH_STATES` | `aws/_shared/governance.py:31` | 8 + 전이표 |
| `REPORT_LIFECYCLE` / `REPORT_STATUS` | `aws/_shared/report_contract.py` | 6 / 6 |
| `ELIGIBILITY` / `SAFETY_LEVELS` | `content_contract.py` | 4 / 3 |
| `CONFIDENCE` | `content_contract.py` | 4 (HIGH MEDIUM LOW UNKNOWN) |
| `ACCESS_TIER` / `TIER` / `ACCESS_CLASS` | `v02:39` · `access-mode.js:33` · `v8/truth-contract.js:10` | 4 / 5 / 5 |

⚠️ **이 축들은 진리 축과 통합하지 않는다.** `SIM_STATUS.unavailable`(자료 오류)과
`DATA_STATE.UNAVAILABLE`(자료 없음)은 값 이름이 같지만 다른 층이다. 섞으면 화면이
"엔진 없음"을 "자료 오류"로 말한다.

---

## 2. 정본 3축 정의

### 2.1 `TRUTH_STATUS` (8) — 무엇으로서 참인가

| 값 | 뜻 | 붙일 수 있는 조건 (코드로 검사) |
|---|---|---|
| `FACT` | 기관이 측정·발표한 것 | `SOURCE_KIND ∈ {OFFICIAL, OBSERVATION, SATELLITE}` **그리고** `DATA_STATE ≠ UNAVAILABLE` **그리고** 관측시각이 SLA 안 |
| `CORROBORATED` | 독립 출처 2개 이상이 같은 것을 말한다 | `independenceGroup` 고유 수 ≥ 2 |
| `REPORTED` | 매체가 보도했다. 기관 확인은 없다 | `SOURCE_KIND = NEWS` 단독 |
| `CLAIM` | 누가 주장했다. 검증 전이다 | 출처가 있으나 위 어디에도 안 들어감 |
| `INFERRED` | 우리가 계산해 낸 것 | `SOURCE_KIND = MODEL` **그리고** 산출자가 EARTHUS |
| `FORECAST` | 미래를 말한다 | `TIME_MODE = FORECAST` |
| `SIMULATION` | 가정 위에서 돌린 것 | `TIME_MODE = SCENARIO` 또는 시뮬레이션 실행 산출물 |
| `UNKNOWN` | 모른다. **기본값** | 그 밖 전부 |

규칙:
- **기본값은 `UNKNOWN`** 이다. 승격은 근거가 있을 때만 일어난다.
- `FORECAST` 와 `SIMULATION` 은 `FACT` 로 **승격될 수 없다**(단방향).
- `CORROBORATED` 는 `FACT` 보다 강하지도 약하지도 않다. **다른 축의 사실**이다 —
  `FACT` 는 "기관이 쟀다", `CORROBORATED` 는 "여럿이 독립으로 말한다".
  둘 다인 경우가 있다. 그때는 둘 다 표시한다. 하나로 눌러 담지 않는다.
- 퍼센트를 만들지 않는다. 기존 `CONFIDENCE` 4단계(HIGH/MEDIUM/LOW/UNKNOWN)만 쓴다.

### 2.2 `SOURCE_KIND` (6) — 어디서 왔는가

| 값 | 뜻 | 실제 예 (저장소) |
|---|---|---|
| `OFFICIAL` | 권한 기관의 발표·통보문·특보 | `events/kma-warn.json`, `events/typhoon-official.json`, `events/tsunami-intl.json` |
| `OBSERVATION` | 계측기가 잰 값 | `wind/kma-aws.json`, `ocean/buoys.json`, `wind/gts-global.json`, `events/crustal.json` |
| `SATELLITE` | 위성 관측 | `clouds/**`, `events/wildfire.json`(FIRMS), `land/lst`, `land/seaice` |
| `NEWS` | 매체 보도 | `events/global.json`(GDELT), `events/regional-news.json` |
| `OSINT` | 공개 출처 취합 (기관 아님) | 현재 **없음**. 값은 두되 쓰는 자료가 생길 때 붙인다 |
| `MODEL` | 수치모델·우리 계산 | `wind/global.json`(GFS), `wind/ecmwf-fcst.json`, `ocean/tsunami-eta/*`, `ocean/lab-reports.json` |

**산출자(누가 만들었나)는 어휘가 아니라 자료다.** OFFICIAL / PROVIDER / EARTHUS 를
새 enum 으로 만들지 않는다 — 이미 두 곳에 있다:

- Supabase `provider_registry` · `provider_health` (운영 정본)
- `aws/_shared/provenance.py DATASET_PROVENANCE` (S3 키 → provider·license·collector)

### 2.3 `DATA_STATE` (4) — 지금 살아 있는가

`v02/core/constants.js:19` 와 `v11/core/contracts.js:3` 의 것을 **그대로** 쓴다.
`deriveFreshnessState()`(`v02/core/canonical-signal.js`)가 `slaMin` 과 실제 자료시각으로 유도한다.

⚠️ `weather-contract-v7.js DATA_STATE` 의 `CONFLICTING` 은 4종에 없다.
→ 충돌은 **상태가 아니라 사건**이다. `TRUTH_STATUS` 도 아니다.
→ 충돌은 §2.4 의 별도 플래그로 보존한다(숨기지 않는다 — PHASE 5 요구).

### 2.4 충돌 보존 규칙 (PHASE 5)

출처가 서로 다른 값을 말할 때:

```
conflict = {
  claimId,
  sides: [ { sourceId, value, truthStatus, sourceKind }, … ],   # 2개 이상
  resolved: false
}
```

- 한쪽을 고르지 않는다. 평균내지 않는다. **양쪽을 다 싣는다.**
- 사건의 `TRUTH_STATUS` 는 충돌 중에 `CORROBORATED` 로 올리지 않는다 →
  독립 출처가 둘 이상이어도 **값이 어긋나면** `REPORTED` 에서 멈춘다.
  (ZIP `evidence-engine.ts:classify()` 가 이 규칙을 이미 갖고 있다 — 그 한 줄은 채택한다.)

---

## 3. CANONICAL MAPPING TABLE

### 3.1 v02 `EVIDENCE_KIND` (10) → 정본 3축 — **파생표. 기존 값은 입력으로 남는다**

| 기존 (입력) | `SOURCE_KIND` | `TRUTH_STATUS` | `TIME_MODE` | `TRUTH_FIDELITY` | 비고 |
|---|---|---|---|---|---|
| `OFFICIAL_OBSERVATION` | OFFICIAL | FACT | LIVE | (레이어별) | |
| `OFFICIAL_FORECAST` | OFFICIAL | FORECAST | FORECAST | (레이어별) | |
| `OFFICIAL_WARNING` | OFFICIAL | FACT | LIVE | (레이어별) | **발표된 사실**이다. 내용은 예보여도 "특보가 났다"는 FACT |
| `PROVIDER_FORECAST` | MODEL | FORECAST | FORECAST | (레이어별) | 산출자 = provider_registry |
| `EARTHUS_ANALYSIS` | MODEL | INFERRED | LIVE | (레이어별) | 산출자 = EARTHUS |
| `EARTHUS_FORECAST` | MODEL | FORECAST | FORECAST | (레이어별) | 산출자 = EARTHUS |
| `ESTIMATED_DISTRIBUTION` | MODEL | INFERRED | LIVE | `ESTIMATED_DISTRIBUTION` 은 정밀도 주장이 약하다 → `AGGREGATE` 이하 | |
| `SIMULATION` | MODEL | SIMULATION | SCENARIO | (레이어별) | |
| `HISTORY` | OBSERVATION | FACT | **HISTORY** | (레이어별) | "지금"이라고 말하지 않는 것은 `TIME_MODE` 가 한다 |
| `VISUALIZATION_ONLY` | — (없음) | **UNKNOWN** | LIVE | **`NONE`** | 진리 주장을 하지 않는다. 기존 `TRUTH_FIDELITY.NONE` 이 그 뜻이다 |

무손실 여부: **10종 중 8종은 (SOURCE_KIND, TRUTH_STATUS) 만으로 복원된다.**
`HISTORY` 와 `VISUALIZATION_ONLY` 두 종만 보조축을 함께 봐야 복원된다.
→ 그래서 보조축 2개를 **새로 만들지 않고 기존 v02 것을 쓴다**. 새 어휘 0개.

`SOURCE_KIND` 가 `SATELLITE` 인지 `OBSERVATION` 인지는 기존 10종이 구별하지 않았다.
→ 레이어별로 **자료 출처를 보고** 정한다. `provenance.py DATASET_PROVENANCE` 와
`LAYER_TRUTH` 를 합쳐 1회 채운다(§4 단계 D).

### 3.2 v11 `EVIDENCE_KINDS` (8) → 정본

| 기존 | `SOURCE_KIND` | `TRUTH_STATUS` | `TIME_MODE` |
|---|---|---|---|
| `OBSERVED` | OBSERVATION | FACT | LIVE |
| `OFFICIAL_FORECAST` | OFFICIAL | FORECAST | FORECAST |
| `OFFICIAL_WARNING` | OFFICIAL | FACT | LIVE |
| `REPORTED` | NEWS | REPORTED | LIVE |
| `DETECTED` | OBSERVATION | CLAIM | LIVE | ← 우리 탐지기가 "있다"고 말한 것. 기관 확인 전 |
| `MODELLED` | MODEL | INFERRED | LIVE |
| `HISTORICAL` | OBSERVATION | FACT | HISTORY |
| `SIMULATION` | MODEL | SIMULATION | SCENARIO |

⚠️ `requireEvidenceKind()` 는 그대로 둔다. v11 테스트 65건이 이 8종을 검사한다.

### 3.3 나머지 어휘 → 정본

| 출처 | 기존 값 | → `SOURCE_KIND` | → `TRUTH_STATUS` |
|---|---|---|---|
| `v8/truth-contract.js DATA_CLASS` | OBSERVED | OBSERVATION | FACT |
| | OFFICIAL_FORECAST | OFFICIAL | FORECAST |
| | OFFICIAL_WARNING | OFFICIAL | FACT |
| | MODEL_OUTPUT | MODEL | FORECAST |
| | EARTHUS_DERIVED | MODEL | INFERRED |
| | SIMULATION | MODEL | SIMULATION |
| `weather-contract-v7 SOURCE_TYPE` | OBSERVED / OFFICIAL_FORECAST / OFFICIAL_WARNING | 위와 같음 | 위와 같음 |
| | MODEL_FORECAST | MODEL | FORECAST |
| | EARTHUS_ESTIMATE | MODEL | INFERRED |
| `tourism-flow-contract SOURCE_TYPE` | OFFICIAL_OBSERVATION / OFFICIAL_FORECAST | 위와 같음 | 위와 같음 |
| | DERIVED_TREND | MODEL | INFERRED |
| Python `truthType` | v02 10종과 동일 어휘 + `UNKNOWN` | §3.1 그대로 | §3.1 그대로 · `UNKNOWN`→UNKNOWN |
| `truthClass` | NEWS_REPORT | NEWS | REPORTED |
| | SIMULATION_ONLY | MODEL | SIMULATION |
| | OFFICIAL_NGO_SOURCE | OFFICIAL | FACT |
| research-runtime `evidenceKind` | OBSERVATION | OBSERVATION | FACT |
| | ANALYSIS | MODEL | INFERRED |
| | REANALYSIS | MODEL | INFERRED |
| | FORECAST | MODEL | FORECAST |
| | **SYNTHETIC_TEST** | MODEL | **SIMULATION** + 공개 금지 플래그 |
| gdelt `status` | confirmed | NEWS | **REPORTED** (점수는 독립 출처 수가 아니다 — 아래 ⚠️) |
| | unconfirmed | NEWS | REPORTED |
| | `placeDoubt: true` | NEWS | REPORTED 로 강제 하향 (이미 코드가 그렇게 한다) |
| ZIP `VerificationState` | 8종 | — | **1:1 동일**. 그래서 ZIP 값은 그대로 받을 수 있다 |

> ⚠️ **2026-09-13 정정 — gdelt `confirmed` 는 `CORROBORATED` 가 아니다.**
> 이 표는 전에 "교차검증 점수가 곧 독립 출처 수다"라고 적고 `confirmed → CORROBORATED` 로
> 옮겼다. 그것은 이 문서 §2.1 자신과 어긋난다. §2.1 은 `CORROBORATED` 의 조건을
> **`independenceGroup` 고유 수 ≥ 2** 로 적었는데, gdelt 의 `status` 는
> `aws/gdelt-events/handler.py` 의 `score(NumSources, NumMentions, wire, geoType, ageMin)`
> 가 `CONFIRM_SCORE`(60) 를 넘는지 하나로 정해지는 값이다. 즉 **점수 문턱이고 출처 수가 아니다** —
> 한 통신사 기사를 스무 곳이 전재해도 점수는 오른다.
> PHASE 3G 결정 ① 이 독립 출처 회계를 `aws/_shared/article_dedup.py` 의
> `independence_units_for()` 한 곳으로 못 박았고, `CORROBORATED` 는 그 값이 2 이상일 때만 붙는다.
> `aws/_shared/truth_vocabulary.py` 가 이 규칙을 코드로 갖고 있다(`corroborated()` ·
> `CORROBORATION_MIN = 2`). 두 축은 곱해지지 않으므로, 뉴스 단독 사건은
> `truthStatus = REPORTED` 이면서 `corroborated = true` 일 수 있다 — 하나로 눌러 담지 않는다(규칙 3).

### 3.4 `EVIDENCE_LEVELS` (5) 는 진리 축이 아니다 — **관계 강도 축**

`aws/_shared/report_contract.py:329` 의 5종(COINCIDING … POSSIBLE_INFLUENCE)은
"사건 ↔ 사건" 또는 "사건 ↔ 지표" 관계의 표현 강도다. `TRUTH_STATUS` 와 곱해지지 않는다.
`RELATION_TYPES`(5종) · `FORBIDDEN_CAUSAL`(금지 문구 9개)과 함께
[EARTH_EVENT_CANONICAL_MODEL.md](EARTH_EVENT_CANONICAL_MODEL.md) §6 에서 다룬다.

---

## 4. LAYER_TRUTH 보존 migration strategy

### 4.0 먼저 숫자를 정정한다

| 표 | 심볼 | 위치 | 항목 수 |
|---|---|---|---|
| 레이어 → 현상·역할·상태 | `LAYER_PHENOMENON` | `prototype/v2-three/js/phenomenon-registry.js:821` | **109** |
| 레이어 → 증거종류·SLA | `LAYER_TRUTH` | `prototype/v2-three/js/engine-bridge.js:111` | **89** |

지시서가 말한 "LAYER_TRUTH 109개"는 두 표를 합친 수다.
실측: 109는 `LAYER_PHENOMENON`, `LAYER_TRUTH` 는 89다.
`tools/test_v2_ui_information_architecture.mjs:49` 가 `LAYER_PHENOMENON` 의 109를 검사한다.

**진리등급이 없는 레이어 20개** (현상은 있으나 `LAYER_TRUTH` 에 없다):

```
hazards/glof     hobby/dive     hobby/ecobird   hobby/fishing   hobby/migbird
hobby/mountain   hobby/para     hobby/seabird   hobby/surf      hobby/trench
hobby/turtle     hobby/vessel   lab/charts      lab/crust       lab/reports
lab/requests     lab/today      ocean/vessel    people/flight   people/travel
```

⚠️ `hazards/glof` 가 이 목록에 있다. GLOF 레이어는 현상표에는 있고 진리등급이 없다.
역방향(진리등급만 있고 현상표에 없는 키)은 **0개**다 — `LAYER_TRUTH ⊂ LAYER_PHENOMENON`.

`LAYER_TRUTH` 89항목의 증거종류 분포 (실측):

```
OFFICIAL_OBSERVATION 38 · PROVIDER_FORECAST 19 · VISUALIZATION_ONLY 9
HISTORY 7 · EARTHUS_ANALYSIS 6 · OFFICIAL_WARNING 4 · OFFICIAL_FORECAST 4
ESTIMATED_DISTRIBUTION 1 · SIMULATION 1
slaMin: 숫자 52 · null 37
장면별: weather 22 · ocean 19 · hazards 14 · land 13 · space 9 · people 6 · travel 6
```

### 4.1 4단계 이행 — 89항목을 한 줄도 고치지 않는다

```
단계 A  추가만 한다 (위험 0)
        새 파일 하나: prototype/js/earthus2/v11/core/truth-status.js
          export const TRUTH_STATUS      (8)
          export const SOURCE_KIND       (6)
          export const LEGACY_EVIDENCE_KIND_MAP   (10행 — §3.1 표)
          export const LEGACY_V11_KIND_MAP        (8행  — §3.2 표)
          export function deriveTruth({ evidenceKind, dataState, timeMode, independenceGroups, conflict })
        v11/index.js 에 재수출 한 줄 추가.
        ⚠️ v02/core/constants.js 는 건드리지 않는다 (읽기 전용 정본 — engine-bridge.js 머리말).
        ⚠️ v11/core/contracts.js 도 건드리지 않는다 (테스트 65건이 검사).

단계 B  파생만 한다 (화면 변화 0)
        engine-bridge.js 가 LAYER_TRUTH 를 읽는 방식 그대로 두고,
        layerTruth(key) 가 돌려주는 객체에 필드 셋을 **추가**한다:
            { kind, slaMin,  truthStatus, sourceKind, timeMode }
        기존 호출부는 kind·slaMin 만 읽으므로 아무것도 안 바뀐다.
        renderBadge() 의 출력 문자열을 바꾸지 않는다.

단계 C  검사기를 먼저 둔다
        tools/earthus-v53/truth-vocabulary.test.mjs (새 파일)
          · LEGACY_EVIDENCE_KIND_MAP 이 v02 EVIDENCE_KIND 10종을 **전부** 덮는다
          · LEGACY_V11_KIND_MAP 이 v11 EVIDENCE_KINDS 8종을 **전부** 덮는다
          · deriveTruth 가 FORECAST·SIMULATION 을 FACT 로 올리지 않는다
          · VISUALIZATION_ONLY → truthStatus UNKNOWN · fidelity NONE
          · 충돌이 있으면 CORROBORATED 를 주지 않는다
          · 배지 문구 회귀: KIND_BADGE 표의 문자열이 이전과 같다
          · LAYER_TRUTH 키 집합 ⊆ LAYER_PHENOMENON 키 집합  (현재 참)

단계 D  빈칸 20개를 채운다 (별도 커밋)
        LAYER_TRUTH 에 20항목 추가 + sourceKind 를 SATELLITE/OBSERVATION 으로 분리.
        근거는 provenance.py DATASET_PROVENANCE 와 각 레이어 자료원.
        그리고 검사기를 ⊆ 에서 = 로 조인다.
        ⚠️ 이 단계는 화면 배지를 실제로 바꾼다 → 브라우저 캡처 재촬영 필요.
```

### 4.2 Python 은 베끼지 않고 **읽는다**

선례가 이미 있다 — `aws/_shared/phenomenon_registry.py` 머리말:

> ⚠️⚠️ 이 파일은 레지스트리를 **다시 정의하지 않는다.** 정본은 하나다:
> `prototype/v2-three/js/phenomenon-registry.js` … 표를 베껴 오면 두 개의 진실이 생긴다.
> 실제로 그 사고가 났다 — `'ocean/sst'` 라고 썼는데 진짜 레이어는 `'ocean/sstfield'` 였다.

같은 방식으로 `aws/_shared/truth_vocabulary.py` 를 둔다 —
`truth-status.js` 를 정규식으로 읽어 3축과 파생표를 얻는다. 읽기 실패하면 **예외를 던진다.**

그러면 다음이 자동으로 한 진실을 공유한다:
`provenance.py truthType` · `lab_report.py KIND_TRUTH` · `report_contract.py` ·
`distribution/eligibility.py` · `research-runtime` 연결 어댑터.

---

## 5. 금지 규칙 (코드로 막는다)

| # | 금지 | 어디서 막나 |
|---|---|---|
| 1 | 새 진리 어휘 정의 | `truth-vocabulary.test.mjs` 가 `export const [A-Z_]*(TRUTH|EVIDENCE|VERIFICATION)` 를 grep 해 허용 목록 밖이면 실패 |
| 2 | `FORECAST`·`SIMULATION` → `FACT` 승격 | `deriveTruth()` 단방향 + 시험 |
| 3 | 임의 confidence 퍼센트 생성 | `CONFIDENCE` 4단계만 허용. 숫자 신뢰도는 gdelt `score`(근거 산식 공개)와 eligibility 점수뿐이고, 둘 다 산식이 파일에 있다 |
| 4 | 충돌 은폐 | `conflict` 있으면 `CORROBORATED` 금지 + 양쪽 보존 |
| 5 | `SYNTHETIC_TEST` 자료의 공개 발행 | research-runtime 이 이미 격리. 연결 어댑터에서 한 번 더 막는다 |
| 6 | 인과 단정 문구 | 기존 `report_contract.FORBIDDEN_CAUSAL` 9개 재사용 |
| 7 | `EVIDENCE_KIND` 이름 재사용 | 단계 C 검사기가 세 번째 정의를 잡는다 |

---

## 6. 확정 — DECISION 1 (2026-09-13 승인)

**`SOURCE_KIND` 를 정본 명칭으로 확정한다. `EVIDENCE_KIND` 로 강제 개명하지 않는다.**

확정된 정본 축:

```
TRUTH_STATUS   FACT · CORROBORATED · REPORTED · CLAIM
               INFERRED · FORECAST · SIMULATION · UNKNOWN          (8)
SOURCE_KIND    OFFICIAL · OBSERVATION · SATELLITE
               NEWS · OSINT · MODEL                                 (6)
DATA_STATE     기존 4종 유지 (LIVE · DEGRADED · STALE · UNAVAILABLE)
```

보조축 `TIME_MODE` · `TRUTH_FIDELITY` 도 기존 v02 구조를 재사용한다.
`LAYER_TRUTH` 89개는 수정하지 않는다 — 필요한 관계는 §3.1 의 10행 파생표/계산으로 구현한다.

기각된 대안: 기존 10종을 `LAYER_EVIDENCE_GRADE` 로 개명하고 `EVIDENCE_KIND` 를 6종으로 바꾸는 안.
고쳐야 하는 곳이 `LAYER_TRUTH` 89 + Python `truthType` 76 + `KIND_TRUTH` 9 + 배지 렌더러이고,
v11 `EVIDENCE_KINDS` 와의 충돌이 그래도 남는다.
