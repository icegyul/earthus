# EARTHUS 2.0 handoff index

## Package tree

```text
docs/earthus-v2/
├── README.md
├── INDEX.md
├── CODEX_HANDOFF_PROMPT.md
├── MISSING_INPUTS.md
├── SOURCE_PROVENANCE.csv
├── SHA256SUMS
├── MASTER_SPEC/
├── ENGINE/
├── ALGORITHM/
├── ARCHITECTURE_PRODUCTION/
├── ADMIN_RBAC/
├── SNS_SEO_GEO/
├── AUDIT/
├── VISUAL_STRATEGY/
├── UI_UX/
└── FOUNDATION_PACKAGE/
    ├── DOCUMENTATION/
    └── EVIDENCE/
```

## Root handoff files

| File | Purpose |
|---|---|
| `README.md` | 읽기 순서, source-of-truth 우선순위, 상태 라벨, 안전 규칙. |
| `INDEX.md` | 패키지 구조와 파일별 용도. |
| `CODEX_HANDOFF_PROMPT.md` | Codex에 전달할 첫 READ-ONLY 조사 프롬프트. |
| `MISSING_INPUTS.md` | 언급됐지만 실제 원본을 찾지 못한 입력. |
| `SOURCE_PROVENANCE.csv` | 각 파일의 패키지 경로, 원본 경로·ZIP entry, 분류, 역할. |
| `SHA256SUMS` | 패키지 파일의 현재 SHA-256. 복사 무결성·후속 변경 감지용. |

## MASTER_SPEC

| File | Purpose and caution |
|---|---|
| `EARTHUS_2.0_FINAL_MASTER_DEVELOPMENT_DIRECTIVE_v3.2_PAID_UX_GLOBAL_3D_CLOUD_HYBRID_NAS_ARCHIVE.docx` | 최종 마스터 개발지침서 원본. 제품 의도 정본이지만 구현·운영 증거는 아니다. |
| `PACKAGE_CODEX_APPLY_DIRECTIVE_v0.2_SUPERSEDED_FOR_PHASE0.md` | v0.2 패키지의 원래 적용 지시. 이번 Phase 0에서는 `CODEX_HANDOFF_PROMPT.md`에 의해 행동 지시가 대체되며 읽기 자료로만 사용한다. |

## ENGINE

| File | Purpose and caution |
|---|---|
| `ENGINE_CATALOG_v0.2.md` | 124개 엔진·컴포넌트 후보, 우선순위, maturity, wave, 다음 모듈 위치. `IMPLEMENTED_FOUNDATION`은 패키지 내부 기반 상태다. |
| `NEW_EARTHUS_3D_WEATHER_ENGINE_DESIGN_2026-08-25.md` | 별도 URL의 Three.js r184 PBR/3D cloud/weather engine 설계와 truth·time·성능 규칙. |
| `NEW_EARTHUS_3D_WEATHER_ENGINE_IMPLEMENTATION_PLAN_2026-08-25.md` | 위 설계의 구현 순서와 예상 파일·테스트. 아직 실행 승인이 아니다. |

## ALGORITHM

| File | Purpose and caution |
|---|---|
| `ALGORITHM_CATALOG_v0.2.md` | 53개 알고리즘·계약의 식, 입출력, guardrail, 모듈 후보. 외부 데이터·보정·운영 연결은 별도 관문이다. |

## ARCHITECTURE_PRODUCTION

