"""Fetch the live SOCRATES bulk product once and persist it.

Deliberately a manual tool rather than a scheduled job: CelesTrak's usage policy
allows one download per feed update (every 10-11 hours), requires stopping on
any non-200, and answers repeated violations with an IP ban. Scheduling belongs
with the FILE_MTIME check against the directory endpoint, which is future work —
until then a human runs this, which is itself a form of rate limiting.

Run from services/aetherus-orbital:
    .venv/Scripts/python tools/run_socrates_ingestion.py
"""

from __future__ import annotations

import asyncio
import json
import sys
from pathlib import Path

SERVICE_ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(SERVICE_ROOT))

from backend.config import settings  # noqa: E402
from backend.ingestion.socrates_service import run_socrates_ingestion  # noqa: E402
from backend.ingestion.storage import RawArtifactStore  # noqa: E402
from backend.providers_live.socrates import SocratesUsagePolicyError  # noqa: E402


async def main() -> int:
    store = RawArtifactStore(SERVICE_ROOT / settings.raw_artifact_dir)
    try:
        outcome = await run_socrates_ingestion(store=store)
    except SocratesUsagePolicyError as error:
        # The policy demands a human is told, so the failure is loud and terminal.
        print("SOCRATES USAGE POLICY STOP — do not retry automatically", file=sys.stderr)
        print(json.dumps(error.details, ensure_ascii=False, indent=2), file=sys.stderr)
        return 2
    print(json.dumps(outcome.to_dict(), ensure_ascii=False, indent=2))
    return 0


if __name__ == "__main__":
    raise SystemExit(asyncio.run(main()))
