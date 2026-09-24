# EARTHUS 앱 준비도 조사 — 저장소 실측 (2026-09-24)

범위: 안드로이드 앱(v1 무료 + v2 유료 한 앱) · 크롬 확장(새 탭 = 지금 지구) 착수 전, 저장소에 **이미 있는 것 / 없는 것**을 file:line 으로 정리.
방법: 읽기 전용(파일 읽기·grep·`curl` GET/HEAD). 비밀 파일(config.local.js 등)은 열지 않음. 운영 응답은 2026-09-24 06:0x UTC 실측.
표기: ✅ 있음 · ⚠️ 있으나 문제/조건 · ❌ 없음 · (플랫폼) = 저장소 밖 일반 사실.

---

## 0. 한눈에 — 앱 방식을 가르는 사실들 (권고 아님, 사실만)

| # | 사실 | 근거 | 무엇을 가르나 |
|---|---|---|---|
| F1 | 로그인은 Supabase `signInWithOAuth` **전체 페이지 리다이렉트**(팝업 아님), `redirectTo: location.href`, 제공자는 Google·Apple 둘뿐 | `prototype/js/auth.js:12`, `:82-93`, `:41`(detectSessionInUrl) | (플랫폼) Google 은 임베디드 WebView 의 OAuth 를 `disallowed_useragent` 로 거절 → **순수 WebView 앱이면 로그인 경로를 새로 짜야 함.** TWA(=크롬)면 웹 그대로 동작 |
| F2 | 결제 어댑터의 안드로이드 쪽은 **WebView 자바스크립트 브리지** `window.AndroidBilling.purchase(planId)` 를 가정 | `prototype/js/billing.js:268-272` | 과거 조사 문서는 TWA 면 **Digital Goods API + Payment Request API** 라고 적음(`docs/research-2026-07.md:678`). 코드와 문서가 서로 다른 래퍼를 가정하고 있음 |
| F3 | 약관 제8조: 결제는 **웹사이트에서 카드·간편결제(토스페이먼츠)**, **자동 갱신 없는 기간 이용권**, 해지 절차 없음 | `prototype/legal/terms.ko.md:94-101` | 앱 안에서 Play 결제(구독)로 팔면 약관 문구와 어긋남 — 약관 개정이 선행 |
| F4 | 판매 스위치가 넷 겹쳐 있고 **전부 닫힘**: `MONETIZATION_MODE=FREE_OPEN`·`SALES_OPEN=false`(클라이언트), `SALES_ENABLED`(서버), `OPEN_METEO_COMMERCIAL_READY`·`GVP_COMMERCIAL_READY`(자료 라이선스) | `docs/HANDOVER.md` §8(446~), `supabase/functions/checkout/index.ts:49`, `prototype/js/billing.js:386-394` | 스위치를 열지 않으면 앱의 v2 도 **FREE_OPEN(전부 열림)** 상태로 나감 |
| F5 | v2 의 등급은 **서버가 아니라 같은 출처 localStorage `earthus.tier`** 에서 읽음. 값은 v1 이 로그인 후 서버 profile 로 씀 | 읽기 `prototype/v2-three/js/report-center.js:101-106` · 쓰기 `prototype/js/ui-account.js:429` → `prototype/js/store.js:136-139` | v1·v2 가 **같은 출처·같은 저장소**에 있어야 등급이 이어짐(한 앱 안에서 둘 다 earthus.net 이면 성립). 클라이언트가 고칠 수 있는 값이라 유료 판매 시 서버 판정이 따로 필요 |
| F6 | `https://earthus.net/.well-known/assetlinks.json` → **403** (없음). 저장소에도 `.well-known` 없음 | curl 실측, `ls -a prototype` | TWA 필수 요건(Digital Asset Links) 미충족 |
| F7 | 서비스워커가 **v2 경로를 일부러 건너뜀** (`/v2`, `/Intelligence`, `/v2-deploy` …) | `prototype/sw.js:92` | v2 는 오프라인 대체 화면 없음. v1 은 화면 이동(navigate)만 캐시된 index.html 로 떨어짐 |
| F8 | 자료 JSON 의 CORS 헤더가 **붙었다 안 붙었다** 함(CloudFront 캐시 키에 Origin 없음) | 코드 주석 `prototype/v2-three/js/main.js:1438-1447`, 실측 표 §7 | 크롬 확장은 `host_permissions: https://earthus.net/*` 로 받아야 함(확장 권한 fetch 는 CORS 무관 — 플랫폼) |
| F9 | v1 은 Cesium·satellite.js 를 **jsDelivr CDN** 에서 받음. v2 는 three.js 를 번들 안 `vendor/` 에 둠 | `prototype/index.html:119`, `:1374`(Cesium 1.143 jsDelivr), `:1392-1395`(satellite.js), `tools/build-v2-bundle.sh:33-34`, `prototype/v2-deploy/vendor/three-r184.module.min.js` | (플랫폼) MV3 확장 페이지는 원격 스크립트 금지 → 확장 안에서 v1 지구는 못 띄움. v2 코드는 이론상 동봉 가능하나 번들 44 MB |
| F10 | 저장소·문서 어디에도 **크롬 확장 / 새 탭** 계획이 없음 | §6 grep | 2026-09-24 PD 결정 "새 탭 = 지금 지구"는 모든 문서보다 새것 |
| F11 | 운영 `/`·`/v2/` 응답에 **CSP·X-Frame-Options·HSTS 헤더가 없음** | curl -I 실측(§7 끝) | (플랫폼) MV3 확장 페이지는 원격 스크립트를 못 돌리지만 `<iframe src="https://earthus.net/…">` 로 담는 것은 이 헤더 상태에서 막히지 않음 → 번들 44 MB 를 동봉하지 않고 실제 지구 화면에 닿는 경로가 열려 있음. 반대로 자료 JSON 만 쓰면 확장 안에서 따로 그려야 함 |

