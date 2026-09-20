// DEV-DIRECTIVE 2026-09-20 · W3 배선 — 바람 층(prototype/v2-three/js/wind-layer.js)의 결과 시험.
//
// v2 의 '바람'은 관측소마다 선분 하나 위를 점 2개가 왕복하는 막대기였다. 입자 엔진은 만들어져 있었지만 아무 데도 이어져 있지 않았다.
// "막대기가 없다"만 시험하면 아무것도 안 그리는 층이 통과한다 — 여기서는 **이어 붙인 결과**를 잰다:
//   시각을 밀면 맞는 두 프레임의 픽셀을 청하고 같은 키프레임 안에서는 다시 청하지 않는다 · 두 프레임 사이 비율이 맞다 ·
//   끈 뒤에는 tick 이 아무것도 하지 않는다 · 프레임이 없으면 '자료 없음'(막대기로 물러나지 않는다) · 예보 범위 밖이면 멈춘다 ·
//   buildWind 가 돌려주는 것에 선분·선·왕복 점이 없다 · 합성 북반구 저기압에서 입자가 **반시계**로 돈다(행 0 = 북) ·
//   풍향 16방위가 '불어오는 쪽'이다 · 입자 색과 경계가 색 눈금표에서 온다 · 입자 강도 3단 · 폰 상한 5,000.
//
// 프레임 저장소는 가짜가 아니라 **진짜 저장소에 가짜 네트워크**를 꽂은 것이다(gfs-frames.test.mjs 와 같은 방식) — 저장소의 CPU 사본이
// 실제로 어떤 모양(쓰는 채널만 남긴 2채널)으로 입자 엔진에 들어가는지가 이 배선에서 가장 틀리기 쉬운 자리라서다.
// 시간 버스도 진짜다(시계만 고정). THREE 는 저장소의 r184 그대로 — 기하·속성·재질은 WebGL 없이 만들어진다.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import * as THREE from '../../prototype/vendor/three-r184.module.min.js';

import { createGfsFrames } from '../../prototype/v2-three/js/gfs-frames.js';
import { createTimeBus } from '../../prototype/v2-three/js/time-bus.js';
import { scaleOf } from '../../prototype/v2-three/js/field-scales.js';
import { legendView } from '../../prototype/v2-three/js/field-legend.js';
import { WIND_SPEED_COLORS_TEMP, particleBudgetFor, sampleWind } from '../../prototype/v2-three/js/wind-particles.js';
import {
  WIND_DEVICE_CAP,
  compass16,
  createWindLayer,
  nearestGridPoint,
  windBudget,
  windCardHtml,
  windDeviceCap,
  windFieldSpecOf,
  windFromDeg,
  windLimbLoFor,
  windRadiusFor,
  windReadoutModel,
} from '../../prototype/v2-three/js/wind-layer.js';
import { LiveLayers } from '../../prototype/v2-three/js/live-layers.js';

// ⚠️ 줄바꿈을 LF 로 맞춰 읽는다(core.autocrlf=true 워크트리는 CRLF 로 풀린다).
const lf = (s) => s.replace(/\r\n/g, '\n');
const read = (rel) => lf(readFileSync(new URL(rel, import.meta.url), 'utf8'));
const clone = (x) => JSON.parse(JSON.stringify(x));

const SCHEMA2 = JSON.parse(read('./fixtures/gfs-fc-manifest-schema2.json'));   // 운영 매니페스트에서 스텝만 줄인 사본(0·3·6·9·12 h)
const H = 3.6e6;
const T0 = Date.parse('2026-09-20T00:00:00Z');
const W = 720;
const NJ = 361;
const D2R = Math.PI / 180;

// aws/gfs-cloud-forecast/handler.py _wind10_byte 의 인코딩 식(매니페스트 fields.wind10 의 scale·offset 과 짝).
const byteOf = (ms) => Math.max(0, Math.min(255, Math.floor(((ms + 64) / 128) * 255 + 0.5)));

/** fn(lat, lon) → [u, v] m/s. 받은 그림의 모양 그대로: RGBA · 행 0 = 북위 90 · 열 0 = 서경 180 · R=u G=v B=0. */
function windImage(fn) {
  const rgba = new Uint8Array(W * NJ * 4);
  for (let j = 0; j < NJ; j += 1) {
    for (let i = 0; i < W; i += 1) {
      const [u, v] = fn(90 - j * 0.5, -180 + i * 0.5);
      const o = (j * W + i) * 4;
      rgba[o] = byteOf(u); rgba[o + 1] = byteOf(v); rgba[o + 2] = 0; rgba[o + 3] = 255;
    }
  }
  return { width: W, height: NJ, rgba };
}

const FakeTHREE = {
  RepeatWrapping: 1000, ClampToEdgeWrapping: 1001, LinearFilter: 1006, NoColorSpace: '', SRGBColorSpace: 'srgb',
  Texture: class { constructor(image) { this.image = image; } dispose() {} },
};

const hourOf = (url) => Number(/(\d{3})\.png/.exec(url)[1]);
const letterOf = (url) => /\/([a-z])\d{3}\.png/.exec(url)[1];

// 시간마다 다른 고른 바람 — 어느 프레임이 들어갔는지 값으로 알 수 있게.
const UNIFORM = { 0: [10, 0], 3: [0, 10], 6: [-10, 0], 9: [0, -10], 12: [20, 0] };
const uniformImages = (() => {
  const cache = new Map();
  return (url) => {
    if (letterOf(url) !== 'u') return null;
    const h = hourOf(url);
    if (!cache.has(h)) cache.set(h, windImage(() => UNIFORM[h]));
    return cache.get(h);
  };
})();

const DESKTOP_NAV = { userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)' };
const PHONE_NAV = { userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X)' };

/** 진짜 저장소 + 가짜 네트워크 + 진짜 시간 버스 + 진짜 입자 엔진. 층이 저장소에 무엇을 청했는지는 pixelCalls 에 남는다. */
function harness({ manifest = SCHEMA2, images = uniformImages, nowMs = T0 + 1 * H, nav = DESKTOP_NAV, view = { w: 1440, h: 900 }, extra = {}, storeOpts = {} } = {}) {
  const calls = { image: [], manifest: 0, pixels: [] };
  const clock = { now: nowMs };
  const state = { manifest, failManifest: false };
  const store = createGfsFrames({
    THREE: FakeTHREE,
    now: () => clock.now,
    fetch: async () => {
      calls.manifest += 1;
      if (state.failManifest) throw new Error('offline');
      return { ok: true, json: async () => clone(state.manifest) };
    },
    loadImage: async (url) => {
      calls.image.push(url);
      await new Promise((r) => setTimeout(r, 1));
      const img = images(url);
      if (!img) throw new Error('404');
      return img;
    },
    readPixels: (img) => ({ w: img.width, h: img.height, data: img.rgba }),
    ...storeOpts,
  });
  // 층이 저장소에 청한 픽셀만 센다(저장소 안의 캐시 적중과는 다른 숫자다 — '다시 청하지 않는다'는 층의 약속이다).
  const frames = Object.create(store);
  frames.pixels = (id, h) => { calls.pixels.push(`${id}:${h}`); return store.pixels(id, h); };

  const bus = createTimeBus({ now: () => clock.now });
  const legendLog = [];
  const legend = {
    el: null,
    show(args) { legendLog.push({ op: 'show', args: { ...args } }); this.el = { children: [{ textContent: args.title.ko }] }; return args; },
    hide() { legendLog.push({ op: 'hide' }); },
  };
  const parent = new THREE.Group();
  const sw = { on: false, particleScale: 1 };
  const layer = createWindLayer({
    frames, timeBus: bus, legend, parent, nav, storage: null,
    isOn: () => sw.on,
    particleScale: () => sw.particleScale,
    viewport: (o) => { o.w = view.w; o.h = view.h; },
    ...extra,
  });
  return { layer, store, frames, bus, calls, clock, state, legend, legendLog, parent, sw, view };
}

