import importlib.util
import unittest
from datetime import datetime, timezone
from pathlib import Path

import numpy as np


ROOT = Path(__file__).resolve().parents[1]
CORE_PATH = ROOT / 'aws' / 'gfs-cloud-global-low' / 'core.py'
SPEC = importlib.util.spec_from_file_location('earthus_gfs_global_low_core', CORE_PATH)
CORE = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(CORE)


class GfsCloudGlobalLowTest(unittest.TestCase):
    def test_official_gfs_1_degree_analysis_url_is_global_and_bounded_by_fields(self):
        run = datetime(2026, 8, 30, 18, tzinfo=timezone.utc)
        url = CORE.url_for(run)
        self.assertIn('filter_gfs_1p00.pl', url)
        self.assertIn('file=gfs.t18z.pgrb2.1p00.f000', url)
        self.assertIn('dir=%2Fgfs.20260830%2F18%2Fatmos', url)
        self.assertIn('var_TCDC=on', url)
        self.assertIn('var_HGT=on', url)
        self.assertNotIn('var_CLWMR=on', url)
        self.assertNotIn('var_ICMR=on', url)
        self.assertIn('leftlon=0', url)
        self.assertIn('rightlon=360', url)
        self.assertIn('toplat=90', url)
        self.assertIn('bottomlat=-90', url)

    def test_global_axes_are_south_to_north_and_minus_180_to_180(self):
        lat = np.array([[30, 30, 30, 30], [-30, -30, -30, -30]], dtype=np.float32)
        lon = np.array([[0, 90, 180, 270], [0, 90, 180, 270]], dtype=np.float32)
        source = np.arange(8, dtype=np.float32).reshape(2, 4)
        fields, normalized_lat, normalized_lon, diagnostics = CORE.normalize_global_axes(
            {('TCDC', 900): source}, lat, lon
        )
        self.assertEqual(normalized_lat[:, 0].tolist(), [-30, 30])
        self.assertEqual(normalized_lon[0].tolist(), [-180, -90, 0, 90])
        self.assertEqual(fields[('TCDC', 900)].tolist(), [[6, 7, 4, 5], [2, 3, 0, 1]])
        self.assertEqual(diagnostics['latitudeOrder'], 'SOUTH_TO_NORTH')
        self.assertEqual(diagnostics['longitudeOrder'], 'WEST_TO_EAST_DATELINE_NORMALIZED')

    def test_real_hgt_assigns_tcdc_to_zero_thickness_global_altitude_planes(self):
        shape = (2, 4)
        lat = np.array([[-30] * 4, [30] * 4], dtype=np.float32)
        lon = np.array([[-180, -90, 0, 90]] * 2, dtype=np.float32)
        fields = {
            ('HGT', 900): np.full(shape, 1_000, dtype=np.float32),
            ('TCDC', 900): np.array([[10, 20, 30, 40], [50, 60, 70, 80]], dtype=np.float32),
            ('HGT', 600): np.full(shape, 5_000, dtype=np.float32),
            ('TCDC', 600): np.array([[20, 30, 40, 50], [60, 70, 80, 90]], dtype=np.float32),
            ('HGT', 300): np.full(shape, 10_000, dtype=np.float32),
            ('TCDC', 300): np.array([[30, 40, 50, 60], [70, 80, 90, 100]], dtype=np.float32),
        }
        payload, metadata = CORE.build_global_layers(fields, lat, lon, shape)
        self.assertEqual(len(payload), 2 * 4 * 3)
        self.assertEqual(metadata['dimensions'], {'x': 4, 'y': 2, 'bands': 3})
        self.assertEqual(metadata['boundsDegrees'], {
            'west': -180.0, 'east': 180.0, 'south': -30.0, 'north': 30.0
        })
        self.assertEqual([layer['id'] for layer in metadata['layers']], ['LOW', 'MID', 'HIGH'])
        self.assertEqual([layer['representativeAltitudeM'] for layer in metadata['layers']], [1000, 5000, 10000])
        self.assertEqual(metadata['renderContract'], 'ZERO_THICKNESS_PLANES_NO_FAKE_CLOUD_VOLUME')
        self.assertFalse(metadata['fakeThickness'])
        self.assertEqual(metadata['sourceGrid'], 'NOAA_GFS_1P00_ANALYSIS')
        density = np.frombuffer(payload, dtype=np.uint8).reshape(3, 2, 4)
        self.assertEqual(density[0, 0, 0], round(10 / 100 * 255))
        self.assertEqual(density[1, 1, 3], round(90 / 100 * 255))
        self.assertEqual(density[2, 1, 3], 255)

    def test_missing_vertical_band_and_nonfinite_data_fail_closed(self):
        shape = (1, 2)
        lat = np.array([[0, 0]], dtype=np.float32)
        lon = np.array([[-180, 0]], dtype=np.float32)
        missing_high = {
            ('HGT', 900): np.full(shape, 1_000, dtype=np.float32),
            ('TCDC', 900): np.full(shape, 50, dtype=np.float32),
            ('HGT', 600): np.full(shape, 5_000, dtype=np.float32),
            ('TCDC', 600): np.full(shape, 50, dtype=np.float32),
            ('HGT', 400): np.full(shape, 6_500, dtype=np.float32),
            ('TCDC', 400): np.full(shape, 50, dtype=np.float32),
        }
        with self.assertRaisesRegex(RuntimeError, 'GFS_GLOBAL_EMPTY_BAND:HIGH'):
            CORE.build_global_layers(missing_high, lat, lon, shape)
        nonfinite = dict(missing_high)
        nonfinite[('HGT', 300)] = np.full(shape, 10_000, dtype=np.float32)
        nonfinite[('TCDC', 300)] = np.array([[np.nan, 50]], dtype=np.float32)
        with self.assertRaisesRegex(RuntimeError, 'GFS_GLOBAL_TCDC_NONFINITE'):
            CORE.build_global_layers(nonfinite, lat, lon, shape)


if __name__ == '__main__':
    unittest.main()
