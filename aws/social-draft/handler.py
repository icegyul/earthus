# -*- coding: utf-8 -*-
"""SNS 초안 — 태풍 상황이 바뀌면 **올릴 거리**를 만들어 둔다

받은 요청
  "돌핀 태풍이 소멸 예측이 뜨면 … 각국 정보가 뜨고 … 인스타그램부터 x, 쓰레드,
   페이스북 등 sns에 자동 알림 … 우리 화면 캡처해서 배포하는거지"

■⚠️⚠️ **자동으로 올리지 않는다. 초안까지만 만든다.**
   ① 공개 게시는 되돌릴 수 없다. 사람이 한 번 보고 눌러야 한다.
   ② 그게 제품으로도 맞다 — 오늘 하루에만 이런 버그를 찾았다:
        · NHC 경도 부호가 빠져 **동태평양 허리케인이 서태평양에 찍혔다**
        · 파고를 최대가 아니라 평균으로 보여줘 **2.3배 작게** 나갔다
      화면은 고치면 되지만 **게시물은 이미 퍼진다.**
   → 여기서는 s3 에 초안만 쌓는다. 올리는 것은 관리자 화면에서 사람이 한다.

■⚠️ 카드 이미지를 여기서 그리지 않는 이유
   Lambda(Amazon Linux)에 **한글 폰트가 없다.** 폰트를 넣으면 패키지가 커지고,
   무엇보다 사람이 어차피 보고 올릴 것이라 **브라우저에서 그리는 편이 낫다.**
   → 초안은 "사실 + 문구 + 카드 사양"이고, 그림은 admin.html 이 그린다.

출력  s3://<CACHE_BUCKET>/events/social-drafts.json
"""

import json
import os
import urllib.request
from datetime import datetime, timedelta, timezone

import boto3

BUCKET = os.environ["CACHE_BUCKET"]
REGION = os.environ.get("CACHE_REGION") or os.environ.get("AWS_REGION")
CDN = os.environ.get("CDN_BASE", "https://earthus.net")
s3 = boto3.client("s3", region_name=REGION)

DST = "events/social-drafts.json"
SRC = f"{CDN}/events/typhoon-official.json"
UA = {"User-Agent": "earthus/1.0 (dalur@kakao.com)"}
KST = timezone(timedelta(hours=9))

# 플랫폼별 글자 한도. ⚠️ 넘치면 잘려서 **중요한 경고가 먼저 사라진다.**
LIMITS = {"x": 280, "threads": 500, "instagram": 2200, "facebook": 2000}

# ⚠️ 이보다 약하면 굳이 알리지 않는다. 매번 올리면 아무도 안 본다.
MIN_WIND_MS = 17.0


def get(url):
    with urllib.request.urlopen(urllib.request.Request(url, headers=UA), timeout=40) as r:
        return json.load(r)


def kst(s):
    """여러 형식으로 오는 시각을 KST 로 맞춘다"""
    if not s:
        return None
    try:
        if s.endswith("Z"):
            return datetime.fromisoformat(s[:-1] + "+00:00").astimezone(KST)
        return datetime.fromisoformat(s).astimezone(KST)
    except ValueError:
        return None


def storm_facts(st):
    """한 태풍에서 **사실만** 뽑는다. 형용사·추측 금지."""
    ags = st.get("agencies") or []
    if not ags:
        return None
    out = {"key": st.get("key"), "name": st.get("name"), "agencies": []}
    now = None
    for a in ags:
        steps = a.get("steps") or []
        s0 = next((x for x in steps if x.get("h") == 0), steps[0] if steps else None)
        if not s0:
            continue
        last = steps[-1]
        if now is None and s0.get("lat") is not None:
            now = s0
        out["agencies"].append({
            "id": a.get("agency"), "ko": a.get("agencyKo"),
            "number": a.get("number"),
            "windMs": s0.get("windMs"), "hpa": s0.get("hpa"),
            "place": s0.get("place"),
            "categoryKo": s0.get("categoryKo") or s0.get("intensityKo"),
            "horizonH": a.get("horizonH"),
            # ⚠️ 마지막 예보 시각까지만 말한다. 그 뒤는 우리가 모른다.
            "lastH": last.get("h"), "lastPlace": last.get("place"),
            "downgrade": a.get("downgrade"),
        })
    if not now:
        return None
    out.update(lat=now.get("lat"), lon=now.get("lon"),
               windMs=now.get("windMs"), hpa=now.get("hpa"),
               place=now.get("place"))
    return out


def headline(f, ko=True):
    """⚠️ 여기서 예보를 만들지 않는다. 기관이 낸 것을 옮기고 출처를 붙인다."""
    nm = f.get("name") or "열대저압부"
    w = f.get("windMs")
    # 소멸/약화 — 기관이 downgrade 를 낸 경우에만
    dn = [a for a in f["agencies"] if a.get("downgrade")]
    if dn:
        who = " · ".join(a["ko"] or a["id"] for a in dn)
        return f"{nm} 약화 — {who}가 열대저압부로 낮췄습니다"
    if w and w >= 43:
        return f"{nm} 매우 강함 — 중심 최대풍속 {w:.0f}m/s"
    if w and w >= MIN_WIND_MS:
        return f"{nm} — 중심 최대풍속 {w:.0f}m/s"
    return f"{nm} 현재 위치"