const camAt = (lat, lon, dist = 3) => {
  const la = lat * D2R; const lo = lon * D2R; const c = Math.cos(la);
  return {
    fov: 48,
    position: { x: dist * c * Math.sin(lo), y: dist * Math.sin(la), z: dist * c * Math.cos(lo) },
    matrixWorld: null,       // 시선 방향을 모른다 → 엔진은 천저를 본다고 친다
  };
};
const CAM = camAt(20, 130);
const fieldOf = (layer) => layer.particles.sim.field;
const windAt = (layer, lat, lon) => sampleWind(fieldOf(layer), lat, lon, { u: 0, v: 0 });

// ---------------------------------------------------------------- 키프레임 · mix

test('시각을 밀면 맞는 두 프레임의 픽셀을 청하고, 같은 키프레임 안에서는 다시 청하지 않는다 — mix 가 맞다', async () => {
  const hz = harness();                                   // '지금' = 런 + 1시간 → f000 과 f003 사이 1/3
  await hz.layer.load();
  // 키프레임 두 장 + **다음 한 장**(2026-09-20 작업 E3 ①). 넣은 뒤 바로 앞 장을 미리 청한다 —
  // 재생이 구간을 넘을 때 끊기지 않게. 색면(field-layer.prefetchAfter)이 이미 그렇게 한다.
  assert.deepEqual(hz.calls.pixels, ['wind10:0', 'wind10:3', 'wind10:6']);
  assert.deepEqual(hz.calls.image.map((u) => `${letterOf(u)}${hourOf(u)}`), ['u0', 'u3', 'u6'], '바람 프레임(+ 미리 받는 다음 한 장) 말고 다른 것을 받는다(구름·기온은 받지 않는다)');
  assert.ok(Math.abs(fieldOf(hz.layer).mix - 1 / 3) < 1e-9);
  // 저장소의 CPU 사본이 그대로 들어간다(2채널 — 복사하지 않는다).
  assert.equal(fieldOf(hz.layer).stride, 2);
  assert.equal(fieldOf(hz.layer).dataA, hz.store.pixelsNow('wind10', 0).data);
  assert.equal(fieldOf(hz.layer).dataB, hz.store.pixelsNow('wind10', 3).data);
  // 값으로도 확인: f000 = 동쪽으로 10 · f003 = 북쪽으로 10 → 1/3 지점은 (6.67, 3.33).
  const w0 = windAt(hz.layer, 37.5, 127);
  assert.ok(Math.abs(w0.u - 20 / 3) < 0.3 && Math.abs(w0.v - 10 / 3) < 0.3, `${w0.u}, ${w0.v}`);

  hz.sw.on = true;
  hz.layer.tick(1 / 30, CAM);                             // 켜짐 → 시간 버스를 듣기 시작한다(바로 한 번 불린다)
  assert.equal(hz.bus.listeners(), 1);
  assert.deepEqual(hz.calls.pixels, ['wind10:0', 'wind10:3', 'wind10:6'], '켜는 순간 같은 두 장을 또 청했다');

  hz.bus.set(1 * H);                                      // 유효 = 런 + 2시간 → 같은 두 프레임 · 2/3
  hz.bus.set(1.5 * H);                                    // 같은 두 프레임 · 5/6
  assert.deepEqual(hz.calls.pixels, ['wind10:0', 'wind10:3', 'wind10:6'], '같은 키프레임 안에서 픽셀을 다시 청했다');
  assert.ok(Math.abs(fieldOf(hz.layer).mix - 2.5 / 3) < 1e-9);

  hz.bus.set(3.5 * H);                                    // 유효 = 런 + 4.5시간 → f003 과 f006 사이 1/2
  await hz.layer.settled();
  assert.deepEqual(hz.calls.pixels, ['wind10:0', 'wind10:3', 'wind10:6', 'wind10:3', 'wind10:6', 'wind10:9']);
  assert.equal(hz.calls.image.filter((u) => hourOf(u) === 3).length, 1, 'f003 그림을 두 번 받았다(저장소 캐시를 안 탔다)');
  assert.equal(fieldOf(hz.layer).dataA, hz.store.pixelsNow('wind10', 3).data);
  assert.equal(fieldOf(hz.layer).dataB, hz.store.pixelsNow('wind10', 6).data);
  assert.ok(Math.abs(fieldOf(hz.layer).mix - 0.5) < 1e-9);
  const w1 = windAt(hz.layer, -20, -60);
  assert.ok(Math.abs(w1.u + 5) < 0.3 && Math.abs(w1.v - 5) < 0.3, `${w1.u}, ${w1.v}`);

  hz.bus.set(5 * H);                                      // 유효 = 정확히 f006 — 한 장만 청한다(+ 다음 한 장 미리)
  await hz.layer.settled();
  assert.deepEqual(hz.calls.pixels.slice(6), ['wind10:6', 'wind10:9']);
  assert.equal(fieldOf(hz.layer).dataB, null);
  assert.equal(hz.layer.state().status, 'ready');
});

test("'지금'은 흐른다 — 오프셋이 그대로여도 1분마다 비율을 다시 잰다(픽셀은 다시 청하지 않는다)", async () => {
  const hz = harness();
  await hz.layer.load();
  hz.sw.on = true;
  hz.layer.tick(1 / 30, CAM);
  const before = fieldOf(hz.layer).mix;
  hz.clock.now += 30 * 60 * 1000;                         // 30분이 지났다 — 타임라인은 아무도 안 만졌다
  for (let i = 0; i < 700; i += 1) hz.layer.tick(0.1, CAM);   // 70초어치 프레임
  assert.ok(Math.abs(fieldOf(hz.layer).mix - (before + 0.5 / 3)) < 1e-9, `${before} → ${fieldOf(hz.layer).mix}`);
  assert.deepEqual(hz.calls.pixels, ['wind10:0', 'wind10:3', 'wind10:6'], '켤 때의 미리 받기 말고 더 청했다');
});

test('빠른 스크럽 — 늦게 온 옛 응답이 새 키프레임을 덮지 않는다', async () => {
  const hz = harness();
  await hz.layer.load();
  hz.sw.on = true;
  hz.layer.tick(1 / 30, CAM);
  hz.bus.set(3.5 * H);                                    // f003↔f006 을 청해 놓고
  hz.bus.set(9.5 * H);                                    // 그것이 오기 전에 f009↔f012 로
  await hz.layer.settled();
  await new Promise((r) => setTimeout(r, 10));            // 옛 응답까지 다 도착하게
  assert.equal(fieldOf(hz.layer).dataA, hz.store.pixelsNow('wind10', 9).data);
  assert.equal(fieldOf(hz.layer).dataB, hz.store.pixelsNow('wind10', 12).data);
  assert.ok(Math.abs(fieldOf(hz.layer).mix - 0.5) < 1e-9);
  assert.match(hz.layer.state().key, /\|9\|12$/);
});

