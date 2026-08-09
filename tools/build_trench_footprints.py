#!/usr/bin/env python3
"""GEBCO 0.1도 격자에서 카탈로그 최심점과 연결된 6,000m 이상 심해 윤곽을 만든다.

이 결과는 해구의 공식 경계가 아니다. NOAA가 설명하는 하달대(6,000~11,000m)를
같은 기준으로 잘라, 점 대신 실제 격자에서 이어진 깊은 영역을 비교하기 위한 것이다.
"""

from __future__ import annotations

import argparse
import json
import math
from collections import deque
from datetime import datetime, timezone
from pathlib import Path

import matplotlib
import numpy as np
from PIL import Image


matplotlib.use("Agg")
from matplotlib import pyplot as plt  # noqa: E402


ROOT = Path(__file__).resolve().parents[1]
SHAPE = (1_800, 3_600)
RESOLUTION = 0.1
THRESHOLD_M = 6_000
EARTH_RADIUS_KM = 6_371.0088
HADAL_SOURCE = "https://oceanexplorer.noaa.gov/expedition-feature/okeanos-ex2102-features-hadalzone/"


def grid_index(lat: float, lon: float) -> tuple[int, int]:
    row = max(0, min(SHAPE[0] - 1, int((lat + 90) / RESOLUTION)))
    col = int((lon + 180) / RESOLUTION) % SHAPE[1]
    return row, col


def nearest_deep(mask: np.ndarray, row: int, col: int, limit: int = 80) -> tuple[int, int] | None:
    for distance in range(limit + 1):
        candidates = []
        for candidate_row in range(max(0, row - distance), min(SHAPE[0], row + distance + 1)):
            for raw_col in range(col - distance, col + distance + 1):
                candidate_col = raw_col % SHAPE[1]
                if mask[candidate_row, candidate_col]:
                    candidates.append((abs(candidate_row - row) + abs(raw_col - col), candidate_row, candidate_col))
        if candidates:
            _, found_row, found_col = min(candidates)
            return found_row, found_col
    return None


def connected_cells(mask: np.ndarray, start: tuple[int, int]) -> set[tuple[int, int]]:
    queue = deque([start])
    cells = {start}
    while queue:
        row, col = queue.popleft()
        for next_row, next_col in ((row - 1, col), (row + 1, col),
                                   (row, (col - 1) % SHAPE[1]), (row, (col + 1) % SHAPE[1])):
            point = (next_row, next_col)
            if 0 <= next_row < SHAPE[0] and mask[point] and point not in cells:
                cells.add(point)
                queue.append(point)
    return cells


def polygon_area(points: list[list[float]]) -> float:
    return sum(points[index][0] * points[(index + 1) % len(points)][1]
               - points[(index + 1) % len(points)][0] * points[index][1]
               for index in range(len(points))) / 2


def perpendicular_distance(point: list[float], start: list[float], end: list[float]) -> float:
    dx, dy = end[0] - start[0], end[1] - start[1]
    if dx == 0 and dy == 0:
        return math.dist(point, start)
    return abs(dy * point[0] - dx * point[1] + end[0] * start[1] - end[1] * start[0]) / math.hypot(dx, dy)


def rdp(points: list[list[float]], tolerance: float) -> list[list[float]]:
    if len(points) <= 2:
        return points
    distances = [perpendicular_distance(point, points[0], points[-1]) for point in points[1:-1]]
    maximum = max(distances, default=0)
    if maximum <= tolerance:
        return [points[0], points[-1]]
    index = distances.index(maximum) + 1
    return rdp(points[:index + 1], tolerance)[:-1] + rdp(points[index:], tolerance)


def simplify_closed(points: list[list[float]], tolerance: float = 0.055) -> list[list[float]]:
    if points[0] == points[-1]:
        points = points[:-1]
    west = min(range(len(points)), key=lambda index: points[index][0])
    east = max(range(len(points)), key=lambda index: points[index][0])
    if west > east:
        west, east = east, west
    first = rdp(points[west:east + 1], tolerance)
    second = rdp(points[east:] + points[:west + 1], tolerance)
    output = first[:-1] + second[:-1]
    output.append(output[0])
    return [[round(lon, 4), round(lat, 4)] for lon, lat in output]


