const TIER={SAFETY:100,SELECTED:80,PRIMARY:60,CONTEXT:30,DECORATIVE:0};
export function allocateLabels(labels,{max=8}={}){return (labels??[]).map((l,i)=>({...l,_i:i,_score:(TIER[l.tier]??10)+(Number(l.importance)||0)})).sort((a,b)=>b._score-a._score||a._i-b._i).slice(0,max).map(({_i,_score,...x})=>x);}
export function annotationBudget({device='desktop',scene='LAND'}={}){const base=device==='mobile'?5:8;return Math.max(3,base-(scene==='EVENT'?0:scene==='SPACE'?1:0));}
