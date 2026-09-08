# -*- coding: utf-8 -*-
"""서술 생성과 검증 (PHASE 7 §8 · §9).

두 가지를 한 파일에 둔다.
  1) build_* — 팩트에서 **결정적으로** 문장을 만든다. LLM 을 쓰지 않는다.
  2) validate_narrative — 만들어진 문장을 팩트와 다시 대조한다.
     LLM 이 나중에 문장을 쓰더라도 이 검증기를 통과해야 발행된다.

왜 LLM 을 여기서 안 쓰나: 지금 필요한 것은 '문체'가 아니라 '숫자가 안 틀리는 것'이다.
결정적 생성은 검증기를 언제나 통과하고, 재현 가능하며, 표본이 늘어도 흔들리지 않는다.
LLM 서술은 이 검증기가 준비된 뒤에 붙이는 것이 안전한 순서다.
"""
import re

# 숫자를 문장에서 뽑는다. 1,159 · -0.887 · 1.24 같은 표기를 모두 잡는다.
NUM = re.compile(r"-?\d[\d,]*\.?\d*")

# 관측·예보·분석을 섞어 쓰면 안 된다(§9).
# 값의 **정체를 잘못 주장하는** 표현만 잡는다. 낱말이 스치기만 한 것은 잡지 않는다 —
# '예보의 평균절대오차' 는 분석값을 말하면서 '예보' 를 정상적으로 언급한 문장이다.
MISATTRIBUTION = {
    "OBSERVED": ("관측값은", "실측값은", "관측된 값은", "관측치는"),
    "PROVIDER_FORECAST": ("예보값은", "예보치는", "예보한 값은"),
    "EARTHUS_ANALYSIS": ("자체 분석값은",),
}
# 근거 없는 인과를 만들지 않는다(§7).
CAUSAL = ("때문에", "때문이다", "탓에", "원인이다", "초래", "야기")


# 기간 표기는 값이 아니라 이름이다. 2026-08 · 2026-Q3 · 2026 을 숫자로 세면
# 멀쩡한 문장이 '팩트에 없는 숫자' 로 걸린다.
# ⚠️ 앞뒤로 숫자가 더 붙어 있으면 기간 표기가 아니다. 양쪽 경계가 **둘 다** 필요하다.
#    뒤만 막으면: "1991-2020" 에서 "1991-20" 을 먹고 "20" 을 남긴다 → 멀쩡한 평년 표기가
#      '팩트에 없는 숫자 20' 으로 걸린다.
#    앞을 안 막으면: 표본 수 "59697" 에서 뒤 네 자리 "9697" 을 기간으로 착각해 지우고
#      "5" 만 남긴다 → 한 자리 수라 검사를 그냥 통과한다. 즉 **틀린 다섯 자리 숫자가
#      검사를 빠져나간다.** 검증기가 조용히 헐거워지는 쪽이 더 위험하다.
PERIOD_TOKEN = re.compile(r"(?<!\d)\d{4}(?:-(?:Q[1-4]|\d{2}))?(?!\d)")
# 24시간 · 48시간 같은 리드 표기도 값이 아니라 조건이다.
LEAD_TOKEN = re.compile(r"\d+\s*시간")


def _nums(text):
    text = LEAD_TOKEN.sub(" ", PERIOD_TOKEN.sub(" ", text or ""))
    out = []
    for m in NUM.finditer(text or ""):
        try:
            out.append(round(float(m.group().replace(",", "")), 6))
        except ValueError:
            pass
    return out


