# EARTHUS 상업 이용 가능 자료원 조사 (2026-09-27)

목적: 2027-01-01 유료 전환 전에 Open-Meteo 무료 API(비상업 전용)를 상업 이용 가능한 자료로 바꾼다.
표기: **VERIFIED** = 공식 페이지를 이번에 직접 읽음 · **UNVERIFIED(검색 발췌)** = 검색 결과 요약만 봄 · **UNVERIFIED** = 확인 못 함.
가격은 2026-09 기준이며 바뀔 수 있다. 법률 자문이 아니다 — 계약 전에 원문 약관을 다시 확인할 것.

---

## 0. 먼저 알아야 할 것 (판정이 바뀌는 지점)

1. **Open-Meteo 무료 API = 비상업 전용.** 광고·구독이 있는 사이트나 상용 제품은 제외된다(약관, VERIFIED). 유료 요금제만 상업 이용 허가를 준다. 유료로 가도 자료 자체는 CC BY 4.0이라 **출처 표시는 계속 필요**하다. AGPL은 Open-Meteo 서버 코드를 우리가 직접 돌릴 때만 문제가 된다.
2. **ECMWF 오픈데이터(CC BY 4.0)는 상업 이용과 재배포를 허용한다**(VERIFIED). GFS 파이프라인을 그대로 늘려 쓸 수 있는 가장 좋은 대체재다.
   ⚠️ **IFS 50r1(2026-05)부터 ENS 오픈데이터 파일에는 섭동 멤버 50개만 들어 있다.** 컨트롤 예보는 `stream=oper` 로 따로 받는다(ECMWF Confluence, VERIFIED).
   → AGENTS.md 에 적힌 "51개 중 38개" 같은 근거 문장은 **"50+컨트롤"** 로 계산해 적어야 한다.
   AIFS 앙상블은 오픈데이터에 없다.
3. **Copernicus Marine(CMEMS)는 2028-06-30까지 무료**이고 상업 이용과 파생물 배포가 허용된다(VERIFIED). 전 지구 1/12° 파랑 자료에 1차·2차 너울 분리가 들어 있다. GFS-Wave JPEG2000 문제를 우회하는 가장 좋은 경로다.
4. **에어코리아는 공공누리 제3유형(출처표시+변경금지)이다**(data.go.kr, VERIFIED). 상업 이용은 되지만, 관측값을 보간해 격자로 만드는 것이 '변경'에 해당하는지는 한국환경공단에 서면으로 확인해야 한다.
5. **데스크톱 '지구 팩'에 미리 받아 넣을 수 있는 지도·영상**은 다음 여섯뿐이다.
   - 직접 호스팅하는 OSM(Protomaps, OpenMapTiles 빌드)
   - NASA(CC0)
   - s2cloudless **2016년판만**
   - Copernicus DEM
   - GEDTM30
   - NOAA·ECMWF·CMEMS 파생 자료

   Google, Mapbox, Esri, OSMF 공개 타일, 네이버, 카카오는 금지되거나 기기별 캐시만 허용된다.

---

## A. 원시 모델 자료 (자체 파이프라인)

### A1. NOAA GFS 0.25° / GEFS — **VERIFIED (NODD 등록 페이지)**
- 제공: GFS 0.25° 격자, 4회/일(00·06·12·18Z). 예보 0~240h는 3시간, 240~384h는 12시간 간격. GEFS 앙상블도 NODD에 있다.
- 접근: S3 `noaa-gfs-bdp-pds`(us-east-1, 인증 없음), NOMADS grib filter.
- 라이선스: NODD 문구 "open to the public and can be used as desired". 원자료를 그대로 쓸 때는 출처 표시를 요청한다. 가공한 자료를 NOAA 원자료처럼 보이게 하면 안 된다. 사실상 퍼블릭 도메인이다(미국 정부 저작물).
- 비용: 무료. 한국 제한: 없음.
- 할 일: 지금 0.5° 파이프라인을 0.25°로 올리면 된다. 저장량이 약 4배 늘어난다.

