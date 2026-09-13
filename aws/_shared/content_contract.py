# -*- coding: utf-8 -*-
"""EARTHUS 배포 콘텐츠 계약 — 지시서 §7 · §8 · §9 · §11 · §26 · §27 · §124 · §125.

여기서 정하는 것은 **콘텐츠 봉투와 상태 어휘**뿐이다. 생성도 발행도 여기서 하지 않는다.

새 계보를 만들지 않는다 (저장소 실측 결과)
  · 사건·현상·출처는 이미 있다. 여기서 다시 정의하지 않고 **참조만** 든다.
      사건   intel-feed 의 `tc-<gdacsId>` / `eq-<usgsId>` · lab-reports 의 `<kind>:<sourceId>`
      현상   phenomenon-registry 의 `domain.snake`
      리포트 report_contract 의 `{kind}:{period}`
  · 플랫폼 글자 한도는 aws/social-draft/handler.py 의 LIMITS 와 같은 값을 쓴다.
    두 곳에 다른 한도가 있으면 초안은 통과하고 발행이 잘린다.
  · 실제 발행은 prototype/supabase/functions/social-admin 이 한다. 그 어휘를 그대로 받는다.

id 네임스페이스가 이제 6종이다. 섞지 않는다 — 각각 다른 필드에 담는다.
  메뉴 scene/layer · 현상 domain.snake · 리포트 {kind}:{period} · 신호 {provider}:{dataset}:{h}:{h}
  사건 {kind}-{sourceId} · 콘텐츠 CNT-{YYYY}-{순번}
"""

CONTENT_SCHEMA = "earthus.distribution-content.v1"

# 여러 현상을 가로지르는 집계 팩트의 현상 id.
# "이번 달 사건 217건" 같은 값은 어느 한 현상의 것이 아니다.
# 아무 현상이나 붙이면 화면에서 엉뚱한 현상으로 가고, 비워 두면 팩트를 만들 수 없다.
# 그래서 **가로지른다는 사실 자체를 이름으로** 둔다. 현상 레지스트리의 66종과 섞이지 않는다.
#
# ⚠️ 이 값을 aws/_shared/report_contract.py 에 두지 않는 이유: 그 파일은 리포트 엔진의
#    계약이고 다른 작업이 동시에 고치고 있다. 배포 엔진이 쓰는 값은 배포 엔진 계약에 둔다.
CROSS_PHENOMENON = "cross.aggregate"

# ── §8 콘텐츠 유형 10종 ──────────────────────────────────────────────────────
# 각 유형은 '무엇을 보고 만드는가'가 다르다. 이름만 다르고 같은 것을 만들지 않는다.
CONTENT_TYPES = (
    "BREAKING",         # 지금 막 바뀐 위험 — 기관 발표가 바뀐 순간
    "NOW",              # 지금 진행 중인 사건 하나
    "EARTH_TODAY",      # 오늘 지구에서 일어난 것들의 요약
    "EARTH_WEEKLY",     # 한 주 요약
    "PHENOMENON",       # 현상 하나를 설명 (사건이 아니라 개념)
    "DATA_STORY",       # 숫자 하나가 말하는 것 (검증 성적 등)
    "EARTH_FROM_SPACE", # 위성이 본 장면
    "MONTHLY_EARTH",    # 월간 리포트에서 파생
    "QUARTERLY_EARTH",  # 분기 리포트에서 파생
    "ANNUAL_EARTH",     # 연간 리포트에서 파생
)

# ── §9 우선순위 ──────────────────────────────────────────────────────────────
# 숫자가 작을수록 급하다. 이 값은 자격 판정(eligibility.py)이 **근거와 함께** 만든다.
PRIORITIES = ("P0", "P1", "P2", "P3", "P4")

# ── §11 신뢰도 ───────────────────────────────────────────────────────────────
# 사건 피드의 high/medium/low 를 대문자로 승격해 쓴다. 새 척도를 만들지 않는다.
CONFIDENCE = ("HIGH", "MEDIUM", "LOW", "UNKNOWN")
FEED_CONFIDENCE_TO_CONTENT = {"high": "HIGH", "medium": "MEDIUM", "low": "LOW"}

