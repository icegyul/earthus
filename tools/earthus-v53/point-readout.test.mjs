// DEV-DIRECTIVE 2026-09-20 · W2 — 브라우저의 Open-Meteo 직호출을 걷어낸 결과 시험.
//
// 두 가지를 잠근다:
//   ① **소스에 그 호스트가 없다** — v2 런타임(prototype/v2-three/js/*.js)에 api.open-meteo.com ·
//      marine-api.open-meteo.com 을 부르는 자리가 route.js 하나뿐이다. 그 하나는 이유를 적고 남겼으므로
//      **이름으로 면제**한다(아래 ROUTE_EXEMPT) — 면제 목록이 늘면 시험이 떨어진다.
//   ② **클릭 경로가 제3자 네트워크를 안 탄다** — point-readout.js 에 가짜 fetch 를 넣고 지점·해상 판독을
//      끝까지 돌린 뒤, 나간 주소가 전부 우리 S3 인지 센다.
// 덧붙여 '없앤 값'이 정말 없는지(습도·풍파·너울 방향)와, 격자값을 지점 실측인 척하지 않는지를 글자로 본다.
//
// 프레임 저장소는 **진짜 코드**(gfs-frames.js)에 매니페스트 픽스처와 합성 그림을 넣은 것이다 —
// 여기서 재는 것은 흉내가 아니라 앱이 실제로 타는 길이다.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';

import {
  BUOY_KM, METRIC_ABSENT, METRIC_LAYER, POINT_BASE, SEA_GRIDS, SEA_ROWS,
  compass16, createPointReadout, seaIndexAt, seaSourceLine, seaValuesAt,
} from '../../prototype/v2-three/js/point-readout.js';
import { FIELD_DESCRIPTORS, cellLabel, readoutOf } from '../../prototype/v2-three/js/field-layer.js';
import { createGfsFrames } from '../../prototype/v2-three/js/gfs-frames.js';
import { createTimeBus } from '../../prototype/v2-three/js/time-bus.js';
import { scaleOf } from '../../prototype/v2-three/js/field-scales.js';

const here = (rel) => new URL(rel, import.meta.url);
const SCHEMA2 = JSON.parse(readFileSync(here('./fixtures/gfs-fc-manifest-schema2.json'), 'utf8'));
const clone = (x) => JSON.parse(JSON.stringify(x));
const H = 3.6e6;
const T0 = Date.parse('2026-09-20T00:00:00Z');
const tick = (ms = 4) => new Promise((r) => setTimeout(r, ms));

const V2_JS = new URL('../../prototype/v2-three/js/', import.meta.url);

// ════════════════════════════════════════════════════════════════════════════════════════════
//  ① 소스에 호스트가 없다
// ════════════════════════════════════════════════════════════════════════════════════════════

// 걷어내지 **못한** 자리. route.js 의 공항 날씨는 우리 GFS 프레임으로 못 만든다:
//   · 돌풍(wind_gusts_10m) · 시정(visibility) · WMO 날씨코드가 프레임에 없다(매니페스트 fields{} 는 7종뿐이다)
//   · 항로는 최대 7일인데 프레임은 120시간(5일)에서 끝난다
// 그래서 그대로 두고 이유를 적었다. 이 목록이 늘어나면 이 시험이 떨어진다 — 조용히 늘지 않게.
const ROUTE_EXEMPT = Object.freeze(['route.js']);

// 'open-meteo' 라는 낱말은 주석에도 있다(왜 걷어냈는지 적어 두었다). 잡아야 하는 것은 **부르는 자리**다.
const CALL_RE = /https?:\/\/[a-z0-9.-]*open-meteo\.com/gi;

const v2Sources = () => readdirSync(V2_JS)
  .filter((f) => f.endsWith('.js'))
  .map((f) => ({ file: f, text: readFileSync(new URL(f, V2_JS), 'utf8') }));

test('v2 런타임에서 Open-Meteo 를 부르는 파일은 route.js 하나뿐이다', () => {
  const callers = v2Sources()
    .filter(({ text }) => CALL_RE.test(text) && (CALL_RE.lastIndex = 0, true))
    .map(({ file }) => file)
    .sort();
  assert.deepEqual(callers, [...ROUTE_EXEMPT],
    `Open-Meteo 를 부르는 자리: ${callers.join(', ')} — 면제는 ${ROUTE_EXEMPT.join(', ')} 뿐이다`);
});

