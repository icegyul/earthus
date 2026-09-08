# -*- coding: utf-8 -*-
"""발행 거버넌스 — INTEGRATION-3 §2 · §3 · §5 · §6 · §7 · §8.

한 곳에만 둔다. 리포트도 SNS 도 **같은 문**을 지난다.

왜 한 파일인가: INTEGRATION-2 는 승인 판정을 두 곳에 따로 만들었다 —
`report-engine/publisher.py` 와 `report-engine/social_publish.py`. 두 곳이면
한쪽만 조여도 다른 쪽으로 나간다. INTEGRATION-1 에서 배운 것과 같다:
**한 개념에 정본은 하나.**

여기서 정하는 것은 네 가지다.

    §2  사람 승인      누가·언제·어떤 방법으로 승인했는가. 시스템 계정은 승인할 수 없다.
    §3  판본 잠금      승인한 판본의 지문을 함께 적는다. 내용이 바뀌면 승인이 깨진다.
    §5  상태 기계      갈 수 있는 길만 간다. 초안에서 발행으로 건너뛰지 못한다.
    §8  시각자료       확인되지 않은 그림은 공개 콘텐츠에 들어가지 못한다.

⚠️ 이 파일은 무엇을 **막을지**만 정한다. 실제로 올리는 일은 각 발행기가 한다.
"""

import hashlib
import json
import re

try:                                    # 파이썬 3
    from urllib.parse import urlparse
except ImportError:                     # pragma: no cover
    from urlparse import urlparse       # noqa: F401

# ── §5 발행 상태 기계 ────────────────────────────────────────────────────────
PUBLISH_STATES = (
    "DRAFT",             # 만들어졌다. 아직 아무도 안 봤다
    "READY_FOR_REVIEW",  # 기계 검증 통과. **승인이 아니다**
    "APPROVED",          # 사람이 봤고 올려도 된다고 했다
    "PUBLISHING",        # 올리는 중
    "PUBLISHED",         # 올라갔고 되읽어 확인했다
    "REJECTED",          # 사람이 아니라고 했다
    "FAILED",            # 올리다 실패했다
    "ARCHIVED",          # 올라갔던 것이 물러났다
)

# 갈 수 있는 길. 여기 없는 것은 전부 막힌다.
ALLOWED_TRANSITIONS = {
    "DRAFT":            ("READY_FOR_REVIEW", "REJECTED", "FAILED"),
    "READY_FOR_REVIEW": ("APPROVED", "REJECTED", "DRAFT", "FAILED"),
    "APPROVED":         ("PUBLISHING", "REJECTED", "DRAFT"),
    "PUBLISHING":       ("PUBLISHED", "FAILED"),
    "PUBLISHED":        ("ARCHIVED",),
    "REJECTED":         ("DRAFT",),
    "FAILED":           ("DRAFT",),
    "ARCHIVED":         (),
}

# 왜 막는지 말로 적어 둔다. "허용 표에 없다"만으로는 다음 사람이 표를 고쳐 버린다.
FORBIDDEN_NOTES = {
    ("DRAFT", "APPROVED"):
        "초안을 바로 승인할 수 없다 — 검증을 거치지 않은 것을 사람이 승인할 수는 없다",
    ("DRAFT", "PUBLISHED"):
        "초안에서 바로 발행으로 갈 수 없다 — 사람 승인을 통째로 건너뛴다",
    ("DRAFT", "PUBLISHING"):
        "초안을 올리기 시작할 수 없다",
    ("READY_FOR_REVIEW", "PUBLISHED"):
        "검증 통과는 승인이 아니다. 기계가 통과시킨 것과 사람이 승인한 것은 다르다",
    ("READY_FOR_REVIEW", "PUBLISHING"):
        "승인 없이 올리기 시작할 수 없다",
    ("APPROVED", "PUBLISHED"):
        "올리는 과정을 건너뛰고 발행됐다고 적을 수 없다 — 되읽기 확인이 빠진다",
    ("PUBLISHED", "PUBLISHED"):
        "발행본은 덮어쓰지 않는다. 고칠 것이 있으면 판을 올린다",
    ("PUBLISHED", "PUBLISHING"):
        "이미 발행된 것을 다시 올리지 않는다 — 덮어쓰기가 된다. 판을 올린다",
    ("PUBLISHED", "DRAFT"):
        "발행본을 초안으로 되돌리지 않는다. 판을 올린다",
    ("PUBLISHED", "APPROVED"):
        "이미 발행된 것을 다시 승인 상태로 두지 않는다",
    ("PUBLISHED", "REJECTED"):
        "발행 뒤 되무르기는 ARCHIVED 다 — 없던 일로 만들지 않는다",
    ("ARCHIVED", "PUBLISHED"):
        "물러난 판을 다시 세우지 않는다. 새 판을 올린다",
}


