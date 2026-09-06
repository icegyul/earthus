# STEP 18 — MODEL / TRAJECTORY PROTOCOL (PREREGISTRATION)

Status: PREREGISTRATION LOCKED · created 2026-09-06T04:37:07Z · base commit cc4d8c48
Rule ID: **model-protocol-step18-openloop-72h-alpha0007**
Parent chain (변경 금지): STEP 15 (7091c5cb) → STEP 16 cohort (5bc3590b, cohort file 8581d234…) → STEP 17 forcing LOCK (551668ef, protocol db73ef67…, preregistration b4bad644…) → STEP 17 Phase B forcing manifest (cc4d8c48, manifest 591cc057…, aggregateForcingSha256 01acda6b…).

이 문서는 모델 실행 규약만 사전등록한다. **이 단계에서는 모델을 실행하지 않고 trajectory를 계산하지 않는다.** 결과 파일은 없다. 실행은 별도 지시("STEP 18 — PHASE B")가 있을 때만 한다.

## 0. 원칙

- 모델·시간 간격·보간·상태 규칙·지표는 결과를 보기 전에 여기서 고정한다. 결과를 본 뒤 바꾸지 않는다. 바꾸려면 새 Rule ID.
- 입력은 STEP 16 코호트 파일과 STEP 17 Phase B 취득 forcing뿐이다. 관측 궤적은 지표 계산에만 쓰며 모델은 관측을 보지 않는다(open-loop).
- 난수 없음. 동일 입력 → 동일 출력(SHA-256 일치)이어야 한다.

## 1. 입력 (LOCKED)

| 입력 | 파일 | SHA-256 |
|---|---|---|
| 코호트 (23기, KE 13 + AG 10) | docs/research/cohort-step16.json | 8581d2345fff4b792ad9a0e70d8fae9e7fca23e4ed0ce920e555233e85e38474 |
| forcing protocol | docs/research/step17-forcing-protocol.md | db73ef67d1a191d67b29d488805a3c9998a65bf70b80dffe15b40ed8eb041792 |
| forcing preregistration | docs/research/step17-preregistration.json | b4bad6447e8de801fa44ba5e51de161ddaee066638bebe11011b5d495e131378 |
| forcing manifest (Phase B) | docs/research/step17-forcing-manifest.json | 591cc05799da03e6bb604321d9e2b129a32a201112922c4d06823026a0b5ac86 |
| 관측(지표 전용) | data/research/step15/noaa-gdp-hourly-qc/ (176 files) | observationSha256 22c0ecffc926d04f02ff2ed57be1bd2cc76c1c9048ac2d77a30a63c3bb2c0841 |

실행 단위 4개 = STEP 17 runUnits 그대로. 방출 위치 = 코호트 파일의 각 드리프터 t0 관측 위치(startLon/startLat). 드리프터 추가·제거·위치 수정 금지.

| Run unit | t0 (UTC) | 종료 | 드리프터 | 해류 domain (STEP 17 locked) |
|---|---|---|---|---|
| KE-1 | 2010-05-11T12:00:00Z | 2010-05-14T12:00:00Z | 8 | S 28.12786 N 38.19472 W 140.60959 E 161.61974 |
| KE-2 | 2010-06-30T12:00:00Z | 2010-07-03T12:00:00Z | 5 | S 29.708 N 40.0 W 133.532 E 154.785 |
| AG-1 | 2015-04-23T12:00:00Z | 2015-04-26T12:00:00Z | 9 | S −40.0 N −32.138 W 18.318 E 32.014 |
| AG-2 | 2015-04-26T12:00:00Z | 2015-04-29T12:00:00Z | 1 | S −38.767 N −34.767 W 19.796 E 23.796 |

(KE-2·AG-1·AG-2 좌표는 manifest 값을 소수 3자리로 표기한 것이며, 실행 시에는 manifest의 원값을 그대로 쓴다. preregistration JSON에 원값을 복사해 두었다.)

