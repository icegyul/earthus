# 발표용 화면 캡처를 다시 찍는 법

`img/` 안의 그림은 전부 실제 서비스 화면이다. 손으로 찍으면 매번 다르게 나오고
코치마크나 마우스 커서가 끼어들어서, 아래 방법으로 자동으로 찍었다.

## 왜 이렇게 하나

- 헤드리스 크롬은 기본으로 **WebGL 이 없어서** 지구가 안 뜬다.
  `--use-angle=swiftshader --enable-unsafe-swiftshader` 를 줘야 소프트웨어로 그린다.
- 첫 실행 코치마크("지구를 돌려보세요")가 화면을 가린다.
  주소로는 못 끄니 `localStorage` 를 미리 채워 두는 페이지가 필요하다.
- 자료가 내려오고 지구가 그려질 때까지 기다려야 한다. 앱은 필요할 때만 다시 그리므로
  캡처 직전에 몇 번 더 그리라고 시켜야 한다.

## 순서

### 1. 캡처용 페이지를 만든다

`prototype/index.html` 을 그대로 복사하면서 두 조각을 끼운다.

- `<head>` 바로 뒤 — 코치마크·동의 값을 미리 넣는 인라인 스크립트
- `</body>` 앞 — 지구가 뜰 때까지 기다렸다가 카메라를 옮기고
  `?sel=` (CSS 선택자) 와 `?tap=` (버튼 글자) 를 순서대로 눌러 주는 스크립트

⚠️ **다 찍고 나면 반드시 지운다.** `prototype/` 안에 있으면 배포에 딸려 올라간다.

### 2. 로컬 서버를 띄운다

```bash
cd prototype && python3 -m http.server 8777
```

`config.local.js` 가 있어야 하므로 로컬에서 띄운다. 자료는 실제 서버에서 받아온다.

### 3. 찍는다

```bash
"/Applications/Google Chrome.app/Contents/MacOS/Google Chrome" \
  --headless=new --use-angle=swiftshader --enable-unsafe-swiftshader \
  --use-gl=angle --enable-webgl --ignore-gpu-blocklist --disable-gpu-sandbox \
  --hide-scrollbars --window-size=1600,900 --virtual-time-budget=60000 \
  --screenshot=docs/talk/img/01-globe.png \
  "http://localhost:8777/_shot.html?lon=127.5&lat=34&h=15000000"
```

한 장에 40–70초 걸린다. 소프트웨어 렌더링이라 느린 게 정상이다.

### 이번에 쓴 값

| 파일 | 쿼리 |
|---|---|
| `01-globe.png` | `lon=127.5&lat=34&h=15000000` |
| `02-layers.png` | `sel=#menuTab\|[data-open="earth"]` |
| `03-migbird.png` | `lon=130&lat=37&h=5200000&sel=#menuTab&tap=취미\|철새` |
| `04-seabird.png` | `lon=127.5&lat=35.5&h=3200000&sel=#menuTab&tap=취미\|바닷새` |
| `05-korea.png` | `lon=127.8&lat=36.2&h=2400000` |
| `06-update.png` | `sel=#menuTab\|[data-act="settings"]&tap=업데이트` |
| `07-subscribe.png` | `sel=#menuTab\|[data-act="settings"]&tap=구독하기` |
| `08-typhoon.png` | 태풍은 좌표가 매번 다르다 — 캡처 페이지에 태풍 전용 분기를 넣어 찍었다. `?tc=이름` 딥링크로 열어 찍어도 된다 |

`#` 과 `[` `]` `"` 는 주소에서 `%23` `%5B` `%5D` `%22` 로 바꿔 넣어야 한다.

## 발표 자료 자체를 그림으로 뽑을 때

`index.html` 도 같은 방법으로 찍을 수 있다. 이쪽은 WebGL 이 필요 없다.

```bash
cd docs/talk && python3 -m http.server 8778
"/Applications/Google Chrome.app/Contents/MacOS/Google Chrome" \
  --headless=new --hide-scrollbars --window-size=1600,900 --virtual-time-budget=6000 \
  --screenshot=/tmp/25.png "http://localhost:8778/index.html#25"
```

`?all` 을 붙이고 창을 길게 잡으면 여러 장을 한 그림에 담을 수 있다.
