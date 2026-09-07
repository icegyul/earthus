"""GDELT 이벤트 + 신뢰도 검증 레이어 (인수인계 §5-2)

문서가 요구한 스코어링 요소를 그대로 구현한다:
  · 다중 소스 교차 검증
  · 소스 가중치
  · 위치+시간 기반 중복 제거
  · 미확정 / 확정 2단계 표시 분리
  · 시간 경과에 따른 감쇠(decay)

⚠️ 문서가 전제한 GDELT GEO API 는 폐지됐다 (실측: 404).
   대신 GDELT 2.0 원본 이벤트 CSV 를 쓴다 — 15분마다 갱신되고 좌표가 96% 붙어 있다.
     http://data.gdeltproject.org/gdeltv2/lastupdate.txt → 최신 파일 주소
   원본이 오히려 낫다: NumSources·NumMentions 가 들어 있어 교차검증 점수를 바로 만든다.

⚠️ DOC API 는 rate limit 이 심하다 (5초에 1회, 실측으로 429 를 여러 번 맞음).
   원본 CSV 는 정적 파일이라 그 제한이 없다.

⚠️ GDELT 는 자동 코딩이라 노이즈가 많다 (문서 §4-5 경고).
   그래서 점수가 낮은 건 "미확정"으로 내려보내고, 앱이 다르게 표시한다.
   노이즈를 확정 이벤트처럼 보여주면 앱 전체의 신뢰가 무너진다.

── 2026-09-07 수정: 확정 등급이 거짓말을 하고 있었다 ──────────────
운영 중인 events/global.json 을 실측해 찾은 결함 셋과, 고친 방법.

  ① 합치기가 교차검증 점수를 **지어냈다**  (가장 심각)
     "같은 대분류 + 60km" 규칙이 런던에서 무관한 기사 15건을 한 덩어리로 묶었다
     (영화 리뷰 · 화장품 · 흉기 사건 · 도로 공사 · 보도자료…).
     합칠 때마다 sources 를 더하고 점수를 +4 씩 올려서
     "매체 15곳이 교차검증한 무력 충돌 90점 확정" 이 나왔다.
     원본 15행의 NumSources 는 **전부 1** 이었다.
     → 같은 EventCode + 같은 FeatureID 만 합치고, 더하기를 없앴다. 90점 → 43점.

  ② 같은 헤드라인이 지구에 여러 개 떴다
     기사 하나가 여러 지역을 언급하면 GDELT 가 지역마다 사건을 만든다.
     표출 150건 중 63건이 남과 제목이 겹쳤다 (확정 11건 중 5건).
     → 기사 단위로 대표 위치 하나만 남기고 나머지는 alsoPlaces 로. 63 → 4건.

  ③ 마커가 기사와 다른 곳에 찍혔다
     "베를린 발전소 화재" 가 모스크바에(1,615km), "Cambridge man…" 이
     짐바브웨 솔즈베리에(8,436km), "Hyderabad 공항" 이 'Mohan Rao' 라는
     **사람 이름**에 찍혀 있었다.
     → GDELT 자기 데이터로 지명 사전을 만들어 제목과 대조하고,
       어긋나면 확정으로 올리지 않는다 (placeDoubt). 지우지는 않는다.

  ④ 애초에 사건이 아닌 글 (리뷰·칼럼·보도자료)은 버린다 (SOFT).

⚠️ ①의 교훈: 우리가 만든 점수는 우리가 검증해야 한다. GDELT 가 틀린 게 아니라
   **우리 합치기가 틀렸다.** 남의 데이터를 탓하기 전에 우리 계산을 먼저 본다.
"""

import csv
import html
import io
import json
import math
import os
import re
import urllib.request
import zipfile
from datetime import datetime, timedelta, timezone
from urllib.parse import urlsplit

import boto3

DST_BUCKET = os.environ["CACHE_BUCKET"]
DST_REGION = os.environ.get("CACHE_REGION") or os.environ.get("AWS_REGION")
LAST = "http://data.gdeltproject.org/gdeltv2/lastupdate.txt"

dst = boto3.client("s3", region_name=DST_REGION)

