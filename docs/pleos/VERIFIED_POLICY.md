# Pleos (Hyundai Motor Group) — 앱 정책 조사 결과

> V38.1 §4 가 요구한 파일. 통합 계획서 `docs/EARTHUS-V38_1-V7-INTEGRATED-DEV-PLAN-2026-09-27.md` §5 PL0 이 이 문서를 인용한다.
> **EARTHUS 에 주는 뜻 (계획서 반영):** ① Pleos 앱은 네이티브 AAOS APK 다 — 지금 TWA 를 그대로 올릴 수 없다고 보고 설계한다. ② 주행 중 사용 선언(DO)을 하지 않은 앱은 P 가 아니면 OS 가 종료한다 → **1차 출시는 '주차 중 전용'**, 주행 중 화면은 Pleos 가 DO 자격을 확인해 줄 때만. ③ 웹 런타임(WebView) 허용·탑재 여부, DO 자격, 계정 자격, 에뮬레이터 이미지는 §6 의 7개 질문으로 partnership@pleos.ai 에 물어야 한다(PD 가 보낸다).

조사일: 2026-09-27 · 방법: WebSearch + WebFetch (공개 페이지만, 로그인 없음)
주의: WebFetch 는 페이지를 요약 모델로 읽는다 — 아래 "VERIFIED"는 이번 세션에 공식 페이지를 직접 가져와 읽은 것이고, 문구는 요약(paraphrase)이다. 중요한 숫자는 제출 전 원문을 사람이 다시 확인할 것.
Pleos 문서 페이지에는 날짜/버전 표기가 없었다(요약 결과 "no date"). Google 페이지는 footer 의 Last updated 를 적었다.

---

## 0. 한 줄 결론 (EARTHUS 관점)

- Pleos 는 서드파티를 받는다(공식 포털 **Pleos Playground**, 스토어 **Pleos App Market**). 문서는 **공개**(document.pleos.ai, 로그인 없이 읽힘). 단 **에뮬레이터 이미지는 비공개** — partnership@pleos.ai 로 요청해야 받는다.
- 앱 형태는 **네이티브 Android(AAOS) APK** (Java/Kotlin, minSdk 28, Gradle 8+, 에뮬레이터 API 34). 공식 문서 어디에도 **WebView / 웹앱 / PWA / TWA / Car App Library 템플릿** 언급이 **없었다** — 허용/금지 어느 쪽도 확인 못 함.
- **주행 중 규칙이 핵심 장벽**: Distraction Optimization(DO) 을 선언하지 않은 앱은 기어 P 가 아니면(정차 중 포함) **종료(Terminated)**. 카테고리 8개 중 주행 중 예외는 Maps/Navigation · Mobility Services · Music/Audio 뿐. **날씨/정보 카테고리는 목록에 없다.**
- → EARTHUS(웹 + Cesium 3D 지구, 애니메이션 多)는 Pleos 에서 사실상 **"주차 중 전용" 앱**으로만 현실적. 주행 중 노출을 원하면 별도 네이티브·정적 UI 가 필요하고, 그것도 DO 선언 자격이 누구에게 주어지는지 공개 문서에 없다.
- **지금의 Bubblewrap TWA 를 그대로 올리기 어렵다고 보는 이유 (검증된 규칙에서 나온 추론 — UNVERIFIED):**
  1. TWA 는 Custom Tabs 를 제공하는 브라우저(보통 Chrome)가 기기에 있어야 뜬다. Pleos Connect 에 그런 브라우저나 Google 서비스가 있다는 공식 문구를 찾지 못했다(2026-04-30 보도자료에 Google 언급 없음). 없으면 TWA 는 켜지지 않거나 WebView 대체 경로에 의존.
  2. Pleos 심사는 **호환 모드 금지 · 해상도 변경 시 상태 유실 금지 · 세로/가로(1영역/2영역) 두 레이아웃 대응**을 요구한다(§2·§4). 폰용 래퍼가 AAOS 에서 호환 모드로 뜨면 불합격 사유.
  3. 심사 등록 증빙에 "웹 도메인 검증" 항목이 있다 — 웹 연결 앱을 염두에 둔 것일 수 있으나 추론일 뿐.

