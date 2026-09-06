/* 위성 관제센터 — 데이터 모델 (Cesium·DOM 없음, node 로 검증 가능)
 *
 * 받은 지시서(2026-09-07 "EARTHUS SATELLITE CONTROL CENTER v1.0") §18~§20:
 *   · 모든 객체는 **현재 상태**와 **시간축**을 분리해 다룬다. 여기서 객체는 궤도요소(elements)를
 *     들고 있고, 위치는 항상 "어느 시각의 위치"로만 계산한다 — 현재 시각도 그 시각 중 하나일 뿐이다.
 *     그래서 ARCHIVE 재생(§17)이 같은 함수로 된다.
 *   · provenance 를 보존한다. 객체마다 source{provider, dataset, observedAt(요소 epoch), ingestedAt,
 *     processing} 을 들고 다닌다. 실제로 쓴 출처만 적는다.
 *   · 충돌확률을 계산하지 않는다(§9). 여기서 내는 것은 기하 거리·상대속도·최근접 시각뿐이고,
 *     그것도 "브라우저 SGP4 계산" 이라고 이름표를 붙인다.
 *
 * 세 출처가 같은 모양(SpaceObject)으로 합쳐진다:
 *   sat    js/layers/space.js orbits.sats      — CelesTrak OMM + SATCAT 조인(S3 카탈로그)
 *   aeth   js/aetherus/core.js entries         — AETHERUS 정본 카탈로그(우주쓰레기 포함)
 *   launch js/layers/space.js launches.*       — Launch Library 2 축약본
 *
 * ⚠️ satellite.js 는 전역(globalThis.satellite)이다. 테스트는 setSatLib 로 주입한다.
 */

export const RE_KM = 6378.137;
const MU = 398600.4418;              // km³/s²
const D2R = Math.PI / 180;
const R2D = 180 / Math.PI;

let satLib = null;
export function setSatLib(lib) { satLib = lib; }
const sat = () => satLib || globalThis.satellite || null;

/* ── 객체 종류 (§5 시각 구분과 1:1) ─────────────────────────────────────── */
export const KIND = Object.freeze({
  SATELLITE: 'satellite',     // ●
  STATION: 'station',         // ● (아이콘)
  ROCKET_BODY: 'rocket_body', // ▲  발사체(상단 등) 잔해
  FRAGMENT: 'fragment',       // ◆  파편(충돌·폭발 조각)
  DEBRIS: 'debris',           // ●  기타 잔해(DEB 표기, 분류 불명)
  UNKNOWN: 'unknown',
  LAUNCH: 'launch',           // 발사 이벤트(궤도 객체가 아니다)
  GROUND_STATION: 'ground_station',
});

/** 이름·object_type 으로 종류를 정한다. CelesTrak/SATCAT 이름 규약을 그대로 읽는다. */
export function classify(name, objectType) {
  const n = String(name || '').toUpperCase();
  const t = String(objectType || '').toUpperCase();
  if (/R\/B|ROCKET BODY|\bRB\b/.test(n) || t === 'ROCKET BODY' || t === 'R/B') return KIND.ROCKET_BODY;
  if (/\bDEB\b|DEBRIS/.test(n) || t === 'DEBRIS') {
    // 충돌·폭발 파편은 이름에 원 물체 + DEB 가 붙는다(COSMOS 2251 DEB, FENGYUN 1C DEB)
    return /COSMOS 2251|FENGYUN 1C|IRIDIUM 33|COSMOS 1408|NOAA 16|BREEZE|CBERS/.test(n)
      ? KIND.FRAGMENT : KIND.DEBRIS;
  }
  if (/^ISS\b|ZARYA|TIANGONG|\bCSS\b|TIANHE/.test(n)) return KIND.STATION;
  /* ⚠️ object_type 'UNKNOWN' 은 "카탈로그가 분류를 안 실었다"는 뜻이지 "미식별 물체"가 아니다
     (AETHERUS 정본은 TESS·FENGYUN 3B 같은 위성에도 UNKNOWN 을 붙여 온다). 미식별은 이름 규약으로만 판정한다. */
  if (/^UNKNOWN|^OBJECT [A-Z]{1,2}$|^TBA\b/.test(n)) return KIND.UNKNOWN;
  return KIND.SATELLITE;
}

