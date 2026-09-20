// DEV-DIRECTIVE 2026-09-20 · W3 — 바람 입자 엔진(prototype/v2-three/js/wind-particles.js)의 결과 시험.
//
// v2 의 바람은 관측소마다 선분 하나 위를 입자 2개가 왕복하는 '막대기'였다. 그 자리에 들어갈 엔진이다.
// "막대기가 없다"만 시험하면 아무것도 안 그리는 엔진이 통과한다 — 여기서는 **입자가 실제로 어디로 가는지**를 잰다:
//   동풍이면 동쪽으로 · 북풍이면 북쪽으로(격자의 남북이 뒤집히면 동풍 시험은 통과한다) · 날짜변경선을 끊김 없이 ·
//   극에서 유한하게 · 저기압 둘레를 반지름을 지키며 · 두 프레임 사이를 비율대로 · 디코드 상수대로.
// 그리기 쪽은 WebGL 없이 잴 수 있는 것을 잰다: 인스턴스 수(예산을 줄이면 그리는 정점이 준다) ·
//   프레임당 올리는 범위가 머리 슬롯 한 블록뿐인가 · 증분 갱신한 GPU 배열이 원본에서 통째로 다시 만든 것과 같은가.
//
// THREE 는 가짜가 아니라 저장소의 r184 그대로다 — 기하·속성·재질은 WebGL 없이 만들어진다(news-chips.test.mjs 선례).
import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from '../../prototype/vendor/three-r184.module.min.js';

import {
  SEG_FLOATS,
  WIND_CALM_MS,
  WIND_DEG_PER_PX_MAX,
  WIND_DENSITY_CSS_PX,
  WIND_MAX_CHORD,
  WIND_SCREEN_PX_PER_S_PER_MS,
  WIND_SPEED_BOUNDS_MS,
  WIND_SPEED_COLORS_TEMP,
  WIND_TRAIL_SECONDS,
  WIND_TRAIL_SEGMENTS,
  WindParticleSim,
  WindParticles,
  advectLatLon,
  createWindField,
  degPerCssPx,
  particleBudgetFor,
  particleCountFor,
  sampleWind,
  spawnInCap,
  stepWind,
  visibleCapAngle,
  windSpeedBand,
} from '../../prototype/v2-three/js/wind-particles.js';

// 1440×900 화면의 입자 예산 — 밀도 상수에서 셈한다(시험에 숫자를 박지 않는다).
const FULL_1440 = particleBudgetFor(1440, 900);

// ---- 합성 프레임: 운영 매니페스트 fields.wind10 과 같은 모양 (720×361 · 행 0 = 90N · 열 0 = 180W · R=u G=v) ----
const W = 720;
const H = 361;
const D2R = Math.PI / 180;
const R2D = 180 / Math.PI;
// aws/gfs-cloud-forecast/handler.py field_specs()['wind10'] 의 디코드 상수와 _wind10_byte 의 인코딩 식.
const DECODE = Object.freeze({ scale: 128 / 255, offset: -64 });
const byteOf = (ms) => Math.max(0, Math.min(255, Math.floor(((ms + 64) / 128) * 255 + 0.5)));
const QUANT = 0.26;   // 8bit 눈금 절반(0.251 m/s) + 여유
// ⚠️ 운영 인코딩에는 **정확한 0 이 없다** — 0 m/s 는 눈금 127.5 라 바이트 128(+0.251 m/s)로 풀린다.
//    '동풍에서 위도가 그대로다'를 재려면 남북 성분이 정확히 0 이어야 하므로, 0 이 눈금 위에 있는 상수(0.5 m/s 눈금)로
//    만든 프레임을 따로 쓴다. 엔진은 디코드 상수를 주입받는다 — 어느 상수든 같은 코드 경로다.
const EXACT = Object.freeze({ scale: 0.5, offset: -64 });
const byteExact = (ms) => Math.max(0, Math.min(255, Math.round(ms * 2 + 128)));

/** fn(lat, lon) → [u, v] | null. null 인 칸은 (0,0) 바이트로 남는다 — 디코드 못 한 이미지를 캔버스에서 읽은 모양. */
function frame(fn, stride = 3, enc = byteOf) {
  const d = new Uint8Array(W * H * stride);
  for (let j = 0; j < H; j += 1) {
    for (let i = 0; i < W; i += 1) {
      const uv = fn(90 - j * 0.5, -180 + i * 0.5);
      if (!uv) continue;
      const o = (j * W + i) * stride;
      d[o] = enc(uv[0]); d[o + 1] = enc(uv[1]);
      if (stride === 4) d[o + 3] = 255;
    }
  }
  return d;
}
const fieldOf = (fn, extra = {}) => ({ w: W, h: H, dataA: frame(fn), decode: DECODE, ...extra });
const EAST10 = frame(() => [10, 0]);                       // 운영 상수 — u 10.04 · v +0.25 m/s 로 풀린다
const EAST10_EXACT = frame(() => [10, 0], 3, byteExact);   // u 10 · v 0 정확히
const NORTH10_EXACT = frame(() => [0, 10], 3, byteExact);

const unit = (lat, lon) => {
  const la = lat * D2R; const lo = lon * D2R; const c = Math.cos(la);
  return { x: c * Math.sin(lo), y: Math.sin(la), z: c * Math.cos(lo) };
};
const camAt = (lat, lon, dist) => { const u = unit(lat, lon); return { x: u.x * dist, y: u.y * dist, z: u.z * dist }; };
const arcDeg = (a, b) => Math.acos(Math.max(-1, Math.min(1, a.x * b.x + a.y * b.y + a.z * b.z))) * R2D;
// 결정적 난수 — 시험이 돌 때마다 같은 입자가 같은 자리에 선다(ocean-land-mask.test.mjs 와 같은 LCG).
const lcg = (seed) => () => { seed = (seed * 1664525 + 1013904223) % 4294967296; return seed / 4294967296; };
const VIEW = Object.freeze({ fovDeg: 48, widthCss: 1440, heightCss: 900 });   // main.js 카메라 화각 48°

/** 시험용 sim — 입자 하나를 정한 자리에 놓고 그 입자만 본다. 첫 step 이 입자를 켠 뒤에 pin 한다. */
function pinnedSim(spec, lat, lon, cam) {
  const sim = new WindParticleSim({ maxParticles: 1, random: lcg(7) });
  sim.setField(spec); sim.setView(VIEW); sim.setBudget(3);   // 예산 3 × 단계 3/3 = 3 → 버퍼 1 에 막혀 1
  sim.step(0, cam);
  assert.equal(sim.count, 1);
  sim.pin(0, lat, lon);
  return sim;
}
const segOf = (sim, slot, p = 0) => {
  const o = (slot * sim.max + p) * SEG_FLOATS; const g = sim.seg;
  return {
    s: { x: g[o], y: g[o + 1], z: g[o + 2] }, speed: g[o + 3],
    e: { x: g[o + 4], y: g[o + 5], z: g[o + 6] }, fade: g[o + 7],
    chord: Math.hypot(g[o + 4] - g[o], g[o + 5] - g[o + 1], g[o + 6] - g[o + 2]),
  };
};

