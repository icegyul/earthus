#!/usr/bin/env python3
"""KMA Wind Profiler parser and evidence document contract."""

import importlib.util
import os
import sys
import types
from pathlib import Path


class _S3:
    pass


os.environ.setdefault("CACHE_BUCKET", "fixture")
os.environ.setdefault("CACHE_REGION", "ap-northeast-2")
sys.modules["boto3"] = types.SimpleNamespace(client=lambda *_args, **_kwargs: _S3())
path = Path(__file__).resolve().parents[1] / "aws" / "kma-upper" / "handler.py"
spec = importlib.util.spec_from_file_location("earthus_kma_upper", path)
module = importlib.util.module_from_spec(spec)
spec.loader.exec_module(module)

raw = """
# TM STN HT WD WS U V W QC
202608131800 47095 100.0 270 12.5 -12.5 0.0 0.2 0
202608131800,47095,500.0,280,15.0,-14.8,2.6,-999,1
bad row
202608131800 47102 -999 180 5.0 0 5 0 0
"""
rows = module.parse_wind_profiler(raw, "L")
assert len(rows) == 2
assert rows[0]["tm"] == "202608131800"
assert rows[0]["stn"] == "47095"
assert rows[0]["heightM"] == 100
assert rows[0]["windSpeedMs"] == 12.5
assert rows[0]["mode"] == "L"
assert rows[1]["heightM"] == 500
assert rows[1]["verticalMs"] is None
assert rows[1]["qcRaw"] == "1"

doc = module.wind_profile_doc("202608131800", rows, ["fixture:prior-empty"])
assert doc["schemaVersion"] == "earthus.kma-wind-profiler.v1"
assert doc["observedUtc"] == "202608131800"
assert doc["kind"] == "VERTICAL_WIND_OBSERVATION"
assert doc["forecast"] is False
assert doc["stationCount"] == 1
assert doc["levelCount"] == 2
assert doc["missing"]["verticalMs"] == 1
assert doc["stations"][0]["stn"] == "47095"
assert "Skew-T" in doc["note"]["ko"]
assert doc["sourceUrl"].startswith("https://apihub.kma.go.kr/")
assert module.WPF_DST == "wind/kma-upper-wind.json"
assert "profiler" not in module.WPF_DST

print("KMA Wind Profiler: 20/20 passed")
