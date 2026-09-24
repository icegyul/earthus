# EARTHUS 앱 1차 — 안드로이드 앱(v1+v2 한 앱) · 크롬 새 탭 확장 개발지시서 (2026-09-24, PD 승인 대기)

> 상태(2026-09-24): **계획이다. 코드·배포·S3·CloudFront 는 아무것도 바꾸지 않았다.** PD 승인 전에는 코드를 쓰지 않는다(기억 `confirm-before-building`).
> 근거: 조사 보고서 4건 — `docs/app-plan-2026-09-24/survey-repo.md` · `survey-infra.md`(원본 `survey-infra-raw/`) · `survey-android.md` · `survey-chrome.md`. 이 문서의 표는 요약이고, 모든 행의 원본은 그 네 파일에 있다.
> 표기: **실측** = 2026-09-24 06:0x~06:20 UTC 에 curl·읽기 전용 AWS 조회로 잰 값 · **읽음** = 그날 공식 문서를 직접 열어 확인 · **추정** = 계산값·경험값(근거 문서 없음) · **UNVERIFIED** = 공식 출처로 확인 못 함. UNVERIFIED 를 사실처럼 쓰지 않는다.
> 인용 형식: `survey-android §4-4`, `prototype/js/auth.js:82`.

---

**한 줄 결론: 안드로이드는 TWA(Trusted Web Activity, Bubblewrap) 하나로 `earthus.net/` 을 열고 그 안에서 지금 웹의 v1→v2 경로를 그대로 쓴다. 크롬 새 탭은 earthus.net 을 통째로 띄우지 않고, 확장 안의 가벼운 2D 지구가 캐시된 구름 관측 한 장과 출처·시각 붙은 사실 몇 줄을 그린다. 가장 큰 결정은 결제다 — 약관은 "자동 갱신 없는 기간 이용권·웹 결제"인데 Play 는 앱 안 디지털 판매를 Play 결제로 받으라고 한다. 이 둘을 맞추는 방식을 PD 가 먼저 골라야 판매를 열 수 있다. 다만 지금은 판매 스위치가 전부 닫혀 있어(F4) 앱 자체는 결제 없이 먼저 낼 수 있다.**

---

## 0. 사용자 화면에서 무엇이 바뀌나

### 0-1. 안드로이드 앱 — 설치 후 첫 화면

1. Play 에서 설치하면 홈 화면에 **EARTHUS 아이콘 하나**가 생긴다(브랜드 v5 로고, 크기만 맞춘 것 — 새로 그리지 않는다).
2. 누르면 검은 스플래시(브랜드 아이콘) 뒤 **주소창 없는 전체 화면으로 지금의 v1 지구(`earthus.net/`)** 가 뜬다. 오늘 웹에서 보는 화면과 같다 — 시각·도시·기온 줄과 출처 줄(예: NOAA GMGSI · 기상청)까지(survey-infra §1-1 에서 같은 화면이 그려지는 것을 실측).
3. 지구 전환 단추(EARTHUS / Intelligence — 좁은 화면에서는 브랜드 아이콘 + 드롭다운, `earth-switch.js:30-50`)를 누르면 **같은 앱 안에서, 주소창이 생기지 않고** v2 로 넘어간다. 같은 출처(`earthus.net`)라 인증서 연결 하나로 둘 다 덮인다(survey-infra §3). v1 의 '다음 질문' 한 줄 → v2 로 가는 유도 경로도 웹과 똑같다.
4. Google·Apple 로그인을 누르면 잠깐 **위쪽에 주소 표시줄이 달린 화면**(`accounts.google.com` 등, 검증된 출처 밖이라 Custom Tab 모양)이 보였다가, 돌아오면 다시 전체 화면이 된다(동작 원리 읽음, 화면 모양은 실기기 확인 필요 — survey-android §0).
5. v2 에서 결제 단추를 누르면 **웹의 토스 결제창이 아니라 Google Play 결제 시트**가 뜬다. 앱에서 달라지는 것은 이것 하나다(이유 §3-4). 판매가 열리기 전(지금)에는 웹과 똑같이 결제 단추 자체가 없다.
6. 웹을 배포하면 **앱을 다시 깔지 않아도 다음 실행에 바뀐 화면이 뜬다.** 스토어 심사는 껍데기(안드로이드 코드)를 바꿀 때만 다시 받는다.
7. (1차 포함 시) 기상특보 알림이 **안드로이드 알림 표시줄에 EARTHUS 이름으로** 뜬다 — v1 에 이미 있는 웹푸시(`prototype/js/push.js`, `sw.js:182-241`)를 그대로 쓴다.

### 0-2. 크롬 새 탭 — 첫 화면

Chrome 에서 새 탭을 열면 빈 Google 페이지 대신 **지금 지구의 한쪽 면**이 바로(캐시 기준 목표 200 ms) 보인다. 움직이지 않는다 — 한 번 그리고 멈춘다.

```
                        ┌─────────────────────────────┐   ┌──────────────────────────────────────────┐
                        │   (정사영 지구 · 중심 = 내 장소) │   │ 서울 26.2℃ · 바람 2.2 m/s                 │
                        │   바탕 Natural Earth II        │   │   기상청 지상관측 13:00 KST                │
                        │   + 구름 NOAA GMGSI 적외선      │   │ 지금 발효 중인 기상특보 없음               │
                        │   + 밤 = 지금 태양 위치로 계산    │   │   기상청 15:02 KST 기준                   │
                        │   (위도 ±72.7° 밖 구름 없음 →   │   │ M3.0 · 일본 기후현 미노 동부 · 12:39 KST   │
                        │    그리지 않는다)               │   │   일본 기상청 · 진도 1                    │
                        └─────────────────────────────┘   └──────────────────────────────────────────┘
   구름 · NOAA GMGSI 다중위성 적외선 합성 · 관측 14:00 KST (05:00 UTC)
   낮과 밤 · 지금 태양 위치로 계산 (15:12 KST)   ·   바탕 · Natural Earth II

   [ 지구 전체 보기 → ]          이 구름은 닷새 뒤 어디에 있을까? → EARTHUS Intelligence
   (Chrome 138+ 하단 '새 탭 제공 확장' 바 자리는 비워 둔다)
```

- 위 숫자는 **2026-09-24 실측 파일에서 옮긴 형식 예시**다(`wind/kma-aws.json` 지점 108, `events/kma-warn.json` `activeCount 0`·`observedKst 202609241502`, `events/quake-asia.json` — survey-chrome §5-1). 화면에는 그때그때 파일 값이 들어간다.
- **새 탭은 v1(EARTHUS, 무료)의 창구다 — 사실만 말한다. 예보는 없다.** '예보'·'닷새 뒤'라는 말은 v2 로 가는 링크 한 줄에만 나온다. 이것이 "앱·확장 안에서도 v1/v2 원칙을 섞지 않는다"가 화면에 드러나는 모습이다.
- 오프라인이면 마지막 그림과 `오프라인 — 마지막으로 받은 그림 (관측 14:00 KST)`, 구름이 2시간 넘게 안 바뀌면 `구름 자료 지연 — 마지막 관측 3시간 전 (11:00 KST)`. 같은 조건이면 늘 같은 문구다(무작위 문구 금지, HANDOVER §5).
- 검색창은 없다. 주소창이 포커스를 그대로 갖는다(바로 치면 주소창에 들어간다).

---

## 1. PD 결정 기록과 묶는 원칙

### 1-1. PD 결정 (2026-09-24)

| # | 결정 | 이 문서에서의 뜻 |
|---|---|---|
| ① | **안드로이드 앱은 하나. v1(무료)과 v2(유료)를 한 앱에 담는다.** 웹의 v1→v2 유도 경로가 앱 안에 살아 있어야 한다 | 앱 시작은 `/`, v2 는 같은 앱 안의 경로. 결제 단계까지 앱 안에서 이어져야 하므로 '앱에서는 안 팔기(소비 전용)'는 이 결정과 부딪힌다(§3-4, §6 D1) |
| ② | **크롬 확장 = 새 탭이 지금 지구를 보여준다("새 탭 = 지금 지구")** | 새 탭 교체(`chrome_url_overrides.newtab`) 확장 하나 |
| ③ | 첫 앱 대상은 안드로이드 앱과 크롬 확장 둘 | iOS·Edge·차량은 이 지시서 밖(Edge 동시 출시만 §6 에서 묻는다) |

기존 문서와의 관계: "v1+v2 한 안드로이드 앱"과 "크롬 새 탭"은 기존 문서 어디에도 없다(survey-repo §6, F10). 기존 계획(`docs/master-plan-2026.md:244-258`)은 "PWA → Play TWA(조직 계정) → iOS"였고, 이 지시서는 그 TWA 경로를 이어받되 v2 를 같은 앱에 싣는 것을 새로 정한다.

### 1-2. 묶는 원칙 (앱·확장에서도 그대로)