test('격자 방향 — 행 0 은 북극, 열 0 은 서경 180 이다 (남북이 뒤집히면 동풍 시험은 그대로 통과한다)', () => {
  // 북위 60 · 동경 30 한 칸에만 강풍. 같은 경도의 남위 60 에는 없다.
  const f = createWindField(fieldOf((lat, lon) => (lat === 60 && lon === 30 ? [40, 0] : [0, 0])));
  const out = {};
  assert.ok(Math.abs(sampleWind(f, 60, 30, out).u - 40) < QUANT, `북위 60 에서 ${out.u}`);
  assert.ok(Math.abs(sampleWind(f, -60, 30, out).u) < QUANT * 2, `남위 60 에 강풍이 보인다: ${out.u}`);
  assert.ok(Math.abs(sampleWind(f, 60, -30, out).u) < QUANT * 2, `서경 30 에 강풍이 보인다: ${out.u}`);
  // 칸 사이는 이웃과 섞인다(bilinear) — 반 칸 옆은 절반.
  assert.ok(Math.abs(sampleWind(f, 60, 30.25, out).u - 20) < 0.5, `반 칸 옆 ${out.u}`);
  assert.ok(Math.abs(sampleWind(f, 60.25, 30, out).u - 20) < 0.5, `반 칸 위 ${out.u}`);
});

test('경도 랩 — 마지막 열(179.5E)의 이웃은 첫 열(180W)이고, +180 과 −180 은 같은 점이다', () => {
  const f = createWindField(fieldOf((lat, lon) => (lon === 179.5 ? [40, 0] : lon === -180 ? [20, 0] : [0, 0])));
  const a = {}; const b = {};
  assert.ok(Math.abs(sampleWind(f, 0, 179.75, a).u - 30) < 0.5, `이음매 한가운데 ${a.u} (랩이 없으면 20 이다)`);
  sampleWind(f, 0, 180, a); sampleWind(f, 0, -180, b);
  assert.equal(a.u, b.u);
  assert.ok(Math.abs(a.u - 20) < QUANT);
  // 몇 바퀴 밖의 경도도 같은 자리다 — 입자 경도가 접히기 전에 표본을 물어도 틀리지 않는다.
  sampleWind(f, 0, 179.5 + 720, a);
  assert.ok(Math.abs(a.u - 40) < QUANT);
});

test('RGB(3)와 RGBA(4) 프레임이 같은 값을 준다 — getImageData 는 4, 직접 푼 PNG 는 3 이다', () => {
  const fn = (lat, lon) => [Math.sin(lon * D2R) * 30, Math.cos(lat * D2R * 2) * 20];
  const f3 = createWindField({ w: W, h: H, dataA: frame(fn, 3), decode: DECODE });
  const f4 = createWindField({ w: W, h: H, dataA: new Uint8ClampedArray(frame(fn, 4)), decode: DECODE });
  const a = {}; const b = {};
  for (const [lat, lon] of [[37.5, 127.0], [-33.9, 151.2], [89.9, -0.1], [0.3, 179.9]]) {
    sampleWind(f3, lat, lon, a); sampleWind(f4, lat, lon, b);
    assert.equal(a.u, b.u); assert.equal(a.v, b.v);
  }
  assert.throws(() => createWindField({ w: W, h: H, dataA: new Uint8Array(10), decode: DECODE }), /RGB/);
  // 디코드 상수를 짐작으로 채우지 않는다 — 매니페스트에서 받아 와야 한다.
  assert.throws(() => createWindField({ w: W, h: H, dataA: frame(() => [1, 1]) }), /decode/);
});

test('동풍(서→동) — 입자가 동쪽으로 가고 위도가 그대로다. 북풍이면 북쪽으로 간다', () => {
  const east = createWindField({ w: W, h: H, dataA: EAST10_EXACT, decode: EXACT });
  const out = {};
  const k = 0.01;   // m/s 당 0.01° → 10 m/s 에서 한 걸음 0.1° (지표 거리)
  let lat = 35; let lon = 100;
  for (let i = 0; i < 200; i += 1) { stepWind(east, lat, lon, k, out); lat = out.lat; lon = out.lon; }
  assert.equal(lat, 35, '동풍인데 위도가 움직였다');
  // cos 위도 보정: 지표에서 같은 거리를 가려면 경도는 1/cos(35°) 배 더 움직여야 한다.
  const expect = 100 + (200 * 0.1) / Math.cos(35 * D2R);
  assert.ok(Math.abs(lon - expect) < 1e-6, `경도 ${lon} (기대 ${expect})`);
  assert.ok(lon > 100, '서쪽으로 갔다');

  const north = createWindField({ w: W, h: H, dataA: NORTH10_EXACT, decode: EXACT });
  stepWind(north, -20, 50, k, out);
  assert.ok(Math.abs(out.lat - -19.9) < 1e-9, `v>0 인데 위도 ${out.lat} — 남북이 뒤집혔다`);
  assert.equal(out.lon, 50);
  assert.equal(out.speed, 10);
  // 운영 상수로 풀어도 같은 방향이다(값은 눈금 오차 안).
  stepWind(createWindField({ w: W, h: H, dataA: EAST10, decode: DECODE }), 35, 100, k, out);
  assert.ok(out.lon > 100 && Math.abs(out.u - 10) < QUANT && Math.abs(out.v) < QUANT);
});

test('날짜변경선(순수) — 경도가 [−180,180) 로 접히고 접힌 걸음에 표시가 선다', () => {
  const out = {};
  advectLatLon(10, 179.95, 10, 0, 0.01, out);
  assert.equal(out.wrapped, true);
  assert.ok(out.lon >= -180 && out.lon < -179.9, `접힌 경도 ${out.lon}`);
  advectLatLon(10, -179.95, -10, 0, 0.01, out);
  assert.equal(out.wrapped, true);
  assert.ok(out.lon < 180 && out.lon > 179.9, `서쪽으로 접힌 경도 ${out.lon}`);
  advectLatLon(10, 100, 10, 0, 0.01, out);
  assert.equal(out.wrapped, false);
});

