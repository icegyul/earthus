# STEP 14 — 다년 관측기간 코호트 규칙 사전등록

createdAt: 2026-09-05T23:13:13Z · process: Claude Code (Research Intelligence PHASE 2, STEP 14) · 기준 커밋: 6d95b604
ruleId: **cohort-selection-rule-step14-multi-year** · questionId: **Q3-multi-year-advection-regime-cohort-availability**

## 선언

**STEP 13의 BLOCKED 결과 이후에도 threshold와 region geometry를 완화하지 않고, 관측기간만 2010–2020으로 확대하여 동일한 advection-dominant cohort 조건을 재검증한다.**

**이 문서는 실제 cohort selection 전에 commit된다.** 이 커밋 이후 어떤 관측 창도 아직 스캔되지 않았고, 어떤 관측·강제력 파일도 취득되지 않았으며, 어떤 모델도 실행되지 않았다.

## STEP 13 기록(불변)

커밋 6d95b604 · `cohort-step12.json` SHA ed87385e… · 감사 SHA dcf0f645… · 상태 COHORT SELECTION BLOCKED — 2015년 단일 연도에서 GS 0 / KE 0 / AG 17 / BM 0 적격 창, AG 9기만 확보, 요구(2해역·20기) 미달. 이 기록은 수정·삭제하지 않으며, 새 규칙을 유리하게 만들기 위한 정보로 쓰지 않는다.

## 바뀐 것과 바뀌지 않은 것

| 항목 | rule-v2 (STEP 12/13) | rule-step14 |
|---|---|---|
| 관측기간 | 2015-01-01 ~ 2015-12-31 | **2010-01-01 ~ 2020-12-31** (STEP 14 시작 시점에 고정) |
| 창 | 매일 12Z 시작, 72 h | 동일 |
| 해역 | GS·KE·AG·BM 4상자 | 동일(추가·삭제·크기 변경 없음) |
| E1~E5 | drogue 부착·SVP/SVPB·73샘플 gap≤1 h·해안 100 km·시작점 상자 내 | 동일 |
| A1 | 시작 속력 중앙 ≥ 0.30 m/s (제공자 ve/vn) | **≥ 0.30 m/s, 단 첫 관측 시간 변위 / 실제 경과시간으로 정의**(지시서 명시; 문턱값 동일) |
| A2 | 72 h 변위 중앙 ≥ 40 km | 동일 |
| A3 | 방위 변화 중앙 ≤ 90° | 동일 |
| 해역 하한 / 총 하한 / 해역 수 | 8 / 20 / 2 | 동일 |
| 창 선택 | 해역별 가장 이른 적격 창 | 동일 |
| 해역 순위 | 적격 수 내림차순 → 알파벳 | 동일 |

## 이 커밋 이후 금지

관측기간·해역 상자·A1/A2/A3 문턱·8/20/2 하한·72 h 지평의 변경, 유리한 날짜·연도·해역 선택, 사후 드리프터 제외. 변경이 필요하면 새 ruleId와 새 사전등록 커밋만 허용한다.

## 데이터 블라인드

STEP 14에서 열지 않은 것: GDP raw CSV(2015 파일 포함), HYCOM, GLORYS, ERA5, NCEP, 바람, V1/V2 결과, 부트스트랩, 민감도, 궤적, 기준선. 이 단계는 RULE ONLY다.

## 다음 단계(이 커밋 뒤에만)

1. 2010–2020 GDP hourly 관측 취득(해역 +3° 여유), 원본 SHA 기록.
2. `select_cohort` 를 rule-step14로 기계 실행 → 코호트 파일 **단독 커밋**(LOCKED 또는 BLOCKED 그대로 기록).
3. LOCKED일 때만 validation-plan-v3 단독 커밋 → 강제력 취득 → dry-run → 실행.

## 무결 참조

STEP 13 6d95b604 · STEP 12 rule 9bd36215… · V1 immutable 6f07fc61… · V1 verdict 00989f01… · V2 verdict 40e15705… · V2 evidence manifest 463bce12…

검증 스크립트: `tools/research/check_step14_preregistration.py` (exit 0 = PASS).
