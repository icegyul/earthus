# -*- coding: utf-8 -*-
"""원자료 보관 — `events/global.json` → `archive/earth-events/raw/dt=…/hh=…/part-*.jsonl.gz`

왜 원자료를 따로 보관하나
  판정 기준(점수·문턱·결합 규칙·진실 어휘)은 앞으로 바뀐다. 그때 **다시 계산할 수 있어야**
  하고, 다시 계산할 재료는 우리가 해석한 값이 아니라 상류가 준 원본이어야 한다.
  상류(`events/global.json`)는 30분마다 **덮어쓰인다** — 지금 보관하지 않으면 영원히 사라진다.

이 파일이 지키는 것
  · **같은 입력 → 같은 바이트.** gzip mtime=0 · 고정 compresslevel · 정렬된 레코드 순서.
    그래서 같은 회차를 두 번 돌려도 같은 객체가 되고, 덮어쓰기가 손실이 아니다.
  · **키도 내용에서 나온다.** `part-<원본 sha256 앞 12 hex>.jsonl.gz` — 같은 입력은 같은 키,
    다른 입력은 다른 키다. 같은 시간 파티션에 다른 내용이 와도 서로를 덮지 않는다.
  · **해석하지 않는다.** 상류 레코드를 그대로 한 줄에 하나씩 적는다. 정규화·점수·판정은
    여기 들어오지 않는다 — 그것을 넣으면 '원자료'가 아니라 '그때의 우리 해석'이 된다.
  · **FAILURE ≠ EMPTY.** 봉투가 깨졌거나 입력을 못 읽었으면 보관하지 않는다. 빈 part 를
    만들어 두면 "그 시각에 아무 일도 없었다"는 거짓 기록이 남는다.

파일 모양 (JSON Lines, gzip)
    1행   {"schema":"earthus.earth-event-raw/1","type":"MANIFEST", …}
    2행~  {"type":"EVENT","seq":0,"sourceIndex":12,"event":{…상류 레코드 그대로…}}

관련: `docs/3G_POLICY_DECISIONS.md` 결정 ① · `docs/EARTHUS_STORAGE_ARCHITECTURE.md` §1.3
"""
import gzip
import hashlib
import io
import json
import os
import sys
from datetime import datetime, timezone

_HERE = os.path.dirname(os.path.abspath(__file__))
_SHARED = os.path.join(os.path.dirname(_HERE), "_shared")
for _path in (_HERE, _SHARED):
    if _path not in sys.path:
        sys.path.insert(0, _path)

import provenance                                  # noqa: E402

SCHEMA = "earthus.earth-event-raw/1"

RAW_PREFIX = "archive/earth-events/raw/"
PART_PATTERN = "part-*.jsonl.gz"
PART_HEX = 12                    # 키에 쓰는 원본 해시 자릿수

# ── 결정적 gzip ────────────────────────────────────────────────────────────
# mtime=0 이 핵심이다. 기본값은 현재 시각이라 같은 입력이 실행마다 다른 바이트가 된다.
GZIP_MTIME = 0
GZIP_COMPRESSLEVEL = 6           # lambda_package.ZIP_COMPRESSLEVEL 과 같은 값을 쓴다
# gzip 머리말의 OS 바이트. CPython 은 기계에 따라 다른 값을 쓸 수 있으므로 **고정**한다 —
# 고정하지 않으면 리눅스(Lambda)와 윈도우(이 기계)가 같은 입력에서 다른 바이트를 낸다.
GZIP_OS_UNKNOWN = 0xFF
GZIP_OS_BYTE_OFFSET = 9          # ID1 ID2 CM FLG MTIME(4) XFL OS


class RawArchiveError(RuntimeError):
    """원자료를 보관할 수 없다. **빈 part 를 만들지 않는다.**"""


def sha256_hex(data):
    if isinstance(data, str):
        data = data.encode("utf-8")
    return hashlib.sha256(data).hexdigest()


def _line(payload):
    """한 줄 = 한 객체. 키 순서를 고정한다 — 같은 내용이 같은 바이트가 되도록."""
    return json.dumps(payload, ensure_ascii=False, sort_keys=True,
                      separators=(",", ":")) + "\n"


