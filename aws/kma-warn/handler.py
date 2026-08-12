"""한국 기상특보 — 지금 발효 중인 것만

무엇인가
  폭염·호우·한파·강풍·대설·건조·풍랑·태풍 특보의 **현재 상태**.
  사용자가 한국에 있으면 앱이 바로 알려줘야 하는 정보다.

⚠️ 가장 중요한 함정: `wrn_now_data` 는 **지금 켜진 것만 주지 않는다.**
   같은 구역·같은 종류에 대해 발표/변경/해제가 시간순으로 쌓여 온다.
   실측(2026-07-27): 07-25, 07-26, 07-27 발표분이 한 응답에 섞여 있었다.
   그대로 그리면 **이미 해제된 폭염경보가 계속 켜져 있는 지도**가 된다.
   → (구역, 종류)별로 **가장 최근 발표(TM_FC)만** 남기고,
     그게 '해제'면 빼고, 발효시각(TM_EF)이 아직 안 왔으면 '예비'로 나눈다.

⚠️ 좌표는 특보 자료에 없다. `wrn_reg_aws2` 가 AWS지점마다 특보구역코드를 달고 있어서,
   구역별로 그 지점들의 평균 위치를 쓴다.
   ⚠️ 평균이지 경계가 아니다. 화면에 "이 지점 일대"라고 적어야지
      구역 전체가 그 점이라고 오해하게 두면 안 된다.

출력
  s3://<CACHE_BUCKET>/events/kma-warn.json   (events/ 는 공개 프리픽스)
"""

import json
import os
import urllib.error
import urllib.parse
import urllib.request
from datetime import datetime, timedelta, timezone

import boto3

from safety_contract import command_state, latest_by_region_kind

BUCKET = os.environ["CACHE_BUCKET"]
REGION = os.environ.get("CACHE_REGION") or os.environ.get("AWS_REGION")
KEY = os.environ.get("KMA_HUB_KEY", "").strip()

BASE = "https://apihub.kma.go.kr/api/typ01/url/"
UA = {"User-Agent": "earthus/0.1 (+globe app)"}
DST = "events/kma-warn.json"
REG_CACHE = "events/kma-warn-regions.json"
STATE = "events/kma-warn-state.json"        # 지금 열려 있는 사건
EPISODES = "events/kma-warn-episodes.json"  # 끝난 사건 기록
STN_ZONE = "events/kma-warn-stations.json"  # 관측지점 → 특보구역 (앱이 '내 구역'을 찾는 데 쓴다)
KST = timezone(timedelta(hours=9))

# 보관 기간. 1년 보고서를 쓰려면 최소 2년은 있어야 전년 대비를 말할 수 있다.
KEEP_DAYS = 760

# 특보 종류별 표시색·아이콘 힌트. 앱에서 쓰기 좋게 여기서 정한다.
KIND = {
    "폭염": {"en": "Heat", "icon": "🔥", "color": "#e8590c"},
    "한파": {"en": "Cold", "icon": "❄️", "color": "#4dabf7"},
    "호우": {"en": "Heavy rain", "icon": "🌧️", "color": "#1c7ed6"},
    "대설": {"en": "Heavy snow", "icon": "🌨️", "color": "#74c0fc"},
    "강풍": {"en": "Strong wind", "icon": "💨", "color": "#37b24d"},
    "풍랑": {"en": "High seas", "icon": "🌊", "color": "#0c8599"},
    "건조": {"en": "Dry", "icon": "🍂", "color": "#f08c00"},
    "태풍": {"en": "Typhoon", "icon": "🌀", "color": "#c92a2a"},
    "황사": {"en": "Yellow dust", "icon": "🟤", "color": "#a9713a"},
    "폭풍해일": {"en": "Storm surge", "icon": "🌊", "color": "#5f3dc4"},
    "지진해일": {"en": "Tsunami", "icon": "🌊", "color": "#862e9c"},
    "안개": {"en": "Fog", "icon": "🌫️", "color": "#868e96"},
    # ⚠️ 실측에서 나왔다. 문서 목록에는 없어서 기본 아이콘으로 새어 나갔다.
    #    모르는 종류가 또 나올 수 있으니 기본값을 지우지 말 것.
    "열대야": {"en": "Tropical night", "icon": "🌙", "color": "#f76707"},
}
# 수준이 높을수록 큰 값. 정렬과 알림 우선순위에 쓴다.
LEVEL = {"예비특보": 0, "주의보": 1, "경보": 2, "중대경보": 3}

