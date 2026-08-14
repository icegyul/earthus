# Earthus Ocean + Aetherus v3.0 제작 실행 기준선 — 2026-08-14

## 결론

`EARTHUS_AETHERUS_MASTER_DEVELOPMENT_SPEC_v3.0.docx`를 Aetherus 정본으로,
`EARTHUS_Ocean_Verticals_Development_Guide_v1.0.docx`를 Earthus Ocean 제품 정본으로 사용한다.
두 문서는 하나의 제작 계획에서 관리하지만 제품 경계는 합치지 않는다. Aetherus 296개
Implementation Sheet와 Ocean 0–51장은 현재 저장소의 구현·검증 증거에 먼저 연결하고,
증거가 없는 차이만 작은 배치로 구현한다.

2026-08-15 정정: 이전의 `AETHERUS_LOCAL_SCOPE_COMPLETE` 판정은 철회한다. 계약 모듈·fixture·
단위 테스트가 있다는 사실을 실제 제품 구현·배포 완료로 잘못 집계했다. 현재 원장은
`VERIFIED_EXISTING 181 / PARTIAL_RUNTIME 15 / BLOCKED_EXTERNAL 100`이며,
`VERIFIED_EXISTING`도 로컬 증거일 뿐 완료 판정이 아니다. Mission Control은 실제 사용자 화면과
브라우저 검증이 연결됐지만 sheet 전체가 닫히지 않아 `PARTIAL_RUNTIME`이다. Ocean은 공개 경로와
심해 조종 화면을 실제 브라우저로 재검증하되 provider 권리·운영 freshness·서버/RLS gate는 유지한다.

2026-08-14 PD 결정에 따라 `MONETIZATION_MODE=FREE_OPEN`을 적용한다. PD가
"유료서비스 시작하자"라고 명시하기 전까지 준비된 Ocean·Aetherus 기능은
모두 무료다. 다만 provider 미연결, 권리·안전·개인정보·운영 미준비 gate는
무료 여부와 관계없이 유지한다. 정본은
`docs/earthus-v23/FREE-ACCESS-POLICY-2026-08-14.md`다.

## 제품 목적과 경계

- Earthus는 우리가 사는 지구의 공식·공공 자료를 출처와 관측 시각과 함께 읽는 영역이다.
- Ocean은 Earthus 안에서 바다 상태를 읽고 서핑·낚시·해양생물·다이빙 기록을 연결하는
  병렬 제품 트랙이다. Aetherus의 하위 메뉴나 우주 기능으로 만들지 않는다.
- Aetherus는 실제 천문 위치·관측·미디어 provenance를 바탕으로 우주를 탐험하고, 사용자가
  자신의 관측 기록과 관제 구성을 소유하는 영역이다.
- 첫 Earth는 빠르고 조용하게 유지한다. 무거운 Aetherus 자산은 사용자 선택 뒤에만 읽는다.
- 관측, 계획, 추정, 교육용 도식과 렌더링은 서로 다른 상태로 표시한다.

## 정본과 입력 무결성

| 입력 | 확인 결과 |
|---|---|
| Master DOCX | ZIP 안 파일과 외부 원본 SHA-256 일치, 328쪽 |
| Rendered PDF | ZIP 안 파일과 외부 원본 SHA-256 일치, 328쪽 |
| Implementation index | 296개, Sheet 001–296 연속 |
| Master checklist | 미완료 항목 296개, index와 개수 일치 |
| Companion artifacts | API, data model, media, launch/satellite, Mission Control, visionOS, Apple 배포 포함 |
| UI reference | 구조·밀도·반응형 방향의 승인 참고 이미지. 화면 속 수치는 fixture/예시이며 LIVE 근거가 아님 |
| Ocean Verticals DOCX | SHA-256 `3725d877abf078a1efa5a08ae5e4f8e663d8a492d1db2269b51568d3de8f457a`, 53쪽, 0–51장, 표 39개, comment/tracked change 없음 |

해제본은 `work/aetherus-v3.0-master-package/`에 격리했다. 원본 ZIP과 외부 DOCX/PDF는
수정하지 않았다. Ocean 가이드 원본도 외부 경로에서 읽기 전용으로 사용하고 수정하지 않았다.

## 보호할 동작

1. 수치, 좌표, ephemeris, 권리, provider 필드를 만들거나 추정하지 않는다.
2. 모든 최신성 민감 값은 source와 UTC 기준 시각을 추적한다.
3. `loading / ready / stale / unavailable`을 구분하고 결측을 0이나 정상으로 바꾸지 않는다.
4. `clampToGround`와 소유한 무한 애니메이션을 추가하지 않는다.
5. 첫 Earth, Earthus/Aetherus route 분리, 사진 credit/provenance, 사용자 위치 비공개 기본값을
   회귀 보호한다.