---

## 1. v1 PWA 현황

### 1-1. `prototype/manifest.webmanifest` (전체 20줄)
| 필드 | 값 | 줄 |
|---|---|---|
| name / short_name | `earthus — 지금 지구` / `earthus` | :2-3 |
| description | 한국어 한 문단 | :4 |
| lang / dir | `ko` / `ltr` | :5-6 |
| start_url | `./index.html` | :7 |
| scope | `./` (사이트 루트 → `/v2/`, `/Intelligence/` 도 범위 안) | :8 |
| display | `standalone` | :9 |
| orientation | `any` | :10 |
| background_color / theme_color | `#000000` / `#02060c` | :11-12 |
| categories | weather, education, utilities | :13 |
| icons | 192 png(any), 512 png(any), **같은 512 png 를 maskable 로 재사용**, icon.svg(any) | :14-19 |
| 없음 | `id`, `shortcuts`, `screenshots`, `share_target`, `launch_handler`, `display_override`, 영어 로케일 | — |

- 아이콘 실물: `prototype/icon-192.png` 192×192, `icon-512.png` 512×512, `apple-touch-icon.png` 180×180 (RGBA). 세 SVG(`prototype/icon.svg`, `favicon.svg`, `logo/earthus-appicon.svg`)는 v5 정본 `D:\## APP\Earthus v2_DOC\브랜드 시트\v5\earthus-appicon.svg` 와 **md5 동일**(f24f9d07…).
- ⚠️ maskable 품질: icon-512 는 **둥근 모서리 + 모서리 투명**(rx 27/120) 도안. 가운데 ∧ 글리프는 안전 영역(지름 80%) 안에 들어가지만, maskable 규격(가장자리까지 꽉 찬 배경)이 아님 → 사각·스쿼클 마스크에서 투명 모서리가 드러날 수 있음. 전용 maskable/adaptive 아이콘 없음.
- ⚠️ theme-color 불일치: manifest `#02060c` · v1 `<meta theme-color>` `#000000`(`prototype/index.html:9`) · v2 `#030608`(`prototype/v2-three/index.html:31`) · intro `#02060c`(`prototype/intro.html:6`).
- 운영 응답: `/manifest.webmanifest` → `application/manifest+json`, `no-cache` (실측).

### 1-2. 등록·메타 (`prototype/index.html`)
- manifest 링크 `:38`, 아이콘 `:39-42`(svg·192 png·favicon.ico), apple-touch-icon `:44`, `apple-mobile-web-app-*` `:32-34`, og 이미지 1200×630 `:52-62`.
- 서비스워커 등록 `:1397-1402` — `load` 뒤 `navigator.serviceWorker.register('sw.js', { scope: './' })`, 실패는 삼킴.
- 이어서 `/js/earth-switch.js`(:1403), `/js/app-bar.js` 로드.

### 1-3. `prototype/sw.js` (241줄)
- 목적(머리말 :3-16): ① 설치 가능 ② **"폰에만 옛 화면이 남는" stale 사고 방지** — "배너가 옛 위치(하단)에 남는 문제가 이거였다"(:5-8).
- 캐시 이름·버전: `CACHE='earthus-shell-2026-09-07-scope'`(:18), 옛 캐시 8개 목록(:19-28) — activate 때 앱 코드만 옮기고 삭제(:57-80). 버전은 **손으로 올리는 문자열**.
- 설치 시 사전 캐시: `./index.html`, `./manifest.webmanifest`, 은하수 2K 파노라마(:29-30, :51-55).
- fetch 전략:
  - GET 만, **다른 출처는 전부 통과**(CDN·NASA·자료 버킷이 아니라 같은 출처만 다룸) :84-88.
  - ⚠️ **v2/v3 경로 우회** :89-92 — 사고 기록: "2026-09-07 실측: /v3 의 모듈 스크립트 fetch 가 한 번 실패하자 아래 폴백이 v1 index.html 을 돌려줘 MIME 오류로 … 0% 에서 멈췄다".
  - 천구 파노라마: 네트워크 → 실패 시 2K (:96-100).
  - 앱 코드(navigate·document·script·style): **network-first, `cache:'no-cache'`**(조건부 요청) → 성공 시 캐시에 저장, 실패 시 캐시 → navigate 면 `index.html` 폴백(:103-129). 스크립트에 HTML 폴백을 주지 않도록 막은 사고 기록(:127).
  - 자료 JSON·타일은 캐시하지 않음(:14, :114). 예외: AETHERUS 현장 세션 의존 2개(:31-35, :106-113).
