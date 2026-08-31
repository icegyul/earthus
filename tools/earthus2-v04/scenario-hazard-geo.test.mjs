import test from 'node:test'; import assert from 'node:assert/strict';
import { buildTrenchCameraLevel2 } from '../../prototype/js/earthus2/v04/geo/trench-camera.js';
import { compileRiverVisualNetwork } from '../../prototype/js/earthus2/v04/hydrology/river-visual-network.js';
import { clusterForecastScenarios } from '../../prototype/js/earthus2/v04/weather/forecast-scenario-cluster.js';
import { reconcileForecasts } from '../../prototype/js/earthus2/v04/weather/forecast-reconciliation.js';
import { fuseAgencyEvents } from '../../prototype/js/earthus2/v04/hazards/event-fusion.js';

test('trench level2 does not submerge camera',()=>assert.equal(buildTrenchCameraLevel2({target:{lon:140,lat:35,depthM:-9000}}).cameraSubmerged,false));
test('trench rejects positive depth',()=>assert.throws(()=>buildTrenchCameraLevel2({target:{lon:1,lat:1,depthM:10}})));
test('river direction omitted without verified evidence',()=>assert.equal(compileRiverVisualNetwork({segments:[{id:'r',streamOrder:4,geometry:{},direction:'E'}]}).segments[0].direction,null));
test('scenario cluster member probabilities sum to one',()=>{const r=clusterForecastScenarios([{id:'a',values:[0,0]},{id:'b',values:[.1,.1]},{id:'c',values:[10,10]}],{k:2});assert.ok(Math.abs(r.clusters.reduce((s,c)=>s+c.probability,0)-1)<1e-9);});
test('reconciliation never overrides official',()=>assert.equal(reconcileForecasts({official:{value:10},ensemble:{value:20},earthus:{value:20},persistenceRuns:3,calibrationQualified:true}).officialOverridden,false));
test('early signal needs calibration',()=>assert.equal(reconcileForecasts({official:{value:10},ensemble:{value:20},earthus:{value:20},persistenceRuns:3,calibrationQualified:false}).earlySignal,false));
test('hazard fusion preserves agency events',()=>{const r=fuseAgencyEvents([{agency:'A',eventId:'1',type:'QUAKE',issuedAt:'2026-01-01T00:00:00Z',lat:35,lon:127,level:'M5'},{agency:'B',eventId:'2',type:'QUAKE',issuedAt:'2026-01-01T00:10:00Z',lat:35.1,lon:127.1,level:'M5'}]);assert.equal(r[0].agencyEventIds.length,2);assert.equal(r[0].officialValuesAveraged,false);});
