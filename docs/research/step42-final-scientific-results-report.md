# FINAL SCIENTIFIC RESULTS REPORT
# STEP 36–41 PREREGISTERED OCEAN DRIFTER EXPERIMENT

STEP 42 — reporting / interpretation lock only. This document performs no new scientific
computation. Every scientific value below is read from the frozen, SHA-bound records listed in
Section 20 and can be reproduced from the committed records alone. Rule id:
`experiment-preregistration-step37`.

---

## 1. Executive summary

**Research question.** Whether the preregistered Candidate C (GLORYS12V1 + WW3 Stokes + NCEP-R2)
produces a lower 72-hour trajectory position error than the frozen `HYCOM_NATIVE_3H` baseline
(Condition A) on the frozen new cohort registered in STEP 36.

**Primary result (frozen, STEP 39 / STEP 40).**

| Quantity | Value |
|---|---|
| Primary statistic Theta (window-level median of Delta_w, 72 h, C − A) | **−31.331 km** |
| 95 % window-level percentile bootstrap interval | **[−72.0725, −11.7435] km** |
| Upper bound of the interval | **−11.7435 km** |
| Primary descriptive criterion (STEP 30A rule, pooled pairs) | **CANDIDATE_DESCRIPTIVELY_FAVORED** |
| Primary hypothesis | **H1 = SUPPORTED** |
| Candidate status | CANDIDATE_ONLY |
| Operational promotion | NO |

Within the preregistered cohort and frozen configuration, Candidate C showed a lower 72-hour
position-error difference relative to `HYCOM_NATIVE_3H`, with the observed window-level median
difference of −31.331 km and a preregistered window-bootstrap 95 % interval entirely below zero.
This supports H1 for the preregistered experiment, but the result should not be interpreted as
universal or operational model superiority.

---

## 2. Preregistration and temporal order

The chain was executed strictly in the following chronological order. Each step was locked
(committed) before the next step read it.

| Order | Step | Commit | Content |
|---|---|---|---|
| 1 | STEP 36 | `043a09b8539955868651a06e7c2c44e3c606803f` | Cohort extension: 9 windows / 20 drifters selected by the preregistered chronological accumulation rule (derivation hash `46892c37…`). |
| 2 | STEP 37 | `74d19f0a9661a41d63a08c56bbd3f91e9d8b312d` | Experiment preregistration (protocol v1.1): scientific question, hypotheses, primary endpoint, nested aggregation, bootstrap procedure and success criterion locked. |
| 3 | STEP 38 | `23e78f863fb092aa9e3c36e4d74d4afd4393e7f4` | Source data acquired and frozen (originals immutable; SHA-256 manifests). |
| 4 | STEP 39 | files locked by STEP 41 | Deterministic trajectory execution A / B / C, per-run separate-process replay, independent re-execution, deterministic evaluation. No bootstrap. |
| 5 | STEP 40 | `2b1a7baa7ef9e69d25cecbff2b09fca8700fca80` | Preregistered primary window-level bootstrap. |
| 6 | STEP 41 | `9a3223089099bcb09a2589cc8a4bda82fcb47ae5` | STEP 39 records and tools locked (20 files, SHA-bound). |

Frozen runtime: `services/research-runtime` at commit `155995dd` (model source SHA-256
`306a597613f625e09d0788405b7b7e3b3a944627d4217b8da77e66a74859dee3`, model id
`surface-passive-advection.v2.windage`).

**The primary result was not used to modify the hypothesis, cohort, source selection, model
parameters, endpoint, aggregation, NA handling, or bootstrap method.** The STEP 37 protocol
(SHA-256 `eae40cde…`) and STEP 36 cohort manifest (SHA-256 `bda31c3c…`) are recorded unchanged in
the STEP 38, STEP 39 and STEP 40 records; the STEP 39 execution record states
`parameterTuning: false`, `modelSelection: false`, `cohortModified: false`,
`endpointModified: false`.

---

## 3. Frozen cohort (STEP 36)

