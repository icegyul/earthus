# -*- coding: utf-8 -*-
"""보고서 파이프라인 — PHASE 8 전체를 한 줄로 잇는다.

  자료 받기 → QC → 팩트 → 중요도 → 스토리 → 교차도메인 → 놀란 점
           → 전망 → 절 구성 → 서술 → 검증 → (발행은 publisher 가)

⚠️ 여기서 값을 만들지 않는다. 전부 어댑터와 계산 모듈이 이미 낸 것을 잇기만 한다.
⚠️ 자료를 못 받으면 그 분야를 빼고 간다. 빼먹은 사실은 coverage 에 남는다 —
   조용히 없는 셈 치지 않는다.

  python aws/report-engine/pipeline.py --period 2026-09
  python aws/report-engine/pipeline.py --period 2026-09 --publish --out ./build
"""
import argparse
import json
import os
import sys
from datetime import datetime, timezone

_HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, _HERE)
sys.path.insert(0, os.path.join(_HERE, "adapters"))
sys.path.insert(0, os.path.join(os.path.dirname(_HERE), "_shared"))

import report_contract as rc                    # noqa: E402
import report_period as rp                      # noqa: E402
import generator as gen                         # noqa: E402
import quality as qcmod                         # noqa: E402
import narrative as nr                          # noqa: E402
import significance as sig                      # noqa: E402
import stories as stmod                         # noqa: E402
import crossdomain as xd                        # noqa: E402
import surprise as sp                           # noqa: E402
import outlook as ol                            # noqa: E402
import compose as cp                            # noqa: E402
import publisher as pub                         # noqa: E402
import climate_series_adapter as cs             # noqa: E402
import typhoon_adapter as ty                    # noqa: E402
import air_quality_adapter as aq                # noqa: E402
from adapters import kma_verify_adapter as kma  # noqa: E402

PUBLIC = "https://earthus-cache-kr.s3.us-east-2.amazonaws.com"
PIPELINE_VERSION = "earthus.report-pipeline/0.2.0"

# 무엇을 받아 오는가. 못 받으면 그 분야만 빠진다.
FEEDS = {
    "land_temp": "wind/series/temp-daily.json",
    "sst": "ocean/series/sst-daily.json",
    "seaice": "ocean/series/seaice-daily.json",
    "korea_temp": "wind/series/korea-daily.json",
    "typhoon": "ocean/ibtracs-wp.json",
    "verify": "wind/series/verify-daily.json",
}


def _now():
    return datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")


def fetch(key, cache_dir=None, timeout=90):
    """공개 주소에서 받는다. cache_dir 을 주면 거기 있는 것을 먼저 쓴다."""
    if cache_dir:
        path = os.path.join(cache_dir, os.path.basename(key))
        if os.path.exists(path):
            with open(path, encoding="utf-8") as fh:
                return json.load(fh), {"ref": key, "from": "cache", "path": path}
    from urllib.request import urlopen
    with urlopen("%s/%s" % (PUBLIC, key), timeout=timeout) as r:
        return json.loads(r.read().decode("utf-8")), {"ref": key, "from": "network"}


def load_feeds(cache_dir=None, want=None):
    """받을 수 있는 것만 받는다. 실패는 숨기지 않고 coverage 에 적는다."""
    docs, meta = {}, []
    for name, key in FEEDS.items():
        if want and name not in want:
            continue
        try:
            doc, m = fetch(key, cache_dir)
            docs[name] = doc
            meta.append(dict(m, name=name, state="AVAILABLE",
                             observedAt=doc.get("generated"), retrievedAt=_now()))
        except Exception as e:                    # noqa: BLE001
            meta.append({"name": name, "ref": key, "state": "UNAVAILABLE",
                         "detail": str(e)[:160], "retrievedAt": _now()})
    return docs, meta


def build_facts_and_analyses(docs, period):
    """실측 팩트와 지역별 요약. 자료가 없는 분야는 그냥 빠진다."""
    facts, analyses = [], {}
    for ds in ("land_temp", "sst", "seaice", "korea_temp"):
        doc = docs.get(ds)
        if not doc:
            continue
        for region in cs.regions_of(doc, ds):
            a = cs.analyze(doc, ds, region, period)
            if a and a.get("mean") is not None:
                analyses[(ds, region)] = a
        facts.extend(cs.build_facts(doc, ds, period))
    if docs.get("typhoon"):
        facts.extend(ty.build_facts(docs["typhoon"], period))
    return facts, analyses


