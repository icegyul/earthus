"""ECMWF 오픈데이터 — AI 모델(AIFS) vs 물리 모델(IFS)

무엇을 위한 것인가
  같은 기관(ECMWF)이 같은 시각에 **두 모델을 나란히 돌린다.**
    · IFS         — 슈퍼컴퓨터 물리 모델 (수십 년 쌓인 그것)
    · AIFS single — 같은 초기장으로 돌린 **AI 모델**
  둘을 다 받아 우리 기상청 관측으로 매일 채점하면 이렇게 말할 수 있다.
    "구글·엔비디아 AI가 슈퍼컴퓨터를 이겼다는데, **한국 날씨에서도 그런가**"
  한국어로 이 질문에 답하는 곳이 없다. 그리고 채점 뼈대는 이미 있다(kma-verify).

  ⚠️ 우리는 예보를 만들지 않는다. **심판이지 선수가 아니다.**
     받은 값을 그대로 저장하고, 나중에 관측과 맞춰 점수만 매긴다.

라이선스 (2026-08-02 확인)
  ECMWF 오픈데이터 = **CC-BY-4.0**. 상업 이용·재배포를 명시적으로 허용한다.
  조건은 출처 표기뿐이다. → 출력 JSON 에 source/license 를 박아 둔다.

⚠️ 왜 파일을 통째로 받지 않나
  한 회차 파일이 IFS 126MB · AIFS 84MB 다. 그런데 ECMWF 는 파일마다
  **.index** 를 같이 준다 — 메시지(변수×스텝)별 byte offset 이 들어 있다.
  필요한 메시지만 Range 요청으로 집어 오면 한 변수당 ~650KB 다.
  ⚠️ 이걸 안 쓰면 Lambda 가 매번 200MB 를 받는다. 절대 그러지 말 것.

⚠️ 왜 eccodes 가 필요한가
  ECMWF GRIB2 는 **CCSDS/AEC 압축**(데이터표현 템플릿 5.42)이다. 실측으로 확인했다.
  단순 패킹이면 순수 파이썬으로 풀 수 있었겠지만 AEC 는 적응형 엔트로피 부호라
  현실적으로 라이브러리가 필요하다. deploy-ecmwf.sh 가 eccodes 만 추려 넣는다
  (전체 303MB → 필요한 것만 50MB. 나머지는 지도작도용이라 안 쓴다).

출력
  s3://<CACHE_BUCKET>/wind/ecmwf-fcst.json      최신 회차 (공개)
  s3://<CACHE_BUCKET>/archive/ecmwf/<run>.json  회차별 보관 (채점용)
  ⚠️ ECMWF 오픈데이터는 2~3일치만 남긴다. 우리가 매 회차 쌓아두지 않으면
     1년 뒤 "그때 AI 가 얼마나 맞았나"를 영영 말할 수 없다.
"""

import json
import os
import urllib.error
import urllib.request
from datetime import datetime, timedelta, timezone

import boto3

BUCKET = os.environ["CACHE_BUCKET"]
REGION = os.environ.get("CACHE_REGION") or os.environ.get("AWS_REGION")

ROOT = "https://data.ecmwf.int/forecasts"
SRC_STATIONS = "wind/kma-aws.json"      # 채점 대상과 같은 지점을 쓴다 (ASOS 97)
DST = "wind/ecmwf-fcst.json"
ARCHIVE = "archive/ecmwf"
UA = {"User-Agent": "earthus/0.1 (+earthus.net)"}
TIMEOUT = 60

# 받을 모델. ⚠️ 이름은 ECMWF 경로 그대로다.
MODELS = {
    "ifs":         {"ko": "ECMWF IFS", "kind": "physics", "kindKo": "물리 모델"},
    "aifs-single": {"ko": "ECMWF AIFS", "kind": "ai", "kindKo": "AI 모델"},
}

# 채점할 변수. ⚠️ 우선 2m 기온 하나만 한다 —
#   기상청 ASOS 가 같은 것을 재고 있어 **사과 대 사과** 비교가 되는 유일한 값이다.
#   강수는 누적 방식·관측 방식이 달라 따로 설계해야 한다(지금 섞으면 엉터리 점수가 나온다).
PARAMS = ["2t"]

