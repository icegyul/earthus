"""국제 쓰나미 경보 프록시 (PTWC / NTWC)

왜 필요한가
  앱은 지금 api.weather.gov 만 본다. 그건 **미국 국내 경보**라
  일본·필리핀·칠레 앞바다 쓰나미는 안 나온다. 전 세계를 보여주는 앱에서
  "태평양 쓰나미가 안 뜬다"는 건 그냥 기능이 없는 것이다.

  tsunami.gov 의 두 센터가 사실상 태평양·카리브 전역을 낸다:
    PHEB — 태평양 쓰나미 경보센터(호놀룰루). 태평양 전역 + 카리브
    PAAQ — 국립 쓰나미 경보센터(알래스카). 미국·캐나다 연안

  ⚠️ 둘 다 CORS 헤더가 없다(실측). 그래서 프록시가 필요하다.

⚠️ 이 자료를 다룰 때 지킨 것
  · 등급을 우리가 다시 매기지 않는다. 센터가 쓴 Category 를 그대로 옮긴다.
  · 본문(bulletin)을 재현하지 않는다. 원문 링크로 보낸다.
  · 파싱에 실패한 항목은 버린다. 쓰나미 정보를 추측으로 채우면 안 된다.

출력: s3://<CACHE_BUCKET>/events/tsunami-intl.json

⚠️ 왜 events/ 아래인가
   버킷 정책의 공개 접두사는 app·celestrak·clouds·wind·events·ocean·solar 뿐이다.
   tsunami/ 를 새로 열려면 정책을 또 고쳐야 한다. 쓰나미 경보는 성격상 이벤트 피드라
   events/ 아래가 맞고, 정책 변경 없이 바로 공개된다.
"""

import json
import os
import re
import urllib.request
from datetime import datetime, timezone
from xml.etree import ElementTree as ET

import boto3

BUCKET = os.environ["CACHE_BUCKET"]
REGION = os.environ.get("CACHE_REGION") or os.environ.get("AWS_REGION")
s3 = boto3.client("s3", region_name=REGION)

FEEDS = {
    "PTWC": ("https://www.tsunami.gov/events/xml/PHEBAtom.xml",
             "Pacific Tsunami Warning Center"),
    "NTWC": ("https://www.tsunami.gov/events/xml/PAAQAtom.xml",
             "National Tsunami Warning Center"),
}
UA = {"User-Agent": "earthus/0.1 (+globe app)"}

NS = {
    "a": "http://www.w3.org/2005/Atom",
    "geo": "http://www.w3.org/2003/01/geo/wgs84_pos#",
}

# 센터가 쓰는 Category 그대로. 위→아래로 위험도가 낮아진다.
RANK = {"warning": 4, "advisory": 3, "watch": 2, "information": 1}


def txt(el):
    return (el.text or "").strip() if el is not None else ""


def parse_summary(summary_el):
    """summary 안의 <strong>라벨</strong> 값 구조를 뽑는다.

    ⚠️ 정규식으로 문자열을 뒤지면 안 된다. 실제로 그렇게 짰다가 전부 None 이 나왔다:
       ElementTree 는 직렬화할 때 xhtml 에 네임스페이스 접두사를 붙여
       <strong> 가 <html:strong> 이 된다. 눈으로 본 원본과 다른 문자열이 된다.

    → 트리를 그대로 순회한다. 라벨은 <strong>/<b> 의 text, 값은 그 요소의 tail 이다.
      접두사가 무엇이든 지역명(localname)만 보므로 영향을 안 받는다.
    """
    fields = {}
    if summary_el is None:
        return {"category": None, "issued": None,
                "magnitude": None, "magnitude_raw": None, "region": None}
    for el in summary_el.iter():
        tag = el.tag.rsplit("}", 1)[-1].lower()      # {ns}strong → strong
        if tag not in ("strong", "b"):
            continue
        label = (el.text or "").strip().rstrip(":").strip().lower()
        value = (el.tail or "").strip()
        if label and value:
            fields[label] = value

    def field(name):
        return fields.get(name.lower())

    mag_raw = field("Preliminary Magnitude")
    mag = None
    if mag_raw:
        mm = re.search(r"([\d.]+)", mag_raw)
        if mm:
            try:
                mag = float(mm.group(1))
            except ValueError:
                mag = None
    return {
        "category": field("Category"),
        "issued": field("Bulletin Issue Time"),
        "magnitude": mag,
        "magnitude_raw": mag_raw,
        "region": field("Affected Region"),
    }


