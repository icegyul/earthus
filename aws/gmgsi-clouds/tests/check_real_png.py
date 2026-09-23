# -*- coding: utf-8 -*-
"""운영 global.png 한 장으로 handler.encode_variants 를 그대로 돌려 보는 시험 (2026-09-23).

왜 필요한가
  WebP 변형은 PNG 와 **같은 LA 그림**이어야 한다. 특히 알파(구름이 어디 있나)는 한 값도 달라지면 안 된다
  (imagery.js "0은 계속 0, 1은 계속 1" · AVIF 탈락 사유). 합성 자료로는 실제 구름 경계·자료 없음(0)·
  극 페이드 띠를 다 못 만든다. 그래서 운영 파일로 잰다.

  handler.encode_variants 는 최종 LA(uint8) 만 받으므로, 운영 global.png 를 풀면 Lambda 가 그 시각에
  가졌던 입력과 **같은 배열**이 된다 → 같은 Pillow/libwebp 면 같은 바이트가 나온다.

쓰는 법
  python aws/gmgsi-clouds/tests/check_real_png.py --png <global.png> [--out <dir>] [--json <report.json>]
  --png 를 안 주면 https://earthus.net/clouds/global.png 를 임시 폴더로 받는다(읽기만).
  --out 을 주면 global.webp · global-2048.webp 를 그 폴더에 쓴다(비교판 tools 가 읽는다).

통과 조건(하나라도 어기면 종료 코드 1)
  ① 두 변형 모두 알파가 입력과 완전히 같다(np.array_equal)
  ② 3072 판: PNG 알파 0 → 0, 255 → 255 (①의 따름이지만 따로 센다)
  ③ 2048 판: 줄이기 전 주변(LANCZOS 지지폭 이상)이 전부 0 이던 화소는 0, 전부 255 이던 화소는 255
  ④ 풀었을 때 R=G=B 에서 벗어난 폭이 1 이하(회색 그림이 색을 띠지 않는다)

메모리 측정의 한계
  tracemalloc 은 numpy·Pillow 의 파이썬 쪽 할당만 본다. libwebp 가 C 에서 잡는 버퍼는 안 보인다.
  그래서 프로세스 최고 작업 집합(Windows PeakWorkingSetSize / Linux ru_maxrss)을 인코딩 전후로 같이 적는다.
  Lambda 의 진짜 값은 첫 실행 뒤 CloudWatch 의 `REPORT ... Max Memory Used` 줄이다.
"""
import argparse
import hashlib
import importlib.util
import io
import json
import os
import sys
import tempfile
import time
import tracemalloc
import urllib.request

import numpy as np
from PIL import Image, features

HERE = os.path.dirname(os.path.abspath(__file__))
HANDLER = os.path.join(os.path.dirname(HERE), "handler.py")
LIVE_URL = "https://earthus.net/clouds/global.png"


def load_handler():
    """handler.py 를 S3 에 손대지 않고 불러온다.

    handler 는 import 할 때 CACHE_BUCKET 을 읽고 boto3 클라이언트를 만든다(요청은 하지 않는다).
    가짜 버킷 이름을 주고, 사용자 AWS 설정·자격 파일은 읽지 않도록 없는 경로를 가리킨다."""
    os.environ.setdefault("CACHE_BUCKET", "local-test-bucket-not-used")
    os.environ.setdefault("CACHE_REGION", "us-east-2")
    nowhere = os.path.join(tempfile.gettempdir(), "earthus-no-aws-config")
    os.environ["AWS_CONFIG_FILE"] = nowhere
    os.environ["AWS_SHARED_CREDENTIALS_FILE"] = nowhere
    os.environ["AWS_EC2_METADATA_DISABLED"] = "true"
    spec = importlib.util.spec_from_file_location("gmgsi_handler", HANDLER)
    mod = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(mod)
    return mod


