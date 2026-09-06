"""STEP 22 — FORCING / OBSERVATION ADEQUACY & MODEL REQUIREMENT ANALYSIS (descriptive / requirement analysis only).
Reads the FROZEN STEP 21 diagnostic summary (SHA-verified) and the STEP 17/20 records; emits the limitation assessment (L1–L8),
the physical-process inventory, the error-signature → requirement map, the data requirement register (DATA-01..08), the future test
matrix (TEST-01..08), the model development gate answers, a summary JSON and a summary CSV. Every number is copied from STEP 21 /
STEP 20 records; every evidence label is one of DIRECTLY_SUPPORTED / SUPPORTED_INDICATION / PLAUSIBLE_BUT_UNTESTED /
INSUFFICIENT_EVIDENCE; no causal wording; no model run; no data download. Deterministic (`--out DIR` for the re-run)."""
import csv
import hashlib
import io
import json
import math
import sys
from datetime import datetime, timezone
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
LOCKED = {"docs/research/step21-diagnostic-summary.json": "d310eaadf64324286de80e485e9944998665d14d2599ca80133cf3d25b406fbd", "docs/research/step21-diagnostic-table.csv": "e52dc35d6750cc7260e05341d48b7eaa886dfc389f1880547a39b184dbdbbe78",
          "docs/research/step20-b6-holdout-summary.json": "fe2043b30aaba17d34e3d9a780379de9612541b75caa4ed487a10931a784d93b", "docs/research/step20-selected-alpha.json": "68e43a0f91e3a6bd81427399adbe2cf8a7543d85cf0249d4926f3df093649efd",
          "docs/research/step17-forcing-manifest.json": "591cc05799da03e6bb604321d9e2b129a32a201112922c4d06823026a0b5ac86", "docs/research/step20-b3-holdout-forcing-manifest.json": "10c4f7420d16757b7cd3f23805ce63dde1f58ea63591e8dc9411647d7bc27701"}
LABELS = ("DIRECTLY_SUPPORTED", "SUPPORTED_INDICATION", "PLAUSIBLE_BUT_UNTESTED", "INSUFFICIENT_EVIDENCE")
PRIORITIES = {"P0": "essential; next model improvement cannot proceed without it", "P1": "high value; strongly recommended for the next validation", "P2": "supporting", "P3": "insufficient current evidence"}
AVAIL = ("AVAILABLE", "PARTIAL", "UNAVAILABLE", "UNKNOWN")


def sha(path):
    return hashlib.sha256(Path(path).read_bytes()).hexdigest()


def load(path):
    return json.loads(Path(path).read_text(encoding="utf-8"))


