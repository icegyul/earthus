# STEP 18b — MODEL / TRAJECTORY PROTOCOL REVISION (PREREGISTRATION)

Status: PREREGISTRATION LOCKED · created 2026-09-06T05:03:10Z · base commit 5607ac1a
Rule ID: **model-protocol-step18b-openloop-72h-alpha0007**
Supersedes for execution: STEP 18 (model-protocol-step18-openloop-72h-alpha0007), whose Phase B is permanently recorded as **MODEL_RUN_BLOCKED_PREFLIGHT, 0 / 8 runs executed, reason WIND_COVERAGE** (manifest docs/research/step18-model-manifest.json, SHA 02c859f9a079eb68826852589d4c6d313171bcad9b544406212abfe3651a61cb, commit 5607ac1a). STEP 18 is not rerun and not modified.

Immutable ancestry (변경 금지): STEP 15 (7091c5cb) → STEP 16 cohort (5bc3590b, 8581d234…) → STEP 17 forcing LOCK (551668ef, protocol db73ef67…, preregistration b4bad644…) → STEP 17 Phase B manifest (cc4d8c48, 591cc057…) → STEP 18 LOCK (d505cc5e, protocol 519b3d35…, preregistration f02b1737…, rule file 1a107b7e…) → STEP 18 Phase B BLOCKED (5607ac1a, manifest 02c859f9…).

이 문서는 실행 규약만 사전등록한다. **이 단계(Phase A)에서는 모델을 실행하지 않고 trajectory·metric·replay를 계산하지 않는다.** 결과 파일은 없다.

## 0. 목적과 변경 범위

STEP 18의 spec.area(위도 [−40, +40] × 해류 상자 경도)는 LOCK된 런타임 CHECK A(spec.area 네 모서리가 바람 상자 안에 있어야 함)를 통과하지 못했다. STEP 18b의 목적은 **실제 확보된 locked forcing coverage 안에서 동일한 trajectory model을 실행**하는 것이다. STEP 18 대비 바뀌는 것은 **spec.area(계산 영역) 한 가지뿐**이다. 모델·시간·보간·α·run 정의·출력 스키마·지표·실패 정책은 STEP 18 §2–§4, §6–§11과 동일하며 아래에 다시 고정한다. STEP 18의 ±40° domain rule은 삭제·수정하지 않고 status rule로 유지한다.

## 1. 입력 (LOCKED, STEP 18과 동일)

| 입력 | 파일 | SHA-256 |
|---|---|---|
| 코호트 (23기, KE 13 + AG 10) | docs/research/cohort-step16.json | 8581d2345fff4b792ad9a0e70d8fae9e7fca23e4ed0ce920e555233e85e38474 |
| forcing protocol | docs/research/step17-forcing-protocol.md | db73ef67d1a191d67b29d488805a3c9998a65bf70b80dffe15b40ed8eb041792 |
| forcing preregistration | docs/research/step17-preregistration.json | b4bad6447e8de801fa44ba5e51de161ddaee066638bebe11011b5d495e131378 |
| forcing manifest (STEP 17 Phase B) | docs/research/step17-forcing-manifest.json | 591cc05799da03e6bb604321d9e2b129a32a201112922c4d06823026a0b5ac86 |
| STEP 18 protocol (참조·불변) | docs/research/step18-model-protocol.md | 519b3d35bc13524b3e0a30f5521cd2e696ffecdceead58535b0c4959ac3bea2b |
| STEP 18 preregistration (참조·불변) | docs/research/step18-preregistration.json | f02b17379140c8d0f7304dc2f15d512341c089b6773d2b4f6021da382972ecf4 |
| STEP 18 model rule SHA file (참조·불변) | docs/research/step18-model-rule-sha256.txt | 1a107b7edd49844e01e881de46c4bef477ac7dae336beac431dbd6efafd1388c |
| STEP 18 BLOCKED manifest (계보) | docs/research/step18-model-manifest.json | 02c859f9a079eb68826852589d4c6d313171bcad9b544406212abfe3651a61cb |
| 관측(지표 전용) | data/research/step15/noaa-gdp-hourly-qc/ | observationSha256 22c0ecffc926d04f02ff2ed57be1bd2cc76c1c9048ac2d77a30a63c3bb2c0841 |

