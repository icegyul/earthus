# -*- coding: utf-8 -*-
"""해변 방위 만들기 — 서핑 기능의 재료

무엇을 만드나
  한국 해변마다 **바다가 어느 쪽인가**(facing)를 계산해 정적 파일로 만든다.
  해변은 움직이지 않으므로 한 번 만들면 된다 — 런타임에 OSM 을 부르지 않는다.

왜 필요한가
  서핑 판단은 세 가지가 맞아떨어져야 한다:
      스웰 높이·주기  ×  **해변이 보는 방향**  ×  바람 방향
  북향 해변에 남쪽 스웰은 들어오지 않는다. 방위 없이는 "파고 1.5m"만
  반복하는 셈이고, 그건 이미 다른 앱이 다 한다.

어떻게 내나
  ⚠️ OSM 규약: natural=coastline 은 진행 방향 기준 **왼쪽이 육지, 오른쪽이 바다**.
     → 바다 방향 = 선분 방위 + 90°

  ⚠️ 방위를 그대로 평균 내면 안 된다. 해안선 잔굴곡 때문에 선분 방위가 크게
     흔들리는데 벡터로 더하면 상쇄돼 엉뚱한 값이 나온다
     (실측: 동해안 죽도해변이 37° 로 나왔다 — 90° 여야 한다).
     방향이 아니라 **축(axis)** 으로 다룬다: 각도를 2배로 늘려 평균 낸 뒤 절반으로.

  ⚠️ 해변 점에서 재면 안 된다. OSM 의 해변 노드는 주차장·입구에 찍혀 있기도 해서
     해안선까지 800m 넘게 떨어진 경우가 있다. 그 반경으로 평균 내면 앞바다가 아니라
     옆 만(灣)의 해안선이 섞인다.
     → **해안선에 먼저 붙인 뒤(snap)** 그 지점 기준 좁은 구간만 쓴다.

⚠️ 못 내면 못 냈다고 적는다. 방위를 지어내면 "이 스웰이 들어온다"는 판단이
   통째로 거짓이 된다.
"""
import json, math, os, sys, time, urllib.parse, urllib.request

UA = {"User-Agent": "earthus.net (dalur@kakao.com)"}
ENDPOINTS = ["https://overpass-api.de/api/interpreter",
             "https://overpass.kumi.systems/api/interpreter",
             "https://overpass.private.coffee/api/interpreter"]
_ep = 0

SNAP_MAX_M = 900       # 해안선이 이보다 멀면 그 해변은 포기한다
# ⚠️ 구간을 **넓은 것부터 좁혀 가며** 시도한다.
#    넓게 볼수록 잔굴곡이 상쇄돼 안정적이지만, 제주처럼 굴곡이 심한 화산 해안에서는
#    700m 안에 만(灣)이 통째로 들어와 방향이 뭉개진다(실측: 제주 42곳 중 8곳만 산출).
#    → 일관성이 문턱을 넘는 **가장 넓은 구간**을 쓴다. 넓을수록 믿을 만하므로.
SPANS_M = [700, 400, 250]
MIN_SEGS = 6           # 선분이 이보다 적으면 방위가 의미 없다
MIN_CONSIST = 0.35     # 축 일관성 — 이보다 낮으면 해안선이 너무 복잡하다

R = math.pi / 180


def ov(q, tries=8):
    global _ep
    last = None
    for k in range(tries):
        url = ENDPOINTS[_ep % len(ENDPOINTS)]
        try:
            req = urllib.request.Request(
                url, data=urllib.parse.urlencode({"data": q}).encode(), headers=UA)
            return json.load(urllib.request.urlopen(req, timeout=240))
        except Exception as e:                                # noqa: BLE001
            last = e
            _ep += 1
            wait = 5 * (k + 1)
            print(f"      · {url.split('/')[2]} 실패({getattr(e,'code',type(e).__name__)})"
                  f" — {wait}초 뒤 재시도", flush=True)
            time.sleep(wait)
    raise RuntimeError(f"overpass 실패: {last}")


def bearing(a, b):
    y = math.sin((b[1] - a[1]) * R) * math.cos(b[0] * R)
    x = (math.cos(a[0] * R) * math.sin(b[0] * R)
         - math.sin(a[0] * R) * math.cos(b[0] * R) * math.cos((b[1] - a[1]) * R))
    return (math.degrees(math.atan2(y, x)) + 360) % 360


def km(a1, o1, a2, o2):
    dl = (o2 - o1) * R
    dp = (a2 - a1) * R
    h = math.sin(dp / 2) ** 2 + math.cos(a1 * R) * math.cos(a2 * R) * math.sin(dl / 2) ** 2
    return 2 * 6371 * math.asin(math.sqrt(h))


