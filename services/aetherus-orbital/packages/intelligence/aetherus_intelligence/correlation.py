from datetime import datetime, timezone
from hashlib import sha256
from aetherus_domain.models import SignalRecord

class EventCorrelator:
    #: E41 — see the note on SignalPromotionGate for why the id moved here.
    id = "E41"
    def canonical_key(self, signal: SignalRecord)->str:
        objects=','.join(sorted(signal.object_ids)) or '-'
        mission=signal.mission_id or '-'
        hint=signal.event_hint or signal.signal_type
        bucket=self._bucket(signal)
        raw=f'{hint}|{objects}|{mission}|{bucket}'
        return f'{hint}:{sha256(raw.encode()).hexdigest()[:24]}'
    def _bucket(self, signal: SignalRecord)->str:
        # Policy-driven hints may override this with a domain bucket identifier.
        if 'correlation_bucket' in signal.payload: return str(signal.payload['correlation_bucket'])
        dt=signal.observed_at.astimezone(timezone.utc)
        return dt.strftime('%Y-%m-%d')
