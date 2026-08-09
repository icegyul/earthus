#!/usr/bin/env python3
"""GEBCO 15초 원본을 earthus 0.1도 최심 수심 격자로 축소한다.

각 0.1도 셀의 24x24 원본값 중 최솟값을 보존한다. 평균이나 한 점 샘플은
해구를 지워 버리므로 허용하지 않는다. 출력은 남→북, 서→동 순서의 little-endian
int16 원시 배열(1800 x 3600)이며 육지는 양수, 바다는 음수다.
"""

from __future__ import annotations

import argparse
import hashlib
import json
import os
from datetime import datetime, timezone
from pathlib import Path

import numpy as np


SOURCE_TITLE = "The GEBCO_2026 Grid"
SOURCE_DOI = "10.5285/4f68d5c7-45eb-f999-e063-7086abc036fa"
SOURCE_CREDIT = (
    "GEBCO Bathymetric Compilation Group 2026 (2026). The GEBCO_2026 Grid - "
    "a continuous terrain model for oceans and land at 15 arc-second intervals."
)
SOURCE_URL = "https://www.gebco.net/data-products-gridded-bathymetry-data/gebco2026-grid"
SOURCE_SHAPE = (43_200, 86_400)
SOURCE_CELLS_PER_TARGET = 24
TARGET_SHAPE = (1_800, 3_600)


def sha256(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as handle:
        for chunk in iter(lambda: handle.read(1024 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest()


def grid_index(lat: float, lon: float) -> tuple[int, int]:
    row = min(TARGET_SHAPE[0] - 1, max(0, int((lat + 90.0) / 0.1)))
    col = min(TARGET_SHAPE[1] - 1, max(0, int((lon + 180.0) / 0.1)))
    return row, col


def minimum_bins(block: np.ndarray, cells: int = SOURCE_CELLS_PER_TARGET) -> np.ndarray:
    if block.ndim != 2 or block.shape[0] != cells or block.shape[1] % cells:
        raise ValueError(f"축소 블록 크기 오류: {block.shape}, cells={cells}")
    return block.reshape(cells, block.shape[1] // cells, cells).min(axis=(0, 2))


def sample(grid: np.memmap, name: str, lat: float, lon: float) -> dict[str, object]:
    row, col = grid_index(lat, lon)
    return {
        "name": name,
        "lat": lat,
        "lon": lon,
        "row": row,
        "col": col,
        "cellMinimumElevationM": int(grid[row, col]),
    }


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--input", required=True, type=Path, help="GEBCO_2026.nc")
    parser.add_argument("--output", required=True, type=Path, help="depth-grid.bin")
    parser.add_argument("--manifest", type=Path, help="기본값: 출력명.manifest.json")
    args = parser.parse_args()

    try:
        import netCDF4
    except ImportError as error:
        raise SystemExit("netCDF4 필요: python3 -m pip install netCDF4") from error

    manifest_path = args.manifest or args.output.with_suffix(".manifest.json")
    args.output.parent.mkdir(parents=True, exist_ok=True)
    manifest_path.parent.mkdir(parents=True, exist_ok=True)
    temporary = args.output.with_suffix(args.output.suffix + ".partial")

    with netCDF4.Dataset(args.input, "r") as dataset:
        if "elevation" not in dataset.variables:
            raise SystemExit("elevation 변수가 없음")
        elevation = dataset.variables["elevation"]
        if tuple(elevation.shape) != SOURCE_SHAPE:
            raise SystemExit(f"원본 크기 불일치: {elevation.shape}, 기대 {SOURCE_SHAPE}")
        doi = str(getattr(dataset, "identifier_product_doi", ""))
        if SOURCE_DOI not in doi:
            raise SystemExit(f"GEBCO_2026 DOI 불일치: {doi or '없음'}")

        grid = np.memmap(temporary, dtype="<i2", mode="w+", shape=TARGET_SHAPE)
        for target_row in range(TARGET_SHAPE[0]):
            start = target_row * SOURCE_CELLS_PER_TARGET
            stop = start + SOURCE_CELLS_PER_TARGET
            block = np.asarray(elevation[start:stop, :], dtype=np.int16)
            if block.shape != (SOURCE_CELLS_PER_TARGET, SOURCE_SHAPE[1]):
                raise SystemExit(f"원본 행 블록 누락: {start}:{stop} -> {block.shape}")
            # ⚠️ 평균 금지. 위도 24행과 경도 24열 전체에서 최솟값을 취한다.
            grid[target_row, :] = minimum_bins(block)
            if target_row % 100 == 0:
                print(f"{target_row}/{TARGET_SHAPE[0]} rows", flush=True)
        grid.flush()

        samples = [
            sample(grid, "마리아나 해구 부근", 11.37, 142.59),
            sample(grid, "서해", 37.0, 124.0),
            sample(grid, "동해", 38.0, 131.0),
        ]
        del grid

    os.replace(temporary, args.output)
    manifest = {
        "schema": "earthus.depth-grid-manifest.v1",
        "generatedAt": datetime.now(timezone.utc).isoformat(),
        "source": {
            "title": SOURCE_TITLE,
            "doi": SOURCE_DOI,
            "url": SOURCE_URL,
            "credit": SOURCE_CREDIT,
            "created": "2026-04-17",
            "resolution": "15 arc-second",
            "verticalDatum": "mean sea level (source grids may vary in shallow water)",
        },
        "method": "minimum of each 24x24 source-cell block; no averaging or point sampling",
        "output": {
            "path": args.output.name,
            "dtype": "int16 little-endian",
            "shape": list(TARGET_SHAPE),
            "rowOrder": "south-to-north",
            "columnOrder": "west-to-east",
            "resolutionDegrees": 0.1,
            "bytes": args.output.stat().st_size,
            "sha256": sha256(args.output),
        },
        "samples": samples,
        "limitations": [
            "Not for navigation or safety at sea.",
            "Each value is the deepest source cell within an approximately 11 km cell, not a point sounding.",
            "GEBCO combines measured and predicted/interpolated source data of varying quality and coverage.",
        ],
    }
    manifest_path.write_text(json.dumps(manifest, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    print(json.dumps(manifest["samples"], ensure_ascii=False, indent=2))
    print(f"PASS {args.output} {manifest['output']['sha256']}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
