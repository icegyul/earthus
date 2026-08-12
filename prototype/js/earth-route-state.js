// EARTHUS 공유 URL 계약 v1.
//
// 첫 방문은 query가 없는 아름다운 Earth View다. 사용자가 레이어를 열고 자료를
// 고른 뒤에만 Style/Data/Evidence/Decision 상태를 URL에 쓴다. 카메라의 매 프레임
// 좌표를 저장하지 않고, 사용자가 다시 찾아야 하는 의미 있는 선택만 저장한다.
//
// ⚠️ AETHERUS의 `view`, `at`, `target`과 이름이 겹치지 않게 모든 EARTHUS 키에는
// `earth` 접두어를 붙인다. 두 서비스 상태가 한 URL에 섞이면 어느 장면을 먼저
// 복원할지 결정할 수 없으므로, Earth 상태를 쓸 때만 다른 서비스 route를 걷어낸다.

export const EARTH_ROUTE_VERSION = 1;

export const EARTH_ROUTE_KEYS = Object.freeze([
  'earth', 'earthView', 'earthLayer', 'earthAt', 'earthModel', 'earthPoint',
  'earthActivity', 'earthReservation',
]);

const FOREIGN_ROUTE_KEYS = Object.freeze([
  'aetherus', 'space', 'solar', 'target', 'photo', 'telescope', 'craft',
  'observer', 'at', 'precision', 'dive', 'ocean',
]);
const SUPPORTED_VERSIONS = new Set(['1']);
const VIEWS = new Set(['earth', 'style', 'data', 'evidence', 'decision']);
const ID_PATTERN = /^[a-z0-9][a-z0-9_.:-]{0,79}$/;
const UTC_PATTERN = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,3})?Z$/;
const MIN_TIME_MS = Date.parse('2000-01-01T00:00:00.000Z');
const MAX_TIME_MS = Date.parse('2100-01-01T00:00:00.000Z');