---

## 1. 공식 포털 · SDK · 스토어 · 등록 — VERIFIED

| 항목 | 내용 | 출처 |
|---|---|---|
| 개발자 포털 | **Pleos Playground** — Discover / Develop / Documents / Distribute / My Project, 헤더에 Login. 흐름: Plan → Use SDKs & APIs → Develop → Publish | https://pleos.ai/playground |
| 문서 사이트 | document.pleos.ai (영문 /en/, 공개 열람 가능) | https://document.pleos.ai/en/api-reference/connect-sdk-pleos/ |
| 스토어 이름 | **Pleos App Market** — "any developer can develop and release apps"(누구나 개발·출시 가능) 취지. 2026년부터 Hyundai·Kia·Genesis 의 Pleos Connect 에 순차 선탑재 | https://pleos.ai/playground/discover/app-market |
| 수익 모델(공식 소개) | 디지털 콘텐츠 결제·구독, 충전/주차/주유 결제 연동, 주행 환경 맞춤 광고, 다운로드·사용 통계 제공 | 같은 페이지 |
| 연락처 | partnership@pleos.ai (유일하게 공개된 창구) | 같은 페이지, 문서 footer |
| SDK 목록 | Vehicle SDK(상태 조회·제어), NaviHelper(경로 안내), SpeechToText, TextToSpeech, ADAS, Fused Location + Fleet API, Vehicle Data API | https://document.pleos.ai/en/api-reference/connect-sdk-pleos/ |
| SDK 버전(환경설정 페이지) | Vehicle 2.3.0 · NaviHelper 2.2.7 · TTS 3.2.1 · STT 3.2.1 · ADAS 4.2.0 · Fused Location 1.1.1 | https://document.pleos.ai/en/docs/connect/guide/getting-started/application-development/setup-application-development-environment |
| 개발 요건 | **minSdk 28 이상 필수**(차량 사이버보안: 서명키 rotation/lineage), Gradle 8.0+, Java/Kotlin, 에뮬레이터 기본 언어 한국어 | 같은 페이지 |
| 에뮬레이터 | Android Studio AVD(Automotive), **API 34**, cold boot 필수(quick boot 이면 VHAL 불가). **시스템 이미지 URL 비공개 → partnership@pleos.ai 에 요청** | https://document.pleos.ai/en/docs/connect/guide/getting-started/application-development/setup-connect-sdk-emulator |
| 플랫폼 | Pleos Connect = "Android Automotive 기반 SDV 인포테인먼트 플랫폼" | https://document.pleos.ai/en/docs/connect/guide/connect |
| API 호환성 | 호환성 표: SDK-Vehicle "차종별 상이 → `checkXXXCapability` 로 확인", NaviHelper·GleoAI "Fully compatible", **Fused Location·ADAS "Not supported"**(SDK 개요엔 문서가 있으나 탑재 차량 호환표에선 미지원 — 두 번 읽어 같은 결과). AAOS 차량 속성 50여 개 read-only, 전 차종 공통 | https://document.pleos.ai/en/docs/pleos-only/vehicle-app-planning-guide/api-compatibility-availability |
| 패키지 | 업로드 **APK 600MB 미만** | https://document.pleos.ai/en/docs/pleos-only/distribute/app-review-guide/review-app-registration-info |

**확인 못 한 것(로그인 뒤 / 공개 문서에 없음):** 개발자 계정 유형(개인 vs 법인), 등록비, 심사 소요 기간·단계, 수수료율, 지역(한국 외) 배포 범위, `docs-appmarket/intro` 는 404. 실제 등록 절차는 "My Project"(로그인) 안에 있는 것으로 보인다.

