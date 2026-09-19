# -*- coding: utf-8 -*-
"""현상 인텔 어댑터 — INTELLIGENCE-LAYER-PLAN P5 (`phenomenon-intel` 종류).

인텔 패킷 v1 한 개(aws/_shared/intel_contract.py) → 리포트 팩트 · 절 재료 · 자료 스냅샷.

⚠️ 새 값을 계산하지 않는다. 패킷에 있는 값을 팩트 봉투(report_contract.make_fact)로 옮길 뿐이다.
   패킷에 없는 숫자는 보고서에도 없다 — 서술 검증이 문장의 숫자를 **그 문장이 가리키는 팩트**
   에서만 허용한다(narrative.validate_report_narrative).
⚠️ coverage.missing 에 있는 절은 채우지 않는다. 빠졌다는 사실과 패킷이 적은 이유를 그대로 싣는다.
⚠️ 계약을 어긴 패킷으로는 보고서를 만들지 않는다(require_valid). 부분만 옮기지 않는다.
⚠️ pattern · 예보 항목의 속 모양은 계약이 정하지 않았다. 잎 값만 옮기고 **단위·종류를 짐작해
   붙이지 않는다**(unit=None, truthType=None) — 패킷이 적지 않은 것을 보고서가 적지 않는다.
⚠️ 사건 이름(예: 태풍 이름)은 패킷에 없다. 제목·절에 넣지 않는다 — 숫자뿐 아니라 이름도 패킷에서만.

어디서 온 패킷인가
  태풍 패킷은 따로 파일이 없고 사건 패킷 **안에** 실린다(aws/cyclone-analog/intel_v1.py 머리말):
  ocean/cyclone-events/{id}.json 의 `intel`. 그래서 기본 출처 키는 그 자리다.
  다른 현상은 출처 키를 모른다 — 모르면 만들지 않는다(재현할 수 없는 보고서가 된다).
"""
import hashlib
import json
import os
import re
import sys
from datetime import datetime, timezone

sys.path.insert(0, os.path.join(
    os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__)))), "_shared"))

import intel_contract as ic            # noqa: E402
import phenomenon_registry as reg      # noqa: E402
import report_contract as rc           # noqa: E402

KIND = "phenomenon-intel"              # reportId 네임스페이스 — {kind}:{sourceId}
REPORT_TYPE = "PHENOMENON_INTEL"
PACKET_SCHEMA = "intel-packet-v1"
EVENT_PACKET_KEY = "ocean/cyclone-events/{id}.json#intel"

# 사람이 읽는 글이지 값이 아닌 잎. 팩트로 만들지 않고 절의 줄(rows)로 싣는다.
TEXT_KEYS = ("note", "noteKo", "noteEn", "rule", "citation")
# 예보 항목에서 '누가·언제·어떤 근거로' 는 값이 아니라 항목의 머리다.
NEXT_HEAD_KEYS = ("type", "kind", "source", "issuedAt", "runRef")

_SLUG = re.compile(r"[^0-9A-Za-z._-]+")


class IntelReportError(ValueError):
    """패킷으로 보고서를 만들 수 없다 — 이유를 말한다."""


# ── 패킷 ────────────────────────────────────────────────────────────────────
def load(packet):
    """계약을 통과한 사본. 어기면 intel_contract.IntelContractError 를 던진다.

    현상 id 는 정본 레지스트리에 있는 것만 받는다 — 보고서에서 현상으로 가야 한다(§20).
    """
    return ic.require_valid(packet, known_phenomena=set(reg.phenomenon_ids()))


def unwrap(doc):
    """인텔 패킷이거나, intel 을 품은 사건 패킷이거나. 둘 다 아니면 None."""
    if isinstance(doc, dict) and doc.get("schema") == ic.SCHEMA_VERSION and doc.get("phenomenonId"):
        return doc
    inner = doc.get("intel") if isinstance(doc, dict) else None
    if isinstance(inner, dict) and inner.get("schema") == ic.SCHEMA_VERSION:
        return inner
    return None


