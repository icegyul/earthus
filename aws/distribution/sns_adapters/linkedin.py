# -*- coding: utf-8 -*-
"""LinkedIn 어댑터.

social-admin 은 accessToken + authorUrn 으로 올린다. authorUrn 이 누구 이름으로
올라가는지를 정한다 — 개인과 회사 페이지가 다른 urn 이다.
영상 형식을 두지 않는다. 지금 자격증명 계약에 영상 업로드 경로가 없다(§143 —
못 하는 것을 할 수 있는 것처럼 두지 않는다).
"""
from .base import SnsAdapter


class LinkedInAdapter(SnsAdapter):
    platform = "linkedin"
    formats = ("TEXT", "SINGLE_IMAGE", "LINK_POST")
    media_required = False
    # 링크드인 개인/페이지 API 가 주는 지표는 제한적이다. 저장·시청시간은 없다.
    metrics = ("impressions", "likes", "comments", "shares", "clicks")

    def _platform_payload(self, platform_version, options):
        out = {"apiVersion": options.get("apiVersion")}
        if platform_version.get("format") == "LINK_POST":
            out["link"] = options.get("link")
        return out

    def _platform_problems(self, payload):
        if "link" in payload and not payload.get("link"):
            return ["링크 게시인데 주소가 없다"]
        return []
