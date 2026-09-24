# 지시서 초안 외부 사실 검증 — Google Play · TWA · Chrome 확장 (2026-09-24)

> 검증자: 적대적 사실 확인(읽기 전용). 대상: `docs/app-plan-2026-09-24/DIRECTIVE-draft.md` 의 외부 사실 주장 전부.
> 방법: 2026-09-24 에 공식 문서를 WebFetch/curl 로 직접 열어 대조. 인용은 영어 원문 15단어 이하.
> 판정: **CONFIRMED** 공식 문서가 그대로 말함 · **WRONG** 공식 문서와 다름(바른 값 기재) · **OUTDATED** 예전엔 맞았으나 지금은 바뀜 · **UNVERIFIABLE** 공식 출처로 확인 못 함.
> 저장소·운영 실측(assetlinks 403, CORS, 파일 크기 등)은 이 검증의 범위 밖이다.
> URL 약칭: `answer/NNNN` = `https://support.google.com/googleplay/android-developer/answer/NNNN`. 숫자·결정에 큰 행(§0-A, §0-C)은 요약 도구가 아니라 curl 원문 grep 으로 다시 확인했다("원문" 표기).

## 0. 먼저 고쳐야 할 것 (지시서 본문에 영향)

| # | 초안 | 바른 사실 | 고칠 곳 |
|---|---|---|---|
| **A** | assetlinks 지문 = 업로드 키 + 앱 서명 키 **둘** | 신규 앱은 **양자 대비 하이브리드 서명에 자동 가입** — Google 보유 키가 **3개**이고 "지문 세 개를 등록"하라, assetlinks 도 갱신하라고 명시(answer/9842756 원문 — "you must copy the fingerprints for three keys and register each of them" · "Update your assetlinks.json file with these fingerprints"). Play Console 의 App signing 화면이 주는 assetlinks 스니펫을 그대로 쓰고 + 업로드 키 지문을 더하는 방식으로 고친다. (ML-DSA 키 지문을 assetlinks 가 어떻게 받는지는 **UNVERIFIABLE** → Console 스니펫 기준) | §3-6 앱 서명, §5 Phase 1 PD ③, R3 |
| **B** | 한국 "외부 링크 프로그램 — coming months, 지금은 쓸 수 없음/미정" (나-4) | 한국은 **지금도** 대체결제 프로그램 안에서 앱 안 **웹 결제로 나가는 링크(outlink)** 를 허용 — 임베디드 웹뷰로 보여야 하고 수수료 4%p 감액(answer/11222040). "coming months" 는 2026-12-31 부터 KR 에 오는 새 'External web link' 프로그램(answer/16954621 각주) 이야기다 — 새 프로그램은 미정이 맞고, 현행 outlink 는 있다 | §3-3 (나) 4번 |
| **C** | 가-1(비갱신 상품) 수수료 **UNVERIFIED** | 현행(answer/112622 원문): 1회성 상품은 15% 등급 가입 시 연 $1M 까지 15%·초과분 30%, 자동 갱신 구독은 매출과 무관하게 15%. 새 체계(answer/16954621 원문 표, 지역 구분 없는 요율표 + 지역별 시작일 표에서 **KR = 2026-12-31**): **연 매출 첫 $1M 은 비반복·반복 모두 10% + 청구 수수료(해당 시)**. $1M 초과 'Standard' 는 비반복 신규 설치 20%·기존 설치 25%, 반복 10%. → EARTHUS 규모(첫 $1M 안)에서는 **12-31 이후 가-1 과 가-2 의 서비스 수수료가 같다(10%)**. 현행(~12-30)도 둘 다 15%. 한국 청구 수수료율은 "forthcoming" → **UNVERIFIABLE**. 선불형 요금제가 반복/비반복 어느 쪽인지는 첫 $1M 안에서는 결과가 같다 | §3-3 수수료 표, D1·D2 대가 |
| **D** | CWS 품질 지침에 "Google 검색을 하드코딩한 입력창"이 위반 예 그대로 있다(읽음) | 지침의 실제 예는 "사용자의 검색 설정을 존중하지 않고 검색 경험을 바꾸는 새 탭 확장". '하드코딩 검색창'이라는 문구는 없다. 결론(검색창 없음)은 그대로 좋지만 근거 문장을 고친다 | §4-7 |
| **E** | 삼성 인터넷 TWA 알림 위임 "안 될 수 있음(UNVERIFIED)" | android-browser-helper 공식 지원표: 삼성 인터넷 = 기본 지원 ✅, **스플래시 ❌, 알림 위임 ❌**. 문서상 사실로 격상(실기기 확인은 그대로 유지) | §2-3 #5, D5, R2 |
| **F** | Play 등록비 US$25 **UNVERIFIED** · Edge 등록비 없음 **UNVERIFIED** | 둘 다 공식 문서로 **확인됨** | §3-6, §4-7, D10, §8 |
| **G** | Play 고해상 아이콘 모서리 처리 **UNVERIFIED** | 공식 아이콘 규격: **꽉 찬 정사각형**으로 올리고, 모서리(아이콘 크기의 30%)·그림자는 Play 가 입힌다. 지금 `icon-512.png`(둥근·투명 모서리)는 규격 위반 형태 | §3-7 |
| **H** | (누락) Android 개발자 인증 | 2026-06 공식 블로그: Play 앱 99% 이상 자동 등록, **2026-09-30** 브라질·인도네시아·싱가포르·태국부터 의무, 2027 전 세계 확대. Play 로만 배포하면 영향 작음 — Console 에서 등록 상태만 확인하면 됨 | §3-6 에 한 줄 추가 |

