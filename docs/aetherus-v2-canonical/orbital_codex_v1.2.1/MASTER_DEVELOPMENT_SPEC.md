# Aetherus Orbital Environment — Master Development Specification

> Canonical machine-readable companion to `Aetherus_Orbital_Environment_개발지침서_v1.1_초상세본.docx`. If a Markdown rendering differs from the Word source, use the Word source for human-layout intent and this file for implementation semantics.

# Aetherus Orbital Environment

우주물체·우주쓰레기·SSA/STM·시민과학·개입 시뮬레이션 통합 개발지침서 v1.0

| 문서 상태 | Codex 구현용 마스터 기준서 · 2026-08-23 · 구현 누락 방지형 상세 사양 |

| --- | --- |



이 문서는 “화면이 존재한다”를 완료로 인정하지 않는다. 모든 기능은 실제 또는 검증용 데이터 입력에서 시작하여 계산, 저장, API, UI, 자동 테스트와 증거 산출물까지 연결되어야 한다. 개발자는 각 절의 완료판정 기준을 충족하기 전 다음 단계로 넘어가지 않는다.

| 핵심 원칙 | 강제 규칙 |

| --- | --- |

| 실데이터 우선 | 공개 API/공식 검증 fixture를 사용한다. 데이터가 없으면 UNAVAILABLE로 반환하며 임의 수치를 생성하지 않는다. |

| 재현성 | 모든 과학 계산은 input hash, source snapshot, algorithm/config version을 저장한다. |

| 지표 분리 | Pc, MaxProbability, miss distance, density, fragmentation score를 서로 대체하지 않는다. |

| 서비스/연구 모드 분리 | 일반인에게 쉽게 설명하되 연구모드에서 원자료·가정·오차·출처를 확인 가능하게 한다. |

| 완료 증거 | 테스트 통과 + DB 레코드 + API payload + UI 연결 + evidence manifest 없이는 DONE 금지. |

| 보안 | MVP/초기 상용 버전은 spacecraft command 기능을 제공하지 않는 advisory system으로 한정한다. |



# 문서 구성

- 1. 제품 정의와 범위

- 2. 절대 개발 규칙 및 Codex 실행 계약

- 3. 사용자군과 서비스 계층

- 4. 시스템 아키텍처

- 5. 외부 데이터 소스 및 수집정책

- 6. 내부 데이터 표준과 식별체계

- 7. 시간·좌표계·궤도 전파 엔진

- 8. Conjunction Assessment 엔진

- 9. Risk Graph 엔진

- 10. Intervention Benefit Engine

- 11. Affected Subgraph 선택적 재계산

- 12. PROTECT 역방향 엔진

- 13. Candidate OCM 기동 비교

- 14. Fragmentation / Collision Scenario Engine

- 15. Re-entry Intelligence

- 16. Rotation / Photometry Intelligence

- 17. Observation Intelligence

- 18. Citizen Science Network

- 19. Debris Genealogy / Origin Engine

- 20. Visual Asset Resolution Engine

- 21. Orbital Congestion / Orbital Weather

- 22. Orbital Footprint / Sustainability Research Index

- 23. Research Data Platform

- 24. Operations / Fleet / Removal Intelligence

- 25. API 계약

- 26. DB·저장·캐시 설계

- 27. 백엔드 서비스·잡·스케줄러

- 28. 3D UI/UX 상세

- 29. 성능·LOD·대규모 렌더링

- 30. 보안·라이선스·데이터거버넌스

- 31. 관측·연구 품질 관리

- 32. 테스트 전략

- 33. 성능 벤치마크

- 34. 구현 순서와 단계별 Hard Gate

- 35. 배포·관측성·장애대응

- 36. 상용화/과금 경계

- 37. 특허기술과 서비스기술의 경계

- 부록 A. SQL 핵심 스키마

- 부록 B. REST API 예시

- 부록 C. 알고리즘 의사코드

- 부록 D. 완료판정 체크리스트

- 부록 E. 공식 데이터/표준 출처

# 1. 제품 정의와 범위

Aetherus Orbital Environment는 지구 궤도상의 활동위성, 비활성위성, 로켓바디, 파편과 관련 관측·근접사건·재진입·연구임무를 하나의 시간축과 3D 공간에서 통합하고, 단순 “현재 위치”를 넘어 개입 전후의 우주환경 변화를 계산하는 디지털 트윈/연구·의사결정 플랫폼이다.

## 1.1 핵심 질문

| 질문 | 엔진/서비스 | 최소 출력 |

| --- | --- | --- |

| WHERE IS IT? | Orbit Engine | 위치·속도·고도·궤도·데이터 나이 |

| WHERE DID IT COME FROM? | Genealogy/Origin | 발사·부모객체·파편화 사건·국가/기관 출처 |

| WHO IS AT RISK? | CA + Risk Graph | 근접사건·위험지표·출처/불확실성 |

| WHAT IF WE REMOVE IT? | Benefit Engine | 수혜 객체·위험감소·환경수혜 |

| WHAT SHOULD WE CHANGE TO PROTECT Y? | PROTECT Query | 보호대상 중심 개입후보 순위 |

| WHAT IF THEY COLLIDE? | Fragmentation Engine | 가상 파편군·시간별 확산·영향 |

| WHAT SHOULD WE OBSERVE? | Observation Intelligence | 관측대상·시간·장소·정보이득 |

| CAN WE TRUST THIS NUMBER? | Provenance/Validation | 원천·알고리즘·스냅샷·검증상태 |



## 1.2 범위 밖(초기 버전)

- 실제 위성 기동 명령 송신, 발사체/위성 제어, 군·기밀 SSA 데이터 처리, 공식 충돌회피 권고 자동승인, 법적 제거권한의 자동판정은 범위 밖이다.

- 공개 데이터 또는 합법적으로 계약된 데이터만 사용한다. 국가·기업별 “책임”을 단정하는 지표는 만들지 않고, origin/source와 연구 지표를 구분한다.

# 2. 절대 개발 규칙 및 Codex 실행 계약

도 2-1. 개발 완료판정은 UI가 아니라 전체 데이터 경로의 증거로 결정한다.

| ID | 강제 규칙 |

| --- | --- |

| R-001 | Production 코드에 테스트 fixture 숫자를 복사하지 않는다. |

| R-002 | API가 값을 주지 않으면 UI가 추정해서 표시하지 않는다. |

| R-003 | 모든 과학 결과 payload에 provenance_id 또는 provenance object가 있어야 한다. |

| R-004 | “Risk 80” 같은 composite score는 구성식·가중치·버전을 저장하고 Research Index로 표시한다. |

| R-005 | 동일 object/conjunction의 갱신 데이터는 기존 결과를 overwrite하지 않고 버전화한다. |

| R-006 | 화면 라벨 Actual Photo / Radar / Launch Image / Simulation을 반드시 구분한다. |

| R-007 | 위험 계산의 실패를 0으로 처리하지 않는다. 0은 계산된 0일 때만 허용한다. |

| R-008 | 리스트 성능을 위해 object를 누락할 수 있지만 과학 계산 대상 누락은 검증된 conservative screening을 통과해야 한다. |

| R-009 | Codex는 단계별 evidence JSON을 남긴다. |

| R-010 | 테스트·형식·lint만 통과하고 핵심 함수가 상수 반환이면 실패다. |

| R-011 | 모든 비동기 계산은 RUNNING/SUCCEEDED/FAILED/PARTIAL 상태를 저장한다. |

| R-012 | 시간은 내부 UTC, 표시만 로컬 변환. naïve datetime 금지. |

| R-013 | catalog_id는 문자열로 취급하고 6자리 이상을 지원한다. |

| R-014 | TLE는 5자리 제약이 있으므로 OMM/OCM 우선 구조를 유지한다. |

| R-015 | 정밀도 등급이 다른 데이터는 source_grade로 분리한다. |



## 2.1 Evidence Manifest 예시

| {<br>  "phase": "P5-benefit-engine",<br>  "commit": "<git-sha>",<br>  "input": ["fixture:tracss-cdm-example", "catalog:39771"],<br>  "tests": [{"cmd":"pytest tests/benefit -q","passed":true}],<br>  "database_assertions": ["benefit_result rows > 0"],<br>  "api_assertions": ["GET /v1/scenarios/{id}/benefits -> 200"],<br>  "benchmarks": {"full_ms":543,"affected_ms":12.5},<br>  "limitations": ["screening-grade source; not operational advice"]<br>} |

| --- |



# 3. 사용자군과 서비스 계층

도 3-1. 하나의 과학 코어를 일반인·연구자·기업용 서비스로 분리한다.

| 계층 | 주 사용자 | 기능 | 노출 깊이 |

| --- | --- | --- | --- |

| Explore | 일반인/학생/덕후 | 3D, 객체스토리, 국가별, Follow, Remove 시뮬레이션 | 쉽게 설명하되 출처 표시 |

| Observe | 아마추어/대학/천문대 | 관측요청, 제출, 기여도 | 장비·시간정확도·QA 공개 |

| Research | 박사/연구소 | 원자료/파생데이터, Benchmark, API | 모델·오차·가정 전부 |

| Operations | 위성운영사 | Fleet risk, candidate maneuver 비교 | 계약 데이터, audit |

| Removal Intelligence | ADR 기업/기관 | 제거후보, 수혜분석, 접근난이도 입력 | 의사결정 보조 |



# 4. 시스템 아키텍처

도 4-1. 논리 아키텍처

## 4.1 권장 기술 스택

| 영역 | 권장 | 이유/주의 |

| --- | --- | --- |

| Frontend | Next.js/React + TypeScript, CesiumJS | Earthus/Aetherus 지구본과 재사용. 버전은 프로젝트 시작 시 latest stable로 고정하고 lockfile 커밋. |

| Scientific API | Python FastAPI | SGP4/astropy/scipy 생태계, 모델 검증 용이. 타입은 Pydantic. |

| Workers | Python worker + Celery/Redis 또는 동등 큐 | 전파/스크리닝/시나리오 배치. API 요청 thread에서 대규모 계산 금지. |

| DB | PostgreSQL + PostGIS | 객체/이벤트/공간 인덱스/트랜잭션. 그래프 DB는 v1에 필수 아님. |

| Cache | Redis | 객체 조회, 최신 snapshot, job status, rate limit. 과학 canonical storage로 사용 금지. |

| Research store | Parquet + object storage + DuckDB | 대규모 스냅샷/다운로드/재현 연구. |

| Raw store | S3 compatible object storage | 원문 응답/파일은 content hash로 불변 저장. |

| Observability | OpenTelemetry + metrics/logs/traces | 소스 장애와 계산 지연 분리 관측. |

| Deployment | Docker Compose(dev), container orchestrator(prod) | 재현 가능한 환경. 과도한 분산화는 초기 금지. |



## 4.2 서비스 분리 원칙

- Ingestion 서비스는 외부 API 형식을 canonical 모델로 정규화하되 원문 raw artifact를 보존한다.

- Orbit 서비스는 상태전파만 책임지고 UI 개념(색상, 국가 배지)을 모른다.

- CA 서비스는 pair screening/TCA/Pc와 검증 상태를 책임진다.

- Benefit 서비스는 CA 결과를 소비하며 CA 내부 알고리즘을 복제하지 않는다.

- Research Export는 production DB를 직접 덤프하지 않고 dataset snapshot job을 통해 버전 고정한다.

# 5. 외부 데이터 소스 및 수집정책

| 소스 | 주 데이터 | 접근 | Adapter | 규칙 |

| --- | --- | --- | --- | --- |

| CelesTrak GP | 현재 GP/OMM | 무로그인 공개 | OMM XML/JSON/CSV 우선; CATNR/INTDES/GROUP/NAME | 2시간 이상 캐시 기본. 2026년 6자리 catalog 때문에 TLE-only 금지. |

| Space-Track | GP/GP_HISTORY/SATCAT/TIP | 계정 필요 | REST; 현재=GP, 과거=GP_HISTORY | 공식 throttling 준수; 일괄 쿼리/자체 저장. |

| TraCSS | Catalog/OMM/CDM/OCM/검증셋 | 공개/계정·셋별 상이 | CDM/OCM을 운영·검증 경로에 사용 | 소스 등급 구분; 공개 specification example을 live event로 표시 금지. |

| ESA DISCOS | 객체 메타데이터 | 계정/정책 확인 | 질량/형상/발사/임무 보강 | 궤도 ephemeris 주원천으로 사용하지 않음. |

| SatNOGS | 위성/송신기/관측 | REST 공개 | 시민/아마추어 관측·무선 정보 | CC BY-SA 라이선스 표기. |

| NASA/JAXA/ESA/KASA media | 공식 사진/연구자료 | 공개 웹 | Visual Asset와 mission timeline | 저작권/크레딧 필드 저장. |

| K-SSA future adapter | 국내 SSA 공공데이터 | 미정 | provider interface만 준비 | 실제 endpoint 공개 전 가짜 adapter 금지. |



## 5.1 수집 스케줄

| Job | 기본 주기 | 실패 정책 | 저장 |

| --- | --- | --- | --- |

| CelesTrak current GP | 2h | 지수 backoff, 이전 snapshot 유지 | raw + orbit_solution |

| Space-Track GP | 1h 이하 금지; 공식 guideline에 맞춤 | 429 즉시 중단, 분산 minute | raw + orbit_solution |

| SATCAT metadata | 1d | 부분실패 허용 | object metadata version |

| TIP/reentry | 1h, 긴급 object는 정책 범위 | source timestamp 우선 | reentry_prediction |

| Visual metadata | 1d/수동 | 이미지 실패가 orbit 기능을 막지 않음 | visual_asset |

| Citizen observations | event driven | QA queue | immutable raw + QA state |



## 5.2 Adapter interface

| class OrbitProvider(Protocol):<br>    id: str<br>    async def fetch_current(self, selector: ObjectSelector) -> RawArtifact: ...<br>    def parse(self, raw: RawArtifact) -> list[OrbitSolutionInput]: ...<br>    def source_grade(self) -> SourceGrade: ...<br><br># Parser MUST NOT silently discard epoch/frame/time_system/source record id. |

| --- |



# 6. 내부 데이터 표준과 식별체계

Canonical 데이터는 특정 공급자 JSON 구조를 그대로 저장하는 것이 아니라 내부 타입으로 정규화한다. 그러나 재현성을 위해 원문 artifact hash와 source-specific fields를 별도 보존한다.

| 개념 | Canonical field | 규칙 |

| --- | --- | --- |

| 객체 ID | space_object.id UUID | 내부 안정 ID |

| 카탈로그 | catalog_id text | 6+ digits 가능, leading zero 보존 가능 |

| 국제식별자 | cospar_id | nullable, source 검증 |

| 시각 | timestamptz UTC | 입력 time system도 provenance에 저장 |

| 좌표계 | frame enum | TEME/ITRF/GCRF 등 명시 |

| 위험지표 | metric_type + method | 값만 저장 금지 |

| 품질 | source_grade + validation_state | PUBLIC_GP와 OPERATIONAL_CDM 구분 |

| 미디어 | asset_type + source_org + license | 실제사진/출처이미지/시뮬레이션 구분 |



## 6.1 Snapshot / Versioning

- 동일 object의 새 GP가 들어오면 새 orbit_solution을 append한다. latest view는 쿼리로 결정한다.

- 동일 conjunction의 새 CDM은 conjunction_event 하나 아래 conjunction_snapshot 여러 개로 저장한다.

- scenario_run은 baseline_snapshot_id를 고정한다. baseline이 바뀌면 동일 scenario 정의라도 새 run이다.

- research_dataset_version은 소스 artifact hash와 model versions를 manifest로 고정한다.

# 7. 시간·좌표계·궤도 전파 엔진

## 7.1 책임

- OMM/GP를 SGP4 입력으로 변환

- epoch-aware 전파

- TEME 상태 반환

- 필요 시 Earth-fixed/geodetic 변환

- 데이터 나이/전파모델/프레임을 출력에 포함

