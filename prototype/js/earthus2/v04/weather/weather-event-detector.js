export function detectWeatherEvents(features,{thresholds={heavyRainRate:30,rapidPressureDropHpa3h:6,cape:1000,convergence:0.5}}={}){
  const events=[];
  if(Number.isFinite(features.precipRateMmH)&&features.precipRateMmH>=thresholds.heavyRainRate) events.push({type:'HEAVY_PRECIP_SIGNAL',strength:features.precipRateMmH/thresholds.heavyRainRate});
  if(Number.isFinite(features.pressureDropHpa3h)&&features.pressureDropHpa3h>=thresholds.rapidPressureDropHpa3h) events.push({type:'RAPID_PRESSURE_FALL',strength:features.pressureDropHpa3h/thresholds.rapidPressureDropHpa3h});
  if(Number.isFinite(features.cape)&&features.cape>=thresholds.cape&&Number.isFinite(features.lowLevelConvergence)&&features.lowLevelConvergence>=thresholds.convergence) events.push({type:'CONVECTIVE_ENVIRONMENT',strength:Math.min(3,features.cape/thresholds.cape)});
  return Object.freeze({events:Object.freeze(events),officialWarning:false,meaning:'EARTHUS_DETECTOR_EVIDENCE_NOT_OFFICIAL_WARNING'});
}
