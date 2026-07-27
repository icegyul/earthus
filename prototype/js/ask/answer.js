// 판단 결과 → 실제 행동. 라우터가 "무엇을"을 정하면 여기가 "보여준다".
//
// ⚠️ 답을 지어내지 않는다 — 이 파일의 존재 이유다.
//    여기서 만드는 문장은 전부 **우리가 센 숫자**다:
//      "지금 화면 자료에 스페인 영역 산불 4건, 가장 강한 것 1,240 MW"
//    이건 검증 가능한 사실이라 틀릴 수는 있어도(자료가 틀리면) 지어낸 것은 아니다.
//    "아마 ~일 것이다", "~로 보입니다" 류를 절대 만들지 말 것.
//
// ⚠️ 자료가 없으면 없다고 한다. 비슷한 걸 대신 보여주지 않는다.
//    재난 정보에서 "없음"과 "못 찾음"은 완전히 다른 말이다. 둘을 구분해 말한다.

import { router, PLACES } from './router.js';
import { store } from '../store.js';
import { i18n } from '../i18n.js';
import { flyTo } from '../viewer.js';
import { pointLayers } from '../layers/registry.js';

/** 지역 상자 안인가. ⚠️ 경도가 날짜변경선을 넘는 상자(태평양)를 따로 다룬다. */
function inBox(lat, lon, [s, w, n, e]) {
  if (lat < s || lat > n) return false;
  return w <= e ? (lon >= w && lon <= e) : (lon >= w || lon <= e);
}

/** 상자의 중심과 적당한 시야 높이 */
function boxView([s, w, n, e]) {
  const lat = (s + n) / 2;
  const lon = w <= e ? (w + e) / 2 : ((w + e + 360) / 2 + 180) % 360 - 180;
  const span = Math.max(n - s, Math.abs(e - w) || 10);
  return { lat, lon, height: Math.min(14_000_000, Math.max(800_000, span * 260_000)) };
}

/* 소재별로 "무엇을 세고 무엇을 이름으로 부르나".
   ⚠️ 레이어마다 자료 모양이 달라서 여기서 한 번에 맞춘다. */
const READERS = {
  cyclone: async () => {
    const { cyclones } = await import('../layers/cyclone.js');
    return (cyclones.list || []).map(s => ({
      lat: s.lat, lon: s.lon, label: s.name,
      detail: s.ended
        ? (i18n.lang === 'ko' ? '관측 종료' : 'no longer reported')
        : (s.kmh != null ? `${Math.round(s.kmh)} km/h` : ''),
      sort: s.kmh || 0, raw: s,
    }));
  },
  tsunami: async () => {
    const { tsunami } = await import('../layers/tsunami.js');
    return (tsunami.list || []).map(t => ({
      lat: t.lat, lon: t.lon, label: t.event || t.headline || '—',
      detail: t.area || '', sort: 1, raw: t,
    }));
  },
};

/* 격자 레이어 — 점 목록이 아니라 **그 지역의 값**으로 답한다.
   ⚠️ 격자에 "몇 건"은 뜻이 없다. 파고가 몇 건 있냐고 물으면 안 된다.
      대신 그 상자 안의 지금 값(평균·최대)을 말한다. */
const GRID_LAYERS = new Set(['sst', 'wave', 'swell', 'current', 'pm25', 'pm10',
  'dust', 'ozone', 'uv', 'aqi', 'fog', 'drought', 'temp', 'humidity', 'tmax', 'tmin']);

