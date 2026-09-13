# -*- coding: utf-8 -*-
"""기사 중복 제거와 계보 — PHASE 3H.

**ARTICLE DEDUP ≠ EVENT FUSION.** 이 파일은 "같은 기사인가"만 판정한다.
"같은 사건인가"는 `prototype/js/earthus2/v11/event/event-fusion.js` 가 한다 — 둘을 한
알고리즘으로 합치지 않는다. 그래서 이 모듈은 사건 id 를 만들지도, 받지도 않는다.
조립기(3G)는 이 결과의 **뿌리 기사만** 사건 결합에 넘기고, 나머지 구성원은 계보로 달아 둔다.

절대 지우지 않는다
  중복이 발견돼도 원본도 파생본도 삭제하지 않는다. 산출물은 `dedup_group_id` ·
  `root_article_id` · `relation` 세 칸이고, 기사 자체는 전부 남는다.
  번역본이 발견됐다고 그 매체를 출처 목록에서 빼지도 않는다.

본문을 쓰지 않는다 (설계 제약이지 게으름이 아니다)
  `aws/regional-news/handler.py` 머리말: "기사 본문을 절대 담지 않는다. 담는 것은
  제목·링크·시각·매체뿐이다. 요약도 하지 않는다." 그래서 판정 신호는 URL·제목·매체·
  시각·언어·좌표뿐이다. 번역 대조를 본문으로 할 수 없고, 그 한계를 확신도로 표시한다.

교차검증을 부풀리지 않는다 (gdelt-events 가 실측으로 겪은 결함 ①)
  한 중복 묶음은 **독립 출처 1 로 센다.** 구성원이 몇이든, 매체가 몇 곳이든 마찬가지다 —
  통신사 기사를 스무 곳이 전재한 것은 스무 곳이 독립으로 확인한 것이 아니다.
  `independence_units()` 가 그 회계를 담당한다.

합치지 않는 쪽으로 기운다
  숫자 집합이 서로 어긋나면 합치지 않는다. 좌표가 멀면 합치지 않고 충돌로 적는다.
  시간 창을 넘으면 합치지 않는다. 애매하면 따로 두는 편이 낫다 — 잘못 합치면
  독립 출처가 부풀고, 그것이 확정 등급을 거짓으로 만든다.
"""
import math
import re
import unicodedata
from urllib.parse import parse_qsl, urlencode, urlsplit, urlunsplit

DEDUP_SCHEMA = "earthus.article-dedup.v1"

# ── 계보 관계 ────────────────────────────────────────────────────────────────
# 4종뿐이다. `RELATED_TO` 는 여기 없다 — 그것은 사건끼리의 관계이고
# EVENT_RELATION(docs/EARTH_EVENT_CANONICAL_MODEL.md §2.3)이 담당한다.
ORIGINAL = "ORIGINAL"
TRANSLATION_OF = "TRANSLATION_OF"
SYNDICATION_OF = "SYNDICATION_OF"
REWRITE_OF = "REWRITE_OF"
RELATIONS = (ORIGINAL, TRANSLATION_OF, SYNDICATION_OF, REWRITE_OF)

# 확신도 — content_contract.CONFIDENCE 와 같은 어휘를 쓴다. 새 척도를 만들지 않는다.
HIGH, MEDIUM, LOW = "HIGH", "MEDIUM", "LOW"

# ── 판정 문턱 ────────────────────────────────────────────────────────────────
# 제목 유사도는 자카드다 — 저장소가 이미 쓰는 척도(event-fusion.js, ingestion-cluster.js)와 같게 둔다.
IDENTITY_WINDOW_H = 72.0        # 같은 매체·같은 제목이면 URL 변형으로 본다
SYNDICATION_WINDOW_H = 72.0
SYNDICATION_TITLE_SIM = 0.80    # 전재는 제목이 거의 그대로다. 낮추면 다른 사건이 붙는다
REWRITE_WINDOW_H = 72.0
REWRITE_TITLE_SIM = 0.60        # 같은 매체 안에서만 적용하므로 더 관대해도 된다
TRANSLATION_WINDOW_H = 48.0
TRANSLATION_KM = 200.0          # 좌표가 둘 다 있을 때만 본다
LOCATION_CONFLICT_KM = 300.0    # 이보다 멀면 같은 기사로 보지 않고 충돌로 적는다

