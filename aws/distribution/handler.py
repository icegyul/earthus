# -*- coding: utf-8 -*-
"""배포 후보 생성 Lambda — 지시서 §79 · §80 · §133.

**자동으로 올리지 않는다. 후보까지만 만든다.**

기존 aws/social-draft/handler.py 가 태풍 하나에 대해 내린 결정을 그대로 넓힌 것이다:
  "공개 게시는 되돌릴 수 없다. 사람이 한 번 보고 눌러야 한다."
  하루 만에 NHC 경도 부호 오류와 파고 축소 오류를 찾았던 그 판단을 유지한다.

이 함수가 하는 일
  1. 실제로 도는 자료를 받는다 (ocean/lab-reports.json · wind/series/verify-daily.json)
  2. 후보를 만들고 자격을 판정하고 **검증한다**
  3. archive/distribution-content.json 에 색인, archive/distribution-content/<id>.json 에 본문
  4. 끝. 어디에도 게시하지 않는다.

⚠️ 출력은 **비공개 접두사** archive/ 다. 예전에는 events/ 였다 — 브라우저가 직접 읽는
   기존 공개 경로라서 골랐는데, 그 접두사는 버킷 정책이 익명 s3:GetObject 를 허용한다
   (2026-09-13 실측: events/*.json 200, archive/* 403). 이 함수가 만드는 것은 전부
   status=DRAFT 이고, publication_privacy 의 계약은 DRAFT 를 **사람 승인 전 = 비공개**로
   규정한다. 그래서 승인 전 초안이 익명으로 읽히고 있었다.
   social-draft 가 events/social-drafts.json → archive/social-drafts.json 으로 옮긴 것과
   같은 해결이다(INTEGRATION-4 §0). 여기서 새 계보를 만드는 것이 아니라 그 선례를 따른다.
"""
import json
import os
import re
import sys
from datetime import datetime, timedelta, timezone

_HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, _HERE)
sys.path.insert(0, os.path.join(os.path.dirname(_HERE), "_shared"))

import generator as gen                       # noqa: E402
import publication_privacy as priv            # noqa: E402
import publish_queue as pq                    # noqa: E402
import sns_adapters as adapters               # noqa: E402
from sources import lab_report                # noqa: E402
from sources import verify_scorecard          # noqa: E402

BUCKET = os.environ.get("CACHE_BUCKET", "earthus-cache-kr")
REGION = os.environ.get("CACHE_REGION") or os.environ.get("AWS_REGION") or "us-east-2"
S3_PUBLIC = f"https://{BUCKET}.s3.{REGION}.amazonaws.com"

INDEX_KEY = "archive/distribution-content.json"
BODY_PREFIX = "archive/distribution-content/"

# ⚠️ 로컬 미리보기는 **옛 상대경로를 그대로 쓴다.** 운영 키를 따라 archive/ 로 옮기면
#    `cli.py --out prototype/` 산출물이 prototype/archive/... 에 떨어지고,
#    public_build 의 DENY_RULES 에는 그 경로 규칙이 없어(실측: denial_for 가 None)
#    다음 deploy-app.sh 가 공개 app/ 접두사로 실어 올린다 — 더 나쁜 유출이 된다.
#    events/ 쪽은 이미 DENY_RULES 에 등재돼 있다(public_build.py §"승인되지 않은 산출물").
LOCAL_INDEX_KEY = "events/distribution-content.json"
LOCAL_BODY_PREFIX = "events/distribution-content/"

LAB_REPORTS = f"{S3_PUBLIC}/ocean/lab-reports.json"
VERIFY_DAILY = f"{S3_PUBLIC}/wind/series/verify-daily.json"

# 한 번에 만들 후보 수. 많이 만들어도 사람이 다 못 본다.
MAX_DAILY = int(os.environ.get("DIST_MAX_DAILY", "8"))
PLATFORMS = list(adapters.PRIMARY)


def _now():
    return datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")


_DATE_SHAPE = re.compile(r"^\d{4}-\d{2}-\d{2}$")


