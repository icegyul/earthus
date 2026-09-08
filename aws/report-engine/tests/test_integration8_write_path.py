# -*- coding: utf-8 -*-
"""INTEGRATION-8 §5 · §6 · §7 — 쓰기 경로를 **값으로** 따라간다.

⚠️⚠️ 이 파일이 있는 이유

  네 단계에 걸쳐 같은 실수가 층만 바꿔 반복됐다. 전부 "적힌 모양"을 찾다가 뚫렸다.

    4단계  탐지기가 `.sh` 만 훑었다        → `.mjs` 업로더를 놓쳤다
    5단계  목적지 **문자열**로 걸렀다      → 버킷·키가 변수인 업로더를 놓쳤다
    7단계  호출 자리 **리터럴**만 봤다     → 키를 상수로 빼 둔 람다를 놓쳤다(0건 탐지)
    7단계  넓히기만 했다                   → app/ 를 **읽는** 람다 넷을 잡았다(오탐)

  그래서 이 시험의 중심은 판정 결과가 아니라 **탐지기가 공허하지 않다**는 증명이다.
  §7 이 요구한 그대로: "검사기가 0건을 내놓았다"가 *아무것도 못 찾았다*인지
  *정말 아무 writer 도 없다*인지를 가른다.

    CASE A  키 = 리터럴
    CASE B  키 = 모듈 상수         ← 7단계가 놓친 모양
    CASE C  키 = 감싸개·변수·함수 결과·사전 전개·루프 변수·환경변수·셸 이어붙인 줄
    그리고  읽기 전용 코드 → 오탐 0

  실제 저장소에 대고 0건이 나오면, 위 CASE 들이 **여전히 잡히는지**로 그 0을 검증한다.

이 시험은 네트워크도 자격증명도 쓰지 않는다.
"""
import io
import os
import sys
import textwrap
import unittest

HERE = os.path.dirname(os.path.abspath(__file__))
AWS = os.path.dirname(os.path.dirname(HERE))
REPO = os.path.dirname(AWS)
sys.path.insert(0, os.path.join(AWS, "_shared"))

import publication_privacy as priv     # noqa: E402
import write_path as wpath             # noqa: E402
import write_policy as wpol            # noqa: E402


def scan_src(name, text):
    """디스크를 거치지 않고 원본 문자열을 훑는다."""
    text = textwrap.dedent(text)
    if name.endswith(".py"):
        return wpath.scan_python(name, text)
    if name.endswith((".js", ".mjs", ".cjs")):
        return wpath.scan_js(name, text)
    return wpath.scan_sh(name, text)


def keys(writes):
    return sorted(w.key for w in writes if w.key)


def verdicts(name, text, root=REPO):
    """가짜 파일을 저장소 밖 경로로 두고 정책에 건다 — 허용 목록에 없는 자리다."""
    out = []
    for w in scan_src(name, text):
        out.append(wpol.classify(w, root)["verdict"])
    return out


# ────────────────────────────────────────────────────────────────────────────
class CaseA리터럴(unittest.TestCase):
    """CASE A — 키가 호출 자리에 그대로 적혀 있다."""

    SRC = '''
        import boto3
        s3 = boto3.client("s3")
        def handler(event, ctx):
            s3.put_object(Bucket="earthus-cache-kr", Key="app/leak-a.json",
                          Body=b"{}")
    '''

    def test_잡는다(self):
        w = scan_src("aws/leaky-a/handler.py", self.SRC)
        self.assertEqual(keys(w), ["app/leak-a.json"])
        self.assertEqual(w[0].kind, wpath.KIND_LITERAL)
        self.assertEqual(w[0].bucket, "earthus-cache-kr")

    def test_정책이_막는다(self):
        self.assertEqual(verdicts("aws/leaky-a/handler.py", self.SRC),
                         [wpol.DENY_APP])


