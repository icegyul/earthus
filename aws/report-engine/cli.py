# -*- coding: utf-8 -*-
"""리포트 생성 CLI (PHASE 6 §26).

자동 실행을 억지로 붙이지 않는다. 먼저 손으로/CI 로 재현 가능한 실행 경로를 만든다.

  python aws/report-engine/cli.py report  --type monthly   --period 2026-09
  python aws/report-engine/cli.py report  --type quarterly --period 2026-Q3
  python aws/report-engine/cli.py report  --type annual    --period 2026
  python aws/report-engine/cli.py outlook --type next-month   --period 2026-10
  python aws/report-engine/cli.py outlook --type next-quarter --period 2026-Q4
  python aws/report-engine/cli.py outlook --type next-year    --period 2027
  python aws/report-engine/cli.py scorecard --period 2026-09

--input 으로 verify-daily.json 을 준다. 없으면 S3 공개 주소에서 받는다.
--out 을 주면 그 디렉터리에 JSON 으로 쓴다. 안 주면 요약만 찍는다.
"""
import argparse
import json
import os
import sys
from datetime import datetime, timezone

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)
sys.path.insert(0, os.path.join(os.path.dirname(HERE), "_shared"))

import generator as gen                              # noqa: E402
import report_period as rp                           # noqa: E402
import report_contract as rc                         # noqa: E402
from adapters import kma_verify_adapter as kma       # noqa: E402

PUBLIC = "https://earthus-cache-kr.s3.us-east-2.amazonaws.com/wind/series/verify-daily.json"
TYPE_TO_PERIODKIND = {"monthly": rp.MONTH, "quarterly": rp.QUARTER, "annual": rp.YEAR}
OUTLOOK_KIND = {"next-month": rp.MONTH, "next-quarter": rp.QUARTER, "next-year": rp.YEAR}


def _now():
    return datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")


def load_daily(path):
    if path:
        with open(path, encoding="utf-8") as fh:
            return json.load(fh)
    try:
        from urllib.request import urlopen
        with urlopen(PUBLIC, timeout=30) as r:
            return json.loads(r.read().decode("utf-8"))
    except Exception as e:                     # noqa: BLE001
        print(f"[warn] 채점 자료를 받지 못했다: {e}", file=sys.stderr)
        return {}


def make_snapshot(daily, period):
    """§4 — 무엇을 보고 만들었는지 남긴다. 관측 시각과 받은 시각을 나눈다."""
    return rc.make_data_snapshot(
        snapshot_id=f"snapshot:{rp.label(period)}:verify",
        created_at=_now(),
        datasets=[{
            "ref": kma.SOURCE_REF,
            "sourceVersion": (daily or {}).get("leadBasis"),
            "observedAt": (daily or {}).get("generated"),
            "retrievedAt": _now(),
            "state": "AVAILABLE" if (daily or {}).get("days") else "UNAVAILABLE",
        }],
    )


def cmd_report(args):
    period = args.period
    kind_want = TYPE_TO_PERIODKIND[args.type]
    kind, _, _ = rp.parse(period)
    if kind != kind_want:
        raise SystemExit(f"--type {args.type} 에는 {kind_want} 기간이 필요하다: {period}")

    daily = load_daily(args.input)
    cov = kma.coverage(daily, period)
    facts = kma.build_facts(daily, period) if cov["ok"] else []
    # 검증 절은 '이전 기간' 을 평가한다(§7). 기간 계산은 정본 유틸만 쓴다.
    prev = rp.previous_period(period)
    prev_cov = kma.coverage(daily, prev)
    evals = kma.build_verifications(daily, prev) if prev_cov["ok"] else []

    snap = make_snapshot(daily, period)
    rep = gen.generate_retrospective(
        period, snapshot=snap, facts=facts, evaluations=evals,
        generated_at=_now(), algorithm_version=gen.GENERATOR_VERSION)
    rep["coverage"] = {"period": cov, "previousPeriod": prev_cov}
    ok, problems = gen.validate_report(rep)
    if ok and args.publish:
        rep = gen.publish(rep, published_at=_now())
    _emit(rep, args, ok, problems, extra=f"팩트 {len(facts)} · 검증 {len(evals)} · 이전기간 {prev}")