def canonical_date(value):
    """`YYYY-MM-DD` **그 모양만** 받는다. 아니면 던진다.

    ⚠️ 왜 strptime 만으로는 안 되는가 — `datetime.strptime("2026-10-1", "%Y-%m-%d")` 는
       **통과한다**(2026-10-01, day=1). 그러면 두 곳이 조용히 어긋난다:
         · 게이트  `d.day <= 3` → 열린다 (10월 1일로 읽혔다)
         · 신선도  `(lastSeen)[:10] >= today` → 문자열 비교라
                   `"2026-09-13" >= "2026-10-1"` 은 **False** 다
       즉 날짜 하나를 0 없이 적으면 게이트는 열리는데 후보는 사라진다. 둘 다 조용하다.
       그래서 모양을 먼저 본다 — 고쳐 주지 않고 거부한다.
    """
    if not isinstance(value, str) or not _DATE_SHAPE.match(value.strip()):
        raise ValueError(
            "날짜는 YYYY-MM-DD 여야 한다 (0 을 채운다): %r — "
            "'2026-10-1' 처럼 적으면 게이트와 신선도 비교가 서로 다르게 읽는다" % (value,))
    text = value.strip()
    datetime.strptime(text, "%Y-%m-%d")          # 2026-02-30 같은 값을 여기서 거른다
    return text


def event_flag(event, name):
    """이벤트의 참/거짓 깃발. **키 이름의 대소문자를 가리지 않는다.**

    ⚠️ 예전에는 `(event or {}).get("dryRun")` 이었다 — `{"dryrun": True}` 로 부르면
       가드를 그냥 지나쳐 **실제 S3 쓰기가 일어났다.** 오타 하나가 시험을 배포로 만든다.
    """
    want = name.lower()
    for key, value in (event or {}).items():
        if isinstance(key, str) and key.lower() == want:
            return bool(value)
    return False


def _require_shape(doc, label, key, kind):
    """상류 문서가 기대한 모양인지. 아니면 UpstreamError.

    파싱은 됐는데 내용이 딴 것일 수 있다(상류가 오류 JSON 을 200 으로 주는 경우).
    그것을 "자료 없음"으로 읽으면 다시 빈 산출물이 만들어진다.
    """
    if not isinstance(doc, dict):
        raise UpstreamError("%s 가 객체가 아니다: %s" % (label, type(doc).__name__))
    if key not in doc:
        raise UpstreamError("%s 에 '%s' 가 없다 (받은 키: %s)"
                            % (label, key, sorted(doc)[:8]))
    if not isinstance(doc[key], kind):
        raise UpstreamError("%s 의 '%s' 가 %s 가 아니다: %s"
                            % (label, key, kind.__name__, type(doc[key]).__name__))
    # ⚠️ 자료형만 보면 부족하다. `{"reports": ["문자열", …]}` 은 list 검사를 통과하고
    #    lab_report.candidates 안쪽에서 AttributeError 로 죽는다 — 쓰기 전에 죽으므로
    #    오염은 없지만, "상류 모양이 틀렸다"가 아니라 내부 버그처럼 보인다.
    #    2026-09-13 — 내 회귀 시험이 이 갈래를 짚어냈다. 원소도 본다.
    items = doc[key] if isinstance(doc[key], list) else list(doc[key].values())
    for i, element in enumerate(items[:20]):
        if not isinstance(element, dict):
            raise UpstreamError("%s 의 '%s'[%d] 가 객체가 아니다: %s"
                                % (label, key, i, type(element).__name__))
    return doc


def _fetch_required(url, label, key, kind):
    """상류 하나를 받는다. 실패·파싱오류·모양오류를 **전부** UpstreamError 로."""
    try:
        doc = _get(url)
    except UpstreamError:
        raise
    except Exception as e:                            # noqa: BLE001
        raise UpstreamError("%s 를 받지 못했다: %s: %s"
                            % (label, type(e).__name__, str(e)[:160])) from e
    return _require_shape(doc, label, key, kind)


def _get(url):
    from urllib.request import urlopen, Request
    req = Request(url, headers={"User-Agent": "earthus-distribution/1.0 (dalur@kakao.com)"})
    with urlopen(req, timeout=60) as r:
        return json.loads(r.read().decode("utf-8"))


def _s3():
    import boto3
    return boto3.client("s3", region_name=REGION)


