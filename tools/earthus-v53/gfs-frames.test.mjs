// 공용 GFS 프레임 저장소(prototype/v2-three/js/gfs-frames.js) — 결과를 시험한다.
// 매니페스트 픽스처는 운영 S3 의 것을 스텝만 줄인 사본이다(fixtures/gfs-fc-manifest-schema2.json).
// THREE · fetch · 그림 받기 · 픽셀 읽기는 전부 가짜를 넣는다 — 저장소는 DOM 을 모른다.
import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';

import {
  GFS_FIELD_IDS, GFS_FRAMES_BUDGET, RUN_DELAY_HOURS, ByteLru,
  applyValueTextureDefaults, bracketFrames, budgetFor, compactPixels, createGfsFrames, decodeByte,
  frameUrlOf, readManifest, runAgeOf, sharedGfsFrames,
} from '../../prototype/v2-three/js/gfs-frames.js';

const here = (rel) => new URL(rel, import.meta.url);
const SCHEMA2 = JSON.parse(readFileSync(here('./fixtures/gfs-fc-manifest-schema2.json'), 'utf8'));
const S3B = 'https://earthus-cache-kr.s3.us-east-2.amazonaws.com';
const H = 3.6e6;
const T0 = Date.parse('2026-09-20T00:00:00Z');
const clone = (x) => JSON.parse(JSON.stringify(x));

// W0 이전의 매니페스트: 새 키가 하나도 없다(handler.py 가 '더한' 키를 전부 뺀 모양).
function asSchema1(mf) {
  const old = clone(mf);
  for (const k of ['schema', 'model', 'resolutionDeg', 'runTag', 'fields', 'fieldMissing', 'decodeStats',
    'runs', 'runsNote', 'previousManifest']) delete old[k];
  for (const st of old.steps) {
    for (const k of Object.keys(st)) if (/^(temp|wind10|mslp|apcp)/.test(k)) delete st[k];
  }
  return old;
}

// three 의 기본값을 흉내 낸다. colorSpace 만 일부러 'srgb' 로 둔다 — 저장소가 NoColorSpace 를 **적는지** 보려고.
const FakeTHREE = {
  RepeatWrapping: 1000, ClampToEdgeWrapping: 1001, LinearFilter: 1006, LinearMipmapLinearFilter: 1008,
  NoColorSpace: '', SRGBColorSpace: 'srgb',
  Texture: class {
    constructor(image) {
      this.image = image; this.flipY = true; this.premultiplyAlpha = false; this.generateMipmaps = true;
      this.minFilter = 1008; this.magFilter = 1006; this.wrapS = 1001; this.wrapT = 1001;
      this.colorSpace = 'srgb'; this.needsUpdate = false; this.disposed = false;
    }

    dispose() { this.disposed = true; }
  },
};

// 가짜 그림: {width, height, rgba}. fill(row, col) → [r,g,b,a]
function image(w, h, fill) {
  const rgba = new Uint8Array(w * h * 4);
  for (let r = 0; r < h; r += 1) {
    for (let c = 0; c < w; c += 1) rgba.set(fill(r, c), (r * w + c) * 4);
  }
  return { width: w, height: h, rgba };
}
const gray = (w, h, fn) => image(w, h, (r, c) => { const v = fn(r, c); return [v, v, v, 255]; });

// 저장소 하나 + 가짜 네트워크. images: (url) => 그림 | null
function harness(manifest, images, opts = {}) {
  const calls = { manifest: 0, image: [], now: T0 };
  const state = { manifest, failManifest: false };
  const store = createGfsFrames({
    THREE: FakeTHREE,
    now: () => calls.now,
    fetch: async (url, init) => {
      calls.manifest += 1;
      calls.lastManifestUrl = url;
      calls.lastInit = init;
      if (state.failManifest) throw new Error('offline');
      return { ok: true, json: async () => clone(state.manifest) };
    },
    loadImage: async (url) => {
      calls.image.push(url);
      await new Promise((r) => setTimeout(r, 1));           // 진짜처럼 늦게 온다 — 동시 요청이 겹친다
      const img = images ? images(url) : null;
      if (!img) throw new Error('404');
      return img;
    },
    readPixels: (img) => ({ w: img.width, h: img.height, data: img.rgba }),
    ...opts,
  });
  return { store, calls, state };
}

const hourOf = (url) => Number(/(\d{3})\.png/.exec(url)[1]);
const letterOf = (url) => /\/([a-z])\d{3}\.png/.exec(url)[1];

// ---------------------------------------------------------------- 매니페스트

