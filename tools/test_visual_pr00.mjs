import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { mkdtemp, mkdir, writeFile } from 'node:fs/promises';
import { auditModuleSpecifiers, loadModuleSpecifierBaseline } from './module-specifier-audit.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const contractSource = fs.readFileSync(path.join(root, 'prototype/js/satellite-frame-contract.js'), 'utf8');
const diagnosticsSource = fs.readFileSync(path.join(root, 'prototype/js/satellite-diagnostics.js'), 'utf8');
const contract = await import(`data:text/javascript;base64,${Buffer.from(contractSource).toString('base64')}`);
const diagnostics = await import(`data:text/javascript;base64,${Buffer.from(diagnosticsSource).toString('base64')}`);
const fixtures = JSON.parse(fs.readFileSync(path.join(root, 'tools/fixtures/satellite-frame-v1.json'), 'utf8'));

const validByName = new Map(fixtures.valid.map(item => [item.name, item.frame]));
for (const item of fixtures.valid) {
  const before = JSON.stringify(item.frame);
  const normalized = contract.validateSatelliteFrame(item.frame);
  assert.equal(contract.satelliteFrameId(item.frame), item.expectedFrameId, item.name);
  assert.equal(JSON.stringify(item.frame), before, `${item.name} input mutation`);
  assert.equal(normalized.schema, contract.SATELLITE_FRAME_SCHEMA);
}

for (const item of fixtures.invalid) {
  const frame = structuredClone(validByName.get(item.from));
  if (item.delete) delete frame[item.delete];
  Object.assign(frame, item.set || {});
  Object.assign(frame.provenance, item.setProvenance || {});
  assert.throws(
    () => contract.validateSatelliteFrame(frame),
    error => error instanceof contract.SatelliteFrameContractError && error.code === item.expectedCode,
    item.name,
  );
}
assert.deepEqual(contract.SATELLITE_FRAME_FAILURE, [
  'UNAVAILABLE', 'STALE', 'UNUSABLE_AT_NIGHT', 'SCHEMA_MISMATCH', 'CORS_BLOCKED', 'DECODE_FAILED',
]);

assert.equal(diagnostics.satelliteRequestKey(
  'https://gibs.earthdata.nasa.gov/wmts/epsg3857/best/Himawari_AHI_Band13/default/2026-08-13T00:20:00Z/GoogleMapsCompatible_Level6/5/12/27.png?secret=never-log'),
  'GIBS/Himawari_AHI_Band13/2026-08-13T00:20:00Z/GoogleMapsCompatible_Level6/5/12/27');
const requestReport = diagnostics.requestSummary([
  'https://gibs.earthdata.nasa.gov/a/default/t/tms/5/1/2.png',
  'https://gibs.earthdata.nasa.gov/a/default/t/tms/5/1/2.png?cache=2',
]);
assert.equal(requestReport.requestCount, 2);
assert.equal(requestReport.uniqueKeyCount, 1);
assert.equal(requestReport.duplicateRequestCount, 1);
assert.equal(requestReport.dedupeOpportunityRatio, 0.5);
assert.deepEqual(requestReport.providerBreakdown, { GIBS: 2 });
assert.equal(diagnostics.maskTimingSummary([1, 2, 8, 60]).longTasksOver50Ms, 1);
assert.equal(diagnostics.estimateTextureBytes(6000, 3000), 72_000_000);

const repositoryAudit = auditModuleSpecifiers({
  root,
  baseline: loadModuleSpecifierBaseline(path.join(root, 'tools/fixtures/module-specifier-baseline.json')),
});
assert.equal(repositoryAudit.unexpectedMismatchCount, 0, 'new module query mismatch');
assert.equal(repositoryAudit.staleBaseline.length, 0, 'stale module mismatch baseline');
assert.equal(repositoryAudit.acknowledgedMismatchCount, 0, 'PR-01 singleton debt must stay closed');

/* 새 query mismatch가 실제 CI 실패 조건이 되는지 합성 저장소로 검증한다. */
const temporary = await mkdtemp(path.join(os.tmpdir(), 'earthus-module-audit-'));
const jsRoot = path.join(temporary, 'prototype/js');
await mkdir(jsRoot, { recursive: true });
await writeFile(path.join(jsRoot, 'a.js'), "import './shared.js';\n");
await writeFile(path.join(jsRoot, 'b.js'), "import './shared.js?v=2';\n");
await writeFile(path.join(jsRoot, 'shared.js'), 'export const value = 1;\n');
const syntheticAudit = auditModuleSpecifiers({ root: temporary, baseline: { allowed: {} } });
assert.equal(syntheticAudit.unexpectedMismatchCount, 1);
assert.equal(syntheticAudit.mismatches[0].target, 'prototype/js/shared.js');

/* 계약 파일은 브라우저 없이도 독립 import 가능한 순수 모듈이어야 한다. */
const tempContract = path.join(temporary, 'satellite-frame-contract.mjs');
await writeFile(tempContract, contractSource);
const direct = await import(pathToFileURL(tempContract).href);
assert.equal(direct.SATELLITE_FRAME_SCHEMA, contract.SATELLITE_FRAME_SCHEMA);

console.log(`Visual PR-00 contracts: ${fixtures.valid.length} valid + ${fixtures.invalid.length} reject fixtures; diagnostics/module audit passed`);
