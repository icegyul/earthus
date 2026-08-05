#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""데이터 카탈로그 생성기 — "어디에 무엇이 있고, 어떻게 가져오고, 어떻게 인용하나"

왜 이 파일이 있나
  받은 방향: "모든 데이터를 가지고 올 필요 없어. 어떤 데이터가 어디에 있다 이걸
  정리해두면 필요할 때 빠르게 찾아서 가져올 수 있어. 그리고 매우 중요한 데이터는
  직접 보관해두면 연결이 끊기거나 삭제되는 걸 예방할 수 있을 거야."

  그대로다. 이 카탈로그가 그 "정리해둔 것"이고, 세 곳이 같은 파일을 쓴다.
    1) 사람    — 보고서 1장 "자료와 방법"이 여기서 그대로 나온다
    2) 파이프라인 — access.urlPattern 으로 실제로 받아온다
    3) 챗 라우터  — keywords 로 "이 질문이면 이 자료"를 찾는다

⚠️ 인용문을 사람이 쓰지 않는다.
   논문에 실릴 출처를 손으로 적으면 오타 하나가 그대로 남는다.
   DOI 가 있는 자료는 doi.org 에서 서지정보를 받아 만든다 (아래 csl_citation).
   DOI 가 없는 자료는 기관이 공지한 표기를 옮기되 doi 필드를 비워 둔다.

⚠️ 라이선스를 추측하지 않는다.
   확인된 것만 적고, 모르면 "unverified" 로 두고 termsUrl 을 남긴다.
   그래야 공개 직전에 "확인해야 할 목록"이 저절로 생긴다.
   미국 연방기관 산출물(NOAA·NASA·USGS)은 17 U.S.C. §105 로 공개영역이지만,
   그 안에 제3자 자료가 섞이는 경우가 있어 자료마다 따로 적는다.

출력
  prototype/data/catalog.json   (앱과 함께 배포된다)
