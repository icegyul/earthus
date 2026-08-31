export function buildConditionalHeaders(state = {}) {
  const headers={}; if(state.etag) headers['If-None-Match']=state.etag; if(state.lastModified) headers['If-Modified-Since']=state.lastModified; return headers;
}
export function classifyFetchResponse({status, headers={}}={}){
  const h=Object.fromEntries(Object.entries(headers).map(([k,v])=>[k.toLowerCase(),v]));
  if(Number(status)===304) return {kind:'NOT_MODIFIED', shouldParse:false, etag:h.etag??null, lastModified:h['last-modified']??null};
  if(Number(status)>=200 && Number(status)<300) return {kind:'CHANGED', shouldParse:true, etag:h.etag??null, lastModified:h['last-modified']??null};
  if(Number(status)===429) return {kind:'THROTTLED', shouldParse:false};
  if(Number(status)>=500) return {kind:'RETRYABLE_ERROR', shouldParse:false};
  return {kind:'FATAL_ERROR', shouldParse:false};
}