COLS = (
    "GlobalEventID Day MonthYear Year FractionDate "
    "Actor1Code Actor1Name Actor1CountryCode Actor1KnownGroupCode Actor1EthnicCode "
    "Actor1Religion1Code Actor1Religion2Code Actor1Type1Code Actor1Type2Code Actor1Type3Code "
    "Actor2Code Actor2Name Actor2CountryCode Actor2KnownGroupCode Actor2EthnicCode "
    "Actor2Religion1Code Actor2Religion2Code Actor2Type1Code Actor2Type2Code Actor2Type3Code "
    "IsRootEvent EventCode EventBaseCode EventRootCode QuadClass GoldsteinScale "
    "NumMentions NumSources NumArticles AvgTone "
    "Actor1Geo_Type Actor1Geo_FullName Actor1Geo_CountryCode Actor1Geo_ADM1Code "
    "Actor1Geo_ADM2Code Actor1Geo_Lat Actor1Geo_Long Actor1Geo_FeatureID "
    "Actor2Geo_Type Actor2Geo_FullName Actor2Geo_CountryCode Actor2Geo_ADM1Code "
    "Actor2Geo_ADM2Code Actor2Geo_Lat Actor2Geo_Long Actor2Geo_FeatureID "
    "ActionGeo_Type ActionGeo_FullName ActionGeo_CountryCode ActionGeo_ADM1Code "
    "ActionGeo_ADM2Code ActionGeo_Lat ActionGeo_Long ActionGeo_FeatureID "
    "DATEADDED SOURCEURL"
).split()
IX = {c: i for i, c in enumerate(COLS)}

# CAMEO 이벤트 대분류 → 사람이 읽는 말. 우리가 보여줄 종류만 추린다.
# ⚠️ 전부 보여주면 "회담", "성명 발표" 같은 일상 뉴스가 지구를 덮는다.
#
# ⚠️⚠️ CAMEO 는 "무슨 일이 일어났나"가 아니라 "기사 문장이 어떤 꼴인가"를 코딩한다.
#       그래서 산불 기사의 "firefighters **battle** the blaze" 가 19(FIGHT)로 코딩된다.
#       실제로 프랑스·스페인 대형 산불이 "교전"으로 표시됐다 — 전쟁으로 읽힌다.
#       고칠 것 두 가지를 다 했다:
#         1) 재난 기사를 먼저 걸러 별도 분류로 뺀다 (아래 DISASTER)
#         2) 라벨을 단정적인 군사 용어에서 "보도 분류"에 맞는 말로 바꿨다
#       근본적으로 GDELT 분류는 '검증된 사실'이 아니다. UI 에서도 그렇게 말한다.
ROOT = {
    "14": ("시위·집회", "Protest"),
    "18": ("폭력 사건", "Violent incident"),
    "19": ("무력 충돌", "Armed clash"),
    "20": ("대규모 폭력", "Mass violence"),
    "17": ("강압 조치", "Coercion"),
    "13": ("위협 발언", "Threat"),
    "15": ("무력 시위", "Force posture"),
}

# 자연재난·사고 기사. CAMEO 가 충돌로 오분류하는 대표 사례다.
# ⚠️ 이 목록에 걸리면 충돌 분류를 **덮어쓴다**. 산불을 교전이라 부르지 않기 위해서다.
#    지진·화산·태풍은 우리에게 실제 관측 레이어가 따로 있으므로,
#    여기서는 "관련 보도가 있다"는 신호로만 쓴다.
DISASTER = re.compile(
    r"(wildfire|wild-fire|bushfire|forest[- ]?fire|blaze|brush[- ]?fire|"
    r"incendio|feu[- ]de[- ]for|waldbrand|"
    r"flood|inondation|deluge|landslide|mudslide|avalanche|"
    r"earthquake|seisme|terremoto|volcan|eruption|tsunami|"
    r"hurricane|typhoon|cyclone|tornado|heatwave|heat[- ]wave|drought|"
    r"evacuat|wildland)", re.I)

DISASTER_LABEL = ("재난 보도", "Disaster report")

# 소스 가중치 (§5-2 "소스 가중치").
# ⚠️ 특정 매체를 편들지 않는다. 통신사·공영방송처럼 1차 취재망이 넓은 곳에 가중치를 준다.
#    여기 없는 매체가 틀렸다는 뜻이 아니라, 교차검증 기여도를 다르게 본다는 뜻이다.
WIRE = re.compile(
    r"(reuters|apnews|afp\.com|bloomberg|bbc\.|nytimes|washingtonpost|theguardian|"
    r"aljazeera|kyodonews|nhk\.or\.jp|yonhapnews|xinhuanet|dw\.com|npr\.org|cnn\.com)",
    re.I,
)