def sort_key(record, index):
    """레코드 정렬 기준. 상류 id 의 **utf-8 바이트** 순서, 같으면 원래 순서.

    ⚠️ 숫자로 정렬하지 않는다. 상류 id 는 문자열이고 숫자가 아닌 것이 섞일 수 있다 —
       그때 정렬이 예외로 죽거나 기계마다 달라지면 바이트 재현성이 깨진다.
    """
    identifier = (record or {}).get("id")
    return (str(identifier if identifier is not None else "").encode("utf-8"), index)


def build_manifest(document, *, source_key, source_body, generated_iso):
    """원자료와 함께 남기는 입력 명세. **이 줄만 읽어도 무엇을 받았는지 알 수 있어야 한다.**"""
    document = document or {}
    rules = document.get("rules") or {}
    events = document.get("events") or []
    return {
        "schema": SCHEMA,
        "type": "MANIFEST",
        "source": {
            "key": source_key,
            "bytes": len(source_body),
            "sha256": sha256_hex(source_body),
            "provider": document.get("source"),
            "sourceFile": document.get("sourceFile"),
            "sourceUrl": document.get("sourceUrl"),
            "license": document.get("license"),
            "termsUrl": document.get("termsUrl"),
        },
        # 상류가 스스로 말한 것 — 우리가 센 것이 아니다
        "upstream": {
            "generated": generated_iso,
            "windowHours": document.get("windowHours"),
            "rules": dict(rules),
            "counts": dict(document.get("counts") or {}),
            "cappedByLimit": bool(rules.get("cappedByLimit")),
        },
        # 우리가 센 것
        "archived": {
            "eventCount": len(events),
            "recordOrder": "sourceId-utf8-bytes",
        },
        "provenance": provenance.resolve_dataset(source_key),
    }


def build_lines(document, *, source_key, source_body, generated_iso):
    """manifest 1행 + 사건 n행. 정렬은 `sort_key` 하나로 정한다."""
    document = document or {}
    events = document.get("events")
    if not isinstance(events, list):
        raise RawArchiveError("events 가 목록이 아니다 — 원자료를 만들 수 없다")
    manifest = build_manifest(document, source_key=source_key,
                              source_body=source_body, generated_iso=generated_iso)
    ordered = sorted(enumerate(events), key=lambda pair: sort_key(pair[1], pair[0]))
    lines = [_line(manifest)]
    for seq, (index, record) in enumerate(ordered):
        lines.append(_line({"type": "EVENT", "seq": seq, "sourceIndex": index,
                            "event": record}))
    return manifest, lines


def gzip_bytes(payload):
    """결정적 gzip. 같은 입력이면 **어느 기계에서도** 같은 바이트여야 한다.

    고정하는 것 셋: `mtime=0` · `compresslevel` · 머리말 OS 바이트.
    파일 이름 필드는 `fileobj` 만 주면 쓰이지 않는다(FNAME 플래그 0).
    """
    if isinstance(payload, str):
        payload = payload.encode("utf-8")
    buffer = io.BytesIO()
    with gzip.GzipFile(fileobj=buffer, mode="wb",
                       compresslevel=GZIP_COMPRESSLEVEL, mtime=GZIP_MTIME) as handle:
        handle.write(payload)
    raw = bytearray(buffer.getvalue())
    if len(raw) <= GZIP_OS_BYTE_OFFSET:
        raise RawArchiveError("gzip 머리말이 온전하지 않다")
    raw[GZIP_OS_BYTE_OFFSET] = GZIP_OS_UNKNOWN
    return bytes(raw)


