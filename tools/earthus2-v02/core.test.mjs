import test from 'node:test';
import assert from 'node:assert/strict';

import {
  clamp, median, percentile, mad, robustZ, ewma, theilSenSlope, weightedMean, boundedLogScale, fnv1a64,
  createCanonicalSignal, canPresentAsLive, deriveFreshnessState, calculateConfidence, confidenceBand,
  ResourceScope, EngineResourceGovernor, thermalBudget, EarthusEngineRuntime, createMemoryEngineAdapter,
  calculateTruthBudget, mayRenderFinePopulationTowers, DomainPolicyRegistry, createWeightedDomainPolicy,
  officialHazardGate, closedGate, regionalStandard, formatRegionalWeather, platformCapabilityPlan,
  DATA_STATE, EVIDENCE_KIND, ENGINE_CLASS, THERMAL_STATE, TRUTH_FIDELITY,
} from '../../prototype/js/earthus2/v02/index.js';

test('clamp bounds values', () => assert.equal(clamp(2, 0, 1), 1));
test('median handles even samples', () => assert.equal(median([1, 4, 2, 3]), 2.5));
test('percentile interpolates', () => assert.equal(percentile([0, 10], 0.25), 2.5));
test('mad is robust', () => assert.equal(mad([1, 1, 1, 100]), 0));
test('robustZ returns finite for dispersed history', () => assert.ok(Number.isFinite(robustZ(5, [1,2,3,4,5,6]))));
test('ewma preserves sample count', () => assert.equal(ewma([1,2,3], 0.5).length, 3));
test('Theil-Sen rejects one outlier influence', () => assert.equal(theilSenSlope([{x:0,y:0},{x:1,y:1},{x:2,y:100}]), 50));
test('weighted mean ignores zero weight', () => assert.equal(weightedMean([{value:10,weight:1},{value:100,weight:0}]), 10));
test('bounded log scale stays bounded', () => assert.ok(boundedLogScale(100, {maxValue:100}) <= 1));
test('stable fingerprint is deterministic', () => assert.equal(fnv1a64({b:2,a:1}), fnv1a64({a:1,b:2})));

test('canonical observation requires observedAt', () => {
  assert.throws(() => createCanonicalSignal({
    signalId:'x', variable:'temp', geometry:{type:'Point',coordinates:[127,37]}, sourceRefs:['KMA'],
    dataState:DATA_STATE.LIVE, evidenceKind:EVIDENCE_KIND.OFFICIAL_OBSERVATION, times:{}, processorVersion:'1',
  }), /observedAt/);
});

test('canonical signal separates official forecast from live observation', () => {
  const signal = createCanonicalSignal({
    signalId:'x', variable:'temp', value:18, unit:'C', geometry:{type:'Point',coordinates:[127,37]}, sourceRefs:['KMA'],
    dataState:DATA_STATE.LIVE, evidenceKind:EVIDENCE_KIND.OFFICIAL_FORECAST, times:{validAt:'2026-08-26T06:00:00Z'}, processorVersion:'1',
  });
  assert.equal(canPresentAsLive(signal), false);
});

test('freshness state distinguishes live/stale/unavailable', () => {
  assert.equal(deriveFreshnessState({referenceAt:'2026-08-26T00:00:00Z',nowAt:'2026-08-26T00:05:00Z',liveSec:600,staleSec:1200}), DATA_STATE.LIVE);
  assert.equal(deriveFreshnessState({referenceAt:'2026-08-26T00:00:00Z',nowAt:'2026-08-26T00:15:00Z',liveSec:600,staleSec:1200}), DATA_STATE.STALE);
  assert.equal(deriveFreshnessState({referenceAt:'2026-08-26T00:00:00Z',nowAt:'2026-08-26T01:00:00Z',liveSec:600,staleSec:1200}), DATA_STATE.UNAVAILABLE);
});

test('confidence caps missing mandatory components', () => {
  const result = calculateConfidence({components:{freshness:1,coverage:1},mandatory:['historicalAccuracy']});
  assert.ok(result.value <= 0.35);
  assert.equal(result.band, 'LOW');
});

test('confidence bands are ordered', () => {
  assert.equal(confidenceBand(0.81), 'HIGH');
  assert.equal(confidenceBand(0.6), 'MEDIUM');
  assert.equal(confidenceBand(0.4), 'LOW');
  assert.equal(confidenceBand(0.1), 'VERY_LOW');
});

test('resource scope aborts and disposes owned resources', () => {
  const scope = new ResourceScope('a');
  const controller = scope.ownAbortController();
  let disposed = 0;
  scope.ownDisposer(() => disposed += 1);
  scope.dispose();
  assert.equal(controller.signal.aborted, true);
  assert.equal(disposed, 1);
});

test('governor enforces one primary dynamic owner', () => {
  const governor = new EngineResourceGovernor();
  governor.createScope('wind');
  governor.activatePrimary('wind');
  governor.createScope('cloud');
  governor.activatePrimary('cloud');
  assert.equal(governor.snapshot().primaryDynamic, 'cloud');
  assert.equal(governor.getScope('wind'), null);
});

test('thermal budget disables heavy engines in ECO', () => assert.equal(thermalBudget(THERMAL_STATE.ECO).allowHeavy, false));

test('engine runtime mounts and activates adapter', async () => {
  const runtime = new EarthusEngineRuntime();
  runtime.register({id:'field',engineClass:ENGINE_CLASS.DYNAMIC,adapter:createMemoryEngineAdapter()});
  await runtime.mount('field', {});
  runtime.activate('field');
  assert.equal(runtime.snapshot('field').lifecycle, 'ACTIVE');
  await runtime.disposeAll();
});

test('truth budget blocks unavailable data', () => {
  const result = calculateTruthBudget({evidenceKind:EVIDENCE_KIND.OFFICIAL_OBSERVATION,dataState:DATA_STATE.UNAVAILABLE,confidence:1,uncertainty:0});
  assert.equal(result.maxFidelity, TRUTH_FIDELITY.NONE);
});

test('fine population tower requires actual grid', () => {
  const budget = calculateTruthBudget({evidenceKind:EVIDENCE_KIND.OFFICIAL_OBSERVATION,dataState:DATA_STATE.LIVE,confidence:0.9,uncertainty:0.1,actualGrid:true,spatialResolutionM:100});
  assert.equal(mayRenderFinePopulationTowers(budget,{actualGrid:true}), true);
  assert.equal(mayRenderFinePopulationTowers(budget,{actualGrid:false}), false);
});

test('domain hard gate excludes official hazard', () => {
  const registry = new DomainPolicyRegistry();
  registry.register(createWeightedDomainPolicy({id:'TOURISM',weights:{weather:1,crowd:1},hardGates:[officialHazardGate,closedGate]}));
  assert.equal(registry.evaluate('TOURISM',{weather:1,crowd:1,officialHazardActive:true}).decision, 'EXCLUDE');
});

test('regional weather formatting converts US units', () => {
  const result = formatRegionalWeather({region:'US',temperatureC:0,windMps:10,precipitationMm:25.4});
  assert.equal(Math.round(result.temperature), 32);
  assert.equal(Math.round(result.precipitation), 1);
});

test('platform capability reveals geofence blocker for PWA-only', () => {
  const plan = platformCapabilityPlan({pwa:true,geofence:true});
  assert.ok(plan.blockers.includes('GEOFENCE_REQUIRES_NATIVE_DELIVERY'));
});