6. 권리·위험·개인정보 hard gate는 fallback과 유료 기능보다 우선한다.
7. 서버 entitlement 없이 UI만으로 유료 기능을 열지 않는다.
8. 판매, 알림 발송, 결제, SNS 자동 게시, 운영 AI, 원격 장비 명령은 명시적 외부 gate 전까지
   닫아 둔다.
9. 조위에는 관측소·기준면을, 해류·파도·수온에는 수심·격자·관측/예보 상태를 보존한다.
10. 낚시 조과를 보장하거나 조위에서 조류를 만들지 않고, 안전자료가 없으면 활동 점수는
    `UNKNOWN/null`로 둔다.
11. 개인 낚시 포인트, 사진 EXIF GPS, 민감종 위치는 서버에서 비공개·일반화 정책을 적용한다.
12. AIS는 coverage·freshness·license를 모두 통과한 범위만 표시하며 미지원 지역에 위치나
    항적을 만들지 않는다.

## 현재 코드 기준선

2026-08-14 로컬 기준선에서 다음 Aetherus 회귀가 통과했다.

- AI evidence, astrometry, astronomy, citizen science, community safety
- device QA contract, foundation/route v3, hardening, mission replay
- observation media/planner/session, personal universe, photo ownership
- plugin sandbox, remote observatory Safe Hold, Sky AR
- HST/JWST 사진 좌표·출처·credit, 우주선 도식 한계와 JPL epoch 검증
- iPhone 근사 세로 402×754: 1열, 가로 overflow 0
- iPhone 근사 가로 754×402: 2열, 가로 overflow 0, camera 426×240

이 통과는 자동·로컬 브라우저 기준선이다. 실제 iPhone Safari, VoiceOver, 센서, 배터리·발열,
운영 Supabase principal A/B, 물리 관측소 HIL을 대신하지 않는다.

현재 저장소에는 해양 레이어, 부이·파고·수온, 서핑·낚시 UI, 심해 수심·해구 장면과 일부
해양 수집기가 이미 있다. 이 코드는 Ocean v1.0 완료로 간주하지 않는다. 전용 Ocean Core,
Fishing/Surf decision, 개인 위치, Marine Life visibility saga, Control Center revision/conflict,
Vessel license/coverage gate를 로컬 섀도우로 구현했다. 0–51장 판정은
`OCEAN_CHAPTER_LEDGER.md`, OT-001–015 증거는 `OCEAN_OT_MATRIX.md`에 연결했다. 공개·운영
완료로 판정한 장은 없으며 server/provider/device 증거가 없는 항목은 `PARTIAL` 또는
`BLOCKED_EXTERNAL`로 유지한다.

## 첫 개발 배치

### 배치 V3-00 — 296시트 추적성과 갭 분류

**목표**

각 Sheet를 `VERIFIED_EXISTING / IMPLEMENT / BLOCKED_EXTERNAL / NOT_APPLICABLE` 중 하나로
분류하고, 판정마다 코드·테스트·운영 증거 또는 차단 근거를 연결한다.

**현재 결과**

296개 시트 전부를 `docs/earthus-v23/AETHERUS_V3_SHEET_LEDGER.{json,md}`에 연결했다.
현재 분포는 `VERIFIED_EXISTING 181 / PARTIAL_RUNTIME 15 / IMPLEMENT 0 /
BLOCKED_EXTERNAL 100 / NOT_APPLICABLE 0`이다. `VERIFIED_EXISTING`은
`productionStatus=LOCAL_EVIDENCE_ONLY`, Mission Control 사용자 화면 범위는
`productionStatus=PARTIAL_RUNTIME`이며, 원장은
`tools/build_aetherus_v3_ledger.mjs`로 정본 index에서 재생성된다.

첫 신규 구현 묶음은 Sheet 151–163 Culture Layer다. 실제 작품 사실 대신 합성 fixture로
CultureReference 7종, 관계 5종, 권리 gate, 공식 링크/embed, 자체작성 설명, 출처 검증,
검색·timeline·stale fallback을 구현하고 `tools/test_aetherus_culture.mjs`로 검증했다. 실제
Culture catalog·권리·moderation·공개 UI는 외부 gate다.

두 번째 신규 묶음은 Sheet 115–132 My Mission Control이다. 중앙 Earth 우선, 15개 widget
type, 4개 room template, revision/KEEP_BOTH, mobile/tablet/desktop layout, official-fresh
Mission Mode, widget freshness와 keyboard command를 로컬 계약으로 구현했다. Sheet 126 sync,
130 알림센터, 132 유료 gate는 운영 server/entitlement 증거가 없어 `BLOCKED_EXTERNAL`이다.

