# -*- coding: utf-8 -*-
"""인텔 패킷 v1 계약 — 검사기 (INTELLIGENCE-LAYER-PLAN §2.1 · 계약 §C · §J-1~3).

패킷은 Intelligence 의 **사실·근거**다. 서술자(LLM)는 이것을 문장으로 입힐 뿐 새 값을 만들지
않는다(계약 §C-0). 그래서 패킷이 틀리면 화면·서술·보고서가 한꺼번에 틀린다 — 여기서 막는다.

어휘는 이 파일에 베껴 적지 않는다. `contracts/intel-vocab.json` 하나를 import 시점에 읽는다
(계약 §C-3 "한 파일에 두고 Python·JS 가 같이 읽는다"). truth_vocabulary.py 가 SQL 도메인을
읽는 것과 같은 방식이고, lambda_package.module_data_files 가 이 자료 파일을 zip 에 같이 넣는다.

거부와 수리를 구분한다
  거부(errors)  J-1 값에 unit·kind·source·at 이 없다 / J-3 조건·연결 문장에 FORBIDDEN_CAUSAL
               / 어휘 밖 kind·grade·relation / 있는데 missing 에도 적힌 절 — 패킷을 쓰지 않는다
  수리(normalize) J-2 산식 id(inputs.formula_id) 없는 confidence 절 → 절을 빼고
               coverage.missing 에 이유를 적는다. 없는 산식으로 등급을 찍지 않는다(LAYER-PLAN §1)

값을 못 만드는 절은 null 이 아니라 **절 자체를 빼고** coverage.missing 에 이유를 적는다.
절을 null 로 두면 화면이 '빈 카드'를 그리고, 서술자는 빈 칸을 '없음'으로 읽는다.

⚠️ LAYER-PLAN §2.1 에 없던 `next` 절을 더했다(2026-09-20). 계약 §C-0 이 NEXT 를 "Intelligence 의
   핵심 상품, 빠뜨리지 않는다"로 못박았는데 패킷에 자리가 없었다. 항목마다 부록 B 근거 유형
   (A 기관 인용 / B 검증 통계 / C 물리 시뮬 / D 문헌)과 그 유형이 허용하는 EVIDENCE_KIND 를 단다.
"""
import copy
import json
import os
import re

SCHEMA_VERSION = 1

_HERE = os.path.dirname(os.path.abspath(__file__))
VOCAB_PATH = os.path.join(_HERE, "contracts", "intel-vocab.json")
SCHEMA_PATH = os.path.join(_HERE, "contracts", "intel-packet-v1.schema.json")


class IntelContractError(ValueError):
    """패킷이 계약을 어겼다 — 쓰지 않는다."""


def _load_vocab(path=None):
    try:
        with open(path or VOCAB_PATH, encoding="utf-8") as handle:
            data = json.load(handle)
    except (OSError, ValueError) as exc:
        raise IntelContractError("어휘 정본을 읽지 못했다: %s" % (exc,)) from exc
    for key in ("EVIDENCE_KIND", "FORBIDDEN_CAUSAL", "CONFIDENCE_GRADE", "RELATION",
                "NEXT_TYPE", "PACKET_SECTIONS", "INTEL_SECTIONS", "FIXED_TEXT"):
        if not data.get(key):
            raise IntelContractError("어휘 정본에 %s 가 없다" % key)
    return data


VOCAB = _load_vocab()
EVIDENCE_KIND = tuple(VOCAB["EVIDENCE_KIND"])
FORBIDDEN_CAUSAL = tuple(VOCAB["FORBIDDEN_CAUSAL"])
CONFIDENCE_GRADE = tuple(VOCAB["CONFIDENCE_GRADE"])
RELATION = tuple(VOCAB["RELATION"])
NEXT_TYPE = {k: v for k, v in VOCAB["NEXT_TYPE"].items() if not k.startswith("_")}
PACKET_SECTIONS = tuple(VOCAB["PACKET_SECTIONS"])
INTEL_SECTIONS = {k: tuple(v) for k, v in VOCAB["INTEL_SECTIONS"].items() if not k.startswith("_")}
FIXED_TEXT = VOCAB["FIXED_TEXT"]

_PHENOMENON_ID = re.compile(r"^[a-z]+\.[a-z_]+$")
# ISO 8601 — 날짜만(YYYY-MM-DD)도 받는다(일 단위 자료). 시각이 있으면 시간대를 요구한다.
_ISO = re.compile(r"^\d{4}-\d{2}-\d{2}(T\d{2}:\d{2}(:\d{2}(\.\d+)?)?(Z|[+-]\d{2}:?\d{2}))?$")


