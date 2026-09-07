# STEP 46 — VALIDATION EXTENSION PREREGISTRATION

**Classification: VALIDATION_EXTENSION_PRE_REGISTRATION**
Status: VALIDATION_EXTENSION_DESIGN_COMPLETE (uncommitted, design only).

Protocol: `docs/research/step46-validation-extension-preregistration-protocol.json`
(SHA-256 `c824b053fdeea203…`, identity hash `d7ec8fd5400f2460…`).
Validator: `tools/research/check_step46_validation_extension_preregistration.py`.

**No extension data were accessed.** No extension observation file, forcing, trajectory, model,
bootstrap or performance quantity was read or produced. No cohort was derived.

---

## 1. What this is, and what it is not

This is a **VALIDATION_EXTENSION**, not the original confirmatory validation. The protocol states
explicitly that:

- the original validation attempt was BLOCKED and remains blocked;
- the extension exists because the original minimum cohort could not be formed;
- extension rules are fixed here, before any extension performance is accessed;
- extension results cannot retroactively change the primary result;
- extension results cannot erase the original validation block;
- extension success does not automatically imply operational promotion.

## 2. Frozen inputs that do not change

Primary experiment: Theta = **-31.331 km**, 95 % interval **[-72.0725, -11.7435] km**, H1 SUPPORTED,
candidate **CANDIDATE_ONLY**, operational promotion NO. Immutable, and not used to design this
extension.

Original validation: **VALIDATION_COHORT_BLOCKED** (STEP 45C). Region Kuroshio, 26 candidate windows,
rank 1, four windows contributed new identities, 14 unique drifters against a minimum of 20. The
original cohort does not exist. The 14-drifter set is labelled throughout as an **intermediate
derivation result only**. STEP 44 is not altered and STEP 45C is not reopened.

## 3. Extension question

Can the frozen Candidate C configuration be independently evaluated on a predefined, out-of-sample
validation domain when the original single-region feasibility gate cannot be satisfied? The extension
tests generalizability and never uses validation performance to choose its cohort.

## 4. Extension domain (explicit and complete)

| Region | In domain | Eligible windows in the extension period |
|---|---|---|
| KE (Kuroshio) | yes | 26 |
| BM (Brazil-Malvinas) | yes | 3 |
| AG (Agulhas) | yes | 0 |
| GS (Gulf Stream) | **no** — primary experiment region | (99, not used) |

The domain is **every registered region of the frozen four-box framework except the primary region**.
There is no undefined "other regions" category. All three are mandatory members. No ranking, no
subsetting, and no region is added or dropped for any reason, including feasibility or expected
outcome. The counts above are recorded for transparency only; they select nothing.

## 5. Why multi-region, and why this is not a rescue design

The frozen accumulation rule is itself multi-region: *one chronological sequence over all regions; a
window enters only if it contributes at least one drifter identity absent from every prior cohort and
from the accumulated cohort; selected starts in the same region at least 72 hours apart*. The original
validation restricted that frozen rule to a single rank-1 region. The extension **returns to the
original frozen semantics** over the non-primary regions, which is a stronger transportability test
across several western-boundary-current systems than any single-region design.

The design is feasibility-driven and says so. Integrity rests on three things: the region set is
complete rather than chosen, the gate is inherited unchanged, and no performance quantity enters any
rule.

## 6. Disclosed structural ceiling

Honesty requires stating a hard limit that is visible from frozen metadata alone. The extension domain
admits **at most 6 selected windows**:

- the Kuroshio part of the chronological walk is identical to the original attempt, giving 4 windows
  and 14 drifters, already committed and derived with no performance access;
- Brazil-Malvinas has three eligible starts, 2013-12-19, 2013-12-20 and 2014-01-06, and the first two
  are 24 hours apart, so the 72-hour same-region separation admits only one of them, leaving at most
  2 further windows;
- Agulhas has 0 eligible windows in the extension period.

The gate requires at least 6 windows and 20 unique drifters. The extension can therefore satisfy the
window part only if both admissible Brazil-Malvinas windows contribute a new identity, and the drifter
part only if they supply at least 6 new unique drifters. **Whether they do is unknown at
preregistration time**, because per-window identities require the observation read that a later step
performs. The gate was **not** adjusted to this ceiling.

## 7. Sample-size gate (identical to the original)

Minimum 6 windows, minimum 20 unique drifters, maximum 12 windows, minimum 4 valid windows after
execution. If not reached: **VALIDATION_EXTENSION_BLOCKED**. Relaxation after seeing the result is
forbidden.

## 8. Temporal rule

t0 = **2010-11-18T12:00:00Z** (last primary window end plus 30 days, the same frozen derivation as the
original validation, required because the extension period must be later than the primary cohort).
t1 = **2015-12-31T21:00:00Z** (frozen period lock, the reanalysis coverage end).