## 1. Google Play — 계정·테스트·등록

| 주장 | 판정 | 출처 · 인용 |
|---|---|---|
| 2023-11-13 이후 만든 **개인** 계정은 프로덕션 전에 비공개 테스트 필요 | CONFIRMED | answer/14151465 — "personal developer accounts created after November 13, 2023, to test their apps" |
| 테스터 **12명 이상**, **14일 연속** opt-in | CONFIRMED | answer/14151465 — "At least 12 testers … opted in continuously for the preceding 14 days" |
| 프로덕션 접근 심사 "7일 이내(더 걸릴 수 있음)" | CONFIRMED | answer/14151465 — "Review usually takes seven days or less, but can occasionally take longer." |
| 조직 계정은 이 테스트 요건 면제 | UNVERIFIABLE(사실상 맞음) | answer/14151465 — 요건 대상이 "personal developer accounts created after November 13, 2023" 뿐. '조직 면제' 명시 문장은 없음 |
| 12명 규칙이 20→12 로 바뀐 시점 2024-12 | UNVERIFIABLE | 제3자 글만(dev.to 등). 공식 공지 못 찾음 — 초안도 UNVERIFIED 로 둠(맞음) |
| 계정 유형 개인/조직, 조직은 D-U-N-S 필수 | CONFIRMED | answer/13628312 — "You will not be able to create a developer account for an organization without one." |
| D-U-N-S 발급 "최대 30일" | CONFIRMED | answer/13628312 — "This process can take up to 30 days so you should plan ahead" |
| 조직 법인명·주소가 결제 프로필과 일치 | CONFIRMED | answer/13628312 — "legal name and address in your Google payments profile match" D&B profile |
| 신규 개인 계정은 Play Console 앱으로 **Android 10+** 실기기 인증 | CONFIRMED | answer/14316361 — "non-rooted physical Android mobile device that runs at least the Android 10" |
| 등록비 US$25 1회 (초안: UNVERIFIED) | **CONFIRMED** | answer/6112435 — "There is a US$25 one-time registration fee" |
| 앱 이름(스토어 제목) 30자 한도 | CONFIRMED | answer/9859152 — "30 character limit" |
| 패키지명은 한 번 정하면 바꿀 수 없다 | CONFIRMED | answer/9859152 — "Package names … are unique and permanent … can't be deleted or re-used" |
| Android 개발자 인증(초안에 출처 링크만, 본문 없음) | 누락 — 위 §0-H | android-developers.googleblog.com/2026/06/android-developer-verification.html — "Over 99% of their apps have been automatically registered." |

## 2. Google Play — 기술 요건

