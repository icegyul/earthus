import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const source = await readFile(new URL('../prototype/supabase/functions/_shared/forecast-v8-policy.js', import.meta.url), 'utf8');
const policy = await import(`data:text/javascript;base64,${Buffer.from(source).toString('base64')}`);

const NOW = '2026-08-21T03:00:00.000Z';
const VALID_URL = 'https://edge.example/forecast-v8?scope=kr.nx60.ny127';
const activeProfile = {
  tier: 'paid',
  subscription_ends: '2026-09-21T03:00:00.000Z',
  manual_access_until: null,
};
const released = {
  id: 'fc-v8-seoul-20260821t0300z',
  schema_version: '8.0',
  data_class: 'EARTHUS_DERIVED',
  access_class: 'PREMIUM',
  release_state: 'RELEASED',
  sample_gate: true,
  skill_gate: true,
  freshness_gate: true,
  rights_gate: true,
  rollback_gate: true,
  issued_at: '2026-08-21T02:30:00.000Z',
  valid_from: '2026-08-21T03:00:00.000Z',
  valid_until: '2026-08-21T09:00:00.000Z',
  published_at: '2026-08-21T02:40:00.000Z',
  source_refs: ['kma-vilage-20260821t0200z', 'ecmwf-open-20260821t0000z'],
  outputs: [{
    dataClass: 'EARTHUS_DERIVED',
    accessClass: 'PREMIUM',
    releaseState: 'RELEASED',
    variable: 'air_temperature',
    unit: 'degC',
    validAt: '2026-08-21T04:00:00.000Z',
    value: 28.1,
    sourceRefs: ['kma-vilage-20260821t0200z', 'ecmwf-open-20260821t0000z'],
  }],
};

assert.equal(policy.FORECAST_CAPABILITY, 'forecast.earthus.read');
assert.equal(policy.hasActiveForecastEntitlement(activeProfile, NOW), true);
assert.equal(policy.hasActiveForecastEntitlement({ ...activeProfile, tier: 'free' }, NOW), false);
assert.equal(policy.hasActiveForecastEntitlement({
  tier: 'paid', subscription_ends: '2026-08-20T03:00:00Z', manual_access_until: null,
}, NOW), false);
assert.equal(policy.hasActiveForecastEntitlement({
  tier: 'paid', subscription_ends: null, manual_access_until: '2026-08-22T03:00:00Z',
}, NOW), true);

// PHASE 2 STEP 2.2 — 등급 서열. 문자열 일치였을 때는 apply_paid_order 가 쓰는
// 'explorer'/'intelligence' 가 전부 차단됐다. 결제가 성공하는 순간 유료 구독자가 막히는 상태였다.
assert.equal(policy.hasActiveForecastEntitlement({ ...activeProfile, tier: 'explorer' }, NOW), true);
assert.equal(policy.hasActiveForecastEntitlement({ ...activeProfile, tier: 'intelligence' }, NOW), true);
assert.equal(policy.hasActiveForecastEntitlement({ ...activeProfile, tier: 'INTELLIGENCE' }, NOW), true);
// 모르는 값·빈 값은 무료로 읽는다 — 오타가 권한을 열어주면 안 된다.
assert.equal(policy.hasActiveForecastEntitlement({ ...activeProfile, tier: 'gold' }, NOW), false);
assert.equal(policy.hasActiveForecastEntitlement({ ...activeProfile, tier: null }, NOW), false);
// 등급이 높아도 구독이 끝났으면 못 본다 — 서열이 기간 판정을 덮지 않는다.
assert.equal(policy.hasActiveForecastEntitlement({
  tier: 'intelligence', subscription_ends: '2026-08-20T03:00:00Z', manual_access_until: null,
}, NOW), false);
// 화면(access-mode.js)과 서버가 같은 정수를 써야 한다. 어긋나면 한쪽만 열린다.
assert.equal(policy.tierRank('free'), 0);
assert.equal(policy.tierRank('paid'), 1);
assert.equal(policy.tierRank('explorer'), 1);
assert.equal(policy.tierRank('intelligence'), 2);

// Edge Function 은 functions/ 밖을 import 할 수 없어 서열표를 복제해 둔다.
// 복제본은 반드시 어긋난다 — 그래서 여기서 두 파일의 정수를 직접 대조한다.
{
  const { readFileSync } = await import('node:fs');
  const rankTable = (src) => {
    const m = src.match(/TIER_RANK\s*=\s*Object\.freeze\(\{([\s\S]*?)\}\)/);
    assert.ok(m, 'TIER_RANK 표를 못 찾았다');
    return Object.fromEntries([...m[1].matchAll(/(\w+)\s*:\s*(\d+)/g)].map((x) => [x[1], Number(x[2])]));
  };
  const client = rankTable(readFileSync(new URL('../prototype/js/access-mode.js', import.meta.url), 'utf8'));
  const server = rankTable(readFileSync(new URL('../prototype/supabase/functions/_shared/forecast-v8-policy.js', import.meta.url), 'utf8'));
  assert.deepEqual(server, client, 'access-mode.js 와 forecast-v8-policy.js 의 등급 서열이 어긋났다 — 서버와 화면이 다른 판정을 한다');
}

