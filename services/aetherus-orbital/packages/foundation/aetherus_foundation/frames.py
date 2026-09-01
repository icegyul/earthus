from __future__ import annotations

import math
from dataclasses import dataclass
from datetime import datetime, timedelta, timezone

from aetherus_domain import FrameProvenance, StateVector, TransformedState, ValidationState

EARTH_ROTATION_RAD_S = 7.2921150e-5
ARCSEC_TO_RAD = math.pi / (180.0 * 3600.0)


@dataclass(frozen=True)
class EarthOrientationParameters:
    """Minimal EOP values required by the local screening transform.

    This is not a replacement for an IERS/SOFA precision pipeline. Supplying EOP removes
    the UTC=UT1 and zero-polar-motion assumptions, while GCRF precession/nutation/frame
    bias still require a precision dependency in staging/production.
    """
    epoch_utc: datetime
    ut1_utc_seconds: float = 0.0
    xp_arcsec: float = 0.0
    yp_arcsec: float = 0.0
    source_id: str = "UNSPECIFIED_EOP"
    version: str | None = None

    def __post_init__(self):
        if self.epoch_utc.tzinfo is None:
            raise ValueError("naive EOP epoch forbidden")


class CoordinateReferenceFrameEngine:
    id = "E05"
    version = "0.3.0-screening-eop"
    SUPPORTED = {"TEME", "ITRF", "GCRF", "ICRF", "HELIOCENTRIC_ICRF"}

    def transform(
        self,
        state: StateVector,
        to_frame: str,
        *,
        eop_epoch_utc: datetime | None = None,
        eop: EarthOrientationParameters | None = None,
        max_eop_age_seconds: float = 3 * 86400,
        earth_heliocentric_state: StateVector | None = None,
    ) -> TransformedState:
        source = state.frame.upper()
        target = to_frame.upper()
        if source not in self.SUPPORTED or target not in self.SUPPORTED:
            raise ValueError(f"unsupported frame transform {source}->{target}")
        if source == target:
            return TransformedState(
                state=state.model_copy(update={"frame": target}),
                provenance=FrameProvenance(
                    from_frame=source, to_frame=target, method="IDENTITY",
                    validation_state=ValidationState.VALIDATED_PIPELINE,
                ),
            )

        # TEME is the native SGP4 state frame.  For the local screening path we use the
        # Vallado-style sidereal rotation to/from an Earth-fixed intermediate, with
        # explicit degradation because equation-of-equinoxes/precession-nutation are not
        # a complete SOFA/IERS implementation here.
        if {source, target} <= {"TEME", "ITRF"}:
            return self._earth_rotation_transform(state, target, eop_epoch_utc, eop, max_eop_age_seconds, teme=True)

        if {source, target} <= {"ITRF", "GCRF"}:
            return self._earth_rotation_transform(state, target, eop_epoch_utc, eop, max_eop_age_seconds, teme=False)

        if {source, target} <= {"TEME", "GCRF"}:
            # Explicit intermediate; never pretend TEME and GCRF are identical.
            first = self.transform(state, "ITRF", eop_epoch_utc=eop_epoch_utc, eop=eop, max_eop_age_seconds=max_eop_age_seconds)
            second = self.transform(first.state, "GCRF", eop_epoch_utc=eop_epoch_utc, eop=eop, max_eop_age_seconds=max_eop_age_seconds)
            limitations = list(dict.fromkeys(first.provenance.limitations + second.provenance.limitations + ["TEME↔GCRF uses an ITRF screening bridge, not a full IAU/SOFA transform."]))
            return TransformedState(
                state=second.state,
                provenance=FrameProvenance(
                    from_frame=source, to_frame=target, method="TEME_ITRF_GCRF_SCREENING_BRIDGE",
                    validation_state=ValidationState.RESEARCH_ONLY,
                    eop_age_seconds=max(x for x in [first.provenance.eop_age_seconds, second.provenance.eop_age_seconds] if x is not None) if any(x is not None for x in [first.provenance.eop_age_seconds, second.provenance.eop_age_seconds]) else None,
                    limitations=limitations,
                ),
            )

        if {source, target} <= {"GCRF", "ICRF"}:
            # Axes are close but not identical.  Keep this available for visual/context
            # continuity only and explicitly block precision claims.
            return TransformedState(
                state=state.model_copy(update={"frame": target}),
                provenance=FrameProvenance(
                    from_frame=source, to_frame=target, method="AXIS_ALIGNMENT_APPROXIMATION",
                    validation_state=ValidationState.RESEARCH_ONLY,
                    limitations=["GCRF/ICRF frame bias and precession-nutation require precision IAU/SOFA runtime"],
                ),
            )

        if source in {"GCRF", "ICRF"} and target == "HELIOCENTRIC_ICRF":
            return self._translate_geocentric_to_heliocentric(state, earth_heliocentric_state)
        if source == "HELIOCENTRIC_ICRF" and target in {"GCRF", "ICRF"}:
            return self._translate_heliocentric_to_geocentric(state, target, earth_heliocentric_state)
        raise ValueError(f"unsupported direct transform {source}->{target}; explicit intermediate transform required")

    def _earth_rotation_transform(
        self,
        state: StateVector,
        target: str,
        eop_epoch_utc: datetime | None,
        eop: EarthOrientationParameters | None,
        max_age: float,
        *,
        teme: bool,
    ) -> TransformedState:
        source = state.frame.upper()
        eop_time = eop.epoch_utc if eop is not None else eop_epoch_utc
        validation, age, limitations = self._eop_validation(state.epoch_utc, eop_time, max_age)
        ut1_offset = eop.ut1_utc_seconds if eop else 0.0
        xp = (eop.xp_arcsec if eop else 0.0) * ARCSEC_TO_RAD
        yp = (eop.yp_arcsec if eop else 0.0) * ARCSEC_TO_RAD
        ut1_epoch = state.epoch_utc + timedelta(seconds=ut1_offset)
        angle = self._gmst_angle(ut1_epoch)
        inertial = "TEME" if teme else "GCRF"
        method = "VALLADO_TEME_PEF_ITRF_SCREENING" if teme else "GMST_UT1_POLAR_MOTION_SCREENING"
        if eop is not None:
            limitations = list(limitations) + [f"EOP source={eop.source_id}; version={eop.version or 'UNSPECIFIED'}"]
        if not teme:
            limitations = list(limitations) + ["GCRF transform omits full IAU precession-nutation/frame-bias series; precision claim remains pending."]
        else:
            limitations = list(limitations) + ["TEME screening transform omits full equation-of-equinoxes precision treatment."]

        if source == "ITRF" and target == inertial:
            r_pef = self._itrf_to_pef(state.position_km, xp, yp)
            v_pef = self._itrf_to_pef(state.velocity_km_s, xp, yp)
            v_with_rotation = self._add(v_pef, self._omega_cross(r_pef))
            pos = self._rot_z(r_pef, angle)
            vel = self._rot_z(v_with_rotation, angle)
        elif source == inertial and target == "ITRF":
            r_pef = self._rot_z(state.position_km, -angle)
            v_pef_inertial = self._rot_z(state.velocity_km_s, -angle)
            v_pef = self._sub(v_pef_inertial, self._omega_cross(r_pef))
            pos = self._pef_to_itrf(r_pef, xp, yp)
            vel = self._pef_to_itrf(v_pef, xp, yp)
        else:
            raise ValueError(f"invalid Earth rotation transform {source}->{target}")

        # Even fresh EOP does not close the complete high-precision celestial transform.
        if validation == ValidationState.VALIDATED_PIPELINE:
            validation = ValidationState.VALIDATION_PENDING
        return TransformedState(
            state=StateVector(position_km=pos, velocity_km_s=vel, frame=target, epoch_utc=state.epoch_utc),
            provenance=FrameProvenance(
                from_frame=source, to_frame=target, method=method,
                validation_state=validation, eop_age_seconds=age, limitations=list(dict.fromkeys(limitations)),
            ),
        )

    def _translate_geocentric_to_heliocentric(self, state: StateVector, earth: StateVector | None) -> TransformedState:
        if earth is None or earth.frame != "HELIOCENTRIC_ICRF" or earth.epoch_utc != state.epoch_utc:
            raise ValueError("matching Earth heliocentric state required")
        pos = tuple(a + b for a, b in zip(state.position_km, earth.position_km))
        vel = tuple(a + b for a, b in zip(state.velocity_km_s, earth.velocity_km_s))
        return TransformedState(
            state=StateVector(position_km=pos, velocity_km_s=vel, frame="HELIOCENTRIC_ICRF", epoch_utc=state.epoch_utc),
            provenance=FrameProvenance(
                from_frame=state.frame, to_frame="HELIOCENTRIC_ICRF", method="ORIGIN_TRANSLATION",
                validation_state=ValidationState.VALIDATION_PENDING,
                limitations=["translation inherits provenance/uncertainty of supplied Earth ephemeris"],
            ),
        )

    def _translate_heliocentric_to_geocentric(self, state: StateVector, target: str, earth: StateVector | None) -> TransformedState:
        if earth is None or earth.frame != "HELIOCENTRIC_ICRF" or earth.epoch_utc != state.epoch_utc:
            raise ValueError("matching Earth heliocentric state required")
        pos = tuple(a - b for a, b in zip(state.position_km, earth.position_km))
        vel = tuple(a - b for a, b in zip(state.velocity_km_s, earth.velocity_km_s))
        return TransformedState(
            state=StateVector(position_km=pos, velocity_km_s=vel, frame=target, epoch_utc=state.epoch_utc),
            provenance=FrameProvenance(
                from_frame=state.frame, to_frame=target, method="ORIGIN_TRANSLATION",
                validation_state=ValidationState.VALIDATION_PENDING,
                limitations=["translation inherits provenance/uncertainty of supplied Earth ephemeris"],
            ),
        )

    @staticmethod
    def _add(a, b): return tuple(x+y for x,y in zip(a,b))
    @staticmethod
    def _sub(a, b): return tuple(x-y for x,y in zip(a,b))
    @staticmethod
    def _omega_cross(r):
        x,y,_=r; return (-EARTH_ROTATION_RAD_S*y, EARTH_ROTATION_RAD_S*x, 0.0)

    @staticmethod
    def _rot_z(vec: tuple[float, float, float], angle: float) -> tuple[float, float, float]:
        x, y, z = vec; c, s = math.cos(angle), math.sin(angle)
        return (c*x-s*y, s*x+c*y, z)
    @staticmethod
    def _rot_x(vec, angle):
        x,y,z=vec;c,s=math.cos(angle),math.sin(angle);return (x,c*y-s*z,s*y+c*z)
    @staticmethod
    def _rot_y(vec, angle):
        x,y,z=vec;c,s=math.cos(angle),math.sin(angle);return (c*x+s*z,y,-s*x+c*z)
    def _pef_to_itrf(self, vec, xp, yp):
        return self._rot_y(self._rot_x(vec, yp), xp)
    def _itrf_to_pef(self, vec, xp, yp):
        return self._rot_x(self._rot_y(vec, -xp), -yp)

    @staticmethod
    def _gmst_angle(epoch: datetime) -> float:
        if epoch.tzinfo is None: raise ValueError("naive datetime forbidden")
        utc=epoch.astimezone(timezone.utc);jd=2440587.5+utc.timestamp()/86400.0;d=jd-2451545.0
        return math.radians((280.46061837+360.98564736629*d)%360.0)

    @staticmethod
    def _eop_validation(epoch: datetime, eop_epoch: datetime | None, max_age: float):
        if eop_epoch is None:
            return ValidationState.RESEARCH_ONLY, None, ["UT1 approximated by UTC and polar motion set to zero because EOP is unavailable"]
        if eop_epoch.tzinfo is None: raise ValueError("naive EOP epoch forbidden")
        age=abs((epoch.astimezone(timezone.utc)-eop_epoch.astimezone(timezone.utc)).total_seconds())
        if age>max_age:
            return ValidationState.VALIDATION_PENDING,age,["EOP is stale; precision claim downgraded"]
        return ValidationState.VALIDATED_PIPELINE,age,[]
