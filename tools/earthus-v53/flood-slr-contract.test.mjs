// 2026-09-21 — 연안 침수 예상도(khoaflood) · 해수면 상승 전망(slr) 의 **약속**을 잰다.
//
// 반박 검증에서 나온 결함 7건이 여기 있다. 전부 "화면이 제가 한 일을 말하나"를 묻는다:
//   ① 화면에 깔린 색을 값으로 되돌릴 눈금이 늘 있나 (범례 하나를 색면과 원판이 다투지 않나)
//   ② 시군구 내려받기가 실패하면 그 카드가 실패를 말하나 · 시간이 다 되면 정말 끊나
//   ③ 두 시군구를 잇따라 누르면 **나중에 누른 쪽**이 이기나
//   ④ 지구에서 원반을 누르는 주 경로가 이름과 용량을 말하나
//   ⑤ '겹쳐서 가렸다'가 사실인가 (화면 밖과 겹침을 가르나)
//   ⑥ 해수면 카드의 면적 숫자가 어느 시나리오·연도의 것인지 말하나
//   ⑦ '한국' 집계에 북한이 섞이지 않나
// 숫자는 전부 **운영 자료와 소스**에서 셈한다 — 여기에 기댓값을 박아 두지 않는다.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

import {
  FLOOD_DISTRICT_FAIL_NOTE, floodDistrictLoadingNote, floodHiddenNote, floodSizeNote,
} from '../../prototype/v2-three/js/flood-discs.js';
import {
  FLOOD_PAINTED_AT, FLOOD_PAINTED_KM2, FLOOD_PAINTED_PCT, FLOOD_SCENARIOS, FLOOD_YEARS,
  KOREA_COUNTRY, floodCardInner, floodPaintedLine, koreaStations, riseCompare,
} from '../../prototype/v2-three/js/flood-overlay.js';
import { LiveLayers } from '../../prototype/v2-three/js/live-layers.js';
import { FIELD_DESCRIPTORS, LEGEND_PRIORITY_FIELD } from '../../prototype/v2-three/js/field-layer.js';

const here = (rel) => new URL(rel, import.meta.url);
const lf = (s) => s.replace(/\r\n/g, '\n');   // 이 워크트리는 CRLF 로 체크아웃될 수 있다
const read = (rel) => lf(readFileSync(here(rel), 'utf8'));
const LIVE_SRC = read('../../prototype/v2-three/js/live-layers.js');
const MAIN_SRC = read('../../prototype/v2-three/js/main.js');
const OVERLAY_SRC = read('../../prototype/v2-three/js/flood-overlay.js');
const AR6 = JSON.parse(read('../../prototype/v2-three/sealevel/ar6.json'));
const INDEX = JSON.parse(read('fixtures/khoa-flood-index-20260902.json'));

/* ════════════════════════════════════════════════════════════════════════════
   ① 범례 하나를 색면과 원판이 다툰다
   ════════════════════════════════════════════════════════════════════════════
   slr 은 FIELD_DESCRIPTORS 밖이라 색면 배타 묶음(toggleFieldLayer)에 안 걸렸다. 그런데 범례는
   색면과 **같은 우선순위**로 들었고, field-legend 의 topOwner 는 같으면 나중에 show 한 쪽이 이긴다.
   그래서 기온 색면이 지구를 덮고 있는데 그 색을 읽을 눈금이 화면에서 사라진 채로 머물렀다.
   고친 방향: slr 을 색면 배타 묶음에 **넣는다**. 근거는 화면에 있다 —
   잠기는 땅 겹면은 색면과 같은 renderOrder(FIELD_RENDER_ORDER)에 반지름만 낮아,
   둘이 같이 서면 색면이 잠기는 땅을 덮는다(메뉴는 켜졌다는데 화면에는 없다).
   live-layers.starLayer 가 이미 "잠기는 땅(slr)은 … 화면에서는 색면과 같은 것"이라고 적어 두었다. */

/** toggle() 만 돌려 보는 최소한의 가짜 host — 몸통은 **진짜 LiveLayers 의 것**이다(build · group 만 흉내 낸다). */
const fakeHost = () => Object.assign(Object.create(LiveLayers.prototype), {
  layers: {},
  _fields: {},
  group: { add() {} },
  async build(id) { return { obj: { visible: false, userData: {} }, data: { id }, meta: { badge: 'MODEL_SIGNAL' } }; },
  disposeObj() {},
});

