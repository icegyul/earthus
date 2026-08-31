const TYPES=new Set(['RSS','ATOM','API','HTML_OFFICIAL']);
export function normalizeNewsSource(input={}){
  if(!input.id||!input.baseUrl)throw new Error('NEWS_SOURCE_ID_URL_REQUIRED');const type=TYPES.has(input.type)?input.type:'HTML_OFFICIAL';
  return Object.freeze({id:String(input.id),organization:String(input.organization||input.id),type,baseUrl:String(input.baseUrl),enabled:input.enabled!==false,official:input.official!==false,fetchIntervalMs:Math.max(300000,Number(input.fetchIntervalMs||3600000)),rights:{snippetOnly:input.rights?.snippetOnly!==false,fullTextAllowed:input.rights?.fullTextAllowed===true,imageRedisplay:input.rights?.imageRedisplay===true},policy:{robotsRequired:input.policy?.robotsRequired!==false,termsReviewed:input.policy?.termsReviewed===true,allowAutomatedFetch:input.policy?.allowAutomatedFetch===true}});
}
export function canFetchNewsSource(source){if(!source.enabled)return {allow:false,reason:'DISABLED'};if(!source.policy.allowAutomatedFetch)return {allow:false,reason:'AUTOMATED_FETCH_NOT_APPROVED'};if(!source.policy.termsReviewed)return {allow:false,reason:'TERMS_NOT_REVIEWED'};return {allow:true,reason:'SOURCE_POLICY_APPROVED'};}
