"""GDELT 이벤트 + 신뢰도 검증 레이어 (인수인계 §5-2)

문서가 요구한 스코어링 요소를 그대로 구현한다:
  · 다중 소스 교차 검증
  · 소스 가중치
  · 위치+시간 기반 중복 제거
  · 미확정 / 확정 2단계 표시 분리
  · 시간 경과에 따른 감쇠(decay)

⚠️ 문서가 전제한 GDELT GEO API 는 폐지됐다 (실측: 404).
   대신 GDELT 2.0 원본 이벤트 CSV 를 쓴다 — 15분마다 갱신되고 좌표가 96% 붙어 있다.
     http://data.gdeltproject.org/gdeltv2/lastupdate.txt → 최신 파일 주소
   원본이 오히려 낫다: NumSources·NumMentions 가 들어 있어 교차검증 점수를 바로 만든다.

⚠️ DOC API 는 rate limit 이 심하다 (5초에 1회, 실측으로 429 를 여러 번 맞음).
   원본 CSV 는 정적 파일이라 그 제한이 없다.

⚠️ GDELT 는 자동 코딩이라 노이즈가 많다 (문서 §4-5 경고).
   그래서 점수가 낮은 건 "미확정"으로 내려보내고, 앱이 다르게 표시한다.
   노이즈를 확정 이벤트처럼 보여주면 앱 전체의 신뢰가 무너진다.
"""

import csv
import html
import io
import json
import math
import os
import re
import urllib.request
import zipfile
from datetime import datetime, timedelta, timezone

import boto3

DST_BUCKET = os.environ["CACHE_BUCKET"]
DST_REGION = os.environ.get("CACHE_REGION") or os.environ.get("AWS_REGION")
LAST = "http://data.gdeltproject.org/gdeltv2/lastupdate.txt"

dst = boto3.client("s3", region_name=DST_REGION)

COLS = (
    "GlobalEventID Day MonthYear Year FractionDate "
    "Actor1Code Actor1Name Actor1CountryCode Actor1KnownGroupCode Actor1EthnicCode "
    "Actor1Religion1Code Actor1Religion2Code Actor1Type1Code Actor1Type2Code Actor1Type3Code "
    "Actor2Code Actor2Name Actor2CountryCode Actor2KnownGroupCode Actor2EthnicCode "
    "Actor2Religion1Code Actor2Religion2Code Actor2Type1Code Actor2Type2Code Actor2Type3Code "
    "IsRootEvent EventCode EventBaseCode EventRootCode QuadClass GoldsteinScale "
    "NumMentions NumSources NumArticles AvgTone "
    "Actor1Geo_Type Actor1Geo_FullName Actor1Geo_CountryCode Actor1Geo_ADM1Code "
    "Actor1Geo_ADM2Code Actor1Geo_Lat Actor1Geo_Long Actor1Geo_FeatureID "
    "Actor2Geo_Type Actor2Geo_FullName Actor2Geo_CountryCode Actor2Geo_ADM1Code "
    "Actor2Geo_ADM2Code Actor2Geo_Lat Actor2Geo_Long Actor2Geo_FeatureID "
    "ActionGeo_Type ActionGeo_FullName ActionGeo_CountryCode ActionGeo_ADM1Code "
    "ActionGeo_ADM2Code ActionGeo_Lat ActionGeo_Long ActionGeo_FeatureID "
    "DATEADDED SOURCEURL"
).split()
IX = {c: i for i, c in enumerate(COLS)}

