#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""운영 버킷 실사 — INTEGRATION-6 §1 · §2 · §3.

    AWS_PROFILE=earthus-deploy python3 aws/live-audit.py
    AWS_PROFILE=earthus-deploy python3 aws/live-audit.py --out docs/earthus-v2/integration-6-live-audit.json

버킷에 **실제로 있는 것**을 목록으로 읽어 분류한다.

⚠️⚠️ 왜 목록이어야 하나
   거름망 계획(aws/build-public.py)은 *지금* prototype/ 에 있는 경로만 안다.
   옛 배포가 남긴, 지금 트리에 없는 객체는 계획에 없으므로 두드려 볼 생각조차 못 한다.
   실측(2026-09-08): 계획 기준 26건 · 목록 기준 **99건**. 73건이 옛 잔존물이었고
   그 안에 DB 스키마와 마이그레이션 21건이 있었다.

⚠️ 이 도구는 **아무것도 지우지 않는다.** 지우는 것은 사람이 한다(§4).

분류 (§2):
    KEEP_PUBLIC            공개가 맞다
    KEEP_PRIVATE           비공개 접두사에 있고 실제로 비공개다
    LEGACY_PUBLIC_FORBIDDEN  공개인데 금지 부류다 — 지울 대상
    EXEMPT_PRODUCT_PATH    운영 제품이 쓰는 경로. **일괄 삭제 금지**
    DELETE_CANDIDATE       LEGACY 중 안전 판정까지 끝난 것
