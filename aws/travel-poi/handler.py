# -*- coding: utf-8 -*-
"""OSM '명소'(박물관·천문대·천문관·아쿠아리움·동물원·관광명소)를 하루 1회 5°칸 정적 파일로 굽는다.

왜 생겼나 (2026-09-24, docs/PAID-APP-LAUNCH-REVIEW-2026-09-24.md D3 · docs/OPEN-METEO-REPLACEMENT-MAP-2026-09-24.md §5)
  v1 '명소' 레이어(prototype/js/layers/travel.js)는 사용자가 확대할 때마다 **브라우저가 공용 Overpass 서버**
  (overpass-api.de)에 질의를 보냈다. 공용 서버는 커뮤니티가 운영한다 — OSM 위키: "Commercial use should use
  self-hosted or paid Overpass servers." 운영자 문서는 앱 이용자의 요청을 **합산해** 본다. 이용자가 늘수록
  질의가 곱해지고, 504 로 멈추는 날엔 레이어가 조용히 비었다(v2 registry 가 '열리지 않는다'고 적은 이유).
  → 서버가 하루 한 번, 칸마다 한 번만 묻는다. 브라우저는 S3 의 작은 파일만 읽는다.

무엇을 만드나
  s3://<CACHE_BUCKET>/app/tourism/poi/index.json          칸 목록 · 칸별 개수 · 받은 시각 · 덮는 나라 · 출처
  s3://<CACHE_BUCKET>/app/tourism/poi/tiles/<칸>.json     칸 하나의 장소(최대 TILE_CAP 개)
  → CloudFront 가 /tourism/* 를 오하이오 app/tourism/ 으로 보낸다(aws/_shared/app-origin.sh APP_KEEP_OHIO).
    브라우저 주소: /tourism/poi/index.json (config.js API.TOURISM + '/poi').

⚠️ 지키는 것
  - **OSM 자료다. "© OpenStreetMap contributors"(ODbL 1.0) 를 색인·칸 파일에 싣는다.** 화면 출처 줄(ui-source.js poi)도 그대로다.
  - 실패한 칸은 **옛 파일을 지우지 않는다** — 외부 장애가 화면을 비우게 두지 않는다(obis-summary 규칙).
  - 전 세계를 한 번에 묻지 않는다. 시장 우선순위(한국·일본·대만·영국·미국 본토) 경계상자를 5°칸으로 나눠
    **가장 오래된 칸부터** 시간 예산 안에서 돈다. 다 못 돌면 다음 날 이어서 돈다.
  - 공용 서버 예절: 칸 사이에 쉬고, 429·504 가 이어지면 그 실행을 멈춘다. 연락처 없는 사용자 에이전트를 쓰지 않는다.
  - 순위는 우리가 '좋다'고 매긴 것이 아니다. 위키데이터·위키백과 연결이 있는 곳, 그다음 드문 종류(천문대·천문관·
    아쿠아리움·동물원·박물관)를 먼저 둔다 — 칸 상한(TILE_CAP)에 걸릴 때 무엇을 남길지의 기계적 규칙일 뿐이다.
"""

from __future__ import annotations

import json
import math
import os
import time
from datetime import datetime, timezone
from urllib.error import HTTPError, URLError
from urllib.parse import urlencode
from urllib.request import Request, urlopen

try:
    import boto3
except ImportError:  # 로컬 단위 시험에서는 AWS SDK 가 필요 없다.
    boto3 = None


BUCKET = os.environ.get("CACHE_BUCKET", "earthus-cache-kr")
REGION = os.environ.get("CACHE_REGION", "us-east-2")
PREFIX = os.environ.get("TRAVEL_POI_PREFIX", "app/tourism/poi")
OVERPASS = os.environ.get("OVERPASS_URL", "https://overpass-api.de/api/interpreter")
USER_AGENT = "earthus-travel-poi/1.0 (+https://earthus.net; daily static extract)"

TILE_DEG = 5
TILE_CAP = 400             # 칸 하나에 남기는 장소 수. 브라우저는 화면 안에서 120개만 그린다(travel.js)
BUDGET_S = 720             # 새 칸을 시작하지 않는 시각. 함수 제한(timeout-seconds.txt 900) 안에서 색인을 쓸 여유를 둔다
PAUSE_S = 3.0              # 칸 사이 쉼 — 공용 서버 예절
QUERY_TIMEOUT_S = 90       # Overpass 쪽 [timeout:…] — 칸 하나(5°) 기준
HTTP_TIMEOUT_S = 120
MAX_CONSECUTIVE_FAILS = 3  # 공용 서버가 연달아 거절하면 그날은 멈춘다(두드리지 않는다)
INDEX_EVERY = 10           # 칸 10개마다 색인을 중간 저장 — 제한 시간에 죽어도 받은 칸은 남는다

