# 안드로이드 앱 조사 — EARTHUS(v1 무료) + EARTHUS Intelligence(v2 유료) 한 앱

조사일 2026-09-24 · 읽기 전용 조사 · 코드 변경 없음 · **PD 승인 전 구현 착수 금지**
표기: 각 주장 뒤 `[읽음 2026-09-24]` = 그날 공식 페이지를 직접 열어 확인. **UNVERIFIED** = 공식 출처로 확인 못 함.

---

## 0. 화면에서 무엇이 바뀌나 (먼저)

- 폰 홈 화면에 **EARTHUS 아이콘 하나**가 생긴다. 누르면 주소창 없는 전체 화면으로 **지금의 v1 지구(earthus.net/)** 가 뜬다.
- 앱 안에서 v1 → v2(`/v2/`) 로 넘어가는 **지금 웹의 유도 경로가 그대로** 이어진다(같은 출처 `earthus.net` 이라 한 앱·한 인증서 연결로 둘 다 덮인다).
- v2 유료 결제 버튼을 누르면 **Google Play 결제 시트**(또는 한국 사용자에게는 Play/토스 선택 화면)가 뜬다 — 웹의 토스 결제창이 앱 안에서 그대로 뜨면 Play 정책 위반이므로 이 부분만 앱에서 달라진다.
- 로그인(Google·Apple)을 누르면 `accounts.google.com`·`appleid.apple.com`·Supabase 주소로 잠깐 나가는 동안 **위쪽에 브라우저 툴바(주소 표시)가 달린 화면**이 보였다가, 돌아오면 다시 전체 화면이 된다(TWA는 검증된 출처 밖 페이지를 Custom Tab 모양으로 보여 줌 — 동작 원리는 [TWA 개요]의 "verified origin" 개념, 화면 모양은 실기기 확인).
- 웹을 배포하면 **앱 화면도 바로 바뀐다**(TWA 기준). 스토어 재심사는 네이티브 껍데기를 바꿀 때만.
- 크롬 확장(새 탭 = 지금 지구)은 이 문서 범위 밖(별도 조사).

---

## 1. 결론 (추천)

**추천: Trusted Web Activity(TWA) — Bubblewrap CLI로 생성 + 네이티브 추가 3가지.**

이유 (EARTHUS 조건에 비춘 것):
1. **렌더링 = 사용자의 Chrome 그 자체.** WebView는 "multi-process 모드에서도 별도 GPU 프로세스를 쓰지 않는다" — Cesium+Three.js 6~8 MB WebGL 앱에서 GPU 문제가 앱 프로세스로 번질 여지가 WebView 쪽이 크다. [chromium android_webview/docs/web-platform-compatibility.md, 읽음 2026-09-24]
2. **웹 배포 = 앱 갱신.** 빌드 단계 없는 지금 배포 방식(S3+CloudFront, `deploy-v1.sh`/`deploy-v2-three.sh`)을 그대로 쓴다. Capacitor의 원격 URL 로드(`server.url`)는 공식 문서가 "not intended for use in production" 이라 명시 → 우리 구조(원격 웹이 정본)와 안 맞는다. [capacitorjs.com/docs/config, v8, 읽음 2026-09-24]
3. **Google/Apple 로그인이 그대로 된다.** 현 로그인은 Supabase `signInWithOAuth`(google·apple) 리다이렉트(`prototype/js/auth.js` 12·82행). Google은 embedded WebView의 OAuth를 `disallowed_useragent` 로 막는다(2023-07-24부터 전면). TWA는 WebView가 아니라 Chrome이므로 해당 없음. [developers.googleblog.com "Upcoming security changes to Google's OAuth 2.0 authorization endpoint in embedded webviews", 읽음 2026-09-24] · Android 공식 가이드도 제3자 로그인은 Custom Tabs 권장(TWA는 Custom Tabs 프로토콜 위에 만든 것 [TWA 개요]). [developer.android.com/develop/ui/views/layout/webapps, 최종수정 2026-09-22, 읽음 2026-09-24]
4. **Web Push·위치·공유·다운로드 코드가 그대로 산다.** 코드 실측: `navigator.share` 8곳, `geolocation.getCurrentPosition` 5곳, `a.download` 8곳, `pushManager` 4곳, `Notification.requestPermission` 2곳(`prototype/js`, `prototype/v2-three/js`). WebView는 `navigator.share` 미지원(비공식 포럼 보고 — 공식 표 없음, **UNVERIFIED**), Web Push는 WebView에서 동작하지 않아 FCM 네이티브 재구현이 필요(**UNVERIFIED** — 공식 호환표 못 찾음). TWA는 Chrome 기능 + 알림·위치 위임(delegation)으로 해결.
5. **Play 결제를 웹 코드에서 부를 수 있다.** Digital Goods API + Payment Request API는 "Chrome에서 TWA로 실행될 때만" 지원. [developer.chrome.com/docs/android/trusted-web-activity/receive-payments-play-billing, 읽음 2026-09-24]

