// DEV-DIRECTIVE 2026-09-20 · W1·W2 — 색면 레이어의 접착제(prototype/v2-three/js/field-layer.js)와 그 배선의 결과 시험.
//
// 프레임 저장소는 **진짜 코드**(gfs-frames.js)에 가짜 입출력(매니페스트 픽스처 · 합성 그림)을 넣은 것이고, 시간 버스도 진짜다(시계만 고정).
// 범례와 라벨 텍스처만 가짜다(DOM 이 없다). 그래서 여기서 재는 것은 흉내가 아니라 앱이 실제로 타는 길이다:
//   시각을 밀면 맞는 두 프레임을 청하고 uMix 가 맞는가 · 같은 구간 안에서는 다시 청하지도 라벨을 다시 찾지도 않는가 ·
//   끈 뒤에는 시간 버스가 불러도 아무것도 안 하는가 · 범위 밖에서 숨는가 · 프레임이 없으면 그라데이션으로 물러나지 않고 이유를 말하는가 ·
//   누른 자리의 값을 네트워크 없이 0.5°C 눈금으로 말하는가 · 카드의 단추가 실제로 셰이더를 바꾸는가.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

import {
  FIELD_DESCRIPTORS, FIELD_TIME_REFRESH_MS, FieldLayer, cellLabel, fieldCardHtml, fieldStatusOf, readoutOf, sourceLabel, statusText, swapFieldCard,
} from '../../prototype/v2-three/js/field-layer.js';
import { createGfsFrames } from '../../prototype/v2-three/js/gfs-frames.js';
import { createTimeBus } from '../../prototype/v2-three/js/time-bus.js';
import { SCALE_FOR_LAYER, scaleOf } from '../../prototype/v2-three/js/field-scales.js';
import { METRIC_LAYER } from '../../prototype/v2-three/js/point-readout.js';

const here = (rel) => new URL(rel, import.meta.url);
const lf = (s) => s.replace(/\r\n/g, '\n');
const read = (rel) => lf(readFileSync(here(rel), 'utf8'));
const SCHEMA2 = JSON.parse(readFileSync(here('./fixtures/gfs-fc-manifest-schema2.json'), 'utf8'));   // 스텝 0·3·6·9·12 h
const clone = (x) => JSON.parse(JSON.stringify(x));
const H = 3.6e6;
const T0 = Date.parse('2026-09-20T00:00:00Z');
const tick = (ms = 8) => new Promise((r) => setTimeout(r, ms));

const FakeTHREE = {
  RepeatWrapping: 1000, ClampToEdgeWrapping: 1001, LinearFilter: 1006, NoColorSpace: '',
  Texture: class { constructor(image) { this.image = image; this.isFakeTexture = true; } dispose() { this.disposed = true; } },
};
const hourOf = (url) => Number(/(\d{3})\.png/.exec(url)[1]);
// 기온 프레임: 위도에 따라 내려가고(30°C → −30°C) 스텝마다 1°C 씩 오른다. 서울 칸(행 105)은 f000 에서 30 − 105/3 = −5 … 바이트로는 눈금 0.5.
const tempByte = (h, r) => Math.max(0, Math.min(255, Math.round((30 - r / 3 + h / 3 + 80) / 0.5)));
const image = (h) => {
  const rgba = new Uint8Array(720 * 361 * 4);
  for (let r = 0; r < 361; r += 1) { const b = tempByte(h, r); for (let c = 0; c < 720; c += 1) rgba.set([b, b, b, 255], (r * 720 + c) * 4); }
  return { width: 720, height: 361, rgba, h };
};

function rig({ manifest = SCHEMA2, failManifest = false, failImages = false, nowMs = T0 + 1.5 * H, delay = () => 1 } = {}) {
  const calls = { images: [], manifest: 0 };
  const state = { manifest, failManifest, failImages, now: nowMs };
  const frames = createGfsFrames({
    THREE: FakeTHREE,
    now: () => state.now,
    fetch: async () => {
      calls.manifest += 1;
      if (state.failManifest) throw new Error('offline');
      return { ok: true, json: async () => clone(state.manifest) };
    },
    loadImage: async (url) => {
      calls.images.push(url);
      await tick(delay(url));
      if (state.failImages) throw new Error('404');
      return image(hourOf(url));
    },
    readPixels: (img) => ({ w: img.width, h: img.height, data: img.rgba }),
  });
  const timeBus = createTimeBus({ now: () => state.now });
  const legend = { shown: false, last: null, shows: 0, mount() {}, show(a) { this.shown = true; this.last = a; this.shows += 1; }, hide() { this.shown = false; } };
  const cardEl = { innerHTML: '' };
  const doc = { querySelectorAll: (sel) => (sel === '[data-field-card="tempgrid"]' ? [cardEl] : []) };
  // 되풀이 타이머는 두 개다(매니페스트 30분 · 시각 1분). 시험이 직접 때릴 수 있게 함수와 주기를 쥐고 있는다.
  const timers = { set: 0, cleared: 0, fns: [], fire(ms) { for (const t of this.fns) if (t.ms === ms) t.fn(); } };
  const swaps = [];
  const parent = { children: [], add(o) { this.children.push(o); }, remove(o) { this.children = this.children.filter((x) => x !== o); } };
  const layer = new FieldLayer(FIELD_DESCRIPTORS.tempgrid, {
    frames, timeBus, legend, doc, parent, segments: [8, 4], getLang: () => 'ko', now: () => state.now,
    makeLabelTexture: (text) => ({ tex: { text, dispose() {} }, w: 92, h: 40 }),
    onCard: (swap) => swaps.push(swap),
    setInterval: (fn, ms) => { timers.set += 1; timers.fns.push({ id: timers.set, fn, ms }); return timers.set; },
    clearInterval: (id) => { timers.cleared += 1; timers.fns = timers.fns.filter((t) => t.id !== id); },
  });
  return { layer, frames, timeBus, legend, calls, state, cardEl, timers, swaps, parent };
}
const hoursAsked = (calls) => calls.images.map(hourOf);
// 텍스처가 '그 객체'인지는 === 로 본다. deepEqual 이 떨어지면 node 가 1 MB 짜리 그림 두 장을 글자로 풀어 견주느라 몇 분씩 멈춘다.
const same = (a, b, msg) => assert.ok(a === b && a != null, msg);