def outer_ring(cells: set[tuple[int, int]]) -> list[list[float]]:
    rows = [row for row, _ in cells]
    cols = [col for _, col in cells]
    row_min, row_max = min(rows), max(rows)
    col_min, col_max = min(cols), max(cols)
    local = np.zeros((row_max - row_min + 3, col_max - col_min + 3), dtype=np.uint8)
    for row, col in cells:
        local[row - row_min + 1, col - col_min + 1] = 1
    figure, axis = plt.subplots(figsize=(2, 2))
    contour = axis.contour(local, levels=[0.5])
    segments = contour.allsegs[0]
    plt.close(figure)
    if not segments:
        raise RuntimeError("윤곽선을 만들 수 없음")
    candidates = []
    for segment in segments:
        ring = []
        for local_col, local_row in segment:
            global_col = col_min - 1 + local_col
            global_row = row_min - 1 + local_row
            ring.append([
                -180 + (global_col + 0.5) * RESOLUTION,
                -90 + (global_row + 0.5) * RESOLUTION,
            ])
        candidates.append(ring)
    return simplify_closed(max(candidates, key=lambda ring: abs(polygon_area(ring))))


def component_area_km2(cells: set[tuple[int, int]]) -> float:
    longitude = math.radians(RESOLUTION)
    total = 0.0
    for row, _ in cells:
        south = math.radians(-90 + row * RESOLUTION)
        north = math.radians(-90 + (row + 1) * RESOLUTION)
        total += EARTH_RADIUS_KM ** 2 * longitude * (math.sin(north) - math.sin(south))
    return total


def base_name(item: dict, language: str) -> str:
    return item["name"][language].split(" · ", 1)[0]


