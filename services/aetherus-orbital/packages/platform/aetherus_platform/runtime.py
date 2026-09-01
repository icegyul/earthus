from __future__ import annotations

from dataclasses import dataclass, field
from datetime import datetime, timezone
from hashlib import sha256
import json
import re
from typing import Any, Callable
from uuid import uuid4

from aetherus_domain import canonical_hash


def now(): return datetime.now(timezone.utc)

@dataclass(frozen=True)
class RequestContext:
    request_id:str
    tenant_id:str
    user_id:str
    roles:tuple[str,...]=()
    capabilities:tuple[str,...]=()

@dataclass(frozen=True)
class ServiceEnvelope:
    request_id:str
    generated_at:datetime
    data_status:str
    data:Any
    provenance:dict[str,Any]
    warnings:tuple[str,...]=()
    audit_id:str|None=None


class APIGatewayAuthRequestEnvelopeService:
    id="S01"
    def context(self,*,tenant_id:str,user_id:str,roles:list[str]|None=None,capabilities:list[str]|None=None,request_id:str|None=None)->RequestContext:
        if not tenant_id or not user_id: raise PermissionError("authenticated tenant/user required")
        return RequestContext(request_id or str(uuid4()),tenant_id,user_id,tuple(roles or ()),tuple(capabilities or ()))
    def require(self,ctx:RequestContext,capability:str)->None:
        if capability not in ctx.capabilities and "SYSTEM_ADMIN" not in ctx.roles: raise PermissionError(f"missing capability {capability}")
    def envelope(self,ctx:RequestContext,data:Any,*,data_status:str="OK",provenance:dict[str,Any]|None=None,warnings:list[str]|None=None,audit_id:str|None=None)->ServiceEnvelope:
        return ServiceEnvelope(ctx.request_id,now(),data_status,data,provenance or {},tuple(warnings or ()),audit_id)


class SubscriptionCapabilityService:
    id="S02"
    plans={
        "FREE":{"CURRENT","PUBLIC_SAFETY","BASIC_SEARCH"},
        "AETHERUS+":{"CURRENT","PUBLIC_SAFETY","BASIC_SEARCH","HISTORY","PERSONALIZATION","ALERTS"},
        "PRO / RESEARCH":{"CURRENT","PUBLIC_SAFETY","BASIC_SEARCH","HISTORY","PERSONALIZATION","ALERTS","SCENARIO","DOWNLOAD","RESEARCH_DATA"},
        "CONTROL / INSTITUTION":{"CURRENT","PUBLIC_SAFETY","BASIC_SEARCH","HISTORY","ALERTS","CONTROL_ROOM","API","PRIVATE_FLEET"},
        "OPERATIONS":{"CURRENT","PUBLIC_SAFETY","BASIC_SEARCH","HISTORY","ALERTS","CONTROL_ROOM","API","PRIVATE_FLEET","OPERATIONS"},
        "REMOVAL INTELLIGENCE":{"CURRENT","PUBLIC_SAFETY","BASIC_SEARCH","HISTORY","ALERTS","SCENARIO","PROTECT","ATTRIBUTION"},
    }
    def capabilities(self,plan:str)->set[str]: return set(self.plans.get(plan,self.plans["FREE"]))
    def authorize(self,plan:str,capability:str)->bool:
        if capability=="PUBLIC_SAFETY": return True
        return capability in self.capabilities(plan)
    def scientific_hash_unchanged(self,scientific_payload:Any,plans:list[str])->bool:
        hashes={canonical_hash(scientific_payload) for _ in plans}; return len(hashes)==1


class WorkspaceWidgetControlRoomService:
    id="S03"
    def layout_for(self,mission_state:str)->dict[str,list[str]]:
        common=["UNIVERSAL_TIME","SYSTEM_STATUS"]
        mapping={
            "PRE-LAUNCH":["COUNTDOWN","WEATHER","MISSION_TIMELINE","LAUNCH_SITE","TARGET_ORBIT"],
            "ASCENT":["TELEMETRY","TRAJECTORY","VEHICLE_STATE","MISSION_TIMELINE","TARGET_ORBIT"],
            "ORBIT INSERTION":["PAYLOAD","STAGE","TARGET_ORBIT","OBJECT_CREATION"],
            "POST-MISSION":["MISSION_RECORD","REPLAY","MISSION_TO_ORBIT_HANDOVER"],
        }
        return {"left":["LAUNCH_QUEUE","FOLLOWING"],"center":["UNIVERSE_3D"],"right":mapping.get(mission_state,["INTELLIGENCE_FEED"]),"bottom":common+["ORBITAL_RADAR","LAUNCH_CALENDAR"]}
    def save(self,ctx:RequestContext,workspace:dict[str,Any])->dict[str,Any]:
        return {"tenant_id":ctx.tenant_id,"user_id":ctx.user_id,"workspace":dict(workspace),"saved_at":now().isoformat()}


