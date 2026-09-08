# -*- coding: utf-8 -*-
"""INTEGRATION-4 — 공개 경계를 하나로 묶고, 승인 전 산출물이 공개에서 사라졌는지 본다.

§0  승인 전 SNS 초안이 공개 접두사에 쓰이지 않는다
§1  §2  스키마·DDL 이 공개 빌드에 실리지 않는다
§4  공개 접두사에 올리는 스크립트는 전부 build/public-app 을 원본으로 쓴다
§5  금지 부류를 거름망 규칙과 **독립적으로** 훑는다
§6  픽스처가 아니라 **실제 빌드 산출물**을 본다

⚠️ 이 시험은 네트워크를 쓰지 않는다. 살아 있는 공개 주소 확인은
   `python3 aws/verify-public-access.py` 가 따로 한다 — 그건 자격증명이 아니라
   **인터넷**이 있어야 하고, 결과를 통과/실패/확인불가로 나눈다.
"""
import importlib.util
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

import public_build as pubbuild        # noqa: E402
import publication_privacy as priv     # noqa: E402

PROTO = os.path.join(REPO, "prototype")
PUBLIC = os.path.join(REPO, pubbuild.PUBLIC_BUILD_DIR.replace("/", os.sep))


def _load(name, path):
    """경로로 모듈을 읽는다 — handler.py 가 여러 개라 이름으로 부르면 섞인다."""
    spec = importlib.util.spec_from_file_location(name, path)
    mod = importlib.util.module_from_spec(spec)
    sys.modules[name] = mod
    spec.loader.exec_module(mod)
    return mod


def _text(path):
    with io.open(path, encoding="utf-8", errors="replace") as fh:
        return fh.read()


_JS_BLOCK = re.compile(r"/\*.*?\*/", re.S)
_JS_LINE = re.compile(r"(?m)^\s*//.*$")
_HASH_LINE = re.compile(r"(?m)^\s*#.*$")
_Q3 = chr(34) * 3
_A3 = chr(39) * 3
_PY_DOC = re.compile("%s.*?%s|%s.*?%s" % (_Q3, _Q3, _A3, _A3), re.S)


def _code_only(path, text):
    """주석을 뜯어낸다.

    ⚠️ 주석까지 잡으면 "예전에 여기에 썼다"는 설명이 위반으로 잡힌다.
       그런 검사기는 설명을 지우게 만든다 — 기록이 사라지는 쪽이 더 나쁘다.
    """
    if path.endswith((".js", ".mjs")):
        return _JS_LINE.sub("", _JS_BLOCK.sub("", text))
    if path.endswith(".py"):
        return _HASH_LINE.sub("", _PY_DOC.sub("", text))
    if path.endswith(".sh"):
        return _HASH_LINE.sub("", text)
    return text


