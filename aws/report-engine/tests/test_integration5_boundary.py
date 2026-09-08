# -*- coding: utf-8 -*-
"""INTEGRATION-5 — 공개 경계를 **모든 언어의 업로더**로 넓히고, 운영 사실을 고정한다.

§3  공개에 올리는 것은 .sh 만이 아니었다 — .mjs 업로더 하나가 거름망 밖에 있었다
§5  람다 쓰기 경로가 비공개인지 (코드 기준. 운영 확인은 aws/verify-public-access.py)
§11 §12 승인 게이트를 아홉 가지로 두들긴다

⚠️ 이 시험은 네트워크도 자격증명도 쓰지 않는다.
   운영 실측은 `python3 aws/verify-public-access.py [--audit-denied]` 가 따로 한다.
"""
import io
import os
import re
import sys
import unittest

HERE = os.path.dirname(os.path.abspath(__file__))
ENGINE = os.path.dirname(HERE)
AWS = os.path.dirname(ENGINE)
REPO = os.path.dirname(AWS)
sys.path.insert(0, ENGINE)
sys.path.insert(0, os.path.join(AWS, "_shared"))

import governance as gov               # noqa: E402
import public_build as pubbuild        # noqa: E402
import publication_privacy as priv     # noqa: E402
import publisher as pub                # noqa: E402
import social_publish as sp            # noqa: E402


def _text(p):
    with io.open(p, encoding="utf-8", errors="replace") as fh:
        return fh.read()


# ── §3 업로더 전수 — 셸만 보지 않는다 ────────────────────────────────────────
# ⚠️ INTEGRATION-4 의 시험은 aws/*.sh 와 tools/*.sh 만 훑었다. 그래서
#    tools/upload_information_release.mjs 가 prototype/ 에서 바로 떠 올리는 것을
#    놓쳤다. 확장자 하나가 검사 구멍이 됐다 — 이제 언어로 거르지 않는다.
UPLOAD_RE = re.compile(r"aws\s+s3(api)?\s+(cp|sync|put-object)"
                       r"|'s3api',\s*'put-object'"
                       r"|\"s3api\",\s*\"put-object\"")
PUBLIC_DEST_RE = re.compile(
    r"s3://[^\"'\s]*(\$\{?BUCKET\}?|earthus-cache-kr)[^\"'\s]*/"
    r"(\$\{?(APP_)?PREFIX\}?|app)/"
    r"|key:\s*[`'\"]app/"
    r"|`app/\$\{"
)
# ⚠️ 목적지가 **변수**면 위 패턴에 안 걸린다.
#    tools/upload_information_release.mjs 가 그렇다 — `--key file.key` 로 올린다.
#    그래서 "우리 버킷을 가리키면서 올리는 것"도 업로더로 센다.
BUCKET_RE = re.compile(r"earthus-cache-kr|EARTHUS_BUCKET|CACHE_BUCKET")

BOUNDARY_EXEMPT = {
    "aws/deploy-app.sh":
        "build/public-app 을 직접 원본으로 쓴다",
    "aws/deploy-orbital-static.sh":
        "build/orbital — 내보내기 산출물이지 작업 트리가 아니다. "
        "다만 그 트리는 이 거름망을 지나지 않는다(인계)",
    "tools/publish-aetherus-snapshot.sh":
        "API 호출 결과를 만들어 올린다. 작업 트리 파일이 아니다",
    "tools/upload_information_release.mjs":
        "빌더가 만든 payload 만 올린다. 원본 판정은 build_information_release.mjs 가 한다 "
        "— 그쪽이 build/public-app 을 쓰는지를 아래에서 따로 확인한다",
}

SCAN_EXT = (".sh", ".mjs", ".js", ".py")
SCAN_DIRS = ("aws", "tools")


def _writes_up(text):
    """올리는가, 내리는가.

    ⚠️ `aws s3 cp s3://... $TMP` 는 **받는** 쪽이다.
       방향을 안 보면 검증 스크립트까지 업로더로 센다.
    """
    for line in text.splitlines():
        m = re.search(r"aws\s+s3\s+(cp|sync)\s+(\S+)\s+(\S+)", line)
        if m and not m.group(2).strip("\"'").startswith("s3://")                 and m.group(3).strip("\"'").startswith(("s3://", '"s3://')):
            return True
        if re.search(r"s3api['\"]?,?\s*['\"]?put-object", line):
            return True
        if re.search(r"aws\s+s3api\s+put-object", line):
            return True
    return False


