import assert from 'node:assert/strict';
import fs from 'node:fs';
import http from 'node:http';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const prototypeRoot=path.join(root,'prototype');
const outputRoot=path.resolve(process.env.EARTHUS_V2_VISUAL_OUTPUT||path.join(root,'output/v2-real-living-earth-visual'));
const moduleRef=process.env.EARTHUS_PLAYWRIGHT_MODULE;
const playwright=moduleRef?await import(pathToFileURL(path.resolve(moduleRef)).href):await import('playwright');
const {chromium}=playwright;
const MIME={'.html':'text/html; charset=utf-8','.js':'text/javascript; charset=utf-8','.json':'application/json; charset=utf-8','.css':'text/css; charset=utf-8','.png':'image/png','.webp':'image/webp','.svg':'image/svg+xml','.jpg':'image/jpeg','.jpeg':'image/jpeg'};
const CLOUD_ORIGIN='https://earthus-cache-kr.s3.us-east-2.amazonaws.com';

function localServer(){
  return http.createServer(async(req,res)=>{
    let pathname;try{pathname=decodeURIComponent(new URL(req.url,'http://127.0.0.1').pathname)}catch(_){res.writeHead(400).end('bad request');return}
    if(pathname.startsWith('/clouds/')){
      try{const remote=await fetch(`${CLOUD_ORIGIN}${pathname}`,{cache:'no-store'});const body=Buffer.from(await remote.arrayBuffer());res.writeHead(remote.status,{'Content-Type':remote.headers.get('content-type')||'application/octet-stream','Cache-Control':'no-store','Access-Control-Allow-Origin':'*'});res.end(body)}catch(error){res.writeHead(502).end(String(error?.message||error))}return;
    }
    if(pathname==='/')pathname='/index.html';if(pathname==='/v2'||pathname==='/v2/')pathname='/v2/index.html';
    const target=path.resolve(prototypeRoot,`.${pathname}`);if(!target.startsWith(`${prototypeRoot}${path.sep}`)){res.writeHead(403).end('forbidden');return}
    fs.readFile(target,(error,body)=>{if(error){res.writeHead(error.code==='ENOENT'?404:500).end('not found');return}res.writeHead(200,{'Content-Type':MIME[path.extname(target)]||'application/octet-stream','Cache-Control':'no-store','Access-Control-Allow-Origin':'*'});res.end(body)});
  });
}
async function waitFor(page,fn,timeout=45000){const end=Date.now()+timeout;while(Date.now()<end){try{if(await page.evaluate(fn))return}catch(_){}await page.waitForTimeout(250)}throw new Error('V2_VISUAL_WAIT_TIMEOUT')}
async function pageState(page){return page.evaluate(()=>{
  const rt=window.__earthusV2,viewer=rt?.viewer,canvas=document.querySelector('.cesium-widget canvas'),fallback=document.querySelector('.fallback');let renderer=null,max3d=null;
  try{const gl=viewer?.scene?.context?._gl||canvas?.getContext('webgl2'),ext=gl?.getExtension('WEBGL_debug_renderer_info');renderer=ext?String(gl.getParameter(ext.UNMASKED_RENDERER_WEBGL)||''):String(gl?.getParameter(gl.RENDERER)||'');max3d=gl?Number(gl.getParameter(gl.MAX_3D_TEXTURE_SIZE)||0):null}catch(_){}
  const layers=[];if(viewer?.imageryLayers)for(let i=0;i<viewer.imageryLayers.length;i++){const l=viewer.imageryLayers.get(i),p=l.imageryProvider;layers.push({index:i,show:l.show,alpha:l.alpha,dayAlpha:l.dayAlpha,nightAlpha:l.nightAlpha,provider:p?.constructor?.name||null,ready:p?.ready??null,url:p?.url||p?._resource?.url||null})}
  return {sourceBadge:document.getElementById('earthusV2RealSources')?.textContent||null,dataC:document.documentElement.dataset.c||null,fallbackDisplay:fallback?getComputedStyle(fallback).display:null,cloudFidelity:rt?.realEarth?.cloudFidelity?.()||null,waterTruth:rt?.realEarth?.waterTruth?.()||null,trenchSample:rt?.realEarth?.trenchSample?.()||null,cameraHeight:viewer?.camera?.positionCartographic?.height??null,imageryLayers:viewer?.imageryLayers?.length??null,imageryLayerDetails:layers,primitives:viewer?.scene?.primitives?.length??null,globeTilesLoaded:viewer?.scene?.globe?.tilesLoaded??null,canvas:canvas?{cssWidth:canvas.clientWidth,cssHeight:canvas.clientHeight,width:canvas.width,height:canvas.height}:null,webgl2:!!canvas?.getContext('webgl2'),renderer,max3d}
})}
async function snapshot(page,cdp,name){const state=await pageState(page);await page.evaluate(()=>window.__earthusV2?.viewer?.scene?.requestRender?.());await page.waitForTimeout(250);const {data}=await cdp.send('Page.captureScreenshot',{format:'png',fromSurface:true,captureBeyondViewport:false});fs.writeFileSync(path.join(outputRoot,`${name}.png`),Buffer.from(data,'base64'));return state}