# ── §26 리뷰 워크플로 ────────────────────────────────────────────────────────
CONTENT_STATUS = (
    "DRAFT", "FACT_CHECK", "REVIEW", "APPROVED",
    "SCHEDULED", "PUBLISHED", "ARCHIVED",
    "REJECTED", "REVISION_REQUIRED",
)
# 어디서 어디로 갈 수 있는가. 이 표에 없는 전이는 거부한다 —
# 그래야 DRAFT 가 리뷰를 건너뛰고 PUBLISHED 가 되는 일이 코드로 막힌다.
STATUS_TRANSITIONS = {
    "DRAFT": ("FACT_CHECK", "REJECTED"),
    "FACT_CHECK": ("REVIEW", "REVISION_REQUIRED", "REJECTED"),
    "REVIEW": ("APPROVED", "REVISION_REQUIRED", "REJECTED"),
    "APPROVED": ("SCHEDULED", "PUBLISHED", "REVISION_REQUIRED"),
    "SCHEDULED": ("PUBLISHED", "APPROVED", "REJECTED"),
    "PUBLISHED": ("ARCHIVED",),
    "ARCHIVED": (),
    "REJECTED": ("DRAFT",),
    "REVISION_REQUIRED": ("DRAFT",),
}

# ── §27 발행 안전등급 ────────────────────────────────────────────────────────
# LEVEL_3 은 자동 생성으로 통과시키지 않는다. 사람이 처음부터 끝까지 만든다.
SAFETY_LEVELS = ("LEVEL_1_AUTO", "LEVEL_2_REVIEW", "LEVEL_3_HUMAN_ONLY")

# ── §124 발행 자격 ───────────────────────────────────────────────────────────
ELIGIBILITY = ("ELIGIBLE", "REVIEW_REQUIRED", "BLOCKED", "INSUFFICIENT_DATA")

# ── §125 차단 사유 ───────────────────────────────────────────────────────────
BLOCK_REASONS = {
    "NO_SOURCE": "출처를 댈 수 없는 문장이 있다",
    "LOW_CONFIDENCE": "신뢰도가 낮다",
    "UNVERIFIED_EVENT": "기관이 확인하지 않은 사건이다",
    "SENSITIVE_EVENT": "인명 피해·정치적 민감성이 있다 — 사람이 직접 만든다",
    "MISSING_DATA": "필요한 자료가 없다",
    "VALIDATION_FAILED": "사실 검증에서 걸렸다",
    "PLATFORM_INVALID": "이 플랫폼 규격에 맞지 않는다",
    "MANUAL_BLOCK": "사람이 막았다",
}

# ── §15 플랫폼 ───────────────────────────────────────────────────────────────
# social-admin/index.ts 의 PROVIDERS 와 같은 어휘다. 여기서 늘리지 않는다.
PLATFORMS = ("instagram", "x", "facebook", "linkedin", "youtube", "threads", "tiktok")

# 글자 한도 — aws/social-draft/handler.py 의 LIMITS + studio-social.js 의 LIMITS.
# ⚠️ 두 곳이 facebook 에서 서로 달랐다(2000 vs 5000). 실제로 게시하는 쪽(studio-social.js)을 따른다.
PLATFORM_LIMITS = {
    "x": 280, "threads": 500, "instagram": 2200,
    "facebook": 5000, "tiktok": 2200, "linkedin": 3000, "youtube": 5000,
}

# ── §17 콘텐츠 형식 ──────────────────────────────────────────────────────────
CONTENT_FORMATS = ("SINGLE_IMAGE", "CAROUSEL", "SHORT_VIDEO", "TEXT", "THREAD", "LINK_POST")
# 플랫폼이 실제로 받는 형식. 없는 형식을 만들어 보내지 않는다.
PLATFORM_FORMATS = {
    "instagram": ("SINGLE_IMAGE", "CAROUSEL", "SHORT_VIDEO"),
    "x": ("TEXT", "SINGLE_IMAGE", "THREAD", "LINK_POST"),
    "facebook": ("TEXT", "SINGLE_IMAGE", "LINK_POST", "SHORT_VIDEO"),
    "linkedin": ("TEXT", "SINGLE_IMAGE", "LINK_POST"),
    "youtube": ("SHORT_VIDEO",),
    "threads": ("TEXT", "SINGLE_IMAGE"),
    "tiktok": ("SHORT_VIDEO",),
}

