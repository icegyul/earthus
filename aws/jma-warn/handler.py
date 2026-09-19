# -*- coding: utf-8 -*-
"""일본 기상특보 — **되살아나면 저절로 들어오게** 해 두는 감시자

받은 요청
  "일본꺼는 활성화 되면 그뒤로 계속 받을 수 있게 해줘"

■⚠️⚠️ **멈춘 게 아니라 경로가 옮겨졌다.** (2026-09-20 확인)
   옛 경로 warning/data/warning/*.json 은 2026-05-28 11:31 JST 에서 멈췄다(2026-08-04 에 본 '정지').
   JMA 특보 페이지는 그 뒤로 warning/data/r8/*.json 을 읽는다 (r8 = 令和8年 제도 개편).
   스키마도 바뀌었다: areaTypes[].areas[].warnings[] → warning.class10Items[].kinds[].
   ⚠️ 우리가 멈춘 옛 경로만 보고 있어서 '되살아나면 자동 재개'가 112일간 일어나지 않았다.
   → 다음에 또 멈추면 **먼저 JMA 페이지가 부르는 경로가 바뀌었는지** 본다
     (bosai/warning/ 의 HTML·JS 가 여는 './data/…/map.json').

■⚠️⚠️⚠️ **그래서 이 파일의 핵심은 "경보 목록"이 아니라 "살아 있는가"다.**
   멈춘 자료를 그대로 내보내면 화면에 **"지금 발효 중인 특보 없음"** 이 뜬다.
   그건 자료가 없다는 뜻인데 **안전하다는 뜻으로 읽힌다.** 없는 안전을 알리는 것이라
   이 앱이 할 수 있는 가장 나쁜 거짓말이다.
   → live 판정을 먼저 하고, live 가 아니면 **경보 목록을 아예 내보내지 않는다.**
     화면은 "확인할 수 없습니다"라고 적는다. "없습니다"가 아니다.

■ 되살아나면 저절로 되는 구조
   · 이 함수는 계속 돈다. 발표 시각이 최근으로 바뀌는 순간 live=true 가 되고
     화면이 그때부터 특보를 보여준다. **사람이 손댈 일이 없다.**
   · health 감시가 이 파일의 갱신을 보고, 화면은 파일 안의 live 를 본다.
     둘은 다른 것이다 — 우리 수집이 도는 것과 원본이 살아 있는 것은 별개다.

■⚠️ 예의: 죽어 있을 때는 **요청 한 번만** 한다.
   58개 지역 파일을 10분마다 다 받으면 하루 8천 번이다. 남의 나라 공공 서버다.
   map.json 하나로 살아 있는지 보고, 살아 있을 때만 지역 파일을 받는다.

■⚠️ 특보 **종류 이름**을 우리가 붙이지 않는다.
   JMA 는 종류를 코드(14·15·20…)로만 주고, 공개된 대조표를 찾지 못했다.
   "14 = 대설" 같은 표를 우리가 만들어 붙이면 틀렸을 때 확인할 방법이 없다.
   → 코드는 코드로 두고, **기관이 쓴 문장(headlineText)** 을 그대로 옮긴다.
   ⚠️ 그 문장을 기계로 번역하지 않는다. 잘못 옮긴 경보는 안 옮긴 것보다 위험하다.

결과  s3://<CACHE_BUCKET>/events/jma-warn.json
"""

import json
import os
import urllib.request
from datetime import datetime, timedelta, timezone

import boto3

BUCKET = os.environ["CACHE_BUCKET"]
REGION = os.environ.get("CACHE_REGION") or os.environ.get("AWS_REGION")
s3 = boto3.client("s3", region_name=REGION)

DST = "events/jma-warn.json"
BASE = "https://www.jma.go.jp/bosai"
WARN_MAP = f"{BASE}/warning/data/r8/map.json"   # ⚠️ 옛 warning/data/warning/map.json 은 2026-05-28 정지
UA ={"User-Agent": "earthus/1.0 (dalur@kakao.com)"}
JST = timezone(timedelta(hours=9))

# ⚠️ 발표 시각이 이보다 오래되면 "살아 있다"고 보지 않는다.
#    특보는 상황이 없으면 갱신이 뜸할 수 있어 넉넉히 잡는다 —
#    다만 **하루**를 넘기면 그건 자료가 멈춘 것이다.
LIVE_HOURS = 24

# 지역표는 잘 안 바뀐다. 웜 스타트에서 다시 받지 않는다.
_area = None


