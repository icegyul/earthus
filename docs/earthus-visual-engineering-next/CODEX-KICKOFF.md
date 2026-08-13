# CODEX KICKOFF — 다음 리셋 후 그대로 사용

다음 작업을 `/Volumes/740GB/웹/World.com`에서 진행한다.

## 목표

`docs/earthus-visual-engineering-next/`를 실행 정본으로 삼아 EARTHUS 천구·위성 구름
시각 파이프라인을 장기 운영 가능한 구조로 발전시킨다. 기능 목록을 늘리는 것이 아니라
관측 provenance, 시각 효과 분리, layer lifecycle, tile dedupe, 성능, 보안, 실기기,
canary/rollback을 닫는다.

## 시작 순서

1. `AGENTS.md`, `docs/HANDOVER.md`를 전부 읽는다.
2. 이 폴더의 `README.md` → `01` → `02` → `03` → `04` 순서로 읽는다.
3. `git status`, 최근 관련 commit, 현재 운영 URL과 배포 증거를 확인한다.
4. 다른 작업자의 dirty file을 보존하고 task 파일/hunk만 다룬다.
5. [`PR00-CONTRACT-MEASUREMENT-ADR.md`](PR00-CONTRACT-MEASUREMENT-ADR.md)의 기준선과
   증거를 확인하고 PR-01에서 이어간다. HEAD나 provider 구조가 바뀌지 않았다면 PR-00을
   처음부터 반복하지 않는다.

## 보호할 현재 동작

- query 없는 첫 Earth는 NOAA GMGSI 구름과 고해상도 실제 은하수 배경이다.
- 달은 Earth 첫 화면에 없다. AETHERUS 우주 장면에서 본다.
- NOAA 그림자는 낮 면에서만 보인다.
- 천리안/히마와리 적외 깊이는 물리적 태양 그림자로 주장하지 않는다.
- 수증기 채널에는 구름 깊이 효과를 적용하지 않는다.
- 출처·관측시각·지연·범위·한계 설명을 유지한다.
- 적외 색은 강수량이 아니다.
- 레이어 배타 그룹, HUD, Earth/AETHERUS/해구 route를 깨지 않는다.
- 무한 애니메이션과 `clampToGround`를 추가하지 않는다.

## 현재 완료

PR-00 문서와 코드는 로컬 완료됐고 측정 전용이라 운영 배포하지 않았다.

- `SatelliteFrameContract` validator/fixtures
- 동일 module duplicate URL 검사
- base/sibling layer lifecycle 진단
- tile request/dedupe 기준선
- mask task p50/p95와 long-task 기준선
- 3초 유휴 render count
- desktop/mobile 대표 golden capture
- 다음 PR로 갈 수 있는 측정 기반 ADR

## 이번 회차의 첫 산출물

PR-01 `ImageryLayerGroup`:

- base와 visual sibling의 공통 owner와 ACTIVE/REPLACING/DISPOSING 상태 머신
- 전환/OFF 시 AbortController, listener, timer, provider 작업의 일괄 취소
- NOAA/GK-2A/Himawari adapter와 base 관측 우선 failure isolation
- 30회 교대 soak와 layer/texture 증가 0 증거
- OFF/channel switch 뒤 이전 owner accepted request 0 증거
- PR-00의 기존 module query 불일치 5개 strict 0 선행 정리

## 작업 규칙

- 문제를 진단만 하고 멈추지 말고, 해당 PR의 완료 조건까지 구현·검증한다.
- 관측과 시각 효과를 코드·schema·UI에서 분리한다.
- source threshold/alpha를 시각 품질 때문에 바꾸지 않는다.
- 실패 시 base observation을 살리고 visual effect만 폴백한다.
- 모든 타이머·listener·worker·layer는 소유자와 cancel/dispose 경로가 있어야 한다.
- 외부 URL/이미지는 allowlist와 크기 상한 전에는 신뢰하지 않는다.
- 배포는 변경 파일만 정확한 Content-Type으로 하고 live hash/UI를 확인한다.
- 커밋 제목은 무엇이 잘못돼 있었는지 한국어로 쓴다.
- 자동 SNS 게시, 판매 전환, 결제 변경은 하지 않는다.

## 첫 보고 형식

- 파악한 제품 목적과 보호 동작
- PR-00에서 확인된 중복·잔존 요청·texture 기준선
- 현재 위험/의존성
- 변경 파일 예상 범위
- 완료/중단 게이트

질문이 없어도 안전한 read-only 점검 뒤 PR-01 완료 조건까지 바로 진행한다. PR-00의
measurement instrumentation은 기준선 비교용으로 유지하며 production entry에 연결하지 않는다.
