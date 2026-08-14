#!/usr/bin/env node
import assert from 'node:assert/strict';
import fs from 'node:fs';

const root = new URL('../', import.meta.url);
const contractSource = fs.readFileSync(new URL('prototype/js/analytics-contract.js', root), 'utf8');
const contract = await import(`data:text/javascript;base64,${Buffer.from(contractSource).toString('base64')}`);
const {
  ANALYTICS_CATALOG_VERSION, ANALYTICS_RETENTION_VERSION, analyticsSurface,
  buildAnalyticsRow, sanitizeAnalyticsProperties, viewportBucket,
} = contract;
const migration = fs.readFileSync(new URL('prototype/supabase/migrations/20260814193000_earthus_usage_analytics.sql', root), 'utf8');
const valueGuard = fs.readFileSync(new URL('prototype/supabase/migrations/20260814194500_earthus_usage_analytics_value_guard.sql', root), 'utf8');
const privacyTransition = fs.readFileSync(new URL('prototype/supabase/migrations/20260814200000_earthus_privacy_version_20260814.sql', root), 'utf8');
const effectiveTransition = fs.readFileSync(new URL('prototype/supabase/migrations/20260814201500_earthus_privacy_effective_20260821.sql', root), 'utf8');
const runtime = fs.readFileSync(new URL('prototype/js/analytics.js', root), 'utf8');
const auth = fs.readFileSync(new URL('prototype/js/auth.js', root), 'utf8');
const account = fs.readFileSync(new URL('prototype/js/ui-account.js', root), 'utf8');
const main = fs.readFileSync(new URL('prototype/js/main.js', root), 'utf8');
const rlsVerification = fs.readFileSync(new URL('tools/sql/verify_usage_analytics_rls.sql', root), 'utf8');

assert.equal(ANALYTICS_CATALOG_VERSION, 'earthus.analytics.v1');
assert.equal(ANALYTICS_RETENTION_VERSION, 'earthus.analytics-retention.365d.v1');
assert.equal(viewportBucket(390), 'MOBILE_SMALL');
assert.equal(viewportBucket(768), 'TABLET');
assert.equal(viewportBucket(1440), 'DESKTOP_WIDE');
assert.equal(analyticsSurface('aetherus.opened'), 'aetherus');
assert.equal(analyticsSurface('offline.entered'), 'system');
assert.deepEqual(sanitizeAnalyticsProperties('layer.selected', {
  layerId: 'tpw', state: 'ON', sourceStatusClass: 'HEALTHY',
}), { layerId: 'tpw', state: 'ON', sourceStatusClass: 'HEALTHY' });
assert.throws(() => sanitizeAnalyticsProperties('layer.selected', { latitude: 37.5 }), /NOT_ALLOWED/);
assert.throws(() => sanitizeAnalyticsProperties('app.opened', { searchText: 'secret' }), /NOT_ALLOWED/);
assert.throws(() => sanitizeAnalyticsProperties('unknown.event', {}), /NOT_CATALOGUED/);
assert.throws(() => sanitizeAnalyticsProperties('layer.selected', { layerId: '<script>' }), /ID_INVALID/);
assert.throws(() => sanitizeAnalyticsProperties('error.shown', { reasonCode: 'FETCH_FAILED', stack: 'secret' }), /NOT_ALLOWED/);
assert.throws(() => sanitizeAnalyticsProperties('error.shown', { reasonCode: 'name@example.com' }), /CATEGORY_INVALID/);
assert.throws(() => sanitizeAnalyticsProperties('error.shown', { reasonCode: 'FETCH_FAILED', recoverable: 'yes' }), /NOT_BOOLEAN/);

const row = buildAnalyticsRow({
  eventName: 'evidence.opened', properties: { signalType: 'tpw', evidenceClass: 'SELECTED_POINT' },
  userId: '11111111-1111-4111-8111-111111111111',
  eventId: '22222222-2222-4222-8222-222222222222', sessionPseudonym: 'a'.repeat(32),
  occurredAt: '2026-08-14T00:00:00Z', consentVersion: 'earthus.usage-consent.v1',
  privacyVersion: '2026-08-21',
});
assert.equal(row.user_id, '11111111-1111-4111-8111-111111111111');
assert.equal(row.surface, 'earth');
assert.equal(row.properties.signalType, 'tpw');
assert.equal(row.privacy_version, '2026-08-21');
assert.equal(Object.isFrozen(row), true);

assert.match(migration, /force row level security/i);
assert.match(migration, /usage_agreed = true[\s\S]*max\(c2\.id\)/);
assert.match(migration, /ANALYTICS_PROPERTY_NOT_ALLOWED/);
assert.match(migration, /expires_at := now\(\) \+ interval '365 days'/);
assert.match(migration, /earthus-purge-expired-analytics[\s\S]*delete from public\.analytics_events where expires_at <= now\(\)/);
assert.match(migration, /earthus_withdraw_usage_consent[\s\S]*delete from public\.analytics_events/);
assert.match(migration, /revoke all on public\.analytics_events from anon/);
assert.match(valueGuard, /ANALYTICS_PROPERTY_NOT_CATEGORICAL/);
assert.match(valueGuard, /ANALYTICS_SURFACE_MISMATCH/);
assert.match(valueGuard, /c\.privacy_version = analytics_events\.privacy_version/);
assert.match(privacyTransition, /privacy_version = '2026-08-14'/);
assert.match(privacyTransition, /privacy_version in \('2026-08-04', '2026-08-14'\)/);
assert.match(effectiveTransition, /now\(\) >= timestamptz '2026-08-20 15:00:00\+00'/);
assert.match(effectiveTransition, /privacy_version = '2026-08-21'/);
assert.match(runtime, /localUsageConsent\(\)[\s\S]*select\('id,usage_agreed,privacy_agreed,over_14/);
assert.match(runtime, /Date\.now\(\) < ANALYTICS_EFFECTIVE_AT/);
assert.match(runtime, /stop\(\)[\s\S]*this\.queue\.length = 0/);
assert.doesNotMatch(runtime, /latitude|longitude|searchText|questionText/);
assert.match(auth, /usage_agreed:\s*!!usage/);
assert.match(auth, /tos_version:\s*CONFIG\.TERMS_VERSION \|\| CONFIG\.LEGAL_VERSION/);
assert.match(auth, /privacy_version:\s*CONFIG\.PRIVACY_VERSION \|\| CONFIG\.LEGAL_VERSION/);
assert.match(auth, /earthus_withdraw_usage_consent/);
assert.match(auth, /earthus_export_my_analytics/);
assert.match(account, /earthus:usage-consent/);
assert.match(main, /import \{ analytics \}[\s\S]*await analytics\.init\(\)/);
assert.match(rlsVerification, /crossUserSelectBlocked[\s\S]*productionRowsChanged/);
assert.match(rlsVerification, /rollback;/i);

console.log('Usage analytics: contract, consent, RLS, withdrawal and export passed');
