# STEP 45B — PRE-EXECUTION VALIDATION PROTOCOL AMENDMENT

**Amendment ID: STEP44-AMENDMENT-001-INPUT-SCOPE**
Status: AMENDMENT_DESIGN_COMPLETE (uncommitted). Type: pre-execution provenance / input-scope amendment.

Record: `docs/research/step45b-validation-protocol-amendment.json`.
Validator: `tools/research/check_step45b_validation_protocol_amendment.py`.

At the moment this amendment was written: `experimentDataAccessed = FALSE`,
`validationResultsAccessed = FALSE`, STEP 15 content opened = **NO**. No validation data were
accessed, no cohort was derived, no scientific result was calculated.

---

## 1. Base protocol (never overwritten)

| Item | Value |
|---|---|
| Base protocol | `docs/research/step44-validation-preregistration-protocol.json` |
| Base protocol SHA-256 | `6a2e2f04f7948e4ff3ac5dec065fc93a6072ce112bb2e072ce77c2606056de9f` |
| STEP 44 lock commit | `5f8d5c38bfc9cc6a168707ae0b1b643c99ad46f9` |
| STEP 45A lock commit | `b0f0274f14ae491e34f0bcb85874056d92260f46` |

**STEP 44 remains permanently immutable.** It is not modified in place and its commit is not amended.
This amendment references STEP 44 and records the change beside it.

## 2. Why the amendment is required

STEP 44 froze the validation period, region ranking, exclusion rules, chronological ordering,
first-prefix accumulation, the 6 window / 20 drifter minimum, the 12 window maximum and the ban on
manual selection. STEP 45 executed the metadata part of that rule (Kuroshio 26, Brazil-Malvinas 3,
Agulhas 0; Kuroshio ranks first). STEP 45A then established that the frozen eligibility
representation carries aggregate per-window counts but no per-window eligible drifter identities, and
that no authorised frozen artefact contains them for windows after the validation start. Without
identities the rule cannot compute new IDs per window, cumulative unique drifters, or the first prefix
reaching 20, so the locked rule is unexecutable.

## 3. Old and new authorisation rule

**Old.** The derivation tool's inputs were treated as metadata-only, and observation-dataset access
was prohibited before cohort lock. Result: the rule could not run.

**New.** Limited **read-only** access to the already-frozen STEP 15 observation dataset, solely to
reconstruct the mapping `validation window -> eligible drifter IDs`. The dataset is not regenerated,
not re-downloaded, not modified, not overwritten, and no other observation source may be substituted.

Only the input scope changes. No selection, eligibility, endpoint, statistical or success rule changes.

## 4. Authorised source

| Item | Value |
|---|---|
| Path | `data/research/step15/noaa-gdp-hourly-qc/` |
| Frozen source identity (SHA-256) | `22c0ecffc926d04f02ff2ed57be1bd2cc76c1c9048ac2d77a30a63c3bb2c0841` |
| Identity recorded in | STEP 16 observation manifest `observationSha256`; STEP 35 protocol `inputs.observationSha256` |
| Product | NOAA Global Drifter Program hourly QC dataset (STEP 15 acquisition, no new download) |
| Auxiliary frozen input | `ne_10m_coastline.geojson`, SHA-256 `6f75ae0e0de157b14946e2255eb1f5486d9a13819032e26d4610852d296788f6`, for the coast-distance test only |

The dataset identity must be verified equal to that SHA-256 **before** any content is read. On
mismatch the downstream step reads nothing and reports provenance blocked.

## 5. Purpose of access

Allowed: reconstruct `validation window -> eligible drifter IDs` by applying the frozen STEP 16
E1–E5 and A1–A3 evaluation verbatim to the Kuroshio candidate windows.

Forbidden: model evaluation, trajectory integration, velocity extraction, forcing extraction,
candidate evaluation, baseline evaluation, error calculation, validation scoring, parameter selection,
source selection, bootstrap, hypothesis testing, performance inspection.

## 6. Allowed fields (exactly those the frozen evaluation reads)

