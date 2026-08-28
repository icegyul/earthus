/* EARTHUS V2 — GK2A official L2 CTH relief.
 * Consumes only truth-gated artifacts produced by aws/gk2a-clouds/cth_pipeline.py.
 * Heights are source CTh metres; no vertical exaggeration is applied.
 */
export class Gk2aCthReliefRuntime {
  constructor({viewer,Cesium,baseUrl='/clouds/gk2a/cth'}={}){
    if(!viewer||viewer.isDestroyed?.())throw new Error('GK2A_CTH_VIEWER_REQUIRED');
    this.viewer=viewer;this.C=Cesium||globalThis.Cesium;this.baseUrl=baseUrl.replace(/\/$/,'');this.primitive=null;this.manifest=null;this.visible=false;this.generation=0;
  }
  async load({force=false}={}){
    const generation=++this.generation;
    if(this.primitive&&!force)return this.manifest;
    const mr=await fetch(`${this.baseUrl}/manifest.json?t=${Date.now()}`,{cache:'no-cache'});
    if(!mr.ok)throw new Error(`GK2A_CTH_MANIFEST_${mr.status}`);const m=await mr.json();
    if(m.ready!==true||m.synthetic===true||m.truthClass!=='OBSERVED_DERIVED_OFFICIAL_L2'||m.units!=='m')throw new Error('GK2A_CTH_MANIFEST_TRUTH_GATE');
    const gr=await fetch(new URL(m.gridUrl,`${location.origin}${this.baseUrl}/`).href,{cache:'no-cache'});if(!gr.ok)throw new Error(`GK2A_CTH_GRID_${gr.status}`);const g=await gr.json();
    if(generation!==this.generation)return null;this.#validate(g,m);this.#destroyPrimitive();this.primitive=this.#build(g);this.primitive.show=this.visible;this.manifest=Object.freeze(m);this.viewer.scene.requestRender();return this.manifest;
  }
  #validate(g,m){
    const n=g.width*g.height;if(g.synthetic===true||g.truthClass!=='OBSERVED_DERIVED_OFFICIAL_L2'||g.units!=='m')throw new Error('GK2A_CTH_GRID_TRUTH_GATE');
    for(const k of['longitude','latitude','heightM','valid'])if(!Array.isArray(g[k])||g[k].length!==n)throw new Error(`GK2A_CTH_GRID_${k.toUpperCase()}_SHAPE`);
    if(g.width!==m.width||g.height!==m.height||n<4||n>100000)throw new Error('GK2A_CTH_GRID_DIMENSION_GATE');
  }
  #build(g){
    const C=this.C,n=g.width*g.height,positions=new Float64Array(n*3);let validCount=0;
    const validCell=new Uint8Array(n);
    for(let i=0;i<n;i++){
      const valid=g.valid[i]===1,lon=Number(g.longitude[i]),lat=Number(g.latitude[i]),h=Number(g.heightM[i]);
      const ok=valid&&Number.isFinite(lon)&&Number.isFinite(lat)&&Number.isFinite(h)&&lat>=-90&&lat<=90&&lon>=-180&&lon<=180&&h>=0&&h<=25000;
      validCell[i]=ok?1:0;const p=C.Cartesian3.fromDegrees(ok?lon:0,ok?lat:0,ok?h:0);positions[i*3]=p.x;positions[i*3+1]=p.y;positions[i*3+2]=p.z;if(ok)validCount++;
    }
    if(validCount<100)throw new Error('GK2A_CTH_VALID_CELL_GATE');
    const idx=[],w=g.width,hg=g.height,V=i=>validCell[i]===1;
    for(let y=0;y<hg-1;y++)for(let x=0;x<w-1;x++){const a=y*w+x,b=a+1,c=a+w,d=c+1;if(V(a)&&V(b)&&V(c))idx.push(a,c,b);if(V(b)&&V(c)&&V(d))idx.push(b,c,d)}
    if(idx.length<300)throw new Error('GK2A_CTH_TRIANGLE_GATE');
    const geometry=new C.Geometry({attributes:{position:new C.GeometryAttribute({componentDatatype:C.ComponentDatatype.DOUBLE,componentsPerAttribute:3,values:positions})},indices:C.IndexDatatype.createTypedArray(n,idx),primitiveType:C.PrimitiveType.TRIANGLES,boundingSphere:C.BoundingSphere.fromVertices(positions)});
    const material=C.Material.fromType('Color',{color:C.Color.fromCssColorString('#eef8fb').withAlpha(.66)});
    return this.viewer.scene.primitives.add(new C.Primitive({geometryInstances:new C.GeometryInstance({geometry}),appearance:new C.MaterialAppearance({material,translucent:true,closed:false,faceForward:true,materialSupport:C.MaterialAppearance.MaterialSupport.BASIC}),asynchronous:false,show:false}));
  }
  setVisible(show){this.visible=!!show;if(this.primitive)this.primitive.show=this.visible;this.viewer.scene.requestRender()}
  async show(){this.visible=true;if(!this.primitive)await this.load();if(this.primitive)this.primitive.show=true;this.viewer.scene.requestRender();return this.manifest}
  hide(){this.setVisible(false)}
  #destroyPrimitive(){if(this.primitive){try{this.viewer.scene.primitives.remove(this.primitive)}catch(_){}this.primitive=null}}
  dispose(){this.generation++;this.#destroyPrimitive();this.manifest=null;this.visible=false}
}
