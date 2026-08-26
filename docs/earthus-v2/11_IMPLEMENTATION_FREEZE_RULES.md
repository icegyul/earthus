# EARTHUS 2.0 IMPLEMENTATION FREEZE RULES

## Freeze 선언

현재 시점부터 **기능 구현 중 실제 Gap Evidence가 생기기 전까지** 새로운 Engine/Algorithm/Foundation 계층을 추가하지 않는다.

### 신규 Engine이 허용되는 조건

아래 5개를 모두 문서화해야 한다.

1. 기존 Engine Catalog 검색 결과
2. 기존 Algorithm Catalog 검색 결과
3. EARTHUS 1.0 재사용 후보 검색 결과
4. Adapter/Harden/Composition으로 해결 불가한 이유
5. 실제 Runtime blocker 또는 acceptance failure evidence

하나라도 없으면 `NEW ENGINE` 대신 기존 자산을 적용한다.

## First-screen freeze

첫 화면은 다음을 유지한다.

- Quiet Earth
- dynamic engine 0
- finite camera only
- 7 top menu
- optional Intelligence panel
- source 없는 임의 status/숫자/뉴스 0

화려함을 이유로 첫 화면에 cloud/wind/news/pulse animation을 자동 실행하지 않는다.

## Scene ownership freeze

- `PRIMARY <= 1`
- `SECONDARY <= 1`
- `SAFETY` persistent
- `SPACE` exclusive
- `PULSE` orchestrator

Feature 모듈끼리 상대 Feature의 내부 object를 직접 제거/활성화하지 않는다.

## DONE vocabulary

- `FOUNDATION_READY`: contract/code test pass
- `WIRED`: actual app path에 연결
- `RUNTIME_VERIFIED`: browser에서 실제 실행 확인
- `PRODUCTION_VERIFIED`: 배포 bytes + runtime + required E2E evidence

`FOUNDATION_READY`를 `PRODUCTION_VERIFIED`라고 부르지 않는다.