fs.mkdirSync(outputRoot,{recursive:true});
const server=localServer();await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));const port=server.address().port;
const browser=await chromium.launch({headless:true,args:['--use-gl=angle','--use-angle=swiftshader','--enable-webgl','--ignore-gpu-blocklist']});
const page=await browser.newPage({viewport:{width:1600,height:1000},deviceScaleFactor:1});page.setDefaultTimeout(60000);const cdp=await page.context().newCDPSession(page);
const pageErrors=[];page.on('pageerror',error=>pageErrors.push(String(error?.stack||error)));const consoleErrors=[];page.on('console',msg=>{if(msg.type()==='error')consoleErrors.push(msg.text())});
const responses=[],requestFailures=[];page.on('response',response=>{const url=response.url();if(/gibs\.earthdata\.nasa\.gov|arcgisonline\.com|elevation3d\.arcgis\.com|\/clouds\//.test(url)||response.status()>=400)responses.push({status:response.status(),url})});page.on('requestfailed',request=>requestFailures.push({url:request.url(),error:request.failure()?.errorText||null}));
const states={};
try{
  await page.goto(`http://127.0.0.1:${port}/v2/`,{waitUntil:'domcontentloaded',timeout:60000});
  await waitFor(page,()=>!!window.__earthusV2?.realEarth&&document.documentElement.dataset.c==='1',60000);
  await page.waitForTimeout(8000);states.earth=await snapshot(page,cdp,'01-earth');
  assert.equal(states.earth.fallbackDisplay,'none','CSS fallback globe is still covering Cesium');
  assert.match(states.earth.sourceBadge||'',/TERRAIN\/BATHY: Esri TopoBathy3D|TERRAIN: Esri Terrain3D/,'real terrain provider did not initialize');

  await page.evaluate(()=>window.__earthusV2.requestFeature('WEATHER','Clouds'));
  await waitFor(page,()=>['VOLUME','CTH_RELIEF'].includes(window.__earthusV2?.realEarth?.cloudFidelity?.()),60000);
  await page.waitForTimeout(5000);states.clouds=await snapshot(page,cdp,'02-clouds');
  assert.notEqual(states.clouds.cloudFidelity,'SHELL','3D cloud fidelity fell back to shell');

  await page.evaluate(()=>window.__earthusV2.requestFeature('OCEAN','Bathymetry / Trench'));
  await waitFor(page,()=>Number(window.__earthusV2?.realEarth?.trenchSample?.()?.depthM)>0,45000);
  await page.waitForTimeout(3000);states.trench=await snapshot(page,cdp,'03-trench');
  assert.ok(states.trench.trenchSample?.depthM>0,'real trench depth sample unavailable');

  await page.evaluate(()=>window.__earthusV2.requestFeature('OCEAN','Underwater'));
  await waitFor(page,()=>Number(window.__earthusV2?.viewer?.camera?.positionCartographic?.height)<-100,45000);
  await page.waitForTimeout(3000);states.underwater=await snapshot(page,cdp,'04-underwater');
  assert.ok(states.underwater.cameraHeight<-100,'underwater camera did not enter below 0m');
  assert.equal(pageErrors.length,0,`page errors: ${pageErrors.join('\n')}`);
  fs.writeFileSync(path.join(outputRoot,'state.json'),JSON.stringify({ok:true,states,pageErrors,consoleErrors,responses:responses.slice(-300),requestFailures:requestFailures.slice(-100)},null,2));
  console.log('V2 REAL LIVING EARTH BROWSER VISUAL: PASS');console.log(JSON.stringify(states,null,2));
}catch(error){if(!states.failure)try{states.failure=await pageState(page)}catch(_){}fs.writeFileSync(path.join(outputRoot,'state.json'),JSON.stringify({ok:false,error:String(error?.stack||error),states,pageErrors,consoleErrors,responses:responses.slice(-300),requestFailures:requestFailures.slice(-100)},null,2));try{const {data}=await cdp.send('Page.captureScreenshot',{format:'png',fromSurface:true,captureBeyondViewport:false});fs.writeFileSync(path.join(outputRoot,'99-failure.png'),Buffer.from(data,'base64'))}catch(_){}throw error
}finally{await browser.close();await new Promise(resolve=>server.close(resolve))}
