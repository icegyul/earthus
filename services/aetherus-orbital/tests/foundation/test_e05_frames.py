from datetime import datetime, timedelta, timezone
import math, pytest
from aetherus_domain import StateVector, ValidationState
from aetherus_foundation import CoordinateReferenceFrameEngine

def _close(a,b,tol=1e-9): return all(abs(x-y)<=tol for x,y in zip(a,b))

def test_e05_t01_frame_roundtrip_tolerance():
    t=datetime(2026,8,30,tzinfo=timezone.utc); e=CoordinateReferenceFrameEngine(); s=StateVector(position_km=(6378.1,10,20),velocity_km_s=(0,7.5,0),frame='ITRF',epoch_utc=t)
    g=e.transform(s,'GCRF',eop_epoch_utc=t); r=e.transform(g.state,'ITRF',eop_epoch_utc=t)
    assert _close(s.position_km,r.state.position_km,1e-8) and _close(s.velocity_km_s,r.state.velocity_km_s,1e-8)

def test_e05_t02_unsupported_frame_fail():
    t=datetime(2026,8,30,tzinfo=timezone.utc); s=StateVector(position_km=(1,2,3),frame='UNKNOWN',epoch_utc=t)
    with pytest.raises(ValueError): CoordinateReferenceFrameEngine().transform(s,'GCRF')

def test_e05_t03_eop_stale_downgrade():
    t=datetime(2026,8,30,tzinfo=timezone.utc); s=StateVector(position_km=(1,2,3),frame='ITRF',epoch_utc=t)
    out=CoordinateReferenceFrameEngine().transform(s,'GCRF',eop_epoch_utc=t-timedelta(days=10))
    assert out.provenance.validation_state==ValidationState.VALIDATION_PENDING and out.provenance.limitations

def test_e05_t04_solar_earth_frame_consistency_fixture():
    t=datetime(2026,8,30,tzinfo=timezone.utc); e=CoordinateReferenceFrameEngine()
    earth=StateVector(position_km=(100000000.0,20000000.0,0.0),velocity_km_s=(0,29.0,0),frame='HELIOCENTRIC_ICRF',epoch_utc=t)
    geo=StateVector(position_km=(7000.0,0,0),velocity_km_s=(0,7.5,0),frame='ICRF',epoch_utc=t)
    helio=e.transform(geo,'HELIOCENTRIC_ICRF',earth_heliocentric_state=earth)
    back=e.transform(helio.state,'ICRF',earth_heliocentric_state=earth)
    assert _close(back.state.position_km,geo.position_km) and _close(back.state.velocity_km_s,geo.velocity_km_s)
