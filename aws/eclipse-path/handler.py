"""일식 개기대(path of totality) 좌표 — NASA 경로표를 받아 정리한다.

왜 필요한가
  식심(greatest eclipse) 지점 하나만 찍어두면 대개 바다 한가운데다.
  실제로 받은 지적: "이건 개기일식을 바다에서 보라는 거야?"
  맞는 말이다. 사람이 알고 싶은 건 "어디로 가면 보이나"이고,
  그 답은 개기대라는 **띠**이지 점 하나가 아니다.

  전에는 "좌표 자료가 없다"고 그리지 않았다. 다시 찾아보니 있었다 —
  NASA GSFC 가 일식마다 경로표를 낸다:
    https://eclipse.gsfc.nasa.gov/SEpath/SEpath2001/<slug>path.html
  120초 간격으로 **북쪽 한계선 · 남쪽 한계선 · 중심선**의 위경도가 들어 있다.
  그걸 그대로 쓰면 띠를 정확히 그릴 수 있다. 지어낼 필요가 없다.

검증 (실측)
  중심선의 중간 지점이 우리가 이미 갖고 있던 식심 좌표와 일치한다.
    SE2026Aug12T  중심선 중간 65.2N 25.2W  ↔  식심 65N 25W
    SE2027Aug02T  중심선 중간 25.6N 33.0E  ↔  식심 26N 33E
    SE2027Feb06A  중심선 중간 31.2S 48.4W  ↔  식심 31S 48W
  서로 다른 두 자료가 같은 값을 가리키므로 파싱이 맞다고 볼 수 있다.

⚠️ 극지 근처에서는 "북쪽/남쪽 한계선"의 의미가 무너진다.
   (실측: 2026-08-12 의 17:06 행은 남쪽 한계선이 북쪽 한계선보다 더 북쪽이다.)
   그래서 앱은 띠 전체를 폴리곤 하나로 만들지 않고 구간마다 사각형으로 그린다.
   전체를 하나로 이으면 극지에서 자기 자신과 꼬인다.

⚠️ 한계선이 없는 행(`-`)이 있다. 그림자가 지구를 스치기만 하는 구간이다.
   그런 행은 띠에서 빼고 중심선만 남긴다. 없는 값을 채우지 않는다.

출력
  s3://<CACHE_BUCKET>/events/eclipse-paths.json
  { generated, source, eclipses: [ { slug, date, type, rows:[[t,nLat,nLon,sLat,sLon,cLat,cLon]...] } ] }
"""

import json
import os
import re
import urllib.request
from datetime import datetime, timezone

import boto3

BUCKET = os.environ["CACHE_BUCKET"]
REGION = os.environ.get("CACHE_REGION") or os.environ.get("AWS_REGION")
DST_KEY = "events/eclipse-paths.json"

BASE = "https://eclipse.gsfc.nasa.gov/SEpath/SEpath2001"
UA = {"User-Agent": "earthus/0.1 (+globe app; NASA GSFC eclipse path)"}
SOURCE = "NASA GSFC (F. Espenak) — Five Millennium Canon of Solar Eclipses"

s3 = boto3.client("s3", region_name=REGION)

# ⚠️ 여기 목록은 앱의 sky.js SOLAR_ECLIPSES 와 맞춰야 한다.
#    slug 가 없는 부분식(P)은 개기대 자체가 없으므로 넣지 않는다.
ECLIPSES = [
    ("SE2026Feb17A", "2026-02-17", "A"),
    ("SE2026Aug12T", "2026-08-12", "T"),
    ("SE2027Feb06A", "2027-02-06", "A"),
    ("SE2027Aug02T", "2027-08-02", "T"),
    ("SE2028Jan26A", "2028-01-26", "A"),
    ("SE2028Jul22T", "2028-07-22", "T"),
    ("SE2030Jun01A", "2030-06-01", "A"),
]

# "DD MM.M[NS]  DDD MM.M[EW]" 한 쌍
PT = r"(\d{1,3})\s+(\d{1,2}\.\d)([NS])\s+(\d{1,3})\s+(\d{1,2}\.\d)([EW])"
# 뒤쪽 숫자들: 달/해 지름비, 태양 고도, 방위, **띠 폭(km)**, 지속시간
TAIL = r"\s+([\d.]+)\s+(-?\d+)\s+(-?\d+|-)\s+(\d+)\s+(\d+m[\d.]+s)"
ROW = re.compile(r"^\s*(\d{2}):(\d{2})\s+" + PT + r"\s+" + PT + r"\s+" + PT + TAIL + r"?")
# 한계선이 없는 행 — 시각과 중심선만 있다
ROW_C_ONLY = re.compile(r"^\s*(\d{2}):(\d{2})\s+-+\s+-+\s+" + PT)


def dm(d, m, hemi):
    """도 + 십진분 → 십진도. ⚠️ NASA 표는 도-분이지 십진도가 아니다."""
    v = int(d) + float(m) / 60.0
    return round(-v if hemi in ("S", "W") else v, 4)


