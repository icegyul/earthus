"""STEP 24b — DATA-06 license evidence SCOPE CORRECTION (supersedes only the DATA-06 license-evidence scope of STEP 24).
`--fetch`: retrieve ONLY the IFREMER WW3 hindcast sources named in the locked STEP 24b preregistration (FTP listings and README files
directly associated with the GLOB-30M product) into docs/research/step24b-evidence/ with SHA-256. Derivation (always, deterministic,
`--out DIR`): scan ONLY IFREMER documents for license / research-use / redistribution / derived-data / citation statements, keep only
statements applicable to WAVEWATCH III GLOBMULTI / GLOB-30M CFSR hindcast, map every claim to its source, and determine the status
(LICENSE_CONFIRMED / LICENSE_RESTRICTED / LICENSE_UNKNOWN / DATASET_BLOCKED). Copernicus documents are never read. MODEL_RUN = FORBIDDEN."""
import hashlib
import json
import re
import sys
import urllib.request
from datetime import datetime, timezone
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
PROTO = ROOT / "docs/research/step24b-preregistration.json"
EVID = ROOT / "docs/research/step24b-evidence"
S24_LIC = ROOT / "docs/research/step24-license-status.json"
S24_SUM = ROOT / "docs/research/step24-summary.json"
LOCKED = {"docs/research/step24-license-status.json": "2fed50d520b63fb3303926c78ec4668926db9cfb41f025df7d59a6cfed07a3e2", "docs/research/step24-summary.json": "4b29c5d2be8f9e5b4dac3d105cb8bdd80f75e7cc8b4611047b1cb7f2413ff390",
          "docs/research/step24-data-access-status.json": "74ea277901b95880b5f03e3133ff4b5696381cdbb69a27ccbd6703fdd8db6bf7", "docs/research/step20-selected-alpha.json": "68e43a0f91e3a6bd81427399adbe2cf8a7543d85cf0249d4926f3df093649efd",
          "docs/research/step23-data-quality-gates.json": "5121ddee252a03ac276c5094bb373b6948ef317de7bb956add064b7caf99f39b"}
