#!/usr/bin/env python3
"""KMA radar fixed-slot history contract without AWS or network calls."""

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
path = Path(__file__).resolve().parents[1] / "aws" / "kma-radar" / "handler.py"
spec = importlib.util.spec_from_file_location("earthus_kma_radar", path)
module = importlib.util.module_from_spec(spec)
spec.loader.exec_module(module)


def frame(tm, slot):
    return {"requestedKst": tm, "slot": slot, "url": f"/wind/frame-{slot:02d}.png"}


assert module.HISTORY_SLOTS == 13
requested = module.requested_times(module.datetime(2026, 8, 13, 18, 20, tzinfo=module.timezone.utc))
assert len(requested) == 13
assert requested[0] == "202608140315"
assert requested[-1] == "202608140215"
first = module.history_slot("202608140000")
second = module.history_slot("202608140005")
wrapped = module.history_slot("202608140105")
assert second == (first + 1) % 13
assert wrapped == first, "65 minutes must overwrite the same bounded slot"

previous = {"frames": [frame(f"20260814{hour:02d}00", hour) for hour in range(13)]}
current = frame("202608141300", 0)
merged = module.merge_frames(previous, current)
assert len(merged) == 13
assert merged[-1] == current
assert sum(item["slot"] == 0 for item in merged) == 1
assert all(item["requestedKst"] != "202608140000" for item in merged)

same_time = module.merge_frames({"frames": [frame("202608141300", 5)]}, current)
assert same_time == [current], "same production time must not appear twice"

print("KMA radar history: 14/14 passed")
