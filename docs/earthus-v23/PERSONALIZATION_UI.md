# PERSONALIZATION + 5-AXIS UI — EARTHUS v2.3 PR-08

> 상태: 순수 개인화 엔진·Safety-first 5축 UI·비교 화면 구현/검수 완료.
> 공개 상태: `CALIBRATION_SHADOW`, `DECISION_CORE_READY=false`, live adapter·사용자 저장 미연결.

## 1. 이번 결과

PR-08은 PR-07의 `PUBLIC_SHARED_BASE`를 변경하지 않고, 사용자가 직접 고른 취향만
`USER_SCOPED_PRIVATE` delta로 계산한다. 화면은 안전→활동 적합도→예보 자료 신뢰도→혼잡→
예약 가능성 순서로 읽으며, 다섯 축을 하나의 승자 점수로 합치지 않는다.

공개 앱 entry에는 동적 import 지점만 추가했다. `DECISION_CORE_READY`가 명시적으로 `true`일
때만 UI JS/CSS와 listener를 만들며, 현재 운영 flag는 false/undefined다. 따라서 첫 화면의
예쁜 지구본과 기존 메뉴에는 새 DOM·CSS·network가 생기지 않는다.

## 2. Base와 Personal Delta 경계

```text
place + time + activity + verified signals
                 ↓
       PUBLIC_SHARED_BASE (PR-07)
                 ↓
    Safety-first 5-axis decision

explicit preference + explicit consent + opaque subject ref
                 ↓
  USER_SCOPED_PRIVATE delta (PR-08, max candidate ±12)
```

- 최종 후보값: `clamp(baseScore + boundedDelta, 0, 100)`
- ±12는 제품 확정값이 아니라 사용자 연구·분포 검증 전 초기 후보다.
- 원 delta, bounded delta, cap 적용 여부, 항목별 점수·revision을 모두 남긴다.
- 개인화는 Safety, 공식 폐쇄, Forecast Confidence, Crowd, Availability를 바꾸지 않는다.
- Base object와 public cache key는 개인화 전후에 같아야 한다.

## 3. 동의·개인정보·cache

- `earthus.personalization-consent.v1`의 명시적 `GRANTED`와 UTC `grantedAt`이 필요하다.
- 판단 `evaluatedAt`보다 나중에 받은 동의를 과거 결과에 소급하지 않는다.
- preference source는 `EXPLICIT_USER_INPUT`만 허용한다.
- 클릭 이력, 행동 프로필, 건강, 장애, 임신, 종교, 정치 성향, 정밀 위치 이력, 자유 서술
  프로필을 추론·입력·저장하려 하면 계산을 거절한다.
- subject는 이메일·원 사용자 ID가 아닌 `sub_...` opaque reference만 받는다.
- private key는 subject/base/policy/preference revision으로 만든 비가역 해시이며 원 subject를
  노출하지 않는다.
- TTL 후보는 최대 300초, 응답 계약은 `Cache-Control: private, no-store`다.
- 사용자 off는 Base를 그대로 보이며 delta를 0으로 간주한다.

현재는 동의·설정 저장소를 연결하지 않았다. 공개 전에는 consent 획득·철회·삭제·기기 간 동기화,
RLS/tenant 경계, 보존기간, 감사 로그를 별도 승인해야 한다.

## 4. 5개 profile과 허용 취향

| profile | 명시적으로 고를 수 있는 항목 |
|---|---|
| 야구 관람 | 더위·추위·비·바람·습도·선호 시간 |
| 캠핑 | 더위·추위·비·바람·습도·선호 활동 시간 |
| 야외 풋살 | 더위·추위·비·바람·대기질·선호 시간·활동 시간 |
| 등산 | 더위·추위·비·바람·대기질·선호 시간·활동 시간 |
| 별보기 | 비·습도·맑은 하늘 우선·선호 시간·활동 시간 |

각 profile에 없는 항목, 중복 항목, revision/source/level 오류, 12개 초과 payload는 일부만
선택하지 않고 개인화 전체를 `UNKNOWN`으로 둔다. timezone offset도 추측하지 않는다.

## 5. 화면 계약

1. Safety 카드는 항상 첫 번째이며 전체 폭을 차지한다.
2. 공식 경고와 근거가 있으면 높은 Base score보다 먼저 추천을 제한한다.
3. Crowd/Availability 자료가 없으면 `확인할 자료 없음`이며 0·한산·예약 가능으로 바꾸지 않는다.
4. Forecast Confidence는 `맞을 확률`이 아니라 자료 품질이라고 화면에 고정한다.
5. Base 점수와 내 취향 반영값·항목별 delta를 분리해 보이며 사용자가 끌 수 있다.
6. 비교는 같은 profile과 같은 UTC time window만 허용하고 단일 winner를 계산하지 않는다.
7. 비교 셀에도 축별 source/time/revision/n을 표시한다.
8. 닫기·개인화 끄기 target은 44×44px 이상이며 Escape, focus return, focus-visible을 지원한다.

UI는 fetch, 예약/결제/취소 action, timer, animation, Cesium render를 만들지 않는다. 검증용
화면은 합성 자료임을 고정 표시하며 `tools/fixtures/`에만 있고 운영에 배포하지 않는다.

## 6. 검증 결과

- 개인화·UI contract 30/30
- Activity Decision 31/31
- Safety Engine 23/23
- Earth route 12/12, Readability 16/16, Continuous Layers 40/40, TPW PASS
- 390×844, 430×932, 768×1024, 1280×900: overflow 0, Safety first, 44px target,
  UNKNOWN 보존, personal off/on, compare no-winner, console error 0
- production-like local entry: flag off에서 UI JS/CSS request 0, host DOM 0, Earth container 1
- 네 순수 module `node --check`, `git diff --check` 통과

## 7. 공개 전 남은 gate

1. PR-07 profile 곡선/weight 도메인 승인과 version freeze
2. ±12 후보의 사용자 연구·분포·공정성 검증과 rollbackVersion 승인
3. 명시적 preference/consent 저장·철회·삭제 UX, RLS/tenant·보존정책 검증
4. 활동별 공식 운영/폐쇄와 한국 밖 Safety, live weather/AQ source 권리·freshness 승인
5. 실제 source adapter가 source/time/revision/n을 보존하는 E2E
6. Safari와 구형 iPhone 실제 기기, screen reader, 10~15분 열/배터리 검수
7. canary/rollback rehearsal와 PD의 `DECISION_CORE_READY=true` 명시 승인

위 관문 전에는 공개 추천·자동 대안·예약 행동·개인화 저장을 열지 않는다.

## 8. Rollback

현재 flag가 꺼져 있으므로 가장 작은 rollback은 `index.html`과 `main.js`를 직전 검증 object
version으로 복원하고 두 경로를 무효화하는 것이다. 개인화/UI module을 삭제하지 않는다.
공개 전환 뒤 rollback이 필요하면 flag를 먼저 false로 되돌려 entry를 차단한 다음, 검증된
object version을 같은 Content-Type과 `no-cache`로 복원한다.
