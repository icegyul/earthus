// 2026-09-20 작업 W6 — 연안 침수 예상도의 **전국 색인**(prototype/v2-three/js/flood-discs.js) 시험.
//
// 이 레이어가 전에 한 거짓말은 하나였다: 시군구마다 점 하나를 찍고 그 색을 `count`
// (침수면 폴리곤 **개수**)의 로그로 칠했다. 개수는 면적도 위험도도 아니다.
// 그래서 여기서 재는 것은 "점이 원반이 됐나"가 아니라 **무엇이 색을 정하나**다:
//   · 지표가 '가장 깊은 구간'인가 (개수/비율이 아닌가)
//   · 원반 색이 면을 칠하는 함수와 **같은 함수**에서 오나 (표를 베끼지 않았나)
//   · 기관 자료의 변종 구간(2.0-2.5 · 2.5-3.0)까지 다루나
//   · 원반 자리가 bbox 중점이 아니라 면적가중 중심점인가, 그리고 그 점이 제 bbox 안에 있나
//   · 숨긴 곳이 있을 때 그 사실을 말하나 (숫자를 박지 않고 세어서)
//   · 자료가 없는 시군구를 그리지 않나
// 숫자는 전부 **실제 색인·앵커 파일과 소스**에서 셈한다 — 여기에 기댓값을 박아 두지 않는다.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

import {
  FLOOD_CLASS_BOUNDS, FLOOD_DISC_MAX_DESKTOP, FLOOD_DISC_MAX_PHONE, FLOOD_DISTRICT_TIMEOUT_MS,
  FLOOD_DISC_SCALE, FLOOD_HEAVY_BYTES, FLOOD_METRIC_KO, FLOOD_RECULL_PX,
  floodClassLabel, floodDeepestClass, floodDiscSpecs, floodHiddenNote, floodLegendHtml, floodLegendRows,
  floodSizeNote, floodThinRuleNote,
} from '../../prototype/v2-three/js/flood-discs.js';

const here = (rel) => new URL(rel, import.meta.url);
const lf = (s) => s.replace(/\r\n/g, '\n');   // 이 워크트리는 CRLF 로 체크아웃된다
const read = (rel) => lf(readFileSync(here(rel), 'utf8'));
const LIVE_SRC = read('../../prototype/v2-three/js/live-layers.js');
const MAIN_SRC = read('../../prototype/v2-three/js/main.js');
const SHELL_SRC = read('../../prototype/v2-three/js/ui-shell.js');
const GUIDE_SRC = read('../../prototype/v2-three/js/menu-guide.js');
const I18N_SRC = read('../../prototype/v2-three/js/i18n.js');
const ANCHORS = JSON.parse(read('../../prototype/v2-three/data/khoa-flood-anchors.json'));
// 기관이 낸 색인 그대로(12.8 KB). 앵커가 **제 시군구 bbox 안에** 있는지는 진짜 bbox 로만 잴 수 있다.
const REAL = JSON.parse(read('fixtures/khoa-flood-index-20260902.json'));

/** 색인 문서의 모양 그대로인 픽스처. 기관 자료가 실제로 내는 구간 키를 전부 쓴다
 *  (2.0-2.5 · 2.5-3.0 은 69곳 중 6곳에만 나오는 변종이다 — 실측). */
const INDEX = Object.freeze({
  generated: '2026-09-02T13:57:00Z',
  totalPolygons: 8,
  source: '해양수산부 국립해양조사원 연안 침수 정보',
  license: '공공누리 (출처표시)',
  note: '여기 없는 지역은 자료가 없는 것이지 침수 위험이 없다는 뜻이 아닙니다.',
  districts: [
    // 개수는 많지만 깊은 구간이 없는 곳 — '개수로 칠하면' 여기가 가장 붉어진다
    { sggCd: 'A1', name: '얕고 많은 곳', count: 500, classes: { '0.0-0.5': 400, '0.5-1.0': 100 }, bbox: [126, 35, 127, 36] },
    // 개수는 적지만 3 m 이상이 있는 곳 — '가장 깊은 구간'으로 칠하면 여기가 가장 붉다
    { sggCd: 'A2', name: '적지만 깊은 곳', count: 4, classes: { '0.0-0.5': 3, '3.0': 1 }, bbox: [128, 34, 128.2, 34.2] },
    { sggCd: 'A3', name: '변종 구간', count: 6, classes: { '1.0-1.5': 4, '2.5-3.0': 2 }, bbox: [129, 35, 129.4, 35.4] },
    { sggCd: 'A4', name: '변종 구간 둘', count: 5, classes: { '0.5-1.0': 3, '2.0-2.5': 2 }, bbox: [126.5, 37, 126.7, 37.2] },
    // 자료가 비어 있는 곳 — 그리지 않는다
    { sggCd: 'A5', name: '빈 곳', count: 0, classes: {}, bbox: [130, 36, 130.1, 36.1] },
  ],
});

