"""STEP 39 variant (derived from the validated STEP 32 tool by identity/path patches only; algorithm unchanged): uses step39_runs.
REVISION r3 (uncommitted; r2 kept unchanged; see docs/research/step32-phase-b-revisions.json): uses step32_runs_r3.
REVISION r2 (STEP 32 Phase B, uncommitted file-level revision; r1 kept unchanged on disk; see docs/research/step32-phase-b-revisions.json): uses step32_runs_r2.
STEP 32 Phase B — separate-process replay of one run (window, condition) from the on-disk inputs via the identical construction in
step32_runs.run (frozen runtime, unchanged). Prints the result-array SHA-256 so the runner can compare it with its in-process result.
No output file is written."""
import json
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(ROOT / "tools/research"))


def main(wid, cond):
    import step39_runs as S
    result, specs, meta = S.run(wid, cond)
    print(json.dumps({"ok": True, "runId": meta["runId"], "resultArraySha256": meta["resultArraySha256"], "modelSourceSha256": meta["modelSourceSha256"], "segmented": meta["segmented"]}))
    return 0


if __name__ == "__main__":
    raise SystemExit(main(*sys.argv[1:3]))
