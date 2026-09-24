// globe2d.js — 정사영 수식 · 합성(구름 자료 밖은 그리지 않는다) · 밤 덮개 · 합성 열쇠
import test from 'node:test';
import assert from 'node:assert/strict';
import { orthoInverse, orthoForward, renderComposite, renderNight, nightAlpha, compositeKey, CENTER_LAT_DEG, NIGHT_MAX_ALPHA } from '../globe2d.js';

const near = (a, b, eps, msg) => assert.ok(Math.abs(a - b) <= eps, `${msg || ''} ${a} vs ${b} (±${eps})`);
const wrap = (d) => ((d + 540) % 360) - 180;

test('원반 중심 = (20°N, 중심 경도)', () => {
  const p = orthoInverse(0, 0, CENTER_LAT_DEG, 126.9658);
  near(p.lat, 20, 1e-9); near(p.lon, 126.9658, 1e-9);
  assert.equal(orthoInverse(0.8, 0.8, 20, 0), null, '원반 밖');
});

test('정사영 앞·뒤 변환이 서로 되돌린다 · 지구 반대편은 보이지 않는다', () => {
  let seed = 7;
  const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
  for (let i = 0; i < 500; i++) {
    const x = rnd() * 2 - 1, y = rnd() * 2 - 1;
    if (x * x + y * y > 0.999) continue;
    const lon0 = rnd() * 360 - 180;
    const g = orthoInverse(x, y, 20, lon0);
    const f = orthoForward(g.lat, g.lon, 20, lon0);
    near(f.x, x, 1e-9); near(f.y, y, 1e-9);
    assert.equal(f.visible, true);
  }
  assert.equal(orthoForward(-20, 127 - 180, 20, 127).visible, false);
  // 북쪽이 위: 원반 위쪽 점의 위도가 중심보다 높다
  assert.ok(orthoInverse(0, 0.5, 20, 0).lat > 20);
  // 동쪽이 오른쪽
  assert.ok(wrap(orthoInverse(0.5, 0, 20, 0).lon) > 0);
});

// 가로 = 경도 색(빨강), 세로 = 위도 색(초록)인 가짜 바탕
function fakeBase(W, H) {
  const d = new Uint8ClampedArray(W * H * 4);
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    const o = (y * W + x) * 4; d[o] = (x / W) * 255; d[o + 1] = (y / H) * 255; d[o + 2] = 40; d[o + 3] = 255;
  }
  return { data: d, width: W, height: H };
}
function solidCloud(W, H, north, south) {
  const d = new Uint8ClampedArray(W * H * 4).fill(255);
  return { data: d, width: W, height: H, north, south };
}

test('합성: 원반 밖은 투명 · 중심 화소는 중심 위경도의 바탕 색', () => {
  const size = 64;
  const base = fakeBase(360, 180);
  const px = renderComposite(base, null, { lon0: 0, size });
  assert.equal(px[3], 0, '모서리는 원반 밖 → 투명');
  const c = ((size / 2) * size + size / 2) * 4;
  assert.equal(px[c + 3], 255);
  // 중심 부근 위도 20°N → 바탕의 y ≈ (90-20)/180 → 초록 ≈ 99, 가장자리 어둡게(limb ≤ 1) 반영
  assert.ok(px[c + 1] > 80 && px[c + 1] <= 101, `초록 ${px[c + 1]}`);
});

test('합성: 구름 자료 범위(north/south) 밖에는 구름을 그리지 않는다 — 지어내지 않는다', () => {
  const size = 128;
  const black = { data: new Uint8ClampedArray(360 * 180 * 4).map((_, i) => (i % 4 === 3 ? 255 : 0)), width: 360, height: 180 };
  const cloud = solidCloud(64, 32, 72.715, -72.737);
  const px = renderComposite(black, cloud, { lon0: 0, size });
  const at = (x, y) => px[(y * size + x) * 4];
  // 중심(20°N) — 흰 구름
  assert.ok(at(size / 2, size / 2) > 200, `중심 ${at(size / 2, size / 2)}`);
  // 원반 맨 위 근처(북극 너머, 위도 > 73°) — 구름 없음(바탕 검정)
  let y = 2; while (px[(y * size + size / 2) * 4 + 3] < 255) y++;
  const g = orthoInverse(0, (size / 2 - (y + 0.5)) / (size / 2), 20, 0);
  assert.ok(g.lat > 72.8, `시험 화소 위도 ${g.lat}`);
  assert.equal(at(size / 2, y), 0, '자료가 없는 고위도는 비워 둔다');
});

test('밤 덮개: 태양 직하점 쪽은 0, 반대편은 최대 · 경계는 부드럽다', () => {
  const sun = { latRad: 0, lonRad: 0 };
  const day = renderNight({ lon0: 0, lat0: 0, sun, size: 32 });
  const night = renderNight({ lon0: 180, lat0: 0, sun, size: 32 });
  const c = (16 * 32 + 16) * 4 + 3;
  assert.equal(day[c], 0);
  near(night[c], Math.round(255 * NIGHT_MAX_ALPHA), 1);
  assert.equal(nightAlpha(5), 0);
  assert.equal(nightAlpha(-10), NIGHT_MAX_ALPHA);
  let prev = -1;
  for (let h = 3; h >= -9; h -= 0.5) { const a = nightAlpha(h); assert.ok(a >= prev); prev = a; }
});

test('합성 열쇠: 구름 시각·중심 경도가 바뀔 때만 달라진다', () => {
  const a = compositeKey('2026-09-24T06:00:00Z', 126.9658);
  assert.equal(a, compositeKey('2026-09-24T06:00:00Z', 126.9658));
  assert.notEqual(a, compositeKey('2026-09-24T07:00:00Z', 126.9658));
  assert.notEqual(a, compositeKey('2026-09-24T06:00:00Z', 129.032));
  assert.notEqual(a, compositeKey(null, 126.9658));
});
