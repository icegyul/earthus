// 지점 판독 — 누른 자리의 값을 **우리 자료**에서 읽는다. 색면 레이어가 꺼져 있어도 읽는다.
//
// ── 왜 생겼나 (지시서 W2 'Open-Meteo 직접 호출을 걷어낸다') ────────────────────────────────────────────────
//   v2 는 유료 서비스인데(v1 은 무료 · 완전히 다른 서비스다) 브라우저가 api.open-meteo.com ·
//   marine-api.open-meteo.com 을 **직접** 불렀다. 두 가지가 걸렸다:
//     ① 라이선스 — Open-Meteo 무료 API 는 비상업 조건이다. 유료 서비스가 사용자 브라우저로 그 API 를
//        때리는 것은 위험 노출이다(저장소 감사의 '운영 중 위반' 목록).
//     ② 화면이 두 말을 했다 — 지구에 칠한 색면은 NOAA GFS 0.5° 프레임인데 같은 자리를 누르면
//        Open-Meteo 값이 나왔다. 제공자·격자·시각이 갈려 숫자가 어긋난다. 2026-09-20 실측(같은 유효시각
//        2026-09-20T12:00Z · 같은 GFS):
//           서울 기온  우리 23.2 °C │ /v1/gfs 24.1 °C │ /v1/forecast current 21.1 °C
//           부산 풍속  우리  6.2 m/s │ /v1/gfs  3.3 m/s │ /v1/forecast current  2.4 m/s
//        차이의 뿌리는 ⓐ 고도 — Open-Meteo 는 지점 고도(서울 34 m)로 낮춰 주고 우리 칸은 0.5° 평균
//        지형이다 · ⓑ 격자 — /v1/gfs 는 0.25°/0.11° 혼합을 쓴다 · ⓒ 시각 — 옛 코드가 부르던
//        /v1/forecast 의 current 는 '지금'이라 타임라인을 밀어 둔 화면과 아예 다른 시각이었다.
//        그래서 카드가 **무엇을 · 얼마나 큰 칸에서 · 언제 것으로** 읽었는지 적는다.
//
// ── 규칙 ────────────────────────────────────────────────────────────────────────────────────────────────
//   · 글자는 FieldLayer.readoutNote 와 **같은 순수 함수**로 짓는다(readoutOf · sourceLabel · timeMeta ·
//     statusText). 레이어를 켰다 껐다 할 때 같은 자리의 숫자와 말이 달라지면 그 자체가 '두 말'이다.
//     descriptor 도 FIELD_DESCRIPTORS 를 그대로 쓴다 — 눈금·성질 도장·'한 칸의 <…>' 낱말이 한 곳에만 있다.
//   · 격자값을 지점 실측인 척하지 않는다. 0.5° 칸은 약 55 km 다 — 도시 값이 못 된다.
//   · **우리 자료에 없는 값은 지어내지 않는다.** 줄 자체를 없앴다(없앤 목록은 ABSENT 아래).
//   · 근처에 실측이 있으면 실측을 먼저 적는다(기상청 해양관측망 kma-buoy.json · 파고). 없으면 격자값과
//     '실측이 없다'는 사실을 함께 적는다.
//
// ── 네트워크 ────────────────────────────────────────────────────────────────────────────────────────────
//   GFS 프레임은 공용 저장소(gfs-frames.js)가 쥔다. 색면이 이미 켜져 있으면 그 장이 캐시에 있어 **0건**이고,
//   꺼져 있으면 그 필드의 프레임 1~2장을 받는다(우리 S3 · 실측 장당 기온 81 KB · 10 m 바람 226 KB ·
//   강수 110 KB · 기압 45 KB → 두 장 최대 451 KB). 지표 하나를 누르면 **그 지표의 필드만** 받는다.
//   바다 격자는 JSON 한 장(marine-ea 131 KB · marine 88 KB · kma-buoy 44 KB)이고 저장소가 한 번만 받는다.
//   어느 쪽도 earthus-cache-kr S3 밖으로 나가지 않는다.
//
// 이 파일은 DOM 을 모른다. frames · timeBus · fetch · now 를 주입받는다 —
// tools/earthus-v53/point-readout.test.mjs 가 가짜를 넣어 **우리 S3 말고 아무 데도 안 간다**를 잠근다.

