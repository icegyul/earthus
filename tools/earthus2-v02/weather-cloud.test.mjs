import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

import {
  normalizeModelMember, blendEnsemble, applyBiasCorrection, sampleScalarGrid, advectScalarField, blendNowcastWithNwp,
  EvidenceGraph, composeWeatherBrief, narrativeProbabilityPhrase, buildClaimText, precipitationPhase, precipitationState,
  rainCurtainPolicy, scanForecastGap, moistureFluxContribution, selectSatelliteProducts, retrieveCloudTopHeight,
  retrieveCloudBaseHeight, detectCloudLayers, buildCloudDensityProfile, createCanonicalCloudState, cloudBlendWeights,
  cloudHorizonKind, blendCloudStates, cloudRenderPolicy,
} from '../../prototype/js/earthus2/v02/index.js';

const satelliteSources = JSON.parse(fs.readFileSync(new URL('../../fixtures/earthus2-v02/satellite-sources.json', import.meta.url), 'utf8'));

test('model normalization falls back to raw value', () => assert.equal(normalizeModelMember({modelId:'KMA',issuedAt:'2026-08-26T00:00:00Z',validAt:'2026-08-26T03:00:00Z',value:10}).correctedValue,10));
test('ensemble requires minimum members', () => assert.equal(blendEnsemble([{modelId:'A',issuedAt:'2026-08-26T00:00:00Z',validAt:'2026-08-26T03:00:00Z',value:1}]).state,'INSUFFICIENT_MEMBERS'));
test('ensemble computes agreement', () => { const r=blendEnsemble([{modelId:'A',issuedAt:'2026-08-26T00:00:00Z',validAt:'2026-08-26T03:00:00Z',value:10},{modelId:'B',issuedAt:'2026-08-26T00:00:00Z',validAt:'2026-08-26T03:00:00Z',value:11}]); assert.ok(r.agreement>0.8); });
test('bias correction subtracts bias', () => assert.equal(applyBiasCorrection({value:10,bias:2}).corrected,8));

test('scalar grid bilinear sampling works', () => assert.equal(sampleScalarGrid({width:2,height:2,values:[0,10,10,20]},0.5,0.5),10));
test('scalar advection preserves dimensions', () => { const r=advectScalarField({field:{width:2,height:2,values:[1,1,1,1]},vectorField:{width:2,height:2,u:[0,0,0,0],v:[0,0,0,0]},dtSeconds:60}); assert.equal(r.values.length,4); });
test('nowcast blend increases NWP weight by horizon', () => { const n={width:1,height:1,values:[0]}; const m={width:1,height:1,values:[10]}; assert.ok(blendNowcastWithNwp({nowcast:n,nwp:m,horizonHours:5}).values[0]>5); });

test('evidence graph allows supported claim', () => {
  const graph=new EvidenceGraph();
  graph.addEvidence({evidenceId:'e1',type:'MOISTURE_TRAJECTORY',confidence:0.9});
  graph.addEvidence({evidenceId:'e2',type:'ASCENT',confidence:0.8});
  graph.defineClaim({claimId:'c1',intent:'MOISTURE_SOURCE',requiredRules:[{type:'MOISTURE_TRAJECTORY',minimumConfidence:0.7},{type:'ASCENT',minimumConfidence:0.7}],minimumClaimConfidence:0.7});
  assert.equal(graph.evaluateClaim('c1').allowed,true);
});

test('evidence graph blocks missing rule', () => {
  const graph=new EvidenceGraph();graph.addEvidence({evidenceId:'e1',type:'ASCENT',confidence:0.9});
  graph.defineClaim({claimId:'c1',intent:'X',requiredRules:[{type:'MOISTURE_TRAJECTORY'}]});
  assert.equal(graph.evaluateClaim('c1').allowed,false);
});

test('weather brief includes only allowed claims', () => {
  const brief=composeWeatherBrief({locationName:'서울',officialSummary:'오늘 비가 내립니다.',generatedAt:'2026-08-26T00:00:00Z',analysisClaims:[{claimId:'a',allowed:true,text:'수증기 유입이 있습니다.'},{claimId:'b',allowed:false,text:'금지'}]});
  assert.equal(brief.analysis.length,1);
  assert.equal(brief.sourceLabel,'기상청 발표');
});

test('uncalibrated probability never prints a percentage', () => assert.equal(narrativeProbabilityPhrase(0.6,{calibrated:false}).includes('%'),false));
test('claim text supports SST contribution wording', () => assert.ok(buildClaimText({type:'SST_SUPPORT',payload:{seaName:'서해'}}).includes('보조')));

test('precipitation phase identifies snow', () => assert.equal(precipitationPhase({surfaceTemperatureC:-2,wetBulbTemperatureC:-2,warmLayerDepthM:100,coldLayerDepthM:500}).phase,'SNOW'));
test('precipitation state prefers observed blend label', () => assert.equal(precipitationState({radarRateMmH:10,gaugeRateMmH:8,modelRateMmH:20}).state,'OBSERVED_BLEND'));
test('rain curtain uses lightweight mode far from surface', () => assert.equal(rainCurtainPolicy({rateMmH:10,cameraHeightM:1000000}).mode,'CURTAIN'));