def _is_iso(value):
    return isinstance(value, str) and bool(_ISO.match(value))


def _nonempty(value):
    return isinstance(value, str) and value.strip() != ""


def causal_hits(text):
    """FORBIDDEN_CAUSAL 이 들어 있으면 걸린 어휘를 돌려준다(대소문자 무시)."""
    if not isinstance(text, str):
        return []
    low = text.lower()
    return [w for w in FORBIDDEN_CAUSAL if w.lower() in low]


def _strings(node):
    """중첩 구조 안의 모든 문자열 — FORBIDDEN_CAUSAL 검사용."""
    if isinstance(node, str):
        yield node
    elif isinstance(node, dict):
        for value in node.values():
            yield from _strings(value)
    elif isinstance(node, (list, tuple)):
        for value in node:
            yield from _strings(value)


def _check_value(where, item, errors, *, need=("key", "unit", "kind", "source", "at"), has_value=True):
    """J-1 — 화면에 나갈 값은 단위·종류·출처·시각을 갖는다."""
    if not isinstance(item, dict):
        errors.append("%s: 값이 객체가 아니다" % where)
        return
    for field in need:
        if field == "at":
            if not _is_iso(item.get("at")):
                errors.append("%s.at: ISO 시각이 없다 — %r" % (where, item.get("at")))
        elif not _nonempty(item.get(field)):
            errors.append("%s.%s 가 없다 (J-1)" % (where, field))
    if has_value and "value" not in item:
        errors.append("%s.value 가 없다" % where)
    kind = item.get("kind")
    if kind is not None and kind not in EVIDENCE_KIND:
        errors.append("%s.kind 가 EVIDENCE_KIND 밖이다: %r" % (where, kind))


def normalize(packet):
    """J-2 수리 — 산식 id 없는 confidence 절을 빼고 coverage.missing 에 적는다.

    원본을 고치지 않고 사본을 돌려준다. 다른 절은 건드리지 않는다.
    """
    out = copy.deepcopy(packet) if isinstance(packet, dict) else packet
    if not isinstance(out, dict):
        return out
    conf = out.get("confidence")
    if conf is not None:
        formula = ((conf.get("inputs") or {}) if isinstance(conf, dict) else {}).get("formula_id")
        if not _nonempty(formula):
            out.pop("confidence", None)
            cov = out.setdefault("coverage", {})
            missing = cov.setdefault("missing", [])
            if not any(isinstance(m, dict) and m.get("section") == "confidence" for m in missing):
                missing.append({"section": "confidence",
                                "reason": "정의된 산식(formula_id)이 없다 — 등급을 찍지 않는다"})
    return out


