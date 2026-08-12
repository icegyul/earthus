#!/usr/bin/env node

import assert from 'node:assert/strict';
import { mkdtemp, readFile, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

async function importBrowserModule(relativePath) {
  const source = await readFile(path.join(ROOT, relativePath), 'utf8');
  return import(`data:text/javascript;base64,${Buffer.from(source).toString('base64')}`);
}

async function importPlannerModules() {
  const directory = await mkdtemp(path.join(os.tmpdir(), 'aetherus-planner-'));
  const kepler = await readFile(path.join(ROOT, 'prototype/js/space/kepler.js'), 'utf8');
  const astronomy = (await readFile(path.join(ROOT, 'prototype/js/space/astronomy.js'), 'utf8'))
    .replace("'./kepler.js'", "'./kepler.mjs'");
  const planner = (await readFile(path.join(ROOT, 'prototype/js/space/observation-planner.js'), 'utf8'))
    .replace(/'\.\/astronomy\.js\?v=[^']+'/, "'./astronomy.mjs'");
  await writeFile(path.join(directory, 'kepler.mjs'), kepler);
  await writeFile(path.join(directory, 'astronomy.mjs'), astronomy);
  await writeFile(path.join(directory, 'observation-planner.mjs'), planner);
  return {
    astronomy: await import(pathToFileURL(path.join(directory, 'astronomy.mjs')).href),
    planner: await import(pathToFileURL(path.join(directory, 'observation-planner.mjs')).href),
  };
}

const { astronomy, planner } = await importPlannerModules();
const routes = await importBrowserModule('prototype/js/space/route-state.js');
const observer = {
  lat: 37.4563,
  lon: 126.7052,
  source: 'device',
  accuracyM: 11,
  name: { ko: '테스트 위치', en: 'Test location' },
};
const startAt = '2026-08-12T00:00:00.000Z';

const sun = astronomy.calculateSunObservation({ observer, at: startAt });
assert.equal(sun.target, 'sun');
assert.equal(sun.provenance.kind, 'calculated');
assert.equal(sun.provenance.sampleCount, null);
assert.ok(Number.isFinite(sun.coordinates.horizontal.altitudeDeg));
assert.match(sun.provenance.definitionUrl, /usno\.navy\.mil/);

const first = planner.createMarsGeometryPlan({ observer, startAt });
const second = planner.createMarsGeometryPlan({ observer, startAt });
assert.deepEqual(first, second, 'same input must produce byte-equivalent plan data');
assert.equal(first.revision, second.revision);
assert.equal(first.engineRevision, 'geometry-mars-24h-explorer-v1');
assert.equal(first.result, 'GEOMETRY_CANDIDATE');
assert.equal(first.lifecycle.state, 'READY');
assert.equal(first.lifecycle.activationAllowed, false);
assert.equal(first.evidence.calculationSampleCount, 97);
assert.equal(first.evidence.observationSampleCount, null);
assert.ok(first.windows.length >= 1);
assert.ok(first.constraints.filter(item => item.status === 'UNAVAILABLE').length >= 5);
assert.ok(first.limitations.includes('not-an-observability-safety-or-success-probability-claim'));

const durationsMs = [];
for (let iteration = 0; iteration < 30; iteration += 1) {
  const started = performance.now();
  planner.createMarsGeometryPlan({ observer, startAt });
  durationsMs.push(performance.now() - started);
}
durationsMs.sort((left, right) => left - right);
const desktopNodeP95Ms = durationsMs[Math.ceil(durationsMs.length * 0.95) - 1];
assert.ok(desktopNodeP95Ms < 2_000, 'desktop Node sanity gate only; not a low-end-device SLA');

const shared = planner.createMarsGeometryPlan({
  observer: { lat: observer.lat, lon: observer.lon, source: 'shared' },
  startAt,
});
assert.equal(shared.revision, first.revision, 'device accuracy and label must not enter shared plan identity');
assert.ok(!JSON.stringify(first).includes('accuracyM'));

const stricter = planner.createMarsGeometryPlan({
  observer,
  startAt,
  criteria: { marsAltitudeMinDeg: 89 },
});
assert.equal(stricter.result, 'NO_FEASIBLE');
assert.equal(stricter.reason, 'NO_GEOMETRY_WINDOW_IN_AVAILABILITY');
assert.equal(stricter.windows.length, 0);
assert.ok(stricter.evidence.candidateCalculationSampleCount <= first.evidence.candidateCalculationSampleCount,
  'stricter altitude threshold must not add candidate samples');

let naturalNoFeasible = null;
for (let year = 2026; year <= 2030 && !naturalNoFeasible; year += 1) {
  for (let month = 0; month < 12; month += 1) {
    const candidateAt = new Date(Date.UTC(year, month, 1)).toISOString();
    const candidatePlan = planner.createMarsGeometryPlan({ observer, startAt: candidateAt });
    if (candidatePlan.result === 'NO_FEASIBLE') {
      naturalNoFeasible = { startAt: candidateAt, revision: candidatePlan.revision };
      break;
    }
  }
}
assert.ok(naturalNoFeasible, 'default constraints need a fixed natural NO_FEASIBLE journey');

assert.equal(planner.assessObservationPlan(first, { observer, startAt }).status, 'CURRENT');
const stale = planner.assessObservationPlan(first, {
  observer,
  startAt: '2026-08-12T00:15:00.000Z',
});
assert.equal(stale.status, 'STALE');
assert.equal(stale.reason, 'INPUT_CHANGED');

const manifest = planner.createOfflinePlanManifest(first);
const manifestAgain = planner.createOfflinePlanManifest(second);
assert.deepEqual(manifest, manifestAgain);
assert.equal(manifest.mode, 'PLAN_DATA_ONLY');
assert.equal(manifest.networkRequiredForCalculation, false);
assert.equal(manifest.appShellIncluded, false);
assert.equal(manifest.planRevision, first.revision);
assert.equal(manifest.integrity.cryptographicChecksumsIncluded, false);
assert.ok(manifest.excluded.includes('web-app-shell-and-service-worker-cache'));
assert.ok(!JSON.stringify(manifest).includes('accuracyM'));

assert.throws(() => planner.createMarsGeometryPlan({ observer, startAt: 'not-a-time' }), /VALID_PLAN_START_UTC_REQUIRED/);
assert.throws(() => planner.createMarsGeometryPlan({ observer, startAt, criteria: { stepMinutes: 7 } }), /PLAN_STEP_OUT_OF_RANGE/);
assert.throws(() => planner.createOfflinePlanManifest({}), /OBSERVATION_PLAN_REQUIRED/);

const encoded = routes.encodeAetherusRoute({
  stage: 'solar',
  target: 'mars',
  observer,
  at: startAt,
  precision: 'explorer',
  plan: planner.GEOMETRY_24H_PLAN,
}, 'https://earthus.net/?lang=ko');
assert.equal(encoded.searchParams.get('aetherus'), '3');
assert.equal(encoded.searchParams.get('plan'), 'geometry24h');
assert.equal(encoded.searchParams.get('observer'), '37.46,126.71');
assert.ok(!encoded.href.includes('accuracy'));
const decoded = routes.decodeAetherusRoute(encoded);
assert.equal(decoded.version, 3);
assert.equal(decoded.plan, 'geometry24h');

const oldPlanRoute = routes.decodeAetherusRoute(
  '?aetherus=2&solar=1&target=mars&observer=37.46,126.71&at=2026-08-12T00%3A00%3A00.000Z&precision=explorer&plan=geometry24h',
);
assert.equal(oldPlanRoute.plan, null);
assert.ok(oldPlanRoute.issues.includes('PLAN_REQUIRES_V3'));

const orphan = routes.decodeAetherusRoute('?aetherus=3&solar=1&plan=geometry24h');
assert.equal(orphan.plan, null);
assert.ok(orphan.issues.includes('ORPHAN_PLAN_STATE'));
assert.throws(() => routes.encodeAetherusRoute({
  stage: 'solar', target: 'mars', plan: 'geometry24h',
}), error => error?.code === 'INCOMPLETE_PLAN_INPUT');

console.log(`PASS: deterministic ${first.revision}, ${first.windows.length} candidate window(s), natural NO_FEASIBLE ${naturalNoFeasible.startAt}, STALE, offline manifest, route v3, desktop Node p95 ${desktopNodeP95Ms.toFixed(2)}ms`);
