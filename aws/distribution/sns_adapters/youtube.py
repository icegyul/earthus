# -*- coding: utf-8 -*-
"""YouTube Shorts 어댑터.

social-admin 의 실제 오류 코드가 요구사항을 그대로 말해 준다:
  YOUTUBE_VIDEO_REQUIRED    영상이 있어야 한다
  YOUTUBE_TITLE_REQUIRED    제목이 있어야 한다 (본문과 별개다)
  YOUTUBE_PRIVACY_REQUIRED  공개 범위를 골라야 한다
"""
from .base import SnsAdapter

PRIVACY = ("public", "unlisted", "private")


class YouTubeAdapter(SnsAdapter):
    platform = "youtube"
    formats = ("SHORT_VIDEO",)
    media_required = True
    metrics = ("impressions", "likes", "comments", "shares", "watch_time", "engagement_rate")

    def _platform_payload(self, platform_version, options):
        return {
            "title": options.get("title") or platform_version.get("title"),
            "privacyStatus": options.get("privacyStatus"),
        }

    def _platform_problems(self, payload):
        problems = []
        if not payload.get("mediaId"):
            problems.append("YOUTUBE_VIDEO_REQUIRED — 영상이 필요하다")
        title = (payload.get("title") or "").strip()
        if not title:
            problems.append("YOUTUBE_TITLE_REQUIRED — 영상 제목이 필요하다")
        elif len(title) > 100:
            problems.append("YouTube 제목은 100자까지다")
        if payload.get("privacyStatus") not in PRIVACY:
            problems.append("YOUTUBE_PRIVACY_REQUIRED — public·unlisted·private 중 하나")
        return problems