// ---------------------------------------------------------------- 시간

test('descriptor 한 장으로 켠다 — 레이어 id 는 그대로고 눈금표·필드가 묶인다', () => {
  const d = FIELD_DESCRIPTORS.tempgrid;
  assert.deepEqual([d.layerId, d.fieldId, d.scaleId, d.mode, d.mask], ['tempgrid', 'temp', 'temp', 'scalar', 'none']);
  assert.equal(SCALE_FOR_LAYER.tempgrid, d.scaleId, '레이어 id → 눈금 id 는 field-scales 의 것과 같다');
  assert.deepEqual([...d.isolineChoices], ['2', '5']);
});

test('시각을 밀면 맞는 두 프레임을 청하고 uMix 가 맞다', async () => {
  const { layer, frames, timeBus, calls, parent } = rig();            // 지금 = 런 + 1.5 h → f000 과 f003 의 한가운데
  assert.deepEqual(await layer.on(), { on: true });
  const u = layer.renderer.uniforms;
  same(u.uTexA.value, frames.textureNow('temp', 0), 'A = f000');
  same(u.uTexB.value, frames.textureNow('temp', 3), 'B = f003');
  assert.equal(u.uMix.value, 0.5);
  assert.equal(layer.renderer.mesh.visible, true);
  assert.deepEqual([layer.status.kind, layer.status.gapH], ['interp', 3]);
  assert.ok(parent.children[0] === layer.object, 'LiveLayers 의 그룹에 붙는다');
  // 디코드 상수와 uv 보정은 프레임 저장소가 말한 것 그대로다(코드에 박지 않는다).
  assert.deepEqual(u.uDecode.value.toArray().slice(0, 2), [0.5, -80]);
  const uvT = frames.uvTransform('temp');
  assert.deepEqual(u.uUv.value.toArray(), [uvT.su, uvT.ou, uvT.sv, uvT.ov]);
  assert.ok(Math.abs(uvT.ou - 0.5 / 720) < 1e-12 && Math.abs(uvT.sv - 360 / 361) < 1e-12, '점 격자 보정(반 칸)이 들어 있다');
  assert.deepEqual(u.uGridSize.value.toArray(), [720, 361]);

  timeBus.set(2 * H);                                                  // 런 + 3.5 h → f003 과 f006 · 1/6 지점
  await tick(20);
  same(u.uTexA.value, frames.textureNow('temp', 3), 'A = f003');
  same(u.uTexB.value, frames.textureNow('temp', 6), 'B = f006');
  assert.ok(Math.abs(u.uMix.value - 0.5 / 3) < 1e-9);

  timeBus.set(1.5 * H);                                                // 정확히 f003 — 한 장만 쓰고 섞지 않는다
  await tick(20);
  same(u.uTexA.value, frames.textureNow('temp', 3), 'A = f003');
  same(u.uTexB.value, u.uTexA.value, 'B = A');
  assert.equal(u.uMix.value, 0);
  assert.equal(layer.status.kind, 'exact');
  assert.ok(hoursAsked(calls).every((h) => [0, 3, 6, 9].includes(h)), `받은 프레임 ${hoursAsked(calls)}`);
  layer.off();
});

test('같은 두 프레임 사이에서는 섞는 비율만 바뀐다 — 다시 청하지 않고 라벨도 다시 찾지 않는다', async () => {
  const { layer, timeBus, calls } = rig();
  await layer.on();
  await tick(20);                                                      // 한 장 앞 미리 받기(f006)가 끝나도록
  const asked = calls.images.length;
  const requests = layer.requests;
  const builds = layer.labels.builds;
  assert.equal(builds, 1);
  for (const dh of [-1.4, -1, -0.5, 0.2, 0.9, 1.4]) {                   // 런 + 0.1 h … + 2.9 h — 전부 f000 ~ f003 사이
    timeBus.set(dh * H);
    assert.ok(Math.abs(layer.renderer.uniforms.uMix.value - (1.5 + dh) / 3) < 1e-9, `${dh} h`);
  }
  assert.equal(calls.images.length, asked, '네트워크 0건');
  assert.equal(layer.requests, requests);
  assert.equal(layer.labels.builds, builds, '키프레임이 그대로면 라벨 자리를 다시 계산하지 않는다');
  // 키프레임이 바뀌면 그때 한 번 돈다.
  timeBus.set(2 * H);
  await tick(20);
  assert.equal(layer.labels.builds, builds + 1);
  assert.ok(layer.labels.count > 0, '위도를 따라 내려가는 기온 — 10°C 마다 라벨이 선다');
  assert.ok(layer.stats.min < -20 && layer.stats.max > 25, `모델 범위 ${layer.stats.min} ~ ${layer.stats.max}`);
  layer.off();
});

