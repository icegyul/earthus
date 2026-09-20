// 지구 위 실측 숫자(js/obs-labels.js) — 지시서 W1 ⑦ "지구 위에 찍는 숫자는 실측 관측소 값"
//
// 금지만 시험하지 않는다 — **결과**를 시험한다. 아무것도 안 찍는 부품은 아래 금지 시험을 전부 통과하기 때문이다.
//   결과: 실제 관측값이 찍힌다(0.0°C 와 GTS 의 −9.0°C 까지) · 확대하면 개수가 는다 · 한국이 먼저다 · '지금'으로 돌아오면 다시 뜬다 ·
//         누르면 지점 카드 자료가 나온다.
//   금지: 결측이 0°C 로 찍히지 않는다 · 늙은 관측을 지금이라 하지 않는다 · 예보 시각에 관측을 얹지 않는다 · 지구 뒤편을 찍지 않는다 ·
//         지점 수만큼 텍스처를 만들지 않는다 · 카메라가 가만히 있는데 다시 솎지 않는다.
// 브라우저가 필요 없다: 캔버스는 받아 적기만 하는 가짜, 카메라는 진짜 THREE.PerspectiveCamera, 지평선 흐림은 진짜 newsChipOpacity.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import * as THREE from '../../prototype/vendor/three-r184.module.min.js';
import { createTimeBus } from '../../prototype/v2-three/js/time-bus.js';
import { newsChipOpacity } from '../../prototype/v2-three/js/live-layers.js';
import {
  createObsLabels, normalizeSurfaceObs, obsNumber, obsValue, obsWindDirDeg, parseObsTime, kstLabel, formatObs, fmt1, obsFresh,
  thinPoints, thinAdaptive, projectPx, windTangent, layoutLabel, obsCardHtml, obsCardTitle, obsOrderKey, obsLegendLine,
  OBS_MAX_DESKTOP, OBS_MAX_PHONE, OBS_MAX_AGE_MS, OBS_CELL_CSS, OBS_CELL_LADDER, OBS_RECULL_MIN_MS, OBS_GLYPHS_PER_LABEL,
  OBS_CELL_ARROW, OBS_CELL_DOT, OBS_CELL_TAG, OBS_ATLAS_CELLS, OBS_BADGE,
} from '../../prototype/v2-three/js/obs-labels.js';

const lf = (s) => s.replace(/\r\n/g, '\n');
const src = (rel) => lf(readFileSync(new URL(`../../prototype/v2-three/js/${rel}`, import.meta.url), 'utf8'));

const H1 = 3600 * 1000;
const NOW = Date.UTC(2026, 8, 20, 5, 50);            // 2026-09-20 05:50Z = 14:50 KST — 운영 파일을 받아 본 그 시각
const KST_1300 = '20260920 13:00';                   // 04:00Z · 나이 1시간 50분
const UTC_0300 = '202609200300';                     // 나이 2시간 50분 — GTS 의 정상 운영 나이

// ---- 픽스처: 운영 파일과 같은 열 이름 ----
const kma = (id, name, lat, lon, temp, extra = {}) => ({
  id: String(id), name, lat, lon, alt: 50, temp_c: temp, wind_ms: 2.8, wind_dir: 27, pres_sea: 1015.9, raw: {}, ...extra,
});
const gtsSt = (id, name, lat, lon, ta, extra = {}) => ({
  id: String(id), name, ctry: 'XX', lat, lon, alt: 10, tm: UTC_0300, ta, ws: 3.1, wd: 270, ps: 1012.4, ...extra,
});
const awsDoc = (stations, over = {}) => ({
  observedKst: KST_1300, source: '기상청 지상관측 (API허브)', sourceEn: 'KMA surface observations (API Hub)',
  stations, intel: { current: { values: [{ stationId: '108' }, { stationId: '159' }] } }, ...over,
});
const gtsDoc = (stations, over = {}) => ({
  observedUtc: UTC_0300, source: '세계기상통신망(GTS) 지상관측', sourceEn: 'GTS SYNOP surface observations', stations, ...over,
});

// ---- 가짜 캔버스: 무엇을 그리라 했는지는 안 본다 — 몇 장을 만들었는지만 센다 ----
const fakeDoc = () => {
  const d = {
    canvases: 0,
    createElement(tag) {
      assert.equal(tag, 'canvas', '관측 숫자는 캔버스만 만든다');
      d.canvases += 1;
      const ctx = new Proxy({}, { get: (t, k) => (k in t ? t[k] : () => {}), set: (t, k, v) => { t[k] = v; return true; } });
      return { width: 0, height: 0, getContext: () => ctx };
    },
  };
  return d;
};

const W = 1280, H = 800;
const cameraAt = (lat, lon, dist, w = W, h = H) => {
  const c = new THREE.PerspectiveCamera(35, w / h, 0.001, 100);
  const la = (lat * Math.PI) / 180, lo = (lon * Math.PI) / 180, cl = Math.cos(la);
  c.position.set(dist * cl * Math.sin(lo), dist * Math.sin(la), dist * cl * Math.cos(lo));
  c.lookAt(0, 0, 0);
  c.updateMatrixWorld(true);
  c.updateProjectionMatrix();
  return c;
};
const settle = () => new Promise((r) => setImmediate(r));

const make = ({ aws = null, gts = null, ...over } = {}) => {
  const scene = new THREE.Scene();
  const bus = createTimeBus();
  const doc = fakeDoc();
  const clock = { t: NOW };
  const view = { w: W, h: H };
  let gets = 0;
  const labels = createObsLabels({
    THREE, scene, timeBus: bus, doc,
    getData: async () => { gets += 1; return { aws, gts }; },
    surfR: () => 1.001, horizonOpacity: newsChipOpacity,
    getViewport: (o) => { o.w = view.w; o.h = view.h; },
    now: () => clock.t, isHidden: () => false, ...over,
  });
  // 켜고 → 첫 tick 이 문서를 묻고 → 도착한 뒤의 tick 이 솎는다
  const show = async (cam) => { labels.setVisible(true); labels.tick(cam); await settle(); clock.t += 1; labels.tick(cam); };
  return { scene, bus, doc, clock, view, labels, show, gets: () => gets };
};
const names = (L) => L.labels.placed().map((p) => p.name);

