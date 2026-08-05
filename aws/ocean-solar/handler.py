"""해양 관측(NDBC) + 태양 영상(NASA SDO) 프록시

왜 프록시가 필요한가 (실측)
  NDBC  — CORS 헤더 없음. 브라우저가 직접 못 부른다.
  SDO   — CORS 헤더 없음. 게다가 이미지라 캔버스로 읽으려면 same-origin 이어야 한다.
  NWS 쓰나미 경보는 CORS 가 열려 있어 앱이 직접 부른다 (여기서 안 다룬다).

결과
  s3://<CACHE_BUCKET>/ocean/buoys.json    부이 관측 (파고·수온·기압·풍속)
  s3://<CACHE_BUCKET>/solar/latest.jpg    태양 최신 영상
  s3://<CACHE_BUCKET>/solar/meta.json     태양 상태 요약
"""

import csv
import io
import json
import os
import re
import urllib.parse
import urllib.request
from concurrent.futures import ThreadPoolExecutor, as_completed
from datetime import datetime, timedelta, timezone

import boto3

DST_BUCKET = os.environ["CACHE_BUCKET"]
DST_REGION = os.environ.get("CACHE_REGION") or os.environ.get("AWS_REGION")
dst = boto3.client("s3", region_name=DST_REGION)

NDBC = "https://www.ndbc.noaa.gov/data/latest_obs/latest_obs.txt"
# 관측소 제원표 — 부이 종류·탑재장비·운용기관·이름이 한 파일에 다 있다 (363KB).
# ⚠️ 관측소 페이지를 869개 긁는 방식은 쓰지 않는다. 한 파일로 끝난다.
STATIONS = "https://www.ndbc.noaa.gov/data/stations/station_table.txt"
STATION_PAGE = "https://www.ndbc.noaa.gov/station_page.php?station="

# ⚠️ 전지구 부이 — NDBC 만 쓰면 미국 편중이 심하다.
#    실측: NDBC latest_obs 871개 중 814개(93%)가 북미. 일본·중국은 0개.
#    NOAA OSMC 는 WMO GTS 로 들어오는 전 세계 자료를 모아 공개한다.
#    실측(최근 8시간, 부이만): 고유 관측소 1,868개
#      기타 대양·극지 669 / 북미 614 / 유럽 144 / 아프리카 138 /
#      동남아·호주 111 / 남미 100 / 동아시아 92
#    나라별로는 EU 133, 영국 76, 호주 45, 캐나다 43, 한국 31, 일본·인도·독일…
#    ⚠️ 중국은 GTS 공개 채널로 부이 자료를 거의 내보내지 않는다 (실측 0건).
#       관측을 안 하는 것이 아니라 공개하지 않는 것이다 — 우리가 풀 수 없다.
OSMC = ("https://osmc.noaa.gov/erddap/tabledap/OSMC_30day.csv"
        "?platform_code,platform_type,country,latitude,longitude,time,"
        "sst,atmp,slp,windspd,winddir,wvht")
OSMC_HOURS = 12          # 이 시간 안의 관측만 (오래된 값을 '지금'으로 보여주지 않는다)
SDO = "https://sdo.gsfc.nasa.gov/assets/img/latest/latest_1024_0193.jpg"
XRAY = "https://services.swpc.noaa.gov/json/goes/primary/xrays-6-hour.json"

UA = {"User-Agent": "earthus/0.1 (+globe app; contact via app)"}


def get(url, timeout=60):
    return urllib.request.urlopen(urllib.request.Request(url, headers=UA), timeout=timeout).read()


def num(v):
    """NDBC 는 결측을 'MM' 으로 쓴다. 숫자가 아니면 None."""
    try:
        f = float(v)
        return None if f == 999.0 or f == 99.0 else f
    except (TypeError, ValueError):
        return None


