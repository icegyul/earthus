"""Tokyo VAAC 공식 화산재 통보 수집기.

JMA 공개 페이지의 최근 VAA 목록과 원문을 구조화해 저장한다. JMA가 발표한 관측·이동
예보를 보존할 뿐 EARTHUS 경로를 만들지 않는다. 관측 불가와 예보 없음도 그대로 남겨,
후속 계산기가 빈 값을 선으로 바꾸지 못하게 한다.

공개 최신본: events/volcanic-ash-vaac.json
변경 이력: archive/volcanic-ash-vaac/YYYYMMDDHHMMSS.json
"""

from __future__ import annotations

import hashlib
import html
import json
import os
import re
import urllib.parse
import urllib.request
from datetime import datetime, timezone
from html.parser import HTMLParser

import boto3
from botocore.exceptions import ClientError

BUCKET = os.environ.get("CACHE_BUCKET", "earthus-cache-kr")
REGION = os.environ.get("CACHE_REGION", "us-east-2")
LIST_URL = "https://www.data.jma.go.jp/vaac/data/vaac_list.html"
OUTPUT_KEY = "events/volcanic-ash-vaac.json"
ARCHIVE = "archive/volcanic-ash-vaac"
MAX_ROWS = 80
MAX_RETAINED = 500
UA = {"User-Agent": "earthus/0.1 (+https://earthus.net; public-data collector)"}

s3 = boto3.client("s3", region_name=REGION)


def _fetch(url):
    request = urllib.request.Request(url, headers=UA)
    with urllib.request.urlopen(request, timeout=30) as response:
        return response.read().decode("utf-8", errors="replace")


class AdvisoryTableParser(HTMLParser):
    """최근 통보 표에서 데이터 행과 일반 href만 읽는다."""

    def __init__(self):
        super().__init__()
        self.rows = []
        self._row = None
        self._cell = None

    def handle_starttag(self, tag, attrs):
        attributes = dict(attrs)
        if tag == "tr" and "mtx" in attributes.get("class", "").split():
            self._row = []
        elif tag == "td" and self._row is not None:
            self._cell = {"text": [], "href": None}
        elif tag == "a" and self._cell is not None:
            href = attributes.get("href")
            if href and not href.lower().startswith("javascript:"):
                self._cell["href"] = href

    def handle_data(self, data):
        if self._cell is not None:
            self._cell["text"].append(data)

    def handle_endtag(self, tag):
        if tag == "td" and self._row is not None and self._cell is not None:
            self._row.append({
                "text": " ".join("".join(self._cell["text"]).split()),
                "href": self._cell["href"],
            })
            self._cell = None
        elif tag == "tr" and self._row is not None:
            if len(self._row) >= 6:
                self.rows.append(self._row)
            self._row = None


def parse_list(document):
    parser = AdvisoryTableParser()
    parser.feed(document)
    rows = []
    for cells in parser.rows[:MAX_ROWS]:
        try:
            issued = datetime.strptime(cells[0]["text"], "%Y/%m/%d %H:%M:%S").replace(tzinfo=timezone.utc)
        except ValueError:
            continue
        href = cells[5].get("href")
        if not href:
            continue
        rows.append({
            "issuedAt": issued.isoformat().replace("+00:00", "Z"),
            "volcano": cells[2]["text"],
            "area": cells[3]["text"],
            "advisoryNumber": cells[4]["text"],
            "sourceUrl": urllib.parse.urljoin(LIST_URL, href),
        })
    return rows


FIELD = re.compile(
    r"^(DTG|VAAC|VOLCANO|PSN|AREA|SOURCE ELEV|ADVISORY NR|INFO SOURCE|"
    r"ERUPTION DETAILS|OBS VA DTG|OBS VA CLD|FCST VA CLD \+\d+ HR|RMK|NXT ADVISORY):\s*(.*)$"
)


def _plain_text(document):
    document = re.sub(r"<script\b[^>]*>.*?</script>", "", document, flags=re.I | re.S)
    document = re.sub(r"<style\b[^>]*>.*?</style>", "", document, flags=re.I | re.S)
    document = re.sub(r"<(?:br|/p|/div|/pre|/h\d)\b[^>]*>", "\n", document, flags=re.I)
    document = re.sub(r"<[^>]+>", "", document)
    return html.unescape(document).replace("\r", "")


