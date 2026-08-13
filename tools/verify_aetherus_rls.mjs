#!/usr/bin/env node

import assert from 'node:assert/strict';
import { createHash, randomUUID } from 'node:crypto';

const required = ['SUPABASE_URL', 'SUPABASE_ANON_KEY', 'AETHERUS_USER_A_JWT', 'AETHERUS_USER_B_JWT'];
if (!process.argv.includes('--confirm-live')) {
  console.error('BLOCKED: add --confirm-live after confirming the target is the intended Supabase project.');
  process.exit(2);
}
for (const name of required) {
  if (!process.env[name]) {
    console.error(`BLOCKED: ${name} is required; secrets are read from environment only.`);
    process.exit(2);
  }
}

const base = process.env.SUPABASE_URL.replace(/\/$/, '');
const apiKey = process.env.SUPABASE_ANON_KEY;
const tokenA = process.env.AETHERUS_USER_A_JWT;
const tokenB = process.env.AETHERUS_USER_B_JWT;
const probeId = `rls_probe_${randomUUID().replace(/-/g, '')}`;
const report = {
  schema: 'aetherus.rls-principal-ab-evidence.v1',
  startedAtUtc: new Date().toISOString(),
  probeId,
  checks: [],
  status: 'RUNNING',
};

function headers(token, extra = {}) {
  return {
    apikey: apiKey,
    Authorization: `Bearer ${token}`,
    'Content-Type': 'application/json',
    ...extra,
  };
}

async function request(path, token, options = {}) {
  const response = await fetch(`${base}${path}`, {
    ...options,
    headers: headers(token, options.headers),
  });
  const text = await response.text();
  let body = null;
  try { body = text ? JSON.parse(text) : null; } catch (_) { body = text; }
  return { status: response.status, ok: response.ok, body };
}

async function principal(token) {
  const result = await request('/auth/v1/user', token);
  assert.equal(result.status, 200, 'authenticated principal lookup failed');
  assert.match(result.body.id, /^[0-9a-f-]{36}$/i);
  return result.body.id;
}

function hashPrincipal(value) {
  return createHash('sha256').update(value).digest('hex').slice(0, 16);
}

function check(name, passed, evidence = {}) {
  report.checks.push({ name, passed, evidence });
  assert.equal(passed, true, name);
}

let ownerA;
try {
  ownerA = await principal(tokenA);
  const ownerB = await principal(tokenB);
  check('independent-principals', ownerA !== ownerB, {
    principalAHash: hashPrincipal(ownerA),
    principalBHash: hashPrincipal(ownerB),
    rawPrincipalIdsStored: false,
  });

  const inserted = await request('/rest/v1/aetherus_personal_universes?select=universe_id,owner_id,privacy,revision', tokenA, {
    method: 'POST',
    headers: { Prefer: 'return=representation' },
    body: JSON.stringify({ universe_id: probeId, owner_id: ownerA, privacy: 'PRIVATE' }),
  });
  check('principal-a-create-own-row', inserted.status === 201 && inserted.body?.[0]?.universe_id === probeId, {
    status: inserted.status,
  });

  const visibleA = await request(`/rest/v1/aetherus_personal_universes?universe_id=eq.${probeId}&select=universe_id`, tokenA);
  check('principal-a-read-own-row', visibleA.status === 200 && visibleA.body?.length === 1, { status: visibleA.status });

  const hiddenB = await request(`/rest/v1/aetherus_personal_universes?universe_id=eq.${probeId}&select=universe_id`, tokenB);
  check('principal-b-cannot-read-a-row', hiddenB.status === 200 && hiddenB.body?.length === 0, { status: hiddenB.status });

  const forgedInsert = await request('/rest/v1/aetherus_personal_universes', tokenB, {
    method: 'POST',
    headers: { Prefer: 'return=representation' },
    body: JSON.stringify({ universe_id: `${probeId}_forged`, owner_id: ownerA, privacy: 'PRIVATE' }),
  });
  check('principal-b-cannot-insert-as-a', [401, 403].includes(forgedInsert.status), { status: forgedInsert.status });

  const updateB = await request(`/rest/v1/aetherus_personal_universes?universe_id=eq.${probeId}`, tokenB, {
    method: 'PATCH',
    headers: { Prefer: 'return=representation' },
    body: JSON.stringify({ revision: 9 }),
  });
  check('principal-b-cannot-update-a-row', updateB.status === 200 && updateB.body?.length === 0, { status: updateB.status });

  const deleteB = await request(`/rest/v1/aetherus_personal_universes?universe_id=eq.${probeId}`, tokenB, {
    method: 'DELETE',
    headers: { Prefer: 'return=representation' },
  });
  check('principal-b-cannot-delete-a-row', deleteB.status === 200 && deleteB.body?.length === 0, { status: deleteB.status });

  const preservedA = await request(`/rest/v1/aetherus_personal_universes?universe_id=eq.${probeId}&select=universe_id,revision`, tokenA);
  check('principal-a-row-preserved-after-b-attacks', preservedA.status === 200
    && preservedA.body?.length === 1 && preservedA.body[0].revision === 1, { status: preservedA.status });

  const ownDelete = await request(`/rest/v1/aetherus_personal_universes?universe_id=eq.${probeId}`, tokenA, {
    method: 'DELETE',
    headers: { Prefer: 'return=representation' },
  });
  check('principal-a-delete-own-probe', ownDelete.status === 200 && ownDelete.body?.length === 1, { status: ownDelete.status });

  const goneA = await request(`/rest/v1/aetherus_personal_universes?universe_id=eq.${probeId}&select=universe_id`, tokenA);
  check('probe-cleanup-verified', goneA.status === 200 && goneA.body?.length === 0, { status: goneA.status });

  report.status = 'PASS';
} catch (error) {
  report.status = 'FAIL';
  report.error = String(error?.message || error);
  if (ownerA) {
    await request(`/rest/v1/aetherus_personal_universes?universe_id=eq.${probeId}`, tokenA, {
      method: 'DELETE',
      headers: { Prefer: 'return=minimal' },
    }).catch(() => null);
  }
} finally {
  report.completedAtUtc = new Date().toISOString();
  console.log(JSON.stringify(report, null, 2));
}

if (report.status !== 'PASS') process.exit(1);
