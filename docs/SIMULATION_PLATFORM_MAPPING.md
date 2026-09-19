# SIMULATION PLATFORM — 현황 지도와 최소 어댑터 계약

작성 2026-09-13 · PHASE 2-5 · `earthus-v2/real-living-earth-render` @ `3c577d15`
선행 [V3_UNIFIED_ENGINE_INTEGRATION_AUDIT.md](V3_UNIFIED_ENGINE_INTEGRATION_AUDIT.md) ·
[EARTH_EVENT_CANONICAL_MODEL.md](EARTH_EVENT_CANONICAL_MODEL.md)

> **명칭 규약** — 이 저장소에 "V3 Simulation Engine" 이라는 완성된 별도 엔진은 없다.
> 이후 문서와 코드에서 그 표현을 쓰지 않는다. 시뮬레이션 기반을 가리킬 때는
> **Simulation Platform** (총칭) 과 **research-runtime** (구체 구현) 으로 적는다.

---

## 0. 결론 먼저

### 0.1 오늘 존재하는 계산 엔진 5종 (전수)

| # | 엔진 | 모델 식별자 | 성격 | 상태 |
|---|---|---|---|---|
| 1 | research-runtime V1 | `surface-passive-advection.v1` / `0.1.0` | 표층 수동 입자 표류 (RK4) | **manifest·검증·재현 완비.** 로컬 전용 |
| 2 | research-runtime V2 | `surface-passive-advection.v2.windage` / `0.1.0` | V1 + 풍압(windage α) | **manifest·검증·재현 완비.** 로컬 전용 |
| 3 | 쓰나미 도달시간 | `eta-v1` (`earthus.tsunami-eta.v1`) | 장파 c=√(g·h) Dijkstra | **운영 중.** S3 배치, 15분 스케줄 |
| 4 | LAB 추정·채점 8현상 | 모델 식별자 없음 | 지속성/경험식 추정 + 실측 대조 MAE | **운영 중.** S3 배치 |
| 5 | 오염 수송 | 모델 식별자 없음 | 벡터장 궤적 (MODELLED 강제) | 코드 있음 · 화면 배선 없음 |

그 밖 브라우저 내 계산(`sim-ocean.js` Gerstner 파도, `sat-layer.js` SGP4)은
**장면 표현**이지 기록 남는 실행이 아니다. `simulation_run` 대상이 아니다.

### 0.2 지시서가 요구한 `SimulationRun` 9칸 대조

| 지시서 요구 | research-runtime | tsunami-eta | lab-events |
|---|---|---|---|
| `event_id` | ✗ (사건 개념 없음 — 연결이 이번 작업) | ✓ `event.usgsId` | ✓ `<kind>:<sourceId>` |
| `model_family` | ✓ `modelId` | ✓ `modelVersion` `eta-v1` | ✗ |
| `model_version` | ✓ `modelVersion` + registry 일치 검사 | ✓ | ✗ |
| `input_manifest` | ✓ `datasetVersions[]` + `datasetSha256` + `specSha256` | △ `gridSha256` 하나 | ✗ |
| `forcing_manifest` | ✓ `windDataset` + `windage`(V2) | △ 수심 격자가 곧 강제자료 | ✗ |
| `assumptions` | ✓ `boundaryPolicy`·`landPolicy`·`interpolation`·`velocityConversion` | ✓ `method.limits[]` 5개 | ✓ 각 현상 주석 |
| `output` | ✓ `trajectories[]` + `summary` | ✓ `stations[]`·`isochronesMin` | ✓ `detail` |
| `validation` | ✓ `validationPlanId` 사전등록 + `validation_v2.py` + verdict 해시 | △ PTWC 게시문 ETA 대조 (`official.matched`) | ✓ forecast/actual MAE (`score_rows`) |
| `timestamps` | ✓ | ✓ `occurredAt`/`computedAt` | ✓ |

**research-runtime 이 9칸을 거의 다 채운다.** 빠진 것은 `event_id` 하나 —
그것이 이번 작업의 정확한 범위다.

### 0.3 없는 것을 있다고 쓰지 않는다

