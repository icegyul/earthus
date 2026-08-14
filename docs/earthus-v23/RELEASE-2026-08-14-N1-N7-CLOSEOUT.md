# EARTHUS N1~N7 구현 종료 판정 — 2026-08-14

> 결론: 개발자가 통제할 수 있는 코드·실자료·운영 화면·가드레일은 구현·배포했다.
> 외부 기관 geometry, 권한, 법적 권리, 공급자 계약, 실제 기기와 PD 공개 승인은
> `BLOCKED/UNKNOWN`으로 남겼다. 이 문서는 그것을 완료로 바꾸지 않는다.

## 1. 운영 반영

### N1 수집기 운영 관제 — `OPERATING`

- `earthus.collector-health.v2`가 공개 출력 61개를 동일 계약으로 감시한다.
- 운영 재실행 결과 `61개 중 정상 61개`, `operationalOverall=HEALTHY`다.
- 모든 행에 attempt/success/source time/age/count/missing/rejected/http/latency/last-good/
  quota/cost/revision 필드가 존재한다. 알 수 없는 quota·cost는 `UNKNOWN`이다.
- `marine-ea`는 300초보다 큰 실제 작업량을 반영해 timeout 600초로 고정했고,
  운영 2,482칸·실패 0·결측 0 heartbeat를 확인했다.
- 관리자 화면은 로그인 전 회원/최근가입/health 정보를 숨기고, 개발자 설정 문구와 `—`
  플레이스홀더를 노출하지 않는다. 관리자로 확인된 경우에만 read-only health를 그린다.
- CloudWatch alarm/metric, DLQ, log retention, EventBridge target 전수는 읽기 권한이 없어
  `UNKNOWN`이다. 권한 없이 성공으로 추정하지 않는다.

### N2 기상청 특보구역 — `OPERATING SUPPORT / BLOCKED AUTHORITATIVE GEOMETRY`

- 공식 `wrn_reg.php`의 414개 구역 계층을 수집한다: 육상 301, 해역 113,
  `MAPPED 411 / ROOT 2 / SELF_ROOT_NORMALIZED 1`, 거절 0.
- 계층 availability와 revision은 특보 snapshot에 포함한다.
- 공개 API에서 공식 polygon/multipolygon endpoint를 확인하지 못했으므로 geometry는 `null`,
  authoritative point containment는 `false`다. 기존 exact-ID Hard Gate를 임의 행정경계로
  교체하지 않았다.

### N3 Canonical·Rights — `SHADOW VERIFIED / BLOCKED AUTHORITATIVE`

- 특보 adapter가 natural key 안에만 있던 kind/level/command/parent region을 canonical quality에
  명시적으로 보존한다.
- 운영 dual-read: 특보 73, AWS 기온 736, TPW 3,276; count/value/missing/time/source/
  kind/command/parent 차이 0, 판정 `PASS`다.
- Source Governance는 세 source 모두 `DRAFT/POLICY_BLOCKED`를 유지한다. source별 8개 operation
  권리 승인, append-only Control Plane, schedule/canary/authoritative reader는 외부 승인 전 차단한다.

### N4 실제 화면 — `OPERATING REPRESENTATIVE / DEVICE MATRIX UNKNOWN`

- query 없는 첫 방문은 데이터·판단 패널이 없는 아름다운 Earth다.
- TPW Data View의 출처·원시각·모델분석 고지·1° 해상도·n=3,276·등치선·국경·흰색 해안선·
  도시값을 운영에서 확인했다.
- 1280×720·1440×900·768×1024·430×932·390×844에서 첫 Earth/TPW/KMA Live의 실제 상태,
  가로 overflow 0, console warning/error 0을 확인했다.
- 전지구 기온 Evidence View를 한국·일본·유럽·북미·남반구·날짜변경선에서 복원했고
  여섯 장면 모두 source 표시·overflow 0·console warning/error 0이었다. 표와 캡처는
  [`N4-UI-MATRIX-2026-08-14.md`](N4-UI-MATRIX-2026-08-14.md)에 있다.
- Safari, 구형 iPhone, 저사양 Android, VoiceOver, 전 레이어×전 지역×전 zoom 조합은
  물리적 장비/시간이 필요해 `UNKNOWN`이다.

### N5 고가치 판독 UX — `OPERATING PARTIAL`

- 레이더·낙뢰·AWS·공식특보의 서로 다른 원시각과 n을 한 증거 시간축에 정렬한다.
  값은 합치거나 평균하지 않는다.
- HSR 레이더는 최근 약 1시간을 5분 간격 13개 고정 순환 슬롯에 보존한다. 무한 history가
  아니며 routine schedule은 한 장만 받는다. 운영 range `max=12`, 최신→과거 frame URL·시각
  전환을 실제 조작했다.
- KMA Wind Profiler L/H를 기존 상층 수집기에 연결했다. 운영 19지점·고도 관측행 3,234개,
  UTC 원시각, 고도·풍향·풍속·U/V/W·원 QC·결측을 보존한다. UI는 지점별 실제 고도 범위와
  성긴 원 관측행을 표시하고 보간하지 않는다.
- 공식 레이더 PNG는 투영 변환 파라미터가 없으므로 지구본에 늘여 붙이지 않았다.
- 정확한 선택 좌표 5km on-demand는 공개 Function URL·quota·cost·남용 방어 승인 전 차단한다.
  현재 97개 대표격자는 계속 근사라고 표시한다.
