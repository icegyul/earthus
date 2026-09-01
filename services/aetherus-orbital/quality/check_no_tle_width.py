"""Reject legacy five-digit/TLE-only catalog-ID assumptions in production Python."""

from __future__ import annotations

import argparse
import re
from collections.abc import Iterable
from pathlib import Path

_FORBIDDEN_PATTERNS = (
    re.compile(r"\\d\{5\}"),
    re.compile(r"\[0-9\]\{5\}"),
    re.compile(r"catalog[_a-z]*[^\n]{0,80}len\([^\n]{0,80}\)\s*==\s*5", re.IGNORECASE),
    re.compile(r"len\([^\n]{0,80}catalog[^\n]{0,80}\)\s*==\s*5", re.IGNORECASE),
)


def check_paths(paths: Iterable[Path]) -> bool:
    """Return false when a production path contains a five-digit-only shortcut."""
    return not find_violations(paths)


def find_violations(paths: Iterable[Path]) -> list[tuple[Path, int, str]]:
    """Collect every forbidden source line so the gate is actionable and reproducible."""
    violations: list[tuple[Path, int, str]] = []
    for candidate in paths:
        files = candidate.rglob("*.py") if candidate.is_dir() else [candidate]
        for path in files:
            if not path.is_file() or "__pycache__" in path.parts:
                continue
            for line_number, line in enumerate(path.read_text(encoding="utf-8").splitlines(), start=1):
                if any(pattern.search(line) for pattern in _FORBIDDEN_PATTERNS):
                    violations.append((path, line_number, line.strip()))
    return violations


def main() -> int:
    """Run the production width audit from the command line."""
    parser = argparse.ArgumentParser(description="Reject five-digit-only catalog ID logic")
    parser.add_argument("paths", nargs="+", type=Path)
    args = parser.parse_args()
    violations = find_violations(args.paths)
    for path, line_number, line in violations:
        print(f"{path}:{line_number}: {line}")
    return 1 if violations else 0


if __name__ == "__main__":
    raise SystemExit(main())
