"""Regressions for concurrent HTTP-style calls and single-worker ownership."""
import copy
from concurrent.futures import ThreadPoolExecutor
import json
from pathlib import Path
import tempfile
import threading
import time
import unittest
from unittest.mock import patch

from research_runtime.datasets import digest
from research_runtime.server import Server
from research_runtime.service import ResearchService

EXAMPLES = Path(__file__).resolve().parents[1] / "examples"


def example():
    return json.loads((EXAMPLES / "constant-eastward.dataset.json").read_text(encoding="utf-8"))


def queued_experiment(service):
    dataset = service.register_dataset(example())
    project = service.create_project({"name": "Concurrency regression", "question": "Do queued jobs retain identity?"})
    spec = json.loads((EXAMPLES / "constant-eastward.experiment.json").read_text(encoding="utf-8"))
    spec["projectId"] = project["id"]
    experiment = service.create_experiment({"projectId": project["id"], "datasetId": dataset["id"], "spec": spec})
    # Keep jobs queued deliberately; these tests check service scheduling, not the model.
    service.pool.submit = lambda *args, **kwargs: None
    service.preflight_model = lambda *args: {"ok": True, "errors": [], "warnings": []}
    return experiment


class ServiceConcurrencyTests(unittest.TestCase):
    def test_same_idempotency_key_survives_full_queue(self):
        with tempfile.TemporaryDirectory() as directory:
            service = ResearchService(directory)
            try:
                experiment = queued_experiment(service)
                body = {"experimentId": experiment["id"]}
                original = service.submit(body, "queue-key-0")
                for index in range(1, 8):
                    service.submit(body, f"queue-key-{index}")
                repeated = service.submit(body, "queue-key-0")
                self.assertEqual(repeated["id"], original["id"])
                self.assertEqual(len(service.store.list("run")), 8)
                with self.assertRaisesRegex(ValueError, "QUEUE_LIMIT"):
                    service.submit(body, "queue-key-new")
            finally:
                service.close()

    def test_concurrent_same_version_different_content_rejected(self):
        with tempfile.TemporaryDirectory() as directory:
            service = ResearchService(directory)
            try:
                first = example()
                second = copy.deepcopy(first)
                second["grid"]["u"][0][0][0] += 0.1
                second["manifest"]["sha256"] = digest(second["grid"])
                gate = threading.Barrier(2)
                create = service.store.create

                def slow_create(kind, body):
                    if kind == "dataset":
                        # Widen the old check-then-create race without holding a barrier
                        # inside the corrected critical section.
                        time.sleep(0.05)
                    return create(kind, body)

                def register(payload):
                    gate.wait(timeout=5)
                    try:
                        return {"item": service.register_dataset(payload)}
                    except ValueError as error:
                        return {"error": str(error)}

                with patch.object(service.store, "create", side_effect=slow_create):
                    with ThreadPoolExecutor(max_workers=2) as pool:
                        outputs = list(pool.map(register, (first, second)))
                self.assertEqual(sum("item" in value for value in outputs), 1)
                self.assertEqual(sum("DATASET_VERSION_CONFLICT" in value.get("error", "") for value in outputs), 1)
                self.assertEqual(len(service.dataset_index()), 1)
            finally:
                service.close()

    def test_second_service_cannot_recover_an_active_data_directory(self):
        with tempfile.TemporaryDirectory() as directory:
            service = ResearchService(directory)
            extra = None
            try:
                experiment = queued_experiment(service)
                run = service.submit({"experimentId": experiment["id"]}, "ownership-key")
                try:
                    extra = ResearchService(directory)
                except (RuntimeError, ValueError, OSError):
                    pass
                else:
                    self.fail("second service acquired an actively owned research directory")
                self.assertEqual(service.get_run(run["id"], include_result=False)["status"], "QUEUED")
            finally:
                if extra is not None:
                    extra.close()
                service.close()
            # A clean shutdown releases ownership for the next process.
            replacement = ResearchService(directory)
            replacement.close()

    def test_failed_second_server_start_does_not_change_live_run_status(self):
        with tempfile.TemporaryDirectory() as directory:
            server = Server(0, directory, seed=False)
            extra = None
            try:
                experiment = queued_experiment(server.service)
                run = server.service.submit({"experimentId": experiment["id"]}, "bind-failure-key")
                try:
                    extra = Server(server.server_port, directory, seed=False)
                except (RuntimeError, ValueError, OSError):
                    pass
                else:
                    self.fail("second server bound the live endpoint")
                self.assertEqual(server.service.get_run(run["id"], include_result=False)["status"], "QUEUED")
            finally:
                if extra is not None:
                    extra.server_close()
                server.server_close()


if __name__ == "__main__":
    unittest.main()
