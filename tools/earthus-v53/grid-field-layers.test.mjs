// DEV-DIRECTIVE 2026-09-20 · 작업 D3 — 바다 3종(수온 · 파고 · 평년 대비 수온)과 대기질이 W1 색면으로 도는지.
//
// 금지만 보면 아무것도 안 켜는 배선이 통과한다 — **결과**를 본다:
//   · descriptor 넷이 눈금표·저장소와 맞물린다(자외선은 눈금이 없어 없다)
//   · 눈금표 한 줄을 바꾸면 색·범례·등치선이 같이 바뀐다 · 수온 26·29 강조선 · 편차 0 선 · 파고 경계선
//   · 타임라인이 '지금'이 아니면 색면이 숨고 카드·범례가 '현재 시각만'이라고 말한다
//   · 카드가 자료의 격자 크기와 성질(관측 분석장)을 사실대로 말한다
//   · 결측 칸이 카드의 '모델 범위'에도 라벨의 등치선에도 끼지 않는다
//   · 같은 파일을 쓰는 두 레이어가 저장소를 나눠 쓴다
//   · 옛 가림판 경로가 이 레이어들에서 빠졌고, refresh·onExaggerChanged 가 되살리지 못한다
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import './../v2-test-dom.mjs';

const lf = (s) => String(s).replace(/\r\n/g, '\n');
const src = (rel) => lf(readFileSync(new URL(`../../prototype/v2-three/js/${rel}`, import.meta.url), 'utf8'));

const {
  FIELD_DESCRIPTORS, FieldLayer, fieldCardInner, fullRangeOf, isFieldLayerId, readoutOf, statusText, timeMeta,
} = await import('../../prototype/v2-three/js/field-layer.js');
const { GRID_SOURCES, createGridFrames, encodeByte } = await import('../../prototype/v2-three/js/grid-frames.js');
const { isolineSpec, legendModel, scaleOf } = await import('../../prototype/v2-three/js/field-scales.js');
const { isolineUniforms } = await import('../../prototype/v2-three/js/field-renderer.js');
const { thinField, traceContours } = await import('../../prototype/v2-three/js/field-labels.js');

const NOW = Date.parse('2026-09-20T06:00:00Z');
const PORTED = ['sstfield', 'sstanom', 'wavefield', 'pm25grid'];

// 값 텍스처만 만들면 된다 — 저장소는 THREE 의 나머지를 모른다(gfs-frames.test.mjs 와 같은 가짜).
const FakeTHREE = {
  RepeatWrapping: 1000, ClampToEdgeWrapping: 1001, NearestFilter: 1003, LinearFilter: 1006,
  NoColorSpace: '', RGBAFormat: 1023,
  DataTexture: class {
    constructor(data, width, height, format) {
      Object.assign(this, { data, width, height, format, isDataTexture: true, flipY: false, disposed: false });
    }

    dispose() { this.disposed = true; }
  },
};

// ── descriptor ──────────────────────────────────────────────────────────────────────────────────────────────

test('넷이 새 길을 타고, 자외선은 색을 지어내지 않아 아직 없다', () => {
  for (const id of PORTED) {
    const d = FIELD_DESCRIPTORS[id];
    assert.ok(d, `'${id}' descriptor 가 없다 — 옛 그라데이션으로 돌아간다`);
    assert.equal(d.layerId, id, '레이어 id 는 개명하지 않는다');
    assert.equal(isFieldLayerId(id), true);
    assert.ok(GRID_SOURCES[d.source], `'${id}' 가 모르는 자료 '${d.source}' 를 가리킨다`);
    assert.ok(GRID_SOURCES[d.source].fields[d.fieldId], `'${d.source}' 에 필드 '${d.fieldId}' 가 없다`);
    assert.ok(scaleOf(d.scaleId), `'${id}' 의 눈금 '${d.scaleId}' 가 표에 없다`);
    assert.equal(d.missing, true, '결측을 셈하지 않으면 해안에 가짜 값 띠가 선다');
    assert.equal(d.clip, true, '격자 밖을 버리지 않으면 가장자리 칸이 극·지구 반대편까지 늘어난다');
  }
  assert.equal(isFieldLayerId('uvgrid'), false, '자외선은 PD 표에 색 눈금이 없다 — 색을 지어내지 않는다');
  // 바다 3종만 셰이더 해안선(고도 ≥ 0 에서 버림)을 쓴다. 대기질은 육지 위에도 값이 있는 것이 맞다.
  assert.deepEqual(PORTED.map((id) => FIELD_DESCRIPTORS[id].mask), ['ocean', 'ocean', 'ocean', 'none']);
  assert.deepEqual(PORTED.map((id) => FIELD_DESCRIPTORS[id].badge), ['OBSERVED', 'OBSERVED', 'MODEL', 'MODEL']);
});

