# -*- coding: utf-8 -*-
"""NOAA GFS 0.50° pressure-level cloud fields -> bounded EARTHUS voxel density.

Source: NCEP NOMADS filter_gfs_0p50.pl.  We request only East Asia and only
TCDC/CLWMR/ICMR/HGT on selected isobaric levels. Density is the model's TCDC
fraction resampled by physical HGT onto a uniform altitude axis; liquid/ice
mixing ratios are retained as provenance statistics, never fabricated.
"""
import io, json, math, os, tempfile, urllib.parse, urllib.request
from datetime import datetime, timedelta, timezone

import boto3, numpy as np

BUCKET=os.environ['CACHE_BUCKET'];REGION=os.environ.get('CACHE_REGION') or os.environ.get('AWS_REGION')
DST_PREFIX=os.environ.get('GFS_CLOUD_VOLUME_PREFIX','clouds/gfs/volume/east-asia')
BASE='https://nomads.ncep.noaa.gov/cgi-bin/filter_gfs_0p50.pl'
LEVELS=[1000,975,950,925,900,875,850,825,800,775,750,725,700,675,650,625,600,575,550,525,500,475,450,425,400,375,350,325,300,275,250,225,200,175,150,125,100]
BOUNDS={'leftlon':108,'rightlon':155,'toplat':52,'bottomlat':18}
Z_LEVELS=int(os.environ.get('GFS_CLOUD_Z_LEVELS','32'));MAX_BYTES=4*1024*1024
s3=boto3.client('s3',region_name=REGION)


