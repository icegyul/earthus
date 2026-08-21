import assert from 'node:assert/strict'; import { readFile } from 'node:fs/promises';
const source=await readFile(new URL('../prototype/js/v8/ocean-engine.js',import.meta.url),'utf8');
const ocean=await import(`data:text/javascript;base64,${Buffer.from(source).toString('base64')}`);
const dataset={datasetId:'demo-current',unit:'m/s',levels:[{value:0,native:true},{value:-100,native:true},{value:-500,native:false}],sourceRefs:['src_demo_ocean']};
const layer=ocean.buildOceanFlowLayer(dataset,{depth:-500});
assert.equal(layer.vertical.native,false); assert.equal(layer.followMeaning,'VISUAL_ADVECTION_NOT_PREDICTED_TRAJECTORY'); assert.equal(layer.renderer,'FLOW');
assert.throws(()=>ocean.buildOceanFlowLayer(dataset,{depth:-250}),/unavailable depth/);
assert.throws(()=>ocean.buildOceanFlowLayer({...dataset,unit:'knots'},{depth:0}),/m\/s/);
console.log('EARTHUS v8 ocean engine: PASS');
