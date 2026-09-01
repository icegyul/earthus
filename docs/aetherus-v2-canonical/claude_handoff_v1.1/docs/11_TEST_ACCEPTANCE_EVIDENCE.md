# AETHERUS V2 — TEST / ACCEPTANCE / EVIDENCE MASTER


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

## Test pyramid

- Unit: parser, transforms, pure science, classification, reducers.
- Property: ID length, time monotonicity, probability bounds, serialization, append-only invariants.
- Golden: official/spec fixture, static public snapshot, known astronomy/mission cases where available.
- Integration: source→raw→canonical→engine→DB→API.
- Intelligence: signal→event→revision→confidence/uncertainty→why.
- E2E: browser interaction→async job→result→3D/UI.
- Benchmark: 10k/30k/100k synthetic/real mix for orbit/affected/render where appropriate.
- Chaos: source outage, worker failure, stale data, provider rate limit, LLM provider failure.
- Security: tenant isolation, secret log scan, capability, audit.

## Evidence Manifest schema

```json
{
  "phase": "Pxx",
  "engine_ids": ["E.."],
  "commit": "git-sha",
  "input": [],
  "tests": [{"cmd":"...","passed":true}],
  "database_assertions": [],
  "api_assertions": [],
  "ui_assertions": [],
  "benchmarks": {},
  "validation_state": "...",
  "limitations": [],
  "artifacts": []
}
```

## 판정 상태

- `NOT_STARTED`
- `DESIGN_READY`
- `IMPLEMENTING`
- `BLOCKED`
- `TESTING`
- `ACCEPTED_LOCAL`
- `ACCEPTED_STAGING`
- `ACCEPTED_PRODUCTION`

`DONE`이라는 단어만 단독 사용하지 않는다. 어느 환경에서 어떤 evidence로 accepted인지 기록한다.

## 공통 Acceptance

1. fake number 0건.
2. placeholder scientific function 0건.
3. source/epoch/model/version/hash 추적 가능.
4. unavailable/stale/partial UI 정상 표시.
5. archived/model/counterfactual 시각 구분.
6. same input deterministic where required.
7. API schema + auth/capability.
8. browser E2E에서 UI가 실제 API를 사용.
9. regression suite 통과.
10. evidence manifest 생성.

