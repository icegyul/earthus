# -*- coding: utf-8 -*-
"""배포 콘텐츠 생성기 — 지시서 §1 · §14 · §80 · §133 · §134 · §142 · §166.

후보(sources/*)를 받아 **마스터 콘텐츠 하나**를 만들고, 거기서 플랫폼 판을 파생한다.

여기서 사실을 만들지 않는다(§1). 후보가 이미 실제 자료에서 옮겨 온 팩트와
문장을 들고 온다. 이 파일이 하는 일은 판정·조립·검증뿐이다.

흐름
  후보 → 자격 판정 → 마스터 콘텐츠 → 캡션·해시태그·비주얼 → 플랫폼 판 → 검증
  검증에 걸리면 DRAFT 에 머문다. 조용히 통과시키지 않는다.
"""
import hashlib
import os
import sys

_HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, _HERE)
sys.path.insert(0, os.path.join(os.path.dirname(_HERE), "_shared"))

import content_contract as cc      # noqa: E402
import report_contract as rc       # noqa: E402
import provenance as prov          # noqa: E402
import eligibility as el           # noqa: E402
import caption as cap              # noqa: E402
import hashtags as tags            # noqa: E402
import visual as vis               # noqa: E402
import validation as val           # noqa: E402
import sns_adapters as adapters    # noqa: E402

GENERATOR_VERSION = "earthus.distribution-generator/1.0.0"

# §105 — CTA 가 가리키는 곳. 마케팅 문구가 아니라 주소다.
APP_BASE = os.environ.get("EARTHUS_APP_BASE", "https://earthus.net")


class GeneratorError(RuntimeError):
    pass


def next_content_id(year, seq):
    """§91 — CNT-2026-000123. 순번은 호출자가 관리한다(파일 목록이 정본).

    ⚠️ **S3 에 쓰는 경로에서는 이것을 쓰지 않는다.** `content_id_for` 를 쓴다.
       호출자가 순번을 관리해야 하는데 람다는 관리할 곳이 없었다 — 매 호출 1 부터
       다시 시작해 같은 키에 다른 사건을 덮어썼다(2026-09-13 실측: CNT-2026-000001 이
       9/13 에는 구마모토 지진, 10/1 에는 예보 성적표였다).
       순번을 넘겨 주는 곳은 `cli.py --seq` 뿐이고, 로컬 출력이라 충돌이 드러나지 않는다.
       여기 그대로 남겨 두는 것은 그 CLI 경로의 계약이기 때문이다.
    """
    return f"CNT-{year}-{seq:06d}"


def candidate_identity(cand):
    """이 후보가 **무엇에 대한 것인지**. 같은 대상이면 언제 돌려도 같은 문자열이다.

    돌려주는 것: 사람이 읽을 수 있는 식별 문자열. 정할 수 없으면 GeneratorError.

    ⚠️ 시각을 넣지 않는다. 넣으면 같은 대상이 날마다 새 id 를 받아 중복이 쌓인다 —
       지난달 성적표는 1~3일에 세 번 만들어지므로 하루만 섞여도 셋으로 늘어난다.
    ⚠️ lab-report 의 observationPeriod 는 **날마다 움직이는 창**이므로 식별에 쓰지 않는다.
       eventId 가 먼저 잡히기 때문에 실제로 쓰이지도 않지만, 순서를 바꾸면 안 되는 이유다.
    """
    if not isinstance(cand, dict):
        raise GeneratorError("후보가 아니다")
    ev = cand.get("eventId")
    if ev:
        return "event=%s" % ev
    reports = cand.get("reportIds") or ([cand["reportId"]] if cand.get("reportId") else [])
    if reports:
        return "report=%s" % ",".join(sorted(str(r) for r in reports))
    kind = cand.get("sourceKind") or cand.get("reportKind")
    period = cand.get("observationPeriod") or {}
    if kind and period.get("from") and period.get("to"):
        return "kind=%s|period=%s..%s" % (kind, period["from"], period["to"])
    if kind and cand.get("title"):
        return "kind=%s|title=%s" % (kind, cand["title"])
    raise GeneratorError(
        "후보를 식별할 수 없다 — eventId·reportIds·(sourceKind+기간)·(sourceKind+제목) "
        "중 하나가 있어야 한다. 식별할 수 없는 것에 id 를 지어 주면 다음 실행이 덮어쓴다.")


def content_id_for(cand):
    """§91 — 후보의 정체에서 바로 나오는 콘텐츠 id. `CNT-<지문 12자>`.

    순번을 없앤 이유는 `next_content_id` 주석에 있다. 지문은 정체의 sha256 앞 12자다 —
    같은 대상이면 같은 id(멱등), 다른 대상이면 다른 id(충돌 없음).
    """
    ident = candidate_identity(cand)
    return "CNT-%s" % hashlib.sha256(ident.encode("utf-8")).hexdigest()[:12]


