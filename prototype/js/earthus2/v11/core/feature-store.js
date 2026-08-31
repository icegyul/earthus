import { clamp01, isoOrNull, requireEvidenceKind, requireState, stableId } from './contracts.js';
export class IntelligenceFeatureStore {
  #rows=[];
  append(input={}) {
    const observedAt=isoOrNull(input.observedAt || input.validAt);
    const evidenceKind=requireEvidenceKind(input.evidenceKind);
    if(!input.subjectId || !input.featureKey || !input.sourceId || !observedAt || !evidenceKind) {
      return { accepted:false, reason:'MISSING_PROVENANCE' };
    }
    if(input.value===undefined || input.value===null || (typeof input.value==='number' && !Number.isFinite(input.value))) {
      return { accepted:false, reason:'MISSING_VALUE' };
    }
    const row=Object.freeze({
      featureValueId: input.featureValueId || stableId([input.subjectId,input.featureKey,input.sourceId,observedAt,JSON.stringify(input.value)]),
      subjectId:String(input.subjectId), featureKey:String(input.featureKey), value:structuredClone(input.value),
      unit:input.unit||null, sourceId:String(input.sourceId), evidenceKind, observedAt,
      validAt:isoOrNull(input.validAt)||observedAt, confidence:clamp01(input.confidence??1),
      dataState:input.dataState||'LIVE', releaseState:requireState(input.releaseState,'SHADOW'),
      metadata:structuredClone(input.metadata||{}),
    });
    const same=this.#rows.find(r=>r.featureValueId===row.featureValueId);
    if(same) return {accepted:false,reason:'DUPLICATE',row:same};
    this.#rows.push(row); return {accepted:true,row};
  }
  latest(subjectId, featureKey, {at=null}={}) {
    const ceiling=at?Date.parse(at):Infinity;
    return this.#rows.filter(r=>r.subjectId===subjectId&&r.featureKey===featureKey&&Date.parse(r.validAt)<=ceiling)
      .sort((a,b)=>Date.parse(b.validAt)-Date.parse(a.validAt))[0]||null;
  }
  list({subjectId=null,featureKey=null}={}) { return this.#rows.filter(r=>(!subjectId||r.subjectId===subjectId)&&(!featureKey||r.featureKey===featureKey)).map(structuredClone); }
  snapshot(){return this.#rows.map(structuredClone);}
}