# ── §0 승인 전 초안 ──────────────────────────────────────────────────────────
class SocialDraftPrivacy(unittest.TestCase):
    """이번 단계의 P0 하나. 초안이 공개 접두사에 쓰이면 안 된다."""

    def setUp(self):
        os.environ.setdefault("CACHE_BUCKET", "test-bucket")
        self.path = os.path.join(AWS, "social-draft", "handler.py")
        if not os.path.exists(self.path):
            self.skipTest("social-draft 람다가 없다")
        self.src = _text(self.path)

    def test_쓰는_자리가_비공개_접두사다(self):
        m = re.search(r'^DST\s*=\s*"([^"]+)"', self.src, re.M)
        self.assertIsNotNone(m, "DST 를 찾지 못했다")
        key = m.group(1)
        self.assertEqual(priv.prefix_visibility(key), "PRIVATE",
                         "SNS 초안을 %s 에 쓴다 — 공개 접두사다" % key)

    def test_비공개_접두사_목록이_정본과_같다(self):
        """람다 묶음에 _shared 를 넣지 않으므로 목록을 복사해 뒀다.
        복사본은 갈라진다 — 그래서 여기서 같은지 본다."""
        m = re.search(r"^PRIVATE_PREFIXES\s*=\s*\(([^)]*)\)", self.src, re.M)
        self.assertIsNotNone(m, "PRIVATE_PREFIXES 를 찾지 못했다")
        got = tuple(x.strip().strip("\"'") for x in m.group(1).split(",") if x.strip())
        self.assertEqual(got, priv.PRIVATE_PREFIXES,
                         "람다의 비공개 접두사 목록이 publication_privacy 와 다르다")

    def test_공개_키로는_쓰지_못한다(self):
        mod = _load("earthus_social_draft", self.path)
        mod._assert_private("archive/x.json")            # 통과해야 한다
        for bad in ("events/social-drafts.json", "app/x.json", "ocean/x.json", "x.json"):
            with self.assertRaises(RuntimeError, msg="%s 가 통과한다" % bad):
                mod._assert_private(bad)

    def test_초안에_상태가_적혀_있다(self):
        """초안과 게시물을 같은 것으로 읽지 않게 한다(§0.5·§0.6)."""
        self.assertIn('"status": DRAFT_STATUS', self.src)
        self.assertIn('"visibility": "PRIVATE"', self.src)
        self.assertRegex(self.src, r'DRAFT_STATUS\s*=\s*"DRAFT"')

    def test_감시_목록도_같이_옮겨졌다(self):
        h = os.path.join(AWS, "health", "handler.py")
        if not os.path.exists(h):
            self.skipTest("health 람다가 없다")
        s = _text(h)
        self.assertIn('"archive/social-drafts.json"', s)
        self.assertNotIn('{"key": "events/social-drafts.json"', s)

    def test_화면이_공개_주소로_초안을_받지_않는다(self):
        js = os.path.join(PROTO, "js", "studio.js")
        if not os.path.exists(js):
            self.skipTest("studio.js 가 없다")
        s = _code_only(js, _text(js))
        self.assertNotRegex(
            s, r"fetch\(\s*[`'\"]/?events/social-drafts\.json",
            "관리 화면이 아직 공개 주소로 초안을 받는다")

    def test_어떤_소스도_공개_초안_키를_다시_쓰지_않는다(self):
        """문서와 이 시험 파일은 뺀다 — 그건 설명이지 동작이 아니다."""
        offenders = []
        for root, dirs, files in os.walk(REPO):
            dirs[:] = [d for d in dirs
                       if d not in ("node_modules", ".git", "build", "docs", ".worktrees")
                       and not d.startswith(".claude")]
            for fn in files:
                if not fn.endswith((".py", ".js", ".mjs", ".sh")):
                    continue
                p = os.path.join(root, fn)
                rel = os.path.relpath(p, REPO).replace(os.sep, "/")
                if rel.startswith(("aws/_shared/publication_privacy.py",
                                   "aws/_shared/public_build.py",
                                   "aws/verify-public-access.py",
                                   "aws/live-audit.py",
                                   "aws/social-draft/handler.py",
                                   "aws/report-engine/tests/")):
                    continue                     # 설명·검사기·시험
                try:
                    s = _text(p)
                except OSError:
                    continue
                if "events/social-drafts.json" in _code_only(p, s):
                    offenders.append(rel)
        self.assertFalse(offenders, "아직 공개 초안 키를 쓰는 곳: %s" % offenders[:5])


# ── §1 · §2 스키마와 DDL ─────────────────────────────────────────────────────
class SchemaAndDdl(unittest.TestCase):
    def test_공개_빌드에_sql_이_하나도_없다(self):
        plan = pubbuild.plan(PROTO)
        sql = [p for p in plan["keep"] if p.lower().endswith((".sql", ".ddl"))]
        self.assertFalse(sql, "스키마가 공개 빌드에 실린다: %s" % sql[:5])

    def test_알려진_DDL_다섯_건이_전부_막힌다(self):
        known = (
            "supabase/schema.sql",
            "js/earthus2/v07/postgres/20260826_v07_backend_metadata_contract.sql",
            "js/earthus2/v10/postgres/20260826_v10_backend_closed_loop.sql",
            "js/earthus2/v11/postgres/20260826_v11_advanced_intelligence.sql",
            "v2-deploy/engine-v11/postgres/20260826_v11_advanced_intelligence.sql",
        )
        for rel in known:
            self.assertIsNotNone(pubbuild.denial_for(rel), "%s 가 통과한다" % rel)

    def test_DDL_을_읽는_런타임_코드가_없다(self):
        """공개할 이유가 정말 없는지 확인한다 — 앱이 읽으면 이야기가 달라진다."""
        hits = []
        for root, dirs, files in os.walk(PROTO):
            dirs[:] = [d for d in dirs if d not in ("node_modules", "supabase")]
            for fn in files:
                if not fn.endswith((".js", ".mjs", ".html")):
                    continue
                s = _text(os.path.join(root, fn))
                if re.search(r"['\"`][^'\"`]*\.sql['\"`]", s):
                    hits.append(os.path.relpath(os.path.join(root, fn), PROTO))
        self.assertFalse(hits, "앱 코드가 .sql 을 참조한다: %s" % hits[:5])


