# Validation Plan — STEP 12 (후속 검증 사전 설계)

createdAt: 2026-09-05T17:04:34Z · author/process: Claude Code (Research Intelligence PHASE 2, STEP 12) · git: 73d40ae0
상태: **설계 문서**. 실제 계산·자료 취득·코드 변경 없음. 실행 전에 이 문서의 수치를 `validation-plan-v3.json`으로 옮겨 **단독 커밋**해야 한다.

## 0. 고정된 선행 결과 (수정 금지)

| | 판정 | 72 h 중앙 분리(km) |
|---|---|---|
| V1 (surface-passive-advection.v1) | FAIL / NOT_ACCEPTED | 24.33 |
| V2 (v2.windage, α=0.0007) | NOT_ACCEPTED — C1 FAIL · C2 PASS · C3 PASS · C4 PASS · C5 FAIL | 23.20 |
| 정지 기준선 | — | 19.22 |
| 초기속도 지속 | — | 32.20 |
| V1→V2 | 중앙 delta +0.46 km · 개선 7/21 | |

근거: `evidence/gdp-hycom-cohort-201501/IMMUTABLE-V1.json`, `evidence/gdp-hycom-cohort-201501-v2/verdict.json`. 후속 결과가 무엇이든 이 표는 바뀌지 않는다.

## 1. 연구 질문 Q2

`research-question-step12.json` — "V2 실패가 윈디지 부재가 아니라 조용한 환류에서의 재분석 이류장 오차 때문인지, **같은 모델(α 고정)**을 사전 정의된 이류 지배 코호트와 독립 자료 제품에 적용해 확인할 수 있는가?" 가설 H1~H4는 모두 NOT_ADOPTED.

## 2. 코호트 선택

`cohort-selection-rule-v2.json`의 규칙을 문자 그대로 적용한다. 요지:
- 후보 해역 4곳(걸프류·쿠로시오 확장·아굴라스·브라질-말비나스)은 지리 교과서 정의이며 40S~40N 제한(HYCOM 위도 간격).
- 이류 지배 정의는 **관측만**으로: A1 시작 속력 중앙 ≥ 0.30 m/s, A2 72 h 변위 중앙 ≥ 40 km, A3 방향 지속 ≤ 90°.
- 드리프터 적격 E1~E5, 코호트 하한 20기(해역당 8기), 강제력 커버리지 C_forcing.
- **선택은 해역별 가장 이른 달력 창**. 모델 결과·바람 통계·V1/V2 지식은 선택에 쓰지 않는다.
- 2015-01 조용한 환류 코호트 재사용 금지.

## 3. 자료 제품

`dataset-comparison-hycom-glorys.md`. HYCOM(3 h, 15 m 층)과 GLORYS12V1(일평균, 15 m 연직 보간)을 각자 원래 시간 해상도로 쓴다. GLORYS는 자격증명 확보 전 **BLOCKED / PENDING**; 확보 전에는 HYCOM 축(A·A0·C·D)만 실행 가능하며 그 경우 H4는 판정 불가로 남긴다.

## 4. 모델·매개변수 정책

- 모델: surface-passive-advection.v2.windage 0.1.0 그대로. 코드 변경 없음(reader 추가는 별도 커밋·별도 소스 스냅샷).
- **α = 0.0007 고정**(문헌값). STEP 11 민감도 결과(0.0086·0.01·0.03이 더 나빴음)를 이유로 α를 바꾸지 않는다. 통제로 α=0을 둔다. 새 α는 별도 사전등록 없이는 금지.

## 5. 지표·기준선

- 24/48/72 h 위치 오차(km), `research_runtime.validation.compare`(정확한 UTC 일치, haversine 6371008.8 m) 동일 함수.
- 기준선: 정지, 초기속도 지속. 짝비교는 관측 대상이 같은 셀끼리(A vs B, A vs A0).
- 보고: n·median·mean·min·max·improved·worsened·unchanged(동률은 개선 아님)·부트스트랩(드리프터 단위, seed 고정, 보조).

## 6. 수용 기준(초안 — v3 JSON 커밋 전까지는 미확정, 계산 후 변경 금지)

| 기준 | 내용 |
|---|---|
| K1 | 셀 A(HYCOM+α) 72 h 중앙 오차 < 정지 기준선 72 h 중앙 오차 (C1 아날로그) |
| K2 | 셀 A 72 h 중앙 오차 < 초기속도 지속 72 h 중앙 오차 |
| K3 | 적격 ≥ 20기·해역 ≥ 2·replay 해시 일치·근거 완비 |
| K4 (H2 검정) | 코호트 A2(관측 72 h 변위 중앙) ≥ 40 km가 실제로 성립함을 사후 확인(관측만) — 성립하지 않으면 코호트 규칙 위반으로 BLOCKED |
| K5 (H4, GLORYS 있을 때만) | 셀 B와 셀 A의 72 h 오차 짝비교: 중앙 |B−A|를 보고하되 **우열 판정 기준으로 쓰지 않음**. 자료 제품 민감도 기록이 목적 |
| 판정 | K1·K2·K3 모두 충족 → PASS(해당 코호트 한정). 아니면 NOT_ACCEPTED. 자료·자격증명 부재 → BLOCKED |

V1/V2의 C5(V1 대비 14/21 개선)는 **자동 재사용하지 않는다** — 새 코호트에서 V1을 다시 돌려 짝비교하려면 그 자체를 v3 계획에 명시해야 한다(현재 초안에서는 A0가 V1과 동일한 물리이므로 A vs A0로 윈디지 효과를 잰다).

## 7. 실행 전 필수 순서

1. 코호트 규칙 적용 → `cohort-step12.json`(창·ID·A/E/C 값) 커밋.
2. `validation-plan-v3.json` 단독 커밋(위 K1~K5 수치 고정, 커밋 해시를 계획에 기록).
3. 자료 취득(HYCOM NCSS; GLORYS는 사용자 로그인 후) → 원본 SHA 기록.
4. 필요한 reader(GLORYS)만 새 파일로 추가·테스트 → 별도 커밋.
5. dry-run PASS → 실행 → 별도 프로세스 replay → evidence → 기계 판정.

## 8. 하지 않을 것

- 여러 코호트를 먼저 돌려 보고 좋은 것을 고르기.
- STEP 11 결과를 근거로 한 α 변경.
- GLORYS 대체 자료·합성 fixture 사용.
- V1/V2 근거·계획·판정 수정.
- 코드 변경(이 STEP에서는 문서 4건만 신규).
