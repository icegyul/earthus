# -*- coding: utf-8 -*-
"""GK-2A Level 2 Cloud Top Height -> EARTHUS compact relief artifact.

Truth rules:
- source is NOAA public noaa-gk2a-pds only; no synthetic CTH
- CTh units must explicitly resolve to km or m
- CTH_flag == 0 is the only default valid retrieval
- geolocation comes from source lat/lon OR source GK2A GEOS coordinates/metadata
- output preserves source height; decimation only reduces spatial samples

GK2A's established EARTHUS projection convention is reused: scan y increases
northward (opposite the usual CGMS sign used by some implementations).
"""
import io, json, os, re
from datetime import datetime, timedelta, timezone

import boto3, h5py, numpy as np
from botocore import UNSIGNED
from botocore.config import Config

SRC_BUCKET='noaa-gk2a-pds'; DST_BUCKET=os.environ['CACHE_BUCKET']; DST_REGION=os.environ.get('CACHE_REGION') or os.environ.get('AWS_REGION')
OUT_PREFIX=os.environ.get('GK2A_CTH_OUT_PREFIX','clouds/gk2a/cth'); MAX_SIDE=int(os.environ.get('GK2A_CTH_MAX_SIDE','220')); LOOKBACK_HOURS=int(os.environ.get('GK2A_CTH_LOOKBACK_HOURS','8'))
src=boto3.client('s3',region_name='us-east-1',config=Config(signature_version=UNSIGNED)); dst=boto3.client('s3',region_name=DST_REGION)
CANONICAL_TOKEN='gk2a_ami_le2_ctps-cth_'; TIME_RE=re.compile(r'_(\d{12})\.nc$')
REQ_KM=6378.137; RPOL_KM=6356.7523; ALT_KM=42164.0


def _candidate_prefixes(t):
    y,m,d,h=t.strftime('%Y'),t.strftime('%m'),t.strftime('%d'),t.strftime('%H')
    return [f'AMI/L2/CTPS/EA/{y}{m}/{d}/{h}/',f'AMI/L2/CTPS/EA/{y}{m}/{d}/',f'AMI/L2/EA/{y}{m}/{d}/{h}/',f'AMI/L2/EA/{y}{m}/{d}/',f'AMI/L2/{y}{m}/{d}/{h}/',f'AMI/L2/{y}{m}/{d}/']


def find_latest(now=None):
    now=now or datetime.now(timezone.utc); seen=set(); found=[]
    for back in range(LOOKBACK_HOURS+1):
        t=now-timedelta(hours=back)
        for prefix in _candidate_prefixes(t):
            if prefix in seen: continue
            seen.add(prefix); token=None
            while True:
                kw={'Bucket':SRC_BUCKET,'Prefix':prefix,'MaxKeys':1000}
                if token: kw['ContinuationToken']=token
                r=src.list_objects_v2(**kw)
                for obj in r.get('Contents',[]):
                    key=obj['Key']; name=key.rsplit('/',1)[-1].lower()
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
    found.sort(key=lambda x:x[0],reverse=True); return found[0]


def _dataset(h5,*names):
    wanted={n.lower() for n in names}; result=[]
    for name in names:
        if name in h5:return h5[name]
    def visit(path,obj):
        if isinstance(obj,h5py.Dataset) and path.rsplit('/',1)[-1].lower() in wanted: result.append(obj)
    h5.visititems(visit); return result[0] if result else None


def _scalar(v, default=None):
    if v is None:return default
    a=np.asarray(v).reshape(-1)
    if not a.size:return default
    x=a[0]
    if isinstance(x,bytes):x=x.decode('utf-8','replace')
    return x


def _attr_any(obj,*names,default=None):
    for name in names:
        if name in obj.attrs:return _scalar(obj.attrs[name],default)
    return default


def _units(ds):return str(_attr_any(ds,'units','unit',default='')).strip().lower()


def _apply_scale(ds,raw):
    raw=np.asarray(raw,dtype=np.float32); fill=_attr_any(ds,'_FillValue','fill_value',default=None); valid=np.isfinite(raw)
    if fill is not None:
        try: valid &= raw != float(fill)
        except (TypeError,ValueError): pass
    scale=float(_attr_any(ds,'scale_factor',default=1.0)); offset=float(_attr_any(ds,'add_offset',default=0.0)); return raw*scale+offset,valid