### A2. NOAA GFS-Wave (WAVEWATCH III) — 라이선스 VERIFIED(NODD 공통) / 디코딩 UNVERIFIED
- 격자: global.0p16, gsouth.0p25, arctic.9km. GFS 버킷의 `wave/gridded/` 아래에 있다.
- 막힌 원인: GRIB2 템플릿 5.40(JPEG2000). grib2lite 가 읽지 못한다.
- 해결 후보(이번에 검증하지 않음):
  - ① ecCodes/cfgrib(OpenJPEG 포함)로 읽는다.
  - ② `wgrib2 -set_grib_type c3` 등으로 단순·복합 패킹으로 다시 싼 뒤 기존 디코더에 넣는다.
  - ③ 아래 A4의 ECMWF 파랑 자료나 B1의 CMEMS 파랑 자료로 우회한다.

### A3. NOAA RTOFS (해류) — **VERIFIED**
- 1/12°, 41층, 3극 격자. 수온·염분·유속·해면고·해빙을 준다. 예보 8일, 하루 1회.
- 00z 분석 → 06z 1~4일 → 12z 5~8일 순서로 나온다.
- S3 `noaa-nws-rtofs-pds`. NODD 라이선스(자유 이용, 출처 표시 요청).
- 참고: 3극 격자라서 위경도 격자로 다시 투영해야 한다. 작업 난이도 중.

### A4. ECMWF 오픈데이터 (IFS · AIFS · ENS · 파랑) — **VERIFIED**
- 라이선스: **CC BY 4.0**. 페이지 문구는 "may be redistributed and used commercially, subject to appropriate attribution".
- 해상도·주기:
  - 0.25° GRIB2, 4회/일, IFS·AIFS 모두 최대 360h(15일).
  - 기압면 14개(1000~10 hPa).
- ENS:
  - 00·12Z는 360h, 06·18Z는 144h.
  - 멤버 수는 0번 항목 참고(50r1부터 섭동 50개).
- 파랑:
  - 결정론 파랑(`wave`)과 앙상블 파랑(`waef`) 둘 다 0.25°. 결정론 파랑은 최대 240h.
  - 변수: swh(유의파고), mwd(평균파향), mwp(평균파주기) 등.
- 접근:
  - data.ecmwf.int, AWS·Azure·GCP 미러, `ecmwf-opendata` 파이썬 클라이언트.
  - 최근 12회 실행분만 보관한다. 과거 자료는 별도 서비스 계약이 필요하다.
  - 동시 접속은 500개로 제한된다.
- 출처 표시 예: "Contains modified ECMWF open data (CC BY 4.0)". 정확한 문구는 ECMWF 페이지 안내를 따른다.
- 비용: 무료. 한국 제한: 없음.

### A5. DWD ICON 오픈데이터 — **VERIFIED (DWD legal notice)**
- 라이선스: DWD의 공개 공간자료는 **CC BY 4.0**으로 재사용할 수 있다(출처 표시 조건). 상업 이용 가능.
- 주의: ICON **소프트웨어**는 비상업 연구용 라이선스다. 우리가 모델을 직접 돌리지 않으므로 해당 없다.
- 접근: opendata.dwd.de(가입 불필요), AWS에 dynamical.org Zarr 미러가 있다.
- 쓸모: 전 지구 약 13 km 모델이라 비교(⑤ Compare)용 모델로 쓸 수 있다.

### A6. JMA GSM — **UNVERIFIED**
- 기상업무지원센터(JMBSC)가 배포하고 **정보 제공 부담금(유료)** 을 받는다. 2024-04 요금이 개정됐다. 문의 haisin@jmbsc.or.jp.
- 금액은 확인하지 못했다. 우선순위 낮음.

### A7. KMA API허브 — **VERIFIED (기상청 저작권 정책)**
- 기상청은 자유 이용 자료에 **공공누리 제1유형**(출처표시만, 상업 이용·변형 허용)을 붙여 공개한다.
- ⚠️ **공공누리 표시가 없는 자료는 사전 승인 대상이다.** 제2~4유형은 각각 제한이 있다.
  - 허브에서 쓰는 자료마다 표시를 확인해야 한다.
  - 특히 기상청이 다시 제공하는 외국 위성·외국 모델 자료를 먼저 본다.
- 허브 약관에 따로 붙은 상업 조항은 **UNVERIFIED**다.
- ⚠️ 이 판정은 저작권만 본 것이다. 기상법 §17 문제는 AGENTS.md 결정을 따른다.