test('schema 2 매니페스트: 일곱 필드의 프레임이 시간순으로 나온다', async () => {
  const { store, calls } = harness(SCHEMA2);
  const mf = await store.load();
  assert.equal(mf.schema, 2);
  assert.equal(calls.lastManifestUrl, `${S3B}/clouds/gfs-fc/manifest.json`);
  assert.deepEqual(calls.lastInit, { cache: 'no-cache' }, '매니페스트는 늘 재검증한다(옛 loadGfs 와 같다)');
  assert.deepEqual([...GFS_FIELD_IDS].sort(), ['apcp', 'cloud', 'mslp', 'precip', 'temp', 'wind10', 'wind700']);
  for (const id of ['cloud', 'wind700', 'precip', 'temp', 'wind10', 'mslp']) {
    assert.deepEqual(store.framesFor(id).map((f) => f.h), [0, 3, 6, 9, 12], id);
    assert.deepEqual(store.framesFor(id).map((f) => f.t), [0, 3, 6, 9, 12].map((h) => T0 + h * H), id);
  }
  assert.match(store.framesFor('temp')[1].url, /\/clouds\/gfs-fc\/2026092000\/t003\.png\?g=2026-09-20T04%3A56%3A36Z$/);
  assert.match(store.framesFor('wind10')[1].url, /\/u003\.png\?g=/);
  assert.match(store.framesFor('mslp')[1].url, /\/m003\.png\?g=/);
  assert.match(store.framesFor('wind700')[1].url, /\/w003\.png\?g=/);
  const info = store.info();
  assert.deepEqual([info.schema, info.model, info.run, info.runTag, info.stepMs, info.resolutionDeg],
    [2, 'GFS', '2026-09-20T00:00:00Z', '2026092000', 3 * H, 0.5]);
  assert.deepEqual([info.grid.ni, info.grid.nj, info.grid.lon0, info.grid.lat0, info.grid.dLon, info.grid.dLat, info.grid.wraps],
    [720, 361, -180, 90, 0.5, 0.5, true]);
});

test('apcp 는 f000 이 없다 — 오류가 아니라 그 스텝만 빠진다', async () => {
  const { store, calls } = harness(SCHEMA2);
  await store.load();
  assert.deepEqual(store.framesFor('apcp').map((f) => f.h), [3, 6, 9, 12]);
  assert.deepEqual(store.framesFor('apcp').map((f) => f.window),
    [{ fromH: 0, toH: 3 }, { fromH: 0, toH: 6 }, { fromH: 6, toH: 9 }, { fromH: 6, toH: 12 }]);
  assert.equal(await store.texture('apcp', 0), null);
  assert.equal(await store.pixels('apcp', 0), null);
  assert.deepEqual(calls.image, [], '없는 프레임은 받으러 가지도 않는다');
  // 런 시각(+0h)은 첫 프레임(+3h)보다 앞이다 — 끝 프레임을 주고 범위 밖이라고 밝힌다.
  const br = store.bracket('apcp', T0);
  assert.deepEqual([br.a.h, br.b.h, br.mix, br.outOfRange], [3, 3, 0, 'before']);
  assert.equal(store.fieldSpec('apcp').windowed, true);
  assert.equal(store.fieldSpec('temp').windowed, false);
});

test('schema 없는 옛 매니페스트도 읽힌다 — 새 필드는 없음, runs 는 빈 목록', async () => {
  const { store } = harness(asSchema1(SCHEMA2));
  const mf = await store.load();
  assert.equal(mf.schema, undefined);
  assert.equal(store.info().schema, 1);
  assert.deepEqual(store.framesFor('cloud').map((f) => f.h), [0, 3, 6, 9, 12]);
  assert.deepEqual(store.framesFor('wind700').length, 5);
  assert.deepEqual(store.framesFor('precip').length, 5);
  for (const id of ['temp', 'wind10', 'mslp', 'apcp']) {
    assert.deepEqual([...store.framesFor(id)], [], id);
    assert.equal(store.has(id), false, id);
    assert.equal(store.bracket(id, T0), null, id);
    assert.equal(store.sampleAt(id, T0, 37.5, 127), null, id);
    assert.equal(await store.texture(id, 0), null, id);
  }
  assert.equal(store.has('cloud'), true);
  assert.deepEqual([...store.runs()], []);
  assert.equal(store.fieldSpec('temp').decodable, false);
});

test('모르는 필드 id 는 던진다 — 오타가 "자료 없음"으로 읽히면 안 된다', async () => {
  const { store } = harness(SCHEMA2);
  assert.throws(() => store.framesFor('temp'), /GFS_FRAMES_NOT_LOADED/);
  await store.load();
  assert.throws(() => store.framesFor('temperature'), /GFS_FRAMES_UNKNOWN_FIELD:temperature/);
  assert.throws(() => store.bracket('wind', T0), /GFS_FRAMES_UNKNOWN_FIELD:wind/);
});

test('매니페스트가 새 필드를 실으면 코드 수정 없이 보인다', async () => {
  const mf = clone(SCHEMA2);
  mf.fields.temp850 = { ...clone(mf.fields.temp), stepKey: 'temp850' };
  mf.steps[1].temp850 = '2026092000/x003.png';
  const { store } = harness(mf);
  await store.load();
  assert.deepEqual(store.framesFor('temp850').map((f) => f.h), [3]);
  assert.ok(store.fields().includes('temp850'));
});

