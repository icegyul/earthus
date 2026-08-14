# Aetherus API Contract Foundation — Sheets 215–218

## 상태

`LOCAL_SHADOW_COMPLETE / SERVER_ADAPTER_EXTERNAL`. API v1 경로, REST naming, opaque cursor,
error envelope, request id, idempotency scope/replay/conflict/expiry, strong ETag conditional GET과
rate-limit header를 합성 fixture로 검증했다.

## 보호 계약

- 모든 신규 route template은 `/api/v1`을 포함하며 소문자 kebab-case resource를 사용한다.
- cursor는 client가 해석할 수 없는 opaque token이며, 없는 total을 추정해 붙이지 않는다.
- error envelope는 안정적인 code와 request id를 포함하고 stack, token, secret 등은 거절한다.
- idempotency는 actor + method + route + key로 격리하고 body SHA-256이 달라지면 충돌시킨다.
- 같은 요청의 완료 결과는 TTL 안에서 response reference로 replay한다. request body는 저장하지 않는다.
- ETag는 representation SHA-256 기반 strong validator만 허용한다. 일치한 GET은 body 없는 304다.
- rate-limit 값은 server가 계산해 주입한 정수만 header로 직렬화하며 client에서 만들지 않는다.

## 닫힌 gate

현재 policy는 `DRAFT + productionEnabled=false`다. API Gateway/server middleware, 인증 actor,
영속 idempotency store, canonical body hasher, distributed clock, ETag storage, 실제 quota와 운영
rate-limit 정책은 미연결이다. 운영 route와 기존 `/api` 호환성은 승인 전 변경하지 않는다.
