# -*- coding: utf-8 -*-
"""NOAA GFS 0.50° pressure-level cloud fields -> bounded EARTHUS voxel density.

Source: NCEP NOMADS filter_gfs_0p50.pl. Requests East Asia only and only
TCDC/CLWMR/ICMR/HGT on isobaric levels. Density is real GFS total-cloud-cover
fraction resampled by real GFS geopotential height onto a uniform altitude axis.
No missing field is converted into synthetic clear/cloud sky.

NCEP inventory mnemonics and ecCodes shortNames are not identical. In particular,
NCEP TCDC is commonly exposed by ecCodes as ``tcc`` and NCEP HGT as ``gh``.
This decoder therefore canonicalizes both naming systems while still requiring
pressure-level messages and the exact requested hPa levels.
"""
import json
import math
import os
import tempfile
import urllib.parse
import urllib.request
from datetime import datetime, timedelta, timezone

import boto3
import numpy as np

BUCKET = os.environ['CACHE_BUCKET']
REGION = os.environ.get('CACHE_REGION') or os.environ.get('AWS_REGION')
DST_PREFIX = os.environ.get('GFS_CLOUD_VOLUME_PREFIX', 'clouds/gfs/volume/east-asia')
BASE = 'https://nomads.ncep.noaa.gov/cgi-bin/filter_gfs_0p50.pl'

# Operational GFS pressure levels used for the bounded vertical cloud column.
LEVELS = [1000, 975, 950, 925, 900, 850, 800, 750, 700, 650, 600, 550, 500, 450, 400, 350, 300, 250, 200, 150, 100]
BOUNDS = {'leftlon': 108, 'rightlon': 155, 'toplat': 52, 'bottomlat': 18}
Z_LEVELS = int(os.environ.get('GFS_CLOUD_Z_LEVELS', '32'))
MAX_BYTES = 4 * 1024 * 1024
s3 = boto3.client('s3', region_name=REGION)

# ecCodes uses WMO/ECMWF-style shortNames for some NCEP fields.
# Canonical names below are the names used by the rest of this pipeline.
SHORT_ALIASES = {
    'TCDC': 'TCDC',
    'TCC': 'TCDC',
    'HGT': 'HGT',
    'GH': 'HGT',
    'CLWMR': 'CLWMR',
    'ICMR': 'ICMR',
}


