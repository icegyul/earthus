# Open-Meteo 대체 지도 · Overpass 정적화 (2026-09-24)

> 근거: `docs/R0-OPEN-METEO-AUDIT-2026-09-20.md`(호출량·스케줄 실측) + 2026-09-24 이 저장소 `git grep` 재조사.
> 판단 기준: `docs/PAID-APP-LAUNCH-REVIEW-2026-09-24.md` §3-4(D1) · §3-6(D3). 유료 개시 2027-01-01 전에 끝내야 한다.
> **배포하지 않았다.** 아래 DONE 은 "저장소 코드와 시험이 끝났다"는 뜻이다 — 운영 반영은 §4 의 명령을 PD 가 돌린 뒤다.

## 0. 화면에서 무엇이 바뀌나

- **v1 등압선·태풍 타임라인(기압·바람 1°)**: 값의 출처가 "Open-Meteo (GFS/ECMWF)" → "NOAA/NCEP GFS 0.5° (NOMADS)" 로 바뀐다.
  격자·범위·파일 이름·모양은 그대로라 그림은 같은 자리에 같은 방식으로 나온다. 값은 GFS 결정론 한 모델이다(Open-Meteo 는 GFS·ECMWF 등을 섞은 'best match').
  시각(`time`)은 이제 "Lambda 가 돈 정시"가 아니라 **GFS 가 그 값을 계산한 유효시각**이다 — 지금에 가장 가까운 3시간 스텝이라
  벽시계보다 **최대 1.5시간 앞**일 수 있다(실측: 11시경 실행 → 12:00Z 스텝). v1 타임라인 첫 칸 '지금 (실황)' 은 이제 모델 스텝 위에 선다
  (Open-Meteo 때도 모델값이었다). '실황'을 절대 미래 값으로 두지 않으려면 `nomads_gfs.nearest_step` 을 반올림 대신 내림으로 바꾸면 된다(PD 판단).
- **v1 '명소' 레이어**: 브라우저가 `overpass-api.de` 를 부르지 않는다. 하루 한 번 Lambda 가 만든 정적 파일을 읽는다.
  덮는 곳은 한국·일본·대만·영국·미국 본토(시장 우선순위)다. 그 밖에서 확대하면 비어 있는 대신 "이 지역은 아직 준비되지 않았다"고 적는다.
- 그 밖의 화면은 바뀌지 않는다(판매는 닫혀 있고 SALES_OPEN=false 그대로).
- (2026-09-24 검수 정정) **출처 줄도 같이 바뀐다** — `prototype/js/ui-source.js` 의 `wind`·`pressure` 줄이 "Open-Meteo" 하나만 적고 있었다.
  이제 "동아시아 확대(등압선): NOAA/NCEP GFS 0.5° (NOMADS) · 전지구: Open-Meteo" 로 둘 다 적는다(전지구 5° 판 wind-grid 는 아직 Open-Meteo 다 — S3).
  태풍 타임라인 예보 칩의 "모델(GFS·ECMWF)" 은 문서의 `model` 을 보고 "모델(NOAA GFS)" 로 적는다(옛 파일이면 옛 문구).
- (2026-09-24 검수 정정) **타임라인 칸 고르기**: `ui-timeline.js` 가 `steps[i]` 로 칸 번호 인덱싱을 했다. 새 fx-grid 는 받지 못한 스텝을
  **빼고** 쓴다(`stepsMissing`) — +24h 가 빠진 날 '+24시간' 칸에 +30h 격자가 그려졌을 것이다. 이제 `steps.find(s => s.h === i·6)` 로 고르고, 없으면 실황 격자를 치운다.

## 1. 대체 원천 요약

