"""산불 — NASA FIRMS 위성 열점 탐지

왜 만드는가
  뉴스로 산불을 추정하면 안 된다. GDELT 는 "소방대가 불길과 사투(battle)" 를
  무력 충돌로 코딩해서, 실제로 프랑스·스페인 대형 산불이 "교전"으로 표시됐다.
  불은 위성이 직접 본다. 추정하지 말고 관측값을 쓴다.

자료
  NASA FIRMS 근실시간(NRT) 활성 화재 — VIIRS (Suomi-NPP + NOAA-20), 24시간치.
  키 없이 CSV 로 공개된다(실측). 375m 해상도, 하루 여러 번 통과.

  FRP(Fire Radiative Power, MW) = 불이 내뿜는 복사 에너지.
  이게 "얼마나 큰 불인가"를 나타내는 물리량이다. 개수보다 이걸 봐야 한다.

⚠️ 반드시 알아야 할 한계 — UI 에 그대로 쓴다
  · 열점 = 산불이 아니다. 화산·가스플레어·화전·공장 굴뚝도 잡힌다.
  · 구름에 가리면 안 보인다. "탐지 없음"이 "불이 없음"이 아니다.
  · 위성 통과 시각에만 본다. 그 사이에 난 불은 다음 통과까지 안 보인다.
  · 위치는 픽셀 중심이지 발화점이 아니다 (375m 격자).

⚠️ 왜 뭉치는가
  원본은 픽셀 단위라 큰 산불 하나가 수백 개 점으로 온다. 그대로 지도에 뿌리면
  점 5,000개가 유럽을 덮고 "몇 건의 산불인가"를 알 수 없다.
  가까운 픽셀을 하나의 화재로 묶고, FRP 를 합산한다.

⚠️⚠️ 지속 화재 ID — 이 파일에서 가장 중요한 부분
  군집은 매 실행마다 처음부터 다시 계산된다. 그래서 예전에는 같은 불이라도
  실행마다 다른 무명의 군집이었고, **시간축으로 이을 수가 없었다.**
  "이 불이 어디서 시작해 어디로 갔나"를 물으면 답할 수 없다는 뜻이다.
  1년치를 쌓아도 추적에는 못 쓰는 자료가 된다 — 매 시간이 손실이다.

  그래서 직전 실행 결과와 맞춰 ID 를 승계한다:
    · 직전 화재와 LINK_KM 안에 있으면 **같은 불로 보고 ID 를 물려받는다**
    · 없으면 새 ID 를 발급하고 firstSeen 을 기록한다
    · LOST_HOURS 동안 안 보이면 목록에서 내린다 (구름에 가려 잠깐 안 보이는 것과
      정말 꺼진 것을 구분할 방법이 없으므로, 유예를 두고 "관측 끊김"으로 남긴다)
  결과로 화재마다 발화 추정 시점·이동 경로·최대 FRP 시점이 자동으로 남는다.

  ⚠️ ID 는 "같은 불"이라는 우리의 **추정**이다. 위성 관측은 픽셀 격자이고
     통과 시각에만 보이므로, 두 불이 합쳐지거나 하나가 갈라지는 것을 정확히
     구분할 수 없다. 그래서 링크 근거(거리·경과 시간)를 함께 저장해
     나중에 검증할 수 있게 한다. 확신처럼 말하지 않는다.

출력
  s3://<CACHE_BUCKET>/events/wildfire.json        지도용 (현재 상태)
  s3://<CACHE_BUCKET>/events/wildfire-state.json  ID 승계용 내부 상태
"""

import csv
import io
import json
import math
import os
import urllib.request
from datetime import datetime, timezone

import boto3

# ── 지속 ID 설정 ──
# ⚠️ LINK_KM 을 너무 크게 잡으면 다른 불을 같은 불로 잇는다.
#    너무 작게 잡으면 바람에 밀려 이동한 같은 불을 새 불로 본다.
#    군집 반경(CLUSTER_KM=12km)보다 크고, 하루에 번질 수 있는 거리보다 작게.
LINK_KM = 25.0
LOST_HOURS = 12          # 이 시간 안 보이면 목록에서 내린다
STATE_KEY = "events/wildfire-state.json"

BUCKET = os.environ["CACHE_BUCKET"]
REGION = os.environ.get("CACHE_REGION") or os.environ.get("AWS_REGION")
s3 = boto3.client("s3", region_name=REGION)

