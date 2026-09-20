// 2026-09-21 반박 검증 — 전부 같은 것을 묻는다: **화면이 제가 한 일을 말하나.**
//
//   ① 대기질  — 그린 점 수와 카드가 적는 수가 같은가. 그릴 것이 0이면 배지가 내려가나.
//   ② 연안 침수 — '어긋난다'는 줄이 **같은 뜻의 두 수**를 견주는가(간 곳 vs 자료가 있던 곳).
//   ③ 잠기는 땅 — 켜기에 실패했을 때 남의 색면을 내리고 가지 않는가.
//
// 숫자는 하나도 박지 않는다. 운영 자료 사본(fixtures/)과 다른 파일의 상수에서 셈한다.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

import { LiveLayers, airqDrawable } from '../../prototype/v2-three/js/live-layers.js';
import { FIELD_DESCRIPTORS } from '../../prototype/v2-three/js/field-layer.js';

const here = (rel) => new URL(rel, import.meta.url);
const lf = (s) => s.replace(/\r\n/g, '\n');   // 이 워크트리는 CRLF 로 체크아웃될 수 있다
const read = (rel) => lf(readFileSync(here(rel), 'utf8'));
const LIVE_SRC = read('../../prototype/v2-three/js/live-layers.js');
const AIR = JSON.parse(read('fixtures/korea-air-obs-20260921.json'));
const FLOOD = JSON.parse(read('fixtures/khoa-flood-index-20260920.json'));

const metaAirq = (d) => LiveLayers.prototype.metaAirq.call(null, d);
/** 카드·메뉴 줄에서 '…개소' 꼴로 적힌 수를 전부 긁는다 — 한 카드가 두 수를 말하는지 보기 위한 것이다. */
const counts = (s) => [...String(s).matchAll(/(\d+)\s*개소/g)].map((m) => Number(m[1]));

/* ════════════════════════════════════════════════════════════════════════════
   ① 대기질 — 그린 것과 말한 것이 같은 수인가
   ════════════════════════════════════════════════════════════════════════════
   무엇이 잘못돼 있었나: 그리는 쪽(buildAirq)은 `lat·lon·grade` 가 다 있는 것만 찍는데,
   말하는 쪽(metaAirq)은 `d.located`(좌표가 있는 곳)로 개수를 적고 등급 내역은 또 다른
   population(등급이 있는 전부)에서 셌다. 셋이 갈라져 있어 **한 카드가 한 자리에서
   두 수를 말했다.** 좌표가 통째로 빠져 오던 날에는 그 차이가 0 대 672 였다 —
   점 하나 없는 지구에 '공식 관측' 배지가 붙었다. */

test('① 그린 점 수와 카드·메뉴 줄이 적는 수가 같다 — 등급 내역의 합도 그 수다', () => {
  const drawn = airqDrawable(AIR);
  assert.ok(drawn.length > 0, '전제가 깨졌다 — 이 사본에 찍을 수 있는 측정소가 없다');
  const m = metaAirq(AIR);

  // 메뉴 줄이 먼저 말하는 수는 **그린 수**다
  assert.equal(counts(m.note)[0], drawn.length, `메뉴 줄이 ${counts(m.note)[0]}개소라는데 실제로 그린 것은 ${drawn.length}개소다`);
  // 카드가 '…개소를 표시' 라고 적는 수도 같은 수다
  assert.ok(counts(m.cardHtml).includes(drawn.length), `카드가 그린 수(${drawn.length})를 한 번도 적지 않는다`);

  // 등급 내역의 합 = 그린 수. 이것이 "0개소인데 좋음 240" 을 막는 자리다.
  const nums = [...m.cardHtml.matchAll(/(?:좋음|보통|나쁨|매우나쁨)\s*(\d+)/g)].map((x) => Number(x[1]));
  assert.equal(nums.length, 4, '카드에 4등급 내역이 없다');
  assert.equal(nums.reduce((a, b) => a + b, 0), drawn.length,
    `등급 내역의 합(${nums.reduce((a, b) => a + b, 0)})이 그린 수(${drawn.length})와 다르다 — 한 카드가 두 수를 말한다`);
});

