# STEP 17 — FORCING DATA PROTOCOL (PREREGISTRATION DRAFT)

Status: PREREGISTRATION LOCKED · created 2026-09-06T04:07:12Z · base commit 5bc3590b
Rule ID: **forcing-protocol-step17-hycom15m-ncep10m-primary**
Parent: STEP 16 cohort (COHORT_SELECTION_PASS, KE 13 + AG 10 = 23기, rule SHA e9e2c1ca…, selectionHash 4b13c3ab…, cohort file 8581d234…) — 변경 금지. STEP 15 (7091c5cb) 불변.

이 문서는 forcing 취득·변환·검증 규약만 정한다. 모델·검증 계획(수용 기준)은 별도 STEP에서 사전등록한다. **강제력 파일은 아직 취득하지 않았고, 모델은 실행하지 않는다.**

## 0. 원칙

- 강제력 선택은 STEP 16 코호트(23기)를 본 뒤 유리하게 고르지 않는다. 아래 우선순위(물리 적합성 → 해상도 → 기간 coverage → 재현성 → 품질 → provenance → 접근 안정성 → 비용)로 결정하며, 이 문서가 LOCK된 뒤에만 취득한다.
- 특정 드리프터·날짜·결과를 맞추기 위한 dataset·threshold 선택 금지. 코호트는 forcing으로 재선정하지 않는다.
- 취득 후 어떤 파일도 수정하지 않는다. 결측·불완전 프레임은 보간·대체 없이 해당 창을 BLOCKED로 기록한다.

## 1. 후보 비교

| 항목 | HYCOM GOFS 3.1 GLBv0.08 expt_53.X (reanalysis) | GLORYS12V1 (GLOBAL_MULTIYEAR_PHY_001_030) | 바람: NCEP-DOE R2 10 m | 바람: ERA5 10 m |
|---|---|---|---|---|
| 제공 | HYCOM.org (NRL/NAVO), THREDDS/NCSS 익명 | Copernicus Marine (Mercator), Toolbox·계정 필수 | NOAA PSL THREDDS NCSS 익명 | ECMWF CDS 계정 필수 |
| 변수 | water_u/water_v, m/s | uo/vo, m/s | uwnd/vwnd 10 m, m/s | u10/v10, m/s |
| 수평 | 0.08° (40S~40N), 극쪽 위도 0.04° | 1/12° 정규 | T62 가우시안 ≈1.9° | 0.25° |
| 시간 | **3 h 순간장** | **일평균** | 6 h(예보 유효시각) | 1 h |
| 연직 | 표준층, **15 m 층 존재** | 50층, 15 m 없음(13.47/15.81 m 보간 필요, 파일에서 확인) | 표면 10 m | 표면 10 m |
| 기간 | 1994~2015(결측 구간 있음) | 1993~2026-06 | 1979~현재 | 1940~현재 |
| 코호트 창 coverage | KE 2010-05/06, AG 2015-04 → **범위 내**(2015-12까지) | 범위 내 | 범위 내 | 범위 내 |
| 라이선스 | Distribution A, 무제한 배포(파일 명시) | 무료·출처 표기 | 제한 없음, PSL 표기 요청 | CC-BY-4.0(Copernicus) |
| 재현성 | NCSS 원파일 SHA·query 기록; 재취득 시 변환 메타데이터로 해시 변동 가능 → 저장본 사용 | Toolbox 버전·query·SHA 기록 | 동일 | 동일 |
| 장점 | 3 h 순간장·15 m 층·익명·V1/V2와 동일 계약(reader 검증 완료) | 독립 모델/동화 체계, 1/12° | 익명·V2에서 검증 완료 | 고해상도 |
| 단점 | 극쪽 위도 간격 변화(±40° 밖 reader 거부), 2015 이후 없음 | 일평균(조석·관성 미해상), 계정 필요, reader 신규 필요 | 1.9°(종관 규모만) | 계정 필요, 파일 대용량 |

