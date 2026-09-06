# STEP 20 — B-5 NUMERICAL EQUIVALENCE REVISION (PREREGISTRATION)

Status: PREREGISTRATION LOCKED · created 2026-09-06T07:55:00Z · base commit 869bc664
Revision ID: **step20-b5-numerical-equivalence-revision**
Revision ancestry: STEP 20 (155995dd) → selected-alpha lock (73fafffb) → B-3 forcing resolution (9113e8b5) → B-4 segmentation gate record (869bc664) → **B-5 numerical equivalence revision (this)**. This revision does not delete, modify or supersede STEP 20, B-3 or the B-4 gate record; it adds the criterion under which the B-3 §3.5 gate is judged when it is re-executed in Phase B-6.

Immutable ancestry (변경 금지, 재검증됨): STEP 17 551668ef · STEP 18 d505cc5e (BLOCKED, preserved) · STEP 18b 5b9567e5 · STEP 19 5f27dc2d · STEP 20 155995dd · selected alpha 73fafffb · B-3 9113e8b5 · gate tool 96abb29d · B-4 gate 869bc664.

## 1. Reason (fact, unchanged from the B-4 record)
B-4 segmentation gate failed because alpha=0.002 segmented execution differed from the single-reader reference at the float64 last-bit level. Observed maximum: 5.684e-14 degrees longitude.
B-4 record (docs/research/step20-b4-segmentation-gate.json, SHA 9e3d3dd9e98287a3a0d06a8a8fe190d5189f595cf6b81055d6e41d30e2aaed02, commit 869bc664), preserved as is:
- alpha=0: bitwise identical — PASS (result array aa6987ed… reproduced; trajectories list identical; CSV identical).
- alpha=0.002: bitwise identical — FAIL. 519 / 2312 samples differ; differences occur only after 2010-05-13T00:00Z (the t0+36h split); maximum |Δlon| = 5.684e-14 degrees, |Δlat| = 0 degrees; CSV (6 decimals) bitwise equal; timestamps identical; particle ordering identical; statuses identical; 8/8 particles continued at the split.
- Endpoint diagnostic recomputed from the B-4 record: max haversine separation at 24 h = 0 m, 48 h = 5.42e-9 m, 72 h = 1.41e-9 m.
- Diagnostic hypothesis (not a scientific conclusion): the runtime expresses the wind time axis relative to the current-dataset origin, which is t0 for the single dataset and t0+24h for chunk B; the wind time interpolation inside OceanParcels then rounds differently in the last bit. Only the wind-active case (alpha > 0) is affected.

## 2. Resolution (LOCKED)
Use a preregistered **numerical equivalence criterion for implementation-level trajectory reproduction** instead of bitwise equality alone:
- Structural fields: **EXACT**.
- Position: **ABSOLUTE TOLERANCE ≤ 1e-12 degrees** per coordinate.
- No runtime modification. No forcing modification. No alpha modification. No cohort modification.

Disclosure on timing: the tolerance value is fixed here after the B-4 observation (5.684e-14°) existed and is therefore informed by it; it is locked in this revision before the gate is re-executed and before any holdout run, and it cannot be changed afterwards. Its magnitude is set by representation, not by the observed value: 1e-12° ≈ 1.1e-7 m, about 10⁴ times the observed difference, 10⁶ times below the 6-decimal CSV output resolution (1e-6°) and 10⁹ times below the STEP 19/20 tie tolerance (1e-6 km). The alpha=0 case remains bitwise identical and is still required to be so.

## 3. LEVEL 1 — STRUCTURAL EQUIVALENCE (exact equality; any difference → FAIL)
timestamps · particle IDs · particle ordering · sample count per particle · output ordering · status of every sample and finalStatus · release coordinates (segment-1 release = single-run release; segment-2 release = segment-1 end sample, exact) · landMask (chunk A = chunk B = single-reader union mask, exact) · forcing frame identity (chunk frames = the single-reader frames, same timestamps) · forcing values (every chunk frame bitwise equal to the single-reader frame; B-3 evidence, re-verified) · chunk overlap values (8 frames bitwise equal).