class GovernanceError(RuntimeError):
    pass


def can_transition(cur, nxt):
    """이 전이가 허용되나. 돌려주는 것: {allowed, reason, code}"""
    if cur not in PUBLISH_STATES:
        return {"allowed": False, "code": "UNKNOWN_STATE",
                "reason": "모르는 상태에서 출발한다: %s" % cur}
    if nxt not in PUBLISH_STATES:
        return {"allowed": False, "code": "UNKNOWN_STATE",
                "reason": "모르는 상태로 간다: %s" % nxt}
    if nxt in ALLOWED_TRANSITIONS.get(cur, ()):
        return {"allowed": True, "code": None, "reason": None}
    note = FORBIDDEN_NOTES.get((cur, nxt))
    return {"allowed": False, "code": "FORBIDDEN_TRANSITION",
            "reason": note or "%s → %s 는 허용된 길이 아니다" % (cur, nxt)}


def forbidden_transitions():
    """막힌 전이 전부. 시험이 표를 통째로 확인할 때 쓴다."""
    out = []
    for cur in PUBLISH_STATES:
        for nxt in PUBLISH_STATES:
            if nxt not in ALLOWED_TRANSITIONS.get(cur, ()):
                out.append((cur, nxt))
    return out


# ── §3 판본 지문 ─────────────────────────────────────────────────────────────
# 지문에서 빼는 항목. **왜 빼는지**가 중요하다:
#   승인·발행 기록 자체는 내용이 아니다. 이것들을 넣으면 승인을 적는 순간
#   지문이 달라져 방금 한 승인이 스스로 깨진다.
#   상태·시각도 마찬가지다 — APPROVED → PUBLISHING 은 내용 변화가 아니다.
# 그 밖의 모든 것(제목·수치·스토리·팩트·판 번호)은 지문에 들어간다.
UNSIGNED_FIELDS = (
    "approval", "publishedAt", "immutableRef",
    "status", "state", "updatedAt", "governanceState",
)
# ⚠️⚠️ INTEGRATION-4 §7 — 여기서 `lifecycle` 과 `publication` 을 뺐었다. 구멍이었다.
#    검증을 통과하지 않은 초안(lifecycle=DRAFT)을 사람이 승인한 뒤 lifecycle 만
#    PUBLISHED 로 바꾸면 승인이 그대로 살아 있었다. 발행 어댑터는 lifecycle 하나만
#    보므로 그대로 올라간다. `publication` 도 마찬가지다 — 서명 밖 열쇠 구멍에
#    내용을 옮겨 두면 승인 뒤에 마음대로 바꿀 수 있었다.
#    이제 둘 다 서명에 들어간다. 승인 뒤 lifecycle 이 바뀌면 APPROVAL_INVALID 다.
#
#    반대로 `status` 는 계속 뺀다: 콘텐츠는 APPROVED → SCHEDULED 처럼 상태가
#    정상적으로 움직이고, 그건 내용 변화가 아니다.
#    `governanceState` 도 뺀다 — 아래에서 **읽지 않고 다시 계산**하기 때문이다.


def revision_hash(doc, *, unsigned=UNSIGNED_FIELDS):
    """이 판본의 지문. 내용이 한 글자라도 바뀌면 달라진다."""
    body = {k: v for k, v in (doc or {}).items() if k not in unsigned}
    blob = json.dumps(body, sort_keys=True, ensure_ascii=False,
                      separators=(",", ":"), default=str)
    return hashlib.sha256(blob.encode("utf-8")).hexdigest()


# ── §2 사람 승인 ─────────────────────────────────────────────────────────────
APPROVAL_FIELD = "approval"

