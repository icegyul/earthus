# STEP 20 — B-3 FORCING RESOLUTION REVISION (PREREGISTRATION)

Status: PREREGISTRATION LOCKED · created 2026-09-06T07:20:00Z · base commit 86213644
Revision ID: **step20-b3-forcing-resolution-revision**
Relation: does **not** supersede STEP 20 (155995dd). It is recorded as "STEP20-B3 FORCING RESOLUTION REVISION": it fixes, before any holdout model run, how the two forcing failures found in Phase B-2 are handled. Everything else in STEP 20 (α*, baseline, cohort, windows, metrics, selection rule, policies) stays exactly as locked.

Reason for revision: STEP 20 Phase B-2 forcing validation failure (R1 acquisition FORCING_PARTIAL, manifest 8e4c55928707cfe4c6f9c5d962cd789ebd2767737af23407ffb5cb48e60b065b, commit 86213644).
- Failure 1: KE-H1 reader capacity limitation. Resolution: deterministic chunked reading only.
- Failure 2: KE-H2 source-data missing frame. Resolution: FORCING_UNAVAILABLE. No interpolation or substitution.
- KE-H3: FORCING_AVAILABLE.
- Alpha: 0.002 LOCKED. Baseline: 0 LOCKED. No alpha reselection. No cohort reselection. No new holdout.

## 1. Immutable ancestry (변경 금지, 재검증됨)
STEP 20 design 155995dd — protocol 65b004589570e7e409201e82c9388b17ec53002c4b31282112056d005baabb00 · preregistration 1e4ed8c1d004b00812c0710fd3df32c8a6c7537ff5287474a4c0a3e8ae33cae4 · selection rule 5d980be74fbeb752160143c2e44ecb6611f01f21e94ea528908fc5867d9b46d7 · holdout derivation 68dce1d200c73fd6f1c392446f61d2d240c40068bd34992efce8c14622becfb8.
Selected-alpha lock 73fafffb — artifact content SHA 27e0c940a4beed5b6a1068b83856ba1711300f91b45905f93b1de5c5bfccebc3 · file SHA 68e43a0f91e3a6bd81427399adbe2cf8a7543d85cf0249d4926f3df093649efd (α* = 0.002).
Calibration record 904a27a9 — calibration manifest 41ca439ec6540fd98b3c9ecf5c74af7afdd8731e94bea5d33bfac3397afe8498.
STEP 17 551668ef (forcing protocol db73ef67…, manifest 591cc057…) · STEP 18 d505cc5e (BLOCKED, 02c859f9…) · STEP 18b 5b9567e5 (manifest 923fd1ba…) · STEP 19 5f27dc2d (evaluation 9baa0c6a…) · cohort 8581d234… · observations 22c0ecff….
B-2 record 86213644 — holdout forcing manifest 8e4c5592… · scope 3db72a8847c801e1ffe476889d63e74ade5ab0576bb6ec8f89d509a2ffdeb4d0.

## 2. What was found (facts, not choices)
- KE-H1: raw NCSS files complete (4 HYCOM parts, 25 frames, 0 gaps; 2 NCEP files, 17 frames). The locked domain rule gives a 123 × 333 grid; 25 × 123 × 333 × 2 = **2,047,950 values > 2,000,000**, the limit enforced by `research_runtime/datasets.py validate_dataset` (`MAX_VALUES`). That module is part of the V1 immutable 4-file source snapshot and is called by the runtime on every run; it is **not changed**. The reader (`netcdf_reader.py`, unchanged) delegates to the same validator.
- KE-H2: HYCOM expt_53.X has no frame at **2010-08-18T12:00:00Z**; 24 of 25 required frames present; available adjacent frames 2010-08-18T09:00:00Z and 2010-08-18T15:00:00Z.
- KE-H3: FORCING_ACQUISITION_PASS (25 × 3 h, 17 wind frames, stencils wet).

## 3. KE-H1 resolution rule — CHUNKED READING ONLY (LOCKED)
Because the value limit is enforced both when reading and when running, chunking must be **temporal chunking of the dataset and of the model integration**, with no change to reader or runtime code:
1. The **same raw files** (same SHA-256 as the B-2 manifest) are read by the **unchanged reader** `build_dataset` as two overlapping temporal chunks:
   - chunk A = parts {current-20100810T12, current-20100811T12} → frames t0+0h..t0+45h (16 frames, 1,310,688 values)
   - chunk B = parts {current-20100811T12, current-20100812T12, current-20100813T12} → frames t0+24h..t0+72h (17 frames, 1,392,606 values)