Forcing = HYCOM GOFS 3.1 15 m 3 h(정규화 grid: KE-1 649ebad5… · KE-2 1d597036… · AG-1 ee9af738… · AG-2 c53b91b4…) + NCEP-DOE R2 10 m 6 h(KE-1 ba15d729… · KE-2 ace5b1a5… · AG-1 be4e0605… · AG-2 073d3761…). 각 실행 단위의 forcingSha256·정규화 파일 SHA는 manifest 값과 일치해야 하며 불일치 시 실행하지 않는다. **GLORYS는 쓰지 않는다** (BLOCKED/PENDING; 대체 없음).

## 2. 모델 (LOCKED)

- 모델 구현: `surface-passive-advection.v2.windage` 0.1.0 (services/research-runtime/research_runtime/models_v2.py, V1 4-file 스냅샷 42e5886b… 불변). 코드 변경 없음. 실행 시 modelCommit(git HEAD)과 모델 소스 스냅샷 SHA를 manifest에 기록한다.
- 운동 방정식: **dX/dt = U_ocean(15 m) + α · U_wind(10 m)**. 두 성분을 m/s로 더한 뒤 위치 변화율로 바꾼다.
- 좌표 변환: 구면 지리 변환. dlon/dt = u / (R_deg · cos φ), dlat/dt = v / R_deg, R_deg = 1852 × 60 m/deg(OceanParcels Geographic 규약, models.py METERS_PER_DEGREE). 고정 km/deg 상수 사용 금지 — 위도에 따른 cos φ를 매 RK4 단계에서 현재 위도로 평가한다.
- 적분: RK4. 네 단계 모두에서 해류와 바람을 각 단계의 시각·위치로 다시 보간하고 α·U_wind를 더한다(AdvectionRK4Windage; Python oracle과 OceanParcels 커널 이중 계산, 경계 guard 동일).
- 연직: 15 m 층 하나만. 수직 이동 없음.
- 포함하지 않는 물리: 확산·난수 걷기, Stokes drift, 수직 혼합, leeway 각도, 자료동화·nudging·관측 위치 재설정. **어떤 시점에도 관측으로 모델 위치를 교정하지 않는다.**

## 3. 시간 (LOCKED)

- 시작 t0 = 창 시작 12Z. 종료 = t0 + 72 h. 마지막 출력 timestamp = 정확히 t0+72h.
- **출력·평가 시간 간격 = 900 s (15분)**. 출력 샘플 = 289개/드리프터(t0 포함). 15분은 관측(1 h)보다 촘촘하므로 관측이 없는 15분 시각의 관측 비교 지표는 NOT_AVAILABLE이다.
- **RK4 내부 적분 간격 = 300 s** (출력 간격당 3 substep, 900 = 3 × 300 정확히 나눔). 사유(설계 시점, 결과 무관): LOCK된 런타임 preflight(models.py, V1 불변 소스)는 `integrationStepSeconds ≤ floor(min_grid_m / (4 · max_speed))`를 강제한다. STEP 17 Phase B 정규화 forcing의 최대 속력과 격자 간격에서 이 상한은 KE-1 655 s · KE-2 733 s · AG-1 579 s · AG-2 663 s이며 900 s는 네 창 모두에서 거부된다. 900 s를 적분 간격으로 쓰려면 불변 런타임 소스를 바꾸거나 guard를 우회해야 하므로 허용하지 않는다. 300 s는 런타임 기본값이자 STEP 11(V1·V2 실행)과 동일한 값이며 네 상한 모두를 만족한다. 따라서 "DT = 900 s"는 출력·평가·상태 판정의 timestep으로 적용하고, 수치 적분은 그 안을 300 s로 균등 분할한다. 이 분할은 결과를 보고 바꾸지 않는다.
- 상태 판정·종료는 출력 timestep(900 s) 단위로 기록한다(§5).

## 4. 보간 (LOCKED)

