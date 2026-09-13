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
import platform
import sys
import zlib
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

# ── 결정적 gzip — **어디까지 결정적인지 정확히 적는다** ──────────────────────
# mtime=0 이 핵심이다. 기본값은 현재 시각이라 같은 입력이 실행마다 다른 바이트가 된다.
GZIP_MTIME = 0
GZIP_COMPRESSLEVEL = 6           # lambda_package.ZIP_COMPRESSLEVEL 과 같은 값을 쓴다
# gzip 머리말의 OS 바이트를 0xFF 로 못 박는다.
# ⚠️ 정정(2026-09-13): 이 패치는 **CPython 에서는 사실상 no-op** 이다 — CPython 의
#    `_write_gzip_header` 가 이미 b'\xff' 를 박는다(3.12·3.14 실측). "리눅스와 윈도우가
#    OS 바이트에서 갈린다"고 적었던 앞선 주석은 **틀렸다.** 그래도 남겨 둔다: 다른 구현체나
#    미래의 CPython 이 호스트 OS 를 적기 시작하면 그때 이 한 줄이 값을 지킨다.
GZIP_OS_UNKNOWN = 0xFF
GZIP_OS_BYTE_OFFSET = 9          # ID1 ID2 CM FLG MTIME(4) XFL OS

# ⚠️⚠️ **deflate 비트스트림은 파이썬에서 고정할 수 없다.**
#    같은 입력·같은 compresslevel 이라도 zlib 구현이 다르면 압축 결과 바이트가 달라진다.
#    실측(2026-09-13): CPython 3.12(zlib 1.3.1)와 3.14(zlib-ng)가 같은 입력에서 다른
#    rawSha256 을 냈다. 그래서 이 모듈이 보장하는 것은 정확히 이것이다:
#      · 같은 압축기에서는 같은 입력 → 같은 바이트 (시각·로케일·해시시드·정렬 무관)
#      · 압축을 풀면 **어느 압축기에서든 같은 텍스트** (재계산의 근거는 이쪽이다)
#    그리고 압축기가 바뀌어도 보관물이 흔들리지 않게 두 가지를 둔다:
#      ① MANIFEST 가 압축기 신원을 적는다 (아래 `compressor`)
#      ② 같은 키가 이미 있으면 **덮어쓰지 않는다** (`assembler.archive_raw`)
COMPRESSOR = {
    "python": platform.python_version(),
    "zlib": zlib.ZLIB_RUNTIME_VERSION,
    "compresslevel": GZIP_COMPRESSLEVEL,
    "mtime": GZIP_MTIME,
}


class RawArchiveError(RuntimeError):
    """원자료를 보관할 수 없다. **빈 part 를 만들지 않는다.**"""


def sha256_hex(data):
    if isinstance(data, str):
        data = data.encode("utf-8")
    return hashlib.sha256(data).hexdigest()


def _line(payload):
    """한 줄 = 한 객체. 키 순서를 고정한다 — 같은 내용이 같은 바이트가 되도록.

    ⚠️ `allow_nan=False` 다. 기본값은 `NaN`·`Infinity` 를 그대로 뱉는데, 그 둘은 **JSON 이 아니다** —
       파이썬의 관대한 파서는 되읽지만 Athena·Glue 같은 엄격한 파서는 파일 전체를 거부한다.
       재계산하려고 보관하는 물건이 재계산 도구에서 안 열리면 보관한 의미가 없다.
       그래서 여기서 막고 실패로 올린다(값을 0 이나 null 로 바꾸지 않는다 — 그건 자료 조작이다).
    """
    try:
        return json.dumps(payload, ensure_ascii=False, sort_keys=True,
                          allow_nan=False, separators=(",", ":")) + "\n"
    except ValueError as exc:
        raise RawArchiveError(
            "JSON 으로 적을 수 없는 값이 있다(NaN·Infinity 는 JSON 이 아니다): %s" % exc) from exc


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
        # ⚠️ 압축기 신원(파이썬·zlib 판)을 **여기 넣지 않는다.** 넣으면 보관물의 텍스트가
        #    실행 환경에 따라 달라져, 어렵게 지킨 "풀면 어디서나 같은 텍스트" 가 깨진다.
        #    그 신원은 조립 결과(`assembler.archive_raw` → HEALTH 로그)에 남긴다.
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
        try:
            payload = payload.encode("utf-8")
        except UnicodeEncodeError as exc:
            # 상류 제목에 홀로 떨어진 서로게이트(U+D800 등)가 섞여 올 수 있다.
            # json.loads 는 그것을 받아들이지만 utf-8 인코딩은 거부한다.
            # 이 모듈의 실패는 전부 RawArchiveError 여야 한다 — 호출자가 그것만 잡는다.
            raise RawArchiveError("utf-8 로 적을 수 없는 문자가 있다: %s" % exc) from exc
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
        # 풀어낸 텍스트의 해시 — **압축기와 무관하게** 같은 입력이면 같다.
        # 압축 바이트(sha256)는 zlib 구현에 따라 달라질 수 있으므로 이쪽이 더 강한 지문이다.
        "textSha256": sha256_hex(text),
        "compressor": dict(COMPRESSOR),
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
