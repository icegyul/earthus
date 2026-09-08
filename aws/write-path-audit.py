#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""쓰기 경로 실사 — INTEGRATION-8 §5 · §6 · §18 산출물.

    python3 aws/write-path-audit.py [--out docs/earthus-v2/integration-8-write-paths.json]

문자열을 찾지 않는다. **값을 따라간다** — 자세한 이유는 aws/_shared/write_path.py 머리말.
네트워크도 자격증명도 쓰지 않는다. 코드만 읽는다.

⚠️ 이 도구가 "거부 0" 을 내놓아도 그것만으로는 아무것도 증명하지 못한다.
   같이 봐야 하는 것:
     aws/report-engine/tests/test_integration8_write_path.py
   그 시험이 CASE A/B/C 를 심어 넣고 **지금도 잡히는지**를 확인한다.
"""
import argparse
import json
import os
import sys

HERE = os.path.dirname(os.path.abspath(__file__))
REPO = os.path.dirname(HERE)
sys.path.insert(0, os.path.join(HERE, "_shared"))

import publication_privacy as priv     # noqa: E402
import write_policy as pol             # noqa: E402


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--out")
    ap.add_argument("--root", default=REPO)
    ap.add_argument("--quiet", action="store_true")
    args = ap.parse_args()

    result = pol.audit(args.root)
    rows = result["rows"]

    by_prefix = {}
    for r in rows:
        p = (r["prefix"] or "?").split("/")[0] + "/"
        by_prefix[p] = by_prefix.get(p, 0) + 1

    doc = {
        "stage": "INTEGRATION-8",
        "method": "dataflow (ast for python · constant propagation for js/sh)",
        "roots": list(pol.SCAN_ROOTS),
        "writes": result["writes"],
        "counts": result["counts"],
        "byPrefix": dict(sorted(by_prefix.items())),
        "publicPrefixes": list(priv.PUBLIC_PREFIXES),
        "bucketPublicPrefixes": list(priv.BUCKET_PUBLIC_PREFIXES),
        "publicPrefixGap": list(priv.PUBLIC_PREFIX_GAP),
        "privatePrefixes": list(priv.PRIVATE_PREFIXES),
        "denied": result["denied"],
        "appWrites": sorted(
            ({"path": r["path"], "line": r["line"], "sink": r["sink"],
              "key": r["key"], "kind": r["kind"], "verdict": r["verdict"],
              "how": r["reason"]}
             for r in rows if (r["prefix"] or "").startswith(pol.APP_PREFIX)),
            key=lambda r: (r["key"] or "", r["path"])),
        "reviewedUnproven": [
            {"path": p, "sink": s, "count": n, "destination": dest, "evidence": why}
            for (p, s), (n, dest, why) in sorted(pol.REVIEWED_UNPROVEN.items())],
        "rows": rows,
    }

    if not args.quiet:
        print("▸ 쓰기 지점 %d — %s" % (doc["writes"], ", ".join(pol.SCAN_ROOTS)))
        for k, v in sorted(result["counts"].items(), key=lambda kv: -kv[1]):
            print("   %-28s %4d" % (k, v))
        print("▸ app/ 에 쓰는 자리 %d" % len(doc["appWrites"]))
        for r in doc["appWrites"]:
            print("   %-46s %s" % (r["path"] + ":" + str(r["line"]), r["key"]))
        if priv.PUBLIC_PREFIX_GAP:
            print("⚠️ 공개 의도이나 버킷 정책에 없는 접두사: %s"
                  % ", ".join(priv.PUBLIC_PREFIX_GAP))
        print("▸ 거부 %d" % len(result["denied"]))
        for d in result["denied"]:
            print("   %-46s %-26s %s"
                  % (d["path"] + ":" + str(d["line"]), d["verdict"], d["reason"]))

    if args.out:
        out = args.out if os.path.isabs(args.out) else os.path.join(args.root, args.out)
        with open(out, "w", encoding="utf-8", newline="\n") as fh:
            json.dump(doc, fh, ensure_ascii=False, indent=1)
            fh.write("\n")
        print("✅ %s" % args.out)

    return 1 if result["denied"] else 0


if __name__ == "__main__":
    sys.exit(main())
