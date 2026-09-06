# STEP 27B-r2 — D20 native depth identity resolution (Phase A: preregistration revision only)

Rule id: `d20-depth-identity-step27b-r2`. Base commit: d242165d (STEP 27B record, STEP27B_PARTIAL_COVERAGE). Non-superseding revision: no STEP 27 or STEP 27B file is modified. Machine-readable: `docs/research/step27b-r2-rule.json`.

## 1. What was ambiguous

The locked STEP 27 rule (`step27-depth-rule.json`, SHA 60343529…) defines D20 as the single native GLORYS level nearest the target 20 m, and records an expected native value of 21.598816 m. The native level inventory recorded from client metadata in the STEP 27B protocol (`step27b-depth-acquisition-protocol.json`, SHA 38be0a2e…; 50 levels: … 3.819495, 5.078224, 6.440614, 7.929560, 9.572997, 11.405000, 13.467140, 15.810070, 18.495560, 21.598816 …) shows:

| candidate | distance from 20.000000 m |
|---|---|
| 18.495560 m | 1.504440 m |
| 21.598816 m | 1.598816 m |

The literal nearest native level to 20 m is 18.495560 m; the recorded expected value named a different level. STEP 27B therefore left D20 unacquired (DEPTH_IDENTITY_AMBIGUOUS) rather than let the executor choose.

## 2. Resolution (locked here)

**D20 = 18.495560 m**, by the literal nearest-native-depth rule of STEP 27 (target 20 m; distance 1.504440 m < 1.598816 m). D20 is NOT 21.598816 m. The decision uses only the STEP 27 rule text and the level inventory: no trajectory, M3, M1, M2, M4 or M5 value of any depth was inspected or exists (STEP 27 model run count 0). The expected-value entry in the STEP 27 rule file is superseded by this revision for D20 only; that file itself stays byte-unchanged.

## 3. Preserved conditions

D05 = 5.078224 m (acquired, DEPTH_READY, STEP 27B), D10 = 9.572997 m (acquired, DEPTH_READY, STEP 27B), D15 = 15.810070 m (STEP 25B/25C, control). No re-acquisition, no modification; their file SHAs remain those recorded in the STEP 25B and STEP 27B manifests.

## 4. No vertical interpolation

D20 uses exactly the stored 18.495560 m level. No interpolation, averaging, weighting or multi-level extraction (in particular none between 15.810070 and 18.495560 m or between 18.495560 and 21.598816 m).

## 5. Later acquisition plan (STEP 27C, not executed here)

Same product GLOBAL_MULTIYEAR_PHY_001_030 / cmems_mod_glo_phy_my_0.083deg_P1D-m, variables uo/vo, the seven STEP 25B windows (KE-1, KE-2, AG-1, AG-2, KE-H1, KE-H2 coverage-fact-only, KE-H3), the STEP 25B subset boxes, days t0−1 d … end+1 d; request `-z 20 -Z 20 --coordinates-selection-method nearest` (single native level), returned level must be 18.495560 m within 0.01 m (DEPTH_IDENTITY_FAIL otherwise); gates G1–G11 as in STEP 27B; no gap repair, no interpolation, no substitution, no alternate depth.

## 6. Phase A scope

This revision acquires nothing, runs nothing, compares nothing, chooses no operational depth. Model run count 0; depth comparisons 0; D20 acquisitions 0; new observations 0.