def get(url, timeout=30):
    with urllib.request.urlopen(urllib.request.Request(url, headers=UA), timeout=timeout) as r:
        return json.loads(r.read().decode("utf-8"))


def areas():
    global _area
    if _area is None:
        d = get(f"{BASE}/common/const/area.json")
        # 이름은 일본어·영문 둘 다 남긴다. ⚠️ 한국어는 여기서 만들지 않는다 —
        # 화면이 규칙으로 옮기고(jpname.js), 옮긴 것임을 밝힌다.
        # ⚠️⚠️ 묶음끼리 코드가 겹친다 — "011000" 은 class10s 에서 宗谷地方, centers 에서
        #    九州南部・奄美地方 이다. 예전에는 뒤 묶음이 덮어써서 홋카이도 특보가 규슈 이름으로
        #    나갔다(2026-09-20 실측). 특보 항목은 class10 코드이므로 class10s 가 먼저 이긴다.
        _area = {}
        for grp in ("class10s", "offices", "class15s", "class20s", "centers"):
            for code, v in (d.get(grp) or {}).items():
                _area.setdefault(code, {"ja": v.get("name"), "en": v.get("enName")})
    return _area


def parse_jst(s):
    try:
        return datetime.fromisoformat(str(s))
    except (TypeError, ValueError):
        return None


