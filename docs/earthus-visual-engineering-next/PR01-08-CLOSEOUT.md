# Visual PR-01~08 운영 종료 기록

기준 시각: 2026-08-13 23:27 KST

상태: **OPERATING — 자동화·Chrome·운영 배포 완료 / 지정 실기기 항목은 UNKNOWN**

## 사용자 결과

- 첫 화면은 수치 지도가 아니라 3D Earth와 재현 가능한 ESO 전천 배경으로 시작한다.
- 데스크톱은 6K, 절약모드 모바일은 2K를 고르고 WebGL context loss 뒤에는 같은 기기
  정책 안에서 4K/2K로 한 단계 낮춘다.
- NOAA·천리안2A·히마와리9의 관측 본체와 시각 깊이 sibling은 한 owner로 생성·교체·제거된다.
- 사용자는 구름 입체감을 `자동/낮음/끔`으로 바꿀 수 있다. `끔`이어도 관측 화소·출처·시각은
  남고 Safety·Decision·예약에는 어느 모드도 입력되지 않는다.
- 적외색을 강수량이라고 부르지 않고, 수증기 채널에는 구름 높이처럼 보이는 효과를 붙이지 않는다.

## 구현 종료

- PR-01: `ImageryLayerGroup`과 ACTIVE→REPLACING→DISPOSING→DISPOSED 상태, 요청·object URL·
  listener·cache owner 회수를 NOAA/GK-2A/Himawari에 연결했다.
- PR-02: bounded promise LRU, 같은 tile promise 공유, worker/OffscreenCanvas 경로, main-thread
  fallback, 1px gutter와 입력 상한을 구현했다.
- PR-03: NOAA/GK-2A/Himawari의 소스·채널 정책과 golden contract를 고정했다. 시각 효과는
  원 관측 threshold와 alpha 의미를 바꾸지 않는다.
- PR-04: ESO 6000×3000 공식 원본의 SHA를 검증하고 6K/4K/2K content-hash WebP와 manifest,
  license registry를 재현 생성한다. 두 번 빌드한 파생 SHA가 같았다.
- PR-05: 자동/낮음/끔, save-data/reduced-motion/저메모리 하향, 키보드 focus와 `aria-pressed`,
  출처·시각·제한 설명을 운영에 반영했다.
- PR-06: HTTPS provider allowlist, 8192px·128MiB·worker 2개 상한, CDN SRI, referrer policy,
  라이선스·asset hash audit를 적용했다. CSP는 기존 inline/host 부채 때문에 enforcement하지 않고
  report-only 후보를 보존했다.
- PR-07: fresh Chrome에서 1280×720, 390×844 DPR2 save-data, 1600×900 DPR2, offline 복귀,
  effect OFF, context loss, 30회 source 교대를 검증했다. 지정 실기기는 아래처럼 UNKNOWN이다.
- PR-08: 34개 선택 객체, S3 rollback copy, 실제 index 복원→재적용, 35경로 CloudFront
  invalidation, live SHA/MIME/UI 검증을 마쳤다.

## 수치 증거

| 항목 | 결과 |
|---|---|
| ES module identity | 191개 파일, mismatch 0 |
| 같은 frame/z/x/y 중복 요청 | desktop/mobile 0 |
| mask p95 | Himawari 1.6~3.2ms, GK-2A 3.7~4.1ms |
| 위성 OFF 뒤 | sibling 0, cache 0, idle render 0 |
| desktop 30회 교대 | 매회 layers 3 / live textures 679 / cache 0 |
| effect OFF | base 1→1 유지, depth hidden=true |
| 정상 실행 오류 | 세 viewport 모두 page 0 / console 0 |
| 가로 overflow | 세 viewport 모두 0 |
| sky 선택 | desktop/Retina 6K, save-data mobile 2K |
| context loss | canvas 복귀, desktop/Retina 4K, save-data mobile 2K |
| 운영 객체 SHA | 34/34 local과 S3 동일 |

`opening-earth`의 intro 동안만 desktop render owner가 잠깐 존재한다. intro가 끝난 위성 장면과
OFF 뒤에는 3초 idle render가 0이다. 이것을 무한 렌더로 세지 않는다.

## 운영 릴리스

- CloudFront invalidation: `I9KBZQDXQ5M638WDJ36B3RLNNU` (35개 정확 경로),
  `I3ANIDEK62HBSQ85GPICCPNMWQ` (최종 공백 정리 6개 정확 경로)
- rollback copy: `s3://earthus-cache-kr/rollback/earthus-visual-20260813T2325KST/app/`
- rollback rehearsal: 운영 index ETag `262ed452...` 복원 확인 후 후보 `b770449c...` 재적용
- live SHA: index `a86e48b...`, main `402e3c70...`, 6K sky `a68eeb03...`
- live headers: HTML/JS `no-cache`, content-hash WebP `public,max-age=31536000,immutable`

배포 계정에는 `s3:GetBucketVersioning`, `cloudfront:GetInvalidation/ListInvalidations` 권한이 없다.
따라서 S3 version ID와 invalidation 완료 API는 `UNKNOWN`으로 남겼다. 대신 롤백 객체의 ETag,
실제 복원→재적용, CloudFront `Miss` 응답과 live byte SHA를 직접 검증했다.

## 실패 응답의 해석

- GIBS의 장면 시각·위성 원판 밖 탐색 타일은 404가 정상적으로 섞인다. 앱 오류나 합성값으로
  바꾸지 않고 빈 tile로 남긴다.
- GK-2A 동아시아 상세에서 범위 밖 1개 tile key가 S3 403을 반환했다. Cesium 1.143의
  regional rectangle freeze 사고 때문에 provider를 전역으로 두는 기존 안전 주석을 보존한
  결과다. 전면 base와 상세 본체는 렌더됐고 정상 실행 console error는 0이다.

## 남은 UNKNOWN

- 최신/이전 Safari, 지원 최저/최신 iPhone, 저사양 Android 실제 기기
- VoiceOver 또는 동등 스크린리더의 실제 발화 순서
- 10분 조작·5분 유휴의 온도와 배터리 수치

이 세 항목은 코드 실패가 아니라 이 자동화 호스트에 기기와 Safari WebDriver가 없어 측정하지
못한 승인 항목이다. 실기기 표를 채우기 전에는 “모든 기기 검증 완료”라고 말하지 않는다.

## 증거

- [`evidence/pr00/baseline.json`](evidence/pr00/baseline.json)
- [`evidence/pr07/report.json`](evidence/pr07/report.json)
- [`evidence/pr07/README.md`](evidence/pr07/README.md)
- [`release-manifest.v1.json`](release-manifest.v1.json)
