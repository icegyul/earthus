const REL=new Set(['OBSERVATION_OF','REPORTED_BY','ACTION_RESPONDS_TO','DERIVED_FROM','SUPERSEDES','RELATED_TO']);
export function addLineageEdge(edges=[],edge={}){
  if(!edge.from||!edge.to||!REL.has(edge.relation)) throw new Error('INVALID_LINEAGE_EDGE');
  if(edge.from===edge.to) throw new Error('SELF_LINEAGE_FORBIDDEN');
  const key=`${edge.from}|${edge.relation}|${edge.to}`; if(edges.some(e=>`${e.from}|${e.relation}|${e.to}`===key)) return edges;
  if(edge.relation==='DERIVED_FROM'){
    const adj=new Map(); for(const e of edges.filter(e=>e.relation==='DERIVED_FROM')){if(!adj.has(e.from))adj.set(e.from,[]);adj.get(e.from).push(e.to);} if(!adj.has(edge.from))adj.set(edge.from,[]);adj.get(edge.from).push(edge.to);
    const seen=new Set(); const stack=[edge.to]; while(stack.length){const n=stack.pop();if(n===edge.from)throw new Error('LINEAGE_CYCLE');if(seen.has(n))continue;seen.add(n);for(const m of adj.get(n)||[])stack.push(m);}
  }
  return [...edges,{...edge}];
}
