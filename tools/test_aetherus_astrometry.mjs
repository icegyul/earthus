#!/usr/bin/env node

import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { performance } from 'node:perf_hooks';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const moduleSource = await readFile(path.join(ROOT, 'prototype/js/space/astrometry.js'), 'utf8');
const astrometry = await import(`data:text/javascript;base64,${Buffer.from(moduleSource).toString('base64')}`);
const encoder = new TextEncoder();

const manifestPath = path.join(ROOT, 'prototype/data/astrometry/index-manifest-v1.json');
const shardPath = path.join(ROOT, 'prototype/data/astrometry/m82-nasa-wcs-seeded-v1.json');
const fixturePath = path.join(ROOT, 'tools/fixtures/astrometry/m82opt-nasa-wcs-features-v1.json');
const manifest = JSON.parse(await readFile(manifestPath, 'utf8'));
const publicShardText = await readFile(shardPath, 'utf8');
const publicFixture = JSON.parse(await readFile(fixturePath, 'utf8'));
const artifactName = 'm82-nasa-wcs-seeded-v1.json';

function base64(bytes) {
  return Buffer.from(bytes).toString('base64');
}

async function expectCode(promise, expected) {
  await assert.rejects(promise, error => error?.code === expected,
    `expected ${expected}`);
}

const manifestVerification = await astrometry.verifyIndexManifest({
  manifest,
  artifacts: { [artifactName]: publicShardText },
});
assert.equal(manifestVerification.status, 'VERIFIED');
assert.equal(manifestVerification.signer.scope, 'DEV_FIXTURE_ONLY');
assert.equal(manifestVerification.artifacts[artifactName].sha256,
  '7429183bf4aef3d32b47c28f9ba3cac3c263b84517c110505369f12eed276cb5');

const publicIndex = astrometry.openVerifiedIndexArtifact({
  artifactText: publicShardText,
  artifactPath: artifactName,
  manifestVerification,
});
assert.equal(publicIndex.catalog.filter(source => source.role === 'INDEX').length, 16);
assert.equal(publicIndex.catalog.filter(source => source.role === 'VALIDATION').length, 8);
assert.equal(publicIndex.provenance.sampleCount, 24);
assert.equal(publicIndex.rights.productionLicenseApproval, 'PENDING');

const publicRequest = {
  schema: astrometry.ASTROMETRY_SCHEMAS.request,
  image: { width: publicFixture.oracle.width, height: publicFixture.oracle.height },
  seed: {
    centerRaDeg: publicFixture.oracle.crval[0],
    centerDecDeg: publicFixture.oracle.crval[1],
    arcsecPerPixel: publicFixture.oracle.sourceScaleArcsecPerPixel,
  },
  featureList: publicFixture.features,
};
const publicResult = await astrometry.runAstrometrySolveJob({
  request: publicRequest,
  index: publicIndex,
  budgetMs: 3000,
});
assert.equal(publicResult.status, 'VERIFIED');
assert.deepEqual(publicResult.stateTrace.map(state => state.state),
  ['QUEUED', 'EXTRACTING', 'MATCHING', 'FITTING', 'VERIFIED']);
assert.equal(publicResult.wcs.ctype[0], 'RA---TAN');
assert.equal(publicResult.wcs.pixelConvention, 'FITS_1_BASED');
assert.equal(publicResult.wcs.mirrored, true);
assert.ok(Math.abs(publicResult.wcs.crpix[0] - publicFixture.oracle.crpix[0]) < 0.001);
assert.ok(Math.abs(publicResult.wcs.crpix[1] - publicFixture.oracle.crpix[1]) < 0.001);
assert.ok(publicResult.residuals.independentValidation.count === 8);
assert.ok(publicResult.residuals.independentValidation.p95Arcsec < publicFixture.oracle.comparisonGateArcsec);
assert.equal(publicResult.diagnostics.networkRequestCount, 0);
assert.equal(publicResult.diagnostics.originalUploadCount, 0);
assert.equal(publicResult.provenance.source.sourceSha256, publicFixture.source.sha256);

function angularDistanceArcsec(left, right) {
  const d2r = Math.PI / 180;
  const a = left.decDeg * d2r;
  const b = right.decDeg * d2r;
  const delta = (left.raDeg - right.raDeg) * d2r;
  const cosine = Math.sin(a) * Math.sin(b) + Math.cos(a) * Math.cos(b) * Math.cos(delta);
  return Math.acos(Math.max(-1, Math.min(1, cosine))) * 180 / Math.PI * 3600;
}

