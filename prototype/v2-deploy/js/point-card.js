// 지점 카드 — 색면 현상(기온 등)을 고른 채 지구를 누르면 뜨는 **한 장**.
//
// ── 왜 생겼나 (2026-09-23 PD) ────────────────────────────────────────────────────────────────────────────
//   "기온 들어가면 지구가 색으로 바뀌는데 거기서 지역을 누르면 그때 창이 뜨면서 안내해주잖아 그때 인텔리전스 기능이
//    나와야 맞지" · "버튼 누르면 다른 안내화면 나오지 말고".
//   폰(402×714)에서 기온을 켜고 지구를 누르면 시트 half(≈221 px)의 절반 이상을 탭 두 줄(사건·내 지역·선택 자료·
//   자료의 근거)이 먹었고, 남은 칸에는 '궁금한 점' 질문이 먼저 섰다. 누른 자리의 기온은 카드 한가운데 한 줄이었다.
//   바다를 누르면 marineSelect 가 선택 현상을 지워 **파도 카드**가 떴다(기온을 골랐는데). 육지를 누르면 국가 선택이
//   인구 조각·지표 팝업·카메라 이동을 한꺼번에 일으켰다.
//   그래서 누른 순간의 창을 **Intelligence 한 장**으로 세운다 — 콘셉트 12(값 → 평년 대비 → 출처 → 해석 → 자세히)의 순서:
//     ① 고른 현상의 값(크게) + 평년 비교  ② 출처(관측 · 모델 런)  ③ 왜  ④ 앞으로 5일(+ 확률)  ⑤ [모델 비교] [시뮬레이션]
//
// ── 규칙 ────────────────────────────────────────────────────────────────────────────────────────────────
//   · 지어내지 않는다. 재료가 없는 절은 **그 자리에서 이유 한 줄**로 말한다(다른 화면으로 보내지 않는다 · 숨겨서
//     없는 척하지도 않는다 — AGENTS.md '입구는 같은 자리에 두고 없는 이유를 말한다').
//   · 값은 화면에 칠해진 것과 **같은 GFS 프레임**에서 읽는다(point-readout.js 머리말 — 두 말 금지). 새 원천·새 계산 없음.
//   · 관측은 25 km 안 · 신선한 것 · 타임라인이 '지금'일 때만 크게 쓴다(격자 vs 실측 규칙 — 0.5° 칸은 도시 값이 못 된다).
//   · 평년 비교는 뺄셈을 새로 하지 않는다: ⓐ kma-aws.json 의 평년차 패킷(어제 하루 평균 − 평년, 서버가 셈) ⓑ 평년
//     최고·최저를 **나란히** 적는다. 한 시각의 기온 − 하루 평균 평년은 하루 온도 변화가 섞인다(live-layers.js:1959).
//   · 인과 금지어(aws/_shared/contracts/intel-vocab.json FORBIDDEN_CAUSAL)를 이 파일의 글에 쓰지 않는다 —
//     원인 문장은 근거가 실린 패킷이 줄 때만 나온다(§C-2 개정 전까지는 intel-strip 의 절 그대로).
//   · 값은 **지금 켜진 색면 객체**(field-layer.js FieldLayer)에서 읽는다 — 정적 표(FIELD_DESCRIPTORS)나 공용 저장소를
//     따로 읽으면 안 된다. ⚠️ 2026-09-23 반박 검증: 강수를 3시간/24시간 누적으로 칠하는 중에 카드가 공용 GFS 'precip'
//     (강수율 mm/h)을 읽어, 지구는 누적 mm 인데 카드는 mm/h 를 말했다(precip-accum.js 가 layer.desc·frames 를 갈아 끼운다).
//     색면 객체의 sampleAt 은 예보 범위 밖·바다 마스크도 화면과 같게 판정한다.
//   · 이 파일은 DOM 을 모른다. 색면 객체·프레임 저장소·지상관측 저장소·fetch 는 부른 쪽이 넣는다(시험이 가짜를 넣는다).

import { FIELD_DESCRIPTORS, readoutOf, sourceLabel, timeMeta, cellLabel } from './field-layer.js?v=4-fc0924';
import { scaleOf } from './field-scales.js?v=1';
import { readTicks } from './field-log.js?v=1';
import { normalizeSurfaceObs, obsFresh, fmt1, kstLabel } from './obs-labels.js?v=1';
import { kmBetween } from './for-me-signal.js?v=3-fc0924';
import { POINT_BASE } from './point-readout.js?v=5-fc0924';
import { forecastNoticeHtml, isForecastAt } from './forecast-notice.js?v=1';

