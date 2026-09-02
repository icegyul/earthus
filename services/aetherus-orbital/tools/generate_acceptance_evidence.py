"""Fill the directive's acceptance matrix from tests that actually ran.

The matrix (``AETHERUS_V2_ACCEPTANCE_MATRIX.csv``) defines 307 required automated
cases across 64 modules. Every row shipped as ``NOT_RUN`` with an empty
``evidence_path``, so the directive's own scorecard has never said anything about
this repository. Meanwhile the suite passes hundreds of tests that nobody can
connect to a matrix row. This tool closes that gap without inventing coverage.

Three rules make the mapping trustworthy rather than aspirational:

1. **A claim must name real tests.** ``docs/acceptance/coverage_map.yaml`` maps a
   ``test_id`` to pytest node ids. Every declared node is checked against the
   collected suite first; a node that does not exist aborts the run instead of
   quietly counting as coverage.
2. **Status comes from execution, never from the map.** The mapped nodes are run
   and the row's status is PASSED or FAILED by their exit code. Editing the map
   cannot turn a row green.
3. **Silence is UNCOVERED, not PASSED.** A row with no mapping stays NOT_RUN with
   the reason recorded. The output reports how much of the matrix is genuinely
   claimed, so a small number stays visible instead of reading as completion.

Run from services/aetherus-orbital:
    .venv/Scripts/python tools/generate_acceptance_evidence.py
"""

from __future__ import annotations

import argparse
import collections
import csv
import datetime
import json
import re
import subprocess
import sys
from pathlib import Path
from typing import Any

import yaml

SERVICE_ROOT = Path(__file__).resolve().parents[1]
REPO_ROOT = SERVICE_ROOT.parents[1]
MATRIX = (
    REPO_ROOT
    / "docs/aetherus-v2-canonical/claude_handoff_v1.1/AETHERUS_V2_ACCEPTANCE_MATRIX.csv"
)
COVERAGE_MAP = REPO_ROOT / "docs/acceptance/coverage_map.yaml"
EVIDENCE = REPO_ROOT / "artifacts/evidence/acceptance.json"
FILLED_MATRIX = REPO_ROOT / "artifacts/evidence/acceptance_matrix_status.csv"

#: Reason codes for a row nobody has claimed yet. Free text is allowed too; these
#: exist so the summary can count *why* the matrix is unclaimed.
UNCOVERED_REASONS = {
    "NOT_YET_MAPPED": "a covering test may exist but has not been identified",
    "NO_IMPLEMENTATION": "the module or behaviour does not exist in this repository",
    "EXTERNAL_DEPENDENCY": "requires data or credentials this repository does not hold",
    "MANUAL_ONLY": "cannot be established by an automated test as specified",
}


def run(cmd: list[str]) -> str:
    return subprocess.run(cmd, capture_output=True, text=True, check=True).stdout.strip()


def load_matrix() -> list[dict[str, str]]:
    return list(csv.DictReader(MATRIX.read_text(encoding="utf-8-sig").splitlines()))


def collect_node_ids() -> set[str]:
    """Every pytest node id the suite currently exposes."""
    proc = subprocess.run(
        # -o addopts= : pytest.ini sets -v, which overrides -q and turns the
        # collection into a tree instead of node ids.
        [sys.executable, "-m", "pytest", "tests", "--collect-only", "-q",
         "-p", "no:logging", "-o", "addopts="],
        capture_output=True, text=True, cwd=str(SERVICE_ROOT),
    )
    nodes = set()
    for line in proc.stdout.splitlines():
        line = line.strip()
        if "::" in line and not line.startswith("<"):
            nodes.add(line.split(" ")[0])
    if not nodes:
        raise SystemExit(
            "collected no pytest node ids; refusing to report coverage against an "
            f"empty suite.\n{proc.stdout[-2000:]}\n{proc.stderr[-2000:]}"
        )
    return nodes


def load_coverage_map() -> dict[str, Any]:
    if not COVERAGE_MAP.is_file():
        return {}
    loaded = yaml.safe_load(COVERAGE_MAP.read_text(encoding="utf-8")) or {}
    return loaded.get("coverage", loaded)


def _normalise(entry: Any) -> dict[str, Any]:
    """Accept a bare node-id list or a full record; always return a record."""
    if isinstance(entry, list):
        return {"covered_by": entry}
    if isinstance(entry, str):
        return {"covered_by": [entry]}
    return dict(entry or {})


def validate(coverage: dict[str, Any], matrix_ids: set[str], nodes: set[str]) -> None:
    """Refuse to run on a map that claims tests or rows that do not exist."""
    problems: list[str] = []
    for test_id, raw in coverage.items():
        record = _normalise(raw)
        if test_id not in matrix_ids:
            problems.append(f"{test_id}: not a row in the acceptance matrix")
        declared = record.get("covered_by") or []
        if not declared and not record.get("uncovered_reason"):
            problems.append(f"{test_id}: neither covered_by nor uncovered_reason")
        for node in declared:
            if node not in nodes:
                problems.append(f"{test_id}: node not collected -> {node}")
    if problems:
        raise SystemExit(
            "coverage map rejected; a mapping that names a missing test is a false "
            "claim of coverage:\n  " + "\n  ".join(problems)
        )


