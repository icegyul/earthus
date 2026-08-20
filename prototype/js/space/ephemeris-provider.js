// Aetherus ephemeris provider.
//
// 브라우저는 JPL Horizons API를 직접 호출하지 않는다.
// NASA/JPL API의 CORS/fair-use 정책에 맞춰 서버에서 순차 수집한 S3/CloudFront 카탈로그를
// 읽고, 6시간 state-vector 노드 사이를 position+velocity cubic Hermite로 보간한다.
// 카탈로그가 없거나 범위를 벗어나면 기존 JPL Table 1 근사식을 heliocentric fallback으로 쓴다.

import { planetPosition } from './kepler.js';
import {
  DAY_MS,
  eclipticToIcrf,
  icrfToEcliptic,
  relativePosition,
  subtractVectors,
} from './coordinates.js';

export const DEFAULT_EPHEMERIS_URL = '/aetherus/ephemeris-major.json.gz';
export const HORIZONS_CATALOG_SCHEMA = 'earthus.aetherus-ephemeris.v1';
export const HORIZONS_PROVIDER_ID = 'jpl-horizons-ssb-icrf-hermite-v1';
export const APPROX_PROVIDER_ID = 'jpl-table1-heliocentric-ecliptic-v1';

export const MAJOR_BODY_IDS = Object.freeze([
  'sun', 'mercury', 'venus', 'earth', 'mars', 'jupiter', 'saturn', 'uranus', 'neptune',
]);
const PLANET_IDS = new Set(MAJOR_BODY_IDS.filter(id => id !== 'sun'));

function normalizedDate(value = new Date()) {
  const date = value instanceof Date ? new Date(value.getTime()) : new Date(value);
  if (!Number.isFinite(date.getTime())) throw new RangeError('VALID_EPHEMERIS_DATE_REQUIRED');
  return date;
}

function finiteSample(row, body) {
  if (!Array.isArray(row) || row.length < 7) throw new RangeError(`EPHEMERIS_SAMPLE_INVALID:${body}`);
  const values = row.slice(0, 7).map(Number);
  if (values.some(value => !Number.isFinite(value))) {
    throw new RangeError(`EPHEMERIS_SAMPLE_NONFINITE:${body}`);
  }
  return values;
}

export function validateEphemerisCatalog(raw) {
  if (!raw || raw.schema !== HORIZONS_CATALOG_SCHEMA || Number(raw.schemaVersion) !== 1) {
    throw new RangeError('EPHEMERIS_SCHEMA_UNSUPPORTED');
  }
  if (raw.frame?.origin !== 'solar-system-barycenter'
    || raw.frame?.orientation !== 'icrf-j2000'
    || raw.frame?.positionUnit !== 'AU'
    || raw.frame?.velocityUnit !== 'AU/day') {
    throw new RangeError('EPHEMERIS_FRAME_UNSUPPORTED');
  }
  const startMs = Date.parse(raw.coverage?.startAt);
  const endMs = Date.parse(raw.coverage?.endAt);
  if (!Number.isFinite(startMs) || !Number.isFinite(endMs) || startMs >= endMs) {
    throw new RangeError('EPHEMERIS_COVERAGE_INVALID');
  }
  const bodies = {};
  MAJOR_BODY_IDS.forEach(id => {
    const entry = raw.bodies?.[id];
    if (!entry || !Array.isArray(entry.samples) || entry.samples.length < 2) {
      throw new RangeError(`EPHEMERIS_BODY_MISSING:${id}`);
    }
    const samples = entry.samples.map(row => finiteSample(row, id));
    for (let index = 1; index < samples.length; index += 1) {
      if (!(samples[index][0] > samples[index - 1][0])) {
        throw new RangeError(`EPHEMERIS_TIME_NOT_MONOTONIC:${id}`);
      }
    }
    bodies[id] = Object.freeze({
      command: String(entry.command || ''),
      samples: Object.freeze(samples.map(row => Object.freeze(row))),
    });
  });
  return Object.freeze({
    ...raw,
    coverage: Object.freeze({ ...raw.coverage, startMs, endMs }),
    bodies: Object.freeze(bodies),
  });
}

