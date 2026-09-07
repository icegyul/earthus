# STEP 53 — NEW INDEPENDENT VALIDATION PREREGISTRATION

**STATUS: PREREGISTRATION ONLY. DATA_ACCESS_STATUS = PROTOCOL_ONLY. SCIENTIFIC EXECUTION = NOT RUN.**

This document is locked before any STEP 53 validation data are acquired or inspected. It creates no
scientific result and changes nothing in STEP 36–52.

Parent audit: STEP 52 `4af3fd8fadc50243a3493efa22d57d5811c23943`, FINAL_RESEARCH_AUDIT_PASS.

---

## 1. Research question

Does candidate C reproduce the direction and magnitude of the preregistered primary effect against
baseline A in a new, previously untested validation population?

## 2. Scientific motivation

The primary preregistered experiment supported H1 with a 72-hour effect of -31.331 km and a 95 %
interval entirely below zero. The geographically independent validation extension did not satisfy the
preregistered replication criterion: its 72-hour effect was -2.272 km with a 95 % interval of
[-9.597, +10.246] km, which includes zero. Replication is therefore **not established**. This study
seeks new independent evidence in a population no earlier study has touched. It cannot and will not
revise either earlier result.

## 3. Primary hypothesis

**H_REP:** on the new validation population, the 72-hour window-level median of
delta_i = E_C,i(72h) − E_A,i(72h) is below zero, and its preregistered 95 % window bootstrap interval
lies entirely below zero, in the same direction as the primary effect (C lower error than A).

## 4. Null hypothesis

**H_REP-null:** the above conjunction does not hold; either the point estimate is not below zero, or
the interval is not entirely below zero.

## 5. Model A (baseline, locked)

HYCOM_NATIVE_3H — HYCOM GOFS 3.1 GLBv0.08 **expt_53.X**, variables water_u and water_v, depth
**15.000 m**, 3-hourly.

## 6. Model C (candidate, locked)

GLORYS12V1 at native **15.810070 m** + WW3 **GLOB-30M CFSR** uss with Stokes multiplier **1.0** +
NCEP-DOE Reanalysis 2 10 m u/v.

## 7. Parameter lock

alpha = **0.002**; RK4 integrator; 300 s step; 900 s output; 72 h duration; horizons 24 / 48 / 72 h;
Stokes multiplier 1.0; depths as above. **No parameter tuning is permitted in this study.** Changing
alpha, the Stokes multiplier, a depth or a source would require a separate preregistered study.

## 8. Geographic domain

**East Australian Current (EAC) box: 40° S – 25° S, 150° E – 160° E.**

This domain is used by no earlier step. It does not intersect the primary region (Gulf Stream,
32–40 N / 75–55 W) or either extension region (Kuroshio 30–40 N / 135–160 E, which is in the northern
hemisphere; Brazil-Malvinas 40–30 S / 60–45 W).

**Why not the remaining registered box.** The fourth registered box, Agulhas (40–30 S / 15–35 E), was
considered and rejected on a feasibility fact visible in frozen metadata alone: the STEP 35 window
eligibility inventory records **zero** window-eligible rows for Agulhas across the whole 2010–2015
period under the inherited frame-coverage rule. An Agulhas study would therefore be expected to block
before producing evidence. This is a metadata feasibility fact, not a performance fact; no error,
effect size or model output entered the decision.

The domain is fixed here and may not be changed after data are seen.

## 9. Temporal domain

**2010-01-01T12:00:00Z through 2015-12-31T12:00:00Z**, window start instants at 12:00 UTC, each window
running 72 hours.

The upper bound is the coverage end of HYCOM expt_53.X, which condition A requires.

**Independence limitation, stated plainly.** This period overlaps the calendar periods used by the
primary experiment and by both earlier validation lines, although in different regions. Full temporal
independence is **not achievable** without abandoning the locked HYCOM source, so this study is **not**
described as fully temporally independent. Its independence is geographic, and by construction its
drifter identities are new.

## 10. Observation source

NOAA Global Drifter Program hourly quality-controlled observations, the same product family used
throughout the chain. EAC observations are not present in the existing frozen dataset and must be
acquired after this lock, under a separate acquisition step that records product identity, checksums
and coverage before any scientific execution.

## 11. Cohort eligibility

The frozen STEP 16 criteria are applied verbatim, using only fields that exist in the observation
product: drogue attached through window end; buoy type SVP or SVPB; 73 hourly samples across the
window with no gap exceeding one hour and provider gap at most 3600 s; start position more than 100 km
from the coastline; start position inside the box. Window-level advection criteria: median first-step
speed at least 0.30 m/s, median 72-hour displacement at least 40 km, median turn angle at most 90°.

No field is invented. If a required field is absent from the acquired product, the study blocks and
reports the absence.

## 12. Window selection

Candidate window starts are scanned in strict chronological order from the period start. A window is
REGISTERED when all of the following hold, and is otherwise SKIPPED:

- eligible drifter count at least 8;
- the window-level advection criteria pass;
- observations exist at exactly t0, t0+24 h, t0+48 h and t0+72 h for the eligible drifters;
- the window start is at least 72 hours after the previously registered window start (same region);
- no exclusion or overlap rule is violated.