export class EarthRouteError extends Error {
  constructor(code, message) {
    super(message);
    this.name = 'EarthRouteError';
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

export function hasEarthRoute(input) {
  const params = parametersFrom(input);
  return EARTH_ROUTE_KEYS.some(key => params.has(key));
}

function routeId(value) {
  if (!value) return null;
  const normalized = String(value).trim().toLowerCase();
  return ID_PATTERN.test(normalized) ? normalized : null;
}

function routeInstant(value) {
  if (!value || !UTC_PATTERN.test(String(value))) return null;
  const time = Date.parse(value);
  if (!Number.isFinite(time) || time < MIN_TIME_MS || time > MAX_TIME_MS) return null;
  return new Date(Math.floor(time / 1000) * 1000).toISOString();
}

const roundedCoordinate = value => Number(Number(value).toFixed(2));

function routePoint(value) {
  if (!value) return null;
  const parts = String(value).trim().split(',');
  if (parts.length !== 2 || parts.some(part => part.trim() === '')) return null;
  const lat = Number(parts[0]);
  const lon = Number(parts[1]);
  if (!Number.isFinite(lat) || !Number.isFinite(lon)
    || lat < -90 || lat > 90 || lon < -180 || lon > 180) return null;
  /* 공유 URL은 약 1km 정밀도로 제한한다. 지도를 누른 점이 사용자의 현재 위치일 수
     있는데, 화면 복원에 필요하지 않은 정밀 좌표를 주소·방문기록에 남기지 않는다. */
  return Object.freeze({ lat: roundedCoordinate(lat), lon: roundedCoordinate(lon) });
}

function frozenState(state) {
  return Object.freeze({
    version: state.version,
    view: state.view,
    layer: state.layer || null,
    at: state.at || null,
    model: state.model || null,
    point: state.point || null,
    activity: state.activity || null,
    reservation: state.reservation || null,
    issues: Object.freeze([...(state.issues || [])]),
  });
}

function safeFallback(version, issues) {
  return frozenState({
    version, view: 'earth', layer: null, at: null, model: null, point: null,
    activity: null, reservation: null, issues,
  });
}

export function decodeEarthRoute(input) {
  const params = parametersFrom(input);
  if (!hasEarthRoute(params)) return null;

  const rawVersion = params.get('earth');
  if (!rawVersion || !SUPPORTED_VERSIONS.has(rawVersion)) {
    return safeFallback(rawVersion || null, ['UNSUPPORTED_VERSION']);
  }

  const issues = [];
  let view = String(params.get('earthView') || 'earth').trim().toLowerCase();
  if (!VIEWS.has(view)) {
    issues.push('INVALID_VIEW');
    view = 'earth';
  }

  let layer = routeId(params.get('earthLayer'));
  let at = routeInstant(params.get('earthAt'));
  let model = routeId(params.get('earthModel'));
  let point = routePoint(params.get('earthPoint'));
  let activity = routeId(params.get('earthActivity'));
  let reservation = routeId(params.get('earthReservation'));

  if (params.has('earthLayer') && !layer) issues.push('INVALID_LAYER');
  if (params.has('earthAt') && !at) issues.push('INVALID_AT');
  if (params.has('earthModel') && !model) issues.push('INVALID_MODEL');
  if (params.has('earthPoint') && !point) issues.push('INVALID_POINT');
  if (params.has('earthActivity') && !activity) issues.push('INVALID_ACTIVITY');
  if (params.has('earthReservation') && !reservation) issues.push('INVALID_RESERVATION');

  /* 부분적으로 깨진 공유 주소는 빈 패널로 보내지 않는다. 가능한 바로 앞 단계로
     낮춰 복원하고, issues는 남겨 화면/로그가 왜 낮아졌는지 설명할 수 있게 한다. */
  if ((view === 'data' || view === 'evidence') && !layer) {
    issues.push('MISSING_LAYER');
    view = 'style';
  }
  if (view === 'evidence' && !point) {
    issues.push('MISSING_POINT');
    view = 'data';
  }
  if (view === 'decision' && !activity && !reservation) {
    issues.push('MISSING_DECISION_TARGET');
    view = layer ? (point ? 'evidence' : 'data') : 'earth';
  }

  if (view === 'earth' || view === 'style') {
    if (layer || at || model || point || activity || reservation) issues.push('ORPHAN_DETAIL');
    layer = null; at = null; model = null; point = null; activity = null; reservation = null;
  } else if (view === 'data') {
    if (point || activity || reservation) issues.push('ORPHAN_DETAIL');
    point = null; activity = null; reservation = null;
  } else if (view === 'evidence') {
    if (activity || reservation) issues.push('ORPHAN_DECISION');
    activity = null; reservation = null;
  }

  return frozenState({
    version: Number(rawVersion), view, layer, at, model, point, activity, reservation, issues,
  });
}

function requireState(input) {
  if (!input || !VIEWS.has(input.view)) {
    throw new EarthRouteError('INVALID_VIEW', 'Earth route requires a supported view');
  }
  const layer = routeId(input.layer);
  const at = routeInstant(input.at);
  const model = routeId(input.model);
  const point = typeof input.point === 'string'
    ? routePoint(input.point) : routePoint(`${input.point?.lat},${input.point?.lon}`);
  const activity = routeId(input.activity);
  const reservation = routeId(input.reservation);

  if (input.layer && !layer) throw new EarthRouteError('INVALID_LAYER', 'Invalid Earth layer id');
  if (input.at && !at) throw new EarthRouteError('INVALID_AT', 'Invalid Earth valid time');
  if (input.model && !model) throw new EarthRouteError('INVALID_MODEL', 'Invalid Earth model id');
  if (input.point && !point) throw new EarthRouteError('INVALID_POINT', 'Invalid Earth point');
  if (input.activity && !activity) throw new EarthRouteError('INVALID_ACTIVITY', 'Invalid activity id');
  if (input.reservation && !reservation) {
    throw new EarthRouteError('INVALID_RESERVATION', 'Invalid reservation id');
  }
  if ((input.view === 'data' || input.view === 'evidence') && !layer) {
    throw new EarthRouteError('MISSING_LAYER', `${input.view} view requires a layer`);
  }
  if (input.view === 'evidence' && !point) {
    throw new EarthRouteError('MISSING_POINT', 'Evidence view requires a point');
  }
  if (input.view === 'decision' && !activity && !reservation) {
    throw new EarthRouteError('MISSING_DECISION_TARGET', 'Decision view requires an activity or reservation');
  }
  if ((input.view === 'earth' || input.view === 'style')
    && (layer || at || model || point || activity || reservation)) {
    throw new EarthRouteError('ORPHAN_DETAIL', `${input.view} view cannot contain detail state`);
  }
  if (input.view === 'data' && (point || activity || reservation)) {
    throw new EarthRouteError('ORPHAN_DETAIL', 'Data view cannot contain point or decision state');
  }
  return { view: input.view, layer, at, model, point, activity, reservation };
}

export function encodeEarthRoute(state, href = 'https://earthus.net/') {
  const url = href instanceof URL ? new URL(href.href) : new URL(String(href), 'https://earthus.net/');
  EARTH_ROUTE_KEYS.forEach(key => url.searchParams.delete(key));
  if (!state || state.view === 'earth') return url;

  const normalized = requireState(state);
  FOREIGN_ROUTE_KEYS.forEach(key => url.searchParams.delete(key));
  url.searchParams.set('earth', String(EARTH_ROUTE_VERSION));
  url.searchParams.set('earthView', normalized.view);
  if (normalized.layer) url.searchParams.set('earthLayer', normalized.layer);
  if (normalized.at) url.searchParams.set('earthAt', normalized.at);
  if (normalized.model) url.searchParams.set('earthModel', normalized.model);
  if (normalized.point) {
    url.searchParams.set('earthPoint', `${normalized.point.lat},${normalized.point.lon}`);
  }
  if (normalized.activity) url.searchParams.set('earthActivity', normalized.activity);
  if (normalized.reservation) url.searchParams.set('earthReservation', normalized.reservation);
  return url;
}

export function writeEarthRoute(state, mode = 'replace') {
  const url = encodeEarthRoute(state, location.href);
  const next = `${url.pathname}${url.search}${url.hash}`;
  const current = `${location.pathname}${location.search}${location.hash}`;
  if (next === current) return url;
  const method = mode === 'push' ? 'pushState' : 'replaceState';
  history[method](history.state, '', next);
  return url;
}
