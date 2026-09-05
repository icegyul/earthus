"""한국 해상 관측 — 부이·등표·조위관측소 실황

왜 이게 특별한가
  우리 바다 자료는 지금까지 전부 **모델 격자**다 (Open-Meteo Marine, NOAA OISST).
  이건 실제로 바다에 떠 있는 장비가 10분마다 재는 값이다.
  파고·파주기·파향은 모델과 실측이 자주 어긋나는 항목이라, 나란히 놓으면
  "모델이 오늘 이 해역을 얼마나 맞췄나"를 그대로 보여줄 수 있다.

⚠️ 도움말의 항목 번호 순서와 **실제 열 순서가 다르다**.
   sea_obs 는 도움말이 TP, STN_ID, STN_KO, TM, WH... 라고 적어두었지만
   실제 자료는 TP, TM, STN_ID, STN_KO, LON, LAT, WH... 다.
   주석의 자[尺] 줄(맨 아래 두 줄)이 진짜다. 평년값에서도 같은 함정이 있었다.

⚠️ 결측이 -99 / -99.0 / -999 로 섞여 온다.
   파고 -99.0 을 그대로 그리면 바다가 아래로 99m 꺼진다.

두 곳을 합친다
  sea_obs   : 모든 종류(부이/등표/조위/파랑계) + **위경도** + 해수면온도
  kma_buoy  : 부이만, 대신 파고 3종(최대/유의/평균) + 파주기 + 파향
  좌표는 sea_obs 에만 있으므로 이쪽이 기준이고, kma_buoy 는 붙이는 쪽이다.

출력
  s3://<CACHE_BUCKET>/ocean/kma-buoy.json
"""

import json
import os
import urllib.error
import urllib.parse
import urllib.request
from datetime import datetime, timezone

import boto3

import kma_hub   # KMA 허브 호출 회계(PHASE 1) — aws/_shared/kma_hub.py, 배포 스크립트가 같이 담는다

BUCKET = os.environ["CACHE_BUCKET"]
REGION = os.environ.get("CACHE_REGION") or os.environ.get("AWS_REGION")
KEY = os.environ.get("KMA_HUB_KEY", "").strip()

BASE = "https://apihub.kma.go.kr/api/typ01/url/"
UA = {"User-Agent": "earthus/0.1 (+globe app)"}
DST = "ocean/kma-buoy.json"

# 관측 종류. 화면에서 아이콘을 나누려면 필요하다.
KIND = {
    "B": "부이", "C": "파고부이", "D": "표류부이", "L": "등표",
    "N": "조위관측소", "F": "연안방재", "G": "파랑계", "J": "기상선",
}
KIND_EN = {
    "B": "buoy", "C": "wave buoy", "D": "drifting buoy", "L": "lighthouse",
    "N": "tide station", "F": "coastal", "G": "wave gauge", "J": "weather ship",
}

s3 = boto3.client("s3", region_name=REGION)


def get(ep, **p):
    q = urllib.parse.urlencode({**p, "authKey": KEY})
    with kma_hub.track(ep), urllib.request.urlopen(urllib.request.Request(BASE + ep + "?" + q, headers=UA),
                                timeout=60) as r:
        return r.read().decode("euc-kr", "replace")


def num(v):
    try:
        f = float(v)
    except (TypeError, ValueError):
        return None
    # ⚠️ -99 계열은 전부 결측. -98 보다 작으면 실제 값일 수 없다
    #    (기온 -98°C, 파고 -99m 인 바다는 없다).
    return None if f <= -98 else f


def validated_wave_height(v):
    """API 문서 단위는 m다. 30m를 넘는 유의파고는 화면 계산에서 격리하되 원값은 남긴다.

    2026-08-12 간절곶 파고부이가 90.0을 반환했다. 같은 시각 파고부이 중앙값은
    0.6m, 다음 최댓값은 2.3m였다. 기계 결측/품질값을 바다 90m로 보여 주면 안 된다.
    APIHub sea_obs에는 MQC가 없으므로 이 항목은 삭제하지 않고 whRaw+qualityFlags로 보존한다.
    """
    value = num(v)
    if value is None:
        return None, None
    if value > 30:
        return None, {"whRaw": value, "qualityFlags": ["wave-height-outlier-over-30m"]}
    return value, None


def rows(txt, sep=None):
    """자료 줄만. sep=',' 면 쉼표, None 이면 공백."""
    out = []
    for line in txt.split("\n"):
        t = line.strip().rstrip("=").strip()
        if not t or t.startswith("#"):
            continue
        f = [x.strip() for x in (t.split(sep) if sep else t.split())]
        if len(f) >= 8:
            out.append(f)
    return out