| 원천 | 라이선스 | 이미 있는 수집기 | 막힌 것 |
|---|---|---|---|
| NOAA/NCEP GFS (NOMADS GRIB 필터) | 미국 정부 공개 — 상업 OK | `gfs-cloud-forecast`(0.5°·5일·t/u/m/a 프레임) · `tpw-grid` · `gfs-cloud-volume` · 순수 파이썬 `grib2lite` | 없음 |
| ECMWF Open Data (IFS·AIFS) | CC-BY-4.0 — 상업 OK(출처 표기) | `ecmwf-ingest`(2t · 97지점 · 태풍 BUFR) | ENS 변수 추가는 작업 필요 |
| NOAA GFS-Wave 0.25° | 공개 | 없음 | **JPEG2000(템플릿 5.40)** — `grib2lite` 가 거부. ecCodes 경로(`aws/deploy-grib-python.sh`, tpw-grid 가 씀)가 있으나 그 휠의 OpenJPEG 포함 여부 미확인 |
| CAMS 대기질 (Copernicus ADS) | Copernicus 라이선스 — 상업 OK(표기) | 없음 | **ADS 계정·라이선스 수락 = PD 본인** |
| NOAA OISST v2.1 | 공개 | `marine-grid`·`marine-ea` 의 SST 부분 · `ocean/sst-global.json` | 없음 |
| 기상청 API허브·해양관측 | 공공누리(자료별 유형 확인) | `kma-aws`·`kma-ocean`·`gts-global` 등 | 허브 일일 용량(한 키 공유) |

## 2. 소비자별 지도 — 서버(Lambda·스크립트)

상태: **DONE** = 이 스트림에서 코드·시험 완료(배포 대기) · **NEXT** = 재료가 있다, 다음 작업 · **BLOCKED** = 선행 조건이 있다.

