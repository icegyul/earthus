"""STEP 35 Phase A — HYCOM frame inventory from TIME-AXIS METADATA ONLY (no velocity, no forcing, no trajectory, no performance file).
After the period lock, for every year of the locked period two metadata requests are made to the registered THREDDS server of
HYCOM GOFS 3.1 GLBv0.08 expt_53.X: (1) the NCSS dataset description  .../ncss/GLBv0.08/expt_53.X/data/<year>/dataset.xml (time axis values
and attributes) and (2) the OPeNDAP time coordinate .../dodsC/GLBv0.08/expt_53.X/data/<year>.ascii?time (cross-check). Neither request names
water_u or water_v. Every response is stored under data/research/step35/inventory/ (gitignored) with SHA-256. Per UTC day the presence of
the eight frames 00,03,...,21Z is recorded; a day is COMPLETE only if all eight exist. Nearest frames are never substituted. Writes
docs/research/step35-frame-inventory.json."""
import builtins
import hashlib
import json
import re
import urllib.error
import urllib.request
from datetime import datetime, timedelta, timezone
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
D = ROOT / "docs/research"
FORBIDDEN = ("trajector", "result.json", "evaluation", "paired-table", "-summary", "run-manifest", "replay-manifest", "candidate", "glorys", "stokes", "step30", "step29", "step25", "step20-b", "step20-cal", "water_u", "water_v")
_open = builtins.open
access = {"forbiddenInputAccess": 0}


def guarded_open(file, *a, **k):
    name = str(file).replace("\\", "/").lower()
    if any(t in name for t in FORBIDDEN) and "step35" not in name:
        access["forbiddenInputAccess"] += 1; raise SystemExit(f"FORBIDDEN INPUT ACCESS: {file}")
    return _open(file, *a, **k)


builtins.open = guarded_open
PROTO, LOCK = D / "step35-phase-a-protocol.json", D / "step35-period-lock.json"
OUT = D / "step35-frame-inventory.json"
DATA = ROOT / "data/research/step35/inventory"
NCSS = "https://ncss.hycom.org/thredds/ncss/GLBv0.08/expt_53.X/data/{year}/dataset.xml"
DODS = "https://ncss.hycom.org/thredds/dodsC/GLBv0.08/expt_53.X/data/{year}.ascii?time"
FMT = "%Y-%m-%dT%H:%M:%SZ"; EPOCH = datetime(2000, 1, 1, tzinfo=timezone.utc)


def sha(path):
    return hashlib.sha256(Path(path).read_bytes()).hexdigest()


def load(path):
    return json.loads(Path(path).read_text(encoding="utf-8"))


def now():
    return datetime.now(timezone.utc).strftime(FMT)


def fetch(url, path):
    rec = {"url": url, "requestedAtUTC": now(), "variablesRequested": "none (time axis metadata only)"}
    for v in ("water_u", "water_v", "var="):
        assert v not in url
    try:
        with urllib.request.urlopen(urllib.request.Request(url, headers={"User-Agent": "EARTHUS-research/step35-inventory"}), timeout=600) as r:
            body = r.read(); rec["httpStatus"] = r.status
    except urllib.error.HTTPError as e:
        rec.update({"httpStatus": e.code, "error": "http"}); return rec, None
    except Exception as e:
        rec.update({"httpStatus": None, "error": type(e).__name__ + ": " + str(e)[:200]}); return rec, None
    path.parent.mkdir(parents=True, exist_ok=True); path.write_bytes(body)
    rec.update({"retrievedAtUTC": now(), "bytes": len(body), "sha256": hashlib.sha256(body).hexdigest(), "file": str(path.relative_to(ROOT)).replace("\\", "/")})
    return rec, body


def hours_to_ts(h):
    return (EPOCH + timedelta(hours=float(h))).strftime(FMT)


def parse_ncss(xml):
    m = re.search(r'<axis name="time"[^>]*>(.*?)</axis>', xml, re.S)
    units = re.search(r'name="units" value="([^"]+)"', m.group(1)).group(1)
    vals = re.search(r"<values[^>]*>(.*?)</values>", m.group(1), re.S)
    if vals is None:
        return None, units
    nums = [float(x) for x in vals.group(1).split()]
    return nums, units


def parse_dods(txt):
    tail = txt.split("time[", 2)[-1]; body = tail.split("]", 1)[1]
    return [float(x) for x in re.findall(r"-?\d+(?:\.\d+)?", body.split("\n", 2)[1] if "\n" in body else body)]


