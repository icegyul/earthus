// DEV-DIRECTIVE 2026-09-20 · W1 기압 줄("4 hPa 등압선 + H/L 기호") — prototype/v2-three/js/pressure-centers.js 의 결과 시험.
//
// "H/L 이 나온다"만 시험하면 아무 극값이나 찍는 코드가 통과한다. 여기서는 **어디에 · 몇 hPa 로 · 몇 개가** 나오는지를 잰다:
//   제자리에(≤ 0.5°) · 눈금값 그대로 · 8bit 고원에서 하나만 · ±180° 에서 하나만 · 극에서 한 점으로 · 닫힌 등압선이 없는 것은 버리고 ·
//   좁고 깊은 태풍은 살리고 · 동서로 긴 아열대 고기압도 살린다(고리로 재면 사라지는 것 — 모듈 머리 주석의 '지시와 다른 점').
// 합성 장은 운영 매니페스트 fields.mslp 와 같은 모양이다: 720×361 · 행 0 = 90N · 열 0 = 180W · 회색 1채널.
import test from 'node:test';
import assert from 'node:assert/strict';

import {
  CENTER_MATCH_DEG_PER_HOUR,
  CENTER_MATCH_MAX_DEG,
  CENTER_MATCH_HPA_PER_HOUR,
  CENTER_MATCH_MAX_DHPA,
  CENTER_MAX_PER_KIND,
  CENTER_MIN_SEPARATION_DEG,
  ELEVATION_KNOWN_MIN_RATIO,
  HIGH_TERRAIN_M,
  PRESSURE_PROMINENCE_HPA,
  buildHighTerrainMask,
  findPressureCenters,
  formatCenter,
  greatCircleDeg,
  lerpCenter,
  matchCenters,
} from '../../prototype/v2-three/js/pressure-centers.js';

const W = 720;
const H = 361;
const D2R = Math.PI / 180;
// aws/gfs-cloud-forecast/handler.py MSLP_LO_HPA · MSLP_STEP_HPA — 지금 운영(2026-09-20)과 그 앞 런의 눈금.
// 모듈은 어느 쪽도 모른다(상수를 박지 않는다) — 시험이 둘 다 넣어 본다.
const NOW = Object.freeze({ scale: 1, offset: 870 });
const OLD = Object.freeze({ scale: 0.5, offset: 940 });
const byteOf = (dec) => (hPa) => Math.max(0, Math.min(255, Math.round((hPa - dec.offset) / dec.scale)));

/** fn(lat, lon) → hPa 를 8bit 프레임으로. grid0 을 주면 0°~360° 배치(열 0 = 경도 0). */
function fieldOf(fn, dec = NOW, lon0 = -180) {
  const enc = byteOf(dec);
  const data = new Uint8Array(W * H);
  for (let j = 0; j < H; j += 1) {
    for (let i = 0; i < W; i += 1) data[j * W + i] = enc(fn(90 - j * 0.5, lon0 + i * 0.5));
  }
  return { w: W, h: H, data };
}
/** 구면에서 등방인 가우시안(σ 는 대권 °). 멀면 셈하지 않는다 — 장 하나에 26만 칸이다. */
const bump = (lat, lon, c) => {
  if (Math.abs(lat - c.lat) > 6 * c.sigma) return 0;
  const d = greatCircleDeg(lat, lon, c.lat, c.lon);
  return c.amp * Math.exp(-0.5 * (d / c.sigma) ** 2);
};
/** 동서·남북 폭이 다른 가우시안(아열대 고기압용 · 국지 평면 근사). */
const oval = (lat, lon, c) => {
  let dl = lon - c.lon;
  dl -= Math.round(dl / 360) * 360;
  const x = (dl * Math.cos(c.lat * D2R)) / c.sx;
  const y = (lat - c.lat) / c.sy;
  return c.amp * Math.exp(-0.5 * (x * x + y * y));
};
// 2026-09-20 반박 검증 뒤: 모듈은 고지대 가림판(highMask · elevationAt) 없이는 중심을 찾지 않는다.
// 이 파일의 합성 장에는 지형이 없다 — 그 뜻을 **글자로 밝히고** 부른다. 가리는 규칙 자체는 '지형' 절의 시험들이 본다.
const centers = (f, dec, opts) => findPressureCenters(f, dec, { requireElevation: false, ...(opts || {}) });
const kindOf = (list, kind) => list.filter((c) => c.kind === kind);
const nearTo = (list, lat, lon, deg) => list.filter((c) => greatCircleDeg(c.lat, c.lon, lat, lon) <= deg);
const byteAt = (f, c) => f.data[c.row * f.w + c.col];
// 결정적 난수(wind-particles.test.mjs · ocean-land-mask.test.mjs 와 같은 LCG).
const lcg = (seed) => () => { seed = (seed * 1664525 + 1013904223) % 4294967296; return seed / 4294967296; };

// ------------------------------------------------------------------------------------------------ 위치와 값

test('가우시안 저기압 하나 → L 하나 · 제자리 · hPa 는 눈금값 그대로', () => {
  const f = fieldOf((lat, lon) => 1013 + bump(lat, lon, { lat: 35, lon: 135, sigma: 4, amp: -28 }));
  const lows = kindOf(centers(f, NOW), 'L');
  assert.equal(lows.length, 1);
  const c = lows[0];
  assert.ok(greatCircleDeg(c.lat, c.lon, 35, 135) <= 0.5, `위치 ${c.lat},${c.lon}`);
  assert.equal(c.row, 110);                       // (90 − 35) / 0.5
  assert.equal(c.col, 630);                       // (135 + 180) / 0.5
  assert.equal(c.hPa, 985);
  assert.equal(c.hPa, byteAt(f, c) * NOW.scale + NOW.offset, '그 칸의 바이트를 푼 값이다 — 이웃과 보간하지 않는다');
  assert.equal(c.prominence, 28);                 // 하나뿐인 저기압 = 전지구 최저 → 장 전체의 폭
  // 평평한 바탕은 그 자체가 전지구 최고 '고원'이라 H 가 하나 나온다 — 합성 장의 성질이지 저기압 찾기의 흠이 아니다.
  assert.deepEqual(kindOf(centers(f, NOW), 'H').map((h) => h.hPa), [1013]);
});

test('격자점에서 벗어난 중심도 0.5° 안에 선다', () => {
  for (const [lat0, lon0] of [[35.2, 135.3], [-47.7, -12.4], [61.3, 8.9]]) {
    const f = fieldOf((lat, lon) => 1013 + bump(lat, lon, { lat: lat0, lon: lon0, sigma: 5, amp: -28.4 }));
    const lows = kindOf(centers(f, NOW), 'L');
    assert.equal(lows.length, 1);
    const d = greatCircleDeg(lows[0].lat, lows[0].lon, lat0, lon0);
    assert.ok(d <= 0.5, `(${lat0}, ${lon0}) 에서 ${d.toFixed(2)}° 떨어졌다`);
    assert.ok(Number.isInteger(lows[0].hPa), '1 hPa 눈금에서 소수 자리가 나오면 지어낸 값이다');
  }
});

