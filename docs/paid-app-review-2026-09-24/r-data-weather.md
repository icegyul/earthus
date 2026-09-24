# 유료 출시 자료 라이선스 감사 — 기상·해양·재해 원천 (2026-09-24)

> 읽기 전용 조사다. 저장소 코드(grep)와 각 기관 공식 페이지(2026-09-24 열람)를 대조했다.
> **법률 자문이 아니다.** '확인 필요'로 표시한 것은 공식 출처로 확정하지 못한 것이다. 사실처럼 읽지 말 것.
> 인용문은 WebFetch 추출 결과이고, 인용 하나하나가 15단어 이하다. 계약이나 신고에 쓰기 전에 원문과 다시 대조할 것.
> AWS 세션이 만료돼 배포 상태(`lambda list-functions`)는 직접 재지 못했다. 운영 여부는 `aws/schedules.sh`, `docs/R0-OPEN-METEO-AUDIT-2026-09-20.md`(09-20 실측), 코드 속 출력 키를 기준으로 판단했다.

---

## 0. 결론 — 먼저 읽을 다섯 줄

1. **Open-Meteo가 가장 큰 벽이다. 상업 라이선스를 사야 한다.** 무료 API는 "구독이 있는 웹사이트·앱"을 상업으로 본다. v2의 기온·바람·기압·대기질·해양 격자, Intelligence 검증 3종(kma-verify·air-state·cyclone-analog), 브라우저 직접 호출 10곳 이상이 이 무료 API에 기대고 있다. 판정은 **상업 라이선스 필요**다.
2. **기상청 자료는 상업 이용 조건이 문서마다 다르다.** API허브는 "공공누리 유형별 이용조건"이라고 적었다. 그런데 기상자료개방포털 저작권 정책은 수익을 얻으려면 **기상청과 사전에 협의**하라고 한다. 둘이 충돌하므로 **확인 필요**다. 기상청 서면 회신을 받아야 한다.
3. **자료 라이선스보다 큰 문제는 기상법 제17조다.** "예보"의 법 정의에 **수치예측 결과**를 바탕으로 한 예상 발표가 들어 있다. 그래서 v2의 5일 GFS·ECMWF 예보와 Intelligence 확률은 **돈을 받든 안 받든** 기상예보업 등록이 필요한 영역일 수 있다. HANDOVER §8에는 "기상사업자 등록 12월 → 유료 2027-01-01"이 적혀 있다. 다만 **지금 무료로 보여주는 v2 예보**도 같은 조항에 걸리는지는 변호사·기상청 확인이 필요하다.
4. **스미소니언 GVP(화산)는 상업 이용에 사전 서면 허가가 필요하다**(저장소 기록 기준. 오늘 공식 페이지는 403이라 재확인 필요). **에어코리아는 공공누리 제3유형(변경금지)** 이라 v2가 값을 가공해 보여주는지 점검해야 한다.
5. **판매 차단 스위치가 불완전하다.** `billing.js:389-393`은 Open-Meteo와 GVP 두 개만 막는다. 기상청 상업 조건, 기상예보업 등록, 에어코리아 변경금지, 일본 기상업무법 문제는 스위치에 없다.

**(A) 유료 설치형이든 (B) 무료 앱 + v2 구독이든 판정은 거의 같다.** 비상업 조항들은 "유료 앱"과 "구독이 있는 앱"을 똑같이 상업으로 본다. 그리고 앱(TWA)은 v1과 v2를 한 앱에 담는다. 그래서 (A)에서는 **무료 서비스인 v1 화면까지** 유료 제품의 일부가 된다. (B)에서도 Open-Meteo 약관의 단위는 기능이 아니라 "웹사이트·앱"이라서 v1이 영향을 받을 수 있다(해석이다 — 확인 필요).

---

## 1. 판정 표 (과업에서 지정한 원천)

범례
- 판정: **OK**(유료에 사용 가능) · **OK+출처**(출처 표시 조건) · **상업 라이선스 필요** · **금지** · **확인 필요**
- 사용처: v1 = 무료 웹 · v2 = 유료 예정 등급 · 앱 = 안드로이드 TWA(v1+v2 전부를 담음) · 확장 = 크롬 새 탭

