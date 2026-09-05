# HYCOM GOFS 3.1 vs GLORYS12V1 — 후속 검증용 자료 제품 비교 (STEP 12, 설계 전용)

createdAt: 2026-09-05T17:04:34Z · author/process: Claude Code (STEP 12) · git: 73d40ae0
상태: **조사·설계만**. GLORYS 자료를 내려받지도, 계산하지도 않았다. 자격증명 입력은 사용자 몫이며 이 세션은 수행하지 않는다.

## 1. 제품 정체성

| 항목 | HYCOM GOFS 3.1 GLBv0.08 expt_53.X | GLORYS12V1 (GLOBAL_MULTIYEAR_PHY_001_030) |
|---|---|---|
| 기관 | US Navy NRL/NAVOCEANO via HYCOM.org | Mercator Ocean International / Copernicus Marine |
| 모델 | HYCOM (하이브리드 좌표) + NCODA 3DVAR | NEMO (z-좌표) + SAM2 (reduced-order Kalman) + 3D-VAR 편향보정 |
| 동화 | 위성 고도계, 위성·현장 SST, 현장 T/S 프로파일 | 위성 고도계(SLA), 위성 SST, 해빙 농도, 현장 T/S 프로파일(CORA) |
| 수평 해상도 | 0.08° (40°S~40°N), 극쪽 위도 0.04° | 0.083° (1/12°) 정규 격자 |
| 시간 | **3시간 순간장** | **일평균**(월평균 별도). 시간 단위 제품 없음 |
| 연직 | 표준 깊이 40층, **15 m 층 존재**(2015-01 코호트에서 사용) | 50층 NEMO 표준 깊이. 15 m 정확한 층 없음 — 인접층 ≈13.47 m·15.81 m(**첫 접근 시 파일에서 확인 필요**) |
| 변수 | water_u / water_v (m/s, 동·북향) | uo / vo — eastward/northward_sea_water_velocity (m/s) |
| 좌표 | lon −180~180(NCSS 지정 시), lat 오름차순, float32 라벨 | 경도 −180~180, 위도 오름차순(파일에서 확인) |
| 시간 규약 | 시각 = 순간장 유효시각 | 일평균: 시각 라벨 = 해당 일 12:00Z 중심(확인 필요) |
| 기간 | 1994~2015(결측 구간 있음) | 1993-01-01 ~ 2026-06-23 |
| 접근 | THREDDS/NCSS 익명 | Copernicus Marine Toolbox `copernicusmarine login` 후 `subset`/`open_dataset`; **계정 필수** |
| 이용 조건 | DoD Distribution A, 무제한 배포(파일 명시) | 무료·공개(Copernicus Marine 라이선스; 재배포 세부 조항 원문은 이전 조회에서 403 — 확보 미완) |
| DOI | — | 10.48670/moi-00021 |

## 2. "독립"의 의미 — 과장하지 않는다

- **모델·동화 체계는 독립**(HYCOM/NCODA vs NEMO/SAM2).
- **동화 관측은 상당 부분 공유**(고도계·SST·Argo 프로파일). 따라서 두 제품의 오차는 상관될 수 있다 — "완전 독립 검증"이 아니라 **"모델·동화 방식 독립, 관측 입력 부분 공유"**로 기록한다.
- 둘 다 **부표 위치·속도를 동화하지 않는다**(제공자 설명). 검증 코호트 독립성은 이 점에 근거하며 인증은 아니다.
- 두 제품 모두 관측이 아니라 재분석이다. 관측은 GDP 부표뿐이다.

## 3. 비교를 공정하게 만들기 위해 미리 고정할 처리

| 쟁점 | 결정(사전등록 대상) |
|---|---|
| 시간 해상도 불일치(3 h vs 24 h 평균) | 두 제품을 **각자 원래 시간 해상도로** 쓴다. GLORYS를 3시간으로 보간하거나 HYCOM을 일평균으로 뭉개지 않는다. 시간 보간은 기존 계약(프레임 사이 선형·외삽 금지) 그대로. 이 차이는 결과 해석의 한계로 명시 |
| 깊이 불일치(15 m 층 부재) | GLORYS는 **13.47 m·15.81 m 두 층을 15 m로 선형 연직 보간**한 단일 층을 만들고, 처리 이력에 두 층 값의 해시와 보간식을 남긴다. comparator 깊이 허용 0.1 m는 그대로(보간 후 `surfaceDepthMeters: 15`). 층 깊이는 실제 파일에서 확인한 뒤 확정 |
| 격자 | 두 제품 모두 정규 위경도 A-grid로 reader 처리. GLORYS는 `netcdf_reader.py`의 HYCOM 전용 검사(배포 문구·변수명)를 통과하지 못하므로 **별도 reader 필요** — STEP 12에서는 만들지 않는다 |
| 육지 마스크 | 두 제품 모두 wet-validity 마스크만. 해안선 없음 → 코호트 규칙 E4(해안 100 km 이상)로 보완 |
| 바람 | 동일 NCEP-R2 10 m, α = 0.0007 고정 |

## 4. 후속 실험 구조(설계)

동일 관측 코호트 · 동일 지평(24/48/72 h) · 동일 지표(`validation.compare`) · 동일 기준선에서:

| 셀 | 해류 | α | 역할 |
|---|---|---|---|
| A | HYCOM 15 m | 0.0007 | 모델(사전등록 주값) |
| B | GLORYS 15 m(보간) | 0.0007 | 모델 — 자료 제품 축 |
| A0 | HYCOM 15 m | 0 | 통제(윈디지 없음) |
| B0 | GLORYS 15 m(보간) | 0 | 통제 |
| C | — | — | 정지 기준선 |
| D | — | — | 초기속도 지속 기준선 |

A vs B가 **자료 제품 차이**, A vs A0(B vs B0)가 **윈디지 항 차이**, A·B vs C·D가 **이류 모델의 절대 가치**를 각각 분리한다. A0/B0는 통제이며 α 재선택이 아니다.

## 5. GLORYS 접근 요건(사용자 작업)

1. Copernicus Marine 계정 생성(무료).
2. 로컬에서 `pip install copernicusmarine` 후 `copernicusmarine login` — 자격증명은 사용자가 직접 입력한다.
3. 이후 세션에서 `copernicusmarine subset --dataset-id cmems_mod_glo_phy_my_0.083deg_P1D-m --variable uo --variable vo --minimum-depth 13 --maximum-depth 16 --start-datetime ... --end-datetime ... --minimum-longitude ... --output-filename ...` 형태로 취득하고 원본 SHA-256을 기록한다(dataset-id는 카탈로그에서 재확인).
4. 취득 전에는 이 제품에 대한 어떤 계산도 하지 않는다. 가짜·대체 fixture 금지.

## 6. 출처

- HYCOM GOFS 3.1 reanalysis: https://www.hycom.org/dataserver/gofs-3pt1/reanalysis ; 접근: https://www.hycom.org/dataserver/access-methods/thredds
- GLORYS12V1 제품 설명: https://data.marine.copernicus.eu/product/GLOBAL_MULTIYEAR_PHY_001_030/description (해상도·층수·동화·기간·DOI 확인 2026-09-05)
- Copernicus Marine Toolbox 다운로드 안내: https://help.marine.copernicus.eu/en/articles/7970637-how-to-download-data-via-the-copernicus-marine-toolbox-in-python (계정·로그인 요건 확인 2026-09-05)
- 이전 조사: docs/research/DATASET_CANDIDATES.md (2026-09-05)
