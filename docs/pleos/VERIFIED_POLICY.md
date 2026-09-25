# Pleos / Android Automotive 정책 확인 기록

> 작성 2026-09-25. V38.1 지시서 §4 "추측하지 말고 공식 문서를 직접 확인하고 기록하라"에 따른 기록.
> **확인한 것과 확인하지 못한 것을 나눠 적는다. 확인하지 못한 항목을 근거로 설계를 확정하지 않는다.**

## 1. 확인하지 못한 것 — Pleos 공식 문서 (UNVERIFIED)

| 대상 | 시도 | 결과 |
|---|---|---|
| `https://pleos.ai/playground` | 2026-09-25 직접 조회 | ❌ 작업 컨테이너의 네트워크 정책이 도메인을 막음 (`EGRESS_BLOCKED`) |
| `https://document.pleos.ai/en/product-appmarket` | 2026-09-25 직접 조회 | ❌ 같은 이유로 막힘 |
| `https://document.pleos.ai/en/docs/pleos-only/vehicle-app-developer-guide/adb-command-reference-guide` | 검색 결과 제목만 확인 | 본문 미확인. 제목상 "driving-restriction controls"용 ADB 명령이 있다고 함 |
| `https://document.pleos.ai/en/api-reference/connect-sdk-pleos/` | 검색 결과 제목만 확인 | 본문 미확인 |

따라서 다음은 **모두 미확인**이다:

- Pleos App Market에 개인·소규모 사업자가 등록할 수 있는지 (2026-07 조사 때도 미확인, `docs/research-2026-07.md:689-692`)
- Pleos가 Google Play의 AAOS 정책(아래 §2)을 그대로 따르는지, 자체 기준이 있는지
- Pleos에서 WebView 앱이나 WebView 화면을 허용하는지, 운전 중에 허용하는지
- Pleos의 운전 상태 신호 이름과 수신 방법 (AAOS 표준 `CarUxRestrictionsManager`인지, Pleos Vehicle SDK 별도 API인지)

**다음 확인 담당: PD** — 사무실 PC처럼 pleos.ai에 접속되는 환경에서 Playground에 가입해
위 4개를 확인하고 이 파일의 §1을 채운다. 막히면 `partnership@pleos.ai`로 문의한다.

## 2. 확인한 것 — Google Android for Cars 공식 문서 (VERIFIED, 2026-09-25 조회)

Pleos Connect는 Android Automotive OS(AAOS) 기반이다 (`docs/research-2026-07.md:686`).
Pleos가 따로 정하지 않는 한 AAOS의 기본 동작은 아래와 같다.

### 2-1. 운전 중 Activity는 기본적으로 가려진다
출처: <https://developer.android.com/training/cars/parked/automotive-os> (페이지 최종 수정 2026-09-08 UTC)

> "By default, activities cannot be used or launched while UX restrictions are active."
> "If an activity in your app is _Resumed_ when UX restrictions become active, it is obscured by an activity owned by the OS."
> "The only value provided by `CarUxRestrictions` that your app refers to is the return value of `isRequiresDistractionOptimization()`."

→ 주차 전용(parked) 앱은 `distractionOptimized` 메타데이터를 **넣으면 안 되고**, 운전이 시작되면 OS가 화면을 덮는다.

### 2-2. 날씨 앱은 Car App Library 템플릿으로 만든다
출처: <https://developer.android.com/training/cars/apps/weather> (2026-05-28 UTC),
<https://developer.android.com/training/cars/apps> (2026-06-18 UTC)

- Car App Library가 지원하는 분류: 내비게이션, POI, IoT, **날씨**
- "The library provides a set of templates designed to meet driver distraction standards" — 운전 중 제약은 템플릿과 차량(host)이 강제한다
- 날씨 앱은 `androidx.car.app.category.WEATHER` 선언, 지도는 `MapWithContentTemplate`
- 지도 권한은 `MAP_TEMPLATES`와 `NAVIGATION_TEMPLATES` 중 하나만 (둘 다 넣으면 거절)

### 2-3. 품질 기준 (심사 기준)
출처: <https://developer.android.com/docs/quality-guidelines/car-app-quality> (2026-09-14 UTC)

- **PE-1** (AAOS 전용): "with the exception of providing setup, settings, and sign-in flows while parked, the app must not provide any functionality through its own activities."
- **WE-1** 현재 위치나 사용자가 정한 위치와 관련된 날씨 콘텐츠
- **WE-2** 지도 타일 범례는 최대 3개, 복잡한 범례 금지
- **WE-3** 예보는 읽기 쉬운 아이콘·기호로
- **WE-4** 예보 간격을 템플릿으로 사용자 설정하게 하지 않는다
- **WE-5** 한 화면의 날씨 지도 표시 종류는 최대 5개
- **DD-2 / DD-3** 주차 전용 앱: 운전 중에는 실행되거나 보이면 안 되고, 소리도 멈춘다

### 2-4. WebView
위 세 페이지 본문에는 WebView 전용 규칙이 없다. 검색 요약에는 "AAOS에서 WebView는 설정·로그인 화면에만 허용"이라는 문장이 있었지만, **1차 출처 본문에서 확인하지 못했으므로 근거로 쓰지 않는다.**
다만 §2-3 PE-1만으로도 Google Play 기준에서는 "주차 중 설정·로그인을 빼면 앱 자체 화면(WebView 포함)으로 기능을 제공하면 안 된다"는 결론이 나온다.

## 3. 이 기록이 코드 설계에 주는 결론

1. **운전 중 화면의 정본은 Car App Library 템플릿이다** (Google Play 기준, Pleos 미확인).
   이 저장소의 HTML/JS Pleos 화면(`prototype/pleos.html`)은 운전 중 화면으로 그대로 제출하지 못할 수 있다.
   그래서 이 화면은 **운전 상태를 모르면 항상 운전 중 최소 화면**으로 뜨고, 안전 규칙은 네이티브 템플릿 앱에서도 같은 표로 옮겨 쓸 수 있게
   순수 데이터 표(`prototype/js/pleos/actions.js`)로 둔다.
2. **운전 상태는 차량(host)이 알려준 값만 믿는다.** 웹 화면은 host 연결이 없으면 `UNKNOWN`이고, `UNKNOWN`은 운전 중과 같이 취급한다.
3. WE-2·WE-5 때문에 운전 중 지도에 여러 레이어를 겹치지 않는다. 운전 중 화면은 현재 날씨, 특보·재난, 길안내 연결만 둔다.
4. Pleos 전용 규칙이 확인되면 §1을 채우고, 위 결론 중 바뀌는 항목을 `docs/pleos/SOURCE_SURVEY.md`와 감사 보고서에 반영한다.