class CaseB상수(unittest.TestCase):
    """CASE B — 키를 모듈 상수로 빼 두었다. **7단계가 놓친 바로 그 모양이다.**"""

    SRC = '''
        import boto3
        OUTPUT_KEY = "app/leak/b.json"
        BUCKET = "earthus-cache-kr"
        s3 = boto3.client("s3")

        def put_json(key, doc):
            s3.put_object(Bucket=BUCKET, Key=key, Body=doc)

        def handler(event, ctx):
            put_json(OUTPUT_KEY, b"{}")
    '''

    def test_대입을_따라간다(self):
        w = [x for x in scan_src("aws/leaky-b/handler.py", self.SRC) if x.key]
        self.assertEqual(keys(w), ["app/leak/b.json"])
        self.assertEqual(w[0].kind, wpath.KIND_CONSTANT)

    def test_정책이_막는다(self):
        self.assertIn(wpol.DENY_APP,
                      verdicts("aws/leaky-b/handler.py", self.SRC))


class CaseC우회들(unittest.TestCase):
    """CASE C — 감싸개·변수·함수 결과·사전 전개·루프·환경변수·셸."""

    def _막힌다(self, name, src, expect_key):
        w = [x for x in scan_src(name, src) if x.key]
        self.assertIn(expect_key, keys(w), "%s 에서 %r 를 못 찾았다" % (name, expect_key))
        self.assertIn(wpol.DENY_APP, verdicts(name, src))

    def test_C1_감싸개_뒤에_숨은_키(self):
        self._막힌다("aws/leaky-c1/handler.py", '''
            import boto3
            PUBLIC = "app/leak/"
            s3 = boto3.client("s3")

            def _write(client, bucket, key, doc):
                client.put_object(Bucket=bucket, Key=key, Body=doc)

            def handler(e, c):
                _write(s3, "earthus-cache-kr", PUBLIC + "c1.json", b"{}")
        ''', "app/leak/c1.json")

    def test_C2_환경변수_기본값(self):
        self._막힌다("aws/leaky-c2/handler.py", '''
            import boto3, os
            PREFIX = os.environ.get("OUT_PREFIX", "app/leak")
            s3 = boto3.client("s3")

            def handler(e, c):
                s3.put_object(Bucket="b", Key=f"{PREFIX}/c2.json", Body=b"{}")
        ''', "app/leak/c2.json")

    def test_C3_함수가_돌려준_키(self):
        self._막힌다("aws/leaky-c3/handler.py", '''
            import boto3
            s3 = boto3.client("s3")

            def out_key(name):
                return "app/leak/%s.json" % name

            def handler(e, c):
                s3.put_object(Bucket="b", Key=out_key("c3"), Body=b"{}")
        ''', "app/leak/….json")

    def test_C4_사전_전개(self):
        """`put_object(**args)` — 호출 자리에는 Key 가 아예 없다."""
        self._막힌다("aws/leaky-c4/handler.py", '''
            import boto3
            s3 = boto3.client("s3")

            def handler(e, c):
                args = {"Bucket": "b", "Key": "app/leak/c4.json", "Body": b"{}"}
                args["CacheControl"] = "no-cache"
                s3.put_object(**args)
        ''', "app/leak/c4.json")

    def test_C5_루프_변수(self):
        self._막힌다("aws/leaky-c5/handler.py", '''
            import boto3
            s3 = boto3.client("s3")

            def handler(e, c):
                for key in ("app/leak/c5.json", "app/leak/c5-latest.json"):
                    s3.put_object(Bucket="b", Key=key, Body=b"{}")
        ''', "app/leak/c5…")

    def test_C6_자바스크립트_템플릿(self):
        self._막힌다("aws/leaky-c6/index.mjs", '''
            import { S3Client, PutObjectCommand } from '@aws-sdk/client-s3';
            const s3 = new S3Client({});
            const PREFIX = (process.env.OUT || 'app/leak').replace(/^\\/+|\\/+$/g, '');
            export const handler = async () => {
              await s3.send(new PutObjectCommand({
                Bucket: 'b', Key: `${PREFIX}/c6.json`, Body: '{}' }));
            };
        ''', "app/leak/c6.json")

    def test_C7_셸_이어붙인_줄(self):
        r"""`\` 로 이어진 다음 줄의 `--key` 를 본다. 안 보면 '모른다'고 거짓말한다."""
        self._막힌다("tools/leaky-c7.sh", '''
            #!/usr/bin/env bash
            BUCKET=earthus-cache-kr
            PREFIX=app/leak
            for key in "${PREFIX}/c7.html" "${PREFIX}/c7/"; do
              aws s3api put-object --bucket "$BUCKET" \\
                --key "$key" --body ./out.html
            done
        ''', "app/leak/c7…")


