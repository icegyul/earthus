const PRESETS=Object.freeze({
  KR:Object.freeze({label:'South Korea',lon:127.8,lat:36.3,height:3_200_000}),
  JP:Object.freeze({label:'Japan',lon:138.2,lat:36.2,height:4_200_000}),
  US:Object.freeze({label:'United States',lon:-98.35,lat:39.5,height:12_000_000}),
  GB:Object.freeze({label:'United Kingdom',lon:-3.4,lat:54.5,height:3_200_000}),
});
export function listCountryFocusPresets(){return Object.entries(PRESETS).map(([code,value])=>Object.freeze({code,...value}));}
export function focusCountry(viewer, code,{duration=1.1}={}){
  const p=PRESETS[code]; if(!p)throw new TypeError(`unsupported focus preset: ${code}`);
  if(!viewer?.camera || !globalThis.Cesium)throw new Error('Cesium viewer not ready');
  viewer.camera.flyTo({destination:Cesium.Cartesian3.fromDegrees(p.lon,p.lat,p.height),duration});
  return p;
}