# CAMEO 이벤트 대분류 → 사람이 읽는 말. 우리가 보여줄 종류만 추린다.
# ⚠️ 전부 보여주면 "회담", "성명 발표" 같은 일상 뉴스가 지구를 덮는다.
#
# ⚠️⚠️ CAMEO 는 "무슨 일이 일어났나"가 아니라 "기사 문장이 어떤 꼴인가"를 코딩한다.
#       그래서 산불 기사의 "firefighters **battle** the blaze" 가 19(FIGHT)로 코딩된다.
#       실제로 프랑스·스페인 대형 산불이 "교전"으로 표시됐다 — 전쟁으로 읽힌다.
#       고칠 것 두 가지를 다 했다:
#         1) 재난 기사를 먼저 걸러 별도 분류로 뺀다 (아래 DISASTER)
#         2) 라벨을 단정적인 군사 용어에서 "보도 분류"에 맞는 말로 바꿨다
#       근본적으로 GDELT 분류는 '검증된 사실'이 아니다. UI 에서도 그렇게 말한다.
ROOT = {
    "14": ("시위·집회", "Protest"),
    "18": ("폭력 사건", "Violent incident"),
    "19": ("무력 충돌", "Armed clash"),
    "20": ("대규모 폭력", "Mass violence"),
    "17": ("강압 조치", "Coercion"),
    "13": ("위협 발언", "Threat"),
    "15": ("무력 시위", "Force posture"),
}

# 자연재난·사고 기사. CAMEO 가 충돌로 오분류하는 대표 사례다.
# ⚠️ 이 목록에 걸리면 충돌 분류를 **덮어쓴다**. 산불을 교전이라 부르지 않기 위해서다.
#    지진·화산·태풍은 우리에게 실제 관측 레이어가 따로 있으므로,
#    여기서는 "관련 보도가 있다"는 신호로만 쓴다.
DISASTER = re.compile(
    r"(wildfire|wild-fire|bushfire|forest[- ]?fire|blaze|brush[- ]?fire|"
    r"incendio|feu[- ]de[- ]for|waldbrand|"
    r"flood|inondation|deluge|landslide|mudslide|avalanche|"
    r"earthquake|seisme|terremoto|volcan|eruption|tsunami|"
    r"hurricane|typhoon|cyclone|tornado|heatwave|heat[- ]wave|drought|"
    r"evacuat|wildland)", re.I)

DISASTER_LABEL = ("재난 보도", "Disaster report")

# 소스 가중치 (§5-2 "소스 가중치").
# ⚠️ 특정 매체를 편들지 않는다. 통신사·공영방송처럼 1차 취재망이 넓은 곳에 가중치를 준다.
#    여기 없는 매체가 틀렸다는 뜻이 아니라, 교차검증 기여도를 다르게 본다는 뜻이다.
WIRE = re.compile(
    r"(reuters|apnews|afp\.com|bloomberg|bbc\.|nytimes|washingtonpost|theguardian|"
    r"aljazeera|kyodonews|nhk\.or\.jp|yonhapnews|xinhuanet|dw\.com|npr\.org|cnn\.com)",
    re.I,
)

WINDOW_HOURS = 3        # 몇 시간치를 모을지 (교차검증이 쌓이려면 창이 필요하다)
CONFIRM_SCORE = 60      # 이 이상이면 "확정", 미만은 "미확정"
MIN_SCORE = 25          # 이 아래는 아예 내보내지 않는다 (노이즈)
DEDUP_KM = 60           # 이 거리 안 + 같은 종류면 같은 사건으로 본다


def latest_export_url():
    txt = urllib.request.urlopen(LAST, timeout=30).read().decode()
    for line in txt.splitlines():
        parts = line.split()
        if len(parts) >= 3 and parts[2].endswith("export.CSV.zip"):
            return parts[2]
    raise RuntimeError("lastupdate.txt 에서 export 파일을 못 찾음")


def recent_export_urls(latest_url, hours=WINDOW_HOURS):
    """최근 몇 시간치 파일 주소들.

    ⚠️ 한 파일은 15분치라 그 안에서는 교차검증이 성립하지 않는다.
       실측: 단일 파일에서는 소스 1~2개가 대부분이고 확정 등급이 하나도 안 나왔다.
       같은 사건이 여러 매체에 퍼지는 데 시간이 걸리므로 창을 넓혀야 한다.
       파일명이 YYYYMMDDHHMMSS 라 15분씩 거슬러 올라가면 된다."""
    base = latest_url.rsplit("/", 1)[0]
    stamp = re.search(r"/(\d{14})\.export", latest_url).group(1)
    t = datetime.strptime(stamp, "%Y%m%d%H%M%S")
    urls = []
    for i in range(int(hours * 4)):          # 15분 간격
        u = f"{base}/{(t - timedelta(minutes=15 * i)):%Y%m%d%H%M%S}.export.CSV.zip"
        urls.append(u)
    return urls


