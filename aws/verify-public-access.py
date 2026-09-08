#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""공개 접근 실측 — INTEGRATION-3 §4.

    python3 aws/verify-public-access.py

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
import sys
import urllib.error
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
    ("events/social-drafts.json",         "CLOSED", "SNS 초안 — 사람 승인 전 문구다"),
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
    """(코드, 짧은 메모). 네트워크가 안 되면 코드는 None 이다."""
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
    elif code in (401, 403, 404):
        state = "CLOSED"
    else:
        state = "UNKNOWN"
    return {"key": key, "want": want, "state": state, "http": code,
            "ok": state == want, "why": why, "note": note}


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


def main():
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