def _mesh_xy(x,y,shape):
    x=np.asarray(x,dtype=np.float64); y=np.asarray(y,dtype=np.float64)
    if x.ndim==1 and y.ndim==1 and x.size==shape[1] and y.size==shape[0]:return np.meshgrid(x,y)
    if x.shape==shape and y.shape==shape:return x,y
    raise RuntimeError(f'GK2A_CTH_GEOS_SHAPE_MISMATCH:{x.shape}:{y.shape}:{shape}')


def _scan_from_source(h5,shape):
    xds=_dataset(h5,'x','scan_x','projection_x_coordinate'); yds=_dataset(h5,'y','scan_y','projection_y_coordinate')
    if xds is not None and yds is not None:
        x,y=_mesh_xy(xds[...],yds[...],shape); xu=_units(xds); yu=_units(yds)
        if 'degree' in xu:x=np.radians(x)
        elif xu and 'rad' not in xu:raise RuntimeError(f'GK2A_CTH_UNKNOWN_X_UNITS:{xu}')
        if 'degree' in yu:y=np.radians(y)
        elif yu and 'rad' not in yu:raise RuntimeError(f'GK2A_CTH_UNKNOWN_Y_UNITS:{yu}')
        return x,y,'source-x-y'
    ulx=_attr_any(h5,'image_upperleft_x'); uly=_attr_any(h5,'image_upperleft_y'); lrx=_attr_any(h5,'image_lowerright_x'); lry=_attr_any(h5,'image_lowerright_y')
    if None not in (ulx,uly,lrx,lry):
        x=np.linspace(float(ulx),float(lrx),shape[1],dtype=np.float64); y=np.linspace(float(uly),float(lry),shape[0],dtype=np.float64); return np.meshgrid(x,y)[0],np.meshgrid(x,y)[1],'image-corner-attrs'
    raise RuntimeError('GK2A_CTH_GEOS_COORDINATES_REQUIRED')


def _sub_lon_rad(h5):
    v=_attr_any(h5,'sub_longitude','longitude_of_projection_origin','longitude_of_central_meridian',default=None)
    if v is None:
        proj=_dataset(h5,'goes_imager_projection','geos_projection','projection')
        if proj is not None:v=_attr_any(proj,'longitude_of_projection_origin','longitude_of_central_meridian',default=None)
    if v is None:raise RuntimeError('GK2A_CTH_SUB_LONGITUDE_REQUIRED')
    v=float(v)
    return np.radians(v) if abs(v)>np.pi*2 else v


def _geos_inverse(x,y,sub):
    """Inverse of the GK2A scan convention already verified in aws/gk2a-clouds/handler.py."""
    cosx=np.cos(x); sinx=np.sin(x); cosy=np.cos(y); siny=np.sin(y); ratio=(REQ_KM*REQ_KM)/(RPOL_KM*RPOL_KM)
    a=cosy*cosy + ratio*siny*siny
    b=-2.0*ALT_KM*cosx*cosy
    c=ALT_KM*ALT_KM-REQ_KM*REQ_KM
    disc=b*b-4*a*c; visible=disc>=0
    sd=np.sqrt(np.maximum(disc,0.0)); sn=(-b-sd)/(2*a)
    s1=ALT_KM-sn*cosx*cosy; s2=sn*sinx*cosy; s3=sn*siny
    lon=sub+np.arctan2(s2,s1)
    lat=np.arctan2(ratio*s3,np.sqrt(s1*s1+s2*s2))
    lat=np.degrees(lat); lon=np.degrees(lon); lon=((lon+180)%360)-180
    valid=visible&np.isfinite(lat)&np.isfinite(lon)&(lat>=-90)&(lat<=90)
    return lat.astype(np.float32),lon.astype(np.float32),valid


def _geolocation(h5,shape):
    latds=_dataset(h5,'latitude','lat'); londs=_dataset(h5,'longitude','lon')
    if latds is not None and londs is not None:
        lat=np.asarray(latds[...],dtype=np.float32); lon=np.asarray(londs[...],dtype=np.float32)
        if lat.shape!=shape or lon.shape!=shape:raise RuntimeError(f'GK2A_CTH_GEOLOCATION_SHAPE_MISMATCH:{lat.shape}:{lon.shape}:{shape}')
        valid=np.isfinite(lat)&np.isfinite(lon)&(lat>=-90)&(lat<=90)&(lon>=-180)&(lon<=360); lon=np.where(lon>180,lon-360,lon); return lat,lon,valid,'source-lat-lon'
    x,y,method=_scan_from_source(h5,shape); lat,lon,valid=_geos_inverse(x,y,_sub_lon_rad(h5)); return lat,lon,valid,f'gk2a-geos:{method}'