test('날짜변경선(꼬리) — 끊김 없이 넘고, 어떤 선분도 지구를 가로지르지 않는다', () => {
  const cam = camAt(10, 180, 3.0);
  const sim = pinnedSim({ w: W, h: H, dataA: EAST10_EXACT, decode: EXACT }, 10, 178, cam);
  const lons = [];
  let wrappedAt = -1;
  // 한 슬롯(0.2초)에 가는 지표 각: 풍속 × 과장 × 줌 × 시간. 선분의 현은 이보다 길 수 없다.
  const perSlotDeg = 10 * WIND_SCREEN_PX_PER_S_PER_MS * degPerCssPx(3.0, sim.radius, 48, 900) * (WIND_TRAIL_SECONDS / WIND_TRAIL_SEGMENTS);
  const maxChord = perSlotDeg * D2R * sim.radius * 1.05;
  for (let i = 0; i < 240; i += 1) {
    sim.step(1 / 30, cam);
    lons.push(sim.lon[0]);
    if (wrappedAt < 0 && sim.lon[0] < 0) wrappedAt = i;
    assert.ok(sim.lon[0] >= -180 && sim.lon[0] < 180, `경도 ${sim.lon[0]}`);
    assert.equal(sim.respawnsLast, 0, `프레임 ${i}: 넘다가 다시 뿌려졌다`);
    for (let s = 0; s < sim.slots; s += 1) {
      const g = segOf(sim, s);
      assert.ok(g.chord <= maxChord, `프레임 ${i} 슬롯 ${s}: 선분 현 ${g.chord} > ${maxChord} — 지구를 가로지른다`);
    }
    // 끊김 없음: 머리에서 꼬리로 가며 앞 선분의 시작 = 뒤 선분의 끝 (랩한 프레임에도).
    if (i > 100) {
      for (let a = 0; a < sim.slots - 1; a += 1) {
        const newer = segOf(sim, (sim.head - a + sim.slots) % sim.slots);
        const older = segOf(sim, (sim.head - a - 1 + sim.slots) % sim.slots);
        assert.ok(Math.hypot(newer.s.x - older.e.x, newer.s.y - older.e.y, newer.s.z - older.e.z) < 1e-6,
          `프레임 ${i}: 꼬리가 나이 ${a}↔${a + 1} 사이에서 끊겼다`);
      }
    }
  }
  assert.ok(wrappedAt > 0, `날짜변경선을 넘지 못했다 (마지막 경도 ${lons.at(-1)})`);
  assert.equal(sim.lat[0], 10);
  // 넘은 뒤에도 계속 동쪽으로: −180 에서 멀어진다.
  assert.ok(lons.at(-1) > lons[wrappedAt], `${lons[wrappedAt]} → ${lons.at(-1)}`);
  // 넘는 순간의 머리 선분도 짧다 — 위경도가 아니라 지구 좌표로 들고 있어서다.
  assert.ok(segOf(sim, sim.head).chord > 0, '머리 선분이 비었다');
});

test('극 — 위도 89° 에서 한 걸음이 유한하고, 지표에서 간 거리가 걸음보다 길지 않다', () => {
  const out = {};
  for (const lat of [86, 89, 89.4, -89]) {
    advectLatLon(lat, 20, 50, 0, 0.01, out);          // 0.5° 걸음의 동풍
    assert.ok(Number.isFinite(out.lat) && Number.isFinite(out.lon), `위도 ${lat}: ${out.lat}, ${out.lon}`);
    assert.ok(out.lon >= -180 && out.lon < 180);
    const moved = arcDeg(unit(lat, 20), unit(out.lat, out.lon));
    assert.ok(moved <= 0.5 * 1.0001, `위도 ${lat}: 0.5° 걸음에 ${moved}° 를 갔다`);
    assert.ok(moved > 0, `위도 ${lat}: 안 움직였다`);
  }
  // 85° 아래에서는 묶지 않는다 — 걸음 그대로 간다.
  advectLatLon(60, 20, 50, 0, 0.01, out);
  assert.ok(Math.abs(arcDeg(unit(60, 20), unit(60, out.lon)) - 0.5) < 0.002);
  // 극을 넘으려는 걸음은 표시가 서고 위도는 90 에 멈춘다 — sim 이 다시 뿌린다.
  advectLatLon(89.4, 20, 0, 50, 0.01, out);
  assert.equal(out.pole, true);
  assert.ok(out.lat <= 90);
});

test('극(sim) — 북풍 속에서 아무 입자도 극을 넘지 않고 NaN 이 되지 않는다', () => {
  const sim = new WindParticleSim({ maxParticles: 400, random: lcg(11) });
  sim.setField({ w: W, h: H, dataA: frame(() => [30, 40]), decode: DECODE });
  sim.setView(VIEW);
  const cam = camAt(88, 0, 1.6);
  let respawns = 0;
  for (let i = 0; i < 300; i += 1) {
    sim.step(1 / 30, cam);
    respawns += sim.respawnsLast;
    for (let p = 0; p < sim.count; p += 1) {
      assert.ok(Math.abs(sim.lat[p]) <= 90 && Number.isFinite(sim.lon[p]), `입자 ${p}: ${sim.lat[p]}, ${sim.lon[p]}`);
    }
  }
  assert.ok(respawns > 0, '극으로 들어간 입자가 한 번도 다시 뿌려지지 않았다');
  assert.ok(sim.seg.every(Number.isFinite), '선분 버퍼에 NaN');
});

test('소용돌이(저기압) — 입자가 중심 둘레를 한 바퀴 돌고 반지름이 1% 안에서 지켜진다 (오일러는 +20% 넘게 풀려 나간다)', () => {
  // 구면 강체 회전: 참 흐름에서는 중심까지의 대권 거리가 정확히 보존된다 — 남는 오차는 전부 적분기 것이다.
  // 중심은 북위 30 · 경도 180 — 날짜변경선 위다(랩과 cos 위도 보정이 같이 걸린다). 반지름 5° 에서 30 m/s.
  const C = unit(30, 180);
  const OMEGA = 30 / Math.sin(5 * D2R);
  const f = createWindField(fieldOf((lat, lon) => {
    const p = unit(lat, lon);
    const vx = C.y * p.z - C.z * p.y; const vy = C.z * p.x - C.x * p.z; const vz = C.x * p.y - C.y * p.x;
    const lo = lon * D2R; const la = lat * D2R;
    const u = vx * Math.cos(lo) - vz * Math.sin(lo);
    const v = -vx * Math.sin(la) * Math.sin(lo) + vy * Math.cos(la) - vz * Math.sin(la) * Math.cos(lo);
    return [OMEGA * u, OMEGA * v];
  }));
  // 엔진이 첫 화면(거리 3.0)에서 30fps 로 실제 밟는 걸음 — 30 m/s 에서 약 0.40°.
  const k = (WIND_SCREEN_PX_PER_S_PER_MS * degPerCssPx(3.0, 1.0012, 48, 900)) / 30;
  const run = (useRk2) => {
    let lat = 30; let lon = -180 + 5 / Math.cos(30 * D2R);
    const r0 = arcDeg(unit(lat, lon), C);
    const out = {}; const tmp = {};
    let swept = 0; let prev = null; let rMin = r0; let rMax = r0; let steps = 0; let wraps = 0;
    while (swept < 2 * Math.PI && steps < 2000) {
      if (useRk2) assert.ok(stepWind(f, lat, lon, k, out, tmp));
      else { assert.ok(sampleWind(f, lat, lon, tmp)); advectLatLon(lat, lon, tmp.u, tmp.v, k, out); }
      if (out.wrapped) wraps += 1;
      lat = out.lat; lon = out.lon; steps += 1;
      const r = arcDeg(unit(lat, lon), C); rMin = Math.min(rMin, r); rMax = Math.max(rMax, r);
      let dl = lon - 180; dl -= Math.round(dl / 360) * 360;
      const ang = Math.atan2(lat - 30, dl * Math.cos(30 * D2R));
      if (prev !== null) { let d = ang - prev; d -= Math.round(d / (2 * Math.PI)) * 2 * Math.PI; swept += d; }
      prev = ang;
    }
    return { r0, rEnd: arcDeg(unit(lat, lon), C), rMin, rMax, steps, swept, wraps };
  };
  const rk2 = run(true);
  assert.ok(rk2.swept >= 2 * Math.PI, `한 바퀴를 못 돌았다 (${rk2.swept} rad · ${rk2.steps}걸음)`);   // 양수 = 반시계(북반구 저기압)
  assert.ok(rk2.steps < 120, `걸음 ${rk2.steps} — 실제 걸음 크기로 돌린 것이 아니다`);
  assert.ok(rk2.wraps >= 2, '중심이 날짜변경선 위인데 한 바퀴에 두 번 넘지 않았다');
  assert.ok((rk2.rMax - rk2.r0) / rk2.r0 < 0.01 && (rk2.r0 - rk2.rMin) / rk2.r0 < 0.01,
    `반지름 ${rk2.r0} → [${rk2.rMin}, ${rk2.rMax}]`);
  // 같은 걸음의 오일러 — 이 엔진이 v1 방식을 그대로 옮기지 않은 이유.
  const euler = run(false);
  assert.ok((euler.rEnd - euler.r0) / euler.r0 > 0.2, `오일러 반지름 ${euler.r0} → ${euler.rEnd}`);
});

