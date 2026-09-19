# -*- coding: utf-8 -*-
"""배포 엔진 CLI — 지시서 §133 ~ §138.

  python aws/distribution/cli.py daily            --out out/          오늘의 지구 후보
  python aws/distribution/cli.py weekly           --out out/
  python aws/distribution/cli.py event  --id earthquake:us7000tdvt
  python aws/distribution/cli.py scorecard --period 2026-08
  python aws/distribution/cli.py from-report --report out/report_2026-08.json
  python aws/distribution/cli.py validate --content out/CNT-2026-000001.json
  python aws/distribution/cli.py preview  --content ... --platform x
  python aws/distribution/cli.py publish  --content ... --platform x --mode MOCK
  python aws/distribution/cli.py audit    --content ...

--input 으로 로컬 JSON 을 주면 그것을 쓴다. 없으면 공개 주소에서 받는다.
자동 발행 경로는 없다. `publish` 는 MOCK 이 기본이고, LIVE 는 전송 경로가
주입되지 않으면 NOT_CONFIGURED 로 끝난다(§144).
"""
import argparse
import json
import os
import sys
from datetime import datetime, timedelta, timezone

_HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, _HERE)
sys.path.insert(0, os.path.join(os.path.dirname(_HERE), "_shared"))
sys.path.insert(0, os.path.join(_HERE, "sources"))

import generator as gen                      # noqa: E402
import publish_queue as pq                # noqa: E402
import archive as arch                       # noqa: E402
import sns_adapters as adapters              # noqa: E402
import provenance as prov                    # noqa: E402
import report_period as rp                   # noqa: E402
from sources import lab_report               # noqa: E402
from sources import verify_scorecard         # noqa: E402
from sources import report_bridge            # noqa: E402

S3 = "https://earthus-cache-kr.s3.us-east-2.amazonaws.com"
LAB_REPORTS = f"{S3}/ocean/lab-reports.json"
VERIFY_DAILY = f"{S3}/wind/series/verify-daily.json"

# §148 — 시험/데모 콘텐츠에는 표시를 남긴다. 실계정으로 나갈 수 없게.
TEST_MARK = "TEST"


def _now():
    return datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")


def _get(url, path=None):
    if path:
        with open(path, encoding="utf-8") as fh:
            return json.load(fh)
    from urllib.request import urlopen, Request
    req = Request(url, headers={"User-Agent": "earthus-distribution/1.0"})
    with urlopen(req, timeout=60) as r:
        return json.loads(r.read().decode("utf-8"))


def _write(out_dir, name, doc):
    if not out_dir:
        return None
    os.makedirs(out_dir, exist_ok=True)
    path = os.path.join(out_dir, name)
    with open(path, "w", encoding="utf-8") as fh:
        json.dump(doc, fh, ensure_ascii=False, indent=1)
    return path


def _emit(contents, args, header):
    print(header)
    for c in contents:
        v = c.get("validation") or {}
        mark = "OK " if v.get("status") == "PASSED" else "!! "
        print(f"  {mark}{c['contentId']} [{c['type']}] {c.get('priority')} "
              f"{c.get('eligibility')} conf={c.get('confidence')} "
              f"plat={len(c.get('platformVersions') or {})} :: {c.get('title')}")
        for p in (v.get("problems") or [])[:4]:
            print(f"       - {p['code']}: {p['message']}"
                  + (f" ({p['where']})" if p.get("where") else ""))
        if c.get("platformProblems"):
            for k, m in c["platformProblems"].items():
                print(f"       - 플랫폼 {k}: {m}")
    s = gen.summarize(contents)
    print(f"  요약 {json.dumps(s['byEligibility'], ensure_ascii=False)}")
    if args.out:
        for c in contents:
            _write(args.out, f"{c['contentId']}.json", c)
        idx = _write(args.out, "content-index.json", {
            "generatedAt": _now(), "count": len(contents), "summary": s,
            "items": [{"contentId": c["contentId"], "type": c["type"],
                       "title": c.get("title"), "status": c.get("status"),
                       "eligibility": c.get("eligibility"), "priority": c.get("priority"),
                       "confidence": c.get("confidence"),
                       "validation": (c.get("validation") or {}).get("status"),
                       "phenomenonIds": c.get("phenomenonIds"),
                       "eventIds": c.get("eventIds"), "reportIds": c.get("reportIds")}
                      for c in contents]})
        print(f"  → {idx}")


