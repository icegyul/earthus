// EARTHUS 2.0 official provider credential validation.
// Fixed allow-listed endpoints only: no caller-controlled URL, no SSRF.
// Raw credentials are decrypted server-side and never returned or logged.

import { createClient, type SupabaseClient } from 'jsr:@supabase/supabase-js@2';

type StaffRole = 'SUPER_ADMIN' | 'DEVELOPER' | 'OPERATIONS';
type Json = Record<string, unknown>;
const BUCKET = 'earthus-provider-private';
const VALID_ROLES = new Set<StaffRole>(['SUPER_ADMIN','DEVELOPER','OPERATIONS']);
const VALID_ENV = new Set(['development','staging','production']);
const TESTABLE = new Set(['KMA','KTO','AIRKOREA','SEOUL_CITY']);

function cors(req: Request) {
  const origin=req.headers.get('Origin')??'';
  const allowed=Deno.env.get('APP_ORIGIN')??'https://earthus.net';
  const local=/^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/.test(origin);
  return {
    'Access-Control-Allow-Origin': origin===allowed||local?origin:allowed,
    'Access-Control-Allow-Headers':'authorization, content-type, apikey, x-client-info',
    'Access-Control-Allow-Methods':'POST, OPTIONS',
    'Cache-Control':'no-store','Vary':'Origin',
  };
}
const reply=(req:Request,body:unknown,status=200)=>new Response(JSON.stringify(body),{status,headers:{...cors(req),'Content-Type':'application/json; charset=utf-8'}});

function base64ToBytes(text:string){const binary=atob(text);return Uint8Array.from(binary,c=>c.charCodeAt(0))}
async function vaultKey(){
  const encoded=Deno.env.get('PROVIDER_VAULT_KEY')??'';let raw:Uint8Array;
  try{raw=base64ToBytes(encoded)}catch{throw new Error('VAULT_NOT_CONFIGURED')}
  if(raw.byteLength!==32)throw new Error('VAULT_NOT_CONFIGURED');
  return crypto.subtle.importKey('raw',raw,'AES-GCM',false,['decrypt']);
}
async function decrypt(blob:Blob){
  const packed=JSON.parse(await blob.text());if(packed?.v!==1)throw new Error('UNKNOWN_VAULT_VERSION');
  const plain=await crypto.subtle.decrypt({name:'AES-GCM',iv:base64ToBytes(packed.iv)},await vaultKey(),base64ToBytes(packed.data));
  return JSON.parse(new TextDecoder().decode(plain)) as Json;
}

async function authorize(req:Request){
  const authz=req.headers.get('Authorization')??'';if(!authz.startsWith('Bearer '))throw new Error('NO_AUTH');
  const url=Deno.env.get('SUPABASE_URL');const anonKey=Deno.env.get('SUPABASE_ANON_KEY');const serviceRole=Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
  if(!url||!anonKey||!serviceRole)throw new Error('SERVER_CONFIG');
  const session=createClient(url,anonKey,{global:{headers:{Authorization:authz}},auth:{persistSession:false,autoRefreshToken:false}});
  const {data,error}=await session.auth.getUser();if(error||!data.user)throw new Error('NO_AUTH');
  const admin=createClient(url,serviceRole,{auth:{persistSession:false,autoRefreshToken:false}});
  const {data:rows,error:roleError}=await admin.from('staff_roles').select('role').eq('user_id',data.user.id);if(roleError)throw new Error('RBAC_NOT_READY');
  const roles=(rows??[]).map((r:any)=>String(r.role) as StaffRole).filter((r:StaffRole)=>VALID_ROLES.has(r));
  if(!roles.includes('SUPER_ADMIN')&&!roles.includes('DEVELOPER'))throw new Error('FORBIDDEN');
  return {user:data.user,admin,roles};
}
type Ctx=Awaited<ReturnType<typeof authorize>>;