def fetch_events(url):
    blob = urllib.request.urlopen(url, timeout=60).read()
    with zipfile.ZipFile(io.BytesIO(blob)) as z:
        name = z.namelist()[0]
        text = z.read(name).decode("utf-8", "replace")
    return list(csv.reader(io.StringIO(text), delimiter="\t"))


def km_between(a_lat, a_lon, b_lat, b_lon):
    """대략적인 거리. 중복 판정용이라 정밀도는 이 정도면 충분하다."""
    dy = (a_lat - b_lat) * 111.0
    dx = (a_lon - b_lon) * 111.0 * math.cos(math.radians((a_lat + b_lat) / 2))
    return math.hypot(dx, dy)


def score(row, age_min):
    """신뢰도 0~100. 문서 §5-2 의 요소를 각각 점수로 옮긴 것."""
    n_src = int(row[IX["NumSources"]] or 0)
    n_men = int(row[IX["NumMentions"]] or 0)
    url = row[IX["SOURCEURL"]] or ""

    # ① 다중 소스 교차 검증 — 여러 매체가 독립적으로 다뤘는가 (가장 큰 비중)
    s_cross = min(45, n_src * 9)

    # ② 언급량 — 같은 사건이 반복 보도되는가. 로그로 눌러 과대평가를 막는다.
    s_vol = min(20, 7 * math.log10(max(n_men, 1) + 1) * 2)

    # ③ 소스 가중치 — 1차 취재망이 넓은 매체가 실었는가
    s_wire = 15 if WIRE.search(url) else 0

    # ④ 좌표 정밀도 — GDELT Geo_Type 1=국가 … 4=도시. 정밀할수록 신뢰
    gt = row[IX["ActionGeo_Type"]] or "0"
    s_geo = {"1": 2, "2": 6, "3": 9, "4": 12, "5": 12}.get(gt, 0)

    # ⑤ 시간 감쇠 — 오래된 사건은 "지금 벌어지는 일"이 아니다
    decay = max(0.0, 1.0 - age_min / (24 * 60))     # 24시간에 걸쳐 0 으로
    base = (s_cross + s_vol + s_wire + s_geo) * (0.55 + 0.45 * decay)
    return max(0, min(100, round(base)))