// 위 시험은 두 응답이 청한 순서대로 오는 자리라, 옛 장이 먼저 도착해 잠깐 깔렸다가 새 장이 덮어도 끝 그림은 같다.
// 여기서는 순서를 **뒤집어** 놓고 본다: 새 장이 먼저 들어간 뒤 옛 장이 오면 그것은 떨어져야 한다(거리가 더 멀다).
test('늦게 온 옛 장이 이미 들어간 새 장을 덮지 않는다 — 순서를 뒤집어 놓고 본다', async () => {
  const slow = new Set([6]);                              // f006(옛 구간의 뒷장)만 늦게 온다
  const hz = harness({
    storeOpts: {
      loadImage: async (url) => {
        const h = hourOf(url);
        await new Promise((r) => setTimeout(r, slow.has(h) ? 60 : 1));
        if (letterOf(url) !== 'u') throw new Error('404');
        return windImage(() => UNIFORM[h]);
      },
    },
  });
  await hz.layer.load();
  hz.sw.on = true;
  hz.layer.tick(1 / 30, CAM);
  hz.bus.set(3.5 * H);                                    // f003↔f006 을 청해 놓고 (f006 이 늦다)
  hz.bus.set(9.5 * H);                                    // 그것이 오기 전에 f009↔f012 로 (이쪽이 먼저 들어간다)
  await hz.layer.settled();
  assert.match(hz.layer.state().key, /\|9\|12$/, '새 구간이 먼저 들어가야 이 시험이 뜻이 있다');
  const sets = hz.layer.state().fieldSets;
  await new Promise((r) => setTimeout(r, 120));           // 늦은 f003↔f006 이 이제 도착한다
  assert.equal(hz.layer.state().fieldSets, sets, '늦은 옛 장이 새 장을 덮었다');
  assert.ok(hz.layer.state().lateDrops >= 1, '떨어뜨린 것이 세어지지 않았다');
  assert.match(hz.layer.state().key, /\|9\|12$/);
});

// 2026-09-20 작업 E3 ① — 재생 중에 늦게 온 장을 버리던 자리. 옛 규칙(청한 순서 seq)에서는 **한 장도** 안 들어갔다.
//   여기서는 금지가 아니라 결과를 잰다: 지연 800 ms · 220 ms 재생에서 **구간 수의 절반 이상**이 실제로 엔진에 들어가나.
//   시계는 진짜다(setTimeout) — 이 결함은 '응답이 오는 사이에 시각이 움직인다'는 경합 그 자체라 가짜 시계로는 재현되지 않는다.
const delay = (ms) => new Promise((r) => setTimeout(r, ms));

/** 스텝을 h=54 까지 늘린 매니페스트(고정본은 0·3·6·9·12 뿐 — 재생을 오래 돌릴 구간이 모자란다). */
const longManifest = () => {
  const m = clone(SCHEMA2);
  const last = m.steps[m.steps.length - 1];
  for (let h = last.h + 3; h <= 54; h += 3) {
    const s = clone(last);
    s.h = h;
    s.valid = new Date(T0 + h * H).toISOString().replace('.000Z', 'Z');
    for (const k of Object.keys(s)) {
      if (typeof s[k] === 'string' && /\d{3}\.png$/.test(s[k])) s[k] = s[k].replace(/\d{3}\.png$/, `${String(h).padStart(3, '0')}.png`);
    }
    m.steps.push(s);
  }
  return m;
};

test('재생 — 늦게 온 장도 지금 시각에 더 가까우면 넣는다(지연 800 ms · 220 ms 재생)', async () => {
  const LATENCY = 800;
  const PLAY_MS = 220;
  const STEPS = 16;                                       // 한 칸 = 한 스텝(3시간) → 칸마다 구간이 바뀐다
  // 그림은 **미리** 다 지어 둔다. 지연 안에서 지으면(720×361 한 장에 26만 칸) 느린 기계에서 한 장이 0.8초를 넘어
  // 재는 대상이 '늦게 온 장을 받나'가 아니라 '이 기계가 얼마나 느리나'가 된다.
  const manifest = longManifest();
  const cache = new Map(manifest.steps.map((s) => [s.h, windImage(() => [10, s.h])]));   // 시간마다 다른 값 — 어느 장이 들어갔는지 알 수 있게
  const hz = harness({
    manifest,
    storeOpts: {
      loadImage: async (url) => {
        await delay(LATENCY);                             // 운영에서 잰 프레임 한 장의 시간
        if (letterOf(url) !== 'u') throw new Error('404');
        return cache.get(hourOf(url));
      },
    },
  });
  await hz.layer.load();
  hz.sw.on = true;
  hz.layer.tick(1 / 30, CAM);
  const before = hz.layer.state().fieldSets;

  const spans = new Set();
  for (let i = 1; i <= STEPS; i += 1) {
    hz.bus.set(i * 3 * H);                                // ▶ 재생: 한 칸에 3시간
    const st = hz.layer.state();
    spans.add(`${st.a}|${st.b}`);
    hz.layer.tick(PLAY_MS / 1000, CAM);
    await delay(PLAY_MS);
  }
  const during = hz.layer.state().fieldSets - before;
  assert.equal(spans.size, STEPS, '칸마다 다른 구간을 지나야 이 시험이 뜻이 있다');
  assert.ok(during >= Math.ceil(spans.size / 2),
    `재생 중 엔진에 들어간 장이 ${during}장뿐이다 — 구간 ${spans.size}개의 절반(${Math.ceil(spans.size / 2)})에 못 미친다`);

  // 마지막까지 흘려 보내면 지금 시각의 구간이 실제로 물린다 — '늦어서 버린다'가 아니라 '늦어도 따라잡는다'.
  await delay(LATENCY * 2);
  await hz.layer.settled();
  const st = hz.layer.state();
  assert.equal(st.status, 'ready');
  assert.equal(st.a, STEPS * 3, `마지막 구간을 못 물었다 (${st.a}|${st.b})`);
  assert.ok(hz.layer.state().prefetches > 0, '다음 한 장을 미리 청하지 않았다 — 구간을 넘을 때 끊긴다');
});

// ---------------------------------------------------------------- 끄기

test('끈 뒤에는 tick 이 아무것도 하지 않는다 — 시간 버스도 듣지 않고, 프레임도 청하지 않고, 입자도 움직이지 않는다', async () => {
  const hz = harness();
  await hz.layer.load();
  hz.sw.on = true;
  for (let i = 0; i < 5; i += 1) hz.layer.tick(1 / 30, CAM);
  const p = hz.layer.particles;
  assert.ok(p.sim.count > 0 && p.object.visible, '켰는데 입자가 없다');
  assert.ok(hz.legendLog.some((e) => e.op === 'show'), '켰는데 범례가 안 떴다');

  hz.sw.on = false;
  hz.layer.tick(1 / 30, CAM);                             // 이 tick 이 꺼짐을 알아챈다
  assert.equal(hz.bus.listeners(), 0, '꺼진 층이 시간 버스를 계속 듣는다');
  assert.equal(p.object.visible, false);
  assert.equal(hz.legendLog.at(-1).op, 'hide');

  const snap = { frames: p.sim.frames, updates: hz.layer.state().updates, pixels: hz.calls.pixels.length, legend: hz.legendLog.length };
  hz.bus.set(7 * H);                                      // 꺼져 있는 동안 타임라인이 다른 키프레임으로 갔다
  for (let i = 0; i < 10; i += 1) hz.layer.tick(1 / 30, CAM);
  await new Promise((r) => setTimeout(r, 5));
  assert.equal(p.sim.frames, snap.frames, '꺼졌는데 입자를 계속 움직였다');
  assert.equal(hz.layer.state().updates, snap.updates);
  assert.equal(hz.calls.pixels.length, snap.pixels, '꺼졌는데 프레임을 청했다');
  assert.equal(hz.legendLog.length, snap.legend, '꺼졌는데 범례를 만졌다');

  hz.sw.on = true;                                        // 다시 켜면 타임라인이 가 있는 시각에서 시작한다
  hz.layer.tick(1 / 30, CAM);
  await hz.layer.settled();
  assert.deepEqual(hz.calls.pixels.slice(snap.pixels), ['wind10:6', 'wind10:9', 'wind10:12']);
  assert.equal(p.object.visible || p.sim.count === 0, true);
});

test('끄는 사이 도착한 응답은 버린다 — 꺼진 층이 입자 엔진을 만지지 않는다', async () => {
  const hz = harness();
  await hz.layer.load();
  hz.sw.on = true;
  hz.layer.tick(1 / 30, CAM);
  const sets = hz.layer.state().fieldSets;
  hz.bus.set(6.5 * H);                                    // 새 키프레임을 청해 놓고
  hz.sw.on = false;
  hz.layer.tick(1 / 30, CAM);                             // 바로 끈다
  await new Promise((r) => setTimeout(r, 10));
  assert.equal(hz.layer.state().fieldSets, sets);
  assert.equal(fieldOf(hz.layer).dataA, hz.store.pixelsNow('wind10', 0).data, '꺼진 뒤에 프레임이 바뀌었다');
});

