const PUBLIC_CODES=new Set(['NOT_FOUND','UNAVAILABLE','STALE','RATE_LIMITED','UNAUTHORIZED','FORBIDDEN','VALIDATION_ERROR','INTERNAL_ERROR']);
export function apiOk(data,{traceId=null,sourceTime=null,truthClass=null,cache=null}={}){return {ok:true,data,meta:{traceId,sourceTime,truthClass,cache}};}
export function apiError({code='INTERNAL_ERROR',message='Request failed',traceId=null,retryable=false,status=500,details=null}={}){
  const safeCode=PUBLIC_CODES.has(code)?code:'INTERNAL_ERROR'; const safeMessage=String(message).replace(/(api[_-]?key|token|secret|authorization)\s*[:=]\s*[^\s,;]+/ig,'$1=[REDACTED]').slice(0,500);
  return {ok:false,error:{code:safeCode,message:safeMessage,retryable:Boolean(retryable),details:details&&typeof details==='object'?details:null},meta:{traceId},status:Number(status)};
}
export function mapProviderError(err={}){
  const s=Number(err.status||0); if(s===401)return apiError({code:'UNAUTHORIZED',message:'Provider authentication failed',status:502,traceId:err.traceId}); if(s===403)return apiError({code:'FORBIDDEN',message:'Provider operation is not permitted',status:502,traceId:err.traceId}); if(s===429)return apiError({code:'RATE_LIMITED',message:'Provider rate limit reached',status:503,retryable:true,traceId:err.traceId}); if(s>=500)return apiError({code:'UNAVAILABLE',message:'Provider temporarily unavailable',status:503,retryable:true,traceId:err.traceId}); return apiError({code:'INTERNAL_ERROR',message:'Provider request failed',status:502,traceId:err.traceId});
}