async function readGrid(layerId, box) {
  const { gridOverlay } = await import('../gridoverlay.js');
  const g = await gridOverlay.gridFor(layerId);
  if (!g) return null;
  const field = gridOverlay.fieldOf(layerId);
  const arr = g[field];
  if (!arr) return null;
  const vals = [];
  for (let iy = 0; iy < g.ny; iy++) {
    for (let ix = 0; ix < g.nx; ix++) {
      const v = arr[iy * g.nx + ix];
      if (v == null) continue;
      const lat = g.lat0 + iy * g.res, lon = g.lon0 + ix * g.res;
      if (box && !inBox(lat, lon, box)) continue;
      vals.push({ v, lat, lon });
    }
  }
  /* ⚠️ 상자가 격자보다 작으면 안에 점이 하나도 없다.
     실측: 서울 상자는 1°×1° 인데 격자는 5° 라 "값 없음"이 나왔다.
     그럴 때는 **가장 가까운 격자점**을 쓰고, 그 사실을 밝힌다.
     "값이 없다"고 말하면 자료가 없는 줄 알게 되는데 사실은 있다. */
  let nearest = false;
  if (!vals.length && box) {
    const cLat = (box[0] + box[2]) / 2;
    const cLon = box[1] <= box[3] ? (box[1] + box[3]) / 2 : box[1];
    let best = null;
    for (let iy = 0; iy < g.ny; iy++) {
      for (let ix = 0; ix < g.nx; ix++) {
        const v = arr[iy * g.nx + ix];
        if (v == null) continue;
        const lat = g.lat0 + iy * g.res, lon = g.lon0 + ix * g.res;
        let dLon = Math.abs(lon - cLon); if (dLon > 180) dLon = 360 - dLon;
        const d = (lat - cLat) ** 2 + dLon ** 2;
        if (!best || d < best.d) best = { d, v, lat, lon };
      }
    }
    /* ⚠️ 아주 먼 격자점을 "그 지역 값"이라고 하면 안 된다.
       10° (약 1,100km) 넘게 떨어지면 값이 없다고 말하는 편이 정직하다.
       (바다 자료를 내륙 도시에서 물으면 실제로 이렇게 된다.) */
    if (best && best.d <= 100) { vals.push(best); nearest = true; }
  }
  if (!vals.length) return null;
  const nums = vals.map(x => x.v);
  const mean = nums.reduce((a, b) => a + b, 0) / nums.length;
  const hi = vals.reduce((a, b) => (b.v > a.v ? b : a));
  const lo = vals.reduce((a, b) => (b.v < a.v ? b : a));
  const scale = gridOverlay.scaleOf(layerId);
  return { n: nums.length, mean, hi, lo, unit: scale?.unit || '', time: g.time, nearest };
}

/** 지금 수온 − 평년값. 지역 상자가 있으면 그 안만. */
async function readAnomaly(box) {
  const { gridOverlay } = await import('../gridoverlay.js');
  const an = await gridOverlay.sstAnomaly();
  if (!an) return null;
  const g = await gridOverlay.load('marine');
  let sum = 0, n = 0;
  for (let iy = 0; iy < g.ny; iy++) {
    for (let ix = 0; ix < g.nx; ix++) {
      const k = iy * g.nx + ix;
      if (an.diff[k] == null) continue;
      if (box && !inBox(g.lat0 + iy * g.res, g.lon0 + ix * g.res, box)) continue;
      sum += an.diff[k]; n++;
    }
  }
  /* ⚠️ 상자가 격자보다 작으면 한 칸도 안 걸린다 (서울 1°×1° vs 격자 5°).
     값 격자에서 쓴 것과 같은 규칙으로 가장 가까운 칸을 쓴다.
     여기만 "없다"고 하면 값은 나오는데 편차만 안 나오는 이상한 답이 된다. */
  if (!n && box) {
    const cLat = (box[0] + box[2]) / 2;
    const cLon = box[1] <= box[3] ? (box[1] + box[3]) / 2 : box[1];
    let best = null;
    for (let iy = 0; iy < g.ny; iy++) {
      for (let ix = 0; ix < g.nx; ix++) {
        const k = iy * g.nx + ix;
        if (an.diff[k] == null) continue;
        const lat = g.lat0 + iy * g.res, lon = g.lon0 + ix * g.res;
        let dLon = Math.abs(lon - cLon); if (dLon > 180) dLon = 360 - dLon;
        const d = (lat - cLat) ** 2 + dLon ** 2;
        if (!best || d < best.d) best = { d, v: an.diff[k] };
      }
    }
    if (best && best.d <= 100) { sum = best.v; n = 1; }
  }
  if (!n) return null;
  return { mean: sum / n, n, period: an.period, doy: an.doy };
}

