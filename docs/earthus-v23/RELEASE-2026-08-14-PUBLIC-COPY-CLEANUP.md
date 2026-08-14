# 공개 화면 방어문구 정리 릴리스

- 일시: 2026-08-14 KST
- 상태: 운영 배포·실화면 검수 완료
- 배포 범위: `prototype/js/` 공개 모듈 48개
- CloudFront 무효화: `I53S20XKNVVYF2EWF2UUDOY6RR` (`/js/...` 48개 경로)

## 바뀐 기준

공개 화면에서 제품이 스스로를 해명하는 문장, 긴 면책성 설명, 경고 아이콘으로 시작하는
문장을 제거했다. 필요한 정보는 다음 형식으로 바꿨다.

- 출처 · 관측 시각 · 표본 수
- 자료 유형 · 적용 범위 · 해상도
- 상태 · 원인 코드 · 다음 행동
- 공식 특보 · 지역 · 현상 · 등급

산불 상세의 오탐 설명, Activity Score 해명, 데이터 미연결 변명, 1인 개발 사정,
뉴스·항공·위성·예보·조류·해양 화면의 장문 주석을 같은 기준으로 정리했다.
기상 안전 카드는 `공식 특보 · 추천 제한 / 현상 · 등급 · 지역 / 출처 · 시각`만 먼저
보이도록 축약했다.

## 보존한 것

- 공식 특보 Hard Gate와 `UNKNOWN` 처리
- 출처·관측 시각·표본 수·라이선스
- 공식 원문 링크와 실제 대피·일식·현장 폐쇄 행동요령
- 결제·제휴·개인정보의 법정 고지
- 코드 내부 `⚠️⚠️` 사고 기록 주석

## 재발 방지

`tools/audit_defensive_copy.mjs --check`가 공개 JS의 문자열과 템플릿만 검사한다.
주석과 정규식은 건너뛰므로 내부 사고 기록은 건드리지 않는다. 관리자·연구 재현물처럼
별도 목적이 있는 화면은 공개 앱 검사 범위에서 분리했다. 이번 결과는 `0건`이다.

## 검증

- JavaScript 문법: 변경 공개 모듈 전부 통과
- 방어문구 공개 문자열 감사: 0건
- Safety Engine: 23/23
- Activity Decision: 31/31
- Continuous Layers: 40/40
- Data Source Matrix: 67/67 handlers, 30 catalog sources, 3 gated
- Visual Pipeline: 13 checks
- TPW, KMA 별보기 사전검증, 태풍 수명주기, 공개 UI 계약: 통과
- 로컬 Chrome: 첫 Earth, 약관 비자동 노출, 통합 장소 시트, Ask 맥락, 산불 상세 통과
- 운영 Safety 실자료: KMA 66건, exact match, `FRESH`
- 운영 Chrome: Decision rail AX·산불 상세 통과
- 운영 파일: 48/48 로컬과 바이트 일치
- 운영 헤더 표본: `text/javascript; charset=utf-8`, `Cache-Control: no-cache`

CloudFront 배포 계정에 `GetInvalidation` 권한이 없어 waiter 조회는 `AccessDenied`였지만,
무효화 생성은 성공했고 운영 48개 파일 바이트 일치와 실제 브라우저 동작으로 반영을
독립 검증했다.
