import hashlib
import json
import unittest
from pathlib import Path

from PIL import Image


ROOT = Path(__file__).resolve().parents[1]
ASSET_DIR = ROOT / 'prototype' / 'v2' / 'assets' / 'physical-earth'


def pixel_for_lon_lat(image, lon, lat):
    x = round((lon + 180.0) / 360.0 * (image.width - 1))
    y = round((90.0 - lat) / 180.0 * (image.height - 1))
    return image.getpixel((x, y))


class PhysicalSurfaceAssetsTest(unittest.TestCase):
    def test_natural_earth_mask_and_water_normal_are_release_assets(self):
        manifest_path = ASSET_DIR / 'manifest.json'
        manifest = json.loads(manifest_path.read_text())
        self.assertEqual(manifest['schemaVersion'], 'earthus.physical-earth-assets.v1')
        self.assertEqual(manifest['oceanMask']['source'], 'Natural Earth admin 0 countries')
        self.assertEqual(manifest['oceanMask']['license'], 'Public domain')

        mask_path = ASSET_DIR / manifest['oceanMask']['path']
        normal_path = ASSET_DIR / manifest['waterNormal']['path']
        self.assertEqual(hashlib.sha256(mask_path.read_bytes()).hexdigest(), manifest['oceanMask']['sha256'])
        self.assertEqual(hashlib.sha256(normal_path.read_bytes()).hexdigest(), manifest['waterNormal']['sha256'])

        with Image.open(mask_path) as mask:
            self.assertEqual(mask.size, (2048, 1024))
            self.assertLess(pixel_for_lon_lat(mask, 127.5, 36.5), 32)  # Korea land
            self.assertLess(pixel_for_lon_lat(mask, 86.9, 28.0), 32)   # Himalaya land
            self.assertGreater(pixel_for_lon_lat(mask, -150.0, 0.0), 223)  # Pacific ocean

        with Image.open(normal_path) as normal:
            self.assertEqual(normal.size, (512, 512))
            self.assertEqual(normal.mode, 'RGB')


if __name__ == '__main__':
    unittest.main()