def _uploaders():
    out = []
    for d in SCAN_DIRS:
        base = os.path.join(REPO, d)
        if not os.path.isdir(base):
            continue
        for fn in sorted(os.listdir(base)):
            if not fn.endswith(SCAN_EXT):
                continue
            p = os.path.join(base, fn)
            if not os.path.isfile(p):
                continue
            s = _text(p)
            if fn.startswith("test_") or fn.endswith((".test.mjs", ".test.js")):
                continue                     # TEST_ONLY — 운영에 올리지 않는다
            if not _writes_up(s):
                continue                     # 내려받기만 하는 것은 업로더가 아니다
            # ⚠️ 목적지 문자열로 거르지 않는다. upload_information_release.mjs 는
            #    버킷도 키도 **변수**라 어떤 목적지 패턴에도 안 걸렸다.
            #    올리는 동작이 있으면 업로더다 — 예외는 이름과 이유로 적는다.
            out.append(("%s/%s" % (d, fn), s))
    return out


class UploaderCensus(unittest.TestCase):
    def test_셸_밖의_업로더도_찾는다(self):
        found = [k for k, _ in _uploaders()]
        self.assertTrue(any(k.endswith((".mjs", ".js", ".py")) for k in found),
                        "셸이 아닌 업로더를 하나도 못 찾았다 — 탐지기가 좁다: %s" % found)
        self.assertGreaterEqual(len(found), 9, "업로더를 너무 적게 찾았다: %s" % found)

    def test_전부_공개_빌드를_원본으로_쓴다(self):
        bad = []
        for rel, s in _uploaders():
            if rel in BOUNDARY_EXEMPT:
                continue
            if "public-source.sh" in s or "build/public-app" in s or "PUBLIC_SRC" in s:
                continue
            bad.append(rel)
        self.assertFalse(bad, "공개 경계를 따로 갖고 있는 업로더: %s" % bad)

    def test_작업_트리를_공개_원본으로_쓰지_않는다(self):
        bad = []
        for rel, s in _uploaders():
            if rel in BOUNDARY_EXEMPT:
                continue
            for m in re.finditer(r"[`'\"]prototype/[^`'\"]*[`'\"]", s):
                frag = m.group(0)
                # 설명·주석에 적힌 경로는 잡지 않는다. 실제 인용부호 안 경로만 본다.
                if "${" in frag or "$(" in frag or "/*" in frag:
                    continue
                bad.append("%s: %s" % (rel, frag))
        self.assertFalse(bad, "작업 트리 경로를 원본으로 쓴다: %s" % bad[:6])

    def test_정보공개_빌더가_걸러진_트리에서_뽑는다(self):
        """이것이 INTEGRATION-4 시험이 놓친 구멍이다."""
        p = os.path.join(REPO, "tools", "build_information_release.mjs")
        if not os.path.exists(p):
            self.skipTest("정보공개 빌더가 없다")
        s = _text(p)
        self.assertIn("build/public-app", s, "빌더가 거름망 밖에서 떠온다")
        self.assertNotRegex(s, r"source:\s*`prototype/",
                            "빌더가 아직 prototype/ 에서 떠온다")

    def test_면제에는_이유가_있고_실재한다(self):
        for k, why in BOUNDARY_EXEMPT.items():
            self.assertGreater(len(why), 15, "%s 면제 사유가 부실하다" % k)
            self.assertTrue(os.path.exists(os.path.join(REPO, k)), "없는 파일: %s" % k)


# ── §5 람다 쓰기 경로 ────────────────────────────────────────────────────────
class LambdaWritePath(unittest.TestCase):
    def test_초안_람다는_비공개에만_쓴다(self):
        p = os.path.join(AWS, "social-draft", "handler.py")
        if not os.path.exists(p):
            self.skipTest("social-draft 가 없다")
        s = _text(p)
        key = re.search(r'^DST\s*=\s*"([^"]+)"', s, re.M).group(1)
        self.assertEqual(priv.prefix_visibility(key), "PRIVATE")

    def test_공개_접두사에_쓰는_람다를_센다(self):
        """app/ 에 직접 쓰는 람다가 있으면 목록에 적혀 있어야 한다.

        ⚠️ 없애라는 뜻이 아니다 — 관광·캐릭터처럼 **생성 자료**를 쓰는 것은 정당하다.
           다만 거름망 밖이라는 사실이 조용해지면 안 된다.
        """
        known = {
            "tourism-flow": "관광 혼잡도 생성 자료 (app/tourism/*)",
            "current-earth-snow-ice": "눈·얼음 생성 자료 (app/v2/data/current-earth/*)",
            "character-studio": "캐릭터 생성 자산 (app/v3/characters/*)",
        }
        found = set()
        for name in sorted(os.listdir(AWS)):
            d = os.path.join(AWS, name)
            if not os.path.isdir(d):
                continue
            for fn in os.listdir(d):
                if not fn.endswith((".py", ".mjs")):
                    continue
                s = _text(os.path.join(d, fn))
                if re.search(r"""Key\s*=\s*[f]?["']app/|key:\s*[`'"]app/""", s):
                    found.add(name)
        unexpected = sorted(found - set(known))
        self.assertFalse(unexpected,
                         "공개 app/ 에 직접 쓰는 람다가 목록에 없다: %s" % unexpected)