function cleanProvider(v:unknown){const x=String(v??'').trim().toUpperCase();if(!TESTABLE.has(x))throw new Error('TEST_ADAPTER_NOT_CONFIGURED');return x}
function cleanEnv(v:unknown){const x=String(v??'production');if(!VALID_ENV.has(x))throw new Error('BAD_ENV');return x}
function fieldsOf(v:Json){const f=v.fields;if(!f||typeof f!=='object'||Array.isArray(f))throw new Error('CREDENTIAL_FORMAT');return f as Record<string,unknown>}
function pick(fields:Record<string,unknown>,names:string[]){for(const name of names){const x=String(fields[name]??'').trim();if(x)return x}throw new Error('KEY_FIELD_NOT_FOUND')}
function encodedDataGoKey(key:string){return /%[0-9A-F]{2}/i.test(key)?key:encodeURIComponent(key)}
function safeCode(value:unknown){return String(value??'').replace(/[^A-Za-z0-9_.:-]/g,'_').slice(0,100)||'UNKNOWN'}

async function fetchWithTimeout(url:string,init:RequestInit={},ms=8000){
  const controller=new AbortController();const timer=setTimeout(()=>controller.abort(),ms);
  try{return await fetch(url,{...init,signal:controller.signal,headers:{'User-Agent':'Earthus-Provider-Validator/2.0',...(init.headers||{})}})}finally{clearTimeout(timer)}
}

async function loadCredential(ctx:Ctx,providerCode:string,environment:string){
  const {data:meta,error}=await ctx.admin.from('provider_credential_meta').select('id,object_path,expires_at').eq('provider_code',providerCode).eq('environment',environment).is('revoked_at',null).order('created_at',{ascending:false}).limit(1).maybeSingle();
  if(error)throw error;if(!meta)throw new Error('CREDENTIAL_NOT_CONFIGURED');
  if(meta.expires_at&&Date.parse(meta.expires_at)<=Date.now())throw new Error('CREDENTIAL_EXPIRED');
  const {data:blob,error:downloadError}=await ctx.admin.storage.from(BUCKET).download(meta.object_path);if(downloadError||!blob)throw new Error('CREDENTIAL_BLOB_MISSING');
  return fieldsOf(await decrypt(blob));
}

async function testKma(fields:Record<string,unknown>){
  const key=pick(fields,['AUTH_KEY','authKey','API_KEY','apiKey','KEY']);
  const url=`https://apihub.kma.go.kr/api/typ01/url/fct_shrt_reg.php?tmfc=0&authKey=${encodeURIComponent(key)}`;
  const response=await fetchWithTimeout(url);const text=await response.text();
  if(!response.ok)throw new Error(`HTTP_${response.status}`);
  if(text.length<20||/(invalid|unauthorized|forbidden|인증키.{0,20}(오류|없|잘못|확인)|authkey.{0,20}(error|invalid))/i.test(text))throw new Error('KMA_AUTH_REJECTED');
  return {adapter:'KMA_FCT_SHRT_REG',evidence:'forecast-region-list',responseBytes:text.length};
}

function dataGoResult(text:string){
  try{
    const body=JSON.parse(text);const h=body?.response?.header??body?.header??{};return {code:String(h.resultCode??''),message:String(h.resultMsg??'')};
  }catch{
    const code=text.match(/<resultCode>([^<]+)<\/resultCode>/i)?.[1]??'';
    const message=text.match(/<resultMsg>([^<]+)<\/resultMsg>/i)?.[1]??'';
    return {code:String(code),message:String(message)};
  }
}
function ensureDataGoSuccess(text:string,label:string){
  const result=dataGoResult(text);if(['00','0000'].includes(result.code))return result;
  if(!result.code&&text.length>20&&!/(SERVICE_KEY|인증키|ERROR|INVALID)/i.test(text))return result;
  throw new Error(`${label}_${safeCode(result.code||result.message||'AUTH_REJECTED')}`);
}

async function testKto(fields:Record<string,unknown>){
  const key=pick(fields,['SERVICE_KEY','serviceKey','API_KEY','apiKey','KEY']);
  const query=`serviceKey=${encodedDataGoKey(key)}&MobileOS=ETC&MobileApp=Earthus&_type=json&numOfRows=1&pageNo=1`;
  const response=await fetchWithTimeout(`https://apis.data.go.kr/B551011/KorService2/areaCode2?${query}`);const text=await response.text();
  if(!response.ok)throw new Error(`HTTP_${response.status}`);const result=ensureDataGoSuccess(text,'KTO');
  return {adapter:'KTO_KOR_SERVICE2_AREA_CODE',evidence:'areaCode2',resultCode:result.code||'HTTP_OK'};
}

