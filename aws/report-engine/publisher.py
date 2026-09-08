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
import governance as gov          # noqa: E402
import publication_privacy as priv  # noqa: E402

BLOCKED_NO_CREDENTIALS = "PUBLISH_BLOCKED_NO_CREDENTIALS"
IMMUTABLE_CACHE = "public, max-age=31536000, immutable"

# ⚠️⚠️ 발행본은 `reports/` 가 아니라 **`reports/published/`** 아래에 산다.
#
#   버킷 정책은 이 접두사 **하나만** 연다. `reports/` 의 나머지에는 부여가 없고
#   S3 는 기본 거부이므로 익명 GET 이 403 이다.
#
#   왜 `reports/*` 를 통째로 열지 않나. 지금도 초안은 못 올라간다 —
#   publish() 가 lifecycle != PUBLISHED 를 거부하고 check_public_write 가 한 번 더
#   본다. 그러나 그건 **쓰는 쪽 한 겹**이다. 그 한 겹이 깨지는 날
#   `reports/` 가 통째로 열려 있으면 초안이 그 순간 공개된다.
#   접두사를 가르면 쓰는 쪽이 깨져도 **읽히지 않는다.**
#
#   앱의 주소(`/reports/2026-08`)는 이것과 무관하다 — 그건 브라우저 경로이고
#   여기 있는 것은 S3 키다. 둘을 섞지 말 것.
PUBLIC_REPORT_PREFIX = "reports/published/"
INDEX_KEY = PUBLIC_REPORT_PREFIX + "index.json"


def report_key(report):
    """발행 키. version 이 키에 들어가므로 v1 을 덮어쓸 방법이 없다."""
    rid = report.get("reportId") or ""
    ver = int(report.get("version") or 1)
    return "%s%s/v%d.json" % (PUBLIC_REPORT_PREFIX, rid.replace(":", "/"), ver)


INDEX_LEAK = "INDEX_CONTAINS_UNPUBLISHED"

# 색인에 실려도 되는 생애. 이 밖은 **존재 자체를 공개 색인에 적지 않는다** —
# 초안이 있다는 사실도 정보다.
INDEX_PUBLISHABLE = ("PUBLISHED", "ARCHIVED")


def index_leaks(index):
    """공개 색인에 실리면 안 되는 항목을 찾는다. 없으면 빈 목록.

    ⚠️ 색인은 발행본을 **가리키는 목록**이지 발행 대기표가 아니다.
       초안이 여기 실리면 (1) 초안이 있다는 사실이 공개되고
       (2) 화면이 그것을 열려다 403 을 받는다. 둘 다 안 된다.
    """
    bad = []
    for rows in ((index or {}).get("years") or {}).values():
        for row in rows or []:
            if not isinstance(row, dict):
                bad.append(repr(row)[:40])
                continue
            life = row.get("lifecycle") or row.get("status")
            if life not in INDEX_PUBLISHABLE:
                bad.append("%s(%s)" % (row.get("reportId") or "?", life))
    return bad


def stamp_published(report, published_at):
    """발행 증거를 찍는다. **put_object 직전에만** 부른다.

    publishedAt · immutableRef 는 governance.UNSIGNED_FIELDS 라서 승인 해시를
    깨지 않는다. 반대로 lifecycle 은 서명 대상이므로 여기서 건드리지 않는다.
    """
    out = dict(report)
    out["publishedAt"] = published_at
    out["immutableRef"] = out.get("reportId")
    return out


def report_year(report):
    """색인의 연도 칸. `period` 는 이 저장소에서 두 모양으로 쓰인다 —
    `{"from": "2026-08-01", ...}` 와 `"2026-08"`. 둘 다 받는다.
    (한쪽만 가정하면 다른 쪽에서 AttributeError 로 발행이 통째로 죽는다.)
    """
    per = (report or {}).get("period")
    if isinstance(per, dict):
        stamp = per.get("from") or ""
    elif isinstance(per, str):
        stamp = per
    else:
        stamp = ""
    return stamp[:4] or "unknown"


