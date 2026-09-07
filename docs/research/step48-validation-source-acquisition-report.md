# STEP 48 — VALIDATION EXTENSION SOURCE ACQUISITION AND DATA FREEZE

**STATUS: VALIDATION_SOURCE_ACQUISITION_PASS**

Every source required by the locked STEP 47 validation-extension cohort was acquired from its frozen
product identity and verified. Nothing was substituted, and no scientific computation was performed.

Stage separation is preserved: STEP 47 was the cohort lock, STEP 48 is the **source lock**, and
STEP 49 will be the validation execution. The validation experiment has **not** begun.

Protocol: `docs/research/step48-validation-source-acquisition-protocol.json`.
Acquisition manifest: `docs/research/step48-validation-source-acquisition-manifest.json`.
Freeze manifest: `docs/research/step48-validation-data-freeze-manifest.json`.
Inventory hash: `058dc5e72ec01f1e…`. Data location: `data/research/step48/` (gitignored, never staged).

---

## 1. Cohort consumed unchanged

The locked STEP 47 cohort was consumed exactly as frozen: 6 windows, 25 unique drifters, derivation
hash `9e03db68d506358e…`. **Cohort modified: NO.**

| window | region | start | drifters |
|---|---|---|---|
| KE-X1 | KE | 2011-08-16T12:00:00Z | 10 |
| KE-X2 | KE | 2011-09-22T12:00:00Z | 2 |
| KE-X3 | KE | 2011-09-26T12:00:00Z | 1 |
| KE-X4 | KE | 2011-11-06T12:00:00Z | 1 |
| BM-X5 | BM | 2013-12-19T12:00:00Z | 9 |
| BM-X6 | BM | 2014-01-06T12:00:00Z | 2 |

**Geometry preparation, disclosed.** The STEP 47 manifest deliberately omitted release positions and
ocean boxes under its data-minimisation rule, but the frozen acquisition architecture needs a box to
request forcing subsets. The per-window box was therefore recomputed with the identical frozen STEP 16
evaluation on the six locked windows only, keeping exactly the locked new-identity sets, and applying
the frozen STEP 36 box formula. Every window reproduced its locked identity set exactly; a difference
would have stopped the acquisition. No cohort modification is possible by construction, and no
observation field beyond the seven already authorized was used.

## 2. Source identities (no substitution)

| Source | Frozen identity |
|---|---|
| HYCOM | GOFS 3.1 GLBv0.08 **expt_53.X** reanalysis, water_u / water_v, vertCoord 15 (15.000 m), 3-hourly |
| NCEP | NCEP-DOE Reanalysis 2, 10 m u/v, 6-hourly |
| GLORYS | GLORYS12V1 **cmems_mod_glo_phy_my_0.083deg_P1D-m**, uo / vo, native 15.810070 m |
| WW3 | **WW3 GLOB-30M CFSR** hindcast, uss monthly, version 1.0, Stokes multiplier 1.0 |

Product, version, analysis system, temporal resolution, spatial resolution, depth, interpolation
source and forcing source are all unchanged from the frozen STEP 38/39 identities. **Substitution
performed: NO.**

## 3. Coverage per window (all verified)

| window | HYCOM native | day files | day frames | NCEP frames | GLORYS frames | GLORYS depth | covers box |
|---|---|---|---|---|---|---|---|
| KE-X1 | 25 / 25 | 6 / 6 | 48 / 48 | 17 | 6 | 15.81007 m | yes |
| KE-X2 | 25 / 25 | 6 / 6 | 48 / 48 | 17 | 6 | 15.81007 m | yes |
| KE-X3 | 25 / 25 | 6 / 6 | 48 / 48 | 17 | 6 | 15.81007 m | yes |
| KE-X4 | 25 / 25 | 6 / 6 | 48 / 48 | 17 | 6 | 15.81007 m | yes |
| BM-X5 | 25 / 25 | 6 / 6 | 48 / 48 | 17 | 6 | 15.81007 m | yes |
| BM-X6 | 25 / 25 | 6 / 6 | 48 / 48 | 17 | 6 | 15.81007 m | yes |

The 25-frame layout supplies condition A. The six UTC-day files supply the 48 registered frames, which
are the material required to reproduce HYCOM_DAILY; **no daily field was derived in this step**. The
wind covers t0 minus 12 hours through t0 plus 84 hours at 6-hourly cadence. GLORYS covers t0 minus one
day through the window end plus one day at the native level.

Coverage was verified from source metadata. **No trajectory was run to discover missing coverage.**

## 4. Coordinate convention

Every window passed the frozen rule: the reader axis covers the window box in the box's own
**-180..180** convention, reader convention equals box convention, and **transform applied: false**.
No coordinate was silently transformed. An unresolvable mismatch would have produced
VALIDATION_SOURCE_BLOCKED.

## 5. Wave source

| month | status | bytes |
|---|---|---|
| 2011-08 | ok | 76 955 488 |
| 2011-09 | ok | 74 447 327 |
| 2011-11 | ok | 73 758 984 |
| 2013-12 | ok | 226 881 200 |
| 2014-01 | ok | 226 881 200 |

These are exactly the months the six windows touch. Fetched directly; no shared acquisition log was
appended.

## 6. Freeze and integrity

101 artefacts, 728 642 548 bytes: **83 ORIGINAL_SOURCE** and **18 DERIVED_PREPARATION**. Originals are
immutable and were never rewritten; the fetch refuses to overwrite an existing file. Derived files are
the runtime datasets built by the frozen readers and each carries its own SHA-256.

All checks passed: checksum, byte size, readability, required frames present, no unexpected missing
frames, spatial coverage, coordinate convention, source identity and deterministic inventory.
**Integrity failures: none.**

## 7. Credentials

Copernicus access was confirmed by exit code only. Credentials were never read, printed, logged or
stored, and no credential material appears in any manifest.

## 8. What did not happen

No trajectory integration, model execution, endpoint calculation, error calculation, bootstrap,
hypothesis test, performance comparison, parameter tuning or operational evaluation. No performance or
result file was opened; the guard recorded zero forbidden input accesses.

**PRIMARY_RESULT_MODIFIED = FALSE.** The primary experiment stands unchanged at Theta -31.331 km,
95 % interval [-72.0725, -11.7435] km, H1 SUPPORTED, candidate CANDIDATE_ONLY, operational promotion
NO. The original STEP 44 validation remains blocked, and this extension remains a separate experiment.

## 9. Note on tool corrections during this step

Two defects in the STEP 48 acquisition tool were found and fixed before the passing run: the reader
was called with bare paths instead of the (path, source URI) pairs it requires, and the coordinate
check compared raw axes rather than the normalized grid with the frozen tolerance. Both were tool
defects, not source problems; every download had already succeeded. No source, threshold or rule was
changed, and the corrected run reused the already-downloaded bytes.

END OF STEP 48 REPORT
