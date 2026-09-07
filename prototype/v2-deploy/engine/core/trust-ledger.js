import { EVIDENCE_KIND } from './constants.js';

const KINDS = new Set(Object.values(EVIDENCE_KIND));

export function buildTrustLedger({ outputId, label, evidence = [], counterEvidence = [], expiresAt = null }) {
  if (!outputId || !label) throw new TypeError('outputId and label are required');
  const normalize = (item, polarity) => {
    if (!item?.sourceId || !KINDS.has(item.evidenceKind)) throw new TypeError('evidence sourceId and valid evidenceKind are required');
    return Object.freeze({
      sourceId: item.sourceId,
      evidenceKind: item.evidenceKind,
      observedAt: item.observedAt ?? null,
      forecastAt: item.forecastAt ?? null,
      confidence: Number.isFinite(item.confidence) ? Math.max(0, Math.min(1, item.confidence)) : null,
      summary: item.summary ?? null,
      polarity,
      provenanceId: item.provenanceId ?? null,
    });
  };
  const support = evidence.map((item) => normalize(item, 'SUPPORT'));
  const oppose = counterEvidence.map((item) => normalize(item, 'COUNTER'));
  const confidenceValues = support.map((x) => x.confidence).filter(Number.isFinite);
  const confidence = confidenceValues.length ? confidenceValues.reduce((a, b) => a + b, 0) / confidenceValues.length : null;
  return Object.freeze({
    schemaVersion: 'earthus.trust-ledger.v2.0',
    outputId,
    label,
    confidence,
    status: support.length === 0 ? 'UNSUPPORTED' : oppose.length >= support.length ? 'CONTESTED' : 'SUPPORTED',
    support: Object.freeze(support),
    counterEvidence: Object.freeze(oppose),
    expiresAt,
  });
}
