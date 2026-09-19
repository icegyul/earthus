# -*- coding: utf-8 -*-
"""변화 창고 롤업 — INTELLIGENCE-LAYER-PLAN §3 P2(a).

archiver 가 매시 :05 에 쌓는 관측(archive/<dataset>/dt=…/hh=…/part.jsonl.gz)에서
**1h · 6h · 24h · 7d 전의 값과 지금 값의 단순 차**를 층(layer)별로 한 파일에 모은다.
인텔 패킷 v1 의 `change` 절 재료다. 이 파일은 계산만 한다 — S3 를 모른다(읽기·쓰기는 주입).
출력 위치(비공개 archive/intel-change/)와 그 이유는 handler.py 머리말에 있다.

하는 것
  · 지금 값(to)  = 가장 최근 archive 파티션(실행 시각부터 2시간 전까지)의 레코드
  · 그때 값(from) = 기준 시각(to.at − 창)에 **시각(at)이 가장 가까운** 레코드. 허용 오차 밖이면 버린다
  · delta = to − from. 10진수로 뺀다(0.1+0.2 가 0.30000000000000004 가 되지 않게). 그것뿐이다

하지 않는 것 (지어내지 않는다)
  · 평활·보간·이동평균·백분위·평년 대비 — 없다. 평년(baseline)은 PD 결정 대기다(P2(b)·계약 §I L-4)
  · 빈 시각을 이웃 값으로 메우지 않는다. 못 찾으면 그 창을 빼고 **이유 코드**를 남긴다
  · 원형 값(풍향)·범주 값(경보 등급·플레어 등급)의 '차'를 만들지 않는다 — UNSUPPORTED_FIELDS
  · 사건(지진·쓰나미·뉴스)·예보·산불 군집은 다루지 않는다 — UNSUPPORTED_DATASETS

⚠️ 시각(at)은 층마다 뜻이 다르다. 숨기지 않고 atBasis 로 항목마다 적는다.
   buoy     product   ocean/buoys.json 의 generated(ocean-solar 실행 시각). 관측소별 측정 시각은
                      archive 에 없다(ocean-solar 가 OSMC `_t` 를 버린다). 그래서 1h 차가 0 이면
                      '값이 안 변했다'일 수도, '그 관측소가 새로 보고하지 않았다'일 수도 있다 — 못 가른다.
   wind     product   wind/global.json 의 time(Open-Meteo 를 받은 정시). 2026-09-18 부터 3시간마다
                      갱신이라 같은 at 이 세 파티션에 연달아 있다 → 1h 창은 대개 허용 오차 밖으로 빠진다.
   cyclone  advisory  GDACS todate(마지막 회차 시각, 시간대 표기 없는 UTC). 실측 2026-09-19 17:05Z
                      DUJUAN-26 todate 12:00 — 받은 시각이 아니라 기관 회차 시각이다. todate 가 없으면
                      받은 시각(_obs)으로 떨어지고 atBasis=fetched 로 적는다.
   solar    measured  kp = SWPC time_tag(1분 추정 Kp 의 시각), xray = solar/meta.json generated(product).

⚠️ 증거 종류(kind)는 archive 의 `_kind:"observation"` 을 그대로 쓰지 않는다. 그 라벨은 '시간에 따라
   변하는 값'이라는 쌓는 방식의 구분이지 출처의 성격이 아니다. 앱 LAYER_TRUTH
   (prototype/v2-three/js/engine-bridge.js)를 따른다:
     buoy    OFFICIAL_OBSERVATION   ocean/buoys      (engine-bridge.js:181)
     solar   OFFICIAL_OBSERVATION   space/solaract   (engine-bridge.js:153)
     wind    PROVIDER_FORECAST      weather/windgrid (engine-bridge.js:127) — Open-Meteo 모델 '현재값'이다.
             관측이라고 부르면 INTELLIGENCE-BENCHMARK 가 적은 '오표기'를 되풀이한다.
     cyclone OFFICIAL_OBSERVATION   GDACS 가 재배포하는 기관 실황(위치·최대풍속). P1 intel_v1 이 기관
             실황을 같은 종류로 단다. GDACS 는 기관이 아니라 모음처(EC JRC·UN OCHA)라 source 에 적는다.

출력 모양 — 왜 v1 항목을 그대로 쌓지 않나
  부이 ≈1,900곳 × 6값 × 4창, 바람 격자 2,376점 × 4값 × 4창 = 층마다 3만~4만 항목, 수 MB 다.
  그래서 층 파일은 **압축형**(값 순서는 fields, 키마다 to·창별 from/delta)으로 두고,
  `packet_change(doc, key)` 가 그 키 하나의 v1 `change` 절({windows, items})을 그대로 펴 준다.
  펴진 항목은 key·delta·from·to·unit·kind·source·at 을 모두 갖고 intel_contract 를 통과한다
  (tests/test_rollup.py 가 계약 검사기에 직접 넣어 확인한다). 패킷 빌더는 그 결과를 복사만 한다.

창과 허용 오차 (WINDOWS)
  archive 는 한 시간에 파티션 하나(같은 시간 안 재실행은 덮어쓴다)이고 원천 갱신은 30분~6시간이다.
      1h  ±20분   30분 주기 부이·태양은 잡고, 3시간 주기 바람·6시간 회차 태풍은 뺀다
      6h  ±45분
      24h ±60분   기온의 하루 주기 위상이 1시간 넘게 어긋나지 않게
      7d  ±90분   archive 한 시간 결측(실측 7일 164/168회)을 한 번은 견디게, 위상은 1.5시간 안
  실제 두 시각 차(spanMin)를 창마다 함께 적는다 — '6h' 라는 이름보다 그 숫자가 정본이다.
"""
import gzip
import io
import json
import os
import sys
from datetime import datetime, timedelta, timezone
from decimal import Decimal, InvalidOperation

_HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, os.path.join(os.path.dirname(_HERE), "_shared"))
import intel_contract  # noqa: E402  (EVIDENCE_KIND 정본 — 층 표의 kind 를 import 시점에 대조한다)

SCHEMA = "earthus.intel-change/1"
INDEX_SCHEMA = "earthus.intel-change-index/1"

# (이름, 분, 허용 오차 분). 순서가 곧 출력 순서다.
WINDOWS = (("1h", 60, 20), ("6h", 360, 45), ("24h", 1440, 60), ("7d", 10080, 90))
WINDOW_ORDER = tuple(w[0] for w in WINDOWS)

# 지금 값을 찾을 때 거슬러 올라가는 시간 수. 실행 시각의 시간·1시간 전·2시간 전.
# archiver 가 두 시간 넘게 멈췄으면 '지금' 이라고 부를 값이 없다 — 층을 비운다.
TO_SEARCH_H = 3

# archive 파티션 키 — aws/archiver/handler.py put_jsonl 의 f-string 과 같은 모양
# (tests 가 그 소스를 구문으로 읽어 대조한다).
PARTITION_FMT = "archive/{dataset}/dt={h:%Y-%m-%d}/hh={h:%H}/part.jsonl.gz"


# ── 층 표 ─────────────────────────────────────────────────────────────────────
# fields: (출력 키, archive 열 이름, 단위). 단위가 None 이면 unit_col 의 값을 레코드에서 읽는다.
# lag_h : 원천 시각(at)이 T 인 레코드가 archive 에 늦게 들어오는 최대 시간 수. 탐색 범위를 그만큼 뒤로 넓힌다.
LAYERS = {
    "buoy": {
        "dataset": "buoy",
        "kind": "OFFICIAL_OBSERVATION",
        "source": "NOAA NDBC · NOAA OSMC/GTS",
        "atBasis": "product",
        "lag_h": 1,
        "fields": (
            {"key": "waveHeight", "col": "wave_height_m", "unit": "m"},
            {"key": "wavePeriod", "col": "wave_period_s", "unit": "s"},
            {"key": "waterTemp", "col": "water_temp_c", "unit": "°C"},
            {"key": "airTemp", "col": "air_temp_c", "unit": "°C"},
            {"key": "pressure", "col": "pressure_hpa", "unit": "hPa"},
            {"key": "windSpeed", "col": "wind_speed_ms", "unit": "m/s"},
        ),
        "meta": ("lat", "lon"),
    },
    "cyclone": {
        "dataset": "cyclone",
        "kind": "OFFICIAL_OBSERVATION",
        "source": "GDACS (기관 실황 재배포 · CC BY 4.0)",
        "atBasis": "advisory",
        "lag_h": 6,
        "fields": (
            # GDACS severitydata.severity — 단위는 레코드의 severity_unit 을 그대로 쓴다(추정하지 않는다)
            {"key": "maxWind", "col": "severity", "unit": None, "unit_col": "severity_unit"},
            {"key": "centerLat", "col": "lat", "unit": "deg"},
            {"key": "centerLon", "col": "lon", "unit": "deg", "wrap": 360},
        ),
        "meta": ("name",),
    },
    "solar": {
        "dataset": "solar",
        "kind": "OFFICIAL_OBSERVATION",
        "source": "NOAA SWPC",
        "atBasis": "measured",
        "lag_h": 1,
        "fields": (
            {"key": "kp", "col": "kp_index", "unit": "Kp index",
             "source": "NOAA SWPC planetary K (1분 추정값)"},
            {"key": "xrayFlux", "col": "xray_flux_wm2", "unit": "W/m²",
             "source": "NOAA SWPC GOES X-ray 0.1–0.8 nm"},
        ),
        "meta": (),
    },
    "wind": {
        "dataset": "wind",
        "kind": "PROVIDER_FORECAST",
        "source": "Open-Meteo (GFS/ECMWF 모델 현재값)",
        "atBasis": "product",
        "lag_h": 3,
        "fields": (
            {"key": "u", "col": "u_ms", "unit": "m/s"},
            {"key": "v", "col": "v_ms", "unit": "m/s"},
            {"key": "temp", "col": "temp_c", "unit": "°C"},
            {"key": "rh", "col": "rh_pct", "unit": "%"},
        ),
        "meta": (),
    },
}