// 한국 위 3천 km · 전지구가 보이는 거리 · 아주 가까이
const KOREA = [36.5, 127.8];
const SEOUL = kma(108, '서울', 37.5714, 126.9658, 28.8);
const BUSAN = kma(159, '부산', 35.1047, 129.032, 27.0);
const SUWON = kma(119, '수원', 37.2723, 126.9853, 27.4);

/* ───────────── 값 읽기 ───────────── */

test('관측 시각을 읽는다 — 기상청은 KST, GTS 는 UTC', () => {
  assert.equal(parseObsTime('20260920 13:00', 'KST'), Date.UTC(2026, 8, 20, 4, 0));
  assert.equal(parseObsTime('202609200300', 'UTC'), Date.UTC(2026, 8, 20, 3, 0));
  assert.equal(kstLabel(Date.UTC(2026, 8, 20, 3, 0)), '9/20 12:00 KST', 'GTS 의 UTC 시각도 카드에서는 KST 로 말한다');
  for (const bad of [null, undefined, '', '2026', '20261320 13:00', '20260920 25:00', {}, 0]) {
    assert.equal(parseObsTime(bad, 'KST'), null, `${JSON.stringify(bad)} 를 시각으로 읽었다`);
  }
});

test('⚠️ Number(null) === 0 함정 — 결측은 어떤 꼴로 와도 숫자가 되지 않는다', () => {
  assert.equal(Number(null), 0, '전제: 이 함정은 실재한다');
  for (const v of [null, undefined, '', ' ', '-', 'NaN', NaN, Infinity, true, false, [], {}]) {
    assert.equal(obsNumber(v), null, `${String(v)} 가 숫자로 읽혔다`);
    assert.equal(obsValue(v, 'temp', 'KMA'), null);
  }
  assert.equal(obsNumber('24.0'), 24);
  assert.equal(obsNumber(0), 0, '진짜 0 은 값이다');
  for (const s of [-99, -999, -9999, '-99.0']) assert.equal(obsValue(s, 'temp', 'GTS'), null, `결측 부호 ${s} 가 기온이 됐다`);
  assert.equal(obsValue(-273.1, 'temp', 'GTS'), null, '절대영도 — 실측: 프랑스 07xxx 46곳이 이렇게 왔다');
});

test('−9 는 기관마다 다르다 — 기상청은 결측 부호, GTS 는 멀쩡한 −9.0°C · 풍속의 음수는 누구 것이든 결측', () => {
  assert.equal(obsValue(-9, 'temp', 'KMA'), null);
  assert.equal(obsValue(-9, 'temp', 'GTS'), -9, 'GTS 의 −9.0°C 를 버리면 겨울 고위도 관측이 조용히 사라진다(aws/gts-global/handler.py 머리말)');
  assert.equal(obsValue(-9, 'wind', 'GTS'), null, "'-9 m/s 로 부는 바람'은 없다 — 실측: 177곳이 이렇게 왔다");
  assert.equal(obsValue(-9, 'wind', 'KMA'), null);
  assert.equal(obsValue(-0.1, 'pres', 'GTS'), null);
  assert.equal(obsValue(0, 'wind', 'KMA'), 0, '무풍 0.0 은 값이다');
});

test('기상청 풍향은 36방위 부호(×10°)다 — 도로 읽으면 전부 북풍 언저리가 된다', () => {
  assert.equal(obsWindDirDeg(27, 'KMA'), 270);
  assert.equal(obsWindDirDeg(36, 'KMA'), 0);
  assert.equal(obsWindDirDeg(0, 'KMA'), null, '0 은 고요 — 방향이 없다');
  assert.equal(obsWindDirDeg(270, 'KMA'), null, '36 을 넘는 부호는 없다');
  assert.equal(obsWindDirDeg(270, 'GTS'), 270);
  assert.equal(obsWindDirDeg(null, 'GTS'), null);
});

test("글자: 0.1 정밀 · 음수는 U+2212 · '−0.0' 은 없다 · 단위는 붙이지 않는다(등온선 라벨 '20°C' 와 섞이지 않게)", () => {
  assert.equal(formatObs(27.44), '27.4');
  assert.equal(formatObs(-12.35), '−12.3');
  assert.equal(formatObs(-0.04), '0.0');
  assert.equal(formatObs(0), '0.0');
  assert.equal(formatObs(NaN), '');
  assert.equal(fmt1(1015.92), '1015.9');
});

/* ───────────── 문서 → 지점 ───────────── */

test('문서를 지점으로 푼다 — 결측 지점은 빠지고, 값은 지어내지 않는다', () => {
  const { sites, docs, dropped } = normalizeSurfaceObs({
    aws: awsDoc([
      SEOUL, kma(90, '속초', 38.2508, 128.5647, null, { wind_ms: null }),        // 기온도 바람도 없다
      kma(95, '철원', 38.1479, 127.3042, null),                                     // 기온만 없다
      kma(98, '동두천', null, 127.06, 25.0),                                        // 좌표가 없다
    ]),
    gts: gtsDoc([gtsSt('04005', 'Bolungavik', 66.15, -23.25, 7.9), gtsSt('99001', 'NoTemp', 10, 10, null, { ws: null })]),
  });
  assert.deepEqual(sites.map((s) => s.name).sort(), ['Bolungavik', '서울', '철원']);
  const cw = sites.find((s) => s.name === '철원');
  assert.equal(cw.temp, null, '결측 기온이 0 이 됐다');
  assert.equal(cw.wind, 2.8);
  assert.equal(dropped.noPosition, 1);
  assert.equal(dropped.noValue, 2);
  assert.equal(docs.KMA.observedMs, Date.UTC(2026, 8, 20, 4, 0));
  assert.equal(docs.GTS.observedMs, Date.UTC(2026, 8, 20, 3, 0));
  assert.equal(sites.find((s) => s.name === '서울').tier, 0, "자료(intel)가 '지금 기온'으로 뽑은 지점이 주요 지점이다");
  assert.equal(cw.tier, 1);
  assert.equal(sites.find((s) => s.name === 'Bolungavik').tier, 2);
});

