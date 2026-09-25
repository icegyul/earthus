export const STATES={PARKED:'PARKED',DRIVING:'DRIVING',RESTRICTED:'RESTRICTED',UNKNOWN:'UNKNOWN'};
export const ACTION={ALLOW:'ALLOW',LIMITED:'LIMITED',BLOCK:'BLOCK'};
export function safetyDecision({drivingState=STATES.UNKNOWN,criticalDisaster=false,marineAlert=false,feature}){
 if(criticalDisaster && ['local_discovery','leisure','commercial','reservation'].includes(feature)) return {action:ACTION.BLOCK,reason:'CRITICAL_DISASTER_OVERRIDE'};
 if(marineAlert && ['marine_leisure','sports','reservation'].includes(feature)) return {action:ACTION.BLOCK,reason:'MARINE_SAFETY_OVERRIDE'};
 if([STATES.DRIVING,STATES.RESTRICTED,STATES.UNKNOWN].includes(drivingState)){
  if(['keyboard_search','complex_filters','deep_detail','reservation','settings','satellite_playback','local_explore'].includes(feature)) return {action:ACTION.BLOCK,reason:'DRIVING_SAFE'};
  if(['map','current_weather','disaster_alert','directions'].includes(feature)) return {action:ACTION.ALLOW,reason:'DRIVING_SAFE'};
 }
 return {action:ACTION.ALLOW,reason:'NORMAL'};
}
export function assertBlocked(decision){if(decision.action!==ACTION.BLOCK) throw new Error('Expected BLOCK'); return true}