def body_ko(f):
    L = []
    L.append(headline(f))
    if f.get("place"):
        L.append(f"지금 {f['place']}")
    L.append("")
    L.append("기관별 예보 (마지막 시각까지)")
    for a in f["agencies"]:
        bits = []
        if a.get("windMs"):
            bits.append(f"{a['windMs']:.0f}m/s")
        if a.get("hpa"):
            bits.append(f"{a['hpa']:.0f}hPa")
        if a.get("lastH") is not None:
            bits.append(f"+{a['lastH']}시간까지")
        L.append(f"· {a['ko'] or a['id']}: " + " · ".join(bits))
    L.append("")
    # ⚠️⚠️ 이 두 줄은 **어느 플랫폼에서도 안 자른다.** 아래 fit() 참고.
    L.append("⚠️ 진로는 저희가 예측하지 않습니다. 기관 예보를 그대로 옮깁니다.")
    L.append("⚠️ 대피 판단은 기상청 공식 발표를 따르세요.")
    return "\n".join(L)


def fit(text, limit, tail):
    """⚠️⚠️ 글자 수를 맞출 때 **경고 문구를 먼저 지우면 안 된다.**
    한도를 넘으면 가운데(기관 목록)를 줄이고 경고는 끝까지 남긴다."""
    if len(text) + len(tail) <= limit:
        return text + tail
    head, *rest = text.split("\n\n")
    warn = "\n".join(l for l in text.split("\n") if l.startswith("⚠️"))
    keep = limit - len(tail) - len(warn) - 4
    body = head[:max(0, keep)].rstrip()
    return f"{body}\n\n{warn}{tail}"


def handler(event=None, context=None):
    j = get(SRC)
    storms = j.get("storms") or []
    now = datetime.now(timezone.utc).astimezone(KST)

    drafts = []
    for st in storms:
        f = storm_facts(st)
        if not f:
            continue
        w = f.get("windMs") or 0
        dn = any(a.get("downgrade") for a in f["agencies"])
        # ⚠️ 약한 것은 안 만든다. 다만 **약화(소멸) 소식은 세기와 무관하게** 만든다 —
        #    받은 요청이 정확히 그것이었다("소멸 예측이 뜨면").
        if w < MIN_WIND_MS and not dn:
            continue
        base = body_ko(f)
        link = f"\n\n{CDN} #태풍 #{(f.get('name') or '').replace(' ', '')} #earthus"
        drafts.append({
            "id": f"{f['key']}-{now:%Y%m%d%H%M}",
            "at": now.isoformat(),
            "storm": f["key"], "name": f.get("name"),
            "kind": "downgrade" if dn else "update",
            "facts": f,
            # 카드 사양 — 그림은 admin.html 이 그린다 (Lambda 에 한글 폰트가 없다)
            "card": {
                "title": headline(f),
                "sub": f.get("place"),
                "rows": [{"k": a["ko"] or a["id"],
                          "v": " · ".join(x for x in [
                              f"{a['windMs']:.0f}m/s" if a.get("windMs") else None,
                              f"{a['hpa']:.0f}hPa" if a.get("hpa") else None] if x)}
                         for a in f["agencies"]],
                "stamp": f"{now:%Y-%m-%d %H:%M} KST · earthus",
                "lat": f.get("lat"), "lon": f.get("lon"),
            },
            "text": {p: fit(base, lim, link) for p, lim in LIMITS.items()},
            # ⚠️ **아직 아무 데도 안 올렸다.** 사람이 관리자 화면에서 올린다.
            "posted": {},
        })

    doc = {
        "generated": now.astimezone(timezone.utc).strftime("%Y-%m-%dT%H:%M:00Z"),
        "count": len(drafts),
        "source": "기상청·JMA·NHC 공식 예보 (typhoon-official.json)",
        "note": {
            "ko": "⚠️ 이것은 **초안**입니다. 아무 곳에도 올라가지 않았습니다. "
                  "관리자 화면에서 확인하고 사람이 올립니다.\n"
                  "⚠️ 자동 게시를 만들지 않은 이유: 화면의 오류는 고치면 되지만 "
                  "게시물은 이미 퍼집니다. 실제로 하루 만에 경도 부호 오류와 "
                  "파고 축소 오류를 찾았습니다.",
        },
        "drafts": drafts,
    }
    body = json.dumps(doc, ensure_ascii=False, separators=(",", ":")).encode()
    s3.put_object(Bucket=BUCKET, Key=DST, Body=body,
                  ContentType="application/json; charset=utf-8",
                  CacheControl="no-cache")
    print(f"[social] 초안 {len(drafts)}건 · {[d['name'] for d in drafts]}")
    return {"ok": True, "count": len(drafts)}
