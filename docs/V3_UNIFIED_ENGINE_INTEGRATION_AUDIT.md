# V3 UNIFIED ENGINE — 통합 사전 감사 (PHASE 0 + PHASE 1)

작성 2026-09-13 · 대상 브랜치 `earthus-v2/real-living-earth-render` @ `3c577d15`
감사자: Claude Opus 5 (Claude Code)

이 문서는 **감사 결과만** 담는다. 이 문서를 쓰는 동안 저장소 코드는 한 줄도 고치지 않았다.
숫자는 전부 이 세션에서 실제로 돌려 얻은 것이고, 돌리지 못한 것은 "미측정"으로 적었다.

---

## 0. 요약 — 먼저 알아야 할 세 가지

### ① 지시서가 전제한 "기존 V3 Simulation"은 그 이름으로 존재하지 않는다

지시서는 `model_family` · `input_manifest` · `forcing_manifest` · `validation` 을 갖춘
V3 Simulation 이 이미 있고, `FLOOD` / `GLOF` 시뮬레이션을 호출하면 된다고 전제한다.
실측 결과 **그 전제는 틀렸다.**

| 지시서의 전제 | 실제 |
|---|---|
| "기존 V3 Simulation Engine" | 이 저장소의 **V3 = 종이 지구(`prototype/v3-paper`) + 키즈(`prototype/v3-kids`)** 다. 시뮬레이션 엔진이 아니다. |
| FLOOD 시뮬레이션 | 없다. `sim-questions.js` 가 `ocean.coastal_inundation` 을 **`not_available`** 로 명시해 두었다. |
| GLOF 시뮬레이션 | 없다. 현상 레지스트리에 `hazards.glacial_lake_flood` 항목은 있으나 `simulation` 능력은 false. |
| manifest / forcing / validation | **있다. 다만 다른 곳에 있다** → `services/research-runtime` (해양 표류 모델 2종). |

실제로 계산하는 것(측정):

| 엔진 | 위치 | 성격 |
|---|---|---|
| 쓰나미 도달시간 | `aws/tsunami-eta/handler.py` | √(g·h) 0.2° Dijkstra. `SIMULATION_ONLY` 로 자기 표시 |
| 해양 표류(입자) | `services/research-runtime/research_runtime/models.py`, `models_v2.py` | modelId 2종, 실험 스키마·검증·재현 |
| 파도 표면 운동 | `prototype/v2-three/js/sim-ocean.js` | Gerstner, 장면 표현 |
| 위성 궤도 | `prototype/v2-three/js/sat-layer.js` | SGP4 |
| 오염 수송 | `prototype/js/earthus2/v11/environment/transport-simulator.js`, `aws/atmos-transport-spike` | MODELLED 표시 강제 |
| 여진 기대수·지속성 추정 8종 | `aws/lab-events/handler.py` | 추정 + 실측 대조 점수 동시 발행 |
| 태풍 유사사례 | `aws/cyclone-analog` | 과거 유사 사례, 예보 아님 |

**결론:** 통합 대상 "V3 Simulation" 을 `services/research-runtime` 으로 읽어야 하고,
지시서의 FLOOD/GLOF 예시는 **구현 대상이 아니라 빈칸**이다. 없는 것을 부르는 어댑터를 쓰면
`not_available` 을 `available` 로 바꾸는 거짓말이 된다.

### ② ZIP 의 실제 코드량은 953줄이고, SNS 부분은 이 저장소 코드와 바이트 단위로 같다

`engines/src` + `adapters` + `tests` 전부 합쳐 **953줄**이다. 물리·저장·공급원이 없는
메모리 위 골격(scaffold)이다. `reference/SNS_FACTORY_3c577d15.zip` 은 이름 그대로
**우리 HEAD 커밋 `3c577d15` 의 스냅샷**이고, 실측 diff 에서 `executor.py` ·
`rate_limit.py` · `verify_live.py` 가 **IDENTICAL** 이었다. 새 코드가 0줄이다.

### ③ 기존 구현이 ZIP 보다 강한 영역이 셋 있다

- **뉴스 군집·교차검증**: `aws/gdelt-events/handler.py`(589줄)는 ZIP 의 `news-engine.ts`(93줄)가
  하지 않는 것을 이미 한다 — 기사 단위 대표 위치 1개, 지명 사전 대조(placeDoubt), 확정/미확정 2단계.
  그리고 **"합치기가 점수를 지어냈다"는 결함을 실측으로 찾아 고친 이력**이 파일 주석에 남아 있다.
  ZIP 의 `findMatch()` 는 그 결함(무관 기사 합치기)을 다시 만들 수 있는 구조다(§4-B).
- **사건 결합**: `prototype/js/earthus2/v11/event/event-fusion.js` 는 type 불일치 즉시 거절 ·
  공식 id 우선 · union-find 군집까지 있다. ZIP `event-engine.ts` 의 `findMatch` 는 **type 을 안 본다.**
- **SNS 발행 자격**: `aws/distribution/eligibility.py` 는 자료 없는 기준을 0점이 아니라
  분모에서 빼고, 인명 관련 표지가 있으면 자동 경로를 아예 막는다. ZIP 에 대응물이 없다.

---

## 1. 현재 구현되어 있는 엔진 (실측)

### 1.1 정본 엔진 트리 — `prototype/js/earthus2/` (293개 .js)

| 세대 | 역할 | 대표 모듈 |
|---|---|---|
| v02 | 정본 코어 (61모듈) | `core/constants.js`(EVIDENCE_KIND·ACCESS_TIER), `core/canonical-signal.js`(신선도 강등), `core/confidence.js`, `core/resource-governor.js`, `core/scene-orchestrator.js`, `core/truth-budget.js`, `storage/canonical-lake.js`, `ops/provider-health.js` |
| v03 | 재해·해양·시각 | `hazards/tsunami-alert.js`, `ocean/wave-engine.js`, `intelligence/story-orchestrator.js`, `visual/material-grammar.js` |
| v04–v10 | 인간흐름·유료·백엔드·알림 | `v07/news/ingestion-cluster.js`, `v07/news/source-registry.js`, `v06/news/news-event-linker.js`, `v10/backend/*` |
| v11 | **Advanced Intelligence** | 아래 별도 |
| greenfield | 시나리오 분기 | `simulation-branch-runtime.js` (`truthClass:'SIMULATION_ONLY'`, `assertBaselineUnchanged`) |
| frontend-v10 / integration-v10 | 런타임 결합 | `integration-v10/pulse-source.js` |

### 1.2 v11 Advanced Intelligence — ZIP 과 가장 많이 겹치는 곳

`prototype/js/earthus2/v11/` (33개 .js + SQL 1 + JSON 계약 1)

