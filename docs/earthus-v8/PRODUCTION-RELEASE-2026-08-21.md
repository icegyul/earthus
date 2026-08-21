# EARTHUS v8 production release — 2026-08-21

## 결론

EARTHUS v8의 Visual Earth 정적 화면과 자체 예보의 비공개 서버 경계를 운영에 배포했다.
정적 앱은 운영 브라우저 검증까지 통과했다. 예보 경계는 운영 중이지만 검증된 Earthus 자체
예보 결과를 넣거나 `RELEASED`로 전환하지 않았으므로 예보 출력 기능은 계속 닫혀 있다.

- 정적 앱: `STATIC_OPERATING`
- 관광 운영 자료: `FULL 121/121`
- Supabase migration `20260821120000`: `APPLIED`
- Edge Function `forecast-v8` v1: `ACTIVE` · `verify_jwt=true`
- Earthus 자체 예보 결과: 배포 과정에서 `NONE_CREATED`
- 실제 유료 계정 E2E: `NOT_ACCEPTED`
- 판매: `SALES_OPEN=false`
- AETHERUS: 이번 배포에서 변경·migration 적용하지 않음

## 정적 배포 증거

- S3 대상: `s3://earthus-cache-kr/app/`
- 배포 파일: 변경된 정적 파일 52개만 지정 업로드
- MIME: HTML, JavaScript, CSS, JSON, PNG별 명시
- Cache-Control: HTML과 서비스워커는 `no-cache, no-store, must-revalidate`,
  나머지는 `public, max-age=0, must-revalidate`
- CloudFront distribution: `E193CZEBLWEB56`
- invalidation: `I4SO8ZU1ZQL1IPGFUOTNMB0M0K`, 대상 53경로
- 운영 파일 전수 비교: `52/52` 로컬과 live bytes 일치, MIME·cache header 실패 `0`

배포 IAM에는 `cloudfront:GetInvalidation` 권한이 없어 invalidation 상태 API를 읽을 수 없었다.
대신 무효화 생성 성공 뒤 `earthus.net`의 52개 대상 파일을 직접 다시 내려받아 바이트와 응답
헤더를 전수 대조했다. 대표 `main.js`도 SHA256 일치와 CloudFront `Miss`를 확인했다.

## 운영 브라우저 검증

- v8 runtime과 Unified Time 연결
- 여행 메뉴와 지구의 `tourism`·`poi` 상태 공유
- 관광 모바일·데스크톱, 운영 자료 `121/121 FULL`
- 관광 표시 셀 `420m × 420m`, box 사용, cylinder 없음
- 메뉴 모바일 세로·짧은 가로·데스크톱
- Ocean 모바일·태블릿·데스크톱과 Dive cockpit
- 취미 5개 범주, 실제 진입 경로 19/19
- LALA-26 MultiPolygon `2/2`, Cesium render error `0`
- 무료 항공기·선박 직접 진입과 waitlist 비노출
- Weather Card v7 모바일·데스크톱
- 서비스워커 실제 controller·cache 경로

## 예보 보안 경계 증거

- AETHERUS pending migration을 제외한 격리 dry-run에서
  `20260821120000_earthus_v8_forecast_private.sql` 하나만 적용 대상으로 확인했다.
- 적용 뒤 remote migration 이력에 `20260821120000`이 일치한다.
- `earthus_forecast_revisions`와 `earthus_forecast_release_audit`는 익명 REST 조회가
  각각 `401 TABLE_PRIVILEGE_DENIED`다.
- `forecast-v8` 무인증 GET과 publishable-key-only GET은 모두 `401`이다.
- 함수 내부에서도 Supabase 사용자 확인, 서버 profile의 유효기간, `RELEASED`, 현재 유효 시간,
  sample·skill·freshness·rights·rollback 5개 gate를 모두 다시 검사한다.
- 응답은 성공하더라도 `private, no-store`이며 공식 경보는 이 유료 경로에 넣지 않는다.

## 계속 닫힌 gate

- 실제 Forecast ingest/fusion/verification 결과와 release sample 없음
- 실제 유료 구독 계정의 200 응답 및 무료 계정 403 production E2E 없음
- Ocean 방향 벡터 provider 권리 승인 없음
- Follow Current는 `DISABLED_NO_VECTOR_FIELD`
- Cinema Mode는 `DISABLED_NO_SCENE_MANIFEST`
- KTO 일부 데이터셋은 실제 수집·연결 상태를 별도로 검증해야 함

따라서 EARTHUS v8 정적 제품과 예보 접근 경계는 운영 중이지만, Earthus 자체 예보 데이터까지
`OPERATING` 또는 `E2E_ACCEPTED`라고 부르지 않는다. 공식 관측·공식 예보·공식 경보와 안전
정보는 기존 무료 공개 경로를 유지한다.
