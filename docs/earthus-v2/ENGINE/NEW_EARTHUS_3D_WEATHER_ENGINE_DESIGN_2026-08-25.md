# NEW EARTHUS 3D Weather Engine Design

상태: `PD_APPROVED_FOR_IMPLEMENTATION` · 2026-08-25 KST

## 1. 목적

`https://earthus.net/newearthus.html`을 기존 Cesium 지구의 색조 변형이 아니라, 향후 EARTHUS 메뉴의 공통 시각 기반으로 사용할 독립 3D Earth Engine으로 다시 만든다.

첫 운영 범위는 다음 네 가지가 한 화면에서 같은 시간 의미를 가지는 것이다.

1. NASA 기반 PBR 지구 표면, 야간 도시 불빛, 태양 방향, 대기 림
2. 실제 위성 관측 구름의 현재 footprint와 보존된 과거 frame
3. NOAA GFS·ECMWF IFS의 저층·중층·상층 구름 및 강수 7일 모델 frame
4. 기존 태풍 과거 경로, 공식 예보, ECMWF 결정론·앙상블 진로

기존 `prototype/index.html`과 공개 첫 Earth 화면은 바꾸지 않는다. 새 엔진은 별도 URL에서 운영 증거를 만든 뒤에만 향후 Ambient Earth 후보가 된다.

## 2. 현재 결함

- 현재 Earth는 Cesium ellipsoid 위에 Blue Marble·도시 불빛·구름 이미지를 합성한다. 구면은 3D지만 표면 재질과 구름은 imagery layer다.
- 현재 구름 깊이는 고정 12km 시각 offset과 저해상도 그림자다. 구름 자체의 체적·시차·자체 명암이 아니다.
- `aws/fx-grid`의 기존 +120시간 자료는 동아시아 기압·바람뿐이며 미래 구름이 없다.
- `aws/gmgsi-clouds`는 최신 `global.png`만 공개하므로 과거 구름 재생 frame이 없다.
- 822의 `VOLUME` 계약은 수직 근거를 요구하지만 운영 구름은 아직 그 계약을 충족하지 않는다.

따라서 `newearthus.html`의 현재 상태는 `STYLE_PROTOTYPE`이며 목표 상태가 아니다.

## 3. 데이터 진실 계약

### 3.1 시간 모드

| 구간 | 자료 | 화면 상태 |
|---|---|---|
| 과거 | NOAA GMGSI 시간별 보존본 | `SATELLITE_OBSERVED_PAST` |
| 현재 | 최신 NOAA GMGSI + 최신 모델 분석/첫 frame | `SATELLITE_OBSERVED_NOW` + `MODEL_ANALYSIS_VERTICAL_SUPPORT` |
| +0~72h | GFS·ECMWF 3시간 frame | `MODEL_FORECAST_PRIMARY` |
| +75~120h | GFS·ECMWF 3시간 frame | `MODEL_FORECAST_MEDIUM` |
| +126~168h | GFS·ECMWF 6시간 frame | `MODEL_OUTLOOK_EXTENDED` |

과거 관측과 미래 모델 사이에는 화면·문구·material 경계를 둔다. 마지막 위성 frame을 미래로 이동시키지 않는다.

### 3.2 예측 소스

- NOAA GFS access: Open-Meteo GFS API `/v1/gfs`; 원 모델 NOAA GFS, access/normalization Open-Meteo.
- ECMWF access: Open-Meteo ECMWF API `/v1/ecmwf`; 원 모델 ECMWF IFS, access/normalization Open-Meteo.
- 각 source는 별도 frame을 보존한다. 평균 구름장이나 평균 태풍 경로를 만들지 않는다.
- `공통 영역`은 두 모델 channel의 `min(gfs, ecmwf)`이며 평균이 아니다.
- `차이`는 channel별 절대차다.
- 모델 회차가 응답에 없으면 `issuedAt=null`로 보존하고 화면에 `회차 미제공`으로 표시한다. `retrievedAt`을 회차처럼 쓰지 않는다.

### 3.3 구름·비구름 의미

