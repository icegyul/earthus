"""Build an explicitly ineligible real observation package from saved NOAA CSV."""
import csv
from datetime import datetime, timezone
import hashlib
import io
import json
from pathlib import Path

from research_runtime.datasets import digest
from research_runtime.validation import validate_observations

HERE = Path(__file__).resolve().parent
URI = ("https://erddap.aoml.noaa.gov/gdp/erddap/tabledap/drifter_hourly_qc.csv?"
       "ID,time,latitude,longitude,drogue_lost_date,ve,vn,gap,typebuoy&ID=%22116362%22"
       "&time%3E=2015-01-01T12:00:00Z&time%3C=2015-01-04T12:00:00Z")


def main():
    source = (HERE / "observations.csv").read_bytes()
    rows = list(csv.DictReader(io.StringIO(source.decode("utf-8"))))
    assert rows[0]["time"] == "UTC", "Expected ERDDAP units row."
    rows = rows[1:]
    assert len(rows) == 73 and {row["ID"] for row in rows} == {"116362"}
    assert {row["drogue_lost_date"] for row in rows} == {"2014-08-19T00:00:00Z"}
    samples = [{"timeUTC": row["time"], "lon": float(row["longitude"]), "lat": float(row["latitude"]),
                "uMps": float(row["ve"]), "vMps": float(row["vn"]), "sourceGapSeconds": float(row["gap"])} for row in rows]
    times = [datetime.fromisoformat(sample["timeUTC"].replace("Z", "+00:00")).timestamp() for sample in samples]
    assert all(b - a == 3600 for a, b in zip(times, times[1:]))
    tracks = [{"particleId": 0, "trackId": "GDP-116362", "qualityControl": "PASSED",
               "drogueStatus": "LOST", "drogueLostAtUTC": "2014-08-19T00:00:00Z",
               "depthMeters": None, "nominalDrogueDepthMeters": 15,
               "depthMeaning": "SVP nominal 15m drogue was lost; actual effective current-following depth unknown",
               "independenceStatus": "UNKNOWN", "independenceEvidence": "",
               "samples": samples}]
    manifest = {
        "datasetId": "noaa-gdp-hourly-qc-116362-20150101", "version": "v2.01-subset-earthus1",
        "evidenceKind": "OBSERVATION", "provider": "NOAA AOML Global Drifter Program", "sourceURI": URI,
        "sourceFile": "observations.csv", "sourceSha256": hashlib.sha256(source).hexdigest(),
        "qualityControl": "PROVIDER_QC", "qualityControlURI": "https://www.aoml.noaa.gov/phod/gdp/hourly_data.php",
        "citation": "Elipot, Shane; Sykulski, Adam; Lumpkin, Rick; Centurioni, Luca; Pazos, Mayra (2022). Hourly location, current velocity, and temperature collected from Global Drifter Program drifters world-wide. NOAA NCEI. doi:10.25921/x46c-3620. Subset GDP116362, 2015-01-01 12Z to 2015-01-04 12Z. Accessed 2026-09-04 UTC.",
        "license": "Creative Commons Attribution 4.0; NOAA GDP ERDDAP license attribute",
        "licenseURI": "https://erddap.aoml.noaa.gov/gdp/erddap/info/drifter_hourly_qc/index.html",
        "redistributionAllowed": True, "hashScope": "canonical-observation-tracks-json", "sha256": digest(tracks),
        "validTimeStartUTC": samples[0]["timeUTC"], "validTimeEndUTC": samples[-1]["timeUTC"],
        "intendedUse": "Real-data eligibility rejection example only; not a model validation cohort",
        "processingHistory": ["Removed ERDDAP units row; parsed numeric coordinates/velocities; kept every original hourly record",
                              "Drogue loss predates all observations; effective depth and forcing independence remain unknown"],
    }
    observations = {"manifest": manifest, "tracks": tracks}
    validate_observations(observations, source)
    (HERE / "observations.json").write_text(json.dumps(observations, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    print(json.dumps({"rows": len(samples), "sourceSha256": manifest["sourceSha256"], "packageValid": True,
                      "scientificEligibility": "EXCLUDED_DROGUE_LOST_AND_DEPTH_UNKNOWN"}))


if __name__ == "__main__":
    main()
