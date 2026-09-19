// EARTHUS — Intelligence 띠 렌더러 (INTELLIGENCE-LAYER-PLAN P1 · 계약 §C-0)
//
// 현상 문맥(선택 자료 위 information-context) 아래 한 줄로 붙는다. 1차 메뉴가 아니다(LAYER-PLAN §1).
//
// ⚠️⚠️ 계약 §C-0 — 이 파일은 **아무것도 요청하지 않고 아무것도 계산하지 않는다.**
//    이미 받은 사건 패킷 안의 `intel`(인텔 패킷 v1, aws/cyclone-analog/intel_v1.py) 을 그릴 뿐이다.
//    SELECT·INFORMATION 에서 LLM·Simulation 을 부르면 계약 위반이다.
// ⚠️ 빈 절은 그리지 않는다 — 재료가 없는 절은 질문 목록에서 빠진다(빈 NEXT 카드 금지, §C-0 표).
// ⚠️ WHY 는 "함께 나타난 조건"이다. 원인이라고 쓰지 않는다(FORBIDDEN_CAUSAL).
//
// 요금제 (정본 PRODUCT-STRUCTURE-AND-TIERS-2026-09-14 §3):
//   기본(WHAT·CHANGE·기관 예보·출처)          FREE
//   고급(WHY·RELATION/IMPACT·Confidence)       EXPLORER — FREE 는 결과 일부 노출 뒤 잠금 설명
// 판정은 access-mode.js decideCapabilityAccess 하나로 한다. FREE_OPEN(유료 출시 전)이면 전부 열린다.

import { INTEL_QUESTIONS, sectionStatus, hasIntel, INTEL_ACTION } from './intel-questions.js?v=1';
import { decideCapabilityAccess, lockExplanation, TIER } from '../../js/access-mode.js';

export const SECTION_TIER = Object.freeze({
  WHAT: TIER.FREE, NEXT: TIER.FREE, EVIDENCE: TIER.FREE,
  WHY: TIER.EXPLORER, IMPACT: TIER.EXPLORER,
});

// 이름표 — 태풍 패킷은 labelKo 를 싣지 않아 여기서 붙인다. P3 부터 패킷 값이 labelKo·labelEn 을 직접 싣는다
// (수온·지진). 값에 이름표가 있으면 그것이 이긴다 — 현상마다 이 표를 늘리지 않는다(같은 띠, 분기 없음).
const LABEL = Object.freeze({
  maxWind: ['최대풍속', 'Max wind'], centerLat: ['중심 위도', 'Centre lat'], centerLon: ['중심 경도', 'Centre lon'],
  moveSpeed: ['이동 속도', 'Moving speed'], grade: ['강도 등급', 'Intensity class'],
  sstAtCenter: ['중심 아래 해수면 온도', 'Sea surface temperature under the centre'],
  aftershocksM3: ['여진(M3 이상)', 'Aftershocks (M3+)'], aftershocksM4: ['여진(M4 이상)', 'Aftershocks (M4+)'],
});
// 띠 한 줄에 올리지 않는 값 — 좌표는 절 본문에서만 보인다.
const NOT_IN_SUMMARY = new Set(['deg']);
// NEXT 항목의 근거 유형 — 기관 예보(유형 A)와 EARTHUS 통계 모형(유형 B)을 같은 말로 부르지 않는다.
const NEXT_KIND = Object.freeze({
  OFFICIAL_FORECAST: ['유형 A 기관 인용 — 우리가 만든 예보가 아닙니다', 'Type A agency quote — not our forecast'],
  // 계약 NEXT_TYPE 상 유형 A 이지만 기관이 아니다(Open-Meteo 등 예보 제공자). 화면에서 '기관'이라 부르지 않는다.
  PROVIDER_FORECAST: ['유형 A 예보 제공자 인용 — 기관 발표도, 우리가 만든 예보도 아닙니다', 'Type A forecast-provider quote — neither an agency forecast nor ours'],
  EARTHUS_FORECAST: ['유형 B EARTHUS 통계 모형 — 기관 예보가 아닙니다', 'Type B EARTHUS statistical model — not an agency forecast'],
});
const SEC_TITLE = Object.freeze({
  WHAT: ['지금 무슨 일이', 'What is happening'], WHY: ['함께 나타난 조건', 'Conditions observed alongside'],
  NEXT: ['앞으로 — 기관 예보', 'Next — agency forecasts'], IMPACT: ['이어져 있는 것', 'Connected to'],
  EVIDENCE: ['무엇으로 아나', 'How we know'],
});
const REL = Object.freeze({
  computed: ['계산된 연결', 'computed link'], co_located: ['같은 자리·같은 때', 'same place, same time'],
  reference: ['교과서 관계 — 이번 사건에서 계산한 연결이 아님', 'textbook relation — not computed for this event'],
});