- forecast pack R/G/B는 low/mid/high cloud cover 0–100%다.
- A는 같은 모델·같은 valid time의 precipitation 0–25mm/h quantized 값이다.
- `비구름`은 같은 모델에서 구름 cover와 precipitation이 동시에 존재하는 영역이다.
- 위성 alpha는 현재 cloud footprint다. 모델 저·중·고층 field가 있는 경우에만 그 footprint의 수직 분포를 보강한다.
- 모델 수직 field가 없으면 관측 구름은 얇은 shell로 표시하고 `OBSERVED_2D_FALLBACK`을 고정한다.
- procedural noise는 sub-pixel edge와 조명용 시각 효과이며 coverage·값·내보내기에 사용하지 않는다.

### 3.4 태풍

- 과거: `events/cyclone-tracks.json`의 archived track.
- 공식: `events/typhoon-official.json`의 KMA/JMA/NHC 등 기관별 step.
- 모델: `events/typhoon-ecmwf.json`의 결정론·앙상블 member.
- 공식과 모델은 색뿐 아니라 line grammar로 구분한다.
- 공개 태풍 시간축은 +120시간에서 끝난다. +126~168시간 cloud outlook에서 태풍 공식 위치를 생성하지 않는다.

## 4. 렌더링 아키텍처

### 4.1 엔진

저장소에 배포 중인 `prototype/vendor/three-r184.module.min.js`를 재사용한다. 새 외부 JS 런타임을 추가하지 않는다.

```text
NewEarthEngine
  ├─ EarthSurfacePass
  ├─ NightEmissionPass
  ├─ GroundCloudShadowPass
  ├─ SphericalCloudVolumePass
  ├─ AtmospherePass
  ├─ CycloneTrackPass
  ├─ TimelineController
  └─ RenderScheduler
```

### 4.2 PBR 지구

- NASA SVS WMS Blue Marble 4096×2048 equirectangular 파생 WebP
- NASA Earth At Night 4096×2048 equirectangular 파생 WebP
- Natural Earth public-domain polygon에서 생성한 land/ocean roughness mask
- day/night terminator는 valid time의 sun direction으로 shader에서 계산
- ocean은 낮은 roughness·Fresnel highlight, land는 높은 roughness
- topography/bathymetry가 포함된 NASA surface shading을 사용하되 실제 terrain extrusion이라고 설명하지 않는다.

### 4.3 대기

- 별도 back-side atmosphere sphere
- Rayleigh 중심의 blue limb, 낮은 Mie warm edge
- 지표와 구름보다 뒤, 우주 배경보다 앞
- 데스크톱과 모바일에서 sample 수를 분리한다.

### 4.4 3D 구름

- WebGL2 desktop: inner/outer spherical shell 사이를 raymarch한다.
- density는 equirectangular forecast pack의 low/mid/high channel과 shell altitude로 계산한다.
- 위성 NOW에서는 satellite alpha가 horizontal footprint gate, 모델 분석 field가 vertical support다.
- sun-facing highlight, low-side shade, ground shadow를 같은 sun vector로 계산한다.
- mobile/save-data: 실제 low/mid/high channel을 세 concentric shell로 렌더하는 fallback. `VOLUME_LOW` 상태를 표시한다.
- desktop 24–32 steps, mobile 8–12 steps. camera interaction 중 절반으로 낮춘다.

## 5. 시간축과 상호작용

- 기본 cursor는 최신 관측이다.
- slider는 과거 frame, NOW, +3h…+120h, +126h…+168h를 명시적으로 구분한다.
- frame 전환은 두 texture를 280–420ms crossfade한다. 값 자체를 시간 보간해 새 예측값을 만들지 않는다.
- Play는 logical frame당 800ms, 최대 12fps finite transition이며 끝에서 멈춘다.
- 수동 drag/pinch/wheel을 지원한다. 자동 회전은 없다.
- 정지 시 RAF·timer·texture upload는 0이다.

## 6. Forecast collector 계약

경로: `forecast/clouds/v1/`