test('한국은 두 파일에 다 있다 — GTS 47xxx 를 버리고 기상청 것을 남긴다', () => {
  const { sites, dropped } = normalizeSurfaceObs({
    aws: awsDoc([SEOUL, kma(90, '속초', 38.2508, 128.5647, 24.0)]),
    gts: gtsDoc([
      gtsSt('47108', 'Seoul City', 37.57, 126.97, 28.5), gtsSt('47090', 'Sokcho', 38.25, 128.56, 23.9),
      gtsSt('47097', 'Icheon', 37.27, 127.48, 26.0),     // 기상청 파일에 없는 번호는 남는다
      gtsSt('47412', 'Sapporo', 43.06, 141.33, 19.0),    // 일본(47 블록의 4xx)은 한국이 아니다
    ]),
  });
  assert.equal(dropped.dupKorea, 2);
  assert.deepEqual(sites.map((s) => `${s.src}:${s.name}`).sort(), ['GTS:Icheon', 'GTS:Sapporo', 'KMA:서울', 'KMA:속초']);
});

/* ───────────── 늙음 ───────────── */

test('늙음 상한은 수집기의 정상 나이보다 길다 — 정상 운영에서 숫자가 사라지면 안 된다', () => {
  // kma-aws: cron(25 * * * ? *) 가 한 시간 전 정시를 읽는다 → 최대 2시간 26분. gts-global: cron(35) 가 두 시간 전 정시 → 최대 3시간 36분.
  assert.ok(obsFresh(NOW - (2 * H1 + 26 * 60000), 'KMA', NOW), '기상청이 매시 25분 동안 사라진다');
  assert.ok(obsFresh(NOW - (3 * H1 + 36 * 60000), 'GTS', NOW), 'GTS 가 영원히 안 찍힌다(수집기가 두 시간 전 정시를 읽는다)');
  assert.ok(!obsFresh(NOW - OBS_MAX_AGE_MS.KMA - 1, 'KMA', NOW));
  assert.ok(!obsFresh(NOW - OBS_MAX_AGE_MS.GTS - 1, 'GTS', NOW));
  assert.ok(!obsFresh(null, 'KMA', NOW), '관측 시각이 없으면 지금이라 말할 수 없다');
  assert.ok(!obsFresh(NOW + 2 * H1, 'KMA', NOW), '미래의 관측 — 기기 시계가 틀렸다. 나이를 믿을 수 없다');
  assert.ok(!obsFresh(NOW - H1, 'ZZZ', NOW), '모르는 기관에는 상한이 없다 — 찍지 않는다');
});

test('늙은 지점은 빠지고, 문서가 통째로 늙었으면 아무것도 안 찍고 state() 가 그 사실을 말한다', async () => {
  const old = '202609200000';                       // 5시간 50분 전
  const L = make({
    aws: awsDoc([SEOUL, BUSAN]),
    gts: gtsDoc([gtsSt('47412', 'Sapporo', 43.06, 141.33, 19.0), gtsSt('47401', 'Wakkanai', 45.41, 141.68, 15.0, { tm: old })]),
  });
  await L.show(cameraAt(...KOREA, 1.6));
  assert.ok(names(L).includes('Sapporo'));
  assert.ok(!names(L).includes('Wakkanai'), '5시간 50분 전 관측이 지금 숫자로 찍혔다');

  const S = make({ aws: awsDoc([SEOUL, BUSAN], { observedKst: '20260920 09:00' }), gts: gtsDoc([gtsSt('47412', 'Sapporo', 43.06, 141.33, 19.0, { tm: old })], { observedUtc: old }) });
  await S.show(cameraAt(...KOREA, 1.6));
  const st = S.labels.state();
  assert.equal(st.placed, 0);
  assert.equal(st.shown, false);
  assert.equal(st.reason, 'stale');
  assert.equal(st.docs.KMA.stale, true);
  assert.equal(st.docs.GTS.stale, true);
  assert.equal(st.docs.KMA.observedKst, '9/20 09:00 KST');
  assert.ok(st.reasonKo.includes('늙'), '왜 비었는지 사람 말로 적혀 있어야 본 세션이 버그와 정직한 빈 화면을 구분한다');
});

test('카메라가 멈춰 있어도 관측은 늙는다 — 상한을 넘기면 가만히 있는 화면에서도 내려간다', async () => {
  const L = make({ aws: awsDoc([SEOUL]) });
  const cam = cameraAt(...KOREA, 1.3);
  await L.show(cam);
  assert.equal(L.labels.state().placed, 1);
  L.clock.t = NOW + 2 * H1;                           // 관측 04:00Z → 나이 3시간 50분
  L.labels.tick(cam);
  assert.equal(L.labels.state().placed, 0);
  assert.equal(L.labels.state().reason, 'stale');
});

/* ───────────── 결과: 실제로 찍힌다 ───────────── */