### 출시 상황 — VERIFIED (그룹 공식 뉴스룸)
- Pleos Connect 발표 2026-04-30: 2026년 5월 신형 그랜저(국내) 첫 탑재, 유럽은 IONIQ 3, 2030년 2천만 대 목표. 초기 파트너 NAVER·YouTube·Spotify·genie 등. 이 보도자료엔 Google Play/GMS 언급 없음. — https://www.hyundai.com/worldwide/en/newsroom/detail/hyundai-motor-group-redefines-in-vehicle-experience-with-%E2%80%98pleos-connect%E2%80%99-next-generation-infotainment-system-0000001168
- 2026-09 포티투닷: App Market 신규 7종(카카오내비·what3words·Make My Day / 멜론·Radioline·RaiDIO Auto·Pickle) 추가, 총 18종. 탑재 차종 디 올 뉴 그랜저·더 올 뉴 아반떼. **날씨 앱 없음.** — https://www.hyundaimotorgroup.com/ko/news/42dot-pleos-connect-app-market-new-apps

---

## 2. 지원 앱 형태 — VERIFIED (단, "없음"이 대부분)

- 공식 문서가 전제하는 형태: **네이티브 Android APK** (Pleos Connect SDK + 표준 AAOS API). CarUxRestrictions 등 AAOS 표준 API 사용을 안내.
- **WebView / 웹앱 / PWA / TWA / Pleos 전용 웹 런타임**: 조사한 Pleos 페이지(개요, 플래닝 가이드 intro·driving-restriction·driver-distraction·app-structure·api-compatibility·security-privacy, 개발자 가이드 intro·driving-restriction, 심사 가이드 5종) 어디에도 **언급 없음**. site 검색도 결과 없음. → **허용 여부 미확인**.
- **Car App Library(androidx.car.app) 템플릿**: Pleos 문서에 **언급 없음**. Pleos Connect 가 템플릿 호스트를 제공하는지 미확인.
- 화면 구조: 좌측은 Driving view(클러스터 역할) 고정, 가운데·오른쪽에 **최대 2개 앱 동시 배치**. 세로(한 영역)·가로(두 영역 확장) 모두 대응해야 함. 불필요한 상시 백그라운드 실행 지양. — https://document.pleos.ai/en/docs/pleos-only/vehicle-app-planning-guide/app-structure-screen-model
- **앱 카테고리 8종**(같은 페이지): Maps/Navigation · Mobility Services · Lifestyle · Entertainment · Business · Music/Audio · Kids · Social/Communication. 카테고리 선택이 주행 중 허용 기능을 결정.
  - 주행 중 예외: Maps/Navigation(경로 안내·교통·간략 지도·음성 안내·목적지 검색), Mobility Services(차량 관리·위치 기반 정보·충전소/주유소/주차 검색), Music/Audio(재생 제어·스트리밍·라디오).
  - 그 외(Lifestyle·Entertainment·Business·Kids·Social)는 "원칙적으로 주행 중 사용 제한".
  - **"날씨·정보 앱은 Lifestyle 에 들어갈 것"은 문서 문구가 아니라 추론(UNVERIFIED).**
- 심사: "앱 카테고리가 선언한 서비스 내용과 일치해야 함" — https://document.pleos.ai/en/docs/pleos-only/distribute/app-review-guide/review-functionality-performance-stability

---

## 3. 운전자 주의 분산 규칙 — VERIFIED

### 3-1. 주행 상태 판정 · 지역별 정책
출처: https://document.pleos.ai/en/docs/pleos-only/vehicle-app-planning-guide/driving-restiction-policy
- 판정 입력: **기어(P 여부) + 속도(0 / >0)**. 세 상태:
  - Parking(P, 0) → 사용 허용
  - Idling(P 아님, 0) → **DO 미선언 앱 종료**
  - Driving(P 아님, >0) → **DO 미선언 앱 종료**
- 지역 3단계(주행/정차 중):
  - 북미: 키보드·다이얼패드·미디어 설정·디지털키·영상·QR 로그인 차단, 검색은 음성만
  - 유럽: 키보드·다이얼패드 허용, 영상·디지털키·미디어 설정 차단, 내비 검색 허용
  - 기타 지역(한국 포함으로 추정 — **추론**): 키보드·다이얼패드·검색 허용, 영상·디지털키만 차단
- DO 선언 자격(어떤 카테고리가 DO 를 선언할 수 있는지, 승인 필요 여부)은 **공개 문서에 없음** → partnership@pleos.ai 문의 대상.

