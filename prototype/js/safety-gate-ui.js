// Safety Engine의 판단 근거를 같은 문장 구조로 보여준다.
// ⚠️ UNKNOWN을 "특보 없음"으로 순화하지 않는다. 이 문구 자체가 안전 계약이다.

const KMA_WARNING_URL = 'https://www.weather.go.kr/w/special-report/overall.do';
const esc = s => String(s ?? '').replace(/[&<>"']/g, c =>
  ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

function compactTime(raw) {
  const s = String(raw || '');
  if (/^\d{12}/.test(s)) return `${s.slice(0, 4)}-${s.slice(4, 6)}-${s.slice(6, 8)} ${s.slice(8, 10)}:${s.slice(10, 12)} KST`;
  return s || '—';
}

function reasonCopy(gate, ko) {
  switch (gate?.reason) {
    case 'PROVIDER_UNAVAILABLE':
      return ko
        ? ['특보 자료 연결 실패', '기상청 공식 특보에서 현재 상태를 확인하세요.']
        : ['Warning feed unavailable', 'Check current status in official KMA warnings.'];
    case 'PROVIDER_DELAY':
      return ko
        ? ['특보 자료 지연', '마지막 수신 후 45분 이상 · 기상청 공식 특보 확인']
        : ['Warning feed delayed', 'More than 45 minutes since last receipt · check official KMA warnings'];
    case 'TIME_IN_FUTURE':
    case 'TIME_MISSING':
      return ko
        ? ['특보 자료 시각 오류', '출처 시각 확인 실패 · 기상청 공식 특보 확인']
        : ['Warning time unavailable', 'Source time check failed · check official KMA warnings'];
    case 'LOCATION_MISSING':
      return ko
        ? ['위치 필요', '내 특보구역 대조를 위해 위치를 선택하세요.']
        : ['Location needed', 'Choose a location to match a warning zone.'];
    case 'REGION_UNMAPPED':
      return ko
        ? ['특보 구역 연결 실패', '60km 안의 대응 관측지점 없음 · 기상청 공식 특보 확인']
        : ['Warning zone unmapped', 'No matching station within 60 km · check official KMA warnings'];
    case 'KMA_OUT_OF_COVERAGE':
      return ko
        ? ['기상청 적용 범위 밖', '이 판정은 한국 기상청 특보에만 적용됩니다. 현지 공식 기관의 안내를 확인하세요.']
        : ['Outside KMA coverage', 'This gate covers Korean KMA warnings only. Check your local authority.'];
    case 'NO_MATCH_NOT_SAFE':
      return ko
        ? ['근사 구역 대조', '일치 특보 0건 · 기상청 공식 특보에서 확인']
        : ['Approximate-zone match', '0 matching warnings · verify in official KMA warnings'];
    default:
      return ko
        ? ['특보 확인 중', '기상청 공식 특보 연결 대기']
        : ['Checking warnings', 'Waiting for official KMA warning data'];
  }
}

export function safetyGateMarkup(gate, lang = 'ko') {
  const ko = lang === 'ko';
  const active = gate?.gate === 'OFFICIAL_WARNING_ACTIVE';
  const out = gate?.reason === 'KMA_OUT_OF_COVERAGE';
  const state = active ? (gate.status === 'DANGER' ? 'danger' : 'warning') : (out ? 'outside' : 'unknown');
  const [fallbackTitle, fallbackBody] = reasonCopy(gate, ko);
  const count = Array.isArray(gate?.warnings) ? gate.warnings.length : 0;
  const zone = gate?.zone;
  const title = active ? (ko ? '공식 특보 · 추천 제한' : 'Official warning · recommendation restricted') : fallbackTitle;
  const body = active
    ? (gate.warnings || []).slice(0, 3).map(warning => [
      ko ? warning.kind : (warning.kindEn || warning.kind),
      warning.level,
      warning.region || zone?.name,
    ].filter(Boolean).join(' · ')).join(' / ') || `${count}${ko ? '건' : ''}`
    : fallbackBody;
  const level = active ? (ko ? '제한' : 'RESTRICT') : (out ? (ko ? '범위 밖' : 'OUTSIDE') : 'UNKNOWN');
  const mapped = zone?.mapped
    ? (ko
      ? `구역 근사: ${zone.name || zone.id} · ${zone.station || '관측지점'} 약 ${Math.round(zone.km)}km · 공식 관측지점 ${zone.stationCount ?? '—'}개 표본`
      : `Approximate zone: ${zone.name || zone.id} · ${zone.station || 'station'} ~${Math.round(zone.km)}km · ${zone.stationCount ?? '—'} official station records`)
    : '';
  const evidence = gate?.evidence || {};
  const evidenceLine = evidence.source
    ? `${ko ? '출처' : 'Source'}: ${esc(ko ? evidence.source : (evidence.sourceEn || evidence.source))} · n=${esc(evidence.n ?? '—')} · ${esc(compactTime(evidence.observedKst || evidence.generated))}`
    : (ko ? '출처 자료 없음' : 'No source data');

  return `<section class="safety-gate safety-gate--${state}" data-safety-status="${esc(gate?.status || 'UNKNOWN')}" aria-label="${esc(title)}">`
    + `<header><span>${ko ? '기상 안전' : 'WEATHER SAFETY'}</span><strong>${esc(level)}</strong></header>`
    + `<h4>${esc(title)}</h4><p>${esc(body)}</p>`
    + (mapped ? `<small>${esc(mapped)}<br>${ko ? '대조 방식 · 최근접 공식 관측지점' : 'Match method · nearest official station'}</small>` : '')
    + `<small>${evidenceLine}</small>`
    + `<a href="${KMA_WARNING_URL}" target="_blank" rel="noopener noreferrer">${ko ? '기상청 공식 특보에서 확인 ↗' : 'Check official KMA warnings ↗'}</a>`
    + `</section>`;
}
