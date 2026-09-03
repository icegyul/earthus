"""Carry real conjunction signals through the Intelligence promotion gate.

Every piece of this path already existed and none of it was connected. The
adapter turns stored P4 screenings into SignalRecords, the gate decides what may
become an Intelligence Event, the correlator buckets a conjunction by P4's own
event id so refreshes land on the same event, and the revision builder records
what changed. What was missing was anything that called them: the signals were
built inside the ``GET /v1/intelligence/signals`` handler, merged into the
response, and discarded. So two hundred live screening candidates existed and
the event store held one fixture launch, which is why "WHAT CHANGED" could not
be shown end to end.

Two design rules shaped this module.

**Promotion is not a side effect of a read.** A GET that creates events makes
the event store a function of who happened to look at it. This is an explicit
operation with its own route, and a read stays a read.

**Re-running must not manufacture history.** The orchestrator already refuses a
revision whose delta is empty, and the adapter's payload is derived from the
latest stored snapshot, so promoting twice with no new screening produces
nothing. A revision here therefore means the screening actually changed. The
outcome counts ``unchanged`` separately from ``revised`` so that stays visible
rather than being folded into a single success number.

Refusals are counted with their reason. A signal the gate declines is not an
error and not a silent drop; the commonest reason is exactly the one the gate
exists for, evidence that cannot be resolved to a source.
"""

from __future__ import annotations

from collections.abc import Awaitable, Callable
from dataclasses import dataclass, field
from datetime import UTC, datetime
from typing import Any, Protocol
from uuid import uuid4

from aetherus_domain.models import EvidenceRecord, SignalRecord

#: Reasons a signal did not become part of an event, kept apart so a caller can
#: tell "the gate refused it" from "the adapter could not build it".
REFUSED_BY_GATE = "REFUSED_BY_PROMOTION_GATE"
REFUSED_EVIDENCE_UNRESOLVABLE = "EVIDENCE_NOT_PERSISTED"

# The rule for "did this actually move" lives in the backend, next to the
# screening that writes the snapshots, and both callers import it. A second copy
# here would be a second answer to one question, and the two would drift.
from backend.conjunction.materiality import (  # noqa: E402
    MATERIAL_CHANGE_POLICY,
    RESOLUTION,
    materially_different,
)

#: The adapter's payload keys that constitute the conjunction's assessment.
#: Different names from the snapshot's own columns, same policy underneath.
MATERIAL_CHANGE_CHANNELS = frozenset({
    "miss_distance_m", "relative_speed_mps", "pc", "max_pc",
    "pc_status", "max_pc_status", "max_pc_basis", "geometry_basis",
    "validation_state", "covariance_status", "event_status",
    "dilution_state", "tca_boundary_flag", "tca", "source_grade",
})


def _narrative(signal: SignalRecord, changed: list[str] | None) -> dict[str, list[str]]:
    """The packet's prose, assembled from the signal and nothing else.

    Every sentence restates a field that is in the packet. None of them ranks the
    conjunction, converts a distance into a probability, or calls a screening
    candidate a warning - the adapter's own prohibited-claims list forbids all
    three, and it travels with the packet.
    """
    payload = signal.payload
    primary = payload.get("primary_catalog_id") or "an object"
    secondary = payload.get("secondary_catalog_id") or "another object"
    tca = payload.get("tca")

    what_happened = [
        f"A conjunction screening candidate is recorded for catalog objects "
        f"{primary} and {secondary}."
    ]
    if tca:
        what_happened.append(f"The screened time of closest approach is {tca}.")

    if changed:
        what_changed = [
            "The stored screening for this conjunction was updated; the channels "
            f"that moved are {', '.join(changed)}."
        ]
    else:
        # A first sighting is not a change, and saying otherwise would put a
        # change in the record that never happened.
        what_changed = [
            "This is the first stored screening for this conjunction, so nothing "
            "has changed yet."
        ]

    why_it_matters = [
        "A screening candidate is a computed prediction that two objects pass "
        "close, not an observation and not a collision warning.",
    ]
    pc_status = payload.get("pc_status")
    if pc_status and pc_status != "COMPUTED":
        why_it_matters.append(
            "No collision probability is provided for this candidate: "
            f"pc_status is {pc_status}."
        )
    return {
        "what_happened": what_happened,
        "what_changed": what_changed,
        "why_it_matters": why_it_matters,
    }