test('8bit 고원 — 같은 최솟값이 20칸 넘게 깔려도 중심은 하나다', () => {
  // 바닥을 990 에서 자른 저기압: 반경 3.6° 안이 전부 같은 바이트다.
  const f = fieldOf((lat, lon) => Math.max(990, 1013 + bump(lat, lon, { lat: 35, lon: 135, sigma: 5, amp: -30 })));
  let floor = 0;
  for (const b of f.data) if (b === 120) floor += 1;
  assert.ok(floor >= 20, `고원 ${floor}칸`);
  const lows = kindOf(centers(f, NOW), 'L');
  assert.equal(lows.length, 1);
  assert.equal(lows[0].hPa, 990);
  assert.ok(greatCircleDeg(lows[0].lat, lows[0].lon, 35, 135) <= 0.5);
});

test('초승달 고원 — 무게중심이 고원 밖이어도 기호는 고원 위에 선다', () => {
  // 1000 hPa 고리(반경 4~5°)를 1013 바탕에 판다. 고리의 무게중심은 가운데(1013)다 — 거기에 'L 1000' 을 찍으면 틀린다.
  const f = fieldOf((lat, lon) => {
    const d = greatCircleDeg(lat, lon, 10, -40);
    const open = lon > -40 && Math.abs(lat - 10) < 1.5;          // 동쪽을 터서 초승달로
    return d >= 4 && d <= 5 && !open ? 1000 : 1013;
  });
  const lows = kindOf(centers(f, NOW), 'L');
  assert.equal(lows.length, 1);
  assert.equal(byteAt(f, lows[0]), 130, '중심 칸의 값이 곧 고원의 값이다');
  assert.equal(lows[0].hPa, 1000);
});

test('±180° 에 걸친 저기압은 둘로 갈리지 않는다', () => {
  const f = fieldOf((lat, lon) => Math.max(985, 1013 + bump(lat, lon, { lat: -30, lon: 180, sigma: 5, amp: -32 })));
  let west = 0;
  let east = 0;
  for (let i = 0; i < 8; i += 1) { west += f.data[240 * W + i] === 115 ? 1 : 0; east += f.data[240 * W + (W - 1 - i)] === 115 ? 1 : 0; }
  assert.ok(west > 2 && east > 2, '고원이 열 0 과 열 719 양쪽에 다 걸쳐 있어야 시험이 뜻이 있다');
  const lows = kindOf(centers(f, NOW), 'L');
  assert.equal(lows.length, 1);
  assert.equal(Math.abs(lows[0].lon), 180);
  assert.ok(Math.abs(lows[0].lat + 30) <= 0.5);
  assert.equal(lows[0].hPa, 985);

  // 바닥이 한 칸뿐인 뾰족한 저기압으로 한 번 더 — 솎기를 끄고 본다. 열 0 과 열 719 가 이웃이 아니면 날짜변경선 서쪽 반쪽이
  // 제 바닥(열 719 · 984)을 가진 딴 웅덩이가 되어 L 이 둘 나온다. 8° 솎기를 켜 두거나 바닥이 고원이면(2단계가 고원을 한 덩어리로
  // 모으므로) 그 둘째가 가려져 시험이 아무것도 못 본다.
  const sharp = fieldOf((lat, lon) => 1013 + bump(lat, lon, { lat: 40, lon: 180, sigma: 1.5, amp: -30.4 }));
  assert.deepEqual([sharp.data[100 * W], sharp.data[100 * W + 1], sharp.data[100 * W + W - 1]], [113, 114, 114], '바닥은 열 0 한 칸이다');
  const found = kindOf(centers(sharp, NOW, { minSeparationDeg: 0 }), 'L');
  assert.deepEqual(found.map((c) => [c.lat, c.lon, c.col, c.hPa]), [[40, -180, 0, 983]]);
});

test('극 줄은 한 점이다 — 북극 위의 고기압은 H 하나 · 남극 위의 저기압은 L 하나', () => {
  const f = fieldOf((lat) => 1013 + 30 * Math.sin(lat * D2R));
  const all = centers(f, NOW);
  const highs = kindOf(all, 'H');
  const lows = kindOf(all, 'L');
  assert.equal(highs.length, 1, '맨 윗줄 720칸이 720개의 고기압이 되면 안 된다');
  // 극에는 경도가 없다 — 0° 로 적고 열도 경도 0° 의 열(360)로 맞춘다(lat·lon 과 row·col 이 같은 곳을 가리킨다).
  assert.deepEqual([highs[0].lat, highs[0].lon, highs[0].row, highs[0].col, highs[0].hPa], [90, 0, 0, 360, 1043]);
  assert.equal(lows.length, 1);
  assert.deepEqual([lows[0].lat, lows[0].lon, lows[0].row, lows[0].col, lows[0].hPa], [-90, 0, 360, 360, 983]);
  assert.equal(highs[0].prominence, 60);
});

test('극 줄의 값이 칸마다 달라도(있어서는 안 되는 자료) 극은 한 점이다 — 솎기 없이도 L 하나', () => {
  // 맨 윗줄이 1000 · 1005 로 번갈아 있다. 극 줄의 칸들이 서로 이웃이 아니면 1000 짜리 360칸이 저마다
  // 두드러짐 5 hPa 의 저기압이 된다(전부 북위 90° 라 8° 솎기를 켜 두면 가려진다 — 그래서 끄고 본다).
  const f = fieldOf(() => 1013);
  for (let i = 0; i < W; i += 1) f.data[i] = i % 2 === 0 ? 130 : 135;
  f.data[360] = 135;                                     // 경도 0° 의 칸은 일부러 고원 밖에 둔다
  const lows = kindOf(centers(f, NOW, { minSeparationDeg: 0 }), 'L');
  assert.deepEqual(lows.map((c) => [c.lat, c.lon, c.row, c.col, c.hPa]), [[90, 0, 0, 360, 1000]],
    'hPa 는 고원의 값이다 — 극이라 바꿔 적은 열(360)의 칸(1005)에서 다시 읽지 않는다');
});

test('극을 덮은 저기압은 극 건너편과 이어져 하나다 · 극 옆의 넓은 고원은 극으로 끌려가지 않는다', () => {
  const over = fieldOf((lat, lon) => 1013 + bump(lat, lon, { lat: 90, lon: 0, sigma: 4, amp: -20 }));
  const a = kindOf(centers(over, NOW, { minSeparationDeg: 0 }), 'L');
  assert.equal(a.length, 1);
  assert.equal(a[0].lat, 90);
  // 북위 85° 에 반경 3.6° 의 평평한 바닥. 북위 88° 줄은 82° 줄보다 같은 거리에 칸이 네 배 많다 —
  // 칸을 그냥 세어 평균하면 중심이 극 쪽으로 1° 넘게 끌린다. 칸의 넓이(cos 위도)로 달아야 제자리다.
  const flat = fieldOf((lat, lon) => Math.max(993, 1013 + bump(lat, lon, { lat: 85, lon: 40, sigma: 4, amp: -30 })));
  const b = kindOf(centers(flat, NOW), 'L');
  assert.equal(b.length, 1);
  assert.ok(greatCircleDeg(b[0].lat, b[0].lon, 85, 40) <= 0.5, `극 옆 고원의 중심이 ${b[0].lat},${b[0].lon} 에 섰다`);
});