export const POINT_OBS_MAX_KM = 25;          // 격자 vs 실측 — 25 km 안의 관측만 그 자리 값으로 쓴다
export const POINT_DAY_HOUR_UTC = 6;         // 매일 15시 KST(= 06Z). 런이 00/06/12/18Z · 3시간 스텝이라 늘 정시 한 장에 맞는다
export const POINT_DAYS = 5;
export const KMA_NORMAL_PATH = '/wind/kma-normal.json';

const plainEsc = (s) => String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const WD_KO = ['일', '월', '화', '수', '목', '금', '토'];
const WD_EN = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

export const fmtPlace = (lat, lon) => `${lat >= 0 ? 'N' : 'S'}${Math.abs(lat).toFixed(2)}° ${lon >= 0 ? 'E' : 'W'}${Math.abs(lon).toFixed(2)}°`;

/** 부호를 붙인 편차 — 음수 부호는 U+2212(obs-labels fmt1 과 같은 글꼴 규칙). */
export const fmtDelta = (v) => {
  if (!Number.isFinite(v)) return '';
  const s = fmt1(Math.abs(v));
  if (s === '0.0') return '±0.0';
  return `${v > 0 ? '+' : '−'}${s}`;
};

/** 한국 날짜(월·일) → 2000년(윤년) 달력의 칸. kma-normal.json 이 2020 윤년 366칸이라 2월 29일이 늘 60번째다(live-layers.js:1913). */
export const kstLeapIndex = (ms) => {
  const k = new Date(ms + 9 * 3600e3);
  return Math.round((Date.UTC(2000, k.getUTCMonth(), k.getUTCDate()) - Date.UTC(2000, 0, 1)) / 864e5);
};

/** 가장 가까운 관측 — 기온이 있고 · 신선하고 · maxKm 안인 것 하나. 없으면 null(없다는 것 자체가 사실이다). */
export function nearestObs(sites, lat, lon, { maxKm = POINT_OBS_MAX_KM, nowMs = Date.now() } = {}) {
  let best = null;
  let bd = Infinity;
  for (const s of sites || []) {
    if (typeof s.temp !== 'number' || !Number.isFinite(s.temp)) continue;
    if (!obsFresh(s.obsMs, s.src, nowMs)) continue;
    const d = kmBetween({ lat, lon }, s);
    if (d <= maxKm && d < bd) { bd = d; best = s; }
  }
  return best ? { site: best, km: bd } : null;
}

/** 평년차 패킷(kma-aws.json 의 intel · 서버가 '어제 하루 평균 − 그날 평년'을 셈)에서 그 지점 줄. 없으면 null. */
export function anomalyFor(awsDoc, stationId) {
  const pk = awsDoc && awsDoc.intel;
  if (!pk || pk.schema !== 1 || !pk.anomaly || !Array.isArray(pk.anomaly.items)) return null;
  const it = pk.anomaly.items.find((x) => String(x.stationId) === String(stationId));
  if (!it || !Number.isFinite(it.delta) || !Number.isFinite(it.value)) return null;
  return { value: it.value, delta: it.delta, baseline: it.baseline, at: it.at || '', period: (pk.anomaly.baseline && pk.anomaly.baseline.period) || '' };
}

/** 평년값(1991–2020) 오늘 칸 — [평균, 최고, 최저, 강수]. 없으면 null. */
export function normalFor(normalDoc, stationId, nowMs) {
  const rows = normalDoc && normalDoc.normals && normalDoc.normals[String(stationId)];
  const rec = rows && rows[kstLeapIndex(nowMs)];
  if (!rec || !Number.isFinite(rec[1]) || !Number.isFinite(rec[2])) return null;
  return { tmax: rec[1], tmin: rec[2], period: normalDoc.period || '1991-2020' };
}

/**
 * 지금 타임라인 시각의 값 — **켜진 색면 객체**에서(화면에 칠한 것과 같은 desc·frames·눈금). 네트워크 0건.
 * → { r, info, tMs, desc, missing } · missing = 프레임이 아직 캐시에 없다(부른 쪽이 받아 두고 다시 그린다).
 */
