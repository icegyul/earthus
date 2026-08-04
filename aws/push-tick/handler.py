# -*- coding: utf-8 -*-
"""알림 발송을 주기적으로 두드린다 (ticker)

왜 Lambda 가 필요한가
  실제 발송은 Supabase Edge Function(push-tick)이 한다 — 웹푸시 프로토콜
  (ES256 서명 + AES128GCM 암호화)을 Deno 쪽 라이브러리로 처리하는 게 훨씬 안전하다.
  ⚠️ 그런데 EventBridge 는 HTTP 를 직접 못 부른다(API Destination 권한이 없다).
     그래서 **두드리는 역할만** 하는 작은 함수를 둔다.

⚠️⚠️ **알림이 안 가는 것은 티가 안 난다.** 사용자는 "위험이 없었구나"라고 생각한다.
   그래서 결과를 s3 에 남기고 health 가 그 파일을 본다.
   보낸 건수가 0 인 것은 정상이다(위험이 없을 때). **파일이 안 갱신되는 것**이 사고다.

⚠️ 토큰이 없으면 **아무 일도 안 한다.** 없는 걸 있는 척하지 않는다 —
   설정 전에는 결과 파일에 "설정 안 됨"이라고 적힌다.

결과  s3://<CACHE_BUCKET>/events/push-tick.json
"""

import json
import os
import urllib.error
import urllib.request
from datetime import datetime, timedelta, timezone

import boto3

BUCKET = os.environ["CACHE_BUCKET"]
REGION = os.environ.get("CACHE_REGION") or os.environ.get("AWS_REGION")
URL = os.environ.get("PUSH_TICK_URL", "")
TOKEN = os.environ.get("PUSH_TICK_TOKEN", "")
s3 = boto3.client("s3", region_name=REGION)

DST = "events/push-tick.json"
KST = timezone(timedelta(hours=9))


def put(doc):
    body = json.dumps(doc, ensure_ascii=False, separators=(",", ":")).encode()
    s3.put_object(Bucket=BUCKET, Key=DST, Body=body,
                  ContentType="application/json; charset=utf-8",
                  CacheControl="no-cache")


def handler(event=None, context=None):
    now = datetime.now(timezone.utc).astimezone(KST)
    base = {
        "generated": now.astimezone(timezone.utc).strftime("%Y-%m-%dT%H:%M:00Z"),
        "generatedKst": now.strftime("%Y-%m-%d %H:%M"),
    }

    if not URL or not TOKEN:
        # ⚠️ 설정 전에도 **파일은 갱신한다.** 안 그러면 health 가 "죽었다"고 본다.
        #    죽은 것과 아직 안 붙인 것은 다르다.
        base.update(configured=False,
                    note="PUSH_TICK_URL / PUSH_TICK_TOKEN 이 아직 설정되지 않았습니다. "
                         "알림은 보내지 않습니다.")
        put(base)
        print("[tick] 미설정 — 아무것도 안 함")
        return {"ok": True, "configured": False}

    req = urllib.request.Request(
        URL, method="POST", data=b"{}",
        headers={"Content-Type": "application/json",
                 "x-tick-token": TOKEN,
                 "User-Agent": "earthus-tick/1.0"})
    try:
        with urllib.request.urlopen(req, timeout=60) as r:
            out = json.loads(r.read().decode("utf-8"))
        base.update(configured=True, ok=True, result=out)
        put(base)
        print(f"[tick] {json.dumps(out, ensure_ascii=False)}")
        return {"ok": True, **out}
    except urllib.error.HTTPError as e:
        detail = e.read().decode("utf-8", "replace")[:200]
        base.update(configured=True, ok=False, status=e.code, error=detail)
        put(base)
        # ⚠️ 403 이면 토큰이 안 맞는 것이다. 조용히 넘기면 알림이 영영 안 간다.
        print(f"[tick] HTTP {e.code}: {detail}")
        return {"ok": False, "status": e.code}
    except Exception as e:                                       # noqa: BLE001
        base.update(configured=True, ok=False, error=str(e)[:200])
        put(base)
        print(f"[tick] 실패: {e}")
        return {"ok": False, "error": str(e)[:120]}