"""

import json
import os
import sys
import urllib.request
from datetime import datetime, timezone

OUT = os.path.join(os.path.dirname(__file__), "..", "..",
                   "prototype", "data", "catalog.json")

UA = {"User-Agent": "earthus-catalog/0.1 (+globe app)"}

# ── 라이선스 사전 ───────────────────────────────────────────────
# ⚠️ status: verified 는 소스 전체에 하나의 확인된 조건을 적용할 수 있을 때만 쓴다.
# per-item 은 각 항목의 조건을 화면에서 개별 확인해야 한다는 뜻이다.
LIC = {
    "usgov-pd": {
        "id": "US-Gov-Public-Domain",
        "ko": "미국 연방정부 저작물 — 공개영역 (17 U.S.C. §105)",
        "en": "US federal government work — public domain (17 U.S.C. §105)",
        "status": "verified",
    },
    "odbl": {
        "id": "ODbL-1.0",
        "ko": "Open Database License 1.0 — 출처표시 + 동일조건변경허락",
        "en": "Open Database License 1.0 — attribution + share-alike",
        "url": "https://opendatacommons.org/licenses/odbl/1-0/",
        "status": "verified",
        "warn": {
            "ko": "⚠️ 파생 데이터베이스를 공개 배포하면 같은 조건으로 공개할 의무가 생긴다. "
                  "archive/ 를 열기 전에 이 자료를 분리해야 한다.",
            "en": "⚠️ Publicly distributing a derived database triggers share-alike. "
                  "This source must be separated before archive/ is ever opened.",
        },
    },
    "copernicus": {
        "id": "Copernicus-Licence",
        "ko": "Copernicus 제품 라이선스 — 출처표시 필요",
        "en": "Copernicus product licence — attribution required",
        "url": "https://apps.ecmwf.int/datasets/licences/copernicus/",
        "status": "verified",
    },
    "cc-by-4.0": {
        "id": "CC-BY-4.0",
        "ko": "Creative Commons 저작자표시 4.0 국제",
        "en": "Creative Commons Attribution 4.0 International",
        "url": "https://creativecommons.org/licenses/by/4.0/",
        "status": "verified",
    },
    "wikimedia-per-item": {
        "id": "WIKIMEDIA-PER-FILE",
        "ko": "파일별 자유 라이선스 — 저작자·조건·원본 파일 페이지를 각각 표시",
        "en": "Per-file free licence — show each creator, terms, and original file page",
        "url": "https://commons.wikimedia.org/wiki/Commons:Reusing_content_outside_Wikimedia/en",
        "status": "per-item",
        "warn": {
            "ko": "⚠️ Commons 전체에 하나의 라이선스가 있는 것이 아니다. 각 파일 설명 페이지의 저작자·라이선스·변경 조건을 따로 따라야 한다.",
            "en": "⚠️ Commons has no single blanket licence. Follow the creator, licence, and modification terms on each file description page.",
        },
    },
    "smithsonian-noncommercial": {
        "id": "SMITHSONIAN-USAGE-CONDITIONS",
        "ko": "Smithsonian 이용 조건 — 개인·교육·비상업 이용, 상업 이용은 사전 허가 필요",
        "en": "Smithsonian usage conditions — personal, educational, and non-commercial use; prior permission required for commercial use",
        "url": "https://volcano.si.edu/gvp_termsofuse.cfm",
        "status": "restricted",
        "warn": {
            "ko": "⚠️ 출처를 인용해도 상업 이용이 자동으로 허용되지 않는다. GVP 또는 권리자의 사전 서면 허가가 필요하다.",
            "en": "⚠️ Attribution alone does not permit commercial use. Prior written permission from GVP or the applicable rightsholder is required.",
        },
    },
    "gdelt-open": {
        "id": "GDELT-OPEN-ATTRIBUTION",
        "ko": "GDELT 오픈 데이터 — 학술·상업·공공 용도 무제한 이용·재배포, GDELT 인용·링크 필수",
        "en": "GDELT open data — unlimited academic, commercial, and governmental use and redistribution; citation and link required",
        "url": "https://www.gdeltproject.org/about.html#termsofuse",
        "status": "verified",
    },
    "unverified": {
        "id": "UNVERIFIED",
        "ko": "라이선스 미확인 — 공개 배포 전 반드시 확인할 것",
        "en": "Licence not verified — must be checked before any public redistribution",
        "status": "unverified",
    },
}

# 등급 — 받은 방향("모두 가져올 필요 없다 / 중요한 건 직접 보관")을 그대로 코드로
TIERS = {
    "A": {"ko": "직접 보관 — 작고 결정적이라 사본을 우리가 들고 있는다. 링크가 끊기거나 "
                "내용이 바뀌어도 우리가 쓴 그 바이트가 남는다.",
          "en": "Mirrored — small and decisive, so we hold our own copy. If the link dies "
                "or the content changes, the exact bytes we used remain."},
    "B": {"ko": "곁에 두고 조회 — 너무 커서 통째로 받지 않는다. 필요한 시공간 조각만 그때 읽는다.",
          "en": "Queried in place — too large to mirror. We read only the slice we need, when we need it."},
    "C": {"ko": "실시간 수집 — 지금 우리가 매시간 받아 쌓고 있는 것.",
          "en": "Collected live — what we already fetch and accumulate hourly."},
    "OWN": {"ko": "우리가 만든 것 — 다른 곳에 없다. 소급 불가능하므로 가장 먼저 지킨다.",
            "en": "Ours — exists nowhere else. Cannot be recreated, so it is protected first."},
}


def csl_citation(doi):
    """doi.org 서지정보로 인용문을 만든다. 실패하면 None (지어내지 않는다)."""
    try:
        req = urllib.request.Request(
            f"https://doi.org/{doi}",
            headers={**UA, "Accept": "application/vnd.citationstyles.csl+json"})
        j = json.loads(urllib.request.urlopen(req, timeout=40).read().decode("utf-8", "replace"))
    except Exception as e:                                   # noqa: BLE001
        print(f"  ! DOI 조회 실패 {doi}: {e!r}")
        return None
    au = j.get("author") or []
    names = []
    for a in au[:3]:
        fam, giv = a.get("family"), a.get("given")
        names.append(f"{fam}, {giv[0]}." if fam and giv else (fam or a.get("literal") or ""))
    who = ", ".join(n for n in names if n)
    if len(au) > 3:
        who += ", et al."
    if not who:
        who = j.get("publisher", "")
    yr = (j.get("issued", {}).get("date-parts") or [[None]])[0][0]
    title = j.get("title", "")
    pub = j.get("publisher", "")
    ver = j.get("version")
    bits = [b for b in [who, f"({yr})" if yr else None, title,
                        f"Version {ver}" if ver else None, pub,
                        f"https://doi.org/{doi}"] if b]
    return ". ".join(bits).replace("..", ".")


# ══════════════════════════════════════════════════════════════
#  자료 목록
#
#  keywords 는 챗 라우터가 쓴다. 사람이 실제로 칠 법한 말을 넣는다
#  ("수온" 뿐 아니라 "바닷물 온도", "해수온"). 부족하면 나중에 로그를 보고 늘린다.
# ══════════════════════════════════════════════════════════════
DATASETS = [
    # ── 우리가 만든 것 (소급 불가) ────────────────────────────
    {
        "id": "earthus-forecast-snapshots", "tier": "OWN",
        "title": {"ko": "예보 스냅샷 (earthus)", "en": "Forecast snapshots (earthus)"},
        "org": "earthus",
        "domain": ["forecast", "temperature", "wind"],
        "keywords": {"ko": ["예보", "예보정확도", "예보검증", "내일날씨", "예측"],
                     "en": ["forecast", "forecast accuracy", "verification", "tomorrow"]},
        "spatial": "전지구 5° 격자 2,376지점", "temporal": "2026-07-27~ · 6시간 간격",
        "access": {"method": "s3", "key": "archive/forecast/dt={YYYY-MM-DD}/hh={HH}/part.jsonl.gz",
                   "format": "jsonl.gz", "private": True},
        "license": "own",
        "why": {"ko": "⚠️ 이것만은 소급이 불가능하다. 과거 관측은 기관이 영구 보존하지만 "
                      "'그때 뭐라고 예보했었나'는 어디에도 안 남는다 — 예보는 갱신되면 덮어써지고 "
                      "지나간 예보를 돌려주는 API 가 없다.",
                "en": "⚠️ The one thing that cannot be recreated. Past observations are preserved "
                      "forever by the agencies; what was *forecast* at a moment is kept nowhere — "
                      "forecasts are overwritten and no API returns a past one."},
        "usedBy": ["report-1", "report-6", "model-1"],
    },
    {
        "id": "earthus-cyclone-tracks", "tier": "OWN",
        "title": {"ko": "태풍 경로 보관 (earthus)", "en": "Retained cyclone tracks (earthus)"},
        "org": "earthus",
        "domain": ["cyclone"],
        "keywords": {"ko": ["태풍", "허리케인", "사이클론", "폭풍", "경로", "진로"],
                     "en": ["typhoon", "hurricane", "cyclone", "storm", "track"]},
        "spatial": "전지구", "temporal": "2026-07-27~ · 매시간 · 소멸 후 72시간 유지",
        "access": {"method": "https", "key": "events/cyclone-tracks.json",
                   "format": "json", "cors": True},
        "license": "cc-by-4.0",
        "licenseNote": "GDACS 원자료의 CC BY 4.0과 출처표시 조건을 계속 따른다.",
        "why": {"ko": "공식 기관은 열대저기압 지위를 잃는 순간 추적을 끊는다. 그런데 그 구름과 비는 "
                      "며칠 더 지나간다. 그 공백 구간을 잇는 기록은 우리만 갖는다.",
                "en": "Official agencies stop tracking the moment a system loses tropical status, "
                      "yet its cloud and rain persist for days. Only we record that gap."},
        "usedBy": ["report-2"],
    },
    {
        "id": "earthus-fire-lifecycle", "tier": "OWN",
        "title": {"ko": "산불 생애주기 (earthus fid)", "en": "Wildfire lifecycle (earthus fid)"},
        "org": "earthus",
        "domain": ["wildfire"],
        "keywords": {"ko": ["산불", "화재", "불", "연기", "화점"],
                     "en": ["wildfire", "fire", "smoke", "hotspot"]},
        "spatial": "전지구", "temporal": "2026-07-26~ · 매시간",
        "access": {"method": "s3", "key": "archive/wildfire/dt={YYYY-MM-DD}/hh={HH}/part.jsonl.gz",
                   "format": "jsonl.gz", "private": True},
        "license": "own", "licenseNote": "NASA FIRMS 원자료에서 파생 (공개영역)",
        "why": {"ko": "FIRMS 는 '이 시각 이 자리에 열이 있다'만 준다. 같은 불을 시간축으로 잇는 "
                      "지속 ID(fid)는 우리가 붙인 것이다 — 그래야 '어디서 어디로 갔나'를 물을 수 있다.",
                "en": "FIRMS gives only 'there is heat here now'. The persistent id (fid) that links "
                      "one fire across time is ours — without it you cannot ask where a fire went."},
        "usedBy": ["report-4", "model-3"],
    },
    {
        "id": "earthus-archive", "tier": "OWN",
        "title": {"ko": "시간별 관측 아카이브 (earthus)", "en": "Hourly observation archive (earthus)"},
        "org": "earthus",
        "domain": ["quake", "buoy", "wind", "news", "solar", "cyclone"],
        "keywords": {"ko": ["기록", "이력", "과거", "아카이브", "축적"],
                     "en": ["archive", "history", "past", "record"]},
        "spatial": "전지구", "temporal": "2026-07-26~ · 매시간",
        "access": {"method": "s3", "key": "archive/{dataset}/dt={YYYY-MM-DD}/hh={HH}/part.jsonl.gz",
                   "format": "jsonl.gz", "private": True},
        "license": "own",
        "why": {"ko": "⚠️ archive/ 는 비공개 접두사다. 앞으로 사용자 상호작용이 들어갈 자리라 "
                      "절대 공개로 열지 않는다. 공개가 필요하면 집계본을 따로 만든다.",
                "en": "⚠️ archive/ is a private prefix and must never be opened — user interaction "
                      "data is planned for it. Publish aggregates separately if needed."},
        "usedBy": ["report-1", "report-3", "report-5"],
    },

    # ── A등급: 직접 보관 ──────────────────────────────────────
    {
        "id": "oisst-climatology", "tier": "A",
        "title": {"ko": "OISST 일별 평년값 1991–2020", "en": "OISST daily climatology 1991–2020"},
        "org": "NOAA NCEI", "doi": "10.25921/RE9P-PT57",
        "domain": ["ocean", "temperature", "baseline"],
        "keywords": {"ko": ["평년", "평년값", "기준선", "평균수온", "이맘때"],
                     "en": ["climatology", "baseline", "normal", "average sst"]},
        "spatial": "전지구 0.25°", "temporal": "1991–2020 평년 · 일별 366일",
        "access": {"method": "https",
                   "url": "https://downloads.psl.noaa.gov/Datasets/noaa.oisst.v2.highres/"
                          "sst.day.mean.ltm.1991-2020.nc",
                   "format": "netcdf4", "bytes": 1397364832, "cors": False},
        "license": "usgov-pd",
        "why": {"ko": "'이상하다'를 말하려면 '정상은 이렇다'가 있어야 한다. 이게 없으면 "
                      "겨울 수온 이상도 열돔도 주장할 수 없다. "
                      "⚠️ 반드시 같은 달력 구간으로 비교할 것 — 전체 날짜를 평균 내면 연평균이 나온다.",
                "en": "You cannot say 'anomalous' without 'normal'. Without this, neither ocean "
                      "warm anomalies nor heat domes can be claimed. "
                      "⚠️ Compare within the same calendar window — averaging all days yields the annual mean."},
        "usedBy": ["report-3", "report-6", "model-2"],
    },
    {
        "id": "oisst-daily", "tier": "A",
        "title": {"ko": "OISST 일별 해수면온도", "en": "OISST daily sea surface temperature"},
        "org": "NOAA NCEI", "doi": "10.25921/RE9P-PT57",
        "domain": ["ocean", "temperature"],
        "keywords": {"ko": ["수온", "해수온", "바닷물온도", "해수면온도", "표층수온"],
                     "en": ["sst", "sea surface temperature", "ocean temperature"]},
        "spatial": "전지구 0.25°", "temporal": "1981-09~ · 일별 · 지연 약 1일",
        "access": {"method": "https",
                   "urlPattern": "https://www.ncei.noaa.gov/data/"
                                 "sea-surface-temperature-optimum-interpolation/v2.1/access/avhrr/"
                                 "{YYYYMM}/oisst-avhrr-v02r01.{YYYYMMDD}.nc",
                   "format": "netcdf4", "bytesPerDay": 1570113, "cors": False,
                   "alt": "https://coastwatch.pfeg.noaa.gov/erddap/griddap/ncdcOisst21Agg_LonPM180"},
        "license": "usgov-pd",
        "why": {"ko": "평년값과 짝이 되는 실측. ⚠️ 소급 보정되는 자료다 — 보고서에 쓴 날짜의 "
                      "파일을 체크섬과 함께 보관해야 나중에 숫자를 재현할 수 있다.",
                "en": "The measurement that pairs with the climatology. ⚠️ It is retroactively "
                      "revised — mirror the exact file with a checksum or the reported numbers "
                      "cannot be reproduced later."},
        "usedBy": ["report-3", "model-2"],
    },
    {
        "id": "ibtracs", "tier": "A",
        "title": {"ko": "IBTrACS 전지구 태풍 베스트트랙", "en": "IBTrACS global best track archive"},
        "org": "NOAA NCEI", "doi": "10.25921/82ty-9e16",
        "domain": ["cyclone", "history"],
        "keywords": {"ko": ["태풍이력", "과거태풍", "베스트트랙", "태풍통계"],
                     "en": ["best track", "historical cyclone", "hurricane history"]},
        "spatial": "전지구", "temporal": "1842~ (since1980 판 별도) · 갱신 지연 있음",
        "access": {"method": "https",
                   "url": "https://www.ncei.noaa.gov/data/"
                          "international-best-track-archive-for-climate-stewardship-ibtracs/"
                          "v04r01/access/csv/ibtracs.since1980.list.v04r01.csv",
                   "format": "csv", "bytes": 143044657, "cors": False},
        "license": "usgov-pd",
        "why": {"ko": "우리 실시간 경로에 40년 맥락을 붙인다. ⚠️ 실시간용이 아니다 — 실측으로 "
                      "ACTIVE 판에 최근 태풍(GENEVIEWE·NOUL)이 없었다. 과거 통계용으로만 쓴다.",
                "en": "Gives 40 years of context to our live tracks. ⚠️ Not for real time — the "
                      "ACTIVE file was measured to be missing recent storms. Use for history only."},
        "usedBy": ["report-2"],
    },
    {
        "id": "gvp-volcano", "tier": "A",
        "title": {"ko": "세계 화산 목록 (스미소니언 GVP)", "en": "Volcanoes of the World (Smithsonian GVP)"},
        "org": "Smithsonian Institution", "doi": "10.5479/si.GVP.VOTW5-2025.5.3",
        "officialCitation": "Global Volcanism Program, 2025. [Database] Volcanoes of the World "
                            "(v. 5.3.6; 26 May 2026). Distributed by Smithsonian Institution, "
                            "compiled by Venzke, E. https://doi.org/10.5479/si.GVP.VOTW5-2025.5.3",
        "domain": ["volcano"],
        "keywords": {"ko": ["화산", "분화", "화산활동"], "en": ["volcano", "eruption"]},
        "spatial": "전지구", "temporal": "홀로세 전체 · VOTW 5.3.6 (2026-05-26)",
        "access": {"method": "https",
                   "url": "https://webservices.volcano.si.edu/geoserver/GVP-VOTW/wfs",
                   "format": "wfs", "cors": False,
                   "termsUrl": "https://volcano.si.edu/gvp_termsofuse.cfm",
                   "note": "⚠️ 화면의 30개 정적 지점은 실시간 피드가 아니다. 현재 분화 여부를 판정하지 않고 각국 담당 기관 링크를 제공한다."},
        "license": "smithsonian-noncommercial",
        "licenseNote": "GVP 이용 조건은 저자·소스·GVP 링크 인용을 요구하고, 상업 이용은 사전 서면 허가를 요구한다.",
        "usedBy": ["report-5"],
    },
    {
        "id": "ndbc-historical", "tier": "A",
        "title": {"ko": "NDBC 부이 연간 아카이브", "en": "NDBC buoy annual archive"},
        "org": "NOAA NDBC",
        "domain": ["ocean", "buoy"],
        "keywords": {"ko": ["부이과거", "해양관측이력", "파고이력"],
                     "en": ["buoy history", "historical marine"]},
        "spatial": "주로 미국 연안·태평양", "temporal": "관측소별 수십 년 · 연 단위 파일",
        "access": {"method": "https", "url": "https://www.ndbc.noaa.gov/data/historical/stdmet/",
                   "format": "text", "cors": False},
        "license": "usgov-pd",
        "why": {"ko": "미국 부이는 연간 아카이브가 있어 나중에 받아도 된다. "
                      "⚠️ 미국 외(아시아·유럽) 부이는 이런 아카이브가 없다 — OSMC 30일 창이 지나면 "
                      "사라진다. 그래서 그쪽은 실시간으로 우리가 쌓아야 한다.",
                "en": "US buoys have annual archives, so they can be fetched later. "
                      "⚠️ Non-US buoys (Asia, Europe) have no such archive — once OSMC's 30-day "
                      "window passes they are gone. Those we must accumulate ourselves."},
        "usedBy": ["report-5"],
    },

    # ── B등급: 곁에 두고 조회 ─────────────────────────────────
    {
        "id": "era5", "tier": "B",
        "title": {"ko": "ERA5 재분석 (시간별)", "en": "ERA5 reanalysis (hourly)"},
        "org": "Copernicus C3S / ECMWF", "doi": "10.24381/cds.adbb2d47",
        "domain": ["weather", "wind", "temperature", "history"],
        "keywords": {"ko": ["재분석", "과거기상", "그때날씨", "당시기상"],
                     "en": ["reanalysis", "past weather", "conditions at the time"]},
        "spatial": "전지구 0.25° · 37개 고도층", "temporal": "1940~ · 시간별 · 지연 약 5일",
        "access": {"method": "zarr-range-read",
                   "url": "https://storage.googleapis.com/gcp-public-data-arco-era5/ar/"
                          "1959-2022-full_37-1h-0p25deg-chunk-1.zarr-v2/",
                   "format": "zarr", "cors": True, "auth": "none",
                   "note": "ARCO-ERA5 공개 미러 — 키 없이 필요한 조각만 읽는다"},
        "license": "copernicus",
        "why": {"ko": "⚠️ 통째로 받으면 페타바이트급이다. 절대 미러하지 않는다. "
                      "사건이 생기면 그 시각·그 자리 조각만 읽어 사건 레코드에 박는다. "
                      "발화 시점 풍속·습도를 나중에 조인하려면 전부 다시 받아야 하지만, "
                      "발생 시점에 박아두면 공짜다.",
                "en": "⚠️ Petabyte-scale in full — never mirror it. When an event occurs, read only "
                      "that time and place and stamp it into the event record. Joining later means "
                      "refetching everything; stamping at the moment of the event is free."},
        "usedBy": ["report-2", "report-4", "model-3"],
    },
    {
        "id": "imerg", "tier": "B",
        "title": {"ko": "GPM IMERG 강수량", "en": "GPM IMERG precipitation"},
        "org": "NASA GSFC", "doi": "10.5067/GPM/IMERG/3B-HH/07",
        "domain": ["precipitation"],
        "keywords": {"ko": ["강수", "비", "강우", "폭우", "비구름"],
                     "en": ["precipitation", "rain", "rainfall"]},
        "spatial": "전지구 0.1°", "temporal": "2000~ · 30분 간격",
        "access": {"method": "https",
                   "url": "https://gpm1.gesdisc.eosdis.nasa.gov/data/GPM_L3/GPM_3IMERGHH.07/",
                   "tiles": "https://gibs.earthdata.nasa.gov/wmts/epsg3857/best/"
                            "IMERG_Precipitation_Rate/default/{YYYY-MM-DD}/"
                            "GoogleMapsCompatible_Level6/{z}/{y}/{x}.png",
                   "format": "hdf5 / png tiles", "cors": True},
        "license": "usgov-pd",
        "why": {"ko": "태풍이 지위를 잃은 뒤의 비를 재는 유일한 전지구 자료. "
                      "태풍 반경 주변만 잘라 저장하면 용량이 감당된다.",
                "en": "The only global measure of rain after a storm loses tropical status. "
                      "Cropping to the storm's radius keeps the volume manageable."},
        "usedBy": ["report-2"],
    },
    {
        "id": "ghcn-daily", "tier": "B",
        "title": {"ko": "GHCN-Daily 지상관측", "en": "GHCN-Daily surface observations"},
        "org": "NOAA NCEI", "doi": "10.7289/V5D21VHZ",
        "domain": ["temperature", "precipitation", "history"],
        "keywords": {"ko": ["지상관측", "관측소", "기온기록", "일최고기온"],
                     "en": ["station data", "surface observation", "daily max"]},
        "spatial": "전지구 관측소 10만여 곳", "temporal": "19세기~ · 일별",
        "access": {"method": "https", "url": "https://www.ncei.noaa.gov/pub/data/ghcn/daily/",
                   "format": "text/csv", "cors": False},
        "license": "usgov-pd",
        "why": {"ko": "예보 검증의 지상 정답. 격자가 아니라 실제 관측소 값이라 "
                      "우리 예보 스냅샷과 맞춰볼 수 있다.",
                "en": "Ground truth for forecast verification — real station values rather than a "
                      "grid, so our forecast snapshots can be checked against them."},
        "usedBy": ["report-1", "report-6"],
    },

    # ── C등급: 실시간 수집 (이미 가동 중) ─────────────────────
    {
        "id": "open-meteo", "tier": "C",
        "title": {"ko": "Open-Meteo 예보 API", "en": "Open-Meteo forecast API"},
        "org": "Open-Meteo (기반: GFS/ECMWF)",
        "domain": ["forecast", "wind", "temperature"],
        "keywords": {"ko": ["바람", "풍속", "기온", "습도", "날씨", "안개", "시정",
                            "가뭄", "토양수분", "메마름", "건조"],
                     "en": ["wind", "temperature", "humidity", "weather", "fog",
                            "visibility", "drought", "soil moisture"]},
        "spatial": "지점 조회 (우리는 5° 격자 2,376지점)", "temporal": "실시간 + 예보",
        "access": {"method": "https", "url": "https://api.open-meteo.com/v1/forecast",
                   "format": "json", "cors": True,
                   "auth": "무료 비상업: 없음 · 상업: customer-api + apikey",
                   "termsUrl": "https://open-meteo.com/en/terms",
                   "limits": "무료 API는 비상업 전용 · 10,000호출/일"},
        "license": "cc-by-4.0",
        "licenseNote": "자료는 CC BY 4.0. 무료 호스팅 API는 비상업 전용이며, "
                       "구독·광고 앱은 customer-api 유료 키 또는 셀프호스팅이 필요하다.",
        "usedBy": ["report-1", "model-1"],
    },
    {
        "id": "open-meteo-air", "tier": "C",
        "title": {"ko": "Open-Meteo 대기질 (CAMS 기반)", "en": "Open-Meteo Air Quality (CAMS)"},
        "org": "Open-Meteo / Copernicus CAMS",
        "domain": ["air", "dust", "ozone"],
        "keywords": {"ko": ["미세먼지", "초미세먼지", "PM2.5", "PM10", "대기질", "공기질",
                            "황사", "먼지", "모래바람", "오존", "자외선", "자외선지수", "매연", "스모그"],
                     "en": ["air quality", "pm2.5", "pm10", "dust", "sand storm",
                            "ozone", "uv index", "smog", "aqi"]},
        "spatial": "전지구 (우리는 5° 격자 2,376지점)", "temporal": "실시간 · 매시간",
        "access": {"method": "https", "url": "https://air-quality-api.open-meteo.com/v1/air-quality",
                   "ours": "wind/air.json", "format": "json", "cors": True,
                   "auth": "무료 비상업: 없음 · 상업: customer-api + apikey",
                   "termsUrl": "https://open-meteo.com/en/terms"},
        "license": "cc-by-4.0",
        "licenseNote": "Open-Meteo 자료 CC BY 4.0 + 기반 CAMS 조건. 무료 호스팅 API는 "
                       "비상업 전용이며 판매 전 customer-api 또는 셀프호스팅 전환이 필요하다.",
        "why": {"ko": "⚠️ 대기질 지수(AQI)는 나라마다 계산식이 다르다. 같은 공기를 두고 "
                      "유럽과 미국이 다른 숫자를 낸다 — 그래서 둘 다 담고 어느 기준인지 밝힌다. "
                      "⚠️ dust 는 먼지 질량일 뿐, 어디서 왔는지(고비·사하라·공사장)는 들어 있지 않다. "
                      "화면에 '황사'라고 단정하지 않는 이유다.",
                "en": "⚠️ AQI is computed differently by country — the same air yields different "
                      "numbers in Europe and the US, so both are stored and the standard is stated. "
                      "⚠️ dust is a mass concentration; its origin (Gobi, Sahara, a construction site) "
                      "is not in the number. That is why we never label it 'yellow dust' outright."},
        "usedBy": [],
    },
    {
        "id": "open-meteo-marine", "tier": "C",
        "title": {"ko": "Open-Meteo 해양 (파랑모델 기반)", "en": "Open-Meteo Marine"},
        "org": "Open-Meteo",
        "domain": ["ocean", "wave"],
        "keywords": {"ko": ["파고", "파도", "너울", "물결", "해류", "해수면온도", "수온",
                            "서핑", "항해", "파주기"],
                     "en": ["wave height", "swell", "ocean current", "sea surface temperature",
                            "surf", "sailing"]},
        "spatial": "전지구 해상", "temporal": "실시간 · 매시간",
        "access": {"method": "https", "url": "https://marine-api.open-meteo.com/v1/marine",
                   "ours": "ocean/marine.json", "format": "json", "cors": True,
                   "auth": "무료 비상업: 없음 · 상업: customer-api + apikey",
                   "termsUrl": "https://open-meteo.com/en/terms"},
        "license": "cc-by-4.0",
        "licenseNote": "자료는 CC BY 4.0. 무료 호스팅 API는 비상업 전용이며, "
                       "구독·광고 앱은 customer-api 유료 키 또는 셀프호스팅이 필요하다.",
        "why": {"ko": "⚠️ 여기 '해류(current)'는 조류(tide)가 아니다. 조류는 달·태양 인력으로 "
                      "하루 두 번 드나드는 것이고 해류는 바람·밀도차로 흐르는 큰 흐름이다. "
                      "물때표가 필요한 사람에게 이걸 주면 안 된다.",
                "en": "⚠️ 'Current' here is ocean current, not tide. Tides are the twice-daily "
                      "gravitational rise and fall; currents are wind- and density-driven flow. "
                      "This must never be handed to someone who needs a tide table."},
        "usedBy": [],
    },
    {
        "id": "metar-stations", "tier": "C",
        "title": {"ko": "지상 관측소 실황 (METAR)", "en": "Ground station observations (METAR)"},
        "org": "NOAA Aviation Weather Center",
        "domain": ["weather", "station"],
        "keywords": {"ko": ["지상관측소", "관측소", "공항날씨", "실황", "METAR", "기상관측"],
                     "en": ["ground station", "metar", "airport weather", "observation"]},
        "spatial": "전 세계 공항 약 1,900곳 (실측)", "temporal": "실시간 · 지점마다 30~60분",
        "access": {"method": "https", "url": "https://aviationweather.gov/api/data/metar",
                   "ours": "wind/stations.json", "format": "json", "cors": False,
                   "note": "⚠️ 한 요청 400건 상한(실측). 타일로 나눠 받고 상한에 걸린 타일만 쪼갠다."},
        "license": "usgov-pd",
        "why": {"ko": "예보가 아니라 **실제로 설치된 계기의 값**이다. 그래서 예보 검증의 "
                      "지상 정답으로 쓸 수 있다. 해양부이의 육지판이다.",
                "en": "Not a forecast — **readings from instruments physically installed** at "
                      "airports. That makes it ground truth for forecast verification: the land "
                      "counterpart to the ocean buoys."},
        "usedBy": ["report-1"],
    },
    {
        "id": "wikimedia-commons", "tier": "C",
        "title": {"ko": "Wikimedia Commons 지리 사진", "en": "Wikimedia Commons geotagged photos"},
        "org": "Wikimedia Foundation",
        "domain": ["photo"],
        "keywords": {"ko": ["사진", "이미지"], "en": ["photo", "image", "picture"]},
        "spatial": "전지구", "temporal": "상시",
        "access": {"method": "https", "url": "https://commons.wikimedia.org/w/api.php",
                   "format": "json", "cors": True},
        "license": "wikimedia-per-item",
        "licenseNote": "자유 이용 파일만 조회하고, 저작자·라이선스명·원본 파일 페이지를 파일별로 표시한다. 조건을 확인하지 못하면 사진을 쓰지 않는다.",
        "why": {"ko": "⚠️ 좌표 반경 안에서 찍힌 사진이지 '그 대상을 찍은 사진'이 아니다. "
                      "실측: 인천공항 좌표로 찾으면 「The Bookstore」 같은 무관한 것도 온다. "
                      "화면에 '이 근처에서 찍힌 사진'이라고 쓰고 저작자·라이선스를 반드시 붙인다.",
                "en": "⚠️ These are photos taken *near* a coordinate, not photos *of* the subject. "
                      "Measured: searching Incheon Airport's coordinate also returns things like "
                      "'The Bookstore'. Label them as taken nearby and always show author and licence."},
        "usedBy": [],
    },
    {
        "id": "usgs-quakes", "tier": "C",
        "title": {"ko": "USGS 지진 피드", "en": "USGS earthquake feed"},
        "org": "USGS",
        "domain": ["quake"],
        "keywords": {"ko": ["지진", "규모", "진도", "여진", "진앙"],
                     "en": ["earthquake", "quake", "magnitude", "aftershock"]},
        "spatial": "전지구", "temporal": "실시간 + 과거 카탈로그 전체 공개",
        "access": {"method": "https",
                   "url": "https://earthquake.usgs.gov/earthquakes/feed/v1.0/summary/all_day.geojson",
                   "archive": "https://earthquake.usgs.gov/fdsnws/event/1/",
                   "format": "geojson", "cors": True},
        "license": "usgov-pd",
        "why": {"ko": "과거 전체가 공개돼 있어 지금 안 쌓아도 나중에 받을 수 있다. "
                      "실시간 수집은 '우리가 그때 무엇을 보여줬나'를 남기기 위한 것이다.",
                "en": "The full history is public, so it can be fetched later. We collect live only "
                      "to record what we ourselves showed at the time."},
        "usedBy": ["report-5"],
    },
    {
        "id": "gdacs", "tier": "C",
        "title": {"ko": "GDACS 전지구 재해경보", "en": "GDACS global disaster alerts"},
        "org": "EU JRC + UN OCHA",
        "domain": ["cyclone", "quake", "flood"],
        "keywords": {"ko": ["재해", "경보", "태풍", "홍수"],
                     "en": ["disaster", "alert", "cyclone", "flood"]},
        "spatial": "전지구", "temporal": "실시간",
        "access": {"method": "https",
                   "url": "https://www.gdacs.org/gdacsapi/api/events/geteventlist/EVENTS4APP",
                   "geometry": "https://www.gdacs.org/gdacsapi/api/polygons/getgeometry"
                               "?eventtype=TC&eventid={id}&episodeid={ep}",
                   "format": "geojson", "cors": True},
        "license": "cc-by-4.0",
        "licenseNote": "Global Disaster Awareness and Coordination System, GDACS로 출처를 표시한다. 이벤트 API 자료는 European Union CC BY 4.0으로 재사용할 수 있다.",
        "termsUrl": "https://www.gdacs.org/Documents/2025/GDACS_Terms_of_use_Oct_25.pdf",
        "why": {"ko": "⚠️ 지위를 잃은 태풍을 목록에서 통째로 뺀다 (실측: NOUL 소멸 후 완전 제거). "
                      "그래서 살아있는 동안 경로를 받아 우리가 보관한다. "
                      "⚠️ 경로선에 예보 구간이 섞여 있고, 구간 번호는 시간 순서가 아니다 — "
                      "끝점-시작점으로 이어야 한다 (실측으로 확인).",
                "en": "⚠️ Drops storms entirely once they lose status (measured: NOUL vanished). "
                      "So we capture the track while it is alive. ⚠️ The track line mixes in the "
                      "forecast leg, and segment numbering is not chronological — chain by "
                      "matching endpoints (measured)."},
        "warning": {"ko": "GDACS 통보와 영향 추정은 자동 모델 산출물이며 인적 검토 전에 발행될 수 있다. 지역·국가 당국의 공식 경보를 대체하지 않는다.",
                    "en": "GDACS notifications and impact estimates are automated model outputs and may be issued before human review. They do not replace official alerts from local or national authorities."},
        "usedBy": ["report-2"],
    },
    {
        "id": "nasa-firms", "tier": "C",
        "title": {"ko": "NASA FIRMS 활성 화재", "en": "NASA FIRMS active fire"},
        "org": "NASA", "domain": ["wildfire"],
        "keywords": {"ko": ["산불", "화재감지", "열점", "FRP"],
                     "en": ["active fire", "hotspot", "frp"]},
        "spatial": "전지구 375m/1km", "temporal": "준실시간 (3시간 내)",
        "access": {"method": "https", "url": "https://firms.modaps.eosdis.nasa.gov/",
                   "format": "csv", "cors": False,
                   "note": "⚠️ 응답 불안정 관측됨 (타임아웃). 결측 원장에 기록할 것."},
        "license": "usgov-pd",
        "usedBy": ["report-4", "report-5"],
    },
    {
        "id": "nasa-gibs", "tier": "C",
        "title": {"ko": "NASA GIBS 위성 영상 타일", "en": "NASA GIBS imagery tiles"},
        "org": "NASA EOSDIS", "domain": ["imagery"],
        "keywords": {"ko": ["위성사진", "위성영상", "트루컬러", "연기"],
                     "en": ["satellite imagery", "true color", "smoke"]},
        "spatial": "전지구", "temporal": "일별 · 당일치는 부분 처리",
        "access": {"method": "wmts",
                   "url": "https://gibs.earthdata.nasa.gov/wmts/epsg3857/best/"
                          "{layer}/default/{YYYY-MM-DD}/{tms}/{z}/{y}/{x}.{ext}",
                   "format": "jpg/png tiles", "cors": True},
        "license": "usgov-pd",
        "why": {"ko": "⚠️ 당일치를 그대로 쓰면 안 된다 (실측: 07-26 VIIRS 36.7% 결측). "
                      "⚠️ 파일 크기로는 결측을 알 수 없다 — 36% 비어도 20KB 로 온다. "
                      "화소를 직접 세야 한다. MODIS Terra 는 관측폭이 좁아 완전한 날에도 "
                      "적도에 틈이 남는다 (Terra 5.0% vs VIIRS 0.1%, 같은 타일 실측).",
                "en": "⚠️ Never use same-day imagery as-is (measured: 36.7% missing for VIIRS on "
                      "07-26). ⚠️ File size cannot reveal gaps — a 36%-empty tile still arrives at "
                      "20 KB; count pixels. MODIS Terra's narrow swath leaves equatorial gaps even "
                      "on a complete day (Terra 5.0% vs VIIRS 0.1%, same tile, measured)."},
        "usedBy": ["report-5"],
    },
    {
        "id": "ndbc-osmc", "tier": "C",
        "title": {"ko": "해양 부이 실시간 (NDBC + OSMC/GTS)", "en": "Live marine buoys (NDBC + OSMC/GTS)"},
        "org": "NOAA", "domain": ["ocean", "buoy"],
        "keywords": {"ko": ["부이", "해양관측", "부표", "해양부이"],
                     "en": ["buoy", "wave height", "sea state", "marine observation"]},
        "spatial": "전지구 (밀도는 지역별로 크게 다름)", "temporal": "실시간 · OSMC 는 30일 창",
        "access": {"method": "https", "url": "https://www.ndbc.noaa.gov/data/latest_obs/",
                   "osmc": "https://osmc.noaa.gov/erddap/tabledap/OSMC_30day",
                   "format": "text/csv", "cors": False,
                   "note": "⚠️ CORS 없음 → 서버 경유 필수. station_table 은 소문자 ID, "
                           "OSMC 는 대문자 (실측: 대소문자 불일치로 1,505개 중 17개만 매칭됐던 적 있음)"},
        "license": "usgov-pd",
        "why": {"ko": "⚠️ 미국 외 부이는 연간 아카이브가 없다. OSMC 30일 창이 지나면 사라진다 — "
                      "아시아·유럽 관측은 우리가 안 쌓으면 복구 불가.",
                "en": "⚠️ Non-US buoys have no annual archive. Once OSMC's 30-day window passes the "
                      "data is gone — Asian and European observations are unrecoverable unless we keep them."},
        "usedBy": ["report-3", "report-5"],
    },
    {
        "id": "noaa-swpc", "tier": "C",
        "title": {"ko": "NOAA SWPC 우주기상", "en": "NOAA SWPC space weather"},
        "org": "NOAA SWPC", "domain": ["solar", "aurora"],
        "keywords": {"ko": ["오로라", "태양", "지자기", "Kp", "태양폭풍"],
                     "en": ["aurora", "solar", "geomagnetic", "kp index"]},
        "spatial": "전지구", "temporal": "실시간 1분",
        "access": {"method": "https",
                   "url": "https://services.swpc.noaa.gov/json/planetary_k_index_1m.json",
                   "format": "json", "cors": True},
        "license": "usgov-pd",
        "usedBy": [],
    },
    {
        "id": "gdelt", "tier": "C",
        "title": {"ko": "GDELT 전지구 사건 뉴스", "en": "GDELT global event news"},
        "org": "The GDELT Project", "domain": ["news"],
        "keywords": {"ko": ["뉴스", "사건", "보도"], "en": ["news", "event", "media"]},
        "spatial": "전지구", "temporal": "15분 간격",
        "access": {"method": "https",
                   "url": "http://data.gdeltproject.org/gdeltv2/lastupdate.txt",
                   "format": "csv.zip/gkg.csv.zip", "cors": False,
                   "termsUrl": "https://www.gdeltproject.org/about.html#termsofuse"},
        "license": "gdelt-open",
        "licenseNote": "이용·재배포 시 GDELT Project를 인용하고 https://www.gdeltproject.org/ 링크를 표시한다. 연결된 기사 본문의 저작권은 각 매체에 남는다.",
        "why": {"ko": "⚠️ 기사 본문은 저작권 대상이라 절대 저장하지 않는다. "
                      "링크·시각·제목과 거기서 뽑은 수치만 남긴다.",
                "en": "⚠️ Article bodies are copyrighted and are never stored. Only links, "
                      "timestamps, headlines and extracted figures are kept."},
        "usedBy": ["report-4"],
    },
    {
        "id": "adsb-lol", "tier": "C",
        "title": {"ko": "adsb.lol 항공기 항적", "en": "adsb.lol aircraft tracks"},
        "org": "adsb.lol community", "domain": ["aviation"],
        "keywords": {"ko": ["비행기", "항공기", "항적", "항공편"],
                     "en": ["aircraft", "flight", "adsb"]},
        "spatial": "전지구 (수신기 분포에 따름)", "temporal": "실시간",
        "access": {"method": "https", "url": "https://api.adsb.lol/", "format": "json",
                   "cors": True,
                   "note": "⚠️ 현재 우리 프록시가 403 — 조직 정책 차단. 미해결."},
        "license": "odbl",
        "why": {"ko": "⚠️ 이 자료만 라이선스가 다르다. 파생 DB 를 공개 배포하면 동일조건 의무가 "
                      "전체에 걸린다. 학습셋·공개 아카이브에서 반드시 분리할 것.",
                "en": "⚠️ The one source with a different licence. Publicly distributing a derived "
                      "database triggers share-alike across it. Keep it separated from any training "
                      "set or public archive."},
        "usedBy": [],
    },
    {
        "id": "nasa-eclipse", "tier": "C",
        "title": {"ko": "NASA GSFC 일식 경로표", "en": "NASA GSFC eclipse path tables"},
        "org": "NASA GSFC (F. Espenak)", "domain": ["astronomy"],
        "keywords": {"ko": ["일식", "개기일식", "금환식", "개기대"],
                     "en": ["eclipse", "totality", "annular"]},
        "spatial": "전지구", "temporal": "5천년 규모",
        "access": {"method": "https",
                   "url": "https://eclipse.gsfc.nasa.gov/SEpath/SEpath2001/{slug}path.html",
                   "format": "html table", "cors": False,
                   "note": "120초 간격 북/남 한계선 + 중심선. 도-십진분 표기(십진도 아님)"},
        "license": "usgov-pd",
        "usedBy": [],
    },
    {
        "id": "nws-tsunami", "tier": "C",
        "title": {"ko": "NWS 쓰나미 경보", "en": "NWS tsunami alerts"},
        "org": "NOAA NWS", "domain": ["tsunami"],
        "keywords": {"ko": ["쓰나미", "지진해일", "해일경보"], "en": ["tsunami", "warning"]},
        "spatial": "미국 + 태평양", "temporal": "실시간",
        "access": {"method": "https", "url": "https://api.weather.gov/alerts/active", "format": "geojson",
                   "cors": True},
        "license": "usgov-pd",
        "usedBy": [],
    },
    {
        "id": "celestrak", "tier": "C",
        "title": {"ko": "CelesTrak 위성 궤도요소", "en": "CelesTrak orbital elements"},
        "org": "CelesTrak", "domain": ["space"],
        "keywords": {"ko": ["위성", "궤도", "ISS", "우주정거장"],
                     "en": ["satellite", "orbit", "tle", "iss"]},
        "spatial": "지구궤도", "temporal": "일 단위 갱신",
        "access": {"method": "https",
                   "url": "https://celestrak.org/NORAD/elements/gp.php?GROUP=active&FORMAT=json",
                   "satcatUrl": "https://celestrak.org/satcat/records.php?GROUP=active&FORMAT=json",
                   "ours": "celestrak/catalog.json.gz", "format": "omm-json+satcat-json",
                   "cors": True, "cache": "하루 1회",
                   "termsUrl": "https://celestrak.org/usage-policy.php",
                   "note": "공식 정책보다 드물게 하루 1회만 받고 캐시한다. HTTP 200이 아니면 "
                           "즉시 중단하며 브라우저 사용자가 원본을 반복 호출하지 않는다."},
        "license": "unverified",
        "licenseNote": "CelesTrak은 데이터를 무료 공개하지만 별도 재배포 라이선스는 찾지 못했다. "
                       "사용정책(갱신당 1회·오류 시 즉시 중단)은 확인·준수하며, 재배포 권리 범위는 추가 확인 필요.",
        "usedBy": [],
    },
    {
        "id": "gmgsi-clouds", "tier": "C",
        "title": {"ko": "NOAA GMGSI 전지구 구름 합성", "en": "NOAA GMGSI global cloud composite"},
        "org": "NOAA", "domain": ["clouds"],
        "keywords": {"ko": ["구름", "운량", "구름사진"], "en": ["cloud", "cloud cover"]},
        "spatial": "전지구", "temporal": "시간별",
        "access": {"method": "https", "url": "https://www.ncei.noaa.gov/products/"
                                             "global-mosaic-geostationary-satellite-imagery",
                   "format": "netcdf", "cors": False,
                   "note": "⚠️ 메르카토르 격자다(정방형 아님). 그대로 붙이면 한국 위도에서 "
                           "1,124km 어긋난다 — 파일의 위도 배열로 재투영할 것 (실측 확인)"},
        "license": "usgov-pd",
        "usedBy": [],
    },
]


def main():
    out = []
    for d in DATASETS:
        rec = dict(d)
        lic_key = rec.pop("license", "unverified")
        rec["license"] = {"own": {"id": "earthus-own",
                                  "ko": "우리가 만든 자료 — 공개 조건은 우리가 정한다",
                                  "en": "Produced by us — release terms are ours to set",
                                  "status": "verified"}}.get(lic_key) or LIC.get(lic_key) or LIC["unverified"]
        official_citation = rec.pop("officialCitation", None)
        if official_citation:
            rec["citation"] = official_citation
            rec["citationSource"] = "Smithsonian GVP official database citation"
        elif "doi" in rec:
            print(f"▸ DOI 조회 {rec['id']}")
            cit = csl_citation(rec["doi"])
            if cit:
                rec["citation"] = cit
                rec["citationSource"] = "doi.org (Citation Style Language metadata)"
            else:
                rec["citation"] = None
                rec["citationSource"] = "조회 실패 — 인용 전 직접 확인할 것"
        out.append(rec)

    doc = {
        "schema": 1,
        "generated": datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:00Z"),
        "note": {
            "ko": "earthus 가 쓰는 자료의 목록이다. 사람(보고서 '자료와 방법'), "
                  "파이프라인(access 로 실제 수집), 챗 라우터(keywords 로 질문 연결)가 "
                  "모두 이 파일 하나를 쓴다. "
                  "인용문은 doi.org 서지정보에서 생성하며, GVP처럼 DOI 메타데이터가 "
                  "현재 판과 다를 때는 기관이 직접 제시한 인용문을 쓴다. "
                  "라이선스가 'UNVERIFIED' 인 항목은 공개 배포 전에 반드시 확인해야 한다. "
                  "'WIKIMEDIA-PER-FILE' 은 파일별 조건을 각각 표시해야 한다.",
            "en": "The list of sources earthus uses. One file serves humans (the report's Data and "
                  "Methods section), pipelines (fetching via access), and the chat router (matching "
                  "questions via keywords). Citations use doi.org metadata, except when an agency's "
                  "current official citation supersedes stale DOI metadata. Entries marked 'UNVERIFIED' must be checked before any public "
                  "redistribution. 'WIKIMEDIA-PER-FILE' requires displaying each file's own terms.",
        },
        "tiers": TIERS,
        "counts": {},
        "datasets": out,
    }
    for d in out:
        doc["counts"][d["tier"]] = doc["counts"].get(d["tier"], 0) + 1

    os.makedirs(os.path.dirname(os.path.abspath(OUT)), exist_ok=True)
    with open(OUT, "w", encoding="utf-8") as f:
        json.dump(doc, f, ensure_ascii=False, indent=1)
    size = os.path.getsize(OUT)
    print(f"\n✅ {os.path.abspath(OUT)}  {size/1024:.0f}KB")
    print(f"   자료 {len(out)}개  등급별 {doc['counts']}")
    attention = [d["id"] for d in out if d["license"]["status"] != "verified"]
    print(f"   ⚠️ 라이선스 개별 조건/확인 필요 {len(attention)}개: {', '.join(attention)}")
    cited = [d["id"] for d in out if d.get("citation")]
    print(f"   인용문 생성됨 {len(cited)}개")
    return 0


if __name__ == "__main__":
    sys.exit(main())