for _name, _spec in LAYERS.items():
    if _spec["kind"] not in intel_contract.EVIDENCE_KIND:
        raise ValueError("층 %s 의 kind %r 가 EVIDENCE_KIND 밖이다" % (_name, _spec["kind"]))

AT_BASIS_KO = {
    "product": "산출물 생성 시각 — 관측소·격자점별 측정 시각이 아니다",
    "advisory": "기관 회차 시각(GDACS todate, UTC)",
    "fetched": "우리가 받은 시각 — 원천이 시각을 주지 않았다",
    "measured": "원천이 준 측정 시각",
}

# archive 에 있지만 차를 만들지 않는 열. 이유를 같이 둔다 — 조용히 빠진 구멍이 제일 위험하다.
UNSUPPORTED_FIELDS = {
    "buoy": {"wind_dir_deg": "원형 값이다. 단순 차는 359°→1° 를 −358° 로 말한다",
             "_obs(관측소별)": "관측소별 측정 시각은 archive 에 없다 — at 은 산출물 시각이다"},
    "cyclone": {"alert": "범주 값(Green/Orange/Red)이다. 차가 없다",
                "episode": "회차 번호 — 값이 아니라 식별자다(같은 파티션 안 중복 제거에만 쓴다)"},
    "solar": {"flare_class": "범주 값이고 xray_flux_wm2 에서 나온 것이다 — 차는 xrayFlux 로 본다"},
    "wind": {"mslp·rain·cld·vis·soil": "wind/global.json 에는 있지만 archiver 가 쌓지 않는다"},
}