## 7.2 절대 금지

- TLE line 문자열만 DB canonical로 삼지 않는다.

- UTC/TAI/UT1을 혼용하지 않는다.

- 오래된 GP를 현재 정밀 위치로 홍보하지 않는다.

- 정밀 OEM/OCM 데이터를 GP로 다운컨버트한 뒤 원자료보다 우선하지 않는다.

## 7.3 API output 예

| {<br> "object_id":"...", "sample_time":"2026-08-23T00:00:00Z",<br> "state":{"frame":"TEME","r_km":[...],"v_km_s":[...]},<br> "geodetic":{"lat_deg":...,"lon_deg":...,"alt_km":...},<br> "provenance":{"orbit_solution_epoch":"...","model":"SGP4","source_grade":"PUBLIC_GP","data_age_s":...}<br>} |

| --- |



## 7.4 테스트

| Test | 검증 |

| --- | --- |

| epoch propagation | epoch에서 trusted implementation state 비교 |

| forward/back deterministic | 같은 입력+시간+버전은 동일 hash |

| frame round trip | 허용오차 내 TEME->ITRF/geodetic 일관성 |

| old data badge | 설정 data-age 초과 시 stale flag |

| invalid elements | 400/QUARANTINE; NaN을 UI로 전달 금지 |



# 8. Conjunction Assessment 엔진

## 8.1 두 단계 계산

- Coarse screening은 보수적으로 후보쌍을 줄인다. 목표는 precision이 아니라 false-negative 방지다.

- Precise TCA는 후보쌍의 상대거리 최소점을 정밀 탐색한다.

- TCA에서 상대속도·상태·공분산을 변환한다.

- 공분산 조건이 만족되면 Pc plugin을 실행한다.

- 모든 결과를 risk provenance와 validation_state로 저장한다.

## 8.2 TCA 의사코드

| def precise_tca(obj_a, obj_b, window):<br>    samples = propagate_relative_distance(obj_a, obj_b, window, coarse_step)<br>    brackets = local_minimum_brackets(samples) + boundary_candidates(samples)<br>    best = None<br>    for bracket in brackets:<br>        t = brent_minimize(lambda t: squared_distance(a(t), b(t)), bracket)<br>        candidate = state_at(t)<br>        best = min_by_distance(best, candidate)<br>    return best.with_boundary_flag() |

| --- |



## 8.3 Pc 규칙

- Pc는 결합 hard-body radius와 공분산을 기반으로 encounter plane에서 계산한다.

- 공분산이 없으면 Pc 대신 miss distance/MaxProbability 등 별도 screening metric만 제공한다.

- Pc method를 반드시 기록한다. 동일 사건에 method가 다르면 값 비교 시 경고한다.

- dilution 영역/공분산 이상은 quality flag를 생성한다.

## 8.4 검증 게이트

| 검증지표 | 기준 |

| --- | --- |

| Event recall | 검증 corpus의 참 conjunction을 모두 탐지하는 것을 최우선 |

| False events | 허용 상한 설정; tuning 근거 기록 |

| ΔTCA | configured tolerance |

| Δstate at TCA | frame 동일 조건에서 tolerance |

| ΔPc | 동일 method/CHBR/공분산 조건에서만 비교 |

| Performance | object count, window, hardware와 함께 기록 |



# 9. Risk Graph 엔진

Risk Graph는 “위험도 점수 하나”가 아니라 객체간 관계를 저장하는 구조다. 노드는 space_object, 에지는 시간지평·metric별 risk_edge다.

| RiskEdge = {<br>  object_a, object_b, horizon,<br>  features: {tca, miss_distance, relative_speed, pc, max_pc, density_overlap, uncertainty, fragmentation_potential},<br>  metrics: [{type, value, method}],<br>  provenance<br>} |

| --- |



## 9.1 집계 위험값

개별 객체 R_i는 에지들의 함수다. 서비스용 composite score가 필요하면 weights를 configuration으로 저장하고, 점수 이름에 “Aetherus Research Index”를 붙인다. 원래 Pc와 혼동시켜서는 안 된다.

| R_i(h, config_v) = Σ_j w(i,j,h,config_v) * f(features_ij)<br># weights, transforms and normalization are versioned and downloadable in Research mode. |

| --- |



# 10. Intervention Benefit Engine

도 10-1. 기준 위험그래프와 개입 후 그래프의 차이를 수혜 객체에 귀속한다.

## 10.1 핵심 정의

| Benefit_i(s, h, m) = R_i(G0, h, m) - R_i(Gs, h, m)<br>Beneficiaries(s) = { i != target \| Benefit_i > threshold(metric, confidence) }<br>SystemBenefit(s) = Σ alpha_i * Benefit_i + beta * EnvironmentBenefit<br># SystemBenefit is a research/composite metric; components remain queryable. |

| --- |



## 10.2 REMOVE 처리

- baseline snapshot을 고정한다.

- target의 위험에지를 baseline에서 읽는다.

- effective_time 이후 target을 제거한 counterfactual 상태를 만든다.

- Affected Subgraph를 생성한다.

- 영향구간만 CA/risk 재계산한다.

- 객체별 ΔRisk를 저장한다.

- 직접 수혜/환경수혜를 분리한다.

- 결과에 assumption=IDEALIZED_REMOVAL 등을 명시한다.

## 10.3 NUDGE/LOWER

- Δv 벡터 또는 candidate ephemeris/OCM을 입력으로 받는다.

- 기존 위험 감소만 보지 말고 새로운 위험 에지 증가를 계산한다.

- 기동 가능성·연료비용 등은 기술/사업자 입력이 있을 때만 사용하며 임의 추정하지 않는다.

## 10.4 Result record

| {<br>  "scenario":"...","target":"A","beneficiary":"B",<br>  "class":"DIRECT","metric":"PC",<br>  "baseline":4.2e-5,"scenario_value":7.0e-6,"benefit":3.5e-5,<br>  "confidence":0.91,"horizon":"TCA_EVENT",<br>  "provenance":{"cdm":"...","pc_method":"...","model_version":"..."}<br>} |

| --- |



# 11. Affected Subgraph 선택적 재계산

목적은 물리 계산을 생략하는 것이 아니라 “개입으로 절대 변하지 않는 영역”의 baseline 결과를 안전하게 재사용하는 것이다. conservative filter를 통과하지 못한 최적화는 금지한다.

## 11.1 후보집합

- target incident edges

- 궤도 고도범위가 겹치는 객체

- 시간창 내 swept-volume 또는 bounding envelope 중첩

- candidate OCM 경로의 신규 교차 후보

- 잠재 fragmentation cloud 영향 shell

- PROTECT query에서 보호대상과 관계가 있는 후보

## 11.2 정확성 회귀테스트

| full = run_scenario(full_recompute=True)<br>fast = run_scenario(affected_subgraph=True)<br>assert beneficiary_set_difference(full, fast) == empty_within_policy<br>assert metric_error(full, fast) <= configured_tolerance<br># Performance improvement is reported only after equivalence test passes. |

| --- |



# 12. PROTECT 역방향 엔진

사용자가 먼저 보호대상 Y를 지정한다. 시스템은 “Y의 위험을 가장 많이 감소시키는 개입대상 k”를 역조회한다. 활동위성뿐 아니라 연구목적의 비운용 객체도 보호대상으로 선택할 수 있으나 source/quality를 표시한다.

| for candidate k in candidate_targets(Y):<br>    scenario = build_intervention(k)<br>    benefit_to_Y = run(scenario).benefit(Y)<br>rank candidates by [benefit_to_Y, confidence, new_risk_penalty] |

| --- |



## 12.1 UI

- “PROTECT THIS OBJECT” 액션

- 후보 목록은 Benefit 값, metric, confidence, reason을 함께 표시

- 공식 제거 추천처럼 보이는 문구 금지; Aetherus Research Analysis 표시

# 13. Candidate OCM 기동 비교

동일 satellite의 nominal과 candidate OCM들을 scenario_group으로 묶는다. 각 candidate는 동일 외부 객체집합과 스크리닝하고 동일-designator끼리는 conjunction 대상으로 취급하지 않는다.

| 출력 | 설명 |

| --- | --- |

| resolved_edges | baseline에 있었으나 candidate에서 사라진 위험관계 |

| new_edges | candidate에서 새로 발생한 위험관계 |

| changed_edges | 같은 객체쌍의 TCA/Pc 등이 변경 |

| beneficiaries | 위험이 감소한 외부객체 |

| risk_increases | 위험이 증가한 외부객체 |

| net research score | 명시적 versioned weights 사용 시에만 |



# 14. Fragmentation / Collision Scenario Engine

이 엔진은 “미래를 맞히는 예언”이 아니라 명시된 breakup model/가정을 사용한 Monte Carlo 연구 시나리오다. 사용자 화면에는 반드시 SIMULATION 배지를 표시한다.

- 충돌 대상의 질량/상대속도/구조 메타데이터를 수집한다. 값이 없으면 범위/분포로 표현한다.

- breakup model plugin이 fragment cohort(개별 전부가 아니라 크기/질량/Δv 분포)를 생성한다.

- 샘플 cohort를 시간지평별로 전파한다.

- 운영 객체와의 추가 conjunction exposure를 계산한다.

- target 제거 시 해당 breakup path가 제거되는 효과를 indirect benefit으로 귀속한다.

## 14.1 출력

- fragment_count_distribution

- size/mass bins

- orbital shell migration

- protected satellite exposure delta

- Monte Carlo confidence/percentiles

- model/assumption version

# 15. Re-entry Intelligence

재진입은 데이터 품질 등급을 세분화한다. Potential Decay나 GP 기반 추정과 TIP 기반 예측을 동일 신뢰도로 표시하지 않는다.

| grade | 예 | UI |

| --- | --- | --- |

| WATCH | 고도감소/decaying list | 재진입 감시 |

| PREDICTED | 공식/제공자 reentry prediction | 예상 window + 출처 |

| HIGHER_CONFIDENCE | 가까운 시점의 반복 업데이트 | window 축소 추세 |

| REENTERED | decay confirmed | 과거 이벤트/회수사진 연결 |



# 16. Rotation / Photometry Intelligence

광도곡선은 객체의 회전/자세 추정에 사용한다. 개별 “형상 복원”은 충분한 관측과 검증 없이 제공하지 않는다.

- 관측 timestamp를 barycentric correction까지 필요 여부에 따라 표준화한다.

- 광도 outlier/airmass/장비별 zero-point를 QA한다.

- Lomb-Scargle 등 period search로 후보주기를 찾는다.

- harmonic/alias 후보를 함께 저장한다.

- bootstrap 또는 equivalent로 confidence를 산출한다.

- 3D 회전 애니메이션은 “estimated rotation” 라벨을 표시한다.

# 17. Observation Intelligence

도 17-1. 관측 필요도에서 궤도 갱신까지의 폐쇄루프

## 17.1 관측 우선순위

| ObservationPriority =<br>    RiskRelevance * ExpectedInformationGain * Observability * DataScarcity * QualityPotential<br># All factors normalized/config-versioned; no hidden magic number. |

| --- |



## 17.2 관측가능성

- station horizon mask

- az/el trajectory

- sun altitude

- object illumination/eclipse

- moon separation optional

- weather/cloud if Earthus data available

- angular rate vs mount tracking limits

## 17.3 정보이득

초기 버전은 예상 measurement noise와 geometry로 expected covariance reduction을 추정한다. 실제 제출 후에는 OD fit/covariance 변화로 realized information gain을 계산한다. 예상값과 실제값을 분리 저장한다.

# 18. Citizen Science Network

## 18.1 참여 흐름

- 사용자가 장비/관측소를 등록한다.

- 시스템이 관측요청을 제공한다.

- 사용자는 원자료/측정값/시간정확도/장비 metadata를 제출한다.

- QA가 자동검증 후 PENDING/ACCEPTED/REJECTED/QUARANTINED로 분류한다.

- ACCEPTED만 OD 후보 입력으로 전달한다.

- 기여도는 “몇 % 궤도 개선”처럼 근거가 있을 때만 표시한다.

## 18.2 QA

| 검사 | 실패시 |

| --- | --- |

| timestamp sanity / clock accuracy | quarantine |

| station coordinate validity | reject |

| astrometric residual | outlier or reject |

| range physical bounds | reject |

| duplicate payload hash | dedupe |

| equipment calibration age | quality downgrade |

| cross-source consistency | accept/downgrade/reject rule |



# 19. Debris Genealogy / Origin Engine

객체 “국가”는 정치적 책임판정이 아니라 source/origin metadata다. parent spacecraft/rocket, launch, fragmentation event, mission, ownership/source를 관계형으로 보존하고 UI에서는 “기원/출처”로 표기한다.

| Object A --LAUNCHED_AS--> Payload/Rocket<br>Object A --PARENT_OF_FRAGMENT--> Debris B<br>Event X --GENERATED--> Debris B,C,D<br>Mission M --OBSERVED--> Object A<br>Country/Org --SOURCE_METADATA--> Object A |

| --- |



# 20. Visual Asset Resolution Engine

| 우선 | asset_type | 표시 라벨 | 규칙 |

| --- | --- | --- | --- |

| 1 | actual debris/recovered fragment | ACTUAL PHOTO / RECOVERED FRAGMENT | 실물 관련임이 검증된 경우 |

| 2 | radar/telescope observation | RADAR IMAGE / TELESCOPE IMAGE | 관측영상 |

| 3 | source satellite/launch vehicle | SOURCE SATELLITE / LAUNCH IMAGE | 파편 자체 사진처럼 표시 금지 |

| 4 | official graphic | OFFICIAL GRAPHIC | 기관 그래픽 |

| 5 | platform model | AETHERUS SIMULATION | 추정/시뮬레이션 명시 |



## 20.1 resolver

| def resolve_primary_visual(object_id):<br>    for type in PRIORITY:<br>        asset = best_verified_asset(object_id, type)<br>        if asset: return asset<br>    return simulation_asset(object_id, label="AETHERUS SIMULATION") |

| --- |



# 21. Orbital Congestion / Orbital Weather

Orbital Weather는 사용자 이해를 위한 연구 요약이며 공식 기상/우주기상과 혼동시키지 않는다. 모든 등급은 underlying counts/metrics를 펼쳐 볼 수 있어야 한다.

| 지표 | 기초 데이터 | 주의 |

| --- | --- | --- |

| LEO Congestion | shell별 active/inactive/debris count + volume normalization | 단순 object count를 “위험”으로 부르지 않음 |

| Conjunction Activity | 최근/예정 event counts by severity/channel | provider bias 표시 |

| Re-entry Watch | TIP/decaying candidates | prediction grade 표시 |

| Fragmentation Events | 공식 breakup notice/event db | 미확인 추정 금지 |

| Solar Drag Context | space weather/drag proxy | reentry 모델과 분리 |



# 22. Orbital Footprint / Sustainability Research Index

이 영역은 특허 핵심이 아니라 연구/콘텐츠 서비스다. 국가·기관별 object count뿐 아니라 dead mass, rocket-body mass, estimated persistence 등을 보여줄 수 있으나, 데이터 누락과 소유권/기원 개념의 차이를 명시한다.

- “Orbital Debt/Credit” 명칭을 사용하면 공식 국제지표가 아니라 Aetherus Research Index임을 상시 표시한다.

- 질량 미확인 객체를 0kg로 합산하지 않는다. known mass subtotal과 coverage ratio를 같이 표시한다.

- 국가 비교 화면에서 origin_code가 multinational/unknown이면 별도 분류한다.

# 23. Research Data Platform

## 23.1 Dataset version

- snapshot_at

- source artifact hashes

- model/config versions

- schema version

- license manifest

- row counts

- known limitations

- DOI는 외부 저장소/기관과 연계될 때 후속

## 23.2 다운로드

| format | 용도 |

| --- | --- |

| CSV | 소규모/일반 분석 |

| JSON/JSONL | API/메타데이터 |

