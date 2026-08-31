#!/usr/bin/env python3
"""Build deterministic EARTHUS V2 physical-surface assets."""

import argparse
import hashlib
import json
from pathlib import Path

from PIL import Image, ImageDraw


ROOT = Path(__file__).resolve().parents[1]
COUNTRIES = ROOT / 'prototype' / 'data' / 'country-reference.json'
OUT = ROOT / 'prototype' / 'v2' / 'assets' / 'physical-earth'
MASK_SIZE = (2048, 1024)
NORMAL_SIZE = (512, 512)
NORMAL_SOURCE_URL = (
    'https://cdn.jsdelivr.net/npm/cesium@1.143.0/Build/Cesium/'
    'Assets/Textures/waterNormalsSmall.jpg'
)


def sha256(path):
    return hashlib.sha256(path.read_bytes()).hexdigest()


def point(lon, lat):
    width, height = MASK_SIZE
    return (
        (float(lon) + 180.0) / 360.0 * (width - 1),
        (90.0 - float(lat)) / 180.0 * (height - 1),
    )


def polygons(geometry):
    if geometry['type'] == 'Polygon':
        return [geometry['coordinates']]
    if geometry['type'] == 'MultiPolygon':
        return geometry['coordinates']
    raise ValueError(f"UNSUPPORTED_GEOMETRY:{geometry['type']}")


def draw_polygon(draw, polygon):
    if not polygon:
        return
    draw.polygon([point(*coord[:2]) for coord in polygon[0]], fill=0)
    for hole in polygon[1:]:
        draw.polygon([point(*coord[:2]) for coord in hole], fill=255)


def build_mask():
    payload = json.loads(COUNTRIES.read_text())
    if payload.get('source') != 'Natural Earth admin 0 countries':
        raise ValueError('NATURAL_EARTH_SOURCE_GATE')
    if payload.get('license') != 'Public domain':
        raise ValueError('NATURAL_EARTH_LICENSE_GATE')
    image = Image.new('L', MASK_SIZE, 255)
    draw = ImageDraw.Draw(image)
    for feature in payload['features']:
        for polygon in polygons(feature['geometry']):
            draw_polygon(draw, polygon)
    path = OUT / 'ocean-specular-mask.png'
    image.save(path, format='PNG', optimize=True)
    return path, payload


def build_normal(source):
    with Image.open(source) as image:
        normal = image.convert('RGB').resize(NORMAL_SIZE, Image.Resampling.LANCZOS)
    path = OUT / 'water-normal.jpg'
    normal.save(path, format='JPEG', quality=92, optimize=True, progressive=True)
    return path


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('--water-normal-source', type=Path, required=True)
    args = parser.parse_args()
    if not args.water_normal_source.is_file():
        raise SystemExit('WATER_NORMAL_SOURCE_REQUIRED')
    OUT.mkdir(parents=True, exist_ok=True)
    mask_path, source = build_mask()
    normal_path = build_normal(args.water_normal_source)
    manifest = {
        'schemaVersion': 'earthus.physical-earth-assets.v1',
        'oceanMask': {
            'path': mask_path.name,
            'sha256': sha256(mask_path),
            'source': source['source'],
            'sourceUrl': source['sourceUrl'],
            'license': source['license'],
            'meaning': 'white=ocean specular response; black=Natural Earth land polygon',
        },
        'waterNormal': {
            'path': normal_path.name,
            'sha256': sha256(normal_path),
            'source': 'CesiumJS 1.143 waterNormalsSmall.jpg',
            'sourceUrl': NORMAL_SOURCE_URL,
            'license': 'Apache-2.0',
            'meaning': 'rendering-only surface-normal perturbation; not observed wave data',
        },
    }
    (OUT / 'manifest.json').write_text(
        json.dumps(manifest, ensure_ascii=False, indent=2) + '\n'
    )


if __name__ == '__main__':
    main()
