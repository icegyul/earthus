# Chrome 새 탭 확장 조사: "새 탭 = 지금 지구"

작성 2026-09-24 · 조사 전용 문서(코드 없음). 지시서 초안의 재료이고, **코드는 PD 승인 뒤에 쓴다.**
출처 표기: 공식 문서는 URL과 `읽은 날 2026-09-24`를 붙였다. 공식 근거를 찾지 못한 주장은 **[UNVERIFIED]** 로 표시했다.
실측(curl)은 `실측 2026-09-24 KST 15시경`으로 표시했다.

---

## 0. 한 줄 결론과 사용자 화면에서 바뀌는 것

**사용자 화면에서 바뀌는 것:** Chrome에서 새 탭을 열면 빈 Google 페이지 대신 **지금 지구의 한쪽 면**이 바로 보인다.
구름은 최근 한 시간 안의 위성 관측이고, 낮과 밤의 경계는 여는 순간의 태양 위치로 계산한다. 옆에는 **출처와 시각이 붙은 사실 서너 줄**이
나온다(내 장소 하늘, 발효 중인 기상특보, 최근 지진). 아래에는 `지구 전체 보기 → earthus.net` 버튼과 v2로 가는 질문 한 줄이 있다.

**권장안: B (확장 안에 들어가는 가벼운 2D 캔버스 지구).** 우리 CloudFront에서 자료만 받아 오고, 코드와 바탕 지도는 확장 패키지 안에 넣는다.
WebGL과 무한 애니메이션은 쓰지 않는다. 캐시된 그림을 먼저 그린 뒤, 새 자료는 백그라운드에서 받는다.
earthus.net 전체를 iframe으로 넣는 A안은 기술적으로는 가능하다. 그러나 다음 세 가지 때문에 떨어뜨린다.

- 스토어 정책의 "웹페이지를 여는 것만 하는 확장" 금지에 걸릴 위험이 있다.
- 탭마다 Cesium과 6 MB를 다시 띄운다.
- 발열 규칙과 맞지 않는다.

C안(서버가 그림을 미리 렌더링)은 스토어 스크린샷·OG 이미지용 보조 수단으로 남긴다.

---

## 1. MV3 규칙: 새 탭에 살아 있는 지구를 띄울 때 걸리는 것

### 1-1. 새 탭 교체(`chrome_url_overrides.newtab`)
출처: https://developer.chrome.com/docs/extensions/develop/ui/override-chrome-pages (읽은 날 2026-09-24)

| 항목 | 내용 | 근거 |
|---|---|---|
| 선언 | `"chrome_url_overrides": { "newtab": "newtab.html" }` | 공식 |
| 교체 가능한 페이지 수 | 확장 하나당 한 페이지("each extension can only override one page") | 공식 |
| 시크릿 창 | 시크릿 창에서는 확장이 새 탭을 교체할 수 없다 → 시크릿 창에서는 Chrome 기본 새 탭이 뜬다 | 공식 |
| 주소창 포커스 | 새 탭은 키보드 포커스를 주소창에 먼저 준다. 페이지의 다른 곳으로 포커스가 간다고 기대하면 안 된다 → **`autofocus` 금지, 검색창 없음** | 공식 |
| 속도 | "Make your page quick and small. Users expect built-in browser pages to open instantly." 동기식 DB 접근을 피하고, XHR 대신 `fetch()`를 쓴다 | 공식 |
| 제목 | `<title>`이 필수다(없으면 URL이 탭 제목이 된다) | 공식 |
| 차별화 | Chrome 기본 새 탭과 헷갈리게 만들지 말 것 | 공식 |
| 두 확장이 동시에 교체할 때 | 공식 문서에는 설명이 없다. 마지막으로 설치하거나 켠 확장이 이긴다는 것이 통설이다 | **[UNVERIFIED]** |
| 설치 직후 확인 창 | Chrome이 "Is this the new tab page you were expecting?" 창으로 유지할지 되돌릴지 묻는다. 출처는 제3자 글(malwaretips.com)뿐이다 | **[UNVERIFIED]**. 설계상 "사용자가 되돌릴 수 있다"를 전제로 둔다 |
| Chrome 138+ 하단 바 | 확장이 새 탭을 제공하면 Chrome이 **하단에 "어느 확장이 제공하는지"를 보여주는 바**를 붙인다. 사용자가 숨길 수 있다 | Chromium Extensions PSA https://groups.google.com/a/chromium.org/g/chromium-extensions/c/DNj1B3vywr0 (읽은 날 2026-09-24) → **출처·시각 라벨은 하단 바보다 위에 둔다** |

### 1-2. 확장 페이지 CSP와 원격 코드
- 출처: https://developer.chrome.com/docs/extensions/reference/manifest/content-security-policy (읽은 날 2026-09-24)
  - 기본값은 `script-src 'self'; object-src 'self';`이고 인라인 스크립트는 막힌다.
  - 이보다 느슨하게 할 수 있는 최소치는 `script-src 'self' 'wasm-unsafe-eval'; object-src 'self';`다.
  - `'unsafe-eval'`이나 원격 스크립트 출처를 넣으면 설치 오류가 난다.
  - → **Three.js든 무엇이든 JS는 패키지 안에 번들한다.** WASM은 `'wasm-unsafe-eval'`로 허용되지만 이 설계에는 필요 없다.
  - 인라인 `<script>`는 금지다. 모든 코드는 `newtab.js` 같은 파일로 둔다.
- 원격 코드 정의: https://developer.chrome.com/docs/extensions/develop/migrate/remote-hosted-code (읽은 날 2026-09-24)
  - RHC는 "anything that is executed by the browser that is loaded from someplace other than the extension's own files"다.
  - **JSON·CSS 같은 데이터는 RHC에 들어가지 않는다.** 라이브러리도 전부 로컬에 번들해야 한다.
