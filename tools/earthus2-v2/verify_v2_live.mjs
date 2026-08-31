#!/usr/bin/env node
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'../..');
const base=new URL(process.env.EARTHUS_V2_LIVE_URL || 'https://earthus.net/v2/');
const assets=[
  ['index.html','text/html'],['app.css','text/css'],['app.js','text/javascript'],
  ['../js/earthus2/integration-v10/bootstrap.js','text/javascript'],
  ['../js/earthus2/integration-v10/feature-registry.js','text/javascript'],
  ['../js/earthus2/config/wiring-manifest.v1.json','application/json'],
];
const digest=b=>createHash('sha256').update(b).digest('hex');
for(const [rel,mime] of assets){
  const liveUrl=new URL(rel,base);const localPath=rel.startsWith('../js/')?path.join(root,'prototype',rel.replace(/^\.\.\//,'')):path.join(root,'prototype','v2',rel);
  const [local,res]=await Promise.all([readFile(localPath),fetch(liveUrl,{cache:'no-store'})]);
  assert.equal(res.status,200,`${liveUrl} HTTP ${res.status}`);assert.match(res.headers.get('content-type')||'',new RegExp(`^${mime.replace('/','\\/')}`));
  const live=Buffer.from(await res.arrayBuffer());assert.equal(digest(live),digest(local),`${rel} live/local SHA mismatch`);
}
console.log(`v2 asset bytes: PASS (${assets.length}/${assets.length})`);

async function loadPlaywright(){
  const candidates=[process.env.EARTHUS_PLAYWRIGHT_MODULE,
    '/Users/fiftyfy14/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright/index.mjs',
  ].filter(Boolean);
  for(const candidate of candidates){try{return await import(pathToFileURL(candidate).href);}catch(_) {}}
  try{return await import('playwright');}catch(error){throw new Error(`Playwright unavailable; asset verification passed but browser evidence is BLOCKED: ${error.message}`);}
}
const {chromium}=await loadPlaywright();
const executablePath=process.env.EARTHUS_CHROME || '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const browser=await chromium.launch({headless:true,executablePath});
try{
  for(const vp of [{name:'desktop',width:1280,height:720},{name:'mobile',width:390,height:844}]){
    const context=await browser.newContext({viewport:{width:vp.width,height:vp.height}});const page=await context.newPage();const errors=[];
    page.on('console',msg=>{if(msg.type()==='error')errors.push(msg.text())});page.on('pageerror',e=>errors.push(e.message));
    await page.goto(base.href,{waitUntil:'domcontentloaded',timeout:30_000});
    await page.waitForFunction(()=>window.__earthusV2 && window.__earthusViewer,{timeout:30_000});
    const result=await page.evaluate(async()=>{
      const first=window.__earthusViewer;const stress=await window.__earthusV2.stress({cycles:50});
      return {sameViewer:first===window.__earthusViewer,stress,snapshot:window.__earthusV2.snapshot(),viewerCount:document.querySelectorAll('.cesium-viewer').length};
    });
    assert.equal(result.sameViewer,true);assert.ok(result.viewerCount<=1,`viewer DOM count ${result.viewerCount}`);assert.equal(result.stress.final.scene.menu,'EARTH');assert.equal(result.stress.bridge?.ownedLayers?.length??0,0);assert.deepEqual(errors,[],`${vp.name} console/page errors`);
    const out=path.join(root,'artifacts',`v2-${vp.name}.png`);await page.screenshot({path:out,fullPage:true});console.log(`${vp.name}: PASS → ${out}`);await context.close();
  }
} finally {await browser.close();}