/* ── 궤도요소 요약 ────────────────────────────────────────────────────── */
/** satrec → { incDeg, periodMin, ecc, raanDeg, aKm, apogeeKm, perigeeKm, epochMs } */
export function elementsOf(rec) {
  if (!rec) return null;
  const nRadMin = rec.no;                       // rad/min
  const periodMin = (2 * Math.PI) / nRadMin;
  const nRadSec = nRadMin / 60;
  const aKm = Math.cbrt(MU / (nRadSec * nRadSec));
  const ecc = rec.ecco;
  return {
    incDeg: rec.inclo * R2D,
    periodMin,
    ecc,
    raanDeg: rec.nodeo * R2D,
    argpDeg: rec.argpo * R2D,
    aKm,
    apogeeKm: aKm * (1 + ecc) - RE_KM,
    perigeeKm: aKm * (1 - ecc) - RE_KM,
    epochMs: epochMsOf(rec),
  };
}

/** satrec 의 epoch(율리우스일) → ms. jdsatepoch 가 없으면 null. */
export function epochMsOf(rec) {
  const jd = rec?.jdsatepoch;
  if (!Number.isFinite(jd)) return null;
  const frac = Number.isFinite(rec.jdsatepochF) ? rec.jdsatepochF : 0;
  return Math.round((jd + frac - 2440587.5) * 86400_000);
}

/** 고도·경사각·주기로 궤도 등급. satcat.js 의 규칙과 같은 문턱을 쓴다. */
export function orbitClass(altKm, incDeg, periodMin) {
  if (periodMin > 1400 && periodMin < 1480 && Math.abs(incDeg) < 10) return { ko: '정지궤도 (GEO)', en: 'Geostationary (GEO)', code: 'GEO' };
  if (altKm > 30000) return { ko: '고궤도 (HEO/GEO)', en: 'High orbit', code: 'HEO' };
  if (altKm > 2000) return { ko: '중궤도 (MEO)', en: 'Medium Earth orbit (MEO)', code: 'MEO' };
  if (incDeg > 96 && incDeg < 100) return { ko: '태양동기궤도 (SSO)', en: 'Sun-synchronous (SSO)', code: 'SSO' };
  if (incDeg > 80) return { ko: '극궤도 (LEO)', en: 'Polar LEO', code: 'LEO' };
  return { ko: '저궤도 (LEO)', en: 'Low Earth orbit (LEO)', code: 'LEO' };
}

/* ── 위치 계산 — 항상 "어느 시각" 을 받는다 ───────────────────────────── */
/** TEME 위치·속도(km, km/s). 못 풀면 null. */
export function propagateTEME(rec, date) {
  const S = sat();
  if (!S || !rec) return null;
  try {
    const pv = S.propagate(rec, date);
    const p = pv?.position;
    if (!p || !Number.isFinite(p.x) || !Number.isFinite(p.y) || !Number.isFinite(p.z)) return null;
    return { r: p, v: pv.velocity || null };
  } catch (_) { return null; }
}

/** 측지 위치 { lat, lon, altKm, velKmS, ecef:[x,y,z]km, at } */
export function geodeticAt(rec, date) {
  const S = sat();
  const pv = propagateTEME(rec, date);
  if (!pv) return null;
  const gmst = S.gstime(date);
  const gd = S.eciToGeodetic(pv.r, gmst);
  const ecf = S.eciToEcf(pv.r, gmst);
  return {
    lat: S.degreesLat(gd.latitude),
    lon: S.degreesLong(gd.longitude),
    altKm: gd.height,
    velKmS: pv.v ? Math.hypot(pv.v.x, pv.v.y, pv.v.z) : null,
    ecef: [ecf.x, ecf.y, ecf.z],
    at: date.toISOString(),
  };
}

/** 궤적 표본 — fromMs 부터 minutes 만큼(음수면 과거) steps 등분. [{lat,lon,altKm,t}] */
export function trackSamples(rec, fromMs, minutes, steps) {
  const out = [];
  for (let i = 0; i <= steps; i++) {
    const t = fromMs + (i * minutes * 60_000) / steps;
    const g = geodeticAt(rec, new Date(t));
    if (g) out.push({ lat: g.lat, lon: g.lon, altKm: g.altKm, t });
  }
  return out;
}

