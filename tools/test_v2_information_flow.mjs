import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from '../prototype/vendor/three-r184.module.min.js';
import { LiveLayers } from '../prototype/v2-three/js/live-layers.js';
import { menuCoverage, menuTime, canClearLayer, matchesMenu, createSelectionGate } from '../prototype/v2-three/js/information-contract.js';

const deferred = () => {
  let resolve, reject;
  const promise = new Promise((res, rej) => { resolve = res; reject = rej; });
  return { promise, resolve, reject };
};

function resource(name) {
  const obj = new THREE.Object3D();
  obj.name = name;
  const disposed = { geometry: 0, material: 0, texture: 0 };
  obj.geometry = { dispose() { disposed.geometry++; } };
  obj.material = { dispose() { disposed.material++; }, map: { dispose() { disposed.texture++; } } };
  return { built: { obj, data: { source: 'test fixture', version: name }, meta: { badge: 'OBSERVED', note: name, cardHtml: name } }, disposed };
}

function harness() {
  const scene = new THREE.Scene();
  let exaggeration = 1;
  const layer = new LiveLayers(scene, () => 0, () => exaggeration, () => '');
  const requests = [];
  layer.build = id => {
    const request = deferred();
    requests.push({ id, ...request });
    return request.promise;
  };
  return { layer, requests, scene, exaggerate(value) { exaggeration = value; layer.onExaggerChanged(); } };
}

async function mount(h, id, name = id) {
  const pending = h.layer.toggle(id);
  const item = resource(name);
  h.requests.at(-1).resolve(item.built);
  assert.equal((await pending).on, true);
  return item;
}

const visibleChildren = layer => layer.group.children.filter(obj => obj.visible);
// onExaggerChanged has a void API; its continuation runs on the resolved build promise.
const flushBuild = async request => { await request.promise; await Promise.resolve(); };

test('menu coverage names known support areas without claiming unknown layers are global', () => {
  assert.equal(menuCoverage('khoaflood'), '한국');
  assert.equal(menuCoverage('cloud-fog'), '동아시아');
  assert.equal(menuCoverage('warnworld', false), 'United States');
  assert.equal(menuCoverage('seoul'), '서울');
  assert.equal(menuCoverage('marine'), '선택 지점');
  assert.equal(menuCoverage('unregistered-layer'), '지원 범위는 자료 상세에서 확인');
});

test('only the three wired data products claim a forecast timeline', () => {
  for (const id of ['cloud-gfs', 'tyoff', 'seoul']) {
    assert.equal(menuTime(id), '예보 시간축 연결', id);
    assert.equal(menuTime(id, false), 'Forecast timeline', id);
  }
  assert.equal(menuTime('cloud-vol', false), 'Dataset time fixed');
  assert.equal(menuTime('tyens', false), 'Full forecast range, independent of timeline');
  for (const id of ['radar', 'tsunami', 'marine']) {
    assert.equal(menuTime(id), '각 자료 시각 · 재생 시간과 별도', id);
  }
  for (const id of ['forest', 'poptower', 'photos', 'eqhistory']) assert.equal(menuTime(id), '자료 기준일 고정', id);
});

test('clear controls exclude base maps, navigation and standalone experiences', () => {
  for (const id of ['terrain', 'satdetail', 'locate', 'globe', 'cloud-off', 'mysky', 'feed', 'eq', 'tc', 'typhoonsim', 'marine', 'solar', 'photos', 'galaxy', 'livemix', 'base-night', 'base-new-map']) {
    assert.equal(canClearLayer(id), false, id);
  }
  for (const id of ['cloud-gfs', 'cloud-vol', 'tyoff', 'seoul', 'tsunami', 'khoaflood', 'wind', 'buoys', 'sats']) assert.equal(canClearLayer(id), true, id);
});

test('menu search matches all terms across names, sources and coverage, independent of case', () => {
  const fields = ['우리 바다 해수면 상승', 'KHOA SSP126', '한국', null, undefined];
  assert.equal(matchesMenu('한국   ssp126', fields), true);
  assert.equal(matchesMenu('KHOA 상승', fields), true);
  assert.equal(matchesMenu('한국 SSP585', fields), false);
  assert.equal(matchesMenu('  ', fields), true);
  assert.equal(matchesMenu('관측', []), false);
});

test('out-of-order results cannot replace the latest menu selection', async () => {
  const gate = createSelectionGate();
  const first = deferred(), second = deferred(), rendered = [];
  const firstCurrent = gate.next();
  const firstRender = first.promise.then(value => { if (firstCurrent()) rendered.push(value); });
  const secondCurrent = gate.next();
  const secondRender = second.promise.then(value => { if (secondCurrent()) rendered.push(value); });
  second.resolve('new selection'); await secondRender;
  first.resolve('old selection'); await firstRender;
  assert.deepEqual(rendered, ['new selection']);
  assert.equal(firstCurrent(), false);
  assert.equal(secondCurrent(), true);
});

