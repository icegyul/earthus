// EARTHUS v2-three — 사건 방 (EVENT ROOM)
//
// 사건 하나를 누르면 그 사건에 걸리는 모든 기관 데이터가 한 스택에 쌓인다.
//   · 줄마다 진리등급(관측 / 공식예보 / 공식특보 / 모델) — 어휘는 정본 EVIDENCE_KIND
//   · 줄마다 "지구에 켜기" — 해당 레이어를 그 자리에서 켠다
//   · 아래는 현재 → 다음 → 행동. 행동은 공식 발표(특보 command·PTWC 게시문)만 옮긴다.
//
// 사건 결합은 정본 HAZ-011(v11/event/event-fusion.js · eventSimilarity)로 한다.
// 값을 생성하지 않는다: 매칭이 안 되면 "찾지 못했다"고 적고, 지시가 없으면 "없다"고 적는다.

import { eventSimilarity, haversineMeters } from '../../js/earthus2/v11/event/event-fusion.js';
import { renderBadge, layerBadge } from './engine-bridge.js?v=15';
import { bulletinContext, bulletinTimesHtml, sourceTimeLabel } from './source-context.js?v=20260905';

const S3 = 'https://earthus-cache-kr.s3.us-east-2.amazonaws.com';
const SRC = Object.freeze({
  tyoff: `${S3}/events/typhoon-official.json`,
  tyens: `${S3}/events/typhoon-ecmwf.json`,
  kmasea: `${S3}/ocean/kma-buoy.json`,
  khoaflood: `${S3}/ocean/khoa/flood-index.json`,
  warn: `${S3}/events/kma-warn.json`,
  tsunami: `${S3}/events/tsunami-intl.json`,
});
const TTL_MS = 5 * 60 * 1000;
const KOREA = { lat: 36.2, lon: 127.6 };
const SRC_URL = Object.freeze({ ...SRC, warnRegions: `${S3}/events/kma-warn-regions.json` });   // SRC 는 동결돼 있다

// 소스 상태 5분법(지시서 A-2). 화면 문구는 이 상태에서만 나온다 — "조회 실패"가 "없음"으로 보이던 것이 F02.
export const SOURCE_STATE = Object.freeze({ OK: 'OK', EMPTY: 'EMPTY', FAILED: 'FAILED', STALE: 'STALE', OUT_OF_SCOPE: 'OUT_OF_SCOPE' });
// 소스별 신선도 SLA(분). generated 가 이보다 묵으면 STALE — 자료는 쓰되 배지에 나이를 적는다.
const SLA_MIN = { tyoff: 180, tyens: 720, kmasea: 120, khoaflood: null, warn: 60, tsunami: 60, warnRegions: null };
// 지시서 N-1 — 쓰나미 도달시간(EARTHUS 기준선, SIMULATION_ONLY). 사건마다 파일 하나: ocean/tsunami-eta/{usgsId}.json
export const TSU_ETA_URL = (usgsId) => `${S3}/ocean/tsunami-eta/${usgsId}.json`;
const TSU_ETA_INDEX = `${S3}/ocean/tsunami-eta.json`;
// 색인에 없는 사건의 파일을 찔러 보면 S3 가 403 을 낸다(QA E4 실측). 색인을 먼저 보고, 있는 사건만 받는다.
let etaIndexCache = null;   // { at, ids:Set } — 5분
async function etaIndexHas(usgsId, fetchJson, now) {
  if (!etaIndexCache || now - etaIndexCache.at > TTL_MS) {
    const doc = await fetchJson(TSU_ETA_INDEX);
    etaIndexCache = { at: now, ids: new Set(((doc && doc.events) || []).map((e) => String(e.usgsId))) };
  }
  return etaIndexCache.ids.has(String(usgsId));
}
export const RELATED_KM = { TC: 350, EQ: 200 };   // 특보 구역 중심 ↔ 사건 중심 (지시서 A-3)