test('걷어낸 자리들이 실제로 사라졌다 — main.js 에 그 호출이 한 줄도 없다', () => {
  const main = readFileSync(new URL('main.js', V2_JS), 'utf8');
  assert.equal(main.match(CALL_RE), null, 'main.js 에 Open-Meteo 호출이 남아 있다');
  // 지점 폴백(12° 450지점)을 만들던 함수들도 함께 없앴다 — 죽은 길로 남기지 않는다.
  for (const gone of ['fetchForecastGrid(', 'buildForecastFrame(', 'loadGfsPoints(', 'gfsFrameTex(', 'loadWaveHourly(']) {
    assert.ok(!main.includes(gone), `${gone} 가 아직 main.js 에 있다`);
  }
});

test('출처 등록이 남은 것과 어긋나지 않는다 — 라벨은 항로만, 레이어는 없다', () => {
  const bridge = readFileSync(new URL('engine-bridge.js', V2_JS), 'utf8');
  const label = /\{ id: 'openmeteo', label: '([^']+)'/.exec(bridge);
  assert.ok(label, 'openmeteo 제공자 줄을 찾지 못했다');
  assert.match(label[1], /항로/, "브라우저가 직접 부르는 것은 항로 공항 날씨뿐이다 — 라벨이 '해상·예보' 면 거짓이다");
  const rule = /\{ host: 'open-meteo\.com', provider: 'openmeteo', layer: ([^ ]+) \}/.exec(bridge);
  assert.ok(rule, 'open-meteo 호스트 규칙을 찾지 못했다');
  assert.equal(rule[1], 'null', "'ocean/marine' 의 신선도는 이제 우리 S3 파일이 말한다 — 제공기관 응답이 아니다");
  // 그 신선도의 새 출처가 실제로 등록돼 있다.
  assert.ok(bridge.includes("'/ocean/marine.json': { layer: 'ocean/marine'"), '해양 격자 파일이 PATH_MAP 에 없다');
});

// ════════════════════════════════════════════════════════════════════════════════════════════
//  가짜 판 — 진짜 gfs-frames 에 합성 프레임, 진짜 time-bus 에 고정 시계
// ════════════════════════════════════════════════════════════════════════════════════════════

const hourOf = (url) => Number(/(\d{3})\.png/.exec(url)[1]);
// 기온: 행마다 내려가고 스텝마다 오른다(field-layer.test.mjs 와 같은 합성값).  10 m 바람: R=u G=v 고정 바이트.
const image = (url) => {
  const h = hourOf(url);
  const rgba = new Uint8Array(720 * 361 * 4);
  const wind = /u\d{3}\.png/.test(url);
  for (let r = 0; r < 361; r += 1) {
    const b = Math.max(0, Math.min(255, Math.round((30 - r / 3 + h / 3 + 80) / 0.5)));
    for (let c = 0; c < 720; c += 1) rgba.set(wind ? [200, 60, 0, 255] : [b, b, b, 255], (r * 720 + c) * 4);
  }
  return { width: 720, height: 361, rgba };
};
const FakeTHREE = {
  RepeatWrapping: 1000, ClampToEdgeWrapping: 1001, LinearFilter: 1006, NoColorSpace: '',
  Texture: class { constructor(img) { this.image = img; } dispose() {} },
};

// ocean/marine*.json 을 흉내 낸 작은 격자. 운영 파일과 **같은 모양**이다(행 0 = 남쪽 · 점 격자 · 결측은 null).
const seaDoc = (over = {}) => ({
  time: '2026-09-20T00:00:00Z', res: 5, lat0: -80, lon0: -180, nx: 72, ny: 33,
  source: 'Open-Meteo Marine',
  units: { wave: 'm', wdir: '°', wper: 's', swell: 'm', sper: 's', sst: '°C', cur: 'm/s', cdir: '°' },
  wave: null, wdir: null, wper: null, swell: null, sper: null, sst: null, cur: null, cdir: null, ...over,
});
const filled = (nx, ny, at, vals) => {
  const out = {};
  for (const k of ['wave', 'wdir', 'wper', 'swell', 'sper', 'sst', 'cur', 'cdir']) {
    const a = new Array(nx * ny).fill(null);
    if (vals[k] != null) a[at] = vals[k];
    out[k] = a;
  }
  return out;
};