def _build_all(cands, args, prefix):
    year = datetime.now(timezone.utc).year
    out = []
    for i, cand in enumerate(cands, 1):
        cid = gen.next_content_id(year, args.seq + i)
        snap = gen.snapshot_for(cand, snapshot_id=f"snapshot:{prefix}:{cid}", created_at=_now())
        try:
            c = gen.generate(cand, content_id=cid, generated_at=_now(),
                             snapshot_id=snap["snapshotId"],
                             platforms=args.platforms.split(",") if args.platforms else None)
        except Exception as e:                    # noqa: BLE001
            print(f"  !! {cid} 생성 실패: {e}", file=sys.stderr)
            continue
        c["testMark"] = TEST_MARK if args.test else None
        c["snapshot"] = snap
        out.append(c)
    return out


# ── §133 · §81 오늘의 지구 ───────────────────────────────────────────────────
def cmd_daily(args):
    doc = _get(LAB_REPORTS, args.input)
    cands = lab_report.candidates(doc)
    # 오늘 안에 갱신된 것만. 자료가 오래된 것을 '오늘'이라 부르지 않는다.
    today = (args.date or _now())[:10]
    fresh = [c for c in cands
             if (c["raw"].get("lastSeen") or c["raw"].get("detectedAt") or "")[:10] >= today]
    if not fresh:
        # §119 · §120 — 없으면 없다고 한다. 오래된 것을 오늘로 올리지 않는다.
        print(f"[daily] {today} 에 갱신된 사건이 없다 — 콘텐츠를 만들지 않는다")
        return
    fresh.sort(key=lambda c: -(c["signals"].get("public_relevance") or 0
                               if c["signals"].get("public_relevance") != "UNKNOWN" else 0))
    _emit(_build_all(fresh[:args.limit], args, "daily"),
          args, f"[daily] {today} · 후보 {len(fresh)}건 중 {min(args.limit, len(fresh))}건")


# ── §82 주간 ─────────────────────────────────────────────────────────────────
def cmd_weekly(args):
    doc = _get(LAB_REPORTS, args.input)
    cands = lab_report.candidates(doc)
    end = (args.date or _now())[:10]
    start = (datetime.strptime(end, "%Y-%m-%d") - timedelta(days=6)).strftime("%Y-%m-%d")
    week = [c for c in cands
            if start <= (c["raw"].get("lastSeen") or c["raw"].get("detectedAt") or "")[:10] <= end]
    if not week:
        print(f"[weekly] {start}~{end} 에 사건이 없다 — 콘텐츠를 만들지 않는다")
        return
    for c in week:
        c["contentType"] = "EARTH_WEEKLY"
        c["observationPeriod"] = {"from": start, "to": end}
    _emit(_build_all(week[:args.limit], args, "weekly"),
          args, f"[weekly] {start}~{end} · 후보 {len(week)}건")


# ── §134 generateSNSContentFromPhenomenon / event ────────────────────────────
def cmd_event(args):
    doc = _get(LAB_REPORTS, args.input)
    cands = lab_report.candidates(doc)
    hit = [c for c in cands if c["eventId"] == args.id
           or (args.phenomenon and c["phenomenonId"] == args.phenomenon)]
    if not hit:
        raise SystemExit(f"그런 사건/현상의 후보가 없다: {args.id or args.phenomenon}")
    _emit(_build_all(hit[:args.limit], args, "event"), args, f"[event] {len(hit)}건")


# ── §147 예보 성적표 ─────────────────────────────────────────────────────────
def cmd_scorecard(args):
    daily = _get(VERIFY_DAILY, args.input)
    cand = verify_scorecard.candidate(daily, args.period)
    if not cand:
        print(f"[scorecard] {args.period} 기간의 채점 자료가 없다 — 콘텐츠를 만들지 않는다")
        return
    _emit(_build_all([cand], args, "scorecard"), args, f"[scorecard] {rp.label(args.period)}")


# ── §63 리포트 → SNS ─────────────────────────────────────────────────────────
def cmd_from_report(args):
    with open(args.report, encoding="utf-8") as fh:
        report = json.load(fh)
    cand = report_bridge.candidate(report)
    if not cand:
        print(f"[from-report] {report.get('reportId')} 에는 팩트가 없다 — 콘텐츠를 만들지 않는다")
        return
    _emit(_build_all([cand], args, "report"), args, f"[from-report] {report.get('reportId')}")


