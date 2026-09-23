# B2 화면 확대 허용 — 바꿀 것, 실기기 시험, 되돌리기 (2026-09-23)

> 출처: [`UX-CHECK-FIX-PLAN-2026-09-23.md`](UX-CHECK-FIX-PLAN-2026-09-23.md) §B2.
> PD 결정: "그럼 모두 진행해". 권장안대로 **준비만 해 두고, 실기기에서 확인한 뒤에 반영**한다.
>
> ⚠️ 이 문서는 **적용하지 않은 diff** 다. 코드는 아무것도 바꾸지 않았고, 배포하지 않았다.
> 기계는 실기기를 만질 수 없다. §3 시험은 PD 가 폰으로 한다.
>
> ⚠️ 줄 번호는 이 문서를 쓴 시점(2026-09-23 저녁)의 작업 트리 기준이다. 다른 세션이 같은 파일을
> 고치고 있다(`v2-three/index.html`·`js/main.js` 미커밋, `main.js?v=196-bitems`). 적용할 때는
> 줄 번호가 아니라 **diff 안의 코드 글자로 찾는다.**

---

## 0. 화면에서 무엇이 바뀌나

- **폰에서 패널·시트·메뉴 위를 두 손가락으로 벌리면 글이 커진다.**
  - 안드로이드: 지금은 v1·v2 어디서도 안 된다.
  - 아이폰: 지금도 일부 자리에서는 된다. v1 은 지구 밖, v2 는 패널 목록 7곳이다. 이것을 모든 UI 위로 넓힌다.
- **지구 위 두 손가락은 지금처럼 지구를 확대한다.** 이 동작은 바꾸지 않는다.
- **페이지가 확대돼 있는 동안에는 지구 위 손가락을 브라우저에 넘긴다.** 이때 지구 위에서 오므리면 지구가 아니라 페이지가 100% 로 돌아온다. 100% 로 돌아오면 다시 지구가 손가락을 받는다. 이것이 '확대에 갇힘' 방지다(§2.2).
- **폰에서 검색칸·질문칸 글자가 16px 로 커진다.** v2 `#c-search` 는 12px, v1 레이어 검색은 11px 이다. 칸 높이가 몇 px 커지고, 자리표시 글이 더 일찍 잘린다. 눈으로 확인할 항목이다(§3 11번).
- **빠르게 두 번 눌러도 페이지가 확대되지 않는다.** 단추를 연타해도 페이지가 커지지 않는다.
- 검사기: axe `meta-viewport` 4건과 Lighthouse `meta-viewport` 0점이 통과로 바뀐다.
- PC: 바뀌는 것이 없다. 데스크톱 브라우저는 viewport 메타를 쓰지 않는다.

---

## 1. 지금 상태

### 1.1 viewport 메타 (지금 값 그대로)

| | 파일:줄 | content |
|---|---|---|
| v1 | `prototype/index.html:7` | `width=device-width, initial-scale=1.0, viewport-fit=cover, user-scalable=no, interactive-widget=resizes-content` |
| v2 | `prototype/v2-three/index.html:10` | `width=device-width, initial-scale=1, maximum-scale=1, viewport-fit=cover, user-scalable=no, interactive-widget=resizes-content` |
| v2 생성물 | `prototype/v2-deploy/index.html:10` | v2 와 같다. 빌드 산출물이라 손대지 않는다(`tools/build-v2-bundle.sh` 가 다시 만든다). |

- 확대를 막는 값: v1 은 `user-scalable=no` 하나다. v2 는 `maximum-scale=1` 과 `user-scalable=no` 둘이다.
- `prototype/v2/index.html:5` 에도 `user-scalable=no` 가 있다. 옛 v2 라 이번 범위가 아니다.

### 1.2 검사기가 잡은 것 (`build/ux-check/20260923-1949/`)

- axe `meta-viewport`, impact moderate, "Zooming and scaling must not be disabled". v1·v2 × 폰·PC 4쪽 모두 `meta[name="viewport"]` 1건씩이다(`results.json`).
- Lighthouse `meta-viewport` 점수는 v1(`lighthouse-v1.json`)·v2(`lighthouse-v2.json`) 둘 다 0이다. 설명: `[user-scalable="no"]` 가 쓰였거나 `[maximum-scale]` 이 5 미만이다.
- 두 검사 모두 **두 값을 빼면 통과**한다(`maximum-scale` 이 없으면 5 미만 조건도 안 걸린다).
- 근거 문서: 정보 접근성 보고서 §7 "텍스트를 200% 확대해도 …" 기준과 이 메타가 충돌한다고 이미 적혀 있다.
  - `docs/earthus-v2/PAID-UX-REDESIGN-2026-09-20/DEV-DIRECTIVE.md:3065`
  - `tools/directive-2026-09-20/spec-audit.json:751, 989, 1591`

### 1.3 지금 폰에서 실제로 일어나는 일

| | 아이폰 사파리 | 안드로이드 크롬·삼성 인터넷 |
|---|---|---|
| 메타 | iOS 10부터 사용자 핀치에 대해서는 `user-scalable=no`·`maximum-scale` 을 무시한다(`app.css:29`·`power.js:85`·v2 `index.html:5` 주석이 같은 사실을 적었다). | 메타를 지킨다. 지금은 페이지 확대가 **어디서도 안 된다.** 예외는 사용자가 접근성 설정의 '확대/축소 강제 사용'을 켠 경우다. |
| v1 | 지구(`#cesiumContainer`) 위 핀치는 `power.js:88-90` 의 gesture* 차단으로 지구 줌이 된다. **지구 밖(시트·메뉴) 위 핀치는 지금도 페이지를 확대한다.** | 확대 안 됨 |
| v2 | `main.js:726-733` 이 문서 전체의 gesture* 를 막는다. 예외는 `#panel, #menu-panel, .drawer, #intel, #sk-card, #sv-bar, #lt-bar` 7곳이다. **그 7곳에서는 지금도 페이지가 확대된다.** 하단 메뉴바·타임라인·HUD·범례 위에서는 막혀 있다. | 확대 안 됨 |
| 입력칸 자동 확대 | `maximum-scale=1` 이 있는 v2 는 16px 미만 칸을 눌러도 자동 확대가 막혀 있다. v1 은 `app.css:1648-1649` 기록대로 16px 미만이면 자동 확대를 겪는다(그래서 `#searchInput` 만 16px). | 해당 없음 |

⚠️ **아이폰의 '확대에 갇힘'은 지금도 생길 수 있다.** 시트 위에서 확대한 뒤 시트를 닫으면 화면이 거의 다 지구가 된다. 그 지구 위 핀치는 gesture* 차단에 먹혀 페이지를 되돌리지 못한다. §2.2 의 방지책은 메타를 바꾸기 전에도 이 문제를 줄인다.

### 1.4 확대와 관련된 사고 기록 (지우지 않는다)

- **`prototype/css/app.css:25-42`** — "`touch-action:none` 이 없으면 아이폰에서 두 손가락 확대가 안 된다."
  - 받은 신고(`:26-27`): 거북이선을 열고 줌인하고 움직인 뒤 줌아웃하려 하면, 한 손으로 미는 것처럼 된다.
  - 원인(`:29-32`): 사파리가 두 손가락을 먼저 가져가 페이지를 확대했다. Cesium 에는 한 손가락만 남아 오므리기가 밀기로 처리됐다.
  - **`:33-34`: "한번 페이지가 확대되고 나면 좌표까지 어긋나서 그 뒤로 계속 이상해진다. '그 뒤로 줌아웃이 잘 안 된다'가 이것이다."** 계획 문서가 말한 '확대에 갇힘' 계열이 이 두 줄이다.
