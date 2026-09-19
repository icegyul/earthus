// EARTHUS — 공식 특보 배너 (M1 · 지시서 v1.1 §4.4 OfficialWarningBanner · 2026-09-20)
//
// 내 장소 근처에 기상청이 발효 중이라고 밝힌 특보가 있으면 화면 위에 한 줄로 알린다.
//
// ⚠️⚠️ 규칙
//   · 공식 특보는 **모든 요금제에서 같다**(무료). 잠그지 않는다.
//   · 문장을 짓지 않는다. 지역·종류·수준·발효 시각은 기상청 기록 그대로다. '대피하세요' 같은 행동 지시를
//     우리가 쓰지 않는다 — 누르면 원문이 있는 내 지역 화면으로 간다.
//   · CAP 1.2 정규화 칸(cap, aws/_shared/cap_map.py)이 있으면 status 가 Actual 이 아닌 것(시험·연습·초안·
//     시스템)과 해제(Cancel)는 띄우지 않는다. cap 이 없는 옛 기록은 기상청 원본이므로 그대로 띄운다.
//   · 심각도 색은 cap.severity(수준에서 옮긴 값)만 쓴다. Unknown 이면 중립색이다 — 추측해서 빨갛게 하지 않는다.
//   · 특보 자료가 늙었으면(SLA 60분 초과) 띄우지 않고 '확인할 수 없다'고도 여기서는 말하지 않는다 —
//     그 말은 내 지역 화면이 한다(배너가 '없음'을 뜻하지 않게, 배너는 '있을 때'만 나온다).

const SEV_ORDER = { Extreme: 3, Severe: 2, Moderate: 1, Minor: 0, Unknown: -1 };
const SEV_COLOR = { Extreme: '#b05cff', Severe: '#ff5a5a', Moderate: '#f5a524', Minor: '#7fb7f5', Unknown: '#9aa7b8' };

export const displayable = (w) => {
  const cap = w && w.cap;
  if (!cap) return true;                                   // cap 이전 기록 — 기상청 원본
  if (cap.status !== 'Actual') return false;               // 시험·연습·초안·시스템
  if (cap.msgType === 'Cancel') return false;              // 해제
  return true;
};

const kst = (s) => (s && /^\d{12}$/.test(String(s)) ? `${s.slice(8, 10)}:${s.slice(10, 12)}` : '');

// 순수 모델 — 시험이 이것을 본다. warns: kma-warn active[] 중 내 장소 근처로 이미 거른 것.
export const bannerModel = (warns, { stale = false } = {}) => {
  if (stale || !Array.isArray(warns)) return null;
  const shown = warns.filter(displayable);
  if (!shown.length) return null;
  const sev = (w) => (w.cap && w.cap.severity) || 'Unknown';
  const top = [...shown].sort((a, b) => (SEV_ORDER[sev(b)] ?? -1) - (SEV_ORDER[sev(a)] ?? -1)
    || (b.levelRank || 0) - (a.levelRank || 0))[0];
  const kinds = [...new Set(shown.map((w) => `${w.kind}${w.level || ''}`))];
  return {
    count: shown.length,
    severity: sev(top),
    color: SEV_COLOR[sev(top)] || SEV_COLOR.Unknown,
    headline: `${top.region || ''} ${top.kind || ''}${top.level || ''}`.trim(),
    more: kinds.length > 1 ? kinds.length - 1 : 0,
    effective: kst(top.effectiveKst),
    source: '기상청',
  };
};

// 화면 — 이미 있으면 갱신, 없어지면 지운다. onOpen: 누르면 내 지역 화면.
export const renderWarningBanner = (model, { onOpen, ko = true } = {}) => {
  let el = document.getElementById('warn-banner');
  if (!model) { if (el) el.remove(); return null; }
  try { if (sessionStorage.getItem('earthus.warnBanner.hide') === model.headline) return null; } catch (_) { /* 무시 */ }
  if (!el) {
    el = document.createElement('div');
    el.id = 'warn-banner';
    el.setAttribute('role', 'alert');
    document.body.appendChild(el);
    el.addEventListener('click', (e) => {
      if (e.target.closest('[data-wb="x"]')) {
        try { sessionStorage.setItem('earthus.warnBanner.hide', el.dataset.headline || ''); } catch (_) { /* 무시 */ }
        el.remove();
        return;
      }
      if (typeof el._onOpen === 'function') el._onOpen();
    });
  }
  el._onOpen = onOpen;
  el.dataset.headline = model.headline;
  el.style.setProperty('--wb', model.color);
  const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  el.innerHTML = `<span class="wb-dot"></span><b>${esc(model.headline)}</b>`
    + (model.more ? ` ${ko ? `외 ${model.more}종` : `+${model.more}`}` : '')
    + ` <span class="wb-src">${ko ? '발효 중' : 'in force'}${model.effective ? ` · ${esc(model.effective)}` : ''} · ${esc(model.source)}</span>`
    + `<button type="button" data-wb="x" aria-label="${ko ? '배너 닫기' : 'Dismiss'}">✕</button>`;
  return el;
};
