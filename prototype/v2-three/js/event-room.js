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

const cache = new Map(); // id → { at, data }
async function get(id) {
  const hit = cache.get(id);
  if (hit && Date.now() - hit.at < TTL_MS) return hit.data;
  const res = await Promise.race([
    fetch(SRC[id], { cache: 'no-store' }),
    new Promise((_, rej) => setTimeout(() => rej(new Error('timeout')), 15000)),
  ]);
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const data = await res.json();
  cache.set(id, { at: Date.now(), data });
  return data;
}

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
  const badge = r.layerKey ? layerBadge(r.layerKey) : renderBadge(r.kind);
  const btn = r.layerKey
    ? `<button class="room-on" data-action="room-layer" data-key="${r.layerKey}" title="이 레이어를 지구에 켭니다">지구에 켜기</button>`
    : '';
  return `<div class="room-src${r.found === false ? ' none' : ''}">
    <div class="room-agency">${esc(r.agency)}<div class="room-what">${esc(r.what)}</div></div>
    <div class="room-val">${r.value}${r.sub ? `<div class="room-sub">${r.sub}</div>` : ''}</div>
    <div class="room-right">${badge}${btn}</div>
  </div>`;
};

export class EventRoom {
  constructor() {
    this.last = null;
  }

  // 사건 → 기관 스택 + 타임라인 HTML. 실패한 소스는 그 줄에 실패라고 적는다.
  async build(it) {
    const isTC = it.kind === 'TC';
    const need = isTC ? ['tyoff', 'tyens', 'kmasea', 'khoaflood', 'warn'] : ['tsunami', 'kmasea', 'warn'];
    const got = {};
    await Promise.all(need.map(async (id) => {
      try { got[id] = await get(id); } catch (e) { got[id] = { __error: String((e && e.message) || e) }; }
    }));
    const rows = [];
    const tl = { now: null, next: null, action: null };
    const fusion = [];
    const nearKorea = haversineMeters(it, KOREA) < 1200000;

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
      const off = got.tyoff;
      if (off && !off.__error) {
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
            sub: `${s24 ? `+${s24.h}h ${num(s24.windMs, ' m/s')}` : ''}${s48 ? ` · +48h ${num(s48.windMs, ' m/s')}` : ''}${best.s.earliestDowngrade ? ` · ${esc(best.s.earliestDowngrade.agencyKo || best.s.earliestDowngrade.agency)} +${best.s.earliestDowngrade.h}h ${esc(best.s.earliestDowngrade.toKo || best.s.earliestDowngrade.to)}` : ''} · 발표 ${ago(best.ag.issue)}`,
          });
          tl.now = `<b>${num(s0.windMs, ' m/s')}</b> · ${num(s0.hpa, ' hPa')}<br/><span class="room-sub">${esc(s0.place || it.where)} · ${esc(best.ag.agencyKo || best.ag.agency)} 발표값</span>`;
          tl.next = `${s24 ? `+${s24.h}h <b>${num(s24.windMs, ' m/s')}</b>${s24.place ? ` · ${esc(s24.place)}` : ''}` : '예보 스텝 없음'}${best.s.earliestDowngrade ? `<br/><span class="room-sub">+${best.s.earliestDowngrade.h}h ${esc(best.s.earliestDowngrade.toKo || best.s.earliestDowngrade.to)}로 약화 전망 (${esc(best.s.earliestDowngrade.agencyKo || best.s.earliestDowngrade.agency)})</span>` : ''}`;
        } else {
          rows.push({ agency: 'KMA · JMA · NHC', what: '공식 예보 트랙', kind: 'OFFICIAL_FORECAST', layerKey: 'hazards/tyoff', found: false,
            value: '공식 태풍 발표에서 이 사건을 찾지 못했습니다', sub: `발표 중인 태풍 ${(off.storms || []).length}개 — 이름·위치·시각이 맞지 않음. 판단하지 않습니다` });
        }
      } else {
        rows.push({ agency: 'KMA · JMA · NHC', what: '공식 예보 트랙', kind: 'OFFICIAL_FORECAST', layerKey: 'hazards/tyoff', found: false, value: `불러오지 못함 (${esc(off && off.__error)})` });
      }

      // ---- ECMWF 앙상블 ------------------------------------------------------
      const ens = got.tyens;
      if (ens && !ens.__error) {
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
        rows.push({ agency: 'ECMWF', what: '앙상블', kind: 'PROVIDER_FORECAST', layerKey: 'hazards/tyens', found: false, value: `불러오지 못함 (${esc(ens && ens.__error)})` });
      }
    }

    // ---- 쓰나미 메시지 (지진) ------------------------------------------------
    if (!isTC) {
      const ts = got.tsunami;
      if (ts && !ts.__error) {
        const near = (ts.alerts || []).map((a) => ({ a, d: haversineMeters(it, a) }))
          .filter((x) => Number.isFinite(x.d) && x.d < 1500000 && Date.now() - Date.parse(x.a.updated) < 3 * 86400000)
          .sort((p, q) => p.d - q.d);
        if (near.length) {
          const a = near[0].a;
          rows.push({ agency: esc(a.centerName || a.center), what: '쓰나미 메시지', kind: 'OFFICIAL_WARNING', layerKey: 'hazards/tsunami',
            value: `<b>${esc(a.category)}</b> · ${esc(a.title)}`, sub: `M${num(a.magnitude)} · ${km(near[0].d)} · ${ago(a.updated)}` });
          tl.next = `<b>${esc(a.category)}</b> · ${esc(a.centerName || a.center)}<br/><span class="room-sub">${ago(a.updated)} 게시</span>`;
          tl.action = a.bulletin && /^https?:/.test(a.bulletin)
            ? `<a href="${esc(a.bulletin)}" target="_blank" rel="noopener">PTWC 게시문 보기</a><br/><span class="room-sub">행동 지시는 게시문 원문만 따릅니다</span>`
            : '게시문 본문 없음 — 판단하지 않습니다';
        } else {
          rows.push({ agency: 'PTWC · NWS', what: '쓰나미 메시지', kind: 'OFFICIAL_WARNING', layerKey: 'hazards/tsunami', found: false,
            value: '이 지진에 대한 쓰나미 메시지 없음', sub: `최근 게시 ${(ts.alerts || []).length}건 중 반경 1,500 km · 3일 안 해당 없음` });
          tl.next = '쓰나미 메시지 없음<br/><span class="room-sub">PTWC · NWS 게시 기준</span>';
        }
      } else {
        rows.push({ agency: 'PTWC · NWS', what: '쓰나미 메시지', kind: 'OFFICIAL_WARNING', layerKey: 'hazards/tsunami', found: false, value: `불러오지 못함 (${esc(ts && ts.__error)})` });
      }
      tl.now = `<b>${esc(it.facts[0] ? it.facts[0][1] : '')}</b> · 깊이 ${it.depthKm != null ? Math.round(it.depthKm) + ' km' : '—'}<br/><span class="room-sub">${esc(it.where)} · ${ago(new Date(it.whenT).toISOString())} · USGS</span>`;
      rows.push({ agency: '지각 맥락', what: '판 경계 · 진원 깊이', kind: 'OFFICIAL_OBSERVATION', layerKey: 'hazards/eqdepth',
        value: '같은 카탈로그를 실제 진원 깊이에 배치', sub: '재해 › 판 경계선 겹쳐보기 · 지진 깊이' });
    }

    // ---- 해상 관측망 (기상청) -----------------------------------------------
    const sea = got.kmasea;
    if (sea && !sea.__error) {
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
    }

    // ---- 연안 침수 예상도 (해양조사원) — 태풍 ---------------------------------
    if (isTC) {
      const fl = got.khoaflood;
      if (fl && !fl.__error) {
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
            kind: 'OFFICIAL_OBSERVATION', layerKey: 'ocean/khoaflood',
            value: `가장 가까운 <b>${esc(near[0].d.name)}</b> ${km(near[0].dist)} · 침수 구역 ${near[0].d.count}개`,
            sub: `${near.slice(1, 4).map((x) => esc(x.d.name)).join(' · ')} … 구역 합계 ${polys.toLocaleString('ko-KR')}개 — 침수 범위는 사전 예상도이며 이번 태풍의 예보가 아닙니다`,
          });
        } else {
          rows.push({ agency: '국립해양조사원', what: '연안 침수 예상도', kind: 'OFFICIAL_OBSERVATION', layerKey: 'ocean/khoaflood', found: false,
            value: '반경 700 km 안 연안 시군구 없음', sub: `자료는 한국 연안 ${(fl.districts || []).length}개 시군구` });
        }
      }
    }

    // ---- 기상청 특보 ----------------------------------------------------------
    const wn = got.warn;
    if (wn && !wn.__error) {
      const kinds = isTC ? ['태풍', '강풍', '풍랑', '호우', '폭풍해일'] : null;
      const act = (wn.active || []).filter((w) => !kinds || kinds.some((k) => String(w.kind || '').includes(k)))
        .sort((a, b) => (b.levelRank || 0) - (a.levelRank || 0));
      if (nearKorea && act.length) {
        const top = act[0];
        const byKind = {};
        act.forEach((w) => { byKind[w.kind] = (byKind[w.kind] || 0) + 1; });
        rows.push({
          agency: '기상청 특보',
          what: `발효 중 ${act.length}건${kinds ? ' (태풍·강풍·풍랑·호우·해일)' : ''}`,
          kind: 'OFFICIAL_WARNING', layerKey: 'weather/warn',
          value: `<b>${esc(top.region)} ${esc(top.kind)} ${esc(top.level)}</b>`,
          sub: `${Object.entries(byKind).map(([k, n]) => `${esc(k)} ${n}`).join(' · ')} · 발표 ${esc((top.issuedKst || '').slice(5, 16))} KST`,
        });
        // 캐시의 command 는 '발표/변경' 같은 통보 종류이지 행동 지시가 아니다 — 지시문은 싣지 않는다
        tl.action = `<b>${esc(top.kind)} ${esc(top.level)} 발효 중</b> — ${esc(top.region)}<br/><span class="room-sub">행동 지시는 기상청 특보 원문을 따르세요. 이 화면은 지시문을 만들지 않습니다</span>`;
      } else if (nearKorea) {
        rows.push({ agency: '기상청 특보', what: '발효 중 특보', kind: 'OFFICIAL_WARNING', layerKey: 'weather/warn', found: false,
          value: '이 사건과 관련된 발효 특보 없음', sub: `전체 발효 ${(wn.active || []).length}건 · 예고 ${(wn.upcoming || []).length}건` });
      }
    }

    if (!tl.now) tl.now = `${isTC ? `경보 <b>${esc(it.alert)}</b>` : `<b>${esc(it.facts[0] ? it.facts[0][1] : '')}</b>`}<br/><span class="room-sub">${esc(it.source)} · ${ago(new Date(it.whenT).toISOString())}</span>`;
    if (!tl.next) tl.next = isTC ? '공식 예보 스텝 없음<br/><span class="room-sub">판단하지 않습니다</span>' : '—';
    if (!tl.action) tl.action = `공식 행동 지시 없음<br/><span class="room-sub">${nearKorea ? '발효 특보 없음' : '한반도 밖 사건 — 기상청 특보 범위 아님'} · 지어내지 않습니다</span>`;

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
          ${L.fusion.length ? `<div class="room-fusion">사건 결합 · 정본 HAZ-011 <code>eventSimilarity</code><br/>${L.fusion.map(esc).join('<br/>')}</div>` : ''}
        </div></div>
      <div class="card room"><div class="card-h">현재 → 다음 → 행동</div>
        <div class="card-b room-tl">
          <div><div class="room-tlk">지금</div><div>${L.tl.now}</div></div>
          <div><div class="room-tlk">다음</div><div>${L.tl.next}</div></div>
          <div class="act"><div class="room-tlk">행동</div><div>${L.tl.action}</div></div>
        </div></div>`;
  }
}
