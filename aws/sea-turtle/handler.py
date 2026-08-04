# -*- coding: utf-8 -*-
"""바다거북 이동경로 — 국립해양생물자원관

받은 요청
  "바다거북 이모티콘을 띄어서 위치 표시 해주면 어때?" · "취미에 바다거북 메뉴 만들어주고"

■⚠️⚠️⚠️ **이 자료는 다른 것들과 이용 조건이 다르다. 반드시 지킬 것.**
   공공저작물 **제4유형** — 출처표시 + **상업적 이용금지** + **변경금지**
   (우리가 쓰는 기상청·해양조사원·산림청·TourAPI 는 전부 제1유형이거나 제한 없음이다.
    이것만 다르다.)
   → 지켜야 하는 것:
     · **가공하지 않는다.** 좌표를 그대로 점으로 찍는다.
       ⚠️ 이 자료로 **분석 문장을 만들지 않는다** — 그게 곧 '변경'이다.
          narrative.js·brief 계열에 이 자료를 넣지 말 것.
     · **유료 기능에 섞지 않는다.** 언제나 무료로만 보여준다.
     · 출처를 화면에 분명히 적는다 (좌하단 출처 자리).
   ⚠️ 이 주석을 지우지 말 것. 지우면 다음 사람이 모르고 가공한다.

■⚠️⚠️ **실시간이 아니다.**
   기관 설명 그대로: "추적이 종료된 수신기에 대해서만 조회합니다."
   즉 **이미 끝난 추적의 지나간 경로**다. "지금 여기 헤엄치고 있습니다"가 아니다.
   → 화면에 그 문장을 그대로 적는다. 안 적으면 살아 있는 위치로 읽힌다.

■⚠️ **2026-08-04 현재 기관 서버가 응답하지 않는다.**
   두 기능 모두 HTTP_ERROR(코드 04)를 돌려준다. 키 문제가 아니다 —
   없는 기능 이름은 NO_OPENAPI_SERVICE_ERROR 가 나오는데 이것들은 HTTP_ERROR 다.
   → 서비스는 등록돼 있고 기관 백엔드가 죽어 있다는 뜻이다.
     이 함수는 계속 두드리다가 **살아나면 저절로** 자료를 만든다. (JMA 특보와 같은 방식)

■ 원본  apis.data.go.kr/B553482/SeaTurtleRouteService
          getSeaTurtleMeta   개체 정보 (pttId 없으면 전체)
          getSeaTurtleRoute  pttId 별 경로 (필수: pttId)
        ⚠️ numOfRows 최대 **30**이다. 그보다 크게 줘도 30으로 깎인다 — 페이지로 돌아야 한다.

결과  s3://<CACHE_BUCKET>/events/sea-turtle.json
"""

import json
import os
import time
import urllib.parse
import urllib.request
from datetime import datetime, timedelta, timezone

import boto3

BUCKET = os.environ["CACHE_BUCKET"]
REGION = os.environ.get("CACHE_REGION") or os.environ.get("AWS_REGION")
KEY = os.environ["DATA_GO_KR_KEY"]
s3 = boto3.client("s3", region_name=REGION)

DST = "events/sea-turtle.json"
BASE = "https://apis.data.go.kr/B553482/SeaTurtleRouteService"
UA = {"User-Agent": "earthus/1.0 (dalur@kakao.com)"}
KST = timezone(timedelta(hours=9))

# ⚠️ 기관이 정한 상한이다. 더 크게 줘도 30 으로 깎인다.
PAGE = 30
# ⚠️ 솎기 상한은 없앴다 (위 handler 주석 참고 — 변경금지 때문이다).


def get(op, params, tries=2):
    q = urllib.parse.urlencode(params)
    last = None
    for i in range(tries):
        try:
            req = urllib.request.Request(f"{BASE}/{op}?serviceKey={KEY}&{q}", headers=UA)
            with urllib.request.urlopen(req, timeout=30) as r:
                raw = r.read().decode("utf-8", "replace")
            # ⚠️ 첫 응답 원문을 남긴다. "0건"이 자료가 없어서인지 우리가 잘못 읽어서인지
            #    원문 없이는 구분할 수 없다 — 그 구분이 이 앱에서 제일 중요하다.
            # ⚠️ 기능마다 따로 남긴다. 하나만 남기면 메타만 보이고 경로는 못 본다 —
            #    실제로 그래서 "48마리 읽었는데 경로 0개"의 원인을 못 찾았다.
            if RAW.get(op) is None:
                RAW[op] = raw[:600]
                print(f"[turtle] 원문({op}): {raw[:420]}")
            return json.loads(raw)
        except Exception as e:                                   # noqa: BLE001
            last = e
            if i < tries - 1:
                time.sleep(2)
    raise last


