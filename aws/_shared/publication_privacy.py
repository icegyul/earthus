# -*- coding: utf-8 -*-
"""공개/비공개 경계 — INTEGRATION-2 §5 · §6.

**승인되지 않은 것은 공개 경로에 두지 않는다.**

왜 한 파일에 모으나: 지금 이 저장소에는 공개 여부를 판단하는 자리가 여러 곳이다 —
리포트 발행기, 배포 핸들러, 정적 번들. 각자 판단하면 한 곳만 고쳐도 다른 곳으로 샌다.
경계는 여기 한 번만 정의하고 나머지는 물어본다.

접두사 정책은 **실측**이다(2026-09-08, 공개 주소로 직접 확인):
    events/**  wind/**  ocean/**   → 200  공개
    archive/**                     → 403  비공개
    reports/**                     → 403  (아직 발행 없음)

⚠️⚠️ 지금 남아 있는 구멍을 숨기지 않는다.
   `events/social-drafts.json` — **코드에서는 닫았다**(INTEGRATION-4 §0).
   람다가 쓰는 자리를 `archive/social-drafts.json` 으로 옮겼고, 자격증명 없이 읽던
   관리 화면도 그 주소를 놓았다. 그런데 **예전에 쓰인 객체가 S3 에 남아 있다** —
   지울 권한(s3:DeleteObject)이 없어서다. 그래서 아직 알려진 구멍으로 둔다.
   지우고 나면 이 항목을 뺀다. 지우기 전에 빼면 검사가 거짓말을 하게 된다.
"""

# ── 상태 어휘 ────────────────────────────────────────────────────────────────
# 콘텐츠 쪽 (content_contract.CONTENT_STATUS 의 부분집합으로 판정한다)
CONTENT_PUBLIC = ("PUBLISHED",)
CONTENT_PUBLIC_PREVIEW = ("APPROVED", "SCHEDULED")   # 사람이 승인한 것. 미리보기 허용 대상
CONTENT_PRIVATE = ("DRAFT", "FACT_CHECK", "REVIEW", "REJECTED", "REVISION_REQUIRED")

# 리포트 쪽 (report_contract.REPORT_LIFECYCLE)
REPORT_PUBLIC = ("PUBLISHED",)
REPORT_PRIVATE = ("DRAFT", "GENERATING", "VALIDATING", "FAILED")
# ARCHIVED 는 한 번 공개된 것이 물러난 상태다. 공개로 친다(링크가 죽으면 안 된다).
REPORT_PUBLIC_RETIRED = ("ARCHIVED",)

# 자격 판정이 이것이면 상태와 무관하게 공개하지 않는다.
BLOCKING_ELIGIBILITY = ("BLOCKED", "INSUFFICIENT_DATA")
BLOCKING_SAFETY = ("LEVEL_3_HUMAN_ONLY",)

# ── 접두사 ───────────────────────────────────────────────────────────────────
PUBLIC_PREFIXES = ("events/", "wind/", "ocean/", "reports/", "clouds/", "app/")
PRIVATE_PREFIXES = ("archive/",)

# 지금 알려진 예외. **고쳐야 할 목록이지 허용 목록이 아니다.**
# 여기 들어 있다고 통과시키지 않는다 — 검사는 이것들을 KNOWN_LEAK 로 보고한다.
KNOWN_PUBLIC_LEAKS = {
    "events/social-drafts.json":
        "옛 객체가 공개 경로에 남아 있다. 쓰는 자리는 archive/ 로 옮겼고 읽는 쪽도 놓았지만"
        "(INTEGRATION-4 §0), 이미 올라간 객체는 삭제 권한이 없어 못 지웠다.",
    "events/distribution-content.json":
        "배포 후보 색인이 공개 경로다. 관리 화면(distribution-admin.js)이 같은 이유로 읽는다.",
    "events/distribution-content/":
        "배포 후보 본문. 차단·사람전용 후보는 이미 올리지 않지만 나머지는 공개다.",
}


class PrivacyError(RuntimeError):
    pass


def prefix_visibility(key):
    """S3 키 → 'PUBLIC' | 'PRIVATE' | 'UNKNOWN'.

    모르면 UNKNOWN 이다. **모르는 것을 공개로 가정하지 않는다** — 반대도 마찬가지다.
    """
    if not isinstance(key, str) or not key:
        return "UNKNOWN"
    for p in PRIVATE_PREFIXES:
        if key.startswith(p):
            return "PRIVATE"
    for p in PUBLIC_PREFIXES:
        if key.startswith(p):
            return "PUBLIC"
    return "UNKNOWN"