def snapshot_for(candidate, *, snapshot_id, created_at):
    """§65 — 이 콘텐츠가 무엇을 보고 만들어졌는지."""
    refs = candidate.get("datasetRefs") or []
    if not refs:
        raise GeneratorError("자료 참조가 없는 후보로는 스냅샷을 만들 수 없다")
    return rc.make_data_snapshot(
        snapshot_id=snapshot_id,
        created_at=created_at,
        datasets=[{
            "ref": r,
            "observedAt": candidate.get("eventTime"),
            "retrievedAt": created_at,
            "state": "AVAILABLE",
        } for r in refs],
    )


def build(candidate, *, content_id, generated_at, snapshot_id,
          language="ko", link=None, manual_block=False):
    """§14 — 마스터 콘텐츠 하나. 플랫폼 판은 아직 없다.

    자격 판정을 여기서 한 번만 한다. 플랫폼마다 다시 판정하면 인스타는 되고
    X 는 안 되는 이유가 문구 길이인지 자료 부족인지 알 수 없게 된다.
    """
    ctype = candidate.get("contentType")
    if ctype not in cc.CONTENT_TYPES:
        raise GeneratorError(f"알 수 없는 콘텐츠 유형: {ctype}")

    facts = candidate.get("facts") or []
    claims = candidate.get("claims") or []
    if not claims:
        raise GeneratorError("문장이 없는 후보로는 콘텐츠를 만들지 않는다")

    phen_ids = candidate.get("phenomenonIds")
    if phen_ids is None:
        phen_ids = [candidate["phenomenonId"]] if candidate.get("phenomenonId") else []
    event_ids = [candidate["eventId"]] if candidate.get("eventId") else []
    report_ids = [candidate["reportId"]] if candidate.get("reportId") else []

    # §11 신뢰도 — 이유와 함께.
    confidence, reasons = el.confidence_for(
        source_count=candidate.get("sourceCount"),
        truth_type=candidate.get("truthType"),
        sample_count=candidate.get("sampleCount"),
        temporal_consistent=bool(candidate.get("observationPeriod")),
        spatial_consistent=bool(candidate.get("geometry")),
    )

    # §9 우선순위
    signals = candidate.get("signals") or {}
    s, _used, _unknown = el.score(signals)
    breaking = ctype == "BREAKING"
    priority = el.priority_for(s, breaking=breaking)

    # §27 안전등급 — 문장 전체를 보고 판단한다. 제목만 보면 본문의 인명 표현을 놓친다.
    blob = " ".join([str(candidate.get("title") or ""), str(candidate.get("headline") or ""),
                     str(candidate.get("summary") or "")]
                    + [c.get("text", "") for c in claims])
    safety, safety_reason = el.safety_level_for(
        content_type=ctype, priority=priority, text_blob=blob,
        official=candidate.get("truthType") in (
            "OFFICIAL_OBSERVATION", "OFFICIAL_FORECAST", "OFFICIAL_WARNING", "EARTHUS_ANALYSIS", "HISTORY"),
        verified=bool(candidate.get("verified", True)))

    # §124 자격
    verdict = el.decide(
        signals=signals, confidence=confidence, safety_level=safety,
        has_source=bool(candidate.get("datasetRefs")),
        has_numbers_backed=True,     # 아래 검증이 실제로 확인한다. 여기서는 낙관하지 않고 뒤에서 뒤집는다
        data_complete=(signals.get("data_completeness") not in (None, el.UNKNOWN)),
        manual_block=manual_block,
        sensitive=(safety == "LEVEL_3_HUMAN_ONLY" and "인명" in safety_reason),
    )

    content = cc.make_content(
        content_id=content_id,
        content_type=ctype,
        generated_at=generated_at,
        generator_version=GENERATOR_VERSION,
        data_snapshot_id=snapshot_id,
        title=candidate.get("title"),
        subtitle=candidate.get("headline"),
        summary=candidate.get("summary"),
        claims=claims,
        phenomenon_ids=phen_ids,
        event_ids=event_ids,
        report_ids=report_ids,
        dataset_refs=candidate.get("datasetRefs"),
        observation_period=candidate.get("observationPeriod"),
        event_time=candidate.get("eventTime"),
        location=candidate.get("location"),
        geometry=candidate.get("geometry"),
        confidence=confidence,
        confidence_reason=reasons,
        priority=priority,
        safety_level=safety,
        eligibility=verdict["eligibility"],
        block_reasons=verdict["blockReasons"],
        language=language,
        call_to_action=None,
        source_status=candidate.get("sourceStatus") or "ACTIVE",
    )
    content["eligibilityDetail"] = verdict
    content["safetyReason"] = safety_reason
    # §101 — 관측 기간이 '우리가 지켜본 기간'인지 '사건이 지속된 기간'인지.
    # 캡션이 이 값으로 라벨을 고른다. 없으면 그냥 '관측'이다.
    content["observationPeriodKind"] = candidate.get("observationPeriodKind")
    content["sourceFacts"] = facts        # 검증이 숫자 풀을 만들 때 쓴다
    # 원자료 문서에서 글자 그대로 옮겨 온 문자열. 제목·헤드라인이 여기 들어간다.
    content["sourceTexts"] = list(candidate.get("sourceTexts") or [])
    content["numericPool"] = sorted(val.numeric_pool(
        facts, period=candidate.get("observationPeriod"),
        source_texts=content["sourceTexts"]))
    content["datePool"] = sorted(val.date_pool(
        facts, period=candidate.get("observationPeriod"),
        source_texts=content["sourceTexts"]))
    content["link"] = link or _link_for(candidate)
    content["callToAction"] = content["link"]
    return content


