# -*- coding: utf-8 -*-
"""NOAA GFS 1.0 degree analysis -> global LOW/MID/HIGH cloud artifact."""

import json
import hashlib
import os
import tempfile
import urllib.request

import boto3
import numpy as np

from core import (
    LEVELS,
    build_global_layers,
    build_manifest,
    candidate_runs,
    normalize_global_axes,
    url_for,
)


BUCKET = os.environ['CACHE_BUCKET']
REGION = os.environ.get('CACHE_REGION') or os.environ.get('AWS_REGION')
DST_PREFIX = os.environ.get('GFS_GLOBAL_LOW_PREFIX', 'clouds/gfs/global-low')
MAX_SOURCE_BYTES = 128 * 1024 * 1024
SHORT_ALIASES = {'TCDC': 'TCDC', 'TCC': 'TCDC', 'HGT': 'HGT', 'GH': 'HGT'}
s3 = boto3.client('s3', region_name=REGION)


def fetch_latest():
    for run_time in candidate_runs():
        source_url = url_for(run_time)
        try:
            request = urllib.request.Request(
                source_url,
                headers={'User-Agent': 'earthus/2.0 (+https://earthus.net)'},
            )
            with urllib.request.urlopen(request, timeout=120) as response:
                raw = response.read(MAX_SOURCE_BYTES + 1)
            if len(raw) > MAX_SOURCE_BYTES:
                raise RuntimeError('GFS_GLOBAL_SOURCE_BYTE_BUDGET:%d' % len(raw))
            if len(raw) > 10_000 and raw[:4] == b'GRIB':
                return run_time, source_url, raw
        except Exception as exc:  # noqa: BLE001
            print('[gfs-global-low/fetch]', run_time.isoformat(), repr(exc))
    raise RuntimeError('GFS_GLOBAL_NO_RECENT_ANALYSIS')


def _canonical_field(eccodes, gid):
    raw_short = str(eccodes.codes_get(gid, 'shortName')).strip()
    canonical = SHORT_ALIASES.get(raw_short.upper())
    if canonical:
        return canonical, raw_short
    try:
        name = str(eccodes.codes_get(gid, 'name')).strip().lower()
    except Exception:  # noqa: BLE001
        name = ''
    if name == 'total cloud cover':
        return 'TCDC', raw_short
    if name in {'geopotential height', 'geopotential height anomaly'}:
        return 'HGT', raw_short
    return None, raw_short


def _pressure_level_hpa(eccodes, gid):
    try:
        level_type = str(eccodes.codes_get(gid, 'typeOfLevel'))
        level = float(eccodes.codes_get(gid, 'level'))
    except Exception:  # noqa: BLE001
        return None, None
    if level_type == 'isobaricInhPa':
        return int(round(level)), level_type
    if level_type == 'isobaricInPa':
        return int(round(level / 100.0)), level_type
    return None, level_type


def _clean_values(eccodes, gid, canonical):
    values = np.asarray(eccodes.codes_get_values(gid), dtype=np.float32)
    try:
        missing = float(eccodes.codes_get(gid, 'missingValue'))
        values = np.where(values == missing, np.nan, values)
    except Exception:  # noqa: BLE001
        pass
    finite = values[np.isfinite(values)]
    if not finite.size:
        raise RuntimeError('GFS_GLOBAL_%s_EMPTY' % canonical)
    if canonical == 'TCDC' and (float(finite.min()) < -0.01 or float(finite.max()) > 100.01):
        raise RuntimeError('GFS_GLOBAL_TCDC_RANGE')
    if canonical == 'HGT' and (float(finite.min()) < -1000 or float(finite.max()) > 60000):
        raise RuntimeError('GFS_GLOBAL_HGT_RANGE')
    return values


