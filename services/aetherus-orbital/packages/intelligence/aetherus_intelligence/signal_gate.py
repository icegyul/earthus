from dataclasses import dataclass
from typing import Callable
from aetherus_domain.models import SignalRecord, EvidenceClass

@dataclass(frozen=True)
class SignalGatePolicy:
    min_significance: float = 0.65
    allow_without_significance_if_event_hint: bool = True

class SignalPromotionGate:
    """Prevents periodic/raw/unprovenanced updates from becoming Intelligence Events."""
    def __init__(self, policy: SignalGatePolicy|None=None):
        self.policy=policy or SignalGatePolicy()

    def promote(self, signal: SignalRecord, evidence_lookup: Callable|None=None)->bool:
        if not signal.evidence_ids:
            return False
        if evidence_lookup is not None:
            for evidence_id in signal.evidence_ids:
                evidence=evidence_lookup(evidence_id)
                if evidence is None or not getattr(evidence,'source_id',None):
                    return False
        if signal.evidence_class in {EvidenceClass.SIMULATION_ONLY, EvidenceClass.COUNTERFACTUAL, EvidenceClass.ATTRIBUTION_RESULT}:
            return False
        if signal.event_hint and self.policy.allow_without_significance_if_event_hint:
            return True
        return signal.significance is not None and signal.significance >= self.policy.min_significance
