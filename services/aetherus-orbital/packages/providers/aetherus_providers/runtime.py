from __future__ import annotations

from dataclasses import dataclass
from datetime import datetime, timezone
import json
from typing import Any
from urllib.parse import urlencode
from urllib.request import Request, urlopen

from .probe import trusted_ssl_context


@dataclass(frozen=True)
class ProviderResponse:
    source_id:str
    request_url:str
    retrieved_at:datetime
    media_type:str
    raw_bytes:bytes
    parsed:Any
    live:bool


class HTTPProvider:
    source_id="GENERIC"
    user_agent="AetherusV2/0.3 research-client"
    def fetch(self,url:str,*,timeout:float=10.0)->ProviderResponse:
        req=Request(url,headers={"User-Agent":self.user_agent,"Accept":"application/json"})
        with urlopen(req,timeout=timeout,context=trusted_ssl_context()) as r:
            raw=r.read(); media=r.headers.get_content_type() or "application/octet-stream"
        try: parsed=json.loads(raw)
        except Exception: parsed=raw.decode('utf-8','replace')
        return ProviderResponse(self.source_id,url,datetime.now(timezone.utc),media,raw,parsed,True)


class CelesTrakGPProvider(HTTPProvider):
    source_id="CELESTRAK_GP"
    base="https://celestrak.org/NORAD/elements/gp.php"
    min_poll_seconds=7200  # usage policy: GP updates about every 2h; avoid wasteful re-fetching.
    def build_url(self,*,catnr:str|None=None,intdes:str|None=None,group:str|None=None,name:str|None=None,special:str|None=None,format:str="JSON")->str:
        choices={"CATNR":catnr,"INTDES":intdes,"GROUP":group,"NAME":name,"SPECIAL":special}; selected={k:v for k,v in choices.items() if v is not None}
        if len(selected)!=1: raise ValueError("exactly one CelesTrak GP query selector required")
        if format.upper() not in {"TLE","3LE","2LE","XML","KVN","JSON","JSON-PRETTY","CSV"}:raise ValueError("unsupported CelesTrak format")
        return self.base+"?"+urlencode({**selected,"FORMAT":format.upper()})
    def normalize_json(self,payload:Any)->list[dict[str,Any]]:
        if not isinstance(payload,list):raise ValueError("CelesTrak JSON must be list")
        out=[]
        for r in payload:
            if not isinstance(r,dict):continue
            out.append({
                "catalog_id":str(r.get("NORAD_CAT_ID")) if r.get("NORAD_CAT_ID") is not None else None,
                "name":r.get("OBJECT_NAME"),"cospar_id":r.get("OBJECT_ID"),"epoch":r.get("EPOCH"),
                "mean_motion":r.get("MEAN_MOTION"),"eccentricity":r.get("ECCENTRICITY"),"inclination_deg":r.get("INCLINATION"),
                "raan_deg":r.get("RA_OF_ASC_NODE"),"arg_perigee_deg":r.get("ARG_OF_PERICENTER"),"mean_anomaly_deg":r.get("MEAN_ANOMALY"),
                "source_record":r,
            })
        return out


class JPLHorizonsProvider(HTTPProvider):
    source_id="NASA_JPL_HORIZONS"
    base="https://ssd.jpl.nasa.gov/api/horizons.api"
    api_version="1.3"
    def build_vectors_url(self,*,command:str,center:str="500@0",start_time:str,stop_time:str,step_size:str="1 d",ref_plane:str="FRAME",time_type:str="TDB")->str:
        params={"format":"json","COMMAND":f"'{command}'","OBJ_DATA":"YES","MAKE_EPHEM":"YES","EPHEM_TYPE":"VECTORS","CENTER":f"'{center}'","START_TIME":f"'{start_time}'","STOP_TIME":f"'{stop_time}'","STEP_SIZE":f"'{step_size}'","REF_PLANE":f"'{ref_plane}'","TIME_TYPE":f"'{time_type}'","VEC_TABLE":"2"}
        return self.base+"?"+urlencode(params)
    def validate_response(self,payload:dict[str,Any])->dict[str,Any]:
        if not isinstance(payload,dict) or 'result' not in payload:raise ValueError("invalid Horizons response")
        sig=payload.get('signature') or {}
        return {"api_source":sig.get('source','NASA/JPL Horizons API'),"api_version":sig.get('version'),"result_text":payload['result']}


class NOAASWPCProvider(HTTPProvider):
    source_id="NOAA_SWPC"
    product_base="https://services.swpc.noaa.gov/products"
    json_base="https://services.swpc.noaa.gov/json"
    allowed_products={
        "planetary_k":"noaa-planetary-k-index.json",
        "planetary_k_forecast":"noaa-planetary-k-index-forecast.json",
        "alerts":"alerts.json",
        "scales":"noaa-scales.json",
        "f107_30d":"10cm-flux-30-day.json",
    }
    def product_url(self,name:str)->str:
        if name not in self.allowed_products:raise KeyError(name)
        return f"{self.product_base}/{self.allowed_products[name]}"
    def normalize_table(self,payload:Any)->list[dict[str,Any]]:
        # SWPC products often use first row as headers.
        if isinstance(payload,list) and payload and isinstance(payload[0],list):
            headers=[str(x) for x in payload[0]];return [dict(zip(headers,row)) for row in payload[1:] if isinstance(row,list)]
        if isinstance(payload,list):return [x for x in payload if isinstance(x,dict)]
        if isinstance(payload,dict):return [payload]
        raise ValueError("unsupported SWPC JSON shape")


