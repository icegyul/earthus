#!/usr/bin/env bash
set -euo pipefail
if [[ $# -lt 1 ]]; then echo "usage: $0 /path/to/earthus [--force]" >&2; exit 2; fi
TARGET="$(cd "$1" && pwd)"; FORCE="${2:-}"; SRC="$(cd "$(dirname "$0")/../.." && pwd)"
for required in AGENTS.md prototype/js/viewer.js prototype/js/store.js prototype/js/v8/runtime-coordinator.js; do
  [[ -e "$TARGET/$required" ]] || { echo "REFUSE: target is not expected earthus tree; missing $required" >&2; exit 3; }
done
if [[ -e "$TARGET/prototype/v2/index.html" && "$FORCE" != "--force" ]]; then echo "REFUSE: prototype/v2 already exists. Review existing work; rerun with --force only after reconciliation." >&2; exit 4; fi
mkdir -p "$TARGET/prototype/v2" "$TARGET/prototype/js/earthus2" "$TARGET/tools" "$TARGET/docs/earthus-v2-implementation" "$TARGET/docs/earthus-2.0" "$TARGET/aws" "$TARGET/fixtures"
cp -R "$SRC/prototype/v2/." "$TARGET/prototype/v2/"
cp -R "$SRC/prototype/js/earthus2/." "$TARGET/prototype/js/earthus2/"
for d in "$SRC"/tools/earthus2-v*; do cp -R "$d" "$TARGET/tools/"; done
cp -R "$SRC/docs/earthus-v2-implementation/." "$TARGET/docs/earthus-v2-implementation/"
cp -R "$SRC/docs/earthus-2.0/." "$TARGET/docs/earthus-2.0/"
cp "$SRC/aws/deploy-v2-preview.sh" "$TARGET/aws/deploy-v2-preview.sh"
cp -R "$SRC/fixtures/." "$TARGET/fixtures/"
chmod +x "$TARGET/aws/deploy-v2-preview.sh"
echo "Installed add-only Earthus 2.0 accelerator files. Existing Earthus 1.0 files were not overwritten."
echo "Next: cd '$TARGET' && tools/earthus2-v2/run_repo_checks.sh"
