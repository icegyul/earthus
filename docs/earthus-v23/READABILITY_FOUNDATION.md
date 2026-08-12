# PR-04 — V0 Readability Foundation

> 구현일: 2026-08-12 KST
> 상태: 정적 운영 배포 완료 · Safari/구형 iPhone과 idle render 계측 남음

## 사용자 결과

query 없는 첫 화면은 기존의 아름다운 3D 지구다. 사용자가 수치 레이어를 고른 뒤에만 다음이 열린다.

- 화면을 실제로 칠한 색표의 모든 경계값과 단위
- 자료 유효시각, 격자 해상도, 유효 원격자 수 `n`
- 현재 화면 안에서 겹치지 않게 고른 도시의 가장 가까운 실제 원격자값
- 지점을 누르면 좌표·원격자값·단위·시각·출처를 묶은 근거 카드
- Data View 진입 즉시 보이는 국가 경계·해안선·국가/주요 지명
- 전지구 1:110m·동아시아 1:10m Natural Earth 흰색 해안선과 어두운 대비 halo
- 같은 참조 경계를 더 선명하게 겹치는 판독 모드
- 레이어를 초기화하고 감상용 지구로 돌아가는 `지구 보기`

## 데이터 정직성

- 도시와 지점 숫자는 보간된 PNG 픽셀이 아니라 `nearestGridValue` 원격자값이다.
- `viewRectangle`만 믿지 않고 카메라 지평선과 실제 캔버스 좌표를 함께 검사해, 지구
  반대편 도시를 현재 화면 숫자로 잘못 표시하지 않는다.
- 범위 밖과 결측은 0으로 바꾸지 않는다.
- 모델, 모델 예보, 모델 분석장, computed 편차를 배지로 구분한다.
- 점 관측·위성·재난 자료에는 이 엔진으로 연속면이나 등치선을 만들지 않는다.
- `n`은 현재 화면 표본 수가 아니라 배포 격자의 유효 원격자 수다.
- 참조 지도는 Esri World Boundaries and Places다. 앱이 Cesium 기본 credit 영역을 숨기므로
  provider metadata에만 의존하지 않고 판독 패널에 `Esri, Garmin, HERE, © OpenStreetMap
  contributors, and the GIS user community`를 직접 표시한다.
- 참조 타일은 판독을 돕는 화면 표시만 허용한다. EARTHUS가 저장·내보내기·파생·AI 입력으로
  재사용하지 않으며 해당 범위를 넓히려면 Esri 이용조건을 다시 승인한다.
- 흰색 해안선은 public-domain Natural Earth coastline을 pinned source commit에서 재현해
  정적 번들로 제공한다. 전지구는 가벼운 1:110m, 한국·일본을 포함한 동아시아는 1:10m이며
  위치 판독용일 뿐 공식 영토·안전·정밀 해안 geometry가 아니다.

## 상태와 성능

- URL `earthRead=1`이 판독 모드를 복원한다. 기본 Data URL도 국가·해안선은 얇게 보이고,
  판독 모드는 같은 참조 지도의 alpha·brightness·contrast를 높인다.
- `earthRead`는 Earth/Style에 붙지 않고 잘못된 값은 false로 낮추며 issue를 남긴다.
- 카메라 이동 중 계산하지 않고 기존 `onCameraIdle` 뒤에 라벨을 한 번만 다시 만든다.
- `setInterval`, `requestAnimationFrame`, 무한 애니메이션을 추가하지 않는다.
- 레이어 off 또는 Earth/AETHERUS/해구 전환 시 참조 타일과 LabelCollection을 제거한다.
- 별도 해안선 Primitive도 Data/Evidence/Decision 밖에서는 제거하며 `clampToGround`나
  timer·무한 렌더를 만들지 않는다.

## PR-06으로 넘긴 것

PR-04는 공통 판독 UI와 원값 경계를 만든다. 실제 등온선·등습선·파고선·SST 선은 연속장별
간격·결측·성능을 검증하는 PR-06에서만 추가한다. 점 관측을 보간해 등치선을 만드는 구현은 금지한다.
