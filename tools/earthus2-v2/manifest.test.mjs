import test from 'node:test';import assert from 'node:assert/strict';import fs from 'node:fs';
const p=new URL('../../prototype/js/earthus2/config/wiring-manifest.v1.json',import.meta.url);const data=JSON.parse(fs.readFileSync(p,'utf8'));
test('manifest locks one primary',()=>assert.equal(data.rules.primaryDynamicMax,1));
test('manifest forbids new viewer',()=>assert.equal(data.rules.newCesiumViewerForbidden,true));
test('manifest separates legacy preview from production backend',()=>assert.equal(data.rules.legacyPreviewIsNotProductionBackend,true));
test('manifest has VS00 through VS07',()=>assert.deepEqual(data.verticalSlices.map(x=>x.id),['VS-00','VS-01','VS-02','VS-03','VS-04','VS-05','VS-06','VS-07']));
test('known route families never invent KTO completion',()=>assert.equal(data.knownCurrentRouteFamilies.find(x=>x.family==='tourism-kto').status,'PARTIAL'));