export function readPointNow({ field, lat, lon, ko = true }) {
  if (!field || !field.desc) return null;
  const info = field.frames && field.frames.info ? field.frames.info() : null;
  let s = null;
  try { s = field.sampleAt(lat, lon); } catch (e) { s = null; }
  const r = readoutOf(s, { scale: field.scale, mode: field.desc.mode, resolutionDeg: info && info.resolutionDeg,
    zeroText: field.desc.zeroText, cellWord: field.cellWord ? field.cellWord(info) : (field.desc.cellWord || null), ko });
  const tMs = field.timeBus && field.timeBus.validMs ? field.timeBus.validMs() : NaN;
  return { r, info, tMs, desc: field.desc, missing: !s };
}

/**
 * 앞으로 5일 — 매일 15시(KST) 한 장씩. ensure 바로 뒤에 sampleAt(폰 LRU 가 작아 둘 사이를 벌리지 않는다).
 * 런의 끝(+120 h)을 넘는 날은 목록에 없다 — 끝 프레임 값을 그날 값이라 말하지 않는다(gfs-frames.js:47). lastT 로 그 끝을 알린다.
 */
export async function loadPointDays({ frames, fieldId, lat, lon, nowMs = Date.now(), hourUtc = POINT_DAY_HOUR_UTC, days = POINT_DAYS }) {
  if (!frames.loaded) await frames.load();
  if (!frames.has(fieldId)) return { ok: false, days: [] };
  const all = frames.framesFor(fieldId);
  const list = all.filter((f) => new Date(f.t).getUTCHours() === hourUtc && f.t > nowMs).slice(0, days);
  const spec = frames.fieldSpec(fieldId);
  const out = [];
  for (const f of list) {
    await frames.ensure(fieldId, f.t);
    const s = frames.sampleAt(fieldId, f.t, lat, lon);
    if (s && spec && spec.channels) Object.assign(s, readTicks(spec.channels[0]));
    out.push({ t: f.t, sample: s });
  }
  return { ok: true, days: out, info: frames.info(), lastT: all.length ? all[all.length - 1].t : NaN };
}

/** 우리 S3 에서 JSON 하나 — 시간이 다 되면 요청을 끊는다(live-layers.js fetchJson 과 같은 규칙: 끊지 않으면 뒤에서 계속 받는다). */
export const fetchPointJson = (path, timeoutMs = 30000, base = POINT_BASE) => {
  const AC = globalThis.AbortController;
  const ctl = typeof AC === 'function' ? new AC() : null;
  const timer = ctl && typeof setTimeout === 'function' ? setTimeout(() => ctl.abort(), timeoutMs) : null;
  return fetch(`${base}${path}`, { cache: 'no-store', ...(ctl ? { signal: ctl.signal } : {}) })
    .then((r) => { if (!r.ok) throw new Error(`${path} HTTP ${r.status}`); return r.json(); })
    .finally(() => { if (timer != null) clearTimeout(timer); });
};

let normalDocP = null;
/** kma-normal.json(약 600 KB) — 한 번만 받는다. 실패는 캐시하지 않는다(point-readout.js:200 — 못 받은 것이 '없다'로 읽히면 안 된다). */
const loadNormalDoc = (fetchJson) => {
  if (!normalDocP) normalDocP = fetchJson(KMA_NORMAL_PATH, 30000).catch((e) => { normalDocP = null; throw e; });
  return normalDocP;
};

/**
 * 근처 관측 + 평년차 패킷. station 을 주면(지구 위 OBS 숫자를 눌렀다) 그 지점을 그대로 쓴다.
 * ⚠️ 평년 문서(600 KB)를 여기서 기다리지 않는다 — 반박 검증: 관측값이 평년 문서 뒤로 밀려 느린 회선에서 수 초~30초
 *    '찾는 중'이었다. 평년은 loadPointNormal 로 따로 받는다.
 * obsFailed — 문서를 **못 받은 것**과 25 km 안에 **없는 것**을 가른다(surfaceObs.both 는 실패해도 null 로 준다).
 */
export async function loadPointObs({ surfaceObs, lat, lon, station = null, nowMs = Date.now() }) {
  const docs = await surfaceObs.both();
  const norm = normalizeSurfaceObs(docs);
  let near = null;
  if (station && typeof station.temp === 'number') {
    near = { site: station, km: kmBetween({ lat, lon }, station) };
  } else {
    near = nearestObs(norm.sites, lat, lon, { nowMs });
  }
  return {
    obs: near,
    obsSource: near ? ((norm.docs[near.site.src] || {}).sourceKo || near.site.src) : null,
    anom: near && near.site.src === 'KMA' ? anomalyFor(docs.aws, near.site.id) : null,
    obsFailed: { KMA: !docs.aws, GTS: !docs.gts },
  };
}