- **`prototype/js/power.js:63-71`** — 손이 닿아 있는 동안 프레임을 요청하지 않아 줌인·줌아웃이 안 되던 사고다(iPhone 16). 확대 자체의 사고는 아니지만 같은 신고 묶음이다.
- **`prototype/js/power.js:85-90`** — 아이폰은 gesture* 를 따로 쏘고 `user-scalable=no` 를 무시한다. CSS 만으로는 인앱 브라우저에서 새는 경우가 있어 JS 로도 막는다.
- **`prototype/v2-three/index.html:5-7`** — 메타 주석이다(§1.5).
- **`prototype/v2-three/index.html:76-84`** — 조작면(캔버스·위성지도)은 브라우저에게 제스처를 넘기지 않는다. 핀치 줌은 OrbitCam 이 직접 처리한다.
- **`prototype/v2-three/js/main.js:723-725`** — "iOS 사파리는 touch-action:none으로도 페이지 핀치 줌을 막지 못한다." gesture 이벤트를 막아야 한다. 패널 위에서는 확대를 살려 둔다.
- **`prototype/v2-three/js/main.js:677`·`:1032`** — 브라우저 핀치를 껐으므로 지구와 지도의 핀치를 직접 처리한다.
- **`prototype/css/app.css:1648-1649`** — "font-size 는 16px 이상이어야 한다. 그보다 작으면 iOS 사파리가 입력창을 누를 때 화면을 확대해 버린다(자동 줌)."

### 1.5 v2 `index.html:5-7` "v1 과 맞춘다" — 사실 확인

- 이 주석과 `maximum-scale=1, user-scalable=no` 는 `3fd1f81c`(2026-09-04)에서 들어왔다.
  - 커밋 제목은 로고가 두 번 찍힌 사고다. 메타 변경은 거기 묶여 들어왔다.
  - 그 전 v2 메타는 `width=device-width, initial-scale=1, viewport-fit=cover` 였다. **v2 는 원래 확대를 막지 않았다.** B2 의 v2 메타는 새 시도가 아니라 그 상태로 돌아가는 것이다(`interactive-widget` 은 유지한다).
- v1 에는 **처음부터 `maximum-scale` 이 없었다.** 첫 커밋 `fa670427` 부터 `user-scalable=no` 하나뿐이다. `git log -S "maximum-scale"` 에 걸리는 것은 v2 의 `3fd1f81c` 하나다. 그러니 "v1 과 맞춘다"는 들어온 날부터 사실이 아니었다.
- "그걸 지키는 브라우저(안드로이드 등)에서는 핀치가 지구가 아니라 페이지를 확대해 버리는 걸 애초에 막아 준다"도 사실과 다르다.
  - 안드로이드에서 지구 위 핀치가 페이지로 새지 않게 막는 것은 `index.html:80-84` 캔버스의 `touch-action:none` 이다. 이 규칙은 `70366d4e`(2026-09-02)부터 있었다.
  - 메타가 추가로 한 일은 **패널 위 확대까지 막은 것**뿐이다.
- 주석의 '위 gesturestart 방지'는 이 HTML 위쪽이 아니라 `js/main.js` OrbitCam 의 gesture* 처리(`:726`)를 가리킨다.

### 1.6 계획 문서와 줄이 달라진 곳 (2026-09-23 정정)

계획 문서는 이 작업의 범위가 아니라서 여기에만 적는다.

- (2026-09-23 정정) `#c-search` 는 `index.html:306` 이 아니라 **`:316-320`** 이다(`font-size: 12px`).
- (2026-09-23 정정) `.ask-row input` 은 `:128` 이 아니라 **`:126-128`** 이다(`font-size: 12px`, `#ask-q` 가 쓴다 — `js/ask-earth.js:118`).
- (2026-09-23 정정) `information-access.css:29` 는 지금 **`:33`** 이다(`#intel .context-details input{…font:inherit}`). 사이에 `#intel-close` 주석 4줄이 들어왔다. 입력칸 규칙은 **`:9`**(`.mp-search input[type=search]{…font:inherit}`)에도 하나 더 있다. 둘 다 상속값이다. 16px 미만으로 추정하지만 재 보지는 않았다. 명시 규칙으로 덮는다(§2.4).
- (2026-09-23 정정) 계획 문서는 `touch-action:manipulation` 규칙 하나를 추가하라고 했다. 그것만으로는 안드로이드의 '확대에 갇힘'을 못 막는다. 페이지가 확대된 동안 지구 위 손가락을 브라우저에 돌려주는 규칙이 같이 필요하다(§2.2).

---

## 2. 바꿀 것 — 적용하지 않은 diff

순서: §2.1 메타는 **맨 마지막에 넣는다.** §2.2~§2.5 는 메타를 바꾸지 않아도 해가 없고, 아이폰의 지금 문제(§1.3 ⚠️)도 줄인다.

### 2.1 viewport 메타

**v1 `prototype/index.html:5-7`**

```diff
 <!-- interactive-widget=resizes-content: 주소창이 접혔다 펴졌다 할 때 "실제 보이는 영역"을
      즉시 알려 달라는 지시다(Safari 16.4+/Chrome 108+). v2·v3 에도 같은 값을 맞췄다. -->
+<!-- 2026-09-23 UX 점검 B2: user-scalable=no 를 뺐다 — 화면 확대 허용(WCAG 1.4.4, axe·Lighthouse meta-viewport).
+     지구 위 두 손가락은 css/app.css #cesiumContainer 의 touch-action:none 과 js/power.js 의 gesture* 차단이
+     계속 지구 줌으로 지킨다. 페이지가 확대된 동안의 '확대에 갇힘' 방지·실기기 시험·되돌리기:
+     docs/UX-B2-ZOOM-DEVICE-TEST-2026-09-23.md -->
-<meta name="viewport" content="width=device-width, initial-scale=1.0, viewport-fit=cover, user-scalable=no, interactive-widget=resizes-content">
+<meta name="viewport" content="width=device-width, initial-scale=1.0, viewport-fit=cover, interactive-widget=resizes-content">
```

**v2 `prototype/v2-three/index.html:5-10`** — 옛 주석은 그대로 두고 아래에 정정 줄을 단다.

```diff
 <!-- iOS 사파리는 user-scalable=no 를 iOS10부터 의도적으로 무시한다(위 gesturestart 방지가
      실제 방어선이다) — 그래도 이 값을 적어 두면 그걸 지키는 브라우저(안드로이드 등)에서는
      핀치가 지구가 아니라 페이지를 확대해 버리는 걸 애초에 막아 준다. v1 과 맞춘다. -->
+<!-- (2026-09-23 정정) "v1 과 맞춘다"는 들어온 날(3fd1f81c)부터 사실이 아니었다 — v1 에는 maximum-scale 이
+     한 번도 없었다. 안드로이드에서 지구 위 핀치를 막는 것은 이 메타가 아니라 아래 canvas 의 touch-action:none 이다.
+     이 메타가 더 한 일은 패널 위 확대까지 막은 것뿐이라 WCAG 1.4.4 에 걸렸다(axe·Lighthouse meta-viewport).
+     maximum-scale=1·user-scalable=no 를 뺐다(UX 점검 B2). '위 gesturestart' 는 js/main.js OrbitCam 의 gesture* 처리다.
+     확대에 갇힘 방지·실기기 시험·되돌리기: docs/UX-B2-ZOOM-DEVICE-TEST-2026-09-23.md -->
 <!-- interactive-widget=resizes-content: 주소창이 접혔다 펴졌다 할 때 "실제 보이는 영역"을
      즉시 알려 달라는 지시다(Safari 16.4+/Chrome 108+). 옛 브라우저는 그냥 무시한다. -->
-<meta name="viewport" content="width=device-width, initial-scale=1, maximum-scale=1, viewport-fit=cover, user-scalable=no, interactive-widget=resizes-content" />
+<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover, interactive-widget=resizes-content" />
```