def process_memory_mb():
    """(최고 작업 집합, 현재 작업 집합) MB. Linux 는 현재값을 모르므로 None."""
    if sys.platform == "win32":
        import ctypes
        from ctypes import wintypes

        class PMC(ctypes.Structure):
            _fields_ = [("cb", wintypes.DWORD), ("PageFaultCount", wintypes.DWORD),
                        ("PeakWorkingSetSize", ctypes.c_size_t), ("WorkingSetSize", ctypes.c_size_t),
                        ("QuotaPeakPagedPoolUsage", ctypes.c_size_t), ("QuotaPagedPoolUsage", ctypes.c_size_t),
                        ("QuotaPeakNonPagedPoolUsage", ctypes.c_size_t),
                        ("QuotaNonPagedPoolUsage", ctypes.c_size_t),
                        ("PagefileUsage", ctypes.c_size_t), ("PeakPagefileUsage", ctypes.c_size_t)]
        k32 = ctypes.windll.kernel32
        k32.GetCurrentProcess.restype = wintypes.HANDLE
        psapi = ctypes.windll.psapi
        psapi.GetProcessMemoryInfo.argtypes = [wintypes.HANDLE, ctypes.POINTER(PMC), wintypes.DWORD]
        pmc = PMC()
        pmc.cb = ctypes.sizeof(PMC)
        psapi.GetProcessMemoryInfo(k32.GetCurrentProcess(), ctypes.byref(pmc), pmc.cb)
        return round(pmc.PeakWorkingSetSize / 1e6, 1), round(pmc.WorkingSetSize / 1e6, 1)
    import resource
    return round(resource.getrusage(resource.RUSAGE_SELF).ru_maxrss / 1024, 1), None


def _shift_reduce(a, radius, op):
    """a 의 (2r+1)² 창 최대/최소 — scipy 없이. 가장자리는 가장자리 값을 늘려 채운다."""
    out = a.copy()
    p = np.pad(a, radius, mode="edge")
    h, w = a.shape
    # 가로 → 세로 두 번에 나눠 (분리 가능한 창)
    row = a.copy()
    for dx in range(-radius, radius + 1):
        row = op(row, p[radius:radius + h, radius + dx:radius + dx + w])
    p2 = np.pad(row, radius, mode="edge")
    out = row.copy()
    for dy in range(-radius, radius + 1):
        out = op(out, p2[radius + dy:radius + dy + h, radius:radius + w])
    return out


def stats(err):
    err = np.asarray(err, dtype=np.float64).ravel()
    if err.size == 0:
        return {"n": 0}
    return {"n": int(err.size), "max": round(float(err.max()), 3), "mean": round(float(err.mean()), 4),
            "p99": round(float(np.percentile(err, 99)), 3), "p999": round(float(np.percentile(err, 99.9)), 3)}


# v1 imagery.js 가 화면에 올리는 값 — CLOUD_LUMA_LUT · CLOUD_ALPHA_LUT 와 같은 식(imagery.js:300 부근)
V1_LUMA = np.round(90 + np.arange(256) * 165 / 255).astype(np.float64)
V1_ALPHA = np.round(255 * np.power(np.arange(256) / 255, 0.78)).astype(np.float64)


def luminance_report(ref_la, dec_rgba):
    L0 = ref_la[..., 0].astype(np.int16)
    A0 = ref_la[..., 1]
    L1 = dec_rgba[..., 0].astype(np.int16)
    d = np.abs(L1 - L0)
    vis = A0 > 0
    solid = A0 >= 64
    # 화면에 실제로 보이는 차이 — v1 은 L 을 90~255 로 누르고 알파를 0.78 감마로 올린 뒤 얹는다.
    # 같은 알파(무손실)이므로 보이는 차이 = |LUT(L1) − LUT(L0)| × LUT(A)/255
    v1_vis = np.abs(V1_LUMA[L1] - V1_LUMA[L0]) * V1_ALPHA[A0] / 255.0
    rgb_spread = max(int(np.abs(dec_rgba[..., 0].astype(np.int16) - dec_rgba[..., 1]).max()),
                     int(np.abs(dec_rgba[..., 0].astype(np.int16) - dec_rgba[..., 2]).max()))
    return {
        "L_err_alpha_gt0": stats(d[vis]),
        "L_err_alpha_ge64": stats(d[solid]),
        "v1_visible_err_all_px": stats(v1_vis),
        "v1_visible_err_alpha_gt0": stats(v1_vis[vis]),
        "rgb_spread_max": rgb_spread,
    }


def _get(url):
    req = urllib.request.Request(url, headers={"Cache-Control": "no-cache"})
    with urllib.request.urlopen(req, timeout=60) as r:
        return r.read(), {k.lower(): v for k, v in r.headers.items()}


