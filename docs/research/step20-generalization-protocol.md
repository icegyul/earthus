# STEP 20 — GENERALIZATION / PARAMETER VALIDATION PROTOCOL (PREREGISTRATION)

Status: PREREGISTRATION LOCKED · Data requirement: STEP20_DATA_REQUIREMENT_BLOCKED · created 2026-09-06T05:50:00Z · base commit 2a681ec2
Rule ID: **model-protocol-step20-generalization-parameter-validation**
Question: Does a non-zero windage coefficient generalize across independent temporal/spatial validation conditions, and if so, what preregistered α-selection rule identifies the preferred coefficient without using holdout results?

Possible outcomes (all remain open): (A) α=0 is sufficient · (B) a non-zero α consistently improves the model · (C) improvement is conditional on region/forcing regime · (D) no stable α preference can be established. No candidate is described as the expected winner. STEP 19 established nothing about superiority: its result is DESCRIPTIVE ONLY.

Immutable ancestry (변경 금지): STEP 17 LOCK 551668ef (forcing protocol db73ef67…, preregistration b4bad644…, forcing manifest 591cc057…) → STEP 18 LOCK d505cc5e (protocol 519b3d35…; Phase B permanently BLOCKED, manifest 02c859f9…, 5607ac1a) → STEP 18b LOCK 5b9567e5 (protocol 73e8aa14…, preregistration 02935e81…, rule 7e9ab639…; runner 75020d98; manifest 923fd1ba…, a9225f77) → STEP 19 LOCK 5f27dc2d (protocol 92047596…, preregistration 02e73093…, rule ce3d466b…; outputs 2a681ec2: evaluation 9baa0c6a…, paired table 10a629e4…, summary 061474f4…, script 77065879…). STEP 16 cohort 8581d234… (5bc3590b). Observations 22c0ecff….

이 문서는 설계만 사전등록한다. **Phase A에서는 모델 실행·forcing 다운로드·trajectory·metric·holdout 결과 열람이 없다.** STEP 19 결과를 보고 α를 고르지 않았고, 아래 규칙은 결과와 무관하게 고정된다.

## 1. α 후보 집합 (LOCKED)

α ∈ {0, 0.0003, 0.0007, 0.0010, 0.0020} — 정확히 5개, 이 순서. α=0은 무풍압(baseline) 가설, 나머지는 고정된 양의 windage 가설. 결과를 본 뒤 추가·삭제·재정렬·조정 금지. 런타임 허용 범위 [0, 0.05] 안에 있으며 런타임 코드 변경 없음.

## 2. 모델 (LOCKED, STEP 18b와 동일)

dX/dt = U_ocean(15 m) + α · U_wind(10 m) · RK4 · 적분 substep 300 s · 출력 900 s(289 샘플, 마지막 t0+72h) · 구면 지리 변환(매 RK4 단계 cos φ) · bilinear 공간·linear 시간 보간 · 외삽·평활·0 대체·육지 값·regridding·frame 복제 금지 · `surface-passive-advection.v2.windage` 0.1.0 코드 변경 없음 · 상태 어휘와 매핑은 STEP 18b §3(OUT_OF_DOMAIN = 위도 ±40° 통과, 그 외 FORCING_UNAVAILABLE) · spec.area = 각 run unit의 locked 해류 forcing box(위도 [−40, 40]로 clip). 모델 역학 변경이 필요해지면 실행하지 않고 보고한다. 런타임 grid-travel 상한을 300 s가 넘는 run unit이 생기면 MODEL_RUN_BLOCKED_PREFLIGHT(파라미터 변경 금지).

## 3. 데이터 구분 (LOCKED)

### 3.1 CALIBRATION / DEVELOPMENT
STEP 18b run unit 4개 = STEP 16 코호트 23기, forcing은 STEP 17 Phase B 취득본(불변, manifest 591cc057…)을 그대로 사용:

| Unit | t0 | 종료 | 드리프터 |
|---|---|---|---|
| KE-1 | 2010-05-11T12:00:00Z | 2010-05-14T12:00:00Z | 8 |
| KE-2 | 2010-06-30T12:00:00Z | 2010-07-03T12:00:00Z | 5 |
| AG-1 | 2015-04-23T12:00:00Z | 2015-04-26T12:00:00Z | 9 |
| AG-2 | 2015-04-26T12:00:00Z | 2015-04-29T12:00:00Z | 1 |

용도: α 순위·선택에만 사용. (α=0·0.0007 결과가 STEP 18b/19에서 이미 관측되었다는 사실을 숨기지 않는다. 선택 규칙 §7은 그 결과와 무관하게 여기서 고정되며, 다른 세 α의 결과는 존재하지 않는다.)