# archiver 가 쌓지만 이 롤업이 다루지 않는 자료. aws/archiver/handler.py COLLECTORS 와 산불 행.
UNSUPPORTED_DATASETS = {
    "quake": "사건(event)이다. 한 번 일어나면 변하지 않는다 — 변화는 건수 세기이지 값의 차가 아니다",
    "tsunami": "사건(event)이다. 경보의 발령·해제는 범주 변화다",
    "news": "사건(event)이고 점수는 우리 채점(EARTHUS_ANALYSIS)이다",
    "forecast": "예보다. 관측과 절대 섞지 않는다(archiver 머리말). 예보끼리의 갱신 차는 다른 질문이다",
    "wildfire": ("행에 공통 도장(_kind·_src·_obs)이 없고 fid 는 우리 군집 id, frp 는 군집 합계다 — "
                 "차가 관측 변화와 군집 규칙 변화를 섞는다. 계획 P2(a) 목록에도 없다"),
}

# 빠진 이유 코드 — 층 파일에는 코드만, 뜻은 여기 한 곳.
REASONS = {
    "NO_RECENT_PARTITION": "최근 %d시간 archive 파티션이 없다(없음/접근불가 — S3 는 없는 키에 403 을 준다). "
                           "archiver 는 행이 0 이면 파일을 만들지 않으므로 태풍은 활동 중인 것이 없을 때도 "
                           "이렇게 된다. 지금 값이 없으니 변화도 없다" % TO_SEARCH_H,
    "NO_PARTITION": "기준 시각 근처 archive 파티션이 하나도 없다(archiver 결측 또는 창보다 짧은 보관)",
    "FROM_MISSING": "근처 파티션은 있지만 이 키가 없다(새로 나타났거나 그때 빠졌다)",
    "FROM_TOO_FAR": "가장 가까운 과거 값의 시각이 허용 오차 밖이다(원천 갱신 간격이 창보다 길다)",
    "NOT_REFRESHED": "기준 시각 근처에는 지금 값과 같은 시각의 값만 있다(원천이 그 사이 갱신되지 않았다)",
    "TIME_UNPARSEABLE": "레코드 시각을 읽지 못했다",
    "READ_ERROR": "archive 파티션을 읽다가 오류가 났다(없음과 구분해 적는다)",
    "DATELINE": "날짜변경선을 넘었다 — 경도 단순 차는 거짓이다",
    "UNIT_MISMATCH": "두 시각의 단위가 다르다 — 빼지 않는다",
}


class PartitionReadError(RuntimeError):
    """파티션이 '없음'이 아니라 읽기 오류다. 없음과 섞지 않는다."""


