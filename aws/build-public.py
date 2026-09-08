#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""공개 빌드 — INTEGRATION-3 §0 · §1.

    python3 aws/build-public.py            # build/public-app/ 을 만든다
    python3 aws/build-public.py --check    # 만들지 않고 무엇이 걸러지는지만 본다

배포는 이 디렉터리만 올린다. 작업 트리를 직접 올리지 않는다.
거름망을 빠져나간 비공개 파일이 하나라도 있으면 **0 이 아닌 코드로 끝난다** —
그 상태로 배포가 이어지지 않게 하려는 것이다.
"""

import argparse
import os
import sys

# 윈도우 콘솔은 기본이 cp949 라 '▸' 하나에 스크립트가 죽는다. 출력만 UTF-8 로 고정한다.
for _stream in (sys.stdout, sys.stderr):
    try:
        _stream.reconfigure(encoding="utf-8", errors="replace")
    except (AttributeError, ValueError):                # 파이프로 넘길 때 등
        pass

HERE = os.path.dirname(os.path.abspath(__file__))
REPO = os.path.dirname(HERE)
sys.path.insert(0, os.path.join(HERE, "_shared"))

import public_build as pb          # noqa: E402


def main(argv=None):
    ap = argparse.ArgumentParser(description="공개 빌드 원본을 만든다")
    ap.add_argument("--check", action="store_true", help="복사하지 않고 계획만 본다")
    ap.add_argument("--source", default=os.path.join(REPO, pb.SOURCE_DIR))
    ap.add_argument("--out", default=os.path.join(REPO, pb.PUBLIC_BUILD_DIR))
    ap.add_argument("--quiet", action="store_true")
    a = ap.parse_args(argv)

    plan = pb.plan(a.source)
    residual = pb.residual_private(a.source, plan["keep"])

    if not a.quiet:
        print("▸ 공개 빌드 원본: %s" % a.source)
        print("  올린다 %d · 뺀다 %d (규칙 %d줄)"
              % (len(plan["keep"]), len(plan["denied"]), len(pb.DENY_RULES)))
        by_rule = {}
        for d in plan["denied"]:
            by_rule.setdefault(d["rule"], []).append(d)
        for rule in sorted(by_rule, key=lambda r: -len(by_rule[r])):
            rows = by_rule[rule]
            print("    %-36s %3d  %s" % (rule, len(rows), rows[0]["reason"]))

    if residual:
        print("")
        print("❌ 누출 시험 실패 — 거름망을 빠져나간 비공개 파일 %d건:" % len(residual))
        for r in residual:
            print("   %s  [%s] %s" % (r["path"], r["kind"], r["detail"]))
        print("")
        print("   고치는 법: aws/_shared/public_build.py 의 DENY_RULES 에 규칙을 더하거나,")
        print("             그 파일을 prototype/ 밖으로 옮긴다.")
        return 1

    if a.check:
        if not a.quiet:
            print("")
            print("✅ 누출 없음 (계획만 확인했다 — 복사하지 않았다)")
        return 0

    man = pb.build(a.source, a.out)
    if not a.quiet:
        print("")
        print("✅ %s" % a.out)
        print("   복사 %d · 삭제 %d · 지문 %s"
              % (man["copied"], man["removed"],
                 pb.manifest_hash(a.source, plan["keep"])[:16]))
    return 0


if __name__ == "__main__":
    sys.exit(main())
