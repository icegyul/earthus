#!/usr/bin/env node
import assert from 'node:assert/strict';
import { mkdtemp, readFile, writeFile } from 'node:fs/promises';
import os from 'node:os'; import path from 'node:path'; import { fileURLToPath, pathToFileURL } from 'node:url';
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..'); const dir = await mkdtemp(path.join(os.tmpdir(), 'earthus-korea-star-')); await writeFile(path.join(dir, 'package.json'), '{"type":"module"}');
const source = await readFile(path.join(root, 'prototype/js/space/korea-stargazing-preflight.js'), 'utf8'); await writeFile(path.join(dir, 'korea-stargazing-preflight.js'), source); const star = await import(pathToFileURL(path.join(dir, 'korea-stargazing-preflight.js')).href);
const at = '2026-08-12T12:00:00Z'; const window = { start: '2026-08-12T12:00:00Z', end: '2026-08-12T15:00:00Z' }; const safety = { engineVersion: 'earthus.safety.warning.v1', applies: true, status: 'SAFE', blocksPositiveRecommendation: false, evidence: { source: 'KMA' } };
const factors = [['CLOUD_COVER', 10, '%'], ['VISIBILITY', 20000, 'm'], ['RELATIVE_HUMIDITY', 40, '%'], ['PRECIPITATION_PROBABILITY', 10, '%'], ['MOON_ILLUMINATION', 25, '%'], ['DARKNESS_MARGIN', 60, 'min']].map(([factor, value, unit]) => ({ factor, value, unit, sourceUrl: 'https://official.example/evidence', observedAtUtc: at, revision: 'r1', provenance: 'observation' }));
const ready = star.evaluateKoreaStargazingPreflight({ coords: { lat: 37.57, lon: 126.98 }, timeWindow: window, safety, signals: factors, evaluatedAtUtc: at }); assert.equal(ready.state, 'EVIDENCE_READY_CALIBRATION_SHADOW'); assert.equal(ready.publicRecommendation, null); assert.equal(ready.reservation, null);
assert.equal(star.evaluateKoreaStargazingPreflight({ coords: { lat: 35.68, lon: 139.76 }, timeWindow: window, safety, signals: factors, evaluatedAtUtc: at }).state, 'OUT_OF_KOREA_SCOPE');
assert.equal(star.evaluateKoreaStargazingPreflight({ coords: { lat: 37.57, lon: 126.98 }, timeWindow: window, safety: { ...safety, status: 'UNKNOWN', blocksPositiveRecommendation: true }, signals: factors, evaluatedAtUtc: at }).state, 'WITHHELD');
assert.ok(star.evaluateKoreaStargazingPreflight({ coords: { lat: 37.57, lon: 126.98 }, timeWindow: window, safety, signals: factors.slice(0, 5), evaluatedAtUtc: at }).reasonCodes.includes('MISSING_OR_STALE:DARKNESS_MARGIN'));
assert.doesNotMatch(source, /\bfetch\s*\(|WebSocket|setInterval|requestAnimationFrame|checkout|payment/i); console.log('PASS: nationwide Korea stargazing preflight is KMA-gated, evidence-complete and non-recommending');