def run_nodes(nodes: list[str]) -> tuple[int, str]:
    if not nodes:
        return 0, "no nodes"
    proc = subprocess.run(
        [sys.executable, "-m", "pytest", *nodes, "-q", "-p", "no:logging", "-o", "addopts="],
        capture_output=True, text=True, cwd=str(SERVICE_ROOT),
    )
    tail = proc.stdout.strip().splitlines()
    return proc.returncode, tail[-1] if tail else ""


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument(
        "--skip-run",
        action="store_true",
        help="validate the map and report claim counts without executing tests",
    )
    args = parser.parse_args()

    matrix = load_matrix()
    matrix_ids = {row["test_id"] for row in matrix}
    nodes = collect_node_ids()
    coverage = load_coverage_map()
    validate(coverage, matrix_ids, nodes)

    # One run per module keeps failures attributable without 300 pytest starts.
    by_module: dict[str, list[str]] = {}
    claimed: dict[str, dict[str, Any]] = {}
    for row in matrix:
        record = _normalise(coverage.get(row["test_id"]))
        declared = record.get("covered_by") or []
        if declared:
            claimed[row["test_id"]] = record
            by_module.setdefault(row["module_id"], []).extend(declared)

    module_status: dict[str, dict[str, Any]] = {}
    if not args.skip_run:
        for module, module_nodes in sorted(by_module.items()):
            code, summary = run_nodes(sorted(set(module_nodes)))
            module_status[module] = {"exit_code": code, "summary": summary}

    results: list[dict[str, Any]] = []
    counts = {"PASSED": 0, "FAILED": 0, "NOT_RUN": 0}
    quality: dict[str, int] = collections.defaultdict(int)
    reasons: dict[str, int] = {}
    for row in matrix:
        test_id = row["test_id"]
        record = claimed.get(test_id)
        if record is None:
            raw = _normalise(coverage.get(test_id))
            reason = raw.get("uncovered_reason", "NOT_YET_MAPPED")
            reasons[reason] = reasons.get(reason, 0) + 1
            counts["NOT_RUN"] += 1
            results.append(
                {**row, "status": "NOT_RUN", "evidence_path": "", "uncovered_reason": reason}
            )
            continue
        module = module_status.get(row["module_id"], {})
        status = (
            "NOT_RUN"
            if args.skip_run
            else ("PASSED" if module.get("exit_code") == 0 else "FAILED")
        )
        counts[status] += 1
        results.append(
            {
                **row,
                "status": status,
                "evidence_path": str(EVIDENCE.relative_to(REPO_ROOT)),
                "covered_by": record["covered_by"],
                "module_run": module,
                "coverage_quality": record.get("coverage_quality", "UNSPECIFIED"),
                "note": record.get("note", ""),
            }
        )
        quality[record.get("coverage_quality", "UNSPECIFIED")] += 1

    evidence = {
        "artifact": "acceptance_matrix",
        "generated_at": datetime.datetime.now(datetime.timezone.utc).isoformat(),
        "repository": run(["git", "-C", str(REPO_ROOT), "remote", "get-url", "origin"]),
        "branch": run(["git", "-C", str(REPO_ROOT), "rev-parse", "--abbrev-ref", "HEAD"]),
        "commit": run(["git", "-C", str(REPO_ROOT), "rev-parse", "HEAD"]),
        "matrix_source": str(MATRIX.relative_to(REPO_ROOT)),
        "coverage_map": str(COVERAGE_MAP.relative_to(REPO_ROOT)),
        "total_cases": len(matrix),
        "claimed_cases": len(claimed),
        "unclaimed_cases": len(matrix) - len(claimed),
        "status_counts": counts,
        # How module-specific each passing row's assertion is. A matrix that
        # reports only "307 PASSED" hides that some rows are established by an
        # assertion shared across a whole family of modules, which verifies the
        # requirement without verifying that module.
        "coverage_quality_counts": dict(quality),
        "uncovered_reasons": reasons,
        "modules_run": module_status,
        "executed": not args.skip_run,
        "honesty_note": (
            "status is the exit code of the mapped tests, never a value written by "
            "hand; an unmapped row stays NOT_RUN and is counted, so a partial claim "
            "can never read as a complete matrix. coverage_quality says how much a "
            "PASSED row establishes: MODULE_SPECIFIC means the assertion was written "
            "for that module and case; SHARED_ASSERTION means one assertion covers "
            "the case across a whole family (L01-L08, or S01-S12), because the "
            "directive repeats the same required tests under every heading in that "
            "family - the requirement is verified, the individual module is not"
        ),
        "results": results,
    }
    EVIDENCE.parent.mkdir(parents=True, exist_ok=True)
    EVIDENCE.write_text(json.dumps(evidence, indent=2, ensure_ascii=False), encoding="utf-8")

    with FILLED_MATRIX.open("w", encoding="utf-8", newline="") as handle:
        writer = csv.DictWriter(
            handle,
            fieldnames=["test_id", "module_id", "domain", "case", "automation", "gate",
                        "status", "evidence_path"],
            extrasaction="ignore",
        )
        writer.writeheader()
        writer.writerows(results)

    print(f"acceptance evidence: {EVIDENCE}")
    print(f"filled matrix:       {FILLED_MATRIX}")
    print(
        f"claimed {len(claimed)}/{len(matrix)} cases  "
        f"PASSED={counts['PASSED']} FAILED={counts['FAILED']} NOT_RUN={counts['NOT_RUN']}"
        # Printed beside the total on purpose: a green count alone invites the
        # reading that every row was verified for its own module.
        + f"\n  of which module-specific={quality.get('MODULE_SPECIFIC', 0)}"
        f" shared-assertion={quality.get('SHARED_ASSERTION', 0)}"
        f" unspecified={quality.get('UNSPECIFIED', 0)}"
    )
    if reasons:
        print("unclaimed by reason:", reasons)
    return 1 if counts["FAILED"] else 0


if __name__ == "__main__":
    raise SystemExit(main())