// ------------------------------------------------------------------------------------------------ 두드러짐

test('두드러짐 미달은 버린다 — 임계는 hPa 로 견준다(0.5 hPa 눈금에서도 같은 답)', () => {
  const deep = { lat: -40, lon: -100, sigma: 5, amp: -30 };           // 멀리 있는 깊은 저기압(전지구 최저는 이쪽)
  for (const dec of [NOW, OLD]) {
    for (const [depth, kept] of [[3, false], [6, true]]) {
      const f = fieldOf((lat, lon) => 1013 + bump(lat, lon, deep) + bump(lat, lon, { lat: 30, lon: 60, sigma: 3, amp: -depth }), dec);
      const here = nearTo(kindOf(centers(f, dec), 'L'), 30, 60, 3);
      // 0.5 hPa 눈금에서 깊이 3 hPa 는 6바이트다 — 임계를 바이트로 견주면 4 를 넘어 살아남는다.
      assert.equal(here.length, kept ? 1 : 0, `scale ${dec.scale} · 깊이 ${depth}`);
      if (kept) { assert.equal(here[0].prominence, 6); assert.equal(here[0].hPa, 1007); }
    }
  }
  assert.deepEqual(PRESSURE_PROMINENCE_HPA, { L: 4, H: 4 });
  // 임계를 낮추면 같은 장에서 살아난다 — 값이 상수가 아니라 옵션을 탄다.
  const f = fieldOf((lat, lon) => 1013 + bump(lat, lon, deep) + bump(lat, lon, { lat: 30, lon: 60, sigma: 3, amp: -3 }));
  assert.equal(nearTo(kindOf(centers(f, NOW, { minProminenceL: 2 }), 'L'), 30, 60, 3).length, 1);
});

test('큰 저기압 옆구리의 혹은 중심이 아니다 — 고개가 얕으면(닫힌 4 hPa 등압선이 없으면) 버린다', () => {
  // 주 저기압(깊이 20) 8° 옆에 둘째 저기압(깊이 16)이 같은 폭으로 붙어 있다 — 둘 사이 고개가 둘째 바닥보다 2 hPa 높을 뿐이다.
  const A = { lat: -50, lon: 20, sigma: 3, amp: -20 };
  const B = { lat: -50, lon: 32.5, sigma: 3, amp: -16 };
  assert.ok(Math.abs(greatCircleDeg(A.lat, A.lon, B.lat, B.lon) - 8) < 0.1);
  const f = fieldOf((lat, lon) => 1013 + bump(lat, lon, A) + bump(lat, lon, B));
  // minSeparationDeg 0 — 솎기가 아니라 두드러짐이 버리는 것을 본다.
  const lows = kindOf(centers(f, NOW, { minSeparationDeg: 0 }), 'L');
  assert.equal(lows.length, 1);
  assert.ok(greatCircleDeg(lows[0].lat, lows[0].lon, A.lat, A.lon) <= 1);
  // 둘째가 정말 극값이기는 했는지: 임계를 1 로 내리면 나오고 두드러짐은 4 미만이다.
  const loose = kindOf(centers(f, NOW, { minSeparationDeg: 0, minProminenceL: 1 }), 'L');
  const second = nearTo(loose, B.lat, B.lon, 2);
  assert.equal(second.length, 1);
  assert.ok(second[0].prominence >= 1 && second[0].prominence < 4, `둘째의 두드러짐 ${second[0].prominence}`);
});

test('태풍(반경 1.5° · 깊이 40 hPa)이 살아남고 깊이가 뭉개지지 않는다 — 묶음 격자(block 4)에서도', () => {
  const typhoon = (lat0, lon0) => (lat, lon) => {
    const d = greatCircleDeg(lat, lon, lat0, lon0);
    return 1008 - 40 * Math.exp(-((d / 1.5) ** 2));
  };
  for (const [lat0, lon0] of [[20, 130], [20.2, 130.3]]) {
    const f = fieldOf(typhoon(lat0, lon0));
    let minByte = 255;
    for (const b of f.data) if (b < minByte) minByte = b;
    for (const block of [1, 4]) {
      const lows = kindOf(centers(f, NOW, { block }), 'L');
      assert.equal(lows.length, 1, `block ${block}`);
      assert.ok(greatCircleDeg(lows[0].lat, lows[0].lon, lat0, lon0) <= 0.5);
      assert.equal(lows[0].hPa, minByte + 870, '장의 최솟값 그대로 — 2° 로 솎은 격자였다면 중심 칸을 놓쳐 10 hPa 넘게 얕아진다');
      assert.ok(lows[0].hPa <= 972, `중심 ${lows[0].hPa}`);
    }
  }
});

// 교과서 배치. 띠: 적도 저압대 1009 · 아열대 고압대 1017 · 60° 저압대 1009 · 극 1017. 그 위에 계절 중심들을 얹는다.
const TEXTBOOK = [
  { name: '북태평양 고기압', lat: 38, lon: -150, sx: 22, sy: 7, amp: 15 },      // 동서 40° · 남북 12° — 아열대 고기압은 동서로 길다
  { name: '아조레스 고기압', lat: 35, lon: -30, sx: 18, sy: 7, amp: 14 },
  { name: '태풍', lat: 20, lon: 130, sx: 1.5, sy: 1.5, amp: -40 },
  { name: '알류샨 저기압', lat: 55, lon: 175, sx: 10, sy: 10, amp: -30 },
  { name: '얕은 열저기압', lat: 25, lon: 70, sx: 4, sy: 4, amp: -2 },
];
const textbook = () => fieldOf((lat, lon) => {
  let v = 1013 - 4 * Math.cos(6 * lat * D2R);
  for (const c of TEXTBOOK) v += oval(lat, lon, c);
  return v;
});

