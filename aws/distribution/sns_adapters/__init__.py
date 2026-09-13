# -*- coding: utf-8 -*-
"""플랫폼 어댑터 등록소 — 지시서 §15.

플랫폼별 동작을 앱 여기저기에 흩지 않는다. 여기 한 곳에서 고른다.
새 플랫폼은 SnsAdapter 를 상속한 파일 하나를 만들고 ADAPTERS 에 한 줄 넣으면 된다.

지시서가 요구한 5종(Instagram · X · Facebook · LinkedIn · YouTube)을 우선 만든다.
Threads · TikTok 은 social-admin 이 이미 LIVE 로 지원하므로 같은 어휘로 함께 등록한다 —
있는 능력을 목록에서 빼면 관리 화면이 그 채널을 못 쓴다.
"""
from .base import (  # noqa: F401
    SnsAdapter, AdapterError, MODE_MOCK, MODE_PREVIEW, MODE_LIVE, MODES,
    TEMPORARY, PERMANENT, ALL_METRICS, ADAPTER_VERSION,
)
from .instagram import InstagramAdapter
from .x import XAdapter
from .facebook import FacebookAdapter
from .linkedin import LinkedInAdapter
from .youtube import YouTubeAdapter
from .threads import ThreadsAdapter
from .tiktok import TikTokAdapter

ADAPTERS = {
    "instagram": InstagramAdapter,
    "x": XAdapter,
    "facebook": FacebookAdapter,
    "linkedin": LinkedInAdapter,
    "youtube": YouTubeAdapter,
    "threads": ThreadsAdapter,
    "tiktok": TikTokAdapter,
}

# 지시서 §15 가 이름을 댄 5종. 관리 화면 기본 목록이다.
PRIMARY = ("instagram", "x", "facebook", "linkedin", "youtube")


def get(platform, mode=MODE_MOCK, **kw):
    """플랫폼 이름으로 어댑터를 만든다. 모르면 만들지 않는다 — 조용히 기본값을 주지 않는다."""
    cls = ADAPTERS.get(platform)
    if not cls:
        raise AdapterError(f"어댑터가 없는 플랫폼: {platform}")
    return cls(mode, **kw)


def capabilities():
    """각 플랫폼이 무엇을 받고 무엇을 돌려주는지. 관리 화면이 이걸로 버튼을 그린다."""
    out = {}
    for name, cls in ADAPTERS.items():
        out[name] = {
            "formats": list(cls.formats),
            "mediaRequired": cls.media_required,
            "supportsThread": cls.supports_thread,
            "metrics": list(cls.metrics),
            "unavailableMetrics": [m for m in ALL_METRICS if m not in cls.metrics],
            "primary": name in PRIMARY,
        }
    return out