| Parquet | 대규모 연구/컬럼형 |

| OMM/OCM/CDM 원본 | 라이선스/재배포 허용 범위에서 제공 |



## 23.3 Benchmark

- CA event recall/false positive

- TCA/state/covariance differences

- Pc method consistency

- runtime/memory

- Benefit full-vs-selective equivalence

- model submissions run in isolated sandbox later phase

# 24. Operations / Fleet / Removal Intelligence

## 24.1 Fleet

- tenant isolation

- private ephemeris encryption at rest

- customer retention policy

- audit log

- candidate maneuver compare

- new risk edge detection

- no automatic command

## 24.2 Removal Intelligence

- target environmental benefit

- beneficiary objects

- fragmentation prevention scenario

- rendezvous/tumbling data if available

- legal/ownership metadata as informational field, not legal conclusion

- observation confidence

- mission engineering inputs supplied by customer

# 25. API 계약

모든 endpoint는 `request_id`, `generated_at`, `data_status`, `provenance`를 공통 envelope에 포함한다.

| {<br> "request_id":"uuid", "generated_at":"...Z", "data_status":"OK\|STALE\|PARTIAL\|UNAVAILABLE\|RESEARCH_ONLY",<br> "data": {...}, "provenance": {...}, "warnings": []<br>} |

| --- |



| Endpoint | 역할 |

| --- | --- |

| GET /v1/objects | 검색/필터 |

| GET /v1/objects/{id} | 상세 |

| GET /v1/objects/{id}/ephemeris | 전파 위치 |

| GET /v1/conjunctions | 근접사건 |

| POST /v1/scenarios | 시나리오 생성 |

| POST /v1/scenarios/{id}/run | 계산 job |

| GET /v1/scenarios/{id}/benefits | 수혜결과 |

| POST /v1/protect/{id}/candidates | 역조회 |

| GET /v1/observations/requests | 관측미션 |

| POST /v1/observations/submissions | 관측제출 |

| GET /v1/research/datasets | 데이터셋 |

| GET /v1/orbital-weather/current | 대중 요약 |

| GET /v1/countries/{code}/footprint | 국가/기원 분석 |

| GET /v1/genealogy/{id} | 족보 |

| POST /v1/operations/fleets/{id}/maneuver-candidates | 기업 candidate compare |



# 26. DB·저장·캐시 설계

Canonical DB는 PostgreSQL이 소스오브트루스다. raw 응답과 대규모 연구 snapshot은 object storage/Parquet에 둔다. Redis의 값이 유실되어도 과학 결과를 복구할 수 있어야 한다.

| 분류 | 저장 | 불변성/TTL |

| --- | --- | --- |

| raw source | Object storage | immutable by sha256 |

| object metadata | Postgres | version/audit |

| orbit solution | Postgres + raw ref | append; latest view |

| ephemeris cache | Redis/Parquet | TTL, regenerable |

| conjunction snapshot | Postgres | append |

| scenario/benefit | Postgres | immutable run result + status |

| research dataset | Parquet/Object store | version immutable |

| visual media | prefer external link + optimized cache | license-aware |



## 26.1 SQL

전체 초기 스키마는 Codex 패키지의 `schema.sql`을 기준으로 한다. migration framework로 이 파일을 분해하고 schema version을 기록한다.

# 27. 백엔드 서비스·잡·스케줄러

| Job | Queue | idempotency key | 성공 증거 |

| --- | --- | --- | --- |

| ingest_current_gp | ingest | source+selector+time_bucket | raw hash + normalized count |

| propagate_batch | science | orbit_solution+grid+model | ephemeris artifact hash |

| screen_conjunctions | science | snapshot+window+model | risk edge count + validation state |

| run_scenario | science-high | scenario+baseline+model | scenario_run + benefits |

| build_dataset | export | dataset+version | manifest sha256 |

| qa_observation | observation | submission hash | qa state + residuals |



Retry는 과학 결과 중복을 만들지 않도록 idempotent 해야 한다. job status와 오류 JSON을 남기고 UI는 “실패”를 숨기지 않는다.

# 28. 3D UI/UX 상세

## 28.1 Globe 기본

- 첫 진입에서 모든 우주물체/궤도선을 활성화하지 않는다.

- Global view는 density/priority subset, zoom 또는 필터 시 개별 객체, 선택 시 해당 궤도선.

- 점 크기는 실제 물체 크기가 아님을 범례로 명시.

- 모든 객체 tooltip에 name/catalog/type/origin/data age.

## 28.2 객체 상세 패널

| 영역 | 내용 |

| --- | --- |

| Hero | 대표 이미지 + 정확한 asset label |

| Identity | name, catalog, COSPAR, object type, origin |

| Live orbit | altitude/velocity/orbit class/data age |

| Risk | latest conjunction channels + provenance |

| Story | launch/mission/end-of-life/genealogy |

| Actions | Follow, Simulate Removal, Protect, Observe |

| Research | raw source/model/uncertainty/download |



## 28.3 REMOVE UX

- 사용자가 SIMULATE REMOVAL 선택

- assumption modal: idealized removal + horizon + metric

- backend scenario 생성, “계산중”

- 완료 후 target fade-out animation은 visualization일 뿐 실제 state 변경 아님

- beneficiary objects highlight

- Direct/Indirect/Environment 탭

- 원 수치·provenance drawer

## 28.4 PROTECT UX

- 객체 상세에서 PROTECT

- 후보 생성 job

- 상위 후보 표시

- 각 후보의 Benefit/Confidence/New Risk

- Research Mode에서 계산식/edges 확인

# 29. 성능·LOD·대규모 렌더링

| 구간 | 렌더 전략 | 과학 계산과의 관계 |

| --- | --- | --- |

| Global | density/cluster/priority points | 렌더 subset은 계산 subset이 아님 |

| Mid zoom | filtered objects, no all-orbit lines | API pagination/viewport query |

| Object focus | selected orbit + relevant neighbors | Affected graph optional overlay |

| Research graph | limited edge set/top-N/filter | 대규모 graph는 서버 집계 |



## 29.1 목표

- 100k catalog IDs를 데이터모델이 수용

- 초기 view 60fps 목표는 장비/브라우저 기준 benchmark로 정의

- orbit polylines lazy generation

- Web Worker 또는 GPU buffer 활용

- viewport 밖 객체 label 생성 금지

# 30. 보안·라이선스·데이터거버넌스

- API secret은 Secret manager/env로만 주입, 로그 금지.

- Space-Track 등 provider terms/rate limit을 adapter policy로 코드화.

- 고객 private ephemeris는 public research dataset에 절대 섞지 않는다.

- 사용자 관측 원자료 license 동의와 공개범위를 제출시 고정.

- 민감/비공개 데이터가 들어온 경우 provenance access policy를 함께 저장.

- 외부 이미지 캐시는 라이선스상 허용되는 경우만.

# 31. 관측·연구 품질 관리

| 상태 | 의미 | UI |

| --- | --- | --- |

| VALIDATED_PIPELINE | 지정 검증 corpus 품질게이트 통과 | 연구 검증 배지 |

| PUBLIC_SCREENING | 공개 screening 데이터 기반 | 스크리닝용 명시 |

| RESEARCH_ONLY | 가정/모델 시나리오 | 연구 시뮬레이션 배지 |

| INSUFFICIENT_DATA | 필수 입력 부족 | 값 대신 부족 이유 |

| STALE | 데이터 age 초과 | 업데이트 시각 강조 |

| VALIDATION_PENDING | 알고리즘/데이터셋 미검증 | 기업 의사결정 사용 제한 |



# 32. 테스트 전략

## 32.1 Test pyramid

- Unit: parser, time/frame, TCA, metric transform, visual resolver

- Property: catalog_id length, time monotonicity, Pc bounds, serialization

- Golden fixture: official/spec examples and static public snapshots

- Integration: source adapter -> DB -> compute -> API

- E2E: browser actions -> job -> result

- Benchmark: full vs affected, 10k/30k/100k synthetic

- Chaos/source outage: stale data behavior

## 32.2 Acceptance Matrix

| ID | 기능 | 절차 | 통과 | 우회방지 |

| --- | --- | --- | --- | --- |

| ING-001 | CelesTrak OMM ingestion | Fetch one known catalog ID in JSON/OMM, persist raw hash, normalize | Raw artifact + orbit_solution; source/retrieved_at/epoch preserved | No hardcoded satellite state; retry/rate limit tested |

| ING-002 | 6+ digit catalog ID | Ingest catalog id >=100000 | No integer-width/TLE-only truncation | Any 5-digit regex in canonical code fails lint |

| ORB-001 | SGP4 propagation | Known OMM input, propagate at epoch and +/- interval | Finite TEME state; deterministic output hash | Cross-check against trusted implementation within configured tolerance |

| ORB-002 | Frame conversion | TEME -> Earth-fixed -> geodetic | lat/lon/alt finite; round-trip bounded | Time/EOP assumptions stored |

| CA-001 | Coarse screening | Synthetic 10k objects with injected close pair | Injected pair survives filter | False-negative = 0 for test corpus |

| CA-002 | TCA solver | Two trajectories with known minimum | TCA and miss distance within tolerance | Boundary TCA case tested |

| CA-003 | Pc computation | CDM fixture with covariance | Pc finite [0,1], method recorded | No Pc if covariance invalid; status=UNAVAILABLE |

| BEN-001 | REMOVE direct benefit | Baseline edge A-B, remove A | B identified; benefit = baseline - scenario | Metric type/provenance attached |

| BEN-002 | PROTECT reverse query | Protected Y with candidates A,C | Returns ordered candidates with individual Benefit(k→Y) | Ranking reproducible from stored scenario runs |

| BEN-003 | Affected subgraph equivalence | Compare full recompute vs selective | Selected output within tolerance | Performance benefit recorded separately from physics accuracy |



| ID | 기능 | 절차 | 통과 | 우회방지 |

| --- | --- | --- | --- | --- |

| BEN-004 | New risk after candidate maneuver | Candidate reduces edge A but creates edge C | Both benefit and risk increase shown | Net score cannot hide new edge |

| PROV-001 | Snapshot versioning | Refresh same conjunction data | Old benefit retained, new version appended | No destructive overwrite |

| VIS-001 | Visual fallback | No actual debris photo; source launch image exists | Shows launch image with label LAUNCH IMAGE | Never labels as ACTUAL PHOTO |

| OBS-001 | Visibility planner | Station + object + time window | Pass windows generated with sun/illumination flags | No request outside station constraints |

| OBS-002 | Submission QA | Bad timestamp + outlier angles | Rejected/quarantined with reason | Does not update orbit solution |

| RES-001 | Dataset reproducibility | Export dataset version | Manifest includes hashes/model versions/snapshot | Re-import reconstructs same rows |

| UI-001 | No fake numbers | API returns unavailable risk metric | UI shows unavailable/insufficient data | No generated placeholder percentage |

| E2E-001 | Explore object | Search -> select -> orbit -> visual -> provenance | All views load from API contracts | Network trace contains no hardcoded metric endpoint bypass |

| E2E-002 | Scenario | Select debris -> REMOVE -> result | Scenario run persists; beneficiaries shown after compute | UI cannot mark completed before backend SUCCEEDED |



# 33. 성능 벤치마크

벤치마크는 물리 정확도와 계산성능을 섞지 않는다. “43배 빠름”이 물리적으로 더 정확하다는 뜻이 아니다. 모든 성능표는 CPU/GPU/RAM, object count, time window, step, model version을 함께 기록한다.

| Benchmark | Dataset | Metric | Gate |

| --- | --- | --- | --- |

| B-CA-10K | synthetic + injected pairs | runtime, recall | recall gate 우선 |

| B-CA-100K | synthetic/real mix later | runtime/memory | OOM 없음, configured SLA |

| B-AFFECTED | same scenario full/affected | speedup + output diff | diff tolerance 통과 후 speedup 보고 |

| B-API | hot/cold object detail | p50/p95 | product SLA |

| B-RENDER | global/mid/focus | frame time | device profile별 기록 |



# 34. 구현 순서와 단계별 Hard Gate

| Phase | 영역 | 필수 구현 | Hard Gate |

| --- | --- | --- | --- |

| P0 | Repo/CI | docker compose, migrations, lint/type/test, evidence generator | clean clone boots; no TODO core |

| P1 | Ingestion | CelesTrak adapter, raw hash, object identity | 6+ digit ID test; provenance DB |

| P2 | Orbit | SGP4/time/frame/ephemeris API | golden tests |

| P3 | Explore | 3D globe + LOD + object detail | network confirms API-derived positions |

| P4 | CA | screen/TCA/Pc/provenance | verification gate |

| P5 | Benefit | REMOVE + direct benefit + affected graph | full-vs-affected equivalence |

| P6 | PROTECT/OCM | reverse query + candidate new-risk | new edge surfaced |

| P7 | Story/Visual | genealogy/origin/assets | asset labels/source |

| P8 | Fragmentation | research scenario | assumptions visible |

| P9 | Observe | planner/citizen QA | bad observation cannot update orbit |

| P10 | Research | versioned dataset/benchmark | manifest reconstructable |

| P11 | Operations | fleet/private/candidate compare | tenant isolation; advisory only |

| P12 | Hardening | load/security/outage/DR | runbook tested |



## 34.1 Codex에게 각 Phase를 시킬 때 사용하는 고정 프롬프트

| You are implementing Phase <Px> from the Aetherus Orbital Environment Master Spec.<br>Do not declare completion until every Hard Gate and acceptance test for this phase passes.<br>Do not create placeholder metrics or constant-return scientific functions.<br>Before coding: list exact files/modules/tests you will modify.<br>After coding: run tests and write artifacts/evidence/<phase>.json.<br>If a dependency prevents a real implementation, mark the feature BLOCKED and explain the missing dependency; do not fake it.<br>Return: changed files, test results, evidence path, known limitations, next unblocked phase. |

| --- |



# 35. 배포·관측성·장애대응

| 관측항목 | 필수 metric/log |

| --- | --- |

| provider | last_success, http status, rate-limit, parse rejects |

| orbit | propagation failures, stale solution count |

| CA | pairs screened, candidates, precise pairs, runtime, validation state |

| scenario | queue age, runtime, affected count, benefit rows |

| observations | pending/accepted/rejected, QA reasons |

| API | p50/p95/error by endpoint |

| UI | WebGL context loss, frame-time profile |



## 35.1 장애

- source down: latest cached snapshot + STALE 표시

- worker down: existing data view 가능, scenario disabled/pending

- DB fail: read-only cache may serve non-scientific shell only if provenance retained

- object store fail: raw/media unavailable warning, never fabricate

# 36. 상용화/과금 경계

| Tier | 가능 기능 |

| --- | --- |

| Free Explore | 기본 객체/국가/스토리/제한된 시뮬레이션 |

| Enthusiast | Follow/알림/Time Machine/고급 시각화 |

| Research | API quota, versioned downloads, benchmark |

| Institution | 팀 workspace, private station, large exports |

| Operations | private fleet, candidate OCM compare, SLA/audit |

| Removal Intelligence | target analysis/report/API |



정확한 가격은 이 기술문서의 범위 밖이며 시장검증 후 별도 pricing spec에서 결정한다.

# 37. 특허기술과 서비스기술의 경계

| 영역 | 특허 #1 핵심 여부 | 서비스에서의 역할 |

| --- | --- | --- |

| baseline/counterfactual risk graph | 핵심 | 모든 개입 시뮬레이션 |

| beneficiary attribution | 핵심 | REMOVE→WHO BENEFITS |

| PROTECT reverse query | 핵심/독립축 | 보호대상 중심 분석 |

| affected subgraph | 핵심 보강 | 대규모 계산 성능 |

| risk provenance | 보강 | 연구 신뢰성 |

| citizen observation scheduling | 특허 #2 후보 | Observe 서비스 |

| visual fallback | 특허 약함 | 대중 UX |

| country/origin map | 특허 약함 | Explore 콘텐츠 |

