// EARTHUS Pleos — 자료 상태 표시층
//
// 저장소에는 자료 상태 어휘가 원천마다 따로 있다 (docs/pleos/SOURCE_SURVEY.md §6).
// 이 파일은 원천 상태를 **바꾸지 않고** Pleos 화면용 다섯 상태로 옮겨 적는다.
//   FRESH · STALE · EXPIRED · UNAVAILABLE · ERROR
// 원래 상태(sourceState)는 그대로 함께 남긴다.
//
// ⚠️ 절대 금지: 실패 → "특보 없음"/"안전", 만료 → 활성, 오류 → "가능".
//    알 수 없는 원천 상태는 UNAVAILABLE 로 둔다 (FRESH 로 올리지 않는다).

export const FRESHNESS = Object.freeze({
  FRESH: 'FRESH',
  STALE: 'STALE',
  EXPIRED: 'EXPIRED',
  UNAVAILABLE: 'UNAVAILABLE',
  ERROR: 'ERROR',
});

const MAP = Object.freeze({
  // weather-contract-v7 DATA_STATE
  AVAILABLE: 'FRESH', ESTIMATED: 'FRESH', STALE: 'STALE', MISSING: 'UNAVAILABLE',
  NOT_SUPPORTED: 'UNAVAILABLE', INVALID: 'ERROR', CONFLICTING: 'ERROR',
  // safety-engine warningFreshness
  FRESH: 'FRESH', AGING: 'FRESH', FUTURE: 'ERROR', UNKNOWN: 'UNAVAILABLE',
  // tourism-flow-contract
  LIVE: 'FRESH', DEGRADED: 'STALE', UNAVAILABLE: 'UNAVAILABLE',
});

const iso = value => {
  if (value === null || value === undefined || value === '') return null;
  const t = Date.parse(value);
  return Number.isFinite(t) ? new Date(t).toISOString() : null;
};

/**
 * @param {object} input
 * @param {string} [input.sourceState] 원천 상태 문자열
 * @param {string} [input.validUntil]  이 시각이 지나면 EXPIRED
 * @param {boolean} [input.error]      요청 자체가 실패했는가
 */
export function describeFreshness({
  sourceState = null, source = null, observedAt = null, issuedAt = null, validFrom = null,
  validUntil = null, receivedAt = null, processedAt = null, error = false, nowMs = Date.now(),
} = {}) {
  let status = error ? FRESHNESS.ERROR : (MAP[sourceState] ?? FRESHNESS.UNAVAILABLE);
  const until = iso(validUntil);
  if (!error && until && Date.parse(until) < nowMs) status = FRESHNESS.EXPIRED;
  const basis = iso(observedAt) ?? iso(issuedAt) ?? iso(receivedAt);
  const freshnessSec = basis ? Math.max(0, Math.round((nowMs - Date.parse(basis)) / 1000)) : null;
  return {
    status,
    sourceState,
    source,
    observedAt: iso(observedAt),
    issuedAt: iso(issuedAt),
    validFrom: iso(validFrom),
    validUntil: until,
    receivedAt: iso(receivedAt),
    processedAt: iso(processedAt),
    freshnessSec,
  };
}

/** 화면 문구. 값이 없는 상태를 "없음/안전"으로 읽히게 쓰지 않는다. */
export function freshnessLabel(status) {
  switch (status) {
    case FRESHNESS.FRESH: return '최신';
    case FRESHNESS.STALE: return '지연된 자료';
    case FRESHNESS.EXPIRED: return '유효 시각 지남';
    case FRESHNESS.ERROR: return '연결 실패';
    default: return '자료 없음';
  }
}