class LaunchLibraryProvider(HTTPProvider):
    source_id="LAUNCH_LIBRARY_2"
    base="https://ll.thespacedevs.com/2.3.0"
    version="2.3.0"
    def upcoming_url(self,*,limit:int=20,ordering:str="net")->str:
        return f"{self.base}/launches/upcoming/?"+urlencode({"limit":max(1,min(100,limit)),"ordering":ordering})
    def normalize_launches(self,payload:dict[str,Any])->list[dict[str,Any]]:
        results=payload.get('results',[]) if isinstance(payload,dict) else []
        out=[]
        for r in results:
            mission=r.get('mission') or {}; pad=r.get('pad') or {}; loc=pad.get('location') or {}; launcher=r.get('rocket',{}).get('configuration') or {}
            out.append({
                "mission_id":str(r.get('id')),"name":r.get('name'),"net":r.get('net'),"window_start":r.get('window_start'),"window_end":r.get('window_end'),
                "status":(r.get('status') or {}).get('name'),"vehicle":launcher.get('full_name') or launcher.get('name'),
                "launch_site":{"name":pad.get('name'),"location":loc.get('name'),"lat":float(pad['latitude']) if pad.get('latitude') not in (None,'') else None,"lon":float(pad['longitude']) if pad.get('longitude') not in (None,'') else None},
                "payloads":mission.get('orbit') and [{"name":mission.get('name'),"provisional":False}] or [],"source_record":r,
            })
        return out

@dataclass(frozen=True)
class ProviderPolicy:
    source_id: str
    name: str
    source_grade: str
    license_policy: str
    access_policy: str = "PUBLIC"
    stale_after_seconds: int = 3600


@dataclass(frozen=True)
class ProviderIngestionResult:
    source_id: str
    artifact_id: str
    ingestion_run_id: str
    content_sha256: str
    retrieved_at: datetime
    observed_at: datetime | None
    normalized_records: tuple[dict[str,Any], ...]
    live: bool


class ProviderIngestionCoordinator:
    """Connects real provider HTTP responses to E01 immutable raw ingestion.

    It intentionally stops at normalized candidate records. Canonical identity, Evidence,
    state, Signal, Event and Intelligence promotion remain owned by E02/E03/E06/E38+.
    """
    policies={
        "CELESTRAK_GP":ProviderPolicy("CELESTRAK_GP","CelesTrak GP","PUBLIC_SCREENING","PROVIDER_TERMS_REQUIRED",stale_after_seconds=7200),
        "NASA_JPL_HORIZONS":ProviderPolicy("NASA_JPL_HORIZONS","NASA/JPL Horizons","OFFICIAL_PUBLIC","PROVIDER_TERMS_REQUIRED",stale_after_seconds=86400),
        "NOAA_SWPC":ProviderPolicy("NOAA_SWPC","NOAA Space Weather Prediction Center","OFFICIAL_PUBLIC","US_GOV_PUBLIC_DATA",stale_after_seconds=1800),
        "LAUNCH_LIBRARY_2":ProviderPolicy("LAUNCH_LIBRARY_2","Launch Library 2","PUBLIC_SCREENING","PROVIDER_TERMS_REQUIRED",stale_after_seconds=3600),
    }
    def __init__(self, ingestion_engine):
        self.ingestion=ingestion_engine

    def _source_policy(self, source_id:str):
        from aetherus_domain import DataSourcePolicy, SourceGrade
        p=self.policies[source_id]
        return DataSourcePolicy(id=p.source_id,name=p.name,source_grade=SourceGrade(p.source_grade),license_policy=p.license_policy,access_policy=p.access_policy,stale_after_seconds=p.stale_after_seconds)

    def normalize(self, provider:HTTPProvider, parsed:Any)->list[dict[str,Any]]:
        if isinstance(provider,CelesTrakGPProvider): return provider.normalize_json(parsed)
        if isinstance(provider,NOAASWPCProvider): return provider.normalize_table(parsed)
        if isinstance(provider,LaunchLibraryProvider): return provider.normalize_launches(parsed)
        if isinstance(provider,JPLHorizonsProvider): return [provider.validate_response(parsed)]
        if isinstance(parsed,list): return [x for x in parsed if isinstance(x,dict)]
        if isinstance(parsed,dict): return [parsed]
        return []

    def fetch_to_raw(self, provider:HTTPProvider, url:str, *, observed_at:datetime|None=None, timeout:float=10.0)->ProviderIngestionResult:
        response=provider.fetch(url,timeout=timeout)
        return self.ingest_response(provider,response,observed_at=observed_at)

    def ingest_response(self, provider:HTTPProvider, response:ProviderResponse, *, observed_at:datetime|None=None)->ProviderIngestionResult:
        if response.source_id not in self.policies: raise KeyError(f"provider policy missing: {response.source_id}")
        source=self._source_policy(response.source_id)
        artifact,run=self.ingestion.ingest_bytes(source,response.raw_bytes,retrieved_at=response.retrieved_at,observed_at=observed_at,source_uri=response.request_url,media_type=response.media_type,metadata={"provider_live":response.live,"normalizer":"ProviderIngestionCoordinator"},request_metadata={"url":response.request_url})
        normalized=self.normalize(provider,response.parsed)
        return ProviderIngestionResult(response.source_id,str(artifact.id),str(run.id),artifact.content_sha256,response.retrieved_at,observed_at,tuple(normalized),response.live)
