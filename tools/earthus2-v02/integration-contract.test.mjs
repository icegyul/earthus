import test from 'node:test';
import assert from 'node:assert/strict';

import {
  adaptV8LayerDescriptor, assertNoDuplicateReuse, createVisualManifest, buildScenePlan, calculateTruthBudget,
  mayRenderFinePopulationTowers, createCanonicalSignal, buildIntelligencePanel, calculateDensity, calculateCrowdIndex,
  calculateTrend, forecastCrowd, calculateConfidence, buildCountryFocus, EVIDENCE_KIND, DATA_STATE,
  SCENE_MODE, TIME_MODE, VISUAL_ENGINE, THERMAL_STATE,
} from '../../prototype/js/earthus2/v02/index.js';

test('v8 EVENT descriptor becomes PULSE in Event scene', () => {
  const adapted=adaptV8LayerDescriptor({schemaVersion:'8.0',layerId:'hazard.cyclone',domain:'HAZARD',renderer:'EVENT',truthClasses:['OBSERVED','OFFICIAL_FORECAST'],qualityProfiles:['BALANCED']});
  assert.equal(adapted.primaryEngine,VISUAL_ENGINE.PULSE);
  assert.equal(adapted.scene,SCENE_MODE.EVENT);
});

test('reuse guard rejects reimplementation of existing v8 modules', () => assert.throws(()=>assertNoDuplicateReuse(['truth']),/must be adapted/));

test('Seoul aggregate remains aggregate and cannot become actual grid', () => {
  const budget=calculateTruthBudget({evidenceKind:EVIDENCE_KIND.OFFICIAL_OBSERVATION,dataState:DATA_STATE.LIVE,confidence:0.9,uncertainty:0.1,actualGrid:false,geometryAuthoritative:false,sourceCount:1});
  assert.equal(mayRenderFinePopulationTowers(budget,{actualGrid:false}),false);
});

test('official warning remains free inside panel', () => {
  const panel=buildIntelligencePanel({tier:'FREE',domain:'HAZARD',officialSafety:true,results:{NOW:{warning:'호우경보'}}});
  assert.equal(panel.tabs.NOW.entitlement.decision,'ALLOW');
});

test('mini crowd pipeline preserves source, forecast and confidence separation', () => {
  const density=calculateDensity({populationEstimate:10000,effectiveAreaM2:50000});
  const index=calculateCrowdIndex({rawDensity:density.rawDensity,historicalDensities:[0.1,0.12,0.15,0.18],officialLevel:'CROWDED',officialLevelScores:{CROWDED:80}});
  const trend=calculateTrend({values:[40,45,50,55],thresholds:{stableAbsSlope:0.01,rapidAbsSlope:100}});
  const forecast=forecastCrowd({baseline:index.crowdIndex,trendCorrection:5,providerFactor:2});
  const confidence=calculateConfidence({components:{freshness:0.9,coverage:1,agreement:0.7,historicalAccuracy:0.6,spatialMapping:0.4,modelStability:0.7,rightsAndSchema:1},mandatory:['freshness','coverage']});
  const signal=createCanonicalSignal({signalId:'seoul:myeongdong',variable:'crowd_index',value:index.crowdIndex,unit:'INDEX',geometry:{type:'Point',coordinates:[126.98,37.56]},times:{observedAt:'2026-08-26T00:00:00Z'},sourceRefs:['SEOUL_RTD'],dataState:DATA_STATE.LIVE,evidenceKind:EVIDENCE_KIND.OFFICIAL_OBSERVATION,confidence:confidence.value,processorVersion:'2.0'});
  assert.equal(signal.sourceRefs[0],'SEOUL_RTD');
  assert.ok(forecast.value>=index.crowdIndex);
  assert.ok(trend.state.includes('INCREASING'));
});

test('country focus and scene plan form Neo-Minimal country scene', () => {
  const geometry={type:'Polygon',coordinates:[[[126,34],[130,34],[130,39],[126,39],[126,34]]]};
  const focus=buildCountryFocus({countryId:'KR',geometry});
  const manifest=createVisualManifest({layerId:'population',scene:SCENE_MODE.URBAN,primaryEngine:VISUAL_ENGINE.TOWER,contextEngine:VISUAL_ENGINE.RELIEF,timeModes:[TIME_MODE.LIVE],evidenceKinds:[EVIDENCE_KIND.OFFICIAL_OBSERVATION],maxLabelsMobile:5,maxLabelsDesktop:8,sourceIds:['SEOUL_RTD'],thermalFallback:THERMAL_STATE.ECO});
  const plan=buildScenePlan({scene:manifest.scene,primaryEngine:manifest.primaryEngine,contextEngine:manifest.contextEngine,focus,deviceClass:'mobile'});
  assert.ok(plan.contextDimming.outsideBrightness<0.5);
  assert.equal(plan.labelBudget,5);
});
