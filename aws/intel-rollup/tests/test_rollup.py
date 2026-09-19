# -*- coding: utf-8 -*-
"""변화 창고 롤업(P2(a)) 시험 — 네트워크·자격증명 없이 돈다.

⚠️ 픽스처는 **합성**이다. archive/ 는 비공개 접두사라 실물을 받을 수 없다. 대신 archiver 의
   stamp()·put_jsonl()·collect_*() 가 만드는 모양을 한 줄씩 그대로 옮겨 JSONL.gz 를 만든다
   (aws/archiver/handler.py:77 put_jsonl · :117 stamp · :205~283 collect_buoys/cyclones/solar/wind).
   모양이 어긋나면 안 되므로 ArchiverDriftTests 가 archiver 소스를 구문으로 읽어 대조한다.
   시각 감각(매시 :05 실행, 태양 kp 1분 time_tag, GDACS todate)은 2026-09-19 공개 파일
   (events/history.json · events/cyclone-tracks.json · solar/meta.json)에서 확인한 것이다.

지키는 것
  · 차는 두 관측값의 10진 뺄셈뿐이다(평활·보간 없음) — 1h·6h·24h·7d 가 정확히 맞는다
  · 기준 시각 근처 파티션이 없거나 허용 오차 밖이면 그 창을 빼고 이유 코드를 남긴다
  · 한쪽 값이 null 이면 그 값의 항목을 만들지 않는다(0 으로 메우지 않는다)
  · 바람(3시간 갱신)은 1h 가 빠지고 6h 는 남는다 · 증거 종류는 PROVIDER_FORECAST
  · 태풍은 회차 시각(todate) 기준 · 같은 파티션의 중복 회차는 큰 쪽 · 날짜변경선 경도 차는 만들지 않는다
  · 펴낸 change 절이 인텔 패킷 v1 계약(intel_contract)을 그대로 통과한다
  · 쓰기는 비공개 archive/intel-change/ 뿐이고 write_policy 가 그것을 증명한다
"""
import ast
import gzip
import importlib.util
import io
import json
import os
import pathlib
import re
import sys
import unittest
from datetime import datetime, timedelta, timezone

HERE = pathlib.Path(__file__).resolve().parent
FUNC = HERE.parent
AWS = FUNC.parent
REPO = AWS.parent
sys.path.insert(0, str(FUNC))
sys.path.insert(0, str(AWS / "_shared"))
import rollup  # noqa: E402
import intel_contract  # noqa: E402
import publication_privacy as priv  # noqa: E402
import write_path as wpath  # noqa: E402
import write_policy as wpol  # noqa: E402

NOW = datetime(2026, 9, 19, 17, 20, tzinfo=timezone.utc)      # 롤업 실행 (archiver 는 매시 :05)
H17 = NOW.replace(minute=0)


def Z(t):
    return t.strftime("%Y-%m-%dT%H:%M:%SZ")


# ── archiver 모양 그대로 ──────────────────────────────────────────────────────
# aws/archiver/handler.py SOURCES 와 같은 값
SOURCES = {"buoy": ("ndbc-osmc", "US-Gov-Public-Domain"), "cyclone": ("gdacs", "CC-BY-4.0"),
           "solar": ("noaa-swpc", "US-Gov-Public-Domain"), "wind": ("open-meteo", "UNVERIFIED")}


def stamp(rec, dataset, kind, now, obs_time=None):
    """aws/archiver/handler.py:117 stamp() 와 같은 모양."""
    src, lic = SOURCES.get(dataset, (dataset, "UNVERIFIED"))
    return {"_v": 1, "_ds": dataset, "_kind": kind, "_src": src, "_lic": lic,
            "_obs": obs_time or now.strftime("%Y-%m-%dT%H:%M:%SZ"),
            "_fetched": now.strftime("%Y-%m-%dT%H:%M:%SZ"), **rec}


def jsonl_gz(rows):
    """aws/archiver/handler.py:77 put_jsonl 과 같은 바이트 모양(GzipFile mtime=0, 한 줄 한 행)."""
    buf = io.BytesIO()
    with gzip.GzipFile(fileobj=buf, mode="wb", mtime=0) as gz:
        for r in rows:
            gz.write((json.dumps(r, ensure_ascii=False, separators=(",", ":")) + "\n").encode())
    return buf.getvalue()


