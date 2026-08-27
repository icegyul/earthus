// EARTHUS 2.0 provider/API credential administration.
// Raw credentials are encrypted with AES-GCM and stored only in a private Storage bucket.
// Reads return metadata/fingerprint only. Browser UID/email/config is never an authorization source.

import { createClient, type SupabaseClient } from 'jsr:@supabase/supabase-js@2';

type StaffRole = 'SUPER_ADMIN' | 'DEVELOPER' | 'OPERATIONS';
type Json = Record<string, unknown>;

const BUCKET = 'earthus-provider-private';
const VALID_ROLES = new Set<StaffRole>(['SUPER_ADMIN','DEVELOPER','OPERATIONS']);
const VALID_ENV = new Set(['development','staging','production']);
const PUBLIC_HEALTH_URL: Record<string,string> = {
  ECMWF: 'https://data.ecmwf.int/forecasts/',
  JMA: 'https://www.jma.go.jp/',
  NOAA: 'https://api.weather.gov/',
};

function cors(req: Request) {
  const origin = req.headers.get('Origin') ?? '';
  const allowed = Deno.env.get('APP_ORIGIN') ?? 'https://earthus.net';
  const local = /^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/.test(origin);
  return {
    'Access-Control-Allow-Origin': origin === allowed || local ? origin : allowed,
    'Access-Control-Allow-Headers': 'authorization, content-type, apikey, x-client-info',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Cache-Control': 'no-store',
    'Vary': 'Origin',
  };
}
const respond = (req: Request, body: unknown, status=200) => new Response(JSON.stringify(body), {
  status, headers: { ...cors(req), 'Content-Type': 'application/json; charset=utf-8' },
});

function bytesToBase64(bytes: Uint8Array) {
  let binary='';
  for(let i=0;i<bytes.length;i+=0x8000) binary += String.fromCharCode(...bytes.subarray(i,i+0x8000));
  return btoa(binary);
}
function base64ToBytes(text: string) {
  const binary=atob(text);
  return Uint8Array.from(binary,c=>c.charCodeAt(0));
}
async function digest(text: string) {
  const bytes=new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(text)));
  return [...bytes].map(b=>b.toString(16).padStart(2,'0')).join('');
}
async function vaultKey() {
  const encoded=Deno.env.get('PROVIDER_VAULT_KEY') ?? '';
  let raw: Uint8Array;
  try { raw=base64ToBytes(encoded); } catch { throw new Error('VAULT_NOT_CONFIGURED'); }
  if(raw.byteLength!==32) throw new Error('VAULT_NOT_CONFIGURED');
  return crypto.subtle.importKey('raw',raw,'AES-GCM',false,['encrypt','decrypt']);
}
async function encrypt(value: Json) {
  const iv=crypto.getRandomValues(new Uint8Array(12));
  const plain=new TextEncoder().encode(JSON.stringify(value));
  const cipher=new Uint8Array(await crypto.subtle.encrypt({name:'AES-GCM',iv},await vaultKey(),plain));
  return new TextEncoder().encode(JSON.stringify({v:1,iv:bytesToBase64(iv),data:bytesToBase64(cipher)}));
}
async function decrypt(blob: Blob) {
  const packed=JSON.parse(await blob.text());
  if(packed?.v!==1) throw new Error('UNKNOWN_VAULT_VERSION');
  const plain=await crypto.subtle.decrypt({name:'AES-GCM',iv:base64ToBytes(packed.iv)},await vaultKey(),base64ToBytes(packed.data));
  return JSON.parse(new TextDecoder().decode(plain)) as Json;
}

async function ensureBucket(admin: SupabaseClient) {
  const { error } = await admin.storage.createBucket(BUCKET,{public:false,fileSizeLimit:1024*1024,allowedMimeTypes:['application/octet-stream']});
  if(error && !/already exists|duplicate/i.test(error.message)) throw error;
}

function capabilities(roles: StaffRole[]) {
  const has=(r:StaffRole)=>roles.includes(r);
  return {
    provider_read: has('SUPER_ADMIN')||has('DEVELOPER')||has('OPERATIONS'),
    provider_secret_write: has('SUPER_ADMIN')||has('DEVELOPER'),
    provider_enable_write: has('SUPER_ADMIN')||has('DEVELOPER'),
  };
}