test('실측값이 찍힌다 — 0.0°C 도, GTS 의 −9.0°C 도. 결측은 0°C 로도 안 찍힌다', async () => {
  const L = make({
    aws: awsDoc([SEOUL, kma(100, '대관령', 37.6771, 128.7183, 0), kma(95, '철원', 38.1479, 127.3042, null), kma(101, '춘천', 37.9026, 127.7357, -9)]),
    gts: gtsDoc([gtsSt('31088', 'Ohotsk', 40.5, 131.0, -9), gtsSt('31089', 'Hole', 39.0, 133.5, '')]),
  });
  await L.show(cameraAt(38.5, 129.5, 1.35));
  const got = Object.fromEntries(L.labels.placed().map((p) => [p.name, p.text]));
  assert.equal(got['서울'], '28.8');
  assert.equal(got['대관령'], '0.0', '진짜 0.0°C 는 관측값이다 — 결측과 헷갈려 버리면 안 된다');
  assert.equal(got.Ohotsk, '−9.0');
  assert.ok(!('철원' in got), 'null 기온이 찍혔다');
  assert.ok(!('춘천' in got), '기상청의 −9(결측 부호)가 −9.0°C 로 찍혔다');
  assert.ok(!('Hole' in got), "'' 가 찍혔다");
  assert.equal(Object.values(got).filter((t) => t === '0.0').length, 1, '0.0 은 대관령 하나뿐이어야 한다 — 결측이 0°C 로 둔갑했다');
  const st = L.labels.state();
  assert.equal(st.reason, 'ok');
  assert.equal(st.shown, true);
});

test("타임라인을 밀면 숨고 '지금'으로 오면 돌아온다 — 문서를 다시 받지도 않는다", async () => {
  const L = make({ aws: awsDoc([SEOUL, BUSAN]) });
  const cam = cameraAt(...KOREA, 1.3);
  await L.show(cam);
  const mesh = L.scene.children[0];
  assert.equal(mesh.visible, true);
  assert.equal(L.labels.state().placed, 2);

  L.bus.set(3 * H1);                                 // 예보 +3h
  L.labels.tick(cam);
  assert.equal(mesh.visible, false, '예보 시각의 색면 위에 현재 관측이 얹혔다');
  assert.equal(L.labels.state().reason, 'not-now');
  assert.equal(L.labels.pick({ x: W / 2, y: H / 2 }), null, '안 보이는 라벨이 눌렸다');

  L.bus.set(-6 * H1);                                // 과거도 지금이 아니다
  L.labels.tick(cam);
  assert.equal(mesh.visible, false);

  L.bus.set(0);
  L.labels.tick(cam);
  assert.equal(mesh.visible, true, "'지금'으로 돌아왔는데 숫자가 안 돌아왔다");
  assert.equal(L.labels.state().placed, 2);
  assert.equal(L.gets(), 1, '타임라인을 오가는 것만으로 문서를 다시 받았다');
});

test('기온 레이어가 꺼져 있으면 문서를 묻지도 않는다', async () => {
  const L = make({ aws: awsDoc([SEOUL]) });
  const cam = cameraAt(...KOREA, 1.3);
  L.labels.tick(cam); await settle(); L.labels.tick(cam);
  assert.equal(L.gets(), 0, '메뉴를 켜지 않은 사람에게 1.1 MB 를 내려보냈다');
  assert.equal(L.labels.state().reason, 'layer-off');
  assert.equal(L.scene.children.length, 0, '켜지도 않았는데 GPU 자원을 만들었다');
});

/* ───────────── 솎기 ───────────── */

test('같은 버킷에 하나 — 그리고 먼저 온 쪽(열쇠가 작은 쪽)이 자리를 갖는다', () => {
  const pts = [
    { x: 100, y: 100, key: 5 }, { x: 110, y: 104, key: 1 }, { x: 130, y: 110, key: 3 },   // 한 버킷(72×34)에 셋
    { x: 600, y: 400, key: 9 },
  ];
  const { picked } = thinPoints(pts, { w: W, h: H, max: 60 });
  assert.deepEqual(picked.sort(), [1, 3]);
  const cell = (p) => `${Math.floor(p.x / OBS_CELL_CSS.w)}:${Math.floor(p.y / OBS_CELL_CSS.h)}`;
  const cells = picked.map((i) => cell(pts[i]));
  assert.equal(new Set(cells).size, cells.length);
});

test('버킷 경계 양쪽에 붙은 두 지점은 겹치므로 하나만 — 버킷만 보면 둘 다 통과한다', () => {
  const pts = [{ x: OBS_CELL_CSS.w - 2, y: 50, key: 1 }, { x: OBS_CELL_CSS.w + 2, y: 50, key: 2 }];
  assert.deepEqual(thinPoints(pts, { w: W, h: H, max: 60 }).picked, [0]);
});

test('상한을 넘으면 앞에서 자르지 않고 버킷을 키운다 — 한쪽에 몰리지 않고 화면 전체에 남는다', () => {
  const pts = [];
  for (let y = 10; y < H; y += 20) for (let x = 10; x < W; x += 30) pts.push({ x, y, key: pts.length });   // 왼쪽 위부터 번호순
  const { picked, scale } = thinPoints(pts, { w: W, h: H, max: 60 });
  assert.ok(picked.length <= 60 && picked.length >= 30, `남은 수 ${picked.length}`);
  assert.ok(scale > 1);
  const right = picked.filter((i) => pts[i].x > W / 2).length;
  const bottom = picked.filter((i) => pts[i].y > H / 2).length;
  assert.ok(right >= picked.length * 0.3 && bottom >= picked.length * 0.3, `번호순으로 60개를 잘랐다 — 오른쪽 ${right} · 아래 ${bottom} / ${picked.length}`);
});

