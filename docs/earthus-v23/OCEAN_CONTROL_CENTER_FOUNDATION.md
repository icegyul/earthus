# My Ocean Control Center Foundation — O4 shadow

## 상태

`LOCAL_SHADOW_COMPLETE / SERVER_SYNC_AND_ENTITLEMENT_EXTERNAL`. Ocean 위젯의 layout,
revision, 낙관적 동시성 충돌, owner 경계, 구독 만료 뒤 권리를 메모리 repository로 검증했다.
운영 인증, DB/RLS, 서버 entitlement, 멀티디바이스 transport에는 연결하지 않았다.

## 제품 경계

- `SAFETY / SURF / FISHING / MARINE_LIFE / DIVE / VESSEL`만 My Ocean 위젯이다.
- Safety 위젯은 정확히 하나이며 첫 번째다.
- exact latitude/longitude와 Aetherus observer·ephemeris·Mission Control 상태는 위젯 config에
  저장할 수 없다.
- 모든 layout은 owner private, `private, no-store`, 비공유 상태다.
- O4는 공통 layout 원칙을 재사용하지만 Aetherus 저장 모델과 동기화 공간을 공유하지 않는다.

## 동기화·권리 계약

- create/save 명령은 idempotency key와 canonical payload SHA-256으로 중복 실행을 방지한다.
- save는 `expectedRevision`을 요구한다. 최신 revision이면 revision을 1 올리고 parent를 보존한다.
- stale device save는 canonical을 덮어쓰지 않고 `CONFLICT_KEEP_BOTH` 사본을 만든다.
- widget은 12-column 경계와 비중첩 geometry를 만족해야 한다.
- owner가 다른 principal은 존재 여부를 노출하지 않고 `NOT_FOUND`로 실패한다.
- 만료된 PRO entitlement는 create/edit만 막는다. 기존 layout의 read/list/export/delete는 유지한다.
- export는 canonical layout SHA-256, byte length, export UTC를 포함한다.
- delete는 사람의 명시적 확인과 revision이 담긴 삭제 영수증을 요구한다.

현재는 `MONETIZATION_MODE=FREE_OPEN`이므로 준비된 위젯을 무료/유료로 나누지 않는다.
가격·entitlement 정책이 정본으로
승인되기 전 임의로 기능을 PRO로 잠그지 않는다.

## 검증

`tools/test_ocean_control_center.mjs`가 다음을 검증한다.

- 2-widget template geometry와 Safety-first 불변식.
- device A rev2 저장 뒤 device B rev1 충돌의 KEEP_BOTH.
- exact 위치, Aetherus mission state, geometry overlap 거부.
- owner B 읽기 거부와 private/no-store export checksum.
- 구독 만료 뒤 create/edit 차단, read/export/delete 유지.
- 명시 확인 없는 삭제 거부와 삭제 영수증.
- module 내부 network/timer/animation side effect 없음.

## 닫힌 gate

1. 운영 사용자 identity와 row-level owner policy.
2. server-issued entitlement와 가격/기능 매핑 정본.
3. durable revision transaction, idempotency table, 실제 multi-device conflict 증거.
4. 암호화 저장, audit log, export object 만료와 계정 삭제 연계.
5. 실제 모바일/태블릿 drag/resize 접근성 및 offline recovery UI.
