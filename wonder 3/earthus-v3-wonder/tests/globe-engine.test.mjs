import test from 'node:test';
import assert from 'node:assert/strict';
import { llToVec, vecToLL, wrapLon, clampLat, haversineKm, equirect, shortestLonDelta } from '../packages/globe-engine/src/geo.mjs';
import { OrbitCamera, targetDiameter, distanceForDiameter, diameterAtDistance, zoomDistances, dragSpeedRad, ZOOM_STEPS, PITCH_LIMIT_DEG, DAMP_FOLLOW, MIN_DIST } from '../packages/globe-engine/src/camera.mjs';
import { REGIONS, regionAt, regionFocus } from '../packages/globe-engine/src/regions.mjs';

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

test('camera(V2 규칙): 드래그 1px = 손가락 아래 지점 1px — dragSpeed = 2·tan(fov/2)·(dist−1)/H, 상한 없음 (1440·1024·390·375)', () => {
  for (const [w, h] of [[1440, 900], [1024, 768], [390, 844], [375, 812]]) {
    const c = new OrbitCamera({ lat: 0, lon: 0, viewW: w, viewH: h });
    const expectDeg = 2 * Math.tan(20 * Math.PI / 180) * (c.dists[0] - 1) / h * 180 / Math.PI;   // V2 dragSpeed (fov 40)
    assert.ok(near(c.degPerPx(), expectDeg, 1e-12), `${w}×${h} degPerPx ${c.degPerPx()} ≠ ${expectDeg}`);
    assert.ok(near(dragSpeedRad(c.dists[0], h) * 180 / Math.PI, expectDeg, 1e-12));
    c.beginDrag(); c.drag(100000, 0); c.endDrag();
    assert.ok(near(c.targetLon, -100000 * expectDeg, 1e-6), '상한 없음: 목표는 입력 그대로 (60°/s 캡 없음)');
    for (let i = 0; i < 600; i++) c.tick(1 / 60);
    assert.ok(near(c.lon, c.targetLon, 1e-3) && !c.animating, '따라가기 수렴, 속도 관성 없음');
  }
  // 줌인(3단)일수록 지표가 가까워 느리다 — V2 altR 규칙
  const z = new OrbitCamera({ viewW: 1440, viewH: 900, reducedMotion: true }); const k0 = z.degPerPx(); z.zoomIn(); z.zoomIn();
  assert.ok(z.degPerPx() < k0 * 0.5, `줌인 속도 ${z.degPerPx()} < 세계 ${k0}/2`);
});

test('camera(V2 규칙): 따라가기 k = 1−exp(−dt·8) — 첫 프레임 12.5%, 0.5초 뒤 98%, 넘침 없음, 드래그 중엔 붙이지 않는다', () => {
  const c = new OrbitCamera({ lat: 0, lon: 0, viewW: 375, viewH: 812 });
  c.beginDrag(); c.drag(-100, 0); const goal = c.targetLon;
  c.tick(1 / 60);
  assert.ok(near(c.lon, goal * (1 - Math.exp(-DAMP_FOLLOW / 60)), 1e-9), '첫 프레임 12.5%');
  assert.ok(c.animating && c.dragging);
  for (let i = 0; i < 29; i++) c.tick(1 / 60);
  assert.ok(c.lon / goal > 0.98 && c.lon / goal <= 1, `0.5초 뒤 ${(c.lon / goal * 100).toFixed(1)}% (넘침 없음)`);
  c.endDrag(); for (let i = 0; i < 120; i++) c.tick(1 / 60);
  assert.equal(c.lon, goal, '손을 떼면 1e-3° 안에서 목표에 붙는다'); assert.ok(!c.animating);
  const r = new OrbitCamera({ lat: 0, lon: 0, viewW: 375, viewH: 812, reducedMotion: true });
  r.beginDrag(); r.drag(-100, 0); r.tick(1 / 60); assert.equal(r.lon, r.targetLon, '움직임 줄이기: 즉시');
});