"""

import argparse
import concurrent.futures as cf
import hashlib
import json
import os
import subprocess
import sys
import urllib.error
import urllib.parse
import urllib.request

for _s in (sys.stdout, sys.stderr):
    try:
        _s.reconfigure(encoding="utf-8", errors="replace")
    except (AttributeError, ValueError):
        pass

HERE = os.path.dirname(os.path.abspath(__file__))
REPO = os.path.dirname(HERE)
sys.path.insert(0, os.path.join(HERE, "_shared"))

import public_build as pb            # noqa: E402
import publication_privacy as priv   # noqa: E402

BUCKET = "earthus-cache-kr"
REGION = "us-east-2"
BASE = "https://%s.s3.%s.amazonaws.com" % (BUCKET, REGION)

# 훑는 접두사. 버킷 전체를 보되 계정 단위 나열은 하지 않는다.
PREFIXES = ("app/", "events/", "archive/", "reports/", "wind/", "ocean/",
            "clouds/", "solar/", "celestrak/", "analysis/")

# ⚠️ §2 — 이 경로들은 **현재 운영 제품이 쓴다.** 부류로 걸려도 일괄 삭제하지 않는다.
#    지우려면 그 제품 담당이 개별로 판단해야 한다.
EXEMPT_PRODUCT_PREFIXES = (
    ("app/v3/", "종이 지구(v3). aws/deploy-v3-paper.sh 가 소유한다"),
    ("app/wonder/", "키즈(wonder). aws/deploy-v3-kids.sh 가 소유한다"),
    ("app/orbital/", "AETHERUS ORBITAL 정적 스냅샷. build/orbital 에서 나온다"),
    ("app/aetherus/", "AETHERUS 스냅샷. tools/publish-aetherus-snapshot.sh 가 쓴다"),
    ("app/tourism/", "관광 혼잡도. tourism-flow 람다가 생성한다"),
    ("app/v2/data/current-earth/", "눈·얼음. current-earth-snow-ice 람다가 생성한다"),
    ("app/v3/characters/", "캐릭터 자산. character-studio 람다가 생성한다"),
)


def _run(cmd):
    return subprocess.run(cmd, capture_output=True)


def list_prefix(prefix):
    """S3 목록. 페이지를 끝까지 넘긴다."""
    out, token = [], None
    while True:
        cmd = ["aws", "s3api", "list-objects-v2", "--bucket", BUCKET,
               "--prefix", prefix, "--region", REGION, "--output", "json",
               "--max-items", "1000"]
        if token:
            cmd += ["--starting-token", token]
        p = _run(cmd)
        if p.returncode != 0:
            raise RuntimeError("목록 실패(%s): %s"
                               % (prefix, p.stderr.decode("utf-8", "replace")[:200]))
        doc = json.loads(p.stdout.decode("utf-8", "replace") or "{}")
        for c in doc.get("Contents") or []:
            out.append({"key": c["Key"], "size": c["Size"],
                        "etag": (c.get("ETag") or "").strip('"'),
                        "lastModified": c.get("LastModified")})
        token = doc.get("NextToken")
        if not token:
            return out


def http_status(key):
    url = "%s/%s" % (BASE, urllib.parse.quote(key))
    try:
        with urllib.request.urlopen(
                urllib.request.Request(url, method="HEAD"), timeout=25) as r:
            return r.getcode()
    except urllib.error.HTTPError as e:
        return e.code
    except Exception:                                    # noqa: BLE001
        return None


def body_sha256(key):
    p = _run(["aws", "s3", "cp", "s3://%s/%s" % (BUCKET, key), "-",
              "--region", REGION])
    if p.returncode != 0:
        return None, None
    return hashlib.sha256(p.stdout).hexdigest(), len(p.stdout)


def exempt_for(key):
    for pre, why in EXEMPT_PRODUCT_PREFIXES:
        if key.startswith(pre):
            return pre, why
    return None


def classify(obj, code):
    """(분류, 근거). §2 의 다섯 갈래."""
    key = obj["key"]
    bad = pb.forbidden_class(key)
    ex = exempt_for(key)
    vis = priv.prefix_visibility(key)

    if code == 200:
        if bad and ex:
            return ("EXEMPT_PRODUCT_PATH",
                    "금지 부류(%s)지만 운영 제품 경로다 — %s. 개별 판단 필요" % (bad, ex[1]))
        if bad:
            return ("LEGACY_PUBLIC_FORBIDDEN", bad)
        return ("KEEP_PUBLIC", "공개 제품 파일 (접두사 %s)" % vis)
    if code in (401, 403):
        return ("KEEP_PRIVATE", "익명 접근이 막혀 있다 (%s, 접두사 %s)" % (code, vis))
    if code == 404:
        return ("KEEP_PRIVATE", "익명에게 없다 (404, 접두사 %s)" % vis)
    return ("UNKNOWN", "HTTP 상태를 확인하지 못했다: %r" % code)


def write_cleanup(cands, path):
    """§20 — 사람이 그대로 돌릴 수 있는 명령. 접두사 일괄 삭제는 쓰지 않는다."""
    safe = [c for c in cands if c["safe_to_delete"]]
    unsafe = [c for c in cands if not c["safe_to_delete"]]
    L = [
        "# EARTHUS V2 — 공개 금지 객체 청소 (INTEGRATION-6 §4 · §20)",
        "#",
        "# ⚠️ 이 파일은 aws/live-audit.py 가 만든다. 손으로 고치지 않는다.",
        "# ⚠️ 접두사 일괄 삭제 금지. 아래는 키를 하나씩 지정한다.",
        "# ⚠️ deploy-app.sh 의 --delete 를 되살리지 마라 — 그 원본(build/public-app)에는",
        "#    v3/ · orbital/ · aetherus/ · tourism/ 이 없어서 다른 제품을 지운다.",
        "#",
        "# 1) 권한 (app/* 와 옛 초안 키에 한정)",
        "aws iam put-user-policy --user-name earthus-deploy --policy-name cleanup-delete \\",
        "  --policy-document '{\"Version\":\"2012-10-17\",\"Statement\":[{\"Effect\":\"Allow\",",
        "    \"Action\":\"s3:DeleteObject\",\"Resource\":[",
        "      \"arn:aws:s3:::earthus-cache-kr/app/*\",",
        "      \"arn:aws:s3:::earthus-cache-kr/events/social-drafts.json\"]}]}'",
        "",
        "# 2) 지우기 — %d건" % len(safe),
        "export AWS_PROFILE=earthus-deploy",
    ]
    for c in safe:
        L.append('aws s3api delete-object --bucket %s --region %s --key %s   # %s'
                 % (BUCKET, REGION, json.dumps(c["key"], ensure_ascii=False), c["reason"]))
    L += [
        "",
        "# 3) 되읽기 — 목록이 비어야 한다",
        "python3 aws/live-audit.py",
        "python3 aws/verify-public-access.py",
    ]
    if unsafe:
        L += ["", "# ⚠️ 자동 삭제 대상이 아니다 (운영 제품 경로) — %d건." % len(unsafe),
              "#    그 제품 담당이 개별로 판단한다."]
        for c in unsafe:
            L.append("#   %s   %s" % (c["key"], c["note"]))
    with open(path, "w", encoding="utf-8") as fh:
        fh.write("\n".join(L) + "\n")
    return len(safe), len(unsafe)


def main(argv=None):
    ap = argparse.ArgumentParser(description="운영 버킷 실사 (읽기 전용)")
    ap.add_argument("--out", default=os.path.join(
        REPO, "docs", "earthus-v2", "integration-6-live-audit.json"))
    ap.add_argument("--candidates", default=os.path.join(
        REPO, "docs", "earthus-v2", "integration-6-delete-candidates.json"))
    ap.add_argument("--cleanup", default=os.path.join(
        REPO, "docs", "earthus-v2", "integration-6-cleanup-command.txt"))
    ap.add_argument("--workers", type=int, default=12)
    ap.add_argument("--cleanup-only", action="store_true",
                    help="버킷을 다시 훑지 않고, 이미 만든 후보 목록에서 명령만 다시 만든다")
    ap.add_argument("--no-sha", action="store_true",
                    help="금지 객체의 sha256 계산을 건너뛴다(빠르지만 증거가 약하다)")
    a = ap.parse_args(argv)

    if a.cleanup_only:
        with open(a.candidates, encoding="utf-8") as fh:
            cands = json.load(fh)["objects"]
        n, m = write_cleanup(cands, a.cleanup)
        print("✅ %s  (지울 명령 %d · 제품 경로 보류 %d)" % (a.cleanup, n, m))
        return 0

    objs = []
    for pre in PREFIXES:
        rows = list_prefix(pre)
        print("  %-12s %6d" % (pre, len(rows)))
        objs += rows
    print("  %-12s %6d" % ("합계", len(objs)))
    print("")

    # 부류로 걸린 것과 제품 경로만 HTTP 로 확인한다. 1만 건을 전부 두드리지 않는다.
    need = [o for o in objs if pb.forbidden_class(o["key"]) or exempt_for(o["key"])]
    print("▸ 부류에 걸리거나 제품 경로인 것 %d건을 익명으로 두드린다" % len(need))
    with cf.ThreadPoolExecutor(a.workers) as ex:
        codes = list(ex.map(lambda o: http_status(o["key"]), need))
    seen = {}
    for o, c in zip(need, codes):
        seen[o["key"]] = c

    rows = []
    for o in objs:
        code = seen.get(o["key"])
        if code is None and o["key"] not in seen:
            # 두드리지 않은 것은 접두사 규칙으로만 적는다 — 추측을 상태로 적지 않는다
            # ⚠️ 모르는 접두사를 공개로 단정하지 않는다. publication_privacy 는
            #    UNKNOWN 을 UNKNOWN 이라고 말한다 — 여기서 그걸 KEEP_PUBLIC 으로
            #    바꾸면, 그 표가 세운 적 없는 사실을 이 도구가 지어내는 것이다.
            vis = priv.prefix_visibility(o["key"])
            kind = {"PRIVATE": "KEEP_PRIVATE", "PUBLIC": "KEEP_PUBLIC"}.get(vis, "UNKNOWN")
            rows.append(dict(o, httpStatus=None, classification=kind,
                             reason="HTTP 미확인 — 접두사 규칙(%s)으로만 분류" % vis,
                             probed=False))
            continue
        kind, why = classify(o, code)
        rows.append(dict(o, httpStatus=code, classification=kind,
                         reason=why, probed=True))

    import collections
    tally = collections.Counter(r["classification"] for r in rows)
    for k, n in tally.most_common():
        print("   %-26s %6d" % (k, n))
    print("")

    forbidden = sorted((r for r in rows if r["classification"] == "LEGACY_PUBLIC_FORBIDDEN"),
                       key=lambda x: x["key"])
    if forbidden and not a.no_sha:
        print("▸ 금지 객체 %d건의 sha256 을 계산한다" % len(forbidden))
        with cf.ThreadPoolExecutor(a.workers) as ex:
            for r, (sha, n) in zip(forbidden, ex.map(lambda r: body_sha256(r["key"]),
                                                     forbidden)):
                r["sha256"] = sha
                r["contentLength"] = n

    audit = {
        "schemaVersion": "earthus.live-audit.v1",
        "bucket": BUCKET, "region": REGION,
        "prefixes": list(PREFIXES),
        "objectCount": len(rows),
        "probedCount": len(need),
        "tally": dict(tally),
        "note": ("aws/live-audit.py 가 만든다. 손으로 고치지 않는다. "
                 "지우는 것은 사람이 한다 — 이 도구는 아무것도 지우지 않는다."),
        "objects": rows,
    }
    os.makedirs(os.path.dirname(a.out), exist_ok=True)
    with open(a.out, "w", encoding="utf-8") as fh:
        json.dump(audit, fh, ensure_ascii=False, indent=1)
    print("✅ %s" % a.out)

    # ── §3 삭제 후보 ────────────────────────────────────────────────────────
    cands = []
    for r in forbidden:
        ex = exempt_for(r["key"])
        cands.append({
            "key": r["key"],
            "url": "%s/%s" % (BASE, r["key"]),
            "size": r["size"],
            "contentLength": r.get("contentLength"),
            "sha256": r.get("sha256"),
            "lastModified": r.get("lastModified"),
            "reason": r["reason"],
            "classification": "DELETE_CANDIDATE",
            "safe_to_delete": ex is None,
            "replacement_required": False,
            "note": (ex[1] if ex else
                     "운영 제품 경로가 아니다. 지워도 화면이 깨지지 않는다 "
                     "(공개 빌드에도 들어 있지 않다)"),
        })
    with open(a.candidates, "w", encoding="utf-8") as fh:
        json.dump({"schemaVersion": "earthus.delete-candidates.v1",
                   "bucket": BUCKET, "region": REGION,
                   "count": len(cands),
                   "generatedBy": "aws/live-audit.py",
                   "objects": cands}, fh, ensure_ascii=False, indent=1)
    print("✅ %s  (삭제 후보 %d)" % (a.candidates, len(cands)))

    n, m = write_cleanup(cands, a.cleanup)
    print("✅ %s  (지울 명령 %d · 제품 경로 보류 %d)" % (a.cleanup, n, m))

    unknown = [r for r in rows if r["classification"] == "UNKNOWN"]
    if unknown:
        print("")
        print("❌ 확인하지 못한 객체 %d건 — **통과로 세지 않는다**" % len(unknown))
    return 0 if not (forbidden or unknown) else 1


if __name__ == "__main__":
    sys.exit(main())
