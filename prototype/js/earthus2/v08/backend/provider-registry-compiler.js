function key(x){return `${String(x.providerId||'').toLowerCase()}::${String(x.operationId||'').toLowerCase()}`}
export function compileProviderRegistry(entries=[]){
 const seen=new Set(); const out=[];
 for(const e of entries){if(!e.providerId||!e.operationId)throw new Error('REGISTRY_PROVIDER_OPERATION_REQUIRED');const k=key(e);if(seen.has(k))throw new Error('REGISTRY_DUPLICATE_OPERATION');seen.add(k);if(!e.owner)throw new Error('REGISTRY_OWNER_REQUIRED');if(!e.truthClass)throw new Error('REGISTRY_TRUTH_CLASS_REQUIRED');if(!e.rights)throw new Error('REGISTRY_RIGHTS_REQUIRED');if(!Number.isFinite(Number(e.freshnessMs)))throw new Error('REGISTRY_FRESHNESS_REQUIRED');out.push({...e,providerId:String(e.providerId),operationId:String(e.operationId),enabled:e.enabled!==false});}
 out.sort((a,b)=>key(a).localeCompare(key(b)));return {version:1,operations:out};
}
export function registryDrift(a,b){const A=new Map((a?.operations||[]).map(x=>[key(x),JSON.stringify(x)]));const B=new Map((b?.operations||[]).map(x=>[key(x),JSON.stringify(x)]));const added=[],removed=[],changed=[];for(const [k,v] of B){if(!A.has(k))added.push(k);else if(A.get(k)!==v)changed.push(k)}for(const k of A.keys())if(!B.has(k))removed.push(k);return {added,removed,changed,drift:!!(added.length||removed.length||changed.length)}}
