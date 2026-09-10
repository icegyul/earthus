# -*- coding: utf-8 -*-
"""실운영 검증 하네스 — SNS FACTORY 신규 모듈 (독립 구현).

한 번에, 한 provider 씩, 안전하게 확인한다
  PHASE A health → B auth → C publish readiness → D test publication →
  E confirmation → F analytics → G archive → H idempotency.
  한 단계가 막히면 뒤는 NOT_EXECUTED 다. 앞을 통과한 척하지 않는다.

실행하지 않는 것이 기본이다
  실제 publish 는 다음이 전부 맞을 때만 시도한다:
    ① health.publish_ready (live handshake + confirmed 증거)
    ② confirm_live=True (호출자가 실운영을 명시)
    ③ 콘텐츠가 TEST 표시 (운영 콘텐츠로 시험하지 않는다)
    ④ provider 가 하나 (일괄 금지)
  하나라도 빠지면 D 이후는 NOT_EXECUTED 다. mock 성공을
  LIVE 로 적지 않는다 — mock 은 MOCK 으로 적는다.

자격증명을 만지지 않는다
  토큰을 읽지도, 저장하지도, 로그에 남기지도 않는다.
  handshake 증거는 호출자(운영자)가 social-admin 의
  credential-status.verifiedAt 을 보고 직접 넘긴다.
"""
from datetime import datetime, timezone

import provider_health as phealth
import executor as ex
import analytics_fetch as af
import archive as arch

HARNESS_SCHEMA = "earthus.live-verification.v1"

PHASES = ("health", "auth", "publish_readiness", "publication",
          "confirmation", "analytics", "archive", "idempotency")

ST_PASS = "PASS"
ST_BLOCKED = "BLOCKED"
ST_FAIL = "FAIL"
ST_NOT_EXECUTED = "NOT_EXECUTED"

VERDICT_LIVE = "LIVE_VERIFIED"
VERDICT_MOCK = "MOCK_ONLY"
VERDICT_BLOCKED = "CONFIGURATION_BLOCKED"

TEST_MARK = "[TEST] "


def _now_utc():
    return datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")


def _phase(status, detail=None):
    return {"status": status, "detail": detail}