**결정(FINAL — FORCING ROLE SEPARATION):**
- PRIMARY OCEAN FORCING = HYCOM GOFS 3.1 GLBv0.08, 15 m, 3 h(물리 적합성·해상도·기간·재현성·검증된 reader).
- PRIMARY WIND FORCING = NCEP-DOE Reanalysis 2, 10 m, 6 h(V2 사전등록과 동일 소스; ERA5는 자격증명 확보 시 별도 사전등록 후 민감도 축으로만).
- INDEPENDENT OCEAN PRODUCT = GLORYS12V1(Copernicus Marine). **GLORYS는 HYCOM의 대체재가 아니다.** GLORYS 자격증명이 없어도 HYCOM을 GLORYS로 교체하지 않으며, 취득 불가 시 GLORYS STATUS = BLOCKED/PENDING으로 기록한다. 그 경우에도 HYCOM + NCEP primary forcing은 이 protocol대로 진행할 수 있고, GLORYS가 필요한 비교/민감도 축은 GLORYS가 취득될 때까지 실행하지 않는다.
비용은 어떤 후보도 배제하는 이유로 쓰지 않았다.

## 2. 실행 단위와 영역 정의 (관측만 사용)

- 실행 단위 = STEP 16 채택 창 4개: KE-1 2010-05-11 12Z~05-14 12Z · KE-2 2010-06-30 12Z~07-03 12Z · AG-1 2015-04-23 12Z~04-26 12Z · AG-2 2015-04-26 12Z~04-29 12Z. 창마다 forcing을 따로 취득한다.
- 방출점 = 창의 코호트 귀속 드리프터(창에서 처음 추가된 ID)의 t0 관측 위치. 창의 다른 eligible 드리프터(중복 ID)는 방출하지 않는다 → 비교 쌍 = 23 (KE 8+5, AG 9+1).
- 해류 영역 = 그 창 코호트 드리프터의 t0 cohort bounding box에 **latitude/longitude 각각 2.0 degree의 고정 buffer**를 적용한 상자. 위도 domain은 **[−40°, +40°]**로 절단(HYCOM 정규 간격 구간). geographic degree extent를 그대로 적용하며, 72 h × 0.85 m/s ≈ 220 km는 초기 공간여유를 설정하기 위한 사전 근거로만 기록한다(모든 위도에서 220 km를 보장한다는 뜻이 아니다). 취득 후 buffer를 줄이지 않는다.
- 바람 영역 = 해류 영역 ± 3°(가우시안 격자 최소 2셀), 시간 = t0 − 12 h ~ t0 + 84 h(6 h 격자, RK4 단계 시각 포함).
- 경계 처리(DOMAIN POLICY — FINAL): 위도 domain [−40°, +40°] 밖의 forcing point는 외삽하지 않는다. 상태명은 **OUT_OF_DOMAIN**(입자가 해류 영역 밖으로 나감)과 **FORCING_UNAVAILABLE**(해당 시각·위치의 forcing sample 없음) 두 가지만 쓴다. OUT_OF_DOMAIN → 해당 forcing sample unavailable → 코호트 유지 → window forcing status에 기록 → 외삽 금지. AG-1은 t0 위도 −39.8까지 있어 40°S 이남 이동 가능성이 있으나 이번 protocol에서 reader를 확장하지 않는다. ±40° 밖 0.04° 격자를 지원하기 위한 reader 변경 금지 — 새로운 preregistration 없이는 수행하지 않는다. 코호트 자체는 변경하지 않는다.

## 3. HYCOM 취득 규약

