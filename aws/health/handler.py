# -*- coding: utf-8 -*-
"""수집 감시 — 파이프라인이 멈춘 것을 **아무도 안 볼 때도** 알아챈다.

왜 필요한가
  우리가 만들려는 것(예보 보정·모델 성적)은 **끊기지 않은 기록** 위에서만 나온다.
  알고리즘은 나중에 살 수 있지만 시간은 못 산다 — 8월에 끊긴 자료는 8월에만
  받을 수 있었다. 그런데 지금은 파이프라인이 조용히 죽어도 알 방법이 없다.
  화면에 안 나오는 자료(archive/*)는 더 그렇다. 몇 주 뒤에야 알게 된다.

⚠️ 알림 채널이 없다 (SNS·SES 권한 없음 — 실측).
   그래서 **상태 파일 자체를 알림으로 삼는다.** 사람이 열어도 바로 읽히고,
   앱도 읽을 수 있고, 무엇보다 URL 하나만 확인하면 되는 형태로 만든다.

⚠️ "언제 마지막으로 성공했나"가 아니라 **"주기보다 얼마나 늦었나"**를 본다.
   자료마다 주기가 다르다(구름 1시간, 지진 2분, 영국 예보 3시간).
   같은 "2시간 전"이 지진에는 사고고 영국 예보에는 정상이다.

출력  wind/health.json  (공개 — 앱과 사람이 함께 읽는다)
"""

import json
import os
from datetime import datetime, timedelta, timezone

import boto3

BUCKET = os.environ["CACHE_BUCKET"]
REGION = os.environ.get("CACHE_REGION") or os.environ.get("AWS_REGION")
s3 = boto3.client("s3", region_name=REGION)

DST = "wind/health.json"