| 지시서 예시 | 실제 |
|---|---|
| FLOOD Simulation | **없다.** `sim-questions.js` 가 `ocean.coastal_inundation` 을 `not_available` 로 명시 |
| GLOF Simulation | **없다.** `hazards/glof` 레이어는 있으나 `LAYER_TRUTH` 항목조차 없다 |
| STORM Simulation | **없다.** `hazards.typhoon` 은 `limited` — 기관 공식 예보 경로를 옮기는 것뿐 |

`sim-questions.js` 의 `SIM_STATUS` 5종과 `SIM_CAPABILITIES` 표가
**저장소 안에서 "무엇이 없는지"를 공개하는 정본**이다. 잠긴 시험
`tools/earthus-v53/simulation-questions.test.mjs` 가 "시뮬레이션 능력은 정확히 3개다" 를 검사한다.
이 3개를 늘리려면 실제 엔진이 먼저 있어야 한다.

---

## 1. 모델 1 — `surface-passive-advection.v1`

| 항목 | 값 |
|---|---|
| **model name** | `surface-passive-advection.v1` · `MODEL_VERSION = "0.1.0"` (`research_runtime/models.py:19`) |
| **input** | `ExperimentSpec` (JSON, `contracts/experiment.schema.json`). 필수 15칸: `schemaVersion, projectId, question, modelId, modelVersion, datasetVersions, area, startTimeUTC, durationSeconds, releaseDefinition, particleCount, integrationMethod, integrationStepSeconds, outputStepSeconds, boundaryPolicy`. 선택: `backend, metrics` |
| **forcing** | `{manifest, grid}` JSON 자료 1종. `grid` = `lon, lat, timeUTC, u[t][lat][lon], v[t][lat][lon], landMask[lat][lon]`. u 동향 m/s · v 북향 m/s · 육지 true. 시간축 최소 2프레임, 전 기간 커버. `timeStepSeconds` 와 모든 프레임 간격이 일치해야 함 (빠진 프레임을 넓은 보간으로 숨기지 않는다) |
| **output** | `{ schemaVersion:"1.0", qualityStatus: COMPLETE\|PARTIAL, trajectories[{samples[{timeUTC,lon,lat,status}], finalStatus}], summary{particleCount, statusCounts, durationSeconds, elapsedSeconds, meanDisplacementMeters, maxDisplacementMeters, displacementMeters[], boundaryTimeResolutionSeconds, observationValidation}, provenance{…} }`. 입자 상태 5종 `ACTIVE STRANDED OUT_OF_DOMAIN MISSING_FORCING COMPLETED` |
| **manifest** | 자료 manifest 필수 텍스트칸: `datasetId, version, evidenceKind, sourceURI, provider, citation, license` + 깊이·격자·좌표·단위·달력·발행/유효/수집시각·처리이력·`sha256`. `evidenceKind ∈ {OBSERVATION, ANALYSIS, REANALYSIS, FORECAST, SYNTHETIC_TEST}` (`datasets.py:17`) |
| **validation** | `preflight(spec, dataset)` 사전검사 → `validation.py` 가 고정 궤적을 **출처 해시된 표류부이 관측**과 대조. 머리말: *"This reports observed errors and baselines, never scientific acceptance."* UTC 미일치·드로그/깊이/QC/독립성 근거 없음은 **0 오차가 아니라 제외**다 |
| **runtime entrypoint** | `registry.MODELS["surface-passive-advection.v1"]["run"](spec, dataset, wind=None, progress=, cancelled=)` → `models.run_experiment()` |
| **storage** | SQLite 원장 `services/research-runtime/<dir>/research.sqlite3` — 표 2개: `objects(id, kind, created, body)` · `submissions(key, digest, run_id)`. kind = dataset/project/experiment/run |
| **reproducibility** | ① `modelSourceSha256` — 소스 4파일 스냅샷 해시. 실행 중 디스크가 바뀌면 `runtime source changed since import` 로 **거부** ② `dependencyLockSha256` — `dependencies.lock.txt` 해시, 바뀌면 거부 ③ `specSha256` ④ `datasetSha256` + `sourceSha256` ⑤ `resultArraySha256` ⑥ `python`·`platform`·`dependencies{}` 실제 버전 ⑦ idempotency key: 같은 키에 다른 요청은 오류 |
| **API/batch entrypoint** | HTTP `POST /api/research/runs` (127.0.0.1:8788, `Idempotency-Key` 헤더). CLI `research_runtime/cli.py`. SDK `ResearchClient()` (`client.py`). 브라우저 `/v2-three/research.html` |

