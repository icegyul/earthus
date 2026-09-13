import test from 'node:test';
import assert from 'node:assert/strict';
import { llToVec, vecToLL, wrapLon, clampLat, haversineKm, equirect, shortestLonDelta } from '../packages/globe-engine/src/geo.mjs';
import { OrbitCamera, targetDiameter, distanceForDiameter, diameterAtDistance, zoomDistances, ZOOM_STEPS, MAX_RATE_DEG_S, MIN_DIST } from '../packages/globe-engine/src/camera.mjs';
import { REGIONS, regionAt } from '../packages/globe-engine/src/regions.mjs';

const near = (a, b, eps = 1e-9) => Math.abs(a - b) <= eps;

test('geo: 좌표식 하나 — 북극 +y, 경도 0 = +x, 동경 = −z (ARCHITECTURE_LOCK §4)', () => {
  const o = llToVec(0, 0); assert.ok(near(o.x, 1) && near(o.y, 0) && near(o.z, 0));
  const n = llToVec(90, 0); assert.ok(near(n.y, 1));
  const e = llToVec(0, 90); assert.ok(near(e.z, -1) && near(e.x, 0, 1e-12));
  const w = llToVec(0, -90); assert.ok(near(w.z, 1));
  const s = llToVec(-45, 180, 2); assert.ok(near(Math.hypot(s.x, s.y, s.z), 2));
});

test('geo: llToVec ↔ vecToLL 왕복 오차 < 1e-9 (200점)', () => {
  let seed = 42; const rnd = () => (seed = (seed * 1664525 + 1013904223) >>> 0) / 4294967296;
  for (let i = 0; i < 200; i++) {
    const lat = rnd() * 178 - 89, lon = rnd() * 360 - 180;
    const r = vecToLL(llToVec(lat, lon, 1 + rnd() * 3));
    assert.ok(near(r.lat, lat, 1e-9) && near(wrapLon(r.lon - lon), 0, 1e-9), `${lat},${lon} → ${r.lat},${r.lon}`);
  }
});

test('geo: wrapLon · clampLat · shortestLonDelta · equirect', () => {
  assert.equal(wrapLon(190), -170); assert.equal(wrapLon(-190), 170); assert.equal(wrapLon(180), 180); assert.equal(wrapLon(-180), 180); assert.equal(wrapLon(540), 180);
  assert.equal(clampLat(95), 85); assert.equal(clampLat(-95), -85); assert.equal(clampLat(10), 10);
  assert.equal(shortestLonDelta(170, -170), 20); assert.equal(shortestLonDelta(-170, 170), -20);
  assert.deepEqual(equirect(90, -180, 2048, 1024), { x: 0, y: 0 });
  assert.deepEqual(equirect(0, 0, 2048, 1024), { x: 1024, y: 512 });
  assert.ok(Math.abs(haversineKm(37.57, 126.98, 35.18, 129.08) - 325) < 10, '서울–부산');
  assert.ok(Math.abs(haversineKm(0, 0, 0, 180) - 20015) < 5, '반바퀴');
});

test('camera: 지구 목표 지름 720/660/580/350 (§2.2), 화면보다 크면 캡', () => {
  assert.equal(targetDiameter(1440, 900), 720);
  assert.equal(targetDiameter(1024, 768), 660);
  assert.equal(targetDiameter(768, 1024), 580);
  assert.equal(targetDiameter(375, 812), 350);
  assert.equal(targetDiameter(390, 844), 350);
  assert.ok(targetDiameter(800, 600) < 580 && targetDiameter(800, 600) <= 0.94 * 600, '800×600 은 높이에 캡');
});

test('camera: distanceForDiameter ↔ diameterAtDistance 왕복, 최소 거리 보장', () => {
  for (const [D, H] of [[720, 900], [660, 768], [350, 812], [1200, 800]]) {
    const d = distanceForDiameter(D, H);
    assert.ok(d >= MIN_DIST, `${D}/${H}: d=${d}`);
    if (d > MIN_DIST) assert.ok(Math.abs(diameterAtDistance(d, H) - D) < 0.01, `${D}/${H} → ${diameterAtDistance(d, H)}`);
  }
  const zd = zoomDistances(1440, 900);
  assert.equal(zd.length, ZOOM_STEPS);
  assert.ok(zd[0] > zd[1] && zd[1] > zd[2], '가까울수록 거리 감소');
});

