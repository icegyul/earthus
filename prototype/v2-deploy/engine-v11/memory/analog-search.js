import { signatureDistance } from './event-signature.js';
export function findHistoricalAnalogs(target,history=[],opts={}){return history.map(item=>({item,match:signatureDistance(target,item,opts)})).filter(x=>x.match.comparable).sort((a,b)=>a.match.distance-b.match.distance).slice(0,opts.limit||10).map((x,i)=>({...x,rank:i+1,label:'HISTORICAL_ANALOG',notForecast:true}));}