class Archive(object):
    """archive/ 를 흉내 낸 바이트 저장소. reader(key) → bytes | None."""

    def __init__(self):
        self.objects = {}

    def put(self, dataset, run, rows):
        # archiver 의 키: f"archive/{dataset}/dt={now:%Y-%m-%d}/hh={now:%H}/part.jsonl.gz"
        key = f"archive/{dataset}/dt={run:%Y-%m-%d}/hh={run:%H}/part.jsonl.gz"
        if rows:                                  # 행이 없으면 archiver 는 파일을 만들지 않는다
            self.objects[key] = jsonl_gz(rows)

    def drop(self, dataset, hour):
        self.objects.pop(rollup.partition_key(dataset, hour), None)

    def reader(self, key):
        return self.objects.get(key)


def buoy_row(run, generated, sid, lat, lon, **vals):
    """collect_buoys() 한 행 — 관측소별 시각은 없다. _obs 는 buoys.json 의 generated 다."""
    return stamp({
        "station": sid, "lat": lat, "lon": lon,
        "wave_height_m": vals.get("wvht"), "wave_period_s": vals.get("dpd"),
        "water_temp_c": vals.get("wtmp"), "air_temp_c": vals.get("atmp"),
        "pressure_hpa": vals.get("pres"),
        "wind_speed_ms": vals.get("wspd"), "wind_dir_deg": vals.get("wdir"),
        "source": "NDBC",
    }, "buoy", "observation", run, obs_time=generated)


def cyclone_row(run, eid, name, lon, lat, episode, to_date, sev, unit="km/h"):
    """collect_cyclones() 한 행 — archiver 는 obs_time 을 넘기지 않는다(_obs = 받은 시각)."""
    return stamp({
        "id": str(eid), "name": name, "lon": lon, "lat": lat,
        "alert": "Green", "episode": episode,
        "from_date": "2026-09-10T00:00:00", "to_date": to_date,
        "severity": sev, "severity_unit": unit, "source": "GDACS",
    }, "cyclone", "observation", run)


def solar_rows(run, meta_generated, flux, kp, kp_time_tag):
    """collect_solar() 두 행 — 플레어(meta.json generated)와 kp(SWPC time_tag, 시간대 표기 없음)."""
    return [
        stamp({"flare_class": "B2.9", "xray_flux_wm2": flux, "source": "NOAA SWPC / NASA SDO"},
              "solar", "observation", run, obs_time=meta_generated),
        stamp({"kp_index": float(kp), "source": "NOAA SWPC"},
              "solar", "observation", run, obs_time=kp_time_tag),
    ]


def wind_rows(run, time_iso, grid):
    """collect_wind() — 격자점 한 행씩. grid: [(lat, lon, u, v, t, rh)]."""
    return [stamp({"lat": lat, "lon": lon, "u_ms": u, "v_ms": v, "temp_c": t, "rh_pct": rh,
                   "source": "Open-Meteo"}, "wind", "observation", run, obs_time=time_iso)
            for lat, lon, u, v, t, rh in grid]


def hours_back(n):
    """H17 부터 n 시간 전까지 archiver 실행 시각(매시 :05) — 오래된 것부터."""
    return [H17 - timedelta(hours=k) + timedelta(minutes=5) for k in range(n, -1, -1)]


def _i(run):
    """H17 기준 몇 시간째인가 (과거는 음수)."""
    return int(round((run.replace(minute=0) - H17).total_seconds() / 3600))


def buoy_archive(stations=("46001", "22101"), span_h=170):
    """부이 값이 시간마다 일정하게 변하는 archive. 1h 차가 정확히 알려진 값이 되게."""
    a = Archive()
    for run in hours_back(span_h):
        i = _i(run)
        gen = Z(run.replace(minute=0))              # ocean-solar 가 정시에 만든 buoys.json
        rows = []
        for n, sid in enumerate(stations):
            wtmp = round(20.0 + 0.1 * i, 1)
            if sid == "22101" and i == -24:
                wtmp = None                          # 하루 전 그 시각에 수온이 비었다
            rows.append(buoy_row(run, gen, sid, 37.0 + n, 130.0 + n,
                                 wvht=round(2.0 + 0.01 * i, 2), dpd=8.0, wtmp=wtmp,
                                 atmp=round(15.0 + 0.1 * i, 1), pres=1010.0, wspd=5.0, wdir=350.0))
        a.put("buoy", run, rows)
    return a