| 주장 | 판정 | 출처 · 인용 |
|---|---|---|
| 타깃 API **36**, 신규 앱·업데이트 **2026-08-31**부터, 연장 **2026-11-01** | CONFIRMED | answer/11926878 — "New apps and app updates must target Android 16 (API level 36) or higher" |
| Play Billing Library **8+**, 2026-08-31부터, 연장 11-01 | CONFIRMED | developer.android.com/google/play/billing/deprecation-faq — "must use Billing Library version 8 or later … extension until Nov 1, 2026" |
| 신규 앱은 Play App Signing 자동 | CONFIRMED (단 §0-A) | answer/9842756 — "automatically enrolled in quantum-ready, hybrid signing with Google-generated keys" |
| 업로드 키 분실 시 재설정 가능 | CONFIRMED | answer/9842756 — "If you lose your upload key … you are not locked out of your app." |
| assetlinks 에 업로드 키 + 앱 서명 키 지문 **두 개** | **WRONG / OUTDATED** | answer/9842756 — "you must copy the fingerprints for three keys and register each" / "Update your assetlinks.json file with these fingerprints" |
| 형식 AAB | CONFIRMED | developer.android.com/guide/app-bundle — "From August 2021, new apps are required to publish with the Android App Bundle" |
| assetlinks: `application/json`, 리다이렉트 없음, 지문 여러 개 가능 | CONFIRMED | developer.android.com/training/app-links/configure-assetlinks — "must be accessible without any redirects (no 301 or 302 redirects)" |
| Play App Signing 이면 Console 이 올바른 assetlinks 스니펫을 준다 | CONFIRMED(초안에 없음, 추가 권장) | configure-assetlinks — "you'll find the correct Digital Asset Links JSON snippet" on App signing page |
| Android 15+ 재검증 반영 최대 7일 | CONFIRMED | developer.android.com/training/app-links/verify-android-applinks — "Changes can take up to seven days to propagate" |
| Bubblewrap 템플릿 targetSdk 36 | CONFIRMED | github.com/GoogleChromeLabs/bubblewrap `template_project/app/build.gradle` — `targetSdkVersion 36` (curl 로 확인) |
| @bubblewrap/cli 최신 1.25.0 | CONFIRMED | registry.npmjs.org/@bubblewrap/cli/latest — `"version":"1.25.0"` |
| androidbrowserhelper:billing 1.2.0 → billingclient **8.3.0** | CONFIRMED | dl.google.com/…/billing-1.2.0.pom — `com.android.billingclient:billing` 8.3.0 |

## 3. Google Play — 스토어 등록정보·앱 콘텐츠

| 주장 | 판정 | 출처 · 인용 |
|---|---|---|
| 아이콘 512×512, 32-bit PNG(알파), ≤1024 KB | CONFIRMED | answer/9866151 — "32-bit PNG (with alpha)", "512px by 512px", "Maximum file size: 1024KB" |
| 아이콘 모서리 처리 (초안: UNVERIFIED) | **CONFIRMED → 꽉 찬 정사각형** | developer.android.com/distribute/google-play/resources/icon-design-specifications — "Full square – Google Play dynamically handles masking." |
| 피처 그래픽 1024×500, 알파 없음 | CONFIRMED | answer/9866151 — "JPEG or 24-bit PNG (no alpha)", "1024px by 500px" |
| 스크린샷 최소 2장 | CONFIRMED | answer/9866151 — "minimum of two screenshots across different device types" |
| 추천 노출: 폰 4장, 1080px 이상, 9:16 | CONFIRMED | answer/9866151 — "at least four screenshots with minimum 1080px resolution" (세로 1080×1920 이상) |
| Data safety: 비공개·공개·프로덕션 트랙 필수 | CONFIRMED | answer/10787469 — 예외는 "Apps that are active on internal testing tracks are exempt" 뿐 |
| 처리방침: 스토어 등록정보 **및 앱 안** 링크 | CONFIRMED | answer/9859455 — "link to a privacy policy on your app's store listing page and within your app" |
| 계정 삭제: 앱 안 경로 + **웹 링크** 둘 다 | CONFIRMED | answer/13327111 — "provide a web link resource where users can request app account deletion" |
| 앱 콘텐츠: 광고·로그인 정보·대상 연령·콘텐츠 등급 | CONFIRMED | answer/9859455 — 광고·"Sign-in Details"·대상 연령·등급 설문 항목 확인 |
| 웹뷰 앱 스팸 정책 | CONFIRMED(문구 범위 주의) | answer/9899034 — "provide a webview of a website without permission from the website owner" — 자기 사이트 래퍼를 명시적으로 막는 문장은 없음. 반려 가능성 자체는 UNVERIFIABLE(초안과 같음) |

## 4. Google Play — 결제 정책·수수료

