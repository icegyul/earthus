// Earthus PR-10 grounded fusion shadow contract.
// It can assemble explicitly cited evidence for a read-only explanation. It cannot call a model,
// infer a missing claim, upgrade a recommendation, or execute a tool/action.

import { AI_EVIDENCE_SCHEMAS } from './ai-evidence.js';

export const DECISION_FUSION_SCHEMA = 'earthus.decision-fusion.v1';
export class DecisionFusionError extends Error { constructor(code) { super(code); this.name = 'DecisionFusionError'; this.code = code; } }
const fail = code => { throw new DecisionFusionError(code); };
const need = (value, code) => { if (!value) fail(code); };
const freeze = value => { if (value && typeof value === 'object' && !Object.isFrozen(value)) { Object.values(value).forEach(freeze); Object.freeze(value); } return value; };

export function composeGroundedDecisionFusion({ intent, ledger, answerPlan, baseDecision, generatedAtUtc = new Date().toISOString() } = {}) {
  need(intent?.action === 'READ_ONLY', 'FUSION_READ_ONLY_INTENT_REQUIRED');
  need(ledger?.schema === AI_EVIDENCE_SCHEMAS.evidence, 'FUSION_LEDGER_REQUIRED');
  need(answerPlan?.schema === AI_EVIDENCE_SCHEMAS.answerPlan && answerPlan.action === 'READ_ONLY', 'FUSION_PLAN_REQUIRED');
  need(answerPlan?.route?.externalModelCalls === 0 && answerPlan?.modelTextAcceptedAsFact === false && answerPlan?.stateMutation === null, 'FUSION_UNSAFE_PLAN');
  need(baseDecision?.schemaVersion === 'earthus.activity-decision.v1', 'FUSION_BASE_DECISION_REQUIRED');
  const available = new Map(ledger.entries.map(entry => [entry.evidenceId, entry]));
  const cited = (answerPlan.assertions || []).map(item => available.get(item.evidenceId));
  need(cited.length > 0 && cited.every(Boolean), 'FUSION_UNCITED_CLAIM');
  const safety = baseDecision.axes?.safety || {};
  const blocked = safety.blocksPositiveRecommendation !== false || safety.status === 'DANGER' || safety.status === 'UNKNOWN';
  const generated = new Date(generatedAtUtc); need(Number.isFinite(generated.getTime()), 'FUSION_GENERATED_AT_REQUIRED');
  return freeze({
    schemaVersion: DECISION_FUSION_SCHEMA,
    generatedAtUtc: generated.toISOString(),
    mode: 'CALIBRATION_SHADOW',
    state: blocked ? 'WITHHELD_SAFETY_OR_EVIDENCE' : 'READ_ONLY_GROUNDED',
    reasonCodes: blocked ? ['SAFETY_OR_DECISION_POLICY_WITHHELD'] : ['CITED_READ_ONLY_EVIDENCE'],
    claims: cited.map(entry => ({ evidenceId: entry.evidenceId, claim: entry.claim, sourceUrl: entry.sourceUrl, observedAtUtc: entry.observedAtUtc, provenance: entry.provenance, precision: entry.precision, licenseStatus: entry.licenseStatus })),
    recommendation: { state: baseDecision.recommendation?.state || 'WITHHELD', copiedFromDecision: true, upgradedByFusion: false },
    action: null,
    externalModelCalls: 0,
    toolCalls: 0,
    mutableState: null,
  });
}
