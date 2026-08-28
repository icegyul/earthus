# -*- coding: utf-8 -*-
"""GK-2A Level 2 Cloud Top Height -> EARTHUS compact relief artifact.

Truth rules:
- source is NOAA public noaa-gk2a-pds only; no synthetic CTH
- CTh units must explicitly resolve to km or m
- CTH_flag == 0 is the only default valid retrieval
- geolocation must be present as lon/lat grids; no invented bbox
- output preserves source height; decimation only reduces spatial samples

NMSC product definition: CTPS contains CTh and CTH_flag, CTH unit km.
The public NOAA bucket is unsigned-accessible. The exact object hierarchy is
not hard-coded: latest candidates are discovered under recent AMI/L2 prefixes
and filtered by the canonical filename token `gk2a_ami_le2_ctps-cth_`.
"""
import io, json, os, re
from datetime import datetime, timedelta, timezone

import boto3, h5py, numpy as np
from botocore import UNSIGNED
from botocore.config import Config

SRC_BUCKET = 'noaa-gk2a-pds'
DST_BUCKET = os.environ['CACHE_BUCKET']
DST_REGION = os.environ.get('CACHE_REGION') or os.environ.get('AWS_REGION')
OUT_PREFIX = os.environ.get('GK2A_CTH_OUT_PREFIX', 'clouds/gk2a/cth')
MAX_SIDE = int(os.environ.get('GK2A_CTH_MAX_SIDE', '220'))
LOOKBACK_HOURS = int(os.environ.get('GK2A_CTH_LOOKBACK_HOURS', '8'))

src = boto3.client('s3', region_name='us-east-1', config=Config(signature_version=UNSIGNED))
dst = boto3.client('s3', region_name=DST_REGION)

CANONICAL_TOKEN = 'gk2a_ami_le2_ctps-cth_'
TIME_RE = re.compile(r'_(\d{12})\.nc$')


def _candidate_prefixes(t):
    y,m,d,h=t.strftime('%Y'),t.strftime('%m'),t.strftime('%d'),t.strftime('%H')
    # NOAA has historically mirrored GK2A trees with product/area/date hierarchy.
    # We probe bounded recent prefixes and accept ONLY canonical CTH filenames.
    return [
        f'AMI/L2/CTPS/EA/{y}{m}/{d}/{h}/',
        f'AMI/L2/CTPS/EA/{y}{m}/{d}/',
        f'AMI/L2/EA/{y}{m}/{d}/{h}/',
        f'AMI/L2/EA/{y}{m}/{d}/',
        f'AMI/L2/{y}{m}/{d}/{h}/',
        f'AMI/L2/{y}{m}/{d}/',
    ]


def find_latest(now=None):
    now=now or datetime.now(timezone.utc)
    seen=set(); found=[]
    for back in range(LOOKBACK_HOURS + 1):
        t=now-timedelta(hours=back)
        for prefix in _candidate_prefixes(t):
            if prefix in seen: continue
            seen.add(prefix)
            token=None
            while True:
                kwargs={'Bucket':SRC_BUCKET,'Prefix':prefix,'MaxKeys':1000}
                if token: kwargs['ContinuationToken']=token
                r=src.list_objects_v2(**kwargs)
                for obj in r.get('Contents',[]):
                    key=obj['Key']
                    name=key.rsplit('/',1)[-1].lower()
                    if CANONICAL_TOKEN not in name or not name.endswith('.nc'): continue
                    m=TIME_RE.search(name)
                    if not m: continue
                    try: valid=datetime.strptime(m.group(1),'%Y%m%d%H%M').replace(tzinfo=timezone.utc)
                    except ValueError: continue
                    found.append((valid,key,obj.get('Size',0)))
                if not r.get('IsTruncated'): break
                token=r.get('NextContinuationToken')
        if found: break
    if not found: raise RuntimeError('GK2A_L2_CTH_NOT_FOUND_IN_BOUNDED_RECENT_PREFIXES')
    found.sort(key=lambda x:x[0], reverse=True)
    return found[0]


def _dataset(h5,*names):
    lower={k.lower():k for k in h5.keys()}
    for name in names:
        if name in h5: return h5[name]
        hit=lower.get(name.lower())
        if hit: return h5[hit]
    # bounded recursive search for nested groups
    result=[]
    def visit(path,obj):
        if isinstance(obj,h5py.Dataset) and path.rsplit('/',1)[-1].lower() in {n.lower() for n in names}: result.append(obj)
    h5.visititems(visit)
    return result[0] if result else None


def _units(ds):
    u=ds.attrs.get('units','')
    if isinstance(u,bytes): u=u.decode('utf-8','replace')
    return str(u).strip().lower()


def _apply_scale(ds, raw):
    raw=np.asarray(raw,dtype=np.float32)
    fill=ds.attrs.get('_FillValue',None)
    valid=np.isfinite(raw)
    if fill is not None: valid &= raw != float(np.asarray(fill).reshape(-1)[0])
    scale=float(np.asarray(ds.attrs.get('scale_factor',1.0)).reshape(-1)[0])
    offset=float(np.asarray(ds.attrs.get('add_offset',0.0)).reshape(-1)[0])
    return raw*scale+offset,valid


