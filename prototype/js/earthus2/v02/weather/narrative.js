const SOURCE_LABELS = Object.freeze({
  KMA: '기상청 발표',
  EARTHUS: 'Earthus 분석',
  MODEL: '모델 신호',
  EARLY: 'Earthus Early Signal',
});

export function composeWeatherBrief({ locationName, officialSummary, analysisClaims = [], outlookClaims = [], source = 'KMA', generatedAt }) {
  if (!locationName || !officialSummary || !generatedAt) throw new TypeError('locationName, officialSummary and generatedAt are required');
  const allowedAnalysis = analysisClaims.filter((claim) => claim?.allowed === true && typeof claim.text === 'string' && claim.text.trim());
  const allowedOutlook = outlookClaims.filter((claim) => claim?.allowed === true && typeof claim.text === 'string' && claim.text.trim());
  return Object.freeze({
    schemaVersion: 'earthus.weather-brief.v2.0',
    locationName,
    headline: officialSummary.trim(),
    sourceLabel: SOURCE_LABELS[source] ?? source,
    generatedAt: new Date(generatedAt).toISOString(),
    analysis: Object.freeze(allowedAnalysis.map((claim) => Object.freeze({ claimId: claim.claimId, text: claim.text.trim(), confidence: claim.confidence ?? null, sourceLabel: claim.sourceLabel ?? SOURCE_LABELS.EARTHUS }))),
    outlook: Object.freeze(allowedOutlook.map((claim) => Object.freeze({ claimId: claim.claimId, text: claim.text.trim(), confidence: claim.confidence ?? null, sourceLabel: claim.sourceLabel ?? SOURCE_LABELS.MODEL }))),
  });
}

export function narrativeProbabilityPhrase(probability, { calibrated = false } = {}) {
  if (!Number.isFinite(probability) || probability < 0 || probability > 1) return '가능성을 계산할 수 없습니다.';
  if (!calibrated) return '여러 모델에서 변화 신호가 나타나고 있습니다.';
  const percent = Math.round(probability * 100);
  return `현재 검증 기준으로 가능성은 약 ${percent}%입니다.`;
}

export function buildClaimText({ type, payload }) {
  switch (type) {
    case 'RAIN_DURATION':
      return `${payload.periodLabel} 동안 비가 이어질 가능성이 큽니다.`;
    case 'MOISTURE_SOURCE':
      return `${payload.sourceRegion}에서 유입되는 수증기가 강수 발달을 보조하고 있습니다.`;
    case 'SST_SUPPORT':
      return `${payload.seaName}의 해수면 온도 편차가 수증기 공급을 보조하는 신호로 분석됩니다.`;
    case 'CYCLONE_REMNANT':
      return `열대저기압의 잔여 수증기가 ${payload.targetRegion}에 영향을 줄 가능성을 추적하고 있습니다.`;
    case 'IMPROVEMENT_WINDOW':
      return `날씨가 안정될 가능성이 높은 시점은 ${payload.timeLabel} 전후입니다.`;
    default:
      throw new TypeError(`unsupported claim text type: ${type}`);
  }
}