def validate(packet, *, known_phenomena=None):
    """계약 위반 목록. 빈 목록이면 통과다. 수리는 하지 않는다 — normalize() 를 먼저 부른다."""
    errors = []
    if not isinstance(packet, dict):
        return ["패킷이 객체가 아니다"]
    if packet.get("schema") != SCHEMA_VERSION:
        errors.append("schema 가 %d 이 아니다: %r" % (SCHEMA_VERSION, packet.get("schema")))
    pid = packet.get("phenomenonId")
    if not (isinstance(pid, str) and _PHENOMENON_ID.match(pid)):
        errors.append("phenomenonId 모양이 아니다: %r" % (pid,))
    elif known_phenomena is not None and pid not in known_phenomena:
        errors.append("정본 레지스트리에 없는 현상이다: %s" % pid)
    if "eventId" in packet and packet["eventId"] is not None and not _nonempty(packet["eventId"]):
        errors.append("eventId 는 null 이거나 문자열이다")

    t = packet.get("time")
    if not isinstance(t, dict) or not _is_iso(t.get("retrievedAt")):
        errors.append("time.retrievedAt 이 없다 — 최소한 언제 받았는지는 적는다")
    else:
        for k in ("observedAt", "issuedAt"):
            if t.get(k) is not None and not _is_iso(t.get(k)):
                errors.append("time.%s 가 ISO 시각이 아니다" % k)

    unknown = [k for k in packet if k not in PACKET_SECTIONS
               and k not in ("schema", "phenomenonId", "eventId", "time", "sources", "coverage")]
    if unknown:
        errors.append("계약에 없는 칸: %s" % ", ".join(sorted(unknown)))

    # ── coverage.missing ↔ 실제 절: 한 절은 '있다' 와 '없다' 중 하나다 ──────────
    cov = packet.get("coverage")
    missing = []
    if cov is not None:
        if not isinstance(cov, dict) or not isinstance(cov.get("missing", []), list):
            errors.append("coverage.missing 은 목록이다")
        else:
            missing = cov.get("missing", [])
    missing_names = set()
    for i, m in enumerate(missing):
        if not isinstance(m, dict) or m.get("section") not in PACKET_SECTIONS or not _nonempty(m.get("reason")):
            errors.append("coverage.missing[%d] 는 {section(계약 절), reason} 이다: %r" % (i, m))
            continue
        missing_names.add(m["section"])
    for name in PACKET_SECTIONS:
        present = name in packet
        if present and packet[name] is None:
            errors.append("%s 가 null 이다 — 못 만들면 절을 빼고 coverage.missing 에 적는다" % name)
        if present and name in missing_names:
            errors.append("%s 가 있는데 coverage.missing 에도 있다" % name)
        if not present and name not in missing_names:
            errors.append("%s 가 없는데 coverage.missing 에 이유가 없다" % name)
    if not any(name in packet for name in PACKET_SECTIONS):
        errors.append("절이 하나도 없다 — 패킷을 만들지 않는다")

    # ── 절별 ─────────────────────────────────────────────────────────────
    cur = packet.get("current")
    if cur is not None:
        vals = cur.get("values") if isinstance(cur, dict) else None
        if not isinstance(vals, list) or not vals:
            errors.append("current.values 가 비었다 — 값이 없으면 절을 뺀다")
        else:
            for i, v in enumerate(vals):
                _check_value("current.values[%d]" % i, v, errors)

    chg = packet.get("change")
    if chg is not None:
        items = chg.get("items") if isinstance(chg, dict) else None
        if not isinstance(items, list) or not items:
            errors.append("change.items 가 비었다")
        else:
            for i, it in enumerate(items):
                # 변화 항목은 value 대신 delta·from·to 를 갖는다
                _check_value("change.items[%d]" % i, it, errors, has_value=False)
                for f in ("delta", "from", "to"):
                    if f not in it:
                        errors.append("change.items[%d].%s 가 없다" % (i, f))

    ano = packet.get("anomaly")
    if ano is not None:
        base = ano.get("baseline") if isinstance(ano, dict) else None
        if not isinstance(base, dict) or not all(_nonempty(base.get(k)) for k in ("name", "source", "period")):
            errors.append("anomaly.baseline 은 {name, source, period} 를 모두 적는다 — 평년 출처 없는 이상값 금지")
        items = ano.get("items") if isinstance(ano, dict) else None
        if not isinstance(items, list) or not items:
            errors.append("anomaly.items 가 비었다")
        else:
            for i, it in enumerate(items):
                for f in ("key", "value", "baseline", "delta", "unit"):
                    if f not in it:
                        errors.append("anomaly.items[%d].%s 가 없다" % (i, f))

    for name in ("conditions", "related"):
        sec = packet.get(name)
        if sec is None:
            continue
        if not isinstance(sec, list) or not sec:
            errors.append("%s 는 비지 않은 목록이다" % name)
            continue
        for i, it in enumerate(sec):
            if not isinstance(it, dict):
                errors.append("%s[%d] 가 객체가 아니다" % (name, i))
                continue
            if name == "conditions":
                for f in ("key", "kind", "source"):
                    if not _nonempty(it.get(f)):
                        errors.append("conditions[%d].%s 가 없다" % (i, f))
                if "value" not in it:
                    errors.append("conditions[%d].value 가 없다" % i)
                if it.get("kind") not in EVIDENCE_KIND:
                    errors.append("conditions[%d].kind 가 EVIDENCE_KIND 밖이다: %r" % (i, it.get("kind")))
            else:
                rid = it.get("phenomenonId")
                if not (isinstance(rid, str) and _PHENOMENON_ID.match(rid)):
                    errors.append("related[%d].phenomenonId 모양이 아니다" % i)
                elif known_phenomena is not None and rid not in known_phenomena:
                    errors.append("related[%d] 가 정본에 없는 현상이다: %s" % (i, rid))
                if it.get("relation") not in RELATION:
                    errors.append("related[%d].relation 은 %s 중 하나다: %r" % (i, "/".join(RELATION), it.get("relation")))
                if not it.get("evidence"):
                    errors.append("related[%d].evidence 가 없다 — 근거 없는 연결 금지" % i)
            for text in _strings(it):
                hits = causal_hits(text)
                if hits:
                    errors.append("%s[%d] 에 인과 어휘 %s (J-3)" % (name, i, hits))

    nxt = packet.get("next")
    if nxt is not None:
        items = nxt.get("items") if isinstance(nxt, dict) else None
        if not isinstance(items, list) or not items:
            errors.append("next.items 가 비었다 — 결과가 없으면 절을 뺀다(빈 NEXT 카드 금지)")
        else:
            for i, it in enumerate(items):
                typ = it.get("type")
                if typ not in NEXT_TYPE:
                    errors.append("next.items[%d].type 은 A/B/C/D 다: %r" % (i, typ))
                    continue
                if it.get("kind") not in NEXT_TYPE[typ]["kinds"]:
                    errors.append("next.items[%d].kind %r 는 유형 %s 가 허용하지 않는다 %s"
                                  % (i, it.get("kind"), typ, NEXT_TYPE[typ]["kinds"]))
                if not _nonempty(it.get("source")):
                    errors.append("next.items[%d].source 가 없다" % i)
                if not _is_iso(it.get("issuedAt")):
                    errors.append("next.items[%d].issuedAt 이 없다" % i)
                if typ == "C" and not _nonempty(it.get("runRef")):
                    errors.append("next.items[%d]: 유형 C(시뮬)는 runRef 를 단다 (계약 §E)" % i)
                for text in _strings(it):
                    hits = causal_hits(text)
                    if hits:
                        errors.append("next.items[%d] 에 인과 어휘 %s" % (i, hits))

    imp = packet.get("importance")
    if imp is not None:
        if not isinstance(imp, dict) or not isinstance(imp.get("reasons"), list):
            errors.append("importance.reasons 는 목록이다")
        elif "score" in imp:
            errors.append("importance 에 score 가 있다 — 중요도는 점수가 아니다")

    conf = packet.get("confidence")
    if conf is not None:
        if not isinstance(conf, dict) or conf.get("grade") not in CONFIDENCE_GRADE:
            errors.append("confidence.grade 는 %s 중 하나다" % "/".join(CONFIDENCE_GRADE))
        if not _nonempty(((conf or {}).get("inputs") or {}).get("formula_id")):
            errors.append("confidence.inputs.formula_id 가 없다 — normalize() 가 절을 뺀다 (J-2)")

    srcs = packet.get("sources")
    if not isinstance(srcs, list) or not srcs:
        errors.append("sources 가 비었다 — EVIDENCE 절은 항상 최소 출처를 갖는다")
    else:
        for i, s in enumerate(srcs):
            if not isinstance(s, dict) or not _nonempty(s.get("id")):
                errors.append("sources[%d].id 가 없다" % i)
                continue
            if s.get("kind") not in EVIDENCE_KIND:
                errors.append("sources[%d].kind 가 EVIDENCE_KIND 밖이다: %r" % (i, s.get("kind")))
            for f in ("ageMin", "slaMin"):
                if s.get(f) is not None and not isinstance(s.get(f), (int, float)):
                    errors.append("sources[%d].%s 는 숫자다" % (i, f))
    return errors


