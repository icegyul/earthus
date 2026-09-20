// 옛 프레임 3종(cloud · wind700 · precip)의 디코드 상수가 매니페스트 fields{} 에 실리면 공용 저장소
// (prototype/v2-three/js/gfs-frames.js)가 **코드 수정 없이** 값을 푼다 — 2026-09-20 C1. 결과를 시험한다.
//
// 픽스처(fixtures/gfs-fc-manifest-c1-legacy.json)는 손으로 친 JSON 이 아니다. aws/gfs-cloud-forecast/handler.py 의
// field_specs() 가 낸 그대로이고, 파이썬 시험(test_field_frames.py C1FixtureLock)이 파일과 handler 의 상수가
// 같은지 잠근다 — 인코더를 바꾸면 그쪽이 먼저 떨어지고, 픽스처를 다시 만들면 이 시험이 새 매니페스트를 본다.
// 여기서는 상수를 다시 적지 않는다. 기대값은 전부 픽스처의 숫자에서 셈한다.
import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';

import { createGfsFrames, decodeByte, readManifest } from '../../prototype/v2-three/js/gfs-frames.js';

const C1 = JSON.parse(readFileSync(new URL('./fixtures/gfs-fc-manifest-c1-legacy.json', import.meta.url), 'utf8'));
const H = 3.6e6;
const T0 = Date.parse(C1.run);
const clone = (x) => JSON.parse(JSON.stringify(x));

const FakeTHREE = {
  RepeatWrapping: 1000, ClampToEdgeWrapping: 1001, LinearFilter: 1006, NoColorSpace: '',
  Texture: class { constructor(image) { this.image = image; } dispose() {} },
};

// 가짜 그림 {width, height, rgba}. fill(row, col) → [r, g, b, a]
function image(w, h, fill) {
  const rgba = new Uint8Array(w * h * 4);
  for (let r = 0; r < h; r += 1) for (let c = 0; c < w; c += 1) rgba.set(fill(r, c), (r * w + c) * 4);
  return { width: w, height: h, rgba };
}

function storeWith(images) {
  return createGfsFrames({
    THREE: FakeTHREE,
    now: () => T0,
    fetch: async () => ({ ok: true, json: async () => clone(C1) }),
    loadImage: async (url) => images(url),
    readPixels: (img) => ({ w: img.width, h: img.height, data: img.rgba }),
  });
}

const hourOf = (url) => Number(/(\d{3})\.png/.exec(url)[1]);
// log 채널에서 값 v 에 가장 가까운 바이트(인코더의 반올림과 같은 자리) — 픽스처의 상수로만 셈한다.
const logByte = (ch, v) => Math.round(((Math.log10(v) - ch.logLo) / ch.logSpan) * 255);
const SEOUL = { lat: 37.5, lon: 127, row: 105, col: 614 };          // 0.5° 점 격자(gfs-frames.js 머리 주석)

test('C1 매니페스트: 옛 셋이 decodable 이고, 저장소가 아는 양만 채널로 실렸다', () => {
  const m = readManifest(C1);
  const names = (id) => m.fields[id].channels.map((c) => c.name);
  assert.equal(m.fields.precip.decodable, true, 'W4 가 강수율을 값으로 읽을 수 있다');
  assert.equal(m.fields.cloud.decodable, true);
  assert.equal(m.fields.wind700.decodable, true);
  assert.deepEqual([names('precip'), names('cloud'), names('wind700')], [['R'], ['A'], ['R', 'G']],
    '종류 부호(precip.G)·유도값(precip.B · 구름 회색)은 채널이 아니다 — 실리면 저장소가 칸·시간으로 섞는다');
  assert.deepEqual([m.fields.precip.unit, m.fields.cloud.unit, m.fields.wind700.unit], ['mm/h', 'kg/m^2', 'm/s']);
  assert.deepEqual([m.fields.precip.channels[0].transfer, m.fields.cloud.channels[0].transfer,
    m.fields.wind700.channels[0].transfer], ['log10', 'log10', 'linear']);
  // 스텝 키는 개명하지 않았다(file · wind · precip) — 틀리면 프레임 목록이 빈다.
  assert.deepEqual([m.fields.cloud.stepKey, m.fields.wind700.stepKey, m.fields.precip.stepKey], ['file', 'wind', 'precip']);
  for (const id of ['cloud', 'wind700', 'precip']) {
    assert.deepEqual(m.frames[id].map((f) => f.h), C1.steps.map((s) => s.h), id);
    assert.equal(m.fields[id].windowed, false, `${id}: 순간값이다 — 구간 누적(apcp)처럼 다루지 않는다`);
  }
  assert.match(m.frames.precip[1].url, /\/clouds\/gfs-fc\/2026092000\/p003\.png\?g=/);
  // 새 넷은 그대로 풀린다.
  for (const id of ['temp', 'wind10', 'mslp', 'apcp']) assert.equal(m.fields[id].decodable, true, id);
  // 설명 칸(notDecoded · cellMean)은 저장소가 읽지 않는다 — 있어도 탈이 없다.
  assert.ok(C1.fields.precip.notDecoded.G && C1.fields.cloud.notDecoded.gray && C1.fields.wind700.cellMean);
});

