#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""공개 접근 실측 — INTEGRATION-3 §4.

    python3 aws/verify-public-access.py                # 정해진 항목을 두드린다
    python3 aws/verify-public-access.py --audit-denied # 거름망이 막는 경로를 **전부** 두드린다
    python3 aws/verify-public-access.py --audit-live   # 버킷을 **목록으로** 훑는다 (자격증명 필요)

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

# 기대값 어휘
#   OPEN    200 이어야 한다
#   CLOSED  열려 있지 않아야 한다. **부재(404)도 통과로 센다** — 지워야 할 잔존물처럼
#           "없는 것이 목표"인 줄에만 쓴다.
#   DENIED  실제로 403 이어야 한다. 부재는 통과가 아니다 — 시스템이 **쓰는** 키에 쓴다.
#
# ⚠️⚠️ 403 은 "보호되고 있다"와 "아예 없다"를 구별하지 못한다. 익명 HTTP 로는 구별할 수
#    없다(2026-09-13 실측: 비공개 접두사는 존재 여부와 무관하게 403, 공개 접두사도
#    익명에 ListBucket 이 없어 없는 키에 403 을 준다). 그래서 DENIED 통과가 말해 주는
#    것은 **"익명으로 읽히지 않는다"**까지다. "보호된 객체가 거기 있다"는 뜻이 아니다.
#    그 이상을 알려면 자격증명으로 존재를 따로 확인해야 한다 — 이 스크립트의 범위 밖이다.
ABSENT_PASSES = ("CLOSED",)          # 부재를 통과로 세는 기대값. DENIED 는 여기 없다.

