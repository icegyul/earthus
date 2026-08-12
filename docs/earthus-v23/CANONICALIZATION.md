# CANONICALIZATION — EARTHUS v2.3

> 상태: v1 로컬 구현 정본. 대표 3 compatibility adapter와 fixture 검증 완료.
> AWS 배포·authoritative reader 전환 전까지 운영 schema가 아님.

## 1. Canonical envelope

```json
{
  "schemaVersion": "earth.signal.v1",
  "signalId": "kma:aws-1min-temperature:natural-key-hash:revision-hash",
  "signalType": "weather.surface.temperature",
  "identity": { "naturalKey": "108|temperature|202608120900" },
  "geometry": { "type": "Point", "coordinates": [126.98, 37.57] },
  "crs": "EPSG:4326",
  "sourceCrs": "EPSG:4326",
  "coordinateTransform": null,
  "issuedAt": null,
  "observedAt": "2026-08-12T00:00:00Z",
  "validFrom": "2026-08-12T00:00:00Z",
  "validTo": null,
  "receivedAt": "2026-08-12T00:01:04Z",
  "sourceTimezone": "Asia/Seoul",
  "sourceTimeRaw": { "observedAt": "202608120900" },
  "timePrecision": {
    "issuedAt": null, "observedAt": "MINUTE", "validFrom": "MINUTE", "validTo": null
  },
  "value": 21.0,
  "unit": "Cel",
  "sourceValue": 21.0,
  "sourceUnit": "Cel",
  "conversion": null,
  "vertical": null,
  "missingReason": null,
  "revision": "202608120900:content-hash",
  "supersedes": null,
  "region": null,
  "source": {
    "sourceId": "kma.aws-1min.temperature",
    "provider": "Korea Meteorological Administration",
    "dataset": "AWS 1-minute observations",
    "url": "https://apihub.kma.go.kr/",
    "termsUrl": "https://www.kogl.or.kr/",
    "licenseStatus": "APPROVED_ATTRIBUTION",
    "attribution": "기상청 방재기상관측 AWS 매분자료 (API허브)",
    "snapshotGeneratedAt": "2026-08-12T00:01:00Z"
  },
  "quality": { "status": "OK", "reasons": [], "n": 1 },
  "processor": {
    "name": "earthus-signal-foundation",
    "adapter": "kma-aws-temperature-v1",
    "version": "sha256:code-hash"
  }
}
```

## 2. 시간

- 저장 정본은 UTC RFC 3339 초 단위와 `Z`다.
- 원문 시각·timezone·offset을 함께 보존한다.
- `issuedAt`, `observedAt`, `validFrom`, `validTo`, `receivedAt`을 섞지 않는다.
  provider의 `generatedAt`은 `source.snapshotGeneratedAt`과 원 입력 metadata에 보존한다.
- 기간은 `[validFrom, validTo)`다.
- 각 시각의 `timePrecision`은 `SECOND/MINUTE/HOUR/DAY` 중 원자료 의미에 맞게 둔다.
  날짜만 있는 자료는 임의로 정오를 넣지 않고 precision을 `DAY`로 둔다.
- DST 중복 시각은 offset 없는 local time만으로 식별하지 않는다.
- 24/48시간 lead는 파일 도착 시각이 아니라 valid time과 issue time 차이로 계산한다.

## 3. 좌표와 geometry

- canonical CRS는 WGS84 `EPSG:4326`이다.
- GeoJSON 배열은 `[longitude, latitude]`; 객체 field는 `lat`, `lon`을 명시한다.
- provider 원 좌표와 `sourceCrs`를 보존한다.
- 변환 시 library, version, grid file, axis order를 `coordinateTransform`에 기록한다.
- 날짜변경선을 넘는 선·면은 geometry를 분할하고 360° 연결선을 만들지 않는다.
- 장소가 시·군/해역 단위면 정밀 point로 바꾸지 않고 polygon/region code를 유지한다.

## 4. 수직 기준

`vertical.reference`는 다음 중 하나여야 한다.

- `MSL_M`: 평균해수면 기준 높이 m
- `AGL_M`: 지표 기준 높이 m
- `PRESSURE_HPA`: 등압면 hPa
- `DEPTH_M_POSITIVE_DOWN`: 해수면 아래 수심 m
- `MODEL_LEVEL`: 모델 고유 층, 원 metadata 필수

