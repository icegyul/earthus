"""지역 뉴스 헤드라인 — 아프리카·중동·남미·동남아·오세아니아

왜 필요한가
  우리 뉴스는 GDELT 하나로 전 세계를 덮는다. 그런데 GDELT 는 영어권·서구 매체가
  많이 잡힌다. 그 지역 매체가 그 지역 말로 낸 기사는 상대적으로 덜 걸린다.
  아래는 각 지역 매체가 직접 내는 RSS 다.

⚠️⚠️ **기사 본문을 절대 담지 않는다.**
   담는 것은 **제목 · 링크 · 시각 · 매체**뿐이다.
   본문을 저장하거나 화면에 옮기면 저작권 침해다. 요약도 하지 않는다 —
   요약은 원문을 재구성하는 것이라 마찬가지다.
   사람이 읽고 싶으면 **원문 링크로 보낸다.** 그게 매체에도 우리에게도 맞다.

⚠️ 제목은 그 지역 말로 온다 (포르투갈어·인도네시아어·베트남어).
   번역해서 저장하지 않는다 — 원문을 그대로 두고, 필요하면 앱에서 그때 번역한다.
   미리 번역해 저장하면 "매체가 이렇게 썼다"가 아니라 "우리가 이렇게 옮겼다"가 된다.

⚠️ 매체마다 이용조건이 다르다. Agência Brasil 은 CC BY 3.0 이라 출처를 밝히면
   재사용이 되지만, 나머지는 대개 **링크만** 허용된다. 그래서 전부 링크 방식으로 통일한다.

출력
  s3://<CACHE_BUCKET>/events/regional-news.json
"""

import json
import os
import re
import urllib.request
import xml.etree.ElementTree as ET
from concurrent.futures import ThreadPoolExecutor
from datetime import datetime, timezone
from email.utils import parsedate_to_datetime

import boto3

BUCKET = os.environ["CACHE_BUCKET"]
REGION = os.environ.get("CACHE_REGION") or os.environ.get("AWS_REGION")
DST = "events/regional-news.json"
UA = {"User-Agent": "earthus/0.1 (+globe app; contact dalur@kakao.com)"}
PER_SOURCE = 12          # 매체당 최대. 한 곳이 화면을 다 차지하지 않게 한다.
# ⚠️ 시간제한을 넉넉히 둔다. 로컬에서 되던 allAfrica 가 Lambda(서울)에서 25초를 넘겨
#    통째로 빠진 적이 있다. 아프리카가 한 매체로 줄어들면 그 지역이 얇아진다.

# (지역, 매체, 주소, 언어, 이용조건)
FEEDS = [
    ("아프리카", "allAfrica", "https://allafrica.com/tools/headlines/rdf/latest/headlines.rdf",
     "en", "헤드라인·링크만"),
    ("아프리카", "Africanews", "https://www.africanews.com/feed/rss", "en", "헤드라인·링크만"),
    ("중동", "Al Jazeera", "https://www.aljazeera.com/xml/rss/all.xml", "en", "헤드라인·링크만"),
    ("남미", "Agência Brasil", "https://agenciabrasil.ebc.com.br/rss/ultimasnoticias/feed.xml",
     "pt", "CC BY 3.0 BR — 출처표시"),
    ("남미", "MercoPress", "https://en.mercopress.com/rss/", "en", "헤드라인·링크만"),
    ("동남아", "Antara", "https://www.antaranews.com/rss/terkini.xml", "id", "헤드라인·링크만"),
    ("동남아", "VnExpress", "https://e.vnexpress.net/rss/news.rss", "en", "헤드라인·링크만"),
    ("동남아", "Bangkok Post", "https://www.bangkokpost.com/rss/data/most-recent.xml",
     "en", "헤드라인·링크만"),
    ("오세아니아", "ABC Australia", "https://www.abc.net.au/news/feed/51120/rss.xml",
     "en", "헤드라인·링크만"),
    ("오세아니아", "RNZ", "https://www.rnz.co.nz/rss/national.xml", "en", "헤드라인·링크만"),
    ("오세아니아", "RNZ Pacific", "https://www.rnz.co.nz/rss/pacific.xml", "en", "헤드라인·링크만"),
]

s3 = boto3.client("s3", region_name=REGION)


def clean(t):
    """CDATA·HTML 태그·잉여 공백을 걷어낸다. ⚠️ 제목에도 태그가 섞여 온다."""
    t = re.sub(r"<[^>]+>", "", t or "")
    return re.sub(r"\s+", " ", t).strip()


