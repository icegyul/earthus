#!/usr/bin/env node
import assert from 'node:assert/strict';
import { readFile, writeFile, mkdtemp } from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import { fileURLToPath, pathToFileURL } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const directory = await mkdtemp(path.join(os.tmpdir(), 'earthus-discovery-contract-'));
const source = await readFile(path.join(root, 'prototype/js/space/discovery-contract.js'), 'utf8');
const modulePath = path.join(directory, 'discovery-contract.mjs');
await writeFile(modulePath, source);
const discovery = await import(pathToFileURL(modulePath).href);
const policy = JSON.parse(await readFile(
  path.join(root, 'prototype/data/aetherus/discovery-policy.v1.json'), 'utf8'));
assert.equal(discovery.validateDiscoveryPolicy(policy).productionEnabled, false);
const evidence = object => ({ authority: 'OFFICIAL', sourceId: 'fixture-catalog',
  sourceUrl: `https://example.test/catalog/${object}`, assertedAt: '2026-08-14T00:00:00Z' });
const catalog = discovery.createDiscoveryCatalog([
  { id: 'galaxy-fixture-1', type: 'GALAXY', name: 'Fixture Galaxy', aliases: ['M31 Fixture'],
    externalIds: { MESSIER: 'M31' }, evidence: evidence('galaxy-1'), relations: [
      { type: 'OBSERVED_BY', targetId: 'telescope-observation-fixture-1',
        reason: 'Fixture relation from catalog', evidence: evidence('relation-1') }] },
  { id: 'telescope-observation-fixture-1', type: 'TELESCOPE_OBSERVATION',
    name: 'Fixture Telescope Observation', externalIds: { OBSERVATION: 'OBS-001' },
    evidence: evidence('observation-1') },
  { id: 'solar-body-fixture-1', type: 'SOLAR_SYSTEM_BODY', name: 'Fixture Planet',
    aliases: ['Fixture World'], evidence: evidence('planet-1') },
  { id: 'cluster-fixture-1', type: 'STAR_CLUSTER', name: 'Fixture Cluster',
    evidence: evidence('cluster-1') },
  { id: 'exoplanet-fixture-1', type: 'EXOPLANET', name: 'Fixture Exoplanet',
    evidence: evidence('exoplanet-1') },
  { id: 'constellation-fixture-1', type: 'CONSTELLATION', name: 'Fixture Constellation',
    evidence: evidence('constellation-1') },
  { id: 'earth-feature-fixture-1', type: 'EARTH_FEATURE', name: 'Fixture Earth Feature',
    evidence: evidence('earth-1') },
]);
assert.equal(catalog.search('m31')[0].id, 'galaxy-fixture-1');
assert.equal(catalog.search('fixture', { domain: 'EARTHUS' }).length, 1);
const recommendations = catalog.recommendations('galaxy-fixture-1');
assert.equal(recommendations.length, 1);
assert.equal(recommendations[0].generated, false);
assert.equal(catalog.recommendations('exoplanet-fixture-1').length, 0);
const share = discovery.buildDiscoveryShareLink({ origin: 'https://example.test/old?token=remove',
  domain: 'AETHERUS', objectId: 'galaxy-fixture-1', view: 'OBSERVATIONS' });
assert.match(share.url, /\/explore\?domain=aetherus&object=galaxy-fixture-1&view=observations$/);
assert.doesNotMatch(share.url, /token|lat|lon|session/i);
assert.equal(discovery.telescopeProviderDecision('fixture-telescope-provider', { policy }).allowed,
  false);
assert.throws(() => discovery.createDiscoveryCatalog([{ id: 'broken', type: 'GALAXY',
  name: 'Broken', evidence: evidence('broken'), relations: [{ type: 'RELATED_TO',
    targetId: 'missing', reason: 'broken fixture', evidence: evidence('broken-relation') }] }]),
error => error.code === 'DISCOVERY_RELATION_TARGET_MISSING');
assert.doesNotMatch(source, /Math\.random|\bfetch\s*\(|setInterval|requestAnimationFrame/);
console.log('PASS: Discovery Sheets 43,47,50,56,61 evidence-bound search, relations, share and provider gate');