test('① 값은 왔는데 그리지 못한 곳이 있으면 카드가 그 수와 이유를 적는다', () => {
  const all = AIR.stations.length;
  const drawn = airqDrawable(AIR).length;
  assert.ok(all > drawn, '전제가 깨졌다 — 이 사본에는 빠진 곳이 없다');
  const m = metaAirq(AIR);
  assert.ok(counts(m.cardHtml).includes(all - drawn),
    `값이 온 ${all}개소 가운데 ${all - drawn}개소를 안 그렸는데 카드가 그 수를 말하지 않는다`);
  // 좌표가 없는 것과 등급이 없는 것은 **다른 일**이다 — 모르는 것과 없는 것을 가른다
  assert.match(m.cardHtml, /등급 없음|좌표 없음/, '왜 못 그렸는지를 가르지 않는다');
});

test('① 그릴 점이 0이면 켜진 척하지 않는다 — 배지가 자료 상태로 내려간다', () => {
  // 좌표를 지운 판을 **자료에서 만든다**(수를 박지 않는다). 2026-09-20 운영 자료가 바로 이 상태였다.
  const noCoord = { ...AIR, hasCoordinates: false, located: 0, noCoordinatesCount: AIR.stations.length,
    stations: AIR.stations.map((s) => ({ ...s, lat: null, lon: null })) };
  assert.equal(airqDrawable(noCoord).length, 0);
  const m = metaAirq(noCoord);

  assert.equal(m.badge, 'INSUFFICIENT_DATA', `점이 한 개도 없는데 배지가 ${m.badge} 다 — 화면이 '공식 관측' 이라고 말한다`);
  // 등급 내역을 적지 않는다: 그리지 않은 것의 내역이기 때문이다(옛 카드는 "0개소" 옆에 "좋음 240" 을 적었다)
  assert.doesNotMatch(m.cardHtml, /좋음\s*\d/, '그리지 않은 것의 등급 내역을 적고 있다 — 0개소와 240곳이 같은 카드에 남는다');
  // 값이 온 곳 수는 말한다 — 없는 것과 못 그린 것을 가른다
  assert.ok(counts(m.cardHtml).includes(noCoord.stations.length), '값이 몇 곳에서 왔는지 말하지 않는다');
  // 왜 못 그렸는지는 **자료가 스스로 적은 문장**을 인용한다 — 우리가 지어내지 않는다
  const said = String(noCoord.note.ko).split('\n')[0].slice(0, 20);
  assert.ok(m.cardHtml.includes(said), '자료의 설명문을 인용하지 않는다 — 카드가 제 말로 이유를 지어낸다');
});

test("① '대기질은 안 된다'를 코드에 박지 않았다 — 좌표가 돌아오면 저절로 돌아온다", () => {
  const body = LIVE_SRC.slice(LIVE_SRC.indexOf('metaAirq(d) {'), LIVE_SRC.indexOf('buildWind() {'));
  const codeOnly = body.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
  assert.doesNotMatch(codeOnly, /672|642/, '자료에서 셀 수를 코드에 박았다');
  // 좌표가 돌아오면 같은 함수가 OBSERVED 로 돌아온다(위 두 시험이 그 판을 이미 지난다)
  assert.equal(metaAirq(AIR).badge, 'OBSERVED');
  // 그리는 쪽과 말하는 쪽이 **같은 셈**을 쓴다 — 두 곳에 따로 적으면 다시 갈라진다
  const build = LIVE_SRC.slice(LIVE_SRC.indexOf('buildAirq(d) {'), LIVE_SRC.indexOf('metaAirq(d) {'));
  assert.ok(build.includes('airqDrawable('), '그리는 쪽이 제 거르개를 따로 갖고 있다');
  assert.ok(body.includes('airqDrawable('), '말하는 쪽이 제 거르개를 따로 갖고 있다');
});