| Orbital Weather | 연구지표 | 대중 반복사용 |

| Fleet candidate OCM compare | 특허 #1 연계 | Operations |



# 부록 A. SQL 핵심 스키마

Codex 패키지 `schema.sql`을 authoritative starting point로 사용한다. 아래는 핵심 테이블 관계다.

A-1. SQL (앞부분; 전체는 패키지 파일 참조)

| -- Aetherus Orbital Environment canonical schema (PostgreSQL/PostGIS)<br>CREATE EXTENSION IF NOT EXISTS postgis;<br>CREATE EXTENSION IF NOT EXISTS pgcrypto;<br><br>CREATE TABLE data_source (<br>  id text PRIMARY KEY, name text NOT NULL, base_url text, license text, auth_type text NOT NULL DEFAULT 'none',<br>  max_poll_seconds integer, terms_checked_at timestamptz, enabled boolean NOT NULL DEFAULT true<br>);<br>CREATE TABLE ingestion_run (<br>  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), source_id text REFERENCES data_source(id), started_at timestamptz NOT NULL, finished_at timestamptz,<br>  status text NOT NULL CHECK(status IN ('RUNNING','SUCCEEDED','FAILED','PARTIAL')), request_fingerprint text, record_count integer DEFAULT 0, error_json jsonb<br>);<br>CREATE TABLE raw_artifact (<br>  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), source_id text REFERENCES data_source(id), ingestion_run_id uuid REFERENCES ingestion_run(id),<br>  retrieved_at timestamptz NOT NULL, source_uri text, content_sha256 text NOT NULL, media_type text, object_uri text NOT NULL, UNIQUE(source_id,content_sha256)<br>);<br>CREATE TABLE space_object (<br>  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), catalog_id text UNIQUE, cospar_id text, canonical_name text, object_type text NOT NULL,<br>  origin_code text, launch_date date, decay_date date, mass_kg double precision, rcs_m2 double precision, status text, created_at timestamptz DEFAULT now(), updated_at timestamptz DEFAULT now()<br>);<br>CREATE INDEX space_object_cospar_idx ON space_object(cospar_id);<br>CREATE INDEX space_object_origin_idx ON space_object(origin_code, object_type);<br>CREATE TABLE space_object_alias (object_id uuid REFERENCES space_object(id) ON DELETE CASCADE, source_id text, source_key text, source_name text, PRIMARY KEY(object_id,source_id,source_key));<br>CREATE TABLE orbit_solution (<br>  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), object_id uuid REFERENCES space_object(id), source_id text, source_artifact_id uuid REFERENCES raw_artifact(id),<br>  epoch timestamptz NOT NULL, format text NOT NULL, frame text NOT NULL, time_system text NOT NULL, theory text,<br>  state_json jsonb, mean_elements_json jsonb, covariance_json jsonb, quality_json jsonb, model_version text, created_at timestamptz DEFAULT now(),<br>  UNIQUE(object_id, source_id, epoch, format)<br>);<br>CREATE INDEX orbit_object_epoch_idx ON orbit_solution(object_id,epoch DESC);<br>CREATE TABLE propagation_snapshot (<br>  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), object_id uuid REFERENCES space_object(id), orbit_solution_id uuid REFERENCES orbit_solution(id),<br>  sample_time timestamptz NOT NULL, frame text NOT NULL, x_km double precision, y_km double precision, z_km double precision, vx_kms double precision, vy_kms double precision, vz_kms double precision,<br>  lat_deg double precision, lon_deg double precision, alt_km double precision, position geometry(PointZ,4978), model_version text NOT NULL, input_hash text NOT NULL<br>);<br>CREATE INDEX propagation_time_idx ON propagation_snapshot(sample_time);<br>CREATE INDEX propagation_geom_idx ON propagation_snapshot USING gist(position);<br>CREATE TABLE conjunction_event (<br>  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), primary_object_id uuid REFERENCES space_object(id), secondary_object_id uuid REFERENCES space_object(id),<br>  tca timestamptz NOT NULL, source_event_id text, first_seen_at timestamptz, last_seen_at timestamptz, status text NOT NULL DEFAULT 'OPEN', UNIQUE(primary_object_id,secondary_object_id,tca,source_event_id)<br>);<br>CREATE TABLE conjunction_snapshot (<br>  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), event_id uuid REFERENCES conjunction_event(id) ON DELETE CASCADE, snapshot_at timestamptz NOT NULL,<br>  miss_distance_m double precision, relative_speed_mps double precision, pc double precision, pc_method text, max_pc double precision, max_pc_method text,<br>  primary_covariance_json jsonb, secondary_covariance_json jsonb, dilution_state text, source_grade text NOT NULL, raw_artifact_id uuid REFERENCES raw_artifact(id), model_version text, input_hash text<br>);<br>CREATE INDEX conjunction_event_tca_idx ON conjunction_event(tca);<br>CREATE TABLE risk_edge (<br>  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), baseline_snapshot_id text NOT NULL, object_a uuid REFERENCES space_object(id), object_b uuid REFERENCES space_object(id),<br>  horizon_start timestamptz, horizon_end timestamptz, metric_type text NOT NULL, metric_value double precision NOT NULL, feature_json jsonb NOT NULL, provenance_json jsonb NOT NULL,<br>  UNIQUE(baseline_snapshot_id,object_a,object_b,metric_type,horizon_start,horizon_end)<br>);<br>CREATE TABLE intervention_scenario (<br>  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), kind text NOT NULL, target_object_id uuid REFERENCES space_object(id), protected_object_id uuid REFERENCES space_object(id),<br>  baseline_snapshot_id text NOT NULL, effective_time timestamptz, parameters jsonb NOT NULL, assumptions jsonb NOT NULL, status text NOT NULL DEFAULT 'DRAFT', model_version text NOT NULL, input_hash text NOT NULL, created_at timestamptz DEFAULT now()<br>);<br>CREATE TABLE scenario_run (<br>  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), scenario_id uuid REFERENCES intervention_scenario(id) ON DELETE CASCADE, started_at timestamptz, finished_at timestamptz,<br>  status text NOT NULL, affected_object_count integer, baseline_edge_count integer, scenario_edge_count integer, compute_ms bigint, validation_state text, result_hash text, error_json jsonb<br>);<br>CREATE TABLE benefit_result (<br>  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), scenario_run_id uuid REFERENCES scenario_run(id) ON DELETE CASCADE, target_object_id uuid REFERENCES space_object(id), beneficiary_object_id uuid REFERENCES space_object(id),<br>  benefit_class text NOT NULL, metric_type text NOT NULL, baseline_value double precision NOT NULL, scenario_value double precision NOT NULL, benefit_value double precision NOT NULL,<br>  confidence double precision, uncertainty_low double precision, uncertainty_high double precision, horizon text, provenance_json jsonb NOT NULL, UNIQUE(scenario_run_id,beneficiary_object_id,metric_type,horizon)<br>);<br>CREATE INDEX benefit_beneficiary_idx ON benefit_result(beneficiary_object_id, metric_type);<br>CREATE TABLE environment_metric (<br>  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), snapshot_id text NOT NULL, shell_id text NOT NULL, metric_type text NOT NULL, metric_value double precision NOT NULL,<br>  method_version text NOT NULL, assumptions jsonb NOT NULL, provenance_json jsonb NOT NULL, UNIQUE(snapshot_id,shell_id,metric_type,method_version)<br>);<br>CREATE TABLE visual_asset (<br>  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), object_id uuid REFERENCES space_object(id), event_key text, asset_type text NOT NULL, source_org text NOT NULL, source_url text NOT NULL,<br>  media_url text NOT NULL, license text, captured_at timestamptz, label text NOT NULL, is_primary boolean DEFAULT false, confidence double precision, verified_at timestamptz<br>);<br>CREATE TABLE observation_station (<br>  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), owner_user_id text, name text NOT NULL, station_type text NOT NULL, lat double precision NOT NULL, lon double precision NOT NULL, alt_m double precision NOT NULL,<br>  equipment_json jsonb NOT NULL, timing_grade text, calibration_state text, public boolean DEFAULT false, reputation double precision DEFAULT 0.5<br>);<br>CREATE TABLE observation_request (<br>  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), object_id uuid REFERENCES space_object(id), reason text NOT NULL, priority double precision NOT NULL,<br>  start_time timestamptz NOT NULL, end_time timestamptz NOT NULL, required_measurement_type text NOT NULL, min_quality jsonb NOT NULL, expected_information_gain double precision, model_version text NOT NULL, status text NOT NULL DEFAULT 'OPEN'<br>);<br>CREATE TABLE observation_submission (<br>  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), request_id uuid REFERENCES observation_request(id), station_id uuid REFERENCES observation_station(id), observed_at timestamptz NOT NULL,<br>  measurement_type text NOT NULL, measurements jsonb NOT NULL, raw_artifact_id uuid REFERENCES raw_artifact(id), time_accuracy_ms double precision, qa_state text NOT NULL DEFAULT 'PENDING', qa_json jsonb, created_at timestamptz DEFAULT now()<br>);<br>CREATE TABLE model_registry (<br>  id text NOT NULL, version text NOT NULL, category text NOT NULL, source_commit text NOT NULL, config_schema jsonb NOT NULL, validation_state text NOT NULL, created_at timestamptz DEFAULT now(), PRIMARY KEY(id,version)<br>);<br>CREATE TABLE validation_run (<br>  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), model_id text NOT NULL, model_version text NOT NULL, dataset_id text NOT NULL, dataset_version text NOT NULL,<br>  started_at timestamptz, finished_at timestamptz, metrics jsonb NOT NULL, config jsonb NOT NULL, input_hash text NOT NULL, result_hash text NOT NULL, pass boolean NOT NULL<br>);<br>CREATE TABLE research_dataset (id text PRIMARY KEY, name text NOT NULL, description text, license text NOT NULL, access_level text NOT NULL);<br>CREATE TABLE research_dataset_version (dataset_id text REFERENCES research_dataset(id), version text NOT NULL, snapshot_at timestamptz NOT NULL, manifest_uri text NOT NULL, sha256 text NOT NULL, model_versions jsonb NOT NULL, PRIMARY KEY(dataset_id,version)); |

| --- |



# 부록 B. REST API 예시

B-1. OpenAPI starter

| openapi: 3.1.0<br>info:<br>  title: Aetherus Orbital Environment API<br>  version: 1.0.0<br>servers:<br>  - url: /api<br>paths:<br>  /v1/objects:<br>    get:<br>      summary: Search canonical space objects<br>      parameters:<br>        - {name: q, in: query, schema: {type: string}}<br>        - {name: object_type, in: query, schema: {type: string}}<br>        - {name: origin_code, in: query, schema: {type: string}}<br>      responses: {'200': {description: OK}}<br>  /v1/objects/{object_id}:<br>    get:<br>      summary: Object metadata with provenance<br>      parameters: [{name: object_id, in: path, required: true, schema: {type: string}}]<br>      responses: {'200': {description: OK}, '404': {description: Not found}}<br>  /v1/objects/{object_id}/ephemeris:<br>    get:<br>      summary: Propagated ephemeris; never silently mixes model classes<br>      parameters:<br>        - {name: object_id, in: path, required: true, schema: {type: string}}<br>        - {name: start, in: query, required: true, schema: {type: string, format: date-time}}<br>        - {name: stop, in: query, required: true, schema: {type: string, format: date-time}}<br>        - {name: step_s, in: query, schema: {type: integer, minimum: 1, maximum: 3600}}<br>      responses: {'200': {description: OK}}<br>  /v1/conjunctions:<br>    get:<br>      summary: List conjunction events with source grade and risk provenance<br>      responses: {'200': {description: OK}}<br>  /v1/scenarios:<br>    post:<br>      summary: Create intervention scenario; computation is asynchronous<br>      responses: {'202': {description: Accepted}, '422': {description: Validation error}}<br>  /v1/scenarios/{scenario_id}/run:<br>    post:<br>      summary: Run baseline/counterfactual comparison<br>      responses: {'202': {description: Accepted}}<br>  /v1/scenarios/{scenario_id}/benefits:<br>    get:<br>      summary: Retrieve beneficiary objects and metric-specific benefit values<br>      responses: {'200': {description: OK}, '409': {description: Scenario not completed}}<br>  /v1/protect/{object_id}/candidates:<br>    post:<br>      summary: Reverse query - rank candidate interventions for a protected object<br>      responses: {'202': {description: Accepted}}<br>  /v1/observations/requests:<br>    get:<br>      summary: Observation missions ranked by scientific information value<br>      responses: {'200': {description: OK}}<br>  /v1/observations/submissions:<br>    post:<br>      summary: Submit citizen/research observation; starts QA pipeline<br>      responses: {'202': {description: Accepted}}<br>  /v1/research/datasets:<br>    get:<br>      summary: Versioned downloadable research datasets<br>      responses: {'200': {description: OK}}<br>  /v1/operations/fleets/{fleet_id}/risk:<br>    get:<br>      summary: Fleet exposure; enterprise authorization required<br>      responses: {'200': {description: OK}, '403': {description: Forbidden}}<br>  /v1/operations/fleets/{fleet_id}/maneuver-candidates:<br>    post:<br>      summary: Compare candidate ephemerides/OCMs including newly created risk edges<br>      responses: {'202': {description: Accepted}}<br>  /v1/orbital-weather/current:<br>    get:<br>      summary: Research-grade orbital environment summary; non-official labels clearly marked<br>      responses: {'200': {description: OK}} |

| --- |



# 부록 C. 알고리즘 의사코드

## C-1 Baseline risk graph

| def build_baseline(snapshot, horizon, config):<br>    candidates = coarse_screen(snapshot.objects, horizon, config.screen)<br>    edges=[]<br>    for a,b in candidates:<br>        tca=precise_tca(a,b,horizon)<br>        metric=compute_risk_metrics(a,b,tca,config)<br>        if metric.should_persist:<br>            edges.append(RiskEdge(...))<br>    return RiskGraph(snapshot_id=snapshot.id, edges=edges) |

| --- |



## C-2 Intervention benefit

| def run_intervention(s):<br>    G0 = load_or_build_baseline(s.baseline_snapshot_id)<br>    affected = affected_subgraph(G0, s)<br>    Gs = recompute_only_affected(G0, affected, apply_scenario(s))<br>    return attribute_benefits(G0, Gs, metric_config=s.metric_config) |

| --- |



## C-3 PROTECT

| def protect(Y, candidate_policy):<br>    ks = generate_candidates(Y, candidate_policy)<br>    results=[]<br>    for k in ks:<br>        run=run_intervention(default_intervention(k))<br>        results.append((k, run.benefit_for(Y), run.new_risk_penalty_for(Y)))<br>    return ranked(results) |

| --- |



## C-4 Visual resolver

| priority=[ACTUAL_PHOTO,RECOVERED_FRAGMENT,RADAR,TELESCOPE,SOURCE_SATELLITE,LAUNCH_IMAGE,OFFICIAL_GRAPHIC,SIMULATION]<br>return first_verified_asset(priority) |

| --- |



# 부록 D. 완료판정 체크리스트

- 실제 source 또는 공식 fixture가 입력된다.

- raw artifact hash가 저장된다.

- canonical parser가 validation을 수행한다.

- 과학 계산 함수가 상수/placeholder가 아니다.

- 계산 결과가 DB에 저장된다.

- 동일 입력의 재현 hash가 존재한다.

- API schema validation이 통과한다.

- UI가 API 결과를 사용한다.

- Unavailable 상태를 정상 표시한다.

- 단위/통합/E2E 테스트가 통과한다.

- 성능이 필요한 기능은 benchmark를 기록한다.

- source license/rate policy를 준수한다.

- evidence manifest가 생성된다.

- known limitations가 문서화된다.

# 부록 E. 공식 데이터/표준 출처

| 출처 | URL | 사용 |

| --- | --- | --- |

