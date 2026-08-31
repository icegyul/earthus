#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';

const catalogPath = path.resolve(process.argv[2] ?? 'docs/earthus-2.0/v02/engine-catalog.v02.json');
const catalog = JSON.parse(fs.readFileSync(catalogPath, 'utf8'));
const engines = catalog.engines;
const byId = new Map(engines.map((engine) => [engine.id, engine]));
const unresolved = new Set(engines.map((engine) => engine.id));
const resolved = new Set();
const waves = [];
while (unresolved.size) {
  const wave = [...unresolved]
    .filter((id) => (byId.get(id).dependencies ?? []).every((dependency) => resolved.has(dependency) || !byId.has(dependency)))
    .sort();
  if (!wave.length) {
    const cycle = [...unresolved].map((id) => ({ id, dependencies: byId.get(id).dependencies ?? [] }));
    throw new Error(`dependency cycle or unresolved internal dependency: ${JSON.stringify(cycle)}`);
  }
  waves.push(wave);
  for (const id of wave) { unresolved.delete(id); resolved.add(id); }
}
console.log(JSON.stringify({ schemaVersion: 'earthus.engine-waves.v0.2', waves }, null, 2));
