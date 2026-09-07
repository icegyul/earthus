# STEP 44 — INDEPENDENT OUT-OF-SAMPLE VALIDATION PREREGISTRATION

Status: VALIDATION_PREREGISTRATION_DESIGN_COMPLETE (uncommitted; design only).
Protocol: `docs/research/step44-validation-preregistration-protocol.json` (SHA-256 `6a2e2f04f7948e4f…`).
Rule id: `validation-preregistration-step44`. Validator: `tools/research/check_step44_validation_preregistration.py`.

No validation data were accessed. No validation experiment was executed. No trajectory, model, bootstrap
or evaluation was run. The primary experiment (STEP 36–43) is unchanged and frozen.

---

## 1. Frozen primary experiment (input, never modified)

| Item | Frozen value |
|---|---|
| Cohort | STEP 36: 9 Gulf Stream windows GS-Y1…GS-Y9, 2010-07-27T12Z … 2010-10-19T12Z, 20 unique drifters |
| Primary statistic | Theta = -31.331 km |
| 95 % window-bootstrap interval | [-72.0725, -11.7435] km |
| H1 | SUPPORTED |
| Candidate status | CANDIDATE_ONLY; operational promotion NO |

The primary result is frozen history. It was not used, and must not be used, to choose any element of
the validation design. Every selection rule below is an objective function of pre-existing, SHA-frozen
records that contain no candidate or baseline performance.

## 2. Validation question

Does the exact frozen Candidate C configuration reproduce the direction of the primary 72 h effect
(Theta < 0 km versus HYCOM_NATIVE_3H) on a genuinely independent, predefined validation cohort?
No optimisation question is permitted; the validation tests transportability of the frozen
configuration only.

## 3. Independence and leakage inventory

Requirements A–G (no drifter-ID overlap, no window overlap, no observation overlap, no tuning, no
forcing selection, no model selection, no cohort modification) are locked in the protocol.

Exclusion identity: 88 drifter IDs (20 primary + 68 prior-cohort IDs from STEP 20 / STEP 32), listed
in full in the protocol with the SHA-256 of the sorted list; STEP 20 / STEP 32 window starts (±72 h)
remain excluded through the inherited STEP 35 rule.

Leakage forms identified and controlled: drifter identity reuse; temporal overlap with primary windows;
temporal/spatial overlap with STEP 20 / STEP 32 windows; same regional flow season as the STEP 32
descriptive KE-2011 evidence (disclosed; excluded IDs and starts; STEP 32 informed no parameter or
source); forcing-field overlap; parameter leakage; result-dependent selection; and the author's
knowledge of frozen inventory counts (disclosed, see Section 6).

## 4. Validation cohort selection rule (deterministic, executed later by a tool)

| Element | Rule |
|---|---|
| Basis | STEP 35/36 chronological accumulation rule applied unchanged to the validation domain |
| Calendar period | t0 = last primary window end (2010-10-19T12:00:00Z) + 30 days = **2010-11-18T12:00:00Z**; t1 = 2015-12-31T21:00:00Z (STEP 35 period lock / HYCOM expt_53.X coverage) |
| Region | non-GS registered boxes {KE, BM, AG}; rank by N_r = number of STEP 35 `windowEligible == true` rows with start ≥ t0 (frozen file at SHA `d01d06a3…`), descending; alphabetical tie-break; **rank 1 only**; no fallback |
| Eligibility | STEP 16 E1–E5 + A1–A3 verbatim; window eligible iff eligibleCount ≥ 8 AND A1–A3 PASS AND frame coverage complete AND not near a prior window AND after calibration cutoff |
| Ordering | starts ascending (12:00 UTC daily); no ties |
| Separation | start ≥ 2010-11-18T12Z; selected starts in the region ≥ 72 h apart; region box disjoint from the GS box |
| Accumulation | a window is SELECTED iff eligible and contributes ≥ 1 ID absent from the 88-ID exclusion list and from the accumulated cohort |
| First prefix | shortest chronological prefix of SELECTED windows with ≥ 6 windows AND ≥ 20 unique drifters; maximum 12 windows |
| If not formed | VALIDATION_BLOCKED (INSUFFICIENT_INDEPENDENT_COHORT); no period extension, region change, threshold relaxation or manual addition |
| Manual choice | forbidden; no forcing, model or performance input; no validation forcing download before the cohort manifest is locked |