| v11 모듈 | 하는 일 | ZIP 대응 |
|---|---|---|
| `core/contracts.js` | `EVIDENCE_KINDS`(8종) · `DATA_STATES`(4종) · `INTELLIGENCE_STATES`(6종) · `stableId()`(fnv1a32, `ei_` 접두사) · `unavailable()` | `types.ts` + `id.ts` |
| `event/event-fusion.js` | `eventSimilarity()`(type gate → 공식id → 시간·거리·이름·지역 가중) · `clusterEarthEvents()`(union-find) | `event-engine.ts findMatch()` |
| `event/event-graph.js` | 사건 관계 그래프 | `cascade-engine.ts` |
| `evidence/evidence-graph.js` | `EvidenceGraph` 클래스 — 노드/엣지, 관계 9종(`SUPPORTS`·`CONTRADICTS`·`DERIVED_FROM`…), `trace()` | `evidence-engine.ts` + `EventGraphEdge` |
| `news/geospatial-news-fusion.js` | `normalizeNewsArticle()` — 좌표 정밀도(`EXACT_SOURCE`/`NONE`), `mappable`, `truthClass:'NEWS_REPORT'` | `news-engine.ts` 정규화부 |
| `claims/claim-gate.js` | `evaluateClaim()` — 주장 종류별 필수 증거, 미충족이면 라벨 자체를 주지 않음 | ZIP 에 없음 |
| `forecast/model-registry.js`, `ground-truth.js`, `calibration.js` | 모델 등재 · 실측 대조 · 보정 | ZIP 에 없음 |
| `release/intelligence-release-gate.js` | SHADOW→CANARY→ACTIVE 승격 게이트 | ZIP 에 없음 |
| `memory/event-signature.js`, `analog-search.js` | 사건 서명 · 유사사례 검색 | `search-engine.ts` |
| `postgres/20260826_v11_advanced_intelligence.sql` | `earthus_event_cluster` · `earthus_evidence_node` · `earthus_evidence_edge` 등 **DDL 초안** | ZIP 에 없음 |

⚠️ 그 SQL 첫 줄이 이렇다: `-- ADDITIVE CONTRACT ONLY. Review against live Supabase migrations before applying.`
**아직 적용되지 않았다**(§8 확인).

### 1.3 앱 3종과 렌더러 (실측)

| 앱 | 경로 | 렌더러 | 사건 관련 구현 |
|---|---|---|---|
| V1 | `prototype/` (index.html) | **Cesium 1.143.0** (CDN) | `js/layers/events.js`(GDELT 뉴스), `js/layers/eventfocus.js`(등진도선·등시선), `js/brief.js`(AI 브리핑), `js/layers/*` 31종 |
| V2 | `prototype/v2-three/` (+ `v2-deploy/` 거울) | **Three.js r184** (vendor 동봉) | `js/intel-feed.js`(816줄, Earth Event 비컨), `js/event-room.js`(420줄, 기관 스택), `js/sim-questions.js`(262줄), `js/phenomenon-registry.js`(1,035줄, 66현상), `js/engine-bridge.js`(686줄, LAYER_TRUTH), `js/report-center.js` |
| V3 | `prototype/v3-paper/`, `prototype/v3-kids/` | 2D canvas (종이) | 사건 계보 **없음**. `src/live-layers.js` · `kids-layers.js` 가 지진·부이·위성·124종 팩을 얹는다 |

### 1.4 수집·계산 백엔드 — `aws/` (handler.py 83개, Python 테스트 50개)

뉴스 계보 4종:

| Lambda | 산출물 | 성격 |
|---|---|---|
| `gdelt-events` | `events/global.json` | GDELT 2.0 원본 CSV → 교차검증 점수 → **confirmed / unconfirmed 2단계** |
| `news-brief` | `events/briefs.json` | confirmed 상위 N건만 Claude 웹검색으로 사실 재작성 + 문장별 출처 링크 |
| `regional-news` | `events/regional-news.json` | 저개발 지역 RSS 8개 — **제목·링크·시각·매체만** (본문·요약·번역 금지) |
| `world-alerts` | 공식 특보 | 기관 발표 |

### 1.5 SNS Factory — `aws/distribution/` (Python 22 모듈 + 테스트 13파일)

`handler.py` 주석 첫 줄: **"자동으로 올리지 않는다. 후보까지만 만든다."**

```
lab_report / verify_scorecard  →  generator  →  eligibility(§10 산식, UNKNOWN 은 분모 제외)
                              →  validation  →  publish_queue  →  (사람 승인)
                              →  executor  →  sns_adapters(7종)  →  verify_live  →  archive
```

부속: `rate_limit.py` · `scheduled_release.py` · `provider_health.py` · `analytics_fetch.py` ·
`response_archive.py` · `bridge_client.py` · 관리 UI `prototype/distribution.html` +
`prototype/js/distribution-admin.js` + 승인 문 `prototype/supabase/functions/social-admin/index.ts`.

### 1.6 연구 런타임 — `services/research-runtime/` (= 사실상의 "Simulation" 진입점)

- 모델 등재: `registry.py` → `MODELS` 2종
  - `surface-passive-advection.v1` / `0.1.0`
  - `surface-passive-advection.v2.windage` / `0.1.0` (풍압 · `needsWind:True`)
- 실험 계약: `contracts/experiment.schema.json`, `experiment-v2.schema.json`
  - v1 필수: `schemaVersion, projectId, question, modelId, modelVersion, datasetVersions, area, startTimeUTC, durationSeconds, releaseDefinition, particleCount, integrationMethod, integrationStepSeconds, outputStepSeconds, boundaryPolicy`
  - v2 추가 필수: `questionId, validationPlanId, windDataset, windage`
- 자료 manifest: 출처·인용·권리·격자·좌표·단위·달력·발행/유효/수집시각·처리이력·**SHA-256**
- 원장: SQLite 작업 원장 + idempotency key + 취소/중단 표시
- 검증: `validation.py` / `validation_v2.py` / `evidence_v2.py` / `comparison_v2.py`, 결과 해시 검사, 권리조건별 ZIP 내보내기
- 합성 입력은 `SYNTHETIC_TEST` 로 격리. 실제 해류 자료는 고정 OceanParcels 없으면 **실행 거부**
- 127.0.0.1 바인딩 전용, 공개 운영 서버 아님

연구 스크립트 `tools/research/` 189개에 `acquire_step*_forcing.py` · `build_step*_forcing.py` ·
`check_step*_preregistration.py` · `check_step*_model_run.py` 계보가 있다 —
**지시서가 말한 forcing / manifest / preregistration / validation 이 바로 이것이다.**

---

## 2. 현재 미구현 기능 (문서에만 있거나 배선이 끊긴 것)

