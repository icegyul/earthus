// Aetherus 공유 URL 계약 v4.
// v1·v2·v3·기존 ?solar=1, ?space=milkyway|galaxies 주소를 계속 읽고,
// v4에서는 Mars에만 묶였던 observer/UTC My Sky 상태를 주요 행성으로 확장한다.
// v3의 결정론적 24시간 계획은 계속 Mars 전용이다.
// 관측 좌표는 사용자가 명시적으로 '내 위치 사용'을 눌렀을 때만
// 소수점 둘째 자리(약 1km)로 공유 URL에 넣는다. localStorage에는 저장하지 않는다.

export const AETHERUS_ROUTE_VERSION = 4;

const SUPPORTED_VERSIONS = new Set(['1', '2', '3', '4']);
const ROUTE_KEYS = [
  'aetherus', 'space', 'solar', 'target', 'photo', 'telescope', 'craft',
  'observer', 'at', 'precision', 'plan',
];
const STAGES = new Set(['solar', 'milkyway', 'galaxies']);
const TELESCOPES = new Set(['all', 'hst', 'jwst']);
const PRECISIONS = new Set(['explorer']);
const PLANS = new Set(['geometry24h']);
const ASTRONOMY_TARGETS = new Set([
  'sun', 'mercury', 'venus', 'mars', 'jupiter', 'saturn', 'uranus', 'neptune',
]);
const ID_PATTERN = /^[a-z0-9][a-z0-9_-]{0,79}$/;
const UTC_PATTERN = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,3})?Z$/;
const MIN_ASTRONOMY_MS = Date.parse('1800-01-01T00:00:00.000Z');
const MAX_ASTRONOMY_MS = Date.parse('2050-01-01T00:00:00.000Z');

export class AetherusRouteError extends Error {
  constructor(code, message) {
    super(message);
    this.name = 'AetherusRouteError';
    this.code = code;
  }
}

function parametersFrom(input) {
  if (input instanceof URLSearchParams) return new URLSearchParams(input);
  if (input instanceof URL) return new URLSearchParams(input.search);
  const value = String(input || '');
  if (value.startsWith('?') || !value.includes('://')) {
    return new URLSearchParams(value.startsWith('?') ? value.slice(1) : value);
  }
  return new URL(value).searchParams;
}

function routeId(value) {
  if (!value) return null;
  const normalized = String(value).trim().toLowerCase();
  return ID_PATTERN.test(normalized) ? normalized : null;
}

const roundedCoordinate = value => Number(Number(value).toFixed(2));

function routeObserver(value) {
  if (!value) return null;
  const normalized = String(value).trim().toLowerCase();
  if (normalized === 'default') {
    return Object.freeze({ id: 'default', source: 'default' });
  }
  const parts = normalized.split(',');
  if (parts.length !== 2 || parts.some(part => part.trim() === '')) return null;
  const lat = Number(parts[0]);
  const lon = Number(parts[1]);
  if (!Number.isFinite(lat) || !Number.isFinite(lon)
    || lat < -90 || lat > 90 || lon < -180 || lon > 180) return null;
  return Object.freeze({
    id: null,
    source: 'shared',
    lat: roundedCoordinate(lat),
    lon: roundedCoordinate(lon),
  });
}

function routeInstant(value) {
  if (!value || !UTC_PATTERN.test(String(value))) return null;
  const time = Date.parse(value);
  if (!Number.isFinite(time) || time < MIN_ASTRONOMY_MS || time > MAX_ASTRONOMY_MS) return null;
  return new Date(Math.floor(time / 1000) * 1000).toISOString();
}

function emptyUnsupportedRoute(rawVersion) {
  return Object.freeze({
    version: rawVersion,
    stage: null,
    target: null,
    photo: null,
    telescope: null,
    craft: null,
    observer: null,
    at: null,
    precision: null,
    plan: null,
    issues: Object.freeze(['UNSUPPORTED_VERSION']),
  });
}

