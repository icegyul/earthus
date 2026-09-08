#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""공개 접근 실측 — INTEGRATION-3 §4.

    python3 aws/verify-public-access.py                # 정해진 항목을 두드린다
    python3 aws/verify-public-access.py --audit-denied # 거름망이 막는 경로를 **전부** 두드린다

버킷을 **자격증명 없이** 두드려 본다. 세 가지를 확인한다:

    1. 공개 경로 읽기      200 이어야 한다 (앱이 동작해야 하니까)
    2. 비공개 경로 읽기    403/404 여야 한다
    3. 아무나 쓰기         403 이어야 한다  ← 직접 우회 시험

⚠️⚠️ **"자격증명이 없어서 못 했다"를 통과로 세지 않는다.**
   이 시험의 요점이 그것이다. 막혔는지(DENIED) · 열렸는지(OPEN) ·
   확인하지 못했는지(UNKNOWN)를 반드시 구분한다. UNKNOWN 은 실패다.

⚠️ 쓰기 시험은 우리 버킷에 우리가 하는 것이다. 제대로 잠겨 있으면 아무것도
   만들어지지 않는다. 혹시 성공하면 그 자체가 발견이고, 만들어진 객체 이름을
   그대로 보고한다(지우려면 자격증명이 필요하다).
"""

import json
import os
import sys
import urllib.error
import urllib.parse
import urllib.request

for _s in (sys.stdout, sys.stderr):
    try:
        _s.reconfigure(encoding="utf-8", errors="replace")
    except (AttributeError, ValueError):
        pass

BUCKET = "earthus-cache-kr"
REGION = "us-east-2"
BASE = "https://%s.s3.%s.amazonaws.com" % (BUCKET, REGION)
PROBE_KEY = "_integration3-bypass-probe/anyone-can-write.txt"
TIMEOUT = 15

# (키, 무엇이어야 하나, 왜)
READ_PROBES = (
    ("app/index.html",                    "OPEN",   "앱이 열려야 한다"),
    # ⚠️ 옛 자리. 람다는 이제 archive/ 에 쓴다(INTEGRATION-4 §0). 여기 있는 것은
    #    지워야 할 **잔존물**이다 — 지워지기 전까지 이 줄은 FAIL 로 남는다.
    ("events/social-drafts.json",         "CLOSED", "SNS 초안(옛 자리) — 지워야 할 잔존물"),
    ("archive/social-drafts.json",        "CLOSED", "SNS 초안(새 자리) — 비공개여야 한다"),
    ("events/distribution-content.json",  "CLOSED", "배포 후보 색인 — 승인 전이다"),
    ("archive/",                          "CLOSED", "보관 경로는 비공개다"),
    ("app/supabase/schema.sql",           "CLOSED", "DB 스키마"),
    ("app/README.md",                     "CLOSED", "저장소 안쪽 문서"),
    ("app/v3-paper/README.md",            "CLOSED", "v3 인계 문서"),
    ("app/devserver.py",                  "CLOSED", "개발 서버"),
    ("app/v2-deploy/engine-v11/postgres/20260826_v11_advanced_intelligence.sql",
                                          "CLOSED", "DB 스키마 (supabase/ 밖)"),
)


def _status(url, method="GET", data=None):
    """(코드, 짧은 메모). 네트워크가 안 되면 코드는 None 이다.

    ⚠️ 403 과 404 를 뭉치지 않는다. 403 은 "있지만 못 읽는다", 404 는 "없다" 다.
       청소가 끝났는지 보려면 그 둘을 구분해야 한다 — 404 만이 지워졌다는 뜻이다.
    """
    req = urllib.request.Request(url, method=method, data=data)
    try:
        with urllib.request.urlopen(req, timeout=TIMEOUT) as r:
            return r.getcode(), None
    except urllib.error.HTTPError as e:
        return e.code, None
    except Exception as e:                              # noqa: BLE001
        return None, "%s: %s" % (type(e).__name__, str(e)[:120])


def read_probe(key, want, why):
    code, note = _status("%s/%s" % (BASE, key))
    if code is None:
        state = "UNKNOWN"
    elif code == 200:
        state = "OPEN"
    elif code in (401, 403):
        state = "CLOSED"          # 있지만 공개되지 않았다
    elif code == 404:
        state = "ABSENT"          # 아예 없다 — 지워졌거나 만든 적이 없다
    else:
        state = "UNKNOWN"
    ok = (state == want) or (want == "CLOSED" and state == "ABSENT")
    return {"key": key, "want": want, "state": state, "http": code,
            "ok": ok, "why": why, "note": note}


def write_probe():
    """서명 없는 PUT. 403 이어야 한다."""
    code, note = _status("%s/%s" % (BASE, PROBE_KEY), method="PUT",
                         data=b"integration3 bypass probe\n")
    if code is None:
        state = "UNKNOWN"
    elif code in (200, 201, 204):
        state = "OPEN"                                  # 아무나 쓸 수 있다
    elif code in (401, 403):
        state = "CLOSED"
    else:
        state = "UNKNOWN"
    return {"key": PROBE_KEY, "want": "CLOSED", "state": state, "http": code,
            "ok": state == "CLOSED", "note": note,
            "why": "서명 없는 쓰기 — 막혀 있어야 한다",
            "created": state == "OPEN"}


def audit_denied(limit=None, workers=8):
    """거름망이 막는 **모든** 경로를 공개 주소에서 두드린다.

    ⚠️ 왜 필요한가: 인계 문서에 손으로 적어 둔 17건은 **재현이 안 됐다.**
       어떤 스크립트도 그 목록을 만들지 못했고, 정해진 항목만 두드리는 검사로는
       확인할 수도 없었다. 청소 대상은 사람이 기억하는 목록이 아니라
       거름망이 막는 목록에서 나와야 한다.

    돌려주는 것: 지금 공개로 읽히는 (지워야 할) 키 목록
    """
    import concurrent.futures as cf
    here = os.path.dirname(os.path.abspath(__file__))
    sys.path.insert(0, os.path.join(here, "_shared"))
    import public_build as pb                        # noqa: E402

    proto = os.path.join(os.path.dirname(here), pb.SOURCE_DIR)
    denied = [d["path"] for d in pb.plan(proto)["denied"]]
    if limit:
        denied = denied[:limit]

    # app/ 밖에 있는 알려진 구멍도 같이 본다 — 거름망은 app/ 만 덮는다.
    import publication_privacy as _priv                 # noqa: E402
    outside = [k for k in _priv.KNOWN_PUBLIC_LEAKS if not k.endswith("/")]

    def one(item):
        rel, prefix = item
        url = "%s/%s%s" % (BASE, prefix, urllib.parse.quote(rel))
        code, note = _status(url, method="HEAD")
        return prefix + rel, code, note

    targets = [(r, "app/") for r in denied] + [(k, "") for k in outside]
    with cf.ThreadPoolExecutor(workers) as ex:
        out = list(ex.map(one, targets))

    live = sorted(r for r, c, _ in out if c == 200)
    unknown = sorted(r for r, c, _ in out if c is None)
    print("▸ 거름망이 막는 경로 %d건을 두드렸다" % len(out))
    print("  이미 공개(지워야 함) %d · 확인 못 함 %d" % (len(live), len(unknown)))
    print("")
    for rel in live:
        print("  DELETE  %s" % rel)
    if unknown:
        print("")
        print("  ⚠️ 확인 못 함 %d건 — 통과로 세지 않는다:" % len(unknown))
        for rel in unknown[:10]:
            print("     %s" % rel)
    print("")
    if live:
        print("  지우는 법 (s3:DeleteObject 권한이 있는 자격증명으로):")
        print("    aws s3 rm s3://%s/<위 경로> --region %s" % (BUCKET, REGION))
        print("  지운 뒤 이 명령을 다시 돌려 목록이 비는지 확인한다.")
    return {"probed": len(out), "live": live, "unknown": unknown}


def main():
    if "--audit-denied" in sys.argv:
        res = audit_denied()
        return 0 if not (res["live"] or res["unknown"]) else 1
    rows = [read_probe(*p) for p in READ_PROBES]
    rows.append(write_probe())

    print("▸ 공개 접근 실측 — %s" % BASE)
    print("")
    for r in rows:
        mark = "OK " if r["ok"] else ("?? " if r["state"] == "UNKNOWN" else "!! ")
        print("  %s %-6s %-4s  %s" % (mark, r["state"], r["http"] or "-", r["key"]))
        if not r["ok"]:
            print("        기대 %s · %s%s" % (r["want"], r["why"],
                                              (" · " + r["note"]) if r["note"] else ""))
    print("")
    unknown = [r for r in rows if r["state"] == "UNKNOWN"]
    opened = [r for r in rows if r["want"] == "CLOSED" and r["state"] == "OPEN"]
    closed_but_needed = [r for r in rows if r["want"] == "OPEN" and r["state"] != "OPEN"]

    if unknown:
        print("❌ 확인하지 못한 항목 %d건 — **통과로 세지 않는다.**" % len(unknown))
        for r in unknown:
            print("   %s  %s" % (r["key"], r["note"] or "응답을 해석할 수 없다"))
    if opened:
        print("❌ 비공개여야 하는데 **열려 있다** %d건:" % len(opened))
        for r in opened:
            print("   %s — %s" % (r["key"], r["why"]))
    if closed_but_needed:
        print("❌ 열려 있어야 하는데 막혔다 %d건" % len(closed_but_needed))
    if any(r.get("created") for r in rows):
        print("🚨 서명 없는 쓰기가 성공했다. 만들어진 객체: %s" % PROBE_KEY)
        print("   자격증명 있는 사람이 즉시 지우고 버킷 정책을 고쳐야 한다.")
    if not (unknown or opened or closed_but_needed):
        print("✅ 전부 기대대로다.")

    print("")
    print(json.dumps({"base": BASE, "rows": rows}, ensure_ascii=False, indent=1))
    return 0 if not (unknown or opened or closed_but_needed) else 1


if __name__ == "__main__":
    sys.exit(main())