# 승인 방법. 전부 **사람이 그 자리에 있어야** 하는 방법이다.
#   UI_CLICK      관리 화면에서 눌렀다
#   CLI_CONFIRM   명령줄에서 확인 문구를 직접 쳤다
#   SIGNED_TOKEN  사람 계정으로 발급된 서명 토큰을 썼다
APPROVAL_METHODS = ("UI_CLICK", "CLI_CONFIRM", "SIGNED_TOKEN")

# 시스템 계정 표식. **자동화가 스스로를 승인할 수 없다.**
# 승인이 자동으로 찍히면 승인란은 아무 정보도 담지 않는다 — 그럴 바엔 없는 게 낫다.
SYSTEM_ACTOR_PATTERNS = (
    re.compile(r"@(system|bot|noreply|no-reply|localhost)\b", re.I),
    re.compile(r"^(n/a|-)$", re.I),
)

# ⚠️⚠️ INTEGRATION-4 §7 — 예전에는 정규식 `^(system|auto|bot…)\b` 로만 봤다.
#    `\b` 는 글자와 숫자 사이에 경계를 두지 않는다. 그래서 **`system1` 이 사람으로
#    통과했다.** `systemd` · `autobot9` · `lambda2` 도 전부 통과했다.
#    숫자 하나로 승인 게이트가 열리는 셈이었다.
#
#    이제 이름을 토막으로 끊고, 각 토막의 꼬리 숫자를 떼어 낸 뒤 낱말로 대조한다.
#    사람 이름이 잘못 걸리는 쪽이 자동화가 통과하는 쪽보다 낫다 —
#    걸린 사람은 다른 식별자를 쓰면 되지만, 통과한 자동화는 아무도 못 본다.
SYSTEM_WORDS = frozenset("""
    system systemd sys auto automation automated autobot bot robot robo daemon
    worker service services svc svcacct serviceaccount agent job task cron
    scheduler schedule pipeline ci cd runner lambda function deploy deployer
    deployment machine api script batch nightly headless
    anonymous unknown none null na noreply
""".split())

_TOKEN = re.compile(r"[^0-9a-z]+")
_TAIL_DIGITS = re.compile(r"[0-9]+$")


def _tokens(name):
    for t in _TOKEN.split(name.lower()):
        if not t:
            continue
        yield t
        stripped = _TAIL_DIGITS.sub("", t)
        if stripped and stripped != t:
            yield stripped
            t = stripped
        # 복수형도 같은 낱말이다 — 'Systems' 가 사람으로 통과하던 것을 막는다.
        if len(t) > 3 and t.endswith("s"):
            yield t[:-1]


def is_system_actor(actor):
    """이 승인자가 사람이 아닌가. 돌려주는 것: (bool, 사유)"""
    if actor is None:
        return True, "승인자가 없다"
    if not isinstance(actor, str):
        return True, "승인자가 이름이 아니다"
    name = actor.strip()
    if not name:
        return True, "승인자가 비어 있다"
    for pat in SYSTEM_ACTOR_PATTERNS:
        if pat.search(name):
            return True, "시스템 계정으로 보인다: %s" % name
    for tok in _tokens(name):
        if tok in SYSTEM_WORDS:
            return True, "시스템 계정으로 보인다(%s): %s" % (tok, name)
    return False, None


def approve(doc, *, approved_by, approved_at, approval_method, note=None):
    """사람이 승인했다는 표식을 찍는다.

    §2 의 네 항목을 전부 요구한다: 누가(approved_by) · 언제(approved_at) ·
    어떻게(approval_method) · 무엇을(approval_revision — 지금 판본의 지문).

    ⚠️ 시스템 계정은 여기서 막힌다. 우회로를 두지 않는다.
    """
    sys_actor, why = is_system_actor(approved_by)
    if sys_actor:
        raise GovernanceError("사람만 승인할 수 있다 — %s" % why)
    if not approved_at:
        raise GovernanceError("승인 시각 없이 승인할 수 없다")
    if approval_method not in APPROVAL_METHODS:
        raise GovernanceError(
            "승인 방법이 사람의 방법이 아니다: %r (허용: %s)"
            % (approval_method, ", ".join(APPROVAL_METHODS)))
    out = dict(doc or {})
    out[APPROVAL_FIELD] = {
        "state": "APPROVED",
        "approvedBy": approved_by,
        "approvedAt": approved_at,
        "approvalMethod": approval_method,
        "approvalRevision": revision_hash(doc),
        "note": note,
    }
    return out