def check(packet, *, known_phenomena=None):
    """수리 뒤 검사. (수리된 사본, 위반 목록)."""
    fixed = normalize(packet)
    return fixed, validate(fixed, known_phenomena=known_phenomena)


def require_valid(packet, *, known_phenomena=None):
    """쓰기 직전의 문. 위반이 하나라도 있으면 던진다 — 부분만 쓰지 않는다."""
    fixed, errors = check(packet, known_phenomena=known_phenomena)
    if errors:
        raise IntelContractError("인텔 패킷 계약 위반 %d건: %s" % (len(errors), "; ".join(errors[:8])))
    return fixed


def section_status(packet, intel_section):
    """INTELLIGENCE 5절 하나의 상태 (LAYER-PLAN §2.2 규칙).

    패킷이 없으면 not_evaluable, 그 절의 재료가 하나라도 있으면 available,
    재료가 전부 coverage.missing 에 있으면 not_available(+이유).
    """
    if intel_section not in INTEL_SECTIONS:
        raise KeyError(intel_section)
    if not isinstance(packet, dict):
        return {"status": "not_evaluable", "reason": None}
    parts = INTEL_SECTIONS[intel_section]
    if intel_section == "EVIDENCE":
        return {"status": "available", "reason": None} if packet.get("sources") else \
            {"status": "not_evaluable", "reason": None}
    if any(p in packet for p in parts):
        return {"status": "available", "reason": None}
    reasons = [m.get("reason") for m in (packet.get("coverage") or {}).get("missing", [])
               if isinstance(m, dict) and m.get("section") in parts]
    return {"status": "not_available", "reason": "; ".join(r for r in reasons if r) or None}