과학적 가드 (`models.py` 머리말): *"OceanParcels is the only backend accepted for real forcing."*
`PARCELS_VERSION = "3.1.4"` 불일치면 native 백엔드 거부. 의존성 없는 참조 RK4 는
**`SYNTHETIC_TEST` 로 명시된 입력에만** 허용.

미포함 (README 명시): 곡선/C-grid · 3차원 흐름 · 확산 · Stokes drift · 유류 풍화.

---

## 2. 모델 2 — `surface-passive-advection.v2.windage`

| 항목 | 값 |
|---|---|
| **model name** | `surface-passive-advection.v2.windage` · `0.1.0` (`models_v2.py:25`) |
| **수식** | `u_particle = u_HYCOM(15 m) + α · U10` (m/s + 무차원 × m/s) |
| **input** | `contracts/experiment-v2.schema.json`. V1 필수 15칸 + **`questionId, validationPlanId, windDataset, windage`** |
| **forcing** | 해류 자료 1종 + **풍자료 1종**(`wind.py`, `WIND_READER_VERSION`, `validate_wind_dataset()`). 합성 강제자료가 `RegularGrid` 를 duck-type 해서 **V1 의 RK4·경계 이분법·구간 가드가 그대로 돈다** → Python 참조와 OceanParcels 커널이 "windage 를 모든 RK4 단계에 적용한다"는 정의를 하나로 공유 |
| **α 제약** | `ALPHA_MIN=0.0, ALPHA_MAX=0.05`. **spec 에 반드시 있어야 한다 (암묵 기본값 없음)**. 출처가 provenance 에 함께 기록됨 |
| **α 출처** | `WINDAGE_SOURCE` = Niiler & Paduan 1995 (드로그 SVP 하류 slip 0.7 cm/s per 10 m/s) — Lumpkin & Pazos 인용; leeway 형식 `u_d = u_o + α·U10` (Sutherland et al. 2020 / Breivik & Allen 2008). `WINDAGE_REFERENCE` 에 URL 2개 |
| **output** | V1 과 동형 + windage 항 provenance |
| **manifest** | V1 + 풍자료 manifest. 소스 스냅샷 7파일 (`__init__, datasets, models, cli, wind, models_v2, registry`) |
| **validation** | `validation_v2.py` + `comparison_v2.py`(같은 방출 조건 짝비교 / 다른 조건 집단 요약) + `evidence_v2.py` |
| **runtime entrypoint** | `registry.MODELS[...]["run"](spec, dataset, wind, **kw)` → `models_v2.run_experiment()` · `needsWind: True` |
| **storage** | V1 과 같은 SQLite 원장 |
| **reproducibility** | V1 전부 + `model_commit()` (git 커밋) + V1 소스 무결성까지 함께 검사 (`v1._check_loaded_source()`) |
| **API/batch entrypoint** | V1 과 동일 경로. `cli_v2.py` 별도 |

### 2.1 증거 꾸러미 — `evidence_v2.EvidencePackage`

```
manifest.json = { schemaVersion, createdAtUTC, package,
                  files{이름→sha256}, externalInputs{외부 입력 해시},
                  lineage: 질문 → 계획 → 자료 → 모델 → 실행 → 결과 → 판정 }
note: "Copy the whole directory; every claim in verdict.json resolves to a hashed file
       here or to an externalInputs hash."
```

**이 `lineage` 7단계가 정본 사슬이다.** `simulation_run` 이 사건에 붙을 때
이 사슬의 머리에 **사건**이 하나 더 붙는 형태가 된다:

```
사건 → 질문 → 계획 → 자료 → 모델 → 실행 → 결과 → 판정
```

---

## 3. 모델 3 — 쓰나미 도달시간 (`eta-v1`)

