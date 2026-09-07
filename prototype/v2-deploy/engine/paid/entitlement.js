import { ACCESS_TIER } from '../core/constants.js';

const RANK = Object.freeze({ FREE: 0, PLUS: 1, CONTROL: 2, BUSINESS: 3 });

export const INTELLIGENCE_TAB = Object.freeze({
  NOW: 'NOW',
  WHY: 'WHY',
  NEXT: 'NEXT',
  FOR_ME: 'FOR_ME',
  COMPARE: 'COMPARE',
  SCENARIO: 'SCENARIO',
  EVIDENCE: 'EVIDENCE',
});

const MINIMUM_TIER = Object.freeze({
  NOW: ACCESS_TIER.FREE,
  WHY: ACCESS_TIER.PLUS,
  NEXT: ACCESS_TIER.PLUS,
  FOR_ME: ACCESS_TIER.PLUS,
  COMPARE: ACCESS_TIER.CONTROL,
  SCENARIO: ACCESS_TIER.CONTROL,
  EVIDENCE: ACCESS_TIER.CONTROL,
});

export function resolveEntitlement({ tier = ACCESS_TIER.FREE, tab, officialSafety = false, quotaRemaining = Infinity, countryEnabled = true, rightsAllowed = true }) {
  if (!(tier in RANK)) throw new TypeError(`invalid access tier: ${tier}`);
  if (!(tab in MINIMUM_TIER)) throw new TypeError(`invalid intelligence tab: ${tab}`);
  if (officialSafety) return Object.freeze({ decision: 'ALLOW', reason: 'OFFICIAL_SAFETY_ALWAYS_FREE' });
  if (!rightsAllowed) return Object.freeze({ decision: 'DENY', reason: 'RIGHTS_BLOCKED' });
  if (!countryEnabled && tab !== INTELLIGENCE_TAB.NOW) return Object.freeze({ decision: 'PREVIEW', reason: 'COUNTRY_NOT_ENABLED' });
  if (quotaRemaining <= 0) return Object.freeze({ decision: 'DENY', reason: 'QUOTA_EXHAUSTED' });
  const required = MINIMUM_TIER[tab];
  if (RANK[tier] >= RANK[required]) return Object.freeze({ decision: 'ALLOW', reason: 'TIER_OK', requiredTier: required });
  return Object.freeze({ decision: 'PREVIEW', reason: `REQUIRES_${required}`, requiredTier: required });
}
