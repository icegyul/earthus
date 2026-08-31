export function evaluatePersonalImpact({items=[],signalsByLocation={},officialGates=[]}={}){
  return items.map(item=>{const gates=officialGates.filter(g=>g.locationId===item.locationId&&g.active);if(gates.length)return{itemId:item.id,state:'BLOCKED_OR_CAUTION',reason:'OFFICIAL_GATE',gates};const s=signalsByLocation[item.locationId]??{};const score=Math.max(0,Math.min(100,100-(s.crowd??0)*0.35-(s.weatherRisk??0)*0.4-(s.airRisk??0)*0.25));return{itemId:item.id,state:score>=70?'GOOD':score>=45?'MIXED':'POOR',score,reason:'DERIVED_CONTEXT'};});
}