2. Each chunk's `landMask` is replaced by the **union of the wet-validity mask over all 25 full-window raw frames** — exactly the single reader's definition ("masked in at least one frame"). u/v values are untouched (per-frame nulls exactly as the reader produced them). The chunk manifest `sha256` is recomputed over the resulting grid; the reader version strings are unchanged; a processing-history entry records the chunk and that no value was modified.
3. **Model integration is split at t0+36h**: segment 1 = t0..t0+36h on chunk A; segment 2 = t0+36h..t0+72h on chunk B, released from the segment-1 positions at t0+36h at full float64 precision (the runtime's output sample). 36 h is a frame time (3 h cadence), an output time (900 s) and an integration step boundary (300 s), so no interpolation state crosses the split. Particles terminated in segment 1 are not released in segment 2 (their terminal status stands). The two segments are exported as one trajectory CSV (segment-1 rows t0..t0+36h, segment-2 rows after t0+36h; the t0+36h sample is written once from segment 1 and must equal segment 2's first sample exactly).
4. **Reader equivalence (verified now, no model run)**: applying steps 1–2 to five datasets the single reader can process (KE-H3 and the four STEP 17 calibration units) reproduced every chunk frame **bitwise** (5 × 33 frames compared, 165/165 equal), identical axes and identical landMask (native chunk masks never differed from the union, i.e. the mask is static in these windows). KE-H1 itself: chunk A/B overlap 8 frames bitwise identical; chunks jointly cover all 25 frames; missing rate 0.0697 per chunk; u/v within ±5 m/s; release stencils 5/5 wet at t0. Record: docs/research/step20-b3-holdout-forcing-manifest.json.
5. **Run equivalence gate (Phase B-4, before the holdout)**: the segmented run must be validated on calibration data first — KE-1 (STEP 17 forcing, chunked the same way) for α = 0 and α = 0.002 must reproduce the STEP 20 calibration single-run result arrays **bitwise** (reference: step20-cal-alpha0-KE-1 result array aa6987ed8fcabd89…, step20-cal-alpha0.002-KE-1 result array 2b7547ed6151ad90…; trajectory CSV 0e6f034f7f999821… / cc38b0d7fd171f18…). Any difference → SEGMENTED_EQUIVALENCE_FAIL → the KE-H1 holdout is **not run** (HOLDOUT_BLOCKED_SEGMENTATION); no fallback.
6. Prohibited: resampling, smoothing, extrapolation, interpolation across frames, zero-fill, frame duplication, value modification, spatial domain reduction, temporal domain reduction, any change to `netcdf_reader.py`, `datasets.py`, `models.py`, `models_v2.py`, `wind.py`, or to `MAX_VALUES`.

## 4. KE-H2 source-gap rule (LOCKED — decided before any result exists)
IF a required ocean forcing frame is absent in the original source dataset → unit status = **FORCING_UNAVAILABLE** → the unit is **not modeled** → no synthetic replacement. This rule applies regardless of any result. KE-H2 (required frame 2010-08-18T12:00:00Z absent; adjacent 09Z/15Z present) is therefore FORCING_UNAVAILABLE. Prohibited: temporal interpolation, nearest-neighbour substitution, previous/next-frame duplication, zero-fill, model-side extrapolation, another HYCOM product, GLORYS, ERA5. **NO INTERPOLATION. NO MODEL RUN** for KE-H2. This is not a post-hoc exclusion: it is locked here, and KE-H2 remains listed in every report as FORCING_UNAVAILABLE (n = 1 preregistered, 0 evaluated).

## 5. Holdout analysis set after this revision (LOCKED)
| Unit | t0 | n preregistered | forcing | n evaluated |
|---|---|---|---|---|
| KE-H1 | 2010-08-10T12:00:00Z | 5 | AVAILABLE (chunked) | 5 |
| KE-H2 | 2010-08-16T12:00:00Z | 1 | FORCING_UNAVAILABLE | 0 |
| KE-H3 | 2010-11-15T12:00:00Z | 7 | AVAILABLE | 7 |

PREREGISTERED HOLDOUT: 13 · FORCING-AVAILABLE EVALUABLE HOLDOUT: 12 · FORCING-UNAVAILABLE: 1. Results are never described as a "13-drifter holdout result". Future analysis is on the n = 12 evaluable drifters; KE-H1 (n = 5) and KE-H3 (n = 7) are small-n / descriptive; the overall n = 12 satisfies the STEP 20 sign-test minimum (n ≥ 10) and is reported only as an exploratory nominal result under the existing STEP 20 rule. AG holdout remains HOLDOUT_UNAVAILABLE.

## 6. What stays identical (LOCKED)
Primary α = 0.002 (locked), baseline α = 0 (locked); candidates 0.0003 / 0.0007 / 0.001 never run on the holdout; no α reselection. No new drifter, window or cohort; no replacement window for KE-H2. Model mechanics: dX/dt = U_ocean + α·U_wind, 15 m ocean, 10 m wind, RK4, 300 s integration substep, 900 s output, spherical geographic conversion with cos φ at every RK4 stage, bilinear spatial and linear temporal interpolation **between existing frames only** (never across a missing source frame), no extrapolation/smoothing/zero-fill/land-value substitution/frame duplication. Primary metric M3 at 24/48/72 h, haversine R = 6371008.8 m, exact UTC observation matching, STEP 19/20 delta and tie (1e-6 km) rules; secondary M1/M2/M4/M5 as in STEP 20; small-n, outlier, inference and leakage policies as in STEP 20 §11–§14. Holdout evaluated exactly once (Phase B-4 only, separate instruction). Reader/runtime code unchanged.

## 7. Artifacts of this revision
docs/research/step20-b3-forcing-resolution-protocol.md (this) · docs/research/step20-b3-forcing-resolution-preregistration.json · docs/research/step20-b3-forcing-resolution-selection-rule.json (resolution rules + SHA registry) · tools/research/check_step20_b3_forcing_resolution.py (validator) · tools/research/build_step20_chunked_forcing.py (chunk builder + equivalence tests) · docs/research/step20-b3-holdout-forcing-manifest.json (chunk/gap record) · chunk datasets under data/research/step20/holdout/forcing/normalized/ (not committed).

## 8. Phase B-3 counters
Model runs 0 · holdout trajectories 0 · forcing downloads 0 (B-2 files reused, SHA-verified) · α reselection NO · cohort reselection NO · interpolation of the missing source frame NO · GLORYS NO · ERA5 NO · existing locked file mutation 0.

## 9. LOCK
Status PREREGISTRATION LOCKED. Next step only on separate instruction: **STEP 20 PHASE B-4 — REVISED HOLDOUT EXECUTION** (gate §3.5 first, then KE-H1 segmented + KE-H3 single runs × {0.002, 0}, KE-H2 not modeled, evaluation on n = 12).