실행 단위 4개 = STEP 17 runUnits 그대로(KE-1 2010-05-11T12Z 8기 · KE-2 2010-06-30T12Z 5기 · AG-1 2015-04-23T12Z 9기 · AG-2 2015-04-26T12Z 1기). 방출 위치 = 코호트 파일의 t0 관측 위치(startLon/startLat). 드리프터 추가·제거·위치 수정 금지. **GLORYS는 쓰지 않는다.**

## 2. Forcing (LOCKED, STEP 17 그대로)

HYCOM GOFS 3.1 GLBv0.08 15 m 3 h(정규화 grid KE-1 649ebad5… · KE-2 1d597036… · AG-1 ee9af738… · AG-2 c53b91b4…) + NCEP-DOE R2 10 m 6 h(KE-1 ba15d729… · KE-2 ace5b1a5… · AG-1 be4e0605… · AG-2 073d3761…). 실행 시 forcingSha256·정규화 파일 SHA·grid SHA가 STEP 17 manifest와 일치해야 하며 불일치 시 실행하지 않는다. 새 forcing 다운로드 금지, STEP 17 forcing data 변경 금지. 결측 바람을 0으로 대체하지 않는다.

## 3. 계산 영역 (AREA RULE — STEP 18b에서 유일하게 바뀌는 항목)

- **spec.area = STEP 17 locked ocean forcing box**(manifest oceanDomain의 원값 그대로). 위도는 **실제 forcing coverage ∩ experiment domain [−40°, +40°]** 로 명시적으로 clip한다: south = max(box.south, −40), north = min(box.north, +40). STEP 17이 이미 위도를 [−40, 40]으로 절단했으므로 clip 결과는 box 값과 동일하지만, 규칙으로 명시한다.
- 즉 **model computation area = locked ocean forcing coverage ∩ experiment domain**.

| Run unit | computation area (west, east, south, north) | 바람 상자(참조) |
|---|---|---|
| KE-1 | 140.60959, 161.61974, 28.12786, 38.19472 | 137.60959, 164.61974, 25.12786, 41.19472 |
| KE-2 | 133.53249, 154.78535, 29.70784, 40.0 | 130.53249, 157.78535, 26.70784, 43.0 |
| AG-1 | 18.31773, 32.01394, −40.0, −32.13828 | 15.31773, 35.01394, −43.0, −29.13828 |
| AG-2 | 19.79639, 23.79639, −38.76674, −34.76674 | 16.79639, 26.79639, −41.76674, −31.76674 |

(AG-1 east 32.013940000000005 등 float 표현은 manifest 원값을 그대로 spec에 넣는다.)

- 바람 상자 = ocean box ±3.0°이므로 computation area의 네 모서리는 바람 상자 안에 있다(CHECK A 통과 근거; 취득 후 확인된 좌표에서 산술적으로 성립). 검증기가 이 포함 관계를 manifest 좌표로 확인한다.
- ±40° 규칙은 **global/domain status rule로 유지**한다: 입자가 위도 ±40°를 넘으면 OUT_OF_DOMAIN. computation area의 다른 경계(±40°가 아닌 위도 경계, 경도 경계)를 넘거나 forcing 격자·stencil이 무효이면 FORCING_UNAVAILABLE(STEP 18 §5의 정의: "domain 안이지만 forcing 없음").

| 상태 | 정의 | 런타임 status → 매핑 |
|---|---|---|
| **OUT_OF_DOMAIN** | 입자 위도가 [−40, +40] 밖으로 나감 | 런타임 OUT_OF_DOMAIN이며 종료 시점의 마지막 안전 위치가 위도 ±40° 경계에 있음(bisection 해상도 1e-6° 이내) |
| **FORCING_UNAVAILABLE** | computation area 안팎을 불문하고 그 시각·위치의 forcing이 없음: computation area의 ±40°가 아닌 경계 통과, forcing 격자 밖, null 노드, landMask 노드, 바람 상자·시간 밖 | MISSING_FORCING → FORCING_UNAVAILABLE; STRANDED → FORCING_UNAVAILABLE; 그 외 런타임 OUT_OF_DOMAIN → FORCING_UNAVAILABLE |