def content_visibility(content):
    """콘텐츠 하나가 공개 가능한가.

    돌려주는 것: ('PUBLIC' | 'PUBLIC_PREVIEW' | 'PRIVATE', 사유)
    """
    if not isinstance(content, dict):
        return "PRIVATE", "콘텐츠가 아니다"
    if content.get("eligibility") in BLOCKING_ELIGIBILITY:
        return "PRIVATE", "자격 판정이 %s" % content.get("eligibility")
    if content.get("safetyLevel") in BLOCKING_SAFETY:
        return "PRIVATE", "안전등급이 사람 전용"
    if content.get("blockReasons"):
        return "PRIVATE", "차단 사유가 있다: %s" % ", ".join(content["blockReasons"][:3])
    st = content.get("status")
    if st in CONTENT_PUBLIC:
        return "PUBLIC", None
    if st in CONTENT_PUBLIC_PREVIEW:
        return "PUBLIC_PREVIEW", None
    if st in CONTENT_PRIVATE:
        return "PRIVATE", "상태가 %s — 사람 승인 전이다" % st
    return "PRIVATE", "알 수 없는 상태: %s" % st


def report_visibility(report):
    """리포트 하나가 공개 가능한가."""
    if not isinstance(report, dict):
        return "PRIVATE", "리포트가 아니다"
    life = report.get("lifecycle") or report.get("status")
    if life in REPORT_PUBLIC or life in REPORT_PUBLIC_RETIRED:
        return "PUBLIC", None
    if life in REPORT_PRIVATE:
        return "PRIVATE", "생애가 %s — 발행 전이다" % life
    return "PRIVATE", "알 수 없는 생애: %s" % life


def check_public_write(key, artifact, *, kind="content"):
    """이 키에 이 산출물을 써도 되는가. §5 의 핵심 검사.

    돌려주는 것: {allowed, visibility, keyVisibility, reason, knownLeak}
    ⚠️ knownLeak 이어도 allowed 를 True 로 바꾸지 않는다. 알려진 구멍은
       '허용'이 아니라 '아직 못 고친 것'이다.
    """
    kv = prefix_visibility(key)
    vis, why = (content_visibility(artifact) if kind == "content"
                else report_visibility(artifact))
    leak = None
    for k, note in KNOWN_PUBLIC_LEAKS.items():
        if key == k or key.startswith(k):
            leak = note
            break
    allowed = not (kv == "PUBLIC" and vis == "PRIVATE")
    return {
        "allowed": allowed,
        "visibility": vis,
        "keyVisibility": kv,
        "reason": None if allowed else ("공개 경로 %s 에 비공개 산출물: %s" % (key, why)),
        "knownLeak": leak,
    }


def filter_for_public(artifacts, *, kind="content"):
    """공개 목록에 넣어도 되는 것만 남긴다. 나머지는 사유와 함께 돌려준다.

    돌려주는 것: (공개 가능, [{id, visibility, reason} …])
    """
    keep, dropped = [], []
    for a in artifacts or []:
        vis, why = (content_visibility(a) if kind == "content" else report_visibility(a))
        if vis == "PRIVATE":
            dropped.append({"id": a.get("contentId") or a.get("reportId"),
                            "visibility": vis, "reason": why})
        else:
            keep.append(a)
    return keep, dropped


# 이 문서가 **우리 콘텐츠/리포트**인지 알아보는 표식.
# ⚠️ status 문자열만 보고 판정하면 안 된다. 저장소에는 status:"DRAFT" 를 가진
#    정책 문서(prototype/data/aetherus/*.json 등)가 여럿 있고 그건 배포 콘텐츠가 아니다.
#    실제로 그 문서들이 통째로 '유출'로 잡혔다 — 그런 검사기는 곧 무시당한다.
CONTENT_MARKERS = ("contentId", "platformVersions", "eligibility", "safetyLevel")
REPORT_MARKERS = ("reportId", "dataSnapshotId", "algorithmVersion")


def _looks_like_artifact(node):
    """콘텐츠/리포트 봉투로 보이는가. 표식이 하나도 없으면 남의 문서다."""
    if not isinstance(node, dict):
        return None
    schema = node.get("schemaVersion")
    if isinstance(schema, str):
        if "distribution-content" in schema:
            return "content"
        if "report-engine" in schema:
            return "report"
    if any(k in node for k in CONTENT_MARKERS):
        return "content"
    if any(k in node for k in REPORT_MARKERS):
        return "report"
    return None


def scan_public_payload(doc):
    """공개 경로에 올라간 문서 안에 비공개 상태가 섞여 있는지 훑는다.

    색인 파일처럼 여러 항목을 담은 문서를 검사할 때 쓴다.
    **콘텐츠/리포트 봉투로 보이는 노드만** 본다 — 남의 문서의 status 를 오탐하지 않는다.
    돌려주는 것: 문제 목록(비어 있으면 깨끗하다)
    """
    problems = []

    def walk(node, path="$"):
        if isinstance(node, dict):
            kind = _looks_like_artifact(node)
            if kind:
                st = node.get("status") or node.get("lifecycle")
                bad = (st in CONTENT_PRIVATE) if kind == "content" else (st in REPORT_PRIVATE)
                if isinstance(st, str) and bad:
                    ident = node.get("contentId") or node.get("reportId") or path
                    problems.append("%s 상태의 %s 가 공개 문서에 있다: %s" % (st, kind, ident))
            for k, v in node.items():
                walk(v, "%s.%s" % (path, k))
        elif isinstance(node, list):
            for i, v in enumerate(node):
                walk(v, "%s[%d]" % (path, i))

    walk(doc)
    return problems