1. **지어내지 않는다.** 자료가 없는 칸은 비우지 않고 그 줄을 빼거나 "없다"를 시각과 함께 말한다. 구름 자료가 없는 위도 ±72.7° 밖은 그리지 않는다. 자료가 늦으면 "지연"이라고 말한다 — "특보 없음"을 늙은 자료로 말하지 않는다.
2. **모든 값에 출처와 시각.** 앱 전용 화면(스플래시 뒤 오류 화면·위젯을 만든다면 위젯)·새 탭의 모든 값에 적용한다.
3. **무한 애니메이션 금지(발열, HANDOVER §5).** 새 탭은 rAF 루프 0, WebGL 0. 앱은 웹 그대로(웹에 이미 발열 거버너가 있다 — `prototype/v2-three/js/main.js:2421-2433`).
4. **v1 과 v2 는 다른 서비스다 — 한 앱 안에서도 원칙을 섞지 않는다.** v1 화면·새 탭·특보 알림에는 예보·원인·확률을 싣지 않는다. v2 의 예보·확률은 v2 화면 안에서만, 모델 이름·실행 시각과 근거와 함께. 앱 껍데기가 어느 쪽 원칙도 덧칠하지 않는다.
5. **7단계 문법과의 관계(정직하게).** 앱과 새 탭은 7단계의 새 칸을 채우지 않는다. 두 서비스를 사람 손에 닿게 하는 **통로**다. 통로가 할 일은 "v2 의 ①~⑦ 이 웹과 똑같이 앱에서도 성립한다"와 "v1 의 사실이 새 탭에서 출처·시각과 함께 보인다" 두 가지다.
6. **자동으로 게시하지 않는다·배포 스크립트를 확인용으로 돌리지 않는다**(기억 `never-run-deploy-to-test`). 스토어 제출·S3 업로드·CloudFront 변경·결제 계약은 PD 손이다.

---

## 2. 현재 상태 실측

### 2-1. 한눈에

| 항목 | 상태 | 근거 |
|---|---|---|
| v1 PWA(manifest·SW·아이콘) | ✅ 있음. `start_url ./index.html`, `scope ./`(루트 → `/v2/` 도 범위 안), `display standalone` | `prototype/manifest.webmanifest:7-9`, survey-repo §1 |
| v1 maskable 아이콘 | ⚠️ 512 PNG 를 재사용 — 모서리가 둥글고 투명(규격상 전용 maskable 아님) | survey-repo §1-1 |
| theme-color | ⚠️ 네 곳이 서로 다름(`#02060c`·`#000000`·`#030608`) | survey-repo §1-1 |
| v2 설치 요소 | ⚠️ `/v2/manifest.webmanifest` 는 운영에 **200 으로 있으나 v1 것과 바이트까지 같은 사본**이고 v2 HTML 이 링크하지 않는다. v2 는 SW 도 등록하지 않는다 | survey-infra §3(실측, ETag 동일), survey-repo §2-1(grep 0건) |
| `/.well-known/assetlinks.json` | ❌ **403**(S3 AccessDenied = 키 없음). 없는 경로 대조군도 같은 403 | survey-infra §2(실측) |
| CloudFront 가 `/.well-known/` 을 막는가 | 막지 않는다 — 함수·Lambda@Edge 0, 커스텀 오류 응답 0, 기본 동작 → 서울 버킷 `/app` | survey-infra §2-1(읽기 전용 get-distribution-config) |
| 페이지 보안 헤더 | `/`·`/v2/` 에 X-Frame-Options·CSP·HSTS **없음** → 다른 출처 iframe 에 v1·v2 둘 다 그려짐 | survey-infra §1, §1-1(실측) |
| 자료 JSON 의 CORS | ⚠️ earthus.net 경유는 **엣지 캐시 Miss 면 ACAO `*`, Hit 이면 없음**(11건 중 6건 없음). S3 직접은 늘 `*` | survey-infra §4(실측) |
| 로그인 | Supabase `signInWithOAuth`(Google·Apple) **전체 페이지 리다이렉트**. 순수 WebView 면 Google 이 `disallowed_useragent` 로 거절, TWA(=브라우저)면 그대로 됨 | `prototype/js/auth.js:12, :82-93`, survey-android §1-3(읽음) |
| 결제 | 웹 = 토스페이먼츠, 금액·창립 50% 는 서버(`supabase/functions/checkout/index.ts:92-101`). 안드로이드 어댑터는 `window.AndroidBilling.purchase`(WebView 브리지 가정)로 **자리만 있음** | `prototype/js/billing.js:261-310`, survey-repo §3-2 |
| 판매 스위치 | **네 겹 모두 닫힘**: `MONETIZATION_MODE=FREE_OPEN`·`SALES_OPEN=false`(클라이언트), `SALES_ENABLED`(서버), 자료 라이선스 스위치 2개 | survey-repo F4 |
| v2 등급 판정 | ⚠️ 서버가 아니라 같은 출처 localStorage `earthus.tier` 를 읽는다(클라이언트가 고칠 수 있는 값). v2 에는 요금 모드 config 주입 코드가 없어 늘 `FREE_OPEN` | `prototype/v2-three/js/report-center.js:101-106`, `main.js:5035-5036`, survey-repo F5·§3-3 |
| 약관 제8조 | 결제 = **웹사이트에서 카드·간편결제(토스)**, **자동 갱신 없는 기간 이용권**, 제7항 창립 멤버 50% | `prototype/legal/terms.ko.md:94-114` |
| 법적 페이지 | ⚠️ 처리방침·약관 URL 이 `text/markdown`(HTML 아님), 처리방침에 주소·전화·통신판매업 번호 **자리표시자** 남음, 영어판 없음, **웹 계정 삭제 안내 URL 없음**, Play 데이터 안전 미작성 | survey-repo §8 |
| 안드로이드·확장 코드 | ❌ 전무 | `docs/earthus-v2/AUDIT/EARTHUS_1.0_CURRENT_SYSTEM_AUDIT.md:98`, survey-repo §6 |

### 2-2. 첫 화면 무게 (앱·새 탭 판단용)

| 대상 | 값 | 성격 | 출처 |
|---|---|---|---|
| v2 첫 방문 코드 | 93 파일 · 1,134,210 B(br) | 실측(정적 import 그래프, 자료 제외) | survey-infra §5 |
| v1 첫 방문 코드 | 123 파일 · 2,452,482 B(이 중 jsDelivr Cesium 등 1,683,493 B, 1년 immutable) | 실측 | survey-infra §5 |
| 지금 지구 구름 한 장 | `global-2048.webp` 1,505,406 B(폰) / `global.webp` 3,038,104 B(데스크톱, meta 기재값) · 5분 캐시 | 실측 / 메타값 | survey-infra §5 |
| 폰 LTE 첫 로드(과제 전달값) | v2 2.2 s / 8 MB · v1 3.1 s / 6.1 MB | 과제에 전달된 값. **원 측정 기록은 이번에 확인하지 못함** | — |
| 폰 LTE 첫 로드(09-23 기준선) | v2 21.5 s / 19.99 MiB(지형 타일 256장) · v1 3.29 s / 2.38 MiB | 실측(09-23, 지형 수정 전) | `docs/PERF-LTE-PLAN-2026-09-23.md` §1 |

⚠️ **두 v2 수치가 크게 다르다.** 09-23 계획 이후 지형을 z3 한 장으로 줄이는 수정이 있었다면(기억 `v2-loading-terrain-root-cause`) 2.2 s 는 수정 후 값일 수 있다. 어느 쪽이 지금 운영인지 **Phase 1 첫 날 실기기로 다시 잰다.** 앱의 v2 첫 진입 속도는 웹 v2 그대로 따라간다 — 앱이 따로 빠르게 해 주지 않는다.

### 2-3. 조사 보고서끼리 다른 곳 (숨기지 않는다)

| # | 무엇 | 한쪽 | 다른 쪽 | 이 문서의 처리 |
|---|---|---|---|---|
| 1 | 새 탭 방식 | survey-repo F11·survey-infra §1-1: **iframe 이 오늘 바로 된다**(다른 출처 iframe 에 v1·v2 지구가 그려짐, 실측) | survey-chrome §4: iframe(A안) 기각 — 최소 기능 정책 위험(**반려 사례 UNVERIFIED**) + 탭마다 Cesium·WebGL(발열) | 기술 가능성은 인정. **B안(2D) 추천**, 확실한 근거는 발열·속도(HANDOVER §5, 첫 그림 200 ms 불가). 정책 위험은 UNVERIFIED 로 표기. PD 결정 D4 |
| 2 | v2 의 정식 주소 | `earth-switch.js:71` 메뉴 = `/Intelligence` | `for-me-row.js:77` = `/v2/`; survey-infra §1 = `/v2/` 와 `/Intelligence/` 는 **서로 다른 S3 객체**(ETag 다름) | 앱·새 탭의 링크는 `/v2/` 로 쓴다(파일이 실제로 사는 곳, 배포 한 번에 한 객체). 메뉴와 FOR ME 가 서로 다른 주소를 쓰는 것은 별건 정리 항목(§7 R12) |
| 3 | v2 manifest·SW | survey-repo: v2 manifest ❌·SW ❌(HTML grep) | survey-infra: `/v2/manifest.webmanifest` 200(v1 사본). survey-android §5: "`/sw.js`, `/v2/sw.js` 두 SW 가 CacheStorage 공유(주석)" | 파일은 S3 에 있으나 연결 안 됨으로 정리. **`/v2/sw.js` 의 존재·등록 여부는 확인 필요**(Phase 0 에 curl HEAD + 코드 grep 으로 닫는다). 한 앱이면 v2 전용 manifest 는 필요 없다(survey-infra §3) |
| 4 | assetlinks 경로 라우팅 | survey-android §6-1: CloudFront 가 `/.well-known/*` 를 app 원본으로 보내는지 UNVERIFIED | survey-infra §2-1: 배포 설정을 직접 읽어 **확인됨** | survey-infra 가 대체한다 |
| 5 | TWA 에서 알림·결제 | survey-repo §4: TWA=Chrome 이라 웹푸시 동작 | survey-android §2-2: **삼성 인터넷이 기본 브라우저인 갤럭시**는 TWA 가 삼성 인터넷으로 뜨고 "basic support only" — 알림 위임·Digital Goods API 가 안 될 수 있음(실동작 UNVERIFIED) | 완료 기준을 **Chrome 기본 폰과 삼성 인터넷 기본 갤럭시 두 대**에서 따로 본다 |
| 6 | 안드로이드 결제 연결 방식 | 코드 `billing.js:268-272`: WebView 브리지 `window.AndroidBilling` | 문서 `docs/research-2026-07.md:678`·survey-android §1: TWA 면 **Digital Goods API + Payment Request** | TWA 로 가므로 Digital Goods API 가 주 경로, 삼성 인터넷 대비로 네이티브 Billing 브리지가 보조(§3-4). `AndroidBilling` 자리는 그 보조 브리지 이름으로 재사용 가능 |
| 7 | three.js 위치 | survey-chrome: `prototype/vendor/three-r184…` | survey-repo: `prototype/v2-deploy/vendor/…` | 추천안 B 는 three.js 를 쓰지 않으므로 영향 없음 |

