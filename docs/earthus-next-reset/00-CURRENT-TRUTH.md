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
- HSR 최근 약 1시간은 13개 고정 순환 슬롯으로 보존하며 5분 슬라이더로 판독한다.
- KMA Wind Profiler 19지점·3,234개 고도 관측행을 상층 탭에서 원 QC·결측과 함께 읽는다.
- collector health는 운영 61개를 감시하며 2026-08-14 재실행에서 61/61 HEALTHY였다.
- 대표 운영 화면은 5개 화면 크기와 한국·일본·유럽·북미·남반구·날짜변경선 6개
  Evidence 지점에서 source 표시·overflow·console을 확인했다.
- NOAA/NCEP GFS 모델분석 TPW 수증기 통로는 `TPW_READY=true`로 공개됐다.
- 판매 `SALES_OPEN`, 공개 Decision, 예약 실행, SNS 자동 게시는 닫혀 있다.

## Shadow

- PR-01 Signal Foundation canonical envelope
- PR-02 Rights/Freshness governance
- PR-07 Forecast Confidence와 5개 Base Activity profile
- PR-08 bounded personalization과 5축 UI
- PR-09 Reservation Impact
- PR-10 grounded Signal Fusion
- N7 Cross-domain co-occurrence/Earthus Intelligence

## Visual 운영 완료

- Visual PR-01~08의 owner/abort/dispose, shared tile cache/worker, source policy, 재현 가능한
  6K/4K/2K sky, 자동/낮음/끔, SRI·입력 상한·license audit를 운영에 반영했다.
- 중복 tile 0, mask p95 1.6~4.1ms, OFF 뒤 sibling/cache/idle 0, desktop 30회 교대
  layer/texture 증가 0을 fresh Chrome에서 확인했다.
- 34개 S3 객체 SHA를 전수 대조하고 rollback 복원→후보 재적용, CloudFront와 live desktop/
  mobile UI를 확인했다. 정본은
  [`../earthus-visual-engineering-next/PR01-08-CLOSEOUT.md`](../earthus-visual-engineering-next/PR01-08-CLOSEOUT.md)다.
- 실제 Safari·iPhone·저사양 Android·VoiceOver·열/배터리 결과로 일반화하지 않는다.

Shadow의 높은 점수·합성 결과·replay 통과는 공개 추천이나 운영 승인이 아니다.

## 현재 중요한 UNKNOWN/BLOCKED

- 기상청 공식 특보 polygon과 authoritative 위치 매핑(공식 414개 계층은 수집 완료)
- PR-01/02 schedule·retention·비용·dual-read·canary·reader 전환
- CloudWatch quota·비용·DLQ·alarm·log retention·target 전수(공개 출력 health는 운영 완료)
- Supabase remote migration checksum, RLS/FORCE RLS, tenant A/B 격리
- Safari·구형 iPhone 장시간 발열·배터리, VoiceOver/스크린리더
- Visual의 Safari·지원 최저/최신 iPhone·저사양 Android·VoiceOver·열/배터리 실기기 표
- 활동곡선 도메인 승인, 실제 사용자 preference 저장·철회·삭제
- 예약 공급자 권리·인증 adapter·알림·변경/취소/결제 사용자 확인
- 기관용 API/SLA를 위한 tenant·scope·quota·export 권리·비용 귀속

## 작업트리 경계

다음 시작 시 `git status --short`를 새로 읽는다. 2026-08-13에는 AETHERUS/우주 배경과
공유 앱 파일의 별도 변경이 같은 작업트리에 있었다. 파일명이 비슷하다는 이유로 stage,
format, revert, deploy하지 않는다. 이번 해안선 작업도 `readability.js`의 자기 hunk와 신규
해안선 파일·문서만 선별했다.