def approval_check(doc):
    """지금 이 문서의 승인 상태.

    돌려주는 것: {state, reasons, approvedBy, approvedAt, approvalMethod,
                 approvalRevision, currentRevision}

    state:
      APPROVED          사람이 승인했고, 승인한 판본에서 내용이 바뀌지 않았다
      APPROVAL_INVALID  승인 뒤 내용이 바뀌었다 (§3) — 다시 승인받아야 한다
      REJECTED          사람이 아니라고 했다
      NOT_APPROVED      아직 승인이 없다
    """
    doc = doc or {}
    a = doc.get(APPROVAL_FIELD) or {}
    cur = revision_hash(doc)
    out = {
        "state": "NOT_APPROVED",
        "reasons": [],
        "approvedBy": a.get("approvedBy"),
        "approvedAt": a.get("approvedAt"),
        "approvalMethod": a.get("approvalMethod"),
        "approvalRevision": a.get("approvalRevision"),
        "currentRevision": cur,
    }
    if a.get("state") == "REJECTED":
        out["state"] = "REJECTED"
        out["reasons"].append("사람이 반려했다")
        return out
    if a.get("state") != "APPROVED":
        out["reasons"].append("승인 기록이 없다")
        return out

    problems = []
    sys_actor, why = is_system_actor(a.get("approvedBy"))
    if sys_actor:
        problems.append("승인자가 사람이 아니다 — %s" % why)
    if not a.get("approvedAt"):
        problems.append("승인 시각이 없다")
    if a.get("approvalMethod") not in APPROVAL_METHODS:
        problems.append("승인 방법이 사람의 방법이 아니다: %r" % a.get("approvalMethod"))
    if not a.get("approvalRevision"):
        problems.append("승인한 판본의 지문이 없다")
    elif a.get("approvalRevision") != cur:
        problems.append("승인 뒤 내용이 바뀌었다 — 승인 %s… ≠ 현재 %s…"
                        % (str(a.get("approvalRevision"))[:12], cur[:12]))

    if problems:
        out["state"] = "APPROVAL_INVALID"
        out["reasons"] = problems
        return out
    out["state"] = "APPROVED"
    return out


def gate(doc, *, want="PUBLISHING"):
    """"지금 올려도 되나" 한 줄 판정. 발행기들이 공통으로 부른다.

    돌려주는 것: {ok, code, reason, approval, from, to}
    """
    chk = approval_check(doc)
    # ⚠️ 문서가 적어 둔 governanceState 를 **믿지 않는다.** 항상 다시 계산한다.
    #    적어 둔 값이 있으면 계산값과 같은지만 본다 — 다르면 그 문서를 신뢰할 수 없다.
    cur = _derive_state(doc, chk)
    said = (doc or {}).get("governanceState")
    if said and said != cur:
        return {"ok": False, "code": "STATE_MISMATCH",
                "reason": "문서가 적어 둔 상태(%s)가 실제 상태(%s)와 다르다" % (said, cur),
                "approval": chk, "from": cur, "to": want}
    step = can_transition(cur, want)
    if chk["state"] != "APPROVED":
        return {"ok": False,
                "code": "NOT_APPROVED" if chk["state"] == "NOT_APPROVED" else chk["state"],
                "reason": "; ".join(chk["reasons"]) or "사람 승인이 없다",
                "approval": chk, "from": cur, "to": want}
    if not step["allowed"]:
        return {"ok": False, "code": step["code"], "reason": step["reason"],
                "approval": chk, "from": cur, "to": want}
    return {"ok": True, "code": None, "reason": None,
            "approval": chk, "from": cur, "to": want}