def load_coast(bbox):
    """지역 해안선을 **한 번만** 받아 선분 목록으로 편다.
    ⚠️ 해변마다 부르면 Overpass 가 429 를 준다(실측). 지역 단위로 받아 재사용한다."""
    s, w, n, e = bbox
    j = ov(f'[out:json][timeout:180];way["natural"="coastline"]({s},{w},{n},{e});out geom;')
    segs = []
    for way in j.get("elements", []):
        g = way.get("geometry") or []
        for i in range(len(g) - 1):
            a = (g[i]["lat"], g[i]["lon"])
            b = (g[i + 1]["lat"], g[i + 1]["lon"])
            L = km(a[0], a[1], b[0], b[1]) * 1000
            if L < 1:
                continue
            segs.append({"a": a, "b": b, "mid": ((a[0]+b[0])/2, (a[1]+b[1])/2),
                         "br": bearing(a, b), "L": L})
    return segs


def facing(lat, lon, segs):
    """(바다방향°, 일관성, 선분수, 붙은거리m) — 못 내면 sea=None"""
    # ① 가장 가까운 해안선 선분에 붙인다
    best = None
    for s in segs:
        d = km(lat, lon, s["mid"][0], s["mid"][1]) * 1000
        if best is None or d < best[0]:
            best = (d, s)
    if best is None:
        return None, 0, 0, None, None
    snap_d, snap = best
    if snap_d > SNAP_MAX_M:
        return None, 0, 0, snap_d, None

    cx, cy = snap["mid"]
    best_try = None
    for span in SPANS_M:
        # ② 붙은 지점 기준 그 구간의 해안선만 (해변 앞바다만 보게)
        use = [s for s in segs if km(cx, cy, s["mid"][0], s["mid"][1]) * 1000 <= span]
        if len(use) < MIN_SEGS:
            continue

        # ③ 축 평균 — 각도를 2배로 늘려 더한 뒤 되돌린다
        sx = sy = tot = 0.0
        for s in use:
            r = math.radians(s["br"] * 2)
            sx += math.cos(r) * s["L"]; sy += math.sin(r) * s["L"]; tot += s["L"]
        axis = ((math.degrees(math.atan2(sy, sx)) + 360) % 360) / 2
        consist = math.hypot(sx, sy) / max(tot, 1e-9)

        # ④ 어느 법선이 바다인가 — 규약(+90)이 어느 쪽에 몰리는지 길이 가중 투표
        n1, n2 = (axis + 90) % 360, (axis + 270) % 360
        v1 = v2 = 0.0
        for s in use:
            sea = (s["br"] + 90) % 360
            d1 = abs(((sea - n1 + 180) % 360) - 180)
            d2 = abs(((sea - n2 + 180) % 360) - 180)
            (v1, v2) = (v1 + s["L"], v2) if d1 < d2 else (v1, v2 + s["L"])
        sea = n1 if v1 >= v2 else n2

        if best_try is None:
            best_try = (sea, consist, len(use), snap_d, span)
        if consist >= MIN_CONSIST:
            # 넓은 것부터 봤으므로 여기서 멈추는 게 가장 믿을 만한 답이다
            return sea, consist, len(use), snap_d, span
    if best_try is None:
        return None, 0, 0, snap_d, None
    return best_try                      # 문턱 미달 — 호출부가 버린다


# ── 지역 ─────────────────────────────────────────────────────────
# 한 번에 전국을 받으면 응답이 너무 크고 서버에 무리다. 해안 구역으로 나눈다.
REGIONS = [
    ("동해 북부 (고성·속초·양양)", (37.90, 128.40, 38.65, 129.00)),
    ("동해 중부 (강릉·동해·삼척)", (37.05, 128.70, 37.95, 129.45)),
    ("동해 남부 (울진·포항·경주)", (35.85, 129.05, 37.10, 129.75)),
    ("남해 동부 (부산·거제·통영)", (34.60, 128.20, 35.35, 129.35)),
    ("남해 서부 (여수·완도·해남)", (34.05, 126.20, 35.05, 128.30)),
    ("제주", (33.10, 126.10, 33.60, 127.00)),
    ("서해 중부 (태안·보령·서천)", (36.00, 126.00, 37.10, 126.75)),
    ("서해 북부 (인천·강화)", (37.10, 126.10, 37.80, 126.85)),
]

DIR8 = ['북', '북동', '동', '남동', '남', '남서', '서', '북서']

# ⚠️⚠️ 사람이 확인해 준 이름. **재생성해도 살아남아야 한다** —
#    OSM 에는 로마자만 있는 곳이 있어서, 이 표가 없으면 다음 실행 때
#    'Jiksan-Beach' 가 그대로 돌아온다. 좌표(소수 3자리)로 짚는다.
#    데이터 파일(prototype/data/beaches.json)에도 같은 값이 들어 있다 —
#    한쪽만 고치면 어긋난다.
NAME_FIX = {
    "36.733,129.476": "직산해변",      # 경북 울진 (OSM: Jiksan-Beach)
}


def fixed_name(name, lat, lon):
    k = f"{round(lat, 3)},{round(lon, 3)}"
    return NAME_FIX.get(k, name)


