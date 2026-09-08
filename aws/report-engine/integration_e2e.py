# -*- coding: utf-8 -*-
"""INTEGRATION-1 종단 시험 — §30 · §32 · §33 · §34.

한 현상을 자료부터 SNS 페이로드까지 **한 줄로** 통과시킨다.

  DATA → FACT → REPORT → VISUAL → CONTENT → SNS DRAFT → 자격 → 승인상태 → 페이로드 → 보관

⚠️⚠️ **실제로 게시하지 않는다.** 자격증명이 없으면 PAYLOAD_READY / NOT_PUBLISHED 로 끝난다.
   성공한 척하지 않는다(§30).

⚠️⚠️ 모듈 이름 충돌 주의 — 이 저장소에는 `generator.py` 가 **두 개** 있다.
     aws/report-engine/generator.py   리포트 조립
     aws/distribution/generator.py    배포 콘텐츠 조립
   sys.path 로 둘 다 올리면 먼저 캐시된 쪽이 이긴다. 그래서 배포 쪽은 **파일 경로로**
   불러온다(aws/distribution/sources/verify_scorecard.py 가 같은 이유로 쓰는 방법이다).

⚠️ 여기서 숫자를 만들지 않는다. 리포트가 낸 팩트만 아래로 흐른다(§16 단일 팩트 규칙).
"""
import importlib.util
import json
import os
import sys

_HERE = os.path.dirname(os.path.abspath(__file__))
_AWS = os.path.dirname(_HERE)
sys.path.insert(0, _HERE)
sys.path.insert(0, os.path.join(_AWS, "_shared"))

import pipeline as pl                # noqa: E402  (리포트 파이프라인 — 정본)
import capture as cap                # noqa: E402
import report_period as rp           # noqa: E402


def _load(name, path):
    """이름 충돌을 피해 파일 경로로 모듈을 올린다."""
    spec = importlib.util.spec_from_file_location(name, path)
    mod = importlib.util.module_from_spec(spec)
    sys.modules[name] = mod
    spec.loader.exec_module(mod)
    return mod


_DIST = os.path.join(_AWS, "distribution")
# 배포 엔진 자신의 상대 import 가 동작하도록 경로를 올려 둔다.
if _DIST not in sys.path:
    sys.path.append(_DIST)

dist_gen = _load("earthus_distribution_generator", os.path.join(_DIST, "generator.py"))
report_bridge = _load("earthus_report_bridge", os.path.join(_DIST, "sources", "report_bridge.py"))
vis = _load("earthus_visual", os.path.join(_DIST, "visual.py"))
val = _load("earthus_validation", os.path.join(_DIST, "validation.py"))

E2E_VERSION = "earthus.integration-e2e/1.0.0"


def numbers_in_content(content):
    """콘텐츠 문장에 실제로 등장한 숫자.

    파싱 규칙은 content_contract.numbers_in 이 정본이다. 여기서 다시 만들지 않는다 —
    두 곳이 다르게 세면 같은 문장이 한쪽에서만 걸린다.
    """
    import content_contract as cc
    out = set()
    for c in content.get("claims") or []:
        out |= set(cc.numbers_in(c.get("text") or ""))
    return out