test('구름 프레임 주소는 옛 loadGfs 가 만들던 글자와 똑같다 (?g= 세대 가름 포함)', async () => {
  const { store } = harness(SCHEMA2);
  const mf = await store.load();
  // 2026-09-20 이전 main.js loadGfs 의 식 그대로.
  const gen = encodeURIComponent(mf.generatedAt || mf.run || '');
  const q = gen ? `?g=${gen}` : '';
  const old = mf.steps.map((st) => ({
    h: st.h, t: Date.parse(st.valid), url: `${S3B}/clouds/gfs-fc/${st.file}${q}`,
    wind: st.wind ? `${S3B}/clouds/gfs-fc/${st.wind}${q}` : null,
    precip: st.precip ? `${S3B}/clouds/gfs-fc/${st.precip}${q}` : null,
  })).filter((f) => Number.isFinite(f.t) && f.wind).sort((a, b) => a.t - b.t);
  assert.deepEqual(mf.steps.map((st) => store.frameUrl(st.file)), old.map((f) => f.url));
  assert.deepEqual(mf.steps.map((st) => store.frameUrl(st.wind)), old.map((f) => f.wind));
  assert.deepEqual(mf.steps.map((st) => store.frameUrl(st.precip)), old.map((f) => f.precip));
  assert.deepEqual(store.framesFor('cloud').map((f) => f.url), old.map((f) => f.url));
  // generatedAt 이 없으면 run 으로, 둘 다 없으면 ?g= 없이.
  assert.equal(frameUrlOf(S3B, 'clouds/gfs-fc', '', 'r/c000.png'), `${S3B}/clouds/gfs-fc/r/c000.png`);
  const noGen = clone(SCHEMA2); delete noGen.generatedAt;
  assert.match(readManifest(noGen).frames.cloud[0].url, /\?g=2026-09-20T00%3A00%3A00Z$/);
});

test('다시 읽기: generatedAt 이 같으면 그대로, 바뀌면 갈아 끼우고 캐시를 비운다', async () => {
  const img = gray(720, 361, () => 200);
  const { store, calls, state } = harness(SCHEMA2, () => img);
  const first = await store.load();
  const tex = await store.texture('temp', 3);
  const swaps = [];
  store.onSwap((next, prev) => swaps.push([prev.generatedAt, next.generatedAt]));

  const again = await store.load();
  assert.equal(again, first, '같은 세대면 돌려주는 객체도 같다');
  assert.equal(store.textureNow('temp', 3), tex, '프레임 캐시도 그대로다');
  assert.deepEqual(swaps, []);
  assert.equal(calls.manifest, 2);

  state.manifest = { ...clone(SCHEMA2), generatedAt: '2026-09-20T07:58:00Z' };   // 같은 런을 3시간 뒤 다시 구웠다
  const third = await store.load();
  assert.equal(third.generatedAt, '2026-09-20T07:58:00Z');
  assert.deepEqual(swaps, [['2026-09-20T04:56:36Z', '2026-09-20T07:58:00Z']]);
  assert.equal(store.textureNow('temp', 3), null, '옛 세대의 장은 비운다');
  assert.equal(tex.disposed, true);
  assert.match(store.framesFor('temp')[1].url, /\?g=2026-09-20T07%3A58%3A00Z$/);

  state.failManifest = true;                                   // 다시 읽다 실패 — 쥐고 있던 것을 지킨다
  assert.equal((await store.load()).generatedAt, '2026-09-20T07:58:00Z');
  assert.equal(store.framesFor('temp').length, 5);
});

test('매니페스트를 한 번도 못 읽으면 null — 던지지 않는다(구름이 지점 방식으로 물러날 수 있게)', async () => {
  const { store, state } = harness(SCHEMA2);
  state.failManifest = true;
  assert.equal(await store.load(), null);
  assert.equal(store.manifest, null);
  assert.equal(store.info(), null);
  assert.equal(store.runAge(T0), null);
  state.failManifest = false;
  state.manifest = { nope: true };                             // 모양이 아니다
  assert.equal(await store.load(), null);
});

test('동시에 load() 를 여럿이 불러도 요청은 하나다', async () => {
  const { store, calls } = harness(SCHEMA2);
  const [a, b, c] = await Promise.all([store.load(), store.load(), store.load()]);
  assert.equal(calls.manifest, 1);
  assert.ok(a === b && b === c);
});

// ---------------------------------------------------------------- 시간

