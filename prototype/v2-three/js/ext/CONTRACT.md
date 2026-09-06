# ext 모듈 규약 (v2-three · LAB · 취미 이식) — 2026-09-06

런타임: `prototype/v2-three/js/ext-scene.js` (`ExtScene`). 반드시 먼저 읽을 것. 이 문서는 요약이다.

## 파일과 이름
- 모듈 파일: `prototype/v2-three/js/ext/<key-with-dash>.js`, `export default { … }`.
  키 ↔ 파일 표는 ext-scene.js 의 `MODULES` 에 이미 있다 (예: `hobby/surf` → `hobby-surf.js`).
- 모듈 전용 CSS 가 필요하면 `prototype/v2-three/js/ext/<name>.css` 를 만들고
  `ctx.css(new URL('./<name>.css', import.meta.url).href, '<name>-css')` 로 한 번 붙인다.
- 공용 `ext.css` 에는 1.0 의 `.mt-* .sf-* .fs-* .pg-* .out-* .td-* .ch-* .cr-* .req-* .rq-* .tt-* .sb-* .ocean-* .trench-* .lab-report-* .comm-* .kr-note .sub-legal` 규칙이
  그대로 뽑혀 들어간다(런타임이 자동 로드). 1.0 카드의 class 이름을 그대로 쓰면 모양이 따라온다.
- `main.js`, `ui-shell.js`, `ext-scene.js`, `ext.css` 는 **고치지 않는다** (통합 담당이 따로 있다).

## default export 모양
```js
export default {
  key: 'hobby/surf',
  title: '서핑',                 // 카드 제목 (문자열 또는 (state)=>string)
  badge: 'MODEL',                // dataBadge 상태 (문자열 또는 (state)=>string)
  async load(ctx, state, signal) {},   // 자료를 받아 state 에 채운다. 실패는 throw (런타임이 UNAVAILABLE 카드 + 다시 시도 버튼을 그린다)
  build(ctx, state) {},                // 지구 위 그리기. ctx.add(ctx.makePoints(...)) 등. 없으면 생략
  card(ctx, state) { return '<html>'; },
  pick(ctx, state, lat, lon) { return null; },      // → { title, badge, body } | null
  action(ctx, state, name, ds, value) { return null; },  // 카드 버튼 data-action="ext:<name>" → 아래 반환 규약
  afterRender(ctx, state, root) {},    // 카드가 DOM 에 붙은 뒤 (SVG 그래프·캔버스 마운트). root = #intel-content
  update(ctx, state, camera, altKm) {},// 매 프레임 (가볍게)
  close(ctx, state) {},                // 꺼질 때 정리 (타이머·리스너)
};
```
`action` 반환: `{ html, inPlace }`(카드 본문 교체) · `{ point:{lat,lon,altKm} }`(카메라 이동) · `{ rebuild:true }`(지구 다시 그리기) ·
`{ pending: Promise<{html}> }`(늦게 오는 갱신) · `{ handled:true }`. 이들은 섞어 써도 된다.
비동기 자료가 나중에 도착하면 `state` 를 고친 뒤 `ctx.refresh()` 를 부르면 활성 카드가 다시 그려진다.

## ctx 도구 (ext-scene.js 참고)
`THREE, S3, esc, distKm, llToV3, ko(getter), lang, badge(state), cam()→{lat,lon,altKm}, flyTo(lat,lon,altKm),
surfR(lat,lon,lift), add(obj), makePoints(items,{size,lift,opacity,color}), makeLine(pts,{color,opacity,lift}),
makeSegments(segs,{color,opacity,lift}), makeCircle(lat,lon,km,{...}), makeLabel(text,color), placeLabel(spr,lat,lon,lift),
fetchJson(url,{timeout,signal,cache}), v1(path) (= import('/js/'+path) — 1.0 모듈 빌려 쓰기), css(href,id), refresh(), rebuild()`

## 1.0 모듈 빌려 쓰기
같은 origin 에 1.0 이 있다(개발 서버는 root=prototype/, 운영은 earthus.net/). Cesium 을 import 하지 않는 1.0 모듈은
`await ctx.v1('beaches.js')` 처럼 그대로 쓴다. 확인된 Cesium-free 모듈: beaches.js, surf.js, fishing.js, para.js, mountain.js,
korea.js, coast.js, net.js, config.js, stats.js, today.js, ui-charts.js(`chartsPanel.load()` / `chartsPanel.render(body, ko)` — DOM 컨테이너에 SVG 를 그린다),
lab-reports.js, ui-lab-reports.js(`labReportsPanel.load()/render(body, ko)`), geoname.js, community.js(requests — Supabase), translate.js,
ocean/depth.js, ocean/obis.js, ocean/divescene.js, ocean/trenchcards.js, ocean/observation-contract.js.
`trails.js` 와 `ui-*.js` 는 Cesium/viewer 에 묶여 있어 **못 쓴다** — 그 안의 카드 논리는 읽고 옮겨 적는다.
1.0 의 `i18n.js` 를 저 모듈들이 끌어오는데, 그건 괜찮다(언어는 `earthus.lang` 을 같이 본다).

## 자료 주소
- S3: `${ctx.S3}/events/sea-turtle.json` 처럼. 1.0 config.js 의 `API.*` 도 그대로 쓸 수 있다 (`(await ctx.v1('config.js')).API`).
- 1.0 의 정적 자료: 절대경로 `/data/para.json`, `/data/trails/index.json`, `/data/trenches.json` … (v2 로 복사하지 않는다).

## 원칙 (1.0 과 동일)
- 값을 만들지 않는다. 자료가 없으면 없다고 쓴다. 모델·실측·기록을 배지와 문장으로 구분한다.
- 실시간이 아닌 기록(거북·새)은 부제에 "지나간/조사한 해에" 를 남긴다. 라이선스 문구(거북 제4유형 등)를 그대로 옮긴다.
- 카드 문장은 한국어 기본 + `ctx.ko ? … : …` 영어. 1.0 의 문구를 우선 재사용한다.
- 카드 안 상호작용은 전부 `data-action="ext:<name>"` 버튼/입력. `data-*` 로 인자를 넘긴다(`ds` 로 받는다).
- 지구 위 표시는 Three.js 만. 한 화면의 객체 수는 수백 개 이내로(선은 한 객체에 합친다).
- `node --check` 로 문법을 확인한다. 브라우저 검증은 통합 담당이 한다 — 대신 각 함수가 DOM 없이도 예외를 내지 않게 방어한다.
