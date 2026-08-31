export function normalizeWaveState({significantHeightM,directionDeg,periodS,sourceId,validAt}){
  if(!Number.isFinite(significantHeightM)||significantHeightM<0) throw new TypeError('significantHeightM required');
  const dir=Number.isFinite(directionDeg)?((directionDeg%360)+360)%360:null;
  return Object.freeze({significantHeightM,directionDeg:dir,periodS:Number.isFinite(periodS)?periodS:null,sourceId,validAt});
}
export function waveVisualPolicy(wave,{maxDisplayM=18,visualExaggeration=1.4}={}){
  const displayHeightM=Math.min(maxDisplayM,wave.significantHeightM*visualExaggeration);
  return {displayHeightM,exaggeration:visualExaggeration,label:'DATA_DRIVEN_VISUAL_NOT_FLUID_SIMULATION'};
}