| File | Purpose and caution |
|---|---|
| `PRODUCTION_ARCHITECTURE_CORRECTION_v0.2.md` | foundation ZIP에서 추출한 운영 아키텍처 보정 문서. |
| `EARTHUS_2.0_ENGINE_FOUNDATION_v0.2_PRODUCTION_ARCHITECTURE_CORRECTION.docx` | 같은 보정안의 Word 원본. |
| `HANDOVER_CURRENT_2026-08-22.md` | 현재 구조·운영 라벨·인수 직후 체크리스트의 날짜별 handover 스냅샷. 경로 이동·후속 변경은 현재 저장소에서 재확인한다. |
| `HANDOVER_LONG_FORM.md` | EARTHUS 누적 운영 원칙, 배포법, 사고 기록, 기능별 이력. |
| `EARTHUS_V8_CURRENT_EXECUTION_README.md` | 현재 v8 실행 정본과 제품 경계, KEEP/MERGE/REWORK/NEW 분류. |
| `EARTHUS_V8_PRODUCTION_RELEASE_2026-08-21.md` | v8 정적 운영 배포 및 예보 접근 경계 증거. 날짜가 있는 스냅샷이다. |
| `AWS_PRODUCTION_INVENTORY.md` | AWS production inventory의 read-only 스냅샷과 미확인 관문. |
| `SUPABASE_PRODUCTION_INVENTORY.md` | Supabase production inventory의 read-only 스냅샷과 미확인 관문. |

## ADMIN_RBAC

| File | Purpose and caution |
|---|---|
| `ADMIN_RUNBOOK.md` | 역할·승인·source registry·quarantine·flag·판매·감사 로그 운영 계약. 완성된 통합 Control Plane의 증거가 아니다. |
| `FREE-ACCESS-POLICY-2026-08-14.md` | 무료 운영, 판매 차단, 안전 정보 무료, 향후 entitlement gate의 날짜별 정책·운영 기록. |

## SNS_SEO_GEO

| File | Purpose and caution |
|---|---|
| `MARKETING-STUDIO-SPEC.md` | 마케팅 스튜디오와 사람 최종 확인 기반 게시 계약. 자동 SNS 게시를 허용하지 않는다. |
| `seo-ai-search-plan.md` | 정적 콘텐츠, JSON-LD, crawler policy, `llms.txt` 등 SEO·AI 검색 계획. 계획 문서이며 현재 구현 증거가 아니다. |

## AUDIT

| File | Purpose and caution |
|---|---|
| `EARTHUS_1.0_CURRENT_SYSTEM_AUDIT.md` | 1.0 저장소·provider·AWS·Supabase·렌더러의 2026-08-25 read-only 감사 본문. |
| `EARTHUS_1.0_PROVIDER_DATA_MATRIX.csv` | provider별 endpoint, 자료, 저장, UI 연결, 증거·상태 매트릭스. |
| `EARTHUS_1.0_ROUTE_JOB_DB_MATRIX.csv` | route, job, DB 선언·연결 매트릭스. |
| `EARTHUS_1.0_2.0_REUSE_GAP_MATRIX.csv` | 1.0 자산의 2.0 재사용·보강·교체 후보와 gap. |
| `EARTHUS_1.0_RUNTIME_EVIDENCE.json` | 당시 read-only 런타임 증거 구조. 현재 freshness를 보장하지 않는다. |
| `EARTHUS_1.0_AUDIT_PACKAGE.zip` | 위 다섯 감사 산출물의 원본 ZIP. |

## VISUAL_STRATEGY

| File | Purpose and caution |
|---|---|
| `EARTHUS_3D_VISUAL_DATA_STRATEGY_INTEGRATION_v1.0.md` | 3D Earth, Data Relief, Flow, Field, Volume 등 시각 데이터 전략. |
| `EARTHUS_3D_VISUAL_DATA_STRATEGY_INTEGRATION_v1.0.docx` | 같은 전략의 Word 원본. |
| `EARTHUS_55_LAYER_INTEGRATION_MATRIX_REVISED_v1.0.csv` | 55-layer 기준 통합 매트릭스. 현재 감사에서 확인된 정의 수와 다를 수 있어 재대조가 필요하다. |
| `EARTHUS_3D_VISUAL_DATA_STRATEGY_INTEGRATION_PACKAGE_v1.0.zip` | 전략 문서·매트릭스·reference image의 원본 ZIP. |
| `references/REF_APPROVED_DIRECTION_Base_Earth.png` | Base Earth 방향 참고 이미지. |
| `references/REF_APPROVED_DIRECTION_Weather_Ocean.png` | Weather/Ocean 방향 참고 이미지. |
| `references/REF_APPROVED_TONE_Visual_Style_Overview.png` | 승인 tone 참고 이미지. |
| `references/REF_STRUCTURE_ONLY_Country_Data_Palette_Redesign_Required.png` | 구조만 참고하며 palette redesign이 필요한 이미지. |
| `references/FUTURE_VISION_Deep_Geology_Not_Current_Target.png` | 현재 구현 목표가 아닌 미래 비전 이미지. |
| `references/README.txt` | reference image 상태 라벨 설명. |