BASE = "https://firms.modaps.eosdis.nasa.gov/data/active_fire"
SRC = [
    (f"{BASE}/suomi-npp-viirs-c2/csv/SUOMI_VIIRS_C2_Global_24h.csv", "Suomi-NPP VIIRS"),
    (f"{BASE}/noaa-20-viirs-c2/csv/J1_VIIRS_C2_Global_24h.csv", "NOAA-20 VIIRS"),
]
UA = {"User-Agent": "earthus/0.1 (+globe app)"}

# 묶는 반경. 큰 산불의 화선(fire front)은 수십 km 에 걸친다.
CLUSTER_KM = 12.0
# 이 미만은 버린다. 화전·소각 같은 작은 열원을 다 보여주면 지도가 덮인다.
MIN_FRP = 8.0
MIN_CLUSTER_FRP = 30.0      # 묶은 뒤 합산 FRP 가 이보다 작으면 안 보여준다
MAX_OUT = 900               # 지도에 올릴 최대 개수


def fetch_csv(url):
    req = urllib.request.Request(url, headers=UA)
    with urllib.request.urlopen(req, timeout=120) as r:
        return r.read().decode("utf-8", "replace")


def km(a_lat, a_lon, b_lat, b_lon):
    dlat = (b_lat - a_lat) * 110.574
    dlon = (b_lon - a_lon) * 111.320 * math.cos(math.radians((a_lat + b_lat) / 2))
    return math.hypot(dlat, dlon)


def load():
    pts = []
    for url, sat in SRC:
        try:
            rows = list(csv.DictReader(io.StringIO(fetch_csv(url))))
        except Exception as e:                               # noqa: BLE001
            print(f"[{sat}] 실패 {e!r}")
            continue
        n = 0
        for r in rows:
            try:
                frp = float(r.get("frp") or 0)
                if frp < MIN_FRP:
                    continue
                conf = (r.get("confidence") or "").lower()
                if conf == "low":                 # 저신뢰는 버린다
                    continue
                pts.append({
                    "lat": float(r["latitude"]), "lon": float(r["longitude"]),
                    "frp": frp,
                    "date": r.get("acq_date"), "time": r.get("acq_time"),
                    "conf": conf, "sat": sat,
                    "day": (r.get("daynight") or "").upper() == "D",
                })
                n += 1
            except (ValueError, KeyError, TypeError):
                continue
        print(f"[{sat}] {len(rows)}건 중 {n}건 채택")
    return pts


def cluster(pts):
    """격자 기반 근접 묶기.

    ⚠️ 전수 비교(O(n²))는 못 쓴다. 전지구 24시간이면 수만 점이라 Lambda 가 죽는다.
       위경도 격자에 넣고 이웃 칸만 본다 → 사실상 O(n).
    """
    cell = CLUSTER_KM / 111.0            # 대략적인 도 단위 격자
    grid = {}
    for p in pts:
        key = (int(p["lat"] / cell), int(p["lon"] / (cell / max(0.15, math.cos(math.radians(p["lat"]))))))
        grid.setdefault(key, []).append(p)

    seen = set()
    out = []
    # FRP 큰 점부터 씨앗으로 삼는다 — 화재의 중심이 가장 뜨거운 쪽에 잡힌다
    for seed in sorted(pts, key=lambda x: -x["frp"]):
        if id(seed) in seen:
            continue
        gy = int(seed["lat"] / cell)
        gx = int(seed["lon"] / (cell / max(0.15, math.cos(math.radians(seed["lat"])))))
        members = []
        for dy in (-1, 0, 1):
            for dx in (-1, 0, 1):
                for q in grid.get((gy + dy, gx + dx), []):
                    if id(q) in seen:
                        continue
                    if km(seed["lat"], seed["lon"], q["lat"], q["lon"]) <= CLUSTER_KM:
                        members.append(q)
        if not members:
            continue
        for q in members:
            seen.add(id(q))

        total = sum(m["frp"] for m in members)
        if total < MIN_CLUSTER_FRP:
            continue
        # 중심은 FRP 가중 평균 — 가장 강한 쪽으로 끌린다
        clat = sum(m["lat"] * m["frp"] for m in members) / total
        clon = sum(m["lon"] * m["frp"] for m in members) / total
        latest = max(members, key=lambda m: (m["date"] or "", m["time"] or ""))
        out.append({
            "lat": round(clat, 4), "lon": round(clon, 4),
            "frp": round(total, 1),
            "peak": round(max(m["frp"] for m in members), 1),
            "count": len(members),
            "date": latest["date"], "time": latest["time"],
            "sats": sorted({m["sat"] for m in members}),
            "highConf": sum(1 for m in members if m["conf"] == "high"),
            # 화선 길이 — 가장 먼 두 점 사이 거리의 근사
            "spanKm": round(max(
                (km(clat, clon, m["lat"], m["lon"]) for m in members), default=0) * 2, 1),
        })

    out.sort(key=lambda x: -x["frp"])
    return out