test('눈금표 한 줄을 바꾸면 색·범례·등치선이 같이 움직인다', () => {
  // 수온 26·29 강조 · 편차 0 선 · 파고는 경계가 곧 선이다 — 셋 다 표에서만 온다.
  const sst = isolineSpec(scaleOf('sst'));
  assert.equal(sst.interval, 1, '수온 등온선 1 °C');
  assert.deepEqual([...sst.emphasize], [26, 29]);
  const anom = isolineSpec(scaleOf('sstAnom'));
  assert.deepEqual([...anom.emphasize], [0], '평년과 같음(0) 선이 굵어야 한다');
  assert.ok(anom.levels.includes(0));
  const wave = isolineSpec(scaleOf('wave'));
  assert.deepEqual([...wave.levels], [...scaleOf('wave').breaks], '파고는 색 경계가 곧 등치선이다');
  assert.deepEqual([...wave.levels], [1, 2, 3, 4, 6, 9]);
  assert.equal(isolineSpec(scaleOf('pm25')), null, 'PM2.5 등치선은 표에 없다 — 단추를 그리면 죽은 토글이다');

  // 셰이더가 받는 uniform 도 같은 표에서 나온다(강조값이 굵은 선으로).
  const u = isolineUniforms(sst);
  assert.equal(u.levelCount, 2);
  assert.deepEqual([u.levels[0], u.levels[1]], [26, 29]);
  assert.ok(u.widths[0] > 1 && u.widths[1] > 1, '강조값이 굵게 들어가지 않았다');
  const uw = isolineUniforms(wave);
  assert.equal(uw.levelCount, 6);
  // 범례도 같은 표다.
  assert.equal(legendModel(scaleOf('sst')).length, scaleOf('sst').breaks.length + 1);
  assert.equal(legendModel(scaleOf('wave'))[0].label, '< 1 m');
});

// ── 저장소를 물린 FieldLayer ────────────────────────────────────────────────────────────────────────────────

// 합성 문서 — 값은 위도로만 만든다(남북이 뒤집히면 카드의 범위가 바뀐다). land(lat, lon) 이 참이면 결측.
const makeDoc = (shape, key, value, land, extra) => {
  const arr = new Array(shape.nx * shape.ny);
  for (let y = 0; y < shape.ny; y += 1) {
    for (let x = 0; x < shape.nx; x += 1) {
      const lat = shape.lat0 + y * shape.res;
      const lon = shape.lon0 + x * shape.res;
      arr[y * shape.nx + x] = land(lat, lon) ? null : value(lat, lon);
    }
  }
  return { res: shape.res, nx: shape.nx, ny: shape.ny, lat0: shape.lat0, lon0: shape.lon0, [key]: arr, ...extra };
};
const SST_SHAPE = { res: 1, nx: 360, ny: 161, lat0: -79.875, lon0: -179.875 };

// 북반구 중위도만 바다인 합성 수온. 나머지는 결측(육지).
const sstDoc = () => makeDoc(SST_SHAPE, 'sst',
  (lat) => 30 - Math.abs(lat - 20) * 0.4,
  (lat) => !(lat > 5 && lat < 45),
  { observed: '2026-09-18T00:00:00Z', issuedAt: '2026-09-20T03:48:42Z' });

