#!/usr/bin/env node

import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

async function importBrowserModule(relativePath) {
  const source = await readFile(path.join(ROOT, relativePath), 'utf8');
  const dataUrl = `data:text/javascript;base64,${Buffer.from(source).toString('base64')}`;
  return import(dataUrl);
}

async function json(relativePath) {
  return JSON.parse(await readFile(path.join(ROOT, relativePath), 'utf8'));
}

function clone(value) {
  return JSON.parse(JSON.stringify(value));
}

const contracts = await importBrowserModule('prototype/js/space/contracts.js');
const routes = await importBrowserModule('prototype/js/space/route-state.js');
const cosmicSource = await readFile(path.join(ROOT, 'prototype/js/space/cosmic3d.js'), 'utf8');
const uiSource = await readFile(path.join(ROOT, 'prototype/js/ui.js'), 'utf8');
const viewerSource = await readFile(path.join(ROOT, 'prototype/js/viewer.js'), 'utf8');
const skyPanoramaSource = await readFile(path.join(ROOT, 'prototype/js/sky-panorama.js'), 'utf8');
const indexSource = await readFile(path.join(ROOT, 'prototype/index.html'), 'utf8');
const appCssSource = await readFile(path.join(ROOT, 'prototype/css/app.css'), 'utf8');
const mainSource = await readFile(path.join(ROOT, 'prototype/js/main.js'), 'utf8');