def narrator_view(packet):
    """서술자에게 넘기는 모양 (계약 §C-1).

    넘긴다: 절들 · confidence.grade · 특보 메타 · ageMin/slaMin
    넘기지 않는다: coverage.missing 에 있는 절(이미 빠져 있다) · confidence 내부 수치·가중치
    """
    fixed = require_valid(packet)
    view = {k: copy.deepcopy(v) for k, v in fixed.items() if k != "confidence"}
    if "confidence" in fixed:
        view["confidence"] = {"grade": fixed["confidence"]["grade"]}
    view["missingSections"] = sorted({m["section"] for m in (fixed.get("coverage") or {}).get("missing", [])})
    view.pop("coverage", None)
    return view


def json_schema():
    """JSON Schema(2020-12) — 구조만. 어휘 교차 규칙(J-2·J-3·missing 대조)은 validate() 가 한다."""
    kind = {"enum": list(EVIDENCE_KIND)}
    iso = {"type": "string", "pattern": _ISO.pattern}
    value = {"type": "object", "required": ["key", "value", "unit", "kind", "source", "at"],
             "properties": {"key": {"type": "string", "minLength": 1}, "value": {},
                            "unit": {"type": "string", "minLength": 1}, "kind": kind,
                            "source": {"type": "string", "minLength": 1}, "at": iso}}
    return {
        "$schema": "https://json-schema.org/draft/2020-12/schema",
        "$id": "https://earthus.net/contracts/intel-packet-v1.schema.json",
        "title": "EARTHUS 인텔 패킷 v1",
        "description": "생성: python aws/_shared/intel_contract.py --export-schema. 손으로 고치지 않는다.",
        "type": "object",
        "required": ["schema", "phenomenonId", "time", "sources"],
        "additionalProperties": False,
        "properties": {
            "schema": {"const": SCHEMA_VERSION},
            "phenomenonId": {"type": "string", "pattern": _PHENOMENON_ID.pattern},
            "eventId": {"type": ["string", "null"]},
            "time": {"type": "object", "required": ["retrievedAt"],
                     "properties": {"observedAt": iso, "issuedAt": iso, "retrievedAt": iso}},
            "current": {"type": "object", "required": ["values"],
                        "properties": {"values": {"type": "array", "minItems": 1, "items": value}}},
            "change": {"type": "object", "required": ["items"],
                       "properties": {"windows": {"type": "object"},
                                      "items": {"type": "array", "minItems": 1}}},
            "anomaly": {"type": "object", "required": ["baseline", "items"],
                        "properties": {"baseline": {"type": "object", "required": ["name", "source", "period"]},
                                       "items": {"type": "array", "minItems": 1}}},
            "pattern": {"type": "object"},
            "conditions": {"type": "array", "minItems": 1,
                           "items": {"type": "object", "required": ["key", "value", "kind", "source"],
                                     "properties": {"kind": kind}}},
            "related": {"type": "array", "minItems": 1,
                        "items": {"type": "object", "required": ["phenomenonId", "relation", "evidence"],
                                  "properties": {"relation": {"enum": list(RELATION)}}}},
            "next": {"type": "object", "required": ["items"],
                     "properties": {"items": {"type": "array", "minItems": 1,
                                              "items": {"type": "object",
                                                        "required": ["type", "kind", "source", "issuedAt"],
                                                        "properties": {"type": {"enum": sorted(NEXT_TYPE)},
                                                                       "kind": kind, "issuedAt": iso,
                                                                       "runRef": {"type": "string"}}}}}},
            "importance": {"type": "object", "required": ["reasons"],
                           "not": {"required": ["score"]}},
            "confidence": {"type": "object", "required": ["grade", "inputs"],
                           "properties": {"grade": {"enum": list(CONFIDENCE_GRADE)},
                                          "inputs": {"type": "object", "required": ["formula_id"]}}},
            "uncertainty": {"type": "object"},
            "sources": {"type": "array", "minItems": 1,
                        "items": {"type": "object", "required": ["id", "kind"],
                                  "properties": {"kind": kind, "ageMin": {"type": ["number", "null"]},
                                                 "slaMin": {"type": ["number", "null"]}}}},
            "coverage": {"type": "object",
                         "properties": {"missing": {"type": "array",
                                                    "items": {"type": "object", "required": ["section", "reason"],
                                                              "properties": {"section": {"enum": list(PACKET_SECTIONS)}}}}}},
        },
    }


def export_schema(path=None):
    text = json.dumps(json_schema(), ensure_ascii=False, indent=2) + "\n"
    with open(path or SCHEMA_PATH, "w", encoding="utf-8", newline="\n") as handle:
        handle.write(text)
    return path or SCHEMA_PATH


if __name__ == "__main__":
    import sys
    if "--export-schema" in sys.argv:
        print(export_schema())