s3 = boto3.client("s3", region_name=REGION)


def get(ep, **p):
    q = urllib.parse.urlencode({**p, "authKey": KEY})
    with urllib.request.urlopen(urllib.request.Request(BASE + ep + "?" + q, headers=UA),
                                timeout=60) as r:
        return r.read().decode("euc-kr", "replace")


def rows(txt, sep=","):
    out = []
    for line in txt.split("\n"):
        t = line.strip().rstrip("=").strip().rstrip(",")
        if not t or t.startswith("#"):
            continue
        f = [x.strip() for x in t.split(sep)]
        if len(f) >= 6:
            out.append(f)
    return out


def regions(refresh=False):
    """특보구역코드 → 대표 위치·이름. 자주 바뀌지 않으니 하루 한 번만 받는다.

    ⚠️ refresh=True 로 캐시를 건너뛸 수 있어야 한다.
       이게 없어서, 표 형식을 바꾸고 배포했는데 캐시가 살아 있어 새 파일이 안 만들어졌다.
    """
    try:
        if refresh:
            raise KeyError("refresh")
        c = json.loads(s3.get_object(Bucket=BUCKET, Key=REG_CACHE)["Body"].read())
        age = (datetime.now(timezone.utc)
               - datetime.strptime(c["generated"], "%Y-%m-%dT%H:%M:00Z")
               .replace(tzinfo=timezone.utc)).total_seconds()
        if age < 86400 and c.get("regions"):
            return c["regions"]
    except Exception:                                    # noqa: BLE001
        pass

    acc, pts = {}, []
    for f in rows(get("wrn_reg_aws2.php")):
        try:
            lon, lat = float(f[3]), float(f[4])
            wid, wko = f[7], f[8]
        except (IndexError, ValueError):
            continue
        if not wid:
            continue
        a = acc.setdefault(wid, {"name": wko, "lon": 0.0, "lat": 0.0, "n": 0})
        a["lon"] += lon; a["lat"] += lat; a["n"] += 1
        # 지점 하나하나도 남긴다. 앱은 '가장 가까운 지점의 구역 = 내 구역'으로 판단한다.
        # ⚠️ 구역 평균 좌표로 가장 가까운 구역을 고르면 틀린다 —
        #    넓은 구역의 중심은 멀고, 좁은 구역의 중심은 가깝기 때문이다.
        #    지점 단위로 고르면 사실상 보로노이 분할이 되어 훨씬 정확하다.
        pts.append({"name": f[1], "lat": round(lat, 4), "lon": round(lon, 4),
                    "zone": wid, "zoneName": wko})
    out = {k: {"name": v["name"], "lon": round(v["lon"] / v["n"], 4),
               "lat": round(v["lat"] / v["n"], 4), "stations": v["n"]}
           for k, v in acc.items() if v["n"]}

    if pts:
        put(STN_ZONE, {
            "generated": datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:00Z"),
            "source": "기상청 특보구역-관측지점 대응표 (API허브 wrn_reg_aws2)",
            "sourceEn": "KMA warning-zone ↔ station table (API Hub)",
            "note": {
                "ko": "관측지점마다 그 지점이 속한 특보구역을 적어 둔 표입니다. "
                      "가장 가까운 지점의 구역을 '내 구역'으로 봅니다. "
                      "⚠️ 구역 경계선 자료가 아니라 근사입니다 — 경계 바로 옆에서는 어긋날 수 있습니다.",
                "en": "Each observing station tagged with its warning zone. The nearest station's "
                      "zone is treated as the user's zone. ⚠️ An approximation, not zone boundaries.",
            },
            "count": len(pts), "stations": pts,
        }, 86400)
    if out:
        s3.put_object(Bucket=BUCKET, Key=REG_CACHE,
                      Body=json.dumps({"generated": datetime.now(timezone.utc)
                                       .strftime("%Y-%m-%dT%H:%M:00Z"),
                                       "count": len(out), "regions": out},
                                      ensure_ascii=False, separators=(",", ":")).encode(),
                      ContentType="application/json; charset=utf-8")
    return out


