# Aetherus My Mission Control Foundation — Sheets 115–132

## 상태

`PARTIAL_RUNTIME / SERVER_SYNC_ALERT_EXTERNAL`. 승인 reference의 중앙 3D Earth 중심 레이아웃을
메인 Aetherus route에 연결했다. Launch Library 2 일정·카운트다운, NOAA SWPC Kp 관측,
HST/JWST provenance 사진 수, Following, payload/timeline의 명시적 결측 상태, 4개 room 선택,
위젯 숨김·resize·reorder와 기기 로컬 저장이 실제 화면에서 동작한다. 준비된 화면은 `FREE_OPEN`이며
결제·PRO 표시는 없다. 운영 동기화 policy는 계속 `DRAFT + productionEnabled=false`다.

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

`tools/test_aetherus_mission_control_ui.mjs`가 실제 route 진입, 3D canvas, LL2/Kp/provenance 표시,
레이아웃 resize·reset·저장, 390×844·754×402·1440×900 반응형과 44px 입력을 Chrome에서 검증한다.
`tools/test_aetherus_mission_control.mjs`는 template geometry, mobile/tablet/desktop, device conflict,
owner denial, exact/Ocean state 차단, Mission Mode, fresh/stale/unavailable, export/delete,
운영 DRAFT policy 차단과 network/timer/animation 0을 검증한다.

다음은 미완료다: Satellite Pass, Aurora, Korea Space, SpaceX, Starship, JWST 전용 위젯의 실제
데이터 연결, room별 서로 다른 저장 배치, durable account sync/transaction, fullscreen control room,
multi-monitor, 알림 센터, 실제 offline cache, 전체 keyboard/mouse/screen-reader acceptance.
이 항목이 닫히기 전에는 Sheets 115–132 전체 완료로 판정하지 않는다. 유료 gate는 사용하지 않으며
PD가 유료서비스 시작을 명시할 때만 별도 구현한다.