/* ════════════════════════════════════════════════════════════════════════════
   ② 연안 침수 — 어긋남을 밝히는 줄이 서로 다른 두 수를 견줬다
   ════════════════════════════════════════════════════════════════════════════
   기관 설명문의 수는 **받으러 간** 시군구 수다(설명문 스스로 "이번에 실제로 자료가 있는 곳은
   coveredCount 에 적습니다" 라고 밝힌다). 그런데 카드는 그것을 `count>0 && bbox` 로 거른
   **자료가 있던 곳**과 견줬다 — 시도한 수와 성공한 수를 견주는 셈이다.
   한 곳이 빈 날, 실제로는 아무것도 어긋나지 않았는데 카드는 '1곳이 어긋납니다'라고 적는다.
   게다가 빈 곳은 바로 아래 '자료가 비어 있는 곳' 줄이 이미 이름까지 적는다 — 두 번 말한다. */

const floodMeta = (d) => LiveLayers.prototype.metaFloodIndex.call(
  { _floodDistricts: (d.districts || []).filter((r) => r.count > 0 && r.bbox), _floodDiscs: null, _floodAnchorCount: 0 },
  d,
);

test('② 자료가 빈 시군구가 생겨도 어긋났다고 말하지 않는다 — 설명문은 간 곳을 세고 있다', () => {
  const said = Number((String(FLOOD.note).match(/(\d+)\s*곳/) || [])[1]);
  assert.ok(Number.isFinite(said), '설명문에서 수를 못 읽었다 — 견줄 것이 없다');
  assert.equal(said, FLOOD.districts.length, '전제가 깨졌다 — 설명문의 수가 담겨 온 시군구 수가 아니다');

  // 한 곳이 비어 온 판을 자료에서 만든다(목록에는 그대로 있다 — 갔는데 자료가 없던 것이다)
  const emptied = { ...FLOOD, districts: FLOOD.districts.map((r, i) => (i === 0 ? { ...r, count: 0 } : r)) };
  const card = floodMeta(emptied).cardHtml;
  assert.ok(!/어긋납니다/.test(card),
    '한 곳이 비었을 뿐인데 기관 설명문과 어긋났다고 적는다 — 간 곳(시도)과 자료가 있던 곳(성공)을 견줬다');
  // 빈 곳은 이미 제 줄이 이름까지 말한다
  assert.ok(card.includes(FLOOD.districts[0].name), '빈 시군구를 이름으로 밝히는 줄이 사라졌다');
});

test('② 목록 자체가 설명문과 다르면 그때는 밝힌다 — 울타리를 없앤 것이 아니다', () => {
  const dropped = { ...FLOOD, districts: FLOOD.districts.slice(1) };
  const said = Number((String(FLOOD.note).match(/(\d+)\s*곳/) || [])[1]);
  const card = floodMeta(dropped).cardHtml;
  assert.match(card, /어긋납니다/, '설명문과 목록이 실제로 다른데 카드가 조용하다');
  assert.ok(card.includes(String(said)), '설명문이 적은 수를 카드가 말하지 않는다');
  assert.ok(card.includes(`${said - dropped.districts.length}곳이 어긋`), '어긋난 수를 세지 않는다');
});

/* ════════════════════════════════════════════════════════════════════════════
   ③ 잠기는 땅 — 켜기에 실패했는데 남의 색면을 내리고 갔다
   ════════════════════════════════════════════════════════════════════════════
   색면을 켜는 갈래는 `if (r && r.on)` 로 막아 두었다("켜기에 실패했는데 남의 층을 내리지 않는다").
   그런데 slr 을 켜는 갈래는 build('slr') 을 **시도하기 전에** 색면을 무조건 내렸다.
   ar6.json 은 485 KB 라 이동통신망에서 실패할 수 있고, 그러면 기온을 보고 있던 사용자에게
   **둘 다 꺼진 빈 지구**가 남았다. */