### 3-2. 구현 API
출처: https://document.pleos.ai/en/docs/pleos-only/vehicle-app-developer-guide/driving-restriction-development-guide
- 표준 AAOS **`CarUxRestrictionsManager`** 로 `CarUxRestrictions` 수신, `CarDrivingStateManager` 참조 가능. Pleos 전용 주행상태 API 는 별도로 제시되지 않음(Vehicle SDK 로 속도 등 조회는 가능 — 개발자 가이드 intro).
- 매니페스트에 DO 선언. DO 선언 앱은 `isRequiresDistractionOptimization()` 와 `getActiveRestrictions()`(예: `UX_RESTRICTIONS_NO_VIDEO`)를 확인해 기능을 꺼야 함.
- 시험: adb 로 VHAL 이벤트 주입.
- 개발자 가이드 하위: audio focus, CCP(로터리 컨트롤러) 대응, IME 창 리사이즈, TTS pre-roll, 내비·음악 앱 가이드, 보안, 업데이트 — https://document.pleos.ai/en/docs/pleos-only/vehicle-app-developer-guide/intro

### 3-3. 디자인 가이드 수치
출처: https://document.pleos.ai/en/docs/pleos-only/vehicle-app-planning-guide/driver-distraction-guideline , https://document.pleos.ai/en/docs/connect/guide/docs-design/Introduction/intro
- 주행 중 금지: 영상, 게임, 긴 텍스트 스크롤, 복잡한 폼 입력, 웹 서핑, 피트니스. **애니메이션·움직이는 이미지 금지**, 자동 스크롤 금지, 요소는 사용자 조작에만 반응.
- 이미지 최소화 — 예외: 정적 배경 1장, 아이콘, 차선/분기 안내 이미지.
- 터치 타깃 ≥ **12.5×12.5 mm**, 간격 ≥ **4 mm**, 원하는 기능까지 **2~3 탭**.
- 한 번 보기 **1~2초** 안에 이해, 입력 후 반응 ≤ **0.25초**.
- 대비 ≥ **4.5:1**, 핵심 글자 높이 ≥ **4 mm**·일반 ≥ **3 mm**, 메시지 최대 **3줄**, 줄당 80자, 문장 최대 120자(영문)/24단어.
- 텍스트 입력은 프리셋·최근 항목·음성 우선. 한 손 조작. 주야간 밝기·대비 자동 조정.

### 3-4. 심사 가이드의 주의 분산 절
출처: https://document.pleos.ai/en/docs/pleos-only/distribute/app-review-guide/review-driver-distraction-elements
- 미디어 앱(영상·게임·**브라우저**)은 주행 중 실행·사용 불가, 주행 시작 시 UI 숨김, 헤즈업 알림 금지(주행 관련만 허용). 브라우저는 프로필 잠금 없이는 비밀번호·결제정보 저장 금지.
- 정보/날씨 앱에 대한 별도 조항 없음 — 디자인 가이드를 따르라고 참조.

---

## 4. 심사 기준 — VERIFIED
개요: https://document.pleos.ai/en/docs/pleos-only/distribute/app-review-guide/ — 5개 축(콘텐츠 안전·기능/성능·주의 분산·등록 정보·개인정보/보안). 주행 안전에 위험하다고 판단되면 거절 가능.