# 운용 기관 코드 → 사람이 읽는 말 (NDBC 표기 기준)
OWNER = {
    "N": ("미국 국립해양부이센터 (NDBC)", "NOAA National Data Buoy Center"),
    "C": ("미국 해안경비대", "US Coast Guard"),
    "NC": ("미국 국립기상청", "US National Weather Service"),
    "SC": ("스크립스 해양연구소", "Scripps Institution of Oceanography"),
    "PR": ("PMEL 열대해양 관측망", "NOAA PMEL Tropical Moored Array"),
    "IC": ("국제 협력 관측망", "International partner"),
    "CN": ("캐나다 환경부", "Environment Canada"),
    "MC": ("멕시코 기상청", "Mexico Met Service"),
    "UK": ("영국 기상청", "UK Met Office"),
}


def stations():
    """관측소 제원. {id: {type, hull, payload, owner, name}}

    ⚠️ 파이프(|)로 구분된 고정 형식이다:
       STATION_ID | OWNER | TTYPE | HULL | NAME | PAYLOAD | LOCATION | TZ | FORECAST | NOTE
    ⚠️ 실패해도 관측 자체는 내보낸다. 제원은 있으면 좋은 것이고 없으면 없는 것이다 —
       이것 때문에 부이 레이어 전체가 죽으면 안 된다.
    """
    out = {}
    try:
        txt = get(STATIONS, timeout=40).decode("utf-8", "replace")
    except Exception as e:                                   # noqa: BLE001
        print("[stations] 실패", repr(e))
        return out
    for line in txt.splitlines():
        if not line or line.startswith("#"):
            continue
        c = line.split("|")
        if len(c) < 6:
            continue
        sid = c[0].strip()
        if not sid:
            continue
        rec = {}
        if c[2].strip():
            rec["type"] = c[2].strip()          # 3-meter foam buoy
        if c[3].strip():
            rec["hull"] = c[3].strip()          # 3DV31
        if c[4].strip():
            # HTML 엔티티(&#176; 등)가 섞여 있다 — 이름에는 보통 없지만 대비한다
            rec["name"] = c[4].strip().replace("&#176;", "\u00b0")
        if c[5].strip():
            rec["payload"] = c[5].strip()       # SCOOP payload
        o = c[1].strip()
        if o:
            rec["ownerCode"] = o
            if o in OWNER:
                rec["ownerKo"], rec["ownerEn"] = OWNER[o]
        if rec:
            out[sid] = rec
            # ⚠️⚠️ 제원표는 소문자 id 를 쓰고(abya2, 32st0) OSMC 는 대문자(ABYA2)를 쓴다.
            #    그대로 맞추면 대부분 안 맞는다 — 실측: 1,505개 중 17개만 일치했다.
            #    양쪽 표기를 모두 색인해 둔다.
            up = sid.upper()
            if up != sid:
                out[up] = rec
    print(f"[stations] {len(out)}개 제원 (대소문자 양쪽 색인)")
    return out


def hull_photos(types):
    """부이 **종류별** 사진 주소. {ttype: '/images/stations/....jpg'}

    ⚠️ 869개 관측소 페이지를 긁지 않는다. 사진은 종류마다 같으므로
       종류별로 대표 관측소 한 곳만 본다 (실측: 종류가 같으면 사진도 같다).
         3-meter foam buoy              → 3mfoam_scoop_mini.jpg
         3-meter foam buoy w/ seal cage → 3mfoam_scoop_seal_cage_mini.jpg
         2.1-meter ionomer foam buoy    → 2_1m_ionomer_foam_mini.jpg
    ⚠️ 실패한 종류는 그냥 없는 채로 둔다. 다른 종류 사진을 대신 쓰면
       그 부이가 그렇게 생긴 것처럼 읽힌다.
    """
    out = {}
    for ttype, sid in list(types.items())[:40]:      # 종류가 늘어도 요청 수를 묶어둔다
        try:
            html = get(f"{STATION_PAGE}{sid}", timeout=25).decode("utf-8", "replace")
            m = re.search(r'class="station-photo"[^>]*?src="(/images/stations/[^"]+)"', html)
            if not m:
                m = re.search(r'src="(/images/stations/[^"]+)"[^>]*class="station-photo"', html)
            if m:
                out[ttype] = m.group(1)
        except Exception as e:                                   # noqa: BLE001
            print(f"[hull] {ttype} 실패 {e!r}")
    print(f"[hull] 종류 사진 {len(out)}/{len(types)}종")
    return out


