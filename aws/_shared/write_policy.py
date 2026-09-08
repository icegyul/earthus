# -*- coding: utf-8 -*-
"""쓰기 경로 정책 — INTEGRATION-8 §6.

`write_path.py` 가 **어디로 쓰는지**를 알아낸다. 이 파일은 **그래도 되는지**를 정한다.

    값 추적(write_path)  →  목적지 접두사  →  허용 목록 대조(여기)  →  ALLOW / DENY

⚠️ 기본값은 거부다. 모르는 목적지는 공개로 치지 않고 **막는다**.
   INTEGRATION-6 에서 `check_public_write` 가 모르는 접두사에 열려 있었다.
   같은 실수를 검사기 쪽에서 되풀이하지 않는다.

두 가지를 나눠 본다. 위험의 성질이 다르기 때문이다.

  ┌ `app/`            저장소 파일이 올라가는 곳. **여기서 샜다.**
  │                   올리는 자리를 하나하나 적어 두고, 목록 밖이면 거부한다.
  └ 자료 피드 접두사   람다가 만든 자료가 올라가는 곳(events/ wind/ ocean/ …).
                      제품 그 자체다. 다만 **저장소 파일을 올리는 길이 아님**을
                      확인한다 — 배포 스크립트가 여기 쓰면 그것도 거부다.
"""

import os
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

from publication_privacy import PRIVATE_PREFIXES, PUBLIC_PREFIXES  # noqa: E402
from write_path import WRAPPER_DEF, scan_tree  # noqa: E402

# 저장소 파일이 올라가는 접두사. 감시가 가장 두꺼워야 하는 곳.
APP_PREFIX = "app/"
# 람다가 만든 자료가 올라가는 접두사.
FEED_PREFIXES = tuple(p for p in PUBLIC_PREFIXES if p != APP_PREFIX)

FILTERED = "FILTERED"      # 원본이 build/public-app 이다 (aws/_shared/public-source.sh)
GENERATED = "GENERATED"    # 람다가 만든 자료다. 저장소 파일이 아니다
EXEMPT = "EXEMPT"          # 그 밖. 사유를 적는다

ALLOW_PRIVATE = "ALLOW_PRIVATE"
ALLOW_OTHER_STORE = "ALLOW_OTHER_STORE"
ALLOW_FEED = "ALLOW_FEED"
ALLOW_APP = "ALLOW_APP"
SKIP_WRAPPER = "SKIP_WRAPPER_DEF"
DENY_APP = "DENY_APP_NOT_ALLOWLISTED"
DENY_FEED = "DENY_FEED_FROM_DEPLOYER"
DENY_UNKNOWN_PREFIX = "DENY_UNKNOWN_PREFIX"
DENY_UNPROVEN = "DENY_UNPROVEN_DESTINATION"
DENIALS = (DENY_APP, DENY_FEED, DENY_UNKNOWN_PREFIX, DENY_UNPROVEN)