test('두 프레임 시간 보간 — mix 0 은 앞, 1 은 뒤, 0.5 는 가운데다', () => {
  const dataB = frame(() => [-20, 6]);
  const spec = { w: W, h: H, dataA: EAST10, dataB, decode: DECODE };
  const out = {};
  const at = (mix) => { sampleWind(createWindField({ ...spec, mix }), 12.3, 45.6, out); return { ...out }; };
  assert.ok(Math.abs(at(0).u - 10) < QUANT && Math.abs(at(0).v) < QUANT);
  assert.ok(Math.abs(at(1).u + 20) < QUANT && Math.abs(at(1).v - 6) < QUANT);
  assert.ok(Math.abs(at(0.5).u + 5) < QUANT && Math.abs(at(0.5).v - 3) < QUANT);
  assert.ok(Math.abs(at(0.25).u - 2.5) < QUANT);
  // 뒤 프레임이 없으면 mix 가 있어도 앞 프레임 그대로다. 프레임을 다시 넣지 않고 setMix 만으로 움직인다.
  sampleWind(createWindField({ w: W, h: H, dataA: EAST10, decode: DECODE, mix: 0.7 }), 0, 0, out);
  assert.ok(Math.abs(out.u - 10) < QUANT);
  const sim = new WindParticleSim({ maxParticles: 1 });
  sim.setField(spec); sim.setMix(1);
  sampleWind(sim.field, 0, 0, out);
  assert.ok(Math.abs(out.u + 20) < QUANT);
  // 뒤 프레임이 빈 그림이면 앞 프레임으로 대신 그리지 않는다.
  assert.equal(sampleWind(createWindField({ ...spec, dataB: new Uint8Array(W * H * 3), mix: 0.5 }), 0, 0, out), null);
});

test('디코드 상수 — 같은 바이트라도 상수가 바뀌면 속도가 바뀐다 (엔진이 상수를 속에 박아 두지 않았다)', () => {
  const a = createWindField({ w: W, h: H, dataA: EAST10, decode: DECODE });
  const b = createWindField({ w: W, h: H, dataA: EAST10, decode: { scale: DECODE.scale * 2, offset: DECODE.offset * 2 } });
  const oa = {}; const ob = {};
  stepWind(a, 0, 0, 0.01, oa); stepWind(b, 0, 0, 0.01, ob);
  assert.ok(Math.abs(ob.speed / oa.speed - 2) < 1e-6, `속도 비 ${ob.speed / oa.speed}`);
  assert.ok(Math.abs(ob.lon / oa.lon - 2) < 1e-6, `이동 비 ${ob.lon / oa.lon}`);
});

test('구면 균일 분포 — 위도대별 개수가 cos 위도(띠 면적)에 비례한다. 위도 균일이면 극에 몰린다', () => {
  const rnd = lcg(20260920);
  const N = 200000;
  const bands = new Array(18).fill(0);   // 10° 띠
  const out = {};
  const any = unit(30, 20);                          // 축은 단위 벡터여야 한다
  for (let i = 0; i < N; i += 1) {
    spawnInCap(rnd, any.x, any.y, any.z, -1, out);   // 캡 = 구 전체
    assert.ok(Math.abs(Math.hypot(out.x, out.y, out.z) - 1) < 1e-9);
    bands[Math.min(17, Math.floor((out.lat + 90) / 10))] += 1;
  }
  for (let b = 0; b < 18; b += 1) {
    const lo = -90 + b * 10;
    const expect = (N * (Math.sin((lo + 10) * D2R) - Math.sin(lo * D2R))) / 2;
    assert.ok(Math.abs(bands[b] - expect) < expect * 0.06 + 40, `위도 ${lo}~${lo + 10}: ${bands[b]} (면적 비례 ${expect.toFixed(0)})`);
  }
  // 위도를 균일하게 뽑았다면 극 띠(80~90)가 적도 띠만큼 찬다 — 면적 비례에서는 1/11 이다.
  assert.ok(bands[17] < bands[9] * 0.12, `극 띠 ${bands[17]} · 적도 띠 ${bands[9]}`);

  // 캡: 전부 캡 안에 있고, 캡 안에서도 면적 균일 — 반각 30° 안에 드는 비율 = (1−cos30)/(1−cos70).
  const ax = unit(36.5, 127.8); const cosCap = Math.cos(70 * D2R);
  let inner = 0;
  for (let i = 0; i < 50000; i += 1) {
    spawnInCap(rnd, ax.x, ax.y, ax.z, cosCap, out);
    const d = out.x * ax.x + out.y * ax.y + out.z * ax.z;
    assert.ok(d >= cosCap - 1e-9, `캡 밖: ${Math.acos(d) * R2D}°`);
    if (d >= Math.cos(30 * D2R)) inner += 1;
    const back = unit(out.lat, out.lon);
    assert.ok(Math.hypot(back.x - out.x, back.y - out.y, back.z - out.z) < 1e-9, '위경도와 벡터가 다른 점이다');
  }
  const expectInner = (1 - Math.cos(30 * D2R)) / (1 - cosCap);
  assert.ok(Math.abs(inner / 50000 - expectInner) < 0.01, `안쪽 비율 ${inner / 50000} (기대 ${expectInner})`);
});