test('버킷 배율은 붙박이다 — 지난 배율이 아직 맞으면 그대로 쓴다(상한 언저리에서 배율이 오가면 라벨이 한꺼번에 깜빡인다)', () => {
  const pts = [];
  for (let y = 10; y < H; y += 20) for (let x = 10; x < W; x += 30) pts.push({ x, y, key: pts.length });
  const n = pts.length;
  const xs = Float32Array.from(pts, (p) => p.x), ys = Float32Array.from(pts, (p) => p.y);
  const order = Uint32Array.from(pts, (_, i) => i), out = new Int32Array(n), grid = { cells: new Int32Array(0) };
  const fresh = thinAdaptive(n, order, xs, ys, W, H, 60, grid, out);
  const bigger = OBS_CELL_LADDER[OBS_CELL_LADDER.indexOf(fresh.scale) + 1];
  const kept = thinAdaptive(n, order, xs, ys, W, H, 60, grid, out, undefined, undefined, bigger);
  assert.equal(kept.scale, bigger, '지난 배율이 아직 맞는데(상한 안 · 절반 이상) 버렸다');
  assert.ok(kept.count <= 60 && kept.count >= 30);
  // 지난 배율이 너무 커졌으면(확대해서 지점이 벌어졌다) 버리고 다시 고른다 — 안 그러면 확대해도 개수가 안 는다
  const sparse = thinAdaptive(n, order, xs, ys, W, H, 60, grid, out, undefined, undefined, 8);
  assert.equal(sparse.scale, fresh.scale);
});

test('자리 순서: 한국·주요 지점 → 한국 → 나머지, 같은 등급이면 찍혀 있던 것이 먼저', () => {
  assert.ok(obsOrderKey(0, false, 0.2) < obsOrderKey(1, true, 1), '등급이 붙박이보다 앞선다');
  assert.ok(obsOrderKey(1, false, 0.2) < obsOrderKey(2, true, 1));
  assert.ok(obsOrderKey(2, true, 0.3) < obsOrderKey(2, false, 1), '자동 회전 중 깜빡임을 줄이는 붙박이');
  assert.ok(obsOrderKey(2, false, 0.9) < obsOrderKey(2, false, 0.4), '화면 가운데에 가까운 쪽');
});

test('확대하면 개수가 는다 — 버킷은 화면 CSS px 기준이다', async () => {
  const cluster = [];
  for (let i = 0; i < 5; i += 1) for (let j = 0; j < 5; j += 1) cluster.push(gtsSt(`5${i}${j}00`, `P${i}${j}`, 35 + i * 0.5, 126 + j * 0.5, 20 + i));
  const far = make({ gts: gtsDoc(cluster) });
  await far.show(cameraAt(36, 127, 3.2));
  const near = make({ gts: gtsDoc(cluster) });
  await near.show(cameraAt(36, 127, 1.12));
  const a = far.labels.state().placed, b = near.labels.state().placed;
  assert.ok(a >= 1 && a <= 3, `멀리서 ${a}개 — 2° 안의 25지점은 한두 버킷이다`);
  assert.ok(b > a * 3, `가까이서 ${b}개 · 멀리서 ${a}개 — 확대해도 늘지 않는다`);
});

test('한국 먼저 — 같은 자리를 다투면 기상청 지점이, 그중에서도 자료가 뽑은 주요 지점이 남는다', async () => {
  const L = make({
    aws: awsDoc([SUWON, SEOUL]),                                        // 수원이 배열에서 먼저지만 서울이 주요 지점이다
    gts: gtsDoc([gtsSt('47999', 'Near Seoul GTS', 37.45, 126.9, 28.0)]),
  });
  await L.show(cameraAt(...KOREA, 2.6));                               // 멀리서 — 셋이 한 버킷
  assert.deepEqual(names(L), ['서울']);
});

test('상한: 데스크톱 60 · 폰 24 — 지점이 5,000곳이어도', async () => {
  let seed = 7;
  const rnd = () => { seed = (seed * 16807) % 2147483647; return seed / 2147483647; };
  const many = Array.from({ length: 5000 }, (_, i) => gtsSt(`9${String(i).padStart(4, '0')}`, `R${i}`, Math.asin(rnd() * 2 - 1) * 180 / Math.PI, rnd() * 360 - 180, 15));
  const desk = make({ gts: gtsDoc(many) });
  await desk.show(cameraAt(20, 100, 2.9));
  const phone = make({ gts: gtsDoc(many), isPhone: () => true });
  phone.view.w = 375; phone.view.h = 812;
  await phone.show(cameraAt(20, 100, 2.9, 375, 812));
  const d = desk.labels.state(), p = phone.labels.state();
  assert.equal(OBS_MAX_DESKTOP, 60); assert.equal(OBS_MAX_PHONE, 24);
  assert.ok(d.placed <= 60 && d.placed >= 30, `데스크톱 ${d.placed}`);
  assert.ok(p.placed <= 24 && p.placed >= 10, `폰 ${p.placed}`);
  assert.equal(d.max, 60); assert.equal(p.max, 24);
});

test('지구 뒤편과 지평선 너머는 찍지 않는다', async () => {
  const L = make({ gts: gtsDoc([
    gtsSt('10001', 'Front', 36, 127, 20), gtsSt('10002', 'Back', -36, -53, 20),
    gtsSt('10003', 'Limb', 36, 127 + 80, 20),          // 3천 km 상공에서 80° 옆은 지평선 너머다
  ]) });
  await L.show(cameraAt(36, 127, 1.5));
  assert.deepEqual(names(L), ['Front']);
});

/* ───────────── 발열 ───────────── */