def candidate_runs(now=None):
    now=now or datetime.now(timezone.utc);out=[]
    for back in range(0,30,6):
        t=now-timedelta(hours=back+4);hh=(t.hour//6)*6;t=t.replace(hour=hh,minute=0,second=0,microsecond=0)
        if t not in out: out.append(t)
    return out


def url_for(run,step=0):
    q={'file':f'gfs.t{run:%H}z.pgrb2full.0p50.f{step:03d}','dir':f'/gfs.{run:%Y%m%d}/{run:%H}/atmos','subregion':'','var_TCDC':'on','var_CLWMR':'on','var_ICMR':'on','var_HGT':'on',**{f'lev_{p}_mb':'on' for p in LEVELS},**BOUNDS}
    return BASE+'?'+urllib.parse.urlencode(q)


def fetch_latest():
    for run in candidate_runs():
        url=url_for(run)
        try:
            req=urllib.request.Request(url,headers={'User-Agent':'earthus/2.0 (+earthus.net)'})
            with urllib.request.urlopen(req,timeout=90) as r:
                data=r.read()
            if len(data)>10000 and data[:4]==b'GRIB': return run,url,data
        except Exception as e: print('[gfs-cloud]',run.isoformat(),repr(e))
    raise RuntimeError('GFS_CLOUD_VOLUME_NO_RECENT_RUN')


def decode_messages(raw):
    import eccodes
    fields={};latitudes=longitudes=None;shape=None
    with tempfile.NamedTemporaryFile(suffix='.grib2') as f:
        f.write(raw);f.flush()
        with open(f.name,'rb') as fh:
            while True:
                gid=eccodes.codes_grib_new_from_file(fh)
                if gid is None: break
                try:
                    short=eccodes.codes_get(gid,'shortName').upper();level=int(round(eccodes.codes_get(gid,'level')))
                    if short not in {'TCDC','CLWMR','ICMR','HGT'} or level not in LEVELS: continue
                    vals=np.asarray(eccodes.codes_get_values(gid),dtype=np.float32)
                    ni=int(eccodes.codes_get(gid,'Ni'));nj=int(eccodes.codes_get(gid,'Nj'))
                    if vals.size!=ni*nj: raise RuntimeError('GFS_GRID_SHAPE')
                    if shape is None:
                        shape=(nj,ni);latitudes=np.asarray(eccodes.codes_get_array(gid,'latitudes'),dtype=np.float32).reshape(shape);longitudes=np.asarray(eccodes.codes_get_array(gid,'longitudes'),dtype=np.float32).reshape(shape);longitudes=np.where(longitudes>180,longitudes-360,longitudes)
                    elif shape!=(nj,ni): raise RuntimeError('GFS_GRID_INCONSISTENT')
                    fields[(short,level)]=vals.reshape(shape)
                finally:eccodes.codes_release(gid)
    return fields,latitudes,longitudes,shape


def build_volume(fields,lat,lon,shape):
    available=[p for p in LEVELS if ('TCDC',p) in fields and ('HGT',p) in fields]
    if len(available)<8: raise RuntimeError(f'GFS_CLOUD_TOO_FEW_VERTICAL_LEVELS:{len(available)}')
    h=np.stack([fields[('HGT',p)] for p in available],axis=0)
    c=np.stack([fields[('TCDC',p)] for p in available],axis=0)
    if not np.isfinite(h).all(): raise RuntimeError('GFS_HGT_NONFINITE')
    c=np.clip(np.nan_to_num(c,nan=0.0),0,100)/100.0
    bottom=max(0.0,float(np.nanpercentile(h,1)));top=min(20000.0,float(np.nanpercentile(h,99)))
    if top-bottom<3000: raise RuntimeError('GFS_VERTICAL_SPAN_TOO_SMALL')
    target=np.linspace(bottom,top,Z_LEVELS,dtype=np.float32)
    nj,ni=shape;out=np.zeros((Z_LEVELS,nj,ni),dtype=np.float32)
    # each column has pressure levels ordered top->bottom depending source; sort by real HGT
    for y in range(nj):
        for x in range(ni):
            hz=h[:,y,x];cv=c[:,y,x];order=np.argsort(hz);out[:,y,x]=np.interp(target,hz[order],cv[order],left=0,right=0)
    q=np.rint(np.clip(out,0,1)*255).astype(np.uint8)
    payload=q.tobytes(order='C')
    if len(payload)>MAX_BYTES: raise RuntimeError(f'GFS_VOLUME_BYTE_BUDGET:{len(payload)}')
    # optional condensate statistics prove liquid/ice fields were requested without inventing density from them
    stats={}
    for name in ('CLWMR','ICMR'):
        vals=[fields[(name,p)] for p in available if (name,p) in fields]
        if vals:
            a=np.stack(vals);finite=a[np.isfinite(a)];stats[name.lower()]={'max':float(finite.max()) if finite.size else 0.0,'mean':float(finite.mean()) if finite.size else 0.0,'units':'kg kg-1'}
    return payload,{
      'dimensions':{'x':ni,'y':nj,'z':Z_LEVELS},'anchor':{'longitudeDeg':float((lon.min()+lon.max())/2),'latitudeDeg':float((lat.min()+lat.max())/2),'bottomM':bottom,'topM':top},
      'boundsDegrees':{'west':float(lon.min()),'east':float(lon.max()),'south':float(lat.min()),'north':float(lat.max())},
      'sizeM':{'eastWestM':float((lon.max()-lon.min())*111320*math.cos(math.radians(float(lat.mean())))),'northSouthM':float((lat.max()-lat.min())*110540)},
      'pressureLevelsHpa':available,'altitudeAxisM':[round(float(v),1) for v in target], 'condensateStats':stats,
    }


def put(key,body,ctype,cache):s3.put_object(Bucket=BUCKET,Key=key,Body=body,ContentType=ctype,CacheControl=cache)


def run():
    run_time,url,raw=fetch_latest();fields,lat,lon,shape=decode_messages(raw);payload,meta=build_volume(fields,lat,lon,shape)
    density_key=f'{DST_PREFIX}/density.u8';put(density_key,payload,'application/octet-stream','max-age=600')
    manifest={'schemaVersion':'earthus.cloud.volume.v1','ready':True,'production':True,'synthetic':False,'encoding':'UINT8_0_255','byteLength':len(payload),'densityUrl':'density.u8',
      'cloudState':{'truthClass':'MODELLED_NWP','sourceId':'NOAA_NCEP_GFS_0P50_NOMADS','validAt':run_time.isoformat().replace('+00:00','Z'),'confidence':0.8,'volume':{'densityReady':True,'verticalStructureReady':True}},
      'densityMeaning':'GFS pressure-level TCDC fraction linearly resampled by GFS HGT onto uniform geometric altitude; no synthetic cloud coverage added','sourceUrl':url,**meta}
    put(f'{DST_PREFIX}/manifest.json',json.dumps(manifest,separators=(',',':')).encode(),'application/json; charset=utf-8','max-age=300');return manifest


def lambda_handler(event,context):
    try:return {'statusCode':200,'body':json.dumps(run(),ensure_ascii=False)}
    except Exception as e:print('[gfs-cloud-volume]',repr(e));return {'statusCode':503,'body':json.dumps({'ready':False,'error':str(e)})}

if __name__=='__main__':print(json.dumps(run(),indent=2))
