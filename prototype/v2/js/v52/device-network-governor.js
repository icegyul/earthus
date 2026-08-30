export function deviceNetworkProfile({deviceClass='mobile',memoryGb=4,network='4G',saveData=false,batteryPct=100,thermal='NORMAL',prefersReducedMotion=false}={}){
  let quality=deviceClass==='desktop'?'FULL':'BALANCED'; const reasons=[];
  if(memoryGb<4){quality='LITE';reasons.push('LOW_MEMORY');}
  if(['3G','2G','OFFLINE'].includes(network)||saveData){quality='LITE';reasons.push('NETWORK_BUDGET');}
  if(batteryPct<=20){quality='LITE';reasons.push('LOW_BATTERY');}
  if(['ECO','SAFE'].includes(thermal)){quality=thermal==='SAFE'?'STATIC':'LITE';reasons.push(`THERMAL_${thermal}`);}
  if(prefersReducedMotion&&quality!=='STATIC') reasons.push('REDUCED_MOTION');
  const profiles={FULL:{maxFps:60,cloudMode:'LIMITED_VOLUME',terrainLodBias:0,prefetchRadius:2},BALANCED:{maxFps:30,cloudMode:'THREE_SHELL',terrainLodBias:1,prefetchRadius:1},LITE:{maxFps:24,cloudMode:'THREE_SHELL_LOW',terrainLodBias:2,prefetchRadius:0},STATIC:{maxFps:0,cloudMode:'STATIC_SHELL',terrainLodBias:3,prefetchRadius:0}};
  return Object.freeze({quality,...profiles[quality],reasons:Object.freeze(reasons),reducedMotion:prefersReducedMotion});
}