**TWA에 붙여야 할 네이티브 추가 3가지** (웹만으로 안 되는 것):
- (a) **Play Billing 확장** — Bubblewrap `features.playBilling` (`com.google.androidbrowserhelper:billing`). **1.2.0 이 Google Maven에 게시됨(2026-07-30)이고 POM이 `com.android.billingclient:billing:8.3.0` 을 의존** — 2026-08-31부터 요구되는 PBL 8+ 충족. [dl.google.com/android/maven2/.../billing/1.2.0/billing-1.2.0.pom, 읽음 2026-09-24; developer.android.com/google/play/billing/deprecation-faq, 최종수정 2026-09-09]
- (b) **한국 대체결제(토스)를 Play와 나란히 열려면 네이티브 코드 필요** — 대체결제 API(`enableBillingProgram`, `launchExternalLink` 등 PBL 8.2+)는 Billing Library 네이티브 호출이며 **Digital Goods API에는 이 표면이 없다**(Digital Goods API 문서에 대체결제 언급 없음 — "없다"는 부재 확인이므로 **UNVERIFIED-부재**). → 래퍼 액티비티에 Kotlin 코드 + 웹↔네이티브 전달(postMessage/URL 인텐트) 필요.
- (c) **홈 화면 위젯(선택)** — TWA에는 위젯이 없다. 원하면 네이티브 `AppWidgetProvider` 가 같은 S3 JSON(출처·시각 포함)을 읽어 그려야 한다(TWA가 웹 저장소를 못 읽음: "Host app cannot directly access web content, cookies, or localStorage" [developer.chrome.com/docs/android/trusted-web-activity/ 개요, 읽음 2026-09-24]).

---

## 2. 네 가지 방식 비교

| 항목 | (a) TWA (Bubblewrap/PWABuilder) | (b) Capacitor | (c) 순수 WebView | (d) 네이티브 재작성 |
|---|---|---|---|---|
| 렌더 엔진 | 사용자 기본 TWA 지원 브라우저(대개 Chrome). 별도 GPU 프로세스 | Android System WebView | Android System WebView (별도 GPU 프로세스 없음) | Kotlin: OpenGL/Vulkan 직접, Flutter: 자체 엔진. Cesium·Three.js 재사용 불가 |
| WebGL 성능·GPU 메모리 | 브라우저와 동일 | 대체로 비슷하나 GPU 프로세스 격리 없음 | 같음 | 최상 가능성, 대신 전부 새로 |
| 갱신 모델 | **웹 배포 즉시 반영** | 번들 내장이 정석 → 스토어 갱신 필요(원격 URL은 운영 비권장) | 원격 URL 로드 가능(정책 위험↑) | 스토어 갱신만 |
| 오프라인 | 기존 `sw.js`(network-first, 네트워크 죽으면 캐시) 그대로. TWA 품질 기준에 오프라인·404/5xx 처리 포함 [developer.chrome.com/docs/android/trusted-web-activity/whats-new] | 번들 내장이면 셸은 오프라인 | 직접 구현 | 직접 구현 |
| Google OAuth | **됨**(Chrome) | WebView 안에선 차단 → 시스템 브라우저/Custom Tab + 딥링크 재작성 | 차단 → 같은 재작성 | 네이티브 Credential Manager |
| 위치 | 위치 위임(`features.locationDelegation`) | 플러그인 | 권한 브리지 직접 | 네이티브 |
| 알림(Web Push) | 알림 위임(`enableNotifications`) + Android 13 `POST_NOTIFICATIONS` | FCM 플러그인으로 재구현 | 재구현 | 재구현 |
| 공유·다운로드 | Chrome 그대로 | 플러그인 | `DownloadListener` 등 직접, blob 다운로드 까다로움 | 네이티브 |
| Play 결제 | Digital Goods API(웹 코드) | 네이티브 플러그인(RevenueCat 등) | 네이티브 브리지 | 네이티브 |
| Chrome 없을 때 | `fallbackType: customtabs \| webview` [Bubblewrap README] | 해당 없음 | 해당 없음 | 해당 없음 |
| Play 스팸/최소기능 위험 | 자사 사이트·실제 PWA → 낮음(아래 §2-1) | 낮음~중 | 중(단순 래퍼로 보이기 쉬움) | 낮음 |
| 공수(추정) | 셸 1~2주 + 결제·위임 2~4주 | 4~8주 + 인증·결제 재작성 | 3~6주 + 재작성 | 수개월(지구 렌더러 재작성) |

공수는 **추정**이다(근거 문서 없음).

