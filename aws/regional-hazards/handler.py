"""지역 공식기관 재해 자료 — 남미·오세아니아·동남아·아프리카·중동

왜 필요한가
  우리 전지구 재해 자료는 USGS(지진)·GDACS(태풍)·GDELT(뉴스)로 덮여 있다.
  그런데 이들은 **큰 것만** 본다. USGS 는 해외에서 대개 규모 4.5 이상만 싣는다.
  각 나라 기관은 자기 땅의 작은 지진까지 본다 — 그 지역 사람에게는 그게 중요하다.

⚠️ **USGS 와 겹친다.** 규모가 큰 지진은 양쪽에 다 나온다.
   같은 지진을 두 번 찍으면 "두 번 났다"로 읽힌다.
   그래서 이 자료는 **별도 파일·별도 레이어**로 둔다. 전지구 지진 레이어에 섞지 않는다.
   화면에서 켜면 "그 나라 기관이 본 것"이라고 분명히 적는다.

⚠️ 출처마다 **좌표 표기가 다르다.** 그대로 두면 지도가 엉킨다.
     BMKG   : "6.79 LS", "105.51 BT" — 인도네시아어 방위. LS=남위, BT=동경
     GeoNet : GeoJSON 표준 (경도, 위도)
     INMET  : 폴리곤이 **"위도,경도" 순서** — GeoJSON 과 반대다
   전부 **십진 위경도**로 맞춰서 담는다.

⚠️ **좌표가 없는 자료는 지도에 올리지 않는다.** 지어내지 않는다.
   화산 주간보고(Smithsonian)와, 한때 후보였던 칠레 공개 API 가 그렇다 —
   칠레 쪽은 Fecha·Profundidad·Magnitud·RefGeografica 뿐이라 위경도가 아예 없어서
   EMSC 로 갈아탔다.

출력
  s3://<CACHE_BUCKET>/events/regional.json
"""

import json
import os
import re
import time
import urllib.request
import xml.etree.ElementTree as ET
from concurrent.futures import ThreadPoolExecutor
from datetime import datetime, timedelta, timezone

import boto3

BUCKET = os.environ["CACHE_BUCKET"]
REGION = os.environ.get("CACHE_REGION") or os.environ.get("AWS_REGION")
DST = "events/regional.json"
UA = {"User-Agent": "earthus/0.1 (+globe app; contact dalur@kakao.com)"}

s3 = boto3.client("s3", region_name=REGION)


def get(url, timeout=25):
    return urllib.request.urlopen(urllib.request.Request(url, headers=UA), timeout=timeout).read()


def jget(url, tries=3):
    """⚠️ 큰 응답은 중간에 끊긴다. 실측: INMET(374KB)가 두 번에 한 번꼴로
       IncompleteRead / JSONDecodeError 로 실패했다.
       한 번 실패했다고 그 지역을 통째로 버릴 이유가 없으니 몇 번 다시 받는다."""
    last = None
    for i in range(tries):
        try:
            return json.loads(get(url, timeout=40))
        except Exception as e:                            # noqa: BLE001
            last = e
            if i < tries - 1:
                time.sleep(1.5 * (i + 1))
    raise last


# ── 인도네시아 (BMKG) ────────────────────────────────────────
def bmkg():
    """⚠️ 좌표가 인도네시아어 방위로 온다: LS=Lintang Selatan(남위), BT=Bujur Timur(동경).
       숫자만 뽑고 방위로 부호를 정해야 한다 — 그냥 float() 하면 터진다."""
    def coord(txt, neg_marks):
        m = re.search(r"[-\d.]+", str(txt or ""))
        if not m:
            return None
        v = float(m.group())
        return -abs(v) if any(k in str(txt) for k in neg_marks) else abs(v)

    out = []
    j = jget("https://data.bmkg.go.id/DataMKG/TEWS/gempaterkini.json")
    for g in (j.get("Infogempa") or {}).get("gempa") or []:
        lat = coord(g.get("Lintang"), ("LS", "S"))
        lon = coord(g.get("Bujur"), ("BB", "W"))
        if lat is None or lon is None:
            continue
        try:
            mag = float(g.get("Magnitude"))
        except (TypeError, ValueError):
            continue
        out.append({
            "kind": "quake", "mag": mag, "lat": round(lat, 4), "lon": round(lon, 4),
            "place": g.get("Wilayah"), "depth": g.get("Kedalaman"),
            "timeLocal": f"{g.get('Tanggal','')} {g.get('Jam','')}".strip(),
            "utc": g.get("DateTime"),
            "_src": "BMKG (인도네시아 기상기후지질청)", "_lic": "BMKG 공개자료",
        })
    return out


