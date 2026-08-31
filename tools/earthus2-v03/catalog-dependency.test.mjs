import test from 'node:test'; import assert from 'node:assert/strict'; import fs from 'node:fs';
const engines=JSON.parse(fs.readFileSync(new URL('../../docs/earthus-2.0/v03/engine-catalog.v03.json',import.meta.url))).engines;
const algos=JSON.parse(fs.readFileSync(new URL('../../docs/earthus-2.0/v03/algorithm-catalog.v03.json',import.meta.url))).algorithms;
test('engine ids unique',()=>assert.equal(new Set(engines.map(x=>x.id)).size,engines.length));
test('algorithm ids unique',()=>assert.equal(new Set(algos.map(x=>x.id)).size,algos.length));
test('all in-catalog dependencies exist',()=>{const ids=new Set(engines.map(x=>x.id));const missing=engines.flatMap(e=>(e.dependencies??[]).filter(d=>!ids.has(d)).map(d=>[e.id,d]));assert.deepEqual(missing,[]);});
test('v03 adds at least fifty engines',()=>assert.ok(engines.length>=174));
test('v03 has at least eighty algorithms',()=>assert.ok(algos.length>=80));