# ── 감시 대상 ────────────────────────────────────────────────────
#   key      : S3 객체
#   everyMin : 원본이 갱신되는 주기(분)
#   graceMin : 이만큼 늦어도 정상으로 본다 (원본 지연·재시도 여유)
#   ko       : 사람이 읽을 이름
#   critical : 끊기면 **되돌릴 수 없는** 것 (축적형). 우선순위가 다르다.
#
# ⚠️ critical 의 뜻: 화면이 잠깐 비는 것과, 그날 자료를 영영 못 받는 것은 다르다.
#    구름은 다음 시간에 다시 받으면 되지만, 예보 검증용 archive 는
#    그 시각의 예보를 놓치면 **그 짝은 영원히 못 만든다.**
WATCH = [
    # ── 축적형 (끊기면 복구 불가) ─────────────────────────────
    {"key": "wind/ecmwf-fcst.json",  "everyMin": 360, "graceMin": 180,
     "ko": "ECMWF 예보 (AI·물리)", "critical": True},
    {"key": "wind/kma-fcst.json",    "everyMin": 60,  "graceMin": 60,
     "ko": "기상청 동네예보",       "critical": True},
    {"key": "wind/global.json",      "everyMin": 60,  "graceMin": 60,
     "ko": "전지구 바람 격자",      "critical": True},
    {"key": "wind/series/mountain-gap-daily.json", "everyMin": 60, "graceMin": 90,
     "ko": "산악 예보−실측 축적", "critical": True},

    # ── 표시형 (다음 주기에 회복된다) ─────────────────────────
    {"key": "clouds/meta.json",      "everyMin": 60,  "graceMin": 90,
     "ko": "전지구 구름"},
    {"key": "events/global.json",    "everyMin": 180, "graceMin": 120,
     "ko": "지구 뉴스"},
    {"key": "events/wildfire.json",  "everyMin": 30,  "graceMin": 60,
     "ko": "산불"},
    {"key": "events/kma-warn.json",  "everyMin": 15,  "graceMin": 30,
     "ko": "기상특보"},
    {"key": "events/kma-lightning.json", "everyMin": 5, "graceMin": 25,
     "ko": "낙뢰"},
    {"key": "events/regional.json",  "everyMin": 30,  "graceMin": 60,
     "ko": "각국 기관 재해"},
    {"key": "events/world-alerts.json", "everyMin": 30, "graceMin": 60,
     "ko": "세계 경보"},
    {"key": "events/tsunami-intl.json", "everyMin": 5, "graceMin": 30,
     "ko": "국제 쓰나미 경보"},
    {"key": "ocean/buoys.json",      "everyMin": 30,  "graceMin": 60,
     "ko": "해양 부이"},
    {"key": "ocean/marine.json",     "everyMin": 60,  "graceMin": 90,
     "ko": "해양 격자"},
    {"key": "solar/meta.json",       "everyMin": 30,  "graceMin": 60,
     "ko": "태양 영상"},
    {"key": "wind/air.json",         "everyMin": 60,  "graceMin": 90,
     "ko": "대기질 격자"},
    {"key": "wind/stations.json",    "everyMin": 20,  "graceMin": 60,
     "ko": "지상 관측소"},
    {"key": "events/uk-forecast.json", "everyMin": 180, "graceMin": 120,
     "ko": "영국 예보"},
    {"key": "ocean/cyclone-analog.json", "everyMin": 60, "graceMin": 120,
     "ko": "태풍 유사 사례"},
    {"key": "events/cyclone-tracks.json", "everyMin": 60, "graceMin": 120,
     "ko": "태풍 경로 보관"},
    # ⚠️⚠️ **없어진 파일을 계속 감시하면 감시기 전체가 무시당한다.**
    #    events/jma-typhoon.json 을 여기서 보고 있었는데, 그 파일은
    #    typhoon-official.json 으로 대체되어 **아무도 안 쓴다.**
    #    그래서 21시간째 dead 로 떠 있었고, overall 이 늘 critical 이었다.
    #    실제로 그 옆에 있던 **진짜 고장(산악 축적 15시간 중단)을 하마터면 같이 넘길 뻔했다.**
    #    → 늑대가 없는데 우는 감시기는 진짜 늑대를 숨긴다. 항목을 갈아 끼운다.
    {"key": "events/typhoon-official.json", "everyMin": 60, "graceMin": 120,
     "ko": "태풍 공식 예보 (기상청·JMA·NHC)"},
    # ⚠️ 새로 만든 파이프라인은 **만든 날 여기에 넣는다.** 안 넣으면 죽어도 조용하다.
    #    실측(2026-08-03): 아래 둘이 각각 31분·371분 밀려 있었는데 감시 밖이라
    #    아무도 몰랐고, 사람이 손으로 재 보고서야 알았다.
    {"key": "clouds/gk2a/meta.json", "everyMin": 10, "graceMin": 25,
     "ko": "천리안2A 위성영상"},
    {"key": "wind/pressure-ea.json", "everyMin": 60, "graceMin": 90,
     "ko": "동아시아 기압 격자 (등압선)"},
    {"key": "wind/air-state.json", "everyMin": 1440, "graceMin": 360,
     "ko": "하루 한 번 대기 상태 판정"},
    {"key": "events/quake-asia.json", "everyMin": 10, "graceMin": 25,
     "ko": "지진 (기상청·JMA)"},
    # ⚠️ 하루 한 번이면 충분하다 — 원본(네바다 MIDAS)이 그보다 자주 안 바뀐다.
    {"key": "events/crustal.json", "everyMin": 1440, "graceMin": 720,
     "ko": "땅의 움직임 (GNSS)"},
    {"key": "events/social-drafts.json", "everyMin": 60, "graceMin": 180,
     "ko": "SNS 초안"},
    # ── 2026-08-04 추가 ────────────────────────────────────────
    # ⚠️ 만든 날 여기 안 넣으면, 죽어도 화면에 옛 자료가 그대로 떠 있어 아무도 모른다.
    #    (mountain-verify 가 15시간 죽어 있던 게 정확히 그래서였다)
    {"key": "events/lightning.json", "everyMin": 10, "graceMin": 30,
     "ko": "낙뢰 (기상청·JMA)"},
    # ⚠️⚠️ 이안류는 **여름 한정**이다. 비수기에 rip 이 0곳이어도 고장이 아니다 —
    #    이 감시는 "파일이 새로 올라오는가"만 본다. 내용 판단은 화면이 한다.
    {"key": "events/coast-kr.json", "everyMin": 15, "graceMin": 45,
     "ko": "이안류·조위 실측 (국립해양조사원)"},
    # ⚠️ 3시간마다 나온다(2·5·8…시 분석 → 3·6·9…시 제공). 여유를 넉넉히 준다.
    {"key": "events/forest-fire-kr.json", "everyMin": 180, "graceMin": 260,
     "ko": "산불위험예보 (산림청)"},
    {"key": "wind/korea-air-obs.json", "everyMin": 60, "graceMin": 130,
     "ko": "대기질 실측 (에어코리아)"},
    # ⚠️⚠️ AMeDAS 는 **정식 API 가 아니다.** JMA 가 방재 사이트용으로 공개한 JSON 이라
    #    규격을 보장한다고 문서로 약속한 적이 없다. 구조가 바뀌어도 공지가 없을 수 있고,
    #    그러면 화면에는 옛 값이 그대로 떠 있는다. → 감시가 특히 중요하다.
    {"key": "wind/jp-amedas.json", "everyMin": 10, "graceMin": 40,
     "ko": "일본 AMeDAS 실측 (1,280지점)"},
    # ⚠️⚠️ 이 감시는 **우리 수집기가 도는지**만 본다.
    #    원본(JMA 특보)이 살아 있는지는 파일 안의 live 값이 말한다 — 다른 것이다.
    #    2026-08-04 현재 원본은 68일째 멈춰 있고, 우리 수집기는 정상이다.
    #    되살아나면 live 가 true 로 바뀌고 화면이 저절로 특보를 보여준다.
    {"key": "events/jma-warn.json", "everyMin": 30, "graceMin": 90,
     "ko": "일본 특보 감시 (되살아나면 자동 재개)"},
    # ⚠️⚠️ **안 가는 알림은 티가 안 난다.** 사용자는 "위험이 없었구나"라고 생각한다.
    #    보낸 건수가 0 인 것은 정상이다(위험이 없을 때).
    #    **파일이 안 갱신되는 것**이 사고다 — 그러면 아무에게도 안 가고 있다.
    {"key": "events/push-tick.json", "everyMin": 5, "graceMin": 20,
     "ko": "알림 발송 (웹푸시)"},
]