def verify_live(base="https://earthus.net/clouds"):
    """배포 뒤 확인(읽기 전용). meta.json 의 variants 가 실제 객체와 맞는지, 알파가 PNG 와 같은지.

    종료 코드: 0 통과 · 1 불일치 · 2 variants 없음(배포 전이거나 이번 시각 변형 실패 — 앱은 PNG)
             3 캐시 시차(PNG 가 meta 와 다른 시각) — 몇 분 뒤 다시."""
    handler = load_handler()
    meta_b, _ = _get(f"{base}/meta.json")
    meta = json.loads(meta_b)
    out = {"meta_time": meta.get("time"), "checks": [], "fails": []}
    if not meta.get("variants"):
        out["note"] = "meta.json 에 variants 없음 — 앱은 PNG 를 쓴다"
        print(json.dumps(out, ensure_ascii=False, indent=2))
        return 2
    png_b, png_h = _get(f"{base}/global.png")
    if meta.get("png", {}).get("sha256") and hashlib.sha256(png_b).hexdigest() != meta["png"]["sha256"]:
        out["note"] = "받은 PNG 가 meta.json 의 PNG 와 다르다(엣지 캐시 시차) — 몇 분 뒤 다시"
        print(json.dumps(out, ensure_ascii=False, indent=2))
        return 3
    with Image.open(io.BytesIO(png_b)) as im:
        im.load()
        la = np.asarray(im).copy()
    for name, rec in meta["variants"].items():
        body, hdr = _get(f"{base}/{os.path.basename(rec['key'])}")
        sha = hashlib.sha256(body).hexdigest()
        with Image.open(io.BytesIO(body)) as im:
            im.load()
            dec = np.asarray(im.convert("RGBA"))
        ref = la if name == "webp" else handler._shrink_la(la, rec["width"])
        row = {"name": name, "bytes": len(body), "sha_ok": sha == rec["sha256"],
               "bytes_ok": len(body) == rec["bytes"],
               "content_type": hdr.get("content-type"), "cache_control": hdr.get("cache-control"),
               "size_ok": dec.shape[1] == rec["width"] and dec.shape[0] == rec["height"],
               "alpha_exact_vs_png": bool(dec.shape[:2] == ref.shape[:2]
                                          and np.array_equal(dec[..., 3], ref[..., 1]))}
        out["checks"].append(row)
        for k in ("sha_ok", "bytes_ok", "size_ok", "alpha_exact_vs_png"):
            if not row[k]:
                out["fails"].append(f"{name}: {k}")
        if row["content_type"] != "image/webp":
            out["fails"].append(f"{name}: Content-Type {row['content_type']}")
        if row["cache_control"] != png_h.get("cache-control"):
            out["fails"].append(f"{name}: Cache-Control {row['cache_control']} ≠ PNG {png_h.get('cache-control')}")
    print(json.dumps(out, ensure_ascii=False, indent=2))
    return 0 if not out["fails"] else 1


