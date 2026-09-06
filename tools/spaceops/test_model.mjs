/* 위성 관제센터 모델 검증 — node tools/spaceops/test_model.mjs
 * Cesium·DOM 없이 model.js 의 계산을 실제 궤도요소(ISS·정지위성·파편)로 확인한다. */
import fs from 'node:fs';
import vm from 'node:vm';
import assert from 'node:assert/strict';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const satSrc = fs.readFileSync(path.join(here, '..', '..', 'prototype', 'vendor', 'satellite-6.0.2.min.js'), 'utf8');
const modBox = { exports: {} };
vm.runInNewContext(satSrc, { module: modBox, exports: modBox.exports, Date });
const satellite = modBox.exports;
const M = await import(new URL('../../prototype/js/spaceops/model.js', import.meta.url).href);
M.setSatLib(satellite);

// 실제 공개 TLE (2024-11 ISS · 2024 GOES-16 · COSMOS 2251 파편 계열 예). epoch 이 오래됐어도 계산 검증엔 충분하다.
const ISS = satellite.twoline2satrec(
  '1 25544U 98067A   24310.53716493  .00021254  00000+0  38044-3 0  9995',
  '2 25544  51.6403 100.6817 0007742 121.6486 358.3908 15.49811183480148');
const GOES16 = satellite.twoline2satrec(
  '1 41866U 16071A   24310.24210395 -.00000258  00000+0  00000+0 0  9990',
  '2 41866   0.0350 279.2360 0001183 235.6440 205.9840  1.00271160 29157');
const DEB = satellite.twoline2satrec(
  '1 34427U 93036SX  24310.12345678  .00001234  00000+0  12345-3 0  9993',
  '2 34427  74.0350 100.6817 0027742 121.6486 238.3908 14.49811183480141');

let n = 0;
const ok = (name, fn) => { fn(); n++; console.log('  ✓', name); };

ok('classify — 이름·타입 규약', () => {
  assert.equal(M.classify('ISS (ZARYA)'), M.KIND.STATION);
  assert.equal(M.classify('COSMOS 2251 DEB'), M.KIND.FRAGMENT);
  assert.equal(M.classify('CZ-3B R/B'), M.KIND.ROCKET_BODY);
  assert.equal(M.classify('SL-16 DEB'), M.KIND.DEBRIS);
  assert.equal(M.classify('KOMPSAT-7A'), M.KIND.SATELLITE);
  assert.equal(M.classify('OBJECT K'), M.KIND.UNKNOWN);
  assert.equal(M.classify('X', 'ROCKET BODY'), M.KIND.ROCKET_BODY);
});

ok('elementsOf — ISS 는 LEO 51.6° 93분, GOES-16 은 GEO 1436분', () => {
  const e = M.elementsOf(ISS);
  assert.ok(Math.abs(e.incDeg - 51.64) < 0.01, e.incDeg);
  assert.ok(e.periodMin > 92 && e.periodMin < 94, e.periodMin);
  assert.ok(e.perigeeKm > 380 && e.apogeeKm < 460, `${e.perigeeKm} ${e.apogeeKm}`);
  assert.ok(Number.isFinite(e.epochMs) && new Date(e.epochMs).getUTCFullYear() === 2024);
  const g = M.elementsOf(GOES16);
  assert.ok(g.periodMin > 1430 && g.periodMin < 1440, g.periodMin);
  assert.equal(M.orbitClass(g.perigeeKm, g.incDeg, g.periodMin).code, 'GEO');
  assert.equal(M.orbitClass(e.perigeeKm, e.incDeg, e.periodMin).code, 'LEO');
});

ok('geodeticAt — 위치는 시각의 함수(같은 요소, 다른 시각 → 다른 자리)', () => {
  const t0 = new Date(M.epochMsOf(ISS));
  const a = M.geodeticAt(ISS, t0);
  const b = M.geodeticAt(ISS, new Date(t0.getTime() + 10 * 60_000));
  assert.ok(a && b);
  assert.ok(Math.abs(a.lat) <= 51.7 && Math.abs(b.lat) <= 51.7);
  assert.ok(a.altKm > 380 && a.altKm < 460, a.altKm);
  assert.ok(a.velKmS > 7.5 && a.velKmS < 7.8, a.velKmS);
  assert.ok(Math.hypot(a.lat - b.lat, a.lon - b.lon) > 5, '10분이면 수십 도 움직인다');
  assert.equal(a.ecef.length, 3);
});