UA = "EARTHUS-research/step24b"
ALLOWED_HOST = "ftp.ifremer.fr"
PRODUCT_TOKENS = (r"globmulti", r"glob-30m", r"glob30m", r"cfsr", r"hindcast", r"wavewatch", r"ww3", r"iowaga")
CLAIM_PATTERNS = {"license": r"licen[cs]e|licence ouverte|etalab|creative commons|cc[- ]by|terms of use|conditions of use|conditions d'utilisation",
                  "researchUse": r"research|scientific|non[- ]commercial|academic|free of charge|freely available|free to use",
                  "redistribution": r"redistribut|distribut|share|resell|commercial",
                  "derivedData": r"derived|derivative|modif|processed",
                  "citation": r"cite|citation|acknowledg|reference|please refer|publication",
                  "restriction": r"restricted|not permitted|prohibited|forbidden|permission|authori[sz]ation|contact.*before"}


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
    index = {"fetchedAtUTC": now(), "scope": "IFREMER WW3 hindcast sources only", "documents": []}
    for doc in proto["sources"]:
        entry = {"id": doc["id"], "purpose": doc["purpose"], "url": doc["url"], "timestamp": now()}
        assert ALLOWED_HOST in doc["url"], "source outside the allowed IFREMER host"
        try:
            with urllib.request.urlopen(urllib.request.Request(doc["url"], headers={"User-Agent": UA}), timeout=180) as r:
                data = r.read()
            (EVID / f"{doc['id']}.bin").write_bytes(data); entry.update({"status": "ok", "bytes": len(data), "sha256": sha_bytes(data)})
        except Exception as exc:
            entry.update({"status": "error", "error": f"{type(exc).__name__}: {str(exc)[:200]}"})
        index["documents"].append(entry)
    (EVID / "index.json").write_text(json.dumps(index, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")


def text_of(doc_id):
    p = EVID / f"{doc_id}.bin"
    return p.read_bytes().decode("utf-8", "replace") if p.exists() else ""


def paragraphs(text):
    """Split a README into paragraphs (blank-line separated), whitespace-normalised."""
    return [re.sub(r"\s+", " ", para).strip() for para in re.split(r"\n\s*\n", text) if para.strip()]


def derive(proto, out):
    idx = load(EVID / "index.json"); docs = {d["id"]: d for d in idx["documents"]}
    assert all(ALLOWED_HOST in d["url"] for d in docs.values()) and not any("cmems" in k or "copernicus" in k for k in docs)
    claims = []
    for did, d in docs.items():
        if d.get("status") != "ok" or not d["id"].startswith("ifremer_"):
            continue
        for pi, para in enumerate(paragraphs(text_of(did))):
            low = para.lower(); hits = {k: bool(re.search(v, low)) for k, v in CLAIM_PATTERNS.items()}
            if not any(hits.values()):
                continue
            applicable = bool(re.search("|".join(PRODUCT_TOKENS), low)) or did.endswith("_global_readme") or "GLOBAL" in d["url"]
            claims.append({"claimId": f"{did}#p{pi}", "document": did, "url": d["url"], "documentSha256": d["sha256"], "paragraph": pi, "text": para[:700], "categories": [k for k, v in hits.items() if v], "productApplicable": applicable,
                           "applicabilityBasis": "paragraph names the product/hindcast/WW3" if re.search("|".join(PRODUCT_TOKENS), low) else ("document lives in the GLOBAL product directory" if "GLOBAL" in d["url"] else "hindcast-tree README (generic)")})
    applicable = [c for c in claims if c["productApplicable"]]
    def has(cat, restrict=False):
        return [c for c in applicable if cat in c["categories"]]
    lic_claims = has("license"); research = has("researchUse"); redis = has("redistribution"); derived = has("derivedData"); cite = has("citation"); restr = has("restriction")
    explicit_named_license = [c for c in lic_claims if re.search(r"licence ouverte|etalab|creative commons|cc[- ]by|licen[cs]ed under|terms of use|conditions of use|conditions d'utilisation", c["text"], re.I)]
    explicit_restriction = [c for c in restr if re.search(r"not permitted|prohibited|forbidden|restricted to|only with (written )?permission|prior authori[sz]ation", c["text"], re.I)]
    if explicit_restriction:
        status = "LICENSE_RESTRICTED"
    elif explicit_named_license:
        status = "LICENSE_CONFIRMED"
    else:
        status = "LICENSE_UNKNOWN"
    determination = {"1_explicitLicenseExists": bool(explicit_named_license), "2_explicitResearchUsePermission": bool([c for c in research if re.search(r"free|research|scientific", c["text"], re.I)]) and bool(explicit_named_license),
                     "3_redistributionPermission": "STATED" if [c for c in redis if re.search(r"redistribut|may be distributed", c["text"], re.I) and not re.search(r"not|prohib", c["text"], re.I)] else ("RESTRICTED" if explicit_restriction else "NOT_ESTABLISHED"),
                     "4_derivedQuantityPermission": "STATED" if [c for c in derived if not re.search(r"not|prohib", c["text"], re.I)] and explicit_named_license else "NOT_ESTABLISHED",
                     "5_citationRequirement": "STATED" if cite else "NOT_FOUND", "6_accessRestriction": "anonymous FTP; no authentication (not a license)", "7_governingOrganization": "IFREMER (distribution) / SHOM & IFREMER (file attribute institution); LOPS/IOWAGA project per file 'references'",
                     "8_productSpecificApplicability": f"{len(applicable)} applicable statements of {len(claims)} candidate statements; only statements naming WW3/GLOBMULTI/GLOB-30M/CFSR/hindcast or located in the GLOBAL product directory are used",
                     "rule": "anonymous FTP access is not permission; citation-only instructions → LICENSE_UNKNOWN; named open license or explicit terms → LICENSE_CONFIRMED; explicit restriction → LICENSE_RESTRICTED"}
    lic = {"dataset": "DATA-06", "provider": "IFREMER (distribution) and SHOM (co-institution per file attribute)", "product": "WAVEWATCH III GLOBMULTI global hindcast, GLOB-30M (0.5 deg), CFSR-forced", "version": "product_version 1.0 (file attribute)", "source": "ftp.ifremer.fr/ifremer/ww3/HINDCAST/GLOBAL/<year>_CFSR/uss/",
           "documentsConsulted": [{k: d.get(k) for k in ("id", "url", "status", "bytes", "sha256", "error")} for d in docs.values()], "applicableLicenseStatements": applicable, "excludedNonApplicableStatements": [c["claimId"] for c in claims if not c["productApplicable"]],
           "researchUseDetermination": "EXPLICIT" if determination["2_explicitResearchUsePermission"] else "NOT_ESTABLISHED", "redistributionDetermination": determination["3_redistributionPermission"], "derivedDataDetermination": determination["4_derivedQuantityPermission"], "citationRequirement": {"status": determination["5_citationRequirement"], "statements": [c["claimId"] for c in cite]},
           "determination": determination, "finalLicenseStatus": status, "modelUseAllowed": status == "LICENSE_CONFIRMED", "copernicusEvidenceUsed": False, "evidenceScope": "IFREMER WW3 hindcast documents only"}
    (out / "step24b-license-status.json").write_bytes((json.dumps({"ruleId": proto["ruleId"], "DATA-06": lic}, ensure_ascii=False, indent=2) + "\n").encode("utf-8"))
    (out / "step24b-evidence-index.json").write_bytes((json.dumps({"ruleId": proto["ruleId"], "documents": lic["documentsConsulted"], "claims": [{"claimId": c["claimId"], "document": c["document"], "url": c["url"], "documentSha256": c["documentSha256"], "categories": c["categories"], "productApplicable": c["productApplicable"], "applicabilityBasis": c["applicabilityBasis"]} for c in claims],
                                                                    "orphanClaims": 0, "copernicusDocuments": 0, "forbiddenDocumentIds": ["cmems_terms", "cmems_stac_product"]}, ensure_ascii=False, indent=2) + "\n").encode("utf-8"))
    s24 = load(S24_SUM)
    correction = {"ruleId": proto["ruleId"], "parentStep24Commit": "e0e7cfd2", "parentStep24LockCommit": "275d06e6", "parentStep24LicenseStatusSha256": LOCKED["docs/research/step24-license-status.json"],
                  "defect": "assess_step24.py scanned all fetched documents for license statements; two Copernicus Marine terms snippets (document id cmems_terms) were attached to the DATA-06 (IFREMER WW3) license record and noExplicitLicenseExists was set to false",
                  "whyInvalid": "Copernicus Marine terms govern Copernicus products (DATA-01), not the IFREMER/SHOM WAVEWATCH III hindcast; they are not provider documents for DATA-06 and carry no information about its terms",
                  "correctionScope": "DATA-06 license-evidence scope only: evidence restricted to IFREMER WW3 hindcast documents (FTP listings and README files directly associated with the product); statements filtered for product applicability; every claim mapped to its source",
                  "step24FilesImmutable": True, "step24StatusUnchanged": s24["status"], "modelRunCount": 0, "datasetsChanged": False, "data01": "CREDENTIALS_REQUIRED (unchanged; no access attempt)", "data03": "REFERENCE_ELIGIBLE_PARTIAL (unchanged)",
                  "statements": ["STEP24 remains immutable.", "STEP24b supersedes only the DATA-06 license-evidence scope.", "STEP20 alpha=0.002 remains calibration-selected but not established as superior on holdout.", "STEP17 GLORYS BLOCKED/PENDING remains historically immutable.", "No model performance conclusion is generated."]}
    (out / "step24b-license-evidence-scope-correction.json").write_bytes((json.dumps(correction, ensure_ascii=False, indent=2) + "\n").encode("utf-8"))
    summary = {"ruleId": proto["ruleId"], "status": {"LICENSE_CONFIRMED": "STEP24B_LICENSE_CONFIRMED", "LICENSE_RESTRICTED": "STEP24B_LICENSE_RESTRICTED", "LICENSE_UNKNOWN": "STEP24B_LICENSE_UNKNOWN", "DATASET_BLOCKED": "STEP24B_DATASET_BLOCKED"}[status], "DATA-06": status, "DATA-01": "CREDENTIALS_REQUIRED", "DATA-03": "REFERENCE_ELIGIBLE_PARTIAL",
               "MODEL_RUN": "FORBIDDEN", "modelRunCount": 0, "frozenAlpha": 0.002, "frozenBaselineAlpha": 0.0, "documentsConsulted": len(docs), "documentsReachable": sum(1 for d in docs.values() if d.get("status") == "ok"), "applicableStatements": len(applicable), "citationStatements": len(cite), "explicitNamedLicense": len(explicit_named_license), "explicitRestrictions": len(explicit_restriction),
               "test06": "NOT RUN; remains REGISTERED_CONDITIONAL_ON_LICENSE unless status is LICENSE_CONFIRMED", "statements": correction["statements"], "interpretation": "LICENSE EVIDENCE CORRECTION ONLY"}
    (out / "step24b-summary.json").write_bytes((json.dumps(summary, ensure_ascii=False, indent=2) + "\n").encode("utf-8"))
    return summary


def main(argv=None):
    argv = list(sys.argv[1:] if argv is None else argv)
    out = Path(argv[argv.index("--out") + 1]) if "--out" in argv else ROOT / "docs/research"
    out.mkdir(parents=True, exist_ok=True)
    for rel, expected in LOCKED.items():
        if sha(ROOT / rel) != expected:
            print(json.dumps({"status": "STEP24B_BLOCKED_IMMUTABILITY", "file": rel})); return 2
    proto = load(PROTO)
    if proto["status"] != "PREREGISTRATION LOCKED":
        print(json.dumps({"status": "STEP24B_BLOCKED_IMMUTABILITY"})); return 2
    if "--fetch" in argv:
        if (EVID / "index.json").exists():
            print(json.dumps({"status": "evidence already fetched; refusing to overwrite"})); return 1
        fetch_all(proto)
    summary = derive(proto, out)
    if "--out" not in argv:
        run = {"status": summary["status"], "evidenceIndexSha256": sha(EVID / "index.json"), "outputs": {n: sha(out / n) for n in ("step24b-license-evidence-scope-correction.json", "step24b-license-status.json", "step24b-evidence-index.json", "step24b-summary.json")}, "tool": {"file": "tools/research/assess_step24b.py", "sha256": sha(__file__)}, "createdAtUTC": now(), "modelRunCount": 0}
        (ROOT / "docs/research/step24b-run.json").write_text(json.dumps(run, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    print(json.dumps(summary, ensure_ascii=False))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
