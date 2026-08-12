# 03 — 다음 개발 공통 기준

## 제품 철학

EARTHUS는 예보를 만드는 AI가 아니라, 공공 관측·기관 발표·허용된 모델을 한 지구에서
정직하게 읽게 하는 증거 제품이다. 첫 화면은 아름다운 지구이고, 데이터는 사용자가 선택한다.

## 데이터 계약

모든 공개 값에는 가능한 범위에서 다음이 있어야 한다.

- `sourceId`, 사람에게 보이는 출처, 원문/공식 URL
- `observedAt`, `issuedAt`, `validAt`, `receivedAt`, 원 timezone
- 원 단위, canonical 단위, 변환 version
- 원 CRS, canonical EPSG:4326, 변환 version
- `n`, 결측수, 제외수, `missingReason`, quality flag
- revision/checksum, freshness, license/terms/reviewDueAt
- display/cache/history/export/derivative/AI/API resale별 권리

결측을 0·최솟값·안전값으로 바꾸지 않는다. 원값을 품질상 제외해도 audit 필드에 보존한다.

## 안전과 AI

- 공식 특보·폐쇄·위험 기관 발표는 Activity 점수보다 먼저다.
- 공식 근거가 없으면 `UNKNOWN`; 특보 0건도 자동 `SAFE`가 아니다.
- AI는 날씨 수치, 특보, 폐쇄, 재고, 가격, 예약 성공, 사건 원인·경로·도착·피해를 생성하지 않는다.
- Grounded Fusion은 cited evidence ledger만 요약하며 tool/action endpoint를 직접 실행하지 않는다.
- 안전 정보는 무료이며 상업 추천과 섞지 않는다.

## 지도·시각

- 첫 Earth에는 수치·경계·패널을 자동으로 덮지 않는다.
- 연속 격자만 색면·등치선을 만들고 점 관측·위성·재난 점을 가짜 보간하지 않는다.
- 국경·해안선은 판독 reference이며 영토 판단·공식 안전 geometry로 쓰지 않는다.
- Natural Earth 흰색 해안선은 전지구 1:110m, 동아시아 1:10m 시각 reference다.
- source가 가진 해상도보다 정밀한 선·점·문구를 만들지 않는다.
- 관측·공식예보·모델분석·기관발표·계산·지연·부분결측·품질제외 배지를 표준화한다.

## 성능·접근성

- `clampToGround`, 무한 애니메이션, 해제 후 남는 timer/network/render owner를 금지한다.
- 유한 동작은 owner key와 cancel 경로를 가진다. 숨김 탭과 레이어 off에서 0이 목표다.
- 44px 터치, 키보드, Escape, focus 복귀, reduced motion, screen reader 이름을 검증한다.
- 390×844뿐 아니라 430×932, 768×1024, 1280×720, 1440×900과 실제 Safari/iPhone을 본다.

## 구현·검증·배포

- adapter와 fixture를 먼저 만들고 dual-read·shadow·canary·rollback을 거친다.
- provider 성공·권리·quota·AWS 서울 네트워크를 추정하지 않고 실측한다.
- 단위/경계/날짜변경선/DST/결측/지연/대치·해제/오류 fixture를 둔다.
- 실제 화면은 지역·줌·레이어·조합별로 확인한다. unauthenticated smoke만으로 DB/UI 성공을 말하지 않는다.
- 빌드 없이 `prototype/`의 완료 파일만 S3에 올리고 Content-Type/Cache-Control을 명시한다.
- CloudFront 무효화 뒤 live hash·MIME·실데이터·console·mobile을 확인한다.
- dirty tree에서는 작업 파일/hunk만 stage하고 한국어 커밋 제목에 무엇이 잘못됐는지 쓴다.
- 판매·예약 실행·SNS 게시·권리 승인·외부 계정 행동은 기능 구현과 별도 승인이다.