### 2-1. Play 정책 — 웹뷰 래퍼 위험
- 스팸 정책: "provide a webview of a website **without permission** from the website owner" 인 앱 금지. 우리는 사이트 소유자이므로 이 조항 자체는 해당 없음. [support.google.com/googleplay/android-developer/answer/9899034, 읽음 2026-09-24]
- 최소 기능: "stable, responsive, and engaging user experience" 요구, 기본 효용 없는 앱 불허. [answer/9898783 — 검색 결과 요지, 본문 미열람 → 문구 **UNVERIFIED**]
- 판단: 3D 지구·오프라인 셸·알림·위치·결제를 갖춘 실제 PWA의 TWA는 "웹사이트 복사본"이 아니다. 다만 **심사 통과를 보장하는 공식 문구는 없다**(UNVERIFIED). 대비: 스토어 스크린샷·설명에 앱 고유 기능(알림·위치 기반 현재 지구·오프라인 셸) 명시, 심사용 로그인 정보 제출.

### 2-2. TWA 특유의 함정 (한국 시장)
- **삼성 인터넷이 기본 브라우저인 갤럭시.** TWA 제공자 선택은 "사용자 기본 브라우저 우선"이며 하드코딩된 Chrome 우선 목록이 없다. [android-browser-helper `TwaProviderPicker.java`, 읽음 2026-09-24] 삼성 인터넷은 TWA "basic support only"(알림 위임 표시 없음). [android-browser-helper docs/trusted-web-activity-browser-support.md, 읽음 2026-09-24] Digital Goods API는 Chrome만 명시. → **삼성 인터넷 기본 폰에서 알림·Play 결제가 안 될 수 있다.** 실제 기기 시험 필수(UNVERIFIED-실동작). 대응 후보: 결제는 네이티브 Billing(위 1-(b))으로 옮기면 브라우저와 무관해진다.
- **Asset Links 검증 실패 시** 주소창 달린 Custom Tab으로 떨어진다. [developer.android.com/develop/ui/views/layout/webapps/guide-trusted-web-activities-version2, 최종수정 2026-02-26]
- 위치 위임: 정밀/대략 위치 선택이 무시되는 보고, 스토어 설치본에서만 실패하는 보고가 있음(깃허브 이슈 — 비공식, **UNVERIFIED**).

---

## 3. Google Play 요건 (2026)

| 항목 | 내용 | 출처 |
|---|---|---|
| 계정 종류 | 개인 / 조직. 조직은 **D-U-N-S 번호** 필요(발급 "최대 30일"), 법인명·주소가 결제 프로필·D-U-N-S와 일치해야 함 | answer/13628312 [읽음] |
| 등록비 | US$25 1회 | 검색 요지만 — **UNVERIFIED** |
| 기기 인증 | 신규 **개인** 계정은 Play Console 앱으로 **안드로이드 10+ 실기기** 인증해야 출시 가능 | answer/14316361 [읽음] |
| 비공개 테스트 | **2023-11-13 이후 만든 개인 계정**: 앱마다 **12명 이상, 14일 연속 opt-in** 비공개 테스트 후 프로덕션 신청. 심사 "7일 이내(더 걸릴 수 있음)". 14일 전 이탈자는 불산입. 조직 계정은 면제 | answer/14151465 [읽음] (20→12 변경은 2024-12, 제3자 출처) |
| **권장** | 사업자(조직) 계정으로 개설 → 12명·14일 면제, 판매자 표시도 법인으로. D-U-N-S 30일 리드타임이 병목 | 위 두 문서 조합 |
| 타깃 API | **2026-08-31부터 신규 앱·업데이트는 Android 16(API 36) 이상**. 연장 신청 시 2026-11-01까지. 기존 앱은 API 35 미만이면 신규 사용자 노출 제한 | answer/11926878 [읽음] |
| Bubblewrap 템플릿 | 템플릿 `compileSdkVersion 36`, `targetSdkVersion 36` (Bubblewrap CLI 최신 1.25.0, npm) | github bubblewrap template build.gradle, registry.npmjs.org [읽음] |
| Billing Library | **2026-08-31부터 PBL 8 이상**(연장 11-01). v8은 2027-08-31까지 | deprecation-faq [읽음, 최종수정 2026-09-09] |
| 앱 서명 | 신규 앱은 Play App Signing 자동 가입(Google 생성 키, "quantum-ready, hybrid signing"). 개발자는 **업로드 키**만 보관(RSA 2048+), 분실 시 재설정 가능. 서명 키 SHA-256은 Console "Play app signing" 화면 | answer/9842756 [읽음] |
| 형식 | AAB. Bubblewrap `build` 가 APK·AAB 둘 다 생성 | Bubblewrap README [읽음] |
| Data safety | 비공개/공개/프로덕션 트랙 전부 필수(내부 테스트만 면제). **앱이 코드를 통제하는 웹뷰로 수집하는 데이터는 신고 대상** → TWA로 띄우는 우리 사이트의 수집(로그인 이메일, 위치, analytics_events 등)을 신고해야 한다(TWA를 명시한 문구는 없음 — 적용 해석) | answer/10787469 [읽음] |
| 개인정보처리방침 | 스토어 등록정보 **및 앱 안**에 링크 | answer/9859455 [읽음] |
| 앱 콘텐츠 신고 | 광고 여부, **로그인 필요 시 심사용 계정 정보**, 대상 연령, 콘텐츠 등급 설문(미등급은 삭제될 수 있음), 뉴스 앱 여부 등 | answer/9859455 [읽음] |
| 계정 삭제 | 계정 생성이 되는 앱은 **앱 안 삭제 경로 + 웹 삭제 링크** 둘 다 | answer/13327111 [읽음] |
| 스토어 그래픽 | 아이콘 512×512 32-bit PNG(알파) ≤1024KB · 피처 그래픽 1024×500 JPEG/24-bit PNG(알파 없음) · 스크린샷 최소 2장, 320~3840px, 추천 노출용 폰 4장 1080px(9:16 1080×1920 등), 7·10인치 태블릿 각 4장 | answer/9866151 [읽음] |
| 개발자 인증(사이드로딩) | 2026-09-30부터 브라질·인도네시아·싱가포르·태국 인증 기기에서 **인증 개발자 등록 앱만** 설치/갱신. 2027 전 세계 확대. Play 앱은 99% 이상 자동 등록 — Console 홈에서 등록 상태 확인 | android-developers.googleblog.com/2026/06/android-developer-verification.html [읽음] |

