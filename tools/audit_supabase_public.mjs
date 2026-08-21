#!/usr/bin/env node
/**
 * EARTHUS Supabase production public-surface audit.
 *
 * Read-only boundaries:
 * - never prints URL keys, tokens, emails, row bodies, or Edge Function secrets;
 * - uses relation GET limit=0, public settings, bucket listing, OPTIONS, and empty
 *   unauthenticated POSTs whose current fail-closed result is asserted;
 * - does not apply migrations, create users, write rows, publish SNS, or call PGs.
 */

import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';

const ROOT = path.resolve(import.meta.dirname, '..');
const SUPABASE_ROOT = path.join(ROOT, 'prototype', 'supabase');
const CONFIG_PATH = path.join(ROOT, 'prototype', 'js', 'config.local.js');
const EXPECTED_ORIGIN = 'https://earthus.net';

const KNOWN_RELATIONS = [
  'profiles', 'consents', 'waitlist', 'feature_requests', 'reports',
  'service_interest', 'plans', 'orders', 'push_subscriptions', 'alert_spots',
  'alert_sent', 'admins', 'member_invites', 'member_access_audit', 'analytics_events',
  'earthus_forecast_revisions', 'earthus_forecast_release_audit',
];

const RELATION_COLUMNS = {
  profiles: 'id,email,provider,display_name,tier,founding_member,subscription_id,subscription_ends,manual_access_until,manual_access_kind,manual_access_reason,created_at,updated_at',
  consents: 'id,user_id,tos_agreed,privacy_agreed,over_14,marketing_agreed,location_agreed,usage_agreed,tos_version,privacy_version,agreed_at',
  waitlist: 'id,email,marketing_agreed,privacy_version,created_at',
  feature_requests: 'id,body,lang,status,votes,hidden,user_id,created_at',
  reports: 'id,target_type,target_id,reason,user_id,created_at',
  service_interest: 'id,service,email,user_id,privacy_version,created_at',
  plans: 'id,name_ko,name_en,krw,usd,period,months,active,max_seats,sort',
  orders: 'id,user_id,plan_id,amount,currency,status,provider,payment_key,approved_at,fail_reason,grants_until,refunded_at,refund_amount,refund_reason,refund_transaction_key,discount_kind,discount_rate,list_amount,created_at,updated_at',
  push_subscriptions: 'id,user_id,endpoint,p256dh,auth,platform,lang,failed,last_ok,created_at',
  alert_spots: 'id,user_id,label,lat,lon,rip,quake,warn,tsunami,quake_min_mag,quake_max_km,created_at',
  alert_sent: 'id,user_id,event_key,sent_at',
  admins: 'id,note,created_at',
  member_invites: 'id,email,kind,reason,starts_at,ends_at,created_by,claimed_by,claimed_at,revoked_by,revoked_at,created_at',
  member_access_audit: 'id,actor_id,target_user_id,invite_id,action,detail,created_at',
  analytics_events: 'event_id,user_id,event_name,event_version,occurred_at,session_pseudonym,consent_version,privacy_version,catalog_version,retention_version,surface,properties,created_at,expires_at',
  earthus_forecast_revisions: 'id,scope_key,schema_version,data_class,access_class,release_state,sample_gate,skill_gate,freshness_gate,rights_gate,rollback_gate,issued_at,valid_from,valid_until,published_at,source_refs,outputs,created_by,created_at,updated_at',
  earthus_forecast_release_audit: 'id,revision_id,previous_release_state,next_release_state,gate_snapshot,actor_id,changed_at',
};
const ANON_DENIED_RELATIONS = new Set([
  'analytics_events', 'earthus_forecast_revisions', 'earthus_forecast_release_audit',
]);

const KNOWN_FUNCTIONS = [
  'checkout', 'payment-confirm', 'payment-refund', 'push-tick',
  'social-admin', 'member-admin',
  'forecast-v8',
];

function fail(message) {
  throw new Error(message);
}

function configString(source, name) {
  const match = source.match(new RegExp(`${name}\\s*:\\s*['\"]([^'\"]+)['\"]`));
  if (!match) fail(`${name} is missing from local runtime config`);
  return match[1];
}

function keyShape(value) {
  if (value.startsWith('sb_publishable_')) return 'publishable';
  if (value.startsWith('eyJ')) return 'legacy-jwt';
  return 'unknown';
}

function contentRangeCount(value) {
  const match = String(value || '').match(/\/([0-9]+)$/);
  return match ? Number(match[1]) : null;
}