def _link_for(candidate):
    """§62 · §105 — 어디로 보낼 것인가. 없는 주소를 만들지 않는다."""
    if candidate.get("reportId"):
        return f"{APP_BASE}/earth-report.html?id={candidate['reportId']}"
    kind = candidate.get("reportKind")
    if candidate.get("eventId") and kind in (
            "cyclone", "earthquake", "smoke-ash", "air-pollution", "ocean-drift",
            "bird-migration", "marine-bloom", "aurora", "space-reentry"):
        return f"{APP_BASE}/lab-reports.html?kind={kind}"
    return APP_BASE


def with_platforms(content, platforms, *, formats=None, options=None):
    """§14 — 마스터에서 플랫폼 판을 파생한다. 숫자를 다시 만들지 않는다.

    만들 수 없는 판은 **오류를 담아 남긴다.** 조용히 빠뜨리면 관리 화면에서
    "왜 X 판이 없지"에 답할 수 없다.
    """
    out = dict(content)
    versions = dict(content.get("platformVersions") or {})
    problems = {}
    for p in platforms:
        fmt = (formats or {}).get(p) or _default_format(p)
        try:
            tag_list = tags.build(phenomenon_ids=content.get("phenomenonIds"),
                                  content_type=content.get("type"),
                                  platform=p, lang=content.get("language", "ko"))
            text = cap.caption_for(content, platform=p,
                                   lang=content.get("language", "ko"),
                                   link=content.get("link"), hashtags=tag_list)
            pv = cc.derive_platform_version(
                content, p, text=text, content_format=fmt, hashtags=tag_list,
                media_required=adapters.ADAPTERS[p].media_required)
            spec = vis.make_spec(content, platform=p, content_format=fmt)
            ok, vproblems = vis.validate_spec(spec)
            pv["visualSpec"] = spec
            pv["visualProblems"] = vproblems
            if not ok:
                pv["status"] = "NEEDS_VISUAL"
            versions[p] = pv
        except Exception as e:                    # noqa: BLE001
            problems[p] = str(e)
    out["platformVersions"] = versions
    if problems:
        out["platformProblems"] = problems
    return out


def _default_format(platform):
    """플랫폼이 받는 첫 형식. 사진이 필수인 곳은 사진, 아니면 글."""
    fmts = cc.PLATFORM_FORMATS.get(platform, ())
    if adapters.ADAPTERS[platform].media_required:
        return fmts[0]
    return "TEXT" if "TEXT" in fmts else fmts[0]


def validate(content):
    """§73 — 검증하고 결과를 콘텐츠에 박아 넣는다.

    검증 실패는 자격을 **BLOCKED 로 되돌린다.** build() 에서 낙관적으로 준
    has_numbers_backed=True 를 여기서 실제로 확인해 뒤집는 자리다.
    """
    result = val.validate_content(content, facts=content.get("sourceFacts"))
    out = dict(content)
    out["validation"] = {
        "status": result["status"],
        "problems": result["problems"],
        "warnings": result["warnings"],
        "validator": result["validator"],
        "numericPoolSize": result["numericPoolSize"],
    }
    out["provenanceChain"] = result["provenance"]
    if result["status"] == "FAILED":
        out["eligibility"] = "BLOCKED"
        reasons = list(out.get("blockReasons") or [])
        if "VALIDATION_FAILED" not in reasons:
            reasons.append("VALIDATION_FAILED")
        out["blockReasons"] = reasons
    return out


def generate(candidate, *, content_id, generated_at, snapshot_id, platforms=None,
             language="ko", link=None):
    """§133 · §134 — 후보 하나를 끝까지 만든다. 실패해도 무엇이 막았는지 남는다."""
    content = build(candidate, content_id=content_id, generated_at=generated_at,
                    snapshot_id=snapshot_id, language=language, link=link)
    content = with_platforms(content, platforms or list(adapters.PRIMARY))
    return validate(content)


def summarize(contents):
    """§30 · §154 — 관리 화면 첫 줄. 상태별 개수와 막힌 이유."""
    by_status, by_eligibility, blocked = {}, {}, {}
    for c in contents:
        by_status[c.get("status")] = by_status.get(c.get("status"), 0) + 1
        by_eligibility[c.get("eligibility")] = by_eligibility.get(c.get("eligibility"), 0) + 1
        for r in c.get("blockReasons") or []:
            blocked[r] = blocked.get(r, 0) + 1
    return {
        "total": len(contents),
        "byStatus": by_status,
        "byEligibility": by_eligibility,
        "blockReasons": {k: {"count": v, "text": cc.BLOCK_REASONS.get(k, k)}
                         for k, v in sorted(blocked.items(), key=lambda kv: -kv[1])},
    }


def provenance_of(content):
    """§32 — 출처 패널 하나."""
    return prov.resolve_content(content)
