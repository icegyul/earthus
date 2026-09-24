# 적대 검증 — 자료 라이선스 · 누락 원천 · 제품 사실 (REVIEW-draft 대상, 2026-09-24)

- 법률·세무 자문이 아니다. ⚪ = 공식 출처로 오늘 확정하지 못한 것(사실로 읽지 말 것).
- 읽기 전용 조사. 저장소·설정·배포·계정은 바꾸지 않았다. 이 파일만 `build/paid-app-review/`(git 무시)에 썼다.
- 인용은 출처당 15단어 이하. 모든 웹 출처 읽은 날 = 2026-09-24.

---

## A. 결함 목록 (심각한 것부터)

### 1. [제품 사실] v1 도 예보를 보여 준다 — 초안은 예보 위험을 v2 에만 걸었다
- 저장소 사실
  - `prototype/js/weather-contract-v7.js:51` Open-Meteo `forecast_days: '10'`, `:46` `precipitation_probability_max`(강수확률 %).
  - `prototype/js/ui-weather.js:367` 화면 문구 "자료 출처 · Open-Meteo 전지구 수치예보". `:438` "공식 예보" 절(기상청 동네예보). `:623-646` 시간별·내일 예보.
  - `index.html:188` 이 이 모듈을 미리 읽는다 → v1 날씨 시트의 기본 경로다.
  - 그 밖: `js/layers/phenomena.js:166,249`(7일 열돔 판정), `js/fishing.js:43`(5일 조위), `js/narrative.js:229`(2일), `js/beaches.js:221`(2일).
- 초안의 문제
  - AGENTS.md 표("v1 예보하지 않는다")를 그대로 믿었다. L1·L2·§2 비교표·§5-1 질문 1이 v2 만 다룬다.
  - 기상청 동네예보 재전달은 기상청 자신의 예보라 성격이 다르다. 하지만 **Open-Meteo 모델 예보를 v1 에서 보여 주는 것은 v2 의 GFS 예보와 같은 쟁점**이다.
- 고칠 것
  - L2 '대상'에 v1 날씨 시트를 이름으로 적는다. §2 표의 "(B) v1 은 무료로 남는다"에 "그래도 예보 쟁점은 남는다"를 더한다.
  - §5-1 질문 1에 "v1 무료 화면의 Open-Meteo 예보·강수확률"을 넣는다. 판정은 변호사 몫이다(여기서 내리지 않는다).
  - 제품 원칙(v1 무예보)과 코드가 다르다는 사실은 PD 에게 따로 보고한다.

### 2. [제품 사실] 크롬 새 탭 확장에 **쓰나미 줄**이 있다 — 초안 L4 는 지진 줄만 봤다
- 저장소 사실: `apps/chrome-newtab/feeds.js:28`(`/events/tsunami-intl.json`), `:414` 기본값 `tsunami: true`.
- 원천: `aws/tsunami-intl/handler.py:41-43` NOAA tsunami.gov PTWC·NTWC 경보 Atom. 지시서 `docs/APP-ANDROID-CHROME-NEWTAB-DIRECTIVE-2026-09-24.md:527` "쓰나미 · PTWC 발표 {N}건".
- 지진 줄도 기상청만이 아니다: `aws/quake-asia/handler.py:138` JMA `bosai/quake/data/list.json`. `feeds.js:375` 는 기상청 항목이 없으면 JMA 항목을 보여 준다.
- 구름 사진은 기상청이 아니라 NOAA GMGSI 다(`feeds.js:111` 주석, `aws/gmgsi-clouds`).
- 고칠 것
  - L4 대상·§3-2 해결 경로에 "새 탭 쓰나미 줄(PTWC 재전달)"을 넣는다.
  - §5-3 질문 4에 "외국 기관 **지진해일 경보** 재전달"을 명시한다.
  - §2 끝의 "새 탭은 기상청 자료 조건과 출처 표기뿐" 문장을 고친다. 지진관측법 쟁점(⚪)도 남는다.