const plainEsc = (s) => String(s == null ? '' : s)
  .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
const lab = (key, ko, v) => {
  const own = v && (ko ? v.labelKo : v.labelEn);
  if (own) return own;
  return LABEL[key] ? LABEL[key][ko ? 0 : 1] : key;
};
const fmtAt = (iso) => (iso ? String(iso).replace('T', ' ').replace(/:\d\d(\.\d+)?(Z|[+-]\d\d:?\d\d)$/, ' $2').replace(' Z', ' UTC') : '');
// 'M'(규모)는 이름표가 이미 말한다 — "규모 6.3 M" 이 아니라 "규모 6.3". 개수는 한국어에서만 '건'.
const unitTxt = (u, ko = true) => {
  if (!u || u === 'category' || u === 'M') return '';
  if (u === 'count') return ko ? '건' : '';
  if (u === 'deg') return '°';
  return ` ${u}`;
};

// 섹션 하나를 볼 수 있는가 — FREE_OPEN 이면 언제나 참.
export const sectionAccess = (section, { mode = 'FREE_OPEN', tier = TIER.FREE } = {}) => decideCapabilityAccess({
  mode, userTier: tier, requiredTier: SECTION_TIER[section] || TIER.FREE,
});

// 사건 패킷에서 인텔 v1 을 꺼낸다. 계약 밖 모양이면 없다고 본다(schema 확인만 — 검사는 서버가 했다).
export const intelOf = (eventPacket) => {
  const v = eventPacket && eventPacket.intel;
  return v && v.schema === 1 && v.phenomenonId ? v : null;
};

// 띠 본체 — WHAT 요약 카드 + 재료가 있는 절의 질문. 패킷이 없으면 아무것도 그리지 않는다.
export const intelStripHtml = ({ phenomenonId, packet, i18n, esc = plainEsc, badge = () => '', mode, tier }) => {
  if (!packet || !hasIntel(phenomenonId) || packet.phenomenonId !== phenomenonId) return '';
  const ko = !!(i18n && i18n.ko);
  const cur = (packet.current && packet.current.values) || [];
  const pick = (k) => cur.find((v) => v.key === k);
  const wind = pick('maxWind');
  const grade = pick('grade');
  const chg = packet.change && packet.change.items && packet.change.items[0];
  const mot = packet.pattern && packet.pattern.motion;
  const parts = [];
  // 한 줄의 머리 값 — 태풍은 최대풍속·등급, 그 밖의 현상은 패킷이 앞에 둔 값(좌표 제외) 셋까지.
  const lead = wind || cur.find((v) => !NOT_IN_SUMMARY.has(v.unit)) || null;
  if (wind) parts.push(`${esc(lab('maxWind', ko))} <b>${esc(wind.value)}${esc(unitTxt(wind.unit, ko))}</b>${grade ? ` · ${esc(grade.value)}` : ''}`);
  else {
    for (const v of cur.filter((x) => !NOT_IN_SUMMARY.has(x.unit)).slice(0, 3)) {
      parts.push(`${esc(lab(v.key, ko, v))} <b>${esc(v.value)}${esc(unitTxt(v.unit, ko))}</b>`);
    }
  }
  if (chg && Number.isFinite(chg.delta)) {
    // 태풍은 머리 값이 곧 바뀐 값이라 '변화'만 쓴다. 다른 현상은 무엇이 바뀌었는지 이름을 붙인다.
    const what = wind ? (ko ? '변화' : 'Change')
      : `${lab(chg.key, ko, cur.find((v) => v.key === chg.key))} ${ko ? '변화' : 'change'}`;
    parts.push(`${esc(what)} <b>${chg.delta > 0 ? '+' : ''}${esc(chg.delta)}${esc(unitTxt(chg.unit, ko))}</b>`);
  }
  if (mot && mot.courseKo) parts.push(`${ko ? '진행' : 'Heading'} ${esc(mot.courseKo)}${Number.isFinite(mot.speedKmh) ? ` ${esc(mot.speedKmh)} km/h` : ''}`);
  const src = lead ? `${esc(lead.source)} · ${esc(fmtAt(lead.at))}` : '';
  const qs = INTEL_QUESTIONS
    .map((q) => ({ q, st: sectionStatus(packet, q.section) }))
    .filter(({ st }) => st.status === 'available')       // 빈 절은 질문도 없다
    .map(({ q }) => {
      const acc = sectionAccess(q.section, { mode, tier });
      const lock = acc.allowed ? '' : ` <span class="sq-lock">${ko ? 'EXPLORER' : 'EXPLORER'}</span>`;
      // data-phen — 누른 절을 어느 현상의 패킷에서 열지 main.js 가 알게 한다(태풍·지진·수온이 같은 문을 쓴다).
      return `<button class="sq-q" data-action="${INTEL_ACTION}" data-sec="${q.section}" data-phen="${esc(phenomenonId)}">${esc(ko ? q.ko : q.en)}${lock}</button>`;
    }).join('');
  return `<div class="intel-strip sim-questions" data-intel-phenomenon="${esc(phenomenonId)}">`
    + `<div class="sq-h">INTELLIGENCE ${badge(lead ? lead.kind : 'OFFICIAL_OBSERVATION')}</div>`
    + (parts.length ? `<div class="is-now">${parts.join(' · ')}</div><div class="sq-why">${src}</div>` : '')
    + qs + '</div>';
};