def handler(event=None, context=None):
    now = datetime.now(timezone.utc).astimezone(JST)

    # ── ① 살아 있는가 (요청 한 번) ─────────────────────────────
    try:
        raw = get(WARN_MAP)
    except Exception as e:                                       # noqa: BLE001
        doc = {
            "generated": now.astimezone(timezone.utc).strftime("%Y-%m-%dT%H:%M:00Z"),
            "live": False, "reason": "fetch_failed",
            "error": str(e)[:160],
            "note": {"ko": "일본 기상청 특보 자료를 받지 못했습니다. "
                           "⚠️ 특보가 없다는 뜻이 아닙니다 — 확인할 수 없다는 뜻입니다.",
                     "en": "Could not reach the JMA warning feed. This does not mean there are no warnings."},
        }
        _put(doc)
        print(f"[jma-warn] 받기 실패: {e}")
        return {"ok": False, "live": False, "error": str(e)[:120]}

    rows = raw if isinstance(raw, list) else [raw]
    times = [parse_jst(x.get("reportDatetime")) for x in rows]
    times = [t for t in times if t]
    newest = max(times) if times else None
    age_h = ((now - newest).total_seconds() / 3600) if newest else None
    live = age_h is not None and age_h <= LIVE_HOURS
    # ⚠️ 스키마 방어: 시각은 살아 있는데 본문 구조를 못 알아보면 '0건'을 내보내지 않는다.
    #    옛 파서로 r8 을 읽으면 items=[] → '특보 없음'으로 보였을 것이다. 그게 가장 나쁜 거짓말이다.
    schema_ok = any(isinstance((x.get("warning") or {}).get("class10Items"), list) for x in rows)
    reason = None
    if live and not schema_ok:
        live, reason = False, "schema_changed"

    base = {
        "generated": now.astimezone(timezone.utc).strftime("%Y-%m-%dT%H:%M:00Z"),
        "generatedJst": now.strftime("%Y-%m-%d %H:%M"),
        "live": live,
        "reason": reason or (None if live else "source_stale"),
        "feedUrl": WARN_MAP,
        "feedLatestJst": newest.strftime("%Y-%m-%d %H:%M") if newest else None,
        "feedAgeHours": round(age_h, 1) if age_h is not None else None,
        "liveThresholdHours": LIVE_HOURS,
        "source": "일본 기상청 (JMA) 기상警報·注意報",
        "sourceEn": "Japan Meteorological Agency — warnings and advisories",
    }

    if not live:
        # ⚠️⚠️ 목록을 **아예 담지 않는다.** 담아 두면 언젠가 화면이 그걸 그린다.
        #    멈춘 자료가 화면에 뜨는 경로를 애초에 만들지 않는 것이 안전하다.
        why_ko = ("자료 형식이 바뀌어 저희가 읽을 수 없습니다" if reason == "schema_changed"
                  else f"**{base['feedLatestJst']}** 이후 갱신되지 않고 있습니다 (약 {base['feedAgeHours']}시간)")
        why_en = ("changed format and we cannot read it" if reason == "schema_changed"
                  else f"has not updated since {base['feedLatestJst']} ({base['feedAgeHours']}h)")
        base["note"] = {
            "ko": (f"⚠️⚠️ 일본 기상청 특보 자료가 {why_ko}.\n"
                   "⚠️ **지금 일본에 특보가 없다는 뜻이 아닙니다** — 저희가 확인할 수 없다는 뜻입니다. "
                   "일본 기상청 홈페이지나 현지 안내를 확인하세요.\n"
                   "저희는 계속 확인하고 있으며, 다시 들어오기 시작하면 **자동으로** 화면에 나옵니다."),
            "en": (f"⚠️ The JMA warning feed {why_en}. This does **not** mean there are no warnings "
                   "in Japan — it means we cannot check. We keep polling; it will appear "
                   "automatically if it resumes."),
        }
        _put(base)
        print(f"[jma-warn] 멈춤 — 최신 {base['feedLatestJst']} ({base['feedAgeHours']}h)")
        return {"ok": True, "live": False, "latest": base["feedLatestJst"],
                "ageHours": base["feedAgeHours"]}

    # ── ② 살아 있다 — 구역별로 모은다 ─────────────────────────
    # r8: 행 하나 = (관서, 전문 종류 dataTypeCode) 의 최신본. 전문 종류마다 맡은 특보 코드가
    #     겹치지 않는다(2026-09-20 실측: VPWW55={03,10} 56={29} 57={48} 58={15} 59={07,16}
    #     61={14,20,21,23}, 같은 (구역, 코드) 가 두 행에 나온 경우 0건) — 그래서 구역 단위로
    #     합쳐도 한 특보를 두 번 세거나 해제된 것을 되살리지 않는다. 실측: 58관서·287행·활성 74구역.
    #     ⚠️ 그래도 같은 (구역, 코드) 가 두 행에 오면 발표 시각이 늦은 쪽을 믿는다.
    INACTIVE = ("解除", "発表警報・注意報はなし", None)
    A = areas()
    latest, offices = {}, set()
    for x in rows:
        if x.get("publishingOffice"):
            offices.add(x["publishingOffice"])
        rd = x.get("reportDatetime") or ""
        for it in (x.get("warning") or {}).get("class10Items") or []:
            for k in it.get("kinds") or []:
                if k.get("code") is None:
                    continue
                key = (it.get("areaCode"), k.get("code"))
                if key not in latest or latest[key][0] < rd:
                    latest[key] = (rd, k.get("status"))
    by = {}
    for (code, kind), (rd, status) in sorted(latest.items()):
        if status in INACTIVE:
            continue
        nm = A.get(code) or {}
        e = by.setdefault(code, {"area": code, "ja": nm.get("ja"), "en": nm.get("en"),
                                 "codes": [], "status": [], "at": None})
        # ⚠️ 종류는 **코드 그대로**다. 이름을 우리가 붙이지 않는다.
        e["codes"].append(kind)
        e["status"].append(status)
        if (e["at"] or "") < rd:
            e["at"] = rd
    items, errs = list(by.values()), {}

    base["count"] = len(items)
    base["officeCount"] = len(offices)
    base["items"] = items
    base["errors"] = errs or None
    base["note"] = {
        "ko": ("일본 기상청이 지금 발효 중이라고 밝힌 특보입니다.\n"
               "⚠️⚠️ **특보 종류 이름은 적지 않습니다.** 일본 기상청이 종류를 코드(14·15·20…)로만 "
               "주고 공개된 대조표를 찾지 못했습니다 — 저희가 이름을 지어 붙이면 틀렸을 때 "
               "확인할 방법이 없습니다. 정확한 내용은 일본 기상청 발표를 보세요.\n"
               "⚠️ 지명은 일본어 원문과 영문을 그대로 둡니다. 기계 번역한 경보는 "
               "번역하지 않은 것보다 위험합니다.\n"
               "⚠️ 대피 판단은 현지 기관 발표를 따르세요."),
        "en": ("Warnings JMA currently reports as in force. ⚠️ Warning **types are shown as codes**, "
               "not names — JMA publishes only numeric codes and we found no public lookup table, "
               "so we will not invent names. Follow JMA's own announcements."),
    }
    _put(base)
    print(f"[jma-warn] 살아남 — {len(items)}건 · 최신 {base['feedLatestJst']}")
    return {"ok": True, "live": True, "count": len(items)}


def _put(doc):
    body = json.dumps(doc, ensure_ascii=False, separators=(",", ":")).encode()
    s3.put_object(Bucket=BUCKET, Key=DST, Body=body,
                  ContentType="application/json; charset=utf-8",
                  CacheControl="public, max-age=300")