### A8. CMA — **UNVERIFIED**
- 조사하지 않았다. 상업 재배포 조건이 불명확해 후보에서 뺀다.

---

## B. 해양

### B1. Copernicus Marine (CMEMS) — **VERIFIED (라이선스 페이지 + 상품 페이지 2개)**
- 라이선스:
  - 전 세계·비독점·무료·영구 라이선스다.
  - "Value Added Products or Derivative Work … for any purpose" 를 만들어 배포할 수 있다. 원본 형태 그대로 재배포하는 것도 허용된다.
- **무료 기간: 2028-06-30까지.** 이후 조건은 공지되지 않았다.
- 가입과 SLA 동의가 필요하다. 자격증명은 서버(Lambda)에만 둔다.
- 출처 표시(원문 그대로):
  - 파생물: "Generated using E.U. Copernicus Marine Service Information; <DOI 링크>"
  - 원본 재배포: "E.U. Copernicus Marine Service Information; <DOI>"
- 품질 무보증 조항이 있다.
- **GLO 물리 `GLOBAL_ANALYSISFORECAST_PHY_001_024`**
  - 0.083°, 50층. 수온·염분·해류·해면고·혼합층·해빙을 준다.
  - 10일 예보, 매일 08UTC 갱신. 시간·일·월 단위.
  - **SMOC**(표층 합성 해류)에는 파랑·조석에 의한 표류가 포함된다. 입자 흐름 표현에 알맞다.
- **GLO 파랑 `GLOBAL_ANALYSISFORECAST_WAV_001_027`**
  - 0.083°, 1시간 간격, 00·12UTC 갱신, 10일 예보. MFWAM 모델(ECMWF IFS 바람으로 구동).
  - **풍랑 / 1차 너울 / 2차 너울**을 분리해 유의파고·주기·방향으로 준다. Stokes 표류도 있다.
- 접근: `copernicusmarine` 툴박스(CLI·파이썬, 부분 추출·ARCO Zarr). NetCDF-4.
- 난이도: 중. 새 클라이언트와 인증이 필요하다. 대신 5° Open-Meteo 해양 자료보다 60배 조밀하다.

### B2. HYCOM — **UNVERIFIED(검색 발췌)**
- hycom.org 자료는 퍼블릭 도메인이다. "DoD DISTRIBUTION A … Distribution Unlimited" 이지만 "demonstration product" 이고 가용성 보장이 없다.
- 운영 서비스에는 RTOFS(같은 계열, NOAA 운영)나 CMEMS가 낫다.

### B3. NOAA OISST v2.1 (0.25° 일일 해수면온도) — 자료 VERIFIED / 라이선스 UNVERIFIED
- 1981~현재, 매일 갱신. NCEI HTTPS와 ERDDAP으로 받는다.
- 이용 제약 문구는 직접 읽지 못했다. NOAA 공통 정책상 자유 이용일 것으로 보인다.
- 용도: 관측 기반 수온(분석값)과 수온 편차.

### B4. KHOA(국립해양조사원) — 부분 VERIFIED(검색 발췌)
- data.go.kr '해양관측부이 최신 관측데이터' API(2025-12 등록)는 **공공누리 제1유형**이다.
- ⚠️ **(구)바다누리 해양정보 서비스 OPEN API 종료** 공지가 2026-06-22에 있었다. 쓰고 있다면 data.go.kr·개방海 API로 옮겨야 한다.
- 조석예보 API도 data.go.kr에 있다. 개별 유형은 UNVERIFIED.

---

## C. 대기질

### C1. Copernicus CAMS 전 지구 조성 예보 — **VERIFIED (ADS 데이터셋 페이지)**
- 라이선스: 데이터셋 페이지에 "CC-BY licence" 로 적혀 있다.
  - 일부 기상 필드는 일반 CAMS 라이선스 밖이라는 언급이 있다(검색 발췌). 기상 필드는 ECMWF 오픈데이터로 받으면 된다.
- 0.4°, 5일 예보, 00·12UTC. 50종 이상의 화학종을 준다.
  - PM2.5, PM10, O₃, NO₂
  - **UV: 지표 하향 UV, UV 생물학적 유효선량** → Open-Meteo UV 대체
- 접근: ADS `cdsapi`(가입, 데이터셋별 약관 동의). GRIB, NetCDF 변환 선택.
- 비용: 무료. 난이도: 중.