class UpstreamError(RuntimeError):
    """상류 자료를 못 받았거나 모양이 아니다. **빈 결과와 구별한다.**

    왜 예외인가 — `aws/gfs-cloud-forecast/handler.py:35` 의 정직 규칙과 같다:
    "받지 못한 스텝은 매니페스트에 넣지 않는다. 빈 프레임을 만들지 않는다."
    예전에는 두 `_get()` 실패를 `problems` 목록에 담고 **그대로 진행**해서
    후보 0건짜리 색인을 써 버렸다. 상류가 죽은 날에 "오늘은 사건이 없다"는
    산출물이 만들어지고, 그것이 이미 올라가 있던 색인을 덮어썼다.

    ⚠️ 반환값(ok:False)이 아니라 **예외**로 올린다. 그래야 Lambda 가 그 호출을
       오류로 기록해 사람이 알아챈다. ok:False 로 돌려주면 CloudWatch 에는
       Success 로 남아 상류 장애가 조용히 지나간다.
    """


# ── 공개 자격 — **허용 목록**이다 ──────────────────────────────────────────────
# ⚠️ 예전에는 차단 목록이었다: WITHHELD_ELIGIBILITY = ("BLOCKED",) 하나뿐이어서
#    REVIEW_REQUIRED(사람 검토 필요)도, 자격 판정이 아예 없는 후보도 공개로 나갔다.
#    2026-09-13 실측 — 9/13 후보 8건 중 7건이 익명 공개 대상이었다.
#    목록을 뒤집는다: **통과가 적혀 있어야 통과다.** 모르면 비공개다.
PUBLIC_ELIGIBILITY = ("ELIGIBLE",)
WITHHELD_SAFETY = ("LEVEL_3_HUMAN_ONLY",)


def public_eligibility(content):
    """이 후보를 공개 응답에 넣어도 되는가. 돌려주는 것: (bool, 사유|None).

    경계의 정본은 aws/_shared/publication_privacy.py 다 — 여기서 다시 정의하지 않는다.
    이 함수가 그 위에 더하는 것은 **허용 목록**뿐이다.

    ⚠️ 지금 이 함수는 사실상 항상 False 다. 이 엔진이 만드는 것은 전부 status=DRAFT 이고
       publication_privacy 의 계약이 DRAFT 를 "사람 승인 전 = 비공개"로 규정하기 때문이다.
       그게 맞다. 승인 절차가 생겨 status 가 올라가면 그때 이 함수가 통과시킨다.
       빈 목록이 나오는 것은 고장이 아니다 — 승인된 것이 없다는 뜻이다.
    """
    if not isinstance(content, dict):
        return False, "콘텐츠가 아니다"
    el = content.get("eligibility")
    if el not in PUBLIC_ELIGIBILITY:
        return False, "자격 판정이 %s — 허용 목록에 없다" % (el or "없음")
    if content.get("safetyLevel") in WITHHELD_SAFETY:
        return False, "안전등급이 사람 전용"
    if content.get("blockReasons"):
        return False, "차단 사유가 있다: %s" % ", ".join(content["blockReasons"][:3])
    vis, why = priv.content_visibility(content)
    if vis != "PUBLIC":
        return False, why or ("공개 가시성이 아니다: %s" % vis)
    return True, None


def _assert_write_allowed(key, content):
    """비공개 산출물이 공개 접두사로 가는 것을 **막는다.** 이 결함의 재발 방지 장치다.

    표에 없는 접두사도 거부된다 — publication_privacy 가 UNKNOWN 을 거부하기 때문이다.
    새 접두사를 만드는 순간 경계가 조용히 열리는 것을 막는다.
    """
    verdict = priv.check_public_write(key, content)
    if not verdict["allowed"]:
        raise RuntimeError("공개 경계 위반 — 쓰지 않는다: %s" % verdict["reason"])
    return verdict


