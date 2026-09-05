"""한국 낙뢰 실황 — 방금 어디에 떨어졌나

왜 만드나
  "지금 밖에 나가면 안 되는" 정보다. 그리고 화면에서 가장 강렬하다.
  무료 앱에 거의 없는 자료이기도 하다.

⚠️ **낙뢰(G)와 번개(C)를 절대 섞지 말 것.**
     G = cloud-to-ground — 땅에 떨어진다. 사람이 맞을 수 있다.
     C = cloud-to-cloud  — 구름 사이. 하늘에서만 번쩍인다.
   둘을 한 색으로 찍으면 "여기 벼락이 떨어졌다"는 거짓말이 된다.
   화면에서도 반드시 나눠 그린다.

⚠️ 강도(ST)는 **음수가 정상**이다. 대부분의 대지방전은 부극성이라 -20 ~ -100 kA 로 온다.
   음수를 결측으로 오해해 버리면 자료가 거의 다 사라진다.
   세기는 **절댓값**으로 봐야 한다.

⚠️ dtm 은 ± 범위다 (tm-dtm ≤ 관측 < tm+dtm). 미래는 비어 있으므로
   tm=지금, dtm=N 이면 사실상 최근 N분이 온다.

⚠️ 뇌우가 크게 들면 한 시간에 수만 건이 온다. 실황 파일에는 상한을 두되,
   **잘랐다는 사실을 파일에 적는다.** 조용히 자르면 "낙뢰가 이만큼뿐"으로 읽힌다.

출력
  events/kma-lightning.json        최근 실황
  events/kma-lightning-daily.json  일별 집계 (보고서용)
"""

import json
import os
import urllib.error
import urllib.parse
import urllib.request
from datetime import datetime, timedelta, timezone

import boto3

import kma_hub   # KMA 허브 호출 회계(PHASE 1) — aws/_shared/kma_hub.py, 배포 스크립트가 같이 담는다

BUCKET = os.environ["CACHE_BUCKET"]
REGION = os.environ.get("CACHE_REGION") or os.environ.get("AWS_REGION")
KEY = os.environ.get("KMA_HUB_KEY", "").strip()

BASE = "https://apihub.kma.go.kr/api/typ01/url/lgt_pnt.php"
UA = {"User-Agent": "earthus/0.1 (+globe app)"}
DST = "events/kma-lightning.json"
DAILY = "events/kma-lightning-daily.json"
KST = timezone(timedelta(hours=9))

WINDOW_MIN = 60          # 실황으로 보여줄 시간 (분)
MAX_POINTS = 4000        # 실황 파일 상한. 넘으면 최근 것부터 남기고 잘랐다고 적는다
KEEP_DAYS = 760

s3 = boto3.client("s3", region_name=REGION)


def load(key, default=None):
    try:
        return json.loads(s3.get_object(Bucket=BUCKET, Key=key)["Body"].read())
    except Exception:                                    # noqa: BLE001
        return default


def put(key, doc, maxage):
    body = json.dumps(doc, ensure_ascii=False, separators=(",", ":")).encode()
    s3.put_object(Bucket=BUCKET, Key=key, Body=body,
                  ContentType="application/json; charset=utf-8",
                  CacheControl=f"public, max-age={maxage}")
    return len(body)


def fetch(tm, dtm):
    q = urllib.parse.urlencode({"tm": tm, "dtm": str(dtm), "gc": "T", "authKey": KEY})
    with kma_hub.track("lgt_pnt"), urllib.request.urlopen(urllib.request.Request(f"{BASE}?{q}", headers=UA),
                                timeout=90) as r:
        txt = r.read().decode("euc-kr", "replace")

    out = []
    for line in txt.split("\n"):
        t = line.strip()
        if not t or t.startswith("#"):
            continue
        f = t.split()
        if len(f) < 5:
            continue
        try:
            lon, lat, st = float(f[1]), float(f[2]), float(f[3])
        except ValueError:
            continue
        kind = f[4] if len(f) > 4 else "G"
        rec = {"tm": f[0], "lon": round(lon, 4), "lat": round(lat, 4),
               "kA": round(st, 1), "type": kind}
        # 고도는 번개(C)에만 있다. 낙뢰(G)의 0.0 을 "지상 0km"로 읽으면 안 된다.
        if kind == "C" and len(f) > 5:
            try:
                ht = float(f[5])
                if ht > 0:
                    rec["ht"] = round(ht, 1)
            except ValueError:
                pass
        out.append(rec)
    return out