| Item | Value |
|---|---|
| Region | Gulf Stream (GS) |
| Registered windows | 9 (GS-Y1 … GS-Y9) |
| Unique drifters | 20 |
| Selection | Chronological prefix accumulation inherited from STEP 36 (first prefix with ≥ 6 windows and ≥ 20 drifters, maximum 12 windows); no performance data read |
| Period lock | 2010-01-01T00:00:00Z … 2015-12-31T21:00:00Z, selection landed on 2010-07-27 … 2010-10-16 |
| Window start dates | GS-Y1 2010-07-27, GS-Y2 2010-07-30, GS-Y3 2010-08-02, GS-Y4 2010-08-05, GS-Y5 2010-08-08, GS-Y6 2010-08-22, GS-Y7 2010-08-28, GS-Y8 2010-09-16, GS-Y9 2010-10-16 |
| Duration per window | 72 h from t0 = 12:00 UTC |

**Primary-endpoint availability at 72 h (frozen STEP 39 evaluation).**

| Quantity | Value |
|---|---|
| Condition A valid at 72 h | 18 / 20 |
| Candidate C valid at 72 h | 16 / 20 |
| A/C paired (both valid, exact drifter id and exact UTC timestamp) | 16 |
| Windows with ≥ 1 valid primary pair | 6 / 9 |

The availability difference between A (18/20) and C (16/20) is a property of the result and is
reported as such (Sections 15–17).

---

## 4. Frozen conditions and parameters (STEP 37 / STEP 38 / STEP 39)

| Condition | Forcing |
|---|---|
| A — `HYCOM_NATIVE_3H` (frozen reference baseline) | HYCOM GOFS 3.1 GLBv0.08 expt_53.X reanalysis, 3 h, 15.000 m (STEP 38 derived datasets, 25 frames per window) + NCEP-DOE Reanalysis 2 10 m wind |
| B — `HYCOM_DAILY` (secondary, temporal comparison only) | Daily fields derived in STEP 39 from the frozen STEP 38 day files (8 frames per UTC day, unweighted mean, label 00Z; configuration = frozen STEP 32 matrix) + NCEP-R2 |
| C — Candidate | GLORYS12V1 (GLOBAL_MULTIYEAR_PHY_001_030, daily mean, native depth 15.810070 m, linear in time at 3 h instants) + WW3 GLOB-30M CFSR surface Stokes drift × 1.0 + NCEP-R2; composite constructed by the STEP 29 TEST-06 treatment applied unchanged |

| Parameter | Frozen value |
|---|---|
| Windage coefficient alpha | 0.002 |
| Stokes coefficient | 1.0 (not multiplied by alpha) |
| Depth, Conditions A / B | 15.000 m |
| Depth, Candidate C | 15.810070 m (GLORYS native level) |
| Integrator | RK4, time step 300 s |
| Output interval | 900 s |
| Duration | 72 h (259 200 s) |
| Evaluation horizons | 24 / 48 / 72 h (exact UTC instants) |
| Interpolation | bilinear in space, linear in time (frozen runtime) |
| Boundary policy | STOP_AT_FIRST_CROSSING (window ocean box clipped to ± 40°) |

**No parameter tuning was performed.** The STEP 39 summary records `parameterSelection: NONE` and
`modelSelection: NONE`; all parameters are those locked in STEP 37 and inherited from earlier
locks (alpha from STEP 20).

---

## 5. Primary endpoint (STEP 37, applied in STEP 39)

For each drifter i with a valid A trajectory, a valid C trajectory and an observation at the exact
72 h UTC instant:

    delta_i = E_C,i(72 h) − E_A,i(72 h)

where E is the preregistered great-circle (haversine) position error between the modelled and the
observed position, Earth radius R = 6 371 008.8 m, expressed in km.

Nested hierarchy (frozen): LEVEL 1 window (9) > LEVEL 2 drifter pair (20) > LEVEL 3 trajectory
points (never treated as independent).

    Delta_w = median_i( delta_i within window w )
    Theta   = median_w( Delta_w over windows with ≥ 1 valid pair )

