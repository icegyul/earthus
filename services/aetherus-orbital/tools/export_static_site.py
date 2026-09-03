"""Freeze the read-only product surface into files S3 can serve.

The A안 deployment: no server, no database, no standing cost. The globe, the
object catalogue and the conjunction list are read-only views over data that
changes when CelesTrak publishes, not per request, so they can be published as
files and refreshed when the data is.

The trick that keeps the frontend untouched is that S3 ignores query strings.
``GET /api/v1/catalog/snapshot?limit=200`` fetches the object stored at the key
``api/v1/catalog/snapshot``, so every path the UI already calls resolves to the
file written here. No build flag, no second API client, no fork of the frontend.

What cannot come along
----------------------
The REMOVE panel runs a counterfactual, which is computation, not a view. Its
four endpoints are POSTs and are deliberately not exported: a file cannot answer
"what if this object were gone". The export writes a refusal at those paths
instead of leaving them 404, so the panel fails with a sentence a person can
read rather than a network error.

Honesty
-------
Every exported payload carries a ``static_export`` block naming when it was
frozen and what it was frozen from, and a warning saying the same. A snapshot
served hours later must not read as live: the numbers are exactly as true as
they were at generation time, and the file says when that was.

Run from services/aetherus-orbital:
    .venv/Scripts/python tools/export_static_site.py --out ../../build/orbital
"""

from __future__ import annotations

import argparse
import asyncio
import datetime
import json
import shutil
import sys
from pathlib import Path
from typing import Any

SERVICE_ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(SERVICE_ROOT))

#: The UI asks for +/- 45 minutes at 60-second steps (frontend/js/main.js).
#: Exporting the same window means a selected object's orbit line is drawn from
#: the same shape of data the live API would have returned.
ORBIT_WINDOW_MINUTES = 45
ORBIT_STEP_SECONDS = 60

#: Computation, not a view. A file cannot answer these.
COMPUTE_ONLY_PATHS = (
    "api/v1/baselines",
    "api/v1/scenarios",
)

REFUSAL = {
    "status": "STATIC_EXPORT_HAS_NO_COMPUTE",
    "message": (
        "This deployment is a static snapshot. The REMOVE counterfactual is a "
        "computation over the risk graph and cannot be served from a file; it "
        "needs the compute tier."
    ),
}


def _now() -> datetime.datetime:
    return datetime.datetime.now(datetime.UTC)


def _stamp(payload: Any, *, generated_at: str, source: str) -> Any:
    """Mark a payload as frozen, in the envelope the UI already reads."""
    if not isinstance(payload, dict):
        return payload
    payload = dict(payload)
    payload["static_export"] = {
        "generated_at": generated_at,
        "source": source,
        "note": (
            "Frozen copy served from static hosting. The values are as they were "
            "at generated_at; this deployment does not recompute them."
        ),
    }
    warnings = list(payload.get("warnings") or [])
    warnings.append(
        f"Static snapshot frozen at {generated_at}; not a live query."
    )
    payload["warnings"] = warnings
    return payload


def _write(out: Path, rel: str, payload: Any) -> int:
    target = out / rel
    target.parent.mkdir(parents=True, exist_ok=True)
    body = json.dumps(payload, ensure_ascii=False, separators=(",", ":"), default=str)
    target.write_text(body, encoding="utf-8")
    return len(body.encode("utf-8"))