assert.equal(policy.validateReleasedForecast(released, NOW).ok, true);
assert.equal(policy.validateReleasedForecast({ ...released, skill_gate: false }, NOW).code, 'RELEASE_GATE_CLOSED');
assert.equal(policy.validateReleasedForecast({ ...released, release_state: 'SHADOW' }, NOW).code, 'FORECAST_NOT_RELEASED');
assert.equal(policy.validateReleasedForecast({ ...released, valid_until: NOW }, NOW).code, 'FORECAST_NOT_CURRENT');
assert.equal(policy.validateReleasedForecast({ ...released, data_class: 'OFFICIAL_WARNING' }, NOW).code, 'PREMIUM_BOUNDARY_VIOLATION');
assert.equal(policy.validateReleasedForecast({
  ...released,
  outputs: [{ dataClass: 'OFFICIAL_FORECAST', accessClass: 'PUBLIC', releaseState: 'RELEASED' }],
}, NOW).code, 'PREMIUM_BOUNDARY_VIOLATION');

const makeDeps = (overrides = {}) => ({
  now: () => NOW,
  authenticate: async token => token === 'active-token' ? { id: 'user-active' } : null,
  loadProfile: async subjectId => subjectId === 'user-active' ? activeProfile : null,
  loadReleasedForecast: async (now, scope) => scope === 'kr.nx60.ny127' ? released : null,
  origin: 'https://earthus.net',
  ...overrides,
});

let response = await policy.handleForecastV8Request(new Request('https://edge.example/forecast-v8'), makeDeps());
assert.equal(response.status, 401);
assert.equal((await response.json()).error, 'NO_AUTH');

response = await policy.handleForecastV8Request(new Request(VALID_URL, {
  headers: { Authorization: 'Bearer invalid-token' },
}), makeDeps());
assert.equal(response.status, 401);

response = await policy.handleForecastV8Request(new Request(VALID_URL, {
  headers: { Authorization: 'Bearer active-token' },
}), makeDeps({ loadProfile: async () => ({ ...activeProfile, subscription_ends: '2026-08-20T03:00:00Z' }) }));
assert.equal(response.status, 403);
assert.equal((await response.json()).error, 'ENTITLEMENT_REQUIRED');

response = await policy.handleForecastV8Request(new Request(VALID_URL, {
  headers: { Authorization: 'Bearer active-token' },
}), makeDeps({ loadReleasedForecast: async () => null }));
assert.equal(response.status, 503);
assert.equal((await response.json()).error, 'FORECAST_NOT_RELEASED');

response = await policy.handleForecastV8Request(new Request('https://edge.example/forecast-v8', {
  headers: { Authorization: 'Bearer active-token' },
}), makeDeps());
assert.equal(response.status, 400);
assert.equal((await response.json()).error, 'BAD_SCOPE');

response = await policy.handleForecastV8Request(new Request(VALID_URL, {
  headers: { Authorization: 'Bearer active-token' },
}), makeDeps());
assert.equal(response.status, 200);
assert.equal(response.headers.get('cache-control'), 'private, no-store, max-age=0');
assert.equal(response.headers.get('vary'), 'Authorization, Origin');
const body = await response.json();
assert.equal(body.capability, 'forecast.earthus.read');
assert.equal(body.dataClass, 'EARTHUS_DERIVED');
assert.equal(body.accessClass, 'PREMIUM');
assert.equal(body.scope, 'kr.nx60.ny127');
assert.equal(body.revision.id, released.id);
assert.deepEqual(body.revision.outputs, released.outputs);
assert.equal(JSON.stringify(body).includes('OFFICIAL_WARNING'), false);

response = await policy.handleForecastV8Request(new Request(VALID_URL, {
  method: 'OPTIONS',
}), makeDeps());
assert.equal(response.status, 204);
assert.equal(response.headers.get('access-control-allow-origin'), 'https://earthus.net');

response = await policy.handleForecastV8Request(new Request('https://edge.example/forecast-v8', {
  method: 'POST', headers: { Authorization: 'Bearer active-token' },
}), makeDeps());
assert.equal(response.status, 405);

console.log('EARTHUS v8 forecast server policy: PASS');
