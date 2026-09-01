"""Generate golden propagation fixtures from real committed P1 raw snapshots."""

import argparse
import json
import sys
from pathlib import Path

from backend.orbit.golden import build_fixture


def main() -> int:
    """Write one deterministic golden fixture per supplied raw artifact file."""
    parser = argparse.ArgumentParser(description="Build P2 golden fixtures from P1 snapshots")
    parser.add_argument("artifacts", nargs="+", type=Path, help="Raw snapshot JSON files")
    parser.add_argument(
        "--output-dir",
        type=Path,
        default=Path("tests/fixtures/golden"),
    )
    args = parser.parse_args()

    args.output_dir.mkdir(parents=True, exist_ok=True)
    for artifact_path in args.artifacts:
        raw_content = artifact_path.read_bytes()
        expected_sha256 = artifact_path.stem
        fixture = build_fixture(raw_content, artifact_path.as_posix(), "celestrak_gp")
        actual_sha256 = fixture["generated_from"]["raw_artifact_sha256"]
        if actual_sha256 != expected_sha256:
            print(
                f"Refusing to build fixture: filename stem {expected_sha256} "
                f"does not match content hash {actual_sha256}"
            )
            return 1
        output_path = args.output_dir / f"{fixture['fixture_id']}.json"
        output_path.write_text(json.dumps(fixture, indent=2, sort_keys=True) + "\n", encoding="utf-8")
        print(f"Golden fixture written: {output_path}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