# 제목 앞뒤에 붙는 편집 표지. 내용이 아니므로 비교 전에 떼어낸다.
_TITLE_AFFIX = re.compile(
    r"^\s*(?:\[[^\]]{1,20}\]|\([^)]{1,20}\)|"
    r"(?:2nd\s+)?(?:LEAD|UPDATE\d?|EXCLUSIVE|BREAKING|속보|단독|종합\d?|경제|사회)\s*[:\-]?)\s*",
    re.IGNORECASE)
_TITLE_TAIL = re.compile(r"\s*[|\-–—]\s*[^|\-–—]{1,40}$")

# 추적 파라미터 — 값이 달라도 같은 문서다.
_TRACKING = re.compile(r"^(?:utm_|ito$|ref$|ref_src$|refsrc$|fbclid$|gclid$|igshid$|cmpid$|"
                       r"CMP$|smid$|partner$|mc_cid$|mc_eid$|s_cid$|at_medium$|at_campaign$)", re.IGNORECASE)
_AMP_TAIL = re.compile(r"(?:/amp|\.amp|/amp\.html|\.amp\.html)$", re.IGNORECASE)

# 자카드에서 뺄 흔한 낱말. 적게 둔다 — 지우면 지울수록 서로 다른 제목이 비슷해진다.
_STOP = frozenset("""
a an the and or of to in on for with from at by is are was were as that this its it
그리고 또는 에서 으로 대한 관련 있는 있다 했다 하며 이다 및 등 위해 대해 따라 통해
""".split())

_NUMBER = re.compile(r"\d+(?:[.,]\d+)?")
_LATIN_ENTITY = re.compile(r"\b[A-Z][\w'’\-]{2,}")
_CJK_RUN = re.compile(r"[ㄱ-힝一-鿿぀-ヿ]{2,}")


# ── 정규화 ───────────────────────────────────────────────────────────────────
def normalize_url(url):
    """같은 문서를 가리키는 주소를 하나로 모은다. 못 읽으면 원문을 그대로 돌려준다."""
    if not isinstance(url, str) or not url.strip():
        return ""
    try:
        parts = urlsplit(url.strip())
    except ValueError:
        return url.strip()
    host = (parts.hostname or "").lower()
    if host.startswith("www."):
        host = host[4:]
    if parts.port and parts.port not in (80, 443):
        host = f"{host}:{parts.port}"
    path = _AMP_TAIL.sub("", parts.path or "")
    if len(path) > 1:
        path = path.rstrip("/")
    query = sorted((k, v) for k, v in parse_qsl(parts.query, keep_blank_values=True)
                   if not _TRACKING.match(k) and k.lower() != "outputtype")
    scheme = (parts.scheme or "https").lower()
    return urlunsplit((scheme if scheme in ("http", "https") else "https", host, path, urlencode(query), ""))


def normalize_title(title):
    """비교용 제목. 편집 표지·문장부호·공백 차이를 지운다. 화면에는 원문을 쓴다."""
    text = unicodedata.normalize("NFKC", str(title or "")).strip()
    text = re.sub(r"<[^>]*>", " ", text)
    previous = None
    while previous != text:                      # [단독][종합] 처럼 겹친 표지를 모두 떼어낸다
        previous = text
        text = _TITLE_AFFIX.sub("", text)
    text = _TITLE_TAIL.sub("", text)             # 끝의 매체명 꼬리표
    text = re.sub(r"[^\w\s]", " ", text, flags=re.UNICODE)
    return re.sub(r"\s+", " ", text).strip().lower()


def title_tokens(title):
    return frozenset(t for t in normalize_title(title).split() if len(t) > 1 and t not in _STOP)


