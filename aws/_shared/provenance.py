# -*- coding: utf-8 -*-
"""EARTHUS 출처 해석기 — 지시서 §2 · §32 · §68 · §123.

한 가지 질문에만 답한다: **"이 문장은 어디서 왔는가?"**

콘텐츠 → 현상/사건/리포트 → 자료 → 공급자 까지 사슬을 걸어 준다.
사슬이 끊기면 조용히 넘어가지 않고 끊긴 자리를 말한다 — 그게 이 파일의 목적이다.

새 출처 레지스트리를 만들지 않는다(§68)
  · 공급자 정본은 이미 두 곳에 있다:
      Supabase `provider_registry` / `provider_health` (운영 상태)
      prototype/js/earthus2/v06/action/source-registry.js (표시용)
  · 여기서는 그 둘을 대신하지 않고, **자료 참조(ref) → 사람이 읽는 출처 설명**만 든다.
    ref 는 S3 키(`wind/series/verify-daily.json`)이거나 외부 URL 이다.
"""

PROVENANCE_SCHEMA = "earthus.provenance.v1"

# §123 — 기존 어휘를 그대로 쓴다.
SOURCE_STATE = ("ACTIVE", "DEGRADED", "STALE", "UNAVAILABLE", "UNKNOWN")

# 자료 참조 → 공급자. 여기 없는 ref 는 UNKNOWN 이고, 그것은 발행을 막는 사유가 된다(§73).
# ⚠️ 새 줄을 넣을 때는 실제로 그 파일을 쓰는 수집기 경로를 함께 적는다.
DATASET_PROVENANCE = {
    "wind/series/verify-daily.json": {
        "provider": "Open-Meteo (GFS·ECMWF) + 기상청 ASOS",
        "providerEn": "Open-Meteo (GFS/ECMWF) + KMA ASOS",
        "dataset": "예보 검증 일별 채점",
        "collector": "aws/kma-verify/handler.py",
        "license": "Open-Meteo CC-BY 4.0 · 기상청 공공누리 제1유형",
        "truthType": "EARTHUS_ANALYSIS",
        "coverage": "대한민국 ASOS 97지점 · 리드 24·48시간",
        "cadence": "매시간 예보 보존 · 일 1회 채점",
    },
    "ocean/lab-reports.json": {
        "provider": "EARTHUS LAB 현상별 계산기",
        "providerEn": "EARTHUS LAB per-phenomenon engines",
        "dataset": "사건 분석 보고서 색인",
        "collector": "aws/lab-report-index/handler.py",
        "license": "각 원자료 라이선스를 따른다",
        "truthType": "EARTHUS_ANALYSIS",
        "coverage": "9종 현상",
        "cadence": "3시간",
    },
    "ocean/cyclone-reports.json": {
        "provider": "IBTrACS + KMA·JMA·NHC 공식 트랙",
        "providerEn": "IBTrACS + KMA/JMA/NHC official tracks",
        "dataset": "태풍 경로 검증",
        "collector": "aws/cyclone-analog",
        "license": "NOAA public domain · 기상청 공공누리",
        "truthType": "EARTHUS_ANALYSIS",
        "coverage": "전 해역",
        "cadence": "3시간",
    },
    "events/typhoon-official.json": {
        "provider": "기상청 · 일본기상청 · 미국 국립허리케인센터",
        "providerEn": "KMA / JMA / NHC",
        "dataset": "공식 태풍 통보문",
        "collector": "aws/typhoon-official",
        "license": "각 기관 공개 자료",
        "truthType": "OFFICIAL_FORECAST",
        "coverage": "북서태평양 · 대서양 · 동태평양",
        "cadence": "기관 발표 주기",
    },
    "events/gdacs-tc.json": {
        "provider": "GDACS (EU JRC · UN OCHA)",
        "providerEn": "GDACS (EU JRC / UN OCHA)",
        "dataset": "전 해역 열대저기압 경보",
        "collector": "aws/gdacs-tc",
        "license": "GDACS 공개 자료",
        "truthType": "OFFICIAL_WARNING",
        "coverage": "전 지구",
        "cadence": "기관 갱신 주기",
    },
    "ocean/cyclone-events.json": {
        "provider": "EARTHUS 사건 패킷 (GDACS 결합)",
        "providerEn": "EARTHUS event packets (GDACS-joined)",
        "dataset": "태풍 사건 상태·회차",
        "collector": "aws/cyclone-analog",
        "license": "GDACS 공개 자료 기반",
        "truthType": "EARTHUS_ANALYSIS",
        "coverage": "활동 중 + 종료 사건",
        "cadence": "3시간",
    },
    "analysis/earthquake-reports.json": {
        "provider": "USGS ComCat",
        "providerEn": "USGS ComCat",
        "dataset": "지진 사건 보고서",
        "collector": "aws/lab-events",
        "license": "USGS public domain",
        "truthType": "OFFICIAL_OBSERVATION",
        "coverage": "전 지구 M4.5+",
        "cadence": "수시",
    },
}

# 종류 접두사만 알아도 되는 경우(analysis/<kind>-reports.json). 위 표에 없으면 여기서 만든다.
_LAB_KINDS = {
    "smoke-ash": ("NASA FIRMS · VAAC 화산재 권고", "NASA FIRMS / VAAC advisories"),
    "air-pollution": ("CAMS · 에어코리아", "CAMS / AirKorea"),
    "ocean-drift": ("Argo 플로트", "Argo floats"),
    "bird-migration": ("국립생물자원관 위치추적 자료", "NIBR bird tracking"),
    "marine-bloom": ("국립수산과학원 해파리·적조 기록", "NIFS jellyfish / algal bloom records"),
    "aurora": ("NOAA SWPC", "NOAA SWPC"),
    "space-reentry": ("CelesTrak · 18th SDS", "CelesTrak / 18th SDS"),
}


