import test from 'node:test';
import assert from 'node:assert/strict';

import {
  calculateDensity, calculateCrowdIndex, calculateTrend, estimateScalarFlow, estimateGraphFlow, forecastCrowd,
  detectAnomaly, capacityPressure, calculateRisk, historicalBaseline, distributionSummary,
  SpatialGraph, ForecastVerificationStore, ModelLifecycleRegistry, championChallengerDecision, MODEL_STATUS,
} from '../../prototype/js/earthus2/v02/index.js';

test('density requires known area', () => assert.equal(calculateDensity({populationEstimate:100,effectiveAreaM2:null}).state,'UNKNOWN_AREA'));
test('density calculates people per square metre', () => assert.equal(calculateDensity({populationEstimate:100,effectiveAreaM2:50}).rawDensity,2));
test('crowd index uses official level when available', () => {
  const result=calculateCrowdIndex({rawDensity:2,historicalDensities:[0.5,1,1.5,2],officialLevel:'CROWDED',officialLevelScores:{CROWDED:80}});
  assert.ok(result.crowdIndex>50);
});
test('trend sees persistent increase', () => assert.ok(calculateTrend({values:[1,2,3,4],thresholds:{stableAbsSlope:0.01,rapidAbsSlope:10}}).state.includes('INCREASING')));
test('trend suppresses inconsistent recent movement', () => assert.equal(calculateTrend({values:[1,2,3,2],persistence:2,thresholds:{stableAbsSlope:0.01,rapidAbsSlope:10}}).state,'STABLE'));
test('scalar flow has no direction vector', () => assert.equal(estimateScalarFlow({previousPopulation:100,currentPopulation:120,deltaSeconds:60}).vector,null));
test('graph flow requires vector evidence', () => assert.equal(estimateGraphFlow({neighborVectors:[],weights:[]}).state,'UNKNOWN_NO_VECTOR_EVIDENCE'));
test('graph flow combines vectors', () => assert.equal(estimateGraphFlow({neighborVectors:[{u:1,v:0},{u:0,v:1}],weights:[1,1]}).vector.u,0.5));
test('crowd forecast preserves contributions', () => assert.equal(forecastCrowd({baseline:50,trendCorrection:5,eventFactor:2}).contributions.eventFactor,2));
test('anomaly distinguishes correlated event', () => assert.equal(detectAnomaly({current:100,history:[1,2,1,2,1,2,1,2,1,2],threshold:2,correlatedSignals:['EVENT']}).state,'EVENT_DETECTED'));
test('capacity is unknown without validated capacity', () => assert.equal(capacityPressure({currentOccupancy:100,validatedCapacity:null}).state,'UNKNOWN_CAPACITY'));
test('risk official emergency becomes critical', () => assert.equal(calculateRisk({officialEmergency:1}).state,'CRITICAL'));
test('historical baseline supports quantile', () => assert.equal(historicalBaseline([1,2,3],0.5),2));
test('distribution summary returns p90', () => assert.ok(distributionSummary([1,2,3,4,5]).p90>4));

test('spatial graph finds shortest path', () => {
  const graph=new SpatialGraph();
  graph.addNode({id:'A',type:'POI'});graph.addNode({id:'B',type:'GATE'});graph.addNode({id:'C',type:'STATION'});
  graph.addEdge({id:'AB',from:'A',to:'B',mode:'WALK',distanceM:10});
  graph.addEdge({id:'BC',from:'B',to:'C',mode:'WALK',distanceM:10});
  graph.addEdge({id:'AC',from:'A',to:'C',mode:'WALK',distanceM:100});
  assert.deepEqual(graph.shortestPath('A','C').nodes,['A','B','C']);
});

test('spatial graph blocks closed edge', () => {
  const graph=new SpatialGraph();graph.addNode({id:'A',type:'POI'});graph.addNode({id:'B',type:'GATE'});
  graph.addEdge({id:'AB',from:'A',to:'B',mode:'WALK',distanceM:10,status:'CLOSED'});
  assert.equal(graph.shortestPath('A','B').found,false);
});

test('forecast verification calculates MAE and RMSE', () => {
  const store=new ForecastVerificationStore();
  store.addForecast({forecastId:'f1',locationId:'L',issuedAt:'2026-08-26T00:00:00Z',targetAt:'2026-08-26T01:00:00Z',predictedValue:10,modelVersion:'m1'});
  store.attachGroundTruth({forecastId:'f1',actualValue:13,observedAt:'2026-08-26T01:00:00Z'});
  assert.equal(store.metrics().mae,3);
  assert.equal(store.metrics().rmse,3);
});

test('model lifecycle requires gates for canary', () => {
  const registry=new ModelLifecycleRegistry();registry.register({modelVersion:'m1',domain:'CROWD'});
  registry.transition('m1',MODEL_STATUS.SHADOW);
  const result=registry.transition('m1',MODEL_STATUS.CANARY,{gates:{backtestPass:true}});
  assert.equal(result.changed,false);
});

test('champion challenger requires calibration improvement', () => assert.equal(championChallengerDecision({championMetrics:{mae:10},challengerMetrics:{mae:8},calibrationImproved:false}).promote,false));
