# STEP 16 — MULTI-YEAR COHORT SELECTION RULE

Status:
PREREGISTRATION LOCKED

Rule ID:
cohort-selection-rule-step16-chronological-accumulation

Parent:
STEP 15
Parent commit:
7091c5cb (COHORT_SELECTION_BLOCKED, cohort-step15.json 00488af2…, audit d2b57bf4… — 불변)

Created:
2026-09-06T03:27:21Z · process: Claude Code (Research Intelligence PHASE 2, STEP 16) · base commit 7091c5cb

Purpose:
STEP 15의 BLOCKED 결과 이후 별도의 사전등록 rule을 사용하여 독립적으로 cohort를 재선정하기 위한 연구 설계. STEP 14/15 규칙은 수정하지 않으며, 이 규칙은 그 결과와 무관하게 독립 문서로 존재한다.

## 무엇이 바뀌고 무엇이 그대로인가

STEP 14/15 규칙에서 **바꾸는 것은 딱 하나 — "해역당 창 1개(가장 이른 것)"를 "해역당 가장 이른 적격 창부터 시간 순으로 누적"으로.** 20기라는 총 하한을 창 1개로 채우려면 창 하나에 20기가 모여야 하는데, 이는 관측 밀도상 드물다. 누적 규칙은 여전히 "가장 이른 것부터" 원칙을 지키고, 어떤 창도 크기·속력·변위를 보고 고르지 않는다.

| 항목 | STEP 14/15 | STEP 16 |
|---|---|---|
| 관측기간 | 2010-01-01 ~ 2020-12-31 | 동일 |
| 창 | 매일 12Z 시작, 72 h | 동일 |
| 해역 4상자 | GS 32~40N/75~55W · KE 30~40N/135~160E · AG 40~30S/15~35E · BM 40~30S/60~45W | 동일 |
| E1~E5 | drogue 창 종료까지 부착 · SVP/SVPB · 73샘플·gap≤1 h · 해안 >100 km · 시작점 상자 내 | 동일 |
| A1/A2/A3 | ≥0.30 m/s(첫 관측 변위/경과) · ≥40 km · ≤90° | 동일 |
| 창 적격(해역 하한) | eligible ≥ 8 AND A1·A2·A3 | 동일 |
| 창 선택 | 해역당 가장 이른 적격 창 **1개** | 해역당 가장 이른 적격 창부터 **시간 순 누적**, 해역 코호트가 10기(고유 드리프터)에 이르면 정지 |
| 해역 순위 | 가장 이른 창의 적격 수 ↓ → 알파벳 | 누적 완료 후 해역 코호트 크기 ↓ → 알파벳 |
| 해역 수 / 총 하한 | 2 / 20 | 동일 (해역당 10기 → 2해역 = 20기) |

## Observation period
2010-01-01 12:00Z ~ 2020-12-31 12:00Z 시작 창(4,018일). STEP 15와 같은 원본 파일(observationSha256 22c0ecff…)을 사용한다. 새 취득 없음.

## Regions
위 표의 4상자. 추가·삭제·크기 변경 없음.

## Window
t0 = 날짜 12:00 UTC, t1 = t0 + 72 h. 해역 × 날짜 = 16,072창. 각 창은 관측만으로 독립 평가.

## Eligibility (드리프터, 창별)
E1 drogue_lost_date 비었거나 > t1 · E2 typebuoy ∈ {SVP, SVPB} · E3 t0+k h (k=0..72) 73샘플 모두 존재, 연속 간격 ≤ 1 h, 제공자 gap ≤ 3600 s · E4 t0 위치의 Natural Earth 1:10m 최근접 정점 거리 > 100 km(파일 SHA 6f75ae0e…) · E5 t0 위치가 상자 안(창 중 이탈은 제외 아님). 시작 시각은 정확히 12:00:00Z 표본이 있어야 한다.

## Advection criteria (창별, eligible ≥ 8일 때만 평가)
A1 median(첫 유효 다음 관측까지 변위 / 실제 경과초) ≥ 0.30 m/s · A2 median(t0→t72 대권 변위) ≥ 40 km · A3 median(min-angle(bearing t0→t24, bearing t24→t72)) ≤ 90°, 어느 구간이 <1 km면 180°로 처리.

## Selection rule (정확한 알고리즘)
1. 해역 r마다 날짜 오름차순으로 창을 순회한다.
2. 창이 적격(eligible ≥ 8 AND A1·A2·A3 PASS)이 아니면 건너뛴다.
3. 적격 창을 만나면 **채택**한다. 단, 직전에 채택한 창의 t0로부터 72 h 미만이면 건너뛴다. 채택 window 간 직접적인 시간 중첩을 금지하여 temporal overlap을 제거한다. 이후 forcing/model 단계에서 run 간 통계적 독립성은 별도로 검토한다.
4. 채택 창의 eligible 드리프터 중 **아직 해역 코호트에 없는 ID**만 코호트에 더한다(드리프터 고유성; 이미 있는 ID는 창 적격 판정에는 기여하되 코호트에 중복 추가하지 않는다).
5. 해역 코호트 고유 드리프터 수가 **10 이상**이 되면 그 해역의 순회를 멈춘다(그 창까지 포함).
6. 채택 창 수가 **6**에 이르러도 10기가 안 되면 그 해역은 최종 cohort 후보에서 제외한다.
7. 4해역 처리 후, 10기를 충족한 해역을 **코호트 크기 내림차순 → 알파벳**으로 정렬해 상위 2해역을 최종 선택.
8. 최종 = 2해역 AND 총 고유 드리프터 ≥ 20 → COHORT_SELECTION_PASS. 아니면 COHORT_SELECTION_BLOCKED.