- 메시지 `earthus:aetherus-cache-session-shell` — 세션 체크포인트용 제한 캐시, SHA-256 헤더 부착(:136-171).
- **웹푸시 이미 구현**(:173-241): `push`(본문 파싱 실패해도 반드시 알림 :182-209, `icon.png` 없던 파일 403 사고 기록 :192-196, 긴급 시 `requireInteraction`·긴 진동 :203-205), `notificationclick`(열린 창 재사용 :211-227), `pushsubscriptionchange`(창에 재구독 요청 :231-241).
- 오프라인 동작(추론, 코드 기준): 오프라인이면 index.html 은 캐시로 뜨지만 Cesium(jsDelivr)·자료 JSON 은 캐시 안 됨 → **지구가 그려지지 않음**. 오프라인 전용 화면 없음.
- 운영: `/sw.js` → `text/javascript`, `no-cache`(실측).

---

## 2. v2 PWA 현황 · v1↔v2 이동 · 링크 형식

### 2-1. v2 설치 요소
- `prototype/v2-three/index.html`: `theme-color` `:31`, `rel=icon` SVG(`./assets/brand/earthus-appicon.svg`) `:32`, og/twitter `:16-30`. **manifest 링크 ❌, 서비스워커 등록 ❌, apple-touch-icon ❌.** 배포 번들 `prototype/v2-deploy/index.html` 도 `rel="manifest"|serviceWorker` 0건(grep).
- 스크립트: `./js/main.js?v=206-flood`(:2142), 공용 전환기 `/js/earth-switch.js`(:2143 — **루트 절대경로, v1 배포물에 의존**).
- 주소: 실제 파일 `/v2/`, 메뉴가 거는 이름은 `/Intelligence` — 같은 index.html 에 `<base href="/v2/">` 를 얹어 `/Intelligence`, `/Intelligence/`, `/Intelligence/index.html` 세 키로 발행(`tools/deploy-v2-three.sh:195-212`). `/v2`(슬래시 없음)는 리다이렉트 HTML(:59-60).
- 운영 응답: `/v2/` → `no-cache, no-store, must-revalidate`, `/Intelligence/` 200(실측).
- TWA 범위 관점(사실): v1 manifest `scope:"./"` 가 루트라 `/v2/`·`/Intelligence/` 도 같은 출처·같은 범위. 다만 v2 를 **단독으로** 설치하려면 v2 페이지에 manifest 가 있어야 하는데 없음. v1 SW 는 v2 요청을 손대지 않음(F7).
- 무게: v2 번들 `prototype/v2-deploy` 44 MB(assets 22 MB · data 8.4 MB · js 3.1 MB · vendor 816 KB · engine 313 KB). 과제 제공 실측: v2 첫 로드 2.2 s / 8 MB, v1 3.1 s / 6.1 MB(LTE).
- v2 가 부르는 외부 호스트(코드 grep): earthus-cache-kr S3(개발 폴백), gibs.earthdata.nasa.gov, server.arcgisonline.com, gdacs.org, earthquake.usgs.gov, api.worldbank.org, api.open-meteo.com, cdn.jsdelivr.net(1건), ll.thespacedevs.com 등.

### 2-2. v1↔v2 전환 (`prototype/js/earth-switch.js`, 324줄)
- 두 지구 목록: `EARTHUS → '/'`, `Intelligence → DEV ? '/v2-three/' : '/Intelligence'` (:69-72). `/v2` 는 메뉴에 걸지 않음(:15-23, :65-68).
- 현재 지구 판별 `/v2`, `/v2-three`, `/Intelligence` (:96-100). 지금 지구를 다시 누르면 해시·쿼리 떼고 처음 화면(:186-190).
- 좁은 화면(≤720px)은 브랜드 아이콘 버튼 + 드롭다운(지구 둘 + 설정·로그인만 입양) (:30-50, :120-159). 아이콘 `/logo/earthus-appicon.svg`(:63).
- v1 → v2 추가 진입: `prototype/js/main.js:429-432` (`location.href = dev ? '/v2-three/' : '/Intelligence'`).
- v2 → v1 로그인 왕복: v2 `btn-login` → `/?login=1&back=<v2 경로>` (`prototype/v2-three/js/main.js:5762-5769`) ← v1 이 `back`(허용 패턴 `^/[a-z0-9/-]*$`)·`popup=1`·`login=1` 처리(`prototype/js/main.js:755-780`). 주석: "계정은 EARTHUS(v1)에만 있다".
- 유료 유도 문법 정본: `docs/V1-V2-UPSELL-MAP-2026-09-06.md`(모든 메뉴에 '다음 질문' 하나, 잠금은 결과 일부 노출 뒤, 배너 금지, 기관 발표·안전은 잠그지 않음 :5-24).