async function authorize(req: Request) {
  const authz=req.headers.get('Authorization')??'';
  if(!authz.startsWith('Bearer ')) throw new Error('NO_AUTH');
  const url=Deno.env.get('SUPABASE_URL');
  const anonKey=Deno.env.get('SUPABASE_ANON_KEY');
  const serviceRole=Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
  if(!url||!anonKey||!serviceRole) throw new Error('SERVER_CONFIG');
  const session=createClient(url,anonKey,{global:{headers:{Authorization:authz}},auth:{persistSession:false,autoRefreshToken:false}});
  const {data,error}=await session.auth.getUser();
  if(error||!data.user) throw new Error('NO_AUTH');
  const admin=createClient(url,serviceRole,{auth:{persistSession:false,autoRefreshToken:false}});
  const {data:roleRows,error:roleError}=await admin.from('staff_roles').select('role').eq('user_id',data.user.id);
  if(roleError) throw new Error('RBAC_NOT_READY');
  const roles=(roleRows??[]).map((r:any)=>String(r.role) as StaffRole).filter((r:StaffRole)=>VALID_ROLES.has(r));
  await ensureBucket(admin);
  return {user:data.user,admin,roles,capabilities:capabilities(roles)};
}

type Ctx=Awaited<ReturnType<typeof authorize>>;
function requireRead(ctx:Ctx){if(!ctx.capabilities.provider_read)throw new Error('FORBIDDEN')}
function requireSecretWrite(ctx:Ctx){if(!ctx.capabilities.provider_secret_write)throw new Error('FORBIDDEN')}
function requireEnableWrite(ctx:Ctx){if(!ctx.capabilities.provider_enable_write)throw new Error('FORBIDDEN')}

async function audit(ctx:Ctx,action:string,providerCode:string,detail:Json={}) {
  const {error}=await ctx.admin.from('admin_audit_log').insert({actor_id:ctx.user.id,action,object_kind:'provider',object_id:providerCode,detail});
  if(error) console.error('[provider-admin] audit',error.message);
}

function cleanAlias(value:unknown){const x=String(value??'').trim();if(!x||x.length>80)throw new Error('BAD_ALIAS');return x}
function cleanProvider(value:unknown){const x=String(value??'').trim().toUpperCase();if(!/^[A-Z0-9_]+$/.test(x))throw new Error('BAD_PROVIDER');return x}
function cleanEnv(value:unknown){const x=String(value??'production');if(!VALID_ENV.has(x))throw new Error('BAD_ENV');return x}
function cleanType(value:unknown){const x=String(value??'api_key').trim();if(!x||x.length>80)throw new Error('BAD_CREDENTIAL_TYPE');return x}
function cleanFields(value:unknown) {
  if(!value||typeof value!=='object'||Array.isArray(value)) throw new Error('BAD_FIELDS');
  const src=value as Record<string,unknown>; const out:Record<string,string>={};
  const keys=Object.keys(src);
  if(keys.length<1||keys.length>20)throw new Error('BAD_FIELDS');
  for(const key of keys){
    if(!/^[A-Za-z][A-Za-z0-9_]{0,63}$/.test(key))throw new Error('BAD_FIELD_NAME');
    const v=String(src[key]??''); if(!v||v.length>20_000)throw new Error('BAD_FIELD_VALUE'); out[key]=v;
  }
  return out;
}
function stableJson(value:Record<string,string>){return JSON.stringify(Object.keys(value).sort().reduce((o,k)=>(o[k]=value[k],o),{} as Record<string,string>))}

async function list(ctx:Ctx) {
  requireRead(ctx);
  const [{data:providers,error:pError},{data:health,error:hError},{data:creds,error:cError}]=await Promise.all([
    ctx.admin.from('provider_registry').select('code,display_name,category,auth_mode,credential_required,enabled,docs_url,notes,updated_at').order('code'),
    ctx.admin.from('provider_health').select('*').order('provider_code'),
    ctx.admin.from('provider_credential_meta').select('id,provider_code,environment,alias,credential_type,fingerprint,field_names,expires_at,created_at,revoked_at').is('revoked_at',null).order('created_at',{ascending:false}),
  ]);
  if(pError)throw pError;if(hError)throw hError;if(cError)throw cError;
  return {viewer:{roles:ctx.roles,capabilities:ctx.capabilities},providers:providers??[],health:health??[],credentials:creds??[]};
}