이 알고리즘의 어느 단계도 "가장 큰 창", "가장 빠른 속력", "가장 큰 변위", 특정 날짜·연도·드리프터를 참조하지 않는다. 입력은 날짜 순서와 창별 관측 판정뿐이다.

## Minimum cohort
해역당 10(고유), 총 20, 해역 2. 창 적격 하한 8은 그대로.

## Tie-break
해역 정렬 동률 → 알파벳 regionId. 창 순서는 날짜 오름차순으로 동률 없음.

## Missing data
샘플 결측·gap 초과 → 해당 드리프터 E3 제외(창별). 0 대체·보간 없음. 빈 분기 파일(404)은 관측 없음으로 처리하고 기록.

## Duplicate handling
동일 (ID,time) 행이 값까지 같으면 병합; 값이 다르면 그 드리프터를 duplicateConflict로 제외하고 카운트. 코호트 내 드리프터 ID는 해역별로 고유(최초 채택 창에 귀속).

## Coastline handling
STEP 13/15와 동일: Natural Earth 1:10m coastline 정점 최근접 대권거리 > 100 km, 파일 SHA 6f75ae0e… 불일치면 BLOCKED / INPUT MISMATCH.

## Drogue handling
E1: 제공자 drogue_lost_date가 창 종료 시각 이하이면 제외. 창 이후 분실은 허용.

## Out-of-box handling
t0만 판단. 창 중 상자 이탈은 제외 사유 아님(STEP 14와 동일).

## Start-time handling
t0 = 해당 날짜 12:00:00Z 표본이 존재해야 한다. 정확히 12Z가 아닌 표본으로 시작하지 않는다.

## maxGap / sample count
73샘플(t0..t72 정시), 연속 간격 ≤ 1 h, 제공자 gap ≤ 3600 s. 드리프터별 sampleCount·maxGapHours·start/end timestamp를 기록.

## Determinism (PASS 조건)
같은 관측 파일 집합(observationSha256 일치)·같은 규칙 파일(SHA 일치)·같은 해안선 파일로 2회 실행 시 selectionHash·코호트(createdAt 제외)·감사 파일이 바이트 동일. selectionHash는 규칙 SHA·관측 SHA·해안선 SHA·상태·해역별 채택 창 날짜·드리프터 ID·전 창 감사 요약으로 계산하며 시각 메타데이터를 제외.

## Forbidden inputs
HYCOM·GLORYS·ERA5·NCEP·바람·V1/V2 결과·replay·evidence·verdict·bootstrap·민감도·궤적·기준선. **STEP 15의 창별 적격 수·특정 창 날짜를 규칙 정의나 실행의 입력으로 쓰지 않는다** — 규칙은 날짜 순서만 본다. open() 가드로 금지 경로 접근 시 exit 1, forbiddenInputAccess를 기록.

## 사후선정이 아닌 이유(정직 고지 포함)
- 규칙의 유일한 변경은 "창 1개 → 시간 순 누적"이며, 어떤 관측 통계도 최대화·최적화하지 않는다.
- STEP 15 감사(커밋 7091c5cb)에 네 해역 모두 적격 창이 있고 일부 창에 19~23기가 있다는 사실은 이미 저장소에 있으므로 설계자가 그것을 "모른다"고 주장하지 않는다. 그러나 이 규칙은 그 창들을 목표로 하지 않는다: 누적은 가장 이른 창부터 시작하므로 큰 창이 뒤에 있으면 그 전 창들이 먼저 채택되고, 10기에 도달하는 즉시 멈춘다. 결과 코호트가 무엇이 될지는 계산 전에 알 수 없다.
- 해역당 최대 6개 window에서 최소 10개의 고유 drifter를 확보하고, 최종적으로 10기 이상을 확보한 해역 중 cohort size가 큰 상위 2개 해역을 선택한다. 최종 총 cohort가 20기 이상이면 PASS이며, 그렇지 않으면 BLOCKED이다.
- 이 규칙으로도 BLOCKED가 나오면 그대로 기록하고, 규칙을 실행 후 수정하지 않는다.

## Expected output
docs/research/cohort-step16.json · docs/research/step16-selection-audit.json · docs/research/step16-observation-manifest.json(STEP 15 원본 재사용 명시) · selectionHash · tools/research/select_step16_cohort.py · tools/research/check_step16_selection.py

## STOP CONDITION
20기 미달(또는 10기 해역 2개 미만)이면 COHORT_SELECTION_BLOCKED. 20기를 채우기 위해 rule을 실행 후 수정하지 않는다. 새 설계는 새 ruleId로만.
