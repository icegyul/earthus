"""EARTHUS 2.0 tropical intelligence — ECMWF 15-day ensemble guidance.

Purpose
-------
This Lambda does NOT replace official KMA/JMA tropical-cyclone advisories.

It reads ECMWF Open Data tropical-cyclone BUFR from:
- IFS ENS      (class=od, stream=enfo, type=tf)
- AIFS ENS     (class=ai, stream=enfo, type=tf)

and writes a separate MODEL_GUIDANCE product for Earthus 2.0:
- named systems: ensemble member segments for 120–240 h (6–10 day guidance)
- unnamed forecast-genesis systems: first-member genesis signals for 246–360 h,
  aggregated into time/space candidate zones (11–15 day genesis outlook)

Important:
- No ensemble-member ratio is converted into a calibrated probability.
- No mean/average long-range track is manufactured.
- Unnamed model systems never receive an official typhoon name.
- The existing events/typhoon-ecmwf.json (0–120 h compatibility product) is untouched.

ECMWF Open Data is CC-BY-4.0; attribution is embedded in every output.
"""

import json
import math
import os
import re
import tempfile
import urllib.request
from datetime import datetime, timedelta, timezone

import boto3

BUCKET = os.environ["CACHE_BUCKET"]
REGION = os.environ.get("CACHE_REGION") or os.environ.get("AWS_REGION")
ROOT = "https://data.ecmwf.int/forecasts"
LATEST = "events/tropical-guidance-v2.json"
ARCHIVE = "archive/tropical-intelligence"
UA = {"User-Agent": "earthus/2.0 (+https://earthus.net)"}
TIMEOUT = 90
MISSING = 1e10

# 00/12 IFS ENS reaches 360 h. AIFS ENS reaches 360 h at all four runs.
# For a cross-model 15-day view we intentionally anchor to 00/12 runs.
RUN_HOURS = (0, 12)
RUN_DELAY_H = 8
GUIDANCE_START_H = 120
GUIDANCE_END_H = 240
GENESIS_START_H = 246
GENESIS_END_H = 360
GENESIS_GRID_DEG = 5.0
PERSISTENCE_DISTANCE_KM = 800.0
PERSISTENCE_TIME_H = 36.0

MODELS = {
    "ECMWF_IFS_ENS": {
        "path": "ifs",
        "model": "IFS ENS",
        "class": "od",
        "kind": "physics ensemble",
    },
    "ECMWF_AIFS_ENS": {
        "path": "aifs-ens",
        "model": "AIFS ENS",
        "class": "ai",
        "kind": "AI ensemble",
    },
}

s3 = boto3.client("s3", region_name=REGION)


def get(url, timeout=TIMEOUT):
    req = urllib.request.Request(url, headers=UA)
    return urllib.request.urlopen(req, timeout=timeout).read()


def candidate_runs(now_utc, back=6):
    t = now_utc - timedelta(hours=RUN_DELAY_H)
    anchor_hour = 12 if t.hour >= 12 else 0
    t = t.replace(hour=anchor_hour, minute=0, second=0, microsecond=0)
    out = []
    for _ in range(back):
        out.append((t.strftime("%Y%m%d"), t.hour))
        t -= timedelta(hours=12)
    return out


def directory_url(day, hh, model_path):
    return f"{ROOT}/{day}/{hh:02d}z/{model_path}/0p25/enfo/"


def track_file(day, hh, model_path):
    """Return the largest available `-enfo-tf.bufr` file in the run directory."""
    base = directory_url(day, hh, model_path)
    try:
        html = get(base, timeout=30).decode("utf-8", "replace")
    except Exception:  # noqa: BLE001
        return None
    matches = re.findall(r'href="([^"]*-tf\.bufr)"', html)
    if not matches:
        return None

    def horizon(name):
        match = re.search(r"-(\d+)h-enfo-tf\.bufr$", name)
        return int(match.group(1)) if match else -1

    href = max(matches, key=horizon)
    if href.startswith("http"):
        return href
    if href.startswith("/"):
        return "https://data.ecmwf.int" + href
    return base + href


