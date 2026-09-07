export class UsageMeter {
  #limits;
  #usage = new Map();

  constructor(limits = {}) {
    this.#limits = Object.freeze(structuredClone(limits));
  }

  consume({ subjectId, feature, amount = 1, periodKey }) {
    if (!subjectId || !feature || !periodKey) throw new TypeError('subjectId, feature and periodKey are required');
    if (!Number.isFinite(amount) || amount <= 0) throw new RangeError('amount must be positive');
    const key = `${subjectId}|${feature}|${periodKey}`;
    const current = this.#usage.get(key) ?? 0;
    const limit = this.#limits[feature] ?? Infinity;
    if (current + amount > limit) return Object.freeze({ allowed: false, feature, used: current, limit, remaining: Math.max(0, limit - current), reason: 'QUOTA_EXCEEDED' });
    const used = current + amount;
    this.#usage.set(key, used);
    return Object.freeze({ allowed: true, feature, used, limit, remaining: Number.isFinite(limit) ? Math.max(0, limit - used) : Infinity });
  }

  snapshot(subjectId, periodKey) {
    const usage = {};
    for (const [key, value] of this.#usage) {
      const [subject, feature, period] = key.split('|');
      if (subject === subjectId && period === periodKey) usage[feature] = value;
    }
    return Object.freeze(usage);
  }
}