### C2. 에어코리아 — **VERIFIED (data.go.kr)**
- **공공누리 제3유형(출처표시·변경금지)**. 무료다.
  - 개발 계정은 하루 500회. 운영 계정은 활용사례를 등록하고 심사를 거쳐 한도를 올린다.
- PM10·PM2.5·O₃ 실측값과 예보를 준다. ⚠️ '변경금지' 해석은 0번 4항 참고.

### C3. OpenAQ — **UNVERIFIED(검색 발췌)**
- 플랫폼 기본은 CC BY 4.0이다. 다만 라이선스는 **공급처마다 다르다**(`/v3/licenses` 의 `commercialUseAllowed` 필드).
- 한국 관측소를 쓸 때는 에어코리아 원 라이선스(3유형)가 따라온다고 보는 것이 안전하다.

---

## D. 상용 날씨 API (유료 대체·백업)

| 서비스 | 가격(월) | 상업 이용 | 표시·재배포 | 판정 |
|---|---|---|---|---|
| **Open-Meteo** | Standard **$29**(월 100만 호출, 예보·해양·대기질·고도 포함) · Professional **$99**(월 500만, +과거·앙상블·기후) · Enterprise 별도 | 유료만 | 자료 CC BY 4.0, 출처 표시 필요 | 가격은 공식 블로그 기준, 요금 페이지에는 금액이 없었다. **코드 변경 없이 바로 쓸 수 있는 다리** · VERIFIED |
| Visual Crossing | Free / Professional / Metered / Corporate / Enterprise. 금액은 **UNVERIFIED** | 전 요금제 | 화면 표시 가능. Corporate 미만은 "Weather Data Provided by Visual Crossing" 필수. **원자료 공개 재배포 금지** | 지점 예보 백업 · VERIFIED |
| WeatherAPI.com | Free 0 · Starter $7 · Pro+ $25 · Business $65 · Enterprise 별도 | 전 요금제 | 무료 요금제는 링크 권장 | 싸다. 해양은 Pro+부터 · VERIFIED |
| Stormglass(해양) | Small €19 · Medium €49 · Large €129 · Enterprise | 명시된 곳은 **Medium부터**. Small은 불명확 | 재배포 조항 미확인 | 해양 지점 백업 · VERIFIED(가격) |
| Windy Point Forecast | Professional **$990/년**(하루 1만 요청) | 가능 | **ECMWF 제외.** 무료 요금제는 일부러 흐트린 자료를 준다 | 비추천 · VERIFIED |
| OpenWeather | Startup £30 · Developer £140 · Professional £370 · Expert £1,200. One Call 4.0은 하루 1,000회 무료, 이후 £0.0012/회 | 가능 | **유료 요금제 자료가 ODbL** → 파생 DB에 동일조건(share-alike) 의무 | 격자 파생물에는 부적합 · VERIFIED |
| Tomorrow.io | Free / Enterprise(견적) | 무료는 사실상 불가 | 재배포 금지 조항(검색 발췌) | 견적 필요 · UNVERIFIED |
| Meteomatics | 공개 가격 없음(영업 견적). Core/Pro/Premium | 가능 | — | 비쌀 가능성이 높다 · UNVERIFIED |

---

## E. 배경지도·지도 타일·영상 (★ = 데스크톱 팩에 미리 받아 넣기 가능)

