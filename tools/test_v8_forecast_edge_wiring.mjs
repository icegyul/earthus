import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const read = path => readFile(new URL(`../${path}`, import.meta.url), 'utf8');
const [edge, config, migration, publicAudit] = await Promise.all([
  read('prototype/supabase/functions/forecast-v8/index.ts'),
  read('prototype/supabase/config.toml'),
  read('prototype/supabase/migrations/20260821120000_earthus_v8_forecast_private.sql'),
  read('tools/audit_supabase_public.mjs'),
]);

assert.match(edge, /handleForecastV8Request/, 'the deployed adapter must use the behavior-tested server policy');
assert.match(edge, /auth\.getUser\(token\)/, 'the adapter must verify the bearer token with Supabase Auth');
assert.match(edge, /tier,subscription_ends,manual_access_until/, 'the adapter must load server-owned entitlement expiry fields');
assert.match(edge, /earthus_forecast_revisions/, 'premium output must come from the private forecast revision table');
for (const boundary of ['scope_key', 'release_state', 'sample_gate', 'skill_gate', 'freshness_gate', 'rights_gate', 'rollback_gate', 'valid_from', 'valid_until']) {
  assert.ok(edge.includes(boundary), `forecast query is missing ${boundary}`);
}
assert.doesNotMatch(edge, /import[^\n]*(?:access-mode|config\.local)|Deno\.env\.get\(['"](?:FREE_OPEN|MONETIZATION_MODE)/,
  'the premium endpoint must not inherit the temporary public UI mode');

assert.match(config, /\[functions\.forecast-v8\][\s\S]*?verify_jwt\s*=\s*true/, 'the Supabase gateway must verify forecast JWTs');

assert.match(migration, /create table if not exists public\.earthus_forecast_revisions/i);
assert.match(migration, /alter table public\.earthus_forecast_revisions enable row level security/i);
assert.match(migration, /alter table public\.earthus_forecast_revisions force row level security/i);
assert.match(migration, /alter table public\.earthus_forecast_release_audit force row level security/i);
assert.match(migration, /revoke all on table public\.earthus_forecast_revisions from anon, authenticated/i);
assert.doesNotMatch(migration, /create policy[\s\S]*earthus_forecast_revisions/i, 'no browser RLS read policy may expose premium rows');
assert.match(migration, /check \(data_class = 'EARTHUS_DERIVED'\)/i);
assert.match(migration, /check \(access_class = 'PREMIUM'\)/i);
assert.match(migration, /jsonb_array_elements/i, 'every output envelope must be validated before release');
assert.doesNotMatch(migration, /grant\s+(?:all|select)[^;]*earthus_forecast_revisions[^;]*\b(?:anon|authenticated)\b/i);

assert.match(publicAudit, /'earthus_forecast_revisions'/,
  'the production public-surface audit must probe the private forecast table');
assert.match(publicAudit, /'earthus_forecast_release_audit'/,
  'the production public-surface audit must probe the release audit table');
assert.match(publicAudit, /'forecast-v8'/,
  'the production public-surface audit must include the premium Edge boundary');
assert.match(publicAudit, /entry\.name !== '_shared'/,
  'the shared source directory must not be counted as a deployed Edge Function');

console.log('EARTHUS v8 forecast edge wiring: PASS');