| # | 소비자 (file:line) | 받는 것 | 격자·해상도 | 주기(실측) | 대체 원천 | 상태 · 이유 |
|---|---|---|---|---|---|---|
| S1 | `aws/pressure-grid/handler.py:53` → `wind/pressure-ea.json` · `wind/wind-ea.json` | 해면기압 · 10 m 바람 (current) | 동아시아 20–50N 110–160E · 1° · 1,581점 | `rate(3 hours)` (schedules.sh 는 rate(1 hour) 라 적음 — 불일치, 손대지 않음) | NOAA GFS 0.5° NOMADS `PRMSL`·`UGRD`·`VGRD` → 1° 원격자 표본(보간 없음) | **DONE** — 파일 이름·키·격자 그대로. 추가 키(`model`·`modelRun`·`validAt`·`dataKind`·`attribution`·`licenseStatus`)만 더했다. `clouds/gfs-fc` 의 m 프레임은 **쓰지 않았다**: 8bit 1 hPa 눈금(처음엔 940 hPa 에서 잘렸다 — 354칸, gfs-cloud-forecast/handler.py:146)이라 등압선용 원값이 아니다 |
| S2 | `aws/fx-grid/handler.py:40` → `wind/fx-ea.json` | 해면기압 · 10 m 바람, 6시간 간격 +120 h | 같은 1° 격자 | `rate(6 hours)` | 같은 NOMADS 요청을 f(now)…f(now+120) 에 반복 | **DONE** — `steps[].{t,h,mslp,u,v,min,max}` · `stepH`·`maxH` 그대로. `t` 는 GFS 유효시각 |
| S3 | `aws/wind-grid/handler.py:52` → `wind/global.json` · `wind/forecast-leads.json` | 10 m 바람 · 2 m 기온·습도 · 시정 · 토양수분 0–1 cm · 해면기압 · 강수 · 전운량 + 8일 일 최고·최저·최대풍 | 전지구 5° 2,376점 | `cron(20 0/3 * * ? *)` (호출량 2위) | NOAA GFS 1°(NOMADS `filter_gfs_1p00`) `UGRD/VGRD 10m`·`TMP/RH 2m`·`VIS surface`·`SOILW 0-0.1m`·`PRMSL`·`PRATE`·`TCDC entire atmosphere`·`TMAX/TMIN 2m`(6시간 구간) | **NEXT** — 재료는 있다. 지금 프레임(t/u/m/a)에는 rh·vis·soil·cld·rain·일 최고·최저가 없어 부분 교체는 소비자(v1 windfield·gridoverlay, v2 live-layers `windgrid`, archiver)를 깬다. 주의 두 가지: ① 토양수분 층이 다르다(Open-Meteo 0–1 cm ↔ GFS 0–10 cm) — 키 이름은 두되 `note` 에 층을 적어야 한다 ② 지점 현지 날짜(`timezone=auto`)를 경도 기반 표준시로 근사해야 한다(시간대 경계 자료 없음). 이 둘을 PD 에게 보이고 한 번에 바꾼다 |
| S4 | `aws/kma-verify/handler.py:48` | `gfs_seamless`·`ecmwf_ifs025` 2 m 기온·10 m 풍속, 3일, 기상청 ASOS 지점 | 지점 묶음 1요청 | `cron(40 * * * ? *)` | GFS: NOMADS 0.25° 최근접 격자점 · ECMWF: `ecmwf-ingest` 에 `10u/10v` 추가(2t 는 이미 97지점) | **NEXT** — 모델 이름(`MODELS`)이 채점 기록의 키다. 이름을 바꾸면 과거 점수와 끊긴다 → 새 이름(`gfs_0p25_nomads`·`ecmwf_ifs_opendata`)으로 **병행 채점 기간**을 둔 뒤 넘어가야 한다 |
| S5 | `aws/air-state/handler.py:88` | T·RH·이슬점·CAPE·TCWV·MSL·Z500/Z200·일 최고·최저 | 도시 지점별 | `cron(20 12 * * ? *)` ×2 규칙(중복 의심) | GFS 0.25° 지점 표본(`gfs-cloud-volume` 층 자료 + NOMADS `HGT 500/200 mb`) | **NEXT** — 소량. S1 의 `_shared/nomads_gfs.py` 를 그대로 쓸 수 있다 |
| S6 | `aws/cyclone-analog/handler.py:691` | 500 hPa 지오퍼텐셜 고리(지향류) | 태풍 둘레 지점 | `cron(25 */3 * * ? *)` · 태풍 있을 때만 | NOMADS GFS `HGT·UGRD·VGRD 500 mb` 부분 영역 | **NEXT** — Intelligence 원인 문장의 근거 패킷이다. 교체 뒤 채점(intel) 회귀 시험을 같이 돌려야 한다 |
| S7 | `aws/atmos-transport-spike/handler.py:30` | 850/700/500 hPa 바람 hourly | 화재 열점 ≤6곳 | 규칙 없음(수동) | 같은 NOMADS 부분 영역 | **NEXT** — 운영에 없다. 급하지 않다 |
| S8 | `aws/marine-grid/handler.py:49` | 파고·파향·주기·너울·SST·해류 | 전지구 5° | `cron(45 0/3 * * ? *)` | SST = OISST(이미 수집) · 파랑 = GFS-Wave · 해류 = RTOFS/CMEMS | **BLOCKED** — 파랑은 JPEG2000(메모: gfs-wave-jpeg2000-block). SST 만 먼저 떼는 것은 NEXT |
| S9 | `aws/marine-ea/handler.py:43` | 위와 같음 | 동아시아 0.5° 3,577점 | `rate(3 hours)` | 위와 같음 | **BLOCKED** — S8 과 같다 |
| S10 | `aws/air-ea/handler.py:71` | PM2.5·PM10·먼지·오존·UV·AOD·AQI | 동아시아 0.5° 7,381점 (호출량 62%) | `cron(40 * * * ? *)` | CAMS 전지구 예보(ADS) | **BLOCKED** — ADS 계정·라이선스(PD). 그 전에 할 수 있는 것: 3시간 간격으로 줄이기(D-OM3, EventBridge 변경 = aws login) |
| S11 | `aws/air-grid/handler.py:52` | 위와 같음 | 전지구 5° | `cron(25 0/3 * * ? *)` | CAMS | **BLOCKED** — S10 과 같다 |
| S12 | `aws/lab-events/handler.py:651` · `:890` | CAMS pm10·pm2_5·dust 1점 / SST 4점 | 지점 | `cron(40 */3 * * ? *)` | 대기질 = CAMS · SST = `ocean/sst-global.json`(OISST) 표본 | 대기질 **BLOCKED**(CAMS) · SST **NEXT**(S3 에 이미 있다 — 읽기만 바꾸면 된다. 단 `CAMS_OPENMETEO` 채점 이력과 끊김을 PD 확인) |
| S13 | `aws/spot-air/index.mjs:23` (Node, 공개 함수 URL) | 지점 날씨(≤20곳) | 임의 지점 | 트래픽 비례 | `wind/global.json`·`clouds/gfs-fc` 프레임 최근접 표본 + 기상청 AWS 실측 | **NEXT** — S3(wind-grid) 교체 뒤가 맞다. 지금 교체하면 5° 격자값을 지점값처럼 내게 된다(격자 vs 실측 규칙) |
| S14 | `aws/para-sites/2-filter.py:47` | 고도 | 일회성 오프라인 | 없음 | 저장소의 DEM(지형 타일) | **NEXT** — 운영 호출 아님. 다시 돌릴 일이 생기면 그때 바꾼다 |
| S15 | `aws/catalog/build_catalog.py:440·460·487` | 호출 없음 — 카탈로그 설명(주소·약관 링크) | — | — | — | 기록만. S1·S2 배포 후 카탈로그의 '쓰는 곳' 목록을 고친다(NEXT) |
| S16 | `aws/materialized-earth/weather-typhoon.mjs:77·115` (← `tools/build_v52_materialized_earth.mjs`, 손으로 돌리는 빌드) | `wind/fx-ea.json` 을 읽어 v2 materialized 산출물을 만든다 | — | 수동 | 호출 없음 — **계보 표기**만 | **NEXT** (2026-09-24 검수) — `sourceRefs` 가 `OPEN_METEO_GFS_ECMWF` 로 박혀 있다. S2 배포 뒤 다시 돌리면 NOAA 값에 Open-Meteo 계보가 찍힌다(payload 의 `source` 는 fxEa.source 를 읽어 맞다). `fxEa.model` 로 고르게 바꾸고 산출물 해시를 다시 굽는 일이 같이 있어 이번엔 손대지 않았다 |