test('bracket: 정시 · 사이 · 범위 밖 · 빠진 스텝', async () => {
  const mf = clone(SCHEMA2);
  delete mf.steps[2].temp;                                     // f006 의 기온이 빠진 날
  const { store } = harness(mf);
  await store.load();
  const at = (id, h) => { const b = store.bracket(id, T0 + h * H); return [b.a.h, b.b.h, b.mix, b.exact, b.outOfRange, b.gapH]; };
  assert.deepEqual(at('mslp', 3), [3, 3, 0, true, null, 0], '정시');
  assert.deepEqual(at('mslp', 0), [0, 0, 0, true, null, 0], '첫 프레임 정시');
  assert.deepEqual(at('mslp', 12), [12, 12, 0, true, null, 0], '끝 프레임 정시');
  assert.deepEqual(at('mslp', 4), [3, 6, 1 / 3, false, null, 3], '사이');
  assert.deepEqual(at('mslp', 7.5), [6, 9, 0.5, false, null, 3]);
  assert.deepEqual(at('mslp', -1), [0, 0, 0, false, 'before', 0], '앞쪽 밖 — 첫 프레임, 지어내 연장하지 않는다');
  assert.deepEqual(at('mslp', 200), [12, 12, 0, false, 'after', 0], '뒤쪽 밖 — 끝 프레임');
  assert.deepEqual(at('temp', 4.5), [3, 9, 0.25, false, null, 6], '빠진 스텝 — 실제 시각으로 섞고 간격을 밝힌다');
  assert.equal(bracketFrames([], T0), null);
  assert.equal(bracketFrames(store.framesFor('mslp'), NaN), null);
  assert.equal(store.timeAt(2 * H), T0 + 2 * H, '타임라인 오프셋 → 유효 시각(주입한 시계)');
});

test('런 나이: 12시간을 넘으면 지연', async () => {
  assert.equal(RUN_DELAY_HOURS, 12);
  assert.deepEqual(runAgeOf('2026-09-20T00:00:00Z', T0 + 11 * H), { runMs: T0, ageH: 11, limitH: 12, delayed: false });
  assert.equal(runAgeOf('2026-09-20T00:00:00Z', T0 + 12 * H).delayed, false, '딱 12시간은 아직 아니다');
  assert.equal(runAgeOf('2026-09-20T00:00:00Z', T0 + 12.5 * H).delayed, true);
  assert.equal(runAgeOf('어제', T0), null, '못 읽는 시각을 "지연 아님"으로 읽지 않는다');
  const { store, calls } = harness(SCHEMA2);
  await store.load();
  calls.now = T0 + 5 * H;
  assert.deepEqual([store.runAge().ageH, store.runAge().delayed], [5, false]);
  calls.now = T0 + 19 * H;
  assert.deepEqual([store.runAge().ageH, store.runAge().delayed], [19, true]);
});

test('runs(): 새 런이 앞, 사본 주소는 절대경로, 지금 런에 표시', async () => {
  const mf = clone(SCHEMA2);
  mf.runs.push({ tag: '2026091918', run: '2026-09-19T18:00:00Z', manifest: '2026091918/manifest.json',
    generatedAt: '2026-09-19T22:50:00Z', frames: 41 }, { tag: 7 }, null);
  const { store } = harness(mf);
  await store.load();
  assert.deepEqual(store.runs().map((r) => [r.tag, r.current, r.manifestUrl, r.runMs]), [
    ['2026092000', true, `${S3B}/clouds/gfs-fc/2026092000/manifest.json`, T0],
    ['2026091918', false, `${S3B}/clouds/gfs-fc/2026091918/manifest.json`, T0 - 6 * H],
  ]);
  assert.equal(store.openRun('1999010100'), null);
  assert.equal(typeof store.openRun('2026091918').load, 'function', 'Compare 가 이전 런을 따로 연다');
});

// ---------------------------------------------------------------- 값

test('서울(37.5N,127E)은 행 105 · 열 614 — 위아래·좌우가 뒤집히면 이 시험이 떨어진다', async () => {
  // 그 한 칸만 204(운영 프레임 실측값 = 22.0°C), 나머지는 100(= −30°C).
  const img = gray(720, 361, (r, c) => (r === 105 && c === 614 ? 204 : 100));
  const { store, calls } = harness(SCHEMA2, () => img);
  await store.load();
  assert.equal(store.sampleAt('temp', T0, 37.5, 127), null, '아직 안 받았다 — 네트워크를 부르지 않고 없다고 한다');
  assert.deepEqual(calls.image, []);
  await store.ensure('temp', T0);
  const before = calls.image.length;
  const s = store.sampleAt('temp', T0, 37.5, 127);
  assert.equal(s.value, 22);
  assert.deepEqual([s.unit, s.decoded, s.exact, s.interpolated, s.a.h], ['degC', true, true, false, 0]);
  assert.equal(store.sampleAt('temp', T0, -37.5, 127).value, -30, '남반구 같은 경도는 다른 값이다');
  assert.equal(store.sampleAt('temp', T0, 37.5, -127).value, -30);
  assert.equal(store.sampleAt('temp', T0, 37.75, 127).value, (22 + -30) / 2, '칸 사이는 bilinear');
  assert.equal(calls.image.length, before, 'sampleAt 은 네트워크 0건');
  const px = store.pixelsNow('temp', 0);
  assert.deepEqual([px.w, px.h, px.channels, [...px.names], px.data.length], [720, 361, 1, ['R'], 720 * 361]);
  assert.equal(px.data[105 * 720 + 614], 204);
});

