# EARTHUS 안드로이드 앱 (TWA) — `net.earthus.app`

> 2026-09-24 · 지시서 [`docs/APP-ANDROID-CHROME-NEWTAB-DIRECTIVE-2026-09-24.md`](../../docs/APP-ANDROID-CHROME-NEWTAB-DIRECTIVE-2026-09-24.md) §3-1·§3-2·§3-6·§3-7 · Phase 1 개발 몫.
> PD 결정(2026-09-24): 개인사업자 · 앱 이름 `EARTHUS` · 패키지 `net.earthus.app` · 알림 포함 · 위치는 '내 위치'를 누를 때만 · 위젯 없음 · **Play 결제(Phase 2)는 구독료 결정 뒤로 보류.**

## 화면에서 무엇이 보이나

- 홈 화면에 **EARTHUS** 아이콘 하나. 적응형 아이콘이다 — 배경 `#0A0A0A`, 전경 v5 모노그램(흰 획). Android 13+ '테마 아이콘'을 켜면 같은 모노그램이 테마 색으로 칠해진다.
- 누르면 검은 스플래시(앱 아이콘) → **지금의 v1 지구 `https://earthus.net/?src=twa`** 가 전체 화면으로 뜬다. v1 → v2 전환·로그인·'내 위치'는 웹 그대로다.
- 상태바·내비게이션바는 `#02060C`(거의 검은 남색) 하나로 칠한다.
- ⚠️ **`assetlinks.json` 이 운영에 올라가기 전에는 화면 위에 주소 표시줄이 보인다(Custom Tab 모드).** 앱이 망가진 것이 아니라 '이 사이트 주인이 이 앱을 인정했다'는 증명이 아직 없어서다. 아래 'PD 할 일 2' 뒤에 사라진다(Android 15+ 는 재검증 반영에 최대 7일).

## 폴더

| 경로 | 무엇 | 손으로 고치나 |
|---|---|---|
| `twa-manifest.json` | **정본 설정.** 패키지·이름·색·start_url·폴백·알림·위치 위임 | 예 → 고친 뒤 '다시 만들기' |
| `tools/generate-project.mjs` | 설정 → 안드로이드 프로젝트 생성기(Bubblewrap core 1.25.0 + EARTHUS 덧입힘) | 예 |
| `tools/overlay/` | 생성 뒤 덮어쓰는 파일: 런처(`src=twa`)·`EntryMarker`·단위 시험·적응형 아이콘 XML | 예(정본) |
| `app/`, `gradle/`, `build.gradle`, `settings.gradle`, `gradle.properties`, `gradlew*` | **생성물.** 커밋은 하지만 손으로 고치지 않는다 — 고칠 것은 overlay 나 생성기에 | 아니오 |
| `store/play-icon-512.png` | Play 고해상 아이콘 512×512, **꽉 찬 정사각형**(모서리는 Play 가 깎는다) | 아니오(생성기가 만든다) |
| `tools/make-dev-test-key.ps1` | 로컬 **시험** 키(ADB 설치용, Play 용 아님) | — |
| `tools/make-upload-key.ps1` | **PD 용** Play 업로드 키 만들기(대화형) | — |
| `tools/make-assetlinks.mjs` (+ `.test.mjs`) | `assetlinks.json` 만들기(지문 여러 개 · Play Console 스니펫) | — |

⚠️ 이 폴더에서 `bubblewrap init` / `bubblewrap update` / `bubblewrap build` 를 돌리지 않는다. 템플릿 기본값으로 되돌아가 **`src=twa` 런처·App Links 제외·적응형 아이콘이 사라지고**, 프로젝트 폴더 안에 `android.keystore` 를 만들려 한다.

## 정한 값과 이유