# ── §135 검증 ────────────────────────────────────────────────────────────────
def cmd_validate(args):
    with open(args.content, encoding="utf-8") as fh:
        content = json.load(fh)
    out = gen.validate(content)
    v = out["validation"]
    print(f"[validate] {content['contentId']} · {v['status']} "
          f"(숫자 풀 {v['numericPoolSize']}개)")
    for p in v["problems"]:
        print(f"  ERROR {p['code']}: {p['message']}" + (f" ({p['where']})" if p.get("where") else ""))
    for w in v["warnings"]:
        print(f"  WARN  {w['code']}: {w['message']}")
    chain = out["provenanceChain"]
    print(f"  출처 사슬 {'완전' if chain['chainComplete'] else '끊김'} · 자료 {len(chain['datasets'])}건")
    if args.out:
        _write(args.out, f"{content['contentId']}.validated.json", out)


# ── §136 미리보기 ────────────────────────────────────────────────────────────
def cmd_preview(args):
    with open(args.content, encoding="utf-8") as fh:
        content = json.load(fh)
    pv = (content.get("platformVersions") or {}).get(args.platform)
    if not pv:
        raise SystemExit(f"{args.platform} 판이 없다 (있는 것: "
                         f"{sorted(content.get('platformVersions') or {})})")
    ad = adapters.get(args.platform, adapters.MODE_PREVIEW)
    payload = ad.generate_payload(pv, media_asset_id=args.media)
    prev = ad.preview(payload)
    print(f"[preview] {args.platform} · {'유효' if prev['valid'] else '무효'} "
          f"· {prev['textLength']}/{prev['limit']}자 (남은 {prev['remaining']})")
    for p in prev["problems"]:
        print(f"  - {p}")
    print("-" * 60)
    print(prev["renderedText"])
    print("-" * 60)
    print(f"  지표 가능: {', '.join(prev['availableMetrics']) or '없음'}")


# ── §78 모의 발행 ────────────────────────────────────────────────────────────
def cmd_publish(args):
    with open(args.content, encoding="utf-8") as fh:
        content = json.load(fh)
    if (content.get("validation") or {}).get("status") != "PASSED":
        raise SystemExit("검증을 통과하지 않은 콘텐츠는 발행 흐름에 넣지 않는다")
    pv = (content.get("platformVersions") or {}).get(args.platform)
    if not pv:
        raise SystemExit(f"{args.platform} 판이 없다")

    import content_contract as cc
    at = _now()
    # 리뷰 워크플로를 실제로 통과시킨다. 건너뛰는 경로를 만들지 않는다.
    c = content
    for step in ("FACT_CHECK", "REVIEW", "APPROVED"):
        c = cc.transition(c, step, actor=args.actor, at=at, note="CLI")
    item = pq.enqueue(c, pv, scheduled_at=at)
    item = pq.mark_processing(item, at=at)

    ad = adapters.get(args.platform, args.mode)
    payload = ad.generate_payload(pv, media_asset_id=args.media,
                                  options={"title": c.get("title"),
                                           "privacyStatus": "private",
                                           "privacyLevel": "SELF_ONLY"})
    try:
        result = ad.publish(payload, confirmed=(args.mode != adapters.MODE_LIVE) or args.confirm,
                            actor=args.actor, at=at)
    except adapters.AdapterError as e:
        item = pq.mark_failed(item, at=at, message=str(e), kind=e.kind, code=e.code)
        print(f"[publish] 실패 · {item['status']} · {e.code or ''} {e}")
        if args.out:
            _write(args.out, f"queue-{item['queueId'].replace(':', '_')}.json", item)
        return
    if result.get("status") != "PUBLISHED":
        print(f"[publish] {result.get('status')} — 전송하지 않았다")
        return
    item = pq.mark_published(item, result, at=at)
    c = cc.transition(c, "PUBLISHED", actor=args.actor, at=at, note="CLI")
    rec = arch.archive_publication(c, pv, item, at=at)
    print(f"[publish] {args.mode} · {result.get('postId')} · 큐 {item['status']}")
    if args.out:
        _write(args.out, f"queue-{item['queueId'].replace(':', '_')}.json", item)
        _write(args.out, f"pub-{rec['publicationId'].replace(':', '_')}.json", rec)
        print(f"  → 아카이브 {rec['publicationId']}")


