# STEP 19 — INDEPENDENT MODEL EVALUATION PROTOCOL (PREREGISTRATION)

Status: PREREGISTRATION LOCKED · created 2026-09-06T05:34:40Z · base commit a9225f77
Rule ID: **evaluation-protocol-step19-paired-ab-24-48-72h**
Evaluates: STEP 18b (model-protocol-step18b-openloop-72h-alpha0007) Phase B result — MODEL_RUN_PASS, 8/8 runs, 23/23 drifters COMPLETED to t0+72h, replay 8/8 matched, runtime validator 0 failures.

Immutable ancestry (변경 금지): STEP 16 cohort (5bc3590b, 8581d234…) → STEP 17 forcing manifest (cc4d8c48, 591cc057…) → STEP 18 LOCK (d505cc5e) / BLOCKED (5607ac1a) → STEP 18b LOCK (5b9567e5; protocol 73e8aa14…, preregistration 02935e81…, rule 7e9ab639…) → STEP 18b runner (75020d98) → STEP 18b manifest (a9225f77, 923fd1ba…).

이 문서는 평가 규약만 사전등록한다. **이 단계(Phase A)에서는 분석·통계·그래프·해석을 하지 않는다.** 새 trajectory·새 forcing·α 변경·모델 변경·재실행은 없다.

## 0. 목적

STEP 18b가 이미 생성한 RUN A(α=0.0007)와 RUN B(α=0)의 trajectory를 **독립적으로 다시 계산**하여 짝지어 비교한다. "독립"이란 STEP 18b manifest에 기록된 지표 값을 믿지 않고, trajectory CSV와 관측 원파일에서 지표를 다시 계산하고 manifest 값과 대조한다는 뜻이다. 결과를 보고 acceptance threshold를 만들지 않는다. 이 protocol에는 PASS/FAIL 판정 기준이 없다.

## 1. 입력 (LOCKED)

| 입력 | 파일 | SHA-256 |
|---|---|---|
| STEP 18b protocol | docs/research/step18b-model-protocol.md | 73e8aa1405aa82c6ae283962f8efaabdfa5331a5dc6109471b1e6bd0ebf813bc |
| STEP 18b preregistration | docs/research/step18b-preregistration.json | 02935e81e9c93690078ff96231c74ad51c86dfaffa89bfa17a2e2ba082306316 |
| STEP 18b rule SHA file | docs/research/step18b-model-rule-sha256.txt | 7e9ab639f0c36ca747ff5f292f2c78eaa3eaae8da078311ce26f76e964bc49eb |
| STEP 18b manifest | docs/research/step18b-model-manifest.json | 923fd1ba69438da0a6bbd02495705b4dccce229d606a199b0498c6d80d6aaefe |
| STEP 17 forcing manifest | docs/research/step17-forcing-manifest.json | 591cc05799da03e6bb604321d9e2b129a32a201112922c4d06823026a0b5ac86 |
| STEP 16 cohort | docs/research/cohort-step16.json | 8581d2345fff4b792ad9a0e70d8fae9e7fca23e4ed0ce920e555233e85e38474 |
| 관측 | data/research/step15/noaa-gdp-hourly-qc/ | observationSha256 22c0ecffc926d04f02ff2ed57be1bd2cc76c1c9048ac2d77a30a63c3bb2c0841 |
| trajectory CSV 8개 + result.json 8개 | data/research/step18b/<window>/ | manifest runs[].trajectoriesSha256 / resultSha256 (preregistration JSON에 복사) |

분석 전에 16개 결과 파일의 SHA-256을 manifest와 대조한다. 하나라도 불일치 → **EVALUATION_BLOCKED_RESULT_INTEGRITY**, 분석하지 않는다. STEP 18b model commit 75020d98, manifest commit a9225f77.

## 2. 비교 설계 (LOCKED)