### 2-3. 링크·딥링크 형식
| 형식 | 쓰는 곳 | 근거 |
|---|---|---|
| `#v=1&at=위도,경도,거리,틸트&base=ne2&cloud=gk2a&live=a,b&q=hdp&pop=KOR&c=KOR` | v2 화면 상태. 1.2초마다 `history.replaceState` 로 기록, 로드·hashchange 때 복원 | `prototype/v2-three/js/main.js:6720-6748`, 복원 `:6750-6790`, hashchange `:7300-7307` |
| `/v2/?tab=my&event=<id>&from=forme.<menu>` | v1 FOR ME 한 줄·사건 방 → v2 My 탭. `from` 은 메뉴 이름만(7종) | 생성 `prototype/js/for-me-row.js:77-83`, 읽기 `:86-89`, v2 처리 `prototype/v2-three/js/main.js:7214-7225` |
| ⚠️ 위 FOR ME 링크 기본값은 `base='/v2/'` — 메뉴 규칙(`/Intelligence`)과 다름 | | `for-me-row.js:77` vs `earth-switch.js:71` |
| `?measure=1` | v2 현장 측정판 | `prototype/v2-three/js/main.js:7246` |
| v1 공유 URL 계약 v1: 쿼리 키 `earth, earthView, earthLayer, earthAt, earthModel, earthPoint, earthRead, earthActivity, earthReservation` | v1 | `prototype/js/earth-route-state.js:1-17` |
| v1 기타: `?skyframe=1`, `?spaceops`, `#api`, `#dev`, `?tc=<태풍>`, `?station=` | v1 | `prototype/js/main.js:167,504,623,650`, `ui-cyclone.js:254`, `station.js:10` |
| 푸시 알림 클릭 URL: 서버가 주는 `d.url`(없으면 `./`) | sw | `prototype/sw.js:206`, `:213` |
| 결제 복귀: `/pay-return.html?r=ok|fail` | 서버 | `supabase/functions/checkout/index.ts:141-142` |
| 공유: v2 는 `navigator.clipboard.writeText(url)` 후 `navigator.share` | v2 | `prototype/v2-three/js/main.js:6827-6834` |

---

## 3. 로그인 · 결제 · 등급 잠금

### 3-1. 로그인 (`prototype/js/auth.js`, 368줄)
- 백엔드: Supabase Auth(도쿄 프로젝트 — `docs/HANDOVER.md` §7). 클라이언트는 jsDelivr ESM 동적 import(`auth.js:38`). 키는 `config.local.js`(gitignore) — 없으면 게스트 모드(:31-36). 템플릿 `prototype/js/config.local.example.js`(키 이름: SUPABASE_URL·ANON_KEY :14-15, CHECKOUT_URL :86, MONETIZATION_MODE :91, SALES_OPEN :92, VAPID_PUBLIC_KEY :121, TERMS/PRIVACY/LEGAL_VERSION :125-127).
- 제공자: **Google·Apple 만**(:12). Kakao ❌ · 이메일/비밀번호 ❌ · 전화 ❌. 소유자 이메일 하드코딩(:13 — 값은 여기 옮기지 않음).
- 흐름: `signInWithOAuth({provider, options:{redirectTo: location.href}})` 전체 페이지 리다이렉트(:82-93), 세션 `persistSession`·`autoRefreshToken`·`detectSessionInUrl`(:41) → 돌아온 URL 에서 세션을 읽음. 중복 init 가드 사고 기록(:24-30).
- 로그인 뒤: `claim_founding`(창립 500 자격, :135), `claim_member_invite`, `profiles` 조회.
- 동의 기록 `saveConsent`(:155~, 위치·이용행태 선택 동의 포함), 계정 삭제 `deleteAccount → rpc('delete_own_account')`(:194-199, 주석에 스토어 요건 명시), 내 데이터 내려받기(:202~).
- 패스키 `prototype/js/biometric.js`: WebAuthn 플랫폼 인증기로 "기기에 저장된 세션 잠금 해제" 수준, **서버 검증 없음**(:17-21).
- 로그인은 "필요해질 때만"(`requireLogin` :249~), 앱 켜자마자 요구하지 않음.
- WebView/TWA 적합성: F1 참조. Apple 로그인도 웹 리다이렉트. Supabase 리다이렉트 허용 목록은 운영 대시보드 설정(저장소에서 확인 불가).

### 3-2. 결제 (`prototype/js/billing.js`, 440줄 · `supabase/functions/*`)
- PG: **토스페이먼츠 v1 결제창**(`js.tosspayments.com/v1/payment` :323, 호출 :296-306). 카드정보는 토스 화면에서만.
- 서버 주문: `CONFIG.CHECKOUT_URL`(Supabase Edge Function `checkout`)에 **planId 만** POST(:279-294). 금액은 서버 `price_for()`가 DB 에서 결정 — 창립 멤버 50% 는 서버에서(`checkout/index.ts:92-101`, 약관 제8조 7항 `terms.ko.md:109-114`). 승인 `payment-confirm`(토스 confirm API, 금액 대조 :86-119), 환불 `payment-refund`, 만료 `supabase/expiry-cron.sql`.
- 어댑터 셋(:261-310): `apple`(`window.webkit.messageHandlers.iap`), `google`(`window.AndroidBilling.purchase`), `web`(토스). 앞 둘은 **네이티브 래퍼가 심어 줄 브리지를 가정**할 뿐 구현 없음.
- 상품(화면 표시값, 정본은 서버 `plans` 표): EXPLORER 월 ₩9,900 / 연 ₩99,000(:42-43), PRO(id `intelligence`) 월 ₩29,000 / 연 ₩290,000(:52-53). USD 없음(null).
- 구독 모델: 약관상 **자동 갱신 없는 기간 이용권**(F3). Play 구독 상품과 성격이 다름.
- 판매 잠금: F4 의 네 겹.
- 과거 조사(문서, 코드 아님): Play 는 TWA 에서 Digital Goods API + Payment Request, Billing Library 7, 수수료 15%(`docs/research-2026-07.md:678`); Apple 3.1.3(b) 웹 결제 구독 앱 사용 허용(`:665`); "웹 결제 주력 + 앱 IAP 병행"(`docs/master-plan-2026.md:258`).

