function dist2(a,b){const dx=(a.lon-b.lon)*Math.cos(((a.lat+b.lat)/2)*Math.PI/180),dy=a.lat-b.lat;return Math.hypot(dx,dy)*111;}
export function clusterLightning(points,{radiusKm=25}={}){
  const clusters=[]; for(const p of points??[]){if(!Number.isFinite(p.lat)||!Number.isFinite(p.lon))continue;let c=clusters.find(c=>dist2(p,c.centroid)<=radiusKm);if(!c){c={points:[],centroid:{lat:p.lat,lon:p.lon}};clusters.push(c);}c.points.push(p);c.centroid={lat:c.points.reduce((s,x)=>s+x.lat,0)/c.points.length,lon:c.points.reduce((s,x)=>s+x.lon,0)/c.points.length};}
  return clusters.map((c,i)=>({cellId:`lightning-${i+1}`,count:c.points.length,centroid:c.centroid,latestAt:c.points.map(p=>p.at).filter(Boolean).sort().at(-1)??null}));
}
export function trackLightningCells(previous,current,{maxKm=60}={}){return current.map(c=>{let best=null,d=Infinity;for(const p of previous??[]){const x=dist2(c.centroid,p.centroid);if(x<d){d=x;best=p;}}return {...c,previousCellId:d<=maxKm?best?.cellId:null,motionEvidence:d<=maxKm?'CENTROID_MATCH':'NONE'};});}