test('날짜변경선: 열 719 와 열 0 사이를 잇는다 · 경도는 몇 바퀴를 돌아도 같은 곳', async () => {
  // 열 719(179.5E) = 200, 열 0(180W) = 100, 나머지 0.
  const img = gray(720, 361, (r, c) => (c === 719 ? 200 : c === 0 ? 100 : 0));
  const { store } = harness(SCHEMA2, () => img);
  await store.load();
  await store.ensure('mslp', T0);
  const v = (lon) => store.sampleAt('mslp', T0, 10, lon).value;
  const hpa = (byte) => byte * 0.5 + 940;
  assert.equal(v(179.5), hpa(200));
  assert.equal(v(-180), hpa(100));
  assert.equal(v(180), hpa(100), '+180 과 −180 은 같은 열이다');
  assert.equal(v(179.75), hpa(150), '변경선 위 — 두 열의 가운데');
  assert.equal(v(179.75 + 360), hpa(150));
  assert.equal(v(-180.25), hpa(150));
  assert.equal(v(179.75 - 720), hpa(150));
});

test('극: 행 0 과 행 360 에서 멈춘다 — 극 너머를 지어내지 않는다', async () => {
  const img = gray(720, 361, (r) => (r === 0 ? 10 : r === 360 ? 250 : 128));
  const { store } = harness(SCHEMA2, () => img);
  await store.load();
  await store.ensure('temp', T0);
  const c = (lat) => store.sampleAt('temp', T0, lat, 33).value;
  assert.equal(c(90), 10 * 0.5 - 80);
  assert.equal(c(-90), 250 * 0.5 - 80);
  assert.equal(c(95), 10 * 0.5 - 80, '범위 밖 위도는 극 값');
  assert.equal(c(-91), 250 * 0.5 - 80);
  assert.equal(c(89.75), ((10 + 128) / 2) * 0.5 - 80);
  assert.equal(store.sampleAt('temp', T0, NaN, 33), null);
  assert.equal(store.sampleAt('temp', T0, 10, Infinity), null);
});

test('두 프레임 사이는 시간으로 섞는다 · 10 m 바람은 u·v 두 값', async () => {
  // f003: u 바이트 148 · v 108 / f006: u 168 · v 88 (B 는 늘 0)
  const frames = { 3: image(720, 361, () => [148, 108, 0, 255]), 6: image(720, 361, () => [168, 88, 0, 255]) };
  const { store, calls } = harness(SCHEMA2, (url) => (letterOf(url) === 'u' ? frames[hourOf(url)] : null));
  await store.load();
  const t = T0 + 3.75 * H;                                     // 3h 와 6h 의 1/4 지점
  const br = await store.ensure('wind10', t);
  assert.deepEqual([br.a.h, br.b.h, br.mix], [3, 6, 0.25]);
  assert.deepEqual(calls.image.map(hourOf).sort(), [3, 6]);
  const ms = (byte) => byte * (128 / 255) - 64;
  const s = store.sampleAt('wind10', t, 35, 129);
  assert.ok(Math.abs(s.values[0] - (ms(148) * 0.75 + ms(168) * 0.25)) < 1e-9);
  assert.ok(Math.abs(s.values[1] - (ms(108) * 0.75 + ms(88) * 0.25)) < 1e-9);
  assert.deepEqual([s.values.length, [...s.names], s.interpolated, s.mix, s.unit], [2, ['R', 'G'], true, 0.25, 'm/s']);
  assert.equal(store.pixelsNow('wind10', 3).channels, 2, 'B 는 버린다 — 사본이 절반이다');
  // 입자 이류용: 프레임당 한 번 만들고 out 을 다시 쓴다.
  const sm = store.sampler('wind10', t);
  const out = new Float32Array(2);
  assert.equal(sm.sample(35, 129, out), out);
  assert.ok(Math.abs(out[0] - s.values[0]) < 1e-5);
  assert.equal(store.sampler('wind10', T0 + 10 * H), null, 'f009·f012 를 아직 안 받았다');
});

test('디코드 상수는 매니페스트에서 읽는다 — 표를 바꾸면 값이 바뀐다', async () => {
  const img = gray(720, 361, () => 146);
  const run = async (mf) => {
    const { store } = harness(mf, () => img);
    await store.load();
    await store.ensure('mslp', T0);
    await store.ensure('temp', T0);
    return [store.sampleAt('mslp', T0, 0, 0).value, store.sampleAt('temp', T0, 0, 0).value];
  };
  assert.deepEqual(await run(SCHEMA2), [146 * 0.5 + 940, 146 * 0.5 - 80]);
  const moved = clone(SCHEMA2);                                // 기압 눈금이 바뀌는 날
  moved.fields.mslp.channels.R = { transfer: 'linear', scale: 0.25, offset: 980, min: 980, max: 1043.75, clamped: true };
  moved.fields.temp.channels.R.offset = -70;
  assert.deepEqual(await run(moved), [146 * 0.25 + 980, 146 * 0.5 - 70]);
});

