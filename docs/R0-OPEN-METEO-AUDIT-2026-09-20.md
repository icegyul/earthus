# R0 부속 감사 — Open-Meteo 비상업 조항 (2026-09-20)

> 읽기 전용 실측이다. 근거는 git grep, aws lambda get-policy/get-function-configuration, aws events describe-rule, CloudWatch filter-log-events, 그리고 open-meteo.com 약관·가격 페이지(2026-09-20 조회)다.
> 사다리 문서 §2 V-7의 "20+ Lambda"를 정정한다.
> 상태: **PD 결정 대기** — 돈(유료 키)·계정(CAMS ADS)·스케줄 변경이 걸려 있어 야간 실행에서 추천안만 적고 실행하지 않았다(§5).
> (2026-09-24 정정) 소비자별 대체 지도와 진행 상태는 `docs/OPEN-METEO-REPLACEMENT-MAP-2026-09-24.md` 로 이어진다 — pressure-grid·fx-grid 는 NOAA GFS 로 코드 교체 완료(배포 대기).

## 1. 결론

- 실제 호출처는 **Lambda 13개와 오프라인 스크립트 1개**다. 스케줄 운영 11개, 공개 URL 1개(spot-air), 무스케줄 1개(atmos-transport-spike), 그리고 para-sites/2-filter.py다. "20+"가 아니다.
- V-7 목록 중 **tpw-grid·kma-fcst·gts-global은 호출하지 않는다**(주석뿐). tpw-grid는 이미 NOMADS로 옮겼다. 반대로 V-7에 빠진 **fx-grid·kma-verify·air-state·spot-air는 호출한다.**
- **유료 키 사용 0건.** customer-api 호출도 apikey 파라미터도 없고, 환경변수에도 키가 없다.
- **무료 한도는 이미 넘친다.** 최근 24시간 로그에 HTTP 429가 대량으로 있다(air-ea 재시도 870건 이상, 배치 실패 24건. 첫 페이지만 센 하한값).
- 호출량의 약 62%가 **air-ea(매시 0.5° 격자 7381점)** 한 함수에서 나온다.

## 2. 감사표 — Lambda별

