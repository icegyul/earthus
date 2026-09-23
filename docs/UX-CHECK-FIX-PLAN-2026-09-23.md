# UX 자동 점검 고침 계획 — 2026-09-23

> 상태(2026-09-23): **A 21건 반영·운영 배포 완료.** B1~B6 은 PD 결정 대기. C 는 그대로 둔다.
> 점검기: `node tools/ux-check/run.mjs` (결과 `build/ux-check/<시각>/report.html`). 아래 줄 번호는 고치기 **전** 기준이다.
> A 반영 중 계획과 달라진 것: A6 퀵메뉴는 닫기 전에 hit 를 먼저 쥔다(안 그러면 onPick 이 null 을 받는다) · A13 가드를 사건 표식(.feed-mark) 콜백에도 넣었다(서랍 열린 채 창 두 개) · A21 은 `(max-width:640px)` 로 닫았다(데스크톱 10.5px 유지) · v1 출처 독이 커져 큰 온도(.amb-bottom)를 132→144 로 올렸다.

---

**UX 자동검사 수정 계획 (2026-09-23): 확인된 38건 → A(지금 할 것) 21 · B(PD 결정) 6 · C(그대로 둠) 9, 검사기 규칙은 따로 정리**

- 이번 작업은 읽기 전용이었다. 인용한 줄은 직접 다시 열어 맞는지 확인했다. 시험 파일은 돌리지 않았다.
- 주석을 고칠 때는 지우지 않고, 원래 줄 아래에 `(2026-09-23 정정)` 한 줄을 덧붙인다(AGENTS.md §4).

---

## A. 지금 할 것 (실제 문제 · 작업량 S · 위험 낮음)

### A-v2 — `prototype/v2-three/` (배포: `tools/build-v2-bundle.sh` → `tools/deploy-v2-three.sh`)

**따로 고쳐도 되는 것**

1. **보이지 않는 국가 지표 팝업이 Tab 순서와 스크린리더에 남아 있다.**
   - `index.html:1345-1346` → `opacity:0; transform:translateY(4px) scale(.97); pointer-events:none; visibility:hidden;` 와 `transition: opacity .16s, transform .16s, visibility 0s linear .16s;`
   - `index.html:1348` → `#pop-menu.show{opacity:1;transform:none;pointer-events:auto;visibility:visible;transition-delay:0s}`
   - 같은 파일에 이미 같은 방식이 있다: `index.html:503` `#quake-cap:not(.show){visibility:hidden}`.
2. **axe 치명 오류 5건(aria-checked 없음).**
   - `js/pop-metric-menu.js:40` 다음 줄에 `this._paintActive();` 를 넣는다.
   - `:34` 에 `aria-label`(ko '지표 선택' / en 'Metric')을 붙인다.
3. **'왜 안 되나' 설명이 보조기기에 전달되지 않는다.**
   - `:36-37` 준비 안 된 버튼에 `aria-describedby` 를 붙이고, 사유를 담은 숨긴 span 을 둔다.
   - `:62-64` tip div 에 `aria-hidden="true"` 를 준다.
4. **'준비 중' 글자가 8px에 흰색 30%라 읽히지 않는다.**
   - `index.html:1362` → `font-size:10px; color:rgba(255,255,255,.55)`. letter-spacing .04em 은 그대로 둔다.
   - 두 검증자가 .5 와 .55 로 갈렸는데, .55 로 정했다.
5. **팝업의 사유 문장이 사실과 달라졌다('지어내지 않는다' 위반).**
   - 틀린 문장: `pop-metric-menu.js:19`(바람은 화살표뿐), `:21`(강수는 지점 관측뿐), 헤더 `:6-8`.
   - 근거: `main.js:2927-2928` 은 이미 기온·바람·강수를 GFS 0.5° 프레임에서 읽는다.
   - 할 일: 문장을 사실대로 고치고, 헤더에 날짜 붙인 정정 줄을 더한다.
   - PD 가 B1 에서 '실제 조회로 연다'를 고르면 이 세 버튼의 문장 수정은 필요 없어진다. 습도 문장은 어느 쪽이든 남는다.
