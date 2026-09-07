/* 서핑·낚시 공용 — 1.0 ui-surf.js 에서 옮겨 온 것과 두 화면이 같이 쓰는 뼈대
 *
 * ⚠️ ui-surf.js 는 Cesium 을 import 해서 v2 에서 못 빌린다. 그래서 그 안의
 *    nearestBuoy · buoyLine · swimWarn 세 개를 **여기로 옮겨 적었다**(문장은 그대로).
 *    1.0 의 주석대로 "입수 통제 경고는 서핑과 낚시가 같은 문장을 쓴다 — 두 곳에
 *    따로 적으면 한쪽만 고치는 날이 온다". 그래서 한 파일이다.
 *
 * ⚠️ 자료·판정 모듈(beaches.js, fishing.js, surf.js, coast.js, korea.js, config.js)은
 *    Cesium 이 없으므로 ctx.v1() 으로 빌린다. 여기서는 다시 만들지 않는다.
 */

const esc = (s) => String(s ?? '').replace(/[&<>"]/g, (c) =>
  ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

/* 두 화면이 **같은 값**을 쓴다 (1.0 과 같다).
   ⚠️ 두 화면이 다른 높이에서 다르게 굴면 사용자는 규칙을 못 배운다. */
export const N_SHOW = 12;
export const ZOOM_KM = 120;        // 1.0 ZOOM_M = 120_000
export const REGION_KM = 300;      // 이 위에서는 권역 대표만 (1.0 REGION_M)
export const REGION_SAMPLES = 3;
export const MAP_ANCHOR_KM = 3000; // 이보다 낮게 보고 있으면 "그 지역을 보는 중"
export const LABEL_GAP_KM = 4;     // 이름표 실거리 간격 (1.0 LABEL_GAP_KM)
export const PICK_KM = 25;         // 지구를 눌렀을 때 이 안의 지점만 답한다

/* 1.0 공용 모듈을 한 번만 빌린다 */
let _v1 = null;
export async function v1Common(ctx) {
  if (_v1) return _v1;
  const [korea, coast, config] = await Promise.all([
    ctx.v1('korea.js'), ctx.v1('coast.js'), ctx.v1('config.js'),
  ]);
  _v1 = { korea, coast, API: config.API };
  return _v1;
}

/* ── 가장 가까운 부이가 **실제로 잰** 파고 (1.0 ui-surf.js 에서 옮김) ───────
   ⚠️ 모델을 지우고 부이로 바꾸지 않는다. 부이는 몇십 km 떨어진 한 점이고,
      해변마다 값이 다르다. **둘 다 보여주고 무엇이 다른지 적는다.**
   ⚠️ 부이가 멀면 아예 말하지 않는다 — 200km 밖 부이로 이 해변을 말할 수 없다. */
const BUOY_MAX_KM = 120;
let _buoyCache = null, _buoyAt = 0;

export async function nearestBuoy(ctx, lat, lon) {
  try {
    if (!_buoyCache || Date.now() - _buoyAt > 5 * 60_000) {
      const { API } = await v1Common(ctx);
      _buoyCache = await ctx.fetchJson(`${API.OCEAN}/kma-buoy.json`, { cache: 'no-cache' })
        .catch(() => null);
      _buoyAt = Date.now();
    }
    const st = _buoyCache?.stations || [];
    const R = 6371, rad = d => d * Math.PI / 180;
    let best = null;
    for (const b of st) {
      // ⚠️ 최대파고가 있는 부이만 본다. 연안방재 지점은 바람만 재고 파고가 없다.
      if (b.whMax == null || b.lat == null) continue;
      const dp = rad(b.lat - lat), dl = rad(b.lon - lon);
      const h = Math.sin(dp / 2) ** 2
              + Math.cos(rad(lat)) * Math.cos(rad(b.lat)) * Math.sin(dl / 2) ** 2;
      const km = 2 * R * Math.asin(Math.min(1, Math.sqrt(h)));
      if (!best || km < best.km) best = { ...b, km };
    }
    return best && best.km <= BUOY_MAX_KM ? best : null;
  } catch (_) { return null; }
}

export function buoyLine(b, ko) {
  if (!b) return '';
  const hh = b.tm ? `${b.tm.slice(8, 10)}:${b.tm.slice(10, 12)}` : '';
  const bits = [];
  if (b.whMax != null) bits.push(ko ? `<b>가장 큰 파도 ${b.whMax.toFixed(1)}m</b>`
                                    : `<b>max ${b.whMax.toFixed(1)} m</b>`);
  if (b.whSig != null) bits.push(ko ? `큰 쪽 평균 ${b.whSig.toFixed(1)}m`
                                    : `sig ${b.whSig.toFixed(1)} m`);
  if (b.wp != null) bits.push(ko ? `주기 ${b.wp.toFixed(0)}초` : `${b.wp.toFixed(0)} s`);
  return `<p class="mt-buoy">${ko
    ? `🌊 <b>${esc(b.name)} 부이</b>가 ${hh} 에 실제로 잰 값 — ${bits.join(' · ')}`
      + `<br><small>${Math.round(b.km)}km 떨어진 <b>먼바다</b> 값입니다. `
      + `아래 목록은 해변별 <b>모델 예측</b>이라 숫자가 다릅니다 — `
      + `모델은 큰 쪽 평균을, 부이는 가장 큰 파도까지 함께 알려줍니다.</small>`
    : `🌊 <b>${esc(b.name)} buoy</b>, measured ${hh} — ${bits.join(' · ')}`
      + `<br><small>${Math.round(b.km)} km offshore. The list below is model forecast.</small>`}</p>`;
}

/* ⚠️⚠️ **입수 통제 경고 — 맨 위에 둔다.** (1.0 ui-surf.js 의 swimWarn 그대로)
   해수욕장 입수 통제는 파고로 정하지 않는다. 대개 이안류로 막는데, 이안류는
   해변 코앞 수십 미터의 흐름이라 격자 모델에는 원리상 안 잡힌다.
   국립해양조사원 이안류 지수가 있는 곳은 등급을 보여주고, 나머지는 **모른다고 크게** 적는다.
   ⚠️ 등급이 '관심'이어도 "들어가도 된다"로 바뀌지 않는다. */
export function swimWarn(ko, rip, coast) {
  if (!rip || rip.stale || !rip.grade) {
    return `<p class="mt-danger">${ko
      ? '<b>입수 상태 미연결</b> · 현장 안내와 안전요원 지시를 따르세요.'
      : '<b>Water-entry status unavailable</b> · follow on-site signs and lifeguards.'}</p>`;
  }
  const RIP_COLOR = coast?.RIP_COLOR || {};
  const RIP_EN = coast?.RIP_EN || {};
  const col = RIP_COLOR[rip.grade] || '#f87171';
  const gEn = RIP_EN[rip.grade] || rip.grade;
  const mins = rip.ageMin == null ? null : Math.max(0, Math.round(rip.ageMin));
  const when = mins == null ? '' : (ko
    ? (mins < 1 ? '방금' : `${mins}분 전`)
    : (mins < 1 ? 'just now' : `${mins} min ago`));
  /* ⚠️ 같은 해변이 아니면 **어디 값인지·얼마나 먼지 반드시 밝힌다.** */
  const whose = rip.same
    ? (ko ? '이 해변' : 'this beach')
    : (ko ? `${esc(rip.ko)} 해수욕장 (${rip.distKm.toFixed(0)}km 떨어짐)`
          : `${esc(rip.name || rip.ko)} beach, ${rip.distKm.toFixed(0)} km away`);
  const worse = rip.todayWorst && rip.todayWorst !== rip.grade
    && (rip.gradeRank || 0) < 4
    ? (ko ? ` · 오늘 최고 <b>${esc(rip.todayWorst)}</b>` : ` · today's peak <b>${esc(rip.todayWorst)}</b>`)
    : '';
  return `<p class="mt-danger rip-live" style="--rip:${col}">
    <b class="rip-grade">${ko ? esc(rip.grade) : esc(gEn)}</b>
    ${ko
      ? `<b>이안류 ${esc(rip.grade)}</b> — ${whose}, ${when} 관측${worse}<br>`
        + `<small>등급 출처 · 국립해양조사원</small><br>`
        + `<b>입수 통제</b> · 현장 안내와 안전요원 지시를 따르세요.`
      : `<b>Rip current: ${esc(gEn)}</b> — ${whose}, observed ${when}${worse}<br>`
        + `<small>Graded by KHOA, not computed by us.</small><br>`
        + `<b>Water-entry status</b> · follow signage and lifeguards.`}
  </p>`;
}

/* ── 두 화면이 같이 쓰는 뼈대 ───────────────────────────────────────── */

/** 기준점. 1.0 순서에서 "내 위치"만 뺐다(v2 에 mylocation 이 없다):
 *  ① 사용자가 고른 지역 ② 지금 보고 있는 지구 중심 ③ 기본값(home) */
export function anchor(ctx, st, regionList, home) {
  if (st.region) {
    const list = regionList(st.region);
    if (list.length) return { ...center(list), from: 'region' };
  }
  try {
    const c = ctx.cam();
    if (c && Number.isFinite(c.lat) && c.altKm < MAP_ANCHOR_KM) return { lat: c.lat, lon: c.lon, from: 'map' };
  } catch (_) { }
  return { ...home, from: 'home' };
}

export function center(list) {
  if (!list?.length) return null;
  return { lat: list.reduce((s, b) => s + b.lat, 0) / list.length,
           lon: list.reduce((s, b) => s + b.lon, 0) / list.length };
}

/** 부이·이안류를 **동시에** 받는다 — 순서대로 기다리면 화면이 그만큼 늦게 뜬다.
 *  ⚠️ 실패해도 화면은 뜬다. */
export async function seaContext(ctx, at) {
  const { coast } = await v1Common(ctx);
  const [buoy, rip] = await Promise.all([
    nearestBuoy(ctx, at.lat, at.lon).catch(() => null),
    coast.nearestRip(at.lat, at.lon).catch(() => null),
  ]);
  return { buoy, rip };
}

/** 기상청 AWS 바람. ⚠️ 없어도 화면은 뜬다 — 바람 없이도 스웰·주기는 말할 수 있다. */
export async function loadWind(ctx) {
  try { const { korea } = await v1Common(ctx); return await korea.get('aws'); }
  catch (_) { return null; }
}

/** 지점에서 maxKm 안의 가장 가까운 관측소 바람.
 *  ⚠️ 너무 멀면 산 너머 바람을 해변 바람이라고 말하게 된다. */
export function windAt(korea, wind, lat, lon, maxKm, needDir) {
  if (!wind?.stations || !korea) return null;
  const st = korea.nearest(wind.stations, lat, lon, maxKm);
  if (!st) return null;
  const dir = st.wd10 ?? st.wd1;
  const spd = st.ws10 ?? st.ws1;
  if (needDir ? dir == null : spd == null) return null;
  return { dir: dir ?? null, speed: spd ?? null, name: st.name, km: Math.round(st.km) };
}

/** 이름표를 달 지점만 고른다 — 위에서부터, 앞서 단 곳과 실거리로 먼 것만 (1.0 규칙).
 *  ⚠️ 화면 좌표가 아니라 실거리다. 카메라가 움직일 때마다 다시 재지 않기 위해서다. */
export function labelPlan(ctx, list, max = 6) {
  const ordered = [...list].sort((a, b) => b.lat - a.lat);
  const labeled = [];
  for (const b of ordered) {
    if (labeled.length >= max) break;
    if (labeled.every(p => ctx.distKm(p, b) >= LABEL_GAP_KM)) labeled.push(b);
  }
  return labeled;
}

/** 지구를 눌렀을 때 — 보이는 지점 중 PICK_KM 안의 가장 가까운 것 */
export function nearestShown(ctx, list, lat, lon) {
  let best = null, bestKm = Infinity;
  for (const b of list || []) {
    const km = ctx.distKm({ lat, lon }, b);
    if (km < bestKm) { best = b; bestKm = km; }
  }
  return best && bestKm <= PICK_KM ? best : null;
}

/* 권역 대표 — 멀리서는 권역마다 REGION_SAMPLES 곳만 재서 한 값을 낸다 (1.0 _fillRegions).
   ⚠️ 몇 곳을 재서 낸 값인지 카드에 적는다. 권역 전체를 잰 것처럼 말하지 않는다.
   @param src   beaches | fishing (regions/byRegion/sea/_sea 를 가진 1.0 객체)
   @param filt  권역 목록에서 쓸 지점 거르기
   @param agg   (seas, all) → 권역 행에 얹을 값 */
export async function fillRegions(st, src, filt, agg) {
  if (st.regions && Date.now() - st.regionsAt < 10 * 60_000) return st.regions;
  const picks = [], byRegion = new Map();
  src.regions().forEach(r => {
    const l = src.byRegion(r).filter(filt).sort((a, b) => b.lat - a.lat);
    if (!l.length) return;
    const take = [];
    for (let i = 0; i < REGION_SAMPLES; i++) {
      const idx = Math.round((i / Math.max(1, REGION_SAMPLES - 1)) * (l.length - 1));
      if (!take.includes(l[idx])) take.push(l[idx]);
    }
    byRegion.set(r, take); picks.push(...take);
  });
  await src.sea(picks);
  const out = [];
  byRegion.forEach((take, r) => {
    const seas = take.map(b => src._sea.get(b.name)).filter(Boolean);
    const all = src.byRegion(r).filter(filt);
    out.push({ region: r, ...center(all), sampled: seas.length, of: take.length,
               spots: all.length, ...agg(seas, all) });
  });
  st.regions = out; st.regionsAt = Date.now();
  return out;
}

/* 시각을 사람 말로 — "오후 3시 20분" (1.0 ui-fishing.js clock) */
export function clock(ms, ko) {
  const d = new Date(ms);
  if (isNaN(d.getTime())) return '—';
  const h = d.getHours(), m = d.getMinutes();
  const sameDay = d.toDateString() === new Date().toDateString();
  const day = sameDay ? '' : `${d.getMonth() + 1}/${d.getDate()} `;
  if (ko) {
    const h12 = h % 12 === 0 ? 12 : h % 12;
    return `${day}${h < 12 ? '오전' : '오후'} ${h12}시${m ? ` ${m}분` : ''}`;
  }
  return `${day}${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
}

/* ── 카드 조각 ───────────────────────────────────────────────────── */
export const loadingHtml = (ko) =>
  `<p class="mt-load sf-loading">${ko ? '받는 중…' : 'Loading…'}</p>`;

export function tabsHtml(ko, cur) {
  return `<div class="mt-tabs">${[
    ['near', ko ? '이 주변' : 'Here'],
    ['how', ko ? '읽는 법' : 'How to read'],
  ].map(([k, t]) =>
    `<button class="mt-tab${cur === k ? ' on' : ''}" data-action="ext:tab" data-tab="${k}">${t}</button>`
  ).join('')}</div>`;
}

/** 지역 고르기 — 지구를 옮기지 않고도 다른 바다를 볼 수 있어야 한다.
 *  빈 값이면 "이 주변"으로 돌아간다. "여기서 찾기"는 1.0 의 #sfHere/#fsHere 다. */
export function regionTabsHtml(ko, st, rows) {
  const btn = (r, label) =>
    `<button class="mt-tab sm${(st.region || '') === r ? ' on' : ''}" data-action="ext:region" data-region="${esc(r)}">${label}</button>`;
  return `<div class="mt-tabs regions">${btn('', ko ? '이 주변' : 'Here')}${
    rows.map(r => btn(r.key, `${esc(r.label)} ${r.n}`)).join('')}
    <button class="mt-tab sm" data-action="ext:here">${ko ? '여기서 찾기' : 'Search this area'}</button>
  </div>`;
}

/** 목록 위 한 줄 — 무엇을 기준으로 골랐는가 */
export function anchorNote(ko, from, homeKo) {
  if (!ko) return '';
  return { region: '', map: '<b>지금 보고 있는 지구</b> 주변입니다 · ',
           home: `<b>${homeKo} 기준</b>입니다 (위치를 모릅니다) · ` }[from] || '';
}

/** 카드 머리의 "지도 ▸" — 누르면 그 지점으로 내려가고 상세 카드가 된다 */
export function focusBtn(ko, id) {
  return `<button class="mt-tab sm" data-action="ext:focus" data-id="${esc(id)}">${ko ? '지도 ▸' : 'Map ▸'}</button>`;
}
export function backBtn(ko) {
  return `<div class="mt-tabs"><button class="mt-tab sm" data-action="ext:list">${ko ? '◂ 목록' : '◂ List'}</button></div>`;
}

/** 지역 바꾸기·여기서 찾기 — 늦게 오는 갱신을 규약대로 돌려준다.
 *  fill 이 끝나면 지구를 다시 그리고 카드를 돌려준다. */
export function deferred(ctx, st, fill, card, point) {
  const pending = (async () => {
    try { await fill(); } catch (e) { console.warn('[hobby-sea] fill', e); }
    try { ctx.rebuild(); } catch (_) { }
    return { html: card() };
  })();
  const r = { html: loadingHtml(ctx.ko) + card(), inPlace: true, pending };
  if (point) r.point = point;
  return r;
}

export const cssInt = (hex) => parseInt(String(hex).replace('#', ''), 16);
export const shortR = (r) => String(r || '').replace(/\s*\(.*$/, '').trim();
export { esc };