def iso(s):
    """RFC822 / ISO 어느 쪽이든 UTC ISO 로. 못 읽으면 None — 지어내지 않는다."""
    s = (s or "").strip()
    if not s:
        return None
    try:
        return parsedate_to_datetime(s).astimezone(timezone.utc).strftime("%Y-%m-%dT%H:%M:00Z")
    except Exception:                                    # noqa: BLE001
        pass
    try:
        return (datetime.fromisoformat(s.replace("Z", "+00:00"))
                .astimezone(timezone.utc).strftime("%Y-%m-%dT%H:%M:00Z"))
    except Exception:                                    # noqa: BLE001
        return None


def strip_ns(tag):
    return tag.split("}", 1)[-1] if "}" in tag else tag


def parse(raw):
    """RSS·RDF·Atom 을 한 함수로 읽는다.
    ⚠️ allAfrica 는 RDF, 나머지는 RSS/Atom 이라 태그 이름과 이름공간이 다르다."""
    root = ET.fromstring(raw)
    out = []
    for el in root.iter():
        if strip_ns(el.tag) not in ("item", "entry"):
            continue
        title = link = date = None
        for ch in el:
            n = strip_ns(ch.tag)
            if n == "title" and not title:
                title = clean(ch.text)
            elif n == "link" and not link:
                # Atom 은 <link href="...">, RSS 는 <link>본문</link>
                link = (ch.get("href") or clean(ch.text)) or None
            elif n in ("pubDate", "published", "updated", "date") and not date:
                date = clean(ch.text)
        if title and link:
            out.append({"title": title, "link": link, "utc": iso(date)})
    return out


def fetch(feed):
    region, name, url, lang, lic = feed
    try:
        raw = urllib.request.urlopen(urllib.request.Request(url, headers=UA), timeout=45).read()
    except Exception as e:                               # noqa: BLE001
        return region, name, [], repr(e)[:110]
    try:
        items = parse(raw)
    except Exception as e:                               # noqa: BLE001
        return region, name, [], f"파싱 실패 {repr(e)[:80]}"
    for it in items:
        it.update({"region": region, "source": name, "lang": lang, "_lic": lic})
    return region, name, items[:PER_SOURCE], None


def handler(event, context):
    got, failed, items = {}, {}, []
    with ThreadPoolExecutor(max_workers=6) as ex:
        for region, name, rows, err in ex.map(fetch, FEEDS):
            if err:
                # ⚠️ 어디가 죽었는지 파일에 남긴다. 조용히 빠지면
                #    "그 지역은 원래 뉴스가 없나 보다"로 읽힌다.
                failed[name] = err
                print(f"[news] {name} 실패 — {err}")
                continue
            got[name] = len(rows)
            items.extend(rows)

    if not items:
        raise RuntimeError("한 곳도 못 받았다 — 덮어쓰지 않는다")

    # 최신순. ⚠️ 시각을 못 읽은 것은 뒤로 보내되 버리지 않는다.
    items.sort(key=lambda x: x.get("utc") or "", reverse=True)

    by_region = {}
    for it in items:
        by_region[it["region"]] = by_region.get(it["region"], 0) + 1

    doc = {
        "generated": datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:00Z"),
        "source": "각 지역 매체 RSS (allAfrica · Africanews · Al Jazeera · Agência Brasil · "
                  "MercoPress · Antara · VnExpress · Bangkok Post · ABC · RNZ)",
        "sourceEn": "Regional media RSS feeds",
        "note": {
            "ko": "각 지역 매체가 직접 낸 헤드라인입니다. "
                  "⚠️ 저작권 때문에 **제목과 링크만** 담습니다 — 본문도 요약도 저장하지 않습니다. "
                  "읽으려면 원문 링크로 가야 합니다. "
                  "제목은 매체가 쓴 원문 그대로이며, 번역해서 저장하지 않았습니다.",
            "en": "Headlines published by regional outlets. ⚠️ Only titles and links are stored — "
                  "no article text, no summaries. Follow the link to read. Titles are kept in the "
                  "original language as published.",
        },
        "counts": got,
        "byRegion": by_region,
        "failed": failed,
        "count": len(items),
        "items": items,
    }
    body = json.dumps(doc, ensure_ascii=False, separators=(",", ":")).encode()
    s3.put_object(Bucket=BUCKET, Key=DST, Body=body,
                  ContentType="application/json; charset=utf-8",
                  CacheControl="public, max-age=900")
    print(f"[news] {len(items)}건 · {by_region} · 실패 {list(failed)} · {len(body)/1024:.0f}KB")
    return {"ok": True, "total": len(items), "byRegion": by_region, "failed": failed}
