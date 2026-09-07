// FOR ME 판정 엔진 — 내 동네 한 점에 대해 "영향 여부 / 언제 / 왜 / 얼마나 확실 / 무엇이 달라졌나"를 계산한다.
// 정본: docs/FOR-ME-DEV-DIRECTIVE-v2.0-2026-09-07.md §3·§5·§6 (2026-09-07 지시서)
//
// 이 파일은 **순수 계산**이다. DOM·fetch 를 모른다. 입력은 S3 JSON 그대로, 출력은 카드 객체다.
// 같은 함수에 직전 발표 파일을 넣으면 "무엇이 달라졌나"가 나온다 — 사용자별 서버 저장 없이 이력을 만드는 방식.
//
// 규율 (지시서 §6)
//   · 예보를 만들지 않는다. 기관 발표의 반경·진로 안에 내 동네가 드는지만 잰다.
//   · 신뢰는 등급 + 이유. 보정 확률(%)을 만들지 않는다. 일치 개수는 원시 개수("3/3", "51/51")로 쓴다.
//   · 자료가 없으면 null 을 돌려주고, 화면은 그 항목을 **뺀다**. "준비 중"·"—" 로 채우지 않는다.
//   · 자료 없음 = 안전이 아니다. state 'unknown' 을 'quiet' 로 바꾸지 않는다.
//   · 쓰나미: 기관 발표 구역 포함 여부만. 게시문에 구역 목록이 없으면 '판단 불가'다. ETA 는 SIMULATION_ONLY 로만.
//
// 자료 사실 (2026-09-07 실측)
//   · events/typhoon-official.json — KMA 발표엔 반경이 없다. JMA 발표에 galeArea(방위별 강풍역 km)·circleKm(예보원)이 있다.
//   · events/typhoon-ecmwf.json — IFS ENS 51 멤버, 각 멤버 steps[{h,lat,lon}] (0~120h). 이름으로 공식 태풍과 맞춘다.
//   · ocean/marine-ea.json — 0.5° 동아시아 격자(lat0 23, lon0 114, nx 73, ny 49). 밖이면 ocean/marine.json 5° 전지구.
//   · ocean/kma-buoy.json — stations[{lat,lon,wh,ws,tm(KST)}], wh 는 부이만.
//   · wind/kma-fcst.json — 97지점 hourly[{tm(KST),ws,...}] 81시간. 한국 밖엔 지점이 없다.
//   · events/quake-asia.json — quakes[{lat,lon,mag,at,src,depthKm,place}].
//   · events/tsunami-intl.json — alerts[{center,category,region,lat,lon,magnitude,issued,bulletin}]. 대상 구역 목록은 없다.

/* ── 기하 ─────────────────────────────────────────────────── */
const R = Math.PI / 180;
export function kmBetween(a, b) {
  const dLat = (b.lat - a.lat) * R, dLon = (b.lon - a.lon) * R;
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(a.lat * R) * Math.cos(b.lat * R) * Math.sin(dLon / 2) ** 2;
  return 2 * 6371 * Math.asin(Math.min(1, Math.sqrt(h)));
}
/** a 에서 b 를 보는 방위(0=북, 90=동). 강풍역이 방위별이라 필요하다. */
export function bearingDeg(a, b) {
  const y = Math.sin((b.lon - a.lon) * R) * Math.cos(b.lat * R);
  const x = Math.cos(a.lat * R) * Math.sin(b.lat * R) - Math.sin(a.lat * R) * Math.cos(b.lat * R) * Math.cos((b.lon - a.lon) * R);
  return ((Math.atan2(y, x) / R) + 360) % 360;
}
const angDiff = (a, b) => { const d = Math.abs(((a - b) % 360 + 540) % 360 - 180); return d; };

/* ── 시각 ─────────────────────────────────────────────────── */
/** '202609070000'(UTC 12자리) · '2026-09-07T09:00:00+09:00' · ISO → epoch ms. 못 읽으면 null. */
export function parseWhen(v, { kst = false } = {}) {
  if (v == null) return null;
  const s = String(v).trim();
  if (/^\d{12}$/.test(s)) {
    const iso = `${s.slice(0, 4)}-${s.slice(4, 6)}-${s.slice(6, 8)}T${s.slice(8, 10)}:${s.slice(10, 12)}:00${kst ? '+09:00' : 'Z'}`;
    const t = Date.parse(iso); return Number.isFinite(t) ? t : null;
  }
  // 'YYYY-MM-DDTHH:MM' 처럼 오프셋이 없는 ISO 는 **UTC 로** 읽는다 (Open-Meteo timezone=UTC 응답).
  // Date.parse 는 오프셋 없는 날짜-시각을 브라우저 지역시로 읽어서, 한국에서 9시간이 밀렸다 (STEP 3 테스트에서 잡음).
  if (/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(:\d{2}(\.\d+)?)?$/.test(s)) { const t = Date.parse(s + 'Z'); return Number.isFinite(t) ? t : null; }
  if (/^\d{4}\.\d{2}\.\d{2} \d{2}:\d{2}:\d{2} UTC$/.test(s)) {
    const t = Date.parse(s.replace(/^(\d{4})\.(\d{2})\.(\d{2}) (\d{2}:\d{2}:\d{2}) UTC$/, '$1-$2-$3T$4Z'));
    return Number.isFinite(t) ? t : null;
  }
  const t = Date.parse(s); return Number.isFinite(t) ? t : null;
}
const H = 3600_000;
export const fmtKst = (ms) => {
  if (!Number.isFinite(ms)) return null;
  const d = new Date(ms + 9 * H);
  const p = (n) => String(n).padStart(2, '0');
  return `${p(d.getUTCMonth() + 1)}/${p(d.getUTCDate())} ${p(d.getUTCHours())}:${p(d.getUTCMinutes())}`;
};

/* ── 태풍 ─────────────────────────────────────────────────── */
/** 한 예보 시각(step)에서 내 동네 방향의 반경. galeArea 가 있으면 강풍역, 없고 circleKm 이면 예보원, 둘 다 없으면 null.
    JMA galeArea 는 반원 둘(예: 남서 440·북동 330)이다 — 내 동네가 어느 반원에 드는지 방위로 고른다. */
export function stepRadius(step, bearing) {
  const g = Array.isArray(step.galeArea) ? step.galeArea.filter(x => Number.isFinite(+x.km)) : [];
  if (g.length === 1) return { km: +g[0].km, kind: 'gale' };
  if (g.length > 1) {
    let best = null, bd = Infinity;
    for (const x of g) { const dd = Number.isFinite(+x.deg) ? angDiff(+x.deg, bearing) : 0; if (dd < bd) { bd = dd; best = x; } }
    return { km: +best.km, kind: 'gale' };
  }
  if (Number.isFinite(+step.circleKm) && +step.circleKm > 0) return { km: +step.circleKm, kind: 'circle' };
  return null;
}

function stepTime(step, issueMs) {
  return parseWhen(step.validUtc) ?? parseWhen(step.validKst) ?? (Number.isFinite(+step.h) && issueMs != null ? issueMs + (+step.h) * H : null);
}