def verify(provider, *, context, content=None, versions=None, adapters=None,
           now=None, actor="live-verify", confirm_live=False):
    """provider 하나를 PHASE A–H 로 검증한다.adapter 여러 개를 받지 않는다."""
    now = now or _now_utc()
    if isinstance(provider, (list, tuple)):
        raise ValueError("한 번에 하나의 provider 만 검증한다")
    phases = {}
    adapter = (adapters or {}).get(provider)
    if adapter is None:
        for name in PHASES:
            phases[name] = _phase(ST_BLOCKED, "어댑터가 없다")
        return _report(provider, phases, now)

    # A. health — 네트워크 없이, 주어진 것만 본다.
    health = phealth.inspect(
        adapter, credentials=(context or {}).get("credentials"),
        transport=(context or {}).get("transport"),
        confirmed=(context or {}).get("confirmed", False),
        handshake=(context or {}).get("handshake"), at=now)
    phases["health"] = _phase(
        ST_PASS if health["state"] != phealth.ST_NOT_CONFIGURED else ST_BLOCKED,
        {"state": health["state"], "mode": health["mode"],
         "provenance": health["provenance"], "reason": health["reason"]})

    # B. auth — live handshake 증거가 있을 때만.
    authed = health["authenticated"] and health["provenance"] == "live"
    phases["auth"] = _phase(ST_PASS if authed else ST_BLOCKED,
                            {"authenticated": authed})

    # C. publish readiness — 확인 + 발행 증거.
    ready = health["publish_ready"] and health["provenance"] == "live"
    phases["publish_readiness"] = _phase(
        ST_PASS if ready else ST_BLOCKED, {"publish_ready": ready})

    live_ok = ready and confirm_live
    if content is not None and not str(
            (content or {}).get("title") or "").startswith(TEST_MARK):
        live_ok = False
        test_note = "TEST 표시 없는 콘텐츠로는 실운영 시험을 안 한다"
    else:
        test_note = None

    # D–H. live 조건이 아니면 실행하지 않는다.
    if not live_ok:
        reason = test_note or "live 조건 미충족 (ready·confirm·TEST 표시)"
        for name in ("publication", "confirmation", "analytics", "archive",
                     "idempotency"):
            phases[name] = _phase(ST_NOT_EXECUTED, reason)
        return _report(provider, phases, now, health=health)

    out = ex.run_once([content], [], versions=versions or {},
                      adapters={provider: adapter}, now=now, actor=actor,
                      source="live-verify", confirmed=True,
                      health_map={provider: health})
    pubs = [r for r in out["results"] if r.get("outcome") == ex.OUT_PUBLISHED]
    if not pubs:
        detail = "; ".join(str(r.get("reason")) for r in out["results"][:3])
        for name in ("publication", "confirmation", "analytics", "archive",
                     "idempotency"):
            phases[name] = _phase(ST_FAIL, detail or "발행 결과 없음")
        return _report(provider, phases, now, health=health)
    pub = pubs[0]
    phases["publication"] = _phase(ST_PASS, {"outcome": "PUBLISHED"})

    # E. confirmation — mock ID 는 확인이 아니다.
    if pub.get("mock"):
        phases["confirmation"] = _phase(ST_BLOCKED, "MOCK 발행이다")
        for name in ("analytics", "archive", "idempotency"):
            phases[name] = _phase(ST_NOT_EXECUTED, "실제 publication 없음")
        return _report(provider, phases, now, health=health)
    post_id = pub.get("postId")
    if not post_id:
        phases["confirmation"] = _phase(ST_FAIL, "publication ID 없음")
        for name in ("analytics", "archive", "idempotency"):
            phases[name] = _phase(ST_NOT_EXECUTED, "확인 불가")
        return _report(provider, phases, now, health=health)
    phases["confirmation"] = _phase(ST_PASS, {"postId": "present"})

    # F. analytics — 실제 응답일 때만 live.
    fetched = None
    if out["archives"]:
        fetched = af.fetch(out["archives"][0], adapter, at=now, via="live")
        phases["analytics"] = _phase(
            ST_PASS if fetched["status"] == af.STATUS_AVAILABLE else ST_BLOCKED,
            {"status": fetched["status"],
             "provenance": fetched["provenance"]})
    else:
        phases["analytics"] = _phase(ST_FAIL, "아카이브 없음")

    # G. archive — 계약 필드 + 비밀 없음.
    if out["archives"]:
        rec = out["archives"][0]
        missing = [k for k in ("platform", "postId", "publishedAt", "text")
                   if not rec.get(k)]
        leaked = [k for k in phealth._SECRET_KEYS if k in str(rec)]
        if missing or leaked or rec.get("postId") != post_id:
            phases["archive"] = _phase(
                ST_FAIL, {"missing": missing, "leaked": bool(leaked)})
        else:
            phases["archive"] = _phase(
                ST_PASS, {"platform": rec["platform"]})
    else:
        phases["archive"] = _phase(ST_FAIL, "아카이브 없음")

    # H. idempotency — 다시 돌려도 발행 없음.
    again = ex.run_once([content], list(out["queueItems"]),
                        versions=versions or {},
                        adapters={provider: adapter}, now=now, actor=actor,
                        source="live-verify", confirmed=True,
                        health_map={provider: health})
    repubs = [r for r in again["results"]
              if r.get("outcome") == ex.OUT_PUBLISHED]
    phases["idempotency"] = _phase(
        ST_PASS if not repubs else ST_FAIL,
        {"duplicatePublishes": len(repubs)})
    return _report(provider, phases, now, health=health)


def _report(provider, phases, now, health=None):
    verdict = VERDICT_BLOCKED
    live_phases = [phases[n]["status"] for n in
                   ("publication", "confirmation", "analytics", "archive",
                    "idempotency")]
    if all(s == ST_PASS for s in live_phases):
        verdict = VERDICT_LIVE
    elif any(s in (ST_PASS, ST_FAIL) for s in live_phases):
        verdict = VERDICT_MOCK
    return {"schemaVersion": HARNESS_SCHEMA, "provider": provider,
            "checkedAt": now, "phases": phases, "verdict": verdict,
            "health": None if health is None else {
                "state": health["state"], "mode": health["mode"],
                "provenance": health["provenance"]}}
