# PR-06 Continuous Layers — 단계색·등치선·원값 판독 계약

> 구현/검수: 2026-08-12 KST
> 범위: 기온·내일 최고/최저·기압·바람·TPW 계약·SST·SST 편차·파고
> 비범위: 점 관측 보간, TPW 운영 flag on, 미래 시간축 생성, AI 위험/날씨 결론

## 1. 사용자가 얻는 변화

query 없는 첫 화면은 NOAA 구름을 얹은 아름다운 지구 그대로다. 사용자가 지구 스타일에서
연속 수치 레이어를 고른 뒤에만 다음 한 묶음이 보인다.

1. 구간 경계가 섞이지 않는 단계색
2. 같은 원격자·같은 시각에서 만든 등치선과 선값 라벨
3. 현재 화면 주요 도시의 최근접 원격자값
4. 지점을 누른 좌표·원격자값·단위·시각·출처 Evidence
5. 범례의 해상도·유효 원격자 `n`·위도 범위·등치선 기준·결측 처리

Windy의 빠른 판독 장점은 가져오되 색표·화면 배치를 복제하지 않는다. EARTHUS는 모델값,
계산값, 기관 발표를 배지와 출처로 구분하고 없는 값이나 정밀도를 만들지 않는다.

## 2. 변수별 고정 계약

| 레이어 | 색면 | 등치선 | 숫자 | 근거/한계 |
|---|---|---|---|---|
| 현재 기온 | 10~15°C 계열 단계색 | -25,-10,0,10,20,30,40°C | °C 원격자 | 전지구 모델 5° |
| 내일 최고/최저 | 각 전용 단계색 | 범례 경계값 | °C 원격자 | 일 최고/최저, 시간별 지도로 표현하지 않음 |
| 기압 | 970~1040hPa 단계색 | 4hPa + H/L | hPa 원격자 | 선은 동아시아 1° 전용판, 전지구 5°로 가짜 정밀선 금지 |
| 바람 | u/v 크기 단계색 | 2,5,10,15,20,30,45m/s | m/s 원격자 | 색/숫자는 `sqrt(u²+v²)`, 입자는 방향 판독용 과장 |
| TPW | 10mm 단계색 | 10~70mm | mm 원격자 | 계약만 완료; 운영 객체 403·`TPW_READY=false` 유지 |
| SST | 해양 전용 단계색 | 4,10,16,22,26,29°C | °C 원격자 | 전지구 5°, 동아시아 확대 0.5° |
| SST 편차 | 0 중심 발산 단계색 | -1.5,-0.5,0,0.5,1.5°C | °C 원격자 | 실황과 NOAA OISST 1991–2020 평년장의 동일 5° 격자만 계산 |
| 파고 | 1,2,3,4,6,9m 경계 단계색 | 같은 경계값 | m 원격자 | 전지구 5°, 동아시아 확대 0.5° |

등치선은 마칭 스퀘어로 생성한다. 네 꼭짓점 중 하나라도 결측이면 그 칸은 제외한다.
짧은 선분은 경로로 이어 Cesium 엔티티 수를 줄이고, 긴 경로부터 레벨당 최대 두 라벨만 둔다.
날짜변경선 마지막 칸은 배열 인덱스만 감고 좌표는 +180°까지 이어 지구를 관통하는 선을 막는다.

## 3. 수명·발열 계약

- 등치선은 `earthus:grid-ready` 때 한 번 만들고 레이어 off에서 전부 제거한다.
- `setInterval`/`requestAnimationFrame`을 추가하지 않는다.
- `clampToGround`를 쓰지 않고 9km 유한 높이에 둔다.
- 카메라가 동아시아 보강판 경계를 넘었을 때 source bucket이 달라진 경우만 한 번 다시 그린다.
- 실제 화면 계측에서 기온 73 paths/12 labels, 풍속 254/10, SST 75/12,
  SST 편차 314/10, 파고 139/11, 기압 20/11이었다. 자료값에 따라 개수는 변한다.
- 파고 Data View를 3초 정지시킨 `data-total-renders` 차이는 0이었다.
- 바람의 2D 입자 캔버스는 기존 동작이다. 이번 PR은 Cesium 등치선 무한 렌더를 만들지 않는다.

## 4. 검증 증거

- `tools/test_continuous_layers.mjs` 36/36
- Readability 16/16, Earth route 12/12, Safety 23/23, TPW grid math 통과
- AETHERUS foundation/astronomy/photo ownership/Sky AR/astrometry/planner/session 회귀 통과
- 실화면 1280×720: 첫 Earth, 기온, 기압, 바람, SST, 편차, 파고 확인
- 실화면 390×844: 바람 패널 x=7..383, 가로 overflow 0, 등치선 254·라벨 10 확인
- query 없는 `/`: Readability hidden, contour data attribute 없음, 활성 데이터 레이어 0
- 실운영 원자료: wind/global 72×33 5°, pressure-ea 51×31 1°, marine 72×33 5°,
  marine-ea 73×49 0.5° 확인. TPW 객체는 403이므로 flag를 켜지 않음.

실 Safari·구형 iPhone 10~15분 열/배터리와 동아시아 0.5° 카메라 전환의 실제 기기 검수는
장비가 없어 남아 있다. 이 미검증을 통과로 표기하지 않는다.

## 5. 롤백

정적 파일만 이전 커밋으로 되돌린다. `index.html`, `css/readability.css`,
`js/{contour-math,continuous-contours,gridoverlay,isobars,layers/registry,main,readability,
render-quality,store,earth-view-state}.js`를 올바른 Content-Type과 `no-cache`로 재업로드하고
같은 경로를 CloudFront 무효화한다. 데이터 수집 Lambda·TPW flag·AETHERUS 파일은 건드리지 않는다.