세 번째 신규 묶음은 Sheet 137–140, 239–240, 281 Media Rendition이다. private immutable
source에서 512/1920/3840, AVIF→WebP→JPEG, Deep Zoom plan, backpressure, explicit retry,
dead-letter, checksum receipt를 로컬 계약으로 구현했다. 실제 pixel worker·encoder·queue·storage와
운영 policy는 계속 닫혀 있다.

네 번째 신규 묶음은 Sheet 65–78, 82–90, 282–283 Launch·Payload다. 10개 launch state,
planned/live/estimated/last-confirmed 분리, 실패점 정지, 1:N payload, 8개 payload state,
official NORAD 후행 매칭을 로컬 계약으로 구현했다. 실제 schedule/telemetry/live/알림 provider는
미연결이다.

다섯 번째 신규 묶음은 Sheet 91–101 SatelliteObject다. NORAD·International Designator,
status evidence, orbit classification source/epoch/freshness, 계산 position·ground track·private-location
pass와 4개 명시 filter를 로컬 계약으로 구현했다. 계산값을 LIVE/관측값으로 표시하지 않으며 실제
TLE/OMM provider·SGP4 golden·위치 RLS·알림은 미연결이다.

여섯 번째 신규 묶음은 Sheet 215–218 API contract다. `/api/v1` REST naming, opaque cursor,
error/request-id envelope, actor 격리 idempotency replay/conflict/expiry, strong ETag 304와 server-injected
rate-limit header를 구현했다. 운영 server middleware·영속 store·quota policy는 미연결이다.

일곱 번째 묶음은 Sheet 006, 008, 010, 011, 014–018, 021–023 공통 운영 계약이다. 외부
미디어 권리, entitlement fail-closed, 접근성·timezone, provider envelope, ingestion receipt,
analytics 개인정보 제거, feature/config/secrets 경계를 구현했다. 실제 auth·queue·vault·observability는
미연결이다.

여덟 번째 묶음은 Sheet 043, 047, 050, 056, 061 Discovery다. Earth/Space 검색, 명시적
catalog relation 기반 추천, 좌표·token 없는 공유 링크, telescope provider registry를 구현했다.
실제 catalog·검색 index·provider 약관은 미연결이다.

아홉 번째 묶음은 Sheet 102–114 Spotlight다. 국가/조직 hub, 한국 locale, 누리호·CubeSat·Falcon,
booster·Starship·Starlink history, follow와 증거 있는 editorial override를 구현했다. Sheet 105/108의
live telemetry·일정/착륙 운영 증거는 계속 외부 차단이다.

열 번째 묶음은 Sheet 219–245 Database·Infrastructure다. 24개 table registry, RLS/rights/
append-only/index/retention, cache/storage/checksum, metric provenance, autoscaling proposal,
provider circuit/retry와 incremental/full-resync plan을 구현했다. SQL migration과 cloud resource는
생성하지 않았다.

열한 번째 묶음은 Sheet 250, 252–256, 260–262 Rights·Security·Privacy·Moderation이다.
press-use/embed-only, raw-token 금지, signed URL plan, RBAC, 신고 queue, malware quarantine,
takedown/incident audit workflow를 구현했다. 실제 OAuth·scanner·운영 인력은 미연결이다.

열두 번째 묶음은 Sheet 279, 284, 286, 291, 295 QA·Release다. schema/cache, Mission Control/
subscription, Sky direction/Vision state, timezone/DST와 data rollback/hotfix 증거 matrix를 만들었다.
모든 실행 plan은 자동 배포·자동 삭제를 금지한다.

**산출물**

- 296개 시트 상태 ledger
- 기존 구현 재사용표와 실제 신규 갭 목록
- 첫 `IMPLEMENT` 시트의 domain + API + UI/fallback + test 묶음
- 배치별 release/rollback 범위

현재 산출물: ledger 296/296 (로컬 증거 181, 부분 런타임 15, 외부 차단 100),
12개 local-shadow 배치, Ocean 0–51장/OT-001–015 원장과 O0–O6 계약/테스트.
최종 로컬 인수 결과는
`docs/earthus-v23/EARTHUS_OCEAN_AETHERUS_V3_LOCAL_CLOSEOUT_2026-08-14.md`에 기록한다.

**완료 조건**

