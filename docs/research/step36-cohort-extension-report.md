# STEP 36 — Cohort extension preregistration report

Rule id `cohort-extension-preregistration-step36`. HEAD 3ebabfe3. STEP 32 = FROZEN, STEP 33 = SOURCE_ABSENT, STEP 34 = PREREGISTRATION_DESIGN_COMPLETE, STEP 35 = PREREGISTRATION_BLOCKED (unchanged: period 2010-01-01T00Z..2015-12-31T21Z, 178 eligible windows, target 8, 8 windows / 18 drifters, MINIMUM_6_20 = FAIL). No STEP 35 file was modified; no velocity, forcing or trajectory was downloaded or computed; no comparison, calibration or selection was performed.

## 1. New accumulation rule (locked before derivation; protocol 9832f5c4ec70)

Target 8 is no longer a stopping condition. PRIMARY COHORT = first chronological prefix with selected_windows >= 6 AND unique_drifters >= 20. MAX_WINDOWS = 12 (COHORT_INSUFFICIENT if not reached within 12 selected windows; the value 12 was fixed in the protocol without any performance input). Period, frame inventory, window eligibility (178 rows), chronological order (start, region), same-region separation >= 72 h and the exclusion lists (68 prior IDs; STEP 20 and STEP 32 window starts +-72 h) are inherited from STEP 35 verbatim. Per-window drifter identities come from the identical STEP 16 function on the STEP 15 observations (observation data only), exactly as STEP 35 did.

## 2. Chronological accumulation

| rank | window | region | start | end | new drifters | cumulative | eligible at t0 | origin | drifter IDs |
|---|---|---|---|---|---|---|---|---|---|
| 1 | GS-Y1 | GS | 2010-07-27T12:00:00Z | 2010-07-30T12:00:00Z | 8 | 8 | 8 | STEP 35 | 92918, 92920, 89822, 92885, 92917, 98904, 98942, 98944 |
| 2 | GS-Y2 | GS | 2010-07-30T12:00:00Z | 2010-08-02T12:00:00Z | 2 | 10 | 10 | STEP 35 | 92872, 98941 |
| 3 | GS-Y3 | GS | 2010-08-02T12:00:00Z | 2010-08-05T12:00:00Z | 1 | 11 | 11 | STEP 35 | 93015 |
| 4 | GS-Y4 | GS | 2010-08-05T12:00:00Z | 2010-08-08T12:00:00Z | 1 | 12 | 12 | STEP 35 | 92863 |
| 5 | GS-Y5 | GS | 2010-08-08T12:00:00Z | 2010-08-11T12:00:00Z | 1 | 13 | 12 | STEP 35 | 98936 |
| 6 | GS-Y6 | GS | 2010-08-22T12:00:00Z | 2010-08-25T12:00:00Z | 3 | 16 | 15 | STEP 35 | 81994, 88538, 90466 |
| 7 | GS-Y7 | GS | 2010-08-28T12:00:00Z | 2010-08-31T12:00:00Z | 1 | 17 | 12 | STEP 35 | 92869 |
| 8 | GS-Y8 | GS | 2010-09-16T12:00:00Z | 2010-09-19T12:00:00Z | 1 | 18 | 9 | STEP 35 | 88532 |
| 9 | GS-Y9 | GS | 2010-10-16T12:00:00Z | 2010-10-19T12:00:00Z | 2 | 20 | 9 | extension | 92919, 92906 |

First eight windows identical to STEP 35: True. Skips: {'SKIPPED_OVERLAP': 14, 'NO_NEW_IDS': 20}. Selected by region: {'KE': 0, 'GS': 9, 'BM': 0, 'AG': 0}.

## 3. Gate

PRIMARY COHORT FOUND: YES — prefix 9 windows (GS-Y1, GS-Y2, GS-Y3, GS-Y4, GS-Y5, GS-Y6, GS-Y7, GS-Y8, GS-Y9), 20 unique drifters. Derivation hash 46892c3724f9; rule hash 91b752bc8df5.

NEW ACCUMULATION RULE = 6 windows AND 20 unique drifters
MAX_WINDOWS = 12
SELECTED_WINDOWS = 9
SELECTED_DRIFTERS = 20
MINIMUM_6_20 = PASS
COHORT_EXTENSION = LOCKED
FORBIDDEN_INPUT_ACCESS = 0
SCIENTIFIC_EXPERIMENT_EXECUTED = NO
MODEL_SELECTED = NO
PARAMETER_SELECTED = NO
FORCING_SELECTED = NO
STEP 35 MODIFIED = NO
AUTOMATIC_COMMIT = NO

STATUS: COHORT_EXTENSION_LOCKED

Phase B is not executed in STEP 36 and requires its own instruction and preregistration. The STEP 32 2011 cohort remains a separate, permanently preserved descriptive record.