const publicCatalogById = new Map(publicIndex.catalog.map(source => [source.id, source]));
const publicFeatureById = new Map(publicFixture.features.map(source => [source.id, source]));
const publicWorldResiduals = publicResult.matchedSources.map(match => angularDistanceArcsec(
  astrometry.pixelToWorld(publicResult.wcs,
    publicFeatureById.get(match.featureId).x, publicFeatureById.get(match.featureId).y),
  publicCatalogById.get(match.catalogId),
));
assert.ok(Math.max(...publicWorldResiduals) < 0.01);

async function verifiedIndexFromCatalog(catalog, id) {
  const artifactPath = `${id}.json`;
  const document = {
    schema: astrometry.ASTROMETRY_SCHEMAS.indexShard,
    schemaVersion: 1,
    indexId: id,
    revision: `${id}-v1`,
    coverage: { mode: 'SYNTHETIC_TEST_ONLY' },
    catalog,
    provenance: {
      kind: 'simulation',
      sourceName: 'Aetherus deterministic synthetic astrometry corpus',
      sourceUrl: 'https://earthus.net/',
      sourceRevision: 'test-v1',
      sampleCount: catalog.length,
    },
    rights: { scope: 'TEST_ONLY', productionLicenseApproval: 'NOT_APPLICABLE' },
  };
  const artifactText = JSON.stringify(document);
  const artifactDigest = await astrometry.sha256Hex(artifactText);
  const keyPair = await crypto.subtle.generateKey('Ed25519', true, ['sign', 'verify']);
  const publicKey = await crypto.subtle.exportKey('spki', keyPair.publicKey);
  const unsigned = {
    schema: astrometry.ASTROMETRY_SCHEMAS.indexManifest,
    schemaVersion: 1,
    manifestId: `${id}-manifest`,
    revision: `${id}-manifest-v1`,
    status: 'SYNTHETIC_TEST_ONLY',
    generatedAt: '2026-08-12T00:00:00Z',
    solverCompatibility: [astrometry.ASTROMETRY_SOLVER_VERSION],
    artifacts: [{
      path: artifactPath,
      revision: document.revision,
      bytes: encoder.encode(artifactText).byteLength,
      sha256: artifactDigest,
    }],
    provenance: document.provenance,
  };
  const signature = await crypto.subtle.sign('Ed25519', keyPair.privateKey,
    encoder.encode(astrometry.canonicalJson(unsigned)));
  const syntheticManifest = {
    ...unsigned,
    signature: { algorithm: 'Ed25519', keyId: `${id}-key`, valueBase64: base64(signature) },
  };
  const verification = await astrometry.verifyIndexManifest({
    manifest: syntheticManifest,
    artifacts: { [artifactPath]: artifactText },
    trustStore: {
      [`${id}-key`]: {
        algorithm: 'Ed25519',
        scope: 'SYNTHETIC_TEST_ONLY',
        publicKeySpkiBase64: base64(publicKey),
      },
    },
  });
  return astrometry.openVerifiedIndexArtifact({ artifactText, artifactPath, manifestVerification: verification });
}

function lcg(seed = 17) {
  let value = seed >>> 0;
  return () => {
    value = (1664525 * value + 1013904223) >>> 0;
    return value / 0x100000000;
  };
}

function syntheticField({
  id,
  mirrored = false,
  rotationDeg = 37,
  noisePixels = 0,
  radialDistortion = 0,
  translationDeg = [0, 0],
  centerRaDeg = 83.6331,
  centerDecDeg = 22.0145,
} = {}) {
  const width = 640;
  const height = 480;
  const crpix = [320.5, 240.5];
  const scaleArcsecPerPixel = 1.4;
  const scale = scaleArcsecPerPixel / 3600;
  const theta = rotationDeg * Math.PI / 180;
  const mirrorX = mirrored ? -1 : 1;
  const transform = {
    a: scale * Math.cos(theta) * mirrorX,
    b: -scale * Math.sin(theta),
    d: scale * Math.sin(theta) * mirrorX,
    e: scale * Math.cos(theta),
  };
  const random = lcg(91);
  const points = [];
  while (points.length < 18) {
    const point = { x: 45 + random() * 550, y: 38 + random() * 395 };
    if (points.every(other => Math.hypot(point.x - other.x, point.y - other.y) > 34)) points.push(point);
  }
  const features = [];
  const catalog = [];
  points.forEach((point, index) => {
    const dx = point.x - crpix[0];
    const dy = point.y - crpix[1];
    const radius2 = (dx * dx + dy * dy) / (width * width + height * height);
    const distortion = 1 + radialDistortion * radius2;
    const xi = (transform.a * dx + transform.b * dy) * distortion + translationDeg[0];
    const eta = (transform.d * dx + transform.e * dy) * distortion + translationDeg[1];
    const world = astrometry.tangentToWorld({ xiDeg: xi, etaDeg: eta, centerRaDeg, centerDecDeg });
    const jitterX = noisePixels ? (random() - 0.5) * 2 * noisePixels : 0;
    const jitterY = noisePixels ? (random() - 0.5) * 2 * noisePixels : 0;
    features.push({ id: `${id}-f${index + 1}`, x: point.x + jitterX, y: point.y + jitterY, flux: 20_000 - index * 500 });
    catalog.push({
      id: `${id}-c${index + 1}`,
      raDeg: world.raDeg,
      decDeg: world.decDeg,
      magnitudeProxy: index,
      role: index % 3 === 2 ? 'VALIDATION' : 'INDEX',
    });
  });
  return {
    request: {
      schema: astrometry.ASTROMETRY_SCHEMAS.request,
      image: { width, height },
      seed: { centerRaDeg, centerDecDeg, arcsecPerPixel: scaleArcsecPerPixel },
      featureList: features,
    },
    catalog,
  };
}