def load_state():
    """직전 실행의 화재 목록. 없으면 빈 상태로 시작한다."""
    try:
        b = s3.get_object(Bucket=BUCKET, Key=STATE_KEY)["Body"].read()
        j = json.loads(b)
        return j.get("fires", []), int(j.get("nextId", 1))
    except s3.exceptions.NoSuchKey:
        print("[state] 첫 실행 — 상태 파일 없음")
        return [], 1
    except Exception as e:                                   # noqa: BLE001
        # ⚠️ S3 는 ListBucket 권한이 없으면 "없는 객체"에도 AccessDenied 를 준다.
        #    그래서 첫 실행에서 NoSuchKey 가 아니라 AccessDenied 가 온다 —
        #    이걸 오류로 읽으면 "권한 문제"라고 엉뚱한 데를 파게 된다.
        if "AccessDenied" in repr(e) or "NoSuchKey" in repr(e):
            print("[state] 상태 파일 없음 (첫 실행)")
        else:
            print("[state] 읽기 실패 —", repr(e))
        return [], 1


def assign_ids(fires, prev, next_id, now_iso):
    """직전 화재와 맞춰 ID 를 승계한다.

    ⚠️ 서로 가장 가까운 쌍부터 붙인다(그리디). 안 그러면 큰 불 하나가
       근처의 여러 이전 화재를 다 삼켜서 다른 불의 이력이 사라진다.
    """
    # ⚠️ 전수 비교(새 900 × 이전 900 = 81만 쌍)를 했더니 Lambda 가 메모리 초과로
    #    죽었다(Runtime.OutOfMemory). 군집화에서 쓴 것과 같은 격자로 이웃만 본다.
    cell = LINK_KM / 111.0
    def cellkey(lat, lon):
        return (int(lat / cell),
                int(lon / (cell / max(0.15, math.cos(math.radians(lat))))))

    grid = {}
    for j, p in enumerate(prev):
        grid.setdefault(cellkey(p["lat"], p["lon"]), []).append(j)

    pairs = []
    for i, f in enumerate(fires):
        gy, gx = cellkey(f["lat"], f["lon"])
        for dy in (-1, 0, 1):
            for dx in (-1, 0, 1):
                for j in grid.get((gy + dy, gx + dx), ()):
                    p = prev[j]
                    d = km(f["lat"], f["lon"], p["lat"], p["lon"])
                    if d <= LINK_KM:
                        pairs.append((d, i, j))
    pairs.sort()

    used_new, used_prev = set(), set()
    for d, i, j in pairs:
        if i in used_new or j in used_prev:
            continue
        used_new.add(i)
        used_prev.add(j)
        p = prev[j]
        f = fires[i]
        f["fid"] = p["fid"]
        f["firstSeen"] = p.get("firstSeen") or now_iso
        f["firstLat"] = p.get("firstLat", p["lat"])
        f["firstLon"] = p.get("firstLon", p["lon"])
        f["peakFrp"] = max(p.get("peakFrp", 0), f["frp"])
        f["peakAt"] = now_iso if f["frp"] >= p.get("peakFrp", 0) else p.get("peakAt")
        f["seenCount"] = int(p.get("seenCount", 1)) + 1
        # ⚠️ 링크 근거를 남긴다. "같은 불"은 우리의 추정이므로 검증 가능해야 한다.
        f["link"] = {"km": round(d, 1), "fromLat": p["lat"], "fromLon": p["lon"]}
        # 발화 추정 지점에서 얼마나 이동했나 — "어디서 어디로"의 답
        f["movedKm"] = round(km(f["firstLat"], f["firstLon"], f["lat"], f["lon"]), 1)

    # 새로 나타난 불
    for i, f in enumerate(fires):
        if i in used_new:
            continue
        f["fid"] = f"F{next_id:06d}"
        next_id += 1
        f["firstSeen"] = now_iso
        f["firstLat"], f["firstLon"] = f["lat"], f["lon"]
        f["peakFrp"] = f["frp"]
        f["peakAt"] = now_iso
        f["seenCount"] = 1
        f["movedKm"] = 0.0
        f["isNew"] = True

    # 이번에 안 보인 이전 화재 — 유예 시간 안이면 상태에 남겨 둔다
    #   ⚠️ 구름에 가려 안 보이는 것과 꺼진 것을 구분할 방법이 없다.
    #      바로 지우면 다음 통과 때 새 불로 잡혀 이력이 끊긴다.
    carried = []
    for j, p in enumerate(prev):
        if j in used_prev:
            continue
        try:
            last = datetime.strptime(p.get("lastSeen", ""), "%Y-%m-%dT%H:%M:%SZ").replace(tzinfo=timezone.utc)
        except Exception:                                    # noqa: BLE001
            continue
        age_h = (datetime.now(timezone.utc) - last).total_seconds() / 3600
        if age_h <= LOST_HOURS:
            q = dict(p)
            q["missingHours"] = round(age_h, 1)
            carried.append(q)

    for f in fires:
        f["lastSeen"] = now_iso

    return fires, carried, next_id