/** 그 지점의 오늘 평년. doc 을 주면(평년차 레이어가 이미 받아 둔 문서) 다시 받지 않는다. 지점이 문서에 없으면 null. */
export async function loadPointNormal({ fetchJson = fetchPointJson, stationId, nowMs = Date.now(), doc = null }) {
  return normalFor(doc || await loadNormalDoc(fetchJson), stationId, nowMs);
}

/** 빈 절의 이유 한 줄 — 누르지 않아도 그 자리에 있다. */
const whyLine = (t) => `<p class="pc-why">${t}</p>`;
const REF7_KO = '서울·부산·울산·광주·대전·강릉·제주';

/** 'YYYY-MM-DD' 가 든 글에서 'M/D' — 패킷이 셈한 날을 그대로 적는다('어제'로 고정하면 자정 직후 그저께를 어제라 부른다). */
const dayOf = (at) => {
  const m = /(\d{4})-(\d{2})-(\d{2})/.exec(String(at || ''));
  return m ? `${Number(m[2])}/${Number(m[3])}` : null;
};

/**
 * 카드 HTML. pc = main.js 의 pointCard 상태, now = readPointNow 결과, key = 같은 카드인지(재생 중 제자리 갱신용).
 * intelWhy · intelNext = 그 현상의 패킷이 있으면 WHY · NEXT 절(intel-strip intelSectionHtml) — 없으면 ''.
 * accum = 강수 누적 모드(날짜별 값은 강수율 저장소라 적지 않는다).
 */
