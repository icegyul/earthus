/* EARTHUS V2 — camera-aware visual fidelity controller.
 * Presentation/LOD only. Provider truth, terrain elevations and cloud heights are untouched.
 */
const clamp=(v,a=0,b=1)=>Math.max(a,Math.min(b,v));
const smooth=(a,b,x)=>{const t=clamp((x-a)/Math.max(1e-9,b-a));return t*t*(3-2*t)};
function providerUrl(provider){return String(provider?._resource?.url||provider?._url||provider?.url||'')}
function allLayers(viewer){const out=[];for(let i=0;i<viewer.imageryLayers.length;i++)out.push(viewer.imageryLayers.get(i));return out}
function findEsriDetail(viewer){return allLayers(viewer).find(l=>/World_Imagery\/MapServer/i.test(providerUrl(l?.imageryProvider)))||null}
function findNasaLayers(viewer){return allLayers(viewer).filter(l=>/gibs\.earthdata\.nasa\.gov/i.test(providerUrl(l?.imageryProvider)))}
function findShadow(viewer,C){for(let i=viewer.imageryLayers.length-1;i>=0;i--){const l=viewer.imageryLayers.get(i),p=l?.imageryProvider;if(p instanceof C.SingleTileImageryProvider)return l}return null}
function findCloudShell(viewer,C){const list=viewer.scene.primitives;for(let i=0;i<list.length;i++){const p=list.get(i),a=p?.appearance;if(a instanceof C.EllipsoidSurfaceAppearance&&a?.material?.type==='Image')return p}return null}
function shellAlpha(heightM){if(heightM<=220_000)return 0;if(heightM<600_000)return .08+.22*smooth(220_000,600_000,heightM);if(heightM<1_800_000)return .30+.38*smooth(600_000,1_800_000,heightM);return .68+.22*smooth(1_800_000,5_000_000,heightM)}
function shadowAlpha(heightM){if(heightM<=180_000)return 0;if(heightM<700_000)return .03+.08*smooth(180_000,700_000,heightM);return .11+.11*smooth(700_000,3_000_000,heightM)}
export function installVisualFidelityController({runtime=null}={}){
  if(globalThis.__earthusV2VisualFidelityController)return globalThis.__earthusV2VisualFidelityController;
  const root=globalThis.__earthusV2,real=runtime||root?.realEarth,viewer=root?.viewer,C=globalThis.Cesium;if(!real||!viewer||!C)throw new Error('V2_VISUAL_FIDELITY_RUNTIME_REQUIRED');
  const scene=viewer.scene,originalGlobeShow=scene.globe.show,originalBackground=scene.backgroundColor,layerRestore=new Map();let detail=null,nasaLayers=[],shadow=null,shell=null,disposed=false,underwaterAdjusted=false,closeSurfaceLod=false;
  function rememberLayer(layer){if(layer&&!layerRestore.has(layer))layerRestore.set(layer,{show:layer.show,alpha:layer.alpha})}
  function restoreSurfaceLayers(){if(!closeSurfaceLod)return;for(const [layer,state] of layerRestore){if(!layer)continue;layer.show=state.show;layer.alpha=state.alpha}closeSurfaceLod=false}
  function applySurfaceDetailLod({heightM,latAbs,terrain}){detail=detail||findEsriDetail(viewer);nasaLayers=nasaLayers.length?nasaLayers:findNasaLayers(viewer);const close=terrain==='ESRI_TERRAIN3D'&&heightM>0&&heightM<320_000&&latAbs<70;if(close){if(detail){rememberLayer(detail);detail.show=true;detail.alpha=1}for(const layer of nasaLayers){rememberLayer(layer);layer.show=false}closeSurfaceLod=true;return true}restoreSurfaceLayers();return false}
  function aimAtActualDeepest(meta){const d=meta?.deepestCoordinate;if(!d||![d.longitudeDeg,d.latitudeDeg,d.heightM].every(Number.isFinite))return false;const cameraHeight=clamp(d.heightM+9000,-2200,-900),destination=C.Cartesian3.fromDegrees(d.longitudeDeg-.12,d.latitudeDeg-.15,cameraHeight),target=C.Cartesian3.fromDegrees(d.longitudeDeg,d.latitudeDeg,d.heightM),direction=C.Cartesian3.normalize(C.Cartesian3.subtract(target,destination,new C.Cartesian3()),new C.Cartesian3()),surfaceUp=C.Ellipsoid.WGS84.geodeticSurfaceNormal(destination,new C.Cartesian3()),right=C.Cartesian3.normalize(C.Cartesian3.cross(direction,surfaceUp,new C.Cartesian3()),new C.Cartesian3()),up=C.Cartesian3.normalize(C.Cartesian3.cross(right,direction,new C.Cartesian3()),new C.Cartesian3());viewer.camera.setView({destination,orientation:{direction,up}});scene.requestRender();return true}
  function update(){if(disposed||viewer.isDestroyed?.())return;const cart=viewer.camera.positionCartographic;if(!cart)return;const h=Number(cart.height||0),lat=Math.abs(C.Math.toDegrees(cart.latitude||0)),terrain=real.terrainTruth?.(),fidelity=real.cloudFidelity?.();shadow=shadow||findShadow(viewer,C);shell=shell||findCloudShell(viewer,C);const closeSurface=applySurfaceDetailLod({heightM:h,latAbs:lat,terrain});
    if(detail&&!closeSurface){const base=.035+.965*(1-smooth(1_500_000,8_500_000,h)),polarFade=1-smooth(70,82.2,lat);if(terrain==='ESRI_TOPOBATHY3D'&&h<500_000)detail.alpha=Math.min(.08,base);else detail.alpha=base*polarFade}
    if(shell){if(fidelity!=='SHELL'){shell.show=false}else{const a=shellAlpha(h);shell.show=a>.025;const color=shell.appearance?.material?.uniforms?.color;if(color)shell.appearance.material.uniforms.color=C.Color.WHITE.withAlpha(clamp(a,0,.9))}}
    if(shadow){const a=shadowAlpha(h);shadow.alpha=clamp(a,0,.22);shadow.show=a>.01&&fidelity==='SHELL'}
    const underwater=h<-100;if(underwater){restoreSurfaceLayers();scene.globe.show=false;scene.backgroundColor=C.Color.fromCssColorString('#01070b');if(!underwaterAdjusted)underwaterAdjusted=aimAtActualDeepest(real.trenchMeshTruth?.())}else{scene.globe.show=originalGlobeShow;scene.backgroundColor=originalBackground;underwaterAdjusted=false}scene.requestRender();
  }
  const removeChanged=viewer.camera.changed.addEventListener(update),removePost=scene.postRender.addEventListener(update);const timer=setInterval(update,900);update();
  const controller=Object.freeze({update,dispose(){if(disposed)return;disposed=true;clearInterval(timer);restoreSurfaceLayers();try{removeChanged?.()}catch(_){}try{removePost?.()}catch(_){}scene.globe.show=originalGlobeShow;scene.backgroundColor=originalBackground;globalThis.__earthusV2VisualFidelityController=null}});globalThis.__earthusV2VisualFidelityController=controller;return controller;
}
export async function installWhenReady({timeoutMs=30000}={}){const start=Date.now();while(Date.now()-start<timeoutMs){if(globalThis.__earthusV2?.realEarth&&globalThis.__earthusV2?.viewer)return installVisualFidelityController();await new Promise(r=>setTimeout(r,100))}throw new Error('V2_VISUAL_FIDELITY_BOOT_TIMEOUT')}
