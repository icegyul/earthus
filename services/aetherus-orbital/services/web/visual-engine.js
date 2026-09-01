(function(){
  const TAU=Math.PI*2;
  const clamp=(v,a,b)=>Math.max(a,Math.min(b,v));
  const lerp=(a,b,t)=>a+(b-a)*t;
  const len3=v=>Math.hypot(v?.[0]||0,v?.[1]||0,v?.[2]||0);

  class AetherusVisualEngine{
    constructor(glCanvas,overlayCanvas){
      this.glCanvas=glCanvas;this.overlayCanvas=overlayCanvas;this.ctx=overlayCanvas.getContext('2d');
      this.gl=glCanvas.getContext('webgl2',{alpha:true,antialias:true,premultipliedAlpha:false});
      this.mode='SPACE';this.data={};this.aux={};this.universe={};this.scene={};this.labels=true;this.grid=true;
      this.yaw=.12;this.pitch=-.12;this.zoom=1;this.targetZoom=1;this.drag=false;this.last=[0,0];this.hover=null;this.hitTargets=[];this.started=false;this.frame=0;this.pointers=new Map();this.pinchDistance=0;
      this.focusTarget=null;this.focusDepth='UNIVERSE';this.focusedBodyRadius=0;this.spaceScale='SOLAR_SYSTEM_VIEW';this.lastMode=null;this.controlVisual=null;this.orbitView='GLOBAL';this.orbitVisual=null;this.intelligenceVisual=null;this.archiveSelection=null;this.archiveSelectionTime=null;this.archiveVisual=null;this.visualLabels=[];
      this.earthTextureReady=false;this.earthTex=null;this.program=null;this.uniforms={};this.earthImg=new Image();this.earthImg.onload=()=>this.earthImageReady=true;this.earthImg.src=window.AETHERUS_EARTH_TEXTURE_DATA_URL||'';this.earthImageReady=false;
      this._bind();this._initGL();
    }
    _bind(){
      const c=this.overlayCanvas;
      c.addEventListener('pointerdown',e=>{this.pointers.set(e.pointerId,[e.clientX,e.clientY]);this.drag=this.pointers.size===1;this.last=[e.clientX,e.clientY];if(this.pointers.size===2){const pts=[...this.pointers.values()];this.pinchDistance=Math.hypot(pts[0][0]-pts[1][0],pts[0][1]-pts[1][1]);this.drag=false}try{c.setPointerCapture?.(e.pointerId)}catch{}});
      const release=e=>{this.pointers.delete(e.pointerId);this.drag=this.pointers.size===1;this.pinchDistance=0;try{if(c.hasPointerCapture?.(e.pointerId))c.releasePointerCapture?.(e.pointerId)}catch{}};
      c.addEventListener('pointerup',release);c.addEventListener('pointercancel',release);
      c.addEventListener('pointermove',e=>{
        const rect=c.getBoundingClientRect();if(this.pointers.has(e.pointerId))this.pointers.set(e.pointerId,[e.clientX,e.clientY]);
        if(this.pointers.size===2){const pts=[...this.pointers.values()],d=Math.hypot(pts[0][0]-pts[1][0],pts[0][1]-pts[1][1]);if(this.pinchDistance>0)this.targetZoom=clamp(this.targetZoom*(d/this.pinchDistance),.72,2.4);this.pinchDistance=d}
        else if(this.drag){const dx=e.clientX-this.last[0],dy=e.clientY-this.last[1];this.last=[e.clientX,e.clientY];this.yaw+=dx*.004;this.pitch=clamp(this.pitch+dy*.003,-.65,.65)}
        const x=e.clientX-rect.left,y=e.clientY-rect.top;this.hover=null;let best=18;for(const h of this.hitTargets){const d=Math.hypot(x-h.x,y-h.y);if(d<best){best=d;this.hover=h}}c.style.cursor=this.hover?'pointer':this.drag?'grabbing':'grab';
      });
      c.addEventListener('wheel',e=>{e.preventDefault();this.targetZoom=clamp(this.targetZoom*(e.deltaY>0?.92:1.08),.72,2.4)},{passive:false});
      c.addEventListener('click',e=>{const rect=c.getBoundingClientRect(),x=e.clientX-rect.left,y=e.clientY-rect.top;let selected=this.hover,best=selected?Math.hypot(x-selected.x,y-selected.y):24;for(const h of this.hitTargets){const d=Math.hypot(x-h.x,y-h.y);if(d<=Math.max(24,h.radius||0)&&d<=best){best=d;selected=h}}if(selected&&typeof this.onSelect==='function')this.onSelect(selected)});
      window.addEventListener('resize',()=>this.resize());
    }
    _initGL(){
      if(!this.gl)return;
      const gl=this.gl;
      const vs=`#version 300 es
      precision highp float;
      const vec2 POS[3]=vec2[3](vec2(-1.0,-1.0),vec2(3.0,-1.0),vec2(-1.0,3.0));
      out vec2 v_uv;void main(){vec2 p=POS[gl_VertexID];v_uv=p*.5+.5;gl_Position=vec4(p,0.,1.);}`;
      const fs=`#version 300 es
      precision highp float;
      in vec2 v_uv;out vec4 outColor;
      uniform vec2 u_resolution;uniform float u_time;uniform float u_mode;uniform float u_yaw;uniform float u_pitch;uniform float u_zoom;uniform sampler2D u_earth;uniform float u_texReady;uniform vec3 u_earthPose;
      float hash21(vec2 p){p=fract(p*vec2(123.34,456.21));p+=dot(p,p+45.32);return fract(p.x*p.y);}
      float noise(vec2 p){vec2 i=floor(p),f=fract(p);f=f*f*(3.-2.*f);return mix(mix(hash21(i),hash21(i+vec2(1,0)),f.x),mix(hash21(i+vec2(0,1)),hash21(i+vec2(1,1)),f.x),f.y);}
      float fbm(vec2 p){float v=0.,a=.5;for(int i=0;i<5;i++){v+=a*noise(p);p=p*2.02+13.1;a*=.5;}return v;}
      mat3 rotY(float a){float c=cos(a),s=sin(a);return mat3(c,0.,-s,0.,1.,0.,s,0.,c);}mat3 rotX(float a){float c=cos(a),s=sin(a);return mat3(1.,0.,0.,0.,c,s,0.,-s,c);}
      vec3 starfield(vec2 uv){vec2 p=(uv-.5)*vec2(u_resolution.x/u_resolution.y,1.);float n=hash21(floor(p*620.));float s=smoothstep(.9965,1.,n);float n2=hash21(floor(p*185.));float s2=smoothstep(.995,1.,n2)*.45;float neb=fbm(p*2.1+vec2(4.1,-2.3));vec3 base=vec3(.005,.009,.014)+vec3(.01,.017,.024)*max(0.,neb-.56);return base+vec3(.72,.82,1.)*(s+s2);}
      void main(){
        vec2 uv=v_uv;vec3 col=starfield(uv);
        float aspect=u_resolution.x/u_resolution.y;vec2 p=(uv-.5)*vec2(aspect,1.);
        float r=u_earthPose.z;vec2 center=u_earthPose.xy;
        vec2 q=p-center;float d=length(q);
        float glow=r>0.?exp(-max(0.,d-r)*28.)*.12+exp(-max(0.,d-r)*8.)*.025:0.;
        col+=vec3(.16,.62,.86)*glow;
        if(r>0.&&d<r){
          vec2 sp=q/r;float z=sqrt(max(0.,1.-dot(sp,sp)));vec3 n=normalize(vec3(sp.x,sp.y,z));n=rotY(u_yaw+u_time*.018)*rotX(u_pitch)*n;
          float lon=atan(n.z,n.x)/6.2831853+.5;float lat=asin(clamp(n.y,-1.,1.))/3.14159265+.5;vec2 tuv=vec2(fract(lon),1.-lat);
          vec3 tex=texture(u_earth,tuv).rgb;float procedural=fbm(tuv*vec2(7.,3.4)+vec2(1.2,4.));
          if(u_texReady<.5){float land=smoothstep(.54,.60,procedural+noise(tuv*13.)*.16);tex=mix(vec3(.012,.055,.09),vec3(.07,.18,.18),land);}
          vec3 light=normalize(vec3(.75,.34,.62));float ndl=dot(n,light);float day=max(.04,ndl*.88+.12);float night=smoothstep(.16,-.22,ndl);
          vec3 earth=tex*day;float rim=pow(1.-z,2.8);earth+=vec3(.12,.56,.86)*rim*.56;
          float clouds=smoothstep(.62,.77,fbm(tuv*vec2(12.,6.)+vec2(u_time*.006,0.)))*smoothstep(.02,.42,day);earth+=vec3(.72,.84,.9)*clouds*.18;
          if(u_grid>.5){ }
          float longitudeGrid=smoothstep(.985,1.,cos(lon*6.2831853*12.)*.5+.5);float latitudeGrid=smoothstep(.988,1.,cos((lat-.5)*3.14159265*12.)*.5+.5);
          float grid=(longitudeGrid+latitudeGrid)*.055*(u_mode>0.5?1.:0.);earth+=vec3(.2,.64,.78)*grid*z;
          float limb=smoothstep(.0,.22,z);col=mix(col,earth,limb);
          col+=vec3(.09,.44,.7)*pow(1.-z,5.)*.2;
        }
        float centerBloom=exp(-length(p-vec2(.0,0.))*18.)*(u_mode<.5?0.05:0.0);col+=vec3(.75,.58,.24)*centerBloom;
        col=pow(col,vec3(.92));outColor=vec4(col,1.);
      }`;
      // inject grid uniform declaration cleanly
      const fs2=fs.replace('uniform float u_texReady;','uniform float u_texReady;uniform float u_grid;');
      const compile=(type,src)=>{const s=gl.createShader(type);gl.shaderSource(s,src);gl.compileShader(s);if(!gl.getShaderParameter(s,gl.COMPILE_STATUS))throw new Error(gl.getShaderInfoLog(s));return s};
      try{
        const pr=gl.createProgram();gl.attachShader(pr,compile(gl.VERTEX_SHADER,vs));gl.attachShader(pr,compile(gl.FRAGMENT_SHADER,fs2));gl.linkProgram(pr);if(!gl.getProgramParameter(pr,gl.LINK_STATUS))throw new Error(gl.getProgramInfoLog(pr));this.program=pr;
        for(const n of ['u_resolution','u_time','u_mode','u_yaw','u_pitch','u_zoom','u_earth','u_texReady','u_grid','u_earthPose'])this.uniforms[n]=gl.getUniformLocation(pr,n);
        this.earthTex=gl.createTexture();gl.bindTexture(gl.TEXTURE_2D,this.earthTex);gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_MIN_FILTER,gl.LINEAR_MIPMAP_LINEAR);gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_MAG_FILTER,gl.LINEAR);gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_WRAP_S,gl.REPEAT);gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_WRAP_T,gl.CLAMP_TO_EDGE);
        const px=new Uint8Array([8,28,38,255]);gl.texImage2D(gl.TEXTURE_2D,0,gl.RGBA,1,1,0,gl.RGBA,gl.UNSIGNED_BYTE,px);
        const img=new Image();img.onload=()=>{gl.bindTexture(gl.TEXTURE_2D,this.earthTex);gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL,0);gl.texImage2D(gl.TEXTURE_2D,0,gl.RGBA,gl.RGBA,gl.UNSIGNED_BYTE,img);gl.generateMipmap(gl.TEXTURE_2D);this.earthTextureReady=true};img.src=window.AETHERUS_EARTH_TEXTURE_DATA_URL||'';
      }catch(e){console.warn('Aetherus WebGL visual fallback:',e);this.gl=null}
    }
    resize(){
      const dpr=Math.min(window.devicePixelRatio||1,2),r=this.overlayCanvas.getBoundingClientRect();
      const w=Math.max(1,Math.floor(r.width*dpr)),h=Math.max(1,Math.floor(r.height*dpr));
      if(this.overlayCanvas.width!==w||this.overlayCanvas.height!==h){this.overlayCanvas.width=w;this.overlayCanvas.height=h}
      if(this.glCanvas.width!==w||this.glCanvas.height!==h){this.glCanvas.width=w;this.glCanvas.height=h}
      this.ctx.setTransform(dpr,0,0,dpr,0,0);if(this.gl)this.gl.viewport(0,0,w,h);
    }
    setMode(mode,data,aux,universe,scene){const changed=this.lastMode!==mode;this.mode=mode;this.data=data||{};this.aux=aux||{};this.universe=universe||{};this.scene=scene||{};this.hitTargets=[];if(changed){this.targetZoom=1;this.zoom=lerp(this.zoom,1,.45);if(mode!=='SPACE'){this.focusTarget=null;this.focusDepth='UNIVERSE'}if(mode==='SPACE'){this.pitch=-.08}else if(mode==='CONTROL'){this.pitch=-.08}else if(mode==='ORBIT'){this.pitch=-.16;this.orbitView='GLOBAL'}else if(mode==='ARCHIVE'){this.archiveSelection=null;this.archiveSelectionTime=null}}this.lastMode=mode}
    setLabels(v){this.labels=!!v}setGrid(v){this.grid=!!v}
    setFocus(id){if(this.mode!=='SPACE'||!id)return;this.focusTarget=id;this.focusDepth='PLANET';this.spaceScale='PLANET_FOCUS';this.targetZoom=1;this.zoom=lerp(this.zoom,1,.35)}
    clearFocus(){this.focusTarget=null;this.focusDepth='UNIVERSE';this.spaceScale='SOLAR_SYSTEM_VIEW';this.targetZoom=1;this.zoom=lerp(this.zoom,1,.35)}
    setOrbitView(view){if(!['GLOBAL','LEO','MEO','GEO','EVENT'].includes(view))return;this.orbitView=view}
    setArchiveSelection(id,timeUtc=null){this.archiveSelection=id||null;this.archiveSelectionTime=timeUtc||null}
    snapshot(){return{mode:this.mode,webgl:!!this.gl,yaw:this.yaw,pitch:this.pitch,zoom:this.zoom,targetZoom:this.targetZoom,pointers:this.pointers.size,focusTarget:this.focusTarget,focusDepth:this.focusDepth,focusedBodyRadius:this.focusedBodyRadius,spaceScale:this.spaceScale,targets:this.hitTargets.map(h=>({type:h.type,id:h.id,x:h.x,y:h.y,radius:h.radius||0})),visualLabels:this.visualLabels.map(x=>({...x})),control:this.controlVisual,orbit:this.orbitVisual,intelligence:this.intelligenceVisual,archive:this.archiveVisual}}
    start(){if(this.started)return;this.started=true;this.resize();requestAnimationFrame(t=>this._loop(t))}
    _loop(t){this.frame=t*.001;this.zoom=lerp(this.zoom,this.targetZoom,.08);this.resize();this._renderGL(t*.001);this._renderOverlay(t*.001);requestAnimationFrame(x=>this._loop(x))}
    _modeNumber(){return {SPACE:0,CONTROL:1,ORBIT:2,INTELLIGENCE:3,ARCHIVE:4}[this.mode]??0}
    _renderGL(t){if(!this.gl||!this.program)return;const gl=this.gl,rect=this.glCanvas.getBoundingClientRect(),w=Math.max(1,rect.width),h=Math.max(1,rect.height),aspect=w/h;let e=this.mode==='SPACE'?{x:w*.5,y:h*.5,r:0}:this._earthScreen(w,h,this.mode);if(this.mode==='SPACE'&&this.focusTarget==='EARTH')e=this._spaceFocusScreen(w,h);gl.useProgram(this.program);gl.uniform2f(this.uniforms.u_resolution,this.glCanvas.width,this.glCanvas.height);gl.uniform1f(this.uniforms.u_time,t);gl.uniform1f(this.uniforms.u_mode,this._modeNumber());gl.uniform1f(this.uniforms.u_yaw,this.yaw);gl.uniform1f(this.uniforms.u_pitch,this.pitch);gl.uniform1f(this.uniforms.u_zoom,this.zoom);gl.uniform1f(this.uniforms.u_texReady,this.earthTextureReady?1:0);gl.uniform1f(this.uniforms.u_grid,this.grid?1:0);gl.uniform3f(this.uniforms.u_earthPose,(e.x/w-.5)*aspect,.5-e.y/h,e.r/h);gl.activeTexture(gl.TEXTURE0);gl.bindTexture(gl.TEXTURE_2D,this.earthTex);gl.uniform1i(this.uniforms.u_earth,0);gl.drawArrays(gl.TRIANGLES,0,3)}
    _renderOverlay(t){
      const ctx=this.ctx,r=this.overlayCanvas.getBoundingClientRect(),w=r.width,h=r.height;ctx.clearRect(0,0,w,h);this.hitTargets=[];this.visualLabels=[];
      ctx.save();ctx.globalCompositeOperation='source-over';
      if(this.mode==='SPACE')this._space(ctx,w,h,t);else if(this.mode==='CONTROL')this._control(ctx,w,h,t);else if(this.mode==='ORBIT')this._orbit(ctx,w,h,t);else if(this.mode==='INTELLIGENCE')this._intelligence(ctx,w,h,t);else this._archive(ctx,w,h,t);
      ctx.restore();
    }
    _line(ctx,x1,y1,x2,y2,color='rgba(158,223,255,.25)',width=1,dash=[]){ctx.save();ctx.strokeStyle=color;ctx.lineWidth=width;ctx.setLineDash(dash);ctx.beginPath();ctx.moveTo(x1,y1);ctx.lineTo(x2,y2);ctx.stroke();ctx.restore()}
    _visualText(v){if(window.AetherusI18n?.locale!=='ko')return String(v??'');const m={MERCURY:'수성',VENUS:'금성',EARTH:'지구',MARS:'화성',JUPITER:'목성',SATURN:'토성',URANUS:'천왕성',NEPTUNE:'해왕성','TARGET ORBIT':'목표 궤도','MISSION MODEL / VISUAL REFERENCE':'미션 모델 / 시각 기준','STAGE 1':'1단 분리','ORBIT INSERT':'궤도 진입','SEMANTIC SHELL':'시맨틱 쉘','CONJUNCTION':'근접사건','EVIDENCE':'근거','OFFICIAL':'공식','SIGNAL':'신호','PROMOTED':'승격','EVENT':'이벤트','REVISION':'리비전','APPEND-ONLY':'추가 전용','ARCHIVED':'보관','FIXED OFFICIAL ARCHIVE':'고정 공식 아카이브','MISSION':'미션','VISUAL REFERENCE':'시각 기준','SCREENING':'스크리닝','UNAVAILABLE':'사용 불가','WHAT HAPPENED':'무슨 일이 있었나','WHAT CHANGED':'무엇이 바뀌었나','WHY IT MATTERS':'왜 중요한가','CONFIDENCE':'신뢰도','UNCERTAINTY':'불확실성','TRAJECTORY UNAVAILABLE':'궤적 자료 없음','NO SOURCE-BACKED FLIGHT PATH':'출처가 확인된 비행경로 없음','GLOBAL ENVIRONMENT':'전체 궤도 환경','SCREENING RELATIVE GEOMETRY':'스크리닝 상대기하','VALIDATION FIXTURE':'검증용 자료','Apollo 11 launch is recorded by the fixed NASA official fixture.':'Apollo 11 발사가 NASA 공식 고정 자료에 기록되어 있습니다.'};let out=String(v??'');if(m[out])return m[out];for(const [a,b] of Object.entries(m)){out=out.replaceAll(a,b)}return out}
    _label(ctx,text,x,y,sub='',align='left',accent='#dce8ee'){
      if(!this.labels)return;const key=String(text??'');text=this._visualText(text);sub=this._visualText(sub);const bounds=this.overlayCanvas.getBoundingClientRect(),w=bounds.width||9999;ctx.save();ctx.font='600 9px Inter,system-ui';const mainW=ctx.measureText(String(text)).width;ctx.font='7px SFMono-Regular,Consolas,monospace';const subW=sub?ctx.measureText(String(sub)).width:0;const tw=Math.max(mainW,subW),pad=w<700?8:5;let a=align,xx=x;
      if(a==='left'&&xx+tw>w-pad){a='right';xx=Math.min(w-pad,xx)}else if(a==='right'&&xx-tw<pad){a='left';xx=Math.max(pad,xx)}else if(a==='center'){xx=clamp(xx,pad+tw/2,w-pad-tw/2)}
      const left=a==='left'?xx:a==='right'?xx-tw:xx-tw/2;this.visualLabels.push({key,x:left,y:y-9,width:tw,height:sub?22:11});ctx.textAlign=a;ctx.fillStyle=accent;ctx.font='600 9px Inter,system-ui';ctx.fillText(text,xx,y);if(sub){ctx.fillStyle='#556875';ctx.font='7px SFMono-Regular,Consolas,monospace';ctx.fillText(sub,xx,y+11)}ctx.restore()
    }
    _glowDot(ctx,x,y,r,color,alpha=1){ctx.save();ctx.globalCompositeOperation='lighter';const g=ctx.createRadialGradient(x,y,0,x,y,r*4);g.addColorStop(0,color);g.addColorStop(.16,color);g.addColorStop(1,'rgba(0,0,0,0)');ctx.globalAlpha=.16*alpha;ctx.fillStyle=g;ctx.beginPath();ctx.arc(x,y,r*4,0,TAU);ctx.fill();ctx.globalAlpha=alpha;ctx.fillStyle=color;ctx.beginPath();ctx.arc(x,y,r,0,TAU);ctx.fill();ctx.restore()}
    _ellipse(ctx,cx,cy,rx,ry,rot,color='rgba(129,166,190,.16)',width=1,dash=[]){ctx.save();ctx.translate(cx,cy);ctx.rotate(rot);ctx.strokeStyle=color;ctx.lineWidth=width;ctx.setLineDash(dash);ctx.beginPath();ctx.ellipse(0,0,rx,ry,0,0,TAU);ctx.stroke();ctx.restore()}
    _spaceFocusScreen(w,h){const mobile=w<700,r=Math.min(w,h)*(mobile?.215:.255)*clamp(this.zoom,.82,1.22);return{x:w*(mobile?.5:.48),y:h*(mobile?.54:.55),r}}
    _sunSphere(ctx,x,y,r,t){ctx.save();const halo=ctx.createRadialGradient(x,y,r*.15,x,y,r*3.2);halo.addColorStop(0,'rgba(255,244,203,.98)');halo.addColorStop(.28,'rgba(240,174,65,.34)');halo.addColorStop(1,'rgba(218,112,35,0)');ctx.fillStyle=halo;ctx.beginPath();ctx.arc(x,y,r*3.2,0,TAU);ctx.fill();const g=ctx.createRadialGradient(x-r*.32,y-r*.36,r*.08,x,y,r);g.addColorStop(0,'#fff7cf');g.addColorStop(.38,'#f5c365');g.addColorStop(.82,'#ce702d');g.addColorStop(1,'#6f2f18');ctx.fillStyle=g;ctx.beginPath();ctx.arc(x,y,r,0,TAU);ctx.fill();ctx.globalAlpha=.28;ctx.strokeStyle='#fff0b0';ctx.lineWidth=Math.max(.7,r*.025);for(let i=0;i<5;i++){ctx.beginPath();ctx.arc(x+Math.sin(t*.15+i*1.7)*r*.24,y+Math.cos(t*.11+i*2.1)*r*.22,r*(.18+i*.03),i*.5,i*.5+1.8);ctx.stroke()}ctx.restore()}
    _planetSphere(ctx,id,x,y,r,t){
      const palette={MERCURY:['#b7b4ab','#4e4e4b'],VENUS:['#e7c889','#8c5f32'],EARTH:['#4bb4dc','#071f35'],MARS:['#da8258','#642c22'],JUPITER:['#dfc5a8','#806957'],SATURN:['#e2cf9e','#88785b'],URANUS:['#a7e1df','#3f8893'],NEPTUNE:['#6c8fe2','#1b326f']};const p=palette[id]||['#c5d0d6','#394852'];
      ctx.save();if(id==='SATURN'){ctx.save();ctx.translate(x,y);ctx.rotate(-.18);ctx.strokeStyle='rgba(229,211,167,.62)';ctx.lineWidth=Math.max(1,r*.12);ctx.beginPath();ctx.ellipse(0,0,r*1.7,r*.42,0,Math.PI,TAU);ctx.stroke();ctx.restore()}
      const base=ctx.createRadialGradient(x-r*.34,y-r*.38,r*.05,x+r*.1,y+r*.08,r*1.08);base.addColorStop(0,p[0]);base.addColorStop(.54,p[0]);base.addColorStop(1,p[1]);ctx.fillStyle=base;ctx.beginPath();ctx.arc(x,y,r,0,TAU);ctx.fill();ctx.save();ctx.beginPath();ctx.arc(x,y,r,0,TAU);ctx.clip();
      if(['VENUS','JUPITER','SATURN','URANUS','NEPTUNE'].includes(id)){ctx.globalAlpha=id==='JUPITER'?.34:.18;for(let i=-5;i<=5;i++){ctx.strokeStyle=i%2?'#fff2c9':'#533c33';ctx.lineWidth=Math.max(.7,r*(id==='JUPITER'?.055:.035));ctx.beginPath();ctx.ellipse(x+Math.sin(i+t*.02)*r*.08,y+i*r*.14,r*1.05,r*.08,0,0,TAU);ctx.stroke()}if(id==='JUPITER'){ctx.fillStyle='rgba(149,72,52,.66)';ctx.beginPath();ctx.ellipse(x+r*.36,y+r*.22,r*.19,r*.1,-.1,0,TAU);ctx.fill()}}
      if(id==='MARS'||id==='MERCURY'){ctx.globalAlpha=.28;for(let i=0;i<10;i++){const a=i*2.19+t*.002,rr=r*(.15+(i%4)*.18),cr=Math.max(.7,r*(.035+(i%3)*.018));ctx.fillStyle=i%2?'#3a241f':'#ead0aa';ctx.beginPath();ctx.arc(x+Math.cos(a)*rr,y+Math.sin(a)*rr*.72,cr,0,TAU);ctx.fill()}}
      if(id==='EARTH'&&this.earthImageReady){const period=r*4,shift=((this.yaw+t*.012)%TAU)/TAU*period;ctx.globalAlpha=.62;for(let k=-1;k<=1;k++)ctx.drawImage(this.earthImg,x-r*2-shift+k*period,y-r,period,r*2)}
      const terminator=ctx.createLinearGradient(x-r,y-r*.2,x+r,y+r*.25);terminator.addColorStop(0,'rgba(0,0,0,.78)');terminator.addColorStop(.42,'rgba(0,0,0,.2)');terminator.addColorStop(.78,'rgba(0,0,0,0)');ctx.fillStyle=terminator;ctx.fillRect(x-r,y-r,r*2,r*2);ctx.restore();ctx.strokeStyle=id==='EARTH'?'rgba(126,220,255,.62)':'rgba(235,241,239,.22)';ctx.lineWidth=Math.max(.7,r*.012);ctx.beginPath();ctx.arc(x,y,r,0,TAU);ctx.stroke();if(id==='SATURN'){ctx.save();ctx.translate(x,y);ctx.rotate(-.18);ctx.strokeStyle='rgba(240,223,184,.82)';ctx.lineWidth=Math.max(1,r*.1);ctx.beginPath();ctx.ellipse(0,0,r*1.7,r*.42,0,0,Math.PI);ctx.stroke();ctx.restore()}ctx.restore()
    }
    _space(ctx,w,h,t){
      const objs=this.data?.objects||[];this.focusedBodyRadius=0;
      if(this.focusTarget){const body=objs.find(o=>o.id===this.focusTarget);if(!body){this.clearFocus();return this._space(ctx,w,h,t)}const e=this._spaceFocusScreen(w,h);this.focusedBodyRadius=e.r;const v=len3(body.position_km),au=v/149597870.7;
        const sunX=Math.max(28,e.x-e.r*2.45),sunY=e.y-e.r*.62;this._sunSphere(ctx,sunX,sunY,Math.max(5,e.r*.07),t);this._line(ctx,sunX,sunY,e.x-e.r*.94,e.y-e.r*.2,'rgba(236,190,105,.14)',1,[4,7]);
        if(!(body.id==='EARTH'&&this.gl))this._planetSphere(ctx,body.id,e.x,e.y,e.r,t);if(body.id==='EARTH'){ctx.strokeStyle='rgba(122,211,246,.23)';ctx.lineWidth=1;ctx.beginPath();ctx.arc(e.x,e.y,e.r*1.09,0,TAU);ctx.stroke()}
        this._ellipse(ctx,e.x,e.y,e.r*1.42,e.r*.34,-.12,'rgba(140,184,209,.16)',1,[5,7]);this._label(ctx,body.id,e.x-e.r*.95,e.y-e.r*.94,`${au.toFixed(3)} AU · ${body.validation_state||'RESEARCH_ONLY'}`,'left','#e5f3f8');this._label(ctx,'SUNLIGHT',e.x-e.r*.94,e.y+e.r*.92,'TERMINATOR / DEPTH','left','#806f58');this.hitTargets.push({type:'OBJECT',id:body.id,x:e.x,y:e.y,radius:e.r,data:body});return
      }
      const cx=w*.5,cy=h*.535,max=Math.min(w*.43,h*.68);const vals=objs.map(o=>len3(o.position_km));const maxLog=Math.max(...vals.map(v=>Math.log10(v+1)),1),minLog=Math.min(...vals.map(v=>Math.log10(v+1)),maxLog-1),viewScale=.3+clamp(this.zoom,.72,2.4)*.7;
      if(this.grid){for(let i=-4;i<=4;i++)this._line(ctx,cx-max,cy+i*28,cx+max,cy+i*28,'rgba(130,171,197,.035)')}
      const sunR=clamp(9*this.zoom,7,15);this._sunSphere(ctx,cx,cy,sunR,t);
      const sizes={MERCURY:5,VENUS:6.5,EARTH:7,MARS:5.8,JUPITER:10.5,SATURN:9.5,URANUS:7.2,NEPTUNE:7.2},mobile=w<700,mobileLabelLayout={JUPITER:{dx:-12,dy:23,align:'right'},EARTH:{dx:12,dy:-11,align:'left'},SATURN:{dx:-8,dy:25,align:'center'},NEPTUNE:{dx:-8,dy:-17,align:'right'}};
      objs.forEach(o=>{const v=len3(o.position_km),f=(Math.log10(v+1)-minLog)/(maxLog-minLog||1),rr=(38+f*(max-44))*viewScale,angle=Math.atan2(o.position_km?.[1]||0,o.position_km?.[0]||1)+this.yaw*.22,tilt=.34,x=cx+Math.cos(angle)*rr,y=cy+Math.sin(angle)*rr*tilt,s=clamp((sizes[o.id]||6)*(.6+this.zoom*.4),4.5,14);this._ellipse(ctx,cx,cy,rr,rr*tilt,0,'rgba(131,167,188,'+(o.id==='EARTH'?'.20':'.085')+')',o.id==='EARTH'?1.1:.65);this._planetSphere(ctx,o.id,x,y,s,t);if(o.id==='EARTH'){ctx.strokeStyle='rgba(158,223,255,.45)';ctx.beginPath();ctx.arc(x,y,s+5+Math.sin(t*2),0,TAU);ctx.stroke()}if(!mobile)this._label(ctx,o.id,x+s+7,y-2,`${(v/149597870.7).toFixed(2)} AU`,'left',o.id==='EARTH'?'#ccefff':'#bac6cc');else if(mobileLabelLayout[o.id]){const p=mobileLabelLayout[o.id];this._label(ctx,o.id,x+p.dx,y+p.dy,`${(v/149597870.7).toFixed(2)} AU`,p.align,o.id==='EARTH'?'#ccefff':'#bac6cc')}this.hitTargets.push({type:'OBJECT',id:o.id,x,y,radius:Math.max(15,s+5),data:o})});
      const earth=this.hitTargets.find(h=>h.id==='EARTH');if(earth)this._line(ctx,cx,cy,earth.x,earth.y,'rgba(158,223,255,.12)',.8,[3,5]);ctx.save();ctx.fillStyle='#394954';ctx.font='7px SFMono-Regular,monospace';ctx.fillText('ICRF APPROX · SEMANTIC LOG DISTANCE',cx-max+4,cy+max*.45);ctx.restore()
    }
    _earthScreen(w,h,mode){
      const mobile=w<700;let r=Math.min(h*(mobile?.37:.43),w*(mobile?.29:.31))*this.zoom;let x=w*(mobile?.50:(mode==='INTELLIGENCE'?0.39:mode==='ARCHIVE'?0.43:0.51)),y=h*(mobile?.52:(mode==='CONTROL'?0.56:0.54));if(mode==='ORBIT')r*=mobile?.82:.78;if(mode==='INTELLIGENCE')r*=mobile?.76:.70;if(mode==='ARCHIVE')r*=mobile?.80:.74;return{x,y,r};
    }
    _drawEarth2D(ctx,e,t){
      if(this.gl)return;
      const {x,y,r}=e;ctx.save();
      // atmosphere halo
      ctx.globalCompositeOperation='lighter';let halo=ctx.createRadialGradient(x,y,r*.78,x,y,r*1.22);halo.addColorStop(0,'rgba(0,0,0,0)');halo.addColorStop(.73,'rgba(40,154,210,0)');halo.addColorStop(.86,'rgba(83,196,238,.14)');halo.addColorStop(1,'rgba(65,147,200,0)');ctx.fillStyle=halo;ctx.beginPath();ctx.arc(x,y,r*1.22,0,TAU);ctx.fill();ctx.globalCompositeOperation='source-over';
      // globe clip and moving real-continent texture
      ctx.save();ctx.beginPath();ctx.arc(x,y,r,0,TAU);ctx.clip();
      const ocean=ctx.createRadialGradient(x+r*.34,y-r*.38,r*.05,x,y,r*1.14);ocean.addColorStop(0,'#183c50');ocean.addColorStop(.34,'#0b2636');ocean.addColorStop(.74,'#06141f');ocean.addColorStop(1,'#02060a');ctx.fillStyle=ocean;ctx.fillRect(x-r,y-r,r*2,r*2);
      if(this.earthImageReady){const period=r*4,shift=((this.yaw+t*.012)%TAU)/TAU*period;for(let k=-1;k<=1;k++)ctx.drawImage(this.earthImg,x-r*2-shift+k*period,y-r,period,r*2)}
      // limb and terminator lighting
      let shade=ctx.createLinearGradient(x-r*.95,y+r*.2,x+r*.95,y-r*.35);shade.addColorStop(0,'rgba(0,3,8,.91)');shade.addColorStop(.42,'rgba(0,5,10,.42)');shade.addColorStop(.73,'rgba(65,143,170,.02)');shade.addColorStop(1,'rgba(160,218,228,.08)');ctx.fillStyle=shade;ctx.fillRect(x-r,y-r,r*2,r*2);
      // cloud bands, purely visualized atmosphere
      ctx.globalCompositeOperation='screen';ctx.globalAlpha=.11;for(let i=0;i<7;i++){const yy=y-r*.62+i*r*.20+Math.sin(t*.08+i)*r*.012;ctx.strokeStyle='rgba(215,235,241,.34)';ctx.lineWidth=Math.max(1,r*.012);ctx.beginPath();ctx.ellipse(x+Math.sin(i*1.7+t*.025)*r*.12,yy,r*(.46+.08*Math.sin(i)),r*.04,-.12,0,TAU);ctx.stroke()}ctx.globalAlpha=1;ctx.globalCompositeOperation='source-over';ctx.restore();
      // atmosphere rim + geodetic grid
      ctx.strokeStyle='rgba(118,211,245,.56)';ctx.lineWidth=1;ctx.beginPath();ctx.arc(x,y,r,0,TAU);ctx.stroke();ctx.strokeStyle='rgba(105,190,222,.10)';ctx.lineWidth=.7;if(this.grid){[-.6,-.3,0,.3,.6].forEach(v=>{ctx.beginPath();ctx.ellipse(x,y+v*r,r*Math.sqrt(1-v*v),r*.12,0,0,TAU);ctx.stroke()});[-.58,-.28,0,.28,.58].forEach(v=>{ctx.beginPath();ctx.ellipse(x+v*r,y,r*.12,r*Math.sqrt(1-v*v),0,0,TAU);ctx.stroke()})}
      // specular limb
      ctx.strokeStyle='rgba(192,239,255,.24)';ctx.lineWidth=2;ctx.beginPath();ctx.arc(x,y,r,-1.28,.54);ctx.stroke();ctx.restore();
    }
    _control(ctx,w,h,t){
      const e=this._earthScreen(w,h,'CONTROL');this._drawEarth2D(ctx,e,t);const m=(this.data?.missions||[])[0],trajectoryEnv=this.aux?.trajectory||{},trajectory=trajectoryEnv?.data||null,trajectoryStatus=trajectoryEnv?.data_status||'UNAVAILABLE',points=Array.isArray(trajectory?.points)?trajectory.points:[],targetOrbit=trajectory?.target_orbit||null,trajectoryVisible=points.length>1&&['OK','RESEARCH_ONLY'].includes(trajectoryStatus),targetOrbitVisible=trajectoryVisible&&!!targetOrbit?.frame,phase=m?.status==='COMPLETE'?'POST_MISSION':trajectoryVisible?'ASCENT':'PRE_LAUNCH';
      this.controlVisual={missionId:m?.mission_id||null,phase,trajectoryStatus,trajectoryVisible,targetOrbitVisible,trajectoryClass:trajectory?.evidence_class||null,targetOrbitFrame:targetOrbit?.frame||null};
      const lat=Number(m?.launch_site?.lat),lon=Number(m?.launch_site?.lon),hasSite=Number.isFinite(lat)&&Number.isFinite(lon),launch={x:e.x+(hasSite?lon/180:0)*e.r*.68,y:e.y-(hasSite?lat/90:0)*e.r*.56};
      if(hasSite){this._glowDot(ctx,launch.x,launch.y,2.8,'#e9bc72',.92);this._label(ctx,'LAUNCH SITE',launch.x-8,launch.y+17,`${Math.abs(lat).toFixed(4)}°${lat>=0?'N':'S'} · ${Math.abs(lon).toFixed(4)}°${lon>=0?'E':'W'}`,'right','#e8c88f')}
      if(trajectoryVisible){
        const projected=points.map(p=>{const pos=p.position_km||[0,0,0],n=len3(pos)||1;return{x:e.x+pos[0]/n*e.r*1.48,y:e.y-pos[2]/n*e.r*.53+pos[1]/n*e.r*.10,p}});ctx.save();ctx.strokeStyle=trajectory?.evidence_class==='OBSERVED'?'rgba(145,229,184,.72)':'rgba(158,223,255,.58)';ctx.lineWidth=1.35;ctx.setLineDash(trajectory?.evidence_class==='OBSERVED'?[]:[5,4]);ctx.beginPath();projected.forEach((p,i)=>i?ctx.lineTo(p.x,p.y):ctx.moveTo(p.x,p.y));ctx.stroke();ctx.restore();
        if(targetOrbitVisible){this._ellipse(ctx,e.x,e.y,e.r*1.55,e.r*.43,-.08,'rgba(111,196,235,.29)',1,[4,5]);this._label(ctx,'TARGET ORBIT',e.x+e.r*1.33,e.y-e.r*.16,`${targetOrbit.frame} · ${trajectory.source_label||trajectoryStatus}`,'left','#9edfff')}
        for(const sep of trajectory.stage_separations||[]){const pos=sep.position_km||[],n=len3(pos)||1,x=e.x+(pos[0]||0)/n*e.r*1.48,y=e.y-(pos[2]||0)/n*e.r*.53+(pos[1]||0)/n*e.r*.10;this._glowDot(ctx,x,y,2.4,'#d6eef8',.85);this._label(ctx,sep.label||sep.stage||'STAGE EVENT',x+7,y-4,sep.timestamp_utc||'','left','#8198a5')}
      }else{
        const x=w<700?w*.5:e.x+e.r*1.06,y=e.y-e.r*.66;ctx.save();ctx.fillStyle='rgba(5,10,15,.72)';ctx.strokeStyle='rgba(233,188,114,.22)';this._roundRect(ctx,x-82,y-21,164,43,8);ctx.fill();ctx.stroke();ctx.textAlign='center';ctx.fillStyle='#b9a88b';ctx.font='650 8px Inter,system-ui';ctx.fillText(this._visualText('TRAJECTORY UNAVAILABLE'),x,y-4);ctx.fillStyle='#665f56';ctx.font='7px SFMono-Regular,monospace';ctx.fillText(this._visualText('NO SOURCE-BACKED FLIGHT PATH'),x,y+10);ctx.restore()
      }
      if(m)this._label(ctx,m.name||m.mission_id,e.x-e.r*.98,e.y-e.r*.80,`${phase.replaceAll('_',' ')} · ${m.vehicle||''}`,'left','#e8f2f6');
      for(let i=0;i<22;i++){const a=i/22*TAU-.3,rr=e.r*1.8,x=e.x+Math.cos(a)*rr,y=e.y+Math.sin(a)*rr*.28;ctx.globalAlpha=i%3===0?.28:.08;ctx.fillStyle='#9edfff';ctx.fillRect(x,y,1.4,1.4)}ctx.globalAlpha=1;
    }
    _orbit(ctx,w,h,t){
      const e=this._earthScreen(w,h,'ORBIT');this._drawEarth2D(ctx,e,t);
      const shells=[['LEO',1.26,.34,'rgba(116,214,242,.30)','0–2,000 KM'],['MEO',1.68,.43,'rgba(128,167,232,.16)','2,000–35,786 KM'],['GEO',2.06,.51,'rgba(181,156,235,.15)','≈35,786 KM']],selected=this.orbitView,objects=this.data?.objects||[],showObjects=selected!=='GLOBAL',projected=[];
      const mobileOrbit=w<700,mobileShellY={LEO:e.y-e.r*.82,MEO:e.y,GEO:e.y+e.r*.82};shells.forEach(([name,s,sy,color,range])=>{const active=selected===name;this._ellipse(ctx,e.x,e.y,e.r*s,e.r*sy,-.11,active?color.replace(/\.[0-9]+\)/,'.52)'):color,active?1.6:.75,active?[]:[3,5]);if(mobileOrbit)this._label(ctx,name,w-10,mobileShellY[name],`${range} · ENVIRONMENT SHELL`,'right',active?'#bfefff':'#60717d');else this._label(ctx,name,e.x+e.r*s+8,e.y+(name==='MEO'?-9:name==='GEO'?-18:0),`${range} · ENVIRONMENT SHELL`,'left',active?'#bfefff':'#60717d')});
      if(selected==='GLOBAL'){ctx.save();ctx.globalCompositeOperation='lighter';for(let i=0;i<34;i++){const a=i/34*TAU,rr=e.r*(1.15+(i%4)*.035),x=e.x+Math.cos(a)*rr,y=e.y+Math.sin(a)*rr*.34;ctx.fillStyle=`rgba(93,193,227,${.012+(i%5)*.004})`;ctx.beginPath();ctx.arc(x,y,10+(i%3)*5,0,TAU);ctx.fill()}ctx.restore();this._label(ctx,'GLOBAL ENVIRONMENT',mobileOrbit?12:e.x-e.r*.96,mobileOrbit?e.y-e.r*1.28:e.y-e.r*.76,mobileOrbit?'IMPORTANT EVENTS ONLY':'SHELL DENSITY · IMPORTANT EVENTS ONLY','left','#9eb3bf')}
      if(showObjects)objects.forEach((o,i)=>{const pos=o.position_km||[0,0,0],norm=len3(pos)||1,x=e.x+pos[0]/norm*e.r*1.25,y=e.y-pos[2]/norm*e.r*.42+pos[1]/norm*e.r*.08;projected.push({o,x,y});this._glowDot(ctx,x,y,3.2,i===0?'#c7f1ff':'#ffb7a9',1);this._label(ctx,o.object_id,x+8,y-3,`${o.frame||'FRAME'} · VALIDATION FIXTURE`,'left',i===0?'#d7f5ff':'#ffd0c7');this.hitTargets.push({type:'OBJECT',id:o.object_id,x,y,radius:18,data:o})});
      const conjunctionVisible=selected==='EVENT'&&projected.length>=2,pc=this.data?.risk?.pc??null;
      if(conjunctionVisible){const a=projected[0],b=projected[1];this._line(ctx,a.x,a.y,b.x,b.y,'rgba(255,129,125,.78)',1.2,[3,3]);const mx=(a.x+b.x)/2,my=(a.y+b.y)/2;ctx.save();ctx.strokeStyle='rgba(255,129,125,.35)';ctx.setLineDash([2,4]);ctx.beginPath();ctx.ellipse(mx,my,20+Math.sin(t*2)*2,7,0,0,TAU);ctx.stroke();ctx.restore();this._label(ctx,'SCREENING RELATIVE GEOMETRY',mx+17,my-11,`${(this.data?.conjunction?.miss_distance_km??0).toFixed(2)} KM MISS · Pc ${pc===null?'NULL':pc}`,'left','#ffb1ae');this._label(ctx,'VALIDATION FIXTURE',e.x-e.r*.96,e.y-e.r*.76,'NOT AN OPERATIONAL CONJUNCTION','left','#d5a6a2')}
      this.orbitVisual={view:selected,fixtureClass:this.data?.fixture_class||null,visibleObjectCount:showObjects?objects.length:0,conjunctionVisible,radarSweepVisible:false,lineMeaning:conjunctionVisible?'SCREENING_RELATIVE_GEOMETRY':null,pc};
    }
    _intelligence(ctx,w,h,t){
      const e=this._earthScreen(w,h,'INTELLIGENCE');this._drawEarth2D(ctx,e,t);const packets=Array.isArray(this.data)?this.data:(this.data?.events||[]),packet=packets[0]||{},evidenceIds=(packet.evidence||[]).map(x=>x.id||x.evidence_id).filter(Boolean),eventId=packet.event?.id||packet.event?.event_id||null,revisionNo=Number(packet.revision?.revision_no||0),confidence=packet.confidence||{},uncertainty=packet.uncertainty||{};
      const sections=[
        {key:'WHAT_HAPPENED',label:'WHAT HAPPENED',value:(packet.what_happened||[])[0]||'No evidence-backed event is currently promoted.',accent:'#9edfff',meta:packet.event?.event_type||'EVENT'},
        {key:'WHAT_CHANGED',label:'WHAT CHANGED',value:(packet.what_changed||[])[0]||'No revision delta is available.',accent:'#e9bc72',meta:`REV ${revisionNo||'—'}`},
        {key:'WHY_IT_MATTERS',label:'WHY IT MATTERS',value:(packet.why_it_matters||[])[0]||'Importance has not been promoted.',accent:'#91e5b8',meta:packet.event?.validation_state||'VALIDATION PENDING'},
        {key:'CONFIDENCE',label:'CONFIDENCE',value:confidence.score===null||confidence.score===undefined?`${confidence.grade||'NOT SCORED'} · ${(confidence.limitations||[])[0]||'No numeric confidence claim.'}`:`${Math.round(confidence.score*100)}% · ${confidence.grade||''}`,accent:'#a6cae1',meta:confidence.policy_version||'POLICY'},
        {key:'UNCERTAINTY',label:'UNCERTAINTY',value:`${uncertainty.representation||'UNAVAILABLE'}${uncertainty.units?` · ${uncertainty.units}`:''}${(uncertainty.limitations||[])[0]?` · ${uncertainty.limitations[0]}`:''}`,accent:'#b9a2ff',meta:uncertainty.policy_version||'POLICY'}
      ];
      this.intelligenceVisual={packetEventId:eventId,evidenceIds,revisionNo,narrativeSections:sections.map(x=>x.key),staticPipelineDots:false,confidenceScore:confidence.score??null,uncertaintyRepresentation:uncertainty.representation||'UNAVAILABLE'};
      const mobile=w<700;
      if(mobile){const first=sections[0],x=14,y=h*.16,ww=w-28,hh=70;ctx.save();ctx.fillStyle='rgba(5,11,16,.7)';ctx.strokeStyle='rgba(158,223,255,.16)';this._roundRect(ctx,x,y,ww,hh,10);ctx.fill();ctx.stroke();ctx.fillStyle=first.accent;ctx.font='700 7px Inter,system-ui';ctx.fillText(this._visualText(first.label),x+12,y+17);ctx.fillStyle='#c8d5dc';ctx.font='500 9px Inter,system-ui';this._wrapText(ctx,this._visualText(first.value),x+12,y+36,ww-24,14,2);ctx.restore();const keys=sections.slice(1).map(s=>this._visualText(s.label));this._label(ctx,keys.join('  ·  '),w*.5,h*.76,`EVENT ${eventId?String(eventId).slice(0,8):'UNAVAILABLE'}`,'center','#8198a5')}
      else{const x=w*.56,ww=Math.min(w*.36,390),start=h*.15,gap=Math.min(68,h*.135);this._line(ctx,e.x+e.r*.72,e.y-e.r*.18,x-14,start+22,'rgba(158,223,255,.16)',1,[4,6]);sections.forEach((s,i)=>{const y=start+i*gap,hh=56;ctx.save();ctx.fillStyle='rgba(5,11,16,.68)';ctx.strokeStyle=i===0?'rgba(158,223,255,.19)':'rgba(145,181,202,.10)';this._roundRect(ctx,x,y,ww,hh,9);ctx.fill();ctx.stroke();ctx.fillStyle=s.accent;ctx.font='700 7px Inter,system-ui';ctx.fillText(this._visualText(s.label),x+12,y+15);ctx.textAlign='right';ctx.fillStyle='#556a76';ctx.font='7px SFMono-Regular,monospace';ctx.fillText(this._visualText(s.meta),x+ww-12,y+15);ctx.textAlign='left';ctx.fillStyle='#aebdc5';ctx.font='500 8px Inter,system-ui';this._wrapText(ctx,this._visualText(s.value),x+12,y+32,ww-24,12,2);ctx.restore();if(i<sections.length-1)this._line(ctx,x+8,y+hh,x+8,y+gap,'rgba(145,187,210,.13)',1)})}
      this._label(ctx,packet.event?.event_type||'EVENT',e.x-e.r*.9,e.y-e.r*.74,`${evidenceIds.length} EVIDENCE · REV ${revisionNo||'—'}`,'left','#d7edf7')
    }
    _archive(ctx,w,h,t){
      const e=this._earthScreen(w,h,'ARCHIVE');this._drawEarth2D(ctx,e,t);const items=this.data?.archive?.items||this.data?.items||[],stateClass=this.data?.state_class||'ARCHIVED_STATE',cursorRaw=this.archiveSelectionTime||this.data?.cursor_utc||this.universe?.current_time_utc||new Date().toISOString(),cursorDate=new Date(cursorRaw),validItems=items.filter(x=>!Number.isNaN(new Date(x.time_utc).getTime())),dates=validItems.map(x=>new Date(x.time_utc)),years=dates.map(d=>d.getUTCFullYear()),cursorYear=Number.isNaN(cursorDate.getTime())?new Date().getUTCFullYear():cursorDate.getUTCFullYear(),minYear=Math.min(...(years.length?years:[cursorYear]),cursorYear),maxYear=Math.max(...(years.length?years:[cursorYear]),cursorYear),span=Math.max(1,maxYear-minYear),tickCount=6,timelineYears=[...new Set(Array.from({length:tickCount},(_,i)=>Math.round(minYear+span*i/(tickCount-1))))],baseY=h*.77,left=w*.16,right=w*.84;
      this._line(ctx,left,baseY,right,baseY,'rgba(150,188,211,.22)',1);timelineYears.forEach(yr=>{const x=left+(yr-minYear)/span*(right-left);this._line(ctx,x,baseY-5,x,baseY+5,'rgba(150,188,211,.22)',1);this._label(ctx,String(yr),x,baseY+19,'','center','#536571')});
      const cursorX=left+(cursorYear-minYear)/span*(right-left);this._line(ctx,cursorX,baseY-14,cursorX,baseY+10,'rgba(233,188,114,.5)',1);this._label(ctx,'TIME CURSOR',cursorX,baseY+33,stateClass,'center','#917a58');
      validItems.forEach((item,i)=>{const d=dates[i],fraction=(d.getUTCFullYear()+d.getUTCMonth()/12-minYear)/span,x=clamp(left+fraction*(right-left),left,right),id=item.mission_id||item.object_id||item.event_id||`RECORD-${i+1}`,selected=id===this.archiveSelection;this._glowDot(ctx,x,baseY,selected?4.2:3.2,selected?'#e9bc72':'#9edfff',1);this._line(ctx,x,baseY,x,baseY-(selected?94:72),selected?'rgba(233,188,114,.38)':'rgba(158,223,255,.28)',1,[3,4]);this._label(ctx,id,x+8,baseY-(selected?98:76),`${item.state_kind||'ARCHIVED'} · ${item.fixture_class||'SOURCE RECORD'}`,'left',selected?'#f2d39b':'#d7f3ff');this.hitTargets.push({type:'ARCHIVE_RECORD',id,x,y:baseY,radius:22,data:item})});
      if(!validItems.length)this._label(ctx,stateClass,e.x-e.r*.95,e.y-e.r*.72,'NO STORED ARCHIVE RECORD AT THIS CURSOR','left','#a6c2d1');else this._label(ctx,stateClass,e.x-e.r*.95,e.y-e.r*.72,`${validItems.length} SOURCE-BACKED RECORD${validItems.length===1?'':'S'}`,'left','#a6c2d1');
      this.archiveVisual={stateClass,recordIds:validItems.map(x=>x.mission_id||x.object_id||x.event_id),timelineYears,hardcodedTimeline:false,selectedRecordId:this.archiveSelection,cursorUtc:cursorRaw};
    }
    _roundRect(ctx,x,y,w,h,r){const rr=Math.min(r,w/2,h/2);ctx.beginPath();ctx.moveTo(x+rr,y);ctx.arcTo(x+w,y,x+w,y+h,rr);ctx.arcTo(x+w,y+h,x,y+h,rr);ctx.arcTo(x,y+h,x,y,rr);ctx.arcTo(x,y,x+w,y,rr);ctx.closePath()}
    _wrapText(ctx,text,x,y,maxWidth,lineHeight,maxLines=3){const words=String(text).split(/\s+/);let line='',lines=0;for(let i=0;i<words.length;i++){const test=line+words[i]+' ';if(ctx.measureText(test).width>maxWidth&&line){ctx.fillText(line.trim(),x,y+lines*lineHeight);line=words[i]+' ';lines++;if(lines>=maxLines)return}else line=test}if(line&&lines<maxLines)ctx.fillText(line.trim(),x,y+lines*lineHeight)}
  }
  window.AetherusVisualEngine=AetherusVisualEngine;
})();