/** 한 기관 발표를 내 동네 기준으로 판정. */
export function judgeAgency(place, rec, now = Date.now()) {
  const issueMs = parseWhen(rec.issue);
  const steps = (rec.steps || []).map(s => ({ ...s, t: stepTime(s, issueMs) }))
    .filter(s => Number.isFinite(+s.lat) && Number.isFinite(+s.lon) && s.t != null)
    .sort((a, b) => a.t - b.t);
  if (!steps.length) return { agency: rec.agency, agencyKo: rec.agencyKo, issueMs, status: 'unknown', reason: '예보 좌표 없음' };
  const pts = steps.map(s => {
    const c = { lat: +s.lat, lon: +s.lon };
    const d = kmBetween(place, c), b = bearingDeg(c, place);
    const r = stepRadius(s, b);
    return { h: +s.h, t: s.t, d, r, inside: r ? d <= r.km : null, windMs: s.windMs, category: s.categoryKo || s.category || null };
  });
  const withR = pts.filter(p => p.r);
  const nearest = pts.reduce((m, p) => (p.d < m.d ? p : m), pts[0]);
  let status;
  if (!withR.length) status = 'noradius';
  else if (withR.some(p => p.inside)) status = 'yes';
  else status = withR.length === pts.length ? 'no' : 'no-partial';

  /* 언제 — 예보 시각 사이를 1시간 간격으로 선형 보간(중심·반경). 그 폭이 ±6h 다(공식 예보 간격 12h). */
  let when = null;
  if (status === 'yes') {
    const samples = [];
    for (let i = 0; i < pts.length; i++) {
      const a = pts[i], b = pts[i + 1];
      if (!b) { samples.push({ t: a.t, inside: !!a.inside, d: a.d }); break; }
      const n = Math.max(1, Math.round((b.t - a.t) / H));
      for (let k = 0; k < n; k++) {
        const f = k / n, t = a.t + f * (b.t - a.t);
        // 반경이 한쪽에만 있으면 있는 쪽 값을 쓴다(없는 쪽은 판단하지 않는다)
        const ra = a.r?.km, rb = b.r?.km;
        const r = (ra != null && rb != null) ? ra + f * (rb - ra) : (ra ?? rb ?? null);
        // 중심 좌표 보간
        const lat = +steps[i].lat + f * (+steps[i + 1].lat - +steps[i].lat);
        const lon = +steps[i].lon + f * (+steps[i + 1].lon - +steps[i].lon);
        const d = kmBetween(place, { lat, lon });
        samples.push({ t, inside: r != null ? d <= r : false, d });
      }
    }
    const first = samples.findIndex(s => s.inside);
    if (first >= 0) {
      let last = first; while (last + 1 < samples.length && samples[last + 1].inside) last++;
      const seg = samples.slice(first, last + 1);
      const peak = seg.reduce((m, s) => (s.d < m.d ? s : m), seg[0]);
      const openEnd = last === samples.length - 1;
      when = { startMs: samples[first].t, endMs: samples[last].t, peakMs: peak.t, peakKm: Math.round(peak.d), widthH: 6, openEnd,
               startNow: first === 0,
               // 창이 통째로 과거면 '지남' — 발표 h=0 에 안이었어도 지금은 밖일 수 있다 (발표 뒤 시간이 흐른다)
               past: !openEnd && samples[last].t < now - H };
    }
  }
  return { agency: rec.agency, agencyKo: rec.agencyKo, issueMs, horizonH: rec.horizonH ?? null, status,
           nearestKm: Math.round(nearest.d), nearestMs: nearest.t, nearestH: nearest.h, radiusKind: withR[0]?.r?.kind || null, when, pts };
}

/** ECMWF 앙상블 — 내 동네 반경 km 안을 지나는 멤버 수(원시 개수). 확률로 바꾸지 않는다. */
export function ensembleNear(place, ecmwfStorm, km = 100) {
  const members = ecmwfStorm?.ensemble?.members || [];
  if (!members.length) return null;
  let n = 0, firstH = null;
  for (const m of members) {
    const hit = (m.steps || []).find(s => Number.isFinite(+s.lat) && kmBetween(place, { lat: +s.lat, lon: +s.lon }) <= km);
    if (hit) { n++; if (firstH == null || +hit.h < firstH) firstH = +hit.h; }
  }
  return { n, total: members.length, km, firstH, run: ecmwfStorm.run || null };
}

/* ── 격자 파고 ────────────────────────────────────────────── */
function gridAt(grid, lat, lon) {
  const { res, lat0, lon0, nx, ny } = grid;
  const i = Math.round((lon - lon0) / res), j = Math.round((lat - lat0) / res);
  if (i < 0 || j < 0 || i >= nx || j >= ny) return null;
  return j * nx + i;
}
const inGrid = (g, p) => g && p.lat >= g.lat0 && p.lat <= g.lat0 + g.res * (g.ny - 1) && p.lon >= g.lon0 && p.lon <= g.lon0 + g.res * (g.nx - 1);

/** 내 동네 반경 안(최소 한 칸) 격자의 최대 파고와 그 칸의 너울·풍파. 격자가 없으면 null. */
export function waveNear(place, grids, radiusKm = 60) {
  const g = (grids || []).find(x => x && Array.isArray(x.wave) && inGrid(x, place));
  if (!g) return null;
  const cells = Math.max(1, Math.ceil(radiusKm / (g.res * 111)));
  const ci = Math.round((place.lon - g.lon0) / g.res), cj = Math.round((place.lat - g.lat0) / g.res);
  let best = null;
  for (let j = cj - cells; j <= cj + cells; j++) for (let i = ci - cells; i <= ci + cells; i++) {
    if (i < 0 || j < 0 || i >= g.nx || j >= g.ny) continue;
    const k = j * g.nx + i, w = g.wave[k];
    if (w == null || !Number.isFinite(+w)) continue;
    if (!best || +w > best.wave) best = { wave: +w, swell: g.swell?.[k] ?? null, wper: g.wper?.[k] ?? null, lat: g.lat0 + j * g.res, lon: g.lon0 + i * g.res };
  }
  return best ? { ...best, res: g.res, time: g.time || null, source: g.source || 'Open-Meteo Marine' } : { none: true, res: g.res, time: g.time || null };
}

/* ── 부이·동네예보 ────────────────────────────────────────── */
export function buoysNear(place, buoyJson, km = 150, freshH = 3, now = Date.now()) {
  const st = buoyJson?.stations || [];
  const out = [];
  for (const s of st) {
    if (!Number.isFinite(+s.lat) || !Number.isFinite(+s.lon) || s.wh == null) continue;
    const d = kmBetween(place, { lat: +s.lat, lon: +s.lon });
    if (d > km) continue;
    const t = parseWhen(s.tm, { kst: true });
    const ageH = t != null ? (now - t) / H : null;
    out.push({ id: s.id, name: s.name, km: Math.round(d), wh: +s.wh, ws: s.ws != null ? +s.ws : null, ageH, fresh: ageH != null && ageH <= freshH });
  }
  return out.sort((a, b) => a.km - b.km);
}