---

## 3. 안드로이드

### 3-1. 방식 선택 — 추천: **TWA (Bubblewrap CLI) + 필요한 네이티브 보강**

| 항목 | **TWA (추천)** | Capacitor | 순수 WebView | 네이티브 재작성 |
|---|---|---|---|---|
| 렌더 엔진 | 사용자의 TWA 지원 브라우저(대개 Chrome), 별도 GPU 프로세스 | System WebView | System WebView(별도 GPU 프로세스 없음, 읽음) | 새로 작성 — Cesium·Three.js 재사용 불가 |
| 웹 배포 = 앱 갱신 | **그렇다** | 번들 내장이 정석. 원격 URL 은 공식 문서가 "not intended for use in production"(읽음) | 가능(정책 위험↑) | 아니다 |
| Google 로그인(현 코드) | **그대로 됨** | WebView 차단 → 재작성 | 차단 → 재작성 | 네이티브 |
| 웹푸시·위치·공유·다운로드 | 알림·위치 위임으로 웹 코드 그대로 | 플러그인 재구현 | 직접 재구현(웹푸시 불가 — UNVERIFIED) | 재구현 |
| Play 결제 | Digital Goods API(웹 코드에서, Chrome TWA 만 — 읽음) | 네이티브 플러그인 | 네이티브 브리지 | 네이티브 |
| 공수 | 셸 1~2주 + 결제·위임 2~4주 (**추정**) | 4~8주 + 인증·결제 재작성 (**추정**) | 3~6주 + 재작성 (**추정**) | 수개월 (**추정**) |

근거: survey-android §1·§2. 결정적 이유 셋 — ① 지금 로그인이 WebView 에서 막힌다 ② 빌드 없는 지금 배포(S3+CloudFront)가 그대로 앱 갱신이 된다 ③ v1·v2 가 같은 출처라 인증서 연결 하나로 한 앱에 둘 다 담긴다.

**TWA 에 붙여야 하는 네이티브 보강**(웹만으로 안 되는 것, survey-android §1):
- (a) Play 결제 확장 — Bubblewrap `features.playBilling`(`com.google.androidbrowserhelper:billing` 1.2.0, `billingclient 8.3.0` 의존 — 2026-08-31부터 요구되는 PBL 8+ 충족, 읽음).
- (b) 삼성 인터넷 기본 폰에서도 Play 결제가 되게 하려면 래퍼 액티비티의 **네이티브 Billing 브리지**(Kotlin). 한국 대체결제(토스 병행)를 할 경우에도 네이티브가 필요하다(Digital Goods API 에 대체결제 표면 없음 — 부재 확인이라 UNVERIFIED).
- (c) 홈 화면 위젯은 TWA 에 없다 — 만든다면 네이티브 `AppWidgetProvider` 가 같은 공개 JSON 을 출처·시각과 함께 그린다. **1차 제외 추천**(D8).

### 3-2. 구조

| 항목 | 제안 | 근거·주의 |
|---|---|---|
| 패키지명 | `net.earthus.app` (한 번 정하면 바꿀 수 없다 — Play 일반 사실) | PD 결정 D3 |
| 앱 이름 | `EARTHUS` (스토어 제목 30자 한도 안에서 부제 예: `EARTHUS — 지금 지구`) | `docs/research-naming.md:689~` |
| host | `earthus.net` 하나. `www.earthus.net` 은 같은 내용을 200 으로 주므로(실측) www 로 들어온 링크까지 앱에서 열려면 www 에도 assetlinks 필요 — 1차는 `earthus.net` 만 | survey-infra §1, survey-android §6-3 |
| Bubblewrap init 기준 | v1 매니페스트 `https://earthus.net/manifest.webmanifest` | survey-android §5 |
| start_url | `/?src=twa` (앱 안 표식, §3-4) | query-parameters 문서(읽음) |
| scope | `/` — `/v2/`, `/Intelligence/` 포함 | survey-infra §3 |
| v1 ↔ v2 이동 | 지금 웹의 `earth-switch.js` 그대로. 앱 전용 코드 없음 | `prototype/js/earth-switch.js:69-72` |
| 딥링크(App Links) | `https://earthus.net/*` 전체를 앱이 연다. 이미 있는 형식이 그대로 앱에서 열림: v2 화면 상태 `#v=1&at=…`, FOR ME `/v2/?tab=my&event=…`, 태풍 `?tc=`, 지점 `?station=` | survey-repo §2-3 |
| 표시 | `display: standalone`, `orientation: any`(현 manifest) | Bubblewrap README(읽음) |
| Chrome 없을 때 | `fallbackType: customtabs` (webview 폴백은 **쓰지 않는다** — Google 로그인·Play 결제가 안 된다) | survey-android §5 |
| 타깃 API | 36 (2026-08-31부터 신규 앱·업데이트 필수, 읽음). Bubblewrap 템플릿이 이미 36 | survey-android §3 |
| 알림 | Bubblewrap `enableNotifications`(알림 위임) + Android 13+ `POST_NOTIFICATIONS`. 1차 포함 여부는 D5 | survey-android §5 |
| 위치 | `features.locationDelegation`. 권한은 '내 위치' 단추를 누를 때만 묻는다(지금 웹과 같은 시점). 배경 위치 없음(`push.js:3-15`) | D6 |
| 오프라인 | v1 `sw.js` 의 network-first 그대로(오프라인이면 셸은 뜨나 지구는 안 그려짐 — survey-repo §1-3). 오프라인 전용 화면은 별건 | TWA 품질 기준에 오프라인 처리 포함(읽음) |
| 프로젝트 위치(제안) | `apps/android-twa/` — PD 승인 뒤 생성. 업로드 키스토어·비밀번호는 저장소에 넣지 않는다(HANDOVER §7) | — |

### 3-3. 결제 — 가장 중요한 결정

**먼저 풀어야 할 모순.** 약관 제8조는 상품을 "**웹사이트에서** 카드·간편결제로 사는 **자동 갱신 없는 기간 이용권**"으로 정했다(`terms.ko.md:94-101`). 그런데 Play 는 Play 로 배포한 앱 **안에서** 디지털 상품을 팔거나 결제를 요구하면 Google Play 결제를 쓰라고 하고, 앱 안 단추·링크·웹뷰로 다른 결제로 유도하는 것을 금지한다(Payments policy answer/9858738, 읽음). 조사 보고서(survey-android §4)는 전부 **자동 갱신 구독**을 전제로 수수료·요금제를 정리했다 — 지금 약관의 '기간 이용권'과 상품 성격이 다르다. 그래서 결정은 두 겹이다:

**(가) 앱 안에서 무엇을 팔 것인가 — 상품 형태**

| 안 | 내용 | 약관 | 창립 멤버 50% | 확인된 것 / 모르는 것 |
|---|---|---|---|---|
| 가-1 | **기간 이용권 유지** → Play 의 비갱신형 상품(1회성 상품 또는 선불형 요금제)으로 판다 | 결제 수단 문구(제8조 "웹사이트에서")만 개정 | 등급·기간별 상품을 서버가 정한 가격으로 두 벌(정가·반값) 두면 된다 — 비교적 단순 | **Play 에서의 정확한 상품 유형과 수수료율은 조사에 없다 → UNVERIFIED.** Phase 0 에서 Console·공식 문서로 확인 |
| 가-2 | **자동 갱신 구독으로 바꾼다** | 제8조 전면 개정(갱신·해지 절차·고지) — **판매 전 약관 개정이 먼저** | 반값 **기본 요금제(base plan) `founding`** 을 따로 두고, 서버가 `purchaseToken` 으로 자격을 검증(비자격자면 권한 거부). Play 오퍼는 기간이 끝나면 정가로 돌아가 약속을 못 지킨다(읽음, 최대 기간 수치 UNVERIFIED) | 수수료 표(아래)가 확인된 쪽. 정가 인상 때 기존 구독자 opt-in 규칙이 약관 "불리한 변경 금지"와 충돌하는지 **법무 검토 필요** (survey-android §4-5) |
| 가-3 | **앱에서는 팔지 않는다(소비 전용)** | 개정 불필요 | 웹에서만 적용(현행) | 앱 안 "웹에서 업그레이드" 문구는 되나 **누르는 링크·단추 금지**(answer/10281818, 읽음) → **PD 결정 ①(앱 안 유도 경로)의 결제 단계가 끊긴다** |

**(나) 앱 안 결제 수단 — 정책상 안전한 순위** (survey-android §4-4)

