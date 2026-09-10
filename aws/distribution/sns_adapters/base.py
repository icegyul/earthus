# -*- coding: utf-8 -*-
"""SNS 어댑터 인터페이스 — 지시서 §15 · §16 · §78 · §113 · §114 · §144.

세 가지 모드
  MOCK     아무 데도 안 보낸다. 큐·상태·아카이브를 끝까지 돌려 볼 수 있다.
  PREVIEW  플랫폼이 받을 payload 를 그대로 만들어 보여 준다. 보내지 않는다.
  LIVE     실제 발행. **여기서 직접 API 를 부르지 않는다** — 아래 이유.

■⚠️ LIVE 를 파이썬에서 직접 부르지 않는 이유
   자격증명은 Supabase Storage 의 AES-GCM 볼트에 있고, 그것을 여는 열쇠는
   Edge Function `social-admin` 만 갖는다(SOCIAL_VAULT_KEY). Lambda 에 토큰을
   복사해 오면 **비밀이 두 곳에 살게 된다** — 지시서 §111 · §112 가 금지한 것이다.
   그리고 그 함수는 설계상 "사람이 확인 체크를 하고 누른 POST"만 처리한다.
   그래서 이 어댑터의 LIVE 는 **그 함수가 받을 payload 를 만들어 넘기는 데까지**다.
   실제 전송은 관리자 화면(studio.html → social-admin)이 한다.

   전송 경로를 주입할 수는 있다(transport 인자). 주입이 없으면 NOT_CONFIGURED 다.
   조용히 성공한 척하지 않는다(§143).
"""
import hashlib
import os
import sys

sys.path.insert(0, os.path.join(
    os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__)))), "_shared"))
import content_contract as cc   # noqa: E402

MODE_MOCK = "MOCK"
MODE_PREVIEW = "PREVIEW"
MODE_LIVE = "LIVE"
MODES = (MODE_MOCK, MODE_PREVIEW, MODE_LIVE)

# §114 — 실패를 두 갈래로 나눈다. 영구 실패를 재시도하면 한도만 쓴다.
TEMPORARY = "TEMPORARY"
PERMANENT = "PERMANENT"

ADAPTER_VERSION = "earthus.sns-adapter/1.0.0"


class AdapterError(RuntimeError):
    def __init__(self, message, *, kind=PERMANENT, retry_after=None, code=None):
        super().__init__(message)
        self.kind = kind
        self.retry_after = retry_after
        self.code = code