// 2026-09-20 작업 E3 ⑥ (B1 반박 검증) — 시간 버스는 **오프셋이 바뀔 때만** 알린다. 유효 시각은 now() + offset 이라
//   오프셋이 그대로여도 '지금'은 흐르는데, 색면은 켠 순간의 비율과 유효 시각에 멈춰 있었다.
//   바람 층은 이미 1분마다 다시 잰다(tick 의 slow >= 60) — 색면에도 같은 규칙을 둔다.
test("'지금'은 흐른다 — 오프셋이 그대로여도 1분마다 시각을 다시 잰다(프레임은 다시 청하지 않는다)", async () => {
  const { layer, legend, calls, state, timers } = rig();               // 지금 = 런 + 1.5 h → f000 과 f003 의 한가운데
  await layer.on();
  await tick(20);
  const u = layer.renderer.uniforms;
  assert.equal(u.uMix.value, 0.5);
  const asked = calls.images.length;
  const requests = layer.requests;
  const validBefore = legend.last.valid;

  state.now += 30 * 60 * 1000;                                         // 30분이 지났다 — 타임라인은 아무도 안 만졌다
  assert.equal(u.uMix.value, 0.5, '아무도 안 알려 주면 색면은 켠 순간에 멈춰 있다');
  timers.fire(FIELD_TIME_REFRESH_MS);                                  // 1분 타이머가 깨어난다
  await tick(20);
  assert.ok(Math.abs(u.uMix.value - (0.5 + 0.5 / 3)) < 1e-9, `비율이 따라오지 않았다 (${u.uMix.value})`);
  assert.equal(legend.last.valid, validBefore + 30 * 60 * 1000, '범례의 유효 시각이 옛 글로 남았다');
  assert.equal(calls.images.length, asked, '같은 두 프레임 사이다 — 네트워크 0건');
  assert.equal(layer.requests, requests);

  // 흐르다 다음 키프레임으로 넘어가면 그때는 청한다(f003↔f006).
  state.now += 2 * H;                                                  // 런 + 4 h
  timers.fire(FIELD_TIME_REFRESH_MS);
  await tick(20);
  assert.equal(layer.key, '3|6');
  assert.equal(layer.requests, requests + 1);
  layer.off();
});

test('타임라인을 빨리 밀어도 늦게 온 옛 응답이 새 그림을 덮지 않는다', async () => {
  // f009 는 늦게 온다(40ms). 그 사이 사용자는 f000~f003 구간으로 돌아갔다.
  const { layer, frames, timeBus } = rig({ delay: (url) => (hourOf(url) === 9 ? 40 : 1) });
  await layer.on();
  timeBus.set(6 * H);                                                  // 런 + 7.5 h → f006 · f009 를 청한다
  timeBus.set(0.3 * H);                                                // 바로 되돌아온다 → f000 · f003 (이미 있다)
  await tick(80);
  const u = layer.renderer.uniforms;
  same(u.uTexA.value, frames.textureNow('temp', 0), '늦게 온 f006·f009 가 지금 그림(f000·f003)을 덮었다');
  same(u.uTexB.value, frames.textureNow('temp', 3), 'B = f003');
  assert.ok(Math.abs(u.uMix.value - 1.8 / 3) < 1e-9);
  assert.equal(layer.key, '0|3');
  layer.off();
});

// ---------------------------------------------------------------- 끄기 · 범위 밖 · 없음

test('끈 뒤에는 시간 버스가 불러도 아무것도 하지 않는다 — 구독을 풀고 범례를 감추고 라벨을 치운다', async () => {
  const { layer, timeBus, legend, calls, timers } = rig();
  await layer.on();
  await tick(20);
  assert.equal(timeBus.listeners(), 1);
  assert.equal(legend.shown, true);
  assert.equal(timers.set, 2, '되풀이 타이머는 둘이다 — 매니페스트 30분 · 시각 1분');
  layer.off();
  assert.equal(timeBus.listeners(), 0, '안 풀면 꺼진 레이어가 프레임을 계속 받는다');
  assert.equal(legend.shown, false);
  assert.equal(layer.renderer.mesh.visible, false);
  assert.deepEqual([layer.labels.count, layer.labels.group.visible], [0, false]);
  assert.equal(timers.cleared, 2, '둘 다 풀어야 한다 — 꺼진 레이어가 1분마다 깨어나면 안 된다');
  assert.equal(timers.fns.length, 0);
  const asked = calls.images.length;
  const shows = legend.shows;
  timeBus.set(7 * H);
  layer.onTime();                                                      // 누가 직접 불러도 같다
  await tick(20);
  assert.equal(calls.images.length, asked);
  assert.equal(legend.shows, shows);
  assert.equal(layer.renderer.mesh.visible, false);
  assert.equal(layer.probe(37.5, 127), null);
  assert.equal(layer.readoutNote(37.5, 127), null, '꺼져 있으면 지점 값도 내지 않는다 — 부른 쪽이 제 길로 간다');
  // 다시 켜면 다시 선다.
  assert.deepEqual(await layer.on(), { on: true });
  assert.equal(layer.renderer.mesh.visible, true);
  assert.ok(layer.labels.count > 0);
  layer.off();
});