/** 가장 가까운 동네예보 지점(≤ maxKm)에서 풍속이 임계 이상인 첫 시각. 한국 밖이면 null. */
export function windFromFcst(place, fcstJson, { thresholdMs = 14, maxKm = 60, now = Date.now() } = {}) {
  const pts = fcstJson?.points || [];
  let best = null;
  for (const p of pts) {
    if (!Number.isFinite(+p.lat)) continue;
    const d = kmBetween(place, { lat: +p.lat, lon: +p.lon });
    if (d <= maxKm && (!best || d < best.d)) best = { p, d };
  }
  if (!best) return null;
  const hours = (best.p.hourly || []).map(h => ({ t: parseWhen(h.tm, { kst: true }), ws: h.ws != null ? +h.ws : null })).filter(h => h.t != null && h.t >= now - H);
  const hit = hours.find(h => h.ws != null && h.ws >= thresholdMs);
  const maxWs = hours.reduce((m, h) => (h.ws != null && h.ws > m ? h.ws : m), 0);
  return { point: best.p.name, km: Math.round(best.d), baseKst: best.p.baseKst || null, thresholdMs, firstMs: hit?.t ?? null, maxWs };
}

/* ── 태풍 카드 ────────────────────────────────────────────── */
const GRADE = { high: '높음', mid: '보통', low: '낮음' };

