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
  FLOOD_HEAVY_BYTES, FLOOD_METRIC_KO,
  floodClassLabel, floodDeepestClass, floodDiscSpecs, floodHiddenNote, floodLegendHtml, floodLegendRows, floodSizeNote,
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

test('앵커는 69곳 전부에 있고, 저마다 제 bbox 안에 있다', () => {
  const codes = Object.keys(ANCHORS.districts);
  assert.equal(codes.length, 69);
  assert.equal(ANCHORS.indexGenerated, INDEX.generated, '앵커를 뜬 색인 판이 바뀌었다 — 다시 재야 한다');
  for (const cd of codes) {
    const a = ANCHORS.districts[cd];
    assert.equal(a.length, 3, `${cd}: [lon, lat, bytes] 가 아니다`);
    assert.ok(Number.isFinite(a[0]) && Number.isFinite(a[1]), `${cd}: 좌표가 숫자가 아니다`);
    assert.ok(a[0] > 124 && a[0] < 132, `${cd}: 경도가 한반도 밖이다`);
    assert.ok(a[1] > 32 && a[1] < 39, `${cd}: 위도가 한반도 밖이다`);
    assert.ok(Number.isInteger(a[2]) && a[2] > 0, `${cd}: 실측 용량이 없다`);
  }
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

test('폰은 데스크톱보다 원반을 적게 놓는다', () => {
  assert.ok(FLOOD_DISC_MAX_PHONE < FLOOD_DISC_MAX_DESKTOP);
});

/* ── 용량: 누르기 전에 말하나 ─────────────────────────────────────────────── */

test('무거운 시군구는 누르기 전에 용량을 말한다', () => {
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
});

test('시군구 하나를 받는 시간이 실측 최대 파일에 맞다', () => {
  // 33 MB 를 30초에 받으려면 9 Mbps 가 꾸준히 나와야 한다 — 이동통신망의 약속이 아니다.
  assert.ok(FLOOD_DISTRICT_TIMEOUT_MS > 30000, '30초로는 가장 큰 시군구가 못 들어온다');
  assert.match(LIVE_SRC, /fetchJson\(`\/ocean\/khoa\/flood\/\$\{code\}\.json`, FLOOD_DISTRICT_TIMEOUT_MS\)/);
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
