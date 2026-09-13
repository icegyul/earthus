# -*- coding: utf-8 -*-
"""Instagram 어댑터.

실제 제약은 social-admin/index.ts 의 오류 코드에서 그대로 가져왔다:
  INSTAGRAM_MEDIA_REQUIRED   사진/영상 없이 올릴 수 없다
  INSTAGRAM_PROCESSING_TIMEOUT  영상 처리 대기가 길어지면 중단된다(일시 실패)
"""
from .base import SnsAdapter


class InstagramAdapter(SnsAdapter):
    platform = "instagram"
    formats = ("SINGLE_IMAGE", "CAROUSEL", "SHORT_VIDEO")
    media_required = True
    # 인스타는 저장(saves)과 도달(reach)을 준다. 클릭 지표는 안 준다.
    metrics = ("impressions", "reach", "likes", "comments", "shares", "saves", "engagement_rate")

    def _platform_payload(self, platform_version, options):
        out = {"graphVersion": options.get("graphVersion")}
        if platform_version.get("format") == "CAROUSEL":
            # 캐러셀은 자산이 여럿이다. 하나만 넣으면 조용히 단일 사진이 된다.
            out["carouselAssetIds"] = list(options.get("carouselAssetIds") or [])
        return out

    def _platform_problems(self, payload):
        problems = []
        if not payload.get("mediaId") and not payload.get("carouselAssetIds"):
            problems.append("INSTAGRAM_MEDIA_REQUIRED — 사진 또는 영상이 필요하다")
        ids = payload.get("carouselAssetIds")
        if ids is not None and 0 < len(ids) < 2:
            problems.append("캐러셀은 자산이 둘 이상이어야 한다")
        if ids and len(ids) > 10:
            problems.append("캐러셀은 최대 10장이다")
        return problems
