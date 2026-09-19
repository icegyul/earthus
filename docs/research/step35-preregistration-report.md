# STEP 35 Phase A — Preregistration report

Rule id `expanded-validation-preregistration-step35`. HEAD 3ebabfe3; STEP 32 Phase A lock ee64354d. Frozen: STEP 32 = FROZEN (PARTIAL), STEP 33 = SOURCE_ABSENT, STEP 34 = PREREGISTRATION_DESIGN_COMPLETE (38 frozen files SHA-verified). No velocity, forcing or trajectory was downloaded or computed; no comparison, calibration or selection was performed.

## 1. Period lock (before any availability check)

t0 2010-01-01T00:00:00Z .. t1 2015-12-31T21:00:00Z (UTC), locked 2026-09-07T01:01:18Z. Source HYCOM GOFS 3.1 GLBv0.08 expt_53.X, experiment expt_53.X, endpoint https://ncss.hycom.org/thredds (NCSS dataset.xml + OPeNDAP time axis for the inventory; NCSS grid subset for Phase B). Rationale: The least selective admissible period: the union of every calendar year in which the STEP 16 selection audit contains eligible windows in any registered region (KE 2010-2011, GS 2010-2014, BM 2013-2014, AG 2015), clipped to HYCOM expt_53.X coverage (ends 2015-12). No sub-period is preferred; availability is examined only after this lock and the period is never changed afterwards. Protocol hash 7c3cc487568c.

## 2. HYCOM time-axis inventory (metadata only; started 2026-09-07T01:01:19Z)

| year | frames on axis | expected (days x 8) | missing | NCSS = OPeNDAP |
|---|---|---|---|---|
| 2010 | 2888 | 2920 | 32 | True |
| 2011 | 2875 | 2920 | 45 | True |
| 2012 | 2883 | 2928 | 45 | True |
| 2013 | 2884 | 2920 | 36 | True |
| 2014 | 2857 | 2920 | 63 | True |
| 2015 | 2861 | 2920 | 59 | True |

Days in period 2191; complete 1939; incomplete 252; missing frames 280. Known gaps confirmed absent: 2010-08-18T12:00:00Z, 2011-06-09T12:00:00Z, 2011-06-15T00:00:00Z, 2011-06-20T12:00:00Z, 2011-06-22T12:00:00Z, 2011-06-26T18:00:00Z. No request named water_u or water_v.

## 3. Window eligibility

STEP 16 audit eligible rows in the four regions: 438. Window-eligible (period, calibration cutoff, prior-window separation, frame coverage complete): 178. Failures: inside period 0, calibration cutoff 26, near prior window 36, frame coverage incomplete 240.

## 4. Exclusion

68 prior drifter IDs excluded (23 STEP 20 calibration, 13 STEP 20 holdout incl. KE-H2, 32 STEP 32 registered incl. the 22 blocked); prior window starts excluded (+-72 h): 15.

## 5. Chronological accumulation and cohort

| rank | window | region | start | end | new drifters | cumulative | eligible at t0 | drifter IDs |
|---|---|---|---|---|---|---|---|---|
| 1 | GS-Y1 | GS | 2010-07-27T12:00:00Z | 2010-07-30T12:00:00Z | 8 | 8 | 8 | 92918, 92920, 89822, 92885, 92917, 98904, 98942, 98944 |
| 2 | GS-Y2 | GS | 2010-07-30T12:00:00Z | 2010-08-02T12:00:00Z | 2 | 10 | 10 | 92872, 98941 |
| 3 | GS-Y3 | GS | 2010-08-02T12:00:00Z | 2010-08-05T12:00:00Z | 1 | 11 | 11 | 93015 |
| 4 | GS-Y4 | GS | 2010-08-05T12:00:00Z | 2010-08-08T12:00:00Z | 1 | 12 | 12 | 92863 |
| 5 | GS-Y5 | GS | 2010-08-08T12:00:00Z | 2010-08-11T12:00:00Z | 1 | 13 | 12 | 98936 |
| 6 | GS-Y6 | GS | 2010-08-22T12:00:00Z | 2010-08-25T12:00:00Z | 3 | 16 | 15 | 81994, 88538, 90466 |
| 7 | GS-Y7 | GS | 2010-08-28T12:00:00Z | 2010-08-31T12:00:00Z | 1 | 17 | 12 | 92869 |
| 8 | GS-Y8 | GS | 2010-09-16T12:00:00Z | 2010-09-19T12:00:00Z | 1 | 18 | 9 | 88532 |

Selected windows 8 ({'KE': 0, 'GS': 8, 'BM': 0, 'AG': 0}); selected drifters 18; accumulation skips {'SKIPPED_OVERLAP': 14, 'NO_NEW_IDS': 18}. PRIMARY COHORT = first None windows (), 18 drifters. Minimum 6 windows / 20 drifters: FAIL. Selection rule hash 2570a48f8b33; derivation hash f9f3b0ac176c.

## 6. Gates

PERIOD_LOCK = PASS
FRAME_INVENTORY = PASS
ELIGIBLE_WINDOWS = 178
SELECTED_WINDOWS = 8
SELECTED_DRIFTERS = 18
MINIMUM_6_20 = FAIL
COHORT_LOCK = FAIL
FORBIDDEN_INPUT_ACCESS = 0
SCIENTIFIC_EXPERIMENT_EXECUTED = NO
MODEL_SELECTED = NO
PARAMETER_SELECTED = NO
FORCING_SELECTED = NO
AUTOMATIC_COMMIT = NO

STATUS: PREREGISTRATION_BLOCKED

Phase B (acquisition of water_u/water_v for the locked cohort, quality gate, daily fields, temporal test, replay, candidate vs baseline, evaluation) is NOT started here and requires its own instruction. The STEP 32 2011 cohort stays a separate, permanently preserved descriptive record and is never merged with this cohort.
