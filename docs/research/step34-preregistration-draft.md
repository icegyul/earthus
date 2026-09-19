# STEP 34 — Extension preregistration draft (design only; nothing executed)

Rule id `validation-path-decision-step34`. HEAD 3ebabfe3; STEP 32 Phase A lock ee64354d; STEP 32 Phase B preregistration d7434d28 (file-level); STEP 33 protocol 9327ea49. STEP 32 (PARTIAL) and STEP 33 (SOURCE_ABSENT) are frozen and unchanged. This document drafts the next preregistration; it is not itself a lock of a new experiment and no trajectory, comparison, sweep, calibration, selection or optimisation was run.

## 1. Frozen state carried forward

- STEP 32: 8 registered windows / 32 drifters; evaluable 3 windows (KE-X1, KE-X2, KE-X3) / 10 drifters; blocked 5 windows / 22 drifters; Phase A minimum 6 windows / 20 drifters NOT MET. Temporal test: NO_CLEAR_TEMPORAL_DIFFERENCE. Candidate vs baseline (new holdout): NO_CLEAR_DESCRIPTIVE_DIFFERENCE. Candidate GLORYS12V1 15.810070 m + WW3 Stokes x 1.0 + NCEP-R2 alpha 0.002: CANDIDATE_ONLY. Baseline HYCOM GOFS 3.1 15.000 m + NCEP-R2 alpha 0.002: FROZEN_REFERENCE_BASELINE.
- STEP 33: 5/5 blocked windows investigated; 8 window-frame pairs over 5 distinct timestamps all SOURCE_ABSENT; 0 AVAILABLE; 0 ACQUISITION_ERROR; 0 windows recoverable.

## 2. Permanent source-absence record

| window | t0 | missing registered frames | server answer to the exact query | classification |
|---|---|---|---|---|
| KE-X4 | 2011-06-10T12:00:00Z | 2011-06-09T12:00:00Z | nearest preceding frame returned (2011-06-09T09:00:00Z) | SOURCE_ABSENT |
| KE-X5 | 2011-06-13T12:00:00Z | 2011-06-15T00:00:00Z | nearest preceding frame returned (2011-06-14T21:00:00Z) | SOURCE_ABSENT |
| KE-X6 | 2011-06-16T12:00:00Z | 2011-06-15T00:00:00Z, 2011-06-20T12:00:00Z | nearest preceding frame returned (2011-06-14T21:00:00Z, 2011-06-20T09:00:00Z) | SOURCE_ABSENT |
| KE-X7 | 2011-06-19T12:00:00Z | 2011-06-20T12:00:00Z, 2011-06-22T12:00:00Z | nearest preceding frame returned (2011-06-20T09:00:00Z, 2011-06-22T09:00:00Z) | SOURCE_ABSENT |
| KE-X8 | 2011-06-22T12:00:00Z | 2011-06-22T12:00:00Z, 2011-06-26T18:00:00Z | nearest preceding frame returned (2011-06-22T09:00:00Z, 2011-06-26T15:00:00Z) | SOURCE_ABSENT |

Rule: a frame returned for an exact-timestamp query counts as the requested frame only if its time label equals the requested timestamp. Example: requested 2011-06-09T12:00:00Z, returned 2011-06-09T09:00:00Z, conclusion 2011-06-09T12:00:00Z = SOURCE_ABSENT. The five blocked windows stay WINDOW_BLOCKED; they are not replaced, deleted, interpolated or substituted, and no drifter is added to the existing holdout.

## 3. Primary rules for any extension

1. STEP 32 / STEP 33 data are never modified or removed. 2. The 3 evaluable windows are never discarded. 3. The 5 blocked windows are never replaced by another source. 4. No drifter is added to the existing holdout. 5. The 6/8 minimum is never met by substitution. 6. The 3-window / 10-drifter result is never reported as meeting the Phase A minimum. 7. No period, cohort or option is chosen from performance.

## 4. Options assessed on the five registered criteria (no performance value used)