for (const scenario of [
  syntheticField({ id: 'rotation', rotationDeg: 121, noisePixels: 0.08 }),
  syntheticField({ id: 'mirror', mirrored: true, rotationDeg: -28, noisePixels: 0.1 }),
  syntheticField({ id: 'noise', rotationDeg: 63, noisePixels: 0.35 }),
]) {
  const index = await verifiedIndexFromCatalog(scenario.catalog, `${scenario.catalog[0].id.split('-c')[0]}-index`);
  const result = await astrometry.runAstrometrySolveJob({ request: scenario.request, index, budgetMs: 3000 });
  assert.equal(result.status, 'VERIFIED');
  assert.ok(result.residuals.independentValidation.p95Arcsec < 2.5);
}

const mirroredScenario = syntheticField({ id: 'mirror-check', mirrored: true, rotationDeg: 18, noisePixels: 0.05 });
const mirroredIndex = await verifiedIndexFromCatalog(mirroredScenario.catalog, 'mirror-check-index');
const mirroredResult = await astrometry.runAstrometrySolveJob({
  request: mirroredScenario.request, index: mirroredIndex, budgetMs: 3000,
});
assert.equal(mirroredResult.status, 'VERIFIED');
assert.equal(mirroredResult.wcs.mirrored, true);

// The initial affine slice must reject unsupported strong radial distortion instead
// of returning a precise-looking WCS.
const distortedScenario = syntheticField({ id: 'distortion', rotationDeg: 12, radialDistortion: 2.5 });
const distortedIndex = await verifiedIndexFromCatalog(distortedScenario.catalog, 'distortion-index');
const distortedResult = await astrometry.runAstrometrySolveJob({
  request: distortedScenario.request, index: distortedIndex, budgetMs: 3000,
});
assert.notEqual(distortedResult.status, 'VERIFIED');
assert.ok(['NO_MATCH', 'INDEPENDENT_VERIFICATION_FAILED'].includes(distortedResult.reason));

// An index-only pattern with unrelated independent stars is a critical false-match
// fixture. Matching the first pattern is insufficient to become VERIFIED.
const falseMatchScenario = syntheticField({ id: 'false-match', rotationDeg: 42 });
falseMatchScenario.catalog.filter(source => source.role === 'VALIDATION').forEach((source, index) => {
  source.raDeg = (source.raDeg + 1.2 + index * 0.02) % 360;
  source.decDeg = Math.min(89, source.decDeg + 0.7);
});
const falseMatchIndex = await verifiedIndexFromCatalog(falseMatchScenario.catalog, 'false-match-index');
const falseMatchResult = await astrometry.runAstrometrySolveJob({
  request: falseMatchScenario.request, index: falseMatchIndex, budgetMs: 3000,
});
assert.equal(falseMatchResult.status, 'FAILED');
assert.equal(falseMatchResult.reason, 'INDEPENDENT_VERIFICATION_FAILED');
assert.equal(falseMatchResult.wcs, null);

// Duplicate independently-verifiable fields must be reported as ambiguity.
const ambiguousBase = syntheticField({ id: 'ambiguous-a', rotationDeg: 9 });
const ambiguousOther = syntheticField({ id: 'ambiguous-b', rotationDeg: 9, translationDeg: [0.17, -0.11] });
const ambiguousCatalog = [...ambiguousBase.catalog, ...ambiguousOther.catalog];
const ambiguousIndex = await verifiedIndexFromCatalog(ambiguousCatalog, 'ambiguous-index');
const ambiguousRequest = {
  ...ambiguousBase.request,
  options: { maxHypothesisCatalog: 30 },
};
const ambiguousResult = await astrometry.runAstrometrySolveJob({
  request: ambiguousRequest, index: ambiguousIndex, budgetMs: 3000,
});
assert.equal(ambiguousResult.status, 'FAILED');
assert.equal(ambiguousResult.reason, 'AMBIGUOUS_MATCH');
assert.equal(ambiguousResult.wcs, null);