const lockBlock = (section, ko, esc) => {
  const l = lockExplanation({ cap: sectionTitle(section, ko), requiredTier: TIER.EXPLORER, ko });
  return `<div class="card"><div class="card-b"><b>${esc(l.what)}</b><br/>${esc(l.why)}<br/>${esc(l.adds)}<br/><span class="paysub">${esc(l.upgrade)}</span></div></div>`;
};

// 절 하나의 본문 — intel-q 를 누르면 main.js 가 이것을 카드로 연다.
export const intelSectionHtml = ({ packet, section, i18n, esc = plainEsc, badge = () => '', mode, tier }) => {
  const ko = !!(i18n && i18n.ko);
  if (!packet) return `<div class="card"><div class="card-b">${ko ? '이 현상의 분석 패킷이 아직 없습니다.' : 'No analysis packet yet.'}</div></div>`;
  const st = sectionStatus(packet, section);
  if (st.status !== 'available') {
    return `<div class="card"><div class="card-b">${esc(st.reason || (ko ? '이 절은 지금 만들 재료가 없습니다.' : 'No material for this section right now.'))}</div></div>`;
  }
  const acc = sectionAccess(section, { mode, tier });
  const row = (k, v, extra = '') => `<div class="stat"><span class="k">${esc(k)}</span><span class="v">${v}</span></div>${extra}`;
  const out = [];
  if (section === 'WHAT') {
    const curVals = (packet.current && packet.current.values) || [];
    for (const v of curVals) {
      out.push(row(lab(v.key, ko, v), `${esc(v.value)}${esc(unitTxt(v.unit, ko))} ${badge(v.kind)}`, `<div class="paysub">${esc(v.source)} · ${esc(fmtAt(v.at))}</div>`));
    }
    for (const c of (packet.change && packet.change.items) || []) {
      const named = curVals.find((v) => v.key === c.key);
      out.push(row(`${lab(c.key, ko, named)} ${ko ? '변화' : 'change'}`, `${esc(c.from)} → ${esc(c.to)}${esc(unitTxt(c.unit, ko))} (${c.delta > 0 ? '+' : ''}${esc(c.delta)})`,
        `<div class="paysub">${ko ? '기준' : 'since'} ${esc(fmtAt(c.since || (packet.change.windows || {}).since))} · ${esc(c.source)}</div>`));
    }
    // 평년 대비(수온) — 기관이 낸 평년과의 차를 옮긴다. EARTHUS 기준선 계산이 아니다(§I L-4 대기).
    const an = packet.anomaly;
    if (an && Array.isArray(an.items) && an.items.length) {
      for (const a of an.items) {
        out.push(row(`${lab(a.key, ko, a)} ${ko ? '평년 대비' : 'vs normal'}`,
          `${a.delta > 0 ? '+' : ''}${esc(a.delta)}${esc(unitTxt(a.unit, ko))} ${badge(a.kind)}`,
          `<div class="paysub">${ko ? '관측' : 'observed'} ${esc(a.value)}${esc(unitTxt(a.unit, ko))} · ${ko ? '평년' : 'normal'} ${esc(a.baseline)}${esc(unitTxt(a.unit, ko))}${a.method && ko ? ` · ${esc(a.method)}` : ''} · ${esc(a.source)}</div>`));
      }
      if (an.baseline) out.push(`<div class="paysub">${ko ? '평년' : 'Normal'}: ${esc(an.baseline.name || '')} · ${esc(an.baseline.period || '')}</div>`);
      if (ko && an.coverageKo) out.push(`<div class="paysub">${esc(an.coverageKo)}</div>`);
    }
    const p = packet.pattern || {};
    if (p.persistence && Number.isFinite(p.persistence.hoursSinceDetected)) out.push(row(ko ? '탐지 뒤 지속' : 'Tracked for', `${esc(p.persistence.hoursSinceDetected)} h`));
    if (p.persistence && Number.isFinite(p.persistence.daysSinceMainshock)) out.push(row(ko ? '본진 뒤' : 'Since mainshock', `${esc(p.persistence.daysSinceMainshock)} ${ko ? '일' : 'days'}`));
    // 여진 순서(지진) — 실제 여진 수(관측)와 일반형 모형의 기대수(EARTHUS 계산)를 나란히. 모형은 지역 보정이 없다.
    if (p.sequence && Array.isArray(p.sequence.windows)) {
      for (const w of p.sequence.windows) {
        out.push(row(w.window, `${ko ? '실제' : 'observed'} ${esc(w.observedM4)}${esc(unitTxt('count', ko))} ${badge(w.observedKind)} · ${ko ? '모형 기대' : 'model'} ${esc(w.rjExpectedM4)} ${badge(w.rjKind)}`));
      }
      const m = p.sequence.model || {};
      const note = ko ? m.noteKo : m.noteEn;
      if (m.name || note) out.push(`<div class="paysub">${esc(m.name || '')}${note ? ` — ${esc(note)}` : ''}</div>`);
    }
    if (p.spread && p.spread.agencySpreadKm) {
      const s = Object.entries(p.spread.agencySpreadKm).map(([h, km]) => `+${esc(h)}h ${esc(km)} km`).join(' · ');
      out.push(row(ko ? '기관 예보 위치 차' : 'Agency spread', s));
    }
  } else if (section === 'WHY') {
    const items = packet.conditions || [];
    const shown = acc.allowed ? items : items.slice(0, 1);           // FREE: 결과 일부 노출
    for (const c of shown) {
      out.push(row(lab(c.key, ko), `${esc(c.value)}${esc(unitTxt(c.unit || ''))} ${badge(c.kind)}`, `<div class="paysub">${esc(c.source)}${c.at ? ` · ${esc(fmtAt(c.at))}` : ''}</div>`));
    }
    out.push(`<div class="paysub">${ko ? '함께 나타난 조건입니다 — 원인이라고 말하지 않습니다.' : 'Conditions observed together — not a statement of cause.'}</div>`);
    if (!acc.allowed) out.push(lockBlock(section, ko, esc));
  } else if (section === 'NEXT') {
    for (const n of (packet.next && packet.next.items) || []) {
      const peak = n.peak && Number.isFinite(n.peak.windMs) ? ` · ${ko ? '최대' : 'peak'} ${esc(n.peak.windMs)} m/s ${esc(n.peak.gradeKo || '')}` : '';
      const kindTxt = (NEXT_KIND[n.kind] || NEXT_KIND.OFFICIAL_FORECAST)[ko ? 0 : 1];
      out.push(row(n.source, `${esc(n.headingKo || '')}${n.horizonH ? ` · +${esc(n.horizonH)}h` : ''}${peak} ${badge(n.kind)}`,
        `<div class="paysub">${ko ? '발표' : 'issued'} ${esc(fmtAt(n.issuedAt))} · ${esc(kindTxt)}</div>`));
    }
  } else if (section === 'IMPACT') {
    const rel = packet.related || [];
    const shown = acc.allowed ? rel : rel.slice(0, 1);
    for (const r of shown) {
      const ev = r.evidence || {};
      const detail = r.relation === 'reference' ? esc(ev.citation || '')
        : `${esc(ev.rule || '')}${Number.isFinite(ev.distanceKm) ? ` · ${esc(ev.distanceKm)} km` : ''}`;
      out.push(row(r.phenomenonId, esc((REL[r.relation] || [r.relation, r.relation])[ko ? 0 : 1]), `<div class="paysub">${detail}</div>`));
    }
    if (!acc.allowed) out.push(lockBlock(section, ko, esc));
  } else if (section === 'EVIDENCE') {
    for (const s of packet.sources || []) {
      out.push(row(s.id, `${badge(s.kind)} ${s.ageMin != null ? `${esc(s.ageMin)} ${ko ? '분 전' : 'min ago'}` : ''}`));
    }
    if (packet.confidence) {
      // Confidence 는 EXPLORER — FREE 는 등급 이름만(결과 일부 노출), 규칙은 잠금 뒤.
      out.push(row(ko ? '신뢰 등급' : 'Confidence', esc(packet.confidence.grade),
        acc.allowed || sectionAccess('WHY', { mode, tier }).allowed
          ? `<div class="paysub">${esc((packet.confidence.inputs || {}).rule || '')}</div>` : ''));
    }
    const miss = ((packet.coverage || {}).missing) || [];
    if (miss.length) {
      out.push(`<div class="paysub">${ko ? '빠진 절' : 'Missing'}: ${miss.map((m) => `${esc(m.section)} — ${esc(m.reason)}`).join(' · ')}</div>`);
    }
  }
  const title = SEC_TITLE[section] ? SEC_TITLE[section][ko ? 0 : 1] : section;
  return `<div class="card"><div class="card-h">${esc(title)}</div><div class="card-b">${out.join('')}</div></div>`;
};

export const sectionTitle = (section, ko) => (SEC_TITLE[section] ? SEC_TITLE[section][ko ? 0 : 1] : section);
