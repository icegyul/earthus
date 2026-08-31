# -*- coding: utf-8 -*-
"""Truth-preserving GFS 1.0 degree global low-LOD cloud layer core.

The output is three zero-thickness altitude planes. Each pixel is the maximum
GFS pressure-level TCDC whose matching GFS HGT falls inside the LOW/MID/HIGH
geometric altitude band. No cloud thickness or missing density is invented.
"""

from datetime import datetime, timedelta, timezone
import urllib.parse

import numpy as np


BASE = 'https://nomads.ncep.noaa.gov/cgi-bin/filter_gfs_1p00.pl'
LEVELS = [
    1000, 975, 950, 925, 900, 850, 800, 750, 700, 650, 600,
    550, 500, 450, 400, 350, 300, 250, 200, 150, 100,
]
BANDS = (
    {'id': 'LOW', 'minimumM': 0.0, 'maximumM': 3000.0},
    {'id': 'MID', 'minimumM': 3000.0, 'maximumM': 7000.0},
    {'id': 'HIGH', 'minimumM': 7000.0, 'maximumM': 20000.0},
)
MAX_BYTES = 512 * 1024


def candidate_runs(now=None):
    now = now or datetime.now(timezone.utc)
    out = []
    for back in range(0, 42, 6):
        value = now - timedelta(hours=back + 4)
        value = value.replace(
            hour=(value.hour // 6) * 6,
            minute=0,
            second=0,
            microsecond=0,
        )
        if value not in out:
            out.append(value)
    return out


def url_for(run, step=0):
    query = {
        'file': 'gfs.t%sz.pgrb2.1p00.f%03d' % (run.strftime('%H'), step),
        'dir': '/gfs.%s/%s/atmos' % (run.strftime('%Y%m%d'), run.strftime('%H')),
        'subregion': '',
        'var_TCDC': 'on',
        'var_HGT': 'on',
        **{'lev_%s_mb' % level: 'on' for level in LEVELS},
        'leftlon': 0,
        'rightlon': 360,
        'toplat': 90,
        'bottomlat': -90,
    }
    return BASE + '?' + urllib.parse.urlencode(query)


def normalize_global_axes(fields, latitudes, longitudes):
    lat = np.asarray(latitudes, dtype=np.float32)
    lon = np.asarray(longitudes, dtype=np.float32)
    if lat.ndim != 2 or lon.shape != lat.shape:
        raise RuntimeError('GFS_GLOBAL_AXIS_SHAPE')
    if not np.isfinite(lat).all() or not np.isfinite(lon).all():
        raise RuntimeError('GFS_GLOBAL_AXIS_NONFINITE')

    row_order = np.argsort(np.mean(lat, axis=1), kind='stable')
    lat = lat[row_order, :]
    lon = lon[row_order, :]
    normalized = {}
    for key, value in fields.items():
        array = np.asarray(value, dtype=np.float32)
        if array.shape != latitudes.shape:
            raise RuntimeError('GFS_GLOBAL_FIELD_SHAPE:%s' % (key,))
        normalized[key] = array[row_order, :]

    lon = np.where(lon >= 180.0, lon - 360.0, lon)
    column_means = np.mean(lon, axis=0)
    column_order = np.argsort(column_means, kind='stable')
    lat = lat[:, column_order]
    lon = lon[:, column_order]
    for key in list(normalized):
        normalized[key] = normalized[key][:, column_order]

    ordered_means = np.mean(lon, axis=0)
    keep = np.ones(ordered_means.size, dtype=bool)
    if ordered_means.size > 1:
        keep[1:] = np.diff(ordered_means) > 1e-5
    lat = lat[:, keep]
    lon = lon[:, keep]
    for key in list(normalized):
        normalized[key] = normalized[key][:, keep]

    if not np.all(np.diff(np.mean(lat, axis=1)) > 0):
        raise RuntimeError('GFS_GLOBAL_LATITUDE_ORDER')
    if not np.all(np.diff(np.mean(lon, axis=0)) > 0):
        raise RuntimeError('GFS_GLOBAL_LONGITUDE_ORDER')
    return normalized, lat, lon, {
        'latitudeOrder': 'SOUTH_TO_NORTH',
        'longitudeOrder': 'WEST_TO_EAST_DATELINE_NORMALIZED',
        'duplicateLongitudeColumnsRemoved': int(np.size(keep) - np.count_nonzero(keep)),
    }


def _validate_cloud_fields(fields, shape):
    available = [
        level for level in LEVELS
        if ('TCDC', level) in fields and ('HGT', level) in fields
    ]
    if len(available) < 3:
        raise RuntimeError('GFS_GLOBAL_TOO_FEW_VERTICAL_LEVELS:%d' % len(available))
    hgt = np.stack([np.asarray(fields[('HGT', level)], dtype=np.float32) for level in available])
    tcdc = np.stack([np.asarray(fields[('TCDC', level)], dtype=np.float32) for level in available])
    if hgt.shape[1:] != shape or tcdc.shape[1:] != shape:
        raise RuntimeError('GFS_GLOBAL_FIELD_SHAPE')
    if not np.isfinite(hgt).all():
        raise RuntimeError('GFS_GLOBAL_HGT_NONFINITE')
    if not np.isfinite(tcdc).all():
        raise RuntimeError('GFS_GLOBAL_TCDC_NONFINITE')
    if float(hgt.min()) < -1000 or float(hgt.max()) > 60000:
        raise RuntimeError('GFS_GLOBAL_HGT_RANGE')
    if float(tcdc.min()) < -0.01 or float(tcdc.max()) > 100.01:
        raise RuntimeError('GFS_GLOBAL_TCDC_RANGE')
    return available, hgt, np.clip(tcdc, 0, 100)


def build_global_layers(fields, latitudes, longitudes, shape):
    lat = np.asarray(latitudes, dtype=np.float32)
    lon = np.asarray(longitudes, dtype=np.float32)
    if lat.shape != shape or lon.shape != shape:
        raise RuntimeError('GFS_GLOBAL_GRID_SHAPE')
    available, hgt, tcdc = _validate_cloud_fields(fields, shape)
    planes = []
    layers = []
    for band in BANDS:
        mask = (hgt >= band['minimumM']) & (hgt < band['maximumM'])
        if not bool(np.any(mask)):
            raise RuntimeError('GFS_GLOBAL_EMPTY_BAND:%s' % band['id'])
        selected = np.where(mask, tcdc, -1.0)
        density_percent = np.max(selected, axis=0)
        density_percent = np.where(density_percent < 0, 0, density_percent)
        quantized = np.rint(density_percent / 100.0 * 255.0).astype(np.uint8)
        source_heights = hgt[mask]
        representative = int(round(float(np.median(source_heights))))
        planes.append(quantized)
        layers.append({
            'id': band['id'],
            'minimumAltitudeM': band['minimumM'],
            'maximumAltitudeM': band['maximumM'],
            'representativeAltitudeM': representative,
            'maximumDensity': int(quantized.max()),
            'meanDensity': round(float(quantized.mean()), 3),
            'coverage': round(float(np.count_nonzero(quantized > 8) / quantized.size), 6),
        })

    payload = np.stack(planes, axis=0).tobytes(order='C')
    if len(payload) > MAX_BYTES:
        raise RuntimeError('GFS_GLOBAL_BYTE_BUDGET:%d' % len(payload))
    lat_min = float(np.min(lat))
    lat_max = float(np.max(lat))
    lon_span = float(np.max(lon) - np.min(lon))
    if lon_span < 270:
        raise RuntimeError('GFS_GLOBAL_LONGITUDE_COVERAGE:%s' % lon_span)
    metadata = {
        'dimensions': {'x': int(shape[1]), 'y': int(shape[0]), 'bands': len(BANDS)},
        'boundsDegrees': {
            'west': -180.0,
            'east': 180.0,
            'south': lat_min,
            'north': lat_max,
        },
        'layers': layers,
        'pressureLevelsHpa': available,
        'sourceGrid': 'NOAA_GFS_1P00_ANALYSIS',
        'renderContract': 'ZERO_THICKNESS_PLANES_NO_FAKE_CLOUD_VOLUME',
        'fakeThickness': False,
        'densityMeaning': (
            'For each global cell and altitude band, maximum GFS pressure-level TCDC whose matching '
            'GFS HGT falls inside that band; UINT8 0..255; missing vertical bands fail the build'
        ),
    }
    return payload, metadata


def build_manifest(run_time, source_url, payload, metadata, decoder_diagnostics):
    return {
        'schemaVersion': 'earthus.cloud.global-layered.v1',
        'ready': True,
        'production': True,
        'synthetic': False,
        'encoding': 'UINT8_0_255_BAND_MAJOR',
        'byteLength': len(payload),
        'densityUrl': 'density-bands.u8',
        'cloudState': {
            'truthClass': 'MODELLED_NWP_GLOBAL_LAYERED',
            'sourceId': 'NOAA_NCEP_GFS_1P00_NOMADS',
            'validAt': run_time.astimezone(timezone.utc).isoformat().replace('+00:00', 'Z'),
            'forecastStepHours': 0,
            'analysisNotForecast': True,
            'verticalStructureReady': True,
        },
        'sourceUrl': source_url,
        'decoderDiagnostics': decoder_diagnostics,
        **metadata,
    }
