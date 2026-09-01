# LEGACY_REUSE_MAP — 레거시 자산 재사용 지도

- 작성일: 2026-09-01
- 성격: READ-ONLY 감사 (어떤 자산도 수정하지 않았음)
- 범위: `D:\## APP\EARTHUS v2_APP` 하위 레거시 클러스터 7종
- 분류 기준
  - **IMPORT_CANDIDATE**: 새 정본 라인에 코드/스펙/데이터로 가져올 후보. 단, 게이트 재검증 전제.
  - **REFERENCE_ONLY**: 열람·비교·역사 기록용. 코드 복사 금지, 설계 참조만.
  - **REJECT**: 빌드 부산물·빈 잔재. 재사용 가치 없음.
- 전제가 되는 상위 결정: `Aetherus_Orbital_Environment_Codex_Package_v1.2\IMPLEMENTATION_ORDER.md`(v1.2.1 반영본)가 재시작 기준선을 **`PRODUCT BASELINE: NOT ACCEPTED`**로 선언 → 823 리포의 과거 증거·구현은 새 정본 리포에서 **재현되기 전까지 역사 기록** 취급. 이 문서의 분류는 모두 이 전제 아래에서 읽어야 한다.

---

## 요약표

| # | 클러스터 | 위치 | 분류 | 한 줄 사유 |
|---|---|---|---|---|
| 1a | 823 통합 브랜치 — backend P0~P5 모듈 | `Aetherus 823_Orbital\aetherus-orbital-environment` @ `codex/aetherus-v2-v06-integration` | IMPORT_CANDIDATE (선별) | 게이트 통과 이력이 있는 궤도역학·수집 코드. 단 게이트 재현 필수 |
| 1b | 823 통합 브랜치 — contracts/·config/ | 〃 | IMPORT_CANDIDATE | 선언적 스키마 19종·정책 YAML 9종, 코드 아닌 계약이라 이식 위험 최소 |
| 1c | 823 통합 브랜치 — packages/·services/·frontend/ (v0.6 제품 런타임) | 〃 | REFERENCE_ONLY | NOT ACCEPTED 기준선에 묶인 제품 런타임. 이중 마이그레이션 체인의 원인 |
| 1d | 823 통합 브랜치 — artifacts/ (증거·감사) | 〃 | REFERENCE_ONLY | 증거는 이식 대상이 아니라 재현 대상 |
| 2 | 823 main 브랜치 (P0/P1 수준) | 〃 @ `main` | REFERENCE_ONLY | 통합 브랜치의 진부분집합. 가장 깨끗한 P0 골격이라는 참고 가치만 |
| 3 | 1.0 AETHERUS 큐레이션 모듈 41종 | `prototype\js\space\` | REFERENCE_ONLY (소수 IMPORT_CANDIDATE) | 프런트 전용 정책·계약·큐레이션이지 과학 엔진이 아님. cosmic3d 등 씬 모듈만 이식 후보 |
| 4 | 채택된 Three.js 지구 | `prototype\v2-three\` | IMPORT_CANDIDATE (사실상 현행 정본) | PD가 채택·earthus.net/v2 라이브. 레거시가 아니라 도착점 |
| 5 | aetherus 서비스 잔재 | `services\aetherus-orbital\` | REJECT | 소스 전부 삭제됨. 캐시·.pyc 67개만 남은 껍데기 |
| 6 | v0.6 모바일 빌드 zip | `AETHERUS_V2\` | REFERENCE_ONLY | 25MB 빌드 스냅샷(2026-08-30). 사진관 비전 3·4 누락 갭 보유 |
| 7a | 제로스타트 소스팩 | `v2.5.3\` | IMPORT_CANDIDATE (정본 입력) | 그린필드 팩 10종 + SHA256 + 마스터 지시서 — 새 라인의 공식 입력 |
| 7b | Codex 궤도 계약 패키지 | `Aetherus_Orbital_Environment_Codex_Package_v1.2\` | IMPORT_CANDIDATE (스펙으로) | v1.2.1 보정 반영된 P0~P12 구현 계약 정본 |
| 7c | 복구 폴더 | `Aetherus 823_Orbital\recovery\` | REJECT | 하위 폴더 1개가 완전히 빈 디렉터리 |
| 7d | ABYSSAL 클론 | `reference\abyssal\` | 조건부 IMPORT_CANDIDATE | MIT 외부 프로젝트, 주입 설계 완료·vite 빌드 실패 미해결 — 빌드 성공 전까지 REFERENCE_ONLY |
| 7e | 세션 산출물 | `output\` | REFERENCE_ONLY | 감사·배포 차단 보고서·지형 시각 검증 산출물. 기록물 |

---

## 1. 823 리포 통합 브랜치 `codex/aetherus-v2-v06-integration`

경로: `D:\## APP\EARTHUS v2_APP\Aetherus 823_Orbital\aetherus-orbital-environment` (현재 체크아웃은 `main`, 통합 브랜치는 54커밋 / main은 7커밋. 브랜치: `codex/p1-ingestion-identity` ~ `codex/p5-benefit-engine`, `codex/aetherus-v2-v06-integration`)

