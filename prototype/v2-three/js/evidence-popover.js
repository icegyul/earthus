// EARTHUS — 근거 배지 설명 (M1 EvidenceBadge 팝오버 · 착수 지시 "정의·출처·발표/갱신/수집·하지 말 것" · 2026-09-20)
//
// 배지(공식 관측·제공자 모델·시뮬레이션 …)를 누르면 그 배지가 **무엇이고, 무엇으로 쓰면 안 되는지**를 한 장으로 보여 준다.
// 어휘는 EVIDENCE_KIND 10종 하나다(aws/_shared/contracts/intel-vocab.json) — 새 어휘를 만들지 않는다.
//
// ⚠️ 출처·발표·갱신·수집 시각은 배지가 아니라 **그 카드의 출처 줄**에 있다(값마다 다르다). 여기서 지어내지 않고
//    "카드의 출처 줄을 보세요"라고 가리킨다.
// ⚠️ 버튼 안에 든 배지는 가로채지 않는다 — 메뉴 줄을 눌렀는데 설명이 뜨면 안 된다.

export const KIND_INFO = Object.freeze({
  OFFICIAL_OBSERVATION: { ko: ['공식 관측', '기관(기상청·NOAA 등)이 실제로 잰 값입니다.', '앞으로의 값(예보)으로 읽지 마세요.'],
    en: ['Official observation', 'A value an agency actually measured.', 'Do not read it as a forecast.'] },
  OFFICIAL_FORECAST: { ko: ['공식 예보', '기관이 발표한 예보입니다.', '일어난 사실로 읽지 마세요. 발표 시각이 지나면 새 발표를 확인하세요.'],
    en: ['Official forecast', 'A forecast issued by an agency.', 'Do not read it as something that happened; check for newer issues.'] },
  OFFICIAL_WARNING: { ko: ['공식 특보', '기관이 발효한 특보·경보 원문입니다.', 'EARTHUS 가 판단한 위험으로 읽지 마세요. 행동은 기관 안내를 따르세요.'],
    en: ['Official warning', 'A warning text in force, issued by an agency.', 'It is not EARTHUS’s judgement — follow agency guidance.'] },
  PROVIDER_FORECAST: { ko: ['제공자 모델', '민간·연구 제공자의 모델 값입니다 — 공식 예보가 아닙니다.', '공식 발표로 인용하지 마세요.'],
    en: ['Provider model', 'A model value from a commercial or research provider — not an official forecast.', 'Do not quote it as an official statement.'] },
  EARTHUS_ANALYSIS: { ko: ['자체 분석', 'EARTHUS 가 관측·공식 자료로 계산한 파생값입니다.', '기관 발표로 인용하지 마세요.'],
    en: ['EARTHUS analysis', 'A derived value EARTHUS computed from observations and official data.', 'Do not quote it as an agency statement.'] },
  EARTHUS_FORECAST: { ko: ['자체 예보', 'EARTHUS 가 만든 전망입니다(검증 기록과 함께 냅니다).', '공식 예보를 대신하지 마세요.'],
    en: ['EARTHUS outlook', 'An outlook EARTHUS produced, published with its verification record.', 'Do not use it in place of official forecasts.'] },
  ESTIMATED_DISTRIBUTION: { ko: ['추정 분포', '통계로 추정한 분포입니다(예: 인구 격자).', '한 지점의 실측값으로 읽지 마세요.'],
    en: ['Estimated distribution', 'A statistically estimated distribution (e.g. population grid).', 'Do not read it as a measurement at one spot.'] },
  SIMULATION: { ko: ['시뮬레이션', 'EARTHUS 계산 엔진이 가정 위에서 낸 결과입니다. 한계 문장과 함께 봅니다.', '대피·안전 판단에 쓰지 마세요 — 공식 경보를 따르세요.'],
    en: ['Simulation', 'A result from an EARTHUS engine under stated assumptions; read it with its limits.', 'Do not use it for evacuation or safety decisions — follow official warnings.'] },
  HISTORY: { ko: ['기록', '지난 기록입니다.', '지금 상태로 읽지 마세요.'],
    en: ['History', 'A past record.', 'Do not read it as the current state.'] },
  VISUALIZATION_ONLY: { ko: ['표현', '보이게 하려고 그린 장면입니다.', '측정값이나 예보로 읽지 마세요.'],
    en: ['Visualization', 'A scene drawn to make things visible.', 'Do not read it as a measurement or a forecast.'] },
});

const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

export const popoverHtml = (kind, ko = true) => {
  const info = KIND_INFO[kind];
  if (!info) return '';
  const [name, def, dont] = ko ? info.ko : info.en;
  return `<b>${esc(name)}</b><div>${esc(def)}</div><div class="ev-dont">${ko ? '하지 말 것' : 'Do not'} — ${esc(dont)}</div>`
    + `<div class="ev-src">${ko ? '출처·발표·갱신 시각은 이 카드의 출처 줄에 있습니다.' : 'Source and issue/update times are on this card’s source line.'}</div>`;
};

let attached = false;
export const attachEvidencePopover = (i18n) => {
  if (attached) return;
  attached = true;
  let pop = null;
  const close = () => { if (pop) { pop.remove(); pop = null; } };
  const open = (badge) => {
    close();
    const html = popoverHtml(badge.dataset.kind, !!(i18n && i18n.ko));
    if (!html) return;
    pop = document.createElement('div');
    pop.id = 'ev-pop';
    pop.setAttribute('role', 'tooltip');
    pop.innerHTML = html;
    document.body.appendChild(pop);
    const r = badge.getBoundingClientRect();
    const w = Math.min(280, innerWidth - 16);
    pop.style.width = `${w}px`;
    pop.style.left = `${Math.max(8, Math.min(innerWidth - w - 8, r.left))}px`;
    const below = r.bottom + 8;
    pop.style.top = `${below + pop.offsetHeight > innerHeight - 8 ? Math.max(8, r.top - pop.offsetHeight - 8) : below}px`;
  };
  document.addEventListener('click', (e) => {
    const badge = e.target.closest('.badge[data-kind]');
    if (badge && !badge.closest('button, a, [data-action]')) { e.stopPropagation(); open(badge); return; }
    if (!e.target.closest('#ev-pop')) close();
  }, true);
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') close();
    if ((e.key === 'Enter' || e.key === ' ') && e.target.matches?.('.badge[data-kind]')) { e.preventDefault(); open(e.target); }
  });
};
