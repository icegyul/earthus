# EARTHUS 다음 리셋 개발 기준서 패키지

> 고정일: 2026-08-14 KST
> 목적: 다음 사용량 리셋 직후 재조사 없이 가장 급한 운영 기반부터 이어서 개발
> 상태: 코드 제어 범위 종료, N1 운영·N2 계층·N3 dual-read·N4 대표 화면·N5 판독 완료,
> N6~N7 shadow, 선택 이용행태 8월 21일 시행 대기, 외부 gate 대기

## 읽는 순서

1. [`../HANDOVER.md`](../HANDOVER.md)
2. [`00-CURRENT-TRUTH.md`](00-CURRENT-TRUTH.md)
3. [`01-PRIORITY-EXECUTION.md`](01-PRIORITY-EXECUTION.md)
4. [`02-GAPS-AND-IDEAS.md`](02-GAPS-AND-IDEAS.md)
5. [`03-DEVELOPMENT-STANDARD.md`](03-DEVELOPMENT-STANDARD.md)
6. [`04-START-AND-RELEASE-CHECKLIST.md`](04-START-AND-RELEASE-CHECKLIST.md)

위성·구름·천구의 상세 구현은
[`../earthus-visual-engineering-next/README.md`](../earthus-visual-engineering-next/README.md)를
같이 읽는다. 전체 패키지가 상위 운영 우선순위이고, visual 패키지는 그 안의 전문 트랙이다.
서로 대체하는 문서가 아니다.

기존 v2.3 문서는 설계·이력 정본으로 보존한다. 이 패키지는 그 문서를 대체하지 않고,
2026-08-13 운영 결과를 반영해 **다음에 실제로 무엇부터 할지**만 압축한 실행 정본이다.

## 다음 시작 한 줄

> HANDOVER와 `FINAL-CLOSEOUT-2026-08-14.md`를 읽고 운영 상태를 재확인하라.
> 다음 코딩은 외부 gate가 실제로 열린 항목만 시작한다. AETHERUS 별도 변경을 건드리거나
> 안전·판매·예약·SNS flag를 열지 마라.

## 두 패키지의 현재 실행 순서

1. 공통 N0 문서·운영 정본 동기화 — 완료
2. Visual PR-00 계약·측정 기반 — 완료
3. Visual PR-01~08 구현·검증·롤백·운영 배포 — 완료, 실기기 항목은 UNKNOWN
4. 전체 N1 수집기 운영 관제 — 완료, 운영 61/61 HEALTHY
5. N2 공식 계층 — 완료; 공식 polygon authoritative mapping은 BLOCKED
6. N3 canonical dual-read — PASS; rights/reader 전환은 BLOCKED
7. N4 대표 운영 매트릭스 — 5개 화면 크기·6개 대표 지역 PASS; 완전 조합·실기기 UNKNOWN
8. N5 레이더 시간축·연직바람 — 운영 완료
9. N6 Decision/예약, N7 Intelligence — SHADOW 완료, 공개·판매 차단

Visual 종료 결과는
[`../earthus-visual-engineering-next/PR01-08-CLOSEOUT.md`](../earthus-visual-engineering-next/PR01-08-CLOSEOUT.md)에 있다.
전체 종료 판정은
[`../earthus-v23/FINAL-CLOSEOUT-2026-08-14.md`](../earthus-v23/FINAL-CLOSEOUT-2026-08-14.md)다.

## 완료와 미완료를 부르는 법

- `OPERATING`: 운영 배포·실자료·실화면·선별 커밋까지 증거가 있다.
- `SHADOW`: 코드와 replay는 있지만 공개 판단이나 사용자 행동에 쓰지 않는다.
- `BLOCKED`: 권리·권한·공식 경계·PD 승인 등 외부 관문이 남았다.
- `BACKLOG`: 합의된 다음 기능이며 현재 결함으로 부르지 않는다.
- `IDEA`: 검증 전 제품 아이디어다. 일정이나 판매 약속이 아니다.

이 구분 없이 “전체 완료”라고 말하지 않는다.