### 최상위 구조 (`git ls-tree -r --name-only` 기준, 파일 수)

| 디렉터리 | 파일 수 | 내용 |
|---|---|---|
| `tests/` | 105 | unit 32 · integration 33 · product 11 · foundation 8 · e2e 4 · acceptance 3 · contract 3 등 |
| `artifacts/` | 101 | audit 15 · evidence 84 · raw(celestrak_gp) 2 |
| `backend/` | 57 | ingestion(celestrak/spacetrack provider, omm, ratelimit, redaction) · orbit(propagator, frames, time_scale, golden) · conjunction(screen, tca, pc, cdm) · benefit · explore · domain/object_identity · tools(증거·검증 생성기) |
| `packages/` | 49 | `aetherus_foundation`(time_engine, frames, identity, provenance, snapshots) · `aetherus_intelligence`(confidence, correlation, signal_gate, revision) · `aetherus_product`(postgres_storage, operations) · domain/control/llm/orbit/platform/providers/space/visual/integration 런타임 |
| `scripts/` | 22 | 운영 스크립트 |
| `contracts/` | 19 | `contracts/schemas/*.schema.json` 19종 (CanonicalObject, StateVector, Evidence, ProvenanceBundle, IntelligencePacket, UncertaintyAssessment 등) |
| `docs/` | 18 | 문서 |
| `services/` | 15 | `services/api`(integrated, platform_routes, registry_routes, security) · `services/web`(v0.6 이중언어 웹: app.js, visual-engine.js, earth-texture.js, i18n.js, sw.js, earth_albedo.png) |
| `frontend/` | 13 | css/js/vendor + index.html |
| `config/` | 9 | 정책 YAML·CSV: ENGINE_REGISTRY, PHASE_PLAN, ACCEPTANCE_MATRIX, INTELLIGENCE_CONNECTION_MATRIX, degraded_mode_policy, event_correlation_policy, performance_budgets, simulation_ledger_policy, source_grade_registry |
| `migrations/` | 8 | 체인 A (아래) |
| `db/` | 4 | 체인 B + `db/schema.sql` |
| 루트 | — | docker-compose 4종(기본/staging/p1/p3), Dockerfile, Makefile, pytest.ini, pyproject.toml, VERIFICATION.md |

### ⚠️ 마이그레이션 체인이 2개 병존