| Lambda | 엔드포인트 | 변수 | 격자/지점 | 스케줄(EventBridge 실측) | 지점 기준 호출/일(추정) | 유료키 | 대체 분류 |
|---|---|---|---|---|---|---|---|
| air-ea | air-quality-api /v1/air-quality | pm2_5, pm10, dust, ozone, uv_index, AOD, european/us_aqi (current) | 0.5°, 20–50N 90–150E = 7381점 | air-ea-hourly `cron(40 * * * ? *)` | ~177,000 | 없음 | 새 수집기 필요 (CAMS/ADS) |
| air-grid | air-quality-api | 위와 같음 | 5° 전지구 2376점 | air-grid-hourly `cron(25 0/3 * * ? *)` | ~19,000 | 없음 | 새 수집기 필요 (CAMS/ADS) |
| wind-grid | api /v1/forecast | 10m 바람, 기온, 습도, 시정, 토양수분, 해면기압, 강수, 구름 + 8일 daily Tmax/Tmin/바람 (13변수) | 5° 전지구 2376점 | earthus-wind-hourly `cron(20 0/3 * * ? *)` | ~24,700 (×1.3 가중) | 없음 | 기존 수집기로 대체 가능 (NOMADS GFS, gfs-cloud-forecast·tpw-grid 도구) |
| marine-grid | marine-api /v1/marine | 파고, 파향, 주기, 너울, SST, 해류 (8개) | 5° 전지구 2376점, sea | marine-grid-hourly `cron(45 0/3 * * ? *)` | ~19,000 | 없음 | 부분: SST는 기존(OISST), 파랑·해류는 새 수집기 (WW3/ECMWF wave, CMEMS/RTOFS) |
| marine-ea | marine-api | 위와 같음 (+ OISST 편차는 이미 직접 수집) | 0.5° 23–47N 114–150E = 3577점 | marine-ea-schedule `rate(3 hours)` | ~28,600 | 없음 | 위와 같음 |
| pressure-grid | api /v1/forecast | pressure_msl, 10m 바람 (current) | 1° 20–50N 110–160E = 1581점 | pressure-grid-schedule `rate(3 hours)` | ~12,600 | 없음 | 기존 수집기로 대체 가능 (NOMADS PRMSL/UGRD/VGRD) |
| fx-grid | api /v1/forecast | pressure_msl, 10m 바람 hourly, 6일 | 1581점 | fx-grid-schedule `rate(6 hours)` | ~6,300 | 없음 | 기존 수집기로 대체 가능 (gfs-cloud-forecast 프레임에 변수 추가) |
| kma-verify | api /v1/forecast models=gfs_seamless,ecmwf_ifs025 | temperature_2m, wind_speed_10m, 3일 | 기상청 지점 묶음 1요청 | kma-verify-schedule `cron(40 * * * ? *)` | 지점 수×24 (미계수) | 없음 | 기존 수집기로 대체 가능 (ecmwf-ingest 2t + 10u/10v 추가, GFS는 NOMADS) |
| air-state | api /v1/forecast | T, RH, 이슬점, CAPE, TCWV, MSL, Z500/Z200, 일 최고·최저 | 도시 PTS 지점당 1요청 | air-state-daily + air-state-schedule 둘 다 `cron(20 12 * * ? *)` ⚠️ 중복 의심 | 소량 | 없음 | 기존 수집기로 대체 가능 (gfs-cloud-volume 층 자료) |
| cyclone-analog | api /v1/forecast | geopotential 500hPa 등 (지향류 고리) | 태풍 활동 시 고리 지점 | earthus-cyclone-analog `cron(25 */3 * * ? *)` | 소량(태풍 있을 때만) | 없음 | 기존 수집기로 대체 가능 (gfs-cloud-volume) |
| lab-events | air-quality-api + marine-api | pm10, pm2_5, dust / SST | AQ 1점 + 바다 4점 | earthus-lab-events `cron(40 */3 * * ? *)` | ~40 | 없음 | 유료 키가 싸다 / SST는 OISST·kma-ocean으로 대체 |
| spot-air | api /v1/forecast | 지점 날씨 (요청당 최대 20곳) | 임의 지점 | 규칙 없음, **공개 함수 URL(AuthType NONE)** | 트래픽 비례 | 없음 | 유료 키가 싸다 (또는 자체 격자 서빙) |
| atmos-transport-spike | api /v1/forecast | 850/700/500hPa 바람 hourly | 화재 열점 최대 6곳 | 규칙 없음 (비공개 스파이크) | 0 (수동) | 없음 | 기존 수집기로 대체 가능 (gfs-cloud-volume) |
| para-sites/2-filter.py | api /v1/elevation | 고도 | 일회성 | 오프라인 빌드 | 0 | 없음 | 새 수집기 불필요 (DEM 파일) |

합계(지점 기준 추정): 하루 약 28.7만, 월 약 860만 호출. air-ea를 빼면 하루 약 11만, 월 약 330만.
요청 기준(BATCH=100): 하루 약 2.9천 요청.
⚠️ 과금 단위는 확정하지 못했다. 코드 주석(kma-verify/handler.py:93, wind-grid/handler.py:81)은 '요청 횟수'라고 하지만, 가격 페이지의 "for a single location" 표현과 대량 429는 지점 단위 쪽을 가리킨다. Open-Meteo에 문의해 확정해야 한다.

### 브라우저 직접 호출 (범위 밖이지만 같은 조항)
prototype/v2-three/js/main.js:1701,2893,2895,2927,3398 · route.js:332 · prototype/js/config.js:84,86 · ui-station.js:144 · narrative.js:232 · para.js:136

## 3. Open-Meteo 약관·가격 (2026-09-20 조회)

