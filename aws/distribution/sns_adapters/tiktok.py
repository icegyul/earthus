# -*- coding: utf-8 -*-
"""TikTok 어댑터.

social-admin 오류 코드:
  TIKTOK_VIDEO_REQUIRED        영상이 있어야 한다
  TIKTOK_PRIVACY_REQUIRED      공개 범위를 골라야 한다
  TIKTOK_PRIVACY_NOT_ALLOWED   계정이 허용하지 않는 범위다 (계정마다 다르다)
"""
from .base import SnsAdapter

PRIVACY = ("PUBLIC_TO_EVERYONE", "MUTUAL_FOLLOW_FRIENDS", "FOLLOWER_OF_CREATOR", "SELF_ONLY")


class TikTokAdapter(SnsAdapter):
    platform = "tiktok"
    formats = ("SHORT_VIDEO",)
    media_required = True
    metrics = ("impressions", "likes", "comments", "shares", "watch_time")

    def _platform_payload(self, platform_version, options):
        return {"privacyLevel": options.get("privacyLevel")}

    def _platform_problems(self, payload):
        problems = []
        if not payload.get("mediaId"):
            problems.append("TIKTOK_VIDEO_REQUIRED — 영상이 필요하다")
        if payload.get("privacyLevel") not in PRIVACY:
            problems.append("TIKTOK_PRIVACY_REQUIRED — 계정이 허용하는 범위를 고른다")
        return problems