test('camera: 드래그 60°/s 상한, 극 ±85° 잠금, 줌 3단 잠금', () => {
  const c = new OrbitCamera({ lat: 0, lon: 0, viewW: 1440, viewH: 900 });
  c.beginDrag(); c.drag(100000, 0, 1 / 60); c.endDrag();
  assert.ok(Math.abs(c.lon) <= MAX_RATE_DEG_S / 60 + 1e-9, `한 프레임 회전 ${c.lon}°`);
  const d = new OrbitCamera({ lat: 0, lon: 0, viewW: 1440, viewH: 900 });
  d.beginDrag(); for (let i = 0; i < 2000; i++) d.drag(0, 300, 1 / 60); d.endDrag();
  assert.equal(d.lat, 85);
  const z = new OrbitCamera({ viewW: 1440, viewH: 900, reducedMotion: true });
  z.zoomOut(); assert.equal(z.step, 0);
  z.zoomIn(); z.zoomIn(); z.zoomIn(); assert.equal(z.step, ZOOM_STEPS - 1);
  assert.equal(z.dist, z.dists[ZOOM_STEPS - 1], '움직임 줄이기면 즉시 도착');
});

test('camera: 트윈은 0.9초 뒤 목표에 닿고, 관성은 감쇠해 멈춘다', () => {
  const c = new OrbitCamera({ lat: 0, lon: 0, viewW: 1440, viewH: 900 });
  c.setZoomStep(2, { lat: 35, lon: 115 });
  assert.ok(c.animating);
  for (let i = 0; i < 70; i++) c.tick(1 / 60);
  assert.ok(!c.tween, '트윈 종료');
  assert.ok(near(c.lat, 35, 1e-9) && near(c.lon, 115, 1e-9) && near(c.dist, c.dists[2], 1e-9));
  const t = new OrbitCamera({ lat: 0, lon: 170, viewW: 1440, viewH: 900 });
  t.setZoomStep(0, { lon: -170 });
  for (let i = 0; i < 70; i++) t.tick(1 / 60);
  assert.ok(near(t.lon, -170, 1e-9), '경도는 최단 방향으로(170 → −170 은 +20°)');
  const k = new OrbitCamera({ lat: 0, lon: 0, viewW: 1440, viewH: 900 });
  k.beginDrag(); k.drag(20, 0, 1 / 60); k.endDrag();
  assert.ok(k.vLon !== 0, '관성 시작');
  for (let i = 0; i < 600; i++) k.tick(1 / 60);
  assert.equal(k.vLon, 0); assert.equal(k.vLat, 0);
  assert.ok(!k.animating);
});

test('regions: Master Directive §3 지역 9개 + 보완 3, 대표 도시 판정', () => {
  const directive = REGIONS.filter(r => r.directive).map(r => r.nameEn).sort();
  assert.deepEqual(directive, ['East Asia', 'Europe', 'North Africa', 'North America', 'Oceania', 'Polar', 'South America', 'South Asia', 'Southeast Asia']);
  assert.equal(REGIONS.length, 12);
  const cases = [
    [37.57, 126.98, 'east-asia', '서울'], [35.68, 139.69, 'east-asia', '도쿄'], [48.86, 2.35, 'europe', '파리'], [30.04, 31.24, 'north-africa', '카이로'],
    [28.61, 77.21, 'south-asia', '델리'], [27.99, 86.93, 'south-asia', '에베레스트'], [-6.2, 106.85, 'southeast-asia', '자카르타'], [-8.6, 115.26, 'southeast-asia', '발리'],
    [40.71, -74.01, 'north-america', '뉴욕'], [19.43, -99.13, 'north-america', '멕시코시티'], [-12.05, -77.04, 'south-america', '리마'], [-23.55, -46.63, 'south-america', '상파울루'],
    [-33.87, 151.21, 'oceania', '시드니'], [-25.34, 131.04, 'oceania', '울루루'], [-77.85, 166.67, 'polar', '맥머도'], [78.22, 15.65, 'polar', '롱이어비엔'],
    [-1.29, 36.82, 'africa', '나이로비'], [35.69, 51.39, 'middle-east', '테헤란'], [55.03, 82.92, 'siberia', '노보시비르스크'],
  ];
  for (const [lat, lon, id, name] of cases) assert.equal(regionAt(lat, lon)?.region.id, id, name);
  assert.equal(regionAt(0, -150), null, '태평양 한가운데');
  assert.equal(regionAt(21.3, -157.8), null, '호놀룰루 — 아직 지역 없음');
  assert.equal(regionAt(84, 120)?.center.lat, 85, '북극은 북쪽 중심');
  assert.equal(regionAt(-70, 60)?.center.lat, -80, '남극은 남쪽 중심');
});
