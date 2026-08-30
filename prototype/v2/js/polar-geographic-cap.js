/* EARTHUS V2 — truth-bounded polar stereographic imagery hole fill.
 * Geometry is a zero-elevation geodetic surface only. Texture coordinates are
 * computed from the official WGS84 polar stereographic definitions used by
 * NASA GIBS: EPSG:3413 north and EPSG:3031 south. No elevation is invented.
 */
const A=6378137.0;
const F=1/298.257223563;
const E=Math.sqrt(F*(2-F));
const EDGE_LAT=81.75;
const HEIGHT_M=120;
const HALF_EXTENT_M=930000;
const SEGMENTS=256;
const RINGS=24;
const LAYERS=Object.freeze(['BlueMarble_ShadedRelief_Bathymetry','BlueMarble_ShadedRelief','BlueMarble_NextGeneration']);
const CONFIG=Object.freeze({
  north:Object.freeze({id:'EPSG:3413',endpoint:'https://gibs.earthdata.nasa.gov/wms/epsg3413/best/wms.cgi',latTs:70,lon0:-45}),
  south:Object.freeze({id:'EPSG:3031',endpoint:'https://gibs.earthdata.nasa.gov/wms/epsg3031/best/wms.cgi',latTs:-71,lon0:0}),
});
const rad=d=>d*Math.PI/180;
const clamp=(v,a=0,b=1)=>Math.max(a,Math.min(b,v));
function tsfn(absLatRad){const s=Math.sin(absLatRad);return Math.tan(Math.PI/4-absLatRad/2)*Math.pow((1+E*s)/(1-E*s),E/2)}
function rhoFor(absLatDeg,absLatTsDeg){const p=rad(absLatDeg),pc=rad(absLatTsDeg),s=Math.sin(pc),mc=Math.cos(pc)/Math.sqrt(1-E*E*s*s);return A*mc*tsfn(p)/tsfn(pc)}
function project(config,lonDeg,latDeg){const north=config.latTs>0,rho=rhoFor(Math.abs(latDeg),Math.abs(config.latTs)),theta=rad(lonDeg-config.lon0),x=rho*Math.sin(theta),y=(north?-1:1)*rho*Math.cos(theta);return{x,y}}
function wmsUrl(config,layer){const u=new URL(config.endpoint);u.search=new URLSearchParams({service:'WMS',version:'1.1.1',request:'GetMap',styles:'',layers:layer,srs:config.id,bbox:`-${HALF_EXTENT_M},-${HALF_EXTENT_M},${HALF_EXTENT_M},${HALF_EXTENT_M}`,width:'1024',height:'1024',format:'image/jpeg',transparent:'false'}).toString();return u.href}
async function loadImage(url){return new Promise((resolve,reject)=>{const image=new Image();image.crossOrigin='anonymous';image.decoding='async';image.onload=()=>image.naturalWidth>=512&&image.naturalHeight>=512?resolve(image):reject(new Error('POLAR_STEREO_IMAGE_DIMENSION_GATE'));image.onerror=()=>reject(new Error('POLAR_STEREO_IMAGE_DECODE_FAILED'));image.src=url})}
function imageSignal(image){const cv=document.createElement('canvas');cv.width=192;cv.height=192;const cx=cv.getContext('2d',{willReadFrequently:true});if(!cx)throw new Error('POLAR_STEREO_CANVAS_CONTEXT');cx.drawImage(image,0,0,cv.width,cv.height);const d=cx.getImageData(0,0,cv.width,cv.height).data,vals=[];let sum=0,sum2=0,n=0,dark=0;for(let y=8;y<cv.height-8;y+=2)for(let x=8;x<cv.width-8;x+=2){const i=(y*cv.width+x)*4,l=(.2126*d[i]+.7152*d[i+1]+.0722*d[i+2])/255;vals.push(l);sum+=l;sum2+=l*l;n++;if(l<.012)dark++}vals.sort((a,b)=>a-b);const mean=sum/n,std=Math.sqrt(Math.max(0,sum2/n-mean*mean)),p10=vals[Math.floor(vals.length*.1)]||0,p90=vals[Math.floor(vals.length*.9)]||0;return{mean,std,dynamicRange:p90-p10,darkRatio:dark/n}}
function usable(s){return s.darkRatio<.94&&s.std>.004&&s.dynamicRange>.008}
async function loadFirst(config){let last=null;for(const layer of LAYERS){const url=wmsUrl(config,layer);try{const image=await loadImage(url),signal=imageSignal(image);if(!usable(signal))throw new Error(`POLAR_STEREO_IMAGE_SIGNAL:${signal.mean.toFixed(4)}:${signal.std.toFixed(4)}:${signal.dynamicRange.toFixed(4)}:${signal.darkRatio.toFixed(4)}`);return Object.freeze({image,layer,url,signal})}catch(error){last=error}}throw new Error(`${config.id}_NO_GIBS_POLAR_LAYER:${last?.message||'unknown'}`)}
function buildGeometry(C,config){const north=config.latTs>0,ringWidth=SEGMENTS+1,ringVertices=RINGS*ringWidth,vertexCount=ringVertices+1,positions=new Float64Array(vertexCount*3),st=new Float32Array(vertexCount*2);let vi=0;for(let r=0;r<RINGS;r++){const f=r/RINGS,lat=north?EDGE_LAT+(90-EDGE_LAT)*f:-EDGE_LAT-(90-EDGE_LAT)*f;for(let s=0;s<=SEGMENTS;s++){const lon=-180+360*s/SEGMENTS,p=C.Cartesian3.fromDegrees(lon,lat,HEIGHT_M),q=project(config,lon,lat);positions[vi*3]=p.x;positions[vi*3+1]=p.y;positions[vi*3+2]=p.z;st[vi*2]=clamp((q.x+HALF_EXTENT_M)/(2*HALF_EXTENT_M));st[vi*2+1]=clamp((q.y+HALF_EXTENT_M)/(2*HALF_EXTENT_M));vi++}}
  const center=ringVertices,pole=C.Cartesian3.fromDegrees(config.lon0,north?90:-90,HEIGHT_M);positions[center*3]=pole.x;positions[center*3+1]=pole.y;positions[center*3+2]=pole.z;st[center*2]=.5;st[center*2+1]=.5;
  const indices=[];for(let r=0;r<RINGS-1;r++)for(let s=0;s<SEGMENTS;s++){const a=r*ringWidth+s,b=a+1,c=a+ringWidth,d=c+1;if(north)indices.push(a,c,b,b,c,d);else indices.push(a,b,c,b,d,c)}const last=(RINGS-1)*ringWidth;for(let s=0;s<SEGMENTS;s++){const a=last+s,b=a+1;if(north)indices.push(a,center,b);else indices.push(a,b,center)}
  return new C.Geometry({attributes:{position:new C.GeometryAttribute({componentDatatype:C.ComponentDatatype.DOUBLE,componentsPerAttribute:3,values:positions}),st:new C.GeometryAttribute({componentDatatype:C.ComponentDatatype.FLOAT,componentsPerAttribute:2,values:st})},indices:C.IndexDatatype.createTypedArray(vertexCount,indices),primitiveType:C.PrimitiveType.TRIANGLES,boundingSphere:C.BoundingSphere.fromVertices(positions)});
}
function buildPrimitive(viewer,C,config,asset){const material=C.Material.fromType('Image',{image:asset.image,repeat:new C.Cartesian2(1,1),color:C.Color.WHITE}),appearance=new C.MaterialAppearance({material,materialSupport:C.MaterialAppearance.MaterialSupport.TEXTURED,flat:true,faceForward:true,translucent:false,closed:false});return viewer.scene.primitives.add(new C.Primitive({geometryInstances:new C.GeometryInstance({geometry:buildGeometry(C,config)}),appearance,allowPicking:false,asynchronous:false}))}
export class PolarGeographicCapRuntime{
  constructor({viewer,Cesium}={}){if(!viewer||viewer.isDestroyed?.())throw new Error('POLAR_STEREO_VIEWER_REQUIRED');this.viewer=viewer;this.C=Cesium||globalThis.Cesium;this.primitives=[];this.sources=[];this.truth='UNINITIALIZED';this.generation=0}
  async load({force=false}={}){const generation=++this.generation;if(this.primitives.length&&!force)return this.truth;this.dispose({preserveGeneration:true});this.truth='LOADING';const entries=await Promise.all([CONFIG.north,CONFIG.south].map(async config=>({config,asset:await loadFirst(config)})));if(generation!==this.generation)return null;for(const{config,asset}of entries){const primitive=buildPrimitive(this.viewer,this.C,config,asset);this.primitives.push(primitive);this.sources.push(Object.freeze({hemisphere:config.latTs>0?'NORTH':'SOUTH',epsg:config.id,layer:asset.layer,edgeLatitudeDeg:config.latTs>0?EDGE_LAT:-EDGE_LAT,truthClass:'NASA_GIBS_POLAR_STEREOGRAPHIC_IMAGERY_ONLY',imageSignal:Object.freeze(asset.signal),geometryClass:'GEODETIC_MESH_WITH_POLAR_STEREOGRAPHIC_UV',halfExtentM:HALF_EXTENT_M}))}this.truth='NASA_GIBS_POLAR_STEREOGRAPHIC_HOLE_FILL_IMAGERY_ONLY';this.viewer.scene.requestRender();return this.truth}
  setVisible(show){for(const p of this.primitives)p.show=!!show;this.viewer.scene.requestRender()}
  getTruth(){return this.truth}
  getSources(){return Object.freeze([...this.sources])}
  dispose({preserveGeneration=false}={}){if(!preserveGeneration)this.generation++;for(const p of this.primitives)try{this.viewer.scene.primitives.remove(p)}catch(_){}this.primitives=[];this.sources=[];this.truth='UNINITIALIZED'}
}