### 3-3. 등급 사다리·잠금 (`prototype/js/access-mode.js`, 121줄)
- 등급: `free / explorer / intelligence(화면 이름 PRO)`, 레거시 `paid`=explorer, 모르는 값은 free(:28-47). 정본 `docs/PRODUCT-STRUCTURE-AND-TIERS-2026-09-14.md`.
- 판정 `decideCapabilityAccess`: FREE_OPEN 이면 전부 허용(`FREE_OPEN_UNTIL_PAID_LAUNCH`), 아니면 `tierAtLeast`(:70-85). 잠금 문구 `lockExplanation`(WHAT·WHY·ADDS·UPGRADE, :94-121).
- v2 사용처: `prototype/v2-three/js/intel-strip.js:17,68,121`, `main.js:24, 3135, 5230, 5243-5246`. 요금 모드는 `window.EARTHUS_CONFIG.MONETIZATION_MODE` 없으면 `'FREE_OPEN'`(`main.js:5035-5036`) — v2 에는 config 주입 코드가 없음(grep 결과 이 한 줄뿐).
- 등급 전달: F5(`earthus.tier` localStorage). v2 번들은 `access-mode.js` 를 `js/shared/` 로 복사해 씀(`tools/build-v2-bundle.sh:43-45`).

---

## 4. 기기 기능 사용 현황

| 기능 | v1 | v2 | 비고 |
|---|---|---|---|
| 위치 | `js/mylocation.js:47-50` (getCurrentPosition) | `v2-three/js/main.js:3764-3765`, `:4877-4878`, `:5285-5286` | 개인정보방침: 선택 동의, 서버 저장 안 함, BigDataCloud 로 도시명 조회(`legal/privacy.ko.md:57-72`). 위치기반서비스 신고 **확인 필요**(`legal/README.md:12-38`) |
| 웹푸시 | `js/push.js`(VAPID :71·:111, `push_subscriptions` 표 :128·:141), `sw.js:182-241`, 서버 `supabase/functions/push-tick`, `supabase/push.sql` | 없음 | push.js 머리말: 배경 위치 없음·iOS 는 홈 화면 추가 시만·도착 시각 보장 못 함(:3-15). (플랫폼) TWA=크롬이라 웹푸시 동작, 순수 WebView 는 불가 |
| 로컬 알림 | `js/alarms.js:54`, `:102` (`new Notification`) | — | |
| 진동 | SW 알림 옵션만(`sw.js:205`) | — | `navigator.vibrate` 호출 없음 |
| 카메라·방향 센서 | `js/space/sky-ar.js:556`(DeviceOrientation 권한), `:567`(getUserMedia), `js/aetherus-device-qa.js` | — | AETHERUS 하늘 AR |
| 파일 저장 | 여러 곳 `toDataURL`/`toBlob`(js/main.js, studio.js, research.js 등) | `captureImage` → `a.download` + data URL JPEG(`main.js:6841-6867`), 토스트 "다운로드 폴더 확인"(:5867) | (플랫폼) 순수 WebView 는 DownloadListener 없으면 저장 안 됨 |
| 클립보드·공유 | ask/panel, research, studio, ui-cyclone | `main.js:6202`, `:6827-6834`, `measure.js` | |
| 전체 화면 | `js/space/aetherus-dashboard.js:961` | — | |
| 화면 방향 | sky-ar 만 | — | manifest `orientation:any` |
| IndexedDB | space/observation-session·media, studio | — | |
| 새 창 | `js/main.js:713, 794-795` (`window.open` admin·intro·verify) | — | |
| WebGL | Cesium, `contextOptions webgl{alpha:false, antialias:true}`, `resolutionScale=1`, requestRenderMode(`js/viewer.js:15, 20-40`) | three r184 `WebGLRenderer({antialias:true})`(`main.js:2393`), 컨텍스트 손실 안내(:2397-2413), 픽셀비 ≤2, 발열 거버너가 0.5~1.0 배로 낮춤(:2421-2433) | HANDOVER §5: 무한 애니메이션 금지·`clampToGround` 금지 |

---

## 5. 브랜드 자산 (앱 아이콘·확장 아이콘·스토어용)

