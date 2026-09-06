/* 취미 · 산 — 정상 예보와 실측을 나란히 (v2-three ext 모듈)
 *
 * 1.0 의 ui-mountain.js(카드) + mountain.js(자료·비교) + trails.js(등산로) 이식. 규약은 ext/CONTRACT.md.
 *   · 정상 예보·AWS 환산·MARK 기준·문구는 1.0 의 /js/mountain.js 를 **그대로 빌려 쓴다**
 *     (korea.js get('mountain'|'aws') 는 절대경로 S3 라 v2 페이지에서도 그대로 된다).
 *   · trails.js 는 Cesium 을 import 하므로 못 쓴다 — 자료 부분(색인 좌표 매칭 · 통계 · SAC 등급/색)을
 *     여기 그대로 옮겨 적었다. 그리기는 ctx.makeSegments (등급별 한 객체, 지면 위 40m).
 *
 * 화면의 뼈대는 하나다: 기상청 예보는 몇 도이고, **실제로 잰 값은 몇 도인가.**
 * ⚠️ "안전합니다"·"등산하기 좋습니다" 같은 말을 쓰지 않는다. 산에서는 사람이 죽고 우리는 예보 기관이 아니다.
 * ⚠️ 등산로 선은 "이 길로 가세요"가 아니다. OSM 에 그려진 길이고 폐쇄·통제는 담겨 있지 않다.
 */

const IDX_SRC = '/data/trails/index.json';
const TRAIL_DIR = '/data/trails/';
const LIFT_M = 40;          // trails.js LIFT_M — 0 이면 산비탈 지형에 먹혀 선이 사라진다
const PICK_KM = 20;
const PEAK_ALT_KM = 32;     // 1.0 showTrail 의 32_000m
const OVERVIEW = { lat: 36.4, lon: 127.9, altKm: 1100 };
const NEAR_N = 12;

/* sac_scale — 국제 산악연맹 등급. ⚠️ 우리가 매긴 것이 아니다. (trails.js 와 같다) */
const SAC_KO = {
  hiking: '산책로',
  mountain_hiking: '일반 등산로',
  demanding_mountain_hiking: '험한 등산로',
  alpine_hiking: '알파인 — 손을 쓴다',
  demanding_alpine_hiking: '알파인(상급)',
  difficult_alpine_hiking: '알파인(최상급) — 장비 필요',
};
const SAC_EN = {
  hiking: 'hiking',
  mountain_hiking: 'mountain hiking',
  demanding_mountain_hiking: 'demanding mountain hiking',
  alpine_hiking: 'alpine — hands needed',
  demanding_alpine_hiking: 'demanding alpine',
  difficult_alpine_hiking: 'difficult alpine — gear needed',
};
/* 등급별 색. ⚠️ 색으로 "좋다/나쁘다"가 아니라 **얼마나 험한가**를 말한다. (trails.js SAC_COLOR) */
const SAC_COLOR = {
  hiking: '#9fd8b0',
  mountain_hiking: '#8fd0e8',
  demanding_mountain_hiking: '#f2c15a',
  alpine_hiking: '#f0955a',
  demanding_alpine_hiking: '#e8705a',
  difficult_alpine_hiking: '#d8455a',
};
const PLAIN = '#8fd0e8';

const PEAK_COLOR = '#cfe0ee';        // 예보만 있는 봉우리
const PEAK_OBS_COLOR = '#9fd8b0';    // 같은 산에 실측 관측소가 있는 봉우리
const PEAK_SEL_COLOR = '#f2c15a';    // 고른 봉우리

const hhmm = (d) => d
  ? new Intl.DateTimeFormat('ko-KR', { hour: '2-digit', minute: '2-digit', hour12: false, timeZone: 'Asia/Seoul' }).format(d)
  : '—';