---

## 4. 결제 — 가장 중요

### 4-1. 기본 규칙
- Play 배포 앱에서 **구독 등 디지털 상품의 결제를 받거나 요구하면 Google Play 결제 필수.** 앱 안의 버튼·링크·웹뷰·메시지·가입 흐름으로 **다른 결제 수단으로 유도 금지**(국가별 프로그램 예외). [answer/9858738 Payments policy, 읽음 2026-09-24]
- ⇒ **지금 웹의 토스 결제창(`billing.js` 296–302행 `TossPayments.requestPayment`)이 TWA 안에서 그대로 뜨면 정책 위반.** 앱 안에서는 결제 경로를 분기해야 한다.
- ⚠️ **"앱 안인가" 판정을 결제 API 유무로 하면 안 된다.** `'getDigitalGoodsService' in window` 는 "Chrome TWA에서만" 참이다 [receive-payments-play-billing]. 삼성 인터넷이 기본인 갤럭시에서는 TWA가 삼성 인터넷으로 뜨고(§2-2) 이 값이 거짓 → 웹 코드가 "앱 밖"으로 오판해 **Play 배포 앱 안에서 토스 창을 띄운다 = 위반.**
  - 판정은 결제 API와 독립이어야 한다: Bubblewrap `startUrl` 에 표식 쿼리(예: `?src=twa`)를 붙이는 방식이 공식 문서에 있다 [developer.chrome.com/docs/android/trusted-web-activity/query-parameters, 읽음 2026-09-24]. 표식은 **`sessionStorage`** 에만 둔다 — TWA는 Chrome과 저장소를 공유하므로 `localStorage` 에 두면 일반 Chrome 탭의 웹 사용자까지 "앱 안"으로 오판된다(공유 저장소 해석 — 실기기 확인). 쿼리는 문서 권고대로 읽은 뒤 `history.replaceState` 로 지운다.
  - `document.referrer` 가 `android-app://<패키지>/` 로 온다는 널리 알려진 방법은 이번에 공식 문서에서 확인 못 함 → **UNVERIFIED**, 보조 신호로만.
  - 분기: **앱 안 → Digital Goods API 있으면 그것, 없으면 네이티브 Billing 브리지(§1-(b)), 어느 경우에도 토스 금지.** 둘 다 불가하면 "앱에서는 결제할 수 없습니다" 안내(링크 없이).
- `billing.js` 머리 주석(7–10행)도 이미 "안드로이드 → Google Play Billing"을 전제하고 있다.

### 4-2. 수수료 (한국은 두 시기로 나뉜다)
| 시기 | 한국 사용자 대상 | 출처 |
|---|---|---|
| **~2026-12-30** | Play 결제: 자동갱신 구독 15%. **대체결제(토스 등) 병행**: Play 수수료에서 **4%p 감액 → 구독 11%** + PG 수수료 별도 | answer/112622, answer/11222040 [읽음] |
| **2026-12-31~** | 새 요율표 한국 적용: 서비스 수수료 **자동갱신 구독 10%**(연 첫 US$1M 10%) + **청구 수수료 5%는 Play 결제를 쓸 때만**, 대체결제·외부 웹 링크는 청구 수수료 0% | android-developers.googleblog.com/2026/03/a-new-era-for-choice-and-openness.html, /2026/06/play-expanded-billing.html, answer/16954621 [읽음] |