높이·수심·pressure level을 같은 숫자로 정렬하거나 평균하지 않는다.

## 5. 단위

| 물리량 | canonical | 허용 source 예 | 표시 변환 |
|---|---|---|---|
| 기온 | `Cel` | K, °C | 사용자 단위는 UI에서만 |
| 풍속 | `m/s` | kt, km/h, m/s | 원값·변환 version 보존 |
| 기압 | `hPa` | Pa, hPa | 해면/상층 reference 분리 |
| 강수 | `mm` 또는 `mm/h` | kg/m², mm | 누적과 강도를 섞지 않음 |
| 파고·수심 | `m` | cm, m | vertical reference 필수 |
| 방향 | `deg_true` | meteorological from/to | from/to semantic 필수 |
| 농도 | dataset별 `ug/m3` 등 | ppm, ppb, µg/m³ | 물질·온압 기준 필수 |

변환은 `sourceValue`, `sourceUnit`, `conversionId`, `conversionVersion`을 남긴다.

## 6. 결측과 품질

값이 없으면 `value=null`과 아래 `missingReason` 중 하나를 사용한다.

```text
NOT_REPORTED, OUT_OF_COVERAGE, BELOW_DETECTION, SENSOR_OFFLINE,
PROVIDER_DELAY, PARSE_REJECTED, RIGHTS_BLOCKED, REGION_UNMAPPED,
TIME_UNCERTAIN, QUALITY_REJECTED, NOT_APPLICABLE
```

- 결측을 0, 최솟값, 평균, 안전값으로 바꾸지 않는다.
- `UNKNOWN`은 Safety/availability/closure의 긍정 상태가 아니다.
- parser가 버린 행 수와 reason code를 provider health에 남긴다.

## 7. 지역 mapping

- `sourceRegionCode`, `canonicalRegionId`, `mappingVersion`, `effectiveAt`을 저장한다.
- 기상특보 시·군 178개와 해역 44개 mapping은 공식 code fixture로 만든다.
- 행정구역 개편·해역 코드 변경은 기존 revision을 덮어쓰지 않는다.
- mapping 실패는 `REGION_UNMAPPED`이며 Hard Gate를 통과시키지 않는다.

## 8. PR-01 Golden fixture

| ID | 입력 | 기대 |
|---|---|---|
| CAN-01 | KST `202608120900` | UTC `2026-08-12T00:00:00Z`와 원문 보존 |
| CAN-02 | DST 중복 local time | offset 없으면 `TIME_UNCERTAIN` |
| CAN-03 | 179E→179W line | 날짜변경선에서 geometry 분할 |
| CAN-04 | EPSG:5186 point | 기준 지형과 대조한 EPSG:4326, transform version |
| CAN-05 | 수심 `-4300m` source | `4300`, `DEPTH_M_POSITIVE_DOWN` |
| CAN-06 | 강수 결측 | `null/NOT_REPORTED`, 0 금지 |
| CAN-07 | 특보 지역 미매핑 | Safety `UNKNOWN`, CTA 제한 |
| CAN-08 | 동일 signal 정정 | 새 revision과 `supersedes` 연결 |

## 9. PR-01 구현 상태

- 코드: `aws/signal-foundation/`
- schema: `schema/earth-signal-v1.schema.json`, `earth-signal-batch-v1.schema.json`
- 대표 입력: KMA 특보, KMA AWS 기온, NOAA GFS TPW
- 산출물: 공개 원본과 분리된 `archive/canonical/v1/` shadow
- 로컬 자동검사: CAN-01~08을 포함한 12개 통과
- 실제 공개 입력 read-only 대조: 특보 29건, AWS 736지점, parser 거절 0

운영 gate와 정확한 제한은 `SIGNAL_FOUNDATION.md`를 따른다.

## 10. PR-02 source identity 확장

PR-02는 signal의 `source.sourceId`를 필수로 하고 batch에도 같은 source metadata를 둔다.
활성 특보가 0건이라 signal 배열이 비어도 provider/dataset/terms/attribution/license status와
snapshot 시각을 잃지 않기 위해서다. registry 평가는 문자열 provider명이 아니라 안정된
`sourceId`로 연결하며, signal과 batch의 identity가 다르면 `SOURCE_ID_MISMATCH`로 차단한다.
