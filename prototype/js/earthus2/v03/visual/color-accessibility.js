export function semanticStyle({state='INFO',evidenceKind='OBSERVED',selected=false}={}){
  const pattern=evidenceKind==='SIMULATION'?'DASHED_PATTERN':evidenceKind.includes('FORECAST')?'TRANSLUCENT_PATTERN':'SOLID';
  const symbol=state==='WARNING'||state==='CRITICAL'?'RISK_SYMBOL':state==='UNKNOWN'?'UNKNOWN_SYMBOL':'INFO_SYMBOL';
  return {semanticToken:`${state}_${selected?'SELECTED':'NORMAL'}`,pattern,symbol,requiresTextLabel:true,rule:'COLOR_IS_NEVER_THE_ONLY_CUE'};
}