# 예보 선행시간(h). ⚠️ 선행시간을 안 나누면 점수가 의미를 잃는다 —
#   "24시간 뒤 예보"와 "120시간 뒤 예보"의 오차는 전혀 다른 이야기다.
STEPS = [24, 48, 72, 96, 120]

# 발표 회차(UTC). 오픈데이터는 발표 후 몇 시간 뒤에 올라온다.
RUN_HOURS = [0, 6, 12, 18]
RUN_DELAY_H = 8          # 이만큼 지난 회차부터 찾는다 (실측상 여유 있게)

s3 = boto3.client("s3", region_name=REGION)


def get(url, rng=None, timeout=TIMEOUT):
    h = dict(UA)
    if rng:
        h["Range"] = f"bytes={rng[0]}-{rng[1]}"
    return urllib.request.urlopen(
        urllib.request.Request(url, headers=h), timeout=timeout).read()


def candidate_runs(now_utc, back=4):
    """최근 회차부터 뒤로. ⚠️ 아직 안 올라온 회차가 있으므로 폴백이 필요하다."""
    out = []
    t = now_utc - timedelta(hours=RUN_DELAY_H)
    for _ in range(back):
        h = max([r for r in RUN_HOURS if r <= t.hour], default=None)
        if h is None:
            t = t.replace(hour=18) - timedelta(days=1)
            h = 18
        out.append((t.strftime("%Y%m%d"), h))
        t = t.replace(hour=h) - timedelta(hours=1)
    return out


def base_url(day, hh, model):
    return f"{ROOT}/{day}/{hh:02d}z/{model}/0p25/oper/{day}{hh:02d}0000"


def read_index(day, hh, model):
    """.index → 메시지 목록. 없으면 빈 리스트(그 회차는 아직 없다)."""
    try:
        raw = get(base_url(day, hh, model) + "-0h-oper-fc.index", timeout=30)
    except Exception:                                        # noqa: BLE001
        return []
    out = []
    for line in raw.decode("utf-8", "replace").splitlines():
        line = line.strip()
        if line:
            try:
                out.append(json.loads(line))
            except ValueError:
                pass
    return out


def fetch_message(day, hh, model, step, param):
    """스텝·변수 하나의 GRIB 메시지만 Range 로 집어 온다."""
    url = base_url(day, hh, model) + f"-{step}h-oper-fc"
    idx = None
    try:
        raw = get(url + ".index", timeout=30)
    except Exception:                                        # noqa: BLE001
        return None
    for line in raw.decode("utf-8", "replace").splitlines():
        if not line.strip():
            continue
        try:
            m = json.loads(line)
        except ValueError:
            continue
        if m.get("param") == param and m.get("levtype") == "sfc":
            idx = m
            break
    if not idx:
        return None
    off, ln = idx["_offset"], idx["_length"]
    try:
        return get(url + ".grib2", rng=(off, off + ln - 1))
    except Exception:                                        # noqa: BLE001
        return None


def values_at(msg_bytes, points):
    """GRIB 메시지에서 지점별 값을 뽑는다.

    ⚠️ 격자 인덱스를 직접 계산하지 않는다. 주사 방향(scanning mode)·경도 원점 같은
       것을 우리가 다시 구현하면 조용히 틀린 자리를 읽는다.
       eccodes 의 find_nearest 는 그 규칙을 GRIB 헤더에서 읽어 처리한다.
    """
    import eccodes
    gid = eccodes.codes_new_from_message(msg_bytes)
    try:
        out = []
        for p in points:
            try:
                near = eccodes.codes_grib_find_nearest(gid, p["lat"], p["lon"])
                out.append(round(float(near[0].value), 3) if near else None)
            except Exception:                                # noqa: BLE001
                out.append(None)
        return out
    finally:
        eccodes.codes_release(gid)


def kelvin_to_c(v):
    """2t 는 켈빈으로 온다. ⚠️ 그대로 저장하면 나중에 반드시 누가 헷갈린다."""
    return None if v is None else round(v - 273.15, 2)