test('log10 필드(apcp): 0 바이트는 0 mm · 풀고 나서 섞는다 · 구간 누적은 시간으로 섞지 않는다', async () => {
  const c = SCHEMA2.fields.apcp.channels.R;
  const mm = (byte) => 10 ** ((byte / 255) * c.logSpan + c.logLo);
  assert.equal(decodeByte({ ...c }, 0), 0);
  assert.ok(Math.abs(decodeByte({ ...c }, 255) - 250) < 1e-9);
  // 열 0 = 바이트 0(비 없음), 열 1 = 바이트 120. f003 은 전부 50.
  const frames = { 3: gray(720, 361, () => 50), 6: gray(720, 361, (r, col) => (col === 1 ? 120 : 0)) };
  const { store } = harness(SCHEMA2, (url) => frames[hourOf(url)]);
  await store.load();
  await store.ensure('apcp', T0 + 4 * H);
  const s = store.sampleAt('apcp', T0 + 4 * H, 0, -179.75);     // 열 0 과 열 1 의 가운데, 시각은 3h~6h 사이
  assert.ok(Math.abs(s.value - mm(120) / 2) < 1e-9, '0 mm 와 X mm 의 가운데는 X/2 다(바이트를 섞어 풀면 다른 값이 나온다)');
  assert.deepEqual([s.interpolated, s.window, s.a.h, s.b.h], [false, { fromH: 0, toH: 6 }, 3, 6],
    '4h 를 덮는 구간은 f006 의 0~6h 다 — f003 과 섞지 않는다');
  const exact = store.sampleAt('apcp', T0 + 3 * H, 0, 0);
  assert.ok(Math.abs(exact.value - mm(50)) < 1e-9);
  assert.deepEqual(exact.window, { fromH: 0, toH: 3 });
});

test('fields{} 에 없는 옛 프레임은 풀지 않는다 — 가장 가까운 칸의 바이트를 그대로', async () => {
  const cloud = image(720, 361, (r, c) => [r % 256, c % 256, 7, 200]);
  const wind = image(90, 46, (r, c) => [r, c, 0, 255]);
  const { store } = harness(SCHEMA2, (url) => (letterOf(url) === 'w' ? wind : cloud));
  await store.load();
  await store.ensure('cloud', T0 + 1 * H);
  await store.ensure('wind700', T0);
  const s = store.sampleAt('cloud', T0 + 1 * H, 37.4, 127.1);  // 가까운 칸 = 행 105 · 열 614
  assert.deepEqual([s.decoded, s.interpolated, s.unit, [...s.names]], [false, false, null, ['R', 'G', 'B', 'A']]);
  assert.deepEqual([...s.values], [105, 614 % 256, 7, 200]);
  // 700hPa 바람은 4° 묶음 평균(90×46): 37.5N → 행 13(38~34.5N), 127E → 열 76(124~127.5E)
  assert.deepEqual([...store.sampleAt('wind700', T0, 37.5, 127).values].slice(0, 2), [13, 76]);
  assert.equal(store.fieldSpec('wind700').grid.ni, 90);
  assert.equal(store.fieldSpec('wind700').cell, 'block');
});

test('받은 그림의 크기가 매니페스트 격자와 다르면 값을 읽지 않는다 (옛 세대 프레임 전례)', async () => {
  const stale = gray(360, 181, () => 200);                     // 격자는 720 인데 그림은 360 — main.js 주석의 실측 사고
  const { store } = harness(SCHEMA2, () => stale);
  await store.load();
  await store.ensure('temp', T0);
  assert.equal(store.pixelsNow('temp', 0).w, 360, '사본은 준다 — 무엇이 왔는지는 볼 수 있어야 한다');
  assert.equal(store.sampleAt('temp', T0, 37.5, 127), null);
});

test('모르는 디코드 식은 풀지 않는다', () => {
  const mf = clone(SCHEMA2);
  mf.fields.temp.channels.R = { transfer: 'gamma', g: 2.2 };
  const m = readManifest(mf);
  assert.equal(m.fields.temp.decodable, false);
  assert.equal(m.fields.mslp.decodable, true);
  assert.equal(readManifest(null), null);
  assert.equal(readManifest({ steps: 'x' }), null);
});

// ---------------------------------------------------------------- 텍스처 · 캐시

