// Ocean Core shadow 검수용 문자열 renderer.
// 공개 화면에 import하지 않으며, source/time/provenance/quality와 gate 차단을 한 번에 확인한다.

const escapeHtml = value => String(value ?? '').replace(/[&<>'"]/g, char => ({
  '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;',
})[char]);

function statusText(state, ko) {
  const messages = {
    BLOCKED: ko ? '활동 판단 차단' : 'Activity decision blocked',
    UNKNOWN: ko ? '안전자료 확인 불가 — 점수 숨김' : 'Safety evidence unavailable — score hidden',
    NO_BLOCKING_EVIDENCE: ko
      ? '공식 자료에서 차단 근거 미확인 — 안전을 뜻하지 않음'
      : 'No blocking evidence in official feeds — this does not mean safe',
  };
  return messages[state] || messages.UNKNOWN;
}

function timeOf(item) {
  return item?.observedAt || item?.validFrom || item?.generatedAt || null;
}

export function renderOceanSafetyShadow({
  safety = null, gatedResult = null, observations = [], lang = 'ko', title = null,
} = {}) {
  const ko = lang !== 'en';
  const state = safety?.state || 'UNKNOWN';
  const reasonItems = (Array.isArray(safety?.reasons) ? safety.reasons : ['SAFETY_UNKNOWN'])
    .map(reason => `<li><code>${escapeHtml(reason)}</code></li>`).join('');
  const evidenceItems = (Array.isArray(safety?.evidence) ? safety.evidence : []).map(item => {
    const freshness = item?.freshness?.status || 'UNKNOWN';
    return `<li data-kind="${escapeHtml(item?.kind || 'UNKNOWN')}">`
      + `<strong>${escapeHtml(item?.kind || 'UNKNOWN')}</strong> · `
      + `${escapeHtml(item?.state || 'UNKNOWN')} · ${escapeHtml(item?.sourceId || 'source missing')}`
      + `<br><time>${escapeHtml(timeOf(item) || (ko ? '시각 없음' : 'time unavailable'))}</time>`
      + ` · ${escapeHtml(freshness)}`
      + `${item?.reason ? `<br><code>${escapeHtml(item.reason)}</code>` : ''}</li>`;
  }).join('') || `<li>${ko ? '안전 evidence 없음' : 'No safety evidence'}</li>`;
  const observationItems = (Array.isArray(observations) ? observations : []).map(item => (
    `<li data-metric="${escapeHtml(item?.metric || 'UNKNOWN')}">`
    + `<strong>${escapeHtml(item?.metric || 'UNKNOWN')}</strong> · `
    + `${item?.value == null ? '—' : escapeHtml(item.value)} ${escapeHtml(item?.unit || '')}`
    + `<br>${escapeHtml(item?.provenance || 'UNKNOWN')} · `
    + `${escapeHtml(item?.sourceId || 'source missing')} · `
    + `<time>${escapeHtml(timeOf(item) || (ko ? '시각 없음' : 'time unavailable'))}</time> · `
    + `${escapeHtml(item?.quality || 'UNKNOWN')}</li>`
  )).join('') || `<li>${ko ? '관측값 없음' : 'No observations'}</li>`;
  const score = gatedResult?.score == null ? '—' : String(gatedResult.score);

  return `<section class="ocean-core-shadow" data-shadow-only="true" data-public="false" data-state="${escapeHtml(state)}">`
    + `<header><small>LOCAL SHADOW · NOT PUBLIC</small>`
    + `<h2>${escapeHtml(title || (ko ? 'Ocean Core 안전 검수' : 'Ocean Core safety review'))}</h2>`
    + `<p role="status">${escapeHtml(statusText(state, ko))}</p></header>`
    + `<dl><dt>${ko ? '활동 점수' : 'Activity score'}</dt><dd>${escapeHtml(score)}</dd>`
    // core gate가 열려도 shadow 화면은 검수면이므로 행동 CTA를 절대 만들지 않는다.
    + '<dt>CTA</dt><dd data-shadow-cta="disabled">DISABLED IN SHADOW</dd></dl>'
    + `<h3>${ko ? '차단·보류 근거' : 'Block and hold reasons'}</h3><ul>${reasonItems}</ul>`
    + `<h3>${ko ? '공식 안전 evidence' : 'Official safety evidence'}</h3><ul>${evidenceItems}</ul>`
    + `<h3>${ko ? '해양 입력' : 'Ocean inputs'}</h3><ul>${observationItems}</ul>`
    + `<footer>${ko
      ? '이 화면은 개발 검수용이며 출발·입수·조업 가능 여부를 안내하지 않습니다.'
      : 'Development review only. It does not advise departure, water entry, or fishing.'}</footer>`
    + '</section>';
}