def build_scorecard_narrative(scorecard, *, lang="ko"):
    """성적표에서 문장을 만든다. 숫자는 전부 행에서 그대로 가져온다.

    비교 문장('A 가 B 보다 정확했다')은 **같은 변수·같은 리드**끼리만 만든다.
    리드가 다른 둘을 비교하면 그 자체가 거짓말이다.
    """
    rows = [r for r in scorecard.get("rows", []) if r.get("evaluated")]
    if not rows:
        return {"summary": None, "lines": [], "empty": True}
    lines = []
    by_key = {}
    for r in rows:
        by_key.setdefault((r.get("phenomenonId"), r.get("leadHours")), []).append(r)
    for (phen, lead), group in sorted(by_key.items(), key=lambda x: (str(x[0][0]), x[0][1] or 0)):
        group = [g for g in group if (g.get("scores") or {}).get("mae") is not None]
        if not group:
            continue
        best = min(group, key=lambda g: g["scores"]["mae"])
        name = {"weather.temperature": "기온", "weather.wind": "바람"}.get(phen, phen)
        unit = "℃" if phen == "weather.temperature" else "m/s"
        lines.append({
            "phenomenonId": phen, "leadHours": lead,
            "text": (f"{name} {lead}시간 예보의 평균절대오차는 "
                     + " · ".join(f"{g['modelId']} {g['scores']['mae']}{unit}" for g in group)
                     + f" 였습니다(표본 {best.get('sampleCount'):,})."),
            "factNumbers": [g["scores"]["mae"] for g in group] + [best.get("sampleCount")],
        })
        if len(group) > 1:
            lines.append({
                "phenomenonId": phen, "leadHours": lead,
                "text": f"같은 조건에서 {best['modelId']} 쪽 오차가 더 작았습니다.",
                "factNumbers": [],
            })
    n_total = sum(r.get("sampleCount") or 0 for r in rows)
    summary = (f"{scorecard.get('period')} 기간에 {len(rows)}개 조합을 채점했습니다"
               f"(표본 {n_total:,}). 평가하지 못한 항목은 "
               f"{scorecard.get('notEvaluatedCount', 0)}개입니다.")
    return {"summary": summary, "lines": lines, "empty": False,
            "factNumbers": [len(rows), n_total, scorecard.get("notEvaluatedCount", 0)]}


def validate_narrative(text, facts, *, allowed_numbers=None, truth_types=None, mask_texts=None):
    """§9 — 문장이 팩트와 어긋나면 발행하지 않는다.

    검사
      · 문장에 나온 숫자가 팩트(또는 허용 목록)에 있는가
      · 없는 인과관계를 만들지 않았는가
      · 관측/예보/분석을 뒤섞지 않았는가
    돌려주는 것: (ok, problems)
    """
    problems = []
    if not text:
        return True, problems

    # 지역 **이름**에 숫자가 들어 있는 경우가 있다 — "60°S–60°N", "20°S–20°N".
    # 이건 값이 아니라 이름이다. 기간·리드 표기와 같은 이유로 먼저 가린다.
    # 가릴 문자열은 팩트가 들고 있는 라벨에서만 온다(마음대로 못 가린다).
    for m in sorted(mask_texts or [], key=len, reverse=True):
        if m:
            text = text.replace(m, " ")

    allowed = set()
    for f in facts or []:
        v = f.get("value")
        if isinstance(v, (int, float)):
            allowed.add(round(float(v), 6))
        n = f.get("sampleCount")
        if isinstance(n, (int, float)):
            allowed.add(round(float(n), 6))
    for v in (allowed_numbers or []):
        if isinstance(v, (int, float)):
            allowed.add(round(float(v), 6))

    for n in _nums(text):
        # 리드시간(24·48)과 한 자리 정수는 문장 구조에 쓰이므로 통과시킨다.
        if n in allowed or n in (24.0, 48.0) or (float(n).is_integer() and abs(n) < 10):
            continue
        problems.append(f"팩트에 없는 숫자: {n}")

    for w in CAUSAL:
        if w in text:
            problems.append(f"근거 없는 인과 표현: '{w}'")

    if truth_types:
        # 낱말이 나오기만 해도 잡으면 '예보의 평균절대오차' 같은 정상 문장이 걸린다.
        # 잡아야 하는 것은 **값의 정체를 잘못 주장하는 문장**이다: "관측값은 …", "예보값은 …".
        # 키워드 검사는 여기까지가 한계다 — 숫자 대조가 주 방어선이고 이것은 보조다.
        for kind, phrases in MISATTRIBUTION.items():
            if kind in truth_types:
                continue
            for ph in phrases:
                if ph in text:
                    problems.append(f"이 팩트는 {sorted(truth_types)} 인데 문장이 '{ph}' 라고 주장한다")
    return (not problems), problems