해당 상태가 발생한 출력 timestep에서 그 드리프터 run은 종료한다. 마지막 valid=true 위치는 직전 출력 timestep. 런타임의 경계 교차 샘플(step 내부 시각·마지막 안전 위치)은 valid=false, 매핑 status로 내보낸다. 드리프터는 제거하지 않고, 종료 이후 행은 만들지 않으며, 상태는 RUN A/B에서 독립이다. AG-1(t0 위도 −39.8까지)의 40°S 이남 이동은 OUT_OF_DOMAIN으로 그대로 기록한다. 방출점 preflight 실패는 STEP 18 §5와 같이 t0에서 FORCING_UNAVAILABLE 행 1개(valid=false)로 기록하고 run은 계속한다.

## 4. 모델 (LOCKED, STEP 18 §2와 동일)

`surface-passive-advection.v2.windage` 0.1.0(models_v2.py, V1 4-file 스냅샷 42e5886b… 불변, 코드 변경 없음). **dX/dt = U_ocean(15 m) + α · U_wind(10 m)**. 구면 지리 변환 dlon/dt = u/(R_deg·cos φ), dlat/dt = v/R_deg, R_deg = 1852 × 60 m/deg, **cos φ를 매 RK4 단계에서 현재 위도로 평가**(고정 km/deg 상수 금지). RK4 네 단계 모두에서 해류·바람 재보간 + α·U_wind. 15 m 층만, 수직 이동 없음. 확산·Stokes drift·수직 혼합·leeway·자료동화·nudging·관측 재설정 없음(open-loop).

## 5. 보간 (LOCKED)

공간 bilinear(HYCOM 0.08° 정규 격자, NCEP 원 가우시안 격자; 4-node stencil 전부 유효), 시간 linear(인접 frame). 금지: 외삽, regridding, 평활, 결측 0 대체, 육지 값, frame 복제.

## 6. 시간 (LOCKED, STEP 18 §3과 동일)

t0 → t0+72h, 마지막 출력 timestamp = 정확히 t0+72h. **출력·평가 시간 간격 = 900 s**, 289 샘플/드리프터. **RK4 내부 적분 간격 = 300 s**(출력 간격당 3 substep). 런타임 preflight grid-travel 상한(STEP 18에서 기록, 변경 없음): KE-1 655 s · KE-2 733 s · AG-1 579 s · AG-2 663 s — 300 s는 네 상한을 모두 만족한다. 상한을 맞추기 위한 파라미터 변경 금지.

## 7. 실행 정의 (LOCKED)

| run_id | α | 그 외 |
|---|---|---|
| **RUN A** = `step18-A-alpha0007` | 0.0007 | — |
| **RUN B** = `step18-B-alpha0` | 0 (control) | RUN A와 forcing·시간·보간·area·방출점·적분 간격 모두 동일 |

α는 STEP 17 preregistration alpha {primary 0.0007, control 0, locked}와 동일. 다른 α 금지. 사전계산된 α 실험 없음. 8 runtime calls, 고정 순서: 1 KE-1 A · 2 KE-1 B · 3 KE-2 A · 4 KE-2 B · 5 AG-1 A · 6 AG-1 B · 7 AG-2 A · 8 AG-2 B. 런타임 runId = `<run_id>-<windowId>`.

## 8. 출력 (LOCKED)

`data/research/step18b/<windowId>/<run_id>.trajectories.csv`(UTF-8, LF, header 1행, 정렬 drifter_id 문자열 오름차순 → timestamp 오름차순) + `<run_id>.result.json`(런타임 원 결과). **commit하지 않는다**(.gitignore `data/research/step18b/`).
열(고정): `run_id, drifter_id, timestamp, lat, lon, alpha, status, valid` — timestamp `YYYY-MM-DDTHH:MM:SSZ`, lat/lon 소수 6자리(lon −180..180), alpha `0.0007`/`0`, status ∈ {ACTIVE, COMPLETED, OUT_OF_DOMAIN, FORCING_UNAVAILABLE}, valid true = ACTIVE/COMPLETED. **velocity 열 금지.**

## 9. Replay (LOCKED)

8 run 완료 후 각 run을 동일 입력으로 별도 프로세스(`python -m research_runtime.cli_v2 replay` bundle)에서 deterministic replay한다. result array SHA-256 동일 → replayMatched = true; 불일치 → 그 run MODEL_RUN_FAIL.

## 10. Manifest (LOCKED)