def numbers(title):
    """제목 안의 수. 번역되어도 남는 거의 유일한 신호다.

    소수점·천단위 구분을 정규화하고, 규모 표기(M6.2)는 숫자만 남긴다.
    """
    found = set()
    for raw in _NUMBER.findall(unicodedata.normalize("NFKC", str(title or ""))):
        cleaned = raw.replace(",", "")
        try:
            value = float(cleaned)
        except ValueError:
            continue
        found.add(int(value) if value.is_integer() else round(value, 2))
    return frozenset(found)


def entities(title):
    """고유명사 근사. 라틴 문자는 대문자 시작, CJK 는 2자 이상 연속.

    ⚠️ 근사다. 한국어에는 대문자가 없어 조사가 붙은 지명이 다른 토큰이 된다.
       그래서 번역 판정은 이 신호 하나로 하지 않고 숫자·좌표·시각과 함께 본다.
    """
    text = unicodedata.normalize("NFKC", str(title or ""))
    found = {m.group(0).lower() for m in _LATIN_ENTITY.finditer(text)}
    found |= {m.group(0) for m in _CJK_RUN.finditer(text)}
    return frozenset(t for t in found if t.lower() not in _STOP)


def jaccard(left, right):
    if not left or not right:
        return 0.0
    intersection = len(left & right)
    union = len(left | right)
    return intersection / union if union else 0.0


def _hours_between(left, right):
    """둘 중 하나라도 시각이 없으면 inf — 시간 조건을 통과시키지 않는다."""
    if left is None or right is None:
        return math.inf
    return abs(left - right) / 3600.0


def _km(a, b):
    if None in a or None in b:
        return None
    radius, (lat1, lon1), (lat2, lon2) = 6371.0088, a, b
    dlat, dlon = math.radians(lat2 - lat1), math.radians(lon2 - lon1)
    h = (math.sin(dlat / 2) ** 2
         + math.cos(math.radians(lat1)) * math.cos(math.radians(lat2)) * math.sin(dlon / 2) ** 2)
    return 2 * radius * math.asin(min(1.0, math.sqrt(h)))


def _epoch(value):
    """ISO 문자열 → epoch 초. 못 읽으면 None 이고, None 은 '모른다' 다(0 이 아니다)."""
    if value is None:
        return None
    if isinstance(value, (int, float)):
        return float(value)
    text = str(value).strip()
    if not text:
        return None
    if text.endswith("Z"):
        text = text[:-1] + "+00:00"
    try:
        from datetime import datetime
        parsed = datetime.fromisoformat(text)
    except ValueError:
        return None
    if parsed.tzinfo is None:
        from datetime import timezone
        parsed = parsed.replace(tzinfo=timezone.utc)
    return parsed.timestamp()


class _Article:
    """판정에 쓰는 파생값만 미리 계산해 둔다. 원본 딕셔너리는 바꾸지 않는다."""

    __slots__ = ("raw", "article_id", "publisher", "language", "url", "title",
                 "tokens", "numbers", "entities", "at", "point", "urls")

    def __init__(self, row, index):
        self.raw = row
        self.article_id = str(row.get("article_id") or row.get("articleId") or f"article-{index}")
        self.publisher = str(row.get("publisher") or row.get("source_id") or row.get("sourceId") or "").strip().lower()
        self.language = (str(row.get("language") or "").strip().lower() or None)
        self.url = normalize_url(row.get("canonical_url") or row.get("canonicalUrl") or row.get("url") or "")
        self.title = row.get("title") or ""
        self.tokens = title_tokens(self.title)
        self.numbers = numbers(self.title)
        self.entities = entities(self.title)
        self.at = _epoch(row.get("published_at") or row.get("publishedAt"))
        lat, lon = row.get("lat"), row.get("lon")
        self.point = (lat if isinstance(lat, (int, float)) else None,
                      lon if isinstance(lon, (int, float)) else None)
        self.urls = {self.url} if self.url else set()


