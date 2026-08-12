# TPW 수증기 통로 — PR-00A 실행 계약

> 승인: 2026-08-12 PD 직접 지시
> 상태: 로컬 코드·NOAA 실파일·실화면 검증 완료 · 서울 Lambda/S3/flag/배포 대기

## 1. 사용자 결과

첫 화면의 아름다운 지구본은 그대로 둔다. 사용자가 `지구 스타일 → 기상 → 수증기 통로`를
선택했을 때만 동아시아·서태평양의 대기 기둥 전체 수증기량을 선명한 단계색으로 본다.
주요 도시에는 가장 가까운 실제 격자값을 표시하고, 지구를 누르면 같은 원격자값을 범례에 붙인다.

기존 `천리안2A 수증기`는 약 6~8km 중상층 영상이고 이 레이어는 지면부터 대기 상단까지의
총량이다. 둘을 합치거나 이름만 바꿔 대체하지 않는다.

## 2. 데이터 흐름

```text
NOAA GFS total_column_integrated_water_vapour
→ NOAA/NCEP NOMADS 0.25° PWAT 지역 필터 (HTTP 1회 · 약 100KB)
→ ecCodes 해독 → 정확히 겹치는 1° 원격자만 추출(보간 없음)
→ aws/tpw-grid (1° · 20~55°N · 90~180°E)
→ s3://earthus-cache-kr/wind/tpw-ea.json
→ gridOverlay regional renderer
→ 단계색 + 범례 + 도시값 + 지점값 + 출처/유효시각/한계
```

- `dataKind=MODEL_ANALYSIS`: 위성 관측이 아닌 GFS f000 분석장이다.
- `validAt`: 모델장이 유효한 시각이다.
- `issuedAt`, `validAt`: 원본 GRIB의 `dataDate/dataTime`, `validityDate/validityTime`에서 읽는다.
- 단위는 원본 `kg/m²`, 화면은 동등한 물 깊이 `mm`다.
- `n=filled`, `failed=전체 격자-실제 값`: 결측을 0으로 채우지 않는다.
- 98% 미만 수신, PWAT가 아닌 변수, 예상 밖 단위, 시각 결측이면 publish하지 않는다.
- Open-Meteo 100지점×33 request 방식은 전체 실측에서 429가 반복되어 폐기했다.
- NOMADS 필터는 회차당 HTTP 1회다. 최신 회차가 아직 없으면 6시간씩 뒤로 물러난다.
- Lambda는 매시간 최신 회차를 확인하지만 source freshness 판정은 GFS 분석장 주기인 6시간을 쓴다.

## 3. 화면 규칙

- CIMSS 이미지·색표를 복제하지 않고 EARTHUS 자체 단계색을 쓴다.
- 지역 격자는 경도를 전지구처럼 순환시키지 않는다. 90~180°E 밖은 null이다.
- 도시 라벨과 탭 값은 보간 픽셀이 아닌 가장 가까운 1° 원격자다.
- `1° ≈ 111km`, 범위, 출처, 유효시각, 모델장임을 좌하단에 표시한다.
- 높은 TPW만으로 비·호우·태풍·안전 상태를 판정하지 않는다.
- 레이어 해제 시 라벨 primitive와 상태를 즉시 비우고 추가 렌더 루프를 만들지 않는다.

## 4. 권리·운영 gate

- CIMSS MIMIC-TPW2는 비상업 이용조건 때문에 화면 참고만 하고 ingest하지 않는다.
- 운영 데이터는 NOAA/NCEP GFS를 NOMADS에서 직접 받으며 미국 연방정부 공개영역으로 기록한다.
- NOMADS는 운영 SLA가 아니다. 장애 시 다른 모델을 같은 source인 척 대체하지 않고 last-good/stale을 표시한다.
- 실제 Lambda 배포, S3 JSON 확인, 화면 QA, attribution 승인이 모두 끝난 뒤에만
  `CONFIG.TPW_READY=true`로 바꾼다.

## 5. 순서와 완료 조건

1. collector parser/contract unit test
2. 지역 격자 경계·날짜변경선·null unit test
3. 메뉴/배타 레이어/범례/도시·탭 값/질문 라우팅 연결
4. 문법·JSON·diff·기존 테스트
5. 서울 리전 NOMADS GRIB·ecCodes·timeout·메모리 확인
6. S3 객체 metadata·유효시각·n·결측·범위 확인
7. 데스크톱·모바일 실제 화면에서 한국/일본/서태평양/범위 밖/on-off/idle render 검증
8. 권리와 운영 승인 후 flag on, 파일별 배포, CloudFront 무효화, live hash/console 재검증

1~4는 로컬 코드 완료 조건이다. 2026-08-12 로컬 실측에서 NOAA GRIB
101,981 bytes, 91×36=3,276/3,276, 5.5~79.0mm, run=valid 12:00 UTC를 해독했다.
임시 실화면에서 첫 지구 보존, 단계색, 서울 31mm·부산 25mm 원격자 라벨,
NOAA/시각/모델·비 아님 고지, 해제 후 라벨 제거, 390×844 진입, flag-off 검색
우회 차단과 console warning/error 0을 확인했다. 단, 이는 AWS 서울 리전·S3·
운영 CloudFront 검증을 대신하지 않는다. 5~8 전에는 운영 완료라고 부르지 않는다.