CHART_MIN_BYTES = 30_000     # 이보다 작으면 빈 차트다 (실측: 빈 21KB / 자료 40~55KB)


def chart_probe(sid, meas):
    """NDBC 차트가 실제 자료를 담고 있나. HEAD 로 크기만 본다."""
    url = f"https://www.ndbc.noaa.gov/plot?station={urllib.parse.quote(sid)}&meas={meas}&uom=M&tz=UTC"
    req = urllib.request.Request(url, headers=UA, method="HEAD")
    try:
        with urllib.request.urlopen(req, timeout=12) as r:
            n = int(r.headers.get("Content-Length") or 0)
        return n >= CHART_MIN_BYTES
    except Exception:                                        # noqa: BLE001
        return False


MEAS = ("wtmp", "atmp", "wvht", "wspd", "pres")
CHART_STATE = "ocean/chart-index.json"
CHART_TTL_DAYS = 7        # 이 기간이 지나면 다시 확인한다 (관측소가 늘거나 준다)


def load_chart_index():
    """이전에 확인한 결과. {station: {"charts": [...], "at": "YYYY-MM-DD"}}

    ⚠️ 왜 캐시하나
       항목별 확인은 관측소당 최대 5회 HEAD 다. 2,393개면 약 9,000회 —
       매시간 다 던졌더니 Lambda 가 600초를 넘겨 죽었다(Sandbox.Timedout).
       그런데 "이 관측소에 차트가 있나"는 시간마다 바뀌는 값이 아니다.
       한 번 확인해 두고 일주일에 한 번만 다시 본다.
    """
    try:
        return json.loads(dst.get_object(Bucket=DST_BUCKET, Key=CHART_STATE)["Body"].read())
    except Exception as e:                                   # noqa: BLE001
        # S3 는 없는 객체에 AccessDenied 를 주기도 한다 — 둘 다 "없음"으로 본다
        print("[chart] 색인 없음 (처음)", type(e).__name__)
        return {}


def mark_charts(recs):
    """부이마다 **항목별로** 차트가 있는지 확인해 목록으로 붙인다.

    ⚠️ 예전에는 대표 항목 하나만 확인하고 "차트 있음/없음"으로 갈랐다.
       그러면 두 가지를 놓친다:
         · 대표 항목만 없고 다른 항목은 있는 관측소가 전부 빠진다
         · 반대로 대표 항목만 있는 곳에서 나머지 항목이 빈 차트로 뜬다
       항목마다 확인해서 **있는 것만** 보여주면 둘 다 해결된다.
       요청은 늘지만(관측소당 최대 5회) HEAD 라 가볍고, 병렬로 던지면 된다.
    """
    idx = load_chart_index()
    today = datetime.now(timezone.utc).strftime("%Y-%m-%d")
    fresh_before = (datetime.now(timezone.utc) - timedelta(days=CHART_TTL_DAYS)).strftime("%Y-%m-%d")

    jobs, cached = [], 0
    for r in recs:
        e = idx.get(r["id"])
        if e and e.get("at", "") >= fresh_before:
            if e.get("charts"):
                meta = r.setdefault("meta", {})
                meta["charts"] = e["charts"]
                meta["chart"] = True
            cached += 1
            continue
        for k in MEAS:
            if r.get(k) is not None:
                jobs.append((r, k))

    # ⚠️ 한 번에 던지는 양을 묶는다. 남은 것은 다음 실행에서 확인한다 —
    #    600초 제한을 넘기면 아무것도 저장되지 않는다(전부 손실).
    MAX_JOBS = 2500
    if len(jobs) > MAX_JOBS:
        print(f"[chart] 확인 대상 {len(jobs)}개 중 {MAX_JOBS}개만 이번에 (나머지는 다음 실행)")
        jobs = jobs[:MAX_JOBS]

    ok = 0
    found = {}
    with ThreadPoolExecutor(max_workers=32) as ex:
        futs = {ex.submit(chart_probe, r["id"], m): (r, m) for r, m in jobs}
        for fut in as_completed(futs):
            r, m = futs[fut]
            try:
                if fut.result():
                    meta = r.setdefault("meta", {})
                    meta.setdefault("charts", []).append(m)
                    meta["chart"] = True
                    found.setdefault(r["id"], []).append(m)
                    ok += 1
            except Exception:                                # noqa: BLE001
                pass

    # 이번에 확인한 관측소를 색인에 기록한다 (차트가 없는 것도 기록해야 다시 안 던진다)
    probed = {r["id"] for r, _ in jobs}
    for sid in probed:
        idx[sid] = {"charts": sorted(found.get(sid, [])), "at": today}
    try:
        dst.put_object(Bucket=DST_BUCKET, Key=CHART_STATE,
                       Body=json.dumps(idx, separators=(",", ":")).encode(),
                       ContentType="application/json", CacheControl="no-store")
    except Exception as e:                                   # noqa: BLE001
        print("[chart] 색인 저장 실패", repr(e))

    total = sum(1 for r in recs if (r.get("meta") or {}).get("chart"))
    print(f"[chart] 새로 확인 {len(probed)}곳 / 캐시 {cached}곳 → 차트 있는 관측소 {total}개")


