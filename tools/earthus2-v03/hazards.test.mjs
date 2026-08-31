import test from 'node:test'; import assert from 'node:assert/strict';
import { mergeOfficialWarnings } from '../../prototype/js/earthus2/v03/hazards/warning-engine.js';
import { earthquakeDepthVisual,clusterSeismicEvents } from '../../prototype/js/earthus2/v03/hazards/earthquake-depth.js';
import { createTsunamiAlertState } from '../../prototype/js/earthus2/v03/hazards/tsunami-alert.js';
import { clusterLightning,trackLightningCells } from '../../prototype/js/earthus2/v03/hazards/lightning-track.js';
import { clusterHotspots } from '../../prototype/js/earthus2/v03/hazards/wildfire-smoke.js';
import { resolveCycloneTracks } from '../../prototype/js/earthus2/v03/hazards/cyclone-resolver.js';

test('official warning wins over nonofficial',()=>{const r=mergeOfficialWarnings([{sourceId:'x',issuedAt:'2026-01-01T00:00:00Z',hazardType:'rain',severity:'EMERGENCY',official:false},{sourceId:'kma',issuedAt:'2026-01-01T00:00:00Z',hazardType:'rain',severity:'WARNING',official:true}],{nowAt:'2026-01-01T00:01:00Z'});assert.equal(r.primary.sourceId,'kma');});
test('quake depth moves below earth surface',()=>assert.ok(earthquakeDepthVisual({depthKm:10}).displayRadiusM<6371008.8));
test('seismic clustering is context label',()=>assert.equal(clusterSeismicEvents([{lat:37,lon:127,at:'2026-01-01T00:00:00Z'}])[0].interpretation,'SPATIOTEMPORAL_CONTEXT_NOT_AFTERSHOCK_PREDICTION'));
test('tsunami state keeps simulation null',()=>assert.equal(createTsunamiAlertState({officialAlerts:[]}).simulation,null));
test('lightning cluster returns a cell',()=>assert.equal(clusterLightning([{lat:37,lon:127},{lat:37.01,lon:127.01}]).length,1));
test('lightning tracker only links nearby',()=>{const p=clusterLightning([{lat:37,lon:127}]);const c=clusterLightning([{lat:37.1,lon:127.1}]);assert.ok(trackLightningCells(p,c,{maxKm:60})[0].previousCellId);});
test('hotspot cluster is not perimeter',()=>assert.equal(clusterHotspots([{lat:37,lon:127,at:'2026-01-01T00:00:00Z'}])[0].meaning,'HOTSPOT_CLUSTER_NOT_BURN_PERIMETER'));
test('Korea cyclone resolver prioritizes KMA',()=>assert.equal(resolveCycloneTracks([{agency:'JMA',points:[]},{agency:'KMA',points:[]}],{region:'KOREA'}).primary.agency,'KMA'));