def bulletin_link(entry):
    """원문 게시문 링크. 본문은 우리가 싣지 않는다."""
    for ln in entry.findall("a:link", NS):
        if (ln.get("title") or "").lower() == "bulletin":
            return ln.get("href")
    for ln in entry.findall("a:link", NS):
        href = ln.get("href") or ""
        if href.endswith(".txt"):
            return href
    return None


def fetch(url):
    req = urllib.request.Request(url, headers=UA)
    with urllib.request.urlopen(req, timeout=30) as r:
        return r.read()


def collect():
    out, seen = [], set()
    for code, (url, center) in FEEDS.items():
        try:
            root = ET.fromstring(fetch(url))
        except Exception as e:                               # noqa: BLE001
            print(f"[{code}] 실패 {e!r}")
            continue

        for entry in root.findall("a:entry", NS):
            try:
                lat = txt(entry.find("geo:lat", NS))
                lon = txt(entry.find("geo:long", NS))
                if not lat or not lon:
                    continue                      # 위치 없는 항목은 지도에 못 올린다
                f = parse_summary(entry.find("a:summary", NS))

                uid = txt(entry.find("a:id", NS))
                if uid in seen:
                    continue                      # 두 센터가 같은 사건을 낼 수 있다
                seen.add(uid)

                # ⚠️ 등급을 못 읽으면 "Information"(최하위)으로 떨어뜨리면 안 된다.
                #    실제 경보(Warning)를 정보성으로 표시하는 건 사람 목숨과 직결된다.
                #    못 읽었으면 못 읽었다고 두고, 앱이 원문을 보라고 안내한다.
                cat = (f["category"] or "").strip() or "Unknown"
                out.append({
                    "id": uid,
                    "center": code, "centerName": center,
                    "category": cat,
                    # 알 수 없으면 2로 둔다 — 최하위(1)로 묻히지도, 최고로 과장되지도 않게
                    "rank": RANK.get(cat.lower(), 2),
                    "parsed": f["category"] is not None,
                    "title": txt(entry.find("a:title", NS)),
                    "region": f["region"],
                    "lat": float(lat), "lon": float(lon),
                    "magnitude": f["magnitude"],
                    "updated": txt(entry.find("a:updated", NS)),
                    "issued": f["issued"],
                    "bulletin": bulletin_link(entry),
                })
            except Exception as e:                           # noqa: BLE001
                print(f"[{code}] 항목 건너뜀 {e!r}")
                continue

    out.sort(key=lambda x: (-x["rank"], x["updated"]), reverse=False)
    return out


def handler(event, context):
    now = datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")
    items = collect()
    body = {
        "generated": now,
        "source": "NOAA tsunami.gov — PTWC (Honolulu) + NTWC (Palmer, AK)",
        "count": len(items),
        "note": ("Category is copied verbatim from the issuing center. "
                 "Bulletin text is not reproduced — follow the link."),
        "alerts": items,
    }
    s3.put_object(
        Bucket=BUCKET, Key="events/tsunami-intl.json",
        Body=json.dumps(body, ensure_ascii=False, separators=(",", ":")).encode(),
        ContentType="application/json", CacheControl="public, max-age=120")
    print(f"[tsunami-intl] {len(items)}건")
    return {"ok": True, "count": len(items),
            "categories": sorted({i["category"] for i in items})}
