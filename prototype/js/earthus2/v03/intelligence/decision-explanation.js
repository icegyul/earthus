export function explainDecision({decision,contributions={},hardGates=[],evidence=[]}={}){
  if(hardGates.length)return{decision,blocked:true,primaryReason:hardGates[0],hardGates:[...hardGates],contributions:[],evidence:[...evidence]};
  const ranked=Object.entries(contributions).filter(([,v])=>Number.isFinite(v)).map(([name,value])=>({name,value,abs:Math.abs(value)})).sort((a,b)=>b.abs-a.abs).map(({abs,...x})=>x);
  return{decision,blocked:false,primaryReason:ranked[0]?.name??'INSUFFICIENT_EVIDENCE',contributions:ranked,evidence:[...evidence]};
}
