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
        ? ['자료 상태 확인 불가', '기상청 특보 자료를 받지 못했습니다. 현재 상태를 단정하지 않습니다.']
        : ['Warning status unavailable', 'KMA warning data could not be loaded. Current conditions are not inferred.'];
    case 'PROVIDER_DELAY':
      return ko
        ? ['자료 지연 · 안전 판정 아님', '마지막 특보 자료가 45분 넘게 갱신되지 않아 현재 발효 상태를 단정하지 않습니다.']
        : ['Delayed data · not a safety finding', 'The last warning snapshot is over 45 minutes old, so current status is not inferred.'];
    case 'TIME_IN_FUTURE':
    case 'TIME_MISSING':
      return ko
        ? ['시각 검증 실패 · 안전 판정 아님', '출처 시각을 검증하지 못해 현재 특보 상태로 사용하지 않습니다.']
        : ['Time check failed · not a safety finding', 'The source time could not be verified, so this is not used as current warning status.'];
    case 'LOCATION_MISSING':
      return ko
        ? ['위치 확인 전 · 안전 판정 아님', '위치가 없어 내 특보구역과 대조하지 못했습니다. 아래 전국 특보를 직접 확인하세요.']
        : ['Location unavailable · not a safety finding', 'Your location could not be matched to a warning zone. Check the nationwide list below.'];
    case 'REGION_UNMAPPED':
      return ko
        ? ['구역 매핑 실패 · 안전 판정 아님', '60km 안에서 대응 관측지점을 찾지 못했습니다. 결측을 무특보나 안전으로 바꾸지 않습니다.']
        : ['Region unmapped · not a safety finding', 'No corresponding station was found within 60 km. Missing data is not treated as no warning or safe.'];
    case 'KMA_OUT_OF_COVERAGE':
      return ko
        ? ['기상청 적용 범위 밖', '이 판정은 한국 기상청 특보에만 적용됩니다. 현지 공식 기관의 안내를 확인하세요.']
        : ['Outside KMA coverage', 'This gate covers Korean KMA warnings only. Check your local authority.'];
    case 'NO_MATCH_NOT_SAFE':
      return ko
        ? ['안전 판정 아님', '근사한 내 구역 코드와 정확히 일치하는 발효 특보를 찾지 못했습니다. 특보가 없거나 안전하다는 뜻이 아닙니다.']
        : ['Not a safety finding', 'No active warning exactly matched the approximated zone code. This does not mean no warning or safe.'];
    default:
      return ko
        ? ['판정 보류', '공식 특보 근거를 확인하기 전에는 안전 상태를 만들지 않습니다.']
        : ['Decision held', 'No safe state is created before official warning evidence is verified.'];
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
  const title = active ? (ko ? '공식 특보 우선 · 추천 제한' : 'Official warning first · recommendation restricted') : fallbackTitle;
  const body = active
    ? (ko
      ? `최근접 관측소의 특보구역 코드와 같은 기상청 발효 특보 ${count}건을 확인했습니다. 활동 점수가 높아도 긍정 추천보다 먼저 제한합니다.`
      : `${count} active KMA warning(s) exactly match the nearest station's warning-zone code. This restriction overrides any positive activity score.`)
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
    + `<header><span>${ko ? 'SAFETY ENGINE' : 'SAFETY ENGINE'}</span><strong>${esc(level)}</strong></header>`
    + `<h4>${esc(title)}</h4><p>${esc(body)}</p>`
    + (mapped ? `<small>${esc(mapped)}<br>${ko ? '이 매핑은 공식 구역 경계 polygon이 아닌 근사입니다.' : 'This mapping is an approximation, not an official zone-boundary polygon.'}</small>` : '')
    + `<small>${evidenceLine}</small>`
    + `<a href="${KMA_WARNING_URL}" target="_blank" rel="noopener noreferrer">${ko ? '기상청 공식 특보에서 확인 ↗' : 'Check official KMA warnings ↗'}</a>`
    + `</section>`;
}
