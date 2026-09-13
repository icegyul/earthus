# -*- coding: utf-8 -*-
"""PHASE 3G — Earth Event Assembler Lambda 진입점.

하는 일: `events/global.json` 하나를 읽어 `assembler.assemble()` 을 지나
**PRIVATE/SHADOW EarthEvent 정본**을 만든다.

⚠️⚠️ **이 함수는 아직 AWS 에 배포되지 않았다.** 이번 단계의 승인 범위는 로컬·픽스처·
   staging 실행뿐이다(AWS WRITE = 0). 그래서 기본값이 이렇다:
     · `mode` 기본값 = STAGING — LIVE 는 `allowLive` 없이 거부된다
     · `writer` 없음 = 아무것도 쓰지 않고 **쓰기 계획만** 돌려준다
     · 정본 접두사가 PRIVATE 인지 매번 확인한다 (`events/` 에 쓰지 않는다)

FAIL-CLOSED (실패를 빈 결과로 바꾸지 않는다)
     · 입력 객체를 읽을 수 없다            → 실패. 이전 산출물을 지우지 않는다
     · 봉투가 깨졌다 / 다른 출처 파일이다   → 실패
     · `generated` 가 없거나 읽을 수 없다   → 실패 (시간을 복원할 수 없다)
     · 입력이 자기 관측 창보다 오래됐다      → 실패 (지금을 말하지 않는다)
     · 사건 하나라도 정규화에 실패했다        → 실패 (부분 조립 금지)
     · `event_id` 를 만들 수 없다           → 실패 (임의 id 금지)
     · `event_id` 가 겹친다                 → 실패 (한 사건이 정본 둘을 갖는다)
     · 공개 접두사에 쓰려 했다               → 실패
   반대로 **사건이 0건인 정상 입력은 정상 empty** 다 — 실패가 아니다.
"""
import json
import os
import sys
from datetime import datetime, timezone

_HERE = os.path.dirname(os.path.abspath(__file__))
_SHARED = os.path.join(os.path.dirname(_HERE), "_shared")
for _path in (_HERE, _SHARED):
    if _path not in sys.path:
        sys.path.insert(0, _path)

import assembler                                # noqa: E402

BUCKET = os.environ.get("CACHE_BUCKET", "earthus-cache-kr")
REGION = os.environ.get("CACHE_REGION") or os.environ.get("AWS_REGION") or "us-east-2"

# 승인 없이 운영 쓰기가 일어나지 않게 환경변수로도 문을 둔다.
ALLOW_LIVE_ENV = "EARTH_EVENTS_ALLOW_LIVE_WRITE"


class InputUnavailable(assembler.AssemblyError):
    """입력을 읽지 못했다. **빈 결과가 아니다** — 아무것도 쓰지 않고 실패로 끝낸다."""


def _s3():
    import boto3
    return boto3.client("s3", region_name=REGION)


def read_input(s3=None, *, key=assembler.INPUT_KEY, local=None):
    """입력을 읽는다. 못 읽으면 **모른다고 말한다** — 빈 문서를 만들지 않는다.

    `local` 이 주어지면 그 파일을 읽는다(픽스처·staging 실행).
    """
    if local:
        try:
            with open(local, "rb") as handle:
                body = handle.read()
        except OSError as exc:
            raise InputUnavailable("입력 파일을 읽을 수 없다: %s: %s"
                                   % (local, exc)) from exc
    else:
        if s3 is None:
            raise InputUnavailable("S3 판독기가 없다 — 입력을 읽을 수 없다")
        try:
            body = s3.get_object(Bucket=BUCKET, Key=key)["Body"].read()
        except Exception as exc:                            # noqa: BLE001
            # NoSuchKey·AccessDenied·네트워크 — 구별하지 않고 전부 실패다. 어느 쪽이든
            # "사건이 없다"는 뜻이 아니기 때문이다.
            raise InputUnavailable("입력 객체를 읽을 수 없다: s3://%s/%s: %s: %s"
                                   % (BUCKET, key, type(exc).__name__, exc)) from exc
    try:
        document = json.loads(body.decode("utf-8"))
    except (UnicodeDecodeError, ValueError) as exc:
        raise InputUnavailable("입력이 JSON 이 아니다: %s" % exc) from exc
    return document, body


def staging_writer(directory):
    """staging 쓰기. **S3 가 아니다** — 로컬 디렉터리에 같은 키 구조로 쓴다.

    같은 키 구조를 그대로 쓰는 이유는, 나중에 실제 쓰기를 승인받을 때 경로 규칙을
    다시 만들지 않아도 되게 하기 위해서다.
    """
    def write(key, body):
        assembler.assert_not_public(key)        # staging 에서도 같은 문을 지난다
        path = os.path.join(directory, *key.split("/"))
        os.makedirs(os.path.dirname(path), exist_ok=True)
        with open(path, "wb") as handle:
            handle.write(body)
    return write


