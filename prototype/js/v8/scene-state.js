const QUALITY = new Set(['FULL', 'BALANCED', 'LITE', 'STATIC']);
const UI_DENSITY = new Set(['QUIET', 'STANDARD', 'LAB']);
const LEGACY_LAYER = Object.freeze({
  tourism: 'human.tourism', ocean: 'ocean.current', wind: 'weather.wind', stations: 'observation.network',
});

function finite(value, field) {
  if (!Number.isFinite(value)) throw new TypeError(`${field} must be finite`);
  return value;
}

function normalizeCamera(camera) {
  const result = {
    longitude: finite(camera?.longitude, 'longitude'), latitude: finite(camera?.latitude, 'latitude'),
    height: finite(camera?.height, 'height'), heading: finite(camera?.heading, 'heading'),
    pitch: finite(camera?.pitch, 'pitch'), roll: finite(camera?.roll, 'roll'),
  };
  if (result.longitude < -180 || result.longitude > 180) throw new RangeError('longitude must be between -180 and 180');
  if (result.latitude < -90 || result.latitude > 90) throw new RangeError('latitude must be between -90 and 90');
  if (result.height < 0) throw new RangeError('height must not be negative');
  return result;
}

function normalizeTime(time) {
  if (!time || Number.isNaN(Date.parse(time.cursorTime))) throw new TypeError('time.cursorTime must be an ISO date-time');
  if (time.playback?.loop !== false) throw new TypeError('time playback loop must be false');
  return structuredClone(time);
}

export function makeSceneState(input) {
  if (!input?.sceneId) throw new TypeError('sceneId is required');
  if (!QUALITY.has(input.quality)) throw new TypeError(`unknown quality: ${input.quality}`);
  if (!UI_DENSITY.has(input.uiDensity)) throw new TypeError(`unknown uiDensity: ${input.uiDensity}`);
  return Object.freeze({
    schemaVersion: '8.0', sceneId: input.sceneId, camera: normalizeCamera(input.camera),
    layers: [...new Set(input.layers ?? [])], time: normalizeTime(input.time),
    selectedFeatureId: input.selectedFeatureId ?? null, quality: input.quality, uiDensity: input.uiDensity,
    legacyAliases: structuredClone(input.legacyAliases ?? {}),
  });
}

export function fromLegacyUrl(urlValue) {
  const url = new URL(urlValue, 'https://earthus.net/');
  const layerAlias = url.searchParams.get('earthLayer');
  const point = (url.searchParams.get('point') ?? '').split(',').map(Number);
  const latitude = Number.isFinite(point[0]) ? point[0] : 37.5;
  const longitude = Number.isFinite(point[1]) ? point[1] : 127.5;
  const at = url.searchParams.get('at');
  const cursorTime = at && !Number.isNaN(Date.parse(at)) ? at : new Date().toISOString();
  const legacyAliases = Object.fromEntries(['earthView', 'earthLayer', 'model', 'activity']
    .map(key => [key, url.searchParams.get(key)]).filter(([, value]) => value !== null));
  return makeSceneState({
    sceneId: 'legacy-earth',
    camera: { longitude, latitude, height: 9000000, heading: 0, pitch: -1.2, roll: 0 },
    layers: layerAlias ? [LEGACY_LAYER[layerAlias] ?? layerAlias] : [],
    time: { schemaVersion: '8.0', mode: 'NOW', cursorTime, timezone: 'UTC', playback: { state: 'STOPPED', rate: 1, loop: false }, layerAvailability: [] },
    quality: 'BALANCED', uiDensity: 'QUIET', selectedFeatureId: null, legacyAliases,
  });
}

export function toShareUrl(scene, baseUrl = 'https://earthus.net/') {
  const url = new URL(baseUrl);
  url.searchParams.set('earth', '1');
  url.searchParams.set('scene', scene.sceneId);
  if (scene.layers.length) url.searchParams.set('layers', scene.layers.join(','));
  url.searchParams.set('mode', scene.time.mode);
  url.searchParams.set('at', scene.time.cursorTime);
  url.searchParams.set('quality', scene.quality);
  url.searchParams.set('ui', scene.uiDensity);
  return url.toString();
}