def gkg_titles(export_url):
    """GKG 파일에서 기사 제목을 모은다 (URL → 제목).

    왜 GKG 인가
      export.CSV 에는 제목이 없다. SOURCEURL 만 있다.
      그래서 화면에 "재난 보도 · Gironde, France" 같은 분류만 뜨고
      "무슨 일이 났는지"는 알 수 없었다.

      기사 페이지를 직접 긁어 og:title 을 읽는 방법도 시도했는데,
      실측 8건 중 3건이 403 이었다 (Newsquest 계열이 봇을 막는다).
      신디케이트 매체가 많은 사안에서 하필 제일 많이 실패한다.

      GKG 의 Extras 열에는 <PAGE_TITLE> 이 들어 있다 —
      실측: 696/696 레코드 전부 존재, 확정 이벤트 29건 중 29건 매칭(100%).
      같은 15분 주기로 나오고, 스크래핑도 403도 없다.

    ⚠️ 제목은 기사 "본문"이 아니다. 링크 이름으로 제목을 쓰는 것은
       모든 뉴스 수집 서비스가 하는 방식이고 §5-3 의 "링크만" 원칙에 맞다.
       본문·요약은 여기서도 절대 가져오지 않는다.

    ⚠️ GKG 파일은 개당 3MB 다. 3시간이면 36MB — Lambda 대역폭으로는 문제없지만
       실패한 파일은 조용히 건너뛴다. 제목이 없으면 도메인만 보여주면 된다.
    """
    titles = {}
    for u in recent_export_urls(export_url):
        gkg = u.replace(".export.CSV.zip", ".gkg.csv.zip")
        try:
            # ⚠️ UA 상수는 이 모듈에 없다. 다른 Lambda 의 변수명을 그대로 써서
            #    NameError 로 12개 파일이 전부 조용히 건너뛰어졌다 (제목 0건).
            #    GDELT 는 User-Agent 를 요구하지 않으므로 그냥 부른다.
            raw = urllib.request.urlopen(gkg, timeout=60).read()
            z = zipfile.ZipFile(io.BytesIO(raw))
            txt = z.read(z.namelist()[0]).decode("utf-8", "replace")
            for r in csv.reader(io.StringIO(txt), delimiter="\t"):
                if len(r) < 27:
                    continue
                m = re.search(r"<PAGE_TITLE>(.*?)</PAGE_TITLE>", r[26], re.S)
                if m:
                    t = html.unescape(m.group(1)).strip()
                    if t:
                        titles[r[4]] = t[:200]
        except Exception as e:                               # noqa: BLE001
            print(f"[gkg] skip {gkg.rsplit('/',1)[1]} {type(e).__name__}")
    print(f"[gkg] 제목 {len(titles):,}개")
    return titles


