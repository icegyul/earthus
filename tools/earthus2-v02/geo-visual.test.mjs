import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

import {
  normalizeLongitude, unwrapLongitudes, geometryBounds, geometryCentroid, pointInGeometry, geometryApproxDiameterM,
  buildCountryFocus, countryFocusReadiness, selectTerrainSources, screenSpaceError, selectTerrainLod,
  verticalExaggeration, terrainTileBudget, bathymetryLevelPolicy, depthVisualScale, morphTerrainValue, morphAnimationPlan,
  validateVisualManifest, createVisualManifest, validateOneDataHero, lintVisualSemantics, visualSemanticPass,
  towerVisual, massPreservingAllocation, towerPoolPlan, sampleVectorGrid, advectNormalized, flowRenderBudget,
  volumeRenderPolicy, shellLayerOpacity, buildScenePlan,
  EVIDENCE_KIND, SCENE_MODE, THERMAL_STATE, TIME_MODE, VISUAL_ENGINE,
} from '../../prototype/js/earthus2/v02/index.js';

const antimeridian = JSON.parse(fs.readFileSync(new URL('../../fixtures/earthus2-v02/country-antimeridian.geojson', import.meta.url), 'utf8'));

test('longitude normalizes', () => assert.equal(normalizeLongitude(190), -170));
test('longitude unwrap follows short path', () => assert.deepEqual(unwrapLongitudes([179,-179]), [179,181]));
test('antimeridian bounds choose small span', () => assert.ok(geometryBounds(antimeridian).longitudeSpanDeg <= 2));
test('geometry centroid remains near dateline', () => assert.ok(Math.abs(geometryCentroid(antimeridian).lon) >= 179));
test('point in antimeridian polygon works', () => assert.equal(pointInGeometry({lon:180,lat:0},antimeridian), true));
test('geometry diameter is positive', () => assert.ok(geometryApproxDiameterM(antimeridian) > 0));

test('country focus creates finite camera and dimming', () => {
  const focus = buildCountryFocus({countryId:'DATELINE',geometry:antimeridian});
  assert.ok(focus.camera.heightM > 0);
  assert.equal(focus.clipping.requestOnlyIntersectingTiles, true);
});

test('country readiness exposes blockers', () => assert.deepEqual([...countryFocusReadiness({geometryReady:true}).failed].sort(), ['licenseReady','performanceReady','sourceReady','terrainReady','visualReady'].sort()));

test('terrain broker prefers best eligible source', () => {
  const result = selectTerrainSources({request:{regionId:'KR',zoom:7,targetResolutionM:30,verticalDatum:'EGM96'},sources:[
    {id:'GLOBAL',coverage:['GLOBAL'],health:'HEALTHY',rights:{display:true},resolutionM:90,seamless:true,verticalDatum:'EGM96',priority:0.6},
    {id:'KR5M',coverage:['KR'],health:'HEALTHY',rights:{display:true},resolutionM:5,seamless:true,verticalDatum:'EGM96',priorityByRegion:{KR:1}},
  ]});
  assert.equal(result.primary, 'KR5M');
});

test('terrain SSE decreases with distance', () => assert.ok(screenSpaceError({geometricErrorM:100,distanceM:1000,viewportHeightPx:1000,verticalFovDeg:60}) > screenSpaceError({geometricErrorM:100,distanceM:10000,viewportHeightPx:1000,verticalFovDeg:60})));

test('terrain LOD respects tile budget', () => {
  const level = selectTerrainLod({levels:[{level:0,geometricErrorM:500,estimatedTiles:5},{level:1,geometricErrorM:10,estimatedTiles:500}],distanceM:100000,viewportHeightPx:800,verticalFovDeg:60,targetSse:5,tileBudget:50});
  assert.equal(level.level, 0);
});

