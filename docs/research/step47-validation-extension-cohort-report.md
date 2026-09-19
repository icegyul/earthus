# STEP 47 — VALIDATION EXTENSION COHORT DERIVATION

**STATUS: VALIDATION_EXTENSION_COHORT_LOCKED**

The locked STEP 46 extension rule was executed over the complete non-primary domain and produced a
deterministic cohort of **6 windows and 25 unique drifters**, satisfying the preregistered gate of at
least 6 windows and at least 20 unique drifters within a maximum of 12. Nothing was relaxed, expanded
or manually selected.

Manifest: `docs/research/step47-validation-extension-cohort-manifest.json`.
Deriver: `tools/research/derive_step47_validation_extension_cohort.py`.
Validator: `tools/research/check_step47_validation_extension_cohort.py`.
Derivation hash: `9e03db68d506358e1217db25f50ade8aa314b406063fd8c309cbe6a3092e5e45`.

This is a **geographically independent** validation extension relative to the STEP 36 primary cohort.
It is **not** temporally independent of the original STEP 44 validation design: it uses the same
post-primary calendar coverage. That overlap carries no result leakage, because the original
validation attempt produced no performance quantity of any kind before it was blocked.

---

## 1. Integrity gate (verified before any observation byte was read)

| Item | Expected | Result |
|---|---|---|
| STEP 15 observation aggregate, 176 files | `22c0ecffc926d04f02ff2ed57be1bd2cc76c1c9048ac2d77a30a63c3bb2c0841` | exact match |
| Coastline | `6f75ae0e0de157b14946e2255eb1f5486d9a13819032e26d4610852d296788f6` | exact match |
| STEP 46 protocol / STEP 45C manifest / STEP 45B amendment / STEP 44 protocol / STEP 35 eligibility | frozen SHAs | all match |

## 2. Domain and recomputed counts

Domain: **KE, BM, AG**, all mandatory. GS excluded as the primary region. No ranking, no subsetting,
no quotas, no balancing, no region discarded for a small contribution.

| Region | Eligible windows recomputed | STEP 46 audit expectation | Match |
|---|---|---|---|
| KE | 26 | 26 | yes |
| BM | 3 | 3 | yes |
| AG | 0 | 0 | yes |

Total candidate windows: **29**, ordered by start then region with alphabetical tie-break.

## 3. Access performed

Fields read: **ID, time, latitude, longitude, gap, drogue_lost_date, typebuoy** — the seven authorized
fields only. Regions read: **BM and KE** (AG has no candidate window, so its observation content was
never opened). GS observation content was never read. Files read: 88. Observation records loaded:
2 746 819 (KE 584 drifters, BM 225 drifters). Forbidden input access attempts: 0.

Recorded extra interval: for each region with candidate windows the frozen loader reads that region's
complete quarterly file set, because the duplicate-conflict exclusion is a frozen per-drifter
eligibility component determined over the region's full file set, exactly as every earlier step did.

## 4. Eligibility reproduction

Every evaluated window reproduced its frozen audit eligible count exactly under the verbatim E1–E5 and
A1–A3 evaluation. Any mismatch would have stopped the derivation.

## 5. Chronological accumulation (29 candidate windows)

| region | start | status | eligible | new | cumulative |
|---|---|---|---|---|---|
| KE | 2010-11-22 | NO_NEW_IDS | 8 | | |
| KE | 2010-11-23 | NO_NEW_IDS | 8 | | |
| KE | 2011-07-05 | NO_NEW_IDS | 20 | | |
| KE | 2011-07-06 | NO_NEW_IDS | 19 | | |
| KE | 2011-07-07 | NO_NEW_IDS | 19 | | |
| KE | 2011-07-10 | NO_NEW_IDS | 18 | | |
| KE | 2011-07-14 | NO_NEW_IDS | 16 | | |
| KE | 2011-07-27 | NO_NEW_IDS | 15 | | |
| KE | 2011-07-28 | NO_NEW_IDS | 15 | | |
| KE | 2011-07-31 | NO_NEW_IDS | 16 | | |
| KE | 2011-08-08 | NO_NEW_IDS | 12 | | |
| KE | 2011-08-09 | NO_NEW_IDS | 12 | | |
| KE | 2011-08-13 | NO_NEW_IDS | 12 | | |
| KE | 2011-08-14 | NO_NEW_IDS | 11 | | |
| KE | 2011-08-15 | NO_NEW_IDS | 9 | | |
| **KE** | **2011-08-16** | **SELECTED (KE-X1)** | 19 | 10 | 10 |
| KE | 2011-08-18 | SKIPPED_OVERLAP | 22 | | |
| **KE** | **2011-09-22** | **SELECTED (KE-X2)** | 11 | 2 | 12 |
| KE | 2011-09-25 | NO_NEW_IDS | 11 | | |
| **KE** | **2011-09-26** | **SELECTED (KE-X3)** | 12 | 1 | 13 |
| KE | 2011-10-09 | NO_NEW_IDS | 15 | | |
| **KE** | **2011-11-06** | **SELECTED (KE-X4)** | 10 | 1 | 14 |
| KE | 2011-11-09 | NO_NEW_IDS | 8 | | |
| KE | 2011-11-10 | NO_NEW_IDS | 8 | | |
| KE | 2011-11-11 | NO_NEW_IDS | 8 | | |
| KE | 2011-11-12 | NO_NEW_IDS | 9 | | |
| **BM** | **2013-12-19** | **SELECTED (BM-X5)** | 9 | 9 | 23 |
| BM | 2013-12-20 | SKIPPED_OVERLAP | 9 | | |
| **BM** | **2014-01-06** | **SELECTED (BM-X6)** | 10 | 2 | 25 |

