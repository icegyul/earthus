# -*- coding: utf-8 -*-
"""EARTHUS EARTH CAPTURE 다리 — INTEGRATION-1 §8 · §22 · §31.

**이 파일은 그림을 그리지 않는다.** 실제 EARTHUS V2 런타임이 그린다.
여기서 하는 일은 "리포트 팩트 하나를 그 지구 화면으로 데려가는 주소"를 만드는 것뿐이다.

왜 서버에서 지구를 그리지 않나 — 이미 내려진 결정을 그대로 따른다.
  aws/distribution/visual.py 의 첫 주석:
    "지구 장면은 Three.js 씬 안에서만 실제로 존재한다. 서버에서 지구를 다시 그리면
     화면과 다른 지구가 두 개 생긴다."
  그래서 카메라·레이어·캔버스 **사양은 그 파일이 정본**이고(camera_for · make_spec ·
  make_asset_metadata), 이 파일은 그 사양을 v2-three 가 알아듣는 **링크**로 옮긴다.

이미 있는 것을 다시 만들지 않는다
  · 카메라 결정      distribution/visual.camera_for()
  · 자산 메타데이터  distribution/visual.make_asset_metadata()
  · 현상→레이어      phenomenon-registry 의 representativeLayerFor()
  · 링크 문법        prototype/v2-three/js/main.js 의 linkState()/applyLink()

링크 문법 (main.js:5671 linkState 가 쓰고 main.js:5708 applyLink 가 읽는다)
  #v=1&at=<위도>,<경도>,<거리>,<기울기>&base=<바탕>&cloud=<구름>&live=<레이어,레이어>
  거리는 지구 반경의 배수다. main.js:5857 이 altKm = (dist - 1) * 6371 로 쓴다.

⚠️⚠️ **찍은 그림이 요청한 화면인지 반드시 되읽어 확인한다**(§31).
   레이어가 실제로 켜졌는지, 카메라가 그 자리로 갔는지 확인하지 않으면
   "임의의 지구 사진"에 그럴듯한 메타데이터만 붙는다. 그건 가짜 증거다.
   verify_capture() 가 그 대조를 하고, 어긋나면 verified=False 와 사유를 남긴다.
"""
import os
import sys

_HERE = os.path.dirname(os.path.abspath(__file__))
_AWS = os.path.dirname(_HERE)
sys.path.insert(0, os.path.join(_AWS, "_shared"))
# distribution/visual.py 가 카메라·자산 메타의 정본이다. 복제하지 않고 그대로 쓴다.
sys.path.insert(0, os.path.join(_AWS, "distribution"))

import report_period as rp        # noqa: E402
import visual as vis              # noqa: E402

EARTH_RADIUS_KM = 6371.0          # main.js:55 EARTH_RADIUS_M 과 같은 값
CAPTURE_SCHEMA = "earthus.earth-capture.v1"
CAPTURE_VERSION = "earthus.capture/1.0.0"

# 카메라가 그 자리에 갔다고 볼 허용 오차. 관성 때문에 소수점까지 같지는 않다.
TOL_DEG = 1.5
TOL_DIST = 0.05


def dist_for_height_km(height_km):
    """카메라 높이(km) → v2-three 의 거리 단위. main.js 의 역함수다.

    main.js:5857  altKm = (dist - 1) * 6371
    """
    try:
        h = float(height_km)
    except (TypeError, ValueError):
        return None
    return round(1.0 + max(h, 0.0) / EARTH_RADIUS_KM, 4)


def height_km_for_dist(dist):
    try:
        return round((float(dist) - 1.0) * EARTH_RADIUS_KM, 1)
    except (TypeError, ValueError):
        return None


def layer_ids_for(layer_refs):
    """'ocean/sstfield' → 'sstfield'.

    링크의 live= 는 **맨 id** 를 받는다(live-layers.js:252 activeIds).
    메뉴 키는 복합키(scene/layer)이므로 뒤쪽만 떼어 쓴다.
    ⚠️ 맨 id 로 바꾸면 scene 정보가 사라진다 — 그래서 요청한 복합키도 함께 남긴다.
    """
    out = []
    for ref in layer_refs or []:
        bare = ref.split("/")[-1] if isinstance(ref, str) else None
        if bare and bare not in out:
            out.append(bare)
    return out


def build_link(camera, *, layer_refs=None, cloud=None, base=None, tilt=0.0):
    """카메라·레이어 → v2-three 링크 조각. applyLink 가 그대로 복원한다."""
    lat = camera.get("lat")
    lon = camera.get("lon")
    dist = dist_for_height_km(camera.get("heightKm"))
    if lat is None or lon is None or dist is None:
        return None
    parts = ["v=1", "at=%.3f,%.3f,%.4f,%.3f" % (float(lat), float(lon), dist, float(tilt))]
    if base and base != "ne2":
        parts.append("base=%s" % base)
    if cloud:
        parts.append("cloud=%s" % cloud)
    live = layer_ids_for(layer_refs)
    if live:
        parts.append("live=%s" % ",".join(live))
    return "#" + "&".join(parts)


