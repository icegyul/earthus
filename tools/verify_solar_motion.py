#!/usr/bin/env python3
"""태양계 전진 도식의 출처·계산·유한 재생 안전장치를 검증한다."""

from __future__ import annotations

import json
import math
import pathlib
import re


ROOT = pathlib.Path(__file__).resolve().parents[1]
DATA_PATH = ROOT / "prototype/data/solar-motion.json"
SCRIPT_PATH = ROOT / "prototype/js/space/cosmic3d.js"
HTML_PATH = ROOT / "prototype/index.html"
AU_KM = 149_597_870.7


def require(condition: bool, message: str) -> None:
    if not condition:
        raise SystemExit(f"FAIL: {message}")


def main() -> None:
    data = json.loads(DATA_PATH.read_text(encoding="utf-8"))
    script = SCRIPT_PATH.read_text(encoding="utf-8")
    html = HTML_PATH.read_text(encoding="utf-8")

    require(data.get("schema") == "earthus.solar-motion.v1", "unexpected schema")
    require(re.fullmatch(r"\d{4}-\d{2}-\d{2}", data.get("referenceDate", "")) is not None,
            "referenceDate must be explicit")
    require(data.get("sourceUrl", "").startswith("https://science.nasa.gov/"),
            "source must be an official NASA Science URL")
    require(data.get("source"), "source label missing")
    for language in ("ko", "en"):
        require(len(data.get("method", {}).get(language, "")) >= 80,
                f"method.{language} is missing or too short")
        require(len(data.get("limitations", {}).get(language, "")) >= 100,
                f"limitations.{language} is missing or too short")
        require(len(data.get("displayLimit", {}).get(language, "")) >= 60,
                f"displayLimit.{language} is missing or too short")

    calculated_au = data["galacticSpeedKph"] * 24 * data["displaySpanDays"] / AU_KM
    require(math.isclose(calculated_au, data["distanceAu"], rel_tol=0, abs_tol=1e-9),
            "distanceAu does not match speed × time")
    require(data["galacticOrbitYears"] == 230_000_000, "galactic orbit period changed")

    duration = re.search(r"const MOTION_DURATION_MS = (\d+);", script)
    require(duration is not None and int(duration.group(1)) <= 10_000,
            "motion must have a short finite duration")
    for guard in ("cancelAnimationFrame(this._motionFrame)", "geometry.setDrawRange",
                  "prefers-reduced-motion: reduce", "closeSolarMotion"):
        require(guard in script, f"runtime guard missing: {guard}")
    require("setAnimationLoop" not in script, "permanent WebGL animation loop is forbidden")
    for element_id in ("cosmicMotionOpen", "cosmicMotionInfo", "cosmicMotionReplay",
                       "cosmicMotionSource"):
        require(f'id="{element_id}"' in html, f"UI element missing: {element_id}")

    print("OK: solar-motion schema, NASA source, 48.577 AU calculation, finite replay guards")


if __name__ == "__main__":
    main()