`viewport-fit=cover`(노치 안전영역)와 `interactive-widget=resizes-content`(주소창·키보드)는 그대로 둔다. 둘 다 사고로 들어온 값이다.

### 2.2 '확대에 갇힘' 방지 — 핵심

**갇히는 순서.** 메타만 빼면 이렇게 된다.

1. 시트나 메뉴 위에서 두 손가락으로 벌린다. 페이지가 200% 가 된다.
2. 시트를 닫는다. 확대된 화면이 거의 다 지구가 된다.
3. 지구 위에서 오므린다.
   - 안드로이드: 캔버스가 `touch-action:none` 이라 브라우저가 핀치를 받지 않는다. 지구만 줄어들고 페이지는 확대된 채 남는다. 한 손가락으로 끌어도 지구만 돌아서 화면을 옮겨 UI 를 찾을 수도 없다.
   - 아이폰: gesture* 차단(v2 `main.js:726`, v1 `power.js:88`)이 페이지 핀치를 먹는다.
4. 되돌릴 손가락이 없다. 홈 화면 앱에는 새로고침 단추도 없다.

**방지책.** `window.visualViewport.scale` 을 본다. 페이지가 확대된 동안(`> 1.01`)은 `<html>` 에 `page-zoomed` 를 붙이고 다음을 한다.

- CSS: 조작면(지구·지도 캔버스)의 `touch-action` 을 `none` 에서 `manipulation` 으로 바꾼다. 브라우저가 한 손가락 이동과 두 손가락 확대·축소를 받는다. 확대된 페이지가 다른 웹 페이지와 똑같이 움직인다.
- JS(아이폰): gesture* 를 막지 않는다.
- JS(앱): 지구·지도는 그 동안 **손가락 끌기와 핀치를 받지 않는다.** 페이지가 줄어드는 동안 지구가 같이 돌고 튀지 않게 하기 위해서다. 톡 선택은 그대로 된다.
- 100% 로 돌아오면 클래스가 빠지고 전부 원래대로 돌아간다.

`pinch-zoom` 만 여는 방법도 있다. 그러면 한 손가락은 앱 몫으로 남는다. 하지만 위에서 앱이 손가락을 받지 않게 했으므로, 그 경우 한 손가락 끌기가 아무 일도 안 하는 죽은 손가락이 된다. 그래서 `manipulation` 을 쓴다. 이 선택은 §3 에서 실기기로 확인한다.

**v2 CSS — `prototype/v2-three/index.html:80-84` 바로 아래**

```diff
   canvas, #mapview, #map-tiles {
     touch-action: none;
     -webkit-user-select: none; user-select: none;
     -webkit-touch-callout: none;
   }
+  /* 2026-09-23 UX 점검 B2(화면 확대 허용) — ⚠️ '확대에 갇힘' 방지.
+     패널 위에서 페이지를 확대한 뒤 패널을 닫으면 화면이 거의 다 이 조작면(touch-action:none)이라,
+     안드로이드에서는 오므려도 지구만 줄고 페이지는 확대된 채 남는다(되돌릴 손가락이 없다).
+     페이지가 확대된 동안만(html.page-zoomed — js/main.js OrbitCam 이 visualViewport.scale 로 붙인다)
+     손가락을 브라우저에 돌려준다: 한 손가락 = 확대된 화면 이동, 두 손가락 = 페이지 확대·축소.
+     그 동안 OrbitCam·MapView 는 손가락을 받지 않는다(톡 선택은 된다). 100% 로 돌아오면 위 none 으로 돌아간다.
+     점수: html.page-zoomed canvas (0,1,2) > canvas (0,0,1), html.page-zoomed #mapview (1,1,1) > #mapview (1,0,0). */
+  html.page-zoomed canvas, html.page-zoomed #mapview, html.page-zoomed #map-tiles { touch-action: manipulation; }
```

**v2 JS — `prototype/v2-three/js/main.js:723-733` (OrbitCam 의 gesture* 처리)**

```diff
     // iOS 사파리는 touch-action:none으로도 페이지 핀치 줌을 막지 못한다(의도적으로 무시한다).
     // 사파리 전용 gesture 이벤트를 막아야 지구 핀치가 페이지 확대와 싸우지 않는다.
     // 글·카드를 읽는 패널 위에서는 확대를 그대로 살려 둔다.
+    // (2026-09-23 정정) '살릴 곳'(패널 7곳) 목록을 '막을 곳'(지구·지도 조작면)으로 뒤집었다 — 하단 메뉴바·
+    //   타임라인·HUD·범례가 목록에 없어 거기서는 확대가 막혔다(UX 점검 B2, WCAG 1.4.4).
+    //   ⚠️ 페이지가 이미 확대돼 있으면 어디서든 막지 않는다. 여기서 막으면 지구가 화면을 채운 순간
+    //   되돌릴 손가락이 없다('확대에 갇힘' — prototype/css/app.css 33-34 행과 같은 계열).
+    //   html.page-zoomed 는 index.html 의 조작면 touch-action 규칙과 아래 pointerdown 이 같이 본다.
+    const vv = window.visualViewport;
+    const pageZoomed = () => !!(vv && vv.scale > 1.01);
+    if (vv) {
+      const syncZoom = () => document.documentElement.classList.toggle('page-zoomed', pageZoomed());
+      vv.addEventListener('resize', syncZoom);
+      syncZoom();
+    }
     for (const type of ['gesturestart', 'gesturechange', 'gestureend']) {
       document.addEventListener(type, (e) => {
+        if (pageZoomed()) return;
         const t = e.target;
-        const inPanel = t && t.closest
-          && t.closest('#panel, #menu-panel, .drawer, #intel, #sk-card, #sv-bar, #lt-bar');
-        if (!inPanel) e.preventDefault();
+        const onSurface = t && t.closest && t.closest('canvas, #mapview, #map-tiles');
+        if (onSurface) e.preventDefault();
       }, { passive: false });
     }
```

- 이 코드는 `OrbitCam` 생성자 안에 있다. `new OrbitCam` 은 `main.js` 에 한 곳(작성 시점 `:2283`)뿐이라 한 번만 걸린다.
- 목록 밖의 작은 표지(`.feed-mark` 10px, `.sv-label`, `#quake-cap .qk-bar`)에서 시작한 핀치는 아이폰에서 페이지 확대가 된다. 크기가 작아 받아들인다. §3 에서 확인한다.
- `html.page-zoomed canvas` 는 부속 화면 캔버스에도 걸린다(은하 `galaxy-view.js`, 하늘 `sky-view.js`, 태양계 `solar-view.js`, 바다 `sim-ocean.js`, 지역 3D `local-terrain.js`). 이 화면들은 아래 pointerdown 가드를 넣지 않는다. 브라우저가 이동·확대를 가져가면 `pointercancel` 을 받을 것으로 보지만 시험하지 않았다. §3 22번으로 확인한다.