| CelesTrak GP/OMM | https://celestrak.org/NORAD/documentation/gp-data-formats.php | OMM/JSON/CSV GP query; OMM 권장, 6자리 catalog 대응 |

| Space-Track API | https://www.space-track.org/documentation | GP/GP_HISTORY/SATCAT/TIP 및 API throttling |

| CCSDS Orbit Data Messages | https://ccsds.org/Pubs/502x0b3e1.pdf | OPM/OMM/OEM/OCM 국제 표준 |

| TraCSS | https://space.commerce.gov/traffic-coordination-system-for-space-tracss/ | 미 상무부 civil SSA/STM |

| TraCSS CA Verification | https://space.commerce.gov/dataset-for-conjunction-assessment-verification/ | Conjunction 검증 데이터셋 |

| SatNOGS API | https://docs.satnogs.org/projects/satnogs-db/en/latest/api.html | 공개 REST/API 데이터 |

| ESA DISCOS | https://discosweb.esoc.esa.int/ | 우주물체 메타데이터 |

| NASA Orbital Debris | https://orbitaldebris.jsc.nasa.gov/ | 측정/모델/완화/사진 |

| KIPO 2026 심사기준 | https://kipo.go.kr/ko/kpoContentView.do?menuCd=SCD0201119 | 컴퓨터/AI 발명 포함 최신 심사기준 참조 |



# 부록 F. 엔진별 Implementation Cards

이 부록은 개발자가 실제 파일과 함수 단위로 구현할 때 사용하는 작업명세다. 앞 본문과 충돌하면 더 엄격한 조건을 적용한다. 모든 카드의 DONE Gate가 evidence manifest로 입증되어야 한다.

# F-1. Source Ingestion & Raw Artifact Engine

## 목적

외부 데이터의 원문을 손실 없이 수집하고, provider별 rate policy를 지키며, 동일 payload 중복 저장을 방지한다.

## 입력 계약

| 입력 | 필수/선택 | 검증 |

| --- | --- | --- |

| provider selector | 필수 | source adapter schema validation |

| credentials | provider별 | secret manager; log 금지 |

| poll policy | 필수 | 공식 rate보다 공격적이면 reject |



## 출력 계약

| 출력 | 저장/전달 | 절대 규칙 |

| --- | --- | --- |

| RawArtifact | object store + DB ref | sha256 불변 |

| IngestionRun | DB | RUNNING/SUCCEEDED/FAILED/PARTIAL |

| normalized candidates | queue | raw ref 없이 생성 금지 |



## 코드 모듈/함수

| 모듈 | 핵심 함수/클래스 | 책임 |

| --- | --- | --- |

| services/ingest/providers/base.py | OrbitProvider, CatalogProvider | provider-neutral interface |

| services/ingest/providers/celestrak.py | fetch_gp, parse_omm_json | CelesTrak |

| services/ingest/providers/spacetrack.py | session, batch_query | Space-Track |

| workers/ingest.py | run_ingestion | idempotent job |



## DB 연계

- data_source, ingestion_run, raw_artifact를 사용한다.

- raw_artifact는 content_sha256 unique를 유지한다.

- provider request metadata는 민감 credential 제외 후 error/debug JSON에 기록한다.

## API/UI 연계

- /admin/providers/health

- /internal/ingestion/runs; 일반사용자 UI에는 provider 오류를 직접 노출하지 않고 data status로 전달

## 실패 상태와 처리

| 상태 | 조건 | 처리 |

| --- | --- | --- |

| RATE_LIMITED | 429/provider policy | 재시도 예약; stale snapshot 유지 |

| PARSE_REJECT | schema/field invalid | raw 보존, normalized 반영 금지 |

| AUTH_FAILED | credential invalid | 즉시 실패/운영알림 |

| PARTIAL | 일부 레코드 실패 | 성공/실패 수 기록 |



## 필수 테스트

| Test ID | 테스트 | 통과조건 |

| --- | --- | --- |

| ING-F01 | 동일 raw 두 번 수집 | raw_artifact 1개 + run 2개 |

| ING-F02 | 429 응답 | 정책 backoff, 무한 retry 없음 |

| ING-F03 | malformed record | quarantine 후 나머지 처리 |

| ING-F04 | secret log scan | credential 문자열 0건 |



## 성능/운영

- provider별 last_success_age와 parse_reject_count를 metric으로 노출한다.

- 대용량 응답은 streaming/file path로 처리하고 메모리 전체 적재를 피한다.

## DONE Gate

- CelesTrak 실제/고정 fixture ingest 증거

- raw hash와 normalized row 수

- source outage 시 STALE 처리 E2E

- credential redaction test

## Codex 주의

- HTTP 200을 받았다는 이유로 파싱/저장 성공으로 간주하지 말 것.

# F-2. Object Identity Resolution Engine

## 목적

NORAD/COSPAR/source alias를 이용해 동일 우주물체를 하나의 canonical object로 연결하고, 이름 변경과 6자리 catalog를 안전하게 처리한다.

## 입력 계약

| 입력 | 필수/선택 | 검증 |

| --- | --- | --- |

| source record | 필수 | source_id + source_key |

| catalog_id | 가능시 | 문자열, 1~9 digits |

| cospar_id | 선택 | format validation |



## 출력 계약

| 출력 | 저장/전달 | 절대 규칙 |

| --- | --- | --- |

| space_object | DB | canonical UUID |

| space_object_alias | DB | source별 trace |

| identity_conflict | queue/admin | 자동 병합 보류 |



## 코드 모듈/함수

| 모듈 | 핵심 함수/클래스 | 책임 |

| --- | --- | --- |

| domain/object_identity.py | resolve, create_or_update | identity rules |

| domain/origin_map.py | normalize_origin | owner/source mapping |



## DB 연계

- catalog_id unique 충돌은 자동 이름 기반 병합보다 우선한다.

- COSPAR가 같고 catalog가 다른 경우 자동 merge 금지; conflict로 보낸다.

## API/UI 연계

- GET /v1/objects

- object detail provenance tab

## 실패 상태와 처리

| 상태 | 조건 | 처리 |

| --- | --- | --- |

| IDENTITY_CONFLICT | 키 불일치 | admin review |

| UNKNOWN_OBJECT | 필수 식별자 부족 | temporary source-scoped object 또는 quarantine 정책 |

| ORIGIN_AMBIGUOUS | 다국적/기관코드 | unknown/multinational로 분리 |



## 필수 테스트

| Test ID | 테스트 | 통과조건 |

| --- | --- | --- |

| ID-F01 | 100100 catalog | 정상 저장/검색 |

| ID-F02 | same catalog different name | 같은 canonical + alias |

| ID-F03 | same COSPAR different catalog | conflict 생성 |

| ID-F04 | origin unknown | UNKNOWN, 임의 국가 금지 |



## 성능/운영

- object search index와 alias query p95를 측정한다.

## DONE Gate

- 6자리 catalog E2E

- alias provenance 확인

- conflict UI/admin path

## Codex 주의

- 이름 문자열 유사도만으로 자동 병합하지 말 것.

# F-3. Orbit Propagation & Frames Engine

## 목적

OMM/GP/OEM/OCM 등 궤도해를 데이터 등급에 맞는 모델로 전파하고 좌표계/시간계를 명확히 변환한다.

## 입력 계약

| 입력 | 필수/선택 | 검증 |

| --- | --- | --- |

| OrbitSolution | 필수 | epoch/frame/time_system/theory |

| target times | 필수 | UTC aware |

| EOP/time data | 변환시 | 버전/age |



## 출력 계약

| 출력 | 저장/전달 | 절대 규칙 |

| --- | --- | --- |

| StateVector | API/cache | frame 명시 |

| GeodeticPosition | API | lat/lon/alt |

| PropagationProvenance | DB/API | model+input hash |



## 코드 모듈/함수

| 모듈 | 핵심 함수/클래스 | 책임 |

| --- | --- | --- |

| science/orbit/sgp4.py | propagate_omm | GP path |

| science/orbit/frames.py | teme_to_itrf, to_geodetic | frame transform |

| science/orbit/precision.py | propagate_oem_ocm | precision path |

| api/ephemeris.py | range endpoint | validation/pagination |



## DB 연계

- orbit_solution append-only.

- 대량 전파 결과는 Parquet/cache를 사용하고 모든 샘플을 OLTP DB에 무조건 저장하지 않는다.

## API/UI 연계

- GET /v1/objects/{id}/ephemeris

- 3D worker consumes sampled polyline

## 실패 상태와 처리

| 상태 | 조건 | 처리 |

| --- | --- | --- |

| STALE_ORBIT | data age 초과 | 계산 가능하나 stale flag |

| INVALID_ELEMENTS | SGP4 error | UNAVAILABLE, NaN 금지 |

| FRAME_UNSUPPORTED | unknown frame | 명시 오류 |

| EOP_STALE | 정밀 변환 data old | quality downgrade |



## 필수 테스트

| Test ID | 테스트 | 통과조건 |

| --- | --- | --- |

| ORB-F01 | epoch known state | trusted lib tolerance |

| ORB-F02 | UTC aware enforcement | naive datetime reject |

| ORB-F03 | long propagation stale | stale badge |

| ORB-F04 | frame roundtrip | configured tolerance |



## 성능/운영

- cache key = orbit_solution_id+time grid+model version.

- N objects X M samples는 vector/batch path 사용.

## DONE Gate

- golden fixture cross-check

- API response provenance

- 3D position uses API only

## Codex 주의

- 브라우저에서 자체 SGP4를 병행할 경우 backend 기준과 버전 동기화 증거가 없으면 금지.

# F-4. Conjunction Screening Engine

## 목적

대규모 객체쌍에서 conservative coarse screen으로 후보를 만들고 precise TCA 계산으로 근접사건을 생성한다.

## 입력 계약

| 입력 | 필수/선택 | 검증 |

| --- | --- | --- |

| Object states/solutions | 필수 | propagable |

| screening window | 필수 | bounded |

| screen config | 필수 | versioned |



## 출력 계약

| 출력 | 저장/전달 | 절대 규칙 |

| --- | --- | --- |

| candidate pairs | worker | precision queue |

| ConjunctionEvent/Snapshot | DB | TCA/miss/vrel |

| validation metrics | DB | dataset/version |



## 코드 모듈/함수

| 모듈 | 핵심 함수/클래스 | 책임 |

| --- | --- | --- |

| science/ca/screen.py | coarse_screen | no-false-negative target |

| science/ca/tca.py | find_tca | bracket+refine |

| science/ca/service.py | assess_pairs | persist |



## DB 연계

- conjunction_event pair identity와 conjunction_snapshot version을 분리한다.

- 동일 사건의 갱신 CDM/계산은 snapshot append.

## API/UI 연계

- GET /v1/conjunctions

- object risk panel

## 실패 상태와 처리

| 상태 | 조건 | 처리 |

| --- | --- | --- |

| SCREEN_INVALID | bad window/config | job fail |

| PROPAGATION_FAILED | one object failed | pair skipped with reason; overall PARTIAL |

| TCA_BOUNDARY | minimum at boundary | flag; optional expanded window |



## 필수 테스트

| Test ID | 테스트 | 통과조건 |

| --- | --- | --- |

| CA-F01 | injected close pair | coarse screen retains |

| CA-F02 | known minimum | TCA tolerance |

| CA-F03 | boundary minimum | boundary flag |

| CA-F04 | full verification corpus | recall/false-event metrics |



## 성능/운영

- pair count before/after coarse screen 기록.

- screening optimization 변경 시 검증 corpus 재실행.

## DONE Gate

- false-negative gate

- TCA tolerance gate

- event DB/API E2E

## Codex 주의

- candidate 수가 적게 나왔다는 이유만으로 성공으로 간주하지 말 것.

# F-5. Collision Probability & Risk Provenance Engine

## 목적

공분산 등 조건이 갖춰질 때만 Pc를 계산하고, MaxProbability/스크리닝값과 분리하여 metric별 계보를 보존한다.

## 입력 계약

| 입력 | 필수/선택 | 검증 |

| --- | --- | --- |

| relative state at TCA | 필수 | same frame |

| covariances | Pc 필수 | positive/validity |

| HBR | 필수/정책 | source or configured |

| Pc method config | 필수 | versioned |



## 출력 계약

| 출력 | 저장/전달 | 절대 규칙 |

| --- | --- | --- |

| RiskMetric PC | DB/API | [0,1] |

| Quality flags | DB/API | dilution/covariance |

| RiskProvenance | DB/API | method/source/hash |



## 코드 모듈/함수

| 모듈 | 핵심 함수/클래스 | 책임 |

| --- | --- | --- |

| science/risk/pc.py | compute_pc | validated plugin |

| science/risk/provenance.py | build_provenance | source grade |

| science/risk/validate.py | covariance_checks | guardrails |



## DB 연계

- conjunction_snapshot pc fields는 source-derived; 자체 계산값은 model result table/fields로 구분.

## API/UI 연계

- conjunction detail Research tab

## 실패 상태와 처리

| 상태 | 조건 | 처리 |

| --- | --- | --- |

| PC_UNAVAILABLE | covariance missing | Pc null + reason |

| COVARIANCE_INVALID | not PSD/units | quarantine metric |

| METHOD_MISMATCH | comparison methods differ | warning, no direct delta unless allowed |



## 필수 테스트

| Test ID | 테스트 | 통과조건 |

| --- | --- | --- |

| PC-F01 | official/spec fixture | known path |

| PC-F02 | missing covariance | null not zero |

| PC-F03 | Pc bounds | 0<=Pc<=1 |

| PC-F04 | method comparison | mismatch warning |



## 성능/운영

- Pc 계산은 CPU hot path일 수 있으므로 batch/vectorization benchmark.

## DONE Gate

- null-vs-zero test

- provenance completeness

- method stored

## Codex 주의

- MaxProbability를 Pc로 이름변경하지 말 것.

# F-6. Risk Graph Engine

## 목적

객체별 risk score를 단일 숫자로 납작하게 만들기 전에 metric-specific edge를 저장하여 후속 Benefit 계산을 재현 가능하게 한다.

## 입력 계약

| 입력 | 필수/선택 | 검증 |

| --- | --- | --- |

| conjunction metrics | 필수 | event/snapshot |

| density/fragmentation features | 선택 | method version |



## 출력 계약

| 출력 | 저장/전달 | 절대 규칙 |

| --- | --- | --- |

| RiskEdge set | DB | metric/horizon/provenance |

| RiskGraph snapshot | cache/dataset | baseline ID |



## 코드 모듈/함수

| 모듈 | 핵심 함수/클래스 | 책임 |

| --- | --- | --- |

| science/risk/graph.py | build_graph, aggregate_object_risk | graph logic |

| repositories/risk_edge.py | bulk_upsert/read | persistence |



## DB 연계

- risk_edge unique key에 baseline snapshot/metric/horizon 포함.

## API/UI 연계

- Research graph view, Benefit Engine input

## 실패 상태와 처리

| 상태 | 조건 | 처리 |

| --- | --- | --- |

| METRIC_UNSUPPORTED | unknown metric | exclude explicitly |

| WEIGHT_CONFIG_MISSING | composite requested | reject composite |



## 필수 테스트

| Test ID | 테스트 | 통과조건 |

| --- | --- | --- |

| RG-F01 | edge persistence | same input deterministic |

| RG-F02 | metric separation | PC/MAX_PC distinct rows |

| RG-F03 | composite config | version required |



## 성능/운영

- 희소 edge table/partition 고려.

## DONE Gate

- metric edge export

- graph snapshot hash

- composite weights downloadable

## Codex 주의

- UI용 score를 위해 원 metric를 삭제하지 말 것.

# F-7. Intervention Benefit Engine

## 목적

개입 전/후 위험관계 차이를 비대상 객체별로 귀속하여 beneficiary를 산출한다.

## 입력 계약

| 입력 | 필수/선택 | 검증 |

| --- | --- | --- |

| Baseline RiskGraph | 필수 | snapshot fixed |

