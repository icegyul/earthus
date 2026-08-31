function stable(value){ if(Array.isArray(value)) return value.map(stable); if(value&&typeof value==='object') return Object.fromEntries(Object.keys(value).sort().map(k=>[k,stable(value[k])])); return value; }
function hash32(text){ let h=5381; for(const c of text) h=((h<<5)+h)^c.charCodeAt(0); return (h>>>0).toString(16).padStart(8,'0'); }
export function createFeatureSnapshot({entityId,issuedAt,features,sourceRefs=[],modelInputs={}}){
  if(!entityId||!issuedAt||!features||typeof features!=='object') throw new TypeError('entityId, issuedAt and features required');
  const payload={entityId,issuedAt,features:stable(features),sourceRefs:[...new Set(sourceRefs)].sort(),modelInputs:stable(modelInputs)};
  return Object.freeze({...payload,snapshotHash:hash32(JSON.stringify(payload))});
}
