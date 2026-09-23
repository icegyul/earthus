# -*- coding: utf-8 -*-
"""gmgsi-clouds WebP 변형 — 네트워크·S3 없이 도는 시험 (2026-09-23).

운영 파일로 재는 것은 check_real_png.py 다. 여기서는 규칙만 못 박는다.
  · 알파는 한 값도 달라지지 않는다(0은 0, 255는 255) — 그렇지 않은 변형은 올리지 않는다
  · 변형은 image/webp · PNG 와 같은 캐시로 올라간다
  · PNG 경로(키·형식·캐시)는 그대로이고, 올리는 순서는 PNG → 변형 → meta.json 이다

  python -m unittest discover -s aws/gmgsi-clouds/tests -p "test_*.py"
"""
import importlib.util
import io
import os
import re
import tempfile
import unittest

import numpy as np
from PIL import Image

HERE = os.path.dirname(os.path.abspath(__file__))
HANDLER = os.path.join(os.path.dirname(HERE), "handler.py")


def load_handler():
    os.environ.setdefault("CACHE_BUCKET", "local-test-bucket-not-used")
    os.environ.setdefault("CACHE_REGION", "us-east-2")
    nowhere = os.path.join(tempfile.gettempdir(), "earthus-no-aws-config")
    os.environ["AWS_CONFIG_FILE"] = nowhere
    os.environ["AWS_SHARED_CREDENTIALS_FILE"] = nowhere
    os.environ["AWS_EC2_METADATA_DISABLED"] = "true"
    spec = importlib.util.spec_from_file_location("gmgsi_handler_under_test", HANDLER)
    mod = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(mod)
    return mod


H = load_handler()
# 합성 그림은 1000 폭이라 폰 판 폭을 줄여서 시험한다(운영은 3072 → 2048, check_real_png.py 가 잰다).
H.PHONE_W = 640


def synthetic_la(h=600, w=1000, seed=7):
    """구름 경계·자료 없음(0)·꽉 찬 구름(255)·극 페이드를 흉내 낸 LA."""
    rng = np.random.default_rng(seed)
    y, x = np.mgrid[0:h, 0:w].astype(np.float32)
    blob = np.exp(-(((x - w * 0.3) / (w * 0.08)) ** 2 + ((y - h * 0.5) / (h * 0.15)) ** 2))
    blob += 0.8 * np.exp(-(((x - w * 0.7) / (w * 0.05)) ** 2 + ((y - h * 0.4) / (h * 0.1)) ** 2))
    a = np.clip(blob * 1.6 + rng.normal(0, 0.05, (h, w)) - 0.25, 0, 1)
    a[:, int(w * 0.45):int(w * 0.52)] = 0.0              # 자료 없음 쐐기 — 반드시 투명
    a[int(h * 0.45):int(h * 0.55), int(w * 0.27):int(w * 0.33)] = 1.0   # 꽉 찬 구름
    ramp = np.linspace(0, 1, 24)[:, None]
    a[:24] *= ramp
    a[-24:] *= ramp[::-1]
    lum = np.clip(0.45 + 0.4 * np.sin(x / 9.0) * np.cos(y / 7.0) + rng.normal(0, 0.05, (h, w)), 0.35, 1.0)
    la = np.empty((h, w, 2), np.uint8)
    la[..., 0] = (lum * 255).astype(np.uint8)
    la[..., 1] = (a * 255).astype(np.uint8)
    return la


class FakeS3:
    def __init__(self, fail_on=None):
        self.puts = []
        self.fail_on = fail_on

    def put_object(self, **kw):
        if self.fail_on and kw["Key"] == self.fail_on:
            raise RuntimeError("fake put failure")
        self.puts.append(kw)


def decode_rgba(body):
    with Image.open(io.BytesIO(body)) as im:
        im.load()
        return im.format, np.asarray(im.convert("RGBA"))


