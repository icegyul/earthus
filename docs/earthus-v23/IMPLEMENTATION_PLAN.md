# IMPLEMENTATION PLAN — EARTHUS v2.3

> 기준: 독립 배포 가능한 작은 PR, adapter 우선, feature flag, 실제 화면과 운영 증거
> 통합 제품 코드 earliest start: 2026-08-16 사용량 리셋 확인 후
> 예외: 2026-08-12 PD 직접 지시로 TPW 단독 vertical slice, PR-01 canonical shadow,
> PR-02 governance shadow, PR-03 Earth View State 로컬 코딩 승인. 네 작업 모두 운영 전환은 미승인.

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
| PR-03 | Earth View State (로컬 완료) | existing Cesium state | Earth View/Style/Data/Evidence/Decision URL state | 첫 화면 지구 보존, 공유·뒤로가기 복원; 운영은 별도 gate |
| PR-04 | V0 Readability | PR-03 | 공통 범례·값 라벨·지점 카드·read mode | 기온 대표 지역에서 10초 판독, 원값 대조 |
| PR-05 | Safety Slice | 공식 특보 fixture | KMA warning adapter, region mapping, Hard Gate, CTA | 발표→대치→해제/지연/미매핑 replay |
| PR-06 | Continuous Layers | V0 | 기온·기압·바람·TPW·SST·편차·파고 | 단계색/등치선/값/원값, idle render 0 |
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
- [ ] 2026-08-16 통합 gate 뒤 선택 병합·운영 배포·rollback rehearsal

상세 계약과 실제 증거는 `EARTH_VIEW_STATE.md`가 정본이다. Decision 상태는 후속 PR이
사용할 주소 계약이며 이 PR이 안전·활동·예약 결과를 만들었다는 뜻이 아니다.

## 5. 금지

- PR-01에서 기존 source handler 64개를 한 번에 교체하지 않는다.
- PR-03에서 예쁜 첫 지구를 도시값·등치선으로 자동 덮지 않는다.
- PR-05에서 공식 parser만 만들고 region mismatch/대치/해제 fixture를 미루지 않는다.
- PR-07에서 개인 선호를 Base Activity Score에 넣지 않는다.
- PR-09에서 provider 성공을 추정하거나 예약/취소를 확인 없이 실행하지 않는다.
- PR-10에서 AI가 tool 없이 값·상태를 답하거나 action endpoint를 직접 실행하지 않는다.
- PR-11 전에는 기관용 SLA, 유료 export, 자동화 action을 판매하지 않는다.