async def export(out: Path, *, limit: int, max_orbits: int) -> dict[str, Any]:
    import httpx

    from services.api.integrated import app

    generated_at = _now().isoformat()
    written: list[tuple[str, int]] = []
    #: Payloads that came back as an error. Shipping them would put a red banner
    #: on every object in the catalogue, which is how the first export went out.
    failed: list[str] = []

    async with httpx.AsyncClient(app=app, base_url="http://export") as client:

        async def grab(path: str, rel: str, params: dict[str, Any] | None = None) -> Any:
            # Params go through httpx rather than into the string: an ISO
            # timestamp ends in "+00:00", and a raw "+" in a query string is a
            # space, so hand-built URLs produced INVALID_WINDOW for every orbit.
            response = await client.get(path, params=params, timeout=120.0)
            payload = response.json() if response.content else None
            # The HTTP code, not a guess from the body. An earlier version read
            # any payload carrying "status" without "data_status" as a failure
            # and flagged /health, whose status is "healthy".
            if response.status_code >= 400:
                failed.append(
                    f"{rel}: HTTP {response.status_code} "
                    f"{str((payload or {}).get('message'))[:80]}"
                )
            stamped = _stamp(payload, generated_at=generated_at, source=path)
            written.append((rel, _write(out, rel, stamped)))
            return payload

        await grab("/health", "health")
        await grab("/api/v1/catalog/status", "api/v1/catalog/status")
        snapshot = await grab(
            "/api/v1/catalog/snapshot", "api/v1/catalog/snapshot", {"limit": limit}
        )
        await grab("/api/v1/conjunctions", "api/v1/conjunctions")

        # The catalogue rows live under data.catalog; each carries catalog_id,
        # which is the reference the UI passes to the per-object endpoints.
        data = (snapshot or {}).get("data") or {}
        rows = data.get("catalog") if isinstance(data, dict) else None
        if not isinstance(rows, list):
            rows = []

        # Per-object views. The UI fetches these one at a time as the user
        # selects, so each selectable object needs its own file or the click
        # lands on a 404.
        centre = _now()

        def _iso(moment: datetime.datetime) -> str:
            # The UI sends Date.toISOString(), which ends in "Z". Matching it
            # keeps the exported window in the same notation the live API sees.
            return moment.isoformat().replace("+00:00", "Z")

        start = _iso(centre - datetime.timedelta(minutes=ORBIT_WINDOW_MINUTES))
        stop = _iso(centre + datetime.timedelta(minutes=ORBIT_WINDOW_MINUTES))
        exported_orbits = 0
        for row in rows[:max_orbits]:
            ref = str(row.get("catalog_id") or "").strip()
            if not ref:
                continue
            await grab(
                f"/api/v1/objects/{ref}/ephemeris",
                f"api/v1/objects/{ref}/ephemeris",
                {"start": start, "stop": stop, "step_s": ORBIT_STEP_SECONDS},
            )
            await grab(
                "/api/v1/conjunctions",
                f"api/v1/conjunctions-by-object/{ref}",
                {"object": ref},
            )
            exported_orbits += 1

    # The compute paths answer with a readable refusal rather than a 404.
    for rel in COMPUTE_ONLY_PATHS:
        written.append((rel, _write(out, rel, _stamp(dict(REFUSAL), generated_at=generated_at, source="refusal"))))

    if failed:
        raise SystemExit(
            f"{len(failed)} exported payload(s) carry an error status and would "
            f"ship a broken site; first: {failed[0]}"
        )

    return {
        "generated_at": generated_at,
        "files": len(written),
        "bytes": sum(size for _, size in written),
        "objects_in_snapshot": len(rows),
        "orbits_exported": exported_orbits,
    }


def copy_frontend(out: Path) -> int:
    """The UI itself, served from the same origin as the frozen API files."""
    source = SERVICE_ROOT / "frontend"
    total = 0
    for path in source.rglob("*"):
        if not path.is_file() or "__pycache__" in path.parts:
            continue
        target = out / "ui" / path.relative_to(source)
        target.parent.mkdir(parents=True, exist_ok=True)
        shutil.copy2(path, target)
        total += path.stat().st_size
    # The globe is served at /ui/ by the live app; keep the same path so the
    # frontend's own relative imports resolve unchanged.
    return total


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--out", default="../../build/orbital", help="output directory")
    parser.add_argument(
        "--limit", type=int, default=500,
        help="objects in the catalogue snapshot (API caps at 500)",
    )
    # Defaults to the snapshot size on purpose. The UI lets a visitor select any
    # row, and a row without its files shows "orbit line unavailable" — so
    # exporting a subset ships a catalogue that is mostly broken to click on.
    parser.add_argument(
        "--max-orbits", type=int, default=None,
        help="objects that get a per-object orbit and conjunction file (default: all in the snapshot)",
    )
    args = parser.parse_args()

    out = (SERVICE_ROOT / args.out).resolve() if not Path(args.out).is_absolute() else Path(args.out)
    if out.exists():
        shutil.rmtree(out)
    out.mkdir(parents=True)

    result = asyncio.run(
        export(out, limit=args.limit, max_orbits=args.max_orbits or args.limit)
    )
    ui_bytes = copy_frontend(out)

    manifest = {
        "artifact": "orbital_static_site",
        **result,
        "ui_bytes": ui_bytes,
        "total_bytes": result["bytes"] + ui_bytes,
        "compute_paths_refused": list(COMPUTE_ONLY_PATHS),
        "note": (
            "Query strings are ignored by static hosting, so the frontend's "
            "existing API paths resolve to these files unchanged."
        ),
    }
    (out / "export-manifest.json").write_text(
        json.dumps(manifest, indent=2, ensure_ascii=False), encoding="utf-8"
    )

    print(f"out:      {out}")
    print(f"files:    {result['files']} api + frontend")
    print(f"objects:  {result['objects_in_snapshot']} in snapshot, {result['orbits_exported']} with orbits")
    print(f"size:     {manifest['total_bytes'] / 1048576:.1f} MB "
          f"(api {result['bytes'] / 1048576:.1f} MB + ui {ui_bytes / 1048576:.1f} MB)")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