def sea_obs():
    """전 지점 실황 + 위경도."""
    out = {}
    for f in rows(get("sea_obs.php", tm="", stn="0"), sep=","):
        sid = f[2]
        lon, lat = num(f[4]), num(f[5])
        if lon is None or lat is None:
            continue                                  # 좌표 없는 지점은 지도에 못 찍는다
        wh, wave_quality = validated_wave_height(f[6])
        out[sid] = {
            "id": sid, "name": f[3], "kind": KIND.get(f[0], f[0]),
            "kindEn": KIND_EN.get(f[0], f[0]), "tp": f[0],
            "lon": round(lon, 5), "lat": round(lat, 5), "tm": f[1],
            "wh": wh,                                # 유의파고 m (품질 격리 후)
            "wd": num(f[7]), "ws": num(f[8]), "gust": num(f[9]),
            "tw": num(f[10]),                         # 해수면온도 °C
            "ta": num(f[11]), "pa": num(f[12]), "hm": num(f[13]),
        }
        if wave_quality:
            out[sid].update(wave_quality)
    return out


def buoy_detail():
    """부이의 파랑 상세. 지점마다 **가장 최근 시각**만 남긴다.
    ⚠️ 한 번 부르면 여러 시각(10분 간격)이 섞여 온다 — 마지막 것을 써야 한다."""
    out = {}
    for f in rows(get("kma_buoy.php", tm="", stn="0")):
        sid, tm = f[1], f[0]
        if sid in out and out[sid]["tm"] >= tm:
            continue
        out[sid] = {
            "tm": tm,
            "whMax": num(f[12]), "whSig": num(f[13]), "whAvg": num(f[14]),
            "wp": num(f[15]),                         # 파주기 sec
            "wo": num(f[16]) if len(f) > 16 else None,  # 파향 deg
        }
    return out


@kma_hub.accounted("kma-ocean")
def handler(event, context):
    if not KEY:
        return {"ok": False, "reason": "no-key"}

    try:
        base = sea_obs()
    except urllib.error.HTTPError as e:
        if e.code == 403:
            return {"ok": False, "reason": "not-approved", "api": "sea_obs"}
        raise
    if len(base) < 20:
        raise RuntimeError(f"지점이 너무 적다 ({len(base)}) — 덮어쓰지 않는다")

    # 파랑 상세는 있으면 좋고 없어도 되는 자료다. 실패해도 전체를 버리지 않는다.
    try:
        for sid, d in buoy_detail().items():
            if sid in base:
                base[sid].update({k: v for k, v in d.items() if k != "tm"})
    except Exception as e:                                # noqa: BLE001
        print("[ocean] 파랑 상세 실패 —", repr(e)[:80])

    st = sorted(base.values(), key=lambda x: x["id"])
    wave = sum(1 for x in st if x.get("wh") is not None)
    sst = sum(1 for x in st if x.get("tw") is not None)
    wave_excluded = sum(1 for x in st if "wave-height-outlier-over-30m" in x.get("qualityFlags", []))

    doc = {
        "generated": datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:00Z"),
        "source": "기상청 해양기상관측망 (API허브 sea_obs · kma_buoy)",
        "sourceEn": "KMA marine observation network (API Hub)",
        "license": "공공누리 제1유형 (출처표시)",
        "tz": "KST",
        "note": {
            "ko": "실제 해상 장비의 관측값입니다 — 모델 예측이 아닙니다. "
                  "시각은 한국시(KST)입니다. 파고·파주기는 부이에만 있고, "
                  "조위관측소·등표에는 없습니다.",
            "en": "Direct observations from moored buoys, lighthouses and tide gauges — "
                  "not model output. Times are KST. Wave height and period are buoy-only.",
        },
        "count": len(st),
        "withWave": wave,
        "withSST": sst,
        "quality": {
            "waveExcluded": wave_excluded,
            "rule": "유의파고 >30m는 원값을 whRaw에 보존하고 지도·극값 계산에서 제외",
            "ruleEn": "Significant wave height >30 m is preserved as whRaw and excluded from map/extrema",
        },
        "stations": st,
    }
    body = json.dumps(doc, ensure_ascii=False, separators=(",", ":")).encode()
    s3.put_object(Bucket=BUCKET, Key=DST, Body=body,
                  ContentType="application/json; charset=utf-8",
                  CacheControl="public, max-age=600")
    print(f"[ocean] {len(st)}지점 · 파고 {wave} · 수온 {sst} · {len(body)/1024:.0f}KB")
    return {"ok": True, "stations": len(st), "wave": wave, "sst": sst}
