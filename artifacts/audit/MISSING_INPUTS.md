# MISSING_INPUTS — AETHERUS V2 통합 착수 전 입력물 감사

- 감사일: 2026-09-01
- 성격: READ-ONLY 감사 (어떤 파일도 수정하지 않음)
- 대상:
  - Claude 핸드오프 패키지: `C:/Users/Dalur/AppData/Local/Temp/claude/D-----APP-EARTHUS-v2-APP/4e677f2f-9394-4e4c-a82c-b75c1b8c8802/scratchpad/handoff/aetherus_v2_claude_package`
  - Orbital Codex 패키지 v1.2(매니페스트 v1.2.1): `D:/## APP/EARTHUS v2_APP/Aetherus 823_Orbital/Aetherus_Orbital_Environment_Codex_Package_v1.2`
  - 823 저장소 브랜치: `codex/aetherus-v2-v06-integration` @ `D:/## APP/EARTHUS v2_APP/Aetherus 823_Orbital/aetherus-orbital-environment`

---

## 1. 기계가독 계약(machine-readable contracts) 인벤토리

### 1.1 Claude 핸드오프 패키지 무결성 — SHA256 재검증 통과

`SHA256SUMS.txt`에 등재된 **35개 파일 전부를 `sha256sum -c`로 재계산 — 35/35 OK, 불일치 0건.**
(문서 20종 + 계약 6종 + 소스 자료 docx 3종 + UI 레퍼런스 2종 + 기타)

패키지 내 계약 파일 존재 확인:

| 파일 | 상태 |
|---|---|
| `AETHERUS_V2_PHASE_PLAN.yaml` | 존재, sha 일치 |
| `AETHERUS_V2_ENGINE_REGISTRY.yaml` | 존재, sha 일치 |
| `AETHERUS_V2_ACCEPTANCE_MATRIX.csv` | 존재, sha 일치 |
| `AETHERUS_V2_INTELLIGENCE_CONNECTION_MATRIX.csv` | 존재, sha 일치 |
| `AETHERUS_V2_DEPENDENCY_GRAPH.mmd` | 존재, sha 일치 |
| `PACKAGE_METRICS.json` | 존재, sha 일치 (E44/L08/S12/307 acceptance cases) |
| `SOURCE_TRACEABILITY.csv` | 존재, sha 일치 |

### 1.2 Orbital Codex 패키지 v1.2 (MANIFEST v1.2.1)

| 파일 | 상태 |
|---|---|
| `schema.sql` | 존재 (9,186B) |
| `openapi.yaml` | 존재 (3,121B) |
| `schemas/*.json` | 4/4 존재 (`space_object`, `intervention_scenario`, `benefit_result`, `observation_submission`) |
| `acceptance_matrix.csv` | 존재 (2,909B) |
| `MANIFEST.json` | 존재, `package_version: 1.2.1`, `release_type: corrective` |
| `validation/*` | 6/6 존재 (v1.2 실증 2종, v1.3 정량Benefit 2종, v1.4 TraCSS CDM Pc 2종) |
| `env.example` | 존재 (276B) |

**IMPLEMENTATION_ORDER.md 검증**: 실측 sha256 `3f5a3096b97106f871f877160671d52b58141180af660001cdf191c0a687c5af` (24,583B) = MANIFEST.json 기재값과 **정확히 일치**. v1.2.1 corrective 릴리스(START_HERE/README/PACKAGE_INDEX가 요구하던 누락 파일 보충)가 정상 반영됨.

### 1.3 통합 브랜치 `codex/aetherus-v2-v06-integration` 트리 확인

`git ls-tree` 조회 결과 `contracts/`, `config/`, `openapi/` 모두 존재:

- `contracts/schemas/` — JSON Schema **19종** (Evidence, Signal, Event, Revision, DigitalState, StateVector, Scenario, IntelligencePacket, CanonicalObject, ProvenanceBundle, ConfidenceAssessment, UncertaintyAssessment 등)
- `config/` — `AETHERUS_V2_{PHASE_PLAN, ENGINE_REGISTRY, ACCEPTANCE_MATRIX, INTELLIGENCE_CONNECTION_MATRIX}` 4종 + 정책 yaml 5종(degraded_mode, event_correlation, performance_budgets, simulation_ledger, source_grade_registry)
- `openapi/aetherus-v2.openapi.yaml` — 존재

### 1.4 "기계가독 계약 13종" 대조 (docs/19_FINAL_BUILD_LIST 기준)

