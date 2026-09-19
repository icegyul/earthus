# -*- coding: utf-8 -*-
"""S-A 등재 도구(tools/research/register_simulation_run.py) 시험 — 실행하지 않고 등재·요청만 한다.

표본은 저장소의 실제 research-runtime 실행 결과(hycom-2015-atlantic)다. 승인자 이름은 'fixture-approver' —
PD 가 승인했다고 적지 않는다.
"""
import importlib.util
import io
import json
import pathlib
import sys
import tempfile
import unittest
from contextlib import redirect_stderr, redirect_stdout

REPO = pathlib.Path(__file__).resolve().parents[3]
SPEC = importlib.util.spec_from_file_location("register_simulation_run", REPO / "tools" / "research" / "register_simulation_run.py")
reg = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(reg)
EX = REPO / "services" / "research-runtime" / "examples"
BASE = ["--experiment", str(EX / "hycom-2015-atlantic.experiment.json"),
        "--result", str(EX / "hycom-2015-atlantic.result.json"),
        "--run-id", "hycom-2015-atlantic", "--event-id", "evt_fixture0001",
        "--consent-scope", "OPERATOR_BATCH", "--computed-at", "2026-09-10T08:00:00Z", "--now", "2026-09-20T02:30:00Z"]


def run(argv):
    out, err = io.StringIO(), io.StringIO()
    with redirect_stdout(out), redirect_stderr(err):
        code = reg.main(argv)
    return code, out.getvalue(), err.getvalue()


class RecordTests(unittest.TestCase):
    def test_real_run_registers_with_a_named_human(self):
        code, out, _ = run(["record", *BASE, "--approved-by", "fixture-approver"])
        self.assertEqual(0, code)
        rec = json.loads(out)
        self.assertEqual("research-runtime:hycom-2015-atlantic", rec["runRef"])
        self.assertEqual("SIMULATION", rec["truthStatus"])
        self.assertEqual({"by": "fixture-approver", "at": "2026-09-20T02:30:00Z", "method": "PER_RUN"}, rec["approval"])
        self.assertTrue(rec["consent"]["revocable"])
        self.assertFalse(rec["validation"]["performed"])

    def test_system_account_cannot_approve(self):
        for who in ("system", "lambda", "scheduler"):
            code, _, err = run(["record", *BASE, "--approved-by", who])
            self.assertEqual(2, code, who)
            self.assertIn("사람", err)

    def test_writes_a_file_when_out_is_given(self):
        with tempfile.TemporaryDirectory() as d:
            code, out, _ = run(["record", *BASE, "--approved-by", "fixture-approver", "--out", d])
            self.assertEqual(0, code)
            path = pathlib.Path(out.strip())
            self.assertTrue(path.exists())
            self.assertEqual("research-runtime:hycom-2015-atlantic", json.loads(path.read_text(encoding="utf-8"))["runRef"])


class RequestTests(unittest.TestCase):
    REQ = ["request", "--experiment", str(EX / "hycom-2015-atlantic.experiment.json"),
           "--event-id", "evt_fixture0001", "--now", "2026-09-20T02:30:00Z"]

    def test_request_is_requested_only(self):
        code, out, _ = run([*self.REQ, "--requested-by", "fixture-approver", "--reason", "표류 기준 실행 요청"])
        self.assertEqual(0, code)
        req = json.loads(out)
        self.assertEqual("REQUESTED", req["status"], "요청서만 만든다 — 실행하지 않는다")
        self.assertEqual("surface-passive-advection.v1", req["modelId"])

    def test_request_needs_a_human_and_a_reason(self):
        self.assertEqual(2, run([*self.REQ, "--requested-by", "system", "--reason", "x"])[0])
        self.assertEqual(2, run([*self.REQ, "--requested-by", "fixture-approver", "--reason", "  "])[0])

    def test_the_tool_never_runs_the_model(self):
        src = (REPO / "tools" / "research" / "register_simulation_run.py").read_text(encoding="utf-8")
        self.assertNotIn("run_experiment", src)
        self.assertNotIn("127.0.0.1", src.split('"""', 2)[2], "실행 서버를 부르면 안 된다")


if __name__ == "__main__":
    unittest.main()