test('결측 — 빈 프레임(0,0)·NaN·결측 표식(128) 위의 입자는 그 바람을 타지 않고 다시 뿌려진다', () => {
  const out = {};
  // (0,0) 바이트를 그대로 풀면 남서풍 90 m/s 다. 그렇게 읽지 않는다.
  const half = fieldOf((lat, lon) => (lon < 0 ? [10, 0] : null));
  assert.equal(sampleWind(createWindField(half), 0, 90, out), null);
  assert.ok(sampleWind(createWindField(half), 0, -90, out));

  const sim = new WindParticleSim({ maxParticles: 600, random: lcg(3) });
  sim.setField(half); sim.setView(VIEW);
  const cam = camAt(0, 0, 3.0);     // 시야의 절반이 빈 자료다
  let moving = 0;
  for (let i = 0; i < 90; i += 1) sim.step(1 / 30, cam);
  let inBlank = 0;
  for (let p = 0; p < sim.count; p += 1) {
    const head = segOf(sim, sim.head, p);
    if (sim.lon[p] >= 0.5 && sim.lon[p] < 179.5) {
      inBlank += 1;
      // 빈 쪽에 있는 입자는 방금 뿌려진 것뿐이다 — 선분이 점이고(안 그려진다) 다음 프레임에 또 옮겨진다.
      assert.equal(head.chord, 0, `입자 ${p}: 빈 자료 위에서 ${head.chord} 만큼 움직였다`);
      assert.equal(head.fade, 0);
    } else if (head.chord > 0) moving += 1;
  }
  assert.ok(inBlank > 0 && moving > 100, `빈 쪽 ${inBlank} · 자료 쪽에서 흐르는 입자 ${moving}`);
  // 어떤 선분도 (−64, −64) 를 타지 않았다.
  for (let o = 3; o < sim.seg.length; o += SEG_FLOATS) assert.ok(sim.seg[o] < 11, `선분 풍속 ${sim.seg[o]}`);

  // NaN 디코드 상수 → 전부 결측. 버퍼에 NaN 이 새지 않는다.
  const nan = new WindParticleSim({ maxParticles: 50, random: lcg(5) });
  nan.setField({ w: W, h: H, dataA: EAST10, decode: { scale: NaN, offset: 0 } });
  for (let i = 0; i < 5; i += 1) nan.step(1 / 30, cam);
  assert.equal(nan.respawnsLast, nan.count);
  assert.ok(nan.seg.every(Number.isFinite) && nan.lat.every(Number.isFinite));

  // 인코더의 결측 표식은 128 이다(= +0.25 m/s · 정확한 0 m/s 도 128). 흐름이 없으니 그릴 것도 없다.
  const calm = new WindParticleSim({ maxParticles: 50, random: lcg(6) });
  calm.setField({ w: W, h: H, dataA: new Uint8Array(W * H * 3).fill(128), decode: DECODE });
  sampleWind(calm.field, 10, 10, out);
  assert.ok(Math.hypot(out.u, out.v) < WIND_CALM_MS);
  for (let i = 0; i < 30; i += 1) calm.step(1 / 30, cam);
  assert.equal(calm.respawnsLast, calm.count);
  for (let s = 0; s < calm.slots; s += 1) for (let p = 0; p < calm.count; p += 1) assert.equal(segOf(calm, s, p).chord, 0);
});

test('카메라 뒤편 — 시야가 지구 반대쪽으로 가면 한 프레임에 전부 앞쪽 캡으로 옮겨진다. 자동 회전 중에도 수가 유지된다', () => {
  const sim = new WindParticleSim({ maxParticles: 800, random: lcg(9) });
  sim.setField({ w: W, h: H, dataA: EAST10, decode: DECODE }); sim.setView(VIEW);
  const inCap = (cam) => {
    const d = Math.hypot(cam.x, cam.y, cam.z);
    const ax = { x: cam.x / d, y: cam.y / d, z: cam.z / d };
    const limit = visibleCapAngle(d, sim.radius, 48, 1.6) * 1.15 * R2D + 1;
    for (let p = 0; p < sim.count; p += 1) {
      const a = arcDeg(unit(sim.lat[p], sim.lon[p]), ax);
      assert.ok(a <= limit, `입자 ${p}: 시야 축에서 ${a}° (한계 ${limit}°)`);
    }
  };
  for (let i = 0; i < 30; i += 1) sim.step(1 / 30, camAt(36.5, 127.8, 3.0));
  inCap(camAt(36.5, 127.8, 3.0));
  const n = sim.count;
  sim.step(1 / 30, camAt(-36.5, -52.2, 3.0));          // 정반대
  assert.equal(sim.respawnsLast, n);
  inCap(camAt(-36.5, -52.2, 3.0));
  // 옮겨진 프레임에 옛 자리와 새 자리를 잇는 선분이 없다.
  for (let p = 0; p < n; p += 1) assert.equal(segOf(sim, sim.head, p).chord, 0);
  // main.js 자동 회전 0.02 rad/s 로 60초 — 뒤로 넘어간 입자가 앞에서 다시 나온다.
  for (let i = 0; i < 1800; i += 1) {
    const cam = camAt(20, -52.2 + (i / 30) * 0.02 * R2D, 3.0);
    sim.step(1 / 30, cam);
    if (i % 300 === 299) { inCap(cam); assert.equal(sim.count, n); }
  }
  // 줌인하면 캡이 좁아진다 — 같은 수가 좁은 시야 안에 들어가 화면 픽셀당 밀도가 유지된다.
  const near = camAt(36.5, 127.8, 1.2);
  assert.ok(visibleCapAngle(1.2, sim.radius, 48, 1.6) < visibleCapAngle(3.0, sim.radius, 48, 1.6) / 4);
  sim.step(1 / 30, near); sim.step(1 / 30, near);
  inCap(near);
  assert.equal(sim.count, n);
  // 틸트(카메라가 천저를 안 본다)면 시야가 천저 둘레로 대칭이 아니다 — 지평선 캡 전체를 쓴다.
  assert.ok(visibleCapAngle(1.2, sim.radius, 48, 1.6, true) > visibleCapAngle(1.2, sim.radius, 48, 1.6));
  assert.ok(Math.abs(visibleCapAngle(1.2, sim.radius, 48, 1.6, true) - Math.acos(sim.radius / 1.2)) < 1e-9);
});

