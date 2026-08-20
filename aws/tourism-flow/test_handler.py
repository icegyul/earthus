import importlib.util
import json
import os
import sys
import types
import unittest
from collections import Counter
from datetime import datetime, timedelta, timezone
from pathlib import Path


class Body:
    def __init__(self, value):
        self.value = value

    def read(self):
        return self.value


class FakeS3:
    def __init__(self):
        self.objects = {}
        self.puts = []

    def get_object(self, Bucket, Key):  # noqa: N803
        if Key not in self.objects:
            raise KeyError(Key)
        return {"Body": Body(self.objects[Key])}

    def put_object(self, **kwargs):
        self.puts.append(kwargs)
        self.objects[kwargs["Key"]] = kwargs["Body"]


def catalog():
    return [{"code": f"POI{i:03d}", "category": "테스트", "nameKo": "광화문·덕수궁" if i == 9 else f"장소 {i}",
             "nameEn": f"Place {i}", "lat": 37.5 + i / 10000, "lon": 127.0}
            for i in range(1, 122)]


def raw(place, observed, level="보통", low=1000, high=1200):
    return {"RESULT": {"CODE": "INFO-000"}, "SeoulRtd.citydata_ppltn": [{
        "AREA_NM": place["nameKo"], "AREA_CD": place["code"], "AREA_CONGEST_LVL": level,
        "AREA_CONGEST_MSG": "기관 설명", "AREA_PPLTN_MIN": str(low), "AREA_PPLTN_MAX": str(high),
        "REPLACE_YN": "N", "PPLTN_TIME": observed.astimezone(timezone(timedelta(hours=9))).strftime("%Y-%m-%d %H:%M"),
        "FCST_YN": "Y", "FCST_PPLTN": [{
            "FCST_TIME": (observed + timedelta(hours=1)).astimezone(timezone(timedelta(hours=9))).strftime("%Y-%m-%d %H:%M"),
            "FCST_CONGEST_LVL": "여유", "FCST_PPLTN_MIN": "800", "FCST_PPLTN_MAX": "900",
        }],
    }]}