```json
{
  "schemaVersion": "earthus.cloud-forecast.v1",
  "generatedAt": "ISO-8601",
  "grid": {"west": -180, "south": -87.5, "step": 2.5, "width": 144, "height": 71},
  "models": [{
    "id": "GFS",
    "authority": "NOAA_NCEP",
    "accessProvider": "OPEN_METEO",
    "issuedAt": null,
    "retrievedAt": "ISO-8601",
    "frames": [{"leadHours": 0, "validAt": "ISO-8601", "path": "...png", "sha256": "..."}]
  }]
}
```

- source model별 HTTP response completeness를 검증한다.
- 모든 grid point의 valid time set이 일치하지 않으면 해당 model run을 publish하지 않는다.
- frame PNG는 RGBA pack이고 input dimension·decoded byte·channel 범위를 검사한다.
- `latest.json`은 모든 frame hash 확인 후 마지막에 원자적으로 교체한다.
- schedule은 6시간 간격이다.

## 7. 과거 위성 보존

- `aws/gmgsi-clouds`의 현재 산출을 바꾸지 않고 동일 LA PNG를 immutable `clouds/history/<observedAt>.png`에도 저장한다.
- `clouds/history/index.json`은 실제 존재하는 frame만 newest-first로 기록한다.
- 최초 운영 실행은 원 source에서 안전하게 조회 가능한 최근 frame만 backfill하며 없는 시간을 만들지 않는다.
- index에서 24시간 범위만 공개하지만 object 삭제는 별도 lifecycle 승인 전 수행하지 않는다.

## 8. UI

- 지구가 desktop viewport 면적 68% 이상, mobile 높이 62% 이상을 유지한다.
- 상단: mode/source selector(`공통 영역`, `GFS`, `ECMWF`, `차이`).
- 하단: 시간축, play/pause, NOW, +5일 경계, +7일 extended boundary.
- Truth strip: observed/forecast/extended, source, issued/valid/retrieved time, spatial resolution.
- 태풍 toggle은 실제 active/preserved storm이 있을 때만 보인다.
- 범례와 이름을 가려도 3초 안에 surface/cloud/rain-cloud/typhoon이 구분되어야 한다.

## 9. 성능·장애·보안

- Desktop interaction ≥45fps target, Mobile ≥30fps target.
- 정지 3초 extra render 0.
- adjacent frame texture만 유지하고 cursor 이동 뒤 stale texture를 dispose한다.
- WebGL2 미지원·context loss·memory pressure는 mobile multi-shell로 fail over한다.
- 외부 raster URL을 runtime에서 받지 않는다. NASA 파생 asset과 forecast packs는 same-origin이다.
- forecast collector는 고정 host·path allowlist, dimension·response byte·timeout·batch 상한을 가진다.
- 한 provider 실패 시 다른 provider는 유지하되 `PARTIAL_PROVIDER`를 표시한다. 공통 영역은 숨긴다.

## 10. 비범위

- 기존 `index.html`의 Cesium Earth 교체
- 55개 메뉴 전체를 새 renderer로 이관
- KMA 로그인/API key가 필요한 KIM GRIB의 무승인 수집
- 자체 예보·단일 종합 태풍 경로·기관 평균
- 판매·구독 flag 변경
- 실제 iPhone/Android 물리기기 E2E를 headless browser로 대체

## 11. 수용 조건

1. 레퍼런스와 같은 큰 구형 실루엣, blue limb, day/night, ocean highlight, city lights가 보인다.
2. camera 회전에서 cloud body와 surface 사이 parallax가 보인다.
3. NOW cloud는 NOAA observation time을 표시하고, forecast cursor에서는 위성 cloud를 유지하지 않는다.
4. GFS·ECMWF·공통·차이 frame이 실제 source와 valid time으로 전환된다.
5. +120h 뒤 UI는 `장기 모델 전망`, 태풍 official은 unavailable이다.
6. 비구름은 cloud+precip 동시 영역만 보인다.
7. desktop 1280×720, 1440×900, mobile 390×844에서 overflow 0·44px·console/page error 0.
8. play 종료 뒤 3초 extra render 0, texture/group 수가 baseline으로 복귀한다.
9. live S3/CloudFront bytes·MIME·cache와 browser screenshot을 확인한다.