| Scenario | 필수 | target/kind/effective time |

| metric config/horizon | 필수 | version |



## 출력 계약

| 출력 | 저장/전달 | 절대 규칙 |

| --- | --- | --- |

| ScenarioRun | DB | status/timing |

| BenefitResult[] | DB/API | beneficiary+metric |

| EnvironmentBenefit | DB/API | separate class |



## 코드 모듈/함수

| 모듈 | 핵심 함수/클래스 | 책임 |

| --- | --- | --- |

| science/benefit/engine.py | run_scenario | orchestration |

| science/benefit/attribution.py | attribute_delta | beneficiary |

| science/benefit/environment.py | shell_delta | environment |



## DB 연계

- scenario definition과 run 결과 분리.

- run은 immutable result hash 보존.

## API/UI 연계

- POST scenario/run

- GET benefits

- REMOVE visualization

## 실패 상태와 처리

| 상태 | 조건 | 처리 |

| --- | --- | --- |

| BASELINE_MISSING | snapshot absent | fail |

| SCENARIO_INVALID | parameters inconsistent | 422 |

| PARTIAL_SCIENCE | some pairs failed | PARTIAL + warnings |



## 필수 테스트

| Test ID | 테스트 | 통과조건 |

| --- | --- | --- |

| BEN-F01 | direct remove | beneficiary delta exact |

| BEN-F02 | metric channels | PC/MAXPC separate |

| BEN-F03 | run repeat | same hash/result |

| BEN-F04 | no data | no fake beneficiary |



## 성능/운영

- Affected subgraph with full-equivalence benchmark.

## DONE Gate

- benefit rows persisted

- UI beneficiary highlights from API

- scenario evidence manifest

## Codex 주의

- “remove animation”만 구현하고 계산 결과가 없으면 미완료.

# F-8. Affected Subgraph Engine

## 목적

개입으로 바뀔 가능성이 있는 관계만 정밀 재계산하여 대규모 반사실 계산의 비용을 줄인다.

## 입력 계약

| 입력 | 필수/선택 | 검증 |

| --- | --- | --- |

| G0 | 필수 | baseline edges |

| scenario swept path | 필수 | target modified trajectory |

| conservative screen config | 필수 | validated |



## 출력 계약

| 출력 | 저장/전달 | 절대 규칙 |

| --- | --- | --- |

| AffectedObjectSet | run artifact | reason codes |

| AffectedEdgeSet | run artifact | candidate relations |



## 코드 모듈/함수

| 모듈 | 핵심 함수/클래스 | 책임 |

| --- | --- | --- |

| science/benefit/affected.py | select_affected_objects | union rules |

| science/benefit/reuse.py | reuse_unaffected_baseline | safe copy |



## DB 연계

- scenario_run에 affected_object_count 저장.

## API/UI 연계

- Research performance detail

## 실패 상태와 처리

| 상태 | 조건 | 처리 |

| --- | --- | --- |

| FILTER_UNVALIDATED | config validation missing | RESEARCH_ONLY or disable optimization |

| EQUIVALENCE_FAILED | full vs selective mismatch | optimization rollback |



## 필수 테스트

| Test ID | 테스트 | 통과조건 |

| --- | --- | --- |

| AFF-F01 | synthetic injected influence | included |

| AFF-F02 | full equivalence | beneficiary set/metrics tolerance |

| AFF-F03 | new OCM path | new-risk candidates included |



## 성능/운영

- 성능 benchmark와 물리 output diff를 별도 수치로 기록.

## DONE Gate

- full-vs-fast regression

- filter version in provenance

- rollback switch

## Codex 주의

- 속도 향상을 위해 filter threshold를 임의 축소하지 말 것.

# F-9. PROTECT Reverse Query Engine

## 목적

보호대상 Y를 지정하고 복수 개입대상 후보의 Benefit(k→Y)를 계산해 역방향 의사결정 데이터를 제공한다.

## 입력 계약

| 입력 | 필수/선택 | 검증 |

| --- | --- | --- |

| protected object(s) | 필수 | canonical IDs |

| candidate policy | 필수 | source/type/orbit constraints |



## 출력 계약

| 출력 | 저장/전달 | 절대 규칙 |

| --- | --- | --- |

| CandidateInterventionRank[] | API | benefit/confidence/new risk |

| Benefit matrix slice | Research | k x Y |



## 코드 모듈/함수

| 모듈 | 핵심 함수/클래스 | 책임 |

| --- | --- | --- |

| science/protect/candidates.py | generate_candidates | coarse |

| science/protect/rank.py | rank_for_protected | calls Benefit |



## DB 연계

- 별도 table 없이 scenario/benefit를 재사용하고 query cache만 사용 가능.

## API/UI 연계

- POST /v1/protect/{id}/candidates

- PROTECT UI

## 실패 상태와 처리

| 상태 | 조건 | 처리 |

| --- | --- | --- |

| NO_CANDIDATES | policy filters all | empty with explanation |

| LOW_CONFIDENCE | benefit uncertain | show observation suggestion |



## 필수 테스트

| Test ID | 테스트 | 통과조건 |

| --- | --- | --- |

| PRO-F01 | known synthetic ranking | order correct |

| PRO-F02 | inactive protected object | allowed research mode |

| PRO-F03 | new risk penalty | ranking reflects |



## 성능/운영

- 후보가 많으면 coarse risk contribution으로 shortlist 후 full scenario.

## DONE Gate

- candidate shortlist trace

- benefit rows reusable

- no official recommendation wording

## Codex 주의

- “가장 위험한 debris” 단순 sorting으로 대체하지 말 것.

# F-10. Candidate OCM Scenario Group Engine

## 목적

동일 위성의 nominal/candidate ephemerides를 공통 외부 객체집합과 비교해 기동별 수혜와 신규 위험을 동시에 계산한다.

## 입력 계약

| 입력 | 필수/선택 | 검증 |

| --- | --- | --- |

| nominal ephemeris | 필수 | scenario group identity |

| candidate OCMs | 1+ | same object designator |

| external object set | 필수 | fixed snapshot |



## 출력 계약

| 출력 | 저장/전달 | 절대 규칙 |

| --- | --- | --- |

| EdgeDelta | API/DB | resolved/new/changed |

| CandidateSummary | API | benefit+risk increase |



## 코드 모듈/함수

| 모듈 | 핵심 함수/클래스 | 책임 |

| --- | --- | --- |

| science/scenario/ocm_group.py | build_group, compare_candidates | group rules |

| science/benefit/edge_delta.py | diff_edges | delta |



## DB 연계

- scenario parameters에 candidate file hash 저장.

## API/UI 연계

- Operations maneuver candidates

## 실패 상태와 처리

| 상태 | 조건 | 처리 |

| --- | --- | --- |

| SELF_SCREEN | same-designator pair accidentally screened | test failure |

| CANDIDATE_STALE | ephemeris invalid window | reject |



## 필수 테스트

| Test ID | 테스트 | 통과조건 |

| --- | --- | --- |

| OCM-F01 | same designator exclusion | no self conjunction |

| OCM-F02 | new edge injected | risk increase visible |

| OCM-F03 | candidate hash | provenance complete |



## 성능/운영

- candidate count X external objects batch scheduling.

## DONE Gate

- resolved/new edge lists

- candidate provenance

- no command path

## Codex 주의

- 최저 Pc 하나만 보고 후보를 선택하지 말 것.

# F-11. Fragmentation Scenario Engine

## 목적

가상 충돌/파편화가 미래 환경에 미치는 영향을 통계적으로 평가하고 indirect benefit을 계산한다.

## 입력 계약

| 입력 | 필수/선택 | 검증 |

| --- | --- | --- |

| parent objects | 필수 | mass/relative state ranges |

| breakup model config | 필수 | version |

| Monte Carlo seed policy | 필수 | reproducible |



## 출력 계약

| 출력 | 저장/전달 | 절대 규칙 |

| --- | --- | --- |

| FragmentCohort[] | research store | distributions |

| ExposureDelta | Benefit | indirect |



## 코드 모듈/함수

| 모듈 | 핵심 함수/클래스 | 책임 |

| --- | --- | --- |

| science/fragmentation/model.py | generate_cohorts | plugin |

| science/fragmentation/propagate.py | propagate_cohorts | statistical |

| science/fragmentation/exposure.py | compute_exposure | indirect |



## DB 연계

- 대량 개별 fragment DB row 대신 cohort/Parquet를 기본.

## API/UI 연계

- WHAT IF THEY COLLIDE?, Research mode

## 실패 상태와 처리

| 상태 | 조건 | 처리 |

| --- | --- | --- |

| INPUT_RANGE_ONLY | mass unknown | distribution assumption shown |

| MODEL_NOT_VALIDATED | new model | RESEARCH_ONLY |



## 필수 테스트

| Test ID | 테스트 | 통과조건 |

| --- | --- | --- |

| FRG-F01 | fixed seed reproducibility | same distribution hash |

| FRG-F02 | assumption output | all assumptions exposed |

| FRG-F03 | remove path | indirect benefit decreases |



## 성능/운영

- Monte Carlo runs async, progress/partial stats.

## DONE Gate

- simulation badge

- seed/model version

- percentile output

## Codex 주의

- 가상 fragment를 실제 추적 object처럼 object table에 등록하지 말 것.

# F-12. Re-entry Intelligence Engine

## 목적

공개 decaying/TIP/궤도감소 데이터를 품질등급별로 통합해 예측 window와 업데이트 이력을 제공한다.

## 입력 계약

| 입력 | 필수/선택 | 검증 |

| --- | --- | --- |

| decay/TIP messages | 가능시 | source timestamp |

| orbit decay trend | 보조 | model grade |



## 출력 계약

| 출력 | 저장/전달 | 절대 규칙 |

| --- | --- | --- |

| ReentryPrediction[] | DB/API | window+grade |

| ReentryHistory | UI | version timeline |



## 코드 모듈/함수

| 모듈 | 핵심 함수/클래스 | 책임 |

| --- | --- | --- |

| science/reentry/adapter.py | parse_tip | source |

| science/reentry/model.py | research_watch | low-grade |



## DB 연계

- reentry_prediction append/version.

## API/UI 연계

- reentry watch list, notifications

## 실패 상태와 처리

| 상태 | 조건 | 처리 |

| --- | --- | --- |

| NO_PREDICTION | only low-altitude object | WATCH only |

| WINDOW_WIDENED | new data changes | history preserved |



## 필수 테스트

| Test ID | 테스트 | 통과조건 |

| --- | --- | --- |

| RE-F01 | TIP parse | window fields |

| RE-F02 | no TIP | not fake exact time |

| RE-F03 | version timeline | old prediction preserved |



## 성능/운영

- 긴급 polling도 provider terms 준수.

## DONE Gate

- grade visible

- absolute dates UTC/local clear

- source linked

## Codex 주의

- 저궤도라는 이유만으로 재진입 일시를 생성하지 말 것.

# F-13. Photometry & Rotation Intelligence Engine

## 목적

광도 관측에서 회전주기 후보와 불확실성을 산출하되 형상/자세 추정의 한계를 명시한다.

## 입력 계약

| 입력 | 필수/선택 | 검증 |

| --- | --- | --- |

| photometry series | 필수 | timestamp/magnitude/uncertainty |

| station metadata | 필수 | filter/equipment |



## 출력 계약

| 출력 | 저장/전달 | 절대 규칙 |

| --- | --- | --- |

| PeriodCandidates | Research | period/power/alias/confidence |

| RotationEstimate | UI | estimated label |



## 코드 모듈/함수

| 모듈 | 핵심 함수/클래스 | 책임 |

| --- | --- | --- |

| science/photometry/clean.py | normalize_series | QA |

| science/photometry/period.py | lomb_scargle | candidate |

| science/photometry/confidence.py | bootstrap | uncertainty |



## DB 연계

- raw observation과 derived estimate 분리.

## API/UI 연계

- object rotation tab

## 실패 상태와 처리

| 상태 | 조건 | 처리 |

| --- | --- | --- |

| TOO_FEW_POINTS | insufficient samples | no period |

| ALIAS_AMBIGUOUS | multiple peaks | show candidates |



## 필수 테스트

| Test ID | 테스트 | 통과조건 |

| --- | --- | --- |

| ROT-F01 | synthetic sinusoid | period recovery |

| ROT-F02 | alias fixture | ambiguous state |

| ROT-F03 | missing uncertainty | quality downgrade |



## 성능/운영

- batch per object, cache derived result by dataset hash.

## DONE Gate

- estimated label

- raw series downloadable

- model version

## Codex 주의

- 가장 높은 peak 하나를 “확정 회전주기”로 단정하지 말 것.

# F-14. Observation Intelligence Engine

## 목적

위험도·불확실성·관측가능성·정보이득을 결합해 필요한 관측을 자동 생성한다.

## 입력 계약

| 입력 | 필수/선택 | 검증 |

| --- | --- | --- |

| object covariance/quality | 필수/대체 | uncertainty model |

| stations | 필수 | coords/equipment |

| visibility window | 필수 | orbit+sun |

| measurement noise model | 필수 | version |



## 출력 계약

| 출력 | 저장/전달 | 절대 규칙 |

| --- | --- | --- |

| ObservationRequest | DB/API | priority/window/type |

| ExpectedInformationGain | Research | pre-observation estimate |



## 코드 모듈/함수

| 모듈 | 핵심 함수/클래스 | 책임 |

| --- | --- | --- |

| science/observe/visibility.py | passes | geometry |

| science/observe/info_gain.py | expected_gain | covariance |

| science/observe/planner.py | rank_requests | priority |



## DB 연계

- observation_request stores model_version/min_quality.

## API/UI 연계

- Observe mission list, notification

## 실패 상태와 처리

| 상태 | 조건 | 처리 |

| --- | --- | --- |

| NO_VISIBILITY | no pass | no request |

| NO_COVARIANCE | use approved empirical model or mark low confidence |  |

| STATION_LIMIT | angular rate/weather | exclude |



## 필수 테스트

| Test ID | 테스트 | 통과조건 |

| --- | --- | --- |

| OBS-F01 | known pass | window correct |

| OBS-F02 | sun/eclipsed flag | correct |

| OBS-F03 | station mount limit | excluded |

| OBS-F04 | info gain order | synthetic geometry |



## 성능/운영

- request generation batch per night/region.

## DONE Gate

- why-this-request explanation

- expected gain separated from realized

- station constraints

## Codex 주의

- 시민 참여를 위해 임의 “긴급” 라벨을 붙이지 말 것.

# F-15. Citizen Observation QA & Contribution Engine

## 목적

시민/대학 관측을 과학 계산에 넣기 전에 시간·장비·잔차·중복을 검증하고 기여도를 기록한다.

## 입력 계약

| 입력 | 필수/선택 | 검증 |

| --- | --- | --- |

| submission | 필수 | raw hash + values |

| station/equipment | 필수 | calibration |

| request context | 선택 | mission |



## 출력 계약

| 출력 | 저장/전달 | 절대 규칙 |

| --- | --- | --- |

| QAResult | DB | accepted/rejected reason |

| ValidatedMeasurement | OD queue | only accepted |

| ContributionRecord | user UI | realized gain |



## 코드 모듈/함수

| 모듈 | 핵심 함수/클래스 | 책임 |

| --- | --- | --- |

| science/observe/qa.py | validate_submission | checks |

| science/observe/contribution.py | compare_before_after | realized gain |



## DB 연계

- raw immutable; QA state append/audit.

## API/UI 연계

- POST submissions

- profile contribution

## 실패 상태와 처리

| 상태 | 조건 | 처리 |

| --- | --- | --- |

| DUPLICATE | same hash | dedupe |

| TIME_BAD | clock issue | quarantine |

| RESIDUAL_OUTLIER | fit outlier | reject/quarantine |

| LICENSE_MISSING | no consent | do not publish/use beyond terms |



## 필수 테스트

| Test ID | 테스트 | 통과조건 |

| --- | --- | --- |

