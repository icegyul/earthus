# 01 — 다음 개발 우선순위

## 현재 실행 포인터

공통 N0, Visual PR-01~08, N1 운영 관제와 N5 안전 판독 보강은 2026-08-14 운영 완료했다.
N6~N7은 공개·판매 capability가 없는 shadow로 닫았다. 다음 포인터는 외부 gate가 실제 열린
항목뿐이다. 전체 종료 근거는
[`../earthus-v23/RELEASE-2026-08-14-N1-N7-CLOSEOUT.md`](../earthus-v23/RELEASE-2026-08-14-N1-N7-CLOSEOUT.md)다. Visual 종료 근거는
[`../earthus-visual-engineering-next/PR01-08-CLOSEOUT.md`](../earthus-visual-engineering-next/PR01-08-CLOSEOUT.md)다.

## N0. 문서·운영 정본 동기화

상태: **2026-08-13 완료**

목적: 오래된 체크박스 때문에 완료 범위를 잘못 말하거나 이미 열린 flag를 다시 잠긴 것으로
오해하지 않게 한다.

- 운영 객체·flag·Lambda·EventBridge·정적 해시를 다시 읽는다.
- `CURRENT_STATE`, `IMPLEMENTATION_PLAN`, `INDEX`, `HANDOVER`의 서로 다른 상태를 정리한다.
- 각 항목을 `OPERATING/SHADOW/BLOCKED/BACKLOG/IDEA`로 고정한다.

완료 조건: 같은 질문에 네 문서가 같은 답을 하며, 실제 운영과 다른 체크박스가 0개다.

## N1. 수집기 운영 관제

상태: **OPERATING** — 61/61 HEALTHY. CloudWatch/DLQ/log/target 권한 항목은 `UNKNOWN`.

목적: 데이터가 조용히 멈춰도 오래된 last-good이 정상처럼 보이는 가장 큰 운영 위험을 없앤다.

산출물:

- collector별 `lastAttemptAt`, `lastSuccessAt`, `sourceObservedAt`, `age`, `count`, `missing`,
  `rejected`, `httpStatus`, `latency`, `lastGood`, `quota`, `estimatedCost`, `revision`
- `HEALTHY/AGING/STALE/PARTIAL/FAILED/POLICY_BLOCKED/UNKNOWN` 공통 상태
- CloudWatch metric/alarm, DLQ, log retention, 비용 상한과 관리자 read-only 화면
- 안전 source와 비안전 source의 서로 다른 지연 기준

완료 조건: 대표 성공·부분실패·파서거절·quota·지연·last-good fixture와 실제 장애 알림을
재현하고, 앱이 stale을 현재 자료로 보이지 않는다.

중단 조건: 권한이 없어 metric/alarm/target을 읽지 못하면 성공으로 추정하지 않고 `UNKNOWN`을
기록한다. 권한 확대는 별도 승인이다.

## N2. 기상청 특보구역 정밀 경계

상태: **계층 OPERATING / geometry BLOCKED** — 공식 414개 계층, polygon 없음.

목적: 최근접 관측지점 근사를 공식 178개 시·군·44개 해역 geometry/hierarchy로 교체한다.

산출물:

- 공식 구역 ID·상하위 계층·polygon/multipolygon·해역·revision adapter
- 날짜변경선/구멍/다중영역·경계 위 점·대치·해제 fixture
- 기존 근사 reader와 dual-read diff, 불일치 원인표
- Safety가 공식 active region match일 때만 Hard Gate하는 authoritative reader

완료 조건: 실특보 발표→대치→해제 replay, 위치 100개 경계 fixture, 미매핑 0 또는 설명된
`UNKNOWN`, rollback rehearsal를 통과한다.

중단 조건: 공식 geometry가 없으면 임의 행정경계나 최근접점을 정본이라고 부르지 않는다.

## N3. Canonical·Rights authoritative 전환

상태: **SHADOW VERIFIED / authoritative BLOCKED** — 대표 3 source dual-read PASS.

목적: source마다 제각각인 시간·단위·결측·권리 계약을 실제 reader에서 일관되게 적용한다.

순서: fixture → canonical adapter → governance 승인 → dual-read → diff → 5% canary → 25% →
100% → 관찰 → 구 reader 제거 별도 PR.

완료 조건: `source/observedAt/issuedAt/validAt/receivedAt/unit/CRS/n/missingReason/revision/license`
전수 보존, 설명되지 않은 Safety·값 차이 0, rollback 실연 완료다.

## N4. 전 레이어 실제 화면 전수검수

상태: **대표 운영 매트릭스 PASS / 완전 조합·실기기 UNKNOWN**. 근거는
[`../earthus-v23/N4-UI-MATRIX-2026-08-14.md`](../earthus-v23/N4-UI-MATRIX-2026-08-14.md)다.

범위: Earth/Style/Data/Evidence, zoom 3단계, 한국·일본·유럽·북미·남반구·날짜변경선,
desktop 2종·tablet·mobile 2종, 레이어 단독·전환·해제 조합이다.

검수: source/time/unit/n/missing, 국가·해안선·등치선·값, empty/error/stale, console/network,
레이어 해제 뒤 timer/network/render owner 0, 가로 overflow, URL 새로고침·뒤로가기다.

완료 조건: 체크한 조합표·스크린샷·오류 목록·수정 커밋·운영 재검증이 남는다.

## N5. 고가치 판독 UX

상태: **레이더 시간축·증거 시간축·Wind Profiler OPERATING**. 정확 좌표 on-demand,
공식 투영 globe overlay, Skew-T는 입력/운영 gate 부족으로 BLOCKED.

N0~N4가 닫힌 뒤 다음 순서로 한다.

1. 공식 투영정보를 검증한 레이더 지구본 overlay와 5분 시간 슬라이더
2. 선택 좌표의 정확한 기상청 5km 격자 on-demand 예보와 cache
3. 레이더·낙뢰·AWS·특보를 한 시간축에서 비교
4. 관측소/부이 상세 페이지, 최근 변화·품질·장비·고도·결측 이력
5. 상층 수직 프로파일과 전문가용 Skew-T 후보

각 기능은 원자료가 가진 공간·시간 해상도보다 정밀하게 보이지 않아야 한다.

## N6. Decision·개인화·예약 공개

상태: **SHADOW 완료 / 공개 BLOCKED**.

- 5개 활동곡선·weight·하산 여유를 도메인 검증하고 version/rollback을 둔다.
- Base Score와 private delta를 계속 분리한다.
- 동의·저장·철회·삭제·RLS·보존정책을 먼저 구현한다.
- 운영·폐쇄·취소·재고 provider를 승인한 뒤 Reservation Impact를 연결한다.
- 알림과 대체안은 검증 근거가 있을 때만 제시하고 예약 변경·취소·결제는 사용자 확인 뒤 실행한다.

## N7. 유료/B2B와 Earthus Intelligence

상태: **evidence-only co-occurrence SHADOW / 판매·export BLOCKED**.

tenant 격리, scope, quota, 비용 귀속, export 권리, 감사, DR이 먼저다. 그 뒤에 태풍·해류·
선박·항공, 황사·상층풍·대기질, 산불·연기, 화산재·항공로 등 교차 신호를 만든다.
첫 버전은 “같은 시간대에 이런 공식/관측 신호가 함께 있었다”만 제공한다. AI가 원인·경로·
도착·피해를 생성하지 않는다.