## 3. 소비자별 지도 — 브라우저 직접 호출

⚠️ 브라우저 호출은 **화면 값이 바로 바뀐다.** 이번 스트림 규칙(판매 닫힘 · UX 수정 외 화면 변경 금지)에 따라 아래는 지도만 만든다.

| # | 소비자 (file:line) | 받는 것 | 대체 | 상태 · 이유 |
|---|---|---|---|---|
| B1 | `prototype/js/layers/weather.js:51` `fetchWeather` (← `ui.js:127,500` · `ui-weather.js:202` · `ui-tourism.js:112` · `weather-data-v7.js:20`) | v1 날씨 시트: 현재·시간별·**10일 예보·강수확률** (`weather-contract-v7.js`) | 결정론 값은 GFS 지점 표본으로 가능 · **강수확률은 앙상블(GEFS·ECMWF ENS)이 있어야 한다** | **BLOCKED(PD)** — 2026-09-24 PD 정정으로 이 시트의 모델 예측은 둔다. 원천을 바꾸는 것은 PD 결정(D-OM1·D-OM5)이 먼저다. 강수확률은 결정론 GFS 로 대체할 수 없다 — 지어내지 않는다 |
| B2 | `prototype/js/layers/weather.js:63` `fetchGrid` | 지점 묶음 10 m 바람 | `wind/global.json` | **NEXT** — 이미 서버 격자가 있다. S3 교체와 함께 |
| B3 | `prototype/js/layers/phenomena.js:168·252·410` | 7일 일 최고기온 · 500 hPa 지오퍼텐셜 hourly (폭염 돔 판정) | NOMADS `HGT 500 mb` 부분 영역을 서버에서 굽기 | **NEXT** — 서버 산출물 하나 추가(S5·S6 과 같은 요청) |
| B4 | `prototype/js/beaches.js:226` · `fishing.js:293` (`API.MARINE`) | 파고·너울·수온 current + 해수면 높이 hourly | 파랑 = GFS-Wave · 조위 = 국립해양조사원 | **BLOCKED** — 파랑 JPEG2000(S8) |
| B5 | `prototype/js/place.js:124·144` (`API.MARINE`, `models=ecmwf_wam`) | 파고·파향·주기 | ECMWF Open Data 파랑(`swh`·`mwd`·`mwp`, CC-BY) | **NEXT** — ECMWF Open Data 에 파랑이 있다(ecmwf-ingest 에 변수 추가). GFS-Wave 벽을 우회하는 길이다 |
| B6 | `prototype/js/para.js:136` | 지점 기온·이슬점·바람·돌풍·구름 | GFS 지점 표본 + 기상청 AWS | **NEXT** — 돌풍(`GUST surface`)은 GFS 에 있다 |
| B7 | `prototype/js/ui-station.js:144` | 과거 5일 + 1일 hourly 시계열(관측소 옆 비교) | 기상청 AWS 이력(`wind/series/*`) | **NEXT** — 과거 5일은 모델 재분석이 아니라 실측 이력으로 바꾸는 편이 맞다 |
| B8 | `prototype/js/narrative.js:232` | 기온·습도·이슬점·바람 current + 2일 최고·최저 | B1 과 같은 지점 표본 | **NEXT** — B1 과 한 묶음 |
| B9 | `prototype/v2-three/js/route.js:333` (v2 항로 공항 날씨) | 기온·바람·**돌풍·weather_code·시정** hourly 7일 | GFS `GUST`·`VIS`·`PRATE`·`TCDC` 지점 표본 → S3 공항 목록 파일 | **NEXT** — `weather_code`(WMO 날씨 부호)는 Open-Meteo 가 만든 파생값이다. 대체하려면 부호를 우리가 만들지 않고 원 변수(강수율·구름·시정)를 그대로 보여 주는 쪽으로 카드를 바꿔야 한다 → 화면 변경이라 이번 범위 밖 |
| B10 | `prototype/index.html:20` preconnect · `prototype/js/config.js:84·86` (`METEO`·`MARINE`) | 연결 준비·주소 상수 | — | B1~B8 이 끝나면 지운다 |