export function decodeAetherusRoute(input) {
  const params = parametersFrom(input);
  const rawVersion = params.get('aetherus');
  if (rawVersion && !SUPPORTED_VERSIONS.has(rawVersion)) return emptyUnsupportedRoute(rawVersion);

  const issues = [];
  const space = params.get('space');
  const solar = params.get('solar');
  let stage = STAGES.has(space) ? space : null;
  if (solar === '1') {
    if (stage && stage !== 'solar') issues.push('CONFLICTING_STAGE');
    stage = 'solar';
  }
  if (space && !STAGES.has(space)) issues.push('INVALID_STAGE');

  let target = routeId(params.get('target'));
  let photo = routeId(params.get('photo'));
  let telescope = params.get('telescope')?.trim().toLowerCase() || null;
  let craft = routeId(params.get('craft'));
  let observer = routeObserver(params.get('observer'));
  let at = routeInstant(params.get('at'));
  let precision = params.get('precision')?.trim().toLowerCase() || null;
  let plan = params.get('plan')?.trim().toLowerCase() || null;
  if (params.has('target') && !target) issues.push('INVALID_TARGET');
  if (params.has('photo') && !photo) issues.push('INVALID_PHOTO');
  if (telescope && !TELESCOPES.has(telescope)) {
    issues.push('INVALID_TELESCOPE');
    telescope = null;
  }
  if (params.has('craft') && !craft) issues.push('INVALID_CRAFT');
  if (params.has('observer') && !observer) issues.push('INVALID_OBSERVER');
  if (params.has('at') && !at) issues.push('INVALID_AT');
  if (precision && !PRECISIONS.has(precision)) {
    issues.push('INVALID_PRECISION');
    precision = null;
  }
  if (plan && !PLANS.has(plan)) {
    issues.push('INVALID_PLAN');
    plan = null;
  }

  const selectedKinds = [target ? 'target' : null, craft ? 'craft' : null,
    (photo || telescope) ? 'photo' : null].filter(Boolean);
  if (selectedKinds.length > 1) {
    issues.push('CONFLICTING_DETAIL');
    target = null; photo = null; telescope = null; craft = null;
  }
  const hasAstronomy = !!(observer || at || precision);
  if (hasAstronomy && !ASTRONOMY_TARGETS.has(target)) {
    issues.push('ORPHAN_ASTRONOMY_STATE');
    observer = null; at = null; precision = null;
  }
  if (plan && target !== 'mars') {
    issues.push('ORPHAN_PLAN_STATE');
    plan = null;
  } else if (plan && (!rawVersion || Number(rawVersion) < 3)) {
    issues.push('PLAN_REQUIRES_V3');
    plan = null;
  } else if (plan && !(observer && at && precision)) {
    issues.push('INCOMPLETE_PLAN_INPUT');
    plan = null;
  }
  if (target || photo || telescope || craft) stage = 'solar';
  if (!stage) return null;

  return Object.freeze({
    version: rawVersion ? Number(rawVersion) : 0,
    stage,
    target,
    photo,
    telescope,
    craft,
    observer,
    at,
    precision,
    plan,
    issues: Object.freeze(issues),
  });
}

function requireAstronomy(state, target) {
  const hasAstronomy = !!(state.observer || state.at || state.precision);
  if (!hasAstronomy) return { observer: null, at: null, precision: null };
  if (!ASTRONOMY_TARGETS.has(target)) {
    throw new AetherusRouteError('ORPHAN_ASTRONOMY_STATE', 'Astronomy state requires a supported Solar System target');
  }
  const observer = typeof state.observer === 'string'
    ? routeObserver(state.observer)
    : state.observer?.id === 'default' || state.observer?.source === 'default'
      ? routeObserver('default')
      : routeObserver(`${state.observer?.lat},${state.observer?.lon}`);
  const at = routeInstant(state.at);
  const precision = state.precision ? String(state.precision).trim().toLowerCase() : null;
  if (state.observer && !observer) throw new AetherusRouteError('INVALID_OBSERVER', 'Invalid observer coordinates');
  if (state.at && !at) throw new AetherusRouteError('INVALID_AT', 'Invalid UTC instant');
  if (precision && !PRECISIONS.has(precision)) {
    throw new AetherusRouteError('INVALID_PRECISION', 'Unsupported astronomy precision tier');
  }
  return { observer, at, precision };
}