# ── §12 사실/분석/해석 3분법 ─────────────────────────────────────────────────
# 이것이 EARTHUS 의 v1=FACT / v2=INTERPRETATION 분리를 문장 단위로 내린 것이다.
CLAIM_TYPES = ("OBSERVED", "ANALYZED", "INTERPRETED")

LANGUAGES = ("ko", "en")


class ContentError(ValueError):
    """콘텐츠 계약을 어겼다."""


def _iso(v):
    return isinstance(v, str) and len(v) >= 10 and v[4] == "-" and v[7] == "-"


def make_claim(*, text, claim_type, source_refs=None, evidence_refs=None,
               fact_id=None, confidence=None, lang="ko"):
    """§75 — 문장 하나가 자기 출처를 들고 다닌다.

    이것이 '모든 문장이 추적된다'를 가능하게 하는 최소 단위다.
    출처 없는 OBSERVED 는 만들 수 없다 — 관측이라고 주장하려면 관측이 있어야 한다.
    """
    if claim_type not in CLAIM_TYPES:
        raise ContentError(f"알 수 없는 주장 종류: {claim_type}")
    if not text or not str(text).strip():
        raise ContentError("빈 문장은 주장이 될 수 없다")
    refs = list(source_refs or [])
    if claim_type == "OBSERVED" and not refs:
        raise ContentError("관측이라고 적으려면 출처가 있어야 한다")
    return {
        "claimId": None,           # 조립할 때 채운다
        "text": str(text).strip(),
        "type": claim_type,
        "lang": lang,
        "factId": fact_id,
        "sourceRefs": refs,
        "evidenceRefs": list(evidence_refs or []),
        "confidence": confidence,
        "validationStatus": "PENDING",
    }