**v2 JS — `main.js` OrbitCam `pointerdown` 첫 줄(`:637` 근처, "첫 화면에서만 저절로 돌고" 주석 바로 위)**

```diff
     dom.addEventListener('pointerdown', (e) => {
+      // 2026-09-23 UX 점검 B2: 페이지가 확대돼 있는 동안 손가락은 브라우저 몫이다(index.html html.page-zoomed 규칙).
+      //   지구까지 같이 받으면 페이지를 오므리는 동안 지구가 돌고 튄다 — v1 app.css 26-32 행 신고와 같은 모양.
+      //   톡 선택은 아래 canvas 의 pointerup 이 따로 받으므로 그대로 된다.
+      if (e.pointerType === 'touch' && document.documentElement.classList.contains('page-zoomed')) return;
       // 첫 화면에서만 저절로 돌고, 사용자가 지구를 만지는 순간 자동회전은 끝난다.
```

**v2 JS — `main.js` MapView `pointerdown`(작성 시점 `:1023`)**

```diff
     el.addEventListener('pointerdown', (e) => {
+      // 2026-09-23 UX 점검 B2: 위 OrbitCam 과 같다. 확대된 페이지를 오므리다 지도 핀치(zf < 6.4 → exit)로
+      //   지도 모드가 튕겨 나가지 않게, 페이지가 확대된 동안 손가락은 브라우저 몫이다(#map-exit 는 click 이라 그대로 눌린다).
+      if (e.pointerType === 'touch' && document.documentElement.classList.contains('page-zoomed')) return;
       if (e.target.closest('#map-exit')) return;
       if (e.pointerType === 'touch') this.touches.set(e.pointerId, { x: e.clientX, y: e.clientY });
       if (this.touches.size >= 2) { this.drag = null; return; }
```

**v1 CSS — `prototype/css/app.css:40-42` 바로 아래**

```diff
 #cesiumContainer{position:absolute;inset:0;
   touch-action:none;overscroll-behavior:none;-webkit-user-select:none;user-select:none}
 #cesiumContainer canvas{touch-action:none}
+/* 2026-09-23 UX 점검 B2(화면 확대 허용) — ⚠️ '확대에 갇힘' 방지. 위 주석 33-34 행의 "한번 페이지가 확대되고
+   나면"이 이제는 의도된 동작(패널 위 두 손가락)이 된다. 지구가 화면 전체라, 확대한 채 패널을 닫으면
+   지구 위에서 오므려도 페이지가 돌아오지 않는다. 확대된 동안만(html.page-zoomed — js/power.js 가
+   visualViewport.scale 로 붙인다) 손가락을 브라우저에 돌려준다. 그 동안 Cesium 회전·줌은 power.js 가 잠시 끈다.
+   우주 화면(.cosmic-experience·#cosmicCanvas)도 화면 전체라 같이 푼다. 100% 로 돌아오면 위 none 으로 돌아간다. */
+html.page-zoomed #cesiumContainer,html.page-zoomed #cesiumContainer canvas,
+html.page-zoomed .cosmic-experience,html.page-zoomed #cosmicCanvas{touch-action:manipulation}
```

**v1 JS — `prototype/js/power.js:85-90`**

```diff
     /* 아이폰 사파리는 표준 이벤트와 별개로 gesture* 를 쏘고, user-scalable=no 를 무시한다.
        두 손가락을 사파리가 먼저 가져가면 Cesium 에는 손가락이 하나만 남아 오므리기가
        밀기로 처리된다 — CSS touch-action 만으로는 인앱 브라우저에서 새는 경우가 있어 함께 막는다. */
+    /* 2026-09-23 UX 점검 B2(화면 확대 허용): ⚠️ 페이지가 이미 확대돼 있으면 막지 않는다.
+       지구가 화면 전체라, 패널에서 확대한 뒤 패널을 닫으면 여기서 막는 순간 되돌릴 곳이 없다
+       ('확대에 갇힘' — css/app.css 33-34 행 계열). 그 동안은 Cesium 회전·줌도 잠시 끈다 — 사파리가
+       두 손가락을 가져가고 남은 한 손가락이 밀기로 처리되는 위 사고가 확대 중에 다시 나지 않게.
+       enableRotate·enableZoom 만 만진다: enableInputs 는 scene.js 가, enableTilt·enableLook 은 viewer.js 가 쓴다. */
+    const vv = window.visualViewport;
+    const pageZoomed = () => !!(vv && vv.scale > 1.01);
+    if (vv) {
+      const syncZoom = () => {
+        const z = pageZoomed();
+        document.documentElement.classList.toggle('page-zoomed', z);
+        const cc = scene && scene.screenSpaceCameraController;
+        if (cc) { cc.enableRotate = !z; cc.enableZoom = !z; }
+      };
+      vv.addEventListener('resize', syncZoom);
+      syncZoom();
+    }
     ['gesturestart', 'gesturechange', 'gestureend'].forEach((t) => {
-      el.addEventListener(t, (e) => { e.preventDefault(); wake(700); }, { passive: false });
+      el.addEventListener(t, (e) => { if (!pageZoomed()) e.preventDefault(); wake(700); }, { passive: false });
     });
```

- `scene` 은 이미 `power.js:26` 에서 `./viewer.js` 로부터 가져온다. `export let` 이라 살아 있는 바인딩이다.
- 저장소에서 `enableRotate`·`enableZoom` 을 쓰는 곳은 없다(`grep`). `enableInputs` 는 `scene.js:91,95` 가 쓰고, `enableTilt`·`enableLook` 은 `viewer.js:167-168` 이 쓴다.

### 2.3 두 번 톡 확대 끄기

확대를 허용하면, 아이폰에서 같은 자리를 빠르게 두 번 누르는 동작(타임라인 ▶·단추 연타)이 페이지 확대로 읽힐 수 있다. `touch-action` 은 조상과 교집합으로 계산된다. 그래서 `html` 에 `manipulation` 을 걸어도 캔버스의 `none`, `.ch-wrap` 의 `pan-y`, page-zoomed 조작면의 `manipulation` 은 그대로 유지된다.

**v2 `index.html:66-69` 아래**

```diff
   html, body {
     width: 100%; height: 100%; overflow: hidden; background: #030608;
     overscroll-behavior: none;
   }
+  /* 2026-09-23 UX 점검 B2 — 확대를 허용하면 빠르게 두 번 누르기(타임라인 ▶·단추 연타)가 페이지 확대로 읽힌다.
+     두 손가락 확대는 살리고 두 번 톡 확대만 끈다. touch-action 은 조상과 교집합이라 캔버스의 none 은 그대로다. */
+  html { touch-action: manipulation; }
```

**v1 `app.css:16-17` 아래**

```diff
 html,body{width:100%;height:100%;overflow:hidden;background:#000}
 html,body{height:100dvh}
+/* 2026-09-23 UX 점검 B2 — 확대를 허용하면 단추 연타가 페이지 확대로 읽힌다. 두 번 톡 확대만 끈다.
+   touch-action 은 조상과 교집합이라 #cesiumContainer 의 none·.ch-wrap 의 pan-y 는 그대로다. */
+html{touch-action:manipulation}
```