# ── 시각 ─────────────────────────────────────────────────────────────────────
def iso(t):
    return t.astimezone(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")


def parse_time(value):
    """ISO 문자열 → UTC datetime. 시간대 표기가 없으면 UTC 로 읽는다.

    GDACS todate·SWPC time_tag 는 표기 없는 UTC 다(두 원천 문서). archive 의 _obs 는 Z 를 단다.
    """
    if not isinstance(value, str) or len(value) < 10:
        return None
    s = value.strip().replace("Z", "+00:00")
    try:
        t = datetime.fromisoformat(s)
    except ValueError:
        return None
    if t.tzinfo is None:
        t = t.replace(tzinfo=timezone.utc)
    return t.astimezone(timezone.utc)


def floor_hour(t):
    return t.replace(minute=0, second=0, microsecond=0)


def partition_key(dataset, hour):
    return PARTITION_FMT.format(dataset=dataset, h=hour)


def parse_partition(body):
    """part.jsonl.gz 바이트 → 행 목록. 깨진 줄은 건너뛰고 센다."""
    raw = gzip.GzipFile(fileobj=io.BytesIO(body)).read() if body[:2] == b"\x1f\x8b" else body
    rows, bad = [], 0
    for line in raw.decode("utf-8", "replace").splitlines():
        line = line.strip()
        if not line:
            continue
        try:
            rows.append(json.loads(line))
        except ValueError:
            bad += 1
    return rows, bad


# ── 레코드 → (키, 시각, 기준) ─────────────────────────────────────────────────
def _num(v):
    return isinstance(v, (int, float)) and not isinstance(v, bool)


def _key_of(layer, rec):
    if layer == "buoy":
        return rec.get("station")
    if layer == "cyclone":
        return rec.get("id")
    if layer == "solar":
        if "kp_index" in rec:
            return "kp"
        if "xray_flux_wm2" in rec:
            return "xray"
        return None
    if layer == "wind":
        if _num(rec.get("lat")) and _num(rec.get("lon")):
            return "%g,%g" % (rec["lat"], rec["lon"])
        return None
    return None


def _time_of(layer, rec):
    """(시각, atBasis). 층 표의 atBasis 를 따르되, 태풍은 todate 가 없으면 받은 시각으로 내려간다."""
    if layer == "cyclone":
        t = parse_time(rec.get("to_date"))
        if t is not None:
            return t, "advisory"
        return parse_time(rec.get("_obs")), "fetched"
    if layer == "solar" and "xray_flux_wm2" in rec:
        return parse_time(rec.get("_obs")), "product"
    return parse_time(rec.get("_obs")), LAYERS[layer]["atBasis"]


def _episode(rec):
    try:
        return int(rec.get("episode"))
    except (TypeError, ValueError):
        return -1


def index_rows(layer, rows):
    """파티션 행 → {키: (시각, 기준, 레코드)}. 같은 키가 여럿이면 하나만 남긴다.

    ⚠️ 태풍: GDACS 는 같은 eventid 를 회차별 Point 여러 개로 줄 수 있다(aws/gdacs-tc/handler.py
       compact 주석). archiver 는 거르지 않고 다 쌓는다 → 회차(episode)가 가장 큰 것을 쓴다.
    """
    out, unparseable = {}, 0
    for rec in rows:
        if not isinstance(rec, dict):
            continue
        key = _key_of(layer, rec)
        if key is None:
            continue
        t, basis = _time_of(layer, rec)
        if t is None:
            unparseable += 1
            continue
        key = str(key)
        prev = out.get(key)
        if prev is not None:
            if layer == "cyclone" and _episode(rec) < _episode(prev[2]):
                continue
            if layer != "cyclone" and t < prev[0]:
                continue
        out[key] = (t, basis, rec)
    return out, unparseable


# ── 값·차 ────────────────────────────────────────────────────────────────────
def exact_delta(to, frm):
    """to − from 을 10진수로 뺀다. 표현 오차를 보태지 않는다(0.3 은 0.3)."""
    try:
        d = Decimal(repr(to)) - Decimal(repr(frm))
    except (InvalidOperation, ValueError):
        return None
    out = float(d)
    return 0.0 if out == 0 else out


def _field_unit(field, rec):
    if field.get("unit") is not None:
        return field["unit"]
    u = rec.get(field.get("unit_col") or "")
    return u if isinstance(u, str) and u.strip() else None


def _values(fields, rec):
    return [rec.get(f["col"]) if _num(rec.get(f["col"])) else None for f in fields]


def _deltas(fields, to_rec, from_rec, to_vals, from_vals):
    """창 하나의 차 목록과 필드별 주석(코드)."""
    deltas, notes = [], {}
    for i, f in enumerate(fields):
        a, b = to_vals[i], from_vals[i]
        if a is None or b is None:
            deltas.append(None)
            continue
        if f.get("unit") is None:
            ua, ub = _field_unit(f, to_rec), _field_unit(f, from_rec)
            if ua is None or ua != ub:
                deltas.append(None)
                notes[f["key"]] = "UNIT_MISMATCH"
                continue
        d = exact_delta(a, b)
        if d is not None and f.get("wrap") and abs(d) > f["wrap"] / 2.0:
            deltas.append(None)
            notes[f["key"]] = "DATELINE"
            continue
        deltas.append(d)
    return deltas, notes


# ── 층 하나 ───────────────────────────────────────────────────────────────────
class _Partitions(object):
    """파티션 읽기 캐시. reader(key) → bytes | None(없음). 그 밖의 예외는 READ_ERROR 로 적는다."""

    def __init__(self, reader, layer):
        self.reader, self.layer = reader, layer
        self.dataset = LAYERS[layer]["dataset"]
        self.cache, self.errors, self.bad_lines, self.unparseable = {}, [], 0, 0

    def get(self, hour):
        """{키: (시각, 기준, 레코드)} 또는 None(없음/오류)."""
        if hour in self.cache:
            return self.cache[hour]
        key = partition_key(self.dataset, hour)
        try:
            body = self.reader(key)
        except Exception as exc:                              # noqa: BLE001
            self.errors.append({"key": key, "error": ("%s: %s" % (type(exc).__name__, exc))[:200]})
            body = None
        idx = None
        if body is not None:
            rows, bad = parse_partition(body)
            self.bad_lines += bad
            idx, unp = index_rows(self.layer, rows)
            self.unparseable += unp
        self.cache[hour] = idx
        return idx


def _nearest(cands, target, before):
    """target 에 가장 가까운 후보(시각, 기준, 레코드). 같은 거리면 이른 쪽. before 이상은 제외."""
    best = None
    for c in cands:
        if c[0] >= before:
            continue
        gap = abs((c[0] - target).total_seconds())
        if best is None or gap < best[0] or (gap == best[0] and c[0] < best[1][0]):
            best = (gap, c)
    return best


def build_layer(layer, now, reader):
    """층 하나의 변화 문서. reader(key) → part.jsonl.gz 바이트 또는 None."""
    spec = LAYERS[layer]
    fields = spec["fields"]
    parts = _Partitions(reader, layer)
    doc = {
        "schema": SCHEMA,
        "layer": layer,
        "dataset": spec["dataset"],
        "generated": iso(now),
        "kind": spec["kind"],
        "source": spec["source"],
        "atBasis": spec["atBasis"],
        "atBasisKo": AT_BASIS_KO,
        "fields": [{k: v for k, v in f.items() if k in ("key", "col", "unit", "unit_col", "source")}
                   for f in fields],
        "windows": {name: {"minutes": minutes, "toleranceMin": tol} for name, minutes, tol in WINDOWS},
        "method": "delta = to − from (10진 뺄셈). 평활·보간·기준선 없음",
        "unsupportedFields": UNSUPPORTED_FIELDS.get(layer, {}),
    }

    now_h = floor_hour(now)
    to_hour, to_idx = None, None
    for back in range(TO_SEARCH_H):
        h = now_h - timedelta(hours=back)
        idx = parts.get(h)
        if idx:
            to_hour, to_idx = h, idx
            break
    if to_idx is None:
        code = "READ_ERROR" if parts.errors else "NO_RECENT_PARTITION"
        doc.update({"status": "omitted", "reason": code, "keys": {},
                    "summary": {"keys": 0}, "reasons": {code: REASONS[code]}})
        if parts.errors:
            doc["readErrors"] = parts.errors
        return doc

    first = next(iter(to_idx.values()))[2]
    doc["sourceId"] = first.get("_src")
    doc["license"] = first.get("_lic")
    doc["toPartition"] = partition_key(spec["dataset"], to_hour)

    keys = {}
    for k in sorted(to_idx):
        t, basis, rec = to_idx[k]
        blk = {"to": {"at": iso(t), "v": _values(fields, rec)}, "w": {}}
        if basis != spec["atBasis"]:
            blk["atBasis"] = basis
        units = {f["key"]: _field_unit(f, rec) for f in fields if f.get("unit") is None}
        if units:
            blk["u"] = units
        meta = {m: rec.get(m) for m in spec["meta"] if rec.get(m) is not None}
        if meta:
            blk["meta"] = meta
        keys[k] = blk

    summary = {"keys": len(keys), "windows": {}}
    used = set()
    for name, minutes, tol in WINDOWS:
        width = timedelta(minutes=minutes)
        slack = timedelta(minutes=tol)
        # 키마다 기준 시각이 다를 수 있다(태양 kp·xray, 태풍 회차). 필요한 시간만 모아 읽는다.
        targets = {k: to_idx[k][0] - width for k in keys}
        hours = set()
        for tgt in set(targets.values()):
            h = floor_hour(tgt - slack)
            # 지금 값 파티션과 그 뒤는 보지 않는다 — 거기 있는 것은 지금 값 자신이다
            last = min(floor_hour(tgt + slack) + timedelta(hours=spec["lag_h"]),
                       to_hour - timedelta(hours=1))
            while h <= last:
                hours.add(h)
                h += timedelta(hours=1)
        cands, seen_any, errored = {}, False, False
        for h in sorted(hours):
            idx = parts.get(h)
            if idx is None:
                errored = errored or any(e["key"] == partition_key(spec["dataset"], h) for e in parts.errors)
                continue
            seen_any = True
            for k, c in idx.items():
                cands.setdefault(k, []).append(c)
        ok, omitted = 0, {}
        for k, blk in keys.items():
            to_t, _b, to_rec = to_idx[k]
            if not seen_any:
                code = "READ_ERROR" if errored else "NO_PARTITION"
                blk.setdefault("omit", {})[name] = {"code": code}
            else:
                mine = cands.get(k, ())
                best = _nearest(mine, targets[k], to_t)
                if best is None:
                    # 키는 있는데 전부 지금 값과 같은(또는 늦은) 시각이면 '없다'가 아니라 '갱신 안 됐다'다
                    code = "NOT_REFRESHED" if mine else "FROM_MISSING"
                    blk.setdefault("omit", {})[name] = {"code": code}
                elif best[0] > tol * 60:
                    code = "FROM_TOO_FAR"
                    blk.setdefault("omit", {})[name] = {"code": code, "nearestMin": round(best[0] / 60)}
                else:
                    code = None
                    ft, fbasis, frec = best[1]
                    fvals = _values(fields, frec)
                    deltas, notes = _deltas(fields, to_rec, frec, blk["to"]["v"], fvals)
                    wblk = {"at": iso(ft), "spanMin": round((to_t - ft).total_seconds() / 60),
                            "v": fvals, "d": deltas}
                    if fbasis != blk.get("atBasis", spec["atBasis"]):
                        wblk["atBasis"] = fbasis
                    if notes:
                        wblk["notes"] = notes
                        used.update(notes.values())
                    blk["w"][name] = wblk
                    ok += 1
            if code:
                omitted[code] = omitted.get(code, 0) + 1
                used.add(code)
        summary["windows"][name] = {"ok": ok, "omitted": omitted}

    doc["status"] = "ok"
    doc["keys"] = keys
    doc["summary"] = summary
    doc["reasons"] = {c: REASONS[c] for c in sorted(used)}
    if parts.errors:
        doc["readErrors"] = parts.errors
    if parts.bad_lines or parts.unparseable:
        doc["summary"]["skippedRows"] = {"badJson": parts.bad_lines, "timeUnparseable": parts.unparseable}
    return doc


def build_all(now, reader, layers=None):
    """{층: 문서}. 한 층이 깨져도 나머지는 만든다 — 깨진 층은 status=error 문서로 남긴다."""
    out = {}
    for layer in (layers or tuple(LAYERS)):
        if layer not in LAYERS:
            continue
        try:
            out[layer] = build_layer(layer, now, reader)
        except Exception as exc:                              # noqa: BLE001
            out[layer] = {"schema": SCHEMA, "layer": layer, "generated": iso(now), "status": "error",
                          "reason": ("%s: %s" % (type(exc).__name__, exc))[:300], "keys": {}}
    return out


def build_index(now, docs, keys_by_layer, sizes=None):
    """층 파일 목록. 무엇을 만들었고 무엇을 왜 안 만들었는지 한 장에."""
    layers = {}
    for layer, doc in docs.items():
        row = {"key": keys_by_layer.get(layer), "status": doc.get("status"),
               "kind": doc.get("kind"), "keys": len(doc.get("keys") or {})}
        if doc.get("reason"):
            row["reason"] = doc["reason"]
        if doc.get("toPartition"):
            row["toPartition"] = doc["toPartition"]
        ats = [b["to"]["at"] for b in (doc.get("keys") or {}).values()]
        if ats:
            row["toAt"] = {"min": min(ats), "max": max(ats)}
        if doc.get("summary", {}).get("windows"):
            row["windows"] = {w: s["ok"] for w, s in doc["summary"]["windows"].items()}
        if sizes and layer in sizes:
            row["bytes"] = sizes[layer]
        layers[layer] = row
    return {
        "schema": INDEX_SCHEMA,
        "generated": iso(now),
        "windows": {name: {"minutes": minutes, "toleranceMin": tol} for name, minutes, tol in WINDOWS},
        "layers": layers,
        "unsupportedDatasets": UNSUPPORTED_DATASETS,
        "note": ("관측값의 단순 차만 담는다. 평활·보간·평년 대비 없음. 빠진 창은 층 파일의 omit·reasons 에 "
                 "이유가 있다. v1 change 절은 rollup.packet_change(doc, key) 로 편다."),
    }


# ── 패킷 빌더 쪽 — 압축형 → v1 change 절 ──────────────────────────────────────
def packet_items(doc, key, windows=WINDOW_ORDER):
    """키 하나의 v1 `change.items`. 차가 없는 값(한쪽 null·단위 불일치·날짜변경선)은 항목을 만들지 않는다."""
    blk = (doc.get("keys") or {}).get(key)
    if not blk:
        return []
    items = []
    for name in windows:
        w = blk["w"].get(name)
        if not w:
            continue
        for i, f in enumerate(doc["fields"]):
            d = w["d"][i]
            if d is None:
                continue
            unit = f.get("unit") or (blk.get("u") or {}).get(f["key"])
            item = {
                "key": f["key"], "window": name,
                "delta": d, "from": w["v"][i], "to": blk["to"]["v"][i],
                "unit": unit, "kind": doc["kind"],
                "source": f.get("source") or doc["source"],
                "at": blk["to"]["at"], "since": w["at"], "spanMin": w["spanMin"],
                "atBasis": blk.get("atBasis") or doc["atBasis"],
            }
            if w.get("atBasis"):
                item["sinceBasis"] = w["atBasis"]      # 두 시각의 뜻이 다르면 숨기지 않는다
            items.append(item)
    return items


def packet_change(doc, key, windows=WINDOW_ORDER):
    """v1 `change` 절 {windows, items}. 만들 게 없으면 (None, 이유) — 패킷은 coverage.missing 에 이유를 적는다."""
    items = packet_items(doc, key, windows)
    if not items:
        return None, missing_reason(doc, key, windows)
    blk = doc["keys"][key]
    wins = {}
    for name in windows:
        w = blk["w"].get(name)
        if w and any(it["window"] == name for it in items):
            wins[name] = {"since": w["at"], "until": blk["to"]["at"], "spanMin": w["spanMin"],
                          "toleranceMin": doc["windows"][name]["toleranceMin"]}
    return {"windows": wins, "items": items}, None


def missing_reason(doc, key, windows=WINDOW_ORDER):
    """change 절을 못 만든 이유 한 줄(coverage.missing.reason 용)."""
    if doc.get("status") != "ok":
        return "변화 창고 %s: %s" % (doc.get("layer"), REASONS.get(doc.get("reason"), doc.get("reason")))
    blk = (doc.get("keys") or {}).get(key)
    if not blk:
        return "변화 창고 %s 에 이 대상(%s)의 지금 값이 없다" % (doc.get("layer"), key)
    parts = []
    for name in windows:
        om = (blk.get("omit") or {}).get(name)
        if om:
            parts.append("%s %s" % (name, REASONS.get(om["code"], om["code"])))
        elif blk["w"].get(name):
            parts.append("%s 두 시각 중 한쪽 값이 비었다" % name)
    return "; ".join(parts) or "변화를 계산할 값이 없다"