def build_candidates(lab_doc, verify_doc, *, today, limit=MAX_DAILY):
    """오늘 갱신된 사건 + 지난달 성적표. 없으면 빈 목록이다 — 억지로 채우지 않는다."""
    cands = []
    fresh = [c for c in lab_report.candidates(lab_doc)
             if (c["raw"].get("lastSeen") or c["raw"].get("detectedAt") or "")[:10] >= today]

    def rel(c):
        v = (c.get("signals") or {}).get("public_relevance")
        return v if isinstance(v, (int, float)) else 0.0
    fresh.sort(key=rel, reverse=True)
    cands.extend(fresh[:limit])

    # 지난달 예보 성적표는 달이 바뀐 직후에만 만든다. 매일 만들면 같은 글이 반복된다.
    d = datetime.strptime(today, "%Y-%m-%d")
    if d.day <= 3 and verify_doc:
        prev = (d.replace(day=1) - timedelta(days=1)).strftime("%Y-%m")
        card = verify_scorecard.candidate(verify_doc, prev)
        if card:
            cands.append(card)
    return cands


def generate_all(cands, *, at):
    """후보마다 콘텐츠 하나. id 는 후보의 **정체**에서 나온다 — 순번이 아니다.

    ⚠️ 예전에는 `gen.next_content_id(year, seq_start + i)` 였고 `seq_start` 는 기본 0 이었다.
       핸들러가 그 값을 넘기지 않았으므로 id 가 매 실행 CNT-<year>-000001 부터 다시
       시작했다. 2026-09-13 실측 — CNT-2026-000001 이 9/13 에는 "M6.8 구마모토 지진",
       10/1 에는 "EARTHUS 예보 성적표 · 2026-09" 였다. 같은 S3 키다.
       `content_id_for` 는 정체의 지문을 쓰므로 회차·순서·시각에 좌우되지 않는다.
    """
    out = []
    for cand in cands:
        try:
            cid = gen.content_id_for(cand)
        except Exception as e:                        # noqa: BLE001
            # 식별할 수 없는 후보는 **id 를 지어 주지 않는다.** 흔적만 남긴다 —
            # 임의 id 를 주면 다음 실행이 그 자리를 덮어쓴다.
            print(f"[dist] 후보 식별 실패: {e}")
            out.append({"contentId": None, "failed": True, "error": str(e),
                        "title": cand.get("title") if isinstance(cand, dict) else None,
                        "generatedAt": at})
            continue
        try:
            snap = gen.snapshot_for(cand, snapshot_id=f"snapshot:{cid}", created_at=at)
            c = gen.generate(cand, content_id=cid, generated_at=at,
                             snapshot_id=snap["snapshotId"], platforms=PLATFORMS)
            c["snapshot"] = snap
        except Exception as e:                        # noqa: BLE001
            # §77 — 조용히 실패하지 않는다. 실패한 후보도 흔적을 남긴다.
            print(f"[dist] {cid} 생성 실패: {e}")
            out.append({"contentId": cid, "failed": True, "error": str(e),
                        "title": cand.get("title"), "generatedAt": at})
            continue
        out.append(c)
    return out


def read_index(s3):
    """지금 올라가 있는 색인. 없으면 빈 색인. **못 읽으면 모른다고 말한다.**

    `aws/report-engine/publisher.py:203-210` 의 `current_index()` 와 같은 규칙이다 —
    없는 것(NoSuchKey/404)과 못 읽는 것을 구별한다. 후자를 빈 색인으로 읽으면
    읽기 장애 한 번이 기존 목록을 전부 지운다.
    """
    try:
        body = s3.get_object(Bucket=BUCKET, Key=INDEX_KEY)["Body"].read()
    except Exception as e:                            # noqa: BLE001
        code = ""
        response = getattr(e, "response", None)
        if isinstance(response, dict):
            code = str((response.get("Error") or {}).get("Code") or "")
        text = str(e)
        if code in ("NoSuchKey", "404") or "NoSuchKey" in text:
            return None                               # 아직 없다 — 첫 실행이다
        if code in ("AccessDenied", "403") or "AccessDenied" in text:
            # ⚠️⚠️ 이것을 "없다"로 읽으면 안 된다. s3:ListBucket 이 없으면 S3 는
            #    **없는 키에도 AccessDenied** 를 준다(2026-09-13 실측: 익명 요청에서
            #    events/ 의 없는 키가 404 가 아니라 403 이었다). 그래서 이 한 갈래로는
            #    "첫 실행"과 "권한 없음"을 구별할 수 없다 — 구별할 수 없으면 쓰지 않는다.
            #    실행 역할에 아래 둘이 필요하다(이번 작업 범위 밖 · 별도 승인):
            #      s3:GetObject  on  archive/distribution-content.json
            #      s3:ListBucket on  bucket, Condition s3:prefix archive/distribution-content*
            #    ListBucket 이 붙으면 없는 키가 NoSuchKey 로 와서 위 갈래가 잡는다.
            raise UpstreamError(
                "기존 색인을 읽을 권한이 없다(AccessDenied). 없는 것인지 막힌 것인지 "
                "구별할 수 없으므로 쓰지 않는다 — 실행 역할에 s3:GetObject 와 "
                "prefix 한정 s3:ListBucket 이 필요하다") from e
        raise UpstreamError("기존 색인을 읽지 못했다: %s: %s"
                            % (type(e).__name__, text[:160])) from e
    try:
        doc = json.loads(body.decode("utf-8"))
    except Exception as e:                            # noqa: BLE001
        raise UpstreamError("기존 색인이 JSON 이 아니다: %s" % (str(e)[:160],)) from e
    if not isinstance(doc, dict) or not isinstance(doc.get("items"), list):
        raise UpstreamError("기존 색인의 모양이 아니다 (items 목록이 없다)")
    return doc