def wind_archive(grid_points, span_h=170):
    """바람 격자 — 2026-09-18 부터 3시간마다 갱신. 같은 time 이 세 파티션에 연달아 쌓인다."""
    a = Archive()
    for run in hours_back(span_h):
        base = run.replace(minute=0)
        prod = base - timedelta(hours=base.hour % 3)          # 00·03·06·… 정시 산출물
        k = int(round((prod - H17).total_seconds() / 3600))
        grid = [(lat, lon, round(1.0 + 0.5 * (k // 3), 1), -2.0, round(10.0 + 0.1 * k, 1), 60)
                for lat, lon in grid_points]
        a.put("wind", run, wind_rows(run, Z(prod), grid))
    return a


# ─────────────────────────────────────────────────────────────────────────────
class BuoyTests(unittest.TestCase):
    def setUp(self):
        self.doc = rollup.build_layer("buoy", NOW, buoy_archive().reader)

    def test_지금_값은_가장_최근_파티션이다(self):
        d = self.doc
        self.assertEqual("ok", d["status"])
        self.assertEqual("archive/buoy/dt=2026-09-19/hh=17/part.jsonl.gz", d["toPartition"])
        self.assertEqual("2026-09-19T17:00:00Z", d["keys"]["46001"]["to"]["at"])
        self.assertEqual("OFFICIAL_OBSERVATION", d["kind"])
        self.assertEqual("ndbc-osmc", d["sourceId"])
        self.assertEqual("US-Gov-Public-Domain", d["license"])

    def test_네_창의_차가_정확하다(self):
        items = rollup.packet_items(self.doc, "46001")
        got = {(it["key"], it["window"]): it for it in items}
        # 파고 0.01 m/h · 수온·기온 0.1 °C/h — 10진 뺄셈이라 표현 오차가 없다
        for win, hours in (("1h", 1), ("6h", 6), ("24h", 24), ("7d", 168)):
            self.assertEqual(round(0.01 * hours, 2), got[("waveHeight", win)]["delta"], win)
            self.assertEqual(round(0.1 * hours, 1), got[("airTemp", win)]["delta"], win)
            self.assertEqual(hours * 60, got[("airTemp", win)]["spanMin"], win)
            self.assertEqual(0.0, got[("pressure", win)]["delta"], win)
        wh = got[("waveHeight", "6h")]
        self.assertEqual((1.94, 2.0), (wh["from"], wh["to"]))
        self.assertEqual("2026-09-19T11:00:00Z", wh["since"])
        self.assertEqual("2026-09-19T17:00:00Z", wh["at"])
        self.assertEqual("m", wh["unit"])
        self.assertEqual("product", wh["atBasis"])

    def test_풍향은_차를_만들지_않는다(self):
        keys = {f["col"] for f in self.doc["fields"]}
        self.assertNotIn("wind_dir_deg", keys)
        self.assertIn("wind_dir_deg", self.doc["unsupportedFields"])

    def test_한쪽_값이_비면_그_값만_빠진다(self):
        items = rollup.packet_items(self.doc, "22101", ("24h",))
        keys = {it["key"] for it in items}
        self.assertNotIn("waterTemp", keys)             # 하루 전 수온이 null
        self.assertIn("airTemp", keys)                  # 나머지는 그대로
        blk = self.doc["keys"]["22101"]["w"]["24h"]
        idx = [f["key"] for f in self.doc["fields"]].index("waterTemp")
        self.assertIsNone(blk["v"][idx])
        self.assertIsNone(blk["d"][idx])

    def test_기준_시각_근처_파티션이_없으면_창을_뺀다(self):
        a = buoy_archive()
        for h in (10, 11, 12):                           # 6h 기준 11:00 ±45분 + 늦게 들어옴 1시간
            a.drop("buoy", H17.replace(hour=h))
        d = rollup.build_layer("buoy", NOW, a.reader)
        self.assertEqual({"code": "NO_PARTITION"}, d["keys"]["46001"]["omit"]["6h"])
        self.assertNotIn("6h", d["keys"]["46001"]["w"])
        self.assertIn("1h", d["keys"]["46001"]["w"])
        self.assertIn("NO_PARTITION", d["reasons"])
        self.assertEqual({"NO_PARTITION": 2}, d["summary"]["windows"]["6h"]["omitted"])
        change, why = rollup.packet_change(d, "46001", ("6h",))
        self.assertIsNone(change)
        self.assertIn("파티션이 하나도 없다", why)

    def test_허용_오차_밖이면_뺀다(self):
        a = Archive()
        for run in hours_back(3):
            gen = run.replace(minute=0)
            if run.hour == 16:
                gen = gen - timedelta(minutes=35)        # ocean-solar 가 늦어 15:25 산출물이 16시에 쌓였다
            if run.hour == 15:
                gen = gen - timedelta(minutes=40)
            a.put("buoy", run, [buoy_row(run, Z(gen), "46001", 37, 130, wvht=2.0)])
        d = rollup.build_layer("buoy", NOW, a.reader)
        self.assertEqual({"code": "FROM_TOO_FAR", "nearestMin": 35}, d["keys"]["46001"]["omit"]["1h"])

    def test_새_관측소는_과거_값이_없다(self):
        a = buoy_archive()
        a.put("buoy", H17 + timedelta(minutes=5),
              [buoy_row(H17, Z(H17), sid, 37, 130, wvht=2.0) for sid in ("46001", "99999")])
        d = rollup.build_layer("buoy", NOW, a.reader)
        self.assertEqual("FROM_MISSING", d["keys"]["99999"]["omit"]["1h"]["code"])

    def test_archiver_가_멈췄으면_층을_비운다(self):
        a = buoy_archive()
        for k in range(0, 3):
            a.drop("buoy", H17 - timedelta(hours=k))
        d = rollup.build_layer("buoy", NOW, a.reader)
        self.assertEqual("omitted", d["status"])
        self.assertEqual("NO_RECENT_PARTITION", d["reason"])
        self.assertEqual({}, d["keys"])
        change, why = rollup.packet_change(d, "46001")
        self.assertIsNone(change)
        self.assertIn("archive 파티션이 없다", why)


class WindTests(unittest.TestCase):
    GRID = [(35.0, 125.0), (-80.0, -180.0)]

    def setUp(self):
        self.a = wind_archive(self.GRID)
        self.doc = rollup.build_layer("wind", NOW, self.a.reader)

    def test_모델_현재값은_관측이_아니다(self):
        self.assertEqual("PROVIDER_FORECAST", self.doc["kind"])
        self.assertEqual("UNVERIFIED", self.doc["license"])
        self.assertIn("35,125", self.doc["keys"])
        self.assertIn("-80,-180", self.doc["keys"])

    def test_3시간_갱신이면_1h_는_빠지고_6h_는_남는다(self):
        blk = self.doc["keys"]["35,125"]
        self.assertEqual("2026-09-19T15:00:00Z", blk["to"]["at"])        # 17시 파티션의 산출물은 15시
        self.assertEqual({"code": "FROM_TOO_FAR", "nearestMin": 120}, blk["omit"]["1h"])
        w6 = blk["w"]["6h"]
        self.assertEqual(("2026-09-19T09:00:00Z", 360), (w6["at"], w6["spanMin"]))
        temp = [f["key"] for f in self.doc["fields"]].index("temp")
        self.assertEqual(0.6, w6["d"][temp])
        self.assertEqual(1.0, w6["d"][0])                                  # u: 3시간마다 +0.5
        self.assertEqual(0.0, w6["d"][1])
        for win in ("24h", "7d"):
            self.assertIn(win, blk["w"])

    def test_갱신이_안_된_구간만_있으면_그렇게_말한다(self):
        for h in (13, 14):
            self.a.drop("wind", H17.replace(hour=h))
        d = rollup.build_layer("wind", NOW, self.a.reader)
        self.assertEqual({"code": "NOT_REFRESHED"}, d["keys"]["35,125"]["omit"]["1h"])


def cyclone_archive():
    """태풍 두 개. 기관 회차는 6시간마다(00·06·12·18), GDACS 에는 3시간 늦게 나타난다.

    A(1001322): 8일 전부터. 경도 179.5 → 12시 회차에 −179.8 로 날짜변경선을 넘는다.
    B(1001323): 6시간 전에 처음 나타났다.
    같은 파티션에 A 의 옛 회차가 한 줄 더 들어온다(GDACS 중복 Point) — 큰 회차를 써야 한다.
    """
    a = Archive()
    for run in hours_back(170):
        latest = run.replace(minute=0) - timedelta(hours=3)
        adv = latest - timedelta(hours=latest.hour % 6)
        n = int(round((adv - H17.replace(hour=12)).total_seconds() / 21600))   # 12시 회차가 0
        lon = -179.8 if adv >= H17.replace(hour=12) else 179.5
        rows = [cyclone_row(run, 1001322, "DUJUAN-26", lon, round(27.0 + 0.2 * n, 1), 100 + n,
                            adv.strftime("%Y-%m-%dT%H:%M:%S"), round(120.0 + 5 * n, 4))]
        rows.append(cyclone_row(run, 1001322, "DUJUAN-26", 170.0, 10.0, 100 + n - 1,
                                (adv - timedelta(hours=6)).strftime("%Y-%m-%dT%H:%M:%S"), 1.0))
        if adv >= H17.replace(hour=6):
            rows.append(cyclone_row(run, 1001323, "SIX-26", -33.6, 32.6, 1,
                                    adv.strftime("%Y-%m-%dT%H:%M:%S"), 74.0736))
        a.put("cyclone", run, rows)
    return a


class CycloneTests(unittest.TestCase):
    def setUp(self):
        self.doc = rollup.build_layer("cyclone", NOW, cyclone_archive().reader)

    def test_회차_시각이_기준이고_1h_는_없다(self):
        blk = self.doc["keys"]["1001322"]
        self.assertEqual("2026-09-19T12:00:00Z", blk["to"]["at"])         # todate — 받은 시각(17:05)이 아니다
        self.assertEqual("advisory", self.doc["atBasis"])
        self.assertEqual("FROM_TOO_FAR", blk["omit"]["1h"]["code"])
        self.assertEqual(300, blk["omit"]["1h"]["nearestMin"])

    def test_중복_회차는_큰_쪽이다(self):
        blk = self.doc["keys"]["1001322"]
        self.assertEqual(120.0, blk["to"]["v"][0])                         # 옛 회차의 1.0 이 아니다
        self.assertEqual({"maxWind": "km/h"}, blk["u"])

    def test_강도_차와_날짜변경선(self):
        items = {(it["key"], it["window"]): it for it in rollup.packet_items(self.doc, "1001322")}
        self.assertEqual(5.0, items[("maxWind", "6h")]["delta"])
        self.assertEqual("km/h", items[("maxWind", "6h")]["unit"])
        self.assertEqual(20.0, items[("maxWind", "24h")]["delta"])
        self.assertEqual(0.2, items[("centerLat", "6h")]["delta"])
        self.assertNotIn(("centerLon", "6h"), items)                      # 179.5 → −179.8
        self.assertEqual({"centerLon": "DATELINE"}, self.doc["keys"]["1001322"]["w"]["6h"]["notes"])
        self.assertIn("DATELINE", self.doc["reasons"])
        self.assertIn(("maxWind", "7d"), items)

    def test_새_태풍은_하루_전_값이_없다(self):
        blk = self.doc["keys"]["1001323"]
        self.assertIn("6h", blk["w"])
        self.assertEqual("FROM_MISSING", blk["omit"]["24h"]["code"])
        self.assertEqual({"name": "SIX-26"}, blk["meta"])

    def test_todate_가_없으면_받은_시각으로_내려가고_그렇게_적는다(self):
        a = Archive()
        run = H17 + timedelta(minutes=5)
        row = cyclone_row(run, 7, "X", 120.0, 20.0, 1, None, 50.0)
        a.put("cyclone", run, [row])
        d = rollup.build_layer("cyclone", NOW, a.reader)
        self.assertEqual("fetched", d["keys"]["7"]["atBasis"])
        self.assertEqual("2026-09-19T17:05:00Z", d["keys"]["7"]["to"]["at"])


class SolarTests(unittest.TestCase):
    def setUp(self):
        a = Archive()
        for run in hours_back(170):
            i = _i(run)
            kp_tag = (run - timedelta(minutes=1)).strftime("%Y-%m-%dT%H:%M:%S")   # 표기 없는 UTC
            meta = Z(run.replace(minute=0))
            # kp: 세 시간에 한 번 2, 나머지 1 (17시가 2)
            a.put("solar", run, solar_rows(run, meta, round(2.5e-07 + 1e-09 * i, 12), 1 + (i % 3 == 0), kp_tag))
        self.doc = rollup.build_layer("solar", NOW, a.reader)

    def test_kp_와_xray_는_따로_간다(self):
        self.assertEqual({"kp", "xray"}, set(self.doc["keys"]))
        kp = {it["window"]: it for it in rollup.packet_items(self.doc, "kp")}
        self.assertEqual("2026-09-19T17:04:00Z", kp["1h"]["at"])            # time_tag 에 Z 를 붙였다
        self.assertEqual("2026-09-19T16:04:00Z", kp["1h"]["since"])
        self.assertEqual("measured", kp["1h"]["atBasis"])
        self.assertEqual("Kp index", kp["1h"]["unit"])
        self.assertEqual((1.0, 2.0, 1.0), (kp["1h"]["from"], kp["1h"]["to"], kp["1h"]["delta"]))
        self.assertEqual(0.0, kp["6h"]["delta"])
        self.assertIn("planetary K", kp["1h"]["source"])
        self.assertNotIn("xrayFlux", {it["key"] for it in rollup.packet_items(self.doc, "kp")})
        xr = {it["window"]: it for it in rollup.packet_items(self.doc, "xray")}
        self.assertEqual("W/m²", xr["6h"]["unit"])
        self.assertEqual(6e-09, xr["6h"]["delta"])
        self.assertEqual("product", xr["6h"]["atBasis"])
        self.assertIn("GOES", xr["6h"]["source"])


class ContractTests(unittest.TestCase):
    """펴낸 change 절이 인텔 패킷 v1 계약을 그대로 통과한다 — 패킷 빌더는 복사만 하면 된다."""

    CASES = (
        ("buoy", "46001", "ocean.sea_observation"),
        ("wind", "35,125", "weather.wind"),
        ("cyclone", "1001322", "hazards.typhoon"),
        ("solar", "kp", "space.solar_activity"),
    )

    def _doc(self, layer):
        if layer == "buoy":
            return rollup.build_layer("buoy", NOW, buoy_archive().reader)
        if layer == "wind":
            return rollup.build_layer("wind", NOW, wind_archive(WindTests.GRID).reader)
        if layer == "cyclone":
            return rollup.build_layer("cyclone", NOW, cyclone_archive().reader)
        a = Archive()
        for run in hours_back(30):
            a.put("solar", run, solar_rows(run, Z(run.replace(minute=0)), 3e-07, 1 + (_i(run) % 2),
                                           run.strftime("%Y-%m-%dT%H:%M:%S")))
        return rollup.build_layer("solar", NOW, a.reader)

    def test_계약을_통과한다(self):
        for layer, key, pid in self.CASES:
            with self.subTest(layer=layer):
                doc = self._doc(layer)
                change, why = rollup.packet_change(doc, key)
                self.assertIsNotNone(change, why)
                packet = {"schema": 1, "phenomenonId": pid, "eventId": None,
                          "time": {"retrievedAt": Z(NOW)},
                          "change": change,
                          "sources": [{"id": doc["sourceId"], "kind": doc["kind"]}],
                          "coverage": {"missing": [
                              {"section": s, "reason": "이 시험은 change 절만 본다"}
                              for s in intel_contract.PACKET_SECTIONS if s != "change"]}}
                self.assertEqual([], intel_contract.validate(packet))
                for it in change["items"]:
                    self.assertEqual(doc["kind"], it["kind"])
                    self.assertIn(it["window"], change["windows"])

    def test_증거_종류는_어휘_안이다(self):
        for layer, spec in rollup.LAYERS.items():
            self.assertIn(spec["kind"], intel_contract.EVIDENCE_KIND, layer)


class ExactDeltaTests(unittest.TestCase):
    def test_10진_뺄셈(self):
        self.assertNotEqual(0.2, 1.3 - 1.1)                 # 이진 부동소수의 흔한 함정
        self.assertEqual(0.2, rollup.exact_delta(1.3, 1.1))
        self.assertEqual(-0.3, rollup.exact_delta(0.1, 0.4))
        self.assertEqual(0.0, rollup.exact_delta(5, 5.0))
        self.assertEqual(1, rollup.exact_delta(61, 60))

    def test_표기_없는_시각은_UTC(self):
        t = rollup.parse_time("2026-09-19T12:00:00")
        self.assertEqual("2026-09-19T12:00:00Z", rollup.iso(t))
        self.assertIsNone(rollup.parse_time("모름"))
        self.assertIsNone(rollup.parse_time(None))


class SizeTests(unittest.TestCase):
    def test_전지구_격자_한_층이_작다(self):
        """2,376점(72×33) — 층 파일이 v1 항목 3만 개로 부풀지 않는다."""
        grid = [(-80.0 + 5 * iy, -180.0 + 5 * ix) for iy in range(33) for ix in range(72)]
        a = Archive()
        need = set()
        for base in (H17, H17 - timedelta(hours=6), H17 - timedelta(hours=24), H17 - timedelta(days=7)):
            for k in range(-3, 4):
                need.add(base + timedelta(hours=k))
        for h in sorted(need):
            prod = h - timedelta(hours=h.hour % 3)
            k = int(round((prod - H17).total_seconds() / 3600))
            a.put("wind", h + timedelta(minutes=5),
                  wind_rows(h, Z(prod), [(lat, lon, round(1.0 + 0.1 * k, 1), -2.0, 10.0, 60)
                                         for lat, lon in grid]))
        doc = rollup.build_layer("wind", NOW, a.reader)
        self.assertEqual(2376, doc["summary"]["keys"])
        size = len(json.dumps(doc, ensure_ascii=False, separators=(",", ":")).encode())
        full = sum(len(json.dumps(it, ensure_ascii=False, separators=(",", ":")))
                   for k in doc["keys"] for it in rollup.packet_items(doc, k))
        self.assertLess(size, 1500000, size)
        self.assertLess(size * 3, full, "압축형이 v1 항목을 그대로 쌓는 것보다 작아야 한다")


def _load_handler():
    """dozens of aws/*/handler.py 와 이름이 겹치지 않게 경로로 올린다."""
    spec = importlib.util.spec_from_file_location("intel_rollup_handler", str(FUNC / "handler.py"))
    mod = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(mod)
    return mod


class _ClientError(Exception):
    """botocore ClientError 와 같은 모양(response.Error.Code)."""

    def __init__(self, code):
        super().__init__(code)
        self.response = {"Error": {"Code": code}}


class FakeS3(object):
    """get_object / put_object 만 흉내 낸다. 없는 키는 403(AccessDenied) — ListBucket 없는 역할과 같다."""

    def __init__(self, objects, fail_keys=()):
        self.objects, self.fail_keys, self.puts = dict(objects), set(fail_keys), []

    def get_object(self, Bucket, Key):
        if Key in self.fail_keys:
            raise _ClientError("SlowDown")
        if Key not in self.objects:
            raise _ClientError("AccessDenied")
        return {"Body": io.BytesIO(self.objects[Key])}

    def put_object(self, **kw):
        self.puts.append(kw)
        self.objects[kw["Key"]] = kw["Body"]


class HandlerTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.h = _load_handler()

    def _objects(self):
        objs = {}
        objs.update(buoy_archive().objects)
        objs.update(cyclone_archive().objects)
        objs.update(wind_archive(WindTests.GRID).objects)
        return objs                                    # 태양은 일부러 없다

    def test_층마다_한_파일과_색인을_쓴다(self):
        s3 = FakeS3(self._objects())
        out = self.h.run(NOW, s3, "earthus-cache-kr")
        keys = [p["Key"] for p in s3.puts]
        self.assertEqual(["archive/intel-change/buoy.json", "archive/intel-change/cyclone.json",
                          "archive/intel-change/solar.json", "archive/intel-change/wind.json",
                          "archive/intel-change/index.json"], keys)
        for k in keys:
            self.assertEqual("PRIVATE", priv.prefix_visibility(k))
        idx = json.loads(s3.objects["archive/intel-change/index.json"])
        self.assertEqual("omitted", idx["layers"]["solar"]["status"])
        self.assertEqual("NO_RECENT_PARTITION", idx["layers"]["solar"]["reason"])
        self.assertEqual("ok", idx["layers"]["buoy"]["status"])
        self.assertEqual({"1h": 2, "6h": 2, "24h": 2, "7d": 2}, idx["layers"]["buoy"]["windows"])
        self.assertIn("forecast", idx["unsupportedDatasets"])
        self.assertTrue(out["ok"])
        buoy = json.loads(s3.objects["archive/intel-change/buoy.json"])
        self.assertEqual(rollup.SCHEMA, buoy["schema"])

    def test_dryRun_은_쓰지_않는다(self):
        s3 = FakeS3(self._objects())
        out = self.h.run(NOW, s3, "b", dry_run=True)
        self.assertEqual([], s3.puts)
        self.assertEqual([], out["written"])
        self.assertEqual("ok", out["layers"]["wind"]["status"])

    def test_없음과_읽기_오류를_섞지_않는다(self):
        objs = self._objects()
        bad = rollup.partition_key("buoy", H17)
        s3 = FakeS3(objs, fail_keys={bad})
        self.h.run(NOW, s3, "b", layers=["buoy"])
        doc = json.loads(s3.objects["archive/intel-change/buoy.json"])
        self.assertEqual([bad], [e["key"] for e in doc["readErrors"]])
        self.assertIn("SlowDown", doc["readErrors"][0]["error"])
        # 17시를 못 읽었으니 16시 파티션이 '지금'이 된다 — 그 사실이 문서에 남는다
        self.assertTrue(doc["toPartition"].endswith("hh=16/part.jsonl.gz"))


class WritePathTests(unittest.TestCase):
    """새 람다의 쓰기를 write_path 가 값으로 증명하고 write_policy 가 비공개로 허용한다."""

    def test_쓰기_키가_전부_증명된다(self):
        writes = wpath.scan_python(str(FUNC / "handler.py"))
        self.assertEqual(2, len(writes))
        for w in writes:
            self.assertTrue((w.key or "").startswith("archive/intel-change/"), w.as_dict())
            v = wpol.classify(w, str(REPO))
            self.assertEqual(wpol.ALLOW_PRIVATE, v["verdict"], v)

    def test_계산_모듈은_쓰지_않는다(self):
        self.assertEqual([], wpath.scan_python(str(FUNC / "rollup.py")))

    def test_출력_접두사는_버킷_공개_목록에_없다(self):
        self.assertFalse(any("archive/intel-change/".startswith(p) for p in priv.BUCKET_PUBLIC_PREFIXES))


class ArchiverDriftTests(unittest.TestCase):
    """합성 픽스처가 archiver 와 같은 모양인지 — archiver 소스를 구문으로 읽어 대조한다."""

    @classmethod
    def setUpClass(cls):
        cls.src = (AWS / "archiver" / "handler.py").read_text(encoding="utf-8")
        cls.tree = ast.parse(cls.src)

    def _stamp_keys(self, fname):
        """collect_<x>() 안 stamp({...}, "<dataset>", …) 호출의 사전 키와 데이터셋 이름."""
        fn = next(n for n in ast.walk(self.tree) if isinstance(n, ast.FunctionDef) and n.name == fname)
        keys, datasets = set(), set()
        for n in ast.walk(fn):
            if isinstance(n, ast.Call) and isinstance(n.func, ast.Name) and n.func.id == "stamp":
                if isinstance(n.args[0], ast.Dict):
                    keys |= {k.value for k in n.args[0].keys if isinstance(k, ast.Constant)}
                datasets.add(n.args[1].value)
        return keys, datasets

    def test_파티션_키_모양이_같다(self):
        want = rollup.PARTITION_FMT.replace("{h:", "{now:")
        self.assertIn('f"%s"' % want, self.src)

    def test_읽는_열이_archiver_에_있다(self):
        need = {
            "collect_buoys": ("buoy", {"station", "lat", "lon"}),
            "collect_cyclones": ("cyclone", {"id", "name", "episode", "to_date", "severity_unit"}),
            "collect_solar": ("solar", set()),
            "collect_wind": ("wind", {"lat", "lon"}),
        }
        for fname, (layer, extra) in need.items():
            with self.subTest(collector=fname):
                keys, datasets = self._stamp_keys(fname)
                self.assertEqual({rollup.LAYERS[layer]["dataset"]}, datasets)
                cols = {f["col"] for f in rollup.LAYERS[layer]["fields"]} | extra
                cols |= {f["unit_col"] for f in rollup.LAYERS[layer]["fields"] if f.get("unit_col")}
                self.assertEqual(set(), cols - keys, "archiver 가 더는 쌓지 않는 열")

    def test_obs_시각_규칙이_같다(self):
        """buoy·wind·solar 는 obs_time 을 넘기고 cyclone 은 넘기지 않는다 — atBasis 설명의 근거."""
        def passes_obs(fname):
            fn = next(n for n in ast.walk(self.tree) if isinstance(n, ast.FunctionDef) and n.name == fname)
            return any(isinstance(n, ast.Call) and getattr(n.func, "id", "") == "stamp"
                       and any(kw.arg == "obs_time" for kw in n.keywords) for n in ast.walk(fn))
        self.assertTrue(passes_obs("collect_buoys"))
        self.assertTrue(passes_obs("collect_wind"))
        self.assertTrue(passes_obs("collect_solar"))
        self.assertFalse(passes_obs("collect_cyclones"))

    def test_모든_archive_자료가_지원_또는_미지원_목록에_있다(self):
        m = re.search(r"COLLECTORS = \{(.*?)\n\}", self.src, re.S)
        names = set(re.findall(r'"([a-z_]+)":', m.group(1))) | {"wildfire"}
        covered = set(rollup.LAYERS) | set(rollup.UNSUPPORTED_DATASETS)
        self.assertEqual(set(), names - covered, "새 archive 자료가 어느 목록에도 없다")
        self.assertEqual(set(), set(rollup.LAYERS) & set(rollup.UNSUPPORTED_DATASETS))


if __name__ == "__main__":                                    # pragma: no cover
    unittest.main(verbosity=2)
