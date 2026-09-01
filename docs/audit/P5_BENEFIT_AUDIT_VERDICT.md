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

## P5 유효화 재작성 — 완료 (2026-09-01 저녁)

요구 4항목 전부 구현·검증 완료:

1. ✅ **물리 counterfactual 빌더** `backend/benefit/physical.py` (SCREENING_RECOMPUTE_V1): G0′과 Gs를 **둘 다** P4 파이프라인(SGP4→coarse→TCA) 실재실행으로 도출. 타깃은 Gs 입력 카탈로그에서 물리적으로 제외. 신규 생성 엣지 검출 내장(REMOVE에서 비어야 하며, 위반 시 ANOMALOUS 경고+PARTIAL — OCM 일반화 대비)
2. ✅ **FULL vs AFFECTED_SUBGRAPH 실제 분리**: FULL=전체 재스크리닝, AFFECTED=영향 접촉 쌍만 TCA 재정밀화+비접촉 엣지 재사용(G0′ 이웃으로 영향 집합 자동 보강). 두 독립 경로의 result_hash 수치 동등성이 이제 **진짜 검증**
3. ✅ **검증 재작성** `tests/integration/test_p5_physical_counterfactual.py`: 합성 궤도 6객체(co-orbital 3 + 별도 셸 2 + 고립 1)가 수집→스크리닝→기준선→물리 counterfactual **전 실파이프라인** 통과. 경로 상이성(재사용 수·TCA 정밀화 수 차이)과 수치 동등성 동시 증명. 레거시 corpus 주입값 의존 제거
4. ✅ **validation_state 계층**: 물리 경로 = PUBLIC_SCREENING (run·benefit_result·시나리오 그래프 스냅샷), 레거시 엣지삭제형 = 명시 옵트인(`counterfactual_method=IDEALIZED_REMOVAL`) + SIMULATION_ONLY. API 기본값은 물리 엔진

**물리 corpus가 잡아낸 잠복 결함 2건** (823의 옛 corpus로는 도달 불가였던 경로):
- P4 `conjunction/service.py`: prepare_catalog에서 초기화 실패 객체 탈락 시 `zip` 위치 매핑이 이후 모든 후보 쌍을 **엉뚱한 궤도요소**에 연결 — 격리 객체가 카탈로그 정렬 앞에 있으면 전 쌍 오계산. identity 매핑으로 수정
- `benefit/repository.py` load_operational_event_rows: `snapshot_id` 미SELECT — 실 운영 이벤트가 처음 기준선을 통과하자 KeyError

회귀: 페이즈 라인 전체 **267 passed / 0 failed**.

**잔여(후속)**: 대규모 full-vs-selective 성능 벤치마크(기능 동등성은 완료), BEN-001/003 정량 corpus의 물리 엔진 재생성, ORB-P6 PROTECT/OCM.

## 재현 절차 (판정의 지문)

임의 기준선에서 REMOVE run 실행 시 (i) benefit_value == 삭제된 인접 엣지 metric_value 합 (항상 일치 — 엣지삭제형의 지문), (ii) mode를 바꿔도 `apply_idealized_removal` 외 함수 호출 없음.