- 모든 판정에 파일, 테스트 또는 외부 차단 근거가 있다.
- `VERIFIED_EXISTING`은 테스트를 현재 HEAD에서 재통과한다.
- `IMPLEMENT`는 정상·결측·stale·provider 실패·권한 거절을 함께 검증한다.
- 변경 파일만 선별해 문법·회귀·실화면을 확인한다.
- 배포는 PD가 공개를 지시한 코드 배치에 한하며, Content-Type, cache control, CloudFront
  무효화와 live/local SHA를 남긴다.

## Ocean Verticals 제작 트랙

### 제품 범위

| 우선순위 | 모듈 | v1 범위 | 완료 전 외부 gate |
|---|---|---|---|
| P0 | Ocean Core | 지도·시간·출처·안전·캐시·정규화 API | provider 권리·freshness |
| P0 | Fishing | 물때·조류·수온·파고·바람·개인 포인트·조과 기록 | 조위 기준면·개인 위치 정책 |
| P0 | Surf | 포인트·72시간 조건·숙련도별 점수·세션 | 임계값 승인·알림 발송 승인 |
| P0 | Marine Life | 종·관찰·검증·사진·개인 도감 | 분류 정본·민감종 정책·moderation |
| P1 | Dive 연동 | 기존 수심·해구·다이빙 기록과 사진 연결 | 실제 장비 로그 계약 |
| P1 | My Ocean Control Center | 읽기/기록 위젯·동기화 계약 | 서버 entitlement·멀티디바이스 증거 |
| P2 | Vessel Lite | 허용 지역·정적정보·과거 데모·외부 추적 링크 | AIS 재표시·캐시·이력 라이선스 |

### 구현 순서와 종료 조건

1. **O0 Foundation — Ocean Core**
   - `OceanObservation` 정규화 schema와 provider manifest를 기존 Earth data contract에 맞춘다.
   - source, observed/valid time, provenance, quality, depth, 좌표·단위를 API와 UI에서 보존한다.
   - 낙뢰·태풍·공식 통제·극단 파고·핵심자료 stale hard gate가 점수보다 먼저 동작한다.
   - 종료: 정상·stale·unavailable·결측·provider 실패 fixture와 지도 기본 화면 통과.
   - 현재: 계약·manifest·hard gate·OT-001/002 fixture 및 실데이터 전체 재생은
     `LOCAL_SHADOW_COMPLETE`. 공개 reader/UI와 provider 권리·운영 freshness·공식 안전 source는
     미연결이므로 O0 전체 종료 조건은 미충족.
2. **O1 Fishing MVP**
   - 물때·조류·수온·파고·바람을 같은 장소·시간으로 정렬하고, 조과 보장 표현을 차단한다.
   - 개인 포인트는 exact/blurred/region/none 정책을 서버와 공유 API에 적용한다.
   - 종료: 한국 주요 포인트 베타, OT-002·004와 hard gate 통과.
   - 현재: tide/current 단위·datum 분리, 조과 보장/예약 CTA 차단, 위치 audience 계약은
     `LOCAL_SHADOW_COMPLETE`; 실제 포인트 정본·RLS·공개 UI는 미연결.
3. **O2 Surf MVP**
   - 포인트 방향, 파고·주기·파향·바람·조위·수온을 72시간 타임라인에 연결한다.
   - 점수는 입력 해시·confidence·explanation을 보존하고 안전 gate에서 null이 된다.
   - 종료: 비교·세션 스냅샷·중복 없는 알림 계약, OT-001·003 통과.
   - 현재: 승인 fixture에서 72시간×9 metric 정렬·점수 설명과 안전 null은 완료. 운영 scoring
     policy는 `DRAFT`, session 저장·알림 전송·공개 UI는 미연결.
4. **O3 Marine Life**
   - 사진 원본 private, 320/640/1280/2048 파생본, visibility 전환과 CDN purge를 구현한다.
   - AI 제안은 검증이 아니며 민감종 좌표는 서버에서 일반화한다.
   - 종료: PRIVATE→PUBLIC→PRIVATE, OT-005–008·015 통과.
   - 현재: 30MB metadata, 4 파생본, human taxonomy, moderation, purge/403 계약은
     `LOCAL_SHADOW_COMPLETE`; 실제 worker·bucket·CDN·moderator principal은 미연결.
5. **O4 My Ocean Control Center**
   - Surf/Fishing/Marine Life/Dive/Safety/Vessel 템플릿과 통합 기록을 공통 layout schema에
     연결하되 Aetherus Mission Control의 데이터 모델과 섞지 않는다.
   - 종료: 멀티디바이스 동기화, 구독 만료 뒤 읽기·내보내기·삭제 권리 보존.
   - 현재: revision, idempotency, stale device KEEP_BOTH, owner 경계와 구독 만료 권리는
     `LOCAL_SHADOW_COMPLETE`; durable DB·server entitlement·실제 멀티디바이스는 미연결.