/* ── SpaceObject — 세 출처를 한 모양으로 ───────────────────────────────── */
/**
 * @typedef SpaceObject
 * @prop {string} id          'sat:25544' | 'aeth:12345' | 'launch:xxxx'
 * @prop {string} kind        KIND.*
 * @prop {string} name
 * @prop {string|null} noradId
 * @prop {string|null} cospar
 * @prop {object|null} rec    satrec (궤도 객체만)
 * @prop {object} source      { provider, dataset, observedAt, ingestedAt, processing }
 * @prop {object} meta        출처별 부가정보(소유·발사일·운용상태·그룹…)
 */

export function fromSat(s, idx, catalogGeneratedAt) {
  const el = elementsOf(s.rec);
  return {
    id: `sat:${s.noradId ?? idx}`,
    ref: { type: 'sat', idx },
    kind: classify(s.name),
    name: s.name,
    noradId: s.noradId != null ? String(s.noradId) : null,
    cospar: s.objectId || null,
    rec: s.rec,
    elements: el,
    color: s.color || null,
    source: {
      provider: 'CelesTrak (NORAD GP) · SATCAT',
      dataset: 'OMM / GP elements + SATCAT join (EARTHUS S3 catalog)',
      observedAt: el?.epochMs != null ? new Date(el.epochMs).toISOString() : null,
      ingestedAt: catalogGeneratedAt || null,
      processing: 'SGP4 in browser (satellite.js)',
    },
    meta: {
      group: s.group || null,
      owner: s.owner || null, ownerKo: s.ownerKo || null,
      launchDate: s.launchDate || null, launchSite: s.launchSite || null,
      opsKo: s.opsKo || null, opsEn: s.opsEn || null, rcs: s.rcs || null,
    },
  };
}

export function fromAetherus(e, coreInfo = {}) {
  const S = sat();
  if (e.satrec === undefined && e.omm && S) {
    try { e.satrec = S.json2satrec(e.omm) || null; } catch (_) { e.satrec = null; }
  }
  const rec = e.satrec || null;
  const el = rec ? elementsOf(rec) : null;
  const kind = classify(e.name, e.objectType);
  return {
    id: `aeth:${e.catalogId}`,
    ref: { type: 'aeth', catalogId: e.catalogId },
    kind,
    name: e.name,
    noradId: /^\d+$/.test(String(e.catalogId)) ? String(e.catalogId) : null,
    cospar: null,
    rec,
    elements: el,
    color: null,
    source: {
      provider: 'AETHERUS canonical catalogue',
      dataset: coreInfo.fromSnapshot ? `published snapshot (${coreInfo.snapshotBase || ''})` : 'live science API',
      observedAt: e.epochMs != null ? new Date(e.epochMs).toISOString()
        : (Number.isFinite(e.sampleMs) ? new Date(e.sampleMs).toISOString() : null),
      ingestedAt: coreInfo.publishedAt || coreInfo.snapshotAt || null,
      processing: rec ? 'SGP4 in browser (server elements)' : 'server state vector · linear advance ≤40 s',
    },
    meta: { status: e.status || null, objectType: e.objectType || null, altKm: e.altKm ?? null,
      stateVector: !rec ? { r: e.r, v: e.v, sampleMs: e.sampleMs } : null },
  };
}

export function fromLaunch(m) {
  const d = m.data || {};
  return {
    id: `launch:${m.id}`,
    ref: { type: 'launch', launchId: m.id },
    kind: KIND.LAUNCH,
    name: m.name,
    noradId: null, cospar: null, rec: null, elements: null, color: null,
    lat: m.lat, lon: m.lon,
    source: {
      provider: 'The Space Devs · Launch Library 2',
      dataset: 'EARTHUS compact feed (events/launches.json)',
      observedAt: d._net || null,
      ingestedAt: d._retrievedAt || null,
      processing: 'relayed as published · trajectory is an approximation (orbit-math.js)',
    },
    meta: {
      net: d._net || null, hoursOut: d._hoursOut ?? null,
      status: launchStatus(d.__status ?? d.status ?? d['상태'] ?? d['Status'] ?? d._statusRaw),
      statusRaw: d.__status ?? d.status ?? d['상태'] ?? d['Status'] ?? d._statusRaw ?? null,
      provider: d._provider ?? d['운용'] ?? d['Provider'] ?? null,
      pad: d._padName ?? d['발사대'] ?? d['Pad'] ?? null,
      site: d._site || null, rocket: d._rocket || null,
      mission: d._mission || null, missionType: d._missionType || null,
      missionDescription: d._missionDescription || null,
      orbit: d._orbit || null, orbitAbbrev: d._orbitAbbrev || null,
      videos: d._videos || [], links: d._links || [],
      webcastLive: !!d._webcastLive, statusNote: d._statusNote || null,
      failReason: d._failReason || null,
    },
    _raw: m,
  };
}