function rig({ nowMs = T0, sea = null, buoys = null, missDocs = false } = {}) {
  const urls = [];
  const state = { now: nowMs };
  const frames = createGfsFrames({
    THREE: FakeTHREE,
    now: () => state.now,
    fetch: async (url) => { urls.push(url); return { ok: true, json: async () => clone(SCHEMA2) }; },
    loadImage: async (url) => { urls.push(url); await tick(); return image(url); },
    readPixels: (img) => ({ w: img.width, h: img.height, data: img.rgba }),
  });
  const timeBus = createTimeBus({ now: () => state.now });
  const readout = createPointReadout({
    frames, timeBus, now: () => state.now,
    fetch: async (url) => {
      urls.push(url);
      if (missDocs) return { ok: false };
      if (url.includes('marine-ea')) return { ok: true, json: async () => null };
      if (url.includes('marine.json')) return { ok: true, json: async () => sea };
      if (url.includes('kma-buoy')) return { ok: true, json: async () => buoys };
      return { ok: false };
    },
  });
  return { readout, frames, timeBus, urls, state };
}
const thirdParty = (urls) => urls.filter((u) => !u.startsWith(POINT_BASE));

// ════════════════════════════════════════════════════════════════════════════════════════════
//  ② 클릭 경로가 제3자 네트워크를 안 탄다
// ════════════════════════════════════════════════════════════════════════════════════════════

test('지점 값을 읽는 동안 나간 주소는 전부 우리 S3 다', async () => {
  const { readout, urls } = rig();
  const card = await readout.weather(37.5665, 126.9780, 'temperature');
  assert.ok(urls.length > 0, '아무 요청도 없었다면 시험이 아무것도 안 잰 것이다');
  assert.deepEqual(thirdParty(urls), [], `제3자 주소가 나갔다: ${thirdParty(urls).join(', ')}`);
  assert.match(card.html, /제3자 API 조회 없음/);
});

test('해상 지점을 읽는 동안에도 제3자 주소가 없다 — 격자·부이·바람 셋 다', async () => {
  const doc = seaDoc(filled(72, 33, 23 * 72 + 61, { wave: 1.4, wdir: 197, wper: 5.2, swell: 0.6, sper: 6.1, sst: 21.3, cur: 0.4, cdir: 90 }));
  const { readout, urls } = rig({ sea: doc, buoys: { stations: [] } });
  const got = await readout.sea(35, 125);
  assert.ok(got.grid, '격자값을 읽지 못했다');
  assert.deepEqual(thirdParty(urls), [], `제3자 주소가 나갔다: ${thirdParty(urls).join(', ')}`);
});

test('같은 자료를 두 번 눌러도 JSON 은 한 번만 받는다', async () => {
  const doc = seaDoc(filled(72, 33, 23 * 72 + 61, { wave: 1.4 }));
  const { readout, urls } = rig({ sea: doc, buoys: { stations: [] } });
  // 프레임 매니페스트는 세는 대상이 아니다 — 저장소가 조건부 GET 으로 스스로 다시 읽는다(gfs-frames.js load).
  // 여기서 보는 것은 **이 모듈이 쥔 문서**(해양 격자 둘 · 부이 하나)가 두 번째 클릭에 다시 나가는가다.
  const ours = () => urls.filter((u) => [...SEA_GRIDS.map((g) => g.path), '/ocean/kma-buoy.json'].some((p) => u.endsWith(p))).length;
  await readout.sea(35, 125);
  const afterFirst = ours();
  assert.equal(afterFirst, 3, '첫 클릭에 해양 격자 둘과 부이 하나를 받는다');
  await readout.sea(35.2, 125.2);
  assert.equal(ours(), afterFirst, '두 번째 클릭이 같은 JSON 을 다시 받았다');
});

test('지표 하나를 누르면 그 지표의 필드만 받는다 — 일곱 종을 다 받지 않는다', async () => {
  const { readout, frames, urls } = rig();
  await readout.weather(37.5, 127, 'temperature');
  const pngs = urls.filter((u) => u.endsWith('.png') || /\.png\?/.test(u));
  assert.ok(pngs.length > 0 && pngs.every((u) => /t\d{3}\.png/.test(u)),
    `기온만 받아야 하는데 받은 프레임: ${pngs.join(', ')}`);
  assert.ok(frames.stats().frameFetches <= 2, '한 시각은 프레임 두 장이면 충분하다');
});

// ════════════════════════════════════════════════════════════════════════════════════════════
//  값과 글자 — 격자값을 지점 실측인 척하지 않는다
// ════════════════════════════════════════════════════════════════════════════════════════════

