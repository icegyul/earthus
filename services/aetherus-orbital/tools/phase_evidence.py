"""Shared parts of a phase evidence generator.

Every generator answers the same three questions and must answer them the same
way: did the mapped tests actually run, what does the live surface say, and for
each unmet check, whose problem is it. The last one is why this module exists —
before ``blocker_class`` the generators collapsed "we have not built it" and
"someone else must grant it" into a single PARTIAL, and a reader could not tell
which phases were waiting on us.

Nothing here decides a status. Status comes from an exit code or an HTTP
response; a generator that wants to write a value by hand has to do it in the
open.

The pre-existing p0-p9 generators are left as they are. This module is for the
phases that had no generator at all.
"""

from __future__ import annotations

import datetime
import json
import subprocess
import sys
import urllib.error
import urllib.request
from pathlib import Path
from typing import Any, Callable

sys.path.insert(0, str(Path(__file__).resolve().parent))
from blocker_class import classify  # noqa: E402

SERVICE_ROOT = Path(__file__).resolve().parents[1]
REPO_ROOT = SERVICE_ROOT.parents[1]
EVIDENCE_DIR = REPO_ROOT / "artifacts" / "evidence"
BASE = "http://127.0.0.1:8100"


def git(*args: str) -> str:
    return subprocess.run(
        ["git", "-C", str(REPO_ROOT), *args], capture_output=True, text=True, check=True
    ).stdout.strip()


def pytest_summary(targets: list[str]) -> dict[str, Any]:
    """Run the named tests and report their own exit code.

    Not a pipeline's exit code: a shell pipe reports the last command, which is
    how this repository once recorded a run of ``tail`` as a passing test suite.
    """
    proc = subprocess.run(
        [sys.executable, "-m", "pytest", *targets, "-q", "--no-header",
         "-p", "no:logging", "-o", "addopts="],
        capture_output=True, text=True, cwd=str(SERVICE_ROOT),
    )
    return {
        "targets": targets,
        "exit_code": proc.returncode,
        "summary": proc.stdout.strip().splitlines()[-1] if proc.stdout.strip() else "",
    }


def probe(path: str, timeout: int = 30) -> dict[str, Any]:
    try:
        with urllib.request.urlopen(BASE + path, timeout=timeout) as response:
            body = json.loads(response.read().decode("utf-8"))
            return {"path": path, "http_status": response.status,
                    "data_status": body.get("data_status"), "body": body}
    except urllib.error.HTTPError as exc:
        return {"path": path, "http_status": exc.code, "error": exc.reason}
    except Exception as exc:  # noqa: BLE001
        return {"path": path, "http_status": None, "error": str(exc)}


def digest(payload: dict[str, Any]) -> dict[str, Any]:
    """State only. An evidence file must not become a copy of every response."""
    return {k: payload.get(k) for k in ("path", "http_status", "data_status", "error") if k in payload}


def _template(path: str) -> str:
    """Turn a concrete request path into the route template OpenAPI declares.

    ``/v1/missions/APOLLO_11/state`` is served by the route
    ``/v1/missions/{mission_id}/state``. Comparing the concrete path against
    the schema would report every route as missing.
    """
    known = {
        "missions": "mission_id", "events": "event_id", "objects": "object_id",
        "scenarios": "scenario_id", "jobs": "job_id", "scene": "mode", "neo": "object_id",
    }
    parts = path.split("?")[0].split("/")
    out = []
    for index, part in enumerate(parts):
        previous = parts[index - 1] if index else ""
        if previous in known and part and not part.startswith("{"):
            out.append("{" + known[previous] + "}")
        else:
            out.append(part)
    return "/".join(out)


def server_state(expected_paths: list[str]) -> dict[str, Any]:
    """Whether the process on 8100 is this working tree's build.

    Route presence is read from the live OpenAPI schema, not from a 404. A 404
    answers two different questions with one number: "this deployment has no
    such route" and "this deployment has no such mission". The first means the
    running process predates the code; the second is the route working exactly
    as intended. Treating them alike once filed a legitimate 'mission not found'
    as a stale build.
    """
    health = probe("/health", timeout=5)
    if health.get("http_status") != 200:
        return {"state": "NO_SERVER", "detail": health.get("error")}

    schema = probe("/openapi.json", timeout=15)
    served = set((schema.get("body") or {}).get("paths") or {})
    if not served:
        return {"state": "UNKNOWN_BUILD",
                "detail": "the server did not serve an OpenAPI schema, so its route set cannot be read",
                "schema": digest(schema)}

    missing = sorted({_template(p) for p in expected_paths} - served)
    if missing:
        return {"state": "STALE_BUILD", "missing_routes": missing,
                "detail": "the running process does not declare these routes; restart it to probe them live"}
    return {"state": "CURRENT", "routes_confirmed": sorted({_template(p) for p in expected_paths})}


def on_path() -> None:
    """Make the service packages importable from a tools script."""
    if str(SERVICE_ROOT) not in sys.path:
        sys.path.insert(0, str(SERVICE_ROOT))


def attempt(fn: Callable[[], Any]) -> dict[str, Any]:
    """Run a probe of our own code and record what happened, including a raise.

    A check that throws is not a check that failed cleanly, and the difference
    belongs in the evidence rather than in a stack trace nobody keeps.
    """
    try:
        return {"ok": True, "value": fn()}
    except Exception as exc:  # noqa: BLE001
        return {"ok": False, "error": f"{type(exc).__name__}: {exc}"}


def write_evidence(
    *,
    phase: str,
    phase_name: str,
    hard_gate: str,
    checks: dict[str, bool],
    blockers: dict[str, tuple[str, str]],
    limitations: list[str],
    next_allowed: str,
    **extra: Any,
) -> dict[str, Any]:
    failed = [name for name, ok in checks.items() if not ok]
    evidence = {
        "phase": phase,
        "phase_name": phase_name,
        "hard_gate": hard_gate,
        "gate": "PASS" if not failed else "PARTIAL",
        "failed_checks": failed,
        "checks": checks,
        # Never one PARTIAL for everything: our work and someone else's
        # permission are different facts.
        "blockers": classify(checks, blockers),
        "generated_at": datetime.datetime.now(datetime.timezone.utc).isoformat(),
        "repository": git("remote", "get-url", "origin"),
        "branch": git("rev-parse", "--abbrev-ref", "HEAD"),
        "commit": git("rev-parse", "HEAD"),
        **extra,
        "limitations": limitations,
        "next_allowed": next_allowed,
    }
    path = EVIDENCE_DIR / f"{phase}.json"
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(evidence, indent=2, ensure_ascii=False), encoding="utf-8")
    print(f"evidence written: {path}")
    print(f"gate={evidence['gate']} failed={failed or 'none'}")
    return evidence
