# -*- coding: utf-8 -*-
"""NOMADS GFS 부분 영역 도구 + pressure-grid · fx-grid 교체(2026-09-24) 시험.

AWS 도 NOMADS 도 부르지 않는다. GRIB2 메시지를 여기서 합성한다 — 부분 영역(20–50N · 110–160E, 0.5°,
북→남 행 순서) 격자 정의는 NOMADS `subregion` 응답과 같은 모양이다(grib2lite `_grid` 가 읽는 자리).

이 시험이 지키는 것 (결과로 쓴다 — '없어야 한다'만 보지 않는다)
  ① 원격자의 **정확한 1° 점**이 나와야 한다 — 0.5° 사이 칸은 쓰지 않는다. 행 순서를 뒤집지 않는다
  ② 태풍 중심 920 hPa 가 **920 으로 나와야 한다** — 8bit 프레임처럼 잘리거나 평평해지지 않는다
  ③ u·v 는 GRIB 성분 그대로 나와야 한다 — 풍향 변환·부호 뒤집기가 없다
  ④ pressure-ea · wind-ea · fx-ea 의 옛 키가 **전부 그대로 있어야 한다**(소비자: isobars.js · windfield.js · ui-timeline.js)
  ⑤ 출처는 NOAA 이고 Open-Meteo 주소가 산출물에 없어야 한다. 시각은 GRIB 유효시각이어야 한다
  ⑥ 70% 미만이면 **쓰지 않는다**(옛 파일 유지) · 없는 스텝은 비우고 이유를 적는다
  ⑦ fx-grid 는 f+120 이 없는 최신 회차를 건너뛴다
  ⑧ 패키징 — deploy-python.sh 가 grib2lite.py 와 nomads_gfs.py 를 zip 루트에 넣는다
"""
import importlib.util
import json
import os
import pathlib
import struct
import sys
import tempfile
import types
import unittest
from datetime import datetime, timedelta, timezone

HERE = pathlib.Path(__file__).resolve().parent
SHARED = HERE.parent
AWS = SHARED.parent
sys.path.insert(0, str(SHARED))

import nomads_gfs as ng  # noqa: E402
import lambda_package as lp  # noqa: E402


class FakeS3:
    def __init__(self):
        self.puts = []

    def put_object(self, **kw):
        self.puts.append(kw)


def load(func, name):
    fake = FakeS3()
    sys.modules["boto3"] = types.SimpleNamespace(client=lambda *_a, **_k: fake)
    os.environ.setdefault("CACHE_BUCKET", "fixture-bucket")
    os.environ.setdefault("CACHE_REGION", "us-east-2")
    spec = importlib.util.spec_from_file_location(name, AWS / func / "handler.py")
    mod = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(mod)
    mod.s3 = fake
    return mod, fake


PG, PG_S3 = load("pressure-grid", "pressure_grid_handler")
FX, FX_S3 = load("fx-grid", "fx_grid_handler")
G2 = PG.g2


# ---------------------------------------------------------------- GRIB2 합성기 (부분 영역)
def _sm(value, nbytes):
    return (abs(value) | ((1 << (8 * nbytes - 1)) if value < 0 else 0)).to_bytes(nbytes, "big")


NORTH, SOUTH, WEST, EAST, D = 50.0, 20.0, 110.0, 160.0, 0.5
NI = int((EAST - WEST) / D) + 1          # 101
NJ = int((NORTH - SOUTH) / D) + 1        # 61