### 2.4 입력칸 16px (손가락 화면)

v2 는 `maximum-scale=1` 을 빼는 순간, 아이폰이 16px 미만 입력칸을 누를 때 페이지를 자동 확대한다(`app.css:1648-1649` 기록과 같은 동작). v1 도 `user-scalable=no` 를 빼면 같은 위험이 생긴다. v1 기록을 보면 지금도 이미 겪고 있다.

**전수 목록.** 글을 치는 칸만 적었다. range·checkbox 는 해당 없다.

| 화면 | 칸 | 지금 크기 | 위치 |
|---|---|---|---|
| v2 | `#c-search` 메뉴·장소 검색 | 12px | `index.html:316-320`, 요소 `:1775` |
| v2 | `#ask-q` 지구에 묻기 | 12px | `.ask-row input` `index.html:126-128`, 요소 `js/ask-earth.js:118` |
| v2 | 메뉴 검색 `.mp-search input[type=search]` | 상속(라벨 14px 추정) | `js/information-access.css:9` |
| v2 | `#my-lat`·`#my-lon` 좌표 입력 | 상속(추정 13px 안팎) | `#intel .context-details input` `information-access.css:33`, 요소 `main.js:3863` |
| v2 | LAB 요청 `textarea.req-input` | v1 과 같은 선언 `font:400 13.5px/1.6 inherit` 이다. 무효일 수 있고, 어느 쪽이든 16 미만이다. | `js/ext/ext.css:597-600`. ⚠️ 자동 생성 파일이라 손으로 못 고친다(파일 머리 주석). |
| v2 | 해구 고르기 `select` | 미확인 | `js/ext/hobby-dive.js:176` |
| v2 | `#travel-query` | **16px ✓** | `js/travel-catalog.css:7` |
| v1 | `#searchInput` | **16px ✓** | `css/app.css:1650-1653` |
| v1 | 레이어 검색 `.ly-search input` | 11px | `css/app.css:857-861`, 요소 `js/layerbar.js:1300` |
| v1 | 물어보기 `.ask-input` | 14px | `css/ask.css:140-143` |
| v1 | 사전등록 `#wlForm input[type=email]` | 14.5px | `css/account.css:103-104` |
| v1 | LAB 요청 `.req-input` | 13.5px로 적혀 있으나 선언 `font:400 13.5px/1.6 inherit` 는 `inherit` 가 섞여 무효일 수 있다. 어느 쪽이든 16 미만이다. | `css/account.css:485-487` |
| v1 | 우주 관제 검색·시각 `#spaceOps` 의 search·datetime-local 입력 | 상속 13px | `css/spaceops.css:19, 29` |
| v1 | 알림 설정 입력·select, 위성 입력, 구독 이메일, AETHERUS 대시보드 입력 | 미확인 | `js/ui-alerts.js:275,309,318,345` · `js/ui-sat.js:202` · `js/ui-subscribe.js:400` · `js/space/aetherus-dashboard.js:629` |

칸마다 고치지 않는다. 손가락 화면에서만 **한 규칙으로 덮는다.**

- 새 칸이 생겨도 빠지지 않는다.
- 생성 파일(`ext.css`)을 건드리지 않아도 된다.
- `!important` 를 쓰는 이유: `#c-search`(1,0,0) 같은 ID 규칙과 인라인 크기를 한 곳에서 이겨야 한다. 크기만 올리고 폭·높이·배치는 건드리지 않는다.

**v2 — `prototype/v2-three/js/information-access.css` 맨 끝.** 이 파일은 머리 주석에서 스스로 '글자 크기'를 맡는다고 적었고, 마지막에 읽힌다.

```diff
 @media(hover:hover) and (pointer:fine){.card-b button,.forme-btn{font-size:12px;min-height:32px;padding:6px 10px}.forme-back{min-height:0}}
+/* 2026-09-23 UX 점검 B2(화면 확대 허용) — 손가락 화면의 글 입력칸은 16px 아래로 내려가지 않는다.
+   ⚠️ 16px 보다 작으면 iOS 사파리가 칸을 누르는 순간 페이지를 확대해 버린다(자동 줌 — v1 css/app.css 1648-1649 행 기록).
+      지금까지는 viewport 의 maximum-scale=1 이 그걸 막고 있었는데 B2 에서 그 값을 뺐다.
+   ⚠️ !important 인 이유: #c-search(index.html, 1,0,0)·.ask-row input·ext.css .req-input(자동 생성 파일이라 손으로 못 고친다)을
+      한 곳에서 이겨야 한다. 이 파일의 STEP 56 규칙대로 글자 크기만 올리고 폭·높이·배치는 건드리지 않는다.
+   range·checkbox 는 글을 치지 않으므로 뺀다. */
+@media (pointer:coarse){
+  input:is(:not([type]),[type=text],[type=search],[type=email],[type=number],[type=tel],[type=url],[type=password],[type=date],[type=time],[type=datetime-local],[type=month],[type=week]),
+  select,textarea{font-size:16px!important}
+}
```

**v1 — `prototype/css/app.css` `#searchInput` 규칙(`:1648-1653`) 바로 아래**

```diff
 /* ⚠️ font-size 는 16px 이상이어야 한다. 그보다 작으면 iOS 사파리가
    입력창을 누를 때 화면을 확대해 버린다(자동 줌). */
 #searchInput{
   flex:1; min-width:0; min-height:44px; background:none; border:0; outline:none;
   color:var(--paper); font:400 16px/1.4 -apple-system,"Apple SD Gothic Neo","Noto Sans KR",system-ui,sans-serif;
 }
+/* 2026-09-23 UX 점검 B2(화면 확대 허용) — 위 규칙을 #searchInput 하나가 아니라 손가락 화면의 모든 글 입력칸에 건다.
+   지금 16px 미만: .ly-search input 11px · .ask-input 14px · #wlForm 이메일 14.5px · .req-input · #spaceOps 검색 13px 등
+   (전수 목록: docs/UX-B2-ZOOM-DEVICE-TEST-2026-09-23.md §2.4). v2 는 v2-three/js/information-access.css 끝에 같은 규칙이 있다.
+   !important: 칸마다 ID·짧은 font 선언이 흩어져 있어 한 곳에서 이긴다. 글자 크기만 올린다. */
+@media (pointer:coarse){
+  input:is(:not([type]),[type=text],[type=search],[type=email],[type=number],[type=tel],[type=url],[type=password],[type=date],[type=time],[type=datetime-local],[type=month],[type=week]),
+  select,textarea{font-size:16px!important}
+}
```

⚠️ v2 는 v1 의 `/js/` 모듈을 절대경로로 다시 쓴다. v1 CSS 규칙은 v1 쪽 화면에만 걸리고, v2 의 입력칸은 v2 규칙이 덮는다. 둘은 서로 영향을 주지 않는다.

### 2.5 확대 중 좌표·크기 (v2)

Cesium(v1)은 크기와 좌표를 자기 컨테이너 상자로 잰다. 그래서 v1 은 이 절이 필요 없다.

v2 는 `window.innerWidth/innerHeight` 로 캔버스 크기를 잡고, 좌표를 지구 위치로 바꾼다. 핀치 확대 중에 이 값이 '보이는 영역' 크기로 바뀌는 브라우저가 있다(아이폰 사파리는 바뀐다고 알려져 있다. 크롬은 §3 15번에서 확인한다). 그러면 두 가지가 생긴다.