| CIT-F01 | duplicate | one accepted |

| CIT-F02 | bad timestamp | no OD update |

| CIT-F03 | accepted measurement | queue event |

| CIT-F04 | contribution | before/after metric backed |



## 성능/운영

- upload limits, malware/image safety, PII minimization.

## DONE Gate

- raw/QA/audit records

- accepted-only OD hook

- contribution proof

## Codex 주의

- “참여해줘서 10% 개선” 같은 값은 실제 before/after 계산 없으면 금지.

# F-16. Genealogy & Origin Intelligence Engine

## 목적

발사·부모객체·파편화 사건·연구미션을 관계로 연결해 우주물체 족보와 국가/기관별 기원을 표현한다.

## 입력 계약

| 입력 | 필수/선택 | 검증 |

| --- | --- | --- |

| object metadata | 필수 | catalog/COSPAR |

| event/launch metadata | 가능시 | source |



## 출력 계약

| 출력 | 저장/전달 | 절대 규칙 |

| --- | --- | --- |

| GraphRelations | DB/API | typed relations |

| OriginProfile | UI | source/uncertainty |



## 코드 모듈/함수

| 모듈 | 핵심 함수/클래스 | 책임 |

| --- | --- | --- |

| domain/genealogy.py | resolve_parent_event | relations |

| domain/origin.py | origin_profile | codes |



## DB 연계

- relation table를 별도 추가 권고: object_relation(subject,predicate,object/event,provenance).

## API/UI 연계

- GET /v1/genealogy/{id}

- country/origin dashboard

## 실패 상태와 처리

| 상태 | 조건 | 처리 |

| --- | --- | --- |

| AMBIGUOUS_PARENT | multiple candidates | show uncertain |

| NO_ORIGIN | unknown | unknown; infer from name 금지 |



## 필수 테스트

| Test ID | 테스트 | 통과조건 |

| --- | --- | --- |

| GEN-F01 | known debris family | links |

| GEN-F02 | unknown | no fake country |

| GEN-F03 | event timeline | chronological |



## 성능/운영

- graph traversal cache.

## DONE Gate

- source per edge

- uncertainty label

- event grouping

## Codex 주의

- OWNER와 ORIGIN을 하나의 필드로 뭉개지 말 것.

# F-17. Visual Asset Resolution Engine

## 목적

실제 사진이 없는 객체도 출처 위성/발사 이미지/공식 그래픽/시뮬레이션을 정확한 라벨로 제공한다.

## 입력 계약

| 입력 | 필수/선택 | 검증 |

| --- | --- | --- |

| object/event IDs | 필수 | canonical |

| asset metadata | 필수 | source/license/type |



## 출력 계약

| 출력 | 저장/전달 | 절대 규칙 |

| --- | --- | --- |

| PrimaryVisual | UI | label/source |

| Gallery | UI | asset types |



## 코드 모듈/함수

| 모듈 | 핵심 함수/클래스 | 책임 |

| --- | --- | --- |

| services/media/resolver.py | resolve_primary | priority |

| services/media/license.py | can_cache | policy |



## DB 연계

- visual_asset table + optional optimized cache.

## API/UI 연계

- object visual tab

## 실패 상태와 처리

| 상태 | 조건 | 처리 |

| --- | --- | --- |

| LICENSE_UNKNOWN | cache not allowed | external link only or hide |

| BROKEN_MEDIA | fetch fail | fallback next asset |



## 필수 테스트

| Test ID | 테스트 | 통과조건 |

| --- | --- | --- |

| VIS-F01 | actual exists | actual selected |

| VIS-F02 | actual absent launch exists | LAUNCH IMAGE label |

| VIS-F03 | nothing | SIMULATION label |



## 성능/운영

- media CDN separate from scientific API.

## DONE Gate

- label visible

- credit/source visible

- no misleading thumbnail

## Codex 주의

- 발사대 사진을 debris 실사진처럼 제목 없이 표시하지 말 것.

# F-18. Orbital Weather & Congestion Engine

## 목적

반복 방문을 유도하는 대중 친화적 우주환경 요약을 원 지표에서 계산한다.

## 입력 계약

| 입력 | 필수/선택 | 검증 |

| --- | --- | --- |

| object snapshot | 필수 | coverage |

| conjunction feed | 필수/가능 | source grade |

| reentry feed | 선택 | grade |



## 출력 계약

| 출력 | 저장/전달 | 절대 규칙 |

| --- | --- | --- |

| OrbitalWeatherSnapshot | API | underlying metrics |

| ShellMetrics | Research | counts/densities |



## 코드 모듈/함수

| 모듈 | 핵심 함수/클래스 | 책임 |

| --- | --- | --- |

| science/environment/shells.py | bin_objects | shell metrics |

| science/environment/weather.py | classify | versioned thresholds |



## DB 연계

- environment_metric versioned.

## API/UI 연계

- GET /v1/orbital-weather/current

- home card

## 실패 상태와 처리

| 상태 | 조건 | 처리 |

| --- | --- | --- |

| LOW_COVERAGE | metadata coverage low | coverage warning |

| SOURCE_GAP | conjunction feed stale | partial status |



## 필수 테스트

| Test ID | 테스트 | 통과조건 |

| --- | --- | --- |

| ENV-F01 | shell bin edges | boundary correct |

| ENV-F02 | coverage ratio | known/unknown mass |

| ENV-F03 | grade thresholds | version stored |



## 성능/운영

- daily/hourly derived snapshot, not per request recompute.

## DONE Gate

- underlying metrics drawer

- research label

- coverage shown

## Codex 주의

- “VERY HIGH”만 보여주고 수치/기준을 숨기지 말 것.

# F-19. Research Dataset & Benchmark Engine

## 목적

원자료·파생자료·모델버전·hash를 고정한 재현 가능한 데이터셋과 검증 결과를 제공한다.

## 입력 계약

| 입력 | 필수/선택 | 검증 |

| --- | --- | --- |

| snapshot definition | 필수 | sources/time |

| schema/model versions | 필수 | immutable |



## 출력 계약

| 출력 | 저장/전달 | 절대 규칙 |

| --- | --- | --- |

| DatasetVersion | manifest | sha256 |

| Parquet/CSV/JSON | download | licensed |



## 코드 모듈/함수

| 모듈 | 핵심 함수/클래스 | 책임 |

| --- | --- | --- |

| services/research/build_dataset.py | freeze_snapshot | export |

| services/research/benchmark.py | run_benchmark | metrics |



## DB 연계

- research_dataset/version + object store.

## API/UI 연계

- GET /v1/research/datasets

- download/metadata

## 실패 상태와 처리

| 상태 | 조건 | 처리 |

| --- | --- | --- |

| LICENSE_BLOCK | redistribution forbidden | exclude/raw ref only |

| BUILD_PARTIAL | source missing | do not publish as complete |



## 필수 테스트

| Test ID | 테스트 | 통과조건 |

| --- | --- | --- |

| RES-F01 | manifest hashes | verify |

| RES-F02 | rebuild | same rows/hash where deterministic |

| RES-F03 | license filter | blocked data absent |



## 성능/운영

- DuckDB/Parquet for large outputs.

## DONE Gate

- manifest

- known limitations

- model versions

- download checksum

## Codex 주의

- DB current state를 버전 없는 CSV로 덤프하고 dataset이라고 부르지 말 것.

# F-20. Operations / Fleet & Removal Intelligence Engine

## 목적

기업/기관의 private fleet와 ADR 후보를 공개 데이터 코어 위에 안전하게 분석한다.

## 입력 계약

| 입력 | 필수/선택 | 검증 |

| --- | --- | --- |

| tenant fleet | 필수 | auth |

| private/public ephemeris | 계약 | access policy |

| candidate OCM/target | 선택 | tenant-owned |



## 출력 계약

| 출력 | 저장/전달 | 절대 규칙 |

| --- | --- | --- |

| FleetRisk | private API | audit |

| CandidateComparison | private API | new risks |

| RemovalReport | private/export | assumptions |



## 코드 모듈/함수

| 모듈 | 핵심 함수/클래스 | 책임 |

| --- | --- | --- |

| services/ops/fleet.py | fleet_exposure | tenant |

| services/ops/candidate.py | candidate_compare | reuse OCM engine |

| security/tenant.py | row-level enforcement | authorization |



## DB 연계

- tenant_id/access policy 추가; public tables와 private overlay 분리.

## API/UI 연계

- /v1/operations/...

## 실패 상태와 처리

| 상태 | 조건 | 처리 |

| --- | --- | --- |

| FORBIDDEN | wrong tenant | 403 + audit |

| PRIVATE_SOURCE_STALE | customer ephemeris stale | warning |

| COMMAND_ATTEMPT | unsupported | explicit rejection |



## 필수 테스트

| Test ID | 테스트 | 통과조건 |

| --- | --- | --- |

| OPS-F01 | tenant isolation | cross-tenant zero records |

| OPS-F02 | new risk candidate | visible |

| OPS-F03 | audit | access logged |

| OPS-F04 | command endpoint | does not exist/blocked |



## 성능/운영

- private data encryption, retention, SLA.

## DONE Gate

- tenant security tests

- advisory-only statement

- audit trace

## Codex 주의

- 초기 제품에 위성 command 송신 기능을 숨겨서 넣지 말 것.

# 부록 G. Endpoint별 상세 계약

## G-1 GET /v1/objects/{id}

| 항목 | 내용 |

| --- | --- |

| 목적 | 객체 상세 |

| 계약 | canonical identity, object_type, origin profile, current orbit summary, visual primary, source freshness |

| 오류/상태 | 404 UNKNOWN_OBJECT; 200 PARTIAL allowed |

| 강제 규칙 | UI must not calculate altitude from a stale cached unrelated object. |



공통 응답 envelope

| {<br>  "request_id": "...",<br>  "data_status": "OK\|PARTIAL\|STALE\|UNAVAILABLE\|RESEARCH_ONLY",<br>  "data": {},<br>  "provenance": {"source_ids": [], "model_version": "...", "input_hash": "..."},<br>  "warnings": []<br>} |

| --- |



## G-2 GET /v1/objects/{id}/ephemeris

| 항목 | 내용 |

| --- | --- |

| 목적 | 시간범위 ephemeris |

| 계약 | start/stop/step/model selector; response samples + provenance |

| 오류/상태 | 422 range too large; 409 no propagable solution |

| 강제 규칙 | server imposes sample cap; UI requests LOD. |



공통 응답 envelope

| {<br>  "request_id": "...",<br>  "data_status": "OK\|PARTIAL\|STALE\|UNAVAILABLE\|RESEARCH_ONLY",<br>  "data": {},<br>  "provenance": {"source_ids": [], "model_version": "...", "input_hash": "..."},<br>  "warnings": []<br>} |

| --- |



## G-3 GET /v1/conjunctions

| 항목 | 내용 |

| --- | --- |

| 목적 | 근접사건 목록 |

| 계약 | filter by object, time, source_grade, metric threshold |

| 오류/상태 | partial/stale explicit |

| 강제 규칙 | metric_type filter mandatory when threshold used. |



공통 응답 envelope

| {<br>  "request_id": "...",<br>  "data_status": "OK\|PARTIAL\|STALE\|UNAVAILABLE\|RESEARCH_ONLY",<br>  "data": {},<br>  "provenance": {"source_ids": [], "model_version": "...", "input_hash": "..."},<br>  "warnings": []<br>} |

| --- |



## G-4 POST /v1/scenarios

| 항목 | 내용 |

| --- | --- |

| 목적 | 시나리오 생성 |

| 계약 | kind,target,baseline,horizon,metric,parameters,assumptions |

| 오류/상태 | 202 + scenario id |

| 강제 규칙 | does not run compute synchronously. |



공통 응답 envelope

| {<br>  "request_id": "...",<br>  "data_status": "OK\|PARTIAL\|STALE\|UNAVAILABLE\|RESEARCH_ONLY",<br>  "data": {},<br>  "provenance": {"source_ids": [], "model_version": "...", "input_hash": "..."},<br>  "warnings": []<br>} |

| --- |



## G-5 POST /v1/scenarios/{id}/run

| 항목 | 내용 |

| --- | --- |

| 목적 | 계산 실행 |

| 계약 | idempotency key; optional validation policy |

| 오류/상태 | 202 job |

| 강제 규칙 | duplicate same run returns existing id. |



공통 응답 envelope

| {<br>  "request_id": "...",<br>  "data_status": "OK\|PARTIAL\|STALE\|UNAVAILABLE\|RESEARCH_ONLY",<br>  "data": {},<br>  "provenance": {"source_ids": [], "model_version": "...", "input_hash": "..."},<br>  "warnings": []<br>} |

| --- |



## G-6 GET /v1/scenarios/{id}/benefits

| 항목 | 내용 |

| --- | --- |

| 목적 | 수혜 조회 |

| 계약 | beneficiary list, classes, metric values, confidence, provenance |

| 오류/상태 | 409 if not completed |

| 강제 규칙 | pagination/sort by benefit; preserve metric. |



공통 응답 envelope

| {<br>  "request_id": "...",<br>  "data_status": "OK\|PARTIAL\|STALE\|UNAVAILABLE\|RESEARCH_ONLY",<br>  "data": {},<br>  "provenance": {"source_ids": [], "model_version": "...", "input_hash": "..."},<br>  "warnings": []<br>} |

| --- |



## G-7 POST /v1/protect/{id}/candidates

| 항목 | 내용 |

| --- | --- |

| 목적 | 보호대상 역조회 |

| 계약 | candidate policy, intervention kind, horizon |

| 오류/상태 | 202 job |

| 강제 규칙 | candidate generation reason returned. |



공통 응답 envelope

| {<br>  "request_id": "...",<br>  "data_status": "OK\|PARTIAL\|STALE\|UNAVAILABLE\|RESEARCH_ONLY",<br>  "data": {},<br>  "provenance": {"source_ids": [], "model_version": "...", "input_hash": "..."},<br>  "warnings": []<br>} |

| --- |



## G-8 GET /v1/observations/requests

| 항목 | 내용 |

| --- | --- |

| 목적 | 관측 미션 |

| 계약 | station(optional), region, time, measurement type |

| 오류/상태 | 200 empty legitimate |

| 강제 규칙 | priority explanation fields. |



공통 응답 envelope

| {<br>  "request_id": "...",<br>  "data_status": "OK\|PARTIAL\|STALE\|UNAVAILABLE\|RESEARCH_ONLY",<br>  "data": {},<br>  "provenance": {"source_ids": [], "model_version": "...", "input_hash": "..."},<br>  "warnings": []<br>} |

| --- |



## G-9 POST /v1/observations/submissions

| 항목 | 내용 |

| --- | --- |

| 목적 | 관측 제출 |

| 계약 | station, time, measurement, raw artifact reference |

| 오류/상태 | 202 QA_PENDING |

| 강제 규칙 | never immediately alters orbit. |



공통 응답 envelope

| {<br>  "request_id": "...",<br>  "data_status": "OK\|PARTIAL\|STALE\|UNAVAILABLE\|RESEARCH_ONLY",<br>  "data": {},<br>  "provenance": {"source_ids": [], "model_version": "...", "input_hash": "..."},<br>  "warnings": []<br>} |

| --- |



## G-10 GET /v1/research/datasets/{id}/{version}

| 항목 | 내용 |

| --- | --- |

| 목적 | 데이터셋 |

| 계약 | manifest, hashes, downloads, license |

| 오류/상태 | 403 if restricted |

| 강제 규칙 | checksum mandatory. |



공통 응답 envelope

| {<br>  "request_id": "...",<br>  "data_status": "OK\|PARTIAL\|STALE\|UNAVAILABLE\|RESEARCH_ONLY",<br>  "data": {},<br>  "provenance": {"source_ids": [], "model_version": "...", "input_hash": "..."},<br>  "warnings": []<br>} |

| --- |



## G-11 GET /v1/orbital-weather/current

| 항목 | 내용 |

| --- | --- |