const rig = (id, doc, opts = {}) => {
  const desc = FIELD_DESCRIPTORS[id];
  let fetches = 0;
  const frames = createGridFrames(GRID_SOURCES[desc.source], {
    THREE: FakeTHREE,
    now: () => NOW,
    fetch: () => { fetches += 1; return Promise.resolve({ ok: true, json: async () => doc }); },
  });
  let offsetMs = 0;
  const subs = new Set();
  const timeBus = {
    validMs: () => NOW + offsetMs,
    isNow: () => Math.abs(offsetMs) < 60000,
    on(fn) { subs.add(fn); fn(offsetMs); return () => subs.delete(fn); },
    listeners: () => subs.size,
    set(ms) { offsetMs = ms; for (const fn of [...subs]) fn(ms); },
  };
  const legend = { last: null, shown: false, show(v) { this.last = v; this.shown = true; }, release() { this.shown = false; } };
  const layer = new FieldLayer(desc, {
    frames, timeBus, legend, doc: null, now: () => NOW,
    setInterval: () => 0, clearInterval: () => {},
    // 라벨의 글자 텍스처는 캔버스를 쓴다 — 노드에서는 가짜로(field-layer.test.mjs 와 같은 관례).
    makeLabelTexture: (text) => ({ tex: { text, dispose() {} }, w: 92, h: 40 }),
    heightAt: opts.heightAt || null, segments: [8, 4],
  });
  return { layer, frames, timeBus, legend, fetches: () => fetches };
};

test('수온 색면이 켜지고, 카드가 격자 크기와 성질을 사실대로 말한다', async () => {
  const r = rig('sstfield', sstDoc());
  const st = await r.layer.on();
  assert.equal(st.on, true, st.error);
  assert.equal(r.layer.renderer.mesh.visible, true);
  assert.equal(r.layer.renderer.material.defines.FIELD_MASK_OCEAN, 1);
  assert.equal(r.layer.renderer.material.defines.FIELD_MISSING_MASK, 1);
  assert.equal(r.layer.renderer.material.defines.FIELD_CLIP_OUTSIDE, 1);
  const html = r.layer.cardHtml();
  assert.match(html, /OBSERVED · NOAA OISST v2\.1 1°/, "남의 기관 자료를 'NOAA GFS' 라고 부르면 안 된다");
  assert.match(html, /기준 09\/18 09:00 KST/, "한 시각짜리 자료에 '런'과 '유효'를 적으면 안 된다");
  assert.doesNotMatch(html, /런 /);
  assert.match(html, /1° 격자\(약 110 km\) 한 칸의 표본/, '격자 크기를 말하지 않는다 — 매끈하다고 해상도가 오른 것이 아니다');
  assert.match(html, /모델이 아니라 하루치 관측 분석장/, '관측 분석장을 모델값이라 부른다');
  assert.match(html, /등온선 1 °C/);
  assert.match(html, /26\.0 °C · 29\.0 °C 는 굵게/);
  assert.match(html, /한 시각짜리 한 장/);
  // 범례의 주인이 되고 '유효'는 타임라인이 아니라 자료의 기준 시각이다.
  assert.equal(r.legend.shown, true);
  assert.equal(r.legend.last.run, null);
  assert.equal(r.legend.last.valid, Date.parse('2026-09-18T00:00:00Z'));
  r.layer.off();
});

test("타임라인을 밀면 숨고 '현재 시각만 있습니다'라고 말한다 — 예보인 척하지 않는다", async () => {
  const r = rig('sstfield', sstDoc());
  await r.layer.on();
  assert.equal(r.layer.renderer.mesh.visible, true);
  r.timeBus.set(6 * 3600_000);
  assert.equal(r.layer.renderer.mesh.visible, false, '한 장을 6시간 뒤의 예보로 늘여 칠했다');
  assert.equal(r.layer.labels.group.visible, false);
  assert.match(r.legend.last.note, /현재 시각만 있습니다/);
  assert.match(r.layer.cardHtml(), /현재 시각만 있습니다/);
  assert.doesNotMatch(r.layer.cardHtml(), /예보 범위 밖/);
  // 값도 말하지 않는다.
  assert.match(r.layer.readoutNote(30, 130).html, /현재 시각의 자료만 있습니다/);
  r.timeBus.set(0);
  assert.equal(r.layer.renderer.mesh.visible, true, '지금으로 되돌리면 다시 보여야 한다');
  r.layer.off();
});