def _utc(iso):
    """ISO → UTC datetime. 날짜만 있으면 그날 00:00 UTC 로 읽는다."""
    s = str(iso).strip()
    if len(s) == 10:
        s += "T00:00:00+00:00"
    dt = datetime.fromisoformat(s.replace("Z", "+00:00"))
    if dt.tzinfo is None:
        dt = dt.replace(tzinfo=timezone.utc)
    return dt.astimezone(timezone.utc)


def utc_iso(iso):
    return _utc(iso).strftime("%Y-%m-%dT%H:%M:%SZ")


def issued_at(packet):
    t = packet.get("time") or {}
    return t.get("issuedAt") or t.get("retrievedAt")


def source_id(packet):
    """보고서의 원천 id — 현상 · 사건 · 발표 회차.

    ⚠️ 콜론을 남기지 않는다. 사건 id(cyclone:1001322)의 콜론을 그대로 두면 reportId 에
       콜론이 둘이 되고, 파이썬(전부 치환)과 앱(첫 콜론만 치환)이 서로 다른 키를 본다.
    """
    parts = [packet["phenomenonId"]]
    if packet.get("eventId"):
        parts.append(_SLUG.sub("-", str(packet["eventId"])).strip("-"))
    parts.append(_utc(issued_at(packet)).strftime("%Y%m%dT%H%MZ"))
    return ".".join(parts)


def report_id(packet):
    rid = "%s:%s" % (KIND, source_id(packet))
    if rid.count(":") != 1:
        raise IntelReportError("reportId 에 콜론이 하나가 아니다: %s" % rid)
    return rid


def period(packet):
    """관측 시각부터 받은 시각까지. 둘 다 UTC 로 맞춘다(문자열 비교가 시간 비교가 되게)."""
    t = packet.get("time") or {}
    start = t.get("observedAt") or t.get("issuedAt") or t.get("retrievedAt")
    return {"from": utc_iso(start), "to": utc_iso(t.get("retrievedAt"))}


def default_packet_ref(packet):
    """운영에서 이 패킷이 사는 자리. 모르면 None — 짐작해 적지 않는다."""
    eid = str(packet.get("eventId") or "")
    if packet.get("phenomenonId") == "hazards.typhoon" and eid.startswith("cyclone:"):
        return EVENT_PACKET_KEY.format(id=eid.split(":", 1)[1])
    return None


def checksum(packet):
    blob = json.dumps(packet, ensure_ascii=False, sort_keys=True, separators=(",", ":"))
    return hashlib.sha256(blob.encode("utf-8")).hexdigest()


def missing_reasons(packet):
    """패킷 절 → coverage.missing 의 이유(패킷이 적은 문장 그대로)."""
    out = {}
    for m in (packet.get("coverage") or {}).get("missing") or []:
        if isinstance(m, dict) and m.get("section"):
            out.setdefault(m["section"], []).append(m.get("reason"))
    return {k: "; ".join(r for r in v if r) for k, v in out.items()}


# ── 팩트 ────────────────────────────────────────────────────────────────────
def _leaves(node, prefix=""):
    """중첩 dict 의 잎 (경로, 값). 목록은 통째로 하나의 잎이다."""
    if isinstance(node, dict):
        for k, v in node.items():
            path = "%s.%s" % (prefix, k) if prefix else str(k)
            if isinstance(v, dict):
                yield from _leaves(v, path)
            else:
                yield path, str(k), v
    return