class _Group:
    def __init__(self, article):
        self.members = [article]
        self.relations = {article.article_id: ORIGINAL}
        self.confidence = {article.article_id: HIGH}
        self.basis = {article.article_id: ["seed"]}
        self.variant_urls = set(article.urls)
        self.conflicts = []

    def add(self, article, relation, confidence, basis):
        self.members.append(article)
        self.relations[article.article_id] = relation
        self.confidence[article.article_id] = confidence
        self.basis[article.article_id] = basis
        self.variant_urls |= article.urls


def _location_conflict(left, right):
    distance = _km(left.point, right.point)
    return distance is not None and distance > LOCATION_CONFLICT_KM, distance


def _numbers_disagree(left, right):
    """둘 다 숫자가 있는데 겹치지 않으면 다른 사건이다. 한쪽이 비면 판정하지 않는다."""
    return bool(left.numbers) and bool(right.numbers) and not (left.numbers & right.numbers)


def _match(candidate, member):
    """후보를 기존 구성원에 붙일 수 있는지. (relation, confidence, basis) 또는 None."""
    same_publisher = candidate.publisher == member.publisher and candidate.publisher != ""
    same_language = candidate.language == member.language
    similarity = jaccard(candidate.tokens, member.tokens)
    identical_title = candidate.tokens and candidate.tokens == member.tokens
    gap = _hours_between(candidate.at, member.at)

    # ① 같은 URL — 같은 문서다. 정규화가 이미 변형을 흡수했다.
    if candidate.url and candidate.url == member.url:
        return REWRITE_OF, HIGH, ["url-identity"]

    if _numbers_disagree(candidate, member):
        return None
    conflicted, distance = _location_conflict(candidate, member)
    if conflicted:
        return None

    # ② 같은 매체·같은 제목 — 주소만 다른 같은 기사(모바일·AMP·미러)
    if same_publisher and same_language and identical_title and gap <= IDENTITY_WINDOW_H:
        return REWRITE_OF, HIGH, ["content-identity", f"titleSim={similarity:.2f}"]

    # ③ 다른 매체·같은 언어·거의 같은 제목 — 전재
    if (not same_publisher) and same_language and similarity >= SYNDICATION_TITLE_SIM \
            and candidate.numbers == member.numbers and gap <= SYNDICATION_WINDOW_H:
        return SYNDICATION_OF, MEDIUM, [f"titleSim={similarity:.2f}", "different-publisher"]

    # ④ 같은 매체·같은 언어·제목만 손본 것 / 시각만 갱신된 것
    if same_publisher and same_language and similarity >= REWRITE_TITLE_SIM and gap <= REWRITE_WINDOW_H:
        return REWRITE_OF, MEDIUM, [f"titleSim={similarity:.2f}", "same-publisher"]

    # ⑤ 다른 언어 — 번역본. 본문이 없으므로 숫자와 위치로만 본다. 확신도는 항상 LOW.
    if (not same_language) and candidate.language and member.language \
            and candidate.numbers and candidate.numbers == member.numbers and gap <= TRANSLATION_WINDOW_H:
        near = distance is not None and distance <= TRANSLATION_KM
        shared = candidate.entities & member.entities
        if near or shared:
            basis = ["numbers=" + ",".join(str(n) for n in sorted(candidate.numbers))]
            basis.append(f"km={distance:.0f}" if near else "shared-entity=" + ",".join(sorted(shared))[:60])
            return TRANSLATION_OF, LOW, basis
    return None