/** 풍향(도) → 여덟 방위 (ui-mountain.js) */
const DIR8 = ['북', '북동', '동', '남동', '남', '남서', '서', '북서'];
const DIR8_EN = ['N', 'NE', 'E', 'SE', 'S', 'SW', 'W', 'NW'];
const dirText = (deg, ko) => deg == null ? '' : (ko ? DIR8 : DIR8_EN)[Math.round(deg / 45) % 8];

/* ── 등산로 자료 (trails.js 의 Cesium 없는 부분을 그대로 옮김) ─────────────────── */
function kmLL(a1, o1, a2, o2) {
  const R = 6371, r = Math.PI / 180;
  const dl = (o2 - o1) * r, dp = (a2 - a1) * r;
  const h = Math.sin(dp / 2) ** 2 + Math.cos(a1 * r) * Math.cos(a2 * r) * Math.sin(dl / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
}

/* 색인 — **이름이 아니라 좌표로 찾는다.** 기상청 산 목록은 바뀐다(실측: 39개 중 20개만 이름이 맞았다).
   ⚠️ idx.maxKm(5km) 를 넘으면 다른 산으로 본다 — 지리산 노고단과 천왕봉은 25km 떨어져 등산로가 완전히 다르다. */
function matchTrailFile(idx, peak) {
  let file = null;
  if (peak?.lat != null && peak?.lon != null) {
    const max = idx.maxKm ?? 5;
    let best = null, bd = Infinity;
    (idx.peaks || []).forEach(p => {
      const d = kmLL(peak.lat, peak.lon, p.la, p.lo);
      if (d < bd) { bd = d; best = p; }
    });
    if (best && bd <= max) file = best.f;
  }
  if (!file) {
    const hit = (idx.peaks || []).find(p => p.n === String(peak?.name || ''));
    if (hit) file = hit.f;
  }
  return file;
}

/** 통계 — 카드에 적을 값 (trails.stats) */
function trailStats(doc, ko) {
  if (!doc?.ways?.length) return null;
  let total = 0;
  const bySac = new Map();
  const names = new Set();
  doc.ways.forEach(w => {
    let d = 0;
    for (let i = 1; i < w.p.length; i++) d += kmLL(w.p[i - 1][1], w.p[i - 1][0], w.p[i][1], w.p[i][0]);
    total += d;
    if (w.s) bySac.set(w.s, (bySac.get(w.s) || 0) + d);
    if (w.n) names.add(w.n);
  });
  return {
    ways: doc.ways.length,
    km: Math.round(total * 10) / 10,
    named: [...names].slice(0, 6),
    namedN: names.size,
    sac: [...bySac.entries()].sort((a, b) => b[1] - a[1])
      .map(([k, val]) => ({ key: k, ko: (ko ? SAC_KO : SAC_EN)[k] || k, km: Math.round(val * 10) / 10 })),
  };
}

async function loadIndex(ctx, state, signal) {
  if (state.idx) return state.idx;
  try { state.idx = await ctx.fetchJson(IDX_SRC, { signal, cache: 'force-cache' }); }
  catch (_) { state.idx = { peaks: [], maxKm: 5 }; }
  return state.idx;
}

/** 그 산의 등산로 자료. 없으면 null (자료가 없는 산도 있다 — 지어내지 않는다) */
async function loadTrail(ctx, state, peak) {
  state.trailCache = state.trailCache || new Map();
  const key = String(peak?.name || '');
  if (state.trailCache.has(key)) return state.trailCache.get(key);
  const idx = await loadIndex(ctx, state);
  const file = matchTrailFile(idx, peak);
  let doc = null;
  if (file) {
    try { doc = await ctx.fetchJson(TRAIL_DIR + encodeURIComponent(file), { cache: 'force-cache' }); }
    catch (_) { doc = null; }
  }
  state.trailCache.set(key, doc);
  return doc;
}

/* ── 카드 조각 (ui-mountain.js 문구 그대로) ───────────────────────────── */
function peakCard(ctx, state, p, { detail = false } = {}) {
  const { esc, ko } = ctx;
  const M = state.mod.mountain;
  const marks = M.marks(p, ko);
  const big = p.temp != null ? p.temp.toFixed(0) : '—';

  let obs = '';
  if (p.high) {
    const g = p.gap;
    const cls = g == null ? '' : (Math.abs(g) >= M.MARK.gapC ? ' big' : '');
    obs = `
      <div class="mt-obs${cls}">
        <div class="mt-obs-h">${ko ? '실제로 잰 값' : 'Measured'}</div>
        <div class="mt-obs-row">
          <b>${esc(p.high.name)}</b>
          <span>${p.high.alt.toFixed(0)}m</span>
          <strong>${p.high.temp.toFixed(1)}°</strong>
        </div>
        ${p.est != null ? `
        <div class="mt-obs-row sub">
          <span>${ko ? `정상(${p.alt.toFixed(0)}m)까지 ${p.high.upM}m 환산` : `extrapolated ${p.high.upM} m to summit`}</span>
          <strong>${p.est.toFixed(1)}°</strong>
        </div>
        <div class="mt-gap${g > 0 ? ' warm' : ' cool'}">
          ${ko ? `기상청 예보가 <b>${Math.abs(g).toFixed(1)}도 ${g > 0 ? '더 따뜻' : '더 차갑'}</b>${g > 0 ? '합니다' : '습니다'}`
               : `KMA forecast is <b>${Math.abs(g).toFixed(1)}°C ${g > 0 ? 'warmer' : 'colder'}</b>`}
        </div>` : `
        <div class="mt-obs-row sub">
          <span>${ko ? `정상까지 ${p.high.upM}m — 너무 멀어 환산하지 않습니다` : `${p.high.upM} m to summit — too far to extrapolate`}</span>
        </div>`}
      </div>`;
  } else {
    obs = `<p class="mt-note">${ko ? '같은 산에 고지대 관측소가 없어 실측 비교를 하지 않습니다' : 'No high-elevation station on this mountain — no measured comparison'}</p>`;
  }

  const baseLine = p.base ? `
    <div class="mt-base">
      ${ko ? '산 아래' : 'Valley'} <b>${esc(p.base.name)}</b>
      <span>${p.base.alt.toFixed(0)}m</span>
      <strong>${p.base.temp.toFixed(1)}°</strong>
      ${p.drop != null ? `<em class="${p.drop >= M.MARK.dropC ? 'hi' : ''}">${
        p.drop >= 0 ? (ko ? `정상이 ${p.drop.toFixed(1)}도 낮음` : `${p.drop.toFixed(1)}°C colder up top`)
                    : (ko ? `정상이 ${(-p.drop).toFixed(1)}도 높음` : `${(-p.drop).toFixed(1)}°C warmer up top`)
      }</em>` : ''}
    </div>` : '';

  /* 등산로 — ⚠️⚠️ "이 길로 가세요"가 아니다. OSM 의 길이고 폐쇄·낙석·출입통제·계절통제는 담겨 있지 않다. */
  const T = state.trail;
  const mine = T && T.name === p.name;
  const tr = mine && T.st ? T.st : null;
  let btn;
  if (mine && T.loading) btn = `<button class="mt-trailbtn" disabled>${ko ? '받는 중…' : 'Loading…'}</button>`;
  else if (mine && T.none) btn = `<button class="mt-trailbtn" disabled>${ko ? '등산로 자료 없음' : 'No trail data'}</button>`;
  else if (tr) btn = `<button class="mt-trailbtn" data-action="ext:trail-off">${ko ? '지도에 그렸습니다 · 지우기' : 'Drawn on globe · clear'}</button>`;
  else btn = `<button class="mt-trailbtn" data-action="ext:peak" data-name="${esc(p.name)}">${ko ? '등산로 지도에 보기' : 'Show trails on globe'}</button>`;
  const trailBox = `
    <div class="mt-trail">
      ${btn}
      ${tr ? `
        <p class="mt-trailsum">${ko
          ? `길 <b>${tr.ways}개</b> · 합쳐서 <b>${tr.km}km</b>`
          : `${tr.ways} paths · ${tr.km} km total`}${
          tr.namedN ? (ko ? ` · 이름 있는 길 ${tr.namedN}개` : ` · ${tr.namedN} named`) : ''}</p>
        ${tr.sac.length ? `<p class="mt-trailsac">${tr.sac.map(x =>
          `<span class="sac" data-k="${esc(x.key)}">${esc(x.ko)} ${x.km}km</span>`).join('')}</p>`
          : `<p class="mt-note">${ko ? '난이도 등급(sac_scale)이 적힌 길이 없습니다' : 'No sac_scale grade on these paths'}</p>`}
        ${tr.named.length ? `<p class="mt-trailnames">${tr.named.map(esc).join(' · ')}</p>` : ''}
      ` : ''}
      <p class="mt-trailwarn">${ko
        ? '등산로 · OpenStreetMap · 폐쇄·출입통제는 국립공원 현장 정보 확인'
        : 'Trails · OpenStreetMap · check park notices for closures and access'}</p>
    </div>`;

  return `
    <article class="mt-card${mine ? ' sf-hit' : ''}">
      <header>
        <h4>${esc(p.name)}</h4>
        <span class="mt-alt">${p.alt.toFixed(0)}m${p.km != null ? ` · ${p.km}km` : ''}</span>
      </header>
      <div class="mt-main">
        <div class="mt-temp">
          <span class="n">${big}</span><span class="u">°</span>
          <span class="lab">${ko ? '기상청 예보' : 'KMA forecast'}</span>
        </div>
        <ul class="mt-facts">
          <li><i>${ko ? '바람' : 'Wind'}</i>
              <b>${p.wind != null ? `${p.wind.toFixed(1)} m/s` : '—'}</b>
              <em>${dirText(p.windDir, ko)}</em></li>
          <li><i>${ko ? '하늘' : 'Sky'}</i><b>${esc(M.skyText(p.sky, ko))}</b></li>
          <li><i>${ko ? '강수확률' : 'Rain'}</i><b>${p.pop != null ? `${Math.round(p.pop)}%` : '—'}</b></li>
          <li><i>${ko ? '습도' : 'Humidity'}</i><b>${p.hum != null ? `${Math.round(p.hum)}%` : '—'}</b></li>
          ${p.feel != null ? `<li><i>${ko ? '체감' : 'Feels'}</i><b>${p.feel.toFixed(1)}°</b></li>` : ''}
        </ul>
      </div>
      ${obs}
      ${baseLine}
      ${marks.length ? `<ul class="mt-marks">${marks.map(t => `<li>${esc(t)}</li>`).join('')}</ul>` : ''}
      ${trailBox}
    </article>`;
}

function obsIntro(ctx, state) {
  const { ko } = ctx;
  const M = state.mod.mountain;
  const m = state.meta || {};
  return `<div class="mt-note">${ko
    ? `<b>같은 산에 관측소가 있는 봉우리</b>입니다. 기상청 <b>예보</b>와 실제로 <b>잰 값</b>을 나란히 놓았습니다 —
       둘이 다르면 그 차이를 적습니다.
       <br>환산 기준 · 고도 1km당 <b>${m.lapse}도</b>(ECMWF) · 최대 ${M.EXTRAPOLATE_MAX_M}m`
    : `<b>Peaks with a station on the same mountain.</b> The KMA <b>forecast</b> sits next to what was actually <b>measured</b>.
       <br>Extrapolation · <b>${m.lapse}°C/km</b> (ECMWF) · max ${M.EXTRAPOLATE_MAX_M} m`}</div>`;
}

function foot(ctx, state) {
  const { esc, ko } = ctx;
  const M = state.mod.mountain;
  const m = state.meta || {};
  return `<p class="mt-foot">
    ${ko
      ? `정상 예보 · 실측 비교 봉우리 <b>${m.withHigh ?? 0}/${m.count ?? 0}곳</b>
         <br>표시 기준 · 바람 ${M.MARK.windMs}m/s · 고도차 ${M.MARK.dropC}도 (우리가 정한 표시 기준)
         <br><b>등산 전 기상청 공식 발표를 확인하세요.</b>
         <br><small>${esc(m.source || '')} · ${esc(m.obsSource || '')}</small>`
      : `Summit forecast · measured comparison on <b>${m.withHigh ?? 0}/${m.count ?? 0} peaks</b>
         <br>Display thresholds · wind ${M.MARK.windMs}m/s · elevation delta ${M.MARK.dropC}°C (our display thresholds)
         <br><b>Check official KMA announcements before hiking.</b>
         <br><small>${esc(m.source || '')} · ${esc(m.obsSource || '')}</small>`}
  </p>`;
}

function listFor(ctx, state) {
  const M = state.mod.mountain;
  if (state.tab === 'obs') return M.withObs();
  if (state.tab === 'near') {
    let cam = null;
    try { cam = ctx.cam(); } catch (_) { cam = null; }
    return cam ? M.near(cam.lat, cam.lon, NEAR_N) : M.peaks.slice(0, NEAR_N);
  }
  return M.peaks;
}

export default {
  key: 'hobby/mountain',
  title: '산',
  badge: 'OFFICIAL_FORECAST',

  async load(ctx, state, signal) {
    state.tab = state.tab || 'near';
    state.mod = await ctx.v1('mountain.js');
    const peaks = await state.mod.mountain.build();       // korea.js get('mountain'|'aws') — 절대경로 S3
    if (signal?.aborted) throw new Error('aborted');
    if (!peaks.length) throw new Error(ctx.ko ? '산 정상 예보가 비었습니다' : 'Summit forecast is empty');
    state.peaks = peaks;
    state.meta = state.mod.mountain.meta;
    state.data = peaks;
    loadIndex(ctx, state, signal).catch(() => { });      // 색인은 미리 받아 둔다 (실패해도 카드는 뜬다)
    if (!state.point) state.point = { ...OVERVIEW };
  },

  build(ctx, state) {
    const peaks = state.peaks || [];
    if (!peaks.length) return;
    const T = state.trail;
    ctx.add(ctx.makePoints(peaks.map(p => ({
      lat: p.lat, lon: p.lon,
      c: T?.name === p.name ? PEAK_SEL_COLOR : (p.high ? PEAK_OBS_COLOR : PEAK_COLOR),
    })), { size: 7, opacity: 0.95 }));

    if (!T) return;
    const p = peaks.find(x => x.name === T.name);
    if (p) {
      try { ctx.add(ctx.placeLabel(ctx.makeLabel(`${p.name} ${p.alt.toFixed(0)}m`, PEAK_SEL_COLOR), p.lat, p.lon)); }
      catch (_) { /* DOM 없음 */ }
    }
    /* 등산로 — sac 등급별로 한 객체씩 (최대 7개). 원자료 점을 그대로 잇는다. 지면 위 40m. */
    const ways = T.doc?.ways || [];
    if (!ways.length) return;
    const byColor = new Map();
    ways.forEach(w => {
      const col = SAC_COLOR[w.s] || PLAIN;
      if (!byColor.has(col)) byColor.set(col, []);
      const segs = byColor.get(col);
      for (let i = 1; i < w.p.length; i++) {
        segs.push([{ lat: w.p[i - 1][1], lon: w.p[i - 1][0], h: LIFT_M },
                   { lat: w.p[i][1], lon: w.p[i][0], h: LIFT_M }]);
      }
    });
    byColor.forEach((segs, col) => { ctx.add(ctx.makeSegments(segs, { color: col, opacity: 0.82 })); });
  },

  card(ctx, state) {
    const { esc, ko } = ctx;
    const m = state.meta || {};
    const peaks = state.peaks || [];
    const list = listFor(ctx, state);
    const tabs = [
      ['near', ko ? '가까운 산' : 'Nearby'],
      ['obs', ko ? `실측 있는 산 ${m.withHigh ?? 0}` : `Measured ${m.withHigh ?? 0}`],
      ['all', ko ? `전체 ${m.count ?? 0}` : `All ${m.count ?? 0}`],
    ].map(([k, t]) => `<button class="mt-tab${state.tab === k ? ' on' : ''}" data-action="ext:tab" data-tab="${k}">${t}</button>`).join('');

    /* ⚠️ 예보 시각과 관측 시각을 **맨 위에** 적는다. 둘이 다른 시각의 값이라는 걸 모르고 비교하면 속이는 것이 된다. */
    const times = ko
      ? `기상청 예보 ${m.fcstBase || '—'} 기준 · 관측 ${hhmm(peaks[0]?.obsAt)} 실황`
      : `KMA forecast ${m.fcstBase || '—'} · observed ${hhmm(peaks[0]?.obsAt)}`;

    return `
      <div class="mt-tabs">${tabs}</div>
      <p class="mt-times">${esc(times)}</p>
      ${state.tab === 'obs' ? obsIntro(ctx, state) : ''}
      ${state.tab === 'near' ? `<p class="mt-note">${ko ? '지금 보는 자리에서 가까운 순입니다' : 'Nearest to the current view centre first'}</p>` : ''}
      <div class="mt-list">${list.map(p => peakCard(ctx, state, p)).join('')}</div>
      ${foot(ctx, state)}`;
  },

  pick(ctx, state, lat, lon) {
    const peaks = state.peaks || [];
    let best = null, bd = Infinity;
    peaks.forEach(p => { const d = ctx.distKm({ lat, lon }, p); if (d < bd) { bd = d; best = p; } });
    if (!best || bd > PICK_KM) return null;
    return { title: best.name, badge: 'OFFICIAL_FORECAST', body: peakCard(ctx, state, best, { detail: true }) };
  },

  action(ctx, state, name, ds) {
    if (name === 'tab') {
      state.tab = ['near', 'obs', 'all'].includes(ds.tab) ? ds.tab : 'near';
      return { html: this.card(ctx, state), inPlace: true };
    }
    if (name === 'trail-off') {
      state.trail = null;
      return { rebuild: true, html: this.card(ctx, state), inPlace: true };
    }
    if (name === 'peak') {
      const p = (state.peaks || []).find(x => x.name === ds.name);
      if (!p) return { handled: true };
      if (state.trail?.name === p.name && state.trail.doc) {
        return { point: { lat: p.lat, lon: p.lon, altKm: PEAK_ALT_KM }, rebuild: true };
      }
      /* ⚠️ 그 산의 길만 그때 받는다. 전국을 한 덩어리로 받지 않는다. */
      state.trail = { name: p.name, loading: true, doc: null, st: null, none: false };
      const pending = loadTrail(ctx, state, p).then(doc => {
        if (state.trail?.name !== p.name) return { html: this.card(ctx, state) };
        const ways = doc?.ways?.length ? doc : null;
        state.trail = { name: p.name, loading: false, doc: ways, st: ways ? trailStats(ways, ctx.ko) : null, none: !ways };
        try { ctx.rebuild(); } catch (_) { }
        return { html: this.card(ctx, state), inPlace: true };
      }).catch(() => {
        state.trail = { name: p.name, loading: false, doc: null, st: null, none: true };
        return { html: this.card(ctx, state), inPlace: true };
      });
      return {
        point: { lat: p.lat, lon: p.lon, altKm: PEAK_ALT_KM },
        rebuild: true,
        html: this.card(ctx, state), inPlace: true,
        pending,
      };
    }
    return null;
  },

  close(ctx, state) { state.trail = null; },
};
