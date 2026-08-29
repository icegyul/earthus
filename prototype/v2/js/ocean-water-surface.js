/* EARTHUS V2 — local physical water surface for a verified ocean footprint.
 * This is a rendering surface only. It never infers land/ocean coverage and must
 * be instantiated only where the caller has already truth-gated an ocean area.
 */
export class OceanWaterSurfaceRuntime{
  constructor({viewer,Cesium}={}){if(!viewer||viewer.isDestroyed?.())throw new Error('OCEAN_WATER_VIEWER_REQUIRED');this.viewer=viewer;this.C=Cesium||globalThis.Cesium;this.primitive=null;this.material=null}
  show({longitudeDeg,latitudeDeg,radiusM,alpha=.58}={}){
    const C=this.C,lon=Number(longitudeDeg),lat=Number(latitudeDeg),radius=Number(radiusM),opacity=Math.max(.08,Math.min(.82,Number(alpha)||.58));
    if(!Number.isFinite(lon)||!Number.isFinite(lat)||lat<-90||lat>90||lon<-180||lon>180)throw new Error('OCEAN_WATER_COORDINATE_GATE');
    if(!Number.isFinite(radius)||radius<1000||radius>500000)throw new Error('OCEAN_WATER_RADIUS_GATE');
    this.dispose();
    const normalMap=C.buildModuleUrl('Assets/Textures/waterNormalsSmall.jpg');
    this.material=C.Material.fromType('Water',{
      baseWaterColor:C.Color.fromCssColorString('#061b2b').withAlpha(opacity),
      blendColor:C.Color.fromCssColorString('#0b3550').withAlpha(opacity*.72),
      normalMap,
      frequency:720.0,
      animationSpeed:0.009,
      amplitude:2.4,
      specularIntensity:0.68,
    });
    const geometry=new C.EllipseGeometry({
      center:C.Cartesian3.fromDegrees(lon,lat,0),
      semiMajorAxis:radius,
      semiMinorAxis:radius,
      height:0,
      granularity:C.Math.toRadians(.12),
      vertexFormat:C.MaterialAppearance.MaterialSupport.ALL.vertexFormat,
    });
    this.primitive=this.viewer.scene.primitives.add(new C.Primitive({
      geometryInstances:new C.GeometryInstance({geometry}),
      appearance:new C.MaterialAppearance({material:this.material,materialSupport:C.MaterialAppearance.MaterialSupport.ALL,flat:false,faceForward:true,translucent:true,closed:false}),
      asynchronous:false,
      allowPicking:false,
    }));
    this.viewer.scene.requestRender();return this.primitive;
  }
  hide(){if(this.primitive)this.primitive.show=false;this.viewer.scene.requestRender()}
  dispose(){if(this.primitive){try{this.viewer.scene.primitives.remove(this.primitive)}catch(_){}this.primitive=null}if(this.material&&!this.material.isDestroyed?.())try{this.material.destroy?.()}catch(_){}this.material=null}
}
