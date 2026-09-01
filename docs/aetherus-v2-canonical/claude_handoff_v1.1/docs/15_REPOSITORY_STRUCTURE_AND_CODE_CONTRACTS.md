# AETHERUS V2 — REPOSITORY STRUCTURE & CODE CONTRACTS


## 문서의 출처와 권위

이 패키지는 다음 세 첨부 문서를 우선 기반으로 재구성한다.

1. `Aetherus_Orbital_Environment_개발지침서_v1.1_초상세본.docx` — 기존 Orbital Environment/SSA/STM/Debris 엔진, DB/API/테스트/Hard Gate의 1차 source.
2. `Aetherus_우주물체_개입효과_특허명세서_마스터_v2.0.docx` — Baseline/Counterfactual Risk Graph, Beneficiary Attribution, PROTECT, Affected Subgraph, Risk Provenance, Candidate OCM, validation gate의 권리/기술 source.
3. `EARTHUS_AETHERUS_INTELLIGENCE_CONCEPT_MASTER_v1.0_KO.docx` — Engine/AI/Intelligence/LLM 계층 분리, Evidence/Event/Revision/Confidence/Uncertainty/Counterfactual/Attribution의 source.

이 문서에서 **[SOURCE-DERIVED]**는 위 자료의 구조를 유지·통합한 항목이고, **[V2-NEW]**는 사용자가 이번 대화에서 확정한 Aetherus V2 범위(태양계, 발사관제, 우주쓰레기, 멀티스케일 UX, 구독, LLM)와 이를 구현하기 위한 신규 설계다. **[VALIDATE]**는 실제 provider/API/라이선스/FTO/운영환경 확인 후 확정해야 한다.

기존 문서의 `Codex` 표기는 레거시 실행대상이다. **Aetherus V2의 기본 구현·인수인계 대상은 Claude Code**이며, 기존 Codex 지시는 동일한 안전원칙을 유지하되 Claude Code 실행 계약으로 대체한다.


## 절대 원칙 — Claude Code가 임의 변경하면 안 되는 것

1. **Aetherus V2는 하나의 우주, 세 모드다.** `SPACE`, `CONTROL`, `ORBIT`은 서로 다른 사이트가 아니라 동일한 Persistent Universe State를 공유하는 관찰 모드다.
2. **Engine → Intelligence → LLM 계층을 뒤집지 않는다.** 물리/수학 계산은 Engine, 패턴 탐지는 AI Signal, 종합 판단은 Intelligence, 자연어 설명/명령 인터페이스는 LLM이다.
3. **LLM은 과학 계산값을 만들어내지 않는다.** 궤도, TCA, Pc, re-entry time, telemetry, Benefit, PROTECT 순위, Confidence를 임의 생성하지 않는다.
4. **현실과 가상은 저장부터 분리한다.** `OBSERVED`, `DERIVED`, `MODEL_SIGNAL`, `AI_SIGNAL`, `OFFICIAL`, `SIMULATION_ONLY`, `COUNTERFACTUAL`, `ATTRIBUTION_RESULT`를 혼합하지 않는다.
5. **TLE/GP-only 결과는 기본적으로 screening grade다.** covariance가 없으면 Pc를 생성하지 않는다. 값이 없으면 `UNAVAILABLE/INSUFFICIENT_DATA`가 정상 결과다.
6. **3D가 Digital Twin을 의미하지 않는다.** 현실 상태를 계산 가능한 Digital State로 만들고 Snapshot/Version/Time/Provenance로 재현 가능해야 한다.
7. **화면이 보인다고 DONE이 아니다.** 실데이터/fixture → 계산 → DB → API → UI → 테스트 → Evidence Manifest가 닫혀야 한다.
8. **운영 command 기능 금지.** 초기 V2는 advisory/research/visual control system이며 실제 spacecraft command, 자동 회피기동 승인, 제거 명령, 법적 판단을 수행하지 않는다.
9. **기존 working tree를 보존한다.** 사용자의 명시적 승인 없이 `git reset --hard`, `git clean`, `git restore .`, 대규모 덮어쓰기, 임의 stash를 하지 않는다.
10. **특허 핵심을 약화시키지 않는다.** Beneficiary Attribution, PROTECT, Affected Subgraph, Baseline/Counterfactual Risk Graph, Risk Provenance는 독립 축으로 유지한다.
11. **안전/공공정보를 결제벽으로 숨기지 않는다.** Free/paid 차이는 정보 깊이, 기록, 개인화, 시뮬레이션, API, 워크플로우에서 만든다.
12. **대량 UI 렌더 subset과 과학 계산 subset을 분리한다.** 프레임 성능을 위해 숨긴 객체가 과학 계산에서 자동 제외되면 실패다.

## 권장 구조

```text
aetherus-v2/
  apps/
    web/                         # React/Next/Vite는 기존 repo 기술선택 audit 후 결정
  services/
    api/
    worker/
    intelligence/
    llm-gateway/
  packages/
    domain/
    contracts/
    providers/
    science/
      space/
      mission/
      orbit/
      risk/
      benefit/
      fragmentation/
      reentry/
      photometry/
      observation/
    intelligence/
      orchestration/
      fusion/
      signal/
      event/
      revision/
      confidence/
      decision/
    visual/
      scene/
      camera/
      orbital-shell/
      semantics/
    subscription/
    workspace/
  migrations/
  research/
  fixtures/
  benchmarks/
  tests/
    unit/
    integration/
    golden/
    e2e/
    performance/
    security/
  artifacts/
    audit/
    evidence/
  infra/
    docker/
    deployment/
  docs/
```

**주의:** 실제 repository가 이미 존재하면 이 구조로 강제 migration하지 않는다. 기존 구조를 audit하고 책임 경계만 만족시키도록 최소 변경한다.

## 코드 규칙

- UI에 궤도/과학 계산 숨기지 않음.
- provider raw mapping은 provider layer; canonical type은 domain.
- notebook prototype는 production package + test로 port되기 전 DONE 아님.
- DB access는 repository/service layer로 캡슐화.
- pure-core와 I/O orchestration 분리.
- model/config version은 code constant가 아니라 registry/config manifest로 추적.
- feature/capability는 중앙 service.
- async scientific run은 idempotency key.
- import cycle 방지: domain/contracts ← science/services ← API/UI 방향.

## Engine interface 예

```python
class EngineResult(BaseModel):
    engine_id: str
    engine_version: str
    input_hash: str
    status: str
    generated_at: datetime
    data: dict
    provenance: dict
    warnings: list[str] = []

class Engine(Protocol):
    id: str
    version: str
    def validate(self, input): ...
    async def run(self, input, context) -> EngineResult: ...
```

Intelligence Engine은 domain engine 결과를 직접 mutate하지 않고 reference/hash로 소비한다.