| 주장 | 판정 | 출처 · 인용 |
|---|---|---|
| Play 배포 앱 안의 디지털 상품·기능 결제는 Play 결제 | CONFIRMED | answer/9858738 — "must use Google Play's billing system for those transactions unless Section 3, 8, or 9 applies" |
| 앱 안 단추·링크·웹뷰로 다른 결제로 유도 금지 | CONFIRMED | answer/9858738 — "In-app webviews, buttons, links, messaging, advertisements, or other calls to action" |
| 소비 전용: "웹에서 업그레이드" 문구는 가능, 링크 금지 | CONFIRMED | answer/10281818 — "additional information about purchasing options without direct links" |
| 구매 3일 안 acknowledge, 안 하면 자동 환불 | CONFIRMED (+보강) | developer.android.com/google/play/billing/integrate — "within three days so that the purchase isn't automatically refunded" · 1주 미만 선불형은 기간의 절반(subscriptions 문서) |
| 비갱신형 상품 유형이 Play 에 있다(가-1 전제) | CONFIRMED | developer.android.com/google/play/billing/subscriptions — "Prepaid plans do not automatically renew upon expiration." (1회성 상품도 있음) |
| 가-1 비갱신 상품 수수료 (초안: UNVERIFIED) | **값 확인 — §0-C** | answer/112622 원문 — "15% service fee tier" 15% / 30% · answer/16954621 원문 표 — "First $1M annual earnings 10% + billing fee, if applicable"(비반복·반복 공통) |
| 선불형 요금제가 '반복 거래'로 분류되는가 | UNVERIFIABLE | 16954621 은 "recurring/non-recurring" 만 구분, 선불형 언급 없음 — 첫 $1M 안에서는 요율이 같아 영향 없음 |
| 새 요율표가 한국에도 적용되는가 | CONFIRMED | answer/16954621 원문 시작일 표 — "December 31, 2026 KR"(Changes to service fees + Expanded Billing Choice) |
| Play 오퍼는 끝나면 기본 요금제 정가로 돌아감 | CONFIRMED | subscriptions 문서 — "After the trial period ends, the user's payment method is charged for the full subscription amount." |
| 오퍼 최대 기간 수치 | UNVERIFIABLE | subscriptions 문서에 수치 없음(초안과 같음) |
| 기존 구독자 가격 인상 opt-in 규칙 | UNVERIFIABLE | 가져온 문서에 규칙 본문 없음(opt-in 가격 인상 메시지 언급만) — 법무 검토 필요 그대로 |
| 한국 현행(~2026-12-30) 자동 갱신 구독 15% | CONFIRMED | answer/112622 — auto-renewing subscriptions "15%" |
| 한국 대체결제 병행 시 4%p 감액 → 11% + PG 수수료 | CONFIRMED | answer/11222040 — service fee "reduced by 4%" |
| 대체결제: PCI DSS · 24시간 안 보고 · 선택 화면 | CONFIRMED | answer/11222040 — "within 24 hours using alternative billing APIs" · "certifying PCI DSS compliance" · "screens rendered by Google Play" |
| 대체결제 outlink 는 앱 안 embedded webview 로 | CONFIRMED | answer/11222040 — "shown within the developer's app using an embedded webview" — TWA 에서 어떻게 맞추는지 공식 설명 없음(UNVERIFIABLE, 초안과 같음) |
| 한국 외부 링크 프로그램 "coming months, 지금 불가/미정" | **WRONG (부분)** — §0-B | answer/11222040 — "Google Play does allow developers to link out … South Korea" (현행, 4%p 감액) |
| 한국 새 체계 시작 **2026-12-31** | CONFIRMED (출처 간 불일치 주의) | answer/16954621 표 — South Korea "December 31, 2026". 3월 블로그는 "By December 31: Korea and Japan", 도움말은 일본을 9-30 으로 적음 — 한국 날짜는 둘이 일치 |
| 새 체계 서비스 수수료 10%(자동 갱신 구독) | CONFIRMED | answer/16954621 원문 — Recurring "10% + billing fee, if applicable". 비반복도 첫 $1M 은 10%, 초과분 Standard 20%(신규)/25%(기존) |
| 청구 수수료는 Play 결제를 쓸 때만 | CONFIRMED | answer/16954621 — billing fee applies "for transactions that use Google Play Billing" |
| 대체결제·외부 링크의 청구 수수료 0% | UNVERIFIABLE(사실상 맞음) | answer/16954621 원문 — "For transactions that use Google Play Billing, an additional billing fee applies." '0%' 명시는 없음. 외부 링크 칸 주석은 "Program details will be shared in the coming months" |
| US·UK·EEA 청구 수수료 5%, 한국 값 미정 | CONFIRMED | answer/16954621 — "Billing fee details for other regions are forthcoming." |
| 새 체계에서 한국 대체결제 4%p 감액이 유지되는가 | UNVERIFIABLE | 16954621 에 한국 대체결제 수수료 행 없음(초안에 암묵 전제 — 명시 필요) |