## UI_UX

| File | Purpose and caution |
|---|---|
| `EARTHUS_2.0_APPROVED_FIRST_PAGE_DESIGN.png` | 사용자가 승인한 모바일 첫 화면 시각 기준. 실제 Cesium/Three.js, API 값, 로딩, 라우팅의 구현 근거로 사용하지 않는다. |

## FOUNDATION_PACKAGE

| File | Purpose and caution |
|---|---|
| `EARTHUS_2.0_ENGINE_FOUNDATION_v0.2_PRODUCTION_ARCHITECTURE_CORRECTION.zip` | 125-entry v0.2 원본 패키지. 문서·proposal code·tests·fixtures·manifest를 포함한다. 자동 추출·적용 금지. |
| `EARTHUS_2.0_ENGINE_FOUNDATION_v0.2_PRODUCTION_ARCHITECTURE_CORRECTION.patch` | 저장소 적용 후보 패치 원본. Phase 0에서는 `git apply --check`도 재실행하지 않고 보관만 한다. |
| `ARCHIVE_CONTENTS.txt` | ZIP entry 목록. |

### FOUNDATION_PACKAGE/DOCUMENTATION

| File | Purpose |
|---|---|
| `PACKAGE_FILE_MAP.md` | 패키지 파일 배치와 역할. |
| `SOURCE_BASIS.md` | 패키지 설계의 source basis와 증거 한계. |
| `PRODUCTION_ARCHITECTURE_CORRECTION.md` | 운영 아키텍처 보정안. 상위 폴더에도 편의 복사본이 있다. |
| `REUSE_DECISION_MATRIX.md`, `REUSE_DECISION_MATRIX.csv` | 기존 자산 재사용 판단 초안. 실제 저장소 인벤토리로 재검증한다. |
| `IMPLEMENTATION_WAVES_v0.2.md`, `IMPLEMENTATION_WAVES.v0.2.json` | wave별 제안 순서와 기계 판독본. |
| `TEST_ACCEPTANCE_MATRIX.md` | 패키지가 제안하는 테스트·acceptance gate. |
| `MIGRATION_FROM_v0.1.md` | v0.1에서 v0.2로의 문서상 차이. |
| `NEW_IDEAS_vNEXT.md` | vNEXT 후보. 현재 요구사항으로 자동 승격하지 않는다. |
| `ENGINE_CATALOG_v0.2.md`, `ENGINE_CATALOG_v0.2.csv`, `engine-catalog.v02.json` | ZIP 내부의 엔진 catalog 원본과 표·JSON 변형. 상위 `ENGINE/`에 편의 복사본이 있다. |
| `ALGORITHM_CATALOG_v0.2.md`, `ALGORITHM_CATALOG_v0.2.csv`, `algorithm-catalog.v02.json` | ZIP 내부의 알고리즘 catalog 원본과 표·JSON 변형. 상위 `ALGORITHM/`에 편의 복사본이 있다. |
| `CODEX_APPLY_DIRECTIVE.md` | ZIP 내부 원래 적용 지시. 현재 첫 작업 행동 지시로 사용하지 않는다. |

### FOUNDATION_PACKAGE/EVIDENCE

| File | Purpose and caution |
|---|---|
| `README.md` | 패키지 자체 설명과 한계. |
| `CHANGELOG.md` | v0.2 패키지 변경 요약. |
| `SHA256SUMS` | ZIP 내부 entry 무결성 기준. |
| `PACKAGE_MANIFEST.json` | 패키지 파일 manifest. |
| `TEST_RESULTS.txt` | 패키지 작성 시 순수 테스트 결과. 현재 저장소 통합 테스트가 아니다. |
| `PACKAGE_VALIDATION_RESULTS.txt` | 패키지 작성 시 manifest/validation 결과. 운영 증거가 아니다. |
