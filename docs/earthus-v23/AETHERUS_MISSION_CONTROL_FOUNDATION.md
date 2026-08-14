# Aetherus My Mission Control Foundation — Sheets 115–132

## 상태

`PARTIAL_RUNTIME / SERVER_SYNC_ALERT_EXTERNAL`. 승인 reference의 중앙 3D Earth 중심 레이아웃을
메인 Aetherus route에 연결했다. Launch Library 2 일정·카운트다운, NOAA SWPC Kp 관측,
NOAA SWPC OVATION 오로라 모델, HST/JWST provenance 사진 수·최신 JWST 카드, Following,
payload/timeline의 명시적 결측 상태가 실제 화면에서 동작한다. Satellite Tracking room에서는
사용자가 위치를 허용한 뒤 최신 위성 카탈로그의 ISS 궤도 요소로 48시간 통과를 기기에서 계산하며,
LL2 한 응답을 Korea Space·SpaceX·Starship 위젯에 출처 그대로 분류한다. 4개 room은 서로 다른
기본 위젯과 숨김·resize·reorder 상태를 기기별로 독립 저장한다. 준비된 화면은 `FREE_OPEN`이며
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
OVATION·Korea Space·SpaceX·Starship·JWST 위젯, 위치 허용 후 ISS 통과 계산, room별 독립
레이아웃 resize·reset·저장, 390×844·754×402·1440×900 반응형과 44px 입력을 Chrome에서 검증한다.
`tools/test_aetherus_mission_control_live_sources.mjs`는 목 응답 없이 NOAA SWPC·LL2·Earthus
provenance 카탈로그의 현재 응답이 실제 브라우저 위젯에 들어오는지 검증한다.
`tools/test_aetherus_mission_control.mjs`는 template geometry, mobile/tablet/desktop, device conflict,
owner denial, exact/Ocean state 차단, Mission Mode, fresh/stale/unavailable, export/delete,
운영 DRAFT policy 차단과 network/timer/animation 0을 검증한다.

다음은 미완료다: durable account sync/transaction, fullscreen control room, multi-monitor, 알림 센터,
실제 offline cache, 전체 keyboard/mouse/screen-reader acceptance. Satellite Pass는 현재 사용자가
버튼으로 허용한 위치의 ISS 한 기만 계산하며 서버 알림·계정 위치 저장을 하지 않는다.
이 항목이 닫히기 전에는 Sheets 115–132 전체 완료로 판정하지 않는다. 유료 gate는 사용하지 않으며
PD가 유료서비스 시작을 명시할 때만 별도 구현한다.
