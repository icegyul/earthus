export const FORECAST_CAPABILITY = 'forecast.earthus.read';

const RELEASE_GATES = Object.freeze([
  'sample_gate',
  'skill_gate',
  'freshness_gate',
  'rights_gate',
  'rollback_gate',
]);

function timeIsAfter(value, boundary) {
  const instant = Date.parse(value ?? '');
  const edge = Date.parse(boundary ?? '');
  return Number.isFinite(instant) && Number.isFinite(edge) && instant > edge;
}

export function hasActiveForecastEntitlement(profile, now = new Date().toISOString()) {
  if (profile?.tier !== 'paid') return false;
  return timeIsAfter(profile.subscription_ends, now)
    || timeIsAfter(profile.manual_access_until, now);
}

export function validateReleasedForecast(revision, now = new Date().toISOString()) {
  if (!revision || revision.release_state !== 'RELEASED') {
    return Object.freeze({ ok: false, code: 'FORECAST_NOT_RELEASED' });
  }
  if (revision.data_class !== 'EARTHUS_DERIVED'
      || revision.access_class !== 'PREMIUM') {
    return Object.freeze({ ok: false, code: 'PREMIUM_BOUNDARY_VIOLATION' });
  }
  const closed = RELEASE_GATES.filter(gate => revision[gate] !== true);
  if (closed.length) {
    return Object.freeze({ ok: false, code: 'RELEASE_GATE_CLOSED', gates: closed });
  }
  const nowMs = Date.parse(now);
  const fromMs = Date.parse(revision.valid_from ?? '');
  const untilMs = Date.parse(revision.valid_until ?? '');
  if (!Number.isFinite(nowMs) || !Number.isFinite(fromMs) || !Number.isFinite(untilMs)
      || fromMs > nowMs || untilMs <= nowMs) {
    return Object.freeze({ ok: false, code: 'FORECAST_NOT_CURRENT' });
  }
  if (!Array.isArray(revision.source_refs) || revision.source_refs.length === 0
      || !Array.isArray(revision.outputs) || revision.outputs.length === 0) {
    return Object.freeze({ ok: false, code: 'FORECAST_EVIDENCE_MISSING' });
  }
  const boundaryViolation = revision.outputs.some(output => (
    output?.dataClass !== 'EARTHUS_DERIVED'
    || output?.accessClass !== 'PREMIUM'
    || output?.releaseState !== 'RELEASED'
    || !Array.isArray(output?.sourceRefs)
    || output.sourceRefs.length === 0
  ));
  if (boundaryViolation) {
    return Object.freeze({ ok: false, code: 'PREMIUM_BOUNDARY_VIOLATION' });
  }
  return Object.freeze({ ok: true, code: 'RELEASED' });
}

function corsHeaders(origin) {
  return {
    'Access-Control-Allow-Origin': origin,
    'Access-Control-Allow-Headers': 'authorization, content-type, apikey, x-client-info',
    'Access-Control-Allow-Methods': 'GET, OPTIONS',
  };
}

function jsonResponse(body, status, origin) {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      ...corsHeaders(origin),
      'Content-Type': 'application/json; charset=utf-8',
      'Cache-Control': 'private, no-store, max-age=0',
      Pragma: 'no-cache',
      Vary: 'Authorization, Origin',
      'X-Content-Type-Options': 'nosniff',
    },
  });
}

function bearerToken(request) {
  const authorization = request.headers.get('Authorization') ?? '';
  return authorization.startsWith('Bearer ')
    ? authorization.slice('Bearer '.length).trim()
    : '';
}

export async function handleForecastV8Request(request, dependencies) {
  const origin = dependencies?.origin ?? 'https://earthus.net';
  if (request.method === 'OPTIONS') {
    return new Response(null, { status: 204, headers: corsHeaders(origin) });
  }
  if (request.method !== 'GET') return jsonResponse({ error: 'METHOD' }, 405, origin);

  const token = bearerToken(request);
  if (!token) return jsonResponse({ error: 'NO_AUTH' }, 401, origin);

  try {
    const subject = await dependencies.authenticate(token);
    if (!subject?.id) return jsonResponse({ error: 'NO_AUTH' }, 401, origin);

    const now = dependencies.now();
    const profile = await dependencies.loadProfile(subject.id);
    if (!hasActiveForecastEntitlement(profile, now)) {
      return jsonResponse({
        error: 'ENTITLEMENT_REQUIRED',
        capability: FORECAST_CAPABILITY,
      }, 403, origin);
    }

    const scope = new URL(request.url).searchParams.get('scope') ?? '';
    if (!/^[A-Za-z0-9._:-]{3,128}$/.test(scope)) {
      return jsonResponse({ error: 'BAD_SCOPE' }, 400, origin);
    }

    const revision = await dependencies.loadReleasedForecast(now, scope);
    const release = validateReleasedForecast(revision, now);
    if (!release.ok) {
      return jsonResponse({ error: release.code }, 503, origin);
    }

    return jsonResponse({
      schemaVersion: revision.schema_version,
      servedAt: now,
      capability: FORECAST_CAPABILITY,
      dataClass: 'EARTHUS_DERIVED',
      accessClass: 'PREMIUM',
      scope,
      revision: {
        id: revision.id,
        issuedAt: revision.issued_at,
        validFrom: revision.valid_from,
        validUntil: revision.valid_until,
        publishedAt: revision.published_at,
        sourceRefs: revision.source_refs,
        outputs: revision.outputs,
      },
    }, 200, origin);
  } catch (error) {
    dependencies?.onError?.(error);
    return jsonResponse({ error: 'FORECAST_SERVER_ERROR' }, 500, origin);
  }
}
