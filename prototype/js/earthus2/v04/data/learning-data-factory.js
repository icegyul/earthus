import { fnv1a64, stableStringify } from '../../v02/core/math.js';
export function buildLearningExample({forecast,groundTruth,featureSnapshot,regime=null,rights={aiUse:false},provenanceRefs=[]}){
  if(!forecast?.modelVersion||!forecast?.issuedAt||!forecast?.targetAt) throw new TypeError('forecast identity required');
  if(!groundTruth||!Number.isFinite(groundTruth.actual)) return Object.freeze({accepted:false,reason:'GROUND_TRUTH_REQUIRED'});
  if(rights.aiUse!==true) return Object.freeze({accepted:false,reason:'AI_USE_RIGHTS_BLOCKED'});
  const features=structuredClone(featureSnapshot?.features??featureSnapshot??{}); for(const k of Object.keys(features)) if(/user|email|phone|token|preciseLocation/i.test(k)) delete features[k];
  const row={modelVersion:forecast.modelVersion,issuedAt:forecast.issuedAt,targetAt:forecast.targetAt,predicted:forecast.predicted??forecast.value,actual:groundTruth.actual,observedAt:groundTruth.observedAt??null,regime,features,provenanceRefs:[...new Set(provenanceRefs)].sort()};
  return Object.freeze({accepted:true,exampleId:`learn_${fnv1a64(stableStringify(row))}`,row:Object.freeze(row)});
}