ok('trackSamples — 과거는 음수 분, 표본 수 = steps+1', () => {
  const t0 = M.epochMsOf(ISS);
  const past = M.trackSamples(ISS, t0, -30, 12);
  const next = M.trackSamples(ISS, t0, 93, 60);
  assert.equal(past.length, 13); assert.equal(next.length, 61);
  assert.ok(past[0].t === t0 && past[12].t < t0);
  assert.ok(next[60].t - t0 === 93 * 60_000);
});

ok('nearby — 자기 자신·같은 NORAD 제외, 반경 밖 제외, 요소 없는 후보는 skipped', () => {
  const t0 = M.epochMsOf(ISS);
  const iss = M.fromSat({ name: 'ISS (ZARYA)', rec: ISS, noradId: 25544, objectId: '1998-067A', group: 'stations' }, 0, null);
  const issDup = M.fromAetherus({ catalogId: '25544', name: 'ISS (ZARYA)', satrec: ISS, epochMs: t0 }, {});
  const geo = M.fromSat({ name: 'GOES 16', rec: GOES16, noradId: 41866 }, 1, null);
  const deb = M.fromSat({ name: 'COSMOS 2251 DEB', rec: DEB, noradId: 34427 }, 2, null);
  const noRec = M.fromAetherus({ catalogId: '9', name: 'STATE ONLY', satrec: null, r: [7000, 0, 0], v: [0, 7.5, 0], sampleMs: t0 }, {});
  const r = M.nearby(iss, [iss, issDup, geo, deb, noRec], t0, 100000, 10);
  assert.equal(r.skipped, 1);
  assert.equal(r.computed, 2);
  assert.ok(!r.rows.some(x => x.obj.id === 'aeth:25544'), '같은 NORAD 는 다른 출처라도 제외');
  const geoRow = r.rows.find(x => x.obj.id === 'sat:41866');
  assert.ok(geoRow && geoRow.distKm > 30000, 'GEO 는 3만 km 이상 떨어져 있다');
  assert.ok(['approaching', 'receding', 'steady'].includes(geoRow.trend));
  const tight = M.nearby(iss, [geo, deb], t0, 500, 10);
  assert.ok(!tight.rows.some(x => x.obj.id === 'sat:41866'), '반경 500km 밖은 나오지 않는다');
});

ok('closestApproach — 같은 요소끼리는 거리 0, 서로 다른 궤도는 양수', () => {
  const t0 = M.epochMsOf(ISS);
  const self = M.closestApproach(ISS, ISS, t0, 30, 30);
  assert.ok(self && self.missKm < 1e-6);
  const x = M.closestApproach(ISS, DEB, t0, 90, 30);
  assert.ok(x && x.missKm > 0 && x.tcaMs >= t0 && x.tcaMs <= t0 + 90 * 60_000 + 30_000);
});

ok('launchStatus — LL2 문구를 지시서 어휘로, 모르면 UNKNOWN', () => {
  assert.equal(M.launchStatus('Go for Launch'), 'SCHEDULED');
  assert.equal(M.launchStatus('To Be Determined'), 'SCHEDULED');
  assert.equal(M.launchStatus('Launch Successful'), 'SUCCESS');
  assert.equal(M.launchStatus('Launch Failure'), 'FAILED');
  assert.equal(M.launchStatus('Launch was a Partial Failure'), 'PARTIAL FAILURE');
  assert.equal(M.launchStatus('Launch in Flight'), 'IN FLIGHT');
  assert.equal(M.launchStatus('On Hold'), 'HOLD');
  assert.equal(M.launchStatus(''), 'UNKNOWN');
  assert.equal(M.launchStatus('Something odd'), 'UNKNOWN');
});

ok('closeApproaches — 서버 사건만, TCA 순, PC 는 서버 값 그대로', () => {
  const now = 1_000_000;
  const rows = M.closeApproaches([
    { a: '1', b: '2', aName: 'A', bName: 'B', tca: 'x', tcaMs: now + 7200_000, missM: 18400, pcStatus: 'NOT_COMPUTED' },
    { a: '3', b: '1', aName: 'C', bName: 'A', tca: 'y', tcaMs: now + 600_000, missM: 900 },
  ], now, '1');
  assert.equal(rows.length, 2);
  assert.equal(rows[0].b.catalogId, '1');
  assert.ok(Math.abs(rows[0].missKm - 0.9) < 1e-9 && rows[0].timeToTcaMin === 10);
  assert.equal(rows[1].pcStatus, 'NOT_COMPUTED');
  assert.equal(rows[0].status, 'MONITORING');
  assert.equal(M.closeApproaches([{ a: '5', b: '6', tcaMs: now }], now, '1').length, 0);
});