def validate_report_narrative(report):
    """리포트 안의 모든 문장을 팩트와 대조한다. 하나라도 어긋나면 발행 금지."""
    facts = report.get("facts") or []
    truth_types = {f.get("truthType") for f in facts if f.get("truthType")}
    problems = []
    narr = report.get("narrative") or {}
    texts = [narr.get("summary")] + [ln.get("text") for ln in (narr.get("lines") or [])]
    allowed = list(narr.get("factNumbers") or [])
    for ln in (narr.get("lines") or []):
        allowed.extend(ln.get("factNumbers") or [])
    for t in texts:
        ok, probs = validate_narrative(t, facts, allowed_numbers=allowed, truth_types=truth_types)
        if not ok:
            problems.extend(probs)
    # PHASE 8 — 스토리 문장도 같은 잣대로 본다. 스토리만 검사를 피해 가면 안 된다.
    ok_s, probs_s = validate_stories(report.get("stories"), facts)
    if not ok_s:
        problems.extend(probs_s)
    return (not problems), problems


# ═══ PHASE 8 §12 — 스토리 문장도 팩트와 대조한다 ═════════════════════════════
# 스토리는 제목·요약을 스스로 만든다. 그 문장에 쓴 숫자가 **그 스토리가 가리키는
# 팩트**에서 나오는지 여기서 확인한다.
#
# ⚠️ 허용 숫자를 스토리가 스스로 신고하게 두지 않는다. 그러면 검사가 아니라 자백이다.
#    팩트 봉투(value · sampleCount · comparison 안의 숫자)에서 **우리가 뽑는다.**

def allowed_numbers_for(facts):
    """팩트에서 문장에 나와도 되는 숫자를 모은다.

    value 와 sampleCount 는 물론, comparison 안의 숫자(평년값·순위·기준연도·표본일수)도
    팩트가 들고 있는 사실이므로 문장에 쓸 수 있다.
    """
    out = set()

    def walk(v, depth=0):
        if depth > 4:
            return
        if isinstance(v, bool):
            return
        if isinstance(v, (int, float)):
            out.add(round(float(v), 6))
        elif isinstance(v, dict):
            for x in v.values():
                walk(x, depth + 1)
        elif isinstance(v, (list, tuple)):
            for x in v:
                walk(x, depth + 1)

    for f in facts or []:
        walk(f.get("value"))
        walk(f.get("sampleCount"))
        walk(f.get("comparison"))
    return sorted(out)


def validate_stories(stories, facts):
    """스토리 제목·요약을 그 스토리가 가리키는 팩트와 대조한다."""
    by_id = {f.get("factId"): f for f in (facts or [])}
    problems = []
    for st in stories or []:
        mine = [by_id[i] for i in (st.get("factIds") or []) if i in by_id]
        if not mine:
            problems.append("스토리 %s 가 가리키는 팩트를 찾을 수 없다" % st.get("storyId"))
            continue
        allowed = allowed_numbers_for(mine)
        truth = {f.get("truthType") for f in mine if f.get("truthType")}
        # 지역 이름은 한국어·영어 둘 다 숫자를 품을 수 있다("60°S–60°N", "Tropics 20S-20N").
        masks = {(f.get("comparison") or {}).get("regionLabel") for f in mine}
        masks |= {(f.get("comparison") or {}).get("regionLabelEn") for f in mine}
        masks |= {(st.get("spatialExtent") or {}).get("regionLabel"),
                  (st.get("spatialExtent") or {}).get("regionLabelEn")}
        masks = {m for m in masks if isinstance(m, str) and any(c.isdigit() for c in m)}
        # 영어 문장도 같은 잣대로 본다. 한쪽만 검사하면 다른 쪽으로 숫자가 샌다.
        for text in (st.get("title"), st.get("summary"),
                     st.get("titleEn"), st.get("summaryEn")):
            ok, probs = validate_narrative(text, mine, allowed_numbers=allowed,
                                           truth_types=truth, mask_texts=masks)
            if not ok:
                problems.extend("스토리 %s: %s" % (st.get("storyId"), p) for p in probs)
    return (not problems), problems