| 항목 | 상태 | 근거 |
|---|---|---|
| EarthEvent 영속 저장 | **미구현** | DB 에 사건 테이블 없음(§8). 사건은 매 요청 브라우저 메모리에서 조립된다 |
| Evidence / Claim 영속 저장 | **미구현** | `v11/postgres/*.sql` 는 미적용 DDL 초안 |
| v11 모듈의 화면 배선 | **부분** | `event-room.js` 가 `v11/event/event-fusion.js` 하나만 import 한다. `evidence-graph.js` · `claim-gate.js` · `geospatial-news-fusion.js` 를 읽는 화면 코드 **없음**(실측 grep) |
| `events/global.json` 의 V2/V3 배선 | **V1 전용** | V1 `js/layers/events.js` 만 읽는다. V2 `live-layers.js` 는 `events/regional-news.json` 만 읽는다 |
| `events/briefs.json` 의 V2/V3 배선 | **V1 전용** | `prototype/js/brief.js` 만 읽는다 |
| News Home (LIVE WORLD / BREAKING / MAJOR …) | **미구현** | 그런 화면이 없다. V2 는 현상 메뉴 + 사건 방 구조다 |
| Event Detail 8절(WHAT HAPPENED … OPEN QUESTIONS) | **부분** | `event-room.js` 가 기관 스택·현재→다음→행동까지. EVIDENCE / IMPACT / OPEN QUESTIONS 절은 없다 |
| 복합사건 관계 7종 | **부분** | `v11/event/event-graph.js` 존재, 관계 어휘는 evidence 관계 9종과 별개. `POSSIBLE_CASCADE` 등 지시서 어휘는 **어디에도 없다** |
| Impact(노출 인구·자산) | **미구현** | 대응 모듈·테이블·산출물 없음 |
| FLOOD / GLOF 시뮬레이션 | **미구현이자 미구현으로 표시됨** | `sim-questions.js` `ocean.coastal_inundation: not_available` |
| Alert 발송 | **부분** | `aws/push-tick`, `prototype/supabase/functions/push-tick` 존재. 사건 기반 알림 규칙은 없음 |
| 검색 | **미구현** | 전역 사건/기사 검색 없음 |
| Lambda Function URL 익명 호출 | **막혀 있음** | `prototype/js/config.js` 주석: 계정 차원 403(실측 기록). 그래서 전부 "배치 → S3 JSON → 앱이 읽기" 구조다 |

---

## 3. 이번 ZIP 과 중복되는 코드

### 3.1 ZIP 구성 (실측: 파일 65개)

```
README.md
docs/ENGINE_COVERAGE.md, docs/MD_TO_ENGINE_MAPPING.md
handoff/CLAUDE_CODE_ONE_SHOT_v3.md
engines/src/*.ts (15)  engines/adapters/*.ts (1)  engines/tests/*.ts (1)
engines/dist/**        engines/package.json  engines/tsconfig.json  engines/types/*.d.ts
reference/EARTHUS-V2-verification-package.zip   (42 files, 9.1 MB)
reference/EARTHUS_V3_UNIFIED_MASTER_v2.zip      (62 files — 같은 엔진의 이전 세대 v2)
reference/SNS_FACTORY_3c677d15.zip → 실제 파일명 SNS_FACTORY_3c577d15.zip (39 files)
```

실제 코드 줄 수 (실측 `wc -l`):

```
types.ts 222 · event-engine 130 · tests 113 · news-engine 93 · evidence-engine 77
context-engine 39 · v3-simulation-adapter 37 · unified-pipeline 36 · impact-engine 40
alert-engine 25 · cascade-engine 25 · simulation-orchestrator 25 · text 21
search-engine 20 · store 16 · index 12 · id 8 · news-types 2 · types/*.d.ts 12
────────────────────────────────────────────────────────────── 합계 953줄
```

### 3.2 중복 판정

| ZIP 파일 | 기존 구현 | 판정 |
|---|---|---|
| `reference/SNS_FACTORY_3c577d15.zip` | `aws/distribution/**` | **완전 중복.** 우리 HEAD 스냅샷. diff 결과 IDENTICAL ×3 확인. 게다가 ZIP 쪽에 `caption.py` · `cli.py` · `eligibility.py` · `generator.py` · `handler.py` · `hashtags.py` · `sources/` · `validation.py` · `visual.py` · `test_distribution.py` 가 **빠져 있다** — 저장소가 상위집합 |
| `reference/EARTHUS-V2-verification-package.zip` | `EARTHUS-V2-verification-package.zip`(저장소 루트에 이미 있음) + `docs/` | **중복.** 검증 캡처 baseline |
| `reference/EARTHUS_V3_UNIFIED_MASTER_v2.zip` | — | ZIP 자기 자신의 이전 세대. `engine/src/{rss,dedup,clustering,verification}.ts` 가 v3 에서 없어졌다 → **v3 가 오히려 축소판** |
| `src/evidence-engine.ts` | `v11/evidence/evidence-graph.js` | 중복. 기존이 그래프·trace·관계 9종까지 있어 우세 |
| `src/event-engine.ts` 군집부 | `v11/event/event-fusion.js` | 중복. 기존이 type gate·공식id·union-find 로 우세 |
| `src/news-engine.ts` 정규화부 | `v11/news/geospatial-news-fusion.js` | 중복 |
| `src/news-engine.ts` 수집·중복제거부 | `aws/gdelt-events/handler.py`, `v07/news/ingestion-cluster.js` | 중복. 기존이 실전 결함 3건을 고친 이력으로 우세 |
| `src/search-engine.ts` | `v11/memory/analog-search.js` | 부분 중복 |
| `src/types.ts` VerificationState | `v02 EVIDENCE_KIND`(10종) · `v11 EVIDENCE_KINDS`(8종) · `LAYER_TRUTH` | **어휘 충돌** → §5-A |
| `src/id.ts` `stableId` | `v11/core/contracts.js` `stableId` | **충돌** → §5-C |
| `adapters/v3-simulation-adapter.ts` | `services/research-runtime/registry.py` | 형태만 유사. 필드 이름이 다름 → §5-B |

### 3.3 ZIP 만이 가진 것 (중복 아님)

- `RelationType` 7종 어휘 자체: `TEMPORAL` `SPATIAL` `CORRELATED` `POSSIBLE_CASCADE` `MODELLED_CASCADE` `CONFIRMED_CAUSAL` `UNKNOWN` — 저장소에 없다
- `TimelineEntry` / `timeline()` 정렬 — 사건 타임라인을 한 배열로 모으는 규약
- `ContextSnapshot.status: COMPLETE | PARTIAL | UNKNOWN` + 어댑터 실패 시 도메인별 `{status:'UNKNOWN'}`
- `ImpactAssessment` 자료구조(노출 인구·자산·가정·불확실성·`status: OBSERVED|MODELLED|UNKNOWN`)
- `ContextAdapter` / `ImpactAdapter` / `SimulationAdapter` 인터페이스 — 얇지만 배선 규약으로 쓸 만하다
- `EvidenceEngine.classify()` 의 **독립성 그룹 계수** 규칙 (`independenceGroup` 2개 이상 → CORROBORATED)

---

## 4. 통합 가능한 코드 (ZIP → 저장소)

권장 등급: **A** = 그대로 개념 채택, **B** = 기존에 맞춰 재작성, **C** = 채택하지 않음