def cmd_outlook(args):
    period = args.period
    kind_want = OUTLOOK_KIND[args.type]
    kind, _, _ = rp.parse(period)
    if kind != kind_want:
        raise SystemExit(f"--type {args.type} 에는 {kind_want} 기간이 필요하다: {period}")
    daily = load_daily(args.input)
    snap = make_snapshot(daily, period)
    # 전망 팩트는 아직 만들 수 없다 — 우리가 생산·보관하는 장기 예보 산출물이 없다.
    # 빈 전망을 그럴듯한 문장으로 채우지 않는다(§0-5, §10).
    rep = gen.generate_outlook(period, snapshot=snap, facts=[],
                               generated_at=_now(), algorithm_version=gen.GENERATOR_VERSION)
    rep["empty"] = True
    rep["reasonKo"] = "전망을 만들 수 있는 자체 장기 예보 산출물이 아직 없습니다."
    rep["reasonEn"] = "No in-house long-range forecast product exists yet to build an outlook from."
    ok, problems = gen.validate_report(rep)
    _emit(rep, args, ok, problems, extra=f"대상 {rp.label(period)} · {rep['horizonClass']}")


def cmd_scorecard(args):
    daily = load_daily(args.input)
    period = args.period
    cov = kma.coverage(daily, period)
    evals = kma.build_verifications(daily, period) if cov["ok"] else []
    # 평가 불가 영역도 행으로 남긴다 — 빠뜨리면 못 한 것이 사라진다(§17).
    for phen, reason in gen.UNVERIFIABLE_DOMAINS.items():
        evals.append(rc.make_verification(prediction_id=f"pred:{rp.label(period)}:{phen}",
                                          phenomenon_id=phen, metric_set=None,
                                          not_verifiable=reason))
    card = gen.build_forecast_scorecard(period, evals)
    print(json.dumps(card, ensure_ascii=False, indent=1)[:2000] if args.verbose
          else f"[scorecard] {card['period']} 평가 {card['evaluatedCount']} · 불가 {card['notEvaluatedCount']}")
    if args.out:
        _write(args.out, f"scorecard-{card['period']}.json", card)


def _emit(rep, args, ok, problems, extra=""):
    print(f"[{rep['type']}] {rep['reportId']} · {rep.get('lifecycle')} · {extra}")
    if not ok:
        print("  검증 실패: " + " / ".join(problems))
    if args.verbose:
        print(json.dumps(rep, ensure_ascii=False, indent=1)[:2500])
    if args.out:
        _write(args.out, f"{rep['reportId'].replace(':', '_')}.json", rep)


def _write(out_dir, name, doc):
    os.makedirs(out_dir, exist_ok=True)
    path = os.path.join(out_dir, name)
    with open(path, "w", encoding="utf-8") as fh:
        json.dump(doc, fh, ensure_ascii=False, indent=1)
    print(f"  → {path}")


def main(argv=None):
    ap = argparse.ArgumentParser(description="EARTHUS 리포트 엔진")
    sub = ap.add_subparsers(dest="cmd", required=True)

    r = sub.add_parser("report", help="회고 보고서")
    r.add_argument("--type", required=True, choices=sorted(TYPE_TO_PERIODKIND))
    r.add_argument("--period", required=True)
    r.add_argument("--publish", action="store_true", help="검증을 통과하면 PUBLISHED 로 올린다")
    r.set_defaults(fn=cmd_report)

    o = sub.add_parser("outlook", help="전망")
    o.add_argument("--type", required=True, choices=sorted(OUTLOOK_KIND))
    o.add_argument("--period", required=True)
    o.set_defaults(fn=cmd_outlook)

    s = sub.add_parser("scorecard", help="예보 성적표")
    s.add_argument("--period", required=True)
    s.set_defaults(fn=cmd_scorecard)

    for p in (r, o, s):
        p.add_argument("--input", help="verify-daily.json 경로 (없으면 공개 주소에서 받는다)")
        p.add_argument("--out", help="결과 JSON 을 쓸 디렉터리")
        p.add_argument("--verbose", action="store_true")

    args = ap.parse_args(argv)
    args.fn(args)


if __name__ == "__main__":
    main()