| 자료 | 라이선스·조건 | 오프라인·사전 다운로드 | 확인 |
|---|---|---|---|
| ★ **Protomaps PMTiles(OSM)** | "ODbL Produced Work". OSM 출처 표시 필수, 상업 이용 가능. 행성 전체 약 120 GB(z0–15), CLI `extract` 로 지역만 잘라낼 수 있다. 핫링크는 자제해야 하니 우리 S3로 복사해서 쓴다 | **가능**(직접 호스팅) | VERIFIED |
| ★ OSM 직접 빌드(OpenMapTiles 스키마 + planetiler 등) | 자료 ODbL, 출처 "© OpenStreetMap contributors". 스키마·스타일 라이선스는 UNVERIFIED | 가능 | 부분 |
| MapTiler Data(On-Prem) | Standard: 내부 앱 1개, MAU 500, **B2C 불가**. Custom: B2B·B2C 협의. **퍼블릭 클라우드 호스팅 금지**, 앱 밖으로 반출 금지 | 조건부(Custom 계약) | VERIFIED |
| MapTiler Cloud | Free(비상업) · Flex $30 · Custom | 캐시 조항은 UNVERIFIED | 가격 VERIFIED |
| Stadia Maps | Free(비상업) · Starter $20 · Standard $80 · Professional $250. 위성 타일은 4크레딧/장. 온프레미스는 Enterprise | Enterprise 협의 | VERIFIED |
| ✗ Mapbox | 캐시는 **최종 사용자 기기 한 대, 한 사용자**만. 대량 다운로드 금지, 재배포 금지. 오프라인은 모바일 SDK만, 타일팩 750 한도 | **불가**(팩 배포) | 오프라인 문서 VERIFIED, 약관 조항은 검색 발췌 |
| ✗ Google Map Tiles(3D 포함) | "must not pre-fetch, index, store, or cache". **오프라인 용도 명시 금지.** 로고와 공급자 표기 필수 | **금지** | VERIFIED |
| ✗ Esri Location Platform | 세션 토큰으로 타일을 대량 내보내기 금지(E300). 오프라인은 ArcGIS 앱 흐름에서만 | 불가(팩) | UNVERIFIED(검색 발췌) |
| ✗ OSMF tile.openstreetmap.org | 사전 받기·"Download city for offline"은 **명시 금지**, 무통보 차단. SLA 없음 | 금지 | VERIFIED |
| ★ **NASA Blue Marble / Black Marble / GIBS** | NASA 지구과학 자료는 별도 표시가 없으면 **CC0**. 인용을 강력 권고하고, NASA가 보증하는 것처럼 보이면 안 된다 | 가능 | VERIFIED(Earthdata 정책) |
| ★ s2cloudless **2016** | **CC BY 4.0** | 가능 | UNVERIFIED(검색 발췌) |
| s2cloudless 2018~2024 | **CC BY-NC-SA 4.0**. 상업은 "EOX Commercial Attribution-RestrictedUse 1.2" 유료 계약. 표기 "EOxCloudless https://cloudless.eox.at by EOX IT Services GmbH (Contains modified Copernicus Sentinel data <연도>)" | 상업은 계약에 따른다 | 라이선스 종류 VERIFIED, 연도별 구분은 검색 발췌 |
| VWorld | 무료 API, 개발키 3개월(최대 3회 연장). 약관 페이지가 열리지 않아 **UNVERIFIED**. 3D 자료는 국가공간정보 보안관리규정상 **'공개제한'이라 허가 없이 복제·출력할 수 없다**(KHOA 가이드 발췌) | 불가로 간주 | UNVERIFIED |
| ✗ 카카오맵 | API 응답 저장 금지, 가이드 밖의 리소스 접근 금지(데브톡 운영정책 답변) | 불가 | UNVERIFIED(검색 발췌) |
| ✗ 네이버 지도(NCP) | 결과 저장·DB화 금지. **2025-03-24 공지로 지도 API 신규 신청 차단, 무료 이용량 중단 예정** | 불가 | 공지 제목 VERIFIED, 세부 UNVERIFIED |

---

## F. 지형 (DEM)