- 한국 적용일 12-31의 청구 수수료가 US/EEA/UK와 같은 5%인지는 공식 문서에 US/UK/EEA 값만 명시 → **한국 5%는 UNVERIFIED.**
- ⇒ `SALES_OPEN` 시점이 12-31 전이면 옛 체계(15%/11%), 후면 새 체계. 판매 개시일 결정에 영향.

### 4-3. 한국 대체결제(토스 병행) — 현행 조건
[answer/11222040, 읽음 2026-09-24]
- Play 결제 **옆에** 대체결제를 나란히 제공 가능("alongside"). Google 입장: 사용자는 Play 결제를 선택할 수 있어야 한다.
- 등록: Console 대체결제 설정 → 약관 동의 → **대체결제 API 연동(2023-08-02부터 필수)** → **거래 24시간 내 보고** → 조정 수수료 납부. **PCI DSS 인증**, 사용자 사기 신고 경로, UX 가이드 준수.
- 웹 결제로 링크아웃도 대체결제 수단으로 허용되나 **앱 안의 embedded webview로 보여줘야** 한다는 요건. — TWA는 앱 전체가 Chrome이라 이 요건과 어떻게 맞출지 공식 설명 없음 → **UNVERIFIED**, 네이티브 래퍼에서 처리해야 할 가능성 큼.

### 4-4. 정책상 안전한 선택지 (순위)
1. **Play 결제만(앱 안) + 웹은 토스 유지.** Digital Goods API로 웹 코드에서 Play 시트 호출, 서버(Supabase checkout 계열)에서 `purchaseToken` 검증·**3일 내 acknowledge**(안 하면 자동 환불). 앱 안에서 토스·웹 결제 언급/링크 없음. 가장 단순·확실. 단 삼성 인터넷 기본 폰 문제(§2-2) 실기기 확인 필요. [receive-payments-play-billing, 읽음]
   - **서버 추가 작업(필수): 구독 수명주기 동기화.** 구독은 갱신·유예·보류·해지·환불로 상태가 바뀌고, 서버는 이를 Play의 실시간 개발자 알림(RTDN, Pub/Sub) + Play Developer API(구독 조회, `purchases.subscriptionsv2` 계열)로만 안다. 이게 없으면 **해지·환불 뒤에도 v2 권한이 열려 있다.** (요건 자체는 확실, API 이름·세부는 이번에 공식 문서 미열람 → **UNVERIFIED-명칭**)
   - 웹(토스)과 Play 구독이 한 사용자에게 겹치지 않게 서버 `profiles`/구독 표에 결제 경로를 기록.
2. **1 + 한국 대체결제(토스) 병행.** 수수료 4%p 절감(12-31 이후는 청구 수수료 5% 회피). 대가: 네이티브 대체결제 API, PCI DSS, 24시간 보고, UX 선택 화면. 초기 판매량 대비 공수가 큼 → 판매 규모 확인 후 2단계로 권장.
3. **소비 전용(consumption-only) 앱 — 앱에서는 안 팔고 웹에서만 판매.** 모든 앱에 허용. 앱 안 문구 "웹사이트에서 업그레이드하세요"는 허용하되 **클릭 가능한 링크·버튼은 금지**. [answer/10281818, 읽음] Play 수수료 0. 그러나 **PD 결정 ①(앱 안 v1→v2 유도 경로)의 '결제' 단계가 끊긴다** — 유도는 되지만 사용자가 앱을 나가 직접 주소를 쳐야 한다. (리더 앱 예외는 잡지·신문·책·오디오·음악·비디오 대상 — 날씨/분석 앱은 해당 안 됨으로 읽힘, 적용 해석)
4. **외부 링크 프로그램(US·EEA 등).** 미국 외부 콘텐츠 링크 프로그램(2025-12-09 발표, 2026-10-01부터 수수료 보고)·EEA 외부 제안 프로그램 존재. 한국은 새 체계 12-31 적용 공지에 "external purchase links"가 포함되나 세부 등록 절차는 "coming months" → 지금은 **한국에 쓸 수 없음/미정.** [a-new-era 블로그, answer/16954621, answer/15582165(검색 요지) — 미국 요율 세부는 제3자 출처 **UNVERIFIED**]

**권장:** 출시 시 1번, 판매가 붙으면 12-31 새 체계 확인 후 2번 검토. 3번은 PD 결정 ①과 충돌하므로 PD 판단 사항.

