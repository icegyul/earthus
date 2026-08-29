# -*- coding: utf-8 -*-
"""Official GK-2A EA LCC geolocation adapter for the CTPS CTH pipeline.

KMA/NMSC documents the East Asia 2 km fixed grid as LCC(WGS84):
- standard parallels: 30N / 60N
- latitude of origin: 38N
- central meridian: 126E
- raster: 3000 x 2600
- pixel-center easting:  -2,999,000 .. +2,999,000 m
- pixel-center northing: +2,599,000 .. -2,599,000 m

This module intentionally patches only the geolocation step of cth_pipeline.
All source retrieval, CTh scaling, CTH_flag quality gates, truth classification,
and S3 output logic remain in the existing audited pipeline.
"""
import numpy as np

import cth_pipeline as base

# WGS84 ellipsoid and the official NMSC EA LCC definition.
_A = 6378137.0
_INV_F = 298.257223563
_F = 1.0 / _INV_F
_E = np.sqrt(_F * (2.0 - _F))
_PHI1 = np.deg2rad(30.0)
_PHI2 = np.deg2rad(60.0)
_PHI0 = np.deg2rad(38.0)
_LAM0 = np.deg2rad(126.0)


def _m(phi):
    return np.cos(phi) / np.sqrt(1.0 - (_E * _E) * (np.sin(phi) ** 2))


def _t(phi):
    sin_phi = np.sin(phi)
    return np.tan(np.pi / 4.0 - phi / 2.0) / (
        ((1.0 - _E * sin_phi) / (1.0 + _E * sin_phi)) ** (_E / 2.0)
    )


_M1 = _m(_PHI1)
_M2 = _m(_PHI2)
_T1 = _t(_PHI1)
_T2 = _t(_PHI2)
_T0 = _t(_PHI0)
_N = (np.log(_M1) - np.log(_M2)) / (np.log(_T1) - np.log(_T2))
_BIG_F = _M1 / (_N * (_T1 ** _N))
_RHO0 = _A * _BIG_F * (_T0 ** _N)


def _inverse_lcc(x, y):
    """Vectorized inverse Lambert Conformal Conic on WGS84."""
    x = np.asarray(x, dtype=np.float64)
    y = np.asarray(y, dtype=np.float64)
    rho = np.sqrt(x * x + (_RHO0 - y) * (_RHO0 - y))
    if _N < 0:
        rho = -rho
    theta = np.arctan2(x, _RHO0 - y)
    tt = (rho / (_A * _BIG_F)) ** (1.0 / _N)

    phi = np.pi / 2.0 - 2.0 * np.arctan(tt)
    for _ in range(8):
        sin_phi = np.sin(phi)
        correction = ((1.0 - _E * sin_phi) / (1.0 + _E * sin_phi)) ** (_E / 2.0)
        phi = np.pi / 2.0 - 2.0 * np.arctan(tt * correction)

    lam = _LAM0 + theta / _N
    lat = np.rad2deg(phi)
    lon = np.rad2deg(lam)
    lon = ((lon + 180.0) % 360.0) - 180.0
    valid = np.isfinite(lat) & np.isfinite(lon) & (lat >= -90.0) & (lat <= 90.0)
    return lat.astype(np.float32), lon.astype(np.float32), valid


def _official_ea_2km_grid(shape):
    """Build the official NMSC EA 2 km pixel-center grid only for exact dimensions."""
    # Official 2 km raster: width=3000, height=2600.  The alternate tuple is
    # accepted only to preserve alignment if a NetCDF writer stores xdim first.
    if tuple(shape) == (2600, 3000):
        x1d = np.linspace(-2_999_000.0, 2_999_000.0, 3000, dtype=np.float64)
        y1d = np.linspace(2_599_000.0, -2_599_000.0, 2600, dtype=np.float64)
        x, y = np.meshgrid(x1d, y1d, indexing='xy')
    elif tuple(shape) == (3000, 2600):
        x1d = np.linspace(-2_999_000.0, 2_999_000.0, 3000, dtype=np.float64)
        y1d = np.linspace(2_599_000.0, -2_599_000.0, 2600, dtype=np.float64)
        x, y = np.meshgrid(x1d, y1d, indexing='ij')
    else:
        raise RuntimeError(f'GK2A_CTH_EA_LCC_UNSUPPORTED_SHAPE:{tuple(shape)}')

    lat, lon, valid = _inverse_lcc(x, y)
    return lat, lon, valid, 'kma-nmsc-ea-lcc-wgs84-official-2km'


def _direct_source_lat_lon(h5, shape):
    latds = base._dataset(h5, 'latitude', 'lat')
    londs = base._dataset(h5, 'longitude', 'lon')
    if latds is None or londs is None:
        return None
    lat = np.asarray(latds[...], dtype=np.float32)
    lon = np.asarray(londs[...], dtype=np.float32)
    if lat.shape != tuple(shape) or lon.shape != tuple(shape):
        raise RuntimeError(
            f'GK2A_CTH_GEOLOCATION_SHAPE_MISMATCH:{lat.shape}:{lon.shape}:{tuple(shape)}'
        )
    valid = (
        np.isfinite(lat)
        & np.isfinite(lon)
        & (lat >= -90.0)
        & (lat <= 90.0)
        & (lon >= -180.0)
        & (lon <= 360.0)
    )
    lon = np.where(lon > 180.0, lon - 360.0, lon)
    return lat, lon, valid, 'source-lat-lon'


_ORIGINAL_GEOLOCATION = base._geolocation


def _geolocation(h5, shape):
    direct = _direct_source_lat_lon(h5, shape)
    if direct is not None:
        return direct

    # CTPS CTH requested from KMA API Hub for EA is the documented ea020lc grid.
    # Do not try to reinterpret this as GEOS merely because there are no x/y arrays.
    if str(getattr(base, 'KMA_AREA', '')).upper() == 'EA':
        return _official_ea_2km_grid(shape)

    return _ORIGINAL_GEOLOCATION(h5, shape)


# cth_pipeline.compile_artifact resolves _geolocation from its module globals.
# Patch only that function; no data/truth/quality behavior is replaced.
base._geolocation = _geolocation

run = base.run
lambda_handler = base.lambda_handler


if __name__ == '__main__':
    import json
    print(json.dumps(run(), ensure_ascii=False, indent=2))