- 확대 중에 회전하거나 키보드가 올라오면 `resize` 가 온다. 그때 캔버스가 '보이는 영역' 크기로 줄어 지구가 화면 구석에 작게 남는다.
- 톡 선택이 손가락 아래가 아닌 곳을 잡는다. `app.css:33` 의 "좌표까지 어긋나서"와 같은 증상이다.

100% 에서는 두 diff 모두 결과가 지금과 같다.

**`main.js` `applyResize`(작성 시점 `:6302`)**

```diff
   const applyResize = () => {
+    // 2026-09-23 UX 점검 B2: 핀치 확대 중에는 다시 재지 않는다. 확대 중 innerWidth/innerHeight 는 '보이는 영역'
+    //   크기를 줄 수 있어(아이폰) 그 값으로 캔버스를 잡으면 지구가 화면 구석에 작게 남는다. 100% 로 돌아온 순간 아래에서 한 번 잰다.
+    if (window.visualViewport && window.visualViewport.scale > 1.01) return;
     camera.aspect = window.innerWidth / window.innerHeight;
     camera.updateProjectionMatrix();
     renderer.setSize(window.innerWidth, window.innerHeight);
   };
   window.addEventListener('resize', applyResize);
+  if (window.visualViewport) {
+    let wasZoomed = false;
+    window.visualViewport.addEventListener('resize', () => {
+      const z = window.visualViewport.scale > 1.01;
+      if (wasZoomed && !z) applyResize();   // 확대를 풀고 돌아온 순간만 — 주소창·키보드 때마다 다시 재지 않는다
+      wasZoomed = z;
+    });
+  }
```

**`main.js` `raycastGlobe`(작성 시점 `:2531`)**

```diff
   const raycastGlobe = (clientX, clientY) => {
+    // 2026-09-23 UX 점검 B2: 창 크기(innerWidth) 대신 캔버스 자신의 상자로 나눈다. 100% 에서는 같은 값이고
+    //   (캔버스 #scene = fixed inset:0, 크기 = innerWidth×innerHeight), 페이지 확대 중에는 clientX 와 같은 좌표계로 잰
+    //   이쪽만 손가락 아래를 잡는다 — css/app.css 33 행 "좌표까지 어긋나서" 계열.
+    const r = canvas.getBoundingClientRect();
     const ndc = new THREE.Vector2(
-      (clientX / window.innerWidth) * 2 - 1,
-      -(clientY / window.innerHeight) * 2 + 1,
+      ((clientX - r.left) / r.width) * 2 - 1,
+      -((clientY - r.top) / r.height) * 2 + 1,
     );
```

`canvas` 는 같은 함수 범위의 `const canvas = document.getElementById('scene')`(작성 시점 `:2231`)다.

**남는 것 — 고치지 않고 시험으로 본다.** `innerWidth` 를 배치에 쓰는 곳이 v2 에 40여 곳 있다. 예: `main.js:5378` 좁은 화면 판정, `ui-shell.js:1488`, `quick-menu.js:67`, `obs-labels.js:490`, `wind-layer.js:272`. 확대 중에 이 값이 바뀌면 배치가 잠깐 폰 모양으로 바뀔 수 있다. 100% 로 돌아오면 원래대로 돌아간다. §3 에서 문제가 보이면 그때 따로 고친다.

### 2.6 고정 위치 UI — 코드 변경 없음

- `position:fixed` 인 상단바·시트·타임라인·하단 메뉴는 '레이아웃 뷰포트'에 붙는다. 그래서 핀치 확대하면 같이 커지고, 보이는 영역 밖으로 나갈 수 있다. 사용자는 화면을 끌어 옮겨서 본다. 모든 웹 페이지가 이렇게 움직이고, WCAG 1.4.4 도 이것을 허용한다.
- `html, body{overflow:hidden}` 은 문서 스크롤만 막는다. 확대된 화면을 옮기는 동작(보이는 영역 이동)은 막지 않는다.
- 확대한 채 시트 손잡이를 끄는 것, 키보드를 올리는 것(`interactive-widget=resizes-content`), 회전하는 것은 §3 에서 확인한다.

### 2.7 캐시 꼬리

HTML 은 v1(`tools/deploy-v1.sh:55` `no-cache`)과 v2(`tools/deploy-v2-three.sh:101` `index.html` → `no-cache, max-age=0`, `:170-176` `/v2/` 키 → `no-cache, no-store`) 모두 캐시되지 않는다. 그러나 v2 의 `js/*` 는 `public, max-age=60`(`:102`)이다. `js/` 아래 있는 `information-access.css` 도 여기 해당한다. 그래서 꼬리를 올려야 한다.

- v2 `index.html` 의 `<script type="module" src="./js/main.js?v=…">`: 작성 시점 `?v=196-bitems` 다. 다른 세션이 올리는 값이므로 적용할 때 한 칸 올린다.
- v2 `js/ui-shell.js:264` `information-access.css?v=20260923-uxfix` → 새 꼬리(예: `20260923-b2zoom`).
- v1 `index.html:111` `css/app.css?v=20260923-uxcheck` → 새 꼬리. `css/app.css` 는 v1 배포로 올라간다.
- v1 `js/power.js` 는 꼬리 없이 `main.js` 가 import 하고, 배포가 `no-cache` 다. 따로 할 일은 없다.
- `prototype/v2-deploy/` 는 생성물이다. diff 하지 않는다. `tools/build-v2-bundle.sh` 가 만든다.

### 2.8 하지 않는 것

- `maximum-scale=5` 같은 중간값은 쓰지 않는다. 갇힘은 배율 상한과 무관하다. 해결책은 §2.2 다.
- UA(기기 종류)를 보고 메타를 JS 로 바꾸는 방법은 쓰지 않는다. 플랫폼마다 동작이 갈라져 시험할 칸이 배로 늘어난다.
- 확대를 프로그램으로 100% 로 되돌리는 방법(메타를 잠깐 바꾸는 요령)은 쓰지 않는다. 브라우저마다 다르고, 사용자가 한 확대를 앱이 빼앗는 것이 된다.

---

## 3. 실기기 시험 절차 (PD)

### 3.0 준비

**시험 전 기준선(선택, 5분).** 안드로이드 크롬 → 설정 → 접근성 → '확대/축소 강제 사용'을 켠다. 지금 운영 중인 `earthus.net/v2/` 에서 아래 6·7번을 해 본다. 갇히면, §2.2 없이 메타만 빼면 모든 안드로이드 사용자가 이렇게 된다는 뜻이다. 끝나면 설정을 원래대로 끈다.

**반영 전 시험 서버.** 운영에 올리지 않고 시험한다. 배포 스크립트를 시험용으로 돌리지 않는다.

1. 다른 세션이 §2 diff 를 **작업 트리에만** 적용한다. 커밋·배포는 하지 않는다.
2. 안드로이드(크롬·삼성 인터넷):
   - PC 에 USB 로 연결하고 USB 디버깅을 켠다.
   - `adb reverse tcp:8777 tcp:8777` 을 실행한다.
   - `node tools/dev_static_server.mjs 8777` 로 서버를 띄운다.
   - 폰에서 `http://localhost:8777/`(v1)와 `http://localhost:8777/v2-three/`(v2)를 연다.
