# 유료 출시 자료 라이선스 점검 — 지도·영상·우주·유틸리티 API (기상 외)

작성 2026-09-24 · 읽기 전용 조사 · 저장소 변경 없음(이 파일만 작성)
범위: 기상 자료 **밖**의 외부 서비스(지도 타일·위성 영상·지형·우주·번역·역지오코딩·LLM·백엔드·결제).
기상 자료(기상청·Open-Meteo·ECMWF·NOAA·JMA Himawari 등)는 다른 보고서 몫이다.

> ⚠️ 이 문서는 개발자가 공개 약관을 읽고 정리한 것이며 **법률 자문이 아니다.**
> "확인 필요"로 표시한 항목은 공식 원문으로 확정하지 못한 것이다 — 사실로 읽지 말 것.
> 유료 판매를 열기 전 변호사(약관·저작권)와, 결제 구조는 세무사 확인이 필요하다.
> 인용은 출처(페이지)마다 한 번, 15단어 이내. 읽은 날짜는 모두 **2026-09-24**.

---

## 0. 한 줄 결론

**지금 코드 그대로 유료로 열면 안 된다.** 막는 것은 다섯이다:
① Esri 위성·지도 타일을 **인증 없이** 부르고 있다 → Esri 는 수익 앱에 인증(계정·키)을 요구한다,
② OSM Overpass **공용 서버**를 v1 여행 '명소'에 쓴다 → 상업 이용은 자체/유료 서버,
③ Gemini API 가 **유료 등급(Paid Services)** 인지 확인되지 않았다,
④ Gemini 약관은 **18세 미만이 쓸 가능성이 큰 앱**에서의 사용을 금지한다 — 우리 가입 기준은 만 14세 이상,
⑤ YouTube 임베드가 들어 있는 v1 을 **(A) 설치 유료 앱**에 넣으면 "보려고 돈을 내게 하는" 구조가 될 수 있다.
나머지는 대부분 **출처 표기만 제대로 하면 유료에서도 쓸 수 있다.** 표기 누락·오기는 §4 에 모았다.
⚠️ 이 보고서가 **판정하지 않은** 비기상 외부 서비스가 더 있다(§2-26) — §3 표가 전부가 아니다.

### (A) 설치 유료 vs (B) 무료 앱 + v2 구독 — 자료 라이선스 관점의 차이

자료 라이선스는 대부분 **선불·구독을 구분하지 않는다. 둘 다 "상업 이용"이다.** 지어낸 구분을 두지 않는다.
실제로 갈리는 곳은 셋뿐이다:

| | (A) 설치 자체가 유료 | (B) 무료 앱 + v2 기간권/구독 |
|---|---|---|
| v1(무료 서비스)의 자료 | 앱 전체가 유료 상품이 되므로 **v1 자료도 전부 상업 이용** | v1 부분은 무료로 남지만, **같은 앱이 수익을 내므로** Esri 처럼 "수익 앱" 단위로 보는 약관은 여전히 걸린다(확인 필요) |
| YouTube 임베드(v1 실시간 영상) | **위험** — 돈을 내야 앱을 열 수 있다 (§2-19) | v1 영상이 결제 없이 보이면 비교적 안전(확인 필요) |
| Esri | 인증 필요 | 인증 필요 (수익 앱이면 동일) |

크롬 새 탭 확장(apps/chrome-newtab): 저장소 실측으로 외부 호출은 `earthus.net` 과 `earthus-cache-kr` S3 캐시뿐이다(feeds.js:20-22).
확장에 보이는 것은 구름 영상·기상청 관측·특보·지진 = **기상·재해 자료**라 이 보고서 범위 밖이다.
확장을 유료로 팔더라도 이 보고서의 지도·우주 서비스는 **들어 있지 않다**(Esri·Overpass·Gemini·YouTube 없음).

---

## 1. 유료 출시를 막는 것 (심각도 순)

| # | 서비스 | 쓰는 곳 | 판정 | 해야 할 일 |
|---|---|---|---|---|
| 1 | **Esri World Imagery · Dark Gray Canvas · World Boundaries and Places** | v2 확대 위성(v2-three/js/main.js:1075,1227 · local-terrain.js:8) · v1 관광 지도(js/layers/tourism-map-style.js:10) · v1 국경·지명 참조(js/readability.js:21,577) | **NEEDS LICENCE OR PAID PLAN** | ArcGIS Location Platform 계정 + API 키(인증)로 전환, 또는 대체 |
| 2 | **Gemini API — 연령 조항** | aws/earthus-llm/handler.py (물어보기·해설) | **막힘(변호사 확인)** | 18세 미만 접근 가능성이 큰 앱에 쓰지 말라는 조항 vs 만 14세 가입. 물어보기를 성인 확인 계정에만 열거나 다른 LLM 약관 검토 |
| 3 | **Gemini API — 유료 등급** | 같은 곳 | **NEEDS PAID PLAN** | 키가 묶인 프로젝트에 결제(Paid Services)가 켜져 있는지 PD 가 콘솔에서 확인 |
| 4 | **Overpass API 공용 서버** (overpass-api.de) | v1 여행 → '명소'(poi) 항목(js/layers/travel.js:58, config.js:109, layerbar.js:244,594) | **NEEDS PAID/SELF-HOSTED** | 하루 1회 서버에서 뽑아 S3 정적 파일로, 또는 자체/유료 Overpass |
| 5 | **YouTube 임베드** | v1 실시간 영상(js/livevideo.js:36, ui.js:959) | (A) **위험** · (B) 조건부 OK | (A)면 임베드 대신 외부 링크, (B)면 결제 뒤에 두지 않기 |
| 6 | **MyMemory 번역** | 커뮤니티 글 번역(js/translate.js:64) | **확인 필요** | 상업 약정 확인 또는 유료 번역 API 로 교체, 처리방침 국외이전 고지 |
| 7 | **CelesTrak** | 위성 궤도(config.js:91-106, S3 캐시) | **확인 필요** | 상업 재배포 서면 확인(기존 legal/README §6 과 같은 결론) |