test('강수율 R: 바이트 0 = 비 없음(0) · 255 = 천장 · 사이는 log — 상수는 매니페스트에서만', () => {
  const ch = readManifest(C1).fields.precip.channels[0];
  assert.equal(decodeByte(ch, 0), 0, '0 바이트는 10^logLo(=min)가 아니라 0 이다');
  assert.ok(Math.abs(decodeByte(ch, 255) - ch.max) < 1e-9, '끝값');
  assert.ok(decodeByte(ch, 1) > ch.min && decodeByte(ch, 1) < decodeByte(ch, 2), '첫 눈금은 min 바로 위 · 단조 증가');
  const halfTick = ch.logSpan / 255 / 2;
  for (const mmh of [0.1, 0.5, 1, 2, 5, 10, 20]) {              // W4 구간색의 경계로 쓸 법한 값들
    const got = decodeByte(ch, logByte(ch, mmh));
    assert.ok(Math.abs(Math.log10(got) - Math.log10(mmh)) <= halfTick + 1e-12, `${mmh} mm/h → ${got}`);
  }
  // 표를 바꾸면 값이 따라 바뀐다 — 저장소에 박힌 숫자가 없다.
  const wider = clone(C1);
  wider.fields.precip.channels.R.logSpan += 1;
  assert.ok(decodeByte(readManifest(wider).fields.precip.channels[0], 255) > ch.max * 9);
});

test('저장소로 끝까지: 강수 프레임의 한 점을 mm/h 로 읽고, 프레임 사이는 값으로 섞는다', async () => {
  const ch = readManifest(C1).fields.precip.channels[0];
  const b5 = logByte(ch, 5);
  // f000 은 전 칸 0(비 없음). f003 은 서울 칸만 5 mm/h — 그 칸의 G 는 눈(255), B 는 77 이다.
  const frames = {
    0: image(720, 361, () => [0, 0, 0, 255]),
    3: image(720, 361, (r, c) => ((r === SEOUL.row && c === SEOUL.col) ? [b5, 255, 77, 255] : [0, 0, 0, 255])),
  };
  const store = storeWith((url) => frames[hourOf(url)]);
  await store.load();
  await store.ensure('precip', T0 + 3 * H);
  const s = store.sampleAt('precip', T0 + 3 * H, SEOUL.lat, SEOUL.lon);
  assert.deepEqual([s.decoded, s.unit, [...s.names], s.exact, s.interpolated], [true, 'mm/h', ['R'], true, false]);
  assert.ok(Math.abs(s.value - decodeByte(ch, b5)) < 1e-12);
  assert.ok(Math.abs(Math.log10(s.value) - Math.log10(5)) <= ch.logSpan / 255 / 2 + 1e-12, `${s.value} ≈ 5 mm/h`);
  assert.equal(s.values.length, 1, '종류 부호·뇌우는 값으로 나오지 않는다');
  const dry = store.sampleAt('precip', T0 + 3 * H, -30, 10);
  assert.equal(dry.value, 0);

  await store.ensure('precip', T0 + 1.5 * H);
  const mid = store.sampleAt('precip', T0 + 1.5 * H, SEOUL.lat, SEOUL.lon);
  assert.equal(mid.interpolated, true, '모델 프레임 사이 보간이라고 밝힌다');
  assert.ok(Math.abs(mid.value - decodeByte(ch, b5) / 2) < 1e-12, '0 과 X 의 가운데는 X/2 — 바이트가 아니라 값을 섞는다');

  // 알아둘 것: 채널이 실리면 CPU 사본은 그 채널만 남긴다 — pixels('precip') 에 G·B 는 없다(gfs-frames.js attachPixels).
  // 종류(비/눈)를 클릭 값에 보이려면 저장소에 범주 채널 표현이 먼저 필요하다. 지금은 텍스처(GPU)에만 있다.
  const px = store.pixelsNow('precip', 3);
  assert.deepEqual([px.channels, [...px.names]], [1, ['R']]);
});

test('구름 알파: CWAT 를 kg/m² 로 읽는다 — 끝 바이트는 255 가 아니라 maxByte', async () => {
  const spec = C1.fields.cloud.channels.A;
  const ch = readManifest(C1).fields.cloud.channels[0];
  assert.equal(decodeByte(ch, 0), 0);
  assert.ok(Math.abs(decodeByte(ch, spec.maxByte) - spec.max) < 1e-12);
  assert.equal(spec.maxByte % spec.byteStep, 0);
  assert.ok(spec.maxByte < 255 && spec.maxByte + spec.byteStep > 255, '내림 눈금에서 닿을 수 있는 가장 큰 바이트');
  const cloud = image(720, 361, (r, c) => ((r === SEOUL.row && c === SEOUL.col) ? [80, 80, 80, 128] : [0, 0, 0, 0]));
  const store = storeWith(() => cloud);
  await store.load();
  await store.ensure('cloud', T0);
  const s = store.sampleAt('cloud', T0, SEOUL.lat, SEOUL.lon);
  assert.deepEqual([s.decoded, s.unit, [...s.names]], [true, 'kg/m^2', ['A']], '회색(운정고도, DERIVED)은 값으로 나오지 않는다');
  assert.ok(Math.abs(s.value - 10 ** ((128 / 255) * spec.logSpan + spec.logLo)) < 1e-12);
});

