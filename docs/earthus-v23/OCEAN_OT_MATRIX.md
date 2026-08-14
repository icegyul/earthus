# Ocean OT-001–015 증거 매트릭스 — 2026-08-14

## 판정 기준

- `VERIFIED_LOCAL`: 현재 HEAD의 순수 계약/fixture/브라우저에서 요구 동작을 재현했다.
- `PARTIAL`: 보호 계약은 있으나 실제 HTTP·DB·CDN·map lifecycle·실기기 증거가 없다.
- `BLOCKED_EXTERNAL`: 계정, 권리, 정책, 공급자 또는 운영 인프라 승인이 필요하다.

`VERIFIED_LOCAL`은 공개/운영 완료를 뜻하지 않는다. 모든 Ocean provider와 공개 UI gate는
계속 닫혀 있다.

| ID | 요구 결과 | 로컬 판정 | 현재 증거 | 운영 잔여 gate |
|---|---|---|---|---|
| OT-001 | 낙뢰 active → score null·CTA 숨김 | VERIFIED_LOCAL | `test_ocean_core.mjs` | 공식 coverage/freshness·공개 UI |
| OT-002 | 조류 없음 → 조위로 유속 생성 금지 | VERIFIED_LOCAL | `test_ocean_core.mjs` | 운영 current provider 권리·단위 재수집 |
| OT-003 | 서핑 시간축 이동 → 모든 카드 valid time 일치 | VERIFIED_LOCAL | 72시간×9 metric fixture, `test_ocean_core.mjs` | 승인 scoring policy·공개 timeline UI |
| OT-004 | 개인 포인트 → 검색·공개 API exact 미노출 | PARTIAL | owner exact/shared grid/public region 계약 | DB/RLS·검색 index·두 principal HTTP 증거 |
| OT-005 | 30MB 사진 → 320/640/1280/2048 파생 | VERIFIED_LOCAL | 30MB metadata·4 derivative completeness | 실제 worker 픽셀/EXIF/checksum |
| OT-006 | PUBLIC→PRIVATE → API 차단·CDN purge | PARTIAL | 삭제·invalidation·익명 404 영수증 saga | 실제 bucket/CDN/anonymous HTTP |
| OT-007 | 민감종 공개 → 서버 좌표 일반화 | PARTIAL | public region-only, exact null | 운영 taxonomy·민감종 정책·RLS |
| OT-008 | AI 종 제안 → 검증 분포 제외 | VERIFIED_LOCAL | SUGGESTED count 0, human VERIFIED만 count | taxonomy 정본·moderator identity |
| OT-009 | AIS 미지원 지역 → UNAVAILABLE·marker 0 | VERIFIED_LOCAL | `test_ocean_vessel_lite.mjs` | 실제 승인 coverage polygon |
| OT-010 | AIS stale → 실시간 배지 제거 | VERIFIED_LOCAL | DELAYED/STALE fixture, badge false | 실제 provider SLA·clock monitoring |
| OT-011 | 구독 만료 → 읽기·내보내기·삭제 유지 | VERIFIED_LOCAL | `test_ocean_control_center.mjs` | 서버 entitlement·DB transaction |
| OT-012 | 지도 5회 진입 → listener·메모리 누수 없음 | PARTIAL | Ocean 모듈 network/timer/animation 0 | 실제 Ocean map mount/unmount 5회 heap/listener 계측 |
| OT-013 | 외부 예약 재고 없음 → 잔여석 생성 금지 | VERIFIED_LOCAL | Fishing booking CTA false, availability missing은 null/UNKNOWN | 예약 provider 계약·HTTP fallback UI |
| OT-014 | 저전력 모드 → 애니메이션 정적 전환 | PARTIAL | 기존 visual-effect/power 계약·shadow 자체 animation 0 | Ocean 통합 화면과 실기기 저전력 증거 |
| OT-015 | CDN URL 추측 → 원본 접근 403 | PARTIAL | anonymous/wrong key local authorization 403·key 비노출 | private bucket policy·CDN signed path 실제 403 |

## 로컬 종료선

OT-004/006/007/012/014/015를 `VERIFIED_OPERATING`으로 바꾸지 않는다. 각각 서버 principal,
실제 storage/CDN, 실제 map lifecycle, 실기기 저전력 증거가 있어야 한다. OT-013도 예약 provider가
없으므로 “재고 없음”을 표시할 수 있을 뿐 예약 가능을 주장하거나 잔여석을 만들 수 없다.