export function typhoonCard(place, storm, ctx = {}) {
  const { ecmwf, grids, buoys, fcst, now = Date.now(), waveThreshold = 2.0 } = ctx;
  const recs = storm.agencies || [];
  const judged = recs.map(r => judgeAgency(place, r, now));
  const withR = judged.filter(j => j.status !== 'noradius' && j.status !== 'unknown');
  const yesAll = withR.filter(j => j.status === 'yes');
  const yes = yesAll.filter(j => !(j.when && j.when.past));          // 지금도 영향권(또는 앞으로)
  const passed = yesAll.filter(j => j.when && j.when.past);           // 안이었으나 이미 지남
  const nearestAll = judged.filter(j => Number.isFinite(j.nearestKm)).sort((a, b) => a.nearestKm - b.nearestKm)[0] || null;

  // 판단 기준 = 반경이 있는 발표 중 가장 최근 것(보통 JMA). 없으면 판단 불가.
  const basisRec = [...withR].sort((a, b) => (b.issueMs || 0) - (a.issueMs || 0))[0] || null;
  let state, basis;
  if (!recs.length) { state = 'unknown'; basis = { text: '판단 불가 — 공식 발표 없음' }; }
  else if (!basisRec) {
    /* 반경이 한 기관에도 없을 때(NHC 등). 강풍역은 실측 최대치가 1,000 km 를 넘지 않으므로
       최근접 거리가 FAR_KM 을 넘으면 '밖'으로 판정한다 — 동태평양 허리케인이 한국에서 '판단 불가'로 뜨는 것은 정직이 아니라 소음이다.
       그 안쪽은 정말로 판단 불가다(반경 없이 안/밖을 말할 수 없다). */
    const FAR_KM = 1500;
    if (nearestAll && nearestAll.nearestKm > FAR_KM) {
      state = 'quiet';
      basis = { text: `발표에 반경 자료 없음 (${judged.map(j => j.agency).join('·')}) · 최근접 ${nearestAll.nearestKm} km 는 강풍역 최대치(1,000 km)보다 멀어 밖으로 판정`, noRadius: true, far: true };
    } else {
      state = 'unknown';
      basis = { text: `판단 불가 — 발표에 강풍역·예보원 반경이 없음 (${judged.map(j => j.agency).join('·')})${nearestAll ? ` · 최근접 ${nearestAll.nearestKm} km` : ''}`, noRadius: true };
    }
  }
  else {
    state = yes.length ? 'signal' : 'quiet';
    const kindKo = basisRec.radiusKind === 'gale' ? '강풍역' : '예보원';
    const pastRec = !yes.length && passed.length ? [...passed].sort((a, b) => (b.issueMs || 0) - (a.issueMs || 0))[0] : null;
    const ins = yes.length ? '안' : pastRec ? `안이었으나 ${fmtKst(pastRec.when.endMs)} KST 에 지남` : '밖';
    basis = { text: `${basisRec.agencyKo || basisRec.agency} 공식 예보의 ${kindKo} ${ins} (${fmtKst(basisRec.issueMs)} KST 발표)`,
              agency: basisRec.agency, issueMs: basisRec.issueMs, kind: basisRec.radiusKind, inside: !!yes.length, passed: !!pastRec };
  }

  // 언제 — 신호가 있는 발표 중 가장 최근 것의 창
  const whenRec = [...yes].sort((a, b) => (b.issueMs || 0) - (a.issueMs || 0))[0] || null;
  const when = whenRec?.when ? { ...whenRec.when, agency: whenRec.agency, agencyKo: whenRec.agencyKo, issueMs: whenRec.issueMs, horizonH: whenRec.horizonH } : null;

  // 왜 — 자료명 + 실제 값
  const why = [];
  if (nearestAll) why.push({ key: 'approach', label: '태풍 접근', value: `최근접 약 ${nearestAll.nearestKm} km (${fmtKst(nearestAll.nearestMs)} KST, +${nearestAll.nearestH}h)`, source: `${nearestAll.agencyKo || nearestAll.agency} 공식 예보` });
  const wind = fcst ? windFromFcst(place, fcst, { now }) : null;
  if (wind) why.push({ key: 'wind', label: '강풍', value: wind.firstMs ? `풍속 ${wind.thresholdMs} m/s 이상 ${fmtKst(wind.firstMs)} KST 부터 (최대 ${wind.maxWs} m/s)` : `5일 내 ${wind.thresholdMs} m/s 미만 (최대 ${wind.maxWs} m/s)`, source: `KMA 동네예보 · ${wind.point} 지점(${wind.km} km)`, hit: !!wind.firstMs });
  const wave = grids ? waveNear(place, grids) : null;
  if (wave && !wave.none) why.push({ key: 'wave', label: '파고', value: `유의파고 ${wave.wave.toFixed(1)} m (임계 ${waveThreshold.toFixed(1)} m)${wave.swell != null ? ` · 너울 ${(+wave.swell).toFixed(1)} m` : ''}`, source: `${wave.source} ${wave.res}° 격자 · ${wave.time ? fmtKst(parseWhen(wave.time)) + ' KST' : ''}`, hit: wave.wave >= waveThreshold });

  // 예상 변화 — 지금/12/24/36h: 판단 기준 발표의 보간 거리 vs 반경
  const timeline = [];
  if (basisRec && basisRec.pts?.length) {
    for (const off of [0, 12, 24, 36]) {
      const t = now + off * H;
      const a = basisRec.pts.filter(p => p.t <= t).pop(), b = basisRec.pts.find(p => p.t > t);
      if (!a && !b) continue;
      let d, r;
      if (a && b) { const f = (t - a.t) / (b.t - a.t); d = a.d + f * (b.d - a.d); r = (a.r && b.r) ? a.r.km + f * (b.r.km - a.r.km) : (a.r?.km ?? b.r?.km ?? null); }
      else { const p = a || b; d = p.d; r = p.r?.km ?? null; }
      let level = 'out', text = '영향 밖';
      if (r != null) {
        if (d <= r && when && Math.abs(t - when.peakMs) <= 3 * H) { level = 'peak'; text = '최대 영향 구간'; }
        else if (d <= r) { level = 'in'; text = '영향 가능성'; }
        else if (d <= r * 1.5) { level = 'watch'; text = '관심'; }
      } else { level = 'na'; text = '반경 자료 없음'; }
      timeline.push({ label: off === 0 ? '지금' : `${off}시간 후`, level, text, km: Math.round(d) });
    }
  }

  // 얼마나 확실한가 — 등급 + 이유 (보정 확률 없음)
  const ecStorm = (ecmwf?.storms || []).find(s => String(s.name || '').toUpperCase() === String(storm.key || storm.name || '').toUpperCase()) || null;
  /* 앙상블 기준 반경 = 판단 기준 발표가 쓴 반경(강풍역/예보원)과 같게 맞춘다.
     "기관은 강풍역 440 km 안, 앙상블은 100 km 안 통과"처럼 기준이 다르면 서로 어긋난 것처럼 보여 등급이 부당하게 낮아진다. */
  const basisRadiusKm = (() => { const ps = (basisRec?.pts || []).filter(p => p.r); if (!ps.length) return 100; const near = ps.reduce((m, p) => (p.d < m.d ? p : m), ps[0]); return Math.max(100, Math.round(near.r.km)); })();
  const ens = ecStorm ? ensembleNear(place, ecStorm, basisRadiusKm) : null;
  const near = buoys ? buoysNear(place, buoys, 150, 3, now) : [];
  const reasons = [];
  const evalN = withR.length, yesN = yes.length;
  if (evalN) reasons.push(`기관 예보 ${yesN}/${evalN} 이 반경 ${yes.length ? '안' : '밖'} (${withR.map(j => j.agency).join('·')})`);
  const noR = judged.filter(j => j.status === 'noradius');
  if (noR.length) reasons.push(`${noR.map(j => j.agency).join('·')} 발표는 반경 자료가 없어 판정에서 제외`);
  if (ens) reasons.push(`ECMWF 앙상블 ${ens.n}/${ens.total} 멤버가 ${ens.km} km 안 통과${ens.firstH != null ? ` (첫 통과 +${ens.firstH}h)` : ''}`);
  if (near.length) {
    const fresh = near.filter(b => b.fresh);
    const diff = (wave && !wave.none && fresh.length) ? fresh.map(b => Math.abs(b.wh - wave.wave)) : [];
    reasons.push(`부이 ${near.length}곳(150 km 안)${fresh.length ? `, 신선 ${fresh.length}곳` : ', 신선한 관측 없음'}${diff.length ? ` · 모델과 최대 ${Math.max(...diff).toFixed(1)} m 차이` : ''}`);
  }
  if (basisRec?.issueMs) reasons.push(`판단 기준 발표 후 ${Math.max(0, Math.round((now - basisRec.issueMs) / H))}시간 경과`);
  let grade = null;
  if (evalN) {
    const ageH = basisRec?.issueMs ? (now - basisRec.issueMs) / H : 99;
    const agree = yesN === 0 || yesN === evalN;                        // 기관끼리 갈리지 않음
    const ensOk = ens ? (ens.n / ens.total >= 0.5) === !!yes.length : null; // 앙상블이 기관 판정과 같은 방향
    if (agree && (ensOk === true || (ensOk === null && evalN >= 2)) && ageH <= 6) grade = 'high';
    else if (!agree || ensOk === false || ageH > 12) grade = 'low';
    else grade = 'mid';
  }
  const certain = grade ? { grade, gradeKo: GRADE[grade], reasons } : null;

  // WHY ENGINE — 자료별 상태. 안 쓴 것은 '미사용'으로 그대로.
  // hit = 그 자료가 '영향 있음' 쪽을 가리키는가. '같은 방향' 집계는 이 플래그로만 센다 (글자 매칭은 파고를 놓쳤다).
  const engine = judged.map(j => ({ name: `${j.agencyKo || j.agency} 공식 예보`, used: j.status !== 'noradius' && j.status !== 'unknown',
    hit: j.status === 'yes' && !(j.when && j.when.past),
    text: j.status === 'yes' ? `${j.radiusKind === 'gale' ? '강풍역' : '예보원'} 안${j.when && j.when.past ? `이었으나 ${fmtKst(j.when.endMs)} KST 지남` : ''}` : j.status === 'no' || j.status === 'no-partial' ? `${j.radiusKind === 'gale' ? '강풍역' : '예보원'} 밖 · 최근접 ${j.nearestKm} km` : j.status === 'noradius' ? `반경 자료 없음 · 최근접 ${j.nearestKm} km` : '예보 좌표 없음' }));
  engine.push(ens ? { name: 'ECMWF IFS 앙상블(51)', used: true, hit: ens.n / ens.total >= 0.5, text: `${ens.n}/${ens.total} 멤버 ${ens.km} km 안` } : { name: 'ECMWF IFS 앙상블', used: false, text: '이 태풍의 앙상블 없음' });
  engine.push(wave && !wave.none ? { name: `해양 모델(${wave.source})`, used: true, hit: wave.wave >= waveThreshold, text: `유의파고 ${wave.wave.toFixed(1)} m (임계 ${waveThreshold.toFixed(1)} m)` } : { name: '해양 모델', used: false, text: grids ? '내 동네 반경 안 바다 격자 없음' : '격자 응답 없음' });
  engine.push(near.length ? { name: 'KMA 부이 실측', used: near.some(b => b.fresh), hit: near.some(b => b.fresh && b.wh >= waveThreshold), text: `${near[0].name} ${near[0].km} km · 파고 ${near[0].wh} m${near[0].fresh ? '' : ' (3시간 넘음)'}` } : { name: 'KMA 부이 실측', used: false, text: '150 km 안 파고 부이 없음' });
  engine.push(wind ? { name: 'KMA 동네예보', used: true, hit: !!wind.firstMs, text: `${wind.point} 최대 ${wind.maxWs} m/s` } : { name: 'KMA 동네예보', used: false, text: '60 km 안 지점 없음 (한국 밖)' });
  engine.push({ name: 'ASCAT 위성 해상풍', used: false, text: '미연결' });

  const usedN = engine.filter(e => e.used).length;
  const sameDir = engine.filter(e => e.used && !!e.hit === (state === 'signal')).length;

  return {
    kind: 'cyclone', id: storm.key || storm.name, title: `태풍 ${storm.name || storm.key}${recs[0]?.number ? ` (${recs[0].number})` : ''}`,
    state, basis, status: '감시 중 · 다음 판정 = 앱 열 때·⟳ 때',
    when, why, timeline, certain, engine, engineSummary: usedN ? `${usedN}개 자료 중 ${sameDir}개 같은 방향` : null,
    facts: { nearestKm: nearestAll?.nearestKm ?? null, agencies: judged.map(j => ({ agency: j.agency, status: j.status, nearestKm: j.nearestKm, issueMs: j.issueMs })),
             ens, earliestDowngrade: storm.earliestDowngrade || null,
             pastWindow: (!yes.length && passed.length) ? (() => { const r = [...passed].sort((a, b) => (b.issueMs || 0) - (a.issueMs || 0))[0]; return { startMs: r.when.startMs, endMs: r.when.endMs, agency: r.agency, agencyKo: r.agencyKo, issueMs: r.issueMs }; })() : null },
    badges: ['OFFICIAL_FORECAST', ...(ens ? ['MODEL'] : [])],
  };
}

