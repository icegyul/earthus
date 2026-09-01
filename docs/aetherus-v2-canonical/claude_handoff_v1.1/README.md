# AETHERUS V2 — CLAUDE CODE MASTER HANDOFF PACKAGE


이 패키지는 Aetherus V2를 **SPACE + CONTROL + ORBIT + Intelligence + LLM**으로 전면 재구축하기 위한 Claude Code용 통합 개발지시서다.

- human/source-of-truth: `docs/*.md`
- machine registry: `AETHERUS_V2_ENGINE_REGISTRY.yaml`
- phase plan: `AETHERUS_V2_PHASE_PLAN.yaml`
- acceptance: `AETHERUS_V2_ACCEPTANCE_MATRIX.csv`
- source attachments: `source_materials/`
- UI references: `ui_references/`

먼저 `docs/00_START_HERE_CLAUDE_CODE.md`를 읽는다.

## 규모

- Core Engine / Intelligence: E01~E44
- LLM modules: L01~L08
- Platform services: S01~S12
- Implementation phases: P0~P15
- Acceptance tests: engine registry에서 자동 생성된 287개의 초기 acceptance case + domain E2E/benchmark/security 확장

## 중요

이 패키지는 상세성을 위해 단일 200페이지 문서를 억지로 하나의 context에 넣지 않고, **하나의 정본을 모듈형 Markdown으로 분리**했다. `AETHERUS_V2_FULL_COMBINED_DIRECTIVE.md`는 인간 검토/검색용 합본이며, Claude Code 실행 시에는 START_HERE가 지시하는 관련 문서만 phase별로 읽어 context 낭비를 피한다.

## v1.1 Intelligence Boundary Update

- `docs/18_INTELLIGENCE_CONNECTION_MATRIX.md`: Engine↔Intelligence 연결 권한 정본
- `AETHERUS_V2_INTELLIGENCE_CONNECTION_MATRIX.csv`: E01~E44 machine-readable matrix
- `docs/19_FINAL_BUILD_LIST_AND_CHATGPT_LOCAL_PLAN.md`: 최종 제작 리스트와 이 환경에서의 구현/검증 경계
- 모든 E01~E44 registry entry에 `intelligence_connection` contract 추가
- Visual/Subscription/LLM이 scientific result를 변경하지 못하도록 boundary acceptance 추가
