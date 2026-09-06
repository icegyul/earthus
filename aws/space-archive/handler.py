"""우주 상태 아카이브 — 위성 관제센터 ARCHIVE 의 서버 쪽 (지시서 §17·§18·§20)

왜 있나
  관제센터 ARCHIVE 재생은 "지금 가진 궤도요소를 그 시각으로 역산" 하는 것이라 며칠만 지나도 실제와
  벌어진다. 지시서 §20: "최신 데이터만 덮어쓰면 안 된다. 현재 상태와 과거 상태를 함께 저장해야 한다."
  그래서 매시간 그 시각의 화면 상태를 남기고, 하루에 한 번 그날의 궤도요소 카탈로그를 통째로 보존한다.

무엇을 남기나 (전부 **공개 접두사**에 — 브라우저가 읽어야 하므로 archive/ 가 아니다)
  events/space-archive/dt=YYYY-MM-DD/hh=HH.json   그 시각의 발사(진행 중·예정)·근접사건·카탈로그 시각 (≈ 10 KB)
  events/space-archive/index.json                  어느 날·어느 시각이 있는지 (45일)
  celestrak/archive/dt=YYYY-MM-DD/catalog.json.gz  그날 첫 실행 때 catalog.json.gz 를 S3 안에서 복사 (다운로드 없음)
  celestrak/history-14d.json.gz                    객체별 14일 궤도 이력 [근지점, 원지점, 경사각×10, 주기×10] 정수

무엇을 안 하나
  · 값을 만들지 않는다. 그 시각에 S3 에 있던 파일을 그대로 요약한다.
  · 실패한 출처는 null 로 남긴다(축약본이 없으면 launches:null).
  · AETHERUS 발행 스냅샷은 여기서 새로 만들지 않는다 — tools/publish-aetherus-snapshot.sh 의 몫이다.
"""
import gzip
import io
import json
import math
import os
from datetime import datetime, timezone

import boto3
from botocore.exceptions import ClientError

BUCKET = os.environ["CACHE_BUCKET"]
REGION = os.environ.get("CACHE_REGION") or os.environ.get("AWS_REGION")
s3 = boto3.client("s3", region_name=REGION)

KEY_CATALOG = "celestrak/catalog.json.gz"
KEY_LAUNCH = "events/launches.json"
KEY_CONJ = "app/aetherus/conjunctions.json"
KEY_MANIFEST = "app/aetherus/manifest.json"
HOUR_PREFIX = "events/space-archive"
INDEX_KEY = f"{HOUR_PREFIX}/index.json"
CATALOG_DAY = "celestrak/archive/dt={dt}/catalog.json.gz"
HISTORY_KEY = "celestrak/history-14d.json.gz"
HISTORY_DAYS = 14
INDEX_DAYS = 45

MU = 398600.4418        # km³/s²
RE = 6378.137           # km


def read_json(key, gz=False):
    try:
        body = s3.get_object(Bucket=BUCKET, Key=key)["Body"].read()
    except ClientError as e:
        # ⚠️ 없는 키는 NoSuchKey 가 아니라 AccessDenied(403)로 온다 — 역할에 s3:ListBucket 이 없을 때(실측).
        #    우리 버킷의 우리 키이므로 403 = "아직 없음" 으로 읽는다. 쓰기 권한 문제는 put 에서 시끄럽게 난다.
        if e.response["Error"]["Code"] in ("NoSuchKey", "404", "403", "AccessDenied"):
            return None
        raise
    if gz or body[:2] == b"\x1f\x8b":
        body = gzip.decompress(body)
    return json.loads(body.decode("utf-8"))


def put_json(key, doc, cache="max-age=300", gz=False):
    body = json.dumps(doc, ensure_ascii=False, separators=(",", ":")).encode("utf-8")
    kw = {"Bucket": BUCKET, "Key": key, "ContentType": "application/json; charset=utf-8", "CacheControl": cache}
    if gz:
        body = gzip.compress(body, compresslevel=6)
        kw["ContentEncoding"] = "gzip"
    s3.put_object(Body=body, **kw)
    return len(body)