/** 무엇이 달라졌나 — 같은 함수로 직전 발표를 계산해 비교. prev 는 typhoonCard 결과. */
export function typhoonChanged(cur, prev) {
  if (!cur || !prev) return null;
  const a = prev.when, b = cur.when;
  const out = { prevIssueMs: prev.basis?.issueMs ?? null, curIssueMs: cur.basis?.issueMs ?? null, prevState: prev.state, curState: cur.state, lines: [] };
  if (prev.state !== cur.state) out.lines.push(`영향 여부 ${prev.state === 'signal' ? '있음' : prev.state === 'quiet' ? '없음' : '판단 불가'} → ${cur.state === 'signal' ? '있음' : cur.state === 'quiet' ? '없음' : '판단 불가'}`);
  if (a && b) {
    if (a.startNow && b.startNow) {
      out.lines.push('두 발표 모두 발표 시점에 이미 영향권 안 — 시작 시각은 비교하지 않음');
      const de = Math.round((b.endMs - a.endMs) / H);
      if (de) out.lines.push(`영향 끝 ${fmtKst(a.endMs)} → ${fmtKst(b.endMs)} (${de < 0 ? `약 ${-de}시간 앞당겨짐` : `약 ${de}시간 늦춰짐`})`);
    } else {
      const dh = Math.round((b.startMs - a.startMs) / H);
      out.startDeltaH = dh;
      out.lines.push(`예상 영향 시작 ${fmtKst(a.startMs)} → ${fmtKst(b.startMs)} (${dh === 0 ? '변화 없음' : dh < 0 ? `약 ${-dh}시간 앞당겨짐` : `약 ${dh}시간 늦춰짐`})`);
    }
    const dp = Math.round((b.peakMs - a.peakMs) / H);
    if (dp && !(a.startNow && b.startNow)) out.lines.push(`최대 영향 시점 ${fmtKst(a.peakMs)} → ${fmtKst(b.peakMs)}`);
  }
  const pn = prev.facts?.nearestKm, cn = cur.facts?.nearestKm;
  if (Number.isFinite(pn) && Number.isFinite(cn) && pn !== cn) { out.nearestDeltaKm = cn - pn; out.lines.push(`최근접 거리 ${pn} → ${cn} km`); }
  if (prev.certain && cur.certain && prev.certain.grade !== cur.certain.grade) out.lines.push(`신뢰 등급 ${prev.certain.gradeKo} → ${cur.certain.gradeKo}`);
  if (!out.lines.length) out.lines.push('직전 발표와 판정이 같음');
  return out;
}

/* ── 지진 ─────────────────────────────────────────────────── */
export function quakeCards(place, quakeJson, { km = 400, minMag = 5, days = 7, now = Date.now() } = {}) {
  const qs = quakeJson?.quakes;
  if (!Array.isArray(qs)) return null;
  const hits = [];
  for (const q of qs) {
    if (!Number.isFinite(+q.lat) || !(+q.mag >= minMag)) continue;
    const t = parseWhen(q.at); if (t == null || now - t > days * 24 * H) continue;
    const d = kmBetween(place, { lat: +q.lat, lon: +q.lon }); if (d > km) continue;
    hits.push({ q, d, t });
  }
  // 같은 지진을 두 기관이 보고하면(100 km·30분·규모 0.5 안) 하나로 묶고 "기관 2곳"으로 센다
  const groups = [];
  for (const h of hits.sort((a, b) => b.t - a.t)) {
    const g = groups.find(x => Math.abs(x.t - h.t) <= 30 * 60_000 && kmBetween({ lat: +x.q.lat, lon: +x.q.lon }, { lat: +h.q.lat, lon: +h.q.lon }) <= 100 && Math.abs(+x.q.mag - +h.q.mag) <= 0.5);
    if (g) g.others.push(h); else groups.push({ ...h, others: [] });
  }
  return groups.map(g => ({
    kind: 'quake', id: `${g.q.src}-${g.q.at}-${g.q.mag}`, title: `지진 M${(+g.q.mag).toFixed(1)} · ${g.q.place || ''}`,
    state: 'signal', basis: { text: `${g.q.srcKo || g.q.src} 발표 · 내 동네에서 ${Math.round(g.d)} km (${km} km 안 M${minMag}+ 규칙)`, agency: g.q.src, issueMs: g.t },
    status: '감시 중', when: null,
    why: [{ key: 'dist', label: '거리', value: `${Math.round(g.d)} km`, source: `${g.q.srcKo || g.q.src}` },
          { key: 'mag', label: '규모·깊이', value: `M${(+g.q.mag).toFixed(1)}${g.q.depthKm != null ? ` · 깊이 ${g.q.depthKm} km` : ''}`, source: `${g.q.srcKo || g.q.src}` },
          { key: 'time', label: '발생', value: `${fmtKst(g.t)} KST`, source: `${g.q.srcKo || g.q.src}` }],
    timeline: [], certain: { grade: g.others.length ? 'high' : 'mid', gradeKo: g.others.length ? '높음' : '보통',
      reasons: [g.others.length ? `기관 ${1 + g.others.length}곳 보고 일치 (${[g.q.src, ...g.others.map(o => o.q.src)].join('·')})` : `기관 1곳 보고 (${g.q.src})`] },
    engine: [{ name: `${g.q.srcKo || g.q.src}`, used: true, text: `M${(+g.q.mag).toFixed(1)} · ${Math.round(g.d)} km` }, ...g.others.map(o => ({ name: `${o.q.srcKo || o.q.src}`, used: true, text: `M${(+o.q.mag).toFixed(1)} · ${Math.round(o.d)} km` }))],
    engineSummary: null, facts: { km: Math.round(g.d), mag: +g.q.mag }, badges: ['OFFICIAL_OBSERVATION'],
  }));
}

/* ── 쓰나미 ───────────────────────────────────────────────── */
/** 위협 게시문(Information 제외)이 있을 때만 카드. 대상 구역 목록이 자료에 없으므로 포함 여부는 '판단 불가'다 — 안전으로 바꾸지 않는다. */
export function tsunamiCards(place, intlJson, etaIndex = null, { now = Date.now(), days = 3 } = {}) {
  const alerts = intlJson?.alerts;
  if (!Array.isArray(alerts)) return null;
  const out = [];
  for (const a of alerts) {
    const t = parseWhen(a.updated) ?? parseWhen(a.issued);
    if (t == null || now - t > days * 24 * H) continue;
    if (/^information$/i.test(String(a.category || ''))) continue;
    const d = Number.isFinite(+a.lat) ? Math.round(kmBetween(place, { lat: +a.lat, lon: +a.lon })) : null;
    const eta = (etaIndex?.events || []).find(e => Number.isFinite(+e.lat) && Number.isFinite(+a.lat) && kmBetween({ lat: +e.lat, lon: +e.lon }, { lat: +a.lat, lon: +a.lon }) < 150) || null;
    out.push({
      kind: 'tsunami', id: a.id, title: `쓰나미 게시문 · ${a.region || a.title || ''}`,
      state: 'unknown', basis: { text: `${a.center} ${a.category} 게시문 (${fmtKst(t)} KST) · 대상 구역 포함 여부 판단 불가 — 게시문의 구역 목록을 자료로 받지 않음`, agency: a.center, issueMs: t, bulletin: a.bulletin || null },
      status: '게시문 원문 확인 필요', when: null,
      why: [{ key: 'src', label: '진원', value: `M${a.magnitude ?? '?'} · ${a.region || ''}${d != null ? ` · 내 동네에서 ${d} km` : ''}`, source: a.centerName || a.center }],
      timeline: [], certain: null,
      engine: [{ name: a.centerName || a.center, used: true, text: `${a.category} · ${a.bulletin ? '원문 링크 있음' : '원문 링크 없음'}` },
               eta ? { name: 'EARTHUS 도달시간 추정(SIMULATION_ONLY)', used: true, text: eta.nearestKorea ? `한국 최근접 ${eta.nearestKorea.name || ''} ${eta.nearestKorea.etaMin ?? '?'}분` : '계산 창 밖 (한국 연안 도달 없음)' } : { name: 'EARTHUS 도달시간 추정', used: false, text: '이 사건 계산 없음' }],
      engineSummary: null, facts: { km: d, category: a.category, eta }, badges: ['OFFICIAL_WARNING', ...(eta ? ['SIMULATION_ONLY'] : [])],
    });
  }
  return out;
}