OPTION A — same HYCOM source, different preregistered observation period: period locked first; HYCOM frame inventory checked for that period; cohort selected only afterwards under STEP 16 eligibility and STEP 32 disjointness; never chosen from performance.

OPTION B — same source family, separate preregistered cohort with complete temporal coverage: the frame-inventory gate is written into the eligibility rule so that no selected window can be source-blocked; cohort never changed after results are seen; regions may extend to the other STEP 16 boxes (GS, BM) under the same rules.

OPTION C — keep the 2011 cohort; preserve the 3-window / 10-drifter result as descriptive evidence only: Phase A minimum not met; no final model selection; no candidate promotion.

OPTION D — separate independent validation dataset: no mixing with the STEP 32 holdout or calibration; source identity, acquisition rule and evaluation rule preregistered; comparability of observation type to be established first.

Criteria-based recommendation (not performance-based): B, with A as its period-locking mechanism and C retained as the permanent descriptive record; D only if B cannot reach the minimum inside HYCOM expt_53.X coverage (1994-01..2015-12, gaps documented at 2010-08-18T12Z and the five 2011-06 timestamps).

## 5. Draft preregistration for the next Phase A (to be locked in its own step)

Objective: expanded independent validation of the frozen candidate against the frozen baseline, and the temporal representation test, on a cohort whose source coverage is complete by construction.

Source binding: unchanged — HYCOM GOFS 3.1 GLBv0.08 expt_53.X 15 m 3-hourly (NCSS, STEP 17 mechanism), NCEP-DOE R2 10 m 6 h, GLORYS12V1 15.810070 m daily (authorized access), WW3 GLOB-30M CFSR Stokes (DATA-06 identity); no alternative product.

Cohort rule (calendar/data only, in this order): (1) lock the candidate observation periods (STEP 16 eligible-window years per region: AG-2015: 17, BM-2013: 14, BM-2014: 17, GS-2010: 77, GS-2011: 153, GS-2012: 22, GS-2013: 22, GS-2014: 1, KE-2010: 19, KE-2011: 96); (2) build a HYCOM frame inventory for every UTC day of the locked periods from NCSS time-axis metadata (no velocity data downloaded; no performance file); (3) eligibility = STEP 16 E1-E5 + A1-A3 verbatim AND all 8 frames present for every UTC day of [t0 - 1 d, t0 + 72 h + 1 d]; (4) exclusion = every STEP 20 calibration/holdout ID and window, every STEP 32 registered ID (all 32) and window start (+-72 h); (5) chronological accumulation as STEP 16/20/32; minimum 6 windows / 20 drifters; target 8; stop at target or exhaustion; no balancing; (6) lock the cohort before any forcing is downloaded for it.

Execution order and evaluation: identical to STEP 32 Phase B (B1 acquisition -> B2 gate -> B3 daily -> B4 temporal -> B5 replay -> B6 candidate -> B7 evaluation); metrics M3 24/48/72 h paired, M1/M2/M4/M5 secondary; labels under the locked STEP 30A rule (validation) and the STEP 32 temporal rule; strata CALIBRATION (frozen STEP 30A), NEW_HOLDOUT (this cohort), with the 2011 cohort reported separately as descriptive evidence (Option C); drifters within a window clustered; no independence assumption; no outlier handling; no parameter, forcing, model or candidate selection; a separate final model-selection decision follows.

Prohibitions carried forward: frame interpolation / substitution / reconstruction / duplication / skipping; window replacement or deletion; drifter addition or removal; alpha, depth, Stokes coefficient, timestep, RK4, interpolation or release changes; alternative ocean product; reading performance files during derivation or acquisition; automatic commit.

## 6. Status

STEP 34 status PREREGISTRATION_DESIGN_COMPLETE. Model selected NO. Parameter selected NO. Forcing selected NO. Blocked windows replaced NO. Existing holdout modified NO. Scientific experiment executed NO. Forbidden input access 0. Automatic commit NO.