async function testAirKorea(fields:Record<string,unknown>){
  const key=pick(fields,['SERVICE_KEY','serviceKey','API_KEY','apiKey','KEY']);
  const query=`serviceKey=${encodedDataGoKey(key)}&returnType=json&numOfRows=1&pageNo=1&stationName=${encodeURIComponent('종로구')}&dataTerm=DAILY&ver=1.3`;
  const response=await fetchWithTimeout(`https://apis.data.go.kr/B552584/ArpltnInforInqireSvc/getMsrstnAcctoRltmMesureDnsty?${query}`);const text=await response.text();
  if(!response.ok)throw new Error(`HTTP_${response.status}`);const result=ensureDataGoSuccess(text,'AIRKOREA');
  return {adapter:'AIRKOREA_STATION_REALTIME',evidence:'getMsrstnAcctoRltmMesureDnsty',resultCode:result.code||'HTTP_OK'};
}

async function validate(providerCode:string,fields:Record<string,unknown>){
  if(providerCode==='KMA')return testKma(fields);
  if(providerCode==='KTO')return testKto(fields);
  if(providerCode==='AIRKOREA')return testAirKorea(fields);
  if(providerCode==='SEOUL_CITY')throw new Error('TLS_REQUIRED_OFFICIAL_ENDPOINT_HTTP_ONLY');
  throw new Error('TEST_ADAPTER_NOT_CONFIGURED');
}

async function audit(ctx:Ctx,providerCode:string,environment:string,status:string,code:string|null){
  const {error}=await ctx.admin.from('admin_audit_log').insert({actor_id:ctx.user.id,action:'provider.credential_validate',object_kind:'provider',object_id:providerCode,detail:{environment,status,code}});
  if(error)console.error('[provider-validate] audit write failed');
}

Deno.serve(async(req)=>{
  if(req.method==='OPTIONS')return new Response('ok',{headers:cors(req)});if(req.method!=='POST')return reply(req,{error:'METHOD'},405);
  try{
    const ctx=await authorize(req);const body=await req.json().catch(()=>({}));const providerCode=cleanProvider(body.providerCode);const environment=cleanEnv(body.environment);const now=new Date().toISOString();
    await ctx.admin.from('provider_health').upsert({provider_code:providerCode,environment,status:'TESTING',last_test_at:now,updated_at:now},{onConflict:'provider_code,environment'});
    try{
      const fields=await loadCredential(ctx,providerCode,environment);const evidence=await validate(providerCode,fields);const successAt=new Date().toISOString();
      await ctx.admin.from('provider_health').upsert({provider_code:providerCode,environment,status:'OK',last_test_at:now,last_success_at:successAt,last_error_code:null,updated_at:successAt},{onConflict:'provider_code,environment'});
      await audit(ctx,providerCode,environment,'OK',null);return reply(req,{ok:true,status:'OK',providerCode,environment,evidence});
    }catch(e){
      const code=safeCode(e instanceof Error?e.message:String(e));const pending=code==='TLS_REQUIRED_OFFICIAL_ENDPOINT_HTTP_ONLY';const failedAt=new Date().toISOString();
      await ctx.admin.from('provider_health').upsert({provider_code:providerCode,environment,status:pending?'ADAPTER_PENDING':'ERROR',last_test_at:now,last_failure_at:pending?null:failedAt,last_error_code:code,updated_at:failedAt},{onConflict:'provider_code,environment'});
      await audit(ctx,providerCode,environment,pending?'ADAPTER_PENDING':'ERROR',code);return reply(req,{ok:false,status:pending?'ADAPTER_PENDING':'ERROR',code},pending?200:400);
    }
  }catch(e){const message=e instanceof Error?e.message:String(e);const status=message==='NO_AUTH'?401:message==='FORBIDDEN'?403:['SERVER_CONFIG','RBAC_NOT_READY','VAULT_NOT_CONFIGURED'].includes(message)?503:400;return reply(req,{error:safeCode(message)},status)}
});
