# EARTHUS v8 Phase 3 local closeout — 2026-08-21

> 이 문서는 운영 배포 직전의 로컬 상태를 보존한 시점 기록이다. 이후 배포 결과는
> `PRODUCTION-RELEASE-2026-08-21.md`를 따른다.

## 결론

Phase 3 코드는 격리 worktree에서 구현·검사됐지만 운영 배포하지 않았다.

- 코드: `LOCAL_IMPLEMENTED`
- 브라우저 회귀검사: `LOCAL_PASS`
- Supabase migration: `NOT_APPLIED`
- `forecast-v8` Edge Function: `NOT_DEPLOYED`
- Earthus 자체 예보 RELEASED 행: `NONE_CREATED`
- 판매: `SALES_OPEN=false` 유지
- AETHERUS: 이번 범위 제외

## 구현 범위

- Truth / Source / Rights / Entitlement 실행 계약
- Unified Time / Scene / Follow / Cinema 실행 계약
- Visual Registry / Shared Flow / Ocean / Human Relief 어댑터
- 좌하단 compact Provenance Dock
- 관광 3D 블록과 시간별 공식 관측·공식 예측 전환
- 사람·도시 및 여행 메뉴. 여행과 지구는 동일한 `tourism`·`poi` 상태 공유
- Ocean의 실제 가용 상태 표시. 벡터가 없으면 Follow Current 비활성,
  장면 manifest가 없으면 Cinema Mode 비활성
- Earthus 자체 예보의 private 서버 저장소, release gate, audit, Edge 응답 경계

## 확인 결과

- v8 계약 테스트 14개 통과
- v8 Provenance Dock 및 여행 메뉴 브라우저 테스트 통과
- 관광 블록 모바일·데스크톱 브라우저 통과
- Ocean 메뉴 모바일·태블릿·데스크톱 통과
- EARTHUS 메뉴 모바일 세로·짧은 가로·데스크톱 통과
- v7 날씨 카드 모바일·데스크톱 통과
- Hobby 19개 경로 전수 통과
- FREE_OPEN 이용권 5/5와 `SALES_OPEN=false` 통과
- 공식 무료 이동 경로와 Decision Rail 통과
- source matrix 68/68, catalog 30개, 권리 gate 3개 통과
- ESM module specifier mismatch 0
- 변경 JavaScript 문법 검사 통과

이 결과는 로컬 검증이다. 운영 DB, 운영 인증, 실제 유료 계정, CloudFront cache를 거친
production E2E 승인과 같은 뜻이 아니다.

## 출시 전 순서

1. 결제 서버에서 실제 이용권 만료 시각과 취소·환불·수동 이용권 정책을 검증한다.
2. migration을 staging에만 적용하고 `anon`·`authenticated` 직접 조회 거부를 확인한다.
3. `forecast-v8`를 staging에 배포한다. 무인증 401, 무료 계정 403, released 결과 없음 503을 확인한다.
4. DRAFT/SHADOW revision만 넣어 sample·skill·freshness·rights·rollback gate를 증거와 함께 검증한다.
5. 실제 유료 테스트 계정으로만 private/no-store 응답을 확인하고 무료 클라이언트에 payload가
   전송되지 않는지 네트워크 기록으로 검사한다.
6. 공식 관측·공식 예보·공식 경보 공개 경로가 그대로인지 다시 검사한다.
7. 모든 정적 파일을 한 번에 배포하고 Content-Type·cache header·CloudFront invalidation을 확인한다.
8. 운영 브라우저 E2E와 모바일 발열·프레임·접근성 검사가 끝난 뒤에만 release state를 검토한다.

부분 배포는 금지한다. 특히 UI만 먼저 배포하거나, 서버 경계 없이 premium 문구를 여는 것은 안 된다.

## fail-closed rollback

문제가 생기면 데이터를 삭제하지 않고 다음 순서로 닫는다.

1. 대상 revision을 `ROLLED_BACK`으로 변경한다. audit 이력은 보존한다.
2. `forecast-v8` 공개 route 또는 호출 UI를 비활성화한다.
3. `SALES_OPEN=false`와 premium 안내 비노출을 유지한다.
4. Visual Earth UI는 이전 정적 revision으로 되돌리되 공식 안전·관측 경로는 유지한다.
5. 원인과 영향 범위가 확인되기 전 DB table·audit·legacy 자료를 삭제하지 않는다.

DB를 drop하는 자동 down migration은 제공하지 않는다. 이번 저장소는 append/audit 근거이므로
긴급 복구는 `ROLLED_BACK`과 route 차단으로 수행하고, 실제 삭제는 별도 백업·승인 작업으로 분리한다.

## 남은 운영 gate

- 실제 Forecast ingest/fusion 결과와 verification sample 없음
- 유료 구독 staging E2E 없음
- 운영 DB RLS deny test 없음
- 실제 Ocean vector/depth provider 권리 승인 없음
- Follow Current와 Cinema scene manifest 없음
- production 배포·CloudFront 무효화·live byte/hash 비교 없음

따라서 현재 상태를 `RELEASED`, `OPERATING`, `E2E_ACCEPTED`로 부르지 않는다.
