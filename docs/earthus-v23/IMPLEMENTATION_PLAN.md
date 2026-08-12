# IMPLEMENTATION PLAN — EARTHUS v2.3

> 기준: 독립 배포 가능한 작은 PR, adapter 우선, feature flag, 실제 화면과 운영 증거
> 통합 제품 코드 earliest start: 2026-08-16 사용량 리셋 확인 후
> 예외: 2026-08-12 PD 직접 지시로 TPW 단독 vertical slice, PR-01 canonical shadow,
> PR-02 governance shadow, PR-03 Earth View State를 구현했다. 후속 배포 지시로 PR-03와 잠긴
> TPW 정적 계약만 운영 반영했다. 후속 직접 지시로 PR-04 Readability와 PR-05 Safety Slice도
> 구현·운영 반영했다. PR-06 Continuous Layers도 구현·검수·정적 운영 반영했다.
> 후속 직접 지시로 PR-07 Decision Core와 PR-08 Personalization/5축 UI도
> CALIBRATION/SHADOW로 구현했다. TPW flag on·Decision UI 공개·판매·SNS는 미승인이다.

## 1. 공통 PR 형식

모든 PR은 다음을 포함한다.

- 결과: 사용자가 얻는 변화
- scope/non-scope와 AETHERUS 영향
- 변경 파일·schema/API/version/migration
- unit/contract/replay/E2E/visual/accessibility/performance 증거
- source/time/unit/freshness/missing/rights 화면
- 보안·개인정보·비용 영향
- feature flag와 rollback 절차
- 남은 `UNKNOWN/BLOCKED`와 다음 가장 작은 PR

## 2. 순서

| PR | 목표 | Entry | 변경 | Exit |
|---|---|---|---|---|
| PR-00 | Reality & Gap 승인 | 본 P0 문서 | 실제 AWS/Supabase/운영 inventory, ADR 승인, fixture 확보 | 코드 재작성 없이 승인된 실행·승인·전환 지도 |
| PR-00A | TPW 수증기 통로 | PD 단독 예외 승인 | GFS TPW collector, 1° 지역 격자, 단계색·도시값·출처·질문 계약, flag | 계약·문법·지역경계·결측 테스트 통과, 실제 파일·권리·운영 화면 전에는 flag off |
| PR-01 | Signal Foundation (로컬 완료) | PD의 다음 단계 직접 지시 | `EarthSignalEnvelope`, canonical time/CRS/unit/missing, 대표 3 compatibility adapter | fixture·실제 공개 KMA 입력 대조 완료; AWS/shadow reader 전환은 별도 gate |
| PR-02 | Rights/Freshness (로컬 완료) | PD의 다음 단계 직접 지시 | source policy, revision, provider health, standard errors | 20개 상태 replay·실제 KMA 연속검증 완료; 승인·AWS·reader는 별도 gate |
| PR-03 | Earth View State (정적 운영 배포) | existing Cesium state | Earth View/Style/Data/Evidence/Decision URL state | 첫 화면 지구 보존, 공유·뒤로가기·대표 서비스 URL 운영 검증 |
| PR-04 | V0 Readability (정적 운영 배포) | PR-03 | 공통 범례·값 라벨·지점 카드·read mode | 기온 대표 지역에서 10초 판독, 원값 대조 |
| PR-05 | Safety Slice (운영 배포) | 공식 특보 fixture | KMA warning adapter, 근사 region mapping, Hard Gate, CTA | 발표→대치→해제/지연/미매핑 replay |
| PR-06 | Continuous Layers (정적 운영 배포) | V0 | 기온·기압·바람·TPW 계약·SST·편차·파고 | 단계색/등치선/값/원값, idle render 0 |
| PR-07 | Decision Core | PR-05 | Confidence, Base Activity 5 profiles, contribution ledger | deterministic replay와 cache key |
| PR-08 | Personal & UI | PR-07 | bounded personalization, 5축 UI, compare | shared base와 private delta 분리 |
| PR-09 | Reservation Impact | provider contract | diff/dedup/notification/alternative/confirm | 실패·중복·정정·idempotency E2E |
| PR-10 | Live/AI/Fusion | source gate | live query, grounded claims, rule fusion | unsupported claim/action violation 0 |
| PR-11 | Hardening | 전체 slice | a11y/offline/security/tenant/cost/DR/admin/analytics/cutover | release+rollback rehearsal+운영 승인 |

## 3. AETHERUS 병행 규칙

- AETHERUS 개발은 현재 별도 변경으로 계속할 수 있다.
- `tools/verify_celestial_bodies.py`와 AETHERUS scene/photo/mobile 파일은 EARTHUS PR에서
  자동 포맷·일괄 수정하지 않는다.