| 자료 | 종류 | 라이선스 | 상업 이용 | 확인 |
|---|---|---|---|---|
| ★ **Copernicus DEM GLO-30/90** | DSM(건물·나무 포함) | 'Licence for the use of the Copernicus WorldDEM-30'. 복제·배포·공중 전달·변형이 가능하고 무료다(4·5조) | **가능**. 의무는 아래 참고 | **VERIFIED(라이선스 PDF 원문)** |
| ★ **GEDTM30 v1.2** | **맨땅 DTM** 30 m(ICESat-2·GEDI로 학습한 앙상블) | **CC BY 4.0** | 가능 | VERIFIED(Codeberg) |
| FABDEM | 맨땅 30 m | 비상업은 무료(CC BY-NC-SA 4.0), **상업은 Fathom 유료 라이선스(견적)** | 계약 필요 | VERIFIED(Fathom) |
| FathomDEM | 맨땅 30 m | **CC BY-NC-SA 4.0**, 파생물도 같은 조건 | 불가(계약 문의) | VERIFIED(Zenodo) |
| MERIT DEM | 90 m 오차 제거 | CC BY-NC 4.0 **또는 ODbL 1.0** 이중 라이선스. 상업은 ODbL이라 파생 '자료'를 공개해야 한다 | 조건부 | UNVERIFIED(검색 발췌) |
| NASADEM / SRTM | DSM 성격 | NASA 정책상 CC0/퍼블릭 도메인 | 가능 | 정책 VERIFIED, 개별 표시 UNVERIFIED |
| ALOS AW3D30 v4.1(2025-03) | DSM 30 m | JAXA 이용 약관. 상업·비상업 모두 무료. 저작권은 JAXA | 가능(표기는 earth.jaxa.jp/policy 확인) | VERIFIED |
| NGII DEM(공개) | 90 m | data.go.kr **"이용허락범위 제한 없음"**, 무료. 국토정보플랫폼(map.ngii.go.kr) 로그인 후 받는다 | 가능 | VERIFIED |
| NGII DEM 5 m | 공개제한 | 2024-03 법 개정과 2024-05-30 「공개제한 공간정보의 보안심사 규정」으로 **모든 사업자가 보안심사를 받으면 제공받을 수 있다.** 전문기관 심사 또는 '공간정보 안심구역' 온라인 신청 | 심사 후 가능. **배포 범위는 심사 조건을 따른다** | UNVERIFIED(검색 발췌) |

**Copernicus DEM 의무(6조 원문 요지)**
- 원본을 배포할 때: "© DLR e.V. 2010-2014 and © Airbus Defence and Space GmbH 2014-2018 provided under COPERNICUS by the European Union and ESA; all rights reserved."
- 가공했을 때: "produced using Copernicus WorldDEM-30 © DLR …" 문구를 쓴다.
- 앱 라이선스나 법적 고지에 **"The organisations in charge of the Copernicus programme by law or by delegation do not incur any liability for any use of the Copernicus WorldDEM-30"** 을 넣는다.
- 공식 보증처럼 보이게 하면 안 된다.
- 하위 사용자(데스크톱 팩 사용자)에게도 같은 의무를 지워야 한다.

→ **데스크톱 팩에는 원본 타일이든 가공 메시든 넣을 수 있다.** 다만 앱 약관에 위 문구가 들어가야 한다.
AWS 공개판(GLO-30 Public)은 일부 국가 타일이 빠져 있다(검색 발췌). 빠진 곳은 GLO-90으로 채운다.

**해수면 침수도(메모리의 '맨땅 DEM 선행' 과제)**
- 상업·무료·맨땅 조건을 모두 채우는 것은 **GEDTM30 하나**다.
- 한국 정밀도가 모자라면 NGII 5 m 보안심사를 병행한다.
- FABDEM·FathomDEM은 유료 계약 없이는 쓸 수 없다.

---

## G. 권고 — 현재 Open-Meteo 사용처별 대체안