/* ── 지표: 무엇이 색을 정하나 ─────────────────────────────────────────────── */

test('가장 깊은 구간을 고른다 — 개수가 아니다', () => {
  assert.equal(floodDeepestClass({ '0.0-0.5': 400, '0.5-1.0': 100 }).key, '0.5-1.0');
  assert.equal(floodDeepestClass({ '0.0-0.5': 3, '3.0': 1 }).key, '3.0');
  // 개수가 압도적으로 많은 얕은 칸이 있어도 깊은 칸 하나가 이긴다
  assert.equal(floodDeepestClass({ '0.0-0.5': 99999, '1.5-2.0': 1 }).low, 1.5);
});

test('기관 자료의 구간 키 8종을 전부 안다 — 변종(2.0-2.5 · 2.5-3.0)까지', () => {
  const keys = Object.keys(FLOOD_CLASS_BOUNDS);
  for (const k of ['0.0-0.5', '0.5-1.0', '1.0-1.5', '1.5-2.0', '2.0-2.5', '2.0-3.0', '2.5-3.0', '3.0']) {
    assert.ok(keys.includes(k), `구간 키 ${k} 가 없다`);
    assert.ok(floodDeepestClass({ [k]: 1 }), `${k} 하나만 있는 시군구를 못 읽는다`);
  }
  // '3.0' 은 위가 열려 있다 — 위 끝값을 지어내지 않는다
  assert.equal(FLOOD_CLASS_BOUNDS['3.0'][1], Infinity);
  assert.match(floodClassLabel('3.0'), /이상/);
  // 0.0-0.5 을 '최대 0 m' 라고 부르면 틀린다 — 위 끝값으로 말한다
  assert.equal(floodClassLabel('0.0-0.5'), '0.5 m');
});

test('개수가 0 인 칸과 모르는 구간 키는 색을 정하지 못한다', () => {
  assert.equal(floodDeepestClass({ '3.0': 0, '0.5-1.0': 2 }).key, '0.5-1.0');
  assert.equal(floodDeepestClass({ '9.9-10.0': 5 }), null);   // 지어내지 않는다
  assert.equal(floodDeepestClass({}), null);
  assert.equal(floodDeepestClass(null), null);
});

test('지표의 이름이 한 곳에 있고, 카드가 그 이름을 그대로 적는다', () => {
  assert.ok(FLOOD_METRIC_KO.includes('가장 깊은'));
  assert.ok(LIVE_SRC.includes('FLOOD_METRIC_KO'), '카드가 지표 이름을 따로 적고 있다(두 곳이 갈라진다)');
});

/* ── 명세: 자리·순서·없는 것 ──────────────────────────────────────────────── */

test('자료가 비어 있는 시군구는 그리지 않는다', () => {
  const specs = floodDiscSpecs(INDEX.districts);
  assert.equal(specs.length, 4);
  assert.ok(!specs.some((s) => s.sggCd === 'A5'));
});

test('깊은 곳이 먼저 자리를 갖는다 — 침수면이 500개인 얕은 곳보다 4개인 깊은 곳이 앞이다', () => {
  const specs = floodDiscSpecs(INDEX.districts);
  assert.equal(specs[0].sggCd, 'A2');
  assert.equal(specs[specs.length - 1].sggCd, 'A1');
});

test('앵커가 있으면 그 자리, 없으면 bbox 중점 — 그리고 물러선 사실을 명세가 들고 있다', () => {
  const withA = floodDiscSpecs(INDEX.districts, { A1: [126.8, 35.9, 1234] });
  const a1 = withA.find((s) => s.sggCd === 'A1');
  assert.equal(a1.lon, 126.8);
  assert.equal(a1.anchored, true);
  assert.equal(a1.bytes, 1234);
  const a2 = withA.find((s) => s.sggCd === 'A2');
  assert.equal(a2.anchored, false);
  assert.equal(a2.lon, 128.1);        // bbox 중점으로 물러난다
  assert.equal(a2.bytes, null);       // 모르는 용량을 지어내지 않는다
  // 앵커 파일이 통째로 없어도 그린다
  assert.equal(floodDiscSpecs(INDEX.districts, null).length, 4);
});

