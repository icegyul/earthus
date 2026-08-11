// Aetherus 공유 URL 계약 v1.
// 기존 ?solar=1, ?space=milkyway|galaxies 주소를 계속 읽되 새 주소에는
// aetherus=1을 붙인다. 장면 상태 자체는 localStorage에 저장하지 않는다.

export const AETHERUS_ROUTE_VERSION = 1;

const ROUTE_KEYS = ['aetherus', 'space', 'solar', 'target', 'photo', 'craft'];
const STAGES = new Set(['solar', 'milkyway', 'galaxies']);
const ID_PATTERN = /^[a-z0-9][a-z0-9_-]{0,79}$/;

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

export function decodeAetherusRoute(input) {
  const params = parametersFrom(input);
  const rawVersion = params.get('aetherus');
  if (rawVersion && rawVersion !== String(AETHERUS_ROUTE_VERSION)) {
    return Object.freeze({
      version: rawVersion,
      stage: null,
      target: null,
      photo: null,
      craft: null,
      issues: Object.freeze(['UNSUPPORTED_VERSION']),
    });
  }

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
  let craft = routeId(params.get('craft'));
  if (params.has('target') && !target) issues.push('INVALID_TARGET');
  if (params.has('photo') && !photo) issues.push('INVALID_PHOTO');
  if (params.has('craft') && !craft) issues.push('INVALID_CRAFT');

  const selected = [target, photo, craft].filter(Boolean);
  if (selected.length > 1) {
    issues.push('CONFLICTING_DETAIL');
    target = null; photo = null; craft = null;
  }
  if (target || photo || craft) stage = 'solar';
  if (!stage) return null;

  return Object.freeze({
    version: rawVersion ? AETHERUS_ROUTE_VERSION : 0,
    stage,
    target,
    photo,
    craft,
    issues: Object.freeze(issues),
  });
}

function requireState(state) {
  if (!state || !STAGES.has(state.stage)) {
    throw new AetherusRouteError('INVALID_STAGE', 'Aetherus route requires solar, milkyway, or galaxies');
  }
  const target = routeId(state.target);
  const photo = routeId(state.photo);
  const craft = routeId(state.craft);
  if (state.target && !target) throw new AetherusRouteError('INVALID_TARGET', 'Invalid target id');
  if (state.photo && !photo) throw new AetherusRouteError('INVALID_PHOTO', 'Invalid photo id');
  if (state.craft && !craft) throw new AetherusRouteError('INVALID_CRAFT', 'Invalid craft id');
  if ([target, photo, craft].filter(Boolean).length > 1) {
    throw new AetherusRouteError('CONFLICTING_DETAIL', 'Only one Aetherus detail may be encoded');
  }
  return { stage: target || photo || craft ? 'solar' : state.stage, target, photo, craft };
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
  if (normalized.craft) url.searchParams.set('craft', normalized.craft);
  return url;
}

export function replaceAetherusRoute(state) {
  const url = encodeAetherusRoute(state, location.href);
  history.replaceState(history.state, '', `${url.pathname}${url.search}${url.hash}`);
  return url;
}
