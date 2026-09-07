# STEP 45C — AUTHORIZED VALIDATION COHORT DERIVATION

**STATUS: VALIDATION_COHORT_BLOCKED**

The locked STEP 44 cohort rule was executed in full under the STEP 45B input-scope amendment. It
exhausted every eligible candidate window and produced **4 selected windows and 14 unique drifters**,
below the preregistered minimum of 6 windows and 20 unique drifters. The rule was not relaxed.

Manifest: `docs/research/step45c-validation-cohort-manifest.json`.
Deriver: `tools/research/derive_step45c_validation_cohort.py`.
Validator: `tools/research/check_step45c_validation_cohort.py`.
Derivation hash: `b7ef0fd0476154bd3ea20f7ac248e341e58ac08751890f862c50d78849e3bc22`.

---

## 1. Source integrity gate (verified before any observation byte was read)

| Item | Expected | Result |
|---|---|---|
| STEP 15 observation aggregate, 176 files | `22c0ecffc926d04f02ff2ed57be1bd2cc76c1c9048ac2d77a30a63c3bb2c0841` | exact match |
| Coastline `ne_10m_coastline.geojson` | `6f75ae0e0de157b14946e2255eb1f5486d9a13819032e26d4610852d296788f6` | exact match |
| Source path | `data/research/step15/noaa-gdp-hourly-qc/` | matches the amendment |
| STEP 45B amendment / STEP 44 protocol / STEP 45A record / STEP 35 eligibility | frozen SHAs | all match |

## 2. Access actually performed

Fields read: **ID, time, latitude, longitude, gap, drogue_lost_date, typebuoy** — the seven authorized
fields, no others. Region: **KE only**, 44 quarterly files; no Brazil-Malvinas, Agulhas or Gulf Stream
observation content was read. Forbidden input access attempts: 0. Observation records loaded:
2 065 664 across 584 drifters.

Recorded extra interval: the frozen loader reads region KE's complete quarterly file set because the
duplicate-conflict exclusion is a frozen per-drifter eligibility component determined over the
region's full file set, exactly as STEP 15, 16, 35 and 36 did. No other region was read, and no
window outside the validation period was evaluated.

## 3. Region (not re-ranked from observations)

Kuroshio 26, Brazil-Malvinas 3, Agulhas 0, recomputed from the frozen eligibility metadata. Kuroshio
is rank 1, as preregistered. Region = **KE**.

## 4. Eligibility reproduction

For every evaluated window the frozen STEP 16 evaluation (E1–E5 and A1–A3, applied verbatim)
reproduced the frozen audit eligible count exactly. Any mismatch would have stopped the derivation.

## 5. Chronological accumulation over all 26 candidate windows

| start | status | eligible | new | cumulative |
|---|---|---|---|---|
| 2010-11-22 | NO_NEW_IDS | 8 | | |
| 2010-11-23 | NO_NEW_IDS | 8 | | |
| 2011-07-05 | NO_NEW_IDS | 20 | | |
| 2011-07-06 | NO_NEW_IDS | 19 | | |
| 2011-07-07 | NO_NEW_IDS | 19 | | |
| 2011-07-10 | NO_NEW_IDS | 18 | | |
| 2011-07-14 | NO_NEW_IDS | 16 | | |
| 2011-07-27 | NO_NEW_IDS | 15 | | |
| 2011-07-28 | NO_NEW_IDS | 15 | | |
| 2011-07-31 | NO_NEW_IDS | 16 | | |
| 2011-08-08 | NO_NEW_IDS | 12 | | |
| 2011-08-09 | NO_NEW_IDS | 12 | | |
| 2011-08-13 | NO_NEW_IDS | 12 | | |
| 2011-08-14 | NO_NEW_IDS | 11 | | |
| 2011-08-15 | NO_NEW_IDS | 9 | | |
| **2011-08-16** | **SELECTED** | 19 | 10 | 10 |
| 2011-08-18 | SKIPPED_OVERLAP | 22 | | |
| **2011-09-22** | **SELECTED** | 11 | 2 | 12 |
| 2011-09-25 | NO_NEW_IDS | 11 | | |
| **2011-09-26** | **SELECTED** | 12 | 1 | 13 |
| 2011-10-09 | NO_NEW_IDS | 15 | | |
| **2011-11-06** | **SELECTED** | 10 | 1 | 14 |
| 2011-11-09 | NO_NEW_IDS | 8 | | |
| 2011-11-10 | NO_NEW_IDS | 8 | | |
| 2011-11-11 | NO_NEW_IDS | 8 | | |
| 2011-11-12 | NO_NEW_IDS | 9 | | |

Statuses: 4 SELECTED, 21 NO_NEW_IDS, 1 SKIPPED_OVERLAP. Candidates were exhausted; the 12-window
maximum was never reached.

## 6. Why the cohort is blocked

Twenty-one candidate windows contributed no drifter identity outside the 88-ID exclusion set and the
accumulated cohort, and one was removed by the ≥ 72 h separation rule. The Kuroshio eligible
population in this period is dominated by drifters already consumed by the STEP 20 calibration and
holdout and by the STEP 32 expanded holdout, all of which remain excluded. No prefix of the
chronological sequence reaches 6 windows and 20 unique drifters.

**No prefix satisfies the gate**, so the preregistered outcome is VALIDATION_COHORT_BLOCKED.

## 7. What was NOT done

The rule was not relaxed. The period was not extended. Brazil-Malvinas and Agulhas were not added.
The 20-drifter threshold was not reduced. The separation rule was not altered. No window or drifter
was selected or removed manually. No cohort was fabricated.

## 8. Partial result (recorded, not a cohort)

The 4 windows that were selected before candidates ran out are KE-V1 2011-08-16, KE-V2 2011-09-22,
KE-V3 2011-09-26 and KE-V4 2011-11-06, carrying 14 unique drifters. This is recorded for provenance
only. It is **not** a validation cohort and must not be used as one.

## 9. Independence (verified on the partial set)

Overlap with the 20 primary drifter IDs: none. Overlap with the 88 excluded IDs: none. All window
starts are after the validation start instant. Overlap with primary window starts: none.

## 10. Determinism

The derivation was run three times, once in place and twice into separate directories. The manifests
are byte-identical apart from the creation timestamp, and the derivation hash is stable at
`b7ef0fd0476154bd3ea20f7ac248e341e58ac08751890f862c50d78849e3bc22`. No output was selected from among
differing runs.

## 11. Scientific isolation

No validation model was run, no trajectory integrated, no forcing or velocity loaded, no forecast
error or endpoint performance calculated, no bootstrap executed, and **no validation performance was
accessed or inspected**. The primary experiment records were not read or modified.

END OF STEP 45C REPORT
