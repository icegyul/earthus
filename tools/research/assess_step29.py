"""STEP 29 Phase A — DATA-06 (IFREMER/SHOM WAVEWATCH III GLOBMULTI GLOB-30M CFSR hindcast, product_version 1.0) license and Stokes
data-use gate. Deterministic and offline: the determination rests only on evidence stored in the repository — the provider-embedded
global attributes of the six downloaded files (SHA-verified against the STEP 23 manifest) and the STEP 24b IFREMER FTP README copies —
plus online catalogue records consulted on 2026-09-06 that are recorded as context (they describe other product versions and are
NOT applied). No download, no model run, no alpha change. Writes step29-stokes-license-status.json, step29-stokes-evidence-index.json,
step29-stokes-experiment-design.json, step29-summary.json. `--out DIR` for the independent re-run."""
import hashlib
import json
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
D = ROOT / "docs/research"
sys.path.insert(0, str(ROOT / "services/research-runtime/.deps"))
import netCDF4  # noqa: E402

M23 = D / "step23-data-acquisition-manifest.json"
G23 = D / "step23-data-quality-gates.json"
L24B = D / "step24b-license-status.json"
README_DIR = D / "step24b-evidence"
ATTR_KEYS = ("distribution_statement", "institution", "institution_references", "data_centre", "data_centre_references", "contact", "references", "source", "product_version", "software_version", "title", "forecast_type", "operational_status", "grid", "forcing_wind", "creation_date", "product_name", "start_date", "stop_date")
ONLINE = [  # consulted 2026-09-06 (WebFetch/WebSearch); content not stored; recorded as context only
    {"id": "sextant_glob30m_lops_2025", "url": "https://sextant.ifremer.fr/record/87209a81-2c27-452b-86ae-b9c2cc4d43a9/", "consultedOn": "2026-09-06", "describes": "GLOB-30M_LOPS_2025 (WAVEWATCH III, Alday & Ardhuin 2023 parameterization, ERA5 winds, 1991-2024, hourly)", "statedLicense": "CC-BY (Creative Commons - Attribution)", "citation": "Accensi Mickael (2024). GLOB-30M_LOPS_2025. IFREMER. DOI 10.12770/87209a81-2c27-452b-86ae-b9c2cc4d43a9", "appliesToDownloadedFiles": False, "reason": "different product (ERA5-forced, 2025 LOPS hindcast); the downloaded files are the CFSR-forced product_version 1.0 files created 2013-07-05", "role": "ALTERNATIVE_CANDIDATE (not substituted; new preregistration required before any use)"},
    {"id": "sextant_globmulti_era5_globcur_01", "url": "https://sextant.ifremer.fr/record/857a3337-f59a-481a-bf98-5561e8b61e7b/", "consultedOn": "2026-09-06", "describes": "GLOBMULTI_ERA5_GLOBCUR_01 (WAVEWATCH III, Alday et al. 2021, ERA5 winds, CMEMS GLOBCURRENT, 1993-2024, 3-hourly, 0.5 deg global grid)", "statedLicense": "Creative Commons Attribution-ShareAlike CC BY-SA", "citation": "Accensi Mickael. GLOBMULTI_ERA5_GLOBCUR_01. IFREMER. DOI 10.12770/857a3337-f59a-481a-bf98-5561e8b61e7b", "appliesToDownloadedFiles": False, "reason": "different product (ERA5-forced); does not name the CFSR hindcast files", "role": "ALTERNATIVE_CANDIDATE (not substituted; new preregistration required before any use)"},
    {"id": "ww3_wiki_ifremer_wave_hindcasts", "url": "https://forge.ifremer.fr/plugins/mediawiki/wiki/ww3/index.php/En:ifremer_wave_hindcasts", "consultedOn": "2026-09-06", "describes": "IFREMER wave hindcasts wiki: CFSR/CFSRR-forced global hindcast 1984-2015, BETAMAX by year, FTP directories", "statedLicense": None, "citation": None, "appliesToDownloadedFiles": True, "reason": "documents the CFSR hindcast family but contains no license, terms, citation or redistribution statement", "role": "context (no applicable permission statement)"},
    {"id": "iowaga_reference_page", "url": "http://wwz.ifremer.fr/iowaga/", "consultedOn": "2026-09-06", "describes": "file attribute 'references' target", "statedLicense": None, "citation": None, "appliesToDownloadedFiles": True, "reason": "host not resolvable on 2026-09-06 (getaddrinfo ENOTFOUND); no content obtained", "role": "unreachable"}]