# 사건이 아닌 글. CAMEO 는 은유를 그대로 코딩한다 —
# "battle", "fight", "clash", "attack" 이 들어간 리뷰·칼럼·보도자료가 무력 충돌이 된다.
# ⚠️ 실측(2026-09-07): 런던 root19 17행 전부가 이런 것이었다.
#    영화 리뷰·인터뷰·화장품 기사·시에라리온 독립 역사·보도자료가 섞여 있었다.
# ⚠️ 분류를 바꾸지 않고 **버린다**. 재분류할 근거가 없기 때문이다 —
#    이건 잘못 코딩된 사건이 아니라 애초에 사건이 아니다.
SOFT = re.compile(
    r"/(review|reviews|recipe|recipes|horoscope|astrolog|beauty|fashion|style|"
    r"shopping|deals|discount|coupon|gift-guide|best-|top-\d|things-to-do|"
    r"celebrit|gossip|royal|entertainment|showbiz|culture/|lifestyle|travel-guide|"
    r"obituar|archives-|opinion|editorial|column|podcast|quiz|puzzle|crossword|"
    r"press-release|news-releases|"
    r"transfer-news|match-report|fixtures|highlights|box-score|standings)", re.I)
# 보도자료 배포망. 기사가 아니라 기업이 낸 홍보물이다.
SOFT_HOST = re.compile(
    r"(prnewswire|businesswire|globenewswire|einpresswire|marketscreener|"
    r"seekingalpha|benzinga|zacks)", re.I)

WINDOW_HOURS = 3        # 몇 시간치를 모을지 (교차검증이 쌓이려면 창이 필요하다)
CONFIRM_SCORE = 60      # 이 이상이면 "확정", 미만은 "미확정"
MAX_EVENTS = 150
MIN_SCORE = 25          # 이 아래는 아예 내보내지 않는다 (노이즈)
# ⚠️ 화면에 내보내는 최대 건수. **뉴스가 많은 날에는 MIN_SCORE 가 아니라 이 값이
#    실제 하한선을 정한다** (실측 2026-08-02: 중복제거 303건 → 150건으로 잘렸고,
#    잘린 지점의 점수는 25 가 아니라 34 였다). rules.effectiveMinScore 참고.
# ⚠️⚠️ 합치기 규칙 (2026-09-07 고침) — 여기가 가장 큰 결함이 있던 자리다.
#
# 옛 규칙: "같은 대분류 + 60km 안" 이면 같은 사건.
#   런던처럼 기사가 몰리는 도시에서 **서로 무관한 기사들이 한 덩어리가 됐다**.
#   실측: 영화 리뷰 · 화장품 기사 · 흉기 사건 · 도로 폐쇄 · 보도자료 15건이
#   하나로 합쳐졌고, 합칠 때마다 sources 를 더하고 점수를 +4 씩 올린 결과
#   "매체 15곳이 교차검증한 무력 충돌 90점 확정" 이 됐다.
#   원본 15행의 NumSources 는 **전부 1** 이었다. 교차검증 점수를 우리가 지어낸 것이다.
#
# 새 규칙: 같은 대분류 + **같은 EventCode** + **같은 지점(FeatureID)**.
#   FeatureID 는 GDELT 가 붙인 장소 식별자다. 이게 같으면 같은 지점을 말한 것이다.
#   비어 있을 때만 거리로 대신 판정하고, 그 거리도 60km → 25km 로 좁힌다.
# ⚠️ 그리고 **sources 를 절대 더하지 않는다.** 교차검증은 아래 두 값 중 큰 쪽이다:
#     · GDELT 가 센 NumSources (그 자체가 이미 교차검증 수다)
#     · 합쳐진 기사들의 **서로 다른 도메인 수**
#   더하기를 최대값으로 바꾼 것만으로 위의 90점이 43점으로 내려간다(실측).
DEDUP_KM = 25           # FeatureID 가 없을 때만 쓰는 대체 판정 거리
FAR_KM = 600            # 제목 속 지명이 마커에서 이만큼 멀면 위치가 의심스럽다


def latest_export_url():
    txt = urllib.request.urlopen(LAST, timeout=30).read().decode()
    for line in txt.splitlines():
        parts = line.split()
        if len(parts) >= 3 and parts[2].endswith("export.CSV.zip"):
            return parts[2]
    raise RuntimeError("lastupdate.txt 에서 export 파일을 못 찾음")


