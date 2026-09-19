# ADMIN RUNBOOK — EARTHUS v2.3

> 현재 상태: 완성된 통합 Control Plane 없음. 기존 `admin.html`, `members.html`,
> `studio.html`과 개별 스크립트가 분산돼 있다. 아래는 PR-11 목표 운영 계약이다.

## 1. 승인 역할

| 역할 | 할 수 있는 일 | 할 수 없는 일 |
|---|---|---|
| Codex/자동화 | diff, fixture, dry-run, 검증 증거, rollback 제안 | 안전·권리·판매·운영 배포 최종 승인 |
| PD | source/rule/flag/reprocess/release 승인 | 사용자 대신 결제·예약·위치 동의 |
| 외부 기관/법무/provider | 이용조건·관할·공식 문구 확인 | 제품 코드 직접 변경 |
| 사용자 | 예약·결제·알림·위치·삭제 최종 통제 | 공식 관측·특보 변경 |

## 2. Source Registry

필수 동작:

1. source 신규/변경/만료 diff 표시
2. terms URL, attribution, region, freshness, rights 행렬 표시
3. test fixture와 영향 레이어 표시
4. `DRAFT→APPROVED/BLOCKED/EXPIRED` 명시 승인
5. actor, reason, approvedAt, effectiveAt, rollbackVersion append-only 기록

`reviewDueAt` 만료 source는 새 publish/export/AI에서 자동 차단하되 기존 공개 결과를
조용히 안전값으로 바꾸지 않는다.

## 3. Quarantine와 재처리

1. 원문 hash·source/time·processorVersion·parse reason을 보존한다.
2. 격리된 원문은 공개 cache로 승격하지 않는다.
3. 새 parser로 dry-run하고 old/new diff와 예상 건수·비용을 보여준다.
4. Safety/region/rights 차이는 일반 값 diff와 분리한다.
5. PD 승인 뒤 명시 범위만 재처리한다.
6. publish manifest와 이전 revision을 남긴다.

## 4. Rule/Profile/Confidence 변경

- version, effectiveAt, source fixture, golden replay를 필수로 한다.
- Safety rule은 공식 근거 URL과 PD 승인이 없으면 배포하지 않는다.
- Activity Profile은 base contribution만 바꾸며 personal delta와 섞지 않는다.
- Confidence 변경은 score를 올리기 위한 보정이 아니라 결측·불일치 설명이어야 한다.
- 긴급 수정도 feature flag와 이전 version을 동시에 준비한다.

## 5. Feature flag

flag마다 owner, environment, cohort, start/end, stop metric, rollback을 둔다.

- permanent temporary flag 금지
- safety/source/time/price/consent/rights의 의미를 실험 flag로 바꾸지 않음
- 해제 시 실제 사용자·reader·cache 사용량 0 확인

## 6. 행동·판매

- 예약·취소·결제·알림은 최신 Safety/price/availability와 사용자 confirmation을 다시 확인한다.
- 서버 receipt가 없으면 성공으로 기록하지 않는다.
- `SALES_OPEN=false`는 checkout 서버에서도 확인한다.
- 창립 멤버 할인은 브라우저 표시가 아니라 checkout 계산에서 검증한다.
- SNS는 사람이 최종 확인해 누른 요청만 처리하며 예약/cron 게시 경로를 만들지 않는다.

## 7. 감사 로그

다음을 원문 비밀·정밀 위치 없이 append-only로 기록한다.

```text
eventId, actorId, role, action, targetType, targetId, beforeRevision,
afterRevision, reason, evidenceRefs, approvedAt, effectiveAt,
rollbackVersion, result, requestId
```

## 8. 현재 P0 안전 운영

8월 16일 전에는 관리자 Control Plane을 구현하지 않는다. PD의 PR-02 직접 지시로 승인 기능이
없는 DRAFT registry와 read-only 평가 엔진만 로컬 구현했다. 현재 허용 범위는 다음과 같다.

- read-only inventory와 fixture 준비
- 사용자/AETHERUS 변경을 보존한 selective diff
- 운영 변경 필요 시 별도 사용자 승인 요청
- `registry.draft.json` 상태 replay. actor/evidence를 만드는 승인 UI·API·DB는 구현하지 않음