test('누른 곳 — 바다에서는 값을, 육지에서는 값이 없다고 말한다', async () => {
  const heightAt = (lat, lon) => ((lat > 35 && lat < 40 && lon > 125 && lon < 130) ? 40 : -3000);
  const r = rig('sstfield', sstDoc(), { heightAt });
  await r.layer.on();
  const sea = r.layer.readoutNote(20, 140);
  assert.equal(sea.badge, 'OBSERVED', "관측 분석장에 'MODEL_SIGNAL' 을 찍으면 안 된다");
  assert.match(sea.title, /관측 격자값/);
  assert.match(sea.html, /~30\.0 °C/);
  assert.match(sea.html, /1° 격자\(약 110 km\) 표본 · 0\.2 °C 눈금/);
  const land = r.layer.readoutNote(37.5, 127);
  assert.equal(land.badge, 'UNAVAILABLE');
  assert.match(land.html, /육지입니다 — 이 바다 자료에는 값이 없습니다/);
  r.layer.off();
});

test("결측은 카드의 '모델 범위'에도 라벨의 등치선에도 끼지 않는다", async () => {
  const r = rig('sstfield', sstDoc());
  await r.layer.on();
  // 합성 자료의 실제 범위는 −10 °C(결측의 자리값)가 아니라 바다 칸의 범위다.
  assert.ok(r.layer.stats.min > 0, `결측의 자리값이 범위에 들어왔다: ${r.layer.stats.min}`);
  assert.ok(r.layer.stats.max <= 30.1 && r.layer.stats.max >= 29.8, `${r.layer.stats.max}`);
  assert.match(r.layer.cardHtml(), /모델 범위/);
  r.layer.off();

  // fullRangeOf 를 직접: 결측 칸의 값 바이트가 아무리 커도 범위에 안 들어간다.
  const ch = [{ name: 'R', transfer: 'linear', scale: 0.2, offset: -10 }, { name: 'G', role: 'mask', transfer: 'linear', scale: 1, offset: 0 }];
  const data = new Uint8Array([encodeByte(20, ch[0]), 255, 255, 0, encodeByte(22, ch[0]), 255]);
  const range = fullRangeOf({ data, channels: 2 }, null, ch, 'scalar');
  assert.deepEqual([Math.round(range.min * 10) / 10, Math.round(range.max * 10) / 10], [20, 22]);
});

test('결측이 닿은 칸에는 등치선을 긋지 않는다 — 해안마다 가짜 선이 서지 않는다', () => {
  const grid = { ni: 4, nj: 3, lon0: -180, lat0: 60, dLon: 90, dLat: 60, wraps: false };
  const channels = [{ transfer: 'linear', scale: 0.2, offset: -10 }, { role: 'mask', transfer: 'linear', scale: 1, offset: 0 }];
  const enc = (v) => encodeByte(v, channels[0]);
  // 위 행은 28 °C 바다, 아래 두 행은 결측(육지). 26 °C 선은 '28 과 −10 사이'에 생길 자리가 없어야 한다.
  const data = new Uint8Array(4 * 3 * 2);
  for (let i = 0; i < 4; i += 1) { data[i * 2] = enc(28); data[i * 2 + 1] = 255; }
  const px = { w: 4, h: 3, channels: 2, data };
  const thin = thinField({ pxA: px, channels, grid, stepDeg: 60 });
  assert.ok(Number.isNaN(thin.mid[4]), '결측 칸이 값으로 읽힌다');
  assert.equal(thin.min, 28, `결측의 자리값이 최솟값이 됐다: ${thin.min}`);
  assert.deepEqual(traceContours(thin, 26), [], '육지와 바다 사이에 가짜 26 °C 등온선이 섰다');
  // 값이 있는 칸끼리는 여느 때처럼 긋는다.
  for (let i = 0; i < 4; i += 1) { data[(4 + i) * 2] = enc(20); data[(4 + i) * 2 + 1] = 255; }
  const ok = thinField({ pxA: px, channels, grid, stepDeg: 60 });
  assert.ok(traceContours(ok, 26).length > 0, '값 칸끼리도 선이 안 선다');
});

