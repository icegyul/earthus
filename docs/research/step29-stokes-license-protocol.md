# STEP 29 — Stokes drift access / license resolution (Phase A: preregistration and data-use gate)

Rule id: `stokes-license-and-experiment-gate-step29`. Base commit: 4942421a (STEP 28 Phase B). Machine-readable determination: `step29-stokes-license-status.json`; evidence map: `step29-stokes-evidence-index.json`; future design: `step29-stokes-experiment-design.json`; tool: `tools/research/assess_step29.py` (deterministic, offline); validator: `tools/research/check_step29_stokes_license.py`.

## 0. Purpose

STEP 17–28 are frozen evidence. STEP 28 recorded, descriptively: HYCOM–GLORYS field difference ≈0.25 m/s median with ≈35° median direction difference; both products faster than the AVISO surface-geostrophic reference, GLORYS closer to it in all four A/B/C windows; STEP 27 depth effects small; STEP 20 windage alpha = 0.002 without consistent holdout advantage. STEP 29 examines the next candidate physical term, surface Stokes drift, without running it: it settles the DATA-06 data-use gate, checks technical suitability, and registers the future TEST-06 design. MODEL_RUN = FORBIDDEN; no download; alpha, depth, forcing and windage unchanged.

## 1. Ancestry and immutability

Required ancestors: 551668ef, d505cc5e, 5b9567e5, 5f27dc2d, 155995dd, 73fafffb, 9113e8b5, 869bc664, c395a098, ed746129, 7b0453b8, a7f62873, 4bb4342b, e0e7cfd2, db6cea2f, 2841f511, 929d3468, c974ce42, 86266b3a, a4474eb8, 3338c7e4, 79a0d69d, 4942421a. STEP 17–28 locked outputs keep their SHA-256 (list in the validator); the runtime stays byte-identical to 155995dd. STEP 20, 25C, 27, 28 are not modified. Any mismatch: STEP29_BLOCKED_IMMUTABILITY.

## 2. DATA-06 identity and prior status

IFREMER (distribution; OCO data centre) and SHOM (co-institution), WAVEWATCH III GLOBMULTI global hindcast, GLOB-30M 0.5°, CFSR-forced (file attribute forcing_wind = wind_ncep), product_version 1.0, surface Stokes drift monthly files `WW3-GLOB-30M_YYYYMM_uss.nc` (variables uuss/vuss, m/s, 3-hourly), six files acquired in STEP 23 (SHA-locked). Prior status (STEP 24b): LICENSE_UNKNOWN, on the FTP README scope only. Anonymous FTP access is not permission.

## 3. Evidence scope (locked)

Admissible: official IFREMER/SHOM product documentation and README files, official terms/licence documents, official portal terms specifically applicable to this product, and the provider-embedded global attributes of the downloaded product files themselves. Excluded: Copernicus terms, unrelated IFREMER dataset terms, third-party interpretations, generic FTP assumptions, search snippets without source context. Online catalogue records that describe other product versions are recorded as context and are not applied.

Evidence consulted (2026-09-06):
- Downloaded files (6, SHA-verified against the STEP 23 manifest): global attribute `distribution_statement = "No restrictions"`, `institution = "SHOM and Ifremer"`, `data_centre = "IFREMER OCO DATA CENTER"`, `contact = cdoco-exploit@ifremer.fr`, `references = http://wwz.ifremer.fr/iowaga/`, `source = MODEL WAVEWATCH III (R) GLOBMULTI`, `product_version = 1.0`, `grid = glob_30m`, identical in all six files.
- IFREMER FTP READMEs (STEP 24b stored copies, re-scanned): no license, terms, citation or redistribution statement.
- WW3 wiki "En:ifremer_wave_hindcasts": documents the CFSR hindcast family; no license or citation terms.
- IOWAGA reference page: host unreachable on 2026-09-06.
- Sextant records GLOB-30M_LOPS_2025 (CC-BY) and GLOBMULTI_ERA5_GLOBCUR_01 (CC BY-SA): ERA5-forced successor products, not the downloaded files → ALTERNATIVE_CANDIDATE only; not substituted; a new preregistration is required before any use.

## 4. Determination rule and result

LICENSE_CONFIRMED = an explicit provider statement permitting use/distribution that applies to the downloaded files (a provider-embedded file `distribution_statement` qualifies; STEP 17 accepted HYCOM's "Distribution unlimited" attribute the same way). LICENSE_RESTRICTED = explicit restriction. LICENSE_UNKNOWN = no applicable explicit statement. DATASET_BLOCKED = data failure.

Result: **LICENSE_CONFIRMED**, on the `distribution_statement = "No restrictions"` present in every downloaded file. Answers to the ten license questions are in the status file. Disclosed caveats: no named license text and no citation requirement exist for this product version; the file metadata block also contains operational-forecast template fields (title "WAVEWATCH-III FORECAST", forecast_type "forecast"), so the statement may be template-inherited; it is nonetheless the only provider statement attached to these exact files. Attribution to SHOM/Ifremer (IOWAGA) is given voluntarily. Decision tree: CASE A.

## 5. Technical suitability (frozen STEP 23 gates; nothing recomputed)

uuss/vuss present, m/s, 0.5°, 10800 s cadence; STEP 23 gates G1–G10 PASS; all seven windows covered (KE-1, KE-2, AG-1, AG-2, KE-H1, KE-H2, KE-H3); KE-2 spans two contiguous monthly files and its release stencil was not evaluated in STEP 23 (null) → must be re-checked in the TEST-06 execution gate; no gap repair. Physical interpretation: surface Stokes drift from the wave spectrum; not an Eulerian current, geostrophic current, windage or drifter velocity. Result: TECHNICALLY_SUITABLE_PENDING_EXECUTION_GATE.

## 6. Future TEST-06 design (registered, not executed)

Control: GLORYS12V1 native 15.810070 m + NCEP-DOE R2 10 m wind, alpha 0.002 (dX/dt = U_ocean + alpha·U_wind). Treatment: GLORYS12V1 15.810070 m + WW3 surface Stokes drift (coefficient 1.0, added directly) + NCEP-R2, alpha 0.002 (dX/dt = U_ocean + U_Stokes + alpha·U_wind). Structural baseline: the same pair with alpha 0. No coefficient search, no alpha search, no depth change. Ocean current, windage and Stokes drift stay separate terms; no substitution among them or with AVISO or drifter velocities. Windows: calibration KE-1, KE-2, AG-1, AG-2; holdout KE-H1, KE-H3; KE-H2 coverage fact only; AG holdout unavailable; STEP 20 unchanged. Metrics: M3 24/48/72 h paired delta (treatment − control), median primary; M1/M2/M4/M5 secondary; descriptive only. Hypothesis: "Adding Stokes drift may alter the surface transport trajectory in a direction not represented by the existing Eulerian-current plus windage formulation." — a hypothesis, not a claim of a missing term or of improvement. TEST-06 may proceed only when the ten acceptance conditions in the design file hold, including a locked execution protocol; STEP 29 sets TEST-06 to ELIGIBLE_PENDING_EXECUTION_PROTOCOL.

## 7. Phase A scope

No WW3 download, no Stokes field integration, no trajectory, no M1–M5, no alpha/depth/forcing change, no credential use. Outputs: this protocol, license status, evidence index, experiment design, summary, validator; all locked at the STEP 29 commit.
