# EARTHUS 다음 리셋 개발 기준서 패키지

> 고정일: 2026-08-13 KST
> 목적: 다음 사용량 리셋 직후 재조사 없이 가장 급한 운영 기반부터 이어서 개발
> 상태: 기상청 Live·HSR 레이더·TPW 공개 완료, 흰색 해안선 보강 완료

## 읽는 순서

1. [`../HANDOVER.md`](../HANDOVER.md)
2. [`00-CURRENT-TRUTH.md`](00-CURRENT-TRUTH.md)
3. [`01-PRIORITY-EXECUTION.md`](01-PRIORITY-EXECUTION.md)
4. [`02-GAPS-AND-IDEAS.md`](02-GAPS-AND-IDEAS.md)
5. [`03-DEVELOPMENT-STANDARD.md`](03-DEVELOPMENT-STANDARD.md)
6. [`04-START-AND-RELEASE-CHECKLIST.md`](04-START-AND-RELEASE-CHECKLIST.md)

기존 v2.3 문서는 설계·이력 정본으로 보존한다. 이 패키지는 그 문서를 대체하지 않고,
2026-08-13 운영 결과를 반영해 **다음에 실제로 무엇부터 할지**만 압축한 실행 정본이다.

## 다음 시작 한 줄

> HANDOVER와 이 패키지를 읽고, 작업트리·운영 상태를 다시 확인한 뒤 N0 문서/인벤토리
> 동기화부터 시작하라. AETHERUS 변경은 건드리지 말고, 안전·판매·예약·SNS flag를 열지 마라.

## 완료와 미완료를 부르는 법

- `OPERATING`: 운영 배포·실자료·실화면·선별 커밋까지 증거가 있다.
- `SHADOW`: 코드와 replay는 있지만 공개 판단이나 사용자 행동에 쓰지 않는다.
- `BLOCKED`: 권리·권한·공식 경계·PD 승인 등 외부 관문이 남았다.
- `BACKLOG`: 합의된 다음 기능이며 현재 결함으로 부르지 않는다.
- `IDEA`: 검증 전 제품 아이디어다. 일정이나 판매 약속이 아니다.

이 구분 없이 “전체 완료”라고 말하지 않는다.
