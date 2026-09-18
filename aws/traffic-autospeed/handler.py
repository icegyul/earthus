# -*- coding: utf-8 -*-
"""트래픽이 자리잡으면 사전출시 절약 주기를 실제 서비스 주기로 되돌린다.

왜 만들었나
  2026-09-18, AWS 실사용액이 늘어나는 걸 보고 marine-ea·wind-grid·marine-grid·
  pressure-grid·air-grid·wildfire 6개를 1시간(wildfire는 30분)에서 3시간으로
  늦췄다(사전출시 절약 모드). 문제는 "나중에 이용자 늘면 다시 빠르게" 를 사람이
  기억해서 손으로 해야 한다는 것 — 대회·출시 준비로 바쁠 때 잊기 딱 좋다.
  → CloudFront 요청 수가 일정 수준을 **사흘 연속** 넘으면(진짜 트래픽인지 확인하는
    최소한의 장치) 자동으로 원래 주기로 되돌린다.

트리거
  CloudWatch 알람(하루 요청 수 ≈ 방문 10,000회 근사치, us-east-1 콘솔 참고) →
  SNS 토픽(earthus-traffic-milestone) → 이 함수.
  알람은 "3일 연속 넘음"만 ALARM 상태가 되므로, 대회 심사 하루 반짝 트래픽 같은
  걸로 잘못 발동하지 않는다.

⚠️⚠️ 한쪽 방향으로만 움직인다(되돌아가지 않는다)
  트래픽이 며칠 뜸해졌다고 다시 늦추면, 하필 그때 들어온 사용자가 손해를 본다.
  일단 빨라지면 계속 빠른 채로 둔다 — 그래서 "느리게" 되돌리는 코드는 없다.
  같은 이유로 이 함수는 몇 번을 다시 불려도 안전하다(멱등) — 이미 빠른 주기인
  규칙에 같은 값을 또 넣어도 아무 일도 안 난다.

⚠️ wildfire 는 예전 30분이 아니라 1시간으로 되돌린다. 위성(VIIRS)이 같은 지점을
  하루 몇 번밖에 안 지나가므로(aws/wildfire/handler.py 문서 참고), 30분은
  트래픽과 무관하게 원래도 과했다 — "빠른 주기"의 정의 자체를 여기서 고쳤다.

⚠️ gk2a-clouds(천리안 위성, 10분 주기)는 이 목록에 없다. 아직 안 늦췄고,
  대회 마감(9/21·9/30) 이후 별도로 판단하기로 했다 — 여기서 같이 건드리지 않는다.
"""
import json

import boto3

REGION = "ap-northeast-2"
events = boto3.client("events", region_name=REGION)

# 사전출시 절약 주기 → 실제 서비스 주기. (규칙 이름, 되돌릴 표현식, 설명)
FAST_SCHEDULES = [
    ("marine-ea-schedule", "rate(1 hour)",
     "earthus · 동아시아 해양 격자 0.5도"),
    ("earthus-wind-hourly", "cron(20 * * * ? *)",
     "earthus: 전지구 바람 격자 (매시 20분)"),
    ("marine-grid-hourly", "cron(45 * * * ? *)", None),
    ("air-grid-hourly", "cron(25 * * * ? *)", None),
    ("pressure-grid-schedule", "rate(1 hour)",
     "earthus · 동아시아 기압 격자 (등압선)"),
    # ⚠️ 원래 30분이 아니라 1시간 — 위 docstring 참고
    ("earthus-wildfire", "rate(1 hour)",
     "earthus 산불 (NASA FIRMS VIIRS) — 1시간(위성 재통과 주기에 맞춤)"),
]


def _is_alarm_state(record):
    """SNS 메시지가 CloudWatch 알람 ALARM 전이가 맞는지 한 번 더 확인한다.
    ⚠️ 구독 확인(SubscriptionConfirmation) 메시지나 수동 테스트 메시지가
       섞여 들어와도 스케줄을 잘못 건드리지 않기 위한 방어선이다."""
    try:
        body = json.loads(record["Sns"]["Message"])
        return body.get("NewStateValue") == "ALARM"
    except Exception:                                        # noqa: BLE001
        return False


def handler(event, context):
    records = (event or {}).get("Records", [])
    if records and not any(_is_alarm_state(r) for r in records):
        print("[traffic-autospeed] ALARM 전이가 아닌 메시지 — 무시")
        return {"ok": True, "applied": False, "reason": "not-an-alarm-transition"}

    applied = []
    for rule, sched, desc in FAST_SCHEDULES:
        kwargs = {"Name": rule, "ScheduleExpression": sched, "State": "ENABLED"}
        if desc:
            kwargs["Description"] = desc + " — 트래픽 기준 자동 복귀"
        try:
            events.put_rule(**kwargs)
            applied.append(rule)
            print(f"[traffic-autospeed] {rule} -> {sched}")
        except Exception as e:                                # noqa: BLE001
            print(f"[traffic-autospeed] {rule} 실패: {e!r}")

    return {"ok": len(applied) == len(FAST_SCHEDULES), "applied": applied}
