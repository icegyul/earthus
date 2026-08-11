import importlib.util
import pathlib
import sys
import types
import unittest


class _FakeS3:
    pass


if "boto3" not in sys.modules:
    boto3 = types.ModuleType("boto3")
    boto3.client = lambda *args, **kwargs: _FakeS3()
    sys.modules["boto3"] = boto3
if "botocore.exceptions" not in sys.modules:
    botocore = types.ModuleType("botocore")
    exceptions = types.ModuleType("botocore.exceptions")
    exceptions.ClientError = type("ClientError", (Exception,), {})
    sys.modules["botocore"] = botocore
    sys.modules["botocore.exceptions"] = exceptions

SPEC = importlib.util.spec_from_file_location("lab_report_index", pathlib.Path(__file__).with_name("handler.py"))
MODULE = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(MODULE)


class ContractTest(unittest.TestCase):
    def test_cyclone_is_namespaced_and_private_detail_is_removed(self):
        report = MODULE.public_report("cyclone", {
            "id": "WP012026", "name": "TEST", "status": "FINAL_REPORT",
            "snapshotCount": 4, "scores": [{"agency": "KMA", "meanErrorKm": 12}],
        })
        self.assertEqual(report["id"], "cyclone:WP012026")
        self.assertEqual(report["kind"], "cyclone")
        self.assertEqual(report["sourceCount"], 1)
        self.assertNotIn("scores", report)

    def test_missing_id_is_rejected(self):
        self.assertIsNone(MODULE.public_report("aurora", {"title": "No id"}))

    def test_zero_is_not_changed_to_missing(self):
        report = MODULE.public_report("ocean-drift", {"id": "A", "title": "A", "sampleCount": 0})
        self.assertEqual(report["sampleCount"], 0)


if __name__ == "__main__":
    unittest.main()