import { FIELD_DESCRIPTORS, cellLabel, fieldStatusOf, readoutOf, sourceLabel, statusText, timeMeta } from './field-layer.js?v=1';
import { scaleOf } from './field-scales.js?v=1';
import { readTicks } from './field-log.js?v=1';
import { buoysNear } from './for-me-signal.js?v=2';
import { sharedGfsFrames } from './gfs-frames.js?v=1';
import { timeBus as sharedTimeBus } from './time-bus.js?v=1';

export const POINT_BASE = 'https://earthus-cache-kr.s3.us-east-2.amazonaws.com';

/** 퀵메뉴 지표 → 색면 레이어 id. 지표 id 의 정본은 quick-menu.js ITEMS 다(강수는 'rain' — 'precipitation' 이 아니다). */
export const METRIC_LAYER = Object.freeze({
  temperature: 'tempgrid', wind: 'windgrid', rain: 'raingrid', pressure: 'presgrid',
});

/**
 * 우리 자료에 없는 지표 — 값을 지어내지 않고 **없다고 말한다.**
 * 습도: GFS 예보 프레임의 필드는 t(기온)·u(10 m 바람)·m(해면기압)·a(누적강수)·c(구름)·p(강수율)·w(700 hPa 바람)
 *       일곱 종이다(clouds/gfs-fc/manifest.json fields{}). 상대습도는 굽지 않는다.
 */
export const METRIC_ABSENT = Object.freeze({
  humidity: Object.freeze({
    ko: '습도', en: 'Humidity',
    ko_why: 'GFS 0.5° 예보 프레임에 상대습도 필드가 없습니다 — 우리가 굽는 일곱 필드(기온·10 m 바람·해면기압·누적강수·구름·강수율·700 hPa 바람)에 들어 있지 않습니다. 없는 값을 근사해 적지 않습니다.',
    en_why: 'Our GFS 0.5° frames carry no relative-humidity field — the seven we bake are temperature, 10 m wind, sea-level pressure, accumulated and rate precipitation, cloud, and 700 hPa wind. We do not approximate a value we do not hold.',
  }),
});

/**
 * 바다 격자 — 앞의 것부터 본다. 동아시아 0.5° 안이면 그것을, 밖이면 전지구 5° 를 쓴다.
 * (for-me-signal.js 머리말이 같은 차례를 적는다 — 두 곳이 다른 차례를 쓰면 같은 지점에 두 값이 생긴다.)
 */
export const SEA_GRIDS = Object.freeze([
  Object.freeze({ id: 'marineEa', path: '/ocean/marine-ea.json' }),
  Object.freeze({ id: 'marine', path: '/ocean/marine.json' }),
]);
export const BUOY_PATH = '/ocean/kma-buoy.json';

/**
 * 해상 카드가 적는 줄. key 는 ocean/marine*.json 의 배열 이름 그대로다.
 *   ⚠️ 여기 **없는 것**이 곧 Open-Meteo 직호출에서 없앤 값이다:
 *      풍파(wind_wave_height) · 너울 방향(swell_wave_direction) — 우리 격자(aws/marine-grid VARS)가 안 받는다.
 *      0 이나 근사치로 채우지 않고 줄을 없앴다.
 */
export const SEA_ROWS = Object.freeze([
  Object.freeze({ key: 'wave', ko: '유의파고', en: 'Significant wave height', unit: 'm', digits: 1 }),
  Object.freeze({ key: 'wper', ko: '파주기', en: 'Wave period', unit: 's', digits: 1 }),
  Object.freeze({ key: 'wdir', ko: '파향', en: 'Wave direction', unit: '°', digits: 0, bearing: true }),
  Object.freeze({ key: 'swell', ko: '너울 높이', en: 'Swell height', unit: 'm', digits: 1 }),
  Object.freeze({ key: 'sper', ko: '너울 주기', en: 'Swell period', unit: 's', digits: 1 }),
  Object.freeze({ key: 'sst', ko: '수온', en: 'Sea surface temperature', unit: '°C', digits: 1 }),
  Object.freeze({ key: 'cur', ko: '표층 해류', en: 'Surface current', unit: 'm/s', digits: 2 }),
  Object.freeze({ key: 'cdir', ko: '해류 방향', en: 'Current direction', unit: '°', digits: 0, bearing: true }),
]);

/** 부이 실측을 모델과 견주는 창 — for-me-signal.js waveCard 와 **같은 값**을 쓴다(100 km · 3시간). */
export const BUOY_KM = 100;
export const BUOY_FRESH_H = 3;

