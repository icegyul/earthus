from datetime import datetime, timezone
from aetherus_domain.models import EventRevision, SignalRecord, canonical_hash

class RevisionBuilder:
    #: E42 — see the note on SignalPromotionGate for why the id moved here.
    id = "E42"
    def build(self,event_id,revision_no:int,signal:SignalRecord,previous_payload:dict|None=None)->EventRevision:
        previous_payload=previous_payload or {}
        delta={k:{'before':previous_payload.get(k),'after':v} for k,v in signal.payload.items() if previous_payload.get(k)!=v}
        snap=canonical_hash({'signal':signal.model_dump(mode='json'),'delta':delta})
        return EventRevision(event_id=event_id,revision_no=revision_no,created_at=datetime.now(timezone.utc),cause_signal_ids=[signal.id],evidence_ids=signal.evidence_ids,delta=delta,snapshot_hash=snap,reason_codes=['SIGNAL_PROMOTED'])