test('forecast gap becomes early signal only when persistent and qualified', () => assert.equal(scanForecastGap({officialValue:10,consensusValue:20,consensusAgreement:0.8,persistenceRuns:3,calibratedSkill:0.8,threshold:5}).state,'EARLY_SIGNAL'));
test('official warning overrides gap signal', () => assert.equal(scanForecastGap({officialValue:10,consensusValue:20,consensusAgreement:0.8,persistenceRuns:3,calibratedSkill:0.8,threshold:5,warningActive:true}).state,'OFFICIAL_WARNING_PRIORITY'));
test('moisture attribution forbids SST-only causal claim', () => { const r=moistureFluxContribution({trajectoryOverlap:0,fluxConvergence:0,tpwAnomaly:0,verticalAscent:0,sstSupport:1,radarGrowth:0}); assert.equal(r.causalLanguageAllowed,false); });
test('moisture attribution allows multi-signal contribution', () => { const r=moistureFluxContribution({trajectoryOverlap:0.9,fluxConvergence:0.9,tpwAnomaly:0.8,verticalAscent:0.8,sstSupport:0.7,radarGrowth:0.7}); assert.equal(r.causalLanguageAllowed,true); });

test('satellite broker chooses GK2A for Korean IR tile', () => {
  const r=selectSatelliteProducts({sources:satelliteSources,request:{product:'CLOUD_TOP_IR',regionId:'KR',tileId:'KR-1',isNight:true,targetResolutionKm:2,maxAgeMinutes:30,maxViewZenithDeg:75,maxTimeOffsetMinutes:10,requiresParallaxCorrection:true,derivedProduct:true}});
  assert.equal(r.primary,'GK2A');
});

test('day-only source is rejected at night', () => {
  const r=selectSatelliteProducts({sources:satelliteSources,request:{product:'VISIBLE_CLOUD',regionId:'KR',tileId:'KR-1',isNight:true,targetResolutionKm:1,maxAgeMinutes:120,maxViewZenithDeg:75,maxTimeOffsetMinutes:15,derivedProduct:true}});
  assert.equal(r.primary,null);
});

test('cloud top retrieval returns metadata and uncertainty', () => {
  const r=retrieveCloudTopHeight({brightnessTemperatureK:250,temperatureProfile:[{heightM:1000,temperatureK:280},{heightM:8000,temperatureK:250}],parallaxCorrected:false,viewZenithDeg:70});
  assert.equal(r.heightM,8000);
  assert.ok(r.verticalUncertaintyM>500);
  assert.ok(r.qualityFlags.includes('PARALLAX_NOT_CORRECTED'));
});

test('ceilometer cloud base is observation', () => assert.equal(retrieveCloudBaseHeight({profile:[],ceilometerHeightM:500}).state,'OBSERVED_CEILOMETER'));
test('cloud layer detector flags multilayer', () => { const r=detectCloudLayers([{heightM:0,cloudFraction:0},{heightM:500,cloudFraction:0.8},{heightM:1000,cloudFraction:0.8},{heightM:1500,cloudFraction:0},{heightM:3000,cloudFraction:0.7},{heightM:3500,cloudFraction:0.7},{heightM:4000,cloudFraction:0}]); assert.equal(r.multiLayerFlag,true); });
test('cloud density stays bounded', () => assert.ok(buildCloudDensityProfile([{cloudFraction:1,relativeHumidity:1,opticalDepth:1,cloudMask:1,condensate:1,uncertainty:0}])[0].density<=1));
test('canonical cloud state preserves retrieval metadata', () => { const r=createCanonicalCloudState({stateId:'c',regionId:'KR',validAt:'2026-08-26T00:00:00Z',sourceSelection:{primary:'GK2A'},confidence:0.8,uncertainty:0.2,retrievalMethod:'IR',multiLayerFlag:true}); assert.equal(r.multiLayerFlag,true); });
test('cloud blend weights sum to one', () => { const w=cloudBlendWeights(100); assert.ok(Math.abs(w.observation+w.deterministic+w.ensemble-1)<1e-9); });
test('cloud horizon 8 days is long-range outlook', () => assert.equal(cloudHorizonKind(192),'LONG_RANGE_OUTLOOK'));
test('cloud state blend shifts toward ensemble long range', () => { const r=blendCloudStates({observed:{lowCloudFraction:0,uncertainty:0.1},deterministic:{lowCloudFraction:0.5,uncertainty:0.3},ensemble:{lowCloudFraction:1,uncertainty:0.6},horizonHours:200}); assert.ok(r.lowCloudFraction>0.5); });
test('long-range render is probabilistic', () => assert.equal(cloudRenderPolicy({horizonHours:200,confidence:0.5,uncertainty:0.7}).mode,'PROBABILITY_VOLUME'));