def merge_index(existing, fresh):
    """이미 올라가 있는 색인에 이번 실행분을 **더한다.**

    ⚠️ 색인을 새로 만들지 않는다. 이번 실행분만 들고 새로 만들면 앞선 실행의
       후보들이 목록에서 조용히 사라진다(본문은 S3 에 남지만 아무도 못 찾는다).
       `aws/report-engine/publisher.py:110-134` `merge_index` 가 같은 이유로 같은 일을
       한다 — 그 규약을 그대로 따른다. 새로 만들지 말고 있는 것을 읽어서 더한다.

    같은 `contentId` 는 **이번 실행 것으로 갈아치운다**(publisher 가 (reportId, version)
    으로 하는 것과 같다). 이번 실행이 건드리지 않은 항목은 그대로 남는다.
    """
    if not existing:
        return fresh
    out = dict(fresh)
    fresh_ids = {i.get("contentId") for i in fresh.get("items") or []}
    kept = [i for i in existing.get("items") or []
            if i.get("contentId") not in fresh_ids]
    items = list(fresh.get("items") or []) + kept
    items.sort(key=lambda i: str(i.get("contentId") or ""))
    out["items"] = items
    out["count"] = len(items)
    out["publicItems"] = [i["contentId"] for i in items if i.get("publicEligible")]
    # 이번 실행이 무엇을 만졌는지 남긴다 — 덮어쓴 것과 이어받은 것을 구별할 수 있게.
    out["generation"] = {
        "at": fresh.get("generated"),
        "writtenIds": sorted(i for i in fresh_ids if i),
        "carriedIds": sorted(str(i.get("contentId")) for i in kept),
        "previousGenerated": existing.get("generated"),
    }
    return out