/* ── 파고 ─────────────────────────────────────────────────── */
/** Open-Meteo Marine hourly 응답 → [{t, wave, swell, windWave, per}]. 못 읽으면 null. (STEP 3, 내 동네 1점) */
export function waveHourlySeries(json) {
  const h = json?.hourly;
  if (!h || !Array.isArray(h.time) || !Array.isArray(h.wave_height)) return null;
  const out = [];
  for (let i = 0; i < h.time.length; i++) {
    const t = parseWhen(h.time[i]); const w = h.wave_height[i];
    if (t == null || w == null || !Number.isFinite(+w)) continue;
    out.push({ t, wave: +w, swell: h.swell_wave_height?.[i] ?? null, windWave: h.wind_wave_height?.[i] ?? null, per: h.wave_period?.[i] ?? null });
  }
  return out.length ? out : null;
}

/** 시간별 파고에서 임계 초과 창 — 첫 초과 ~ 연속 끝, 최대 시각. 지금 이전 자료는 버린다. */
export function waveWindow(series, threshold, now) {
  const fut = (series || []).filter(x => x.t >= now - H);
  if (!fut.length) return null;
  const first = fut.findIndex(x => x.wave >= threshold);
  if (first < 0) return { none: true, maxWave: Math.max(...fut.map(x => x.wave)), maxAt: fut.reduce((m, x) => (x.wave > m.wave ? x : m), fut[0]).t };
  let last = first; while (last + 1 < fut.length && fut[last + 1].wave >= threshold) last++;
  const seg = fut.slice(first, last + 1);
  const peak = seg.reduce((m, x) => (x.wave > m.wave ? x : m), seg[0]);
  return { startMs: fut[first].t, endMs: fut[last].t, peakMs: peak.t, peakWave: peak.wave, widthH: 1, openEnd: last === fut.length - 1, startNow: first === 0, maxWave: peak.wave };
}

export function waveCard(place, grids, buoys, { threshold = 2.0, now = Date.now(), hourly = null, hourlySource = 'Open-Meteo Marine 시간별(내 동네 1점)' } = {}) {
  const w = grids ? waveNear(place, grids) : null;
  if (!w && !hourly) return { kind: 'wave', id: 'wave', title: '파고', state: 'unknown', basis: { text: '판단 불가 — 격자 응답 없음' }, status: '감시 중', when: null, why: [], timeline: [], certain: null, engine: [], engineSummary: null, facts: {}, badges: ['MODEL'] };
  if (w && w.none && !hourly) return null; // 내륙 깊은 곳 — 반경 안 바다 격자 없음: 카드 자체를 만들지 않는다
  const near = buoys ? buoysNear(place, buoys, 100, 3, now) : [];
  const fresh = near.filter(b => b.fresh);
  const nowWave = (w && !w.none) ? w.wave : null;
  const win = hourly ? waveWindow(hourly, threshold, now) : null;
  const hitNow = nowWave != null && nowWave >= threshold;
  const hitLater = !!(win && !win.none);
  const hit = hitNow || hitLater;
  const reasons = [];
  if (fresh.length && nowWave != null) { const diff = Math.abs(fresh[0].wh - nowWave); reasons.push(`부이 ${fresh[0].name}(${fresh[0].km} km) 실측 ${fresh[0].wh} m · 모델과 ${diff.toFixed(1)} m 차이`); }
  else if (near.length) reasons.push(`부이 ${near[0].name} 관측이 3시간 넘어 대조 제외`); else reasons.push('100 km 안 파고 부이 없음 — 모델만');
  if (hourly) reasons.push(`시간별 예보 ${hourly.length}시간 (${hourlySource})${win && !win.none ? ` · 임계 초과 ${fmtKst(win.startMs)}~${fmtKst(win.endMs)} KST` : win ? ` · 3일 내 최대 ${win.maxWave.toFixed(1)} m (임계 미만)` : ''}`);
  else reasons.push('시간별 예보 없음 — 지금 격자값만');
  const grade = (fresh.length && nowWave != null) ? (Math.abs(fresh[0].wh - nowWave) <= 0.5 ? 'high' : 'low') : 'mid';
  const basisText = nowWave != null
    ? `${w.source} ${w.res}° 격자 최대 유의파고 ${nowWave.toFixed(1)} m ${hitNow ? '≥' : '<'} 임계 ${threshold.toFixed(1)} m (${w.time ? fmtKst(parseWhen(w.time)) + ' KST' : ''})${!hitNow && hitLater ? ` · 시간별 예보로 ${fmtKst(win.startMs)} KST 부터 초과` : ''}`
    : `${hourlySource} 최대 ${win ? win.maxWave.toFixed(1) : '?'} m ${hitLater ? '≥' : '<'} 임계 ${threshold.toFixed(1)} m`;
  const when = hitLater ? { ...win, agency: hourlySource, agencyKo: hourlySource, issueMs: hourly[0]?.t ?? null, peakKm: null } : null;
  const why = [];
  if (nowWave != null) why.push({ key: 'wave', label: '유의파고(지금)', value: `${nowWave.toFixed(1)} m`, source: `${w.source} ${w.res}° 격자`, hit: hitNow });
  if (win) why.push({ key: 'wavefc', label: '유의파고(예보)', value: win.none ? `3일 내 최대 ${win.maxWave.toFixed(1)} m (${fmtKst(win.maxAt)} KST)` : `최대 ${win.peakWave.toFixed(1)} m (${fmtKst(win.peakMs)} KST) · 임계 초과 ${fmtKst(win.startMs)}~${win.openEnd ? '예보 끝' : fmtKst(win.endMs)}`, source: hourlySource, hit: hitLater });
  if (w && !w.none && w.swell != null) why.push({ key: 'swell', label: '너울', value: `${(+w.swell).toFixed(1)} m${w.wper != null ? ` · 주기 ${(+w.wper).toFixed(0)} s` : ''}`, source: w.source });
  // 예상 변화 — 시간별 예보가 있을 때만 (지금/12/24/36h)
  const timeline = [];
  if (hourly) {
    for (const off of [0, 12, 24, 36]) {
      const t = now + off * H;
      const x = hourly.reduce((m, y) => (Math.abs(y.t - t) < Math.abs(m.t - t) ? y : m), hourly[0]);
      if (Math.abs(x.t - t) > 2 * H) continue;
      let level = 'out', text = `${x.wave.toFixed(1)} m`;
      if (x.wave >= threshold && win && !win.none && Math.abs(x.t - win.peakMs) <= 3 * H) { level = 'peak'; text = `최대 ${x.wave.toFixed(1)} m`; }
      else if (x.wave >= threshold) { level = 'in'; text = `임계 초과 ${x.wave.toFixed(1)} m`; }
      else if (x.wave >= threshold * 0.75) { level = 'watch'; text = `관심 ${x.wave.toFixed(1)} m`; }
      timeline.push({ label: off === 0 ? '지금' : `${off}시간 후`, level, text, km: null });
    }
  }
  const engine = [];
  if (nowWave != null) engine.push({ name: `해양 모델(${w.source})`, used: true, hit: hitNow, text: `${nowWave.toFixed(1)} m @ ${w.lat.toFixed(1)},${w.lon.toFixed(1)}` });
  else engine.push({ name: '해양 모델 격자', used: false, text: grids ? '내 동네 반경 안 바다 격자 없음' : '격자 응답 없음' });
  engine.push(hourly ? { name: hourlySource, used: true, hit: hitLater, text: win && !win.none ? `초과 ${fmtKst(win.startMs)}~${fmtKst(win.endMs)} KST` : `3일 내 최대 ${win ? win.maxWave.toFixed(1) : '?'} m` } : { name: '시간별 파고 예보', used: false, text: '응답 없음' });
  engine.push(near.length ? { name: 'KMA 부이 실측', used: fresh.length > 0, hit: fresh.some(b => b.wh >= threshold), text: `${near[0].name} ${near[0].km} km · ${near[0].wh} m${near[0].fresh ? '' : ' (3시간 넘음)'}` } : { name: 'KMA 부이 실측', used: false, text: '100 km 안 부이 없음' });
  const usedN = engine.filter(e => e.used).length;
  const sameDir = engine.filter(e => e.used && !!e.hit === hit).length;
  return {
    kind: 'wave', id: 'wave', title: '파고 · 내 동네 앞바다', state: hit ? 'signal' : 'quiet',
    basis: { text: basisText, issueMs: w && w.time ? parseWhen(w.time) : null },
    status: hourly ? '감시 중 · 다음 판정 = 앱 열 때·⟳ 때' : '감시 중 · 시간별 예보 응답 없음', when,
    why, timeline, certain: { grade, gradeKo: GRADE[grade], reasons },
    engine, engineSummary: usedN ? `${usedN}개 자료 중 ${sameDir}개 같은 방향` : null,
    facts: { wave: nowWave, threshold, maxWave: win ? win.maxWave : null }, badges: ['MODEL'],
  };
}