| ZIP | 등급 | 이유 / 재작성 방향 |
|---|---|---|
| `RelationType` 7종 | **A** | 새 어휘. `v11/event/event-graph.js` 에 관계 상수로 추가(기존 관계 이름 건드리지 않고 병렬 추가) |
| `TimelineEntry` + `timeline()` | **A** | `event-room.js` 가 이미 기관별 줄을 쌓는다. 그 줄에 `kind`(ARTICLE/EVIDENCE/OBSERVATION/WARNING/FORECAST/IMPACT/SIMULATION/SYSTEM)를 붙이면 8절 UI 로 바로 간다 |
| `ContextSnapshot` + `ContextEngine` | **A** | `COMPLETE/PARTIAL/UNKNOWN` 3분법이 기존 `SOURCE_STATE` 5분법(`event-room.js`)과 층이 다르다 — 사건 단위 종합 상태로 얹힌다 |
| `ContextAdapter` 인터페이스 | **B** | 기존 어댑터는 "S3 JSON 을 fetch" 다. `event-room.js SRC` 와 `live-layers.js` 의 fetch 표를 어댑터 목록으로 감싼다 |
| `ImpactAssessment` 자료구조 | **A** | 없던 것. 다만 **계산기가 없다** → `status:'UNKNOWN'` · `assumptions:['no physical model bound']` 만 정직하게 넣는다. 숫자를 만들지 않는다 |
| `EvidenceEngine.classify()` 독립성 계수 | **B** | 규칙은 좋다. 그러나 반환 어휘를 `EVIDENCE_KIND` 로 바꿔야 한다(§5-A). `v11/evidence/evidence-graph.js` 에 메서드로 얹는다 |
| `SimulationAdapter` 경계 | **B** | `research-runtime` 필드명(`modelId`/`modelVersion`/`datasetVersions`/`windDataset`/`validationPlanId`)으로 재작성. ZIP 의 `inputManifest`/`forcingManifest` 문자열 2칸은 우리 계약을 담지 못한다 |
| `AlertEngine` | **B** | `aws/push-tick` 과 `provider_health` 가 이미 있다. 사건 기반 규칙만 얹는다 |
| `SearchEngine` | **B** | jaccard 전수 스캔은 66현상·수천 기사에서 못 쓴다. `v11/memory/analog-search.js` 를 확장 |
| `UnifiedEarthEngine`(파이프라인 조립) | **B** | 저장소는 정적 앱이다. "브라우저 안 단일 객체"보다 **Lambda 배치 → S3 JSON → 앱이 읽기** 가 기존 계보다 |
| `NewsEngine.ingest()` | **C** | `gdelt-events` 를 대체하면 실측으로 고친 결함 3건이 되살아난다(§4-B 아래) |
| `EventEngine.findMatch()` | **C** | type 을 안 본다. `eventSimilarity()` 를 쓴다 |
| `store.ts`(Map 기반) | **C** | 영속성이 없다. 프로세스가 끝나면 사건이 사라진다 |
| `engines/dist/**` | **C** | 빌드 산출물을 저장소에 넣지 않는다 |
| `reference/*.zip` 3종 | **C** | 전부 중복 또는 자기 이전 세대 |

### 4-B. `NewsEngine.ingest()` 를 채택하지 않는 실측 근거

`aws/gdelt-events/handler.py` 주석(2026-09-07 수정 기록)이 남긴 결함 3건과, ZIP 코드의 대응:

| 실측으로 고친 결함 | ZIP 코드 상태 |
|---|---|
| ① "같은 대분류 + 60km" 로 합쳐서 무관 기사 15건이 한 사건이 되고 점수를 지어냈다 (90점 → 실제 43점) | `findMatch()` 는 **제목 jaccard 0.7 + 거리 + 시간**만 본다. **type 을 보지 않는다.** 같은 결함 재현 가능 |
| ② 기사 하나가 여러 지역을 언급하면 사건이 여러 개 떴다 (150건 중 63건 중복) | `articleFingerprint()` 는 canonicalUrl 또는 (출처 + 정규화 제목 + 시각 1시간)이다. **다른 매체의 같은 기사·번역본·재전재를 못 잡는다** — PHASE 4 요구를 충족하지 못한다 |
| ③ 마커가 기사와 다른 곳에 찍혔다 (최대 8,436km) | 지명 대조(placeDoubt) 대응물 **없음** |

ZIP 의 중복제거는 **같은 입력을 두 번 넣었을 때만** duplicate 로 잡는다.
자체 테스트도 정확히 그것만 검사한다(`const input = {...}; ingest(input); ingest(input)`).

---

## 5. 충돌 가능성이 있는 코드

### 5-A. 검증 어휘가 **넷** 이다 (가장 큰 충돌)

| 출처 | 어휘 |
|---|---|
| ZIP `types.ts VerificationState` | FACT · CORROBORATED · REPORTED · CLAIM · INFERRED · FORECAST · SIMULATION · UNKNOWN |
| 저장소 `v02/core/constants.js EVIDENCE_KIND` | OFFICIAL_OBSERVATION · OFFICIAL_FORECAST · OFFICIAL_WARNING · PROVIDER_FORECAST · EARTHUS_ANALYSIS · EARTHUS_FORECAST · ESTIMATED_DISTRIBUTION · SIMULATION · HISTORY · VISUALIZATION_ONLY |
| 저장소 `v11/core/contracts.js EVIDENCE_KINDS` | OBSERVED · OFFICIAL_FORECAST · OFFICIAL_WARNING · REPORTED · DETECTED · MODELLED · HISTORICAL · SIMULATION |
| 저장소 `gdelt-events` | `status: confirmed | unconfirmed` + `score` + `placeDoubt` |

`engine-bridge.js` 는 이미 옛 문자열 → `EVIDENCE_KIND` 변환표(`LEGACY_TO_KIND`)를 갖고 있다.
**다섯 번째 어휘를 만들면 화면 배지가 거짓말을 시작한다.**

- `SIMULATION` 만 세 어휘에 공통으로 있다.
- ZIP 의 `FACT` 는 저장소에 대응물이 없다. `evidence-engine.ts` 는 `OFFICIAL` 또는 `SATELLITE`
  출처 하나만 있으면 `FACT` 를 준다 — 저장소 규약(`OFFICIAL_OBSERVATION` 은 출처 종류이고,
  `LAYER_TRUTH` 의 `slaMin` 으로 늙으면 강등된다)과 어긋난다.
- ZIP 은 **데이터 상태(LIVE/DEGRADED/STALE/UNAVAILABLE)를 아예 갖고 있지 않다.**
  `v02/core/canonical-signal.js deriveFreshnessState()` 가 하는 강등이 없다.

### 5-B. SimulationRun 필드가 우리 계약을 담지 못한다

| ZIP `SimulationRun` | `research-runtime` 실제 |
|---|---|
| `modelFamily: string` | `modelId`(`surface-passive-advection.v2.windage`) + registry 가 `modelVersion` 일치까지 검사 |
| `inputManifest: string` | `datasetVersions[]` = `{datasetId, version}` 배열 + 자료별 manifest(출처·권리·격자·달력·SHA-256) |
| `forcingManifest: string` | `windDataset` + `windage` (v2 전용) |
| `validation?: Record` | `validationPlanId`(사전등록) + `validation_v2.py` 결과 + 결과 해시 |
| — | `questionId` · `releaseDefinition` · `boundaryPolicy` · `integrationMethod` · idempotency key |

**해시 문자열 2칸으로 눌러 담으면 사전등록(preregistration)과 권리조건이 사라진다.**
어댑터는 `research-runtime` 계약을 **그대로 실어 보내는** 방향으로 재작성해야 한다.

### 5-C. ID 생성기가 넷이다

