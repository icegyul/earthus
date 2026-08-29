/* EARTHUS V2 — truth-bounded polar imagery caps.
 * Esri TopoBathy3D does not supply globe geometry at the extreme poles in our
 * browser evidence. These caps fill only that missing visual geometry with NASA
 * GIBS imagery requested in the official polar stereographic projections.
 * They are imagery-only surfaces at ellipsoid height; they are never terrain data.
 */
const POLAR_RADIUS_M=820_000;
const POLAR_BBOX_M=900_000;
const LAYERS=Object.freeze(['BlueMarble_NextGeneration','BlueMarble_ShadedRelief_Bathymetry','BlueMarble_ShadedRelief']);
const CONFIG=Object.freeze([
  Object.freeze({id:'ARCTIC_EPSG3413',lat:89.9999,lon:-45,epsg:'EPSG:3413',endpoint:'https://gibs.earthdata.nasa.gov/wms/epsg3413/best/wms.cgi',stRotationDeg:45}),
  Object.freeze({id:'ANTARCTIC_EPSG3031',lat:-89.9999,lon:0,epsg:'EPSG:3031',endpoint:'https://gibs.earthdata.nasa.gov/wms/epsg3031/best/wms.cgi',stRotationDeg:0}),
]);
function wmsUrl(config,layer){const u=new URL(config.endpoint);u.search=new URLSearchParams({service:'WMS',version:'1.1.1',request:'GetMap',styles:'',layers:layer,bbox:`-${POLAR_BBOX_M},-${POLAR_BBOX_M},${POLAR_BBOX_M},${POLAR_BBOX_M}`,width:'1024',height:'1024',srs:config.epsg,format:'image/jpeg',transparent:'false'}).toString();return u.href}
async function loadImage(url){return new Promise((resolve,reject)=>{const image=new Image();image.crossOrigin='anonymous';image.decoding='async';image.onload=()=>image.naturalWidth>=256&&image.naturalHeight>=256?resolve(image):reject(new Error('POLAR_IMAGE_DIMENSION_GATE'));image.onerror=()=>reject(new Error('POLAR_IMAGE_DECODE_FAILED'));image.src=url})}
async function loadFirst(config){let last=null;for(const layer of LAYERS){const url=wmsUrl(config,layer);try{return Object.freeze({image:await loadImage(url),layer,url})}catch(error){last=error}}throw new Error(`${config.id}_NO_GIBS_POLAR_LAYER:${last?.message||'unknown'}`)}
export class PolarImageryCapRuntime{
  constructor({viewer,Cesium}={}){if(!viewer||viewer.isDestroyed?.())throw new Error('POLAR_CAP_VIEWER_REQUIRED');this.viewer=viewer;this.C=Cesium||globalThis.Cesium;this.primitives=[];this.truth='UNINITIALIZED';this.sources=[];this.generation=0}
  async load({force=false}={}){const generation=++this.generation;if(this.primitives.length&&!force)return this.truth;this.dispose({preserveGeneration:true});this.truth='LOADING';const loaded=await Promise.all(CONFIG.map(async config=>Object.freeze({config,asset:await loadFirst(config)})));if(generation!==this.generation)return null;const C=this.C;for(const {config,asset} of loaded){const material=C.Material.fromType('Image',{image:asset.image,repeat:new C.Cartesian2(1,1)}),geometry=new C.CircleGeometry({center:C.Cartesian3.fromDegrees(config.lon,config.lat),radius:POLAR_RADIUS_M,height:180,granularity:C.Math.toRadians(.22),stRotation:C.Math.toRadians(config.stRotationDeg),vertexFormat:C.MaterialAppearance.MaterialSupport.TEXTURED.vertexFormat}),appearance=new C.MaterialAppearance({material,materialSupport:C.MaterialAppearance.MaterialSupport.TEXTURED,flat:true,faceForward:true,translucent:false,closed:false}),primitive=this.viewer.scene.primitives.add(new C.Primitive({geometryInstances:new C.GeometryInstance({geometry}),appearance,allowPicking:false,asynchronous:false}));this.primitives.push(primitive);this.sources.push(Object.freeze({id:config.id,epsg:config.epsg,layer:asset.layer,truthClass:'NASA_GIBS_POLAR_STEREOGRAPHIC_IMAGERY_ONLY'}))}this.truth='NASA_GIBS_POLAR_STEREOGRAPHIC_IMAGERY_ONLY';this.viewer.scene.requestRender();return this.truth}
  getTruth(){return this.truth}
  getSources(){return Object.freeze([...this.sources])}
  setVisible(show){for(const p of this.primitives)p.show=!!show;this.viewer.scene.requestRender()}
  dispose({preserveGeneration=false}={}){if(!preserveGeneration)this.generation++;for(const p of this.primitives)try{this.viewer.scene.primitives.remove(p)}catch(_){}this.primitives=[];this.sources=[];this.truth='UNINITIALIZED'}
}
