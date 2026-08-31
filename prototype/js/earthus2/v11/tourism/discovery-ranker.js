import { clamp01, requireState } from '../core/contracts.js';
const DEFAULT=Object.freeze({demandSignal:.18,noveltySignal:.18,relationSignal:.16,diversitySignal:.14,dwellSignal:.12,weatherSuitability:.14,accessibilitySignal:.08});
export function scoreDiscovery(candidate={},policy={}){
 if(candidate.closed||candidate.officialRestriction||candidate.criticalHazard)return{eligible:false,reason:'SAFETY_OR_CLOSURE_GATE',score:null};
 const source=candidate.features||candidate;const weights={...DEFAULT,...(policy.weights||{})};const present=Object.keys(weights).filter(k=>Number.isFinite(source[k]));const min=policy.minSignals??3;if(present.length<min)return{eligible:false,reason:'INSUFFICIENT_EVIDENCE',score:null,presentSignals:present};
 const total=present.reduce((s,k)=>s+weights[k],0);const score=present.reduce((s,k)=>s+clamp01(source[k])*(weights[k]/total),0);
 return{eligible:true,score:Math.round(score*1000)/1000,label:'EARTHUS_DISCOVERY',releaseState:requireState(candidate.releaseState||policy.releaseState,'SHADOW'),presentSignals:present};
}
export function rankDiscoveries(candidates=[],policy={}){return candidates.map(candidate=>({candidate,result:scoreDiscovery(candidate,policy)})).filter(x=>x.result.eligible).sort((a,b)=>b.result.score-a.result.score);}