1. **Play 결제만(앱 안) + 웹은 토스 유지.** 가장 단순·확실. 서버가 `purchaseToken` 검증·3일 안 acknowledge(안 하면 자동 환불, 읽음). 구독이면 실시간 개발자 알림(RTDN) + Play Developer API 로 갱신·해지·환불을 동기화(요건 확실, API 이름 세부 UNVERIFIED). 웹 결제와 Play 결제가 한 사람에게 겹치지 않게 서버에 결제 경로 기록.
2. **1 + 한국 대체결제(토스) 병행.** 수수료 4%p 감액(현행). 대가: 네이티브 대체결제 API·PCI DSS·거래 24시간 내 보고·선택 화면. TWA 에서 '앱 안 embedded webview 로 보여야 한다'는 요건과 어떻게 맞출지 공식 설명 없음(UNVERIFIED). → 판매량을 본 뒤 2단계로.
3. **소비 전용** — 위 가-3.
4. **외부 링크 프로그램** — 한국은 등록 절차가 "coming months"로 **지금은 쓸 수 없음/미정**(읽음).

**추천: (가-1 또는 가-2 중 PD 선택) × (나-1).** 가-1 이 약관을 덜 흔들지만 Play 쪽 사실이 아직 UNVERIFIED 이므로, Phase 0 에서 가-1 의 Play 상품 유형·수수료를 먼저 확인한 뒤 PD 가 고른다(D1).

**수수료 — 한국은 두 시기로 나뉜다** (survey-android §4-2, 읽음)

| 시기 | 한국 사용자 대상 (자동 갱신 구독 기준) |
|---|---|
| ~2026-12-30 | Play 결제 15%. 대체결제 병행 시 4%p 감액 → 11% + PG 수수료 별도 |
| 2026-12-31~ | 서비스 수수료 10% + **청구 수수료는 Play 결제를 쓸 때만**(US·UK·EEA 는 5% 로 명시, **한국 5% 는 UNVERIFIED**), 대체결제·외부 링크는 청구 수수료 0% |

비갱신형(가-1) 상품의 수수료는 이 표에 없다 — **UNVERIFIED**. 판매 개시일(`SALES_OPEN`)이 12-31 앞이냐 뒤냐로 적용 체계가 바뀐다(D2).

### 3-4. 앱 안에서 토스 창이 절대 뜨지 않게 — 판매 전에 반드시

- 지금은 판매 스위치가 모두 닫혀 있어(F4) 웹에도 결제 단추가 없다. **그래서 앱은 결제 없이 먼저 낼 수 있다.** 그러나 `SALES_OPEN` 은 웹 전체 스위치다 — 웹에서 여는 순간 같은 웹을 띄우는 앱에도 토스 창이 뜬다(정책 위반). **앱 안 판정은 앱 첫 출시 때부터 넣어 둔다.**
- ⚠️ 판정을 `'getDigitalGoodsService' in window` 로 하면 안 된다 — Chrome TWA 에서만 참이라, 삼성 인터넷으로 뜬 앱은 "앱 밖"으로 오판돼 토스를 띄운다(survey-android §4-1).
- 판정 방법: `start_url` 표식 `?src=twa` → 첫 로드에서 **`sessionStorage`** 에 기록하고 `history.replaceState` 로 쿼리를 지운다. `localStorage` 에 두면 안 된다 — TWA 는 Chrome 과 저장소를 공유하므로 일반 탭 웹 사용자까지 '앱 안'이 된다(공유 해석, 실기기 확인). `document.referrer = android-app://…` 는 공식 확인 못 함(UNVERIFIED) → 보조 신호로만.
- 분기: 앱 안 → Digital Goods API 있으면 Play 시트 / 없으면 네이티브 Billing 브리지 / 둘 다 없으면 `앱에서는 결제할 수 없습니다` 안내(링크 없음). **어느 경우에도 토스 금지.**

### 3-5. 판매 개시 전에 서버에 있어야 할 것 (앱 출시 조건 아님, `SALES_OPEN` 조건)

1. **v2 등급의 서버 판정** — 지금 v2 는 클라이언트 localStorage `earthus.tier` 를 믿고, 요금 모드 config 가 없어 늘 FREE_OPEN 이다(F5, `main.js:5035-5036`). 앱에 싣든 안 싣든 유료 판매 전 필수.
2. Play 영수증 검증 함수(Supabase Edge Function, `checkout`·`payment-confirm` 과 같은 자리): `purchaseToken` 검증 → 상품·요금제 확인 → 창립 자격(`is_founding_email`) 대조 → acknowledge → 권한 기록.
3. (구독이면) RTDN 수신 → 해지·환불·만료 시 권한 닫기.
4. 서버 `plans` 표가 웹·Play 가격의 정본 — 창립 멤버는 결제 경로와 무관하게 **같은 비율(정가의 50%)**.

### 3-6. 스토어 요건 (확인된 것만, survey-android §3)

| 항목 | 내용 | 상태 |
|---|---|---|
| 계정 유형 | 개인 / 조직. 조직은 **D-U-N-S 번호** 필요, 발급 "최대 30일", 법인명·주소가 결제 프로필과 일치 | 읽음(answer/13628312) |
| 비공개 테스트 | **2023-11-13 이후 만든 개인 계정**: 앱마다 **12명 이상 · 14일 연속** opt-in 비공개 테스트 뒤 프로덕션 신청, 심사 "7일 이내(더 걸릴 수 있음)". **조직 계정은 면제** | 읽음(answer/14151465) |
| 기기 인증 | 신규 개인 계정은 Play Console 앱으로 안드로이드 10+ 실기기 인증 | 읽음(answer/14316361) |
| 등록비 | US$25 1회 | **UNVERIFIED**(검색 요지만) |
| 타깃 API / Billing Library | API 36 · PBL 8+ (둘 다 2026-08-31부터, 연장 시 11-01) | 읽음 |
| 앱 서명 | 신규 앱은 Play App Signing 자동. 개발자는 **업로드 키**만 보관(분실 시 재설정 가능) | 읽음(answer/9842756) |
| 형식 | AAB (Bubblewrap build 가 APK·AAB 생성) | 읽음 |
| Data safety | 비공개·공개·프로덕션 트랙 전부 필수. 앱이 띄우는 우리 사이트의 수집(로그인 이메일·위치·이용 기록)을 신고(TWA 명시 문구는 없음 — 적용 해석) | 읽음(answer/10787469) |
| 개인정보처리방침 | 스토어 등록정보 **및 앱 안** 링크 | 읽음 — 지금은 `text/markdown`(HTML 페이지 필요) |
| 계정 삭제 | 앱 안 경로(✅ 있음, `auth.js:194-199`) **+ 웹 삭제 링크**(❌ 없음) | 읽음(answer/13327111) |
| 앱 콘텐츠 신고 | 광고 여부, **심사용 로그인 정보**, 대상 연령, 콘텐츠 등급 설문 | 읽음(answer/9859455) |
| 스토어 그래픽 | 아이콘 512×512 PNG(알파) ≤1024 KB · 피처 그래픽 1024×500(알파 없음) · 스크린샷 최소 2장(추천 노출용 폰 4장 1080px, 9:16) | 읽음(answer/9866151) |
| 위치기반서비스사업 신고 | 확인 필요 | `prototype/legal/README.md:11-38` |

### 3-7. 자산 목록

| 자산 | 있음/없음 | 만드는 법 |
|---|---|---|
| 런처 아이콘(adaptive) 전경·배경층 | ❌ | 전경 = `prototype/logo/earthus-monogram-white.svg`(v5 정본과 같은 파일) 래스터화, 배경 = 단색 `#0A0A0A`. **새로 그리지 않는다**(기억 `brand-assets-v5-only`) |
| 단색(themed) 아이콘 | ❌ | 같은 모노그램 |
| Play 고해상 아이콘 512 | ⚠️ `icon-512.png` 는 모서리가 투명·둥글다 | 정본 SVG 에서 규격대로 다시 래스터화(모서리 처리 규격은 Console 안내로 확인 — UNVERIFIED) |
| maskable 아이콘(웹 manifest) | ⚠️ 재사용 중 | 전용 파일 추가(가장자리까지 배경) |
| 피처 그래픽 1024×500 | ❌ | 로고 lockup + 실제 지구 캡처(지어낸 화면 금지) |
| 폰 세로 스크린샷 4장+ | ❌(있는 `prototype/shots/*` 는 1600×1000 가로) | 실기기에서 실제 화면 캡처, 각 장면의 관측 시각이 화면에 보이게 |
| 처리방침·약관 HTML URL, 웹 계정 삭제 안내 페이지 | ❌ | `prototype/legal/*.ko.md` 를 HTML 로 발행 + 자리표시자 채우기(PD 가 사업자 정보 제공) |
| 오픈소스 고지 화면 | ⚠️ 목록만 문서에 | `prototype/legal/README.md:97-107` |
| `assetlinks.json` | ❌ | §5 Phase 1 |

---

## 4. 크롬 새 탭

### 4-1. 방식 선택 — 추천: **B. 확장 안의 가벼운 2D 캔버스 지구**