def merge_index(index, report):
    """이미 올라가 있는 색인에 이 발행본 한 건을 더한다.

    ⚠️ 색인을 **새로 만들지 않는다.** 한 건만 들고 새로 만들면 먼저 발행된
       보고서들이 목록에서 조용히 사라진다. 있는 것을 읽어서 더한다.
    """
    out = {"schemaVersion": (index or {}).get("schemaVersion") or rc.REPORT_SCHEMA,
           "years": {k: list(v) for k, v in ((index or {}).get("years") or {}).items()}}
    if (index or {}).get("withdrawn"):
        out["withdrawn"] = list(index["withdrawn"])
    year = report_year(report)
    row = {"reportId": report.get("reportId"), "type": report.get("type"),
           "period": report.get("period"), "status": report.get("status"),
           "lifecycle": report.get("lifecycle"), "publishedAt": report.get("publishedAt"),
           "version": report.get("version"),
           "immutableRef": report.get("immutableRef")}
    rows = [r for r in out["years"].get(year, [])
            if not (r.get("reportId") == row["reportId"]
                    and r.get("version") == row["version"])]
    rows.append(row)
    rows.sort(key=lambda x: (report_year(x), str(x.get("reportId") or ""),
                             x.get("version") or 0))
    out["years"][year] = rows
    out["years"] = dict(sorted(out["years"].items()))
    return out


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

    def read_index(self):
        """지금 올라가 있는 색인. 없으면 빈 색인. 못 읽으면 **모른다고 말한다**."""
        try:
            r = self._client().get_object(Bucket=self.bucket, Key=INDEX_KEY)
            return {"ok": True, "index": json.loads(r["Body"].read().decode("utf-8"))}
        except Exception as e:                      # noqa: BLE001
            if "NoSuchKey" in str(e) or "404" in str(e):
                return {"ok": True, "index": {"schemaVersion": rc.REPORT_SCHEMA, "years": {}}}
            return {"ok": False, "reason": "INDEX_READ_FAILED", "detail": str(e)[:200]}

    def publish(self, report, published_at=None):
        ok = self.available()
        if not ok["ok"]:
            return dict(ok, published=False)
        if report.get("lifecycle") != "PUBLISHED":
            return {"ok": False, "published": False, "reason": "NOT_VALIDATED",
                    "detail": "발행 단계를 통과하지 않은 리포트는 올리지 않는다"}
        key = report_key(report)
        # INTEGRATION-4 §7 — 공개 키에 쓰기 직전에 **경계 판정을 한 곳에 묻는다.**
        # ⚠️ publication_privacy.check_public_write 는 INTEGRATION-2 가 "핵심 검사"라고
        #    적어 놓고도 부르는 곳이 시험뿐이었다. 부르지 않는 검사는 검사가 아니다.
        allowed = priv.check_public_write(key, report, kind="report")
        if not allowed["allowed"]:
            return {"ok": False, "published": False, "reason": "PUBLIC_WRITE_REFUSED",
                    "detail": allowed["reason"], "visibility": allowed["visibility"],
                    "keyVisibility": allowed["keyVisibility"]}
        # 발행 도장은 **여기서** 찍는다 — 승인 문을 지난 뒤, 올리기 직전.
        stamped = stamp_published(report, published_at) if published_at else report
        body = json.dumps(stamped, ensure_ascii=False, sort_keys=True).encode("utf-8")
        try:
            # IfNoneMatch="*" — 이미 있으면 쓰지 않는다. 덮어쓰기 경로가 아예 없다.
            self._client().put_object(
                Bucket=self.bucket, Key=key, Body=body,
                ContentType="application/json; charset=utf-8",
                CacheControl=IMMUTABLE_CACHE, IfNoneMatch="*")
            return {"ok": True, "published": True, "key": key, "report": stamped,
                    "hash": content_hash(stamped), "url": "%s/%s" % (self.public_base, key)}
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
        bad = index_leaks(index)
        if bad:
            return {"ok": False, "published": False, "reason": INDEX_LEAK,
                    "detail": "색인에 발행본이 아닌 항목이 있다: %s" % ", ".join(bad[:5]),
                    "entries": bad}
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
        """§15 · INTEGRATION-9 §3 — 올린 뒤 **익명으로** 다시 받아 대조한다.

        `public_base` 는 서명 없는 주소다. 그래서 이 확인은 "우리가 읽을 수 있나"가
        아니라 **"누구나 읽을 수 있나"** 를 묻는다. 공개 정책이 그 접두사를 열지
        않으면 여기서 403 이 나고 발행은 PUBLISHED 로 넘어가지 못한다.
        (INTEGRATION-8 에서 `reports/` 가 정책 밖이라 이 문이 늘 닫혀 있었다.)

        해시 하나로 끝내지 않는다. 무엇이 어긋났는지 말해야 고칠 수 있다.
        """
        key = report_key(report)
        try:
            from urllib.request import urlopen
            with urlopen("%s/%s" % (self.public_base, key), timeout=30) as r:
                status = getattr(r, "status", None) or r.getcode()
                got = json.loads(r.read().decode("utf-8"))
        except Exception as e:                      # noqa: BLE001
            return {"ok": False, "key": key, "httpStatus": None,
                    "reason": "FETCH_FAILED", "detail": str(e)[:200]}

        want, have = content_hash(report), content_hash(got)
        checks = [
            ("HTTP_NOT_200", status == 200),
            ("REPORT_ID_MISMATCH", got.get("reportId") == report.get("reportId")),
            ("VERSION_MISMATCH",
             int(got.get("version") or 0) == int(report.get("version") or 1)),
            ("LIFECYCLE_NOT_PUBLISHED", got.get("lifecycle") == "PUBLISHED"),
            ("HASH_MISMATCH", want == have),
        ]
        failed = [code for code, ok in checks if not ok]
        return {
            "ok": not failed,
            "key": key,
            "httpStatus": status,
            "expectedHash": want,
            "actualHash": have,
            "reportId": got.get("reportId"),
            "version": got.get("version"),
            "lifecycle": got.get("lifecycle"),
            "checked": [c for c, _ in checks],
            "failed": failed,
            "reason": failed[0] if failed else None,
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

    def read_index(self):
        path = os.path.join(self.root, INDEX_KEY)
        if not os.path.exists(path):
            return {"ok": True, "index": {"schemaVersion": rc.REPORT_SCHEMA, "years": {}}}
        with open(path, encoding="utf-8") as fh:
            return {"ok": True, "index": json.load(fh)}

    def publish(self, report, published_at=None):
        if report.get("lifecycle") != "PUBLISHED":
            return {"ok": False, "published": False, "reason": "NOT_VALIDATED"}
        key = report_key(report)
        path = os.path.join(self.root, key)
        if os.path.exists(path):
            # 로컬에서도 불변 규칙을 지킨다. 판을 올리지 않으면 다시 쓰지 않는다.
            return {"ok": True, "published": False, "alreadyPreserved": True, "key": key,
                    "production": False}
        # 운영과 **같은 자리**에서 도장을 찍는다. 시험이 운영과 다른 모양을 보면
        # 시험이 지키는 것이 운영이 아니게 된다.
        stamped = stamp_published(report, published_at) if published_at else report
        os.makedirs(os.path.dirname(path), exist_ok=True)
        with open(path, "w", encoding="utf-8") as fh:
            json.dump(stamped, fh, ensure_ascii=False, sort_keys=True, indent=1)
        return {"ok": True, "published": True, "key": key, "path": path,
                "report": stamped,
                "hash": content_hash(stamped), "production": False}

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


# 리포트도 사람 승인을 거친다 — INTEGRATION-2 §6 → INTEGRATION-3 §2 · §3 · §5.
#
# ⚠️ 승인 판정은 여기서 하지 않는다. aws/_shared/governance.py 한 곳에서 한다.
#    예전에는 이 파일과 social_publish.py 가 각자 판정했다. 두 곳이면 한쪽만
#    조여도 다른 쪽으로 나간다. SNS 발행과 **같은 문**을 지나게 바꿨다.
#
# 바뀐 것 두 가지:
#   §2  누가·언제·어떤 방법으로 승인했는지를 전부 요구한다. 시스템 계정은 막힌다.
#   §3  승인한 판본의 지문을 함께 적는다. 승인 뒤 내용이 바뀌면 APPROVAL_INVALID 다.
APPROVAL_FIELD = gov.APPROVAL_FIELD


def approve(report, *, approved_by, approved_at, approval_method="CLI_CONFIRM", note=None):
    """사람이 승인했다는 표식. 누가·언제·어떻게·무엇을 — 넷 다 없으면 승인이 아니다."""
    return gov.approve(report, approved_by=approved_by, approved_at=approved_at,
                       approval_method=approval_method, note=note)


def approval_state(report):
    """리포트의 승인 상태.

    APPROVED / APPROVAL_INVALID / REJECTED / NOT_APPROVED 는 governance 어휘 그대로다.
    다만 **검증만 통과한** 상태(lifecycle=PUBLISHED, 사람은 아직 안 봄)를
    READY_FOR_REVIEW 로 구분해 부른다 — 그 둘을 같은 말로 부르지 않는다.
    """
    chk = gov.approval_check(report)
    if chk["state"] != "NOT_APPROVED":
        return chk["state"]
    if (report or {}).get("lifecycle") == "PUBLISHED":
        return "READY_FOR_REVIEW"
    return "DRAFT"


def approval_detail(report):
    """왜 그 상태인지까지. 화면·시험이 사유를 그대로 보여줄 수 있게."""
    chk = gov.approval_check(report)
    chk["reportState"] = approval_state(report)
    return chk


def publish_pipeline(report, adapter, *, index=None, require_approval=True,
                     published_at=None):
    """§15 — BUILD/VALIDATE 는 이미 끝난 상태로 들어온다. 여기서는 올리고 확인만 한다.

    INTEGRATION-2 §6 — 승인 없이는 올리지 않는다.
    """
    if require_approval:
        # §5 — 승인 여부와 **전이 가능 여부**를 함께 본다.
        #     이미 발행된 것을 다시 올리는 길도 여기서 막힌다.
        g = gov.gate(report, want="PUBLISHING")
        if not g["ok"]:
            st = approval_state(report)
            return {"stage": "APPROVE", "ok": False, "published": False,
                    "reason": g["code"] or "NOT_APPROVED",
                    "approvalState": st,
                    "approval": g["approval"],
                    "governanceFrom": g["from"], "governanceTo": g["to"],
                    "detail": ("검증 통과는 승인이 아니다(현재 %s). %s"
                               % (st, g["reason"] or
                                  "publisher.approve(report, approved_by=…, approved_at=…) 를 거쳐야 올린다."))}
    # INTEGRATION-3 §8 — verified 표식을 달고 있는 자산은 여덟 조건을 전부 넘어야 한다.
    # 표식은 우리가 쓰는 값이라 그것만 믿으면 확인 없이 공개된다.
    # ⚠️ 확인 실패한 자산 자체는 매니페스트에 남겨 둔다(왜 그림이 없는지 알아야 한다).
    #    막는 것은 "확인됐다고 적혀 있는데 조건을 못 넘는" 경우다.
    assets = ((report or {}).get("visualManifest") or {}).get("assets") or []
    claimed = [a for a in assets if a.get("verified")]
    vis = gov.public_visuals_check(claimed)
    if not vis["ok"]:
        bad = [r for r in vis["assets"] if not r["ok"]]
        return {"stage": "VISUAL", "ok": False, "published": False,
                "reason": vis["code"],
                "visuals": vis,
                "detail": "확인됐다고 적힌 시각자산이 공개 조건을 못 넘는다: %s"
                          % "; ".join("%s(%s)" % (r["assetId"], ", ".join(r["problems"][:2]))
                                      for r in bad[:3])}

    avail = adapter.available()
    if not avail.get("ok"):
        return {"stage": "PUBLISH", "ok": False,
                "reason": avail.get("reason", BLOCKED_NO_CREDENTIALS),
                "detail": avail.get("detail"), "published": False}
    try:
        put = adapter.publish(report, published_at=published_at)
    except TypeError:                 # 옛 서명을 쓰는 어댑터도 받아 준다
        put = adapter.publish(report)
    if not put.get("ok"):
        return {"stage": "PUBLISH", "ok": False, "reason": put.get("reason"),
                "detail": put.get("detail"), "published": False}
    # 되받기는 **올린 문서** 로 대조한다 — 도장이 찍힌 쪽이다.
    stamped = put.get("report") or report
    check = adapter.verify(stamped)
    out = {"stage": "PUBLISH", "ok": bool(check.get("ok")), "published": put.get("published"),
           "approvalState": approval_state(report),
           "approvalBypassed": not require_approval,
           "alreadyPreserved": put.get("alreadyPreserved", False),
           "key": put.get("key"), "url": put.get("url"), "hash": put.get("hash"),
           "report": stamped,
           "verify": check, "adapter": adapter.name,
           "production": avail.get("production", adapter.name == "s3")}
    # ⚠️ 색인은 **되받기가 끝난 뒤에만** 고친다. 못 읽는 것을 목록에 올리지 않는다.
    if not out["ok"]:
        return out
    if index is None and hasattr(adapter, "read_index"):
        # 있는 색인을 읽어 한 줄 더한다. 새로 만들지 않는다 — 먼저 발행된 것이 사라진다.
        cur = adapter.read_index()
        if not cur.get("ok"):
            out["index"] = cur
            return out
        index = merge_index(cur["index"], stamped)
    if index is not None:
        out["index"] = adapter.publish_index(index)
    return out