/* ── 발사 상태 (§10 어휘) ────────────────────────────────────────────── */
export const LAUNCH_STATUS = Object.freeze(['SCHEDULED', 'HOLD', 'SCRUBBED', 'LIFTOFF', 'IN FLIGHT',
  'SUCCESS', 'PARTIAL FAILURE', 'FAILED', 'UNKNOWN']);

/** Launch Library 2 status 문구 → 지시서 어휘. 모르는 문구는 UNKNOWN(지어내지 않는다). */
export function launchStatus(raw) {
  const s = String(raw || '').toLowerCase();
  if (!s || s === '—') return 'UNKNOWN';
  if (/partial/.test(s)) return 'PARTIAL FAILURE';
  if (/success/.test(s)) return 'SUCCESS';
  if (/fail/.test(s)) return 'FAILED';
  if (/in flight|flight/.test(s)) return 'IN FLIGHT';
  if (/liftoff|lift-off/.test(s)) return 'LIFTOFF';
  if (/scrub/.test(s)) return 'SCRUBBED';
  if (/hold/.test(s)) return 'HOLD';
  if (/\bgo\b|tbd|tbc|determined|confirmed|scheduled/.test(s)) return 'SCHEDULED';
  return 'UNKNOWN';
}

/* ── 주변 우주 (§8) — 지금 시각의 기하 거리. 확률 아님. ───────────────── */
/**
 * @param target  SpaceObject(rec 필수)
 * @param pool    SpaceObject[]  후보(rec 있는 것만 계산, 없는 것은 skipped 로 센다)
 * @param dateMs  기준 시각
 * @param radiusKm
 * @param limit
 * @returns { rows:[{obj, distKm, relKmS, trend:'approaching'|'receding'|'steady'}], skipped, computed, at }
 */
export function nearby(target, pool, dateMs, radiusKm = 500, limit = 10) {
  const t0 = new Date(dateMs);
  const t1 = new Date(dateMs + 30_000);
  const a0 = propagateTEME(target.rec, t0);
  const a1 = propagateTEME(target.rec, t1);
  if (!a0 || !a1) return { rows: [], skipped: 0, computed: 0, at: dateMs, error: 'target' };
  const rows = [];
  let skipped = 0, computed = 0;
  for (const c of pool) {
    if (c === target || c.id === target.id) continue;
    if (target.noradId && c.noradId && c.noradId === target.noradId) continue; // 같은 물체, 다른 출처
    if (!c.rec) { skipped++; continue; }
    const b0 = propagateTEME(c.rec, t0);
    if (!b0) { skipped++; continue; }
    computed++;
    const d0 = dist(a0.r, b0.r);
    if (d0 > radiusKm) continue;
    const b1 = propagateTEME(c.rec, t1);
    const d1 = b1 ? dist(a1.r, b1.r) : d0;
    const rel = (a0.v && b0.v) ? Math.hypot(a0.v.x - b0.v.x, a0.v.y - b0.v.y, a0.v.z - b0.v.z) : null;
    rows.push({ obj: c, distKm: d0, relKmS: rel,
      trend: d1 < d0 - 0.05 ? 'approaching' : d1 > d0 + 0.05 ? 'receding' : 'steady' });
  }
  rows.sort((x, y) => x.distKm - y.distKm);
  return { rows: rows.slice(0, limit), skipped, computed, at: dateMs };
}

function dist(p, q) { return Math.hypot(p.x - q.x, p.y - q.y, p.z - q.z); }

/**
 * 두 궤도 객체의 앞으로 windowMin 분 안 최근접 — 조밀 표본(stepSec) 뒤 그 주변을 더 잘게 본다.
 * 근사이며 이름표를 붙여 쓴다. 확률은 내지 않는다.
 * @returns { tcaMs, missKm, relKmS } | null
 */