### 3. [누락 원천] 지역 뉴스 RSS 11개 매체 — 초안에 없다 (🔴 후보, 유료와 무관하게)
- 저장소 사실: `aws/regional-news/handler.py:46-60` 가 11개 피드의 **제목·링크·시각**을 S3 에 모은다. 화면: `prototype/v2-three/js/live-layers.js:713`(v2), `prototype/js/newsbubble.js`·`ui-events.js`·`ui-cyclone.js`(v1). `aws/health/handler.py:208` 30분 주기 감시 → 운영 중.
- handler 주석은 "나머지는 대개 링크만 허용"이라 적었다. 공식 조건은 그보다 좁다.
  - RNZ 공식: "These feeds are for personal use only." — https://www.rnz.co.nz/rss
    - 같은 페이지는 문장·음성을 허락 없이 웹사이트에 올리는 것을 막는다. 제목 게시도 여기에 들 수 있다 ⚪(변호사).
  - ABC(호주): 공식 이용약관 페이지가 오늘 403 이었다 — https://help.abc.net.au/hc/en-us/articles/360001548096-ABC-Terms-of-Use → ⚪. 검색 요약상 개인·비상업 전용으로 보인다(비공식).
  - 나머지 9곳(allAfrica·Africanews·Al Jazeera·Agência Brasil·MercoPress·Antara·VnExpress·Bangkok Post, RNZ Pacific 은 RNZ 와 같음): 오늘 읽지 않음 → ⚪. Agência Brasil "CC BY 3.0 BR" 도 저장소 주장일 뿐이다 ⚪.
- 고칠 것: 1-4 표에 새 행을 넣는다. 유료 앱 전에 RNZ 를 빼거나 허락을 받는다. 나머지는 매체별 약관을 확인한다. 가장 쉬운 길은 공식 기관 원천만 남기는 것이다(PD 결정).

### 4. [누락 원천] 국립생태원 에코뱅크 — 저장소가 이미 "유료 보류"로 적어 둔 것을 초안이 놓쳤다
- 저장소 기록: `docs/MONETIZATION-PRIORITY-2026-08-05.md:16` "제1유형이지만 제3자 권리 포함. 서면 확인 전 유료·내보내기 보류". `:97-110` 상세, `billing.js:164-166` 주석.
- 사용처: v1 `prototype/js/ui-ecobird.js:20-26`, v2 `prototype/v2-three/js/ext/hobby-ecobird.js:15`(ext-scene `hobby/ecobird`).
- 고칠 것: D 표에 🔴(저장소 기록 기준) 행을 넣는다. `billing.js` 판매 스위치 목록(§1-5)에 "에코뱅크 서면 확인"을 더한다. 공식 조건 https://www.nie-ecobank.kr/cmmn/intro/copyrightPolicy.do 는 오늘 읽지 않았다 ⚪.

### 5. [누락] 공개 날씨 API(`developers.html`) — 기상청 자료를 제3자에게 키로 재배포한다
- 저장소 사실: `aws/public-weather-api/handler.py:1-25` 가 기상청 관측(`wind/kma-aws.json`)과 **동네예보**(`wind/kma-fcst.json`) 캐시를 API 키로 내준다. 키는 관리자가 손으로 발급한다(`add_key.py`).
  - `prototype/developers.html:36,69` 이 공개 문서다. 응답에 "대한민국 기상청(공공누리 제1유형)"이라 적는다.
- 공식 조건과 부딪칠 수 있는 곳
  - API허브 약관 제13조: 이용자는 이용권을 "양도, 판매, 담보제공 등의 처분행위를 할 수 없습니다" — https://apihub.kma.go.kr/policy.do
  - §13 은 원래 운영기관의 지식재산과 이용자의 이용권에 관한 조항이다. 이것이 캐시한 자료를 제3자에게 다시 내주는 경우에도 미치는지는 ⚪(우리 추론이다).
  - 기상자료개방포털: 상업적 이용은 사전 서면 협의(오늘 요약 확인) — https://data.kma.go.kr/cmmn/static/staticPage.do?page=copyright
  - 동네예보를 제3자에게 넘기는 것이 기상법상 '예보'인지 ⚪(기상청 예보를 그대로 옮기는 것).
