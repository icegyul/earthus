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

import { FIELD_DESCRIPTORS, cellLabel, fieldStatusOf, fmtValid, readoutOf, sourceLabel, statusText, timeMeta } from './field-layer.js?v=1';
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

/** 받은 답을 눌러 두는 시간. **실패는 여기 해당하지 않는다** — 실패는 캐시하지 않는다(doc 머리말). */
export const DOC_TTL_MS = 10 * 60_000;

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
  // 날짜 문법은 색면·범례와 같은 함수(fmtValid)를 쓴다 — 한 카드 안에서 '09-20 21:00' 과 '09/20 22:41' 이
  // 섞여 있으면 둘이 다른 자료처럼 읽힌다.
  const when = t != null
    ? `${ko ? '기준' : 'as of'} ${fmtValid(t, ko)}`
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

  // 받은 답만 눌러 둔다(ok · missing). 실패는 여기 들어가지 않는다.
  const docs = new Map();
  // 마지막 시도의 결과 — 실패도 남는다. 화면이 '못 받았다'와 '없다'를 **다른 문장**으로 적으려면 이게 있어야 한다.
  // (이름이 status 면 weather() 안의 sampleField status 와 겹친다 — 겹치는 이름은 다음 사람이 헛짚는다.)
  const docState = new Map();

  /**
   * 문서 한 장의 상태.
   *   'ok'      받았고 내용이 있다
   *   'missing' 물었고 답은 왔는데 우리가 그 자료를 안 갖고 있다(404 · 빈 문서) — '없다'고 말해도 되는 자리
   *   'failed'  못 받았다 — '없다'고 말하면 거짓이다
   */
  const docStateOf = (path) => docState.get(path) || null;

  /**
   * ⚠️ **실패는 캐시하지 않는다.** 전에는 실패도 json=null 을 at=now() 로 눌러 두고 pending 을 비워서
   *    10분 안의 재호출이 네트워크를 안 타고 곧바로 null 을 돌려줬다. 결과가 둘이었다:
   *      ① '다시 조회' 단추가 10분간 아무 일도 안 했다(실패한 그 자리에서 다시 눌러도 같은 null 이다).
   *      ② 파일 하나를 못 받은 것이 화면에서 '이 자리에 자료가 없다'는 **사실처럼** 읽혔다.
   *    받은 답만 ttl 로 눌러 두고, 실패는 자리를 비워 다음 클릭이 정말 다시 받게 한다.
   */
  function doc(path, ttlMs = DOC_TTL_MS) {
    const hit = docs.get(path);
    if (hit && hit.pending) return hit.pending;
    if (hit && now() - hit.at < ttlMs) return Promise.resolve(hit.json);
    const pending = Promise.resolve()
      .then(() => doFetch(`${base}${path}`, { cache: 'no-store' }))
      .then(async (r) => {
        if (!r) return { json: null, st: 'failed' };
        // 404 는 '우리가 그 파일을 안 올린다'는 답이다 — 못 받은 것과 다르다.
        // ⚠️ 이 갈래는 가짜 응답으로만 시험했다. 실제 S3 가 없는 키에 403 을 돌려주면(ListBucket 권한이
        //    없는 공개 버킷이 그렇다) 없는 파일도 'failed' 가 된다 — 화면은 '못 받았다 · 다시 조회'라고
        //    말한다. 틀린 쪽이 아니라 **모른다고 말하는 쪽**이라 그대로 둔다. 운영 응답을 확인하면 좁힌다.
        if (!r.ok) return { json: null, st: r.status === 404 ? 'missing' : 'failed' };
        const json = await r.json();
        return (json && typeof json === 'object') ? { json, st: 'ok' } : { json: null, st: 'missing' };
      })
      .catch(() => ({ json: null, st: 'failed' }))
      .then(({ json, st }) => {
        docState.set(path, st);
        if (st === 'failed') docs.delete(path);
        else docs.set(path, { at: now(), json, pending: null });
        return json;
      });
    docs.set(path, { at: hit ? hit.at : now(), json: hit ? hit.json : null, pending });
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
      // 이 카드는 **클릭 순간의 프레임**을 읽어 글자로 구운 것이고, 타임라인이 움직여도 스스로 다시 짓지 못한다.
      // 색면 카드에는 제자리 갱신 장치가 있지만(field-layer.js swapFieldCard) 그것은 FieldLayer 가 자기 id 로
      // 표를 달아 둔 카드만 갈아 끼운다. 이 카드는 **그 색면이 꺼져 있을 때** 서는 카드라(main.js pointWeather
      // ②) 갈아 끼울 주인이 없고, 주인을 만드는 일은 main.js 쪽 배선이다. 고치지 못하는 동안 숨기지 않고
      // **화면이 제가 한 일을 말한다** — 값이 읽힌 카드에만 붙인다(값이 없는 카드에 붙이면 군소리다).
      const frozen = r.ok
        ? `<p style="opacity:.75">${esc(ko
          ? '이 값은 위 유효 시각의 프레임에서 읽은 것입니다 — 타임라인을 옮기면 이 카드는 따라가지 않습니다. 그 시각의 값은 지점을 다시 눌러 주세요.'
          : 'This value comes from the frame for the valid time above — the card does not follow the timeline. Click the point again to read another hour.')}</p>`
        : '';
      const html = stat(q, r.ok ? r.text : '—') + stat(ko ? '지점' : 'Point', fmtPoint(lat, lon))
        + `<p>${esc(r.ok ? r.note : r.text)}${r.ok ? (ko ? ' — 도시·지점의 관측값이 아닙니다.' : ' — not a city or station observation.') : ''}</p>`
        + `<p>${esc(meta.join(' · '))}${st ? ` · ${esc(st)}` : ''}</p>`
        + frozen
        + `<p style="opacity:.75">${ko ? '지구에 칠하는 것과 같은 프레임에서 읽었습니다 — 제3자 API 조회 없음.' : 'Read from the same frame the globe is painted with — no third-party API call.'}</p>`;
      const gridWord = desc.badge === 'OBSERVED' ? (ko ? '관측 격자값' : 'observed grid value') : (ko ? '모델 격자값' : 'model grid value');
      return {
        title: ko ? `지점 ${q}(${gridWord})` : `Point ${q.toLowerCase()} (${gridWord})`,
        html, badge: r.ok ? (desc.badge || 'MODEL') : 'UNAVAILABLE',
      };
    },

    /**
     * 해상 지점 — 우리 바다 격자 + GFS 10 m 바람 + (있으면) 기상청 해양관측망 실측.
     * → { lat, lon, grid, gridInfo, wind, buoys, buoyStatus, docs, tMs, timeOffsetMs, retrievedAt }
     * | { lat, lon, none, reason, docs }   자료를 다 받았고 이 자리에 값이 **없다**
     * | { lat, lon, error, docs }          못 받은 것이 있어 값이 있는지 **모른다**
     *   buoys  [] = 목록을 읽었고 반경 안에 없다 · null = 목록을 못 받아 **모른다**
     *   tMs    바람을 샘플한 시각. 카드의 '유효'는 이 값이고, 렌더 때 timeBus 를 다시 읽지 않는다.
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
      // ⚠️ 값이 없는 것과 **못 받은 것**은 다른 사실이다. 전에는 둘 다 '자료 없음'으로 흘러
      //    파일 하나를 못 받았을 뿐인데 화면이 '이 자리에 자료가 없다'고 단정했다.
      //    받은 답이 하나도 없으면 오류, 일부만 못 받았으면 **모른다**, 다 받았으면 그제야 '없다'.
      const gridDocs = SEA_GRIDS.map((g) => ({ path: g.path, st: docStateOf(g.path) }));
      if (!grid) {
        const failed = gridDocs.filter((d) => d.st === 'failed');
        /* 2026-09-21 재검이 "격자 쪽도 missing 을 '없다'로 읽는다"고 지적했지만 **여기서는 그대로 둔다.**
           이 파일이 정한 뜻(위 doc 머리말)에서 missing 은 "물었고 답은 왔는데 우리가 그 자료를 안 갖고 있다"이고,
           바다 격자는 **두 장을 차례로 보는 구조**다 — 동아시아 0.5° 문서가 그 자리를 안 담는 것은 고장이 아니라
           정상 경로이고(그래서 전지구 5° 로 내려간다), 그것을 오류로 올리면 한국 밖 바다를 누를 때마다
           '알 수 없습니다'가 뜬다. 고쳐야 했던 것은 **부이 쪽 문장**이었다(아래 gone 분기) — 거기서는
           문서가 하나뿐이라 missing 이 곧 '대조하지 못했다'이고, 그것을 '받지 못했다'고 적은 것이 거짓이었다. */
        if (!failed.length) {
          return { lat, lon, none: true, docs: gridDocs,
            reason: ko ? '이 자리는 우리 해양 격자에 값이 없습니다 — 연안 밖 바다를 눌러 보세요.' : 'Our ocean grid holds no value here — try a point further offshore.' };
        }
        const names = failed.map((d) => d.path.split('/').pop()).join(' · ');
        return { lat, lon, docs: gridDocs,
          error: failed.length === gridDocs.length
            ? (ko ? '해양 격자 자료를 받지 못했습니다. 잠시 후 다시 조회해 주세요.' : 'The ocean grid could not be loaded. Please try again shortly.')
            : (ko ? `해양 격자 가운데 ${names} 를 받지 못해 이 자리에 값이 있는지 알 수 없습니다. 잠시 후 다시 조회해 주세요.`
              : `We could not load ${names}, so whether this point holds a value is unknown. Please try again shortly.`) };
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
      // ⚠️ **null(모름) 과 [](없음) 을 나눈다.** 관측점 목록을 못 받았을 때와 반경 안에 정말 없을 때가
      //    같은 빈 배열이면, 카드가 '100 km 안에 파고 관측점이 없습니다' 라고 단정한다 —
      //    있는 관측점을 없다고 말하는 것은 '없는 것을 있는 척'의 뒤집힌 형태다.
      //    목록을 **읽었을 때만** 없다고 말할 자격이 생긴다.
      const buoyStatus = docStateOf(BUOY_PATH);
      const nearBuoys = buoyStatus === 'ok' ? buoysNear({ lat, lon }, buoyJson, BUOY_KM, BUOY_FRESH_H, now()) : null;
      return {
        lat, lon, grid: values, gridInfo: { res: grid.res, time: grid.time, source: grid.source },
        wind, buoys: nearBuoys, buoyStatus, docs: gridDocs,
        // 바람을 읽은 **그 시각**. 카드가 적는 '유효'는 이 값이다(timeBus 를 렌더 때 다시 읽지 않는다).
        tMs, timeOffsetMs: typeof timeBus.offsetMs === 'number' ? timeBus.offsetMs : null,
        retrievedAt: new Date(now()).toISOString(),
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
      // 실측 우선 — 가까운 파고 부이가 신선하면 모델과의 차이를 숫자로 적는다.
      // ⚠️ '없다'고 적는 것은 **목록을 읽었을 때뿐**이다(sea.buoys 가 배열). 못 받았으면(null) 모른다고 적는다.
      const known = Array.isArray(sea.buoys);
      const list = known ? sea.buoys : [];
      const fresh = list.filter((b) => b.fresh);
      const wave = sea.grid.wave;
      let obs;
      if (fresh.length && Number.isFinite(wave)) {
        const b = fresh[0];
        obs = ko
          ? `실측 — 기상청 해양관측망 ${b.name}(${b.km} km) 유의파고 ${b.wh} m · 위 격자값과 ${Math.abs(b.wh - wave).toFixed(1)} m 차이`
          : `Observed — KMA ${b.name} (${b.km} km): ${b.wh} m, differing from the grid value by ${Math.abs(b.wh - wave).toFixed(1)} m`;
      } else if (list.length) {
        obs = ko
          ? `실측 — ${BUOY_KM} km 안 파고 관측점(${list[0].name})이 ${BUOY_FRESH_H}시간 넘어 대조에서 뺐습니다.`
          : `Observed — the nearest wave station (${list[0].name}) is older than ${BUOY_FRESH_H} h and was left out.`;
      } else if (!known) {
        // ⚠️ '못 받았다'와 '우리에게 없다'를 가른다(2026-09-21 재검). 404 는 **답이 온 것**이라
        //    '받지 못했다'고 적으면 거짓이고, 다시 눌러도 달라지지 않는다. 다시 해 볼 값어치가
        //    있는 쪽(failed)에서만 '잠시 후 다시'를 권한다.
        const gone = sea.buoyStatus === 'missing';
        const file = BUOY_PATH.split('/').pop();
        obs = ko
          ? (gone
            ? `실측 — 기상청 해양관측망 목록(${file})이 우리 자료에 없습니다. ${BUOY_KM} km 안에 파고 관측점이 있는지 대조하지 못했습니다 — 아래는 격자값뿐입니다.`
            : `실측 — 기상청 해양관측망 목록(${file})을 받지 못했습니다. ${BUOY_KM} km 안에 파고 관측점이 있는지 모릅니다 — 아래는 격자값뿐입니다.`)
          : (gone
            ? `Observed — the KMA station list (${file}) is not in our data, so we could not check for a wave station within ${BUOY_KM} km. What follows is the grid value only.`
            : `Observed — the KMA station list (${file}) could not be loaded, so whether a wave station lies within ${BUOY_KM} km is unknown. What follows is the grid value only.`);
      } else {
        obs = ko
          ? `실측 — ${BUOY_KM} km 안에 파고 관측점이 없습니다(기상청 해양관측망은 우리 바다만 덮습니다). 격자값만입니다.`
          : `Observed — no wave station within ${BUOY_KM} km (the KMA network covers Korean waters only). Grid value only.`;
      }
      // ⚠️ 유효 시각은 **이 카드가 읽은 시각**(sea.tMs)이다. 렌더 때 timeBus 를 다시 읽으면,
      //    풍속 숫자는 클릭 순간에 굳어 있는데 그 옆 시각 딱지만 타임라인을 따라 움직인다 —
      //    같은 줄이 한 숫자를 두 시각의 것이라고 말하게 된다.
      const readMs = Number.isFinite(sea.tMs) ? sea.tMs : null;
      const windMeta = sea.wind ? [sourceLabel(info), ...timeMeta(info, readMs, ko)].join(' · ') : '';
      // 클릭 뒤에 타임라인이 옮겨졌나. **오프셋**으로 본다 — validMs 는 벽시계가 흘러도 달라지므로
      // 가만히 둔 화면을 '옮겼다'고 말하게 된다.
      const moved = Number.isFinite(sea.timeOffsetMs) && typeof timeBus.offsetMs === 'number'
        && timeBus.offsetMs !== sea.timeOffsetMs;
      // 어긋남은 **두 가지**이고 서로 독립이다. 한 문장에 묶으면 한쪽이 참일 때 다른 쪽이 거짓이 된다
      // (앞선 판에서 타임라인을 지금으로 되돌린 자리가 그랬다 — 바람만 옛 프레임인데 파도·수온까지
      //  '그 시각의 값이 아니다'라고 몰아 적었다).
      //   ⓐ 타임라인이 지금이 아니다 → 파도·수온·해류는 한 장뿐이라(수집기가 current= 로 받는다)
      //      그 시각의 값이 아니다. 같은 바다를 칠하는 색면(wavefield)은 그때 스스로 숨지만 카드는
      //      숨을 수 없으니 적는다. 이 줄이 없으면 T+48h 화면에서 '지금 파고'가 예보처럼 읽힌다.
      //   ⓑ 카드를 읽은 뒤에 타임라인이 옮겨졌다 → 바람도 지금 보고 있는 시각의 값이 아니다.
      //      ⓐ 의 '바람만 예보 프레임입니다' 는 이때 거짓이므로 그 괄호를 뺀다.
      let drift = '';
      if (timeBus.isNow && !timeBus.isNow()) {
        drift += `<p>${esc(ko
          ? `타임라인이 지금이 아닙니다 — 파도·수온·해류는 현재 시각 한 장이라 그 시각의 값이 아닙니다${(moved || !sea.wind) ? '.' : '(바람만 예보 프레임입니다).'}`
          : `The timeline is not at now — waves, sea temperature and current are a single present-time snapshot, not values for that hour${moved ? '.' : ' (only the wind is a forecast frame).'}`)}</p>`;
      }
      // ⚠️ 바람을 **읽지 못한** 카드에는 이 줄을 적지 않는다(2026-09-21 재검). 풍속 줄이 '—' 이고
      //    출처 줄에 '바람:' 조각도 없는데 그 사이에서 "…프레임에서 읽은 것입니다 · 다시 눌러 주세요"라고
      //    하면, 읽지도 않은 것을 읽었다고 말하고 눌러도 안 나올 것을 누르라고 시키는 셈이다.
      if (moved && readMs != null && sea && sea.wind) {
        const shown = fmtValid(timeBus.validMs(), ko);
        drift += `<p>${esc(ko
          ? `이 카드의 바람은 ${fmtValid(readMs, true)} 프레임에서 읽은 것입니다 — 타임라인은 지금 ${shown} 을 가리킵니다. 그 시각의 바람은 지점을 다시 눌러 주세요.`
          : `The wind on this card was read from the ${fmtValid(readMs, false)} frame, but the timeline now points at ${shown} — click the point again to read the wind for that hour.`)}</p>`;
      }
      return rows.join('') + windLine + drift
        + `<p>${esc(ko ? '유의파고는 높은 쪽 1/3 파도의 평균 높이입니다.' : 'Significant wave height is the mean of the highest third of the waves.')}</p>`
        + `<p>${esc(obs)}</p>`
        + `<p>${esc(seaSourceLine({ ...sea.gridInfo }, ko))}${windMeta ? `<br/>${esc(`${ko ? '바람' : 'Wind'}: ${windMeta}`)}` : ''}</p>`
        + `<p style="opacity:.75">${esc(ko
          ? '풍파 높이와 너울 방향은 우리 해양 격자에 없어 줄을 뺐습니다 — 근사치로 채우지 않습니다.'
          : 'Wind-wave height and swell direction are not in our ocean grid, so those rows are absent — we do not fill them with an approximation.')}</p>`;
    },

    /** 시험·콘솔용. docsLoaded 는 **받은 답**만이다(실패는 캐시하지 않으므로 여기 없다). */
    docsLoaded() { return [...docs.keys()]; },
    /** 문서별 마지막 시도 결과 — 'ok' | 'missing' | 'failed' | null(아직 안 물었다). */
    docStatus(path) { return path ? docStateOf(path) : Object.fromEntries(docState); },
  };
  return api;
}

let shared = null;
/** 앱 전체가 나눠 쓰는 하나 — 지점을 여러 번 눌러도 JSON 한 장은 한 번만 받는다. */
export function sharedPointReadout(deps) {
  if (!shared) shared = createPointReadout(deps || {});
  return shared;
}