- **기능·성능**(review-functionality-performance-stability): 설치·삭제 오류 없음, 크래시·재부팅 유발 금지, 더미 데이터 금지, safe zone(inset·키보드·시스템바) 준수, 끊김/프레임 드롭 금지, 입력 반응 ≤0.25초, **실행 ≤10초, 콘텐츠 로드 ≤10초, 버튼 반응 ≤2초**(2초 넘으면 진행 표시), 백그라운드 복귀 시 상태 복원, 해상도 맞춤(호환 모드 금지, 약간의 레터박스만 허용), **Vehicle SDK 권한은 App Market 과 사전 합의된 것만** — 미승인 권한 선언 시 불합격.
- **콘텐츠 안전**(review-content-safety): 위험 운전 조장, 성적·폭력·불법·도박·아동 유해 금지, 연령 등급 설문 정직 기재. 날씨·재난 경보·뉴스·외부 링크·결제에 대한 조항 없음.
- **등록 정보**(review-app-registration-info): 앱 이름 30자(영문) 이내, 아이콘 512×512 PNG/JPEG ≤1MB, 스크린샷 2~8장(2560×1380 / 1700×1212 / 840×1212, 각 ≤8MB), **대상 국가 언어로 메타데이터**, 제3자 IP·정부 인가/제휴·**웹 도메인 검증**·의료기관 제휴 시 증빙 서류, 로그인 앱은 심사용 일반 계정 제공.
- **개인정보·보안**(review-user-privacy-security): 권한 최소화, 수집 항목·목적·보존 기간 고지, 명시적 동의 버튼, 개인정보처리방침 접근성, GDPR 등 준수, **위치 데이터 서비스는 등록(신고) 검증을 요구할 수 있음 — 허위 서류 시 정지**, 동의 철회 시 즉시 사용 중단·삭제.
- **보안·개인정보 기획**(vehicle-app-planning-guide/security-privacy): 차주 변경 대비 쉬운 로그아웃·계정 전환, 토큰은 Keystore, PII 로그 마스킹, 주행 행동 데이터와 마케팅 분리.

---

## 5. Google — Android for Cars / AAOS 일반 — VERIFIED

| 항목 | 내용 | 출처 (Last updated) |
|---|---|---|
| 카테고리 | Media-audio, Communication(Auto), **Navigation, POI, IoT, Weather** (Auto+AAOS, 주행 중 가능), **Video(AAOS)·Games·Browsers(AAOS)는 parked-only** | https://developer.android.com/training/cars (2026-09-22) |
| 날씨 앱 | **정식 카테고리**. `androidx.car.app.category.WEATHER` 를 CarAppService intent-filter 에 선언. 템플릿 **MapWithContentTemplate**(앱이 그린 지도 옆에 목록 등). 지도용 권한 `androidx.car.app.MAP_TEMPLATES`(날씨 전용) 또는 `NAVIGATION_TEMPLATES`(내비 겸용) 중 하나 | https://developer.android.com/training/cars/apps/weather (2026-05-28) |
| Car App Library | 템플릿 기반, **커스텀 UI 불가(지도 surface 만 예외)**; 대상 카테고리 Navigation·POI·IoT·Weather. AAOS 에서는 템플릿 호스트 필요 | https://developer.android.com/training/cars/apps (2026-06-18) |
| 날씨 품질 기준 | WE-1 현재/지정 위치 날씨 필수 · WE-2 지도 타일 범례 ≤3개(다중 범례면 색 ≤3) · WE-3 읽기 쉬운 예보 아이콘 · WE-4 템플릿으로 예보 간격 사용자 설정 금지 · WE-5 한 화면 날씨 지도 주석 종류 ≤5 · IN-1 알림은 현재 위치/경로/목적지의 임박한 기상 경보처럼 운전 관련일 때만 · SA-1 애니메이션 금지(주차 중 예외 일부) · IU-1 이미지 금지(정적 배경 1장 등 예외) · 응답 ≤2초·실행/로드 ≤10초. Tier 2(Car optimized) | https://developer.android.com/docs/quality-guidelines/car-app-quality?category=weather (2026-09-14) |
| Parked 앱 | Video·Games·Browsers. `distractionOptimized` **꺼야 함**, 주행 시작 시 **시스템이 activity 차단** | https://developer.android.com/training/cars/parked (2026-07-13) |
| 브라우저 | `android.intent.category.APP_BROWSER` 로 표시, 프로필 잠금 없이는 비밀번호·결제정보 저장 금지. Play 배포는 현재 internal testing 만, 이후 확대 | https://developer.android.com/training/cars/parked/browser (2026-09-08) |
| POI 앱 | `androidx.car.app.category.POI`(PARKING·CHARGING 은 v1.3 부터 deprecated). 템플릿 `PlaceListMapTemplate`(호스트가 그린 지도, POI 전용) 또는 `MapWithContentTemplate`, 권한 `androidx.car.app.MAP_TEMPLATES`. Auto+AAOS | https://developer.android.com/training/cars/apps/poi (2026-09-08) |
| Car ready mobile apps | 기존 폰 앱 중 **영상·게임·브라우저만**, **Google built-in** AAOS 차량의 Play 로 배포, **초대제**(관심 양식으로 추천). 주행 시작 시 자동 숨김·정지. WebView 언급 없음 | https://developer.android.com/training/cars/car-ready-mobile-apps (2026-07-13) |