- Primary comparison: **RUN A (α=0.0007) vs RUN B (α=0)**, 같은 드리프터끼리 짝지음. 각 드리프터가 하나의 짝 관측이다.
- 지평: **24 h · 48 h · 72 h**, 각각 따로. 시각 일치 = 정확한 UTC timestamp 일치만(관측은 정각, 모델 출력은 900 s 격자이므로 t0+24/48/72h는 양쪽에 존재). 관측 보간 없음(STEP 18b와 동일).
- 23기는 통계적으로 독립이 아니다: 같은 창(KE-1 8기, KE-2 5기, AG-1 9기)의 드리프터는 forcing과 시간을 공유하고, KE-1/KE-2·AG-1/AG-2는 같은 해역·같은 forcing 제품이다. 이를 감추지 않기 위해 unit별 층화 보고를 의무화하고, 독립 표본을 가정하는 검정을 primary로 쓰지 않는다.

## 3. Primary error (LOCKED)

M3(관측-모델 위치 오차, km, haversine 반지름 6371008.8 m). 드리프터 d, 지평 h에 대해
- error_A(d,h) = dist(obs(d, t0+h), model_A(d, t0+h)); error_B 동일.
- **delta(d,h) = error_A − error_B**. delta < 0: A가 오차 낮음. delta > 0: B가 오차 낮음. delta = 0: tie.
- tie 판정: |delta| ≤ 1e-6 km(부동소수 잡음 허용, 1 mm). "win" = 그 짝에서 오차가 **엄격히** 낮음.
- 관측 또는 모델 위치가 없으면 그 짝·지평은 NOT_AVAILABLE로 표시하고 짝 통계에서 제외하되 제외 수를 보고한다(STEP 18b 결과에서는 23/23 모두 72 h까지 valid이며 관측 73샘플이므로 예상 제외 0; 실제 수는 계산 후 기록).
- 완전한 짝 분포를 보고하기 전에는 어느 쪽도 "better"라고 부르지 않는다. Phase B 산출물에서도 "A lower error / B lower error / tie"의 계수와 분포만 기술한다.

## 4. Secondary metrics (LOCKED, 정의는 STEP 18b preregistration §metrics 그대로)

- M1 72 h endpoint displacement(방출점 → 모델 t0+72h 위치), run별.
- M2 total trajectory displacement(valid 연속 출력점 거리 합), run별.
- M4 A-B separation at 72 h(두 run의 t0+72h 위치 거리).
- M5 observed 72 h displacement(관측 방출점 → 관측 t0+72h 위치).
정의 변경 금지. STEP 18b manifest의 M1/M2/M4/M5 및 M3(24/48/72) 값과 재계산 값을 대조하여 |차이| ≤ 0.001 km(반올림 자릿수)이면 CONSISTENT, 아니면 INCONSISTENT로 기록(불일치는 조사 대상이며 값을 고치지 않는다).

## 5. 요약 통계 (LOCKED)

- 각 metric/horizon/run: **n, median, mean, min, max**.
- 짝 차이 delta(각 지평): **median delta, mean delta, min delta, max delta**, 그리고 **A wins / B wins / ties**.
- median = 짝수 n이면 중앙 두 값의 평균. 반올림은 보고 시 소수 3자리(km), 계산은 double.
- 전체(23) + **unit별 층화**(KE-1, KE-2, AG-1, AG-2): 각 unit·지평마다 n, median A, median B, median delta, A wins, B wins, ties. Unit 결과를 pooling해서 숨기지 않는다. AG-2는 n=1로 그대로 보인다.

## 6. Outlier transparency (LOCKED)

제거·winsorize·trim·관측 대체 금지. AG-2 제거 금지. 큰 오차 드리프터 제거 금지. 대신 영향을 명시적으로 보고한다:
- 각 지평에서 error_A 상위 3개 드리프터(ID, unit, error_A, error_B, delta)를 나열.
- **Leave-one-out 영향표(기술 통계, 판정 아님)**: 각 드리프터를 하나씩 뺐을 때 전체 median delta와 A wins/B wins/ties가 어떻게 되는지 23행으로 보고. 이는 어떤 드리프터도 제거하지 않는다는 뜻이며, 결과 표에서 어떤 행도 삭제하지 않는다.