# ── `app/` 에 쓸 수 있는 자리 ────────────────────────────────────────────────
# 실측으로 채웠다(2026-09-08). 여기 없는 파일이 app/ 에 쓰면 **거부**다.
APP_WRITERS = {
    # 거름망을 지난 원본만 올린다 — aws/_shared/public-source.sh 를 읽는다
    "aws/deploy-v2-preview.sh": (FILTERED, ("app/",)),
    # app/wonder 는 /v3 의 별칭이다 (같은 index.html · base href 만 다르다)
    "aws/deploy-v3-kids.sh": (FILTERED, ("app/v3/", "app/wonder")),
    "aws/deploy-v3-paper.sh": (FILTERED, ("app/v3/", "app/wonder")),
    "tools/deploy-real-living-earth-v2.sh": (FILTERED, ("app/v2/",)),
    "tools/deploy-station-model.sh": (FILTERED, ("app/",)),
    "tools/deploy-v1.sh": (FILTERED, ("app/",)),
    # app/Intelligence 는 /v2 의 별칭이다
    "tools/deploy-v2-three.sh": (FILTERED, ("app/v2/", "app/Intelligence")),
    "tools/deploy_aetherus_public_safe.sh": (FILTERED, ("app/",)),
    "tools/deploy_free_open_policy.sh": (FILTERED, ("app/",)),
    "tools/deploy_ocean_aetherus_v3_canary.sh": (FILTERED, ("app/",)),
    "tools/deploy_ocean_public.sh": (FILTERED, ("app/",)),
    "tools/deploy_tourism_density.sh": (FILTERED, ("app/",)),

    # build/public-app 을 **직접** 원본으로 쓴다 (거름망 자체가 만든 트리)
    "aws/deploy-app.sh": (EXEMPT, ("app/",)),

    # ⚠️ 거름망 밖이다. 지금 실피해가 없는 이유는 이 스크립트가 한 번도 성공한
    #    적이 없기 때문이다(--delete 권한 없음 · app/orbital/ 객체 0건).
    #    되살리기 전에 부류 검사를 붙일 것 — INTEGRATION-7 인계 E.
    "aws/deploy-orbital-static.sh": (EXEMPT, ("app/orbital/",)),

    # 람다가 만든 자료. 저장소 파일이 아니다
    "aws/tourism-flow/handler.py": (GENERATED, ("app/tourism/",)),
    "aws/tourism-flow/kto_collector.py": (GENERATED, ("app/tourism/kto/",)),
    "aws/tourism-flow/kto_details.py": (GENERATED, ("app/tourism/kto/details/",)),
    "aws/current-earth-snow-ice/index.mjs":
        (GENERATED, ("app/v2/data/current-earth/",)),
    # 사람이 발행을 눌러야만 공개로 나간다. 나머지 쓰기는 전부 비공개 작업 공간
    "aws/character-studio/handler.py": (GENERATED, ("app/v3/characters/",)),
    # API 호출 결과를 만들어 올린다. 작업 트리 파일이 아니다
    "tools/publish-aetherus-snapshot.sh": (GENERATED, ("app/",)),
}

# 우리 운영 버킷이 아닌 저장소. 목적지를 못 밝혀도 공개 경계와 무관하다.
OTHER_STORES = {
    "services/aetherus-orbital/tools/generate_p0_evidence.py":
        "로컬 MinIO 증거 하네스다(MINIO_ENDPOINT · create_bucket). "
        "운영 버킷에 쓰지 않는다",
}

# 자료 피드에 쓰는 배포 스크립트. 저장소 파일이 아니라 만들어진 산출물만 올린다.
FEED_WRITERS = {
    "tools/deploy-real-living-earth-data.sh":
        (GENERATED, "타일러가 만든 manifest 만 올린다"),
    "tools/publish-aetherus-snapshot.sh":
        (GENERATED, "API 호출 결과를 만들어 올린다. 작업 트리 파일이 아니다"),
}

# ── 값 추적이 닿지 않는 자리 ────────────────────────────────────────────────
# **사람이 코드를 읽고 목적지를 확인한 것만** 여기 적는다. 근거 줄을 함께 남긴다.
# 여기 없는 미증명 쓰기는 거부된다. 새 미증명 자리가 생기면 시험이 깨진다.
REVIEWED_UNPROVEN = {
    ("aws/character-studio/handler.py", "put"): (
        2, "character-studio/",
        "handler.py:346  job_key = f'{PRIVATE}jobs/{cid}/{request_id}.json' "
        "— PRIVATE='character-studio/'. 공개 접두사가 아니다"),
    ("aws/gk2a-clouds/handler.py", "put_object"): (
        1, "clouds/",
        "handler.py:257  prefix = f'clouds/gk2a/tiles/{ch}/{slot}' 를 "
        "uploads 에 담아 put(item) 이 편다"),
    ("aws/signal-foundation/handler.py", "_put"): (
        1, "archive/canonical/v1",
        "handler.py:22  PREFIX = 'archive/canonical/v1' · spec['dst'] 가 전부 그 아래"),
    ("aws/source-governance/handler.py", "_put"): (
        1, "archive/governance/v1",
        "handler.py:22  PREFIX = 'archive/governance/v1' · spec['dst'] 가 전부 그 아래"),
}

SCAN_ROOTS = ("aws", "tools", "services")


def rel(path, root="."):
    return os.path.relpath(path, root).replace("\\", "/")


def known_prefix(key):
    """확실히 아는 앞부분. `…` 뒤는 모르는 것이니 쓰지 않는다."""
    return key.split("…")[0] if key else ""


def _match(table, path):
    for name in table:
        if path == name or path.endswith("/" + name):
            return name
    return None