const H = 3600_000;
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const fmtPoint = (lat, lon) => `${lat >= 0 ? 'N' : 'S'}${Math.abs(lat).toFixed(1)}° ${lon >= 0 ? 'E' : 'W'}${Math.abs(lon).toFixed(1)}°`;
const stat = (k, v) => `<div class="stat"><span class="k">${esc(k)}</span><span class="v">${esc(v)}</span></div>`;

/** 16방위. 파향·해류 방향은 도(°)만 적으면 읽기 어렵다 — 숫자와 방위를 함께 적는다. */
const COMPASS16 = Object.freeze(['N', 'NNE', 'NE', 'ENE', 'E', 'ESE', 'SE', 'SSE', 'S', 'SSW', 'SW', 'WSW', 'W', 'WNW', 'NW', 'NNW']);
export const compass16 = (deg) => (Number.isFinite(deg) ? COMPASS16[Math.round((((deg % 360) + 360) % 360) / 22.5) % 16] : '');

/**
 * 점 격자에서 가장 가까운 칸. 문서는 **행 0 = 남쪽**이고 lat = lat0 + j·res · lon = lon0 + i·res 다
 * (grid-frames.js 머리말 · for-me-signal.js gridAt 과 같은 식 — 두 곳이 다른 식을 쓰면 같은 점에 두 값이 생긴다).
 * 격자 밖이면 null.
 */
export function seaIndexAt(grid, lat, lon) {
  if (!grid || !(grid.res > 0) || !(grid.nx > 0) || !(grid.ny > 0)) return null;
  const i = Math.round((lon - grid.lon0) / grid.res);
  const j = Math.round((lat - grid.lat0) / grid.res);
  if (i < 0 || j < 0 || i >= grid.nx || j >= grid.ny) return null;
  return { i, j, k: j * grid.nx + i, lat: grid.lat0 + j * grid.res, lon: grid.lon0 + i * grid.res };
}

/** 격자 한 칸의 값들. 값이 하나도 없으면(육지·자료 구멍) null — '0' 으로 채우지 않는다. */
export function seaValuesAt(grid, lat, lon) {
  const at = seaIndexAt(grid, lat, lon);
  if (!at) return null;
  const out = {};
  let any = false;
  for (const row of SEA_ROWS) {
    const arr = grid[row.key];
    const v = Array.isArray(arr) ? arr[at.k] : null;
    if (v == null || !Number.isFinite(+v)) continue;
    out[row.key] = +v;
    any = true;
  }
  if (!any) return null;
  return { ...out, cellLat: at.lat, cellLon: at.lon };
}

/** 'YYYY-MM-DDTHH:MM:SSZ' → ms. 못 읽으면 null(지어내지 않는다). */
const parseIso = (s) => { const t = Date.parse(String(s || '')); return Number.isFinite(t) ? t : null; };

/** 값 한 줄의 글자. 방위 줄은 '197° SSW' 로 적는다. */
export function seaRowText(row, value, ko = true) {
  if (value == null || !Number.isFinite(value)) return null;
  const n = value.toFixed(row.digits);
  return row.bearing ? `${n}${row.unit} ${compass16(value)}` : `${n} ${row.unit}`;
}

/**
 * 바다 격자 카드의 출처 줄. '무엇을 · 얼마나 큰 칸 · 언제 것' 셋을 늘 적는다.
 * ⚠️ 이 격자는 우리가 **서버에서** 모아 둔 것이고 원자료는 Open-Meteo Marine 이다 — 'NOAA' 라고 부르지 않고
 *    문서가 말하는 출처(source)를 그대로 쓰며 '경유'임을 밝힌다(grid-frames.js sourceName 과 같은 규칙).
 */
export function seaSourceLine(grid, ko = true) {
  const src = (grid && grid.source) || 'Open-Meteo Marine';
  const cell = cellLabel(grid && grid.res, ko);
  const t = parseIso(grid && grid.time);
  const when = t != null
    ? `${ko ? '기준' : 'as of'} ${new Date(t + (ko ? 9 * H : 0)).toISOString().slice(5, 16).replace('T', ' ')} ${ko ? 'KST' : 'UTC'}`
    : (ko ? '기준 시각 미제공' : 'no reference time given');
  return ko
    ? `MODEL_SIGNAL · ${src} 경유 · ${cell} 점 표본 · ${when}`
    : `MODEL_SIGNAL · via ${src} · ${cell} point sample · ${when}`;
}