function bracket(samples, timeMs) {
  if (timeMs < samples[0][0] || timeMs > samples[samples.length - 1][0]) return null;
  if (timeMs === samples[samples.length - 1][0]) {
    return { left: samples.length - 2, right: samples.length - 1, u: 1 };
  }
  let low = 0;
  let high = samples.length - 1;
  while (low + 1 < high) {
    const middle = Math.floor((low + high) / 2);
    if (samples[middle][0] <= timeMs) low = middle;
    else high = middle;
  }
  const t0 = samples[low][0];
  const t1 = samples[high][0];
  return { left: low, right: high, u: (timeMs - t0) / (t1 - t0) };
}

function hermiteAxis(p0, v0, p1, v1, u, dtDays) {
  const u2 = u * u;
  const u3 = u2 * u;
  const h00 = 2 * u3 - 3 * u2 + 1;
  const h10 = u3 - 2 * u2 + u;
  const h01 = -2 * u3 + 3 * u2;
  const h11 = u3 - u2;
  const position = h00 * p0 + h10 * dtDays * v0 + h01 * p1 + h11 * dtDays * v1;

  const dh00 = 6 * u2 - 6 * u;
  const dh10 = 3 * u2 - 4 * u + 1;
  const dh01 = -6 * u2 + 6 * u;
  const dh11 = 3 * u2 - 2 * u;
  const velocity = (dh00 * p0 + dh10 * dtDays * v0 + dh01 * p1 + dh11 * dtDays * v1)
    / dtDays;
  return { position, velocity };
}

export function interpolateState(samples, at) {
  const date = normalizedDate(at);
  const timeMs = date.getTime();
  const window = bracket(samples, timeMs);
  if (!window) return null;
  const left = samples[window.left];
  const right = samples[window.right];
  const dtDays = (right[0] - left[0]) / DAY_MS;
  if (!(dtDays > 0)) throw new RangeError('EPHEMERIS_SAMPLE_INTERVAL_INVALID');
  const x = hermiteAxis(left[1], left[4], right[1], right[4], window.u, dtDays);
  const y = hermiteAxis(left[2], left[5], right[2], right[5], window.u, dtDays);
  const z = hermiteAxis(left[3], left[6], right[3], right[6], window.u, dtDays);
  return Object.freeze({
    at: date.toISOString(),
    position: Object.freeze({ x: x.position, y: y.position, z: z.position }),
    velocity: Object.freeze({ x: x.velocity, y: y.velocity, z: z.velocity }),
    interpolation: Object.freeze({
      kind: 'cubic-hermite-position-velocity',
      leftAt: new Date(left[0]).toISOString(),
      rightAt: new Date(right[0]).toISOString(),
      fraction: window.u,
    }),
  });
}

