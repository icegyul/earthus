# AETHERUS V2 — CLAUDE CODE BOOTSTRAP PROMPT

작업명: **AETHERUS V2 — FULL SYSTEM IMPLEMENTATION / EXISTING REPOSITORY CONTINUATION**

이 작업은 단순 UI 구현이 아니다. Aetherus V2 전체를 `SPACE + CONTROL + ORBIT + Intelligence + LLM`으로 통합 구현한다.

## SOURCE OF TRUTH

1. `docs/00_START_HERE_CLAUDE_CODE.md
- docs/18_INTELLIGENCE_CONNECTION_MATRIX.md
- docs/19_FINAL_BUILD_LIST_AND_CHATGPT_LOCAL_PLAN.md`
2. `docs/01_AETHERUS_V2_MASTER_PRODUCT_SYSTEM_SPEC.md`
3. `AETHERUS_V2_ENGINE_REGISTRY.yaml`
4. `AETHERUS_V2_PHASE_PLAN.yaml`
5. 현재 Phase와 관련된 domain/intelligence/LLM 문서
6. `AETHERUS_V2_ACCEPTANCE_MATRIX.csv`

기존 repository 코드가 문서와 충돌하면 **코드를 즉시 덮어쓰지 말고** 차이를 Audit하고 source-of-truth / legacy reuse / migration 필요성을 보고한다.

## 절대 금지

- `git reset --hard`, `git clean`, `git restore .`, 무단 stash, working tree 초기화 금지.
- fake data, fake metric, placeholder scientific function, constant-return engine 금지.
- UI가 보인다는 이유로 DONE 선언 금지.
- covariance 없이 Pc 생성 금지. TLE/GP-only 결과를 validated risk로 승격 금지.
- LLM이 궤도/TCA/Pc/re-entry/Benefit/PROTECT/Confidence 값을 직접 생성 금지.
- Simulation/Counterfactual을 reality/official data로 표시 금지.
- 실제 spacecraft command/자동 기동승인/법적 제거판단 구현 금지.

## 첫 작업 — P0 Audit

코드를 수정하기 전에 다음을 수행한다.

1. project root, branch, HEAD, remotes, working tree를 기록한다.
2. 기존 docs/source/materials를 인덱싱한다.
3. repository의 기존 모듈을 E01~E44, L01~L08, S01~S12에 mapping한다.
4. 각 모듈을 `REUSE / MIGRATE / NEW / RETIRE / BLOCKED`로 판정한다.
5. 다음 산출물을 만든다.
   - `artifacts/audit/REPOSITORY_BASELINE.md`
   - `artifacts/audit/GIT_STATE.json`
   - `artifacts/audit/ENGINE_IMPLEMENTATION_MATRIX.csv`
   - `artifacts/audit/LEGACY_REUSE_MAP.md`
   - `artifacts/audit/MISSING_INPUTS.md`
   - `artifacts/audit/PHASE_READINESS.md`
6. 기존 uncommitted 변경이 있으면 절대 지우지 말고 continuation source로 취급한다.
7. Audit이 끝나면 P1에서 실제 구현을 시작한다.

## 구현 원칙

- 각 Phase는 vertical slice로 닫는다: `input → compute → storage → API → UI → test → evidence`.
- Engine은 자기 책임만 수행하고 Intelligence가 상위 orchestration을 한다.
- Intelligence는 LLM 없이 동작해야 한다.
- 모든 scientific output은 provenance/input hash/model/config/version을 가진다.
- 모든 비동기 run은 상태와 error JSON을 저장한다.
- Global render subset과 science calculation subset을 분리한다.
- Mission은 발사 종료 후 payload/stage를 ORBIT object로 handover한다.
- SPACE/CONTROL/ORBIT mode 전환은 Persistent Universe State와 Universal Time을 가능한 한 유지한다.

## Phase 완료 보고 형식

- PHASE / MODULE IDS
- CHANGED FILES
- COMMANDS RUN
- TEST RESULTS
- DB EVIDENCE
- API EVIDENCE
- UI/E2E EVIDENCE
- BENCHMARKS
- EVIDENCE MANIFEST PATH
- KNOWN LIMITATIONS
- BLOCKERS
- ACCEPTANCE VERDICT
- NEXT UNBLOCKED PHASE

확인하지 못한 것은 PASS로 쓰지 않는다. `UNVERIFIED` 또는 `BLOCKED`를 사용한다.
