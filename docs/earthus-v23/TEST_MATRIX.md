# TEST MATRIX — EARTHUS v2.3

## 1. 자동 테스트 층

| 층 | 필수 증거 |
|---|---|
| Unit | 단위·시각·경계·profile·confidence·hard gate·personal cap |
| Contract | provider JSON/XML/charset, schema drift, 429/5xx/timeout, rights expiry |
| Replay | 특보 발표→대치→해제, duplicate/out-of-order, processor rerun |
| Integration | provider→snapshot→decision→UI/alert, 서울 리전 실제 payload |
| Failure | DNS/TLS/provider/cache/queue/partial DB/permission |
| E2E | Earth View→Style→Data→Evidence→Decision, 예약 확인 |
| Visual | layer/zoom/region/state/device 조합 |
| Accessibility | keyboard/screen reader/contrast/reduced motion/offline |
| Performance | idle/released render, memory/heat, latency |
| Security | authz/SSRF/secret/prompt injection/export/delete/replay |
| Cost | peak bbox/live fan-out/NAT/API/LLM/storage |
| Governance | admin approval/quarantine/reprocess/correction/consent |
| Migration | dual-read/shadow/canary/cache/schema/rollback rehearsal |

## 2. Critical slices

| Slice | 처음부터 끝까지 통과할 것 |
|---|---|
| Temperature Readability | grid→envelope→Data View 단계색/등치선/도시값→point 원값→URL 복원→idle 0 |
| TPW Moisture Corridor | NOAA GFS valid time→1° regional grid→단계색·도시 원격자값→범위 밖 missing→출처·한계→idle 0 |
| Official Warning | KMA ingest→region mapping→revision→Hard Gate→CTA→해제 replay→UNKNOWN fallback |
| Activity Decision | 5 profile fixture→confidence→base cache→private delta→5축 UI→ledger |
| Reservation Impact | 예약 시간/장소→signal diff→dedup 알림→확인→provider 실패/성공 |
| Rights/Export | APPROVED/BLOCKED/EXPIRED→publish/archive/export/AI gate→감사 |
| AI Grounding | 화면 질문→tool claims→source/time→금지 주장 차단→행동 제안만 |
| Operations Control | quarantine→dry-run→approval→publish→rollback→append-only audit |
| Tenant/API | tenant A/B 격리→scope→quota→rights-filtered export→checksum→delete/audit |

## 3. UI 축

| 축 | 최소 범위 |
|---|---|
| 화면 | 390×844, 430×932, 768×1024, 1280×720, 1440×900 |
| 지역 | 전지구, 한국, 일본, 북서태평양, 유럽, 미주, 날짜변경선 |
| 레이어 | 연속장, vector, 점 관측, 위성 imagery, 재난, 자료 없음 |
| 상태 | fresh, aging, stale, missing, policy blocked, offline, superseded |
| 조합 | on/off 반복, 시간 재생, 모델 비교, 빠른 카메라 이동, 뒤로가기 |
| 기기 | desktop Safari/Chrome, mobile Safari/Chrome, 구형 iPhone 실기기 |

## 4. Golden scenarios

| ID | 상황 | 기대 |
|---|---|---|
| GS-01 | 첫 방문 | 아름다운 지구와 최소 UI, Data View 닫힘 |
| GS-02 | 기온 공유 URL | layer/time/model/point와 원값·출처 복원 |
| GS-03 | 호우경보 발표 | Safety가 score보다 먼저 CTA 제한 |
| GS-04 | 특보 대치·해제 | revision timeline과 이전 기록 보존 |
| GS-05 | 특보 provider down | UNKNOWN/last-good time, 안전 긍정 금지 |
| GS-06 | 야구 19시 | 5축 판단, base/personal 분리, 경기상태 UNKNOWN |
| GS-07 | 주말 캠핑 | 다일 window·누적 조건·시설 폐쇄·대안 |
| GS-08 | 퇴근 후 풋살 | 2시간 window·예약 재고 provider·개인화 이유 |
| GS-09 | 일몰 전 등산 | 하산 여유·통제·낙뢰·일몰 계산 provenance |
| GS-10 | 별보기 | 운량/시정/달빛 conflict와 confidence |
| GS-11 | 예약 뒤 경보 | impact diff·중복 없는 알림·확인 후 실행 |
| GS-12 | 모델 불일치 | 모델 나란히, 평균을 정답으로 발표 금지 |
| GS-13 | 레이더 공백 | 0mm/맑음 금지, coverage gap |
| GS-14 | AirKorea 점 vs 모델 면 | 관측/모델 구분, 자동 보정 금지 |
| GS-15 | 레이어 빠른 on/off | timer/worker/network/render 0 |
| GS-16 | source 권리 만료 | publish/export/AI BLOCKED, 대체 source 안내 |
| GS-17 | AI 질문 | 화면 signal만 설명, 결측 명시, 상태 변경 없음 |
| GS-18 | 오프라인 | last time/stale 고정, 예약·결제 쓰기 차단 |
| GS-19 | DST/날짜변경선 | 변환 뒤 중복·1시간 오차 0 |
| GS-20 | parser drift | quarantine→dry-run→승인→복구 |
| GS-21 | decision cutover | shadow/canary/rollback에서 action 중복 0 |
| GS-22 | 알림 대치·제보 | correction 연결, USER_REPORTED가 공식 gate 완화 금지 |
| GS-23 | UI 실험 | safety/source/time/price/consent 동일, 철회 뒤 수집 0 |
| GS-24 | B2B tenant 공격 | 교차 접근 403/404, 429, BLOCKED source export 0 |
| GS-25 | TPW 수증기 통로 | 1° 원격자와 도시값 일치, 90~180°E 밖 null, 모델/유효시각 표시, 비·위성으로 표현 0, idle render 0 |

