import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const source = await readFile(new URL('../prototype/js/v8/scene-state.js', import.meta.url), 'utf8');
const scene = await import(`data:text/javascript;base64,${Buffer.from(source).toString('base64')}`);

const legacy = scene.fromLegacyUrl('https://earthus.net/?earth=1&earthView=data&earthLayer=tourism&at=2026-08-21T00%3A00%3A00Z&model=official&point=37.56,126.97&activity=walk&token=secret');
assert.equal(legacy.sceneId, 'legacy-earth');
assert.deepEqual(legacy.layers, ['human.tourism']);
assert.equal(legacy.time.cursorTime, '2026-08-21T00:00:00Z');
assert.equal(legacy.legacyAliases.earthLayer, 'tourism');
assert.equal('token' in legacy.legacyAliases, false, 'tokens never enter scene state');

const state = scene.makeSceneState({
  sceneId: 'scene_ocean_demo',
  camera: { longitude: 140, latitude: 30, height: 9000000, heading: 0, pitch: -1.2, roll: 0 },
  layers: ['ocean.current', 'ocean.current'],
  time: { schemaVersion: '8.0', mode: 'NOW', cursorTime: '2026-08-21T00:00:00Z', timezone: 'Asia/Seoul', playback: { state: 'STOPPED', rate: 1, loop: false }, layerAvailability: [] },
  quality: 'BALANCED', uiDensity: 'QUIET', selectedFeatureId: 'current-demo',
});
assert.deepEqual(state.layers, ['ocean.current']);
const shared = scene.toShareUrl(state, 'https://earthus.net/');
assert.match(shared, /scene=scene_ocean_demo/);
assert.match(shared, /layers=ocean.current/);
assert.doesNotMatch(shared, /selectedFeatureId|token|subjectId|reservation/);

assert.throws(() => scene.makeSceneState({ ...state, camera: { ...state.camera, latitude: 91 } }), /latitude/);
assert.throws(() => scene.makeSceneState({ ...state, time: { ...state.time, playback: { ...state.time.playback, loop: true } } }), /loop/);

console.log('EARTHUS v8 scene state: PASS');
