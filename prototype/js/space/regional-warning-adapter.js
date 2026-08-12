// Official-warning normalization for Korea, Japan and Taiwan.
// This adapter performs no network request. It accepts only a supplied official snapshot and
// turns missing, stale, unlicensed or unsupported data into UNKNOWN rather than a safe claim.

export const REGIONAL_WARNING_SCHEMA = 'earthus.regional-warning.v1';
export class RegionalWarningError extends Error { constructor(code) { super(code); this.name = 'RegionalWarningError'; this.code = code; } }
const fail = code => { throw new RegionalWarningError(code); };
const need = (value, code) => { if (!value) fail(code); };
const freeze = value => { if (value && typeof value === 'object' && !Object.isFrozen(value)) { Object.values(value).forEach(freeze); Object.freeze(value); } return value; };
const iso = (value, code) => { const date = new Date(value); need(Number.isFinite(date.getTime()), code); return date.toISOString(); };
const id = (value, code) => { const result = String(value || '').trim(); need(/^[A-Za-z0-9._:-]{2,160}$/.test(result), code); return result; };
const COUNTRY = Object.freeze({ KR: { provider: 'KMA', maxAgeMinutes: 45 }, JP: { provider: 'JMA', maxAgeMinutes: 45 }, TW: { provider: 'CWA', maxAgeMinutes: 45 } });

export function normalizeRegionalWarning({ countryCode, provider, sourceUrl, licenseStatus, observedAtUtc, revision, affectedRegionIds, severity, official = false, nowUtc = new Date().toISOString() } = {}) {
  const country = COUNTRY[String(countryCode || '').toUpperCase()];
  need(country, 'WARNING_COUNTRY_UNSUPPORTED');
  const now = iso(nowUtc, 'WARNING_NOW_REQUIRED');
  const observed = observedAtUtc ? iso(observedAtUtc, 'WARNING_OBSERVED_AT_INVALID') : null;
  const ageMinutes = observed ? Math.max(0, Math.floor((Date.parse(now) - Date.parse(observed)) / 60_000)) : null;
  const providerMatches = String(provider || '').trim() === country.provider;
  const evidenceReady = official === true && providerMatches && typeof sourceUrl === 'string' && /^https:\/\//.test(sourceUrl)
    && String(licenseStatus || '').trim() === 'APPROVED_DISPLAY' && observed && typeof revision === 'string' && revision.trim();
  if (!evidenceReady || ageMinutes > country.maxAgeMinutes) return freeze({ schemaVersion: REGIONAL_WARNING_SCHEMA, countryCode: String(countryCode).toUpperCase(), provider: country.provider, state: 'UNKNOWN', blocksPositiveRecommendation: true, reason: !evidenceReady ? 'OFFICIAL_WARNING_EVIDENCE_INCOMPLETE' : 'OFFICIAL_WARNING_STALE', sourceUrl: evidenceReady ? sourceUrl : null, observedAtUtc: observed, revision: evidenceReady ? revision.trim() : null, affectedRegionIds: [], severity: null, ageMinutes });
  const regions = Array.isArray(affectedRegionIds) ? [...new Set(affectedRegionIds.map(value => id(value, 'WARNING_REGION_ID_INVALID')))].sort() : [];
  const knownSeverity = ['ADVISORY', 'WARNING', 'EMERGENCY'].includes(String(severity || '')) ? String(severity) : null;
  return freeze({ schemaVersion: REGIONAL_WARNING_SCHEMA, countryCode: String(countryCode).toUpperCase(), provider: country.provider, state: regions.length ? 'OFFICIAL_WARNING_ACTIVE' : 'NO_ACTIVE_WARNING_UNVERIFIED_SAFE', blocksPositiveRecommendation: true, reason: regions.length ? 'OFFICIAL_WARNING_ACTIVE' : 'NO_ACTIVE_WARNING_NOT_A_SAFE_CLAIM', sourceUrl, observedAtUtc: observed, revision: revision.trim(), affectedRegionIds: regions, severity: knownSeverity, ageMinutes });
}