test('교과서 기압 배치 — 동서로 긴 아열대 고기압 둘 · 태풍 · 알류샨 저기압이 살고, 깊이 2 hPa 열저기압은 버린다', () => {
  const f = textbook();
  const all = centers(f, NOW);
  const find = (name, kind, deg) => {
    const c = TEXTBOOK.find((x) => x.name === name);
    return nearTo(kindOf(all, kind), c.lat, c.lon, deg);
  };
  const nph = find('북태평양 고기압', 'H', 5);
  assert.equal(nph.length, 1);
  assert.ok(nph[0].hPa >= 1028, `북태평양 고기압 ${nph[0].hPa}`);
  assert.equal(find('아조레스 고기압', 'H', 5).length, 1);
  const ty = find('태풍', 'L', 1);
  assert.equal(ty.length, 1);
  assert.ok(ty[0].hPa <= 975, `태풍 ${ty[0].hPa}`);
  assert.equal(find('알류샨 저기압', 'L', 5).length, 1);
  assert.equal(find('얕은 열저기압', 'L', 5).length, 0);
  for (const c of all) assert.ok(c.prominence >= 4, `${formatCenter(c)} 두드러짐 ${c.prominence}`);

  // 지시는 '반경 R° 고리와의 차'였다. 그렇게 쟀다면 북태평양 고기압이 사라진다는 것을 같은 장에서 잠근다(모듈 머리 주석의 근거).
  const at = (lat, lon) => {
    const j = Math.max(0, Math.min(H - 1, Math.round((90 - lat) / 0.5)));
    const i = ((Math.round((lon + 180) / 0.5) % W) + W) % W;
    return f.data[j * W + i];
  };
  const dest = (lat, lon, az, dist) => {
    const p = lat * D2R; const a = az * D2R; const d = dist * D2R;
    const p2 = Math.asin(Math.sin(p) * Math.cos(d) + Math.cos(p) * Math.sin(d) * Math.cos(a));
    const l2 = lon * D2R + Math.atan2(Math.sin(a) * Math.sin(d) * Math.cos(p), Math.cos(d) - Math.sin(p) * Math.sin(p2));
    return [p2 / D2R, l2 / D2R];
  };
  for (const R of [3, 6, 10]) {
    let ringMax = 0;
    const n = Math.ceil((2 * Math.PI * R) / 0.5);
    for (let k = 0; k < n; k += 1) ringMax = Math.max(ringMax, at(...dest(nph[0].lat, nph[0].lon, (360 * k) / n, R)));
    assert.ok(byteAt(f, nph[0]) - ringMax < 4, `반경 ${R}° 고리: 중심 − 고리 최댓값 = ${byteAt(f, nph[0]) - ringMax} hPa`);
  }
  assert.ok(nph[0].prominence >= 8, `고개까지의 깊이로는 ${nph[0].prominence} hPa`);
});

test('묶음 격자(block 4)는 같은 자리 · 같은 hPa 를 내고, 두드러짐만 보수적으로(크지 않게) 잡는다', () => {
  const f = textbook();
  const key = (c) => `${c.kind} ${c.row} ${c.col} ${c.hPa}`;
  const exact = centers(f, NOW, { maxH: 99, maxL: 99, minSeparationDeg: 0, minProminenceL: 6, minProminenceH: 6 });
  const coarse = centers(f, NOW, { maxH: 99, maxL: 99, minSeparationDeg: 0, block: 4 });
  const byKey = new Map(coarse.map((c) => [key(c), c]));
  assert.ok(exact.length >= 4);
  for (const c of exact) {
    const m = byKey.get(key(c));
    assert.ok(m, `원격자의 ${formatCenter(c)} (두드러짐 ${c.prominence})가 묶음 격자에서 빠졌다`);
    assert.ok(m.prominence <= c.prominence && m.prominence >= c.prominence - 2, `${formatCenter(c)}: ${c.prominence} → ${m.prominence}`);
  }
  // 묶음은 4칸(2°)까지만이다 — 8칸에서는 두드러짐 16 hPa 짜리도 잃었다(모듈 머리 주석). 더 큰 값은 4 로 읽는다.
  assert.deepEqual(centers(f, NOW, { block: 8 }), centers(f, NOW, { block: 4 }));
  assert.deepEqual(centers(f, NOW, { block: 0 }), centers(f, NOW));
});

// ------------------------------------------------------------------------------------------------ 솎기와 상한

test('최소 간격 — 6° 떨어진 두 저기압은 센 쪽만, 10° 면 둘 다', () => {
  const two = (gap) => fieldOf((lat, lon) => 1013
    + bump(lat, lon, { lat: 0, lon: 100, sigma: 1.5, amp: -25 })
    + bump(lat, lon, { lat: 0, lon: 100 + gap, sigma: 1.5, amp: -20 }));
  assert.equal(CENTER_MIN_SEPARATION_DEG, 8);
  const close = kindOf(centers(two(6), NOW), 'L');
  assert.deepEqual(close.map((c) => c.hPa), [988]);
  // 솎기 전에는 둘 다 닫힌 등압선을 가진 중심이었다 — 두드러짐이 아니라 간격이 버린 것이다.
  assert.deepEqual(kindOf(centers(two(6), NOW, { minSeparationDeg: 0 }), 'L').map((c) => c.hPa), [988, 993]);
  assert.deepEqual(kindOf(centers(two(10), NOW), 'L').map((c) => c.hPa), [988, 993]);
});

test('최소 간격은 같은 종류끼리만이다 — 저기압 5° 옆의 고기압은 남는다', () => {
  const f = fieldOf((lat, lon) => 1013 + bump(lat, lon, { lat: 0, lon: 100, sigma: 1.5, amp: -25 })
    + bump(lat, lon, { lat: 0, lon: 105, sigma: 1.5, amp: 12 }));
  const all = centers(f, NOW);
  assert.equal(nearTo(kindOf(all, 'L'), 0, 100, 1).length, 1);
  assert.equal(nearTo(kindOf(all, 'H'), 0, 105, 1).length, 1);
});

test('개수 상한 — 기본 40 은 전지구에서 사실상 자르지 않는다 · 옵션으로 줄인다 · 0 이면 그 종류를 찾지 않는다', () => {
  // ⚠️ 이 시험은 '깊은 **12개**만 온다'를 잠그고 있었다. 2026-09-20 반박 검증이 운영 41장에서 그 12 가
  //    **전지구에서 먼저** 자르는 바람에 한국 쪽 저기압이 남극해 저기압에게 자리를 뺏기는 것을 재현했다
  //    (두드러짐 ≥ 8 hPa 인 L 이 프레임당 평균 6.4개 버려짐 · 사라짐 109건 중 75건은 순위가 밀린 것뿐).
  //    개수로 거르는 일은 카메라를 아는 쪽(field-symbols.js)으로 옮기고 모듈의 기본 상한은 40 으로 올렸다.
  const lows15 = [];
  for (let k = 0; k < 15; k += 1) lows15.push({ lat: 0, lon: -168 + 24 * k, sigma: 2, amp: -(10 + k) });
  const f = fieldOf((lat, lon) => { let v = 1013; for (const c of lows15) v += bump(lat, lon, c); return v; });
  assert.deepEqual(CENTER_MAX_PER_KIND, { H: 40, L: 40 });
  const lows = kindOf(centers(f, NOW), 'L');
  assert.equal(lows.length, 15, '15개가 다 온다 — 기본 상한이 자르지 않는다');
  assert.deepEqual(lows.map((c) => c.hPa), [989, 990, 991, 992, 993, 994, 995, 996, 997, 998, 999, 1000, 1001, 1002, 1003]);
  for (let k = 1; k < lows.length; k += 1) assert.ok(lows[k - 1].prominence >= lows[k].prominence, '센 것부터');
  assert.deepEqual(kindOf(centers(f, NOW, { maxL: 3 }), 'L').map((c) => c.hPa), [989, 990, 991]);
  const none = centers(f, NOW, { maxL: 0 });
  assert.equal(kindOf(none, 'L').length, 0);
  assert.equal(kindOf(none, 'H').length, 1);
});

