// Aetherus AI Intent → Evidence: read-only by construction.
// It can classify an intent and compose an evidence-bound answer plan. It cannot call a model,
// write user state, publish, delete, command hardware, or treat model text as authoritative data.

export const AI_EVIDENCE_SCHEMAS = Object.freeze({ intent: 'earthus.ai-intent.v1', evidence: 'earthus.ai-evidence-ledger.v1', answerPlan: 'earthus.ai-answer-plan.v1', evaluation: 'earthus.ai-evaluation.v1' });
const READ_ONLY_INTENTS = new Set(['EXPLAIN', 'COMPARE_SOURCES', 'OBSERVATION_SUMMARY', 'MISSION_CONTEXT']);
const INJECTION_PATTERNS = [/ignore\s+(all\s+)?previous/i, /system\s+prompt/i, /reveal\s+(secret|key|token)/i, /bypass\s+(safety|guard|rights)/i, /\b(delete|publish|execute|automate)\b/i];
export class AiEvidenceError extends Error { constructor(code, details = {}) { super(code); this.name = 'AiEvidenceError'; this.code = code; this.details = Object.freeze({ ...details }); } }
const fail = (code, details = {}) => { throw new AiEvidenceError(code, details); };
const need = (value, code, details = {}) => { if (!value) fail(code, details); };
const freeze = value => { if (value && typeof value === 'object' && !Object.isFrozen(value)) { Object.values(value).forEach(freeze); Object.freeze(value); } return value; };
const utc = value => { const date = new Date(value); need(Number.isFinite(date.getTime()), 'AI_EVIDENCE_UTC_REQUIRED'); return date.toISOString(); };
const id = (value, code) => { const result = String(value || '').trim(); need(/^[A-Za-z0-9._:-]+$/.test(result) && result.length <= 160, code); return result; };

export function classifyAiIntent({ text, requestedAtUtc = new Date().toISOString() } = {}) {
  need(typeof text === 'string' && text.trim().length > 0 && text.length <= 4000, 'AI_INTENT_TEXT_REQUIRED');
  const blocked = INJECTION_PATTERNS.find(pattern => pattern.test(text));
  if (blocked) return freeze({ schema: AI_EVIDENCE_SCHEMAS.intent, kind: 'BLOCKED', action: 'NONE', requestedAtUtc: utc(requestedAtUtc), reason: 'UNTRUSTED_OR_STATE_CHANGING_INSTRUCTION' });
  const normalized = text.toLowerCase();
  const kind = normalized.includes('compare') || normalized.includes('비교') ? 'COMPARE_SOURCES'
    : normalized.includes('mission') || normalized.includes('미션') ? 'MISSION_CONTEXT'
    : normalized.includes('observation') || normalized.includes('관측') ? 'OBSERVATION_SUMMARY' : 'EXPLAIN';
  return freeze({ schema: AI_EVIDENCE_SCHEMAS.intent, kind, action: 'READ_ONLY', requestedAtUtc: utc(requestedAtUtc), reason: 'READ_ONLY_INTENT' });
}

export function createEvidenceLedger({ entries, generatedAtUtc = new Date().toISOString() } = {}) {
  need(Array.isArray(entries) && entries.length > 0, 'AI_EVIDENCE_ENTRIES_REQUIRED');
  const seen = new Set();
  const normalized = entries.map(entry => {
    need(entry && typeof entry === 'object', 'AI_EVIDENCE_ENTRY_REQUIRED'); const evidenceId = id(entry.evidenceId, 'AI_EVIDENCE_ID_REQUIRED'); need(!seen.has(evidenceId), 'AI_EVIDENCE_DUPLICATE_ID'); seen.add(evidenceId);
    need(typeof entry.claim === 'string' && entry.claim.trim(), 'AI_EVIDENCE_CLAIM_REQUIRED'); need(typeof entry.sourceUrl === 'string' && /^https:\/\//.test(entry.sourceUrl), 'AI_EVIDENCE_SOURCE_REQUIRED');
    need(['observation', 'calculated', 'reconstruction', 'simulation', 'ai', 'user-content'].includes(entry.provenance), 'AI_EVIDENCE_PROVENANCE_REQUIRED');
    return freeze({ evidenceId, claim: entry.claim.trim(), sourceUrl: entry.sourceUrl, provenance: entry.provenance, observedAtUtc: entry.observedAtUtc ? utc(entry.observedAtUtc) : null, precision: entry.precision || 'UNKNOWN', licenseStatus: entry.licenseStatus || 'UNKNOWN' });
  });
  return freeze({ schema: AI_EVIDENCE_SCHEMAS.evidence, generatedAtUtc: utc(generatedAtUtc), entries: normalized });
}

export function chooseModelRoute({ intent, ledger, budget = { maxExternalCalls: 0 } } = {}) {
  need(intent?.action === 'READ_ONLY' && READ_ONLY_INTENTS.has(intent.kind), 'AI_ROUTE_INTENT_NOT_ALLOWED'); need(ledger?.schema === AI_EVIDENCE_SCHEMAS.evidence, 'AI_ROUTE_LEDGER_REQUIRED');
  need(budget?.maxExternalCalls === 0, 'AI_EXTERNAL_MODEL_NOT_AUTHORIZED');
  return freeze({ route: 'LOCAL_TEMPLATE_ONLY', externalModelCalls: 0, reason: 'NO_MODEL_CREDENTIAL_OR_COST_AUTHORIZATION' });
}

export function composeEvidenceAnswerPlan({ intent, ledger, assertionEvidenceIds, modelText = null } = {}) {
  need(intent?.action === 'READ_ONLY', 'AI_PLAN_INTENT_NOT_ALLOWED'); need(ledger?.schema === AI_EVIDENCE_SCHEMAS.evidence, 'AI_PLAN_LEDGER_REQUIRED');
  need(Array.isArray(assertionEvidenceIds) && assertionEvidenceIds.length > 0, 'AI_PLAN_ASSERTION_EVIDENCE_REQUIRED');
  const permitted = new Set(ledger.entries.map(entry => entry.evidenceId));
  assertionEvidenceIds.forEach(value => need(permitted.has(value), 'AI_PLAN_UNCITED_ASSERTION', { evidenceId: value }));
  // modelText is deliberately opaque; it cannot add evidence, action, or mutable state.
  if (modelText !== null) need(typeof modelText === 'string' && modelText.length <= 8000, 'AI_PLAN_MODEL_TEXT_INVALID');
  return freeze({ schema: AI_EVIDENCE_SCHEMAS.answerPlan, intent: intent.kind, action: 'READ_ONLY', route: chooseModelRoute({ intent, ledger }), assertions: assertionEvidenceIds.map(evidenceId => ({ evidenceId })), modelTextAcceptedAsFact: false, stateMutation: null, citationsRequired: true });
}

export function evaluateAiEvidencePlan({ plan, ledger } = {}) {
  const findings = []; if (plan?.action !== 'READ_ONLY' || plan?.stateMutation !== null) findings.push('STATE_MUTATION_FORBIDDEN');
  const ids = new Set(ledger?.entries?.map(entry => entry.evidenceId) || []); if (!plan?.assertions?.length || plan.assertions.some(item => !ids.has(item.evidenceId))) findings.push('CITATION_COVERAGE_FAILED');
  if (plan?.route?.externalModelCalls !== 0) findings.push('COST_POLICY_FAILED');
  return freeze({ schema: AI_EVIDENCE_SCHEMAS.evaluation, passed: findings.length === 0, findings, evaluatedAtUtc: new Date().toISOString() });
}