# ── §4 배포 경계 통일 ────────────────────────────────────────────────────────
# 공개 접두사에 올리면서 build/public-app 을 안 쓰는 스크립트는 없어야 한다.
# 예외는 **생성물**을 올리는 것들이다. 작업 트리를 올리지 않으므로 거름망 밖이다.
BOUNDARY_EXEMPT = {
    "aws/deploy-app.sh":              "build/public-app 을 직접 원본으로 쓴다",
    "aws/deploy-orbital-static.sh":   "build/orbital — 내보내기 산출물이지 작업 트리가 아니다",
    "tools/publish-aetherus-snapshot.sh": "API 호출 결과를 만들어 올린다",
}
UPLOAD_RE = re.compile(r"aws\s+s3\s+(cp|sync)")
PUBLIC_DEST_RE = re.compile(r"s3://[^\"'\s]*(\$\{?BUCKET\}?|earthus-cache-kr)[^\"'\s]*/"
                            r"(\$\{?(APP_)?PREFIX\}?|app)/")


class DeployBoundary(unittest.TestCase):
    def _uploaders(self):
        out = []
        for d in ("aws", "tools"):
            base = os.path.join(REPO, d)
            if not os.path.isdir(base):
                continue
            for fn in sorted(os.listdir(base)):
                if not fn.endswith(".sh"):
                    continue
                p = os.path.join(base, fn)
                s = _text(p)
                if UPLOAD_RE.search(s) and PUBLIC_DEST_RE.search(s):
                    out.append(("%s/%s" % (d, fn), s))
        return out

    def test_공개에_올리는_스크립트를_찾았다(self):
        found = [k for k, _ in self._uploaders()]
        self.assertGreaterEqual(len(found), 8,
                                "공개 업로더를 못 찾았다 — 탐지기가 죽었다: %s" % found)

    def test_전부_공개_빌드를_원본으로_쓴다(self):
        bad = []
        for rel, s in self._uploaders():
            if rel in BOUNDARY_EXEMPT:
                continue
            if "public-source.sh" not in s:
                bad.append(rel)
        self.assertFalse(
            bad, "공개 경계를 따로 갖고 있는 배포 스크립트: %s" % bad)

    def test_작업_트리를_공개_원본으로_쓰지_않는다(self):
        bad = []
        for rel, s in self._uploaders():
            if rel in BOUNDARY_EXEMPT:
                continue
            for m in re.finditer(r'aws\s+s3\s+(?:cp|sync)\s+"([^"]+)"', s):
                src = m.group(1)
                if "prototype/" in src or src.endswith("/prototype"):
                    bad.append("%s: %s" % (rel, src))
        self.assertFalse(bad, "작업 트리를 직접 올린다: %s" % bad)

    def test_면제_목록에_이유가_적혀_있다(self):
        for k, why in BOUNDARY_EXEMPT.items():
            self.assertTrue(why and len(why) > 10, "%s 면제 사유가 없다" % k)
            self.assertTrue(os.path.exists(os.path.join(REPO, k)),
                            "면제 목록에 없는 파일이 있다: %s" % k)

    def test_매니페스트_항목이_전부_공개_빌드에_있다(self):
        man_dir = os.path.join(REPO, "tools", "manifests")
        if not os.path.isdir(man_dir):
            self.skipTest("매니페스트가 없다")
        missing = []
        for fn in sorted(os.listdir(man_dir)):
            if not fn.endswith(".tsv"):
                continue
            for line in _text(os.path.join(man_dir, fn)).splitlines():
                if not line.strip() or line.startswith("#"):
                    continue
                src = line.split("\t")[0].strip()
                if not src.startswith("prototype/"):
                    continue
                rel = src[len("prototype/"):]
                if pubbuild.denial_for(rel):
                    missing.append("%s: %s (거름망이 막는다)" % (fn, src))
        self.assertFalse(missing, "매니페스트가 막힌 파일을 올리려 한다: %s" % missing[:5])