test('줌 정규화 — 같은 바람은 어느 줌에서도 같은 화면 속도(CSS px/s)로 흐른다', () => {
  const pxPerSec = (dist) => {
    const cam = camAt(0, 0, dist);
    const sim = pinnedSim({ w: W, h: H, dataA: EAST10, decode: DECODE }, 0, 0, cam);
    for (let i = 0; i < 30; i += 1) sim.step(1 / 30, cam);
    assert.equal(sim.respawnsLast, 0);
    return { px: sim.lon[0] / degPerCssPx(dist, sim.radius, 48, 900), deg: sim.lon[0] };
  };
  const far = pxPerSec(3.0); const mid = pxPerSec(1.8); const near = pxPerSec(1.1);
  const expect = WIND_SCREEN_PX_PER_S_PER_MS * (byteOf(10) * DECODE.scale + DECODE.offset);
  for (const r of [far, mid, near]) assert.ok(Math.abs(r.px - expect) < 0.05, `${r.px} px/s (기대 ${expect})`);
  // 지표에서 간 각은 줌에 따라 20배 다르다 — 정규화가 없으면 전지구 뷰에서만 점이 된다(v1 09-08).
  assert.ok(far.deg / near.deg > 15, `${far.deg}° · ${near.deg}°`);
  // 선형이다: 두 배 센 바람은 두 배 빠르다(범례가 '상대 세기'를 약속한다).
  const cam = camAt(0, 0, 3.0);
  const twice = pinnedSim({ w: W, h: H, dataA: frame(() => [20, 0]), decode: DECODE }, 0, 0, cam);
  for (let i = 0; i < 30; i += 1) twice.step(1 / 30, cam);
  assert.ok(Math.abs(twice.lon[0] / far.deg - (byteOf(20) * DECODE.scale + DECODE.offset) / (byteOf(10) * DECODE.scale + DECODE.offset)) < 1e-3);
  // 멀리 물러나면 천장에 묶인다 — 같은 화면 속도가 초당 수십 도가 되지 않게.
  assert.equal(degPerCssPx(7.0, 1.0012, 48, 900), WIND_DEG_PER_PX_MAX);
  assert.ok(Math.abs(degPerCssPx(3.0, 1.0012, 48, 900) - 0.1132) < 0.0005);
  // 화면이 작으면(폰 세로 812) 1px 이 더 큰 각이다 — CSS px 기준이라 DPR 은 식에 없다.
  assert.ok(degPerCssPx(3.0, 1.0012, 48, 812) > degPerCssPx(3.0, 1.0012, 48, 900));
});

test('꼬리 길이는 프레임 수가 아니라 시간이다 — 30fps 와 60fps 의 꼬리가 같고, 점이 아니라 선이다', () => {
  const trail = (fps) => {
    const cam = camAt(0, 10, 3.0);
    const sim = pinnedSim({ w: W, h: H, dataA: EAST10, decode: DECODE }, 0, 0, cam);
    let commits = 0;
    for (let i = 0; i < fps * 4; i += 1) if (sim.step(1 / fps, cam).committed) commits += 1;
    let len = 0;
    for (let s = 0; s < sim.slots; s += 1) len += segOf(sim, s).chord;
    return { commits, deg: (len / sim.radius) * R2D, phase: sim.phase };
  };
  const a = trail(30); const b = trail(60);
  assert.ok(Math.abs(a.commits - 4 / (WIND_TRAIL_SECONDS / WIND_TRAIL_SEGMENTS)) <= 1, `4초에 슬롯 넘김 ${a.commits}회`);
  assert.ok(Math.abs(a.commits - b.commits) <= 1, `30fps ${a.commits} · 60fps ${b.commits}`);
  const degPerSec = 10.04 * WIND_SCREEN_PX_PER_S_PER_MS * degPerCssPx(3.0, 1.0012, 48, 900);
  for (const t of [a, b]) {
    // 12칸 중 머리 한 칸은 자라는 중이다: 꼬리 = (11 + phase) 칸 × 0.2초.
    const expect = degPerSec * (WIND_TRAIL_SECONDS / WIND_TRAIL_SEGMENTS) * (WIND_TRAIL_SEGMENTS - 1 + t.phase);
    assert.ok(Math.abs(t.deg - expect) < expect * 0.02, `꼬리 ${t.deg}° (기대 ${expect}°)`);
  }
  // 10 m/s 의 꼬리가 80 CSS px 쯤이다. 프레임마다 슬롯을 넘겼다면 12프레임 = 0.4초 = 14px — 점이다.
  const px = a.deg / degPerCssPx(3.0, 1.0012, 48, 900);
  assert.ok(px > 70 && px < 90, `꼬리 ${px} CSS px`);
});

test('입자 수 = min(기기 예산, CSS 픽셀 밀도, 버퍼) × 단계/3 — 장치픽셀은 어디에도 없다', () => {
  // 숫자를 박지 않는다 — 밀도(WIND_DENSITY_CSS_PX)는 v2 화면을 보고 조정하는 값이다(2026-09-20 에 460 → 230). 지킬 것은 '식'이다:
  // CSS 픽셀 면적 ÷ 밀도, 장치픽셀은 어디에도 없다.
  assert.equal(FULL_1440, Math.round((1440 * 900) / WIND_DENSITY_CSS_PX));
  assert.equal(particleBudgetFor(375, 812), Math.round((375 * 812) / WIND_DENSITY_CSS_PX));
  assert.equal(particleBudgetFor(1440, 900, 460), 2817, '밀도를 넘기면 그 밀도로 센다');
  assert.ok(particleBudgetFor(375, 812) <= 5000, '폰 상한(지시서 W3: 폰 ≤ 5,000)을 밀도만으로도 넘지 않는다');
  assert.equal(particleBudgetFor(0, 900), 0);
  assert.equal(particleCountFor(5000, 3), 5000);
  assert.equal(particleCountFor(5000, 2), 3333);
  assert.equal(particleCountFor(5000, 1), 1666);
  assert.equal(particleCountFor(18000, 3, 5000), 5000);      // 버퍼가 천장
  assert.equal(particleCountFor(0, 3), 0);
  const sim = new WindParticleSim({ maxParticles: 5000 });
  assert.equal(sim.targetCount(), 0, '자료가 없으면 입자도 없다');
  sim.setField({ w: W, h: H, dataA: EAST10, decode: DECODE });
  assert.equal(sim.targetCount(), 5000);
  sim.setView(VIEW);
  assert.equal(sim.targetCount(), Math.min(5000, FULL_1440));
  sim.setBudget(1500);
  assert.equal(sim.targetCount(), 1500);
  sim.setIntensity(1);
  assert.equal(sim.targetCount(), 500);
});