## 5. Temporal independence

Design: later calendar period than every primary window. The walk starts at 2010-11-18T12:00:00Z and
proceeds chronologically; no year is preferred or skipped; the first prefix satisfying the minimum
defines the period actually used. No year was chosen for expected performance.

## 6. Geographic independence

Design type **C: different-region / later-time**. Same-region (GS) windows are excluded from the
validation frame entirely, so interpretations A and B are not mixed. All four STEP 16 boxes were
preregistered as western-boundary-current / strong-advection regions with identical eligibility and
advection criteria, which keeps the ocean dynamics comparable.

Disclosure: while writing the region rule the author read the per-region/year counts of STEP 35
window-eligible windows (frozen metadata; dates and frame completeness only; no model output). The
rule is therefore stated as an objective count function and its expected outcome is recorded in the
protocol (expected region **KE**: 26 eligible rows after t0, BM 3, AG 0; GS 99 excluded as the primary
region). STEP 45 must reproduce this from the frozen file and BLOCK if the tool output differs.

## 7. Sample-size gate (locked)

| Gate | Value |
|---|---|
| Minimum validation windows | 6 |
| Minimum unique drifters | 20 |
| Maximum windows | 12 |
| Minimum windows with a valid primary pair after execution | 4 |

6 / 20 replicate the STEP 36 primary minimum; 4 valid windows is the smallest cluster count for which
the window-level percentile bootstrap has more than three distinct support points per replicate. If
the cohort minimum is not met: VALIDATION_BLOCKED. If fewer than 4 valid windows after execution:
VALIDATION_INVALID (INSUFFICIENT_VALID_WINDOWS); the criterion is not evaluated and not relaxed.

## 8. Model configuration (exactly STEP 37 / STEP 39)

| Condition | Forcing |
|---|---|
| A | HYCOM_NATIVE_3H: HYCOM GOFS 3.1 GLBv0.08 expt_53.X, 3 h, 15.000 m + NCEP-R2 |
| B | HYCOM_DAILY: UTC-daily unweighted mean, label 00Z (STEP 32/39 derivation) + NCEP-R2 |
| C | GLORYS12V1 15.810070 m (linear in time at 3 h instants) + WW3 GLOB-30M CFSR Stokes × 1.0 + NCEP-R2; STEP 29 TEST-06 composite construction unchanged |

alpha 0.002; Stokes multiplier 1.0; A/B depth 15.000 m; C depth 15.810070 m; RK4; dt 300 s;
output 900 s; 72 h; horizons 24 / 48 / 72 h; bilinear/linear interpolation; STOP_AT_FIRST_CROSSING;
runtime 155995dd. No tuning, calibration, optimisation, parameter search, alternate source, depth,
Stokes multiplier or temporal representation.

## 9. Source rule

Source identities are preregistered (HYCOM expt_53.X NCSS; GLORYS12V1 `cmems_mod_glo_phy_my_0.083deg_P1D-m`
uo/vo at 15.81 m via the official Copernicus toolbox, credentials by exit code only; WW3 GLOB-30M CFSR
monthly uss files; NCEP-R2 10 m via PSL THREDDS; the STEP 15 observation file). If an exact source is
unavailable the affected branch is BLOCKED; no substitute product, version, depth, month, mirror or
reconstruction; the affected window yields NA pairs, never removed or filled.

## 10. Primary validation endpoint (identical to the primary)

delta_i = E_C,i(72 h) - E_A,i(72 h) (haversine, R = 6 371 008.8 m, km);
Delta_w = median_i(delta_i within window); **Theta_validation = median_w(Delta_w over windows with
≥ 1 valid pair)**; equal window weighting; window > drifter pair > trajectory points; NA never imputed.

## 11. Primary validation hypothesis

**H_V: Theta_validation < 0 km** (single confirmatory hypothesis). A negative observed median alone does
not establish H_V; the interval criterion must also hold.

## 12. Validation uncertainty

