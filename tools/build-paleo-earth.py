#!/usr/bin/env python3
"""전지구 고지리 — 판별 회전 행렬 + 판이 붙은 해안선

왜 이렇게 하나: 시대별 해안선을 통째로 굽는 방법은 프레임당 gzip 350KB 라
26장이면 9MB 다. 그런데 GPlates 가 하는 일 자체가 **현재 해안선을 판마다 강체로
돌리는 것**이다. 그러면 우리도 판별 회전 하나씩만 가지면 된다.

  현재 해안선 한 벌 + 판 46개 × 시대별 3×3 행렬

한국(판 601)에서 이미 검증한 방식이다 — 기준점으로 역산한 회전으로 다른 점을
옮겨 GPlates 원본과 오차 0.0km 였다. 여기서는 그걸 46개 판으로 넓히고,
**전체 해안선으로 다시 검증**한다.

⚠️ 함정 둘 (한국 때 밟았다):
   · reconstruct_points 는 그 시점에 판이 없는 자리에 999.99 를 돌려준다.
     섞이면 회전이 통째로 망가진다. 반드시 걸러낸다.
   · 기준점은 반드시 그 판 폴리곤 **안**에 있어야 한다. 밖이면 다른 판의
     회전이 섞인다.

출처: GPlates Web Service (gws.gplates.org), The University of Sydney.
      회전 모델 MERDITH2021 — Merdith, A.S. et al. (2021) Earth-Science Reviews
      214, 103477.  데이터 CC BY.

사용: python tools/build-paleo-earth.py
"""

import json
import math
import urllib.request
from pathlib import Path

import numpy as np

GWS = "https://gws.gplates.org"
MODEL = "MERDITH2021"
ROOT = Path(__file__).resolve().parent.parent
OUT = ROOT / "prototype" / "data" / "paleo-earth.json"
CACHE = ROOT / ".tmp" / "paleo"

# 초대륙 이야기가 보이는 구간을 촘촘히.
TIMES = [0, 5, 10, 20, 30, 40, 50, 66, 80, 100, 120, 140, 160, 180,
         200, 220, 250, 280, 300, 335, 360, 400, 450, 500, 540, 600]

DP = 2            # 좌표 소수 둘째 자리 ≈ 1km (저장소 관례)
MIN_PTS = 5
MIN_SPAN = 0.6    # 이보다 작은 섬은 전지구 화면에서 한 점도 안 된다
SENTINEL = 180.0  # |값| 이 이보다 크면 판이 없다는 뜻 (999.99)


def get(url, name):
    CACHE.mkdir(parents=True, exist_ok=True)
    f = CACHE / name
    if f.exists():
        return json.loads(f.read_text(encoding="utf-8"))
    with urllib.request.urlopen(url, timeout=300) as r:
        raw = r.read()
    f.write_bytes(raw)
    return json.loads(raw.decode("utf-8"))


def to_vec(lon, lat):
    lo, la = math.radians(lon), math.radians(lat)
    return np.array([math.cos(la) * math.cos(lo),
                     math.cos(la) * math.sin(lo),
                     math.sin(la)])


def to_ll(p):
    return (math.degrees(math.atan2(p[1], p[0])),
            math.degrees(math.asin(max(-1.0, min(1.0, p[2])))))


def rings_of(geom):
    t = geom.get("type")
    polys = [geom["coordinates"]] if t == "Polygon" else (
        geom["coordinates"] if t == "MultiPolygon" else [])
    return [p[0] for p in polys if p and len(p[0]) >= 4]


def in_ring(lon, lat, ring):
    """짝수-홀수 규칙. 판 폴리곤은 날짜변경선을 넘는 것이 있어 완벽하지 않지만,
    기준점을 고르는 용도라 폴리곤 안에 확실히 들어가는 점만 취하면 충분하다."""
    inside = False
    n = len(ring)
    for i in range(n - 1):
        x1, y1 = ring[i]
        x2, y2 = ring[i + 1]
        if abs(x1 - x2) > 180:      # 이음매를 넘는 변은 건너뛴다
            continue
        if (y1 > lat) != (y2 > lat):
            xin = x1 + (lat - y1) * (x2 - x1) / (y2 - y1)
            if lon < xin:
                inside = not inside
    return inside


def seeds_for(ring, want=6):
    """폴리곤 안쪽 점을 격자로 훑어 고른다. 바깥 점을 쓰면 다른 판이 섞인다."""
    xs = [p[0] for p in ring]
    ys = [p[1] for p in ring]
    x0, x1 = min(xs), max(xs)
    y0, y1 = min(ys), max(ys)
    if x1 - x0 > 180:               # 이음매를 걸친 판은 기준점 고르기가 위험하다
        return []
    out = []
    for i in range(1, 12):
        for j in range(1, 12):
            lon = x0 + (x1 - x0) * i / 12
            lat = y0 + (y1 - y0) * j / 12
            if in_ring(lon, lat, ring):
                out.append((round(lon, 3), round(lat, 3)))
                if len(out) >= want * 3:
                    break
        if len(out) >= want * 3:
            break
    # 서로 멀리 떨어진 것들로 골라야 회전이 안정된다
    out.sort(key=lambda p: (p[0] * 7 + p[1] * 13) % 1.0)
    return out[:want]


