import test from 'node:test';
import assert from 'node:assert/strict';
import {TOP_MENU, canAutoCompose, resolveSceneRecipe, SceneStateStore, GenerationGuard, SceneTransactionCoordinator, MenuController} from '../../prototype/js/earthus2/frontend-v10/runtime/index.js';
import {FEATURE_DEFS,getFeature,featuresForMenu} from '../../prototype/js/earthus2/integration-v10/feature-registry.js';
import {LegacyLayerBridge} from '../../prototype/js/earthus2/integration-v10/legacy-layer-bridge.js';
import {FeatureStateStore} from '../../prototype/js/earthus2/integration-v10/feature-state-store.js';
import {EarthusV2AppController} from '../../prototype/js/earthus2/integration-v10/app-controller.js';
import {RuntimeEvidenceRecorder} from '../../prototype/js/earthus2/integration-v10/runtime-evidence.js';
import {EarthusSceneRuntimeAdapter} from '../../prototype/js/earthus2/integration-v10/scene-runtime-adapter.js';

const known=['clouds','temp','humidity','rain','pressure','tpw','wind','windfc','pm25','pm10','aqi','ozone','dust','uv','sst','sstanom','wave','swell','current','cyclone','quake','tsunami','wildfire','lightning','tourism','poi','aurora','orbits'];
function fakeStore(){const layers=Object.fromEntries(known.map(id=>[id,false]));return {layers,scene:'earth',setLayer(id,v){if(!(id in layers))return;layers[id]=!!v;},setScene(next){this.scene=next;}};}
function harness(){const store=fakeStore();const bridge=new LegacyLayerBridge({store});const sceneState=new SceneStateStore();const featureState=new FeatureStateStore();const guard=new GenerationGuard();const runtime=new EarthusSceneRuntimeAdapter({legacyStore:store});const tx=new SceneTransactionCoordinator({runtime,store:sceneState,guard});const menu=new MenuController({transaction:tx});const evidence=new RuntimeEvidenceRecorder();const app=new EarthusV2AppController({menuController:menu,bridge,featureState,sceneState,evidence});return{store,bridge,sceneState,featureState,app};}

test('registry has seven menu families represented',()=>{for(const menu of Object.values(TOP_MENU))assert.ok(menu===TOP_MENU.EARTH||featuresForMenu(menu).length>0);});
test('current scalar is FIELD, never FLOW',()=>assert.equal(getFeature('ocean.surface-speed').renderer,'FIELD'));
test('pulse features own no legacy render layer',()=>{for(const d of featuresForMenu('PULSE'))assert.equal(d.legacyLayerIds.length,0);});
test('space remains exclusive in scene recipe',()=>{const r=resolveSceneRecipe({type:'TOP_MENU_SELECT',menu:'SPACE'});assert.equal(r.cesiumSuspended,true);assert.equal(r.secondary,null);});
test('only approved cross-domain contexts auto-compose',()=>{assert.equal(canAutoCompose('HAZARD','WEATHER'),true);assert.equal(canAutoCompose('WEATHER','OCEAN'),false);});
test('feature bridge activates exactly its mapped layer',async()=>{const{store,bridge}=harness();await bridge.activate('weather.temperature');assert.equal(store.layers.temp,true);assert.deepEqual(bridge.snapshot().ownedLayers,['temp']);});
test('feature bridge switches primary without leaving old layer on',async()=>{const{store,bridge}=harness();await bridge.activate('weather.temperature');await bridge.activate('weather.wind');assert.equal(store.layers.temp,false);assert.equal(store.layers.wind,true);assert.deepEqual(bridge.snapshot().ownedLayers,['wind']);});
test('EARTH clears only v2-owned layers',async()=>{const{store,bridge,app}=harness();store.layers.quake=true;await app.selectFeature('weather.wind');await app.selectMenu('EARTH');assert.equal(store.layers.wind,false);assert.equal(store.layers.quake,true);assert.equal(bridge.snapshot().ownedLayers.length,0);});
test('unknown/missing legacy layer fails closed',async()=>{const store=fakeStore();delete store.layers.temp;const bridge=new LegacyLayerBridge({store});await assert.rejects(()=>bridge.activate('weather.temperature'),/missing/);});
test('orchestrator-only pulse feature does not invent a layer',async()=>{const{store,bridge}=harness();await bridge.activate('pulse.news');assert.equal(bridge.snapshot().ownedLayers.length,0);assert.equal(Object.values(store.layers).some(Boolean),false);});
test('app menu transition clears feature state',async()=>{const{app}=harness();await app.selectFeature('weather.wind');assert.equal(app.snapshot().features.primary,'weather.wind');await app.selectMenu('OCEAN');assert.equal(app.snapshot().features.primary,null);});
test('space transition records actual legacy scene state only',async()=>{const{store,app}=harness();await app.selectMenu('SPACE');assert.equal(store.scene,'space');await app.selectMenu('EARTH');assert.equal(store.scene,'earth');});
test('feature registry ids are unique',()=>assert.equal(new Set(FEATURE_DEFS.map(x=>x.id)).size,FEATURE_DEFS.length));

test('50-cycle menu switching leaves quiet EARTH clean',async()=>{const{app,bridge}=harness();const order=['WEATHER','OCEAN','HUMAN','HAZARD','PULSE','EARTH'];for(let i=0;i<50;i++)for(const menu of order)await app.selectMenu(menu);assert.equal(app.snapshot().scene.menu,'EARTH');assert.equal(app.snapshot().features.primary,null);assert.equal(bridge.snapshot().ownedLayers.length,0);});