| 생성기 | 형식 |
|---|---|
| ZIP `id.ts stableId` | `earthevt_` + sha256 앞 20자 |
| `v11/core/contracts.js stableId` | `ei_` + fnv1a32 8자 |
| `intel-feed.js` | `tc-<gdacsId>` / `eq-<usgsId>` (사건 주소로 **얼려져 있다** — 테스트가 검사한다) |
| `gdelt-events` | 자체 사건 id |
| `report-center.js` | 보고서 주소 규칙 (테스트: "보고서 주소가 파이썬 규칙과 같은 값을 낸다") |

`tools/earthus-v53/map-context-questions.test.mjs` 에 **"사건 주소는 여전히 정본 id 다"** 와
**"지도 비컨도 배열 인덱스가 아니라 사건 id 로 주소를 잡는다"** 가 있다.
ZIP 의 id 로 갈아타면 이 두 테스트와 공개 URL 이 깨진다.

### 5-D. 언어·빌드 체계 충돌

- 저장소: **TypeScript 도구가 없다.** `package.json devDependencies = playwright` 뿐. `npx tsc` 실측 → `missing packages` 로 실패.
- 저장소 프런트엔드는 **번들러 없는 순수 ESM** 이다. `<script type="module">` + 상대경로 + `?v=` 캐시버스터.
- ZIP 은 `tsc -p tsconfig.json` + `module: NodeNext` 를 요구한다.
- → **결정 필요**: (a) `typescript` 를 devDependency 로 추가하고 TS 를 유지, (b) 채택분을 JS ESM 으로 이식.
  기존 정본 293모듈이 전부 JS ESM 이고, `v11/run_all_checks.sh` 가 `node --check` 로 문법을 검사한다 → **(b) 를 권고.**

### 5-E. 배포 경로 충돌

- `prototype/v2-three/` 와 `prototype/v2-deploy/` 는 **거울**이다(js 41개 동일 이름). 한쪽만 고치면 갈라진다.
- 메모리 기록: S3 에 `app/v2/` 객체가 따로 있어 `index.html` 만 올리면 `/v2/` 가 옛 HTML 로 남는다.
- `prototype/v2-three/js/engine-bridge.js` 가 `../../js/earthus2/v02/...` 절대 경로로 V1 트리를 참조한다 →
  **V2 배포가 V1 파일에 의존한다.** V1 트리를 옮기면 V2 가 죽는다.

### 5-F. 동시 세션 / 더러운 작업트리

- `git status --porcelain`: **233건** (그중 신규 182건)
- 살아 있는 로컬 worktree 2개: `.claude/worktrees/nice-bose-c77640`(detached `f0460c49`), `.claude/worktrees/vigilant-kepler-391ada`
- → 같은 파일에 다른 세션이 붙어 있을 수 있다. 통합 시 **내 hunk 만** 다루고, 광범위 되돌리기를 하지 않는다.

---

## 6. 기존 진입점 목록

### 6-A. "V3 Simulation" 진입점 (= 실제로는 세 갈래)

| 갈래 | 진입점 | 호출 방법 |
|---|---|---|
| 능력 선언 (정본 표) | `prototype/v2-three/js/sim-questions.js` → `SIM_CAPABILITIES`, `simEntryFor()`, `questionsForPhenomenon()` | `main.js` 의 `onAction` `'sim-q'` 분기 |
| 실행 — 쓰나미 | `aws/tsunami-eta/handler.py` → `ocean/tsunami-eta/{usgsId}.json` | 색인 `ocean/tsunami-eta.json` 을 먼저 읽고, 있는 사건만 받는다(없으면 S3 403) |
| 실행 — 파도 | `prototype/v2-three/js/sim-ocean.js` | 브라우저 내 즉시 계산 |
| 실행 — 연구 모델 | `services/research-runtime/research_runtime/service.py` / `server.py` / `client.py` / `cli.py` | `ResearchClient().experiment() → preflight() → run(idempotency_key=…) → status()`. 127.0.0.1:8788 |
| 시나리오 분기 | `prototype/js/earthus2/greenfield/simulation-branch-runtime.js` → `branchScenario()`, `assertBaselineUnchanged()` | 관측 baseline 불변 보장 |

### 6-B. Intelligence 진입점

| 층 | 진입점 |
|---|---|
| 화면 (V2) | `prototype/v2-three/js/intel-feed.js` — Earth Intelligence Feed + Event Room 라이트 |
| 사건 방 | `prototype/v2-three/js/event-room.js` → `EventRoom` 클래스 |
| 정본 모듈 | `prototype/js/earthus2/v11/index.js` (33모듈 재수출), `v11/orchestrator/advanced-intelligence-service.js` |
| 이야기 조립 | `prototype/js/earthus2/v03/intelligence/story-orchestrator.js` |
| 백엔드 | `aws/tropical-intelligence`, `aws/signal-foundation`, `aws/regional-hazards`, `aws/cyclone-analog`, `aws/lab-events`, `aws/report-engine`, `aws/lab-report-index` |
| 배지·진리등급 | `prototype/v2-three/js/engine-bridge.js` → `LAYER_TRUTH`, `renderBadge()`, `layerBadge()` |
| 현상 정본 | `prototype/v2-three/js/phenomenon-registry.js` → `PHENOMENA`(66), `DOMAINS`(7) |

### 6-C. Cesium event / layer 구조 (V1)

```
prototype/index.html
  └ CDN cesium@1.143.0  (window.CESIUM_BASE_URL)
prototype/js/viewer.js      → export const viewer
prototype/js/config.js      → API.{EVENTS, WIND, CLOUDS, OCEAN, …}, T.{CHROME,PIN,EXPAND,SAT_SHOW}
prototype/js/layers/registry.js   → 레이어 등재부
prototype/js/layers/*.js (31)
    events.js      Cesium.CustomDataSource('events')
                   · confirmed = 진하게 + 라벨 + 말풍선(최대 12, 6° 간격, 14,000km 이내)
                   · unconfirmed = 흐리게 + 라벨 없음 + 확대해야 보임
    eventfocus.js  ShakeMap 등진도선 · 쓰나미 도달 등시선 (clampToGround 재질 함정 주의)
    alerts.js hazard.js tsunami.js cyclone.js wildfire.js lightning.js …
prototype/js/maplabel.js, newsbubble.js   라벨·말풍선 텍스처
```

레이어 추가 규약: `init()` → `Cesium.CustomDataSource` 생성 → `viewer.dataSources.add` → `show=false`,
`set(on)`, `refresh()` 3-메서드. `prototype/js/panels.js` 가 중앙 배타성을 관리한다.

### 6-D. SNS Factory 연결점

| 지점 | 파일 |
|---|---|
| 입력 어댑터 | `aws/distribution/sources/lab_report.py`, `report_bridge.py`, `verify_scorecard.py` |
| 후보 생성 | `aws/distribution/handler.py` → `events/distribution-content.json` + `events/distribution-content/<id>.json` |
| 자격 판정 | `aws/distribution/eligibility.py` (`SIGNALS` 7종, `HUMAN_ONLY_MARKERS`) |
| 검증 | `aws/distribution/validation.py` |
| 승인 문 | `prototype/supabase/functions/social-admin/index.ts` (허용 목록) |
| 관리 UI | `prototype/distribution.html` + `prototype/js/distribution-admin.js` |
| 실행 | `executor.py` → `sns_adapters/{x,instagram,threads,facebook,linkedin,tiktok,youtube}.py` |
| 사후 | `verify_live.py` · `analytics_fetch.py` · `archive.py` · `response_archive.py` |

