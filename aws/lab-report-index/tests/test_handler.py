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

HANDLER = pathlib.Path(__file__).parent.parent / "handler.py"
SPEC = importlib.util.spec_from_file_location("lab_report_index", HANDLER)
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
        # 2026-09-05: 계산기가 만든 공개 요약(scores·detail)은 색인이 그대로 넘긴다 — 화면은 색인을 먼저 읽고
        # 같은 id 의 원본을 버리므로, 여기서 떼면 종료 검증 표와 보고서 본문이 화면에서 사라졌다.
        # 비공개 원문(회차·좌표 원본)은 계산기가 애초에 공개 파일에 넣지 않는다.
        self.assertIn("scores", report)

    def test_missing_id_is_rejected(self):
        self.assertIsNone(MODULE.public_report("aurora", {"title": "No id"}))

    def test_zero_is_not_changed_to_missing(self):
        report = MODULE.public_report("ocean-drift", {"id": "A", "title": "A", "sampleCount": 0})
        self.assertEqual(report["sampleCount"], 0)


if __name__ == "__main__":
    unittest.main()
