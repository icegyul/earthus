export function weatherForecastMetrics(records){
  const valid=records.filter(r=>Number.isFinite(r.predicted)&&Number.isFinite(r.actual)); if(!valid.length)return Object.freeze({count:0,mae:null,rmse:null,bias:null});
  const errors=valid.map(r=>r.predicted-r.actual); const mae=errors.reduce((s,e)=>s+Math.abs(e),0)/errors.length; const rmse=Math.sqrt(errors.reduce((s,e)=>s+e*e,0)/errors.length); const bias=errors.reduce((s,e)=>s+e,0)/errors.length;
  return Object.freeze({count:valid.length,mae,rmse,bias});
}
export function weatherModelPromotionGate({shadowMetrics,activeMetrics,minimumCount=30,calibrationPass=false,rollbackReady=false}){const failed=[];if((shadowMetrics?.count??0)<minimumCount)failed.push('INSUFFICIENT_COUNT');if(!calibrationPass)failed.push('CALIBRATION');if(!rollbackReady)failed.push('ROLLBACK');if(Number.isFinite(activeMetrics?.mae)&&Number.isFinite(shadowMetrics?.mae)&&shadowMetrics.mae>=activeMetrics.mae)failed.push('NO_MAE_IMPROVEMENT');return Object.freeze({pass:failed.length===0,failed:Object.freeze(failed)});}
