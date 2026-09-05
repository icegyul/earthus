"""Normalize the saved NCEP-DOE R2 10 m wind subsets (no network) into the wind dataset JSON.

Run from services/research-runtime with `.deps` on PYTHONPATH. Writes
examples/ncep-doe-r2-10m-wind-natl-20150105.wind.json and the acquisition record next to the .nc files.
"""
import json
from pathlib import Path

from research_runtime.wind import build_ncep_r2_wind_dataset, write_wind_dataset

ROOT = Path(__file__).resolve().parents[2]
FIX = ROOT / "docs/research/fixtures/gdp-hycom-cohort-201501/wind-ncep-r2"
OUT = ROOT / "services/research-runtime/examples/ncep-doe-r2-10m-wind-natl-20150105.wind.json"
BASE = ("https://psl.noaa.gov/thredds/ncss/grid/Datasets/ncep.reanalysis2/gaussian_grid/{v}.10m.gauss.2015.nc?var={v}"
        "&north=40&south=10&west=300&east=335&time_start=2015-01-05T00:00:00Z&time_end=2015-01-08T18:00:00Z&accept=netcdf")
ISSUED = "2026-09-05T15:00:00Z"  # fixed so the normalized grid/manifest hash is reproducible from the saved originals


def main():
    dataset, acquisition = build_ncep_r2_wind_dataset(FIX / "uwnd.10m.gauss.2015-0105-0108.nc", FIX / "vwnd.10m.gauss.2015-0105-0108.nc",
                                                      BASE.format(v="uwnd"), BASE.format(v="vwnd"),
                                                      "ncep-doe-r2-10m-wind-natl-20150105", "2015-01-05T00_2015-01-08T18.earthus1", ISSUED)
    record = FIX / "acquisition.json"
    if record.exists():
        previous = json.loads(record.read_text(encoding="utf-8"))
        assert previous["sources"] == acquisition["sources"], "Original wind files changed; register a new version."
    else:
        record.write_text(json.dumps(acquisition, indent=2) + "\n", encoding="utf-8")
    write_wind_dataset(dataset, OUT)
    grid = dataset["grid"]
    print(json.dumps({"output": str(OUT.relative_to(ROOT)), "shape": [len(grid["timeUTC"]), len(grid["lat"]), len(grid["lon"])],
                      "gridSha256": dataset["manifest"]["sha256"], "sourceSha256": dataset["manifest"]["sourceSha256"],
                      "lat": [grid["lat"][0], grid["lat"][-1]], "lon": [grid["lon"][0], grid["lon"][-1]], "timeUTC": [grid["timeUTC"][0], grid["timeUTC"][-1]]}, indent=2))


if __name__ == "__main__":
    main()