- 공간: bilinear(해류는 HYCOM 0.08° 정규 격자, 바람은 NCEP 원 가우시안 격자). 4-node stencil 전부가 유효(wet, non-null)해야 값을 쓴다.
- 시간: 인접 두 frame 사이 linear. 외삽 없음.
- 금지: 격자 재구성(regridding), 평활, 결측 0 대체, 육지 값 사용, frame 복제, 외삽. 이 금지는 STEP 17 reader 정책과 동일하며 런타임이 강제한다(null → MISSING_FORCING, landMask → STRANDED).

## 5. 영역과 상태 (LOCKED)

모델 domain = 위도 **[−40°, +40°]** × 경도 **해당 실행 단위의 locked 해류 forcing domain [west, east]**. 런타임 spec의 `area`를 이 값으로 둔다.

두 상태만 쓴다. 판정은 각 출력 timestep에서 한다.

| 상태 | 정의 | 런타임 내부 status(변경 불가) → 매핑 |
|---|---|---|
| **OUT_OF_DOMAIN** | 입자가 모델 domain 밖으로 나감(위도가 [−40, 40] 밖, 또는 경도가 locked 해류 domain 밖) | OUT_OF_DOMAIN → OUT_OF_DOMAIN |
| **FORCING_UNAVAILABLE** | 입자는 domain 안에 있으나 그 시각·위치의 forcing stencil이 유효하지 않음: forcing 격자 범위 밖(해류 domain의 위도 경계 등), null 노드, landMask 노드, 바람 상자·시간 밖 | MISSING_FORCING → FORCING_UNAVAILABLE; STRANDED → FORCING_UNAVAILABLE(육지 stencil은 "forcing 없음"으로 취급하며 좌초로 해석하지 않는다); 런타임이 forcing 격자 밖을 OUT_OF_DOMAIN으로 던지더라도 입자 위치가 모델 domain 안이면 FORCING_UNAVAILABLE로 기록 |

규칙:
- 해당 상태가 발생한 출력 timestep에서 그 드리프터 run은 종료한다. 마지막 유효 위치(valid=true)는 직전 출력 timestep의 위치다. 런타임이 경계 교차점(step 내부 시각·근사 위치)을 추가로 기록하면 그 샘플은 valid=false, status=매핑된 종료 상태로 내보낸다.
- 드리프터를 코호트에서 제거하지 않는다. 종료 이후 timestamp의 행은 만들지 않는다(출력 행 수 < 289 가능). 지표는 유효 구간만으로 계산하고 없는 지평은 NOT_AVAILABLE.
- 상태는 RUN A(α=0.0007)와 RUN B(α=0)에서 독립으로 판정한다. 한 run의 종료가 다른 run에 영향을 주지 않는다.
- AG-1: t0 위도 −39.8까지 있으므로 40°S 이남 이동 시 OUT_OF_DOMAIN이 발생할 수 있다. 예외 처리 없이 그대로 기록한다. AG-1 해류 domain 남쪽 경계가 −40.0이므로 위도 −40 이남은 OUT_OF_DOMAIN이다. KE-1·KE-2·AG-2는 해류 domain 위도 폭이 [−40, 40]보다 좁으므로 위도 방향으로 forcing 격자를 벗어나면 FORCING_UNAVAILABLE이다.
- 방출점 preflight 실패(t0 stencil 무효)는 그 드리프터를 t0에서 FORCING_UNAVAILABLE로 기록하고(행 1개, valid=false) run은 계속한다. STEP 17 QC에서 23기 모두 t0 stencil이 유효했으므로 발생하면 forcing 불일치로 간주하고 원인을 manifest에 적는다.

## 6. 실행 정의 (LOCKED)

| run_id | α | 그 외 |
|---|---|---|
| **RUN A** = `step18-A-alpha0007` | 0.0007 | — |
| **RUN B** = `step18-B-alpha0` | 0 (control) | RUN A와 forcing·시간·보간·domain·방출점·적분 간격 모두 동일 |