/** FieldLayer 하나를 흉내 낸다 — fieldOf 는 이미 있는 것을 그대로 쓴다(진짜 FieldLayer 를 짓지 않는다). */
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

test('① 색면과 잠기는 땅은 같이 켜지지 않는다 — 켜는 쪽이 앞의 색면을 내린다', async () => {
  const fid = Object.keys(FIELD_DESCRIPTORS)[0];        // 색면 하나(자료에서 고른다 — id 를 박지 않는다)
  // 색면 → slr
  const a = fakeHost();
  a._fields[fid] = fakeField();
  assert.deepEqual(await LiveLayers.prototype.toggle.call(a, fid), { on: true, badge: FIELD_DESCRIPTORS[fid].badge || 'MODEL' });
  assert.equal(a.layers[fid].on, true);
  await LiveLayers.prototype.toggle.call(a, 'slr');
  assert.equal(a.layers.slr.on, true, 'slr 이 안 켜졌다');
  assert.ok(!a.layers[fid] || !a.layers[fid].on,
    `색면 ${fid} 이 잠기는 땅과 같이 켜져 있다 — 범례 하나를 둘이 다툰다`);

  // slr → 색면 (반대 방향도 막혀야 한다)
  const b = fakeHost();
  b._fields[fid] = fakeField();
  await LiveLayers.prototype.toggle.call(b, 'slr');
  assert.equal(b.layers.slr.on, true);
  await LiveLayers.prototype.toggle.call(b, fid);
  assert.equal(b.layers[fid].on, true, '색면이 안 켜졌다');
  assert.ok(!b.layers.slr.on, '색면을 켰는데 잠기는 땅이 그대로 켜져 있다 — 색면이 그 면을 덮는다');
});

test('① 범례 우선순위는 색면과 같다 — 배타로 막았으니 세기를 낮출 이유가 없다', () => {
  // 세기를 낮춰 '지는 범례'로 만드는 길은 고르지 않았다: 그러면 잠기는 땅이 켜진 채
  // 제 눈금을 잃는다. 대신 둘이 같이 켜지지 못하게 했다(위 시험).
  assert.ok(OVERLAY_SRC.includes("'slr', LEGEND_PRIORITY_FIELD"), '범례 주인 이름·세기가 바뀌었다');
  assert.equal(typeof LEGEND_PRIORITY_FIELD, 'number');
});

/* ════════════════════════════════════════════════════════════════════════════
   ② 시군구 내려받기 실패를 화면이 말하지 않는다
   ════════════════════════════════════════════════════════════════════════════ */

test('② 실패하면 그 카드에 실패가 적힌다 — 거부를 전역으로 흘려보내지 않는다', () => {
  const body = MAIN_SRC.slice(MAIN_SRC.indexOf("action === 'flood-district'"), MAIN_SRC.indexOf("action === 'feed-follow'"));
  assert.ok(body.includes('.catch('),
    'loadFloodDistrict 의 거부를 아무도 받지 않는다 — #load-err 는 .done(opacity:0) 안이라 아무도 못 본다');
  assert.ok(body.includes('UNAVAILABLE'), '실패한 카드의 배지가 실패를 말하지 않는다');
  // 실패 문장은 한 곳에서 온다 — '자료가 없다'와 '못 받았다'가 다른 말을 지어내지 않게
  assert.ok(FLOOD_DISTRICT_FAIL_NOTE.length > 0);
  assert.ok(!body.includes('침수 자료를 불러오지 못했습니다'),
    '실패 문장을 main.js 에 다시 적었다 — 상수에서 받아야 두 갈래가 갈라지지 않는다');
});

test('② 시간이 다 되면 정말 끊는다 — 120초 뒤에도 33 MB 를 계속 받지 않는다', async () => {
  const { fetchJson } = await import('../../prototype/v2-three/js/live-layers.js');
  const saved = globalThis.fetch;
  let seen = null;
  globalThis.fetch = (url, init) => { seen = init; return new Promise(() => {}); };   // 영영 안 끝나는 요청
  try {
    await assert.rejects(fetchJson('/ocean/khoa/flood/46770.json', 20), /timeout/);
    assert.ok(seen && seen.signal, 'fetch 에 signal 을 주지 않았다 — 끊을 손잡이가 없다');
    assert.equal(seen.signal.aborted, true, '시간이 다 됐는데 요청이 그대로 살아 있다');
  } finally { globalThis.fetch = saved; }
});

