# EARTHUS Data View 국가 경계·해안선 운영 릴리스

> 배포 시각: 2026-08-12 23:09 KST
> CloudFront: `E193CZEBLWEB56`
> 무효화: `IDZOZH3GEQ6LDKFA21N9RJW659`

## 1. 해결한 문제

온도·습도·기압 같은 연속 색면을 켜면 EARTHUS 도시 원격자값은 보이지만, 색면 아래의
국가·해안선이 흐려져 도시가 어느 국가에 속하는지 즉시 판독하기 어려웠다.

- Data/Evidence/Decision의 격자 화면에 국가 경계·해안선·국가/주요 지명을 자동 표시한다.
- query 없는 첫 Earth View와 Style View에는 참조 지도를 올리지 않는다.
- 기존 `판독 모드`는 같은 참조 지도의 alpha·brightness·contrast를 높이는 강화 단계다.
- 참조 지도를 표시하는 동안 화면에 Esri·Garmin·HERE·OpenStreetMap contributors·GIS
  user community attribution을 항상 보인다.
- 타이머·무한 애니메이션·`clampToGround`를 추가하지 않았다.

## 2. 배포 범위와 운영 일치

운영에는 변경 런타임 한 파일만 선택 업로드했다.

| 운영 경로 | Content-Type | Cache-Control | SHA-256 |
|---|---|---|---|
| `/js/readability.js` | `text/javascript; charset=utf-8` | `no-cache` | `b60a8312caf76628d1ce379858920fe8de7a1ccf490acf6db107a1c12ebae63e` |

cache-busting 운영 응답은 서울 CloudFront POP `ICN53-P1`에서 HTTP 200을 반환했고,
로컬 파일과 운영 응답의 SHA-256이 byte 단위로 일치했다. S3 객체는 AES256이다.

## 3. 실제 화면 검수

- 로컬 1280×720: 기온 전지구·한반도 확대·습도·판독 모드·첫 Earth 통과
- 로컬 390×844: 국가/해안선, 도시 원격자값, 등치선, 범례 동시 표시와 가로 overflow 0
- 운영 1280×720: 기온 Data에서 attribution과 자동 참조 지도 표시
- 운영 한반도 확대: 남북 경계·해안선·`SOUTH KOREA`·주요 도시 지명 확인
- 운영 query 없는 첫 Earth: 판독 패널·참조 credit·Data class 모두 없음
- 운영 390×844: `scrollWidth=innerWidth=390`, 패널 화면 안, console warning/error 0

## 4. 자동검사

- Readability 19/19
- Continuous Layers 40/40
- Earth route 12/12
- Safety Engine 23/23
- PR-11 보호 gate: 판매·TPW·Decision UI·SNS 자동 게시 잠금 PASS
- 변경 JS `node --check`, `git diff --check` 통과

## 5. 권리·제품 경계

참조 지도는 기존 Esri `World_Boundaries_and_Places` live tile 계약을 그대로 사용한다.
표시와 attribution만 허용하며 cache/history/export/derivative/AI 학습 자료로 재사용하지 않는다.
국가명·경계는 참조 타일이 제공하는 표기이며 EARTHUS가 새 영토 판단을 생성하지 않는다.

## 6. 롤백

`prototype/js/readability.js`만 이 커밋 직전 revision으로 되돌려 같은 S3 경로에
`text/javascript; charset=utf-8`, `no-cache`로 다시 올리고 `/js/readability.js`를
CloudFront 무효화한다. 데이터 수집기, Safety, Decision, AETHERUS 파일은 롤백 범위가 아니다.