test('camera(V2 규칙): 극 한계 ±87.135° — 극에서 가로 드래그는 경도를 바꾸고, 반대로 끌면 돌아온다(잠김 없음)', () => {
  assert.ok(near(PITCH_LIMIT_DEG, (Math.PI / 2 - 0.05) * 180 / Math.PI, 1e-12) && near(PITCH_LIMIT_DEG, 87.135, 0.001));
  for (const sign of [1, -1]) {
    const c = new OrbitCamera({ lat: 0, lon: 0, viewW: 375, viewH: 812 });
    c.beginDrag(); for (let i = 0; i < 400; i++) c.drag(0, sign * 30);            // 12,000px 세로로
    assert.ok(near(c.targetLat, sign * PITCH_LIMIT_DEG, 1e-9), `${sign > 0 ? '북' : '남'}극 한계`);
    for (let i = 0; i < 120; i++) c.tick(1 / 60);
    assert.ok(near(c.lat, sign * PITCH_LIMIT_DEG, 1e-2), '한계까지 따라감');
    const lon0 = c.targetLon; c.drag(50, 0);
    assert.ok(c.targetLon < lon0, '극에서도 가로 드래그가 경도를 바꾼다');
    const back = (PITCH_LIMIT_DEG - 30) / c.degPerPx();                                 // 반대로: 위도 30° 까지 돌아올 만큼(px)
    for (let i = 0; i < 100; i++) c.drag(0, -sign * back / 100);
    c.endDrag();
    assert.ok(near(c.targetLat, sign * 30, 1e-6), `반대로 끌면 돌아온다 (${c.targetLat.toFixed(1)}°)`);
    for (let i = 0; i < 300; i++) c.tick(1 / 60);
    assert.ok(near(c.lat, c.targetLat, 1e-3) && !c.animating);
    assert.ok(c.pose().lon >= -180 && c.pose().lon < 180, 'pose 경도는 접힌다');
  }
});

test('camera: 줌 3단 잠금 · 트윈 0.9초 도착 · 최단 경도 · 트윈 중 드래그하면 줌은 마저 가고 회전은 손이 가진다', () => {
  const z = new OrbitCamera({ viewW: 1440, viewH: 900, reducedMotion: true });
  z.zoomOut(); assert.equal(z.step, 0);
  z.zoomIn(); z.zoomIn(); z.zoomIn(); assert.equal(z.step, ZOOM_STEPS - 1);
  assert.equal(z.dist, z.dists[ZOOM_STEPS - 1], '움직임 줄이기면 즉시 도착');
  const c = new OrbitCamera({ lat: 0, lon: 0, viewW: 1440, viewH: 900 });
  c.setZoomStep(2, { lat: 35, lon: 115 });
  assert.ok(c.animating);
  for (let i = 0; i < 70; i++) c.tick(1 / 60);
  assert.ok(!c.tween, '트윈 종료');
  assert.ok(near(c.lat, 35, 1e-9) && near(c.lon, 115, 1e-9) && near(c.dist, c.dists[2], 1e-9));
  assert.ok(near(c.targetLat, 35, 1e-9) && near(c.targetLon, 115, 1e-9), '트윈이 끝나면 목표 = 현재');
  const t = new OrbitCamera({ lat: 0, lon: 170, viewW: 1440, viewH: 900 });
  t.setZoomStep(0, { lon: -170 });
  for (let i = 0; i < 70; i++) t.tick(1 / 60);
  assert.ok(near(t.pose().lon, -170, 1e-9) && near(t.lon, 190, 1e-9), '경도는 최단 방향으로(170 → −170 은 +20°)');
  const d = new OrbitCamera({ lat: 0, lon: 0, viewW: 1440, viewH: 900 });
  d.zoomIn(); for (let i = 0; i < 10; i++) d.tick(1 / 60);
  d.beginDrag(); assert.ok(!d.tween && near(d.targetDist, d.dists[1], 1e-12), '트윈 취소, 줌 목표는 유지');
  d.drag(-40, 0); d.endDrag(); for (let i = 0; i < 300; i++) d.tick(1 / 60);
  assert.ok(near(d.dist, d.dists[1], 1e-4) && d.step === 1 && d.lon > 0, '줌은 따라가기로 마저 도착, 회전도 반영');
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

test('regions: 지역 진입 포커스는 손가락이 닿은 자리 — 한국을 누르면 한국(동아시아 중심 35°N 115°E 가 아니다)', () => {
  const seoul = regionAt(37.57, 126.98);
  assert.equal(seoul.region.id, 'east-asia');
  assert.deepEqual(regionFocus(seoul), { lat: 37.57, lon: 126.98 });
  assert.deepEqual([seoul.center.lat, seoul.center.lon], [35, 115], '지역 중심은 그대로 남아 있다(라벨·거리용)');
  const polar = regionAt(84, 120);
  assert.deepEqual(regionFocus(polar), { lat: 84, lon: 120 }, '극지방도 누른 자리');
  assert.deepEqual(regionFocus({ center: { lat: 5, lon: 110 } }), { lat: 5, lon: 110 }, '좌표 없는 옛 hit 만 중심');
});