def choose_run(now_utc):
    """Prefer the newest 00/12 run where both IFS ENS and AIFS ENS TC BUFR exist."""
    partial = None
    for day, hh in candidate_runs(now_utc):
        urls = {
            model_id: track_file(day, hh, meta["path"])
            for model_id, meta in MODELS.items()
        }
        if all(urls.values()):
            return day, hh, urls
        if partial is None and any(urls.values()):
            partial = (day, hh, urls)
    return partial


def _bufr_array(ec, handle, key):
    try:
        return list(ec.codes_get_array(handle, key))
    except Exception:  # noqa: BLE001
        return []


def _parse_ensemble_message(ec, handle):
    """Decode one ensemble tropical-cyclone BUFR message.

    Unlike the legacy public 0–120 h product, unnamed forecast-genesis systems are retained
    here as MODEL_GUIDANCE candidates. They are never treated as official storms.
    """
    ec.codes_set(handle, "unpack", 1)

    def arr(key):
        return _bufr_array(ec, handle, key)

    def one(key):
        values = arr(key)
        return values[0] if values else None

    name = str(one("#1#longStormName") or "").strip()
    sid = str(one("#1#stormIdentifier") or "").strip()
    if not sid and not name:
        return None

    n = int(one("numberOfSubsets") or 0)
    member_ids = arr("#1#ensembleMemberNumber")
    member_types = arr("#1#ensembleForecastType")
    if n < 1:
        return None
    if len(member_ids) == 1 and n > 1:
        member_ids = list(range(1, n + 1))
    if len(member_ids) != n:
        return None
    if len(member_types) == 1 and n > 1:
        member_types *= n
    if len(member_types) != n:
        member_types = [None] * n

    tracks = {int(member_ids[i]): {} for i in range(n)}

    def expanded(values):
        if len(values) == 1:
            return values * n
        return values if len(values) == n else None

    iterator = ec.codes_bufr_keys_iterator_new(handle)
    keys = []
    while ec.codes_bufr_keys_iterator_next(iterator):
        keys.append(ec.codes_bufr_keys_iterator_get_name(iterator))
    ec.codes_bufr_keys_iterator_delete(iterator)

    hour = 0
    centre = False
    lat = None
    for key in keys:
        base = key.rsplit("#", 1)[-1]
        if base == "timePeriod":
            values = arr(key)
            if values and abs(float(values[0])) < MISSING:
                hour = int(values[0])
        elif base == "meteorologicalAttributeSignificance":
            values = arr(key)
            centre = bool(values) and all(int(x) == 1 for x in values)
        elif base == "latitude" and centre:
            lat = expanded(arr(key))
        elif base == "longitude" and centre:
            lon = expanded(arr(key))
            if lat is not None and lon is not None:
                for i in range(n):
                    la, lo = float(lat[i]), float(lon[i])
                    if abs(la) >= MISSING or abs(lo) >= MISSING:
                        continue
                    tracks[int(member_ids[i])].setdefault(
                        hour,
                        {
                            "h": hour,
                            "lat": round(la, 2),
                            "lon": round(((lo + 180) % 360) - 180, 2),
                        },
                    )
            centre = False
            lat = None

    members = []
    for i in range(n):
        member_id = int(member_ids[i])
        hours = sorted(tracks[member_id])
        steps = [tracks[member_id][h] for h in hours if 0 <= h <= GENESIS_END_H]
        if len(steps) < 2:
            continue
        members.append(
            {
                "member": member_id,
                "type": "control" if member_types[i] == 0 else "perturbed",
                "steps": steps,
                "modelHorizonH": hours[-1],
            }
        )
    if not members:
        return None

    named = bool(name and name != sid)
    return {
        "id": sid or name,
        "name": name if named else None,
        "named": named,
        "totalMembers": n,
        "members": members,
        "modelHorizonH": max(m["modelHorizonH"] for m in members),
    }