test('텍스처 1 · 지오메트리 1 · 드로우콜 1 — 지점이 3곳이든 5,000곳이든 같다', async () => {
  const few = make({ aws: awsDoc([SEOUL, BUSAN, SUWON]) });
  await few.show(cameraAt(...KOREA, 1.2));
  const many = make({ gts: gtsDoc(Array.from({ length: 5000 }, (_, i) => gtsSt(`8${String(i).padStart(4, '0')}`, `M${i}`, 30 + (i % 70) * 0.2, 120 + Math.floor(i / 70) * 0.2, 18))) });
  await many.show(cameraAt(...KOREA, 1.2));
  for (const L of [few, many]) {
    assert.equal(L.doc.canvases, 1, '아틀라스는 한 장이다 — 라벨마다 캔버스를 만들면 v1 의 라벨 2,843개 발열이 된다');
    assert.equal(L.scene.children.length, 1);
    const kids = []; L.scene.traverse((o) => { if (o !== L.scene) kids.push(o); });
    assert.equal(kids.length, 1, '드로우콜은 메시 하나다');
    assert.ok(kids[0].isMesh && !kids[0].isSprite);
  }
  const a = few.labels.state().gpu, b = many.labels.state().gpu;
  assert.deepEqual({ ...a, instances: 0 }, { ...b, instances: 0 }, 'GPU 자원 수가 지점 수를 따라간다');
  assert.equal(a.instanceCapacity, OBS_MAX_DESKTOP * OBS_GLYPHS_PER_LABEL);
  const ga = few.scene.children[0].geometry, gb = many.scene.children[0].geometry;
  for (const k of Object.keys(ga.attributes)) assert.equal(ga.attributes[k].array.length, gb.attributes[k].array.length, `${k} 버퍼가 지점 수만큼 커졌다`);
  assert.ok(b.instances <= a.instanceCapacity);
  assert.equal(few.scene.children[0].material.depthTest, false);
});

test('카메라가 안 움직이면 다시 솎지 않는다 — 조금 움직이면 흐림만, 많이 움직여야 다시 솎는다', async () => {
  const L = make({ aws: awsDoc([SEOUL, BUSAN, SUWON]) });
  const cam = cameraAt(...KOREA, 1.5);
  await L.show(cam);
  const s0 = L.labels.state();
  assert.equal(s0.culls, 1);
  const alphaVer = () => L.scene.children[0].geometry.attributes.aAlpha.version;
  const anchorVer = () => L.scene.children[0].geometry.attributes.aAnchor.version;
  const v0 = alphaVer(), p0 = anchorVer();
  for (let i = 0; i < 30; i += 1) { L.clock.t += 16; L.labels.tick(cam); }
  assert.equal(L.labels.state().culls, 1, '가만히 있는데 다시 솎았다');
  assert.equal(alphaVer(), v0, '가만히 있는데 GPU 로 버퍼를 올렸다');

  L.clock.t += 500;
  L.labels.tick(cameraAt(KOREA[0], KOREA[1] + 0.05, 1.5));            // 화면에서 몇 px — 문턱 아래
  assert.equal(L.labels.state().culls, 1, '문턱 아래인데 다시 솎았다');
  assert.equal(anchorVer(), p0);

  L.clock.t += 500;
  L.labels.tick(cameraAt(KOREA[0], KOREA[1] + 8, 1.5));               // 크게 돌았다
  assert.equal(L.labels.state().culls, 2);
  L.clock.t += 500;
  L.labels.tick(cameraAt(KOREA[0], KOREA[1] + 8, 1.2));               // 확대
  assert.equal(L.labels.state().culls, 3, '확대했는데 다시 솎지 않았다 — 개수가 늘 수 없다');
});

test('끄는 동안 매 프레임 솎지 않는다 — 미룬 솎기는 카메라가 멈춘 뒤에라도 마저 한다', async () => {
  const L = make({ aws: awsDoc([SEOUL, BUSAN]) });
  await L.show(cameraAt(...KOREA, 1.5));
  const moved = cameraAt(KOREA[0], KOREA[1] + 10, 1.5);
  L.clock.t += OBS_RECULL_MIN_MS - 100;                // show() 의 마지막 tick 에서 20ms 뒤쯤
  L.labels.tick(moved);
  assert.equal(L.labels.state().culls, 1, '최소 간격 안인데 다시 솎았다');
  L.clock.t += OBS_RECULL_MIN_MS;
  L.labels.tick(moved);                               // 카메라는 이미 멈췄다(행렬이 같다)
  assert.equal(L.labels.state().culls, 2, "미뤄 둔 솎기를 잊었다 — 멈춘 카메라를 '할 일 없음'으로 넘겼다");
});

test('문서가 같으면 다시 풀지 않는다 — 20분마다 묻되, 저장소가 같은 객체를 주면 그대로 둔다', async () => {
  const L = make({ aws: awsDoc([SEOUL]) });
  const cam = cameraAt(...KOREA, 1.3);
  await L.show(cam);
  L.clock.t += 21 * 60 * 1000;
  L.labels.tick(cam); await settle(); L.labels.tick(cam);
  assert.equal(L.gets(), 2, '20분이 지났는데 문서를 다시 묻지 않았다');
  assert.equal(L.labels.state().placed, 1);
});

/* ───────────── 누르기 · 카드 ───────────── */