class 읽기전용은_잡지_않는다(unittest.TestCase):
    """넓힌 뒤에는 **반드시** 오탐을 본다. 7단계에서 읽는 람다 넷이 잡혔었다."""

    SRC = '''
        import boto3
        s3 = boto3.client("s3")
        SOURCE_KEY = "app/v2/data/current-earth/snow-ice.meta.json"

        def handler(e, c):
            doc = s3.get_object(Bucket="b", Key=SOURCE_KEY)["Body"].read()
            s3.head_object(Bucket="b", Key=SOURCE_KEY)
            listing = s3.list_objects_v2(Bucket="b", Prefix="app/")
            return {"n": len(listing.get("Contents", [])), "doc": doc}
    '''

    def test_쓰기_0건(self):
        self.assertEqual(scan_src("aws/reader/handler.py", self.SRC), [])

    def test_실제_읽기전용_람다들도_app_에_쓰지_않는다(self):
        # 7단계에서 넓히자마자 잡혔던 넷. 이름을 박아 둔다.
        for name in ("air-state", "obis-summary", "space-archive", "health"):
            d = os.path.join(AWS, name)
            if not os.path.isdir(d):
                continue
            app = [w for w in wpath.scan_tree(d)
                   if (w.key or "").startswith("app/")]
            self.assertEqual(app, [], "%s 가 app/ 에 쓴다고 잘못 잡혔다" % name)


class 탐지기가_공허하지_않다(unittest.TestCase):
    """실제 저장소에 대고 센다. 숫자가 0 이나 한 자리면 시험이 아무것도 안 지킨다."""

    @classmethod
    def setUpClass(cls):
        cls.audit = wpol.audit(REPO)
        cls.rows = cls.audit["rows"]

    def test_쓰기_지점이_충분히_많다(self):
        self.assertGreaterEqual(self.audit["writes"], 200,
                                "쓰기 지점이 이렇게 적을 리 없다 — 탐지기를 의심하라")

    def test_네_언어를_모두_본다(self):
        exts = {os.path.splitext(r["path"])[1] for r in self.rows}
        for want in (".py", ".mjs", ".sh"):
            self.assertIn(want, exts, "%s 업로더를 하나도 못 봤다" % want)

    def test_app_에_쓰는_람다_셋을_전부_찾는다(self):
        found = {r["path"] for r in self.rows
                 if (r["key"] or "").startswith("app/") and "/handler." in r["path"]
                 or (r["key"] or "").startswith("app/") and r["path"].endswith(".mjs")}
        for want in ("aws/character-studio/handler.py",
                     "aws/tourism-flow/handler.py",
                     "aws/current-earth-snow-ice/index.mjs"):
            self.assertIn(want, found, "%s 를 놓쳤다" % want)

    def test_셸_배포기를_전부_본다(self):
        sh = {r["path"] for r in self.rows if r["path"].endswith(".sh")}
        self.assertGreaterEqual(len(sh), 15, "셸 업로더가 이렇게 적을 리 없다")
        self.assertIn("aws/deploy-app.sh", sh)