def build_basemap(grid: np.ndarray, output: Path) -> None:
    """구름·도시·실시간 레이어가 없는 GEBCO 전용 저용량 지구면을 만든다."""
    elevation = np.asarray(grid, dtype=np.float32)
    colors = np.empty((*SHAPE, 3), dtype=np.uint8)
    ocean = elevation < 0
    depth = np.clip(-elevation, 0, 11_000)
    ocean_stops = np.array([0, 1_000, 4_000, 6_000, 11_000], dtype=np.float32)
    ocean_colors = np.array([
        [24, 102, 121], [12, 72, 96], [6, 39, 67], [4, 23, 45], [1, 5, 16],
    ], dtype=np.float32)
    for channel in range(3):
        colors[..., channel] = np.interp(depth, ocean_stops, ocean_colors[:, channel]).astype(np.uint8)
    land_height = np.clip(elevation, 0, 5_000)
    land_stops = np.array([0, 1_000, 3_000, 5_000], dtype=np.float32)
    land_colors = np.array([[20, 31, 31], [34, 48, 42], [56, 63, 49], [82, 78, 61]], dtype=np.float32)
    for channel in range(3):
        land_channel = np.interp(land_height, land_stops, land_colors[:, channel]).astype(np.uint8)
        colors[..., channel] = np.where(ocean, colors[..., channel], land_channel)
    # 원시 격자는 남→북이고 이미지 타일은 북→남이다.
    image = Image.fromarray(colors[::-1])
    image.thumbnail((2048, 1024), Image.Resampling.LANCZOS)
    output.parent.mkdir(parents=True, exist_ok=True)
    image.save(output, "WEBP", quality=84, method=6)


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--grid", type=Path, default=ROOT / ".cache/gebco/depth-grid.bin")
    parser.add_argument("--manifest", type=Path, default=ROOT / ".cache/gebco/depth-grid.manifest.json")
    parser.add_argument("--catalog", type=Path, default=ROOT / "prototype/data/trenches.json")
    parser.add_argument("--output", type=Path, default=ROOT / "prototype/data/trench-footprints.json")
    parser.add_argument("--basemap", type=Path, default=ROOT / "prototype/data/trench-bathymetry.webp")
    args = parser.parse_args()

    manifest = json.loads(args.manifest.read_text(encoding="utf-8"))
    if tuple(manifest["output"]["shape"]) != SHAPE or manifest["output"]["resolutionDegrees"] != RESOLUTION:
        raise SystemExit("FAIL: 지원하지 않는 격자 구조")
    grid = np.memmap(args.grid, dtype="<i2", mode="r", shape=SHAPE)
    mask = grid <= -THRESHOLD_M
    items = json.loads(args.catalog.read_text(encoding="utf-8"))["items"]
    groups: dict[tuple[int, int], dict] = {}

    for item in items:
        start = nearest_deep(mask, *grid_index(float(item["lat"]), float(item["lon"])))
        if start is None:
            continue
        cells = connected_cells(mask, start)
        signature = min(cells)
        group = groups.setdefault(signature, {"cells": cells, "items": []})
        group["items"].append(item)

    features = []
    for group in groups.values():
        group_items = sorted(group["items"], key=lambda item: item["id"])
        representative = max(group_items, key=lambda item: item["depthMax"])
        ring = outer_ring(group["cells"])
        names_ko = list(dict.fromkeys(base_name(item, "ko") for item in group_items))
        names_en = list(dict.fromkeys(base_name(item, "en") for item in group_items))
        features.append({
            "id": representative["id"].replace("-deep", "") + "-hadal-footprint",
            "name": {"ko": " · ".join(names_ko), "en": " · ".join(names_en)},
            "representativeId": representative["id"],
            "deepIds": [item["id"] for item in group_items],
            "thresholdDepthM": THRESHOLD_M,
            "areaKm2": round(component_area_km2(group["cells"])),
            "cellCount": len(group["cells"]),
            "label": [representative["lon"], representative["lat"]],
            "bounds": {
                "west": min(point[0] for point in ring), "south": min(point[1] for point in ring),
                "east": max(point[0] for point in ring), "north": max(point[1] for point in ring),
            },
            "ring": ring,
        })
    features.sort(key=lambda feature: feature["areaKm2"], reverse=True)
    build_basemap(grid, args.basemap)
    document = {
        "schema": "earthus.trench-footprints.v1",
        "generatedAt": datetime.now(timezone.utc).isoformat(),
        "thresholdDepthM": THRESHOLD_M,
        "definition": {
            "ko": "카탈로그 최심점과 4방향으로 연결된 GEBCO 2026 격자 중 수심 6,000m 이상 영역",
            "en": "GEBCO 2026 cells at least 6,000 m deep, four-neighbor connected to each catalogued deep point",
        },
        "source": manifest["source"],
        "grid": {**manifest["output"], "method": manifest["method"]},
        "classificationSource": {"title": "NOAA Ocean Exploration · The Hadal Zone", "url": HADAL_SOURCE},
        "basemap": {
            "path": args.basemap.relative_to(ROOT / "prototype").as_posix(),
            "size": [2048, 1024],
            "method": "GEBCO 2026 0.1-degree minimum-depth grid recolored as a static cloud-free equirectangular image",
        },
        "limitations": {
            "ko": "해구의 공식 경계나 전체 면적이 아닙니다. 약 11km 격자에서 6,000m보다 깊은 연결 영역이며, 관측과 보간이 섞인 GEBCO 자료의 해상도에 따라 달라집니다. 항해·안전에 사용하지 마세요.",
            "en": "Not an official trench boundary or total area. It is the connected area deeper than 6,000 m in an ~11 km grid and varies with GEBCO's mixed measured/interpolated coverage. Never use for navigation or safety.",
        },
        "features": features,
    }
    args.output.parent.mkdir(parents=True, exist_ok=True)
    args.output.write_text(json.dumps(document, ensure_ascii=False, separators=(",", ":")) + "\n", encoding="utf-8")
    print(f"PASS: {len(features)} connected footprints; {sum(feature['cellCount'] for feature in features)} cells; {args.output.stat().st_size} bytes; basemap {args.basemap.stat().st_size} bytes")
    for feature in features:
        print(f"  {feature['id']}: {feature['areaKm2']:,} km², {len(feature['ring'])} vertices, {feature['deepIds']}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
