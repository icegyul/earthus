function tokens(text){return new Set(String(text??'').toLowerCase().split(/[^a-z0-9가-힣]+/).filter(x=>x.length>2));}
function jaccard(a,b){const inter=[...a].filter(x=>b.has(x)).length,uni=new Set([...a,...b]).size;return uni?inter/uni:0;}
export function evaluateNewEngineProposal(proposal,catalog,{gapEvidence=null,similarityThreshold=.34}={}){
  if(!proposal?.name||!proposal?.purpose) throw new TypeError('proposal name/purpose required');
  const pt=tokens(`${proposal.name} ${proposal.purpose} ${(proposal.capabilities??[]).join(' ')}`);
  const matches=catalog.map(e=>({id:e.id,name:e.name,maturity:e.maturity,score:jaccard(pt,tokens(`${e.name} ${e.action??''} ${e.definitionOfDone??''}`))})).sort((a,b)=>b.score-a.score);
  const likely=matches.filter(m=>m.score>=similarityThreshold).slice(0,5); if(likely.length&&!gapEvidence) return Object.freeze({decision:'BLOCK_NEW_ENGINE',reason:'REUSE_CANDIDATE_EXISTS',matches:Object.freeze(likely)});
  if(!gapEvidence||!gapEvidence.repositorySearch||!gapEvidence.catalogSearch||!gapEvidence.capabilityGap) return Object.freeze({decision:'BLOCK_NEW_ENGINE',reason:'GAP_EVIDENCE_INCOMPLETE',matches:Object.freeze(likely)});
  return Object.freeze({decision:'NEW_ENGINE_ALLOWED_FOR_IMPLEMENTATION_REVIEW',matches:Object.freeze(likely),gapEvidence:Object.freeze(structuredClone(gapEvidence))});
}