test('숫자를 누르면 지점 카드 자료가 나온다 — 이름 · 0.1°C · 관측 시각(KST) · 출처 · 공식 관측 배지', async () => {
  const L = make({ aws: awsDoc([SEOUL, BUSAN]), gts: gtsDoc([gtsSt('47412', 'Sapporo', 43.06, 141.33, 19.04)]) });
  const cam = cameraAt(...KOREA, 1.6);
  await L.show(cam);
  const e = new Float64Array(16), out = new Float64Array(2);
  const m = new THREE.Matrix4().multiplyMatrices(cam.projectionMatrix, cam.matrixWorldInverse);
  e.set(m.elements);
  const at = (lat, lon, r = 1.001) => {
    const la = (lat * Math.PI) / 180, lo = (lon * Math.PI) / 180, cl = Math.cos(la);
    assert.ok(projectPx(e, r * cl * Math.sin(lo), r * Math.sin(la), r * cl * Math.cos(lo), W, H, out));
    return { x: out[0], y: out[1] };
  };
  const seoul = at(37.5714, 126.9658);
  const hit = L.labels.pick({ x: seoul.x + 20, y: seoul.y });            // 점이 아니라 숫자 위를 눌렀다
  assert.ok(hit, '숫자를 눌렀는데 아무것도 안 잡혔다');
  assert.equal(hit.name, '서울');
  assert.equal(hit.text, '28.8');
  assert.equal(hit.unit, '°C');
  assert.equal(hit.obsKst, '9/20 13:00 KST');
  assert.equal(hit.badge, 'OFFICIAL_OBSERVATION');
  assert.equal(OBS_BADGE, 'OFFICIAL_OBSERVATION', '배지는 engine-bridge 의 어휘 그대로다');
  assert.equal(hit.sourceKo, '기상청 지상관측 (API허브)', '출처는 문서가 말한 그대로 — 지어내지 않는다');
  assert.equal(hit.ageMin, 110);

  const sap = L.labels.pick({ lat: 43.06, lon: 141.33 });                // 지구 레이캐스트 결과로도 잡힌다
  assert.equal(sap.name, 'Sapporo');
  assert.equal(sap.text, '19.0');
  assert.equal(sap.obsKst, '9/20 12:00 KST');
  assert.equal(sap.src, 'GTS');

  assert.equal(L.labels.pick({ x: 5, y: 5 }), null, '허공을 눌렀는데 카드가 떴다');
  assert.equal(L.labels.pick(null), null);

  const html = obsCardHtml(hit, { lang: 'ko' });
  for (const must of ['28.8 °C', '9/20 13:00 KST', '1시간 50분 전', '기상청 지상관측 (API허브)', 'N37.57°', '예보가 아닙니다', '격자 평균']) {
    assert.ok(html.includes(must), `카드에 '${must}' 가 없다`);
  }
  assert.equal(obsCardTitle(hit, 'ko'), '서울 · 관측 지점');
  assert.ok(obsCardHtml(sap, { lang: 'en' }).includes('GTS SYNOP surface observations'));
});

test('범례에 붙일 한 줄 — 찍히고 있을 때만, 관측 시각과 함께. 안 찍히면 빈 줄(없는 것을 약속하지 않는다)', async () => {
  const L = make({ aws: awsDoc([SEOUL]), gts: gtsDoc([gtsSt('47412', 'Sapporo', 43.06, 141.33, 19.0)]) });
  assert.equal(obsLegendLine(L.labels.state()), '');
  const cam = cameraAt(...KOREA, 1.6);
  await L.show(cam);
  assert.equal(obsLegendLine(L.labels.state(), 'ko'), '● 숫자 = 관측소 실측(OBS) · 기상청 9/20 13:00 KST · GTS 9/20 12:00 KST');
  L.bus.set(6 * H1); L.labels.tick(cam);
  assert.equal(obsLegendLine(L.labels.state()), '');
});

test('카드는 지점 이름을 그대로 HTML 로 내보내지 않는다 — GTS 이름은 남의 표(NOAA ISD)에서 온다', () => {
  const html = obsCardHtml({ name: '<img src=x onerror=alert(1)>', metric: 'temp', text: '1.0', lat: 1, lon: 2, alt: null, obsKst: 'x', ageMin: 5, sourceKo: '<b>s</b>', temp: 1, wind: null, pres: null });
  assert.ok(!html.includes('<img') && !html.includes('<b>s</b>'));
});

/* ───────────── 바람(지금은 API 만 — 화면에 단추가 없다) ───────────── */

test('화살촉은 바람이 가는 쪽을 가리킨다 — 서풍(270°)이면 동쪽으로', () => {
  const t = windTangent(0, 0, 270, new Float64Array(3));
  assert.ok(Math.abs(t[0] - 1) < 1e-9 && Math.abs(t[1]) < 1e-9 && Math.abs(t[2]) < 1e-9, `적도·본초자오선에서 동쪽은 +x 다: ${Array.from(t)}`);
  const n = windTangent(0, 0, 180, new Float64Array(3));               // 남풍 → 북으로
  assert.ok(Math.abs(n[1] - 1) < 1e-9);
  const k = windTangent(37.5, 127, 45, new Float64Array(3));
  const la = 37.5 * Math.PI / 180, lo = 127 * Math.PI / 180;
  const p = [Math.cos(la) * Math.sin(lo), Math.sin(la), Math.cos(la) * Math.cos(lo)];
  assert.ok(Math.abs(k[0] * p[0] + k[1] * p[1] + k[2] * p[2]) < 1e-9, '지표 접선이 아니다');
  assert.ok(Math.abs(Math.hypot(k[0], k[1], k[2]) - 1) < 1e-9);
});