def _derive_state(doc, chk=None):
    """governanceState 를 아직 안 들고 다니는 문서의 상태를 읽어 낸다.

    기존 리포트/콘텐츠는 lifecycle · status 를 쓴다. 그 어휘를 상태 기계로 옮긴다.
    ⚠️ lifecycle=='PUBLISHED' 는 **기계 검증을 통과했다**는 뜻으로 쓰여 왔다.
       그것을 승인으로 읽지 않는다 — READY_FOR_REVIEW 로 본다.
    """
    doc = doc or {}
    chk = chk or approval_check(doc)
    life = doc.get("lifecycle") or doc.get("status")
    if doc.get("publishedAt") or doc.get("immutableRef"):
        return "PUBLISHED"
    if life == "ARCHIVED":
        return "ARCHIVED"
    if life in ("FAILED",):
        return "FAILED"
    if life in ("REJECTED",) or chk["state"] == "REJECTED":
        return "REJECTED"
    if chk["state"] == "APPROVED":
        # ⚠️ 승인 도장이 있어도 **기계 검증을 지나지 않은 문서**는 APPROVED 가 아니다.
        #    사람이 초안을 승인했다고 해서 검증을 건너뛰는 길이 열리면 안 된다(§7).
        if life in ("DRAFT", "GENERATING"):
            return "DRAFT"
        return "APPROVED"
    if life in ("PUBLISHED", "VALIDATING", "REVIEW", "FACT_CHECK", "SCHEDULED"):
        return "READY_FOR_REVIEW"
    return "DRAFT"


# ── §8 시각자료 보안 ─────────────────────────────────────────────────────────
# 여덟 가지를 전부 통과해야 공개 콘텐츠에 들어간다. 하나라도 어긋나면
# PUBLIC_CONTENT_INVALID 다 — "일단 넣고 나중에 바꾸자"를 허용하지 않는다.
VISUAL_CHECKS = (
    "asset_identified",     # 1 자산 식별자가 있다
    "verified_flag",        # 2 캡처 검증을 통과했다고 기록돼 있다
    "verify_conditions",    # 3 그 검증의 여섯 조건이 **빠짐없이** 참이다
    "file_hash",            # 4 파일 지문이 sha256 이다
    "file_read_back",       # 5 디스크에서 되읽어 해시가 맞고 그림으로 디코딩됐다
    "pixel_check",          # 6 빈 화면이 아니다
    "source_route",         # 7 우리 런타임 주소에서 나왔다
    "layer_state",          # 8 요청한 레이어가 실제로 켜져 있었다
)

# 캡처 검증의 여섯 조건. **여기가 정본이다** — aws/report-engine/capture.py 의
# VERIFY_CONDITIONS 가 이걸 그대로 쓴다.
#
# ⚠️⚠️ 왜 정본을 옮겼나: 처음에는 이 파일이 조건 이름을 따로 갖고 있지 않고
#    "verifyConditions 안의 값이 전부 참이면 통과"로 검사했다. 그러면
#    `{"아무거나": true}` 하나만 있어도 "여섯 조건을 다 통과했다"가 된다.
#    이름 목록을 두 곳에 따로 적는 것도 같은 이유로 안 된다 — 갈라진다.
CAPTURE_VERIFY_CONDITIONS = (
    "runtime_capture", "layer_present", "camera_match",
    "pixel_variance", "file_read_back", "metadata_match",
)

# sha256 지문. tools/earthus_capture.mjs 는 'sha256:' 을 앞에 붙여 쓴다.
# 접두사 없는 형태도 받는다 — 다른 도구가 그렇게 쓸 수 있다.
_SHA256 = re.compile(r"^(sha256:)?[0-9a-f]{64}$", re.I)

# 캡처가 나올 수 있는 자리.
# ⚠️ 예전엔 주소 아무 데나 'earthus' 가 들어 있으면 통과시켰다. 그러면
#    https://example.com/x?ref=earthus 같은 **바깥 그림**이 우리 지구가 된다.
#    호스트와 경로를 갈라서 본다.
RUNTIME_HOSTS = ("localhost", "127.0.0.1", "::1", "earthus.net",
                 "earthus-cache-kr.s3.us-east-2.amazonaws.com")
RUNTIME_PATH_MARKS = ("/v2-three/", "/prototype/", "/app/v2-three/")


def _route_is_runtime(route):
    """이 주소가 우리 런타임인가. 호스트와 경로를 따로 확인한다."""
    if not isinstance(route, str) or not route:
        return False, "sourceRoute 가 없다"
    try:
        u = urlparse(route)
    except Exception:                                   # noqa: BLE001
        return False, "주소를 읽을 수 없다: %r" % route[:80]
    host = (u.hostname or "").lower()
    if not host:
        return False, "주소에 호스트가 없다: %r" % route[:80]
    if not (host in RUNTIME_HOSTS or any(host.endswith("." + h) or host == h
                                         for h in RUNTIME_HOSTS)):
        return False, "우리 호스트가 아니다: %s" % host
    path = u.path or ""
    if not any(m in path for m in RUNTIME_PATH_MARKS):
        return False, "우리 지구 경로가 아니다: %s" % (path or "/")
    return True, None


