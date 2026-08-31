import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
const ROOT=path.resolve((await import('node:url')).fileURLToPath(new URL('../..', import.meta.url)));
const ec=JSON.parse(fs.readFileSync(path.join(ROOT,'docs/earthus-2.0/v06/engine-catalog.v06.json'),'utf8'));
const ac=JSON.parse(fs.readFileSync(path.join(ROOT,'docs/earthus-2.0/v06/algorithm-catalog.v06.json'),'utf8'));

test('v0.6 catalog has exactly 200 engines and unique IDs',()=>{
  assert.equal(ec.engines.length,200);
  assert.equal(new Set(ec.engines.map(x=>x.id)).size,200);
});
test('v0.6 algorithm catalog has exactly 134 algorithms and unique IDs',()=>{
  assert.equal(ac.algorithms.length,134);
  assert.equal(new Set(ac.algorithms.map(x=>x.id)).size,134);
});
test('new v0.6 engines point to real modules',()=>{
  for(const e of ec.engines.filter(x=>x.phase==='Wave PULSE-1')){
    const p=path.join(ROOT,'prototype/js/earthus2/v06',e.module);
    assert.ok(fs.existsSync(p),`${e.id} missing ${p}`);
  }
});
