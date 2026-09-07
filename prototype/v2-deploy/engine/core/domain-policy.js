import { clamp } from './math.js';

export class DomainPolicyRegistry {
  #policies = new Map();

  register(policy) {
    if (!policy?.id || typeof policy.id !== 'string') throw new TypeError('policy id is required');
    if (this.#policies.has(policy.id)) throw new Error(`policy already registered: ${policy.id}`);
    if (typeof policy.evaluate !== 'function') throw new TypeError('policy evaluate() is required');
    this.#policies.set(policy.id, policy);
  }

  evaluate(id, context) {
    const policy = this.#policies.get(id);
    if (!policy) throw new Error(`unknown domain policy: ${id}`);
    const result = policy.evaluate(structuredClone(context));
    if (!result || !['ALLOW', 'CAUTION', 'EXCLUDE', 'UNKNOWN'].includes(result.decision)) {
      throw new TypeError(`invalid policy result from ${id}`);
    }
    return Object.freeze({ policyId: id, ...result });
  }

  list() { return Object.freeze([...this.#policies.keys()].sort()); }
}

export function createWeightedDomainPolicy({ id, weights, hardGates = [], minimumCoverage = 0.6 }) {
  const entries = Object.entries(weights ?? {});
  if (!id || !entries.length) throw new TypeError('id and weights are required');
  return Object.freeze({
    id,
    evaluate(context) {
      for (const gate of hardGates) {
        const result = gate(context);
        if (result?.blocked) return Object.freeze({ decision: 'EXCLUDE', score: null, reasonCodes: Object.freeze([result.reason ?? 'HARD_GATE']) });
      }
      const available = entries.filter(([name]) => Number.isFinite(context?.[name]));
      const totalWeight = entries.reduce((sum, [, weight]) => sum + Math.max(0, Number(weight) || 0), 0);
      const availableWeight = available.reduce((sum, [, weight]) => sum + Math.max(0, Number(weight) || 0), 0);
      const coverage = totalWeight > 0 ? availableWeight / totalWeight : 0;
      if (coverage < minimumCoverage) return Object.freeze({ decision: 'UNKNOWN', score: null, coverage, reasonCodes: Object.freeze(['INSUFFICIENT_COVERAGE']) });
      const score = available.reduce((sum, [name, weight]) => sum + clamp(context[name], 0, 1) * Math.max(0, weight), 0) / availableWeight;
      return Object.freeze({ decision: score >= 0.75 ? 'ALLOW' : score >= 0.45 ? 'CAUTION' : 'EXCLUDE', score, coverage, reasonCodes: Object.freeze([]) });
    },
  });
}

export function officialHazardGate(context) {
  return context?.officialHazardActive === true ? { blocked: true, reason: 'OFFICIAL_HAZARD' } : { blocked: false };
}

export function closedGate(context) {
  return context?.closed === true ? { blocked: true, reason: 'CLOSED' } : { blocked: false };
}