Equal window weighting. A window with no valid pair is NOT_AVAILABLE and contributes nothing.
NA values were not imputed, interpolated, substituted or reinterpreted as zero
(STEP 39 audit: `imputed: 0`, `interpolatedErrors: 0`, `newAcquisition: 0`,
`alternateProduct: 0`).

---

## 6. Primary window results (frozen STEP 39)

| Window | Valid pairs | Delta_w (km) |
|---|---|---|
| GS-Y1 | 8 | −17.872 |
| GS-Y2 | 1 | −5.615 |
| GS-Y3 | 1 | −21.379 |
| GS-Y4 | 1 | −41.283 |
| GS-Y5 | 0 | NA |
| GS-Y6 | 3 | −65.774 |
| GS-Y7 | 0 | NA |
| GS-Y8 | 0 | NA |
| GS-Y9 | 2 | −78.371 |

Window consistency: 6 valid windows, 6 negative, 0 positive, 0 tied.

**Theta = −31.331 km** (frozen value −31.331086 km; median of the six valid Delta_w).

---

## 7. Primary bootstrap (STEP 40)

| Setting | Frozen value |
|---|---|
| B (replicates) | 10 000 |
| Seed | 20260907 |
| Generator | `numpy.random.default_rng(20260907)`; `rng.integers(0, 9, size=9)` per replicate, sequential |
| Sampling unit | window |
| Sampling frame | all 9 registered windows (including the 3 NA windows) |
| Quantile method | linear |
| Quantiles | 0.025 / 0.975 |

Each replicate: exactly 9 windows sampled with replacement; all valid drifter deltas within each
selected window retained and Delta_w recomputed (asserted identical to the frozen value); a window
drawn k times contributes k times (equal window weighting); no independent drifter resampling; no
trajectory-point resampling; no imputation; a replicate that draws no available window is
NOT_AVAILABLE and is never redrawn.

| Result | Value |
|---|---|
| Available replicates | 9 999 |
| NOT_AVAILABLE replicates | 1 |
| Q0.025 | −72.0725 km |
| Q0.975 | −11.7435 km |

Deterministic replay: the STEP 40 validator recomputed the whole bootstrap in-process from the frozen
deltas and compared the replicate window indices and statistics row by row (10 000 rows,
byte-identical CSV); an independent tool re-run with `--out` was byte-identical.

---

## 8. H1 decision (preregistered criterion, STEP 37 field 28 / clarification v1.1)

Criterion: descriptive label `CANDIDATE_DESCRIPTIVELY_FAVORED` **AND** upper bootstrap bound < 0 km.

| Component | Outcome |
|---|---|
| Descriptive label (STEP 30A rule on pooled pairs) | CANDIDATE_DESCRIPTIVELY_FAVORED → YES |
| Upper 95 % bound −11.7435 km < 0 km | YES |

**H1 = SUPPORTED.**

---

## 9. Secondary results (SECONDARY — not confirmatory)

All values below are frozen STEP 39 descriptive quantities. They were preregistered as secondary
and are reported for completeness only. They are not additional confirmatory hypotheses and no
inference is attached to them.

**C − A by horizon**

| Horizon | Nested Theta (km) | Valid windows | Pooled median (km) | Pooled n |
|---|---|---|---|---|
| 24 h | −8.105 | 8 / 9 | −9.229 | 19 |
| 48 h | −30.150 | 6 / 9 | −23.862 | 17 |
| 72 h | −31.331 | 6 / 9 | −23.981 | 16 |

**Temporal comparison B − A (`HYCOM_DAILY` minus `HYCOM_NATIVE_3H`)**

| Horizon | Nested Theta (km) | Valid windows |
|---|---|---|
| 24 h | +1.171 | 9 / 9 |
| 48 h | +3.308 | 9 / 9 |
| 72 h | +9.440 | 7 / 9 |

Locked interpretation of the temporal comparison (STEP 32 rule, pooled pairs, 72 h):
**NO_CLEAR_TEMPORAL_DIFFERENCE.**

---

## 10. Additional frozen metrics (descriptive only)

These are additional descriptive metrics from the frozen STEP 39 summary. They are not substitutes
for the primary endpoint and carry no inferential weight.

