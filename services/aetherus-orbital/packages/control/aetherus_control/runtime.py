from __future__ import annotations

from dataclasses import dataclass, field, replace
from datetime import datetime, timezone, timedelta
from enum import StrEnum
from typing import Any
from uuid import UUID, uuid4

from aetherus_domain import EvidenceClass, ValidationState, canonical_hash


def _aware(value: datetime) -> datetime:
    if value.tzinfo is None:
        raise ValueError("naive datetime forbidden")
    return value.astimezone(timezone.utc)


class MissionState(StrEnum):
    PLANNED = "PLANNED"
    COUNTDOWN = "COUNTDOWN"
    HOLD = "HOLD"
    ASCENT = "ASCENT"
    ORBIT_INSERTION = "ORBIT_INSERTION"
    PAYLOAD_DEPLOYMENT = "PAYLOAD_DEPLOYMENT"
    COMPLETE = "COMPLETE"
    SCRUBBED = "SCRUBBED"
    FAILED = "FAILED"


@dataclass(frozen=True)
class MissionRecord:
    mission_id: str
    name: str
    vehicle: str | None
    launch_site: dict[str, float] | None
    payloads: tuple[dict[str, Any], ...]
    sources: tuple[dict[str, Any], ...]
    status: str = "PLANNED"
    provisional_payloads: bool = False


class MissionRegistryEngine:
    id = "E13"
    source_priority = {"OFFICIAL": 3, "PRIMARY": 2, "PUBLIC": 1, "UNKNOWN": 0}

    def __init__(self):
        self._missions: dict[str, MissionRecord] = {}

    def upsert(self, record: dict[str, Any], *, source_id: str, source_class: str = "PUBLIC") -> MissionRecord:
        mission_id = str(record["mission_id"])
        source = {"source_id": source_id, "source_class": source_class, "received_at": datetime.now(timezone.utc).isoformat()}
        existing = self._missions.get(mission_id)
        incoming_priority = self.source_priority.get(source_class, 0)
        if existing is None:
            site = record.get("launch_site")
            if site is not None and not {"lat", "lon"} <= set(site):
                raise ValueError("launch site coordinates require lat/lon")
            payloads = tuple(record.get("payloads") or ())
            out = MissionRecord(
                mission_id=mission_id,
                name=str(record.get("name") or mission_id),
                vehicle=record.get("vehicle"),
                launch_site=site,
                payloads=payloads,
                sources=(source,),
                status=str(record.get("status", "PLANNED")),
                provisional_payloads=any(bool(p.get("provisional")) for p in payloads),
            )
        else:
            best_existing = max((self.source_priority.get(s.get("source_class", "UNKNOWN"), 0) for s in existing.sources), default=0)
            prefer_incoming = incoming_priority >= best_existing
            payloads = tuple(record.get("payloads") or existing.payloads) if prefer_incoming else existing.payloads
            site = record.get("launch_site", existing.launch_site) if prefer_incoming else existing.launch_site
            if site is not None and not {"lat", "lon"} <= set(site):
                raise ValueError("launch site coordinates require lat/lon")
            out = MissionRecord(
                mission_id=mission_id,
                name=str(record.get("name", existing.name)) if prefer_incoming else existing.name,
                vehicle=record.get("vehicle", existing.vehicle) if prefer_incoming else existing.vehicle,
                launch_site=site,
                payloads=payloads,
                sources=existing.sources + (source,),
                status=str(record.get("status", existing.status)) if prefer_incoming else existing.status,
                provisional_payloads=any(bool(p.get("provisional")) for p in payloads),
            )
        self._missions[mission_id] = out
        return out

    def get(self, mission_id: str) -> MissionRecord | None:
        return self._missions.get(mission_id)

    def list(self) -> list[MissionRecord]:
        return sorted(self._missions.values(), key=lambda x: x.mission_id)


@dataclass(frozen=True)
class LaunchWindowRevision:
    revision_no: int
    start_utc: datetime | None
    end_utc: datetime | None
    state: str
    source_id: str
    changed_at: datetime
    timezone_name: str | None = None