def s3_writer(s3):
    """운영 쓰기. 승인 없이는 여기까지 오지 않는다."""
    def write(key, body):
        assembler.assert_not_public(key)
        s3.put_object(Bucket=BUCKET, Key=key, Body=body,
                      ContentType="application/json; charset=utf-8",
                      CacheControl="no-store")
    return write


def now_epoch(event):
    """기준 시각. 입력으로 받은 값이 있으면 그것을 쓴다(재현 가능한 시험을 위해).

    ⚠️ 시각을 지어내지 않는다. 주어지지 않으면 실행 시각이고, 그 사실을 결과에 적는다.
    """
    given = (event or {}).get("nowEpoch")
    if isinstance(given, (int, float)) and not isinstance(given, bool):
        return float(given), "GIVEN"
    return datetime.now(timezone.utc).timestamp(), "RUNTIME"


def handler(event=None, context=None):
    """진입점.

    payload
      {"mode": "STAGING"|"LIVE",       기본 STAGING
       "dryRun": true,                 기본 true — 쓰기 계획만 만든다
       "localInput": "…/global.json",  주면 S3 대신 이 파일을 읽는다
       "stagingDir": "…",              dryRun=false·STAGING 일 때 쓸 디렉터리
       "nowEpoch": 1757757900,         기준 시각(시험용)
       "allowLive": false}             LIVE 쓰기 승인 표시. 환경변수도 함께 있어야 한다
    """
    event = event or {}
    mode = str(event.get("mode") or assembler.STAGING).upper()
    dry_run = event.get("dryRun")
    dry_run = True if dry_run is None else bool(dry_run)
    reference, reference_kind = now_epoch(event)

    allow_live = bool(event.get("allowLive")) and \
        os.environ.get(ALLOW_LIVE_ENV) == "1"

    s3 = None
    local = event.get("localInput")
    if not local:
        s3 = _s3()
    document, body = read_input(s3, local=local)

    writer = None
    if not dry_run:
        if mode == assembler.LIVE:
            if not allow_live:
                raise assembler.LiveWriteRefused(
                    "LIVE 쓰기가 승인되지 않았다 — payload.allowLive 와 환경변수 %s=1 이 둘 다 필요하다"
                    % ALLOW_LIVE_ENV)
            writer = s3_writer(s3 or _s3())
        else:
            staging_dir = event.get("stagingDir")
            if not staging_dir:
                raise assembler.AssemblyError(
                    "STAGING 쓰기에는 stagingDir 이 필요하다 — 어디에 쓸지 지어내지 않는다")
            writer = staging_writer(staging_dir)

    result = assembler.assemble(document, now_epoch=reference, source_body=body,
                               mode=mode, writer=writer, allow_live=allow_live)

    health = result["stages"]["HEALTH"]
    summary = {
        "ok": True,
        "mode": mode,
        "dryRun": dry_run,
        "nowEpochKind": reference_kind,
        "input": {"key": local or assembler.INPUT_KEY,
                  "bytes": result["stages"]["INPUT"]["bytes"],
                  "sha256": result["stages"]["INPUT"]["sha256"],
                  "generated": result["envelope"].get("generated"),
                  "ageMin": result["stages"]["FRESHNESS"]["ageMin"],
                  "truncated": result["stages"]["FRESHNESS"]["truncated"]},
        "events": len(result["events"]),
        "status": health["status"],
        "canonicalWritten": health["canonicalWritten"],
        "canonicalPlanned": health["canonicalPlanned"],
        "rawObject": health["rawObject"],
        "rawWritten": health["rawWritten"],
        "rawSha256": health["rawSha256"],
        "publicWrites": health["publicWrites"],
        "indexConsistency": "%s(%s)" % (health["indexConsistency"],
                                        health["indexConsistencyMode"]),
        "truthStatus": result["stages"]["TRUTH_STATUS"],
        "normalEmpty": health["normalEmpty"],
    }
    print("[3g] " + json.dumps(summary, ensure_ascii=False, sort_keys=True))
    return {"summary": summary, "stages": result["stages"]}


def main(argv=None):
    """로컬 실행. `python handler.py --local <파일> [--staging-dir <디렉터리>]`"""
    argv = list(argv if argv is not None else sys.argv[1:])
    payload = {}
    while argv:
        flag = argv.pop(0)
        if flag == "--local":
            payload["localInput"] = argv.pop(0)
        elif flag == "--staging-dir":
            payload["stagingDir"] = argv.pop(0)
            payload["dryRun"] = False
        elif flag == "--now-epoch":
            payload["nowEpoch"] = float(argv.pop(0))
        elif flag == "--json":
            payload["_json"] = True
        else:
            raise SystemExit("모르는 인자: %s" % flag)
    want_json = payload.pop("_json", False)
    result = handler(payload)
    if want_json:
        print(json.dumps(result, ensure_ascii=False, indent=2, sort_keys=True,
                         default=str))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