test('② 제때 온 응답은 타이머가 붙잡지 않는다 — 시험 프로세스가 120초를 기다리지 않는다', async () => {
  const { fetchJson } = await import('../../prototype/v2-three/js/live-layers.js');
  const saved = globalThis.fetch;
  globalThis.fetch = async () => ({ ok: true, json: async () => ({ ok: 1 }) });
  try {
    assert.deepEqual(await fetchJson('/x.json', 120000), { ok: 1 });
  } finally { globalThis.fetch = saved; }
});

/* ════════════════════════════════════════════════════════════════════════════
   ③ 늦게 온 옛 요청이 이긴다
   ════════════════════════════════════════════════════════════════════════════ */

test('③ 두 시군구를 잇따라 누르면 나중에 누른 쪽이 이긴다', async () => {
  const gate = [];
  const host = {
    layers: { khoaflood: { on: true, obj: { add() {}, remove() {} } } },
    _floodDiscs: null, _floodSel: null, _floodMesh: null,
    surfR: () => 1.002, disposeObj() {},
  };
  const orig = globalThis.fetch;
  globalThis.fetch = (url) => new Promise((res) => {
    gate.push(() => res({ ok: true, json: async () => ({
      name: String(url).includes('AAA') ? '먼저 누른 곳' : '나중에 누른 곳',
      count: 1, bbox: [126, 35, 127, 36], classes: { '3.0': 1 }, features: [],
    }) }));
  });
  try {
    const first = LiveLayers.prototype.loadFloodDistrict.call(host, 'AAA');
    const second = LiveLayers.prototype.loadFloodDistrict.call(host, 'BBB');
    gate[1]();                      // 나중에 누른 쪽이 먼저 도착
    assert.equal((await second).code, 'BBB');
    gate[0]();                      // 먼저 누른 쪽이 늦게 도착
    const late = await first;
    assert.ok(late && late.stale === true, '늦게 온 옛 요청이 제 결과를 내놓았다');
    assert.equal(host._floodSel.code, 'BBB', '늦게 온 옛 응답이 선택을 덮었다');
  } finally { globalThis.fetch = orig; }
});

test('③ main.js 의 .then 도 같은 번호를 보고 카메라·카드를 건너뛴다', () => {
  const body = MAIN_SRC.slice(MAIN_SRC.indexOf("action === 'flood-district'"), MAIN_SRC.indexOf("action === 'feed-follow'"));
  assert.ok(/info\s*&&\s*info\.stale/.test(body),
    '늦게 온 옛 요청인지 묻지 않는다 — 옛 시군구로 카메라가 날아가고 카드가 덮인다');
  // 옛 요청을 '실패'라고 적으면 거짓이다(더 나중에 누른 쪽이 이미 앞서 있을 뿐이다)
  const stale = body.indexOf('info.stale');
  const fail = body.indexOf('UNAVAILABLE');
  assert.ok(stale > 0 && fail > stale, '늦은 요청을 실패 카드로 덮고 있다');
});

/* ════════════════════════════════════════════════════════════════════════════
   ④ 지구에서 원반을 누르는 주 경로가 이름도 용량도 말하지 않는다
   ════════════════════════════════════════════════════════════════════════════ */

test('④ 받기 시작하는 카드가 이름과 용량을 말한다 — 두 길이 같은 글을 쓴다', () => {
  const big = INDEX.districts.find((r) => r.count > 0);
  const note = floodDistrictLoadingNote({ name: big.name, bytes: 40 * 1024 * 1024 });
  assert.ok(note.includes(big.name), '코드만 적고 이름을 말하지 않는다');
  assert.ok(note.includes(floodSizeNote(40 * 1024 * 1024)), '용량 고지가 빠졌다');
  assert.ok(note.includes('불러오는 중'));
  // 용량을 모르면 지어내지 않는다
  const unknown = floodDistrictLoadingNote({ name: big.name, bytes: null });
  assert.ok(unknown.includes(big.name) && !/MB/.test(unknown), '모르는 용량을 적었다');
});