def exists(key):
    try:
        s3.head_object(Bucket=BUCKET, Key=key)
        return True
    except ClientError:
        return False


# ── 궤도요소 → 이력 한 줄 ──────────────────────────────────────────────────
def orbit_row(o):
    """카탈로그 행의 고정 순서 OMM 배열 → [근지점 km, 원지점 km, 경사각×10, 주기(분)×10] 정수. 못 풀면 None."""
    try:
        n_rev = float(o[1]); ecc = float(o[2]); inc = float(o[3])
    except (TypeError, ValueError, IndexError):
        return None
    if not (n_rev > 0) or not (0 <= ecc < 1):
        return None
    n_rad_s = n_rev * 2 * math.pi / 86400.0
    a = (MU / (n_rad_s * n_rad_s)) ** (1.0 / 3.0)
    period_min = 1440.0 / n_rev
    return [int(round(a * (1 - ecc) - RE)), int(round(a * (1 + ecc) - RE)), int(round(inc * 10)), int(round(period_min * 10))]


def catalog_objects(cat):
    """그룹마다 중복된 행을 NORAD 로 하나로 (korea 같은 그룹은 다른 그룹의 부분집합이다)."""
    out = {}
    for rows in (cat.get("groups") or {}).values():
        for r in rows or []:
            nid = str(r.get("id") or "")
            if nid and nid not in out:
                out[nid] = r
    return out


def update_history(hist, dt, objects):
    """이력 파일 갱신. 같은 날은 덮어쓰고(더 새 요소), 14일을 넘긴 날은 앞에서 자른다.
    없는 날은 null 로 남긴다 — 자리를 채우지 않는다."""
    days = list((hist or {}).get("days") or [])
    old = (hist or {}).get("objects") or {}
    if dt in days:
        idx = days.index(dt)
    else:
        days.append(dt)
        idx = len(days) - 1
    n = len(days)
    merged = {}
    keys = set(old.keys()) | set(objects.keys())
    for k in keys:
        arr = list(old.get(k) or [])
        arr += [None] * (n - len(arr))
        arr = arr[:n]
        arr[idx] = objects.get(k)
        merged[k] = arr
    if n > HISTORY_DAYS:
        cut = n - HISTORY_DAYS
        days = days[cut:]
        merged = {k: v[cut:] for k, v in merged.items()}
    # 14일 내내 비어 있는 객체는 뺀다(사라진 물체)
    merged = {k: v for k, v in merged.items() if any(x is not None for x in v)}
    return {"schema": "earthus.sat-history.v1", "unit": ["perigee_km", "apogee_km", "inclination_deg_x10", "period_min_x10"],
            "days": days, "objects": merged}


# ── 시간 스냅샷 ────────────────────────────────────────────────────────────
LAUNCH_KEEP = ("id", "name", "net", "status", "provider", "pad", "site", "lat", "lon", "mission", "orbitAbbrev", "rocket", "webcastLive")


def slim_launch(rec):
    return {k: rec.get(k) for k in LAUNCH_KEEP if rec.get(k) is not None}


def slim_conj(ev):
    snap = ev.get("latest_snapshot") or {}
    return {
        "a": (ev.get("primary") or {}).get("catalog_id"), "aName": (ev.get("primary") or {}).get("canonical_name"),
        "b": (ev.get("secondary") or {}).get("catalog_id"), "bName": (ev.get("secondary") or {}).get("canonical_name"),
        "tca": ev.get("tca"), "missM": snap.get("miss_distance_m"),
        "pc": ((snap.get("metrics") or {}).get("PC") or {}).get("status") or "NOT_COMPUTED",
    }