**뉴스는 지금 SNS 의 원천이 아니다.** `report_bridge.py` 주석: "리포트가 SNS 의 원천이 된다. 반대는 아니다."
→ 뉴스를 원천으로 추가하려면 `sources/` 에 **새 어댑터**를 넣고 `eligibility` 를 통과시키는 방식이어야 한다.

---

## 7. 기존 API 구조

**REST 서버가 없다.** 다음 네 층이 전부다.

| 층 | 형태 | 예 |
|---|---|---|
| ① 정적 호스팅 | S3 + CloudFront (`earthus.net`) | `/`, `/v2/`, `/v3/`, `/v3/kids` |
| ② 자료 = S3 JSON (읽기 전용) | `CDN + '/events'`, `/wind`, `/ocean`, `/clouds`, `/solar`, `/tourism` | `events/global.json`, `ocean/lab-reports.json` |
| ③ Lambda (배치, 스케줄) | handler.py 83개. **익명 Function URL 은 403** (계정 차원, `config.js` 실측 기록) | `gdelt-events`, `news-brief`, `distribution` |
| ④ Supabase Edge Functions (인증 필요) | `checkout` · `payment-confirm` · `payment-refund` · `member-admin` · `provider-admin` · `provider-validate` · `forecast-v8` · `push-tick` · `social-admin` | 결제·회원·승인 |

부가: `earthus-llm` 은 CloudFront OAC 뒤라 `AWS_IAM` 인증 필수(`NONE` 이면 `/api/ask` 403).

**통합 함의:** 새 엔진을 "API 라우트"로 노출할 자리가 없다.
사건/증거/문맥은 **배치가 계산해 S3 JSON 으로 쓰고, 앱이 읽는** 기존 계보를 따라야 한다.
쓰기가 필요하면 Supabase Edge Function + RLS 를 써야 한다.

---

## 8. 기존 DB 구조

실제 적용된 마이그레이션: `prototype/supabase/migrations/` **15개** + `supabase/migrations/` **2개**

테이블·뷰 전체(실측 19개):

```
admins · staff_roles · admin_audit_log · member_invites · member_access_audit
analytics_events · usage_counters · usage_daily · forme_funnel_daily
provider_registry · provider_credential_meta · provider_health
earthus_forecast_revisions · earthus_forecast_release_audit
aetherus_personal_universes · aetherus_personal_records · aetherus_observation_archives
aetherus_privacy_events · aetherus_data_subject_requests · aetherus_deletion_receipts
```

**사건·기사·증거·주장·문맥·영향·시뮬레이션 테이블은 하나도 없다.**

미적용 DDL 초안 3개(코드 트리 안):

| 파일 | 내용 |
|---|---|
| `prototype/js/earthus2/v07/postgres/20260826_v07_backend_metadata_contract.sql` | 메타데이터 계약 |
| `prototype/js/earthus2/v10/postgres/20260826_v10_backend_closed_loop.sql` | 닫힌 고리 |
| `prototype/js/earthus2/v11/postgres/20260826_v11_advanced_intelligence.sql` | `earthus_intelligence_feature_value` · `earthus_evidence_node` · `earthus_evidence_edge` · `earthus_event_cluster` · `earthus_event_cluster_member` · `earthus_travel_*` · `earthus_pollution_*` |

`v11` SQL 이 **ZIP 이 요구하는 EarthEvent·Evidence 저장소를 이미 설계해 두었다.**
`release_state text not null default 'SHADOW'` 로 기본이 비공개다.

그리고 `services/research-runtime` 은 별도로 **SQLite 작업 원장**을 쓴다(`store.py`). 로컬 전용.

---

## 9. 유지해야 하는 locked tests (실측 baseline)

이번 세션에서 실제로 돌려 얻은 수치다.

| 스위트 | 명령 | 결과 |
|---|---|---|
| 저장소 기본 | `npm test` (`tools/earthus-v52/*.test.mjs` + `tools/earthus-v53/*.test.mjs` + `tools/test_v2_ui_information_architecture.mjs`) | **139 pass / 0 fail** |
| SNS Factory | `python -m pytest aws/distribution/tests -q` | **325 pass / 6 skip / 21 subtests** (34.3초) |
| v11 Advanced Intelligence | `node --test tools/earthus2-v11/*.test.mjs` | **65 pass / 0 fail** |
| ZIP 엔진(사전빌드 dist) | `node --test dist/tests/unified-engine.test.js` | **5 pass / 0 fail** |
| ZIP 엔진(`npm test` = tsc 빌드) | `npx tsc` | **미측정 — TypeScript 미설치로 실행 불가** |

### 절대 깨뜨리면 안 되는 개별 계약 (파일·테스트명)

`tools/earthus-v53/simulation-questions.test.mjs`
- 현상표 항목 수가 **정확히 66**
- 시뮬 능력표의 모든 id 가 정본 `PHENOMENA` 에 존재
- 상태 어휘가 **정확히 5개** (`available` `limited` `not_available` `not_evaluable` `unavailable`)
- 현상당 질문 ≤ 3, KO·EN 쌍 필수
- "시뮬레이션 능력은 정확히 3개다"

`tools/test_v2_ui_information_architecture.mjs` (일부)
- "사건 주소는 여전히 정본 id 다 (UI 개편으로 안 깨진다)"
- "지도 비컨도 배열 인덱스가 아니라 사건 id 로 주소를 잡는다"
- "109 레이어가 전부 자리를 갖는다 — 단순화로 기능이 사라지지 않는다"
- "보고서 주소가 파이썬 규칙과 같은 값을 낸다" / "보고서 주소는 결정적이다"
- "없는 보고서를 지어내지 않는다"
- "능력 없는 행동은 렌더하지 않는다 (준비 중 금지)"
- "화면이 문장을 만들지 않는다"
- "중요도를 위험도라고 부르지 않는다"
- "제품 이름 Intelligence 는 건드리지 않는다 — 그것은 배포된 주소다"
- "출처 하나가 실패해도 성공한 출처의 비컨은 지구에 남는다"

`aws/distribution/tests/test_sns_factory_regression.py` — SNS Factory 회귀 고정
`tools/earthus2-v11/run_all_checks.sh` — v11 전체 `node --check` + 테스트 + JSON 계약
`services/research-runtime/tests/` (6파일) — `python -m unittest discover -s tests`

### 참고: playwright 계열

메모리 기록대로 환경 문제로 항상 실패한다. `EARTHUS-V2-verification-package.zip` /
`reference/EARTHUS-V2-verification-package.zip` 의 `harness-logs/*.json` + `browser-captures/*.png`(27장)이
브라우저 검증 baseline 이다. 이번 통합에서 **새로 찍어 비교**해야 한다.

---

## 10. 통합 전에 필요한 migration