export function closestApproach(recA, recB, fromMs, windowMin = 90, stepSec = 20) {
  let best = null;
  const scan = (start, end, step) => {
    for (let t = start; t <= end; t += step) {
      const a = propagateTEME(recA, new Date(t));
      const b = propagateTEME(recB, new Date(t));
      if (!a || !b) continue;
      const d = dist(a.r, b.r);
      if (!best || d < best.missKm) {
        best = { tcaMs: t, missKm: d,
          relKmS: (a.v && b.v) ? Math.hypot(a.v.x - b.v.x, a.v.y - b.v.y, a.v.z - b.v.z) : null };
      }
    }
  };
  const endMs = fromMs + windowMin * 60_000;
  scan(fromMs, endMs, stepSec * 1000);
  if (!best) return null;
  const c = best.tcaMs;
  best = null;
  // 창 밖으로 나가지 않는다 — 최근접이 창 시작이면 그 앞을 보지 않는다
  scan(Math.max(fromMs, c - stepSec * 1000), Math.min(endMs, c + stepSec * 1000), 1000);
  return best;
}

/* ── 근접사건 (§9) — 서버 산출(AETHERUS P4)만 사건으로 부른다 ─────────── */
/**
 * core.conjunctions → CLOSE APPROACH 카드 자료.
 * PC 는 서버가 NOT_COMPUTED 라고 준 그대로 적는다 — 여기서 만들지 않는다.
 */
export function closeApproaches(conjunctions, nowMs = Date.now(), forNorad = null) {
  return (conjunctions || [])
    .filter(ev => !forNorad || String(ev.a) === String(forNorad) || String(ev.b) === String(forNorad))
    .map(ev => ({
      id: `ca:${ev.a}:${ev.b}:${ev.tca}`,
      a: { catalogId: ev.a, name: ev.aName }, b: { catalogId: ev.b, name: ev.bName },
      tcaMs: ev.tcaMs, tca: ev.tca,
      missKm: Number.isFinite(ev.missM) ? ev.missM / 1000 : null,
      pcStatus: ev.pcStatus || 'NOT_COMPUTED',
      status: 'MONITORING',
      timeToTcaMin: Number.isFinite(ev.tcaMs) ? (ev.tcaMs - nowMs) / 60_000 : null,
      source: 'AETHERUS P4 screening (server) · ADVISORY_ONLY',
    }))
    .sort((x, y) => (x.tcaMs ?? Infinity) - (y.tcaMs ?? Infinity));
}

/* ── 임무 타임라인 (§13·§16) ─────────────────────────────────────────── */
/**
 * 위성 하나의 임무 단계. 자료가 있는 단계만 known=true. 없는 단계는 "자료 없음"으로 남긴다 —
 * 지시서: "실제 이벤트 데이터가 없으면 임의 이벤트를 사실처럼 표시하지 말 것".
 */
export function missionTimeline(obj, ctx = {}) {
  const m = obj.meta || {};
  const el = obj.elements;
  const steps = [];
  const cls = el ? orbitClass(el.perigeeKm, el.incDeg, el.periodMin) : null;
  steps.push({ key: 'LAUNCH', known: !!m.launchDate, at: m.launchDate || null,
    note: m.launchDate ? [m.launchSite, m.owner].filter(Boolean).join(' · ') : null, source: m.launchDate ? 'SATCAT' : null });
  steps.push({ key: 'ASCENT', known: false });
  steps.push({ key: 'STAGE SEPARATION', known: false });
  steps.push({ key: 'ORBIT INSERTION', known: false });
  steps.push({ key: 'ORBIT RAISING', known: false });
  steps.push({ key: 'FINAL ORBIT', known: !!el, at: el?.epochMs != null ? new Date(el.epochMs).toISOString() : null,
    note: el ? `${cls?.code || ''} · ${Math.round(el.perigeeKm)}–${Math.round(el.apogeeKm)} km · ${el.incDeg.toFixed(1)}°` : null,
    source: el ? obj.source.provider : null, epochIsProxy: true });
  const ca = ctx.closeApproaches || [];
  steps.push({ key: 'CLOSE APPROACHES', known: ca.length > 0, count: ca.length, items: ca.slice(0, 5),
    source: ca.length ? ca[0].source : null });
  const status = m.opsKo || m.opsEn || m.status || null;
  steps.push({ key: 'CURRENT STATUS', known: !!status, note: status, source: status ? (m.opsKo || m.opsEn ? 'SATCAT' : 'AETHERUS') : null });
  return steps;
}

