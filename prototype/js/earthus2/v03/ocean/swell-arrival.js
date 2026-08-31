const G=9.80665;
export function deepWaterGroupVelocity(periodS){ if(!Number.isFinite(periodS)||periodS<=0) throw new TypeError('periodS > 0 required'); return G*periodS/(4*Math.PI); }
export function estimateSwellArrival({distanceKm,periodS,issuedAt}){
  if(!Number.isFinite(distanceKm)||distanceKm<0) throw new TypeError('distanceKm required'); const cg=deepWaterGroupVelocity(periodS); const seconds=distanceKm*1000/cg;
  return {groupVelocityMs:cg,travelSeconds:seconds,arrivalAt:new Date(Date.parse(issuedAt)+seconds*1000).toISOString(),method:'DEEP_WATER_GROUP_VELOCITY_APPROX',nearshoreRefractionIncluded:false};
}