test('같은 파일을 쓰는 레이어는 저장소를 나눠 쓴다 — 파일을 두 번 받지 않는다', async () => {
  // 편차 문서에는 sst 와 sstAnom 이 같이 들어 있다. 저장소는 자료마다 하나다(sharedGridFrames).
  const shape = { res: 0.5, nx: 73, ny: 49, lat0: 23.125, lon0: 114.125 };
  const doc = makeDoc(shape, 'sstAnom', (lat) => (lat - 35) * 0.1, () => false,
    { observed: '2026-09-20T06:00:00Z', sst: new Array(73 * 49).fill(24) });
  const r = rig('sstanom', doc);
  await r.layer.on();
  assert.equal(r.fetches(), 1);
  assert.equal(r.frames.has('sst'), true, '같은 파일의 다른 값 배열도 같은 저장소가 안다');
  assert.equal(r.frames.stats().builds, 1, '켤 때 값 텍스처를 한 번만 짓는다');
  assert.match(r.layer.cardHtml(), /0\.5° 격자\(약 55 km\)/);
  assert.match(r.layer.cardHtml(), /관측에서 1991~2020 평년을 뺀 값/);
  r.layer.off();
});

test('파고와 대기질도 같은 길로 돈다 — 파고만 바다를 가린다', async () => {
  const shape = { res: 5, nx: 72, ny: 33, lat0: -80, lon0: -180 };
  const wave = rig('wavefield', makeDoc(shape, 'wave', (lat) => 1 + Math.abs(lat) / 20, (lat) => Math.abs(lat) > 70,
    { time: '2026-09-20T06:00:00Z' }));
  assert.equal((await wave.layer.on()).on, true);
  assert.equal(wave.layer.renderer.material.defines.FIELD_MASK_OCEAN, 1);
  assert.match(wave.layer.cardHtml(), /MODEL · Open-Meteo Marine 경유 5°/);
  assert.match(wave.layer.cardHtml(), /5° 격자\(약 555 km\)/);
  assert.match(wave.layer.cardHtml(), /등파고선/);
  wave.layer.off();

  const air = rig('pm25grid', makeDoc(shape, 'pm25', (lat) => 10 + Math.abs(lat), () => false, { time: '2026-09-20T06:00:00Z' }));
  assert.equal((await air.layer.on()).on, true);
  assert.equal(air.layer.renderer.material.defines.FIELD_MASK_OCEAN, undefined, '대기질은 육지 위에도 값이 있는 것이 맞다');
  assert.equal(air.layer.renderer.material.defines.FIELD_MISSING_MASK, 1);
  const html = air.layer.cardHtml();
  assert.match(html, /MODEL · Open-Meteo Air Quality \(CAMS\) 경유 5°/);
  assert.doesNotMatch(html, /data-action="field-iso"/, 'PM2.5 등치선은 표에 없다 — 죽은 토글을 그리면 안 된다');
  // 수온·파고 카드에는 그 단추가 있다(등치선은 필수다).
  assert.match(wave.layer.cardHtml(), /data-action="field-iso"/);
  assert.match(air.layer.readoutNote(35, 130).html, /5 µg\/m³ 눈금/);
  air.layer.off();
});

test('자료 파일을 못 받으면 그라데이션으로 물러나지 않고 이유를 말한다', async () => {
  const desc = FIELD_DESCRIPTORS.wavefield;
  const frames = createGridFrames(GRID_SOURCES[desc.source], { now: () => NOW, fetch: async () => ({ ok: false }) });
  const legend = { show() {}, release() {} };
  const layer = new FieldLayer(desc, { frames, timeBus: { validMs: () => NOW, on: () => () => {} }, legend, segments: [8, 4] });
  const st = await layer.on();
  assert.equal(st.on, false);
  assert.match(st.error, /^자료 없음 — 이 자료 파일을 받지 못했습니다/);
  assert.doesNotMatch(st.error, /예보 목록/, "JSON 격자를 못 받은 것을 '예보 목록' 탓으로 적으면 안 된다");
});