test('구간 — 경계 1·5·10·20·30·40·50 m/s, 경계값은 위 칸이다. 색은 8개를 주입받는다', () => {
  assert.deepEqual([...WIND_SPEED_BOUNDS_MS], [1, 5, 10, 20, 30, 40, 50]);
  assert.deepEqual([0, 0.99, 1, 4.99, 5, 10, 19.9, 20, 30, 40, 49.9, 50, 80].map((v) => windSpeedBand(v)),
    [0, 0, 1, 1, 2, 3, 3, 4, 5, 6, 6, 7, 7]);
  assert.equal(WIND_SPEED_COLORS_TEMP.length, 8);
  const wind = new WindParticles({ maxParticles: 10 });
  assert.equal(wind.uniforms.uColors.value.length, 8);
  assert.deepEqual(wind.uniforms.uBounds.value, [1, 5, 10, 20, 30, 40, 50]);
  // 기본은 흰색(색면이 켜져 있다고 본다). 색면이 꺼지면 입자가 구간색을 맡는다.
  assert.equal(wind.uniforms.uWhite.value, 1);
  wind.setColorMode('speed');
  assert.equal(wind.uniforms.uWhite.value, 0);
  wind.setColorMode('white');
  assert.equal(wind.uniforms.uWhite.value, 1);
  const before = wind.uniforms.uColors.value[3].getHex();
  wind.setSpeedColors(['#000000', '#111111', '#222222', '#ff0000', '#444444', '#555555', '#666666', [0, 1, 0]]);
  assert.notEqual(wind.uniforms.uColors.value[3].getHex(), before);
  assert.equal(wind.uniforms.uColors.value[3].getHex(), 0xff0000);
  assert.equal(wind.uniforms.uColors.value[7].getHex(), 0x00ff00);
  assert.throws(() => wind.setSpeedColors(['#fff']), /8/);
});

test('그리기 — 물체 하나(드로우콜 1), 예산을 줄이면 그리는 정점 수가 준다. 버퍼는 다시 잡지 않는다', () => {
  // 버퍼(MAXP)가 밀도보다 커야 'min(버퍼, 밀도) = 밀도'를 본다 — 밀도가 바뀌어도 성립하게 밀도에서 셈한다.
  const MAXP = FULL_1440 + 183;
  const wind = new WindParticles({ maxParticles: MAXP, random: lcg(21) });
  const scene = new THREE.Scene();
  scene.add(wind.object);
  const objs = []; scene.traverse((o) => { if (o !== scene) objs.push(o); });
  assert.equal(objs.length, 1);
  assert.ok(wind.object.isMesh && !wind.object.isPoints && !wind.object.isLine, wind.object.type);
  assert.ok(wind.geometry.isInstancedBufferGeometry);
  assert.equal(wind.object.frustumCulled, false);
  assert.equal(wind.material.transparent, true);
  assert.equal(wind.material.depthWrite, false);
  const cam = camAt(36.5, 127.8, 3.0);

  // 자료가 없으면 아무것도 그리지 않는다.
  wind.update(1 / 30, cam);
  assert.equal(wind.geometry.instanceCount, 0);
  assert.equal(wind.object.visible, false);

  wind.setField({ w: W, h: H, dataA: EAST10, decode: DECODE });
  wind.setView(VIEW);
  assert.deepEqual(wind.uniforms.uViewport.value.toArray(), [1440, 900]);
  const gpu = wind.gpu; const bytes = wind.gpu.byteLength;
  const drawn = () => { wind.update(1 / 30, cam); return wind.stats(); };

  let s = drawn();
  assert.equal(s.particles, FULL_1440);                 // min(버퍼 MAXP, 밀도 FULL_1440)
  assert.equal(wind.geometry.instanceCount, FULL_1440 * WIND_TRAIL_SEGMENTS);
  assert.equal(s.drawnVertices, FULL_1440 * WIND_TRAIL_SEGMENTS * 4);
  assert.equal(s.drawCalls, 1);
  assert.equal(wind.object.visible, true);

  wind.setBudget(900);
  s = drawn();
  assert.equal(s.particles, 900);
  assert.equal(wind.geometry.instanceCount, 900 * WIND_TRAIL_SEGMENTS);
  assert.equal(s.drawnVertices, 900 * WIND_TRAIL_SEGMENTS * 4);
  wind.setIntensity(1);
  assert.equal(drawn().drawnVertices, 300 * WIND_TRAIL_SEGMENTS * 4);
  wind.setIntensity(2);
  assert.equal(drawn().drawnVertices, 600 * WIND_TRAIL_SEGMENTS * 4);
  wind.setBudget(0);                                    // 발열 SAFE — 입자 0
  wind.buffer.clearUpdateRanges();
  const versionBefore = wind.buffer.version;
  assert.equal(drawn().drawnVertices, 0);
  assert.equal(wind.object.visible, false);
  // 입자 0 이 되는 프레임에 아무것도 올리지 않는다 — 범위 없이 needsUpdate 만 켜면 three 는 버퍼 전체를 올린다.
  assert.equal(wind.buffer.version, versionBefore);
  assert.equal(wind.buffer.updateRanges.length, 0);
  assert.equal(wind.stats().uploadBytes, 0);
  wind.setBudget(MAXP); wind.setIntensity(3);
  assert.equal(drawn().particles, FULL_1440);
  assert.equal(wind.gpu, gpu);
  assert.equal(wind.gpu.byteLength, bytes);
  assert.equal(bytes, MAXP * WIND_TRAIL_SEGMENTS * SEG_FLOATS * 4);

  // aSlot: 인스턴스 번호 = 슬롯 × 입자 수 + 입자.
  const slots = wind.slotAttr.array;
  assert.equal(slots[0], 0); assert.equal(slots[FULL_1440 - 1], 0); assert.equal(slots[FULL_1440], 1);
  assert.equal(slots[FULL_1440 * 11], 11); assert.equal(slots[FULL_1440 * 12 - 1], 11);

  wind.setVisible(false);
  wind.update(1 / 30, cam);
  assert.equal(wind.object.visible, false);

  // 같은 버퍼·같은 셰이더의 1px 선 — 폰에서 리본과 나란히 재 보기 위한 것.
  const line = new WindParticles({ maxParticles: 100, primitive: 'line', random: lcg(22) });
  assert.ok(line.object.isLineSegments);
  line.setField({ w: W, h: H, dataA: EAST10, decode: DECODE });
  line.update(1 / 30, cam);
  assert.equal(line.stats().drawnVertices, 100 * WIND_TRAIL_SEGMENTS * 2);
  wind.dispose(); line.dispose();
  assert.equal(scene.children.length, 0);
});