## 5. TWA · 웹뷰 · 로그인

| 주장 | 판정 | 출처 · 인용 |
|---|---|---|
| Digital Goods API: Chrome, TWA, Play 배포 | CONFIRMED | developer.chrome.com/docs/android/trusted-web-activity/receive-payments-play-billing — "available on Chrome 101 and above for Android and ChromeOS" (문서 최종 수정 2021-01-26) |
| Digital Goods API 가 Chrome **에서만** 된다 | UNVERIFIABLE(부재 확인) | 같은 문서에 다른 브라우저 언급 없음 |
| 삼성 인터넷 TWA "basic support only" | CONFIRMED (+알림 위임 ❌) | github.com/GoogleChrome/android-browser-helper/…/trusted-web-activity-browser-support.md — Samsung Internet "✅ (since 13.0.2.9)", 알림 위임 "❌" |
| Capacitor 원격 URL "not intended for use in production" | CONFIRMED | capacitorjs.com/docs/config — "This is not intended for use in production." |
| System WebView 는 별도 GPU 프로세스 없음 | CONFIRMED | chromium android_webview/docs/web-platform-compatibility.md — "WebView does not use a separate GPU process" |
| Google 이 임베디드 웹뷰 OAuth 를 `disallowed_useragent` 로 차단 | CONFIRMED | developers.googleblog.com/upcoming-security-changes… — 대안으로 Custom Tabs·App Links 권고 |
| start_url 에 쿼리 표식(`?src=twa`) | CONFIRMED | developer.chrome.com/…/query-parameters — `"startUrl": "/?utm_source=trusted-web-activity"`. 주의: 쿼리가 referrer 로 샐 수 있음 → 초안의 `replaceState` 로 지우기는 문서 권고와 일치 |
| `document.referrer = android-app://…` | UNVERIFIABLE | 공식 문서에서 확인 못 함(초안과 같음) |
| WebView 의 `navigator.share`·웹푸시 미지원 | UNVERIFIABLE | 이번에 공식 확인 못 함(초안과 같음) |

## 6. Chrome 확장·웹스토어

