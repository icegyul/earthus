# Earthus · Aetherus Platform Operating Foundation

## 상태

`LOCAL_SHADOW_COMPLETE / INFRA_AND_AUTH_EXTERNAL`. Sheet 006, 008, 010, 011, 014–018,
021–023의 제품·공통 아키텍처 경계를 합성 fixture로 검증했다.

## 보호 계약

- 외부 미디어는 권리 증거가 없으면 링크만, embed-only는 embed만 허용한다.
- 유료 기능은 entitlement 증거가 없거나 만료되면 fail-closed다.
- 관측 시각은 UTC로 보존하고 locale/timezone은 표현 단계에서만 적용한다.
- reduced-motion을 명시하고 애니메이션은 on-demand 계약만 둔다.
- Earth/Space/Media adapter는 provider, source URL, fetch/observation time, rights record와
  missing reason을 잃지 않는다.
- ingestion receipt는 source = accepted + missing + rejected를 만족해야 한다.
- analytics는 exact location/token/e-mail을 거절한다.
- DRAFT policy에서는 feature flag가 요청값과 무관하게 모두 false다.
- runtime configuration에는 secret·password·private key·token을 넣을 수 없다.

## 닫힌 gate

현재 policy는 `DRAFT + productionEnabled=false`다. 실제 API Gateway, 인증/session,
entitlement source, queue/cache/event bus, secrets vault, observability와 운영 rate limit은 미연결이며
모든 component가 운영 증거를 갖기 전에는 production policy를 승인할 수 없다.