# ── 뉴질랜드 (GeoNet) ────────────────────────────────────────
def geonet_quakes():
    j = jget("https://api.geonet.org.nz/quake?MMI=3")
    out = []
    for f in j.get("features", []):
        p, c = f.get("properties") or {}, (f.get("geometry") or {}).get("coordinates") or []
        if len(c) < 2 or p.get("magnitude") is None:
            continue
        out.append({
            "kind": "quake", "mag": round(float(p["magnitude"]), 1),
            "lon": round(float(c[0]), 4), "lat": round(float(c[1]), 4),
            "place": p.get("locality"), "depth": p.get("depth"),
            "utc": p.get("time"), "quality": p.get("quality"),
            "_src": "GeoNet (뉴질랜드)", "_lic": "CC BY 3.0 NZ — GNS Science / EQC",
        })
    return out


def geonet_volcano():
    """화산경보 단계. ⚠️ 0단계(평온)도 온다 — 그것까지 지도에 찍으면 늘 경보 중인 것처럼 보인다."""
    j = jget("https://api.geonet.org.nz/volcano/val")
    out = []
    for f in j.get("features", []):
        p, c = f.get("properties") or {}, (f.get("geometry") or {}).get("coordinates") or []
        lvl = p.get("level")
        if len(c) < 2 or lvl is None or int(lvl) < 1:
            continue
        out.append({
            "kind": "volcano", "level": int(lvl),
            "lon": round(float(c[0]), 4), "lat": round(float(c[1]), 4),
            "place": p.get("volcanoTitle") or p.get("volcanoID"),
            "note": p.get("activity"), "utc": None,
            "_src": "GeoNet (뉴질랜드)", "_lic": "CC BY 3.0 NZ — GNS Science",
        })
    return out


# ── 남미·아프리카·중동·동남아 지진 (EMSC) ──────────────────
# 왜 나라별이 아니라 EMSC 인가
#   나라별 API 를 하나씩 붙여봤는데 대부분 못 쓴다 (실측 2026-07-27):
#     칠레 CSN 403 · 페루 IGP 웹페이지 · 콜롬비아 404 · 아르헨티나 404
#   그리고 칠레의 공개 API(gael.cloud)는 **좌표 필드가 아예 없다**
#   (Fecha·Profundidad·Magnitud·RefGeografica 뿐) — 지도에 못 올린다.
#   EMSC 는 각국 관측망을 모아 좌표와 함께 주고, 범위(bbox)로 지역을 자를 수 있다.
#   USGS 보다 작은 지진까지 싣는다.
EMSC = "https://www.seismicportal.eu/fdsnws/event/1/query"
BOXES = [
    ("남미",     -56, 13, -82, -34),
    ("아프리카", -35, 37, -18,  52),
    ("중동",      12, 42,  25,  63),
    ("동남아",   -11, 29,  92, 141),
]


def emsc():
    """지역별로 최근 지진을 받는다.
    ⚠️ 한 지역이 실패해도 나머지는 살린다 — 한 번에 다 받으면 하나 죽을 때 전부 잃는다.
    ⚠️ 인도네시아는 BMKG 가 더 자세하므로 겹칠 수 있다. 화면에서 출처를 적어 구분한다."""
    out = []
    for name, s_, n_, w_, e_ in BOXES:
        try:
            j = jget(f"{EMSC}?format=json&limit=40&minlat={s_}&maxlat={n_}"
                     f"&minlon={w_}&maxlon={e_}&minmag=3.5")
        except Exception as ex:                           # noqa: BLE001
            print(f"[regional] EMSC {name} 실패 — {repr(ex)[:70]}")
            continue
        for f in j.get("features", []):
            p, c = f.get("properties") or {}, (f.get("geometry") or {}).get("coordinates") or []
            if len(c) < 2 or p.get("mag") is None:
                continue
            out.append({
                "kind": "quake", "mag": round(float(p["mag"]), 1),
                "lon": round(float(c[0]), 4), "lat": round(float(c[1]), 4),
                "depth": (round(float(c[2]), 1) if len(c) > 2 and c[2] is not None else None),
                "place": p.get("flynn_region"), "utc": p.get("time"),
                "box": name,
                "_src": "EMSC (유럽지중해지진센터)",
                "_lic": "EMSC — 출처표시",
            })
    return out