test('clearing a selection invalidates already-started UI requests and allows a new selection', async () => {
  const gate = createSelectionGate();
  const current = gate.next();
  const request = deferred();
  const rendered = [];
  const result = request.promise.then(value => { if (current()) rendered.push(value); });
  gate.invalidate();
  request.resolve('cleared result'); await result;
  assert.deepEqual(rendered, []);
  const next = gate.next();
  assert.equal(next(), true);
  assert.equal(current(), false);
});

test('toggle → clearAll → completion disposes the pending layer without reviving it', async () => {
  const h = harness();
  const pending = h.layer.toggle('tsunami');
  const incoming = resource('pending');
  h.layer.clearAll();
  h.requests[0].resolve(incoming.built);
  assert.equal((await pending).on, false);
  assert.deepEqual(h.layer.activeIds(), []);
  assert.deepEqual(visibleChildren(h.layer), []);
  assert.equal(h.layer.layers.tsunami, undefined);
  assert.deepEqual(incoming.disposed, { geometry: 1, material: 1, texture: 1 });
});

test('a new toggle after clear owns its slot when the old request finishes later', async () => {
  const h = harness();
  const oldPending = h.layer.toggle('tsunami');
  h.layer.clearAll();
  const newPending = h.layer.toggle('tsunami');
  const oldData = resource('old'), newData = resource('new');
  h.requests[1].resolve(newData.built);
  await newPending;
  h.requests[0].resolve(oldData.built);
  assert.equal((await oldPending).on, false);
  assert.equal(h.layer.layers.tsunami.obj, newData.built.obj);
  assert.deepEqual(visibleChildren(h.layer), [newData.built.obj]);
  assert.deepEqual(oldData.disposed, { geometry: 1, material: 1, texture: 1 });
  assert.deepEqual(newData.disposed, { geometry: 0, material: 0, texture: 0 });
});

test('a second toggle cancels a still-loading layer through the actual toggle path', async () => {
  const h = harness();
  const pending = h.layer.toggle('buoys');
  assert.equal((await h.layer.toggle('buoys')).on, false);
  const incoming = resource('cancelled by toggle');
  h.requests[0].resolve(incoming.built);
  assert.equal((await pending).on, false);
  assert.equal(h.layer.layers.buoys, undefined);
  assert.equal(visibleChildren(h.layer).length, 0);
  assert.equal(incoming.disposed.geometry, 1);
});

test('refresh → clearAll → completion leaves cached geometry hidden and disposes the unused result', async () => {
  const h = harness();
  const original = await mount(h, 'buoys');
  const refreshing = h.layer.refresh('buoys');
  const incoming = resource('refreshed');
  h.layer.clearAll();
  h.requests.at(-1).resolve(incoming.built);
  assert.equal(await refreshing, false);
  assert.equal(h.layer.layers.buoys.obj, original.built.obj);
  assert.equal(h.layer.layers.buoys.on, false);
  assert.equal(h.layer.layers.buoys.refreshing, false);
  assert.equal(original.built.obj.visible, false);
  assert.equal(visibleChildren(h.layer).length, 0);
  assert.deepEqual(incoming.disposed, { geometry: 1, material: 1, texture: 1 });
});

test('exaggeration rebuild → clearAll → completion cannot restore layer visibility', async () => {
  const h = harness();
  await mount(h, 'khoaflood');
  h.layer._floodSel = { code: 'fixture' };
  const rebuild = deferred();
  h.layer.buildFromData = () => rebuild.promise;
  h.exaggerate(2);
  h.layer.clearAll();
  const incoming = resource('rebuilt');
  rebuild.resolve(incoming.built);
  await flushBuild(rebuild);
  assert.equal(h.layer.state('khoaflood').on, false);
  assert.equal(h.layer.layers.khoaflood.obj.visible, false);
  assert.equal(visibleChildren(h.layer).length, 0);
  assert.equal(h.layer._floodSel, null);
});

test('overlapping exaggeration rebuilds retain only the newest geometry', async () => {
  const h = harness();
  await mount(h, 'buoys');
  const builds = [];
  h.layer.buildFromData = () => { const request = deferred(); builds.push(request); return request.promise; };
  h.exaggerate(2);
  h.exaggerate(3);
  const oldData = resource('old rebuild'), newData = resource('latest rebuild');
  builds[1].resolve(newData.built); await flushBuild(builds[1]);
  builds[0].resolve(oldData.built); await flushBuild(builds[0]);
  assert.equal(h.layer.layers.buoys.obj, newData.built.obj);
  assert.deepEqual(visibleChildren(h.layer), [newData.built.obj]);
  assert.deepEqual(oldData.disposed, { geometry: 1, material: 1, texture: 1 });
});
