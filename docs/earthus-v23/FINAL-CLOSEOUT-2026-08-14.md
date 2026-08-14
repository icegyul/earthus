# EARTHUS v2.3 개발 기준서 코드 제어 범위 최종 종료 — 2026-08-14

> 판정: **CODE-CONTROLLABLE COMPLETE / EXTERNAL GATES PRESERVED**
>
> 이 문서는 v2.3 기준서, N1~N7 종료, Visual PR-00~08, AX 보강과 이번 최종 감사를 합친
> 종료 정본이다. 외부 증거가 필요한 항목을 완료로 꾸미지 않는다.

## 1. 이번 최종 보강

- 선택 이용행태 event를 로그인·명시적 선택동의·최신 서버동의의 3중 gate 뒤에 연결했다.
- 브라우저와 DB가 같은 event/property/value 허용목록을 검사하고 좌표·검색어·AI 질문·
  연락처·예약/결제 식별자·token·stack·provider 원문을 거절한다.
- FORCE RLS, 본인 select/delete, 익명 권한 0, 365일 만료 cron, 철회 즉시 삭제,
  본인 데이터 export를 운영 DB에 반영했다.
- 이용약관 `2026-08-04`, 개인정보처리방침 `2026-08-21`, 묶음 재동의 버전
  `2026-08-21`을 분리했다. 처리방침은 8월 14일 공고하고 8월 21일 시행한다. 브라우저와
  DB 모두 시행 전 수집을 막으며, 이후에도 최신 방침과 최신 선택동의만 새 insert를 허용한다.
- Python handler 67/67과 공통 source catalog 30개를 source·지역·권리·재배포 기준으로
  대조했다. 권리 미확정 source는 `UNKNOWN/BLOCKED`로 유지했다.
- AWS는 로컬 실행 단위 69개, 서울 배포 68개, Active/Successful 68, VPC 0,
  policy 참조 rule 58개 enabled를 재확인했다. `news-brief`만 의도적으로 미배포다.

## 2. 운영 DB 검증

- 적용 migration: 기존 4개 + EARTHUS analytics 4개 = 운영 이력 8개 일치
- 보류 유지: `20260814090000_aetherus_private_data.sql`
- transaction rollback 검증: 전환 전 허용 insert, 시행 전 insert 차단, 교차 사용자
  select/insert 차단, 금지 필드 거절, 철회 삭제 모두 통과
- 검증 종료 후 운영 analytics 행 변화: 0
- 실제 OAuth 2계정 UI A/B는 계정이 하나뿐이라 외부 계정 gate로 남긴다.

## 3. 완료 판정

| 영역 | 종료 상태 |
|---|---|
| 첫 아름다운 Earth와 사용자가 여는 Data/Evidence/Decision 흐름 | OPERATING |
| 국가 경계·흰색 해안선·단계색·등치선·도시/지점값·출처/시각/단위 | OPERATING |
| KMA Live, TPW, 레이더 13프레임, Wind Profiler, collector health | OPERATING |
| 공식 특보 Safety Hard Gate | OPERATING SUPPORT / geometry BLOCKED |
| Signal canonicalization·rights/freshness | SHADOW VERIFIED |
| Base Activity 5종·Forecast Confidence·개인화·5축·Reservation Impact | SHADOW VERIFIED |
| Cross-domain Fusion·Earthus Intelligence | SHADOW VERIFIED |
| 선택 이용행태 consent/RLS/retention/delete/export | DEPLOYED · EFFECTIVE 2026-08-21 |
| 판매·예약 실행·SNS 자동게시 | FAIL-CLOSED |

## 4. 코드로 끝낼 수 없는 외부 gate

1. 기상청 공식 특보 polygon/multipolygon 또는 서면 authoritative geometry
2. source별 상업 이용·재배포·export·AI 권리 승인과 provider 계약
3. CloudWatch target/metric/alarm/log retention/DLQ 읽기·쓰기 권한과 알림 채널
4. 실제 Safari/iPhone/저사양 Android/VoiceOver/열·배터리 물리 검수
5. 활동곡선 도메인 승인과 예약 provider 재고·폐쇄·가격·취소 sandbox
6. 실제 OAuth 두 사용자 UI A/B, 기존 전체 Supabase policy/function ACL, private Storage
7. 판매·SLA·B2B export의 법무·비용·tenant·quota·DR·PD 공개 승인

이 관문은 “남은 코딩”이 아니다. 증거가 들어오기 전에는 `SALES_OPEN=false`,
`DECISION_CORE_READY=false`, 예약/결제 action 비활성, SNS 사람 확인 원칙을 유지한다.

## 5. 재개 조건

다음 작업자는 `docs/HANDOVER.md`와 이 문서를 읽고 `git status --short`부터 확인한다.
위 외부 gate 중 실제 증거·권한·계약·기기가 제공된 항목만 별도 PR로 연다. 임의 수치,
안전·폐쇄·재고 추정, 권리 추정, AETHERUS 보류 migration 적용은 금지한다.

## 6. 최종 검증·배포 증거

- 자동 회귀: 저장소 `tools/test_*.mjs` **45/45 PASS**. EARTHUS Decision/Safety/KMA/TPW/
  위성/Visual과 AETHERUS 공유 회귀를 함께 포함한다.
- 운영 Safety 실자료: 기상청 API허브 `wrn_now_data`, 자료시각 2026-08-14 09:32 KST,
  active 66건 중 exact station-zone 경로로 공식 특보 gate 통과.
- source audit: Python handler 67/67, 공통 catalog 30, gated source 3 일치.
- Supabase public audit: analytics 익명 HTTP 401, 판매 checkout `SALES_CLOSED`, private relation
  익명 노출 0; 운영 migration 8개 일치, AETHERUS 1개만 보류.
- RLS rollback: `preEffectiveBlocked=true`, cross-user select/insert blocked, forbidden field
  rejected, withdrawal delete, production rows changed=false.
- 정적 배포: `index.html`, JS 8개, 운영 `config.local.js`, 개인정보처리방침, source catalog의
  11개 파일만 S3에 Content-Type과 `no-cache`로 업로드했다.
- CloudFront invalidation: `I6CU3LRQUK87XCKB8QO9346DIU` (`/*`).
- 운영 재다운로드: 11/11 local/live byte 일치, MIME 11/11, `no-cache` 11/11,
  CloudFront fresh miss 11/11.
- 운영 브라우저: 첫 Earth에서 메뉴·Data/Evidence/Decision 닫힘, 아름다운 지구본 유지,
  가로 overflow 0, 개발자 문구 0, 약관 링크 2개, 이용행태 기본 OFF, guest analytics request 0,
  JavaScript page error 0.

## 7. 12:43 실화면 교정 — AX-02

위 종료 뒤 PD 실화면 검수에서 AX-01의 접힌 판단 손잡이가 첫 Earth를 가리고, 장소 날씨와
판단 패널을 두 번 닫아야 하는 결함이 확인됐다. 로컬 AX-02는 선택 전 손잡이·자동 코치를
제거하고 장소·날씨·활동·Safety를 `#sheet` 하나로 통합했다. 전체 45/45와 실제 지구 클릭,
1280×900·390×844, 한 번 닫기, 터치 영역 분리를 통과했다.

이 교정은 현재 `LOCAL VERIFIED`이며 운영 S3 정확한 경로 승인 전에는 `OPERATING`으로
부르지 않는다. 배포 대상과 SHA는
[`RELEASE-2026-08-14-AX02-UNIFIED-PLACE.md`](RELEASE-2026-08-14-AX02-UNIFIED-PLACE.md)에 있다.
