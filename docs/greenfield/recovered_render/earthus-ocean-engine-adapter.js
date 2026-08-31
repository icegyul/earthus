import { RegionalOceanSurfaceRuntime } from './ocean-surface-runtime.js';
import { BathymetryRuntime } from './bathymetry-runtime.js';
import { OceanGlobeTranslucencyRuntime } from './ocean-globe-translucency-runtime.js';
import { UnderwaterCameraRuntime } from './underwater-camera-runtime.js';
import { UnderwaterVisualRuntime } from './underwater-visual-runtime.js';
import { AdaptiveOceanRuntime } from './adaptive-ocean-runtime.js';
import { validateTrenchGate } from './trench-gate-runtime.js';
export function createEarthusOceanEngine({Cesium=globalThis.Cesium,rectangle,bathymetryGrid=null,getContext=()=>({}),realDeviceMemoryVerified=false}={}){
  const viewer=globalThis.__earthusViewer;if(!viewer)throw new Error('EARTHUS_VIEWER_SINGLETON_REQUIRED');if(!Cesium)throw new Error('CESIUM_RUNTIME_REQUIRED');
  if(bathymetryGrid?.truthClass==='SYNTHETIC_FIXTURE')throw new Error('EARTHUS_OCEAN_PRODUCTION_SYNTHETIC_FORBIDDEN');
  const surface=new RegionalOceanSurfaceRuntime({viewer,Cesium,rectangle,animate:false});
  const bathymetry=bathymetryGrid?new BathymetryRuntime({viewer,Cesium,grid:bathymetryGrid,options:{allowSynthetic:false}}):null;
  const translucency=new OceanGlobeTranslucencyRuntime({viewer});
  const camera=new UnderwaterCameraRuntime({viewer,Cesium});const visual=new UnderwaterVisualRuntime({viewer,Cesium});
  const gate=validateTrenchGate({bathymetryReady:Boolean(bathymetry),surfaceSeparated:Boolean(surface),underwaterCameraReady:true,realDeviceMemoryVerified});
  const runtime=new AdaptiveOceanRuntime({surface,bathymetry,translucency,underwaterCamera:camera,underwaterVisual:visual,getContext:()=>({cameraHeightM:viewer.camera.positionCartographic?.height??Infinity,bathymetryReady:Boolean(bathymetry),trenchLevel:gate.level,...getContext()})});
  return Object.freeze({runtime,gate,update:()=>runtime.update(),enterUnderwater:(p)=>camera.enter(p),dispose:()=>runtime.dispose(),evidence:Object.freeze({viewerReused:true,createdCesiumViewer:false,realDeviceMemoryVerified})});
}