# ── §5 금지 부류 훑기 (규칙표와 독립) ────────────────────────────────────────
# 확장자만으로 무조건 막지 않는다 — 앱이 실제로 읽는 것은 통과시킨다.
FORBIDDEN_SUFFIX = {
    ".sql": "DB 스키마", ".ddl": "DB 스키마",
    ".md": "저장소 안쪽 문서", ".pem": "인증서/키", ".key": "키",
    ".env": "환경 변수", ".bak": "편집 부산물", ".orig": "병합 부산물",
    ".rej": "병합 부산물", ".log": "로그", ".pyc": "파이썬 캐시",
    ".map": "소스 맵", ".zip": "묶음", ".tar": "묶음", ".gz": "묶음",
    ".ipynb": "노트북", ".sqlite": "DB 파일", ".db": "DB 파일",
}
FORBIDDEN_PATH_MARK = {
    "/handoff/": "내부 인계 문서",
    "/__pycache__/": "파이썬 캐시",
    "/.git/": "git 내부",
    "/node_modules/": "의존성 트리",
    "/.python-packages/": "벤더 패키지",
    "/.satellite-sources/": "위성 원본",
    "/_verify/": "검증 부스러기",
    "/.tmp/": "임시",
}
# 앱이 실제로 읽어서 공개가 맞는 것. 각각 이유를 적는다.
CLASS_EXEMPT = {
    "legal/data-license.ko.md": "앱이 화면에 띄운다 — index.html 의 rel=license 와 js/ui-account.js",
    "legal/privacy.ko.md": "앱이 화면에 띄운다 — 가입 동의 절차가 이 문서를 연다",
    "legal/terms.ko.md": "앱이 화면에 띄운다 — 가입 동의 절차가 이 문서를 연다",
}


class ForbiddenClassSweep(unittest.TestCase):
    def test_금지_부류가_공개_빌드에_없다(self):
        plan = pubbuild.plan(PROTO)
        bad = []
        for rel in plan["keep"]:
            if rel in CLASS_EXEMPT:
                continue
            low = rel.lower()
            ext = os.path.splitext(low)[1]
            if ext in FORBIDDEN_SUFFIX:
                bad.append("%s [%s]" % (rel, FORBIDDEN_SUFFIX[ext]))
                continue
            for mark, why in FORBIDDEN_PATH_MARK.items():
                if mark in "/" + low:
                    bad.append("%s [%s]" % (rel, why))
                    break
        self.assertFalse(bad, "금지 부류가 공개 빌드에 남았다 (%d건): %s"
                         % (len(bad), bad[:8]))

    def test_면제는_이유가_있고_실재한다(self):
        for rel, why in CLASS_EXEMPT.items():
            self.assertTrue(len(why) > 10, "%s 면제 사유가 부실하다" % rel)
            self.assertTrue(os.path.exists(os.path.join(PROTO, rel)),
                            "면제 목록에 없는 파일이 있다: %s" % rel)
            self.assertIsNone(pubbuild.denial_for(rel),
                              "면제인데 거름망이 막는다: %s" % rel)


# ── §6 실제 산출물 ───────────────────────────────────────────────────────────
class ActualArtifact(unittest.TestCase):
    """픽스처가 아니라 디스크의 build/public-app 을 본다."""

    def setUp(self):
        if not os.path.isdir(PUBLIC):
            self.skipTest("공개 빌드가 없다 — python3 aws/build-public.py 를 먼저 돌린다")

    def test_빌드된_트리에_금지_부류가_없다(self):
        bad = []
        for rel in pubbuild.walk_source(PUBLIC):
            if rel in CLASS_EXEMPT:
                continue
            ext = os.path.splitext(rel.lower())[1]
            if ext in FORBIDDEN_SUFFIX:
                bad.append(rel)
        self.assertFalse(bad, "빌드된 공개 트리에 금지 파일: %s" % bad[:8])

    def test_빌드된_트리가_계획과_같다(self):
        plan = pubbuild.plan(PROTO)
        built = set(pubbuild.walk_source(PUBLIC))
        want = set(plan["keep"])
        extra = sorted(built - want)
        self.assertFalse(extra, "계획에 없는 파일이 빌드 트리에 있다: %s" % extra[:8])

    def test_지문이_계산된다(self):
        plan = pubbuild.plan(PROTO)
        h = pubbuild.manifest_hash(PROTO, plan["keep"])
        self.assertEqual(len(h), 64)
        self.assertEqual(h, pubbuild.manifest_hash(PROTO, plan["keep"]), "지문이 흔들린다")


if __name__ == "__main__":
    unittest.main()