# 시장 우선순위(한·일·대·영·미 — 메모리 market-priority-and-menu-order). 앞에 있을수록 먼저 돈다.
# 경계상자는 본토 기준 대략값이다. 섬·해외 영토(알래스카·하와이·오키나와 끝 등)는 아직 덮지 않는다 — 색인이 그 사실을 말한다.
COVERAGE = (
    {"iso": "KR", "ko": "한국", "en": "South Korea", "bbox": (33.0, 124.0, 39.0, 132.0)},
    {"iso": "JP", "ko": "일본", "en": "Japan", "bbox": (24.0, 122.0, 46.0, 146.0)},
    {"iso": "TW", "ko": "대만", "en": "Taiwan", "bbox": (21.0, 119.0, 26.0, 123.0)},
    {"iso": "GB", "ko": "영국", "en": "United Kingdom", "bbox": (49.0, -9.0, 61.0, 2.0)},
    {"iso": "US", "ko": "미국 본토", "en": "Contiguous United States", "bbox": (24.0, -125.0, 50.0, -66.0)},
)

# 레이어 정의는 travel.js 가 그대로 쓴다: tourism=museum|aquarium|zoo|attraction · amenity=planetarium · man_made=observatory
KIND_ORDER = {"observatory": 0, "planetarium": 1, "aquarium": 2, "zoo": 3, "museum": 4, "attraction": 5}


def utc_now():
    return datetime.now(timezone.utc).replace(microsecond=0).isoformat().replace("+00:00", "Z")


def tile_key(south, west):
    """obis-summary 와 같은 이름 규칙 — n35_e125 · s5_w80."""
    key = f"s{abs(south)}" if south < 0 else f"n{south}"
    key += f"_w{abs(west)}" if west < 0 else f"_e{west}"
    return key


def tiles_for_bbox(bbox):
    south, west, north, east = bbox
    out = []
    lat = math.floor(south / TILE_DEG) * TILE_DEG
    while lat < north:
        lon = math.floor(west / TILE_DEG) * TILE_DEG
        while lon < east:
            out.append((int(lat), int(lon)))
            lon += TILE_DEG
        lat += TILE_DEG
    return out


def coverage_tiles(coverage=COVERAGE):
    """우선순위 순서의 칸 목록(겹치는 칸은 한 번). → [{key, s, w, n, e, iso}]"""
    seen, out = set(), []
    for area in coverage:
        for s, w in tiles_for_bbox(area["bbox"]):
            key = tile_key(s, w)
            if key in seen:
                continue
            seen.add(key)
            out.append({"key": key, "s": s, "w": w, "n": s + TILE_DEG, "e": w + TILE_DEG, "iso": area["iso"]})
    return out


def overpass_query(tile):
    bbox = f"{tile['s']},{tile['w']},{tile['n']},{tile['e']}"
    # ⚠️ ["name"] 이 있는 것만 — 브라우저가 이름 없는 점을 버리고 있었다(travel.js filter). 응답을 줄인다.
    #    name:en 만 있는 점은 빠진다(드물다). 그 차이를 알고 받아들였다.
    return (f"[out:json][timeout:{QUERY_TIMEOUT_S}];\n(\n"
            f'  node["tourism"~"^(museum|aquarium|zoo|attraction)$"]["name"]({bbox});\n'
            f'  node["amenity"="planetarium"]["name"]({bbox});\n'
            f'  node["man_made"="observatory"]["name"]({bbox});\n'
            ");\nout body;")


def post_overpass(query, opener=urlopen):
    body = urlencode({"data": query}).encode("utf-8")
    req = Request(OVERPASS, data=body, headers={
        "User-Agent": USER_AGENT,
        "Content-Type": "application/x-www-form-urlencoded",
        "Accept": "application/json",
    })
    with opener(req, timeout=HTTP_TIMEOUT_S) as res:
        return json.loads(res.read().decode("utf-8"))


def kind_of(tags):
    """travel.js 와 같은 분류 — 천문대 > 천문관 > tourism 값."""
    if tags.get("man_made") == "observatory":
        return "observatory"
    if tags.get("amenity") == "planetarium":
        return "planetarium"
    t = tags.get("tourism")
    return t if t in KIND_ORDER else "attraction"