def _geolocation(h5,shape):
    latds=_dataset(h5,'latitude','lat')
    londs=_dataset(h5,'longitude','lon')
    if latds is None or londs is None: raise RuntimeError('GK2A_CTH_GEOLOCATION_GRID_REQUIRED')
    lat=np.asarray(latds[...],dtype=np.float32); lon=np.asarray(londs[...],dtype=np.float32)
    if lat.shape!=shape or lon.shape!=shape: raise RuntimeError(f'GK2A_CTH_GEOLOCATION_SHAPE_MISMATCH:{lat.shape}:{lon.shape}:{shape}')
    valid=np.isfinite(lat)&np.isfinite(lon)&(lat>=-90)&(lat<=90)&(lon>=-180)&(lon<=360)
    lon=np.where(lon>180,lon-360,lon)
    return lat,lon,valid


def compile_artifact(payload, source_key, valid_at):
    with h5py.File(io.BytesIO(payload),'r') as h5:
        cthds=_dataset(h5,'CTh','CTH','cth')
        flagds=_dataset(h5,'CTH_flag','cth_flag')
        if cthds is None: raise RuntimeError('GK2A_CTH_VARIABLE_MISSING')
        cth,valid=_apply_scale(cthds,cthds[...])
        if cth.ndim!=2: raise RuntimeError(f'GK2A_CTH_EXPECTED_2D:{cth.shape}')
        units=_units(cthds)
        if units in {'km','kilometer','kilometers','kilometre','kilometres'}: cth_m=cth*1000.0
        elif units in {'m','meter','meters','metre','metres'}: cth_m=cth
        else: raise RuntimeError(f'GK2A_CTH_UNKNOWN_UNITS:{units or "EMPTY"}')
        lat,lon,geo_valid=_geolocation(h5,cth.shape); valid &= geo_valid
        if flagds is not None:
            flag=np.asarray(flagds[...])
            if flag.shape!=cth.shape: raise RuntimeError('GK2A_CTH_FLAG_SHAPE_MISMATCH')
            valid &= flag==0
        valid &= np.isfinite(cth_m)&(cth_m>=0)&(cth_m<=25000)

        stride=max(1,int(np.ceil(max(cth.shape)/MAX_SIDE)))
        lat=lat[::stride,::stride];lon=lon[::stride,::stride];cth_m=cth_m[::stride,::stride];valid=valid[::stride,::stride]
        if valid.sum()<100: raise RuntimeError(f'GK2A_CTH_TOO_FEW_VALID_CELLS:{int(valid.sum())}')
        h,w=cth_m.shape
        grid={
            'schemaVersion':'earthus.cloud.cth.grid.v1',
            'truthClass':'OBSERVED_DERIVED_OFFICIAL_L2',
            'sourceId':'KMA_GK2A_AMI_L2_CTPS_CTH_VIA_NOAA_NODD',
            'validAt':valid_at.isoformat().replace('+00:00','Z'),
            'sourceObject':f's3://{SRC_BUCKET}/{source_key}',
            'units':'m','width':w,'height':h,'stride':stride,
            'longitude':np.round(lon,5).reshape(-1).tolist(),
            'latitude':np.round(lat,5).reshape(-1).tolist(),
            'heightM':np.round(cth_m,1).reshape(-1).tolist(),
            'valid':valid.astype(np.uint8).reshape(-1).tolist(),
            'qualityRule':'CTH_flag==0 when available; finite official CTh only',
            'synthetic':False,
        }
        return grid


def put_json(key,value,cache='max-age=300'):
    body=json.dumps(value,separators=(',',':'),ensure_ascii=False).encode('utf-8')
    dst.put_object(Bucket=DST_BUCKET,Key=key,Body=body,ContentType='application/json; charset=utf-8',CacheControl=cache)
    return len(body)


def run(now=None):
    valid_at,key,size=find_latest(now)
    raw=src.get_object(Bucket=SRC_BUCKET,Key=key)['Body'].read()
    if size and len(raw)!=size: raise RuntimeError('GK2A_CTH_TRUNCATED_DOWNLOAD')
    grid=compile_artifact(raw,key,valid_at)
    grid_key=f'{OUT_PREFIX}/grid.json'; n=put_json(grid_key,grid)
    manifest={
        'schemaVersion':'earthus.cloud.cth.manifest.v1','ready':True,'synthetic':False,
        'truthClass':grid['truthClass'],'sourceId':grid['sourceId'],'validAt':grid['validAt'],
        'gridUrl':'grid.json','width':grid['width'],'height':grid['height'],'stride':grid['stride'],
        'units':'m','sourceObject':grid['sourceObject'],'bytes':n,
    }
    put_json(f'{OUT_PREFIX}/manifest.json',manifest,cache='max-age=120')
    return manifest


def lambda_handler(event,context):
    try:return {'statusCode':200,'body':json.dumps(run(),ensure_ascii=False)}
    except Exception as e:
        print('[gk2a-cth]',repr(e));return {'statusCode':503,'body':json.dumps({'ready':False,'error':str(e)})}

if __name__=='__main__': print(json.dumps(run(),ensure_ascii=False,indent=2))
