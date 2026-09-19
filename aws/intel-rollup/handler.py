# -*- coding: utf-8 -*-
"""intel-rollup Lambda — 변화 창고(P2(a))를 매시 :20 에 굴린다. 계산은 rollup.py, 여기는 S3 입출력뿐.

읽는 것   archive/{buoy,cyclone,solar,wind}/dt=…/hh=…/part.jsonl.gz   (archiver 가 매시 :05 에 쓴다)
          지금 시간부터 거슬러 3개 + 창마다 기준 시각 근처 몇 개. **정확한 키로 GET 만 한다** —
          ListBucket 이 필요 없다. 그래서 deploy-python.sh 의 기본 역할(GetObject·PutObject)로 돈다.
          ⚠️ 그 대신 없는 키는 404 가 아니라 403 으로 온다(archiver roll_gaps 주석과 같은 사정).
             둘 다 '없음'으로 본다. 그 밖의 오류는 '없음'과 섞지 않고 readErrors 로 남긴다.
쓰는 것   archive/intel-change/{layer}.json   층마다 하나 (buoy·cyclone·solar·wind)
          archive/intel-change/index.json     무엇을 만들었고 무엇을 왜 안 만들었는지

왜 계획의 `intel/change/{layer}.json` 이 아닌가
  `intel/` 은 publication_privacy 표 어디에도 없는 접두사다(공개도 비공개도 아님 → UNKNOWN).
  write_policy 가 그런 목적지를 DENY_UNKNOWN_PREFIX 로 막고, 버킷 정책도 열지 않아 앱이 못 읽는다.

왜 공개 접두사(ocean/·wind/·events/·solar/)가 아니라 비공개 archive/ 인가 — 결정
  1) 지금 이 파일을 읽을 쪽은 **브라우저가 아니라 패킷 빌더 Lambda** 다(LAYER-PLAN P3). P1 이 이미
     같은 길을 갔다 — 인텔 절은 따로 공개하지 않고 빌더가 이미 공개되는 패킷 안에 복사한다
     (aws/cyclone-analog/intel_v1.py 머리말). 빌더는 역할 권한으로 archive/ 를 읽는다.
  2) 바람 층은 Open-Meteo 파생이고 archive 행의 라이선스가 UNVERIFIED 다. 새 공개 파생물을 늘리지
     않는다. 공개로 옮기는 것은 소비자가 생기고 라이선스가 정리된 뒤 이 상수 하나를 바꾸는 일이다
     (그때는 층마다 한 접두사 — 바람은 wind/, 부이는 ocean/ — 로 나누고 publication_privacy 에 맞춘다).
  3) archive/ 는 원자료 자리이지만 파생물 선례가 있다(archive/canonical/v1 · archive/governance/v1).
     파생임을 이름(intel-change)과 문서의 schema·method 로 밝힌다. 원자료 경로(archive/<dataset>/dt=…)와
     겹치지 않는다 — archiver 의 데이터셋 이름에 intel-change 는 없다.

⚠️ 쓰기 키는 모듈 상수 + 지역 함수로만 만든다. write_path(값 추적)가 접두사를 증명할 수 있어야
   write_policy 가 ALLOW_PRIVATE 로 본다 — 사전 조회(KEYS[layer])나 여러 접두사 루프는 증명이 안 된다.

이벤트
  {}                        전 층을 만들어 쓴다
  {"layers": ["buoy"]}      고른 층만 (색인도 그 층만 적는다 — 다른 층 파일은 건드리지 않는다)
  {"dryRun": true}          읽고 계산만, 쓰지 않는다. 요약을 돌려준다(배포 직후 확인용)
"""
import json
import os
from datetime import datetime, timezone

import rollup

OUT_PREFIX = "archive/intel-change/"
INDEX_KEY = OUT_PREFIX + "index.json"

_CLIENT = None
_MISSING_CODES = ("NoSuchKey", "404", "NotFound", "AccessDenied", "403")


def change_key(layer):
    return OUT_PREFIX + layer + ".json"


def _client():
    """boto3 는 여기서만 부른다 — 시험은 가짜 클라이언트를 넣는다."""
    global _CLIENT
    if _CLIENT is None:
        import boto3
        _CLIENT = boto3.client("s3", region_name=os.environ.get("CACHE_REGION") or os.environ.get("AWS_REGION"))
    return _CLIENT


def make_reader(client, bucket):
    """rollup 이 부르는 reader(key) → 바이트 | None(없음). 그 밖의 오류는 그대로 던진다."""
    def read(key):
        try:
            obj = client.get_object(Bucket=bucket, Key=key)
        except Exception as exc:                              # noqa: BLE001
            code = str(((getattr(exc, "response", None) or {}).get("Error") or {}).get("Code") or "")
            if code in _MISSING_CODES:
                return None
            raise
        return obj["Body"].read()
    return read


def _body(doc):
    return json.dumps(doc, ensure_ascii=False, separators=(",", ":")).encode("utf-8")


def run(now, client, bucket, layers=None, dry_run=False):
    docs = rollup.build_all(now, make_reader(client, bucket), layers)
    bodies = {layer: _body(doc) for layer, doc in docs.items()}
    keys = {layer: change_key(layer) for layer in docs}
    sizes = {layer: len(b) for layer, b in bodies.items()}
    index = rollup.build_index(now, docs, keys, sizes)
    written = []
    if not dry_run:
        for layer in sorted(bodies):
            client.put_object(Bucket=bucket, Key=change_key(layer), Body=bodies[layer],
                              ContentType="application/json; charset=utf-8", CacheControl="no-cache")
            written.append(change_key(layer))
        client.put_object(Bucket=bucket, Key=INDEX_KEY, Body=_body(index),
                          ContentType="application/json; charset=utf-8", CacheControl="no-cache")
        written.append(INDEX_KEY)
    for layer, row in index["layers"].items():
        print("[intel-rollup] %s %s 키 %d %s %dB" % (layer, row.get("status"), row.get("keys", 0),
                                                    row.get("windows") or row.get("reason"), sizes.get(layer, 0)))
    return {"ok": all(d.get("status") != "error" for d in docs.values()),
            "dryRun": bool(dry_run), "written": written, "layers": index["layers"]}


def handler(event, context):
    event = event or {}
    return run(datetime.now(timezone.utc), _client(), os.environ["CACHE_BUCKET"],
               layers=event.get("layers"), dry_run=bool(event.get("dryRun")))