def _fields(document):
    result = {}
    current = None
    for raw in _plain_text(document).splitlines():
        line = " ".join(raw.split())
        if not line or line in {"Volcanic Ash Advisory Text", "Back to Prev Page", "* * *"}:
            continue
        match = FIELD.match(line)
        if match:
            current = match.group(1)
            result[current] = match.group(2).rstrip("=")
        elif current and not line.startswith(("FVFE", "VA ADVISORY")):
            result[current] = f"{result[current]} {line.rstrip('=')}".strip()
    return result


COORDINATE = re.compile(r"\b([NS])(\d{2})(\d{2})\s+([EW])(\d{3})(\d{2})\b")


def _coordinate(raw):
    match = COORDINATE.search(raw or "")
    if not match:
        return None
    lat = int(match.group(2)) + int(match.group(3)) / 60
    lon = int(match.group(5)) + int(match.group(6)) / 60
    if match.group(1) == "S":
        lat *= -1
    if match.group(4) == "W":
        lon *= -1
    return {"lat": round(lat, 5), "lon": round(lon, 5)}


def _polygon(raw):
    return [_coordinate(match.group(0)) for match in COORDINATE.finditer(raw or "")]


def _relative_time(raw, issued):
    match = re.search(r"\b(\d{2})/(\d{2})(\d{2})Z\b", raw or "")
    if not match:
        return None
    day, hour, minute = map(int, match.groups())
    candidates = []
    month_index = issued.year * 12 + issued.month - 1
    for offset in (-1, 0, 1):
        index = month_index + offset
        year, month_zero = divmod(index, 12)
        try:
            candidates.append(datetime(year, month_zero + 1, day, hour, minute, tzinfo=timezone.utc))
        except ValueError:
            continue
    if not candidates:
        return None
    chosen = min(candidates, key=lambda value: abs((value - issued).total_seconds()))
    return chosen.isoformat().replace("+00:00", "Z")


def _flight_levels(raw):
    match = re.search(r"\b(SFC|FL\d{3})/(FL\d{3})\b", raw or "")
    return {"base": match.group(1), "top": match.group(2)} if match else None


def _movement(raw):
    match = re.search(r"\bMOV\s+([NSEW]{1,3})\s+(\d+)KT\b", raw or "")
    return {"direction": match.group(1), "speedKt": int(match.group(2))} if match else None


def parse_advisory(document, seed):
    values = _fields(document)
    issued = datetime.fromisoformat(seed["issuedAt"].replace("Z", "+00:00"))
    volcano_raw = values.get("VOLCANO") or seed["volcano"]
    volcano_match = re.match(r"(.+?)\s+(\d{6})$", volcano_raw)
    volcano = volcano_match.group(1) if volcano_match else seed["volcano"]
    volcano_number = volcano_match.group(2) if volcano_match else None
    observed_raw = values.get("OBS VA CLD")
    forecasts = []
    for key, raw in values.items():
        match = re.match(r"FCST VA CLD \+(\d+) HR", key)
        if not match:
            continue
        forecasts.append({
            "leadHours": int(match.group(1)),
            "validAt": _relative_time(raw, issued),
            "description": raw,
            "polygon": _polygon(raw),
            "flightLevels": _flight_levels(raw),
            "available": "NOT AVBL" not in raw and "NO VA EXP" not in raw,
        })
    forecasts.sort(key=lambda item: item["leadHours"])
    advisory_number = values.get("ADVISORY NR") or seed["advisoryNumber"]
    next_advisory = values.get("NXT ADVISORY")
    if observed_raw and "NOT IDENTIFIABLE" in observed_raw:
        observation_state = "NOT_IDENTIFIABLE"
    elif observed_raw and ("VA CLD" in observed_raw or _polygon(observed_raw)):
        observation_state = "DETECTED_OR_ESTIMATED"
    else:
        observation_state = "UNKNOWN"
    return {
        "id": f"TOKYO:{volcano_number or volcano}:{advisory_number}",
        "issuedAt": seed["issuedAt"],
        "vaac": values.get("VAAC") or "TOKYO",
        "volcano": volcano,
        "volcanoNumber": volcano_number,
        "position": _coordinate(values.get("PSN")),
        "area": values.get("AREA") or seed["area"],
        "sourceElevation": values.get("SOURCE ELEV"),
        "advisoryNumber": advisory_number,
        "infoSource": values.get("INFO SOURCE"),
        "eruptionDetails": values.get("ERUPTION DETAILS"),
        "observedAt": _relative_time(values.get("OBS VA DTG"), issued),
        "observation": {
            "state": observation_state,
            "description": observed_raw,
            "polygon": _polygon(observed_raw),
            "flightLevels": _flight_levels(observed_raw),
            "movement": _movement(observed_raw),
        },
        "forecasts": forecasts,
        "remarks": values.get("RMK"),
        "nextAdvisory": next_advisory,
        "closedByIssuer": bool(next_advisory and "NO FURTHER ADVISORIES" in next_advisory),
        "officialForecastAvailable": any(item["available"] for item in forecasts),
        "sourceUrl": seed["sourceUrl"],
    }