### 4-5. 창립 멤버 500 "평생 정가의 50%(비율 고정)"를 Play로
약속 내용: 선착순 500명, 그 시점 정가의 50%, 정가가 오르면 오른 정가의 50%, 기간 제한 없음 (`docs/FOUNDING-500.md` §1).
- Play **오퍼(offer)는 영구 불가**: 할인 단계는 기간이 정해져 있고 끝나면 기본 요금으로 전환(요약 기준 최대 1년). [developer.android.com/google/play/billing/subscriptions, 최종수정 2026-09-08, 읽음] → **오퍼로는 약속을 못 지킨다.** (단계 수·최대 기간 정확한 수치는 요약 도구 판독이라 Console에서 재확인 — UNVERIFIED-수치)
- 작동 가능한 방안: 같은 구독 상품에 **반값 기본 요금제(base plan) 'founding'** 을 따로 만든다(기본 요금제마다 가격 다르게 가능 [같은 문서]). 앱은 **서버가 창립 멤버로 판정한 사용자에게만** 그 요금제를 보여준다.
  - 약점: Play는 기본 요금제에 자격 제한을 걸지 않는다 → **서버가 `purchaseToken` 으로 산 요금제를 확인해 비자격자면 권한을 주지 않는** 검증이 필수(클라이언트 숨김만으로는 부족). 판정은 이미 서버(`is_founding_email`)에 있다.
  - 정가 인상 시: 정가 요금제와 founding 요금제를 **함께** 인상(founding = 새 정가×0.5). 기존 구독자 가격 변경은 opt-in 인상/레거시 가격 코호트 규칙을 따른다 [같은 문서] — 사용자가 인상에 동의하지 않으면 해지되는 흐름이 약관 "불리한 변경 금지"와 충돌하는지 **법무 검토 필요**.
  - 웹(토스)에서 산 창립 멤버와 Play에서 산 창립 멤버가 **같은 비율**이 되도록 서버 `plans` 표가 정본이어야 한다(현 원칙과 같음).

---

## 5. TWA에서 웹 기능

| 기능 | 방법 | 출처/상태 |
|---|---|---|
| Web Push·알림 | Bubblewrap `enableNotifications` → 알림 위임. Android 13+ 는 `POST_NOTIFICATIONS` 런타임 권한 + `DelegationService`. 웹의 `Notification.requestPermission()` 을 래퍼가 가로채는지 관련 이슈 존재 | Bubblewrap README [읽음]; android-browser-helper issue #563(비공식) — 실기기 시험 필요 |
| 위치 | `features.locationDelegation` | Bubblewrap README [읽음]; whats-new(2020) |
| 스플래시 | `backgroundColor`, `splashScreenFadeOutDuration`, `iconUrl`(≥512px) | Bubblewrap README [읽음] |
| 전체화면/방향 | `display`: standalone / fullscreen / fullscreen-sticky, `orientation` | Bubblewrap README [읽음] |
| Edge-to-edge (Android 15) | 웹 쪽 `viewport-fit=cover` + `env(safe-area-inset-*)` 가 통상 해법 | **UNVERIFIED** — TWA 공식 문서에 Android 15 항목 없음 |
| 뒤로 가기 | TWA는 브라우저 탐색 기록을 따름, 첫 화면에서 뒤로 = 앱 종료 | **UNVERIFIED**(공식 문장 미확인) |
| 공유 받기 | `shareTarget` (Web Share Target) | Bubblewrap README [읽음] |
| 앱 바로가기 | `shortcuts` (웹 매니페스트 shortcuts) | Bubblewrap README [읽음] |
| 파일 다운로드 | Chrome이 처리(웹 `a.download` 그대로) | TWA=Chrome 렌더 [TWA 개요] |
| 홈 위젯 | TWA 불가 → 네이티브 `AppWidgetProvider` 추가 필요, 값마다 출처·시각 표기 원칙 유지 | 개요 문서의 저장소 격리 문장 [읽음] |
| Chrome 없음 | `fallbackType: customtabs` 또는 `webview`. webview 폴백에서는 Google 로그인·Play 결제가 안 됨에 유의 | Bubblewrap README [읽음] |

**관측된 선행 문제 (production, 2026-09-24 curl):**
- `https://earthus.net/v2/manifest.webmanifest` 가 v1 매니페스트와 **바이트 단위로 같다**(name "earthus — 지금 지구", start_url `./index.html`). 한 앱에 v1·v2를 담을 거면 Bubblewrap `init` 은 **v1 매니페스트(`/manifest.webmanifest`)** 로 하고 v2는 경로로 들어가면 된다. v2 전용 매니페스트 이름 정리는 별건.
- 두 서비스워커(`/sw.js`, `/v2/sw.js`)가 같은 출처에서 CacheStorage를 공유(주석에 명시). TWA에서도 동일하게 동작 — 변화 없음.

---

## 6. Digital Asset Links — 요건과 함정