test('④ 지구에서 누른 길과 카드 단추로 들어간 길이 **한 자리**에서 글을 받는다', () => {
  const body = MAIN_SRC.slice(MAIN_SRC.indexOf("action === 'flood-district'"), MAIN_SRC.indexOf("action === 'feed-follow'"));
  assert.ok(!/\$\{ds\.sgg\} 침수 예상도를 불러오는 중/.test(body),
    '아직 시군구 코드를 그대로 찍고 있다');
  assert.ok(body.includes('floodDistrictNotes('), '이름·용량을 색인에서 받아 오지 않는다');
  assert.ok(LIVE_SRC.includes('floodDistrictLoadingNote('), 'live-layers 가 그 글을 짓지 않는다');
});

/* ════════════════════════════════════════════════════════════════════════════
   ⑤ '겹쳐서 가렸다'가 사실이 아니다
   ════════════════════════════════════════════════════════════════════════════ */

test('⑤ 화면 밖과 겹침을 가른다 — 둘을 한 낱말로 뭉뚱그리지 않는다', () => {
  // 69곳 가운데 화면 안 후보가 12곳, 그중 9곳이 떴다 → 겹침 3 · 화면 밖 57
  const n = INDEX.districts.filter((r) => r.count > 0).length;
  const note = floodHiddenNote(9, 12, n);
  assert.ok(note.includes('3곳'), '겹쳐서 가린 수를 세지 않는다');
  assert.ok(note.includes(String(n - 12)), '화면 밖 수를 세지 않는다');
  assert.ok(/겹/.test(note) && /화면 밖/.test(note), '두 이유를 가르지 않는다');
  // 전부 화면 밖일 때는 '겹쳐서 가렸다'고 말하지 않는다 — 그것이 옛 거짓말이었다
  const allAway = floodHiddenNote(0, 0, n);
  assert.ok(!/겹쳐서 가린/.test(allAway), '아무것도 안 겹쳤는데 겹쳤다고 적는다');
  assert.ok(allAway.includes(String(n)));
  // 화면 밖이 없으면 '한국 쪽으로' 권유를 적지 않는다
  const onlyOverlap = floodHiddenNote(9, 12, 12);
  assert.ok(!/한국 쪽으로/.test(onlyOverlap), '화면 밖이 없는데 한국 쪽으로 가라고 한다');
  assert.ok(/한국 쪽으로/.test(note), '화면 밖이 있는데 어디로 가야 하는지 말하지 않는다');
  // 숨긴 것이 없으면 아무 말도 하지 않는다
  assert.equal(floodHiddenNote(n, n, n), '');
});

test('⑤ 지구 반대편을 보고 있으면 69곳이 통째로 화면 밖이다 — 그것을 겹침이라 부르지 않는다', async () => {
  const THREE = await import('../../prototype/vendor/three-r184.module.min.js');
  const { createFloodDiscs, floodDiscSpecs } = await import('../../prototype/v2-three/js/flood-discs.js');
  const ANCHORS = JSON.parse(read('../../prototype/v2-three/data/khoa-flood-anchors.json'));
  const ll = (lat, lon, r) => {
    const la = (lat * Math.PI) / 180; const lo = (lon * Math.PI) / 180; const cl = Math.cos(la);
    return new THREE.Vector3(r * cl * Math.sin(lo), r * Math.sin(la), r * cl * Math.cos(lo));
  };
  const ctx = {
    font: '', textBaseline: '', fillStyle: '', strokeStyle: '', lineWidth: 0,
    measureText: (s) => ({ width: s.length * 12 }),
    beginPath() {}, moveTo() {}, arcTo() {}, arc() {}, closePath() {}, fill() {}, stroke() {}, fillText() {},
  };
  const discs = createFloodDiscs({
    THREE,
    specs: floodDiscSpecs(INDEX.districts, ANCHORS.districts),
    surfR: (_a, _b, lift = 0) => 1 + lift,
    ramp: () => [10, 20, 30],
    horizonOpacity: (p, cam) => {
      const pl = Math.hypot(p.x, p.y, p.z); const cl = Math.hypot(cam.x, cam.y, cam.z);
      if (!pl || !cl) return 0;
      const hz = pl / cl;
      if (hz >= 1) return 0;
      const facing = (p.x * cam.x + p.y * cam.y + p.z * cam.z) / (pl * cl);
      return Math.max(0, Math.min(1, ((facing - hz) / (1 - hz)) / 0.18));
    },
    llToV3: ll,
    doc: { createElement: () => ({ width: 0, height: 0, getContext: () => ctx }) },
    isPhone: () => false,
    getViewport: (out) => { out.w = 1280; out.h = 800; },
  });
  // 한국(127.5°E)의 정반대쪽 바다를 보고 있다 — 69곳이 전부 지구 뒤편이다
  const cam = new THREE.PerspectiveCamera(48, 1280 / 800, 0.01, 100);
  cam.position.copy(ll(-35.5, -52.5, 3));
  cam.lookAt(0, 0, 0);
  cam.updateMatrixWorld(true);
  cam.updateProjectionMatrix();
  discs.tick(cam);
  assert.equal(discs.onScreen(), 0, '지구 반대편인데 화면 안 후보가 있다');
  const note = floodHiddenNote(discs.shown(), discs.onScreen(), discs.total());
  assert.ok(note.includes(`화면 밖·지구 뒤편 ${discs.total()}곳`), `화면 밖을 세지 않는다: ${note}`);
  assert.ok(!/겹쳐서 가린/.test(note), '아무것도 안 겹쳤는데 겹쳤다고 적는다 — 옛 글이 하던 거짓말이다');
  discs.dispose();
});