# ══ 태풍 진로 ═══════════════════════════════════════════════════════
# 받은 지적: "유럽 기상청도 예보 될 텐데??"
#   맞다. ECMWF 는 같은 경로에 태풍 진로를 **BUFR** 로 같이 낸다(`-tf.bufr`).
#   실측(2026-08-02 00z): 85KB · 메시지 25개 · 돌핀은 42점 **+246시간**까지.
#   기상청 72h · JMA 120h 보다 훨씬 멀리 본다.
#
# ⚠️⚠️ **번호가 70 이상인 것은 그리면 안 된다.**
#   15W·16W 는 실제 감시 중인 태풍이지만, 70W~83W·70L·71A 같은 것은
#   모델이 "여기서 생길 수도 있다"고 만들어낸 **가상 저기압**이다.
#   실측에서 25개 중 22개가 그것이었다. 이걸 그리면 있지도 않은 태풍을
#   화면에 띄우게 된다 — 우리가 절대 하면 안 되는 일이다.
#   → **이미 기관이 이름을 붙인 태풍만** 남긴다(longStormName 이 있는 것).
#
# ⚠️ BUFR 결측은 None 이 아니라 1e100 이다. 그대로 쓰면 위도 1e100 이 찍힌다.
TC_DIR = "{root}/{day}/{hh:02d}z/ifs/0p25/{stream}/"
TC_MISSING = 1e10
TC_DST = "events/typhoon-ecmwf.json"

# 이 앞까지만 내보낸다.
# ⚠️ 246시간(10일)을 그대로 그리면 기상청 72h·JMA 120h 옆에서 **가장 길고 가장
#    확신에 찬 선**으로 보인다. 단일 모델의 10일 뒤 진로는 그만한 신뢰가 없다.
#    가장 긴 공식 예보(JMA 120h)에 맞춰 자르고, 원래 몇 시간까지 있었는지는 적어 둔다.
TC_CAP_H = 120


def tc_track_file(day, hh, stream="oper"):
    """그 회차의 `-tf.bufr` 주소. ⚠️ 파일명에 붙는 스텝(360h)이 회차마다 다를 수 있어
       디렉터리 목록에서 찾는다 — 이름을 고정하면 조용히 404 가 된다."""
    base = TC_DIR.format(root=ROOT, day=day, hh=hh, stream=stream)
    try:
        html = get(base, timeout=30).decode("utf-8", "replace")
    except Exception:                                        # noqa: BLE001
        return None
    import re
    m = re.findall(r'href="([^"]*-tf\.bufr)"', html)
    if not m:
        return None
    href = m[-1]
    return href if href.startswith("http") else "https://data.ecmwf.int" + href


def tc_tracks(day, hh, stream="oper"):
    """BUFR → [{id, name, steps:[{h,lat,lon}]}]. eccodes 가 없으면 빈 목록."""
    try:
        import eccodes as ec
    except Exception as e:                                   # noqa: BLE001
        print(f"[tc] eccodes 없음 {e!r}")
        return [], None
    url = tc_track_file(day, hh, stream)
    if not url:
        return [], None
    try:
        raw = get(url, timeout=90)
    except Exception as e:                                   # noqa: BLE001
        print(f"[tc] 내려받기 실패 {e!r}")
        return [], None

    import tempfile
    out = []
    with tempfile.NamedTemporaryFile(suffix=".bufr") as f:
        f.write(raw)
        f.flush()
        fh = open(f.name, "rb")
        while True:
            h = ec.codes_bufr_new_from_file(fh)
            if h is None:
                break
            try:
                parser = _one_ensemble_storm if stream == "enfo" else _one_storm
                out.extend(parser(ec, h))
            except Exception as e:                           # noqa: BLE001
                print(f"[tc] 메시지 건너뜀 {e!r}")
            finally:
                ec.codes_release(h)
        fh.close()
    return out, url