| | A. earthus.net(v1) 전체 iframe | **B. 확장 안 2D 지구 (추천)** | C. 서버 렌더 그림 + 사실 |
|---|---|---|---|
| 오늘 되는가 | **된다**(실측, survey-infra §1-1) | 개발 필요 | 개발 + 새 Lambda |
| 새 탭 한 번 비용 | 탭마다 Cesium 초기화 + WebGL 컨텍스트, 코드 1.1~2.5 MB(재방문은 대부분 304) + 구름 1.5~3 MB | 캐시 그림 1장(로컬), **네트워크 0건으로 첫 그림** | 캐시 PNG 1장 |
| 첫 그림 < 200 ms | ❌ (Cesium 부팅) | ✅ 목표 | ✅ |
| 발열(HANDOVER §5) | ❌ 탭마다 WebGL | ✅ 한 번 그리고 멈춤 | ✅ |
| 오프라인 | ❌ 빈 화면 | ✅ 마지막 그림 + 관측 시각 | ✅ |
| 스토어 최소 기능 정책 | ⚠️ "웹페이지를 띄우는 것이 전부"로 읽힐 위험(정책 문구는 읽음, **반려 사례 UNVERIFIED**) | ✅ 확장이 기능을 직접 제공 | ✅ |
| 로그인 상태 공유 | host 권한이 있으면 최상위 파티션(문서), 실제 로그인 흐름 **UNVERIFIED** | 로그인 필요 없음 | 필요 없음 |
| 갱신 | v1 이 바뀌면 자동 | 코드는 심사 거쳐 갱신 → **로직은 작고 고정, 자료만 서버에서** | 그림 스타일은 서버에서 |

**추천 이유(확실한 것부터):** 발열 규칙과 속도(탭을 열 때마다 3D 엔진을 새로 띄우는 것은 "새 탭은 즉시 열려야 한다"는 Chrome 공식 권고와도 맞지 않는다 — override-chrome-pages, 읽음). 정책 위험은 보조 이유이며 UNVERIFIED 로 둔다. 3D 회전·탐색은 `지구 전체 보기 →` 로 earthus.net 이 맡는다. C 는 스토어 스크린샷·공유 이미지용 보조로 남긴다.

**선례의 교훈** (survey-chrome §2): 캐시를 먼저 그리고 나중에 받는다(domoritz/himawari-8-chrome) · 서버가 멈춰도 마지막 그림과 **그 시각**을 보여준다(Google Earth View 사이트 2024-01 폐쇄 뒤 확장이 무너진 사례) · 새 탭은 한 목적만(검색창·할 일 목록 금지).

### 4-2. 화면 구성 — 한국어 문구 초안

- 층: ① 바탕(검정) ② 정사영 지구(중심 = 내 장소 경도, 위도 약 20°N 기울임, 기본 서울) ③ 사실 카드. 하단 Chrome 138+ '새 탭 제공 확장' 바 자리는 비운다(바 높이 약 48 px 는 **UNVERIFIED**, 실측).
- **출처 줄 (지구 아래, 항상 보임)**
  - `구름 · NOAA GMGSI 다중위성 적외선 합성 · 관측 HH:MM KST (HH:MM UTC)` ← `clouds/meta.json` 의 `time`·`credit`
  - `낮과 밤 · 지금 태양 위치로 계산 (HH:MM KST)` ← 여는 순간 `subsolarPoint()`
  - `바탕 · Natural Earth II`
- **사실 카드 (최대 4줄, 자료가 없으면 그 줄을 뺀다)**
  - 내 장소 하늘: `서울 {temp_c}℃ · 바람 {wind_ms} m/s · 기상청 지상관측 {observedKst} KST`
  - 기상특보(발효 중): `기상특보 · {종류} {N}개 구역 · 기상청 {HH:MM} KST 기준` / 없을 때: `지금 발효 중인 기상특보 없음 · 기상청 {HH:MM} KST 기준` / 파일의 `staleAfterMinutes`(45) 초과: `특보 자료 지연 (마지막 {HH:MM})` — **"없음"이라고 말하지 않는다**
  - 최근 지진: `M{mag} · {place} · {HH:MM} KST · {기관} · 진도 {intensity}` (한국 기상청 항목이 있으면 먼저)
  - 쓰나미(있을 때만): `쓰나미 · PTWC 발표 {N}건 · 원문 보기 →` (본문은 옮기지 않는다)