test('프레임당 올리는 것은 머리 슬롯 한 블록뿐이고, 그렇게 고쳐 온 GPU 배열은 원본에서 통째로 다시 만든 것과 같다', () => {
  const wind = new WindParticles({ maxParticles: 1200, random: lcg(31) });
  // 저기압 + 빈 구역 — 다시 뿌리기·슬롯 넘김·캡 밖 이동이 다 섞이게.
  wind.setField(fieldOf((lat, lon) => (lat < -60 ? null : [25 * Math.sin(lon * D2R * 3), 25 * Math.cos(lat * D2R * 4)])));
  wind.setView(VIEW);
  const check = (label) => {
    const n = wind.sim.count;
    const full = new Float32Array(wind.gpu.length);
    const used = wind.sim.packInto(full);
    assert.equal(used, n * WIND_TRAIL_SEGMENTS * SEG_FLOATS);
    for (let i = 0; i < used; i += 1) {
      if (full[i] !== wind.gpu[i]) assert.fail(`${label}: GPU 배열 [${i}] = ${wind.gpu[i]}, 원본 ${full[i]}`);
    }
  };
  let relayoutFrames = 0; let blockFrames = 0; let maxChord = 0; let drawnSegs = 0;
  for (let i = 0; i < 400; i += 1) {
    if (i === 150) wind.setBudget(700);           // 발열로 예산이 준다
    if (i === 250) wind.setIntensity(2);
    if (i === 320) wind.setBudget(1200);          // 다시 는다 — 새로 켜진 입자에 옛 선분이 되살아나면 안 된다
    const dt = i % 7 === 0 ? 1 / 20 : 1 / 60;     // 고르지 않은 프레임 시간
    const cam = camAt(10 + 40 * Math.sin(i / 50), i * 0.9, i > 200 ? 1.5 : 3.0);
    wind.buffer.clearUpdateRanges();               // 렌더러가 올리고 나면 비운다 — 그 자리를 흉내 낸다
    const before = wind.sim.count;
    wind.update(dt, cam);
    const n = wind.sim.count;
    if (i === 320) {
      // 꺼져 있던 입자가 다시 켜질 때, 170프레임 전에 그리던 옛 꼬리가 되살아나면 안 된다 — 머리 말고는 전부 점이다.
      assert.ok(n > before, `${before} → ${n}`);
      for (let p = before; p < n; p += 1) {
        for (let sl = 0; sl < wind.sim.slots; sl += 1) {
          if (sl !== wind.sim.head) assert.equal(segOf(wind.sim, sl, p).chord, 0, `입자 ${p} 슬롯 ${sl}: 옛 선분이 되살아났다`);
        }
      }
    }
    const ranges = wind.buffer.updateRanges;
    assert.equal(ranges.length, 1, `프레임 ${i}: 올릴 범위가 ${ranges.length}개`);
    if (ranges[0].count === n * WIND_TRAIL_SEGMENTS * SEG_FLOATS && ranges[0].start === 0 && n > 0
        && (i === 0 || [150, 250, 320].includes(i))) {
      relayoutFrames += 1;
    } else {
      assert.equal(ranges[0].start, wind.sim.head * n * SEG_FLOATS, `프레임 ${i}`);
      assert.equal(ranges[0].count, n * SEG_FLOATS, `프레임 ${i}`);
      assert.equal(wind.stats().uploadBytes, n * SEG_FLOATS * 4);
      blockFrames += 1;
    }
    assert.ok(wind.stats().floatsWritten <= n * SEG_FLOATS);
    if (i % 40 === 39 || [150, 151, 250, 320, 321].includes(i)) check(`프레임 ${i}`);
    // 어떤 선분도 지구를 가로지르지 않는다 — 다시 뿌려진 입자의 옛 자리와 새 자리를 잇지 않았다.
    for (let o = 0; o < n * WIND_TRAIL_SEGMENTS * SEG_FLOATS; o += SEG_FLOATS) {
      const g = wind.gpu;
      const c = Math.hypot(g[o + 4] - g[o], g[o + 5] - g[o + 1], g[o + 6] - g[o + 2]);
      if (c > maxChord) maxChord = c;
      if (i === 399 && c > 0) drawnSegs += 1;
    }
  }
  assert.equal(relayoutFrames, 4);                 // 첫 프레임 + 예산·단계가 바뀐 세 번
  assert.equal(blockFrames, 396);
  assert.equal(wind.stats().relayouts, 4);
  assert.ok(maxChord < WIND_MAX_CHORD * wind.sim.radius, `가장 긴 선분 ${maxChord}`);
  assert.ok(maxChord < 0.08, `가장 긴 선분 ${maxChord} — 35 m/s 의 0.2초 걸음보다 길다`);
  assert.ok(drawnSegs > wind.sim.count * 4, `그려지는 선분 ${drawnSegs} — 아무것도 흐르지 않는다`);
  // 렌더러가 한동안 안 그려도(숨김) 범위가 끝없이 쌓이지 않는다.
  for (let i = 0; i < 200; i += 1) wind.update(1 / 30, camAt(0, 0, 3));
  assert.ok(wind.buffer.updateRanges.length <= WIND_TRAIL_SEGMENTS + 1, `쌓인 범위 ${wind.buffer.updateRanges.length}`);
  check('숨김 뒤');
});

test('성능 — 입자 5,000 의 update() 와 계측(stats)', (t) => {
  const wind = new WindParticles({ maxParticles: 5000, random: lcg(41) });
  const dataB = frame((lat, lon) => [20 * Math.cos(lat * D2R) + 5 * Math.sin(lon * D2R * 2), 8 * Math.sin(lon * D2R * 3)]);
  wind.setField({ w: W, h: H, dataA: EAST10, dataB, mix: 0.4, decode: DECODE });   // 두 프레임 보간까지 켠 최악의 경로
  wind.setView({ fovDeg: 48, widthCss: 2560, heightCss: 1440 });                   // 밀도 예산 8,014 → 버퍼 5,000 이 천장
  for (let i = 0; i < 60; i += 1) wind.update(1 / 30, camAt(30, i * 0.04, 3.0));   // 데우기
  assert.equal(wind.stats().particles, 5000);
  let sum = 0; let max = 0;
  const N = 150;
  for (let i = 0; i < N; i += 1) {
    wind.buffer.clearUpdateRanges();
    wind.update(1 / 30, camAt(30, 2.4 + i * 0.04, 3.0));
    const ms = wind.stats().cpuMs;
    sum += ms; if (ms > max) max = ms;
  }
  const s = wind.stats();
  t.diagnostic(`입자 ${s.particles} × 선분 ${s.segmentsPerParticle} = 인스턴스 ${s.instances} · 정점 ${s.drawnVertices} · 삼각형 ${s.drawnTriangles}`);
  t.diagnostic(`프레임당 float 쓰기 ≤ ${s.floatsWritten} · bufferSubData ${s.uploadBytes} B / 버퍼 ${s.bufferBytes} B`);
  t.diagnostic(`update() 평균 ${(sum / N).toFixed(3)} ms · 최대 ${max.toFixed(3)} ms (node ${process.version})`);
  assert.equal(s.instances, 60000);
  assert.equal(s.drawnVertices, 240000);
  assert.equal(s.floatsWritten, 40000);
  assert.equal(s.uploadBytes, 160000);
  assert.equal(s.bufferBytes, 1920000);
  assert.ok(s.cpuMs >= 0 && s.cpuMsMax >= s.cpuMs && s.cpuMsAvg > 0);
  assert.ok(s.capDeg > 60 && s.capDeg < 72 && s.viewKnown === true && s.frames === 210);
  // 30fps 프레임(33ms)의 1/4 을 넘으면 발열 예산을 혼자 먹는다. CI 가 느려도 떨어지지 않게 넉넉히 잡은 상한이다.
  assert.ok(sum / N < 8, `update() 평균 ${(sum / N).toFixed(2)} ms`);
});