이미 끝난 것(참고): v2 의 `main.js`·`point-readout.js`·`field-layer.js`·`ext-scene.js` 는 2026-09-20 W2 에서 브라우저 직접 호출을 걷어냈다(`tools/earthus-v53/point-readout.test.mjs`·`ext-scene-openmeteo-seal.test.mjs` 가 잠근다). v2 에 남은 한 곳이 B9 다.

## 4. 배포 — 운영에 올리려면 (PD 또는 배포 담당, `earthus-deploy` 프로필)

```bash
# S1 · S2 — 이름·S3 키·스케줄이 그대로라 EventBridge 를 건드리지 않는다
bash aws/deploy-python.sh pressure-grid
bash aws/deploy-python.sh fx-grid
# 확인(읽기만): 출처가 NOAA 로 바뀌었는지
curl -s https://earthus.net/wind/pressure-ea.json | head -c 400
curl -s https://earthus.net/wind/fx-ea.json | head -c 400
```
- `deploy-python.sh` 가 `aws/gfs-cloud-forecast/grib2lite.py` 와 `aws/_shared/nomads_gfs.py` 를 zip 루트에 넣는다(`lambda_package.py stage` 로 로컬 확인함).
- 2026-09-24 이 기계에서 NOMADS 를 실제로 읽어 봤다(S3 쓰기 없음): pressure-grid 1,581/1,581칸 · 1.4초 · 회차 2026092406 f006 · 1001.9~1023.5 hPa
  (같은 때 운영 Open-Meteo 판 1002.7~1022.2 hPa). fx-grid 21/21 스텝 · 13.7초 · 문서 536 KB(운영 534 KB).