- **링크**: `지구 전체 보기 →`(https://earthus.net/, 같은 탭) · 다음 질문 한 줄(v2): `이 구름은 닷새 뒤 어디에 있을까? → EARTHUS Intelligence`(https://earthus.net/v2/, 같은 탭). 배너 금지(`docs/V1-V2-UPSELL-MAP-2026-09-06.md`).
- **상태 문구(고정)**: `오프라인 — 마지막으로 받은 그림 (관측 HH:MM KST)` · `구름 자료 지연 — 마지막 관측 N시간 전 (HH:MM KST)`(2시간 초과) · 첫 설치: 바탕과 밤 경계 먼저 + `구름 관측을 받는 중…` → 도착하면 한 번 교체(300 ms 페이드 1회).
- **`<title>`**: `새 탭 · 지금 지구 — EARTHUS`
- **옵션 페이지**: 내 장소를 도시 목록에서 고른다(위치 권한 안 씀), 사실 줄 켜고 끄기. 언어는 브라우저를 따른다(ko/en).
- 스토어 단일 목적 문구 초안(ko): "새 탭을 열면 지금의 지구를 보여줍니다. 최근 위성 구름 관측과 지금의 낮과 밤, 그리고 출처와 관측 시각이 붙은 몇 가지 사실(내 장소 날씨, 기상특보, 최근 지진)을 표시합니다."

### 4-3. 파일 구성 (제안 경로 `apps/chrome-newtab/`, PD 승인 뒤 생성)

| 파일 | 역할 |
|---|---|
| `manifest.json` | MV3, `chrome_url_overrides.newtab`, `default_locale: "ko"`, 권한 3개(§4-4), `background.service_worker`, `options_page` |
| `newtab.html` / `.css` / `.js` | 인라인 스크립트 없음. ① 캐시 스냅샷 즉시 표시 ② 밤 경계 ③ 사실 카드 ④ 오래됐으면 SW 에 갱신 요청 ⑤ 새 자료 도착 시 한 번 교체. **rAF 루프 없음** |
| `globe2d.js` | 등장방형 → 정사영. 바탕+구름 합성은 자료가 바뀔 때만(OffscreenCanvas/Worker — SW 안에서 가능한지 UNVERIFIED, 안 되면 새 탭 페이지의 Worker) |
| `sun.js` | `prototype/v2-three/js/main.js:127 subsolarPoint()` 를 옮김(출처 주석) |
| `feeds.js` | 엔드포인트 표, 신선도 판정(파일의 `freshnessPolicy` 우선), **풍향 36방위 부호 ×10° 변환**(기억 `kma-wind-dir-36-code`) |
| `store.js` | Cache Storage(구름 WebP·스냅샷, 최신 1벌) + `chrome.storage.local`(사실 JSON·시각) |
| `sw.js` | `chrome.alarms` 15분, fetch 타임아웃 25초 |
| `options.html/.js`, `data/cities.json` | 도시·가까운 기상청 지점 id |
| `assets/ne2-base-2048.jpg` | 바탕 지도(377 KB, 퍼블릭 도메인) |
| `icons/16·32·48·128.png` | v5 정본 SVG 래스터화(16 px 가독성 확인 — 선 약 0.8 px, 추정) |
| `_locales/ko`, `_locales/en` | 모든 문구 |
| `tools/build-chrome-ext.sh` | zip 묶기 + **원격 스크립트·eval 0건 검사**. 배포 스크립트 아님(업로드는 PD) |
| `tests/` | §5 Phase 3 완료 기준 측정 |

### 4-4. 권한 (최소)

| 권한 | 스토어 사유 문구 초안 |
|---|---|
| `storage` | 마지막으로 받은 관측 자료와 그 시각, 사용자가 고른 도시를 이 브라우저 안에 저장한다 |
| `alarms` | 15분마다 새 관측(구름·특보·지진)이 있는지 확인한다 |
| `host_permissions: ["https://earthus.net/*"]` | EARTHUS 자료 서버에서 관측 자료(JSON·이미지)를 받는다. 코드는 받지 않는다. **필수** — earthus.net 경유 CORS 가 엣지 캐시에 따라 빠지므로(survey-infra §4) host 권한으로 받는다(확장 페이지 fetch 는 host 권한이 있으면 CORS 무관, 읽음) |
| 넣지 않음 | `geolocation`, `tabs`, `search`, `unlimitedStorage`, `<all_urls>`, 분석 도구 |

개인정보 공개 초안: 수집하는 사용자 데이터 없음 · 도시 선택은 기기 안에만 · 서버 요청은 공개 자료 GET 뿐, 식별자 없음 · 원격 코드 "아니오".

### 4-5. 자료와 갱신 주기

| 쓸 곳 | 경로 | 전송 크기(실측) | 캐시 | 자료 주기 |
|---|---|---|---|---|
| 구름 메타 | `/clouds/meta.json` | 902 B | 300 s | 1시간, 자료 시각 +약 34~45분 지연 |
| 구름 그림 | `/clouds/global-2048.webp` (la8 = 밝기+알파 구름층, 지구 그림 아님) | 1,505,406 B | 300 s | 위와 같음 |
| 기상특보 | `/events/kma-warn.json` | 852 B | 300 s | 15분 |
| 한·일 지진 | `/events/quake-asia.json` | 2,773 B | 60 s | 10분 |
| 쓰나미 | `/events/tsunami-intl.json` | 553 B | 120 s | — |
| 내 장소 하늘 | `/wind/kma-aws.json` | 8,033 B | 600 s | 매시 25분 |
| ❌ 쓰지 않음 | `/events/briefs.json` (403), `wind/gts-global.json`(271 KB — 해외 도시는 2차 설계) | | | |

(survey-chrome §3, survey-repo §7)

- **알람 15분마다**: meta.json + 사실 JSON(합 약 5 KB, 추정) → 하루 약 0.5 MB(추정).
- **구름 WebP**: `meta.time` 이 바뀌었고 **최근 2시간 안에 새 탭이 열린 적이 있을 때만** 받는다(1시간에 최대 1회). 조건 없이 받으면 종일 켠 사용자 1명이 약 36 MB/일, 조건을 걸면 8시간 사용 기준 약 12 MB/일(둘 다 추정).
- ⚠️ **WebP 주소에 `?t=<meta.time>` 을 붙인다.** 안 붙이면 엣지가 메타와 그림을 따로 캐시해 새 시각 라벨에 지난 그림이 짝지어진다(`prototype/v2-three/js/main.js:1615-1630` 사고 기록). 단, CloudFront 캐시 정책(CachingOptimized 로 보임)은 쿼리를 캐시 키에 넣지 않는다(survey-infra §2-1) — `?t=` 만으로 엣지 캐시가 갈리지 않을 수 있으므로 **Phase 3 에서 라벨 시각 = 그림 시각을 실측으로 확인**한다.
- 새 탭을 여는 순간에는 네트워크를 기다리지 않는다.
- CDN 전송량: 사용자 1만 명·하루 8시간 가정 시 약 120 GB/일, 약 3.6 TB/월(**추정**, CloudFront 단가 **UNVERIFIED**). 줄이는 안: `gmgsi-clouds` Lambda 에 확장용 1536 px 변형 추가(크기 0.7~0.9 MB 는 **UNVERIFIED**) — D9.

### 4-6. 성능·발열 기준

- 캐시가 있을 때 첫 그림(지구+구름+관측 시각) **200 ms 이내**(20회 중앙값).
- 연 뒤 5초가 지나면 **rAF 콜백 0회, CPU ≈ 0%**. WebGL 컨텍스트 0.
- 오프라인에서 새 탭이 보내는 요청 **0건**.

### 4-7. 스토어 정책 주의점 (survey-chrome §1)

- 원격 코드 금지 — JS 는 전부 패키지 안. JSON·이미지 같은 **데이터**는 허용(mv3-requirements, 읽음).
- 검색창 넣지 않는다 — Google 검색을 하드코딩한 입력창은 품질 지침의 위반 예 그대로다(읽음).
- 단일 목적: "지금 지구를 보여준다" 하나. 무관한 기능 금지.
- Limited Use 준수 공개·권한마다 사유·처리방침 URL(HTML 필요).
- 시크릿 창에서는 확장이 새 탭을 못 바꾼다(읽음) — 시크릿 창은 Chrome 기본 새 탭.
- 설치 직후 "Is this the new tab page you were expecting?" 확인 창(**UNVERIFIED**, 제3자 글) — 사용자가 되돌릴 수 있다고 전제.
- 심사: 대부분 며칠, 몇 주까지 가능 — 신규 개발자·넓은 host 권한이면 더 길다(읽음).
- 개발자 계정 이메일은 **만든 뒤 바꿀 수 없다**(읽음). 등록비 US$5 는 **UNVERIFIED**(공식 본문에 금액 없음).
- 스토어 이미지: 아이콘 128×128(그림 96 + 여백 16) · 스크린샷 1280×800 또는 640×400 1~5장 · 작은 홍보 이미지 440×280(없으면 노출 불리) — 읽음.
- Edge Add-ons: 코드 호환, 이름·설명에 "Chrome"이 있으면 바꿔야 함(읽음). 등록비 없음은 **UNVERIFIED**.

---

## 5. 단계별 계획

기간은 전부 **추정**이다(근거 문서 없음). 계정 개설·D-U-N-S 는 외부 일정이라 병행한다.

### PHASE 0 — 준비 (1주, 추정. 단 D-U-N-S 는 최대 30일 — 첫날 시작)

| 담당 | 할 일 |
|---|---|
| **PD** | ① §6 결정 D1~D10 ② (조직 계정이면) **D-U-N-S 신청을 첫날** ③ Play Console·Chrome Web Store 개발자 계정 개설·등록비 결제(계정 이메일은 바꿀 수 없음) ④ 처리방침 자리표시자(주소·전화·통신판매업 번호) 값 제공 ⑤ Supabase 대시보드의 로그인 리다이렉트 허용 목록 확인(저장소에서 볼 수 없음) ⑥ 약관 개정 여부 결정(가-1/가-2) |
| **개발** | ① D1 을 위한 사실 확인: Play 의 비갱신형 상품 유형·수수료를 공식 문서로 확인해 보고(가-1 판단 재료) ② `/v2/sw.js` 존재·등록 여부 확인(§2-3 #3) ③ 운영 v2 첫 로드 폰 LTE 재측정(§2-2 두 수치 정리) ④ 아이콘 래스터화 목록 초안(v5 정본만) ⑤ 코드 없음 — 이 단계에서 저장소에 코드를 만들지 않는다 |
| **산출물** | PD 결정 기록(이 문서 §6 에 기입) · 사실 확인 보고 3건 |
| **완료 기준(결과)** | §6 표의 모든 행에 PD 선택이 적혀 있다 · Play/CWS 계정에 PD 가 로그인할 수 있다 · v2 LTE 첫 로드 값이 하나로 기록돼 있다 |

### PHASE 1 — 안드로이드 셸 (2주, 추정)

| 담당 | 할 일 |
|---|---|
| **개발** | `apps/android-twa/` 에 Bubblewrap init(v1 manifest 기준, `start_url /?src=twa`, `fallbackType customtabs`, 알림·위치 위임은 D5·D6 에 따름) · 웹에 앱 안 판정(`sessionStorage`, §3-4) 넣기 · 전용 maskable/adaptive 아이콘 · 처리방침·약관 HTML 발행 페이지와 웹 계정 삭제 안내 페이지 · theme-color 정리 |
| **PD** | ① 업로드 키 보관(Bubblewrap 이 첫날 로컬에서 만든다 — 계정 불필요. 저장소 밖, 백업 2곳) ② **assetlinks 1차 업로드**: `s3://earthus-app-seoul/app/.well-known/assetlinks.json`(`--content-type application/json --cache-control no-cache`), 지문 = **업로드 키만** → `/.well-known/assetlinks.json` 무효화 ③ (계정이 열린 뒤) Play Console 에서 앱 만들기 → Play App Signing 의 **앱 서명 키 SHA-256** 확인 → **assetlinks 2차 업로드**: 앱 서명 키 지문을 **추가**(업로드 키 지문은 남긴다) → 무효화 ④ 웹 배포(`tools/deploy-v1.sh`)는 PD 확인 뒤 |
| **순서 주의** | 계정 개설 전(조직 계정이면 D-U-N-S 최대 30일)에는 **개발 몫과 ADB 설치본 시험만** 진행된다. 스토어 설치 기준은 계정이 열린 뒤 잰다 — 그래서 이 단계의 2주(추정)는 계정 일정에 따라 늘어날 수 있다 |
| **산출물** | ADB 설치본 APK · 내부 테스트 트랙 AAB · assetlinks.json(1차·2차) · 법적 HTML 페이지 |
| **완료 기준(결과)** | 1. `curl -sI https://earthus.net/.well-known/assetlinks.json` → `200`, `Content-Type: application/json`, `Location` 없음. Google Digital Asset Links API(`statements:list?source.web.site=https://earthus.net…`)가 우리 패키지를 돌려준다. 2. **ADB 설치본(업로드 키)으로 먼저, 스토어 내부 트랙 설치본(앱 서명 키)으로 다시** — 두 번 다 주소창 없이 v1 지구가 뜬다. 각각 **Chrome 기본 폰 1대 + 삼성 인터넷 기본 갤럭시 1대** 결과 기록. 3. 앱 안에서 v1 → v2 로 넘어가도 주소창이 생기지 않는다. 4. 앱 안 Google·Apple 로그인이 끝까지 돌아와 로그인 상태가 화면에 보인다. 5. 내 위치 단추 → 안드로이드 위치 권한 대화상자 → 위치가 지구에 찍힌다(D6 포함 시). 6. (D5 포함 시) 서버 발송 특보가 알림 표시줄에 EARTHUS 이름으로 뜬다(Android 13+ 권한 대화상자 포함). 7. 웹에 문구 하나를 배포하면 **앱 재설치 없이** 다음 실행에 반영된다. 8. 모든 화면 값에 출처·시각이 웹과 똑같이 붙어 있다. 9. 개발자 도구로 `SALES_OPEN` 을 켠 시험 빌드에서, 앱 안 결제 단추가 **토스 창을 띄우지 않는다**(두 기기 모두). |

### PHASE 2 — 결제 (3~4주, 추정 · `SALES_OPEN` 전에만 필요)

| 담당 | 할 일 |
|---|---|
| **PD** | Play Console 상품 등록(D1 에 따라 비갱신 상품 또는 구독+`founding` 요금제) · 결제 프로필·판매자 정보 · 약관 개정 공지(가-1/가-2) · 법무 검토(가-2 의 가격 인상 opt-in) · 라이선스 테스터 지정 |
| **개발** | Digital Goods API 경로 + 네이티브 Billing 브리지(삼성 인터넷 대비) · 서버 영수증 검증·acknowledge·권한 기록 · (구독이면) RTDN 수신 · v2 등급 서버 판정(§3-5-1) · `plans` 표 정본화 |
| **완료 기준(결과)** | 1. v2 결제 단추 → **Google Play 결제 시트**가 뜨고, 라이선스 테스터 결제 뒤 서버가 검증·acknowledge 하고 v2 권한이 열린다. 2. 삼성 인터넷 기본 갤럭시에서도 앱 안에 토스 창이 뜨지 않는다(Play 시트 / 네이티브 결제 / `앱에서는 결제할 수 없습니다` 중 하나). 3. 해지·환불·만료 뒤 서버가 v2 권한을 닫고 화면이 FREE 로 돌아간다. 4. 창립 멤버 시험 계정에는 정가의 50% 상품이, 일반 계정에는 정가가 보이고, 일반 계정이 반값 상품 토큰을 보내면 **서버가 거부**한다. 5. 웹(토스)에서 산 창립 멤버와 Play 에서 산 창립 멤버의 가격 비율이 같다. 6. localStorage `earthus.tier` 를 손으로 바꿔도 v2 유료 기능이 열리지 않는다. |

### PHASE 3 — 크롬 새 탭 (2~3주, 추정 · Phase 1 과 병행 가능)

| 담당 | 할 일 |
|---|---|
| **개발** | `apps/chrome-newtab/` 구현(§4-3) · ko/en 문구 · 빌드 검사 스크립트 · 측정 스크립트 |
| **PD** | CWS 등록정보(단일 목적·권한 사유·개인정보 관행 탭) · 이미지 자산 승인 · 제출 · (D9 선택 시) 1536 px 변형 Lambda 배포 승인 · (선택) 데이터 동작에 CORS 응답 헤더 정책 — **SecurityHeaders 계열 금지**(X-Frame-Options 가 붙는다, survey-infra §4) |
| **완료 기준(결과)** | 1. 캐시가 있을 때 새 탭 첫 그림(지구+구름+관측 시각)이 **200 ms 안**(20회 중앙값). 2. 오프라인에서 마지막 그림 + `관측 HH:MM KST` + `오프라인` 문구가 보이고 요청 0건. 3. `meta.time` 이 바뀐 뒤 20분 안에 새 구름이 뜨고 **라벨 시각 = meta.time**(그림과 라벨이 같은 회차). 4. 연 뒤 5초 이후 rAF 0회·CPU ≈ 0%. 5. 화면의 모든 값 요소에 `data-source`·`data-time` 이 있다. 6. 구름 2시간 초과 → `구름 자료 지연`, 특보 `staleAfterMinutes` 초과 → "없음" 대신 `특보 자료 지연`. 7. 특보가 있으면 이름과 구역 수가, 없으면 `지금 발효 중인 기상특보 없음 · 기상청 HH:MM KST 기준` **문장이 나온다**(빈칸이면 실패). 8. 새 탭을 열자마자 치면 주소창에 들어간다, 페이지 안 검색창 없음. 9. Chrome 138+ 하단 바가 켜진 상태에서 1280×800·1366×768·1920×1080 스크린샷에 출처 줄·버튼·카드가 가려지지 않는다. 10. `지구 전체 보기` → 같은 탭 earthus.net, 다음 질문 → earthus.net/v2/. 11. 패키지에 원격 스크립트·eval 0건, 권한 3개뿐. 12. 브라우저 언어 ko → 한국어, 그 밖 → 영어. 13. 첫 설치(캐시 없음)에도 바탕+밤 경계가 200 ms 안, 구름은 도착 뒤 한 번 교체. |

### PHASE 4 — 비공개 테스트·심사·출시 (2~4주+, 추정)

| 담당 | 할 일 |
|---|---|
| **PD** | (개인 계정이면) **테스터 12명 이상 모집 · 14일 연속 유지** 뒤 프로덕션 신청 · Data safety·콘텐츠 등급·심사용 로그인 정보 제출 · 스토어 등록정보(스크린샷·피처 그래픽) · CWS 심사 대응 · 출시 버튼 |
| **개발** | 테스터 피드백 수정 · 스토어 스크린샷을 실제 화면으로 촬영 |
| **완료 기준(결과)** | Play 스토어 검색에서 EARTHUS 앱이 보이고 일반 사용자가 설치해 Phase 1 기준 2~8 을 다시 통과한다 · CWS 에서 설치한 확장이 Phase 3 기준 1~13 을 다시 통과한다 |

---

## 6. PD 결정 필요 목록

| # | 결정 | 선택지 | 추천 | 대가 |
|---|---|---|---|---|
| D1 | **앱 안 결제 방식** (상품 형태 × 결제 수단) | 가-1 기간 이용권 유지(Play 비갱신 상품) / 가-2 자동 갱신 구독으로 전환 / 가-3 앱에서는 안 팜 — × — 나-1 Play 만 / 나-2 Play+토스 병행 | **가-1 또는 가-2 × 나-1.** 가-1 은 Phase 0 사실 확인 뒤 확정 | 가-1: Play 상품 유형·수수료 UNVERIFIED. 가-2: 약관 제8조 전면 개정·법무 검토·RTDN 개발. 가-3: 결정 ①의 결제 단계가 끊김. 나-2: 네이티브·PCI DSS·24시간 보고 |
| D2 | 판매 개시일(`SALES_OPEN`)과 12-31 한국 수수료 새 체계의 선후 | 12-31 전 / 후 | 앱 출시와 판매 개시를 분리. 판매일은 D1·서버 준비(§3-5) 뒤 따로 | 전이면 15%(구독) 체계, 후면 10%+청구 수수료(한국 값 UNVERIFIED) |
| D3 | 앱 이름·패키지명 | `EARTHUS` / `net.earthus.app` · 다른 이름 | `EARTHUS`, `net.earthus.app` | 패키지명은 출시 뒤 못 바꾼다 |
| D4 | 새 탭 방식 | A iframe / **B 2D 지구** / C 서버 그림 | **B** | 2~3주 개발(추정). A 는 오늘 되지만 발열·속도·정책 위험 |
| D5 | 특보 푸시 알림 1차 포함 | 포함 / 제외 | **포함**(v1 웹푸시가 이미 있음 — `push.js`, `sw.js:182-241`). 단 v1 사실(기관 특보)만, 예보 알림은 넣지 않는다 | 삼성 인터넷 기본 폰에서 알림 위임이 안 될 수 있음(UNVERIFIED) · Android 13+ 권한 대화상자 · Data safety 신고 |
| D6 | 위치 권한 | 앱: '내 위치' 누를 때만 요청 / 요청 안 함 · 확장: 도시 선택만 | 앱은 누를 때만, 확장은 **위치 권한 없음** | 위치기반서비스사업 신고 확인 필요(`legal/README.md:11-38`) |
| D7 | 개발자 계정 유형 | **조직**(D-U-N-S, 최대 30일, 12명·14일 면제, 판매자=법인) / 개인(바로, 12명·14일 필요, 기기 인증) | **조직** — 유료 판매 앱이고 판매자 표시가 법인이어야 자연스럽다 | D-U-N-S 30일이 병목 — 첫날 신청. 개인이면 테스터 12명을 PD 가 모아야 함 |
| D8 | 홈 화면 위젯 | 1차 포함 / 제외 | **제외** | 넣으면 네이티브 공수 추가(TWA 는 웹 저장소를 못 읽음) |
| D9 | 확장용 작은 구름 변형(1536 px) | 추가 / 기존 2048 사용 | 사용자 수를 보고 결정 — 1차는 기존 2048 | 전송량 3.6 TB/월(추정, 1만 명) · 단가 UNVERIFIED |
| D10 | 비용 승인 | Play 등록 US$25(UNVERIFIED) · CWS US$5(UNVERIFIED) · D-U-N-S(비용 조사 안 됨) · CDN 전송 증가(추정) · 결제 수수료(D1·D2) | 등록비 결제는 PD 직접 | — |
| D11 | 새 탭 '내 장소' 범위 | 한국 도시만 / 해외 포함 | 1차 한국 도시만(해외는 GTS 271 KB 설계 필요) | 해외 사용자에겐 '내 장소 하늘' 줄이 빠진다 |
| D12 | v2 다음 질문 한 줄 문구·대상 | 초안 `이 구름은 닷새 뒤 어디에 있을까? → EARTHUS Intelligence` | 초안 | — |
| D13 | Edge Add-ons 동시 출시 | 동시 / 나중 | 나중(크롬 심사 통과 뒤) | 등록정보 한 벌 더 |
| D14 | CWS 개발자 이메일 | PD 지정 | 회사 도메인 공용 주소 | **바꿀 수 없다** |

---

## 7. 위험과 함정

| # | 위험 | 무엇이 일어나나 | 막는 법 |
|---|---|---|---|
| R1 | **앱 안 토스 결제창** | Play 결제 정책 위반 → 반려·삭제 | §3-4 판정(`sessionStorage`)을 Phase 1 에 넣고, `SALES_OPEN` 시험 빌드로 두 기기 확인 |
| R2 | **삼성 인터넷 기본 갤럭시** | TWA 가 삼성 인터넷으로 뜸 → 알림 위임·Digital Goods API 안 될 수 있음(UNVERIFIED) | 두 기기 완료 기준 · 결제는 네이티브 브리지 보조 |
| R3 | assetlinks 누락·오지문 | 주소창 달린 Custom Tab 으로 떨어짐. 로컬 설치(업로드 키)와 스토어 설치(앱 서명 키)가 서로 다른 지문 | **두 지문 모두** 기재 · Content-Type application/json · 리다이렉트 없음 · 무효화. Android 15+ 는 재검증 반영에 최대 7일(읽음) |
| R4 | 업로드 키 분실 | 새 버전을 못 올림(재설정 절차 필요, 읽음) | 저장소 밖 두 곳 백업, 비밀번호는 문서·채팅·커밋에 넣지 않는다(HANDOVER §7) |
| R5 | **폰에만 옛 화면이 남는 사고**(sw.js) | "배너가 옛 위치에 남는" 사고 이력(`sw.js:5-8`), v3 모듈 fetch 실패에 v1 HTML 폴백이 돌아가 0% 에서 멈춘 사고(`:89-92`). 앱은 이 SW 를 그대로 쓴다 | SW 캐시 이름은 손으로 올리는 문자열(`:18`) — 앱 출시 뒤에도 웹 배포 규칙 그대로. 주석은 지우지 않는다(§4) |
| R6 | v2 디렉터리 키 함정 | `index.html` 만 올리면 `/v2/` 는 옛 HTML(기억 `v2-directory-key-trap`) · `/v2/` 와 `/Intelligence/` 가 다른 객체 | v2 배포는 `tools/deploy-v2-three.sh` 로만 |
| R7 | 배포 스크립트를 시험으로 돌림 | 2026-09-23 가드 통과로 운영에 29개 파일이 나간 사고 | 스크립트는 `bash -n` 으로만 시험(기억 `never-run-deploy-to-test`) |
| R8 | `fallbackType: webview` | Google 로그인·Play 결제 불가 | `customtabs` 만 |
| R9 | FREE_OPEN 누출 | 스위치를 열어도 v2 는 config 가 없어 늘 FREE_OPEN · localStorage 등급은 사용자가 고칠 수 있음 | §3-5 서버 판정을 `SALES_OPEN` 조건으로 |
| R10 | 새 탭 구름·라벨 짝 어긋남 | 새 시각 라벨에 지난 그림 | `?t=<meta.time>` + 실측 확인(캐시 정책이 쿼리를 키에 안 넣을 수 있음) |
| R11 | 서버가 멈추면 새 탭도 죽는다(Earth View 사례) | 빈 새 탭 | 마지막 그림 + 그 시각 + `지연` 문구 |
| R12 | v2 주소가 셋 | 메뉴 `/Intelligence`, FOR ME `/v2/`, 실제 객체 두 벌 → 딥링크·공유가 섞임 | 앱·확장은 `/v2/`. 웹 쪽 통일은 별건으로 PD 에 올림 |
| R13 | CORS 흔들림 | earthus.net 경유 JSON 이 엣지 Hit 이면 ACAO 없음 | 확장은 host_permissions 로 받는다 · `<img crossOrigin>` 쓰지 않고 `fetch → blob → createImageBitmap` |
| R14 | Play 최소 기능·스팸 판정 | 웹 래퍼로 보이면 반려 가능(심사 통과를 보장하는 문구 없음 — UNVERIFIED) | 스크린샷·설명에 알림·위치·오프라인 셸 명시, 심사용 로그인 정보 제출 |
| R15 | 법적 페이지 미비 | 처리방침 `text/markdown`·자리표시자·웹 계정 삭제 URL 없음 → 등록 불가 | Phase 1 에 HTML 발행 |
| R16 | 위치기반서비스사업 신고 | 미확인 상태에서 위치 기능 출시 | D6 과 함께 PD 확인 |
| R17 | 동시 세션·파괴적 git | 같은 브랜치에 다른 세션 — `reset --hard` 로 남의 34파일이 날아간 사고(기억) | 새 폴더(`apps/`)에서만 작업, 내 hunk 만 커밋, 파괴적 git 금지 |
| R18 | Chrome 138+ 하단 바 | 출처 줄이 가려짐 | 하단 여백 + 세 해상도 스크린샷 기준 |
| R19 | 크롬이 없거나 매우 오래된 기기 | TWA 가 Custom Tab 으로 떨어지거나 WebGL 이 약해 지구가 느림 | `customtabs` 폴백 · 웹의 WebGL 컨텍스트 손실 안내(`main.js:2397-2413`) 그대로 · 최소 안드로이드 버전은 Phase 1 실기기로 정함(값 미정) |

---

## 8. 출처 목록 (모두 2026-09-24 열람)

**Google Play / Android** (survey-android 출처 목록)
- https://support.google.com/googleplay/android-developer/answer/14151465 — 신규 개인 계정 테스트 요건(12명·14일)
- https://support.google.com/googleplay/android-developer/answer/13628312 — 계정 종류·D-U-N-S
- https://support.google.com/googleplay/android-developer/answer/14316361 — 기기 인증
- https://support.google.com/googleplay/android-developer/answer/11926878 — 타깃 API
- https://support.google.com/googleplay/android-developer/answer/9858738 — 결제 정책
- https://support.google.com/googleplay/android-developer/answer/10281818 — 결제 정책 이해(소비 전용)
- https://support.google.com/googleplay/android-developer/answer/11222040 — 한국 결제 요건
- https://support.google.com/googleplay/android-developer/answer/112622 — 서비스 수수료
- https://support.google.com/googleplay/android-developer/answer/16954621 — 낮아진 서비스 수수료(한국 2026-12-31)
- https://support.google.com/googleplay/android-developer/answer/9899034 — 스팸(웹뷰)
- https://support.google.com/googleplay/android-developer/answer/9866151 — 스토어 그래픽
- https://support.google.com/googleplay/android-developer/answer/9842756 — Play App Signing
- https://support.google.com/googleplay/android-developer/answer/9859455 — 앱 콘텐츠 신고
- https://support.google.com/googleplay/android-developer/answer/10787469 — Data safety
- https://support.google.com/googleplay/android-developer/answer/13327111 — 계정 삭제
- https://android-developers.googleblog.com/2026/03/a-new-era-for-choice-and-openness.html
- https://android-developers.googleblog.com/2026/06/play-expanded-billing.html
- https://android-developers.googleblog.com/2026/06/android-developer-verification.html
- https://developer.android.com/google/play/billing/deprecation-faq
- https://developer.android.com/google/play/billing/subscriptions
- https://developer.android.com/develop/ui/views/layout/webapps
- https://developer.android.com/develop/ui/views/layout/webapps/guide-trusted-web-activities-version2
- https://developer.android.com/training/app-links/configure-assetlinks
- https://developer.android.com/training/app-links/verify-android-applinks
- https://developer.chrome.com/docs/android/trusted-web-activity/ · …/receive-payments-play-billing · …/android-for-web-devs · …/whats-new · …/query-parameters · …/integration-guide
- https://developers.googleblog.com/upcoming-security-changes-to-googles-oauth-20-authorization-endpoint-in-embedded-webviews/
- https://github.com/GoogleChromeLabs/bubblewrap · https://registry.npmjs.org/@bubblewrap/cli (1.25.0)
- https://github.com/GoogleChrome/android-browser-helper (TwaProviderPicker.java, trusted-web-activity-browser-support.md)
- https://dl.google.com/android/maven2/com/google/androidbrowserhelper/billing/1.2.0/billing-1.2.0.pom
- https://chromium.googlesource.com/chromium/src/+/refs/heads/main/android_webview/docs/web-platform-compatibility.md
- https://capacitorjs.com/docs/config

**Chrome 확장·웹스토어** (survey-chrome §9)
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
- https://developer.chrome.com/docs/extensions/reference/api/alarms · …/storage · …/search · …/i18n
- https://developer.chrome.com/docs/extensions/develop/concepts/service-workers/lifecycle · …/network-requests · …/storage-and-cookies
- https://groups.google.com/a/chromium.org/g/chromium-extensions/c/DNj1B3vywr0 — Chrome 138 새 탭 하단 바
- https://learn.microsoft.com/en-us/microsoft-edge/extensions/developer-guide/port-chrome-extension
- 선례: https://github.com/domoritz/himawari-8-chrome · https://9to5google.com/2024/01/29/google-shuts-down-earth-view-wallpaper-collection/ · https://chromeunboxed.com/google-earth-view-chrome-extension-new-tab-page/

**UNVERIFIED 근거로만 쓴 것(사실로 쓰지 않음)**
- Play 등록비 US$25(검색 요지) · CWS 등록비 US$5(https://support.google.com/chrome/thread/13959323, 커뮤니티) · Edge 등록비 없음(검색 요약)
- "Is this the new tab page you were expecting?" 확인 창(https://malwaretips.com/blogs/is-this-the-new-tab-page-you-were-expecting-popup/, 제3자)
- 한국 2026-12-31 청구 수수료 5% · Play 비갱신형 상품의 수수료 · Play 오퍼 최대 기간 수치 · RTDN/Play Developer API 세부 명칭
- iframe 전용 새 탭의 반려 사례 · iframe 안 Supabase 로그인 · Chrome 138 하단 바 높이 · WebGL 컨텍스트 상한 · SW 안 OffscreenCanvas
- WebView 의 `navigator.share`·웹푸시 미지원(비공식) · `document.referrer = android-app://` · 삼성 인터넷 TWA 의 알림·결제 실동작
- CloudFront 단가 · 1536 px 변형 크기 · 공수·기간 전부(추정)
- 12명 규칙이 20→12 로 바뀐 시점(2024-12, 제3자)

**저장소·실측**
- 조사 보고서: `docs/app-plan-2026-09-24/survey-repo.md` · `survey-infra.md` (+ `survey-infra-raw/`) · `survey-android.md` · `survey-chrome.md`
- `docs/HANDOVER.md` §3·§5·§7·§8 · `docs/PERF-LTE-PLAN-2026-09-23.md` · `docs/master-plan-2026.md:244-258` · `docs/research-2026-07.md:645-745` · `docs/FOUNDING-500.md` · `docs/V1-V2-UPSELL-MAP-2026-09-06.md` · `prototype/legal/terms.ko.md:94-114` · `prototype/legal/README.md`
- 운영 실측(2026-09-24 06:03~06:20 UTC): `https://earthus.net/`, `/v2/`, `/Intelligence/`, `/.well-known/assetlinks.json`(403), `/manifest.webmanifest`, `/v2/manifest.webmanifest`, 자료 경로 11건 CORS, CloudFront E193CZEBLWEB56 설정(읽기 전용)