test('원반의 글자가 이름과 깊이 구간을 같이 말한다', () => {
  const s = floodDiscSpecs(INDEX.districts).find((x) => x.sggCd === 'A2');
  assert.ok(s.text.includes('적지만 깊은 곳'));
  assert.ok(s.text.includes('3 m 이상'));
});

/* ── 앵커 파일 자체 ───────────────────────────────────────────────────────── */

test('앵커는 색인의 시군구와 정확히 같은 집합이고, 저마다 제 bbox 안에 있다', () => {
  const byCode = new Map(REAL.districts.map((r) => [r.sggCd, r]));
  const codes = Object.keys(ANCHORS.districts);
  assert.equal(codes.length, REAL.districts.length, '앵커 수가 색인의 시군구 수와 다르다');
  assert.equal(ANCHORS.indexGenerated, REAL.generated, '앵커를 뜬 색인 판이 바뀌었다 — 다시 재야 한다');
  for (const cd of codes) {
    const r = byCode.get(cd);
    assert.ok(r, `${cd}: 색인에 없는 시군구의 앵커가 있다`);
    const a = ANCHORS.districts[cd];
    assert.equal(a.length, 3, `${cd}: [lon, lat, bytes] 가 아니다`);
    // 면적가중 중심점은 그 시군구 침수면의 bbox 안에 있어야 한다 — 밖이면 자리를 잘못 뜬 것이다
    assert.ok(a[0] >= r.bbox[0] && a[0] <= r.bbox[2], `${r.name}: 앵커 경도가 제 bbox 밖이다`);
    assert.ok(a[1] >= r.bbox[1] && a[1] <= r.bbox[3], `${r.name}: 앵커 위도가 제 bbox 밖이다`);
    assert.ok(Number.isInteger(a[2]) && a[2] > 0, `${cd}: 실측 용량이 없다`);
  }
});

test('앵커가 bbox 중점과 다르다 — 다도해에서는 크게 다르다', () => {
  const byCode = new Map(REAL.districts.map((r) => [r.sggCd, r]));
  const kmOff = (cd) => {
    const r = byCode.get(cd);
    const a = ANCHORS.districts[cd];
    const bx = (r.bbox[0] + r.bbox[2]) / 2;
    const by = (r.bbox[1] + r.bbox[3]) / 2;
    return Math.hypot((bx - a[0]) * 111.32 * Math.cos((a[1] * Math.PI) / 180), (by - a[1]) * 111.32);
  };
  const worst = Object.keys(ANCHORS.districts).map(kmOff).sort((x, y) => y - x)[0];
  assert.ok(worst > 20, `bbox 중점과 가장 많이 어긋난 곳이 ${worst.toFixed(1)} km 뿐이다 — 앵커를 안 쓰고 있다`);
  // 신안군(다도해)은 bbox 중점이 먼 바다다
  const sinan = REAL.districts.find((r) => r.name.includes('신안'));
  assert.ok(sinan && kmOff(sinan.sggCd) > 10, '신안군 앵커가 bbox 중점과 거의 같다');
});

test('색인이 실제로 내는 구간 키를 하나도 못 읽는 일이 없다', () => {
  const seen = new Set();
  for (const r of REAL.districts) for (const k of Object.keys(r.classes || {})) seen.add(k);
  for (const k of seen) {
    assert.ok(FLOOD_CLASS_BOUNDS[k], `색인에 있는 구간 키 ${k} 를 모른다 — 그 시군구는 색을 못 정한다`);
  }
  // 변종 구간이 실제로 존재한다(6종이 아니라 8종이다)
  assert.ok(seen.has('2.0-2.5') && seen.has('2.5-3.0'), '변종 구간이 사라졌다 — 픽스처를 다시 떠야 한다');
  assert.equal(seen.size, Object.keys(FLOOD_CLASS_BOUNDS).length);
});

test('진짜 색인 69곳을 전부 그리고, 가장 깊은 구간이 실제로 갈린다', () => {
  const specs = floodDiscSpecs(REAL.districts, ANCHORS.districts);
  assert.equal(specs.length, REAL.districts.filter((r) => r.count > 0).length);
  assert.ok(specs.every((s) => s.anchored), '앵커를 못 찾아 bbox 중점으로 물러난 시군구가 있다');
  const rows = floodLegendRows(specs);
  assert.ok(rows.length >= 4, `가장 깊은 구간이 ${rows.length}가지뿐이다 — 지표가 갈리지 않는다`);
  // 가장 깊은 구간이 3 m 이상인 곳이 가장 많다 — 자료가 그렇게 말한다(지표의 흠이 아니다)
  const top = rows[rows.length - 1];
  assert.equal(top.key, '3.0');
  assert.ok(top.n > specs.length / 2);
});

