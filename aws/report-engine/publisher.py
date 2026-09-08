# -*- coding: utf-8 -*-
"""발행 어댑터 (PHASE 8 §15 · §16).

BUILD → VALIDATE → PUBLISH 를 코드에서 분리한다. 앞의 둘은 어디서나 돌고,
마지막 하나만 자격증명을 요구한다.

⚠️⚠️ **가짜 성공을 돌려주지 않는다.**
   권한이 없으면 PUBLISH_BLOCKED_NO_CREDENTIALS 로 끝난다. 로컬에 파일을 하나
   써 놓고 "발행했다"고 말하지 않는다. 그 거짓말은 다음 사람이 index.json 을
   열어 보기 전까지 안 들킨다.

⚠️⚠️ **발행된 보고서는 고치지 않는다**(§16).
   조건부 쓰기(IfNoneMatch="*")로 올린다 — 이미 있으면 412 가 돌아오고,
   그건 오류가 아니라 **보존됐다는 뜻**이다. 덮어쓰기는 코드에 없다.
   내용을 바꿔야 하면 version 을 올려 새 키에 쓴다. v1 은 그대로 남는다.
   특히 사후에 채점 결과가 바뀌었다고 과거 보고서를 조용히 고치는 것을 막는다.

⚠️ 올린 뒤에는 **다시 받아서 확인한다.** 200 이 왔다는 것과 내용이 맞다는 것은 다르다.
"""
import hashlib
import json
import os
import sys

sys.path.insert(0, os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), "_shared"))
import report_contract as rc      # noqa: E402

BLOCKED_NO_CREDENTIALS = "PUBLISH_BLOCKED_NO_CREDENTIALS"
IMMUTABLE_CACHE = "public, max-age=31536000, immutable"
INDEX_KEY = "reports/index.json"


def report_key(report):
    """발행 키. version 이 키에 들어가므로 v1 을 덮어쓸 방법이 없다."""
    rid = report.get("reportId") or ""
    ver = int(report.get("version") or 1)
    return "reports/%s/v%d.json" % (rid.replace(":", "/"), ver)


def content_hash(doc):
    """올린 것과 받은 것이 같은지 볼 때 쓴다. 키 순서를 고정해 재현 가능하게."""
    blob = json.dumps(doc, ensure_ascii=False, sort_keys=True, separators=(",", ":"))
    return hashlib.sha256(blob.encode("utf-8")).hexdigest()


class PublishAdapter:
    """발행 대상. 자격증명이 없으면 스스로 '못 한다'고 말한다."""

    name = "abstract"

    def available(self):
        raise NotImplementedError

    def publish(self, report):
        raise NotImplementedError

    def publish_index(self, index):
        raise NotImplementedError

    def verify(self, report):
        raise NotImplementedError

    def rollback(self, report):
        """§15 — 되돌리기. 불변 발행에서 '지우기'는 없다.

        발행본은 그대로 두고 **색인에서 내린다**. 그래야 링크를 받은 사람의
        보고서가 사라지지 않으면서, 목록에는 안 뜬다.
        """
        raise NotImplementedError