assert.match(cosmicSource, /this\.makeEarthMoon\(new Date\(\)\)/);
assert.match(cosmicSource, /this\.planetMeshes\.moon = moon/);
assert.match(cosmicSource, /달 위치·지구와의 거리 압축 도식/);
assert.doesNotMatch(uiSource, /const allowed = \(\) => location\.hash === '#dev'/);
assert.match(viewerSource, /scene\.moon\.show = false/);
assert.doesNotMatch(indexSource, /ambientMoon/);
assert.doesNotMatch(appCssSource, /ambientMoon|ambient-moon/);
assert.doesNotMatch(mainSource, /ambientMoon|ambient-moon/);
assert.match(viewerSource, /installMilkyWayPanorama\(scene\)/);
assert.match(skyPanoramaSource, /scene\.skyBox\.show = false/);
assert.match(skyPanoramaSource, /new Cesium\.EquirectangularPanorama/);
assert.match(skyPanoramaSource, /gl\.MAX_TEXTURE_SIZE/);
assert.match(skyPanoramaSource, /mobile-2k/);
assert.match(indexSource, /ESO\/S\. Brunier · CC BY 4\.0/);
assert.match(mainSource, /layers\/imagery\.js'/);
assert.doesNotMatch(mainSource, /layers\/imagery\.js\?v=/);

const catalogFiles = {
  'space-photos': 'prototype/data/space-photos.json',
  'celestial-bodies': 'prototype/data/celestial-bodies.json',
  'cosmic-spacecraft': 'prototype/data/cosmic-spacecraft.json',
  'milky-way-structure': 'prototype/data/milky-way-structure.json',
  'solar-motion': 'prototype/data/solar-motion.json',
  'mission-media-replay': 'prototype/data/missions/jwst-mission-media-replay-v1.json',
};

const documents = {};
for (const [catalog, file] of Object.entries(catalogFiles)) {
  documents[catalog] = await json(file);
  assert.equal(contracts.assertAetherusCatalog(catalog, documents[catalog]), documents[catalog]);
}

const missingLicense = clone(documents['space-photos']);
delete missingLicense.items[0].license;
assert.throws(
  () => contracts.assertAetherusCatalog('space-photos', missingLicense),
  error => error.code === 'AETHERUS_CATALOG_CONTRACT' && error.path === 'items[0].license',
);

const wrongPhotoOwner = clone(documents['space-photos']);
wrongPhotoOwner.contract.owner = 'earthus';
assert.throws(
  () => contracts.assertAetherusCatalog('space-photos', wrongPhotoOwner),
  error => error.code === 'AETHERUS_CATALOG_CONTRACT' && error.path === 'contract.owner',
);

const missingTextureRights = clone(documents['celestial-bodies']);
delete missingTextureRights.assetRights.sun;
assert.throws(
  () => contracts.assertAetherusCatalog('celestial-bodies', missingTextureRights),
  error => error.code === 'AETHERUS_CATALOG_CONTRACT' && error.path === 'assetRights',
);

const wrongSchema = clone(documents['cosmic-spacecraft']);
wrongSchema.schema = 'earthus.cosmic-spacecraft.v2';
assert.throws(
  () => contracts.assertAetherusCatalog('cosmic-spacecraft', wrongSchema),
  error => error.code === 'AETHERUS_CATALOG_CONTRACT' && error.path === 'schema',
);

const wrongSchemaVersion = clone(documents['milky-way-structure']);
wrongSchemaVersion.schemaVersion = 2;
assert.throws(
  () => contracts.assertAetherusCatalog('milky-way-structure', wrongSchemaVersion),
  error => error.code === 'AETHERUS_CATALOG_CONTRACT' && error.path === 'schemaVersion',
);

const legacySolar = routes.decodeAetherusRoute('?solar=1');
assert.equal(legacySolar.version, 0);
assert.equal(legacySolar.stage, 'solar');

const targetRoute = routes.decodeAetherusRoute('?aetherus=1&solar=1&target=mars');
assert.deepEqual(
  { stage: targetRoute.stage, target: targetRoute.target, photo: targetRoute.photo, craft: targetRoute.craft },
  { stage: 'solar', target: 'mars', photo: null, craft: null },
);

const telescopeRoute = routes.decodeAetherusRoute('?aetherus=1&solar=1&telescope=jwst');
assert.deepEqual(
  { stage: telescopeRoute.stage, telescope: telescopeRoute.telescope, photo: telescopeRoute.photo },
  { stage: 'solar', telescope: 'jwst', photo: null },
);

const telescopeConflict = routes.decodeAetherusRoute('?aetherus=1&solar=1&target=mars&telescope=hst');
assert.equal(telescopeConflict.target, null);
assert.equal(telescopeConflict.telescope, null);
assert.ok(telescopeConflict.issues.includes('CONFLICTING_DETAIL'));

const invalidTelescope = routes.decodeAetherusRoute('?aetherus=1&solar=1&telescope=roman');
assert.equal(invalidTelescope.telescope, null);
assert.ok(invalidTelescope.issues.includes('INVALID_TELESCOPE'));

const conflict = routes.decodeAetherusRoute('?aetherus=1&space=milkyway&target=mars&craft=voyager-1');
assert.equal(conflict.stage, 'milkyway');
assert.equal(conflict.target, null);
assert.ok(conflict.issues.includes('CONFLICTING_DETAIL'));

const unsupported = routes.decodeAetherusRoute('?aetherus=4&solar=1');
assert.equal(unsupported.stage, null);
assert.deepEqual([...unsupported.issues], ['UNSUPPORTED_VERSION']);

const encoded = routes.encodeAetherusRoute(
  { stage: 'milkyway', telescope: 'jwst', photo: 'southern-ring-jwst' },
  'https://earthus.net/?lang=ko&space=galaxies&craft=voyager-1#dev',
);
assert.equal(encoded.searchParams.get('lang'), 'ko');
assert.equal(encoded.searchParams.get('aetherus'), '3');
assert.equal(encoded.searchParams.get('solar'), '1');
assert.equal(encoded.searchParams.get('space'), null);
assert.equal(encoded.searchParams.get('photo'), 'southern-ring-jwst');
assert.equal(encoded.searchParams.get('telescope'), 'jwst');
assert.equal(encoded.searchParams.get('craft'), null);
assert.equal(encoded.hash, '#dev');

const roundTrip = routes.decodeAetherusRoute(encoded);
assert.deepEqual(
  { stage: roundTrip.stage, target: roundTrip.target, photo: roundTrip.photo,
    telescope: roundTrip.telescope, craft: roundTrip.craft },
  { stage: 'solar', target: null, photo: 'southern-ring-jwst', telescope: 'jwst', craft: null },
);

const cleared = routes.encodeAetherusRoute(null, 'https://earthus.net/?tc=Khanun&aetherus=1&solar=1&target=mars');
assert.equal(cleared.searchParams.get('tc'), 'Khanun');
assert.equal(cleared.searchParams.get('aetherus'), null);
assert.equal(cleared.searchParams.get('target'), null);
assert.equal(cleared.searchParams.get('telescope'), null);

assert.throws(
  () => routes.encodeAetherusRoute({ stage: 'solar', target: 'mars', craft: 'voyager-1' }),
  error => error.code === 'CONFLICTING_DETAIL',
);

console.log('PASS: 6 Aetherus catalogue contracts, 5 failure fixtures, and 13 route-state cases (v3 encoder, v1 reader)');