class TourismCollectorTest(unittest.TestCase):
    def setUp(self):
        self.fake = FakeS3()
        self.fake.objects["app/data/tourism/seoul-121-catalog.v1.json"] = json.dumps({"places": catalog()}).encode()
        sys.modules["boto3"] = types.SimpleNamespace(client=lambda *args, **kwargs: self.fake)
        self.module = self.load_module()

    def load_module(self, keys=(), legacy_key=None):
        for name in ("SEOUL_OPEN_DATA_KEY", "SEOUL_OPEN_DATA_KEY_1",
                     "SEOUL_OPEN_DATA_KEY_2", "SEOUL_OPEN_DATA_KEY_3"):
            os.environ.pop(name, None)
        if legacy_key:
            os.environ["SEOUL_OPEN_DATA_KEY"] = legacy_key
        for index, key in enumerate(keys, 1):
            os.environ[f"SEOUL_OPEN_DATA_KEY_{index}"] = key
        path = Path(__file__).with_name("handler.py")
        spec = importlib.util.spec_from_file_location("tourism_handler_test", path)
        module = importlib.util.module_from_spec(spec)
        spec.loader.exec_module(module)
        return module

    def test_sample_mode_is_one_official_place_and_writes_evidence(self):
        now = datetime.now(timezone.utc)
        self.module.fetch_area = lambda name, key: raw(catalog()[8], now)
        result = self.module.handler({}, None)
        self.assertTrue(result["ok"])
        self.assertEqual(result["mode"], "SAMPLE")
        snapshot = json.loads(self.fake.objects["app/tourism/seoul-flow.json"])
        self.assertEqual(snapshot["coverage"]["available"], 1)
        self.assertEqual(snapshot["coverage"]["total"], 121)
        self.assertFalse(snapshot["coverage"]["fullCoverage"])
        self.assertEqual(snapshot["places"][0]["state"], "LIVE")
        self.assertIsNone(snapshot["places"][0]["flow"]["direction"]["value"])
        output = next(item for item in self.fake.puts if item["Key"] == "app/tourism/seoul-flow.json")
        self.assertEqual(output["ContentType"], "application/json; charset=utf-8")
        self.assertTrue(any(item["Key"].startswith("app/tourism/history/202") for item in self.fake.puts))
        health = json.loads(self.fake.objects["app/tourism/health.json"])
        self.assertEqual(health["state"], "SUCCEEDED")
        self.assertTrue(health["outputWritten"])
        self.assertEqual(health["sampleCount"], 1)
        self.assertEqual(health["missing"], 120)
        self.assertEqual(health["failureCount"], 0)
        self.assertEqual(health["lastAttemptAt"], health["lastSuccessAt"])
        self.assertIsNotNone(health["sourceObservedAt"])

    def test_failed_run_writes_failed_heartbeat_without_fake_success(self):
        self.module.fetch_area = lambda name, key: (_ for _ in ()).throw(RuntimeError("fixture provider down"))
        with self.assertRaisesRegex(RuntimeError, "SEOUL_PROVIDER_NO_RESPONSES"):
            self.module.handler({}, None)
        health = json.loads(self.fake.objects["app/tourism/health.json"])
        self.assertEqual(health["state"], "FAILED")
        self.assertFalse(health["outputWritten"])
        self.assertEqual(health["sampleCount"], 0)
        self.assertEqual(health["failureCount"], 1)
        self.assertIsNone(health["lastSuccessAt"])
        self.assertIsNotNone(health["lastAttemptAt"])

    def test_full_mode_distributes_121_places_across_all_three_keys(self):
        keys = ("fixture-key-one", "fixture-key-two", "fixture-key-three")
        self.module = self.load_module(keys=keys)
        now = datetime.now(timezone.utc)
        places_by_name = {place["nameKo"]: place for place in catalog()}
        calls = []

        def fetch(name, key):
            calls.append((name, key))
            return raw(places_by_name[name], now)

        self.module.fetch_area = fetch
        result = self.module.handler({}, None)

        self.assertEqual(result["mode"], "FULL")
        self.assertEqual(result["keysConfigured"], 3)
        self.assertEqual(result["keysUsed"], 3)
        self.assertEqual(len(calls), 121)
        self.assertEqual(Counter(key for _, key in calls), {
            "fixture-key-one": 41,
            "fixture-key-two": 40,
            "fixture-key-three": 40,
        })
        health = json.loads(self.fake.objects["app/tourism/health.json"])
        self.assertEqual(health["credentialPool"]["configured"], 3)
        self.assertEqual(health["credentialPool"]["used"], 3)
        self.assertEqual([slot["requested"] for slot in health["credentialPool"]["slots"]],
                         [41, 40, 40])
        public_bytes = b"\n".join(self.fake.objects.values())
        for key in keys:
            self.assertNotIn(key.encode(), public_bytes)

    def test_legacy_single_key_still_enables_full_collection(self):
        self.module = self.load_module(legacy_key="fixture-legacy-key")
        now = datetime.now(timezone.utc)
        places_by_name = {place["nameKo"]: place for place in catalog()}
        self.module.fetch_area = lambda name, key: raw(places_by_name[name], now)

        result = self.module.handler({}, None)

        self.assertEqual(result["mode"], "FULL")
        self.assertEqual(result["keysConfigured"], 1)
        self.assertEqual(result["keysUsed"], 1)

    def test_provider_error_never_serializes_a_credential(self):
        secret = "fixture-secret-must-not-leak"
        self.module = self.load_module(legacy_key=secret)
        now = datetime.now(timezone.utc)
        places_by_name = {place["nameKo"]: place for place in catalog()}

        def fetch(name, key):
            if name == "장소 1":
                raise RuntimeError(f"provider failed at http://example.invalid/{key}/json")
            return raw(places_by_name[name], now)

        self.module.fetch_area = fetch
        result = self.module.handler({}, None)

        self.assertEqual(result["errors"], 1)
        public_bytes = b"\n".join(self.fake.objects.values())
        self.assertNotIn(secret.encode(), public_bytes)

    def test_stale_provider_value_never_keeps_live_label(self):
        place = catalog()[8]
        now = datetime.now(timezone.utc)
        item = self.module.normalize(raw(place, now - timedelta(minutes=40)), place,
                                     self.module.iso(now), now)
        self.assertEqual(item["state"], "STALE")
        self.assertNotEqual(item["stateLabelKo"], "LIVE")

    def test_three_observations_create_scalar_trend_not_direction(self):
        now = datetime.now(timezone.utc)
        rows = [{"observedAt": self.module.iso(now + timedelta(minutes=i * 5)),
                 "midpoint": 1000 + i * 100} for i in range(3)]
        trend = self.module.scalar_trend(rows)
        self.assertEqual(trend["state"], "READY")
        self.assertEqual(trend["direction"], "INCREASING")
        self.assertIsNone(trend["flowDirection"])


if __name__ == "__main__":
    unittest.main()