function safeErrorBody(raw) {
  const text = String(raw || '')
    .replace(/[A-Za-z0-9_-]{80,}/g, '[redacted]')
    .replace(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi, '[redacted-email]')
    .replace(/\s+/g, ' ')
    .trim();
  try {
    const value = JSON.parse(text);
    return {
      code: typeof value.code === 'string' ? value.code.slice(0, 80) : null,
      error: typeof value.error === 'string' ? value.error.slice(0, 80) : null,
      message: typeof value.message === 'string' ? value.message.slice(0, 120) : null,
    };
  } catch {
    return { text: text.slice(0, 120) };
  }
}

async function bodyText(response) {
  return response.text();
}

function sqlFiles(directory) {
  const found = [];
  for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
    const absolute = path.join(directory, entry.name);
    if (entry.isDirectory()) found.push(...sqlFiles(absolute));
    else if (entry.isFile() && entry.name.endsWith('.sql')) found.push(absolute);
  }
  return found.sort();
}

function staticInventory() {
  const tables = new Set();
  const rls = new Set();
  for (const filename of sqlFiles(SUPABASE_ROOT)) {
    const source = fs.readFileSync(filename, 'utf8');
    for (const match of source.matchAll(/create\s+table\s+if\s+not\s+exists\s+public\.([a-z0-9_]+)/gi)) {
      tables.add(match[1]);
    }
    for (const match of source.matchAll(/alter\s+table\s+public\.([a-z0-9_]+)\s+enable\s+row\s+level\s+security/gi)) {
      rls.add(match[1]);
    }
  }
  const migrations = fs.readdirSync(path.join(SUPABASE_ROOT, 'migrations'))
    .filter(name => name.endsWith('.sql')).sort();
  const functions = fs.readdirSync(path.join(SUPABASE_ROOT, 'functions'), { withFileTypes: true })
    .filter(entry => entry.isDirectory() && entry.name !== '_shared').map(entry => entry.name).sort();
  return {
    declaredTables: [...tables].sort(),
    declaredRlsTables: [...rls].sort(),
    declaredTablesMissingRls: [...tables].filter(name => !rls.has(name)).sort(),
    migrationFiles: migrations,
    functionDirectories: functions,
  };
}