// ---------------------------------------------------------------- 자료 없음 (막대기 폴백 없음)

const noSticks = (root) => {
  const bad = [];
  root.traverse((o) => { if (o.isLine || o.isLineSegments || o.isPoints) bad.push(o.type); });
  return bad;
};

test("프레임이 없으면 '자료 없음'과 이유 — 막대기로 물러나지 않는다", async () => {
  // ① 목록을 못 받았다
  const a = harness();
  a.state.failManifest = true;
  await assert.rejects(a.layer.load(), /자료 없음.*목록/);
  assert.equal(a.layer.particles, null, '자료도 없는데 입자 버퍼를 잡았다');

  // ② 목록은 있는데 이 런에 10 m 바람이 없다(W0 이전의 매니페스트)
  const old = clone(SCHEMA2);
  delete old.fields; delete old.schema;
  for (const st of old.steps) delete st.wind10;
  const b = harness({ manifest: old });
  await assert.rejects(b.layer.load(), /자료 없음.*10 m 바람 프레임/);
  assert.deepEqual(b.calls.image, [], '없는 프레임을 받으러 갔다');

  // ③ 그림을 못 받았다
  const c = harness({ images: () => null });
  await assert.rejects(c.layer.load(), /자료 없음.*받지 못했습니다/);
  assert.equal(c.layer.particles.sim.field, null);
  c.sw.on = true;
  for (let i = 0; i < 3; i += 1) c.layer.tick(1 / 30, CAM);
  assert.equal(c.layer.particles.sim.count, 0);
  assert.equal(c.layer.particles.object.visible, false);

  // ④ LiveLayers 의 'wind' 가 같은 말을 한다 — 켜지지 않고, 지구에 선분도 점도 없다. 관측소 JSON 도 받으러 가지 않는다.
  const fetched = [];
  const realFetch = globalThis.fetch;
  globalThis.fetch = async (url) => { fetched.push(String(url)); throw new Error('network is not allowed in this test'); };
  try {
    const scene = new THREE.Scene();
    const ll = new LiveLayers(scene, () => 0, () => 50, () => '');
    ll.windLayer = b.layer;
    const st = await ll.toggle('wind');
    assert.equal(st.on, false);
    assert.match(st.error, /자료 없음/);
    assert.deepEqual(noSticks(scene), []);
    // 층이 아예 안 꽂힌 경우에도 막대기가 아니라 이유가 나온다.
    const bare = new LiveLayers(new THREE.Scene(), () => 0, () => 50, () => '');
    const st2 = await bare.toggle('wind');
    assert.equal(st2.on, false);
    assert.match(st2.error, /자료 없음/);
  } finally { globalThis.fetch = realFetch; }
  assert.deepEqual(fetched, [], `관측소 자료를 받으러 갔다: ${fetched.join(', ')}`);
});

test("예보 범위 밖이면 끝 프레임을 그 시각의 바람이라고 흘리지 않는다 — 입자를 멈추고 '예보 범위 밖'이라 적는다", async () => {
  const hz = harness();
  await hz.layer.load();
  hz.sw.on = true;
  for (let i = 0; i < 3; i += 1) hz.layer.tick(1 / 30, CAM);
  assert.ok(hz.layer.particles.sim.count > 0);

  hz.bus.set(13 * H);                                     // 유효 = 런 + 14시간 · 마지막 프레임은 f012
  hz.layer.tick(1 / 30, CAM);
  assert.equal(hz.layer.state().status, 'out-of-range');
  assert.equal(fieldOf(hz.layer), null);
  assert.equal(hz.layer.particles.sim.count, 0);
  assert.equal(hz.layer.particles.object.visible, false, '범위 밖인데 마지막 꼬리가 화면에 남았다');
  const shown = hz.legendLog.filter((e) => e.op === 'show').at(-1).args;
  assert.match(shown.note.ko, /예보 범위 밖/);
  assert.equal(shown.valid, null, "범위 밖 시각을 범례에 '유효'라고 적었다");
  assert.equal(hz.layer.readoutAt(37.5, 127).badge, 'UNAVAILABLE');
  assert.match(hz.layer.cardHtml(), /자료 없음 — 예보 범위 밖/);
  assert.equal(hz.layer.note(), '예보 범위 밖');

  hz.bus.set(10 * H);                                     // 되돌리면 다시 흐른다
  await hz.layer.settled();
  for (let i = 0; i < 3; i += 1) hz.layer.tick(1 / 30, CAM);
  assert.equal(hz.layer.state().status, 'ready');
  assert.ok(hz.layer.particles.sim.count > 0 && hz.layer.particles.object.visible);
});

// ---------------------------------------------------------------- 막대기 제거