def recent_export_urls(latest_url, hours=WINDOW_HOURS):
    """최근 몇 시간치 파일 주소들.

    ⚠️ 한 파일은 15분치라 그 안에서는 교차검증이 성립하지 않는다.
       실측: 단일 파일에서는 소스 1~2개가 대부분이고 확정 등급이 하나도 안 나왔다.
       같은 사건이 여러 매체에 퍼지는 데 시간이 걸리므로 창을 넓혀야 한다.
       파일명이 YYYYMMDDHHMMSS 라 15분씩 거슬러 올라가면 된다."""
    base = latest_url.rsplit("/", 1)[0]
    stamp = re.search(r"/(\d{14})\.export", latest_url).group(1)
    t = datetime.strptime(stamp, "%Y%m%d%H%M%S")
    urls = []
    for i in range(int(hours * 4)):          # 15분 간격
        u = f"{base}/{(t - timedelta(minutes=15 * i)):%Y%m%d%H%M%S}.export.CSV.zip"
        urls.append(u)
    return urls


def fetch_events(url):
    blob = urllib.request.urlopen(url, timeout=60).read()
    with zipfile.ZipFile(io.BytesIO(blob)) as z:
        name = z.namelist()[0]
        text = z.read(name).decode("utf-8", "replace")
    return list(csv.reader(io.StringIO(text), delimiter="\t"))


def km_between(a_lat, a_lon, b_lat, b_lon):
    """대략적인 거리. 중복 판정용이라 정밀도는 이 정도면 충분하다."""
    dy = (a_lat - b_lat) * 111.0
    dx = (a_lon - b_lon) * 111.0 * math.cos(math.radians((a_lat + b_lat) / 2))
    return math.hypot(dx, dy)


def domain_of(u):
    """매체 도메인. 교차검증은 '서로 다른 매체인가'로 세야 한다."""
    try:
        return (urlsplit(u).netloc or "").lower().replace("www.", "")
    except Exception:                                        # noqa: BLE001
        return ""


def score(n_src, n_men, wire, geo_type, age_min):
    """신뢰도 0~100. 문서 §5-2 의 요소를 각각 점수로 옮긴 것.

    ⚠️ 2026-09-07: 인자를 행(row)이 아니라 값으로 받게 바꿨다.
       합치기가 끝난 뒤 **다시 채점**해야 하기 때문이다. 예전에는 합치면서
       점수를 +4 씩 더했는데, 그건 근거 없는 가산이었다 (머리말 참고)."""
    # ① 다중 소스 교차 검증 — 여러 매체가 독립적으로 다뤘는가 (가장 큰 비중)
    s_cross = min(45, n_src * 9)

    # ② 언급량 — 같은 사건이 반복 보도되는가. 로그로 눌러 과대평가를 막는다.
    s_vol = min(20, 7 * math.log10(max(n_men, 1) + 1) * 2)

    # ③ 소스 가중치 — 1차 취재망이 넓은 매체가 실었는가
    s_wire = 15 if wire else 0

    # ④ 좌표 정밀도 — GDELT Geo_Type 1=국가 … 4=도시. 정밀할수록 신뢰
    s_geo = {"1": 2, "2": 6, "3": 9, "4": 12, "5": 12}.get(geo_type, 0)

    # ⑤ 시간 감쇠 — 오래된 사건은 "지금 벌어지는 일"이 아니다
    decay = max(0.0, 1.0 - age_min / (24 * 60))     # 24시간에 걸쳐 0 으로
    base = (s_cross + s_vol + s_wire + s_geo) * (0.55 + 0.45 * decay)
    return max(0, min(100, round(base)))


# 지명 사전과 대조해 "제목이 다른 곳을 말하고 있는지" 본다.
# ⚠️ 반대 방향(제목에 마커 도시가 나오나)으로 먼저 만들었다가 버렸다 —
#    헤드라인은 도시를 안 쓰는 일이 흔해서 정상 사건이 대량 탈락했다
#    (실측: 확정 8건 중 5건). 진짜 오류는 '안 쓴 것'이 아니라 '다른 곳을 쓴 것'이다.
# ⚠️ 짧은 이름(5자 미만)과 일반 명사와 겹치는 이름은 뺀다. 안 그러면
#    'Nice'(프랑스) 같은 것이 형용사에 걸린다.
GAZ_STOP = {
    "united states", "america", "european union", "washington", "national",
    "general", "central", "united kingdom", "republic", "island", "islands",
    "north", "south", "west bank", "eastern", "western", "northern", "southern",
}