def build_index(contents, *, at, coverage=None):
    """§30 · §152 — 관리 화면이 읽는 색인. 목록에 필요한 것만 담는다(본문은 따로)."""
    items = []
    for c in contents:
        if c.get("failed"):
            items.append({"contentId": c["contentId"], "failed": True,
                          "error": c.get("error"), "title": c.get("title")})
            continue
        v = c.get("validation") or {}
        ok_public, why_not = public_eligibility(c)
        items.append({
            "contentId": c["contentId"],
            # 공개 자격은 **판정 결과를 그대로 적는다.** 화면이 다시 계산하면 두 판정이 생긴다.
            "publicEligible": ok_public,
            "publicWithheldReason": why_not,
            "type": c.get("type"),
            "title": c.get("title"),
            "status": c.get("status"),
            "eligibility": c.get("eligibility"),
            "blockReasons": c.get("blockReasons"),
            "priority": c.get("priority"),
            "confidence": c.get("confidence"),
            "safetyLevel": c.get("safetyLevel"),
            "validation": v.get("status"),
            "problemCount": len(v.get("problems") or []),
            "phenomenonIds": c.get("phenomenonIds"),
            "eventIds": c.get("eventIds"),
            "reportIds": c.get("reportIds"),
            "platforms": sorted(c.get("platformVersions") or {}),
            "language": c.get("language"),
            "eventTime": c.get("eventTime"),
            "generatedAt": c.get("generatedAt"),
            "link": c.get("link"),
            "href": BODY_PREFIX + c["contentId"] + ".json",
        })
    return {
        "schemaVersion": "earthus.distribution-index.v1",
        "generated": at,
        "generatorVersion": gen.GENERATOR_VERSION,
        "count": len(items),
        # ⚠️ 공개 응답에 넣어도 되는 것은 **이 목록뿐이다.** 비어 있는 것이 정상이다 —
        #    이 엔진의 산출물은 전부 status=DRAFT 이고 그것은 사람 승인 전이다.
        #    소비자는 items 를 훑어 스스로 판단하지 말고 이 목록을 쓴다.
        "publicItems": [i["contentId"] for i in items if i.get("publicEligible")],
        "summary": gen.summarize([c for c in contents if not c.get("failed")]),
        "coverage": coverage or {},
        "schedules": pq.SCHEDULES,
        "adapters": adapters.capabilities(),
        # ⚠️ 이 문장이 화면에 그대로 나간다. 오해를 남기지 않는다.
        "note": {
            "ko": "이것은 **후보**입니다. 아무 곳에도 올라가지 않았습니다. "
                  "관리자 화면에서 사람이 확인하고 올립니다.",
            "en": "These are candidates. Nothing has been published. A human publishes "
                  "from the admin screen.",
        },
        "items": items,
    }


def handler(event=None, context=None):
    at = _now()
    # ⚠️ **키가 있으면** 모양을 강제한다. `{"date": None}` 을 조용히 오늘로 바꾸지 않는다 —
    #    날짜를 주려다 실패한 호출을 성공으로 만들어 주면 어느 날의 결과인지 알 수 없다.
    #    키가 아예 없을 때만 지금 시각의 날짜를 쓴다(그건 이미 정규 모양이다).
    incoming = event or {}
    today = canonical_date(incoming["date"]) if "date" in incoming else at[:10]

    # ⚠️⚠️ 상류를 못 받으면 **여기서 끝난다.** 예전에는 두 실패를 `problems` 에 담고
    #    그대로 진행해 후보 0건짜리 색인을 썼다 — 상류가 죽은 날 "오늘은 사건이 없다"는
    #    산출물이 만들어지고 그것이 이미 올라가 있던 색인을 덮어썼다.
    #    실패(FAILURE)와 빈 결과(EMPTY)는 다르다. 빈 결과는 아래에서 정상 처리한다.
    lab_doc = _fetch_required(LAB_REPORTS, "lab-reports", "reports", list)
    verify_doc = _fetch_required(VERIFY_DAILY, "verify-daily", "days", dict)

    cands = build_candidates(lab_doc, verify_doc, today=today)
    contents = generate_all(cands, at=at)
    fresh = build_index(contents, at=at, coverage={
        "labReports": len(lab_doc.get("reports") or []),
        "labIndexGeneratedAt": lab_doc.get("generatedAt"),
        "verifyDays": len(verify_doc.get("days") or {}),
        # 상류 실패는 이제 여기 오지 않는다 — 오면 위에서 던진다. 빈 목록을 남겨
        # "문제가 없었다"를 명시한다.
        "problems": [],
    })

    if event_flag(event, "dryRun"):
        # dryRun 은 S3 를 아예 건드리지 않으므로 병합 전 산출물을 보여 준다.
        print(f"[dist] dryRun · 후보 {len(contents)}건")
        return {"ok": True, "dryRun": True, "count": len(contents), "index": fresh}

    s3 = _s3()
    # 있는 것을 읽어서 더한다. 못 읽으면 UpstreamError 로 멈춘다 — 쓰기 전이다.
    existing = read_index(s3)
    index = merge_index(existing, fresh)
    # ⚠️ 본문은 **전부** 남긴다. 접두사가 비공개(archive/)이므로 숨길 이유가 없고,
    #    관리 화면은 차단된 후보도 열어 봐야 한다. 예전에는 여기서 continue 해 버려서
    #    "사람이 관리 도구에서 직접 열어야 한다"고 적어 두고 열 물건을 안 남겼다.
    #    공개 여부는 저장 위치가 아니라 index 의 publicItems 가 정한다.
    for c in contents:
        if c.get("failed"):
            continue
        key = BODY_PREFIX + c["contentId"] + ".json"
        _assert_write_allowed(key, c)
        s3.put_object(Bucket=BUCKET, Key=key,
                      Body=json.dumps(c, ensure_ascii=False, separators=(",", ":")).encode(),
                      ContentType="application/json; charset=utf-8",
                      CacheControl="no-cache")
    _assert_write_allowed(INDEX_KEY, {"status": "DRAFT"})
    s3.put_object(Bucket=BUCKET, Key=INDEX_KEY,
                  Body=json.dumps(index, ensure_ascii=False, separators=(",", ":")).encode(),
                  ContentType="application/json; charset=utf-8",
                  CacheControl="no-cache")
    ok = sum(1 for c in contents if not c.get("failed"))
    public_ids = list(index.get("publicItems") or [])
    gen = index.get("generation") or {}
    print(f"[dist] 후보 {ok}건 · 실패 {len(contents) - ok}건 · "
          f"공개 자격 {len(public_ids)}건 · 색인 {index.get('count')}건"
          f"(이번 {len(gen.get('writtenIds') or [])} + 이어받음 "
          f"{len(gen.get('carriedIds') or [])}) · {fresh['summary'].get('byEligibility')}")
    return {"ok": True, "count": ok, "failed": len(contents) - ok,
            "publicItems": public_ids,
            "indexCount": index.get("count"),
            "wroteIds": list(gen.get("writtenIds") or []),
            "carriedIds": list(gen.get("carriedIds") or []),
            "indexExisted": existing is not None}