| # | 내용 | 형태 | 위험 |
|---|---|---|---|
| M1 | `earthus_evidence_node` / `earthus_evidence_edge` / `earthus_event_cluster` / `earthus_event_cluster_member` 적용 | `v11/postgres/20260826_v11_advanced_intelligence.sql` 중 **해당 4개 테이블만** 떼어 새 마이그레이션 파일로 | 기존 19테이블과 이름 충돌 없음(실측). additive |
| M2 | `earthus_news_article` (기사) | 신규 DDL 필요 | **본문 저장 금지** — `regional-news` 주석의 저작권 규칙(제목·링크·시각·매체만)을 DDL 제약으로 박아야 한다 |
| M3 | `earthus_claim` (주장) | 신규 DDL 필요 | `v11/claims/claim-gate.js` 의 claimType 어휘와 맞춰야 한다 |
| M4 | `earthus_context_snapshot` (문맥) | 신규 또는 S3 JSON | 자료량이 크다 → **S3 권고**, DB 에는 포인터만 |
| M5 | `earthus_impact_assessment` | 신규 DDL | 계산기가 없으므로 `status='UNKNOWN'` 만 들어간다. 빈 테이블을 만들 가치가 있는지 판단 필요 |
| M6 | `earthus_simulation_run` | **신규 DDL 금지 권고** | `research-runtime` 이 이미 SQLite 원장을 갖는다. **두 번째 원장을 만들면 진실이 둘이 된다.** 사건 ↔ 실행 연결표(`event_id` ↔ `research run id`)만 둔다 |
| M7 | `forme_funnel_events` 계열 허용목록 | 이미 있는 방식 | 새 이벤트명을 추가하면 `tools/v1/test_for_me_row.mjs` 가 대조한다 |

적용 방법(기존과 같게): Supabase SQL Editor 에 파일 그대로 붙여 실행. 자동 적용 파이프라인은 없다.
`release_state default 'SHADOW'` 를 유지한다 — 기본 비공개.

---

## 11. 위험 요소

| 등급 | 위험 | 왜 | 완화 |
|---|---|---|---|
| **최상** | ZIP 을 "완성된 엔진"으로 대우하는 것 | 953줄 골격이고 SNS 부분은 우리 코드 복사본이다. `docs/ENGINE_COVERAGE.md` 는 "Implemented as executable code" 로 11항목을 적지만 **실제 코드는 어댑터 인터페이스와 메모리 Map 뿐**이다 | 문서 주장을 구현 증거로 쓰지 않는다. 등급 A/B/C 표(§4)만 따른다 |
| **최상** | 다섯 번째 검증 어휘 도입 | `LAYER_TRUTH` 109항목 · 배지 렌더러 · `engine-bridge.js` 변환표가 전부 `EVIDENCE_KIND` 에 묶여 있다 | `VerificationState` 를 **도입하지 않는다.** 필요하면 `EVIDENCE_KIND` × `DATA_STATE` 조합으로 표현 |
| **최상** | `not_available` 을 `available` 로 바꾸는 배선 | FLOOD/GLOF 계산기가 없다. 어댑터만 꽂으면 `not_available` 이 `unavailable`(자료오류)로 오해되거나 `available` 로 승격된다 | `sim-questions.test.mjs` 가 이미 막는다. 시뮬 능력 3개를 늘리지 않는다 |
| **상** | 사건 id 변경 | 공개 URL(`live=`·`base=`·`cloud=`) 과 `tc-`/`eq-` 주소가 얼려져 있고 테스트 2건이 검사한다 | 새 id 를 만들지 않는다. ZIP id 는 내부 조인 키로도 쓰지 않는다 |
| **상** | `v2-three` / `v2-deploy` 한쪽만 수정 | 거울 41파일. 갈라지면 배포된 `/v2/` 가 다르게 동작한다 | 두 트리를 같은 커밋에서 함께 고친다 |
| **상** | V1 트리 이동 | `v2-three/js/engine-bridge.js` 등이 `../../js/earthus2/v02/...` 로 V1 을 참조한다 | 경로를 옮기지 않는다 |
| **상** | 동시 세션 충돌 | 작업트리 233건 변경 + 살아 있는 worktree 2개 | 내가 만든 hunk 만 다룬다. `git checkout .` / 광범위 되돌리기 금지 |
| **상** | 기사 본문 저장 | `regional-news`·`news-brief` 주석이 명시적으로 금지. ZIP `NewsArticle` 은 `content?: string` 을 갖는다 | `content` 칸을 쓰지 않는다. DDL 에서도 빼거나 길이 제약을 박는다 |
| **상** | 자동 게시 | ZIP `Publisher.publishEventUpdate()` 인터페이스가 자동 발행을 유혹한다 | `aws/distribution/handler.py` 규칙 유지 — 후보까지만. `social-admin` 승인 문 우회 금지 |
| **중** | TypeScript 도구 신규 도입 | 저장소 전체가 번들러 없는 ESM. `tsc` 산출물이 캐시버스터(`?v=`) 관행과 충돌 | JS ESM 이식(§5-D (b)) 권고 |
| **중** | `engines/dist/**` 커밋 | 빌드 산출물 오염. 메모리 기록의 `._*` 96k 오염 사건과 같은 종류 | dist 를 저장소에 넣지 않는다 |
| **중** | KMA 허브 용량 | 키 하나를 Lambda 15개가 공유. 새 Lambda 가 호출을 더하면 특보·AWS·부이가 한꺼번에 묵는다 | 새 수집 Lambda 를 추가하지 않는다. 기존 S3 산출물을 읽는다 |
| **중** | 신규 S3 접두사 | 공개 접두사가 `reports/published/` 와 몇 개로 고정. 새 접두사는 403 이 난다(실측 전례: `air/`→`wind/`, `gk2a/`→`clouds/gk2a`) | 기존 `events/` 아래에 쓴다 |
| **중** | `research-runtime` 을 공개 경로에 붙이기 | 127.0.0.1 전용, 인증·테넌트 격리·작업 큐 없음. README 가 명시적으로 경고 | 바인딩을 바꾸지 않는다. 사건→실행은 사람이 트리거하는 경로로 둔다 |
| **하** | `impact` 빈 테이블 | 계산기 없이 `status:'UNKNOWN'` 만 쌓인다 | 자료구조는 정의하되 테이블 생성은 계산기가 생길 때로 미룬다 |

---

## 12. PHASE 2 매핑 제안 — **승인 대기, 아직 구현하지 않았다**

지시서 A~H 에 대한 실측 기반 답이다. 각 항목에 **결정 필요**가 붙은 것은 내가 정할 수 없다.

```
DATA                      S3 JSON (events/ wind/ ocean/ clouds/ solar/ tourism/)
                          + Lambda 83종 수집·계산
   ↓
EVIDENCE / PROVENANCE     v11/evidence/evidence-graph.js  +  DB earthus_evidence_node/edge (M1)
   ↓
EARTH EVENT               v11/event/event-fusion.js  +  DB earthus_event_cluster (M1)
   ├── NEWS               aws/gdelt-events → events/global.json
   │                      aws/news-brief   → events/briefs.json
   │                      aws/regional-news→ events/regional-news.json
   │                      v11/news/geospatial-news-fusion.js (정규화)
   ├── INTELLIGENCE       v2-three/js/intel-feed.js + event-room.js + v11/orchestrator
   ├── EARTH CONTEXT      event-room.js SRC 표 + live-layers.js fetch 표 → ContextAdapter 로 감싸기
   └── IMPACT             ★ 없음 — 자료구조만 정의
   ↓
FORECAST / SIMULATION     services/research-runtime (모델 2종) · aws/tsunami-eta · aws/lab-events
   ↓
3D EARTH                  V1 Cesium layers/*  ·  V2 Three.js  ·  V3 종이 canvas
   ↓
SNS FACTORY               aws/distribution (sources/ 에 새 어댑터로 합류)
```