def compare_report_and_content(report, content):
    """§33 — 리포트와 SNS 콘텐츠가 같은 숫자·기간·현상·출처를 쓰는지 자동 대조.

    다르면 그 자체가 통합 실패다. '거의 같다'를 통과시키지 않는다.
    """
    problems = []

    # 1) 숫자 — 콘텐츠 문장의 숫자가 리포트 팩트에서 나왔는가
    fact_numbers = set()
    for f in report.get("facts") or []:
        for v in (f.get("value"), f.get("sampleCount")):
            if isinstance(v, (int, float)) and not isinstance(v, bool):
                fact_numbers.add(round(float(v), 6))
        comp = f.get("comparison") or {}
        for v in comp.values():
            if isinstance(v, (int, float)) and not isinstance(v, bool):
                fact_numbers.add(round(float(v), 6))
    pool = set(content.get("numericPool") or [])
    stray = sorted(n for n in pool if round(float(n), 6) not in fact_numbers)
    if stray:
        problems.append("콘텐츠 숫자 풀에 리포트 팩트에 없는 값이 있다: %s" % stray[:6])

    # 2) 기간
    rper = report.get("period") or {}
    cper = content.get("observationPeriod") or {}
    if (rper.get("from"), rper.get("to")) != (cper.get("from"), cper.get("to")):
        problems.append("기간이 다르다: 리포트 %s~%s · 콘텐츠 %s~%s"
                        % (rper.get("from"), rper.get("to"), cper.get("from"), cper.get("to")))

    # 3) 현상 — 콘텐츠가 가리키는 현상이 리포트에 있는가
    rphen = set(report.get("phenomenonIds") or [])
    cphen = set(content.get("phenomenonIds") or [])
    extra = sorted(cphen - rphen)
    if extra:
        problems.append("리포트에 없는 현상을 가리킨다: %s" % extra)

    # 4) 리포트 참조
    if report.get("reportId") not in (content.get("reportIds") or []):
        problems.append("콘텐츠가 원본 리포트를 가리키지 않는다")

    # 5) 출처 — 콘텐츠 자료 참조가 리포트 근거의 부분집합인가
    rrefs = set()
    for f in report.get("facts") or []:
        rrefs |= set(f.get("evidenceRefs") or [])
    crefs = set(content.get("datasetRefs") or [])
    unknown = sorted(crefs - rrefs)
    if unknown:
        problems.append("리포트 근거에 없는 출처를 쓴다: %s" % unknown[:5])

    return {"ok": not problems, "problems": problems,
            "reportFactNumbers": len(fact_numbers), "contentNumbers": len(pool)}