## 7. 분포 표 (LOCKED)

`docs/research/step19-paired-table.csv`(commit 대상, 23행, drifter_id 문자열 오름차순), 열 정확히:
`drifter_id, unit, error_A_24h, error_B_24h, delta_24h, error_A_48h, error_B_48h, delta_48h, error_A_72h, error_B_72h, delta_72h, endpoint_A_72h, endpoint_B_72h, A_B_separation_72h, path_A, path_B, observed_72h`
값은 km 소수 3자리, 없으면 `NOT_AVAILABLE`. 어떤 드리프터도 조용히 빠지지 않는다(행 수 = 23을 검증기가 확인).

## 8. 통계적 추론 (LOCKED)

- Primary 산출물은 **기술적 짝 분석**(§3–§7)이다. 독립표본 t-검정 금지. 독립 가정 금지. 신뢰구간 산출 금지(이 protocol에 CI 방법이 사전등록되어 있지 않다).
- 선택적 **탐색적** 검정 하나만 허용하며 "EXPLORATORY"로 명확히 표기한다: 각 지평에서 delta의 부호에 대한 **양측 정확 부호검정**(tie 제외, 이항 n = A wins + B wins, p = 0.5). p-값은 보고만 하고 어떤 임계값도 acceptance criterion으로 쓰지 않는다. 이 검정도 짝 사이 독립을 가정하므로 §2의 의존 구조 때문에 명목 p-값은 과신할 수 없음을 결과에 같이 적는다. 탐색적 검정은 primary 결과를 바꾸지 않는다.
- p-value threshold·유의성 문구("significant") 도입 금지.

## 9. 사후 수정 금지

α 변경·탐색·최적화 금지. forcing·보간·모델 변경 금지. STEP 18b trajectory 재생성 금지. 결과를 보고 지표·지평·tie 허용치·표 열·층화 방식 변경 금지. 변경은 새 Rule ID로만.

## 10. Phase B 산출물

- `tools/research/evaluate_step19.py`: 입력 SHA 검증 → 관측 로드 → 재계산 → 표·요약·leave-one-out·탐색적 부호검정 → `docs/research/step19-evaluation.json` + `docs/research/step19-paired-table.csv`. 난수 없음.
- `docs/research/step19-evaluation.json` 필수 필드: ruleId, protocolSha256, preregistrationSha256, evaluationRuleSha256, step18bManifestSha256, inputFileShas(16개, verified true), observationSha256, cohortSha256, status(EVALUATION_COMPLETE / EVALUATION_BLOCKED_RESULT_INTEGRITY), horizons, pairs(n, notAvailable per horizon), summary(overall/per-unit, §5), paired(§3 wins), topErrors(§6), leaveOneOut(§6), manifestConsistency(§4), exploratorySignTest(§8, label "EXPLORATORY"), interpretation "NONE", createdAtUTC, tableSha256.
- `tools/research/check_step19_evaluation_run.py`: 표 행 수 23·열·NOT_AVAILABLE 규칙·요약 재계산 일치·wins+ties 합·manifest 일치 기록·해석 없음 확인.
- 그래프는 이 protocol의 산출물이 아니다(만들지 않는다).

## 11. 검증기

`tools/research/check_step19_evaluation_preregistration.py`: 이 문서·preregistration JSON·SHA 파일의 상호 참조, 조상 SHA·commit, 16개 결과 파일 SHA = manifest, 지평·tie 허용치·표 열·통계 항목·금지 사항을 문서 텍스트에서 파싱해 JSON과 대조, 분석 산출물 부재(step19-evaluation.json·paired-table.csv 없음)를 확인한다. PASS를 손으로 쓰지 않는다.

## 12. LOCK

Status PREREGISTRATION LOCKED. 다음 단계 "STEP 19 — PHASE B: EVALUATION"은 별도 지시로만 시작한다. **이 단계에서 분석·통계·그래프·해석은 하지 않았다.**