test('켜는 중에 끄면 늦게 온 프레임이 레이어를 되살리지 않는다', async () => {
  const { layer, legend, timeBus } = rig({ delay: () => 20 });
  const turning = layer.on();
  await tick(5);
  layer.off();
  assert.deepEqual(await turning, { on: false });
  await tick(60);
  assert.equal(layer.renderer ? layer.renderer.mesh.visible : false, false);
  assert.equal(legend.shown, false);
  assert.equal(timeBus.listeners(), 0);
});

test('예보 범위 밖에서는 숨는다 — 끝 프레임을 늘여 칠하지 않고 카드와 범례가 그렇게 말한다', async () => {
  const { layer, timeBus, legend, cardEl } = rig();
  await layer.on();
  timeBus.set(20 * H);                                                 // 런 + 21.5 h — 픽스처의 마지막 프레임은 + 12 h
  assert.equal(layer.renderer.mesh.visible, false);
  assert.equal(layer.labels.group.visible, false);
  assert.deepEqual([layer.status.kind, layer.status.side], ['outOfRange', 'after']);
  assert.equal(legend.shown, true, '범례는 남아 왜 색이 없는지 말한다');
  assert.match(legend.last.note, /예보 범위 밖/);
  assert.match(cardEl.innerHTML, /예보 범위 밖 — 이 런의 프레임은 09\/20 09:00 KST ~ 09\/20 21:00 KST 입니다/);
  assert.match(layer.readoutNote(37.5, 127).html, /예보 범위 밖 — 값을 말하지 않습니다/);
  timeBus.set(-3 * H);                                                 // 런보다 앞
  assert.deepEqual([layer.status.kind, layer.status.side, layer.renderer.mesh.visible], ['outOfRange', 'before', false]);
  timeBus.set(0);                                                      // 돌아오면 다시 보인다
  await tick(20);
  assert.equal(layer.renderer.mesh.visible, true);
  assert.equal(layer.labels.group.visible, true);
  assert.doesNotMatch(legend.last.note, /범위 밖/);
  layer.off();
});

test("프레임이 없으면 그라데이션으로 물러나지 않는다 — '자료 없음'과 이유", async () => {
  const offline = rig({ failManifest: true });
  const r1 = await offline.layer.on();
  assert.equal(r1.on, false);
  assert.match(r1.error, /^자료 없음 — 예보 목록\(clouds\/gfs-fc\/manifest\.json\)을 받지 못했습니다/);
  assert.equal(offline.layer.renderer, null, '그릴 것을 만들지도 않았다');
  assert.equal(offline.legend.shown, false);
  assert.equal(offline.timeBus.listeners(), 0);
  // W0 이전의 옛 매니페스트: 기온 프레임이 없다.
  const old = clone(SCHEMA2);
  delete old.fields;
  for (const st of old.steps) delete st.temp;
  const r2 = await rig({ manifest: old }).layer.on();
  assert.deepEqual([r2.on, /^자료 없음 — 이 예보 런에는 이 필드의 프레임이 없습니다/.test(r2.error)], [false, true]);
  // 매니페스트는 왔는데 그림을 못 받는다.
  const broken = rig({ failImages: true });
  const r3 = await broken.layer.on();
  assert.deepEqual([r3.on, /^자료 없음 — 이 시각의 프레임을 받지 못했습니다/.test(r3.error)], [false, true]);
  assert.equal(broken.layer.renderer.mesh.visible, false);
  assert.equal(broken.timeBus.listeners(), 0);
  // 이 파일 어디에도 옛 5° 격자로 가는 길이 없다.
  const src = read('../../prototype/v2-three/js/field-layer.js');
  assert.doesNotMatch(src, /wind\/global\.json|buildField|TEMP_RAMP|rampFrom/);
});

test('첫 프레임이 끝내 안 오면 켜는 중에 머물지 않는다 — 못 받았다고 말하고 끝낸다', async () => {
  const r = rig({ delay: () => 200 });
  r.layer.deps.firstFrameTimeoutMs = 15;
  const st = await r.layer.on();
  assert.equal(st.on, false);
  assert.match(st.error, /^자료 없음 — 이 시각의 프레임을 받지 못했습니다/);
  await tick(260);                                                     // 뒤늦게 온 그림이 꺼진 레이어를 되살리지 않는다
  assert.equal(r.layer.renderer.mesh.visible, false);
  assert.deepEqual([r.timeBus.listeners(), r.legend.shown], [0, false]);
});

test('세대가 바뀌면(onSwap) 쥐고 있던 텍스처를 버리고 다시 청한다', async () => {
  const { layer, frames, state, calls } = rig();
  await layer.on();
  await tick(20);
  const before = layer.renderer.uniforms.uTexA.value;
  const asked = calls.images.length;
  state.manifest = { ...clone(SCHEMA2), generatedAt: '2026-09-20T07:56:00Z' };    // 같은 런이 다시 구워졌다
  await frames.load();
  await tick(30);
  assert.ok(calls.images.length > asked, '새 세대의 주소(?g=)로 다시 받는다');
  assert.match(calls.images[calls.images.length - 1], /g=2026-09-20T07%3A56%3A00Z/);
  assert.ok(layer.renderer.uniforms.uTexA.value !== before, '옛 세대의 텍스처를 그대로 쥐고 있다');
  same(layer.renderer.uniforms.uTexA.value, frames.textureNow('temp', 0), '새 세대의 f000');
  assert.equal(layer.renderer.mesh.visible, true);
  layer.off();
});