| 항목 | 값 | 이유 |
|---|---|---|
| 패키지 | `net.earthus.app` | D3. **영구다**(삭제·재사용 불가) |
| 이름 | `EARTHUS` (런처·앱 이름) | D3. 웹 매니페스트의 소문자 `earthus` 를 덮어쓴다 |
| host / scope | `earthus.net` / `/` | v1·v2(`/v2/`, `/Intelligence`)가 같은 출처라 인증 하나로 둘 다 덮인다 |
| start_url | `/?src=twa` | 앱 안 표식(§3-4 신호 1) |
| 모든 진입 URL | `src=twa` 를 **맨 앞**에 붙인다 | `LauncherActivity.getLaunchingUrl()` — 아이콘·App Link·알림·공유·바로가기 모두 이 액티비티를 거친다. 이미 있으면 그대로, 다른 `src` 값은 뒤에 남긴다 |
| theme / navigation 색 | `#02060C` | v1 웹 매니페스트 `theme_color` 값(Bubblewrap init 이 읽는 정본). 웹 쪽 `meta theme-color` 는 `#000000`(v1)·`#030608`(v2)로 서로 달라 — 통일은 웹 몫(§3-8-5) |
| 스플래시 배경 | `#000000` | 매니페스트 `background_color` |
| 방향 | `any` | 매니페스트 그대로 |
| Chrome 없을 때 | `customtabs` | **webview 폴백 금지** — Google 로그인·Play 결제가 안 된다(R10). APK 에 `INTERNET` 권한이 없는 것이 그 증거다(webview 폴백일 때만 붙는다) |
|  | (2026-09-24 정정) | 바로 위 'INTERNET 이 없는 것이 증거' 문장은 틀렸다. Bubblewrap 1.25.0 템플릿에는 폴백 종류와 상관없이 `INTERNET` 이 없다(적대 검수에서 템플릿을 grep 해 확인). 실제 증거는 APK 리소스 `string/fallbackType = customtabs`, LauncherActivity 의 `FALLBACK_STRATEGY` 메타데이터, 그리고 customtabs 가 아니면 멈추는 `generate-project.mjs` 다. `WebViewFallbackActivity` 선언은 템플릿에 늘 들어 있지만 폴백 전략이 customtabs 라 불리지 않는다 |
| 알림 | 위임 켬 + `POST_NOTIFICATIONS` | D5. 알림 본문의 기관·HH:MM KST 는 서버 `push-tick` 몫(웹/서버 스트림) |
| 위치 | 위치 위임 켬(`ACCESS_FINE/COARSE_LOCATION` 이 라이브러리에서 합쳐진다) | D6. 권한은 웹에서 '내 위치'를 누를 때만 묻는다. 배경 위치 없음 |
| App Links | `https://earthus.net/*`, 단 `/admin.html`·`/studio.html`·`/legal/*` 제외 | 매니페스트 제외(`uri-relative-filter-group`)는 **Android 15(API 35)+ 에서만** 된다. 14 이하에서는 세 경로도 앱으로 오므로 `LauncherActivity.launchTwa()` 가 브라우저 Custom Tab(주소창 있음)으로 돌려 연다. ⚠️ 14 이하에서는 링크를 누를 때 '이 앱으로 열기'가 먼저 잡히므로 한 번 앱을 거쳐 간다(실기기 확인 필요) |
| targetSdk / compileSdk | 36 | 2026-08-31 부터 필수 |
| minSdk | 21 | Bubblewrap 기본값 그대로. **D21(최소 버전·WebGL 필터) 미결** — 실기기 결과로 PD 가 정한다 |
| Play 결제 | **없음** | Phase 2 보류. `twa-manifest.json` `_todo_phase2_playBilling`·`app/build.gradle`·`DelegationService.java` 에 TODO 자리 |
| 위젯 | 없음 | D8 |

## 준비 (한 번)

- JDK 17: `C:\Program Files\Eclipse Adoptium\jdk-17.0.20.101-hotspot`
- Android SDK: `%LOCALAPPDATA%\Android\Sdk` — `cmdline-tools\latest`, `platform-tools`, `platforms;android-36`, `build-tools;36.1.0` (첫 빌드 때 Gradle 이 `build-tools;35.0.0` 을 스스로 더 받는다)
- Node 18+ (생성기·assetlinks 도구)
- Bubblewrap core — **저장소 밖**(또는 git 무시 폴더)에 설치:
  ```powershell
  npm i --prefix "D:\## APP\EARTHUS v2_APP\build\app-build\android\bw" @bubblewrap/core@1.25.0
  ```

## 다시 만들기 (설정을 바꿨을 때만)