async function audit() {
  if (!fs.existsSync(CONFIG_PATH)) fail('prototype/js/config.local.js is required but stays gitignored');
  const config = fs.readFileSync(CONFIG_PATH, 'utf8');
  const baseUrl = configString(config, 'SUPABASE_URL').replace(/\/$/, '');
  const publishableKey = configString(config, 'SUPABASE_ANON_KEY');
  const host = new URL(baseUrl).host;
  const publicHeaders = { apikey: publishableKey, Prefer: 'count=exact' };

  const local = staticInventory();
  if (local.declaredTablesMissingRls.length) {
    fail(`local SQL tables without an RLS declaration: ${local.declaredTablesMissingRls.join(', ')}`);
  }
  if (JSON.stringify(local.functionDirectories) !== JSON.stringify([...KNOWN_FUNCTIONS].sort())) {
    fail('local Edge Function directory inventory drifted');
  }

  const openApiResponse = await fetch(`${baseUrl}/rest/v1/`, {
    headers: { apikey: publishableKey, Accept: 'application/openapi+json' },
  });
  const openApiBody = await bodyText(openApiResponse);

  const relations = [];
  for (const relation of KNOWN_RELATIONS) {
    const columns = RELATION_COLUMNS[relation];
    if (!columns) fail(`missing expected column contract for ${relation}`);
    const response = await fetch(`${baseUrl}/rest/v1/${relation}?select=${columns}&limit=0`, {
      headers: publicHeaders,
    });
    const raw = await bodyText(response);
    if (ANON_DENIED_RELATIONS.has(relation)) {
      if (![401, 403].includes(response.status)) {
        fail(`${relation} anonymous access unexpectedly returned ${response.status}`);
      }
      relations.push({
        relation,
        status: response.status,
        expectedColumnCount: columns.split(',').length,
        anonymousVisibleCount: 0,
        boundary: 'TABLE_PRIVILEGE_DENIED',
      });
      continue;
    }
    if (![200, 206].includes(response.status)) {
      fail(`${relation} public boundary returned ${response.status}: ${JSON.stringify(safeErrorBody(raw))}`);
    }
    relations.push({
      relation,
      status: response.status,
      expectedColumnCount: columns.split(',').length,
      anonymousVisibleCount: contentRangeCount(response.headers.get('content-range')),
    });
  }

  const authResponse = await fetch(`${baseUrl}/auth/v1/settings`, {
    headers: { apikey: publishableKey },
  });
  const authSettings = await authResponse.json();
  if (!authResponse.ok) fail(`auth settings returned ${authResponse.status}`);

  const storageResponse = await fetch(`${baseUrl}/storage/v1/bucket`, {
    headers: { apikey: publishableKey },
  });
  const storageBody = await storageResponse.json();
  if (!storageResponse.ok) fail(`storage public boundary returned ${storageResponse.status}`);

  const functionChecks = [];
  for (const name of KNOWN_FUNCTIONS) {
    const method = name === 'forecast-v8' ? 'GET' : 'POST';
    const options = await fetch(`${baseUrl}/functions/v1/${name}`, {
      method: 'OPTIONS',
      headers: {
        Origin: EXPECTED_ORIGIN,
        'Access-Control-Request-Method': 'POST',
      },
    });
    const withoutCredentials = await fetch(`${baseUrl}/functions/v1/${name}`, {
      method,
      headers: { 'content-type': 'application/json', Origin: EXPECTED_ORIGIN },
      ...(method === 'POST' ? { body: '{}' } : {}),
    });
    const withoutCredentialsBody = await bodyText(withoutCredentials);
    const withApiKey = await fetch(`${baseUrl}/functions/v1/${name}`, {
      method,
      headers: {
        apikey: publishableKey,
        'content-type': 'application/json',
        Origin: EXPECTED_ORIGIN,
      },
      ...(method === 'POST' ? { body: '{}' } : {}),
    });
    const withApiKeyBody = await bodyText(withApiKey);
    functionChecks.push({
      function: name,
      optionsStatus: options.status,
      noCredentialStatus: withoutCredentials.status,
      noCredentialBody: safeErrorBody(withoutCredentialsBody),
      publishableKeyStatus: withApiKey.status,
      publishableKeyBody: safeErrorBody(withApiKeyBody),
      allowOrigin: withApiKey.headers.get('access-control-allow-origin'),
    });
  }

  const expected = {
    checkout: [401, 503, 'SALES_CLOSED'],
    'payment-confirm': [401, 401, 'NO_AUTH'],
    'payment-refund': [401, 403, 'FORBIDDEN'],
    'push-tick': [403, 403, null],
    'social-admin': [401, 401, 'NO_AUTH'],
    'member-admin': [401, 401, 'NO_AUTH'],
    'forecast-v8': [401, 401, null],
  };
  for (const check of functionChecks) {
    const [noCredentialStatus, publishableKeyStatus, error] = expected[check.function];
    if (check.noCredentialStatus !== noCredentialStatus
        || check.publishableKeyStatus !== publishableKeyStatus) {
      fail(`${check.function} fail-closed status drifted`);
    }
    const actualError = check.publishableKeyBody.error || check.publishableKeyBody.text || null;
    if (error && actualError !== error) fail(`${check.function} error boundary drifted`);
  }

  const output = {
    schemaVersion: 'earthus.supabase-public-inventory.v1',
    generatedAt: new Date().toISOString(),
    scope: 'READ_ONLY_PUBLIC_SURFACE',
    project: { host, publishableKeyShape: keyShape(publishableKey) },
    local,
    production: {
      postgrestOpenApi: {
        status: openApiResponse.status,
        result: safeErrorBody(openApiBody),
        meaning: openApiResponse.status === 401
          ? 'publishable key cannot enumerate the OpenAPI schema'
          : 'unexpected; inspect before relying on this output',
      },
      relations,
      auth: {
        status: authResponse.status,
        signupDisabled: authSettings.disable_signup,
        mailAutoconfirm: authSettings.mailer_autoconfirm,
        phoneAutoconfirm: authSettings.phone_autoconfirm,
        enabledExternalProviders: Object.entries(authSettings.external || {})
          .filter(([, enabled]) => enabled === true).map(([name]) => name).sort(),
      },
      storage: {
        status: storageResponse.status,
        anonymousVisibleBucketCount: Array.isArray(storageBody) ? storageBody.length : null,
      },
      functions: functionChecks,
    },
    unknown: [
      'remote migration history and checksums',
      'remote pg_policies definitions and FORCE RLS state',
      'Edge Function deployment versions and secret names',
      'private Storage bucket inventory and policies',
      'row totals hidden by RLS',
      'retention jobs except contracts observable from local SQL',
    ],
  };
  process.stdout.write(`${JSON.stringify(output, null, 2)}\n`);
}

audit().catch(error => {
  console.error(`Supabase public audit failed: ${error.message}`);
  process.exit(1);
});