def reconstruct(points, time):
    s = ",".join(f"{lo},{la}" for lo, la in points)
    url = f"{GWS}/reconstruct/reconstruct_points/?points={s}&time={time}&model={MODEL}"
    with urllib.request.urlopen(url, timeout=300) as r:
        return json.load(r)["coordinates"]


def kabsch(before, after):
    A = np.array([to_vec(*b) for b in before])
    B = np.array([to_vec(*a) for a in after])
    U, _, Vt = np.linalg.svd(A.T @ B)
    d = np.sign(np.linalg.det(Vt.T @ U.T))
    return Vt.T @ np.diag([1.0, 1.0, d]) @ U.T


def recon_chunked(points, time, tag):
    """reconstruct_points 는 URL 길이 한도가 있다. 250점씩 쪼개 부른다."""
    out = []
    for i in range(0, len(points), 250):
        s_ = ",".join(f"{lo},{la}" for lo, la in points[i:i + 250])
        out += get(f"{GWS}/reconstruct/reconstruct_points/"
                   f"?points={s_}&time={time}&model={MODEL}",
                   f"{tag}{time}_{i}.json")["coordinates"]
    return out


def assign_plates(points):
    """GPlates 에게 이 점이 어느 판인지 묻는다. 판 폴리곤을 우리가 직접 훑으면
    날짜변경선을 걸친 판에서 틀린다 — 원본에 물어보는 쪽이 맞다.

    ⚠️ 서버가 가끔 빈 배열을 돌려준다(실제로 344청크 중 5개가 그랬다). 길이를
       확인하지 않으면 그만큼 밀려서 뒤의 점이 전부 엉뚱한 판으로 배정된다."""
    out = []
    for i in range(0, len(points), 250):
        chunk = points[i:i + 250]
        s_ = ",".join(f"{lo},{la}" for lo, la in chunk)
        url = f"{GWS}/reconstruct/assign_points_plate_ids/?points={s_}&model={MODEL}"
        got = None
        for attempt in range(3):
            try:
                got = get(url, f"pid{i}.json")
            except Exception as e:
                got = None
            if isinstance(got, list) and len(got) == len(chunk):
                break
            (CACHE / f"pid{i}.json").unlink(missing_ok=True)   # 캐시에 실패를 남기지 않는다
            got = None
        if got is None:
            print(f"    ⚠ {i}~{i+len(chunk)} 판 배정 실패 — 그 점들은 빼고 간다")
            got = [None] * len(chunk)
        out += got
    return out