6. **우클릭 퀵메뉴의 투명한 원이 폰 좌상단에서 탭과 드래그를 가로챈다.**
   - `index.html:1384` 의 `pointer-events:auto` 를 `:1391` `#quick-menu.show .qk-item` 으로 옮긴다.
   - `:1381` 규칙에는 `pointer-events:none; visibility:hidden` 을 둔다.
   - transition 은 기존 문자열 **뒤에** `, visibility 0s linear .18s` 를 붙인다. `quick-menu.test.mjs:44` 정규식이 앞부분을 고정하기 때문이다.
   - `.show` 에는 `visibility:visible; transition-delay:0s` 를 둔다.
   - `js/quick-menu.js:74` 다음 줄에 `this._hit = null;` 을 넣는다.
7. **사건 목록의 별(☆) 단추가 26px라 빗나가면 사건 화면이 열린다.**
   - 폰 블록(`index.html:1450~`)에 추가: `.feed-follow{position:relative}.feed-follow::after{content:'';position:absolute;inset:-9px}` → 표적 44px.
8. **Intelligence 시트의 ✕ 가 폭 32px이다.**
   - `js/information-access.css:27` 다음 줄에 추가: `#intel .intel-tabs #intel-close::after{content:'';position:absolute;top:0;bottom:0;left:-4px;right:-8px}`
   - 탭 폭은 건드리지 않는다. 3열 탭 격자는 이미 겹침 사고가 난 곳이다(`ui-shell.js:931`).
9. **폰 시트 손잡이가 높이 22px이다.**
   - `index.html:1574` → `height:30px; margin:-12px 0 0; padding:12px 0 14px`
   - 막대 그림과 탭의 위치는 변하지 않는다(border-box, `:64`).
10. **손잡이로 내린 peek 단계가 자기 명세(`:1570` '탭 줄과 첫 카드 머리만')를 못 지킨다. 지금은 탭 격자만 보인다.**
    - `:1582` 옆에 추가: `#intel[data-sheet="peek"] .intel-tabs button[data-tab]{display:none}` 와 `#intel[data-sheet="peek"] .intel-tabs{min-height:30px;margin-bottom:0}`
    - `:1580-1581` 아래에 정정 줄을 단다: "peek 에서만 걷는다. half·full 의 탭은 그대로다."
11. **full 시트 높이를 이 파일이 스스로 금지한 vh 단위로 적었다.**
    - `index.html:1585` 의 `100vh` 를 `100dvh` 로 바꾼다. 시험에 영향이 없다.
    - `:1583` 의 `31vh` 는 `m1-bottom-sheet.test.mjs:39` 정규식을 `(\d+)d?vh` 로 같이 고칠 때만 바꾼다.

**PD 가 직접 지적한 '창' — 두 묶음**

12. **폰 메뉴 서랍이 화면의 55%를 덮는다. 고치면 43%가 된다.**
    - `index.html:1484` 와 `:1488` 을 **반드시 함께** `min(300px, calc(100vw - 46px))` 로 바꾼다. `:1488` 을 빠뜨리면 브랜드 손잡이가 화면 가운데에 뜬다.
    - `:1486` → `max-height:min(58dvh, calc(100dvh - var(--nav-reserve) - 48px))`
    - `:1485` 의 가운데 정렬(`:1471-1472` 기록)과 데스크톱의 470px 은 그대로 둔다.
    - 되돌리지 않고 넘어가도 되는지 확인하려면 `phone-reach-2026-09-21.test.mjs` 를 돌려야 한다. 셈으로는 통과한다.
13. **서랍이 열리면 지구가 0% 보인다(스크림). 고치면 약 31%가 된다. 두 줄은 한 묶음이다.**
    - `index.html:1491` → `#menu-scrim.on{display:block;pointer-events:none}`. `:1489-1490` 기록(닫혀 있을 때 display:block 금지)은 그대로 지켜진다.
    - `main.js:2618` pointerdown 맨 앞, 길게 누르기 타이머를 걸기 **전에** 넣는다: `if (shell.isFlyoutOpen() && matchMedia(PHONE_MQ).matches) { downAt = null; shell.closeFlyout(); closeDrawers(); return; }`. `PHONE_MQ` 는 `main.js:4202` 에 있다.
    - 이렇게 하면 서랍을 닫으려는 탭이 나라를 고르지 않는다. 데스크톱 동작은 바뀌지 않는다.