- 고칠 것: D8 행에 이 API 를 넣는다. §5-3 질문 1에 "키 발급형 API 로 제3자에게 캐시를 재제공해도 되는가"를 더한다. `billing.js` COMMERCIAL_PLAN 의 'API 접근'은 이 API 가 전제다 → §1-5 행과 묶는다.

### 6. [사실 과장] YouTube (A) 🔴 는 과하다 → 🟡
- 공식 정책은 금지와 허용을 모두 적는다 — https://developers.google.com/youtube/terms/developer-policies
  - III.F.3 금지: "must not charge users to watch content in an embedded YouTube player"
  - III.G.2 허용 행위: "Selling an API Client"
- 따라서 '앱을 판매하는 것' 자체는 허용이다. 쟁점은 "설치비 = 영상 시청료"로 볼 것인가이다 ⚪(변호사).
- 고칠 것: D7 (A) 를 🟡 로 내리고 두 조항을 함께 적는다. 권장 조치(유료 앱이면 외부 링크)는 안전한 선택으로 유지한다.

### 7. [사실 과장] JMA 를 D15 🟢 에 넣은 것 — 일본 기상업무법 단서가 있다
- JMA 이용규약: 공공데이터 이용규약 1.0 + 출처 표기. 같은 페이지가 "個別法令により利用に制約がある場合があります"라 적고, 기상업무법 제17조(예보 허가)·제23조(경보)를 가리킨다 — https://www.jma.go.jp/jma/kishou/info/coment.html
- 저장소는 JMA **태풍 예보 진로**(`aws/typhoon-official/handler.py:94`)와 **경보**(`aws/jma-warn`)를 재전달한다. 그 밖: AMeDAS(`aws/jma-amedas/handler.py:38`), 낙뢰(`aws/lightning/handler.py:41`), 도쿄 VAAC(`aws/tokyo-vaac`), 지진(`aws/quake-asia`).
- 고칠 것: JMA 를 D15 에서 빼고 D14 와 묶어 🟡/⚪ 로 둔다(관측은 🟢 쪽, 예보·경보 재전달은 ⚪).

### 8. [근거 보강] 기상청 '공공누리 제1유형'은 문서뿐 아니라 **코드에도 박혀 있다**
- `prototype/js/weather-contract-v7.js:290` 기본값 `'공공누리 제1유형 (출처표시)'`, `prototype/developers.html:69`, `prototype/legal/data-license.ko.md:88`.
- 오늘 공식 확인 결과는 초안 D8 그대로다.
  - API허브 이용안내는 "공공누리 유형별 이용조건에 따라 이용 가능"이라고만 적는다(유형 번호 없음) — https://apihub.kma.go.kr/apiInfo.do
  - 하단 마크 문구는 '출처표시'다. 제1유형 표기와 같지만, 자료별 유형을 확정하지는 못한다 ⚪.
- 고칠 것: §1-5 표의 data-license 행에 위 두 코드 위치를 더한다. 기상청 회신 뒤 한꺼번에 고친다.

### 9. [범위 축소] GVP 운영 사용처는 초안 설명보다 좁다 — 판정은 유지
- 운영 사용처: `aws/regional-hazards/handler.py:211` 주간 화산 RSS(`WeeklyVolcanoRSS.xml`) 제목, `prototype/js/official.js:88,93` 링크 두 개.
- `aws/catalog/build_catalog.py:315` 의 GVP WFS 는 **카탈로그 정의**다(수집 코드 아님). 화산 목록 전체를 GVP 에서 받아 보여 준다는 근거는 찾지 못했다.
- 공식 약관 페이지는 오늘도 403 — https://volcano.si.edu/gvp_termsofuse.cfm. 🔴 의 근거는 저장소 기록(`data-license.ko.md:97,130-135`, `billing.js:385-393`)뿐이다.
- 고칠 것: D6 '대상'을 "v1·v2 재해 — GVP 주간 보고 제목·링크"로 좁힌다. §5-4 문의 문구의 "화산 목록"을 "주간 보고 RSS"로 바꾼다. 주간 보고만 빼면 해결되므로 가장 싼 길이 "빼기"다.