@kma_hub.accounted("kma-lightning")
def handler(event, context):
    if not KEY:
        return {"ok": False, "reason": "no-key"}
    now = datetime.now(KST)
    win = int(event.get("windowMin") or WINDOW_MIN)

    try:
        pts = fetch(now.strftime("%Y%m%d%H%M"), win)
    except urllib.error.HTTPError as e:
        if e.code == 403:
            return {"ok": False, "reason": "not-approved", "api": "lgt_pnt"}
        raise

    pts.sort(key=lambda p: p["tm"])
    total = len(pts)
    truncated = max(0, total - MAX_POINTS)
    shown = pts[-MAX_POINTS:] if truncated else pts

    ground = [p for p in shown if p["type"] == "G"]
    cloud = [p for p in shown if p["type"] == "C"]
    # 가장 센 것. ⚠️ 강도는 음수가 정상이라 **절댓값**으로 비교한다.
    strongest = max(pts, key=lambda p: abs(p["kA"]), default=None)

    doc = {
        "generated": datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:00Z"),
        "observedKst": now.strftime("%Y%m%d%H%M"),
        "windowMinutes": win,
        "source": "기상청 낙뢰관측 (API허브 lgt_pnt)",
        "sourceEn": "KMA lightning detection network (API Hub)",
        "license": "공공누리 제1유형 (출처표시)",
        "note": {
            "ko": f"최근 {win}분 동안 탐지된 낙뢰입니다. "
                  "낙뢰(G)는 구름에서 **땅으로** 떨어진 것이고, 번개(C)는 구름 사이에서만 친 것입니다. "
                  "강도는 음수가 정상이며(부극성) 세기는 절댓값으로 봅니다. "
                  "⚠️ 안전 판단은 기상청 공식 발표를 따르세요.",
            "en": f"Strikes detected in the last {win} minutes. G = cloud-to-ground (reaches the "
                  "ground); C = cloud-to-cloud. Negative current is normal; magnitude is |kA|. "
                  "⚠️ Follow official KMA guidance for safety decisions.",
        },
        "count": len(shown),
        "totalDetected": total,
        # ⚠️ 잘랐으면 반드시 적는다. 조용히 자르면 "이만큼뿐"으로 읽힌다.
        "truncated": truncated,
        "groundCount": len(ground),
        "cloudCount": len(cloud),
        "strongestKA": strongest["kA"] if strongest else None,
        "strikes": shown,
    }
    kb = put(DST, doc, 120)

    # ── 보고서용 일별 집계 ──────────────────────────────────
    # ⚠️ 5분마다 겹쳐 받으므로 그냥 더하면 같은 낙뢰를 여러 번 센다.
    #    (시각, 위도, 경도)로 중복을 걸러 누적한다.
    try:
        d = load(DAILY) or {}
        days = d.get("days", {})
        seen = set(d.get("recent") or [])
        day = now.strftime("%Y-%m-%d")
        # ⚠️ 중복 판정 키는 **시각으로** 잘라야 한다.
        #    예전에 list(set)[-N:] 로 잘랐는데, 파이썬 set 은 순서가 없어서
        #    "최근 것을 남긴다"고 써놓고 실제로는 아무거나 남겼다.
        #    뇌우가 크게 들어 수만 건이 오는 날엔 최근 키가 잘려나가
        #    **같은 낙뢰를 두 번 세게 된다.** 창(60분)의 두 배만 남긴다.
        keep_from = (now - timedelta(hours=2)).strftime("%Y%m%d%H%M%S")
        seen = {k for k in seen if k.split("|", 1)[0] >= keep_from}
        rec = days.setdefault(day, {"G": 0, "C": 0, "maxKA": 0})
        added = 0
        for p in pts:
            k = f"{p['tm']}|{p['lat']}|{p['lon']}"
            if k in seen:
                continue
            seen.add(k)
            rec[p["type"]] = rec.get(p["type"], 0) + 1
            rec["maxKA"] = max(rec["maxKA"], abs(p["kA"]))
            added += 1
        rec["maxKA"] = round(rec["maxKA"], 1)
        cut = (now - timedelta(days=KEEP_DAYS)).strftime("%Y-%m-%d")
        days = {k: v for k, v in days.items() if k >= cut}
        put(DAILY, {
            "generated": datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:00Z"),
            "source": "기상청 낙뢰관측 (API허브 lgt_pnt) — earthus 자체 집계",
            "sourceEn": "KMA lightning detection, daily counts compiled by earthus",
            "license": "원자료 공공누리 제1유형 · 집계는 earthus",
            "note": {
                "ko": "일별 낙뢰(G)·번개(C) 횟수입니다. 5분마다 겹쳐 받으므로 "
                      "(시각·위경도)로 중복을 걸러 셉니다. "
                      "⚠️ 수집이 멈춘 구간의 낙뢰는 빠져 있습니다.",
                "en": "Daily counts of ground (G) and cloud (C) discharges, de-duplicated by "
                      "(time, lat, lon). ⚠️ Strikes during collection outages are missing.",
            },
            "collectingSince": d.get("collectingSince") or day,
            "count": len(days),
            "days": dict(sorted(days.items())),
            # 중복 판정용 최근 키. 위에서 이미 2시간으로 잘라 두었다.
            # ⚠️ 정렬해서 담는다 — 순서가 없으면 다음 실행에서 무엇이 남았는지 못 믿는다.
            "recent": sorted(seen),
        }, 3600)
        daily_added = added
    except Exception as e:                               # noqa: BLE001
        print("[lgt] 일별 집계 실패 —", repr(e)[:120])
        daily_added = None

    print(f"[lgt] 탐지 {total} (낙뢰 {len(ground)} · 번개 {len(cloud)}) "
          f"· 잘림 {truncated} · 신규 {daily_added} · {kb/1024:.0f}KB")
    return {"ok": True, "total": total, "ground": len(ground), "cloud": len(cloud),
            "truncated": truncated, "strongestKA": doc["strongestKA"], "newToday": daily_added}
