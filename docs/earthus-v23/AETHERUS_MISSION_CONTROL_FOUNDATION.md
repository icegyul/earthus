# Aetherus My Mission Control Foundation — Sheets 115–132

## 상태

`PARTIAL_RUNTIME / SERVER_SYNC_ALERT_EXTERNAL`. 승인 reference의 중앙 3D Earth 중심 레이아웃을
메인 Aetherus route에 연결했다. Launch Library 2 일정·카운트다운, NOAA SWPC Kp 관측,
NOAA SWPC OVATION 오로라 모델, HST/JWST provenance 사진 수·최신 JWST 카드, Following,
payload/timeline의 명시적 결측 상태가 실제 화면에서 동작한다. Satellite Tracking room에서는
사용자가 위치를 허용한 뒤 최신 위성 카탈로그의 ISS 궤도 요소로 48시간 통과를 기기에서 계산하며,
LL2 한 응답을 Korea Space·SpaceX·Starship 위젯에 출처 그대로 분류한다. 4개 room은 서로 다른
기본 위젯과 Following·Next Launch를 포함한 숨김·resize·reorder 상태를 기기별로 독립 저장한다.
LIVE 위젯은 임의 영상이나 발사와 무관한 일반 링크를 넣지 않고, LL2가 해당 발사에
`webcast_live=true`와 HTTPS 송출 URL을 함께 준 경우에만 그 URL을 연결한다. 준비된 화면은
`FREE_OPEN`이며
결제·PRO 표시는 없다. F 키/화면 버튼 전체화면, E 편집, 1–4 room 전환, 필터의 실제 mouse 동작,
dialog focus trap·ARIA announcement가 연결됐다. 사진·Kp·OVATION·LL2는 출처별 마지막 성공 응답과
저장 시각을 기기에 보관하고 provider 실패 때 `CACHED`로 고정 표시한다. 위치 좌표와 ISS 계산
결과는 이 cache에 저장하지 않는다. 운영 동기화 policy는 계속 `DRAFT + productionEnabled=false`다.

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
- 기기 전용 keyboard command는 local layout commit과 접근성 announcement를 함께 수행한다.
  향후 계정 동기화 command만 server commit 성공 뒤 완료로 표시한다.

## 검증과 닫힌 gate

`tools/test_aetherus_mission_control_ui.mjs`가 실제 route 진입, 3D canvas, LL2/Kp/provenance 표시,
OVATION·Korea Space·SpaceX·Starship·JWST 위젯, 위치 허용 후 ISS 통과 계산, room별 독립
레이아웃 숨김·resize·reorder·reset, room별 독립 상태와 재접속 저장, Following 추가·해제,
Next Launch·LIVE·Countdown·Timeline·Payload·Weather 전 위젯, 390×844·754×402·1440×900
반응형·전체화면 지구본·44px 입력을 Chrome에서 검증한다.
`tools/test_aetherus_mission_control_live_sources.mjs`는 목 응답 없이 NOAA SWPC·LL2·Earthus
provenance 카탈로그의 현재 응답이 실제 브라우저 위젯에 들어오는지 검증한다.
`tools/test_aetherus_mission_control_offline_accessibility.mjs`는 전체화면 진입·종료, 1–4/E/F 키,
dialog focus trap, ARIA, mouse filter, 출처 4개 성공 cache 생성과 provider 503 이후 마지막 성공값·
저장 시각 복원을 실제 Chrome reload로 검증한다.
`tools/test_aetherus_mission_control.mjs`는 template geometry, mobile/tablet/desktop, device conflict,
owner denial, exact/Ocean state 차단, Mission Mode, fresh/stale/unavailable, export/delete,
운영 DRAFT policy 차단과 network/timer/animation 0을 검증한다.

다음은 미완료다: durable account sync/transaction, multi-monitor, 알림 센터,
실기기 VoiceOver 등 전체 screen-reader acceptance. Satellite Pass는 현재 사용자가
버튼으로 허용한 위치의 ISS 한 기만 계산하며 서버 알림·계정 위치 저장을 하지 않는다.
이 항목이 닫히기 전에는 Sheets 115–132 전체 완료로 판정하지 않는다. 유료 gate는 사용하지 않으며
PD가 유료서비스 시작을 명시할 때만 별도 구현한다.