### 10. [누락] LLM 공급자가 둘이다 — Anthropic API(`news-brief`)
- `aws/earthus-llm/handler.py:38-40` 은 Gemini 만 쓴다(초안 맞음).
- 그런데 `aws/news-brief/handler.py` 는 Anthropic Claude(`BRIEF_MODEL` 기본 `claude-opus-5`)로 웹 검색 뒤 뉴스 브리핑을 **새 문장으로 써서** `events/briefs.json` 에 둔다. 화면: `prototype/js/brief.js`·`ui-brief.js`(`ui.js`·`ui-events.js` 가 부른다).
- 운영 여부: `aws/health/handler.py`·`aws/schedules.sh` 에 이 키·함수가 없다 → **운영 중인지 ⚪**.
- 쟁점 두 가지(판정 안 함 ⚪)
  - 기사 사실을 AI 가 다시 쓰는 것의 저작권 회색 지대. handler 주석이 스스로 "회색 지대가 남는다"고 적었다. 유료가 되면 커진다.
  - Anthropic 상업 약관·이용 정책이 유료 소비자 앱에서 무엇을 요구하는지(AI 표시 등).
- 고칠 것: D 표에 "Anthropic API(news-brief, 운영 여부 ⚪)"를 넣는다. L11 국외이전 목록에 넣을지는 개인정보가 실리는지로 정한다. 지금 코드는 사건 정보만 보낸다.

### 11. [해결 목록 누락] Open-Meteo 는 v2 브라우저도 직접 부른다
- 초안 D1 은 v2 를 "Lambda 격자"로만 적었다. 실제로는 `prototype/v2-three/js/route.js:336`, `engine-bridge.js`, `field-layer.js`, `main.js`, `point-readout.js`, `ext-scene.js` 도 직접 부른다.
- Lambda 12개: air-ea·air-grid·air-state·atmos-transport-spike·cyclone-analog·fx-grid·kma-verify·lab-events·marine-ea·marine-grid·pressure-grid·wind-grid.
- v1 파일 12개(초안 "10곳 이상" 맞음).
- 요금제 표현도 고친다. R0 감사(`docs/R0-OPEN-METEO-AUDIT-2026-09-20.md:61`)는 월 약 860만 호출이면 **Enterprise** 라고 적었다. 초안의 "Professional 을 넘을 수 있다"보다 분명하다.
- 판정 🔴 은 유지한다. 공식 문구 "Operating websites or apps that have subscriptions or display advertisements." — https://open-meteo.com/en/terms

### 12. [근거 정정] Overpass — 출처 두 곳의 강도가 다르다
- OSM 위키: "Commercial use should use self-hosted or paid Overpass servers" — https://wiki.openstreetmap.org/wiki/Overpass_API (커뮤니티 위키)
- 운영자 문서(dev.overpass-api.de)는 상업을 직접 금지하지 않는다. OSM 매퍼 밖을 위한 앱이면 자체 인스턴스를 쓰라는 취지다. 앱 전체 이용자의 요청을 합산하고, 정기 사용은 하루 약 100건 수준을 권한다.
- 고칠 것: D3 근거 칸에 "위키 = 권고, 운영자 문서 = 사용량 규칙"으로 구분한다. 🔴(실무상 차단 위험)과 해결책(S3 정적 파일)은 그대로 둔다.