def handler(event, context):
    now = datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")
    pts = load()
    fires = cluster(pts)
    shown = fires[:MAX_OUT]

    # ── 지속 ID 부여 ──
    prev, next_id = load_state()
    shown, carried, next_id = assign_ids(shown, prev, next_id, now)
    linked = sum(1 for f in shown if not f.get("isNew"))
    print(f"[id] 승계 {linked}건 / 신규 {len(shown)-linked}건 / 관측끊김 유지 {len(carried)}건")

    # ── 상태 저장 (다음 실행이 이걸 보고 잇는다) ──
    # ⚠️ 지도용 파일과 분리한다. 상태는 커지고 앱은 쓰지 않는다.
    state = {
        "generated": now, "nextId": next_id,
        "linkKm": LINK_KM, "lostHours": LOST_HOURS,
        "fires": [{k: f[k] for k in
                   ("fid", "lat", "lon", "frp", "firstSeen", "firstLat", "firstLon",
                    "peakFrp", "peakAt", "seenCount", "lastSeen")
                   if k in f} for f in shown] + carried,
    }
    try:
        s3.put_object(Bucket=BUCKET, Key=STATE_KEY,
                      Body=json.dumps(state, separators=(",", ":")).encode(),
                      ContentType="application/json",
                      CacheControl="no-store")      # 내부 상태 — 캐시하면 안 된다
    except Exception as e:                                   # noqa: BLE001
        print("[state] 저장 실패 —", repr(e))

    body = {
        "generated": now,
        "source": "NASA FIRMS — VIIRS 375m NRT (Suomi-NPP, NOAA-20), 24h",
        "credit": "NASA FIRMS. Data courtesy of NASA/USGS.",
        "detections": len(pts),
        "fires": len(fires),
        "shown": len(shown),
        "clusterKm": CLUSTER_KM,
        # 지속 ID 관련 — 앱이 "새로 난 불"과 "번지는 불"을 구분할 수 있다
        "linkKm": LINK_KM,
        "newFires": sum(1 for f in shown if f.get("isNew")),
        "tracked": sum(1 for f in shown if f.get("seenCount", 1) > 1),
        "note": ("Hotspots are not necessarily wildfires — volcanoes, gas flares and "
                 "agricultural burning also register. Cloud cover hides fires, and "
                 "satellites only see at overpass times."),
        "items": shown,
    }
    raw = json.dumps(body, ensure_ascii=False, separators=(",", ":")).encode()
    s3.put_object(Bucket=BUCKET, Key="events/wildfire.json", Body=raw,
                  ContentType="application/json", CacheControl="public, max-age=900")
    print(f"[wildfire] 열점 {len(pts)} → 화재 {len(fires)}건, {len(raw)/1024:.0f}KB")
    return {"ok": True, "detections": len(pts), "fires": len(fires),
            "top": [(f["lat"], f["lon"], f["frp"]) for f in shown[:3]]}