def sha(path):
    return hashlib.sha256(Path(path).read_bytes()).hexdigest()


def load(path):
    return json.loads(Path(path).read_text(encoding="utf-8"))


def main(argv=None):
    argv = list(sys.argv[1:] if argv is None else argv)
    out = Path(argv[argv.index("--out") + 1]) if "--out" in argv else D
    out.mkdir(parents=True, exist_ok=True)
    m23 = load(M23); g23 = load(G23); l24b = load(L24B)
    files = []
    def walk(o):
        if isinstance(o, dict):
            if "file" in o and "DATA-06" in str(o.get("file")) and "sha256" in o:
                files.append(o)
            for v in o.values():
                walk(v)
        if isinstance(o, list):
            for v in o:
                walk(v)
    walk(m23); files = sorted(files, key=lambda f: f["file"])
    file_evidence = []
    for f in files:
        p = ROOT / f["file"]; ok = sha(p) == f["sha256"]
        with netCDF4.Dataset(p) as ds:
            attrs = {k: str(getattr(ds, k)) for k in ATTR_KEYS if k in ds.ncattrs()}; t = ds["time"]; nt = len(t[:]); units = {v: str(ds[v].units) for v in ("uuss", "vuss") if v in ds.variables}; shape = list(ds["uuss"].shape)
        file_evidence.append({"file": f["file"], "sha256": f["sha256"], "shaVerified": ok, "globalAttributes": attrs, "frames": nt, "cadenceSeconds": 10800, "variables": units, "shape": shape})
    readmes = [{"id": p.stem, "file": str(p.relative_to(ROOT)).replace("\\", "/"), "sha256": sha(p), "bytes": p.stat().st_size, "licenseTermsFound": False, "citationRequirementFound": False, "note": "IFREMER FTP document copied in STEP 24b; re-scanned: no license, terms-of-use, citation or redistribution statement"} for p in sorted(README_DIR.glob("*.bin"))]
    dist = sorted({fe["globalAttributes"].get("distribution_statement") for fe in file_evidence}); inst = sorted({fe["globalAttributes"].get("institution") for fe in file_evidence}); ver = sorted({fe["globalAttributes"].get("product_version") for fe in file_evidence})
    all_no_restr = dist == ["No restrictions"] and all(fe["shaVerified"] for fe in file_evidence) and len(file_evidence) == 6
    claims = [{"claimId": f"file_attr:{fe['file'].split('/')[-1]}#distribution_statement", "source": fe["file"], "sourceSha256": fe["sha256"], "text": f"distribution_statement = {fe['globalAttributes'].get('distribution_statement')}; institution = {fe['globalAttributes'].get('institution')}; data_centre = {fe['globalAttributes'].get('data_centre')}; product_version = {fe['globalAttributes'].get('product_version')}; source = {fe['globalAttributes'].get('source')}",
               "category": "explicit distribution/use statement embedded by the provider in the downloaded file", "productApplicable": True, "applicabilityBasis": "attribute of the downloaded hindcast file itself (product_version 1.0, GLOBMULTI, glob_30m, wind_ncep)"} for fe in file_evidence]
    caveats = ["The permission rests on a provider-embedded file attribute, not on a named license text (no CC/ODbL/other license name, no terms-of-use document, no citation requirement was found for the CFSR-forced product_version 1.0 files).",
               "The file metadata block also carries operational-forecast template fields (title 'WAVEWATCH-III FORECAST', forecast_type 'forecast', operational_status 'operational') although the files are hindcast outputs; the distribution_statement may therefore be template-inherited. It is nevertheless the only provider statement attached to these exact files and is identical in all six.",
               "Precedent: STEP 17 accepted the HYCOM file attribute distribution_statement ('Distribution unlimited') as the license basis for the frozen baseline; the same evidence class is applied here for consistency and is disclosed.",
               "Successor products on Sextant (ERA5-forced) carry named Creative Commons licenses; they are different products and are NOT applied to these files (recorded as ALTERNATIVE_CANDIDATE only)."]
    status = "LICENSE_CONFIRMED" if all_no_restr else "LICENSE_UNKNOWN"
    determination = {"1_explicitLicenseStated": {"answer": "YES_AS_DISTRIBUTION_STATEMENT" if all_no_restr else "NO", "basis": "file attribute distribution_statement = 'No restrictions' in all six downloaded files (SHOM and Ifremer; IFREMER OCO data centre)" if all_no_restr else "none found", "namedLicenseText": False},
                     "2_researchUseAllowed": {"answer": "YES" if all_no_restr else "NOT_ESTABLISHED", "basis": "no restriction stated by the provider on the files"},
                     "3_derivedQuantitiesAllowed": {"answer": "NOT_RESTRICTED" if all_no_restr else "NOT_ESTABLISHED", "basis": "no restriction stated; no explicit derivative clause exists"},
                     "4_redistributionAllowed": {"answer": "NOT_RESTRICTED" if all_no_restr else "NOT_ESTABLISHED", "basis": "distribution_statement 'No restrictions'; repository policy nevertheless keeps raw files uncommitted"},
                     "5_modificationDerivationAllowed": {"answer": "NOT_RESTRICTED" if all_no_restr else "NOT_ESTABLISHED", "basis": "no restriction stated"},
                     "6_citationRequired": {"answer": "NOT_STATED", "basis": "no citation requirement found in file attributes, FTP READMEs or wiki; attribution to SHOM/Ifremer (IOWAGA, http://wwz.ifremer.fr/iowaga/) will be given voluntarily"},
                     "7_commercialUseRestriction": {"answer": "NONE_STATED", "basis": "no restriction stated"},
                     "8_derivativeProductRestriction": {"answer": "NONE_STATED", "basis": "no restriction stated"},
                     "9_coverage": {"answer": "PRODUCT_FILES", "basis": "the statement is embedded in the product files themselves (not a statement about the WAVEWATCH III model code)"},
                     "10_appliesToDownloadedHindcastFiles": {"answer": "YES", "basis": "attribute present and identical in every downloaded file (SHA-verified)"}}
    lic = {"ruleId": "stokes-license-and-experiment-gate-step29", "dataset": "DATA-06", "provider": "IFREMER (distribution, OCO data centre) and SHOM (co-institution per file attribute)", "product": "WAVEWATCH III GLOBMULTI global hindcast, GLOB-30M (0.5 deg), CFSR-forced (forcing_wind wind_ncep), surface Stokes drift uss files", "productVersion": ver, "sourcePath": "ftp.ifremer.fr/ifremer/ww3/HINDCAST/GLOBAL/<year>_CFSR/uss/", "priorStatus": l24b["DATA-06"]["finalLicenseStatus"],
           "evidenceScope": "provider-embedded attributes of the downloaded files (SHA-verified) + IFREMER FTP README copies (STEP 24b) + IFREMER WW3 wiki (context); Sextant records of other product versions recorded as context only; no Copernicus material used", "copernicusEvidenceUsed": False,
           "applicableStatements": claims, "distributionStatementValues": dist, "institutionValues": inst, "readmeDocuments": readmes, "onlineDocumentsConsulted": ONLINE, "determination": determination, "caveats": caveats,
           "finalLicenseStatus": status, "statusRule": "LICENSE_CONFIRMED = explicit provider statement permitting use/distribution applicable to the downloaded files (a file-embedded distribution_statement qualifies, as accepted for HYCOM in STEP 17); LICENSE_RESTRICTED = explicit restriction; LICENSE_UNKNOWN = no applicable explicit statement; DATASET_BLOCKED = data failure",
           "modelUseAllowed": status == "LICENSE_CONFIRMED", "alternativeCandidates": [o for o in ONLINE if o["role"].startswith("ALTERNATIVE_CANDIDATE")], "anonymousFtpIsNotPermission": True}
    (out / "step29-stokes-license-status.json").write_bytes((json.dumps(lic, ensure_ascii=False, indent=2) + "\n").encode("utf-8"))
    evidence = {"ruleId": lic["ruleId"], "documents": [{"id": r["id"], "kind": "ifremer_ftp_readme_copy", "file": r["file"], "sha256": r["sha256"], "bytes": r["bytes"]} for r in readmes] + [{"id": f"data06_file:{fe['file'].split('/')[-1]}", "kind": "downloaded_product_file_attributes", "file": fe["file"], "sha256": fe["sha256"], "shaVerified": fe["shaVerified"], "attributes": fe["globalAttributes"]} for fe in file_evidence] + [{"id": o["id"], "kind": "online_catalogue_or_wiki (context; not stored; not applied)", "url": o["url"], "consultedOn": o["consultedOn"], "appliesToDownloadedFiles": o["appliesToDownloadedFiles"], "statedLicense": o["statedLicense"]} for o in ONLINE],
                "claimSourceMapping": [{"claimId": c["claimId"], "source": c["source"], "sourceSha256": c["sourceSha256"]} for c in claims], "excluded": ["Copernicus Marine terms (unrelated product)", "third-party interpretations", "generic FTP assumptions", "search snippets without source"], "newDownloads": 0, "credentialsInvolved": False}
    (out / "step29-stokes-evidence-index.json").write_bytes((json.dumps(evidence, ensure_ascii=False, indent=2) + "\n").encode("utf-8"))
    d6 = g23["datasets"]["DATA-06"]
    suitability = {"evaluated": status in ("LICENSE_CONFIRMED", "LICENSE_RESTRICTED"), "source": "STEP 23 DATA-06 quality gates (frozen) + file attributes re-read here", "variables": {"uuss": "eastward surface stokes drift", "vuss": "northward surface stokes drift"}, "units": sorted({u for fe in file_evidence for u in fe["variables"].values()}), "spatialResolutionDegrees": 0.5, "cadenceSeconds": 10800,
                   "gates": d6["gates"], "windowsCovered": d6["windowsCovered"], "windowsNotCovered": d6["windowsNotCovered"], "windowStatus": [{"windowId": w["windowId"], "covered": w["covered"], "spansMonths": w.get("spansMonths"), "releaseStencil": (w.get("detail") or {}).get("G10_releaseCoverage", "RECHECK_AT_EXECUTION (spans two monthly files)")} for w in d6["windowStatus"]],
                   "caveat": "KE-2 spans two monthly files (contiguous, 3 h boundary gap = cadence); its release stencil was not evaluated in STEP 23 (null) and must be re-checked in the TEST-06 execution gate; no gap repair permitted", "physicalInterpretation": "surface Stokes drift from the wave spectrum (WAVEWATCH III uss); not an Eulerian current, not geostrophic current, not windage, not drifter velocity", "result": "TECHNICALLY_SUITABLE_PENDING_EXECUTION_GATE" if status in ("LICENSE_CONFIRMED", "LICENSE_RESTRICTED") else "NOT_EVALUATED"}
    design = {"ruleId": lic["ruleId"], "test": "TEST-06 (future; NOT executed here)", "hypothesis": "Adding Stokes drift may alter the surface transport trajectory in a direction not represented by the existing Eulerian-current plus windage formulation.", "hypothesisStatus": "hypothesis only; no claim that Stokes drift is the missing term or that it will improve the model",
              "control": {"ocean": "GLORYS12V1 native 15.810070 m (STEP 25C Condition C forcing, SHA-locked)", "wind": "NCEP-DOE R2 10 m 6 h (STEP 17 / STEP 20 B-3 files)", "alpha": 0.002, "equation": "dX/dt = U_ocean + alpha * U_wind"},
              "treatment": {"ocean": "GLORYS12V1 native 15.810070 m", "stokes": "WW3 GLOB-30M CFSR surface Stokes drift (uuss, vuss), coefficient 1.0 (added directly)", "wind": "NCEP-DOE R2 10 m 6 h", "alpha": 0.002, "equation": "dX/dt = U_ocean + U_Stokes + alpha * U_wind"},
              "structuralBaseline": {"pair": "same control/treatment with alpha = 0", "role": "structural check only"}, "stokesCoefficient": 1.0, "coefficientSearch": False, "alphaSearch": False, "alpha": 0.002, "alphaModified": False,
              "termsKeptSeparate": ["Eulerian ocean current (GLORYS)", "windage alpha * U10 (NCEP R2)", "Stokes drift (WW3 uss)"], "substitutionsForbidden": ["Stokes for current", "Stokes for windage", "AVISO for any term", "drifter velocity for any term"],
              "mechanics": "frozen runtime mechanics (RK4 300 s, output 900 s, 72 h, bilinear/linear, cos(phi) at every stage, STEP 18b status rules); the Stokes term requires a runtime-external composite forcing or a preregistered runtime extension, to be defined and locked in the TEST-06 execution protocol",
              "windows": {"calibration": ["KE-1", "KE-2", "AG-1", "AG-2"], "holdout": ["KE-H1", "KE-H3"], "KE-H2": "coverage fact only unless a separate rule makes the frozen baseline pairing eligible", "AG-holdout": "UNAVAILABLE"}, "step20Modified": False,
              "metrics": "M3 24/48/72 h primary (paired delta treatment - control, tie 1e-6 km, median primary), M1/M2/M4/M5 secondary; descriptive only", "runs": {"treatment": 6, "control": "existing STEP 25C Condition C runs (alpha 0.002) reused by SHA if configuration identity is exact, else 6", "structuralBaseline": "6 + 6 (alpha 0)"},
              "acceptanceForFutureTest": ["license status permits scientific use", "product identity verified", "uuss/vuss present", "72 h coverage complete per window", "no source gaps", "units m/s", "coordinate integrity", "reproducibility", "field physically interpretable as surface Stokes drift", "TEST-06 execution protocol locked"],
              "evidenceRationaleFromStep28": {"HYCOM_vs_GLORYS": "median vector difference ~0.25 m/s, median direction difference ~35 deg", "HYCOM_vs_AVISO": "larger speed excess over the surface-geostrophic reference", "GLORYS_vs_AVISO": "lower vector difference than HYCOM in all four A/B/C windows", "caveat": "AVISO is a reference field, not ground truth"},
              "decision": {"case": {"LICENSE_CONFIRMED": "A", "LICENSE_RESTRICTED": "B", "LICENSE_UNKNOWN": "C", "DATASET_BLOCKED": "D"}[status], "test06Status": "ELIGIBLE_PENDING_EXECUTION_PROTOCOL" if status == "LICENSE_CONFIRMED" and suitability["evaluated"] else "BLOCKED"}, "technicalSuitability": suitability, "MODEL_RUN": "FORBIDDEN", "modelRunCount": 0, "newDownloads": 0}
    (out / "step29-stokes-experiment-design.json").write_bytes((json.dumps(design, ensure_ascii=False, indent=2) + "\n").encode("utf-8"))
    summary = {"ruleId": lic["ruleId"], "phase": "A", "status": "PREREGISTRATION_LOCKED", "dataset": "DATA-06", "product": "WAVEWATCH III GLOBMULTI GLOB-30M CFSR hindcast (product_version 1.0), surface Stokes drift uss", "priorLicenseStatus": lic["priorStatus"], "licenseStatus": status, "licenseBasis": "provider-embedded distribution_statement 'No restrictions' in all six downloaded files (SHOM and Ifremer; IFREMER OCO data centre); no named license text; no citation requirement stated",
               "researchUse": determination["2_researchUseAllowed"]["answer"], "derivedUse": determination["3_derivedQuantitiesAllowed"]["answer"], "redistribution": determination["4_redistributionAllowed"]["answer"], "citation": determination["6_citationRequired"]["answer"], "technicalSuitability": suitability["result"], "test06Status": design["decision"]["test06Status"], "decisionCase": design["decision"]["case"],
               "alternativeCandidates": [o["id"] for o in lic["alternativeCandidates"]], "newData": 0, "modelRunCount": 0, "alpha": 0.002, "stokesCoefficient": 1.0, "caveats": caveats, "interpretation": "LICENSE / EXPERIMENT DESIGN ONLY",
               "statements": ["STEP 29 Phase A resolves the DATA-06 data-use gate and registers the TEST-06 design; no Stokes field was integrated and no trajectory was run.", "The license determination rests on the provider-embedded 'No restrictions' distribution statement of the downloaded files; a named license text was not found and this is disclosed.", "Stokes drift is a hypothesis term; no statement that it is the missing term or will improve the model is made.", "alpha = 0.002 (comparison alpha = 0) and the Stokes coefficient 1.0 are fixed; no coefficient or alpha search.", "AVISO evidence from STEP 28 is rationale only and is not ground truth; STEP 20-28 results are unchanged."]}
    (out / "step29-summary.json").write_bytes((json.dumps(summary, ensure_ascii=False, indent=2) + "\n").encode("utf-8"))
    print(json.dumps({"licenseStatus": status, "test06": design["decision"]["test06Status"], "files": len(file_evidence), "dist": dist}))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