| Test ID | Engine | Domain | Case | Automation | Gate |
| --- | --- | --- | --- | --- | --- |
| E01-T01 | E01 | FOUNDATION | duplicate raw hash dedupe | AUTOMATED | REQUIRED |
| E01-T02 | E01 | FOUNDATION | 429/backoff policy | AUTOMATED | REQUIRED |
| E01-T03 | E01 | FOUNDATION | partial parse quarantine | AUTOMATED | REQUIRED |
| E01-T04 | E01 | FOUNDATION | secret redaction | AUTOMATED | REQUIRED |
| E01-T05 | E01 | FOUNDATION | source outage stale behavior | AUTOMATED | REQUIRED |
| E02-T01 | E02 | FOUNDATION | 6+ digit catalog ID | AUTOMATED | REQUIRED |
| E02-T02 | E02 | FOUNDATION | same catalog renamed alias | AUTOMATED | REQUIRED |
| E02-T03 | E02 | FOUNDATION | COSPAR conflict quarantine | AUTOMATED | REQUIRED |
| E02-T04 | E02 | FOUNDATION | unknown origin not inferred | AUTOMATED | REQUIRED |
| E02-T05 | E02 | FOUNDATION | mission-created object handover | AUTOMATED | REQUIRED |
| E03-T01 | E03 | FOUNDATION | missing source rejects intelligence promotion | AUTOMATED | REQUIRED |
| E03-T02 | E03 | FOUNDATION | hash chain reproducibility | AUTOMATED | REQUIRED |
| E03-T03 | E03 | FOUNDATION | source-grade separation | AUTOMATED | REQUIRED |
| E03-T04 | E03 | FOUNDATION | license policy propagation | AUTOMATED | REQUIRED |
| E04-T01 | E04 | FOUNDATION | naive datetime rejection | AUTOMATED | REQUIRED |
| E04-T02 | E04 | FOUNDATION | UTC/local roundtrip | AUTOMATED | REQUIRED |
| E04-T03 | E04 | FOUNDATION | replay deterministic cursor | AUTOMATED | REQUIRED |
| E04-T04 | E04 | FOUNDATION | future model vs archived state separation | AUTOMATED | REQUIRED |
| E05-T01 | E05 | FOUNDATION | frame roundtrip tolerance | AUTOMATED | REQUIRED |
| E05-T02 | E05 | FOUNDATION | unsupported frame fail | AUTOMATED | REQUIRED |
| E05-T03 | E05 | FOUNDATION | EOP stale downgrade | AUTOMATED | REQUIRED |
| E05-T04 | E05 | FOUNDATION | solar/earth frame consistency fixture | AUTOMATED | REQUIRED |
| E06-T01 | E06 | FOUNDATION | append-only state | AUTOMATED | REQUIRED |
| E06-T02 | E06 | FOUNDATION | same input deterministic hash | AUTOMATED | REQUIRED |
| E06-T03 | E06 | FOUNDATION | archived vs reconstructed label | AUTOMATED | REQUIRED |
| E06-T04 | E06 | FOUNDATION | baseline snapshot immutability | AUTOMATED | REQUIRED |
| E07-T01 | E07 | FOUNDATION | typed relation source required | AUTOMATED | REQUIRED |
| E07-T02 | E07 | FOUNDATION | mission-to-object lineage | AUTOMATED | REQUIRED |
| E07-T03 | E07 | FOUNDATION | time-consistent traversal | AUTOMATED | REQUIRED |
| E07-T04 | E07 | FOUNDATION | unknown relation uncertainty | AUTOMATED | REQUIRED |
| E08-T01 | E08 | SPACE | known epoch cross-check | AUTOMATED | REQUIRED |
| E08-T02 | E08 | SPACE | past/future deterministic | AUTOMATED | REQUIRED |
| E08-T03 | E08 | SPACE | provider/kernel version captured | AUTOMATED | REQUIRED |
| E08-T04 | E08 | SPACE | observer/frame explicit | AUTOMATED | REQUIRED |
| E09-T01 | E09 | SPACE | known event fixture | AUTOMATED | REQUIRED |
| E09-T02 | E09 | SPACE | rule version stored | AUTOMATED | REQUIRED |
| E09-T03 | E09 | SPACE | boundary time zone | AUTOMATED | REQUIRED |
| E09-T04 | E09 | SPACE | official vs derived separation | AUTOMATED | REQUIRED |
| E10-T01 | E10 | SPACE | source timestamp preserved | AUTOMATED | REQUIRED |
| E10-T02 | E10 | SPACE | observed vs forecast separated | AUTOMATED | REQUIRED |
| E10-T03 | E10 | SPACE | stale handling | AUTOMATED | REQUIRED |
| E10-T04 | E10 | SPACE | drag context is context not direct orbit correction | AUTOMATED | REQUIRED |
| E11-T01 | E11 | SPACE | source grade | AUTOMATED | REQUIRED |
| E11-T02 | E11 | SPACE | close approach timestamp | AUTOMATED | REQUIRED |
| E11-T03 | E11 | SPACE | uncertainty preserved | AUTOMATED | REQUIRED |
| E11-T04 | E11 | SPACE | no impact claim without source | AUTOMATED | REQUIRED |
| E12-T01 | E12 | SPACE | mission status source | AUTOMATED | REQUIRED |
| E12-T02 | E12 | SPACE | trajectory provenance | AUTOMATED | REQUIRED |
| E12-T03 | E12 | SPACE | missing live telemetry -> model/official state label | AUTOMATED | REQUIRED |
| E13-T01 | E13 | CONTROL | duplicate mission merge policy | AUTOMATED | REQUIRED |
| E13-T02 | E13 | CONTROL | source precedence | AUTOMATED | REQUIRED |
| E13-T03 | E13 | CONTROL | payload provisional status | AUTOMATED | REQUIRED |
| E13-T04 | E13 | CONTROL | site coordinates | AUTOMATED | REQUIRED |
| E14-T01 | E14 | CONTROL | window revision history | AUTOMATED | REQUIRED |
| E14-T02 | E14 | CONTROL | TBD vs confirmed | AUTOMATED | REQUIRED |
| E14-T03 | E14 | CONTROL | timezone conversion | AUTOMATED | REQUIRED |
| E14-T04 | E14 | CONTROL | countdown only with resolved window | AUTOMATED | REQUIRED |
| E15-T01 | E15 | CONTROL | invalid transition reject | AUTOMATED | REQUIRED |
| E15-T02 | E15 | CONTROL | countdown pause/hold | AUTOMATED | REQUIRED |
| E15-T03 | E15 | CONTROL | scrub reset | AUTOMATED | REQUIRED |
| E15-T04 | E15 | CONTROL | official event transition evidence | AUTOMATED | REQUIRED |
| E16-T01 | E16 | CONTROL | live vs modelled separation | AUTOMATED | REQUIRED |
| E16-T02 | E16 | CONTROL | out-of-order sample handling | AUTOMATED | REQUIRED |
| E16-T03 | E16 | CONTROL | source fail fallback | AUTOMATED | REQUIRED |
| E16-T04 | E16 | CONTROL | unit/schema validation | AUTOMATED | REQUIRED |
| E17-T01 | E17 | CONTROL | trajectory source label | AUTOMATED | REQUIRED |
| E17-T02 | E17 | CONTROL | stage separation geometry | AUTOMATED | REQUIRED |
| E17-T03 | E17 | CONTROL | target orbit frame | AUTOMATED | REQUIRED |
| E17-T04 | E17 | CONTROL | model version/assumption | AUTOMATED | REQUIRED |
| E18-T01 | E18 | CONTROL | event order | AUTOMATED | REQUIRED |
| E18-T02 | E18 | CONTROL | revisions preserved | AUTOMATED | REQUIRED |
| E18-T03 | E18 | CONTROL | video timestamp optional | AUTOMATED | REQUIRED |
| E18-T04 | E18 | CONTROL | record hash reproducibility | AUTOMATED | REQUIRED |
| E19-T01 | E19 | CONTROL | replay deterministic | AUTOMATED | REQUIRED |
| E19-T02 | E19 | CONTROL | handover provisional->confirmed | AUTOMATED | REQUIRED |
| E19-T03 | E19 | CONTROL | stage/payload identity | AUTOMATED | REQUIRED |
| E19-T04 | E19 | CONTROL | GO TO LAUNCH / WHERE IS IT NOW relation | AUTOMATED | REQUIRED |
| E20-T01 | E20 | ORBIT | known epoch golden | AUTOMATED | REQUIRED |
| E20-T02 | E20 | ORBIT | deterministic hash | AUTOMATED | REQUIRED |
| E20-T03 | E20 | ORBIT | stale flag | AUTOMATED | REQUIRED |
| E20-T04 | E20 | ORBIT | invalid elements -> unavailable | AUTOMATED | REQUIRED |
| E20-T05 | E20 | ORBIT | frame conversion | AUTOMATED | REQUIRED |
| E21-T01 | E21 | ORBIT | injected close pair recall | AUTOMATED | REQUIRED |
| E21-T02 | E21 | ORBIT | known TCA tolerance | AUTOMATED | REQUIRED |
| E21-T03 | E21 | ORBIT | boundary minimum | AUTOMATED | REQUIRED |
| E21-T04 | E21 | ORBIT | multi-minima | AUTOMATED | REQUIRED |
| E21-T05 | E21 | ORBIT | verification corpus metrics | AUTOMATED | REQUIRED |
| E22-T01 | E22 | ORBIT | missing covariance -> null not zero | AUTOMATED | REQUIRED |
| E22-T02 | E22 | ORBIT | Pc bounds | AUTOMATED | REQUIRED |
| E22-T03 | E22 | ORBIT | method mismatch warning | AUTOMATED | REQUIRED |
| E22-T04 | E22 | ORBIT | spec fixture path | AUTOMATED | REQUIRED |
| E22-T05 | E22 | ORBIT | dilution/covariance validity | AUTOMATED | REQUIRED |
| E23-T01 | E23 | ORBIT | edge deterministic | AUTOMATED | REQUIRED |
| E23-T02 | E23 | ORBIT | metric split | AUTOMATED | REQUIRED |
| E23-T03 | E23 | ORBIT | aggregate config version required | AUTOMATED | REQUIRED |
| E23-T04 | E23 | ORBIT | graph snapshot hash | AUTOMATED | REQUIRED |
| E24-T01 | E24 | ORBIT | shell boundaries | AUTOMATED | REQUIRED |
| E24-T02 | E24 | ORBIT | coverage ratio | AUTOMATED | REQUIRED |
| E24-T03 | E24 | ORBIT | source gap partial | AUTOMATED | REQUIRED |
| E24-T04 | E24 | ORBIT | threshold version | AUTOMATED | REQUIRED |
| E25-T01 | E25 | ORBIT | known family links | AUTOMATED | REQUIRED |
| E25-T02 | E25 | ORBIT | unknown origin no inference | AUTOMATED | REQUIRED |
| E25-T03 | E25 | ORBIT | chronological timeline | AUTOMATED | REQUIRED |
| E25-T04 | E25 | ORBIT | multinational separation | AUTOMATED | REQUIRED |
| E26-T01 | E26 | ORBIT | fixed seed reproducibility | AUTOMATED | REQUIRED |
| E26-T02 | E26 | ORBIT | assumption exposure | AUTOMATED | REQUIRED |
| E26-T03 | E26 | ORBIT | remove path indirect delta | AUTOMATED | REQUIRED |
| E26-T04 | E26 | ORBIT | model validation state | AUTOMATED | REQUIRED |
| E27-T01 | E27 | ORBIT | TIP parse | AUTOMATED | REQUIRED |
| E27-T02 | E27 | ORBIT | no TIP -> no fake exact time | AUTOMATED | REQUIRED |
| E27-T03 | E27 | ORBIT | version history | AUTOMATED | REQUIRED |
| E27-T04 | E27 | ORBIT | grade visible | AUTOMATED | REQUIRED |
| E28-T01 | E28 | ORBIT | synthetic sinusoid | AUTOMATED | REQUIRED |
| E28-T02 | E28 | ORBIT | alias ambiguous | AUTOMATED | REQUIRED |
| E28-T03 | E28 | ORBIT | too few points | AUTOMATED | REQUIRED |
| E28-T04 | E28 | ORBIT | uncertainty downgrade | AUTOMATED | REQUIRED |
| E29-T01 | E29 | ORBIT | known pass | AUTOMATED | REQUIRED |
| E29-T02 | E29 | ORBIT | sun/eclipse flag | AUTOMATED | REQUIRED |
| E29-T03 | E29 | ORBIT | mount limit | AUTOMATED | REQUIRED |
| E29-T04 | E29 | ORBIT | info gain ordering | AUTOMATED | REQUIRED |
| E29-T05 | E29 | ORBIT | no visibility -> no request | AUTOMATED | REQUIRED |
| E30-T01 | E30 | ORBIT | duplicate dedupe | AUTOMATED | REQUIRED |
| E30-T02 | E30 | ORBIT | bad timestamp quarantine | AUTOMATED | REQUIRED |
| E30-T03 | E30 | ORBIT | outlier reject | AUTOMATED | REQUIRED |
| E30-T04 | E30 | ORBIT | accepted-only hook | AUTOMATED | REQUIRED |
| E30-T05 | E30 | ORBIT | license missing | AUTOMATED | REQUIRED |
| E31-T01 | E31 | ORBIT | direct remove exact delta | AUTOMATED | REQUIRED |
| E31-T02 | E31 | ORBIT | metric channels separated | AUTOMATED | REQUIRED |
| E31-T03 | E31 | ORBIT | same input repeat hash | AUTOMATED | REQUIRED |
| E31-T04 | E31 | ORBIT | no data no fake beneficiary | AUTOMATED | REQUIRED |
| E31-T05 | E31 | ORBIT | new risk surfaced | AUTOMATED | REQUIRED |
| E32-T01 | E32 | ORBIT | injected influence included | AUTOMATED | REQUIRED |
| E32-T02 | E32 | ORBIT | full-vs-selective equivalence | AUTOMATED | REQUIRED |
| E32-T03 | E32 | ORBIT | new OCM path candidate | AUTOMATED | REQUIRED |
| E32-T04 | E32 | ORBIT | rollback on mismatch | AUTOMATED | REQUIRED |
| E33-T01 | E33 | ORBIT | known ranking | AUTOMATED | REQUIRED |
| E33-T02 | E33 | ORBIT | inactive protected object research mode | AUTOMATED | REQUIRED |
| E33-T03 | E33 | ORBIT | new risk penalty | AUTOMATED | REQUIRED |
| E33-T04 | E33 | ORBIT | same-designator exclusion | AUTOMATED | REQUIRED |
| E33-T05 | E33 | ORBIT | candidate provenance | AUTOMATED | REQUIRED |
| E34-T01 | E34 | VISUAL | scale transition continuity | AUTOMATED | REQUIRED |
| E34-T02 | E34 | VISUAL | floating precision budget | AUTOMATED | REQUIRED |
| E34-T03 | E34 | VISUAL | layer source labels | AUTOMATED | REQUIRED |
| E34-T04 | E34 | VISUAL | device profile fallback | AUTOMATED | REQUIRED |
| E35-T01 | E35 | VISUAL | focus persistence across modes | AUTOMATED | REQUIRED |
| E35-T02 | E35 | VISUAL | back navigation | AUTOMATED | REQUIRED |
| E35-T03 | E35 | VISUAL | object->event->object | AUTOMATED | REQUIRED |
| E35-T04 | E35 | VISUAL | NOW reset preserves expected focus | AUTOMATED | REQUIRED |
| E36-T01 | E36 | VISUAL | global view object cap | AUTOMATED | REQUIRED |
| E36-T02 | E36 | VISUAL | shell selection focus | AUTOMATED | REQUIRED |
| E36-T03 | E36 | VISUAL | viewport query | AUTOMATED | REQUIRED |
| E36-T04 | E36 | VISUAL | render subset != science subset | AUTOMATED | REQUIRED |
| E37-T01 | E37 | VISUAL | all evidence classes mapped | AUTOMATED | REQUIRED |
| E37-T02 | E37 | VISUAL | screening vs validated distinct | AUTOMATED | REQUIRED |
| E37-T03 | E37 | VISUAL | uncertainty visible | AUTOMATED | REQUIRED |
| E37-T04 | E37 | VISUAL | contrast/accessibility | AUTOMATED | REQUIRED |
| E38-T01 | E38 | INTELLIGENCE | idempotent trigger | AUTOMATED | REQUIRED |
| E38-T02 | E38 | INTELLIGENCE | dependency ordering | AUTOMATED | REQUIRED |
| E38-T03 | E38 | INTELLIGENCE | partial failure recovery | AUTOMATED | REQUIRED |
| E38-T04 | E38 | INTELLIGENCE | no circular task graph | AUTOMATED | REQUIRED |
| E38-T05 | E38 | INTELLIGENCE | replay from event log | AUTOMATED | REQUIRED |
| E39-T01 | E39 | INTELLIGENCE | independent source weighting | AUTOMATED | REQUIRED |
| E39-T02 | E39 | INTELLIGENCE | stale disagreement | AUTOMATED | REQUIRED |
| E39-T03 | E39 | INTELLIGENCE | conflicting official sources preserved | AUTOMATED | REQUIRED |
| E39-T04 | E39 | INTELLIGENCE | missing evidence remains missing | AUTOMATED | REQUIRED |
| E40-T01 | E40 | INTELLIGENCE | class required | AUTOMATED | REQUIRED |
| E40-T02 | E40 | INTELLIGENCE | AI cannot overwrite observed | AUTOMATED | REQUIRED |
| E40-T03 | E40 | INTELLIGENCE | counterfactual cannot become official | AUTOMATED | REQUIRED |
| E40-T04 | E40 | INTELLIGENCE | unknown class quarantine | AUTOMATED | REQUIRED |
| E41-T01 | E41 | INTELLIGENCE | same event correlation | AUTOMATED | REQUIRED |
| E41-T02 | E41 | INTELLIGENCE | duplicate suppression | AUTOMATED | REQUIRED |
| E41-T03 | E41 | INTELLIGENCE | new event boundary | AUTOMATED | REQUIRED |
| E41-T04 | E41 | INTELLIGENCE | domain-specific event types | AUTOMATED | REQUIRED |
| E41-T05 | E41 | INTELLIGENCE | insufficient data event allowed | AUTOMATED | REQUIRED |
| E42-T01 | E42 | INTELLIGENCE | append-only revisions | AUTOMATED | REQUIRED |
| E42-T02 | E42 | INTELLIGENCE | change cause linked | AUTOMATED | REQUIRED |
| E42-T03 | E42 | INTELLIGENCE | no-change revision suppression policy | AUTOMATED | REQUIRED |
| E42-T04 | E42 | INTELLIGENCE | rollback/correction lineage | AUTOMATED | REQUIRED |
| E43-T01 | E43 | INTELLIGENCE | confidence != uncertainty | AUTOMATED | REQUIRED |
| E43-T02 | E43 | INTELLIGENCE | missing covariance raises uncertainty/limits claim | AUTOMATED | REQUIRED |
| E43-T03 | E43 | INTELLIGENCE | factor traceability | AUTOMATED | REQUIRED |
| E43-T04 | E43 | INTELLIGENCE | versioned weighting | AUTOMATED | REQUIRED |
| E44-T01 | E44 | INTELLIGENCE | importance reasons traceable | AUTOMATED | REQUIRED |
| E44-T02 | E44 | INTELLIGENCE | change rate can outrank static magnitude under policy | AUTOMATED | REQUIRED |
| E44-T03 | E44 | INTELLIGENCE | decision shows new risk | AUTOMATED | REQUIRED |
| E44-T04 | E44 | INTELLIGENCE | scenario assumptions surfaced | AUTOMATED | REQUIRED |
| E44-T05 | E44 | INTELLIGENCE | no single-option recommendation without policy | AUTOMATED | REQUIRED |