test('지점 카드의 숫자는 색면 카드와 **같은 순수 함수**가 낸 것이다', async () => {
  const { readout, frames, timeBus } = rig();
  const card = await readout.weather(37.5665, 126.9780, 'temperature');
  const desc = FIELD_DESCRIPTORS.tempgrid;
  const info = frames.info();
  const expect = readoutOf(frames.sampleAt('temp', timeBus.validMs(), 37.5665, 126.9780),
    { scale: scaleOf(desc.scaleId), mode: desc.mode, resolutionDeg: info.resolutionDeg, ko: true });
  // 눈금 상수는 매니페스트에서 온다 — 시험이 숫자를 박지 않는다.
  assert.ok(expect.ok && expect.text.startsWith('~'), '기대값 자체가 읽히지 않았다');
  assert.ok(card.html.includes(expect.text), `카드에 ${expect.text} 가 없다`);
  assert.ok(card.html.includes(cellLabel(info.resolutionDeg, true)),
    '칸 크기를 말하지 않았다 — 격자값을 지점 실측인 척하면 안 된다');
  assert.match(card.html, /도시·지점의 관측값이 아닙니다/);
});

test('런과 유효 시각을 늘 적는다', async () => {
  const { readout } = rig();
  const card = await readout.weather(35, 129, 'rain');
  assert.match(card.html, /런 \d\d\/\d\d \d\dZ/);
  assert.match(card.html, /유효 \d\d\/\d\d \d\d:\d\d KST/);
});

test('타임라인을 밀면 그 시각의 값이다 — 카드가 화면과 다른 시각을 말하지 않는다', async () => {
  const { readout, timeBus } = rig();
  const a = await readout.weather(37.5, 127, 'temperature');
  timeBus.set(9 * H);
  const b = await readout.weather(37.5, 127, 'temperature');
  assert.notEqual(a.html, b.html, '시각을 9시간 밀었는데 카드가 그대로다');
  assert.ok(b.html.includes('유효'), '민 시각의 유효 시각이 없다');
});

// ════════════════════════════════════════════════════════════════════════════════════════════
//  없앤 값 — 지어내지 않는다
// ════════════════════════════════════════════════════════════════════════════════════════════

test('습도는 값을 지어내지 않고 없다고 말한다', async () => {
  const { readout, urls } = rig();
  const card = await readout.weather(37.5, 127, 'humidity');
  assert.equal(card.badge, 'UNAVAILABLE');
  assert.match(card.html, /상대습도 필드가 없습니다/);
  assert.ok(!/\d+\s*%/.test(card.html), '없는 습도 값이 적혀 있다');
  assert.deepEqual(urls, [], '없는 값을 찾으러 네트워크를 타면 안 된다');
  assert.ok(METRIC_ABSENT.humidity && !METRIC_LAYER.humidity, '습도가 색면 지표로 등록돼 있다');
});

test('풍파 높이와 너울 방향은 카드에 아예 없다 — 0 으로도 근사치로도 채우지 않는다', async () => {
  const keys = SEA_ROWS.map((r) => r.key);
  assert.ok(!keys.includes('windWave') && !keys.includes('swellDir'), '없는 값이 줄로 등록돼 있다');
  const doc = seaDoc(filled(72, 33, 23 * 72 + 61, { wave: 1.4, swell: 0.6, sper: 6.1 }));
  const { readout } = rig({ sea: doc, buoys: { stations: [] } });
  const html = readout.seaHtml(await readout.sea(35, 125));
  assert.ok(!html.includes('풍파 높이</span>') && !html.includes('너울 방향</span>'), '없앤 줄이 값으로 서 있다');
  assert.match(html, /풍파 높이와 너울 방향은 우리 해양 격자에 없어 줄을 뺐습니다/);
});

test('해상 카드가 내놓는 줄은 우리 격자가 실제로 싣는 것뿐이다', () => {
  // aws/marine-grid 의 VARS 와 ocean/marine.json 의 vars 가 같은 여덟 가지다.
  const doc = seaDoc();
  assert.deepEqual(SEA_ROWS.map((r) => r.key).sort(), Object.keys(doc.units).sort());
});

// ════════════════════════════════════════════════════════════════════════════════════════════
//  격자 읽기 · 실측 우선
// ════════════════════════════════════════════════════════════════════════════════════════════

test('점 격자를 가장 가까운 칸으로 읽는다 — 행 0 은 남쪽이다', () => {
  const g = seaDoc();
  assert.deepEqual(seaIndexAt(g, -80, -180), { i: 0, j: 0, k: 0, lat: -80, lon: -180 });
  const at = seaIndexAt(g, 34, 126);
  assert.equal(at.k, at.j * g.nx + at.i);
  assert.ok(Math.abs(at.lat - 35) < 1e-9 && Math.abs(at.lon - 125) < 1e-9, '5° 격자에서 가장 가까운 점이 아니다');
  assert.equal(seaIndexAt(g, 89, 0), null, '격자 밖은 null 이다');
});