def classify(write, root=".", wrapper_resolved=frozenset()):
    """쓰기 한 건 → 판정. 판정 이름과 사유를 같이 돌려준다."""
    path = rel(write.path, root)
    prefix = known_prefix(write.key)

    if not prefix:
        other = _match(OTHER_STORES, path)
        if other is not None:
            return _v(ALLOW_OTHER_STORE, path, "", OTHER_STORES[other])
        if write.detail == WRAPPER_DEF and path in wrapper_resolved:
            return _v(SKIP_WRAPPER, path, prefix,
                      "감싸개 정의다. 실제 키는 같은 파일의 호출 자리에서 정해지고 "
                      "그 자리들은 전부 해석됐다")
        seen = REVIEWED_UNPROVEN.get((path, write.sink))
        if seen:
            _n, dest, why = seen
            if any(dest.startswith(p) for p in PRIVATE_PREFIXES) or \
                    not any(dest.startswith(p) for p in PUBLIC_PREFIXES):
                return _v(ALLOW_PRIVATE, path, dest, "사람 확인 — " + why)
            if dest.startswith(APP_PREFIX):
                return _v(DENY_APP, path, dest,
                          "사람 확인 결과 app/ 이다. 허용 목록에 명시할 것 — " + why)
            return _v(ALLOW_FEED, path, dest, "사람 확인 — " + why)
        return _v(DENY_UNPROVEN, path, prefix,
                  "목적지를 값으로 증명하지 못했다. 모르는 목적지는 막는다")

    if any(prefix.startswith(p) for p in PRIVATE_PREFIXES):
        return _v(ALLOW_PRIVATE, path, prefix, "비공개 접두사")

    if prefix.startswith(APP_PREFIX):
        name = _match(APP_WRITERS, path)
        if name is None:
            return _v(DENY_APP, path, prefix,
                      "app/ 에 쓰는데 허용 목록에 없다. 저장소 파일이 공개로 "
                      "나가는 길이 여기서 열린다")
        how, allowed = APP_WRITERS[name]
        if not any(prefix.startswith(a) or a.startswith(prefix) for a in allowed):
            return _v(DENY_APP, path, prefix,
                      "허용된 접두사 %s 밖이다" % (", ".join(allowed),))
        return _v(ALLOW_APP, path, prefix, how)

    if any(prefix.startswith(p) for p in FEED_PREFIXES):
        name = _match(FEED_WRITERS, path)
        if name is not None:
            return _v(ALLOW_FEED, path, prefix, FEED_WRITERS[name][1])
        if path.startswith("aws/") and "/" in path[4:]:
            return _v(ALLOW_FEED, path, prefix, "람다가 만든 자료 피드")
        return _v(DENY_FEED, path, prefix,
                  "배포 스크립트가 자료 피드에 쓴다. 저장소 파일이 피드로 "
                  "새는 길이므로 사유를 적고 허용 목록에 넣어야 한다")

    return _v(DENY_UNKNOWN_PREFIX, path, prefix,
              "표에 없는 접두사다. 공개인지 비공개인지 모르는 것은 막는다")


def _v(verdict, path, prefix, reason):
    return {"verdict": verdict, "path": path, "prefix": prefix, "reason": reason,
            "denied": verdict in DENIALS}


def _wrapper_resolved(writes, root):
    """감싸개 정의만 있고 해석된 호출이 하나도 없는 파일은 봐주지 않는다."""
    defs, resolved = set(), set()
    reviewed = {p for p, _sink in REVIEWED_UNPROVEN}
    for w in writes:
        path = rel(w.path, root)
        if w.detail == WRAPPER_DEF:
            defs.add(path)
        elif w.key:
            resolved.add(path)
    # 호출 자리가 사람 확인으로 밝혀진 파일도 포함한다. 밝혀지지 않은 파일은 남는다.
    return defs & (resolved | reviewed)


def audit(root=".", roots=SCAN_ROOTS):
    writes = []
    for r in roots:
        full = os.path.join(root, r)
        if os.path.isdir(full):
            writes.extend(scan_tree(full))
    ok = _wrapper_resolved(writes, root)
    rows = []
    for w in writes:
        row = w.as_dict()
        row.update(classify(w, root, ok))
        row["path"] = rel(w.path, root)
        rows.append(row)
    counts = {}
    for r in rows:
        counts[r["verdict"]] = counts.get(r["verdict"], 0) + 1
    return {"writes": len(rows), "counts": counts,
            "denied": [r for r in rows if r["denied"]], "rows": rows}