α 값은 STEP 17 preregistration의 alpha {primary 0.0007, control 0, locked}와 동일. 다른 α 실행 금지. 사전계산된 α 실험 없음. 실행은 4 run unit × 2 run = 8회 런타임 호출이며 순서는 KE-1, KE-2, AG-1, AG-2 각각 A 다음 B로 고정한다.

## 7. 출력 (LOCKED)

- 위치: `data/research/step18/` 아래. **commit하지 않는다**(.gitignore에 `data/research/step18/` 추가). commit 대상은 manifest·검증 결과 메타데이터만.
- 파일: run unit·run별 `data/research/step18/<windowId>/<run_id>.trajectories.csv` (UTF-8, LF, header 1행, 행 정렬 = drifter_id 문자열 오름차순 → timestamp 오름차순). 런타임의 원 결과 JSON도 `<run_id>.result.json`으로 같이 저장한다.
- 열(고정, 이 순서): `run_id, drifter_id, timestamp, lat, lon, alpha, status, valid`
  - timestamp ISO-8601 UTC `YYYY-MM-DDTHH:MM:SSZ`; lat/lon 소수 6자리(WGS84, lon −180..180); alpha 문자열 그대로(`0.0007` / `0`); status ∈ {ACTIVE, COMPLETED, OUT_OF_DOMAIN, FORCING_UNAVAILABLE}; valid ∈ {true, false}. valid=true = 그 timestamp에 유효한 모델 위치(ACTIVE·COMPLETED). 종료 상태 행은 valid=false.
- 선택 열(`u_ocean, v_ocean, u_wind, v_wind, u_total, v_total`)은 **포함하지 않는다.** 런타임 결과에는 속도가 없고, 사후에 forcing을 다시 평가해 덧붙이는 것은 "derived" 값이므로 이번 protocol에서는 제외한다(제외를 지금 확정).
- 각 파일의 SHA-256과 행 수를 manifest에 기록한다.

## 8. Manifest (LOCKED)

`docs/research/step18-model-manifest.json` (commit 대상). 필드: ruleId, status, protocolSha256, preregistrationSha256, modelRuleSha256(= step18-model-rule-sha256.txt 내용), cohortSha256, forcingManifestSha256, aggregateForcingSha256, observationSha256, modelId/modelVersion, modelSourceSha256(V1 42e5886b… + V2 스냅샷), modelCommit, environment(python, oceanparcels 3.1.4, numpy), runs[] (run_id, windowId, alpha, drifterCount, integrationStepSeconds 300, outputStepSeconds 900, durationSeconds 259200, area, datasetVersions, windDataset, forcingSha256, gridSha256, windGridSha256, resultFile, resultSha256, trajectoriesFile, trajectoriesSha256, rows, statusCounts, replayMatched), outputSchema(§7 열 정의), metrics(§9), createdAtUTC, deterministic true, randomSeed null.
- 재현성: 각 run은 두 번 실행(두 번째는 별도 프로세스 replay)하여 trajectories SHA-256이 일치해야 한다(replayMatched). 불일치 → 그 run은 MODEL_RUN_FAIL(결과 보존, 수정 금지).

## 9. 지표 (LOCKED — 실행 전 고정)

거리 = haversine, 반지름 6371008.8 m(`research_runtime.validation` 동일 상수), km 보고. 관측 = STEP 15 hourly QC 파일에서 drifter ID·정확한 UTC 일치 시각의 위치(보간 없음). 관측이 없는 시각 → NOT_AVAILABLE.