class ProvenanceError(ValueError):
    """출처 사슬이 끊겼다."""


def resolve_dataset(ref):
    """자료 참조 하나를 사람이 읽을 수 있는 출처로 바꾼다.

    모르면 **UNKNOWN 을 돌려준다.** 그럴듯한 이름을 지어내지 않는다 —
    지어내면 화면에는 출처가 있는 것처럼 보이고 실제로는 없다.
    """
    if not ref:
        return None
    hit = DATASET_PROVENANCE.get(ref)
    if hit:
        return {"ref": ref, "resolved": True, **hit}
    # analysis/<kind>-reports.json 은 종류로 풀 수 있다.
    if ref.startswith("analysis/") and ref.endswith("-reports.json"):
        kind = ref[len("analysis/"):-len("-reports.json")]
        names = _LAB_KINDS.get(kind)
        if names:
            return {
                "ref": ref, "resolved": True,
                "provider": names[0], "providerEn": names[1],
                "dataset": f"{kind} 사건 보고서",
                "collector": "aws/lab-events → aws/lab-report-index",
                "license": "각 원자료 라이선스를 따른다",
                "truthType": "EARTHUS_ANALYSIS",
                "coverage": None, "cadence": None,
            }
    return {
        "ref": ref, "resolved": False,
        "provider": None, "providerEn": None, "dataset": None,
        "collector": None, "license": None, "truthType": "UNKNOWN",
        "coverage": None, "cadence": None,
        "note": "이 자료의 출처가 표에 없다 — aws/_shared/provenance.py 에 추가해야 한다",
    }


def resolve_content(content):
    """§32 — 콘텐츠 하나의 출처 패널을 만든다.

    돌려주는 것에는 **끊긴 사슬 목록**이 들어 있다. 비어 있어야 발행할 수 있다(§73).
    """
    datasets = [resolve_dataset(r) for r in content.get("datasetRefs") or []]
    unresolved = [d["ref"] for d in datasets if d and not d["resolved"]]

    broken = []
    if not content.get("dataSnapshotId"):
        broken.append("dataSnapshotId 가 없다 — 무엇을 보고 만들었는지 모른다")
    if not datasets:
        broken.append("datasetRefs 가 비어 있다 — 자료를 가리키지 않는다")
    if not (content.get("phenomenonIds") or content.get("eventIds") or content.get("reportIds")):
        broken.append("현상·사건·리포트를 하나도 가리키지 않는다")
    for ref in unresolved:
        broken.append(f"출처를 풀 수 없는 자료: {ref}")

    # 문장 단위 — 관측이라 적었는데 출처가 없는 문장을 찾는다.
    for c in content.get("claims") or []:
        if c.get("type") == "OBSERVED" and not c.get("sourceRefs"):
            broken.append(f"관측 문장에 출처가 없다: {c.get('claimId')}")

    return {
        "schemaVersion": PROVENANCE_SCHEMA,
        "subject": content.get("contentId") or content.get("reportId"),
        "phenomenonIds": list(content.get("phenomenonIds") or []),
        "eventIds": list(content.get("eventIds") or []),
        "reportIds": list(content.get("reportIds") or []),
        "datasets": datasets,
        "dataSnapshotId": content.get("dataSnapshotId"),
        "generatedAt": content.get("generatedAt"),
        "generatorVersion": content.get("generatorVersion"),
        "chainComplete": not broken,
        "brokenLinks": broken,
    }


def resolve_report(report):
    """리포트도 같은 사슬을 만든다. 필드 이름만 다르다(§68 원장 하나)."""
    refs = set()
    for f in report.get("facts") or []:
        for r in f.get("evidenceRefs") or []:
            refs.add(r)
    for p in report.get("provenance") or []:
        if isinstance(p, dict) and p.get("ref"):
            refs.add(p["ref"])
    shim = {
        "contentId": report.get("reportId"),
        "phenomenonIds": report.get("phenomenonIds"),
        "eventIds": [],
        "reportIds": [report.get("reportId")] if report.get("reportId") else [],
        "datasetRefs": sorted(refs),
        "dataSnapshotId": report.get("dataSnapshotId"),
        "generatedAt": report.get("generatedAt"),
        "generatorVersion": report.get("algorithmVersion"),
        "claims": [],
    }
    out = resolve_content(shim)
    out["subject"] = report.get("reportId")
    return out


def source_registry(items):
    """§68 — 리포트/콘텐츠 묶음 하나의 출처 등기부.

    같은 자료가 여러 번 나와도 한 줄로 합친다. 상태는 호출자가 넣는다
    (여기서 살아 있는지 확인하지 않는다 — 그건 provider_health 의 일이다).
    """
    seen = {}
    for it in items:
        chain = it if it.get("schemaVersion") == PROVENANCE_SCHEMA else resolve_content(it)
        for d in chain.get("datasets") or []:
            if not d:
                continue
            row = seen.setdefault(d["ref"], dict(d))
            row["usedBy"] = sorted(set(row.get("usedBy") or []) | {chain.get("subject")})
    return {
        "schemaVersion": PROVENANCE_SCHEMA,
        "count": len(seen),
        "sources": [seen[k] for k in sorted(seen)],
        "unresolved": sorted(k for k, v in seen.items() if not v.get("resolved")),
    }
