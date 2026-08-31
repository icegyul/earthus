export class JobDependencyDag {
  #jobs = new Map();
  add(job){ if(!job?.id) throw new TypeError('job.id required'); this.#jobs.set(job.id,{...structuredClone(job),dependsOn:[...(job.dependsOn??[])]}); }
  topologicalOrder(){
    const indeg=new Map([...this.#jobs.keys()].map(k=>[k,0])); const out=new Map([...this.#jobs.keys()].map(k=>[k,[]]));
    for(const [id,j] of this.#jobs){ for(const dep of j.dependsOn){ if(!this.#jobs.has(dep)) throw new Error(`unknown dependency ${dep} for ${id}`); indeg.set(id,indeg.get(id)+1); out.get(dep).push(id); } }
    const q=[...indeg].filter(([,d])=>d===0).map(([id])=>id).sort(); const order=[];
    while(q.length){ const id=q.shift(); order.push(id); for(const n of out.get(id)){ indeg.set(n,indeg.get(n)-1); if(indeg.get(n)===0){q.push(n);q.sort();} } }
    if(order.length!==this.#jobs.size) throw new Error('JOB_DEPENDENCY_CYCLE');
    return order;
  }
  runnable(completed=[]){ const done=new Set(completed); return [...this.#jobs.values()].filter(j=>j.dependsOn.every(d=>done.has(d))&&!done.has(j.id)).map(j=>j.id).sort(); }
}
