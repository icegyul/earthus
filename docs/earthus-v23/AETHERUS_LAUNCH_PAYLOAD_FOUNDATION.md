# Aetherus Launch·Payload Foundation — Sheets 65–78, 82–90, 282–283

## 상태

`LOCAL_SHADOW_COMPLETE / LIVE_PROVIDER_NOTIFICATION_EXTERNAL`. LaunchSite/Rocket version/Mission,
10개 launch state와 transition, window/countdown, official broadcast link/embed, 4종 trajectory,
실패 정지/replay, 1:N payload manifest, 8개 payload state, Payload→Satellite/NORAD 후행 매칭을
합성 fixture로 검증했다.

## 보호 계약

- status 변경마다 official/curated source, provider object ID, source URL, asserted/observed UTC가 있다.
- countdown은 한 번 계산할 뿐 timer를 소유하지 않는다.
- official broadcast는 HTTPS link/embed이며 Earthus가 영상을 저장하지 않는다.
- `PLANNED / LIVE_TELEMETRY / ESTIMATED / LAST_CONFIRMED`를 섞지 않는다.
- LIVE_TELEMETRY는 official+fresh evidence에서만 live claim을 허용하고 interpolation은 없다.
- confirmed failure는 failure UTC 이전 confirmed point만 남기고 `LAST_CONFIRMED`로 고정한다.
- scrubbed launch의 replacement는 별도 event ID와 evidence로 연결한다.
- manifest는 Primary 정확히 하나와 Rideshare/CubeSat을 1:N으로 보존한다.
- deployment/first contact/operational과 각 실패는 명시적 state machine이다.
- Payload→Satellite는 official evidence, NORAD ID, International Designator가 있어야 하며
  inference matching을 금지한다.

## 닫힌 gate

발사 일정 collector·dedup, 실제 공식 live URL, telemetry provider, trajectory rights/freshness,
알림 opt-in/dispatch, 운영 payload registry·NORAD source, API/DB/search는 미연결이다. fixture 상태
전이는 실제 발사 상태나 예보가 아니다.