test('700hPa 바람: 4° 묶음 평균을 "묶음 가운데의 점 격자"로 읽는다 — 값이 제자리에 놓인다', async () => {
  const m = readManifest(C1);
  const f = m.fields.wind700;
  // 저장소는 fields{} 에 실린 격자를 점 격자로 읽는다(묶음을 뜻하는 칸이 없다). 그 전제 위에서 매니페스트가 원점을
  // 묶음의 가운데로 적었다 — 저장소가 언젠가 묶음 격자를 따로 다루게 되면 이 단언이 먼저 알린다(둘을 같이 고친다).
  assert.equal(f.cell, 'point');
  const wg = C1.windGrid;
  const mean = C1.fields.wind700.cellMean;
  const half = ((mean.ni - 1) / 2) * C1.grid.dLon;                  // 묶음의 첫 점 → 가운데
  assert.deepEqual([f.grid.ni, f.grid.nj, f.grid.dLon, f.grid.dLat, f.grid.wraps], [wg.ni, wg.nj, wg.dLon, wg.dLat, true]);
  assert.deepEqual([f.grid.lon0, f.grid.lat0], [C1.grid.lon0 + half, C1.grid.lat0 - half]);

  // 서울(열 614 · 행 105)이 든 묶음 = 열 76 · 행 13. 그 묶음의 가운데에서 읽으면 그 칸의 값이 **그대로** 나온다.
  const col = Math.floor(SEOUL.col / mean.ni);
  const row = Math.floor(SEOUL.row / mean.nj);
  assert.deepEqual([row, col], [13, 76]);
  const lonC = f.grid.lon0 + col * f.grid.dLon;
  const latC = f.grid.lat0 - row * f.grid.dLat;
  assert.ok(Math.abs(lonC - SEOUL.lon) <= f.grid.dLon / 2 && Math.abs(latC - SEOUL.lat) <= f.grid.dLat / 2,
    `서울은 그 칸의 가운데(${latC}N ${lonC}E)에서 반 칸 안이다`);
  const wind = image(wg.ni, wg.nj, (r, c) => ((r === row && c === col) ? [200, 60, 0, 255] : [128, 128, 0, 255]));
  const store = storeWith(() => wind);
  await store.load();
  await store.ensure('wind700', T0);
  const s = store.sampleAt('wind700', T0, latC, lonC);
  const [u, v] = f.channels;
  assert.deepEqual([s.decoded, s.unit, [...s.names]], [true, 'm/s', ['R', 'G']]);
  assert.ok(Math.abs(s.values[0] - decodeByte(u, 200)) < 1e-9 && Math.abs(s.values[1] - decodeByte(v, 60)) < 1e-9);
  assert.ok(Math.abs(decodeByte(u, 200) - (200 * (128 / 255) - 64)) < 1e-9, '10 m 바람과 같은 식');
  // 서울 자체는 가운데에서 1.25° 떨어져 있다 — 이웃 칸과 섞인 값이지만 이 칸의 몫이 가장 크다.
  const seoul = store.sampleAt('wind700', T0, SEOUL.lat, SEOUL.lon);
  assert.ok(seoul.values[0] > decodeByte(u, 128) + (decodeByte(u, 200) - decodeByte(u, 128)) * 0.25);
  // 텍스처 좌표도 같은 자리다: 묶음 가운데의 구면 uv → 그 텍셀의 한가운데.
  const k = store.uvTransform('wind700');
  const near = (a, b) => assert.ok(Math.abs(a - b) < 1e-12, `${a} ≠ ${b}`);
  near((lonC / 360 + 0.5) * k.su + k.ou, (col + 0.5) / wg.ni);
  near((latC / 180 + 0.5) * k.sv + k.ov, 1 - (row + 0.5) / wg.nj);
});

test('끄개(GFS_FC_FIELDS=0)의 매니페스트: fields{} 에 옛 셋만 있어도 강수는 풀리고 새 넷은 "없음"이다', () => {
  const off = clone(C1);
  for (const id of ['temp', 'wind10', 'mslp', 'apcp']) {
    delete off.fields[id];
    for (const st of off.steps) { delete st[id]; delete st[`${id}Window`]; }
  }
  const m = readManifest(off);
  assert.equal(m.fields.precip.decodable, true);
  assert.equal(m.frames.precip.length, C1.steps.length);
  for (const id of ['temp', 'wind10', 'mslp', 'apcp']) {
    assert.equal(m.fields[id].decodable, false, id);
    assert.deepEqual([...m.frames[id]], [], id);
  }
});