def deduplicate(articles):
    """기사 목록을 중복 묶음으로 묶는다. 아무것도 지우지 않는다.

    반환
      {schema, groups[], articles{article_id: {...}}, conflicts[], counts{}}

    `groups[].members[]` 의 첫 항목이 뿌리이고 relation 은 ORIGINAL 이다.
    뿌리는 **발행이 가장 이른 기사**다. 언어로 고르지 않는다 — 영어가 항상 원본이라는
    근거가 없고, 그렇게 고르면 우리 편향이 계보에 박힌다. 시각이 같으면 article_id 순이다.
    시각을 모르는 기사는 뒤로 보낸다(모르는 것을 가장 이른 것으로 대접하지 않는다).
    """
    prepared = [_Article(row, index) for index, row in enumerate(articles or [])]
    ordered = sorted(prepared, key=lambda a: (a.at is None, a.at if a.at is not None else 0.0, a.article_id))

    groups, conflicts = [], []
    for candidate in ordered:
        placed = None
        for group in groups:
            for member in group.members:
                verdict = _match(candidate, member)
                if verdict:
                    relation, confidence, basis = verdict
                    group.add(candidate, relation, confidence, basis + [f"matchedAgainst={member.article_id}"])
                    placed = group
                    break
                conflicted, distance = _location_conflict(candidate, member)
                if conflicted and jaccard(candidate.tokens, member.tokens) >= SYNDICATION_TITLE_SIM:
                    # 제목은 같은데 좌표가 멀다. 숨기지 않고 적는다 (TRUTH_VOCABULARY §2.4).
                    conflicts.append({"kind": "LOCATION", "articleIds": sorted([candidate.article_id, member.article_id]),
                                      "km": round(distance, 1), "resolved": False})
            if placed:
                break
        if not placed:
            groups.append(_Group(candidate))

    result_groups, index = [], {}
    for group in groups:
        root = group.members[0]
        group_id = f"dg_{root.article_id}"
        members = []
        for member in group.members:
            relation = ORIGINAL if member is root else group.relations[member.article_id]
            confidence = HIGH if member is root else group.confidence[member.article_id]
            members.append({"articleId": member.article_id, "relation": relation,
                            "confidence": confidence, "basis": group.basis[member.article_id]})
            index[member.article_id] = {
                "dedupGroupId": group_id, "rootArticleId": root.article_id,
                "relation": relation, "dedupConfidence": confidence,
                "isRoot": member is root, "normalizedUrl": member.url,
                "variantUrls": sorted(group.variant_urls - {member.url}) if member is root else [],
            }
        result_groups.append({
            "dedupGroupId": group_id, "rootArticleId": root.article_id,
            "memberCount": len(members),
            # 묶음의 확신도는 가장 약한 구성원을 따른다. 번역본이 하나 섞이면 묶음도 LOW 다.
            "confidence": LOW if any(m["confidence"] == LOW for m in members)
                          else (MEDIUM if any(m["confidence"] == MEDIUM for m in members) else HIGH),
            "publishers": sorted({m.publisher for m in group.members if m.publisher}),
            "languages": sorted({m.language for m in group.members if m.language}),
            "members": members,
        })
    return {
        "schema": DEDUP_SCHEMA, "groups": result_groups, "articles": index, "conflicts": conflicts,
        "counts": {"articles": len(prepared), "groups": len(result_groups),
                   "duplicates": len(prepared) - len(result_groups), "conflicts": len(conflicts)},
    }


def roots(result):
    """사건 결합에 넘길 기사 id. 구성원은 계보로 남고 여기에는 뿌리만 온다."""
    return [group["rootArticleId"] for group in result["groups"]]


def independence_units(result):
    """교차검증에 쓸 독립 출처 수.

    **묶음 하나가 1 이다.** 통신사 기사를 스무 곳이 전재했다고 스무 곳이 독립으로
    확인한 것이 아니다. gdelt-events 가 실측으로 겪은 결함 ①(합치면서 점수를 지어낸 것)을
    같은 경로로 되풀이하지 않으려고 이 함수가 유일한 회계 창구다.
    """
    return len(result["groups"])


def lineage(result, article_id):
    """기사 하나에서 뿌리까지의 계보. 뿌리를 못 찾으면 빈 목록(추측하지 않는다)."""
    entry = result["articles"].get(article_id)
    if not entry:
        return []
    chain = [{"articleId": article_id, "relation": entry["relation"]}]
    if not entry["isRoot"]:
        chain.append({"articleId": entry["rootArticleId"], "relation": ORIGINAL})
    return chain
