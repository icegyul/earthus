// Safety Engine의 판단 근거를 같은 문장 구조로 보여준다.
// ⚠️ UNKNOWN을 "특보 없음"으로 순화하지 않는다. 이 문구 자체가 안전 계약이다.

const KMA_WARNING_URL = 'https://www.weather.go.kr/w/special-report/overall.do';
const JMA_WARNING_URL = 'https://www.jma.go.jp/bosai/map.html#contents=warning';
const esc = s => String(s ?? '').replace(/[&<>"']/g, c =>
  ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

function compactTime(raw) {
  const s = String(raw || '');
  if (/^\d{12}/.test(s)) return `${s.slice(0, 4)}-${s.slice(4, 6)}-${s.slice(6, 8)} ${s.slice(8, 10)}:${s.slice(10, 12)} KST`;
  return s || '—';
}

function reasonCopy(gate, ko, countryCode) {
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
      if (countryCode === 'JP') return ko
        ? ['한국 기상청 적용 범위 밖', '이 좌표는 일본입니다. 일본 기상청 특보를 확인하세요.']
        : ['Outside KMA coverage', 'This coordinate is in Japan. Check Japan Meteorological Agency warnings.'];
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

export function safetyGateMarkup(gate, lang = 'ko', context = {}) {
  const ko = lang === 'ko';
  const countryCode = String(context?.countryCode || '').toUpperCase();
  const active = gate?.gate === 'OFFICIAL_WARNING_ACTIVE';
  const out = gate?.reason === 'KMA_OUT_OF_COVERAGE';
  const state = active ? (gate.status === 'DANGER' ? 'danger' : 'warning') : (out ? 'outside' : 'unknown');
  const [fallbackTitle, fallbackBody] = reasonCopy(gate, ko, countryCode);
  const count = Array.isArray(gate?.warnings) ? gate.warnings.length : 0;
  const firstWarning = active ? gate.warnings?.[0] : null;
  const zone = gate?.zone;
  const title = active
    ? (firstWarning
      ? `${ko ? firstWarning.kind : (firstWarning.kindEn || firstWarning.kind)} ${firstWarning.level || ''} ${ko ? '발효 중' : 'in effect'}`.trim()
      : (ko ? '공식 특보 발효 중' : 'Official warning in effect'))
    : fallbackTitle;
  const body = active
    ? `${[...new Set((gate.warnings || []).map(warning => warning.region || zone?.name).filter(Boolean))].join(' · ')}`
      + `${count > 1 ? ` · ${ko ? `특보 ${count}건` : `${count} warnings`}` : ''}`
      + `${ko ? ' · 활동 전 기상청 발표를 확인하세요.' : ' · Check the official bulletin before outdoor activity.'}`
    : fallbackBody;
  const level = active
    ? (count > 1 ? `${count}${ko ? '건' : ''}` : (firstWarning?.level || (ko ? '특보' : 'WARNING')))
    : (out ? (ko ? '범위 밖' : 'OUTSIDE') : 'UNKNOWN');
  const mapped = zone?.mapped
    ? (ko
      ? `구역 근사: ${zone.name || zone.id} · ${zone.station || '관측지점'} 약 ${Math.round(zone.km)}km · 공식 관측지점 ${zone.stationCount ?? '—'}개 표본`
      : `Approximate zone: ${zone.name || zone.id} · ${zone.station || 'station'} ~${Math.round(zone.km)}km · ${zone.stationCount ?? '—'} official station records`)
    : '';
  const evidence = gate?.evidence || {};
  const evidenceLine = evidence.source
    ? `${ko ? '출처' : 'Source'}: ${esc(ko ? evidence.source : (evidence.sourceEn || evidence.source))} · n=${esc(evidence.n ?? '—')} · ${esc(compactTime(evidence.observedKst || evidence.generated))}`
    : (ko ? '출처 자료 없음' : 'No source data');
  const officialLink = out && countryCode === 'JP'
    ? { url: JMA_WARNING_URL, text: ko ? '일본 기상청 특보에서 확인 ↗' : 'Check JMA warnings ↗' }
    : out
      ? null
      : { url: KMA_WARNING_URL, text: ko ? '기상청 공식 특보에서 확인 ↗' : 'Check official KMA warnings ↗' };

  return `<section class="safety-gate safety-gate--${state}" data-safety-status="${esc(gate?.status || 'UNKNOWN')}" aria-label="${esc(title)}">`
    + `<header><span>${ko ? '기상 안전' : 'WEATHER SAFETY'}</span><strong>${esc(level)}</strong></header>`
    + `<h4>${esc(title)}</h4><p>${esc(body)}</p>`
    + (mapped ? `<small>${esc(mapped)}<br>${ko ? '대조 방식 · 최근접 공식 관측지점' : 'Match method · nearest official station'}</small>` : '')
    + `<small>${evidenceLine}</small>`
    + (officialLink ? `<a href="${officialLink.url}" target="_blank" rel="noopener noreferrer">${officialLink.text}</a>` : '')
    + `</section>`;
}