def parse_ensemble(url):
    """Download and decode all ensemble TC messages from one BUFR file."""
    try:
        import eccodes as ec
    except Exception as exc:  # noqa: BLE001
        raise RuntimeError(f"ECCODES_UNAVAILABLE:{type(exc).__name__}") from exc

    raw = get(url)
    storms = []
    with tempfile.NamedTemporaryFile(suffix=".bufr") as tmp:
        tmp.write(raw)
        tmp.flush()
        with open(tmp.name, "rb") as fh:
            while True:
                handle = ec.codes_bufr_new_from_file(fh)
                if handle is None:
                    break
                try:
                    parsed = _parse_ensemble_message(ec, handle)
                    if parsed:
                        storms.append(parsed)
                except Exception as exc:  # noqa: BLE001
                    print(f"[tropical-intelligence] BUFR message skipped: {type(exc).__name__}")
                finally:
                    ec.codes_release(handle)
    return storms, len(raw)


def parse_run_time(day, hh):
    return datetime.strptime(f"{day}{hh:02d}", "%Y%m%d%H").replace(tzinfo=timezone.utc)


def iso_at(run_time, hour):
    return (run_time + timedelta(hours=hour)).isoformat().replace("+00:00", "Z")


def named_guidance(model_id, storms):
    """Return raw member segments only; never manufacture a mean/official-looking track."""
    result = {}
    for storm in storms:
        if not storm["named"]:
            continue
        key = (storm["name"] or storm["id"]).upper()
        members = []
        support = {}
        for member in storm["members"]:
            segment = [
                step for step in member["steps"]
                if GUIDANCE_START_H <= step["h"] <= GUIDANCE_END_H
            ]
            if len(segment) < 2:
                continue
            members.append(
                {
                    "member": member["member"],
                    "type": member["type"],
                    "steps": segment,
                    "modelHorizonH": member["modelHorizonH"],
                }
            )
            for step in segment:
                support[step["h"]] = support.get(step["h"], 0) + 1
        if not members:
            continue
        result[key] = {
            "id": storm["id"],
            "name": storm["name"],
            "modelSystem": model_id,
            "totalMembers": storm["totalMembers"],
            "modelHorizonH": storm["modelHorizonH"],
            "guidanceWindowH": [GUIDANCE_START_H, GUIDANCE_END_H],
            "members": members,
            "supportByH": [
                {"h": h, "members": support[h], "totalMembers": storm["totalMembers"]}
                for h in sorted(support)
            ],
        }
    return result


def grid_index(value, origin, size):
    return math.floor((value - origin) / size)


def grid_center(index, origin, size):
    return origin + (index + 0.5) * size


