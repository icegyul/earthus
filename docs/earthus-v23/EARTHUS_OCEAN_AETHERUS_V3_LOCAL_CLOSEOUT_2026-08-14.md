# Earthus Ocean · Aetherus v3.0 Local Closeout — 2026-08-14

> 이 문서는 공개 전 로컬 종료점의 역사 기록이다. 같은 날 후속 PD 지시로 Ocean 운영 허브와
> 공개 가능 기능을 배포했다. 현재 상태는 `RELEASE-2026-08-14-OCEAN-PUBLIC.md`와
> `OCEAN_CHAPTER_LEDGER.md`를 정본으로 본다.
>
> **2026-08-15 정정:** 아래 `VERIFIED_EXISTING 200 / IMPLEMENT 0`은 제품 완료 수치가 아니다.
> 계약·fixture·단위 테스트를 런타임 완료처럼 집계한 잘못된 기준이었으며, v2 ledger가 이를
> `LOCAL_EVIDENCE_ONLY 181 / PARTIAL_RUNTIME 15 / BLOCKED_EXTERNAL 100`으로 교체한다.

## 결론

요청 문서 기준으로 로컬에서 안전하게 구현·검증할 수 있는 범위를 닫았다.

- Aetherus: 296/296 sheet 추적, `VERIFIED_EXISTING 200`, `IMPLEMENT 0`,
  `BLOCKED_EXTERNAL 96`, 전 행 `productionStatus=NOT_RELEASED`.
- Ocean: 0–51장과 OT-001–015 추적, O0–O6 계약·fixture·shadow UI 완료.
  공개·운영 완료로 판정한 장은 0개이며 provider/server/device/policy gate는 계속 닫혀 있다.
- 입력 ZIP/DOCX/PDF와 Ocean DOCX는 읽기 전용으로 사용했다.
- 메인 route, 판매, 결제, 알림, SNS, 운영 AI, 외부 provider, 원격 장비, 운영 DB/CDN은 열지 않았다.
- 이 로컬 인수 시점에는 배포·stage·commit을 하지 않았다.
  이후 PD 지시로 메인과 분리된 `NOT RELEASED` canary와 해양 수집기 2개를
  배포했으며, 결과는
  `RELEASE-2026-08-14-OCEAN-AETHERUS-V3-CANARY.md`에 기록했다. 배포 시점에는
  stage·commit을 하지 않았고, 후속 PD 명시 지시로 본 변경 묶음을 커밋한다.

## Aetherus 로컬 배치

1. 296 sheet ledger와 gap 분류
2. Culture 151–163
3. Mission Control 115–132
4. Media Rendition 137–140, 239–240, 281
5. Launch·Payload 65–78, 82–90, 282–283
6. SatelliteObject 91–101
7. API contract 215–218
8. Platform operating 006, 008, 010, 011, 014–018, 021–023
9. Discovery 043, 047, 050, 056, 061
10. Spotlight 102–114
11. Database·Infrastructure 219–245
12. Rights·Security·Privacy·Moderation 250, 252–256, 260–262
13. Release QA 279, 284, 286, 291, 295

`VERIFIED_EXISTING`은 로컬 코드·fixture·test 증거가 있다는 뜻이다. provider, server,
실기기 또는 운영 승인을 대신하지 않는다.

## Ocean 로컬 배치

- O0: observation, provenance, rights, freshness, unit, missingness 공통 계약
- O1: Fishing decision과 private/shared/public location policy
- O2: Surf 72시간 timeline과 DRAFT scoring policy
- O3: Marine Life 30MB/4 rendition, human taxonomy, sensitive location, visibility saga
- O4: My Ocean Control Center revision/conflict/expiry 권리
- O5: Vessel Lite license/coverage/freshness/redistribution gate
- O6: G1–G5 evidence-empty CLOSED expansion ledger

## 최종 검증

- Aetherus `tools/test_aetherus_*.mjs`: layout server 전용 항목을 제외한 31개 local suite PASS.
- Ocean core/unit/media/control/vessel/expansion/depth suite PASS.
- Ocean shadow UI 실제 headless Chrome:
  - 390×844 BLOCKED, overflow 0
  - 768×900 UNKNOWN, overflow 0
  - 1280×900 NO_BLOCKING_EVIDENCE, overflow 0
- Earth Safety 23/23, Continuous Layers 40/40, Earth route 12/12,
  Activity 31/31, Reservation 21/21 PASS.
- 수정 JavaScript/ESM 문법, Python handler compile, `git diff --check` PASS.

## 운영 전 필수 gate

1. provider별 계약·상업 이용·redistribution·cache·history 권리 승인
2. 공식 source registry, freshness SLO, outage/missingness 운영 증거
3. API Gateway/auth/session/entitlement, 영속 idempotency, DB migration/RLS principal A/B
4. private bucket/KMS/signed URL/CDN purge와 익명 원본 403
5. 실제 iPhone/iPad/Mac/Vision Pro 접근성·센서·성능·발열·배터리
6. moderation/scanner/on-call/incident·takedown 운영 owner
7. canary·rollback rehearsal와 PD의 공개·판매·알림별 명시 승인

이 gate가 없는 상태에서는 ledger의 `BLOCKED_EXTERNAL`을 낮추거나 production flag를 켜지 않는다.