ok('missionTimeline — 자료 없는 단계는 known=false, 만들어 넣지 않는다', () => {
  const iss = M.fromSat({ name: 'ISS (ZARYA)', rec: ISS, noradId: 25544, launchDate: '1998-11-20', launchSite: 'TTMTR', opsKo: '운용 중' }, 0, '2026-09-06T00:00:00Z');
  const tl = M.missionTimeline(iss, { closeApproaches: [] });
  const byKey = Object.fromEntries(tl.map(s => [s.key, s]));
  assert.equal(byKey.LAUNCH.known, true);
  assert.equal(byKey['STAGE SEPARATION'].known, false);
  assert.equal(byKey['ORBIT INSERTION'].known, false);
  assert.equal(byKey['FINAL ORBIT'].known, true);
  assert.equal(byKey['CLOSE APPROACHES'].known, false);
  assert.equal(byKey['CURRENT STATUS'].note, '운용 중');
  const ev = M.launchEventTimeline({ meta: { net: '2026-09-08T03:15:00Z' } });
  assert.ok(ev.known.length === 1 && ev.mock.every(x => x.mock === true));
});

ok('passesOver — 관측자 위 통과창은 시작<끝, 최대고도≥10°', () => {
  const t0 = M.epochMsOf(ISS);
  const p = M.passesOver(ISS, { lat: 36.35, lon: 127.38 }, t0, 24, 10, 30);
  assert.ok(p.length >= 1 && p.length <= 8, `passes=${p.length}`);
  for (const x of p) { assert.ok(x.endMs > x.startMs); assert.ok(x.maxEl >= 10); }
});

ok('kpis — 받은 자료가 없으면 null(장식 숫자 금지)', () => {
  const k = M.kpis({ sats: [], aeth: [], launches: [] });
  assert.equal(k.active.value, null); assert.equal(k.launches.value, null); assert.equal(k.rocketDebris.value, null);
  const iss = M.fromSat({ name: 'ISS (ZARYA)', rec: ISS, noradId: 25544 }, 0, null);
  const rb = M.fromAetherus({ catalogId: '7', name: 'CZ-3B R/B', satrec: DEB }, {});
  const l = M.fromLaunch({ id: 'a', name: 'Starlink', lat: 0, lon: 0, data: { _hoursOut: 3, _net: '2026-09-08T03:15:00Z' } });
  const k2 = M.kpis({ sats: [iss], aeth: [rb], launches: [l], conjunctions: 2, catalogTotal: 16123 });
  assert.equal(k2.active.value, 1); assert.equal(k2.rocketDebris.value, 1); assert.equal(k2.launches.value, 1);
  assert.equal(k2.events.value, 2); assert.equal(k2.tracked.value, 16123);
});

ok('search — 종류별로 나뉘고 날짜는 ARCHIVE 시각으로', () => {
  const iss = M.fromSat({ name: 'ISS (ZARYA)', rec: ISS, noradId: 25544 }, 0, null);
  const deb = M.fromSat({ name: 'COSMOS 2251 DEB', rec: DEB, noradId: 34427 }, 1, null);
  const l = M.fromLaunch({ id: 'a', name: 'Starlink Group 15-24', lat: 0, lon: 0, data: {} });
  const ctx = { sats: [iss, deb], aeth: [], launches: [l], closeApproaches: [] };
  assert.equal(M.search('cosmos', ctx).debris.length, 1);
  assert.equal(M.search('cosmos', ctx).satellites.length, 0);
  assert.equal(M.search('25544', ctx).satellites[0].id, 'sat:25544');
  assert.equal(M.search('starlink', ctx).launches.length, 1);
  assert.equal(M.search('2026-09-06', ctx).dates.length, 1);
});

ok('snapshots — 14분 안 중복 기록 안 함, 96개 상한', () => {
  const mem = new Map();
  const storage = { getItem: k => mem.get(k) ?? null, setItem: (k, v) => mem.set(k, v) };
  assert.equal(M.recordSnapshot(storage, { at: 0, kpi: {} }), true);
  assert.equal(M.recordSnapshot(storage, { at: 60_000, kpi: {} }), false);
  for (let i = 1; i <= 120; i++) M.recordSnapshot(storage, { at: i * 15 * 60_000, kpi: {} });
  assert.equal(M.readSnapshots(storage).length, M.SNAPSHOT_MAX);
});

ok('fmt — KST 표기·T+ 표기', () => {
  assert.equal(M.fmtKst(Date.UTC(2026, 8, 6, 5, 32)), '2026-09-06 14:32 KST');
  assert.equal(M.fmtTPlus(134), 'T+02:14');
  assert.equal(M.fmtTPlus(3725), 'T+01:02:05');
  assert.equal(M.fmtLatLon(36.4, 127.1), '36.4° N · 127.1° E');
});

console.log(`\n${n} checks passed`);