def build_facts(packet, *, source_id_, packet_ref):
    """패킷 값 → ReportFact. 돌려주는 것: (facts, by_part{패킷 절: [factId]}).

    coverage.missing 에 있는 절은 패킷에 없으므로 여기서 팩트가 생길 수 없다 —
    그 사실을 generator.validate_report 가 한 번 더 본다.
    """
    pid, eid = packet["phenomenonId"], packet.get("eventId")
    layers = [k for k in [reg.representative_layer_for(pid)] if k]
    base = "fact:%s" % source_id_
    facts, by_part, seen = [], {}, set()

    def add(part, metric, value, *, unit=None, kind=None, source=None, at=None,
            comparison=None, suffix=None):
        if value is None:            # 값이 없으면 팩트를 만들지 않는다(make_fact 규칙)
            return
        fid = "%s:%s:%s" % (base, part, suffix or metric)
        n = 2
        while fid in seen:
            fid = "%s:%s:%s#%d" % (base, part, suffix or metric, n)
            n += 1
        seen.add(fid)
        facts.append(rc.make_fact(
            fact_id=fid, phenomenon_id=pid, metric=metric, value=value, unit=unit,
            period=at, source=source, truth_type=kind, comparison=comparison,
            evidence_refs=[packet_ref], event_id=eid, layer_refs=layers))
        by_part.setdefault(part, []).append(fid)

    for v in (packet.get("current") or {}).get("values") or []:
        add("current", v["key"], v.get("value"), unit=v.get("unit"), kind=v.get("kind"),
            source=v.get("source"), at=v.get("at"))

    chg = packet.get("change") or {}
    since = (chg.get("windows") or {}).get("since")
    for it in chg.get("items") or []:
        # 이름을 `{key}.delta` 로 둔다 — 'maxWind 3 m/s' 로 적으면 표에서 최대풍속이 3 m/s 로 읽힌다.
        add("change", "%s.delta" % it["key"], it.get("delta"), unit=it.get("unit"), kind=it.get("kind"),
            source=it.get("source"), at=it.get("at"),
            comparison={"from": it.get("from"), "to": it.get("to"),
                        "since": it.get("since") or since})

    ano = packet.get("anomaly") or {}
    base_meta = ano.get("baseline") or {}
    for it in ano.get("items") or []:
        add("anomaly", it["key"], it.get("value"), unit=it.get("unit"), kind=it.get("kind"),
            source=base_meta.get("source"),
            comparison={"baseline": it.get("baseline"), "delta": it.get("delta"),
                        "percentile": it.get("percentile"),
                        "baselineName": base_meta.get("name"),
                        "baselinePeriod": base_meta.get("period")})

    for path, leaf, value in _leaves(packet.get("pattern") or {}):
        if leaf in TEXT_KEYS:
            continue
        add("pattern", path, value)

    for c in packet.get("conditions") or []:
        add("conditions", c["key"], c.get("value"), unit=c.get("unit"), kind=c.get("kind"),
            source=c.get("source"), at=c.get("at"))

    for i, it in enumerate((packet.get("next") or {}).get("items") or []):
        body = {k: v for k, v in it.items() if k not in NEXT_HEAD_KEYS}
        for path, leaf, value in _leaves(body):
            if leaf in TEXT_KEYS:
                continue
            add("next", path, value, kind=it.get("kind"), source=it.get("source"),
                at=it.get("issuedAt"), suffix="%d:%s" % (i, path))
    return facts, by_part


# ── 절의 줄(rows) — 값이 아니라 글·목록인 것 ───────────────────────────────────
_REL_KO = {
    # prototype/v2-three/js/intel-strip.js REL 과 같은 말. reference 는 어휘 정본의 고정 문구.
    "computed": ("계산된 연결", "computed link"),
    "co_located": ("같은 자리·같은 때", "same place, same time"),
    "reference": (ic.FIXED_TEXT["referenceRelation"]["ko"], ic.FIXED_TEXT["referenceRelation"]["en"]),
}