# ── §11 · §12 승인 게이트 공격 아홉 가지 ─────────────────────────────────────
NOW = "2026-09-08T09:00:00Z"


def _report(**over):
    r = {"reportId": "TEST-REPORT-005", "lifecycle": "PUBLISHED", "version": 1,
         "title": {"ko": "시험"}, "facts": [{"factId": "f1", "value": 1.0}]}
    r.update(over)
    return r


def _content(**over):
    c = {"contentId": "CNT-TEST-005", "status": "REVIEW",
         "reportIds": ["TEST-REPORT-005"], "phenomenonIds": ["ocean.sst"],
         "datasetRefs": ["ocean/series/sst-daily.json"], "claims": [{"text": "x"}],
         "dataSnapshotId": "snap:1", "numericPool": [1.0],
         "platformVersions": {"x": {"text": "hi", "idempotencyKey": "k"}},
         "visualAssetIds": [], "eligibility": "ELIGIBLE"}
    c.update(over)
    return c


class ApprovalAttacks(unittest.TestCase):
    def test_1_DRAFT_는_공개_키에_못_쓴다(self):
        for st in ("DRAFT", "FACT_CHECK", "REVIEW", "REVISION_REQUIRED"):
            w = priv.check_public_write("events/x.json", _content(status=st))
            self.assertFalse(w["allowed"], "%s 가 공개로 허용된다" % st)

    def test_2_BLOCKED_는_공개_키에_못_쓴다(self):
        for c in (_content(status="APPROVED", eligibility="BLOCKED"),
                  _content(status="APPROVED", safetyLevel="LEVEL_3_HUMAN_ONLY"),
                  _content(status="APPROVED", blockReasons=["숫자 근거 없음"])):
            w = priv.check_public_write("events/x.json", c)
            self.assertFalse(w["allowed"], "차단 콘텐츠가 공개로 허용된다")

    def test_3_APPROVED_를_DRAFT_로_되돌리면_승인이_깨진다(self):
        a = sp.approve(_content(), approved_by="dalur", approved_at=NOW,
                       approval_method="UI_CLICK")
        self.assertEqual(sp.approval_state(a), "APPROVED")
        # 내용을 되돌리면(초안 문구로) 지문이 달라진다
        back = dict(a, platformVersions={"x": {"text": "초안 문구", "idempotencyKey": "k"}})
        self.assertEqual(sp.approval_state(back), "APPROVAL_INVALID")

    def test_4_PUBLISHED_에서_DRAFT_로_가지_못한다(self):
        r = gov.can_transition("PUBLISHED", "DRAFT")
        self.assertFalse(r["allowed"])
        self.assertEqual(r["code"], "FORBIDDEN_TRANSITION")

    def test_5_서명_밖으로_내용을_숨길_수_없다(self):
        """예전에 lifecycle 과 publication 이 서명 밖이었다. 그게 구멍이었다."""
        for field in ("lifecycle", "publication"):
            self.assertNotIn(field, gov.UNSIGNED_FIELDS,
                             "%s 가 서명에서 빠져 있다" % field)
        a = gov.approve(_report(lifecycle="PUBLISHED"), approved_by="dalur",
                        approved_at=NOW, approval_method="UI_CLICK")
        for mutated in (dict(a, lifecycle="ARCHIVED"),
                        dict(a, publication={"몰래": "넣은 값"}),
                        dict(a, facts=[{"factId": "f1", "value": 99.0}])):
            self.assertEqual(gov.approval_check(mutated)["state"], "APPROVAL_INVALID")

    def test_6_7_8_기계_이름은_승인자가_될_수_없다(self):
        machines = ("system", "system1", "systemd", "auto", "auto2", "autobot9",
                    "bot", "bot-9", "robot", "lambda", "lambda_3", "ci", "ci42",
                    "cd", "runner-7", "deployer99", "svc-earthus", "svcacct",
                    "service-account", "nightly-job", "batch1", "worker2",
                    "Systems", "AUTOMATION", "earthus-automation-1",
                    "noreply@earthus.net", "anonymous", "unknown", "", None)
        for who in machines:
            self.assertTrue(gov.is_system_actor(who)[0], "%r 가 사람으로 통과한다" % who)
            with self.assertRaises(gov.GovernanceError, msg="%r 가 승인했다" % who):
                gov.approve(_report(), approved_by=who, approved_at=NOW,
                            approval_method="UI_CLICK")

    def test_6_7_8_사람_이름은_통과한다(self):
        for who in ("dalur", "kim.minji", "이수진", "j.doe@earthus.net", "PD",
                    "sanders", "williams", "jones", "박robert"):
            self.assertFalse(gov.is_system_actor(who)[0], "%r 가 기계로 막힌다" % who)

    def test_9_lifecycle_을_바꾸면_승인이_유지되지_않는다(self):
        a = gov.approve(_report(lifecycle="VALIDATING"), approved_by="dalur",
                        approved_at=NOW, approval_method="UI_CLICK")
        self.assertEqual(gov.approval_check(a)["state"], "APPROVED")
        self.assertEqual(gov.approval_check(dict(a, lifecycle="PUBLISHED"))["state"],
                         "APPROVAL_INVALID")

    # ── §12 승인 ≠ 자동 발행 ────────────────────────────────────────────────
    def test_상태_네_개가_서로_다르다(self):
        c = _content(status="REVIEW")
        self.assertNotEqual(sp.approval_state(c), "APPROVED")
        c2 = _content(status="APPROVED")                   # 사람 기록 없이 상태만
        self.assertEqual(sp.approval_state(c2), "STATUS_ONLY")
        a = sp.approve(_content(), approved_by="dalur", approved_at=NOW,
                       approval_method="UI_CLICK")
        self.assertEqual(sp.approval_state(a), "APPROVED")
        self.assertNotEqual(sp.approval_state(a), "PUBLISHED")

    def test_APPROVED_는_PUBLISHED_가_아니다(self):
        """승인만으로 발행 상태가 되지 않는다 — 되읽기를 지나야 한다."""
        r = gov.can_transition("APPROVED", "PUBLISHED")
        self.assertFalse(r["allowed"])
        self.assertEqual(r["code"], "FORBIDDEN_TRANSITION")

    def test_자동_경로가_APPROVED_를_찍지_못한다(self):
        """사람 방법 어휘 밖의 승인은 전부 막힌다."""
        for m in ("AUTO", "AUTOMATIC", "PIPELINE", "SYSTEM", "", None, "cron"):
            with self.assertRaises(gov.GovernanceError):
                gov.approve(_report(), approved_by="dalur", approved_at=NOW,
                            approval_method=m)

    def test_검증_안된_문서는_승인이_있어도_발행_못_한다(self):
        a = gov.approve(_report(lifecycle="DRAFT"), approved_by="dalur",
                        approved_at=NOW, approval_method="UI_CLICK")
        g = gov.gate(a, want="PUBLISHING")
        self.assertFalse(g["ok"])
        self.assertEqual(g["code"], "FORBIDDEN_TRANSITION")


# ── §13 발행 되읽기 ──────────────────────────────────────────────────────────
class PublishReadBack(unittest.TestCase):
    def test_모의_발행은_발행이_아니다(self):
        v = sp.verify_published({"mock": True, "postId": "p1"}, None)
        self.assertFalse(v["verified"])
        self.assertTrue(v.get("mock"))

    def test_미리보기는_발행이_아니다(self):
        v = sp.verify_published({"status": "PREVIEW_ONLY", "postId": "p1"}, None)
        self.assertFalse(v["verified"])

    def test_되읽은_id_가_다르면_발행이_아니다(self):
        class _A(object):
            def get_status(self, p):
                return {"postId": "다른-글", "state": "PUBLISHED"}
        v = sp.verify_published({"postId": "p1", "status": "PUBLISHED"}, _A())
        self.assertFalse(v["verified"])

    def test_공개_키_판정을_실제로_부른다(self):
        """부르지 않는 검사는 검사가 아니다 — 호출부가 있는지 본다."""
        s = _text(os.path.join(ENGINE, "publisher.py"))
        self.assertIn("priv.check_public_write", s)


if __name__ == "__main__":
    unittest.main()