| # | 계약 | 확인 위치 | 판정 |
|---|---|---|---|
| 1 | `AETHERUS_V2_ENGINE_REGISTRY.yaml` | 패키지 + 브랜치 `config/` | **확인** |
| 2 | `AETHERUS_V2_INTELLIGENCE_CONNECTION_MATRIX.csv` | 패키지 + 브랜치 `config/` | **확인** |
| 3 | `AETHERUS_V2_PHASE_PLAN.yaml` | 패키지 + 브랜치 `config/` | **확인** |
| 4 | `AETHERUS_V2_ACCEPTANCE_MATRIX.csv` | 패키지 + 브랜치 `config/` | **확인** |
| 5 | `openapi/aetherus-v2.openapi.yaml` | 브랜치 `openapi/` | **확인** |
| 6 | `schemas/*.json` (Evidence/Signal/Event/Revision/State/Scenario/IntelligencePacket) | 브랜치 `contracts/schemas/` 19종에 전부 포함 | **확인** |
| 7 | `db/schema.sql` + migration plan | 브랜치 `db/schema.sql` + `db/migrations/0001~0003` | **확인** |
| 8 | `capabilities/subscription_capabilities.yaml` | 브랜치 | **확인** |
| 9 | `events/event_catalog.yaml` | 브랜치 | **확인** |
| 10 | `visual/visual_semantics.yaml` | 브랜치 | **확인** |
| 11 | `providers/provider_registry.yaml` | 브랜치 (+ `runtime_endpoints.yaml`) | **확인** |
| 12 | `models/model_registry.yaml` | 브랜치 | **확인** |
| 13 | `security/claim_policy.yaml` | 브랜치 | **확인** |

**결론: 13/13 전부 존재 확인. 계약 파일 누락 없음.** 단, 5~13번은 통합 브랜치에만 존재하며 Claude 핸드오프 패키지 zip 자체에는 1~4번만 들어 있다(패키지 문서가 "create/finalize" 대상으로 명시한 것과 부합).

---

## 2. 자격증명·프로바이더 (MISSING — 사용자 입력 필요)

### 2.1 요구 환경변수 목록

**823 저장소 working tree `.env.example`** (구버전, 자격증명 변수 없음):
`DATABASE_URL`, `REDIS_URL`, `ENVIRONMENT`, `LOG_LEVEL`, `CORS_ORIGINS`, `DEFAULT_DATA_AGE_WARNING_HOURS`, `MAX_CATALOG_ID_DIGITS`(=10)

**통합 브랜치 `.env.example`** (git show 조회, 상기 + 추가):
- 자격증명: `SPACETRACK_IDENTITY`(빈값), `SPACETRACK_PASSWORD`(빈값), `INTERNAL_ADMIN_TOKEN`(빈값)
- v0.6 런타임: `AETHERUS_ENV=local`, `AETHERUS_TRUSTED_AUTH_ADAPTER=0`, `AETHERUS_PRODUCT_DB`, `AETHERUS_RAW_ROOT`, `AETHERUS_PRODUCTION_SECRETS_CONFIGURED=0`, `AETHERUS_LIVE_PROVIDER_VERIFIED=0`, `AETHERUS_BACKUP_VERIFIED=0`, `AETHERUS_TESTS_PASS=0`
- `MAX_CATALOG_ID_DIGITS`=9 (working tree의 10과 불일치 — 정합 필요)

**Codex 패키지 `env.example`**:
`DATABASE_URL`, `REDIS_URL`, `OBJECT_STORE_ENDPOINT`(minio), `OBJECT_STORE_BUCKET`, `SPACE_TRACK_USERNAME`(빈값), `SPACE_TRACK_PASSWORD`(빈값), `TRACSS_API_KEY`(빈값), `DISCOS_TOKEN`(빈값)

### 2.2 결핍·불일치 사항

- **Space-Track 자격증명 부재**: 모든 예시 파일에서 빈값. 계정 발급은 사용자 본인 수행 필요. P1 credentialed adapter와 live acceptance가 이것에 의존.
- **변수명 불일치**: 브랜치는 `SPACETRACK_IDENTITY/PASSWORD`, Codex 패키지는 `SPACE_TRACK_USERNAME/PASSWORD` — 통합 시 한쪽으로 표준화 필요.
- **TRACSS_API_KEY / DISCOS_TOKEN** 미확보 (Codex 패키지 요구; TraCSS 검증셋 자체는 `validation/`에 오프라인 포함되어 P5 검증은 가능).
- **CelesTrak은 자격증명 불필요** (무로그인 공개 GP/OMM) — P1 ingestion(ING-001)은 credential 없이 착수 가능.