export function pointCardHtml({ pc, now = null, key = '', isNow = true, intelWhy = '', intelNext = '', capabilities = {}, accum = false, ko = true, esc = plainEsc, nowMs = Date.now() }) {
  const desc = (now && now.desc) || FIELD_DESCRIPTORS[pc.fid];
  if (!desc) return '';
  const q = desc.quantity ? desc.quantity[ko ? 'ko' : 'en'] : '';
  const isTemp = pc.fid === 'tempgrid';
  const obsOk = !!(isTemp && isNow && pc.obs && pc.obs.site);
  const live = [];
  const rest = [];

  // ① 값 — 25 km 안 관측이 있으면 관측이 크게, 아니면 모델 칸값이 크게(물결표 · '도시 값이 아니다').
  live.push(`<div class="pc-kicker">${esc(desc.title ? desc.title[ko ? 'ko' : 'en'] : q)} · ${esc(fmtPlace(pc.lat, pc.lon))}</div>`);
  if (obsOk) {
    const s = pc.obs.site;
    live.push(`<div class="pc-value"><b class="pc-big">${esc(fmt1(s.temp))}<small> °C</small></b>`
      + `<span class="pc-tag">${ko ? '관측' : 'Observed'}</span></div>`);
  } else if (now && now.r.ok) {
    live.push(`<div class="pc-value"><b class="pc-big">${esc(now.r.text)}</b><span class="pc-tag">${ko ? '모델 칸값' : 'Model cell'}</span></div>`);
  } else {
    live.push(`<div class="pc-value"><b class="pc-big pc-none">—</b></div><p class="pc-why">${esc(now ? now.r.text : (ko ? '이 자리의 값을 읽지 못했습니다' : 'No value could be read here'))}</p>`);
  }

  // 평년 비교 — 관측이 크게 선 때만(그 관측소의 것이다). 뺄셈은 서버 패킷만, 오늘 평년 최고·최저는 나란히.
  //   ⚠️ 반박 검증: 타임라인을 +4일로 옮겨도 '어제 평균 − 평년'·'오늘 평년'이 4일 뒤 모델값 바로 밑에 남아
  //      그 값의 평년 비교처럼 읽혔다. 그래서 obsOk(= 지금 · 25 km 안 관측) 일 때만 적는다.
  const srcNotes = [];
  if (obsOk) {
    const rows = [];
    if (pc.anom) {
      const d = dayOf(pc.anom.at);
      const per = pc.anom.period ? ` (${ko ? '평년' : 'normal'} ${pc.anom.period})` : '';
      rows.push(ko
        ? `${d ? `${d} ` : ''}하루 평균 ${esc(fmt1(pc.anom.value))}° · 평년보다 <b class="${pc.anom.delta >= 0 ? 'pc-warm' : 'pc-cool'}">${esc(fmtDelta(pc.anom.delta))}°</b>${esc(per)}`
        : `${d ? `${d} ` : ''}daily mean ${esc(fmt1(pc.anom.value))}° · <b class="${pc.anom.delta >= 0 ? 'pc-warm' : 'pc-cool'}">${esc(fmtDelta(pc.anom.delta))}°</b> vs normal${esc(per)}`);
    }
    if (pc.normal) {
      rows.push(ko
        ? `오늘 평년(${esc(pc.normal.period)}) 최고 ${esc(fmt1(pc.normal.tmax))}° · 최저 ${esc(fmt1(pc.normal.tmin))}°`
        : `Normal for today (${esc(pc.normal.period)}): high ${esc(fmt1(pc.normal.tmax))}° · low ${esc(fmt1(pc.normal.tmin))}°`);
    }
    if (rows.length) live.push(`<div class="pc-normal">${rows.join('<br/>')}</div>`);
    // 빠진 줄마다 그 경우의 이유 — 하나의 문장으로 뭉뚱그리면 거짓이 된다(대구 143: 기상청 지점인데 평년 문서에 없다).
    const s = pc.obs.site;
    if (s.src !== 'KMA') srcNotes.push(ko ? '평년 비교는 한국 기상청 지점이 25 km 안에 있을 때만 적습니다' : 'A normal is shown only within 25 km of a KMA station');
    else if (pc.normalLoading) srcNotes.push(ko ? '평년값을 받는 중…' : 'Loading the normals…');
    else if (pc.normalMiss) srcNotes.push(ko ? '평년값 문서를 받지 못했습니다 — 평년 비교를 적지 않습니다' : 'Could not load the normals — no comparison is given');
    else {
      if (pc.normalChecked && !pc.normal) srcNotes.push(ko ? `${s.name || s.id} 지점은 기상청 평년값 문서에 없습니다` : `Station ${s.name || s.id} has no published normal`);
      if (!pc.anom) srcNotes.push(ko ? `'평년보다 ±'는 기상청 기준 7개 지점(${REF7_KO})만 셉니다` : "The '± vs normal' line is computed for seven KMA reference stations only");
    }
  } else if (isTemp && !isNow) {
    srcNotes.push(ko ? '평년 비교는 지금 시각에만 적습니다' : 'The normal comparison is shown at the present time only');
  } else if (isTemp && !pc.obsLoading) {
    srcNotes.push(ko ? '평년 비교는 한국 기상청 지점이 25 km 안에 있을 때만 적습니다' : 'A normal is shown only within 25 km of a KMA station');
  }

  // ② 출처 — 관측 줄과 모델 줄을 따로.
  const src = [];
  if (isTemp) {
    const failed = pc.obsFailed && (pc.obsFailed.KMA || pc.obsFailed.GTS);
    if (!isNow) src.push(ko ? '관측 · 타임라인이 지금이 아니라 관측을 섞지 않습니다' : 'Observation · hidden — the timeline is not at now');
    else if (pc.obsLoading) src.push(ko ? '관측 · 가까운 관측소를 찾는 중…' : 'Observation · looking for a station…');
    else if (obsOk) {
      const s = pc.obs.site;
      // 관측소를 직접 눌렀으면(0 km) 거리를 적지 않는다
      src.push(`${ko ? '관측' : 'Observed'} · ${esc(pc.obsSource || s.src)} ${esc(s.name || '')} · ${esc(kstLabel(s.obsMs))}${pc.obs.km >= 1 ? ` · ${esc(Math.round(pc.obs.km))} km` : ''}`);
    } else if (failed) {
      // 못 받은 것을 '없다'로 적지 않는다(point-readout.js:200 과 같은 규칙).
      const which = [pc.obsFailed.KMA ? (ko ? '기상청' : 'KMA') : '', pc.obsFailed.GTS ? 'GTS' : ''].filter(Boolean).join('·');
      src.push(ko ? `관측 · 관측 문서(${which})를 받지 못했습니다 — 모델 칸값만` : `Observation · could not load the ${which} feed — model cell only`);
    } else src.push(ko ? `관측 · ${POINT_OBS_MAX_KM} km 안에 최근 관측소가 없습니다 — 모델 칸값만` : `Observation · no recent station within ${POINT_OBS_MAX_KM} km — model cell only`);
  }
  if (now) {
    // sourceLabel 이 이미 'MODEL · NOAA GFS 0.5°' 라고 말한다 — 앞에 '모델'을 또 붙이지 않는다. 칸값은 큰 숫자가 관측일 때만 따로 적는다.
    const meta = [sourceLabel(now.info), ...timeMeta(now.info, now.tMs, ko)].join(' · ');
    const cell = obsOk && now.r.ok ? (ko ? ` · 이 칸 ${now.r.text}` : ` · this cell ${now.r.text}`) : '';
    src.push(`${esc(meta)}${esc(cell)}`);
    // (2026-09-24 · 기상법 §17 · PD (나)) 타임라인이 앞(예보)이면 큰 숫자는 모델 **예보**다 — 출처 줄 바로 밑에 고정 문구(js/forecast-notice.js).
    //   '지금'·과거 프레임·관측이 크게 선 때는 붙이지 않는다. 한 시각짜리 자료(info.single)는 예보가 없다.
    if (!obsOk && now.r.ok && !(now.info && now.info.single) && isForecastAt(now.tMs, nowMs)) {
      src.push(forecastNoticeHtml({ model: now.info && now.info.model, run: now.info && (now.info.run || now.info.runMs), ko, esc }));
    }
    src.push(esc(ko ? `${cellLabel(now.info && now.info.resolutionDeg, true)} 값 — 도시·지점의 관측값이 아닙니다` : `${cellLabel(now.info && now.info.resolutionDeg, false)} value — not a city or station observation`));
  }
  src.push(...srcNotes.map(esc));
  if (src.length) live.push(`<div class="pc-src">${src.join('<br/>')}</div>`);

  // ③ 왜 — 패킷이 있으면 그 절, 없으면 이유 한 줄.
  rest.push(`<div class="pc-sec"><h4>${ko ? `왜 이런 ${esc(q)}인가` : `Why this ${esc(q.toLowerCase())}`}</h4>${intelWhy
    || whyLine(ko ? '이 현상에는 아직 해석 자료(같은 때·같은 자리의 측정 조건과 그 근거)가 실려 있지 않습니다 — 근거 없는 원인 문장은 쓰지 않습니다.'
      : 'No interpretation packet (measured conditions with their evidence) exists for this phenomenon yet — no cause is stated without evidence.')}</div>`);

  // ④ 앞으로 5일 — 모델 예보(모델 이름·런과 함께) + 확률 줄.
  const days = [];
  if (intelNext) days.push(intelNext);   // 기관 예보 등 패킷의 NEXT 절이 있으면 모델 값보다 먼저
  if (desc.source) {
    days.push(whyLine(ko ? '이 자료는 지금 한 장뿐이라 날짜별 예보 값이 없습니다.' : 'This dataset is a single present-time snapshot — no daily forecast values.'));
  } else if (accum) {
    days.push(whyLine(ko ? '누적 강수로 칠하는 중에는 날짜별 값을 적지 않습니다 — 강수율로 돌리면 매일 15시 값이 나옵니다.' : 'Daily values are not shown while an accumulation is painted — switch back to rate to see them.'));
  } else if (pc.daysLoading) {
    days.push(whyLine(ko ? '5일 값을 읽는 중…' : 'Reading the next five days…'));
  } else if (pc.days && pc.days.ok && pc.days.days.length) {
    const scale = scaleOf(desc.scaleId);
    const info = pc.days.info;
    const cells = pc.days.days.map((d) => {
      const r = readoutOf(d.sample, { scale, mode: desc.mode, resolutionDeg: info && info.resolutionDeg, zeroText: desc.zeroText, cellWord: desc.cellWord || null, ko });
      const k = new Date(d.t + 9 * 3600e3);
      const label = ko ? `${k.getUTCMonth() + 1}/${k.getUTCDate()}(${WD_KO[k.getUTCDay()]})` : `${WD_EN[k.getUTCDay()]} ${k.getUTCDate()}`;
      // 물결표를 떼지 않는다 — 모델 칸값이 관측값 바로 밑에서 그 지점의 예보처럼 읽히면 안 된다(격자 vs 실측 규칙).
      return `<div class="pc-day"><span>${esc(label)}</span><i style="background:${r.ok && r.color ? r.color : 'transparent'}"></i><b>${esc(r.ok ? r.text : '—')}</b></div>`;
    }).join('');
    days.push(`<div class="pc-days">${cells}</div>`);
    days.push(`<div class="pc-src">${esc(ko ? `매일 15시(KST) 모델값 · ${[sourceLabel(info), ...timeMeta(info, NaN, true)].join(' · ')}`
      : `Model value at 15:00 KST each day · ${[sourceLabel(info), ...timeMeta(info, NaN, false)].join(' · ')}`)}</div>`);
    // (2026-09-24 · 기상법 §17 · PD (나)) 이 줄의 날짜들은 전부 앞날(loadPointDays 가 f.t > 지금만 고른다) — 모델 예보다. 같은 절 안에 고정 문구.
    days.push(forecastNoticeHtml({ model: info && info.model, run: info && (info.run || info.runMs), ko, esc, tag: 'div' }));
    if (pc.days.days.length < POINT_DAYS && Number.isFinite(pc.days.lastT)) {
      const e = new Date(pc.days.lastT + 9 * 3600e3);
      const endK = `${e.getUTCMonth() + 1}/${e.getUTCDate()} ${String(e.getUTCHours()).padStart(2, '0')}:00 KST`;
      days.push(whyLine(ko ? `이 런의 예보는 ${endK}까지라 그 뒤 날짜는 적지 않습니다.` : `This run ends at ${endK} — later days are not shown.`));
    }
  } else {
    days.push(whyLine(ko ? '예보 프레임을 받지 못했습니다 — 날짜별 값을 적지 않습니다.' : 'Forecast frames could not be loaded — no daily values.'));
  }
  days.push(whyLine(ko ? '확률(%)은 앙상블(여러 모델 실행)에서 센 비율로만 적습니다 — 이 현상에는 앙상블 자료가 아직 연결되지 않았습니다.'
    : 'Probabilities (%) are stated only as counts from an ensemble — no ensemble is connected for this phenomenon yet.'));
  rest.push(`<div class="pc-sec"><h4>${ko ? '앞으로 5일' : 'Next 5 days'}</h4>${days.join('')}</div>`);

  // ⑤ 입구 — 같은 자리에 두고, 없으면 누른 자리 아래에 이유(ui-shell 의 sim-why).
  //   '표시 설정' — 이 색면의 조작(등치선·간격·강수 누적·H/L)이 있는 카드로. 메뉴에서 고를 때 시트를 열지 않게 되면서
  //   그 조작에 닿는 길이 이 단추다(반박 검증 — 없으면 폰에서 누적 기간을 고를 수 없었다).
  const btns = [];
  if (!desc.source && !accum) btns.push(`<button type="button" data-action="shell-play5d">${ko ? '5일 재생 ▶' : 'Play 5 days ▶'}</button>`);
  const cmpWhy = desc.source
    ? (ko ? `${q}에는 이 카드와 나란히 비교할 다른 자료가 아직 연결되지 않았습니다.` : `No second dataset is connected to compare ${q.toLowerCase()} against yet.`)
    : (ko ? `${q} 모델 비교 화면은 아직 연결되지 않았습니다 — 지금 값은 GFS 한 모델입니다.` : `Model comparison is not connected for ${q.toLowerCase()} yet — the values above are from GFS alone.`);
  btns.push(`<button type="button" data-action="sim-why" data-why="${esc(cmpWhy)}">${ko ? '모델 비교' : 'Compare models'}</button>`);
  if (capabilities.simulation) btns.push(`<button type="button" data-action="point-sim">${ko ? '시뮬레이션 →' : 'Simulation →'}</button>`);
  else btns.push(`<button type="button" data-action="sim-why" data-why="${esc(ko ? `${q}에는 시뮬레이션 엔진이 없습니다.` : `There is no simulation engine for ${q.toLowerCase()}.`)}">${ko ? '시뮬레이션 →' : 'Simulation →'}</button>`);
  btns.push(`<button type="button" data-action="point-field-settings" data-layer="${esc(pc.fid)}">${ko ? '표시 설정' : 'Display'}</button>`);
  rest.push(`<div class="pc-actions">${btns.join('')}</div>`);

  return `<div class="point-card" data-key="${esc(key)}"><div data-pc-live>${live.join('')}</div>${rest.join('')}</div>`;
}