def main():
    proto = load(PROTO); lock = load(LOCK)
    if lock["protocolSha256"] != sha(PROTO) or proto["tools"]["tools/research/inventory_step35_frames.py"] != sha(__file__):
        raise SystemExit("STEP35_BLOCKED_IMMUTABILITY: protocol / period lock / tool")
    if OUT.exists():
        raise SystemExit("STEP35_BLOCKED: inventory exists; no overwrite")
    t0, t1 = datetime.strptime(lock["t0"], FMT).replace(tzinfo=timezone.utc), datetime.strptime(lock["t1"], FMT).replace(tzinfo=timezone.utc)
    years = list(range(t0.year, t1.year + 1)); inv = {"schemaVersion": "1.0", "ruleId": proto["ruleId"], "protocolSha256": sha(PROTO), "periodLockSha256": sha(LOCK), "periodLockedAtUTC": lock["lockedAtUTC"], "inventoryStartedAtUTC": now(), "tool": {"file": "tools/research/inventory_step35_frames.py", "sha256": sha(__file__)},
                                                     "source": lock["source"], "method": "time-axis metadata only: NCSS dataset.xml time <values> (primary) and OPeNDAP .ascii?time (cross-check); no velocity variable requested", "velocityDownloaded": False, "forcingDownloaded": False, "years": {}, "days": {}, "requests": []}
    if inv["inventoryStartedAtUTC"] < lock["lockedAtUTC"]:
        raise SystemExit("STEP35_BLOCKED: inventory before period lock")
    present = set()
    for y in years:
        r1, b1 = fetch(NCSS.format(year=y), DATA / f"{y}.dataset.xml"); r2, b2 = fetch(DODS.format(year=y), DATA / f"{y}.time.ascii")
        inv["requests"] += [r1, r2]
        if b1 is None or b2 is None:
            inv["years"][str(y)] = {"status": "METADATA_ACCESS_FAILED", "ncss": r1, "opendap": r2}; continue
        nums, units = parse_ncss(b1.decode("utf-8", "replace")); dnums = parse_dods(b2.decode("utf-8", "replace"))
        if units.strip() != "hours since 2000-01-01 00:00:00":
            inv["years"][str(y)] = {"status": "UNEXPECTED_TIME_UNITS", "units": units}; continue
        ts_ncss = sorted(hours_to_ts(h) for h in nums) if nums is not None else None; ts_dods = sorted(hours_to_ts(h) for h in dnums)
        axis = ts_dods if ts_ncss is None else ts_ncss
        inv["years"][str(y)] = {"status": "OK", "timeUnits": units, "ncssValuesListed": nums is not None, "frameCount": len(axis), "expectedFrames": (datetime(y + 1, 1, 1) - datetime(y, 1, 1)).days * 8, "first": axis[0], "last": axis[-1], "crossCheckIdentical": ts_ncss is None or ts_ncss == ts_dods, "ncssSha256": r1["sha256"], "opendapSha256": r2["sha256"]}
        present |= set(axis)
    d = t0.replace(hour=0, minute=0, second=0); complete = incomplete = 0
    while d <= t1:
        key = d.strftime("%Y-%m-%d"); frames = [(d + timedelta(hours=3 * k)).strftime(FMT) for k in range(8)]; missing = [f for f in frames if f not in present]
        inv["days"][key] = {"complete": not missing, "missing": missing}; complete += not missing; incomplete += bool(missing); d += timedelta(days=1)
    inv.update({"periodUTC": [lock["t0"], lock["t1"]], "daysTotal": complete + incomplete, "daysComplete": complete, "daysIncomplete": incomplete, "missingFrames": sorted(f for v in inv["days"].values() for f in v["missing"]), "status": "COMPLETE" if all(v.get("status") == "OK" for v in inv["years"].values()) else "INCOMPLETE", "forbiddenInputAccess": access["forbiddenInputAccess"], "completedAtUTC": now()})
    inv["knownGapsConfirmed"] = {t: (t not in present) for t in ("2010-08-18T12:00:00Z", "2011-06-09T12:00:00Z", "2011-06-15T00:00:00Z", "2011-06-20T12:00:00Z", "2011-06-22T12:00:00Z", "2011-06-26T18:00:00Z")}
    OUT.write_text(json.dumps(inv, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    print(json.dumps({"status": inv["status"], "years": {y: (v.get("frameCount"), v.get("expectedFrames"), v.get("crossCheckIdentical")) for y, v in inv["years"].items()}, "daysComplete": complete, "daysIncomplete": incomplete, "missingFrames": len(inv["missingFrames"]), "knownGaps": inv["knownGapsConfirmed"]}))
    return 0 if inv["status"] == "COMPLETE" else 1


if __name__ == "__main__":
    raise SystemExit(main())
