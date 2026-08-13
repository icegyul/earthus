# 00 — 현재 정본

## 운영 완료

- 첫 진입은 수치·판단이 없는 아름다운 Earth View다.
- Data View는 단계색·범례·등치선·값 라벨·도시 최근접 원격자값·출처·시각·단위를 제공한다.
- 국가 경계·지명 참조 타일과 별도 흰색 해안선이 Data/Evidence/Decision에서만 보인다.
  해안선은 전지구 1:110m, 한국·일본 포함 동아시아 1:10m Natural Earth 벡터다.
- 공식 기상특보 Hard Gate 기본 slice가 운영 중이며 근거 부족은 `UNKNOWN`이다.
- 기상청 Live는 AWS 736개, 97개 대표격자 공식예보, 특보, 낙뢰, HSR 레이더, 상층,
  산악·생활·해양·기후기록을 지연 로딩한다.
- HSR 레이더는 서울 Lambda와 5분 EventBridge로 갱신하며 검증 실패 시 last-good을 보존한다.
- NOAA/NCEP GFS 모델분석 TPW 수증기 통로는 `TPW_READY=true`로 공개됐다.
- 판매 `SALES_OPEN`, 공개 Decision, 예약 실행, SNS 자동 게시는 닫혀 있다.

## Shadow

- PR-01 Signal Foundation canonical envelope
- PR-02 Rights/Freshness governance
- PR-07 Forecast Confidence와 5개 Base Activity profile
- PR-08 bounded personalization과 5축 UI
- PR-09 Reservation Impact
- PR-10 grounded Signal Fusion

## Local verified — 운영 미배포

- Visual PR-00의 `SatelliteFrameContract`, NOAA/GK-2A/Himawari fixture, module query gate,
  layer/request/mask/render/texture 측정 도구가 로컬 검증됐다.
- 1280×720·390×844 기준선에서 구름 base/depth의 동일 타일 중복 기회 41~49%,
  전환/OFF 뒤 이전 provider 요청과 texture 잔존을 확인했다.
- 최종 기준선의 mask p95는 로컬 Chrome에서 0.8~1.2ms, 50ms 초과 0이었다. 실제
  Safari·iPhone 결과로 일반화하지 않는다.
- 이 코드는 production entry가 import하지 않고 운영 배포하지 않았다. 정본은
  [`../earthus-visual-engineering-next/PR00-CONTRACT-MEASUREMENT-ADR.md`](../earthus-visual-engineering-next/PR00-CONTRACT-MEASUREMENT-ADR.md)다.

Shadow의 높은 점수·합성 결과·replay 통과는 공개 추천이나 운영 승인이 아니다.

## 현재 중요한 UNKNOWN/BLOCKED

- 기상청 공식 특보 polygon/hierarchy와 authoritative 위치 매핑
- PR-01/02 schedule·retention·비용·dual-read·canary·reader 전환
- 전체 Lambda 최근 성공·지연·결측·quota·비용·DLQ·alarm·log retention 통합 관측
- Supabase remote migration checksum, RLS/FORCE RLS, tenant A/B 격리
- Safari·구형 iPhone 장시간 발열·배터리, VoiceOver/스크린리더
- 위성 base/depth owner 통합, 전환/OFF 취소, 30회 교대 뒤 layer/texture 회수
- desktop 6K/4K capability 판정과 decode 실패 4K/2K 폴백
- 활동곡선 도메인 승인, 실제 사용자 preference 저장·철회·삭제
- 예약 공급자 권리·인증 adapter·알림·변경/취소/결제 사용자 확인
- 기관용 API/SLA를 위한 tenant·scope·quota·export 권리·비용 귀속

## 작업트리 경계

다음 시작 시 `git status --short`를 새로 읽는다. 2026-08-13에는 AETHERUS/우주 배경과
공유 앱 파일의 별도 변경이 같은 작업트리에 있었다. 파일명이 비슷하다는 이유로 stage,
format, revert, deploy하지 않는다. 이번 해안선 작업도 `readability.js`의 자기 hunk와 신규
해안선 파일·문서만 선별했다.
