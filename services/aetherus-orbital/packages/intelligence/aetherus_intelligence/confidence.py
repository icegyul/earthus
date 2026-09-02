"""Evidence-derived confidence scoring.

Two rules govern this module, both written after a fixed literal was shipped to the
UI as if it had been computed:

1. A factor with no input is NOT scored 0.0. It is dropped from the numerator AND
   the denominator and reported as a not-applied limitation, because "we have no
   input for this factor" is not the same statement as "we are not confident".
2. Every applied factor must carry a reason naming what it was derived from. A
   generic filler such as "policy factor" forges provenance for a value nobody
   computed, so an applied factor without a real reason is rejected outright.

The weighted arithmetic is delegated to the E43 engine
(advanced.ConfidenceUncertaintyIntelligence) rather than duplicated here, so the
path that reaches production and the path exercised by acceptance are the same code.
"""

from __future__ import annotations

from datetime import datetime, timezone

from aetherus_domain.models import UncertaintyAssessment

from .advanced import ConfidenceUncertaintyIntelligence

DEFAULT_WEIGHTS = {
    'source_quality': 0.25,
    'freshness': 0.20,
    'completeness': 0.15,
    'agreement': 0.20,
    'time_alignment': 0.10,
    'validation': 0.10,
}

# Prefix used for the per-factor "we could not derive this" report carried on
# ConfidenceAssessment.limitations. Callers and the UI can key off it.
NOT_APPLIED_PREFIX = 'FACTOR_NOT_APPLIED'
NOT_COMPUTABLE = 'CONFIDENCE_NOT_COMPUTABLE: no weighted factor had a derivable input'

# Rejected as a factor reason: it describes the weight table, not the value's origin.
_FORBIDDEN_REASONS = {'policy factor', 'policy', 'default', 'n/a', '-'}


class ConfidenceEngine:
    #: E43 (confidence half; UncertaintyEngine carries the other half).
    id = "E43"
    """Weight policy and missing-input guard in front of the E43 confidence engine.

    ``assess`` scores only the factors whose value was actually derived by the
    caller; it never substitutes a number for an absent input.
    """

    policy_version = 'confidence-evidence-v2'

    def __init__(self, weights: dict[str, float] | None = None, engine=None):
        self.weights = dict(DEFAULT_WEIGHTS if weights is None else weights)
        # The real E43 implementation does the weighted arithmetic and grading.
        self.engine = engine or ConfidenceUncertaintyIntelligence()

    def assess(
        self,
        target_type: str,
        target_id: str,
        values: dict[str, float | None],
        reasons: dict[str, str] | None = None,
        *,
        not_applied_reasons: dict[str, str] | None = None,
        extra_limitations: list[str] | None = None,
    ):
        """Score the supplied factors.

        ``values`` maps a weighted factor name to a derived value in [0, 1]; a
        missing key or an explicit ``None`` means "not derivable" and is excluded
        from the score entirely. ``reasons`` must name the derivation of every
        value that is supplied. ``not_applied_reasons`` explains, per factor, why
        a value could not be derived; those explanations are reported on the
        assessment's limitations instead of being scored.
        """
        reasons = dict(reasons or {})
        not_applied_reasons = dict(not_applied_reasons or {})

        unweighted = sorted(set(values) - set(self.weights))
        if unweighted:
            raise ValueError(f'confidence factors without a weight in this policy: {unweighted}')

        factors: dict[str, tuple[float, float, str]] = {}
        limitations: list[str] = []
        for name, weight in self.weights.items():
            value = values.get(name)
            if value is None:
                why = not_applied_reasons.get(name) or 'no input was supplied for this factor'
                limitations.append(f'{NOT_APPLIED_PREFIX}:{name} - {why}')
                continue
            reason = (reasons.get(name) or '').strip()
            if not reason or reason.lower() in _FORBIDDEN_REASONS:
                raise ValueError(
                    f'confidence factor {name!r} was given a value but no reason naming its derivation'
                )
            factors[name] = (float(value), float(weight), reason)

        conf, _unused_uncertainty = self.engine.assess(
            target_type=target_type,
            target_id=target_id,
            factors=factors,
            policy_version=self.policy_version,
        )
        if not factors:
            limitations.insert(0, NOT_COMPUTABLE)
        limitations.extend(extra_limitations or [])
        return conf.model_copy(update={'limitations': [*conf.limitations, *limitations]})


class UncertaintyEngine:
    #: E43 (uncertainty half; ConfidenceEngine carries the other half).
    id = "E43"

    def unavailable(self, target_type: str, target_id: str, reason: str) -> UncertaintyAssessment:
        return UncertaintyAssessment(
            target_type=target_type,
            target_id=target_id,
            representation='UNAVAILABLE',
            computed_at=datetime.now(timezone.utc),
            limitations=[reason],
        )

    def interval(self, target_type: str, target_id: str, lower: float, upper: float, units: str) -> UncertaintyAssessment:
        return UncertaintyAssessment(
            target_type=target_type,
            target_id=target_id,
            representation='INTERVAL',
            lower=lower,
            upper=upper,
            units=units,
            computed_at=datetime.now(timezone.utc),
        )