// ------------------------------------------------------------------------------------------------ 디코드 · 눌린 값

test('디코드 상수를 바꾸면 hPa 가 바뀐다 — 모듈은 870 도 940 도 모른다', () => {
  const low = (lat, lon) => 1013 + bump(lat, lon, { lat: 35, lon: 135, sigma: 4, amp: -28 });
  // ① 같은 바이트를 두 상수로 풀면 값이 다르다(자리는 같다).
  const f = fieldOf(low, NOW);
  const a = kindOf(centers(f, NOW), 'L')[0];
  const b = kindOf(centers(f, OLD), 'L')[0];
  assert.equal(a.hPa, 115 * 1 + 870);
  assert.equal(b.hPa, 115 * 0.5 + 940);
  assert.deepEqual([a.row, a.col], [b.row, b.col]);
  // ② 같은 기압장을 두 눈금으로 구우면 같은 값이 나온다.
  const c = kindOf(centers(fieldOf(low, OLD), OLD), 'L')[0];
  assert.equal(c.hPa, 985);
  assert.equal(c.prominence, 28);
  assert.deepEqual([c.row, c.col], [a.row, a.col]);
  // ③ gfs-frames 의 채널 객체를 그대로 넘겨도 된다 · 상수가 없으면 지어내지 않고 던진다.
  const ch = { name: 'R', idx: 0, transfer: 'linear', scale: 1, offset: 870, min: 870, max: 1125, clamped: true };
  assert.equal(kindOf(centers(f, ch), 'L')[0].hPa, 985);
  assert.throws(() => centers(f), TypeError);
  assert.throws(() => centers(f, { scale: 1 }), TypeError);
  assert.throws(() => centers(f, { scale: 0, offset: 870 }), TypeError);
  assert.throws(() => centers(f, { transfer: 'log10', scale: 1, offset: 870 }), TypeError);
});

test('눈금 바닥에 눌린 중심은 saturated 를 달고 "≤" 로 적는다 — 940 hPa 바닥에 눌렸던 태풍(커밋 c90b0fd5)', () => {
  const f = fieldOf((lat, lon) => 1008 + bump(lat, lon, { lat: 20, lon: 130, sigma: 2, amp: -80 }), OLD);   // 실제 928 → 바이트 0
  const c = kindOf(centers(f, OLD), 'L')[0];
  assert.equal(c.hPa, 940);
  assert.equal(c.saturated, true);
  assert.equal(formatCenter(c), 'L ≤940');
  // 눌리지 않은 중심에는 그 키가 없다.
  const ok = kindOf(centers(fieldOf((lat, lon) => 1008 + bump(lat, lon, { lat: 20, lon: 130, sigma: 2, amp: -40 }), OLD), OLD), 'L')[0];
  assert.equal('saturated' in ok, false);
});

test('formatCenter — 단위 없이 · 눈금 그대로', () => {
  assert.equal(formatCenter({ kind: 'L', hPa: 985 }, 'ko'), 'L 985');
  assert.equal(formatCenter({ kind: 'H', hPa: 1032 }, 'en'), 'H 1032');
  assert.equal(formatCenter({ kind: 'L', hPa: 985.5 }), 'L 985.5', '0.5 hPa 눈금의 값을 986 으로 올려 적지 않는다');
  assert.equal(formatCenter({ kind: 'H', hPa: 1125, saturated: true }), 'H ≥1125');
  assert.equal(formatCenter(null), '');
  assert.equal(formatCenter({ kind: 'L', hPa: NaN }), '');
  assert.equal(formatCenter({ kind: 'X', hPa: 1000 }), '');
});

// ------------------------------------------------------------------------------------------------ 지형

test('고지대 중심은 표시가 아니라 **삭제**다 — 찾기 전에 가린다 · 고도 없이 청하면 던진다', () => {
  // ⚠️ 이 시험은 'elevationAt 을 주면 표시만 달고 지우지 않는다'를 잠그고 있었다. 2026-09-20 반박 검증이
  //    운영 f003 에서 그 규칙의 결과를 셌다: H 12개 중 8개가 고지대 가짜(남극고원 1060 · 그린란드 1036 · 카라코람 1036 …)이고,
  //    북태평양 고기압(prom 7)·남대서양 고기압(prom 6)은 자리가 없어 화면에 안 나왔다. 규칙을 뒤집는다.
  const f = fieldOf((lat, lon) => 1013 + bump(lat, lon, { lat: 33, lon: 88, sigma: 3, amp: -14 })     // 티베트 위
    + bump(lat, lon, { lat: 20, lon: 130, sigma: 3, amp: -20 }));                                      // 바다 위
  const tibet = (lat, lon) => (lat > 27 && lat < 38 && lon > 78 && lon < 100 ? 4500 : 0);
  assert.equal(kindOf(centers(f, NOW), 'L').length, 2, '가림판이 없으면 둘 다 나온다 — 그 둘째가 가짜다');

  const kept = kindOf(centers(f, NOW, { elevationAt: tibet }), 'L');
  assert.equal(kept.length, 1);
  assert.equal(nearTo(kept, 20, 130, 1).length, 1, '바다 위의 진짜는 남는다');
  assert.equal(nearTo(kept, 33, 88, 1).length, 0, '티베트 위의 가짜는 목록에 없다');
  for (const c of kept) assert.equal('overHighTerrain' in c, false, '표시 키는 더 이상 없다 — 숨기는 일을 그리는 쪽에 미루지 않는다');
  assert.equal(HIGH_TERRAIN_M, 1500);
  assert.equal(kindOf(centers(f, NOW, { elevationAt: () => 1500 }), 'L').length, 0, '경계 포함 — 전부 고지대면 중심이 없다');
  assert.equal(kindOf(centers(f, NOW, { elevationAt: () => 1499 }), 'L').length, 2);
  assert.equal(nearTo(kindOf(centers(f, NOW, { elevationAt: tibet, highTerrainM: 5000 }), 'L'), 33, 88, 1).length, 1, '문턱을 올리면 남는다');
  // 고도를 못 읽은 곳(NaN · null)은 고지대라고 하지 않는다 — **모르는 것으로 지우지도 않는다.**
  // (고도맵이 통째로 안 온 상황은 buildHighTerrainMask 의 ok 가 말한다 — 그리는 쪽이 그때 H/L 을 아예 그리지 않는다.)
  assert.equal(kindOf(centers(f, NOW, { elevationAt: () => NaN }), 'L').length, 2);
  assert.equal(kindOf(centers(f, NOW, { elevationAt: () => null }), 'L').length, 2);
  // 고도 없이 청하면 던진다 — '가짜가 섞인 채 조용히 배선'되는 길을 문서가 아니라 코드로 막는다.
  assert.throws(() => findPressureCenters(f, NOW), /PRESSURE_CENTERS_NEEDS_ELEVATION/);
  assert.throws(() => findPressureCenters(f, NOW, { maxH: 0 }), /PRESSURE_CENTERS_NEEDS_ELEVATION/, 'L 도 가짜가 된다(티베트 열저기압)');
  assert.equal(findPressureCenters(f, NOW, { maxH: 0, maxL: 0 }).length, 0, '아무것도 안 청하면 던질 일이 없다');
});