# ── §138 감사 ────────────────────────────────────────────────────────────────
def cmd_audit(args):
    with open(args.content, encoding="utf-8") as fh:
        content = json.load(fh)
    chain = prov.resolve_content(content)
    print(f"[audit] {content['contentId']}")
    print(f"  현상 {chain['phenomenonIds']} · 사건 {chain['eventIds']} · 리포트 {chain['reportIds']}")
    for d in chain["datasets"]:
        print(f"  자료 {d['ref']} → {d.get('provider') or '(출처 미상)'} "
              f"[{d.get('truthType')}] {'' if d['resolved'] else '⚠ 표에 없다'}")
    print(f"  스냅샷 {chain['dataSnapshotId']} · 생성기 {chain['generatorVersion']}")
    for a in content.get("audit") or []:
        print(f"  {a['at']} {a['from']} → {a['to']} by {a['actor']} {a.get('note') or ''}")
    if not chain["chainComplete"]:
        for b in chain["brokenLinks"]:
            print(f"  ⚠ {b}")


def cmd_capabilities(args):
    """§143 — 관리 화면이 버튼을 그릴 때 쓰는 표. 없는 능력은 없다고 말한다."""
    caps = adapters.capabilities()
    print(json.dumps(caps, ensure_ascii=False, indent=1))
    if args.out:
        _write(args.out, "adapter-capabilities.json",
               {"generatedAt": _now(), "adapters": caps, "schedules": pq.SCHEDULES})


def main(argv=None):
    ap = argparse.ArgumentParser(description="EARTHUS 배포 엔진")
    sub = ap.add_subparsers(dest="cmd", required=True)

    d = sub.add_parser("daily", help="오늘의 지구 후보")
    d.add_argument("--date")
    d.set_defaults(fn=cmd_daily)

    w = sub.add_parser("weekly", help="주간 후보")
    w.add_argument("--date")
    w.set_defaults(fn=cmd_weekly)

    e = sub.add_parser("event", help="사건/현상 하나")
    e.add_argument("--id")
    e.add_argument("--phenomenon")
    e.set_defaults(fn=cmd_event)

    s = sub.add_parser("scorecard", help="예보 성적표")
    s.add_argument("--period", required=True)
    s.set_defaults(fn=cmd_scorecard)

    fr = sub.add_parser("from-report", help="리포트에서 SNS 후보")
    fr.add_argument("--report", required=True)
    fr.set_defaults(fn=cmd_from_report)

    v = sub.add_parser("validate")
    v.add_argument("--content", required=True)
    v.set_defaults(fn=cmd_validate)

    p = sub.add_parser("preview")
    p.add_argument("--content", required=True)
    p.add_argument("--platform", required=True)
    p.add_argument("--media")
    p.set_defaults(fn=cmd_preview)

    pub = sub.add_parser("publish")
    pub.add_argument("--content", required=True)
    pub.add_argument("--platform", required=True)
    pub.add_argument("--mode", default=adapters.MODE_MOCK, choices=list(adapters.MODES))
    pub.add_argument("--media")
    pub.add_argument("--actor", default="cli")
    pub.add_argument("--confirm", action="store_true", help="LIVE 발행 확인")
    pub.set_defaults(fn=cmd_publish)

    a = sub.add_parser("audit")
    a.add_argument("--content", required=True)
    a.set_defaults(fn=cmd_audit)

    c = sub.add_parser("capabilities")
    c.set_defaults(fn=cmd_capabilities)

    for x in (d, w, e, s, fr, v, p, pub, a, c):
        x.add_argument("--input", help="로컬 JSON (없으면 공개 주소)")
        x.add_argument("--out", help="결과를 쓸 디렉터리")
        x.add_argument("--limit", type=int, default=5)
        x.add_argument("--seq", type=int, default=0, help="콘텐츠 순번 시작값")
        x.add_argument("--platforms", help="쉼표 구분 (기본: 지시서 §15 의 5종)")
        x.add_argument("--test", action="store_true", help="§148 시험 콘텐츠로 표시")

    args = ap.parse_args(argv)
    args.fn(args)


if __name__ == "__main__":
    main()