test('값 텍스처 설정: NoColorSpace · Linear · 밉맵 없음 · 경도 Repeat/위도 Clamp · flipY 는 건드리지 않는다', async () => {
  const img = gray(720, 361, () => 1);
  const { store } = harness(SCHEMA2, () => img);
  await store.load();
  const tex = await store.texture('temp', 0);
  assert.equal(tex.image, img);
  assert.deepEqual(
    [tex.colorSpace, tex.minFilter, tex.magFilter, tex.generateMipmaps, tex.wrapS, tex.wrapT, tex.needsUpdate],
    [FakeTHREE.NoColorSpace, FakeTHREE.LinearFilter, FakeTHREE.LinearFilter, false,
      FakeTHREE.RepeatWrapping, FakeTHREE.ClampToEdgeWrapping, true]);
  assert.equal(tex.flipY, true, 'THREE 기본 그대로 — 구름 프레임과 같은 방향(그림 첫 행 = 북 = v 1)');
  assert.equal(tex.premultiplyAlpha, false, '선곱하면 값이 깎인다');
  const bare = applyValueTextureDefaults(FakeTHREE, new FakeTHREE.Texture(null));
  assert.equal(bare.flipY, true);
  assert.equal(store.textureNow('temp', 0), tex);
  assert.equal(store.textureNow('temp', 3), null, '안 받은 장은 null — 받으러 가지 않는다');
});

test('같은 프레임을 동시에 여럿이 청해도 한 번만 받는다', async () => {
  const img = gray(720, 361, () => 9);
  const { store, calls } = harness(SCHEMA2, () => img);
  await store.load();
  const [a, b, px, c] = await Promise.all([
    store.texture('temp', 6), store.texture('temp', 6), store.pixels('temp', 6), store.texture('temp', 6),
  ]);
  assert.equal(calls.image.length, 1);
  assert.ok(a === b && b === c);
  assert.equal(px.data[0], 9);
  await store.texture('temp', 6);
  assert.equal(calls.image.length, 1, '캐시에 있으면 다시 받지 않는다');
  assert.equal(store.stats().frameFetches, 1);
});

test('받기에 실패한 프레임은 null 이고 캐시하지 않는다 — 다음에 다시 받는다', async () => {
  let ok = false;
  const img = gray(8, 4, () => 1);
  const { store, calls } = harness(SCHEMA2, () => (ok ? img : null));
  await store.load();
  assert.equal(await store.texture('temp', 3), null);
  ok = true;
  assert.notEqual(await store.texture('temp', 3), null);
  assert.equal(calls.image.length, 2);
});

test('LRU 가 바이트 상한을 지킨다 — 오래 안 쓴 장부터 버리고 텍스처를 dispose 한다', async () => {
  const one = 720 * 361 * 4;                                   // 받은 그림 한 장(RGBA)
  const { store, calls } = harness(SCHEMA2, () => gray(720, 361, () => 5), { maxBytes: one * 3 + 100 });
  await store.load();
  const t0 = await store.texture('temp', 0);
  await store.texture('temp', 3);
  await store.texture('temp', 6);
  assert.deepEqual([store.stats().entries, store.stats().bytes], [3, one * 3]);
  store.textureNow('temp', 0);                                 // 0h 를 방금 썼다 → 가장 오래된 것은 3h
  await store.texture('temp', 9);
  assert.ok(store.stats().bytes <= store.stats().maxBytes);
  assert.equal(store.stats().entries, 3);
  assert.equal(store.textureNow('temp', 3), null, '3h 가 쫓겨났다');
  assert.equal(store.textureNow('temp', 0), t0, '방금 쓴 0h 는 남았다');
  assert.equal(t0.disposed, false);
  // CPU 사본이 붙으면 그만큼 더 센다(회색은 1채널 = 1/4).
  await store.pixels('temp', 9);
  assert.ok(store.stats().bytes <= store.stats().maxBytes);
  assert.equal(store.stats().entries, 2, '사본 0.26 MB 가 붙어 상한을 넘었다 → 한 장 더 버린다');
  const n = calls.image.length;
  await store.texture('temp', 3);                              // 쫓겨난 장은 다시 받는다
  assert.equal(calls.image.length, n + 1);
  assert.ok(store.stats().evictions >= 2);
});

test('ByteLru: 상한보다 큰 한 장도 쥔다 · 쫓겨날 때 알린다', () => {
  const gone = [];
  const lru = new ByteLru(10, (v, k) => gone.push(k));
  lru.set('big', 'B', 50);
  assert.deepEqual([lru.size, lru.bytes], [1, 50], '한 장이 상한보다 커도 아무것도 못 쥐면 안 된다');
  lru.set('a', 'A', 4);
  assert.deepEqual(gone, ['big']);
  lru.set('b', 'B', 4);
  lru.get('a');
  lru.set('c', 'C', 4);
  assert.deepEqual(gone, ['big', 'b']);
  lru.resize('a', 9);
  assert.deepEqual([gone, lru.bytes], [['big', 'b', 'c'], 9]);
  lru.clear();
  assert.deepEqual([lru.size, lru.bytes, gone.length], [0, 0, 4]);
});