def load(key, default):
    try:
        return json.loads(s3.get_object(Bucket=BUCKET, Key=key)["Body"].read())
    except Exception:                                    # noqa: BLE001
        return default


def put(key, doc, maxage):
    s3.put_object(Bucket=BUCKET, Key=key,
                  Body=json.dumps(doc, ensure_ascii=False, separators=(",", ":")).encode(),
                  ContentType="application/json; charset=utf-8",
                  CacheControl=f"public, max-age={maxage}")


def kst_dt(s):
    """YYYYMMDDHHMM → datetime. 못 읽으면 None."""
    try:
        return datetime.strptime(str(s)[:12], "%Y%m%d%H%M").replace(tzinfo=KST)
    except (TypeError, ValueError):
        return None


def track_episodes(active, now):
    """특보를 '사건' 단위로 묶어 쌓는다.

    왜 필요한가
      특보는 발표되고 사라진다. 어디에도 통째로 보관되지 않는다.
      우리는 15분마다 받고 있으니, 켜지고 꺼지는 순간만 기록하면
      "2026년 폭염경보가 어느 지역에 며칠 걸렸나"를 1년 뒤에 답할 수 있다.

    ⚠️ 사건의 시작은 **발효시각(TM_EF)** 이다. 우리가 처음 본 시각이 아니다.
       우리가 수집을 시작하기 전에 이미 걸려 있던 특보도 있다.
    ⚠️ 끝은 **우리가 사라진 걸 본 시각**이라 최대 15분 늦다. 그렇게 적어 둔다.
    ⚠️ 수집이 몇 시간 멈추면 그 사이 켜졌다 꺼진 특보는 통째로 놓친다.
       놓친 걸 지어내지 않는다 — 대신 마지막 확인 시각을 남겨 나중에 알아볼 수 있게 한다.
    """
    st = load(STATE, {})
    open_ = st.get("open", {})
    last_seen = st.get("lastSeenKst")

    seen, closed = set(), []
    for w in active:
        k = f"{w['regionId']}|{w['kind']}"
        seen.add(k)
        e = open_.get(k)
        if e is None:
            open_[k] = {
                "region": w["region"], "regionId": w["regionId"], "kind": w["kind"],
                "level": w["level"], "levelRank": w["levelRank"],
                "maxLevel": w["level"], "maxRank": w["levelRank"],
                "startKst": w["effectiveKst"], "issuedKst": w["issuedKst"],
                "lat": w.get("lat"), "lon": w.get("lon"),
            }
        else:
            # 주의보 → 경보로 올라가는 일이 흔하다. 최고 수준을 따로 남긴다.
            if w["levelRank"] > e.get("maxRank", 0):
                e["maxLevel"], e["maxRank"] = w["level"], w["levelRank"]
            e["level"], e["levelRank"] = w["level"], w["levelRank"]

    nows = now.strftime("%Y%m%d%H%M")
    for k in list(open_):
        if k in seen:
            continue
        e = open_.pop(k)
        e["endKst"] = nows
        e["endIsObserved"] = True     # 해제 발표시각이 아니라 '사라진 걸 본' 시각이다
        s, t = kst_dt(e.get("startKst")), kst_dt(nows)
        e["hours"] = round((t - s).total_seconds() / 3600, 1) if (s and t) else None
        closed.append(e)

    doc = load(EPISODES, {})
    eps = doc.get("episodes", [])
    eps.extend(closed)
    # 오래된 것 정리. ⚠️ 자르는 기준은 **시작 시각**이다 — 긴 사건이 먼저 잘리면 안 된다.
    cut = (now - timedelta(days=KEEP_DAYS)).strftime("%Y%m%d%H%M")
    eps = [e for e in eps if (e.get("startKst") or "") >= cut]

    # 달별 요약 — 보고서가 실제로 쓰는 형태
    by_month = {}
    for e in eps:
        mm = (e.get("startKst") or "")[:6]
        if not mm:
            continue
        m = by_month.setdefault(mm, {})
        k = m.setdefault(e["kind"], {"count": 0, "hours": 0.0, "regions": []})
        k["count"] += 1
        k["hours"] += e.get("hours") or 0
        if e["region"] not in k["regions"]:
            k["regions"].append(e["region"])
    for m in by_month.values():
        for k in m.values():
            k["hours"] = round(k["hours"], 1)
            k["regionCount"] = len(k["regions"])
            del k["regions"]                              # 지역명 전체는 용량만 먹는다

    put(EPISODES, {
        "generated": datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:00Z"),
        "source": "기상청 기상특보 (API허브 wrn_now_data) — earthus 자체 집계",
        "sourceEn": "KMA weather warnings, episodes compiled by earthus",
        "license": "원자료 공공누리 제1유형 · 집계는 earthus",
        "note": {
            "ko": "특보를 사건 단위로 묶은 기록입니다. 시작은 기상청 발효시각이고, "
                  "끝은 저희가 '사라진 것을 확인한' 시각이라 실제 해제보다 최대 15분 늦습니다. "
                  "⚠️ 수집이 멈춘 구간에 켜졌다 꺼진 특보는 빠져 있습니다.",
            "en": "Warnings grouped into episodes. Start is KMA's effective time; end is when we "
                  "observed it gone, so up to 15 min late. ⚠️ Warnings that began and ended during "
                  "a collection outage are missing.",
        },
        "collectingSince": doc.get("collectingSince") or nows,
        "lastSeenKst": last_seen,
        "keepDays": KEEP_DAYS,
        "count": len(eps),
        "openCount": len(open_),
        "byMonth": dict(sorted(by_month.items())),
        "episodes": eps[-4000:],
    }, 900)

    put(STATE, {"generated": datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:00Z"),
                "lastSeenKst": nows, "open": open_}, 60)
    return len(closed), len(open_)