### 3.2 HOLDOUT / VALIDATION — 창 선정 규칙(관측만, 결과 열람 없음)
규칙(적용 전에 고정): 해역 r ∈ {KE, AG}에 대해
1. cutoff_r = 그 해역의 마지막 calibration 창 종료 + **30일** (72 h 창·NCEP 6 h 바람의 종관 상관 시간(수일)을 크게 넘는 분리; 각 창의 forcing 파일은 서로 다른 시간 구간에서 별도 취득되므로 forcing frame 공유 없음. 단, 중규모 해양 상태(소용돌이·사행)는 수 주~수 개월 지속하므로 완전한 독립을 뜻하지 않는다 — §12).
2. 후보 = STEP 16 선정 감사(step16-selection-audit.json, 관측 2010–2020, 규칙 E1–E5·A1–A3)의 eligibleWindow=true 창 중 start ≥ cutoff_r 이고 창 종료 ≤ 2015-12-31T23:59:59Z(STEP 17 forcing 제품 HYCOM GOFS 3.1 expt_53.X coverage 1994–2015 안).
3. STEP 16과 동일한 시간순 누적: 선정 창 시작 간격 ≥ 72 h; 새 ID = 해당 창 eligible ID 중 **calibration 코호트 ID와 이미 누적된 holdout ID를 제외**한 것; 새 ID가 없으면 건너뜀; 누적 unique ≥ 10 또는 창 6개에서 정지. 적격성은 STEP 15/16 코드(evaluate) 그대로 재계산하고 감사의 eligibleCount와 일치해야 한다.
4. 후보가 없으면 그 해역 holdout = HOLDOUT_UNAVAILABLE. 임의 창을 만들지 않는다.

도구 `tools/research/derive_step20_holdout.py`(관측·감사·코호트·해안선만 열람, 그 외 open 금지, forbiddenInputAccess=0) 적용 결과 → `docs/research/step20-holdout-derivation.json` (derivationHash 4c960a21981119ad197c3a131cc172b81c0096ee23acc83163684ea076f76000):

| Holdout unit | t0 | 종료 | 새 드리프터 | 비고 |
|---|---|---|---|---|
| KE-H1 | 2010-08-10T12:00:00Z | 2010-08-13T12:00:00Z | 5 | eligible 9 중 calibration 중복 ID 4 제외 |
| KE-H2 | 2010-08-16T12:00:00Z | 2010-08-19T12:00:00Z | 1 | eligible 10 중 중복 제외 |
| KE-H3 | 2010-11-15T12:00:00Z | 2010-11-18T12:00:00Z | 7 | |
| **KE holdout** | | | **13 unique** | HOLDOUT_MET (cutoff 2010-08-02T12Z) |
| **AG holdout** | — | — | **0** | **HOLDOUT_UNAVAILABLE**: cutoff 2015-05-29T12Z 이후 coverage 안에 AG eligible 창이 없음(AG eligible 창은 2015-04-23~05-20뿐) |

방출 위치 = derivation 파일의 각 드리프터 t0 관측 위치. 창·ID 변경 금지. KE 해역 holdout은 calibration보다 38~135일 뒤(같은 해 2010)이며 다른 드리프터 ID다.

**"Holdout data are not used for parameter selection, model modification, threshold tuning, or protocol modification."**

### 3.3 데이터 요구사항 (STEP20_DATA_REQUIREMENT_BLOCKED)
- (R1) KE-H1·KE-H2·KE-H3의 forcing이 없다: HYCOM GOFS 3.1 GLBv0.08 expt_53.X 15 m 3 h(각 창 t0..t0+72h, 해류 상자 = 창 코호트 t0 bbox ±2.0°, 위도 [−40, 40] clip) + NCEP-DOE R2 10 m 6 h(±3.0°, t0−12h..t0+84h). STEP 17 forcing protocol §2–§6의 규칙 그대로, 별도 단계(STEP 20 Phase B-2, 새 manifest)에서 취득한다. Phase A에서는 다운로드하지 않는다.
- (R2) AG holdout이 없다: 저장소 관측(NOAA GDP hourly QC 2010–2020, AG box)에는 분리 규칙을 만족하는 AG eligible 창이 없다. AG holdout을 만들려면 **HYCOM expt_53.X coverage 안의 다른 기간(1994–2009) AG box GDP hourly 관측을 STEP 15 방식으로 새로 취득·사전등록**하거나, 2016년 이후를 쓰려면 **다른 HYCOM 실험(expt_57.x/92.x/93.0)** 을 새 forcing protocol로 사전등록해야 한다. 이 protocol은 그 중 어느 것도 결정하지 않는다. AG holdout이 확보되지 않은 채 Phase B를 실행하면 AG 층은 **HOLDOUT_UNAVAILABLE**로 보고하고(pooling·대체·삭제 금지), 해역 의존 결론(C)에 대해 AG는 "insufficient evidence"만 가능하다.
- 설계를 데이터에 맞춰 약화하지 않는다(분리 30일·coverage 규칙·strata 유지).