class EncodeVariantsTest(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.la = synthetic_la()
        cls.variants = H.encode_variants(cls.la)

    def test_two_variants_with_exact_alpha(self):
        names = [v["name"] for v in self.variants]
        self.assertEqual(names, ["webp", "webp2048"])
        full = self.variants[0]
        fmt, dec = decode_rgba(full["body"])
        self.assertEqual(fmt, "WEBP")
        self.assertTrue(np.array_equal(dec[..., 3], self.la[..., 1]), "3072 판 알파가 한 값이라도 다르면 안 된다")
        A = self.la[..., 1]
        self.assertEqual(int(((A == 0) & (dec[..., 3] != 0)).sum()), 0, "0 은 계속 0")
        self.assertEqual(int(((A == 255) & (dec[..., 3] != 255)).sum()), 0, "255 는 계속 255")

    def test_phone_variant_size_and_alpha(self):
        v = self.variants[1]
        h, w = self.la.shape[:2]
        self.assertEqual(v["width"], H.PHONE_W)
        self.assertEqual(v["height"], max(1, round(H.PHONE_W * h / w)))
        ref = H._shrink_la(self.la, H.PHONE_W)
        _, dec = decode_rgba(v["body"])
        self.assertTrue(np.array_equal(dec[..., 3], ref[..., 1]))
        # 자료 없음 쐐기 한가운데(주변 전부 0)는 줄인 뒤에도 0
        mid = dec[:, int(ref.shape[1] * 0.485), 3]
        self.assertEqual(int(mid.max()), 0)

    def test_luminance_is_lossy_but_close_and_gray(self):
        _, dec = decode_rgba(self.variants[0]["body"])
        vis = self.la[..., 1] > 0
        err = np.abs(dec[..., 0].astype(int) - self.la[..., 0].astype(int))[vis]
        self.assertLess(float(err.mean()), 8.0)
        spread = max(int(np.abs(dec[..., 0].astype(int) - dec[..., 1]).max()),
                     int(np.abs(dec[..., 0].astype(int) - dec[..., 2]).max()))
        self.assertLessEqual(spread, 1, "회색 그림이 색을 띠면 안 된다")

    def test_no_phone_variant_when_it_would_upscale(self):
        """폰 판은 줄일 때만 — 입력이 PHONE_W 이하이면 3072 판 하나만 나온다."""
        out = H.encode_variants(synthetic_la(120, 200))
        self.assertEqual([v["name"] for v in out], ["webp"])

    def test_record_fields(self):
        import hashlib
        for v in self.variants:
            self.assertEqual(v["bytes"], len(v["body"]))
            self.assertEqual(v["sha256"], hashlib.sha256(v["body"]).hexdigest())
            self.assertTrue(v["alphaExact"])

    def test_variant_with_changed_alpha_is_dropped(self):
        """알파가 달라진 변형은 돌려주지 않는다 = 올리지 않는다."""
        real = H._webp_bytes

        def lossy_alpha(la):
            buf = io.BytesIO()
            Image.fromarray(la, mode="LA").save(buf, format="WEBP", quality=80, alpha_quality=20, method=3)
            return buf.getvalue()

        noisy = self.la.copy()
        rng = np.random.default_rng(1)
        noisy[..., 1] = np.clip(noisy[..., 1].astype(int) + rng.integers(-40, 40, noisy.shape[:2]), 0, 255)
        H._webp_bytes = lossy_alpha
        try:
            out = H.encode_variants(noisy)
        finally:
            H._webp_bytes = real
        self.assertEqual(out, [], "알파 손실 인코딩은 검증에서 걸러져야 한다")


class UploadTest(unittest.TestCase):
    def test_upload_uses_webp_type_and_png_cache(self):
        variants = H.encode_variants(synthetic_la(300, 1000))
        s3 = FakeS3()
        listed = H.upload_variants(s3, "bucket-x", variants)
        self.assertEqual([p["Key"] for p in s3.puts], ["clouds/global.webp", "clouds/global-2048.webp"])
        for p in s3.puts:
            self.assertEqual(p["ContentType"], "image/webp")
            # (2026-09-24 정정) PNG 와 같은 캐시 — 둘 다 CLOUD_CACHE_CONTROL(5분)이다.
            self.assertEqual(p["CacheControl"], H.CLOUD_CACHE_CONTROL)
        self.assertEqual(set(listed), {"webp", "webp2048"})
        for name, rec in listed.items():
            self.assertNotIn("body", rec)
            self.assertEqual(rec["alpha"], "lossless")
            self.assertEqual(rec["type"], "image/webp")

    def test_upload_failure_propagates(self):
        variants = H.encode_variants(synthetic_la(300, 1000))
        with self.assertRaises(RuntimeError):
            H.upload_variants(FakeS3(fail_on="clouds/global-2048.webp"), "bucket-x", variants)


class HandlerSourceTest(unittest.TestCase):
    """PNG 경로는 그대로이고 순서는 PNG → 변형 → meta 다."""

    @classmethod
    def setUpClass(cls):
        with open(HANDLER, encoding="utf-8") as fh:
            cls.src = fh.read()

    def test_png_put_unchanged(self):
        # (2026-09-23 정정) PNG 바이트를 한 번 읽어 sha 와 업로드에 같이 쓴다(png_body) — 올리는 바이트·형식은 그대로다.
        block = re.search(r'dst\.put_object\(\s*Bucket=DST_BUCKET, Key="clouds/global\.png",\s*'
                          r'Body=(?:open\(png, "rb"\)\.read\(\)|png_body),\s*ContentType="image/png",', self.src)
        self.assertIsNotNone(block, "global.png 업로드 형태가 바뀌었다")
        self.assertIn('Image.fromarray(la, mode="LA").save(png, optimize=True)', self.src)
        # (2026-09-24 정정) 5분 — CloudFront 가 ?t= 를 무시해 그림이 meta 라벨보다 30분까지 늦던 것을 meta(5분)와 맞췄다.
        self.assertEqual(H.CLOUD_CACHE_CONTROL, "public, max-age=300")

    def test_order_png_then_variants_then_meta(self):
        # (2026-09-23 정정) 순서: PNG → meta(변형 없이) → 변형 인코딩·업로드 → meta(변형 적어) 다시.
        #   배포 전 기준선 Max Memory 1,878/2,048 MB — 인코딩 중 죽어도 그 시각 PNG·meta 는 이미 나가 있어야 한다.
        i_png = self.src.index('Key="clouds/global.png"')
        i_meta_first = self.src.index("put_meta(meta)   # ①")
        i_enc = self.src.index("variants = encode_variants(la)")
        i_var = self.src.index("upload_variants(dst, DST_BUCKET, variants)")
        i_meta_again = self.src.index("put_meta(meta)   # ③")
        self.assertLess(i_png, i_meta_first)
        self.assertLess(i_meta_first, i_enc, "PNG·meta 를 올리기 전에 인코딩한다 — OOM 이면 그 시각 PNG 까지 못 나간다")
        self.assertLess(i_enc, i_var)
        self.assertLess(i_var, i_meta_again)
        self.assertIn('Key="clouds/meta.json"', self.src)

    def test_alpha_quality_is_lossless(self):
        self.assertEqual(H.WEBP_ALPHA_QUALITY, 100)


if __name__ == "__main__":
    unittest.main()
