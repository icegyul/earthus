import { AdaptiveCloudRuntime } from '../cloud-runtime-v01/adaptive-cloud-runtime.js';
import { CloudReliefRuntime } from '../cloud-runtime-v01/cloud-relief-runtime.js';
import { RegionalCloudShellRuntime } from '../cloud-runtime-v01/cesium-cloud-shell.js';
import { CesiumWebGpuCameraBridge } from '../cloud-runtime-v01/cesium-webgpu-camera-bridge.js';
import { WebGpuCloudVolumeRenderer, webgpuAvailable } from '../cloud-runtime-v01/webgpu-volume-renderer.js';
import { chooseCloudGpuBudget } from './cloud-quality-policy.js';
import { validateCanonicalCloudState, volumeEligibility } from './cloud-state-contract.js';

export async function attachEarthusCloudEngineV02({Cesium=globalThis.Cesium,viewer=globalThis.__earthusViewer,shell=null,relief=null,volume=null,getDeviceContext=()=>({deviceClass:'desktop',thermalState:'NORMAL'}),getCameraHeightM=()=>viewer?.scene?.camera?.positionCartographic?.height??Infinity,userRequestedCloudDetail=()=>false}={}){
  if(!Cesium)throw new Error('EARTHUS_CLOUD_BLOCKED_NO_CESIUM');if(!viewer||viewer.isDestroyed?.())throw new Error('EARTHUS_CLOUD_BLOCKED_NO_EXISTING_VIEWER');
  let shellRuntime=null,reliefRuntime=null,volumeRuntime=null;
  if(shell?.imageUrl&&shell?.rectangle)shellRuntime=new RegionalCloudShellRuntime({viewer,Cesium,...shell});
  if(relief?.manifestUrl){if(relief.allowSynthetic)throw new Error('EARTHUS_CLOUD_PRODUCTION_SYNTHETIC_FORBIDDEN');reliefRuntime=new CloudReliefRuntime({viewer,Cesium,...relief,allowSynthetic:false});}
  if(volume?.density&&volume?.dimensions&&volume?.boundsLocalM&&volume?.anchor&&volume?.cloudState){
    validateCanonicalCloudState(volume.cloudState);const eligible=volumeEligibility(volume.cloudState);if(!eligible.eligible)throw new Error(`EARTHUS_CLOUD_VOLUME_BLOCKED_${eligible.reason}`);
    const device=getDeviceContext(),budget=chooseCloudGpuBudget({...device,devicePixelRatio:globalThis.devicePixelRatio??1});
    if(budget.volume){const bridge=new CesiumWebGpuCameraBridge({viewer,Cesium,anchorLongitudeDeg:volume.anchor.longitudeDeg,anchorLatitudeDeg:volume.anchor.latitudeDeg,anchorHeightM:volume.anchor.heightM??0});volumeRuntime=new WebGpuCloudVolumeRenderer({viewer,Cesium,bridge,...volume,maxSteps:Math.min(volume.maxSteps??budget.maxSteps,budget.maxSteps),resolutionScale:budget.resolutionScale,dprCap:budget.dprCap});}
  }
  const runtime=new AdaptiveCloudRuntime({shell:shellRuntime,relief:reliefRuntime,volume:volumeRuntime,getContext:()=>{const device=getDeviceContext();return{cameraHeightM:getCameraHeightM(),deviceClass:device.deviceClass??'desktop',thermalState:device.thermalState??'NORMAL',hasShell:Boolean(shellRuntime),hasRelief:Boolean(reliefRuntime),hasVolume:Boolean(volumeRuntime),webgpuSupported:webgpuAvailable(),userRequestedCloudDetail:Boolean(userRequestedCloudDetail())};}});
  return Object.freeze({runtime,update:()=>runtime.update(),dispose:()=>runtime.dispose(),evidence:Object.freeze({viewerReused:true,createdCesiumViewer:false,syntheticProductionAllowed:false,cloudV02:true})});
}
