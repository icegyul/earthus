export function countryReadinessScore(gates) {
  const weights = Object.freeze({ data: 0.22, license: 0.16, visual: 0.16, performance: 0.14, qa: 0.14, terrain: 0.10, localization: 0.08 });
  const components = {};
  let score = 0;
  for (const [name, weight] of Object.entries(weights)) {
    const value = Number.isFinite(gates?.[name]) ? Math.max(0, Math.min(1, gates[name])) : 0;
    components[name] = value;
    score += value * weight;
  }
  const blockers = Object.entries(components).filter(([, value]) => value < 0.8).map(([name]) => name);
  return Object.freeze({ score, percent: Math.round(score * 100), blockers: Object.freeze(blockers), components: Object.freeze(components) });
}

export class CountryUnlockLedger {
  #contributions = [];

  contribute({ contributionId, countryId, supporterId, amountUsd = 1, refundableCredit = true }) {
    if (!contributionId || !countryId || !supporterId || !Number.isFinite(amountUsd) || amountUsd <= 0) throw new TypeError('contribution is incomplete');
    if (this.#contributions.some((item) => item.contributionId === contributionId)) throw new Error('duplicate contributionId');
    const record = Object.freeze({ contributionId, countryId, supporterId, amountUsd, refundableCredit, status: 'CAPTURED', createdAt: new Date().toISOString() });
    this.#contributions.push(record);
    return record;
  }

  summary(countryId) {
    const rows = this.#contributions.filter((item) => item.countryId === countryId && item.status === 'CAPTURED');
    return Object.freeze({ countryId, supporters: new Set(rows.map((item) => item.supporterId)).size, amountUsd: rows.reduce((sum, item) => sum + item.amountUsd, 0), contributions: rows.length });
  }
}

export function countryOpenGate({ fundingMet, demandMet, readiness, legalOwnerApproved = true }) {
  const failed = [];
  if (!fundingMet) failed.push('FUNDING');
  if (!demandMet) failed.push('DEMAND');
  if (!readiness || readiness.score < 0.9 || readiness.blockers.length) failed.push('READINESS');
  if (!legalOwnerApproved) failed.push('OWNER_APPROVAL');
  return Object.freeze({ open: failed.length === 0, failed: Object.freeze(failed) });
}