/* ── 사건 방(피드 항목) ↔ 카드 ─────────────────────────────── */
/** USGS 피드 항목 하나로 지진 카드 — 내 장소 탭의 quake-asia 카드에 없는 사건(먼 곳·USGS 만)도 같은 규칙으로 판정 */
export function quakeCardFromEvent(place, ev, { km = 400, minMag = 5 } = {}) {
  if (!ev || !Number.isFinite(+ev.lat) || !Number.isFinite(+ev.lon)) return null;
  const d = kmBetween(place, { lat: +ev.lat, lon: +ev.lon });
  // +null 은 0 이라 null 검사가 먼저다
  const mag = (ev.mag != null && Number.isFinite(+ev.mag)) ? +ev.mag : (String(ev.title || '').match(/M(\d+(?:\.\d+)?)/) ? +String(ev.title).match(/M(\d+(?:\.\d+)?)/)[1] : null);
  const signal = d <= km && mag != null && mag >= minMag;
  const src = ev.source || 'USGS';
  return {
    kind: 'quake', id: ev.id || `eq-${ev.lat},${ev.lon}`, title: `지진 M${mag != null ? mag.toFixed(1) : '?'} · ${ev.where || ev.place || ''}`,
    state: signal ? 'signal' : 'quiet',
    basis: { text: `${src} 관측 · 내 동네에서 ${Math.round(d)} km${signal ? ` (${km} km 안 M${minMag}+ 규칙)` : ` · ${d > km ? `${km} km 밖` : `M${minMag} 미만`}`}`, agency: src, issueMs: Number.isFinite(ev.whenT) ? ev.whenT : null },
    status: '감시 중', when: null,
    why: [{ key: 'dist', label: '거리', value: `${Math.round(d)} km`, source: src },
          { key: 'mag', label: '규모·깊이', value: `M${mag != null ? mag.toFixed(1) : '?'}${ev.depthKm != null ? ` · 깊이 ${Math.round(ev.depthKm)} km` : ''}`, source: src }],
    timeline: [], certain: { grade: 'mid', gradeKo: '보통', reasons: [`기관 1곳 관측 (${src})`] },
    engine: [{ name: src, used: true, hit: signal, text: `M${mag != null ? mag.toFixed(1) : '?'} · ${Math.round(d)} km` }],
    engineSummary: null, facts: { km: Math.round(d), mag }, badges: ['OFFICIAL_OBSERVATION'],
  };
}

/** 피드 항목(TC/EQ)에 맞는 카드. TC 는 GDACS 이름(KROVANH-26)→공식 key(KROVANH), EQ 는 100 km·30분·규모 0.5 안 같은 사건. */
export function matchCardForRoom(cards, it) {
  if (!Array.isArray(cards) || !it) return null;
  if (it.kind === 'TC') {
    const name = String(it.stormName || it.title || '').toUpperCase().replace(/-\d{2}$/, '').trim();
    return cards.find(c => c.kind === 'cyclone' && String(c.id || '').toUpperCase() === name) || null;
  }
  if (it.kind === 'EQ') {
    return cards.find(c => c.kind === 'quake' && Number.isFinite(c.basis?.issueMs) && Number.isFinite(it.whenT)
      && Math.abs(c.basis.issueMs - it.whenT) <= 30 * 60_000 && Number.isFinite(+c.facts?.km) && Number.isFinite(+it.lat)
      && (c.facts.mag == null || !Number.isFinite(+it.mag) || Math.abs(+c.facts.mag - +it.mag) <= 0.5)) || null;
  }
  return null;
}

/* ── 전체 ─────────────────────────────────────────────────── */
/**
 * 내 동네에 대한 카드 전부. 순서: 태풍 → 쓰나미 → 지진 → 파고.
 * data: { official, ecmwf, marineEa, marine, buoys, fcst, quakes, tsunami, tsunamiEta } — 못 받은 것은 null.
 * 원천 응답이 없으면 그 카드는 state 'unknown'(판단 불가)로 나온다. 절대 quiet 로 바꾸지 않는다.
 */
