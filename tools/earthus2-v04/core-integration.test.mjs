import test from 'node:test'; import assert from 'node:assert/strict';
import { deviceNetworkProfile } from '../../prototype/js/earthus2/v04/core/device-network-governor.js';
import { buildPlanetExecutionPlan } from '../../prototype/js/earthus2/v04/core/planet-intelligence-orchestrator.js';
import { resolveSpatialIdentity } from '../../prototype/js/earthus2/v04/data/spatial-identity-resolution.js';
import { buildLearningExample } from '../../prototype/js/earthus2/v04/data/learning-data-factory.js';
import { evaluateNewEngineProposal } from '../../prototype/js/earthus2/v04/ops/engine-reuse-enforcer.js';
import { compileCompletionEvidence } from '../../prototype/js/earthus2/v04/qa/completion-evidence.js';

test('save-data mobile degrades quality',()=>assert.equal(deviceNetworkProfile({deviceClass:'mobile',network:'4G',saveData:true}).quality,'LITE'));
test('safe thermal makes static',()=>assert.equal(deviceNetworkProfile({thermal:'SAFE'}).quality,'STATIC'));
test('planet plan disposes previous primary',()=>assert.equal(buildPlanetExecutionPlan({sceneProfile:{scene:'OCEAN'},layerManifest:{primaryEngine:'FLOW'},deviceProfile:deviceNetworkProfile({}),truthBudget:{allowedFidelity:'FULL'}}).disposePreviousPrimary,true));
test('identity exact external id wins',()=>assert.equal(resolveSpatialIdentity({externalMasterId:'SEOUL:A'},[{id:'x',externalIds:['SEOUL:A']}]).state,'MATCHED_EXACT_EXTERNAL_ID'));
test('ambiguous identity remains ambiguous',()=>assert.equal(resolveSpatialIdentity({name:'Central Park'},[{id:'a',name:'Central Park'},{id:'b',name:'Central Park'}],{acceptScore:.4,ambiguousDelta:.1}).state,'AMBIGUOUS'));
test('learning example requires ground truth',()=>assert.equal(buildLearningExample({forecast:{modelVersion:'m1',issuedAt:'2026-01-01T00:00:00Z',targetAt:'2026-01-01T01:00:00Z'},groundTruth:null,rights:{aiUse:true}}).accepted,false));
test('learning example requires ai-use rights',()=>assert.equal(buildLearningExample({forecast:{modelVersion:'m1',issuedAt:'2026-01-01T00:00:00Z',targetAt:'2026-01-01T01:00:00Z'},groundTruth:{actual:1}}).reason,'AI_USE_RIGHTS_BLOCKED'));
test('reuse candidate blocks new engine without gap evidence',()=>assert.equal(evaluateNewEngineProposal({name:'Cloud Volume Renderer',purpose:'render cloud volume'},[{id:'VIS-006',name:'Cloud Volume Renderer',action:'render cloud volume',maturity:'IMPLEMENTED_FOUNDATION'}]).decision,'BLOCK_NEW_ENGINE'));
test('complete evidence needs runtime',()=>assert.equal(compileCompletionEvidence({usedEngineIds:['A'],usedAlgorithmIds:['B'],actualDataEvidence:true,testsPass:true,browserOrDeviceEvidence:true,screenshotEvidence:true,performanceEvidence:true,disposeEvidence:true,regressionEvidence:true,noDuplicateEngineEvidence:true}).status,'NOT_DONE'));
test('full completion evidence accepted',()=>assert.equal(compileCompletionEvidence({usedEngineIds:['A'],usedAlgorithmIds:['B'],actualDataEvidence:true,runtimeInvocationEvidence:true,testsPass:true,browserOrDeviceEvidence:true,screenshotEvidence:true,performanceEvidence:true,disposeEvidence:true,regressionEvidence:true,noDuplicateEngineEvidence:true}).status,'DONE_EVIDENCE_ACCEPTED'));