const cache = new Map(); // id → { at, result }
async function defaultFetchJson(url) {
  const res = await Promise.race([
    fetch(url, { cache: 'no-store' }),
    new Promise((_, rej) => setTimeout(() => rej(new Error('timeout')), 15000)),
  ]);
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.json();
}
// { state, data, error, generatedAt, ageMin, retrievedAt } — 절대 throw 하지 않는다.
async function fetchSource(id, fetchJson, now = Date.now()) {
  const hit = cache.get(id);
  if (hit && now - hit.at < TTL_MS) return hit.result;
  let result;
  try {
    if (id.startsWith('tsueta:') && !(await etaIndexHas(id.slice(7), fetchJson, now))) {
      result = { state: SOURCE_STATE.EMPTY, data: null, error: null, generatedAt: null, ageMin: null, retrievedAt: new Date(now).toISOString() };
      cache.set(id, { at: now, result });
      return result;
    }
    const url = id.startsWith('tsueta:') ? TSU_ETA_URL(id.slice(7)) : SRC_URL[id];
    const data = await fetchJson(url);
    const generatedAt = data && (data.generated || data.generatedAt || data.run || null);
    const t = generatedAt ? Date.parse(generatedAt) : NaN;
    const ageMin = Number.isFinite(t) ? Math.round((now - t) / 60000) : null;
    const sla = SLA_MIN[id];
    const state = sla != null && ageMin != null && ageMin > sla ? SOURCE_STATE.STALE : SOURCE_STATE.OK;
    result = { state, data, error: null, generatedAt, ageMin, retrievedAt: new Date(now).toISOString() };
  } catch (e) {
    const msg = String((e && e.message) || e);
    // 도달시간 파일이 없는 것(404)은 "이 지진은 계산 대상이 아니거나 아직 계산 전" — 실패가 아니다
    const state = id.startsWith('tsueta:') && /(^|\D)40[34](\D|$)/.test(msg) ? SOURCE_STATE.EMPTY : SOURCE_STATE.FAILED;
    result = { state, data: null, error: msg, generatedAt: null, ageMin: null, retrievedAt: new Date(now).toISOString() };
  }
  if (result.state !== SOURCE_STATE.FAILED) cache.set(id, { at: now, result });
  return result;
}
const usable = (s) => s && (s.state === SOURCE_STATE.OK || s.state === SOURCE_STATE.STALE);
const staleSub = (s) => (s && s.state === SOURCE_STATE.STALE ? ` · STALE · ${s.ageMin}분 전 자료` : '');
// 실패한 소스는 행을 남긴다 — 행이 사라지면 사용자는 "없다"로 읽는다.
const failRow = (agency, what, kind, layerKey, s) => ({
  agency, what, kind, layerKey, state: SOURCE_STATE.FAILED, found: false,
  value: `조회 불가 (${esc(s && s.error ? s.error : 'unknown')})`, sub: '기관 원문에서 직접 확인 — 이 화면은 판단하지 않습니다',
});