def handler(event, context):
    if not KEY:
        return {"ok": False, "reason": "no-key"}
    try:
        raw = rows(get("wrn_now_data.php"))
    except urllib.error.HTTPError as e:
        if e.code == 403:
            return {"ok": False, "reason": "not-approved", "api": "wrn_now_data"}
        raise

    try:
        reg = regions(refresh=bool(event.get("refreshRegions")))
    except Exception as e:                               # noqa: BLE001
        print("[warn] 구역 좌표 실패 —", repr(e)[:80])
        reg = {}

    # (구역, 종류) 별로 가장 최근 발표만 남긴다. 순서가 뒤섞여도 pure reducer가 정한다.
    parsed = []
    for f in raw:
        try:
            reg_id, reg_ko, tm_fc, tm_ef, wrn, lvl = f[2], f[3], f[4], f[5], f[6], f[7]
        except IndexError:
            continue
        cmd = f[8] if len(f) > 8 else ""
        parsed.append({"reg_id": reg_id, "reg_ko": reg_ko, "tm_fc": tm_fc,
                       "tm_ef": tm_ef, "wrn": wrn, "lvl": lvl, "cmd": cmd,
                       # 원문 상위 구역을 보존한다. 공식 hierarchy reader 전에는
                       # 이 값만으로 사용자 위치까지 확장 매핑하지 않는다.
                       "up_id": f[0], "up_ko": f[1]})
    latest = latest_by_region_kind(parsed)

    now = datetime.now(KST).strftime("%Y%m%d%H%M")
    active, upcoming, cleared = [], [], 0
    for v in latest.values():
        cmd_state = command_state(v["cmd"])
        # ⚠️ 코드 3/정확한 '해제'만 종료다. 코드 4 '해제예보 연장'은 특보가 아직 살아 있다.
        # 예전의 문자열 포함 검사는 코드 4까지 해제로 오인할 수 있었다.
        if cmd_state == "RELEASED":
            cleared += 1
            continue
        m = reg.get(v["reg_id"], {})
        kind = KIND.get(v["wrn"], {})
        rec = {
            "region": v["reg_ko"] or m.get("name"),
            "regionId": v["reg_id"],
            "parentId": v.get("up_id"), "parent": v.get("up_ko"),
            "kind": v["wrn"], "kindEn": kind.get("en", v["wrn"]),
            "level": v["lvl"], "levelRank": LEVEL.get(v["lvl"], 1),
            "icon": kind.get("icon", "⚠️"), "color": kind.get("color", "#fa5252"),
            "issuedKst": v["tm_fc"], "effectiveKst": v["tm_ef"],
            "command": v["cmd"] or None, "commandState": cmd_state,
            "revision": f"{v['tm_fc']}:{v['cmd'] or 'UNKNOWN'}:{v['lvl']}",
        }
        if m:
            rec["lat"], rec["lon"] = m["lat"], m["lon"]
        # 발효시각이 아직 안 왔으면 '예비'다 — 지금 위험한 것과 섞지 않는다.
        (upcoming if v["tm_ef"] > now else active).append(rec)

    active.sort(key=lambda r: (-r["levelRank"], r["region"] or ""))
    upcoming.sort(key=lambda r: (r["effectiveKst"], r["region"] or ""))

    top = max((r["levelRank"] for r in active), default=-1)
    doc = {
        "schemaVersion": "earthus.kma-warning.snapshot.v2",
        "generated": datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:00Z"),
        "observedKst": now,
        "source": "기상청 기상특보 (API허브 wrn_now_data)",
        "sourceEn": "KMA weather warnings (API Hub)",
        "license": "공공누리 제1유형 (출처표시)",
        "note": {
            "ko": "지금 발효 중인 특보만 담았습니다. 해제된 특보와 지난 발표는 뺐습니다. "
                  "위치는 그 특보구역 안 관측지점들의 평균이며 구역 경계가 아닙니다. "
                  "⚠️ 실제 대응은 반드시 기상청 공식 발표를 따르세요.",
            "en": "Only warnings currently in effect; cleared and superseded entries removed. "
                  "Coordinates are the mean of observing stations inside each warning zone, "
                  "not zone boundaries. ⚠️ Always follow official KMA announcements.",
        },
        "levels": ["주의보", "경보", "중대경보"],
        "freshnessPolicy": {"freshMinutes": 30, "staleAfterMinutes": 45},
        "regionMapping": {
            "method": "NEAREST_KMA_STATION_ZONE",
            "officialBoundaryPolygon": False,
            "exactRegionIdRequiredForHardGate": True,
        },
        "activeCount": len(active),
        "upcomingCount": len(upcoming),
        "clearedCount": cleared,
        "topLevel": (["주의보", "경보", "중대경보"][top - 1] if top >= 1 else None),
        "kinds": sorted({r["kind"] for r in active}),
        "active": active,
        "upcoming": upcoming,
    }
    body = json.dumps(doc, ensure_ascii=False, separators=(",", ":")).encode()
    s3.put_object(Bucket=BUCKET, Key=DST, Body=body,
                  ContentType="application/json; charset=utf-8",
                  CacheControl="public, max-age=300")

    # ⚠️ 이력 적재가 실패해도 실황은 이미 올렸다. 실황까지 같이 죽이지 않는다.
    ep_closed = ep_open = None
    try:
        ep_closed, ep_open = track_episodes(active, datetime.now(KST))
    except Exception as e:                               # noqa: BLE001
        print("[warn] 이력 적재 실패 —", repr(e)[:120])

    print(f"[warn] 발효 {len(active)} · 예비 {len(upcoming)} · 해제제외 {cleared} "
          f"· 사건종료 {ep_closed} · 진행중 {ep_open}")
    return {"ok": True, "active": len(active), "upcoming": len(upcoming),
            "cleared": cleared, "kinds": doc["kinds"],
            "episodesClosed": ep_closed, "episodesOpen": ep_open}