def _existing():
    try:
        body = s3.get_object(Bucket=BUCKET, Key=OUTPUT_KEY)["Body"].read()
        return json.loads(body)
    except ClientError as error:
        if error.response.get("Error", {}).get("Code") in ("NoSuchKey", "404", "AccessDenied"):
            return None
        raise


def build(now=None, list_document=None, fetch=_fetch, previous=None):
    now = now or datetime.now(timezone.utc)
    list_document = list_document if list_document is not None else fetch(LIST_URL)
    seeds = parse_list(list_document)
    previous_items = (previous or {}).get("advisories") or []
    known = {item.get("sourceUrl"): item for item in previous_items if item.get("sourceUrl")}
    fetched = 0
    failed = []
    for seed in seeds:
        if seed["sourceUrl"] in known:
            continue
        try:
            known[seed["sourceUrl"]] = parse_advisory(fetch(seed["sourceUrl"]), seed)
            fetched += 1
        except Exception as error:  # noqa: BLE001 - 한 통보 실패가 전체 수집을 막지 않는다.
            failed.append({"sourceUrl": seed["sourceUrl"], "reason": str(error)[:160]})
    advisories = sorted(known.values(), key=lambda item: item.get("issuedAt") or "", reverse=True)[:MAX_RETAINED]
    stable = json.dumps(advisories, ensure_ascii=False, sort_keys=True, separators=(",", ":")).encode("utf-8")
    return {
        "schemaVersion": 1,
        "generatedAt": now.replace(microsecond=0).isoformat().replace("+00:00", "Z"),
        "source": {
            "name": "Japan Meteorological Agency Tokyo VAAC",
            "url": LIST_URL,
            "license": "Japan Public Data License 1.0 / CC BY 4.0 compatible",
            "attributionKo": "일본 기상청 Tokyo VAAC 자료를 EARTHUS가 구조화함",
            "edited": True,
        },
        "count": len(advisories),
        "newCount": fetched,
        "failedCount": len(failed),
        "failures": failed,
        "contentHash": hashlib.sha256(stable).hexdigest(),
        "advisories": advisories,
        "limits": {
            "ko": "공식 화산재 통보를 구조화한 자료이며 EARTHUS 자체 예보가 아닙니다. NOT_IDENTIFIABLE·NOT_AVBL은 관측 또는 예보가 없다는 뜻으로 선을 만들지 않습니다.",
            "notForecast": True,
        },
    }


def handler(event, context):
    previous = _existing()
    payload = build(previous=previous)
    changed = not previous or payload["contentHash"] != previous.get("contentHash")
    body = json.dumps(payload, ensure_ascii=False, separators=(",", ":")).encode("utf-8")
    s3.put_object(Bucket=BUCKET, Key=OUTPUT_KEY, Body=body,
                  ContentType="application/json; charset=utf-8", CacheControl="public, max-age=900")
    if changed:
        stamp = datetime.now(timezone.utc).strftime("%Y%m%d%H%M%S")
        s3.put_object(Bucket=BUCKET, Key=f"{ARCHIVE}/{stamp}.json", Body=body,
                      ContentType="application/json; charset=utf-8", CacheControl="private, no-store")
    return {"ok": True, "changed": changed, "count": payload["count"],
            "newCount": payload["newCount"], "failedCount": payload["failedCount"]}