**No ranking of any kind is applied.** Selecting by lowest error, greatest candidate advantage, best
model agreement, favourable region or favourable season is prohibited. Only deterministic
chronological order is used.

## 13. Drifter selection

Within a registered window the eligible drifters are ordered by **numeric drifter identifier
ascending**, and the first **at most 12** are taken. Ties are impossible because identifiers are
unique. Selection never uses performance, error or any model output.

## 14. Exclusion rules

Excluded from the new cohort: every drifter identity used by the primary cohort (20), every identity
used by the STEP 47 extension cohort (25), and every identity on the inherited 88-identity exclusion
list from the earlier calibration and holdout studies. A window whose eligible drifters are all
excluded contributes nothing and is skipped.

## 15. Non-overlap rules

Before the cohort is locked, all four intersections must be empty:

- new identities ∩ primary identities = ∅
- new identities ∩ extension identities = ∅
- new window starts ∩ primary window starts = ∅
- new window starts ∩ extension window starts = ∅

PASS requires all four empty. Any non-empty intersection blocks the study.

## 16. Endpoint

For each drifter i: E_A,i(72h) and E_C,i(72h) are haversine distances between the modelled and the
observed position at exactly t0+72 h, with R = 6 371 008.8 m, expressed in km. The paired difference is

**delta_i = E_C,i(72h) − E_A,i(72h)**

Negative means the candidate has the lower displacement error. Pairing is by exact drifter identity and
exact UTC timestamp. There is no imputation, no interpolation beyond the exact-timestamp handling
already frozen, and no manual removal of any trajectory after model results are seen.

## 17. Aggregation

Per window: **Delta_w = median of delta_i over the window's valid paired drifters.**
Overall: **Theta_72h = equal-weight median of Delta_w across valid windows.**

Windows are never weighted by drifter count, performance, geography, duration or model confidence. The
pooled drifter-level median may be reported descriptively but is never the primary endpoint.

## 18. Validity gate

Minimum **4** valid windows for execution. Target **6 or more** registered windows, with 8–10 as the
planning target, at least **20** unique drifters and at most **12** drifters per window.

If fewer than 4 valid windows are obtained: **VALIDATION_BLOCKED**, with no performance claim, no
bootstrap and no hypothesis conclusion.

## 19. Bootstrap

Unit **window**. B = **10000**. One generator, `numpy.random.default_rng(20260953)`. Sampling with
replacement, sample size equal to the number of registered valid windows. NOT_AVAILABLE replicates are
counted and **never redrawn**. Interval by `numpy.quantile(..., [0.025, 0.975], method="linear")`,
95 % level.

## 20. Random seed

**20260953**, fixed here. The seed may not be changed after data inspection, and the analysis may not
be re-run under another seed because a result is unfavourable.

## 21. Replication criterion

**REPLICATION_SUPPORTED** if and only if all of:

A. the valid-window gate passes;
B. Theta_72h < 0 km;
C. the 95 % interval upper bound < 0 km;
D. the direction agrees with the primary effect (C lower error than A).

Otherwise **REPLICATION_NOT_SUPPORTED**. If the execution gate fails, the status is
**VALIDATION_BLOCKED**, which is distinct from not supported.

REPLICATION_NOT_SUPPORTED does **not** mean the candidate is disproven. It means the preregistered
replication criterion was not met.

## 22. Magnitude interpretation

The new effect is not required to equal the primary point estimate of -31.331 km. The criterion is
directional and interval-based, not exact numerical equality. Magnitude may be compared descriptively.
No post-hoc magnitude threshold may be invented.

## 23. Failure handling

Three outcomes are defined in advance: REPLICATION_SUPPORTED, REPLICATION_NOT_SUPPORTED and
VALIDATION_BLOCKED. Statuses are not redefined after results are seen. A blocked study is never
reported as a negative finding.

## 24. Reproducibility

Cohort derivation, execution and analysis must each be replayable in a separate process with
byte-identical scientific outputs; only creation timestamps may differ. Every artefact carries a
SHA-256. Any mismatch halts the study rather than being resolved by choosing one output.

## 25. No post-hoc rules

After results are observed it is prohibited to change the cohort, remove unfavourable windows or
drifters, change alpha, source, horizon, endpoint, bootstrap seed, interval method, aggregation, or the
geographic or temporal scope. Any new analysis requires a new preregistration.

## 26. Independence limitations and separation

This study is geographically independent of all prior studies and uses previously unused drifter
identities by construction. It is **not** fully temporally independent, because the locked HYCOM source
constrains the period to one that earlier studies also span in other regions.

Three layers stay separate and are never pooled into a combined effect estimate:

| study | result |
|---|---|
| Primary | SUPPORTED |
| Geographic validation extension | NOT_SUPPORTED |
| STEP 53 new validation | UNKNOWN until execution |

## 27. Analysis freeze statement

Every rule above is fixed as of this lock. No STEP 53 validation source data have been acquired or
inspected for scientific performance. No trajectory, endpoint, bootstrap or comparison has been
computed. The current scientific position is unchanged: primary SUPPORTED, extension NOT_SUPPORTED,
overall replication NOT ESTABLISHED, candidate CANDIDATE_ONLY, operational promotion NO, production
claim NO.

END OF STEP 53 PREREGISTRATION