## 5. 2026-08-12 실제 기준선

- 1280×720 근사 운영 화면: 첫 지구, EARTHUS/AETHERUS 메뉴, Earth Style 목록 확인
- 390×844: 메뉴가 화면을 크게 덮음, 태양계 선택 뒤 패널 닫힘 확인
- 태양계 선택 뒤 URL이 `/` 그대로인 gap 확인
- 조사 중 console warning/error 0
- TPW 로컬 실 GRIB: 91×36, 3,276/3,276, 5.5~79.0mm, run=valid 12:00 UTC
- TPW 1600×900: 서울 31mm·부산 25mm 원격자 라벨, NOAA/시각/1°/모델·비 아님 고지, off 제거
- TPW 390×844: 통합검색 진입·레이어·해제 버튼, console warning/error 0
- `TPW_READY=false`: 검색에서 `Coming soon`, TPW network request·source 교체·off chip 0
- GFS 6시간 주기를 1시간 지연으로 표시하던 freshness 기준을 360분으로 정정
- Signal Foundation 자동검사 12개: CAN-01~08, TPW 3,276칸 <6MB,
  공개 원본 불변/private shadow, 이전 shadow AccessDenied 비은폐, 부분 실패 격리
- 실제 공개 KMA read-only 호환: 특보 29→29(전부 region 미매핑 UNKNOWN),
  AWS 736→736(실시간 기온 결측 11→9건 모두 null), parser 거절 0
- S3 policy: 익명 공개 prefix에 `archive/` 없음. 운영 때 객체 익명 GET 403 재검증 필요
- Rights/Freshness replay 20개: DRAFT/APPROVED/BLOCKED/EXPIRED/review due,
  승인근거 누락, FRESH/AGING/STALE/FUTURE/UNKNOWN, metadata drift, 최소 행 수·거절률,
  빈 특보, registry revision·시각·threshold, TPW 3,276칸 summary, private shadow·부분 실패
- 실제 KMA PR-01→PR-02 read-only: 특보 26→26 FRESH/HEALTHY,
  AWS 두 차례 736→736 AGING/HEALTHY·실시간 결측 13→18 모두 null, parser 거절 0
- 실제 데이터가 정상이어도 DRAFT registry인 두 source는 `POLICY_BLOCKED/display BLOCK`
- Earth route URL 계약 11/11: version/view/layer/time/model/point/privacy/fallback/서비스 충돌
- 로컬 데스크톱: `/` Earth, Style URL, 기온 Data, 지점 Evidence 26.7°C와 출처,
  새로고침·Earth↔Style↔Data↔Evidence 앞뒤 복원
- 로컬 390×844: query 없는 Earth와 기온 Data 공유 URL 복원, 새 error 0
- PR-03 `TPW_READY=false` 직접 URL: Style fallback·NOAA 구름 유지·`UNAVAILABLE_LAYER`
- 동시 AETHERUS route-state v3와 시험이 같은 revision으로 동기화된 뒤 foundation 13 route,
  astronomy 5 route/privacy, photo ownership 회귀 통과; PR-03은 해당 파일/시험을 수정하지 않음
- PR-04 판독 자동검사 16/16, Earth route 12/12, TPW grid math, Signal Foundation 12,
  Rights/Freshness 20, TPW handler 2와 AETHERUS 5개 회귀 suite 통과
- 로컬 기온 Data: 9개 색 경계, valid 2026-08-12 01:00 UTC, 5°, n=2,376,
  화면 도시 최근접 원격자값과 실제 지점 26.8°C·좌표·Open-Meteo 출처 복원
- 지평선 검사를 추가하기 전 태평양 화면에 아프리카 도시가 섞인 실패를 실화면에서 발견했고,
  수정 뒤 Okinawa/Taipei/Shanghai/Busan/Manila/Hong Kong/Guangzhou만 표시됨
- 390×844/430×932/768×1024/1280×720/1440×900 판독 패널 overflow 0,
  Esri 참조 credit 직접 표시, 첫 Earth·Earth 복귀에서는 패널/read class 0
- PR-04 운영 8개 정적 파일 SHA-256 일치, 390×844 overflow 0, 기온 Data·read mode·
  지점 Evidence·새로고침·Earth 복귀·TPW 잠금·AETHERUS·해구 회귀 통과
- 유효 운영 경로 warning/error 0. TPW 우회 시험에는 설계된 `UNAVAILABLE_LAYER` warning 1건만 기록
- Safari·구형 iPhone·idle/released render owner 실제 계측은 남은 gate

이 기준선은 PR-04 로컬 완료와 PR-11 운영 전후 비교 기준이다.