| 항목 | 값 |
|---|---|
| **model name** | `MODEL_VERSION = "eta-v1"` · 출력 스키마 `earthus.tsunami-eta.v1` · 배지 `SIMULATION_ONLY` 고정 |
| **input** | `events/tsunami-intl.json` 의 USGS 사건. 조건 `MIN_MAG = 6.5`, `MAX_DEPTH_KM = 100.0`, 바다 지진 |
| **forcing** | `ocean/depth-grid.bin` (GEBCO 0.1° 최심 → 0.2° 축약) + `ocean/depth-grid.manifest.json` |
| **output** | `ocean/tsunami-eta/{usgsId}.json` — `event{}`, `time{occurredAt, computedAt, retrievedAt}`, `method{ko, limits[5], gridSha256}`, `stations[]`(38 연안 — 한국 10·태평양 28. 2026-09-20 정정: 예전 '39' 는 틀렸다), `reachedCount`, `nearestKorea`, `isochronesMin`(30·60분 등시선), `official{matched, …}`. 색인 `ocean/tsunami-eta.json` (`earthus.tsunami-eta-index.v1`, 최근 30일) |
| **manifest** | `method.gridSha256` = 수심 격자 manifest 의 `output.sha256` 하나 |
| **validation** | PTWC 게시문 ETA 표와 대조 → `official.matched`. **게시문에 ETA 표가 없으면 `null`** (0 으로 채우지 않는다) |
| **runtime entrypoint** | `handler(event=None, context=None)` (`handler.py:384`) |
| **storage** | S3. 사건별 파일은 **불변에 가깝게** — 같은 사건은 다시 계산하지 않는다 |
| **reproducibility** | 격자 해시 + 모델 버전 + 방법·한계 문장이 산출물에 함께 들어간다. 소스 해시는 없다 |
| **API/batch entrypoint** | 15분 스케줄 (`aws/configure-tsunami-eta-schedule.sh`) |
| **소비자** | `prototype/js/tsunami-eta.js` · `event-room.js TSU_ETA_URL` · `sim-questions.js hazards.tsunami` |

한계를 산출물에 그대로 적는 방식이 이 엔진의 핵심이다 (`method.limits`):
0.2° 격자(적도 약 22 km)라 해협·내만 오차 · 진원을 점으로 봄(M8+ 단층 길이 무시) ·
8방향 경로가 직선보다 최대 약 8% 길다 · 파고·침수·피해가 아니다 · 공식 경보가 아니다.

⚠️ 함정(기존 기록): 색인에 없는 사건의 파일을 찔러 보면 S3 가 **403** 을 낸다.
`event-room.js etaIndexHas()` 가 색인을 먼저 보고 있는 사건만 받는다. 이 순서를 지킨다.

---

## 4. 모델 4 — LAB 추정·채점 8현상

| 항목 | 값 |
|---|---|
| **model name** | 없음 (현상별 함수). `KINDS = ("earthquake","aurora","smoke-ash","air-pollution","ocean-drift","bird-migration","marine-bloom","space-reentry")` |
| **input** | 현상별 실제 자료 — USGS FDSN · NOAA SWPC Kp · VAAC + FIRMS · 에어코리아 + CAMS · Argo · 국립생물자원관 · OBIS + 해수온 · CelesTrak SATCAT |
| **forcing** | 없음 (관측 시계열이 곧 입력) |
| **output** | `analysis/<kind>-reports.json` → 색인 `ocean/lab-reports.json`. 세션 원문은 비공개 `archive/` |
| **manifest** | 없음. `provenance.DATASET_PROVENANCE` 가 자료원을 댄다 |
| **validation** | **있다.** `score_rows(rows)` = `[{forecast, actual}]` 의 평균 절대 오차. 예: 지진은 Reasenberg-Jones 일반형 `rj_expected(mag, m_min, t1, t2)` 기대 여진수 → 실제 USGS 여진수 대조. 오로라는 우리 지속성 추정과 SWPC 예보를 **같은 관측으로 함께 채점** |
| **runtime entrypoint** | `handler()` (`aws/lab-events/handler.py`) |
| **storage** | S3 (`analysis/` 비공개 + 색인은 `ocean/` 공개) |
| **reproducibility** | 낮다 — 소스·입력 해시 없음. 산출물에 `scores[]` 와 방법 문장만 |
| **API/batch entrypoint** | 스케줄 (`aws/deploy-lab-events.sh`) · 시험 `aws/lab-events/tests/test_engines.py` |
| **진리등급** | `lab_report.KIND_TRUTH` 9종 — 원자료 등급이 현상마다 다르다 |

