#!/usr/bin/env python3
"""공개 원본 3종과 private canonical shadow의 값·결측·시간을 나란히 검증한다.

이 도구는 reader 전환이나 승인을 하지 않는다. 설명되지 않은 차이가 있으면 exit 1이다.
"""

import argparse
import json
from pathlib import Path


def load(path):
    return json.loads(Path(path).read_text(encoding="utf-8"))


def require(condition, message, failures):
    if not condition:
        failures.append(message)


def common(batch, expected_source, failures):
    require(batch.get("schemaVersion") == "earth.signal.batch.v1", "batch schema mismatch", failures)
    require(batch.get("source", {}).get("sourceId") == expected_source, "sourceId mismatch", failures)
    require(batch.get("sourceRecordCount") == batch.get("canonicalRecordCount") + batch.get("rejectedCount"),
            "source/canonical/rejected count mismatch", failures)
    for index, signal in enumerate(batch.get("signals", [])):
        prefix = f"signal[{index}]"
        require(bool(signal.get("signalId")), f"{prefix} signalId missing", failures)
        require(bool(signal.get("revision")), f"{prefix} revision missing", failures)
        require(signal.get("receivedAt") is not None, f"{prefix} receivedAt missing", failures)
        require(signal.get("source", {}).get("sourceId") == expected_source,
                f"{prefix} sourceId mismatch", failures)


def audit_warning(source, batch, failures):
    rows = list(source.get("active", [])) + list(source.get("upcoming", []))
    common(batch, "kma.weather-warning.wrn-now-data", failures)
    require(len(rows) == len(batch.get("signals", [])), "warning row count drift", failures)
    expected = sorted((str(row.get("regionId")), str(row.get("kind")), str(row.get("issuedKst"))) for row in rows)
    actual = sorted((str(sig.get("region", {}).get("sourceRegionCode")),
                     str(sig.get("quality", {}).get("warningKind")),
                     str((sig.get("sourceTimeRaw") or {}).get("issuedAt")))
                    for sig in batch.get("signals", []))
    require(expected == actual, "warning identity/value/time drift", failures)
    source_index = {(str(row.get("regionId")), str(row.get("kind")), str(row.get("issuedKst"))): row
                    for row in rows}
    for sig in batch.get("signals", []):
        key = (str(sig.get("region", {}).get("sourceRegionCode")),
               str(sig.get("quality", {}).get("warningKind")),
               str((sig.get("sourceTimeRaw") or {}).get("issuedAt")))
        row = source_index.get(key, {})
        require(sig.get("sourceValue") == row.get("level"), "warning level drift", failures)
        require(sig.get("quality", {}).get("command") == row.get("command"), "warning command drift", failures)
        require(sig.get("region", {}).get("sourceParentRegionCode") == row.get("parentId"),
                "warning parent region drift", failures)
        require(sig.get("geometry") is None, "warning representative point promoted to geometry", failures)
        require(sig.get("missingReason") == "REGION_UNMAPPED", "warning missingReason drift", failures)
        require(sig.get("quality", {}).get("status") == "UNKNOWN", "warning quality promoted", failures)


def audit_temperature(source, batch, failures):
    rows = source.get("stations", [])
    common(batch, "kma.aws-1min.temperature", failures)
    require(len(rows) == len(batch.get("signals", [])) + batch.get("rejectedCount", 0),
            "temperature row count drift", failures)
    expected = {str(row.get("id")): row.get("ta") for row in rows if row.get("id") is not None}
    for sig in batch.get("signals", []):
        station = str(sig.get("quality", {}).get("stationId"))
        raw = expected.get(station)
        require(sig.get("sourceValue") == raw, f"temperature source value drift: {station}", failures)
        if raw is None:
            require(sig.get("value") is None and sig.get("missingReason") == "NOT_REPORTED",
                    f"temperature missingness drift: {station}", failures)
        else:
            require(float(sig.get("value")) == float(raw), f"temperature value drift: {station}", failures)
            require(sig.get("unit") == "Cel", f"temperature unit drift: {station}", failures)


def audit_tpw(source, batch, failures):
    values = source.get("tpw", [])
    common(batch, "noaa.ncep.gfs.pwat-0p25-f000", failures)
    require(len(values) == source.get("nx", 0) * source.get("ny", 0), "TPW source shape invalid", failures)
    require(len(values) == len(batch.get("signals", [])), "TPW canonical shape drift", failures)
    for index, (raw, sig) in enumerate(zip(values, batch.get("signals", []))):
        require(sig.get("sourceValue") == raw, f"TPW source value drift: {index}", failures)
        if raw is None:
            require(sig.get("value") is None and sig.get("missingReason") == "NOT_REPORTED",
                    f"TPW missingness drift: {index}", failures)
        else:
            require(float(sig.get("value")) == float(raw), f"TPW value drift: {index}", failures)
            require(sig.get("unit") == "mm", f"TPW unit drift: {index}", failures)
        require(sig.get("observedAt") is None, f"TPW model field promoted to observation: {index}", failures)


def main():
    parser = argparse.ArgumentParser()
    for name in ("warning_source", "warning_batch", "temperature_source", "temperature_batch", "tpw_source", "tpw_batch"):
        parser.add_argument(f"--{name.replace('_', '-')}", required=True)
    args = parser.parse_args()
    failures = []
    warning_source, warning_batch = load(args.warning_source), load(args.warning_batch)
    temperature_source, temperature_batch = load(args.temperature_source), load(args.temperature_batch)
    tpw_source, tpw_batch = load(args.tpw_source), load(args.tpw_batch)
    audit_warning(warning_source, warning_batch, failures)
    audit_temperature(temperature_source, temperature_batch, failures)
    audit_tpw(tpw_source, tpw_batch, failures)
    result = {
        "schemaVersion": "earthus.canonical-dual-read-audit.v1",
        "status": "FAIL" if failures else "PASS",
        "authoritativeReaderChanged": False,
        "counts": {
            "warning": warning_batch.get("canonicalRecordCount"),
            "temperature": temperature_batch.get("canonicalRecordCount"),
            "tpw": tpw_batch.get("canonicalRecordCount"),
        },
        "failures": failures,
    }
    print(json.dumps(result, ensure_ascii=False, indent=2))
    raise SystemExit(1 if failures else 0)


if __name__ == "__main__":
    main()