def decode_messages(raw):
    import eccodes

    fields = {}
    latitudes = None
    longitudes = None
    shape = None
    raw_short_names = set()
    pressure_levels = {'TCDC': set(), 'HGT': set()}
    ignored_level_types = set()
    with tempfile.NamedTemporaryFile(suffix='.grib2') as temporary:
        temporary.write(raw)
        temporary.flush()
        with open(temporary.name, 'rb') as handle:
            while True:
                gid = eccodes.codes_grib_new_from_file(handle)
                if gid is None:
                    break
                try:
                    canonical, raw_short = _canonical_field(eccodes, gid)
                    raw_short_names.add(raw_short)
                    if canonical is None:
                        continue
                    level, level_type = _pressure_level_hpa(eccodes, gid)
                    if level is None or level not in LEVELS:
                        if level_type:
                            ignored_level_types.add(level_type)
                        continue
                    ni = int(eccodes.codes_get(gid, 'Ni'))
                    nj = int(eccodes.codes_get(gid, 'Nj'))
                    values = _clean_values(eccodes, gid, canonical)
                    if values.size != ni * nj:
                        raise RuntimeError('GFS_GLOBAL_GRID_SHAPE')
                    if shape is None:
                        shape = (nj, ni)
                        latitudes = np.asarray(
                            eccodes.codes_get_array(gid, 'latitudes'), dtype=np.float32
                        ).reshape(shape)
                        longitudes = np.asarray(
                            eccodes.codes_get_array(gid, 'longitudes'), dtype=np.float32
                        ).reshape(shape)
                    elif shape != (nj, ni):
                        raise RuntimeError('GFS_GLOBAL_GRID_INCONSISTENT')
                    fields[(canonical, level)] = values.reshape(shape)
                    pressure_levels[canonical].add(level)
                finally:
                    eccodes.codes_release(gid)
    if shape is None or latitudes is None or longitudes is None:
        raise RuntimeError('GFS_GLOBAL_NO_GRID_MESSAGES')
    fields, latitudes, longitudes, axis_diagnostics = normalize_global_axes(
        fields, latitudes, longitudes
    )
    shape = latitudes.shape
    if not (350 <= shape[1] <= 361 and 179 <= shape[0] <= 181):
        raise RuntimeError('GFS_GLOBAL_RESOLUTION_GATE:%s' % (shape,))
    diagnostics = {
        'rawShortNames': sorted(raw_short_names),
        'pressureLevelsByField': {
            key: sorted(value, reverse=True) for key, value in pressure_levels.items()
        },
        'ignoredLevelTypes': sorted(ignored_level_types),
        'axisNormalization': axis_diagnostics,
        'aliasContract': {'tcc': 'TCDC', 'gh': 'HGT'},
    }
    return fields, latitudes, longitudes, shape, diagnostics


def put(key, body, content_type, cache_control):
    s3.put_object(
        Bucket=BUCKET,
        Key=key,
        Body=body,
        ContentType=content_type,
        CacheControl=cache_control,
    )


def run():
    run_time, source_url, raw = fetch_latest()
    fields, latitudes, longitudes, shape, decoder_diagnostics = decode_messages(raw)
    payload, metadata = build_global_layers(fields, latitudes, longitudes, shape)
    manifest = build_manifest(
        run_time, source_url, payload, metadata, decoder_diagnostics
    )
    manifest['sourceByteLength'] = len(raw)
    manifest['sourceSha256'] = hashlib.sha256(raw).hexdigest()
    manifest['densitySha256'] = hashlib.sha256(payload).hexdigest()
    put(
        '%s/density-bands.u8' % DST_PREFIX,
        payload,
        'application/octet-stream',
        'max-age=600',
    )
    put(
        '%s/manifest.json' % DST_PREFIX,
        json.dumps(manifest, separators=(',', ':')).encode(),
        'application/json; charset=utf-8',
        'max-age=300',
    )
    return manifest


def lambda_handler(event, context):
    try:
        return {'statusCode': 200, 'body': json.dumps(run(), ensure_ascii=False)}
    except Exception as exc:  # noqa: BLE001
        print('[gfs-global-low]', repr(exc))
        return {'statusCode': 503, 'body': json.dumps({'ready': False, 'error': str(exc)})}


if __name__ == '__main__':
    print(json.dumps(run(), indent=2))
