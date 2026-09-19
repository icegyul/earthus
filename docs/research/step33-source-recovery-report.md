# STEP 33 — Source availability recovery report

Rule id `source-availability-recovery-step33`. HEAD 3ebabfe3; STEP 32 Phase A lock ee64354d; STEP 32 Phase B preregistration d7434d28 (file-level). STEP 32 results are FROZEN and unchanged (status PARTIAL: 3 evaluable / 5 blocked windows; expanded-validation minimum BLOCKED). No scientific run of any kind was executed in STEP 33.

## 1. Blocked windows (5) and missing timestamps

| window | t0 | missing registered frames (STEP 32 B2) | classification counts | STEP 33 window status |
|---|---|---|---|---|
| KE-X4 | 2011-06-10T12:00:00Z | 2011-06-09T12:00:00Z | {'AVAILABLE': 0, 'SOURCE_ABSENT': 1, 'ACQUISITION_ERROR': 0} | WINDOW_BLOCKED |
| KE-X5 | 2011-06-13T12:00:00Z | 2011-06-15T00:00:00Z | {'AVAILABLE': 0, 'SOURCE_ABSENT': 1, 'ACQUISITION_ERROR': 0} | WINDOW_BLOCKED |
| KE-X6 | 2011-06-16T12:00:00Z | 2011-06-15T00:00:00Z, 2011-06-20T12:00:00Z | {'AVAILABLE': 0, 'SOURCE_ABSENT': 2, 'ACQUISITION_ERROR': 0} | WINDOW_BLOCKED |
| KE-X7 | 2011-06-19T12:00:00Z | 2011-06-20T12:00:00Z, 2011-06-22T12:00:00Z | {'AVAILABLE': 0, 'SOURCE_ABSENT': 2, 'ACQUISITION_ERROR': 0} | WINDOW_BLOCKED |
| KE-X8 | 2011-06-22T12:00:00Z | 2011-06-22T12:00:00Z, 2011-06-26T18:00:00Z | {'AVAILABLE': 0, 'SOURCE_ABSENT': 2, 'ACQUISITION_ERROR': 0} | WINDOW_BLOCKED |

Window-frame pairs investigated: 8 (distinct timestamps: 2011-06-09T12:00:00Z, 2011-06-15T00:00:00Z, 2011-06-20T12:00:00Z, 2011-06-22T12:00:00Z, 2011-06-26T18:00:00Z).

## 2. Per-timestamp acquisition result

Source binding identical to STEP 32: HYCOM GOFS 3.1 GLBv0.08 expt_53.X, NCSS /data/2011, water_u + water_v, vertCoord 15, horizStride 1, timeStride 1, the window's registered ocean bbox, unchanged reader. Exact query: time_start = time_end = missing timestamp; bracket query: -3 h .. +3 h.

| window | timestamp | exact HTTP / body | exact query returned axis | bracket neighbours returned | classification | exact response SHA | metadata comparison |
|---|---|---|---|---|---|---|---|
| KE-X4 | 2011-06-09T12:00:00Z | 200 / netcdf | 2011-06-09T09:00:00Z | 2011-06-09T09:00:00Z, 2011-06-09T15:00:00Z | SOURCE_ABSENT | dd4727614b0a | n/a (absent) |
| KE-X5 | 2011-06-15T00:00:00Z | 200 / netcdf | 2011-06-14T21:00:00Z | 2011-06-14T21:00:00Z, 2011-06-15T03:00:00Z | SOURCE_ABSENT | 30c7a55a39dc | n/a (absent) |
| KE-X6 | 2011-06-15T00:00:00Z | 200 / netcdf | 2011-06-14T21:00:00Z | 2011-06-14T21:00:00Z, 2011-06-15T03:00:00Z | SOURCE_ABSENT | 43f0604d72d0 | n/a (absent) |
| KE-X6 | 2011-06-20T12:00:00Z | 200 / netcdf | 2011-06-20T09:00:00Z | 2011-06-20T09:00:00Z, 2011-06-20T15:00:00Z | SOURCE_ABSENT | e180301f3893 | n/a (absent) |
| KE-X7 | 2011-06-20T12:00:00Z | 200 / netcdf | 2011-06-20T09:00:00Z | 2011-06-20T09:00:00Z, 2011-06-20T15:00:00Z | SOURCE_ABSENT | bfca22a48961 | n/a (absent) |
| KE-X7 | 2011-06-22T12:00:00Z | 200 / netcdf | 2011-06-22T09:00:00Z | 2011-06-22T09:00:00Z, 2011-06-22T15:00:00Z | SOURCE_ABSENT | b0cb86362faa | n/a (absent) |
| KE-X8 | 2011-06-22T12:00:00Z | 200 / netcdf | 2011-06-22T09:00:00Z | 2011-06-22T09:00:00Z, 2011-06-22T15:00:00Z | SOURCE_ABSENT | 016040ee7064 | n/a (absent) |
| KE-X8 | 2011-06-26T18:00:00Z | 200 / netcdf | 2011-06-26T15:00:00Z | 2011-06-26T15:00:00Z, 2011-06-26T21:00:00Z | SOURCE_ABSENT | 023e367be206 | n/a (absent) |

Every exact query answered HTTP 200 with a NetCDF body whose time axis contains only the nearest preceding frame (the server substitutes the nearest available time), and every bracketing query returned exactly the two neighbouring frames without the requested timestamp. The requested timestamps therefore do not exist on the registered source axis. No request failed (0 network or server errors), so no frame is ACQUISITION_ERROR.

## 3. Classification

AVAILABLE 0 · SOURCE_ABSENT 8 · ACQUISITION_ERROR 0. ACQUISITION_ERROR was never mapped to SOURCE_ABSENT.

## 4. Re-acquired frame SHA and metadata comparison

No missing frame became AVAILABLE, so no frame was re-acquired, validated (Phase C) or compared for MATCH/MISMATCH; nothing in STEP 32 was replaced. Response files of the recovery queries are kept under `data/research/step33/` (gitignored) with SHA-256 in the manifest.

## 5. Window status

Recovered (WINDOW_RECOVERABLE): 0 / 5. Remaining WINDOW_BLOCKED: 5 / 5. No window was promoted to PASS; the 48-frame requirement cannot be met for any blocked window from the registered source.

## 6. Immutability, leakage, scope

STEP 32 outputs unchanged (17 files at the protocol SHA snapshot; Phase B preregistration d7434d28): YES. STEP 32 Phase A files unchanged: YES. Holdout derivation, window IDs, drifter IDs, source binding unchanged. Forbidden input access: 0. Scientific experiment re-run: NO (no temporal test, candidate comparison, calibration, parameter sweep, model comparison, statistical conclusion or winner selection). Parameter / model / forcing selection: NO. Automatic commit: NO.

## FINAL SUMMARY

STEP 33 STATUS:
SOURCE_ABSENT

Blocked windows investigated:
5 / 5

Recovered:
0 / 5

Remaining blocked:
5 / 5

Available missing frames:
0

Source-absent frames:
8

Acquisition-error frames:
0

STEP 32 unchanged:
YES

Phase A unchanged:
YES

Forbidden input access:
0

Scientific rerun:
NO

Parameter/model/forcing selected:
NO

Automatic commit:
NO