원칙(머리말): *"예보를 만들지 않는다. 기관 발표·관측을 옮기고, 우리 계산은 '추정'이라 부르며
반드시 검증 수치와 같이 낸다. 자료가 없는 현상을 예시로 채우지 않는다."*
`bird-migration` 은 올해 실시간 자료원이 없어 **그렇게 적는다**. `marine-bloom` 은 검증 없음을 적는다.

---

## 5. 모델 5 — 오염 수송 (`v11/environment/transport-simulator.js`)

| 항목 | 값 |
|---|---|
| **model name** | 없음 |
| **input** | 오염 사건 + 벡터장 |
| **validation** | `claim-gate.js RULES.TRANSPORT = ['vectorProof','transportEvidenceKind']` — 벡터 증명이 없으면 라벨을 주지 않는다 |
| **DDL 초안** | `earthus_pollution_transport_run(transport_run_id, pollution_event_id, vector_source_id, vector_kind, started_at, trajectory jsonb, evidence_kind default 'MODELLED', source_attribution_status default 'SOURCE_NOT_ATTRIBUTED', release_state default 'SHADOW')` |
| **상태** | 코드·DDL·시험(`tools/earthus2-v06` 2건: *pollution transport is blocked without vector proof*) 있음. **화면 배선 없음** |

`source_attribution_status` 기본값이 `SOURCE_NOT_ATTRIBUTED` 다 — "어디서 왔는지 모른다"가 기본.
이 태도를 `simulation_run` 설계에도 그대로 가져간다.

---

## 6. 최소 어댑터 계약

### 6.1 설계 원칙

1. **원장을 둘로 만들지 않는다.** research-runtime SQLite 가 실행 원본이다.
   Postgres 에는 `event_id ↔ run` 연결과 조회용 요약만 둔다.
2. **문자열 2칸으로 눌러 담지 않는다.** ZIP `inputManifest`/`forcingManifest` 는
   `datasetVersions[]` + `windDataset` + `validationPlanId` 를 담을 수 없다.
3. **어댑터는 실행하지 않는다.** 사건이 시뮬레이션을 자동으로 돌리지 않는다.
   research-runtime 은 127.0.0.1 전용이고 인증·테넌트 격리·작업 큐가 없다(README 경고).
   → 어댑터는 **① 실행 요청을 만든다(사람이 승인해 돌린다) ② 끝난 실행을 사건에 붙인다**
   두 방향만 한다.
4. **없는 모델을 부르지 않는다.** `resolve()` 가 미등록 modelId 를 거절하는 것과 같은 태도로,
   어댑터도 등재된 런타임 4종 밖은 거절한다.

### 6.2 계약 (언어 중립 형태)