| 파일 | 형식·크기 | 쓸 수 있는 곳(사실 기준) |
|---|---|---|
| `prototype/logo/earthus-appicon.svg` = `prototype/icon.svg` = `favicon.svg` = `v2-three/assets/brand/earthus-appicon.svg` = v5 정본 | SVG 120×120, #0A0A0A 둥근 사각(rx27) + 흰 ∧(선 6.07) | 크롬 확장 16/32/48/128 래스터화 원본. **정본 그대로 크기만 바꾸는 것**(새 로고 아님) |
| `prototype/logo/earthus-monogram-{white,black}.svg` (v5 에도 있음) | 배경 없는 ∧ 단독(선 6.60) | 안드로이드 adaptive icon **전경층**·Android 13 단색(themed) 아이콘 재료 |
| `prototype/favicon.ico` | 6장: 16·32·48·64·128·256 (PNG 내장) | 확장 아이콘 크기가 이미 래스터로 들어 있음(추출 가능) |
| `icon-192.png` / `icon-512.png` / `apple-touch-icon.png` | 192 / 512 / 180 | 현 manifest. Play 고해상 아이콘 512×512 로는 크기만 맞음(투명 모서리 — §1-1) |
| `logo-lockup.png` | 900×239 | 가로 로고 |
| lockup·stacked·wordmark SVG (black/white) | `prototype/logo/`, `v2-three/assets/brand/` | 스토어 그래픽 문구 |
| `og.png`, `og-latest.png` | 1200×630 | ⚠️ `og-latest.png` 생성기는 저장소에 없음(grep 결과 발표자료 스크립트 2건뿐) — Last-Modified 2026-09-23, 정적 파일로 보임 |
| `v2-three/assets/brand/og-earthus-v2.jpg` | 1200×630 | v2 공유 이미지 |
| `prototype/shots/*.jpg|webp` (globe·cyclone·alerts·news·sst·wildfire) | 1600×1000 가로 | 소개 페이지용 화면 캡처 |
| v5 원본 폴더 `D:\## APP\Earthus v2_DOC\브랜드 시트\v5\` | SVG 9종 + 브랜드시트 PNG | 저장소 밖 정본 |
| 없음 ❌ | adaptive icon 432px 전경/배경층, Play 기능 그래픽 1024×500, 세로 폰 스크린샷, 크롬 웹스토어 프로모 타일(440×280 등) | |
| ⚠️ | 16px 에서 선 두께 6.07/120 → 약 0.8px — 작은 크기 가독성 확인 필요(추정) | |

---

## 6. 기존 문서의 앱·스토어·확장 관련 결정

- `docs/master-plan-2026.md:69` — "Web App Manifest + 서비스워커 (§6 의 Play TWA 전제조건)" ✅ 완료 체크.
- `docs/master-plan-2026.md:244-258` (§6 2단계 — 앱스토어·차량): Play = **PWA→TWA(Bubblewrap)**, 개인 계정 '테스터 12명×14일' 요건·**조직 계정 면제** → 계정 유형이 크리티컬 패스. 순서 ① PWA → ② Play TWA(조직 계정) → ③ iOS Capacitor(푸시+위젯, 4.2 방어) → ④ Pleos/AAOS. 구독은 **웹 결제 주력 + 앱 IAP 병행**.
- `docs/master-plan-2026.md:420` — "v2(가을) 로그인·구독 실결제(웹) · PWA→Play TWA→iOS".
- `docs/research-2026-07.md:645-745` — 조사 원문: Play TWA 요건(manifest, **assetlinks.json**, Custom Tab 강등), Digital Goods API/Billing Library 7, $25, 12명×14일; iOS 4.2·3.1.1·3.1.3(b); PWA vs 스토어 비교표(:712-722); 1~3주차 할 일(:729-745 — Play 계정·assetlinks·Bubblewrap·스토어 등록정보).
- `docs/research-naming.md:689-~700` — Play 앱 제목 30자, 사칭 정책.
- `docs/earthus-v2/AUDIT/EARTHUS_1.0_CURRENT_SYSTEM_AUDIT.md:98` — "Capacitor/Cordova/React Native/Electron/Tauri/iOS/Android project 없음"(NOT_FOUND).
- `prototype/legal/README.md:41-55` — 스토어 심사 요건 표: 계정 삭제 ✅, Apple 로그인 ✅, 처리방침 URL "URL 게시 필요", Play 데이터 안전 섹션 ⬜, 구독 고지 ⬜. `:84-95` 해외 배포 시 GDPR/CCPA — "한국(+일본)으로 제한해 시작" 권고. `:99~` 오픈소스·데이터 출처 고지 화면 필요.
- **크롬 확장 / 새 탭**: `docs/`, 루트 `*.md` 어디에도 없음(grep: "chrome extension·크롬 확장·크롬 플러그인·chrome web store·새 탭·newtab" — '새 탭'은 공유 URL 시험 문맥 2건뿐: `docs/AETHERUS-PR-03…:320`, `docs/EARTHUS-AETHERUS-DEV-SPEC-2026-08-16.md:587`).
- **"v1+v2 한 안드로이드 앱"**: 기존 문서에 없음. 기존 계획은 사이트(=v1 기준 PWA) 하나를 TWA 로 싸는 것.

---

## 7. 가벼운 새 탭이 쓸 수 있는 공개 자료 (지구 앱 전체를 싣지 않고)

기준 출처: 운영은 같은 출처 `https://earthus.net/<경로>`(CloudFront 가 오하이오 `earthus-cache-kr` 를 읽음), 개발은 `https://earthus-cache-kr.s3.us-east-2.amazonaws.com` (`prototype/js/config.js:31-33`, `prototype/v2-three/js/main.js:1438-1449`).
크기 = `curl --compressed` 전송 바이트(br 적용분은 압축 후) / 괄호는 원문 크기. LM = Last-Modified(실측 06:0x UTC 기준). ACAO = `Origin: chrome-extension://…` 로 보냈을 때 받은 CORS 헤더.