| 지금 Open-Meteo로 하는 일 | 권고 대체 | 라이선스 | 비용 | 작업량 |
|---|---|---|---|---|
| 전 지구 기온·바람·습도·기압 격자(5°) | **GFS 0.25°(기존 파이프라인 해상도만 올림)** + 비교용 **ECMWF IFS 0.25°** | NOAA 자유 이용 / CC BY 4.0 | 무료(S3 저장·Lambda 시간만) | **하**: 디코더가 이미 있다. ECMWF GRIB 패킹 호환만 확인 |
| 예보 5일 타임라인 전 필드(결함 해소) | 같은 GRIB 프레임을 3시간 간격으로 만든다(GFS 3h, ECMWF 3h/6h) | 위와 같음 | 무료 | 하~중 |
| 확률 %(앙상블) | **ECMWF ENS 오픈데이터 50멤버 + 컨트롤(oper)**, 보조로 GEFS | CC BY 4.0 / NOAA | 무료 | 중: 멤버 수 × 용량. 필요한 변수만 받는다 |
| 파고·너울·주기(5°) | **CMEMS GLO WAV 1/12°(너울 1·2차 분리)**. 대안은 ECMWF `wave` 0.25° | CMEMS 라이선스 / CC BY 4.0 | 무료(~2028-06-30) | 중: toolbox·인증 |
| 해류 | **CMEMS GLO PHY(SMOC 포함)**. 대안은 NOAA RTOFS 1/12° | CMEMS / NOAA | 무료 | 중(RTOFS는 3극 격자 재투영) |
| 해수면온도 | CMEMS PHY 예보 + NOAA OISST(분석·편차) | CMEMS / NOAA | 무료 | 하~중 |
| 대기질 격자(CAMS via Open-Meteo) | **CAMS 전 지구 예보 직접 받기(ADS)**. 한국 지점은 에어코리아 실측 | CC BY / 공공누리 3유형 | 무료 | 중: cdsapi |
| UV 지수 | CAMS UV 변수(지표 UV·유효선량)로 계산. 국내는 기상청 생활기상지수(유형 확인) | CC BY / KOGL | 무료 | 중 |
| v1 날씨 시트 해외 지점 10~14일 | **당장: Open-Meteo Standard $29/월**(코드 변경 0, 출처 표시 유지). **장기: ECMWF IFS 15일 지점 추출**(같은 GRIB에서 최근접·쌍선형) | 유료 상업 허가 / CC BY 4.0 | $29→0 | 당장 0 / 장기 중 |
| (백업) 지점 API 장애 대비 | WeatherAPI.com Pro+ $25 또는 Visual Crossing(재배포 금지, 표시만) | 각 사 약관 | $7~65 | 하 |
| 2D 배경지도 | **Protomaps PMTiles 직접 호스팅**(S3 + CloudFront) | ODbL | 저장·전송비만 | 중 |
| 3D 지구 영상·야간 | **NASA Blue Marble / Black Marble**. 10 m 영상은 s2cloudless 2016(CC BY) 또는 EOX 상용 계약 | CC0 / CC BY 4.0 | 무료 / 견적 | 하 |
| 지형 | Copernicus DEM(표면) + **GEDTM30(맨땅)**. 한국은 NGII 90 m, 필요하면 5 m 심사 | 위 F 참고 | 무료 | 중 |

**출처 표시 한 줄 묶음(화면 '출처' 카드용 초안)**
- "NOAA GFS · Contains modified ECMWF open data (CC BY 4.0) · Generated using E.U. Copernicus Marine Service Information <DOI> · CAMS (Copernicus) · © OpenStreetMap contributors · NASA · 기상청·한국환경공단(에어코리아)·국립해양조사원 공공누리"
- Copernicus DEM 문구와 면책 문장은 앱 약관에 넣는다.

**남은 확인(계약·서면)**
1. 에어코리아 '변경금지'가 보간 격자에도 적용되는지 → 한국환경공단에 서면 질의.
2. KMA 허브에서 쓰는 자료별 공공누리 유형 목록을 정리한다.
3. NGII 5 m 보안심사 절차와 배포 조건.
4. VWorld 약관 원문.
5. Visual Crossing 가격.
6. EOX 상용 견적(10 m 영상이 필요할 때).
7. CMEMS 2028-07 이후 조건.
8. GFS-Wave JPEG2000을 ecCodes나 wgrib2 재패킹으로 실제로 읽을 수 있는지 시험.

---

### 출처 (직접 읽은 공식 페이지)
- 모델·해양·대기: open-meteo.com/en/pricing·/en/terms · openmeteo.substack.com/p/api-subscriptions-for-commercial · ecmwf.int/en/forecasts/datasets/open-data · confluence.ecmwf.int(ECMWF open data IFS/AIFS) · registry.opendata.aws/noaa-gfs-bdp-pds·/noaa-rtofs · dwd.de legal_notice · marine.copernicus.eu 라이선스 · data.marine.copernicus.eu PHY_001_024·WAV_001_027 · ads.atmosphere.copernicus.eu CAMS 예보
- 한국: kma.go.kr/kma/guide/copyright.jsp · data.go.kr 15073861(에어코리아)·15059920(NGII DEM)
- 지도·영상·지형: Google tile policies · Mapbox mobile-offline · maptiler.com/cloud/pricing·/terms/server-data · stadiamaps.com/pricing · docs.protomaps.com · OSMF tile policy · cloudless.eox.at/documentation/license · Earthdata data-use-guidance · Copernicus DEM 라이선스 PDF · codeberg GEDTM30 · Fathom · Zenodo 14523356 · JAXA AW3D30
- 날씨 API: visualcrossing · weatherapi · stormglass · openweathermap · api.windy.com · tomorrow.io 가격 페이지