export function createMajorEphemerisService({
  url = DEFAULT_EPHEMERIS_URL,
  fetchFn = globalThis.fetch?.bind(globalThis),
} = {}) {
  let catalog = null;
  let loadPromise = null;
  let lastError = null;

  const api = {
    get providerId() { return catalog ? HORIZONS_PROVIDER_ID : APPROX_PROVIDER_ID; },
    get catalog() { return catalog; },
    get error() { return lastError; },
    status() {
      return Object.freeze({
        loaded: !!catalog,
        providerId: this.providerId,
        url,
        generatedAt: catalog?.generatedAt || null,
        coverage: catalog ? {
          startAt: catalog.coverage.startAt,
          endAt: catalog.coverage.endAt,
          stepHours: catalog.coverage.stepHours,
        } : null,
        error: lastError,
      });
    },
    async preload({ refresh = false } = {}) {
      if (refresh) loadPromise = null;
      if (catalog && !refresh) return catalog;
      if (loadPromise) return loadPromise;
      if (typeof fetchFn !== 'function') {
        lastError = 'EPHEMERIS_FETCH_UNAVAILABLE';
        return null;
      }
      loadPromise = fetchFn(url, { cache: refresh ? 'reload' : 'no-cache' })
        .then(response => {
          if (!response.ok) throw new Error(`EPHEMERIS_HTTP_${response.status}`);
          return response.json();
        })
        .then(raw => {
          catalog = validateEphemerisCatalog(raw);
          lastError = null;
          return catalog;
        })
        .catch(error => {
          lastError = error?.message || 'EPHEMERIS_LOAD_FAILED';
          catalog = null;
          return null;
        })
        .finally(() => { loadPromise = null; });
      return loadPromise;
    },
    barycentricIcrfState(id, at = new Date()) {
      if (!catalog || !MAJOR_BODY_IDS.includes(id)) return null;
      const state = interpolateState(catalog.bodies[id].samples, at);
      if (!state) return null;
      return Object.freeze({
        ...state,
        id,
        origin: 'solar-system-barycenter',
        orientation: 'icrf-j2000',
        positionUnit: 'AU',
        velocityUnit: 'AU/day',
        provider: HORIZONS_PROVIDER_ID,
        source: catalog.source,
      });
    },
    heliocentricIcrfState(id, at = new Date()) {
      const date = normalizedDate(at);
      if (id === 'sun') {
        return Object.freeze({
          id: 'sun', at: date.toISOString(), position: Object.freeze({ x: 0, y: 0, z: 0 }),
          velocity: Object.freeze({ x: 0, y: 0, z: 0 }), origin: 'sun', orientation: 'icrf-j2000',
          positionUnit: 'AU', velocityUnit: 'AU/day', provider: this.providerId,
        });
      }
      if (!PLANET_IDS.has(id)) throw new RangeError(`UNKNOWN_PLANET:${id}`);
      const body = this.barycentricIcrfState(id, date);
      const sun = this.barycentricIcrfState('sun', date);
      if (body && sun) {
        return Object.freeze({
          id,
          at: date.toISOString(),
          position: Object.freeze(subtractVectors(body.position, sun.position)),
          velocity: Object.freeze(subtractVectors(body.velocity, sun.velocity)),
          origin: 'sun',
          orientation: 'icrf-j2000',
          positionUnit: 'AU',
          velocityUnit: 'AU/day',
          provider: HORIZONS_PROVIDER_ID,
          interpolation: body.interpolation,
        });
      }
      const approximate = planetPosition(id, date);
      return Object.freeze({
        id,
        at: date.toISOString(),
        position: Object.freeze(eclipticToIcrf(approximate)),
        velocity: null,
        origin: 'sun',
        orientation: 'icrf-j2000',
        positionUnit: 'AU',
        velocityUnit: null,
        provider: APPROX_PROVIDER_ID,
        fallbackReason: catalog ? 'DATE_OUTSIDE_HORIZONS_COVERAGE' : (lastError || 'HORIZONS_CATALOG_NOT_LOADED'),
      });
    },
    heliocentricEclipticState(id, at = new Date()) {
      const state = this.heliocentricIcrfState(id, at);
      return Object.freeze({
        ...state,
        position: Object.freeze(icrfToEcliptic(state.position)),
        velocity: state.velocity ? Object.freeze(icrfToEcliptic(state.velocity)) : null,
        orientation: 'ecliptic-j2000',
      });
    },
    geocentricIcrfState(id, at = new Date()) {
      if (!MAJOR_BODY_IDS.includes(id) || id === 'earth') {
        if (id === 'earth') return Object.freeze({
          id, at: normalizedDate(at).toISOString(), position: Object.freeze({ x: 0, y: 0, z: 0 }),
          velocity: Object.freeze({ x: 0, y: 0, z: 0 }), origin: 'earth', orientation: 'icrf-j2000',
          positionUnit: 'AU', velocityUnit: 'AU/day', provider: this.providerId,
        });
        throw new RangeError(`UNKNOWN_MAJOR_BODY:${id}`);
      }
      const body = this.barycentricIcrfState(id, at);
      const earth = this.barycentricIcrfState('earth', at);
      if (!body || !earth) return null;
      return Object.freeze({
        id,
        at: body.at,
        position: Object.freeze(relativePosition(body.position, earth.position)),
        velocity: Object.freeze(relativePosition(body.velocity, earth.velocity)),
        origin: 'earth',
        orientation: 'icrf-j2000',
        positionUnit: 'AU',
        velocityUnit: 'AU/day',
        provider: HORIZONS_PROVIDER_ID,
        interpolation: body.interpolation,
      });
    },
  };
  return Object.freeze(api);
}

export function ephemerisProviderSelfTest() {
  const t0 = Date.parse('2026-08-20T00:00:00.000Z');
  const t1 = t0 + 6 * 60 * 60 * 1000;
  const samples = [
    [t0, 0, 0, 0, 1, 2, 3],
    [t1, .25, .5, .75, 1, 2, 3],
  ];
  const middle = interpolateState(samples, new Date((t0 + t1) / 2));
  const expectedDays = .125;
  const error = Math.max(
    Math.abs(middle.position.x - expectedDays),
    Math.abs(middle.position.y - expectedDays * 2),
    Math.abs(middle.position.z - expectedDays * 3),
  );
  return Object.freeze({ ok: error < 1e-12, errorAu: error });
}
