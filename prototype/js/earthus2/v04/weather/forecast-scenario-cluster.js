function dist(a,b){if(a.length!==b.length)throw new Error('member vector length mismatch');return Math.sqrt(a.reduce((s,v,i)=>s+(v-b[i])**2,0)/a.length);}
export function clusterForecastScenarios(members,{k=3,maxIterations=20}={}){
  const valid=members.filter(m=>m?.id&&Array.isArray(m.values)&&m.values.every(Number.isFinite)); if(valid.length<2)return Object.freeze({state:'INSUFFICIENT_MEMBERS',clusters:Object.freeze([])}); k=Math.max(1,Math.min(k,valid.length));
  let medoids=valid.slice(0,k).map(m=>m.id); let groups=[];
  for(let it=0;it<maxIterations;it++){
    groups=medoids.map(id=>({medoidId:id,members:[]})); for(const m of valid){let best=0,bd=Infinity;groups.forEach((g,i)=>{const mm=valid.find(x=>x.id===g.medoidId);const d=dist(m.values,mm.values);if(d<bd){bd=d;best=i;}});groups[best].members.push(m);}
    const next=groups.map(g=>{let best=g.medoidId,score=Infinity;for(const cand of g.members){const s=g.members.reduce((sum,m)=>sum+dist(cand.values,m.values),0);if(s<score){score=s;best=cand.id;}}return best;}); if(next.every((id,i)=>id===medoids[i]))break;medoids=next;
  }
  const clusters=groups.filter(g=>g.members.length).map(g=>Object.freeze({scenarioId:`SCENARIO_${g.medoidId}`,medoidId:g.medoidId,probability:g.members.length/valid.length,memberIds:Object.freeze(g.members.map(m=>m.id)),representative:Object.freeze(structuredClone(valid.find(m=>m.id===g.medoidId).values))})).sort((a,b)=>b.probability-a.probability);
  return Object.freeze({state:'CLUSTERED',clusters:Object.freeze(clusters),memberCount:valid.length,meaning:'SCENARIO_CLUSTER_NOT_OFFICIAL_FORECAST'});
}
