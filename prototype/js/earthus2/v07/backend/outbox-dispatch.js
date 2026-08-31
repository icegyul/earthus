export function newOutboxEvent({id,type,payload,createdAt=Date.now(),dedupeKey=null,priority='NORMAL'}={}){
  if(!id||!type) throw new Error('OUTBOX_ID_TYPE_REQUIRED');
  return {id:String(id),type:String(type),payload,status:'PENDING',attempts:0,createdAt:Number(createdAt),availableAt:Number(createdAt),leaseUntil:0,dedupeKey,priority};
}
export function claimOutbox(events=[], {now=Date.now(),limit=50,leaseMs=30000}={}){
  const eligible=events.filter(e=>['PENDING','RETRY'].includes(e.status)&&Number(e.availableAt||0)<=now&&Number(e.leaseUntil||0)<=now)
    .sort((a,b)=>(b.priority==='SAFETY')-(a.priority==='SAFETY') || a.createdAt-b.createdAt).slice(0,limit);
  const ids=new Set(eligible.map(e=>e.id));
  return events.map(e=>ids.has(e.id)?{...e,status:'CLAIMED',leaseUntil:now+leaseMs,attempts:Number(e.attempts||0)+1}:e);
}
export function recordDispatchResult(event,{ok,retryable=false,now=Date.now(),delayMs=1000,maxAttempts=8,errorCode=null}={}){
  if(event.status!=='CLAIMED') throw new Error('OUTBOX_EVENT_NOT_CLAIMED');
  if(ok) return {...event,status:'DELIVERED',deliveredAt:now,leaseUntil:0,lastError:null};
  if(retryable && event.attempts<maxAttempts) return {...event,status:'RETRY',availableAt:now+delayMs,leaseUntil:0,lastError:errorCode};
  return {...event,status:'DEAD',leaseUntil:0,lastError:errorCode};
}