test('⑤ 화면 안 후보 수를 원반 층이 직접 센다 — 카드가 어림하지 않는다', () => {
  const card = LIVE_SRC.slice(LIVE_SRC.indexOf('floodDistrictCardHtml() {'), LIVE_SRC.indexOf('buildTempAnom(d) {'));
  assert.ok(card.includes('.onScreen()'), '화면 안 후보 수를 묻지 않는다 — 나머지를 전부 겹침이라 적게 된다');
});

/* ════════════════════════════════════════════════════════════════════════════
   ⑥ 해수면 카드의 면적 숫자가 시나리오·연도를 따라가지 않는다
   ════════════════════════════════════════════════════════════════════════════ */

const valuesAt = (scenario, year) => AR6.items.map((s) => s.s[scenario][year][0]);
const REF_AT = { scenario: FLOOD_PAINTED_AT.scenario, year: FLOOD_PAINTED_AT.year };

test('⑥ 잰 칸이 자료에 있는 칸이다 — 없는 칸에서 잰 수를 적을 수 없다', () => {
  assert.ok(FLOOD_SCENARIOS.some((s) => s.id === REF_AT.scenario));
  assert.ok(FLOOD_YEARS.includes(REF_AT.year));
});

test('⑥ 잰 값에는 그것을 잰 칸(시나리오·연도)이 붙고, 지금 칸도 같이 적힌다', () => {
  const label = FLOOD_SCENARIOS.find((s) => s.id === REF_AT.scenario).label;
  // 지금 화면이 바로 그 칸이면 숫자를 그대로 적는다
  const same = floodPaintedLine({ ...REF_AT, painted: { n: 1016, lower: 0, higher: 0, verdict: 'same' } });
  assert.ok(same.includes(String(FLOOD_PAINTED_PCT)) && same.includes(FLOOD_PAINTED_KM2.toLocaleString()));
  assert.ok(same.includes(label) && same.includes(REF_AT.year));
  // 다른 칸을 보고 있으면 그 수가 **이 화면의 수인 척** 하지 않는다
  const other = FLOOD_SCENARIOS.find((s) => s.id !== REF_AT.scenario);
  const line = floodPaintedLine({
    scenario: other.id, year: FLOOD_YEARS[0], painted: { n: 1016, lower: 1016, higher: 0, verdict: 'below' },
  });
  assert.ok(line.includes(label) && line.includes(REF_AT.year),
    `${FLOOD_PAINTED_PCT}% 가 어느 칸에서 잰 값인지 말하지 않는다`);
  assert.ok(line.includes(other.label) && line.includes(FLOOD_YEARS[0]), '지금 보고 있는 칸을 말하지 않는다');
  assert.ok(/좁/.test(line), '한 곳도 높지 않은데 좁다고 말하지 않는다');
  // 12칸이 전부 같은 글이면 고친 것이 아니다
  const all = new Set();
  for (const s of FLOOD_SCENARIOS) {
    for (const y of FLOOD_YEARS) all.add(floodPaintedLine({ scenario: s.id, year: y, painted: null }));
  }
  assert.equal(all.size, FLOOD_SCENARIOS.length * FLOOD_YEARS.length, '시나리오·연도를 바꿔도 같은 글이 나온다');
});