```powershell
node apps\android-twa\tools\generate-project.mjs `
  --modules "D:\## APP\EARTHUS v2_APP\build\app-build\android\bw\node_modules" `
  --work    "D:\## APP\EARTHUS v2_APP\build\app-build\android\gen"
```
(2026-09-24 적대 검수 추가) 빌드한 적이 있으면 **먼저 `apps\android-twa\gradlew.bat --stop`** 으로 Gradle 데몬을 끈다. 데몬이 `app\build` 를 잡고 있으면 생성기가 아무것도 지우지 않고 종료 코드 3 으로 멈춘다.
생성기는 `apps/android-twa/` 안의 생성물만 지우고 다시 쓴다. 로고는 `prototype/logo/*.svg` 를 래스터화만 한다(새로 그리지 않는다). 네트워크로 `https://earthus.net/manifest.webmanifest` 를 한 번 읽는다 — 그래서 웹 매니페스트가 바뀐 뒤 다시 만들면 `app/src/main/res/raw/web_app_manifest.json` 에 차이가 난다(ChromeOS·Quest 용 사본, 정상).
`app/src/main/res/xml/shortcuts.xml` 은 빌드(`generateShorcutsFile`)가 매번 다시 쓰므로 git 이 추적하지 않는다.

## 빌드

```powershell
$env:JAVA_HOME   = "C:\Program Files\Eclipse Adoptium\jdk-17.0.20.101-hotspot"
$env:ANDROID_HOME = "$env:LOCALAPPDATA\Android\Sdk"
cd apps\android-twa
.\gradlew.bat --no-daemon assembleRelease bundleRelease testReleaseUnitTest
```
- 결과: `app\build\outputs\apk\release\app-release.apk`, `app\build\outputs\bundle\release\app-release.aab` (git 무시)
- 서명 키: 기본은 `%USERPROFILE%\.earthus-android\dev-keystore.properties`(로컬 시험 키). **Play 에 올릴 AAB** 는 업로드 키로:
  ```powershell
  $env:EARTHUS_KEYSTORE_PROPS = "$env:USERPROFILE\.earthus-android\upload-keystore.properties"
  .\gradlew.bat --no-daemon bundleRelease
  ```
- properties 파일이 없으면 release 가 서명 없이 나온다(설치 불가) — 비밀번호를 `build.gradle` 에 적지 않는다.

## 시험

```powershell
# 앱 안 표식 규칙(EntryMarker) — JUnit 7건 (2026-09-24 정정: 적대 검수에서 1건 더해 8건)
.\gradlew.bat --no-daemon testReleaseUnitTest
# assetlinks 생성기 — node:test 9건
node --test apps\android-twa\tools\make-assetlinks.test.mjs
# 서명·매니페스트 확인
& "$env:ANDROID_HOME\build-tools\36.1.0\apksigner.bat" verify --print-certs app\build\outputs\apk\release\app-release.apk
& "$env:ANDROID_HOME\build-tools\36.1.0\aapt2.exe" dump badging app\build\outputs\apk\release\app-release.apk
```

## 폰에 깔아 보기 (ADB)

1. 폰: 설정 → 휴대전화 정보 → 빌드 번호 7번 → 개발자 옵션 → USB 디버깅 켬
2. ```powershell
   & "$env:ANDROID_HOME\platform-tools\adb.exe" devices
   & "$env:ANDROID_HOME\platform-tools\adb.exe" install -r "D:\## APP\EARTHUS v2_APP\build\app-build\android\earthus-1.0.0-devtest-release.apk"
   ```
3. 지금은 주소 표시줄이 보인다(assetlinks 없음 — 정상). 시험 키 지문을 넣은 assetlinks 를 올리면 사라진다. **시험 키 지문은 운영 assetlinks 에 넣지 않는 것을 권한다** — 올릴 거면 1차 시험 기간에만.
   (2026-09-24 정정) 위 `earthus-1.0.0-devtest-release.apk` 는 **로컬 시험 키**로 서명돼 있다. 'PD 할 일 2'의 assetlinks 1차에는 **업로드 키** 지문만 들어가므로, 1차를 올린 뒤 주소창 없는 화면을 보려면 **업로드 키로 서명한 APK** 를 깔아야 한다(완료 기준 2 '먼저 ADB 설치본(업로드 키)'):
   ```powershell
   $env:EARTHUS_KEYSTORE_PROPS = "$env:USERPROFILE\.earthus-android\upload-keystore.properties"
   .\gradlew.bat --no-daemon assembleRelease
   & "$env:ANDROID_HOME\platform-tools\adb.exe" uninstall net.earthus.app   # 서명 키가 다르면 install -r 이 거부된다
   & "$env:ANDROID_HOME\platform-tools\adb.exe" install app\build\outputs\apk\release\app-release.apk
   ```
   Android 14 이하는 App Links 검증을 설치·업데이트 때만 한다(`docs/app-plan-2026-09-24/survey-android.md` §6 캐시 항목). assetlinks 를 올린 **뒤에** 깐다.
