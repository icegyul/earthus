#!/usr/bin/env python3
"""earthus Kepler 근사식을 JPL Horizons와 8행성×4시점 대조한다.

실제 배포되는 prototype/js/space/kepler.js를 Node로 실행하고,
Horizons의 태양 중심·J2000 황도·기하학적 위치 벡터와 황경을 비교한다.
"""

from __future__ import annotations

import argparse
import csv
import json
import math
import shutil
import subprocess
import tempfile
import urllib.parse
import urllib.request
from datetime import date, datetime, timedelta, timezone
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
KEPLER_JS = ROOT / "prototype/js/space/kepler.js"
HORIZONS = "https://ssd.jpl.nasa.gov/api/horizons.api"
TARGETS = {
    "mercury": "199", "venus": "299", "earth": "399", "mars": "499",
    "jupiter": "599", "saturn": "699", "uranus": "799", "neptune": "899",
}


def angular_error(left: float, right: float) -> float:
    return abs((left - right + 180.0) % 360.0 - 180.0)


def verification_dates(base: date) -> list[date]:
    try:
        next_year = base.replace(year=base.year + 1)
    except ValueError:  # 2월 29일은 다음 해 2월 28일
        next_year = base.replace(year=base.year + 1, day=28)
    return [date(2000, 1, 1), base, base + timedelta(days=30), next_year]


def js_positions(days: list[date]) -> dict[str, dict[str, dict[str, float]]]:
    with tempfile.TemporaryDirectory(prefix="earthus-kepler-") as temporary:
        module = Path(temporary) / "kepler.mjs"
        shutil.copy2(KEPLER_JS, module)
        script = """
const mod = await import(process.argv[1]);
const dates = JSON.parse(process.argv[2]);
const output = {};
for (const value of dates) output[value] = mod.planetPositions(new Date(`${value}T00:00:00Z`));
console.log(JSON.stringify(output));
"""
        result = subprocess.run(
            ["node", "--input-type=module", "-e", script, module.as_uri(),
             json.dumps([day.isoformat() for day in days])],
            check=True, text=True, capture_output=True,
        )
    return json.loads(result.stdout)


def horizons_positions(target: str, days: list[date]) -> list[tuple[float, float, float]]:
    params = {
        "format": "json", "COMMAND": f"'{target}'", "OBJ_DATA": "'NO'",
        "MAKE_EPHEM": "'YES'", "EPHEM_TYPE": "'VECTORS'", "CENTER": "'500@10'",
        "REF_PLANE": "'ECLIPTIC'", "REF_SYSTEM": "'ICRF'", "OUT_UNITS": "'AU-D'",
        "VEC_TABLE": "'1'", "VEC_LABELS": "'NO'", "VEC_CORR": "'NONE'",
        "CSV_FORMAT": "'YES'", "TIME_TYPE": "'TDB'",
        "TLIST": ",".join(f"'{day.isoformat()} 00:00'" for day in days),
    }
    request = urllib.request.Request(
        HORIZONS + "?" + urllib.parse.urlencode(params),
        headers={"User-Agent": "earthus-kepler-verifier/1.0"},
    )
    with urllib.request.urlopen(request, timeout=45) as response:
        document = json.load(response)
    result = document.get("result", "")
    if "$$SOE" not in result or "$$EOE" not in result:
        raise RuntimeError(document.get("error") or "Horizons vector table missing")
    table = result.split("$$SOE", 1)[1].split("$$EOE", 1)[0]
    rows = []
    for row in csv.reader(line for line in table.splitlines() if line.strip()):
        rows.append((float(row[2]), float(row[3]), float(row[4])))
    if len(rows) != len(days):
        raise RuntimeError(f"Horizons row count {len(rows)} != {len(days)}")
    return rows


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--base-date", type=date.fromisoformat,
                        default=datetime.now(timezone.utc).date())
    parser.add_argument("--max-longitude-error", type=float, default=1.0)
    args = parser.parse_args()
    days = verification_dates(args.base_date)
    if days[-1].year > 2050:
        raise SystemExit("FAIL: JPL Table 1 유효 기간(1800–2050) 밖의 검증일")
    calculated = js_positions(days)
    failures = []
    worst = (0.0, "", "")
    for planet, target in TARGETS.items():
        reference = horizons_positions(target, days)
        for day, vector in zip(days, reference):
            x, y, _ = vector
            horizon_longitude = math.degrees(math.atan2(y, x)) % 360.0
            ours = float(calculated[day.isoformat()][planet]["longitudeDeg"])
            error = angular_error(ours, horizon_longitude)
            if error > worst[0]:
                worst = (error, planet, day.isoformat())
            status = "PASS" if error < args.max_longitude_error else "FAIL"
            print(f"{status}: {planet:8s} {day.isoformat()} longitude error {error:.4f}°")
            if error >= args.max_longitude_error:
                failures.append((planet, day.isoformat(), error))
    if failures:
        raise SystemExit(f"FAILED: {len(failures)} / 32 positions exceed "
                         f"{args.max_longitude_error:.3f}°")
    print(f"PASS: 8 planets x 4 dates; worst {worst[0]:.4f}° "
          f"({worst[1]} {worst[2]}); source=JPL Horizons")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