def write_local(index, contents, root):
    """개발용 — S3 대신 로컬 디렉터리에 같은 경로로 쓴다.

    관리 화면을 배포 없이 열어 보기 위한 것이다. 운영 경로는 handler() 다.
    """
    idx_path = os.path.join(root, LOCAL_INDEX_KEY.replace("/", os.sep))
    os.makedirs(os.path.dirname(idx_path), exist_ok=True)
    os.makedirs(os.path.join(root, LOCAL_BODY_PREFIX.rstrip("/").replace("/", os.sep)),
                exist_ok=True)
    with open(idx_path, "w", encoding="utf-8", newline="\n") as fh:
        json.dump(index, fh, ensure_ascii=False, indent=1)
    n = 0
    for c in contents:
        if c.get("failed"):
            continue
        p = os.path.join(root, LOCAL_BODY_PREFIX.replace("/", os.sep) + c["contentId"] + ".json")
        with open(p, "w", encoding="utf-8", newline="\n") as fh:
            json.dump(c, fh, ensure_ascii=False, indent=1)
        n += 1
    return idx_path, n


if __name__ == "__main__":
    import argparse
    ap = argparse.ArgumentParser(description="배포 후보 생성 (로컬 실행)")
    ap.add_argument("--out", help="로컬 디렉터리에 쓴다 (예: prototype)")
    ap.add_argument("--date", help="기준 날짜 YYYY-MM-DD")
    ap.add_argument("--input-lab", help="ocean/lab-reports.json 로컬 경로")
    ap.add_argument("--input-verify", help="wind/series/verify-daily.json 로컬 경로")
    a = ap.parse_args()

    at = _now()
    today = a.date or at[:10]
    lab_doc = json.load(open(a.input_lab, encoding="utf-8")) if a.input_lab else _get(LAB_REPORTS)
    verify_doc = json.load(open(a.input_verify, encoding="utf-8")) if a.input_verify \
        else _get(VERIFY_DAILY)
    cands = build_candidates(lab_doc, verify_doc, today=today)
    contents = generate_all(cands, at=at)
    index = build_index(contents, at=at, coverage={
        "labReports": len((lab_doc or {}).get("reports") or []),
        "labIndexGeneratedAt": (lab_doc or {}).get("generatedAt"),
        "verifyDays": len((verify_doc or {}).get("days") or {}),
        "problems": [],
    })
    print(f"[dist] 후보 {index['count']}건 · "
          f"{json.dumps(index['summary'].get('byEligibility'), ensure_ascii=False)}")
    if a.out:
        path, n = write_local(index, contents, a.out)
        print(f"  → {path} (본문 {n}건)")