---

## 3. 실행 환경 갭

| 항목 | 실측 | 판정 |
|---|---|---|
| Docker | **미설치** (`docker: command not found`, exit 127; `docker compose`도 불가) | **BLOCKED — ORB-P0 인프라(Postgres/PostGIS + Redis + compose 스택) 기동 불가.** Docker Desktop(또는 대체 컨테이너 런타임) 설치 전까지 P0 인프라 수용기준 실행 불가 |
| Python | 3.14.7 (`python`, `py` 동일) | 존재하나 **버전 불일치 위험** (하단 참조) |
| Node | v24.18.0 | 충족 |

**Python 버전 불일치 위험**: 통합 브랜치 `pyproject.toml`은 `requires-python = ">=3.11"`, ruff/black/mypy 전부 **py311 타깃**. 그러나 `requirements.txt`가 `numpy==1.26.3`, `scipy==1.12.0`으로 고정되어 있는데 이 버전들은 Python ≤3.12용 휠만 제공 — **로컬 Python 3.14.7에서는 `pip install -r requirements.txt`가 실패하거나 소스 빌드로 전락할 가능성이 높음.** Python 3.11(또는 3.12) 가상환경을 별도 준비하거나 핀 버전 상향이 필요. (Docker가 있었다면 컨테이너로 흡수될 문제이나 §3의 Docker 부재로 로컬 venv 경로가 유일한 우회로임.)

---

## 4. 라이선스·이용 제약 (패키지 명시 사항)

Orbital v1.2 `MASTER_DEVELOPMENT_SPEC.md`(§2 프로바이더 표, §30 보안·라이선스·데이터거버넌스) 기준:

- **CelesTrak GP/OMM**: 무로그인 공개. 기본 **2시간 이상 캐시** 준수, 2026년 6자리 catalog 대응 때문에 **TLE-only 금지**(OMM XML/JSON/CSV 우선).
- **Space-Track**: 계정 필요. **공식 throttling 준수**, GP 폴링 1h 미만 금지, 429 시 즉시 중단·분산 재시도. provider terms/rate limit을 adapter policy로 코드화할 것.
- **TraCSS**: 셋별로 공개/계정 상이. **소스 등급(source grade) 구분 필수**, 공개 specification example을 **live event로 표시 금지**. v1.4 검증셋은 `validation/`에 포함.
- **SatNOGS**: **CC BY-SA 라이선스 표기 의무** — 시민 관측·무선 데이터 사용 시 attribution + share-alike 전파 고려 필요.
- 공통 거버넌스: 미디어 자산은 `asset_type + source_org + license` 필수, 외부 이미지 캐시는 라이선스 허용 시만, 사용자 관측 원자료는 제출 시 license 동의·공개범위 고정, research dataset은 license manifest 필수.
- Claude 패키지의 acceptance에도 라이선스가 게이트로 존재: `E03-T04 license policy propagation`, `E30-T05 license missing` (현재 NOT_RUN).
- Claude 패키지 `FULL_COMBINED_DIRECTIVE`는 provider/API/**라이선스/FTO** 확인을 **[VALIDATE]**(확정 전) 항목으로 명시 — 재배포 권한 확인은 이 환경에서 최종 PASS 선언 불가 항목으로 분류됨.

---

## 5. 종합 판정

| 영역 | 상태 |
|---|---|
| 기계가독 계약 13종 | **13/13 존재 확인** (누락 없음) |
| 패키지 무결성 | SHA256 35/35 통과, MANIFEST v1.2.1 sha 일치 |
| Space-Track 자격증명 | **MISSING** (사용자 발급 필요) |
| TRACSS_API_KEY / DISCOS_TOKEN | **MISSING** (오프라인 검증셋으로 부분 대체 가능) |
| Docker | **MISSING → ORB-P0 BLOCKED** |
| Python 3.11/3.12 환경 | **MISSING** (3.14.7만 존재, numpy/scipy 핀과 충돌 위험) |
| Node | 충족 (v24.18.0) |
| 라이선스 확정(CC BY-SA 표기, TraCSS 등급, 재배포 권한) | 코드 게이트는 존재하나 **런타임 검증 NOT_RUN** |