- 스토어 MV3 요건: https://developer.chrome.com/docs/webstore/program-policies/mv3-requirements (읽은 날 2026-09-24)
  - 원격 **데이터**(설정 파일, 이미지처럼 로직을 평가하지 않는 자원)를 받는 것은 허용된다.
  - **iframe·샌드박스 안의 콘텐츠는 원격 코드 제한에서 면제**된다. 다만 "it must be possible to determine the full functionality of your extension"과 개인정보 정책은 그대로 적용된다.
  - → 우리 구름 WebP와 사실 JSON을 받는 것은 **데이터**라 허용 범위다.

### 1-3. earthus.net을 새 탭에 iframe으로 넣을 수 있나 (A안의 전제)
- **CSP 측면에서는 가능하다.** 확장 페이지 기본 CSP는 `script-src`와 `object-src`만 제한하고 `frame-src`는 제한하지 않는다(위 CSP 문서에 frame-src 규정이 없다).
- **우리 사이트 측면에서도 가능하다.** 실측 2026-09-24: `https://earthus.net/` 응답에 `X-Frame-Options`·`Content-Security-Policy(frame-ancestors)` 헤더가 없다.
- **로그인과 저장소:** https://developer.chrome.com/docs/extensions/develop/concepts/storage-and-cookies (읽은 날 2026-09-24)
  - 확장 페이지가 iframe을 넣고 **그 사이트에 host 권한이 있으면, 그 사이트는 자기 최상위 파티션을 쓴다.**
  - → earthus.net에 host 권한을 주면 iframe 안에서도 Supabase 로그인이 유지될 것으로 보인다. 실제 로그인 흐름은 미시험이다 **[UNVERIFIED]**.
