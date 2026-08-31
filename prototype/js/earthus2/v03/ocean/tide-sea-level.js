export function seaLevelResidual({observedM,predictedAstronomicalM,observedAt}){
  if(!Number.isFinite(observedM)) throw new TypeError('observedM required');
  const residual=Number.isFinite(predictedAstronomicalM)?observedM-predictedAstronomicalM:null;
  return {observedM,predictedAstronomicalM:Number.isFinite(predictedAstronomicalM)?predictedAstronomicalM:null,residualM:residual,observedAt,meaning:residual==null?'OBSERVED_LEVEL_ONLY':'OBSERVED_MINUS_ASTRONOMICAL_PREDICTION'};
}
export function tideWindow(points,{thresholdM=null}={}){
  const valid=(points??[]).filter(p=>Number.isFinite(p.levelM)&&p.at).sort((a,b)=>Date.parse(a.at)-Date.parse(b.at));
  if(!valid.length) return {min:null,max:null,crossings:[]};
  const min=valid.reduce((a,b)=>a.levelM<b.levelM?a:b), max=valid.reduce((a,b)=>a.levelM>b.levelM?a:b);
  const crossings=thresholdM==null?[]:valid.filter((p,i)=>i&&((valid[i-1].levelM<thresholdM&&p.levelM>=thresholdM)||(valid[i-1].levelM>thresholdM&&p.levelM<=thresholdM)));
  return {min,max,crossings};
}
