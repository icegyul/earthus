const TRANSITIONS=Object.freeze({FREE:['TRIAL','ACTIVE'],TRIAL:['ACTIVE','EXPIRED'],ACTIVE:['GRACE','PAST_DUE','CANCELED'],GRACE:['ACTIVE','EXPIRED'],PAST_DUE:['ACTIVE','EXPIRED','CANCELED'],CANCELED:['ACTIVE','EXPIRED'],EXPIRED:['ACTIVE']});
export function transitionSubscription(current,event){
  const map={START_TRIAL:'TRIAL',PAYMENT_CONFIRMED:'ACTIVE',PAYMENT_FAILED:'PAST_DUE',ENTER_GRACE:'GRACE',CANCEL:'CANCELED',EXPIRE:'EXPIRED',REACTIVATE:'ACTIVE'}; const next=map[event];
  if(!next) throw new TypeError(`unknown event: ${event}`); if(!(TRANSITIONS[current]??[]).includes(next)) return Object.freeze({allowed:false,current,next,reason:'INVALID_TRANSITION'}); return Object.freeze({allowed:true,current,next,event});
}
