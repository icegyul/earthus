// 공개 KTO 정규화 JSON → 목적별 관광지. 사진·API 키·임의 원본 필드는 수록하지 않는다.
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createHash } from 'node:crypto';
import { buildTravelCatalog, TRAVEL_CATALOGS } from '../prototype/v2-three/js/travel-catalog.js';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const arg = name => { const i = process.argv.indexOf(name); return i < 0 ? null : process.argv[i + 1]; };
const from = arg('--from-dir'), out = arg('--out') || path.join(root, 'prototype/v2-three/data/tourism');
await mkdir(out, { recursive: true });
for (const [mode, config] of Object.entries(TRAVEL_CATALOGS)) {
  const source = `https://earthus.net/tourism/kto/${config.service}/${config.operation}.json`;
  let raw;
  if (from) raw = await readFile(path.join(from, `${config.service}.json`));
  else {
    const response = await fetch(source, { signal: AbortSignal.timeout(180000) });
    if (!response.ok) throw new Error(`${config.service}: HTTP ${response.status}`);
    raw = Buffer.from(await response.arrayBuffer());
  }
  const details = mode === 'bf' && arg('--barrier-details') ? JSON.parse(await readFile(arg('--barrier-details'), 'utf8')) : null;
  const catalog = buildTravelCatalog(JSON.parse(raw.toString('utf8')), mode, { detailDocument: details });
  catalog.sourceSha256 = createHash('sha256').update(raw).digest('hex');
  const data = `${JSON.stringify(catalog)}\n`;
  await writeFile(path.join(out, config.file), data);
  console.log(`${config.service}: ${catalog.items.length}/${catalog.sourceItemCount} rows, ${Buffer.byteLength(data)} bytes, source ${catalog.fetchedAt}, details ${catalog.detailState}`);
}