- **WebView 기반 앱이 주행 중 허용되는가**: Google 공식 페이지에서 **직접적 문구를 찾지 못함**. 구조상 추론(UNVERIFIED): 주행 중 허용 카테고리(Nav/POI/IoT/Weather)는 Car App Library 템플릿 전용이라 커스텀 View(=WebView) 를 둘 자리가 없고(지도 surface 제외), WebView 전면 UI 는 parked 카테고리(브라우저 등)로만 들어갈 수 있다.
- 주의: Google 규칙은 **Google Play(Google built-in 차량) 배포 기준**이다. Pleos App Market 이 이 카테고리 체계·템플릿 호스트를 따르는지는 Pleos 문서에서 확인되지 않았다 — Pleos 는 자체 8카테고리 체계를 쓴다.

---

## 6. VERIFIED / UNVERIFIED 구분

### VERIFIED (이번 세션에 공식 페이지를 읽음)
- pleos.ai/playground, pleos.ai/playground/discover/app-market, document.pleos.ai 의 API 개요·환경설정·에뮬레이터·Connect 개요·플래닝 가이드(intro, driving-restriction-policy, driver-distraction-guideline, app-structure-screen-model, api-compatibility-availability, security-privacy)·개발자 가이드(intro, driving-restriction-development-guide)·심사 가이드(개요+5종)·UI 디자인 가이드 intro
- 현대차그룹 뉴스룸 2건(2026-04-30 Pleos Connect, 2026-09 앱마켓 7종)
- developer.android.com: training/cars, cars/apps, cars/apps/weather, cars/apps/poi, quality-guidelines(weather), cars/parked, cars/parked/browser, cars/car-ready-mobile-apps
- 읽지 않은 것: Google POI 품질 기준(car-app-quality?category=poi), Pleos 플래닝 가이드의 platform-api-architecture·pleos-connect-sdk-api·performance-resource-mgmt, 개발자 가이드의 app-security·app-update 하위 페이지

### UNVERIFIED (뉴스·추론·검색 요약만)
- "모바일 대비 단계적 검증 절차"(개인정보·보안·안전 엄격 심사) — 한국금융신문 등 기사 요약: https://www.fntimes.com/html/view.php?ud=2026090711124627537492587736_18
- 스타뉴스 2026-07-23 "서드파티 앱 생태계 확장" 기사 — https://www.starnewskorea.com/en/business-life/2026/07/23/2026072214461811448
- 날씨 앱 = Lifestyle 카테고리(추론), 한국 = "기타 지역" 정책(추론), WebView 는 주행 중 불가(구조적 추론)
- Pleos Connect 에 Google Play/GMS(FCM, Google Maps)가 있는지 — 공식 확인 없음(보도자료에 언급 없음)
- 개인/법인 개발자 계정 여부, 등록비, 수수료, 심사 기간 — 공개 문서에 없음(로그인 뒤 My Project 추정)

### 공개 문서의 빈칸 → partnership@pleos.ai 에 물을 것
1. WebView/웹앱/TWA APK 가 App Market 심사 대상으로 허용되는가
2. Car App Library 템플릿 호스트(날씨 카테고리 포함) 지원 여부
3. 날씨·지구 정보 앱의 카테고리 배정, DO 선언 가능 여부와 승인 절차
4. 개발자 계정 자격(개인/법인), 에뮬레이터 이미지 제공 조건
5. 위치 데이터 "등록 검증"이 한국 위치정보사업 신고를 뜻하는지
6. Pleos Connect 에 Custom Tabs 제공 브라우저(Chrome 등)·Android System WebView 가 있는지 / TWA 가 동작하는지
7. 폰용 레이아웃 앱이 호환 모드로 뜰 때 심사 처리(호환 모드 금지 조항 적용 범위)