교차 참조(이 보고서에서 다시 감사하지 않음): `prototype/legal/data-license.ko.md` 가 이미
**Open-Meteo 무료 API(비상업 전용)**·**Smithsonian GVP(상업 이용 사전 서면 허가)** 를 판매 차단 조건으로 걸어 두었다.
**Toss** 는 자료 라이선스가 아니라 PG 계약이다(§2-24). 안드로이드 앱 안에서 v2 구독을 외부 PG 로 파는 것이
Google Play 결제 정책에 맞는지는 **Play 정책 보고서 몫**이다.

---

## 2. 서비스별 판정

형식: 쓰는 곳(파일:행) → 공식 근거(URL · 읽은 날 · ≤15단어 인용 1개) → 판정 → 대체안

### 2-1. Esri World Imagery (server.arcgisonline.com) — **NEEDS LICENCE OR PAID PLAN**

- **쓰는 곳**: v2 DetailTerrain 확대 위성 `prototype/v2-three/js/main.js:1075`, `:1227`; 지역 지형 `prototype/v2-three/js/local-terrain.js:8`(z11). 호출에 토큰·API 키가 **없다.**
  v1 `js/layers/imagery.js:119` 의 Esri 확대 층은 **주석 처리돼 꺼져 있다**(2026-09-06 정리) — v1 은 World Imagery 를 부르지 않는다.
- **근거**
  - World Imagery 항목 메타데이터: 라이선스는 Esri Master License Agreement 이고, 출처 표기(accessInformation)는 "Esri, Vantor, Earthstar Geographics, and the GIS User Community". 또 오프라인용 타일 내보내기에는 쓰지 말라고 적혀 있다 — https://www.arcgis.com/sharing/rest/content/items/10df2279f9684e4a9f6a7f08febac2a9?f=json (2026-09-24)
  - Esri 제품별 이용조건 E300(2025-11-13판) 각주 89: "All revenue-generating Value-Added Applications … are required to use Authentication" — https://www.esri.com/content/dam/esrisites/en-us/media/legal/product-specific-terms-of-use/e300.pdf (2026-09-24)
    ⚠️ 이 각주는 **ArcGIS Location Platform** 제품에 붙은 것이고 "when accessing ArcGIS Location Platform" 이라는 조건이 달려 있다. 우리 코드는 Location Platform 이 아니라 **옛 ArcGIS Online 타일 주소를 계정 없이** 부른다 → 이 각주가 그 호출을 **직접** 규율한다고 단정할 수 없다.
  - Esri 개발자 FAQ: 기본지도를 쓰는 앱은 "Powered by Esri" 와 자료 제공자 표기가 필수 — https://developers.arcgis.com/documentation/mapping-and-location-services/faq/ (2026-09-24)
  - 옛 주소의 상업 이용 조건을 직접 다룬 Esri 블로그 2편("ArcGIS Hosted Services: Terms of Use & Pricing Differences", "Open source developers: Time to upgrade to the new ArcGIS basemap layer service!")은 **HTTP 403** 으로 본문을 받지 못했다.
- **판정**: Esri 의 일관된 입장은 "상업(수익) 앱은 계정·토큰 인증을 거쳐 기본지도를 쓴다"이다(각주 89, 개발자 문서). 다만 **계정 없이 옛 주소를 부르는 경우를 직접 금지하는 조문**은 이번에 원문으로 확인하지 못했다 — World Imagery 항목의 "View Terms of Use" 원문(goto.arcgis.com 링크) 확인 필요.
  그래도 **유료 출시 전 해결할 막힘으로 분류한다.** 어떤 해석에서도 "키 없이 쓰는 유료 앱"이 허용된다는 근거는 찾지 못했다.