const fakeField = () => {
  const f = {
    object: { visible: false }, active: false,
    async on() { f.active = true; return { on: true }; },
    off() { f.active = false; },
    isDrawing() { return f.active; },
    note() { return ''; }, cardHtml() { return ''; },
  };
  return f;
};
const fakeHost = (build) => Object.assign(Object.create(LiveLayers.prototype), {
  layers: {}, _fields: {}, group: { add() {} }, disposeObj() {}, build,
});
const okBuild = async (id) => ({ obj: { visible: false, userData: {} }, data: { id }, meta: { badge: 'MODEL_SIGNAL' } });

test('③ 잠기는 땅을 받다가 실패하면 보고 있던 색면이 그대로 남는다', async () => {
  const fid = Object.keys(FIELD_DESCRIPTORS)[0];
  const h = fakeHost(async () => { throw new Error('ar6.json timeout'); });
  h._fields[fid] = fakeField();
  await LiveLayers.prototype.toggle.call(h, fid);
  assert.equal(h.layers[fid].on, true, '전제가 깨졌다 — 색면이 안 켜졌다');

  const r = await LiveLayers.prototype.toggle.call(h, 'slr');
  assert.equal(r.on, false);
  assert.ok(r.error, '실패했는데 화면에 줄 이유가 없다');
  assert.ok(!h.layers.slr, '실패한 잠기는 땅이 표에 남았다');
  assert.equal(h.layers[fid].on, true,
    '켜기에 실패한 잠기는 땅이 남의 색면을 내리고 갔다 — 둘 다 꺼진 빈 지구가 남는다');
  assert.equal(h._fields[fid].active, true, '색면 자신은 꺼져 있다 — 메뉴만 켜진 척한다');
});

test('③ 성공하면 울타리는 그대로다 — 처음 켜는 길과 다시 켜는 길 둘 다', async () => {
  const fid = Object.keys(FIELD_DESCRIPTORS)[0];
  // 처음 켜는 길
  const a = fakeHost(okBuild);
  a._fields[fid] = fakeField();
  await LiveLayers.prototype.toggle.call(a, fid);
  await LiveLayers.prototype.toggle.call(a, 'slr');
  assert.equal(a.layers.slr.on, true);
  assert.ok(!a.layers[fid] || !a.layers[fid].on, '색면과 잠기는 땅이 같이 켜져 있다');

  // 껐다 **다시 켜는** 길 — 여기는 build 를 안 거치고 obj 를 되살린다
  const b = fakeHost(okBuild);
  b._fields[fid] = fakeField();
  await LiveLayers.prototype.toggle.call(b, 'slr');        // 짓는다
  await LiveLayers.prototype.toggle.call(b, 'slr');        // 끈다 (obj 는 남는다)
  await LiveLayers.prototype.toggle.call(b, fid);          // 색면을 켠다
  assert.equal(b.layers[fid].on, true);
  await LiveLayers.prototype.toggle.call(b, 'slr');        // 다시 켠다 — 되살리는 길
  assert.equal(b.layers.slr.on, true);
  assert.ok(!b.layers[fid] || !b.layers[fid].on,
    '되살리는 길에 울타리가 없다 — 색면과 잠기는 땅이 같이 선다');
});

test('③ 내릴 색면이 없으면 한 틱도 쉬지 않는다 — build 를 다음 마이크로태스크로 밀지 않는다', async () => {
  // 옛 주석이 지키려던 것이다(flood-overlay.test.mjs 의 '켜는 중에 껐다 다시 켜기' 차례).
  const h = fakeHost(okBuild);
  let buildStarted = false;
  h.build = async (id) => { buildStarted = true; return okBuild(id); };
  const p = LiveLayers.prototype.toggle.call(h, 'slr');
  assert.equal(buildStarted, true, 'build 가 곧바로 시작되지 않았다 — 내릴 것도 없는데 한 틱을 쉬었다');
  await p;
});