- 공유할 수 있는 것은 canonical source/time/rights contract, URL state pattern,
  render ownership, accessibility token이다.
- 공유 contract는 먼저 interface/adapter로 정의하고 한 서비스의 구현을 다른 서비스에 복사하지 않는다.
- 통합 PR은 두 서비스 대표 장면과 뒤로가기·해제 timer/network를 함께 검증한다.

## 4. PR-00 완료 체크

- [x] 현재 repo·운영 UI·provider family·환경 gap 문서화
- [x] source handler 64개 + PR-01/02 shadow processor 2개, 전체 66개 고정
- [x] 권리·상업 이용 핵심 gate 공식 재확인
- [x] canonical contract와 golden fixture 정의
- [x] dev/staging/prod gap과 cutover/rollback 정의
- [x] admin/analytics/runbook/test 설계
- [ ] 실제 AWS Lambda/VPC/schedule/provider response inventory
- [ ] 실제 Supabase migration/function/RLS inventory
- [ ] PD의 ADR·retention·비용 guardrail 승인
- [ ] 2026-08-16 사용량 리셋 확인
- [ ] `tpw-grid` 서울 리전 GRIB/ecCodes·S3 객체·NOAA attribution·시각 QA 후 `TPW_READY` 승인

PR-00A의 로컬 collector/unit/contract/문법·NOAA 실 GRIB·데스크톱/모바일 임시 실화면·
flag-off 우회 차단은 통과했다. 위 미완료 항목은 AWS 서울 리전 배포와 운영 승인 gate다.

PR-00은 문서 준비는 끝났지만 위 네 운영 관문 전까지 `APPROVAL_PENDING`이다.

## 4-1. PR-01 로컬 완료와 남은 gate

- [x] `earth.signal.v1`/batch JSON schema와 코드 계약
- [x] KMA 공식 특보·KMA AWS 기온·NOAA GFS TPW 호환 adapter
- [x] 원 writer/reader/UI 불변, `archive/canonical/v1/` 전용 shadow
- [x] CAN-01~08과 격리·권한오류·부분실패·3,276칸 용량 자동검사 12개
- [x] 실제 공개 KMA 입력 29건·736지점 read-only 대조, parser 거절 0
- [x] `archive/`가 익명 공개 bucket policy에서 제외됨을 읽기 전용 확인
- [ ] 서울 리전 Lambda/IAM 최소권한/실제 3 source 처리·익명 GET 403
- [ ] schedule·retention·비용 승인
- [ ] dual-read diff·canary·rollback rehearsal와 authoritative reader 승인

자세한 실행·중단 기준은 `SIGNAL_FOUNDATION.md`가 정본이다. PR-02가 source policy schema를
확장했어도 위 미완료 항목 전에는 운영 canonical을 판단 정본으로 쓰지 않는다.

## 4-2. PR-02 로컬 완료와 남은 gate

- [x] 8개 operation 권리, 4개 policy 상태, 5개 freshness 상태, 3개 provider 상태 계약
- [x] DRAFT registry 3종과 source/governance JSON schema
- [x] 승인 actor·reason·effectiveAt·rollbackVersion·evidenceRefs 필수화
- [x] source/license/terms URL/source URL/attribution drift 차단
- [x] 상태 replay 20개와 PR-01 회귀 12개 통과
- [x] 실제 공개 KMA 특보·AWS PR-01→PR-02 read-only 연속 검증
- [x] 기존 공개 writer/reader/UI/AETHERUS 불변, private shadow 경로만 추가
- [ ] 공식 terms 증거와 PD의 source별 8개 operation 승인
- [ ] append-only 승인 저장소·Control Plane·registry 서명/rollback
- [ ] 서울 리전 최소 IAM·실제 shadow·익명 GET 403·schedule/비용/경보 검증
- [ ] dual-read/canary와 authoritative policy reader 승인

상세 정본은 `RIGHTS_FRESHNESS.md`다. 번들 registry는 계속 `DRAFT`이며 코드에 적힌
제안 권리를 승인으로 간주하지 않는다.

## 4-3. PR-03 로컬 완료와 남은 gate

