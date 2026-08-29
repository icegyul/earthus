/* EARTHUS V2 — bounded NOAA GFS cloud voxel runtime.
 * No procedural cloud coverage is generated. Density is the modelled TCDC field
 * supplied by aws/gfs-cloud-volume/handler.py after HGT-based vertical resampling.
 */
function enuScaledMatrix(C,anchor,sizeM){
  const center=(anchor.bottomM+anchor.topM)*.5,origin=C.Cartesian3.fromDegrees(anchor.longitudeDeg,anchor.latitudeDeg,center),enu=C.Transforms.eastNorthUpToFixedFrame(origin),scale=C.Matrix4.fromScale(new C.Cartesian3(sizeM.eastWestM*.5,sizeM.northSouthM*.5,(anchor.topM-anchor.bottomM)*.5));return C.Matrix4.multiply(enu,scale,new C.Matrix4());
}
function inlineProvider(C,m,density){
  const d=m.dimensions,count=d.x*d.y*d.z;if(density.length!==count)throw new Error(`GFS_VOLUME_DENSITY_LENGTH:${density.length}:${count}`);
  return {globalTransform:enuScaledMatrix(C,m.anchor,m.sizeM),shapeTransform:C.Matrix4.IDENTITY,shape:C.VoxelShapeType.BOX,minBounds:new C.Cartesian3(-1,-1,-1),maxBounds:new C.Cartesian3(1,1,1),dimensions:new C.Cartesian3(d.x,d.y,d.z),paddingBefore:C.Cartesian3.ZERO,paddingAfter:C.Cartesian3.ZERO,names:['density'],types:[C.MetadataType.SCALAR],componentTypes:[C.MetadataComponentType.UINT8],minimumValues:[[0]],maximumValues:[[255]],availableLevels:1,maximumTileCount:1,requestData({tileLevel=0,tileX=0,tileY=0,tileZ=0}={}){if(tileLevel||tileX||tileY||tileZ)return undefined;return Promise.resolve(C.VoxelContent.fromMetadataArray([density]))}};
}
function shader(C){
  const options={fragmentShaderText:`
void fragmentMain(FragmentInput fsInput, inout czm_modelMaterial material){
  float d=clamp(fsInput.metadata.density*0.003921568627451,0.0,1.0);
  float cloud=smoothstep(0.035,0.62,d);
  float travel=max(fsInput.voxel.travelDistance,0.00001);
  float extinction=cloud*7.5;
  float alpha=(1.0-exp(-extinction*travel))*0.92;
  float bright=smoothstep(0.06,0.82,d);
  material.diffuse=mix(vec3(0.74,0.78,0.82),vec3(1.0,0.998,0.992),bright);
  material.alpha=clamp(alpha,0.0,0.70);
}`};
  if(C.CustomShaderTranslucencyMode?.TRANSLUCENT)options.translucencyMode=C.CustomShaderTranslucencyMode.TRANSLUCENT;
  if(C.LightingModel?.UNLIT)options.lightingModel=C.LightingModel.UNLIT;
  return new C.CustomShader(options);
}
export class GfsCloudVolumeRuntime{
  constructor({viewer,Cesium,baseUrl='/clouds/gfs/volume/east-asia'}={}){if(!viewer||viewer.isDestroyed?.())throw new Error('GFS_VOLUME_VIEWER_REQUIRED');this.viewer=viewer;this.C=Cesium||globalThis.Cesium;this.baseUrl=baseUrl.replace(/\/$/,'');this.primitive=null;this.shader=null;this.manifest=null;this.generation=0;this.visible=false}
  async load({force=false}={}){
    if(!this.C.VoxelPrimitive||!this.C.VoxelContent)throw new Error('CESIUM_VOXEL_RUNTIME_UNAVAILABLE');const generation=++this.generation;if(this.primitive&&!force)return this.manifest;
    const mr=await fetch(`${this.baseUrl}/manifest.json?t=${Date.now()}`,{cache:'no-cache'});if(!mr.ok)throw new Error(`GFS_VOLUME_MANIFEST_${mr.status}`);const m=await mr.json();this.#validate(m);
    const dr=await fetch(new URL(m.densityUrl,`${location.origin}${this.baseUrl}/`).href,{cache:'no-cache'});if(!dr.ok)throw new Error(`GFS_VOLUME_DENSITY_${dr.status}`);const buf=await dr.arrayBuffer();if(generation!==this.generation)return null;if(buf.byteLength!==m.byteLength||buf.byteLength>4*1024*1024)throw new Error('GFS_VOLUME_BYTE_GATE');
    this.#destroy();const density=new Uint8Array(buf),provider=inlineProvider(this.C,m,density);this.shader=shader(this.C);this.primitive=this.viewer.scene.primitives.add(new this.C.VoxelPrimitive({provider,customShader:this.shader,calculateStatistics:true}));this.primitive.depthTest=true;this.primitive.screenSpaceError=4;this.primitive.stepSize=.72;this.primitive.show=this.visible;this.primitive.disableUpdate=!this.visible;this.manifest=Object.freeze({...m,renderModel:'STEP_AWARE_OPTICAL_ALPHA_FROM_GFS_TCDC'});this.viewer.scene.requestRender();return this.manifest;
  }
  #validate(m){const s=m.cloudState,d=m.dimensions,a=m.anchor,z=m.altitudeAxisM;if(m.ready!==true||m.production!==true||m.synthetic===true||m.encoding!=='UINT8_0_255'||s?.truthClass!=='MODELLED_NWP'||s?.sourceId!=='NOAA_NCEP_GFS_0P50_NOMADS'||s?.volume?.densityReady!==true||s?.volume?.verticalStructureReady!==true)throw new Error('GFS_VOLUME_TRUTH_GATE');if(!d||![d.x,d.y,d.z].every(Number.isFinite)||d.x*d.y*d.z<=0||d.x*d.y*d.z>4*1024*1024)throw new Error('GFS_VOLUME_DIMENSION_GATE');if(!a||!Number.isFinite(a.bottomM)||!Number.isFinite(a.topM)||a.bottomM>=a.topM)throw new Error('GFS_VOLUME_ALTITUDE_GATE');if(!Array.isArray(z)||z.length!==d.z)throw new Error('GFS_VOLUME_Z_AXIS_GATE')}
  async show(){this.visible=true;if(!this.primitive)await this.load();if(this.primitive){this.primitive.show=true;this.primitive.disableUpdate=false}this.viewer.scene.requestRender();return this.manifest}
  hide(){this.visible=false;if(this.primitive){this.primitive.show=false;this.primitive.disableUpdate=true}this.viewer.scene.requestRender()}
  #destroy(){if(this.primitive){try{this.viewer.scene.primitives.remove(this.primitive)}catch(_){}this.primitive=null}if(this.shader&&!this.shader.isDestroyed?.())try{this.shader.destroy?.()}catch(_){}this.shader=null}
  dispose(){this.generation++;this.#destroy();this.manifest=null;this.visible=false}
}
