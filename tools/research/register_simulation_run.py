# -*- coding: utf-8 -*-
"""사람이 돌린 research-runtime 실행을 SimulationRunRecord 로 등재한다 (계약 §I S-A · §D · §E).

    # 끝난 실행을 등재 (사람 이름·동의 범위가 없으면 거절)
    python tools/research/register_simulation_run.py record \\
        --experiment services/research-runtime/examples/hycom-2015-atlantic.experiment.json \\
        --result     services/research-runtime/examples/hycom-2015-atlantic.result.json \\
        --run-id hycom-2015-atlantic --event-id evt_… --approved-by <사람> \\
        --consent-scope OPERATOR_BATCH --computed-at 2026-09-10T08:00:00Z --out data/simulation-runs/

    # 실행 요청서만 만든다 (status=REQUESTED — 실행하지 않는다)
    python tools/research/register_simulation_run.py request \\
        --experiment <spec.json> --event-id evt_… --requested-by <사람> --reason "왜 이 사건에 이 모델을"

⚠️⚠️ 이 도구는 **실행하지 않는다.** research-runtime 은 127.0.0.1 전용이고 인증·작업 큐가 없다(계약 §D 불변식 5,
   MAPPING §6.1 원칙 3). 끝난 실행을 등재하거나, 실행 요청서를 만든다 — 두 방향뿐이다.
⚠️ Fargate 큐는 아직 없다(AWS 작업 정의·역할이 필요 — PD 몫). 요청서는 그 큐가 받을 모양(MAPPING §6.2
   SimulationRequest)으로 파일에 남긴다. 큐가 생기면 이 파일을 그대로 넣는다.
⚠️ 승인자는 사람이다 — simulation_link 가 system·lambda·scheduler 같은 계정을 거절한다. 이 도구를 돌리는
   사람이 자기 이름으로 승인한다. 대신 적어 주지 않는다.
"""
import argparse
import json
import os
import sys
from datetime import datetime, timezone

_HERE = os.path.dirname(os.path.abspath(__file__))
_REPO = os.path.dirname(os.path.dirname(_HERE))
sys.path.insert(0, os.path.join(_REPO, "aws", "_shared"))
import simulation_link as sl  # noqa: E402


def _now():
    return datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")


def _load(path):
    with open(path, encoding="utf-8") as handle:
        return json.load(handle)


def build_record(args):
    exp, res = _load(args.experiment), _load(args.result)
    at = args.now or _now()
    approval = {"by": args.approved_by, "at": at, "method": "PER_RUN"}
    consent = {"scope": args.consent_scope, "at": at, "revocable": True}
    rec = sl.from_research_runtime(exp, res, run_id=args.run_id, event_id=args.event_id,
                                   output_ref=os.path.relpath(args.result, _REPO).replace("\\", "/"),
                                   approval=approval, consent=consent, computed_at=args.computed_at)
    return sl.require_valid(rec)


def build_request(args):
    """MAPPING §6.2 요청 방향 — 실행하지 않고 요청서만."""
    exp = _load(args.experiment)
    who = (args.requested_by or "").strip()
    if not who or sl._NON_HUMAN.match(who):
        raise sl.SimulationLinkError("requestedBy 는 사람이다 — 시스템 계정은 요청할 수 없다: %r" % (args.requested_by,))
    if not (args.reason or "").strip():
        raise sl.SimulationLinkError("reason 이 없다 — 왜 이 사건에 이 모델을 돌리는지 사람이 읽는 문장을 적는다")
    runtime, model, version = "research-runtime", exp.get("modelId"), exp.get("modelVersion")
    if sl.RUNTIMES["research-runtime"].get(model) != version:
        raise sl.SimulationLinkError("등재되지 않은 modelId/modelVersion: %r %r" % (model, version))
    if not (args.event_id or "").strip():
        raise sl.SimulationLinkError("eventId 가 없다")
    return {"eventId": args.event_id, "runtime": runtime, "modelId": model, "modelVersion": version,
            "spec": exp, "reason": args.reason.strip(), "requestedBy": who,
            "status": "REQUESTED", "requestedAt": args.now or _now(), "truthStatus": sl.TRUTH_STATUS}


def main(argv=None):
    ap = argparse.ArgumentParser(description=__doc__.split("\n")[0])
    sub = ap.add_subparsers(dest="cmd", required=True)
    r = sub.add_parser("record")
    r.add_argument("--experiment", required=True)
    r.add_argument("--result", required=True)
    r.add_argument("--run-id", required=True)
    r.add_argument("--event-id", required=True)
    r.add_argument("--approved-by", required=True)
    r.add_argument("--consent-scope", required=True, choices=sl.CONSENT_SCOPES)
    r.add_argument("--computed-at", required=True, help="원장(SQLite objects.created)의 실행 시각 ISO")
    r.add_argument("--now", default=None)
    r.add_argument("--out", default=None, help="디렉터리. 주지 않으면 표준출력")
    q = sub.add_parser("request")
    q.add_argument("--experiment", required=True)
    q.add_argument("--event-id", required=True)
    q.add_argument("--requested-by", required=True)
    q.add_argument("--reason", required=True)
    q.add_argument("--now", default=None)
    q.add_argument("--out", default=None)
    args = ap.parse_args(argv)
    try:
        doc = build_record(args) if args.cmd == "record" else build_request(args)
    except sl.SimulationLinkError as exc:
        print("거절: %s" % exc, file=sys.stderr)
        return 2
    text = json.dumps(doc, ensure_ascii=False, indent=2)
    if args.out:
        os.makedirs(args.out, exist_ok=True)
        name = (doc.get("runRef") or "request-%s-%s" % (doc["eventId"], doc["requestedAt"])).replace(":", "_")
        path = os.path.join(args.out, name + ".json")
        with open(path, "w", encoding="utf-8", newline="\n") as handle:
            handle.write(text + "\n")
        print(path)
    else:
        print(text)
    return 0


if __name__ == "__main__":
    sys.exit(main())