요건 [developer.android.com/training/app-links/configure-assetlinks, 최종수정 2026-09-16, 읽음]:
- 위치 `https://earthus.net/.well-known/assetlinks.json`, **HTTPS**, **HTTP 200**, **`Content-Type: application/json`**, **리다이렉트(301/302) 없이**. 여러 도메인이면 도메인마다.
- 한 파일에 **여러 SHA-256 지문** 가능(업로드 키·Play 서명 키·디버그). Play App Signing을 쓰면 지문은 로컬이 아니라 **Console에서** 가져온다.
- 형식 [developer.chrome.com/docs/android/trusted-web-activity/android-for-web-devs, 읽음]:
  `[{"relation":["delegate_permission/common.handle_all_urls"],"target":{"namespace":"android_app","package_name":"<패키지>","sha256_cert_fingerprints":["<Play 서명키>","<업로드키>"]}}]` — Chrome 파서가 엄격(끝 쉼표 금지).
- 캐시: Android 15+ 는 주기적 재검증, 반영 최대 7일. 14 이하는 설치/업데이트 때만. [verify-android-applinks, 최종수정 2026-09-16]

EARTHUS 현 상태와 함정:
1. **지금 `https://earthus.net/.well-known/assetlinks.json` → `403`, `Content-Type: application/xml`, `X-Cache: Error from cloudfront`** (2026-09-24 curl). S3(OAC)에 객체가 없어서 나는 403으로 보인다. 올릴 때 `s3://earthus-app-seoul/app/.well-known/assetlinks.json` 에 `--content-type application/json` 명시(HANDOVER §3 Content-Type 규칙과 같은 함정). CloudFront 기본 동작이 `/.well-known/*` 를 app 원본으로 보내는지는 **UNVERIFIED**(배포 설정 미열람).
2. **CloudFront 오류 응답 정의 주의** — 404/403을 index.html(200, text/html)로 바꿔 주는 설정이 있다면 파일이 없을 때 "200 + HTML"이 나와 원인이 가려진다. 현재는 403 XML이므로 해당 없어 보임.
3. **www.earthus.net 도 200으로 같은 내용을 준다**(리다이렉트 아님). TWA host는 `earthus.net` 하나로 고정. www로 들어오는 링크까지 앱에서 열려면 www에도 assetlinks 필요.
4. **업로드 키 vs Play 서명 키.** 로컬 설치(ADB)본은 업로드 키, 스토어 설치본은 Play 서명 키로 서명 → 둘 다 넣지 않으면 한쪽에서 주소창이 보인다. [TWA 가이드 v2, 최종수정 2026-02-26]
5. Play App Signing이 "quantum-ready, hybrid signing"으로 바뀐 것이 Asset Links 지문에 영향을 주는지는 **UNVERIFIED** — Console에 표시되는 SHA-256을 그대로 쓰고 실기기로 확인.
6. `no-cache` 로 올리고 무효화는 `/.well-known/assetlinks.json` 경로 지정. Google 측 캐시도 수 시간 지연 가능.

---

## 7. 완료 기준 (관찰 가능한 결과로)

1. `curl -sI https://earthus.net/.well-known/assetlinks.json` → `HTTP 200`, `Content-Type: application/json`, `Location` 헤더 없음.
2. 스토어(비공개 테스트 트랙)에서 설치한 앱을 열면 **주소창 없이** v1 지구가 뜬다(Chrome 기본 폰 + 삼성 인터넷 기본 갤럭시 각 1대에서 확인, 결과 기록).
3. 앱 안에서 v1 → v2로 넘어가도 주소창이 생기지 않는다.
4. 앱 안에서 Google 로그인과 Apple 로그인이 끝까지 돌아와 **로그인 상태가 화면에 표시된다.**
5. 웹 알림 구독 → 서버 발송 → **안드로이드 알림 표시줄에 EARTHUS 이름으로** 뜬다(Android 13+ 권한 대화상자 포함).
6. 내 위치 버튼 → 안드로이드 위치 권한 대화상자 → 위치가 지구에 찍힌다.
7. v2 결제 버튼 → **Google Play 결제 시트**가 뜨고, 라이선스 테스터 결제 후 서버가 `purchaseToken` 을 검증·acknowledge하고 v2 권한이 열린다. 앱 안 어디에도 토스 결제창이 뜨지 않는다.
7-1. **삼성 인터넷이 기본 브라우저인 갤럭시에서도** 앱 안에서 토스 결제창이 뜨지 않는다(Play 시트 또는 네이티브 결제 또는 "앱에서는 결제할 수 없습니다" 안내 중 하나).
7-2. Play에서 구독을 해지·환불하면 **만료 시각 이후 서버가 v2 권한을 닫고**, 화면이 FREE 상태로 돌아간다.
8. 창립 멤버 시험 계정은 founding 요금제(정가의 50%)가, 일반 계정은 정가가 보이고, 일반 계정이 founding 요금제 토큰을 보내면 서버가 거부한다.
9. 웹에 문구 하나를 배포하면 **앱 재설치 없이** 다음 실행에 반영된다.
10. 모든 화면 값에 출처·시각이 웹과 똑같이 붙어 있다(앱 전용 화면·위젯 포함).