def visual_asset_check(asset):
    """시각자산 하나가 공개 콘텐츠에 들어갈 수 있나.

    ⚠️ 항목 이름은 **실제 캡처 산출물**(tools/earthus_capture.mjs 가 쓰고
       aws/report-engine/capture.py 가 얹는 것)을 그대로 읽는다. 지어내지 않는다:
         fileHash  'sha256:<hex>'
         readBack  {bytes, decoded:{ok,w,h}, hashMatches}
         pixelCheck{mean, stdev, minStdev, passed}
       처음에 이 모양을 확인하지 않고 검사기를 썼더니, 실제로 확인된 자산이
       전부 막혔다(fileHash 접두사·readBack 키 이름). 픽스처를 지어내면 그 사실이
       시험에 안 잡힌다 — 그래서 아래 시험은 디스크의 진짜 산출물도 함께 본다.

    돌려주는 것: {ok, code, checks{여덟 항목}, problems[]}
    """
    a = asset or {}
    checks = {k: False for k in VISUAL_CHECKS}
    problems = []

    if a.get("assetId"):
        checks["asset_identified"] = True
    else:
        problems.append("assetId 가 없다")

    if a.get("verified") is True:
        checks["verified_flag"] = True
    else:
        problems.append("verified 가 참이 아니다 — 확인되지 않은 캡처다")

    cond = a.get("verifyConditions") or {}
    want = set(CAPTURE_VERIFY_CONDITIONS)
    have = set(cond)
    absent = sorted(want - have)
    false_ = sorted(k for k in want & have if not cond[k])
    if not absent and not false_:
        checks["verify_conditions"] = True
    elif absent:
        problems.append("검증 조건이 빠져 있다: %s" % ", ".join(absent))
    else:
        problems.append("검증 조건이 통과하지 않았다: %s" % ", ".join(false_))

    fh = a.get("fileHash")
    if isinstance(fh, str) and _SHA256.match(fh):
        checks["file_hash"] = True
    else:
        problems.append("fileHash 가 sha256 이 아니다: %r" % fh)

    rb = a.get("readBack") or {}
    if rb.get("hashMatches") is True and (rb.get("decoded") or {}).get("ok") is True:
        checks["file_read_back"] = True
    elif not rb:
        problems.append("파일 되읽기 기록이 없다")
    else:
        problems.append("파일 되읽기가 어긋난다: hashMatches=%r decoded=%r"
                        % (rb.get("hashMatches"), rb.get("decoded")))

    pc = a.get("pixelCheck") or {}
    if pc.get("passed") is True:
        checks["pixel_check"] = True
    elif not pc:
        problems.append("픽셀 검사 기록이 없다 — 빈 화면인지 알 수 없다")
    else:
        problems.append("픽셀 검사를 통과하지 않았다(표준편차 %s < %s)"
                        % (pc.get("stdev"), pc.get("minStdev")))

    route_ok, why = _route_is_runtime(a.get("sourceRoute"))
    checks["source_route"] = route_ok
    if not route_ok:
        problems.append(why)

    ls = a.get("layerState") or {}
    want_l = set(ls.get("requestedLive") or [])
    got_l = set(ls.get("observed") or [])
    if got_l and want_l.issubset(got_l):
        checks["layer_state"] = True
    elif not got_l:
        problems.append("켜져 있던 레이어 기록이 없다")
    else:
        problems.append("요청한 레이어가 켜지지 않았다: %s" % ", ".join(sorted(want_l - got_l)))

    ok = all(checks.values())
    return {"ok": ok, "code": None if ok else "PUBLIC_CONTENT_INVALID",
            "checks": checks, "problems": problems}


def public_visuals_check(assets):
    """공개 콘텐츠에 실릴 시각자산 묶음. 하나라도 어긋나면 전체가 막힌다."""
    rows = [dict(visual_asset_check(a), assetId=(a or {}).get("assetId"))
            for a in (assets or [])]
    bad = [r for r in rows if not r["ok"]]
    return {"ok": not bad,
            "code": None if not bad else "PUBLIC_CONTENT_INVALID",
            "count": len(rows), "invalid": len(bad), "assets": rows}
