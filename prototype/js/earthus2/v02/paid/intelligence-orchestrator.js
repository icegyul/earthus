import { resolveEntitlement } from './entitlement.js';

export function buildIntelligencePanel({ tier, domain, countryEnabled = true, officialSafety = false, results = {}, rights = {}, quotaRemaining = {} }) {
  if (!domain) throw new TypeError('domain is required');
  const tabs = ['NOW', 'WHY', 'NEXT', 'FOR_ME', 'COMPARE', 'SCENARIO', 'EVIDENCE'];
  const payload = {};
  for (const tab of tabs) {
    const entitlement = resolveEntitlement({
      tier,
      tab,
      officialSafety: officialSafety && tab === 'NOW',
      countryEnabled,
      rightsAllowed: rights[tab] !== false,
      quotaRemaining: Number.isFinite(quotaRemaining[tab]) ? quotaRemaining[tab] : Infinity,
    });
    const result = results[tab] ?? null;
    payload[tab] = Object.freeze({
      entitlement,
      state: entitlement.decision === 'ALLOW' ? (result ? 'READY' : 'UNAVAILABLE') : entitlement.decision,
      content: entitlement.decision === 'ALLOW' ? structuredClone(result) : null,
      preview: entitlement.decision === 'PREVIEW' ? structuredClone(result?.preview ?? null) : null,
    });
  }
  return Object.freeze({ schemaVersion: 'earthus.intelligence-panel.v2.0', domain, tier, tabs: Object.freeze(payload) });
}
