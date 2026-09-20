# -*- coding: utf-8 -*-
"""연안 침수 예상도 — 폰이 한 번 누를 때 받는 양 시험 (2026-09-20).

무엇이 잘못돼 있었나
  기관 산출물 61,776면을 시군구 파일 69개로 올리면서 **압축도 정밀도 조정도 하지 않았다.**
  합계 306.6 MB · 고흥군 한 곳이 33.0 MB · 10 MB 넘는 곳 9곳. 화면이 "약 33 MB"라고 고지는 하지만,
  고지한다고 33 MB 가 줄지는 않는다. 이동통신망에서 한 곳을 보려고 33 MB 를 받는 것은 유료 서비스가 할 짓이 아니다.
  S3 는 시키지 않으면 압축하지 않는다 — Accept-Encoding: gzip 을 보내도 원본을 그대로 준다(운영에서 실측).

이 시험이 지키는 것
  ① 큰 문서는 gzip 으로 올라가고, 작은 문서는 그냥 올라간다(헤더 + CPU 가 되레 손해라서)
  ② gzip 으로 올린 것은 **풀면 원래 JSON 과 같다** — 압축이 자료를 바꾸지 않는다
  ③ _put 이 돌려주는 크기는 **압축 전 크기**다(로그·색인이 그 수를 쓴다)
  ④ 좌표는 5자리(약 1.1 m)로 줄고, 그래도 폴리곤 모양이 그림에서 달라지지 않는다
  ⑤ ContentType 은 그대로 application/json — 브라우저 fetch 가 알아서 푼다

AWS 도 기관 API 도 필요 없다. s3 클라이언트만 가짜로 갈아 끼운다.
"""
import gzip
import importlib.util
import json
import os
import sys
# 핸들러는 들일 때 환경을 읽는다. 시험에서는 **가짜 값**을 준다 — 진짜 자격이나 버킷 이름을 쓰지 않는다.
os.environ.setdefault("AWS_ACCESS_KEY_ID", "testing")      # 가짜 값 — 이 시험은 AWS 에 닿지 않는다
os.environ.setdefault("AWS_SECRET_ACCESS_KEY", "testing")
os.environ.pop("AWS_PROFILE", None)                         # 로컬 login 자격을 타면 import 에서 터진다
os.environ.setdefault("AWS_DEFAULT_REGION", "us-east-2")
os.environ.setdefault("CACHE_BUCKET", "test-bucket-not-real")
os.environ.setdefault("DATA_GO_KR_KEY", "not-a-real-key")   # 네트워크를 타는 시험이 없다

# ⚠️ `import handler` 로 들이면 안 된다 — 이 저장소에는 수집기마다 handler.py 가 있어서,
#    전체 시험을 한 번에 돌리면 **먼저 들어온 남의 handler** 가 캐시에서 돌아온다(실측: 4건 전부 실패).
#    파일 경로로 고유한 이름을 붙여 들인다.
_HANDLER_PY = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), "handler.py")
_spec = importlib.util.spec_from_file_location("khoa_coast_handler", _HANDLER_PY)
handler = importlib.util.module_from_spec(_spec)
sys.modules["khoa_coast_handler"] = handler
_spec.loader.exec_module(handler)  # noqa: E402


class FakeS3:
    def __init__(self):
        self.puts = []

    def put_object(self, **kw):
        self.puts.append(kw)
        return {}


def _swap_s3():
    fake = FakeS3()
    handler.s3 = fake
    return fake


def test_큰_문서는_gzip_작은_문서는_그대로():
    fake = _swap_s3()
    small = {"a": "x" * 100}
    big = {"a": ["서해안 침수면" * 20] * 4000}          # 압축이 잘 되는 반복 문자열이라 효과가 또렷하다
    handler._put("ocean/khoa/flood/small.json", small)
    handler._put("ocean/khoa/flood/big.json", big)

    s, b = fake.puts
    assert "ContentEncoding" not in s, "작은 문서까지 압축하면 헤더와 CPU 만 늘어난다"
    assert b.get("ContentEncoding") == "gzip"
    assert len(json.dumps(small, ensure_ascii=False, separators=(",", ":")).encode()) < handler.GZIP_MIN_BYTES
    assert len(json.dumps(big, ensure_ascii=False, separators=(",", ":")).encode()) >= handler.GZIP_MIN_BYTES
    # 실제로 작아졌나 — 안 작아지면 압축할 이유가 없다
    assert len(b["Body"]) < len(json.dumps(big, ensure_ascii=False, separators=(",", ":")).encode()) / 2


def test_gzip_은_자료를_바꾸지_않는다():
    fake = _swap_s3()
    doc = {"features": [{"v": "0.5-1.0", "g": [[[126.12345, 34.54321] * 500]]}] * 60,
           "name": "거제시", "license": "공공누리 (출처표시)"}
    raw = handler._put("ocean/khoa/flood/x.json", doc)
    put = fake.puts[0]
    assert put["ContentEncoding"] == "gzip"
    assert json.loads(gzip.decompress(put["Body"]).decode()) == doc, "푼 것이 원본과 다르다"
    # 돌려주는 수는 압축 전 크기다 — 색인·로그가 '받는 양'이 아니라 '자료의 양'을 말해야 한다
    assert raw == len(json.dumps(doc, ensure_ascii=False, separators=(",", ":")).encode())
    assert raw > len(put["Body"])
    assert put["ContentType"].startswith("application/json"), "브라우저가 JSON 으로 읽어야 한다"


def test_좌표는_약_1m_자리까지만():
    # 5자리 = 경도 1° 의 10만분의 1. 위도 35° 에서 경도 1° 는 약 91 km 이므로 0.00001° ≈ 0.91 m.
    assert handler.WKT_DECIMALS == 5
    wkt = "MULTIPOLYGON(((126.1234567 34.5432109,126.1234599 34.5432199,126.1235 34.5433,126.1234567 34.5432109)))"
    got = handler.wkt_multipolygon(wkt)
    ring = got[0][0]
    assert ring[0] == 126.12346 and ring[1] == 34.54321
    for v in ring:
        assert round(v, handler.WKT_DECIMALS) == v, "5자리보다 촘촘한 좌표가 남았다"
    # 잘라 낸 양이 1.5 m 를 넘지 않는다 — 우리 화면의 가장 세밀한 지형(약 300 m/px)보다 200배 작다
    moved = abs(126.1234567 - ring[0]) * 91000
    assert moved < 1.5, f"{moved:.2f} m 움직였다"


def test_깨진_WKT_는_값을_지어내지_않는다():
    assert handler.wkt_multipolygon("POLYGON((1 2,3 4))") is None
    assert handler.wkt_multipolygon("") is None
    assert handler.wkt_multipolygon("MULTIPOLYGON(((1 2,3 x,5 6,1 2)))") is None
