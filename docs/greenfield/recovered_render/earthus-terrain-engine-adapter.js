import { CesiumTerrainRuntime } from './cesium-terrain-runtime.js';

export function createEarthusTerrainEngine({ Cesium = globalThis.Cesium, source, getDeviceContext = () => ({ deviceClass:'desktop', thermalState:'NORMAL' }) } = {}) {
  const viewer=globalThis.__earthusViewer;
  if(!viewer) throw new Error('EARTHUS_VIEWER_SINGLETON_REQUIRED');
  if(!Cesium) throw new Error('CESIUM_RUNTIME_REQUIRED');
  const getContext=()=>({cameraHeightM:viewer.camera?.positionCartographic?.height??Infinity,...getDeviceContext()});
  const runtime=new CesiumTerrainRuntime({viewer,Cesium,source,getContext});
  return Object.freeze({runtime,activate:()=>runtime.activate(),update:()=>runtime.update(),dispose:()=>runtime.dispose(),evidence:Object.freeze({viewerReused:true,createdCesiumViewer:false})});
}