### 13. [라인 번호·세부 정정]
- `ui-alerts.js:404-410` → "지금 보고 있는 곳"은 396-404, **"지금 내 위치" 버튼은 406-415**. `push.js:176-179`(addSpot → `alert_spots` insert)는 맞다.
- `billing.js:385` → 판매 스위치는 **387-393**(`OPEN_METEO_COMMERCIAL_READY`·`GVP_COMMERCIAL_READY`). 초안 §1-5 의 389-393 은 대체로 맞다.
- `prototype/legal/README.md:24` 인용은 맞다. 같은 절의 **"위치를 저장하지 않고 실시간 처리만"** 문장도 틀렸다(`alert_spots` 저장). L5·§1-5 에 함께 적는다.
- `apps/android-twa/twa-manifest.json`: `locationDelegation.enabled: true`, `enableNotifications: true`, `_todo_phase2_playBilling`(결제 미탑재). L5 에 "앱은 안드로이드 위치 권한을 웹에 넘긴다"를 더하고, P4 에 "playBilling 은 아직 꺼져 있다"를 적는다.
- Esri: E300(2025-11-13판) 각주 89 원문 확인 — "All revenue-generating Value-Added Applications ... are required to use Authentication". ArcGIS Location Platform 목록의 각주에 3번(개인·비상업)은 없다. 각주 66 은 World Geocoding Service 결과 저장에 관한 조항이라 타일과 무관하다. E300(Location Platform 조건)이 우리가 부르는 옛 주소 `server/services.arcgisonline.com` 에도 적용되는지는 초안대로 ⚪ 로 둔다. World Imagery 항목 `accessInformation` 에 "Vantor" 가 있어 표기 갱신 권고도 맞다. D2 판정은 그대로.

### 14. [표현 보강] GDACS 면책 문구
- 초안 D10(CC BY 4.0 근거 없음)은 맞다. 이용조건 PDF 에 CC 문구가 없다.
- 같은 PDF 제4항: "not meant to substitute nor to override any official information". 화면 면책 문구는 이것을 근거로 적는다 — https://www.gdacs.org/Documents/2025/GDACS_Terms_of_use_Oct_25.pdf

### 15. [분류 정정] 국내 공공데이터는 데이터셋마다 유형이 따로다
- 초안 D15 는 "KTO 15101972" 하나만 🟢 로 두고, D12 는 "KTO 나머지"로 묶었다. 실제 호출은 아래와 같다. data.go.kr 이용허락은 **데이터셋 단위**다. 에어코리아를 오늘 확인해 보니 제3유형(변경금지)이었다 — https://www.data.go.kr/data/15073861/openapi.do
  - B551011(한국관광공사) 9개 서비스: EngService2 · KorWithService2 · WellnessTursmService · AreaTarDivService · TarRlteTarService1 · DataLabService · AreaTarDemDsService · TatsCnctrRateService · LocgoHubTarService1
  - 1192136(국립해양조사원) 4개: ripCurrent · dtRecent · waterlogged · changeClimateRising
  - 1192000 MarEcosysRschSiteInfoService · MarEcosysRschSeaBirdInfoService / B553482 SeaTurtleRouteService / 1400377 forestPointV2 / B552584 ArpltnInforInqireSvc · MsrstnInfoInqireSvc
- 고칠 것: 판매 전에 데이터셋별로 유형 번호를 기록한다. 제3·4유형이면 가공 화면(보간·지수·요약)을 따로 점검한다.

---

## B. 초안의 판정 중 공식 출처로 오늘 다시 확인한 것 (유지)

