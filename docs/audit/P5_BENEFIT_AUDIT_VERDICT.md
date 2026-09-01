# P5 BENEFIT 적대 감사 판정 — EDGE_DELETION / SIMULATION_ONLY

> 감사일: 2026-09-01 · 방식: 독립 감사 2명(회의적/데이터흐름) + 교차검증자, 전 주장 file:line 코드 재확인
> 대상: `services/aetherus-orbital/backend/benefit/` (823 @ 7ac0357 이식본)

## 판정

**EDGE_DELETION_SIMULATION_ONLY — v1.2.1이 무효화한 정확히 그 유형. ORB-P5 게이트 불충족.**

## 핵심 근거 (전부 코드로 재확인됨)

1. **Gs 생성은 필터 두 줄이 전부**: `graph.py:277-278` — `removed = involves(target)인 엣지`, `kept = 나머지`. Gs는 kept를 무수정 tuple로 감싼 것(`graph.py:288-294`). 값 재계산 0건.
2. **P4 재실행 부재**: benefit 패키지에서 `backend.conjunction`(스크리닝·TCA·Pc) 파이썬 import 0건. P4 소비는 `repository.py:66,85`의 저장 결과 SELECT(읽기 전용)뿐.
3. **FULL vs AFFECTED 동등성은 항진**: `service.py:373-375`가 mode와 무관하게 동일 함수를 동일 인자로 호출. `service.py:393-394` 주석이 result_hash에서 recompute_mode를 "deliberately excluded" — 해시 일치는 설계상 보장이지 수학적 검증이 아님. 823의 "full-vs-selective delta 0.0 PASSED" 증거의 실체가 이것.
4. **동등성 corpus도 합성 주입값**: `p5_sim_seed.simulation_edge()`가 metric_value를 직접 주입 — P4 물리 계산을 한 번도 안 거침.
5. **회계 연출(accounting theater)**: `recomputed_edge_count`는 아무것도 재계산하지 않는 카운터, docstring의 "selective mode re-derives edges"는 대응 구현 부재(mode 파라미터 자체가 없음).
6. **완화 요소 (위장은 아님)**: assumptions에 "Counterfactual deletes every baseline edge incident to the target." 평문 명시(`service.py:291-296`), 전 응답에 `IDEALIZED_REMOVAL_SIMULATION` 경고, health가 `AVAILABLE_IDEALIZED_SIMULATION` 공표.
7. **DB 강등 공백 발견**: validation_state가 baseline_graph_snapshot·risk_edge에만 있고 scenario_run·benefit_result에는 없어 시뮬레이션 표식이 warnings 텍스트에만 의존했음.

## 즉시 조치 (2026-09-01 적용 완료)

| 조치 | 내용 |
| --- | --- |
| 허위 서사 시정 | docstring을 SIMULATION_ONLY 명시로 교체, `recomputed_edge_count` → `affected_incident_edge_count` 개명 (graph.py·service.py) |
| DB 수준 강등 | 마이그레이션 `009_p5_simulation_only_demotion.sql` — scenario_run·benefit_result에 `validation_state DEFAULT 'SIMULATION_ONLY'` + CHECK |
| 판정 문서화 | 본 문서. ORB-P5 상태: **NOT STARTED** (기존 기능은 SIMULATION_ONLY 연구 기능으로만 유지) |

적용 후 P5 테스트 스위트 44 passed / 11 skipped — 기존 시뮬레이션 기능 회귀 없음.

## P5 유효화 재작성 범위 (다음 작업)

1. `graph.py`: `apply_idealized_removal`을 대체하는 **물리 counterfactual 빌더** — 타깃을 카탈로그에서 제외한 상태로 `backend/conjunction`의 coarse_screen→find_tca→Pc 파이프라인을 affected 영역에 재실행해 Gs 엣지를 재유도
2. `service.py:run_scenario`: ConjunctionService(P4) 의존성 주입. FULL(전체 재계산)과 AFFECTED_SUBGRAPH(영향 영역만 재계산+나머지 재사용)를 **실제로 다른 코드 경로**로 구현
3. 검증 재작성: 동등성 테스트를 "독립 두 경로의 수치 일치"로 교체, corpus를 P4 파이프라인 산출값으로 구성
4. 재작성 후에만 validation_state에 SIMULATION_ONLY 외 값 허용

## 재현 절차 (판정의 지문)

임의 기준선에서 REMOVE run 실행 시 (i) benefit_value == 삭제된 인접 엣지 metric_value 합 (항상 일치 — 엣지삭제형의 지문), (ii) mode를 바꿔도 `apply_idealized_removal` 외 함수 호출 없음.