async function save(ctx:Ctx,body:any) {
  requireSecretWrite(ctx);
  const providerCode=cleanProvider(body.providerCode); const environment=cleanEnv(body.environment);
  const alias=cleanAlias(body.alias); const credentialType=cleanType(body.credentialType); const fields=cleanFields(body.fields);
  const expiresAt=body.expiresAt?new Date(String(body.expiresAt)):null;
  if(expiresAt && !Number.isFinite(expiresAt.getTime()))throw new Error('BAD_EXPIRY');
  const {data:provider,error:pError}=await ctx.admin.from('provider_registry').select('code').eq('code',providerCode).maybeSingle();
  if(pError)throw pError;if(!provider)throw new Error('PROVIDER_NOT_FOUND');
  const packed=await encrypt({providerCode,environment,alias,credentialType,fields,createdAt:new Date().toISOString()});
  const fingerprint=(await digest(stableJson(fields))).slice(0,16);
  const credentialId=crypto.randomUUID(); const objectPath=`credentials/${environment}/${providerCode}/${credentialId}.vault`;
  const {error:uploadError}=await ctx.admin.storage.from(BUCKET).upload(objectPath,packed,{contentType:'application/octet-stream',upsert:false});
  if(uploadError)throw uploadError;
  const {data:old}=await ctx.admin.from('provider_credential_meta').select('id,object_path').eq('provider_code',providerCode).eq('environment',environment).eq('alias',alias).is('revoked_at',null);
  const {error:metaError}=await ctx.admin.from('provider_credential_meta').insert({id:credentialId,provider_code:providerCode,environment,alias,credential_type:credentialType,fingerprint,field_names:Object.keys(fields).sort(),object_path:objectPath,expires_at:expiresAt?expiresAt.toISOString():null,created_by:ctx.user.id});
  if(metaError){await ctx.admin.storage.from(BUCKET).remove([objectPath]);throw metaError}
  if((old??[]).length){
    const oldIds=(old??[]).map((x:any)=>x.id); const oldPaths=(old??[]).map((x:any)=>x.object_path).filter(Boolean);
    await ctx.admin.from('provider_credential_meta').update({revoked_at:new Date().toISOString(),revoked_by:ctx.user.id}).in('id',oldIds);
    if(oldPaths.length)await ctx.admin.storage.from(BUCKET).remove(oldPaths);
  }
  await ctx.admin.from('provider_health').upsert({provider_code:providerCode,environment,status:'CONFIGURED',last_error_code:null,updated_at:new Date().toISOString()},{onConflict:'provider_code,environment'});
  await audit(ctx,'provider.credential_saved',providerCode,{environment,alias,credential_type:credentialType,fingerprint,field_names:Object.keys(fields).sort(),expires_at:expiresAt?.toISOString()??null});
  return {ok:true,id:credentialId,fingerprint};
}

async function loadCredential(ctx:Ctx,providerCode:string,environment:string) {
  const {data:meta,error}=await ctx.admin.from('provider_credential_meta').select('id,object_path,expires_at').eq('provider_code',providerCode).eq('environment',environment).is('revoked_at',null).order('created_at',{ascending:false}).limit(1).maybeSingle();
  if(error)throw error;if(!meta)throw new Error('CREDENTIAL_NOT_CONFIGURED');
  if(meta.expires_at && Date.parse(meta.expires_at)<=Date.now())throw new Error('CREDENTIAL_EXPIRED');
  const {data:blob,error:downloadError}=await ctx.admin.storage.from(BUCKET).download(meta.object_path);
  if(downloadError||!blob)throw new Error('CREDENTIAL_BLOB_MISSING');
  const decrypted=await decrypt(blob);
  return {meta,decrypted};
}

async function revoke(ctx:Ctx,body:any) {
  requireSecretWrite(ctx); const id=String(body.id??''); if(!id)throw new Error('BAD_ID');
  const {data:meta,error}=await ctx.admin.from('provider_credential_meta').select('id,provider_code,environment,object_path').eq('id',id).is('revoked_at',null).maybeSingle();
  if(error)throw error;if(!meta)return {ok:true,already:true};
  const {error:updateError}=await ctx.admin.from('provider_credential_meta').update({revoked_at:new Date().toISOString(),revoked_by:ctx.user.id}).eq('id',id);
  if(updateError)throw updateError;
  if(meta.object_path)await ctx.admin.storage.from(BUCKET).remove([meta.object_path]);
  const {count}=await ctx.admin.from('provider_credential_meta').select('*',{head:true,count:'exact'}).eq('provider_code',meta.provider_code).eq('environment',meta.environment).is('revoked_at',null);
  await ctx.admin.from('provider_health').upsert({provider_code:meta.provider_code,environment:meta.environment,status:(count??0)>0?'CONFIGURED':'UNCONFIGURED',updated_at:new Date().toISOString()},{onConflict:'provider_code,environment'});
  await audit(ctx,'provider.credential_revoked',meta.provider_code,{environment:meta.environment,credential_id:id});
  return {ok:true};
}

