export function createSecretVaultAdapter({resolve,describe}={}){
  if(typeof resolve!=='function') throw new Error('SECRET_RESOLVER_REQUIRED');
  return Object.freeze({
    async get(name,{required=true}={}){const value=await resolve(String(name));if((value==null||value==='')&&required)throw new Error(`SECRET_MISSING:${name}`);return value??null;},
    async metadata(name){return typeof describe==='function'?await describe(String(name)):{name:String(name),available:null};},
  });
}
export function secretReference(name){return Object.freeze({kind:'SECRET_REF',name:String(name)});}
export function assertNoSecretValueInConfig(config={}){for(const [k,v] of Object.entries(config)){if(/secret|token|service.?key|api.?key/i.test(k)&&typeof v==='string'&&!v.startsWith('env:')&&!v.startsWith('secret:'))throw new Error(`PLAINTEXT_SECRET_FORBIDDEN:${k}`);if(v&&typeof v==='object')assertNoSecretValueInConfig(v);}return true;}