3. 아이폰(adb 가 없다): 같은 와이파이에서 PC 로 접속한다. 지금 서버는 `127.0.0.1` 에만 묶여 있다(`tools/dev_static_server.mjs:78`). 한 줄을 바꾸면 된다(적용 안 함).

   ```diff
   -}).listen(port, '127.0.0.1', () => console.log(`earthus static dev server: http://127.0.0.1:${port}/ (root=${root})`));
   +}).listen(port, process.env.EARTHUS_DEV_HOST || '127.0.0.1', () => console.log(`earthus static dev server: http://${process.env.EARTHUS_DEV_HOST || '127.0.0.1'}:${port}/ (root=${root})`));
   ```

   - PowerShell 에서 `$env:EARTHUS_DEV_HOST='0.0.0.0'; node tools/dev_static_server.mjs 8777` 를 실행한다.
   - `ipconfig` 로 PC 의 IPv4 주소를 찾는다.
   - 아이폰에서 `http://<PC IPv4>:8777/` 와 `/v2-three/` 를 연다.
   - Windows 방화벽이 물으면 **개인 네트워크만** 허용한다. 공용 와이파이에서는 하지 않는다. 시험이 끝나면 서버를 끈다.
4. 자료(S3)가 안 뜨면 CORS 때문일 수 있다. 확대 시험에는 패널이 열리기만 하면 된다. ☰ 메뉴 패널은 자료 없이도 열린다.
5. v2 는 로컬에서 `/v2-three/` 로 연다. 로컬의 `/v2/` 는 옛 `prototype/v2/` 다.
   - `/v2-three/js/main.js` 의 `../../vendor/…`·`../../js/…` 와 `index.html` 의 `/js/earth-switch.js` 는 서버 뿌리(`prototype/`) 기준으로 풀린다. 파일이 있는 것은 확인했다.
   - **폰을 들기 전에 PC 브라우저에서 `http://127.0.0.1:8777/` 과 `/v2-three/` 가 뜨는지 먼저 본다.**

**기기·모드.** 칸마다 따로 적는다.

- **iS** = 아이폰 사파리
- **iH** = 아이폰 홈 화면 앱. 사파리 공유 → 홈 화면에 추가.
  - v1 은 `manifest.webmanifest` 가 `display: standalone` 이고 `apple-mobile-web-app-capable` 이 있다.
  - v2 는 로컬에서 `/v2-three/` 를 따로 추가한다.
  - 홈 화면 앱은 사파리와 메타를 다르게 다룰 수 있고, 주소창·새로고침이 없다. 갇히면 빠져나갈 길이 없으므로 따로 본다.
- **AC** = 안드로이드 크롬. 접근성 '확대/축소 강제 사용'은 **꺼 둔다**(기본값).
- **SI** = 삼성 인터넷(갤럭시). 설정의 강제 확대('Manual zoom' 계열) 항목은 **기본값**으로 둔다.
- (선택) **KT** = 카카오톡 인앱 브라우저. 링크를 카톡으로 보내 연다. `power.js:87` 이 '인앱 브라우저에서 샌다'고 적은 곳이고, 한국 사용자의 첫 진입로다.

각 칸에 ☐ 통과 / ☒ 실패 로 표시한다. **v1 과 v2 를 각각 한 번씩** 한다. v2 기준으로 적었고, v1 에서 다른 곳은 괄호에 적었다.

### 3.1 시험 순서

| # | 할 일 | 통과 기준 | iS | iH | AC | SI | KT |
|---|---|---|---|---|---|---|---|
| 1 | 첫 화면을 연다. | 화면이 폭에 맞게 100% 로 열린다. 가로로 밀리지 않는다. | ☐ | ☐ | ☐ | ☐ | ☐ |
| 2 | **지구 위**에서 두 손가락으로 벌리고 오므린다. | 지구만 확대·축소된다. 상단바·버튼 크기는 그대로다. | ☐ | ☐ | ☐ | ☐ | ☐ |
| 3 | 지구 위에서 한 손가락으로 끈다. 두 손가락을 같이 위아래로 민다(v2 틸트). | 지구가 돈다. 틸트가 된다. 페이지는 움직이지 않는다. | ☐ | ☐ | ☐ | ☐ | ☐ |
| 4 | **패널 위**에서 벌린다. v2: 한국 땅을 눌러 Intelligence 시트를 half 로 열고 시트 글 위에서 벌린다. ☰ 메뉴 패널 위에서도 한다. (v1: 날씨 시트나 레이어 메뉴 위) | 페이지 전체가 확대되고 글이 커진다. | ☐ | ☐ | ☐ | ☐ | ☐ |
| 5 | 확대된 채 패널 글 위에서 한 손가락으로 끈다. | 확대된 화면이 따라 움직인다. | ☐ | ☐ | ☐ | ☐ | ☐ |
| 6 | 확대된 채 **지구 위**에서 오므린다. | **페이지가 100% 로 돌아온다.** 지구가 같이 튀거나 돌지 않는다. | ☐ | ☐ | ☐ | ☐ | ☐ |
| 7 | **갇힘 재현.** 4번처럼 확대한 뒤 시트 ✕ 로 닫는다. 화면에 지구만 보이게 끌어 옮긴다. 지구 위에서 오므린다. | **100% 로 돌아온다.** 한 손가락으로 끌면 확대된 화면이 움직인다(지구가 돌지 않는다). | ☐ | ☐ | ☐ | ☐ | ☐ |
| 8 | 100% 로 돌아온 뒤 지구 위에서 다시 벌린다. | 다시 지구가 확대된다. 페이지는 확대되지 않는다. | ☐ | ☐ | ☐ | ☐ | ☐ |
| 9 | **좌표.** 확대된 채 지구 위 도시(서울 등)를 한 번 톡 누른다. 100% 로 돌아온 뒤 다시 누른다. | 두 번 모두 누른 자리의 지점이 잡힌다. | ☐ | ☐ | ☐ | ☐ | ☐ |
| 10 | **자동 확대.** v2: ⌕ 검색칸, 지구에 묻기 질문칸, ☰ 메뉴 검색칸을 누른다. (v1: 🔍 검색, 레이어 검색, 물어보기, 사전등록 이메일) | 누르는 순간 페이지가 저절로 확대되지 **않는다.** 키보드가 올라와도 칸이 보인다. | ☐ | ☐ | ☐ | ☐ | ☐ |
| 11 | **눈 확인.** 위 칸들의 글자가 16px 로 커진 모습. | 칸 밖으로 넘치지 않고, 옆 단추와 겹치지 않는다. 자리표시 글이 잘리는 정도는 PD 가 판단한다. | ☐ | ☐ | ☐ | ☐ | ☐ |
| 12 | **두 번 톡.** 타임라인 ▶, 시간 단추, 패널 빈 글 위를 빠르게 두 번 누른다. | 페이지가 확대되지 않는다. 단추는 두 번 눌린다. | ☐ | ☐ | ☐ | ☐ | ☐ |
| 13 | **회전.** 확대된 채 세로 → 가로 → 세로로 돌린다. 그다음 100% 로 오므린다. | 지구가 화면 전체를 채운다. 캔버스가 구석에 작게 남지 않는다. | ☐ | ☐ | ☐ | ☐ | ☐ |
| 14 | **시트.** 확대된 채 시트를 열고 닫고, 손잡이를 peek→half→full 로 끈다. (v1: 날씨 시트 열고 닫기) | 시트가 손을 따라온다. 닫힌 뒤 6번처럼 되돌릴 수 있다. | ☐ | ☐ | ☐ | ☐ | ☐ |
| 15 | **기록만(v2).** 100% 에서 HUD 진단 단추(`#hud-more`)를 눌러 진단의 `화면 W×H` 를 적는다(`main.js` 진단 줄 "화면 …×… · DPR"). 확대한 뒤 다시 적는다. | 판정하지 않는다. 확대 중에 W×H 가 바뀌는지만 적는다(§2.5 '남는 것'의 근거). | 100%: ___ / 확대: ___ | | | | |
| 16 | 확대된 채 **하단 메뉴바·타임라인 위**에서 벌리고 오므린다. | 페이지가 확대·축소된다. 전에는 v2 아이폰에서 막혀 있었다. | ☐ | ☐ | ☐ | ☐ | ☐ |
| 17 | **v2 위성지도(2D 지도 모드).** 지도 위에서 벌린다. 그다음 패널에서 페이지를 확대하고 지도 위에서 오므린다. | 벌리면 지도가 확대된다. 확대 상태에서 오므리면 페이지가 돌아오고 지도 모드는 그대로 남는다. | ☐ | ☐ | ☐ | ☐ | ☐ |
| 18 | **홈 화면 앱 전용(iH).** 확대한 채 앱을 백그라운드로 보냈다가 돌아온다. | 6·7번처럼 되돌릴 수 있다. | — | ☐ | — | — | — |
| 22 | **v2 부속 화면.** 은하·하늘·태양계·바다·지역 3D 화면을 하나씩 연다. 각 화면에서 두 손가락으로 벌리고, 패널에서 페이지를 확대한 뒤 그 화면 위에서 오므린다. | 벌리면 그 화면이 확대된다. 확대 상태에서 오므리면 페이지가 돌아오고, 그 화면이 튀지 않는다. | ☐ | ☐ | ☐ | ☐ | ☐ |

