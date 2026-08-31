import { clamp } from '../core/math.js';

export function scanForecastGap({ officialValue, consensusValue, consensusAgreement, persistenceRuns, calibratedSkill, warningActive = false, threshold }) {
  if (![officialValue, consensusValue, consensusAgreement, persistenceRuns, calibratedSkill, threshold].every(Number.isFinite)) {
    return Object.freeze({ state: 'UNKNOWN', gap: null, reasonCodes: Object.freeze(['MISSING_INPUT']) });
  }
  const gap = consensusValue - officialValue;
  const magnitude = Math.abs(gap);
  if (warningActive) return Object.freeze({ state: 'OFFICIAL_WARNING_PRIORITY', gap, confidence: 1, reasonCodes: Object.freeze(['OFFICIAL_WARNING_ACTIVE']) });
  if (magnitude < threshold) return Object.freeze({ state: 'NONE', gap, confidence: clamp(consensusAgreement * calibratedSkill, 0, 1), reasonCodes: Object.freeze([]) });
  const persistent = persistenceRuns >= 2;
  const qualified = consensusAgreement >= 0.65 && calibratedSkill >= 0.6;
  const confidence = clamp(consensusAgreement * calibratedSkill * Math.min(1, persistenceRuns / 3), 0, 1);
  if (persistent && qualified) return Object.freeze({ state: 'EARLY_SIGNAL', gap, confidence, reasonCodes: Object.freeze(['PERSISTENT_MULTI_MODEL_GAP']) });
  return Object.freeze({ state: 'WATCH', gap, confidence, reasonCodes: Object.freeze([persistent ? 'SKILL_OR_AGREEMENT_LOW' : 'NOT_PERSISTENT']) });
}