def _one_ensemble_storm(ec, h):
    """압축 BUFR 한 메시지 → 이름 붙은 태풍의 멤버별 독립 진로.

    ⚠️ 평균 진로를 만들지 않는다. 각 멤버는 기관이 독립 계산한 결과이고,
       소멸 시각도 다르다. earthus 가 좌표를 평균 내면 새 예보를 만드는 셈이다.
    ⚠️ 압축 BUFR 의 값 하나는 "모든 subset 에 같은 값"이라는 뜻이다.
       첫 분석 위치가 실제로 이 형태라 멤버 수만큼 복제하되, 그 밖의 애매한
       길이는 억지로 맞추지 않고 해당 시각을 버린다.
    """
    ec.codes_set(h, "unpack", 1)

    def ga(k):
        try:
            return list(ec.codes_get_array(h, k))
        except Exception:                                  # noqa: BLE001
            return []

    def one(k):
        a = ga(k)
        return a[0] if a else None

    name = str(one("#1#longStormName") or "").strip()
    sid = str(one("#1#stormIdentifier") or "").strip()
    # ⚠️ 이름 없는 모델 발생 저기압은 화면에 내보내지 않는다.
    if not name or name == sid:
        return []

    n = int(one("numberOfSubsets") or 0)
    member_ids = ga("#1#ensembleMemberNumber")
    member_types = ga("#1#ensembleForecastType")
    if n < 2 or len(member_ids) not in (1, n):
        return []
    if len(member_ids) == 1:
        member_ids = list(range(1, n + 1))
    if len(member_types) == 1:
        member_types *= n
    if len(member_types) != n:
        member_types = [None] * n

    tracks = {int(member_ids[i]): {} for i in range(n)}

    def expanded(a):
        if len(a) == 1:
            return a * n
        return a if len(a) == n else None

    it = ec.codes_bufr_keys_iterator_new(h)
    keys = []
    while ec.codes_bufr_keys_iterator_next(it):
        keys.append(ec.codes_bufr_keys_iterator_get_name(it))
    ec.codes_bufr_keys_iterator_delete(it)

    hour, centre, lat = 0, False, None
    for k in keys:
        b = k.rsplit("#", 1)[-1]
        if b == "timePeriod":
            a = ga(k)
            if a and abs(float(a[0])) < TC_MISSING:
                hour = int(a[0])
        elif b == "meteorologicalAttributeSignificance":
            a = ga(k)
            centre = bool(a) and all(int(x) == 1 for x in a)
        elif b == "latitude" and centre:
            lat = expanded(ga(k))
        elif b == "longitude" and centre:
            lon = expanded(ga(k))
            if lat is not None and lon is not None:
                for i in range(n):
                    la, lo = float(lat[i]), float(lon[i])
                    if abs(la) >= TC_MISSING or abs(lo) >= TC_MISSING:
                        continue
                    tracks[int(member_ids[i])].setdefault(hour, {
                        "h": hour, "lat": round(la, 2),
                        "lon": round(((lo + 180) % 360) - 180, 2),
                    })
            centre = False
            lat = None

    members = []
    for i in range(n):
        mid = int(member_ids[i])
        full = sorted(tracks[mid])
        kept = [tracks[mid][x] for x in full if x <= TC_CAP_H]
        if len(kept) < 2:
            continue
        members.append({
            "member": mid,
            "type": "control" if member_types[i] == 0 else "perturbed",
            "steps": kept,
            "modelHorizonH": full[-1],
            "shownH": kept[-1]["h"],
        })
    if not members:
        return []

    hours = sorted({x["h"] for m in members for x in m["steps"]})
    available = [{"h": hour,
                  "n": sum(any(x["h"] == hour for x in m["steps"])
                           for m in members)} for hour in hours]
    return [{
        "id": sid, "name": name,
        "totalMembers": n,
        "members": members,
        "availableByH": available,
        "modelHorizonH": max(m["modelHorizonH"] for m in members),
        "shownH": max(m["shownH"] for m in members),
    }]


def _one_storm(ec, h):
    ec.codes_set(h, "unpack", 1)

    def g(k):
        try:
            return ec.codes_get(h, k)
        except Exception:                                    # noqa: BLE001
            return None

    name = (g("#1#longStormName") or "").strip()
    sid = (g("#1#stormIdentifier") or "").strip()
    # ⚠️ 이름 없는 것 = 모델이 만들어낸 가상 저기압. 위 주석 참고.
    if not name or name == sid:
        return []

    it = ec.codes_bufr_keys_iterator_new(h)
    keys = []
    while ec.codes_bufr_keys_iterator_next(it):
        keys.append(ec.codes_bufr_keys_iterator_get_name(it))
    ec.codes_bufr_keys_iterator_delete(it)

    steps, hh, sig, lat = {}, 0, None, None
    for k in keys:
        b = k.rsplit("#", 1)[-1]
        if b == "timePeriod":
            v = g(k)
            if v is not None and abs(v) < TC_MISSING:
                hh = int(v)
        elif b == "meteorologicalAttributeSignificance":
            sig = g(k)
        elif b == "latitude" and sig == 1:
            lat = g(k)
        elif b == "longitude" and sig == 1:
            lon = g(k)
            if (lat is not None and lon is not None
                    and abs(lat) < TC_MISSING and abs(lon) < TC_MISSING):
                # ⚠️ 같은 시각이 두 번 나온다(분석 시각). 먼저 온 것을 쓴다.
                steps.setdefault(hh, {
                    "h": hh, "lat": round(lat, 2),
                    "lon": round(((lon + 180) % 360) - 180, 2),
                })
            sig = lat = None

    full = sorted(steps)
    if len(full) < 2:
        return []
    kept = [steps[x] for x in full if x <= TC_CAP_H]
    if len(kept) < 2:
        return []
    return [{"id": sid, "name": name, "steps": kept,
             "modelHorizonH": full[-1], "shownH": kept[-1]["h"]}]