def genesis_signals(model_id, storms, run_time):
    """First forecast point of each unnamed member that begins in the 11–15 day window."""
    signals = []
    total_members = max((storm["totalMembers"] for storm in storms), default=0)
    seen = set()
    for storm in storms:
        if storm["named"]:
            continue
        for member in storm["members"]:
            steps = sorted(member["steps"], key=lambda row: row["h"])
            first = steps[0] if steps else None
            if not first or not (GENESIS_START_H <= first["h"] <= GENESIS_END_H):
                continue
            lat_i = grid_index(first["lat"], -90.0, GENESIS_GRID_DEG)
            lon_i = grid_index(first["lon"], -180.0, GENESIS_GRID_DEG)
            window_i = int((first["h"] - GENESIS_START_H) // 24)
            window_start_h = GENESIS_START_H + window_i * 24
            window_end_h = min(window_start_h + 24, GENESIS_END_H)
            # One ensemble member counts once in a model/time/space cell, even if BUFR
            # exposes more than one virtual-low identifier in the same zone.
            dedup = (member["member"], window_i, lat_i, lon_i)
            if dedup in seen:
                continue
            seen.add(dedup)
            signals.append(
                {
                    "modelSystem": model_id,
                    "member": member["member"],
                    "candidateSystem": storm["id"],
                    "h": first["h"],
                    "lat": first["lat"],
                    "lon": first["lon"],
                    "latIndex": lat_i,
                    "lonIndex": lon_i,
                    "windowIndex": window_i,
                    "windowStartH": window_start_h,
                    "windowEndH": window_end_h,
                    "validAt": iso_at(run_time, first["h"]),
                    "totalMembers": storm["totalMembers"] or total_members,
                }
            )
    return signals


def agreement_label(model_rows):
    supports = [row["memberSupport"] for row in model_rows]
    if len(model_rows) >= 2 and all(value >= 5 for value in supports):
        return "HIGH"
    if len(model_rows) >= 2:
        return "MEDIUM"
    return "LOW"


def build_genesis_candidates(signals, run_time):
    grouped = {}
    for signal in signals:
        key = (
            signal["windowIndex"],
            signal["latIndex"],
            signal["lonIndex"],
        )
        cell = grouped.setdefault(
            key,
            {
                "windowIndex": signal["windowIndex"],
                "windowStartH": signal["windowStartH"],
                "windowEndH": signal["windowEndH"],
                "latIndex": signal["latIndex"],
                "lonIndex": signal["lonIndex"],
                "models": {},
            },
        )
        model = cell["models"].setdefault(
            signal["modelSystem"],
            {
                "members": set(),
                "candidateSystems": set(),
                "totalMembers": signal["totalMembers"],
            },
        )
        model["members"].add(signal["member"])
        model["candidateSystems"].add(signal["candidateSystem"])
        model["totalMembers"] = max(model["totalMembers"], signal["totalMembers"])

    rows = []
    for cell in grouped.values():
        model_support = []
        for model_id, data in sorted(cell["models"].items()):
            model_support.append(
                {
                    "modelSystem": model_id,
                    "memberSupport": len(data["members"]),
                    "totalMembers": data["totalMembers"],
                    "candidateSystems": sorted(data["candidateSystems"]),
                }
            )
        lat = round(grid_center(cell["latIndex"], -90.0, GENESIS_GRID_DEG), 2)
        lon = round(grid_center(cell["lonIndex"], -180.0, GENESIS_GRID_DEG), 2)
        candidate_id = (
            f"TCGEN-{run_time.strftime('%Y%m%d%H')}-"
            f"{cell['windowStartH']}-{cell['latIndex']}-{cell['lonIndex']}"
        )
        rows.append(
            {
                "candidateId": candidate_id,
                "kind": "GENESIS_ZONE",
                "officialName": None,
                "nameAssignment": "NOT_ASSIGNED",
                "center": {"lat": lat, "lon": lon},
                "gridDeg": GENESIS_GRID_DEG,
                "windowH": [cell["windowStartH"], cell["windowEndH"]],
                "validStart": iso_at(run_time, cell["windowStartH"]),
                "validEnd": iso_at(run_time, cell["windowEndH"]),
                "modelSupport": model_support,
                "independentModelSystems": len(model_support),
                "agreement": agreement_label(model_support),
                "memberSupportSum": sum(row["memberSupport"] for row in model_support),
                "runPersistenceCycles": 1,
            }
        )
    rows.sort(
        key=lambda row: (
            -row["independentModelSystems"],
            -row["memberSupportSum"],
            row["windowH"][0],
        )
    )
    return rows


def haversine_km(a, b):
    r = 6371.0088
    lat1, lon1 = math.radians(a["lat"]), math.radians(a["lon"])
    lat2, lon2 = math.radians(b["lat"]), math.radians(b["lon"])
    dlat, dlon = lat2 - lat1, lon2 - lon1
    h = math.sin(dlat / 2) ** 2 + math.cos(lat1) * math.cos(lat2) * math.sin(dlon / 2) ** 2
    return 2 * r * math.asin(min(1.0, math.sqrt(h)))


def previous_docs(current_run, limit=3):
    try:
        response = s3.list_objects_v2(Bucket=BUCKET, Prefix=f"{ARCHIVE}/")
    except Exception:  # noqa: BLE001
        return []
    keys = sorted(
        (
            item["Key"]
            for item in response.get("Contents", [])
            if item["Key"].endswith(".json") and current_run not in item["Key"]
        ),
        reverse=True,
    )[:limit]
    docs = []
    for key in keys:
        try:
            body = s3.get_object(Bucket=BUCKET, Key=key)["Body"].read()
            docs.append(json.loads(body))
        except Exception:  # noqa: BLE001
            continue
    return docs


def apply_persistence(candidates, previous):
    for current in candidates:
        current_time = datetime.fromisoformat(current["validStart"].replace("Z", "+00:00"))
        cycles = 1
        matched_runs = []
        for doc in previous:
            matches = []
            for old in ((doc.get("genesis") or {}).get("candidates") or []):
                try:
                    old_time = datetime.fromisoformat(old["validStart"].replace("Z", "+00:00"))
                    dt_h = abs((old_time - current_time).total_seconds()) / 3600
                    distance = haversine_km(current["center"], old["center"])
                except Exception:  # noqa: BLE001
                    continue
                if dt_h <= PERSISTENCE_TIME_H and distance <= PERSISTENCE_DISTANCE_KM:
                    matches.append((distance, old))
            if matches:
                matches.sort(key=lambda item: item[0])
                cycles += 1
                matched_runs.append(doc.get("run"))
        current["runPersistenceCycles"] = cycles
        current["persistenceMatchedRuns"] = [run for run in matched_runs if run]


def build_document(day, hh, model_payloads, now):
    run_time = parse_run_time(day, hh)
    run_id = f"{day}{hh:02d}"
    named = {}
    all_signals = []
    model_systems = []

    for model_id, payload in model_payloads.items():
        storms = payload["storms"]
        guidance = named_guidance(model_id, storms)
        for key, row in guidance.items():
            target = named.setdefault(
                key,
                {
                    "id": row["id"],
                    "officialName": row["name"],
                    "provenanceClass": "MODEL_GUIDANCE",
                    "systems": [],
                },
            )
            target["systems"].append(row)

        all_signals.extend(genesis_signals(model_id, storms, run_time))
        model_systems.append(
            {
                "id": model_id,
                "provider": "ECMWF",
                "model": MODELS[model_id]["model"],
                "modelClass": MODELS[model_id]["class"],
                "kind": MODELS[model_id]["kind"],
                "status": "OK",
                "run": run_id,
                "sourceUrl": payload["url"],
                "sourceBytes": payload["bytes"],
                "messageCount": len(storms),
                "totalMembersMax": max((s["totalMembers"] for s in storms), default=0),
                "modelHorizonH": max((s["modelHorizonH"] for s in storms), default=0),
            }
        )

    candidates = build_genesis_candidates(all_signals, run_time)
    previous = previous_docs(run_id, limit=3)
    apply_persistence(candidates, previous)

    available_ids = set(model_payloads)
    for model_id in MODELS:
        if model_id not in available_ids:
            model_systems.append(
                {
                    "id": model_id,
                    "provider": "ECMWF",
                    "model": MODELS[model_id]["model"],
                    "modelClass": MODELS[model_id]["class"],
                    "kind": MODELS[model_id]["kind"],
                    "status": "UNAVAILABLE_FOR_SELECTED_RUN",
                    "run": run_id,
                }
            )

    document = {
        "schemaVersion": "2.0",
        "generated": now.isoformat().replace("+00:00", "Z"),
        "run": run_id,
        "runTime": run_time.isoformat().replace("+00:00", "Z"),
        "provenanceClass": "MODEL_GUIDANCE",
        "source": "ECMWF Open Data tropical cyclone tracks including genesis (BUFR)",
        "license": "CC-BY-4.0 — ECMWF",
        "horizons": {
            "officialDisplayH": [0, 120],
            "modelGuidanceH": [GUIDANCE_START_H, GUIDANCE_END_H],
            "genesisOutlookH": [GENESIS_START_H, GENESIS_END_H],
        },
        "modelSystems": sorted(model_systems, key=lambda row: row["id"]),
        "namedSystems": sorted(named.values(), key=lambda row: row["officialName"] or row["id"]),
        "genesis": {
            "kind": "MODEL_GUIDANCE_GENESIS_DENSITY",
            "windowH": [GENESIS_START_H, GENESIS_END_H],
            "gridDeg": GENESIS_GRID_DEG,
            "candidates": candidates,
            "evidenceRule": {
                "memberSupport": "raw unique ensemble-member count; NOT a calibrated probability",
                "agreement": {
                    "HIGH": "2+ independent model systems and >=5 supporting members in each",
                    "MEDIUM": "2+ independent model systems with lower raw member support",
                    "LOW": "one model system only",
                },
                "persistence": (
                    f"current cycle + up to 3 archived cycles with a candidate within "
                    f"{PERSISTENCE_DISTANCE_KM:.0f} km and {PERSISTENCE_TIME_H:.0f} h of valid time"
                ),
            },
        },
        "adapters": {
            "ECMWF_IFS_ENS": "CONNECTED" if "ECMWF_IFS_ENS" in available_ids else "UNAVAILABLE",
            "ECMWF_AIFS_ENS": "CONNECTED" if "ECMWF_AIFS_ENS" in available_ids else "UNAVAILABLE",
            "KIM_EPS": "ADAPTER_PENDING",
        },
        "displayPolicy": {
            "official0to5Days": "Use KMA/JMA official products from the separate official pipeline.",
            "days6to10": "Render raw ensemble-member spread/corridor as MODEL_GUIDANCE; do not extend the official line.",
            "days11to15": "Render genesis candidate zones/density only; no single precision track.",
            "candidateNaming": "Never attach a future official typhoon name before the responsible official centre assigns it.",
            "calibratedProbability": "DISABLED_UNTIL_VERIFIED",
        },
    }
    return document


def store(document):
    body = json.dumps(document, ensure_ascii=False, separators=(",", ":")).encode("utf-8")
    s3.put_object(
        Bucket=BUCKET,
        Key=LATEST,
        Body=body,
        ContentType="application/json; charset=utf-8",
        CacheControl="public, max-age=1800",
    )
    s3.put_object(
        Bucket=BUCKET,
        Key=f"{ARCHIVE}/{document['run']}.json",
        Body=body,
        ContentType="application/json; charset=utf-8",
        CacheControl="no-store",
    )


def handler(event, context):
    now = datetime.now(timezone.utc)
    selected = choose_run(now)
    if not selected:
        return {"ok": False, "reason": "NO_00_12_TC_BUFR_AVAILABLE"}

    day, hh, urls = selected
    payloads = {}
    errors = {}
    for model_id, url in urls.items():
        if not url:
            continue
        try:
            storms, size = parse_ensemble(url)
            payloads[model_id] = {"url": url, "storms": storms, "bytes": size}
        except Exception as exc:  # noqa: BLE001
            errors[model_id] = type(exc).__name__
            print(f"[tropical-intelligence] {model_id} failed: {type(exc).__name__}")

    if not payloads:
        return {"ok": False, "reason": "TC_BUFR_DECODE_FAILED", "errors": errors}

    document = build_document(day, hh, payloads, now)
    store(document)
    return {
        "ok": True,
        "run": document["run"],
        "models": [row["id"] for row in document["modelSystems"] if row["status"] == "OK"],
        "namedSystems": len(document["namedSystems"]),
        "genesisCandidates": len(document["genesis"]["candidates"]),
        "errors": errors,
    }