| 목적 | 환경요약 |

| 계약 | grades + underlying metrics + coverage |

| 오류/상태 | PARTIAL if source gap |

| 강제 규칙 | research index label. |



공통 응답 envelope

| {<br>  "request_id": "...",<br>  "data_status": "OK\|PARTIAL\|STALE\|UNAVAILABLE\|RESEARCH_ONLY",<br>  "data": {},<br>  "provenance": {"source_ids": [], "model_version": "...", "input_hash": "..."},<br>  "warnings": []<br>} |

| --- |



## G-12 POST /v1/operations/fleets/{id}/maneuver-candidates

| 항목 | 내용 |

| --- | --- |

| 목적 | 기업 기동비교 |

| 계약 | candidate OCMs, external set, metric policy |

| 오류/상태 | 202 private |

| 강제 규칙 | auth + audit + new-risk results. |



공통 응답 envelope

| {<br>  "request_id": "...",<br>  "data_status": "OK\|PARTIAL\|STALE\|UNAVAILABLE\|RESEARCH_ONLY",<br>  "data": {},<br>  "provenance": {"source_ids": [], "model_version": "...", "input_hash": "..."},<br>  "warnings": []<br>} |

| --- |



# 부록 H. 권장 Repository Structure

| aetherus-orbital/<br>  apps/<br>    web/                         # Next.js/Cesium UI<br>  services/<br>    api/                         # FastAPI HTTP layer<br>    worker/                      # async workers<br>  packages/<br>    domain/                      # canonical types, enums, validation<br>    science/<br>      orbit/                     # SGP4, frames, precision ephemerides<br>      conjunction/               # coarse screen, TCA, Pc<br>      risk/                      # risk metrics/graph/provenance<br>      benefit/                   # scenarios, affected graph, attribution<br>      fragmentation/<br>      reentry/<br>      photometry/<br>      observe/<br>    providers/<br>      celestrak/<br>      spacetrack/<br>      tracss/<br>      discos/<br>      satnogs/<br>    contracts/                   # JSON schemas/OpenAPI generated types<br>  migrations/<br>  research/<br>    fixtures/<br>    benchmarks/<br>    notebooks/                   # exploration only; production logic must live in packages/science<br>  tests/<br>    unit/<br>    integration/<br>    golden/<br>    e2e/<br>    performance/<br>  artifacts/evidence/<br>  infra/<br>    docker/<br>    deployment/<br>  docs/ |

| --- |



## H-1 파일 책임 규칙

- UI 컴포넌트에 궤도수학을 숨겨 넣지 않는다.

- Notebook의 검증 코드는 production package로 포팅하고 테스트를 붙이기 전 기능 완료 금지.

- provider별 raw field mapping은 providers 아래, canonical scientific model은 domain/science 아래.

- SQL을 API handler에 직접 산재시키지 않고 repository layer를 둔다.

- 각 science module은 pure-core 함수와 I/O orchestration을 분리한다.

# 부록 I. 공통 오류코드와 UI 행동

| 코드 | 의미 | UI/처리 |

| --- | --- | --- |

| DATA_UNAVAILABLE | 필수 source data 없음 | 회색 “데이터 없음”; 0 표시 금지 |

| DATA_STALE | age threshold 초과 | 마지막 업데이트 강조 |

| INSUFFICIENT_COVARIANCE | Pc 조건 미충족 | Pc 숨기고 miss/screening만 |

| MODEL_UNVALIDATED | 검증게이트 미통과 | RESEARCH_ONLY 배지 |

| SCENARIO_FAILED | worker 계산 실패 | 재시도 + 오류 ID |

| SCENARIO_PARTIAL | 일부 pair 실패 | 결과+경고, 완전한 결과처럼 표시 금지 |

| SOURCE_RATE_LIMITED | provider throttling | cached/stale 사용 |

| SOURCE_LICENSE_RESTRICTED | 재배포 불가 | metadata/link only |

| OBSERVATION_REJECTED | QA 실패 | 이유 제공, orbit 미반영 |

| TENANT_FORBIDDEN | 권한 없음 | 403/감사로그 |

| FRAME_UNSUPPORTED | 좌표계 미지원 | 계산 중단 |

| TIME_SYSTEM_UNSUPPORTED | 시간계 미지원 | 계산 중단 |



# 부록 J. 확장 Test Catalog

| ID | 케이스 | 자동화 | 증거 |

| --- | --- | --- | --- |

| ING-01 | valid parse | 자동화 필수 | pass/fail evidence JSON |

| ING-02 | rate limit | 자동화 필수 | pass/fail evidence JSON |

| ING-03 | partial response | 자동화 필수 | pass/fail evidence JSON |

| ING-04 | raw hash | 자동화 필수 | pass/fail evidence JSON |

| ID-01 | 6digit id | 자동화 필수 | pass/fail evidence JSON |

| ID-02 | alias | 자동화 필수 | pass/fail evidence JSON |

| ID-03 | conflict | 자동화 필수 | pass/fail evidence JSON |

| ID-04 | unknown origin | 자동화 필수 | pass/fail evidence JSON |

| ORB-01 | epoch | 자동화 필수 | pass/fail evidence JSON |

| ORB-02 | forward | 자동화 필수 | pass/fail evidence JSON |

| ORB-03 | frame | 자동화 필수 | pass/fail evidence JSON |

| ORB-04 | invalid | 자동화 필수 | pass/fail evidence JSON |

| ORB-05 | stale | 자동화 필수 | pass/fail evidence JSON |

| CA-01 | coarse recall | 자동화 필수 | pass/fail evidence JSON |

| CA-02 | TCA | 자동화 필수 | pass/fail evidence JSON |

| CA-03 | boundary | 자동화 필수 | pass/fail evidence JSON |

| CA-04 | multi-minima | 자동화 필수 | pass/fail evidence JSON |

| CA-05 | verification | 자동화 필수 | pass/fail evidence JSON |

| PC-01 | valid covariance | 자동화 필수 | pass/fail evidence JSON |

| PC-02 | missing cov | 자동화 필수 | pass/fail evidence JSON |

| PC-03 | method | 자동화 필수 | pass/fail evidence JSON |

| PC-04 | bounds | 자동화 필수 | pass/fail evidence JSON |

| PC-05 | dilution | 자동화 필수 | pass/fail evidence JSON |

| RG-01 | edge build | 자동화 필수 | pass/fail evidence JSON |

| RG-02 | metric split | 자동화 필수 | pass/fail evidence JSON |

| RG-03 | aggregate config | 자동화 필수 | pass/fail evidence JSON |

| BEN-01 | remove direct | 자동화 필수 | pass/fail evidence JSON |

| BEN-02 | no benefit | 자동화 필수 | pass/fail evidence JSON |



| ID | 케이스 | 자동화 | 증거 |

| --- | --- | --- | --- |

| BEN-03 | metric split | 자동화 필수 | pass/fail evidence JSON |

| BEN-04 | version | 자동화 필수 | pass/fail evidence JSON |

| BEN-05 | partial | 자동화 필수 | pass/fail evidence JSON |

| AFF-01 | include incident | 자동화 필수 | pass/fail evidence JSON |

| AFF-02 | swept path | 자동화 필수 | pass/fail evidence JSON |

| AFF-03 | equivalence | 자동화 필수 | pass/fail evidence JSON |

| AFF-04 | rollback | 자동화 필수 | pass/fail evidence JSON |

| PRO-01 | candidate gen | 자동화 필수 | pass/fail evidence JSON |

| PRO-02 | rank | 자동화 필수 | pass/fail evidence JSON |

| PRO-03 | inactive Y | 자동화 필수 | pass/fail evidence JSON |

| PRO-04 | low confidence | 자동화 필수 | pass/fail evidence JSON |

| OCM-01 | same id exclusion | 자동화 필수 | pass/fail evidence JSON |

| OCM-02 | resolved edge | 자동화 필수 | pass/fail evidence JSON |

| OCM-03 | new edge | 자동화 필수 | pass/fail evidence JSON |

| OCM-04 | candidate stale | 자동화 필수 | pass/fail evidence JSON |

| FRG-01 | seed | 자동화 필수 | pass/fail evidence JSON |

| FRG-02 | bins | 자동화 필수 | pass/fail evidence JSON |

| FRG-03 | propagation | 자동화 필수 | pass/fail evidence JSON |

| FRG-04 | remove indirect | 자동화 필수 | pass/fail evidence JSON |

| RE-01 | TIP | 자동화 필수 | pass/fail evidence JSON |

| RE-02 | watch only | 자동화 필수 | pass/fail evidence JSON |

| RE-03 | update history | 자동화 필수 | pass/fail evidence JSON |

| ROT-01 | period | 자동화 필수 | pass/fail evidence JSON |

| ROT-02 | alias | 자동화 필수 | pass/fail evidence JSON |

| ROT-03 | too few | 자동화 필수 | pass/fail evidence JSON |

| ROT-04 | confidence | 자동화 필수 | pass/fail evidence JSON |

| OBS-01 | pass | 자동화 필수 | pass/fail evidence JSON |

| OBS-02 | illumination | 자동화 필수 | pass/fail evidence JSON |



| ID | 케이스 | 자동화 | 증거 |

| --- | --- | --- | --- |

| OBS-03 | mount limit | 자동화 필수 | pass/fail evidence JSON |

| OBS-04 | info gain | 자동화 필수 | pass/fail evidence JSON |

| OBS-05 | weather optional | 자동화 필수 | pass/fail evidence JSON |

| CIT-01 | duplicate | 자동화 필수 | pass/fail evidence JSON |

| CIT-02 | clock | 자동화 필수 | pass/fail evidence JSON |

| CIT-03 | outlier | 자동화 필수 | pass/fail evidence JSON |

| CIT-04 | accepted hook | 자동화 필수 | pass/fail evidence JSON |

| CIT-05 | license | 자동화 필수 | pass/fail evidence JSON |

| GEN-01 | parent | 자동화 필수 | pass/fail evidence JSON |

| GEN-02 | event | 자동화 필수 | pass/fail evidence JSON |

| GEN-03 | unknown | 자동화 필수 | pass/fail evidence JSON |

| GEN-04 | multinational | 자동화 필수 | pass/fail evidence JSON |

| VIS-01 | actual | 자동화 필수 | pass/fail evidence JSON |

| VIS-02 | launch fallback | 자동화 필수 | pass/fail evidence JSON |

| VIS-03 | broken | 자동화 필수 | pass/fail evidence JSON |

| VIS-04 | license | 자동화 필수 | pass/fail evidence JSON |

| ENV-01 | shell | 자동화 필수 | pass/fail evidence JSON |

| ENV-02 | coverage | 자동화 필수 | pass/fail evidence JSON |

| ENV-03 | grade | 자동화 필수 | pass/fail evidence JSON |

| ENV-04 | source gap | 자동화 필수 | pass/fail evidence JSON |

| RES-01 | manifest | 자동화 필수 | pass/fail evidence JSON |

| RES-02 | hash | 자동화 필수 | pass/fail evidence JSON |

| RES-03 | rebuild | 자동화 필수 | pass/fail evidence JSON |

| RES-04 | license | 자동화 필수 | pass/fail evidence JSON |

| OPS-01 | tenant | 자동화 필수 | pass/fail evidence JSON |

| OPS-02 | candidate | 자동화 필수 | pass/fail evidence JSON |

| OPS-03 | audit | 자동화 필수 | pass/fail evidence JSON |

| OPS-04 | no command | 자동화 필수 | pass/fail evidence JSON |



# 부록 K. Codex 작업지시 카드

## P1 Ingestion

Scope: Implement only provider adapters + raw storage + canonical object/orbit normalization. Do not touch risk UI.

Evidence: raw artifact, DB rows, 6-digit ID test, rate-limit test.

| TASK: P1 Ingestion<br>1. Read relevant Master Spec sections and schemas.<br>2. List files to change before changing them.<br>3. Implement real code, migrations and tests.<br>4. Run all tests for this phase plus regression suite.<br>5. Generate artifacts/evidence/<phase>.json.<br>6. Do not claim DONE if any required scientific function is placeholder.<br>7. Report blockers instead of fabricating data. |

| --- |



## P2 Orbit

Scope: Implement SGP4/time/frame core and ephemeris API. Cross-validate trusted fixtures.

Evidence: golden numeric tests and source age/provenance API.

| TASK: P2 Orbit<br>1. Read relevant Master Spec sections and schemas.<br>2. List files to change before changing them.<br>3. Implement real code, migrations and tests.<br>4. Run all tests for this phase plus regression suite.<br>5. Generate artifacts/evidence/<phase>.json.<br>6. Do not claim DONE if any required scientific function is placeholder.<br>7. Report blockers instead of fabricating data. |

| --- |



## P4 CA

Scope: Implement conservative screening, TCA, risk provenance; Pc only with covariance.

Evidence: verification corpus metrics and no-fake-Pc test.

| TASK: P4 CA<br>1. Read relevant Master Spec sections and schemas.<br>2. List files to change before changing them.<br>3. Implement real code, migrations and tests.<br>4. Run all tests for this phase plus regression suite.<br>5. Generate artifacts/evidence/<phase>.json.<br>6. Do not claim DONE if any required scientific function is placeholder.<br>7. Report blockers instead of fabricating data. |

| --- |



## P5 Benefit

Scope: Implement baseline/counterfactual, REMOVE, affected graph, direct beneficiary attribution.

Evidence: full-vs-affected equivalence and persisted benefit rows.

| TASK: P5 Benefit<br>1. Read relevant Master Spec sections and schemas.<br>2. List files to change before changing them.<br>3. Implement real code, migrations and tests.<br>4. Run all tests for this phase plus regression suite.<br>5. Generate artifacts/evidence/<phase>.json.<br>6. Do not claim DONE if any required scientific function is placeholder.<br>7. Report blockers instead of fabricating data. |

| --- |



## P6 PROTECT/OCM

Scope: Implement reverse query and candidate OCM comparison with new risks.

Evidence: synthetic new-risk scenario + API.

| TASK: P6 PROTECT/OCM<br>1. Read relevant Master Spec sections and schemas.<br>2. List files to change before changing them.<br>3. Implement real code, migrations and tests.<br>4. Run all tests for this phase plus regression suite.<br>5. Generate artifacts/evidence/<phase>.json.<br>6. Do not claim DONE if any required scientific function is placeholder.<br>7. Report blockers instead of fabricating data. |

| --- |



## P9 Citizen Science

Scope: Implement station/request/submission/QA; no orbit updates from rejected data.

Evidence: QA audit and accepted-only hook.

| TASK: P9 Citizen Science<br>1. Read relevant Master Spec sections and schemas.<br>2. List files to change before changing them.<br>3. Implement real code, migrations and tests.<br>4. Run all tests for this phase plus regression suite.<br>5. Generate artifacts/evidence/<phase>.json.<br>6. Do not claim DONE if any required scientific function is placeholder.<br>7. Report blockers instead of fabricating data. |

| --- |



# 부록 L. 2026 외부표준/운영 메모

- CelesTrak은 GP query에서 CATNR/INTDES/GROUP/NAME 등을 지원하며 OMM XML/KVN, JSON, CSV를 제공한다. 2026년에는 6자리 catalog가 사용되므로 TLE 전용 구현은 신규 객체를 놓칠 수 있다.

- Space-Track는 현재 GP, 과거 GP_HISTORY, SATCAT, TIP 등의 API 사용 빈도 가이드를 제공하므로 서버 캐시와 batch query가 필수다.

- CCSDS ODM은 OPM/OMM/OEM/OCM을 정의하며 기관/사업자간 궤도정보 교환, conjunction 연구와 협력 기동 등에 사용된다.

- KIPO 2026 심사기준상 소프트웨어 발명은 구체적 정보처리가 하드웨어를 통해 실현되는 표현과 실시가능성/뒷받침이 중요하므로 개발문서의 구체적 처리흐름은 특허 실시예 검증에도 재사용할 수 있다.