```
SimulationRuntime  =  'research-runtime' | 'tsunami-eta' | 'lab-events' | 'transport-simulator'

── 요청 방향 (사건 → 플랫폼) ─────────────────────────────────────────────
SimulationRequest {
  eventId            NN   {kind}-{sourceId}
  runtime            NN   SimulationRuntime
  modelId            NN   런타임이 등재한 식별자. 없으면 거절
  modelVersion       NN
  spec                    런타임별 원형 그대로 (research-runtime 이면 ExperimentSpec)
  reason             NN   왜 이 사건에 이 모델을 돌리는가 (사람이 읽는 문장)
  requestedBy        NN   사람 식별자. 시스템 계정은 요청할 수 없다 (governance.py §2 태도)
}
→ 어댑터는 실행하지 않고 요청서를 저장한다.  status = 'REQUESTED'

── 등재 방향 (플랫폼 → 사건) ─────────────────────────────────────────────
SimulationRunRecord {
  runRef             NN   {runtime}:{runId}                      ← PK
  eventId            NN   FK → earth_event
  runtime            NN
  modelId            NN
  modelVersion       NN
  status             NN   REQUESTED QUEUED RUNNING SUCCEEDED FAILED CANCELLED
  truthStatus        NN   항상 'SIMULATION'                      ← 상수. 계산하지 않는다
  specSha256              research-runtime provenance.specSha256
  datasetVersions    NN   [{ datasetId, version, sha256, evidenceKind }]
  forcing                 { kind: 'WIND'|'DEPTH_GRID'|'VECTOR_FIELD'|'NONE',
                            ref, sha256, params }                 V2 면 { windDataset, windage: α, alphaSource }
  assumptions        NN   [문장]  ← 비울 수 없다. 런타임이 준 것을 그대로 옮긴다
  limits             NN   [문장]  ← tsunami-eta method.limits 같은 것
  validation         NN   { planId, performed: bool, method, result, resultRef }
                          performed=false 면 result 는 null. 0 으로 채우지 않는다
  reproducibility         { modelSourceSha256, dependencyLockSha256, resultArraySha256,
                            engineVersion, python, platform, commit }
                          런타임이 안 주는 칸은 null. 있는 척하지 않는다
  outputRef          NN   S3 키 또는 런타임 경로
  lineage                 evidence_v2 manifest 의 lineage 배열 (있으면)
  occurredAt / computedAt / retrievedAt / createdAt
}
```

### 6.3 런타임별 채움 정도 (실측)

| 칸 | research-runtime V1/V2 | tsunami-eta | lab-events | transport-simulator |
|---|---|---|---|---|
| `modelId` / `modelVersion` | ✓ / ✓ | `tsunami-eta` / `eta-v1` | **null** | **null** |
| `specSha256` | ✓ | null | null | null |
| `datasetVersions[]` | ✓ (sha256·evidenceKind 포함) | 1건 (`gridSha256`) | null | 1건 (`vector_source_id`) |
| `forcing` | ✓ (V2 는 windage+출처) | `DEPTH_GRID` | `NONE` | `VECTOR_FIELD` |
| `assumptions` | ✓ 4종 | ✓ | 주석뿐 → 옮겨야 함 | ✓ |
| `limits` | README 미포함 목록 | ✓ 5개 | 현상별 | ✓ |
| `validation.performed` | ✓ true/false | ✓ (`official.matched`) | ✓ (MAE) | false |
| `reproducibility` | ✓ 7칸 | 격자 해시만 | 없음 | 없음 |
| `lineage` | ✓ 7단계 | 없음 | 없음 | 없음 |

**null 을 그대로 null 로 둔다.** `model_family: "UNKNOWN"` 같은 문자열로 채우지 않는다 —
그러면 "모델이 UNKNOWN 이라는 모델"이 생긴다.

### 6.4 어댑터 구현 위치 (PHASE 3 예정)

```
aws/_shared/simulation_link.py        런타임 4종 등재표 + SimulationRunRecord 검증
                                      · 미등재 runtime/modelId 거절
                                      · truthStatus 를 'SIMULATION' 으로 강제
                                      · assumptions/limits 빈 배열 거절
                                      · validation.performed=false 인데 result 있으면 거절
aws/earth-events/handler.py           등재 방향: 사건에 기존 실행을 붙인다
                                      · tsunami-eta 색인(ocean/tsunami-eta.json)을 읽어 eq- 사건에 연결
                                      · lab-reports 색인을 읽어 LAB 사건에 연결
prototype/v2-three/js/sim-link.js     요청 방향 UI (사람이 승인해 돌린다)
                                      · sim-questions.js SIM_CAPABILITIES 와 대조해
                                        not_available 이면 요청 버튼을 만들지 않는다
```

⚠️ research-runtime 은 **연결하지만 자동 실행하지 않는다.**
공개 앱에서 127.0.0.1:8788 을 부를 수 없고, 불러서도 안 된다(인증 없음).
연결은 "사람이 로컬에서 돌린 실행을 사건에 등재하는" 방향으로 먼저 만든다.

---