// ---------------------------------------------------------------- 누른 자리의 값

test('누른 자리의 값 — 네트워크 0건 · 0.5°C 눈금 · ~ · "0.5° 격자(약 55 km) 평균" · run/valid', async () => {
  const { layer, calls, legend, cardEl, timeBus } = rig();
  await layer.on();
  await tick(20);
  const asked = calls.images.length;
  // 서울 37.5N: f000 −5.0 · f003 −4.0 의 한가운데 = −4.5°C (합성 프레임의 값).
  const p = layer.probe(37.5, 127);
  assert.deepEqual([p.ok, p.value, p.text], [true, -4.5, '~−4.5 °C']);
  assert.equal(p.note, '0.5° 격자(약 55 km) 평균 · 0.5 °C 눈금');
  assert.match(legend.last.note, /^누른 곳 N37\.5° E127\.0° ~−4\.5 °C · 0\.5° 격자\(약 55 km\) 평균/);
  assert.match(cardEl.innerHTML, /누른 곳 N37\.5° E127\.0° — <b>~−4\.5 °C<\/b>/);
  // 격자점 사이(37.63N)는 이중선형으로 읽은 뒤 0.5 눈금으로 반올림한다 — 0.1°C 를 말하지 않는다.
  const q = layer.probe(37.63, 126.91);
  assert.ok(Number.isInteger(q.value * 2), `0.5 눈금이 아니다: ${q.value}`);
  assert.doesNotMatch(q.text, /\d\.\d\d/);
  // 타임라인을 밀면 같은 자리의 값이 그 시각의 값으로 바뀐다.
  timeBus.set(1.5 * H);                                                // 정확히 f003
  await tick(20);
  assert.match(legend.last.note, /~−4\.0 °C/);
  // 지점 값 카드(main.js pointWeather 가 쓴다).
  const note = layer.readoutNote(37.5, 127);
  // 도장은 descriptor 의 말 그대로다. 옛 삼항('OBSERVED 가 아니면 MODEL_SIGNAL')은 메뉴 줄이 'MODEL' 이라고 적는
  // 레이어에까지 'MODEL_SIGNAL' 을 찍었다(2026-09-20 반박 검증). 둘은 같은 배지로 그려지지만 말이 갈리면 안 된다.
  assert.equal(note.badge, 'MODEL');
  assert.match(note.title, /모델 격자값/);
  assert.match(note.html, /~−4\.0 °C/);
  assert.match(note.html, /0\.5° 격자\(약 55 km\) 평균 · 0\.5 °C 눈금 — 도시·지점의 관측값이 아닙니다/);
  assert.match(note.html, /MODEL · NOAA GFS 0\.5° · 런 09\/20 00Z · 유효 09\/20 12:00 KST/);
  assert.match(note.html, /네트워크 조회 없음/);
  assert.equal(calls.images.length, asked, '값을 읽는 데 그림을 한 장도 더 받지 않았다');
  layer.off();
});

test('readoutOf — 풍속은 두 성분의 크기 · 프레임이 없거나 범위 밖이면 값을 말하지 않는다', () => {
  const wind = readoutOf({ decoded: true, values: [3, -4], value: 3, step: 0.5 }, { scale: scaleOf('wind'), mode: 'magnitudeRG', resolutionDeg: 0.5 });
  assert.deepEqual([wind.ok, wind.value, wind.text], [true, 5, '~5.0 m/s']);
  assert.equal(readoutOf(null, { scale: scaleOf('temp') }).ok, false);
  assert.match(readoutOf({ decoded: true, value: 30, values: [30], outOfRange: 'after' }, { scale: scaleOf('temp') }).text, /예보 범위 밖/);
  assert.equal(readoutOf({ decoded: false, value: 12, values: [12] }, { scale: scaleOf('temp') }).ok, false);
  assert.equal(cellLabel(0.5), '0.5° 격자(약 55 km)');
  assert.equal(cellLabel(0.25), '0.25° 격자(약 30 km)');
  assert.equal(sourceLabel({ model: 'GFS', resolutionDeg: 0.5 }), 'MODEL · NOAA GFS 0.5°');
});

// ---------------------------------------------------------------- 카드