/**
 * 발사 이벤트 방(§11)의 단계 타임라인. 실제 단계 시각은 어느 출처도 주지 않는다(LL2 는 NET·상태만).
 * → 전부 mock=true 로 표시하고, 화면은 이것을 "예시(MOCK)" 로만 그린다.
 */
export function launchEventTimeline(launchObj) {
  const m = launchObj.meta || {};
  const known = [{ key: 'LIFTOFF (NET)', tPlusSec: 0, known: true, at: m.net, source: 'Launch Library 2' }];
  const mock = [
    { key: 'MAX-Q', tPlusSec: 72 }, { key: 'STAGE SEPARATION', tPlusSec: 150 },
    { key: 'SECOND STAGE IGNITION', tPlusSec: 160 }, { key: 'FAIRING SEPARATION', tPlusSec: 200 },
    { key: 'ORBIT INSERTION', tPlusSec: 540 }, { key: 'PAYLOAD DEPLOYMENT', tPlusSec: 960 },
  ].map(x => ({ ...x, known: false, mock: true }));
  return { known, mock, mockNote: 'GENERIC EXAMPLE — not this launch\'s actual event times' };
}

/* ── 통과 예보 (FOR ME 연결점, §27) ─────────────────────────────────────── */
/** 관측자(lat,lon,altKm) 위를 지나는 시간창 — elevation ≥ minEl. 24h, 30초 표본. */
export function passesOver(rec, observer, fromMs, hours = 24, minElDeg = 10, stepSec = 30) {
  const S = sat();
  if (!S || !rec || !observer) return [];
  const obs = { latitude: observer.lat * D2R, longitude: observer.lon * D2R, height: (observer.altKm || 0) };
  const out = [];
  let cur = null;
  for (let t = fromMs; t <= fromMs + hours * 3600_000; t += stepSec * 1000) {
    const date = new Date(t);
    const pv = propagateTEME(rec, date);
    if (!pv) continue;
    const gmst = S.gstime(date);
    const ecf = S.eciToEcf(pv.r, gmst);
    const look = S.ecfToLookAngles(obs, ecf);
    const el = look.elevation * R2D;
    if (el >= minElDeg) {
      if (!cur) cur = { startMs: t, maxEl: el, maxAtMs: t, azStart: look.azimuth * R2D };
      if (el > cur.maxEl) { cur.maxEl = el; cur.maxAtMs = t; }
      cur.endMs = t; cur.azEnd = look.azimuth * R2D;
    } else if (cur) { out.push(cur); cur = null; }
  }
  if (cur) out.push(cur);
  return out;
}

/* ── KPI (§4) — 실제로 받은 자료의 개수만 ───────────────────────────────── */
export function kpis(ctx) {
  const sats = ctx.sats || [];
  const aeth = ctx.aeth || [];
  const rocketDebris = aeth.filter(o => o.kind === KIND.ROCKET_BODY || o.kind === KIND.FRAGMENT || o.kind === KIND.DEBRIS).length
    + sats.filter(o => o.kind === KIND.ROCKET_BODY || o.kind === KIND.FRAGMENT || o.kind === KIND.DEBRIS).length;
  const now = ctx.nowMs || Date.now();
  const launches24h = (ctx.launches || []).filter(l => {
    const h = l.meta?.hoursOut; return h != null && h >= -24 && h <= 24;
  }).length;
  return {
    tracked: { value: (ctx.catalogTotal ?? null), note: 'catalog' },        // 카탈로그가 아는 전체(위성 그룹 합)
    active: { value: sats.length ? sats.length : null, total: ctx.satsTotal ?? null },
    rocketDebris: { value: aeth.length || sats.length ? rocketDebris : null, aethTotal: ctx.aethTotal ?? null },
    events: { value: ctx.conjunctions != null ? ctx.conjunctions : null },
    launches: { value: (ctx.launches || []).length ? launches24h : null, in24h: launches24h },
    at: now,
  };
}

