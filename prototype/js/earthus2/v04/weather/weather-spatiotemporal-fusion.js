import { buildSpatiotemporalSnapshot } from '../human-flow/spatiotemporal-fusion.js';
export function fuseWeatherSignals(signals,{snapshotAt,requiredVariables=['temperature'],freshnessByVariable={}}={}){
  const snapshot=buildSpatiotemporalSnapshot(signals,{snapshotAt,requiredVariables,freshnessByVariable});
  const official={},earthus={},model={}; for(const [v,s] of Object.entries(snapshot.signals)){ if(String(s.evidenceKind).startsWith('OFFICIAL_'))official[v]=s; else if(String(s.evidenceKind).startsWith('EARTHUS_'))earthus[v]=s; else model[v]=s; }
  return Object.freeze({...snapshot,official:Object.freeze(official),earthus:Object.freeze(earthus),model:Object.freeze(model),truthClassesMixed:false});
}