test('값이 하나도 없는 칸은 null 이다 — 0 으로 채우지 않는다', () => {
  const g = seaDoc(filled(72, 33, 0, {}));
  assert.equal(seaValuesAt(g, 34, 126), null);
});

test('가까운 실측이 신선하면 모델과의 차이를 숫자로 적는다', async () => {
  const at = 23 * 72 + 61;   // lat 35 · lon 125
  const doc = seaDoc(filled(72, 33, at, { wave: 1.4 }));
  const nowMs = Date.parse('2026-09-20T09:00:00+09:00');
  const buoys = { stations: [{ id: '1', name: '거문도', lat: 35.0, lon: 125.3, wh: 1.9, ws: 7, tm: '202609200850' }] };
  const { readout } = rig({ nowMs, sea: doc, buoys });
  const html = readout.seaHtml(await readout.sea(35, 125));
  assert.match(html, /거문도/);
  assert.match(html, /0\.5 m 차이/, '실측과 격자의 차이를 숫자로 말하지 않았다');
});

test('실측이 없으면 없다고 적는다 — 격자값을 실측처럼 두지 않는다', async () => {
  const doc = seaDoc(filled(72, 33, 23 * 72 + 61, { wave: 1.4 }));
  const { readout } = rig({ sea: doc, buoys: { stations: [] } });
  const html = readout.seaHtml(await readout.sea(35, 125));
  assert.ok(html.includes(`${BUOY_KM} km 안에 파고 관측점이 없습니다`), '실측이 없다는 사실을 안 적었다');
});

test('출처 줄이 무엇을·얼마나 큰 칸을·언제 것인지 셋 다 말한다', () => {
  const line = seaSourceLine({ res: 5, time: '2026-09-20T12:00:00Z', source: 'Open-Meteo Marine' }, true);
  assert.match(line, /Open-Meteo Marine 경유/, '남의 자료를 우리 것처럼 부르면 안 된다');
  assert.ok(line.includes(cellLabel(5, true)), '칸 크기가 없다');
  assert.match(line, /기준 \d\d-\d\d \d\d:\d\d KST/, '기준 시각이 없다');
});

test('격자에 값이 없는 자리는 이유를 말하고 값을 내지 않는다', async () => {
  const doc = seaDoc(filled(72, 33, 0, { wave: 1.4 }));
  const { readout } = rig({ sea: doc, buoys: { stations: [] } });
  const got = await readout.sea(35, 125);
  assert.ok(got.none && got.reason && !got.grid);
});

test('유의파고가 없으면 해상 지점이 아니다 — 해안 칸의 수온만 보고 육지에 카드를 세우지 않는다', async () => {
  // 5°·0.5° 칸은 육지와 바다를 걸친다. 수온·해류만 있는 칸으로 카드를 세우면 서울을 눌러도
  // '수온 25.1 °C' 가 떴다(2026-09-20 운영 자료로 잡았다).
  const doc = seaDoc(filled(72, 33, 23 * 72 + 61, { sst: 25.1, cur: 0.1, cdir: 180 }));
  const { readout } = rig({ sea: doc, buoys: { stations: [] } });
  const got = await readout.sea(35, 125);
  assert.ok(got.none && !got.grid, '파고 없는 칸으로 해상 카드를 세웠다');
  assert.match(got.reason, /연안 밖 바다/);
});

test('매니페스트가 이미 읽혀 있으면 클릭마다 다시 읽지 않는다', async () => {
  const { readout, urls } = rig();
  await readout.weather(37.5, 127, 'temperature');
  const first = urls.filter((x) => x.includes('manifest.json')).length;
  await readout.weather(35.1, 129.1, 'temperature');
  assert.equal(urls.filter((x) => x.includes('manifest.json')).length, first,
    '지점을 누를 때마다 매니페스트 왕복을 더하면 클릭이 느려진다');
});

test('격자 파일을 못 받으면 없는 값을 만들지 않고 오류로 말한다', async () => {
  const { readout } = rig({ missDocs: true });
  const got = await readout.sea(35, 125);
  assert.ok(got.error && !got.grid);
});

test('방위는 16방위로 읽어 준다', () => {
  assert.equal(compass16(0), 'N');
  assert.equal(compass16(197), 'SSW');
  assert.equal(compass16(360), 'N');
  assert.equal(compass16(null), '');
});

test('바다 격자는 0.5° 동아시아를 먼저 본다', () => {
  assert.deepEqual(SEA_GRIDS.map((g) => g.path), ['/ocean/marine-ea.json', '/ocean/marine.json']);
});