| # | 원천 | 저장소 사용처 (Lambda / 파일) | 쓰는 화면 | 공식 조건 (URL · 2026-09-24 열람 · 인용) | 판정 |
|---|---|---|---|---|---|
| 1 | **Open-Meteo** (forecast · marine · air-quality · elevation) | Lambda 13개: wind-grid→`wind/global.json`, air-grid→`wind/air.json`, air-ea→`wind/air-ea.json`, marine-grid→`ocean/marine.json`·`sst-global`, marine-ea→`ocean/marine-ea.json`, pressure-grid, fx-grid, kma-verify, air-state, cyclone-analog, lab-events, spot-air(공개 URL), atmos-transport-spike. 브라우저 직접 호출: v1 `layers/weather.js:51,63`, `layers/phenomena.js:168,252,410`, `beaches.js:226`, `fishing.js:293`, `place.js:124,144`, `para.js:136`, `ui-station.js:144`, `narrative.js:232`. v2 `route.js:332`. v2 ext-scene은 v1의 beaches·fishing·para를 그대로 불러 쓴다 | v2 기온·바람·기압·대기질·해양, Intelligence(검증·판정·지향류), LAB, v1 지점 날씨·해변·낚시·활공, 앱 | https://open-meteo.com/en/terms — "Operating websites or apps that have subscriptions or display advertisements"(상업 예시). 무료 한도: 하루 1만·시간당 5천·분당 600회. 자료는 CC-BY 4.0. https://open-meteo.com/en/pricing — Standard 월 100만·Professional 월 500만·Enterprise 월 5천만 초과. 유료 플랜만 상업 사용 허용. 변수 10개 초과 또는 2주 초과 요청은 여러 회로 센다 | **상업 라이선스 필요** |
| 2 | **기상청 API허브** (ASOS·AWS·특보·레이더·동네예보·낙뢰·해양·고층·평년·지진·태풍·GTS·GK2A) | `_shared`, kma-aws, kma-aws-min, kma-warn, kma-radar, kma-fcst, kma-lightning, kma-ocean, kma-upper, kma-normal, kma-life, kma-mountain, quake-asia, typhoon-official, gts-global, gk2a-clouds | v1 전반, v2(특보·AWS·레이더·단기예보·낙뢰·부이·태풍), 앱, **확장**(특보 줄·AWS·지진) | https://apihub.kma.go.kr/apiInfo.do — "공공누리 유형별 이용조건에 따라 이용 가능합니다". https://apihub.kma.go.kr/policy.do 제13조③ — "운영기관의 승인 없이 … 지식재산을 이용하거나 제3자로 하여금 이용하게" 해서는 안 된다. ④ 이용권은 "양도, 판매, 담보제공 등의 처분행위를 할 수 없습니다". 본문에 데이터별 공공누리 **유형 번호는 없다**. https://data.kma.go.kr/cmmn/static/staticPage.do?page=copyright — "수익을 얻거나 … 혜택을 누리고자 하는 경우에는 기상청과 사전에 별도의 협의". 출처표기 안내: https://apihub.kma.go.kr/notice.do?seqNotice=57 (본문은 PDF라 읽지 못함) | **확인 필요** (유료화 전에 기상청 서면 확인. 출처 표시는 기상법 제36조의2③의 의무일 수 있다 — API허브 제공이 그 조항의 '신청·제공' 경로인지 확인. §2-3) |
| 3 | **공공데이터포털** (공통 원칙) | air-korea, khoa-coast, tourism-flow, forest-fire, sea-turtle, seabird, ecobird | v1·v2·앱 | https://www.data.go.kr/ugs/selectPortalPolicyView.do — 제0·1·3유형은 "상업적, 비상업적 이용가능". 그리고 "저작권 등 제3자 권리가 포함된 공공데이터는 권리자의 정당한 이용허락을 확보해야". 공공데이터법 제3조(영리 이용을 제한하지 못한다는 원칙)는 law.go.kr 원문을 열지 못했다(2차 출처로만 확인) → 조문 **확인 필요** | 데이터셋마다 다름 (아래 4~7) |
| 4 | **에어코리아** (한국환경공단 대기오염정보) | air-korea → `wind/korea-air-obs.json` | v2 대기질(가장 가까운 측정소), v1, 앱 | https://www.data.go.kr/data/15073861/openapi.do — "공공저작물 : 출처표시, 변경금지 (제 3유형)". 개발계정 500회 | **OK+출처, 단 변경금지.** 측정값을 보간·재계산(AQI 환산, 격자 채색 등)해 보여주는 화면이 있으면 **확인 필요** |
| 5 | **국립해양조사원(KHOA)** — 이안류·최신 조위·해수면 상승·침수 | khoa-coast(15분) → `sealevel/khoa-kr.json` | v2 해양·해수면, v1, 앱 | 같은 기관의 부이 자료 https://www.data.go.kr/data/15155516/openapi.do — "공공저작물 : 출처표시 (제 1유형)". 실제로 쓰는 4개 서비스(ripCurrent·dtRecent·changeClimateRising·waterlogged)의 개별 페이지는 찾지 못함 | **확인 필요** (1유형이면 OK+출처) |
| 6 | **한국관광공사(KTO)** | tourism-flow → Life·Travel (서울 혼잡 = 타임라인에 물린 3종 중 하나) | v2 Life·Travel, 앱 | https://www.data.go.kr/data/15101972/openapi.do — "이용허락범위 제한 없음". 나머지 B551011 서비스 10여 개는 개별 확인을 못 함 | 15101972는 **OK**. 나머지는 **확인 필요** |
| 7 | **서울 열린데이터광장** 실시간 도시데이터 | tourism-flow (openapi.seoul.go.kr) | v2 Life·Travel, 앱 | https://data.seoul.go.kr/dataList/OA-21778/A/1/datasetView.do (tourism-flow 코드가 인용하는 데이터셋) — "출처표시 (상업적 이용 및 변경 가능)", 공공누리 1유형 | **OK+출처** |
| 8 | **NOAA NWS** (api.weather.gov 특보·NHC·PTWC/NTWC·SWPC·NDBC·aviationweather) | world-alerts, archiver, typhoon-official(NHC), tsunami-intl, ocean-solar(NDBC·SWPC), land-stations(METAR), lab-events | v1·v2 재해·태풍·쓰나미·우주, 앱, **확장**(쓰나미 줄) | https://www.weather.gov/disclaimer — "may be used without charge for any lawful purpose". 조건: NOAA·NWS의 보증처럼 보이게 쓰면 안 된다. 수정본을 공식 자료처럼 내보이면 안 된다. 제3자 자료는 제공자 조건을 따른다(NDBC 파트너 부이 등) | **OK+출처** (보증 암시 금지) |
| 9 | **NOAA NESDIS GMGSI** (구름) | gmgsi-clouds (`s3://noaa-gmgsi-pds`) → `clouds/meta.json` | v1·v2 구름, 앱, **확장**(배경 구름) | 원천은 NOAA 공개 자료다(위 NWS 조건과 같은 연방 저작물 원칙). NODD/AWS Open Data 페이지 원문은 오늘 열지 않았다 | **OK+출처** (NODD 라이선스 문구 **확인 필요**) |
| 10 | **NOAA NCEP GFS** (NOMADS) | gfs-cloud-forecast(`gfs-fc`), gfs-cloud-volume, gfs-cloud-global-low, tpw-grid | **v2 5일 예보 구름·강수(핵심)**, 앱 | 위 NWS 공개 원칙(https://www.weather.gov/disclaimer). `tpw-grid`·`signal-foundation` 코드에도 같은 URL이 기록돼 있다 | **OK+출처** (자료 면에서는 문제없다. **예보 행위**는 §2-3) |
| 11 | **NASA GIBS** (+ GIBS로 받는 Himawari) | v1 `layers/imagery.js`(Himawari AHI, 'JMA Himawari via NASA GIBS'), v1 `config.js:36`, v2 `main.js:1820,6451,6539`, `live-layers.js:47` (VIIRS·Black Marble·MODIS 눈) | v1 위성영상, v2 눈·실사·야경, 앱 | https://earthdata.nasa.gov/engage/open-data-services-software-policies/data-use-guidance — NASA 자료는 사실상 제한이 없다(CC0 성격). NASA 보증을 암시하면 안 된다. NASA가 아닌 자료는 "subject to the license arrangements of the sponsoring organization" | NASA 층은 **OK+출처**. **Himawari 층은 확인 필요** (JMA 조건을 따른다. JMA 이용규약은 상업 이용을 허용하지만, GIBS 경유 Himawari에 그대로 적용되는지 확인 못 함) |
| 12 | **JMA 気象庁** (AMeDAS·경보·지진·태풍·雷ナウキャスト·Tokyo VAAC) | jma-amedas, jma-warn(메모리: 정지 상태), lightning(jmatile nowc), quake-asia, typhoon-official, tokyo-vaac, lab-events | v1·v2 일본 관측·태풍·지진·낙뢰, 앱, **확장**(지진 줄의 JMA 항목) | https://www.jma.go.jp/jma/kishou/info/coment.html — 공공데이터 이용규약 v1.0(CC BY 4.0 호환). 상업 이용과 편집 가능. 표기는 "出典：気象庁ホームページ（URL）", 가공했으면 '加工して作成'. 예외로 기상업무법 제17조(예보 허가)·제23조(경보 제한)를 명시한다. 예고 없이 URL·내용을 바꿀 수 있다 | **OK+출처** (bosai JSON은 정식 API 보증이 없다. 일본용 예보 행위는 §2-4) |
| 13 | **USGS** (지진 피드·FDSN·수문) | archiver, tsunami-eta(입력), lab-events, glacial-lake-us, catalog / v1·v2 `quakes` | v1·v2 지진·쓰나미 시뮬, 앱 | https://www.usgs.gov/information-policies-and-instructions/copyrights-and-credits — "USGS-authored or produced data and information are considered to be in the U.S. Public Domain." 권장 표기 "U.S. Geological Survey". 제3자 사진은 예외 | **OK+출처** |
| 14 | **GDACS** (EC JRC·UN OCHA) | gdacs-tc → `events/gdacs-tc.json`, archiver, catalog | v2 태풍·재해, 앱 | https://www.gdacs.org/Documents/2025/GDACS_Terms_of_use_Oct_25.pdf — 자동 산출물이고 "as is"다. 공식 경보를 "not meant to substitute nor to override". **이 PDF에는 라이선스(CC BY 4.0) 문장이 없다.** 공식 소개 페이지 https://www.gdacs.org/About/overview.aspx · https://www.gdacs.org/Knowledge/overview.aspx 에도 라이선스 문장이 없다("purely indicative" 면책만 있음). `data-license.ko.md`의 CC BY 4.0 표기는 제3자(FAO 카탈로그) 요약에서만 확인됨 | **확인 필요** — 공식 문서로는 CC BY 4.0을 확인하지 못했다. `data-license.ko.md` §5의 CC BY 4.0 표기를 근거 없이 유지하면 안 된다. JRC에 문의할 것. 면책 문구는 화면에 반드시 둔다 |
| 15 | **PTWC / NTWC** (tsunami.gov) | tsunami-intl → `events/tsunami-intl.json` | v1·v2, 앱, **확장** | NWS 소속이라 #8과 같은 공개 원칙을 따른다. tsunami.gov 자체 고지 페이지는 오류 응답이라 열지 못함 | **OK+출처** (tsunami.gov 고지 **확인 필요**) |
| 16 | **NHC** | typhoon-official (`CurrentStorms.json`) | v2 태풍 공식 경로(타임라인에 물림), 앱 | NWS 소속 → #8과 같다 | **OK+출처** |
| 17 | **ECMWF Open Data** (IFS·AIFS·ENS·태풍 BUFR) | ecmwf-ingest, tropical-intelligence → `events/typhoon-ecmwf.json`, 검증 기록 | v2 예보·태풍 앙상블·Intelligence 확률, 앱 | https://www.ecmwf.int/en/forecasts/datasets/open-data — "may be redistributed and used commercially, subject to appropriate attribution" (CC-BY-4.0 + ECMWF 이용약관 https://apps.ecmwf.int/datasets/licences/general/) | **OK+출처** (CC BY는 변경 여부 표시와 면책을 요구한다. 전문 **확인 필요**) |
| 18 | **Copernicus** (CAMS · ERA5) | CAMS는 **Open-Meteo를 거쳐서만** 받는다(air-ea·air-grid). ERA5는 ARCO 공개 미러(catalog·기후 기준) | v2 대기질·기후 기준 | https://apps.ecmwf.int/datasets/licences/copernicus/ — 상업 이용 허용. 표기 "Generated using Copernicus Atmosphere Monitoring Service information [Year]", 가공했으면 "Contains modified …", 그리고 EC·ECMWF 비책임 문구 | 원천 자체는 **OK+출처**. **CAMS는 Open-Meteo 문제를 그대로 물려받는다**(#1) |
| 19 | **GEBCO** | ocean-depth, tsunami-eta (0.1°·0.2° 격자) | v2 해양·쓰나미 도달시간 Simulation, 앱 | https://www.gebco.net/data-products/gridded-bathymetry-data — "placed in the public domain and may be used free of charge" 인용 형식 지정(GEBCO Compilation Group 연도). FAQ: 항해·해상 안전 용도 금지 | **OK+출처** (항해용 아님 문구 필수) |
| 20 | **GMRT** | 저장소에서 사용처를 찾지 못함 | — | — | **미사용** |
| 21 | **천리안 2A (GK2A)** | gk2a-clouds (API허브 typ05) | v1·v2 한반도 구름, 앱 | #2와 같은 기상청 API허브 조건 | **확인 필요** (#2와 같다) |
| 22 | **Himawari 직접**(JAXA P-Tree 등) | 직접 호출 없음. GIBS 경유만(#11) | — | — | **미사용**. 직접 원천으로 바꾸려면 그때 별도로 확인할 것 |
| 23 | **스미소니언 GVP** (화산) | regional-hazards(Weekly Volcano RSS), catalog(WFS), v1 링크 | v1·v2 화산, 앱 | https://volcano.si.edu/gvp_termsofuse.cfm — 오늘은 **403으로 열지 못함**. 저장소 기록(`data-license.ko.md` §5, `billing.js:385`)은 상업 이용에 **사전 서면 허가**가 필요하다고 적었다 | **상업 라이선스 필요** (재열람 **확인 필요**) |

---

## 2. 판매를 막는 것 — 상세

### 2-1. Open-Meteo (판정: 상업 라이선스 필요)

- **왜 v2 유료 등급을 바로 막나.** 09-20 실측 기준으로 v2의 5° 전지구 격자(기온·바람·강수·구름 13변수)는 wind-grid, 대기질은 air-grid·air-ea, 파고·해류는 marine-grid·marine-ea가 만든다. Intelligence 쪽 kma-verify(예보 채점), air-state(대기 상태 판정), cyclone-analog(태풍 지향류)도 같은 무료 API를 쓴다. 약관의 상업 예시가 정확히 "구독이 있는 웹사이트·앱"이다.
- **v1도 영향을 받는다.** v1 화면이 브라우저에서 무료 API를 직접 부른다(표 #1). 유료 설치형 앱(A)이면 v1 화면이 유료 제품의 일부가 된다. 구독형(B)이어도 같은 도메인·같은 앱이다. 약관 단위가 "앱·웹사이트"라서 v1만 비상업이라고 주장하기 어려울 수 있다 → **확인 필요**(Open-Meteo에 서면 문의).
- **이미 무료 한도를 넘었다.** R0 실측: 지점 기준 하루 약 28.7만, 월 약 860만 호출이다. 429 응답이 대량으로 난다. 무료 한도는 월 30만이다.
- **가격.** 공식 가격 페이지에서 금액은 뽑지 못했다(결제 단계에서 표시됨). Open-Meteo 자체 블로그(2023-06-12, https://openmeteo.substack.com/p/api-subscriptions-for-commercial)는 Standard 월 $29(100만 호출), Professional 월 $99(500만 호출)라고 적었다. 3년 전 글이라 **현재 금액·통화는 확인 필요**다. 월 860만 호출이면 Professional(월 500만)도 넘는다. **다중 지점 요청을 몇 회로 세는지도 확인 필요**다(R0 §2의 미결).
- **선택지**(R0 §5 D-OM1, PD 결정 대기):
  - (가) 전부 유료 키로 바꾼다.
  - (나) 대량 격자는 NOAA NOMADS GFS·ECMWF Open Data로 옮긴다. 수집기가 이미 있고 둘 다 상업 이용 OK다. 소량·임의 지점만 Standard 키를 쓴다.
  - (다) 오픈소스 서버를 직접 운영한다.
  - CAMS 대기질을 직접 받으려면 ADS 계정과 라이선스 수락이 필요하다(PD 본인).

### 2-2. 기상청 자료 (판정: 확인 필요)

- 세 문서가 서로 다른 말을 한다.
  1. API허브 이용안내: 공공누리 유형별 조건에 따른다. 유형 번호는 적혀 있지 않다.
  2. API허브 약관 제13조: ③ 운영기관 승인 없이 지식재산을 이용하거나 제3자가 이용하게 하면 안 된다. ④ 이용권의 양도·판매 금지.
  3. 기상자료개방포털 저작권 정책: 수익을 얻으려면 사전 협의나 허락이 필요하다.
- `data-license.ko.md` §5는 기상청 자료를 "공공누리 제1유형"으로 적었다. 오늘 공식 페이지에서 **유형 번호를 확인하지 못했다.** 개방포털의 공공누리 배지는 "출처표시"로 보였지만 추출 결과라 확정하지 않는다.
- 저장소의 `aws/source-governance/registry.draft.json`도 기상청 항목의 `redistribution`·`paidExport`·`APIResale`를 모두 `UNKNOWN`으로 두었다(2026-08-12, 검토 기한 09-12 경과).
- 해야 할 일: 기상청 API허브에 "유료 구독 서비스 안에서 API허브 자료를 출처와 함께 화면에 재배포해도 되는지"를 **서면으로 문의**한다. 회신 전에는 판매 스위치를 열지 않는다. `billing.js`에 세 번째 스위치를 둘 것을 권한다.
- API허브 약관 제11조⑤⑮: 허용량을 늘리려고 **여러 아이디**로 부르는 것을 금지한다. 앱별로 키를 나누는 계획이 있다면 이 조항과 대조할 것(메모리 `kma-hub-accounting`).

### 2-3. 기상법 제17조 — 예보 행위 자체 (판정: 변호사·기상청 확인 필수)

- 원문 출처: 법제처 국가법령정보센터판 기상법 PDF(기상청 게시), [시행 2025. 9. 26.] 법률 제20847호. **이 판이 2026-09-24 현행인지 law.go.kr에서 다시 확인해야 한다**(law.go.kr 본문은 오늘 스크립트 렌더링 문제로 열지 못함).
  - 제2조: "예보"란 기상관측 결과·**수치예측 결과**·기후정보 등을 기초로 한 예상을 발표하는 것이다(요약).
  - 제17조: "기상청장 외의 자는 예보 및 특보를 할 수 없다." 예외는 국방 목적, 또는 **기상산업진흥법 제6조에 따라 기상예보업을 등록한 자**가 예보를 제공하는 경우(항공기상예보 등 제외).
  - 제48조: 특보 위반은 3년 이하 징역 또는 3천만 원 이하 벌금. 제51조①1: 예보 위반은 100만 원 이하 과태료.
  - 제36조의2③: 제공받은 기상정보를 제3자에게 제공할 때는 **출처를 밝혀야 한다**. 어기면 50만 원 이하 과태료(제51조②).
- 기상청 기상사업자제도 안내(https://www.kma.go.kr/kma/biz/biz_intro01.jsp): 기상예보업에는 "인터넷 홈페이지 등을 통하여 제공하는 기상예보"가 들어간다.
- **EARTHUS에 대입하면** — 단정하지 않는다:
  - v2의 GFS·ECMWF 5일 예보 화면, Intelligence 확률("51개 중 38개")은 "수치예측 결과를 기초로 한 예상 발표"에 해당할 수 있다.
  - 제17조는 유료·무료를 가르지 않는다. 그래서 **지금 무료로 공개된 v2 예보 화면**도 같은 질문을 받는다.
  - 기상청 예보·특보를 **출처와 함께 그대로 전달하는 것**(v1 동네예보, 특보 줄)이 "예보를 하는 것"인지도 해석 문제다.
  - HANDOVER §8(2026-09-24 PD): "기상사업자 등록이 12월에 가능 → 유료 2027-01-01". 이 등록이 ① 모델 예보 재표출 ② 앙상블 확률 ③ Simulation을 모두 덮는지 확인해야 한다.
  - **특보는 등록해도 기상청만 할 수 있다.** v2가 자체 '경보' 단계나 경고성 문구를 만들면 제48조 영역이다. 확인할 것.
- `data-license.ko.md` §6은 "earthus 는 예보 기관이 아닙니다"라고 적었다. v2 제품 의도(AGENTS.md: "v2 는 예보한다")와 **모순**이다. 유료화 전에 이 문서를 v1·v2로 나눠 개정해야 한다.

### 2-4. 일본 気象業務法 (판정: 확인 필요)

- JMA 자료를 **출처와 함께 그대로 옮기는 것**은 JMA 이용규약상 상업 이용이 가능하다(#12). 이것과 **EARTHUS가 일본 지역 예보를 내는 것**은 별개의 문제다.
- https://www.jma.go.jp/jma/kishou/minkan/kyoka.html (2026-09-07 갱신): 2026-05-29 개정 기상업무법 시행에 따라 외국 사업자는 "国内代表者等を指定する必要があります". 무허가 사업자 공표 제도가 생겼다는 설명은 제3자 블로그(웨더뉴스)에서만 확인했다 → **확인 필요**.
- v2가 일본 사용자에게 일본 지역 GFS·ECMWF 예보를 보여주면 予報業務許可 대상인지 확인해야 한다. 원문: JMA 「外国法人等が予報業務を行う場合における気象業務法の適用に関する考え方」(오늘 열지 못함). 일본에 팔지 않거나 일본 영역 예보를 가리는 것도 선택지다.

### 2-5. 스미소니언 GVP (판정: 상업 라이선스 필요)

- 저장소 기록에 따르면 상업 이용에는 사전 서면 허가가 필요하다. 오늘 공식 페이지는 403이었다.
- 유료 앱(A)이면 v1 화산 화면도 유료 제품 안에 들어간다.
- 선택지: 허가를 받는다 / 유료 앱에서 GVP를 뺀다 / 원천을 바꾼다(각국 기관 원자료. 예: GeoNet 화산은 CC BY 3.0 NZ).

### 2-6. 에어코리아 제3유형(변경금지)

- 상업 이용은 되지만 **변경금지**다. 측정소 값을 그대로(측정소명·시각과 함께) 보여주는 것은 문제가 없어 보인다.
- 다른 값과 섞은 격자, 보간 채색, 자체 지수 환산이 있으면 '변경'에 해당하는지 **확인 필요**다.
- `data-license.ko.md` §5 표에 **에어코리아가 없다.** 추가해야 한다.

### 2-7. 판매 스위치와 상업용 등급 문구

- `billing.js:389-393`은 `OPEN_METEO_COMMERCIAL_READY`와 `GVP_COMMERCIAL_READY`만 본다. 기상청 서면 확인, 기상예보업 등록, (일본 판매 시) 기상업무법 검토를 같은 방식의 스위치로 추가할 것을 권한다.
- `billing.js:169-175` COMMERCIAL_PLAN은 "상업적 재배포 · 재가공 허용 범위 협의"를 판다. 제3자 원자료에 대해서는 EARTHUS가 재허락할 권한이 없다. 기상청 약관 13조④, 에어코리아 변경금지, Open-Meteo, GVP가 그렇다. 이 문구는 **EARTHUS가 계산한 자료에만** 한정해야 한다. 법무 확인이 필요하다.

---

## 3. 크롬 새 탭 확장

`apps/chrome-newtab/feeds.js:25-29`가 읽는 것은 다섯 개뿐이다. `globe2d.js`는 바탕 지도로 Natural Earth II를 쓴다.

| 줄 | 원천 | 판정 |
|---|---|---|
| 구름 | NOAA NESDIS GMGSI (`clouds/meta.json` credit) | OK+출처 |
| 기상특보 | 기상청 API허브 (`events/kma-warn.json`) | **확인 필요**(#2) |
| 내 장소 기온 | 기상청 ASOS (`wind/kma-aws.json`) | **확인 필요**(#2) |
| 최근 지진 | 기상청 + JMA (`events/quake-asia.json`) | 기상청 부분 확인 필요 · JMA OK+출처 |
| 쓰나미 | NOAA tsunami.gov (PTWC·NTWC) | OK+출처 |
| 바탕 지도 | Natural Earth II | 공개 도메인으로 알려져 있으나 오늘 공식 페이지를 열지 않음 → 확인 필요 |

- **Open-Meteo·GVP·예보는 확장에 없다.** 무료로 배포하면 출처 표시만 지키면 된다.
- 확장을 유료로 팔면 걸리는 것은 기상청 상업 조건(#2) 하나다.
- 기상법 제36조의2③(출처 명시)은 확장이라는 **별도 배포 경로에도 적용된다.** 지시서 §4-7의 출처 줄이 이 의무를 채운다.

## 4. 안드로이드 앱 (TWA)

- 앱은 earthus.net(v1+v2)을 통째로 담는다. 그래서 **표 1의 모든 원천이 앱에 들어간다.**
- (A) 유료 설치형: v1까지 전부 유료 제품이 된다. Open-Meteo(v1 브라우저 호출 포함), GVP, 기상청 조건이 모두 걸린다.
- (B) 무료 앱 + v2 구독: v2가 쓰는 원천이 직접 걸린다. Open-Meteo는 약관 단위 때문에 v1도 걸릴 수 있다(확인 필요).
- 어느 쪽이든 선행 조건은 같다: ① Open-Meteo 상업 전환 ② 기상청 서면 확인 ③ 기상예보업 등록(12월 예정) 범위 확인 ④ GVP 허가 또는 제외.

---

## 5. 저장소에서 찾은 추가 원천 (과업 목록 밖 · 짧게)

| 원천 | 사용처 | 오늘 확인한 것 | 판정 |
|---|---|---|---|
| 대만 CWA | cwa-observations(10분) | 정부자료개방 라이선스 제1판 https://data.gov.tw/license: 상업 이용 가능, CC BY 4.0 호환, 지정된 표기와 링크 필요. CWA 페이지(opendata.cwa.gov.tw)는 연결 오류 | OK+출처 (CWA 적용 여부 확인 필요) |
| GeoNet (NZ) | regional-hazards | https://www.geonet.org.nz/policy — "licensed under a Creative Commons Attribution 3.0 New Zealand License" | OK+출처 |
| Met Office DataHub | metoffice-uk (수집만. 코드 주석: 약관 미확정이라 프런트엔드 비노출) | https://datahub.metoffice.gov.uk/pricing/site-specific: 무료 360회/일, 유료 £9/월부터. 무료 플랜의 상업 조건은 이 페이지에 없음 | **확인 필요** — 노출 전 licensing 문의 |
| EUMETSAT ASCAT (NOAA CoastWatch 경유) | ascat-observations | eumetsat.int/data-policy 403 | 확인 필요 |
| EMSC, BMKG, INMET | regional-hazards | 열지 못함 / 미조회 | 확인 필요 |
| OBIS | obis-summary, lab-events | 미조회. OBIS 자료는 데이터셋마다 라이선스가 다르고 비상업(CC BY-NC) 셋이 섞여 있을 수 있다 — 추정 | 확인 필요 |
| Argo (Ifremer ERDDAP) | argo-floats | 미조회 | 확인 필요 |
| NCEI·OISST·CPC·IBTrACS·NSIDC | climatology, marine-*, cyclone-analog | NOAA 공개 원칙(#8). NSIDC 인용 조건은 미조회 | OK+출처 |
| 산림청 산불위험예보 | forest-fire | 데이터셋 페이지 이용허락범위 미확인 | 확인 필요 (산림청 예보를 그대로 전달) |
| SSEC RealEarth | v1 폴백 전용 (`config.js:39`, 워터마크·한도 주석) | 미조회 | 확인 필요 — 유료 앱에서는 폴백을 끄는 편이 안전 |
| 국립수산과학원·국립생물자원관·NIE 에코뱅크 등 | lab-events, ecobank, ecobird | 기상·해양·재해 범위 밖 | 다른 보고서 |

## 6. 범위 밖이지만 판매를 막을 수 있는 것 (조사하지 않음 · `r-data-maps.md` 참고)

- **Esri World Imagery 타일 직접 호출**(키 없음): v2 `main.js:1075,1227`, `local-terrain.js:8`, v1 `services.arcgisonline.com` 3곳
- AWS Terrain Tiles(`s3.amazonaws.com/elevation-tiles-prod`): 원천별 출처 표시 목록이 있음
- Launch Library 2(ll.thespacedevs.com), adsb.lol, KOMSA MTIS(`hobby-vessel.js:6`), Cesium ion, World Bank API

---

## 7. 누구에게 무엇을 물을 것인가

| 대상 | 질문 |
|---|---|
| **변호사** (기상·IT) | ① v2의 모델 예보 재표출과 앙상블 확률이 기상법 제2조·제17조의 "예보"인가. 무료 공개 기간에도 적용되나 ② 기상예보업 등록 범위가 Intelligence·Simulation까지 덮나 ③ 자체 경고 문구가 제48조 '특보'에 걸리지 않게 하는 기준 ④ 일본 사용자 대상 판매 시 기상업무법(2026-05-29 개정) 영향 ⑤ COMMERCIAL_PLAN의 '재배포 허용 협의' 문구 |
| **기상청** (API허브 운영·기상산업정책과) | ① API허브 자료를 유료 구독 서비스 화면에 출처와 함께 표시해도 되는가. 개방포털의 "수익 시 사전 협의" 문구와의 관계 ② 공공누리 유형 번호 ③ 기상예보업 등록 요건·일정 |
| **Open-Meteo** | ① 다중 지점 요청의 과금 단위 ② 같은 도메인의 무료 서비스(v1)도 상업 플랜이 필요한가 ③ 월 약 860만(air-ea 축소 뒤 약 330만) 호출의 견적·통화 |
| **스미소니언 GVP** | 유료 앱 안 화산 목록·주간 보고 표시의 서면 허가 |
| **세무사** | 이 보고서 범위 밖. 데이터 라이선스 비용(Open-Meteo 등 해외 결제)의 경비·부가세 처리만 참고 |
| **PD** | ① R0 D-OM1~5 결정 ② 일본 판매 여부 ③ 판매 스위치 추가(기상청·예보업 등록) ④ **기상예보업 등록 요건을 12월까지 갖출 수 있는가.** 기상청 안내는 상근 인력 1명 이상(2014 완화)과 시설을 요구한다. 개인사업자 본인이 자격자인지, 기상예보사를 고용해야 하는지. 유료 2027-01-01 일정이 이 한 가지에 달려 있다 |

---

## 8. 출처 목록 (모두 2026-09-24 열람)

- Open-Meteo 약관 https://open-meteo.com/en/terms · 가격 https://open-meteo.com/en/pricing · 자체 블로그(2023, 금액) https://openmeteo.substack.com/p/api-subscriptions-for-commercial — 현재 금액 확인 필요
- 기상청 API허브 https://apihub.kma.go.kr/apiInfo.do · 약관 https://apihub.kma.go.kr/policy.do · 출처표기 안내 https://apihub.kma.go.kr/notice.do?seqNotice=57
- 기상자료개방포털 저작권 https://data.kma.go.kr/cmmn/static/staticPage.do?page=copyright
- 기상법(법제처판 PDF, 시행 2025-09-26) https://www.kma.go.kr/kma/news/law_01.jsp 게시 파일 — law.go.kr 현행 여부 확인 필요
- 기상사업자제도 https://www.kma.go.kr/kma/biz/biz_intro01.jsp
- 공공데이터포털 이용정책 https://www.data.go.kr/ugs/selectPortalPolicyView.do
- 에어코리아 https://www.data.go.kr/data/15073861/openapi.do
- KHOA 부이 https://www.data.go.kr/data/15155516/openapi.do
- KTO https://www.data.go.kr/data/15101972/openapi.do
- 서울 https://data.seoul.go.kr/dataList/OA-21778/A/1/datasetView.do
- NWS https://www.weather.gov/disclaimer
- USGS https://www.usgs.gov/information-policies-and-instructions/copyrights-and-credits
- GDACS https://www.gdacs.org/Documents/2025/GDACS_Terms_of_use_Oct_25.pdf · https://www.gdacs.org/About/overview.aspx · https://www.gdacs.org/Knowledge/overview.aspx (CC BY 근거: https://data.apps.fao.org/catalog/dataset/e581e2e5-f8f8-413f-8424-49b77a83eee8 — 제3자, 확인 필요)
- ECMWF https://www.ecmwf.int/en/forecasts/datasets/open-data
- Copernicus https://apps.ecmwf.int/datasets/licences/copernicus/
- NASA Earthdata https://earthdata.nasa.gov/engage/open-data-services-software-policies/data-use-guidance
- GEBCO https://www.gebco.net/data-products/gridded-bathymetry-data · FAQ https://www.gebco.net/about-us/faq
- JMA 이용규약 https://www.jma.go.jp/jma/kishou/info/coment.html · 予報業務許可 https://www.jma.go.jp/jma/kishou/minkan/kyoka.html · 개정 해설(제3자) https://jp.weathernews.com/blog/article-2026042401/
- GeoNet https://www.geonet.org.nz/policy · 대만 https://data.gov.tw/license · Met Office https://datahub.metoffice.gov.uk/pricing/site-specific
- 열지 못한 곳: volcano.si.edu(403), eumetsat.int(403), tsunami.gov 고지(오류), opendata.cwa.gov.tw(연결 오류), emsc-csem.org(404), law.go.kr 본문(스크립트 렌더링)

저장소 근거: `docs/R0-OPEN-METEO-AUDIT-2026-09-20.md`, `prototype/legal/data-license.ko.md`, `prototype/js/billing.js:169-175,382-393`, `aws/source-governance/registry.draft.json`, `aws/schedules.sh`, `apps/chrome-newtab/feeds.js`, `docs/HANDOVER.md` §8