def main(argv=None):
    argv = list(sys.argv[1:] if argv is None else argv)
    out = Path(argv[argv.index("--out") + 1]) if "--out" in argv else ROOT / "docs/research"
    out.mkdir(parents=True, exist_ok=True)
    for rel, expected in LOCKED.items():
        if sha(ROOT / rel) != expected:
            print(json.dumps({"status": "STEP22_BLOCKED_IMMUTABILITY", "file": rel})); return 2
    s21 = load(ROOT / "docs/research/step21-diagnostic-summary.json"); h20 = load(ROOT / "docs/research/step20-b6-holdout-summary.json")
    C, Hd = s21["overall"]["CALIBRATION"], s21["overall"]["HOLDOUT"]; U = s21["perUnit"]; R = s21["perRegionCalibration"]
    grid_km = {u: {"latitudeUsedDeg": lat, "dxKm": round(0.08 * 111.32 * math.cos(math.radians(lat)), 2), "dyKm": round(0.08 * 111.32, 2)} for u, lat in (("KE-1", 33.0), ("KE-2", 35.0), ("AG-1", -36.0), ("AG-2", -37.0), ("KE-H1", 35.0), ("KE-H3", 34.5))}
    # ---------- frozen evidence (numbers copied from STEP 21 / STEP 20) ----------
    ev = {"A_temporalGrowth": {"calibration": {"E24_E48_E72_median_a002": [C["a002"]["E24"]["median"], C["a002"]["E48"]["median"], C["a002"]["E72"]["median"]], "growth48_24_median": C["a002"]["growth_48_24"]["median"], "growth72_48_median": C["a002"]["growth_72_48"]["median"], "ratio72_24_median": C["a002"]["growth_ratio_72_24"]["median"], "classA": C["a002"]["growth_class_counts"]["A"], "n": C["n"]},
                               "holdout": {"E24_E48_E72_median_a002": [Hd["a002"]["E24"]["median"], Hd["a002"]["E48"]["median"], Hd["a002"]["E72"]["median"]], "growth48_24_median": Hd["a002"]["growth_48_24"]["median"], "growth72_48_median": Hd["a002"]["growth_72_48"]["median"], "ratio72_24_median": Hd["a002"]["growth_ratio_72_24"]["median"], "classA": Hd["a002"]["growth_class_counts"]["A"], "n": Hd["n"]}},
          "B_regionalEvent": {"KE_E72_median_a002": R["KE"]["a002"]["E72"]["median"], "AG_E72_median_a002": R["AG"]["a002"]["E72"]["median"], "KE_obsDisp72_median": R["KE"]["obs_disp_72h"]["median"], "AG_obsDisp72_median": R["AG"]["obs_disp_72h"]["median"],
                              "highestErrorCases": {"calibration": C["highest_error_cases_72h_a002"], "holdout": Hd["highest_error_cases_72h_a002"]}, "top1ShareOfSumE72": {"calibration": C["top1_share_of_sum_E72_a002"], "holdout": Hd["top1_share_of_sum_E72_a002"]}},
          "C_directional": {"bearingDiff72_median_a002": {"calibration": C["a002"]["bearing_diff_72h"]["median"], "holdout": Hd["a002"]["bearing_diff_72h"]["median"]}, "eastOffset72_median_a002": {"calibration": C["a002"]["east_offset_72h"]["median"], "holdout": Hd["a002"]["east_offset_72h"]["median"]},
                            "westCount72_a002": {"calibration": C["a002"]["east_sign_counts_72h"], "holdout": Hd["a002"]["east_sign_counts_72h"]}, "northOffset72_median_a002": {"calibration": C["a002"]["north_offset_72h"]["median"], "holdout": Hd["a002"]["north_offset_72h"]["median"], "AG": R["AG"]["a002"]["north_offset_72h"]["median"], "KE": R["KE"]["a002"]["north_offset_72h"]["median"]}},
          "D_alphaEffect": {"delta_median": {"calibration": [C["delta_24h"]["median"], C["delta_48h"]["median"], C["delta_72h"]["median"]], "holdout": [Hd["delta_24h"]["median"], Hd["delta_48h"]["median"], Hd["delta_72h"]["median"]]}, "holdoutWinsLosses72": {"neg": Hd["delta_sign_counts_72h"]["neg"], "pos": Hd["delta_sign_counts_72h"]["pos"]},
                            "step20HoldoutConclusion": s21["step20FrozenReference"]},
          "E_largeFailures": {"calibration": C["highest_error_cases_72h_a002"], "holdout": Hd["highest_error_cases_72h_a002"]},
          "F_windageOrthogonal": {"alphaSeparation72_median": {"calibration": C["alpha_sep_72h"]["median"], "holdout": Hd["alpha_sep_72h"]["median"]}, "towardObservation72_median": {"calibration": C["windage_toward_obs_72h"]["median"], "holdout": Hd["windage_toward_obs_72h"]["median"]}},
          "G_magnitude": {"dispRatio72_median_a002": {"calibration": C["a002"]["disp_ratio_72h"]["median"], "holdout": Hd["a002"]["disp_ratio_72h"]["median"], "AG": R["AG"]["a002"]["disp_ratio_72h"]["median"]}, "pathRatioHourly72_median_a002": {"calibration": C["a002"]["path_ratio_hourly_72h"]["median"], "holdout": Hd["a002"]["path_ratio_hourly_72h"]["median"], "AG": R["AG"]["a002"]["path_ratio_hourly_72h"]["median"]}}}
    baseline = {"ocean": "HYCOM GOFS 3.1 GLBv0.08 expt_53.X, 0.08 deg, 15 m, 3 h", "wind": "NCEP-DOE Reanalysis 2, 10 m, 6 h (T62 Gaussian ~1.9 deg)", "equation": "dX/dt = U_ocean + alpha * U_wind", "alpha": 0.002, "baselineAlpha": 0.0,
                "integration": "RK4, 300 s substep, 900 s output, bilinear spatial, linear temporal, cos(phi) at every RK4 stage", "excluded": ["extrapolation", "smoothing", "zero-fill", "land substitution", "frame duplication"],
                "gridScaleKm": grid_km, "oceanFrameSeconds": 10800, "windFrameSeconds": 21600, "drifterType": "SVP/SVPB, 15 m drogue attached through the window (STEP 15 E1/E2)", "observationSampling": "hourly (GDP hourly QC); model output 900 s; STEP 21 path ratios hourly/hourly"}
    # ---------- limitation assessment L1–L8 ----------
    L = [
        {"id": "L1", "category": "Ocean spatial resolution", "represents": "0.08 deg regular grid (dx 7.1–7.5 km, dy 8.9 km at the unit latitudes); bilinear interpolation; features narrower than ~2 cells (15–18 km) are not resolved",
         "doesNotRepresent": "sub-grid fronts, narrow jets, eddy edges, coastal gradients finer than the grid; sub-grid turbulence", "expectedSignature": "growing, region/event-dependent errors; large bearing differences where the drifter follows unresolved structure",
         "evidence": {"AG_vs_KE_E72": [ev["B_regionalEvent"]["AG_E72_median_a002"], ev["B_regionalEvent"]["KE_E72_median_a002"]], "highestErrorCases": ev["E_largeFailures"], "bearingDiff72": ev["C_directional"]["bearingDiff72_median_a002"]},
         "evidenceStrength": "PLAUSIBLE_BUT_UNTESTED", "reason": "regional/event-scale divergence is observed, but no higher-resolution comparison exists to attribute it to spatial resolution rather than to model dynamics, forcing timing or missing processes", "additionalDataRequired": True, "priority": "P1", "priorityReason": "large regional/event errors are the dominant error mass; a resolution comparison is the most direct test, but it needs a product not in the repository"},
        {"id": "L2", "category": "Ocean temporal resolution", "represents": "3 h instantaneous fields, linear in time; variability faster than ~6 h (2 frames) is not represented; inertial period at 33–37 deg is ~20 h and is nominally sampled", "doesNotRepresent": "sub-3 h variability, tidal currents at the frame cadence, transient wind-driven surface response",
         "expectedSignature": "steady error growth with time; not specific to region", "evidence": {"errorGrowth": ev["A_temporalGrowth"]}, "evidenceStrength": "SUPPORTED_INDICATION",
         "reason": "monotonic growth in 25/35 drifters and 72 h/24 h median ratio 2.5–3.1 is consistent with unresolved temporal variability, but the same signature also arises from chaotic advection with resolved forcing; no higher-frequency forcing test exists", "additionalDataRequired": True, "priority": "P2", "priorityReason": "growth is consistent with several limitations; the test is cheap (same product, hourly where available) but the discriminating power is uncertain"},
        {"id": "L3", "category": "Forcing depth / vertical representativeness", "represents": "a single 15 m velocity applied to 15 m-drogued drifters", "doesNotRepresent": "surface–15 m shear, mixed-layer shear, drogue slip, vertical structure below/above 15 m",
         "expectedSignature": "systematic magnitude offset if the represented depth is wrong; wind-aligned residuals", "evidence": {"dispRatio72": ev["G_magnitude"]["dispRatio72_median_a002"], "pathRatio72": ev["G_magnitude"]["pathRatioHourly72_median_a002"]},
         "evidenceStrength": "INSUFFICIENT_EVIDENCE", "reason": "median displacement ratios near 1.07–1.20 do not show a systematic magnitude offset; no multi-depth velocity or mixed-layer information exists in the repository to test depth representativeness", "additionalDataRequired": True, "priority": "P2", "priorityReason": "multi-depth HYCOM levels are acquirable under the existing forcing protocol, making a depth-sensitivity test feasible, but current evidence does not point to depth"},
        {"id": "L4", "category": "Wind forcing resolution / windage representation", "represents": "scalar windage alpha*U10 with 6 h, ~1.9 deg wind", "doesNotRepresent": "sub-6 h wind variability, mesoscale wind structure, wind-driven surface layer (Ekman/shear), Stokes drift",
         "expectedSignature": "if windage were the missing term, alpha>0 would move endpoints toward observations consistently", "evidence": {"alphaEffect": ev["D_alphaEffect"], "windageOrthogonal": ev["F_windageOrthogonal"]},
         "evidenceStrength": "SUPPORTED_INDICATION", "reason": "the windage term exists and separates trajectories by ~3.5–3.7 km at 72 h, yet the paired error effect is small, unit-dependent (holdout 6/6) and the windage displacement is nearly orthogonal to the error vector (medians -0.004 / +0.016): a diagnostic indication that scalar windage alone does not address the observed error; wind resolution itself is untested", "additionalDataRequired": True, "priority": "P2", "priorityReason": "further alpha tuning is not indicated; higher-resolution wind is a supporting test only"},
        {"id": "L5", "category": "Sub-grid / mesoscale / eddy processes", "represents": "eddies resolved by the 0.08 deg reanalysis with data assimilation", "doesNotRepresent": "eddies/meanders mispositioned or mistimed in the reanalysis, sub-mesoscale features", "expectedSignature": "large, event-specific endpoint divergences with large bearing differences; region dependence",
         "evidence": {"highestErrorCases": ev["E_largeFailures"], "regional": ev["B_regionalEvent"], "top1Share": ev["B_regionalEvent"]["top1ShareOfSumE72"]}, "evidenceStrength": "SUPPORTED_INDICATION",
         "reason": "the largest errors are individual high-displacement events (AG-2 353 km observed vs 24 km modeled; AG-1 pair with 73–74 deg bearing difference; KE-H3 98996 with 153 deg bearing difference) — consistent with mispositioned mesoscale structure, but no eddy attribution has been performed", "additionalDataRequired": True, "priority": "P1", "priorityReason": "event-scale failures dominate the error mass; an independent surface-current/altimetry reference is required to test this"},
        {"id": "L6", "category": "Coastal / bathymetric interaction", "represents": "provider wet mask only; cohort rule required > 100 km from the Natural Earth coastline at t0", "doesNotRepresent": "bathymetric steering, shelf currents, nearshore circulation",
         "expectedSignature": "errors concentrated near coasts/shelf edges", "evidence": {"cohortCoastRuleKm": 100, "runtimeStatuses": "all 35 trajectories COMPLETED; 0 FORCING_UNAVAILABLE/STRANDED in STEP 20 runs"}, "evidenceStrength": "INSUFFICIENT_EVIDENCE",
         "reason": "all drifters started > 100 km offshore and no trajectory reached the land mask; no bathymetry is in the repository; no coastal signature is identifiable from the STEP 21 metrics", "additionalDataRequired": True, "priority": "P3", "priorityReason": "no current indication; bathymetry would only matter for a future nearshore cohort"},
        {"id": "L7", "category": "Observation sampling / observation uncertainty", "represents": "hourly GDP QC positions, exact-timestamp matching, 73 samples per 72 h window (gap <= 1 h)", "doesNotRepresent": "sub-hourly drifter motion in path length; positional uncertainty of the GPS/Argos fix is not quantified in the repository",
         "expectedSignature": "observed hourly path shorter than the true path; noise floor in 24 h errors", "evidence": {"obsPath72_median": {"calibration": C["obs_path_hourly_72h"]["median"], "holdout": Hd["obs_path_hourly_72h"]["median"]}, "modelHourlyVs900s": "STEP 21 path ratios hourly/hourly", "E24_median": {"calibration": C["a002"]["E24"]["median"], "holdout": Hd["a002"]["E24"]["median"]}},
         "evidenceStrength": "PLAUSIBLE_BUT_UNTESTED", "reason": "24 h median errors (13–25 km) are far above any plausible fix uncertainty, so observation error is unlikely to dominate, but no uncertainty metadata exists to bound it; sampling limits path-length comparisons only", "additionalDataRequired": True, "priority": "P2", "priorityReason": "position-uncertainty and drogue metadata are needed to bound the noise floor and to interpret windage"},
        {"id": "L8", "category": "Missing physical processes (Stokes drift, mixed-layer processes, other surface transport)", "represents": "Eulerian 15 m advection + scalar windage", "doesNotRepresent": "Stokes drift, wave–current interaction, mixed-layer/Ekman shear, sub-grid turbulence (no diffusion), inertial oscillation response beyond the reanalysis",
         "expectedSignature": "wind/wave-aligned residuals not captured by scalar windage; error growth", "evidence": {"windageOrthogonal": ev["F_windageOrthogonal"], "alphaEffect": ev["D_alphaEffect"]}, "evidenceStrength": "PLAUSIBLE_BUT_UNTESTED",
         "reason": "the near-orthogonality of the windage displacement to the error vector indicates that the missing transport is not along U10; Stokes drift is wave-direction dependent and untested; no wave data exist in the repository", "additionalDataRequired": True, "priority": "P1", "priorityReason": "a wave/Stokes product enables a physically distinct transport term test without parameter tuning"},
    ]
    inventory = [
        {"term": "Stokes drift", "inModel": False, "relevance": "surface transport aligned with wave direction, distinct from U10", "evidenceStrength": "PLAUSIBLE_BUT_UNTESTED", "requiredData": ["DATA-06"], "testPriority": "P1"},
        {"term": "surface windage / slip", "inModel": True, "relevance": "represented as alpha*U10 (alpha 0.002 locked); small, inconsistent paired effect", "evidenceStrength": "SUPPORTED_INDICATION", "requiredData": ["DATA-05"], "testPriority": "P3", "note": "no further alpha search"},
        {"term": "mixed-layer shear", "inModel": False, "relevance": "surface–15 m velocity difference", "evidenceStrength": "INSUFFICIENT_EVIDENCE", "requiredData": ["DATA-04"], "testPriority": "P2"},
        {"term": "vertical shear (below drogue)", "inModel": False, "relevance": "drogue integrates a layer, not a level", "evidenceStrength": "INSUFFICIENT_EVIDENCE", "requiredData": ["DATA-04", "DATA-05"], "testPriority": "P2"},
        {"term": "mesoscale eddies (position/timing)", "inModel": "partially (reanalysis-resolved)", "relevance": "event-scale failures", "evidenceStrength": "SUPPORTED_INDICATION", "requiredData": ["DATA-01", "DATA-03"], "testPriority": "P1"},
        {"term": "sub-grid turbulence / diffusion", "inModel": False, "relevance": "deterministic model has no dispersion; single-trajectory comparison", "evidenceStrength": "PLAUSIBLE_BUT_UNTESTED", "requiredData": ["DATA-01"], "testPriority": "P2"},
        {"term": "coastal / bathymetric effects", "inModel": False, "relevance": "not indicated for the offshore cohorts", "evidenceStrength": "INSUFFICIENT_EVIDENCE", "requiredData": ["DATA-08"], "testPriority": "P3"},
        {"term": "wave–current interaction", "inModel": False, "relevance": "untested", "evidenceStrength": "PLAUSIBLE_BUT_UNTESTED", "requiredData": ["DATA-06"], "testPriority": "P2"},
    ]
    mapping = [
        {"errorSignature": "temporal error growth (monotonic in 25/35; E72/E24 median 2.5–3.1)", "possibleLimitation": "unresolved temporal variability (L2) and/or chaotic advection with resolved forcing", "evidence": ev["A_temporalGrowth"], "confidence": "SUPPORTED_INDICATION", "requiredData": ["DATA-02"], "candidateTest": "TEST-01"},
        {"errorSignature": "directional error (west offset 24/35; bearing diff medians 18–45 deg)", "possibleLimitation": "unresolved circulation / forcing bias (L1, L5)", "evidence": ev["C_directional"], "confidence": "PLAUSIBLE_BUT_UNTESTED", "requiredData": ["DATA-01", "DATA-03"], "candidateTest": "TEST-03"},
        {"errorSignature": "large displacement failure (AG-2 353 vs 24 km; AG-1 pair; KE-H3 98996)", "possibleLimitation": "unresolved regional/event-scale circulation (L5, L1)", "evidence": ev["E_largeFailures"], "confidence": "SUPPORTED_INDICATION", "requiredData": ["DATA-01", "DATA-03"], "candidateTest": "TEST-07"},
        {"errorSignature": "windage inconsistency (small paired effect, orthogonal to error)", "possibleLimitation": "scalar windage alone insufficient (L4, L8)", "evidence": ev["F_windageOrthogonal"], "confidence": "SUPPORTED_INDICATION", "requiredData": ["DATA-06", "DATA-05"], "candidateTest": "TEST-06", "note": "no immediate alpha tuning"},
        {"errorSignature": "regional difference (AG E72 ~2.6x KE with 2.2x observed displacement)", "possibleLimitation": "regime-dependent forcing skill (L1, L5)", "evidence": ev["B_regionalEvent"], "confidence": "SUPPORTED_INDICATION", "requiredData": ["DATA-01", "DATA-03"], "candidateTest": "TEST-07"},
        {"errorSignature": "no systematic magnitude offset at the median (disp ratio 1.07–1.20)", "possibleLimitation": "depth representativeness not indicated (L3)", "evidence": ev["G_magnitude"], "confidence": "INSUFFICIENT_EVIDENCE", "requiredData": ["DATA-04"], "candidateTest": "TEST-04"},
    ]
    register = [
        {"id": "DATA-01", "data": "higher-resolution ocean current (e.g. 1/12 deg or finer, eddy-resolving)", "availability": "UNAVAILABLE", "repositoryState": "only HYCOM 0.08 deg expt_53.X; GLORYS 1/12 deg BLOCKED/PENDING (credentials) since STEP 17", "priority": "P1", "priorityReason": "needed for TEST-02/TEST-07 addressing the dominant regional/event errors", "acquisitionNote": "not downloaded; requires a new forcing preregistration"},
        {"id": "DATA-02", "data": "higher-frequency ocean forcing (hourly)", "availability": "UNAVAILABLE", "repositoryState": "expt_53.X provides 3 h; hourly surface fields exist only in later HYCOM experiments (different product)", "priority": "P2", "priorityReason": "TEST-01 discriminating power uncertain", "acquisitionNote": "not downloaded"},
        {"id": "DATA-03", "data": "surface current / altimetry reference (geostrophic + Ekman products, SSH anomaly, EKE)", "availability": "UNAVAILABLE", "repositoryState": "none in repository", "priority": "P1", "priorityReason": "independent reference to test unresolved circulation (TEST-03)", "acquisitionNote": "not downloaded"},
        {"id": "DATA-04", "data": "mixed-layer / vertical current information (multi-depth velocity, MLD)", "availability": "UNAVAILABLE", "repositoryState": "HYCOM 15 m only in repository; other depths acquirable via the same NCSS protocol; MLD not present", "priority": "P2", "priorityReason": "depth sensitivity (TEST-04); current evidence does not indicate depth", "acquisitionNote": "not downloaded"},
        {"id": "DATA-05", "data": "drifter metadata: drogue status/depth, windage characteristics, position uncertainty", "availability": "PARTIAL", "repositoryState": "GDP hourly QC carries typebuoy (SVP/SVPB) and drogue_lost_date (used in STEP 15 E1/E2); no position-uncertainty or windage-characteristic fields", "priority": "P2", "priorityReason": "bounds the observation noise floor and interprets windage (L7)", "acquisitionNote": "GDP metadata file not downloaded"},
        {"id": "DATA-06", "data": "wave / Stokes drift information", "availability": "UNAVAILABLE", "repositoryState": "none", "priority": "P1", "priorityReason": "enables TEST-06, a physically distinct transport term", "acquisitionNote": "not downloaded"},
        {"id": "DATA-07", "data": "higher-resolution wind forcing (e.g. ERA5 0.25 deg hourly)", "availability": "UNAVAILABLE", "repositoryState": "NCEP-R2 only; ERA5 noted in STEP 17 as requiring credentials and a separate preregistration", "priority": "P2", "priorityReason": "supporting; windage not indicated as the primary missing term", "acquisitionNote": "not downloaded"},
        {"id": "DATA-08", "data": "bathymetry / coastal circulation information", "availability": "PARTIAL", "repositoryState": "Natural Earth 1:10m coastline (STEP 15 E4) only; no bathymetry", "priority": "P3", "priorityReason": "no coastal signature for the offshore cohorts", "acquisitionNote": "not downloaded"},
    ]
    tests = [
        {"id": "TEST-01", "name": "higher temporal resolution ocean forcing", "hypothesis": "error growth rate decreases with hourly forcing", "requiredData": ["DATA-02"], "dependentVariable": "M3 at 24/48/72 h, growth E72/E24", "control": "frozen baseline (3 h, alpha 0.002 and 0)", "risk": "product change confounds cadence with model version"},
        {"id": "TEST-02", "name": "higher spatial resolution ocean forcing", "hypothesis": "event-scale endpoint divergence decreases", "requiredData": ["DATA-01"], "dependentVariable": "M3 72 h, bearing difference, highest-error cases", "control": "frozen baseline", "risk": "different assimilation system; regime differences"},
        {"id": "TEST-03", "name": "surface current product comparison", "hypothesis": "an independent surface-current reference reduces directional error", "requiredData": ["DATA-03"], "dependentVariable": "bearing difference, east/north offsets", "control": "frozen baseline", "risk": "geostrophic products omit ageostrophic surface flow"},
        {"id": "TEST-04", "name": "depth sensitivity", "hypothesis": "trajectories forced at 0/5/10/15/20 m differ measurably; 15 m is or is not the closest to observations", "requiredData": ["DATA-04"], "dependentVariable": "M3, displacement ratio", "control": "15 m frozen baseline", "risk": "multiple comparisons; must be preregistered with a fixed depth set and no post-hoc selection"},
        {"id": "TEST-05", "name": "windage-only sensitivity (structural, not alpha search)", "hypothesis": "windage direction relative to the error vector is unit-dependent", "requiredData": ["DATA-05"], "dependentVariable": "windage-toward-observation projection", "control": "alpha 0", "risk": "must not become an alpha search; alpha stays 0.002"},
        {"id": "TEST-06", "name": "Stokes drift inclusion", "hypothesis": "a wave-direction transport term reduces the orthogonal residual", "requiredData": ["DATA-06"], "dependentVariable": "M3, projection of added term onto the error vector", "control": "frozen baseline", "risk": "new term requires its own preregistration and calibration/holdout separation"},
        {"id": "TEST-07", "name": "eddy-resolving forcing comparison (event-stratified)", "hypothesis": "highest-error events correspond to mispositioned mesoscale structure", "requiredData": ["DATA-01", "DATA-03"], "dependentVariable": "event-stratified M3, bearing difference", "control": "frozen baseline", "risk": "event stratification must be preregistered to avoid cherry-picking"},
        {"id": "TEST-08", "name": "coastal / bathymetric sensitivity", "hypothesis": "not indicated for offshore cohorts", "requiredData": ["DATA-08"], "dependentVariable": "n/a until a nearshore cohort exists", "control": "n/a", "risk": "low priority; requires a new cohort rule"},
    ]
    gate = {"Q1_continueParameterTuning": {"answer": "NOT INDICATED", "basis": "STEP 20 holdout: no consistent advantage of alpha 0.002 over 0 (6/6 at 72 h); STEP 21: windage displacement nearly orthogonal to the error vector; alpha stays 0.002 and is not re-searched"},
            "Q2_newForcingOrDataRequired": {"answer": "YES", "basis": "every limitation with SUPPORTED_INDICATION (L2, L4, L5) or PLAUSIBLE_BUT_UNTESTED (L1, L7, L8) requires data not in the repository to be tested"},
            "Q3_highestPriorityData": {"answer": ["DATA-01", "DATA-03", "DATA-06"], "basis": "P1: eddy-resolving currents and an independent surface-current reference address the dominant regional/event error mass; wave/Stokes data enable a physically distinct transport test"},
            "Q4_mandatoryBaselineForNextIteration": {"answer": "frozen baseline (HYCOM 0.08 deg 15 m 3 h + NCEP-R2 10 m 6 h, alpha 0.002) AND alpha 0, on the same calibration (23) and holdout (12) sets with STEP 19/20 metrics", "basis": "STEP 20 B-6 and STEP 21 records are the reference; any new term/forcing must be compared against both"},
            "overall": "INSUFFICIENT EVIDENCE to attribute the error to any single limitation; requirement analysis indicates data acquisition (P1 items) before further model development"}
    assessment = {"ruleId": "forcing-adequacy-requirement-analysis-step22", "descriptiveOnly": True, "frozenBaseline": baseline, "frozenEvidence": ev, "limitations": L, "physicalProcessInventory": inventory, "errorSignatureRequirementMap": mapping, "evidenceLabels": list(LABELS), "priorityDefinitions": PRIORITIES,
                  "causalAttribution": "NONE — every entry is a hypothesis / indication; wording restricted to possible / plausible / indication / hypothesis / requires testing", "step20ConclusionUnchanged": True, "step21ConclusionUnchanged": True, "alphaUnchanged": 0.002}
    (out / "step22-limitation-assessment.json").write_bytes((json.dumps(assessment, ensure_ascii=False, indent=2) + "\n").encode("utf-8"))
    (out / "step22-data-requirement-register.json").write_bytes((json.dumps({"ruleId": assessment["ruleId"], "availabilityLabels": list(AVAIL), "noAcquisitionPerformed": True, "register": register}, ensure_ascii=False, indent=2) + "\n").encode("utf-8"))
    (out / "step22-future-test-matrix.json").write_bytes((json.dumps({"ruleId": assessment["ruleId"], "noTestExecuted": True, "tests": tests}, ensure_ascii=False, indent=2) + "\n").encode("utf-8"))
    summary = {"ruleId": assessment["ruleId"], "status": "STEP22_REQUIREMENT_ANALYSIS_COMPLETE", "interpretation": "DESCRIPTIVE / REQUIREMENT ANALYSIS ONLY", "step20ConclusionUnchanged": True, "step21ConclusionUnchanged": True, "alphaUnchanged": 0.002, "modelValidationClaim": False, "causalAttribution": False,
               "limitationSummary": [{"id": l["id"], "category": l["category"], "evidenceStrength": l["evidenceStrength"], "priority": l["priority"], "additionalDataRequired": l["additionalDataRequired"]} for l in L],
               "priorityCounts": {p: sum(1 for l in L if l["priority"] == p) for p in PRIORITIES}, "evidenceCounts": {e: sum(1 for l in L if l["evidenceStrength"] == e) for e in LABELS},
               "dataRegister": [{"id": d["id"], "availability": d["availability"], "priority": d["priority"]} for d in register], "tests": [{"id": t["id"], "requiredData": t["requiredData"]} for t in tests], "modelDevelopmentGate": gate,
               "counters": {"modelRuns": 0, "dataDownloads": 0, "alphaCandidatesAdded": 0, "testsExecuted": 0}}
    (out / "step22-summary.json").write_bytes((json.dumps(summary, ensure_ascii=False, indent=2) + "\n").encode("utf-8"))
    buf = io.StringIO(newline=""); w = csv.writer(buf, lineterminator="\n"); w.writerow(["id", "category", "evidenceStrength", "priority", "additionalDataRequired", "requiredData", "candidateTests"])
    for l in L:
        w.writerow([l["id"], l["category"], l["evidenceStrength"], l["priority"], l["additionalDataRequired"], ";".join(sorted({d for m in mapping if l["id"] in m["possibleLimitation"] for d in m["requiredData"]})), ";".join(sorted({m["candidateTest"] for m in mapping if l["id"] in m["possibleLimitation"]}))])
    for d in register:
        w.writerow([d["id"], d["data"], d["availability"], d["priority"], "", "", ""])
    (out / "step22-summary.csv").write_bytes(buf.getvalue().encode("utf-8"))
    run = {"status": "STEP22_REQUIREMENT_ANALYSIS_COMPLETE", "inputs": LOCKED, "outputs": {n: sha(out / n) for n in ("step22-limitation-assessment.json", "step22-data-requirement-register.json", "step22-future-test-matrix.json", "step22-summary.json", "step22-summary.csv")},
           "tool": {"file": "tools/research/analyze_step22.py", "sha256": sha(__file__)}, "createdAtUTC": datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ"), "deterministic": True, "modelRuns": 0, "dataDownloads": 0}
    (out / "step22-run.json").write_bytes((json.dumps(run, ensure_ascii=False, indent=2) + "\n").encode("utf-8"))
    print(json.dumps({"status": run["status"], "outputs": run["outputs"]}))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