| 초안 # | 확인 결과 | 공식 출처 (2026-09-24) |
|---|---|---|
| D1 Open-Meteo | 🔴 유지. 상업 예시: "Operating websites or apps that have subscriptions or display advertisements." 자료 자체는 CC BY 4.0 | https://open-meteo.com/en/terms |
| D2 Esri | 🔴 유지. E300 각주 89 원문 확인(수익 앱은 인증 필수) | https://www.esri.com/content/dam/esrisites/en-us/media/legal/product-specific-terms-of-use/e300.pdf |
| D2 표기 | "Powered by Esri"와 자료 제공자 표기, 둘 다 필요 | https://developers.arcgis.com/documentation/mapping-and-location-services/faq/ |
| D4 Gemini 연령 | 유지. "likely to be accessed by individuals under the age of 18" (최종 수정 2026-03-23) | https://ai.google.dev/gemini-api/terms |
| D5 Gemini 등급 | 유지. 무료 등급은 입력을 제품 개선에 쓴다. EEA·스위스·영국은 유료만 | 같음 |
| D8 기상청 | ⚪ 유지. API허브 §11 "다수의 아이디를 사용하여 API를 호출" 금지, §13 처분 금지 | https://apihub.kma.go.kr/policy.do |
| D9 에어코리아 | 제3유형 "출처표시, 변경금지" 확인 | https://www.data.go.kr/data/15073861/openapi.do |
| D10 GDACS | CC BY 문구 없음 확인 | GDACS 이용조건 PDF |
| D11 CelesTrak | ⚪ 유지. 공식 정책은 다운로드 주기만 다룬다. 상업·재배포 언급 없음 | https://celestrak.org/usage-policy.php |
| D6 GVP | 약관 페이지 오늘도 403 → ⚪(공식) / 🔴(저장소 기록) 유지 | https://volcano.si.edu/gvp_termsofuse.cfm |
| D15 ECMWF Open Data | 🟢 유지. "redistributed and used commercially, subject to appropriate attribution" | https://www.ecmwf.int/en/forecasts/datasets/open-data |

⚠️ **D15 🟢 묶음의 나머지는 오늘 다시 확인하지 않았다. 초안 판정 그대로다.** 해당: NWS·USGS·Copernicus·GEBCO·서울·KTO·NASA·ESA·Natural Earth·Solar System Scope·Wikimedia·LL2·adsb.lol·오픈소스·Supabase. JMA 는 A-7 에 따라 이 묶음에서 뺀다.

---

## C. 초안이 빠뜨린 원천 (저장소 grep 기준)

범례: 대상 v1·v2·앱(TWA=v1+v2 전체)·새탭. "정의만" = 카탈로그·링크·설정에만 있고 운영 수집·표시 코드는 찾지 못함.

