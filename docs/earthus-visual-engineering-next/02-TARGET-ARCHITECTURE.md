# 02. Target Architecture

## 1. 목표 컴포넌트

```text
SatelliteFrameContract
  ├─ NOAA GMGSI adapter
  ├─ GK-2A adapter
  └─ Himawari/GIBS adapter
           │
           ▼
SatelliteVisualPipeline
  ├─ observation/provenance validation
  ├─ source mask strategy
  ├─ shared tile promise cache (bounded)
  ├─ worker mask processor
  └─ quality/budget policy
           │
           ▼
ImageryLayerGroup
  ├─ base observation layer
  ├─ visual-only depth sibling
  ├─ credits/limits
  └─ dispose/abort/metrics
```

천구는 별도 파이프라인으로 둔다.

```text
SkyAssetSource
  → reproducible derivation
  → asset manifest + license registry
  → capability/thermal quality selector
  → Cesium sky panorama
  → context-loss fallback
```

## 2. SatelliteFrameContract v1

```json
{
  "schema": "earthus.satellite-frame.v1",
  "provider": "NOAA_GMGSI | GK2A | HIMAWARI_GIBS",
  "channel": "string",
  "observedAt": "ISO-8601",
  "publishedAt": "ISO-8601|null",
  "area": "FD | EA | LA | GLOBAL",
  "bbox": { "west": 0, "south": 0, "east": 0, "north": 0 },
  "resolutionKm": 0,
  "signalPercent": 0,
  "pixelEncoding": "gray-alpha | rgba-palette | visible-rgb",
  "alphaMeaning": "cloud-confidence | processed-mask | none",
  "usable": { "day": true, "night": false },
  "provenance": {
    "producer": "string",
    "distributor": "string",
    "processingVersion": "string",
    "sourceUrl": "https://...",
    "licenseId": "string"
  }
}
```

검증 실패는 빈 화면을 정상처럼 내지 않는다. `UNAVAILABLE`, `STALE`, `UNUSABLE_AT_NIGHT`,
`SCHEMA_MISMATCH`, `CORS_BLOCKED`, `DECODE_FAILED` 중 하나로 기록하고 화면 설명과 연결한다.

## 3. 시각 효과 계약

```json
{
  "schema": "earthus.visual-effect.v1",
  "id": "cloud-depth",
  "classification": "visual-only",
  "sourceFrameId": "provider/channel/observedAt",
  "mode": "sun-shadow | relief",
  "mask": "source-alpha | conservative-visible | infrared-luma",
  "physicalMeasurement": false,
  "exportable": false,
  "decisionInput": false,
  "parametersVersion": "cloud-depth-ko-v1"
}
```

`physicalMeasurement=false`인 효과는 API, CSV, 개인 기록, 위험 점수, 추천에 들어갈 수 없다.

## 4. ImageryLayerGroup 상태 머신

```text
IDLE
  → LOADING_SOURCE
  → VALIDATING_FRAME
  → CREATING_BASE
  → CREATING_VISUAL_SIBLING
  → ACTIVE
  → REPLACING → ACTIVE
  → DISPOSING → DISPOSED

어디서든 abort/error
  → BASE_ONLY (시각 효과만 실패)
  → UNAVAILABLE (본체도 실패)
```

불변식:

- ACTIVE 그룹은 base 1개, visual sibling 0~1개만 가진다.
- sibling은 base보다 아래에 있다.
- base가 제거되면 sibling, pending tile task, object URL, timer, event subscription도 제거된다.
- 새 프레임 교체 성공 전까지 이전 ACTIVE를 보존한다.
- 시각 효과 실패는 본체 관측 영상을 제거하지 않는다.

## 5. 공유 타일 처리

- 원본 요청 키: `provider/channel/observedAt/z/x/y`.
- base와 visual sibling은 같은 `Promise<ImageBitmap>`을 공유한다.
- 완료/실패 promise는 bounded LRU에 짧게 보존한다.
- abort된 화면의 작업은 worker queue에서 취소한다.
- worker 입력 해상도는 품질 profile과 타일 크기로 제한한다.
- 인접 타일 gutter 또는 지리 좌표 샘플링으로 seam을 방지한다.
- CORS로 화소 접근이 막히면 base-only로 폴백하고 telemetry를 남긴다.

## 6. SourceMaskStrategy

| 소스/채널 | 마스크 | 표현 | 금지 |
|---|---|---|---|
| NOAA GMGSI LA | 서버 alpha | 관측 시각 낮 그림자 | 높이 관측값 표기 |
| GK-2A 가시광 | 서버 alpha | 관측 시각 낮 그림자 | 야간 표시 |
| GK-2A 적외 | 서버 alpha | 약한 relief | 태양 그림자 주장 |
| GK-2A 야간 하층운 | 서버 alpha | 약한 relief | 구름 높이 주장 |
| GK-2A 수증기 | 없음 | 효과 미적용 | 구름층으로 표현 |
| Himawari 가시광 | 승인 cloud mask 우선, 없으면 보수적 visible | 낮 그림자 | 지표를 강한 구름으로 추정 |
| Himawari Band 13 | palette/luma 계약 | 약한 relief | 강수량 표현 |

## 7. SkyAssetManifest v1

```json
{
  "schema": "earthus.sky-asset.v1",
  "source": {
    "title": "The Milky Way panorama",
    "creator": "ESO/S. Brunier",
    "license": "CC-BY-4.0",
    "url": "https://www.eso.org/public/images/eso0932a/",
    "sha256": "..."
  },
  "transform": {
    "gamma": 1.25,
    "brightness": 0.70,
    "resample": "lanczos",
    "scriptVersion": "v1"
  },
  "variants": [
    { "id": "desktop-6k", "width": 6000, "height": 3000, "sha256": "..." },
    { "id": "mobile-4k", "width": 4096, "height": 2048, "sha256": "..." }
  ]
}
```

원본 사진 구조를 생성·삭제하지 않는 전역 tone transform만 허용한다. 추가 편집은 새
processingVersion과 시각 검수를 요구한다.

## 8. QualityProfile

입력:

- viewport, DPR, maximumTextureSize
- deviceMemory가 있을 때의 힌트
- WebGL context loss 이력
- page visibility, reduced motion, save-data
- 최근 mask task p95, frame time, memory pressure 신호

출력:

- sky: 6K / 4K / 2K-static
- cloud mask sampling: 128 / 64 / off
- blur: GPU/worker-supported / simple / off
- 동시 visual tile task 수

낮은 profile에서도 본체 관측 영상과 출처·시각은 유지하고 시각 효과만 단계적으로 줄인다.

## 9. 관측성과 로그

필수 지표:

- `satellite_tile_base_requests_total`
- `satellite_tile_depth_requests_total`
- `satellite_tile_dedupe_hit_ratio`
- `cloud_mask_ms_p50/p95`
- `cloud_mask_cors_fail_total`
- `imagery_group_active`, `imagery_group_disposed`
- `visual_depth_fallback_total{reason}`
- `sky_variant_selected{variant}`
- `webgl_context_lost_total`
- `idle_render_count_3s`

정밀 위치, 검색어, 개인 식별자, 전체 URL query는 로그에 넣지 않는다.