class S3PublishAdapter(PublishAdapter):
    """운영 발행. boto3 와 버킷 권한이 둘 다 있을 때만 동작한다."""

    name = "s3"

    def __init__(self, bucket=None, region=None, public_base=None):
        self.bucket = bucket or os.environ.get("CACHE_BUCKET")
        self.region = region or os.environ.get("CACHE_REGION") or os.environ.get("AWS_REGION")
        self.public_base = public_base or os.environ.get(
            "CACHE_PUBLIC_BASE", "https://earthus-cache-kr.s3.us-east-2.amazonaws.com")
        self._s3 = None

    def _client(self):
        if self._s3 is None:
            import boto3      # 지연 import — boto3 없는 환경에서도 이 파일은 읽힌다
            self._s3 = boto3.client("s3", region_name=self.region)
        return self._s3

    def available(self):
        """쓸 수 있는가. 물어보기만 하고 아무것도 바꾸지 않는다."""
        if not self.bucket:
            return {"ok": False, "reason": BLOCKED_NO_CREDENTIALS,
                    "detail": "CACHE_BUCKET 환경변수가 없다"}
        try:
            import boto3      # noqa: F401
        except ImportError:
            return {"ok": False, "reason": BLOCKED_NO_CREDENTIALS, "detail": "boto3 가 없다"}
        try:
            self._client().head_bucket(Bucket=self.bucket)
        except Exception as e:                      # noqa: BLE001
            return {"ok": False, "reason": BLOCKED_NO_CREDENTIALS, "detail": str(e)[:200]}
        return {"ok": True, "bucket": self.bucket}

    def publish(self, report):
        ok = self.available()
        if not ok["ok"]:
            return dict(ok, published=False)
        if report.get("lifecycle") != "PUBLISHED":
            return {"ok": False, "published": False, "reason": "NOT_VALIDATED",
                    "detail": "발행 단계를 통과하지 않은 리포트는 올리지 않는다"}
        key = report_key(report)
        body = json.dumps(report, ensure_ascii=False, sort_keys=True).encode("utf-8")
        try:
            # IfNoneMatch="*" — 이미 있으면 쓰지 않는다. 덮어쓰기 경로가 아예 없다.
            self._client().put_object(
                Bucket=self.bucket, Key=key, Body=body,
                ContentType="application/json; charset=utf-8",
                CacheControl=IMMUTABLE_CACHE, IfNoneMatch="*")
            return {"ok": True, "published": True, "key": key,
                    "hash": content_hash(report), "url": "%s/%s" % (self.public_base, key)}
        except Exception as e:                      # noqa: BLE001
            if "PreconditionFailed" in str(e) or "412" in str(e):
                # 오류가 아니다 — 이미 보존돼 있다는 뜻이다.
                return {"ok": True, "published": False, "key": key, "alreadyPreserved": True,
                        "url": "%s/%s" % (self.public_base, key)}
            return {"ok": False, "published": False, "reason": "PUT_FAILED", "detail": str(e)[:200]}

    def publish_index(self, index):
        """색인은 **가변**이다. 새 보고서가 늘어야 하므로 조건부 쓰기를 쓰지 않는다.

        발행본 자체는 불변이고, 색인은 그 불변 키들을 가리키는 목록일 뿐이다.
        """
        ok = self.available()
        if not ok["ok"]:
            return dict(ok, published=False)
        body = json.dumps(index, ensure_ascii=False, sort_keys=True).encode("utf-8")
        try:
            self._client().put_object(
                Bucket=self.bucket, Key=INDEX_KEY, Body=body,
                ContentType="application/json; charset=utf-8",
                CacheControl="public, max-age=300")
            return {"ok": True, "published": True, "key": INDEX_KEY,
                    "hash": content_hash(index)}
        except Exception as e:                      # noqa: BLE001
            return {"ok": False, "published": False, "reason": "PUT_FAILED", "detail": str(e)[:200]}

    def verify(self, report):
        """§15 — 올린 뒤 다시 받아서 내용을 대조한다. 200 만 보고 넘어가지 않는다."""
        key = report_key(report)
        try:
            from urllib.request import urlopen
            with urlopen("%s/%s" % (self.public_base, key), timeout=30) as r:
                got = json.loads(r.read().decode("utf-8"))
        except Exception as e:                      # noqa: BLE001
            return {"ok": False, "reason": "FETCH_FAILED", "detail": str(e)[:200]}
        want, have = content_hash(report), content_hash(got)
        return {
            "ok": want == have,
            "key": key,
            "expectedHash": want,
            "actualHash": have,
            "reportId": got.get("reportId"),
            "version": got.get("version"),
            "lifecycle": got.get("lifecycle"),
            "reason": None if want == have else "HASH_MISMATCH",
        }

    def rollback(self, report, index):
        """색인에서 내린다. 발행본은 지우지 않는다 — 받은 링크가 죽지 않게."""
        rid = report.get("reportId")
        out = dict(index)
        years = {}
        for y, rows in (index.get("years") or {}).items():
            years[y] = [r for r in rows if r.get("reportId") != rid]
        out["years"] = years
        out["withdrawn"] = sorted(set(index.get("withdrawn") or []) | {rid})
        return out