---

## 8. PD 결정이 필요한 것

1. **계정 종류**: 조직 계정(D-U-N-S, 최대 30일, 12명·14일 면제) vs 개인 계정(즉시, 12명·14일 필요).
2. **앱 안 결제 방식**: §4-4의 1 / 1+2 / 3(소비 전용 — PD 결정 ①과 충돌) 중 선택.
3. **판매 개시일과 12-31 한국 새 수수료 체계**의 선후.
4. **창립 멤버**: founding 기본 요금제 방식 + 정가 인상 시 opt-in 규칙의 약관 적합성(법무).
5. **홈 위젯** 여부(네이티브 공수 추가).

---

## 출처 목록 (모두 2026-09-24 열람)

- https://support.google.com/googleplay/android-developer/answer/14151465 — 신규 개인 계정 테스트 요건
- https://support.google.com/googleplay/android-developer/answer/11926878 — 타깃 API
- https://support.google.com/googleplay/android-developer/answer/11222040 — 한국 결제 요건 변경
- https://support.google.com/googleplay/android-developer/answer/112622 — 서비스 수수료
- https://support.google.com/googleplay/android-developer/answer/16954621 — 낮아진 서비스 수수료(한국 2026-12-31)
- https://support.google.com/googleplay/android-developer/answer/9858738 — 결제 정책
- https://support.google.com/googleplay/android-developer/answer/10281818 — 결제 정책 이해(소비 전용)
- https://support.google.com/googleplay/android-developer/answer/9899034 — 스팸(웹뷰)
- https://support.google.com/googleplay/android-developer/answer/13628312 — 계정 종류·D-U-N-S
- https://support.google.com/googleplay/android-developer/answer/14316361 — 기기 인증
- https://support.google.com/googleplay/android-developer/answer/9866151 — 스토어 그래픽
- https://support.google.com/googleplay/android-developer/answer/9842756 — Play App Signing
- https://support.google.com/googleplay/android-developer/answer/9859455 — 앱 콘텐츠 신고
- https://support.google.com/googleplay/android-developer/answer/10787469 — Data safety
- https://support.google.com/googleplay/android-developer/answer/13327111 — 계정 삭제
- https://android-developers.googleblog.com/2026/03/a-new-era-for-choice-and-openness.html (2026-03-04)
- https://android-developers.googleblog.com/2026/06/play-expanded-billing.html (2026-06-24)
- https://android-developers.googleblog.com/2026/06/android-developer-verification.html
- https://developer.android.com/google/play/billing/deprecation-faq (최종수정 2026-09-09)
- https://developer.android.com/google/play/billing/subscriptions (최종수정 2026-09-08)
- https://developer.android.com/develop/ui/views/layout/webapps (최종수정 2026-09-22)
- https://developer.android.com/develop/ui/views/layout/webapps/guide-trusted-web-activities-version2 (최종수정 2026-02-26)
- https://developer.android.com/training/app-links/configure-assetlinks (최종수정 2026-09-16)
- https://developer.android.com/training/app-links/verify-android-applinks (최종수정 2026-09-16)
- https://developer.chrome.com/docs/android/trusted-web-activity/ (2020-02-04)
- https://developer.chrome.com/docs/android/trusted-web-activity/receive-payments-play-billing (2021-01-26)
- https://developer.chrome.com/docs/android/trusted-web-activity/android-for-web-devs
- https://developer.chrome.com/docs/android/trusted-web-activity/whats-new
- https://developer.chrome.com/docs/android/trusted-web-activity/query-parameters
- https://developer.chrome.com/docs/android/trusted-web-activity/integration-guide (referrer 언급 없음 확인)
- https://developers.googleblog.com/upcoming-security-changes-to-googles-oauth-20-authorization-endpoint-in-embedded-webviews/
- https://github.com/GoogleChromeLabs/bubblewrap (packages/cli/README.md, template build.gradle) · https://registry.npmjs.org/@bubblewrap/cli (1.25.0)
- https://github.com/GoogleChrome/android-browser-helper (TwaProviderPicker.java, docs/trusted-web-activity-browser-support.md, gradle/libs.versions.toml)
- https://dl.google.com/android/maven2/com/google/androidbrowserhelper/billing/1.2.0/billing-1.2.0.pom
- https://chromium.googlesource.com/chromium/src/+/refs/heads/main/android_webview/docs/web-platform-compatibility.md
- https://capacitorjs.com/docs/config (v8)
- 제3자(보조, 판단 근거 아님): Median.co·testerscommunity 등 12명 규칙 해설, 중앙일보 2026-03-05(네이트) 한국 12월 적용 기사