test('buildWind 가 돌려주는 것에 선분·선·왕복 점이 없다 — 켜면 전지구 입자 리본 하나가 흐른다', async () => {
  const hz = harness();
  const scene = new THREE.Scene();
  const ll = new LiveLayers(scene, () => 0, () => 50, () => '');
  // main.js 와 같은 배선: 입자는 LiveLayers.group 에 걸리고, 켜짐은 layers.wind.on 을 읽는다.
  const layer = createWindLayer({
    frames: hz.frames, timeBus: hz.bus, legend: null, parent: ll.group, nav: DESKTOP_NAV, storage: null,
    isOn: () => { const l = ll.layers.wind; return !!(l && l.on); },
    viewport: (o) => { o.w = 1440; o.h = 900; },
    exagger: () => 50,
    shellRadius: () => ll.airShell().radius,
  });
  ll.windLayer = layer;

  const st = await ll.toggle('wind');
  assert.deepEqual(st, { on: true, badge: 'MODEL' });
  assert.deepEqual(noSticks(scene), [], '지구에 선분·선·점이 남아 있다');
  assert.equal(ll.layers.wind.obj.children.length, 0, 'buildWind 가 돌려준 자리표에 그릴 것이 달려 있다');
  const meshes = [];
  scene.traverse((o) => { if (o.isMesh) meshes.push(o); });
  assert.equal(meshes.length, 1, '입자 물체는 하나다(드로우콜 1)');
  assert.ok(meshes[0].geometry.isInstancedBufferGeometry);

  for (let i = 0; i < 4; i += 1) layer.tick(1 / 30, CAM);
  assert.ok(meshes[0].visible && meshes[0].geometry.instanceCount > 0, '켰는데 아무것도 안 그린다');
  assert.equal(layer.particles.sim.count, particleBudgetFor(1440, 900));
  // 풍속 색면(airShell)과 같은 반지름 — 시차 방지. 과장 50× 의 껍질은 1.0746 이다.
  assert.ok(Math.abs(layer.particles.sim.radius - ll.airShell().radius) < 1e-3, `${layer.particles.sim.radius}`);
  // 자료가 지구를 감싼다 — '자료가 있는 곳으로 옮기기'(coverage)가 엉뚱한 곳으로 카메라를 보내지 않는다.
  assert.equal(ll.coverage('wind'), null);

  // 카드: 모델이라고 말하고, 고를 수 없는 것은 칩이 아니고, 입자 강도 칩 셋은 눌린다.
  const card = ll.card('wind');
  assert.match(card, /GFS 0\.5°/);
  assert.match(card, /<span class="k">Level<\/span><span class="v">10 m<\/span>/);
  assert.match(card, /<span class="k">Model<\/span><span class="v">GFS 0\.5°<\/span>/);
  assert.equal((card.match(/data-action="wind-intensity"/g) || []).length, 3);
  assert.match(card, /관측이 아닙니다/);
  assert.match(card, /과장 표현/);
  assert.doesNotMatch(card, /Open-Meteo|관측소 [\d,]+개소|실측 풍속/);
  // 입자 수는 밀도 상수에서 온다(화면을 보고 조정하는 값 — 박지 않는다)
  assert.equal(ll.state('wind').note, `GFS 00Z · 10 m · 입자 ${particleBudgetFor(1440, 900).toLocaleString('ko-KR')}`);

  // 끄면 다음 tick 에 입자도 사라진다. 다시 켜면 받은 것을 그대로 쓴다(그림을 다시 받지 않는다).
  await ll.toggle('wind');
  layer.tick(1 / 30, CAM);
  assert.equal(meshes[0].visible, false);
  const images = hz.calls.image.length;
  await ll.toggle('wind');
  layer.tick(1 / 30, CAM);
  layer.tick(1 / 30, CAM);
  assert.ok(meshes[0].visible);
  assert.equal(hz.calls.image.length, images);

  // 갱신(20분)과 지형 과장 변경은 자리표만 새로 짓는다 — 입자 물체는 dispose 되지 않는다.
  let disposed = 0;
  meshes[0].geometry.addEventListener('dispose', () => { disposed += 1; });
  assert.equal(await ll.refresh('wind'), true);
  assert.equal(disposed, 0, '갱신이 입자 버퍼를 버렸다');
  assert.equal(meshes[0].parent, ll.group);

  // 막대기의 흔적이 코드에 남아 있지 않다.
  const src = LiveLayers.prototype.buildWind.toString();
  assert.doesNotMatch(src, /LineSegments|makePoints|aPhase|flowMat|wind_dir/);
  assert.doesNotMatch(read('../../prototype/v2-three/js/live-layers.js'), /gts-global\.json', 25000\)\.catch/);
});

// ---------------------------------------------------------------- u/v 부호

test('합성 북반구 저기압에서 입자가 반시계로 돈다 — 저장소 사본(행 0 = 북 · R=u · G=v)이 뒤집히지 않고 엔진에 들어간다', async () => {
  // 구면 강체 회전(중심 북위 30 · 동경 140 · 반지름 5° 에서 30 m/s). wind-particles.test.mjs 의 소용돌이와 같은 식이다.
  const unit = (lat, lon) => {
    const la = lat * D2R; const lo = lon * D2R; const c = Math.cos(la);
    return { x: c * Math.sin(lo), y: Math.sin(la), z: c * Math.cos(lo) };
  };
  const C = unit(30, 140);
  const OMEGA = 30 / Math.sin(5 * D2R);
  const low = windImage((lat, lon) => {
    const p = unit(lat, lon);
    const vx = C.y * p.z - C.z * p.y; const vy = C.z * p.x - C.x * p.z; const vz = C.x * p.y - C.y * p.x;
    const lo = lon * D2R; const la = lat * D2R;
    const u = vx * Math.cos(lo) - vz * Math.sin(lo);
    const v = -vx * Math.sin(la) * Math.sin(lo) + vy * Math.cos(la) - vz * Math.sin(la) * Math.cos(lo);
    return [OMEGA * u, OMEGA * v];
  });
  const hz = harness({ images: (url) => (letterOf(url) === 'u' ? low : null) });
  await hz.layer.load();
  // 중심의 동쪽 5° 에서는 남풍(북쪽으로 분다) · 북쪽 5° 에서는 동풍(서쪽으로 분다) — 반시계의 정의.
  const east = windAt(hz.layer, 30, 140 + 5 / Math.cos(30 * D2R));
  const north = windAt(hz.layer, 35, 140);
  assert.ok(east.v > 25 && Math.abs(east.u) < 3, `동쪽: u ${east.u} v ${east.v}`);
  assert.ok(north.u < -25 && Math.abs(north.v) < 3, `북쪽: u ${north.u} v ${north.v}`);

  hz.sw.on = true;
  const cam = camAt(30, 140);
  hz.layer.tick(1 / 30, cam);
  const sim = hz.layer.particles.sim;
  sim.pin(0, 30, 140 + 5 / Math.cos(30 * D2R));
  let swept = 0; let prev = null;
  for (let i = 0; i < 60; i += 1) {
    hz.layer.tick(1 / 30, cam);
    const ang = Math.atan2(sim.lat[0] - 30, (sim.lon[0] - 140) * Math.cos(30 * D2R));
    if (prev !== null) { let d = ang - prev; d -= Math.round(d / (2 * Math.PI)) * 2 * Math.PI; swept += d; }
    prev = ang;
  }
  assert.ok(swept > 1.5, `입자가 반시계로 돌지 않았다 (${swept} rad) — 남북 또는 u·v 가 뒤집혔다`);
  // 첫 몇 걸음은 북쪽으로 간다(동쪽 자리에서 시작했다).
  assert.ok(sim.lat[0] !== 30);
});

test('저장소 명세를 입자 엔진 명세로 옮길 때 남북 부호와 채널 순서를 확인한다', () => {
  const field = {
    decodable: true,
    grid: { ni: 720, nj: 361, lon0: -180, lat0: 90, dLon: 0.5, dLat: 0.5, wraps: true },
    channels: [
      { name: 'R', transfer: 'linear', scale: 0.5, offset: -64 },
      { name: 'G', transfer: 'linear', scale: 0.5, offset: -64 },
    ],
  };
  const spec = windFieldSpecOf(field);
  assert.equal(spec.grid.dLat, -0.5, '저장소의 dLat 은 크기다 — 부호를 안 뒤집으면 남북이 뒤집힌다');
  assert.deepEqual(spec.decode, { scale: 0.5, offset: -64 });
  assert.throws(() => windFieldSpecOf({ ...field, channels: [field.channels[1], field.channels[0]] }), /자료 없음.*R=u/);
  assert.throws(() => windFieldSpecOf({ ...field, channels: [field.channels[0], { ...field.channels[1], scale: 0.25 }] }), /자료 없음/);
  assert.throws(() => windFieldSpecOf({ ...field, decodable: false }), /자료 없음/);
  assert.throws(() => windFieldSpecOf({ ...field, grid: { ...field.grid, wraps: false } }), /자료 없음/);
});

// ---------------------------------------------------------------- 풍향 · 클릭 값

test("풍향은 '불어오는 쪽'이다 — 동쪽으로 부는 바람은 서풍 W 270°", () => {
  assert.equal(windFromDeg(10, 0), 270);
  assert.deepEqual(compass16(windFromDeg(10, 0)), { code: 'W', ko: '서' });
  assert.equal(windFromDeg(-10, 0), 90);
  assert.equal(compass16(90).code, 'E');
  assert.equal(windFromDeg(0, 10), 180);                  // 북쪽으로 부는 바람 = 남풍
  assert.equal(compass16(180).code, 'S');
  assert.equal(windFromDeg(0, -10), 0);                   // 남쪽으로 부는 바람 = 북풍
  assert.equal(compass16(0).code, 'N');
  assert.equal(Math.round(windFromDeg(7, 7)), 225);       // 북동쪽으로 부는 바람 = 남서풍
  assert.equal(compass16(225).code, 'SW');
  assert.equal(compass16(348.75).code, 'N');              // 16방위 칸의 경계
  assert.equal(compass16(348.74).code, 'NNW');
  assert.equal(compass16(11.24).code, 'N');
  assert.equal(compass16(11.26).code, 'NNE');
  // 무풍(0 m/s 도 8bit 에서는 0.36 m/s 로 풀린다)에는 방향이 없다 — 지어내지 않는다.
  assert.equal(windFromDeg(0.25, 0.25), null);
  assert.equal(windFromDeg(NaN, 1), null);
  assert.equal(compass16(null), null);
});

test('지구 클릭 — 가장 가까운 0.5° 격자점의 ~N m/s · 16방위(도) · 격자점 좌표·거리 · GFS 런/유효, 네트워크 0건', async () => {
  const hz = harness();
  await hz.layer.load();
  assert.equal(hz.layer.readoutAt(37.56, 126.97), null, '꺼져 있으면 다른 선택 흐름으로 넘긴다');
  hz.sw.on = true;
  hz.layer.tick(1 / 30, CAM);
  const images = hz.calls.image.length;
  const r = hz.layer.readoutAt(37.56, 126.97);
  assert.equal(hz.calls.image.length, images, '클릭이 그림을 받으러 갔다');
  assert.equal(r.badge, 'MODEL');
  // 런 + 1시간: (10,0) 과 (0,10) 의 1/3 지점 = (6.67, 3.33) → 7.45 m/s → 눈금 0.5 로 7.5 · 서남서에서 불어온다.
  assert.equal(r.model.speedMs, 7.5);
  assert.equal(r.model.speedKt, 15);
  assert.equal(r.model.dir.code, 'WSW');
  assert.ok(Math.abs(r.model.fromDeg - 243) <= 2, `${r.model.fromDeg}`);
  assert.deepEqual([r.model.point.lat, r.model.point.lon], [37.5, 127]);
  assert.ok(r.model.point.km > 5 && r.model.point.km < 9, `${r.model.point.km}`);
  assert.equal(r.model.band.label, '5 – 10 m/s');
  assert.match(r.html, /~7\.5 m\/s/);
  assert.match(r.html, /서남서풍 · WSW 24\d°/);
  assert.match(r.html, /불어오는 쪽/);
  assert.match(r.html, /격자점/);
  assert.match(r.html, /MODEL · GFS 0\.5° · 런 09\/20 00Z · 유효 09\/20 10:00 KST/);
  assert.match(r.html, /f000↔f003 모델 프레임 사이 보간/);
  assert.match(r.html, /관측값이 아닙니다/);
  assert.doesNotMatch(r.html, /Open-Meteo/);
  assert.match(r.title, /N37\.6° E127\.0°/);

  // 날짜변경선 · 극 — 격자점이 접힌다.
  const g = hz.store.fieldSpec('wind10').grid;
  assert.deepEqual([nearestGridPoint(g, 10.2, 179.9).lon, nearestGridPoint(g, 10.2, 179.9).lat], [-180, 10]);
  assert.equal(nearestGridPoint(g, 89.9, 0).lat, 90);
  // 눈금: 0.5 m/s 보다 잘게 말하지 않는다.
  assert.equal(windReadoutModel({ u: 3.14, v: 0 }).speedMs, 3);
  assert.equal(windReadoutModel({ u: 0.1, v: 0.1 }).calm, true);
});

test('클릭 값은 화면에 흐르는 바로 그 격자에서 읽는다 — 저장소 캐시가 우리 프레임을 밀어내도 영영 "받는 중"이 되지 않는다', async () => {
  // 저장소는 구름·기온과 나눠 쓰는 LRU 다(폰 32 MB ≈ 20장). 상한을 1바이트로 조여 '다른 레이어가 우리 두 장을 밀어낸' 상황을 만든다.
  const hz = harness({ storeOpts: { maxBytes: 1 } });
  await hz.layer.load();
  hz.sw.on = true;
  hz.layer.tick(1 / 30, CAM);
  assert.equal(hz.store.pixelsNow('wind10', 0), null, '시험 전제: f000 이 캐시에서 밀려나 있어야 한다');
  assert.equal(hz.store.sampleAt('wind10', hz.bus.validMs(), 37.5, 127), null, '시험 전제: 저장소는 이 시각의 값을 못 준다');
  assert.ok(fieldOf(hz.layer) && hz.layer.particles.sim.count > 0, '입자는 계속 흐른다(엔진이 바이트를 쥐고 있다)');
  const images = hz.calls.image.length;
  const r = hz.layer.readoutAt(37.56, 126.97);
  assert.equal(r.badge, 'MODEL', '입자는 흐르는데 클릭은 받는 중이다');
  assert.equal(r.model.speedMs, 7.5);
  assert.equal(r.model.dir.code, 'WSW');
  assert.equal(hz.calls.image.length, images, '클릭이 그림을 받으러 갔다');

  // 새 키프레임을 청해 놓은 동안에는 화면의 격자가 옛 시각 것이다 — 그 값을 새 시각의 값이라고 말하지 않는다.
  hz.bus.set(6.5 * H);
  assert.equal(hz.layer.readoutAt(37.56, 126.97).badge, 'LOADING');
  await hz.layer.settled();
  const r2 = hz.layer.readoutAt(37.56, 126.97);           // f006(서쪽으로 10)↔f009(남쪽으로 10) 의 1/2 → 북동풍
  assert.equal(r2.badge, 'MODEL');
  assert.equal(r2.model.dir.code, 'NE');
  assert.match(r2.html, /유효 09\/20 16:30 KST/);
});

// ---------------------------------------------------------------- 색 · 범례

test('입자 색과 경계가 색 눈금표(field-scales wind)에서 온다 — 엔진의 임시 색이 아니다', async () => {
  const hz = harness();
  await hz.layer.load();
  const scale = scaleOf('wind');
  const u = hz.layer.particles.uniforms;
  assert.equal(u.uColors.value.length, scale.colors.length);
  scale.colors.forEach((hex, i) => {
    const want = new THREE.Color(hex);
    const got = u.uColors.value[i];
    assert.ok(Math.abs(got.r - want.r) + Math.abs(got.g - want.g) + Math.abs(got.b - want.b) < 1e-6, `칸 ${i}: ${hex}`);
  });
  const temp = new THREE.Color(WIND_SPEED_COLORS_TEMP[3]);
  assert.ok(Math.abs(u.uColors.value[3].r - temp.r) > 0.01, '엔진의 임시 색이 그대로다');
  assert.deepEqual(Array.from(u.uBounds.value), [...scale.breaks]);
  assert.equal(u.uWhite.value, 0, "색면이 없는 지금은 입자가 풍속 구간색이다('speed')");
  // 다음 묶음의 전환 함수: 풍속 색면이 깔리면 흰색으로.
  assert.equal(hz.layer.setColorMode('white'), 'white');
  assert.equal(u.uWhite.value, 1);
  assert.equal(hz.layer.setColorMode('speed'), 'speed');
  assert.equal(u.uWhite.value, 0);
  // 이 파일에는 색도 경계도 적혀 있지 않다(눈금표 한 장).
  const src = read('../../prototype/v2-three/js/wind-layer.js');
  assert.doesNotMatch(src, /#[0-9a-fA-F]{6}\b/, 'wind-layer.js 에 색이 적혀 있다');
  assert.doesNotMatch(src, /\[\s*1\s*,\s*5\s*,\s*10\s*,\s*20/, 'wind-layer.js 에 풍속 경계가 적혀 있다');
  // v1(prototype/js) 을 런타임에 끌어오지 않는다.
  for (const m of src.matchAll(/^import .* from '([^']+)';$/gm)) assert.match(m[1], /^\.\/[a-z-]+\.js\?v=\d+$/, m[1]);
});

test("범례 — m/s + kt 두 줄 · 'MODEL · GFS 0.5° · 런 · 유효' · 입자 과장 고지 · 런이 12시간 넘게 늙으면 '지연'", async () => {
  const hz = harness();
  await hz.layer.load();
  hz.sw.on = true;
  hz.layer.tick(1 / 30, CAM);
  const args = hz.legendLog.filter((e) => e.op === 'show').at(-1).args;
  assert.equal(args.scale.id, 'wind');
  const view = legendView({ ...args, lang: 'ko', now: T0 + 5 * H });
  assert.equal(view.unit, 'm/s');
  assert.equal(view.altUnit, 'kt');
  assert.ok(view.altTicks && view.altTicks.length === view.ticks.length, 'kt 줄이 없다');
  assert.equal(view.cells.length, 8);
  assert.match(view.meta, /^MODEL · GFS 0\.5° · 런 09\/20 00Z · 유효 09\/20 10:00 KST$/);
  assert.match(view.note, /과장/);
  assert.equal(view.stale, false);
  const late = legendView({ ...args, lang: 'ko', now: T0 + 13 * H });
  assert.equal(late.stale, true);
  assert.match(late.meta, /지연/);
  // 끄면 우리 범례를 끈다.
  const hides = () => hz.legendLog.filter((e) => e.op === 'hide').length;
  hz.sw.on = false;
  hz.layer.tick(1 / 30, CAM);
  assert.equal(hides(), 1, '우리 범례인데 끄지 않았다');
  // 다른 색면이 그 사이 범례를 가져갔으면(제목이 우리 것이 아니다) 남의 범례를 끄지 않는다.
  hz.sw.on = true;
  hz.layer.tick(1 / 30, CAM);
  hz.legend.el = { children: [{ textContent: '기온' }] };
  hz.sw.on = false;
  hz.layer.tick(1 / 30, CAM);
  assert.equal(hides(), 1, '남의 범례를 껐다');
});

// ---------------------------------------------------------------- 예산

test('입자 강도 3단 — 기기 예산의 1/3 · 2/3 · 전부가 실제 입자 수로 나온다. 발열 배율이 눈에 띄게 줄인다', async () => {
  const hz = harness();
  await hz.layer.load();
  hz.sw.on = true;
  const count = () => { hz.layer.tick(1 / 30, CAM); return hz.layer.particles.sim.count; };
  const full = particleBudgetFor(1440, 900);              // CSS 픽셀 밀도에서 — 숫자를 박지 않는다(밀도는 화면을 보고 조정한다)
  assert.ok(full > 1000 && full <= 18000, `1440×900 에서 ${full}개 — 상식 밖이다`);
  assert.equal(count(), full);
  assert.equal(hz.layer.setIntensity(2), 2);
  assert.equal(count(), Math.floor((full * 2) / 3));
  hz.layer.setIntensity(1);
  assert.equal(count(), Math.floor(full / 3));
  assert.equal(hz.layer.particles.geometry.instanceCount, Math.floor(full / 3) * hz.layer.particles.sim.slots, '그리는 인스턴스가 줄지 않았다');
  hz.layer.setIntensity(3);
  assert.equal(count(), full);

  // 발열: BALANCED 0.65 · ECO 0.3 · SAFE 0 (ThermalGovernor particleScale). 상한(18,000)이 아니라 **화면의 입자 수**가 줄어야 한다.
  hz.sw.particleScale = 0.3;
  assert.equal(count(), Math.floor(full * 0.3));
  hz.sw.particleScale = 0;
  assert.equal(count(), 0);
  assert.equal(hz.layer.particles.object.visible, false);
  hz.sw.particleScale = 1;
  assert.equal(count(), full);

  // 카드의 칩: 눌린 것 하나만 on. lockedNote 글자 사본 안의 바람 카드만 갈아 끼운다.
  const body = `${hz.layer.cardHtml()}<div class="card">남의 카드</div>`;
  assert.match(body, /data-k="3" class="on" aria-pressed="true"/);
  hz.layer.setIntensity(1);
  const next = hz.layer.recard(body);
  assert.match(next, /data-k="1" class="on" aria-pressed="true"/);
  assert.match(next, /data-k="3" class="" aria-pressed="false"/);
  assert.match(next, /<div class="card">남의 카드<\/div>$/);
  assert.match(next, new RegExp(`${Math.floor(full / 3).toLocaleString('ko-KR')}개`));
  assert.equal(hz.layer.recard('<p>바람 카드가 아니다</p>'), '<p>바람 카드가 아니다</p>');
  assert.equal(windCardHtml({ intensity: 2, particles: 10, particleScale: 0.3, metaLine: '' }).match(/class="on"/g).length, 1);
});

test('폰 상한 5,000 — 화면이 아무리 커도 넘지 않고, 버퍼도 그 크기로만 잡는다', async () => {
  assert.equal(windDeviceCap(PHONE_NAV), 5000);
  assert.equal(windDeviceCap({ userAgent: 'Mozilla/5.0 (Linux; Android 15; Pixel 9)' }), 5000);
  assert.equal(windDeviceCap(DESKTOP_NAV), WIND_DEVICE_CAP.desktop);
  assert.equal(windBudget({ widthCss: 4000, heightCss: 3000, particleScale: 1, cap: 5000 }), 5000);
  assert.equal(windBudget({ widthCss: 375, heightCss: 812, particleScale: 1, cap: 5000 }), particleBudgetFor(375, 812));
  assert.equal(windBudget({ widthCss: 375, heightCss: 812, particleScale: 0.3, cap: 5000 }), Math.floor(particleBudgetFor(375, 812) * 0.3));
  assert.equal(windBudget({ widthCss: 0, heightCss: 0, cap: 5000 }), 0);

  const hz = harness({ nav: PHONE_NAV, view: { w: 4000, h: 3000 } });
  await hz.layer.load();
  hz.sw.on = true;
  hz.layer.tick(1 / 30, CAM);
  assert.equal(hz.layer.particles.sim.max, 5000);
  assert.equal(hz.layer.particles.sim.count, 5000);
  hz.view.w = 375; hz.view.h = 812;                       // 실제 폰 화면
  hz.layer.tick(1 / 30, CAM);
  assert.equal(hz.layer.particles.sim.count, particleBudgetFor(375, 812));
  assert.ok(hz.layer.particles.sim.count <= 5000);
});

// ---------------------------------------------------------------- 반지름 · 카드 갱신

test('입자 반지름 — 전지구 뷰에서는 색면 껍질과 같고, 가까이 내려가면 카메라 아래로 따라 내려온다(껍질 안에 갇혀 사라지지 않는다)', async () => {
  const SHELL = 1.004 + (50 * 9000) / 6371000;            // LiveLayers.airShell() · 과장 50× = 1.0746 (고도 475 km)
  assert.ok(Math.abs(windRadiusFor(SHELL, 3.0) - SHELL) < 1e-12, '첫 화면에서 껍질과 다르다 — 색면과 시차가 난다');
  assert.ok(Math.abs(windRadiusFor(SHELL, 1.22) - SHELL) < 1e-12, '한반도 뷰(거리 1.22)에서 껍질과 다르다');
  for (const d of [1.1, 1.06, 1.03, 1.02, 1.0028]) {
    const r = windRadiusFor(SHELL, d);
    assert.ok(r < d, `거리 ${d}: 입자(${r})가 카메라보다 높다 — 화면에서 사라진다`);
    assert.ok(r - 1 >= Math.min(SHELL - 1, (d - 1) * 0.65) - 1e-12, `거리 ${d}: 카메라 둘레 지형(고도의 65%)보다 낮다`);
    assert.ok(d - r >= (d - 1) * 0.25, `거리 ${d}: near 평면(고도의 25%) 안쪽이다`);
    assert.ok(r >= 1.0012);
  }
  assert.equal(windRadiusFor(0, 3), 1.0012);

  let ex = 50;
  const hz = harness({ extra: { exagger: () => ex, shellRadius: () => 1.004 + (ex * 9000) / 6371000 } });
  await hz.layer.load();
  hz.sw.on = true;
  hz.layer.tick(1 / 30, camAt(20, 130, 3.0));
  assert.ok(Math.abs(hz.layer.particles.sim.radius - SHELL) < 1e-3);
  hz.layer.tick(1 / 30, camAt(20, 130, 1.05));           // 고도 319 km — 껍질(475 km)보다 낮다
  assert.ok(hz.layer.particles.sim.radius < 1.05 && hz.layer.particles.sim.radius > 1.03, `${hz.layer.particles.sim.radius}`);
  for (let i = 0; i < 3; i += 1) hz.layer.tick(1 / 30, camAt(20, 130, 1.05));
  assert.ok(hz.layer.particles.sim.count > 0 && hz.layer.particles.object.visible);
  ex = 10;                                                // 과장이 바뀌면 껍질을 다시 묻는다
  hz.layer.tick(1 / 30, camAt(20, 130, 3.0));
  assert.ok(Math.abs(hz.layer.particles.sim.radius - (1.004 + (10 * 9000) / 6371000)) < 1e-3);
});

test('지구 윤곽 밖에서는 바람이 흐르지 않는다 — 껍질이 지구보다 큰 만큼 가장자리 페이드를 안쪽에서 시작한다', async () => {
  // 시선이 반지름 1 의 구에 접할 때, 그 시선 위의 껍질 점(반지름 r)의 법선·시선 cos = √(1 − 1/r²). 기하로 다시 잰다.
  const r = 1.0746;
  const d = 3;                                            // 카메라 거리 — 결과는 이 값과 무관해야 한다
  for (const dist of [d, 1.5, 8]) {
    const tAng = Math.acos(1 / dist);                     // 접점의 천저각
    const T = { x: Math.sin(tAng), y: Math.cos(tAng) };   // 접점(카메라는 +y 축 위 dist)
    const L = { x: T.x - 0, y: T.y - dist };              // 카메라 → 접점
    const len = Math.hypot(L.x, L.y);
    const s = Math.sqrt(r * r - 1);
    const P = { x: T.x - (L.x / len) * s, y: T.y - (L.y / len) * s };   // 접점에서 카메라 쪽으로 √(r²−1) — 껍질 위의 점
    assert.ok(Math.abs(Math.hypot(P.x, P.y) - r) < 1e-12);
    const toCam = { x: -P.x, y: dist - P.y };
    const facing = (P.x * toCam.x + P.y * toCam.y) / (r * Math.hypot(toCam.x, toCam.y));
    assert.ok(Math.abs(facing - windLimbLoFor(r)) < 1e-12, `거리 ${dist}: ${facing} ≠ ${windLimbLoFor(r)}`);
  }
  assert.equal(windLimbLoFor(1), 0);
  assert.equal(windLimbLoFor(0.9), 0);

  let ex = 50;
  const hz = harness({ extra: { exagger: () => ex, shellRadius: () => 1.004 + (ex * 9000) / 6371000 } });
  await hz.layer.load();
  assert.equal(hz.layer.particles.uniforms.uLimbLo.value, 0, '엔진 기본값은 예전과 같아야 한다(0)');
  hz.sw.on = true;
  hz.layer.tick(1 / 30, camAt(20, 130, 3.0));
  const lo = hz.layer.particles.uniforms.uLimbLo.value;
  assert.ok(Math.abs(lo - windLimbLoFor(hz.layer.particles.sim.radius)) < 1e-9 && lo > 0.36 && lo < 0.38, `${lo}`);
  hz.layer.tick(1 / 30, camAt(20, 130, 1.03));            // 가까이 — 입자 반지름이 내려오면 페이드 시작점도 따라 내려온다
  assert.ok(hz.layer.particles.uniforms.uLimbLo.value < lo);
});

test('카드에 적힌 것이 바뀌면 알린다(onChange) — 꺼져 있을 때와 아무것도 안 바뀌었을 때는 알리지 않는다', async () => {
  let changes = 0;
  const hz = harness({ extra: { onChange: () => { changes += 1; } } });
  await hz.layer.load();
  assert.equal(changes, 0, '켜지기도 전에 알렸다');
  hz.sw.on = true;
  hz.layer.tick(1 / 30, CAM);
  assert.equal(changes, 1);
  for (let i = 0; i < 30; i += 1) hz.layer.tick(1 / 30, CAM);
  assert.equal(changes, 1, '아무것도 안 바뀌었는데 매 프레임 알린다 — 패널이 계속 다시 그려진다');
  hz.bus.set(1 * H);                                      // 같은 두 프레임 안 — 카드에 적힌 것은 그대로다(재생 중 0.2초마다 온다)
  hz.bus.set(1.5 * H);
  assert.equal(changes, 1, '같은 두 프레임 안에서 밀 때마다 패널을 다시 그리게 한다');
  assert.match(hz.layer.cardHtml(), /f000↔f003 모델 프레임 사이 보간/);
  hz.bus.set(3.5 * H);                                    // 새 키프레임 — 받는 중(1) → 들어옴(2)
  await hz.layer.settled();
  assert.equal(changes, 3);
  assert.match(hz.layer.cardHtml(), /f003↔f006 모델 프레임 사이 보간/);
  assert.doesNotMatch(hz.layer.cardHtml(), /유효 \d\d\/\d\d|보간 \d+%/, '카드(글자 사본)에 금방 옛 글이 되는 값(유효 시각 · 보간 %)을 적었다');
  hz.bus.set(13 * H);                                     // 예보 범위 밖 — 카드가 그렇게 말해야 한다
  assert.equal(changes, 4);
  hz.sw.on = false;
  hz.layer.tick(1 / 30, CAM);
  hz.bus.set(9.5 * H);
  await new Promise((r) => setTimeout(r, 5));
  assert.equal(changes, 4);
});

// ---------------------------------------------------------------- 배선 (공용 파일)

test('공용 파일의 배선 — main.js 가 층을 만들어 꽂고 tick·클릭·칩을 잇는다. 출처 문구는 사실대로다', () => {
  const main = read('../../prototype/v2-three/js/main.js');
  assert.match(main, /import \{ createWindLayer \} from '\.\/wind-layer\.js\?v=1';/);
  assert.match(main, /liveLayers\.windLayer = windLayer;/);
  assert.match(main, /windLayer\.tick\(dt, camera\);/);
  assert.match(main, /windLayer\.readoutAt\(lat, lon\)/);
  assert.match(main, /action === 'wind-intensity'/);
  // 입자는 색면과 **같은 지표 높이**에 있어야 한다(2026-09-20 반박 검증: 옛 껍질은 과장된 최고봉 위라 입자만 떠서 그려졌다 —
  // 고도 3,000 km 에서 태풍 소용돌이가 색면의 눈과 약 100 px 어긋났다). 지킬 것은 '색면과 같은 높이'다.
  assert.match(main, /shellRadius: \(\) => 1 \+ FIELD_LIFT/);
  assert.match(main, /import \{ FIELD_LIFT \} from '\.\/field-renderer\.js\?v=1';/);
  assert.match(main, /particleScale: \(\) => thermal\.budget\.particleScale/);
  assert.doesNotMatch(main, /'weather\/wind': \['wind', '바람 관측'\]/);
  // v1 의 flow.js 를 끌어오지 않는다.
  assert.doesNotMatch(main, /from '\.\.\/\.\.\/js\/flow\.js/);

  const shell = read('../../prototype/v2-three/js/ui-shell.js');
  const row = /\{ id: 'wind', name: '([^']+)', state: '([^']+)', src: '([^']+)'/.exec(shell);
  assert.ok(row, "SCENES 에 'wind' 줄이 없다(레이어 id 는 개명하지 않는다)");
  assert.equal(row[2], 'MODEL');
  assert.equal(row[3], 'NOAA GFS 0.5° · 10 m · 5일 예보');
  assert.doesNotMatch(row[1], /관측/);

  const bridge = read('../../prototype/v2-three/js/engine-bridge.js');
  assert.match(bridge, /'weather\/wind': \{ kind: K\.PROVIDER_FORECAST, slaMin: 360 \}/);
  assert.match(bridge, /'\/clouds\/gfs-fc\/manifest\.json': \{ layer: 'weather\/wind'/);
  assert.doesNotMatch(bridge, /'\/wind\/kma-aws\.json': \{ layer: 'weather\/wind'/, '기상청 AWS 파일의 시각이 GFS 바람의 신선도로 적힌다');
});
