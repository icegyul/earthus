# DATA SOURCE MATRIX — EARTHUS v2.3

> 코드 스냅샷: 2026-08-12
> 규칙: 출처 문자열만 있다고 권리가 승인된 것은 아니다. `display`, `cache`, `history`,
> `derivative`, `redistribution`, `paidExport`, `AI`를 별도 gate로 판단한다.

## 1. 상태 코드

- `APPROVED_FREE`: 현재 무료 표시 범위에서 출처 조건을 지킬 수 있음
- `CONDITIONAL`: 범위·호출량·표시·share-alike 조건을 지켜야 함
- `BLOCKED_PAID`: 무료/연구 표시와 별개로 유료·API·내보내기 금지
- `BLOCKED_ALL`: 현재 제품 경로에 사용하지 않음
- `UNKNOWN`: 공식 약관·계약·운영 응답 확인 전 사용 확대 금지
- `INTERNAL`: 이미 승인된 입력을 재가공하는 내부 산출물. 입력 권리를 승계함

## 2. 핵심 source family

| Source family | Adapter coverage | region/freshness | 권리·재배포 | P0 판정 |
|---|---|---|---|---|
| 기상청 APIHub·공공데이터 | `kma-*`, `khoa-coast`, `air-korea`, `forest-fire`, `quake-asia`, `typhoon-official`, `gts-global` 일부 | 한국·근해, adapter별 상이 | 다수 공공누리 제1유형. 실제 dataset별 표기 재확인 | `APPROVED_FREE`, dataset별 gate |
| 기상청 Wind Profiler | `kma-upper` | 19지점 응답·L 약 5km/H 약 12km·10분 UTC, 운영 3,234 고도행 | 공공누리 제1유형 출처표시, source/time/QC 보존 | 무료 display `APPROVED_FREE`; Skew-T·유료 export 별도 gate |
| 기상청 기상특보 조회서비스 | `kma-warn` Hard Gate | 공식 계층 414개(육상 301·해역 113), 발표/대치/해제 | 무료·공공누리 제1유형 | hierarchy `APPROVED_FREE`; polygon authoritative mapping `UNKNOWN` |
| 일본 기상청 JMA/VAAC | `jma-amedas`, `jma-warn`, `lightning`, `quake-asia`, `tokyo-vaac`, `typhoon-official` | 일본·서태평양 | 출처와 Japan Public Data License 범위 기록 | 재배포 범위별 `CONDITIONAL` |
| 대만 CWA | `cwa-observations` | 대만 관측 | 인증 parameter와 CWA Open Data 조건 | `CONDITIONAL` |
| Open-Meteo hosted API | `air-grid`, `air-state`, `atmos-transport-spike`, `cyclone-analog`, `fx-grid`, `kma-verify`, `marine-ea`, `marine-grid`, `pressure-grid`, `wind-grid` | 전지구·모델별 | 데이터 CC BY 4.0과 hosted API 이용권은 별도. 무료 endpoint는 비상업용 | `BLOCKED_PAID` |
| CIMSS MIMIC-TPW2 | adapter 없음·UI 해상도 참고만 | 실험적 전지구 TPW 합성 | 비상업 이용·출처표기 조건. 이미지·색표·파일을 EARTHUS에 복제하지 않음 | 제품 ingest `BLOCKED_ALL` |
| ECMWF Open Data | `ecmwf-ingest` | 전지구, run별 | 코드상 CC BY 4.0 표기 | 원문·attribution·버전 fixture 후 `CONDITIONAL` |
| Met Office DataHub | `metoffice-uk` | 영국 36곳 | 무료 plan 360 calls/day 확인. 재표시·cache·redistribution 조건 미확인 | `UNKNOWN` |
| NOAA/NWS/NHC/USGS/NASA | `archiver`, `ascat-observations`, `cyclone-analog`, `eclipse-path`, `gk2a-clouds`, `gmgsi-clouds`, `gts-global`, `land-stations`, `ocean-solar`, `tpw-grid`, `tsunami-intl`, `wildfire`, `world-alerts` | 전지구/미국/해양. TPW는 GFS 0.25°→1° 동아시아 | 미국 정부 자료가 많지만 dataset·이미지별 metadata/제3자 credit 확인. TPW는 NOAA/NCEP 원본 직접 | TPW `APPROVED_FREE`, 그 외 dataset별 `CONDITIONAL` |
| Esri World Boundaries and Places | PR-04 read mode reference tiles | 전지구 경계·지명, zoom에 따른 coverage | 화면 표시 중 Esri·Garmin·HERE·OSM·GIS community attribution 직접 노출. EARTHUS cache/history/export/derivative/AI 금지 | display-only `CONDITIONAL` |
| Natural Earth coastline | Data View 흰색 해안선 정적 reference | 전지구 1:110m, 동아시아 110–155°E·15–55°N 1:10m | 모든 raster/vector가 public domain. pinned source commit과 화면 출처 보존 | 시각 reference `APPROVED_FREE`; 영토·안전 geometry 금지 |
| adsb.lol | `flight-track` | 공급 coverage와 지연에 따름 | API·공개 DB ODbL, attribution/share-alike. 운영 사용은 공급자 연락 권고 | `CONDITIONAL`, SLA 판매 금지 |
| 에코뱅크 | `ecobank`, `ecobird` | 한국 생태 조사 | 제1유형 표기와 제3자 권리 포함 | `BLOCKED_PAID` |
| 바다거북 | `sea-turtle` | 공개 이동 경로 | 공공누리 제4유형: 비상업·변경금지 | `BLOCKED_PAID`, 파생/정밀좌표 제한 |
| 철새·바닷새 | `migbird`, `seabird` | 한국/해양 | 코드상 이용허락범위 제한 없음. 민감 위치 별도 | dataset 원문 재검증 전 `CONDITIONAL` |
| OBIS | `obis-summary` | 전지구 해양 생물 | OBIS 인용·dataset별 원 출처·민감 위치 승계 | `CONDITIONAL` |
| GVP | `regional-hazards` | 전지구 화산 | 비상업 기본. 상업 사용은 Smithsonian/권리자 사전 서면 허가 필요 | `BLOCKED_PAID` |
| GDELT | `gdelt-events` | 전지구 뉴스 이벤트 | unrestricted 주장과 인용 요구를 코드가 기록 | 원문·media 권리는 별도, `CONDITIONAL` |
| 지역 RSS | `regional-news` | 지역별 매체 | headline/link만. 기사 본문·이미지 보관 금지 | `CONDITIONAL` |
| Nevada Geodetic Lab | `crustal` | GNSS coverage | 이용조건과 재배포 범위 재확인 필요 | `UNKNOWN` |
| GEBCO/심해 manifest | `ocean-depth` | 전지구 수심/해구 | manifest의 source·DOI·credit을 응답에 승계 | manifest 검증 후 `CONDITIONAL` |
| Anthropic API | `news-brief` | 내부 요약 | 모델 이용조건·개인정보·비용·근거 claim 계약 필요 | 사용자 사실 생성 금지, `UNKNOWN` |
| 내부 파생·운영 | `air-evidence-archive`, `health`, `lab-report-index`, `mountain-verify`, `push-tick`, `signal-foundation`, `source-governance`, `social-draft`, `vaac-validation` | 입력과 동일 | 새 권리를 만들지 않으며 가장 엄격한 입력 권리를 승계 | `INTERNAL` |