def run_tc(now):
    """태풍 진로만 따로. ⚠️ 기온 채점(아래)과 **엮지 않는다** —
       한쪽이 실패해도 다른 쪽은 나가야 한다. 실제로 회차 조건이 서로 다르다
       (기온은 IFS·AIFS 둘 다 필요하고, 진로는 IFS 하나면 된다)."""
    for day, hh in candidate_runs(now, back=6):
        storms, url = tc_tracks(day, hh, "oper")
        if not storms:
            continue
        ensemble, ensemble_url = tc_tracks(day, hh, "enfo")
        ensemble_by_name = {s["name"].upper(): s for s in ensemble}
        ensemble_by_id = {s["id"].upper(): s for s in ensemble}
        for storm in storms:
            ens = (ensemble_by_name.get(storm["name"].upper())
                   or ensemble_by_id.get(storm["id"].upper()))
            if not ens:
                continue
            # 결정론 진로와 앙상블 원자료를 같은 폭풍 객체에 두되, 평균은 만들지 않는다.
            storm["ensemble"] = {
                "totalMembers": ens["totalMembers"],
                "members": ens["members"],
                "availableByH": ens["availableByH"],
                "modelHorizonH": ens["modelHorizonH"],
                "shownH": ens["shownH"],
            }
        doc = {
            "generated": now.strftime("%Y-%m-%dT%H:%M:00Z"),
            "run": f"{day}{hh:02d}",
            "agency": "ECMWF", "agencyKo": "유럽중기예보센터",
            "model": "IFS (HRES + ENS)",
            "kindKo": "수치모델 예보", "kindEn": "numerical model forecast",
            "source": "ECMWF Open Data — IFS tropical cyclone tracks (BUFR)",
            "license": "CC-BY-4.0 — ECMWF",
            "sourceUrl": url,
            "ensembleSourceUrl": ensemble_url,
            "capH": TC_CAP_H,
            "note": {
                "ko": "유럽중기예보센터(ECMWF)의 물리 모델 IFS 가 낸 태풍 진로입니다. "
                      "⚠️ 기상청·일본 기상청이 내는 **공식 예보(통보문)와는 성격이 다릅니다** — "
                      "이것은 모델이 계산한 결과이고, 사람이 검토해 발표한 예보가 아닙니다. "
                      "앙상블 선은 각 멤버의 독립 계산 결과이며 평균 진로가 아닙니다. "
                      "멤버마다 자료가 있는 시각이 달라 시각별 표시 수가 달라질 수 있습니다. "
                      f"모델은 더 멀리까지 계산하지만 화면에는 {TC_CAP_H}시간까지만 그립니다.",
                "en": "Tropical cyclone tracks from ECMWF's IFS physics model. "
                      "These are raw model output, not an official warning-centre forecast. "
                      "Ensemble lines are independent members, not a mean track.",
            },
            "storms": storms,
        }
        s3.put_object(Bucket=BUCKET, Key=TC_DST,
                      Body=json.dumps(doc, ensure_ascii=False,
                                      separators=(",", ":")).encode(),
                      ContentType="application/json; charset=utf-8",
                      CacheControl="public, max-age=1800")
        names = ", ".join(f"{s['name']}({s['shownH']}h/{s['modelHorizonH']}h, "
                          f"ENS {len((s.get('ensemble') or {}).get('members') or [])})"
                          for s in storms)
        print(f"[tc] 회차 {day}{hh:02d}z · 태풍 {len(storms)} — {names}")
        return {"run": f"{day}{hh:02d}", "storms": len(storms)}
    print("[tc] 쓸 만한 회차 없음")
    return None


