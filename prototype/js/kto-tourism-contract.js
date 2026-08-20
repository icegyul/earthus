// 한국관광공사 공개 요약 계약.
// 서로 다른 통계·예측·공식 콘텐츠를 하나의 "실시간 혼잡"으로 합치지 않는다.

export const KTO_SERVICE_ORDER = Object.freeze([
  'concentration', 'visitors', 'barrierFree', 'wellness', 'english',
  'related', 'localHub', 'diversity', 'demandStrength',
]);

const LABELS = Object.freeze({
  concentration: ['관광지 상대 집중률 예측', 'Relative tourism concentration forecast'],
  visitors: ['지역별 과거 방문 지표', 'Historical regional visitor metrics'],
  barrierFree: ['공식 무장애 여행 정보', 'Official barrier-free tourism information'],
  wellness: ['공식 웰니스 관광정보', 'Official wellness tourism content'],
  english: ['공식 영문 관광정보', 'Official English tourism content'],
  related: ['차량 이동 기반 연관 관광지', 'Vehicle-mobility related tourism'],
  localHub: ['차량 이동 기반 중심 관광지', 'Vehicle-mobility tourism hubs'],
  diversity: ['지역별 관광 다양성 지수', 'Regional tourism diversity indices'],
  demandStrength: ['지역별 관광 수요 강도', 'Regional tourism demand-strength indices'],
});

const FRESHNESS_MS = Object.freeze({
  concentration: 8 * 60 * 60_000,
  visitors: 48 * 60 * 60_000,
  barrierFree: 48 * 60 * 60_000,
  wellness: 8 * 24 * 60 * 60_000,
  english: 48 * 60 * 60_000,
  related: 48 * 60 * 60_000,
  localHub: 48 * 60 * 60_000,
  diversity: 8 * 24 * 60 * 60_000,
  demandStrength: 8 * 24 * 60 * 60_000,
});

function serviceState(operations) {
  const states = Object.values(operations || {}).map(operation => operation?.state);
  if (!states.length) return 'NOT_COLLECTED';
  if (states.every(state => state === 'AVAILABLE')) return 'AVAILABLE';
  if (states.some(state => state === 'AVAILABLE')) return 'PARTIAL';
  if (states.some(state => state === 'DEGRADED')) return 'DEGRADED';
  return 'UNAVAILABLE';
}

export function validateKtoSummary(summary) {
  if (summary?.schemaVersion !== 'earthus.kto-summary.v1') {
    throw new Error('KTO_SUMMARY_SCHEMA_INVALID');
  }
  if (summary?.provider !== 'KTO') throw new Error('KTO_SUMMARY_PROVIDER_INVALID');
  if (!Number.isFinite(Date.parse(summary?.generatedAt))) throw new Error('KTO_SUMMARY_TIME_INVALID');
  if (!summary.services || typeof summary.services !== 'object' || Array.isArray(summary.services)) {
    throw new Error('KTO_SUMMARY_SERVICES_INVALID');
  }
  return true;
}

export function ktoSummaryRows(summary, now = new Date()) {
  if (summary) validateKtoSummary(summary);
  const nowMs = Date.parse(now instanceof Date ? now.toISOString() : now);
  return KTO_SERVICE_ORDER.map(id => {
    const service = summary?.services?.[id] || {};
    const operations = service.operations && typeof service.operations === 'object'
      ? service.operations : {};
    const values = Object.values(operations);
    const updatedAt = service.updatedAt || null;
    const baseState = serviceState(operations);
    const ageMs = updatedAt && Number.isFinite(nowMs) ? nowMs - Date.parse(updatedAt) : null;
    const state = baseState !== 'NOT_COLLECTED' && Number.isFinite(ageMs)
      && ageMs > FRESHNESS_MS[id] ? 'STALE' : baseState;
    return Object.freeze({
      id,
      labelKo: LABELS[id][0],
      labelEn: LABELS[id][1],
      state,
      updatedAt,
      operationCount: values.length,
      availableCount: values.filter(operation => operation?.state === 'AVAILABLE').length,
      itemCount: values.reduce((sum, operation) => sum + (
        Number.isFinite(Number(operation?.itemCount)) ? Number(operation.itemCount) : 0
      ), 0),
      sourceName: service.sourceName || null,
      sourceUrl: service.sourceUrl || null,
    });
  });
}

export function ktoStateLabel(state, ko = true) {
  const labels = {
    AVAILABLE: ko ? '자료 있음' : 'Available',
    PARTIAL: ko ? '일부 자료' : 'Partial',
    DEGRADED: ko ? '확인 필요' : 'Degraded',
    UNAVAILABLE: ko ? '자료 없음' : 'Unavailable',
    STALE: ko ? '지난 자료' : 'Stale',
    NOT_COLLECTED: ko ? '아직 수집 전' : 'Not collected yet',
  };
  return labels[state] || (ko ? '상태 미상' : 'Unknown');
}