Disclosure: the extension period necessarily coincides with the original validation period. The frozen
source coverage ends in December 2015 and the period must be later than the primary cohort, so no
non-overlapping later period exists. The extension differs from the original validation in **domain**,
not in period. An earlier period would violate the later-than-primary requirement and is not used. No
year is preferred, skipped or weighted, and no year was chosen for expected performance.

## 9. Independence

No overlap with the 20 primary drifters, no overlap with the 88 previously excluded identities, no
reuse of primary observation records, period later than the primary cohort, no primary window reuse.
The exclusion identity is the same 88-identity list with the same list hash, and the ±72 hour
separation from every earlier calibration and holdout window start is inherited unchanged.

## 10. Cohort accumulation (frozen logic, unchanged)

Chronological order by start then region; eligibility by the frozen E1–E5 and A1–A3 evaluation applied
verbatim; the 88-identity exclusion set; same-region selected starts at least 72 hours apart;
a window is selected only if it contributes a new eligible identity; shortest chronological prefix
reaching 6 windows and 20 unique drifters; maximum 12. No manual addition or removal, no
performance-based pruning, no drifter chosen because it is easier to simulate. Weighting is **equal
window** weighting, identical to the frozen primary endpoint; regions are not weighted equally and
there is no per-region quota or balancing.

## 11. Model configuration (exactly the frozen primary configuration)

Condition A HYCOM_NATIVE_3H, condition B HYCOM_DAILY, candidate C GLORYS12V1 plus WW3 Stokes at 1.0
plus NCEP-R2. alpha 0.002, Stokes multiplier 1.0, depths 15.000 m and 15.810070 m, RK4 with a 300 s
step, 900 s output, 72 hours, horizons 24 / 48 / 72 hours, runtime 155995dd. No tuning, no
recalibration, no optimisation, no new model. Forcing uses exact frozen product identities only; an
unavailable source blocks the affected branch rather than being substituted.

## 12. Endpoint and hypothesis

delta_i = E_C,i(72 h) - E_A,i(72 h); Delta_w = median over drifters in a window;
**Theta_extension = median over windows with at least one valid pair**; equal window weighting;
statistical unit is the window; missing values are never imputed.

**H_EXT: Theta_extension < 0 km.** A single confirmatory hypothesis. It is not H1 and is never merged
with it.

## 13. Uncertainty

Window-level percentile bootstrap over all registered extension windows, B = 10000, **new seed
20260946** (distinct from 20260907 and 20260944), `numpy.random.default_rng(20260946)`, no independent
drifter resampling for the primary interval, no trajectory-point resampling, interval by
`numpy.quantile(..., [0.025, 0.975], method='linear')`. A drifter-level bootstrap is sensitivity only.

## 14. Success criterion and statuses

**VALIDATION_EXTENSION_SUPPORTED** if and only if the descriptive label is
CANDIDATE_EXTENSION_DESCRIPTIVELY_FAVORED, the window-level upper bound Q0.975 < 0 km, and the gate is
satisfied. Otherwise VALIDATION_EXTENSION_NOT_SUPPORTED on a valid execution,
VALIDATION_EXTENSION_BLOCKED if the cohort cannot be constructed, VALIDATION_EXTENSION_INVALID on an
integrity failure. Statuses are not redefined after results, and secondary metrics never replace the
primary endpoint.

## 15. Original versus extension

| | ORIGINAL VALIDATION | VALIDATION EXTENSION |
|---|---|---|
| status | **BLOCKED** (4 windows, 14 drifters, gate 6 / 20 not met) | determined later by this protocol |
| contributes a statistic | no | its own, separately reported |

The two are never combined into a pooled statistic, and extension evidence is never presented as the
original validation.

## 16. Operational status

Candidate C remains **CANDIDATE_ONLY** and operational promotion remains **NO**, whatever the
extension outcome. The extension is evidence about generalization only; deployment requires a separate
future decision.

## 17. Leakage disclosure

Known at design time: the frozen primary result, the original validation block with its 4 windows and
14 drifters (derived without performance access), and per-region eligible window counts from frozen
metadata. Not known at design time: per-window identities for Brazil-Malvinas, whether the gate can be
satisfied, and every extension trajectory, error, endpoint and bootstrap quantity. No Candidate C
performance quantity entered the domain, period, accumulation rule, endpoint, bootstrap or success
criterion.

## 18. Integrity check

This is **not a rescue** protocol. The original gate remains failed, the extension is separately
labelled, no extension result can modify the primary result or erase the original limitation, and the
domain is not justified by expected favourable results. The design-blocked condition is not triggered.

END OF STEP 46 REPORT