- **스토어 정책 측면에서는 위험하다.** 최소 기능 정책은 다음과 같다(https://developer.chrome.com/docs/webstore/program-policies/minimum-functionality, 읽은 날 2026-09-24).
  - "Do not post an extension with a single purpose of installing or launching another app, theme, **webpage**, or extension."
  - 확장이 직접 제공하지 않는 기능만 있는 확장도 위반 사례로 든다.
  - → 새 탭이 earthus.net iframe 하나뿐이면 "웹페이지를 띄우는 것이 전부"로 읽힐 수 있다. 심사 반려 사례는 직접 확인하지 못했다 **[UNVERIFIED]**. 그래도 이 위험은 피할 수 있으니 피한다.

### 1-4. Three.js 번들과 WebGL
- 로컬 번들은 허용된다(1-2). 저장소에 이미 `prototype/vendor/three-r184.module.min.js`(365 KB, gzip 87 KB)와 `three.core.min.js`(384 KB, gzip 101 KB)가 있다. 실측 2026-09-24.
- 확장 페이지에서 WebGL을 쓰지 못하게 하는 규정은 공식 문서에서 찾지 못했다. 일반 웹 페이지와 같다고 보는 것이 합리적이다 **[UNVERIFIED: 명시 문서 없음]**.
- **문제는 허용 여부가 아니라 비용이다.**
  - 새 탭마다 WebGL 컨텍스트가 하나씩 생긴다. Chrome은 활성 컨텍스트 수에 상한이 있어서 넘으면 오래된 것을 잃는다(상한 값 **[UNVERIFIED]**).
  - GPU 메모리를 쓰고, 렌더 루프를 돌리는 순간 발열 규칙(HANDOVER §5 "애니메이션 무한 반복 → 발열")과 부딪힌다.
  - 정적인 한쪽 면 지구에는 3D가 필요 없다 → **B안은 2D 캔버스로 한다.**

### 1-5. 네트워크: host_permissions와 CORS
- 출처: https://developer.chrome.com/docs/extensions/develop/concepts/network-requests (읽은 날 2026-09-24)
  - 확장 서비스 워커와 확장 페이지는 **host_permissions가 있으면 교차 출처 요청에 CORS가 적용되지 않는다.** 콘텐츠 스크립트는 예외다.
  - CSP에 `connect-src`·`default-src`를 추가하면 요청이 막힐 수 있으니 조심하라고 한다.
- **실측 2026-09-24:**
  - `Origin: chrome-extension://…`로 `https://earthus.net/clouds/meta.json`을 요청하면 **`Access-Control-Allow-Origin` 헤더가 없다**. CloudFront가 캐시 키에 Origin을 넣지 않기 때문이다(main.js 1440행대 주석과 같은 현상).
  - 같은 파일을 S3 직접 주소(`earthus-cache-kr.s3.us-east-2…`)로 받으면 `*`가 붙는다.
  - USGS `4.5_day.geojson`도 `*`다.
  - → **`host_permissions: ["https://earthus.net/*"]`가 필수다.** 이 권한이 있으면 CORS 헤더와 무관하게 `fetch()`가 된다.
- **캔버스 오염 회피:** `<img crossOrigin>`으로 그려서 캔버스가 오염되는 상황을 만들지 않는다. `fetch()` → `Response.blob()` → `createImageBitmap()` 경로를 쓰면 픽셀을 읽고 쓰는 데 문제가 없다(표준 동작).

### 1-6. 저장: chrome.storage, Cache Storage, IndexedDB
- 출처: https://developer.chrome.com/docs/extensions/reference/api/storage (읽은 날 2026-09-24)
  - `storage.local` 한도는 10 MB(Chrome 113 이하는 5 MB)이고, `unlimitedStorage` 권한이 있으면 한도가 없다.
  - `storage.session`은 메모리 10 MB, `storage.sync`는 100 KB다.
  - 전부 **비동기**다.
- 출처: https://developer.chrome.com/docs/extensions/develop/concepts/storage-and-cookies (읽은 날 2026-09-24)
  - 서비스 워커에서는 IndexedDB와 Cache Storage를 쓸 수 있다. localStorage와 sessionStorage는 쓸 수 없다.
- → 설계:
  - 구름 WebP 1.5 MB와 렌더링된 지구 스냅샷은 **Cache Storage**에 둔다(바이너리 그대로. base64로 바꾸면 33% 커진다).
  - 사실 JSON과 포인터(관측 시각, 받은 시각)는 `storage.local`에 둔다(수십 KB).
  - `unlimitedStorage`는 요청하지 않는다(권한 설명 부담만 는다).

### 1-7. 주기 작업: chrome.alarms와 서비스 워커 수명
- 출처: https://developer.chrome.com/docs/extensions/reference/api/alarms (읽은 날 2026-09-24)
  - 알람은 최소 30초에 한 번이고, Chrome이 임의로 더 늦출 수 있다. 0.5분 미만 값은 무시된다(Chrome 120부터).
  - 기기가 잠들어 있는 동안 놓친 반복 알람은 깨어난 뒤 **한 번만** 울린다.
  - `persistAcrossSessions`(Chrome 150+)가 있지만, 문서는 서비스 워커가 시작할 때 알람을 다시 만들라고 권한다.
- 출처: https://developer.chrome.com/docs/extensions/develop/concepts/service-workers/lifecycle (읽은 날 2026-09-24)
  - 서비스 워커는 30초 동안 비활성이면 종료된다(이벤트나 확장 API 호출이 타이머를 초기화한다).
  - 요청 하나가 5분을 넘거나, `fetch()` 응답이 30초 넘게 오지 않아도 종료된다.
  - → 구름 1.5 MB 다운로드는 LTE에서도 수 초라 30초 안에 끝난다. 그래도 **타임아웃 25초 가드**를 두고, 실패하면 다음 알람에서 다시 시도한다.

### 1-8. 검색창
- 단일 목적 정책은 다음을 위반 예로 명시한다(https://developer.chrome.com/docs/webstore/program-policies/quality-guidelines, 읽은 날 2026-09-24).
  - "New Tab Page extensions that alter the user's web search experience and don't respect the user's existing search settings"
- API 사용 정책(https://developer.chrome.com/docs/webstore/program-policies/api-use, 읽은 날 2026-09-24)
  - 목적에 맞는 API가 있으면 그것을 써야 한다.
  - 검색 설정을 바꾸려면 `chrome_settings_overrides`를 써야 한다.
- 검색창을 꼭 넣어야 한다면 `chrome.search.query`를 쓴다(https://developer.chrome.com/docs/extensions/reference/api/search, 읽은 날 2026-09-24).
  - `search` 권한이 필요하고 Chrome 87+에서 된다. **사용자의 기본 검색 공급자**로 검색한다.
- **권장: 1차 출시에는 검색창을 넣지 않는다.** 주소창이 포커스를 갖고 있으므로 사용자는 원래대로 검색할 수 있다. Google 검색을 하드코딩한 입력창은 정확히 위 위반 사례에 해당한다.

### 1-9. 스토어 정책·등록·심사·자산
| 항목 | 내용 | 근거 |
|---|---|---|
| 단일 목적 | "narrow and easy to understand". 새 탭 + 지금 지구 + 사실 몇 줄은 **"지금 지구를 보여준다"는 하나의 목적**으로 묶인다. 할 일 목록, 뉴스, 검색 같은 무관한 기능은 넣지 않는다 | quality-guidelines(위 URL) |
| Limited Use | 사용자 데이터는 공개한 단일 목적에 필요한 만큼만 수집한다. 맞춤 광고, 판매, 데이터 브로커 제공은 금지다. 사람이 데이터를 읽는 것도 제한된다. 준수 사실을 웹사이트에 공개해야 한다 | https://developer.chrome.com/docs/webstore/program-policies/limited-use (읽은 날 2026-09-24) |
| 개인정보 관행 탭 | 단일 목적 설명, **권한마다 사유**, 원격 코드 사용 여부, 데이터 사용 공개·인증 체크, 개인정보처리방침 URL | https://developer.chrome.com/docs/webstore/cws-dashboard-privacy (읽은 날 2026-09-24) |
| 심사 기간 | "For most extensions, review is completed within a few days, but it can take up to a few weeks." 넓은 host 권한, 민감한 권한, 코드 양, **신규 개발자·신규 확장**이면 더 오래 걸린다 | https://developer.chrome.com/docs/webstore/review-process (읽은 날 2026-09-24) |
| 개발자 등록 | 일회성 등록비가 있다. 개발자 이메일은 **계정을 만든 뒤 바꿀 수 없다** | https://developer.chrome.com/docs/webstore/register (읽은 날 2026-09-24) |
| 등록비 금액 | **US$5**. 공식 문서 본문에는 금액이 없고, Google Chrome 커뮤니티 스레드에만 나온다 | **[UNVERIFIED]** |
| 판매자(trader) 여부 신고, 2단계 인증 | 공식 문서에서 확인하지 못했다 | **[UNVERIFIED]**. 등록할 때 대시보드에서 확인 |
| 이미지 자산 | 필수: 아이콘 **128×128**(그림 96×96 + 투명 여백 16px, PNG), 스크린샷 **1280×800 또는 640×400**(1~5장), 작은 홍보 이미지 **440×280**. 선택: 마키 1400×560. 작은 홍보 이미지가 없으면 검색 순위가 내려간다 | https://developer.chrome.com/docs/webstore/images (읽은 날 2026-09-24) |
| 한국어 | `_locales/ko/messages.json`과 `_locales/en/messages.json`을 두고, `default_locale`은 필수다. manifest에서는 `__MSG_name__`, JS에서는 `chrome.i18n.getMessage()`를 쓴다. 스토어 설명문 현지화는 대시보드에서 따로 한다 | https://developer.chrome.com/docs/extensions/reference/api/i18n (읽은 날 2026-09-24) |
| Edge Add-ons 재사용 | Chrome 확장 API와 manifest 키는 Edge와 코드 호환된다. `update_url`을 빼야 하고, 이름이나 설명에 "Chrome"이 들어가면 바꿔야 인증을 통과한다 | https://learn.microsoft.com/en-us/microsoft-edge/extensions/developer-guide/port-chrome-extension (읽은 날 2026-09-24) |
| Edge 등록비 | 없음. 검색 결과 요약에서 확인했고 원문(learn.microsoft.com/…/publish/create-dev-account)은 열어 보지 않았다 | **[UNVERIFIED: 원문 미열람]** |

---

## 2. 선례: 지구·위성·날씨 새 탭 확장

| 확장 | 무엇을 받나 | 어떻게 빨리 여나 / 갱신 | 사용자 불만과 교훈 | 근거 |
|---|---|---|---|---|
| **Satellite New Tab Page** (domoritz/himawari-8-chrome, 오픈소스) | Himawari·GOES·Meteosat·MTG·**GK2A**·DSCOVR EPIC 전구 영상(CIRA SLIDER GeoColor) | **마지막 영상을 localStorage에 압축 JPEG로 저장해 두고 바로 그린 뒤 최신 영상을 받는다.** 완전 오프라인 지원, 해상도 자동 선택(필요하면 타일), 캔버스에 그려 캐시한다. 원본에 CORS가 없어서 **웹판은 Cloudflare Worker로 CORS를 붙이고, 확장은 host 권한으로 직접 받는다** | 사용자 약 1,000명, 평가 24개, 2026-07-10 갱신(CWS 페이지 스크랩, 실측 2026-09-24). 별점은 스크랩 값이 섞여 있어 싣지 않는다 | https://github.com/domoritz/himawari-8-chrome (읽은 날 2026-09-24) · https://chromewebstore.google.com/detail/satellite-new-tab-page/llelgapflianaapmnpncgakfjhfhnojm |
| **Earth View from Google Earth** (Google) | 큐레이션한 Google Earth 위성 사진 2,500여 장(정지 사진, 실시간 아님) | 새 탭마다 한 장씩 보여준다 | **2024년 1월 Google이 Earth View 사이트를 닫았다.** 확장은 무작위 이미지와 최근 기록만 보여주는 상태로 남았다(9to5google). 오늘 CWS 상세 페이지는 제목이 비어 있다("empty-title"로 넘어감, 실측 2026-09-24. 내려간 것인지는 **[UNVERIFIED]**). 리뷰 요약에는 하단 바가 크다, CPU를 쓴다는 불만이 있다(검색 요약, **[UNVERIFIED]**) → **교훈: 서버가 멈추면 새 탭도 죽는다. 마지막 그림을 시각 라벨과 함께 보관해야 한다** | https://9to5google.com/2024/01/29/google-shuts-down-earth-view-wallpaper-collection/ · https://chromeunboxed.com/google-earth-view-chrome-extension-new-tab-page/ |
| **Momentum** | 매일 바뀌는 배경 사진, 명언, 할 일, 날씨 | 사용자 200만 명, 평가 1.37만 개, 패키지 17.94 MiB, 2026-09-18 갱신(CWS, 실측 2026-09-24). 무료 + Plus 구독 | 속도 불만은 공식이나 커뮤니티 근거를 찾지 못했다. → **교훈: 새 탭 확장도 무료 + 구독 구조로 돈이 된다. 우리의 v1→v2 유도와 같은 구조다** | https://chromewebstore.google.com/detail/momentum/laookkfknpbbblfpciffpaejjkokdgca |
| Planet View (Planet Labs, 오픈소스) | Planet 위성 사진 | README에 캐시나 갱신 방식 설명이 없다 | 참고용 | https://github.com/planetlabs/planet-view |

**선례에서 얻은 규칙 3개:**
1. 먼저 캐시를 그리고 나중에 받는다(domoritz).
2. 서버가 멈춰도 마지막 그림과 **그 그림의 시각**을 보여준다(Earth View 폐쇄).
3. 새 탭에는 한 가지 목적만 둔다. 검색창이나 할 일 목록을 붙이지 않는다(단일 목적 정책).

---

## 3. 우리 자료: 저장소 grep과 실측 2026-09-24

운영 규칙: 코드는 `DATA_BASE`를 쓴다(`prototype/v2-three/js/main.js:1448-1449`). earthus.net에서는 같은 출처를, 그 밖에서는 `S3_DIRECT = https://earthus-cache-kr.s3.us-east-2.amazonaws.com`을 쓴다.
v1은 `prototype/js/config.js:31` `CDN`, `API.CLOUDS·EVENTS·WIND·SOLAR`이다. **확장은 `https://earthus.net`을 고정 기준으로 쓰고, host 권한으로 CORS를 우회한다.**
S3 직접 주소는 비상용 문서 항목으로만 적는다(권한을 늘리므로 1차에는 넣지 않는다).

| 쓸 곳 | 경로 | 크기(전송) | Cache-Control | 자료 주기 / 지연 | 출처 표기(파일 안) |
|---|---|---|---|---|---|
| 구름 메타 | `/clouds/meta.json` | 약 1 KB | max-age 300 | **1시간 간격**, 자료 시각 기준 **+약 34~45분** 지연. 실측: `time 05:00Z`, Last-Modified 05:45:25Z. `aws/gmgsi-clouds/handler.py:12`에 "1시간 간격, 자료시각 +약 34분 지연" | `credit: "NOAA NESDIS GMGSI"`, `source` 원파일명 |
| 구름 그림 | `meta.variants.webp2048.key` = `/clouds/global-2048.webp` (2048×1229, **1,505,406 B**, q80, 알파 무손실) | 1.5 MB | max-age 300 | 위와 같다 | 위와 같다. `north 72.715 / south -72.737`(위도 ±72.7° 밖은 비어 있다) |
| (대안) 구름 큰 판 | `variants.webp` = `/clouds/global.webp` 3072 px, 3.0 MB | 3.0 MB | 300 | | |
| 기상특보 | `/events/kma-warn.json` | 852 B | max-age 300 | 약 5분(generated 06:02Z). 파일 안에 `freshnessPolicy {freshMinutes:30, staleAfterMinutes:45}` | "기상청 기상특보 (API허브)", 공공누리 1유형 |
| 한·일 지진 | `/events/quake-asia.json` | 2.8 KB | max-age 60 | 1분 캐시 | KMA, JMA. 항목 필드 `at`, `mag`, `place`, `placeEn`, `intensity`, `src` |
| 쓰나미(국제) | `/events/tsunami-intl.json` | 553 B | max-age 120 | | NOAA PTWC·NTWC. 본문은 옮기지 않고 링크만 건다 |
| 내 장소 하늘(한국) | `/wind/kma-aws.json` | 8 KB | max-age 600 | 정시 관측(observedKst 13:00, generated 05:25Z) | 기상청 지상관측, 97지점 `stations[]` `temp_c`, `wind_ms`, `wind_dir`… ⚠️ **`wind_dir`는 도(°)가 아니라 36방위 부호(×10°)다**(기억 `kma-wind-dir-36-code`). 풍향을 쓰려면 ×10 해야 한다 |
| 태양 활동(선택) | `/solar/meta.json` | 179 B | 600 | 약 10분 | NASA SDO, NOAA SWPC. `flareClass` |
| 세계 지진(선택, 2차) | `https://earthquake.usgs.gov/earthquakes/feed/v1.0/summary/4.5_day.geojson` | 8 KB | 60 | | USGS. `ACAO *`(실측)라서 host 권한 없이 받을 수 있다 |
| 세계 지상관측(2차) | `/wind/gts-global.json` | **271 KB** | 1800 | | 새 탭에 쓰기에는 무겁다. 한국 밖 사용자용으로 따로 설계한다 |
| ❌ 쓰지 말 것 | `/events/briefs.json` | **403** (실측) | | | CloudFront 동작이 없다 |

**바탕 지도(패키지 안):** `prototype/v2/assets/physical-earth/ne2-base-2048.jpg`(377 KB), `ne2-base-4096.webp`(440 KB). Natural Earth II는 퍼블릭 도메인이다.
**태양 위치:** `prototype/v2-three/js/main.js:127 subsolarPoint()`(NOAA 근사식, 적위 오차 ±0.01°). 우리 코드라서 그대로 옮겨 번들하면 된다.

---

## 4. 설계안 비교

기준: 캐시에서 여는 데 300 ms 미만(목표 200 ms), 발열 규칙(무한 애니메이션 금지), 모든 값에 출처와 시각, 지어내지 않기, 스토어 정책.

| | **A. earthus.net(v1) 전체 iframe** | **B. 확장 안의 가벼운 렌더러 (권장, 2D 캔버스)** | **C. 서버 렌더링 그림(Lambda PNG) + 사실** |
|---|---|---|---|
| 새 탭 한 번의 비용 | v1 첫 로드는 LTE 실측 **3.1 s / 6.1 MB**. 데스크톱 광대역에서는 HTTP 캐시가 돌면 전송은 줄지만 **탭마다 Cesium을 초기화하고 WebGL 컨텍스트를 하나씩 만든다** | 캐시 스냅샷 1장(약 150~300 KB, 로컬 디스크)을 그리고 종이 한 장 수준의 계산을 한다. **네트워크 0건으로 첫 그림이 나온다** | 캐시된 PNG 1장을 그린다. 네트워크 0건 |
| 첫 그림 < 300 ms | ❌ 불가능(Cesium 부팅) | ✅ | ✅ |
| 발열·GPU | ❌ 탭마다 WebGL 컨텍스트가 생기고, 렌더 루프와 규칙 충돌 위험이 있다 | ✅ WebGL을 쓰지 않는다. 한 번 그리고 멈춘다 | ✅ |
| 오프라인 | ❌ 빈 화면(v1 sw.js가 확장 파티션 안에서 동작할지도 미확인) | ✅ 마지막 그림과 "관측 HH:MM" 표시 | ✅ |
| 정직성(출처·시각) | v1 화면 그대로(✅) | 확장이 직접 표기한다(설계로 보장) | 서버가 그림에 박는다. 낮밤 경계는 렌더링 시각에 고정된다(표기 필요) |
| 개인화(내 장소 중심, 도시) | v1 기능 그대로 | ✅ 클라이언트에서 중심 경도를 고른다 | ❌ 뷰 수만큼 서버가 렌더링해야 한다(예: 4면) |
| 스토어 정책 | ⚠️ **"웹페이지를 띄우는 것이 목적의 전부"(최소 기능) 위험.** iframe은 RHC 면제지만 이 조항은 별개다 | ✅ 확장이 기능을 직접 제공한다 | ✅(확장이 그림과 사실을 조합) |
| 서버 비용과 작업 | 추가 없음(CDN 전송은 늘어남) | Lambda 추가 없음. CDN 전송만 는다(§5-3) | **새 Lambda 필요**(이미 67개가 넘는 핸들러에 하나 추가, 렌더링 메모리). 구름이 1시간 주기라 렌더링도 1시간 주기 |
| 유지보수 | v1이 바뀌면 자동 반영 | 확장 코드는 스토어 심사를 거쳐야 갱신된다(며칠~몇 주). **그래서 로직은 작고 고정되게, 자료만 서버에서 받는다** | 그림 스타일은 서버에서 바꿀 수 있다(심사 없음) |
| 결론 | ❌ 떨어뜨린다 | ✅ **권장** | 보조: 스토어 스크린샷, OG 이미지, 매일 한 장 공유용 |

**B 안에서 Three.js를 쓰지 않는 이유:** 한쪽 면만 보이는 정적 지구는 정사영(orthographic) 한 번이면 그려진다.

- Three.js는 번들 188 KB(gzip)를 더하고, 탭마다 WebGL 컨텍스트를 만든다.
- 돌려 보고 싶어지는 순간 렌더 루프가 생긴다. 회전과 3D 탐색은 **`지구 전체 보기` → earthus.net이 맡는다.**

**v1→v2 연결(PD 결정 ①과 같은 문법):**
- 새 탭 안에 v2를 넣지 않는다. 기억 `v1-to-v2-upsell-grammar` 규칙대로 **"다음 질문" 한 줄**만 둔다. 배너는 금지다.
- 이 한 줄은 earthus.net/v2/로 **같은 탭에서 이동**한다(iframe 아님).
- v1 새 탭은 사실만 보여준다(예보 없음. v1 원칙). 예보라는 말은 v2 링크 문구에만 나온다.

---

## 5. 권장안 B 상세

### 5-1. 화면(한국어 문구 초안). 무엇이 보이나
화면은 세 층이다. ① 바탕 ② 지구 ③ 사실 카드. Chrome 138 하단 바 자리(아래 약 48 px **[UNVERIFIED: 높이 실측 필요]**)는 비워 둔다.

- **지구(가운데):** 정사영으로 그린 한쪽 면이다. 중심은 "내 장소" 경도이고 위도는 약 20°N으로 기울인다. 기본 내 장소는 서울이다.
  - 바탕 지도: Natural Earth II(패키지 안)
  - 구름: NOAA GMGSI 적외선 합성. 위도 ±72.7° 밖은 구름 자료가 없어서 **그리지 않는다**(지어내지 않는다).
  - 밤: 여는 순간의 태양 직하점으로 계산한 경계 밖을 어둡게 칠한다.
  - 움직임은 없다(열 때 한 번 그리고 끝).
- **지구 아래 출처 줄(항상 보임):**
  - `구름 · NOAA GMGSI 다중위성 적외선 합성 · 관측 14:00 KST (05:00 UTC)`
  - `낮과 밤 · 지금 태양 위치로 계산 (15:12 KST)`
  - `바탕 · Natural Earth II`
- **사실 카드(오른쪽, 최대 4줄. 자료가 없으면 줄을 비우지 않고 그 줄을 뺀다).** 아래 값은 2026-09-24 실측 파일에서 옮겼다. 표시한 한 줄만 문구 예시다.
  - 내 장소 하늘: `서울 26.2℃ · 바람 2.2 m/s · 기상청 지상관측 13:00 KST`(kma-aws 지점 108, 실측)
  - 기상특보(발효 중일 때): `기상특보 · ○○주의보 N개 구역 · 기상청 HH:MM KST 기준`(**문구 예시. 값은 비워 둔 틀**, `activeCount`와 `active[]`에서 채운다)
    - 없을 때: `지금 발효 중인 기상특보 없음 · 기상청 15:02 KST 기준`(실측: `activeCount 0`, `observedKst 202609241502`)
    - "없음"도 사실이고 시각이 붙는다. 다만 파일의 `staleAfterMinutes 45`를 넘기면 "없음"이라고 말하지 않고 `특보 자료 지연 (마지막 15:02)`으로 쓴다.
  - 최근 지진: `M3.0 · 일본 기후현 미노 동부 · 12:39 KST · 일본 기상청 · 진도 1`
    - 필드는 `place`, `at`, `src`, `intensity`에서 그대로 가져온다. 한국 기상청 항목이 있으면 그것을 먼저 쓴다.
  - 쓰나미 경보(있을 때만): `쓰나미 · PTWC 발표 1건 · 원문 보기 →`(본문은 옮기지 않는다)
- **버튼과 링크:**
  - `지구 전체 보기 →` (https://earthus.net/, 같은 탭)
  - 다음 질문 한 줄(v2): `이 구름은 닷새 뒤 어디에 있을까? → EARTHUS Intelligence` (https://earthus.net/v2/)
- **상태 문구(무작위 금지. 항상 같은 조건이면 같은 문구):**
  - 오프라인: `오프라인 — 마지막으로 받은 그림 (관측 14:00 KST)`
  - 구름이 2시간 넘게 갱신되지 않음: `구름 자료 지연 — 마지막 관측 3시간 전 (11:00 KST)`
  - 첫 설치이고 캐시가 없음: 바탕 지도와 밤 경계만 먼저 그린다. `구름 관측을 받는 중…` 문구를 띄우고, 받으면 교체한다(1회, 300 ms 페이드 한 번).
- **설정(옵션 페이지):** 내 장소를 도시 목록에서 고른다(한국 시·도 + 주요 도시, **위치 권한은 쓰지 않는다**). 표시 언어는 브라우저를 따른다.
- **`<title>`:** `새 탭 · 지금 지구 — EARTHUS`(Chrome 기본 새 탭과 헷갈리지 않게).

### 5-2. 컴포넌트(파일) 목록. 제안 경로 `apps/chrome-newtab/` (PD 승인 뒤 생성)
| 파일 | 역할 |
|---|---|
| `manifest.json` | MV3, `chrome_url_overrides.newtab`, `default_locale: "ko"`, 권한(§5-4), `background.service_worker: "sw.js"`, `options_page` |
| `newtab.html` / `newtab.css` | 인라인 스크립트 없음. 스냅샷 `<img>`와 오버레이 `<canvas>`, 사실 카드, 하단 바 여백 |
| `newtab.js` | ① 캐시 스냅샷 즉시 표시 ② 밤 경계 오버레이 ③ 사실 카드 렌더 ④ 캐시가 오래됐으면 SW에 갱신 요청 ⑤ 새 자료가 오면 스냅샷을 다시 만든다. rAF 루프 없음 |
| `globe2d.js` | 등장방형(equirect) → 정사영 역사상. 바탕+구름 합성은 `OffscreenCanvas`/Worker에서 자료가 바뀔 때만 한다. 밤 경계는 경로(대원) 채우기로 몇 ms 안에 그린다 |
| `sun.js` | `subsolarPoint()`: `prototype/v2-three/js/main.js:127`에서 옮긴다(주석으로 출처를 남긴다) |
| `feeds.js` | 엔드포인트 표(§3), 파서, 신선도 판정(파일 안의 `freshnessPolicy`가 있으면 그것을 따른다), 풍향 36방위 변환 |
| `store.js` | Cache Storage(구름 WebP, 스냅샷)와 `chrome.storage.local`(사실 JSON, 시각 포인터). 구름은 최신 1벌만 남긴다 |
| `sw.js` | `chrome.alarms` 15분: meta.json과 사실 JSON(합계 약 5 KB)을 받는다. `meta.time`이 바뀌었고 **최근 2시간 안에 새 탭이 열린 적이 있을 때만** WebP 1.5 MB를 받는다. 받을 때마다 fetch 타임아웃 25초. ⚠️ **WebP 주소에 `?t=<meta.time>`을 붙인다**(main.js:1630 패턴). 붙이지 않으면 엣지가 메타와 그림을 따로 캐시해서 새 시각 라벨에 지난 시각 그림이 짝지어진다(main.js:1615-1622 주석) |
| `options.html` / `options.js` | 내 장소 도시 선택(목록은 패키지 안 JSON), 사실 줄 켜고 끄기 |
| `data/cities.json` | 도시 이름, 좌표, 가장 가까운 기상청 지점 id(미리 계산) |
| `assets/ne2-base-2048.jpg` | 바탕 지도(377 KB). 필요하면 4096 webp |
| `icons/16·32·48·128.png` | **브랜드 v5 로고만 쓴다**(기억 `brand-assets-v5-only`. 새로 만들지 않는다) |
| `_locales/ko/messages.json`, `_locales/en/messages.json` | 모든 문구 |
| `tools/build-chrome-ext.sh` | zip으로 묶기, **원격 `<script>`와 `eval` 부재 검사**, manifest 검증. 배포 스크립트가 아니라 패키지만 만든다 |
| `tests/` | 아래 §6 기준을 재는 Playwright/Puppeteer 스크립트(확장 로드 모드) |

### 5-3. 갱신 주기: 자료 주기에 맞춘다
- 구름 자료는 1시간 주기이고 약 45분 늦게 올라온다. 사실 자료는 1~10분 캐시다.
- **알람 15분마다:** meta.json, kma-warn, quake-asia, tsunami-intl, (kma-aws)를 받는다. 약 5 KB(압축 전송 기준 대략)이고 하루 96회면 **약 0.5 MB/일**이다.
- **구름 WebP:** `meta.time`이 바뀔 때만 받는다. 1시간에 최대 1회, 1.5 MB다.
  - 조건 없이 받으면 브라우저를 종일 켜 둔 사용자 한 명이 **약 36 MB/일**을 쓴다.
  - "최근 2시간 안에 새 탭을 연 사람만" 조건을 걸면 8시간 사용 기준 약 12 MB/일이다.
- **CDN 전송량 추정(사용자 1만 명, 하루 8시간 사용):** 약 120 GB/일, 약 3.6 TB/월이다. 금액은 CloudFront 요금표로 PD가 확인해야 한다 **[UNVERIFIED: 단가 미조회]**.
  - → **PD에게 물을 것:** Lambda `gmgsi-clouds`에 확장용 작은 변형을 추가할지. 예: 1536 px q70, 추정 0.7~0.9 MB **[UNVERIFIED: 미측정]**. 새 탭 지구 지름 약 900 px에는 2048 px 등장방형이면 반구 폭 약 1024 px라 충분하다.
- 새 탭을 여는 순간에는 **네트워크를 기다리지 않는다.** 캐시가 오래됐으면 SW에 갱신을 요청하고, 도착하면 한 번 교체한다.

### 5-4. 권한(최소)
| 권한 | 이유(스토어 사유 문구 초안) |
|---|---|
| `storage` | 마지막으로 받은 관측 자료와 그 시각, 사용자가 고른 도시를 이 브라우저 안에 저장한다 |
| `alarms` | 15분마다 새 관측(구름·특보·지진)이 있는지 확인한다 |
| `host_permissions: ["https://earthus.net/*"]` | EARTHUS 자료 서버에서 관측 자료(JSON·이미지)를 받는다. 코드는 받지 않는다 |
| (넣지 않음) `geolocation`, `tabs`, `search`, `unlimitedStorage`, `<all_urls>` | 목적에 필요하지 않다. 넣지 않으면 심사가 빨라진다(review-process) |

**개인정보 공개(초안):** 수집하는 사용자 데이터가 없다. 도시 선택은 기기 안에만 저장한다. 서버로 가는 요청은 공개 자료 파일을 받는 GET뿐이고 식별자를 붙이지 않는다.
분석 도구는 1차에 넣지 않는다. 넣는다면 Limited Use 공개와 개인정보처리방침(`prototype/legal/`)을 갱신하는 일이 먼저다.
**원격 코드:** "아니오".

### 5-5. 단일 목적 문구(스토어용 초안)
- ko: "새 탭을 열면 지금의 지구를 보여줍니다. 최근 위성 구름 관측과 지금의 낮과 밤, 그리고 출처와 관측 시각이 붙은 몇 가지 사실(내 장소 날씨, 기상특보, 최근 지진)을 표시합니다."
- en: "Shows the Earth right now on every new tab: the latest satellite cloud observation, current day and night, and a few facts (local weather, active warnings, latest earthquake), each with its source and observation time."

---

## 6. 완료 기준(결과로 확인하는 것)
측정 환경: 중급 노트북(예: 4코어, 내장 GPU), Chrome 안정판, 확장을 설치한 상태. 각 기준마다 측정 방법을 붙인다.

1. **캐시가 있을 때 새 탭 첫 그림(지구 + 구름 + 관측 시각 라벨)이 200 ms 안에 나온다.** 측정: `performance.now()` 기록, 또는 트레이스의 첫 contentful paint를 20회 측정한 중앙값.
2. **오프라인(네트워크 끊김)에서 새 탭을 열면 마지막 그림과 `관측 HH:MM KST` 라벨, `오프라인` 문구가 보인다.** 이때 새 탭이 보내는 요청은 **0건**이다. 측정: DevTools Offline, 네트워크 로그.
3. **GMGSI `meta.time`이 바뀐 뒤 20분 안에(알람 15분 + CloudFront meta.json 캐시 5분, 새 탭을 쓰고 있는 사용자 기준) 새 구름이 새 탭에 나온다.** 라벨 시각이 `meta.time`과 같아야 한다. 측정: 라벨 문자열과 meta.json 비교.
4. **새 탭을 연 뒤 5초가 지나면 CPU 사용이 0%에 가깝고 `requestAnimationFrame` 콜백이 0회다.** 측정: Performance 패널 10초 기록, rAF 카운터.
5. **화면의 모든 값 옆에 출처와 시각이 있다.** 사실 카드 줄마다, 구름, 밤 경계 모두다. 측정: DOM을 검사해 값 요소마다 `data-source`와 `data-time`이 있는지 본다.
6. **자료가 늦으면 "지연"이라고 말한다.** 구름이 2시간을 넘기면 `구름 자료 지연`, 특보가 `staleAfterMinutes`를 넘기면 "특보 없음" 대신 `특보 자료 지연`이 나온다. 측정: 시계를 조작한 시험.
7. **발효 중인 특보가 있으면 그 이름과 구역 수가 나오고, 없으면 `발효 중인 기상특보 없음 · 기상청 HH:MM 기준`이 나온다.** 빈칸이 아니라 문장이 나와야 통과다.
8. **새 탭을 열어도 주소창 포커스가 유지된다**(바로 입력하면 주소창에 들어간다). 페이지 안에 검색창이 없다.
9. **Chrome 138 하단 바가 켜져 있어도** 출처 줄, 버튼, 사실 카드가 가려지지 않는다. 측정: 1280×800, 1920×1080, 1366×768 스크린샷.
10. **`지구 전체 보기`를 누르면 같은 탭에서 earthus.net이 열리고, 다음 질문 줄을 누르면 earthus.net/v2/가 열린다.**
11. **패키지에 원격 스크립트와 `eval`이 0건이다.** 권한은 §5-4의 세 가지뿐이다. 측정: 빌드 스크립트 검사.
12. **한국어와 영어 UI가 모두 나온다.** 브라우저 언어가 ko면 한국어, 그 밖이면 영어다.
13. **첫 설치 직후(캐시 없음)에도 바탕 지도와 밤 경계가 200 ms 안에 나오고,** 구름은 도착하면 한 번 교체된다.

---

## 7. PD가 결정할 것
1. 권장안 B(2D 캔버스, iframe 없음)를 승인할지.
2. 확장용 작은 구름 변형(예: 1536 px)을 Lambda에 추가할지. CDN 전송량은 §5-3.
3. 1차 "내 장소"를 한국 도시만으로 할지. 해외 도시는 GTS 271 KB 설계가 따로 필요하다.
4. v2 다음 질문 한 줄의 문구와 대상 화면.
5. Chrome Web Store 개발자 계정 이메일. **나중에 바꿀 수 없다.** 등록비 결제는 PD가 직접 한다.
6. Edge Add-ons에 동시 출시할지(코드 호환, 이름에 "Chrome"만 없으면 된다).
7. 분석 도구를 넣을지(넣으면 개인정보 공개가 늘어난다).

## 8. 이 조사에서 확인하지 못한 것 [UNVERIFIED 모음]
- 등록비 US$5(공식 본문에 금액 없음), 판매자 신고, 2단계 인증 요건.
- 설치 직후 "Is this the new tab page you were expecting?" 확인 창(제3자 글만 있음).
- 두 확장이 동시에 새 탭을 교체할 때 어느 쪽이 이기는지.
- Chrome의 WebGL 활성 컨텍스트 상한 값.
- 새 탭 iframe만 있는 확장이 실제로 최소 기능 정책으로 반려된 사례.
- iframe 안에서 Supabase 로그인이 실제로 되는지(문서상 host 권한이 있으면 최상위 파티션).
- Earth View CWS 상세 페이지가 비어 있는 이유(내려갔는지).
- Edge 등록비 없음(검색 요약만 봄).
- CloudFront 단가, 1536 px 변형 크기.
- 서비스 워커 안에서 `OffscreenCanvas` 사용 가능 여부(안 되면 합성은 새 탭 페이지의 Worker에서 한다).

## 9. 출처 목록 (전부 읽은 날 2026-09-24)
- https://developer.chrome.com/docs/extensions/develop/ui/override-chrome-pages
- https://developer.chrome.com/docs/extensions/reference/manifest/content-security-policy
- https://developer.chrome.com/docs/extensions/develop/migrate/remote-hosted-code
- https://developer.chrome.com/docs/webstore/program-policies/mv3-requirements
- https://developer.chrome.com/docs/webstore/program-policies/minimum-functionality
- https://developer.chrome.com/docs/webstore/program-policies/quality-guidelines
- https://developer.chrome.com/docs/webstore/program-policies/api-use
- https://developer.chrome.com/docs/webstore/program-policies/limited-use
- https://developer.chrome.com/docs/webstore/cws-dashboard-privacy
- https://developer.chrome.com/docs/webstore/review-process
- https://developer.chrome.com/docs/webstore/register
- https://developer.chrome.com/docs/webstore/images
- https://developer.chrome.com/docs/extensions/reference/api/alarms
- https://developer.chrome.com/docs/extensions/develop/concepts/service-workers/lifecycle
- https://developer.chrome.com/docs/extensions/develop/concepts/network-requests
- https://developer.chrome.com/docs/extensions/develop/concepts/storage-and-cookies
- https://developer.chrome.com/docs/extensions/reference/api/storage
- https://developer.chrome.com/docs/extensions/reference/api/search
- https://developer.chrome.com/docs/extensions/reference/api/i18n
- https://groups.google.com/a/chromium.org/g/chromium-extensions/c/DNj1B3vywr0 (Chrome 138 NTP 하단 바 PSA)
- https://learn.microsoft.com/en-us/microsoft-edge/extensions/developer-guide/port-chrome-extension
- https://github.com/domoritz/himawari-8-chrome
- https://9to5google.com/2024/01/29/google-shuts-down-earth-view-wallpaper-collection/
- https://chromeunboxed.com/google-earth-view-chrome-extension-new-tab-page/
- https://malwaretips.com/blogs/is-this-the-new-tab-page-you-were-expecting-popup/ (제3자, UNVERIFIED 근거)
- https://support.google.com/chrome/thread/13959323 (등록비 $5 언급, 커뮤니티, UNVERIFIED 근거)
- 저장소: `prototype/v2-three/js/main.js:127,1448-1449,1624`, `prototype/js/config.js:31-69`, `aws/gmgsi-clouds/handler.py:12`, `prototype/v2/assets/physical-earth/`, `prototype/vendor/three-r184*`, `docs/HANDOVER.md §3·§5·§7`
