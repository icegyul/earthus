"""STEP 24 — P1 forcing ACCESS / LICENSE assessment and future-experiment registration (no model run, no download of forcing).
`--fetch`: retrieve the official provider documents named in the LOCKED protocol into docs/research/step24-evidence/ (raw bytes,
SHA-256, URL, timestamp, HTTP status) and check credential/toolbox existence (never reading contents). Derivation (always):
from the stored evidence and the frozen STEP 23 records, write step24-data-access-status.json, step24-license-status.json,
step24-future-experiment-matrix.json/.csv and step24-summary.json deterministically (`--out DIR` for the reproducibility re-run;
no timestamps in derived outputs). MODEL_RUN = FORBIDDEN."""
import csv
import hashlib
import io
import json
import re
import sys
import urllib.request
from datetime import datetime, timezone
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
PROTO = ROOT / "docs/research/step24-forcing-access-protocol.json"
PREREG = ROOT / "docs/research/step24-forcing-access-preregistration.json"
EVID = ROOT / "docs/research/step24-evidence"
S23G = ROOT / "docs/research/step23-data-quality-gates.json"
S23M = ROOT / "docs/research/step23-data-acquisition-manifest.json"
S23S = ROOT / "docs/research/step23-data-requirement-status.json"
LOCKED = {"docs/research/step23-data-quality-gates.json": "5121ddee252a03ac276c5094bb373b6948ef317de7bb956add064b7caf99f39b", "docs/research/step23-data-acquisition-manifest.json": "2f47cba7e29edc06a1f71bb4e2ed9dc373910e81e1f454b80595e955fd149b9a",
          "docs/research/step23-data-requirement-status.json": "24825f53a615bfecde79972f7a4b8ad53079b71defeb5d66e7d7700f83e01873", "docs/research/step20-selected-alpha.json": "68e43a0f91e3a6bd81427399adbe2cf8a7543d85cf0249d4926f3df093649efd",
          "docs/research/step22-future-test-matrix.json": "55f6afd8c9c63f93e6472fed12fc636f1468160e1deaa5840c7c5c221d09ba93"}
UA = "EARTHUS-research/step24"
LICENSE_TERMS = (r"licen[cs]e", r"terms of use", r"conditions of use", r"creative commons", r"cc[- ]by", r"open data", r"etalab", r"redistribut", r"citation", r"cite", r"acknowledg", r"free of charge", r"restricted", r"registration", r"copyright")


def sha_bytes(b):
    return hashlib.sha256(b).hexdigest()


def sha(path):
    return hashlib.sha256(Path(path).read_bytes()).hexdigest()


def load(path):
    return json.loads(Path(path).read_text(encoding="utf-8"))


def now():
    return datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")


