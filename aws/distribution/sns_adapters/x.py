# -*- coding: utf-8 -*-
"""X 어댑터.

280자다. 지시서 §22 의 아홉 블록이 다 들어가지 않는다 —
caption.render() 가 자를 수 있는 블록부터 뺀다. 신뢰도와 출처는 남는다.

실제 제약은 social-admin/index.ts 에서:
  X_TOKEN_EXPIRED               토큰 만료 (영구 실패 — 사람이 새 토큰을 넣어야 한다)
  X_MEDIA_PROCESSING_TIMEOUT    영상 처리 지연 (일시 실패)
"""
from .base import SnsAdapter


class XAdapter(SnsAdapter):
    platform = "x"
    formats = ("TEXT", "SINGLE_IMAGE", "THREAD", "LINK_POST")
    media_required = False
    supports_thread = True
    # X 는 노출과 클릭을 준다. 저장(saves)은 없다.
    metrics = ("impressions", "likes", "comments", "shares", "clicks", "engagement_rate")

    def _platform_payload(self, platform_version, options):
        if platform_version.get("format") != "THREAD":
            return {}
        # 스레드는 마스터 본문을 나눈 것이어야 한다. 새 문장을 만들지 않는다.
        return {"threadParts": list(options.get("threadParts") or [])}

    def _platform_problems(self, payload):
        problems = []
        parts = payload.get("threadParts")
        if parts is not None:
            if len(parts) < 2:
                problems.append("스레드는 두 편 이상이어야 한다")
            over = [i for i, p in enumerate(parts) if len(p) > 280]
            if over:
                problems.append(f"280자를 넘는 편: {over}")
        return problems