test('real terrain exaggeration is one', () => assert.equal(verticalExaggeration({cameraHeightM:1000000,mode:'REAL'}),1));
test('mobile SAFE terrain budget is bounded', () => assert.equal(terrainTileBudget({deviceClass:'mobile',thermalState:'SAFE'}),40));
test('bathymetry level 3 is blocked on mobile', () => assert.equal(bathymetryLevelPolicy({level:3,deviceClass:'mobile',sourceResolutionM:15}).allowed,false));
test('depth visual scale is monotonic', () => assert.ok(depthVisualScale(-10000)>depthVisualScale(-100)));
test('terrain-data morph is bounded', () => assert.ok(morphTerrainValue({terrainElevationM:100,normalizedData:1,mix:1,reliefScaleM:1000,maxVisualElevationM:500})<=500));
test('reduced motion collapses duration', () => assert.ok(morphAnimationPlan({reducedMotion:true}).durationSec<0.1));

const manifest = {
  layerId:'tourism',scene:SCENE_MODE.URBAN,primaryEngine:VISUAL_ENGINE.TOWER,contextEngine:VISUAL_ENGINE.BEACON,
  timeModes:[TIME_MODE.LIVE,TIME_MODE.FORECAST],evidenceKinds:[EVIDENCE_KIND.OFFICIAL_OBSERVATION,EVIDENCE_KIND.PROVIDER_FORECAST],
  maxLabelsMobile:5,maxLabelsDesktop:8,sourceIds:['SEOUL_RTD'],thermalFallback:THERMAL_STATE.ECO,
};

test('valid visual manifest passes', () => assert.deepEqual(validateVisualManifest(manifest),[]));
test('create visual manifest adds schema', () => assert.equal(createVisualManifest(manifest).schemaVersion,'earthus.visual-manifest.v2.0'));
test('one data hero rejects two primaries', () => assert.equal(validateOneDataHero({activePrimaryEngines:['A','B'],activeContextEngines:[]}).length,1));
test('semantic linter reserves red for official risk', () => assert.equal(visualSemanticPass(lintVisualSemantics(manifest,{accentRole:'RED'})),false));
test('semantic linter blocks fabricated fine tower grid', () => assert.ok(lintVisualSemantics(manifest,{fineGrid:true,actualGrid:false}).some((x)=>x.code==='FABRICATED_SPATIAL_PRECISION')));

test('tower visual uses bounded log mapping', () => {
  const result = towerVisual(100,[1,5,10,100]);
  assert.ok(result.heightM<=680 && result.heightM>=12);
});

test('mass allocation preserves rounded total', () => assert.equal(massPreservingAllocation({total:101,cells:['a','b','c'],weights:[1,1,1]}).reduce((sum,x)=>sum+x.value,0),101));
test('tower pool uses mobile budget', () => assert.equal(towerPoolPlan({visibleCount:2000,deviceClass:'mobile'}).renderCount,900));

test('flow sampling interpolates vector', () => assert.deepEqual(sampleVectorGrid({width:2,height:2,u:[1,1,1,1],v:[2,2,2,2]},0.5,0.5),{u:1,v:2}));
test('flow advection remains normalized', () => { const result=advectNormalized({x:0.5,y:0.5},{width:2,height:2,u:[1,1,1,1],v:[0,0,0,0]},1,0.1); assert.ok(result.x<=1); });
test('flow SAFE budget is zero', () => assert.equal(flowRenderBudget({thermalState:'SAFE'}).maxParticles,0));

test('mobile volume uses three shells', () => assert.equal(volumeRenderPolicy({deviceClass:'mobile',confidence:1,uncertainty:0,horizonHours:0}).mode,'THREE_SHELL'));
test('shell opacity combines layers', () => assert.ok(shellLayerOpacity({low:0.5,mid:0.5,high:0.5}).total>0.5));
test('scene plan blocks mobile flow plus volume context', () => assert.throws(()=>buildScenePlan({scene:'OCEAN',primaryEngine:'FLOW',contextEngine:'VOLUME',deviceClass:'mobile'}),/contextEngine must be static/));