class LaunchScheduleWindowEngine:
    id = "E14"
    def __init__(self):
        self._revisions: dict[str, list[LaunchWindowRevision]] = {}

    def revise(self, mission_id: str, *, start_utc: datetime | None, end_utc: datetime | None, state: str, source_id: str, timezone_name: str | None = None) -> LaunchWindowRevision:
        if state not in {"TBD", "TENTATIVE", "CONFIRMED", "SCRUBBED"}:
            raise ValueError("invalid launch window state")
        if start_utc is not None:
            start_utc = _aware(start_utc)
        if end_utc is not None:
            end_utc = _aware(end_utc)
        if state == "CONFIRMED" and start_utc is None:
            raise ValueError("confirmed launch requires resolved time")
        if start_utc and end_utc and end_utc < start_utc:
            raise ValueError("window end before start")
        seq = self._revisions.setdefault(mission_id, [])
        rev = LaunchWindowRevision(len(seq)+1, start_utc, end_utc, state, source_id, datetime.now(timezone.utc), timezone_name)
        seq.append(rev)
        return rev

    def history(self, mission_id: str) -> tuple[LaunchWindowRevision, ...]:
        return tuple(self._revisions.get(mission_id, ()))

    def countdown_seconds(self, mission_id: str, now: datetime) -> float | None:
        seq = self._revisions.get(mission_id, [])
        if not seq or seq[-1].state != "CONFIRMED" or seq[-1].start_utc is None:
            return None
        return (seq[-1].start_utc - _aware(now)).total_seconds()


@dataclass(frozen=True)
class StateTransition:
    from_state: MissionState
    to_state: MissionState
    at_utc: datetime
    evidence_id: str | None
    reason: str | None


class LaunchStateMachineCountdownEngine:
    id = "E15"
    allowed = {
        MissionState.PLANNED: {MissionState.COUNTDOWN, MissionState.SCRUBBED},
        MissionState.COUNTDOWN: {MissionState.HOLD, MissionState.ASCENT, MissionState.SCRUBBED},
        MissionState.HOLD: {MissionState.COUNTDOWN, MissionState.SCRUBBED},
        MissionState.ASCENT: {MissionState.ORBIT_INSERTION, MissionState.FAILED},
        MissionState.ORBIT_INSERTION: {MissionState.PAYLOAD_DEPLOYMENT, MissionState.COMPLETE, MissionState.FAILED},
        MissionState.PAYLOAD_DEPLOYMENT: {MissionState.COMPLETE, MissionState.FAILED},
        MissionState.SCRUBBED: {MissionState.PLANNED},
        MissionState.COMPLETE: set(),
        MissionState.FAILED: set(),
    }
    def __init__(self, initial: MissionState = MissionState.PLANNED):
        self.state = initial
        self.history: list[StateTransition] = []
        self.countdown_anchor: datetime | None = None
        self.hold_remaining_s: float | None = None

    def transition(self, to_state: MissionState, at_utc: datetime, *, evidence_id: str | None = None, official: bool = False, reason: str | None = None) -> StateTransition:
        at = _aware(at_utc)
        if to_state not in self.allowed[self.state]:
            raise ValueError(f"invalid transition {self.state}->{to_state}")
        if official and not evidence_id:
            raise ValueError("official transition requires evidence")
        tr = StateTransition(self.state, to_state, at, evidence_id, reason)
        self.history.append(tr)
        self.state = to_state
        if to_state == MissionState.SCRUBBED:
            self.countdown_anchor = None
            self.hold_remaining_s = None
        return tr

    def start_countdown(self, launch_time: datetime) -> None:
        self.countdown_anchor = _aware(launch_time)

    def hold(self, now: datetime) -> float:
        if self.state != MissionState.COUNTDOWN or self.countdown_anchor is None:
            raise ValueError("countdown not running")
        self.hold_remaining_s = (self.countdown_anchor - _aware(now)).total_seconds()
        self.transition(MissionState.HOLD, now, reason="COUNTDOWN_HOLD")
        return self.hold_remaining_s

    def resume(self, now: datetime) -> datetime:
        if self.state != MissionState.HOLD or self.hold_remaining_s is None:
            raise ValueError("not in hold")
        self.countdown_anchor = _aware(now) + timedelta(seconds=self.hold_remaining_s)
        self.transition(MissionState.COUNTDOWN, now, reason="COUNTDOWN_RESUME")
        return self.countdown_anchor