def build_rows(packet):
    """팩트가 되지 않는 패킷 내용 — 패킷 문장을 **그대로** 옮긴다. 줄마다 part 가 붙는다."""
    rows = []
    for path, leaf, value in _leaves(packet.get("pattern") or {}):
        if leaf in TEXT_KEYS and value:
            rows.append({"part": "pattern", "title": path, "text": value})
    for c in packet.get("conditions") or []:
        notes = {k: c[k] for k in ("noteKo", "noteEn") if c.get(k)}
        if notes:
            rows.append(dict({"part": "conditions", "title": c["key"]}, **notes))
    for i, it in enumerate((packet.get("next") or {}).get("items") or []):
        typ = it.get("type")
        rows.append({"part": "next", "title": it.get("source"), "item": i,
                     "type": typ, "typeKo": (ic.NEXT_TYPE.get(typ) or {}).get("ko"),
                     "kind": it.get("kind"), "issuedAt": it.get("issuedAt"),
                     "runRef": it.get("runRef")})
    for r in packet.get("related") or []:
        ko, en = _REL_KO.get(r.get("relation"), (r.get("relation"), r.get("relation")))
        row = {"part": "related", "title": r.get("phenomenonId"), "relation": r.get("relation"),
               "relationKo": ko, "relationEn": en}
        ev = r.get("evidence")
        if isinstance(ev, dict):
            for path, _leaf, value in _leaves(ev):
                row["evidence." + path] = value
        elif ev:
            row["evidence"] = ev
        rows.append(row)
    for s in packet.get("sources") or []:
        rows.append({"part": "sources", "title": s.get("id"), "kind": s.get("kind"),
                     "ageMin": s.get("ageMin"), "slaMin": s.get("slaMin"), "state": s.get("state")})
    conf = packet.get("confidence")
    if isinstance(conf, dict):
        # 등급과 산식 이름·규칙 문장만. 산식 입력 수치는 싣지 않는다(narrator_view 와 같은 경계).
        inputs = conf.get("inputs") or {}
        rows.append({"part": "confidence", "title": "confidence", "grade": conf.get("grade"),
                     "formulaId": inputs.get("formula_id"), "rule": inputs.get("rule")})
    unc = packet.get("uncertainty")
    if isinstance(unc, dict):
        # null 도 줄로 남긴다 — 패킷이 '없다(null)' 고 적은 것은 없는 것이지 빠뜨린 것이 아니다.
        for path, leaf, value in _leaves(unc):
            if leaf in TEXT_KEYS:
                rows.append({"part": "uncertainty", "title": path, "text": value})
            elif value is None:
                rows.append({"part": "uncertainty", "title": path, "value": None, "absent": True})
            else:
                rows.append({"part": "uncertainty", "title": path, "value": value})
    imp = packet.get("importance")
    if isinstance(imp, dict):
        # 중요도는 점수가 아니라 이유 목록이다(계약) — 숫자 팩트로 만들지 않는다.
        for reason in imp.get("reasons") or []:
            rows.append({"part": "importance", "title": "reason", "text": reason})
        if imp.get("note"):
            rows.append({"part": "importance", "title": "note", "text": imp["note"]})
    for sec, reason in sorted(missing_reasons(packet).items()):
        rows.append({"part": "coverage", "title": sec, "reasonKo": reason})
    return rows


# ── 자료 스냅샷 ─────────────────────────────────────────────────────────────
def snapshot(packet, *, source_id_, packet_ref, created_at):
    """무엇을 보고 만들었나. 패킷 한 개 + 패킷이 적은 출처들.

    출처 상태는 패킷 생산자와 **같은 규칙**(ageMin > slaMin 이면 늙었다 — intel_v1.py)으로 옮긴다.
    """
    t = packet.get("time") or {}
    rows = [{"ref": packet_ref, "sourceVersion": PACKET_SCHEMA,
             "observedAt": t.get("observedAt"), "retrievedAt": t.get("retrievedAt"),
             "checksum": checksum(packet), "state": "AVAILABLE"}]
    for s in packet.get("sources") or []:
        age, sla = s.get("ageMin"), s.get("slaMin")
        stale = isinstance(age, (int, float)) and isinstance(sla, (int, float)) and age > sla
        rows.append({"ref": s.get("id"), "state": "STALE" if stale else "AVAILABLE"})
    return rc.make_data_snapshot(snapshot_id="snapshot:%s" % source_id_,
                                 created_at=created_at, datasets=rows)