# ── 축적형: **있어야 할 파일이 실제로 있는가** ─────────────────
#   ⚠️ 목록 조회(ListBucket)로 "최근 파일이 있나"를 보려 했는데 람다 역할에
#      s3:ListBucket 권한이 없다(실측). 그런데 못 하게 된 게 오히려 낫다 —
#      "뭔가 새 파일이 있다"보다 **"돌았어야 할 그 회차가 파일을 남겼나"**가
#      정확한 질문이다. 키가 시각으로 정해지므로 직접 짚어 확인할 수 있다.
#
#   fn(now) → [(설명, 키), …]  최근 회차부터 과거 순
def exp_ecmwf(now):
    """ECMWF 는 00·06·12·18Z 에 돌고, 공개까지 여덟 시간 남짓 걸린다.
       → 지금으로부터 그만큼 지난 회차가 파일을 남겼어야 한다."""
    out = []
    t = now - timedelta(hours=ECMWF_LAG_H)
    t = t.replace(minute=0, second=0, microsecond=0)
    t = t.replace(hour=(t.hour // 6) * 6)
    for k in range(3):                       # 최근 3회차 (18시간 치)
        r = t - timedelta(hours=6 * k)
        out.append((f"{r:%m-%d %H}Z 회차", f"archive/ecmwf/{r:%Y%m%d%H}.json"))
    return out


def exp_verify(now):
    """매시 예보 보관. 방금 시각은 아직 안 돌았을 수 있으니 한 시간 전부터."""
    out = []
    t = now.replace(minute=0, second=0, microsecond=0) - timedelta(hours=1)
    for k in range(3):
        r = t - timedelta(hours=k)
        out.append((f"{r:%m-%d %H}시", f"archive/verify/fc/{r:%Y%m%d%H}.json"))
    return out


def exp_wind(now):
    out = []
    t = now.replace(minute=0, second=0, microsecond=0) - timedelta(hours=1)
    for k in range(3):
        r = t - timedelta(hours=k)
        out.append((f"{r:%m-%d %H}시",
                    f"archive/wind/dt={r:%Y-%m-%d}/hh={r:%H}/part.jsonl.gz"))
    return out


ECMWF_LAG_H = 9        # ECMWF 공개 지연 (실측: 18Z 회차가 다음날 02:40Z 에 들어왔다)

# ⚠️ 최근 3회차 중 **하나라도** 있으면 ok. 셋 다 없으면 dead.
#    한 회차만 보면 원본 지연 때마다 거짓 경보가 뜬다.
def exp_mtgap(now):
    """산악 차이 — 매시 35분에 돈다. 방금 시각은 아직일 수 있으니 한 시간 전부터."""
    out = []
    t = now.replace(minute=0, second=0, microsecond=0) - timedelta(hours=1)
    for k in range(3):
        r = t - timedelta(hours=k)
        out.append((f"{r:%m-%d %H}시", f"archive/mtgap/{r:%Y%m%d%H}.json"))
    return out


EXPECTED = [
    {"ko": "ECMWF 보관 (AI·물리 예보)", "fn": exp_ecmwf},
    {"ko": "산악 차이 보관", "fn": exp_mtgap},
    {"ko": "예보 검증 보관",             "fn": exp_verify},
    {"ko": "바람 보관",                  "fn": exp_wind},
]

NOW = None          # 핸들러가 채운다


def age_min(dt):
    return (NOW - dt).total_seconds() / 60.0


def verdict(age, every, grace):
    """늦음을 세 단계로. ⚠️ 주기 대비로 판정한다 — 절대 시간이 아니다."""
    if age <= every + grace:
        return "ok"
    if age <= (every + grace) * 3:
        return "late"                 # 한 번 걸렀다. 다음에 회복될 수 있다.
    return "dead"                     # 반복 실패. 사람이 봐야 한다.


def head(key):
    """객체의 LastModified. 없으면 None."""
    try:
        r = s3.head_object(Bucket=BUCKET, Key=key)
        return r["LastModified"].astimezone(timezone.utc)
    except Exception:                                        # noqa: BLE001
        return None


def generated_of(key):
    """본문의 generated 를 읽는다.
    ⚠️ LastModified 만 믿으면 안 된다. 람다가 **실패한 옛 내용을 다시 써도**
       LastModified 는 갱신된다 — 그러면 죽은 파이프라인이 정상으로 보인다.
       본문의 generated 가 안 움직이는 것이 진짜 신호다."""
    if not key.endswith(".json"):
        return None
    try:
        body = s3.get_object(Bucket=BUCKET, Key=key)["Body"].read(4096)
        # 앞부분만 읽어 generated 를 찾는다 (큰 파일을 통째로 안 받는다)
        txt = body.decode("utf-8", "replace")
        i = txt.find('"generated"')
        if i < 0:
            return None
        seg = txt[i:i + 80]
        q = seg.find('"', seg.find(":"))
        val = seg[q + 1:seg.find('"', q + 1)]
        for fmt in ("%Y-%m-%dT%H:%M:%SZ", "%Y-%m-%dT%H:%M:00Z", "%Y-%m-%dT%H:%MZ"):
            try:
                return datetime.strptime(val, fmt).replace(tzinfo=timezone.utc)
            except ValueError:
                continue
    except Exception:                                        # noqa: BLE001
        pass
    return None


def handler(event=None, context=None):
    global NOW
    NOW = datetime.now(timezone.utc)

    items = []
    for w in WATCH:
        lm = head(w["key"])
        gen = generated_of(w["key"]) if lm else None
        # ⚠️ 둘 중 **오래된 쪽**으로 판정한다. 파일은 새로 쓰였는데 내용이
        #    안 바뀐 경우(실패 후 재기록)를 잡기 위해서다.
        ref = gen or lm
        if ref is None:
            items.append({"key": w["key"], "ko": w["ko"], "state": "missing",
                          "critical": bool(w.get("critical")),
                          "ageMin": None, "expectMin": w["everyMin"]})
            continue
        a = round(age_min(ref))
        items.append({
            "key": w["key"], "ko": w["ko"],
            "state": verdict(a, w["everyMin"], w["graceMin"]),
            "critical": bool(w.get("critical")),
            "ageMin": a, "expectMin": w["everyMin"],
            "generated": gen.strftime("%Y-%m-%dT%H:%MZ") if gen else None,
            "written": lm.strftime("%Y-%m-%dT%H:%MZ") if lm else None,
        })

    for g in EXPECTED:
        slots = g["fn"](NOW)
        found = [(lab, k) for lab, k in slots if head(k) is not None]
        missing = [lab for lab, k in slots if head(k) is None]
        if len(found) == len(slots):
            st = "ok"
        elif found:
            st = "late"          # 최근 회차가 비었지만 그 전엔 들어왔다
        else:
            st = "dead"          # 최근 3회차가 통째로 비었다 — 사람이 봐야 한다
        items.append({
            "key": slots[0][1].rsplit("/", 1)[0] + "/",
            "ko": g["ko"], "state": st, "critical": True,
            "ageMin": None, "expectMin": None,
            "slots": [{"회차": lab, "있음": any(k2 == k for _, k2 in found)}
                      for lab, k in slots],
            "missing": missing,
        })

    bad = [i for i in items if i["state"] in ("late", "dead", "missing")]
    crit = [i for i in bad if i["critical"]]
    overall = "ok"
    if any(i["state"] in ("dead", "missing") for i in crit):
        overall = "critical"
    elif crit:
        overall = "warn"
    elif any(i["state"] in ("dead", "missing") for i in bad):
        overall = "warn"
    elif bad:
        overall = "minor"

    # 사람이 먼저 읽는다 — 나쁜 것을 위로 올린다
    order = {"missing": 0, "dead": 1, "late": 2, "ok": 3}
    items.sort(key=lambda i: (order[i["state"]], not i["critical"], i["ko"]))

    doc = {
        "generated": NOW.strftime("%Y-%m-%dT%H:%M:00Z"),
        "overall": overall,
        "summary": (f"{len(items)}개 중 정상 {len(items) - len(bad)}개"
                    + (f" · 지연·중단 {len(bad)}개" if bad else "")
                    + (f" (축적형 {len(crit)}개 포함)" if crit else "")),
        "note": {
            "ko": "각 자료가 **자기 주기보다** 얼마나 늦었는지를 봅니다. "
                  "critical 은 끊기면 되돌릴 수 없는 축적형 자료입니다 — "
                  "그 시각의 예보를 놓치면 검증 짝을 영영 만들 수 없습니다.",
            "en": "Lateness is judged against each source's own cadence. "
                  "'critical' marks accumulating archives: a missed run "
                  "cannot be backfilled.",
        },
        "states": {
            "ok": "주기 안", "late": "한 번 거름",
            "dead": "반복 실패 — 사람이 봐야 함", "missing": "파일 없음",
        },
        "items": items,
    }

    body = json.dumps(doc, ensure_ascii=False, indent=1).encode()
    s3.put_object(Bucket=BUCKET, Key=DST, Body=body,
                  ContentType="application/json; charset=utf-8",
                  CacheControl="no-cache")
    print(f"[health] {overall} — {doc['summary']}")
    for i in items:
        if i["state"] != "ok":
            print(f"  {i['state']:8s} {'⚠️' if i['critical'] else '  '} "
                  f"{i['ko']} — {i['ageMin']}분 (주기 {i['expectMin']}분)")
    return {"overall": overall, "bad": len(bad)}