# ── 브라질 기상경보 (INMET) ──────────────────────────────────
def inmet():
    """⚠️ 응답이 374KB 다. 필요한 것만 뽑는다.
       ⚠️ 경보 구역이 폴리곤이라 점 하나로 줄이면 위치가 뭉개진다 —
          중심점을 쓰되 '구역 경보'임을 화면에 적어야 한다."""
    j = jget("https://apiprevmet3.inmet.gov.br/avisos/ativos")
    out = []
    for a in (j.get("hoje") or [])[:60]:
        poly = a.get("poligono") or ""
        pts = re.findall(r"(-?\d+\.\d+),(-?\d+\.\d+)", poly)
        if not pts:
            continue
        # ⚠️ INMET 폴리곤은 "위도,경도" 순서다 (경도,위도가 아니다).
        lats = [float(p[0]) for p in pts]
        lons = [float(p[1]) for p in pts]
        out.append({
            "kind": "warning",
            "lat": round(sum(lats) / len(lats), 4), "lon": round(sum(lons) / len(lons), 4),
            "place": a.get("descricao") or a.get("estados"),
            "severity": a.get("severidade"), "note": a.get("aviso_cor"),
            "start": a.get("data_inicio"), "end": a.get("data_fim"),
            "area": True,
            "_src": "INMET (브라질 기상청)", "_lic": "브라질 공개자료",
        })
    return out


# ── 전세계 화산 주간보고 (Smithsonian) ───────────────────────
def volcano_weekly():
    """⚠️ RSS 에 좌표가 없다. 제목이 '화산이름 (나라)' 형식이라 이름만 담고,
       지도에는 못 올린다고 적는다. 지어낸 좌표를 넣지 않는다."""
    root = ET.fromstring(get("https://volcano.si.edu/news/WeeklyVolcanoRSS.xml"))
    out = []
    for it in root.iter("item"):
        title = (it.findtext("title") or "").strip()
        if not title:
            continue
        out.append({
            "kind": "volcanoReport", "place": title,
            "link": (it.findtext("link") or "").strip(),
            "utc": (it.findtext("pubDate") or "").strip(),
            "noCoords": True,
            "_src": "Smithsonian Global Volcanism Program",
            "_lic": "출처표시 — smithsonian/USGS Weekly Report",
        })
    return out[:25]


SOURCES = [
    ("동남아", "인도네시아 지진", bmkg),
    ("오세아니아", "뉴질랜드 지진", geonet_quakes),
    ("오세아니아", "뉴질랜드 화산", geonet_volcano),
    ("여러지역", "EMSC 지진", emsc),
    ("남미", "브라질 기상경보", inmet),
    ("전세계", "화산 주간보고", volcano_weekly),
]


def handler(event, context):
    got, failed = {}, {}

    def run(t):
        region, name, fn = t
        try:
            return region, name, fn(), None
        except Exception as e:                            # noqa: BLE001
            return region, name, [], repr(e)[:120]

    items = []
    with ThreadPoolExecutor(max_workers=6) as ex:
        for region, name, rows, err in ex.map(run, SOURCES):
            if err:
                # ⚠️ 한 곳이 죽어도 나머지는 올린다. 그리고 **어디가 죽었는지 파일에 적는다** —
                #    조용히 빠지면 "그 지역은 원래 조용한가 보다"로 읽힌다.
                failed[name] = err
                print(f"[regional] {name} 실패 — {err}")
                continue
            got[name] = len(rows)
            for r in rows:
                r["region"] = region
                items.append(r)

    if not items:
        raise RuntimeError("한 곳도 못 받았다 — 덮어쓰지 않는다")

    doc = {
        "generated": datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:00Z"),
        "source": "각국 공식 기관 (BMKG · GeoNet · CSN 칠레 · INMET · Smithsonian GVP)",
        "sourceEn": "National agencies: BMKG, GeoNet NZ, CSN Chile, INMET Brazil, Smithsonian GVP",
        "note": {
            "ko": "각 나라 공식 기관이 직접 낸 자료입니다. 전지구 자료(USGS·GDACS)보다 "
                  "작은 사건까지 담습니다. "
                  "⚠️ 규모가 큰 지진은 USGS 에도 나오므로 **같은 사건이 양쪽에 있을 수 있습니다** — "
                  "그래서 전지구 지진 레이어와 섞지 않고 따로 둡니다. "
                  "⚠️ 화산 주간보고는 좌표가 없어 지도에 올리지 않습니다.",
            "en": "Direct feeds from national agencies, including smaller events than global "
                  "sources carry. ⚠️ Larger quakes also appear in USGS, so these are kept as a "
                  "separate layer rather than merged. ⚠️ Volcano weekly reports have no coordinates.",
        },
        "counts": got,
        # ⚠️ 실패를 숨기지 않는다. 이게 늘면 상류가 바뀐 것이다.
        "failed": failed,
        "count": len(items),
        "items": items,
    }
    body = json.dumps(doc, ensure_ascii=False, separators=(",", ":")).encode()
    s3.put_object(Bucket=BUCKET, Key=DST, Body=body,
                  ContentType="application/json; charset=utf-8",
                  CacheControl="public, max-age=600")
    print(f"[regional] {got} · 실패 {list(failed)} · {len(body)/1024:.0f}KB")
    return {"ok": True, "counts": got, "failed": failed, "total": len(items)}