def normalize(elements, tile):
    """Overpass 요소 → 칸 파일의 항목. 칸 밖(경계 겹침)은 버린다 — 이웃 칸과 중복되지 않게 [s, n) × [w, e)."""
    items = []
    for e in elements or []:
        if e.get("type") != "node":
            continue
        tags = e.get("tags") or {}
        name = tags.get("name") or tags.get("name:en")
        lat, lon = e.get("lat"), e.get("lon")
        if not name or lat is None or lon is None:
            continue
        if not (tile["s"] <= lat < tile["n"] and tile["w"] <= lon < tile["e"]):
            continue
        item = {"id": int(e["id"]), "n": name, "la": round(float(lat), 5), "lo": round(float(lon), 5),
                "k": kind_of(tags)}
        en = tags.get("name:en")
        if en and en != name:
            item["ne"] = en
        if tags.get("wikidata") or tags.get("wikipedia"):
            item["w"] = 1
        items.append(item)
    return items


def rank(items):
    """위키 연결 먼저 · 그다음 드문 종류 · 그다음 id(안정). '좋은 곳' 순위가 아니다.

    ⚠️ 종류를 먼저 세우면 도쿄·런던 같은 칸에서 박물관만으로 상한이 차 도쿄타워 같은 명소가 빠진다.
       위키데이터·위키백과 연결은 '여러 사람이 따로 기록할 만큼 알려진 곳'이라는 OSM 안의 기계적 신호다.
    """
    return sorted(items, key=lambda it: (0 if it.get("w") else 1, KIND_ORDER.get(it["k"], 9), it["id"]))


def tile_document(tile, items, fetched_at):
    kept = rank(items)[:TILE_CAP]
    return {
        "schema": "earthus.travel-poi.tile/1",
        "key": tile["key"],
        "bbox": {"south": tile["s"], "west": tile["w"], "north": tile["n"], "east": tile["e"]},
        "fetchedAt": fetched_at,
        "total": len(items),
        "count": len(kept),
        "capped": len(items) > len(kept),
        "attribution": "© OpenStreetMap contributors",
        "license": "ODbL-1.0",
        "licenseUrl": "https://www.openstreetmap.org/copyright",
        "items": kept,
    }


def index_document(tiles_state, generated_at, run_note):
    return {
        "schema": "earthus.travel-poi.index/1",
        "generatedAt": generated_at,
        "tileDeg": TILE_DEG,
        "tileCap": TILE_CAP,
        "tilePath": "tiles/{key}.json",
        "kinds": list(KIND_ORDER),
        "source": "OpenStreetMap via Overpass API (daily server-side extract)",
        "attribution": "© OpenStreetMap contributors",
        "license": "ODbL-1.0",
        "licenseUrl": "https://www.openstreetmap.org/copyright",
        "coverage": [{"iso": a["iso"], "ko": a["ko"], "en": a["en"],
                      "bbox": dict(zip(("south", "west", "north", "east"), a["bbox"]))} for a in COVERAGE],
        "coverageNote": {
            "ko": "한국·일본·대만·영국·미국 본토만 덮습니다. 그 밖의 지역은 아직 준비되지 않았습니다.",
            "en": "Covers South Korea, Japan, Taiwan, the UK and the contiguous US only. Other regions are not ready yet.",
        },
        "run": run_note,
        "tiles": tiles_state,
    }


class Store:
    """S3 읽기·쓰기. 시험은 같은 모양의 가짜를 넣는다."""

    def __init__(self, client=None):
        self.client = client or (boto3.client("s3", region_name=REGION) if boto3 else None)

    def get_json(self, key):
        try:
            obj = self.client.get_object(Bucket=BUCKET, Key=key)
            return json.loads(obj["Body"].read().decode("utf-8"))
        except Exception:  # noqa: BLE001 — 첫 실행에는 색인이 없다
            return None

    def put_json(self, key, doc, cache="public, max-age=3600"):
        body = json.dumps(doc, ensure_ascii=False, separators=(",", ":")).encode("utf-8")
        self.client.put_object(Bucket=BUCKET, Key=key, Body=body,
                               ContentType="application/json; charset=utf-8", CacheControl=cache)
        return len(body)