RAW = {}                       # ⚠️ 진단용 — 기능별 첫 응답 원문 (왜 0건인지 보려면 필요하다)


def unwrap(d):
    """⚠️ 포털은 오류를 **200 안에** 담아 준다. 그래서 예외로는 안 잡힌다.
    OpenAPI_ServiceResponse 가 있으면 그게 오류다 — 반드시 먼저 본다."""
    err = (d or {}).get("OpenAPI_ServiceResponse")
    if err:
        h = err.get("cmmMsgHeader") or {}
        raise RuntimeError(f"{h.get('errMsg')} ({h.get('returnReasonCode')})")
    # ⚠️⚠️ **기관마다 응답 껍데기가 다르다.** 여기는 `response` 래퍼가 **없고**
    #    최상위에 바로 header/body 가 온다. 다른 기관(기상청·산림청)은 response 안에 있다.
    #    실측으로 확인했다 — 처음엔 response 만 보다가 48마리를 **0마리로 읽었다.**
    #    오류도 안 났다. 그냥 조용히 비었다. 그래서 둘 다 받는다.
    b = (((d or {}).get("response") or d or {}).get("body")) or {}
    it = (b.get("items") or {}).get("item")
    if it is None:
        it = b.get("items") if isinstance(b.get("items"), list) else []
    if isinstance(it, dict):
        it = [it]
    return it or [], b.get("totalCount")


def num(v):
    try:
        return float(v)
    except (TypeError, ValueError):
        return None


def pages(op, params, cap=250):
    """⚠️⚠️ 한 쪽에 30개뿐이라 긴 추적은 쪽이 아주 많다.
    처음에 cap=40 으로 뒀더니 **여러 개체가 정확히 1,200점**(40×30)에서 잘렸다.
    딱 떨어지는 숫자가 나오면 그건 자료가 아니라 **우리 상한**이다 — 신호로 삼을 것.

    ⚠️ 그래도 상한은 필요하다. 개발계정 트래픽이 **하루 10,000회**다.
       45마리 × 250쪽 = 최악 11,250회라 한도를 넘길 수 있어,
       **서버가 알려준 총 개수(total)를 함께 돌려주고** 잘렸으면 화면에 적는다.
       (자료를 못 다 받는 것보다, 다 받은 척하는 것이 훨씬 나쁘다)

    @returns (행들, 서버가 말한 총 개수)
    """
    out, n, total = [], 1, None
    while n <= cap:
        d = get(op, {**params, "numOfRows": PAGE, "pageNo": n, "_type": "json"})
        rows, t = unwrap(d)
        if t is not None:
            total = int(t)
        if not rows:
            break
        out.extend(rows)
        if total and len(out) >= total:
            break
        n += 1
    return out, total


