import test from 'node:test';import assert from 'node:assert/strict';import {validateProviderContract,normalizeProviderEnvelope,contractCaptureRequired} from '../../prototype/js/earthus2/v09/index.js';
const c={providerId:'KTO',operationId:'RELATED_PLACE',truthClass:'OBSERVED',rights:{display:true},freshnessMs:86400000,version:'1',endpointVerified:false,schemaHash:null,rightsReviewed:true};
test('provider contract requires truth',()=>assert.throws(()=>validateProviderContract({providerId:'x',operationId:'o',rights:{},freshnessMs:1}),/TRUTH/));
test('contract capture remains required when endpoint/schema unverified',()=>assert.equal(contractCaptureRequired(c),true));
test('envelope keeps source-native and rights',()=>{const e=normalizeProviderEnvelope({contract:c,records:[{id:1}],sourceNative:{x:1}});assert.equal(e.records.length,1);assert.equal(e.providerId,'KTO');assert.deepEqual(e.rights,{display:true})});