`docs/research/step18b-model-manifest.json`(commit 대상). 필수: ruleId(STEP 18b), step18BlockedRun {manifest SHA 02c859f9…, commit 5607ac1a, status MODEL_RUN_BLOCKED_PREFLIGHT, reason WIND_COVERAGE, runsExecuted 0/8}, step18ProtocolSha256, step18PreregistrationSha256, step18ModelRuleSha256, step18bProtocolSha256, step18bPreregistrationSha256, step18bModelRuleSha256, forcingManifestSha256, aggregateForcingSha256, cohortSha256, observationSha256, modelId/modelVersion/modelSourceSha256/modelCommit/environment, model parameters(integrationStepSeconds 300, outputStepSeconds 900, durationSeconds 259200), runs[] (runId, windowId, alpha, drifterCount, computationArea(clipped), datasetVersions, windDataset, forcingSha256, gridSha256, windGridSha256, resultFile, resultSha256, trajectoriesFile, trajectoriesSha256, rows, statusCounts, replayMatched), outputSchema, metrics, status, replayMatched(전체), createdAtUTC, deterministic true, randomSeed null.

## 11. 지표 (LOCKED, STEP 18 §9와 동일)

haversine 반지름 6371008.8 m, km. 관측 = STEP 15 hourly QC, drifter ID·정확한 UTC 일치(보간 없음), 없으면 NOT_AVAILABLE.

| 지표 | 정의 |
|---|---|
| M1 72 h endpoint displacement | 방출점 → t0+72h 모델 위치; t0+72h가 valid가 아니면 NOT_AVAILABLE |
| M2 total trajectory displacement | valid=true 연속 출력점 거리 합(마지막 valid 점까지) + 유효 구간 길이(h) |
| M3 position error | 관측 vs 모델, 관측이 있는 정각 시각마다; 24/48/72 h 별도 표기 |
| M4 α 효과 | 같은 시각 두 run 모두 valid일 때 RUN A vs RUN B 거리; M3(72 h) 짝차이 A−B |
| M5 관측 72 h 변위 | 관측 방출점 → 관측 t0+72h 위치 |

집계: run별·run unit별·전체 n·median·mean·min·max. **판정 기준(PASS/FAIL 임계값)은 이 protocol에서 두지 않는다.** 시간 중첩은 **통계 독립성을 보장하지 않는다**(n=23은 독립 표본 수가 아님). 결정론 모델이므로 **신뢰구간은 산출하지 않는다.** 사후 지표 추가 금지.

## 12. 실패 정책 (LOCKED, STEP 18 §10과 동일)

입력 SHA 불일치 → MODEL_RUN_BLOCKED_IMMUTABILITY(실행 없음) · preflight 오류 → MODEL_RUN_BLOCKED_PREFLIGHT(실행 없음, 파라미터 변경 금지) · 런타임 예외 → MODEL_RUN_FAIL(부분 출력 보존, 동일 입력 재시도 1회) · replay 불일치 → MODEL_RUN_FAIL · 조기 종료 = 실패 아님 · 8 run 완료 + replay 일치 → MODEL_RUN_PASS(궤적 산출 성공; 검증 PASS 아님).

## 13. 금지

결과를 본 뒤 α·적분 간격·area·상태 규칙·지표·출력 스키마 변경. 드리프터 제외·추가. 관측으로 모델 교정. 여러 설정 실행 후 선택. α 스캔. STEP 15/16/17/18 파일 수정. STEP 18 재실행. forcing 재취득. 결과 파일 commit. 자격증명 commit. 결측 바람 0 대체.

## 14. 검증기

`tools/research/check_step18b_model_preregistration.py`: 이 문서·preregistration JSON·SHA 파일의 상호 참조, 조상 SHA·commit(STEP 17·18 불변, STEP 18 BLOCKED manifest), computation area = STEP 17 oceanDomain(위도 clip 규칙 포함)과 바람 상자 포함 관계, α, 시간 간격·상한, 상태 어휘·매핑, 출력 스키마, 지표, 실행 없음(data/research/step18b 부재, manifest 부재)을 확인한다. 상수는 문서 텍스트에서 파싱하며 PASS를 손으로 쓰지 않는다. 0 failures가 아니면 Phase B를 실행하지 않는다.

## 15. LOCK

Status PREREGISTRATION LOCKED. 다음 단계 "STEP 18b — PHASE B: MODEL RUN"은 별도 지시로만 시작한다. **이 단계에서 모델 실행·trajectory·metric·replay·결과 파일 생성은 하지 않았다.**