- 쓰기 경로 검사(`aws/write-path-audit.py`)를 위해 travel-poi 를 `aws/_shared/write_policy.py` APP_WRITERS 에 `app/tourism/poi/` 로 올렸다.
- ⚠️ `aws/deploy-grib-python.sh` 로 배포하지 말 것 — 그 스크립트의 S3 권한은 `wind/tpw-ea.json` 한 키에 묶여 있다.

## 5. Overpass → 정적 파일 (D3)

| 소비자 | 전 | 후 | 상태 |
|---|---|---|---|
| `prototype/js/layers/travel.js:58` (v1 '명소') | 확대할 때마다 브라우저가 `overpass-api.de` 에 POST | 새 Lambda `aws/travel-poi/` 가 하루 1회 5°칸별로 뽑아 `s3://earthus-cache-kr/app/tourism/poi/` 에 둔다(CloudFront `/tourism/*` → 오하이오 `app/tourism/`, `aws/_shared/app-origin.sh` KEEP_OHIO). 브라우저는 `/tourism/poi/index.json` + 칸 파일만 읽는다 | **DONE**(배포 대기) |

- 덮는 칸: 한국·일본·대만·영국·미국 본토의 경계상자를 5°칸으로 나눈 것(약 125칸, 시장 우선순위 순). 한 번에 다 못 돌면 가장 오래된 칸부터 이어서 돈다(한 실행 ≤ 12분, 칸 사이 3초).
  칸당 10~60초면 하루 10~30칸이라 **첫 바퀴는 1~2주**다(한국 칸이 맨 앞). 빨리 채우려면 첫 주만 `rate(6 hours)` 로 돌린다(PD 판단).
  실패한 칸은 그날 시도한 칸으로 쳐서 뒤로 보낸다 — 무거운 칸 하나가 매일 맨 앞에서 504 를 내 전체를 막지 않게.
- 칸마다 이름 있는 장소를 최대 400개 남긴다 — 위키데이터·위키백과 연결이 있는 곳, 그다음 드문 종류(천문대·천문관·아쿠아리움·동물원·박물관)를 먼저. 화면은 그중 화면 안 120개(예전과 같은 상한).
- 실패한 칸은 **옛 파일을 지우지 않는다**(obis-summary 규칙).
- `© OpenStreetMap contributors` · ODbL 을 색인과 칸 파일, 화면 줄에 둔다.
- 공용 Overpass 를 서버에서 하루 한 번 소량 쓰는 것은 운영자 문서가 허용하는 '정기 소량 사용'이다. 칸이 늘면 Geofabrik 추출본(자체 처리)으로 옮기는 것이 다음 단계다(NEXT).

**순서가 중요하다: Lambda → 첫 실행 → 색인 확인 → v1.** v1 을 먼저 올리면 색인(index.json)이 없어 '명소'가 빈 채로 뜬다(콘솔 경고만).

