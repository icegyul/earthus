export class NasArchiveAgentState {
  #jobs=new Map();
  enqueue(job){ if(!job?.archiveId||!job?.sourcePrefix) throw new TypeError('archiveId/sourcePrefix required'); const v={...structuredClone(job),state:'COPY_PENDING',bytesCopied:0,retryCount:0};this.#jobs.set(job.archiveId,v);return structuredClone(v); }
  next(){ const v=[...this.#jobs.values()].find(j=>['COPY_PENDING','COPY_FAILED'].includes(j.state)); return v?structuredClone(v):null; }
  update(archiveId,event,payload={}){ const j=this.#jobs.get(archiveId); if(!j) throw new Error('unknown archive job'); const allowed={COPY_PENDING:['START'],COPYING:['PROGRESS','VERIFY','FAIL'],VERIFYING:['VERIFIED','FAIL'],COPY_FAILED:['START'],NAS_VERIFIED:[]}; const target={START:'COPYING',PROGRESS:'COPYING',VERIFY:'VERIFYING',FAIL:'COPY_FAILED',VERIFIED:'NAS_VERIFIED'}[event]; if(!(allowed[j.state]??[]).includes(event)) throw new Error(`invalid transition ${j.state}->${event}`); const next={...j,...payload,state:target,retryCount:event==='FAIL'?j.retryCount+1:j.retryCount};this.#jobs.set(archiveId,next);return structuredClone(next); }
}