/**
 * 저장소. deps = { frames, timeBus, fetch, now, base }
 *   frames  공용 GFS 프레임 저장소(없으면 sharedGfsFrames)
 *   fetch   주소를 받아 Response — 시험이 가짜를 넣어 **어디로 갔는지** 센다
 */
export function createPointReadout(deps = {}) {
  const frames = deps.frames || sharedGfsFrames();
  const timeBus = deps.timeBus || sharedTimeBus;
  const base = deps.base || POINT_BASE;
  const now = deps.now || (() => Date.now());
  const doFetch = deps.fetch || ((url, init) => globalThis.fetch(url, init));
  const ko = deps.ko !== false;

  // JSON 한 장짜리 자료는 저장소가 한 번만 받는다(같은 세션에서 지점을 여러 번 눌러도 요청은 하나다).
  // 매니페스트는 저장소가 부를 때마다 조건부 GET 을 한 번 친다(gfs-frames.js load · no-cache). 지점을 누를
  // 때마다 그 왕복을 더하면 클릭이 느려진다 — 이미 읽혀 있으면 건너뛰고, 아니면 한 번만 읽는다. 신선도는
  // 색면 레이어의 30분 타이머가 본다(field-layer.js FIELD_MANIFEST_RELOAD_MS).
  const loadFrames = () => (frames.loaded ? Promise.resolve(frames.manifest) : frames.load());

  const docs = new Map();
  function doc(path, ttlMs = 10 * 60_000) {
    const hit = docs.get(path);
    if (hit && (hit.pending || now() - hit.at < ttlMs)) return hit.pending || Promise.resolve(hit.json);
    const pending = Promise.resolve()
      .then(() => doFetch(`${base}${path}`, { cache: 'no-store' }))
      .then((r) => (r && r.ok ? r.json() : null))
      .catch(() => null)
      .then((json) => { docs.set(path, { at: now(), json, pending: null }); return json; });
    docs.set(path, { at: now(), json: hit ? hit.json : null, pending });
    return pending;
  }

  /** 프레임에서 한 점을 읽는다 — FieldLayer.sampleAt 과 같은 차례(범위 밖이면 값을 말하지 않는다). */
  function sampleField(desc, lat, lon, tMs) {
    let br = null;
    try { br = frames.bracket(desc.fieldId, tMs); } catch (e) { br = null; }
    const status = fieldStatusOf({ br, frames: br ? frames.framesFor(desc.fieldId) : null });
    if (status.kind === 'outOfRange') return { sample: { outOfRange: status.side, single: !!status.single }, status };
    let s = null;
    try { s = frames.sampleAt(desc.fieldId, tMs, lat, lon); } catch (e) { s = null; }
    let spec = null;
    try { spec = frames.fieldSpec(desc.fieldId); } catch (e) { spec = null; }
    if (s && spec && spec.channels) Object.assign(s, readTicks(spec.channels[0]));
    return { sample: s, status };
  }

  const api = {
    /**
     * 지점 값 카드 — 색면이 꺼져 있어도 우리 프레임에서 읽는다. → { title, html, badge }
     * 글자는 FieldLayer.readoutNote 와 같은 함수로 짓는다. 다른 것은 마지막 한 줄뿐이다
     * (거기는 '화면에 칠해진 프레임', 여기는 '프레임을 받아 읽었다' — 사용자가 본 것과 다르게 말하지 않으려고).
     */
    async weather(lat, lon, metric = 'temperature') {
      const absent = METRIC_ABSENT[metric];
      if (absent) {
        return {
          title: ko ? `지점 ${absent.ko}` : `Point ${absent.en.toLowerCase()}`,
          html: stat(ko ? '지점' : 'Point', fmtPoint(lat, lon))
            + `<p>${esc(ko ? absent.ko_why : absent.en_why)}</p>`,
          badge: 'UNAVAILABLE',
        };
      }
      const layerId = METRIC_LAYER[metric];
      const desc = layerId ? FIELD_DESCRIPTORS[layerId] : null;
      if (!desc) {
        return { title: ko ? '지점 값' : 'Point value', badge: 'UNAVAILABLE',
          html: `<p>${esc(ko ? `'${metric}' 은 지점 값을 읽는 지표가 아닙니다.` : `'${metric}' is not a point-readable metric.`)}</p>` };
      }
      const scale = scaleOf(desc.scaleId || layerId);
      const tMs = timeBus.validMs();
      try {
        await loadFrames();
        // 그 지표의 **필드 하나만** 받는다. 프레임이 이미 캐시에 있으면(색면이 켜져 있다) 네트워크 0건이다.
        await frames.ensure(desc.fieldId, tMs);
      } catch (e) { /* 못 받았으면 아래에서 '프레임이 없다'로 말한다 */ }
      const info = frames.info ? frames.info() : null;
      const { sample, status } = sampleField(desc, lat, lon, tMs);
      const r = readoutOf(sample, {
        scale, mode: desc.mode, resolutionDeg: info && info.resolutionDeg,
        zeroText: desc.zeroText, cellWord: desc.cellWord || (info && info.cellWord) || null, ko,
      });
      const q = desc.quantity[ko ? 'ko' : 'en'];
      const meta = [sourceLabel(info), ...timeMeta(info, tMs, ko)];
      const st = statusText(status, { ko, short: true });
      const html = stat(q, r.ok ? r.text : '—') + stat(ko ? '지점' : 'Point', fmtPoint(lat, lon))
        + `<p>${esc(r.ok ? r.note : r.text)}${r.ok ? (ko ? ' — 도시·지점의 관측값이 아닙니다.' : ' — not a city or station observation.') : ''}</p>`
        + `<p>${esc(meta.join(' · '))}${st ? ` · ${esc(st)}` : ''}</p>`
        + `<p style="opacity:.75">${ko ? '지구에 칠하는 것과 같은 프레임에서 읽었습니다 — 제3자 API 조회 없음.' : 'Read from the same frame the globe is painted with — no third-party API call.'}</p>`;
      const gridWord = desc.badge === 'OBSERVED' ? (ko ? '관측 격자값' : 'observed grid value') : (ko ? '모델 격자값' : 'model grid value');
      return {
        title: ko ? `지점 ${q}(${gridWord})` : `Point ${q.toLowerCase()} (${gridWord})`,
        html, badge: r.ok ? (desc.badge || 'MODEL') : 'UNAVAILABLE',
      };
    },

    /**
     * 해상 지점 — 우리 바다 격자 + GFS 10 m 바람 + (있으면) 기상청 해양관측망 실측.
     * → { lat, lon, grid, gridInfo, wind, buoys, retrievedAt } | { lat, lon, none } | { lat, lon, error }
     */
    async sea(lat, lon) {
      const tMs = timeBus.validMs();
      const [docsGot, , buoyJson] = await Promise.all([
        Promise.all(SEA_GRIDS.map((g) => doc(g.path))),
        loadFrames().then(() => frames.ensure('wind10', tMs)).catch(() => null),
        doc(BUOY_PATH),
      ]);
      // 0.5° 동아시아 격자 안이면 그것을, 밖이면 전지구 5° 를. 값이 없는 칸(육지·구멍)은 다음 격자로 넘어간다.
      let grid = null;
      let values = null;
      // ⚠️ **유의파고가 있어야** 해상 지점이다. 수온·해류는 해안 칸에서 육지를 눌러도 값이 나온다
      //    (5°·0.5° 칸이 육지와 바다를 걸친다) — 그것만 보고 카드를 세우면 서울을 눌러도 '수온 25.1 °C' 가
      //    뜬다(2026-09-20 실측으로 잡았다). 옛 길도 wave_height 가 null 이면 '해양 자료 없음'이라 했다.
      for (let i = 0; i < SEA_GRIDS.length; i += 1) {
        const g = docsGot[i];
        const v = g ? seaValuesAt(g, lat, lon) : null;
        if (v && Number.isFinite(v.wave)) { grid = g; values = v; break; }
      }
      if (!grid) {
        const anyDoc = docsGot.some(Boolean);
        return anyDoc
          ? { lat, lon, none: true, reason: ko ? '이 자리는 우리 해양 격자에 값이 없습니다 — 연안 밖 바다를 눌러 보세요.' : 'Our ocean grid holds no value here — try a point further offshore.' }
          : { lat, lon, error: ko ? '해양 격자 자료를 받지 못했습니다. 잠시 후 다시 조회해 주세요.' : 'The ocean grid could not be loaded. Please try again shortly.' };
      }
      // 바람은 색면·입자와 같은 GFS 10 m 프레임에서 읽는다(u·v 두 채널 → 크기와 불어오는 쪽).
      let wind = null;
      const ws = frames.loaded ? sampleField(FIELD_DESCRIPTORS.windgrid, lat, lon, tMs) : null;
      const sv = ws && ws.sample && ws.sample.values;
      if (sv && sv.length >= 2 && Number.isFinite(sv[0]) && Number.isFinite(sv[1])) {
        wind = {
          speed: Math.hypot(sv[0], sv[1]),
          // 기상 관례: 바람이 **불어오는** 쪽. u·v 는 불어가는 쪽이라 부호를 뒤집는다.
          dirDeg: ((Math.atan2(-sv[0], -sv[1]) * 180) / Math.PI + 360) % 360,
          status: ws.status,
        };
      }
      const nearBuoys = buoyJson ? buoysNear({ lat, lon }, buoyJson, BUOY_KM, BUOY_FRESH_H, now()) : [];
      return {
        lat, lon, grid: values, gridInfo: { res: grid.res, time: grid.time, source: grid.source },
        wind, buoys: nearBuoys, retrievedAt: new Date(now()).toISOString(),
      };
    },

    /** 해상 카드의 안쪽 글. 값 줄 · 실측 대조 · 출처 순. */
    seaHtml(sea) {
      if (!sea || sea.error || sea.none) return '';
      const rows = [];
      for (const row of SEA_ROWS) {
        const text = seaRowText(row, sea.grid[row.key], ko);
        if (text) rows.push(stat(ko ? row.ko : row.en, text));
      }
      const info = frames.info ? frames.info() : null;
      const windLine = sea.wind
        ? stat(ko ? '풍속 · 10 m' : 'Wind · 10 m', `${sea.wind.speed.toFixed(1)} m/s ${compass16(sea.wind.dirDeg)}${ko ? '풍' : ''}`)
        : stat(ko ? '풍속 · 10 m' : 'Wind · 10 m', '—');
      // 실측 우선 — 가까운 파고 부이가 신선하면 모델과의 차이를 숫자로 적는다. 없으면 '없다'고 적는다.
      const fresh = (sea.buoys || []).filter((b) => b.fresh);
      const wave = sea.grid.wave;
      let obs;
      if (fresh.length && Number.isFinite(wave)) {
        const b = fresh[0];
        obs = ko
          ? `실측 — 기상청 해양관측망 ${b.name}(${b.km} km) 유의파고 ${b.wh} m · 위 격자값과 ${Math.abs(b.wh - wave).toFixed(1)} m 차이`
          : `Observed — KMA ${b.name} (${b.km} km): ${b.wh} m, differing from the grid value by ${Math.abs(b.wh - wave).toFixed(1)} m`;
      } else if ((sea.buoys || []).length) {
        obs = ko
          ? `실측 — ${BUOY_KM} km 안 파고 관측점(${sea.buoys[0].name})이 ${BUOY_FRESH_H}시간 넘어 대조에서 뺐습니다.`
          : `Observed — the nearest wave station (${sea.buoys[0].name}) is older than ${BUOY_FRESH_H} h and was left out.`;
      } else {
        obs = ko
          ? `실측 — ${BUOY_KM} km 안에 파고 관측점이 없습니다(기상청 해양관측망은 우리 바다만 덮습니다). 격자값만입니다.`
          : `Observed — no wave station within ${BUOY_KM} km (the KMA network covers Korean waters only). Grid value only.`;
      }
      const windMeta = sea.wind ? [sourceLabel(info), ...timeMeta(info, timeBus.validMs(), ko)].join(' · ') : '';
      return rows.join('') + windLine
        + `<p>${esc(ko ? '유의파고는 높은 쪽 1/3 파도의 평균 높이입니다.' : 'Significant wave height is the mean of the highest third of the waves.')}</p>`
        + `<p>${esc(obs)}</p>`
        + `<p>${esc(seaSourceLine({ ...sea.gridInfo }, ko))}${windMeta ? `<br/>${esc(`${ko ? '바람' : 'Wind'}: ${windMeta}`)}` : ''}</p>`
        + `<p style="opacity:.75">${esc(ko
          ? '풍파 높이와 너울 방향은 우리 해양 격자에 없어 줄을 뺐습니다 — 근사치로 채우지 않습니다.'
          : 'Wind-wave height and swell direction are not in our ocean grid, so those rows are absent — we do not fill them with an approximation.')}</p>`;
    },

    /** 시험·콘솔용. */
    docsLoaded() { return [...docs.keys()]; },
  };
  return api;
}

let shared = null;
/** 앱 전체가 나눠 쓰는 하나 — 지점을 여러 번 눌러도 JSON 한 장은 한 번만 받는다. */
export function sharedPointReadout(deps) {
  if (!shared) shared = createPointReadout(deps || {});
  return shared;
}
