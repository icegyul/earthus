#!/usr/bin/env python3
"""earthus 수심 격자의 크기·체크섬·대표 해역을 독립 재검증한다."""

import argparse
import hashlib
import json
import struct
from pathlib import Path


EXPECTED_SHAPE = [1_800, 3_600]
EXPECTED_RESOLUTION = 0.1
CHECKS = {
    "마리아나 해구 부근": (-12_000, -9_000),
    "서해": (-500, 0),
    "동해": (-5_000, -500),
}


def sha256(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as handle:
        for chunk in iter(lambda: handle.read(1024 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest()


def read_cell(handle, cols: int, row: int, col: int) -> int:
    handle.seek((row * cols + col) * 2)
    raw = handle.read(2)
    if len(raw) != 2:
        raise ValueError(f"셀 누락: row={row}, col={col}")
    return struct.unpack("<h", raw)[0]


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--grid", required=True, type=Path)
    parser.add_argument("--manifest", required=True, type=Path)
    args = parser.parse_args()

    manifest = json.loads(args.manifest.read_text(encoding="utf-8"))
    output = manifest.get("output", {})
    if manifest.get("schema") != "earthus.depth-grid-manifest.v1":
        raise SystemExit("FAIL: manifest schema")
    if output.get("shape") != EXPECTED_SHAPE:
        raise SystemExit(f"FAIL: shape {output.get('shape')}")
    if output.get("resolutionDegrees") != EXPECTED_RESOLUTION:
        raise SystemExit(f"FAIL: resolution {output.get('resolutionDegrees')}")
    expected_bytes = EXPECTED_SHAPE[0] * EXPECTED_SHAPE[1] * 2
    if args.grid.stat().st_size != expected_bytes or output.get("bytes") != expected_bytes:
        raise SystemExit("FAIL: byte size")
    actual_sha = sha256(args.grid)
    if actual_sha != output.get("sha256"):
        raise SystemExit("FAIL: SHA256 MISMATCH")

    samples = {item.get("name"): item for item in manifest.get("samples", [])}
    with args.grid.open("rb") as handle:
        for name, (minimum, maximum) in CHECKS.items():
            item = samples.get(name)
            if not item:
                raise SystemExit(f"FAIL: sample missing: {name}")
            value = read_cell(handle, EXPECTED_SHAPE[1], int(item["row"]), int(item["col"]))
            if value != item.get("cellMinimumElevationM"):
                raise SystemExit(f"FAIL: manifest sample mismatch: {name}")
            if not minimum <= value <= maximum:
                raise SystemExit(f"FAIL: sample range: {name}={value}m expected {minimum}..{maximum}")
            print(f"PASS: {name} {value}m")
    limitations = " ".join(manifest.get("limitations", [])).lower()
    if "not for navigation" not in limitations:
        raise SystemExit("FAIL: navigation limitation missing")
    print(f"PASS: depth grid {expected_bytes} bytes sha256={actual_sha}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