## 4. LEVEL 2 — POSITIONAL NUMERICAL EQUIVALENCE (LOCKED)
For every sample of every particle: |lon_segmented − lon_reference| ≤ **1e-12 deg** AND |lat_segmented − lat_reference| ≤ **1e-12 deg**. Any sample outside → FAIL. This tolerance is an implementation-equivalence criterion only; it is **not** a scientific metric and no tolerance is applied anywhere in the M3 evaluation (STEP 20 §6–§8 rules unchanged: exact UTC matching, haversine R = 6371008.8 m, tie |delta| ≤ 1e-6 km).

## 5. ADDITIONAL GATE — ENDPOINT IMPACT (diagnostic, recorded, LOCKED threshold)
For each particle, at 24 h / 48 h / 72 h: Δlon, Δlat and haversine separation between segmented and reference positions. Record max endpoint Δlon, max endpoint Δlat, max endpoint haversine separation. Condition J: max endpoint separation at every horizon ≤ **1e-6 km (1 mm, the preregistered tie tolerance)**, i.e. numerically negligible relative to the scientific evaluation scale (reported at 0.001 km). These values are a segmentation implementation diagnostic; they are never used to change alpha or to interpret holdout results.

## 6. REQUIRED GATE CONDITIONS — SEGMENTATION_EQUIVALENCE_PASS (all of A–J, for alpha = 0 AND alpha = 0.002 on KE-1)
A timestamps exact · B particle IDs exact · C ordering exact · D status exact · E forcing values exact · F landMask exact · G all position differences ≤ 1e-12 degrees · H no missing samples · I no extra samples · J 24/48/72 h endpoint separation ≤ 1e-6 km. Additionally alpha = 0 must remain bitwise identical (result-array digest equal), as already observed. Any condition failing → SEGMENTATION_EQUIVALENCE_FAIL → HOLDOUT_BLOCKED_SEGMENTATION (KE-H1 not run); no fallback, no further tolerance revision.

## 7. Anti-leakage (LOCKED)
The 1e-12° tolerance and the 1e-6 km endpoint threshold are fixed here, before the gate is re-executed (B-6) and before any holdout run; after LOCK they are not changed. The gate is re-executed on calibration KE-1 only (STEP 17 forcing); it never reads holdout trajectories. Gate diagnostics (Δ values) are not used for alpha selection or holdout interpretation.

## 8. What stays untouched (LOCKED)
Runtime source (netcdf_reader.py, datasets.py, models.py, models_v2.py, wind.py, OceanParcels 3.1.4, MAX_VALUES) unchanged — no wind time-origin change, no floating-point mode, compiler or precision change. Forcing unchanged (STEP 17 files; B-2 R1 raw files; B-3 chunks). Timesteps 300 s / 900 s unchanged. Alpha primary 0.002 / baseline 0 locked, no reselection, no other candidate. Cohort unchanged: holdout KE-H1 n=5 NOT RUN, KE-H3 n=7 NOT RUN, KE-H2 n=1 FORCING_UNAVAILABLE (missing source frame 2010-08-18T12:00:00Z); 12 evaluable drifters, 0 evaluated; AG HOLDOUT_UNAVAILABLE. B-3 §3 chunk definition (A = day1+day2, B = day2+day3+day4, split t0+36h, union landMask) unchanged.

## 9. Phase B-6 order (LOCKED, separate instruction only)
B-6.1 re-execute the KE-1 gate (alpha 0 and 0.002) and judge it by §3–§6 → B-6.2 if PASS: holdout runs KE-H1 segmented × {0.002, 0} and KE-H3 single × {0.002, 0} (4 runs, exactly once, replay per segment/run; KE-H2 not modeled) → B-6.3 evaluation on n = 12 per STEP 20 §8–§12 (no positional tolerance in M3).

## 10. Artifacts
docs/research/step20-b5-numerical-equivalence-protocol.md (this) · docs/research/step20-b5-numerical-equivalence-preregistration.json · docs/research/step20-b5-numerical-equivalence-selection-rule.json · tools/research/check_step20_b5_numerical_equivalence.py. Existing files unmodified.

## 11. Phase B-5 counters
Model runs 0 · holdout execution 0 · forcing downloads 0 · runtime modification NO · forcing modification NO · alpha reselection NO · cohort reselection NO · existing locked file mutation 0.

## 12. LOCK
Status PREREGISTRATION LOCKED. STOP after this revision; the holdout is not executed here.
