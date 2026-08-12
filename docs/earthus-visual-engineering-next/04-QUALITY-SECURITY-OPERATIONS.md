# 04. Quality, Security & Operations Gates

## 1. 자동 테스트 매트릭스

단위:

- source pixel → mask alpha
- 태양 방향 → offset/daylight
- invalid sun/vector/dimension/channel 거부
- quality profile 선택
- contract/schema/version 검증
- cache key/dedupe/eviction

통합:

- provider base + sibling 순서
- load 중 OFF/replace/abort
- 30회 layer 교대 후 객체 수
- RealEarth fallback 포함
- timeline dim과 주야 alpha
- module singleton identity

시각:

- 390×844, 1280×720, 1600×900, DPR 2
- NOAA/GK-2A/Himawari source/channel/region golden
- 구름 경계 seam crop pixel diff
- 천구 6K/4K 선택과 크레딧

회귀:

- Earth 첫 화면
- Earth↔AETHERUS↔해구 장면
- HUD/출처/시간/제한 문구
- 레이어 배타 그룹
- 오프라인/재접속/서비스워커

## 2. 성능 예산

초기 목표이며 PR-00 실측 후 ADR로 확정한다.

| 항목 | 데스크톱 | 지원 최저 모바일 |
|---|---:|---:|
| mask task p95 | ≤ 8ms | ≤ 20ms |
| mask long task | 0 × >50ms | 0 × >50ms |
| 동일 tile 원본 요청 | 1 | 1 |
| active sibling / base | ≤ 1 | ≤ 1 |
| 3초 유휴 Cesium render | 0 | 0 |
| 레이어 30회 교대 후 잔존 증가 | 0 | 0 |
| 천구 fallback 전환 | UI 중단 없음 | UI 중단 없음 |

예산 초과 시 데이터 본체가 아니라 visual effect 해상도/blur/concurrency를 먼저 낮춘다.

## 3. 보안 위협 모델

### 외부 이미지 입력

위협:

- 과대 dimensions/decode bomb
- 잘못된 MIME/SVG script
- CORS canvas taint
- provider URL 변조와 SSRF 유사 브라우저 fetch
- 무제한 task/cache 메모리

통제:

- `https` + 명시 provider host/path allowlist
- `Content-Type`, dimensions, decoded byte 추정 상한
- raster PNG/JPEG/WebP만 허용, SVG를 픽셀 입력으로 받지 않음
- task concurrency와 LRU byte budget
- CORS 실패는 base-only, 민감한 상세 URL 로그 금지

### 프런트 공급망

- Cesium/satellite.js 등 외부 script는 버전 pin + SRI 또는 self-host.
- CSP는 report-only에서 위반 원인을 제거한 후 enforcement.
- `script-src`, `connect-src`, `img-src`, `worker-src`를 실제 provider allowlist로 제한.
- `X-Content-Type-Options: nosniff`, `Referrer-Policy`, frame 정책 점검.
- 새 media asset은 license/source/hash 없이 CI 통과 불가.

### 데이터·개인정보

- visual telemetry에 정밀 위치, 계정 ID, 검색어, 전체 query를 넣지 않는다.
- 위성 관측과 개인 기록을 결합하지 않는다.
- 시각 효과 상태는 로컬 설정이면 충분하며 서버 개인 프로필에 올리려면 별도 동의가 필요하다.

## 4. 공급자 운영 계약 체크리스트

각 공급자마다 승인할 것:

- 공식 생산자/배포자와 이용 권리
- 채널 의미와 단위
- expected update cadence와 실제 지연 분포
- 관측시각/게시시각 구분
- retention/cache 가능 여부
- attribution 문자열과 링크
- 중단/format 변경/취소 조건
- 상류 장애 시 fallback과 사용자 설명

한국 1순위는 GK-2A/KMA이며, 일본·대만 등은 각 국가에 맞는 보조 소스다. 그렇더라도
관측시각과 권리 계약은 동일한 기준을 통과해야 한다.

## 5. 배포 절차

1. `git status`로 타 작업 확인, task 파일/hunk만 선택.
2. JS를 `/tmp/*.mjs`로 복사 후 `node --check`.
3. unit/integration/golden/regression 실행.
4. desktop/mobile/Safari 또는 현재 단계가 요구하는 실제 화면 확인.
5. release manifest에 local SHA-256, target key, MIME, cache-control 기록.
6. `aws s3 cp`로 변경 파일만 업로드. HTML은 `no-cache`, hash asset은 immutable.
7. 변경 path만 CloudFront invalidation.
8. live HEAD/MIME/hash 및 query 없는 첫 화면, 활성 layer 화면 확인.
9. canary 후 승인된 범위만 공개.
10. 한국어 커밋: “무엇이 잘못돼 있었나”.

## 6. Rollback

- 배포 전 target object version ID 또는 이전 SHA를 기록한다.
- HTML/entry module부터 이전 버전으로 돌리면 새 자산 참조가 중단돼야 한다.
- rollback 파일 업로드 후 동일 path invalidation.
- live hash, 첫 Earth, NOAA default, AETHERUS route를 재검증한다.
- 삭제로 되돌리지 않는다. 이전 객체를 복원하는 방식으로 한다.

## 7. Release evidence

릴리스 문서에 반드시 포함:

- commit과 dirty worktree 보존 증거
- 테스트 명령/결과
- 지원 viewport/기기와 스크린샷
- source/channel/observedAt/limit 문구
- local/live SHA-256와 MIME
- invalidation ID
- canary/rollback 결과
- 남은 blocker와 미승인 항목

## 8. 즉시 차단 조건

- 관측시각 또는 출처가 사라짐
- 적외를 강수량으로 설명
- 수증기를 구름 그림자로 표현
- 서로 다른 관측시각 평균
- 레이어 OFF 후 sibling 요청 지속
- 유휴 무한 렌더
- Safari crash/WebGL context loss 무복구
- secret/정밀 위치가 로그·URL·문서에 노출
- 라이선스/크레딧 없는 자산
- rollback 불가능