## 3. 66개 handler 인벤토리

아래 목록은 현재 `aws/*/handler.py`를 빠짐없이 고정한 것이다. 이 중 source/data handler는
64개이고 `signal-foundation`, `source-governance`는 기존 출력을 읽는 미배포 shadow processor다.

```text
air-evidence-archive  air-grid             air-korea            air-state
archiver              ascat-observations   atmos-transport-spike crustal
cwa-observations      cyclone-analog       eclipse-path         ecmwf-ingest
ecobank               ecobird              flight-track         forest-fire
fx-grid               gdelt-events         gk2a-clouds          gmgsi-clouds
gts-global            health               jma-amedas           jma-warn
khoa-coast            kma-aws              kma-aws-min          kma-fcst
kma-life              kma-lightning        kma-mountain         kma-normal
kma-ocean             kma-upper            kma-verify           kma-warn
lab-report-index      land-stations        lightning            marine-ea
marine-grid           metoffice-uk         migbird              mountain-verify
news-brief            obis-summary         ocean-depth          ocean-solar
pressure-grid         push-tick            quake-asia           regional-hazards
regional-news         sea-turtle           seabird              signal-foundation
social-draft          source-governance    tokyo-vaac           tpw-grid
tsunami-intl          typhoon-official     vaac-validation       wildfire
wind-grid             world-alerts
```

## 4. 2026-08-12 공식 재확인

- 기상청 기상특보 조회서비스는 12개 현상, 178개 시·군, 44개 해역에 대한
  목록·통보문·현황을 제공하며 무료·공공누리 제1유형으로 표시된다.
  <https://www.data.go.kr/data/15000415/openapi.do>
- Open-Meteo는 API 데이터가 CC BY 4.0이라고 설명하지만 무료 hosted API는
  비상업용이며, 상업 사용은 `customer-api.open-meteo.com` 구독 또는 self-host가 필요하다.
  <https://open-meteo.com/> · <https://open-meteo.com/en/pricing>
- GVP는 개인·교육·비상업 사용을 기본으로 하고 상업 사용은 사전 서면 허가가 필요하다고 명시한다.
  <https://volcano.si.edu/gvp_termsofuse.cfm>
- adsb.lol은 API와 공개 DB를 ODbL로 제공하고 운영 사용자는 사전 연락을 권고한다.
  <https://api.adsb.lol/>
- Met Office Global Spot 무료 plan은 하루 360 calls다. 가격 페이지 확인만으로
  재표시·cache·redistribution 권리가 확정되지는 않는다.
  <https://datahub.metoffice.gov.uk/pricing/site-specific>
- Esri World Boundaries and Places는 전지구 국경·1차 행정경계·주요 지명을 제공하며
  Esri·Garmin·HERE·OpenStreetMap contributors·GIS user community attribution을 요구한다.
  PR-04는 live display만 쓰고 별도 cache/export/derivative를 만들지 않는다.
  <https://www.arcgis.com/home/item.html?id=83f1dfd1a4f54a148ad4419df4277d76>

## 5. 응답 행 필수 metadata

모든 source는 다음 값을 registry에서 응답 행까지 전달해야 한다.

```text
sourceId, provider, dataset, sourceUrl, termsUrl, attribution,
region, observedAt/issuedAt/validAt/receivedAt, freshnessPolicy,
display, cache, history, derivative, redistribution, paidExport, APIResale, AI,
policyVersion, reviewedAt, reviewDueAt, owner, status
```

`reviewDueAt`이 지났거나 source가 `BLOCKED/EXPIRED`면 기존 cache가 있어도 새 publish/export/AI
응답에서 제외한다. 제거가 안전 의미를 만들면 `POLICY_BLOCKED`를 표시한다.
