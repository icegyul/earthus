# -*- coding: utf-8 -*-
"""발행 게이트와 되읽기 — INTEGRATION-2 §6 · §7 · §8 · §10 · §13.

**이 파일은 SNS 어댑터를 고치지 않는다.** 어댑터는 다른 세션 소유다(§16).
여기서 하는 일은 그 앞뒤를 감싸는 것뿐이다:

    BUILD → VALIDATE → **APPROVE** → PUBLISH → **VERIFY**
                         (여기)              (여기)

⚠️⚠️ 세 상태를 절대 섞지 않는다(§6).
    PAYLOAD_READY  페이로드를 만들었다.        — 사람은 아직 아무것도 안 했다
    APPROVED       사람이 승인했다.            — 아직 아무 데도 안 올라갔다
    PUBLISHED      플랫폼에서 **되읽어 확인**했다. — 요청 성공만으로는 여기 못 온다

"업로드 요청이 200 이었다"는 PUBLISHED 가 아니다(§8). 되읽어서 그 글이 실제로
거기 있고, 우리가 보낸 것과 같은 글인지 확인해야 PUBLISHED 다.

⚠️ 자격증명이 없으면 PUBLISH_BLOCKED_NO_CREDENTIALS 로 끝난다. 가짜 성공 금지.
"""
import os
import sys

_HERE = os.path.dirname(os.path.abspath(__file__))
_AWS = os.path.dirname(_HERE)
sys.path.insert(0, os.path.join(_AWS, "_shared"))

import publication_privacy as priv    # noqa: E402

PUBLISH_SCHEMA = "earthus.social-publication.v1"

# §6 — 게이트 상태. 페이로드 준비와 승인과 발행은 서로 다른 사건이다.
GATE_STATES = ("NOT_READY", "PAYLOAD_READY", "APPROVED", "PUBLISHED", "REJECTED", "FAILED")

BLOCKED_NO_CREDENTIALS = "PUBLISH_BLOCKED_NO_CREDENTIALS"

# 승인으로 인정하는 콘텐츠 상태. DRAFT 는 절대 아니다.
APPROVED_STATES = ("APPROVED", "SCHEDULED")


class PublishError(RuntimeError):
    pass


# ── §13 콘텐츠 품질 게이트 ───────────────────────────────────────────────────
def readiness(content, *, visual_assets=None, report=None):
    """§13 — CONTENT READY 조건. 하나라도 실패하면 NOT_READY.

    돌려주는 것: {state, checks{}, problems[]}
    ⚠️ 확인되지 않은 시각자산이 붙어 있으면 READY 가 아니다(§10).
    """
    checks, problems = {}, []

    def need(name, ok, why):
        checks[name] = bool(ok)
        if not ok:
            problems.append(why)

    need("report_id", bool(content.get("reportIds")), "리포트를 가리키지 않는다")
    need("fact_or_source", bool(content.get("datasetRefs")) or bool(content.get("claims")),
         "출처도 문장도 없다")
    need("phenomenon", bool(content.get("phenomenonIds")) or bool(content.get("eventIds")),
         "현상도 사건도 가리키지 않는다")

    # §10 — 시각자산이 붙어 있으면 **전부 확인된 것**이어야 한다.
    assets = {a.get("assetId"): a for a in (visual_assets or [])}
    attached = list(content.get("visualAssetIds") or [])
    unverified = [i for i in attached if not (assets.get(i) or {}).get("verified")]
    need("visual_verified", not unverified,
         "확인되지 않은 시각자산이 붙어 있다: %s" % unverified)

    # 숫자 검증 — 콘텐츠가 리포트에 없는 숫자를 말하지 않는가
    pool = set(content.get("numericPool") or [])
    need("numeric_pool", not content.get("numericProblems"),
         "숫자 검증에 걸린 항목이 있다")
    checks["numeric_pool_size"] = len(pool)

    need("provenance", bool(content.get("dataSnapshotId")), "재현할 스냅샷이 없다")
    need("no_block_reasons", not content.get("blockReasons"),
         "차단 사유가 있다: %s" % ", ".join(content.get("blockReasons") or []))

    vis, why = priv.content_visibility(content)
    checks["visibility"] = vis
    # 준비 단계에서는 DRAFT 여도 된다 — 승인 전이니까. 차단만 막는다.
    if content.get("eligibility") in priv.BLOCKING_ELIGIBILITY:
        problems.append("자격 판정이 %s" % content.get("eligibility"))

    state = "PAYLOAD_READY" if not problems else "NOT_READY"
    return {"state": state, "checks": checks, "problems": problems}


# ── §6 승인 ──────────────────────────────────────────────────────────────────
def approval_state(content):
    """사람이 승인했는가. 페이로드가 있다는 것과 승인은 다르다."""
    st = content.get("status")
    if st in APPROVED_STATES:
        return "APPROVED"
    if st == "REJECTED":
        return "REJECTED"
    if st == "PUBLISHED":
        return "PUBLISHED"
    return "PAYLOAD_READY" if content.get("platformVersions") else "NOT_READY"


