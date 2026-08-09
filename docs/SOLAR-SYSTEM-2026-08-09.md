# B3 태양계 장면 검증 기록 — 2026-08-09

## 정본과 계산 범위

- 궤도요소·공식: NASA/JPL Solar System Dynamics, `Keplerian Elements for Approximate Positions of the Major Planets`, Table 1.
- 공식 URL: `https://ssd.jpl.nasa.gov/planets/approx_pos.html`
- 적용 범위: 1800–2050년, J2000 평균 황도면·춘분점 기준, 태양중심 근사 위치.
- `prototype/js/space/kepler.js`는 원반축·이심률·경사각·평균황경·근일점 황경·승교점 황경과 세기당 변화율을 JPL 표에서 그대로 쓴다.
- 런타임 네트워크 호출은 0회다. 날짜를 입력하면 케플러 방정식을 풀어 8행성의 태양중심 황도 좌표를 계산한다.

## Horizons 완료 게이트

- 검증 API: JPL Horizons API `VECTORS`, 중심 `500@10`(태양), `REF_PLANE=ECLIPTIC`, `VEC_CORR=NONE`, `AU-D`.
- 대조 시점: 2000-01-01, 2026-08-09, +30일(2026-09-08), +1년(2027-08-09).
- 대조 대상: 수성·금성·지구·화성·목성·토성·천왕성·해왕성 × 4시점 = 32건.
- 결과: 32건 모두 황경 오차 1° 미만. 최악은 2000-01-01 토성 0.1436°.
- 실행: `python3 tools/verify_kepler.py --base-date 2026-08-09`
- 검증기는 배포용 JS 모듈을 Node에서 직접 실행하고 Horizons 벡터와 비교한다. Python에 따로 복제한 계산식만 시험하지 않는다.

## 화면과 한계

- 전체 태양계 안에 8행성·궤도선을 보이고, 중심에 겹치는 수성–화성은 1.75AU 확대 창에서 다시 보여 준다.
- 기본 행성 크기는 과장이며 화면에 상시 밝힌다. `실제 크기 비율`을 켜면 실제 행성이 화면의 1픽셀보다 작다는 사실을 위치표시 1픽셀로 보여 준다.
- 행성의 색은 구분을 위한 시각 표현이며 실제 관측색으로 설명하지 않는다.
- 기본은 정지 화면이다. 날짜 조절·크기 변경에만 그리고, 사용자가 재생을 누른 동안만 rAF를 쓴 뒤 2050년 경계에서 멈춘다.
- 교육용 근사이며, 관측 조준·우주비행은 JPL Horizons를 써야 한다.

## 배포 체크

- [x] JS/Python 문법·Horizons 32건 대조 재통과
- [x] 로컬 한국어·운영 영어, 실제 크기, 재생 후 날짜 정지 검증
- [x] 운영 S3·CloudFront 배포 후 6개 정적 파일 바이트 대조·JavaScript Content-Type 확인
- [x] `earthus.net/?solar=1` 운영 장면에서 2026-08-09 영어 표시·크기 토글·재생 정지·한계 문구 확인