- [x] query 없는 첫 방문을 Earth View로 고정
- [x] Style/Data/Evidence/Decision v1 URL encode/decode와 충돌 없는 접두어
- [x] 잘못된 version/view/layer/point의 안전한 이전 단계 fallback
- [x] `TPW_READY=false` 등 잠긴 레이어의 URL 우회 차단
- [x] 좌표 약 1km 제한과 의미 단계별 push/동일 단계 replace
- [x] Earth↔Style↔Data↔Evidence 뒤로/앞으로·새로고침 실화면 복원
- [x] 데스크톱과 390×844 첫 Earth/Data URL 확인
- [x] 동시 AETHERUS route v3 계약·시험 동기화와 foundation/astronomy/photo 회귀 통과
- [ ] 430×932/768×1024/1280×720/1440×900, Safari, 구형 iPhone
- [ ] 레이어/장면 해제 뒤 timer/network/render owner 0 계측
- [x] 선택 병합·cache revision·정적 운영 배포·15개 파일 live hash·대표 URL 검증
- [ ] 실제 구형 iPhone·Safari와 rollback 복구 rehearsal

상세 계약과 실제 증거는 `EARTH_VIEW_STATE.md`가 정본이다. Decision 상태는 후속 PR이
사용할 주소 계약이며 이 PR이 안전·활동·예약 결과를 만들었다는 뜻이 아니다.

## 4-4. PR-04 정적 운영 배포와 남은 gate

- [x] query 없는 첫 지구에서 판독 패널·도시 숫자·참조 지도 0
- [x] 연속 격자의 전체 색 경계·단위·유효시각·해상도·유효 원격자 `n`
- [x] 카메라 지평선·캔버스 안·화면 충돌을 통과한 도시의 최근접 원격자값
- [x] 지점 좌표·값·단위·시각·출처 Evidence 카드와 URL 새로고침 복원
- [x] `earthRead=1`, Earth 복귀, 레이어 해제 시 참조 타일·라벨 해제 계약
- [x] Esri 참조 지도의 화면 attribution과 display-only 권리 경계
- [x] 390×844/430×932/768×1024/1280×720/1440×900 overflow 0 실화면
- [x] 자동검사 16/16, Earth route 12/12와 TPW/AETHERUS 회귀
- [x] 운영 정적 배포·live SHA-256·대표 URL·유효 경로 warning/error 0
- [ ] Safari·구형 iPhone 실제 기기, idle/released render owner 계측

상세 계약은 `READABILITY_FOUNDATION.md`, 운영 증거는 `RELEASE-2026-08-12-PR04.md`다.
등치선은 PR-04 범위가 아니며, PR-06에서
연속장별 간격·결측·성능을 따로 승인하기 전 점 관측이나 결측을 보간하지 않는다.

## 4-5. PR-05 운영 배포와 남은 gate

- [x] KMA 발표/대치/해제/해제예보 연장 command와 revision 보존
- [x] 최근접 공식 station-zone 근사와 exact source `regionId` Hard Gate
- [x] 특보 0/위치 없음/region unmapped/45분 초과 지연을 `UNKNOWN`으로 표시
- [x] `activityAllowed=false`, `blocksPositiveRecommendation=true`, `safeClaimAllowed=false`
- [x] source/time/license/전국 active `n`, 매핑 한계, 44px 공식 CTA 화면 계약
- [x] JS 23개·Python 5개 replay, 실제 KMA exact match, desktop/mobile/AETHERUS 회귀
- [x] 서울 Lambda snapshot v2와 정적 8개 파일 운영 배포·live hash 대조
- [ ] 공식 warning polygon/hierarchy fixture와 authoritative mapping
- [ ] 한국 밖 현지 공식 warning provider
- [ ] PR-01/02 canonical/governance authoritative reader 전환

상세 계약은 `SAFETY_SLICE.md`, 운영 증거는 `RELEASE-2026-08-12-PR05.md`다. 위 미완료
mapping/provider 범위에서는 Safety Engine이 SAFE나 CLOSED를 만들지 않는다.

## 4-6. PR-06 운영 배포와 남은 gate

- [x] 기온·내일 최고/최저·기압·바람·TPW 계약·SST·편차·파고 단계색
- [x] 같은 연속 원격자만 쓰는 마칭 스퀘어, 결측 칸 제외, 날짜변경선 seam 계약
- [x] 등치선 값 라벨, 도시 최근접 원격자값, 지점 Evidence, source/time/unit/n/missing
- [x] 기압 동아시아 1° 전용판·4hPa·H/L, 바람 u/v 크기 m/s 색면과 방향 입자 분리
- [x] SST/파고 동아시아 0.5° 보강판, 편차는 동일 5° 실황/평년장만 계산
- [x] query 없는 첫 지구 수치/등치선 0, 모든 연속 색면 한 장만 유지
- [x] 자동검사 40/40와 PR-03/04/05·AETHERUS 회귀
- [x] 데스크톱/390×844 실화면, 모바일 overflow 0, 단독 바람 활성층 1개, 정지 3초 추가 render 0
- [ ] Safari·구형 iPhone 실제 기기 10~15분 열/배터리
- [ ] TPW 서울 리전 객체·권리·화면 검수 뒤 별도 `TPW_READY=true` 승인

