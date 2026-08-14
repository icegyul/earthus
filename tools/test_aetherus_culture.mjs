#!/usr/bin/env node
import assert from 'node:assert/strict';
import { readFile, writeFile, mkdtemp } from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import { fileURLToPath, pathToFileURL } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const directory = await mkdtemp(path.join(os.tmpdir(), 'earthus-aetherus-culture-'));
const source = await readFile(path.join(root, 'prototype/js/space/culture-reference.js'), 'utf8');
const modulePath = path.join(directory, 'culture-reference.mjs');
await writeFile(modulePath, source);
const culture = await import(pathToFileURL(modulePath).href);
const fixture = JSON.parse(await readFile(
  path.join(root, 'tools/fixtures/aetherus-culture-v1.json'), 'utf8'));
const catalog = culture.validateCultureCatalog(fixture);
assert.equal(catalog.fixtureOnly, true);
assert.equal(catalog.items.length, 7);
assert.deepEqual([...new Set(catalog.items.map(item => item.workType))].sort(),
  [...culture.CULTURE_WORK_TYPES].sort());
assert.equal(catalog.items.every(item => item.quotation === null
  && item.relationSummary.authorship === 'EARTHUS_EDITORIAL'), true);
assert.deepEqual([...new Set(catalog.items.map(item => item.relationType))].sort(),
  [...culture.CULTURE_RELATIONS].sort());

const film = catalog.items.find(item => item.workType === 'FILM');
const filmView = culture.buildCulturePublicView(film);
assert.equal(filmView.state, 'READY');
assert.equal(filmView.automaticPublishAllowed, false);
assert.equal(filmView.item.media.delivery, 'OFFICIAL_LINK_OR_EMBED_ONLY');
assert.equal(filmView.item.media.cachedUrl, null);
assert.match(filmView.item.media.officialTrailerUrl, /^https:\/\/example\.test\//);

const drama = culture.buildCulturePublicView(catalog.items.find(item => item.workType === 'DRAMA'));
assert.equal(drama.state, 'METADATA_ONLY');
assert.equal(drama.item.media, null);
const art = culture.buildCulturePublicView(catalog.items.find(item => item.workType === 'ART'));
assert.equal(art.state, 'BLOCKED_RIGHTS');
assert.equal(art.item, null);
assert.equal(art.automaticPublishAllowed, false);

const search = culture.searchCulture(catalog, { query: 'mars', celestialObjectId: 'mars' });
assert.ok(search.count >= 3);
assert.equal(search.results.every(result => result.item?.celestialObjectId === 'mars'), true);
assert.equal(search.results.some(result => result.id === 'culture-art-fixture'), false);
const timeline = culture.buildCultureTimeline(catalog, { celestialObjectId: 'mars' });
assert.equal(timeline.state, 'READY');
assert.deepEqual(timeline.items.map(item => item.item.releaseYear), [1901, 2001, 2021, null]);
assert.equal(timeline.items.every(item => item.item.sources[0].verifiedAt.endsWith('Z')), true);

const unavailable = culture.buildCultureProviderFailure({ lastGoodViews: [filmView],
  failedAt: '2026-08-14T12:00:00Z', cachePolicy: { status: 'DRAFT', maxStaleSeconds: 20000 } });
assert.equal(unavailable.state, 'UNAVAILABLE');
assert.deepEqual(unavailable.items, []);
const stale = culture.buildCultureProviderFailure({ lastGoodViews: [filmView],
  failedAt: '2026-08-14T12:00:00Z',
  cachePolicy: { status: 'APPROVED', maxStaleSeconds: 20000 } });
assert.equal(stale.state, 'STALE');
assert.equal(stale.items.length, 1);

const restrictedFilm = culture.normalizeCultureReference({ ...film,
  rights: { status: 'RESTRICTED' }, updatedAt: '2026-08-14T10:00:00Z' });
const events = culture.cultureMutationEvents(film, restrictedFilm);
assert.deepEqual(events.map(event => event.type),
  ['CACHE_INVALIDATE', 'SEARCH_REINDEX', 'RIGHTS_CHANGED']);
assert.equal(culture.buildCulturePublicView(restrictedFilm).state, 'BLOCKED_RIGHTS');

assert.throws(() => culture.normalizeCultureReference({ ...film,
  quotation: 'Copied words are not accepted in the v1 Culture contract.' }),
error => error.code === 'CULTURE_VERBATIM_QUOTATION_FORBIDDEN');
assert.throws(() => culture.normalizeCultureReference({ ...film,
  media: { ...film.media, cachedUrl: 'https://cdn.example.test/copied-film.mp4' } }),
error => error.code === 'CULTURE_EMBED_ONLY_CACHE_FORBIDDEN');
assert.doesNotMatch(source, /\bfetch\s*\(|XMLHttpRequest|WebSocket|setInterval|requestAnimationFrame/);
assert.doesNotMatch(source, /auto(?:matic)?Publish\s*:\s*true/i);
console.log('PASS: Aetherus Culture Sheets 151-163, 7 work types, 5 relations, rights/search/timeline/fallback gates');