def fetch_all(proto):
    EVID.mkdir(parents=True, exist_ok=True)
    index = {"fetchedAtUTC": now(), "documents": []}
    for doc in proto["officialSources"]:
        entry = {"id": doc["id"], "purpose": doc["purpose"], "url": doc["url"], "timestamp": now()}
        try:
            req = urllib.request.Request(doc["url"], headers={"User-Agent": UA})
            with urllib.request.urlopen(req, timeout=120) as r:
                data = r.read(); entry.update({"status": getattr(r, "status", "ftp") or "ftp", "bytes": len(data), "sha256": sha_bytes(data), "contentType": r.headers.get("Content-Type", "") if hasattr(r, "headers") else ""})
            (EVID / f"{doc['id']}.bin").write_bytes(data)
        except Exception as exc:
            entry.update({"status": "error", "error": f"{type(exc).__name__}: {str(exc)[:200]}"})
        index["documents"].append(entry)
    home = Path.home()
    index["credentialExistence"] = {"copernicusmarine_credentials_file": (home / ".copernicusmarine" / ".copernicusmarine-credentials").exists(), "copernicusmarine_dir": (home / ".copernicusmarine").exists(), "netrc": (home / ".netrc").exists() or (home / "_netrc").exists(), "cdsapirc": (home / ".cdsapirc").exists(), "env_COPERNICUSMARINE": any(k.startswith("COPERNICUSMARINE_SERVICE_") for k in __import__("os").environ), "contentsRead": False}
    try:
        import copernicusmarine  # noqa: F401
        index["copernicusmarineToolbox"] = {"installed": True, "version": getattr(copernicusmarine, "__version__", "?")}
    except Exception:
        index["copernicusmarineToolbox"] = {"installed": False}
    (EVID / "index.json").write_text(json.dumps(index, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    return index


def text_of(doc_id):
    p = EVID / f"{doc_id}.bin"
    return p.read_bytes().decode("utf-8", "replace") if p.exists() else ""


def license_findings(doc_id):
    t = text_of(doc_id); low = t.lower(); found = {}
    for pat in LICENSE_TERMS:
        for m in re.finditer(pat, low):
            s = max(0, m.start() - 120); e = min(len(t), m.end() + 160)
            found.setdefault(pat, []).append(re.sub(r"\s+", " ", re.sub(r"<[^>]+>", " ", t[s:e])).strip())
            if len(found[pat]) >= 3:
                break
    return found


def derive(proto, out):
    idx = load(EVID / "index.json"); docs = {d["id"]: d for d in idx["documents"]}
    g23 = load(S23G); m23 = load(S23M); s23 = load(S23S)
    windows = proto["windows"]
    # ---------------- DATA-06 license ----------------
    findings = {d: license_findings(d) for d in docs if docs[d].get("status") not in ("error", None)}
    ftp_root = text_of("ifremer_ftp_ww3_root"); ftp_glob = text_of("ifremer_ftp_ww3_global")
    license_file_names = [l.split()[-1] for l in (ftp_root + "\n" + ftp_glob).splitlines() if l.strip() and re.search(r"licen[cs]e|readme|terms|copyright|citation", l.split()[-1], re.I)]
    explicit = []
    for d, f in findings.items():
        for pat in (r"creative commons", r"cc[- ]by", r"etalab", r"open data", r"terms of use", r"conditions of use", r"licen[cs]e"):
            for snip in f.get(pat, []):
                if re.search(r"(cc[- ]by|creative commons|etalab|open licen[cs]e|licence ouverte|terms of use|conditions of use|licen[cs]ed under)", snip, re.I):
                    explicit.append({"document": d, "pattern": pat, "snippet": snip[:300]})
    citation = [{"document": d, "snippet": s[:300]} for d, f in findings.items() for pat in (r"cite", r"citation", r"acknowledg") for s in f.get(pat, [])]
    if explicit:
        status6 = "LICENSE_CONFIRMED" if any(re.search(r"(cc[- ]by|creative commons|etalab|licence ouverte|open licen[cs]e)", e["snippet"], re.I) for e in explicit) else "LICENSE_RESTRICTED" if any(re.search(r"restricted|not permitted|prohibited", e["snippet"], re.I) for e in explicit) else "LICENSE_UNKNOWN"
    else:
        status6 = "LICENSE_UNKNOWN"
    lic = {"dataset": "DATA-06", "product": {"provider": "IFREMER and SHOM (file attribute institution)", "product": "WAVEWATCH III GLOBMULTI global hindcast, GLOB-30M (0.5 deg), CFSR-forced", "productVersion": "1.0 (file attribute product_version)", "distributionAuthority": "IFREMER anonymous FTP ftp.ifremer.fr/ifremer/ww3/HINDCAST/GLOBAL/", "referencesAttribute": "http://wwz.ifremer.fr/iowaga/ (file attribute references)"},
           "documentsConsulted": [{k: v for k, v in docs[d].items()} for d in docs], "licenseFilesInFtpListing": license_file_names, "explicitLicenseStatements": explicit, "citationStatements": citation[:6], "keywordHits": {d: {k: len(v) for k, v in f.items()} for d, f in findings.items()},
           "determinations": {"providerIdentity": "IFREMER/SHOM (file metadata) — confirmed from file attributes", "productIdentity": "WW3 GLOBMULTI GLOB-30M CFSR hindcast v1.0 — confirmed from file attributes and FTP path", "distributionAuthority": "IFREMER FTP — confirmed (files served)",
                              "explicitLicenseOrTerms": "FOUND" if explicit else "NOT FOUND in the consulted documents", "redistributionPermission": "NOT ESTABLISHED" if not explicit else "see explicit statements", "scientificUsePermission": "NOT ESTABLISHED" if not explicit else "see explicit statements",
                              "derivedQuantitiesUss": "NOT ESTABLISHED (no statement found)" if not explicit else "see explicit statements", "citationRequirement": "citation/reference statements found" if citation else "NOT FOUND", "accessRestrictions": "anonymous FTP (no authentication)", "noExplicitLicenseExists": not explicit},
           "rule": "anonymous FTP access is not treated as a research-use license; status LICENSE_UNKNOWN unless an authoritative statement was found", "status": status6, "modelUseAllowed": status6 == "LICENSE_CONFIRMED"}
    # ---------------- DATA-01 access ----------------
    stac = text_of("cmems_stac_product"); stac_json = None
    try:
        stac_json = json.loads(stac) if stac.strip().startswith("{") else None
    except json.JSONDecodeError:
        stac_json = None
    product_identity = {"productId": "GLOBAL_MULTIYEAR_PHY_001_030", "stacFetched": stac_json is not None, "title": (stac_json or {}).get("title"), "description": ((stac_json or {}).get("description") or "")[:400],
                        "datasets": sorted({l.get("title") or l.get("href", "") for l in (stac_json or {}).get("links", []) if l.get("rel") == "item"})[:12] if stac_json else None,
                        "temporalExtent": ((stac_json or {}).get("extent") or {}).get("temporal"), "keywords": (stac_json or {}).get("keywords", [])[:20] if stac_json else None,
                        "license": (stac_json or {}).get("license") if stac_json else None}
    cred = idx["credentialExistence"]; tb = idx["copernicusmarineToolbox"]
    authenticated = cred["copernicusmarine_credentials_file"] or cred["env_COPERNICUSMARINE"]
    anon_path = False  # Copernicus Marine data services require a registered account for data download (STAC metadata is public)
    status1 = "CREDENTIALS_REQUIRED" if not authenticated else ("ACCESS_PATH_AVAILABLE" if tb["installed"] else "TOOLBOX_REQUIRED")
    access1 = {"dataset": "DATA-01", "product": product_identity, "A_environmentAuthenticated": bool(authenticated), "B_toolboxAvailable": tb, "C_officialAnonymousDownloadPath": anon_path, "C_note": "STAC/metadata catalogue is public; data download requires a Copernicus Marine account (registration free)",
               "D_registrationRequired": True, "E_productAccessibleUnderCurrentIdentity": bool(stac_json), "F_officialCoverageForRequirement": {"years2010and2015": ("1993-01-01 to present per catalogue" if stac_json else "not verified (catalogue not fetched)"), "resolution": "1/12 deg (~8 km)", "depths": "50 levels incl. ~0.49, 5.08, 9.57, 15.81, 21.6 m (nearest to surface/5/10/15/20 m; exact selection deferred)", "type": "reanalysis"},
               "credentialsEntered": False, "credentialsFabricated": False, "downloadPerformed": False, "status": status1, "step17GlorysRecord": "BLOCKED/PENDING — historically immutable; not changed", "requiredWindowsIfAccessGranted": [{"windowId": w["windowId"], "t0": w["t0"], "end": w["end"], "oceanBox": w["oceanBox"], "variables": ["uo", "vo"], "depthInventoryRequested": ["surface", "5 m", "10 m", "15 m", "20 m"]} for w in windows],
               "depthSelection": "NOT MADE (future preregistration)"}
    # ---------------- DATA-03 eligibility (copied from STEP 23 gates) ----------------
    geo = g23["datasets"]["DATA-03"]["products"]["erdTAgeo1day"]; ssh = g23["datasets"]["DATA-03"]["products"]["erdTAssh1day"]
    per_window = []
    for w in windows:
        gw = next((x for x in geo["windowStatus"] if x["windowId"] == w["windowId"]), {}); sw = next((x for x in ssh["windowStatus"] if x["windowId"] == w["windowId"]), {})
        per_window.append({"windowId": w["windowId"], "drifters": w["drifterCount"], "geostrophicCovered": bool(gw.get("covered")), "geostrophicReason": gw.get("reason") or ("G10 FAIL: release stencil masked" if gw.get("G10") is False else ("outside product period" if gw.get("G7") is None and not gw.get("covered") else "covered")),
                           "geostrophicBracket": gw.get("bracketFrames"), "sshCovered": bool(sw.get("covered")), "missingFractionGeo": gw.get("missingFractionBox"), "eligibleForTest03": bool(gw.get("covered"))})
    access3 = {"dataset": "DATA-03", "products": {"erdTAgeo1day": {"identity": geo["provenance"], "cadenceMeasuredSeconds": geo["files"][0]["time"]["medianSeconds"], "cadenceNote": "product named '1 Day Composite' by ERDDAP; frames are 7 days apart in the acquired subsets (STEP 23 measurement)", "status": geo["status"], "windowsCovered": geo["windowsCovered"], "windowsNotCovered": geo["windowsNotCovered"], "license": geo["licenseStatus"]},
                                                  "erdTAssh1day": {"identity": ssh["provenance"], "status": ssh["status"], "windowsCovered": ssh["windowsCovered"], "role": "reference field only; no velocity conversion defined"},
                                                  "jplOscar": {"status": "DATASET_BLOCKED", "reason": g23["datasets"]["DATA-03"]["products"]["jplOscar"]["reason"]}, "nesdisSSH1day": {"status": "DATASET_BLOCKED", "reason": g23["datasets"]["DATA-03"]["products"]["nesdisSSH1day"]["reason"]}},
               "perWindow": per_window, "eligibleWindowsTest03": [x["windowId"] for x in per_window if x["eligibleForTest03"]], "eligibleDrifters": sum(x["drifters"] for x in per_window if x["eligibleForTest03"]),
               "rules": {"treatedAsObservedDrifterVelocity": False, "addedToHYCOM": False, "usedToTuneAlpha": False, "formulationChosen": False, "candidateRoles": ["A HYCOM vs AVISO current-field comparison", "B structural forcing sensitivity", "C surface-current reference diagnostic"], "candidateFormulations": ["U_model = U_AVISO", "U_model = U_HYCOM + structural component", "other scientifically justified formulation (future preregistration)"]},
               "status": "REFERENCE_ELIGIBLE_PARTIAL" if per_window and any(x["eligibleForTest03"] for x in per_window) else "NOT_ELIGIBLE"}
    # ---------------- future experiment matrix ----------------
    d6ok = lic["status"] == "LICENSE_CONFIRMED"
    def row(tid, name, dataset, availability, license_status, coverage, missingness, variables, depth, numeric, holdout, prereq, status, extra=None):
        r = {"id": tid, "name": name, "requiredDataset": dataset, "currentAvailability": availability, "licenseStatus": license_status, "coverage": coverage, "missingness": missingness, "requiredVariables": variables, "requiredDepth": depth, "numericalCompatibility": numeric, "holdoutUsable": holdout, "prerequisites": prereq, "status": status}
        if extra:
            r.update(extra)
        return r
    tests = [
        row("TEST-01", "higher temporal ocean forcing", "DATA-02 (hourly ocean)", "UNAVAILABLE", "n/a", "none", "n/a", ["u", "v"], "15 m", "would require the same reader contract", False, ["new forcing preregistration; product change confounds cadence with model version"], "NOT_READY"),
        row("TEST-02", "higher spatial resolution ocean forcing", "DATA-01 GLORYS12V1", "BLOCKED (CREDENTIALS_REQUIRED)", "Copernicus terms (public metadata; account required for data)", "0/7 windows acquired", "n/a", ["uo", "vo"], "inventory surface/5/10/15/20 m; selection deferred", "new reader (daily means; different assimilation) — separate preregistration", True, ["authorized Copernicus access by the user", "forcing preregistration under STEP 17 rules", "reader + tests"], "BLOCKED_CREDENTIALS_REQUIRED"),
        row("TEST-03", "surface current / altimetry structural comparison", "DATA-03 erdTAgeo1day (+ erdTAssh1day reference)", "PARTIAL (acquired)", "ERDDAP notice: free use/redistribution, not for legal use", f"{len(access3['eligibleWindowsTest03'])}/7 windows ({', '.join(access3['eligibleWindowsTest03'])}); AG 2015 outside product period; KE-1 release stencil masked", "box missing 0.12–0.19 (geo)", ["u_current", "v_current"], "surface geostrophic (altitude 0) — not 15 m", "weekly frames bracket each window; linear temporal interpolation over 7 days is a structural assumption to be declared; 0.25 deg regular grid", True, ["formulation choice (A/B/C) by preregistration", "no alpha tuning"], "ELIGIBLE_PARTIAL_REFERENCE"),
        row("TEST-04", "depth sensitivity", "DATA-04 (HYCOM other depths via STEP 17 NCSS protocol)", "UNAVAILABLE (acquirable anonymously)", "HYCOM Distribution A", "n/a until acquired", "n/a", ["water_u", "water_v"], "fixed set e.g. 0/5/10/15/20 m preregistered", "same reader", True, ["forcing preregistration with fixed depth set; no post-hoc depth selection"], "NOT_READY"),
        row("TEST-05", "windage structural sensitivity (no alpha search)", "DATA-05 drifter metadata", "PARTIAL", "GDP CC BY 4.0", "all windows", "no uncertainty fields", ["typebuoy", "drogue_lost_date"], "n/a", "n/a", True, ["metadata acquisition preregistration"], "NOT_READY"),
        row("TEST-06", "Stokes drift inclusion", "DATA-06 WW3 GLOB-30M CFSR uss", "ACQUIRED (quality gates G1–G11 PASS, 7/7 windows)", lic["status"], "7/7 windows (KE-2 spans two contiguous monthly files)", "box missing 0.0–0.167", ["uuss", "vuss"], "surface Stokes drift (wave quantity)", "0.5 deg, 3 h regular; needs a new reader (unchanged runtime contract) — separate preregistration", True, ["LICENSE_CONFIRMED required before any model use", "reader + tests", "formulation fixed below"], "REGISTERED_CONDITIONAL_ON_LICENSE" if not d6ok else "ELIGIBLE",
            {"registeredDesign": {"BASE": "U_ocean + alpha U_wind", "STOKES": "U_ocean + U_Stokes + alpha U_wind", "alpha": {"primary": 0.002, "baseline": 0.0, "frozen": True, "search": False}, "stokesCoefficient": 1.0, "coefficientSearch": False, "scalingSearch": False, "tuning": False, "runInStep24": False}}),
        row("TEST-07", "eddy-resolving / event-stratified forcing", "DATA-01 + DATA-03", "BLOCKED / PARTIAL", "see TEST-02/03", "depends on DATA-01", "n/a", ["uo", "vo", "u_current", "v_current"], "deferred", "see TEST-02", True, ["DATA-01 access", "event stratification preregistered"], "BLOCKED_CREDENTIALS_REQUIRED"),
        row("TEST-08", "coastal / bathymetric effects", "DATA-08", "PARTIAL (coastline only)", "Natural Earth public domain", "n/a", "n/a", ["bathymetry"], "n/a", "n/a", False, ["nearshore cohort rule (none exists)"], "NOT_INDICATED"),
    ]
    priority_order = [{"priority": 1, "item": "DATA-01 higher-resolution ocean current", "note": "requires user-authorized Copernicus access"}, {"priority": 2, "item": "DATA-06 Stokes drift", "note": "ONLY after license confirmation"}, {"priority": 3, "item": "DATA-03 AVISO surface-current reference"}, {"priority": 4, "item": "DATA-04 depth sensitivity"}, {"priority": 5, "item": "remaining structural tests"}, {"basis": "priority order fixed by STEP 22/24 preregistration; not a performance ranking"}]
    overall = "STEP24_CREDENTIALS_REQUIRED" if status1 == "CREDENTIALS_REQUIRED" and lic["status"] != "LICENSE_CONFIRMED" else ("STEP24_LICENSE_BLOCKED" if lic["status"] != "LICENSE_CONFIRMED" else ("STEP24_ACCESS_RESOLUTION_COMPLETE" if status1 == "ACCESS_PATH_AVAILABLE" else "STEP24_CREDENTIALS_REQUIRED"))
    access = {"ruleId": proto["ruleId"], "MODEL_RUN": "FORBIDDEN", "modelRunCount": 0, "downloadsOfForcing": 0, "credentialsEntered": False, "frozenBaseline": proto["frozenBaseline"], "step23Copied": {"DATA-01": s23["DATA-01"], "DATA-03": s23["DATA-03"], "DATA-06": s23["DATA-06"]},
              "DATA-01": access1, "DATA-03": access3, "DATA-06": {"status": lic["status"], "qualityStatusFromStep23": g23["datasets"]["DATA-06"]["qualityStatusIgnoringLicense"], "gates": g23["datasets"]["DATA-06"]["gates"], "windowsCovered": g23["datasets"]["DATA-06"]["windowsCovered"], "modelUseAllowed": lic["modelUseAllowed"]},
              "credentialExistence": cred, "toolbox": tb, "overallStatus": overall}
    (out / "step24-data-access-status.json").write_bytes((json.dumps(access, ensure_ascii=False, indent=2) + "\n").encode("utf-8"))
    (out / "step24-license-status.json").write_bytes((json.dumps({"ruleId": proto["ruleId"], "DATA-06": lic, "DATA-03": {"erdTAgeo1day": geo["licenseStatus"], "erdTAssh1day": ssh["licenseStatus"], "text": geo.get("licenseText")}, "DATA-01": {"status": "not verifiable without access; Copernicus Marine terms apply (account required)", "stacLicenseField": product_identity["license"]}}, ensure_ascii=False, indent=2) + "\n").encode("utf-8"))
    (out / "step24-future-experiment-matrix.json").write_bytes((json.dumps({"ruleId": proto["ruleId"], "tests": tests, "priorityOrder": priority_order, "executed": 0, "MODEL_RUN": "FORBIDDEN"}, ensure_ascii=False, indent=2) + "\n").encode("utf-8"))
    buf = io.StringIO(newline=""); w = csv.writer(buf, lineterminator="\n"); cols = ["id", "name", "requiredDataset", "currentAvailability", "licenseStatus", "coverage", "missingness", "requiredVariables", "requiredDepth", "numericalCompatibility", "holdoutUsable", "prerequisites", "status"]
    w.writerow(cols)
    for t in tests:
        w.writerow([";".join(t[c]) if isinstance(t[c], list) else t[c] for c in cols])
    (out / "step24-future-experiment-matrix.csv").write_bytes(buf.getvalue().encode("utf-8"))
    summary = {"ruleId": proto["ruleId"], "status": overall, "MODEL_RUN": "FORBIDDEN", "modelRunCount": 0, "DATA-01": status1, "DATA-03": access3["status"], "DATA-06": lic["status"], "futureTests": {t["id"]: t["status"] for t in tests}, "priorityOrder": priority_order,
               "statements": ["STEP24 does not establish that any new forcing is superior to the frozen HYCOM+NCEP baseline.", "STEP20 alpha=0.002 remains calibration-selected but not established as superior on holdout.", "STEP17 GLORYS BLOCKED/PENDING remains historically immutable.", "No model performance conclusion is generated in STEP24."],
               "frozenAlpha": 0.002, "frozenBaselineAlpha": 0.0, "interpretation": "DATA ACCESS / EXPERIMENT REGISTRATION ONLY"}
    (out / "step24-summary.json").write_bytes((json.dumps(summary, ensure_ascii=False, indent=2) + "\n").encode("utf-8"))
    return summary


def main(argv=None):
    argv = list(sys.argv[1:] if argv is None else argv)
    out = Path(argv[argv.index("--out") + 1]) if "--out" in argv else ROOT / "docs/research"
    out.mkdir(parents=True, exist_ok=True)
    for rel, expected in LOCKED.items():
        if sha(ROOT / rel) != expected:
            print(json.dumps({"status": "STEP24_BLOCKED_IMMUTABILITY", "file": rel})); return 2
    proto = load(PROTO); prereg = load(PREREG)
    if sha(PROTO) != prereg["protocolSha256"] or prereg["status"] != "PREREGISTRATION LOCKED":
        print(json.dumps({"status": "STEP24_BLOCKED_IMMUTABILITY", "file": "protocol/preregistration"})); return 2
    if "--fetch" in argv:
        if (EVID / "index.json").exists():
            print(json.dumps({"status": "evidence already fetched; refusing to overwrite"})); return 1
        fetch_all(proto)
    summary = derive(proto, out)
    if "--fetch" in argv:
        run = {"status": summary["status"], "evidenceIndexSha256": sha(EVID / "index.json"), "outputs": {n: sha(out / n) for n in ("step24-data-access-status.json", "step24-license-status.json", "step24-future-experiment-matrix.json", "step24-future-experiment-matrix.csv", "step24-summary.json")}, "tool": {"file": "tools/research/assess_step24.py", "sha256": sha(__file__)}, "createdAtUTC": now(), "modelRunCount": 0}
        (ROOT / "docs/research/step24-run.json").write_text(json.dumps(run, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    print(json.dumps(summary, ensure_ascii=False))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
