# ADR-0004 — Source 권리를 기능과 판매보다 먼저 판정

- 상태: 로컬 평가 엔진 구현 · source별 운영 승인 미완료
- 결정일: 2026-08-12

## 결정

모든 source에 display/cache/history/derivative/redistribution/paidExport/APIResale/AI
권리 gate를 둔다. 화면에 보인다는 이유로 export·AI·판매 권리가 생기지 않는다.

## 이유

Open-Meteo hosted API, GVP, 에코뱅크, 바다거북, Met Office, ADS-B는 서로 다른
상업·재배포 조건을 가진다. 기능 완성 뒤 권리를 확인하면 상품·cache·학습 경로를 되돌리기 어렵다.

TPW의 시각 참고자료인 CIMSS MIMIC-TPW2는 비상업 조건이므로 이미지·색표·파일을 복제하지
않는다. 초기 Open-Meteo 지점 수집안은 전체 격자 429 실측으로 폐기했다. EARTHUS 구현은
NOAA/NCEP NOMADS의 GFS PWAT 원격자를 직접 받아 별도 단계색으로 렌더한다.

## 결과

- `BLOCKED/EXPIRED` source는 행 단위로 응답에서 차단한다.
- 기존 cache가 있어도 새 publish/export/AI에 쓰지 않는다.
- 판매 gate는 서버 checkout과 source registry를 함께 확인한다.
- 2026-08-12 `source-governance`에 DRAFT registry와 권리·freshness·provider health
  replay를 구현했다. 번들 entry는 모두 DRAFT이며 승인 actor·근거·효력·rollback 기록 없이는
  operation이 전부 차단된다. AWS·Control Plane·기존 reader는 변경하지 않았다.