| 지표 | 정의 | 단위 |
|---|---|---|
| M1 72 h endpoint displacement | 방출점 → t0+72h 모델 위치 거리. t0+72h가 valid가 아니면 NOT_AVAILABLE | km |
| M2 total trajectory displacement | valid=true 연속 출력점 사이 거리의 합(마지막 valid 점까지). 유효 구간 길이(h)도 함께 기록 | km, h |
| M3 position error | 관측 위치 vs 모델 위치, 관측이 있는 정각 시각마다; 지평 24/48/72 h를 별도 표기. 모델이 그 시각에 valid가 아니거나 관측이 없으면 NOT_AVAILABLE | km |
| M4 α 효과 | 같은 시각에 두 run 모두 valid인 경우 RUN A vs RUN B 위치 거리; 그리고 M3(72 h)의 짝차이 A−B (둘 다 있을 때만) | km |
| M5 관측 72 h 변위 | 관측 방출점 → 관측 t0+72h 위치(참고, 코호트 A2와 대조) | km |

집계: run별·run unit별·전체(23기) n·median·mean·min·max. 짝지표는 같은 드리프터만. **판정 기준(PASS/FAIL 임계값)은 이 protocol에서 두지 않는다** — STEP 18은 궤적 산출·기술 통계 단계이며, 수용 판정은 STEP 12 validation plan의 K1~K5를 수치 고정한 별도 사전등록(validation-plan-v3) 이후에만 한다. 이 지표 목록에 사후 지표를 추가하지 않는다.
- 통계 해석 주의: 같은 창 안 드리프터들과 KE-1/KE-2·AG-1/AG-2의 시간 중첩은 표본의 **통계 독립성을 보장하지 않는다**. n=23은 독립 표본 수로 해석하지 않는다.
- 결정론 모델이므로 모델 자체의 신뢰구간은 산출하지 않는다(부트스트랩 등 표본 불확실성은 이 단계에서 계산하지 않음).

## 10. 실패 정책 (LOCKED)

| 상황 | 처리 |
|---|---|
| 입력 SHA 불일치(코호트·protocol·prereg·manifest·정규화 파일·forcing 원본) | 실행하지 않음 → MODEL_RUN_BLOCKED_IMMUTABILITY |
| preflight 오류(적분 간격 상한·자원 한도·wind coverage) | 실행하지 않음, 오류 문자열 기록 → MODEL_RUN_BLOCKED_PREFLIGHT; 상한을 맞추기 위한 파라미터 변경 금지 |
| 런타임 예외(비유한 값, 경계 guard 불일치, ledger 오류) | 그 run MODEL_RUN_FAIL, 부분 출력 삭제하지 않고 보존, 재시도는 동일 입력으로 1회만 |
| replay 해시 불일치 | MODEL_RUN_FAIL(재현성) |
| 드리프터 조기 종료(OUT_OF_DOMAIN / FORCING_UNAVAILABLE) | 실패 아님. 그대로 기록, 지표 NOT_AVAILABLE |
| 8 run 모두 완료 + replay 일치 | MODEL_RUN_PASS(궤적 산출 성공을 뜻하며 검증 PASS가 아님) |

## 11. 금지

- 결과를 본 뒤 α·적분 간격·domain·상태 규칙·지표·출력 스키마 변경. 드리프터 제외·추가. 관측으로 모델 교정. 여러 설정을 돌려 고르기. 사전계산된 α 스캔. STEP 15/16/17 파일 수정. forcing 재취득. 결과 파일 commit. 자격증명 commit.

## 12. 검증기

`tools/research/check_step18_model_preregistration.py`: 이 문서·preregistration JSON·SHA 파일의 상호 참조, 부모 SHA·commit, α, 시간 간격, domain, 상태 어휘, 출력 스키마, 지표 목록, "실행 없음"(data/research/step18 부재)을 확인한다. 임계값·상수는 문서에서 파싱하며 PASS를 손으로 쓰지 않는다.

## 13. LOCK

Status PREREGISTRATION LOCKED. 다음 단계 "STEP 18 — PHASE B: MODEL RUN"은 별도 지시로만 시작한다. **이 단계에서 모델 실행·trajectory 계산·결과 파일 생성은 하지 않았다.**