class _Repository(Protocol):
    def save_evidence(self, evidence: EvidenceRecord) -> Any: ...
    def get_evidence(self, evidence_id: Any) -> EvidenceRecord | None: ...
    def save_signal(self, signal: SignalRecord) -> Any: ...
    def get_event_by_key(self, key: str) -> Any: ...
    def revisions_for(self, event_id: Any) -> list[Any]: ...
    def save_packet(self, packet: Any) -> Any: ...


@dataclass(frozen=True)
class PromotionOutcome:
    """What one promotion run did, in terms that cannot flatter it.

    ``created`` and ``revised`` are the two ways history moves. ``unchanged`` is
    the third outcome and the most common one on a repeat run; counting it as a
    success would make an idle run look like progress.
    """

    request_id: str
    generated_at: str
    data_status: str
    status_reason: str | None
    #: The rule that decided whether a snapshot said anything new.
    material_change_policy: str = MATERIAL_CHANGE_POLICY
    considered: int = 0
    created: int = 0
    revised: int = 0
    unchanged: int = 0
    #: Packets stored, so the confidence route has something to answer with.
    packets: int = 0
    refused: list[dict[str, Any]] = field(default_factory=list)
    events: list[str] = field(default_factory=list)
    warnings: list[str] = field(default_factory=list)
    source_bundle: dict[str, Any] = field(default_factory=dict)

    def to_payload(self) -> dict[str, Any]:
        return {
            "request_id": self.request_id,
            "generated_at": self.generated_at,
            "data_status": self.data_status,
            "status_reason": self.status_reason,
            "data": {
                "considered": self.considered,
                "created": self.created,
                "revised": self.revised,
                "unchanged": self.unchanged,
                "packets": self.packets,
                "refused": self.refused,
                "event_ids": self.events,
                "material_change_policy": self.material_change_policy,
            },
            "provenance": self.source_bundle,
            "warnings": self.warnings,
        }


