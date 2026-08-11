# 대기 이동 엔진 — 비공개 재현 스파이크

## 현재 판정

`aws/atmos-transport-spike`는 산불 연기·화산재 또는 황사를 예측하지 않는다. FIRMS 열점군을
출발점으로 두고 850·700·500hPa 바람을 각각 따라갔을 때 계산이 얼마나 갈리는지 기록한다.
중심선·도달 시각·건강/항공 판단을 만들지 않고 `archive/`에만 저장한다.

## 지금 실제로 있는 입력

| 입력 | 실제 상태 | 역할 |
|---|---|---|
| NASA FIRMS VIIRS 375m | 24시간 열점군, 지속 `fid`, FRP·탐지 수·시각 | 열원 후보. 산불 확정 아님 |
| Open-Meteo Air Quality(CAMS 기반) | 전지구 5° 현재 AOD·PM2.5·먼지 | 현재 환경 참고. 연기·황사 기원 판별 불가 |
| Open-Meteo 수치모델 바람 | 500·700·850hPa 시간별 | 고도별 바람 민감도. 화학수송 모델 아님 |
| AirKorea 실측 | 한국 PM10·PM2.5 관측소 | 향후 관측소 도달 연쇄 검증 |

## 공개 전 반드시 붙일 것

1. CAMS Global Atmospheric Composition Forecast 직접 입력
   - 0.4° 전지구, 00/12UTC, 5일, 단일층 1시간·다층 3시간
   - 유기물/검댕 AOD와 혼합비, 먼지 크기별 AOD·혼합비, 침강·강수·경계층
   - 수정 자료 표기: `Contains modified Copernicus Atmosphere Monitoring Service information [연도]`
   - 자료: <https://ads.atmosphere.copernicus.eu/datasets/cams-global-atmospheric-composition-forecasts>
   - 이용조건: <https://ads.atmosphere.copernicus.eu/licences/licence-to-use-copernicus-products>
2. 화산재는 NOAA AviationWeather WIFS의 공식 VAA/TAC 또는 관할 VAAC 공식 자료
   - 후보 API: <https://aviationweather.gov/wifs/api/collections/tac_advisory_reports>
3. 과거 실제 사건 최소 10건의 입력 회차와 종료 관측
4. 단순 지속 벡터 기준선, 공식 모델, 관측 검증의 오차·누락 비교
5. 유료 상세는 공개 S3가 아니라 서버 권한 확인 응답

CAMS GFAS v1.2는 연기 주입고도까지 제공하지만 공식 자료 페이지상 2025-12-03에 갱신이
중단됐다. 현재 운영 입력으로 쓰지 않고 2003–2025 과거 사건 검증 후보로만 둔다.
<https://ads.atmosphere.copernicus.eu/datasets/cams-global-fire-emissions-gfas>

## 현재 스파이크 계산

- 동아시아 범위 `5–75°N, 80–180°E`의 신선한 지속 열점군 중 FRP 상위 6개
- 고도별 경로를 섞지 않고 850·700·500hPa 세 시나리오로 분리
- 3시간마다 새 위치에서 해당 유효시각의 바람을 다시 조회해 24시간 적분
- 풍향은 `불어오는 쪽`에서 `가는 쪽`으로 180° 변환
- 결측이 생긴 시각에서 해당 시나리오를 중단
- 5° AOD·PM·먼지는 출발/끝 환경 참고값으로만 기록하고 좌표를 움직이지 않음

## 출력과 공개 조건

- 비공개: `archive/atmos-transport-spike/latest.json`
- LAB 보고서: 생성하지 않음
- 지도 경로선: 생성하지 않음

CAMS 직접 자료와 10건 사후검증을 통과한 뒤에만 `analysis/smoke-ash-reports.json` 또는
`analysis/air-pollution-reports.json`을 만들고 LAB에 합류시킨다.

## 2026-08-11 운영 스파이크 결과

- 신선한 실제 FIRMS 열점군 6개
- 고도별 시나리오 18개, 각 0·3·6·9·12·15·18·21·24시간 9점 모두 생성
- 같은 출발점의 24시간 뒤 500/700/850hPa 끝점 최대 간격:
  `285.2, 379.0, 301.0, 129.2, 1,025.6, 190.1km`
- 가장 큰 고도 민감도는 1,025.6km다. 이 단계에서 세 고도를 평균한 중심선은 만들지 않는다.
- 운영 출력은 `private, no-store`, `public=false`, `reportPublished=false`로 확인했다.
- 자동 실행은 등록하지 않았다. 방법과 입력을 확정하기 전 비용과 가짜 기록을 쌓지 않는다.
