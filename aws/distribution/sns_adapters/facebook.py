# -*- coding: utf-8 -*-
"""Facebook 페이지 어댑터.

social-admin 은 pageAccessToken + pageId 로 페이지에 올린다(개인 계정이 아니다).
링크 게시가 실제로 먹히는 몇 안 되는 플랫폼이라 LINK_POST 를 1급으로 둔다.
"""
from .base import SnsAdapter


class FacebookAdapter(SnsAdapter):
    platform = "facebook"
    formats = ("TEXT", "SINGLE_IMAGE", "LINK_POST", "SHORT_VIDEO")
    media_required = False
    metrics = ("impressions", "reach", "likes", "comments", "shares", "clicks", "engagement_rate")

    def _platform_payload(self, platform_version, options):
        out = {}
        if platform_version.get("format") == "LINK_POST":
            out["link"] = options.get("link")
        return out

    def _platform_problems(self, payload):
        if "link" in payload and not payload.get("link"):
            return ["링크 게시인데 주소가 없다"]
        return []