def fetch(slug):
    url = f"{BASE}/{slug}path.html"
    req = urllib.request.Request(url, headers=UA)
    with urllib.request.urlopen(req, timeout=40) as r:
        html = r.read().decode("utf-8", "replace")
    return re.sub(r"<[^>]*>", "", html)


def parse(text):
    """[[hh:mm, nLat,nLon, sLat,sLon, cLat,cLon], ...]  한계선이 없으면 None 을 넣는다."""
    rows = []
    for line in text.split("\n"):
        m = ROW.match(line)
        if m:
            g = m.groups()
            # ⚠️ 폭(km)을 같이 남긴다. 앱이 이걸로 극지의 퇴화 구간을 걸러낸다:
            #    극 근처에서는 "북/남 한계선"의 구분이 무너져 좌표가 뒤집힌다
            #    (실측: 2026-08-12 의 17:06 행). 그대로 그리면 극에서 부채꼴이 생긴다.
            width = int(g[23]) if len(g) > 23 and g[23] else None   # ⚠️ g[21] 은 태양 고도다. 한 번 틀렸다.
            rows.append([
                f"{g[0]}:{g[1]}",
                dm(g[2], g[3], g[4]), dm(g[5], g[6], g[7]),        # 북쪽 한계
                dm(g[8], g[9], g[10]), dm(g[11], g[12], g[13]),    # 남쪽 한계
                dm(g[14], g[15], g[16]), dm(g[17], g[18], g[19]),  # 중심선
                width,                                             # 띠 폭 km (없으면 None)
            ])
            continue
        m = ROW_C_ONLY.match(line)
        if m:
            g = m.groups()
            rows.append([
                f"{g[0]}:{g[1]}", None, None, None, None,
                dm(g[2], g[3], g[4]), dm(g[5], g[6], g[7]), None,
            ])
    return rows


def sanity(slug, rows):
    """파싱이 맞는지 스스로 검사한다. 틀린 좌표를 지도에 그리면 안 된다."""
    problems = []
    if len(rows) < 8:
        problems.append(f"행이 너무 적다({len(rows)})")
    for r in rows:
        for v in (r[1], r[3], r[5]):
            if v is not None and not (-90 <= v <= 90):
                problems.append(f"위도 범위 벗어남 {v}")
        for v in (r[2], r[4], r[6]):
            if v is not None and not (-180 <= v <= 180):
                problems.append(f"경도 범위 벗어남 {v}")
    # 중심선이 갑자기 튀면 파싱이 어긋난 것이다 (극지 제외)
    prev = None
    for r in rows:
        cur = (r[5], r[6])
        if prev and abs(cur[0]) < 60 and abs(prev[0]) < 60:
            if abs(cur[0] - prev[0]) > 25:
                problems.append(f"중심선 위도 급변 {prev[0]}→{cur[0]}")
        prev = cur
    return problems[:5]


def handler(event, context):
    out, failed = [], []
    for slug, date, kind in ECLIPSES:
        try:
            rows = parse(fetch(slug))
            bad = sanity(slug, rows)
            if bad:
                # ⚠️ 이상하면 넣지 않는다. 틀린 띠를 그리느니 안 그리는 게 낫다.
                failed.append({"slug": slug, "why": "; ".join(bad)})
                print(f"[skip] {slug} {bad}")
                continue
            full = sum(1 for r in rows if r[1] is not None)
            out.append({
                "slug": slug, "date": date, "type": kind,
                "rows": rows,
                "counts": {"total": len(rows), "withLimits": full},
            })
            print(f"[ok] {slug} {len(rows)}행 (한계선 있는 행 {full})")
        except Exception as e:                                   # noqa: BLE001
            failed.append({"slug": slug, "why": repr(e)[:160]})
            print(f"[fail] {slug} {e!r}")

    if not out:
        raise RuntimeError(f"하나도 못 받았다: {failed}")

    body = json.dumps({
        "generated": datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:00Z"),
        "source": SOURCE,
        "note": {
            "ko": "개기대(금환대) 좌표는 NASA GSFC 경로표를 그대로 옮긴 것입니다. "
                  "표시된 띠 안에서만 개기식(금환식)을 볼 수 있습니다.",
            "en": "Path coordinates are taken directly from NASA GSFC path tables. "
                  "Totality (or annularity) is visible only inside the band shown.",
        },
        "failed": failed,
        "eclipses": out,
    }, ensure_ascii=False, separators=(",", ":")).encode()

    s3.put_object(Bucket=BUCKET, Key=DST_KEY, Body=body,
                  ContentType="application/json; charset=utf-8",
                  # ⚠️ 경로 좌표 자체는 안 변하지만, 우리가 담는 항목(폭 등)은 바뀐다.
                  #    max-age=86400 을 걸었더니 브라우저가 하루 내내 옛 파일을 써서
                  #    새로 추가한 필드가 안 보였다. 짧게 두고 앱이 재검증하게 한다.
                  CacheControl="public, max-age=3600")
    print(f"[out] {len(out)}개 일식, {len(body)/1024:.0f}KB")
    return {"ok": True, "eclipses": len(out), "failed": len(failed), "bytes": len(body)}