def partition(generated_iso):
    """`dt=YYYY-MM-DD/hh=HH` — 결정 ① 의 파티션. 봉투 시각으로 정한다.

    ⚠️ 실행 시각으로 정하지 않는다. 같은 입력을 나중에 다시 돌리면 다른 칸에 들어가고,
       그러면 "그 시각의 원자료"가 두 칸에 흩어진다.
    """
    if not generated_iso:
        raise RawArchiveError("봉투에 generated 가 없다 — 파티션을 정할 수 없다")
    value = str(generated_iso).strip()
    if value.endswith("Z"):
        value = value[:-1] + "+00:00"
    try:
        moment = datetime.fromisoformat(value)
    except (TypeError, ValueError) as exc:
        raise RawArchiveError("generated 를 읽을 수 없다: %r" % (generated_iso,)) from exc
    if moment.tzinfo is None:
        moment = moment.replace(tzinfo=timezone.utc)
    moment = moment.astimezone(timezone.utc)
    return "dt=%s/hh=%s" % (moment.strftime("%Y-%m-%d"), moment.strftime("%H"))


def part_name(source_sha256):
    """`part-<원본 sha256 앞 12 hex>.jsonl.gz` — 내용에서 나오는 이름.

    같은 입력은 같은 이름이 되어 재실행이 같은 객체를 다시 쓴다(바이트가 같으므로 손실 없음).
    다른 입력은 다른 이름이 되어 서로를 덮지 않는다.
    """
    digest = str(source_sha256 or "")
    if len(digest) < PART_HEX or any(c not in "0123456789abcdef" for c in digest[:PART_HEX]):
        raise RawArchiveError("원본 sha256 이 없거나 형식이 아니다: %r" % (source_sha256,))
    return "part-%s.jsonl.gz" % digest[:PART_HEX]


def build(document, *, source_key, source_body, generated_iso):
    """원자료 객체 하나를 만든다. **쓰지는 않는다** — 쓰기는 호출자가 문을 지나 한다.

    돌려주는 것:
      {key, bytes, sha256, sourceSha256, partition, eventCount, manifest, body}
    """
    if source_body is None:
        raise RawArchiveError("원본 본문이 없다 — 원자료를 만들 수 없다")
    if isinstance(source_body, str):
        source_body = source_body.encode("utf-8")
    source_digest = sha256_hex(source_body)
    manifest, lines = build_lines(document, source_key=source_key,
                                  source_body=source_body, generated_iso=generated_iso)
    text = "".join(lines)
    body = gzip_bytes(text)
    key = "%s%s/%s" % (RAW_PREFIX, partition(generated_iso), part_name(source_digest))
    return {
        "key": key,
        "bytes": len(body),
        "sha256": sha256_hex(body),
        "sourceSha256": source_digest,
        "sourceBytes": len(source_body),
        "partition": partition(generated_iso),
        "eventCount": manifest["archived"]["eventCount"],
        "lines": len(lines),
        "uncompressedBytes": len(text.encode("utf-8")),
        "manifest": manifest,
        "body": body,
    }


def read(body):
    """되읽기 — 보관한 것을 그대로 복원할 수 있는지 확인하는 용도.

    돌려주는 것: (manifest, [상류 레코드, …])  — 보관 순서 그대로.
    """
    try:
        text = gzip.decompress(body).decode("utf-8")
    except (OSError, EOFError, UnicodeDecodeError) as exc:
        raise RawArchiveError("원자료를 펼 수 없다: %s" % exc) from exc
    manifest, records = None, []
    for number, line in enumerate(text.splitlines(), start=1):
        if not line.strip():
            continue
        try:
            payload = json.loads(line)
        except ValueError as exc:
            raise RawArchiveError("%d행이 JSON 이 아니다: %s" % (number, exc)) from exc
        kind = payload.get("type")
        if kind == "MANIFEST":
            if manifest is not None:
                raise RawArchiveError("MANIFEST 가 둘이다")
            manifest = payload
        elif kind == "EVENT":
            records.append(payload.get("event"))
        else:
            raise RawArchiveError("%d행의 type 을 모른다: %r" % (number, kind))
    if manifest is None:
        raise RawArchiveError("MANIFEST 행이 없다")
    if len(records) != manifest["archived"]["eventCount"]:
        raise RawArchiveError("사건 수가 manifest 와 다르다: %d ≠ %d"
                              % (len(records), manifest["archived"]["eventCount"]))
    return manifest, records