def main():
    print("▸ 해안선 (현재)")
    coast = get(f"{GWS}/reconstruct/coastlines/?time=0&model={MODEL}", "coast0.json")

    rings = []
    for f in coast["features"]:
        for ring in rings_of(f.get("geometry") or {}):
            xs = [q[0] for q in ring]
            ys = [q[1] for q in ring]
            if (max(xs) - min(xs)) < MIN_SPAN and (max(ys) - min(ys)) < MIN_SPAN:
                continue
            pts, prev = [], None
            for x, y in ring:
                q = [round(x, DP), round(y, DP)]
                if q != prev:
                    pts.append(q)
                    prev = q
            if len(pts) >= MIN_PTS:
                rings.append(pts)
    print(f"  쓸 만한 고리 {len(rings)}개")

    # ⚠️ 처음엔 고리 하나에 판 하나를 통째로 배정했다가 200Ma 에서 161km 어긋났다.
    #    긴 해안선은 판 경계를 넘는다 — 최근 시대엔 판이 서로 안 벌어져 안 보이다가
    #    시대가 올라가면 드러난다. 꼭짓점마다 물어보고 같은 판끼리 끊어 잇는다.
    print("▸ 꼭짓점마다 어느 판인지 묻는다")
    allpts = [tuple(q) for r in rings for q in r]
    print(f"  꼭짓점 {len(allpts):,}개")
    vpid = assign_plates(allpts)

    by_plate, i = {}, 0
    for r in rings:
        run, cur = [], None
        for q in r:
            pid = vpid[i]; i += 1
            pid = int(pid) if pid is not None else None
            if pid != cur:
                if cur is not None and len(run) >= MIN_PTS:
                    by_plate.setdefault(cur, []).append(run)
                run, cur = ([run[-1]] if run else []), pid
            run.append(q)
        if cur is not None and len(run) >= MIN_PTS:
            by_plate.setdefault(cur, []).append(run)
    print(f"  같은 판끼리 끊어 이은 조각 {sum(len(v) for v in by_plate.values())}개")
    print(f"  판 {len(by_plate)}개 — 큰 것부터: "
          + ", ".join(f"{p}({len(v)})" for p, v in
                      sorted(by_plate.items(), key=lambda kv: -len(kv[1]))[:8]))

    # 기준점은 그 판의 해안선 위에서 고른다 — 판 위에 확실히 있는 점이다
    MIN_PLATE_PTS = 60          # 이보다 작은 판은 전지구 화면에서 안 보인다
    small = [p for p, rs in by_plate.items()
             if sum(len(r) for r in rs) < MIN_PLATE_PTS]
    for p in small:
        del by_plate[p]
    print(f"  작은 판 {len(small)}개를 뺐다 — 남은 판 {len(by_plate)}개")

    seeds, order = {}, []
    for pid, rs in by_plate.items():
        flat = [q for r in rs for q in r]
        step = max(1, len(flat) // 5)
        pick = [tuple(flat[i]) for i in range(0, len(flat), step)][:5]
        if len(pick) >= 3:
            seeds[pid] = pick
            order.append(pid)
    order.sort()
    flatpts = [q for pid in order for q in seeds[pid]]
    print(f"  기준점 {len(flatpts)}개 / 판 {len(order)}개 — 시대마다 한 번씩만 부른다")

    print("▸ 시대별 회전")
    frames, alive = [], set()
    for t in TIMES:
        got = recon_chunked(flatpts, t, "rp")
        mats, i, drop = {}, 0, 0
        for pid in order:
            n = len(seeds[pid])
            pairs = [(b, a) for b, a in zip(seeds[pid], got[i:i + n])
                     if abs(a[0]) <= SENTINEL and abs(a[1]) <= 90]
            i += n
            if len(pairs) < 3:
                drop += 1
                continue
            R = kabsch([b for b, _ in pairs], [a for _, a in pairs])
            worst = max(math.hypot(*(np.subtract(to_ll(R @ to_vec(*b)), a)))
                        for b, a in pairs)
            if worst > 0.05:
                drop += 1
                continue
            mats[str(pid)] = [round(float(x), 9) for x in R.flatten()]
            alive.add(pid)
        frames.append({"t": t, "m": mats})
        print(f"  {t:4d} Ma  판 {len(mats):3d}  (없어진 판 {drop})")

    lines = [{"p": pid, "c": r} for pid in order if pid in alive
             for r in by_plate[pid]]

    # ── 검증: 우리 행렬로 옮긴 점이 GPlates 원본과 같은가 ──────────────
    print("▸ 검증 (표본 200점을 GPlates 원본과 대조)")
    report = {}
    for t in (66, 100, 200, 400):
        fr = next(f for f in frames if f["t"] == t)
        sample, sample_pid = [], []
        for ln in lines:
            if str(ln["p"]) in fr["m"] and len(sample) < 200:
                sample.append(tuple(ln["c"][len(ln["c"]) // 2]))
                sample_pid.append(ln["p"])
        if not sample:
            continue
        truth = recon_chunked(sample, t, "chk")
        errs = []
        for (lo, la), pid, tr in zip(sample, sample_pid, truth):
            if abs(tr[0]) > SENTINEL:
                continue
            R = np.array(fr["m"][str(pid)]).reshape(3, 3)
            g = to_ll(R @ to_vec(lo, la))
            d = math.hypot(g[0] - tr[0], g[1] - tr[1])
            errs.append(d)
        if errs:
            report[t] = round(max(errs) * 111, 3)
            print(f"  {t:4d} Ma  표본 {len(errs)}점  최대오차 {max(errs)*111:.2f} km")

    OUT.parent.mkdir(parents=True, exist_ok=True)
    OUT.write_text(json.dumps({
        "schemaVersion": "earthus.paleo-earth.v1",
        "purpose": "전지구 고지리. 현재 해안선 한 벌 + 판별 시대 회전 행렬.",
        "model": MODEL,
        "source": "GPlates Web Service, The University of Sydney",
        "sourceUrl": GWS,
        "citation": ("Merdith, A.S. et al. (2021) Extending full-plate tectonic "
                     "models into deep time. Earth-Science Reviews 214, 103477."),
        "license": "CC BY",
        "note": ("행렬은 단위벡터(x,y,z)에 곱하는 행 우선 3×3. 해안선 고리마다 "
                 "붙은 판 번호(p)의 행렬을 적용한다. GPlates 가 하는 계산과 같다."),
        "verified": report,
        "caution": ("판게아 이전은 고지자기가 위도만 구속하고 경도는 구속하지 "
                    "못한다. 540Ma 이전 경도는 사실상 자유변수이고, 판노티아는 "
                    "존재 자체가 논쟁 중이다. 화면에 신뢰도를 함께 적을 것. "
                    "어느 시대에 판이 없으면 그 대륙은 그리지 않는다."),
        "times": TIMES,
        "frames": frames,
        "lines": lines,
    }, ensure_ascii=False, separators=(",", ":")), encoding="utf-8")

    pts = sum(len(l["c"]) for l in lines)
    print()
    print(f"{OUT}  ({OUT.stat().st_size:,} B, 고리 {len(lines)}, 점 {pts:,})")


if __name__ == "__main__":
    main()