def main(argv=None):
    ap = argparse.ArgumentParser()
    ap.add_argument("--png", help="운영 global.png 경로. 없으면 earthus.net 에서 받는다(읽기)")
    ap.add_argument("--out", help="여기에 global.webp · global-2048.webp 를 쓴다")
    ap.add_argument("--json", help="보고서 JSON 저장 경로")
    ap.add_argument("--live", action="store_true",
                    help="배포 뒤 확인: earthus.net 의 meta.json·PNG·WebP 를 읽어 대조한다(읽기 전용)")
    a = ap.parse_args(argv)
    if a.live:
        return verify_live()

    png_path = a.png
    if not png_path:
        png_path = os.path.join(tempfile.gettempdir(), "earthus-global.png")
        urllib.request.urlretrieve(LIVE_URL, png_path)

    handler = load_handler()
    png_bytes = open(png_path, "rb").read()
    with Image.open(io.BytesIO(png_bytes)) as im:
        assert im.mode == "LA", f"LA PNG 가 아니다: {im.mode}"
        im.load()
        la = np.asarray(im).copy()
    H, W = la.shape[:2]
    A = la[..., 1]

    mem_before = process_memory_mb()
    tracemalloc.start()
    t0 = time.perf_counter()
    variants = handler.encode_variants(la)
    total_ms = round((time.perf_counter() - t0) * 1000)
    _, py_peak = tracemalloc.get_traced_memory()
    tracemalloc.stop()
    mem_after = process_memory_mb()

    by = {v["name"]: v for v in variants}
    fails = []
    report = {
        "input": {"path": png_path, "bytes": len(png_bytes), "sha256": hashlib.sha256(png_bytes).hexdigest(),
                  "width": W, "height": H,
                  "alpha0_frac": round(float((A == 0).mean()), 4),
                  "alpha255_frac": round(float((A == 255).mean()), 4)},
        "env": {"python": sys.version.split()[0], "pillow": Image.__version__ if hasattr(Image, "__version__")
                else __import__("PIL").__version__, "libwebp": features.version("webp"),
                "settings": {"quality": handler.WEBP_QUALITY, "alpha_quality": handler.WEBP_ALPHA_QUALITY,
                             "method": handler.WEBP_METHOD, "phone_w": handler.PHONE_W}},
        "encode": {"total_ms_incl_verify": total_ms, "tracemalloc_peak_mb": round(py_peak / 1e6, 1),
                   "process_peak_ws_mb_before": mem_before[0], "process_peak_ws_mb_after": mem_after[0],
                   "process_peak_delta_mb": round(mem_after[0] - mem_before[0], 1)},
        "variants": {},
    }
    for name in ("webp", "webp2048"):
        if name not in by:
            fails.append(f"{name}: encode_variants 가 돌려주지 않았다(알파 불일치로 빠졌거나 실패)")
    ref2048 = handler._shrink_la(la, handler.PHONE_W)

    for name, v in by.items():
        ref = la if name == "webp" else ref2048
        with Image.open(io.BytesIO(v["body"])) as im:
            im.load()
            dec = np.asarray(im.convert("RGBA"))
        exact = bool(np.array_equal(dec[..., 3], ref[..., 1]))
        entry = {"key": v["key"], "width": v["width"], "height": v["height"], "bytes": v["bytes"],
                 "sha256": v["sha256"], "encodeMs": v["encodeMs"],
                 "vs_png_bytes_pct": round(100 * v["bytes"] / len(png_bytes), 1),
                 "alpha_exact_vs_input": exact}
        if not exact:
            fails.append(f"{name}: 알파가 입력과 다르다")
        if name == "webp":
            z = int(((A == 0) & (dec[..., 3] != 0)).sum())
            f = int(((A == 255) & (dec[..., 3] != 255)).sum())
            entry["png_alpha0_became_nonzero"] = z
            entry["png_alpha255_changed"] = f
            if z or f:
                fails.append(f"webp: 0→비0 {z} · 255→비255 {f}")
        else:
            # ③ 줄이기 전 주변이 전부 0/255 였던 화소 — 3072 좌표에서 반지름 5(LANCZOS 지지폭 4.5 보다 넓게)
            r = 5
            win_max = _shift_reduce(A, r, np.maximum)
            win_min = _shift_reduce(A, r, np.minimum)
            h2, w2 = ref.shape[:2]
            ys = np.clip(np.round((np.arange(h2) + 0.5) * H / h2 - 0.5).astype(int), 0, H - 1)
            xs = np.clip(np.round((np.arange(w2) + 0.5) * W / w2 - 0.5).astype(int), 0, W - 1)
            all0 = win_max[np.ix_(ys, xs)] == 0
            all255 = win_min[np.ix_(ys, xs)] == 255
            z = int((all0 & (dec[..., 3] != 0)).sum())
            f = int((all255 & (dec[..., 3] != 255)).sum())
            entry["surround_all0_px"] = int(all0.sum())
            entry["surround_all0_became_nonzero"] = z
            entry["surround_all255_px"] = int(all255.sum())
            entry["surround_all255_changed"] = f
            entry["alpha0_frac"] = round(float((dec[..., 3] == 0).mean()), 4)
            if z or f:
                fails.append(f"webp2048: 주변 전부 0 → 비0 {z} · 전부 255 → 비255 {f}")
            # 참고(통과 조건 아님): 폰 판을 3072 로 다시 늘렸을 때(GPU 처럼 쌍선형) PNG 알파와의 차이 = 해상도 손실
            up = np.asarray(Image.fromarray(dec[..., 3]).resize((W, H), Image.BILINEAR)).astype(np.int16)
            entry["info_upscaled_alpha_vs_png"] = stats(np.abs(up - A.astype(np.int16)))
        entry["luminance"] = luminance_report(ref, dec)
        if entry["luminance"]["rgb_spread_max"] > 1:
            fails.append(f"{name}: R·G·B 가 {entry['luminance']['rgb_spread_max']} 만큼 갈라졌다")
        report["variants"][name] = entry
        if a.out:
            os.makedirs(a.out, exist_ok=True)
            with open(os.path.join(a.out, os.path.basename(v["key"])), "wb") as fh:
                fh.write(v["body"])

    report["pass"] = not fails
    report["fails"] = fails
    text = json.dumps(report, ensure_ascii=False, indent=2)
    print(text)
    if a.json:
        with open(a.json, "w", encoding="utf-8") as fh:
            fh.write(text + "\n")
    return 0 if not fails else 1


if __name__ == "__main__":
    sys.exit(main())