def build_gazetteer(rows):
    """GDELT 자기 데이터로 지명 사전을 만든다. 외부 의존이 없다."""
    gaz = {}
    for r in rows:
        if len(r) < len(COLS):
            continue
        for pre in ("Action", "Actor1", "Actor2"):
            if r[IX[pre + "Geo_Type"]] not in ("2", "3", "4", "5"):
                continue          # 나라(1)는 너무 넓어 검사에 못 쓴다
            full = r[IX[pre + "Geo_FullName"]] or ""
            la, lo = r[IX[pre + "Geo_Lat"]], r[IX[pre + "Geo_Long"]]
            if not full or not la or not lo:
                continue
            name = re.sub(r"\(general\)", "", full.split(",")[0]).strip().lower()
            if len(name) < 5 or name in GAZ_STOP:
                continue
            try:
                gaz.setdefault(name, set()).add((round(float(la), 2), round(float(lo), 2)))
            except ValueError:
                pass
    if not gaz:
        return None, {}
    pat = re.compile(r"\b(" + "|".join(re.escape(n) for n in
                                       sorted(gaz, key=len, reverse=True)) + r")\b", re.I)
    return pat, gaz


def place_doubt(title, lat, lon, pat, gaz):
    """제목에 나온 지명이 전부 마커에서 멀면 True (위치가 의심스럽다).

    실측으로 잡힌 것들:
      · "Police probe fire at Berlin power station" → 마커는 모스크바 (1,615km)
      · "Cambridge man drives wrong way down Rt. 13" → 마커는 짐바브웨 (8,436km)
      · "Telugu YouTuber detained at Hyderabad airport" → 마커는 'Mohan Rao'
        (GDELT 가 **사람 이름을 지명으로** 잡은 것)
    """
    if not title or not pat:
        return False, []
    hits = {m.group(1).lower() for m in pat.finditer(title)}
    if not hits:
        return False, []                    # 지명이 없으면 판단하지 않는다
    far = []
    for h in hits:
        d = min(km_between(lat, lon, a, b) for a, b in gaz[h])
        if d <= FAR_KM:
            return False, []                # 하나라도 가까우면 통과
        far.append({"name": h, "km": round(d)})
    return True, far[:3]


def gkg_titles(export_url):
    """GKG 파일에서 기사 제목을 모은다 (URL → 제목).

    왜 GKG 인가
      export.CSV 에는 제목이 없다. SOURCEURL 만 있다.
      그래서 화면에 "재난 보도 · Gironde, France" 같은 분류만 뜨고
      "무슨 일이 났는지"는 알 수 없었다.

      기사 페이지를 직접 긁어 og:title 을 읽는 방법도 시도했는데,
      실측 8건 중 3건이 403 이었다 (Newsquest 계열이 봇을 막는다).
      신디케이트 매체가 많은 사안에서 하필 제일 많이 실패한다.

      GKG 의 Extras 열에는 <PAGE_TITLE> 이 들어 있다 —
      실측: 696/696 레코드 전부 존재, 확정 이벤트 29건 중 29건 매칭(100%).
      같은 15분 주기로 나오고, 스크래핑도 403도 없다.

    ⚠️ 제목은 기사 "본문"이 아니다. 링크 이름으로 제목을 쓰는 것은
       모든 뉴스 수집 서비스가 하는 방식이고 §5-3 의 "링크만" 원칙에 맞다.
       본문·요약은 여기서도 절대 가져오지 않는다.

    ⚠️ GKG 파일은 개당 3MB 다. 3시간이면 36MB — Lambda 대역폭으로는 문제없지만
       실패한 파일은 조용히 건너뛴다. 제목이 없으면 도메인만 보여주면 된다.
    """
    titles = {}
    for u in recent_export_urls(export_url):
        gkg = u.replace(".export.CSV.zip", ".gkg.csv.zip")
        try:
            # ⚠️ UA 상수는 이 모듈에 없다. 다른 Lambda 의 변수명을 그대로 써서
            #    NameError 로 12개 파일이 전부 조용히 건너뛰어졌다 (제목 0건).
            #    GDELT 는 User-Agent 를 요구하지 않으므로 그냥 부른다.
            raw = urllib.request.urlopen(gkg, timeout=60).read()
            z = zipfile.ZipFile(io.BytesIO(raw))
            txt = z.read(z.namelist()[0]).decode("utf-8", "replace")
            for r in csv.reader(io.StringIO(txt), delimiter="\t"):
                if len(r) < 27:
                    continue
                m = re.search(r"<PAGE_TITLE>(.*?)</PAGE_TITLE>", r[26], re.S)
                if m:
                    t = html.unescape(m.group(1)).strip()
                    if t:
                        titles[r[4]] = t[:200]
        except Exception as e:                               # noqa: BLE001
            print(f"[gkg] skip {gkg.rsplit('/',1)[1]} {type(e).__name__}")
    print(f"[gkg] 제목 {len(titles):,}개")
    return titles


