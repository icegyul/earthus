#!/usr/bin/env python3
"""한반도 판(601)의 시대별 회전 행렬 → EARTHUS v3 과거 축

왜 행렬인가: 시대별 해안선을 통째로 구우면 프레임당 gzip 350KB 라 26장이면 9MB 다.
그런데 한 판 위의 점들은 **강체로 함께 움직인다**. 회전 하나만 있으면 한반도 위의
어떤 점이든 브라우저에서 즉시 옮길 수 있다 — 해안선이든 화석지든.

  실측(2026-09-03): 기준점 6개로 역산한 회전으로 다른 점을 옮겨 보니
  GPlates 원본과 **오차 0.0 km**. 강체 가정이 맞다는 뜻이다.

데이터 크기: 시대당 숫자 9개. 26시대 전부 합쳐도 몇 킬로바이트다.

⚠️ 함정: reconstruct_points 는 그 시점에 판이 없는 자리(바다 등)에 **999.99** 를
   돌려준다. 이걸 그대로 넣으면 회전 계산이 통째로 망가진다. 반드시 걸러낼 것.
   기준점은 육지 안쪽으로만 잡는다.

출처: GPlates Web Service (gws.gplates.org), The University of Sydney.
      회전 모델 MERDITH2021 —
      Merdith, A.S. et al. (2021) "Extending full-plate tectonic models into deep
      time: Linking the Neoproterozoic and the Phanerozoic", Earth-Science Reviews
      214, 103477.  데이터 CC BY.

사용: python tools/build-korea-paleo.py
"""

import json
import math
import urllib.request
import urllib.error
from pathlib import Path

import numpy as np

MODEL = "MERDITH2021"
OUT = Path(__file__).resolve().parent.parent / "prototype" / "data" / "korea-paleo.json"

# 한반도 육지 안쪽 기준점. 바다에 찍으면 999.99 가 돌아온다.
REF = [
    (127.00, 37.50),   # 서울 부근
    (128.60, 35.90),   # 대구 부근
    (126.90, 35.20),   # 광주 부근
    (127.40, 36.30),   # 대전 부근
    (128.90, 37.80),   # 강원 내륙
    (126.70, 34.80),   # 전남 서남부
]

# 백악기(한국 화석의 시대)를 촘촘히, 그 앞뒤는 성기게.
TIMES = [0, 5, 10, 20, 30, 40, 50, 66, 75, 85, 95, 100, 110, 120, 130, 140,
         145, 160, 180, 200, 220, 250]

SENTINEL = 999.99


def to_vec(lon, lat):
    lo, la = math.radians(lon), math.radians(lat)
    return np.array([math.cos(la) * math.cos(lo),
                     math.cos(la) * math.sin(lo),
                     math.sin(la)])


def reconstruct(points, time):
    s = ",".join(f"{lo},{la}" for lo, la in points)
    url = (f"https://gws.gplates.org/reconstruct/reconstruct_points/"
           f"?points={s}&time={time}&model={MODEL}")
    with urllib.request.urlopen(url, timeout=90) as r:
        return json.load(r)["coordinates"]


def rotation_for(time):
    """기준점 before/after 로 강체 회전을 역산한다 (카브슈 정렬)."""
    after = reconstruct(REF, time)
    pairs = [(b, a) for b, a in zip(REF, after)
             if abs(a[0]) <= 180 and abs(a[1]) <= 90]      # 999.99 제거
    if len(pairs) < 3:
        raise RuntimeError(f"{time} Ma: 유효 기준점이 {len(pairs)}개뿐 — 회전을 못 구한다")

    A = np.array([to_vec(*b) for b, _ in pairs])
    B = np.array([to_vec(*a) for _, a in pairs])
    U, _, Vt = np.linalg.svd(A.T @ B)
    d = np.sign(np.linalg.det(Vt.T @ U.T))
    R = Vt.T @ np.diag([1.0, 1.0, d]) @ U.T

    # 되짚어 확인 — 기준점이 제자리로 가지 않으면 쓰지 않는다
    worst = 0.0
    for (b, a) in pairs:
        q = R @ to_vec(*b)
        lon = math.degrees(math.atan2(q[1], q[0]))
        lat = math.degrees(math.asin(max(-1.0, min(1.0, q[2]))))
        worst = max(worst, math.hypot(lon - a[0], lat - a[1]))
    if worst > 0.01:
        raise RuntimeError(f"{time} Ma: 회전 재현 오차 {worst:.4f}° — 강체 가정이 깨졌다")

    return R, len(pairs), worst


def main():
    frames = []
    for t in TIMES:
        R, n, err = rotation_for(t)
        frames.append({
            "t": t,
            "m": [round(float(x), 9) for x in R.flatten()],   # 행 우선 3×3
        })
        print(f"  {t:4d} Ma  기준점 {n}/{len(REF)}  재현오차 {err*111:.3f} km")

    OUT.parent.mkdir(parents=True, exist_ok=True)
    OUT.write_text(json.dumps({
        "schemaVersion": "earthus.korea-paleo.v1",
        "purpose": "한반도 판(601)을 시대별로 옮기는 회전 행렬. 화석지·해안선 공용.",
        "model": MODEL,
        "plateId": 601,
        "source": "GPlates Web Service, The University of Sydney",
        "sourceUrl": "https://gws.gplates.org/",
        "citation": ("Merdith, A.S. et al. (2021) Extending full-plate tectonic "
                     "models into deep time. Earth-Science Reviews 214, 103477."),
        "license": "CC BY",
        "note": ("행렬은 단위벡터(x,y,z)에 곱하는 행 우선 3×3. 강체 회전이라 판 위의 "
                 "모든 점에 같은 행렬이 적용된다. 시대 사이는 보간해도 되지만, "
                 "보간값은 모델의 값이 아니라 우리가 만든 중간값임을 화면에 밝힐 것."),
        "verified": "2026-09-03 · 기준점 역산 재현오차 0.0 km",
        "frames": frames,
    }, ensure_ascii=False, separators=(",", ":")), encoding="utf-8")

    print(f"\n{OUT}  ({OUT.stat().st_size} B, {len(frames)}개 시대)")


if __name__ == "__main__":
    main()
