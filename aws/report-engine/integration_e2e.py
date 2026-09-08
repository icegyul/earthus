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
import social_publish as sposts      # noqa: E402
import report_period as rp           # noqa: E402
import governance as gov             # noqa: E402


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

E2E_VERSION = "earthus.integration-e2e/1.1.0"


def _adapter_for(platform):
    """배포 엔진의 어댑터를 그대로 쓴다(고치지 않는다).

    MOCK 모드 — 실제로 아무 데도 보내지 않는다. 그리고 MOCK 은 **발행이 아니다**:
    social_publish.verify_published 가 mock 을 확인된 발행으로 세지 않는다(§8).
    """
    mod = _load("earthus_sns_adapters", os.path.join(_DIST, "sns_adapters", "__init__.py"))
    return mod.get(platform, mod.MODE_MOCK)


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
    top_story_id = None
    for sid in report.get("topStoryIds") or []:
        st = next((s for s in report.get("stories") or [] if s["storyId"] == sid), None)
        if st and st.get("factIds"):
            top_story_id = sid
            break
    cap_req = cap.request_for_fact(top_fact) if top_fact else None
    visual_assets = []
    if cap_req and capture_meta and os.path.exists(capture_meta):
        with open(capture_meta, encoding="utf-8") as fh:
            observed_doc = json.load(fh)
        # §1 — 여섯 조건을 전부 본다. 캡처 기록(픽셀검사·되읽기·해시)까지 넘긴다.
        verification = cap.verify_capture(cap_req, observed_doc.get("observed") or {},
                                          capture_doc=observed_doc)
        asset = cap.asset_metadata(
            cap_req, asset_id="vis:%s:earth" % report["reportId"].replace(":", "_"),
            captured_at=observed_doc.get("capturedAt"),
            dataset_snapshot=report.get("dataSnapshotId"),
            verification=verification,
            canvas=observed_doc.get("canvas"),
            file_ref=observed_doc.get("fileRef"),
            capture_doc=observed_doc,
            story_id=top_story_id)
        visual_assets.append(asset)
        failed = [k for k, v in (verification.get("conditions") or {}).items() if not v]
        step("VISUAL", verification["verified"],
             "캡처 %s · 조건 %d/6" % (observed_doc.get("fileRef") or "?",
                                      6 - len(failed)),
             problems=verification["problems"], failedConditions=failed)
    else:
        step("VISUAL", False,
             "캡처 결과가 없다 — tools/earthus_capture.mjs 를 먼저 돌린다",
             request=bool(cap_req))

    # §10 — **확인되지 않은 자산은 어디에도 쓰지 않는다.** 리포트·콘텐츠·페이로드 전부.
    verified_assets = [a for a in visual_assets if a.get("verified")]
    rejected_assets = [a for a in visual_assets if not a.get("verified")]
    # ⚠️ 예전 조건은 `not rejected or bool(verified)` 였다 — 자산이 **하나도 없으면**
    #    참이 된다. 캡처를 요청해 놓고 아무것도 못 얻었는데 문이 열리는 셈이다(§8).
    #    확인된 것이 여덟 조건을 실제로 넘는지도 같이 본다.
    gate_visuals = gov.public_visuals_check(verified_assets)
    gate_ok = (not rejected_assets
               and (bool(verified_assets) or not cap_req)
               and gate_visuals["ok"])
    step("VISUAL_GATE", gate_ok,
         "확인 %d · 제외 %d" % (len(verified_assets), len(rejected_assets)),
         rejected=[a.get("assetId") for a in rejected_assets],
         publicChecks=gate_visuals["code"],
         problems=[p for r in gate_visuals["assets"] for p in r["problems"]][:5])
    # 매니페스트에는 실패한 것도 남긴다(왜 그림이 없는지 알아야 하므로).
    # 다만 내보내기·콘텐츠는 verified 인 것만 쓴다 — export._visual_html 이 그걸 거른다.
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

    # §2 · §9 — 연결 사슬을 콘텐츠에 싣는다. 어느 보고서의 어느 이야기에서 왔는지
    # 되짚을 수 있어야 한다. 시각자산은 **확인된 것만** 붙인다(§10).
    content["visualAssetIds"] = [a["assetId"] for a in verified_assets]
    content["storyIds"] = [top_story_id] if top_story_id else []
    content["factIds"] = sorted({fid for a in verified_assets for fid in (a.get("factRefs") or [])})
    content["sourceRoute"] = (verified_assets[0].get("sourceRoute")
                              if verified_assets else None)

    # ── 6. 단일 팩트 규칙 대조 (§16 · §33)
    cmp_ = compare_report_and_content(report, content)
    step("SINGLE_FACT", cmp_["ok"], "리포트 팩트 숫자 %d · 콘텐츠 숫자 %d"
         % (cmp_["reportFactNumbers"], cmp_["contentNumbers"]), problems=cmp_["problems"])

    # ── 7. SNS DRAFT → 플랫폼 페이로드
    content = dist_gen.with_platforms(content, list(platforms))
    made = sorted(content.get("platformVersions") or {})
    step("SNS_PAYLOAD", bool(made), "판 %s" % (", ".join(made) or "없음"),
         problems=content.get("platformProblems"))

    # ── 8. 준비 판정 (§13) — 확인 안 된 시각자산이 붙어 있으면 준비된 게 아니다
    ready = sposts.readiness(content, visual_assets=visual_assets, report=report)
    step("CONTENT_READY", ready["state"] == "PAYLOAD_READY",
         "상태 %s" % ready["state"], problems=ready["problems"])

    # ── 9. 승인 (§6) — 페이로드 준비는 승인이 아니다.
    #    이 파이프라인에는 **자동 승인 경로가 없다.** 사람이 관리 화면에서 승인해야 한다.
    appr = sposts.approval_state(content)
    step("APPROVAL", appr in ("PAYLOAD_READY", "APPROVED"),
         "%s — 사람 승인 전이면 여기서 멈춘다(자동 승인 경로 없음)" % appr,
         approvalState=appr)

    # ── 10. 게시 (§7 · §8) — 승인·자격증명·되읽기를 전부 통과해야 PUBLISHED
    pub_results = []
    for p in made:
        try:
            adapter = _adapter_for(p)
        except Exception as e:                      # noqa: BLE001
            pub_results.append({"platform": p, "state": "FAILED",
                                "reason": "어댑터를 얻지 못했다: %s" % str(e)[:120]})
            continue
        pub_results.append(sposts.publish_platform(
            content, p, adapter, actor=None, at=report.get("generatedAt"),
            visual_assets=visual_assets, confirmed=False))
    summary = sposts.publication_summary(pub_results)
    published = bool(summary["published"])
    # 게시되지 않은 것이 **정상**이다 — 승인도 자격증명도 없다.
    #
    # ⚠️⚠️ 그렇다고 이 단계를 무조건 통과시키면 안 된다(INTEGRATION-3 §4).
    #    예전에는 step("PUBLISH", True, …) 로 못박혀 있었다. 그러면 자격증명이 하나도
    #    없는 환경에서도 E2E 가 PASS 를 찍는다 — "막혔다"가 "됐다"로 읽힌다.
    #    통과 조건을 명시한다:
    #      · 올라갔다고 적힌 것은 전부 되읽기를 통과했어야 하고,
    #      · 안 올라간 것은 **막힌 이유가 설명돼야** 한다.
    EXPECTED_BLOCKS = ("NOT_READY", "PAYLOAD_READY", "STATUS_ONLY",
                       "APPROVAL_INVALID", "REJECTED")
    lying = [r for r in pub_results
             if r.get("state") == "PUBLISHED"
             and not (r.get("readBack") or {}).get("verified")]
    unexplained = [r for r in pub_results
                   if r.get("state") not in ("PUBLISHED",) + EXPECTED_BLOCKS
                   and r.get("reason") != sposts.BLOCKED_NO_CREDENTIALS]
    step("PUBLISH", not lying and not unexplained,
         "상태 %s · 실제 발행 %d건" % (summary["counts"], len(summary["published"])),
         results=[{k: r.get(k) for k in ("platform", "state", "reason")} for r in pub_results],
         unverifiedClaims=[r.get("platform") for r in lying],
         unexplained=[r.get("platform") for r in unexplained])

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
        "publishState": ("PUBLISHED" if published else "PAYLOAD_READY_NOT_PUBLISHED"),
        "publication": summary,
        "readiness": ready,
        "approvalState": appr,
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
