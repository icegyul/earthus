#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';

const root = path.resolve(process.argv[2] ?? process.cwd());
const known = [
  ['Globe Core','prototype/js/viewer.js','REUSE_AS_IS'],
  ['Thermal Governor','prototype/js/power.js','REUSE_AS_IS'],
  ['Render Quality','prototype/js/render-quality.js','REUSE_AS_IS'],
  ['v8 Truth Contract','prototype/js/v8/truth-contract.js','REUSE_AS_IS'],
  ['v8 Source Registry','prototype/js/v8/source-registry.js','HARDEN'],
  ['v8 Unified Time','prototype/js/v8/unified-time.js','REUSE_WITH_ADAPTER'],
  ['v8 Scene State','prototype/js/v8/scene-state.js','REUSE_WITH_ADAPTER'],
  ['v8 Runtime Coordinator','prototype/js/v8/runtime-coordinator.js','HARDEN'],
  ['v8 Visual Registry','prototype/js/v8/visual-layer-registry.js','HARDEN'],
  ['v8 Shared Flow','prototype/js/v8/shared-flow.js','REUSE_WITH_ADAPTER'],
  ['v8 Human Relief','prototype/js/v8/human-relief.js','REUSE_WITH_ADAPTER'],
  ['v8 Ocean Engine','prototype/js/v8/ocean-engine.js','REUSE_WITH_ADAPTER'],
  ['v8 Entitlement Boundary','prototype/js/v8/entitlement-contract.js','HARDEN'],
  ['Seoul Tourism Collector','aws/tourism-flow/handler.py','REUSE_WITH_ADAPTER'],
  ['KTO Adapter','aws/tourism-flow/kto_provider.py','REUSE_WITH_ADAPTER'],
  ['KMA Forecast','aws/kma-fcst/handler.py','REUSE_WITH_ADAPTER'],
  ['AirKorea','aws/air-korea/handler.py','HARDEN'],
];

const rows = known.map(([name, relativePath, decision]) => {
  const full = path.join(root, relativePath);
  return { name, path: relativePath, exists: fs.existsSync(full), size: fs.existsSync(full) ? fs.statSync(full).size : null, decision };
});
const summary = {
  schemaVersion: 'earthus.engine-capability-audit.v0.2',
  root,
  generatedAt: new Date().toISOString(),
  found: rows.filter((row) => row.exists).length,
  total: rows.length,
  rows,
};
console.log(JSON.stringify(summary, null, 2));
process.exit(rows.every((row) => row.exists) ? 0 : 2);
