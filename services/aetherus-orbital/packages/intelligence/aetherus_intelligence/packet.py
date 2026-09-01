from __future__ import annotations

from datetime import datetime, timezone
from aetherus_domain import IntelligencePacket
from .confidence import ConfidenceEngine, UncertaintyEngine


class IntelligencePacketBuilder:
    """E44 executable packet slice. It explains only values already present in event/revision/evidence."""
    id = "E44"
    version = "0.2.0"

    def __init__(self, confidence=None, uncertainty=None):
        self.confidence = confidence or ConfidenceEngine()
        self.uncertainty = uncertainty or UncertaintyEngine()

    def build(self, *, event, revision, evidence, what_happened, what_changed, why_it_matters, known_limitations=None, allowed_claims=None, prohibited_claims=None):
        source_quality = 1.0 if evidence and all(e.source_grade.value in {"OPERATIONAL", "OFFICIAL_PUBLIC"} for e in evidence) else 0.5
        values = {
            "source_quality": source_quality,
            "freshness": 1.0,
            "completeness": 0.8 if evidence else 0.0,
            "agreement": 0.5,  # no independent second-source cross validation in this Foundation fixture
            "time_alignment": 1.0,
            "validation": 0.7,
        }
        conf = self.confidence.assess("REVISION", str(revision.id), values, reasons={
            "agreement": "single official fixed fixture; independent cross-validation not yet connected",
            "validation": "Foundation E2E fixture path only; live provider adapter not yet exercised",
        })
        unc = self.uncertainty.unavailable("REVISION", str(revision.id), "No numerical uncertainty is applicable to the fixed historical launch fact in this Foundation E2E.")
        return IntelligencePacket(
            generated_at=datetime.now(timezone.utc),
            event=event,
            revision=revision,
            what_happened=what_happened,
            what_changed=what_changed,
            why_it_matters=why_it_matters,
            evidence=evidence,
            confidence=conf,
            uncertainty=unc,
            known_limitations=known_limitations or [],
            allowed_claims=allowed_claims or [],
            prohibited_claims=prohibited_claims or [],
        )
