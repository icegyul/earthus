# V7 사양서(2026-09-26) 사실 주장 검증 — 2026-09-27

판정: VERIFIED(맞음) · PARTLY(일부 맞음/조건 누락) · WRONG(틀림) · UNVERIFIABLE(원문 확인 불가)
모든 근거는 원문 요약(의역). 인용 아님.

## 요약 — 사양서가 고쳐야 할 것 5건

1. **서울시 강우량·하천수위 = 공공누리 2유형(출처표시+상업적 이용금지).** 2027-01-01 유료 서비스에는 그대로 쓸 수 없다 (#1).
2. **Copernicus DEM 은 DSM 이다(건물·수목 포함)** — 침수 모의에 맨땅 지형으로 쓰면 도시가 '높은 땅'이 된다. 상업 이용은 가능(GLO-30 Public/GLO-90 = Full Free & Open, 출처 문구 필수) (#4).
3. **국토지리정보원 DEM: 대국민 공개는 90m 뿐.** 5m(전국)·1m(도시 LiDAR)는 '공개제한' — 목적 신청·보안 서약·목적 외 사용 금지. 상용 서비스에서 5m/1m 를 화면에 올리는 것은 현재 조건으로는 불가로 봐야 한다 (#8).
4. **기상청 API허브 'QC 플래그'는 과장.** 값마다 붙는 QC 플래그가 아니라 `qc` 적용여부 파라미터와 통계에 쓰인 매분자료 개수(`*_QCM`)다 (#3).
5. **HEC-RAS 는 '공개 소프트웨어'지만 오픈소스가 아니다** — 수정·역공학 금지, 소스 배포 안 함. 서버에서 돌리는 엔진으로 삼기 어렵다. LISFLOOD-FP 는 GPL-2.0(8.2 기준; 8.0 문서는 GPLv3 라고 적음) (#6).

## 1. 서울 열린데이터광장 — 강우량 47곳 + 하천수위 20곳

| 항목 | 판정 | 근거 | URL |
|---|---|---|---|
| 강우량 관측소 47곳, 하천수위 관측소 20곳 | VERIFIED | 소개 페이지에 강우량 관측소 47개소·하천 수위관측소 20개소로 적혀 있음. 데이터셋 3종(강우량·하천수위·빗물펌프장) | https://data.seoul.go.kr/dataList/22/literacyView.do |
| 강우량 데이터셋(OA-1168) 이용조건 | **주의** | **공공누리 2유형: 출처표시 + 상업적 이용금지.** 본문에 관측소 47개소 | https://data.seoul.go.kr/dataList/OA-1168/S/1/datasetView.do |
| 하천수위 데이터셋(OA-1167) 이용조건 | **주의** | **공공누리 2유형: 출처표시 + 상업적 이용금지.** 20개소, 10분 갱신, 서비스 활성(메타 갱신 2025-03-20) | https://data.seoul.go.kr/dataList/OA-1167/S/1/datasetView.do |

→ 개수 주장은 맞다. 그러나 **유료 v2(2027-01~)에서 쓰려면 서울시 별도 허락 필요.** 무료 v1 은 비영리 여부를 따로 판단해야 함(광고·구독 유도가 있으면 상업적 이용으로 볼 소지).

## 2. K-water Open API (data.go.kr 15099115)

| 항목 | 판정 | 근거 | URL |
|---|---|---|---|
| 강우량·수위·유량 제공 | VERIFIED | 한국수자원공사_우량수위 관측소 운영 정보: 시간·누적 강우(mm), 수위(m), 유량(㎥/s). 1996년~, 10분·30분·1시간 | https://www.data.go.kr/data/15099115/openapi.do |
| 이용허락 | VERIFIED | 이용허락범위 **제한 없음**(공공누리 유형 표기가 아니라 '제한 없음'), 무료 → 상업 이용 가능 | 같은 곳 |
| 트래픽 | 참고 | 개발계정 10,000건, 운영계정은 활용사례 등록 시 증량 | 같은 곳 |

## 3. 기상청 API허브 — ASOS/AWS + QC 플래그

| 항목 | 판정 | 근거 | URL |
|---|---|---|---|
| ASOS·AWS 제공 | VERIFIED | 종관(ASOS) 시간·일자료(kma_sfctm2/3, kma_sfcdd 등), AWS 매분·시간통계·일통계 API 목록 | https://apihub.kma.go.kr/apiList.do |
| "QC 플래그 포함" | **PARTLY** | 값별 품질 플래그 필드는 없음. 있는 것: ① `qc` 적용여부 파라미터 ② AWS 시간통계의 `TA_QCM`·`HM_QCM`·`WS_QCM`·`PA_QCM` 등 = **계산에 쓰인 매분자료 개수** ③ ASOS 의 강수 자료구분(IR: 자동/결측/수동) | https://apihub.kma.go.kr/apiList.do?seqApi=2&seqApiSub=239 |
| 품질 보고 | 참고 | 정상·결측·오류 자료율은 기상자료개방포털의 '데이터품질리포트'로 따로 공개(API 필드 아님) | https://data.kma.go.kr/data/qualityInfo/qcReportList.do |

## 4. Copernicus DEM GLO-30/GLO-90 (AWS)

| 항목 | 판정 | 근거 | URL |
|---|---|---|---|
| AWS 에 COG 로 제공 | VERIFIED | readme: Cloud Optimized GeoTIFF 로 제공 | https://copernicus-dem-30m.s3.amazonaws.com/readme.html |
| **DSM 인가 DTM 인가** | **DSM** | readme·라이선스 둘 다: 건물·기반시설·식생을 포함한 지표면 모델(Digital Surface Model). 맨땅(DTM) 아님 | 같은 곳 + 아래 라이선스 PDF |
| GLO-30 전 세계 | PARTLY | GLO-30 Public 은 일부 국가 타일 미공개(목록은 버킷의 tileList.txt·그리드 shapefile) | readme |
| 상업 이용 | VERIFIED(가능) | GLO-30-F·GLO-90-F "Full, Free & Open" 라이선스: 복제·배포·대중 전달·변형/결합 권리, 무료, 세계·무기한. 영리 제외 조항 없음. 의무: 출처 문구(원본 / 변형 시 "produced using Copernicus WorldDEM-30 © DLR… © Airbus…"), 면책 문장 전달, 공식 보증 오인 금지 | https://dataspace.copernicus.eu/sites/default/files/media/files/2025-06/copernicus_contributing_mission_data_access_v2_cop_dem_licenses.pdf |
| 주의 | — | 같은 PDF 의 **GLO-30-R / EEA-10-R 은 비상업 한정**(자격 사용자). AWS 버킷은 Public(F) 계열이므로 해당 없음 — 사양서에 'GLO-30 Public/F' 로 명시할 것 | 같은 PDF |

## 5. ESA WorldCover 10m (PUM v2.0)

| 항목 | 판정 | 근거 | URL |
|---|---|---|---|
| 10m, 2021, v200 | VERIFIED | 2021 전 지구 10m 토지피복, Sentinel-1/2, 11개 부류, 전체 정확도 76.7% | https://esa-worldcover.s3.eu-central-1.amazonaws.com/v200/2021/docs/WorldCover_PUM_V2.0.pdf |
| CC BY 4.0 | VERIFIED | PUM §5.1: 무료·사용 제한 없음, CC BY 4.0. 지도 게시 시 출처 문구 "© ESA WorldCover project [year] / Contains modified Copernicus Sentinel data ([year]) processed by ESA WorldCover consortium" 권장 | 같은 PDF |

## 6. 소프트웨어 라이선스

| 소프트웨어 | 판정 | 라이선스(원문 LICENSE 파일 기준) | 상용 서비스 함의 | URL |
|---|---|---|---|---|
| LISFLOOD-FP (Dewberry 포크) | VERIFIED | GPL-2.0 (LICENSE 파일). v8.2 Zenodo 배포본 포크 | 서버 내부 실행은 배포 아님 → 소스 공개 의무 없음. 바이너리 배포 시 GPL | https://github.com/Dewberry/LISFLOOD-FP |
| LISFLOOD-FP 원본 v8.2 | PARTLY | Zenodo 표기 **GPL-2.0-only**(Bristol·Sheffield). 단 v8.0 안내(SEAMLESS-WAVE·GMD 논문)는 **GPLv3** 라고 적음 — 버전별로 다름, 사용 버전의 LICENSE 로 고정할 것 | 위와 같음 | https://zenodo.org/records/13121102 · https://www.seamlesswave.com/LISFLOOD8.0.html |
| OpenDrift | VERIFIED | GPL-2.0 | 서버 실행 OK | https://github.com/OpenDrift/opendrift |
| WRF | VERIFIED | 퍼블릭 도메인(UCAR, 어떤 목적이든 무료). 복사본에 고지 포함 요청, "WRF" 는 UCAR 등록상표 | 상용 OK, 상표 주의 | https://github.com/wrf-model/WRF/blob/master/LICENSE.txt |
| HEC-RAS | **PARTLY** | 매뉴얼 앞장은 '연방 자원으로 개발 → 퍼블릭 도메인, 출처 표시 요청'(검색 요약 기준). 그러나 **공식 약관 페이지(원문 확인)**: 재배포는 수령자가 약관에 동의할 때만, **수정·축약·디컴파일·역공학 금지, 파생물에 "HEC-RAS" 이름 금지.** 배포정책: 소스는 원칙적으로 배포 안 함, 비USACE 사용자 지원 없음 | 오픈소스 아님. 약관 수락 필요. 클라우드 엔진화는 약관 검토 선행 | https://www.hec.usace.army.mil/confluence/rasdocs/r2dum/6.5/terms-and-conditions-of-use · https://www.hec.usace.army.mil/software/distribution_policy.aspx |
| TELEMAC-MASCARET | VERIFIED | 공식 licence 페이지 원문: 전체 GPL, BIEF 라이브러리만 LGPL(페이지 발췌에 버전 표기 없음; 2010 컨소시엄 이후 GPLv3 라는 것은 위키·검색 기준) | 서버 실행 OK | https://www.opentelemac.org/index.php/licence |
| TiTiler | VERIFIED | MIT (Development Seed) | 제약 거의 없음 | https://github.com/developmentseed/titiler |
| xarray | VERIFIED | Apache-2.0 | OK | https://github.com/pydata/xarray |
| zarr-python | VERIFIED | MIT | OK | https://github.com/zarr-developers/zarr-python |
| Rasterio | VERIFIED | BSD-3-Clause (Mapbox) | OK (GDAL 은 별도 MIT/X) | https://github.com/rasterio/rasterio |
| CesiumJS | VERIFIED | Apache-2.0 | OK. Cesium ion 자산·토큰은 별도 약관 | https://github.com/CesiumGS/cesium |

## 7. Google Earth Engine · QGIS Processing

| 항목 | 판정 | 근거 | URL |
|---|---|---|---|
| GEE 상업 이용 = 유료 | VERIFIED | 비상업(연구·교육·비영리) 무료, 상업은 Google Cloud 유료 요금제. 가격표 원문(HTML 직접 추출): Individual & SMB 'Limited' = 플랫폼 요금 없이 사용량 과금 / Enterprise Basic 월 $500(배치 100 EECU-시간 포함) / Professional 월 $2,000(500 EECU-시간) / Premium 문의 | https://cloud.google.com/earth-engine/pricing · https://earthengine.google.com/commercial/ |
| QGIS 모델 디자이너·배치·히스토리 | VERIFIED | 사용자 매뉴얼 Processing 장: 23.4 history manager, 23.5 model designer, 23.6 batch processing interface | https://docs.qgis.org/latest/en/docs/user_manual/processing/index.html |

## 8. 국내 맨땅 DEM — 국토지리정보원 수치표고모형

| 항목 | 판정 | 근거 | URL |
|---|---|---|---|
| 맨땅(DTM) 여부 | VERIFIED | 「수치표고모형의 구축 및 관리 등에 관한 규정」: DEM 은 **수치지면자료**(지표자료에서 인공구조물·식생을 필터링으로 제거한 점자료)로 만든 격자 모형. DSM 은 별도 정의 | https://www.ulex.co.kr/법률/2100000216042-37111-수치표고모 (규정 원문은 law.go.kr 행정규칙에서 재확인 권장) |
| 해상도·범위 | VERIFIED | 90m(한반도), 5m(남한 전역, 1/5,000 수치지도 기반, '21년부터 매년 갱신), 1m(도시지역 LiDAR, '05~'21 구축, '22년부터 2년 주기) | https://www.ngii.go.kr/kor/content.do?sq=204 |
| **공개 여부** | **핵심** | 같은 페이지 표: **1×1m(서울·경기·6대광역시 일부) 공개제한 / 5×5m 전국 공개제한 / 10×10m 전국 공개제한 / 90×90m 대국민공개** | 같은 곳 |
| data.go.kr '이용허락범위 제한 없음' | PARTLY | 공공데이터포털 DEM 항목은 무료·제한 없음으로 표기하나 해상도 미기재, 실제 파일은 국토정보플랫폼에서 받음 → 공개본(90m)에만 해당한다고 보는 것이 안전 | https://www.data.go.kr/data/15059920/fileData.do |
| 5m 제공 실례 | 참고 | 2017 서울시 문서: 5m 전국 DEM 을 연구 목적으로 제공 — 유출·목적 외 사용·무단공개 금지, 서약서, 시스템 탑재 시 국토지리정보원 워터마크 조건 | https://opengov.seoul.go.kr/sanction/12839164 |
| 상업 서비스 사용 | **UNVERIFIABLE→사실상 불가(현 조건)** | 5m/1m 는 국가공간정보 보안관리 규정상 공개제한 — 신청 목적 외 사용·공개 금지. 상용 웹 화면에 5m 지형을 공개 렌더링하는 허가 경로는 공개 문서로 확인 못 함. **국토지리정보원 질의 필요** | 위 3건 |

→ 결론: 한국 맨땅 DEM 중 **자유롭게 상용 공개 가능한 것은 90m 뿐.** 도시 침수에 쓸 5m/1m 는 NGII 에 상용 공개 가능 여부를 서면으로 물어야 한다. 그 전까지는 Copernicus DSM(30m)을 쓰되 '건물 포함 지표면'이라고 화면에 적고, 침수 깊이 해석에 쓰지 않는 것이 정직하다.
