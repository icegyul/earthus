import { sha256Hex } from './raw-artifact-store.js';
function canonical(v){if(Array.isArray(v))return v.map(canonical);if(v&&typeof v==='object')return Object.fromEntries(Object.entries(v).sort(([a],[b])=>a.localeCompare(b)).map(([k,val])=>[k,canonical(val)]));return v;}
export async function buildReleaseConfigSnapshot(config,{releaseId,createdAt=Date.now(),environment='preview'}={}){
  if(!releaseId)throw new Error('RELEASE_ID_REQUIRED');const clean=canonical(config);const json=JSON.stringify(clean);const hash=await sha256Hex(json);return Object.freeze({releaseId:String(releaseId),environment:String(environment),createdAt:Number(createdAt),sha256:hash,config:clean});
}
export function compareReleaseSnapshots(a,b){if(!a||!b)return {same:false,reason:'SNAPSHOT_MISSING'};return a.sha256===b.sha256?{same:true}:{same:false,reason:'CONFIG_CHANGED',from:a.sha256,to:b.sha256};}