test('카드 — MODEL · NOAA GFS 0.5° · run · valid 와 실제로 동작하는 조작만', async () => {
  const { layer, cardEl, swaps } = rig();
  await layer.on();
  const html = layer.cardHtml();
  assert.match(html, /^<div data-field-card="tempgrid">/);
  assert.match(html, /<!--\/field-card:tempgrid-->$/);
  assert.match(html, /MODEL · NOAA GFS 0\.5° · 런 09\/20 00Z · 유효 09\/20 10:30 KST/);
  assert.match(html, /모델 프레임 사이 보간 — 09\/20 09:00 KST 와 09\/20 12:00 KST 프레임 사이\(3시간 간격\)/);
  assert.match(html, /모델 범위 /);
  assert.doesNotMatch(html, /관측 범위/);
  assert.doesNotMatch(html, /Open-Meteo/);
  assert.match(html, /관측이 아니라 수치예보 모델값/);
  // 단추는 셋뿐이다: 등온선 켬/끔 · 2°C · 5°C. 고를 것이 하나인 것(모델·고도)은 단추로 가장하지 않는다.
  const buttons = html.match(/<button [^>]*>/g) || [];
  assert.equal(buttons.length, 3);
  assert.match(buttons[0], /data-action="field-iso" data-layer="tempgrid" data-set="off" aria-pressed="true"/);
  assert.match(buttons[1], /data-action="field-iso-step" data-layer="tempgrid" data-choice="2" aria-pressed="false"/);
  assert.match(buttons[2], /data-choice="5" aria-pressed="true"/);
  assert.doesNotMatch(html, /<select|Anomaly|ECMWF|850/);

  // 2°C 를 누르면 셰이더의 선 간격이 바뀌고 카드의 눌림 표시가 따라온다.
  const u = layer.renderer.uniforms;
  assert.deepEqual([u.uIsoOn.value, u.uIsoInterval.value, u.uIsoMajor.value], [1, 5, 10]);
  assert.equal(layer.handleAction('field-iso-step', { layer: 'tempgrid', choice: '2' }), true);
  assert.deepEqual([u.uIsoInterval.value, u.uIsoMajor.value], [2, 10]);
  assert.match(cardEl.innerHTML, /data-choice="2" aria-pressed="true"/);
  assert.match(cardEl.innerHTML, /data-choice="5" aria-pressed="false"/);
  // 끄면 선과 숫자가 같이 꺼진다. 색면은 남는다.
  assert.equal(layer.handleAction('field-iso', { layer: 'tempgrid', set: 'off' }), true);
  assert.deepEqual([u.uIsoOn.value, layer.labels.group.visible, layer.renderer.mesh.visible], [0, false, true]);
  assert.match(cardEl.innerHTML, /data-set="on" aria-pressed="false"[^>]*>끔</);
  assert.equal(layer.handleAction('field-iso', { layer: 'tempgrid', set: 'on' }), true);
  assert.deepEqual([u.uIsoOn.value, layer.labels.group.visible], [1, true]);
  // 없는 선택지 · 남의 레이어 · 모르는 동작은 아무것도 바꾸지 않는다.
  assert.equal(layer.handleAction('field-iso-step', { layer: 'tempgrid', choice: '1' }), false);
  assert.equal(layer.handleAction('field-iso', { layer: 'windgrid' }), false);
  assert.equal(layer.handleAction('field-model', { layer: 'tempgrid' }), false);
  assert.equal(u.uIsoInterval.value, 2);
  // 떠 있는 카드의 원본 문자열도 같이 바뀐다 — 패널이 다시 그려져도 옛 글이 되살아나지 않는다.
  const body = `머리말${html}<div class="card">꼬리</div>`;
  const next = swaps[swaps.length - 1](body);
  assert.match(next, /^머리말<div data-field-card="tempgrid">/);
  assert.match(next, /data-choice="2" aria-pressed="true"/);
  assert.match(next, /<div class="card">꼬리<\/div>$/);
  layer.off();
});

test('타임라인이 움직이는 동안 카드는 시각을 따라 바뀌는 덩어리만 갈아 끼운다 — 단추를 손가락 밑에서 바꾸지 않는다', async () => {
  const r = rig();
  const live = { innerHTML: '' };
  const el = { innerHTML: '', writes: 0, querySelector: (sel) => (sel === '[data-field-live]' ? live : null) };
  Object.defineProperty(el, 'innerHTML', { get() { return this.html || ''; }, set(v) { this.html = v; this.writes += 1; } });
  r.layer.deps.doc = { querySelectorAll: () => [el] };
  await r.layer.on();
  const whole = el.writes;
  assert.ok(whole >= 1, '처음에는 카드를 통째로 쓴다');
  assert.match(el.innerHTML, /<span data-field-live>MODEL · NOAA GFS 0\.5° · 런 09\/20 00Z · 유효 09\/20 10:30 KST/);
  r.timeBus.set(0.5 * H);
  r.timeBus.set(1 * H);
  assert.equal(el.writes, whole, '단추가 든 바깥은 다시 쓰지 않았다');
  assert.match(live.innerHTML, /유효 09\/20 11:30 KST/);
  assert.doesNotMatch(live.innerHTML, /<button/);
  // 같은 시각을 다시 내보내면 아무것도 쓰지 않는다.
  const before = live.innerHTML;
  live.innerHTML = 'X';
  r.layer.publish();
  assert.equal(live.innerHTML, 'X');
  live.innerHTML = before;
  // 단추의 모양이 바뀌면 그때는 통째로.
  r.layer.handleAction('field-iso-step', { layer: 'tempgrid', choice: '2' });
  assert.equal(el.writes, whole + 1);
  r.layer.off();
});