## 7. 향후 Flood / GLOF 를 어디에 연결하나 (지시서 질문 H)

**새 물리 엔진을 만들지 않는다.** 붙일 자리만 정해 둔다.

```
① 능력 선언          prototype/v2-three/js/sim-questions.js  SIM_CAPABILITIES
                     · 지금 ocean.coastal_inundation = not_available
                     · hazards.glacial_lake_flood 는 SIM_CAPABILITIES 에 항목 자체가 없다
                     · 엔진이 생기면 여기에 engineRef(실제 파일 경로)와 함께 status 를 올린다
                     · 잠긴 시험이 "engineRef 는 실제 파일이다"를 검사한다

② 모델 등재          research-runtime research_runtime/registry.py  MODELS
                     · 등재하면 modelVersion 일치 검사·소스 해시·의존성 잠금이 자동으로 붙는다
                     · 새 모델은 여기에 넣는 것이 가장 값이 싸다

③ 실험 계약          services/research-runtime/contracts/<model>.schema.json
                     · experiment-v2.schema.json 을 본으로 삼는다 (validationPlanId 필수 계보)

④ 사건 연결          aws/_shared/simulation_link.py  런타임 등재표에 한 줄
                     · 등재표 밖은 어댑터가 거절한다

⑤ 저장              simulation_run 표 (EARTH_EVENT_CANONICAL_MODEL.md §2.10)
                     · 스키마 변경 불필요 — datasetVersions/forcing 이 jsonb 다
```

전제 조건(이것이 없으면 ①을 올리지 않는다):
- 입력 자료가 실제로 있고 manifest·라이선스가 확인됐다
- 검증 계획(`validationPlanId`)이 사전등록됐고 대조할 관측이 있다
- 한계(`limits`)를 문장으로 적을 수 있다

---

## 8. 재현성 정책 — 지켜야 하는 것

| # | 규칙 | 어디서 오는가 |
|---|---|---|
| 1 | 실행 중 소스가 바뀌면 **거부** | `models._check_loaded_source()` |
| 2 | 의존성 잠금이 바뀌면 **거부** | `dependencies.lock.txt` 해시 |
| 3 | 같은 idempotency key 에 다른 요청은 **오류** | `service.submit()` |
| 4 | `SYNTHETIC_TEST` 자료는 실제 자료로 취급하지 않는다 | `datasets.py` · README |
| 5 | 고정 OceanParcels 3.1.4 없으면 실제 해류 자료 **실행 거부** | `models._parcels()` |
| 6 | 결측 노드는 `landMask=true` · `null`. **0 대체 없음** | `netcdf_reader.py` |
| 7 | 계산 조건을 바꾸려면 **새 실험을 만든다** (기존 실험 수정 금지) | README |
| 8 | 관측 검증 실패와 계산 실패를 구별한다 | `validation.py` 머리말 |
| 9 | "표류 계산 성공 ≠ 관측 정확도 검증 성공" | README 마지막 문장 |

이 9개를 어댑터가 우회할 수 없게 `simulation_link.py` 가 검증한다.

---

## 9. 잠긴 시험

| 시험 | 위치 | 검사 내용 |
|---|---|---|
| 시뮬 능력 계약 | `tools/earthus-v53/simulation-questions.test.mjs` | 현상 66 · 상태 어휘 5 · **능력 정확히 3개** · engineRef 실제 파일 존재 · 질문 ≤3 · KO/EN 쌍 |
| research-runtime | `services/research-runtime/tests/` 6파일 (`python -m unittest discover -s tests`) | 계산·서비스·동시성·10단계 파이프라인·V2 windage·검증 |
| LAB 엔진 | `aws/lab-events/tests/test_engines.py` | 현상별 계산·채점 |
| 오염 수송 게이트 | `tools/earthus2-v06/news-tourism-environment.test.mjs` | 벡터 증명 없으면 수송 차단 · 증거 등급 명시 |

⚠️ research-runtime 시험은 이번 감사에서 **실행하지 않았다** — OceanParcels 3.1.4 등
과학 계산 의존성 설치 여부를 확인하지 못했다. PHASE 3 에서 먼저 돌려 baseline 을 잡는다.