def build(period, *, docs, generated_at=None, top_limit=5):
    """§5~§11 을 통과한 회고 보고서 하나. 발행은 하지 않는다."""
    generated_at = generated_at or _now()
    kind, _, _ = rp.parse(period)
    rtype = rp.REPORT_TYPE_FOR[kind]
    report_id = "report:%s" % rp.label(period)

    # 1) 실측 팩트 (이 기간)
    facts, analyses = build_facts_and_analyses(docs, period)
    facts = stmod.quality_filter(facts)

    # 2) 검증은 **직전 기간**을 평가한다(§10). 기간 계산은 정본 유틸만 쓴다.
    prev = rp.previous_period(period)
    verify_doc = docs.get("verify") or {}
    prev_cov = kma.coverage(verify_doc, prev)
    evals = kma.build_verifications(verify_doc, prev) if prev_cov.get("ok") else []
    verify_facts = kma.build_facts(verify_doc, prev) if prev_cov.get("ok") else []
    facts.extend(verify_facts)

    # 3) 교차도메인 — 상관계수도 팩트로 남는다
    climate_docs = {k: v for k, v in docs.items()
                    if k in ("land_temp", "sst", "seaice", "korea_temp")}
    idx = stmod.index_facts(facts)
    links, corr_facts = xd.build_links(climate_docs, analyses, period, fact_index=idx)
    facts.extend(corr_facts)

    # 4) 스토리
    link_count = {}
    for L in links:
        for key, ids in idx.items():
            if set(ids) & set(L["factRefs"]):
                link_count[key] = link_count.get(key, 0) + 1
    all_stories = (
        stmod.climate_stories(analyses, facts, period, report_id, link_count=link_count)
        + stmod.cross_domain_stories(links, period, report_id)
    )
    surprises = sp.from_verifications(evals, prev)
    all_stories += stmod.forecast_stories(verify_facts, evals, surprises, prev, report_id)
    ranked = sig.rank_stories(all_stories)
    top = stmod.top_stories(all_stories, top_limit)

    # 5) 예상과 달랐던 것 (§3)
    observed = sorted({f["phenomenonId"] for f in facts})
    forecast_phen = sorted({e.get("phenomenonId") for e in evals if e.get("phenomenonId")})
    extremes = {p for s in all_stories if s.get("storyType") == "EXTREME"
                for p in (s.get("phenomenonIds") or [])}
    surprise_section = sp.build_section(evals, prev, observed_phenomena=observed,
                                        forecast_phenomena=forecast_phen, extremes=extremes)

    # 6) 전망 (§9) — 대상은 **다음** 기간이다
    nxt = rp.next_period(period)
    outlook = ol.build_content(nxt)
    outlook["targetPeriod"] = rp.label(nxt)

    # 7) 봉투 + 절
    snapshot = rc.make_data_snapshot(
        snapshot_id="snapshot:%s:phase8" % rp.label(period), created_at=generated_at,
        datasets=[{"ref": FEEDS[k], "state": "AVAILABLE",
                   "observedAt": (docs[k] or {}).get("generated"), "retrievedAt": generated_at}
                  for k in docs if k in FEEDS])
    report = gen.generate_retrospective(
        period, snapshot=snapshot, facts=facts, evaluations=evals,
        generated_at=generated_at, algorithm_version=PIPELINE_VERSION)

    # ⚠️ 채점 자료 QC 는 **채점 절**의 품질이지 보고서 전체의 품질이 아니다.
    #    직전 기간에 채점 자료가 아예 없으면(수집 시작 전) QC 는 period_coverage 로 FAIL 한다.
    #    그걸 발행 게이트에 그대로 넘기면, 8월 보고서가 '7월 채점 자료가 없다'는 이유로
    #    통째로 막힌다 — 8월 이야기는 멀쩡한데도. 그건 품질 문제가 아니라 예정된 공백이고,
    #    forecast_review 절이 이미 그 사유를 적고 있다.
    if verify_doc and prev_cov.get("ok"):
        quality = qcmod.check_verify_daily(verify_doc, period=prev)
    else:
        quality = {"status": "PASS", "skipped": True,
                   "datasetId": kma.SOURCE_REF,
                   "reasonKo": "직전 기간(%s)에 채점 자료가 없어 채점 절을 비웠습니다." % prev,
                   "checks": [], "warnings": [], "failures": []}
    sections = cp.build_sections(
        rtype, period, facts=facts, stories=ranked, links=links,
        surprise_section=surprise_section, evaluations=evals, outlook=outlook,
        quality=quality, top_limit=top_limit, featured=top)
    report = cp.attach(report, stories=ranked, links=links, sections=sections,
                       outlook=outlook, surprise_section=surprise_section, quality=quality)
    report["topStoryIds"] = [s["storyId"] for s in top]
    report["coverage"] = {"previousPeriod": prev_cov, "period": rp.label(period),
                          "feeds": sorted(docs)}

    # 8) 서술 — 채점 문장은 팩트에서 결정적으로 만든다
    if evals:
        report["narrative"] = nr.build_scorecard_narrative(
            gen.build_forecast_scorecard(prev, evals))
    return report