| 원천(호스트) | 저장소 위치 | 무엇 | 대상 | 판정 | 읽을 공식 조건 |
|---|---|---|---|---|---|
| 지역 뉴스 RSS 11곳 | `aws/regional-news/handler.py:46-60` → `live-layers.js:713`, `newsbubble.js` | 제목·링크 | v1·v2·앱 | RNZ 🔴(공식 "personal use only") · ABC ⚪(403) · 나머지 ⚪ | 각 매체 RSS 약관 · https://www.rnz.co.nz/rss |
| 국립생태원 에코뱅크 | `js/ui-ecobird.js:20-26`, `v2-three/js/ext/hobby-ecobird.js:15` | 조류 조사 기록 | v1·v2·앱 | 🔴(저장소 기록: 제3자 권리, 유료 보류) | https://www.nie-ecobank.kr/cmmn/intro/copyrightPolicy.do |
| EARTHUS 공개 날씨 API | `aws/public-weather-api/`, `prototype/developers.html` | 기상청 관측·동네예보 재제공 | 제3자 | ⚪(API허브 §13·포털 '상업 서면 협의'와 충돌 가능) | https://apihub.kma.go.kr/policy.do |
| Anthropic API | `aws/news-brief/handler.py` → `js/brief.js`·`ui-brief.js` | AI 뉴스 브리핑 | v1·앱 | ⚪(운영 여부·상업 조건 미확인) | Anthropic 상업 약관·이용 정책 |
| JMA bosai(태풍 예보·경보·AMeDAS·낙뢰·VAAC·지진) | `aws/typhoon-official:94`, `aws/jma-warn`, `aws/jma-amedas:38`, `aws/lightning:41`, `aws/tokyo-vaac`, `aws/quake-asia:138` | 관측·예보·경보 | v1·v2·앱·새탭(지진) | 관측 🟢 · 예보·경보 재전달 ⚪(기상업무법 단서) | https://www.jma.go.jp/jma/kishou/info/coment.html |
| NOAA tsunami.gov PTWC·NTWC | `aws/tsunami-intl/handler.py:41-43` | 국제 쓰나미 경보 | v1·v2·앱·**새탭** | 자료 🟢(미국 정부) · 한국법 ⚪(지진관측법 §16) | https://www.weather.gov/disclaimer |
| BMKG · GeoNet · EMSC · INMET | `aws/regional-hazards/handler.py:78,100,118,143,185` | 지진·화산·경보 | v1·v2·앱 | ⚪(초안 D12 에 이름만 있음. GeoNet 은 CC BY 3.0 NZ 로 알려짐 ⚪) | 각 기관 조건 |
| NOAA PSL OISST · NCEI(GHCN·ISD) · NDBC · OSMC · NWPS · mapservices.weather.noaa.gov | `aws/marine-grid:50`, `aws/climatology/*`, `aws/gts-global:56`, `aws/ocean-solar:30-45`, `js/ui.js:1377-1469`, `aws/glacial-lake-us:38-41`, `aws/current-earth-snow-ice/index.mjs` | 수온·기후·부이·하천 | v1·v2·앱 | 🟢 후보(미국 정부 저작물). 초안 D15 에 이름을 더한다 | https://www.weather.gov/disclaimer · https://www.usgs.gov/information-policies-and-instructions/copyrights-and-credits |
| USGS 수문 | `aws/glacial-lake-us:38` | 수위 | v2 | 🟢 후보 | USGS 같은 URL |
| NASA FIRMS · SDO · JPL SSD/Horizons · GSFC 일식 | `aws/wildfire:71`, `aws/ocean-solar:49`, `js/space/astronomy.js:8-10`, `aws/eclipse-path:47`, `js/sky.js:9-10` | 산불·태양·천문 | v1·v2·앱 | 🟢(일식: "Permission is freely granted to reproduce" + 출처 표기) | https://eclipse.gsfc.nasa.gov/SEpubs/5MCSE.html · NASA Earthdata 정책 |
| ESO 사진 eso0932a | `js/sky-panorama.js:72` | 은하수 파노라마 | v1·앱 | 🟢. CC BY 4.0, 상업 가능, 크레딧 명확 표시. 코드가 "ESO/S. Brunier · CC BY 4.0"을 표시함 | https://www.eso.org/public/copyright/ |
| ERA5(GCS ARCO) · GPM IMERG · GHCN | `aws/catalog/build_catalog.py:353,376,396` | 카탈로그 | — | 정의만(운영 표시 확인 못 함) | Copernicus 라이선스 · NASA |
| Met Office DataHub | `aws/metoffice-uk/handler.py` | 영국 관측 | v2 | ⚪(초안 D12 에 있음. 무료 등급 상업 조건 확인) | https://datahub.metoffice.gov.uk/pricing/site-specific |
| CWA(대만) | `aws/cwa-observations/handler.py` | 대만 관측 | v2 | ⚪(초안 D12, 연결 오류) | https://data.gov.tw/license |
| geodesy.unr.edu | `aws/crustal/handler.py:11-12` | GNSS 속도장 | v2 | ⚪ | 기관 조건 |
| World Bank API | `v2-three/js/live-layers.js:717,1302` | 인구 | v2 | ⚪(CC BY 4.0 으로 알려짐, 오늘 읽지 않음) | World Bank 이용약관 |
| OBIS · Argo(Ifremer) | `aws/obis-summary:28`, `aws/argo-floats:37` | 해양 생물·부이 | v1·v2 | ⚪(OBIS 는 데이터셋별 라이선스) | 각 기관 조건 |
| NIBR · MAFRA 철새 | `aws/lab-events:851`(링크), `aws/migbird:43-45` | 생물 | v2 | ⚪ | data.go.kr 데이터셋별 |
| 국내 공공데이터 18개 서비스 | A-15 목록 | 관광·해양·산림·대기 | v1·v2 | 데이터셋별 ⚪ | data.go.kr 각 페이지 |
| GDELT 뉴스 | `js/ui-source.js:129`, `aws/gdelt-events` | 사건·기사 제목 | v1·v2 | GDELT 자료 🟢(저장소 기록) · 제목 원저작권 ⚪ | https://www.gdeltproject.org/about.html |
| SSEC RealEarth | `js/config.js:39` | 위성 폴백 | v1 | ⚪(초안 D12 에 있음) | SSEC 조건 |
| Movebank · OCEARCH | `js/config.js:118-119` | 동물 추적 | — | 정의만(호출 없음). 켜기 전 확인 | 각 조건 |
| NHK World · Skyscanner · Kiwi · safekorea · bousai · PHIVOLCS · INGV · MAGMA · 아이슬란드 기상청 | `ui-cyclone.js:213`, `flight.js:291,299`, `safety-actions.js:11-12`, `official.js:45-59` | 외부 링크만 | v1 | 링크 = 자료 이용 아님. 항공권 링크에 제휴 파라미터가 붙으면 광고 표시 ⚪ | — |