- **비용**: Location Platform 은 월 무료 한도 뒤 종량제다. "기본지도 타일 월 200만 장 무료, 이후 1,000장당 0.15달러"는 검색 요약에서만 봤다 → **확인 필요**(https://developers.arcgis.com/pricing/ 가 본문을 돌려주지 않았음).
- **대체안**: (1) Location Platform 가입 + API 키 + "Powered by Esri" 표기 — 코드 변경이 가장 적다. (2) NASA GIBS 의 고해상 층(§2-9)으로 확대 영상을 바꾸는 방법 — 해상도가 Esri 보다 낮다, 층별 해상도 확인 필요. (3) 상용 위성 타일(MapTiler·Mapbox 등) — 약관·가격 확인 필요.
- ⚠️ `tools/test_v2_*` 두 시험 파일 외에는 Esri 타일을 굽거나 캐시하는 도구가 없음을 확인했다(grep). 앞으로도 받아 구워 S3 에 올리지 말 것.

### 2-2. Esri Dark Gray Canvas · World Boundaries and Places (services.arcgisonline.com) — **NEEDS LICENCE OR PAID PLAN**

- **쓰는 곳**: v1 관광 흐름 지도 `js/layers/tourism-map-style.js:10`(여행 레이어를 켤 때만); v1 국가 경계·지명 참조 `js/readability.js:21,577`(운영 중).
- **근거·판정**: §2-1 과 같다. v1 은 무료지만 **같은 앱이 유료가 되면** (A)는 물론 (B)도 수익 앱 단위로 볼 여지가 크다 → 확인 필요(Esri 에 질의 권장).
- **표기**: 코드 credit 문자열은 "Esri, HERE, Garmin, … © OpenStreetMap contributors …" 이고 readability.js:404 가 화면에도 띄운다. **"Powered by Esri" 는 없다.**
- **대체안**: Location Platform 인증 전환(§2-1 과 한 계정으로 가능), 또는 국경·해안선은 이미 가진 **Natural Earth**(§2-8)로 그리기(coastline-reference.js 가 이미 일부 그렇게 한다) — 지명 라벨만 따로 해결하면 Esri 의존이 사라진다.

### 2-3. Esri elevation3d.arcgis.com (TopoBathy3D · Terrain3D) — **현재 호출 없음 · 정리 권장**

- **쓰는 곳**: `prototype/v2/js/real-living-earth.js:26-30`(옛 Cesium v2 비교 화면). `tools/build-v2-bundle.sh` 는 이 JS 를 복사하지 않는다.
- **실측(2026-09-24, 공개 HEAD/GET)**: `https://earthus.net/v2/js/real-living-earth.js` 는 **200 으로 아직 S3 에 남아 있다.** 그러나 운영 `https://earthus.net/v2/index.html` 본문에는 `real-living-earth`·`elevation3d` 참조가 **없다** → 지금 화면에서 부르지 않는 고아 파일.
- **판정**: 유료 출시 영향 없음. 누가 직접 그 파일을 쓰는 옛 페이지를 열 수 있는지는 확인 필요 — 정리(삭제)는 PD 판단(에이전트는 S3 를 건드리지 않았다).

### 2-4. GEBCO SCUFN 해저지명 (services2.arcgis.com 의 공개 피처 서비스) — **OK with attribution · 상업 조건 확인 필요**

- **쓰는 곳**: v2 해구 축선 `prototype/v2-three/js/seafloor.js:17`. 화면 출처 표기 있음(`:313` "GEBCO Sub-Committee on Undersea Feature Names …").
- **근거**: GEBCO 가제티어 페이지가 권하는 인용문 "IHO-IOC GEBCO Gazetteer of Undersea Feature Names, www.gebco.net" — https://www.gebco.net/data-products/undersea-feature-names (2026-09-24). 상업 이용 조항은 페이지에서 찾지 못했다.
- **판정**: 권장 인용문을 그대로 한 줄 추가. 상업 조건은 **확인 필요**. 이 자료는 다른 기관(코드 주석상 NOAA NCEI)이 ArcGIS Online 에 올린 공개 피처 서비스를 브라우저가 직접 부르는 것이라, 그 호스팅 계정의 공개 조건도 **확인 필요**.
- **대체안**: 해구 수십 개 축선뿐이므로 GEBCO 가 배포하는 파일을 한 번 받아 S3 정적 파일로 두면 호스팅 문제는 사라진다(인용 의무는 남는다).

### 2-5. OpenStreetMap — 타일 서버는 **안 쓴다** · Overpass 공용 서버는 **NEEDS PAID/SELF-HOSTED**

- `tile.openstreetmap.org` 는 저장소 운영 코드 어디에도 없다(grep). OSM 타일 이용 정책은 해당 없음.
- **Overpass 공용 인스턴스**: v1 여행 → '명소'(poi) 항목을 켜면 브라우저가 직접 POST 한다 — `js/layers/travel.js:58` → `https://overpass-api.de/api/interpreter`(config.js:109). 항목은 V1_LEAN 에서도 여행 2단 목록에 남아 있다(layerbar.js:244, 594).
- **근거**
  - OSM 위키 Overpass API: "Commercial use should use self-hosted or paid Overpass servers." — https://wiki.openstreetmap.org/wiki/Overpass_API (2026-09-24) ⚠️ 위키는 공동 편집 문서라 1차 약관보다 한 단계 약하다.
  - Overpass 공식 문서: 사용자당 하루 약 1만 요청·1 GB 를 기준으로 들고, 공용 서버를 일반 앱의 백엔드로 삼는 것을 문제 사례로 든다(요약) — https://dev.overpass-api.de/overpass-doc/en/preface/commons.html (2026-09-24)
- **판정**: 사용자마다 브라우저가 공용 서버를 부르는 구조는 유료 앱에 맞지 않는다.
- **대체안**: POI 는 자주 바뀌지 않으므로 **Lambda 로 하루 1회 뽑아 S3 에 두기**(해변·낚시·등산로를 이미 그렇게 만들었다). OSM 자료 자체는 ODbL 1.0 — "© OpenStreetMap contributors" 표기와 파생 DB 공개 시 동일조건 의무는 그대로다(data-license.ko.md §5 에 이미 있음).

### 2-6. AWS Terrain Tiles (Terrarium · Mapzen/Joerd) — **OK with attribution (표기 부족)**

- **쓰는 곳**: v2 지형 `prototype/v2-three/js/main.js:150`(z4+ 스트리밍), `local-terrain.js:7`(z10). 또 z3 64장을 이어 붙인 고도맵을 **저장소에 구워 배포**한다 `v2-three/assets/terrain/terrarium-z3.webp`(영수증 `terrarium-z3.receipt.json`) → 재배포에 해당.
- **근거**
  - AWS Open Data 레지스트리: 라이선스는 joerd attribution 문서를 따르고 관리 주체는 "Mapzen, a Linux Foundation project" — https://registry.opendata.aws/terrain-tiles/ (2026-09-24)
  - joerd attribution.md: 원천별 라이선스 — 대부분 퍼블릭 도메인(USGS SRTM·GMTED·3DEP, NOAA ETOPO1), 일부 CC BY(노르웨이 4.0, 오스트리아 3.0 AT, 뉴질랜드 LINZ 3.0 NZ, 호주 4.0), 영국·캐나다 OGL, EU-DEM(Copernicus), 멕시코 INEGI. 원천을 모두 나열한 **긴 권장 출처 문단**이 있다 — https://github.com/tilezen/joerd/blob/master/docs/attribution.md (2026-09-24)
- **판정**: 상업 이용을 막는 조항은 없다. 다만 **출처 표기 의무가 있고**, 지금 화면 표기(`v2-three/index.html:2160` "AWS Terrain Tiles (Terrarium)", local-terrain.js:35 "고도 AWS Terrarium")는 원천 목록을 담지 않는다.
- **할 일**: "정보·라이선스" 화면에 joerd 권장 문단을 그대로 싣고, 화면에서는 "지형 © Mapzen · 원천 목록" 링크로 연결.

### 2-7. Cesium (v1) — **OK (Apache-2.0) · Cesium ion·Bing 은 쓰지 않는다**

- `js/viewer.js:8-14`: `baseLayer: false`, `terrainProvider: new Cesium.EllipsoidTerrainProvider()`. `Ion.defaultAccessToken`·ion 자산·Bing 은 운영 코드 어디에도 없다(grep). 라이브러리는 jsDelivr 의 `cesium@1.143.0`(index.html:1387).
- v1 기본 영상은 Cesium 기본(Bing)이 아니라 **NASA GIBS Blue Marble**(imagery.js:94-96, §2-9).
- **판정**: CesiumJS 는 Apache-2.0 — 앱 "오픈소스 라이선스" 화면에 전문·저작권 고지를 넣으면 된다(legal/README §6 에 목록 있음). Cesium ion 이용약관은 해당 없음. (Apache-2.0 원문은 이번에 다시 열지 않았다 — 기존 README 판단 유지.)

### 2-8. Natural Earth — **OK for paid**

- **쓰는 곳**: v2 기본색 Natural Earth II(v2-three/index.html:2161, `prototype/v2/assets/physical-earth/ne2-base.receipt.json`), 국가 경계·육지 판정(country-reference.json, land-mask.js, flood-overlay.js), v1 해안선(coastline-reference.js).
- **근거**: "All versions of Natural Earth raster + vector map data … are in the public domain." — https://www.naturalearthdata.com/about/terms-of-use/ (2026-09-24). 같은 페이지는 상업 이용을 허용하고 출처 표기가 필요 없다고 적는다.
- **판정**: 상업 이용 가능, 표기 불요(지금처럼 표기하는 것은 좋다).

### 2-9. NASA GIBS · Blue Marble — **OK for paid (감사 문구 권장)**

- **쓰는 곳**: v1 기본면 `BlueMarble_ShadedRelief_Bathymetry`(imagery.js:94), 오늘의 트루컬러 등. (GIBS 로 받는 **JMA Himawari** 층 imagery.js:1005 는 기상 보고서 몫.)
- **근거**: GIBS 문서가 권하는 감사 문구는 "…imagery provided by services from NASA's Global Imagery Browse Services (GIBS)…" 로 시작하는 한 문장이며, NASA 공개 자료 정책을 따른다 — https://nasa-gibs.github.io/gibs-api-docs/ (2026-09-24)
- **판정**: 상업 이용 가능. 감사 문구를 출처 화면에 넣을 것. NASA 로고·휘장은 쓰지 말 것(§2-11).

### 2-10. Solar System Scope 행성 텍스처 — **OK with attribution**

- **쓰는 곳**: v1 우주 3D(`js/space/cosmic3d.js:3866`), v2 태양계(`v2-three/js/solar-view.js:238` "Solar System Scope (CC BY 4.0)"), `data/celestial-bodies.json` credit "Solar System Scope/INOVE".
- **근거**: "You may use, adapt, and share these textures for any purpose, even commercially." — https://www.solarsystemscope.com/textures/ (2026-09-24)
- **판정**: CC BY 4.0 — 지금 표기로 충족한다고 본다.

### 2-11. NASA / STScI (JWST·Hubble 공개 영상) — **OK with attribution · 보증 암시 금지**

- **쓰는 곳**: `data/space-photos.json`, `v2-three/assets/skyphotos/catalog.json`, `data/missions/jwst-mission-media-replay-v1.json`(credit "NASA, ESA, CSA, STScI …" 20건 이상, license "NASA Media Usage Guidelines" 10건).
- **근거**: NASA 이미지·미디어 지침 — 상업 목적이면 "must not explicitly or implicitly convey NASA's endorsement" — https://www.nasa.gov/nasa-brand-center/images-and-media/ (2026-09-24). 같은 지침은 NASA 자료가 대체로 미국 내 저작권 대상이 아니며, NASA 휘장·로고타입은 퍼블릭 도메인이 아니라고 적는다. (webbtelescope.org/copyright 는 NASA 페이지로 301 이동.)
- ⚠️ 같은 지침은 편집적(비홍보) 사용을 기본으로 설명한다 → **앱 안의 사실 전달은 괜찮지만, 스토어 스크린샷·광고 소재로 NASA 사진을 쓰는 것은 확인 필요**.
- ⚠️ 크레딧에 ESA·CSA 가 함께 적힌 사진은 각 원 게시처 조건을 따른다(2-12).

### 2-12. ESA/Webb · ESA/Hubble — **OK with attribution (크레딧 원문 그대로·보이게)**

- **쓰는 곳**: 위와 같은 목록(license "CC BY 4.0 · ESA/Webb" 51건, "ESA/Hubble & NASA …").
- **근거**
  - ESA/Webb: "may … be reproduced without fee provided they are clearly and visibly credited." 상업 제품 보증 암시 금지 — https://esawebb.org/copyright/ (2026-09-24)
  - ESA/Hubble: 크레딧은 "with the wording unaltered" 로 보여야 한다 — https://esahubble.org/copyright/ (2026-09-24)
- **판정**: 상업 이용 가능. 크레딧을 **줄이지 말고**, 이미지와 **떨어뜨리지 말 것**(작은 화면에서 접는 UI 라도 사진 곁에 남아야 함). 로고는 별도 허가.

### 2-13. Wikimedia Commons · Wikipedia API (이미지) — **OK with attribution (파일별)**

- **쓰는 곳**: v1 위성 사진 `js/satimage.js:108-145`(`pilicense: 'free'` 로 비자유 이미지 제외, 파일별 저작자·라이선스·설명 페이지 조회, 없으면 사진을 안 씀), 관측소 사진 `js/ui-station.js:162`.
- **근거**: data-license.ko.md §5 가 이미 Commons 재사용 지침(https://commons.wikimedia.org/wiki/Commons:Reusing_content_outside_Wikimedia/en)을 인용하고 구현이 그에 맞다. 이번에 재확인 fetch 는 하지 않았다.
- **판정**: 지금 구현 방식이면 유료에서도 가능. CC BY-SA 파일을 **가공**해 쓰면 가공물에 동일조건이 걸린다(썸네일 표시만이면 해당 적음 — 확인 필요).

### 2-14. SIMBAD (CDS) — **OK with attribution**

- **쓰는 곳**: 실시간 질의가 아니라 **정적 좌표**만 — `data/space-photos.json`, `v2-three/assets/skyphotos/catalog.json`, 화면 `v2-three/js/sky-view.js:262,277`("위치 출처 SIMBAD").
- **근거**: "Use of SIMBAD service is free without any registration under ODbL licence." — https://simbad.cds.unistra.fr/simbad/ (2026-09-24). 같은 페이지는 CDS 감사 문구("…SIMBAD database, operated at CDS, Strasbourg, France")를 권한다.
- **판정**: 상업 이용 가능. 좌표 몇십 개는 ODbL 상 '비실질적 부분'일 가능성이 크지만 **확인 필요**. 출처 화면에 CDS 감사 문구 한 줄 추가 권장.

### 2-15. TheSpaceDevs Launch Library 2 — **OK for paid (표기 권장)**

- **쓰는 곳**: 서버 수집 `aws/launch-feed/handler.py:34,38`(**2.2.0** 을 부름) → S3 `events/launches.json`. `js/config.js:93` 에는 **2.3.0** 주소가 남아 있다 — 버전이 섞여 있음(동작 영향은 별도 확인).
- **근거**
  - 무료 한도: "available at no cost for up to 15 non-authenticated requests per hour" — https://thespacedevs.com/llapi (2026-09-24)
  - 공식 FAQ: "You are free to use the data in any way, shape, or form" (표기는 의무 아님·권장) — https://github.com/TheSpaceDevs/Tutorials/blob/main/faqs/faq_TSD.md (2026-09-24)
- **판정**: 상업 이용을 막는 문구는 없다. 서버가 받아 캐시하므로 시간당 15회 한도를 사용자 수와 무관하게 지킨다. 제3자 이미지(발사체 사진)는 쓰지 않는다는 기존 결정 유지(legal/README §6).
- **보강**: 한도가 모자라면 Patreon 토큰(유료 후원 등급) — 금액 확인 필요.

### 2-16. CelesTrak — **확인 필요**

- **쓰는 곳**: 위성 궤도 카탈로그·14일 이력 — S3 캐시 `js/config.js:91,105,106`, 브라우저 폴백 `config.js:92`(celestrak.org 직접), 관제센터 `js/spaceops/*`.
- **근거**: 이용 정책은 갱신 간격("For GP data, updates are once every 2 hours")과 오류 시 요청 중단·방화벽 차단만 말한다. **상업 이용·재배포에 대한 허용/금지 문구는 없다** — https://celestrak.org/usage-policy.php (2026-09-24)
- **판정**: 하루 1회 서버 캐시는 빈도 조건을 지킨다. 유료 상품의 재료로 쓰는 것을 명시적으로 허락하는 문구가 없다 → **CelesTrak 에 서면 확인**(legal/README §6·§8 의 기존 할 일과 같음).
  브라우저 폴백(`config.js:92`)은 사용자마다 celestrak.org 를 부를 수 있으므로 유료 출시 때는 끄는 편이 정책상 안전하다.
- **Space-Track**: 운영 코드에서 직접 호출 없음 → 해당 없음. 직접 연결하지 말 것(재배포 승인이 걸리는 영역 — 확인 필요 수준의 참고).

### 2-17. satellite.js · three.js — **OK (MIT)**

- satellite.js: v1 SGP4(`js/aetherus/core.js:52`, `js/spaceops/model.js`), jsDelivr 로드. three.js: v2 `vendor/three-r184.module.min.js`.
- MIT — 앱 오픈소스 고지에 저작권 문구 포함. (이번에 원문 재확인 안 함, 기존 README 판단 유지.)

### 2-18. adsb.lol (항공기) — **OK with attribution (ODbL)**

- **쓰는 곳**: v1 항공 추적 `js/flight.js`(Lambda 프록시), 화면 표기 `js/ui-flight.js:290`. v2 는 잠금 상태(route.js:443).
- **근거**: API 문서 머리에 라이선스 "ODbL 1.0" 표기 — https://www.adsb.lol/docs/open-data/api/ (2026-09-24). 앞으로 API 키가 필요해진다는 말은 검색 요약에서만 봤다 → 확인 필요.
- **판정**: 상업 이용 가능, 출처 표기 의무(이미 있음). 항적을 쌓아 **DB 로 공개**하면 ODbL 동일조건이 걸린다(aws/archiver/handler.py:100 주석이 이미 막고 있음).

### 2-19. YouTube 임베드 — (A) **위험** · (B) **조건부 OK**

- **쓰는 곳**: v1 실시간 영상 `js/livevideo.js:36`(youtube-nocookie 임베드), `ui.js:959,1111,1124`. v2-three 에는 없음.
- **근거**: YouTube API Services 개발자 정책 III.F.3 — "must not charge users to watch content in an embedded YouTube player." — https://developers.google.com/youtube/terms/developer-policies (2026-09-24)
- **판정**: (B)에서 v1 영상이 결제 없이 보이면 조항에 직접 걸리지 않는다고 본다(확인 필요). (A)처럼 **앱을 사야** 영상이 보이면 조항에 걸릴 위험이 크다.
- **대체안**: 유료 앱 안에서는 임베드 대신 "YouTube 에서 보기" 외부 링크로.

### 2-20. BigDataCloud 역지오코딩 (클라이언트 무료 API) — **OK (잠정) · 원문 재확인 필요**

- **쓰는 곳**: `js/place.js:89` — 캐시 키가 `device:` 이고 **기기 현재 위치**일 때만 부른다. 좌표는 소수 4자리(약 11 m).
- **근거**: 공식 페이지 두 곳 모두 HTTP 429 로 본문을 받지 못했다. 검색 결과 요약상 "상업·비상업 모두 무료", "사용자 동의로 얻은 기기 현재 위치만", 위반 시 HTTP 402·IP 차단 — https://www.bigdatacloud.com/support/fair-use-policy-for-free-client-side-reverse-geocoding-api (본문 미확인, 2026-09-24) → **확인 필요**.
- **판정**: 현재 구현은 요약된 조건과 맞는다. 원문 확인 전까지 "OK" 는 잠정.
- ⚠️ 지도에서 **탭한 임의 지점**에 이 API 를 쓰면 안 된다(요약상 금지). 지금 코드는 임의 지점에 Natural Earth·geoBoundaries 오프라인 판정을 쓴다(place.js:60-83) — 유지할 것.

### 2-21. MyMemory 번역 — **확인 필요 (상업 조건·개인정보)**

- **쓰는 곳**: 커뮤니티 글 번역 `js/translate.js:64`(버튼을 눌러야 전송; community.js·ui-community.js·ui-events.js). 이메일 `de` 파라미터 없이 익명 호출.
- **근거**
  - 한도: "Free, anonymous usage is limited to 5000 chars/day." — https://mymemory.translated.net/doc/usagelimits.php (2026-09-24)
  - 이용약관: Translated 동의 없이 "resell Translated's services as they are" 금지. 같은 약관은 제출된 문장을 장기 저장한다고 적는다 — https://mymemory.translated.net/terms-and-conditions (2026-09-24)
- **판정**: 유료 앱 **안의 기능으로 쓰는 것**이 "그대로 재판매"인지 약관이 분명하지 않다 → **확인 필요**. 사용자가 쓴 글이 해외 업체에 **장기 저장**되므로 개인정보 처리방침의 처리위탁/국외이전 고지가 필요하다(개인정보 보고서와 교차 확인).
- **대체안**: MyMemory 상업 플랜(한도 페이지는 RapidAPI 상업 플랜을 안내 — 조건 확인 필요), 또는 파파고/DeepL/Google 번역 유료 API.

### 2-22. Google Gemini API — **NEEDS PAID PLAN + 연령 조항 막힘**

- **쓰는 곳**: `aws/earthus-llm/handler.py:38-40`(gemini-3.x flash 계열), v1·v2 "물어보기"/해설. 이 Lambda 의 키가 결제 계정(유료 등급)에 묶여 있는지는 **비밀값을 열지 않았으므로 확인하지 못했다**.
- **근거** — https://ai.google.dev/gemini-api/terms (2026-09-24)
  - 연령(인용): "…directed towards or is likely to be accessed by individuals under the age of 18." — 같은 문장 앞부분은 "API Clients"(= 우리 웹사이트·앱)를 그런 서비스의 일부로 쓰지 말라고 한다. 즉 **개발자 나이만이 아니라 앱의 이용자층**에 대한 조항이다.
  - 데이터(요약): 무료 등급(Unpaid Services)은 입력·응답을 Google 제품 개선에 쓰고 사람 검토자가 읽을 수 있다. 유료 등급(Paid Services)은 개선에 쓰지 않는다. EEA·스위스·영국 이용자에게는 유료 등급만 허용된다.
- **판정**
  - **유료 등급 필수로 본다**: 돈을 받는 서비스에서 사용자 질문을 Google 학습·사람 검토로 넘기는 무료 등급은 쓰지 말 것. 해외(EEA·영국) 배포 시엔 약관상 의무.
  - **연령 조항은 막힘**: 우리 가입 기준은 "만 14세 이상"(legal/README §7)이고, 누구나 여는 지구 앱은 18세 미만이 접근할 가능성이 크다. 조문이 앱의 이용자층을 직접 말하므로 "애매하다"로 넘길 수 없다. 이 조항이 유료 등급에도 똑같이 적용되는지, 다른 약관(Google Cloud Vertex AI 등)으로 옮기면 달라지는지는 **변호사 확인 필요**.
  - 선택지(결정은 PD): 물어보기를 성인 확인 계정에만 열기 / 약관이 다른 LLM 경로로 옮기기 / 가입 연령을 18세로 올리기.
- 참고: 약관은 전문 조언 대용 금지도 말한다 — 재해·생명 관련 답에 "공식 발표를 따르라" 문구 유지.

### 2-23. Supabase — **OK for paid (Free 플랜은 부적합)**

- **쓰는 곳**: 인증·DB·Edge Functions(`prototype/supabase/*`: checkout·payment-confirm·push-tick 등).
- **근거**: "Free projects are paused after 1 week of inactivity." — https://supabase.com/pricing (2026-09-24). Pro 는 월 25달러부터.
- **판정**: 상업 이용 자체는 문제없다. 결제·구독을 붙이면 **Pro 이상**으로 올려야 일시정지 위험이 없다. 현재 플랜은 확인 필요. 개인정보 처리위탁·국외이전 고지는 개인정보 보고서 몫.

### 2-24. Toss Payments — **해당 없음(자료 라이선스 아님)**

- **쓰는 곳**: `js/billing.js:323`(결제창), `supabase/functions/payment-confirm/index.ts:89`, `payment-refund/index.ts:60`.
- **판정**: PG 가맹 계약의 문제다. 안드로이드 앱에서 디지털 구독을 외부 PG 로 파는 것이 Google Play 결제 정책(한국 대체결제 포함)에 맞는지는 **Play 정책 보고서에서 확인**할 것.

### 2-25. 쓰지 않는 것 (조사 요청 목록에 있었으나 운영 코드에 없음)

| 서비스 | 결과 |
|---|---|
| tile.openstreetmap.org | 호출 없음 |
| Cesium ion · Bing Maps | 호출·토큰 없음 (viewer.js baseLayer:false) |
| CARTO basemaps (cartocdn) | 호출 없음 |
| Space-Track | 호출 없음 |

### 2-26. 이 보고서가 판정하지 **않은** 비기상 외부 서비스 — 전부 확인 필요

운영 코드(prototype/js, v2-three/js, aws, supabase/functions)의 호스트 목록에서 찾았다. 약관은 읽지 않았다 — **판정 없음 = 문제없음이 아니다.**

| 호스트 | 쓰는 곳 (파일:행) | 무엇 | 담당 보고서 / 메모 |
|---|---|---|---|
| api.obis.org | aws/obis-summary/handler.py:28 · aws/lab-events/handler.py:857 · js/ocean/obis.js:101 | 해양 생물 출현 | 생물·해양 자료 점검. OBIS 자료는 데이터셋마다 라이선스가 다를 수 있다 — 확인 필요 |
| api.worldbank.org | v2-three/js/live-layers.js:717,1302 | 국가별 인구 | 통계 자료 점검 — 확인 필요 |
| www.nie-ecobank.kr | js/ui-ecobird.js:20,26 · v2-three/js/ext/hobby-ecobird.js:15 | 국립생태원 조류 | 국내 공공데이터 보고서(공공누리 유형 확인) |
| species.nibr.go.kr | aws/lab-events/handler.py:851 (링크) | 국립생물자원관 | 국내 공공데이터 보고서 |
| data.mafra.go.kr | aws/migbird/handler.py:43,45 | 농림축산식품부 철새 | 국내 공공데이터 보고서 |
| openapi.seoul.go.kr · data.seoul.go.kr | aws/tourism-flow/handler.py:138 · js/tourism-flow-contract.js:138 | 서울 실시간 도시데이터(혼잡) | 국내 공공데이터 보고서 |
| mtis.komsa.or.kr | js/ui-ocean.js:15 · v2-three/js/ext/hobby-vessel.js:6 | 해양교통 링크 | 국내 공공데이터 보고서(링크만인지 확인) |
| geodesy.unr.edu | aws/crustal/handler.py:11-12 | GNSS 지각 속도장 | 과학 자료 점검 — 확인 필요 |
| erddap.ifremer.fr · fleetmonitoring.euro-argo.eu | aws/argo-floats/handler.py:37 · aws/lab-events/handler.py:791 | Argo 부이 | 해양 자료 점검(Argo 는 일반적으로 자유 이용으로 알려짐 — 확인 필요) |
| www.gdeltproject.org | js/ui-source.js:129 · aws/catalog | 뉴스 이벤트 | data-license.ko.md §5 가 이미 다룸(상업 가능·인용 필수) |
| www.skyscanner.co.kr · www.kiwi.com | js/flight.js:291,299 | 항공권 검색 링크 | 제휴·광고 정책 보고서(제휴 파라미터가 붙으면 광고 표시 의무) |
| www.movebank.org · www.ocearch.org | js/config.js:118-119 | 동물 추적 | **정의만 있고 호출 코드 없음**(grep). 켜기 전 반드시 약관 확인 — Movebank 는 연구별 권한, OCEARCH 는 자체 약관이 걸리는 것으로 알려져 있다(확인 필요) |
| realearth.ssec.wisc.edu | js/config.js:39 | 위성 영상 폴백 | 기상·영상 보고서 몫(코드 주석상 워터마크·한도 있음) |
| api.x.com · graph.facebook.com · graph.threads.net · graph.instagram.com · open.tiktokapis.com · api.linkedin.com · www.googleapis.com(YouTube 업로드) | supabase/functions/social-admin/index.ts | 마케팅 스튜디오 게시 | 이용자에게 보이는 자료가 아니라 운영자 도구. 각 플랫폼 개발자 약관 — 확인 필요 |

---

## 3. 판정 요약표 (§2-26 은 제외 — 이 표가 전부가 아니다)

| 서비스 | 쓰는 기능 | 판정 |
|---|---|---|
| Esri World Imagery | v2 확대 위성·지역 지형 | **NEEDS LICENCE OR PAID PLAN** |
| Esri Dark Gray · Boundaries | v1 관광 지도·국경 지명 | **NEEDS LICENCE OR PAID PLAN** |
| Esri elevation3d | 옛 Cesium v2 고아 파일 | 현재 호출 없음 · 정리 권장 |
| GEBCO SCUFN (ArcGIS 호스팅) | v2 해구선 | OK with attribution · 상업 조건 확인 필요 |
| OSM Overpass 공용 서버 | v1 여행 '명소' | **NEEDS PAID/SELF-HOSTED** |
| OSM 자료(ODbL) | 해변·낚시·등산로 파생 | OK with attribution |
| AWS Terrain Tiles | v2 지형 + 구운 z3 | OK with attribution (표기 보강 필요) |
| CesiumJS | v1 렌더러 | OK (Apache-2.0 고지) |
| Natural Earth | v2 기본색·경계, v1 해안선 | OK for paid |
| NASA GIBS / Blue Marble | v1 기본면·트루컬러 | OK (감사 문구) |
| Solar System Scope | 행성 텍스처 | OK with attribution |
| NASA/STScI 사진 | 우주 사진 | OK with attribution · 보증 암시·로고 금지 · 광고 소재는 확인 필요 |
| ESA/Webb · ESA/Hubble | 우주 사진 | OK with attribution (원문 크레딧) |
| Wikimedia Commons | 위성·관측소 사진 | OK with attribution (파일별) |
| SIMBAD | 천체 좌표(정적) | OK with attribution |
| Launch Library 2 | 발사 일정 | OK for paid (표기 권장) |
| CelesTrak | 위성 궤도 | **확인 필요** |
| satellite.js · three.js | 궤도 계산·v2 렌더러 | OK (MIT) |
| adsb.lol | 항공 추적 | OK with attribution (ODbL) |
| YouTube 임베드 | v1 실시간 영상 | (A) 위험 · (B) 조건부 OK |
| BigDataCloud | 내 위치 지명 | OK 잠정 · 원문 확인 필요 |
| MyMemory | 커뮤니티 번역 | **확인 필요** |
| Gemini API | 물어보기·해설 | **NEEDS PAID PLAN** · **연령 조항 막힘** |
| Supabase | 계정·DB·결제 함수 | OK (Pro 이상 권장) |
| Toss | 결제 | 해당 없음 → Play 정책 보고서 |

---

## 4. 출처 표기 고칠 곳 (유료 여부와 무관하게 지금 틀린 것)

1. **Esri 표기가 옛 이름이다.** v2 `v2-three/js/i18n.js:78,173` "© Esri · **Maxar** · Earthstar Geographics".
   현재 공식 accessInformation 은 "Esri, **Vantor**, Earthstar Geographics, and the GIS User Community"(§2-1). 그리고 **"Powered by Esri"** 가 v1·v2 어디에도 없다.
2. **v2 3D 확대 위성(main.js:1075,1227)이 뜰 때** 화면에 Esri 표기가 보이는지 확인 필요 — `#map-attrib` 는 지도 보기(mapview)용이고, 3D 확대 때는 HUD 문구(main.js:4243 "Esri 위성")뿐일 수 있다.
3. **Terrarium 표기가 원천 목록을 담지 않는다**(§2-6). joerd 권장 문단을 출처 화면에 싣는다. 구워 배포하는 z3 고도맵에도 해당.
4. **GEBCO 권장 인용문**("IHO-IOC GEBCO Gazetteer of Undersea Feature Names, www.gebco.net")을 seafloor 출처에 그대로 추가.
5. **NASA GIBS 감사 문구**, **SIMBAD/CDS 감사 문구**를 "정보·라이선스" 화면에 추가.
6. v1 은 Cesium 기본 credit 영역을 숨긴다(tourism-map-style.js 주석). 그 대신 화면 UI 에 같은 출처를 띄우는 방식은 유지하되, 지도 위 **보이는 위치**에 남는지 점검.

---

## 5. PD 가 결정·확인할 것

1. Esri: **ArcGIS Location Platform 가입 + API 키**로 갈지, v1 참조지도는 Natural Earth 로 바꾸고 v2 확대 위성만 Esri 로 남길지. (가입은 PD 가 직접 — 에이전트는 계정을 만들지 않는다.)
2. Gemini: (a) Lambda 키가 묶인 Google Cloud 프로젝트에 **결제가 켜져 있는지** 콘솔에서 확인(비밀값은 채팅에 붙이지 말 것). (b) 18세 조항 대응 — 성인 확인 계정만 / 다른 LLM 경로 / 가입 연령 상향 중 선택, 변호사 확인.
3. Overpass: '명소' POI 를 **하루 1회 S3 정적 파일**로 바꾸는 작업 승인 여부.
4. (A)를 고른다면 YouTube 임베드를 외부 링크로 바꿀지.
5. CelesTrak·MyMemory·GEBCO·Esri 에 **상업 이용 문의**를 보낼지, 문안은 PD 결정(에이전트가 보내지 않는다).
6. §2-26 의 미판정 서비스를 어느 보고서가 맡을지.
7. 변호사 검토 대상: Esri 조건의 "수익 앱" 범위와 옛 주소 적용 여부, Gemini 연령 조항, MyMemory "재판매" 해석, NASA 사진의 스토어·광고 소재 사용.

---

## 6. 조사 한계

- Esri 옛 주소를 직접 다룬 Esri 블로그 2편은 403, 요금 페이지는 빈 본문 → §2-1 의 옛 주소 적용과 요금 수치는 확인 필요.
- adsb.lol 의 향후 API 키, BigDataCloud 이용 조건은 공식 페이지 본문을 받지 못해 **검색 요약에만 근거**한다.
- OSM 위키는 공동 편집 문서다. Overpass 공식 문서(dev.overpass-api.de)가 방향은 같다.
- 비밀값(keys.json·.env·config.local.js)은 열지 않았다. 호스트를 찾는 grep 이 config.local.js 의 **주석 한 줄**(RealEarth 가입 안내)에 걸려 출력됐으나 비밀값은 보지 않았고 이 보고서에 옮기지 않았다. 어떤 API 가 유료 계정에 묶였는지는 코드로 알 수 없다.
- CesiumJS·satellite.js·three.js 라이선스와 Wikimedia 재사용 지침은 이번에 원문을 다시 열지 않고 기존 `prototype/legal/README.md`·`data-license.ko.md` 판단을 따랐다.
- 운영 확인은 공개 URL 에 대한 읽기 전용 HEAD/GET 두 건(earthus.net/v2/…)뿐이다.