/** 점 레이어 공통 — PointLayer.items 가 모든 점 레이어의 같은 자리에 있다 */
function readPoints(layerId, fmt) {
  const L = pointLayers[layerId];
  if (!L || !L.items) return null;
  return L.items.map(m => ({
    lat: m.lat, lon: m.lon,
    label: m.name || m.id || '—',
    detail: fmt ? fmt(m) : '',
    sort: m.data?._frp ?? m.data?._mag ?? m.radius ?? 0,
    raw: m,
  }));
}

const POINT_FMT = {
  wildfire: m => `${Math.round(m.data?._frp || 0).toLocaleString()} MW`,
  quake:    m => (m.data?._mag != null ? `M ${m.data._mag}` : ''),
  buoy:     m => m.name || '',
};

export const ask = {
  /**
   * 질문 하나를 처리한다.
   * @returns {{ok, kind, title, lines, items, source, why, suggest}}
   */
  async run(q) {
    const ko = i18n.lang === 'ko';
    await router.load();
    const p = router.parse(q, i18n.lang);

    if (!p.ok) {
      return {
        ok: false,
        kind: 'miss',
        title: ko ? '무엇에 대한 질문인지 못 찾았습니다' : 'Could not tell what this is about',
        lines: [ko
          ? '지구에서 일어나는 일에 대해 물어봐 주세요. 아래 예시를 눌러도 됩니다.'
          : 'Ask about something happening on Earth. You can tap an example below.'],
        suggest: this.examples(),
        why: { reason: p.reason },
      };
    }

    const ds = p.datasets[0];
    const layerId = p.action?.layer || null;

    // ── 1. 해당 레이어를 켠다 ──
    // ⚠️ 끄지는 않는다. 사용자가 켜 둔 것을 질문 하나로 꺼버리면 안 된다.
    if (layerId && !store.isOn(layerId)) store.setLayer(layerId, true);

    // ── 2a. 격자 레이어는 값으로 답한다 ──
    if (layerId && GRID_LAYERS.has(layerId)) {
      const box = p.place?.box;
      if (box) { const v = boxView(box); flyTo(v.lon, v.lat, v.height); }
      let g = null;
      try { g = await readGrid(layerId, box); } catch (e) { g = null; }
      const what = ko ? (ds.title.ko || ds.id) : (ds.title.en || ds.id);
      const nm = i18n.t.L?.[layerId] || layerId;
      const placeName = p.place ? (ko ? p.place.ko[0] : p.place.en[0]) : null;
      const lines = [];
      if (!g) {
        lines.push(ko
          ? `${nm} 레이어를 켰습니다. 아직 격자를 불러오는 중이거나, 그 지역에 값이 없습니다(예: 바다 자료를 육지에서 물으면 값이 없습니다).`
          : `Turned on ${nm}. The grid is still loading, or there is no value in that area (ocean data has none over land).`);
      } else {
        const f = x => (Math.abs(x) >= 100 ? x.toFixed(0) : x.toFixed(1));
        lines.push(placeName
          ? (ko ? `${placeName} 영역 ${nm}: 평균 ${f(g.mean)}${g.unit}, 최고 ${f(g.hi.v)}${g.unit}`
                : `${placeName} — ${nm}: mean ${f(g.mean)}${g.unit}, max ${f(g.hi.v)}${g.unit}`)
          : (ko ? `전지구 ${nm}: 평균 ${f(g.mean)}${g.unit}, 최고 ${f(g.hi.v)}${g.unit} (${g.hi.lat.toFixed(0)}°, ${g.hi.lon.toFixed(0)}°)`
                : `Global ${nm}: mean ${f(g.mean)}${g.unit}, max ${f(g.hi.v)}${g.unit}`));
        if (g.nearest) {
          lines.push(ko
            ? `⚠️ 그 지역이 격자(5°)보다 작아서 **가장 가까운 격자점**(${g.hi.lat.toFixed(0)}°, ${g.hi.lon.toFixed(0)}°) 값을 보여드립니다.`
            : `⚠️ That area is smaller than the 5° grid, so this is the **nearest grid point** (${g.hi.lat.toFixed(0)}°, ${g.hi.lon.toFixed(0)}°).`);
        }
        lines.push(ko
          ? `격자점 ${g.n}개 기준 · 자료 시각 ${(g.time || '').replace('T', ' ').replace(':00:00Z', ' UTC')}`
          : `From ${g.n} grid points · data time ${(g.time || '').replace('T', ' ')}`);
        /* ⚠️ 5° 격자라는 걸 밝힌다. "우리 동네 값"으로 읽히면 안 된다. */
        lines.push(ko
          ? '⚠️ 5° 격자(약 550km) 값입니다. 동네 단위 값이 아닙니다 — 지점 값은 관측소나 부이를 눌러 보세요.'
          : '⚠️ These are 5° grid values (~550 km). Not neighbourhood-level — tap a station or buoy for point readings.');
      }
      /* ── 평년 대비 ─────────────────────────────────────────
         ⚠️ 해수면온도만 답할 수 있다. 다른 값은 평년 기준선이 아직 없다.
            "없는데 있는 척"이 가장 나쁘므로, 되는 것만 되고 나머지는 못 한다고 말한다. */
      if (p.intent === 'compare') {
        if (layerId === 'sst') {
          const an = await readAnomaly(box);
          if (an) {
            const sign = an.mean >= 0 ? '+' : '';
            lines.push(placeName
              ? (ko ? `평년(${an.period}) 대비 ${sign}${an.mean.toFixed(2)}°C — ${placeName} 영역 격자 ${an.n}개 평균`
                    : `${sign}${an.mean.toFixed(2)}°C versus the ${an.period} normal — mean of ${an.n} grid cells in ${placeName}`)
              : (ko ? `전지구 바다는 평년(${an.period}) 대비 ${sign}${an.mean.toFixed(2)}°C 입니다 (격자 ${an.n}개 평균)`
                    : `Global ocean is ${sign}${an.mean.toFixed(2)}°C versus the ${an.period} normal (mean of ${an.n} cells)`));
            /* ⚠️ 같은 달력 날짜와 비교했다는 사실을 밝힌다.
               이걸 안 밝히면 연평균과 비교한 것과 구분되지 않는다. */
            lines.push(ko
              ? `⚠️ **같은 달력 날짜**(연중 ${an.doy}일째)의 평년값과 비교한 값입니다. 연평균이 아닙니다.`
              : `⚠️ Compared against the normal for the **same calendar day** (day ${an.doy} of the year), not an annual mean.`);
          } else {
            lines.push(ko
              ? '평년값을 불러오지 못해 비교를 하지 않았습니다. 없는 값을 지어내지 않습니다.'
              : 'The climatology could not be loaded, so no comparison was made. We do not fabricate it.');
          }
        } else {
          lines.push(ko
            ? '⚠️ 평년 기준선은 지금 **해수면온도**만 있습니다. 이 값은 아직 평년과 비교할 수 없습니다.'
            : '⚠️ A climatology baseline exists only for **sea surface temperature** so far. This value cannot yet be compared against normal.');
        }
      }
      return { ok: true, kind: 'grid', title: nm, lines, items: [], count: null,
               source: router.citation(ds.id), why: p.why, layer: layerId };
    }

    // ── 2b. 점 레이어는 목록으로 답한다 ──
    let items = null;
    if (READERS[layerId]) {
      try { items = await READERS[layerId](); } catch (_) { items = null; }
    } else if (layerId) {
      items = readPoints(layerId, POINT_FMT[layerId]);
    }

    // ── 3. 지역이 있으면 거른다 ──
    const box = p.place?.box;
    let scoped = items;
    if (items && box) scoped = items.filter(x => x.lat != null && inBox(x.lat, x.lon, box));

    // ── 4. 화면을 옮긴다 ──
    if (box) {
      const v = boxView(box);
      flyTo(v.lon, v.lat, v.height);
    } else if (scoped?.length) {
      const top = [...scoped].sort((a, b) => b.sort - a.sort)[0];
      if (top.lat != null) flyTo(top.lon, top.lat, 6_000_000);
    }

    // ── 5. 사실만으로 문장을 만든다 ──
    const placeName = p.place ? (ko ? p.place.ko[0] : p.place.en[0]) : null;
    const what = ko ? (ds.title.ko || ds.id) : (ds.title.en || ds.id);
    const lines = [];
    let top3 = [];

    if (scoped === null) {
      // ⚠️ "없음"이 아니라 "아직 못 읽음"이다. 반드시 구분해 말한다.
      lines.push(ko
        ? `${what} 자료를 화면에 켰습니다. 아직 불러오는 중이라 숫자는 잠시 뒤에 나옵니다.`
        : `Turned on ${what}. It is still loading, so counts will appear shortly.`);
    } else if (!scoped.length) {
      lines.push(placeName
        ? (ko ? `지금 받은 자료에는 ${placeName} 영역에 해당하는 것이 없습니다.`
              : `Nothing in the ${placeName} area in the data we currently have.`)
        : (ko ? '지금 받은 자료에는 해당하는 것이 없습니다.'
              : 'Nothing matching in the data we currently have.'));
      if (box) lines.push(ko
        ? '화면은 그 지역으로 옮겼습니다. 자료가 없는 것과 사건이 없는 것은 다를 수 있습니다.'
        : 'The view has moved there. Note that "no data" and "no event" are not the same thing.');
    } else {
      top3 = [...scoped].sort((a, b) => b.sort - a.sort).slice(0, 3);
      lines.push(placeName
        ? (ko ? `${placeName} 영역에 ${what} ${scoped.length}건이 있습니다.`
              : `${scoped.length} in the ${placeName} area — ${what}.`)
        : (ko ? `지금 ${what} ${scoped.length}건이 있습니다.`
              : `${scoped.length} right now — ${what}.`));
    }

    // ── 6. 아직 못 하는 것은 못 한다고 말한다 ──
    if (p.intent === 'compare') {
      lines.push(ko
        ? '⚠️ "평년과 비교"는 아직 답할 수 없습니다. 평년 기준선을 만드는 중이라, 그때까지는 "지금 값"만 보여드립니다.'
        : '⚠️ Comparison against normal is not available yet — the climatology baseline is still being built. Until then only current values are shown.');
    }
    if (p.intent === 'explain') {
      lines.push(ko
        ? '⚠️ "왜"에는 답하지 않습니다. 원인은 자료로 판정해야 하는데 우리가 가진 것으로는 판정할 수 없습니다. 대신 관측된 값을 보여드립니다.'
        : '⚠️ We do not answer "why". Causation has to be established from data we do not have. Observed values are shown instead.');
    }

    return {
      ok: true,
      kind: 'result',
      title: what,
      lines,
      items: top3,
      count: scoped?.length ?? null,
      source: router.citation(ds.id),
      /* ⚠️ 왜 이 답이 나왔는지 항상 같이 낸다. 근거를 못 대는 답은 믿을 수 없다. */
      why: p.why,
      layer: layerId,
    };
  },

  /** 지금 확실히 답할 수 있는 질문들 — 못 알아들었을 때 이걸 보여준다 */
  examples() {
    return i18n.lang === 'ko'
      ? ['지금 태풍 어디야?', '스페인 산불 있어?', '동해 수온 어때?',
         '오늘 지진 몇 건?', '일본 근처 부이 보여줘', '지금 오로라 볼 수 있어?']
      : ['Where are the storms?', 'Any wildfires in Spain?', 'Sea temperature near Korea?',
         'How many earthquakes today?', 'Show buoys near Japan', 'Any aurora right now?'];
  },
};