@dataclass(frozen=True)
class TelemetrySample:
    timestamp_utc: datetime
    metrics: dict[str, float]
    units: dict[str, str]
    source_id: str
    evidence_class: EvidenceClass
    sequence: int | None = None


class TelemetryFusionEngine:
    id = "E16"
    allowed_units = {"altitude": "km", "speed": "km/s", "downrange": "km", "acceleration": "m/s2"}
    def __init__(self):
        self._samples: list[TelemetrySample] = []

    def ingest(self, *, timestamp_utc: datetime, metrics: dict[str, float], units: dict[str, str], source_id: str, live: bool, sequence: int | None = None) -> TelemetrySample:
        ts = _aware(timestamp_utc)
        for key, value in metrics.items():
            if not isinstance(value, (int, float)):
                raise ValueError("telemetry metric must be numeric")
            expected = self.allowed_units.get(key)
            if expected and units.get(key) != expected:
                raise ValueError(f"invalid unit for {key}")
        sample = TelemetrySample(ts, {k: float(v) for k,v in metrics.items()}, dict(units), source_id, EvidenceClass.OBSERVED if live else EvidenceClass.MODEL_SIGNAL, sequence)
        self._samples.append(sample)
        self._samples.sort(key=lambda s: (s.timestamp_utc, s.sequence if s.sequence is not None else -1))
        return sample

    def samples(self) -> tuple[TelemetrySample, ...]:
        return tuple(self._samples)

    def current(self) -> TelemetrySample | None:
        return self._samples[-1] if self._samples else None

    def source_failed_fallback(self, *, timestamp_utc: datetime, model_metrics: dict[str, float], units: dict[str, str], model_id: str) -> TelemetrySample:
        return self.ingest(timestamp_utc=timestamp_utc, metrics=model_metrics, units=units, source_id=model_id, live=False)


@dataclass(frozen=True)
class TrajectoryPoint:
    timestamp_utc: datetime
    position_km: tuple[float, float, float]
    frame: str

@dataclass(frozen=True)
class LaunchTrajectory:
    points: tuple[TrajectoryPoint, ...]
    source_label: str
    evidence_class: EvidenceClass
    model_version: str | None
    assumptions: tuple[str, ...]
    target_orbit: dict[str, Any] | None
    stage_separations: tuple[dict[str, Any], ...]


class LaunchTrajectoryFlightDynamicsAdapterEngine:
    id = "E17"
    def build(self, points: list[dict[str, Any]], *, source_label: str, live: bool, model_version: str | None = None, assumptions: list[str] | None = None, target_orbit: dict[str, Any] | None = None, stage_separations: list[dict[str, Any]] | None = None) -> LaunchTrajectory:
        if not live and not model_version:
            raise ValueError("modelled trajectory requires model_version")
        if target_orbit and not target_orbit.get("frame"):
            raise ValueError("target orbit frame required")
        parsed = []
        for p in points:
            parsed.append(TrajectoryPoint(_aware(p["timestamp_utc"]), tuple(float(v) for v in p["position_km"]), str(p.get("frame") or "ECEF")))
        parsed.sort(key=lambda p: p.timestamp_utc)
        seps = tuple(stage_separations or ())
        for sep in seps:
            if "position_km" not in sep or "timestamp_utc" not in sep:
                raise ValueError("stage separation geometry/time required")
        return LaunchTrajectory(tuple(parsed), source_label, EvidenceClass.OBSERVED if live else EvidenceClass.MODEL_SIGNAL, model_version, tuple(assumptions or ()), target_orbit, seps)


