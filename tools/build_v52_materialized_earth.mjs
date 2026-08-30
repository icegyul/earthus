#!/usr/bin/env node
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { gzipSync } from 'node:zlib';

import {
  MaterializedEarthService,
  MemoryMaterializedStore,
} from '../aws/materialized-earth/lib/materialized-earth-service.mjs';
import { materializeWeatherTyphoon } from '../aws/materialized-earth/weather-typhoon.mjs';
import { ComputeTelemetry } from '../aws/materialized-earth/lib/compute-telemetry.mjs';
import { calculateDirectInfraCost } from '../aws/materialized-earth/lib/compute-cost-ledger.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const output = path.join(root, 'prototype/v2/data/materialized');
const SOURCE = 'https://earthus-cache-kr.s3.us-east-2.amazonaws.com';
const URLS = Object.freeze({
  kmaAws: `${SOURCE}/wind/kma-aws.json`,
  fxEa: `${SOURCE}/wind/fx-ea.json`,
  typhoonOfficial: `${SOURCE}/events/typhoon-official.json`,
});

async function fetchJson(url) {
  const response = await fetch(url, {
    cache: 'no-store',
    headers: { 'User-Agent': 'earthus-v52-materializer/1.0' },
  });
  if (!response.ok) throw new Error(`MATERIALIZED_SOURCE_HTTP_${response.status}:${url}`);
  const contentType = response.headers.get('content-type') || '';
  if (!/json/i.test(contentType)) throw new Error(`MATERIALIZED_SOURCE_MIME:${contentType}:${url}`);
  return response.json();
}

await fs.mkdir(path.join(output, 'artifacts'), { recursive: true });
const telemetry = new ComputeTelemetry({ maxEvents: 100 });
const started = performance.now();
telemetry.emit('compute.plan', {
  computeClass: 'C1_MATERIALIZED_SHARED', productType: 'WEATHER_TYPHOON',
  shareScope: 'PUBLIC', plannedBackend: 'CPU',
});
const [kmaAws, fxEa, typhoonOfficial] = await Promise.all([
  fetchJson(URLS.kmaAws), fetchJson(URLS.fxEa), fetchJson(URLS.typhoonOfficial),
]);
const store = new MemoryMaterializedStore();
const service = new MaterializedEarthService({ store });
const result = await materializeWeatherTyphoon({ kmaAws, fxEa, typhoonOfficial, service });
telemetry.emit('compute.execute_end', {
  computeClass: 'C1_MATERIALIZED_SHARED', productType: 'WEATHER_TYPHOON',
  runtimeMs: Math.round(performance.now() - started), actualBackend: 'CPU',
});

const artifactRefs = [];
for (const artifact of result.publicCurrent) {
  const fileName = `${artifact.contentHash.slice('sha256:'.length)}.json`;
  const bytes = `${JSON.stringify(artifact, null, 2)}\n`;
  await fs.writeFile(path.join(output, 'artifacts', fileName), bytes, 'utf8');
  artifactRefs.push(Object.freeze({
    productType: artifact.productType,
    spatialKey: artifact.spatialKey,
    artifactId: artifact.artifactId,
    contentHash: artifact.contentHash,
    path: `./artifacts/${fileName}`,
  }));
}

const cost = calculateDirectInfraCost({
  cpuCoreSeconds: 0, gpuSeconds: 0, memoryGbSeconds: 0, storageGbHours: 0,
  storageOps: artifactRefs.length + 2, egressGb: 0, providerApiUnits: 3,
  llmInputTokens: 0, llmOutputTokens: 0, otherMeteredRuntimeCost: 0,
}, {
  version: 'UNCONFIGURED', currency: null,
});

const current = Object.freeze({
  schemaVersion: 'earthus.materialized-current.v5.2',
  generatedAt: new Date().toISOString(),
  computeClass: 'C1_MATERIALIZED_SHARED',
  shareScope: 'PUBLIC',
  earthVersion: result.earthVersion,
  artifactRefs,
  globalDigest: result.globalDigest,
  regionSnapshot: result.regionSnapshot,
  eventCapsule: result.eventCapsule,
  telemetry: telemetry.summary(),
  directInfraCost: cost,
  sourceReceipts: Object.entries(URLS).map(([id, url]) => ({ id, url })),
});
const currentBytes = `${JSON.stringify(current, null, 2)}\n`;
const compressedBytes = gzipSync(currentBytes).length;
if (compressedBytes > 64 * 1024) {
  throw new Error(`GLOBAL_MATERIALIZED_PAYLOAD_BUDGET:${compressedBytes}`);
}
await fs.writeFile(path.join(output, 'earth-version.json'), `${JSON.stringify(result.earthVersion, null, 2)}\n`, 'utf8');
await fs.writeFile(path.join(output, 'current.json'), currentBytes, 'utf8');
console.log(JSON.stringify({
  status: 'MATERIALIZED_EARTH_BUILT',
  earthVersion: result.earthVersion.earthVersion,
  artifacts: artifactRefs.length,
  bytes: Buffer.byteLength(currentBytes),
  gzipBytes: compressedBytes,
  telemetry: telemetry.summary(),
  costStatus: cost.status,
}, null, 2));