// Raw image-only input remains an explicit gap; it cannot silently act as an empty solve.
const imageOnly = await astrometry.runAstrometrySolveJob({
  request: {
    schema: astrometry.ASTROMETRY_SCHEMAS.request,
    image: { width: 640, height: 480 },
    seed: { centerRaDeg: 10, centerDecDeg: 20, arcsecPerPixel: 1.5 },
  },
  index: publicIndex,
});
assert.equal(imageOnly.status, 'FAILED');
assert.equal(imageOnly.reason, 'FEATURE_EXTRACTION_NOT_IMPLEMENTED');
assert.equal(imageOnly.diagnostics.originalUploadCount, 0);

const cancelled = new AbortController();
cancelled.abort();
const cancelledResult = await astrometry.runAstrometrySolveJob({
  request: publicRequest, index: publicIndex, signal: cancelled.signal,
});
assert.equal(cancelledResult.status, 'CANCELLED');
assert.equal(cancelledResult.reason, 'SOLVE_CANCELLED');

let budgetClock = 0;
const budgetResult = await astrometry.runAstrometrySolveJob({
  request: publicRequest,
  index: publicIndex,
  budgetMs: 1,
  clock: () => { budgetClock += 1; return budgetClock; },
});
assert.equal(budgetResult.status, 'FAILED');
assert.equal(budgetResult.reason, 'LOCAL_BUDGET_EXCEEDED');

const checksumTamper = publicShardText.replace('NASA FITS Support Office', 'NASB FITS Support Office');
assert.equal(encoder.encode(checksumTamper).byteLength, encoder.encode(publicShardText).byteLength);
await expectCode(astrometry.verifyIndexManifest({
  manifest,
  artifacts: { [artifactName]: checksumTamper },
}), 'INDEX_CHECKSUM_MISMATCH');

const signatureTamper = structuredClone(manifest);
signatureTamper.generatedAt = '2026-08-12T00:00:01Z';
await expectCode(astrometry.verifyIndexManifest({
  manifest: signatureTamper,
  artifacts: { [artifactName]: publicShardText },
}), 'INDEX_SIGNATURE_INVALID');

const untrusted = structuredClone(manifest);
untrusted.signature.keyId = 'unknown-index-signer';
await expectCode(astrometry.verifyIndexManifest({
  manifest: untrusted,
  artifacts: { [artifactName]: publicShardText },
}), 'INDEX_SIGNER_UNTRUSTED');

const noConsent = astrometry.planOptionalCloudEscalation({ localResult: falseMatchResult });
assert.equal(noConsent.status, 'CONSENT_REQUIRED');
assert.equal(noConsent.requestCount, 0);
const noUploadConsent = astrometry.planOptionalCloudEscalation({
  localResult: falseMatchResult, explicitConsent: true, networkAvailable: true,
});
assert.equal(noUploadConsent.status, 'UPLOAD_CONSENT_REQUIRED');
const noAdapter = astrometry.planOptionalCloudEscalation({
  localResult: falseMatchResult,
  explicitConsent: true,
  originalUploadConsent: true,
  networkAvailable: true,
});
assert.equal(noAdapter.status, 'PROPOSED_NOT_EXECUTED');
assert.equal(noAdapter.requestCount, 0);

const benchmarkMs = [];
for (let index = 0; index < 30; index += 1) {
  const started = performance.now();
  const result = await astrometry.runAstrometrySolveJob({ request: publicRequest, index: publicIndex, budgetMs: 3000 });
  benchmarkMs.push(performance.now() - started);
  assert.equal(result.status, 'VERIFIED');
  assert.equal(result.inputDigest, publicResult.inputDigest);
}
benchmarkMs.sort((a, b) => a - b);
const p95Ms = benchmarkMs[Math.ceil(benchmarkMs.length * 0.95) - 1];
assert.ok(p95Ms < 3000, `desktop seeded p95 ${p95Ms.toFixed(2)}ms exceeded unverified target`);

assert.doesNotMatch(moduleSource, /\bfetch\s*\(|XMLHttpRequest|WebSocket|requestAnimationFrame|setInterval/);
assert.match(moduleSource, /INDEX_SIGNATURE_INVALID/);
assert.match(moduleSource, /INDEPENDENT_VERIFICATION_FAILED/);
assert.match(moduleSource, /CLOUD_ADAPTER_NOT_IMPLEMENTED/);

console.log(`PASS: signed M82 public WCS fixture, independent residual, rotation/mirror/noise, distortion rejection, false-match 0, ambiguity, consent-gated cloud plan, desktop seeded p95 ${p95Ms.toFixed(2)}ms`);