def osmc():
    """전지구 부이 — GTS 경유. {platform_code: rec}

    ⚠️ 같은 관측소가 여러 번 들어온다. **가장 최근 행만** 남긴다.
       오래된 값을 '지금'으로 보여주면 안 된다.
    ⚠️ 실패하면 빈 dict 를 돌려준다. 전지구 자료를 못 받아도 NDBC 는 나가야 한다.
    """
    since = (datetime.now(timezone.utc) - timedelta(hours=OSMC_HOURS)).strftime("%Y-%m-%dT%H:00:00Z")
    url = f"{OSMC}&time%3E={since}&platform_type=~%22.*BUOY.*%22"
    try:
        txt = get(url, timeout=90).decode("utf-8", "replace")
    except Exception as e:                                       # noqa: BLE001
        print("[osmc] 실패", repr(e))
        return {}

    rdr = csv.reader(io.StringIO(txt))
    try:
        head = next(rdr)
        next(rdr)                       # 단위 줄
    except StopIteration:
        return {}
    ix = {c: i for i, c in enumerate(head)}

    def f(row, key):
        try:
            v = row[ix[key]].strip()
        except (KeyError, IndexError):
            return None
        if not v or v.upper() in ("NAN", "NA"):
            return None
        try:
            return float(v)
        except ValueError:
            return None

    best = {}
    for row in rdr:
        if len(row) < len(head):
            continue
        code = row[ix["platform_code"]].strip()
        la, lo = f(row, "latitude"), f(row, "longitude")
        if not code or la is None or lo is None:
            continue
        t = row[ix["time"]].strip()
        prev = best.get(code)
        if prev and prev["_t"] >= t:
            continue
        country = row[ix["country"]].strip()
        best[code] = {
            "_t": t,
            "time": t,
            "id": code,
            "lat": round(la, 3), "lon": round(lo, 3),
            "wvht": f(row, "wvht"),
            "wtmp": f(row, "sst"),
            "atmp": f(row, "atmp"),
            "pres": f(row, "slp"),
            "wspd": f(row, "windspd"),
            "wdir": f(row, "winddir"),
            "meta": {
                "type": row[ix["platform_type"]].strip() or None,
                # ⚠️ 'UNKNOWN' 은 국가가 없다는 뜻이 아니라 표기가 빠진 것이다.
                #    그대로 'UNKNOWN' 이라고 보여주면 오해를 준다 — 비워 둔다.
                "country": None if country.upper() in ("", "UNKNOWN") else country,
                "src": "OSMC",
            },
        }
    # 값이 하나도 없는 것은 지도에 찍어봐야 의미가 없다
    out = {k: v for k, v in best.items()
           if any(v[j] is not None for j in ("wvht", "wtmp", "atmp", "pres", "wspd"))}
    print(f"[osmc] 전지구 부이 {len(out)}개 (원본 {len(best)}개)")
    return out