/* ── 검색 (§23) ─────────────────────────────────────────────────────────── */
export function search(q, ctx, limit = 8) {
  const s = String(q || '').trim();
  if (!s) return { satellites: [], launches: [], debris: [], events: [], dates: [] };
  const low = s.toLowerCase();
  const hit = o => (o.name || '').toLowerCase().includes(low) || (o.noradId && o.noradId === s) || (o.cospar || '').toLowerCase() === low;
  const dates = /^\d{4}-\d{2}-\d{2}/.test(s) && Number.isFinite(Date.parse(s)) ? [{ iso: s, ms: Date.parse(s) }] : [];
  return {
    satellites: (ctx.sats || []).filter(o => hit(o) && o.kind !== KIND.DEBRIS && o.kind !== KIND.FRAGMENT && o.kind !== KIND.ROCKET_BODY).slice(0, limit),
    launches: (ctx.launches || []).filter(o => (o.name || '').toLowerCase().includes(low) || (o.meta?.mission || '').toLowerCase().includes(low)).slice(0, limit),
    debris: [...(ctx.sats || []), ...(ctx.aeth || [])].filter(o => hit(o) && (o.kind === KIND.DEBRIS || o.kind === KIND.FRAGMENT || o.kind === KIND.ROCKET_BODY)).slice(0, limit),
    events: (ctx.closeApproaches || []).filter(ev => (ev.a.name || '').toLowerCase().includes(low) || (ev.b.name || '').toLowerCase().includes(low)).slice(0, limit),
    dates,
  };
}

/* ── ARCHIVE 스냅샷(§20) — 현재 상태는 덮어쓰고, 기록은 쌓는다 ───────────── */
export const SNAPSHOT_KEY = 'earthus.spaceops.snapshots.v1';
export const SNAPSHOT_MAX = 96;                 // 15분 간격 24시간

export function readSnapshots(storage) {
  try { const a = JSON.parse(storage.getItem(SNAPSHOT_KEY) || '[]'); return Array.isArray(a) ? a : []; }
  catch (_) { return []; }
}

/** 마지막 기록과 minGapMs 미만이면 기록하지 않는다(중복 방지). 기록했으면 true. */
export function recordSnapshot(storage, snap, minGapMs = 14 * 60_000) {
  const list = readSnapshots(storage);
  const last = list[list.length - 1];
  if (last && snap.at - last.at < minGapMs) return false;
  list.push(snap);
  while (list.length > SNAPSHOT_MAX) list.shift();
  try { storage.setItem(SNAPSHOT_KEY, JSON.stringify(list)); } catch (_) { return false; }
  return true;
}

/* ── 저장한 발사 — ui-launchops.js 와 같은 키를 읽는다(호환) ─────────────── */
export const SAVED_LAUNCH_KEY = 'earthus.launch.saved';
export function readSavedLaunches(storage) {
  try { return JSON.parse(storage.getItem(SAVED_LAUNCH_KEY) || '[]'); } catch (_) { return []; }
}

/* ── 형식 도우미 ─────────────────────────────────────────────────────── */
export function fmtKst(ms, withSec = false) {
  if (!Number.isFinite(ms)) return '—';
  const d = new Date(ms);
  const p = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Seoul', year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', second: withSec ? '2-digit' : undefined, hourCycle: 'h23' })
    .formatToParts(d).reduce((o, x) => (o[x.type] = x.value, o), {});
  return `${p.year}-${p.month}-${p.day} ${p.hour}:${p.minute}${withSec ? ':' + p.second : ''} KST`;
}

export function fmtTPlus(sec) {
  const s = Math.max(0, Math.round(sec));
  const h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60), r = s % 60;
  return (h ? `T+${String(h).padStart(2, '0')}:` : 'T+') + `${String(m).padStart(2, '0')}:${String(r).padStart(2, '0')}`;
}

export function fmtAge(ms, ko = true) {
  if (!Number.isFinite(ms)) return '—';
  const s = Math.max(0, ms / 1000);
  if (s < 90) return ko ? `${Math.round(s)}초 전` : `${Math.round(s)}s ago`;
  if (s < 5400) return ko ? `${Math.round(s / 60)}분 전` : `${Math.round(s / 60)}m ago`;
  if (s < 172800) return ko ? `${Math.round(s / 3600)}시간 전` : `${Math.round(s / 3600)}h ago`;
  return ko ? `${Math.round(s / 86400)}일 전` : `${Math.round(s / 86400)}d ago`;
}

export function fmtLatLon(lat, lon) {
  if (!Number.isFinite(lat) || !Number.isFinite(lon)) return '—';
  return `${Math.abs(lat).toFixed(1)}° ${lat >= 0 ? 'N' : 'S'} · ${Math.abs(lon).toFixed(1)}° ${lon >= 0 ? 'E' : 'W'}`;
}