test('가림판은 칸 표로도 준다 — 크기가 맞아야 쓰고, 극관은 화면의 지형(남극 2,800 m)을 따른다', () => {
  const f = fieldOf((lat, lon) => 1013 + bump(lat, lon, { lat: -87, lon: 40, sigma: 3, amp: 34 })      // 남극고원 위의 가짜 고기압
    + bump(lat, lon, { lat: 20, lon: 130, sigma: 3, amp: -20 }));                                      // 바다 위의 진짜 저기압
  // heightAtJs 는 위도를 ±85° 로 자르고 극 셰이더의 poleFade(남극 2,800 m)가 없다 — 가림판이 그 보정을 대신한다.
  const built = buildHighTerrainMask({ w: W, h: H }, () => 0);
  assert.equal(built.mask.length, W * H);
  assert.ok(built.high > 0, '고도가 0 이어도 남극관은 가려진다');
  assert.ok(built.high < W * H * 0.06, '가려지는 것은 남극관뿐이다');
  assert.equal(built.known, 0);
  assert.equal(built.ok, false, '어디서나 정확히 0 — 고도맵이 안 온 판이다. 가려진 칸 수로는 이것을 못 가른다');
  assert.equal(nearTo(kindOf(centers(f, NOW, { highMask: built.mask }), 'H'), -87, 40, 4).length, 0);
  assert.equal(nearTo(kindOf(centers(f, NOW, { highMask: built.mask }), 'L'), 20, 130, 1).length, 1);
  // 고도를 실제로 읽은 판(바다 칸은 수심 음수)은 ok 가 선다 — 문턱은 상수에서 센다.
  const real = buildHighTerrainMask({ w: W, h: H }, (lat, lon) => (lat > 27 && lat < 38 && lon > 78 && lon < 100 ? 4500 : -3500));
  assert.ok(real.high > built.high, '티베트만큼 더 가려진다');
  assert.ok(real.known >= W * H * ELEVATION_KNOWN_MIN_RATIO && real.ok);
  // 크기가 안 맞는 표는 못 쓴다 — 조용히 엉뚱한 칸을 가리느니 없는 것으로 본다(그리고 고도가 없으니 던진다).
  assert.throws(() => findPressureCenters(f, NOW, { highMask: new Uint8Array(10) }), /PRESSURE_CENTERS_NEEDS_ELEVATION/);
});

test('가짜 옆의 진짜는 두드러짐을 고개에서 잘리지 않는다 — 한쪽만 가짜면 깊이와 무관하게 진짜가 산다', () => {
  // 가짜 H(+35 · 고지대 위)와 진짜 H(+27)가 14° 떨어져 있고, 둘 사이의 고개는 1026 hPa 이다.
  // '깊은 쪽이 산다'는 나이 규칙만 두면 진짜가 가짜에 흡수돼 두드러짐이 1040 − 1026 = 14 로 잘린다.
  // 진짜의 두드러짐은 다음 **진짜** 중심까지의 고개(바탕 1013)에서 재야 한다 → 27.
  const world = (lat, lon) => 1013 + bump(lat, lon, { lat: 0, lon: 0, sigma: 4, amp: 40 })       // 전지구 최고(진짜)
    + bump(lat, lon, { lat: 34, lon: 100, sigma: 4, amp: 35 })                                    // 고지대 위의 가짜
    + bump(lat, lon, { lat: 20, lon: 100, sigma: 4, amp: 27 });                                   // 그 옆의 진짜
  const f = fieldOf(world);
  const alps = (lat, lon) => (lat > 30 && lat < 40 && lon > 95 && lon < 105 ? 3000 : 0);
  const cut = nearTo(kindOf(centers(f, NOW), 'H'), 20, 100, 2)[0];
  assert.equal(cut.hPa, 1040);
  assert.equal(cut.prominence, 14, '가림판이 없으면 가짜가 진짜를 잡아먹고 두드러짐을 고개에서 깎는다');
  const kept = kindOf(centers(f, NOW, { elevationAt: alps }), 'H');
  assert.equal(nearTo(kept, 34, 100, 2).length, 0, '가짜는 없다');
  const whole = nearTo(kept, 20, 100, 2)[0];
  assert.equal(whole.hPa, 1040);
  assert.equal(whole.prominence, 27, '제 바닥을 지켜 다음 진짜까지의 고개에서 잰다');
});

test('고지대의 센 중심들이 믿을 만한 중심의 자리를 빼앗지 않는다 — 가림판이 있으면 아예 자리를 잡지 못한다', () => {
  // 남극 빙상 위의 가짜 저기압 4개(깊이 30~33)와 바다 위의 진짜 저기압 3개(깊이 10~12). 두드러짐은 가짜 쪽이 전부 더 크다.
  const fake = [0, 1, 2, 3].map((k) => ({ lat: -80, lon: -150 + 90 * k, sigma: 2, amp: -(30 + k) }));
  const real = [0, 1, 2].map((k) => ({ lat: 30, lon: -120 + 100 * k, sigma: 3, amp: -(10 + k) }));
  const f = fieldOf((lat, lon) => { let v = 1013; for (const c of [...fake, ...real]) v += bump(lat, lon, c); return v; });
  const ice = (lat) => (lat < -70 ? 3000 : 0);
  // 가림판 없이 3개만 달라고 하면 센 순서대로 가짜 셋이 온다 — 지구에 진짜 L 이 하나도 안 보인다.
  assert.deepEqual(kindOf(centers(f, NOW, { maxL: 3 }), 'L').map((c) => c.lat < -70), [true, true, true]);
  // 가림판을 주면 **가짜는 목록에 없고** 진짜 셋이 상한 3 을 그대로 쓴다. 1등 자리(prom = 장 전체 폭)도 진짜의 것이다.
  const lows = kindOf(centers(f, NOW, { maxL: 3, elevationAt: ice }), 'L');
  assert.deepEqual(lows.map((c) => c.hPa), [1001, 1002, 1003]);
  assert.deepEqual(lows.map((c) => c.lat < -70), [false, false, false]);
  for (let k = 1; k < lows.length; k += 1) assert.ok(lows[k - 1].prominence >= lows[k].prominence, '센 것부터');
});

// ------------------------------------------------------------------------------------------------ 시간