class 정책이_실제로_거부한다(unittest.TestCase):
    """허용 목록·fail-closed 가 살아 있는지. ALLOW 만 나오는 정책은 정책이 아니다."""

    def test_모르는_접두사는_막는다(self):
        v = verdicts("aws/leaky-x/handler.py", '''
            import boto3
            s3 = boto3.client("s3")
            def handler(e, c):
                s3.put_object(Bucket="b", Key="mystery/x.json", Body=b"{}")
        ''')
        self.assertEqual(v, [wpol.DENY_UNKNOWN_PREFIX])

    def test_증명하지_못한_목적지는_막는다(self):
        v = verdicts("aws/leaky-y/handler.py", '''
            import boto3
            s3 = boto3.client("s3")
            def handler(e, c, key):
                s3.put_object(Bucket="b", Key=key, Body=b"{}")
        ''')
        self.assertEqual(v, [wpol.DENY_UNPROVEN])

    def test_배포기가_자료_피드에_쓰면_막는다(self):
        v = verdicts("tools/deploy-rogue.sh", '''
            #!/usr/bin/env bash
            aws s3 cp ./x.json s3://earthus-cache-kr/events/rogue.json
        ''')
        self.assertEqual(v, [wpol.DENY_FEED])

    def test_허용된_접두사_밖은_막는다(self):
        """목록에 있는 배포기라도 제 구역 밖에 쓰면 거부다."""
        v = verdicts("aws/deploy-v3-kids.sh", '''
            #!/usr/bin/env bash
            BUCKET=earthus-cache-kr
            aws s3 cp ./x.html s3://$BUCKET/app/v2/index.html
        ''')
        self.assertEqual(v, [wpol.DENY_APP])


class 정책표가_현실을_가리킨다(unittest.TestCase):
    """낡은 허용 목록은 조용한 구멍이다. 가리키는 파일이 실제로 있어야 한다."""

    def _존재(self, table):
        for name in table:
            self.assertTrue(os.path.exists(os.path.join(REPO, name)),
                            "허용 목록의 %s 가 저장소에 없다" % name)

    def test_app_허용목록(self):
        self._존재(wpol.APP_WRITERS)

    def test_피드_허용목록(self):
        self._존재(wpol.FEED_WRITERS)

    def test_다른_저장소_목록(self):
        self._존재(wpol.OTHER_STORES)

    def test_사람확인_목록(self):
        self._존재({p for p, _s in wpol.REVIEWED_UNPROVEN})

    def test_사람확인_건수가_실제와_같다(self):
        """새 미증명 쓰기가 생기면 여기서 깨진다 — 조용히 늘어나지 못한다."""
        actual = {}
        for r in wpol.audit(REPO)["rows"]:
            if r["key"] or r["detail"] == wpath.WRAPPER_DEF:
                continue
            k = (r["path"], r["sink"])
            actual[k] = actual.get(k, 0) + 1
        expected = {k: n for k, (n, _d, _w) in wpol.REVIEWED_UNPROVEN.items()}
        self.assertEqual(actual, expected)


class 운영_경계_사실(unittest.TestCase):
    """실측으로 못 박는다. 코드의 **의도**와 버킷 정책의 **현실**은 다르다."""

    def test_공개_접두사_표와_버킷_정책의_차이가_없다(self):
        """INTEGRATION-8 에서는 `reports/` 가 여기 걸렸다 — 발행해도 못 읽었다.

        INTEGRATION-9 에서 `reports/published/*` 를 버킷 정책에 넣어 차이를 없앴다.
        다시 벌어지면(표에 넣고 정책을 안 고치면) 여기서 깨진다.
        """
        self.assertEqual(priv.PUBLIC_PREFIX_GAP, ())
        self.assertIn("reports/published/", priv.BUCKET_PUBLIC_PREFIXES)

    def test_character_studio_는_비공개다(self):
        self.assertIn("character-studio/", priv.PRIVATE_PREFIXES)
        self.assertNotIn("character-studio/", priv.BUCKET_PUBLIC_PREFIXES)

    def test_거부가_하나도_없다(self):
        """지금 저장소 기준. **위 CASE 들이 계속 잡히는 한** 이 0 은 의미가 있다."""
        denied = wpol.audit(REPO)["denied"]
        self.assertEqual(
            [(d["path"], d["line"], d["verdict"]) for d in denied], [])


if __name__ == "__main__":                                # pragma: no cover
    unittest.main(verbosity=2)