def compile_artifact(payload,source_key,valid_at):
    with h5py.File(io.BytesIO(payload),'r') as h5:
        cthds=_dataset(h5,'CTh','CTH','cth'); flagds=_dataset(h5,'CTH_flag','cth_flag')
        if cthds is None:raise RuntimeError('GK2A_CTH_VARIABLE_MISSING')
        cth,valid=_apply_scale(cthds,cthds[...])
        if cth.ndim!=2:raise RuntimeError(f'GK2A_CTH_EXPECTED_2D:{cth.shape}')
        units=_units(cthds)
        if units in {'km','kilometer','kilometers','kilometre','kilometres'}:cth_m=cth*1000.0
        elif units in {'m','meter','meters','metre','metres'}:cth_m=cth
        else:raise RuntimeError(f'GK2A_CTH_UNKNOWN_UNITS:{units or "EMPTY"}')
        lat,lon,geo_valid,geo_method=_geolocation(h5,cth.shape); valid &= geo_valid
        if flagds is not None:
            flag=np.asarray(flagds[...]);
            if flag.shape!=cth.shape:raise RuntimeError('GK2A_CTH_FLAG_SHAPE_MISMATCH')
            valid &= flag==0
        valid &= np.isfinite(cth_m)&(cth_m>=0)&(cth_m<=25000)
        stride=max(1,int(np.ceil(max(cth.shape)/MAX_SIDE))); lat=lat[::stride,::stride]; lon=lon[::stride,::stride]; cth_m=cth_m[::stride,::stride]; valid=valid[::stride,::stride]
        if valid.sum()<100:raise RuntimeError(f'GK2A_CTH_TOO_FEW_VALID_CELLS:{int(valid.sum())}')
        h,w=cth_m.shape
        return {'schemaVersion':'earthus.cloud.cth.grid.v1','truthClass':'OBSERVED_DERIVED_OFFICIAL_L2','sourceId':'KMA_GK2A_AMI_L2_CTPS_CTH_VIA_NOAA_NODD','validAt':valid_at.isoformat().replace('+00:00','Z'),'sourceObject':f's3://{SRC_BUCKET}/{source_key}','units':'m','width':w,'height':h,'stride':stride,'longitude':np.round(lon,5).reshape(-1).tolist(),'latitude':np.round(lat,5).reshape(-1).tolist(),'heightM':np.round(cth_m,1).reshape(-1).tolist(),'valid':valid.astype(np.uint8).reshape(-1).tolist(),'qualityRule':'CTH_flag==0 when available; finite official CTh only','geolocationMethod':geo_method,'synthetic':False}


def put_json(key,value,cache='max-age=300'):
    body=json.dumps(value,separators=(',',':'),ensure_ascii=False).encode('utf-8'); dst.put_object(Bucket=DST_BUCKET,Key=key,Body=body,ContentType='application/json; charset=utf-8',CacheControl=cache); return len(body)


def run(now=None):
    valid_at,key,size=find_latest(now); raw=src.get_object(Bucket=SRC_BUCKET,Key=key)['Body'].read()
    if size and len(raw)!=size:raise RuntimeError('GK2A_CTH_TRUNCATED_DOWNLOAD')
    grid=compile_artifact(raw,key,valid_at); n=put_json(f'{OUT_PREFIX}/grid.json',grid)
    manifest={'schemaVersion':'earthus.cloud.cth.manifest.v1','ready':True,'synthetic':False,'truthClass':grid['truthClass'],'sourceId':grid['sourceId'],'validAt':grid['validAt'],'gridUrl':'grid.json','width':grid['width'],'height':grid['height'],'stride':grid['stride'],'units':'m','sourceObject':grid['sourceObject'],'geolocationMethod':grid['geolocationMethod'],'bytes':n}; put_json(f'{OUT_PREFIX}/manifest.json',manifest,cache='max-age=120'); return manifest


def lambda_handler(event,context):
    try:return {'statusCode':200,'body':json.dumps(run(),ensure_ascii=False)}
    except Exception as e:print('[gk2a-cth]',repr(e));return {'statusCode':503,'body':json.dumps({'ready':False,'error':str(e)})}

if __name__=='__main__':print(json.dumps(run(),ensure_ascii=False,indent=2))
