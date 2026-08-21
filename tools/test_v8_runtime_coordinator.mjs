import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const moduleUrl = async name => {
  const source = await readFile(new URL(`../prototype/js/v8/${name}.js`, import.meta.url), 'utf8');
  return `data:text/javascript;base64,${Buffer.from(source).toString('base64')}`;
};

const unifiedTimeUrl = await moduleUrl('unified-time');
const visualRegistryUrl = await moduleUrl('visual-layer-registry');
const runtimeSource = (await readFile(
  new URL('../prototype/js/v8/runtime-coordinator.js', import.meta.url), 'utf8',
))
  .replace("'./unified-time.js'", `'${unifiedTimeUrl}'`)
  .replace("'./visual-layer-registry.js'", `'${visualRegistryUrl}'`);
const { createV8Runtime } = await import(
  `data:text/javascript;base64,${Buffer.from(runtimeSource).toString('base64')}`
);

const eventTarget = new EventTarget();
const listeners = new Map();
const store = {
  layers: { tourism: false, current: false, cyclone: false },
  scene: 'earth',
  on(type, listener) {
    const group = listeners.get(type) ?? [];
    group.push(listener);
    listeners.set(type, group);
    return () => listeners.set(type, group.filter(item => item !== listener));
  },
  emit(type, ...args) {
    for (const listener of listeners.get(type) ?? []) listener(...args);
  },
};

const dispatch = (type, detail) => {
  const event = new Event(type);
  Object.defineProperty(event, 'detail', { value: detail });
  eventTarget.dispatchEvent(event);
};

const runtime = createV8Runtime({
  eventTarget,
  now: () => '2026-08-21T03:00:00.000Z',
}).init(store);

const descriptors = runtime.snapshot().layers;
const layer = id => descriptors.find(item => item.layerId === id);
assert.equal(layer('human.tourism').renderer, 'RELIEF');
assert.equal(layer('weather.wind').renderer, 'FLOW');
assert.equal(layer('ocean.surface-speed').renderer, 'FIELD',
  'a scalar current-speed grid must not be advertised as a vector Flow layer');
assert.equal(layer('hazard.cyclone').renderer, 'EVENT');
assert.equal(layer('orbit.satellites').renderer, 'ORBIT');
assert.equal(layer('ocean.current'), undefined,
  'ocean.current remains unavailable until a licensed vector field is connected');

dispatch('earthus:tourism-snapshot', {
  places: [{
    provenance: { observedAt: '2026-08-21T02:50:00.000Z' },
    forecast: [
      { at: '2026-08-21T04:00:00.000Z' },
      { at: '2026-08-21T05:00:00.000Z' },
    ],
  }],
});
assert.equal(runtime.snapshot().time.layerAvailability[0].layerId, 'human.tourism');
assert.equal(runtime.snapshot().time.layerAvailability[0].from, '2026-08-21T02:50:00.000Z');
assert.equal(runtime.snapshot().time.layerAvailability[0].to, '2026-08-21T05:00:00.000Z');

dispatch('earthus:tourism-time', { at: '2026-08-21T04:00:00.000Z' });
assert.equal(runtime.snapshot().time.mode, 'FORECAST');
assert.equal(runtime.snapshot().time.cursorTime, '2026-08-21T04:00:00.000Z');

store.layers.tourism = true;
store.emit('layer', 'tourism', true);
assert.deepEqual(runtime.snapshot().activeLayers, ['human.tourism']);

store.layers.current = true;
store.emit('layer', 'current', true);
assert.deepEqual(runtime.snapshot().activeLayers.sort(), ['human.tourism', 'ocean.surface-speed']);

dispatch('earthus:tourism-time', { at: null });
assert.equal(runtime.snapshot().time.mode, 'NOW');
assert.equal(runtime.snapshot().time.cursorTime, '2026-08-21T03:00:00.000Z');
assert.deepEqual(runtime.snapshot().ocean, {
  surfaceScalar: 'AVAILABLE', vectorField: 'UNAVAILABLE',
  follow: 'DISABLED_NO_VECTOR_FIELD', cinema: 'DISABLED_NO_SCENE_MANIFEST',
});

runtime.destroy();
console.log('EARTHUS v8 runtime coordinator: PASS');