test('⑥ 넓이의 방향은 관측소를 실제로 견줘 보장되는 만큼만 말한다', () => {
  const ref = valuesAt(REF_AT.scenario, REF_AT.year);
  assert.equal(riseCompare(ref, ref).verdict, 'same');
  // 전부 낮으면 'below' — 그때만 카드가 '좁습니다'라고 말한다(IDW 무게가 양수·합 1 이라 칸 값도 낮다)
  const allLower = ref.map((v) => v - 1);
  assert.equal(riseCompare(allLower, ref).verdict, 'below');
  assert.equal(riseCompare(ref.map((v) => v + 1), ref).verdict, 'above');
  // ⚠️ 운영 자료에서는 이른 해·낮은 배출이라도 **한 방향이 아니다**: 땅이 솟는 관측소에서는 값이 거꾸로 높다.
  const early = riseCompare(valuesAt(REF_AT.scenario, FLOOD_YEARS[0]), ref);
  assert.equal(early.verdict, 'mixed', '전제가 깨졌다 — 땅이 솟는 관측소가 더 이상 없다');
  assert.ok(early.lower > 0 && early.higher > 0);
  assert.equal(early.n, AR6.items.length);
  // 그때 카드는 방향을 지어내지 않고, 센 수를 적는다
  const line = floodPaintedLine({ scenario: REF_AT.scenario, year: FLOOD_YEARS[0], painted: early });
  assert.ok(!/좁습니다|넓습니다/.test(line), '엇갈리는데 한쪽으로 단정한다');
  assert.ok(line.includes(early.lower.toLocaleString()) && line.includes(early.higher.toLocaleString()),
    '센 수를 말하지 않는다 — 1,000곳이 낮다는 사실까지 버린다');
  // 견줄 수 없으면 null — '같다'로 메우지 않는다
  assert.equal(riseCompare(ref, ref.slice(1)), null);
  assert.equal(riseCompare([1, Number.NaN], [1, 2]), null);
});

// ⚠️ 위의 두 시험은 **함수**를 부른다 — 카드가 그 함수를 안 쓰고 옛 고정 문장으로 되돌아가도 전부 초록이다.
//    그래서 카드 본문이 이 한 줄을 그 함수에서 받는다는 것을 여기서 잠근다(그것이 이 결함의 실제 자리다).
test('⑥ 카드 본문이 그 한 줄을 함수에서 받는다 — 고정 문장으로 되돌아갈 자리를 남기지 않는다', () => {
  assert.match(OVERLAY_SRC, /L\.push\(floodPaintedLine\(m\)\);/, '카드가 면적 한 줄을 스스로 짓고 있다');
  // 카드를 통째로 뽑아도 '잰 칸'이 그 안에 있다 — 지금 칸이 잰 칸과 다를 때
  const other = FLOOD_SCENARIOS.find((s) => s.id !== REF_AT.scenario);
  const card = floodCardInner({
    scenario: other.id, year: FLOOD_YEARS[0], stations: 1016, countries: 113, soloCountries: 40,
    globalMedian: 0.3, min: -1, max: 2, top: [], korea: [], koreaCount: 23,
    source: 'IPCC AR6', license: 'CC BY 4.0', baseline: '1995–2014', depth: true, hasHeight: true,
    painted: { n: 1016, lower: 1000, higher: 16, verdict: 'mixed' },
  });
  const label = FLOOD_SCENARIOS.find((s) => s.id === REF_AT.scenario).label;
  assert.ok(card.includes(String(FLOOD_PAINTED_PCT)), '카드에 면적이 없다 — 전제가 깨졌다');
  assert.ok(card.includes(label) && card.includes(REF_AT.year),
    `카드가 ${FLOOD_PAINTED_PCT}% 를 적으면서 그것을 잰 칸을 말하지 않는다`);
  assert.ok(!/좁습니다|넓습니다/.test(card), '엇갈리는데 카드가 한쪽으로 단정한다');
});