test('캐시 상한은 숫자다: 폰 32 MB · 데스크톱 128 MB', () => {
  assert.deepEqual(GFS_FRAMES_BUDGET, { desktop: 128 * 1024 * 1024, phone: 32 * 1024 * 1024 });
  assert.equal(budgetFor({ userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X)' }), GFS_FRAMES_BUDGET.phone);
  assert.equal(budgetFor({ userAgent: 'Mozilla/5.0 (Linux; Android 15; SM-S928N)' }), GFS_FRAMES_BUDGET.phone);
  assert.equal(budgetFor({ userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)', deviceMemory: 8 }), GFS_FRAMES_BUDGET.desktop);
  assert.equal(budgetFor({ userAgent: 'Mozilla/5.0 (X11; CrOS x86_64)', deviceMemory: 4 }), GFS_FRAMES_BUDGET.phone);
  assert.equal(budgetFor(undefined), GFS_FRAMES_BUDGET.desktop);
  // 폰 상한으로 41스텝 × 4필드를 다 쥘 수 없다 — 그래서 LRU 다.
  assert.ok(41 * 4 * 720 * 361 * 4 > GFS_FRAMES_BUDGET.phone * 5);
});

test('받는 사이 세대가 바뀐 프레임은 새 캐시에 넣지 않는다', async () => {
  const { store, state } = harness(SCHEMA2, () => gray(8, 4, () => 1));
  await store.load();
  const pending = store.texture('temp', 3);
  state.manifest = { ...clone(SCHEMA2), generatedAt: '2026-09-20T07:58:00Z' };
  await store.load();
  assert.equal(await pending, null);
  assert.equal(store.textureNow('temp', 3), null);
});

test('compactPixels: 쓰는 채널만 남긴다', () => {
  const rgba = Uint8Array.from([1, 2, 3, 4, 5, 6, 7, 8]);
  assert.deepEqual([...compactPixels(rgba, 2, 1, [0])], [1, 5]);
  assert.deepEqual([...compactPixels(rgba, 2, 1, [0, 1])], [1, 2, 5, 6]);
});

test('sharedGfsFrames 는 하나다 — 구름·색면·입자가 같은 캐시를 본다', () => {
  const a = sharedGfsFrames({ THREE: FakeTHREE });
  assert.equal(sharedGfsFrames(), a);
  assert.equal(sharedGfsFrames({ THREE: {} }), a);
});

// ---------------------------------------------------------------- main.js 가 저장소를 쓴다

test('CloudManager.loadGfs 는 매니페스트와 프레임 주소를 저장소에서 받는다 · 구름 텍스처 경로는 그대로다', () => {
  // 줄바꿈을 먼저 맞춘다 — 이 저장소는 autocrlf 라 같은 내용이 CRLF 로 체크아웃된다(79d9599a 의 교훈).
  const src = readFileSync(here('../../prototype/v2-three/js/main.js'), 'utf8').replace(/\r\n/g, '\n');
  // 파일 전체에 assert.match 를 쓰면 떨어질 때 6천 줄이 통째로 찍힌다 — 있다/없다만 본다.
  const has = (re, why) => assert.ok(re.test(src), why || String(re));
  has(/import \{ sharedGfsFrames \} from '\.\/gfs-frames\.js\?v=\d+';/);
  has(/\nconst gfsFrames = sharedGfsFrames\(\{ THREE \}\);\n/, '저장소는 모듈 맨 위에서 하나 — 구름 모드와 무관하게 있어야 한다');
  const body = /\n  async loadGfs\(\) \{\n([\s\S]*?)\n  \}\n\n  \/\/ 프레임 인덱스/.exec(src);
  assert.ok(body, 'loadGfs 를 찾지 못했다');
  const fn = body[1];
  assert.match(fn, /await gfsFrames\.load\(\)/);
  assert.match(fn, /gfsFrames\.frameUrl\(st\.file\)/);
  assert.match(fn, /gfsFrames\.frameUrl\(st\.wind\)/);
  assert.match(fn, /gfsFrames\.frameUrl\(st\.precip\)/);
  assert.doesNotMatch(fn, /\bfetch\(/, '매니페스트를 직접 읽는 곳이 둘이면 세대가 어긋난다');
  // 그대로여야 하는 것들
  assert.match(fn, /uGfsTexel\.value\.set\(1 \/ mf\.grid\.ni, 1 \/ mf\.grid\.nj\)/);
  assert.match(fn, /\.filter\(\(f\) => Number\.isFinite\(f\.t\) && f\.wind\)\.sort\(\(a, b\) => a\.t - b\.t\)/);
  assert.equal((fn.match(/return this\.loadGfsPoints\(\)/g) || []).length, 3, '지점 방식 폴백 세 곳');
  const texAt = /\n  frameTexAt\(i\) \{\n([\s\S]*?)\n  \}\n/.exec(src)[1];
  assert.match(texAt, /new THREE\.TextureLoader\(\)/, '구름 프레임은 아직 자기 캐시(texCache)로 받는다');
  has(/\n  prefetchFrames\(\) \{\n/, '지연 프리페치는 그대로다');
  has(/window\.__earthus\.frames = gfsFrames;/, '본 세션이 콘솔에서 확인하는 손잡이');
});
