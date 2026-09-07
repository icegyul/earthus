import { clamp } from '../core/math.js';

export class EvidenceGraph {
  #evidence = new Map();
  #claims = new Map();

  addEvidence(item) {
    if (!item?.evidenceId || !item?.type || !Number.isFinite(item.confidence)) throw new TypeError('evidence item is incomplete');
    if (this.#evidence.has(item.evidenceId)) throw new Error(`evidence already exists: ${item.evidenceId}`);
    this.#evidence.set(item.evidenceId, Object.freeze({ ...structuredClone(item), confidence: clamp(item.confidence, 0, 1) }));
  }

  defineClaim(claim) {
    if (!claim?.claimId || !claim?.intent || !Array.isArray(claim.requiredRules)) throw new TypeError('claim definition is incomplete');
    if (this.#claims.has(claim.claimId)) throw new Error(`claim already exists: ${claim.claimId}`);
    this.#claims.set(claim.claimId, Object.freeze(structuredClone(claim)));
  }

  evaluateClaim(claimId, { nowAt = new Date().toISOString() } = {}) {
    const claim = this.#claims.get(claimId);
    if (!claim) throw new Error(`unknown claim: ${claimId}`);
    const now = Date.parse(nowAt);
    const usable = [...this.#evidence.values()].filter((item) => {
      if (item.expiresAt && Date.parse(item.expiresAt) < now) return false;
      return true;
    });
    const failed = [];
    const used = [];
    for (const rule of claim.requiredRules) {
      const matching = usable.filter((item) => item.type === rule.type && item.confidence >= (rule.minimumConfidence ?? 0));
      if (matching.length < (rule.minimumCount ?? 1)) failed.push(`RULE_${rule.type}`);
      else used.push(...matching);
    }
    const counter = usable.filter((item) => (claim.counterTypes ?? []).includes(item.type));
    const supportScore = used.length ? used.reduce((sum, item) => sum + item.confidence, 0) / used.length : 0;
    const counterScore = counter.length ? counter.reduce((sum, item) => sum + item.confidence, 0) / counter.length : 0;
    const confidence = clamp(supportScore - 0.5 * counterScore, 0, 1);
    if (confidence < (claim.minimumClaimConfidence ?? 0)) failed.push('CLAIM_CONFIDENCE');
    return Object.freeze({
      allowed: failed.length === 0,
      claimId,
      intent: claim.intent,
      confidence,
      evidenceIds: Object.freeze([...new Set(used.map((item) => item.evidenceId))]),
      counterEvidenceIds: Object.freeze(counter.map((item) => item.evidenceId)),
      failedRules: Object.freeze(failed),
      expiresAt: claim.expiresAt ?? null,
    });
  }
}