| Metric | A | B | C |
|---|---|---|---|
| M3 — position error at 72 h, median (n) | 80.846 km (n = 18) | 74.971 km (n = 18) | 66.386 km (n = 16) |
| M1 — modelled 72 h endpoint displacement, median | 125.6 km | 129.4 km | 93.1 km |
| M2 — modelled total path length, median | 158.6 km | 157.9 km | 104.8 km |

| Metric | Value |
|---|---|
| M4 — 72 h separation between modelled trajectories, C vs A, median (n = 16) | 49.8 km |
| M4 — 72 h separation, B vs A, median (n = 18) | 16.5 km |
| M5 — observed 72 h drifter displacement, median (n = 20) | 109.4 km |

(Frozen unrounded medians: M1 A 125.592 / B 129.415 / C 93.113 km; M2 A 158.628 / B 157.920 /
C 104.754 km; M4 C−A 49.756 km, B−A 16.493 km; M5 109.418 km.)

---

## 11. Sensitivity analysis (STEP 40, secondary)

Drifter-level bootstrap of the pooled 72 h median (separate generator, same seed).

| Setting / result | Value |
|---|---|
| Unit | drifter pair |
| n | 16 |
| B | 10 000 |
| Seed | 20260907 |
| Pooled median observed | −23.981 km |
| 95 % interval | [−36.316, −6.626] km |

**This is a sensitivity analysis only.** It ignores the clustering of drifters within windows and
does not replace the primary window-level inference of Section 7.

---

## 12. Missingness and availability (frozen STEP 39 execution record, G / K / N)

| Window / drifter | Frozen observation | Consequence |
|---|---|---|
| GS-Y7 / drifter 92869 | A, B and C terminated OUT_OF_DOMAIN before 72 h (STOP_AT_FIRST_CROSSING at the ± 40° computation boundary) | 72 h NA for all conditions; window NA for the primary endpoint |
| GS-Y8 / drifter 88532 | A, B and C terminated FORCING_UNAVAILABLE | 72 h NA for all conditions; window NA |
| GS-Y5 / drifter 98936 | C terminated FORCING_UNAVAILABLE (A and B completed) | C − A pair NA; window NA for the primary endpoint (B − A pair remains valid) |
| GS-Y2 / drifter 92872 | C terminated FORCING_UNAVAILABLE before the 48 h and 72 h instants (A and B completed) | corresponding C − A pairs NA at 48 h and 72 h; GS-Y2 primary Delta_w rests on the remaining drifter 98941 |

NA counts at 72 h (frozen audit): A 2, B 2, C 4; C − A pairs 4; B − A pairs 2.

These are availability limitations of the frozen experiment. They are not characterised as failures
of the hypothesis and they are not characterised as successes. They remain explicitly reported and
were handled exactly as preregistered (NA kept, never imputed).

---

## 13. Candidate-only termination observation (STEP 39)

Two candidate-only terminations (GS-Y2 / 92872 and GS-Y5 / 98936, both FORCING_UNAVAILABLE)
occurred because the composite candidate grid is cropped to the window area plus one node according
to the preregistered STEP 29 TEST-06 construction (`croppedToAreaPlusOneNode` recorded per window in
the STEP 39 candidate-forcing manifest), whereas the corresponding A and B trajectories completed.

- This reduced candidate availability (C valid at 72 h 16 / 20 versus A 18 / 20).
- No substitution occurred.
- No imputation occurred.
- No post-hoc correction, re-cropping or re-run was applied.
- This limitation remains part of the result.

The scientific result was not changed because of this observation.

---

## 14. Limitations

1. **Small number of registered windows.** 9 windows were registered; 6 carried a valid primary
   pair. The primary statistic is a median over 6 window-level values.
2. **Candidate 72 h availability.** Candidate C was valid at 72 h for 16 / 20 drifters compared with
   18 / 20 for Condition A (Sections 12–13).
3. **Small cluster count.** The window-level bootstrap resamples from 9 clusters, of which 6 are
   available; single-pair windows (GS-Y2, GS-Y3, GS-Y4) carry window weight equal to the 8-pair
   window GS-Y1.