6. **O5 Vessel Lite**
   - `LIVE / DELAYED / HISTORICAL / EXTERNAL / UNAVAILABLE`을 수신·관측 시각과 함께 표시한다.
   - 자체 AIS가 없어도 허용된 공개 범위와 외부 링크로 시작하되 실시간처럼 판매하지 않는다.
   - 종료: license audit, OT-009·010, 미지원 지역 가짜 마커 0.
   - 현재: LIVE/DELAYED/HISTORICAL/EXTERNAL/UNAVAILABLE, bbox/zoom/result limit과 OT-009/010은
     `LOCAL_SHADOW_COMPLETE`; 운영 provider slot은 모두 `DRAFT + OFF`.
7. **O6 Expansion**
   - 예약·글로벌 AIS·B2B는 관심, 비용, 계약, 기술, SLA gate가 모두 열린 항목만 시작한다.
   - 현재: G1–G5 evidence가 모두 null인 `BLOCKED_EXTERNAL`; 관련 production capability는 전부 false.

### Aetherus와 공유하는 기반 / 공유하지 않는 상태

| 공유 가능 | 공유 금지 |
|---|---|
| 인증·서버 entitlement·사용자 삭제/내보내기 | Aetherus 천체·관측·ephemeris 도메인 |
| immutable 원본·파생 이미지·checksum·CDN purge | Ocean 활동 점수와 우주 관측 계획 점수 |
| provenance·rights·freshness·provider health | My Ocean과 My Mission Control의 저장 상태 |
| layout schema와 반응형·접근성 원칙 | Ocean URL과 Aetherus route 상태 |
| notification dedup·감사로그·request ID | Ocean 안전 gate와 우주 원격장비 Safe Hold |

Ocean 트랙도 각 작업을 `domain + API + UI/fallback + tests` 한 묶음으로 닫는다. 기존
`surf.js`, `fishing.js`, 해양 레이어·수집기·심해 장면은 재사용 후보이며, 문서와 테스트 없이
기존 코드가 있다는 이유만으로 완료 처리하지 않는다.

## 중단·결정 gate

- provider 계약/권리 승인 없이 live adapter를 연결하지 않는다.
- 운영 DB migration과 두 독립 JWT 증거 없이 private-data 완료를 선언하지 않는다.
- 실제 계정·비용·평가셋·red-team 승인 없이 운영 AI를 연결하지 않는다.
- 물리 dome/mount/E-stop 검증 없이 원격 명령을 연결하지 않는다.
- 실기기와 rollback 증거 및 PD의 명시 승인 없이 메인 공개 flag를 열지 않는다.
- 조위 기준면·해류/파고 source가 불명확하거나 critical safety가 stale이면 Ocean 점수와
  출발·예약 CTA를 열지 않는다.
- 민감종 정책과 서버 좌표 일반화 증거 없이 공개 관찰 지도를 열지 않는다.
- AIS 라이선스와 coverage/freshness 판정 없이 선박 위치·항적·알림을 열거나 판매하지 않는다.
- `SALES_OPEN`, 결제, 알림 발송, SNS 자동 게시 상태는 이 작업 범위 밖이다.

## 위험과 대응

| 위험 | 대응 |
|---|---|
| 296개를 모두 신규 개발로 오해 | 현재 코드와 증거를 먼저 연결하고 갭만 구현 |
| 승인 UI의 예시 수치를 LIVE로 오해 | provider 상태가 없으면 fixture/예정/불가를 명시 |
| 새 seed schema가 기존 모델과 충돌 | 기존 schema와 migration을 먼저 읽고 새 타입 생성 금지 |
| Earthus 운영 변경과 섞임 | Aetherus 배치 파일·테스트·배포 범위를 별도로 기록 |
| 자동검사만으로 실기기 완료 주장 | 실제 장비/계정 증거는 `UNKNOWN` 또는 `BLOCKED` 유지 |
| 기존 서핑·낚시 UI를 Ocean v1 완료로 오해 | 52장 요구사항과 OT-001–015를 현재 HEAD에서 재대조 |
| 활동 점수가 안전·조과 보장으로 읽힘 | hard gate 우선, `UNKNOWN/null`, 입력·설명·confidence 공개 |
| 개인 포인트·민감종·EXIF GPS 노출 | 서버측 정밀도 정책, private 원본, visibility saga·purge 검증 |
| 무료 AIS 데모가 실시간 상품으로 확대 | license manifest와 G1–G5 gate 전 Vessel Lite 범위 유지 |