def main():
    """⚠️ 지역을 인자로 받는다. 전국을 한 번에 돌리면 Overpass 대기 때문에
       10분을 넘기고, 그동안 진행 상황을 볼 수 없다. 한 지역씩 돌려 이어붙인다.
         python3 beaches.py <출력파일> [지역번호…]"""
    picks = [int(x) for x in sys.argv[2:]] if len(sys.argv) > 2 else range(len(REGIONS))
    regions = [REGIONS[i] for i in picks]
    dst = sys.argv[1] if len(sys.argv) > 1 else "beaches.json"

    # 이미 만든 게 있으면 이어붙인다
    out, seen = [], set()
    if os.path.exists(dst):
        try:
            prev = json.load(open(dst, encoding="utf-8"))
            out = prev.get("beaches", [])
            seen = {f"{b['name']}@{round(b['lat'],3)},{round(b['lon'],3)}" for b in out}
            print(f"  (이어붙이기: 기존 {len(out)}개)", flush=True)
        except Exception:
            pass

    for label, bbox in regions:
        s, w, n, e = bbox
        print(f"■ {label}", flush=True)
        try:
            coast = load_coast(bbox)
        except Exception as ex:                               # noqa: BLE001
            print(f"   해안선 실패: {ex}"); continue
        print(f"   해안선 선분 {len(coast):,}개", flush=True)
        time.sleep(2)
        try:
            j = ov(f'[out:json][timeout:180];'
                   f'(node["natural"="beach"]({s},{w},{n},{e});'
                   f' way["natural"="beach"]({s},{w},{n},{e});'
                   f' relation["natural"="beach"]({s},{w},{n},{e}););'
                   f'out tags center;')
        except Exception as ex:                               # noqa: BLE001
            print(f"   해변 실패: {ex}"); continue
        els = [x for x in j.get("elements", []) if (x.get("tags") or {}).get("name")]
        ok = 0
        for x in els:
            t = x["tags"]; c = x.get("center") or x
            lat, lon = c.get("lat"), c.get("lon")
            if lat is None:
                continue
            name = fixed_name(t["name"].strip(), lat, lon)
            key = f"{name}@{round(lat,3)},{round(lon,3)}"
            if key in seen:
                continue
            seen.add(key)
            sea, consist, nseg, snap, span = facing(lat, lon, coast)
            rec = {"name": name, "nameEn": t.get("name:en"),
                   "lat": round(lat, 5), "lon": round(lon, 5), "region": label}
            if sea is not None and consist >= MIN_CONSIST:
                rec["facing"] = round(sea)
                rec["facingDir"] = DIR8[round(sea / 45) % 8]
                rec["consist"] = round(consist, 2)
                rec["snapM"] = round(snap)
                rec["segs"] = nseg
                rec["spanM"] = span
                ok += 1
            else:
                # ⚠️ 못 냈으면 이유를 적는다. 나중에 고칠 단서가 된다.
                rec["facing"] = None
                rec["why"] = ("해안선이 멀다" if snap is None or (snap and snap > SNAP_MAX_M)
                              else ("선분이 적다" if nseg < MIN_SEGS else "해안선이 복잡하다"))
                if snap is not None:
                    rec["snapM"] = round(snap)
                rec["consist"] = round(consist, 2)
            out.append(rec)
        print(f"   해변 {len(els)}개 · 방위 산출 {ok}개", flush=True)
        time.sleep(3)

    out.sort(key=lambda r: (r["region"], r["name"]))
    got = [r for r in out if r.get("facing") is not None]
    doc = {
        "generated": time.strftime("%Y-%m-%dT%H:%M:00Z", time.gmtime()),
        "source": "OpenStreetMap (natural=beach, natural=coastline)",
        "license": "ODbL 1.0 — © OpenStreetMap contributors",
        "method": {
            "ko": "해변에서 가장 가까운 해안선에 붙인 뒤, 그 지점 반경 700m 의 해안선 "
                  "선분들을 **축 평균**해 뻗은 방향을 내고, OSM 해안선 규약"
                  "(진행 방향 왼쪽이 육지·오른쪽이 바다)으로 바다 쪽을 골랐습니다.",
            "en": "Snapped to the nearest coastline, then the axial mean of segments "
                  "within 700 m gives the shore axis; the seaward normal follows the "
                  "OSM coastline convention (land on the left, water on the right).",
        },
        "note": {
            "ko": "⚠️ facing 이 null 인 해변은 방위를 **내지 못한 것**입니다. "
                  "해안선이 멀거나 복잡한 경우인데, 지어내면 '이 스웰이 들어온다'는 "
                  "판단이 통째로 거짓이 되므로 비워 둡니다.",
            "en": "⚠️ null facing means we could not determine it — left empty rather "
                  "than guessed.",
        },
        "rule": {"snapMaxM": SNAP_MAX_M, "spansM": SPANS_M,
                 "minSegs": MIN_SEGS, "minConsist": MIN_CONSIST},
        "count": len(out), "withFacing": len(got),
        "beaches": out,
    }
    with open(dst, "w", encoding="utf-8") as f:
        json.dump(doc, f, ensure_ascii=False, separators=(",", ":"))
    print(f"\n✓ {dst} — 해변 {len(out)}개 중 방위 {len(got)}개 "
          f"({100*len(got)/max(len(out),1):.0f}%) · {os.path.getsize(dst)//1024}KB")


if __name__ == "__main__":
    main()
