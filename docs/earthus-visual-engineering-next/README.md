# EARTHUS Visual & Satellite Engineering — Next Development Standard

버전: 1.0

작성일: 2026-08-13

상태: PR-01~08 운영 배포 완료 · 지정 실기기 검수는 UNKNOWN · 다음 전체 N1

적용 범위: 첫 Earth 화면, 천구 배경, NOAA/천리안2A/히마와리9 구름 영상, 관련 성능·보안·배포

## 1. 이 패키지의 목적

2026-08-12~13 업데이트에서 다음을 실제 구현하고 운영 반영했다.

- 1774×887 생성 원본을 늘려 쓰던 천구 배경을 ESO/S. Brunier 실제 6000×3000 전천 사진으로 교체
- 데스크톱 6K, 모바일·저사양 4K 폴백 및 항상 보이는 라이선스 크레딧 추가
- NOAA GMGSI 구름 알파를 관측 시각 태양 방향으로 투영한 낮 지표 그림자 추가
- 천리안2A와 히마와리9의 타일 구름에 채널별 시각 깊이 층 추가
- 적외선은 태양 그림자로 표현하지 않고 낮은 불투명도의 명암 분리만 적용
- 깊이 층을 본체 레이어와 함께 생성·표시·제거하는 수명주기 연결
- 별도 애니메이션 없이 Cesium 요청 타일 처리 시에만 깊이 마스크 생성

이번 구현은 사용자 눈에 보이는 문제를 해결했지만, 아직 장기 운영 가능한 완성형 시각
파이프라인은 아니다. 이 패키지는 그 차이를 숨기지 않고 다음 개발을 PR 단위로 정의한다.

## 2. 문서 순서

1. [`01-UPDATE-RETROSPECTIVE.md`](01-UPDATE-RETROSPECTIVE.md) — 이번 작업에서 확인한 결함·아쉬움·리스크
2. [`02-TARGET-ARCHITECTURE.md`](02-TARGET-ARCHITECTURE.md) — 새로 만들어야 할 컴포넌트와 계약
3. [`03-PR-IMPLEMENTATION-PLAN.md`](03-PR-IMPLEMENTATION-PLAN.md) — PR-00~08 구현 순서와 완료 조건
4. [`04-QUALITY-SECURITY-OPERATIONS.md`](04-QUALITY-SECURITY-OPERATIONS.md) — 성능·보안·실기기·배포 게이트
5. [`CODEX-KICKOFF.md`](CODEX-KICKOFF.md) — 리셋 후 Codex에게 그대로 줄 시작 지시문
6. [`PR00-CONTRACT-MEASUREMENT-ADR.md`](PR00-CONTRACT-MEASUREMENT-ADR.md) — 완료된 계약·실측 기준선과 PR-01 결정

## 3. 변경 불가 원칙

- 실제 구름 높이 자료가 없으면 높이를 관측값처럼 표시하지 않는다.
- 적외 영상의 색을 강수량으로 설명하지 않는다.
- 관측시각이 다른 NOAA·천리안·히마와리를 평균하거나 한 시각인 것처럼 합치지 않는다.
- 각 영상의 공식 출처, 채널, 관측시각, 지연, 범위, 결측을 보존한다.
- 시각 효과는 `visual-only`로 분류하고 데이터 내보내기·위험 판단·추천 입력에 넣지 않는다.
- 구름 탐지 임계값을 “예뻐 보이게” 바꾸지 않는다. 본체 관측 화소와 시각 깊이 효과를 분리한다.
- 구름·천구 때문에 무한 렌더, 지속 타이머, 숨은 탭 렌더를 추가하지 않는다.
- `clampToGround`를 사용하지 않는다.
- 비밀키를 URL·로그·문서·커밋에 넣지 않는다.
- SNS·마케팅·결제·판매는 이 패키지의 권한 범위 밖이며 자동 실행하지 않는다.

## 4. 현재 완료와 다음 시작점

PR-00이 드러낸 중복 요청·수명주기·잘못된 sky capability 문제를 PR-01~08에서 고쳤고
2026-08-13 운영 배포했다.

- 같은 구름 tile의 base/depth 중복 요청은 desktop/mobile 모두 0이다.
- 레이어 OFF 뒤 sibling/cache/idle render는 0이고 30회 교대에서 layer/texture 증가가 없다.
- mask p95는 1.6~4.1ms다.
- desktop/Retina는 6K, save-data mobile은 2K를 선택하며 context loss 뒤 안전 variant로 복구한다.
- 자동/낮음/끔은 관측 본체와 판단을 바꾸지 않는다.
- 34개 운영 객체 SHA와 S3 byte가 일치하고 rollback 복원→재적용을 실연했다.

정본은 [`PR01-08-CLOSEOUT.md`](PR01-08-CLOSEOUT.md)다. Safari·실제 iPhone·저사양
Android·VoiceOver·열/배터리는 계속 `UNKNOWN`이며, 다음 코드 시작점은 전체 패키지의
`N1 수집기 운영 관제`다.

## 5. 최종 완료 정의

이 패키지는 다음이 모두 충족돼야 완료로 닫는다.

- NOAA·천리안2A·히마와리9의 낮/밤·가시광/적외·전면/상세 조합 golden 테스트 통과
- 그림자 타일 경계 이음매와 중복 네트워크 요청이 측정 예산 이내
- 구름 레이어 30회 교대 후 남는 sibling layer와 GPU texture 증가 없음
- 390×844, 1280×720, 1600×900, Retina 2× 실제 화면 검수
- Safari 최신/이전 1개, 지원 최저 iPhone, 스크린리더, 저전력·열 상태 실기기 검수
- CSP/SRI 또는 동등한 공급망 통제, 이미지 입력 상한, URL allowlist, 정확한 MIME 적용
- canary → rollback 리허설 → 운영 hash/MIME/화면 증거 완료
- 이 문서의 미승인 데이터·기기·권리 항목이 승인되거나 명시적으로 차단 상태로 남음