- 기존 관측소/부이 상세의 5일 변화·원문 archive·장비/출처 기능은 유지한다.
- Skew-T는 기온·이슬점 압력면 원자료가 없으므로 생성하지 않는다. Wind Profiler를 Skew-T로
  오인 표시하지 않는다.

## 2. 공개하지 않은 완성 코드

### N6 Decision·개인화·예약 — `SHADOW`

- Base Activity 5 profile, Forecast Confidence, Safety 우선, shared Base cache,
  private bounded delta, 5축 UI, Reservation Impact diff/dedup/correction 계약이 자동검사를 통과했다.
- 선택 이용행태 consent 저장/철회/삭제·본인 export와 해당 event의 Supabase RLS 주체 A/B
  rollback 검증은 완료했다. Decision preference 저장, 공식 운영·폐쇄·재고 provider,
  알림 전달/변경/취소/결제 확인 경로는 없으므로 `DECISION_CORE_READY=false`다.
- 예약 action, provider action, payment action은 모두 `null/false`다.

### N7 Earthus Intelligence — `SHADOW`

- `earthus-intelligence.js`에 cross-domain co-occurrence 계약을 추가했다.
- 동일 tenant·scope·region·time window, HTTPS source, observed/received time, revision,
  quality, display/intelligence rights가 있는 두 영역 이상 신호만 묶는다.
- 원인·경로·도착·피해·확률·추천·action 필드는 거절한다. public/sale/export/billable은 false,
  model/tool/network 호출은 0이다.
- tenant isolation, quota, cost attribution(알 수 없는 비용은 null), export 권리를 계약에 넣었다.
  실제 B2B 판매·SLA·export는 RLS/감사/DR/권리/비용 승인 전 차단한다.

## 3. PR-11 안전 종료

- `SALES_OPEN=false`, `DECISION_CORE_READY=false`, default TPW/Decision fail-closed,
  SNS 자동 게시 금지 상태를 회귀검사했다.
- TPW만 별도 검증 승인에 따라 운영 true다.
- CloudWatch/DLQ/log/DR/실기기 접근성과 Decision/B2B 전체 tenant 격리는 외부 증거가 없어
  미승인이다. 선택 이용행태 저장소의 session 주체 A/B 격리는 별도 rollback 검증을 통과했다.

## 4. 자동검사 증거

다음이 같은 작업트리에서 통과했다.

- Readability 31/31, Continuous Layers 40/40, Safety 23/23
- KMA Live 41/41, radar history 14/14, Wind Profiler 20/20
- N1 collector 30, collector heartbeat 14, watch coverage 56 outputs/57 watches, admin health 20
- N2 hierarchy 22, signal foundation 12
- Activity Decision 31/31, Personalization/UI 30/30, Reservation Impact 21/21
- Grounded Fusion pass, Earthus Intelligence 28/28, PR-11 release gate pass
- AETHERUS foundation regression pass, Python compile, JS syntax, `git diff --check`

## 5. 운영 배포 증거

- Lambda: `marine-ea`, `health`, `kma-warn`, `signal-foundation`, `kma-radar`, `kma-upper`를
  변경 범위에 맞게 선택 배포하고 실제 invoke/공개 산출물을 확인했다.
- 마지막 health 보강 배포 revision은 `560bc046-b0e6-43cf-b63b-603c515652d7`이며,
  재실행 공개 산출물은 `2026-08-13T18:47:00Z`·61/61 HEALTHY였다.
- 정적 파일 11개만 배포했다: `index.html`, `admin.html`, `css/kma-live.css`,
  `js/admin-health.js`, `js/earthus-intelligence.js`, `js/kma-live-metrics.js`, `js/korea.js`,
  `js/layerbar.js`, `js/main.js`, `js/ui-korea.js`, `js/ui-weather.js`.
- CloudFront invalidation: `I5POML3QC24ML1BUD44OZ42SML`.
  `GetInvalidation` 권한은 거절됐지만 11개 운영 URL을 새로 내려받아 local/live SHA-256 전부
  일치했고 MIME·`no-cache`도 S3에서 전수 확인했다.
- 운영 브라우저: 첫 Earth 데이터 패널 0, KMA 증거시간축 4행, 레이더 13프레임 전환,
  상층 10개 지점 카드와 n=3,234, 관리자 debug/`—` 0, 가로 overflow 0, console 오류 0.

## 6. 종료 후 blocker

남은 항목은 추가 코딩으로 사실을 만들 수 없는 관문이다.

1. 기상청 공식 특보 polygon/multipolygon 제공 또는 서면 정본 지정
2. source별 operation 권리 승인과 서명된 governance registry
3. CloudWatch/DLQ/log/target read·alarm write 권한과 알림 채널
4. Supabase 실제 OAuth 두 사용자 UI A/B와 Decision/B2B 전체 tenant·routine ACL 전수 증거
5. 활동곡선 도메인 검토, reservation provider 계약, 가격/재고/취소 sandbox
6. Safari/iPhone/Android/VoiceOver/열·배터리 물리 실기기 검수
7. 유료 API/SLA/export의 tenant·quota·cost·audit·DR·법적 승인

이 blocker 전에는 공개 Decision, 예약 실행, 판매, 자동 게시를 열지 않는다.