| 주장 | 판정 | 출처 · 인용 |
|---|---|---|
| `chrome_url_overrides.newtab`, 확장당 한 페이지 | CONFIRMED | developer.chrome.com/docs/extensions/develop/ui/override-chrome-pages — "Each extension can only override one page." |
| 시크릿 창에서는 새 탭을 못 바꾼다 | CONFIRMED | override-chrome-pages — "In incognito windows, extensions can't override New Tab pages." |
| "새 탭은 즉시 열려야 한다" 권고 | CONFIRMED | override-chrome-pages — "Users expect built-in browser pages to open instantly." |
| 새 탭을 열면 주소창이 포커스를 가진다 | CONFIRMED | override-chrome-pages — "new tabs give keyboard focus to the address bar first." |
| 페이지에 title 을 줘라 | CONFIRMED | override-chrome-pages — "Without a title, the page title defaults to the URL." |
| Chrome 138 확장 새 탭 하단 바(footer) | CONFIRMED | groups.google.com/a/chromium.org/…/DNj1B3vywr0 — 사용자가 끌 수 있음("Show footer on New tab page" 토글) |
| 하단 바 높이 약 48 px | UNVERIFIABLE | 같은 글에 높이 없음(초안과 같음) |
| 원격 코드 금지, 데이터(JSON·이미지)는 허용 | CONFIRMED | developer.chrome.com/docs/webstore/program-policies/mv3-requirements — "Fetching remote resources that are not used to evaluate logic, such as images" |
| 품질 지침에 "Google 검색 하드코딩 입력창" 위반 예 | **WRONG** — §0-D | quality-guidelines — "New Tab Page extensions that alter the user's web search experience and don't respect…" |
| 단일 목적 | CONFIRMED | quality-guidelines — "An extension must have a single purpose that is narrow and easy to understand." |
| 최소 기능: 웹페이지를 띄우기만 하는 확장 금지(A안 위험) | CONFIRMED(정책 문구) | minimum-functionality — "single purpose of installing or launching another app, theme, webpage" · 실제 반려 사례는 UNVERIFIABLE |
| host 권한이 있으면 확장 페이지·SW fetch 는 CORS 무관 | CONFIRMED | developer.chrome.com/…/network-requests — "can talk to remote servers outside of its origin, as long as the extension requests host permissions" (콘텐츠 스크립트는 예외) |
| `alarms` 권한 필요, 15분 주기 가능 | CONFIRMED | developer.chrome.com/docs/extensions/reference/api/alarms — "at most once every 30 seconds" · 브라우저 재시작 뒤 유지 기본값 true |
| 심사: 대부분 며칠, 몇 주까지 · 신규 개발자·넓은 host 권한이면 더 길다 | CONFIRMED | developer.chrome.com/docs/webstore/review-process — "completed within a few days, but it can take up to a few weeks." |
| 개발자 계정 이메일은 바꿀 수 없다 | CONFIRMED | developer.chrome.com/docs/webstore/register — "After an account is created, you cannot change its email address." |
| CWS 등록비 US$5 | UNVERIFIABLE | register 문서는 "pay a one-time registration fee" 만, 금액 없음. $5 는 커뮤니티 글뿐(초안과 같음) |
| 개인정보 관행 탭: 단일 목적·권한별 사유·원격 코드 여부·데이터 공개·처리방침 URL | CONFIRMED | developer.chrome.com/docs/webstore/cws-dashboard-privacy — "tell the reviewers why your extension needs to use each permission" |
| 스토어 아이콘 128×128(그림 96 + 여백 16) | CONFIRMED | developer.chrome.com/docs/webstore/images — "The actual icon size should be 96x96" |
| 스크린샷 1280×800 또는 640×400, 1~5장 | CONFIRMED | images — "at least 1—and preferably the maximum allowed 5" |
| 작은 홍보 이미지 440×280, 없으면 노출 불리 | CONFIRMED | images — "Extensions that don't have a small promotional image will be shown after" |
| "Is this the new tab page you were expecting?" 확인 창 | UNVERIFIABLE | 제3자(malwaretips)만. 공식 문서 없음(초안과 같음) |
| Edge: 이름·설명에 "Chrome" 이 있으면 바꿔야 함 | CONFIRMED | learn.microsoft.com/…/port-chrome-extension — "rebrand the extension using Microsoft Edge … the changes are required." |
| Edge 등록비 없음 (초안: UNVERIFIED) | **CONFIRMED** | learn.microsoft.com/…/publish/create-dev-account — "There is no registration fee for submitting extensions" |
| Google Earth View 사이트 2024-01 폐쇄 | CONFIRMED(뉴스 출처) · 표현 주의 | 9to5google 2024-01-29 — 사이트는 404, 확장은 남았으나 "only able to show a randomly selected image". 초안의 "확장이 무너졌다"는 "기능이 크게 줄었다"로 |

## 7. 판정 집계

- CONFIRMED 약 60건 · **WRONG/OUTDATED 3건**(assetlinks 지문 수, 한국 outlink 현행 여부, CWS 검색창 근거 문장) · **UNVERIFIED → CONFIRMED 격상 4건**(Play $25, Edge 무료, 아이콘 꽉 찬 정사각형, 삼성 인터넷 알림 위임 ❌) · **UNVERIFIED → 값 확인 1건**(가-1 수수료) · 누락 1건(Android 개발자 인증) · UNVERIFIABLE 약 14건(이 중 '사실상 맞음' 2건: 조직 면제, 대체결제 청구 수수료 0%).
- 결정에 영향이 큰 것: **§0-A**(Phase 1 완료 기준 1·2 가 두 지문으로는 실패할 수 있음), **§0-C**(가-1 수수료가 확인됨 — 첫 $1M 안에서는 가-1·가-2 서비스 수수료가 현행 15%, 12-31 이후 10% + 청구 수수료로 **같다**. 수수료는 가-1/가-2 선택의 변수가 아니다 → 약관 개정 부담이 선택을 가른다), **§0-B**(나-2 에 한국 outlink 가 현행 선택지로 들어감).