def handler(event, context):
    url = latest_export_url()
    stamp = re.search(r"/(\d{14})\.export", url).group(1)
    now = datetime.now(timezone.utc)

    # 최근 몇 시간치를 모은다. 없는 파일(아직 안 올라옴)은 건너뛴다.
    rows = []
    got = 0
    for u in recent_export_urls(url):
        try:
            rows.extend(fetch_events(u))
            got += 1
        except Exception as e:
            print(f"[skip] {u.rsplit('/',1)[1]} {e}")
    print(f"[src] {got}개 파일, 원본 이벤트 {len(rows)}")

    cand = []
    soft_dropped = 0
    for r in rows:
        if len(r) < len(COLS):
            continue
        root = r[IX["EventRootCode"]]
        if root not in ROOT:
            continue
        lat, lon = r[IX["ActionGeo_Lat"]], r[IX["ActionGeo_Long"]]
        if not lat or not lon:
            continue
        try:
            lat, lon = float(lat), float(lon)
        except ValueError:
            continue

        # DATEADDED 는 YYYYMMDDHHMMSS
        try:
            added = datetime.strptime(r[IX["DATEADDED"]], "%Y%m%d%H%M%S").replace(tzinfo=timezone.utc)
            age_min = max(0, (now - added).total_seconds() / 60)
        except Exception:
            age_min = 0

        src_url = r[IX["SOURCEURL"]] or ""
        geo_type = r[IX["ActionGeo_Type"]] or "0"
        sc = score(int(r[IX["NumSources"]] or 0), int(r[IX["NumMentions"]] or 0),
                   bool(WIRE.search(src_url)), geo_type, age_min)
        if sc < MIN_SCORE:
            continue
        # ⚠️ 사건이 아닌 글은 여기서 버린다 (리뷰·칼럼·보도자료·연예).
        #    분류를 고치지 않고 버리는 이유는 SOFT 상수 주석에 적었다.
        if SOFT.search(src_url) or SOFT_HOST.search(src_url):
            soft_dropped += 1
            continue
        # ⚠️ 재난 기사면 충돌 분류를 덮어쓴다.
        #    GDELT 는 "소방대가 불길과 사투(battle)" 를 19(FIGHT)로 코딩한다.
        #    그대로 두면 산불이 "무력 충돌"로 지도에 찍힌다 — 실제로 그랬다.
        is_disaster = bool(DISASTER.search(src_url))
        kko, ken = (DISASTER_LABEL if is_disaster else ROOT[root])

        cand.append({
            "id": r[IX["GlobalEventID"]],
            "lat": round(lat, 3), "lon": round(lon, 3),
            "place": r[IX["ActionGeo_FullName"]],
            "country": r[IX["ActionGeo_CountryCode"]],
            "root": ("DIS" if is_disaster else root),
            "cameoRoot": root,          # 원본 코드는 남긴다 (나중에 재분류할 수 있게)
            "eventCode": r[IX["EventCode"]],        # 합치기 판정에 쓴다 (대분류보다 좁다)
            "featureId": r[IX["ActionGeo_FeatureID"]],
            "geoType": geo_type,
            "disaster": is_disaster,
            "kindKo": kko, "kindEn": ken,
            "sources": int(r[IX["NumSources"]] or 0),
            "mentions": int(r[IX["NumMentions"]] or 0),
            "tone": round(float(r[IX["AvgTone"]] or 0), 1),
            "url": src_url,
            "domain": domain_of(src_url),
            "score": sc,
            "ageMin": round(age_min),
            "_age": age_min,
        })

    # ── 중복 제거 (§5-2) — 규칙은 DEDUP_KM 상수 주석 참고 ──
    # ⚠️ GDELT 는 같은 사건을 기사마다 따로 코딩한다. 안 합치면 한 사건이 지도에 여러 개로 찍힌다
    #    (실측: 같은 마드리드 사건이 나란히 2건).
    cand.sort(key=lambda x: -x["score"])
    merged = []
    for c in cand:
        hit = None
        for m in merged:
            if m["root"] != c["root"] or m["eventCode"] != c["eventCode"]:
                continue
            # 같은 지점인가. FeatureID 가 있으면 그것으로, 없으면 거리로.
            if m["featureId"] and c["featureId"]:
                same = m["featureId"] == c["featureId"]
            else:
                same = km_between(m["lat"], m["lon"], c["lat"], c["lon"]) <= DEDUP_KM
            if same:
                hit = m
                break
        if hit:
            # ⚠️ 더하지 않는다. 같은 기사가 여러 행으로 쪼개진 것일 뿐일 수 있다.
            hit["sources"] = max(hit["sources"], c["sources"])
            hit["mentions"] = max(hit["mentions"], c["mentions"])
            hit["merged"] = hit.get("merged", 1) + 1
            hit["_outlets"].add(c["domain"])
            if c["url"] not in hit["_urls"]:
                hit["_urls"].append(c["url"])
        else:
            c["_outlets"] = {c["domain"]}
            c["_urls"] = [c["url"]]
            merged.append(c)

    # ── 같은 기사가 여러 위치에 찍힌 것 ──
    # ⚠️ GDELT 는 기사 하나가 여러 지역을 언급하면 지역마다 사건을 만든다.
    #    그대로 두면 **같은 헤드라인이 지구 위에 여러 개** 뜬다 —
    #    읽는 사람에게는 별개 사건 여러 건으로 보인다.
    #    실측 2026-09-07: 표출 150건 중 63건이 남의 제목과 겹쳤다.
    #    대표 위치 하나만 남기고, 나머지는 버리지 않고 alsoPlaces 로 붙인다.
    by_url, unique = {}, []
    for m in sorted(merged, key=lambda x: -x["score"]):
        head = by_url.get(m["url"])
        if head is not None:
            if m["place"] != head["place"] and len(head.setdefault("alsoPlaces", [])) < 4:
                head["alsoPlaces"].append({"place": m["place"], "lat": m["lat"], "lon": m["lon"]})
            head["_outlets"] |= m["_outlets"]
            continue
        by_url[m["url"]] = m
        unique.append(m)
    multi_place = sum(1 for m in unique if m.get("alsoPlaces"))
    merged = unique

    # ── 합치기가 끝났으니 다시 채점한다 ──
    # 교차검증 = GDELT 가 센 소스 수와 **서로 다른 매체 수** 중 큰 쪽.
    for m in merged:
        m["outlets"] = len(m["_outlets"])
        m["sources"] = max(m["sources"], m["outlets"])
        m["score"] = score(m["sources"], m["mentions"],
                           any(WIRE.search(u) for u in m["_urls"]),
                           m["geoType"], m["_age"])
        m["status"] = "confirmed" if m["score"] >= CONFIRM_SCORE else "unconfirmed"
        m["alt"] = [u for u in m["_urls"] if u != m["url"]][:4]   # 링크는 최대 4개까지만

    merged.sort(key=lambda x: -x["score"])
    # ⚠️ 자르기 전 개수를 남긴다. 앱의 "교차검증 결과" 깔때기가 이 값을 쓴다 —
    #    자른 뒤 값(150)을 넣으면 중복제거가 몇 건인지 알 수 없어진다.
    dedup_count = len(merged)
    # ⚠️ 자르기 전 최저 점수를 남긴다 — 이게 그날의 **실제** 하한선이다
    capped = len(merged) > MAX_EVENTS
    merged = merged[:MAX_EVENTS]
    eff_min = min((e["score"] for e in merged), default=None)

    # 기사 제목을 붙인다.
    # ⚠️ 제목이 없으면 화면에 "재난 보도 · Gironde, France" 같은 분류만 남는다.
    #    "무슨 일이 났는지"를 알려주는 건 결국 제목이다:
    #      "Wildfires drive 250,000 people from homes and edge towards Bordeaux"
    #    자를 것도, 요약할 것도 없이 그대로 링크 이름으로 쓴다 (§5-3 링크 원칙).
    # ⚠️ 못 찾으면 넣지 않는다. 지어내지 않는다 — 앱이 도메인만 보여준다.
    try:
        tmap = gkg_titles(url)
        titled = 0
        for m in merged:
            for u in [m["url"]] + (m.get("alt") or []):
                if u in tmap:
                    m["title"] = tmap[u]
                    titled += 1
                    break
        print(f"[title] {titled}/{len(merged)}건 제목 확보")
    except Exception as e:                                   # noqa: BLE001
        print("[title] 실패", repr(e))

    # ── 제목이 마커와 다른 곳을 말하고 있나 ──
    # 제목이 붙은 뒤라야 검사할 수 있어 여기에 둔다. 자세한 근거는 place_doubt() 참고.
    # ⚠️ 의심스러우면 **확정으로 올리지 않는다.** 위치가 틀린 사건을 확정이라고
    #    말하는 것이 이 레이어에서 가장 나쁜 실패다. 지우지는 않는다 —
    #    사건 자체는 있었을 수 있고, 우리가 못 믿는 건 '위치'다.
    doubted = 0
    try:
        pat, gaz = build_gazetteer(rows)
        for m in merged:
            bad, far = place_doubt(m.get("title"), m["lat"], m["lon"], pat, gaz)
            if bad:
                m["placeDoubt"] = True
                m["placeElsewhere"] = far
                doubted += 1
                if m["status"] == "confirmed":
                    m["status"] = "unconfirmed"
        print(f"[place] 위치 의심 {doubted}건 (지명 사전 {len(gaz)}개)")
    except Exception as e:                                   # noqa: BLE001
        print("[place] 실패", repr(e))

    # 내부용 필드는 내보내지 않는다
    for m in merged:
        for k in ("_outlets", "_urls", "_age"):
            m.pop(k, None)

    out = {
        "generated": now.strftime("%Y-%m-%dT%H:%M:00Z"),
        "sourceFile": stamp,
        "windowHours": WINDOW_HOURS,
        "source": "GDELT 2.0 Events",
        "sourceUrl": "https://www.gdeltproject.org/",
        "license": "Unlimited and unrestricted use; cite and link The GDELT Project",
        "termsUrl": "https://www.gdeltproject.org/about.html#termsofuse",
        "rules": {
            "confirmScore": CONFIRM_SCORE, "minScore": MIN_SCORE, "dedupKm": DEDUP_KM,
            # ⚠️ 실제로 잘린 지점. MIN_SCORE 는 **뉴스가 적은 날에만** 작동한다 —
            #    많은 날은 MAX_EVENTS 상한이 먼저 걸려서, 하한선이 25 가 아니라
            #    그날 150번째 사건의 점수가 된다(실측 2026-08-02: 34점).
            #    이걸 안 적으면 화면의 깔때기가 "25점 이상은 다 보여준다"로 읽힌다.
            "effectiveMinScore": eff_min,
            "cappedByLimit": capped,
            "maxEvents": MAX_EVENTS,
        },
        "counts": {
            "raw": len(rows), "candidates": len(cand), "afterDedup": dedup_count,
            "shown": len(merged),
            "confirmed": sum(1 for m in merged if m["status"] == "confirmed"),
            # 화면의 깔때기가 "무엇을 왜 걸렀는지" 말할 수 있게 남긴다.
            "softDropped": soft_dropped,      # 사건이 아닌 글 (리뷰·칼럼·보도자료)
            "multiPlace": multi_place,        # 같은 기사가 여러 지역에 찍혀 합친 것
            "placeDoubt": doubted,            # 제목이 다른 곳을 말해 확정에서 내린 것
        },
        "events": merged,
    }
    body = json.dumps(out, ensure_ascii=False, separators=(",", ":")).encode()
    dst.put_object(
        Bucket=DST_BUCKET, Key="events/global.json",
        Body=body, ContentType="application/json; charset=utf-8",
        CacheControl="public, max-age=600",
    )
    print(f"[out] 원본 {len(rows)} → 후보 {len(cand)} → 중복제거 {len(merged)} "
          f"(확정 {out['counts']['confirmed']})  {len(body)/1024:.0f}KB")
    return {"ok": True, **out["counts"], "bytes": len(body)}