async function test(ctx:Ctx,body:any) {
  requireSecretWrite(ctx); const providerCode=cleanProvider(body.providerCode); const environment=cleanEnv(body.environment);
  const {data:provider,error:pError}=await ctx.admin.from('provider_registry').select('credential_required,enabled').eq('code',providerCode).maybeSingle();
  if(pError)throw pError;if(!provider)throw new Error('PROVIDER_NOT_FOUND');
  if(!provider.enabled){await ctx.admin.from('provider_health').upsert({provider_code:providerCode,environment,status:'DISABLED',last_test_at:new Date().toISOString(),updated_at:new Date().toISOString()},{onConflict:'provider_code,environment'});return {ok:false,status:'DISABLED'}}
  const now=new Date().toISOString();
  await ctx.admin.from('provider_health').upsert({provider_code:providerCode,environment,status:'TESTING',last_test_at:now,updated_at:now},{onConflict:'provider_code,environment'});
  try{
    if(provider.credential_required) {
      await loadCredential(ctx,providerCode,environment); // validates storage + AES-GCM + expiry, never returns secret to browser
      await ctx.admin.from('provider_health').upsert({provider_code:providerCode,environment,status:'ADAPTER_PENDING',last_test_at:now,last_error_code:'CREDENTIAL_VALIDATION_ADAPTER_PENDING',updated_at:new Date().toISOString()},{onConflict:'provider_code,environment'});
      await audit(ctx,'provider.test',providerCode,{environment,status:'ADAPTER_PENDING'});
      return {ok:false,status:'ADAPTER_PENDING',code:'CREDENTIAL_VALIDATION_ADAPTER_PENDING'};
    }
    const url=PUBLIC_HEALTH_URL[providerCode]; if(!url)throw new Error('TEST_ADAPTER_NOT_CONFIGURED');
    const controller=new AbortController(); const timer=setTimeout(()=>controller.abort(),8000);
    let response:Response; try{response=await fetch(url,{method:'GET',signal:controller.signal,headers:{'User-Agent':'Earthus-Provider-Health/2.0'}})}finally{clearTimeout(timer)}
    if(!response.ok)throw new Error(`HTTP_${response.status}`);
    await ctx.admin.from('provider_health').upsert({provider_code:providerCode,environment,status:'OK',last_test_at:now,last_success_at:new Date().toISOString(),last_error_code:null,updated_at:new Date().toISOString()},{onConflict:'provider_code,environment'});
    await audit(ctx,'provider.test',providerCode,{environment,status:'OK'}); return {ok:true,status:'OK'};
  }catch(e){
    const code=e instanceof Error?e.message:String(e); await ctx.admin.from('provider_health').upsert({provider_code:providerCode,environment,status:'ERROR',last_test_at:now,last_failure_at:new Date().toISOString(),last_error_code:code.slice(0,120),updated_at:new Date().toISOString()},{onConflict:'provider_code,environment'}); await audit(ctx,'provider.test',providerCode,{environment,status:'ERROR',code:code.slice(0,120)}); return {ok:false,status:'ERROR',code:code.slice(0,120)};
  }
}

async function toggle(ctx:Ctx,body:any) {
  requireEnableWrite(ctx); const providerCode=cleanProvider(body.providerCode); const enabled=body.enabled===true;
  const {error}=await ctx.admin.from('provider_registry').update({enabled,updated_at:new Date().toISOString()}).eq('code',providerCode); if(error)throw error;
  if(!enabled)await ctx.admin.from('provider_health').update({status:'DISABLED',updated_at:new Date().toISOString()}).eq('provider_code',providerCode);
  await audit(ctx,'provider.enabled',providerCode,{enabled}); return {ok:true};
}

Deno.serve(async(req)=>{
  if(req.method==='OPTIONS')return new Response('ok',{headers:cors(req)});
  if(req.method!=='POST')return respond(req,{error:'METHOD'},405);
  try{
    const ctx=await authorize(req); const body=await req.json().catch(()=>({})); const action=String(body.action??'list');
    if(action==='context'){requireRead(ctx);return respond(req,{ok:true,viewer:{roles:ctx.roles,capabilities:ctx.capabilities}})}
    if(action==='list')return respond(req,await list(ctx));
    if(action==='save')return respond(req,await save(ctx,body));
    if(action==='revoke')return respond(req,await revoke(ctx,body));
    if(action==='test')return respond(req,await test(ctx,body));
    if(action==='toggle')return respond(req,await toggle(ctx,body));
    return respond(req,{error:'BAD_ACTION'},400);
  }catch(e){const message=e instanceof Error?e.message:String(e);const status=message==='NO_AUTH'?401:message==='FORBIDDEN'?403:['SERVER_CONFIG','RBAC_NOT_READY','VAULT_NOT_CONFIGURED'].includes(message)?503:400;console.error('[provider-admin]',message);return respond(req,{error:message},status)}
});