---

## D. 제품 사실 대조 (초안 vs 저장소)

| 초안 서술 | 저장소 | 판정 |
|---|---|---|
| v1 = 사실만, 예보 없음 | v1 날씨 시트가 Open-Meteo 10일·시간별 예보, 강수확률, 기상청 동네예보를 보여 준다(A-1) | **틀림 — 고칠 것** |
| v2 = 5일 모델 예보·확률 | AGENTS.md·GFS 프레임 파이프라인과 일치 | 맞음 |
| 앱 = v1+v2 를 담은 TWA | `twa-manifest.json` `fullScopeUrl: https://earthus.net/`, `startUrl: /?src=twa` | 맞음 |
| 앱 결제 | `_todo_phase2_playBilling` — 아직 미탑재 | 맞음(P4 에 명시 권장) |
| 앱 위치 | `locationDelegation.enabled: true` → 안드로이드 위치 권한이 웹으로 간다 | 초안에 없음 — L5 에 더한다 |
| 새 탭 = 구름 사진 + 기상청 관측·특보 + 최근 지진 | 구름은 NOAA GMGSI. 지진은 기상청·JMA. **쓰나미 줄(PTWC)** 도 기본으로 켜져 있다. 모든 자료는 earthus.net/S3 캐시에서만 읽는다(`feeds.js:20-29`) | 부분 틀림 — A-2 |
| 새 탭엔 예보 없음 | 맞다(예보 필드 없음) | 맞음 |
| LLM = Gemini | 물어보기는 Gemini. 뉴스 브리핑은 Anthropic(운영 여부 ⚪) | 부분 — A-10 |
| 판매 스위치 = Open-Meteo·GVP 둘 | `billing.js:387-393` 확인 | 맞음. 에코뱅크·기상청·Esri·Gemini·뉴스 RSS 를 더할 것 |

---

## E. 초안에 반영할 순서 (짧게)
1. §0 결론 3번 "다섯 곳"을 **여섯~일곱 곳**으로 고친다(+지역 뉴스 RSS, +에코뱅크).
2. L2·§2·§5-1 질문 1에 **v1 예보 화면**을 넣는다.
3. L4·§3-2·§5-3 질문 4에 **새 탭 쓰나미 줄**을 넣는다.
4. D7 YouTube (A) 🔴 → 🟡. JMA 를 D15 → D14 로 옮긴다.
5. D 표에 공개 날씨 API · Anthropic(news-brief) 행을 더한다. §1-5 에 `weather-contract-v7.js:290`·`developers.html:69`·README "저장하지 않고" 문장을 더한다.
6. 부록 C 표를 D12(기타 확인 필요)에 붙인다. "판정 없음 ≠ 문제 없음" 원칙을 유지한다.

## F. 오늘 열지 못한 곳
- volcano.si.edu(403) · help.abc.net.au(403) · 에코뱅크 저작권 정책(읽지 않음) · 뉴스 매체 9곳 약관(읽지 않음) · Anthropic 약관(읽지 않음) · World Bank·OBIS·UNR·BMKG·INMET 조건(읽지 않음)