test('matchCenters — 가까워도 hPa 가 크게 다르면 짝이 아니다(반박 검증의 반례)', () => {
  assert.equal(CENTER_MATCH_MAX_DHPA, 3 * CENTER_MATCH_HPA_PER_HOUR);
  // 태풍이 b 목록에서 빠진 상황: 4.6° 옆의 얕은 저기압과 짝이 되면 'L 950' 이 미끄러진 뒤 'L 1004' 로 바뀐다
  // — 3시간 만에 54 hPa 약해진 그림이다. 운영 실측에서 진짜 태풍의 3시간 최대 변화는 10 hPa 였다.
  const a = [{ kind: 'L', lat: 25, lon: 135, hPa: 950 }];
  const b = [{ kind: 'L', lat: 26, lon: 140, hPa: 1004 }];
  assert.ok(greatCircleDeg(25, 135, 26, 140) < CENTER_MATCH_MAX_DEG, '거리만 보면 짝이 된다');
  assert.deepEqual(matchCenters(a, b).map((p) => [!!p.a, !!p.b]), [[true, false], [false, true]]);
  // 운영에서 실제로 난 엇짝: 'H 1052' 가 5.2° 옆의 'H 1016' 과 짝이 돼 mix 0.5 에서 글자가 36 hPa 뛰었다.
  const hi = matchCenters([{ kind: 'H', lat: -76.5, lon: 102.5, hPa: 1052 }], [{ kind: 'H', lat: -73, lon: 117, hPa: 1016 }]);
  assert.deepEqual(hi.map((p) => [!!p.a, !!p.b]), [[true, false], [false, true]]);
  // 문턱 안이면 그대로 짝이다 — GFS 자체의 출렁임(3시간 10 hPa)까지는 같은 중심으로 본다.
  const near = matchCenters([{ kind: 'L', lat: 25, lon: 135, hPa: 988 }], [{ kind: 'L', lat: 26, lon: 138, hPa: 978 }]);
  assert.equal(near.length, 1);
  assert.ok(near[0].a && near[0].b);
  // 간격이 넓은 스텝(6시간)은 부르는 쪽이 시간당 값을 곱해 넘긴다.
  const wide = matchCenters(a, b, 6 * CENTER_MATCH_DEG_PER_HOUR, 6 * CENTER_MATCH_HPA_PER_HOUR);
  assert.equal(wide.length, 2, '6시간이어도 54 hPa 는 같은 중심이 아니다');
  // hPa 를 모르는 합성 입력은 기압 문턱을 묻지 않는다 — 없는 값으로 짝을 끊지 않는다.
  const noHpa = matchCenters([{ kind: 'L', lat: 0, lon: 0 }], [{ kind: 'L', lat: 0, lon: 2 }]);
  assert.equal(noHpa.length, 1);
  assert.ok(noHpa[0].a && noHpa[0].b);
});

test('matchCenters — 3시간에 5° 움직인 저기압은 짝이고, 30° 떨어진 것 · 종류가 다른 것은 짝이 아니다', () => {
  const find = (list) => kindOf(centers(fieldOf((lat, lon) => {
    let v = 1013;
    for (const c of list) v += bump(lat, lon, c);
    return v;
  }), NOW), 'L');
  const a = find([{ lat: 40, lon: 140, sigma: 3, amp: -25 }]);
  const b = find([{ lat: 40, lon: 146.5, sigma: 3, amp: -28 }, { lat: 40, lon: 179, sigma: 3, amp: -15 }]);
  assert.ok(Math.abs(greatCircleDeg(40, 140, 40, 146.5) - 5) < 0.05);
  assert.equal(CENTER_MATCH_MAX_DEG, 3 * CENTER_MATCH_DEG_PER_HOUR);
  const pairs = matchCenters(a, b);
  assert.equal(pairs.length, 2);
  assert.equal(pairs[0].a, a[0]);
  assert.equal(pairs[0].b.hPa, 985);
  assert.ok(Math.abs(pairs[0].distDeg - 5) < 0.1);
  assert.deepEqual([pairs[1].a, pairs[1].b.hPa, pairs[1].distDeg], [null, 998, null], '30° 떨어진 것은 새로 생긴 중심이다');
  // 반경을 4° 로 줄이면 5° 움직인 것도 짝이 아니다: 하나는 사라지고 둘이 생긴다.
  assert.deepEqual(matchCenters(a, b, 4).map((p) => [!!p.a, !!p.b]), [[true, false], [false, true], [false, true]]);
  // 같은 자리여도 H 와 L 은 짝이 아니다.
  const mixed = matchCenters([{ kind: 'L', lat: 10, lon: 10, hPa: 990 }], [{ kind: 'H', lat: 10, lon: 10, hPa: 1030 }]);
  assert.deepEqual(mixed.map((p) => [p.kind, !!p.a, !!p.b]), [['L', true, false], ['H', false, true]]);
  // 가까운 짝부터 하나씩 — 한 중심이 두 번 쓰이지 않는다.
  const A = [{ kind: 'L', lat: 0, lon: 0, hPa: 990 }, { kind: 'L', lat: 0, lon: 4, hPa: 995 }];
  const B = [{ kind: 'L', lat: 0, lon: 3, hPa: 991 }];
  const greedy = matchCenters(A, B);
  assert.deepEqual(greedy.map((p) => [p.a && p.a.hPa, p.b && p.b.hPa]), [[990, null], [995, 991]]);
  assert.deepEqual(matchCenters(null, undefined), []);
});

test('lerpCenter — 짝은 대권을 따라 옮기고(±180° 는 짧은 쪽으로) hPa 는 지어내지 않는다 · 짝 없는 것은 제자리에서 나타나고 사라진다', () => {
  const a = { kind: 'L', lat: 30, lon: 178, hPa: 985, prominence: 20, row: 120, col: 716 };
  const b = { kind: 'L', lat: 30, lon: -178, hPa: 981, prominence: 24, row: 120, col: 4 };
  const [pair] = matchCenters([a], [b]);
  assert.ok(pair.a && pair.b);
  const mid = lerpCenter(pair, 0.5);
  assert.equal(Math.abs(Math.round(mid.lon)), 180, `날짜변경선을 건너는 중간은 ±180 이다 — 0° 가 아니다 (${mid.lon})`);
  assert.ok(Math.abs(mid.lat - 30) < 0.1);
  assert.equal(mid.phase, 'moving');
  assert.equal(mid.alpha, 1);
  const q = lerpCenter(pair, 0.25);
  assert.ok(Math.abs(greatCircleDeg(q.lat, q.lon, a.lat, a.lon) - 0.25 * pair.distDeg) < 1e-6, '거리에 비례해 옮긴다');
  for (const t of [0, 0.1, 0.49, 0.5, 0.9, 1]) {
    const c = lerpCenter(pair, t);
    assert.equal(c.hPa, t < 0.5 ? 985 : 981, `mix ${t} 의 hPa ${c.hPa} — 두 키프레임에 없는 숫자를 만들지 않는다`);
    assert.equal(c.nearest, t < 0.5 ? a : b);
  }
  // overHighTerrain 은 더 이상 없다 — 고지대 중심은 찾기 전에 가려져 여기까지 오지 않는다.
  assert.equal('overHighTerrain' in lerpCenter(pair, 0.2), false);
  assert.equal('overHighTerrain' in lerpCenter(pair, 0.8), false);
  assert.deepEqual([lerpCenter(pair, 0).lat, lerpCenter(pair, 0).lon], [30, 178]);
  assert.ok(Math.abs(lerpCenter(pair, 1).lon + 178) < 1e-9);
  assert.equal(formatCenter(lerpCenter(pair, 0.7)), 'L 981');

  const gone = lerpCenter({ kind: 'L', a, b: null, distDeg: null }, 0.25);
  assert.deepEqual([gone.lat, gone.lon, gone.hPa, gone.alpha, gone.phase], [30, 178, 985, 0.75, 'vanishing']);
  const born = lerpCenter({ kind: 'L', a: null, b, distDeg: null }, 0.25);
  assert.deepEqual([born.lat, born.lon, born.hPa, born.alpha, born.phase], [30, -178, 981, 0.25, 'appearing']);
  assert.equal(lerpCenter(pair, 7).hPa, 981, 'mix 는 0~1 로 자른다');
  assert.equal(lerpCenter(pair, NaN).hPa, 985);
  assert.equal(lerpCenter(null, 0.5), null);
});