def handler(event=None, context=None):
    now = datetime.now(timezone.utc).astimezone(KST)
    base = {
        "generated": now.astimezone(timezone.utc).strftime("%Y-%m-%dT%H:%M:00Z"),
        "generatedKst": now.strftime("%Y-%m-%d %H:%M"),
        "source": "국립해양생물자원관 (해양생명 공간정보시스템)",
        "sourceEn": "National Marine Biodiversity Institute of Korea",
        # ⚠️⚠️ 라이선스를 **자료 안에** 넣는다. 화면이 이걸 읽어 그대로 적는다.
        #    코드 주석에만 있으면 화면 만드는 사람이 모른다.
        "license": "공공누리 제4유형 (출처표시·상업적 이용금지·변경금지)",
        "licenseNote": {
            "ko": "⚠️ 이 자료는 **상업적 이용과 변경이 금지**되어 있습니다. "
                  "저희는 좌표를 가공 없이 그대로 보여주기만 하며, 이 자료로 분석 문장을 만들지 않습니다. "
                  "이 화면은 언제나 무료입니다.",
            "en": "Non-commercial, no-derivatives. Shown unmodified; always free.",
        },
        # ⚠️ 기관 설명 원문. 우리가 요약하지 않는다.
        "realtime": False,
        "realtimeNote": {
            "ko": "⚠️⚠️ **실시간이 아닙니다.** 기관 설명 그대로 "
                  "\"추적이 종료된 수신기에 대해서만 조회합니다\" — "
                  "**이미 끝난 추적의 지나간 경로**입니다. 지금 그 자리에 있다는 뜻이 아닙니다.",
            "en": "Not live. Only completed trackers are published — these are past routes.",
        },
    }

    try:
        metas, _ = pages("getSeaTurtleMeta", {})
    except Exception as e:                                       # noqa: BLE001
        # ⚠️ 못 받았다고 파일을 안 올리면 health 가 "우리가 죽었다"고 본다.
        #    원본이 죽은 것과 우리가 죽은 것은 다르다. 사실대로 적어 올린다.
        base.update(ok=False, count=0, error=str(e)[:160],
                    note={"ko": "국립해양생물자원관 서버에서 자료를 받지 못했습니다. "
                                "⚠️ 바다거북이 없다는 뜻이 아니라 **저희가 받지 못했다**는 뜻입니다.",
                          "en": "Could not fetch from the agency. Not an absence of data."})
        _put(base)
        print(f"[turtle] 원본 실패: {e}")
        return {"ok": False, "error": str(e)[:120]}

    turtles, errs = [], {}
    for m in metas:
        ptt = str(m.get("pttId") or m.get("pttid") or "").strip()
        if not ptt:
            continue
        try:
            pts, ptsTotal = pages("getSeaTurtleRoute", {"pttId": ptt})
        except Exception as e:                                   # noqa: BLE001
            errs[ptt] = str(e)[:80]
            continue
        track = []
        for p in pts:
            # ⚠️ 실측한 필드 이름이다: obsrTm · obsrLat · obsrLon (2026-08-04).
            #    추측한 이름(obsLat/lat)으로는 **48마리를 전부 0개로 읽었다.** 오류 없이.
            la, lo = num(p.get("obsrLat")), num(p.get("obsrLon"))
            if la is None or lo is None:
                continue
            track.append({"at": p.get("obsrTm"), "lat": la, "lon": lo})
        if not track:
            continue
        # ⚠️ 시각순으로 세운다. 순서가 섞이면 선이 지그재그가 된다.
        track.sort(key=lambda x: str(x.get("at") or ""))
        # ⚠️⚠️ **솎지 않는다.** 처음엔 400점으로 줄였는데, 그건 이 자료에서 하면 안 되는 일이다 —
        #    제4유형은 **변경금지**이고 점을 골라 버리는 것도 변경이다.
        #    게다가 화면에 "401점"이라고 적히는데 그건 원본 수가 아니라 우리가 솎은 수라
        #    보는 사람에게 거짓을 말하게 된다. 파일이 커지는 쪽을 택한다 —
        #    이 화면은 눌렀을 때만 받으므로 첫 화면에는 부담이 없다.
        turtles.append({
            "pttId": ptt,
            # ⚠️ 기관이 준 필드를 **그대로** 옮긴다. 이름을 바꾸거나 값을 계산하지 않는다.
            # ⚠️ 실측한 필드 이름이다 (2026-08-04). 추측이 아니다.
            "nameKo": m.get("spcKrNm"),
            "nameSci": m.get("spcScinmShort"),
            # ⚠️⚠️ 성별·성체여부가 **숫자 코드**("1")로 온다. 대조표를 받지 못했다 —
            #    1이 수컷인지 암컷인지 모른다. **추측해서 글자로 바꾸지 않는다.**
            #    화면에도 코드 그대로 두거나 아예 안 보여준다. 틀린 성별을 적느니 안 적는 게 낫다.
            "sexCode": m.get("nttyGndr"),
            "adultCode": m.get("nttyDltAt"),
            "weightKg": m.get("nttyWght"), "lengthCm": m.get("nttyLt"),
            "caughtAt": m.get("nttyAcqstDe"), "caughtWhere": m.get("nttyAcqstLcNm"),
            "releasedAt": m.get("dschrgDe"), "releasedWhere": m.get("dschrAcqstLcNm"),
            "manager": m.get("mngInstNm") or m.get("mngPznInstNm"),
            "points": len(track),
            # ⚠️ 서버가 말한 원본 개수. 우리가 받은 수와 다르면 **잘린 것**이다.
            #    화면이 이걸 보고 "원본 N점 중 M점"이라고 적는다. 감추지 않는다.
            "pointsTotal": ptsTotal,
            "truncated": bool(ptsTotal and len(pts) < ptsTotal),
            "first": track[0], "last": track[-1],
            "track": track,
        })

    base.update(ok=True, count=len(turtles),
                totalMeta=len(metas), errors=errs or None,
                turtles=turtles)
    if not turtles:
        base["debugRaw"] = dict(RAW)        # ⚠️ 0건일 때만. 정상이면 안 남긴다.
    _put(base)
    print(f"[turtle] 개체 {len(turtles)}마리 · 점 {sum(t['points'] for t in turtles)}개")
    return {"ok": True, "count": len(turtles)}


def _put(doc):
    body = json.dumps(doc, ensure_ascii=False, separators=(",", ":")).encode()
    s3.put_object(Bucket=BUCKET, Key=DST, Body=body,
                  ContentType="application/json; charset=utf-8",
                  CacheControl="public, max-age=3600")
