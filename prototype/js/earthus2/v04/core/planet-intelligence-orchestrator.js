const DYNAMIC=new Set(['TOWER','FLOW','VOLUME','PULSE','TRACK']);
export function buildPlanetExecutionPlan({sceneProfile,layerManifest,deviceProfile,truthBudget}){
  if(!sceneProfile||!layerManifest||!deviceProfile||!truthBudget) throw new TypeError('sceneProfile/layerManifest/deviceProfile/truthBudget required');
  const primary=layerManifest.primaryEngine; const context=layerManifest.contextEngine??null; const warnings=[];
  if(deviceProfile.quality==='STATIC'&&DYNAMIC.has(primary)) warnings.push('PRIMARY_DYNAMIC_DEGRADED_TO_STATIC');
  if(truthBudget.allowedFidelity==='AGGREGATE_ONLY'&&primary==='TOWER') warnings.push('TOWER_AGGREGATE_ONLY');
  if(deviceProfile.quality==='LITE'&&primary==='VOLUME') warnings.push('VOLUME_DEGRADE_TO_SHELL');
  return Object.freeze({scene:sceneProfile.scene??sceneProfile.id,primaryEngine:primary,contextEngine:context,oneDynamicPrimary:true,quality:deviceProfile.quality,cloudMode:deviceProfile.cloudMode,fetchPolicy:deviceProfile.prefetchRadius>0?'VISIBLE_PLUS_PREFETCH':'VISIBLE_ONLY',warnings:Object.freeze(warnings),disposePreviousPrimary:true});
}