def buoys():
    """NDBC 최신 관측.

    ⚠️ 고정폭 텍스트다. 공백으로 split 하면 결측('MM')과 섞여 열이 밀린다.
       헤더 줄에서 열 이름 순서를 읽고 공백 분리하되, 열 수가 안 맞으면 버린다.
    """
    meta = stations()
    txt = get(NDBC).decode("utf-8", "replace")
    lines = [l for l in txt.splitlines() if l.strip()]
    head = lines[0].lstrip("#").split()
    ix = {c: i for i, c in enumerate(head)}
    out = []
    for l in lines[2:]:                     # 0=헤더, 1=단위
        c = l.split()
        if len(c) != len(head):
            continue
        lat, lon = num(c[ix["LAT"]]), num(c[ix["LON"]])
        if lat is None or lon is None:
            continue
        rec = {
            "id": c[ix["STN"]],
            "lat": round(lat, 3), "lon": round(lon, 3),
            "wvht": num(c[ix["WVHT"]]) if "WVHT" in ix else None,   # 파고 m
            "dpd":  num(c[ix["DPD"]]) if "DPD" in ix else None,     # 파주기 s
            "wtmp": num(c[ix["WTMP"]]) if "WTMP" in ix else None,   # 수온 °C
            "atmp": num(c[ix["ATMP"]]) if "ATMP" in ix else None,   # 기온 °C
            "pres": num(c[ix["PRES"]]) if "PRES" in ix else None,   # 기압 hPa
            "wspd": num(c[ix["WSPD"]]) if "WSPD" in ix else None,   # 풍속 m/s
            "wdir": num(c[ix["WDIR"]]) if "WDIR" in ix else None,   # 풍향
        }
        # ⚠️ 관측 시각을 전체 파일 생성 시각으로 대신하면 안 된다. 관측소마다 송신
        #    시각이 다르며, 이 값은 뒤에서 같은 시각의 모델값과 대조할 때 쓰인다.
        try:
            # NDBC 파일은 배포 시기에 따라 연도 열을 YY 또는 YYYY 로 쓴다.
            year_key = "YYYY" if "YYYY" in ix else "YY"
            yy = int(c[ix[year_key]])
            year = 2000 + yy if yy < 100 else yy
            rec["time"] = datetime(
                year, int(c[ix["MM"]]), int(c[ix["DD"]]),
                int(c[ix["hh"]]), int(c[ix["mm"]]), tzinfo=timezone.utc,
            ).strftime("%Y-%m-%dT%H:%M:00Z")
        except (KeyError, ValueError, IndexError):
            pass
        # 제원 — 있으면 붙이고 없으면 안 붙인다 (빈 칸을 지어내지 않는다)
        m = meta.get(rec["id"]) or meta.get(rec["id"].lower()) or meta.get(rec["id"].upper())
        if m:
            rec["meta"] = dict(m, src="NDBC")
            # NDBC 부이는 자체 카메라가 있는 경우가 많다 (실측: buoycam.php 가 JPEG 반환)
            rec["meta"]["cam"] = True
        # 아무 값도 없는 부이는 지도에 찍어봐야 의미가 없다
        if any(rec[k] is not None for k in ("wvht", "wtmp", "atmp", "pres", "wspd")):
            out.append(rec)

    # ── 전지구 자료로 빈 곳을 채운다 ──
    # ⚠️ 같은 관측소가 양쪽에 있으면 **NDBC 를 쓴다.**
    #    NDBC 는 파주기(dpd)와 카메라 사진이 있고 OSMC 에는 없다.
    #    OSMC 는 NDBC 가 커버하지 않는 지역을 메우는 역할이다.
    have = {r["id"] for r in out}
    g = osmc()
    added = 0
    for code, rec in g.items():
        if code in have:
            continue
        rec.pop("_t", None)
        # 제원표에 있으면 상세 제원을 얹는다 (국제 관측소도 일부 실려 있다)
        m = meta.get(code) or meta.get(code.lower()) or meta.get(code.upper())
        if m:
            # ⚠️ dict(m, **x, src=...) 로 합치면 x 에 이미 src 가 있어 터진다 (한 번 겪었다).
            #    순서를 정해 명시적으로 덮어쓴다: 제원표 → OSMC 실측값 → 출처 표기.
            merged = dict(m)
            merged.update({k: v for k, v in rec["meta"].items() if v})
            merged["src"] = "OSMC+NDBC표"
            rec["meta"] = merged
        out.append(rec)
        added += 1
    print(f"[buoys] NDBC {len(have)}개 + OSMC 추가 {added}개 = {len(out)}개")

    # ── 차트가 실제로 있는 관측소 표시 ──
    # ⚠️ NDBC 의 /plot 은 없는 관측소에도 200 + 빈 PNG 를 준다 (실측 ~21KB).
    #    자료가 있으면 40KB 이상이다. HEAD 로 Content-Length 만 보고 가른다.
    #    이걸 안 하면 앱이 "차트"라며 빈 그래프를 띄운다 — 고장으로 보인다.
    mark_charts(out)

    # ── 종류별 사진 ──
    # 종류마다 대표 관측소 하나를 골라 사진 주소를 알아낸다
    reps = {}
    for r in out:
        t = (r.get("meta") or {}).get("type")
        if t and t not in reps and (r.get("meta") or {}).get("src", "").startswith("NDBC"):
            reps[t] = r["id"]
    photos = hull_photos(reps)
    for r in out:
        t = (r.get("meta") or {}).get("type")
        if t and t in photos:
            r["meta"]["photo"] = photos[t]

    return out