// ------------------------------------------------------------------------------------------------ 입력

test('읽을 수 없는 프레임은 빈 목록이다 · 전지구 격자가 아니면 던진다 · 여러 채널 그림과 0°~360° 배치를 읽는다', () => {
  const low = (lat, lon) => 1013 + bump(lat, lon, { lat: 35, lon: -160, sigma: 4, amp: -28 });
  const f = fieldOf(low);
  assert.deepEqual(centers(null, NOW), []);
  assert.deepEqual(centers({ w: W, h: H, data: null }, NOW), []);
  assert.deepEqual(centers({ w: W, h: H, data: f.data.subarray(0, 1000) }, NOW), [], '격자와 크기가 안 맞는 그림에서 값을 읽지 않는다');
  assert.deepEqual(centers({ w: W, h: H, data: new Uint8Array(W * H).fill(143) }, NOW), [], '평평한 장에는 중심이 없다');
  assert.throws(() => centers(f, NOW, { grid: { lon0: 100, lat0: 60, dLon: 0.05, dLat: 0.05 } }), RangeError);

  // RGBA 사본(풀 줄 모르는 필드는 gfs-frames 가 4채널을 그대로 둔다) — channels 로 폭을 알린다.
  const rgba = new Uint8Array(W * H * 4);
  for (let p = 0; p < W * H; p += 1) { rgba[p * 4] = f.data[p]; rgba[p * 4 + 3] = 255; }
  assert.deepEqual(centers({ w: W, h: H, channels: 4, data: rgba }, NOW), centers(f, NOW));

  // 열 0 = 경도 0° 인 배치: 경도 200° 의 저기압은 −160° 로 나온다.
  const f360 = fieldOf(low, NOW, 0);
  const c = kindOf(centers(f360, NOW, { grid: { lon0: 0, lat0: 90, dLon: 0.5, dLat: -0.5 } }), 'L')[0];
  assert.deepEqual([c.lat, c.lon, c.col, c.hPa], [35, -160, 400, 985]);
});

test('720×361 매끄러운 난수 장 — 실행 시간 상한 · 같은 입력에 같은 출력 · 입력을 고치지 않는다', () => {
  const r = lcg(20260920);
  const waves = [];
  for (let k = 0; k < 24; k += 1) waves.push({ m: 1 + Math.floor(r() * 8), n: 1 + Math.floor(r() * 6), p1: r() * 6.28, p2: r() * 6.28, a: 3 + r() * 9 });
  const f = fieldOf((lat, lon) => {
    let v = 1013;
    const c = Math.cos(lat * D2R);
    for (const w of waves) v += w.a * c * Math.sin(w.m * lon * D2R + w.p1) * Math.sin(w.n * lat * 2 * D2R + w.p2);
    return v;
  });
  const before = Uint8Array.from(f.data);
  const timeOf = (opts) => {
    const cold0 = performance.now();
    const first = centers(f, NOW, opts);
    const cold = performance.now() - cold0;
    let warm = Infinity;
    for (let k = 0; k < 5; k += 1) { const t0 = performance.now(); centers(f, NOW, opts); warm = Math.min(warm, performance.now() - t0); }
    return { first, cold, warm };
  };
  const exact = timeOf({});
  const coarse = timeOf({ block: 4 });
  // 모듈 머리 주석의 '비용' 숫자가 여기서 나온다. 상한은 넉넉히 — 느린 CI 에서 흔들리지 않게(데스크톱 실측의 수십 배).
  console.log(`pressure-centers 720×361: block 1 첫 호출 ${exact.cold.toFixed(1)} ms · 데운 뒤 ${exact.warm.toFixed(1)} ms`
    + ` | block 4 첫 호출 ${coarse.cold.toFixed(1)} ms · 데운 뒤 ${coarse.warm.toFixed(1)} ms`
    + ` | 중심 H ${kindOf(exact.first, 'H').length} · L ${kindOf(exact.first, 'L').length}`);
  assert.ok(exact.warm < 1500, `block 1 ${exact.warm.toFixed(1)} ms`);
  assert.ok(coarse.warm < 1500, `block 4 ${coarse.warm.toFixed(1)} ms`);

  assert.ok(exact.first.length > 4, '매끄러운 난수 장에는 중심이 여럿 있다');
  // 숫자를 박지 않는다 — 상한은 모듈의 상수에서 센다(12 를 박아 뒀다가 상한이 40 이 된 날 이 줄이 떨어졌다).
  assert.ok(kindOf(exact.first, 'H').length <= CENTER_MAX_PER_KIND.H && kindOf(exact.first, 'L').length <= CENTER_MAX_PER_KIND.L);
  assert.deepEqual(centers(f, NOW), exact.first, '같은 입력에 같은 출력');
  assert.deepEqual(f.data, before, '입력 프레임은 저장소 캐시의 것이다 — 고치면 안 된다');
  // 나온 것은 전부 진짜 극값이다: 8방향 이웃(경도 랩) 가운데 L 보다 낮은 칸 · H 보다 높은 칸이 없다.
  for (const c of exact.first) {
    const v = byteAt(f, c);
    for (let dj = -1; dj <= 1; dj += 1) {
      for (let di = -1; di <= 1; di += 1) {
        const j = c.row + dj;
        if (j < 0 || j >= H) continue;
        const q = f.data[j * W + ((c.col + di + W) % W)];
        assert.ok(c.kind === 'L' ? q >= v : q <= v, `${formatCenter(c)} 옆에 더 ${c.kind === 'L' ? '낮은' : '높은'} 칸이 있다`);
      }
    }
    assert.equal(c.hPa, v + 870);
    assert.ok(c.prominence >= 4);
  }
  // 같은 종류끼리는 8° 넘게 떨어져 있다.
  for (const a of exact.first) {
    for (const b of exact.first) {
      if (a !== b && a.kind === b.kind) assert.ok(greatCircleDeg(a.lat, a.lon, b.lat, b.lon) >= 8);
    }
  }
});
