/* EARTHUS V2 — camera-aware visual fidelity controller.
 * It changes presentation/LOD only. Provider truth, terrain elevations and cloud heights are untouched.
 */
const clamp=(v,a=0,b=1)=>Math.max(a,Math.min(b,v));
const smooth=(a,b,x)=>{const t=clamp((x-a)/Math.max(1e-9,b-a));return t*t*(3-2*t)};
function providerUrl(provider){return String(provider?._resource?.url||provider?._url||provider?.url||'')}
function findEsriDetail(viewer){for(let i=0;i<viewer.imageryLayers.length;i++){const l=viewer.imageryLayers.get(i);if(/World_Imagery\/MapServer/i.test(providerUrl(l?.imageryProvider)))return l}return null}
function findShadow(viewer,C){for(let i=viewer.imageryLayers.length-1;i>=0;i--){const l=viewer.imageryLayers.get(i),p=l?.imageryProvider;if(p instanceof C.SingleTileImageryProvider)return l}return null}
function findCloudShell(viewer,C){const list=viewer.scene.primitives;for(let i=0;i<list.length;i++){const p=list.get(i),a=p?.appearance;if(a instanceof C.EllipsoidSurfaceAppearance&&a?.material?.type==='Image')return p}return null}
export function installVisualFidelityController({runtime=null}={}){
  if(globalThis.__earthusV2VisualFidelityController)return globalThis.__earthusV2VisualFidelityController;
  const root=globalThis.__earthusV2,real=runtime||root?.realEarth,viewer=root?.viewer,C=globalThis.Cesium;if(!real||!viewer||!C)throw new Error('V2_VISUAL_FIDELITY_RUNTIME_REQUIRED');
  const scene=viewer.scene,originalGlobeShow=scene.globe.show;let detail=null,shadow=null,shell=null,disposed=false;
  function update(){if(disposed||viewer.isDestroyed?.())return;const cart=viewer.camera.positionCartographic;if(!cart)return;const h=Number(cart.height||0),lat=Math.abs(C.Math.toDegrees(cart.latitude||0)),terrain=real.terrainTruth?.(),fidelity=real.cloudFidelity?.();detail=detail||findEsriDetail(viewer);shadow=shadow||findShadow(viewer,C);shell=shell||findCloudShell(viewer,C);
    if(detail){const base=.035+.965*(1-smooth(1_500_000,8_500_000,h)),polarFade=1-smooth(70,82.2,lat);if(terrain==='ESRI_TOPOBATHY3D'&&h<500_000)detail.alpha=Math.min(.08,base);else detail.alpha=base*polarFade}
    if(shell){if(fidelity!=='SHELL'){shell.show=false}else{const a=h<=220_000?0:h<600_000?.08+.22*smooth(220_000,600_000,h):h<1_800_000?.30+.38*smooth(600_000,1_800_000,h):.68+.22*smooth(1_800_000,5_000_000,h);shell.show=a>.025;const color=shell.appearance?.material?.uniforms?.color;if(color)shell.appearance.material.uniforms.color=C.Color.WHITE.withAlpha(clamp(a,0,.9))}}
    if(shadow){const a=h<=180_000?0:h<700_000?.03+.08*smooth(180_000,700_000,h):.11+.11*smooth(700_000,3_000_000,h);shadow.alpha=clamp(a,0,.22);shadow.show=a>.01&&fidelity==='SHELL'}
    const underwater=h<-100;scene.globe.show=underwater?false:originalGlobeShow;scene.requestRender();
  }
  const removeChanged=viewer.camera.changed.addEventListener(update),removePost=scene.postRender.addEventListener(update);const timer=setInterval(update,900);update();
  const controller=Object.freeze({update,dispose(){if(disposed)return;disposed=true;clearInterval(timer);try{removeChanged?.()}catch(_){}try{removePost?.()}catch(_){}scene.globe.show=originalGlobeShow;globalThis.__earthusV2VisualFidelityController=null}});globalThis.__earthusV2VisualFidelityController=controller;return controller;
}
export async function installWhenReady({timeoutMs=30000}={}){const start=Date.now();while(Date.now()-start<timeoutMs){if(globalThis.__earthusV2?.realEarth&&globalThis.__earthusV2?.viewer)return installVisualFidelityController();await new Promise(r=>setTimeout(r,100))}throw new Error('V2_VISUAL_FIDELITY_BOOT_TIMEOUT')}
