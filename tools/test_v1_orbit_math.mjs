// v1 발사 궤적 계산 — 경사각을 어디서 얻는가, 지상 궤적이 물리와 맞는가 (2026-09-06)
import test from 'node:test';
import assert from 'node:assert/strict';
if (!globalThis.localStorage) globalThis.localStorage = { getItem: () => null, setItem() {}, removeItem() {} };
try { Object.defineProperty(globalThis, 'navigator', { value: { languages: ['ko'], language: 'ko' }, configurable: true }); } catch { /* 있음 */ }
if (!globalThis.document) globalThis.document = { documentElement: { lang: 'ko' }, querySelectorAll: () => [], addEventListener() {} };
if (!globalThis.location) globalThis.location = { search: '', hostname: 'localhost', href: 'http://localhost/' };
const { inclinationFor, azimuthFor, groundTrack, segments, periodSec, RE } = await import('../prototype/js/layers/orbit-math.js');

const L = (over = {}) => ({ name: 'Rocket', lat: 28.6, lon: -80.6, data: {}, ...over });

test('정거장 발사는 알려진 고정 경사각을 쓴다 (근사가 아니다)', () => {
  const iss = inclinationFor(L({ name: 'Soyuz 2.1b', lat: 45.9, data: { _mission: 'Progress MS-35', _missionType: 'Resupply', _orbitAbbrev: 'LEO' } }));
  assert.equal(iss.inc, 51.6); assert.equal(iss.exact, true); assert.match(iss.why, /국제우주정거장/);
  const cn = inclinationFor(L({ name: 'Long March 7', data: { _mission: 'Tianzhou 10', _missionType: 'Resupply' } }));
  assert.equal(cn.inc, 41.5); assert.match(cn.why, /톈궁/);
});

test('태양동기·극궤도는 그 궤도의 실제 값 범위에서 잡는다', () => {
  assert.equal(inclinationFor(L({ data: { _orbitAbbrev: 'SSO' } })).inc, 97.8);
  assert.equal(inclinationFor(L({ data: { _orbitAbbrev: 'PO' } })).inc, 90);
});

test('정지천이(GTO·GEO)는 그리지 않고 이유를 남긴다 — 원궤도 지상궤적이 뜻을 잃는다', () => {
  for (const ab of ['GTO', 'GEO', 'GSO']) {
    const r = inclinationFor(L({ data: { _orbitAbbrev: ab } }));
    assert.equal(r.skip, true); assert.match(r.why, /전이|elliptical/);
  }
});

test('그 밖은 발사대 위도 = 직접 발사로 갈 수 있는 최소 경사각, 그렇게 적는다', () => {
  const r = inclinationFor(L({ lat: 34.632, data: { _orbitAbbrev: 'LEO' } }));
  assert.equal(r.inc, 34.632); assert.equal(r.minimum, true); assert.match(r.why, /가장 낮은/);
  assert.equal(inclinationFor(L({ data: { _orbitAbbrev: 'MEO' } })).alt, 8000);
  assert.equal(inclinationFor({ name: 'x', data: {} }), null);          // 위도 없으면 계산하지 않는다
});

test('발사 방위각 — 바이코누르에서 ISS 로 가면 약 63°(실제 발사와 같은 방향)', () => {
  const az = azimuthFor(51.6, 45.9);
  assert.ok(Math.abs(az - 63) < 2, `az=${az}`);
  assert.equal(azimuthFor(30, 45), null);                               // 위도보다 낮은 경사각은 불가능
  assert.ok(Math.abs(azimuthFor(90, 34.6) - 0) < 1e-6);                 // 극궤도는 정북
});

test('궤도 주기가 케플러 법칙과 맞는다 (420 km ≈ 93분, 지상 궤적 시작점은 발사대)', () => {
  assert.ok(Math.abs(periodSec(420) / 60 - 92.8) < 0.5);
  assert.ok(Math.abs(periodSec(35786) / 3600 - 23.93) < 0.1);           // 정지궤도 = 항성일
  const { pts } = groundTrack(45.9, 63.3, 51.6, 420);
  assert.ok(Math.abs(pts[0][0] - 63.3) < 0.01 && Math.abs(pts[0][1] - 45.9) < 0.01);
});

test('지상 궤적이 경사각을 넘지 않고, 지구 자전만큼 서쪽으로 밀린다', () => {
  const { pts, T } = groundTrack(28.6, -80.6, 51.6, 500, 1, 30);
  const maxLat = Math.max(...pts.map(p => Math.abs(p[1])));
  assert.ok(maxLat <= 51.6 + 0.2 && maxLat > 50, `maxLat=${maxLat}`);
  // 한 바퀴 뒤 같은 위도로 돌아오되 경도는 지구가 돈 만큼(약 23°) 서쪽
  const last = pts[pts.length - 1];
  assert.ok(Math.abs(last[1] - 28.6) < 1, `lat back=${last[1]}`);
  let drift = last[0] - (-80.6); if (drift > 180) drift -= 360; if (drift < -180) drift += 360;
  const expect = -(360 / 86164.0905) * T;
  assert.ok(Math.abs(drift - expect) < 1.5, `drift=${drift} expect=${expect}`);
});

test('극궤도는 남북으로 지나고, 날짜변경선에서 선을 끊는다', () => {
  const { pts } = groundTrack(34.6, -120.6, 97.8, 700, 1, 30);
  assert.ok(Math.max(...pts.map(p => p[1])) > 80 && Math.min(...pts.map(p => p[1])) < -80);
  const segs = segments(pts);
  assert.ok(segs.length >= 2, `segments=${segs.length}`);
  segs.forEach(seg => seg.forEach((p, k) => { if (k) assert.ok(Math.abs(p[0] - seg[k - 1][0]) <= 180); }));
});

test('발사대 위도가 경사각보다 높아도 터지지 않는다 (경계로 잡는다)', () => {
  const { pts } = groundTrack(60, 20, 45, 500, 0.5, 60);
  assert.ok(pts.length > 5 && pts.every(p => Number.isFinite(p[0]) && Number.isFinite(p[1])));
});
