# Aetherus My Mission Control Foundation — Sheets 115–132

## 상태

`LOCAL_SHADOW_COMPLETE / SERVER_SYNC_ALERT_ENTITLEMENT_EXTERNAL`. 승인 reference의 중앙 3D Earth
우선, Following/launch/payload/pass/weather/spotlight/JWST 위젯, 4개 room template, multiple room,
revision/conflict, 반응형, Mission Mode, freshness/offline 상태와 키보드 명령 계약을 구현했다.
운영 policy는 `DRAFT + productionEnabled=false`다.

## 보호 계약

- 중앙 Earth는 정확히 하나, 첫 번째, 최소 6×6이고 다른 위젯보다 작지 않다.
- desktop은 reference geometry, tablet은 Earth+2열, mobile은 Earth-first 1열이다.
- exact latitude/longitude와 Ocean score/point/observation state를 config에 저장하지 않는다.
  위치 기반 위젯은 private opaque `locationRef`만 가진다.
- room은 owner private/no-store, 최대 수·위젯 수는 server policy가 정한다.
- optimistic revision mismatch는 canonical을 덮지 않고 `KEEP_BOTH` conflict room을 만든다.
- Mission Mode는 fresh official LIVE/ASCENT/ORBIT_INSERTION/PAYLOAD_DEPLOYMENT evidence에서만
  launch widget을 우선한다. 알림은 보내지 않는다.
- widget data는 source ID와 observed/valid UTC, APPROVED freshness policy를 요구한다.
- edit/create/activate는 `APPROVED + productionEnabled` policy와 server entitlement feature가
  모두 있어야 한다. read/export/delete 권리는 별도다.
- `FREE_OPEN` 기간에 entitlement는 결제 영수증이 아니라 사용자·owner 접근 증거다.
  준비된 Mission Control capability에 유료 tier 잠금을 걸지 않는다.
- keyboard command는 서버 commit과 접근성 announcement가 필요한 명시적 command다.

## 검증과 닫힌 gate

`tools/test_aetherus_mission_control.mjs`가 template geometry, mobile/tablet/desktop, device conflict,
owner denial, exact/Ocean state 차단, Mission Mode, fresh/stale/unavailable, export/delete,
운영 DRAFT policy 차단과 network/timer/animation 0을 검증한다.

다음은 미완료다: 실제 3D/UI wiring, durable sync/transaction, server entitlement/receipt,
multi-monitor, 알림 센터, 실제 offline cache, keyboard/mouse/screen-reader 실브라우저,
Mission Control 판매·공개. 외부 gate 전에는 메인 route에 연결하지 않는다.
