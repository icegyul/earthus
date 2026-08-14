# Earthus Ocean Public Release — 2026-08-14

## 결론

Ocean Verticals 구현물을 `NOT RELEASED` canary에만 두지 않고 Earthus 실제 서비스에 공개했다.

- 운영 진입: EARTHUS 1단 `OCEAN`
- 공유 주소: `https://earthus.net/?ocean=hub`
- 직접 주소: `https://earthus.net/ocean.html` → 운영 허브로 이동
- 접근 정책: `MONETIZATION_MODE=FREE_OPEN`, `SALES_OPEN=false`, `SHOW_SUBSCRIBE=false`
- 배포 범위: 앱 shell, Ocean 공개 허브, `js/ocean` 전체, `data/ocean` 전체,
  심해·해구 자료, 해양생물 사진

## 사용자가 실제로 보는 것

1. 오늘의 바다: 해수면 온도, 1991–2020 수온 편차, 파고, 너울, 해류, 해양 부이
2. Surf: 실제 해변 위치, 파고·너울·바람, 부이 실측과 출처·시각
3. Fishing: 물때·파고·바람·안전 자료, 조과 보장 문구 없음
4. Marine Life: 출처 기반 심해 생물, 방류 거북 과거 경로, 조사 연도 조류 기록
5. Dive: GEBCO 2026 수심 기둥, 해구 문헌 수심과 실제 격자 분리
6. My Ocean: SAFETY·SURF·FISHING·MARINE LIFE·DIVE·VESSEL 6위젯 무료 관제판
7. Vessels: provider 권리 승인 전 `UNAVAILABLE`, 현재 위치 0, 가짜 marker 없음

## 배포 증거

- S3: `s3://earthus-cache-kr/app/`
- CloudFront: `E193CZEBLWEB56`
- 전체 배포 무효화: `IC9UQ1E4KCZH5PEC7L2C3IUX5P`
- 직접 주소 무효화: `I3D6ISR4N994O7WVQ7FNE2MOZ8`
- `tools/verify_ocean_public_release.mjs`: 운영 자산 73개 HTTP 200, 명시 MIME,
  live/local SHA-256 전부 일치
- 운영 브라우저: `/ocean.html`이 `/?ocean=hub`로 이동하고 OCEAN 허브 자동 공개

CloudFront `GetInvalidation` 권한은 없어서 waiter 상태를 읽지 못했다. 대신 무효화 생성 이후
cache-bypass 운영 응답의 전체 바이트를 로컬과 직접 비교했다.

## 검증

- `tools/test_ocean_public_entry.mjs`: 공개 메뉴·무료 문구·6개 레이어·7개 기능 route
- `tools/test_ocean_public_layout.mjs`:
  - 390×844: overflow 0, 44px, layer·Surf 연결 PASS
  - 768×900: overflow 0, 44px, layer·Surf 연결 PASS
  - 1280×720: overflow 0, 44px, layer·Surf 연결 PASS
- Ocean core/unit/control/marine-life/vessel/expansion/depth suite PASS
- 실제 운영 브라우저:
  - OCEAN 허브 자동 공개, overflow 0
  - My Ocean 위젯 6개
  - Vessels `UNAVAILABLE`, 현재 위치 0
  - Marine Life 공개 기록 카드 5개
  - 파고 운영 출처 `Open-Meteo 해양 (파랑모델)`과 유효 시각
  - OCEAN → Surf 실제 `서핑` 시트 연결

## 계속 닫힌 운영 gate

공개 배포는 없는 기능을 완성으로 바꾸는 작업이 아니다. 다음은 실제 외부 증거가 생길 때까지
실행하지 않는다.

- 상업 이용·재배포·캐시 권리가 승인되지 않은 AIS 현재 위치
- 영속 개인 기록·사진 원본·파생 처리·CDN purge·RLS
- 조건 알림·중복 방지·quiet hours·마케팅과 분리된 opt-in
- 예약 재고·가격·출항·잔여석 생성
- 개인 좌표·민감종 위치를 포함하는 분석 이벤트

이번 배포 과정에서 처음 사용한 `/ocean/index.html`은 기존 CloudFront `/ocean/*` 동작과 충돌해
403이었다. 운영 주소를 충돌 없는 `/ocean.html`로 바꿨다. deploy 계정에 `s3:DeleteObject`가 없어
처음 올린 비사용 객체를 지우지는 못했지만 CloudFront에서 서비스되지 않으며 운영 진입점은 참조하지 않는다.