def request_for_fact(fact, *, layer_refs=None, geometry=None, app_base="", cloud=None):
    """§22 — 리포트 팩트 하나 → 캡처 요청.

    팩트가 phenomenon_id · period · layerRefs 를 들고 있으므로 그 맥락을 그대로 재현한다.
    기하가 없으면 전지구 시점으로 물러난다 — 좌표를 지어내지 않는다(visual.camera_for).
    """
    if not fact:
        return None
    refs = list(layer_refs or fact.get("layerRefs") or [])
    camera = vis.camera_for(geometry or {"type": "global"})
    link = build_link(camera, layer_refs=refs, cloud=cloud)
    if not link:
        return None
    return {
        "schemaVersion": CAPTURE_SCHEMA,
        "captureId": "cap:%s:%s" % (fact.get("period") or "", fact.get("factId") or ""),
        "factId": fact.get("factId"),
        "phenomenonId": fact.get("phenomenonId"),
        "period": fact.get("period"),
        "layerRefs": refs,                    # 복합키 그대로 (scene/layer)
        "liveIds": layer_ids_for(refs),       # 링크가 쓰는 맨 id
        "camera": camera,
        "geometry": geometry or {"type": "global"},
        "link": link,
        "url": (app_base + link) if app_base else link,
        "sourceRefs": list(fact.get("evidenceRefs") or []),
        "generatorVersion": CAPTURE_VERSION,
    }


def verify_capture(request, observed):
    """§31 — 실제로 그 화면이었는지 되읽어 확인한다.

    observed 는 브라우저에서 읽어 온 실제 상태다:
      {"activeIds": [...], "lat":.., "lon":.., "dist":.., "ready": bool}

    돌려주는 것: {verified, problems[], observed}
    ⚠️ 한 가지라도 어긋나면 verified=False 다. '거의 맞음'을 맞음으로 올리지 않는다 —
       그 순간 이 그림은 증거가 아니라 장식이 된다.
    """
    problems = []
    obs = observed or {}
    if not obs.get("ready"):
        problems.append("런타임이 준비되지 않았다")

    want_ids = set(request.get("liveIds") or [])
    got_ids = set(obs.get("activeIds") or [])
    missing = sorted(want_ids - got_ids)
    if missing:
        problems.append("요청한 레이어가 켜지지 않았다: %s" % ", ".join(missing))

    cam = request.get("camera") or {}
    want_dist = dist_for_height_km(cam.get("heightKm"))
    for name, want, got, tol in (
        ("위도", cam.get("lat"), obs.get("lat"), TOL_DEG),
        ("경도", cam.get("lon"), obs.get("lon"), TOL_DEG),
        ("거리", want_dist, obs.get("dist"), TOL_DIST),
    ):
        if want is None or got is None:
            problems.append("%s를 확인할 수 없다" % name)
            continue
        # 경도는 ±180 에서 감긴다. 감긴 차이를 오차로 세지 않는다.
        d = abs(float(want) - float(got))
        if name == "경도":
            d = min(d, 360.0 - d)
        if d > tol:
            problems.append("%s가 요청과 다르다: 요청 %s · 실제 %s" % (name, want, got))

    return {"verified": not problems, "problems": problems, "observed": obs}


def asset_metadata(request, *, asset_id, captured_at, dataset_snapshot, verification,
                   canvas=None, file_ref=None, commit_sha=None, runtime_version=None,
                   language="ko"):
    """§11 VisualManifest 항목. 자산 메타의 뼈대는 distribution/visual 것을 그대로 쓴다.

    ⚠️ 확인에 실패한 캡처도 **버리지 않고** 남긴다. 다만 verified=False 로 남긴다 —
       실패를 지우면 왜 그림이 없는지 아무도 모른다.
    """
    spec = {
        "template": "EARTH_CAPTURE",
        "format": "SINGLE_IMAGE",
        "canvas": canvas or {"w": 1200, "h": 800},
        "areas": {"geo": {"camera": request.get("camera"),
                          "layers": request.get("layerRefs") or [],
                          "geometry": request.get("geometry")}},
    }
    meta = vis.make_asset_metadata(
        asset_id=asset_id, content_id=request.get("factId"), spec=spec,
        captured_at=captured_at, dataset_snapshot=dataset_snapshot)
    # 캡처 고유 정보를 얹는다. 그림 하나에서 팩트·현상·기간·커밋까지 되짚을 수 있어야 한다.
    meta.update({
        "captureSchema": CAPTURE_SCHEMA,
        "captureId": request.get("captureId"),
        "visualType": "EARTH_CAPTURE",
        "phenomenonId": request.get("phenomenonId"),
        "factRefs": [request.get("factId")] if request.get("factId") else [],
        "period": request.get("period"),
        "sourceRefs": request.get("sourceRefs") or [],
        "link": request.get("link"),
        "language": language,
        "runtimeVersion": runtime_version,
        "commitSha": commit_sha,
        "fileRef": file_ref,
        "verified": bool(verification and verification.get("verified")),
        "verificationProblems": list((verification or {}).get("problems") or []),
        "observedState": (verification or {}).get("observed"),
    })
    return meta


def manifest(entries, *, report_id=None, generated_at=None):
    """§11 — 한 보고서의 시각자료 목록. 확인된 것과 실패한 것을 같이 담는다."""
    rows = list(entries or [])
    return {
        "schemaVersion": CAPTURE_SCHEMA,
        "reportId": report_id,
        "generatedAt": generated_at,
        "count": len(rows),
        "verifiedCount": sum(1 for r in rows if r.get("verified")),
        "assets": rows,
    }


def period_time_hint(period):
    """기간 → 그 기간을 대표하는 시각. 캡처가 '언제의 지구'인지 적을 때 쓴다.

    ⚠️ 지금 v2-three 링크 문법에는 **시각 필드가 없다**(linkState 참고).
       그래서 캡처는 '지금 자료로 그린 그 지역'이지 '그때의 지구'가 아니다.
       이 사실을 숨기지 않고 메타데이터에 그대로 적는다.
    """
    try:
        _, start, end = rp.parse(period)
    except Exception:                                  # noqa: BLE001
        return None
    return {
        "periodFrom": start.isoformat(),
        "periodTo": end.isoformat(),
        "timeInLink": False,
        "note": ("링크 문법에 시각이 없어 캡처는 실행 시점의 자료로 그려진다. "
                 "기간을 되돌린 화면이 아니다."),
    }