**하단 예산 묶음 — 한 커밋으로, 360·402폭 × 한국어·영어로 다시 잴 것**

14. **좌하단 출처 줄(#srcNote)이 8.5px이다.**
    - `index.html:286` 뒤에 추가: `@media (max-width:640px) and (orientation:portrait){#srcNote{max-width:calc(100vw - 52px - env(safe-area-inset-left) - env(safe-area-inset-right));font-size:10px}}`
    - `:533` 에서 `font-size:10px` 만 지운다. #hud-line 이 11px로 돌아가고 padding 은 그대로다.
    - 동반 수정 ①: `:1552-1555` #hud-more::after 를 `top:-6px; transform:translateX(-50%)` 로 바꿔 아래로만 번지게 한다. 이것은 C 에 둔 의도된 표적을 고치는 일이므로 `:1546-1549` 아래에 정정 줄을 단다.
    - `--nav-lift` 158→168(②안)은 쓰지 않는다. 하단 사슬 전체가 움직인다.
    - 상한: 10.5px까지. 11px는 hud 윗변이 알약 아랫변 158을 넘는다.

### A-v1 — `prototype/` (배포: `tools/deploy-v1.sh`)

15. **#spotChips 에 aria 금지 속성이 걸려 있다.**
    - `index.html:414` → `<div id="spotChips" role="group" aria-label="오늘의 볼거리">`
16. **지구 전환 로고 버튼이 40px이다. 이 파일은 v2 도 쓰므로 v1 배포로 올려야 v2 에도 반영된다.**
    - `js/earth-switch.js:124-130` 좁은 화면 블록에 추가: `.es-logo{position:relative;overflow:visible}` · `.es-logo img{border-radius:10px}` · `.es-logo::after{content:'';position:absolute;inset:-3px}` → 표적 44px.
    - 크기를 직접 키우는 대안은 쓰지 않는다. v2 `main.js:5372` 가 이 버튼 위치로 패널 위치를 잡아 연쇄가 생긴다.
17. **검색창을 열었을 때 입력칸 높이 22px, ✕ 24px이다.**
    - `css/app.css:1630` → `padding:4px 4px 4px 13px`
    - `:1635` #searchInput 에 `min-height:44px` 추가
    - `:1641-1642` #searchClose → `padding:0; min-width:44px; min-height:44px`
    - 머리 줄 높이는 52px 그대로다. 16px 글꼴(`:1632-1633`, iOS 자동 확대 방지)은 건드리지 않는다.
18. **HUD 다시 열기 버튼(#hudShow)이 23px이다.**
    - `app.css:397` 뒤에 추가: `#hudShow::after{content:'';position:absolute;inset:-10px -6px}`
    - 보이는 크기와 흐림은 의도이므로 그대로 둔다(`ui.js:2213`). -11px로 늘리면 이웃과 닿는다.
19. **'기본 위치' 꼬리표가 9.9px이다.**
    - `app.css:2687` → `font-size:max(11px,.52em)`
    - 짝인 `weather-card-v7.css:48` → `max(11px,.55em)`
20. **[하단 예산 묶음] 좌하단 출처 독: 크레딧 6.5px, 요약 8px, 그리고 요약이 화면 밖으로 잘리는 grid 버그. 법적 크레딧 요건이 걸린 항목이다.**
    - `css/v8-shell.css:15` 블록에 `grid-template-columns:minmax(0,1fr)` 추가
    - `:112`·`:113` → `11px`
    - `:97`·`:114` → `10px`, `:96` → `.55`, `:120` → `11px`
    - `app.css:496` **와** `:549` 둘 다 → `font:400 11px ui-monospace,monospace; opacity:.8`
    - 바람 범례를 올린다: `app.css:2981`·`:3045` → `bottom:max(150px,calc(env(safe-area-inset-bottom) + 138px))`, `:2978` → `max(218px,calc(env(safe-area-inset-bottom) + 206px))`
    - 중복된 #windLegend 블록은 지우지 않는다. `:1907-1909` 주석이 같은 변경 안에서 지우는 것을 금한다.
21. **(선택) 하단 메뉴바 라벨 9.5px.**
    - `app.css:2987` 뒤에 추가: `@media (min-width:390px){body.menu-bar #menuMain .mm-item,body.menu-bar #menuMain .mm-move-item{font-size:10px}}`

---

## B. PD 가 정할 것

- **B1. 국가 지표 팝업의 기온·바람·강수 버튼 (M)**
  - 선택지 ① 권장: 실제 조회로 연다. `METRICS` 에서 세 항목을 `ready:true` 로 올리고, `main.js:3099` onPick 에서 `pointWeather(countryClick.lat, countryClick.lon, id)` 를 부른다. 습도만 사유를 달아 막아 둔다.
  - 선택지 ②: 막아 두고 '준비 중'/'soon' 문구만 바꾼다. 예: '기둥 없음'. 칸 폭은 56px이다.
  - 근거: 같은 id 가 우클릭 퀵메뉴(`main.js:3116-3117`)에서는 값을 내고, 좌클릭 팝업에서는 '준비 중'이 된다. 저장소 규칙 `ui-shell.js:1237-1238` 은 "'준비 중'으로 위장하면 사용자는 곧 열린다고 읽는다"고 적었다.
- **B2. 화면 확대 허용 여부(v1·v2 viewport 메타, 함께 결정)**
  - 확대 허용은 WCAG 1.4.4 요구다.
  - 반대 근거: 안드로이드에서 '확대에 갇힘'이 생길 수 있다. 같은 계열 증상이 `app.css:33-34` 에 사고로 기록돼 있다.
  - v2 `index.html:5-7` 의 "v1 과 맞춘다"는 이제 사실이 아니다. v1 에는 maximum-scale 이 없다.
  - 허용하면 함께 할 일: v2 입력창을 터치 기기에서 16px로(`#c-search` `:306`, `.ask-row input` `:128`, `information-access.css:29`), 그리고 `touch-action:manipulation` 규칙 추가.
  - 반영 전에 iOS 사파리·iOS 홈 화면 모드·안드로이드 크롬 실기기 확인이 필수다.
- **B3. 첫 방문 때 자동으로 열리는 '사건' 시트를 half 대신 peek 로 열지**
  - 방법: `main.js:5442` 다음 줄에 `shell.setSheet('peek')` (A10 이 먼저 들어가야 한다).
  - 효과: 첫 방문 때 지구가 51% → 약 62% 보인다.
  - 자동으로 여는 것 자체는 의도다(`main.js:5423-5429` 첫인상 기록).
- **B4. 시트 손잡이를 44px로 하고 스크롤해도 남게 할지 (M)**
  - 방법: 손잡이를 `#intel-body` 밖으로 뺀다.
  - 대가: 제자리에서 키우면 peek 118px에서 14px이 빠진다.
- **B5. 하단 3단 쌓임(타임스트립·출처 독·알약, 화면 아래 31%)을 재배치할지 (L)**
  - `--nav-lift`·`--nav-reserve` 사슬 전체와 `phone-reach` 시험의 전제를 다시 세워야 한다.
- **B6. 메뉴바 라벨을 11px로 할지 (두 줄 허용이면 하단 오프셋 사슬 재계산)**
  - 함께 정할 것: 영어 'Whole Earth' → 'Globe'(`i18n.js:220`). 상품 문구라 PD 결정이다.

---

## C. 그대로 둔다

- 상단 #btn-search·#btn-share·#btn-research(30×28), #hud-more(12×10), #ts-now·#ts-play(44×24): 이미 `::after` 로 44px 표적을 줬다(`index.html:1497-1514`, `:1546-1555`, `:1528-1538`). 검사기가 가상요소를 못 봐서 잡힌 오탐이다.
- v1 크레딧 링크(77×9): WCAG 2.5.8 의 '문장 안 링크' 예외에 해당한다. 이용 조건상 링크를 없앨 수 없다(`ui-source.js:31`). 독은 지구 조작을 위해 pointer-events:none 이다(`app.css:1284`).
- #map-attrib 10px: 2D 지도 화면에서만 보인다. 어두운 칩 위라 읽힌다.
- #hud-line 10px: A14 를 넣으면 11px로 해소된다.
- #chrome 300px: 계정·설정 진입로를 위해 넓힌 값이다(`:1493-1500`).
- 지구 전환 로고와 브랜드 손잡이가 지구를 가리는 비율: 로고는 A16 에서 표적만 넓히고, 손잡이는 A12 에서 서랍 폭과 같이 움직인다.
- v1 검색창이 닫힌 상태로 잡힌 것: inert 상태를 잰 오탐이다. 열린 상태의 문제는 A17 에서 고친다.

---

## 검사기 (`tools/ux-check/run.mjs`)

**계속 볼 것**
- axe 의 aria-required-attr, aria-prohibited-attr, meta-viewport. meta-viewport 는 B2 결정 전까지 '알려진 문제'로 표시한다.
- 지구가 보이는 비율(globePct)
- 폰 44px 미만 표적. A7·A8·A16·A17·A18 이 해소되는지 확인하는 데 쓴다.
- 출처 독이 화면 밖으로 나가는 것. 텍스트 요소의 `rect.right > innerWidth` 를 새로 검사해야 한다. `overflowX` 는 html 이 overflow-x:hidden 이면 놓칠 수 있다.

**규칙 수정**
1. `vis()`(`:48`)는 요소 자신의 opacity 만 본다. 그래서 투명한 부모 안의 자식(#pop-menu, 닫힌 #searchBox, #quick-menu, 지도 레이어)이 '보이는' 것으로 잡힌다.
   - 고칠 것: `el.checkVisibility({opacityProperty:true, visibilityProperty:true})` 를 쓰고, `el.closest('[inert],[aria-hidden="true"]')` 이면 제외한다.
   - 이 필터는 표적 검사(`:84`)와 글씨 검사(`:90`)에만 적용한다. **axe 검사에는 걸지 않는다.** axe 가 투명도 0 인 요소를 검사했기 때문에 실제 결함(보이지 않는 팝업이 Tab 순서에 남음)을 찾았다.
2. 표적 검사(`:84`): 테두리 상자가 44px 미만이면 중심 ±20px 네 점에서 `elementFromPoint` 로 표본을 뜬다. 네 점 모두 그 요소나 자식이면 통과로 본다. 이렇게 하면 가상요소 표적(C 의 3건)이 오탐에서 빠진다.
3. 문장 안 링크(부모에 다른 글이 있는 `a[href]`)는 제외한다.
   - 드래그 손잡이는 통째로 빼지 **않는다.** `.sheet-grip` 은 눌러도 단계가 바뀌는 단추다(`ui-shell.js:961-977`). 클릭 동작이 없는 손잡이만 제외한다.
4. 글씨 기준 11px(`:9`, `:90`): 10px 미만은 실패, 10~11px는 경고로 나눈다. 탭바 라벨과 법적 표기가 10px에서 계속 빨갛게 뜨지 않게 하기 위해서다.
5. 지구 비율(`:75-79`)은 두 번 잰다.
   - 첫 방문(지금 방식)
   - 평상시: `addInitScript` 로 `localStorage['earthus.v2.feedIntro']='1'` 을 넣고 잰다.
   - 지금의 51%는 첫 방문 때만 나오는 수치다. 평상시는 약 74%다.
6. 상태를 만들어서 하는 검사를 추가한다.
   - 나라를 클릭해 #pop-menu 를 연 뒤 axe 를 돌리고 `aria-checked` 를 확인한다.
   - 우클릭 후 Esc 로 닫은 뒤, 옛 항목 좌표의 `elementsFromPoint` 에 `.qk-item` 이 없어야 한다.
   - 폰에서 서랍이 열린 상태의 지구 비율을 잰다.

**관련 파일**
- `D:\## APP\EARTHUS v2_APP\prototype\v2-three\index.html`
- `D:\## APP\EARTHUS v2_APP\prototype\v2-three\js\pop-metric-menu.js`
- `D:\## APP\EARTHUS v2_APP\prototype\v2-three\js\quick-menu.js`
- `D:\## APP\EARTHUS v2_APP\prototype\v2-three\js\main.js`
- `D:\## APP\EARTHUS v2_APP\prototype\v2-three\js\information-access.css`
- `D:\## APP\EARTHUS v2_APP\prototype\index.html`
- `D:\## APP\EARTHUS v2_APP\prototype\css\app.css`
- `D:\## APP\EARTHUS v2_APP\prototype\css\v8-shell.css`
- `D:\## APP\EARTHUS v2_APP\prototype\js\earth-switch.js`
- `D:\## APP\EARTHUS v2_APP\tools\ux-check\run.mjs`