# -*- coding: utf-8 -*-
"""해시태그 — 지시서 §24.

통제된 목록만 쓴다. 사건 이름에서 즉석으로 태그를 만들지 않는다.
왜: 태풍 이름이 바뀌거나 오타가 나면 그 태그는 아무도 안 보는 무덤이 된다.
    기존 aws/social-draft/handler.py 가 `#{name.replace(' ','')}` 로 즉석 태그를
    만들고 있었다 — 그것이 이 파일이 대체하는 것이다.

플랫폼마다 개수를 달리한다. 인스타에서 3개는 적고, X 에서 10개는 스팸이다.
"""
import os
import sys

sys.path.insert(0, os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), "_shared"))
import content_contract as cc   # noqa: E402

# 언제나 붙는 것. 이 셋이 EARTHUS 를 찾게 하는 태그다.
BASE = ("#Earthus", "#EarthObservation", "#지구관측")

# 현상 도메인 → 태그. 현상 레지스트리의 domain 을 그대로 받는다.
DOMAIN_TAGS = {
    "weather": ("#Weather", "#날씨"),
    "ocean": ("#Ocean", "#바다"),
    "land": ("#Land", "#육상"),
    "hazards": ("#NaturalHazards", "#재해"),
    "space": ("#Space", "#우주"),
    "people": ("#People",),
    "travel": ("#Travel",),
}

# 현상 id → 태그. 도메인보다 구체적인 것만 넣는다. 없는 현상은 도메인 태그로 간다.
PHENOMENON_TAGS = {
    "hazards.typhoon": ("#Typhoon", "#태풍"),
    "hazards.earthquake": ("#Earthquake", "#지진"),
    "hazards.wildfire": ("#Wildfire", "#산불"),
    "hazards.tsunami": ("#Tsunami", "#쓰나미"),
    "hazards.lightning": ("#Lightning", "#낙뢰"),
    "hazards.crustal_motion": ("#Tectonics",),
    "weather.temperature": ("#Temperature", "#기온"),
    "weather.wind": ("#Wind", "#바람"),
    "weather.precipitation": ("#Rain",),
    "weather.air_quality": ("#AirQuality", "#대기질"),
    "ocean.sst": ("#SeaSurfaceTemperature", "#해수온"),
    "ocean.wave": ("#Waves",),
    "space.aurora": ("#Aurora", "#오로라"),
    "space.orbital_debris": ("#SpaceDebris", "#우주쓰레기"),
    "land.bird_migration": ("#BirdMigration", "#철새"),
}

# 콘텐츠 유형 태그. 정기물만 붙인다 — 속보에 #MonthlyReport 는 뜻이 없다.
TYPE_TAGS = {
    "MONTHLY_EARTH": ("#MonthlyEarthReport",),
    "QUARTERLY_EARTH": ("#QuarterlyEarthReport",),
    "ANNUAL_EARTH": ("#StateOfEarth",),
    "EARTH_TODAY": ("#EarthToday",),
    "EARTH_WEEKLY": ("#EarthWeekly",),
    "DATA_STORY": ("#EarthData",),
    "EARTH_FROM_SPACE": ("#EarthFromSpace",),
}

# §24 — 넘치면 아무도 안 본다. 플랫폼마다 다른 상한.
MAX_TAGS = {"instagram": 12, "x": 4, "facebook": 6, "linkedin": 5,
            "youtube": 8, "threads": 6, "tiktok": 8}

# 한글 태그를 붙일 플랫폼. 링크드인은 영어권 독자가 대부분이라 뺀다.
KOREAN_OK = ("instagram", "x", "facebook", "threads", "tiktok", "youtube")


def build(*, phenomenon_ids=None, content_type=None, platform="instagram", lang="ko"):
    """§24 — 통제 목록에서만 고른다. 중복을 없애고 순서를 고정한다.

    순서를 고정하는 이유: 같은 콘텐츠를 다시 만들었을 때 태그 순서가 달라지면
    재현성 시험(§118)이 이유 없이 깨진다.
    """
    if platform not in cc.PLATFORMS:
        raise ValueError(f"알 수 없는 플랫폼: {platform}")
    korean_ok = platform in KOREAN_OK and lang == "ko"

    tags = []

    def add(items):
        for t in items or ():
            if not korean_ok and any("가" <= ch <= "힣" for ch in t):
                continue
            if t not in tags:
                tags.append(t)

    add(BASE)
    add(TYPE_TAGS.get(content_type))
    seen_domains = []
    for pid in (phenomenon_ids or []):
        add(PHENOMENON_TAGS.get(pid))
        dom = str(pid).split(".")[0]
        if dom not in seen_domains:
            seen_domains.append(dom)
    for dom in seen_domains:
        add(DOMAIN_TAGS.get(dom))

    return tags[:MAX_TAGS.get(platform, 8)]
