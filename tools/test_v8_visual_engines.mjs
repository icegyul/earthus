import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
const load = async name => {
  const source = await readFile(new URL(`../prototype/js/v8/${name}.js`, import.meta.url), 'utf8');
  return import(`data:text/javascript;base64,${Buffer.from(source).toString('base64')}`);
};

const { VisualLayerRegistry } = await load('visual-layer-registry');
const layers = new VisualLayerRegistry();
layers.register({ schemaVersion: '8.0', layerId: 'human.tourism', domain: 'HUMAN_CITY', renderer: 'RELIEF', truthClasses: ['OBSERVED'], timeBinding: 'OBSERVED_AT', aggregationLevel: 'BLOCK', provenanceMode: 'DOCK_AND_LAB', qualityProfiles: ['BALANCED','LITE','STATIC'] });
layers.register({ schemaVersion: '8.0', layerId: 'ocean.current', domain: 'OCEAN', renderer: 'FLOW', truthClasses: ['OBSERVED','MODEL_OUTPUT'], timeBinding: 'VALID_AT', verticalLevels: [{ value: 0, unit: 'm', native: true }, { value: -500, unit: 'm', native: false }], aggregationLevel: 'GRID', provenanceMode: 'DOCK_AND_LAB', qualityProfiles: ['FULL','BALANCED','LITE','STATIC'] });
assert.equal(layers.get('human.tourism').renderer, 'RELIEF');
assert.equal(layers.get('ocean.current').verticalLevels[1].native, false);
assert.throws(() => layers.register({ ...layers.get('human.tourism') }), /already registered/);

const { sampleVectorGrid, flowBudget } = await load('shared-flow');
const frame = { width: 2, height: 2, u: [0, 1, 2, 3], v: [4, 5, 6, 7], noData: null };
assert.deepEqual(sampleVectorGrid(frame, 0.5, 0.5), { u: 1.5, v: 5.5 });
assert.equal(sampleVectorGrid({ ...frame, u: [0, null, 2, 3] }, 0.5, 0.5), null);
assert.deepEqual(flowBudget('LITE'), { maxParticles: 3000, maxFps: 20 });

const { buildTourismRelief } = await load('human-relief');
const relief = buildTourismRelief({ aggregationLevel: 'BLOCK', odAvailable: false, cells: [
  { cellId: 'a', geometry: { type: 'Polygon', coordinates: [] }, value: 10, unit: 'index' },
  { cellId: 'b', geometry: { type: 'Polygon', coordinates: [] }, value: 1000, unit: 'index' },
] });
assert.ok(relief.cells.every(cell => cell.renderHeight >= 8 && cell.renderHeight <= 180));
assert.ok(relief.cells.every(cell => cell.primitive === 'POLYGON_EXTRUSION'));
assert.equal(relief.flows.length, 0);
const pointRelief = buildTourismRelief({ aggregationLevel: 'REGION', odAvailable: false, cells: [{ cellId: 'p', geometry: { type: 'Point', coordinates: [127,37.5] }, value: 100, unit: 'index' }] });
assert.equal(pointRelief.cells[0].primitive, 'AREA_MARKER');
assert.notEqual(pointRelief.cells[0].primitive, 'CYLINDER');
assert.equal(pointRelief.cells[0].footprintMeaning, 'FIXED_DISPLAY_CELL_NOT_OFFICIAL_AREA');
const zeroRelief = buildTourismRelief({ aggregationLevel: 'REGION', odAvailable: false, cells: [
  { cellId: 'zero', geometry: { type: 'Point', coordinates: [127, 37.5] }, value: 0, unit: 'people' },
] });
assert.equal(zeroRelief.cells[0].renderHeight, 8, 'all-zero data must render a finite baseline block');

console.log('EARTHUS v8 visual engines: PASS');