4. **Nature of the interval.** The bootstrap interval is an uncertainty estimate under the
   preregistered resampling scheme and is not evidence of asymptotic normality or nominal coverage.
5. **Candidate-only forcing availability limitations occurred** (Section 13).
6. **Scope.** The experiment does not establish universal superiority outside the preregistered
   cohort (Gulf Stream, 2010-07-27 … 2010-10-16), period, forcing sources, depth and parameter
   configuration.
7. **Operational status.** The result does not establish operational superiority.

---

## 15. Interpretation

Within the preregistered cohort and frozen experimental configuration, Candidate C showed a lower
72-hour position-error difference relative to `HYCOM_NATIVE_3H`, with the observed window-level
median difference of −31.331 km and a preregistered window-bootstrap 95 % interval entirely below
zero.

This supports H1 for the preregistered experiment, but the result should not be interpreted as
universal or operational model superiority. The comparison is descriptive of one frozen cohort under
one frozen configuration; no causal attribution to any single component of the candidate composite
(GLORYS12V1 currents, WW3 Stokes drift, NCEP-R2 wind) is made or supported by this design.

---

## 16. Operational status

| Item | Status |
|---|---|
| Candidate C | CANDIDATE_ONLY |
| Baseline (`HYCOM_NATIVE_3H`) | FROZEN_REFERENCE_BASELINE |
| Operational promotion | NO |
| Model selection | NONE |
| Parameter tuning | NONE |

This experiment does not authorise deployment, replacement, or operational promotion of
Candidate C.

---

## 17. Reproducibility and provenance

- **Frozen source acquisition (STEP 38).** Originals immutable, SHA-256 recorded per artefact
  (acquisition manifest `c9d3109f…`, data-freeze manifest `5e979cff…`); STEP 38 summary: HYCOM pass 9,
  candidate pass 9, blocked 0, fail 0; WW3 monthly files 2010-07 … 2010-10 PASS.
- **SHA-bound records.** Every downstream record carries the SHA-256 of its inputs (Section 20).
- **Deterministic trajectory execution (STEP 39).** 27 runs (A / B / C × 9 windows), no stochastic
  component (`randomSeedsUsed: none`); per-run separate-process replay matched for all 18 temporal
  and 9 candidate runs; independent scratch-directory re-execution and evaluator re-run
  byte-identical (STEP 39 validator r2, PASS, byte-identical). Validator revision r1 → r2 recorded
  in `step39-validator-r2-record.json` (r1 crashed on a fractional-second terminal timestamp; no
  scientific value changed).
- **Bootstrap replay (STEP 40).** In-process recomputation and independent tool re-run byte-identical
  (validator PASS / PASS, BYTE_IDENTICAL).
- **STEP 41 lock.** 20 STEP 39 files locked with path, size, SHA-256 and role; validator PASS / PASS,
  BYTE_IDENTICAL = YES; STEP 40 files byte-identical to commit `2b1a7baa`.
- **Runtime.** `services/research-runtime` at `155995dd`, byte-identical to the commit (STEP 39
  record `runtimeFilesByteIdenticalToCommit: true`).
- **Environment (frozen record).** Python 3.12.10, numpy 2.5.2, netCDF4 1.7.4, parcels 3.1.4,
  Windows 11.
- **Raw data.** All raw and derived data under `data/research/step38` and `data/research/step39`
  remain outside Git (ignored) and were not modified; their SHA-256 values are recorded in the
  committed manifests.

---

## 18. Final conclusion

1. The preregistered primary criterion was satisfied.
2. H1 is SUPPORTED.
3. The observed primary effect was −31.331 km.
4. The 95 % window-bootstrap interval was [−72.0725, −11.7435] km.
5. The interval remained entirely below zero.
6. This result applies to the frozen experiment and cohort.
7. Candidate C remains CANDIDATE_ONLY.
8. No operational promotion was authorised.
9. Further validation on independent data is required before any operational claim.

---

## 19. Scientific writing declaration (STEP 42)

No new hypothesis was introduced. No new test was performed. No probability-value statistic was
calculated. No post-hoc interval was added. No observation was removed. NA was not reinterpreted as zero.
Availability differences were not reinterpreted as performance. No causal claim, no claim of
universal generalisation and no claim of operational superiority is made.

