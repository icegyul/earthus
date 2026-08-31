const EVIDENCE = new Set(['OBSERVED','REPORTED','DETECTED','MODELLED']);

export function normalizePollutionSignal(signal = {}) {
  const evidenceKind = EVIDENCE.has(signal.evidenceKind) ? signal.evidenceKind : 'MODELLED';
  return {
    id: signal.id || null,
    domain: String(signal.domain || 'UNKNOWN').toUpperCase(),
    pollutant: signal.pollutant || null,
    evidenceKind,
    sourceId: signal.sourceId || null,
    observedAt: signal.observedAt || null,
    validAt: signal.validAt || signal.observedAt || null,
    confidence: Math.max(0, Math.min(1, Number(signal.confidence ?? 0.5))),
    vectorProof: signal.vectorProof === true,
    transport: signal.transport || null,
  };
}

export function pollutionTransportGate(signal = {}) {
  const s = normalizePollutionSignal(signal);
  if (!s.transport) return { allowed: false, reason: 'NO_TRANSPORT_REQUEST' };
  if (!s.vectorProof) return { allowed: false, reason: 'VECTOR_PROOF_REQUIRED' };
  if (!['MODELLED','OBSERVED'].includes(s.evidenceKind)) return { allowed: false, reason: 'UNSUPPORTED_EVIDENCE_KIND' };
  return { allowed: true, label: s.evidenceKind === 'MODELLED' ? 'MODELLED_TRANSPORT' : 'OBSERVED_MOTION' };
}

export function compilePollutionLens(signals = []) {
  const normalized = signals.map(normalizePollutionSignal);
  return {
    air: normalized.filter((s) => s.domain === 'AIR'),
    fire: normalized.filter((s) => s.domain === 'FIRE'),
    ocean: normalized.filter((s) => s.domain === 'OCEAN'),
    land: normalized.filter((s) => s.domain === 'LAND'),
    evidenceLegend: ['OBSERVED','REPORTED','DETECTED','MODELLED'],
  };
}