```bash
# 1) 함수 — 첫 배포는 IAM 역할 earthus-lambda-travel-poi 를 만든다(캐시 버킷 GetObject/PutObject)
bash aws/deploy-python.sh travel-poi
# 2) 첫 실행(최대 약 13분) · 결과 확인
aws lambda invoke --function-name travel-poi --region ap-northeast-2 --cli-read-timeout 900 /tmp/travel-poi.out && cat /tmp/travel-poi.out
curl -s https://earthus.net/tourism/poi/index.json | head -c 600
# 3) 스케줄 — aws/schedules.sh 의 JOBS 에 한 줄을 더했다.
#    ⚠️ schedules.sh 는 JOBS **전체**의 규칙을 put 하고 끝에서 **전부를 한 번씩 invoke** 한다. 새 줄만 걸려면 손으로:
RULE=travel-poi-schedule; REGION=ap-northeast-2
ARN=$(aws lambda get-function --function-name travel-poi --region $REGION --query Configuration.FunctionArn --output text)
aws events put-rule --name $RULE --region $REGION --schedule-expression 'cron(10 19 * * ? *)' \
  --description 'earthus · OSM 명소 정적 파일 (하루 1회, 5도 칸)' --state ENABLED
aws events put-targets --rule $RULE --region $REGION --targets "Id=1,Arn=$ARN"
aws lambda add-permission --function-name travel-poi --region $REGION --statement-id $RULE-invoke \
  --action lambda:InvokeFunction --principal events.amazonaws.com \
  --source-arn "$(aws events describe-rule --name $RULE --region $REGION --query Arn --output text)"
# 4) v1 화면 — 바뀐 파일만(main.js 는 내용이 그대로라 올리지 않는다. index.html 의 ?v= 만 바뀌었다)
bash tools/deploy-v1.sh index.html js/config.js js/layers/registry.js js/layers/travel.js js/layers/poi-static.js js/ui-timeline.js js/ui-source.js
```
- (2026-09-24 검수 정정) `js/ui-timeline.js`·`js/ui-source.js` 를 목록에 더했다. ⚠️ `ui-source.js` 는 **pressure-grid 를 배포한 뒤에** 올린다 —
  먼저 올리면 아직 Open-Meteo 인 동아시아 판을 NOAA 라고 적게 된다. `ui-timeline.js` 는 옛 파일에서도 옛 문구로 돌아가므로 순서와 무관하다.
- (2026-09-24 검수 정정) **v1 을 올리기 전 문턱**: 색인이 '있다'만 보지 말고 한국 칸 6개(n30·n35 × e120·e125·e130)에 `fetchedAt` 이 있고
  서울 칸 `n35_e125` 의 `count > 0` 인지 본다. 브라우저에는 Overpass 되돌이가 없다 — Lambda 도 504 만 받으면 '명소'는 모두에게 빈다.
  `curl -s https://earthus.net/tourism/poi/index.json | python -c "import json,sys;t=json.load(sys.stdin)['tiles'];print({k:(t[k].get('count'),t[k].get('fetchedAt')) for k in ('n30_e120','n30_e125','n30_e130','n35_e120','n35_e125','n35_e130')})"`

⚠️ 2026-09-24 이 기계에서 공용 Overpass 에 5°칸(서울) 질의를 두 번 보냈고 **두 번 다 504** 였다(미러 kumi.systems 는 읽기 시간 초과).
공용 서버가 불안정한 것은 알려진 일이다(v2 registry `travel.poi` 가 같은 이유로 잠겨 있다). 그래서 실제 응답으로는 검증하지 못했고,
파싱은 Overpass JSON 모양의 단위 시험으로만 확인했다. 핸들러는 실패한 칸의 옛 파일을 지우지 않고, 연달아 3번 거절되면 그날은 멈추며,
아직 한 번도 못 받은 칸이면 화면이 "이 지역 명소 자료를 아직 받지 못했습니다 · 하루 1회 갱신"이라고 말한다.
첫 실행에서 칸이 거의 안 채워지면 `OVERPASS_URL` 환경변수로 다른 인스턴스를 쓰거나 Geofabrik 추출본 처리(다음 단계)로 넘어간다.

## 6. 남은 막힘 (PD 가 풀어야 하는 것)

1. **CAMS ADS 계정·라이선스 수락** — S10·S11·S12(대기질). PD 본인.
2. **파랑 원천 결정** — GFS-Wave(JPEG2000 해독 경로: ecCodes 휠의 OpenJPEG 확인) 또는 ECMWF Open Data 파랑. S8·S9·B4.
3. **v1 날씨 시트(B1)** — 10일 예보·강수확률을 무엇으로 바꿀지(D-OM1·D-OM5). 강수확률은 앙상블이 있어야 한다.
4. **air-ea 3시간 축소(D-OM3)** — EventBridge 변경, aws login.
5. Open-Meteo 서면 문의(같은 도메인 무료 v1 이 상업 플랜 대상인지) — 답에 따라 B 계열의 급함이 달라진다.