---

## 20. Source records (SHA-256, all committed)

| Step | Record | SHA-256 |
|---|---|---|
| 36 | docs/research/step36-cohort-extension-manifest.json | bda31c3ca36a395acadc95c1cb18663964ee9a00e4a72a7c2504182f51df06ca |
| 37 | docs/research/step37-experiment-preregistration-protocol.json | eae40cde609155a32ccbe0c01a6090715e2324d72cc080e2e7043ecbd90f2d0d |
| 37 | docs/research/step37-experiment-preregistration-status.json | 61de721a97b57b04692f7b357cb8ef3a62088ef3cecdfbf010af4c760434a767 |
| 37 | docs/research/step37-experiment-preregistration-report.md | dfac0db50e37ba63b70cad12d820a4552601002c1b0edd30b0dd1544d726d204 |
| 38 | docs/research/step38-source-acquisition-protocol.json | a4dfbcbea6562e02b032e0557397a61870e31b53e980931c396f44905b9b88cd |
| 38 | docs/research/step38-source-acquisition-manifest.json | c9d3109fbab2970b43b887cc7ba81d3aacbdd094375b091e8e185097a22dc2a0 |
| 38 | docs/research/step38-data-freeze-manifest.json | 5e979cff746a1ee72c877a8b1bdb8c1bc1e310605ab9fc7cc6337d9ea902da77 |
| 38 | docs/research/step38-source-acquisition-report.md | b400e82533cfe33ef2e2df4453b3e77e6811bb10fb6ab6474ecb1d02ef56fcb8 |
| 39 | docs/research/step39-execution-protocol.json | 5bd1eb236d2d423f2af24440cceea798e150fd20ee2a4acb754b78522b6aba23 |
| 39 | docs/research/step39-daily-derivation-manifest.json | 76948fb690f53ac894ac980530e1f67b76ea4ac34104422b0d232a31f3dfbcf5 |
| 39 | docs/research/step39-candidate-forcing-manifest.json | 63129afa4712d18d04a8a9327d92c923881394684c29fc23569ddc75fdf4ecf2 |
| 39 | docs/research/step39-temporal-run-manifest.json | b267f5869a0160227545b4a4f294de10bdcac1a7dd11841ac28813b73f779634 |
| 39 | docs/research/step39-candidate-run-manifest.json | 534cd7426f6f2af653303b9e4ae019d489d9e416524b54859ba7d227da86eba5 |
| 39 | docs/research/step39-paired-table.csv | 30fbc404142e9b20bb83879a67821614937a146810078088cb623bbb04623035 |
| 39 | docs/research/step39-evaluation.json | 5ed91fc3ed18184e222c180ef712fca12775563749a3b8b47cf698165aaf76ac |
| 39 | docs/research/step39-summary.json | 7d90ba995733071f9536df598332bffdc2bd75d4206e7ef23a2c1f9bde67ea83 |
| 40 | docs/research/step40-bootstrap-protocol.json | 60dbf72cd91d91cc4cc2c72d96c4aec41ffd39ce8368db2d4081070f77786fb4 |
| 40 | docs/research/step40-bootstrap-result.json | e7fe94c8f527846721f856418f1c4686a75132e21a72b122006d3d7bdbe6482f |
| 40 | docs/research/step40-bootstrap-replicates.csv | a2ca2a3266411da186f78140a41f1bee0bf831d4fbe99b5d4acb3849f4378572 |
| 41 | docs/research/step41-lock-record.json | 672b7def2f157fe976c98e5b501f5504f4cdba89707d6a95486c7e42ffd855df |
| 41 | tools/research/check_step41_lock.py | b46e02a1205ab97cc13e462ea31624b1482b46e93cbee714e4318e3300a9dc58 |

The STEP 39 temporal/candidate replay manifests, execution record and validator r2 record are
locked with the SHAs listed in `docs/research/step41-lock-record.json`.

Independent validator for this report: `tools/research/check_step42_final_report.py`.

END OF REPORT
