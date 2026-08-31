import test from 'node:test'; import assert from 'node:assert/strict'; import fs from 'node:fs';
const cat=JSON.parse(fs.readFileSync(new URL('../../docs/earthus-2.0/v04/engine-catalog.v04.json',import.meta.url)));
const alg=JSON.parse(fs.readFileSync(new URL('../../docs/earthus-2.0/v04/algorithm-catalog.v04.json',import.meta.url)));
test('engine ids unique',()=>assert.equal(new Set(cat.engines.map(x=>x.id)).size,cat.engines.length));
test('algorithm ids unique',()=>assert.equal(new Set(alg.algorithms.map(x=>x.id)).size,alg.algorithms.length));
test('all dependencies exist',()=>{const ids=new Set(cat.engines.map(x=>x.id));for(const e of cat.engines)for(const d of e.dependencies??[])assert.ok(ids.has(d),`${e.id} missing ${d}`);});
test('no specified next remains in v04',()=>assert.equal(cat.engines.filter(x=>x.maturity==='SPECIFIED_NEXT').length,0));
test('reuse gate exists',()=>assert.ok(cat.engines.some(x=>x.id==='OPS-019')));
test('completion evidence gate exists',()=>assert.ok(cat.engines.some(x=>x.id==='QA-005')));