export function evaluateForMe(place, data = {}, opts = {}) {
  const now = opts.now ?? Date.now();
  const cards = [];
  const grids = [data.marineEa, data.marine].filter(Boolean);
  // 태풍
  if (data.official === null || data.official === undefined) {
    cards.push({ kind: 'cyclone', id: 'cyclone', title: '태풍', state: 'unknown', basis: { text: '판단 불가 — 공식 태풍 발표 응답 없음' }, status: '감시 중', when: null, why: [], timeline: [], certain: null, engine: [], engineSummary: null, facts: {}, badges: [] });
  } else {
    for (const s of data.official.storms || []) cards.push(typhoonCard(place, s, { ecmwf: data.ecmwf, grids: grids.length ? grids : null, buoys: data.buoys, fcst: data.fcst, now, waveThreshold: opts.waveThreshold ?? 2.0 }));
  }
  // 쓰나미
  const ts = tsunamiCards(place, data.tsunami, data.tsunamiEta, { now });
  if (ts === null) cards.push({ kind: 'tsunami', id: 'tsunami', title: '쓰나미', state: 'unknown', basis: { text: '판단 불가 — 게시문 응답 없음' }, status: '감시 중', when: null, why: [], timeline: [], certain: null, engine: [], engineSummary: null, facts: {}, badges: [] });
  else cards.push(...ts);
  // 지진
  const qs = quakeCards(place, data.quakes, { now });
  if (qs === null) cards.push({ kind: 'quake', id: 'quake', title: '지진', state: 'unknown', basis: { text: '판단 불가 — 지진 목록 응답 없음' }, status: '감시 중', when: null, why: [], timeline: [], certain: null, engine: [], engineSummary: null, facts: {}, badges: [] });
  else cards.push(...qs);
  // 파고
  const wc = waveCard(place, grids.length ? grids : null, data.buoys, { threshold: opts.waveThreshold ?? 2.0, now, hourly: data.waveHourly || null });
  if (wc) cards.push(wc);
  return cards;
}

/** 요약 — 카드 묶음을 한 줄로. 신호 있음 > 판단 불가 > 조용. */
export function summarize(cards) {
  const signal = cards.filter(c => c.state === 'signal'), unknown = cards.filter(c => c.state === 'unknown');
  if (signal.length) return { level: 'signal', text: `걸린 사건 ${signal.length}건 — ${signal.map(c => c.title).join(', ')}` };
  if (unknown.length) return { level: 'unknown', text: `판단 불가 ${unknown.length}건 (원천 응답 없음) · 나머지 신호 없음` };
  return { level: 'quiet', text: '지금 내 동네에 걸린 사건 없음 · 감시 중' };
}

/* ── 직전 발표 찾기(태풍) ─────────────────────────────────────
   S3 목록을 못 읽으므로(AccessDenied) KMA 발표 주기(6h, 접근 시 3h)로 뒤로 짚어 본다.
   JMA 는 발표시각이 불규칙(예 21:45)이라 짚을 수 없다 → STEP 6 에서 색인 파일로 대체.
   fetchJson(url) 은 실패 시 null 을 돌려줘야 한다. 최대 probes 회. */
export async function findPreviousIssue(storm, fetchJson, { base = '', agency = 'KMA', probes = 8 } = {}) {
  const rec = (storm.agencies || []).find(a => a.agency === agency);
  if (!rec?.sourceRef || !rec.issue) return null;
  const issueMs = parseWhen(rec.issue); if (issueMs == null) return null;
  const dir = rec.sourceRef.replace(/\/[^/]+$/, '');
  const stamp = (ms) => { const d = new Date(ms); const p = n => String(n).padStart(2, '0'); return `${d.getUTCFullYear()}${p(d.getUTCMonth() + 1)}${p(d.getUTCDate())}${p(d.getUTCHours())}${p(d.getUTCMinutes())}`; };
  let tried = 0;
  for (let back = 3; back <= 24 && tried < probes; back += 3) {
    const url = `${base}${dir}/${agency}-${stamp(issueMs - back * H)}.json`;
    tried++;
    const j = await fetchJson(url);
    if (j) return { url, json: j, backH: back };
  }
  return null;
}

/** 아카이브 원문(발표 하나) → typhoonCard 가 먹는 storm 모양. 원문 구조가 storm 전체이거나 rec 하나일 수 있어 둘 다 받는다. */
export function stormFromArchive(archiveJson, storm) {
  if (!archiveJson) return null;
  if (Array.isArray(archiveJson.agencies)) return archiveJson;
  if (Array.isArray(archiveJson.steps)) return { key: storm.key, name: storm.name, agencies: [archiveJson] };
  if (archiveJson.record && Array.isArray(archiveJson.record.steps)) return { key: storm.key, name: storm.name, agencies: [archiveJson.record] };
  return null;
}

/* ── 사건 패킷으로 직전 발표·이력 찾기 ───────────────────────
   v2 사건 방이 이미 쓰는 ocean/cyclone-events/{gdacsId}.json 에 회차별 agencies[].sourceRef 가 있다.
   S3 목록(AccessDenied)이나 발표 주기 추측이 필요 없다. 위 findPreviousIssue 는 패킷이 없을 때의 폴백이다. */

/** 패킷의 revisions 에서 기관별로 **서로 다른 발표(sourceRef)** 를 시간순으로 뽑는다. */
export function issuesFromPacket(packet) {
  const out = {}; // agency → [{issueMs, sourceRef}]
  for (const r of packet?.revisions || []) {
    for (const [agency, v] of Object.entries(r.agencies || {})) {
      if (!v?.sourceRef) continue;
      const issueMs = parseWhen(v.issued);
      const arr = out[agency] || (out[agency] = []);
      if (!arr.some(x => x.sourceRef === v.sourceRef)) arr.push({ agency, issueMs, sourceRef: v.sourceRef });
    }
  }
  for (const k of Object.keys(out)) out[k].sort((a, b) => (a.issueMs || 0) - (b.issueMs || 0));
  return out;
}

/** 현재 storm 의 각 기관 sourceRef 바로 앞 발표. 없으면 그 기관은 빠진다. */
export function previousIssues(packet, storm) {
  const byAgency = issuesFromPacket(packet);
  const prev = [];
  for (const rec of storm.agencies || []) {
    const list = byAgency[rec.agency] || [];
    const i = list.findIndex(x => x.sourceRef === rec.sourceRef);
    const p = i > 0 ? list[i - 1] : (i < 0 && list.length ? list[list.length - 1] : null);
    if (p) prev.push(p);
  }
  return prev;
}

/** 아카이브 원문 여러 개(기관별 직전 발표) → typhoonCard 가 먹는 storm 하나. */
export function stormFromArchives(archives, storm) {
  const recs = archives.map(a => a?.record || (Array.isArray(a?.steps) ? a : null)).filter(Boolean);
  return recs.length ? { key: storm.key, name: storm.name, agencies: recs } : null;
}

/** MY EVENT HISTORY 한 줄 — 발표마다 같은 함수로 다시 계산한 결과. */
export function historyLine(card, issue) {
  return { issueMs: issue.issueMs, agency: issue.agency, state: card.state,
           startMs: card.when?.startMs ?? null, endMs: card.when?.endMs ?? null, nearestKm: card.facts?.nearestKm ?? null,
           grade: card.certain?.gradeKo ?? null };
}