## 4. Phase B 실행 순서 (LOCKED)
- B-1 CALIBRATION RUNS: 4 unit × 5 α = 20 runtime calls(고정 순서: unit KE-1, KE-2, AG-1, AG-2 × α 0, 0.0003, 0.0007, 0.0010, 0.0020), 기존 STEP 17 forcing만 사용. α=0·0.0007 run의 result array SHA는 STEP 18b manifest 값과 일치해야 한다(불일치 → CALIBRATION_BLOCKED_REPRODUCIBILITY). 각 run 별도 프로세스 replay 일치 필수.
- B-2 α SELECTION: §7 규칙으로 α* 결정 → `docs/research/step20-alpha-selection.json` 단독 commit(선택 근거 수치 포함). 이후 α* 변경 금지.
- B-3 HOLDOUT FORCING ACQUISITION: R1 취득·QC·manifest(STEP 17 규칙). α* 결정 commit **이후**에만.
- B-4 HOLDOUT RUNS: KE-H1/H2/H3 × {α*, 0} (α* = 0이면 α=0 1회만). 정확히 한 번. replay 일치.
- B-5 EVALUATION: §8–§11. 결과 파일은 `data/research/step20/`(commit 금지), manifest·평가·표는 commit.
- 어느 단계든 실패 정책 §13. 순서 변경·재실행 선택 금지.

## 5. 공간 층 (LOCKED)
보고 층: **KE**, **AG**(필수) + 세부 unit KE-1, KE-2, AG-1, AG-2, KE-H1, KE-H2, KE-H3(n이 허용하는 한 값은 항상 보고). AG-2(n=1)와 KE-H2(n=1)는 절대 조용히 제외하지 않는다. KE와 AG를 합쳐서 해역 차이를 숨기지 않는다(전체 값은 해역 값과 나란히만 보고).

## 6. Primary metric (LOCKED)
M3 관측-모델 위치 오차, km, haversine 반지름 6371008.8 m, 지평 24 h·48 h·72 h, 정확한 UTC 일치(관측 정각, 모델 900 s 격자), 보간 없음. 각 드리프터·각 α에 대해 같은 관측 궤적 대비 오차. 관측/모델 부재 → NOT_AVAILABLE.

## 7. α 선택 규칙 (LOCKED — holdout 결과 사용 금지)
1. 선택 집합 S = calibration 23기 중 **다섯 α 모두** t0+72h 모델 위치가 valid이고 관측이 있는 드리프터(제외 수·ID 보고).
2. 각 α의 순위 지표: **primary = S 위 72 h M3 median**(작을수록 좋음; 짝수 n이면 중앙 두 값의 평균).
3. tie(|차이| ≤ 1e-6 km) → **secondary = 48 h M3 median** → tie → **tertiary = 24 h M3 median** → tie → **더 작은 α**.
4. 선택된 α*를 동결. mean 오차는 선택에 쓰지 않고 기술 통계로만 보고. 해역별 median도 기술 통계로만 보고(선택은 전체 S로만).
5. α*가 0이면 결론 후보 "(A) α=0 sufficient / (3) baseline preferred"가 되며 holdout은 α=0 단독 실행(§4 B-4).

## 8. Holdout 비교 규칙 (LOCKED)
holdout 드리프터마다 α*와 α=0을 짝지어 24/48/72 h M3 계산. delta = error_selected − error_baseline; tie |delta| ≤ 1e-6 km; win = delta < −tol, loss = delta > tol. 보고: 지평별 n, median, mean, min, max(각 run), median/mean/min/max delta, wins, losses, ties — 전체·KE·AG(UNAVAILABLE이면 명시)·unit별. Acceptance threshold 없음.

## 9. 일반화 보고 (LOCKED — 이분법 금지)
최소 보고: (A) 전체 holdout 결과 (B) KE (C) AG (D) unit별 (E) 24/48/72 h 지평 거동. Phase B 보고는 다음 여섯 결론 중 하나 이상을 기술적으로 허용해야 한다: 1 일관된 개선 · 2 의미 있는 차이 없음 · 3 baseline α=0 선호 · 4 해역 의존 효과 · 5 지평 의존 효과 · 6 증거 불충분. PASS/FAIL로 압축하지 않는다.