async def promote_conjunction_signals(
    *,
    signal_source: Callable[..., Awaitable[Any]],
    repository: _Repository,
    orchestrator: Any,
    packet_builder: Any | None = None,
    limit: int = 200,
) -> PromotionOutcome:
    """Promote stored P4 screening candidates into Intelligence Events.

    The evidence is persisted before the gate runs. The gate verifies provenance
    by looking each evidence id up in the store, so promoting first and saving
    afterwards would make every signal fail for a reason that is about ordering
    rather than about the data.
    """
    bundle = await signal_source(limit=limit)
    generated_at = datetime.now(UTC).isoformat()
    request_id = str(uuid4())

    warnings = list(getattr(bundle, "warnings", []) or [])
    signals: list[SignalRecord] = list(getattr(bundle, "signals", []) or [])
    evidence: list[EvidenceRecord] = list(getattr(bundle, "evidence", []) or [])

    if not signals:
        # An empty screening population is a legitimate answer, and it keeps the
        # adapter's own reason rather than acquiring a new one here.
        return PromotionOutcome(
            request_id=request_id,
            generated_at=generated_at,
            data_status=getattr(bundle, "data_status", "UNAVAILABLE"),
            status_reason=getattr(bundle, "status_reason", None)
            or "the conjunction adapter produced no signal to promote",
            warnings=warnings,
            source_bundle=_bundle_provenance(bundle),
        )

    for record in evidence:
        repository.save_evidence(record)

    created = revised = unchanged = 0
    refused: list[dict[str, Any]] = []
    touched: list[str] = []
    moved_channels: dict[str, list[str]] = {}
    packets = 0

    for signal in signals:
        unresolved = [
            str(evidence_id)
            for evidence_id in signal.evidence_ids
            if repository.get_evidence(evidence_id) is None
        ]
        if unresolved:
            refused.append({
                "signal_id": str(signal.id),
                "reason": REFUSED_EVIDENCE_UNRESOLVABLE,
                "detail": f"evidence not in the store: {unresolved}",
            })
            continue

        key = orchestrator.correlator.canonical_key(signal)
        existing = repository.get_event_by_key(key)
        revisions_before = len(repository.revisions_for(existing.id)) if existing else 0

        # Does this snapshot actually say something new? The orchestrator would
        # take any difference at all as a revision, and a re-run of the same
        # screening differs in the ninth decimal place. Deciding that here keeps
        # the noise out of the lineage instead of filtering it back out later.
        if existing is not None and revisions_before:
            previous = {
                field: change.get("after")
                for field, change in repository.revisions_for(existing.id)[-1].delta.items()
            }
            moved, channels = materially_different(
                previous, signal.payload, channels=MATERIAL_CHANGE_CHANNELS
            )
            if not moved:
                unchanged += 1
                continue
            moved_channels[str(existing.id)] = channels

        repository.save_signal(signal)
        result = orchestrator.ingest_signal(signal)
        if result is None:
            refused.append({
                "signal_id": str(signal.id),
                "reason": REFUSED_BY_GATE,
                "detail": "the promotion gate declined this signal; see SignalPromotionGate",
            })
            continue

        event, revision = result
        touched.append(str(event.id))

        # HOW SURE. Without a packet the confidence route can only answer 404,
        # which is honest and useless. The builder derives what it can from the
        # evidence and the validation state and reports NOT_ASSESSED for the
        # rest, so a SCREENING_ONLY candidate says how unsure it is.
        if packet_builder is not None and hasattr(repository, "save_packet"):
            narrative = _narrative(signal, moved_channels.get(str(event.id)))
            packet = packet_builder.build(
                event=event,
                revision=revision,
                evidence=[repository.get_evidence(e) for e in signal.evidence_ids],
                known_limitations=list(signal.payload.get("known_limitations") or []),
                allowed_claims=list(signal.payload.get("allowed_claims") or []),
                prohibited_claims=list(signal.payload.get("prohibited_claims") or []),
                **narrative,
            )
            repository.save_packet(packet)
            packets += 1
        if existing is None:
            created += 1
        elif len(repository.revisions_for(event.id)) > revisions_before:
            revised += 1
        else:
            unchanged += 1

    return PromotionOutcome(
        request_id=request_id,
        generated_at=generated_at,
        data_status="OK",
        status_reason=None,
        considered=len(signals),
        created=created,
        revised=revised,
        unchanged=unchanged,
        packets=packets,
        refused=refused,
        events=sorted(set(touched)),
        warnings=warnings,
        source_bundle={
            **_bundle_provenance(bundle),
            "material_change_policy": MATERIAL_CHANGE_POLICY,
            "material_change_resolution": dict(RESOLUTION),
            "changed_channels_by_event": moved_channels,
        },
    )


def _bundle_provenance(bundle: Any) -> dict[str, Any]:
    """Where the promoted signals came from, without copying them."""
    provenance = dict(getattr(bundle, "provenance", {}) or {})
    provenance.update({
        "source_request_id": getattr(bundle, "request_id", None),
        "source_generated_at": getattr(bundle, "generated_at", None),
        "source_data_status": getattr(bundle, "data_status", None),
        "signals_offered": len(getattr(bundle, "signals", []) or []),
        "adapter_skipped": len(getattr(bundle, "skipped", []) or []),
    })
    return provenance