class SnsAdapter:
    """§16 — 모든 플랫폼이 같은 일곱 가지를 한다.

    하위 클래스가 바꾸는 것은 `platform`, `formats`, `media_required`,
    그리고 `_platform_payload()` 뿐이다. 나머지 흐름은 여기서 한 번만 쓴다 —
    플랫폼마다 흐름을 다시 쓰면 어느 하나에서만 검증이 빠진다.
    """

    platform = None
    formats = ()
    media_required = False
    supports_thread = False
    # §33 — 이 플랫폼이 실제로 주는 지표. 없는 것을 0 으로 채우지 않는다.
    metrics = ()

    def __init__(self, mode=MODE_MOCK, *, transport=None, credentials_present=False):
        if mode not in MODES:
            raise AdapterError(f"알 수 없는 모드: {mode}")
        self.mode = mode
        self.transport = transport
        self.credentials_present = credentials_present

    # ── §16 generatePayload ──────────────────────────────────────────────
    def generate_payload(self, platform_version, *, media_asset_id=None, options=None):
        """마스터에서 파생된 플랫폼 판 → 플랫폼이 받을 payload."""
        if platform_version.get("platform") != self.platform:
            raise AdapterError(f"{self.platform} 어댑터에 {platform_version.get('platform')} 판이 왔다")
        text = platform_version.get("text") or ""
        tags = platform_version.get("hashtags") or []
        body = text if not tags or all(t in text for t in tags) else f"{text}\n\n{' '.join(tags)}"
        payload = {
            "provider": self.platform,
            "text": body,
            "mediaId": media_asset_id,
            "options": dict(options or {}),
            # §29 — 같은 콘텐츠·같은 플랫폼은 같은 키를 갖는다. 재시도해도 두 번 안 올라간다.
            "idempotencyKey": self.idempotency_key(platform_version, media_asset_id),
            "confirmed": False,     # ⚠️ 사람이 관리자 화면에서 true 로 바꾼다. 여기서 켜지 않는다.
        }
        payload.update(self._platform_payload(platform_version, options or {}))
        return payload

    def _platform_payload(self, platform_version, options):
        return {}

    @staticmethod
    def idempotency_key(platform_version, media_asset_id=None):
        raw = "|".join([
            str(platform_version.get("masterContentId")),
            str(platform_version.get("platform")),
            str(platform_version.get("format")),
            str(media_asset_id or ""),
            hashlib.sha256((platform_version.get("text") or "").encode("utf-8")).hexdigest()[:16],
        ])
        return hashlib.sha256(raw.encode("utf-8")).hexdigest()

    # ── §16 validatePayload ──────────────────────────────────────────────
    def validate_payload(self, payload):
        problems = []
        text = payload.get("text") or ""
        limit = cc.PLATFORM_LIMITS[self.platform]
        if not text.strip():
            problems.append("본문이 비었다")
        if len(text) > limit:
            problems.append(f"{self.platform} 한도 {limit}자 초과 ({len(text)}자)")
        if self.media_required and not payload.get("mediaId"):
            problems.append(f"{self.platform} 게시에는 사진 또는 영상이 필요하다")
        if not payload.get("idempotencyKey"):
            problems.append("멱등키가 없다 — 재시도하면 두 번 올라간다")
        problems += self._platform_problems(payload)
        return (not problems), problems

    def _platform_problems(self, payload):
        return []

    # ── §16 preview ──────────────────────────────────────────────────────
    def preview(self, payload):
        """§97 — 올리기 전에 보이는 것. 실제 요청을 만들지 않는다."""
        ok, problems = self.validate_payload(payload)
        text = payload.get("text") or ""
        return {
            "platform": self.platform,
            "mode": self.mode,
            "valid": ok,
            "problems": problems,
            "textLength": len(text),
            "limit": cc.PLATFORM_LIMITS[self.platform],
            "remaining": cc.PLATFORM_LIMITS[self.platform] - len(text),
            "mediaRequired": self.media_required,
            "mediaAttached": bool(payload.get("mediaId")),
            "renderedText": text,
            "availableMetrics": list(self.metrics),
        }

    # ── §16 schedule ─────────────────────────────────────────────────────
    def schedule(self, payload, when):
        """예약은 어댑터가 하지 않는다 — 큐가 한다(§28). 여기서는 계약만 확인한다."""
        ok, problems = self.validate_payload(payload)
        if not ok:
            raise AdapterError("; ".join(problems), kind=PERMANENT, code="PLATFORM_INVALID")
        return {"platform": self.platform, "scheduledAt": when,
                "idempotencyKey": payload["idempotencyKey"]}

    # ── §16 publish ──────────────────────────────────────────────────────
    def publish(self, payload, *, confirmed=False, actor=None, at=None):
        """§78 · §144 — 모드에 따라 다르게 끝난다. 어느 경우도 조용히 성공하지 않는다."""
        ok, problems = self.validate_payload(payload)
        if not ok:
            raise AdapterError("; ".join(problems), kind=PERMANENT, code="PLATFORM_INVALID")

        if self.mode == MODE_PREVIEW:
            return {"status": "PREVIEW_ONLY", "platform": self.platform,
                    "payload": payload, "note": "미리보기 모드 — 전송하지 않았다"}

        if self.mode == MODE_MOCK:
            # 가짜 게시. 실제 URL 을 만들지 않는다 — 눌러 보면 없는 주소이기 때문이다.
            return {
                "status": "PUBLISHED", "mock": True, "platform": self.platform,
                "postId": f"mock-{payload['idempotencyKey'][:12]}",
                "url": None,
                "urlNote": "MOCK 발행이라 주소가 없다",
                "publishedAt": at, "publishedBy": actor,
                "idempotencyKey": payload["idempotencyKey"],
            }

        # LIVE
        if not confirmed:
            raise AdapterError("사람이 확인하지 않은 발행 요청", kind=PERMANENT,
                               code="PUBLISH_CONFIRMATION_REQUIRED")
        if not self.credentials_present:
            raise AdapterError(f"{self.platform} 자격증명이 없다", kind=PERMANENT,
                               code="NOT_CONFIGURED")
        if not self.transport:
            # §143 — 조용히 아무 일도 안 하지 않는다. 무엇이 없는지 말한다.
            raise AdapterError(
                "LIVE 전송 경로가 주입되지 않았다 — 실제 발행은 관리자 화면(social-admin)이 한다",
                kind=PERMANENT, code="TRANSPORT_NOT_CONFIGURED")
        req = dict(payload)
        req["confirmed"] = True
        return self.transport(req)

    # ── §16 getStatus ────────────────────────────────────────────────────
    def get_status(self, publication):
        """발행 결과의 현재 상태. 지표는 이 플랫폼이 실제로 주는 것만 있다(§33)."""
        return {
            "platform": self.platform,
            "postId": (publication or {}).get("postId"),
            "url": (publication or {}).get("url"),
            "state": (publication or {}).get("status") or "UNKNOWN",
            "availableMetrics": list(self.metrics),
            "unavailableMetrics": [m for m in ALL_METRICS if m not in self.metrics],
        }

    # ── §16 archive ──────────────────────────────────────────────────────
    def archive(self, publication):
        """§35 — 발행된 것은 그대로 얼린다. 여기서 내용을 고치지 않는다."""
        out = dict(publication or {})
        out["archived"] = True
        out["adapterVersion"] = ADAPTER_VERSION
        return out

    # ── SNS FACTORY 확장 (추가만. 기존 계약을 바꾸지 않는다) ──────────────
    def get_rate_limit(self):
        """이 플랫폼의 상한을 알면 dict, 모르면 None.

        숫자를 지어내지 않는다. 실제 API 계약·실측값이 들어오기 전까지는
        None 이다 — rate_limit.check() 는 None 을 강제하지 않는다.
        """
        return None

    def fetch_analytics(self, publication):
        """성과 읽기. 네트워크를 쓰지 않는다.

        파이썬 어댑터는 전송 경로가 없다(§15 주석). 실제 읽기는
        social-admin 전송 경로에서 하고, 여기서는 빈 그릇만 돌려준다.
        analytics_fetch.fetch() 가 NOT_AVAILABLE 로 정리한다.
        """
        return {"metrics": {},
                "reference": None,
                "note": "읽기는 social-admin 전송 경로에서 한다"}

    def provider_capabilities(self):
        """관리 화면이 버튼을 그리는 값. capabilities() 와 같은 내용이다."""
        return {
            "platform": self.platform,
            "formats": list(self.formats),
            "mediaRequired": self.media_required,
            "supportsThread": self.supports_thread,
            "metrics": list(self.metrics),
        }

    def validate_media(self, media):
        """매체 하나가 이 플랫폼에 붙을 수 있는가. (가능, 문제들)."""
        problems = []
        if self.media_required and not (media or {}).get("assetId"):
            problems.append(f"{self.platform} 게시에는 사진 또는 영상이 필요하다")
        return (not problems), problems


# §33 — 지표 어휘 하나. 플랫폼마다 주는 것이 다르다.
ALL_METRICS = ("impressions", "reach", "likes", "comments", "shares", "saves",
               "clicks", "ctr", "followers_gained", "watch_time", "engagement_rate")
