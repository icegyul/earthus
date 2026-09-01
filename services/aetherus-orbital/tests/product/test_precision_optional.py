from datetime import datetime,timezone
from aetherus_orbit import SGP4OMMPropagator


def test_sgp4_precision_adapter_never_relabels_fallback_as_sgp4():
    p=SGP4OMMPropagator()
    record={"OBJECT_NAME":"TEST","OBJECT_ID":"1998-067A","NORAD_CAT_ID":25544,"EPOCH":"2026-08-30T00:00:00.000000","MEAN_MOTION":15.5,"ECCENTRICITY":0.0005,"INCLINATION":51.64,"RA_OF_ASC_NODE":10.0,"ARG_OF_PERICENTER":20.0,"MEAN_ANOMALY":30.0,"BSTAR":0.0,"MEAN_MOTION_DOT":0.0,"MEAN_MOTION_DDOT":0.0,"EPHEMERIS_TYPE":0,"CLASSIFICATION_TYPE":"U","ELEMENT_SET_NO":999,"REV_AT_EPOCH":1}
    result=p.propagate_omm('TEST',record,datetime(2026,8,30,tzinfo=timezone.utc))
    if not p.available():
        assert result.state is None
        assert result.data_status=='UNAVAILABLE'
        assert result.error_code=='SGP4_DEPENDENCY_MISSING'
    else:
        # When the optional dependency exists, any returned state must actually be TEME SGP4 output.
        if result.state is not None:
            assert result.method=='SGP4_OMM' and result.state.frame=='TEME'

from aetherus_domain import StateVector, ValidationState
from aetherus_foundation import CoordinateReferenceFrameEngine, EarthOrientationParameters


def _near(a,b,tol=1e-8): return all(abs(x-y)<=tol for x,y in zip(a,b))


def test_teme_itrf_screening_roundtrip_includes_eop_and_velocity_rotation():
    t=datetime(2026,8,30,tzinfo=timezone.utc)
    eop=EarthOrientationParameters(t,ut1_utc_seconds=0.11,xp_arcsec=0.08,yp_arcsec=0.21,source_id='IERS_FIXTURE',version='test')
    state=StateVector(position_km=(6800.0,100.0,50.0),velocity_km_s=(-0.1,7.6,0.5),frame='TEME',epoch_utc=t)
    engine=CoordinateReferenceFrameEngine()
    fixed=engine.transform(state,'ITRF',eop=eop)
    back=engine.transform(fixed.state,'TEME',eop=eop)
    assert _near(state.position_km,back.state.position_km,1e-8)
    assert _near(state.velocity_km_s,back.state.velocity_km_s,1e-8)
    assert fixed.provenance.method=='VALLADO_TEME_PEF_ITRF_SCREENING'
    assert fixed.provenance.validation_state in {ValidationState.VALIDATION_PENDING,ValidationState.RESEARCH_ONLY}
