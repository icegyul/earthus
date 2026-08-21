// EARTHUS v8 실행 연결기.
//
// 새 엔진이 기존 레이어를 복제하지 않게, 현재 store와 실제 자료 이벤트만 v8 정본에 연결한다.
// 해류 `current`는 지금 방향 성분이 없는 표층 속도 격자이므로 FLOW가 아닌 FIELD로 등록한다.

import { UnifiedTime } from './unified-time.js';
import { VisualLayerRegistry } from './visual-layer-registry.js';

const DESCRIPTORS = Object.freeze([
  Object.freeze({
    schemaVersion: '8.0', layerId: 'human.tourism', domain: 'HUMAN_CITY', renderer: 'RELIEF',
    truthClasses: ['OBSERVED', 'OFFICIAL_FORECAST'], timeBinding: 'OBSERVED_OR_VALID_AT',
    aggregationLevel: 'OFFICIAL_PLACE', provenanceMode: 'DOCK_AND_LAB',
    qualityProfiles: ['BALANCED', 'LITE', 'STATIC'],
  }),
  Object.freeze({
    schemaVersion: '8.0', layerId: 'weather.wind', domain: 'WEATHER', renderer: 'FLOW',
    truthClasses: ['MODEL_OUTPUT'], timeBinding: 'VALID_AT', aggregationLevel: 'GRID',
    provenanceMode: 'DOCK_AND_LAB', qualityProfiles: ['FULL', 'BALANCED', 'LITE', 'STATIC'],
  }),
  Object.freeze({
    schemaVersion: '8.0', layerId: 'weather.temperature', domain: 'WEATHER', renderer: 'FIELD',
    truthClasses: ['OBSERVED', 'MODEL_OUTPUT'], timeBinding: 'OBSERVED_OR_VALID_AT',
    aggregationLevel: 'GRID', provenanceMode: 'DOCK_AND_LAB',
    qualityProfiles: ['BALANCED', 'LITE', 'STATIC'],
  }),
  Object.freeze({
    schemaVersion: '8.0', layerId: 'ocean.surface-speed', domain: 'OCEAN', renderer: 'FIELD',
    truthClasses: ['MODEL_OUTPUT'], timeBinding: 'VALID_AT', aggregationLevel: 'GRID',
    verticalLevels: [{ value: 0, unit: 'm', native: true }],
    provenanceMode: 'DOCK_AND_LAB', qualityProfiles: ['BALANCED', 'LITE', 'STATIC'],
  }),
  Object.freeze({
    schemaVersion: '8.0', layerId: 'hazard.cyclone', domain: 'HAZARD', renderer: 'EVENT',
    truthClasses: ['OBSERVED', 'OFFICIAL_FORECAST'], timeBinding: 'OBSERVED_OR_VALID_AT',
    aggregationLevel: 'EVENT', provenanceMode: 'DOCK_AND_LAB',
    qualityProfiles: ['FULL', 'BALANCED', 'LITE', 'STATIC'],
  }),
  Object.freeze({
    schemaVersion: '8.0', layerId: 'orbit.satellites', domain: 'ORBIT', renderer: 'ORBIT',
    truthClasses: ['MODEL_OUTPUT'], timeBinding: 'VALID_AT', aggregationLevel: 'OBJECT',
    provenanceMode: 'DOCK_AND_LAB', qualityProfiles: ['FULL', 'BALANCED', 'LITE', 'STATIC'],
  }),
]);

const LEGACY_LAYER = Object.freeze({
  tourism: 'human.tourism', wind: 'weather.wind', windfc: 'weather.wind',
  temp: 'weather.temperature', tmax: 'weather.temperature', tmin: 'weather.temperature',
  current: 'ocean.surface-speed', cyclone: 'hazard.cyclone', orbits: 'orbit.satellites',
});

const OCEAN_STATE = Object.freeze({
  surfaceScalar: 'AVAILABLE', vectorField: 'UNAVAILABLE',
  follow: 'DISABLED_NO_VECTOR_FIELD', cinema: 'DISABLED_NO_SCENE_MANIFEST',
});

function validTimes(snapshot) {
  return [...new Set((snapshot?.places ?? []).flatMap(place => [
    place?.provenance?.observedAt,
    ...(place?.forecast ?? []).map(row => row?.at),
  ]).filter(value => typeof value === 'string' && Number.isFinite(Date.parse(value))))]
    .sort((left, right) => Date.parse(left) - Date.parse(right));
}

function customEvent(type, detail) {
  if (typeof CustomEvent === 'function') return new CustomEvent(type, { detail });
  const event = new Event(type);
  Object.defineProperty(event, 'detail', { value: detail });
  return event;
}

export function createV8Runtime({ eventTarget = document, now, onChange = () => {} } = {}) {
  const layers = new VisualLayerRegistry();
  DESCRIPTORS.forEach(descriptor => layers.register(descriptor));
  const activeLayers = new Set();
  const cleanups = [];
  let started = false;
  let storeRef = null;
  let api = null;

  const emit = type => {
    if (!api) return;
    const detail = api.snapshot();
    onChange({ type, detail });
    eventTarget?.dispatchEvent?.(customEvent('earthus:v8-runtime', { type, ...detail }));
  };
  const time = new UnifiedTime({ now, timezone: 'UTC', onChange: event => emit(event.type) });

  const syncLayer = (legacyId, on) => {
    const canonical = LEGACY_LAYER[legacyId];
    if (!canonical) return;
    if (on) activeLayers.add(canonical);
    else activeLayers.delete(canonical);
    emit('visual.layers.changed');
  };
  const onTourismSnapshot = event => {
    const times = validTimes(event.detail);
    if (!times.length) return;
    time.registerAvailability('human.tourism', {
      from: times[0], to: times.at(-1), stepSeconds: 3600, state: 'AVAILABLE',
    });
    emit('time.availability.changed');
  };
  const onTourismTime = event => {
    const at = event.detail?.at ?? null;
    if (!at) time.setMode('NOW');
    else {
      time.setMode('FORECAST');
      time.setCursor(at);
    }
  };

  api = Object.freeze({
    init(store) {
      if (started) return api;
      if (!store?.on || !store?.layers) throw new TypeError('EARTHUS store is required');
      started = true;
      storeRef = store;
      for (const [legacyId, on] of Object.entries(store.layers)) syncLayer(legacyId, on === true);
      cleanups.push(store.on('layer', syncLayer));
      eventTarget.addEventListener('earthus:tourism-snapshot', onTourismSnapshot);
      eventTarget.addEventListener('earthus:tourism-time', onTourismTime);
      cleanups.push(() => eventTarget.removeEventListener('earthus:tourism-snapshot', onTourismSnapshot));
      cleanups.push(() => eventTarget.removeEventListener('earthus:tourism-time', onTourismTime));
      emit('runtime.ready');
      return api;
    },
    snapshot() {
      return structuredClone({
        schemaVersion: '8.0', scene: storeRef?.scene ?? 'earth',
        time: time.snapshot(),
        layers: layers.list().sort((left, right) => left.layerId.localeCompare(right.layerId)),
        activeLayers: [...activeLayers].sort(), ocean: OCEAN_STATE,
      });
    },
    destroy() {
      while (cleanups.length) cleanups.pop()?.();
      started = false;
      storeRef = null;
      activeLayers.clear();
    },
  });
  return api;
}