- 데이터셋: GLBv0.08/expt_53.X, 해당 연도 디렉터리(2010, 2015). NCSS `var=water_u&var=water_v`, `vertCoord=15`, `horizStride=1`, `addLatLon=true`, `accept=netcdf`.
- 시간: 창당 4요청(21 h + 21 h + 21 h + 마지막 1프레임), 3 h 간격 25프레임 정확히. 어느 프레임이라도 없으면 그 창은 FORCING_BLOCKED(이웃 프레임 복제·보간 금지).
- 파일 이름 `current-YYYYMMDDTHH.nc`, 저장 위치 `data/research/step17/hycom/<window-id>/`(저장소 밖, 대용량), query·취득시각·바이트·SHA-256을 `docs/research/step17-forcing-manifest.json`에 기록.
- 변환: `research_runtime/netcdf_reader.py`(earthus-hycom-netcdf/1, 무수정)로 JSON 격자화 — CF 이름·단위·달력·배포 문구·정규 간격·프레임 연속성 검사, 결측 노드 → null + landMask, 좌표 라벨 정규화(float32 라벨 오차 허용 <1e-4°), 리그리딩 없음. issuedAt 고정값으로 결정론적 해시.
- 품질: 결측 노드 수·범위(u,v 범위) 기록; 모든 프레임 유효 노드 비율 < 95%면 경고, 방출점 4노드 스텐실 결측이면 preflight 거부(대체 없음).
- 시간 규약: 순간장 유효시각. 보간: 공간 쌍선형·시간 선형, 외삽 금지(기존 계약).

## 4. GLORYS 취득 규약 (조건부)

- 자격증명 정책: Phase A에서는 credential을 요구하지 않는다. LOCK 이후 실제 forcing acquisition 단계에서 사용자가 인증 정보를 제공한다(`copernicusmarine login`). 인증 정보(username/password·API token·credential file)는 repository에 저장·commit하지 않는다. 미제공 시 GLORYS = BLOCKED/PENDING, 대체 forcing NOT ALLOWED, 합성 자료 금지.
- 데이터셋 ID(카탈로그 재확인): cmems_mod_glo_phy_my_0.083deg_P1D-m, 변수 uo·vo, 깊이 13~16 m(두 층), 창별 동일 영역, 시간 = 창을 덮는 일평균 4~5일.
- 연직: 13.47 m·15.81 m 두 층을 15 m로 선형 연직 보간 → `surfaceDepthMeters: 15`, 처리 이력에 두 층 값 해시·보간식. 시간: 일평균을 그 날 12Z 유효시각으로 라벨(파일 규약 확인 후 확정), 24 h 간격 선형, 외삽 금지. 3 h로 되메우지 않는다.
- reader: `research_runtime/glorys_reader.py` **신규**(별도 커밋·테스트), HYCOM reader와 같은 JSON 격자 계약·검사. 원본 SHA·Toolbox 버전·query 기록.
- 독립성 진술: 모델·동화 체계는 독립, 동화 관측(고도계·SST·Argo)은 공유 — "완전 독립"이라 쓰지 않음.

## 5. 바람(NCEP-DOE R2) 취득 규약

- PSL NCSS `uwnd.10m.gauss.YYYY.nc`/`vwnd.10m.gauss.YYYY.nc`, 6 h, 창당 영역·시간(§2). 변환 `research_runtime/wind.py`(earthus-ncep-r2-wind/1, 무수정): 위도 오름차순 정렬, 경도 −180~180, 결측 → null(0 대체 없음), 가우시안 위도 보존(리그리딩 없음). 시간 규약: 파일 시각 = 6 h 예보 유효시각(기존 가정 유지).
- 라이선스 제한 없음(PSL 표기). 윈디지 α = 0.0007 고정(V2 사전등록 값), 통제 α = 0. 새 α 금지.

## 6. 공통: provenance·checksum·재현성