- 약관 https://open-meteo.com/en/terms: 무료 API는 비상업 전용이다. 상업 예시는 "Operating websites or apps that have subscriptions or display advertisements"와 상업 제품에 통합하는 경우다. 무료 한도는 일 1만, 시간당 5천, 월 30만 호출이다. 자료는 CC-BY 4.0.
- 가격 https://open-meteo.com/en/pricing: Standard 월 100만 호출, Professional 월 500만 호출(과거자료·기후·앙상블 포함), Enterprise 월 5천만 호출 이상. 유료 플랜은 상업 라이선스를 주고, customer-api.open-meteo.com에 `&apikey=`를 붙여 호출한다. 변수가 10개를 넘거나 기간이 2주를 넘으면 fractional count로 센다.
- 금액: Standard 약 29/월, Professional 약 99/월. 통화 미확인(제3자 검색 요약 기준, 공식 원문에서 금액 추출 실패). Enterprise는 문의.

## 4. 이미 있는 대체 수집기

| 수집기 | 원천·라이선스 | 스케줄(실측) | 지금 받는 것 |
|---|---|---|---|
| gfs-cloud-forecast | NOAA NOMADS GFS 0.5° (공공) | rate(3 hours) | 구름층, 지표, 한 층 바람, 5일 41프레임 |
| tpw-grid | NOMADS GFS 0.25→1° | rate(1 hour) | 가강수량 |
| gfs-cloud-volume | NOMADS GFS 0.5°, 21층 | (미확인) | 동아시아 층별 자료 |
| ecmwf-ingest | ECMWF Open Data CC-BY-4.0 | cron(40 2,8,14,20) | IFS·AIFS 2t, 97지점, 태풍 BUFR |
| marine-ea(OISST 부분) | NOAA OISST (psl.noaa.gov) | rate(3 hours) | 동아시아 SST 편차 |

없는 것: CAMS 대기질(ADS), 파랑(WW3/ECMWF wave), 해류(CMEMS/RTOFS).

## 5. PD 결정 항목

1. **D-OM1 경로**: (A) 전부 유료: 월 약 860만 호출이면 Enterprise. air-ea를 줄이면 Professional. (B) 전부 직접 전환. (C) 혼합(권장): 대량 격자 7개는 직접 전환하고, 소량·임의 지점(spot-air, lab-events, 브라우저)은 Standard 키.
2. **D-OM2 시점**: 구독 결제 개시 전에 완전히 정리할지, 유료 키로 먼저 막고 순차 전환할지.
3. **D-OM3 air-ea 축소**: 매시 0.5°를 3시간 또는 1°로. 호출량의 62%이자 429의 주원인.
4. **D-OM4 CAMS ADS 계정·라이선스 수락** (PD 직접).
5. **D-OM5 브라우저 직접 호출 11곳을 포함할지.**

### 추천안 (2026-09-20 야간 실행 — 실행은 하지 않음)

| # | 추천 | 이유 |
|---|---|---|
| D-OM1 | **(C) 혼합** | 대량 격자는 NOMADS·ECMWF Open Data 같은 공공 원천으로 이미 도구가 있다. 임의 지점은 격자로 대체하면 정확도가 떨어진다 |
| D-OM2 | **결제 개시 전에 정리 완료** | 구독을 켜는 순간 비상업 조항 위반이 확정된다. 순서: air-ea 축소 → wind/pressure/fx 격자 NOMADS 전환 → 남은 소량만 Standard 키 |
| D-OM3 | **air-ea 3시간 간격** (격자는 유지) | 호출량 62%·429 주원인. 0.5°를 1°로 내리면 한국 도시값 판단이 무너진다(격자 vs 실측 규칙: 5° 격자는 한국 도시값이 못 된다). 간격만 늘리는 것이 손실이 가장 작다. EventBridge 변경이라 aws login 필요 |
| D-OM4 | PD 직접 | 계정·약관 수락은 대행하지 않는다 |
| D-OM5 | **포함** | 브라우저 호출도 같은 약관이다. 다만 P1 이후로 미룬다 |

## 6. 확인 못 한 것

- EventBridge 규칙의 대상(target): 권한 부족(events:ListTargetsByRule). 그래서 air-state 규칙 두 개가 모두 같은 함수를 부르는지는 추정이다.
- Open-Meteo 다중 지점 과금 단위와 공식 금액·통화.
- 구독 결제가 현재 켜져 있는지(= 지금 이미 상업 이용인지).
- kma-verify 지점 수, gfs-cloud-volume 스케줄.