def handler(event, context):
    tc = None
    try:
        tc = run_tc(datetime.now(timezone.utc))
    except Exception as e:                                   # noqa: BLE001
        print(f"[tc] 실패 {e!r}")

    # 채점 대상과 같은 지점 (ASOS 97) — 목록을 두 곳에서 관리하지 않는다
    try:
        src = json.loads(s3.get_object(Bucket=BUCKET, Key=SRC_STATIONS)["Body"].read())
        points = [{"id": s.get("id"), "name": s.get("name"),
                   "lat": s["lat"], "lon": s["lon"]}
                  for s in (src.get("stations") or [])
                  if s.get("lat") is not None and s.get("lon") is not None]
    except Exception as e:                                   # noqa: BLE001
        return {"ok": False, "reason": f"stations: {e!r}"[:120], "tc": tc}
    if not points:
        return {"ok": False, "reason": "no-stations", "tc": tc}

    now = datetime.now(timezone.utc)
    run = None
    for day, hh in candidate_runs(now):
        # 두 모델이 **같은 회차**로 있어야 비교가 성립한다. 하나라도 없으면 물러난다.
        if all(read_index(day, hh, m) for m in MODELS):
            run = (day, hh)
            break
    if not run:
        return {"ok": False, "reason": "no-run-available", "tc": tc}
    day, hh = run

    models_out, misses = {}, 0
    for model, meta in MODELS.items():
        steps = {}
        for step in STEPS:
            for param in PARAMS:
                msg = fetch_message(day, hh, model, step, param)
                if not msg:
                    misses += 1
                    continue
                vals = values_at(msg, points)
                if param == "2t":
                    vals = [kelvin_to_c(v) for v in vals]
                steps.setdefault(str(step), {})[param] = vals
        models_out[model] = {**meta, "steps": steps}

    doc = {
        "generated": now.strftime("%Y-%m-%dT%H:%M:00Z"),
        "run": f"{day}{hh:02d}",
        "source": "ECMWF Open Data (IFS · AIFS)",
        "sourceEn": "ECMWF Open Data (IFS · AIFS)",
        "license": "CC-BY-4.0 — ECMWF. 출처 표기 조건으로 상업 이용·재배포 허용",
        "note": {
            "ko": "ECMWF 가 같은 시각에 돌린 물리 모델(IFS)과 AI 모델(AIFS)의 예보입니다. "
                  "값은 각 지점에서 가장 가까운 0.25° 격자점의 2m 기온(°C)이며, "
                  "선행시간(h)별로 나눠 담았습니다. "
                  "⚠️ earthus 는 예보를 만들지 않습니다 — 받은 값을 그대로 저장하고 "
                  "나중에 기상청 관측과 맞춰 채점만 합니다.",
            "en": "Forecasts from ECMWF's physics model (IFS) and AI model (AIFS), "
                  "same initialisation. Values are 2 m temperature (°C) at the nearest "
                  "0.25° grid point, split by lead time in hours.",
        },
        "params": PARAMS,
        "steps": STEPS,
        "unit": {"2t": "°C"},
        "pointCount": len(points),
        "points": points,
        "missedMessages": misses,          # ⚠️ 못 받은 건 세어서 남긴다
        "models": models_out,
    }
    body = json.dumps(doc, ensure_ascii=False, separators=(",", ":")).encode()
    s3.put_object(Bucket=BUCKET, Key=DST, Body=body,
                  ContentType="application/json; charset=utf-8",
                  CacheControl="public, max-age=1800")
    # 회차별 보관 — 나중에 채점하려면 그때의 예보가 남아 있어야 한다
    s3.put_object(Bucket=BUCKET, Key=f"{ARCHIVE}/{day}{hh:02d}.json", Body=body,
                  ContentType="application/json; charset=utf-8")

    print(f"[ecmwf] 회차 {day}{hh:02d}z · 모델 {len(models_out)} · 지점 {len(points)} "
          f"· 누락 {misses} · {len(body)/1024:.0f}KB")
    return {"ok": True, "run": f"{day}{hh:02d}", "points": len(points),
            "missed": misses, "tc": tc}