def hour_snapshot(now, launches, conj, manifest, catalog_generated):
    doc = {"schema": "earthus.space-archive-hour.v1", "generated": now.isoformat(timespec="seconds"),
           "launches": None, "conjunctions": None, "catalog": {"generated": catalog_generated}}
    if launches:
        doc["launches"] = {
            "generated": launches.get("generated"),
            "live": [slim_launch(x) for x in launches.get("live") or []],
            "upcoming": [slim_launch(x) for x in (launches.get("launches") or [])[:30]],
        }
    if conj:
        events = ((conj.get("data") or {}).get("events")) or []
        doc["conjunctions"] = {"publishedAt": (manifest or {}).get("generated_at"), "events": [slim_conj(e) for e in events]}
    return doc


def update_index(index, dt, hh, catalog_archived):
    days = {d["dt"]: d for d in ((index or {}).get("days") or [])}
    day = days.setdefault(dt, {"dt": dt, "hours": [], "catalog": False})
    if hh not in day["hours"]:
        day["hours"].append(hh)
        day["hours"].sort()
    day["catalog"] = day["catalog"] or catalog_archived
    ordered = sorted(days.values(), key=lambda d: d["dt"])[-INDEX_DAYS:]
    return {"schema": "earthus.space-archive-index.v1", "updated": datetime.now(timezone.utc).isoformat(timespec="seconds"),
            "hourKey": f"{HOUR_PREFIX}/dt={{dt}}/hh={{hh}}.json", "catalogKey": CATALOG_DAY, "historyKey": HISTORY_KEY,
            "days": ordered}


def handler(event=None, context=None):
    now = datetime.now(timezone.utc)
    dt, hh = f"{now:%Y-%m-%d}", f"{now:%H}"
    report = {"dt": dt, "hh": hh}

    # 1) 그날 첫 실행이면 카탈로그를 S3 안에서 복사해 보존한다 (다운로드 없음)
    day_key = CATALOG_DAY.format(dt=dt)
    catalog_archived = exists(day_key)
    force_history = bool((event or {}).get("forceHistory"))
    catalog_generated = None
    if (not catalog_archived or force_history) and exists(KEY_CATALOG):
        if not catalog_archived:
            s3.copy_object(Bucket=BUCKET, Key=day_key, CopySource={"Bucket": BUCKET, "Key": KEY_CATALOG},
                           MetadataDirective="COPY")
            catalog_archived = True
            report["catalogCopied"] = day_key
        # 2) 14일 이력 갱신 — 하루 한 번만 카탈로그를 읽는다
        cat = read_json(KEY_CATALOG, gz=True)
        catalog_generated = (cat or {}).get("generated")
        objs = {nid: orbit_row(r.get("o") or []) for nid, r in catalog_objects(cat or {}).items()}
        objs = {k: v for k, v in objs.items() if v}
        hist = update_history(read_json(HISTORY_KEY, gz=True), (catalog_generated or dt)[:10], objs)
        size = put_json(HISTORY_KEY, hist, cache="max-age=1800", gz=True)
        report["history"] = {"days": len(hist["days"]), "objects": len(hist["objects"]), "bytes": size}
    if catalog_generated is None:
        try:
            catalog_generated = s3.head_object(Bucket=BUCKET, Key=KEY_CATALOG)["LastModified"].isoformat(timespec="seconds")
        except ClientError:
            catalog_generated = None

    # 3) 이 시각의 상태
    launches = read_json(KEY_LAUNCH)
    conj = read_json(KEY_CONJ)
    manifest = read_json(KEY_MANIFEST)
    doc = hour_snapshot(now, launches, conj, manifest, catalog_generated)
    hour_key = f"{HOUR_PREFIX}/dt={dt}/hh={hh}.json"
    report["hourBytes"] = put_json(hour_key, doc, cache="max-age=3600")

    # 4) 색인
    index = update_index(read_json(INDEX_KEY), dt, hh, catalog_archived)
    put_json(INDEX_KEY, index, cache="max-age=300")
    report["indexDays"] = len(index["days"])
    print("[space-archive]", json.dumps(report, ensure_ascii=False))
    return report