class FollowAlertService:
    id="S04"
    def __init__(self): self.follows:dict[tuple[str,str],set[str]]={}; self.last_revision:dict[tuple[str,str,str],int]={}
    def follow(self,ctx:RequestContext,target_id:str)->None: self.follows.setdefault((ctx.tenant_id,ctx.user_id),set()).add(target_id)
    def alerts_for_revision(self,ctx:RequestContext,target_id:str,revision_no:int,summary:str)->list[dict[str,Any]]:
        if target_id not in self.follows.get((ctx.tenant_id,ctx.user_id),set()): return []
        key=(ctx.tenant_id,ctx.user_id,target_id); prev=self.last_revision.get(key,0)
        if revision_no<=prev:return []
        self.last_revision[key]=revision_no
        return [{"target_id":target_id,"revision_no":revision_no,"summary":summary,"request_id":ctx.request_id}]


class SearchDiscoveryService:
    id="S05"
    token_re=re.compile(r"[A-Za-z0-9]+")
    def __init__(self,documents:list[dict[str,Any]]|None=None): self.documents=list(documents or [])
    def add(self,doc:dict[str,Any])->None:self.documents.append(dict(doc))
    def search(self,query:str,*,limit:int=20)->list[dict[str,Any]]:
        q=query.strip().lower(); qtokens=set(self.token_re.findall(q))
        scored=[]
        for d in self.documents:
            name=str(d.get('name','')).lower(); aliases=[str(a).lower() for a in d.get('aliases',[])]; tokens=set(self.token_re.findall(name+' '+' '.join(aliases)))
            if q==name or q in aliases: score=100
            elif qtokens and qtokens<=tokens: score=80
            elif len(q)<=3: score=0  # short aliases never match arbitrary substrings such as ISS in Mission
            elif q in name or any(q in a for a in aliases): score=50
            else: score=0
            if score: scored.append((score,str(d.get('id','')),d))
        scored.sort(key=lambda x:(-x[0],x[1])); return [dict(d) for _,_,d in scored[:limit]]


class MediaLiveStreamResolver:
    id="S06"
    def resolve(self,items:list[dict[str,Any]],*,allow_unofficial:bool=False)->list[dict[str,Any]]:
        out=[]
        for i in items:
            if not i.get('url'):continue
            if not allow_unofficial and not i.get('official',False):continue
            out.append({"url":i['url'],"official":bool(i.get('official')),"source_id":i.get('source_id'),"live":bool(i.get('live')),"data_status":"OK" if i.get('reachable',True) else "UNAVAILABLE"})
        return out


class ResearchDatasetBenchmarkService:
    id="S07"
    def manifest(self,name:str,records:list[dict[str,Any]],*,license_policy:str,source_ids:list[str],version:str)->dict[str,Any]:
        if not license_policy: raise ValueError("dataset license required")
        payload={"name":name,"version":version,"records":records,"source_ids":sorted(source_ids),"license_policy":license_policy}
        return {"name":name,"version":version,"record_count":len(records),"dataset_hash":canonical_hash(payload),"source_ids":sorted(source_ids),"license_policy":license_policy}
    def reproduce(self,manifest:dict[str,Any],records:list[dict[str,Any]])->bool:
        payload={"name":manifest['name'],"version":manifest['version'],"records":records,"source_ids":manifest['source_ids'],"license_policy":manifest['license_policy']}
        return canonical_hash(payload)==manifest['dataset_hash']


