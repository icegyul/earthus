const EARTH_R=6371000; const toDeg=r=>r*180/Math.PI;
export function validateVectorProof(proof={}){return proof.vectorProof===true&&proof.sourceId&&proof.observedAt&&['WIND_VECTOR','CURRENT_VECTOR','RUNOFF_VECTOR'].includes(proof.kind);}
export function advectPoint({start,vectorSampler,vectorProof,stepSeconds=900,steps=8}={}){
 if(!Number.isFinite(start?.lat)||!Number.isFinite(start?.lon)||typeof vectorSampler!=='function')return{allowed:false,reason:'INVALID_INPUT'};
 if(!validateVectorProof(vectorProof))return{allowed:false,reason:'VECTOR_PROOF_REQUIRED'};
 const pts=[{lat:start.lat,lon:start.lon,at:new Date(Date.parse(start.at||vectorProof.observedAt)).toISOString()}];let lat=start.lat,lon=start.lon,t=Date.parse(pts[0].at);
 for(let i=0;i<steps;i++){const v1=vectorSampler({lat,lon,at:new Date(t).toISOString()});if(!Number.isFinite(v1?.east)||!Number.isFinite(v1?.north))return{allowed:false,reason:'VECTOR_GAP',points:pts};const midLat=lat+toDeg((v1.north*stepSeconds/2)/EARTH_R),midLon=lon+toDeg((v1.east*stepSeconds/2)/(EARTH_R*Math.max(.05,Math.cos(lat*Math.PI/180))));const v2=vectorSampler({lat:midLat,lon:midLon,at:new Date(t+stepSeconds*500).toISOString()});if(!Number.isFinite(v2?.east)||!Number.isFinite(v2?.north))return{allowed:false,reason:'VECTOR_GAP',points:pts};lat+=toDeg((v2.north*stepSeconds)/EARTH_R);lon+=toDeg((v2.east*stepSeconds)/(EARTH_R*Math.max(.05,Math.cos(lat*Math.PI/180))));t+=stepSeconds*1000;pts.push({lat,lon,at:new Date(t).toISOString()});}
 return{allowed:true,evidenceKind:'MODELLED',label:'MODELLED_TRANSPORT',sourceAttribution:'SOURCE_NOT_ATTRIBUTED',vectorSourceId:vectorProof.sourceId,points:pts};
}