test('swapFieldCard — 그 레이어의 카드만 바꾸고, 없으면 그대로 둔다', () => {
  const card = fieldCardHtml({
    id: 'tempgrid', desc: FIELD_DESCRIPTORS.tempgrid, scale: scaleOf('temp'), info: { model: 'GFS', resolutionDeg: 0.5, runMs: T0 },
    validMs: T0, status: { kind: 'exact', a: { t: T0 } }, isoOn: true, isoChoice: '5', choices: ['2', '5'], stats: null, probe: null, ko: true,
  });
  assert.equal(swapFieldCard(`A${card}B`, 'tempgrid', 'X'), 'A<div data-field-card="tempgrid">X</div><!--/field-card:tempgrid-->B');
  assert.equal(swapFieldCard('다른 카드', 'tempgrid', 'X'), '다른 카드');
  assert.equal(swapFieldCard(`A${card}B`, 'windgrid', 'X'), `A${card}B`);
  assert.equal(swapFieldCard(null, 'tempgrid', 'X'), null);
  // 영어 화면은 UTC 로 말한다.
  const en = fieldCardHtml({
    id: 'tempgrid', desc: FIELD_DESCRIPTORS.tempgrid, scale: scaleOf('temp'), info: { model: 'GFS', resolutionDeg: 0.5, runMs: T0 },
    validMs: T0 + 1.5 * H, status: fieldStatusOf({ br: { a: { t: T0, h: 0 }, b: { t: T0 + 3 * H, h: 3 }, mix: 0.5, gapH: 3 } }),
    isoOn: false, isoChoice: '5', choices: ['2', '5'], stats: { min: -40, max: 41.5 }, probe: null, ko: false,
  });
  assert.match(en, /MODEL · NOAA GFS 0\.5° · run 09\/20 00Z · valid 09\/20 01:30 UTC/);
  assert.match(en, /Interpolated between model frames — 09\/20 00:00 UTC and 09\/20 03:00 UTC \(3 h apart\)/);
  assert.match(en, /Model range −40\.0 °C ~ 41\.5 °C/);
  // 빠진 스텝이 있으면 간격을 그대로 말한다.
  assert.match(statusText(fieldStatusOf({ br: { a: { t: T0, h: 0 }, b: { t: T0 + 6 * H, h: 6 }, mix: 0.2, gapH: 6 } }), { short: true }), /6시간 간격/);
});

// ---------------------------------------------------------------- 배선

test("배선 — LiveLayers 의 'tempgrid' 는 이제 셰이더 색면을 켠다(id 그대로) · 옛 5° 그라데이션 길로 가지 않는다", async () => {
  const { LiveLayers } = await import('../../prototype/v2-three/js/live-layers.js');
  const r = rig();
  const added = [];
  const ll = new LiveLayers({ add(o) { added.push(o); } }, () => 120, () => 50, () => '');
  let oldPath = 0;
  ll.fetchFor = () => { oldPath += 1; return Promise.reject(new Error('옛 길')); };
  ll.buildField = () => { oldPath += 1; throw new Error('옛 길'); };
  const swaps = [];
  ll.provideField({
    frames: r.frames, timeBus: r.timeBus, legend: r.legend, segments: [8, 4], getLang: () => 'ko',
    makeLabelTexture: (text) => ({ tex: { text, dispose() {} }, w: 92, h: 40 }),
    onCard: (swap) => swaps.push(swap), setInterval: () => 1, clearInterval: () => {},
  });
  assert.equal(ll.fieldReadout('tempgrid', 37.5, 127), null, '꺼져 있으면 지점 값은 옛 길로 간다');
  assert.equal(ll.fieldProbe(37.5, 127), null);

  const st = await ll.toggle('tempgrid');
  assert.deepEqual(st, { on: true, badge: 'MODEL' });
  assert.equal(oldPath, 0);
  assert.deepEqual(ll.activeIds(), ['tempgrid']);
  assert.equal(ll.state('tempgrid').on, true);
  assert.match(ll.state('tempgrid').note, /^NOAA GFS 0\.5° · 런 09\/20 00Z$/);
  assert.match(ll.card('tempgrid'), /MODEL · NOAA GFS 0\.5° · 런 09\/20 00Z · 유효 /);
  const field = ll.layers.tempgrid.field;
  assert.ok(ll.layers.tempgrid.obj.parent === ll.group, '색면은 LiveLayers 의 그룹에 붙는다');
  assert.equal(field.renderer.mesh.visible, true);
  assert.equal(r.legend.shown, true);
  assert.equal(ll.coverage('tempgrid').global, true, '전지구 자료 — 켠다고 카메라를 옮기지 않는다');
  // 지점 값 · 단추 · 누른 자리.
  assert.match(ll.fieldReadout('tempgrid', 37.5, 127).html, /~−4\.5 °C/);
  assert.equal(ll.fieldAction('field-iso-step', { layer: 'tempgrid', choice: '2' }), true);
  assert.equal(field.renderer.uniforms.uIsoInterval.value, 2);
  assert.equal(ll.fieldProbe(0, 0).ok, true);
  // 지형 과장이 바뀌어도 다시 짓지 않는다(uniform 만 바뀐다) — onExaggerChanged 가 이 레이어를 건드리지 않는다.
  const mesh = field.renderer.mesh;
  ll.getExagger = () => 12;
  ll.onExaggerChanged();
  await tick(5);
  assert.ok(ll.layers.tempgrid.field.renderer.mesh === mesh, '과장이 바뀌었다고 색면을 다시 지었다');
  // 주기 갱신이 이 레이어를 집어도 옛 5° 격자로 갈아 끼우지 않는다.
  assert.equal(await ll.refresh('tempgrid'), false);
  assert.ok(ll.layers.tempgrid.obj === field.object);
  assert.equal(oldPath, 0);

  // 끈다 → 구독이 풀린다. 다시 켜고 '전부 끄기'.
  assert.deepEqual(await ll.toggle('tempgrid'), { on: false });
  assert.deepEqual([ll.state('tempgrid').on, r.timeBus.listeners(), r.legend.shown, mesh.visible], [false, 0, false, false]);
  assert.deepEqual(await ll.toggle('tempgrid'), { on: true, badge: 'MODEL' });
  assert.equal(r.timeBus.listeners(), 1);
  ll.clearAll();
  assert.deepEqual([ll.activeIds().length, r.timeBus.listeners(), r.legend.shown, mesh.visible], [0, 0, false, false]);
  assert.equal(oldPath, 0);
});