def plan_order(tiles, previous_state):
    """한 번도 시도하지 않은 칸 → 가장 오래전에 받은(또는 시도한) 칸 순. 같으면 우선순위(목록 순서).

    ⚠️ 실패한 칸은 fetchedAt 이 비어 있다. fetchedAt 만 보면 그 칸이 **매일 맨 앞**에 서고, 무거운 칸(뉴욕·LA 의
       attraction)이 연달아 504 를 내면 MAX_CONSECUTIVE_FAILS 에 걸려 **다른 칸이 영영 갱신되지 않는다.**
       그래서 시도한 시각(lastTriedAt)도 나이로 친다 — 실패한 칸은 그날 시도한 칸이 되어 뒤로 간다.
    """
    # (2026-09-24 정정) `fetchedAt or lastTriedAt` 였다 — 한 번 받은 뒤 실패하기 시작한 칸은 fetchedAt(옛 날짜)이
    #   그대로라 lastTriedAt 을 보지 않고 **매일 맨 앞**에 섰다. 그런 칸 셋이 연달아 504 면 MAX_CONSECUTIVE_FAILS 에 걸려
    #   그날 다른 칸이 하나도 안 돌았다(위 ⚠️ 가 막으려던 바로 그 굶주림). 둘 중 **늦은 쪽**을 나이로 친다.
    #   ISO-8601 Z 문자열이라 문자열 비교가 곧 시각 비교다.
    def age_key(pair):
        pos, tile = pair
        st = (previous_state or {}).get(tile["key"]) or {}
        return (max(st.get("fetchedAt") or "", st.get("lastTriedAt") or ""), pos)
    return [t for _, t in sorted(enumerate(tiles), key=age_key)]


def run(store, fetch=post_overpass, clock=time.monotonic, sleep=time.sleep, now=utc_now):
    tiles = coverage_tiles()
    old_index = store.get_json(f"{PREFIX}/index.json") or {}
    state = {k: dict(v) for k, v in (old_index.get("tiles") or {}).items()}
    # 덮는 목록에서 빠진 칸은 색인에서도 뺀다(파일은 지우지 않는다 — 삭제는 사람이 한다).
    keys = {t["key"] for t in tiles}
    state = {k: v for k, v in state.items() if k in keys}
    for t in tiles:
        st = state.setdefault(t["key"], {"count": 0, "fetchedAt": None})
        # 경계는 매번 다시 적는다 — 브라우저는 색인만 보고 어느 칸을 받을지 정한다(옛 색인에 없더라도).
        st.update({"s": t["s"], "w": t["w"], "n": t["n"], "e": t["e"], "iso": t["iso"]})

    started = clock()
    done, failed, fails_in_row, stopped = 0, 0, 0, None
    for i, tile in enumerate(plan_order(tiles, state)):
        if clock() - started > BUDGET_S:
            stopped = "BUDGET"
            break
        if fails_in_row >= MAX_CONSECUTIVE_FAILS:
            stopped = "OVERPASS_REFUSING"
            break
        st = state[tile["key"]]
        st["lastTriedAt"] = now()
        try:
            data = fetch(overpass_query(tile))
            if data.get("remark") and "runtime error" in str(data.get("remark")):
                # Overpass 는 시간 초과·메모리 초과를 200 + remark 로 준다 — 빈 칸으로 믿으면 옛 파일을 비운다
                raise RuntimeError("OVERPASS_REMARK:" + str(data["remark"])[:120])
            items = normalize(data.get("elements"), tile)
            fetched_at = now()
            doc = tile_document(tile, items, fetched_at)
            if doc["count"]:
                store.put_json(f"{PREFIX}/tiles/{tile['key']}.json", doc)
            st.update({"count": doc["count"], "total": doc["total"], "capped": doc["capped"],
                       "fetchedAt": fetched_at, "lastError": None})
            done += 1
            fails_in_row = 0
        except (HTTPError, URLError, TimeoutError, ValueError, RuntimeError, OSError) as error:
            # ⚠️ 옛 칸 파일·옛 count·옛 fetchedAt 은 그대로 둔다. 실패만 적는다.
            st["lastError"] = f"{type(error).__name__}:{str(error)[:120]}"
            failed += 1
            fails_in_row += 1
            if isinstance(error, HTTPError) and error.code in (429, 504):
                sleep(PAUSE_S * 10)
        if (i + 1) % INDEX_EVERY == 0:
            store.put_json(f"{PREFIX}/index.json",
                           index_document(state, now(), {"done": done, "failed": failed, "partial": True}),
                           cache="public, max-age=600")
        sleep(PAUSE_S)

    note = {"done": done, "failed": failed, "stopped": stopped,
            "never": sum(1 for v in state.values() if not v.get("fetchedAt"))}
    store.put_json(f"{PREFIX}/index.json", index_document(state, now(), note), cache="public, max-age=600")
    return {"ok": True, **note, "tiles": len(tiles)}


def handler(event=None, context=None):
    result = run(Store())
    print(json.dumps(result, ensure_ascii=False))
    return result