- 원본 파일별 SHA-256·바이트·query·retrievedAtUTC·HTTP 상태 → step17-forcing-manifest.json; 창별 집계 `forcingSha256`(정렬된 파일 목록의 canonical JSON 해시).
- 정규화 산출물(JSON 격자)은 `sha256`·`sourceSha256`·`processingHistory`를 매니페스트에 갖고, 재생성 스크립트(`tools/research/build_step17_forcing.py`)로 원본에서 결정론적으로 다시 만든다(재생성 해시 = 기록 해시가 검증 항목).
- 저장소에는 원본 .nc(창당 수 MB)와 매니페스트를 커밋하고, 정규화 JSON은 크기에 따라 .gitignore + 재생성으로 다룬다(STEP 9와 동일 정책).
- 취득 순서: LOCK 커밋 → 취득 스크립트 실행(관측 코호트 파일만 읽어 영역 계산) → 매니페스트 커밋 → 검증 스크립트 `check_step17_forcing.py`(프레임 수·간격·영역 포함·SHA·좌표 규약·단위·결측) PASS → 이후 STEP(모델·검증 계획 사전등록)로.

## 7. 결측·QC 정책 요약

| 상황 | 처리 |
|---|---|
| HYCOM 프레임 누락 | 창 FORCING_BLOCKED, 다른 시각·다른 창으로 대체 금지 |
| 방출점 스텐실 결측/육지 | preflight 거부(0 대체 없음), 드리프터는 FORCING_UNAVAILABLE로 보고, 코호트 유지 |
| 바람 상자 밖/시간 밖 | FORCING_UNAVAILABLE(런타임 status MISSING_FORCING)로 정지 |
| 격자 간격 비정규(±40° 밖 포함) | reader 거부 → 위도 domain 절단 규칙(§2)으로 사전에 회피; 절단으로 인한 OUT_OF_DOMAIN은 보고, 외삽 금지 |
| GLORYS 미취득 | GLORYS STATUS = BLOCKED/PENDING; HYCOM+NCEP primary는 진행, GLORYS 필요 축은 취득 전 실행 금지 |
| 재취득 해시 상이 | 저장본을 정본으로, 새 파일은 새 버전으로 등록 |

## 8. 하지 않을 것
forcing 다운로드(LOCK 전)·모델 실행·파라미터 최적화·코호트 재선정·특정 드리프터/날짜/결과를 위한 dataset 선택·threshold 사후 조정·STEP 15/16 파일 수정.

## 9. COHORT IMMUTABILITY · RUN DEFINITION (FINAL)
STEP 16의 23기 코호트를 그대로 쓴다: KE 13 · AG 10. 금지 — AG-2(1기)·KE-2(5기) 등 드리프터 수가 적다는 이유의 창 제거, forcing coverage를 이유로 한 드리프터 제거·코호트 재선정, 특정 드리프터 제외, 새 드리프터 추가. 코호트는 forcing 단계에서 다시 selection하지 않는다.
사전등록 forcing run: KE-1 2010-05-11 12Z 8기 · KE-2 2010-06-30 12Z 5기 · AG-1 2015-04-23 12Z 9기 · AG-2 2015-04-26 12Z 1기 = 23기. 방출 위치는 해당 STEP 16 창의 t0 관측 위치, 동일 drifter ID 중복 방출 금지.

## 10. ALPHA (LOCK)
Primary α = 0.0007 · Control α = 0. 관측·모델 결과를 보고 변경하지 않는다.

## 11. SECRET POLICY
credential/token/password/API key는 repository에 저장·commit하지 않는다. 필요한 secret 경로는 .gitignore로 사전에 차단한다(예: `.copernicusmarine/`, `.env`, `secrets/`). secret 자체 commit 금지.

## 12. LOCK
Status PREREGISTRATION LOCKED. 이후 forcing source·변수·해상도·domain·buffer·시간 창·보간·QC·결측 정책·α·run 정의 변경 금지. 변경은 새 ruleId로만. 다음은 별도 단계 "STEP 17 — PHASE B: FORCING ACQUISITION + QC"에서 진행하며, 이 단계에서는 forcing을 취득하지 않는다.