Window-level percentile bootstrap, identical structure to STEP 40: sampling unit = validation window;
frame = all validation windows (NA windows included); **B = 10000**; **seed = 20260944**
(separate from the primary seed 20260907, fixed now); `numpy.random.default_rng(20260944)`,
`rng.integers(0, n_windows, size=n_windows)` per replicate; a window drawn k times contributes k times;
NOT_AVAILABLE replicates counted, never redrawn; interval `numpy.quantile(..., [0.025, 0.975],
method='linear')`; no trajectory-point resampling; no independent drifter resampling for the primary
interval. A drifter-level bootstrap of the pooled median is SENSITIVITY ONLY.

## 13. Success criterion (locked before execution)

Descriptive label CANDIDATE_VALIDATION_DESCRIPTIVELY_FAVORED = STEP 30A rule on the pooled valid 72 h
validation pairs (pooled median < 0 km AND candidate lower error in ≥ 2/3 of non-tied pairs, tie 1e-6 km).

VALIDATION_SUPPORTED iff (1) label = CANDIDATE_VALIDATION_DESCRIPTIVELY_FAVORED AND (2) validation
window-level 95 % interval upper bound Q0.975 < 0 km AND (3) the sample-size gate is satisfied.
Otherwise, on a valid execution, VALIDATION_NOT_SUPPORTED. Secondary metrics never replace the primary
endpoint; the criterion is not changed after observation.

## 14. Failure states

VALIDATION_SUPPORTED · VALIDATION_NOT_SUPPORTED · VALIDATION_BLOCKED (insufficient independent cohort,
source unavailable, credentials required, provenance) · VALIDATION_INVALID (fewer than 4 valid windows,
coordinate mismatch, immutability violation, deterministic replay mismatch, exclusion violation).
BLOCKED is never reported as NOT_SUPPORTED; NOT_SUPPORTED is never reinterpreted beyond the frozen
criterion; per-window terminations are availability facts, not failure states.

## 15. No pooled-data rescue

Primary and validation results are never pooled, concatenated or jointly bootstrapped for the
confirmatory decision. Any pooled analysis requires a separate future preregistration, is exploratory
and cannot replace this validation.

## 16. Secondary metrics

24 h / 48 h C-A, B-A temporal comparison, M1–M5: SECONDARY and descriptive only; they never determine
VALIDATION_SUPPORTED; no metric is added after results are observed.

## 17. Availability / missingness

The validation report must state A/B/C availability per horizon, A/C paired counts, valid and NA windows
with reasons, OUT_OF_DOMAIN and FORCING_UNAVAILABLE terminations per window and condition, and every
candidate-only termination. Imputation, substitution, silent removal, NA-to-zero and NA-to-outcome
conversions are prohibited.

## 18. Primary–validation comparison table (to be filled in STEP 49, never combined)

| | PRIMARY (STEP 36–40) | INDEPENDENT VALIDATION (STEP 45–48) |
|---|---|---|
| cohort | STEP 36 | STEP 45 manifest |
| n windows | 9 | — |
| n drifters | 20 | — |
| valid windows | 6 | — |
| paired n | 16 | — |
| Theta | -31.331 km | Theta_validation |
| 95 % CI | [-72.0725, -11.7435] km | — |
| status | H1 SUPPORTED | H_V status |

## 19. Transportability interpretation

A. replication of direction (Theta_validation < 0 km) · B. replication of statistical support
(VALIDATION_SUPPORTED) · C. transportability (B on a different-region / later-time cohort under the
identical frozen configuration; supports reproducibility within the predefined validation domain only)
· D. operational superiority (NOT established by any outcome; separate decision, additional evidence).
Candidate C remains CANDIDATE_ONLY regardless of outcome.

## 20. Amendment procedure

After the lock commit any change requires an amendment record with field path, old value, new value,
reason, UTC timestamp, commit SHA, and whether validation data / validation results were accessed
before the amendment. Silent edits are forbidden; the validator fails on an unrecorded protocol change.

## 21. Execution order after lock

STEP 45 cohort derivation (frozen inventory only; cohort locked before any forcing access) →
STEP 46 source acquisition and data freeze → STEP 47 deterministic execution A/B/C with replay →
STEP 48 validation bootstrap (seed 20260944) and decision → STEP 49 validation report.

END OF STEP 44 REPORT
