import { clamp, normalizeWeights, weightedMean, weightedVariance } from '../core/math.js';

export function normalizeModelMember(member) {
  if (!member?.modelId || !member?.issuedAt || !member?.validAt || !Number.isFinite(member.value)) throw new TypeError('model member is incomplete');
  return Object.freeze({
    modelId: member.modelId,
    modelVersion: member.modelVersion ?? null,
    issuedAt: new Date(member.issuedAt).toISOString(),
    validAt: new Date(member.validAt).toISOString(),
    value: member.value,
    correctedValue: Number.isFinite(member.correctedValue) ? member.correctedValue : member.value,
    historicalSkill: Number.isFinite(member.historicalSkill) ? clamp(member.historicalSkill, 0, 1) : 0.5,
    freshness: Number.isFinite(member.freshness) ? clamp(member.freshness, 0, 1) : 0.5,
    rightsAllowed: member.rightsAllowed !== false,
  });
}

export function blendEnsemble(members, { modelWeights = {}, minimumMembers = 2 } = {}) {
  const normalized = members.map(normalizeModelMember).filter((member) => member.rightsAllowed);
  if (normalized.length < minimumMembers) return Object.freeze({ value: null, spread: null, agreement: 0, state: 'INSUFFICIENT_MEMBERS', members: Object.freeze(normalized) });
  const defaultWeights = Object.fromEntries(normalized.map((member) => [member.modelId, Math.max(0.05, member.historicalSkill * member.freshness)]));
  const weights = normalizeWeights({ ...defaultWeights, ...modelWeights });
  const items = normalized.map((member) => ({ value: member.correctedValue, weight: weights[member.modelId] ?? 0 }));
  const value = weightedMean(items);
  const variance = weightedVariance(items, value);
  const spread = Number.isFinite(variance) ? Math.sqrt(variance) : null;
  const scale = Math.max(1, Math.abs(value ?? 0), ...normalized.map((member) => Math.abs(member.correctedValue)));
  const agreement = Number.isFinite(spread) ? clamp(1 - spread / scale, 0, 1) : 0;
  return Object.freeze({ value, spread, agreement, state: 'BLENDED', weights, members: Object.freeze(normalized) });
}

export function applyBiasCorrection({ value, bias }) {
  if (!Number.isFinite(value)) throw new TypeError('value must be finite');
  if (!Number.isFinite(bias)) return Object.freeze({ corrected: value, applied: false });
  return Object.freeze({ corrected: value - bias, applied: true, bias });
}