class LocalPublishAdapter(PublishAdapter):
    """시험·미리보기용. **운영이 아니라는 사실을 결과에 박아서** 돌려준다."""

    name = "local"

    def __init__(self, root):
        self.root = root

    def available(self):
        return {"ok": True, "root": self.root, "production": False}

    def publish(self, report):
        if report.get("lifecycle") != "PUBLISHED":
            return {"ok": False, "published": False, "reason": "NOT_VALIDATED"}
        key = report_key(report)
        path = os.path.join(self.root, key)
        if os.path.exists(path):
            # 로컬에서도 불변 규칙을 지킨다. 판을 올리지 않으면 다시 쓰지 않는다.
            return {"ok": True, "published": False, "alreadyPreserved": True, "key": key,
                    "production": False}
        os.makedirs(os.path.dirname(path), exist_ok=True)
        with open(path, "w", encoding="utf-8") as fh:
            json.dump(report, fh, ensure_ascii=False, sort_keys=True, indent=1)
        return {"ok": True, "published": True, "key": key, "path": path,
                "hash": content_hash(report), "production": False}

    def publish_index(self, index):
        path = os.path.join(self.root, INDEX_KEY)
        os.makedirs(os.path.dirname(path), exist_ok=True)
        with open(path, "w", encoding="utf-8") as fh:
            json.dump(index, fh, ensure_ascii=False, sort_keys=True, indent=1)
        return {"ok": True, "published": True, "key": INDEX_KEY, "path": path,
                "production": False}

    def verify(self, report):
        path = os.path.join(self.root, report_key(report))
        if not os.path.exists(path):
            return {"ok": False, "reason": "FETCH_FAILED", "detail": "파일이 없다"}
        with open(path, encoding="utf-8") as fh:
            got = json.load(fh)
        want, have = content_hash(report), content_hash(got)
        return {"ok": want == have, "expectedHash": want, "actualHash": have,
                "production": False,
                "reason": None if want == have else "HASH_MISMATCH"}

    def rollback(self, report, index):
        return S3PublishAdapter.rollback(self, report, index)


def next_version(report):
    """§16 — 발행본을 고치는 대신 판을 올린다. 이전 판은 그대로 남는다."""
    out = dict(report)
    out["version"] = int(report.get("version") or 1) + 1
    out["supersedes"] = report.get("reportId") + "#v%d" % int(report.get("version") or 1)
    out["lifecycle"] = "DRAFT"
    out.pop("publishedAt", None)
    out.pop("immutableRef", None)
    return out


def publish_pipeline(report, adapter, *, index=None):
    """§15 — BUILD/VALIDATE 는 이미 끝난 상태로 들어온다. 여기서는 올리고 확인만 한다."""
    avail = adapter.available()
    if not avail.get("ok"):
        return {"stage": "PUBLISH", "ok": False,
                "reason": avail.get("reason", BLOCKED_NO_CREDENTIALS),
                "detail": avail.get("detail"), "published": False}
    put = adapter.publish(report)
    if not put.get("ok"):
        return {"stage": "PUBLISH", "ok": False, "reason": put.get("reason"),
                "detail": put.get("detail"), "published": False}
    check = adapter.verify(report)
    out = {"stage": "PUBLISH", "ok": bool(check.get("ok")), "published": put.get("published"),
           "alreadyPreserved": put.get("alreadyPreserved", False),
           "key": put.get("key"), "url": put.get("url"), "hash": put.get("hash"),
           "verify": check, "adapter": adapter.name,
           "production": avail.get("production", adapter.name == "s3")}
    if index is not None and out["ok"]:
        out["index"] = adapter.publish_index(index)
    return out