test('앵커 파일이 제 출처와 뜬 방법을 밝힌다', () => {
  assert.match(ANCHORS.derivedFrom, /ocean\/khoa\/flood/);
  assert.ok(ANCHORS.method.includes('centroid'));
  assert.ok(ANCHORS.license.includes('공공누리'));
});

/* ── 색: 면을 칠하는 함수와 같은 함수인가 ─────────────────────────────────── */

test('원반 색과 면 색이 같은 함수·같은 값에서 온다', () => {
  // 면은 loadFloodDistrict 에서 구간 **하한**을 FLOOD_RAMP 에 넣어 칠한다.
  assert.match(LIVE_SRC, /const low = parseFloat\(String\(f\.v\)\.split\('-'\)\[0\]\);[\s\S]{0,120}FLOOD_RAMP\(/);
  // 원반도 같은 FLOOD_RAMP 를 받는다 — flood-discs.js 안에 색 표를 따로 두지 않았다.
  assert.match(LIVE_SRC, /createFloodDiscs\(\{[\s\S]{0,400}ramp: FLOOD_RAMP/);
  const DISC_SRC = read('../../prototype/v2-three/js/flood-discs.js');
  assert.ok(!/rampFrom|\[\s*\d+\s*,\s*\d{2,3}\s*,\s*\d{2,3}\s*,\s*\d{2,3}\s*\]/.test(DISC_SRC),
    'flood-discs.js 안에 색 표가 생겼다 — 색이 두 곳에 적히면 갈라진다');
  // 명세가 넘기는 값은 구간 하한이다(면과 같은 값).
  const s = floodDiscSpecs(INDEX.districts).find((x) => x.sggCd === 'A3');
  assert.equal(s.depthLow, FLOOD_CLASS_BOUNDS['2.5-3.0'][0]);
});

test('범례는 자료에 실제로 있는 구간만 싣는다', () => {
  const specs = floodDiscSpecs(INDEX.districts);
  const rows = floodLegendRows(specs);
  const keys = rows.map((r) => r.key);
  assert.deepEqual(keys, ['0.5-1.0', '2.0-2.5', '2.5-3.0', '3.0']);   // 얕은 쪽부터, 없는 칸은 없다
  assert.equal(rows.reduce((n, r) => n + r.n, 0), specs.length);
  const ramp = (m) => [m * 10, 20, 30];
  const html = floodLegendHtml(specs, ramp);
  for (const r of rows) assert.ok(html.includes(`최대 ${r.label}`), `범례에 ${r.label} 가 없다`);
  assert.ok(html.includes('rgb(30,20,30)'), '범례 색이 건네받은 램프에서 오지 않는다');
  assert.equal(floodLegendHtml([], ramp), '');
});

/* ── 숨긴 것을 말하나 ─────────────────────────────────────────────────────── */

test('겹쳐서 가린 곳이 있으면 그 사실과 개수를 말한다 — 세어서', () => {
  const note = floodHiddenNote(9, 69);
  assert.ok(note.includes('9'));
  assert.ok(note.includes(String(69 - 9)), '가린 개수를 세지 않고 있다');
  assert.ok(note.includes('확대'), '어떻게 하면 나머지가 보이는지 말하지 않는다');
  assert.equal(floodHiddenNote(69, 69), '', '가린 것이 없는데 가렸다고 말한다');
});

// 레이어 카드는 buildFloodIndex 바로 뒤에 굳는다(live-layers.js 의 build 경로) — 그때 화면은 아직 한 번도
// 안 돌았으므로 shown() 은 0 이다. 거기에 지금 개수를 적으면 "0곳만 붙어 있습니다 — 69곳을 가렸습니다"가
// 영영 남는다. 실제로 그렇게 짰다가 여기서 잡았다.
test('레이어 카드는 그리기 전에 굳는다 — 지금 개수가 아니라 규칙을 적는다', () => {
  const lie = floodHiddenNote(0, 69);
  assert.ok(lie.includes('0곳만'), '전제가 바뀌었다 — 이 시험을 다시 봐야 한다');
  const body = LIVE_SRC.slice(LIVE_SRC.indexOf('metaFloodIndex(d) {'), LIVE_SRC.indexOf('pickFloodDisc('));
  assert.ok(!body.includes('.shown()'),
    '레이어 카드가 아직 안 그린 화면의 개수를 적고 있다 — 카드가 "0곳만"이라고 거짓말한다');
  assert.ok(body.includes('floodThinRuleNote('), '레이어 카드가 솎는 규칙을 말하지 않는다');
  // 지금 개수는 누른 뒤에 만들어지는 시군구 카드가 말한다
  const card = LIVE_SRC.slice(LIVE_SRC.indexOf('floodDistrictCardHtml() {'), LIVE_SRC.indexOf('buildTempAnom(d) {'));
  assert.ok(card.includes('floodHiddenNote('), '지금 개수를 말하는 자리가 하나도 없다');
});

test('솎는 규칙이 상수에서 온다 — 상한을 바꾸면 글도 따라 바뀐다', () => {
  const note = floodThinRuleNote(69);
  assert.ok(note.includes('69'));
  assert.ok(note.includes(String(FLOOD_DISC_MAX_PHONE)) && note.includes(String(FLOOD_DISC_MAX_DESKTOP)),
    '상한을 글에 박아 두었다');
  assert.ok(note.includes('깊은 곳이 먼저'), '무엇이 남는지 말하지 않는다');
});

test('폰은 데스크톱보다 원반을 적게 놓는다', () => {
  assert.ok(FLOOD_DISC_MAX_PHONE < FLOOD_DISC_MAX_DESKTOP);
});

test('자동 회전만으로 이름표가 깜빡이지 않게 다시 솎기를 막는다', () => {
  assert.ok(FLOOD_RECULL_PX > 0);
  const DISC_SRC = read('../../prototype/v2-three/js/flood-discs.js');
  assert.match(DISC_SRC, /if \(!moved && haveLast\)/);
  assert.match(DISC_SRC, /FLOOD_RECULL_PX \|\| Math\.abs/);
});

test('원반은 네모로 잡는다 — 이름 쪽을 눌러도 잡힌다', () => {
  const DISC_SRC = read('../../prototype/v2-three/js/flood-discs.js');
  const body = DISC_SRC.slice(DISC_SRC.indexOf('function pick({ x, y }'), DISC_SRC.indexOf('return {\n    object: group'));
  assert.ok(body.includes('baseAspect'), '판의 가로 길이를 안 보고 잡는다 — 이름 쪽이 빗나간다');
  assert.ok(!/bestD = FLOOD_PICK_SLOP_PX \* FLOOD_PICK_SLOP_PX/.test(body), '아직 원 하나로 잡고 있다');
});

/* ── 용량: 누르기 전에 말하나 ─────────────────────────────────────────────── */

test('무거운 시군구는 누르기 전에 용량을 말한다 — 보이는 글자로', () => {
  assert.equal(floodSizeNote(null), '');
  assert.equal(floodSizeNote(0), '');
  const light = floodSizeNote(1.5 * 1024 * 1024);
  assert.ok(light.includes('1.5 MB') && !light.includes('오래'));
  const heavy = floodSizeNote(FLOOD_HEAVY_BYTES + 1);
  assert.ok(heavy.includes('오래 걸립니다'), '무거운데 그냥 넘어간다');
  // 실측 파일 중 가장 큰 것은 경고 문턱을 넘는다 — 문턱이 자료와 어긋나면 여기서 걸린다
  const biggest = Math.max(...Object.values(ANCHORS.districts).map((a) => a[2]));
  assert.ok(biggest > FLOOD_HEAVY_BYTES, '실측 최대 파일이 경고 문턱 아래다 — 문턱이 헐겁다');
  assert.ok(floodSizeNote(biggest).includes('오래'));
  // title= 로만 적으면 폰에서 안 뜬다 — 경고가 필요한 쪽이 바로 폰이다
  const body = LIVE_SRC.slice(LIVE_SRC.indexOf('metaFloodIndex(d) {'), LIVE_SRC.indexOf('pickFloodDisc('));
  assert.ok(!/title="\$\{escapeHtml\(size\)\}"/.test(body), '용량을 title= 로만 적고 있다(폰에서 안 보인다)');
  assert.ok(body.includes('FLOOD_HEAVY_BYTES'), '무거운 곳만 골라 적지 않는다');
});

test('시군구 하나를 받는 시간이 실측 최대 파일에 맞다', () => {
  // 33 MB 를 30초에 받으려면 9 Mbps 가 꾸준히 나와야 한다 — 이동통신망의 약속이 아니다.
  assert.ok(FLOOD_DISTRICT_TIMEOUT_MS > 30000, '30초로는 가장 큰 시군구가 못 들어온다');
  assert.match(LIVE_SRC, /fetchJson\(`\/ocean\/khoa\/flood\/\$\{code\}\.json`, FLOOD_DISTRICT_TIMEOUT_MS\)/);
});

/* ── 실제로 도나: THREE 를 태워 tick·pick 을 돌린다 ───────────────────────── */
// 글자 대조만 하면 tick 안에서 터지는 것을 못 잡는다. 캔버스만 가짜로 주고 나머지는 진짜 THREE 다.

/** 캔버스가 없는 곳(node)에서 텍스처를 굽게 해 주는 최소한의 가짜. 글자 폭만 그럴듯하게 돌려준다. */
const fakeDoc = () => ({
  createElement: () => {
    const ctx = {
      font: '', textBaseline: '', fillStyle: '', strokeStyle: '', lineWidth: 0,
      measureText: (s) => ({ width: s.length * 12 }),
      beginPath() {}, moveTo() {}, arcTo() {}, arc() {}, closePath() {}, fill() {}, stroke() {}, fillText() {},
    };
    return { width: 0, height: 0, getContext: () => ctx };
  },
});

/** 한국이 화면 한가운데 오도록 지구를 돌려 놓은 카메라. */
const koreaCamera = (THREE, distance, w, h) => {
  const cam = new THREE.PerspectiveCamera(48, w / h, 0.01, 100);
  const lat = 35.5; const lon = 127.5;
  const la = (lat * Math.PI) / 180; const lo = (lon * Math.PI) / 180;
  cam.position.set(
    distance * Math.cos(la) * Math.sin(lo), distance * Math.sin(la), distance * Math.cos(la) * Math.cos(lo),
  );
  cam.lookAt(0, 0, 0);
  cam.updateMatrixWorld(true);
  cam.updateProjectionMatrix();
  return cam;
};

const makeDiscs = async (THREE, { w = 1280, h = 800, phone = false } = {}) => {
  const { createFloodDiscs } = await import('../../prototype/v2-three/js/flood-discs.js');
  const llToV3 = (latDeg, lonDeg, r) => {
    const la = (latDeg * Math.PI) / 180; const lo = (lonDeg * Math.PI) / 180;
    const cl = Math.cos(la);
    return new THREE.Vector3(r * cl * Math.sin(lo), r * Math.sin(la), r * cl * Math.cos(lo));
  };
  const horizonOpacity = (p, cam) => {
    const pl = Math.hypot(p.x, p.y, p.z); const cl = Math.hypot(cam.x, cam.y, cam.z);
    if (!pl || !cl) return 0;
    const hz = pl / cl;
    if (hz >= 1) return 0;
    const facing = (p.x * cam.x + p.y * cam.y + p.z * cam.z) / (pl * cl);
    return Math.max(0, Math.min(1, ((facing - hz) / (1 - hz)) / 0.18));
  };
  return createFloodDiscs({
    THREE,
    specs: floodDiscSpecs(REAL.districts, ANCHORS.districts),
    surfR: (_lat, _lon, lift = 0) => 1 + lift,
    ramp: (m) => [Math.min(255, m * 60), 100, 200],
    horizonOpacity,
    llToV3,
    doc: fakeDoc(),
    isPhone: () => phone,
    getViewport: (out) => { out.w = w; out.h = h; },
  });
};

test('가까이 갈수록 이름표가 늘어난다 — 그리고 상한을 넘지 않는다', async () => {
  const THREE = await import('../../prototype/vendor/three-r184.module.min.js');
  const discs = await makeDiscs(THREE);
  assert.equal(discs.total(), 69);
  discs.tick(koreaCamera(THREE, 3.0, 1280, 800));      // 지구 전체
  const far = discs.shown();
  discs.tick(koreaCamera(THREE, 1.06, 1280, 800));     // 한국으로 확대
  const near = discs.shown();
  assert.ok(far > 0, '전지구 줌에서 이름표가 하나도 없다');
  assert.ok(near > far, `가까이 가도 안 는다 (먼 곳 ${far} → 가까운 곳 ${near})`);
  assert.ok(near <= FLOOD_DISC_MAX_DESKTOP, `상한(${FLOOD_DISC_MAX_DESKTOP})을 넘었다: ${near}`);
  // 가린 곳이 있으면 그 사실을 말할 수 있어야 한다
  assert.ok(floodHiddenNote(far, discs.total()).includes(String(discs.total() - far)));
  discs.dispose();
});

test('폰에서는 더 적게 놓는다', async () => {
  const THREE = await import('../../prototype/vendor/three-r184.module.min.js');
  const big = await makeDiscs(THREE, { w: 1280, h: 800, phone: false });
  const small = await makeDiscs(THREE, { w: 375, h: 812, phone: true });
  big.tick(koreaCamera(THREE, 1.06, 1280, 800));
  small.tick(koreaCamera(THREE, 1.06, 375, 812));
  assert.ok(small.shown() <= FLOOD_DISC_MAX_PHONE, `폰 상한을 넘었다: ${small.shown()}`);
  assert.ok(small.shown() < big.shown());
  big.dispose(); small.dispose();
});

test('떠 있는 이름표를 그 자리에서 누르면 그 시군구가 잡힌다 — 이름 쪽을 눌러도', async () => {
  const THREE = await import('../../prototype/vendor/three-r184.module.min.js');
  const discs = await makeDiscs(THREE);
  const cam = koreaCamera(THREE, 1.06, 1280, 800);
  discs.tick(cam);
  assert.ok(discs.shown() > 0);
  // 지금 떠 있는 원반 하나의 화면 자리를 찾아 그 한가운데와 오른쪽(이름 쪽)을 눌러 본다
  const one = discs.object.children.find((s) => s.visible);
  assert.ok(one, '떠 있는 원반이 없다');
  const spec = one.userData.floodDisc;
  const p = one.position.clone().project(cam);
  const sx = (p.x * 0.5 + 0.5) * 1280;
  const sy = (-p.y * 0.5 + 0.5) * 800;
  assert.equal(discs.pick({ x: sx, y: sy }).sggCd, spec.sggCd, '한가운데를 눌렀는데 안 잡힌다');
  const halfW = (FLOOD_DISC_SCALE * 800 / 2) * one.userData.baseAspect;
  assert.equal(discs.pick({ x: sx + halfW * 0.8, y: sy }).sggCd, spec.sggCd, '이름 쪽을 눌렀는데 안 잡힌다');
  // 판 밖은 안 잡힌다
  assert.equal(discs.pick({ x: sx + halfW * 4, y: sy + 400 }), null, '판에서 한참 먼 곳이 잡힌다');
  assert.equal(discs.pick({}), null);
  discs.dispose();
});

test('면이 떠 있는 시군구의 이름표는 솎여도 남는다', async () => {
  const THREE = await import('../../prototype/vendor/three-r184.module.min.js');
  const discs = await makeDiscs(THREE);
  const cam = koreaCamera(THREE, 3.0, 1280, 800);     // 많이 솎이는 축척
  discs.tick(cam);
  const dropped = discs.specs().find((s) => !discs.object.children
    .some((c) => c.visible && c.userData.floodDisc.sggCd === s.sggCd));
  assert.ok(dropped, '이 축척에서 솎인 시군구가 하나도 없다 — 시험 전제가 깨졌다');
  discs.setSelected(dropped.sggCd);
  discs.tick(cam);
  const back = discs.object.children.find((c) => c.userData.floodDisc.sggCd === dropped.sggCd);
  assert.ok(back.visible, '면이 떠 있는데 그 시군구 이름표가 솎여 사라졌다');
  discs.setSelected(null);
  discs.dispose();
});

test('카메라가 가만히 있으면 다시 솎지 않는다 — 자동 회전 깜빡임 가드', async () => {
  const THREE = await import('../../prototype/vendor/three-r184.module.min.js');
  const discs = await makeDiscs(THREE);
  const cam = koreaCamera(THREE, 1.2, 1280, 800);
  discs.tick(cam);
  const first = discs.object.children.map((c) => c.visible);
  for (let i = 0; i < 5; i += 1) discs.tick(cam);
  assert.deepEqual(discs.object.children.map((c) => c.visible), first, '가만히 있는데 이름표가 바뀐다');
  discs.dispose();
});

/* ── 배선: 화면이 실제로 그렇게 도나 ──────────────────────────────────────── */

test('옛 점 구름이 사라졌다 — 개수의 로그로 칠하던 자리', () => {
  assert.ok(!LIVE_SRC.includes('Math.log10(1 + r.count)'),
    '아직 침수면 개수의 로그로 색을 칠하고 있다');
  assert.match(LIVE_SRC, /buildFloodIndex\(d\) \{[\s\S]{0,700}createFloodDiscs\(/);
});

test('지구를 직접 눌러 시군구를 연다 — 카드 단추 69개만이 길이 아니다', () => {
  assert.match(MAIN_SRC, /liveLayers\.pickFloodDisc\(e\.clientX, e\.clientY\)/);
  assert.match(MAIN_SRC, /shellHooks\.onAction\('flood-district', \{ sgg: fdisc\.sggCd \}\)/);
  // 카드 단추도 남아 있다
  assert.ok(LIVE_SRC.includes("data-action=\"flood-district\""));
  // 원반 집기는 관측 숫자 다음, 해구·여행보다 앞이다(원반이 그 위에 그려지므로)
  const iObs = MAIN_SRC.indexOf('obsLabels && obsLabels.pick(');
  const iDisc = MAIN_SRC.indexOf('liveLayers.pickFloodDisc(');
  const iTrench = MAIN_SRC.indexOf('seafloor && seafloor.pick(');
  assert.ok(iObs > 0 && iDisc > iObs && iTrench > iDisc, '원반 집기가 선택 사슬에서 엉뚱한 자리에 있다');
});

test('원반이 매 프레임 카메라를 받는다 — 줌에 따라 개수가 달라지려면', () => {
  assert.match(MAIN_SRC, /liveLayers\.tick\(now, altKm, camera\)/);
  assert.match(LIVE_SRC, /tick\(nowMs, altKm, camera\) \{[\s\S]{0,300}_floodDiscs\.tick\(camera\)/);
});

test('면이 떠 있는 동안 지구가 어느 시군구인지 말한다', () => {
  // 카드는 다음 클릭에 덮인다 — 지구 위 이름표를 그 시군구에 고정한다
  assert.match(LIVE_SRC, /_floodDiscs\.setSelected\(code\)/);
  // 끄면 표시도 함께 풀린다
  assert.match(LIVE_SRC, /khoaflood'\) \{ this\._floodSel = null; if \(this\._floodDiscs\) this\._floodDiscs\.setSelected\(null\); \}/);
});

test('이름이 언제의 침수인지 말한다 — 지금도 예보도 아니다', () => {
  const line = SHELL_SRC.split('\n').find((l) => l.includes("id: 'khoaflood'"));
  assert.ok(line, 'ui-shell 에서 레이어를 못 찾았다');
  assert.ok(/예상도/.test(line) && /가정/.test(line), `이름이 시나리오임을 안 말한다: ${line}`);
  assert.ok(/ocean/.test(SHELL_SRC.slice(SHELL_SRC.indexOf("id: 'ocean'"), SHELL_SRC.indexOf("id: 'khoaflood'"))),
    'khoaflood 가 해양 묶음 안에 없다');
  // 영어 이름도 같은 사실을 담는다
  const en = I18N_SRC.split('\n').find((l) => l.includes('khoaflood:'));
  assert.ok(/scenario/i.test(en) && /(not live|not a forecast)/i.test(en), `영어 이름이 시나리오임을 안 말한다: ${en}`);
});

test('메뉴의 질문이 자료가 지킬 수 있는 것만 약속한다', () => {
  const q = GUIDE_SRC.split('\n').find((l) => l.trim().startsWith('"khoaflood"'));
  assert.ok(q, 'menu-guide 에서 질문을 못 찾았다');
  // 자료에 가정(상승폭·재현주기)이 안 적혀 있다 — '어떤 가정에서' 는 못 지키는 약속이다
  assert.ok(!/어떤 가정에서/.test(q), `자료가 답할 수 없는 질문이다: ${q}`);
  assert.ok(/어디/.test(q), `자료가 답하는 것(어디)을 묻지 않는다: ${q}`);
  // 카드도 가정을 모른다고 적는다
  assert.ok(LIVE_SRC.includes('어떤 가정의 침수인지는 이 자료에 적혀 있지 않습니다'));
});

test('자료가 없는 연안은 그리지 않고, 없다는 사실을 화면이 말한다', () => {
  // 색인 문서의 note 를 카드가 그대로 싣는다(우리가 고쳐 쓰지 않는다)
  assert.match(LIVE_SRC, /escapeHtml\(d\.note \|\| ''\)/);
  assert.ok(INDEX.note.includes('침수 위험이 없다는 뜻이 아닙니다'));
});
