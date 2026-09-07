# STEP 45A — VALIDATION COHORT INPUT RECOVERY

**STATUS: VALIDATION_COHORT_INPUT_MISSING**

Metadata / provenance recovery only. No validation data, observation file, forcing, velocity,
trajectory or result file was accessed. No model was run, no bootstrap was run, no performance was
calculated, and no validation cohort was derived or fabricated.

Record: `docs/research/step45a-validation-input-recovery.json`.
Validator: `tools/research/check_step45a_validation_input_recovery.py`.

---

## 1. Question

Do the exact per-window **eligible drifter identities** required by the locked STEP 44 cohort rule
already exist inside frozen STEP 35 / STEP 36 research metadata, so that the validation cohort can be
derived without touching any scientific experiment data?

The rule needs, for each candidate validation window in chronological order, the set of eligible
drifter IDs, in order to test "contributes at least one ID absent from the 88-ID exclusion list and
from the accumulated cohort" and to reach the 20-unique-drifter minimum. A record that gives only
`window -> auditEligibleCount` is insufficient and is rejected.

## 2. Provenance verified before reading

| Item | Value |
|---|---|
| STEP 35 eligibility file | `docs/research/step35-window-eligibility.json` |
| SHA-256 recorded in the STEP 36 manifest | `d01d06a3430def6ea77a814bb4379a9b45ca058713fa0901c9c30b035fbb635b` |
| SHA-256 computed now | identical |
| State | untracked, unmodified, not staged, not committed |

STEP 44 protocol identity `6a2e2f04f7948e4f…` unchanged; STEP 36, 41, 42, 43, 44 and runtime
`155995dd` all verified as ancestors.

## 3. Sources probed (12, all research metadata)

Every candidate is either a STEP 35 / STEP 36 artefact or an artefact bound by SHA-256 in the STEP 35
protocol `inputs` block. All were present at their exact expected SHA. No scientific data directory
was searched.

| Source | Carries per-window identities | Usable for validation windows |
|---|---|---|
| `docs/research/step35-window-eligibility.json` | no — count-only | no (rejected: aggregate counts) |
| `docs/research/step35-cohort-manifest.json` | yes, 8 windows / 18 IDs | no |
| `docs/research/step36-cohort-extension-manifest.json` | yes, 9 windows / 20 IDs | no |
| `docs/research/step16-selection-audit.json` | yes, 10 selected windows | no |
| `docs/research/step20-holdout-derivation.json` | yes (selected windows) | no |
| `docs/research/step32-holdout-derivation.json` | yes, 8 KE-2011 selected windows | no |
| `docs/research/step35-frame-inventory.json` | no — frames only | no |
| `docs/research/step35-period-lock.json`, `step35-phase-a-protocol.json`, `step36-*-protocol.json`, `step36-*-status.json`, `cohort-step16.json` | no per-window identities | no |

## 4. Why no source is usable

**Coverage.** Every identity-carrying record lists IDs only for windows that a prior selection rule had
already **selected**. Every such window starts before the validation start instant
2010-11-18T12:00:00Z. Zero identity-carrying windows are Kuroshio windows at or after that instant.
The primary-line manifests cover the nine Gulf Stream windows 2010-07-27 … 2010-10-16 only.

**Semantics.** The available fields are `drifterIds` / `newDrifterIds`, meaning the IDs that were *new
to that run's accumulated cohort at selection time*, not the full per-window **eligible** set that the
STEP 44 accumulation rule requires.

**The candidate windows specifically.** All 15 candidate Kuroshio validation windows appear in the
STEP 32 derivation's `candidateDates` list, but that list carries dates only, with no identities
attached. None of them coincides with a STEP 32 *selected* window, so even the excluded STEP 32
identity records do not cover them.

**STEP 35 eligibility is count-only.** Its per-window fields are region, date, start, end,
`auditEligibleCount`, `tests`, `requiredUtcDays`, `missingFrames`, `windowEligible`, `accumulation`.
There is no identity field anywhere in the file.

## 5. Multiple sources: classification

Classification **B_COMPLEMENTARY_DETERMINISTIC**, not conflicting. The STEP 36 cohort-extension
manifest is the deterministic extension of the STEP 35 cohort manifest: its first eight windows are
identical in start, region and `drifterIds`, and it adds exactly one window (2010-10-16T12:00:00Z,
IDs 92919 and 92906). No source contradicts another, so no STOP condition under Section 9 applies.

## 6. This is not an authorisation-only case

The STEP 35 eligibility file is untracked but was readable and was read with its SHA verified, so the
blocker is not tooling refusing access to a frozen file. The blocker is that **no authorised metadata
artefact contains the required identities**. The only artefact known to contain them is the STEP 15
observation dataset (`observationSha256` `22c0ecff…`, raw location `data/research/step15/noaa-gdp-hourly-qc/`,
not committed), which STEP 45 and STEP 45A prohibit accessing. It was **NOT accessed**.

## 7. Consequence

- Unique-drifter accumulation cannot be performed.
- The STEP 44 validation cohort cannot yet be determined; derivation **remains blocked**.
- No scientific data were accessed; **no cohort was fabricated**.
- The STEP 44 rule was not relaxed, counts were not converted into identities, and no window or
  drifter was selected manually.

Resolving this requires a decision recorded outside STEP 45A: either authorise the derivation tool to
read the frozen STEP 15 observation file (observation-only, SHA-bound, exactly as STEP 35, STEP 36 and
the locked STEP 44 rule already specify), or record a STEP 44 amendment changing the input rule. Both
paths are the user's decision and neither is taken here.

END OF STEP 45A REPORT
