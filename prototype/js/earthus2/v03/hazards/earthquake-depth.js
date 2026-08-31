export function earthquakeDepthVisual({depthKm,magnitude,earthRadiusM=6371008.8,verticalExaggeration=1}){
  if(!Number.isFinite(depthKm)||depthKm<0) throw new TypeError('depthKm required');
  const ex=Math.max(0.25,Math.min(5,verticalExaggeration)); const displayDepthM=depthKm*1000*ex;
  return {displayRadiusM:Math.max(0,earthRadiusM-displayDepthM),actualDepthKm:depthKm,displayDepthKm:depthKm*ex,magnitude:Number.isFinite(magnitude)?magnitude:null,meaning:'HYPOCENTER_DEPTH_VISUALIZATION_NOT_WAVE_PREDICTION'};
}
function hav(lat1,lon1,lat2,lon2){const r=6371,p=Math.PI/180,dlat=(lat2-lat1)*p,dlon=(lon2-lon1)*p,a=Math.sin(dlat/2)**2+Math.cos(lat1*p)*Math.cos(lat2*p)*Math.sin(dlon/2)**2;return 2*r*Math.asin(Math.min(1,Math.sqrt(a)));}
export function clusterSeismicEvents(events,{maxKm=50,maxHours=24}={}){
  const clusters=[]; for(const e of events??[]){ if(!Number.isFinite(e.lat)||!Number.isFinite(e.lon)||!e.at) continue; let c=clusters.find(c=>Math.abs(Date.parse(e.at)-Date.parse(c.anchor.at))<=maxHours*3600000&&hav(e.lat,e.lon,c.anchor.lat,c.anchor.lon)<=maxKm); if(!c){c={anchor:e,events:[]};clusters.push(c);} c.events.push(e); }
  return clusters.map((c,i)=>({clusterId:`seismic-${i+1}`,count:c.events.length,events:structuredClone(c.events),interpretation:'SPATIOTEMPORAL_CONTEXT_NOT_AFTERSHOCK_PREDICTION'}));
}