def candidate_runs(now=None):
    now = now or datetime.now(timezone.utc)
    out = []
    # f000 is normally published a few hours after cycle time. Walk backwards without guessing success.
    for back in range(0, 36, 6):
        t = now - timedelta(hours=back + 4)
        t = t.replace(hour=(t.hour // 6) * 6, minute=0, second=0, microsecond=0)
        if t not in out:
            out.append(t)
    return out


def url_for(run, step=0):
    q = {
        'file': f'gfs.t{run:%H}z.pgrb2full.0p50.f{step:03d}',
        'dir': f'/gfs.{run:%Y%m%d}/{run:%H}/atmos',
        'subregion': '',
        'var_TCDC': 'on',
        'var_CLWMR': 'on',
        'var_ICMR': 'on',
        'var_HGT': 'on',
        **{f'lev_{p}_mb': 'on' for p in LEVELS},
        **BOUNDS,
    }
    return BASE + '?' + urllib.parse.urlencode(q)


def fetch_latest():
    for run in candidate_runs():
        url = url_for(run)
        try:
            req = urllib.request.Request(url, headers={'User-Agent': 'earthus/2.0 (+earthus.net)'})
            with urllib.request.urlopen(req, timeout=90) as response:
                data = response.read()
            if len(data) > 10000 and data[:4] == b'GRIB':
                return run, url, data
        except Exception as exc:  # noqa: BLE001
            print('[gfs-cloud]', run.isoformat(), repr(exc))
    raise RuntimeError('GFS_CLOUD_VOLUME_NO_RECENT_RUN')


def _canonical_field(eccodes, gid):
    raw_short = str(eccodes.codes_get(gid, 'shortName')).strip()
    canonical = SHORT_ALIASES.get(raw_short.upper())
    if canonical:
        return canonical, raw_short

    # Defensive name fallback for future ecCodes definition changes.
    try:
        name = str(eccodes.codes_get(gid, 'name')).strip().lower()
    except Exception:  # noqa: BLE001
        name = ''
    if name == 'total cloud cover':
        return 'TCDC', raw_short
    if name in {'geopotential height', 'geopotential height anomaly'}:
        return 'HGT', raw_short
    if name == 'cloud mixing ratio':
        return 'CLWMR', raw_short
    if name == 'ice water mixing ratio':
        return 'ICMR', raw_short
    return None, raw_short


def _pressure_level_hpa(eccodes, gid):
    try:
        level_type = str(eccodes.codes_get(gid, 'typeOfLevel'))
        level = float(eccodes.codes_get(gid, 'level'))
    except Exception:  # noqa: BLE001
        return None, None
    if level_type == 'isobaricInhPa':
        hpa = level
    elif level_type == 'isobaricInPa':
        hpa = level / 100.0
    else:
        return None, level_type
    return int(round(hpa)), level_type


def _clean_values(eccodes, gid, canonical):
    vals = np.asarray(eccodes.codes_get_values(gid), dtype=np.float32)
    try:
        missing = float(eccodes.codes_get(gid, 'missingValue'))
        vals = np.where(vals == missing, np.nan, vals)
    except Exception:  # noqa: BLE001
        pass
    if canonical == 'TCDC':
        finite = vals[np.isfinite(vals)]
        if not finite.size or finite.min() < -0.01 or finite.max() > 100.01:
            raise RuntimeError(
                f'GFS_TCDC_RANGE:{finite.min() if finite.size else "EMPTY"}:{finite.max() if finite.size else "EMPTY"}'
            )
    elif canonical == 'HGT':
        finite = vals[np.isfinite(vals)]
        if not finite.size or finite.min() < -1000 or finite.max() > 60000:
            raise RuntimeError('GFS_HGT_RANGE')
    elif canonical in {'CLWMR', 'ICMR'}:
        finite = vals[np.isfinite(vals)]
        if finite.size and finite.min() < -1e-8:
            raise RuntimeError(f'GFS_{canonical}_NEGATIVE')
    return vals


def decode_messages(raw):
    import eccodes

    fields = {}
    latitudes = longitudes = None
    shape = None
    raw_short_names = set()
    pressure_levels = {name: set() for name in ('TCDC', 'HGT', 'CLWMR', 'ICMR')}
    ignored_level_types = set()

    with tempfile.NamedTemporaryFile(suffix='.grib2') as tmp:
        tmp.write(raw)
        tmp.flush()
        with open(tmp.name, 'rb') as fh:
            while True:
                gid = eccodes.codes_grib_new_from_file(fh)
                if gid is None:
                    break
                try:
                    canonical, raw_short = _canonical_field(eccodes, gid)
                    raw_short_names.add(raw_short)
                    if canonical is None:
                        continue
                    level, level_type = _pressure_level_hpa(eccodes, gid)
                    if level is None:
                        if level_type:
                            ignored_level_types.add(level_type)
                        continue
                    if level not in LEVELS:
                        continue

                    ni = int(eccodes.codes_get(gid, 'Ni'))
                    nj = int(eccodes.codes_get(gid, 'Nj'))
                    vals = _clean_values(eccodes, gid, canonical)
                    if vals.size != ni * nj:
                        raise RuntimeError('GFS_GRID_SHAPE')
                    if shape is None:
                        shape = (nj, ni)
                        latitudes = np.asarray(eccodes.codes_get_array(gid, 'latitudes'), dtype=np.float32).reshape(shape)
                        longitudes = np.asarray(eccodes.codes_get_array(gid, 'longitudes'), dtype=np.float32).reshape(shape)
                        longitudes = np.where(longitudes > 180, longitudes - 360, longitudes)
                    elif shape != (nj, ni):
                        raise RuntimeError('GFS_GRID_INCONSISTENT')
                    fields[(canonical, level)] = vals.reshape(shape)
                    pressure_levels[canonical].add(level)
                finally:
                    eccodes.codes_release(gid)

    if shape is None or latitudes is None or longitudes is None:
        raise RuntimeError(
            'GFS_NO_GRID_MESSAGES:rawShortNames=' + ','.join(sorted(raw_short_names)[:24])
        )
    diagnostics = {
        'rawShortNames': sorted(raw_short_names),
        'pressureLevelsByField': {key: sorted(value, reverse=True) for key, value in pressure_levels.items()},
        'ignoredLevelTypes': sorted(ignored_level_types),
        'aliasContract': {'tcc': 'TCDC', 'gh': 'HGT'},
    }
    return fields, latitudes, longitudes, shape, diagnostics


def normalize_horizontal_axes(fields, lat, lon, shape):
    """Voxel local Y increases south->north and X west->east. Reorder GRIB arrays to match."""
    if not (np.isfinite(lat).all() and np.isfinite(lon).all()):
        raise RuntimeError('GFS_LATLON_NONFINITE')
    flip_y = float(np.nanmean(lat[0])) > float(np.nanmean(lat[-1]))
    flip_x = float(np.nanmean(lon[:, 0])) > float(np.nanmean(lon[:, -1]))
    if flip_y:
        lat = lat[::-1, :]
        lon = lon[::-1, :]
    if flip_x:
        lat = lat[:, ::-1]
        lon = lon[:, ::-1]
    normalized = {}
    for key, array in fields.items():
        value = array[::-1, :] if flip_y else array
        value = value[:, ::-1] if flip_x else value
        normalized[key] = value
    if float(np.nanmean(lat[0])) >= float(np.nanmean(lat[-1])):
        raise RuntimeError('GFS_LATITUDE_AXIS_NOT_SOUTH_TO_NORTH')
    if float(np.nanmean(lon[:, 0])) >= float(np.nanmean(lon[:, -1])):
        raise RuntimeError('GFS_LONGITUDE_AXIS_NOT_WEST_TO_EAST')
    return normalized, lat, lon, shape, {'flippedY': flip_y, 'flippedX': flip_x}


def build_volume(fields, lat, lon, shape, axis_info, decoder_diagnostics):
    available = [p for p in LEVELS if ('TCDC', p) in fields and ('HGT', p) in fields]
    if len(available) < 8:
        tcdc = decoder_diagnostics['pressureLevelsByField'].get('TCDC', [])
        hgt = decoder_diagnostics['pressureLevelsByField'].get('HGT', [])
        raw_names = decoder_diagnostics.get('rawShortNames', [])
        raise RuntimeError(
            'GFS_CLOUD_TOO_FEW_VERTICAL_LEVELS:'
            f'{len(available)}:TCDC={tcdc}:HGT={hgt}:RAW_SHORT={raw_names[:16]}'
        )

    h = np.stack([fields[('HGT', p)] for p in available], axis=0)
    c = np.stack([fields[('TCDC', p)] for p in available], axis=0)
    if not np.isfinite(h).all():
        raise RuntimeError('GFS_HGT_MISSING_OR_NONFINITE')
    if not np.isfinite(c).all():
        raise RuntimeError('GFS_TCDC_MISSING_OR_NONFINITE')
    c = np.clip(c, 0, 100) / 100.0
    bottom = max(0.0, float(np.percentile(h, 1)))
    top = min(20000.0, float(np.percentile(h, 99)))
    if top - bottom < 3000:
        raise RuntimeError('GFS_VERTICAL_SPAN_TOO_SMALL')

    target = np.linspace(bottom, top, Z_LEVELS, dtype=np.float32)
    nj, ni = shape
    out = np.zeros((Z_LEVELS, nj, ni), dtype=np.float32)
    for y in range(nj):
        for x in range(ni):
            hz = h[:, y, x]
            cv = c[:, y, x]
            order = np.argsort(hz)
            hz = hz[order]
            cv = cv[order]
            if np.any(np.diff(hz) <= 0):
                unique, idx = np.unique(hz, return_index=True)
                hz = unique
                cv = cv[idx]
            if hz.size < 4:
                raise RuntimeError('GFS_VERTICAL_COLUMN_TOO_SHORT')
            out[:, y, x] = np.interp(target, hz, cv, left=0, right=0)

    quantized = np.rint(np.clip(out, 0, 1) * 255).astype(np.uint8)
    payload = quantized.tobytes(order='C')
    if len(payload) > MAX_BYTES:
        raise RuntimeError(f'GFS_VOLUME_BYTE_BUDGET:{len(payload)}')

    stats = {}
    for name in ('CLWMR', 'ICMR'):
        vals = [fields[(name, p)] for p in available if (name, p) in fields]
        if vals:
            array = np.stack(vals)
            finite = array[np.isfinite(array)]
            stats[name.lower()] = {
                'max': float(finite.max()) if finite.size else 0.0,
                'mean': float(finite.mean()) if finite.size else 0.0,
                'units': 'kg kg-1',
            }

    return payload, {
        'dimensions': {'x': ni, 'y': nj, 'z': Z_LEVELS},
        'anchor': {
            'longitudeDeg': float((lon.min() + lon.max()) / 2),
            'latitudeDeg': float((lat.min() + lat.max()) / 2),
            'bottomM': bottom,
            'topM': top,
        },
        'boundsDegrees': {
            'west': float(lon.min()),
            'east': float(lon.max()),
            'south': float(lat.min()),
            'north': float(lat.max()),
        },
        'sizeM': {
            'eastWestM': float((lon.max() - lon.min()) * 111320 * math.cos(math.radians(float(lat.mean())))),
            'northSouthM': float((lat.max() - lat.min()) * 110540),
        },
        'pressureLevelsHpa': available,
        'altitudeAxisM': [round(float(value), 1) for value in target],
        'horizontalAxisNormalization': axis_info,
        'gribDecoder': decoder_diagnostics,
        'condensateStats': stats,
    }


def put(key, body, ctype, cache):
    s3.put_object(Bucket=BUCKET, Key=key, Body=body, ContentType=ctype, CacheControl=cache)


def run():
    run_time, url, raw = fetch_latest()
    fields, lat, lon, shape, decoder_diagnostics = decode_messages(raw)
    fields, lat, lon, shape, axis_info = normalize_horizontal_axes(fields, lat, lon, shape)
    payload, meta = build_volume(fields, lat, lon, shape, axis_info, decoder_diagnostics)
    put(f'{DST_PREFIX}/density.u8', payload, 'application/octet-stream', 'max-age=600')
    manifest = {
        'schemaVersion': 'earthus.cloud.volume.v1',
        'ready': True,
        'production': True,
        'synthetic': False,
        'encoding': 'UINT8_0_255',
        'byteLength': len(payload),
        'densityUrl': 'density.u8',
        'cloudState': {
            'truthClass': 'MODELLED_NWP',
            'sourceId': 'NOAA_NCEP_GFS_0P50_NOMADS',
            'validAt': run_time.isoformat().replace('+00:00', 'Z'),
            'confidence': 0.8,
            'volume': {'densityReady': True, 'verticalStructureReady': True},
        },
        'densityMeaning': (
            'GFS pressure-level TCDC fraction linearly resampled by GFS HGT onto uniform geometric altitude; '
            'missing values fail the build; no synthetic cloud coverage added'
        ),
        'sourceUrl': url,
        **meta,
    }
    put(
        f'{DST_PREFIX}/manifest.json',
        json.dumps(manifest, separators=(',', ':')).encode(),
        'application/json; charset=utf-8',
        'max-age=300',
    )
    return manifest


def lambda_handler(event, context):
    try:
        return {'statusCode': 200, 'body': json.dumps(run(), ensure_ascii=False)}
    except Exception as exc:  # noqa: BLE001
        print('[gfs-cloud-volume]', repr(exc))
        return {'statusCode': 503, 'body': json.dumps({'ready': False, 'error': str(exc)})}


if __name__ == '__main__':
    print(json.dumps(run(), indent=2))