### 7-1. 그림(지구 위에 얹는 층)
| 경로 | 크기 | Cache-Control | 시각·출처 메타 | 주기 |
|---|---|---|---|---|
| `clouds/meta.json` | 902 B | max-age=300 | ✅ `time`, `source`(GMGSI 파일명), `credit:"NOAA NESDIS GMGSI"`, variants(sha256·bytes) | 매시(LM 05:45, time 05:00Z) |
| `clouds/global-2048.webp` | 1.5 MB | max-age=300 | meta.json 참조 | 〃 |
| `clouds/global.webp` (3072×1844) | 3.0 MB | max-age=300 | 〃 | 〃 |
| ⚠️ 위 두 장은 `format:"la8"`(밝기+알파) **구름 층**이다 — 지구 그림 아님. 바탕 지구가 따로 필요 | | | | |
| `v2/assets/physical-earth/ne2-base-2048.jpg` | 377 KB | — | 정적(Natural Earth II, `ne2-base.receipt.json`) | 고정 |
| `clouds/gk2a/meta.json` | 981 B | max-age=120 | ✅ `time`, `source`(천리안2A·기상청/NOAA), 채널별 `at`·bbox·타일 템플릿 | 10분(`aws/schedules.sh:34`) · ACAO 없음 |
| `clouds/gfs-fc/manifest.json` | 6 KB | max-age=300 | ✅ `source`(NOAA NCEP GFS 0.50°), `truthClass:"MODEL_SIGNAL"`, `run`, `generatedAt`, 41 프레임(0~120h, 3h), 프레임별 `valid`·파일(c/w/p/t…png, 기온 프레임 ≈80 KB) | GFS 실행마다 · ACAO 없음 |
| `wind/kma-radar.json` + `wind/kma-radar.png` | 933 B + 43 KB | max-age=180 | ✅ `generated`, `requestedKst`, `source`(기상청 레이더 HSR), `license`(공공누리1) | 5분(`schedules.sh:81`) |
| `solar/meta.json` + `solar/latest.jpg` | 179 B + 143 KB | 600 / 900 | ✅ `generated`, `source`(NASA SDO AIA 193Å · NOAA SWPC) | ⚠️ latest.jpg LM 전날 13:11 |

### 7-2. 사건·특보 (새 탭 한 줄 요약감)
| 경로 | 크기(원문) | Cache-Control | 시각·출처 메타 | 주기 |
|---|---|---|---|---|
| `events/kma-warn.json` | 852 B (1.1 KB) | 300 | ✅ `generated`, `observedKst`, `source`, `license`, `freshnessPolicy`, `activeCount` | 15분(`schedules.sh:87`) · ACAO 없음 |
| `events/typhoon-official.json` | 1.9 KB (7.5 KB) | no-cache | ✅ `generated`, `source`(KMA·JMA·NHC), `archive` | 매시 25분(`:86`) |
| `events/gdacs-tc.json` | 1.0 KB (4.4 KB) | no-cache | ✅ `generated`, `source`, `license`(CC-BY-4.0) | 15분(`aws/configure-gdacs-tc-schedule.sh:9`) |
| `events/typhoon-ecmwf.json` | 17 KB (158 KB) | 1800 | ✅ `generated`, `run`, `model`, `source`, `license`, `sourceUrl` | ECMWF 실행 |
| `events/cyclone-tracks.json` | 1.4 KB | 600 | ✅ `generated`, `source`, `license`, `termsUrl` | — |
| `events/tsunami-intl.json` | 553 B | 120 | ✅ `generated`, `source`(NOAA PTWC·NTWC) | — · ACAO 없음 |
| `ocean/tsunami-eta.json` | 521 B | no-cache | ⚠️ `generated` 만(`badge`, `rule`) — 계산값(SIMULATION_ONLY) | 15분(`aws/configure-tsunami-eta-schedule.sh:9`) |
| `events/quake-asia.json` | 2.8 KB (19 KB) | 60 | ✅ `generated`, `sources[]`(KMA·JMA, 라이선스) | 10분(`:84`) · ACAO 없음 |
| `ocean/earthquake-intel.json` | 5.2 KB (80 KB) | 900 | ⚠️ `generated` 만(패킷 안에 출처는 확인 안 함) | — · ACAO 없음 |
| `events/kma-lightning.json` | 888 B | 120 | ✅ `generated`, `observedKst`, `windowMinutes`, `source`, `license` | 5분(`:80`) |
| `events/wildfire.json` | 49 KB (371 KB) | 900 | ✅ `generated`, `source`(NASA FIRMS VIIRS), `credit` | 3시간(2026-09-18 절감 — memory aws-cost-audit) |
| `events/world-alerts.json` | 9 KB (117 KB) | 300 | ✅ `generated`, `source`(NWS), `license` | — · ACAO 없음 |
| `events/jma-warn.json` | 2.1 KB (13.6 KB) | 300 | ✅ `generated`, `generatedJst`, `source`, `live` 플래그 | — |
| `events/launches.json` | 8 KB (37 KB) | no-cache | ✅ `generated`, `source`(Launch Library 2), `license` | 15분(`aws/configure-launch-feed-schedule.sh:9`) |
| `events/crustal.json` | 33 KB | 86400 | (미확인) | 하루 1회(`:46`) |