상세 계약은 `CONTINUOUS_LAYERS.md`, 배포 증거는 `RELEASE-2026-08-12-PR06.md`다.
TPW는 공통 표현 엔진과 테스트만 포함하며 운영 객체
403 상태에서 flag를 켜지 않았다. 점 관측·위성 영상·재난 점은 이 등치선 엔진에 넣지 않는다.

## 4-7. PR-07 Decision Core shadow와 남은 gate

- [x] 6차원 Forecast Confidence와 단일 source agreement `UNKNOWN`
- [x] 야구 관람·캠핑·야외 풋살·등산·별보기 5개 versioned Base profile
- [x] raw/unit/normalized/weight/points/signal/reason/basis contribution ledger
- [x] Safety가 100점 Base보다 먼저 추천을 제한하는 5축 결과 계약
- [x] 필수 결측·중복·unit/range/timezone 오류와 개인화 입력 fail-closed
- [x] Safety/Confidence/Crowd/Availability revision까지 포함한 deterministic cache key
- [x] GS-06~10 합성 replay, 자동검사 31개, 10,000회 benchmark
- [x] `CALIBRATION_SHADOW`, `DECISION_CORE_READY=false`, live provider/UI/network 0
- [x] 순수 ES module 3개 shadow 운영 배포·live hash/import/golden replay
- [ ] profile 곡선·weight·하산 여유 도메인 승인과 effective/rollback version
- [ ] 활동별 공식 운영·취소·폐쇄 provider와 한국 밖 Safety provider
- [ ] live weather/AQ source rights·freshness·서울 리전 network gate
- [x] PR-08 private delta와 5축 shadow UI 실제 화면·접근성 검수

상세 계약은 `DECISION_CORE.md`, 배포 증거는 `RELEASE-2026-08-12-PR07.md`다. 높은 합성
점수는 품질 시험일 뿐 관측·예보·추천이 아니며,
위 미완료 항목 전에는 public entry가 이 엔진을 import하거나 긍정 추천을 만들지 않는다.

## 4-8. PR-08 Personalization/5축 UI shadow와 남은 gate

- [x] `PUBLIC_SHARED_BASE` 불변과 `USER_SCOPED_PRIVATE` bounded delta 분리
- [x] 명시적 동의·명시적 preference만 허용하고 추론·민감정보 fail-closed
- [x] ±12 초기 후보, raw/bounded/cap/contribution/revision ledger
- [x] private key hash, TTL ≤300초, `private, no-store`, 원 subject 비노출
- [x] Safety→Activity→Confidence→Crowd→Availability 고정 순서
- [x] UNKNOWN 보존, 개인화 끄기, same-profile/time 비교, winner 없음
- [x] source/time/revision/n, 쉬운 사유 문장, 44px/Escape/focus 계약
- [x] 자동검사 30개와 4개 viewport 실제 화면·flag-off entry 검수
- [x] `DECISION_CORE_READY=false`, live adapter·사용자 저장·예약 action 0
- [ ] ±12 사용자 연구·분포·공정성 검증과 policy freeze
- [ ] consent/preference 저장·철회·삭제, RLS/tenant·보존정책
- [ ] live source/공식 폐쇄·운영 provider·한국 밖 Safety E2E
- [ ] Safari·구형 iPhone·screen reader·canary/rollback rehearsal
- [ ] PD의 공개 flag 전환 승인

상세 계약은 `PERSONALIZATION_UI.md`, shadow 배포 증거는 `RELEASE-2026-08-12-PR08.md`다.
구현과 반응형 UI 검수 완료는 공개 추천 승인이 아니다.
위 미완료 항목 전에는 flag를 켜거나 실제 사용자 선호를 저장하지 않는다.

## 5. 금지

- PR-01에서 기존 source handler 64개를 한 번에 교체하지 않는다.
- PR-03에서 예쁜 첫 지구를 도시값·등치선으로 자동 덮지 않는다.
- PR-05에서 공식 parser만 만들고 region mismatch/대치/해제 fixture를 미루지 않는다.
- PR-07에서 개인 선호를 Base Activity Score에 넣지 않는다.
- PR-09에서 provider 성공을 추정하거나 예약/취소를 확인 없이 실행하지 않는다.
- PR-10에서 AI가 tool 없이 값·상태를 답하거나 action endpoint를 직접 실행하지 않는다.
- PR-11 전에는 기관용 SLA, 유료 export, 자동화 action을 판매하지 않는다.