### 3.2 v1 전용 — 사고 기록 그대로 재현 (`app.css:26-27`)

| # | 할 일 | 통과 기준 | iS | iH | AC | SI | KT |
|---|---|---|---|---|---|---|---|
| 19 | 메뉴에서 **'방류된 거북이 지나간 길'**(거북이선, `js/ui-outdoor.js:83`)을 켠다. 지구를 두 손가락으로 확대하고, 한 손가락으로 옮긴 뒤, 두 손가락으로 오므린다. | 오므리기가 **축소로** 처리된다. 밀기로 처리되지 않는다. 페이지는 확대되지 않는다. | ☐ | ☐ | ☐ | ☐ | ☐ |
| 20 | 19번 뒤 지구 위 한 곳을 톡 누른다. | 누른 자리가 잡힌다("그 뒤로 계속 이상해진다"가 없다). | ☐ | ☐ | ☐ | ☐ | ☐ |
| 21 | 우주 화면(`.cosmic-experience`)에 들어가 두 손가락으로 확대한다. 그다음 7번과 같은 갇힘 재현을 한다. | 우주 줌이 되고, 갇히지 않는다. | ☐ | ☐ | ☐ | ☐ | ☐ |

### 3.3 판정

- **반영 중단**(하나라도 실패하면 메타를 바꾸지 않는다): 2, 6, 7, 8, 9, 10, 19.
  - 어느 한 기기·모드에서라도 실패하면 중단이다.
  - 특히 **iH 에서 7번 실패는 사용자가 앱을 강제 종료하는 수밖에 없다.**
- **고치고 반영**(메타는 바꾸되 같은 날 따로 고친다): 5, 12, 13, 14, 16, 17, 18, 20, 21, 22.
  - 단, 17·21·22 에서 '되돌리지 못함'(갇힘)이 나오면 반영 중단으로 올린다.
- **판단**: 11번(글자 크기 모양)은 PD 가 결정한다. 15번은 기록만 한다.
- KT 는 선택이다. 실패해도 중단 사유로 삼을지는 PD 가 정한다(카톡 유입 비중에 따라).

### 3.4 반영 후 (운영)

1. 이 문서를 쓴 세션은 배포하지 않았다. 반영은 PD 확인 뒤에 한다.
   - v1: `tools/deploy-v1.sh`
   - v2: `tools/build-v2-bundle.sh` → `tools/deploy-v2-three.sh`
   - ⚠️ `/v2/` 디렉터리 키 함정이 있다. `index.html` 만 손으로 올리면 `/v2/` 는 옛 HTML 을 준다. 반드시 업로더로 올린다.
2. 운영에서 3.1 의 2·6·7·10 을 한 번 더 한다. 로컬과 운영은 출처(https)와 캐시가 다르다.
3. `node tools/ux-check/run.mjs` 를 다시 돌린다. 이 도구는 `earthus.net` 을 본다.
   - 기대: axe `meta-viewport` 가 사라진다. Lighthouse `meta-viewport` 가 1 이 된다.
   - globePct·44px 결과는 이 변경으로 바뀌지 않아야 한다.

---

## 4. 되돌리기

**빠른 되돌리기 — 메타 한 줄씩.** 어느 기기에서 갇힘이 나오면 이것만 한다.

- v1 `prototype/index.html:7` 의 `content` 를 `width=device-width, initial-scale=1.0, viewport-fit=cover, user-scalable=no, interactive-widget=resizes-content` 로 되돌린다.
- v2 `prototype/v2-three/index.html:10` 의 `content` 를 `width=device-width, initial-scale=1, maximum-scale=1, viewport-fit=cover, user-scalable=no, interactive-widget=resizes-content` 로 되돌린다.
- 두 HTML 은 `no-cache` 라 다음 접속부터 바로 적용된다. v2 는 빌드 → 배포 순서를 지킨다(§3.4 의 `/v2/` 키 함정).
- **§2.2~§2.5 는 남겨 둬도 된다.**
  - 메타가 확대를 막으면 안드로이드에서는 `visualViewport.scale` 이 1 에 머문다. `page-zoomed` 가 붙지 않으니 지금과 똑같이 움직인다.
  - 아이폰은 원래 메타를 무시하고 확대되던 곳이다. 거기서는 §2.2 가 지금의 갇힘(§1.3 ⚠️)을 오히려 줄인다.
  - 16px 입력칸도 동작에는 해가 없다. 글자 크기는 바뀐 채로 남는다. 모양이 문제면 §2.4 규칙 블록만 뺀다.
- 메타 주석에 한 줄을 단다: `(YYYY-MM-DD 정정) B2 메타를 되돌렸다 — <실패한 기기·시험 번호>`. 넣었던 B2 주석은 지우지 않는다.

**전부 되돌리기.** B2 를 커밋 하나로 넣었다면 `git revert <그 커밋>` 으로 되돌린다.

- 같은 브랜치에 다른 세션이 있다. 되돌릴 때 남의 hunk 가 섞이지 않게 **B2 커밋 하나만** revert 한다. 작업 트리에서 손으로 되돌린다면 내 hunk 만 역패치한다.
- 캐시 꼬리(§2.7)도 다시 한 칸 올린다. 되돌린 CSS·JS 를 브라우저가 새로 받게 하려면 꼬리가 바뀌어야 한다.

**한 기기만 실패할 때.** 기기별 분기는 하지 않는다(§2.8). 실패한 시험 번호와 기기를 여기 표에 적는다. 원인(§2.2 의 어느 규칙이 그 브라우저에서 안 먹혔는지)을 고친 뒤 3.1 을 다시 한다.
