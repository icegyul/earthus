# STEP 38 — Preregistered source acquisition and data freeze

Rule id `source-acquisition-freeze-step38`; protocol a4dfbcbea656. STEP 37 lock commit 74d19f0a (parent 043a09b8, STEP 36 lock). Cohort consumed as-is (manifest bda31c3ca36a; 9 windows / 20 drifters). No daily field, composite, trajectory, error, delta, endpoint, bootstrap, comparison or performance value was computed; no source was benchmarked or substituted.

ACQUISITION STATUS: SOURCE_ACQUISITION_COMPLETE

## Sources (locked STEP 37 identities)

HYCOM GOFS 3.1 GLBv0.08 expt_53.X 2010, water_u/water_v, vertCoord 15, 0.08 deg, 3 h, NCSS (STEP 17 mechanism), two layouts per window. NCEP-DOE R2 10 m 6 h 2010 (PSL). GLORYS12V1 cmems_mod_glo_phy_my_0.083deg_P1D-m uo/vo at 15.81 m, daily, via the authorized Copernicus toolbox (credential check exit code 0; contents never read). WW3 GLOB-30M CFSR uss 201007-201010 (IFREMER FTP, own fetch).

## Per-window result

| window | HYCOM | candidate | day frames | missing registered frames | overlap equal | chunked | longitude rule |
|---|---|---|---|---|---|---|---|
| GS-Y1 | HYCOM_PASS | CANDIDATE_PASS | 48/48 | - | 25/25 | False | PASS |
| GS-Y2 | HYCOM_PASS | CANDIDATE_PASS | 48/48 | - | 25/25 | False | PASS |
| GS-Y3 | HYCOM_PASS | CANDIDATE_PASS | 48/48 | - | 25/25 | False | PASS |
| GS-Y4 | HYCOM_PASS | CANDIDATE_PASS | 48/48 | - | 25/25 | False | PASS |
| GS-Y5 | HYCOM_PASS | CANDIDATE_PASS | 48/48 | - | 25/25 | False | PASS |
| GS-Y6 | HYCOM_PASS | CANDIDATE_PASS | 48/48 | - | 25/25 | False | PASS |
| GS-Y7 | HYCOM_PASS | CANDIDATE_PASS | 48/48 | - | 25/25 | False | PASS |
| GS-Y8 | HYCOM_PASS | CANDIDATE_PASS | 48/48 | - | 25/25 | False | PASS |
| GS-Y9 | HYCOM_PASS | CANDIDATE_PASS | 48/48 | - | 25/25 | False | PASS |

## WW3 files

| month | file | status | bytes | SHA-256 | retrieved |
|---|---|---|---|---|---|
| 201007 | WW3-GLOB-30M_201007_uss.nc | ok | 75860673 | cb3eae533079 | 2026-09-07T02:32:12Z |
| 201008 | WW3-GLOB-30M_201008_uss.nc | ok | 76342282 | 4825781512ad | 2026-09-07T02:34:40Z |
| 201009 | WW3-GLOB-30M_201009_uss.nc | ok | 74109421 | 876d040e308b | 2026-09-07T02:36:58Z |
| 201010 | WW3-GLOB-30M_201010_uss.nc | ok | 75590229 | 7d5c7778e5cc | 2026-09-07T02:38:45Z |

## GLORYS subsets

| window | status | bytes | SHA-256 | normalized shape | depth level (m) |
|---|---|---|---|---|---|
| GS-Y1 | ok | 563554 | bdb93066f475 | [6, 90, 248] | 15.810070037841797 |
| GS-Y2 | ok | 206626 | 1112ee61c877 | [6, 56, 133] | 15.810070037841797 |
| GS-Y3 | ok | 114274 | e03173a12eab | [6, 60, 60] | 15.810070037841797 |
| GS-Y4 | ok | 114274 | 952097b208df | [6, 60, 60] | 15.810070037841797 |
| GS-Y5 | ok | 114286 | c3794c852788 | [6, 60, 60] | 15.810070037841797 |
| GS-Y6 | ok | 117152 | 712108eed606 | [6, 61, 61] | 15.810070037841797 |
| GS-Y7 | ok | 81154 | 8a8164a04d6d | [6, 37, 60] | 15.810070037841797 |
| GS-Y8 | ok | 114248 | 8530a219c9ff | [6, 60, 60] | 15.810070037841797 |
| GS-Y9 | ok | 400354 | 71b79eb68925 | [6, 80, 194] | 15.810070037841797 |

## Longitude / coordinate result

STEP 36 boxes are -180..180. The NCSS returned -180..180 axes for this dataset; the reader axis covers every box in the box convention; no transform applied (per-window results above). NCEP requests use the STEP 17 0..360 request convention with the frozen runtime's longitude unwrap at lookup (unchanged code).

## Data freeze

Artefacts: {'A_ORIGINAL_SOURCE': 121, 'B_DERIVED_REPACKAGED': 27, 'C_METADATA': 4, 'D_ACQUISITION_LOG': 1}; bytes: {'A_ORIGINAL_SOURCE': 320067871, 'B_DERIVED_REPACKAGED': 71432236, 'C_METADATA': 481343}. Originals (121 files) are immutable from 2026-09-07T02:51:02Z; derived runtime datasets (HYCOM condition A incl. B-3 chunks, wind, GLORYS) are stored under data/research/step38/forcing/normalized/ and linked to the original SHA-256 values; metadata and the acquisition log (embedded per request in the acquisition manifest) are classified C / D.

## Flags

scientific experiment executed NO · trajectory executed NO · model executed NO · parameter tuning NO · forcing selection NO · endpoint / bootstrap NO · STEP 37 modified NO · STEP 36 modified NO · forbidden input access 0 · automatic commit NO.