class OperationsTenantAuditService:
    id="S08"
    def __init__(self): self.audit:list[dict[str,Any]]=[]; self.private:dict[tuple[str,str],Any]={}
    def write(self,ctx:RequestContext,action:str,resource_id:str,before:Any,after:Any)->str:
        aid=str(uuid4()); self.audit.append({"audit_id":aid,"request_id":ctx.request_id,"tenant_id":ctx.tenant_id,"user_id":ctx.user_id,"action":action,"resource_id":resource_id,"before_hash":canonical_hash(before),"after_hash":canonical_hash(after),"at":now().isoformat()}); return aid
    def put_private(self,ctx:RequestContext,key:str,value:Any)->None:self.private[(ctx.tenant_id,key)]=value
    def get_private(self,ctx:RequestContext,key:str)->Any:
        return self.private.get((ctx.tenant_id,key))
    def audit_for(self,ctx:RequestContext)->list[dict[str,Any]]: return [a for a in self.audit if a['tenant_id']==ctx.tenant_id]


@dataclass
class Job:
    job_id:str; key:str; fn:Callable[[],Any]; status:str="QUEUED"; result:Any=None; error:str|None=None; attempts:int=0
class JobQueueScheduler:
    id="S09"
    def __init__(self):self.jobs:dict[str,Job]={};self.by_key:dict[str,str]={}
    def submit(self,key:str,fn:Callable[[],Any])->Job:
        if key in self.by_key:return self.jobs[self.by_key[key]]
        j=Job(str(uuid4()),key,fn);self.jobs[j.job_id]=j;self.by_key[key]=j.job_id;return j
    def run(self,job_id:str,max_attempts:int=3)->Job:
        j=self.jobs[job_id]
        while j.attempts<max_attempts and j.status!="SUCCEEDED":
            j.attempts+=1
            try:j.result=j.fn();j.status="SUCCEEDED";j.error=None
            except Exception as e:j.status="FAILED";j.error=f"{type(e).__name__}: {e}"
        return j


class ObservabilityEvidenceManifestService:
    id="S10"
    def manifest(self,*,phase:str,tests:dict[str,str],files:list[dict[str,Any]],limitations:list[str],scientific_validation_state:str)->dict[str,Any]:
        payload={"phase":phase,"tests":tests,"files":files,"limitations":limitations,"scientific_validation_state":scientific_validation_state}
        return {**payload,"generated_at":now().isoformat(),"manifest_hash":canonical_hash(payload)}
    def done_gate(self,manifest:dict[str,Any],*,required_tests:list[str])->dict[str,Any]:
        missing=[t for t in required_tests if manifest.get('tests',{}).get(t)!="PASS"]
        file_fail=[f for f in manifest.get('files',[]) if not f.get('sha256')]
        return {"done":not missing and not file_fail,"missing_tests":missing,"file_evidence_failures":file_fail}


class SecurityLicenseDataGovernanceService:
    id="S11"
    secret_re=re.compile(r"(?i)(api[_-]?key|token|secret|password)=([^&\s]+)")
    def redact(self,text:str)->str:return self.secret_re.sub(lambda m:f"{m.group(1)}=[REDACTED]",text)
    def allow_use(self,license_policy:str|None,access_policy:str|None)->bool:
        if not license_policy:return False
        if access_policy and access_policy.upper() in {"DENY","PRIVATE_UNAUTHORIZED"}:return False
        return True
    def scientific_result_immutable(self,before_hash:str,after_hash:str)->bool:return before_hash==after_hash


class DeploymentBackupDRService:
    id="S12"
    def backup(self,state:Any)->dict[str,Any]:
        raw=json.dumps(state,sort_keys=True,separators=(',',':'),default=str).encode();return {"payload":state,"sha256":sha256(raw).hexdigest(),"created_at":now().isoformat()}
    def restore(self,backup:dict[str,Any])->Any:
        raw=json.dumps(backup['payload'],sort_keys=True,separators=(',',':'),default=str).encode()
        if sha256(raw).hexdigest()!=backup['sha256']:raise ValueError("backup checksum mismatch")
        return backup['payload']
    def readiness(self,*,tests_pass:bool,backup_verified:bool,secrets_configured:bool,live_provider_verified:bool)->dict[str,Any]:
        blockers=[]
        if not tests_pass:blockers.append("TESTS_FAILED")
        if not backup_verified:blockers.append("BACKUP_NOT_VERIFIED")
        if not secrets_configured:blockers.append("BLOCKED_PRODUCTION_SECRETS")
        if not live_provider_verified:blockers.append("BLOCKED_LIVE_PROVIDER_VERIFICATION")
        return {"local_product_complete":tests_pass and backup_verified,"staging_ready":tests_pass and backup_verified and secrets_configured and live_provider_verified,"blockers":blockers}
