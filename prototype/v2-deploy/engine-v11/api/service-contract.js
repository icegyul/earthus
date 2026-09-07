export const ADVANCED_API_ROUTES=Object.freeze([
 ['GET','/api/v2/pulse'],['GET','/api/v2/events/:id'],['GET','/api/v2/events/:id/evidence'],
 ['GET','/api/v2/travel/discovery'],['GET','/api/v2/travel/place/:id/why-now'],['GET','/api/v2/travel/place/:id/best-window'],['GET','/api/v2/travel/place/:id/related'],
 ['GET','/api/v2/environment/pollution'],['GET','/api/v2/environment/pollution/:id'],['GET','/api/v2/environment/pollution/:id/transport'],
 ['GET','/api/v2/actions'],['GET','/api/v2/memory/analogs'],['GET','/api/v2/for-me'],['GET','/api/v2/ops/intelligence-health'],
]);
export function apiEnvelope({data=null,state='OK',source=[],observedAt=null,releaseState='SHADOW',reason=null}={}){return{schemaVersion:'2.0',state,releaseState,observedAt,source,data,reason};}