test('⑥ 카드에 박힌 면적은 지금 코드가 칠하는 그것이다(grow 전의 옛 수가 아니다)', () => {
  // 낡은 수(230,610 km² · 0.17%)는 부풀리기 전의 33.7% 로 센 값이었다.
  assert.notEqual(FLOOD_PAINTED_KM2, 230610);
  assert.notEqual(FLOOD_PAINTED_PCT, 0.17);
  assert.ok(FLOOD_PAINTED_PCT > 0 && FLOOD_PAINTED_PCT < 1);
});

/* ════════════════════════════════════════════════════════════════════════════
   ⑦ '한국' 집계에 북한이 섞인다
   ════════════════════════════════════════════════════════════════════════════ */

test("⑦ '한국'은 대한민국이다 — startsWith('Korea') 는 북한까지 담았다", () => {
  const loose = AR6.items.filter((s) => String(s.country || '').startsWith('Korea'));
  const exact = AR6.items.filter((s) => s.country === KOREA_COUNTRY);
  assert.ok(exact.length > 0, `운영 자료에 '${KOREA_COUNTRY}' 가 없다 — 열쇠 글자가 자료와 어긋났다`);
  assert.ok(loose.length > exact.length, '전제가 깨졌다 — 자료에 북한 관측소가 더 이상 없다');
  assert.deepEqual(koreaStations(AR6.items).map((s) => s.name).sort(), exact.map((s) => s.name).sort());
  // 화면의 원판은 이미 나라 글자 그대로 갈라 놓는다 — 카드의 셈이 화면과 어긋나 있었다
  assert.ok(AR6.items.some((s) => /Korea/.test(String(s.country)) && s.country !== KOREA_COUNTRY));
  // 카드의 셈이 그 가름을 쓰는가 — 옛 길(느슨한 앞글자 맞추기)이 코드에 남아 있지 않은가
  assert.ok(OVERLAY_SRC.includes('koreaStations(rows)'), '카드가 이 가름으로 세지 않는다');
  assert.ok(!/rows\.filter\(\(r\) => \(r\.country \|\| ''\)\.startsWith/.test(OVERLAY_SRC),
    "아직 startsWith('Korea') 로 가르고 있다");
  // 한 파일 안에서 '한국'이 두 가지면 화면의 차례(plateRank '한국 먼저')와 카드의 셈이 다시 갈라진다
  assert.ok(!/korea: .*startsWith\('Korea'\)/.test(OVERLAY_SRC),
    "원판을 솎는 차례는 아직 북한까지 '한국'으로 친다 — 카드와 화면이 다른 한국을 말한다");
  assert.ok(OVERLAY_SRC.includes('korea: stations[i].country === KOREA_COUNTRY'), '관측소 원판의 차례');
  assert.ok(OVERLAY_SRC.includes('korea: g.country === KOREA_COUNTRY'), '나라 원판의 차례');
});

/* ════════════════════════════════════════════════════════════════════════════
   덧붙여 — 카드가 같은 자리에서 시군구 수를 두 가지로 적는다
   ════════════════════════════════════════════════════════════════════════════ */

test('색인의 설명문과 제 표가 다른 수를 말하면 그 사실을 밝힌다', () => {
  const rows = INDEX.districts.filter((r) => r.count > 0);
  const said = Number((String(INDEX.note).match(/(\d+)\s*곳/) || [])[1]);
  assert.ok(Number.isFinite(said) && said !== rows.length,
    '전제가 깨졌다 — 색인 설명문과 표의 수가 같아졌다');
  const body = LIVE_SRC.slice(LIVE_SRC.indexOf('metaFloodIndex(d) {'), LIVE_SRC.indexOf('pickFloodDisc('));
  assert.ok(/\\d\+\)\\s\*곳|\(\\d\+\)/.test(body) || /match\(/.test(body),
    '남의 문장에 적힌 수를 제 표와 견주지 않는다 — 69곳/70곳이 한 카드에 같이 남는다');
  assert.ok(/어긋|다릅|빠진/.test(body), '두 수가 왜 다른지 한 줄도 밝히지 않는다');
});