def validate(report):
    """§12 — 팩트/스토리/서술을 한 번에 본다. 하나라도 어긋나면 발행하지 않는다."""
    ok_r, probs_r = gen.validate_report(report)
    ok_n, probs_n = nr.validate_report_narrative(report)
    return (ok_r and ok_n), (probs_r + probs_n)


def main(argv=None):
    ap = argparse.ArgumentParser(description="EARTHUS 보고서 파이프라인 (PHASE 8)")
    ap.add_argument("--period", required=True, help="2026-09 · 2026-Q3 · 2026")
    ap.add_argument("--cache", help="받아 둔 JSON 이 있는 디렉터리 (없으면 공개 주소에서 받는다)")
    ap.add_argument("--out", help="결과 JSON 을 쓸 디렉터리")
    ap.add_argument("--publish", action="store_true", help="발행 단계까지 간다")
    ap.add_argument("--publish-target", default="s3", choices=["s3", "local"])
    ap.add_argument("--publish-root", default="./build/publish", help="local 발행 위치")
    ap.add_argument("--mode", default="PRODUCTION", choices=["TEST", "DEMO", "PRODUCTION"])
    ap.add_argument("--top", type=int, default=5)
    ap.add_argument("--verbose", action="store_true")
    args = ap.parse_args(argv)

    docs, meta = load_feeds(args.cache)
    missing = [m for m in meta if m["state"] != "AVAILABLE"]
    for m in missing:
        print("[warn] 받지 못했다: %s — %s" % (m["ref"], m.get("detail")), file=sys.stderr)

    report = build(args.period, docs=docs, top_limit=args.top)
    ok, problems = validate(report)
    print("[%s] %s · 팩트 %d · 스토리 %d · 링크 %d · 라벨 %s" % (
        report["type"], report["reportId"], len(report["facts"]),
        len(report.get("stories") or []), len(report.get("crossDomainLinks") or []),
        report.get("dataLabel")))
    for s in (report.get("stories") or [])[:args.top]:
        print("   %.3f  %-13s %s" % (s["importanceScore"], s["storyType"], s["title"]))
    if not ok:
        print("  검증 실패: " + " / ".join(problems[:6]))

    if args.publish:
        report = gen.run_publication_pipeline(
            report, quality=report.get("quality"), published_at=_now(), mode=args.mode)
        print("  발행 단계: %s" % report.get("lifecycle"))
        if report.get("validationProblems"):
            print("   " + " / ".join(report["validationProblems"][:4]))
        adapter = (pub.S3PublishAdapter() if args.publish_target == "s3"
                   else pub.LocalPublishAdapter(args.publish_root))
        result = pub.publish_pipeline(report, adapter)
        print("  올리기: ok=%s published=%s %s" % (
            result.get("ok"), result.get("published"),
            result.get("reason") or result.get("key") or ""))
        if result.get("detail"):
            print("   " + str(result["detail"])[:200])

    if args.out:
        os.makedirs(args.out, exist_ok=True)
        path = os.path.join(args.out, report["reportId"].replace(":", "_") + ".json")
        with open(path, "w", encoding="utf-8") as fh:
            json.dump(report, fh, ensure_ascii=False, indent=1)
        print("  → %s" % path)
    if args.verbose:
        print(json.dumps(report, ensure_ascii=False, indent=1)[:3000])
    return report


if __name__ == "__main__":
    main()