def solar():
    """태양 영상 + X선 플레어 등급.

    ⚠️ 플레어 등급은 X선 세기(W/m²)로 정한다. 로그 척도라 자릿수가 곧 등급이다.
       A <1e-7, B 1e-7, C 1e-6, M 1e-5, X 1e-4
    """
    img = get(SDO)
    dst.put_object(Bucket=DST_BUCKET, Key="solar/latest.jpg", Body=img,
                   ContentType="image/jpeg", CacheControl="public, max-age=900")

    flux = None
    cls = None
    try:
        rows = json.loads(get(XRAY, timeout=40).decode())
        # 0.1-0.8nm 채널이 플레어 등급의 기준이다
        long_ch = [r for r in rows if r.get("energy") == "0.1-0.8nm"]
        if long_ch:
            flux = float(long_ch[-1]["flux"])
            for lo, name in ((1e-4, "X"), (1e-5, "M"), (1e-6, "C"), (1e-7, "B")):
                if flux >= lo:
                    cls = f"{name}{flux / lo:.1f}"
                    break
            else:
                cls = "A"
    except Exception as e:
        print("[xray]", e)

    return {"bytes": len(img), "flux": flux, "class": cls}


def handler(event, context):
    now = datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:00Z")
    res = {}

    try:
        b = buoys()
        body = json.dumps({"generated": now, "source": "NOAA NDBC + NOAA OSMC/GTS",
                           "count": len(b), "buoys": b},
                          separators=(",", ":")).encode()
        dst.put_object(Bucket=DST_BUCKET, Key="ocean/buoys.json", Body=body,
                       ContentType="application/json", CacheControl="public, max-age=1800")
        res["buoys"] = len(b)
        print(f"[buoys] {len(b)}개 {len(body)/1024:.0f}KB")
    except Exception as e:
        print("[buoys] 실패", e)
        res["buoys"] = 0

    try:
        s = solar()
        meta = {"generated": now, "source": "NASA SDO AIA 193Å · NOAA SWPC GOES X-ray",
                "flareClass": s["class"], "xrayFlux": s["flux"],
                "image": "solar/latest.jpg"}
        dst.put_object(Bucket=DST_BUCKET, Key="solar/meta.json",
                       Body=json.dumps(meta, ensure_ascii=False).encode(),
                       ContentType="application/json", CacheControl="public, max-age=600")
        res["solar"] = s["class"]
        print(f"[solar] {s['bytes']/1024:.0f}KB, 플레어 {s['class']}")
    except Exception as e:
        print("[solar] 실패", e)

    return {"ok": True, **res}