| | 질문 | 실측 기반 답 |
|---|---|---|
| **A** | EarthEvent 저장 위치 | 1차: **S3 `events/global.json` 확장** (기존 계보, 앱이 이미 읽는다). 2차: M1 의 `earthus_event_cluster` (색인·조회용). **결정 필요** — 진실의 원본을 S3 로 둘지 DB 로 둘지 |
| **B** | NewsArticle 저장 위치 | `events/global.json`(GDELT) · `events/regional-news.json`(RSS) · `events/briefs.json`(브리핑) **3파일 유지**. DB 표는 M2 로 색인만. ⚠️ `content` 저장 금지 |
| **C** | Source / Evidence / Claim 연결 | `v11/evidence/evidence-graph.js` 의 노드/엣지를 정본으로. ZIP 의 `independenceGroup` 계수 규칙을 그 클래스에 메서드로 추가. Claim 은 `v11/claims/claim-gate.js` 어휘로. **ZIP `Claim.state`(VerificationState)를 쓰지 않는다** |
| **D** | Earth Context 재사용 대상 | `event-room.js SRC`(태풍공식·ECMWF·KMA부이·KHOA침수·특보·쓰나미) + `live-layers.js`(구름·바람·기온·강수·PM·해양·산불·번개·지진·관광) + `v02/geo/bathymetry-policy.js`. **새 수집기를 만들지 않는다** (KMA 용량 위험) |
| **E** | Impact 가 호출할 것 | 오늘 호출할 수 있는 것: `aws/tsunami-eta`(도달시간) · `v11/environment/transport-simulator.js`(오염 수송). 그 밖은 **없다** → `status:'UNKNOWN'` |
| **F** | SimulationRun ↔ 기존 결과 | `research-runtime` 계약을 원본으로 두고, **연결표만** 새로 만든다: `{event_id, runtime:'research-runtime', runId, modelId, modelVersion, validationPlanId}`. ZIP 의 `inputManifest`/`forcingManifest` 2칸으로 눌러 담지 않는다 |
| **G** | Cesium Event Layer 붙일 곳 | V1 `prototype/js/layers/events.js`(뉴스, confirmed/unconfirmed 2단계 유지) + `eventfocus.js`(초점). 새 레이어를 만들 경우 `layers/registry.js` 에 등재 + `panels.js` 배타성. ⚠️ V2·V3 는 Cesium 이 아니다 |
| **H** | SNS Factory 호출 시점 | `aws/distribution/sources/` 에 **뉴스 어댑터 추가**. 호출 조건: 사건이 `confirmed` + `eligibility` 통과 + `HUMAN_ONLY_MARKERS` 없음 + 사람 승인. **뉴스 수신이 게시를 촉발하는 경로를 만들지 않는다** |

---

## 13. 통합 전에 사용자 결정이 필요한 것 (4건)

1. **"V3 Simulation"의 정의.** `services/research-runtime`(해양 표류 2모델)을 그 이름으로 읽고 통합할지,
   아니면 시뮬레이션 연결을 이번 범위에서 빼고 `aws/tsunami-eta` 만 붙일지.
2. **EarthEvent 진실의 원본.** S3 JSON(기존 계보, 앱이 바로 읽음) vs Supabase 테이블(조회·조인 가능, 새 쓰기 경로 필요).
3. **TypeScript 도입 여부.** `typescript` devDependency 추가 vs 채택분을 JS ESM 으로 이식(권고).
4. **News Home 신설 여부.** 지시서 PHASE 9 의 7블록 화면은 저장소에 없는 새 화면이다.
   V2 의 현상 메뉴 구조와 어떻게 공존할지 — 새 페이지인지, V2 안의 탭인지.

---

## 14. 이 감사에서 확인하지 못한 것 (정직한 공백)

- ZIP `engines/` 의 `npm test`(tsc 빌드 경로) — TypeScript 미설치로 **미측정**. `dist/` 사전빌드만 돌렸다.
- 브라우저 검증(playwright) — 환경 문제로 실행하지 않았다. baseline 캡처 27장과의 대조 미실시.
- `services/research-runtime/tests` — 과학 계산 의존성(OceanParcels 3.1.4) 설치 여부 미확인, **미실행**.
- S3 운영 산출물의 현재 내용(`events/global.json` 의 실제 사건 수·점수 분포) — 이 감사는 코드만 읽었다.
- `aws/` 83 Lambda 전체의 배포 상태(어느 것이 실제로 스케줄 돌고 있는지) — `aws/health/handler.py` 의
  감시 목록으로 일부 추정만 했다.
- `.claude/worktrees/` 2개 worktree 안의 미커밋 작업 내용 — 다른 세션 소유라 읽지 않았다.

---

## 부록 A — 실측 규모

| | 수 |
|---|---|
| `aws/` handler.py | 83 |
| `aws/` Python 테스트 파일 | 50 |
| `prototype/js/earthus2/` .js | 293 |
| `prototype/js/` 최상위 .js | 168 |
| `prototype/js/layers/` .js | 31 |
| `prototype/v2-three/js/` .js | 41 (`v2-deploy` 거울) |
| `tools/` 최상위 .mjs | 224 |
| `docs/` | 129 |
| 적용된 DB 마이그레이션 | 17 (테이블·뷰 19) |
| Supabase Edge Functions | 9 |
| ZIP 실제 코드 | 953줄 / 파일 65개 |

## 부록 B — 이번 세션 실행 기록

```
git rev-parse --abbrev-ref HEAD          → earthus-v2/real-living-earth-render
git log -1 --oneline                     → 3c577d15
git status --porcelain | wc -l            → 233  (?? 182)
node -v                                  → v24.18.0
python --version                          → Python 3.12.10
npx --no-install tsc -v                  → FAIL (missing packages)

npm test                                  → tests 139 / pass 139 / fail 0
python -m pytest aws/distribution/tests -q → 325 passed, 6 skipped, 21 subtests (34.32s)
node --test tools/earthus2-v11/*.test.mjs → tests 65 / pass 65 / fail 0
node --test <ZIP>/engines/dist/tests/unified-engine.test.js
                                          → tests 5 / pass 5 / fail 0

diff <ZIP SNS>/aws/distribution/executor.py   ↔ repo → IDENTICAL
diff <ZIP SNS>/aws/distribution/rate_limit.py ↔ repo → IDENTICAL
diff <ZIP SNS>/aws/distribution/verify_live.py↔ repo → IDENTICAL
```

ZIP 은 `C:\Users\Dalur\AppData\Local\Temp\claude\...\scratchpad\zipwork\` 에 풀었다.
**저장소 안에 복사하지 않았다.**
