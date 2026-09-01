from datetime import datetime, timezone
from aetherus_domain.models import IntelligenceEvent, SignalRecord, ValidationState
from .signal_gate import SignalPromotionGate
from .correlation import EventCorrelator
from .revision import RevisionBuilder
from .store import InMemoryIntelligenceStore

class IntelligenceOrchestrator:
    """Executable E38-E42 slice. It orchestrates; it does not create scientific metrics."""
    def __init__(self, store=None, gate=None, correlator=None, revisions=None):
        self.store=store or InMemoryIntelligenceStore()
        self.gate=gate or SignalPromotionGate()
        self.correlator=correlator or EventCorrelator()
        self.revision_builder=revisions or RevisionBuilder()

    def ingest_signal(self, signal:SignalRecord):
        evidence_lookup=getattr(self.store, "get_evidence", None)
        if not self.gate.promote(signal, evidence_lookup=evidence_lookup):
            return None
        key=self.correlator.canonical_key(signal)
        event=self.store.get_event_by_key(key)
        now=datetime.now(timezone.utc)
        if event is None:
            event=IntelligenceEvent(
                event_type=signal.event_hint or signal.signal_type,
                canonical_key=key,
                object_ids=sorted(set(signal.object_ids)),
                mission_id=signal.mission_id,
                first_seen_at=now,
                updated_at=now,
                validation_state=self._validation(signal),
            )
            rev=self.revision_builder.build(event.id,1,signal,{})
        else:
            revisions=self.store.revisions_for(event.id)
            previous={}
            if revisions:
                previous={k:v.get('after') for k,v in revisions[-1].delta.items()}
            candidate=self.revision_builder.build(event.id,len(revisions)+1,signal,previous)
            # Reprocessing identical evidence/state is idempotent: no meaningless Revision.
            if not candidate.delta and revisions:
                return event, revisions[-1]
            event.updated_at=now
            rev=candidate
        event.current_revision_id=rev.id
        self.store.append_revision(rev)
        self.store.save_event(event)
        return event, rev

    def _validation(self, signal:SignalRecord):
        if signal.payload.get('validation_state'):
            return ValidationState(signal.payload['validation_state'])
        if signal.producer_module_id in {'E21','E22','E27'}:
            return ValidationState.SCREENING_ONLY
        return ValidationState.UNVALIDATED