@dataclass(frozen=True)
class MissionTimelineEvent:
    event_id: str
    event_type: str
    timestamp_utc: datetime
    revision_no: int
    evidence_ids: tuple[str, ...]
    payload: dict[str, Any]
    video_timestamp_s: float | None = None


class MissionTimelineRecorderEngine:
    id = "E18"
    def __init__(self):
        self._events: dict[str, list[MissionTimelineEvent]] = {}

    def append(self, *, event_id: str, event_type: str, timestamp_utc: datetime, evidence_ids: list[str], payload: dict[str, Any], video_timestamp_s: float | None = None) -> MissionTimelineEvent:
        revisions = self._events.setdefault(event_id, [])
        event = MissionTimelineEvent(event_id, event_type, _aware(timestamp_utc), len(revisions)+1, tuple(evidence_ids), dict(payload), video_timestamp_s)
        revisions.append(event)
        return event

    def ordered(self) -> tuple[MissionTimelineEvent, ...]:
        latest = [v[-1] for v in self._events.values()]
        return tuple(sorted(latest, key=lambda e: (e.timestamp_utc, e.event_id)))

    def revisions(self, event_id: str) -> tuple[MissionTimelineEvent, ...]:
        return tuple(self._events.get(event_id, ()))

    def record_hash(self) -> str:
        return canonical_hash([{
            "event_id": e.event_id, "event_type": e.event_type, "timestamp_utc": e.timestamp_utc.isoformat(),
            "revision_no": e.revision_no, "evidence_ids": e.evidence_ids, "payload": e.payload, "video_timestamp_s": e.video_timestamp_s,
        } for e in self.ordered()])


@dataclass(frozen=True)
class OrbitHandover:
    mission_id: str
    payload_id: str
    object_id: str
    object_type: str
    status: str
    origin_relation: dict[str, str]
    evidence_ids: tuple[str, ...]


class MissionReplayOrbitHandoverEngine:
    id = "E19"
    def __init__(self):
        self._handovers: dict[tuple[str,str], OrbitHandover] = {}

    def handover(self, *, mission_id: str, payload_id: str, object_id: str, object_type: str, evidence_ids: list[str], confirmed: bool = False) -> OrbitHandover:
        if object_type not in {"SATELLITE", "ROCKET_BODY", "DEBRIS", "SPACECRAFT"}:
            raise ValueError("unsupported orbital object type")
        if not evidence_ids:
            raise ValueError("handover requires evidence")
        h = OrbitHandover(mission_id, payload_id, object_id, object_type, "CONFIRMED" if confirmed else "PROVISIONAL", {"GO_TO_LAUNCH": mission_id, "WHERE_IS_IT_NOW": object_id}, tuple(evidence_ids))
        self._handovers[(mission_id,payload_id)] = h
        return h

    def confirm(self, mission_id: str, payload_id: str, *, evidence_id: str) -> OrbitHandover:
        key=(mission_id,payload_id)
        old=self._handovers[key]
        new=replace(old,status="CONFIRMED",evidence_ids=old.evidence_ids+(evidence_id,))
        self._handovers[key]=new
        return new

    def get_handover(self, mission_id: str, payload_id: str) -> OrbitHandover | None:
        return self._handovers.get((mission_id,payload_id))

    def list_handovers(self, mission_id: str | None = None) -> tuple[OrbitHandover, ...]:
        values=tuple(self._handovers.values())
        return tuple(x for x in values if mission_id is None or x.mission_id==mission_id)

    def replay(self, timeline: MissionTimelineRecorderEngine, *, at_utc: datetime) -> dict[str, Any]:
        at=_aware(at_utc)
        events=[e for e in timeline.ordered() if e.timestamp_utc<=at]
        return {
            "cursor_utc": at.isoformat(),
            "events": [e.event_id for e in events],
            "record_hash": canonical_hash([e.event_id for e in events]),
            "may_create_current_event": False,
            "mode": "REPLAY",
        }