def make_content(*, content_id, content_type, generated_at, generator_version,
                 data_snapshot_id, title, claims,
                 phenomenon_ids=None, event_ids=None, report_ids=None,
                 dataset_refs=None, observation_period=None, event_time=None,
                 location=None, geometry=None,
                 confidence="UNKNOWN", confidence_reason=None,
                 priority="P3", safety_level="LEVEL_2_REVIEW",
                 eligibility="REVIEW_REQUIRED", block_reasons=None,
                 visual_spec=None, hashtags=None, call_to_action=None,
                 language="ko", version=1, status="DRAFT",
                 summary=None, subtitle=None, source_status=None):
    """§7 · §14 — **마스터 콘텐츠**. 플랫폼 판은 이것에서 파생된다.

    플랫폼별로 따로 만들지 않는 이유: 같은 사건에 대해 인스타와 X 가 서로 다른
    숫자를 말하는 순간 어느 쪽이 맞는지 아무도 모른다. 숫자는 여기 한 번만 있다.

    고아를 허용하지 않는다(§2) — 현상·사건·리포트 중 최소 하나는 있어야 한다.
    """
    if content_type not in CONTENT_TYPES:
        raise ContentError(f"알 수 없는 콘텐츠 유형: {content_type}")
    if confidence not in CONFIDENCE:
        raise ContentError(f"알 수 없는 신뢰도: {confidence}")
    if priority not in PRIORITIES:
        raise ContentError(f"알 수 없는 우선순위: {priority}")
    if safety_level not in SAFETY_LEVELS:
        raise ContentError(f"알 수 없는 안전등급: {safety_level}")
    if eligibility not in ELIGIBILITY:
        raise ContentError(f"알 수 없는 자격: {eligibility}")
    if status not in CONTENT_STATUS:
        raise ContentError(f"알 수 없는 상태: {status}")
    if language not in LANGUAGES:
        raise ContentError(f"알 수 없는 언어: {language}")
    if not _iso(generated_at):
        raise ContentError("generated_at 은 ISO 시각이어야 한다")
    if not data_snapshot_id:
        # §65 — 무엇을 보고 만들었는지 없으면 재현할 수 없다.
        raise ContentError("data_snapshot_id 가 없으면 콘텐츠를 재현할 수 없다")
    phen = list(phenomenon_ids or [])
    ev = list(event_ids or [])
    rep = list(report_ids or [])
    if not (phen or ev or rep):
        raise ContentError("현상·사건·리포트 중 하나도 가리키지 않는 콘텐츠는 고아다")
    if not claims:
        raise ContentError("문장이 하나도 없는 콘텐츠는 만들지 않는다")

    bad = [r for r in (block_reasons or []) if r not in BLOCK_REASONS]
    if bad:
        raise ContentError(f"알 수 없는 차단 사유: {bad}")

    numbered = []
    for i, c in enumerate(claims, 1):
        c = dict(c)
        c["claimId"] = c.get("claimId") or f"{content_id}#c{i}"
        numbered.append(c)

    return {
        "schemaVersion": CONTENT_SCHEMA,
        "contentId": content_id,
        "type": content_type,
        "version": version,
        "status": status,
        "language": language,

        # ── 출처 사슬 (§2) — 콘텐츠에서 자료까지 한 번에 내려간다
        "phenomenonIds": phen,
        "eventIds": ev,
        "reportIds": rep,
        "datasetRefs": list(dataset_refs or []),
        "dataSnapshotId": data_snapshot_id,

        # ── 사람이 읽는 부분. 숫자는 claims 안에만 있다
        "title": title,
        "subtitle": subtitle,
        "summary": summary,
        "claims": numbered,

        # ── 시각·장소
        "eventTime": event_time,                  # 사건이 일어난 때
        "observationPeriod": observation_period,  # 관측 기간 {from, to}
        "location": location,
        "geometry": geometry,

        # ── 판정
        "confidence": confidence,
        "confidenceReason": list(confidence_reason or []),
        "priority": priority,
        "safetyLevel": safety_level,
        "eligibility": eligibility,
        "blockReasons": list(block_reasons or []),
        "sourceStatus": source_status,            # §123 ACTIVE·DEGRADED·STALE·UNAVAILABLE

        # ── 표현
        "visualSpec": visual_spec,
        "visualAssetIds": [],
        "hashtags": list(hashtags or []),
        "callToAction": call_to_action,
        "platformVersions": {},                   # §14 파생판. adapters 가 채운다

        # ── 생성 메타 (§21 · §76 · §101)
        "generatedAt": generated_at,
        "approvedAt": None,
        "scheduledAt": None,
        "publishedAt": None,
        "generatorVersion": generator_version,
        "validation": {"status": "PENDING", "problems": [], "warnings": []},
        "stale": False,
        "staleReason": None,
        "history": [],                            # §90 이전 판 요약
    }


def transition(content, to_status, *, actor, at, note=None):
    """§26 · §88 — 상태를 바꾸고 **누가 언제 왜** 를 남긴다.

    표에 없는 전이는 거부한다. 조용히 허용하면 리뷰가 장식이 된다.
    """
    cur = content.get("status")
    allowed = STATUS_TRANSITIONS.get(cur, ())
    if to_status not in allowed:
        raise ContentError(f"{cur} → {to_status} 는 허용된 전이가 아니다 (가능: {allowed or '없음'})")
    if to_status == "PUBLISHED" and content.get("safetyLevel") == "LEVEL_3_HUMAN_ONLY" \
            and not (note or "").strip():
        # §27 — LEVEL_3 은 사람이 이유를 적어야 넘어간다.
        raise ContentError("LEVEL_3 콘텐츠는 발행 사유를 적어야 한다")
    out = dict(content)
    out["status"] = to_status
    if to_status == "APPROVED":
        out["approvedAt"] = at
    if to_status == "PUBLISHED":
        out["publishedAt"] = at
    out["audit"] = list(content.get("audit") or []) + [{
        "from": cur, "to": to_status, "actor": actor, "at": at, "note": note,
    }]
    return out