# ── §7 발행 ──────────────────────────────────────────────────────────────────
def publish_platform(content, platform, adapter, *, actor=None, at=None,
                     visual_assets=None, confirmed=False):
    """한 플랫폼에 발행을 시도한다. **어댑터는 그대로 쓴다.**

    돌려주는 것: §7 의 발행 결과 기록.
    """
    result = {
        "schemaVersion": PUBLISH_SCHEMA,
        "platform": platform,
        "contentId": content.get("contentId"),
        "reportIds": list(content.get("reportIds") or []),
        "visualAssetIds": list(content.get("visualAssetIds") or []),
        "requestedAt": at,
        "publishedAt": None,
        "remoteUrl": None,
        "remoteStatus": None,
        "requestId": None,
        "state": "FAILED",
        "reason": None,
        "readBack": None,
    }

    # 1) 준비됐나 (§13)
    ready = readiness(content, visual_assets=visual_assets)
    if ready["state"] != "PAYLOAD_READY":
        result["state"] = "NOT_READY"
        result["reason"] = "; ".join(ready["problems"][:3])
        return result

    # 2) 사람이 승인했나 (§6) — 페이로드가 있다고 올리지 않는다
    appr = approval_state(content)
    if appr != "APPROVED":
        result["state"] = "PAYLOAD_READY" if appr == "PAYLOAD_READY" else appr
        result["reason"] = "사람 승인 전이다(현재 %s). 페이로드 준비는 승인이 아니다." % appr
        return result

    pv = (content.get("platformVersions") or {}).get(platform)
    if not pv:
        result["reason"] = "이 플랫폼 판이 없다"
        return result

    # 3) 자격증명 (§7)
    if not getattr(adapter, "credentials_present", False):
        result["state"] = "FAILED"
        result["reason"] = BLOCKED_NO_CREDENTIALS
        return result

    # 4) 발행 — 어댑터가 확인·자격·전송로를 스스로 검사한다
    try:
        pub = adapter.publish(pv, confirmed=confirmed, actor=actor, at=at)
    except Exception as e:                              # noqa: BLE001
        code = getattr(e, "code", None)
        result["reason"] = "%s%s" % (code + ": " if code else "", str(e)[:200])
        if code == "NOT_CONFIGURED":
            result["reason"] = BLOCKED_NO_CREDENTIALS
        return result

    result["requestId"] = pub.get("idempotencyKey")
    result["remoteUrl"] = pub.get("url")
    result["remoteStatus"] = pub.get("status")

    # 5) 되읽기 (§8) — 요청 성공만으로 PUBLISHED 라고 하지 않는다
    verify = verify_published(pub, adapter)
    result["readBack"] = verify
    if verify.get("verified"):
        result["state"] = "PUBLISHED"
        result["publishedAt"] = pub.get("publishedAt") or at
    else:
        result["state"] = "FAILED"
        result["reason"] = verify.get("reason") or "발행을 되읽어 확인하지 못했다"
    return result


# ── §8 되읽기 ────────────────────────────────────────────────────────────────
def verify_published(publication, adapter):
    """플랫폼에서 다시 읽어 그 글이 실제로 있는지 확인한다.

    ⚠️ MOCK 발행은 **확인된 것이 아니다.** 주소가 없는 가짜 글을 PUBLISHED 로 올리면
       나중에 "올렸는데 왜 없지"가 된다. mock 은 그대로 mock 이라고 말한다.
    """
    pub = publication or {}
    if pub.get("mock"):
        return {"verified": False, "reason": "MOCK 발행 — 실제 플랫폼에 올라가지 않았다",
                "mock": True}
    if pub.get("status") == "PREVIEW_ONLY":
        return {"verified": False, "reason": "미리보기 모드 — 전송하지 않았다"}
    if not pub.get("postId"):
        return {"verified": False, "reason": "플랫폼이 글 id 를 주지 않았다"}

    try:
        st = adapter.get_status(pub)
    except Exception as e:                              # noqa: BLE001
        return {"verified": False, "reason": "상태 조회 실패: %s" % str(e)[:160]}

    same_post = st.get("postId") == pub.get("postId")
    live = str(st.get("state") or "").upper() in ("PUBLISHED", "LIVE", "OK")
    if not same_post:
        return {"verified": False, "reason": "되읽은 글 id 가 다르다", "status": st}
    if not live:
        return {"verified": False, "reason": "되읽은 상태가 발행이 아니다: %s" % st.get("state"),
                "status": st}
    return {"verified": True, "status": st, "url": st.get("url") or pub.get("url")}


def publication_summary(results):
    """여러 플랫폼 결과를 한 줄로. 무엇이 막혔는지 숨기지 않는다."""
    by = {}
    for r in results or []:
        by.setdefault(r.get("state") or "FAILED", []).append(r.get("platform"))
    return {
        "counts": {k: len(v) for k, v in by.items()},
        "byState": by,
        "published": sorted(by.get("PUBLISHED") or []),
        "blocked": sorted(p for r in (results or []) for p in [r.get("platform")]
                          if r.get("reason") == BLOCKED_NO_CREDENTIALS),
    }