const esc = (s) => String(s ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const km = (m) => (Number.isFinite(m) ? `${Math.round(m / 1000).toLocaleString('ko-KR')} km` : '—');
const ago = (iso) => {
  const t = Date.parse(iso);
  if (!Number.isFinite(t)) return '';
  const m = Math.round((Date.now() - t) / 60000);
  if (m < 1) return '방금';
  if (m < 60) return `${m}분 전`;
  if (m < 2880) return `${Math.round(m / 60)}시간 전`;
  return `${Math.round(m / 1440)}일 전`;
};
const num = (v, unit = '') => (v == null || Number.isNaN(Number(v)) ? '—' : `${v}${unit}`);

// 한 줄: { agency, what, kind(EVIDENCE_KIND), layerKey, value, sub, found }
const row = (r) => {
  const failed = r.state === SOURCE_STATE.FAILED;
  const badge = failed ? renderBadge('UNAVAILABLE') : (r.layerKey ? layerBadge(r.layerKey) : renderBadge(r.kind));
  const btn = failed
    ? `<button class="room-on" data-action="room-retry" title="이 소스를 다시 조회합니다">재시도</button>`
    : r.layerKey
      ? `<button class="room-on" data-action="room-layer" data-key="${r.layerKey}" title="이 레이어를 지구에 켭니다">지구에 켜기</button>`
      : '';
  return `<div class="room-src${r.found === false ? ' none' : ''}${failed ? ' fail' : ''}">
    <div class="room-agency">${esc(r.agency)}<div class="room-what">${esc(r.what)}</div></div>
    <div class="room-val">${r.value}${r.sub ? `<div class="room-sub">${r.sub}</div>` : ''}</div>
    <div class="room-right">${badge}${btn}</div>
  </div>`;
};

export class EventRoom {
  constructor({ fetchJson = defaultFetchJson, now = () => Date.now() } = {}) {
    this.last = null;
    this.fetchJson = fetchJson;
    this.now = now;
  }

  clearCache() { cache.clear(); etaIndexCache = null; }

  // 사건 → 기관 스택 + 타임라인 HTML. 실패한 소스는 그 줄에 실패라고 적는다.
  async build(it) {
    const isTC = it.kind === 'TC';
    const nearKorea = haversineMeters(it, KOREA) < 1200000;
    const need = isTC ? ['tyoff', 'tyens', 'kmasea', 'khoaflood', 'warn'] : ['tsunami', 'kmasea', 'warn'];
    const usgsId = !isTC && /^eq-/.test(String(it.id || '')) ? String(it.id).slice(3) : null;
    if (usgsId) need.push(`tsueta:${usgsId}`);
    if (nearKorea) need.push('warnRegions');
    const got = {};
    await Promise.all(need.map(async (id) => { got[id] = await fetchSource(id, this.fetchJson, this.now()); }));
    const rows = [];
    const tl = { now: null, next: null, action: null };
    const fusion = [];
    this.sources = Object.fromEntries(need.map((id) => [id, { state: got[id].state, ageMin: got[id].ageMin, error: got[id].error }]));

    // ---- 1차 출처 (피드 자체) ------------------------------------------------
    rows.push({
      agency: isTC ? 'GDACS (JRC · UN)' : 'USGS',
      what: isTC ? '사건 등급 · 위치' : '지진 관측',
      kind: isTC ? 'OFFICIAL_WARNING' : 'OFFICIAL_OBSERVATION',
      layerKey: isTC ? 'hazards/tc' : 'hazards/eq',
      value: isTC ? `경보 <b>${esc(it.alert)}</b>` : `<b>${esc(it.facts[0] ? it.facts[0][1] : '')}</b> · 깊이 ${it.depthKm != null ? Math.round(it.depthKm) + ' km' : '—'}`,
      sub: `${esc(it.where)} · ${ago(new Date(it.whenT).toISOString())}`,
    });

    if (isTC) {
      // 이름은 피드가 실어 준 대조용 이름을 쓴다(GDACS 시즌 꼬리표 '-26' 을 뗀 것).
      // 제목에서 접두어를 떼어 쓰면 영어 화면에서 접두어가 달라져 기관 대조가 통째로 어긋나고,
      // 꼬리표를 남기면 이름 유사도가 절반으로 깎여 문턱을 못 넘는다.
      const name = it.stormName || (it.title || '').replace('열대저기압', '').trim().replace(/-\d{2}$/, '');
      const mine = { eventType: 'TC', title: name, lat: it.lat, lon: it.lon, startedAt: new Date(it.whenT).toISOString() };

      // ---- 공식 트랙 (KMA · JMA · NHC) --------------------------------------
      const off = usable(got.tyoff) ? got.tyoff.data : null;
      if (off) {
        let best = null;
        for (const s of off.storms || []) {
          const ag = (s.agencies || []).find((a) => a.steps && a.steps.length);
          const s0 = ag && ag.steps[0];
          const sim = eventSimilarity(mine, {
            eventType: 'TC', title: s.name || s.key, lat: s0 && s0.lat, lon: s0 && s0.lon, startedAt: s.firstIssuedAt,
          }, { maxMeters: 600000, maxHours: 96 });
          if (!best || sim.score > best.sim.score) best = { s, ag, s0, sim };
        }
        if (best && best.sim.merge) {
          fusion.push(`공식 발표 ${best.s.name || best.s.key} ↔ GDACS · 유사도 ${best.sim.score.toFixed(2)} (${best.sim.reasons.join(' ')})`);
          const s0 = best.s0;
          const s24 = best.ag.steps.find((x) => x.h === 24) || best.ag.steps[Math.min(1, best.ag.steps.length - 1)];
          const s48 = best.ag.steps.find((x) => x.h === 48);
          const agencies = (best.s.agencies || []).map((a) => a.agencyKo || a.agency).filter(Boolean);
          rows.push({
            agency: agencies.join(' · ') || best.ag.agencyKo || best.ag.agency,
            what: '공식 예보 트랙',
            kind: 'OFFICIAL_FORECAST', layerKey: 'hazards/tyoff',
            value: `현재 <b>${num(s0.windMs, ' m/s')}</b> · ${num(s0.hpa, ' hPa')}${s0.place ? ` · ${esc(s0.place)}` : ''}`,
            sub: `${s24 ? `+${s24.h}h ${num(s24.windMs, ' m/s')}` : ''}${s48 ? ` · +48h ${num(s48.windMs, ' m/s')}` : ''}${best.s.earliestDowngrade ? ` · ${esc(best.s.earliestDowngrade.agencyKo || best.s.earliestDowngrade.agency)} +${best.s.earliestDowngrade.h}h ${esc(best.s.earliestDowngrade.toKo || best.s.earliestDowngrade.to)}` : ''} · 발표 ${ago(best.ag.issue)}${staleSub(got.tyoff)}`,
          });
          // 기관마다 한 행(지시서 C-2): 이름만 합쳐 놓고 값은 첫 기관 것을 쓰던 F08.
          for (const a of (best.s.agencies || []).filter((x) => x.steps && x.steps.length)) {
            const a0 = a.steps[0], a24 = a.steps.find((x) => x.h === 24);
            const off24 = a24 && s24 && a !== best.ag ? Math.round(haversineMeters({ lat: a24.lat, lon: a24.lon }, { lat: s24.lat, lon: s24.lon }) / 1000) : null;
            rows.push({
              agency: esc(a.agencyKo || a.agency), what: `발표 ${esc(String(a.issue || '').slice(5, 16))}`, kind: 'OFFICIAL_FORECAST',
              value: `현재 ${num(a0.windMs, ' m/s')}${a24 ? ` · +24h <b>${num(a24.windMs, ' m/s')}</b>` : ''}`,
              sub: `${a0.categoryKo || a0.category ? `등급 ${esc(a0.categoryKo || a0.category)}` : '등급 미표기'}${off24 != null ? ` · ${esc(best.ag.agencyKo || best.ag.agency)} 대비 +24h 위치 차 ${off24} km` : ''}`,
            });
          }
          tl.now = `<b>${num(s0.windMs, ' m/s')}</b> · ${num(s0.hpa, ' hPa')}<br/><span class="room-sub">${esc(s0.place || it.where)} · ${esc(best.ag.agencyKo || best.ag.agency)} 발표값</span>`;
          tl.next = `${s24 ? `+${s24.h}h <b>${num(s24.windMs, ' m/s')}</b>${s24.place ? ` · ${esc(s24.place)}` : ''}` : '예보 스텝 없음'}${best.s.earliestDowngrade ? `<br/><span class="room-sub">+${best.s.earliestDowngrade.h}h ${esc(best.s.earliestDowngrade.toKo || best.s.earliestDowngrade.to)}로 약화 전망 (${esc(best.s.earliestDowngrade.agencyKo || best.s.earliestDowngrade.agency)})</span>` : ''}`;
        } else {
          rows.push({ agency: 'KMA · JMA · NHC', what: '공식 예보 트랙', kind: 'OFFICIAL_FORECAST', layerKey: 'hazards/tyoff', found: false,
            value: '공식 태풍 발표에서 이 사건을 찾지 못했습니다', sub: `발표 중인 태풍 ${(off.storms || []).length}개 — 이름·위치·시각이 맞지 않음. 판단하지 않습니다` });
        }
      } else {
        rows.push(failRow('KMA · JMA · NHC', '공식 예보 트랙', 'OFFICIAL_FORECAST', 'hazards/tyoff', got.tyoff));
      }

      // ---- ECMWF 앙상블 ------------------------------------------------------
      const ens = usable(got.tyens) ? got.tyens.data : null;
      if (ens) {
        let best = null;
        for (const s of ens.storms || []) {
          const s0 = (s.steps || [])[0];
          const sim = eventSimilarity(mine, { eventType: 'TC', title: s.name, lat: s0 && s0.lat, lon: s0 && s0.lon, startedAt: ens.run }, { maxMeters: 600000, maxHours: 120 });
          if (!best || sim.score > best.sim.score) best = { s, s0, sim };
        }
        if (best && best.sim.merge) {
          fusion.push(`ECMWF ${best.s.name} ↔ GDACS · 유사도 ${best.sim.score.toFixed(2)}`);
          const members = best.s.ensemble && (best.s.ensemble.members || best.s.ensemble.tracks || []);
          const mCount = Array.isArray(members) ? members.length : (best.s.ensemble && best.s.ensemble.count) || null;
          rows.push({
            agency: ens.agencyKo || 'ECMWF',
            what: `${esc(ens.model || 'IFS ENS')} 앙상블`,
            kind: 'PROVIDER_FORECAST', layerKey: 'hazards/tyens',
            value: `${mCount ? `<b>${mCount}멤버</b> · ` : ''}예보 +${best.s.shownH || best.s.modelHorizonH || '—'}h`,
            sub: `런 ${ago(ens.run)} · ${esc(ens.license || '')} — 공식 예보가 아니라 예보가 갈리는 폭`,
          });
        } else {
          rows.push({ agency: 'ECMWF', what: '앙상블', kind: 'PROVIDER_FORECAST', layerKey: 'hazards/tyens', found: false, value: '이 사건에 대응하는 앙상블 트랙 없음', sub: `모델이 추적 중인 열대저기압 ${(ens.storms || []).length}개` });
        }
      } else {
        rows.push(failRow('ECMWF', '앙상블', 'PROVIDER_FORECAST', 'hazards/tyens', got.tyens));
      }
    }

    // ---- 쓰나미 메시지 (지진) ------------------------------------------------
    if (!isTC) {
      const ts = usable(got.tsunami) ? got.tsunami.data : null;
      if (ts) {
        const near = (ts.alerts || []).map((a) => ({ a, d: haversineMeters(it, a) }))
          .filter((x) => Number.isFinite(x.d) && x.d < 1500000 && Math.abs(it.whenT - Date.parse(x.a.updated)) < 3 * 86400000)
          .sort((p, q) => p.d - q.d);
        if (near.length) {
          const a = near[0].a;
          const context = bulletinContext(a, ts);
          rows.push({ agency: esc(a.centerName || a.center), what: '쓰나미 메시지', kind: 'OFFICIAL_WARNING', layerKey: 'hazards/tsunami',
            value: `<b>${esc(a.category)}</b> · ${context.label} · ${esc(a.title)}`, sub: `M${num(a.magnitude)} · ${km(near[0].d)}<br/>${bulletinTimesHtml(context)}<br/>목록 수집 ${esc(sourceTimeLabel(context.retrievedRaw))}<br/>이 지진과의 연결은 위치·시각 기준 후보입니다` });
          tl.next = `<b>${context.label}</b> · ${esc(a.category)}<br/><span class="room-sub">${bulletinTimesHtml(context)}</span>`;
          tl.action = a.bulletin && /^https?:/.test(a.bulletin)
            ? `<a href="${esc(a.bulletin)}" target="_blank" rel="noopener">PTWC 게시문 보기</a><br/><span class="room-sub">행동 지시는 게시문 원문만 따릅니다</span>`
            : '게시문 본문 없음 — 판단하지 않습니다';
        } else {
          rows.push({ agency: 'PTWC · NWS', what: '쓰나미 메시지', kind: 'OFFICIAL_WARNING', layerKey: 'hazards/tsunami', found: false,
            value: '이 지진에 대응하는 쓰나미 발표를 찾지 못했습니다', sub: `수집된 ${(ts.alerts || []).length}건 중 반경 1,500 km · 사건 시각 전후 3일 후보 없음<br/>목록 수집 ${esc(sourceTimeLabel(ts.generated))}` });
          tl.next = '연결된 쓰나미 발표 미확인<br/><span class="room-sub">현재 경보 유무는 기관 원문 확인</span>';
        }
      } else {
        rows.push(failRow('PTWC · NWS', '쓰나미 메시지', 'OFFICIAL_WARNING', 'hazards/tsunami', got.tsunami));
        tl.next = '쓰나미 발표 조회 불가<br/><span class="room-sub">현재 경보 유무는 기관 원문 확인 — 없다고 적지 않습니다</span>';
      }
      tl.now = `<b>${esc(it.facts[0] ? it.facts[0][1] : '')}</b> · 깊이 ${it.depthKm != null ? Math.round(it.depthKm) + ' km' : '—'}<br/><span class="room-sub">${esc(it.where)} · ${ago(new Date(it.whenT).toISOString())} · USGS</span>`;
      // ---- 도달시간 추정 (EARTHUS 기준선 · SIMULATION_ONLY, 지시서 N-1) ----
      if (usgsId) {
        const te = got[`tsueta:${usgsId}`];
        if (te && te.state === SOURCE_STATE.FAILED) {
          rows.push(failRow('EARTHUS 기준선', '쓰나미 도달시간 추정', 'SIMULATION_ONLY', null, te));
        } else if (te && usable(te) && te.data && te.data.stations) {
          const d = te.data;
          const reached = d.stations.filter((s) => s.etaMin != null);
          const kor = reached.filter((s) => s.iso === 'KOR').sort((a, b) => a.etaMin - b.etaMin).slice(0, 3);
          const others = reached.filter((s) => s.iso !== 'KOR').sort((a, b) => a.etaMin - b.etaMin).slice(0, 3);
          const fmt = (s) => `${esc(s.name)} +${s.etaMin}분`;
          const korTxt = kor.length ? kor.map(fmt).join(' · ') : (d.stations.some((s) => s.iso === 'KOR' && s.note === '계산 창 밖') ? '한국은 계산 창 밖' : '한국 연안에 닿는 경로 없음(격자 기준)');
          const cmp = d.official && d.official.compare && d.official.compare.length
            ? `PTWC 게시문 ETA 대조 ${d.official.compare.length}곳 · 평균 차 ${Math.round(d.official.compare.reduce((a, c) => a + Math.abs(c.diffMin), 0) / d.official.compare.length)}분`
            : `공식 ETA 대조 불가 — ${esc((d.official && d.official.note) || '게시문 없음')}`;
          rows.push({ agency: 'EARTHUS 기준선', what: '쓰나미 도달시간 추정', kind: 'SIMULATION_ONLY', layerKey: null,
            value: `<b>${korTxt}</b>${others.length ? `<br/>${others.map(fmt).join(' · ')}` : ''}`,
            sub: `첫 파 도달 추정 · 장파 근사 √(g·h) · 0.2° 격자 · <b>파고·침수 아님</b> · 계산 ${esc((d.time && d.time.computedAt) || '').slice(5, 16).replace('T', ' ')}Z${d.event && d.event.sourceOnLand ? '<br/>⚠ 진원이 육지 셀 — 가장 가까운 바다 셀에서 시작한 가정(쓰나미 발생 여부와 무관)' : ''}<br/>${cmp}<br/>지구 위: 30분 간격 등시선(주황) — 공식 경보는 PTWC/JMA/기상청 원문만` });
          this.eta = d;
        } else {
          rows.push({ agency: 'EARTHUS 기준선', what: '쓰나미 도달시간 추정', kind: 'SIMULATION_ONLY', layerKey: null, found: false,
            value: '이 지진은 도달시간 계산 대상이 아닙니다', sub: 'M6.5 이상 · 진원 100 km 이하 · 바다 지진만 계산 (15분 주기) — 계산이 없다는 것이지 위험이 없다는 뜻이 아닙니다' });
          this.eta = null;
        }
      }
      rows.push({ agency: '지각 맥락', what: '판 경계 · 진원 깊이', kind: 'OFFICIAL_OBSERVATION', layerKey: 'hazards/eqdepth',
        value: '같은 카탈로그를 실제 진원 깊이에 배치', sub: '재해 › 판 경계선 겹쳐보기 · 지진 깊이' });
    }

    // ---- 해상 관측망 (기상청) -----------------------------------------------
    const sea = usable(got.kmasea) ? got.kmasea.data : null;
    if (sea) {
      const R = isTC ? 600000 : 400000;
      // 파고를 보고하는 관측점(부이·파고계)을 먼저, 그 다음 거리순 — 조위관측소는 파고가 비어 있다
      const near = (sea.stations || []).map((s) => ({ s, d: haversineMeters(it, s) }))
        .filter((x) => Number.isFinite(x.d) && x.d < R)
        .sort((p, q) => ((q.s.wh != null) - (p.s.wh != null)) || (p.d - q.d)).slice(0, 3);
      if (near.length) {
        const top = near[0];
        rows.push({
          agency: '기상청 해양관측',
          what: `해상 관측망 · 반경 ${R / 1000} km 안 ${near.length}곳`,
          kind: 'OFFICIAL_OBSERVATION', layerKey: 'ocean/kmasea',
          value: `${esc(top.s.name)} 파고 <b>${num(top.s.wh, ' m')}</b> · 풍속 ${num(top.s.ws, ' m/s')}${top.s.tw != null ? ` · 수온 ${top.s.tw}°C` : ''}`,
          sub: near.slice(1).map((x) => `${esc(x.s.name)} ${num(x.s.wh, ' m')}`).join(' · ') + (near.length > 1 ? ' · ' : '') + `관측 ${esc(top.s.tm ? `${top.s.tm.slice(8, 10)}:${top.s.tm.slice(10, 12)} KST` : '')}`,
        });
      } else {
        rows.push({ agency: '기상청 해양관측', what: '해상 관측망', kind: 'OFFICIAL_OBSERVATION', layerKey: 'ocean/kmasea', found: false,
          value: `반경 ${R / 1000} km 안 관측점 없음`, sub: `관측점 ${(sea.stations || []).length}곳은 한반도 연안` });
      }
    } else {
      rows.push(failRow('기상청 해양관측', '해상 관측망', 'OFFICIAL_OBSERVATION', 'ocean/kmasea', got.kmasea));
    }

    // ---- 연안 침수 예상도 (해양조사원) — 태풍 ---------------------------------
    if (isTC) {
      const fl = usable(got.khoaflood) ? got.khoaflood.data : null;
      if (fl) {
        const near = (fl.districts || []).map((d) => {
          const [w, s, e, n] = d.bbox || [];
          const c = { lat: (s + n) / 2, lon: (w + e) / 2 };
          return { d, dist: haversineMeters(it, c) };
        }).filter((x) => Number.isFinite(x.dist) && x.dist < 700000).sort((p, q) => p.dist - q.dist);
        if (near.length) {
          const polys = near.reduce((a, x) => a + (x.d.count || 0), 0);
          rows.push({
            agency: '국립해양조사원',
            what: `연안 침수 예상도 · 반경 700 km 안 ${near.length}개 시군구`,
            kind: 'PROVIDER_FORECAST', layerKey: 'ocean/khoaflood',
            value: `가장 가까운 <b>${esc(near[0].d.name)}</b> ${km(near[0].dist)} · 침수 구역 ${near[0].d.count}개`,
            sub: `${near.slice(1, 4).map((x) => esc(x.d.name)).join(' · ')} … 구역 합계 ${polys.toLocaleString('ko-KR')}개 — 침수 범위는 사전 예상도이며 이번 태풍의 예보가 아닙니다`,
          });
        } else {
          rows.push({ agency: '국립해양조사원', what: '연안 침수 예상도', kind: 'PROVIDER_FORECAST', layerKey: 'ocean/khoaflood', found: false,
            value: '반경 700 km 안 연안 시군구 없음', sub: `자료는 한국 연안 ${(fl.districts || []).length}개 시군구` });
        }
      }
    }

    // ---- 기상청 특보 (지시서 A-2·A-3) -------------------------------------------
    // 상태 결정표: FAILED → '조회 불가'(절대 '없음' 아님) · OK+0건 → '관련 유형 없음 (전체 N건)' ·
    // STALE → 나이 병기 · 한반도 밖 → OUT_OF_SCOPE. 구역 연관은 특보 구역 중심점 거리로 RELATED/DOMESTIC 두 단계.
    const wn = got.warn;
    const kinds = isTC ? ['태풍', '강풍', '풍랑', '호우', '폭풍해일'] : null;
    if (!nearKorea) {
      this.warnState = SOURCE_STATE.OUT_OF_SCOPE;
    } else if (!usable(wn)) {
      this.warnState = SOURCE_STATE.FAILED;
      rows.push(failRow('기상청 특보', '발효 중 특보', 'OFFICIAL_WARNING', 'weather/warn', wn));
      tl.action = `<b>특보 조회 불가</b> (${esc(wn && wn.error ? wn.error : 'unknown')})<br/><span class="room-sub">기상청 원문에서 직접 확인 — 조회 실패를 부재로 적지 않습니다</span>`;
    } else {
      const regions = usable(got.warnRegions) && got.warnRegions.data ? (got.warnRegions.data.regions || {}) : null;
      const limitKm = RELATED_KM[isTC ? 'TC' : 'EQ'];
      const act = (wn.data.active || []).filter((w) => !kinds || kinds.some((k) => String(w.kind || '').includes(k)))
        .map((w) => {
          const r = regions && (regions[w.regionId] || regions[w.parentId]);
          const km_ = r && Number.isFinite(r.lat) ? Math.round(haversineMeters(it, r) / 1000) : null;
          return { ...w, distKm: km_, related: km_ != null && km_ <= limitKm };
        })
        .sort((p, q) => (Number(q.related) - Number(p.related)) || ((q.levelRank || 0) - (p.levelRank || 0)) || ((p.distKm ?? 1e9) - (q.distKm ?? 1e9)));
      const related = act.filter((w) => w.related);
      const total = (wn.data.active || []).length;
      const gen = wn.generatedAt ? esc(String(wn.generatedAt).slice(11, 16)) + 'Z' : '시각 미표기';
      if (related.length) {
        this.warnState = 'RELATED';
        const top = related[0];
        const byKind = {};
        related.forEach((w) => { byKind[w.kind] = (byKind[w.kind] || 0) + 1; });
        rows.push({
          agency: '기상청 특보', what: `관련 구역 특보 ${related.length}건 (구역 중심 ${limitKm} km 안)`,
          kind: 'OFFICIAL_WARNING', layerKey: 'weather/warn',
          value: `<b>${esc(top.region)} ${esc(top.kind)} ${esc(top.level)}</b> · 사건 중심에서 ${top.distKm} km`,
          sub: `${Object.entries(byKind).map(([k, n]) => `${esc(k)} ${n}`).join(' · ')} · 발표 ${esc((top.issuedKst || '').slice(5, 16))} KST · 구역 중심점 근사(경계선 아님)${staleSub(wn)}`,
        });
        // 캐시의 command 는 '발표/변경' 같은 통보 종류이지 행동 지시가 아니다 — 지시문은 싣지 않는다
        tl.action = `<b>${esc(top.kind)} ${esc(top.level)} 발효 중</b> — ${esc(top.region)} (${top.distKm} km)<br/><span class="room-sub">행동 지시는 기상청 특보 원문을 따르세요. 이 화면은 지시문을 만들지 않습니다</span>`;
      } else if (act.length) {
        this.warnState = 'DOMESTIC';
        rows.push({
          agency: '기상청 특보', what: `국내 관련 유형 특보 ${act.length}건 (구역 교차 미확인)`, kind: 'OFFICIAL_WARNING', layerKey: 'weather/warn',
          value: `${esc(act[0].region)} ${esc(act[0].kind)} ${esc(act[0].level)}${act[0].distKm != null ? ` · ${act[0].distKm} km` : ''}`,
          sub: `이 사건과의 구역 관계는 확인되지 않음 · 전체 발효 ${total}건 · ${gen} 자료${staleSub(wn)}`,
        });
        tl.action = `국내에 ${esc(act[0].kind)} 등 특보 ${act.length}건 — 이 사건과의 구역 관계는 확인되지 않음<br/><span class="room-sub">기상청 원문에서 내 지역 확인</span>`;
      } else {
        this.warnState = SOURCE_STATE.EMPTY;
        rows.push({ agency: '기상청 특보', what: '발효 중 특보', kind: 'OFFICIAL_WARNING', layerKey: 'weather/warn', found: false,
          value: `관련 유형 특보 없음 (전체 발효 ${total}건)`, sub: `예고 ${(wn.data.upcoming || []).length}건 · ${gen} 자료${staleSub(wn)}` });
        tl.action = `관련 유형 특보 없음 (전체 발효 ${total}건 · ${gen} 자료)<br/><span class="room-sub">특보 자료 정상 수신 기준 · 지시문은 만들지 않습니다</span>`;
      }
    }

    if (!tl.now) tl.now = `${isTC ? `경보 <b>${esc(it.alert)}</b>` : `<b>${esc(it.facts[0] ? it.facts[0][1] : '')}</b>`}<br/><span class="room-sub">${esc(it.source)} · ${ago(new Date(it.whenT).toISOString())}</span>`;
    if (!tl.next) tl.next = isTC ? '공식 예보 스텝 없음<br/><span class="room-sub">판단하지 않습니다</span>' : '—';
    if (!tl.action) tl.action = `공식 행동 지시 없음<br/><span class="room-sub">한반도 밖 사건 — 기상청 특보 범위 아님 · 지어내지 않습니다</span>`;

    this.last = { it, rows, tl, fusion };
    return this.html();
  }

  html() {
    const L = this.last;
    if (!L) return '';
    const stack = L.rows.map(row).join('');
    const agencies = new Set(L.rows.filter((r) => r.found !== false).map((r) => r.agency));
    return `
      <div class="card room"><div class="card-h">사건 방 — 기관 스택 <span class="badge live">${agencies.size}곳 · ${L.rows.length}줄</span></div>
        <div class="card-b">
          ${stack}
          ${L.fusion.length ? `<details class="room-fusion"><summary>기관 자료 연결 근거</summary>사건 결합 · 정본 HAZ-011 <code>eventSimilarity</code><br/>${L.fusion.map(esc).join('<br/>')}</details>` : ''}
        </div></div>
      <div class="card room"><div class="card-h">현재 → 다음 → 행동</div>
        <div class="card-b room-tl">
          <div><div class="room-tlk">지금</div><div>${L.tl.now}</div></div>
          <div><div class="room-tlk">다음</div><div>${L.tl.next}</div></div>
          <div class="act"><div class="room-tlk">행동</div><div>${L.tl.action}</div></div>
        </div></div>`;
  }
}
