export function detectRegime(series,{stableCv=0.08,trendThreshold=0.02}={}){
  const v=(series??[]).filter(Number.isFinite); if(v.length<4) return {regime:'UNKNOWN'}; const mean=v.reduce((s,x)=>s+x,0)/v.length; const sd=Math.sqrt(v.reduce((s,x)=>s+(x-mean)**2,0)/v.length); const cv=Math.abs(mean)>1e-9?sd/Math.abs(mean):Infinity; const slope=(v.at(-1)-v[0])/Math.max(1,v.length-1)/Math.max(1,Math.abs(mean));
  if(cv<=stableCv&&Math.abs(slope)<trendThreshold) return {regime:'STABLE',cv,slope}; return {regime:slope>=trendThreshold?'RISING':slope<=-trendThreshold?'FALLING':'VOLATILE',cv,slope};
}