Statuses: 6 SELECTED, 21 NO_NEW_IDS, 2 SKIPPED_OVERLAP. The first prefix satisfying the gate is
reached at window 6, so the walk stopped there.

## 6. Locked extension cohort

| rank | window | region | start | end | eligible | new | cumulative |
|---|---|---|---|---|---|---|---|
| 1 | KE-X1 | KE | 2011-08-16T12:00:00Z | 2011-08-19T12:00:00Z | 19 | 10 | 10 |
| 2 | KE-X2 | KE | 2011-09-22T12:00:00Z | 2011-09-25T12:00:00Z | 11 | 2 | 12 |
| 3 | KE-X3 | KE | 2011-09-26T12:00:00Z | 2011-09-29T12:00:00Z | 12 | 1 | 13 |
| 4 | KE-X4 | KE | 2011-11-06T12:00:00Z | 2011-11-09T12:00:00Z | 10 | 1 | 14 |
| 5 | BM-X5 | BM | 2013-12-19T12:00:00Z | 2013-12-22T12:00:00Z | 9 | 9 | 23 |
| 6 | BM-X6 | BM | 2014-01-06T12:00:00Z | 2014-01-09T12:00:00Z | 10 | 2 | 25 |

**25 unique drifters**: 37040, 37042, 37090, 37124, 37267, 37644, 37647, 37650, 37657, 38625, 38629,
38630, 39123, 40083 (Kuroshio) and 123311, 123329, 123330, 123331, 123332, 123334, 123335, 123336,
123338, 123339, 123341 (Brazil-Malvinas).

The cohort sits exactly at the structural ceiling of 6 windows that STEP 46 disclosed in advance:
Kuroshio contributed its 4 windows and Brazil-Malvinas the maximum 2 its separation rule permits, with
2013-12-20 removed because it falls 24 hours after 2013-12-19. The gate was met because
Brazil-Malvinas supplied 11 new drifters against the 6 that were needed.

## 7. Independence

Overlap with the 20 primary drifters: none. Overlap with the 88 excluded identities: none. Overlap
with primary window starts: none. All selected windows start at or after the extension start instant.
GS observation content never read.

## 8. Gate

Minimum 6 windows and minimum 20 unique drifters within a maximum of 12: **satisfied** with 6 and 25.
The separate requirement of at least 4 windows with a valid pair after execution is **not** evaluated
here, because no trajectory is run in this step.

## 9. Determinism

Three runs, one in place and two into separate directories. Candidate windows, per-window identities,
new-identity sets, cumulative counts, the selected prefix, the final identities and the derivation hash
are identical across all three; only the creation timestamp differs. No output was chosen from among
differing runs.

## 10. Scientific isolation

No validation model, trajectory, forcing, velocity, endpoint, bootstrap or performance quantity was
accessed, calculated or produced. **Validation performance accessed: NO.**

## 11. Standing position unchanged

The original STEP 44 validation remains **VALIDATION_COHORT_BLOCKED**, and its 14-drifter partial set
remains an intermediate derivation result rather than a cohort. The primary experiment is unchanged:
Theta -31.331 km, 95 % interval [-72.0725, -11.7435] km, H1 SUPPORTED, candidate CANDIDATE_ONLY,
operational promotion NO. This extension cohort is a separate experiment whose eventual outcome cannot
modify the primary result or erase the original block.

END OF STEP 47 REPORT