test("setMetric('wind') — 숫자 + 화살촉. 화살촉 크기는 풍속과 무관하다(막대기 금지) · 고요에는 화살촉이 없다", async () => {
  const L = make({ gts: gtsDoc([
    gtsSt('20001', 'Breeze', 36, 126, 20, { ws: 3.0, wd: 270 }), gtsSt('20002', 'Storm', 36, 129, 20, { ws: 30.0, wd: 270 }),
    gtsSt('20003', 'Calm', 38, 127.5, 20, { ws: 0.2, wd: 90 }), gtsSt('20004', 'NoWind', 34, 127.5, 20, { ws: -9, wd: 90 }),
  ]) });
  assert.equal(L.labels.setMetric('humidity'), false, '없는 지표를 찍는 척했다');
  assert.equal(L.labels.setMetric('wind'), true);
  await L.show(cameraAt(36, 127.5, 1.25));
  const got = Object.fromEntries(L.labels.placed().map((p) => [p.name, p]));
  assert.equal(got.Breeze.text, '3.0');
  assert.equal(got.Storm.text, '30.0');
  assert.ok(!('NoWind' in got), '풍속 −9 가 찍혔다');
  assert.equal(got.Calm.text, '0.2');
  const g = L.scene.children[0].geometry;
  const uv = g.attributes.aUv.array, dir = g.attributes.aDir.array;
  const arrows = [];
  for (let i = 0; i < g.instanceCount; i += 1) {
    const cell = Math.round(uv[i * 4] * OBS_ATLAS_CELLS);
    const rot = Math.hypot(dir[i * 3], dir[i * 3 + 1], dir[i * 3 + 2]);
    if (cell === OBS_CELL_ARROW) { arrows.push(i); assert.ok(Math.abs(rot - 1) < 1e-5, '화살촉에 방향이 없다'); }
    else assert.equal(rot, 0, '숫자가 돌아간다');
  }
  assert.equal(arrows.length, 2, '고요(0.2 m/s)에 화살촉을 달았거나 센 바람에 안 달았다');
  // 인스턴스 속성은 자리 · 간격 · 아틀라스 칸 · 흐림 · 방향뿐이다 — 크기를 실을 자리가 없다(글리프 크기는 셰이더 상수).
  assert.deepEqual(Object.keys(g.attributes).sort(), ['aAlpha', 'aAnchor', 'aDir', 'aOffset', 'aUv', 'position']);
  assert.ok(!/aSize|aScale|aLength/.test(src('obs-labels.js')));
});

test('라벨 하나의 글리프: 점 + 글자 + OBS 꼬리표 (+ 화살촉) — 8개를 넘지 않는다', () => {
  const cells = new Int8Array(OBS_GLYPHS_PER_LABEL), offs = new Float32Array(OBS_GLYPHS_PER_LABEL * 2);
  const n = layoutLabel('−12.4', false, cells, offs);
  assert.equal(n, 7);
  assert.equal(cells[0], OBS_CELL_DOT);
  assert.equal(cells[n - 1], OBS_CELL_TAG, "'OBS' 꼬리표가 없으면 모델 색면 위의 숫자가 모델값으로 읽힌다");
  assert.deepEqual(Array.from(cells.subarray(1, 6)), [10, 1, 2, 11, 4]);
  for (let k = 2; k < 6; k += 1) assert.ok(offs[k * 2] > offs[(k - 1) * 2], '글자가 왼쪽에서 오른쪽으로 놓이지 않았다');
  assert.equal(layoutLabel('100.0', true, cells, offs), 8);
  assert.equal(layoutLabel('1234567.8', true, cells, offs), 8, '긴 글자가 버퍼를 넘겼다');
});

/* ───────────── 배선 ───────────── */

test('main.js 배선 — 기온 레이어가 켜져 있을 때만 · 지평선 흐림은 뉴스 네모칸의 식을 그대로 · 누르면 공식 관측 카드', () => {
  const main = src('main.js');
  assert.match(main, /import \{ createObsLabels, obsCardHtml, obsCardTitle \} from '\.\/obs-labels\.js\?v=1';/);
  // newsChipOpacity 는 LiveLayers 와 **같은 import 문**에서 와야 한다 — 줄을 따로 두면 ?v= 가 어긋나는 날 live-layers 가 두 번 실린다.
  assert.match(main, /import \{ LiveLayers, newsChipOpacity \} from '\.\/live-layers\.js\?v=[^']+';/);
  assert.equal((main.match(/from '\.\/live-layers\.js/g) || []).length, 1);
  assert.match(main, /horizonOpacity: newsChipOpacity/);
  assert.match(main, /getData: \(\) => surfaceObs\.both\(\)/);
  assert.match(main, /obsLabels\.setVisible\(!!liveLayers\.state\('tempgrid'\)\.on\);\s*\n\s*obsLabels\.tick\(camera\);/);
  assert.match(main, /obsLabels && obsLabels\.pick\(\{ x: e\.clientX, y: e\.clientY \}\)/);
  assert.match(main, /showNote\(obsCardTitle\(ob, lang\), obsCardHtml\(ob, \{ lang \}\), ob\.badge\)/);
  assert.match(main, /window\.__earthus\.obs = obsLabels;/);
});

test('부품은 아무것도 import 하지 않는다 — v1(prototype/js)을 런타임에 들이지 않고, 식도 베끼지 않는다', () => {
  const text = src('obs-labels.js');
  const code = text.split('\n').filter((l) => !l.trim().startsWith('//'));
  assert.equal(code.filter((l) => /^\s*import\s/.test(l)).length, 0);
  // obsNumber( 와 Number.isFinite( 는 아니다 — 맨몸의 Number( 만 잡는다
  assert.ok(!/(^|[^\w.])Number\(/m.test(code.join('\n')), 'Number(x) 를 쓰면 Number(null) === 0 함정이 다시 열린다');
  assert.ok(!/\|\|\s*0\b/.test(code.join('\n')), "'x || 0' 은 결측을 0 으로 만든다");
  assert.ok(!/facing - horizon/.test(text), 'newsChipOpacity 의 식을 베꼈다 — 넣어 받아야 한다');
});

test('필요한 것을 안 넣으면 바로 던진다 — 조용히 아무것도 안 그리는 부품이 되지 않는다', () => {
  assert.throws(() => createObsLabels({ THREE, scene: new THREE.Scene(), timeBus: createTimeBus(), getData: async () => ({}), surfR: () => 1 }), /horizonOpacity/);
});

test('dispose 하면 시간 버스에서 빠지고 장면에서 사라진다', async () => {
  const L = make({ aws: awsDoc([SEOUL]) });
  await L.show(cameraAt(...KOREA, 1.3));
  assert.equal(L.bus.listeners(), 1);
  L.labels.dispose();
  assert.equal(L.bus.listeners(), 0, '꺼진 부품이 시간을 계속 듣는다');
  assert.equal(L.scene.children.length, 0);
});