// ── 글자와 배선 ─────────────────────────────────────────────────────────────────────────────────────────────

test('기온·풍속의 글은 한 글자도 안 바뀐다 — 한 시각 자료의 말은 따로 붙는다', () => {
  const info = { model: 'GFS', resolutionDeg: 0.5, runMs: Date.parse('2026-09-20T00:00:00Z') };
  assert.deepEqual(timeMeta(info, Date.parse('2026-09-20T01:30:00Z'), true), ['런 09/20 00Z', '유효 09/20 10:30 KST']);
  assert.deepEqual(timeMeta({ single: true, validMs: Date.parse('2026-09-18T00:00:00Z') }, NOW, true), ['기준 09/18 09:00 KST']);
  assert.deepEqual(timeMeta({ single: true, validMs: NOW, delayed: true }, NOW, true), ['기준 09/20 15:00 KST · 지연']);
  const m = {
    id: 'tempgrid', desc: FIELD_DESCRIPTORS.tempgrid, scale: scaleOf('temp'), info, ko: true,
    validMs: Date.parse('2026-09-20T01:30:00Z'), status: { kind: 'exact', a: { t: NOW } },
    isoOn: true, isoChoice: '5', choices: ['2', '5'], stats: null, probe: null,
  };
  const html = fieldCardInner(m);
  assert.match(html, /이 색면은 <b>관측이 아니라 수치예보 모델값<\/b>입니다 — 0\.5° 격자\(약 55 km\) 한 칸의 평균이라/);
  assert.match(html, /타임라인을 밀면 5일 예보가 3시간 간격 프레임 사이를/);
  assert.match(html, /모델 프레임 그대로/);
  // 한 시각 자료의 '예보 범위 밖'은 다른 말이다.
  assert.match(statusText({ kind: 'outOfRange', side: 'after', single: true }), /현재 시각만 있습니다/);
  assert.match(statusText({ kind: 'outOfRange', side: 'after', first: NOW, last: NOW }), /예보 범위 밖/);
  assert.match(readoutOf({ decoded: true, value: 20, values: [20], outOfRange: 'after', single: true }, { scale: scaleOf('sst') }).text,
    /현재 시각의 자료만/);
});

test('옛 가림판 경로가 이 레이어들에서 빠졌다 — refresh·과장 변경이 되살리지 못한다', () => {
  const live = src('live-layers.js');
  // 켜고 끄기 · 갱신 · 과장 변경 — 세 문이 모두 isFieldLayerId 에서 갈린다.
  assert.match(live, /if \(isFieldLayerId\(id\)\) return toggleFieldLayer\(this, id\);/);
  assert.match(live, /if \(isFieldLayerId\(id\)\) return false;/);
  assert.match(live, /if \(isFieldLayerId\(id\)\) continue;/);
  // 새 길에서는 가림판을 부르지 않는다 — 두 모듈 어디에도 그 부품을 들여오거나 부르는 줄이 없다(주석의 언급은 셈하지 않는다).
  for (const rel of ['field-layer.js', 'grid-frames.js']) {
    const code = src(rel).replace(/^\s*\/\/.*$/gm, '');
    assert.doesNotMatch(code, /ocean-land-mask|oceanMask\(|erodedGridNodes|alphaMap/, `${rel} 이 옛 가림판을 부른다`);
  }
  // 메뉴가 격자 크기와 '한 시각'을 말한다.
  const shell = src('ui-shell.js');
  assert.match(shell, /id: 'sstfield'[^}]*1° 격자\(약 110 km\)/);
  assert.match(shell, /id: 'wavefield'[^}]*5° 격자\(약 555 km\) · 현재 시각/);
  assert.match(shell, /id: 'pm25grid'[^}]*5°\(약 555 km\) · 현재 시각/);
  assert.match(shell, /id: 'sstanom'[^}]*동아시아 0\.5° 격자/);
});
