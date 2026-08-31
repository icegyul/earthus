import test from 'node:test';import assert from 'node:assert/strict';import {fetchPulseNews} from '../../prototype/js/earthus2/integration-v10/pulse-source.js';
function response(payload,status=200){return{ok:status>=200&&status<300,status,json:async()=>payload};}
test('pulse normalizer accepts articles array without inventing coordinates',async()=>{const out=await fetchPulseNews({fetchImpl:async()=>response({articles:[{title:'A',source:'S'}]})});assert.equal(out.count,1);assert.equal(out.items[0].mappable,false);assert.equal(out.items[0].lat,null);});
test('pulse uses provided coordinates only',async()=>{const out=await fetchPulseNews({fetchImpl:async()=>response({items:[{title:'A',lat:37.5,lon:127.0}]})});assert.equal(out.items[0].mappable,true);});
test('pulse drops rows without a title instead of fabricating copy',async()=>{const out=await fetchPulseNews({fetchImpl:async()=>response({items:[{source:'S'}]})});assert.equal(out.count,0);});
test('pulse HTTP failure is explicit',async()=>{await assert.rejects(()=>fetchPulseNews({fetchImpl:async()=>response({},503)}),/503/);});
