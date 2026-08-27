# tropical-intelligence — EARTHUS 2.0 15-day tropical guidance

This Lambda is a **MODEL_GUIDANCE** pipeline. It does not replace official KMA/JMA tropical-cyclone advisories and it does not extend an official track with a fake long-range line.

## Output contract

- Latest: `events/tropical-guidance-v2.json`
- Archive: `archive/tropical-intelligence/<YYYYMMDDHH>.json`
- Provider: ECMWF Open Data
- Licence: CC-BY-4.0 — ECMWF

The existing legacy/compatibility output `events/typhoon-ecmwf.json` remains owned by `ecmwf-ingest` and stays capped at 120 h.

### 0–120 h

Not produced as an official product here. Earthus UI must use the separate KMA/JMA official pipeline for the visually dominant 0–5 day track/advisory.

### 120–240 h — named systems

`namedSystems[].systems[].members[]` contains raw IFS ENS / AIFS ENS member segments only.

- no averaged track
- no deterministic extension presented as official
- member support is exposed by forecast hour
- UI may visualize the member spread as a translucent ensemble corridor / density, always labelled `MODEL_GUIDANCE`

### 246–360 h — genesis outlook

Unnamed ECMWF forecast-genesis systems are retained only for 11–15 day candidate zones.

For every ensemble member, only the first forecast point of an unnamed system is used as a genesis signal. Signals are deduplicated per model/member/time/space cell and aggregated into:

- 5° grid cells
- 24 h lead-time windows
- raw supporting member count per model
- number of independent model systems
- run-to-run persistence against up to three archived cycles

A candidate is an Earthus internal `GENESIS_ZONE`, not an official tropical cyclone. `officialName` remains `null` and `nameAssignment` remains `NOT_ASSIGNED` until the responsible official centre actually assigns a name.

## Probability rule

`memberSupport / totalMembers` is **not** labelled as a calibrated probability.

The output may say:

- `ECMWF IFS ENS: 12 supporting members / 50`
- `ECMWF AIFS ENS: 15 supporting members / 52`
- `independentModelSystems: 2`
- `agreement: HIGH`
- `runPersistenceCycles: 3`

It must not silently turn `12/50` into `24% chance of typhoon formation`.

The simple agreement label is transparent metadata, not a probability:

- `HIGH`: two or more independent model systems, each with at least five raw supporting members in the same time/space cell
- `MEDIUM`: two or more systems agree but one has fewer than five raw supporting members
- `LOW`: one system only

## Model systems

### Connected in this Lambda

- `ECMWF_IFS_ENS` — physics ensemble, 00/12 runs selected for the 360 h horizon
- `ECMWF_AIFS_ENS` — AI ensemble, same selected 00/12 run

Both use ECMWF tropical-cyclone track BUFR (`stream=enfo`, `type=tf`).

### Adapter pending

- `KIM_EPS`

KIM EPS must not be reported as connected until a verified real-time ingestion path and runtime evidence exist. When added, it joins the same model-system contract instead of changing the UI schema.

## Public/legal feature gate

The output itself declares:

- `provenanceClass = MODEL_GUIDANCE`
- official 0–5 day products are separate
- 6–10 day content is ensemble guidance
- 11–15 day content is genesis-zone guidance only
- calibrated Earthus probability is disabled until verified/approved

Changing a label is not considered a substitute for any required weather-business/compliance review.

## Runtime behaviour

1. Choose the newest sufficiently delayed 00/12 UTC run.
2. Prefer a run where both IFS ENS and AIFS ENS TC BUFR exist.
3. Download only TC BUFR, not large atmospheric GRIB fields.
4. Decode with ecCodes.
5. Build named-system 120–240 h raw ensemble segments.
6. Build unnamed 246–360 h genesis candidate zones.
7. Compare candidate zones with up to three archived cycles for persistence.
8. Write latest + immutable run archive.

If one model is unavailable, the available system may still produce data but the missing model is explicitly marked `UNAVAILABLE_FOR_SELECTED_RUN`. Cross-model agreement then cannot become HIGH/MEDIUM.

## Required Lambda environment

- `CACHE_BUCKET`
- `CACHE_REGION`

The execution role needs:

- `s3:GetObject`
- `s3:PutObject`
- `s3:ListBucket` (archive persistence lookup)

## Packaging

Use `aws/deploy-tropical-intelligence.sh`. The Lambda requires the same ecCodes binary stack already proven by `ecmwf-ingest`; do not replace it with a giant generic meteorological image.

## Schedule

Use `aws/configure-tropical-intelligence-operations.sh` after deployment. The intended schedule is after the 00/12 UTC model cycles have had sufficient time to reach Open Data. Runtime logs and the actual S3 output must be verified before the UI treats this provider as READY.