def derive_platform_version(content, platform, *, text, content_format,
                            hashtags=None, media_required=False):
    """§14 — 마스터에서 플랫폼 판을 만든다. **같은 masterId 를 유지한다.**

    여기서 숫자를 다시 만들지 않는다. 문구만 플랫폼 규격에 맞춘다.
    """
    if platform not in PLATFORMS:
        raise ContentError(f"알 수 없는 플랫폼: {platform}")
    if content_format not in PLATFORM_FORMATS.get(platform, ()):
        raise ContentError(f"{platform} 는 {content_format} 를 받지 않는다")
    limit = PLATFORM_LIMITS[platform]
    if len(text) > limit:
        raise ContentError(f"{platform} 한도 {limit}자를 넘었다 ({len(text)}자)")
    return {
        "masterContentId": content["contentId"],
        "platform": platform,
        "format": content_format,
        "text": text,
        "textLength": len(text),
        "limit": limit,
        "hashtags": list(hashtags if hashtags is not None else content.get("hashtags") or []),
        "mediaRequired": media_required,
        "mediaAssetId": None,
        "status": "DRAFT",
        "publishResult": None,
    }


def numbers_in(text):
    """문장에서 숫자를 뽑는다. §74 무환각 검사가 이걸 쓴다.

    쉼표 구분(1,284)과 소수점·부호를 모두 잡는다. 날짜 안의 숫자도 잡히지만
    검사기가 날짜를 따로 다루므로 여기서 걸러내지 않는다 — 놓치는 것보다 낫다.
    """
    import re
    out = []
    for m in re.finditer(r"-?\d[\d,]*(?:\.\d+)?", str(text)):
        try:
            out.append(float(m.group(0).replace(",", "")))
        except ValueError:
            continue
    return out


def dates_in(text):
    """문장에서 ISO 날짜(YYYY-MM-DD)와 연-월(YYYY-MM)을 뽑는다."""
    import re
    return re.findall(r"\d{4}-\d{2}(?:-\d{2})?", str(text))


# §23 — 근거 없이 쓰면 안 되는 말. 검증기가 이 목록으로 막는다.
# 재난 보도에서 실제로 문제가 되는 것만 넣는다. 일반적인 형용사를 다 막으면 아무 문장도 못 쓴다.
SENSATIONAL_KO = ("사상 최악", "역대 최악", "대참사", "초비상", "공포", "충격", "경악", "괴물")
SENSATIONAL_EN = ("catastrophic", "apocalyptic", "monster storm", "unprecedented disaster")

# §23 · §74 — 인과를 주장하는 말. 승인된 분석 메타데이터 없이는 못 쓴다.
CAUSAL_KO = ("때문에", "탓에", "원인은", "때문이다", "야기했", "초래했")
CAUSAL_EN = (" because of ", " caused by ", " due to ", " led to ", " resulted in ")

# §23 — 예측을 주장하는 말. 우리가 예보를 생산하지 않는 영역에서는 못 쓴다.
PREDICTIVE_KO = ("예상됩니다", "전망입니다", "예상된다", "전망이다", "가능성이 높")
PREDICTIVE_EN = (" will be ", " is expected to ", " is forecast to ", " is projected to ")

# ⚠️ 한국어 미래·추측은 목록으로 못 잡는다. 어간마다 달라지기 때문이다 —
#    "할 것이다"만 넣었더니 "커질 것이다"가 그대로 통과했다(시험이 잡았다).
#    실제 문법은 '관형사형 -ㄹ + 것' 하나다. 앞 음절의 받침이 ㄹ 인지를 본다.
_HANGUL_BASE = 0xAC00
_JONG_RIEUL = 8       # 받침 ㄹ 의 종성 인덱스
_JONG_COUNT = 28


def _is_rieul_final(ch):
    code = ord(ch) - _HANGUL_BASE
    if not 0 <= code < 11172:
        return False
    return code % _JONG_COUNT == _JONG_RIEUL


def predictive_ko(text):
    """'-ㄹ 것' 구성을 찾는다. 찾으면 그 조각을 돌려준다(없으면 None).

    '이것이다'처럼 앞 음절 받침이 ㄹ 이 아닌 경우는 잡지 않는다.
    """
    s = str(text)
    for i, ch in enumerate(s):
        if ch != "것":
            continue
        j = i - 1
        if j >= 0 and s[j] == " ":
            j -= 1
        if j >= 0 and _is_rieul_final(s[j]):
            return s[max(0, j - 3):i + 3]
    return None