| Field | Why it is required |
|---|---|
| ID | drifter identity, the quantity being recovered |
| time | exact UTC sample instant for sample completeness and window membership |
| latitude | coast distance, box membership, displacement and turn criteria |
| longitude | coast distance, box membership, displacement and turn criteria |
| gap | provider gap test (≤ 3600 s) |
| drogue_lost_date | drogue-attached-to-window-end test |
| typebuoy | buoy-type test (SVP / SVPB) |

These are the fields read by `tools/research/select_step16_cohort.py`
(SHA-256 `b318b806216a8c5d1033964a0d2740972068edeeb90abdf99702e49db5c67139`). Any additional field
requires a further amendment; silent field addition is forbidden. Only the minimal identifier, time
and location representation is retained; full observation records are not kept in any committed
artefact.

## 7. Temporal scope

Validation period 2010-11-18T12:00:00Z … 2015-12-31T21:00:00Z. Per candidate window the readable
observation range is the window itself, `[start, start + 72 h]`. Margin before the start: **0 h**.
Margin after the period end: **72 h**, so the latest readable instant is 2016-01-03T21:00:00Z.

No observation before the validation start is required: window membership, separation and frame
coverage are evaluated from frozen metadata, not from observations. Broadening the period for
scientific convenience is forbidden.

## 8. Geographic scope

Region **KE** only, box 30–40 N / 135–160 E, as determined by the frozen STEP 44 ranking executed on
metadata alone. Observation content access for Brazil-Malvinas and Agulhas is **not authorised**;
their counts remain metadata-only. Other regions are not authorised, and the primary Gulf Stream
region is not authorised.

## 9. Cohort rule unchanged

Region KE; chronological ordering; frame coverage required; STEP 16 eligibility verbatim; STEP 20 and
STEP 32 exclusions at ±72 h; 88 excluded drifter IDs with the same list hash; ≥ 72 h start separation;
≥ 1 new eligible ID per selected window; first prefix with ≥ 6 windows and ≥ 20 unique drifters;
maximum 12 windows; no manual add or remove; no performance-based selection.
**No rule is changed by this amendment.**

## 10. STEP 15 is an input source, not a new eligibility rule

The frozen STEP 16 evaluation is applied verbatim. It is forbidden to reinterpret the observations
into a new definition of eligibility, to invent a quality-control rule, to add a spatial or temporal
filter, to remove a drifter because of expected model behaviour, or to select drifters because they
are easier to simulate.

## 11. Data minimisation

The downstream derived artefact carries only: window id, window start, window end, region, eligible
drifter IDs, eligible count, source observation reference. Each mapping must record the source dataset
SHA-256, source file identity, extraction timestamp, exact field names used, exact temporal filter,
exact geographic filter, exact quality-control rule, script SHA-256 and a deterministic derivation
hash. Model forcing, trajectory results, velocity fields and any performance quantity are excluded.

## 12. Primary experiment protection

Theta = **-31.331 km**; 95 % interval **[-72.0725, -11.7435] km**; H1 = SUPPORTED;
candidate = **CANDIDATE_ONLY**; operational promotion = NO. Primary records modified: 0.

**The STEP 40 primary result was NOT used to choose the validation source, region, period, drifters,
or selection rule.** The ranking, period and accumulation rule were fixed in STEP 44 before this
amendment and are unchanged by it; the amendment only authorises the input needed to execute them.

## 13. Leakage control

The STEP 40 result is frozen history. The selection rule was established in STEP 44. STEP 45A found
the identities absent from aggregate metadata. STEP 15 is used only as the upstream identity source.
No validation performance has been observed, no validation trajectory executed, no validation forcing
inspected, no validation model result inspected. No validation outcome may influence the cohort
derivation, and at amendment time no validation outcome exists.

## 14. Amendment history

One entry, `STEP44-AMENDMENT-001-INPUT-SCOPE`, recording field path, old value, new value, reason,
timestamp, commit SHA (pending this amendment's own lock), HEAD at creation, and both access flags as
false. Deterministic amendment identity hash:
`a2481bc695915435d41f94cf53bf4d4f6a40b3e9d23bccc0671b78c346069ed5`.

END OF STEP 45B REPORT