| 체인 | 파일 | 용도 |
|---|---|---|
| **체인 A** `migrations/` | `001_initial_schema` → `002_orbit_solution_raw_artifact_versioning` → `003_ingestion_policy_identity_and_rejections` → `004_p2_orbit_time_frames` → `005_p4_conjunction_assessment` → `006_p4_pc_encounter_plane_v2` → `007_p5_benefit_engine` → `008_v06_product_schema` | P0→P5 페이즈 진행 체인 + v0.6 제품 스키마(008) |
| **체인 B** `db/migrations/` | `0001_core_contract` → `0002_foundation_truth_core` → `0003_integrated_product_runtime` (+ `db/schema.sql`) | packages/* 통합 제품 런타임용 별도 체인 |

한 리포에 서로 다른 번호 체계의 체인이 공존한다. 어느 쪽도 그대로 수입하면 안 되고, 새 정본 리포에서 **단일 체인으로 재설계**해야 한다. 체인 A는 페이즈 게이트와 1:1 대응이라 스키마 참조 가치가 높고, 체인 B는 v0.6 런타임 결합의 산물이라 참조 가치가 낮다.

### P0~P12 증거 파일 현황 (`artifacts/evidence/`)

- **P0~P5**: 게이트별 개별 JSON 존재 — `P0.json` `P1.json` `P2.json` `P3.json` `P4.json` `P5.json`. p3/p4/p5 하위에 스크린샷·HAR·네트워크 로그·검증 JSON 동반 (예: `p4/validation-ca001.json`, `p5/equivalence-ben003.json`).
- **P6~P12**: 개별 게이트 JSON **없음**. `p6_p12/` 통합 폴더만 존재 — `phase_status.json`, `staging_deployment.json`, `staging_browser_e2e.json`, 데스크톱/모바일 스크린샷 등. 즉 P6 이후는 묶음 증거이며, IMPLEMENTATION_ORDER.md의 "P6~P12를 부분 코드 존재만으로 시작 금지" 경고와 정확히 부합한다.
- 그 외: `desktop_v06/`·`mobile_v06/` 이중언어 10모드 스크린샷, `full_product/` 로컬 클로즈아웃 증거, `staging_visual/`, `artifacts/audit/` 감사 보고 15종(v0.4~v0.6 핸드오프, E01~E44·L01~L08·S01~S12 매트릭스 CSV 포함).

### 분류

| 대상 | 분류 | 사유 |
|---|---|---|
| `backend/` P0~P5 모듈 (ingestion·orbit·conjunction·benefit·explore·domain) + 대응 `tests/` | **IMPORT_CANDIDATE (선별)** | 실제 게이트를 통과했던 궤도역학·수집·근접평가 코드와 골든 픽스처. 단, NOT ACCEPTED 기준선이므로 "복사 후 통과 처리"가 아니라 **새 리포에서 게이트 P0부터 재현하며 모듈 단위로 흡수** |
| `contracts/schemas/` 19종, `config/` 정책 9종 | **IMPORT_CANDIDATE** | 선언적 자산(JSON Schema·YAML·CSV)이라 런타임 결합 없음. 새 라인의 계약 초안으로 즉시 유용 |
| `migrations/` 체인 A | **IMPORT_CANDIDATE (스키마 참조)** | 단일 체인 재설계의 입력. 파일 그대로 적용은 금지 |
| `db/migrations/` 체인 B | REFERENCE_ONLY | v0.6 런타임 결합 산물, 이중 체인 문제의 원인 측 |
| `packages/` 12종·`services/api`·`services/web`·`frontend/` | **REFERENCE_ONLY** | v0.6 제품 런타임 전체. 최근 커밋들이 "고정 장식 화면이 상호작용을 가리던 문제", "staging 이미지·배포 식별자 불일치" 수정 이력 — 기준선 불수용의 직접 대상 |
| `artifacts/` 전체 | **REFERENCE_ONLY** | 증거·감사는 이식이 아니라 재현 대상. 새 리포에서 같은 증거가 재생산되기 전까지 역사 기록 |

---

## 2. 823 리포 `main` 브랜치 (P0/P1 수준)

- 커밋 7개: P0 골격(스켈레톤·마이그레이션·CI·증거 생성기) → P0 증거 실검증 전환 → P1 provider·identity 설계 확정까지.
- 내용: `backend/` 16파일(ingestion만), `migrations/001~002`, `tests/` 16파일, `artifacts/evidence/P0.json` + celestrak raw 1건.
- **분류: REFERENCE_ONLY** — 통합 브랜치의 진부분집합이라 별도 이식 가치는 없음. 다만 "가장 결합이 적은 P0 시작점이 어떤 모습이었는가"를 보여주는 참조로서, 새 리포 P0 재시작 시 구조 비교용으로 유용.

---

## 3. 1.0 AETHERUS 큐레이션 모듈 — `prototype\js\space\` (41종)

전체 목록: `aetherus-dashboard.js`, `ai-evidence.js`, `api-contract.js`, `astrometry-feature-extractor.js`, `astrometry.js`, `astronomy.js`, `citizen-science.js`, `community-safety.js`, `contracts.js`, `cosmic3d.js`, `cosmiczoom.js`, `culture-reference.js`, `database-contract.js`, `decision-fusion.js`, `discovery-contract.js`, `galaxycards.js`, `infrastructure-contract.js`, `kepler.js`, `korea-stargazing-preflight.js`, `launch-payload-contract.js`, `media-rendition-policy.js`, `mission-control.js`, `mission-replay.js`, `observation-media.js`, `observation-planner.js`, `observation-session.js`, `personal-universe.js`, `photo-catalog.js`, `platform-operating-contract.js`, `plugin-sandbox.js`, `regional-warning-adapter.js`, `release-qa-contract.js`, `remote-observatory.js`, `route-state.js`, `satellite-object-contract.js`, `security-privacy-contract.js`, `sky-ar.js`, `skyframe.js`, `skyphotos.js`, `solarscene.js`, `spotlight-contract.js`

**성격 확인**: 이 모듈들은 **프런트엔드 전용 정책·계약·큐레이션 레이어이지 과학 엔진이 아니다.** 근거 표본 —
- `decision-fusion.js` 헤더: "grounded fusion shadow contract … It cannot call a model, infer a missing claim" — 스키마 동결·검증만 하는 섀도 계약.
- `kepler.js` 헤더: JPL 근사 케플러 요소를 옮긴 것으로 "근사식이다. 항해·관측 조준·우주비행에 쓰지 말 것"을 자체 명시.
- `cosmic3d.js` 헤더: 교육용 도식임을 명시("우리 은하의 외부 모습…은 관측 사진이 아니라 교육용 도식").
- 파일명 자체가 `-contract.js` 12종 + 정책(`media-rendition-policy`, `plugin-sandbox`, `security-privacy-contract`) 위주.

**분류**:
- 씬·시각화 소수 — `cosmic3d.js`(v2 우주 씬 재사용이 이미 NEXT_STEPS에 계획됨), `kepler.js`, `solarscene.js`, `astronomy.js`, `galaxycards.js`: **IMPORT_CANDIDATE (후순위)**. Three.js 동적 로드·rAF 정지 등 성능 규율이 v2 원칙과 호환.
- 나머지 계약·정책·큐레이션 모듈 대부분: **REFERENCE_ONLY** — AETHERUS 실백엔드(클러스터 1)가 정본이 되면 프런트 섀도 계약은 실계약(contracts/schemas)으로 대체되어야 함. UX 정책 문구·검증 규칙의 참조 가치는 있음.

---

## 4. 채택된 Three.js 지구 — `prototype\v2-three\`

- 구성: `index.html`, `js/`(`main.js` 렌더러, `ui-shell.js` 화면문법 셸, `intel-feed.js`, `sim-ocean.js`, `local-terrain.js`), `assets/brand`, `NEXT_STEPS.md`(1.0 메뉴→v2 이식 매핑, 위성 구름 소스 현황, ABYSSAL 통합 계획 포함).
- 상태: PD가 명시 채택한 정본 런타임(v5.3 지시서는 Cesium 기준이지만 사용자 지시가 우선), **earthus.net/v2로 라이브 배포됨** (배포 번들: `prototype\v2-deploy\`, 스크립트: `tools\deploy-v2-three.sh`).
- **분류: IMPORT_CANDIDATE — 사실상 분류 불요.** 레거시가 아니라 레거시 자산들이 이식되어 들어오는 **도착점(현행 정본)**. 이 지도의 다른 클러스터 IMPORT_CANDIDATE는 대부분 여기(프런트) 또는 새 정본 백엔드 리포로 흘러든다.

---

## 5. aetherus 서비스 잔재 — `services\aetherus-orbital\`

- `services\aetherus-orbital` 은 존재하지만 **소스가 전부 삭제된 껍데기**다.
- 남은 것 총 67파일: `.mypy_cache\`, `.pytest_cache\`, `.ruff_cache\`, 그리고 `src\aetherus_orbital\**\__pycache__\*.pyc`, `migrations\versions\__pycache__\*.pyc`, `scripts\__pycache__\*.pyc` — 전부 캐시·바이트코드.
- `.py`·`.sql`·`.md`·`.toml`·`.yaml` 소스 파일 **0개** 확인.
- 디렉터리 구조(.pyc 경로)로 미루어 과거 P0 ingestion FastAPI 서비스(alembic `0001_p0_ingestion_foundation`)였으며, 그 정본은 클러스터 1의 823 리포에 있다.
- **분류: REJECT** — 재사용 가치 없음. (.pyc 역컴파일로 복원 시도 금지 — 정본이 git에 살아 있음.) 삭제는 이 감사 범위 밖이며 별도 결정 사항.

---

## 6. v0.6 모바일 zip — `AETHERUS_V2\`

- 내용물 단일: `AETHERUS_V2_MOBILE_BILINGUAL_PREMIUM_v0.6_2026-08-30.zip` (25MB).
- 성격: AETHERUS 패키지 3종 중 "① 앱 빌드 스냅샷". 알려진 갭: 사진관 비전 3·4 누락.
- 클러스터 1c(`services/web` v0.6 런타임)·1d(`desktop_v06/`·`mobile_v06/` 증거)와 같은 계보.
- **분류: REFERENCE_ONLY** — NOT ACCEPTED 기준선 하의 빌드 산출물. 새 구현의 시각 회귀 비교·이중언어 10모드 기준 화면 대조용으로만 사용.

---

## 7. 빠른 분류 (quick ls)

### 7a. `v2.5.3\` — IMPORT_CANDIDATE (정본 입력)
`EARTHUS_V2_ZERO_START_ALL_SOURCE_PACKS_v1.0\` 하위에 그린필드 팩 10종 zip(`00_ZERO_START_MASTER` ~ `09_ALL_SOURCE_FOUNDATION`; 엔진 255·알고리즘 198·백엔드 데이터플레인·프로바이더 어댑터·3D 행성 렌더·인텔리전스 LLM·인프라·프런트엔드) + `EARTHUS_V2_SOURCE_PACKS_SHA256.txt` + `CLAUDE_CODE_START.txt` + `README_FIRST.md`. 상위에 마스터 지시서 docx(v5.3 KO)와 시크릿·API키 위치 가이드. **새 라인의 공식 입력 패키지** — 레거시가 아니라 정본.

### 7b. `Aetherus_Orbital_Environment_Codex_Package_v1.2\` (저장소 루트 사본) — IMPORT_CANDIDATE (스펙으로)
`START_HERE_CODEX.md`, `IMPLEMENTATION_ORDER.md`, `MASTER_DEVELOPMENT_SPEC.md`, `ALGORITHM_SPEC.md`, `DATA_CONTRACTS.md`, `PHASE_TASK_CARDS.md`, `QUALITY_GATES.md`, `acceptance_matrix.csv`, `openapi.yaml`, `schema.sql`, `schemas\`, `validation\`, `PATENT_SOURCE_MAP.md`, `KIPO_FILING_NOTE.md` 등. v1.2.1 보정(IMPLEMENTATION_ORDER + MANIFEST)이 반영된 상태이며 `Aetherus 823_Orbital\Aetherus_Orbital_Environment_Codex_Package_v1.2\` 사본과 해시 동일. **코드가 아니라 P0~P12 구현 계약 정본**으로 수입. 클러스터 1의 재현 게이트가 이 문서를 따른다.

### 7c. `Aetherus 823_Orbital\recovery\` — REJECT
하위 `snapn-cross-project-2026-08-24\` 가 **완전히 빈 디렉터리**(파일 0개, 2026-08-24 생성). 복구할 내용물 자체가 없음.

### 7d. `reference\abyssal\` — 조건부 IMPORT_CANDIDATE
Token-Gremlin의 `natural-disasters`(ABYSSAL — 절차적 시네마틱 해양·극한기상 시뮬레이션, Three.js/WebGL2/GLSL3) MIT 클론. `window.__app.weather.set()` 파라미터 주입 설계는 완료됐으나 **vite 8/rolldown 빌드 실패 미해결**. 빌드 성공 시 dist를 `v2-three/abyssal/`로 서빙해 same-origin iframe 통합 계획. 빌드가 풀리기 전까지는 REFERENCE_ONLY로 취급하고, 소스 트리를 v2 코드베이스에 직접 병합하지 말 것(외부 업스트림 유지 + MIT 고지 필요).

### 7e. `output\` — REFERENCE_ONLY
`pdf\`, `v2-device-deploy-blockers-20260828\`, `v2-entry-target-correction-20260828\`, `v2-mountain-terrain-visual\`, `v2-trench-mesh-visual\`, `v2-underwater-terrain-visual\` — 과거 세션의 보고서·배포 차단 분석·지형 시각 검증 산출물. 기록물로 보존, 코드 이식 대상 아님.

---

## 이식 흐름 요약

```
[정본 입력]  v2.5.3 소스팩(7a) + Codex 계약 패키지(7b, v1.2.1)
     │
     ▼
[새 정본 백엔드 리포]  ← IMPORT: 823 통합 브랜치의 contracts/·config/(1b),
     │                    backend P0~P5 + tests(1a, 게이트 재현 조건),
     │                    migrations 체인 A(스키마 참조, 단일 체인 재설계)
     │                 ← REFERENCE: 823 main(2), packages/·v0.6 런타임(1c),
     │                    증거 artifacts/(1d), v0.6 zip(6)
     ▼
[현행 프런트 정본]  prototype/v2-three(4, earthus.net/v2 라이브)
                   ← IMPORT(후순위): cosmic3d 등 1.0 우주 씬 모듈(3 일부)
                   ← 조건부 IMPORT: ABYSSAL(7d, 빌드 해결 시)
                   ← REFERENCE: 1.0 계약·정책 모듈 대부분(3)

REJECT: services/aetherus-orbital 캐시 껍데기(5), recovery 빈 폴더(7c)
```