test("배선 — 프레임이 없으면 toggle 은 { on:false, error:'자료 없음 …' } 을 돌려주고 5° 격자를 받으러 가지 않는다", async () => {
  const { LiveLayers } = await import('../../prototype/v2-three/js/live-layers.js');
  const r = rig({ failManifest: true });
  const ll = new LiveLayers({ add() {} }, () => 0, () => 50, () => '');
  let oldPath = 0;
  ll.fetchFor = () => { oldPath += 1; return Promise.resolve({}); };
  ll.provideField({ frames: r.frames, timeBus: r.timeBus, legend: r.legend, segments: [8, 4], setInterval: () => 1, clearInterval: () => {} });
  const st = await ll.toggle('tempgrid');
  assert.equal(st.on, false);
  assert.match(st.error, /^자료 없음 — /);
  assert.equal(oldPath, 0, '그라데이션으로 물러나지 않는다');
  assert.equal(ll.layers.tempgrid, undefined);
  assert.deepEqual(ll.activeIds(), []);
});

test('배선 — 공용 파일의 글자: 출처 문구 · 지점 기온 · 누른 자리 · 카드 단추 · 같은 URL 의 시간 버스', () => {
  const shell = read('../../prototype/v2-three/js/ui-shell.js');
  assert.match(shell, /\{ id: 'tempgrid', name: '전지구 기온', state: 'MODEL', src: 'NOAA GFS 0\.5° · 5일 예보 · 3시간 간격', act: true \}/);
  const main = read('../../prototype/v2-three/js/main.js');
  assert.match(main, /liveLayers\.provideField\(\{\s*frames: gfsFrames, terrain: uniforms, geometry: earth\.geometry, isPhone: isMobileUA,/);
  // 지점 값: 색면이 켜져 있으면 **화면에 칠해진** 텍스처 사본에서 읽고 돌아간다 — 프레임을 새로 받는 줄보다 앞이다.
  // (2026-09-20 W2) 그 다음 줄도 이제 우리 자료다: 옛 길이던 api.open-meteo.com 직호출을 걷어냈다.
  const pw = main.slice(main.indexOf('const pointWeather = async'), main.indexOf('const seaCardHtml'));
  const at = pw.indexOf('liveLayers.fieldReadout(layerId, lat, lon)');
  assert.ok(at > 0 && at < pw.indexOf('pointReadout.weather('), '텍스처 읽기가 프레임 받기보다 먼저다');
  assert.match(pw, /const layerId = METRIC_LAYER\[metric\];/, '지표 → 색면 레이어 표가 point-readout.js 의 것이어야 한다');
  assert.doesNotMatch(pw, /open-meteo\.com/, '지점 값이 아직 제3자 API 를 부른다');
  assert.match(main, /const \{ lat, lon \} = hit;[\s\S]{0,400}liveLayers\.fieldProbe\(lat, lon\);/);
  assert.match(main, /action\.startsWith\('field-'\)\) \{ liveLayers\.fieldAction\(action, ds\); return; \}/);
  // 레이어 id 는 그대로다.
  assert.match(main, /'weather\/tempgrid': \['tempgrid', '전지구 기온'\]/);
  // ES 모듈은 URL 전체로 구분된다 — 시간 버스·프레임 저장소를 main.js 와 글자까지 같은 주소로 들인다.
  const layer = read('../../prototype/v2-three/js/field-layer.js');
  // (2026-09-24 정정) 토큰 값을 박지 않는다 — 지키는 것은 '같은 글자'다. main.js 가 쓰는 지정자를 읽어 field-layer.js 도 그대로인지 본다
  //   (같은 출처 전환 때 gfs-frames 를 ?v=2 로 올리자 값을 박은 이 시험이 깨졌다 — 모든 importer 는 함께 올렸다).
  for (const name of ['time-bus', 'gfs-frames']) {
    const m = main.match(new RegExp(`from '(\\./${name}\\.js\\?v=[A-Za-z0-9-]+)'`));
    assert.ok(m, `main.js 가 ${name} 를 들이지 않는다`);
    const spec = `'${m[1]}'`;
    assert.ok(main.includes(`from ${spec}`), `main.js ${spec}`);
    assert.ok(layer.includes(`from ${spec}`), `field-layer.js ${spec}`);
  }
  const live = read('../../prototype/v2-three/js/live-layers.js');
  // (2026-09-21: 켜기의 문 안쪽에 잠기는 땅(slr)을 내리는 한 줄이 붙었다 — 갈리는 자리는 그대로다.)
  assert.match(live, /if \(isFieldLayerId\(id\)\) \{\n\s+const r = await toggleFieldLayer\(this, id\);/);
  assert.match(live, /clearFieldLayers\(this\);/);
  assert.match(live, /모델 범위 \$\{rng\}/);
  assert.doesNotMatch(live, /\$\{desc\}<br\/>관측 범위/);
  // v2 모듈은 v1(prototype/js/)을 런타임에 들이지 않는다.
  for (const f of ['field-renderer.js', 'field-labels.js', 'field-layer.js']) {
    const src = read(`../../prototype/v2-three/js/${f}`);
    const imports = src.match(/from '[^']+'/g) || [];
    assert.ok(imports.every((s) => /from '\.\/|from '\.\.\/\.\.\/vendor\//.test(s)), `${f}: ${imports}`);
  }
});