4. 앱 링크 상태 보기(Android 12+): `adb shell pm get-app-links net.earthus.app`

## PD 할 일 (순서대로)

1. **업로드 키 만들기** — 계정 없이 오늘 된다.
   ```powershell
   powershell -ExecutionPolicy Bypass -File apps\android-twa\tools\make-upload-key.ps1
   ```
   비밀번호를 두 번 묻는다(화면에 안 보임). 끝에 **SHA-256 지문**이 찍힌다. `%USERPROFILE%\.earthus-android\earthus-upload.jks` 와 `upload-keystore.properties` 를 **저장소 밖 두 곳**에 백업한다.
2. **assetlinks 1차** (업로드 키 지문만 — ADB 설치본이 전체 화면이 된다)
   ```powershell
   node apps\android-twa\tools\make-assetlinks.mjs --fp <업로드 키 SHA-256> --out assetlinks.json
   aws s3 cp assetlinks.json s3://earthus-app-seoul/app/.well-known/assetlinks.json --region ap-northeast-2 --content-type application/json --cache-control no-cache
   aws cloudfront create-invalidation --distribution-id E193CZEBLWEB56 --paths "/.well-known/assetlinks.json"
   curl -sI https://earthus.net/.well-known/assetlinks.json   # 200 · Content-Type: application/json · Location 없음
   ```
3. **Play Console** (개인 계정 — 개인사업자)
   1. 개발자 계정 등록(US$25, 1회) · 안드로이드 실기기 인증(Play Console 앱)
   2. 앱 만들기: 이름 `EARTHUS`, 기본 언어 한국어, 앱, 무료
   3. 내부 테스트 트랙에 업로드 키로 서명한 AAB 올리기 → Play App Signing 이 자동으로 켜진다
   4. **설정 → 앱 서명 → Digital Asset Links JSON 스니펫** 을 복사해 `play-console-snippet.json` 으로 저장
   5. 비공개 테스트: **테스터 12명 이상 · 14일 연속** 뒤 프로덕션 신청(2023-11-13 이후 개인 계정 요건)
   6. Data safety·콘텐츠 등급·개인정보처리방침 URL(HTML)·심사용 로그인 — 처리방침 개정(Phase 0 수집 표)이 먼저다(R3)
4. **assetlinks 2차** (Google 보유 키 3개 + 업로드 키 — 스토어 설치본까지 전체 화면)
   ```powershell
   node apps\android-twa\tools\make-assetlinks.mjs --snippet play-console-snippet.json --fp <업로드 키 SHA-256> --out assetlinks.json
   ```
   그리고 2번의 `aws s3 cp` · 무효화 · `curl` 을 다시.
5. (Phase 2, 구독료 결정 뒤) `twa-manifest.json` 에 `"playBilling": {"enabled": true}` → 다시 만들기 → 빌드.

## 이 앱이 스스로 하지 않는 것 (다른 스트림·PD 몫)

- **웹 쪽 앱 안 판정**: 웹(`billing.js`)이 `src=twa` 를 `sessionStorage` 에 적고 `history.replaceState` 로 지우는 것, `display-mode: standalone`·`android-app://` referrer 보조 신호(D17) — 웹 스트림.
- **알림 본문의 기관·HH:MM KST**(D5 선행 조건) — `push-tick` 서버 함수, PD 배포.
- **알림 탭으로 들어올 때** Chrome 이 이 런처를 거치는지는 실기기로 확인해야 한다(확인 필요). 거치지 않는 경로가 있으면 웹의 standalone 신호가 받친다.
- **삼성 인터넷 기본 갤럭시**: 스플래시 ❌ · 알림 위임 ❌(공식 지원표). 두 기기 완료 기준(Phase 1 기준 2~12).