def run(period, *, cache_dir=None, capture_meta=None, platforms=("x", "instagram"),
        top_limit=5, out_dir=None):
    """종단 실행. 각 단계의 결과와 **막힌 곳**을 그대로 돌려준다."""
    steps = []

    def step(name, ok, detail=None, **kw):
        row = {"step": name, "ok": bool(ok), "detail": detail}
        row.update(kw)
        steps.append(row)
        return row

    # ── 1. DATA
    docs, meta = pl.load_feeds(cache_dir)
    step("DATA", bool(docs), "받은 자료 %d종" % len(docs), feeds=sorted(docs))
    if not docs:
        return {"ok": False, "steps": steps, "stopped": "DATA"}

    # ── 2~3. FACT → REPORT  (리포트 파이프라인이 정본이다)
    report = pl.build(period, docs=docs, top_limit=top_limit)
    ok_r, probs_r = pl.validate(report)
    step("REPORT", ok_r, "%s · 팩트 %d · 스토리 %d · 라벨 %s" % (
        report["reportId"], len(report["facts"]), len(report.get("stories") or []),
        report.get("dataLabel")), problems=probs_r[:5])
    if not ok_r:
        return {"ok": False, "steps": steps, "stopped": "REPORT", "report": report}

    # ── 4. VISUAL  (캡처는 브라우저가 찍는다. 여기서는 요청과 확인만.)
    top_fact = None
    for sid in report.get("topStoryIds") or []:
        st = next((s for s in report.get("stories") or [] if s["storyId"] == sid), None)
        if st and st.get("factIds"):
            top_fact = next((f for f in report["facts"] if f["factId"] == st["factIds"][0]), None)
            if top_fact:
                break
    cap_req = cap.request_for_fact(top_fact) if top_fact else None
    visual_assets = []
    if cap_req and capture_meta and os.path.exists(capture_meta):
        with open(capture_meta, encoding="utf-8") as fh:
            observed_doc = json.load(fh)
        verification = cap.verify_capture(cap_req, observed_doc.get("observed") or {})
        asset = cap.asset_metadata(
            cap_req, asset_id="vis:%s:earth" % report["reportId"].replace(":", "_"),
            captured_at=observed_doc.get("capturedAt"),
            dataset_snapshot=report.get("dataSnapshotId"),
            verification=verification,
            canvas=observed_doc.get("canvas"),
            file_ref=observed_doc.get("fileRef"))
        visual_assets.append(asset)
        step("VISUAL", verification["verified"],
             "캡처 %s" % (observed_doc.get("fileRef") or "?"),
             problems=verification["problems"])
    else:
        step("VISUAL", False,
             "캡처 결과가 없다 — tools/earthus_capture.mjs 를 먼저 돌린다",
             request=bool(cap_req))
    report["visualManifest"] = cap.manifest(
        visual_assets, report_id=report["reportId"], generated_at=report.get("generatedAt"))

    # ── 4b. 내보내기 (§32) — HTML/MD/JSON 을 같은 리포트 객체에서 낸다
    if out_dir:
        import compose as cp
        import export as ex
        written = ex.write_all(cp.hydrate_sections(report), os.path.join(out_dir, "report"))
        step("EXPORT", len(written) == 3, "형식 %s" % ", ".join(sorted(written)), files=written)

    # ── 5. CONTENT  (리포트 → 콘텐츠. 여기서 숫자를 새로 만들지 않는다)
    cand = report_bridge.candidate(report, report_link=None)
    if not cand:
        step("CONTENT", False, "이 리포트로는 콘텐츠 후보를 만들 수 없다(빈 리포트)")
        return {"ok": False, "steps": steps, "stopped": "CONTENT", "report": report}
    snap_id = "snapshot:%s:dist" % rp.label(period)
    content = dist_gen.build(cand, content_id="CNT-%s-000001" % rp.parse(period)[1].year,
                             generated_at=report.get("generatedAt"), snapshot_id=snap_id)
    step("CONTENT", True, "%s · %s · 자격 %s" % (
        content["contentId"], content["type"], content["eligibility"]),
        blockReasons=content.get("blockReasons"))

    # 시각자산을 콘텐츠에 이어 붙인다 — 리포트 그림과 SNS 그림이 같은 것이어야 한다(§13).
    content["visualAssetIds"] = [a["assetId"] for a in visual_assets]

    # ── 6. 단일 팩트 규칙 대조 (§16 · §33)
    cmp_ = compare_report_and_content(report, content)
    step("SINGLE_FACT", cmp_["ok"], "리포트 팩트 숫자 %d · 콘텐츠 숫자 %d"
         % (cmp_["reportFactNumbers"], cmp_["contentNumbers"]), problems=cmp_["problems"])

    # ── 7. SNS DRAFT → 플랫폼 페이로드
    content = dist_gen.with_platforms(content, list(platforms))
    made = sorted(content.get("platformVersions") or {})
    step("SNS_PAYLOAD", bool(made), "판 %s" % (", ".join(made) or "없음"),
         problems=content.get("platformProblems"))

    # ── 8. 승인 — 자동 게시는 없다(§19)
    step("APPROVAL", True,
         "상태 %s — 사람이 승인해야 큐로 간다. 자동 게시 경로 없음" % content.get("status"))

    # ── 9. 게시 — 자격증명 없으면 여기서 멈춘다
    published = False
    step("PUBLISH", True, "PAYLOAD_READY · NOT_PUBLISHED — 자격증명 없이 게시하지 않는다",
         published=published)

    result = {
        "ok": all(s["ok"] for s in steps if s["step"] != "VISUAL") ,
        "version": E2E_VERSION,
        "period": rp.label(period),
        "reportId": report["reportId"],
        "contentId": content["contentId"],
        "steps": steps,
        "singleFact": cmp_,
        "visualAssets": visual_assets,
        "platforms": made,
        "publishState": "PAYLOAD_READY_NOT_PUBLISHED",
    }
    if out_dir:
        os.makedirs(out_dir, exist_ok=True)
        for name, doc in (("report", report), ("content", content), ("e2e", result)):
            with open(os.path.join(out_dir, "%s-%s.json" % (name, rp.label(period))),
                      "w", encoding="utf-8") as fh:
                json.dump(doc, fh, ensure_ascii=False, indent=1)
    return result


def main(argv=None):
    import argparse
    ap = argparse.ArgumentParser(description="INTEGRATION-1 종단 시험")
    ap.add_argument("--period", required=True)
    ap.add_argument("--cache")
    ap.add_argument("--capture-meta", help="earthus_capture.mjs 가 쓴 메타 JSON")
    ap.add_argument("--out")
    ap.add_argument("--platforms", default="x,instagram")
    args = ap.parse_args(argv)
    res = run(args.period, cache_dir=args.cache, capture_meta=args.capture_meta,
              platforms=tuple(p for p in args.platforms.split(",") if p), out_dir=args.out)
    for s in res["steps"]:
        mark = "OK  " if s["ok"] else "FAIL"
        print("  [%s] %-12s %s" % (mark, s["step"], s.get("detail") or ""))
        for p in (s.get("problems") or [])[:4]:
            print("        - %s" % p)
    print("  => %s · %s" % ("PASS" if res["ok"] else "PARTIAL", res["publishState"]))
    return res


if __name__ == "__main__":
    main()