def grib(cat, num, lt, lv, fn, *, ref=(2026, 9, 24, 12), fh=3, decimals=0, bitmap=None):
    """부분 영역 메시지 한 장. fn(lat, lon) → 값. 행0 = 북위 50, 열0 = 동경 110 (NOMADS subregion 과 같다)."""
    vals = [fn(NORTH - j * D, WEST + i * D) for j in range(NJ) for i in range(NI)]
    npts = NI * NJ
    s1 = struct.pack(">IBHHBBBHBBBBBBB", 21, 1, 7, 0, 2, 1, 1, ref[0], ref[1], ref[2], ref[3], 0, 0, 0, 1)
    s3 = (struct.pack(">IBBIBBH", 72, 3, 0, npts, 0, 0, 0)
          + bytes([6, 0]) + bytes(4) + bytes([0]) + bytes(4) + bytes([0]) + bytes(4)
          + struct.pack(">II", NI, NJ) + struct.pack(">II", 0, 0xffffffff)
          + _sm(int(NORTH * 1e6), 4) + _sm(int(WEST * 1e6), 4) + bytes([48])
          + _sm(int(SOUTH * 1e6), 4) + _sm(int(EAST * 1e6), 4)
          + struct.pack(">II", int(D * 1e6), int(D * 1e6)) + bytes([0x00]))
    assert len(s3) == 72
    body4 = (bytes([cat, num, 2, 0, 96]) + struct.pack(">HB", 0, 0) + bytes([1]) + struct.pack(">I", fh)
             + bytes([lt, 0]) + struct.pack(">I", lv) + bytes([255, 0]) + struct.pack(">I", 0))
    s4 = struct.pack(">IBHH", 9 + len(body4), 4, 0, 0) + body4
    present = [v for v, m in zip(vals, bitmap) if m] if bitmap else list(vals)
    scale = 10 ** decimals
    ints = [int(round(v * scale)) for v in present]
    r0 = min(ints)
    packed = [x - r0 for x in ints]
    assert max(packed) < 65536
    s5 = struct.pack(">IBIH", 21, 5, len(present), 0) + struct.pack(">f", float(r0)) \
        + _sm(0, 2) + _sm(decimals, 2) + bytes([16, 0])
    if bitmap:
        bits = int("".join("1" if m else "0" for m in bitmap).ljust((npts + 7) // 8 * 8, "0"), 2)
        bm = bits.to_bytes((npts + 7) // 8, "big")
        s6 = struct.pack(">IBB", 6 + len(bm), 6, 0) + bm
    else:
        s6 = struct.pack(">IBB", 6, 6, 255)
    data = struct.pack(">%dH" % len(packed), *packed)
    s7 = struct.pack(">IB", 5 + len(data), 7) + data
    rest = s1 + s3 + s4 + s5 + s6 + s7 + b"7777"
    return b"GRIB" + bytes([0, 0, 0, 2]) + struct.pack(">Q", 16 + len(rest)) + rest


def pressure_pa(lat, lon):
    """1000 hPa + 위도/10 + 경도/100 — 점마다 다른 값. (30N, 130E) 에만 920 hPa 태풍 중심."""
    if lat == 30.0 and lon == 130.0:
        return 92000.0
    return 100000.0 + lat * 10.0 + lon


def u_ms(lat, lon):
    return round(lat - 35.0, 2)


def v_ms(lat, lon):
    return round((lon - 135.0) / 2.0, 2)


def stream(ref=(2026, 9, 24, 12), fh=3, prmsl_bitmap=None, with_wind=True, extra=True):
    parts = [grib(3, 1, 101, 0, pressure_pa, ref=ref, fh=fh, bitmap=prmsl_bitmap)]
    if with_wind:
        parts += [grib(2, 2, 103, 10, u_ms, ref=ref, fh=fh, decimals=2),
                  grib(2, 3, 103, 10, v_ms, ref=ref, fh=fh, decimals=2)]
    if extra:
        # NOMADS 교차곱으로 딸려 오는 것 — PRMSL 이 아닌 해면 변수, 다른 높이의 바람. 골라내지 않으면 덮인다.
        parts += [grib(2, 2, 103, 80, lambda a, o: 99.0, ref=ref, fh=fh),
                  grib(3, 0, 101, 0, lambda a, o: 1.0, ref=ref, fh=fh)]
    return b"".join(parts)


class NomadsBasics(unittest.TestCase):
    def test_runs_step_back_six_hours_from_the_latest_cycle(self):
        now = datetime(2026, 9, 24, 16, 30, tzinfo=timezone.utc)
        runs = ng.candidate_runs(now, count=3)
        self.assertEqual([r.strftime("%Y%m%d%H") for r in runs], ["2026092412", "2026092406", "2026092400"])

    def test_nearest_step_is_a_three_hour_multiple_and_never_negative(self):
        run = datetime(2026, 9, 24, 12, tzinfo=timezone.utc)
        self.assertEqual(ng.nearest_step(run, run + timedelta(hours=4)), 3)
        self.assertEqual(ng.nearest_step(run, run + timedelta(hours=5)), 6)
        self.assertEqual(ng.nearest_step(run, run + timedelta(minutes=20)), 0)
        self.assertIsNone(ng.nearest_step(run, run - timedelta(hours=1)))

    def test_filter_url_names_the_half_degree_file_and_the_subregion(self):
        url = ng.filter_url(datetime(2026, 9, 24, 6, tzinfo=timezone.utc), 9, res="0p50",
                            variables=("PRMSL",), levels=(ng.LEV_MSL,), bbox=(20, 110, 50, 160))
        self.assertIn("filter_gfs_0p50.pl", url)
        self.assertIn("gfs.t06z.pgrb2full.0p50.f009", url)
        for part in ("var_PRMSL=on", "lev_mean_sea_level=on", "subregion=", "toplat=50",
                     "leftlon=110", "rightlon=160", "bottomlat=20", "%2Fgfs.20260924%2F06%2Fatmos"):
            self.assertIn(part, url)

    def test_http_get_refuses_a_non_grib_answer(self):
        class R:
            def __init__(self, body): self.body = body
            def __enter__(self): return self
            def __exit__(self, *a): return False
            def read(self): return self.body
        with self.assertRaises(ValueError):
            ng.http_get("http://x", tries=1, opener=lambda req, timeout: R(b"<html>no</html>"))
        self.assertEqual(ng.http_get("http://x", tries=1, opener=lambda req, timeout: R(b"GRIBxxxx")), b"GRIBxxxx")

    def test_exact_points_only_rows_not_flipped(self):
        fields = ng.read_fields(stream(), G2)
        self.assertEqual(set(fields), {"prmsl", "u10", "v10"})     # 80 m 바람 · 다른 해면 변수는 버려졌다
        got = ng.sample(fields["prmsl"], [(20.0, 110.0), (50.0, 160.0), (35.0, 125.0), (30.0, 130.0)], 0.5)
        self.assertEqual(got, [100000 + 200 + 110, 100000 + 500 + 160, 100000 + 350 + 125, 92000])
        # 원격자 밖은 None — 지어내지 않는다
        self.assertEqual(ng.sample(fields["prmsl"], [(60.0, 110.0), (35.0, 170.0)], 0.5), [None, None])

    def test_valid_time_is_reference_plus_forecast_hours(self):
        fields = ng.read_fields(stream(ref=(2026, 9, 24, 6), fh=9), G2)
        d = fields["prmsl"]["desc"]
        self.assertEqual(ng.iso(ng.valid_time(d)), "2026-09-24T15:00:00Z")
        self.assertEqual(ng.iso(ng.ref_time(d)), "2026-09-24T06:00:00Z")


class PressureGrid(unittest.TestCase):
    RUN = datetime(2026, 9, 24, 12, tzinfo=timezone.utc)
    URL = "https://nomads.example/filter"

    def build(self, **kw):
        fields = ng.read_fields(stream(**kw), G2)
        return PG.build(fields, self.RUN, 3, self.URL, now=self.RUN + timedelta(hours=4))

    def test_old_keys_are_all_there_and_the_order_is_south_to_north(self):
        doc, wdoc, fail = self.build()
        self.assertIsNone(fail)
        for key in ("time", "lat0", "lon0", "res", "nx", "ny", "unit", "source", "filled", "failed",
                    "min", "max", "note", "mslp"):
            self.assertIn(key, doc)
        for key in ("time", "lat0", "lon0", "res", "nx", "ny", "unit", "source", "filled", "failed",
                    "max", "derivation", "note", "u", "v"):
            self.assertIn(key, wdoc)
        self.assertEqual((doc["nx"], doc["ny"], doc["lat0"], doc["lon0"], doc["res"]), (51, 31, 20.0, 110.0, 1.0))
        self.assertEqual(len(doc["mslp"]), 51 * 31)
        # 배열 [0] = (20N, 110E), [nx-1] = (20N, 160E), [nx] = (21N, 110E) — isobars.js 가 lat0 + y·res 로 읽는다
        self.assertEqual(doc["mslp"][0], round((100000 + 200 + 110) / 100, 1))
        self.assertEqual(doc["mslp"][50], round((100000 + 200 + 160) / 100, 1))
        self.assertEqual(doc["mslp"][51], round((100000 + 210 + 110) / 100, 1))
        self.assertEqual(doc["filled"], 51 * 31)
        self.assertEqual(doc["failed"], 0)

    def test_typhoon_center_is_not_clipped(self):
        doc, _, _ = self.build()
        idx = (30 - 20) * 51 + (130 - 110)
        self.assertEqual(doc["mslp"][idx], 920.0)
        self.assertEqual(doc["min"], 920.0)

    def test_wind_is_the_grib_components_unchanged(self):
        _, wdoc, _ = self.build()
        idx = (40 - 20) * 51 + (150 - 110)
        self.assertEqual(wdoc["u"][idx], 5.0)        # 40 − 35
        self.assertEqual(wdoc["v"][idx], 7.5)        # (150 − 135) / 2
        self.assertEqual(wdoc["derivation"]["method"], "GRIB_UV_COMPONENTS")

    def test_source_and_time_are_noaa_and_the_grib_valid_time(self):
        doc, wdoc, _ = self.build()
        for d in (doc, wdoc):
            self.assertIn("NOAA", d["source"])
            self.assertEqual(d["time"], "2026-09-24T15:00:00Z")
            self.assertEqual(d["validAt"], "2026-09-24T15:00:00Z")
            self.assertEqual(d["modelRun"], "2026-09-24T12:00:00Z")
            self.assertEqual(d["licenseStatus"], "APPROVED_FREE")
            self.assertNotIn("open-meteo", json.dumps(d).lower())

    def test_under_seventy_percent_is_not_written(self):
        # 결측(None)이 섞인 원격자 — grib2lite 가 비트맵 칸을 None 으로 돌려주는 모양 그대로.
        # (합성기로 비트맵을 만들지 않는 이유: grib2lite 는 비트맵 메시지를 '값 개수 불일치'로 거부한다 —
        #  gfs-cloud-forecast 시험 test_a_bitmapped_message_on_a_new_field_costs_only_that_field 의 동작. GFS PRMSL 에는 비트맵이 없다.)
        fields = ng.read_fields(stream(), G2)
        vals = fields["prmsl"]["values"]
        fields["prmsl"]["values"] = [v if k % 4 == 0 else None for k, v in enumerate(vals)]
        doc, wdoc, fail = PG.build(fields, self.RUN, 3, self.URL)
        self.assertIsNone(doc)
        self.assertIsNone(wdoc)
        self.assertFalse(fail["ok"])

    def test_missing_wind_messages_skip_only_the_wind_file(self):
        doc, wdoc, fail = self.build(with_wind=False)
        self.assertIsNotNone(doc)
        self.assertIsNone(wdoc)

    def test_handler_writes_both_files_and_falls_back_a_cycle(self):
        calls = []

        def fake_get(url, **kw):
            calls.append(url)
            if "gfs.20260924%2F12" in url:
                raise ValueError("아직 안 올라옴")
            return stream(ref=(2026, 9, 24, 6), fh=12)

        PG_S3.puts.clear()
        orig = ng.http_get
        ng.http_get = fake_get
        try:
            out = PG.fetch_now(now=datetime(2026, 9, 24, 17, 50, tzinfo=timezone.utc))
        finally:
            ng.http_get = orig
        fields, run, fh, url = out
        self.assertEqual(run.strftime("%Y%m%d%H"), "2026092406")
        self.assertEqual(fh, 12)
        self.assertEqual(len(calls), 2)

    def test_handler_puts_nothing_when_no_cycle_answers(self):
        PG_S3.puts.clear()
        orig = ng.http_get
        ng.http_get = lambda url, **kw: (_ for _ in ()).throw(ValueError("down"))
        try:
            with self.assertRaises(RuntimeError):
                PG.handler()
        finally:
            ng.http_get = orig
        self.assertEqual(PG_S3.puts, [])


class FxGrid(unittest.TestCase):
    NOW = datetime(2026, 9, 24, 17, 50, tzinfo=timezone.utc)

    def test_latest_cycle_without_f120_is_skipped(self):
        seen = []

        def fake_get(url, **kw):
            seen.append(url)
            if "gfs.20260924%2F12" in url:
                raise ValueError("f126 아직")
            return b"GRIB"

        run, f0 = FX.pick_run(now=self.NOW, get=fake_get)
        self.assertEqual(run.strftime("%Y%m%d%H"), "2026092406")
        self.assertEqual(f0, 12)
        self.assertIn("f132", seen[-1])                  # f0 + 120

    def test_twenty_one_steps_every_six_hours_from_one_run(self):
        run = datetime(2026, 9, 24, 6, tzinfo=timezone.utc)

        def fake_get(url, **kw):
            fh = int(url.split(".f")[1][:3])
            return stream(ref=(2026, 9, 24, 6), fh=fh, extra=False)

        steps, missing, first_ok, dims = FX.build_steps(run, 12, get=fake_get)
        self.assertEqual(missing, [])
        self.assertEqual(len(steps), 21)
        self.assertEqual([s["h"] for s in steps], list(range(0, 121, 6)))
        self.assertEqual(steps[0]["t"], "2026-09-24T18:00:00Z")
        self.assertEqual(steps[-1]["t"], "2026-09-29T18:00:00Z")
        for key in ("t", "h", "min", "max", "mslp", "u", "v"):
            self.assertIn(key, steps[0])
        self.assertEqual(first_ok, 51 * 31)
        doc = FX.build_doc(run, 12, steps, missing, first_ok, dims, "u", now=self.NOW)
        for key in ("time", "lat0", "lon0", "res", "nx", "ny", "stepH", "maxH", "unit", "source",
                    "note", "filled", "failed", "steps"):
            self.assertIn(key, doc)
        self.assertEqual((doc["stepH"], doc["maxH"]), (6, 120))
        self.assertIn("NOAA", doc["source"])
        self.assertNotIn("open-meteo", json.dumps(doc).lower())

    def test_a_failed_step_is_left_out_with_its_reason(self):
        run = datetime(2026, 9, 24, 6, tzinfo=timezone.utc)

        def fake_get(url, **kw):
            fh = int(url.split(".f")[1][:3])
            if fh == 36:
                raise ValueError("500")
            return stream(ref=(2026, 9, 24, 6), fh=fh, extra=False)

        steps, missing, _, _ = FX.build_steps(run, 12, get=fake_get)
        self.assertEqual(len(steps), 20)
        self.assertEqual(missing[0]["fh"], 36)
        self.assertNotIn(24, [s["h"] for s in steps])

    def test_deadline_stops_fetching_and_says_so(self):
        run = datetime(2026, 9, 24, 6, tzinfo=timezone.utc)
        ticks = iter([0] + [0] * 3 + [FX.DEADLINE_S + 1] * 100)

        def fake_get(url, **kw):
            fh = int(url.split(".f")[1][:3])
            return stream(ref=(2026, 9, 24, 6), fh=fh, extra=False)

        steps, missing, _, _ = FX.build_steps(run, 12, get=fake_get, clock=lambda: next(ticks))
        self.assertGreater(len(missing), 0)
        self.assertTrue(all(m["why"] == "DEADLINE" for m in missing))
        self.assertEqual(len(steps) + len(missing), 21)


class Packaging(unittest.TestCase):
    def test_grib2lite_and_nomads_gfs_go_into_the_zip_root(self):
        for func in ("pressure-grid", "fx-grid"):
            p = lp.plan(str(AWS / func), str(SHARED))
            self.assertIn("nomads_gfs", p["sharedModules"], func)
            self.assertEqual(p["crossFunctionFiles"].get("grib2lite.py"),
                             "gfs-cloud-forecast/grib2lite.py", func)
            with tempfile.TemporaryDirectory() as tmp:
                lp.stage(str(AWS / func), str(SHARED), tmp)
                self.assertTrue(os.path.isfile(os.path.join(tmp, "grib2lite.py")))
                self.assertTrue(os.path.isfile(os.path.join(tmp, "nomads_gfs.py")))
                self.assertEqual(lp.missing_own_modules(tmp, str(AWS / func), str(SHARED)), [])

    def test_requirements_file_keeps_the_30mb_default_out(self):
        for func in ("pressure-grid", "fx-grid"):
            text = (AWS / func / "requirements.txt").read_text(encoding="utf-8")
            reqs = [ln for ln in text.splitlines() if ln.strip() and not ln.lstrip().startswith("#")]
            self.assertEqual(reqs, [], func)

    def test_no_open_meteo_call_remains_in_the_two_handlers(self):
        for func in ("pressure-grid", "fx-grid"):
            code = [ln for ln in (AWS / func / "handler.py").read_text(encoding="utf-8").splitlines()
                    if not ln.lstrip().startswith("#")]
            self.assertFalse(any("urlopen" in ln and "API" in ln for ln in code), func)
            self.assertFalse(any(ln.strip().startswith("API =") for ln in code), func)


if __name__ == "__main__":
    unittest.main()
