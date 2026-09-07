# STEP 51 — CROSS-VALIDATION INTERPRETATION REPORT

Companion to `step51-independent-validation-final-report.md`. This document records **how** the two
frozen results are to be read together, and the language rules that bind any future statement about
them. It performs no analysis.

Interpretation lock: `docs/research/step51-cross-validation-interpretation-lock.json`.

---

## 1. The interpretation, in four steps

**A. Primary experiment.** H1 SUPPORTED. The preregistered primary criterion was met on the frozen
primary cohort.

**B. Validation extension.** H_EXT NOT_SUPPORTED. The preregistered replication criterion was not met
on the geographically independent extension cohort.

**C. Together.** Primary evidence exists. Replication evidence is insufficient.

**D. Consequence.** Candidate C remains CANDIDATE_ONLY. Operational promotion NO.

## 2. Do not overstate the failure

The evidence does not support any of the following, and none may be written:

*C is disproven · C is false · C never works · C is scientifically invalid · C is universally
ineffective · the primary result was wrong.*

The extension did not refute the candidate. It failed to reproduce the primary effect under a
preregistered criterion, on a small cohort whose interval spans zero. The accurate formulation is:

> The primary effect was not reproduced under the preregistered validation-extension criterion.

> 독립검증 확장에서 1차 효과의 사전등록된 재현 기준을 충족하지 못했다.

## 3. Do not overstate the success

Because H_EXT is NOT_SUPPORTED, none of the following may be written:

*validated · independently validated · generally superior · globally superior · production-ready ·
operationally proven · robust across regions · universally better.*

The primary result stands as preregistered evidence within its own cohort and configuration. It is not
a general claim.

## 4. Independence wording

Permitted: **geographically independent validation extension**.

Its basis is concrete: no drifter identity overlap with the primary cohort, no primary window-start
overlap, a separate geographic domain, and a sequence in which the design was preregistered, the
cohort locked, the sources frozen, the execution run and the endpoint evaluated in that order.

Forbidden: *fully independent in every dimension*, and *temporally independent from the original
validation attempt*. The original attempt and this extension share the same validation period, so the
extension's independence is geographic, not temporal.

## 5. Blocked is not the same as not supported

| | original validation attempt | validation extension |
|---|---|---|
| outcome | **BLOCKED** | **NOT_SUPPORTED** |
| reason | cohort gate failed at 14 unique drifters | preregistered interval criterion not met |
| execution | none: no trajectory, endpoint or bootstrap | 18 of 18 run units, endpoint and bootstrap complete |
| contributes a statistic | no | yes, its own |

A blocked attempt produced no performance evidence at all. It is preserved as BLOCKED, is never
reported as a negative result, and is never pooled with the extension.

## 6. Separation that must be maintained

The primary and the extension are two experiments, reported side by side and never merged. Prohibited
in any future write-up of these results: pooled validation, combined cohort, combined bootstrap,
meta-analysis, or an overall global claim built from both. The nine-window primary cohort and the
six-window extension cohort are not summed.

## 7. Status language for the candidate

Only **CANDIDATE_ONLY** is correct. The labels PROMOTED, PRODUCTION, OPERATIONAL and DEPLOYED are
forbidden. Operational promotion NO; production claim NO.

## 8. No cause is assigned to the extension outcome

The record states the arithmetic and stops: Theta_extension at 72 hours is -2.272 km, the 95 %
interval is [-9.597, +10.246] km, the upper bound is at or above zero, therefore H_EXT is
NOT_SUPPORTED. Region, season, any of the four forcing products, the parameters and drifter quality
are all candidate explanations that these experiments cannot separate, and none is asserted.

## 9. What this step did not do

No trajectory, bootstrap, hypothesis test or sensitivity analysis was run. No source was acquired, no
parameter tuned, no cohort, window or drifter changed. Neither the primary result nor the STEP 50
result was modified or recomputed, and nothing was recomputed in search of a more favourable reading.

## 10. Forward status

Candidate C remains CANDIDATE_ONLY. Further work requires a new preregistration and leaves these
results untouched. No new research begins here.

END OF STEP 51 INTERPRETATION REPORT
