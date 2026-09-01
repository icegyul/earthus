from __future__ import annotations

from datetime import datetime, timezone

from aetherus_domain import IntelligencePacket, ValidationState

from .advanced import EvidenceFusionCrossValidationIntelligence
from .confidence import ConfidenceEngine, UncertaintyEngine

# E39 already publishes the source-grade weight table; reuse it so a second,
# drifting copy of the grade policy cannot appear here.
_GRADE_WEIGHTS = EvidenceFusionCrossValidationIntelligence.weights

# Only these validation states express an actual validation outcome. RESEARCH_ONLY
# and INSUFFICIENT_DATA say nothing about whether validation happened, so the
# factor is left unapplied for them rather than assigned a number.
_VALIDATION_FACTOR = {
    ValidationState.VALIDATED_PIPELINE: 1.0,
    ValidationState.UNVALIDATED: 0.0,
    ValidationState.VALIDATION_PENDING: 0.0,
    ValidationState.SCREENING_ONLY: 0.0,
}


class IntelligencePacketBuilder:
    """E44 executable packet slice.

    The narrative fields (what_happened / what_changed / why_it_matters / claims)
    explain only values already present in event, revision and evidence.

    Confidence and uncertainty are the one thing this builder derives, and it
    derives them from those same inputs: evidence source grade and declared
    quality, how much of the revision's cited evidence is actually present, the
    event's validation state, and - when the caller supplies the policy needed to
    judge them - retrieval age and observation-time alignment. Any factor that
    cannot be derived from the inputs is left unapplied and reported, never
    assumed. When nothing is derivable the packet carries NOT_ASSESSED with no
    score rather than a manufactured percentage.
    """

    id = "E44"
    version = "0.3.0"

    def __init__(self, confidence=None, uncertainty=None, fusion=None):
        self.confidence = confidence or ConfidenceEngine()
        self.uncertainty = uncertainty or UncertaintyEngine()
        self.fusion = fusion or EvidenceFusionCrossValidationIntelligence()

    def _derive_factors(
        self,
        *,
        event,
        revision,
        evidence,
        now,
        stale_after_seconds,
        cross_validation_values,
        alignment_window_seconds,
    ):
        evidence = list(evidence or [])
        values: dict[str, float | None] = {}
        reasons: dict[str, str] = {}
        not_applied: dict[str, str] = {}
        extra_limitations: list[str] = []

        # source_quality - declared evidence quality scaled by its source grade.
        # A record that declares no quality contributes nothing instead of 0.5.
        scored = [(e, float(e.quality) * _GRADE_WEIGHTS[e.source_grade]) for e in evidence if e.quality is not None]
        if scored:
            values['source_quality'] = sum(q for _, q in scored) / len(scored)
            detail = ', '.join(f'{e.source_id}[{e.source_grade.value}] quality={e.quality}' for e, _ in scored)
            reasons['source_quality'] = (
                f'mean of declared evidence quality scaled by the E39 source-grade weight over '
                f'{len(scored)}/{len(evidence)} evidence record(s): {detail}'
            )
        elif evidence:
            not_applied['source_quality'] = 'no supplied evidence record declares a quality value'
        else:
            not_applied['source_quality'] = 'no evidence records were supplied'

        # completeness - how much of the evidence the revision cites actually reached the packet.
        cited = {str(x) for x in revision.evidence_ids}
        if cited:
            present = {str(e.id) for e in evidence} & cited
            values['completeness'] = len(present) / len(cited)
            reasons['completeness'] = (
                f'{len(present)} of {len(cited)} evidence record(s) cited by revision '
                f'{revision.revision_no} were supplied to the packet'
            )
        else:
            not_applied['completeness'] = 'the revision cites no evidence ids, so coverage cannot be measured'

        # agreement - real cross-validation only. Without independent values for two
        # or more records there is nothing to agree, so no number is produced.
        fused = None
        if evidence:
            fused = self.fusion.fuse(evidence, values_by_evidence_id=cross_validation_values or {}, now=now)
        if fused is not None and fused.agreement is not None:
            values['agreement'] = fused.agreement
            reasons['agreement'] = (
                f'E39 cross-validation agreement over {len(cross_validation_values or {})} '
                f'independently supplied evidence value(s)'
            )
            for conflict in fused.conflicts:
                extra_limitations.append(f"EVIDENCE_CONFLICT:{conflict['type']} across {conflict['sources']}")
        else:
            not_applied['agreement'] = (
                'independent values for two or more evidence records were not supplied, '
                'so cross-validation agreement does not exist'
            )

        # freshness - meaningless without the source staleness policy it is measured against.
        if stale_after_seconds and float(stale_after_seconds) > 0 and evidence:
            age = max((now - e.received_at).total_seconds() for e in evidence)
            values['freshness'] = max(0.0, min(1.0, 1.0 - age / float(stale_after_seconds)))
            reasons['freshness'] = (
                f'oldest evidence retrieval is {age:.0f}s old measured against the source '
                f'staleness policy of {float(stale_after_seconds):.0f}s'
            )
        elif not evidence:
            not_applied['freshness'] = 'no evidence records were supplied'
        else:
            not_applied['freshness'] = 'no source staleness policy was supplied, so retrieval age cannot be scored'

        # time_alignment - needs at least two observation times and a window to judge their spread.
        if alignment_window_seconds and float(alignment_window_seconds) > 0 and len(evidence) >= 2:
            observed = [e.observed_at for e in evidence]
            span = (max(observed) - min(observed)).total_seconds()
            values['time_alignment'] = max(0.0, min(1.0, 1.0 - span / float(alignment_window_seconds)))
            reasons['time_alignment'] = (
                f'observation times of {len(evidence)} evidence records span {span:.0f}s '
                f'against a {float(alignment_window_seconds):.0f}s alignment window'
            )
        else:
            not_applied['time_alignment'] = (
                'an alignment window and two or more evidence observation times are required'
            )

        # validation - read off the event, never assumed.
        state = event.validation_state
        if state in _VALIDATION_FACTOR:
            values['validation'] = _VALIDATION_FACTOR[state]
            reasons['validation'] = f'event.validation_state is {state.value}'
        else:
            not_applied['validation'] = f'event.validation_state {state.value} states no validation outcome'

        return values, reasons, not_applied, extra_limitations

    def build(
        self,
        *,
        event,
        revision,
        evidence,
        what_happened,
        what_changed,
        why_it_matters,
        known_limitations=None,
        allowed_claims=None,
        prohibited_claims=None,
        now=None,
        stale_after_seconds=None,
        cross_validation_values=None,
        alignment_window_seconds=None,
        uncertainty=None,
    ):
        generated_at = now or datetime.now(timezone.utc)
        evidence = list(evidence or [])

        values, reasons, not_applied, extra_limitations = self._derive_factors(
            event=event,
            revision=revision,
            evidence=evidence,
            now=generated_at,
            stale_after_seconds=stale_after_seconds,
            cross_validation_values=cross_validation_values,
            alignment_window_seconds=alignment_window_seconds,
        )
        conf = self.confidence.assess(
            "REVISION",
            str(revision.id),
            values,
            reasons=reasons,
            not_applied_reasons=not_applied,
            extra_limitations=extra_limitations,
        )
        unc = uncertainty or self.uncertainty.unavailable(
            "REVISION",
            str(revision.id),
            "No numerical uncertainty representation was supplied for this revision.",
        )
        # Surface the confidence limitations where the API already shows warnings,
        # so an unapplied factor is visible next to the score rather than hidden.
        return IntelligencePacket(
            generated_at=generated_at,
            event=event,
            revision=revision,
            what_happened=what_happened,
            what_changed=what_changed,
            why_it_matters=why_it_matters,
            evidence=evidence,
            confidence=conf,
            uncertainty=unc,
            known_limitations=[*(known_limitations or []), *conf.limitations],
            allowed_claims=allowed_claims or [],
            prohibited_claims=prohibited_claims or [],
        )