## 10. Secondary metrics (LOCKED)
M1 72 h endpoint displacement(run별) · M2 total trajectory displacement(run별) · **M4(generalized) = α* 궤적과 α=0 궤적의 같은 시각 위치 거리, 24/48/72 h + 72 h까지 series n/median/max; α* = 0이면 M4 = 0으로 정의되어 NOT_APPLICABLE로 보고** · M5 observed 72 h displacement. calibration에서는 M4를 각 양의 α와 α=0 사이로 확장해 보고(5개 α 모두, 기술 통계). 사후 지표 추가 금지.

## 11. 이상치·소표본 정책 (LOCKED)
제거·winsorize·trim·대체·수동 제외 금지. 유효 궤적 전부 분석. 지평별 top-3 M3 오차(α*·baseline) 보고. 실패는 §13 사전 정책만 적용, 결과를 본 뒤 재정의 금지. 표본 보고: 전체 짝 n, 해역 n, unit n, **n < 5인 층은 명시적으로 표시**하고 그 층에서는 wins/losses/ties와 median을 값으로만 보고하며 어떤 추론 통계도 하지 않는다. 탐색적 부호검정(§12)은 n ≥ 10인 집합(전체·KE·AG)에서만 계산.

## 12. 추론 정책 (LOCKED)
Primary는 기술 통계. 드리프터는 독립이 아니다: 같은 창의 forcing 공유, 같은 해역·같은 해의 시간 창 공유, 해역 상관, 모델 공통 오차(같은 forcing 제품·같은 reader). 독립표본 t-검정·ANOVA·신뢰구간 없음(의존 구조를 다루는 방법이 사전등록되어 있지 않다). 탐색적 양측 정확 부호검정(tie 제외, p=0.5)만 "EXPLORATORY, nominal"로 보고하고 acceptance criterion으로 쓰지 않는다. "significant" 문구 금지.

## 13. 실패 정책 (LOCKED)
입력 SHA 불일치 → *_BLOCKED_IMMUTABILITY · preflight 오류 → MODEL_RUN_BLOCKED_PREFLIGHT · 런타임 예외 → MODEL_RUN_FAIL(동일 입력 재시도 1회) · replay 불일치 → MODEL_RUN_FAIL · α=0/0.0007 calibration SHA ≠ STEP 18b → CALIBRATION_BLOCKED_REPRODUCIBILITY · 조기 종료(OUT_OF_DOMAIN/FORCING_UNAVAILABLE) = 실패 아님, NOT_AVAILABLE · holdout forcing 미취득 → HOLDOUT_BLOCKED_FORCING(α* 동결 상태 유지).

## 14. 누출 방지 (LOCKED — 금지 목록)
holdout 결과를 본 뒤 α 선택 · 결과를 본 뒤 α 후보 변경 · 선택 지표 변경 · calibration/holdout 창 변경 · 불리한 드리프터 제거 · 공간 경계 변경 · forcing 변경 · 실패/유리한 α만 재실행 · 모델 실패 상태 재정의 · holdout 반복 실행 · Phase B 중 protocol 수정.

## 15. Forcing 정책 (LOCKED)
STEP 17 forcing 불변. Phase A 다운로드 없음. calibration은 취득본만 사용. holdout forcing(R1)은 α* 동결 commit 이후 별도 단계에서 STEP 17 규칙으로 취득. 부재 시 HOLDOUT_BLOCKED_FORCING. 대체 forcing 금지. GLORYS 사용 안 함.

## 16. 산출물·검증기
Phase A: 이 문서 · `docs/research/step20-preregistration.json` · `docs/research/step20-selection-rule-sha256.txt` · `tools/research/check_step20_preregistration.py` · `tools/research/derive_step20_holdout.py` · `docs/research/step20-holdout-derivation.json`. 검증기는 조상·α 집합·calibration/holdout 정의(derivation 파일과 대조)·선택 규칙·tie 규칙·지평·primary/secondary·층·소표본·이상치·누출·forcing·threshold 없음·기술 추론 정책·모델 실행 없음(data/research/step20 부재)을 문서 텍스트에서 파싱해 확인한다.

## 17. LOCK
Status PREREGISTRATION LOCKED (설계). 데이터 요구사항 상태 STEP20_DATA_REQUIREMENT_BLOCKED (R1, R2). Phase B는 별도 지시로만, 그리고 R1이 취득된 뒤 B-3/B-4를 진행한다. **Phase A에서 모델 실행 0회, 새 trajectory 0개, forcing 다운로드 0회.**