function requireState(state) {
  if (!state || !STAGES.has(state.stage)) {
    throw new AetherusRouteError('INVALID_STAGE', 'Aetherus route requires solar, milkyway, or galaxies');
  }
  const target = routeId(state.target);
  const photo = routeId(state.photo);
  const telescope = state.telescope ? String(state.telescope).trim().toLowerCase() : null;
  const craft = routeId(state.craft);
  const plan = state.plan ? String(state.plan).trim().toLowerCase() : null;
  if (state.target && !target) throw new AetherusRouteError('INVALID_TARGET', 'Invalid target id');
  if (state.photo && !photo) throw new AetherusRouteError('INVALID_PHOTO', 'Invalid photo id');
  if (telescope && !TELESCOPES.has(telescope)) {
    throw new AetherusRouteError('INVALID_TELESCOPE', 'Invalid telescope filter');
  }
  if (state.craft && !craft) throw new AetherusRouteError('INVALID_CRAFT', 'Invalid craft id');
  if (plan && !PLANS.has(plan)) throw new AetherusRouteError('INVALID_PLAN', 'Unsupported observation plan');
  if ([target ? 'target' : null, craft ? 'craft' : null,
    (photo || telescope) ? 'photo' : null].filter(Boolean).length > 1) {
    throw new AetherusRouteError('CONFLICTING_DETAIL', 'Only one Aetherus detail may be encoded');
  }
  const astronomy = requireAstronomy(state, target);
  if (plan && target !== 'mars') {
    throw new AetherusRouteError('ORPHAN_PLAN_STATE', 'Observation plan currently requires target=mars');
  }
  if (plan && !(astronomy.observer && astronomy.at && astronomy.precision)) {
    throw new AetherusRouteError('INCOMPLETE_PLAN_INPUT', 'Observation plan requires observer, UTC, and precision');
  }
  return {
    stage: target || photo || telescope || craft ? 'solar' : state.stage,
    target, photo, telescope, craft, ...astronomy, plan,
  };
}

function observerParameter(observer) {
  if (!observer) return null;
  if (observer.id === 'default' || observer.source === 'default') return 'default';
  return `${roundedCoordinate(observer.lat)},${roundedCoordinate(observer.lon)}`;
}

export function encodeAetherusRoute(state, href = 'https://earthus.net/') {
  const url = href instanceof URL ? new URL(href.href) : new URL(String(href), 'https://earthus.net/');
  ROUTE_KEYS.forEach(key => url.searchParams.delete(key));
  if (!state) return url;

  const normalized = requireState(state);
  url.searchParams.set('aetherus', String(AETHERUS_ROUTE_VERSION));
  if (normalized.stage === 'solar') url.searchParams.set('solar', '1');
  else url.searchParams.set('space', normalized.stage);
  if (normalized.target) url.searchParams.set('target', normalized.target);
  if (normalized.photo) url.searchParams.set('photo', normalized.photo);
  if (normalized.telescope) url.searchParams.set('telescope', normalized.telescope);
  if (normalized.craft) url.searchParams.set('craft', normalized.craft);
  const observer = observerParameter(normalized.observer);
  if (observer) url.searchParams.set('observer', observer);
  if (normalized.at) url.searchParams.set('at', normalized.at);
  if (normalized.precision) url.searchParams.set('precision', normalized.precision);
  if (normalized.plan) url.searchParams.set('plan', normalized.plan);
  return url;
}

export function replaceAetherusRoute(state) {
  const url = encodeAetherusRoute(state, location.href);
  history.replaceState(history.state, '', `${url.pathname}${url.search}${url.hash}`);
  return url;
}