### 7-3. 격자·관측 (숫자 라벨감)
| 경로 | 크기(원문) | Cache-Control | 시각·출처 메타 | 주기 |
|---|---|---|---|---|
| `wind/global.json` | 41 KB (155 KB) | 1800 | ✅ `time`, `source:"Open-Meteo (GFS/ECMWF)"` — u·v·t·rh·mslp·rain·cld… | 3시간(절감) |
| `wind/air.json` | 18 KB (74 KB) | 1800 | ✅ `time`, `source:"Open-Meteo Air Quality (CAMS)"` | 3시간(절감) |
| `ocean/marine.json` | 19 KB (88 KB) | 1800 | ✅ `time`, `source:"Open-Meteo Marine"` | 3시간(절감) |
| ⚠️ 위 셋은 **무료 api.open-meteo.com(비상업)** 경유 — 판매 전 라이선스 스위치 대상(`billing.js:382-391` 주석) | | | | |
| `ocean/sst-global.json` | 71 KB (324 KB) | 1800 | ✅ `time`, `observed`, `issuedAt`, `source`(NOAA OISST v2.1), `sourceUrl`, `attribution` | 일 1회(관측 이틀 전) |
| `wind/kma-aws.json` | 8 KB (44 KB) | 600 | ✅ `generated`, `observedKst`, `source`, `license` | 매시 25분(`:89`) · ACAO 없음 |
| `wind/gts-global.json` | 271 KB (1.25 MB) | 1800 | ✅ `generated`, `observedUtc`, `source`, `license` | 매시 35분(`:90`) · ACAO 없음 |
| `wind/kma-fcst.json` | 42 KB (650 KB) | 900 | ✅ `generated`, `observedKst`, `source`(동네예보), `license` | 매시 15분(`:78`) |
| `ocean/buoys.json` | 73 KB (662 KB) | 1800 | ✅ `generated`, `source`(NOAA NDBC·OSMC) | — |
| `ocean/kma-buoy.json` | 6.7 KB (41 KB) | 600 | ✅ `generated`, `source`, `license` | 30분(`:88`) |
| `wind/health.json` | 4.8 KB (56 KB) | no-cache | ⚠️ `generated` 만 — 자료별 신선도 표(원천 상태 판정용) | — |
| `ocean/lab-reports.json` | 121 KB | 300 | (미확인) | 15분(HANDOVER §6) |
| `celestrak/catalog.json.gz` | 1.6 MB | 3600 | schemaVersion 2 (HANDOVER §6) | 하루 1회 · ACAO 없음 |

- 404/403 로 확인된 추정 경로: `air/air.json` 403, `quakes/quakes.bin` 403(루트엔 없음 — v2 번들 안 `/v2/quakes/` 쪽으로 보임).
- 운영 헤더: `/` 와 `/v2/` 에 **CSP·X-Frame-Options·HSTS 헤더 없음**(실측) → earthus.net 을 다른 페이지가 iframe 으로 담는 것이 막혀 있지 않음.
- robots: 자료 경로 `/wind/ /events/ /ocean/ /solar/ /clouds/ /celestrak/ /data/` 색인 금지, `/data/` 는 "우리가 만든 자료 — 수집·복제 대상 아님"(`prototype/robots.txt`, `prototype/llms.txt`, 약관 제11조). 자사 확장이 읽는 것은 해당 없음(해석).

---

## 8. 법적 페이지 (스토어 등록용)

| 항목 | 상태 | 근거 |
|---|---|---|
| 개인정보처리방침 | ⚠️ `https://earthus.net/legal/privacy.ko.md` 200, **`Content-Type: text/markdown`**(HTML 페이지 아님). 앱 안에서는 `legalView`(`prototype/js/ui-account.js:108`)가 그려 보여줌. 시행 2026-08-21. 주소·전화·통신판매업 신고번호 **자리표시자 남음**(`privacy.ko.md` 머리 표) | curl 실측, `legal/privacy.ko.md:1-20` |
| 이용약관 | ⚠️ `legal/terms.ko.md` 200(같은 형식). 제8조 결제=웹 카드·비갱신 이용권(F3), 7항 창립 멤버 50% | `terms.ko.md:94-114` |
| 데이터 라이선스 | `legal/data-license.ko.md` | index.html:250-251 |
| 영어판 | ❌ 없음(모두 `.ko.md`) | `ls prototype/legal` |
| 계정 삭제 | ✅ 앱 안(설정→계정→계정 삭제, `auth.js:194-199`). ❌ **웹에서 바로 여는 삭제 안내 URL 없음**(Play 요건은 플랫폼 사실) | `legal/README.md:45` |
| 위치기반서비스사업 신고 | ⬜ 확인 필요 | `legal/README.md:11-38`, `:63` |
| Play 데이터 안전 섹션 | ⬜ 미작성 | `legal/README.md:49` |
| 사업자 정보 표시 | `config.local.js` 의 BUSINESS 항목(값 미확인) | `legal/README.md:71-78` |
| 오픈소스 고지 화면 | 목록만 문서에 있음(Cesium Apache-2.0, satellite.js MIT, Supabase JS MIT). three.js 라이선스 파일은 번들에 있음(`v2-deploy/vendor/three-r184-LICENSE.txt`) | `legal/README.md:97-107` |
| 사이트맵 공개 페이지 | `/`, `/intro.html`, `/provenance.html`, `/developers.html` | `prototype/sitemap.xml` |

---

## 9. 아직 없는 것 목록 (조사 결과만)

1. `/.well-known/assetlinks.json` (운영 403, 저장소 없음).
2. 안드로이드 프로젝트(TWA/Bubblewrap·Capacitor·WebView 어느 것도) — `EARTHUS_1.0_CURRENT_SYSTEM_AUDIT.md:98`.
3. v2 manifest·SW·apple-touch-icon.
4. maskable/adaptive 전용 아이콘, 16~128 PNG 개별 파일(ICO 안에만 있음), Play 기능 그래픽, 세로 스크린샷.
5. 결제 브리지 구현(`AndroidBilling`·Digital Goods) 및 Play 상품 — 어댑터 자리만 있음.
6. 크롬 확장 관련 코드·문서 전무.
7. HTML 형태의 개인정보처리방침·약관 URL, 영어판, 웹 계정 삭제 안내.
8. v2 등급의 서버 판정(현재 localStorage 신뢰).