# (키, 무엇이어야 하나, 왜)
READ_PROBES = (
    ("app/index.html",                    "OPEN",   "앱이 열려야 한다"),
    # ⚠️ 옛 자리. 람다는 이제 archive/ 에 쓴다(INTEGRATION-4 §0). 여기 있는 것은
    #    지워야 할 **잔존물**이다 — 지워지기 전까지 이 줄은 FAIL 로 남는다.
    ("events/social-drafts.json",         "CLOSED", "SNS 초안(옛 자리) — 지워야 할 잔존물"),
    ("archive/social-drafts.json",        "CLOSED", "SNS 초안(새 자리) — 비공개여야 한다"),
    # ⚠️ 람다는 이제 archive/ 에 쓴다. events/ 쪽은 **만들어진 적이 없어야 하는** 자리다.
    ("events/distribution-content.json",  "CLOSED", "배포 후보 색인(옛 공개 자리) — 생기면 안 된다"),
    ("events/distribution-content/CNT-2026-000001.json",
                                          "CLOSED", "배포 후보 본문(옛 공개 자리) — 생기면 안 된다"),
    # 이 둘이 람다의 실제 출력이다. 부재로는 통과시키지 않는다.
    ("archive/distribution-content.json", "DENIED", "배포 후보 색인 — 승인 전이다"),
    ("archive/distribution-content/CNT-2026-000001.json",
                                          "DENIED", "배포 후보 본문 — status=DRAFT 다"),
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

       ⚠️ 2026-09-13 실측으로 **정정**: 403 은 "있지만 못 읽는다"를 뜻하지 않는다.
          익명에게 s3:ListBucket 이 없으면 S3 는 없는 키에도 403 을 준다(존재를 숨기려고).
          공개 접두사인 events/ 에서도 그랬다.
            events/crustal.json                     200  실제로 있고 공개
            events/definitely-not-a-real-key….json  403  없는데 403
            archive/ 아래 전부                       403  있든 없든 403
          그래서 403 이 말해 주는 것은 "익명으로 읽히지 않는다"까지다. 404 는 그 키가
          없다는 뜻이 맞지만, 404 가 안 나온다고 있는 것도 아니다.
          존재를 알아야 하면 자격증명으로 따로 확인한다 — 이 스크립트의 범위 밖이다.
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
    # 예전에는 `(want == "CLOSED" and state == "ABSENT")` 가 모든 기대값에 붙어 있었다.
    # 부재가 곧 통과였다 — **검증 대상이 없으면 검증이 통과한다.** 기대값별로 나눈다.
    ok = (state == want) or (want in ABSENT_PASSES and state == "ABSENT")
    if want == "DENIED":
        ok = (state == "CLOSED")
    return {"key": key, "want": want, "state": state, "http": code,
            "ok": ok, "why": why, "note": note,
            # 무엇이 증명됐는지 적어 둔다. 403 은 "익명으로 안 읽힌다"까지만 말한다.
            "proves": ("익명으로 읽히지 않는다 (객체 존재 여부는 이것으로 알 수 없다)"
                       if state == "CLOSED" else
                       "익명으로 읽힌다" if state == "OPEN" else
                       "그 자리에 객체가 없다" if state == "ABSENT" else None)}


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


def audit_live(workers=10):
    """버킷을 목록으로 훑어 **부류로** 금지 객체를 찾는다. (자격증명 필요)

    ⚠️ --audit-denied 는 거름망 계획을 두드린다. 계획은 지금 prototype/ 에 있는
       경로만 안다 — 옛 배포가 남긴 객체는 거기 없다.
       2026-09-08 실측: 계획 기준 26건, 목록 기준 **99건**이었다. 73건 차이는
       전부 app/v2/ 아래 잔존물(스키마·마이그레이션 29건 포함)이었다.
    """
    import concurrent.futures as cf
    import json as _json
    import subprocess
    here = os.path.dirname(os.path.abspath(__file__))
    sys.path.insert(0, os.path.join(here, "_shared"))
    import public_build as pb                        # noqa: E402

    def listing(prefix):
        out, token = [], None
        while True:
            cmd = ["aws", "s3api", "list-objects-v2", "--bucket", BUCKET,
                   "--prefix", prefix, "--region", REGION, "--output", "json",
                   "--max-items", "1000"]
            if token:
                cmd += ["--starting-token", token]
            p = subprocess.run(cmd, capture_output=True)
            if p.returncode != 0:
                err = p.stderr.decode("utf-8", "replace")[:200]
                raise RuntimeError("목록을 못 읽었다 (자격증명?): %s" % err)
            doc = _json.loads(p.stdout.decode("utf-8", "replace") or "{}")
            for c in doc.get("Contents") or []:
                out.append({"key": c["Key"], "size": c["Size"]})
            token = doc.get("NextToken")
            if not token:
                return out

    try:
        objs = listing("app/") + listing("events/")
    except RuntimeError as e:
        print("❌ %s" % e)
        print("   AWS_PROFILE=earthus-deploy 로 다시 시도하거나, 자격증명 없이는")
        print("   --audit-denied 를 쓴다(계획 기준이라 잔존물은 놓친다).")
        return {"ok": False, "reason": "NO_CREDENTIALS"}

    cand = [dict(o, reason=pb.forbidden_class(o["key"])) for o in objs]
    cand = [c for c in cand if c["reason"]]
    with cf.ThreadPoolExecutor(workers) as ex:
        codes = list(ex.map(lambda c: _status(
            "%s/%s" % (BASE, urllib.parse.quote(c["key"])), method="HEAD")[0], cand))
    for c, code in zip(cand, codes):
        c["http"] = code
    live = sorted((c for c in cand if c["http"] == 200), key=lambda x: x["key"])
    unknown = [c for c in cand if c["http"] is None]

    print("▸ 버킷 객체 %d · 부류로 걸린 것 %d" % (len(objs), len(cand)))
    print("  이미 공개(지워야 함) %d · 확인 못 함 %d" % (len(live), len(unknown)))
    print("")
    import collections
    for why, n in collections.Counter(c["reason"] for c in live).most_common():
        print("   %-26s %4d" % (why, n))
    print("")
    for c in live:
        print("  DELETE  %-74s %8d  %s" % (c["key"], c["size"], c["reason"]))
    if unknown:
        print("")
        print("  ⚠️ 확인 못 함 %d건 — 통과로 세지 않는다" % len(unknown))
    print("")
    if live:
        print("  지우는 법 (s3:DeleteObject 권한이 있는 자격증명으로):")
        print("    aws s3 rm s3://%s/<위 경로> --region %s" % (BUCKET, REGION))
        print("  지운 뒤 이 명령을 다시 돌려 목록이 비는지 확인한다.")
    return {"ok": not (live or unknown), "live": live, "unknown": unknown,
            "probed": len(objs)}


def main():
    if "--audit-live" in sys.argv:
        res = audit_live()
        return 0 if res.get("ok") else 1
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
    # ⚠️⚠️ 종료코드는 **ok=False 전체**로 낸다. 예전에는 아래 세 갈래의 합집합으로 냈는데
    #    기대값 어휘가 늘면 어느 갈래에도 안 들어가는 실패가 생긴다 — 화면에는 `!!` 가
    #    찍히는데 exit 0 이 나가는 상태다. 갈래는 **설명용**이고 판정은 ok 가 한다.
    failed = [r for r in rows if not r["ok"]]
    unknown = [r for r in rows if r["state"] == "UNKNOWN"]
    opened = [r for r in rows if r["want"] in ("CLOSED", "DENIED") and r["state"] == "OPEN"]
    unproven = [r for r in rows if r["want"] == "DENIED" and r["state"] == "ABSENT"]
    closed_but_needed = [r for r in rows if r["want"] == "OPEN" and r["state"] != "OPEN"]

    if unknown:
        print("❌ 확인하지 못한 항목 %d건 — **통과로 세지 않는다.**" % len(unknown))
        for r in unknown:
            print("   %s  %s" % (r["key"], r["note"] or "응답을 해석할 수 없다"))
    if opened:
        print("❌ 비공개여야 하는데 **열려 있다** %d건:" % len(opened))
        for r in opened:
            print("   %s — %s" % (r["key"], r["why"]))
    if unproven:
        print("❌ 검증 대상이 **없어서** 통과처럼 보이는 항목 %d건 — 부재는 증거가 아니다:" % len(unproven))
        for r in unproven:
            print("   %s — %s" % (r["key"], r["why"]))
    if closed_but_needed:
        print("❌ 열려 있어야 하는데 막혔다 %d건" % len(closed_but_needed))
    if any(r.get("created") for r in rows):
        print("🚨 서명 없는 쓰기가 성공했다. 만들어진 객체: %s" % PROBE_KEY)
        print("   자격증명 있는 사람이 즉시 지우고 버킷 정책을 고쳐야 한다.")
    other = [r for r in failed if r not in unknown and r not in opened
             and r not in unproven and r not in closed_but_needed]
    if other:
        print("❌ 기대와 다른 항목 %d건:" % len(other))
        for r in other:
            print("   %s — 기대 %s · 실제 %s" % (r["key"], r["want"], r["state"]))
    if not failed:
        print("✅ 전부 기대대로다.")

    print("")
    print(json.dumps({"base": BASE, "rows": rows}, ensure_ascii=False, indent=1))
    return 0 if not failed else 1


if __name__ == "__main__":
    sys.exit(main())