def handler(event, context):
    url = latest_export_url()
    stamp = re.search(r"/(\d{14})\.export", url).group(1)
    now = datetime.now(timezone.utc)

    # 최근 몇 시간치를 모은다. 없는 파일(아직 안 올라옴)은 건너뛴다.
    rows = []
    got = 0
    for u in recent_export_urls(url):
        try:
            rows.extend(fetch_events(u))
            got += 1
        except Exception as e:
            print(f"[skip] {u.rsplit('/',1)[1]} {e}")
    print(f"[src] {got}개 파일, 원본 이벤트 {len(rows)}")

    cand = []
    for r in rows:
        if len(r) < len(COLS):
            continue
        root = r[IX["EventRootCode"]]
        if root not in ROOT:
            continue
        lat, lon = r[IX["ActionGeo_Lat"]], r[IX["ActionGeo_Long"]]
        if not lat or not lon:
            continue
        try:
            lat, lon = float(lat), float(lon)
        except ValueError:
            continue

        # DATEADDED 는 YYYYMMDDHHMMSS
        try:
            added = datetime.strptime(r[IX["DATEADDED"]], "%Y%m%d%H%M%S").replace(tzinfo=timezone.utc)
            age_min = max(0, (now - added).total_seconds() / 60)
        except Exception:
            age_min = 0

        sc = score(r, age_min)
        if sc < MIN_SCORE:
            continue
        # ⚠️ 재난 기사면 충돌 분류를 덮어쓴다.
        #    GDELT 는 "소방대가 불길과 사투(battle)" 를 19(FIGHT)로 코딩한다.
        #    그대로 두면 산불이 "무력 충돌"로 지도에 찍힌다 — 실제로 그랬다.
        src_url = r[IX["SOURCEURL"]] or ""
        is_disaster = bool(DISASTER.search(src_url))
        kko, ken = (DISASTER_LABEL if is_disaster else ROOT[root])

        cand.append({
            "id": r[IX["GlobalEventID"]],
            "lat": round(lat, 3), "lon": round(lon, 3),
            "place": r[IX["ActionGeo_FullName"]],
            "country": r[IX["ActionGeo_CountryCode"]],
            "root": ("DIS" if is_disaster else root),
            "cameoRoot": root,          # 원본 코드는 남긴다 (나중에 재분류할 수 있게)
            "disaster": is_disaster,
            "kindKo": kko, "kindEn": ken,
            "sources": int(r[IX["NumSources"]] or 0),
            "mentions": int(r[IX["NumMentions"]] or 0),
            "tone": round(float(r[IX["AvgTone"]] or 0), 1),
            "url": r[IX["SOURCEURL"]],
            "score": sc,
            "ageMin": round(age_min),
        })

    # ── 위치+시간 기반 중복 제거 (§5-2) ──
    # ⚠️ GDELT 는 같은 사건을 기사마다 따로 코딩한다. 안 합치면 한 사건이 지도에 여러 개로 찍힌다
    #    (실측: 같은 마드리드 사건이 나란히 2건).
    cand.sort(key=lambda x: -x["score"])
    merged = []
    for c in cand:
        hit = None
        for m in merged:
            if m["root"] == c["root"] and km_between(m["lat"], m["lon"], c["lat"], c["lon"]) <= DEDUP_KM:
                hit = m
                break
        if hit:
            # 합쳐진 만큼 교차검증이 강해진 것이므로 소스 수를 합산하고 점수를 조금 올린다
            hit["sources"] += c["sources"]
            hit["mentions"] += c["mentions"]
            hit["merged"] = hit.get("merged", 1) + 1
            hit["score"] = min(100, hit["score"] + 4)
            hit.setdefault("alt", []).append(c["url"])
        else:
            merged.append(c)

    for m in merged:
        m["status"] = "confirmed" if m["score"] >= CONFIRM_SCORE else "unconfirmed"
        m["alt"] = (m.get("alt") or [])[:4]      # 링크는 최대 4개까지만

    merged.sort(key=lambda x: -x["score"])
    # ⚠️ 자르기 전 개수를 남긴다. 앱의 "교차검증 결과" 깔때기가 이 값을 쓴다 —
    #    자른 뒤 값(150)을 넣으면 중복제거가 몇 건인지 알 수 없어진다.
    dedup_count = len(merged)
    merged = merged[:150]

    # 기사 제목을 붙인다.
    # ⚠️ 제목이 없으면 화면에 "재난 보도 · Gironde, France" 같은 분류만 남는다.
    #    "무슨 일이 났는지"를 알려주는 건 결국 제목이다:
    #      "Wildfires drive 250,000 people from homes and edge towards Bordeaux"
    #    자를 것도, 요약할 것도 없이 그대로 링크 이름으로 쓴다 (§5-3 링크 원칙).
    # ⚠️ 못 찾으면 넣지 않는다. 지어내지 않는다 — 앱이 도메인만 보여준다.
    try:
        tmap = gkg_titles(url)
        titled = 0
        for m in merged:
            for u in [m["url"]] + (m.get("alt") or []):
                if u in tmap:
                    m["title"] = tmap[u]
                    titled += 1
                    break
        print(f"[title] {titled}/{len(merged)}건 제목 확보")
    except Exception as e:                                   # noqa: BLE001
        print("[title] 실패", repr(e))
    out = {
        "generated": now.strftime("%Y-%m-%dT%H:%M:00Z"),
        "sourceFile": stamp,
        "windowHours": WINDOW_HOURS,
        "source": "GDELT 2.0 Events",
        "rules": {
            "confirmScore": CONFIRM_SCORE, "minScore": MIN_SCORE, "dedupKm": DEDUP_KM,
        },
        "counts": {
            "raw": len(rows), "candidates": len(cand), "afterDedup": dedup_count,
            "shown": len(merged),
            "confirmed": sum(1 for m in merged if m["status"] == "confirmed"),
        },
        "events": merged,
    }
    body = json.dumps(out, ensure_ascii=False, separators=(",", ":")).encode()
    dst.put_object(
        Bucket=DST_BUCKET, Key="events/global.json",
        Body=body, ContentType="application/json; charset=utf-8",
        CacheControl="public, max-age=600",
    )
    print(f"[out] 원본 {len(rows)} → 후보 {len(cand)} → 중복제거 {len(merged)} "
          f"(확정 {out['counts']['confirmed']})  {len(body)/1024:.0f}KB")
    return {"ok": True, **out["counts"], "bytes": len(body)}
