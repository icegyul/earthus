# ADR-002: surface-passive-advection.v2.windage

상태: 제안(사전등록 단계). 2026-09-05. V1(ADR-001)은 그대로 두고 별도 모델 버전으로 만든다.

## 1. 연구 질문

HYCOM 15 m 해류에 **10 m 바람의 일정 비율(윈디지)** 을 더하면, 같은 drogue 부착 SVP 부표 21기·같은 72 h·같은 기준선에서 V1보다 분리거리가 줄어드는가? 그리고 V1이 실패한 C1(정지 기준선을 이김)을 통과하는가?

## 2. V1의 한계

V1은 15 m 결정론 이류만 계산했고, 2015-01-05 코호트에서 72 h 중앙 분리 24.3 km로 정지 기준선 19.2 km를 이기지 못했다(FAIL / NOT_ACCEPTED, `evidence/gdp-hycom-cohort-201501/IMMUTABLE-V1.json`). 부표는 표면 부이가 바람을 받아 drogue 깊이의 물보다 미끄러진다(slip). V1에는 이 항이 없다.

## 3. V2를 만드는 이유

V1의 물리 범위를 한 항만 넓혀, 그 한 항이 결과를 얼마나 바꾸는지 **같은 코호트·같은 기준**으로 잰다. 코호트·기준을 바꾸지 않으므로 차이는 모델 물리에서만 나온다.

## 4. 물리적 가정

- 부표 이동속도 = drogue 깊이 해류 + 바람 비례 항. Sutherland et al. (2020)이 정리한 표준 leeway 모델(Allen & Plourde 1999; Breivik & Allen 2008): **u_d = u_o + α·U10**. Stokes drift·파랑 정류는 α 안에 암묵적으로 들어간다(명시 항 없음).
- α는 방향 무관 스칼라(cross-wind 성분·발산각 없음).
- 확산·수직 혼합·drogue 깊이 변화 없음(V1과 동일).

## 5. 입력 자료

| 항목 | 자료 | 비고 |
|---|---|---|
| 해류 | V1과 **동일 파일**: HYCOM GOFS 3.1 15 m, 3 h, 0.08° (IMMUTABLE-V1 해시) | 재다운로드 없음 |
| 바람 | NCEP-DOE Reanalysis 2 `uwnd.10m`/`vwnd.10m`, 6 h, T62 가우시안(~1.9°), PSL NCSS 익명 취득 2026-09-05 | `fixtures/gdp-hycom-cohort-201501/wind-ncep-r2/`, SHA uwnd `0e3cefc0…`, vwnd `b284a3ce…` |
| 관측 | V1과 동일 21기 패키지(해시 고정) | — |

바람은 ERA5가 더 낫지만 CDS 자격증명이 없어 **자격증명 없이 받을 수 있는 재분석** 중 6시간 10 m 바람을 제공하는 NCEP-R2를 쓴다. 1.9° 격자는 해류 0.08°보다 훨씬 거칠다 — 종관 규모 바람만 담는다. 이는 결과 해석의 알려진 한계다.

## 6. 윈디지 공식과 매개변수 출처

- 공식: `u_particle(t,x) = u_HYCOM15(t,x) + α · U10_NCEP(t,x)`, RK4 각 단계에서 두 장을 같은 위치·시각으로 보간해 합산.
- **α 주값 = 0.0007** — Lumpkin & Pazos, *Measuring surface currents with SVP drifters* (Cambridge, ch. 2): "As long as the drogue remains attached to the drifter, the downwind slip is estimated at 0.7 cm/s per 10 m/s of wind speed (Niiler and Paduan, 1995)." 코호트는 전원 drogue 부착이므로 이 값이 물리적으로 맞는 유일한 주값이다.
- 민감도 값(판정에 쓰지 않음): 0(=V1 회귀 검사), 0.0086(같은 문헌의 drogue 없는 SVP 8.6 cm/s per 10 m/s), 0.01·0.03(Breivik & Allen 2008 계열 leeway 1~3%, 부유물 기준). 이 값들은 "drogue 부착 부표에 맞지 않는 값이 결과를 얼마나 흔드는가"를 보여 주기 위한 것이며, 가장 좋은 값을 고르는 데 쓰지 않는다.
- 결과를 본 뒤 α를 고르는 fitting은 금지한다. Sutherland et al.이 지적하듯 α를 궤적에 맞추면 항상 "완벽한" 재현이 나오며 그것은 검증이 아니다.

## 7~11. 시간 간격 · 해상도 · 적분 · 경계 · 결측

- 적분 간격 300 s, 출력 3600 s, RK4 — V1과 동일.
- 해류 보간 쌍선형·선형(V1과 동일). 바람 보간 쌍선형·선형; 6 h 프레임 사이 선형. 외삽 금지.
- 경계·육지·영역 이탈 규칙 V1과 동일(STOP_AT_FIRST_CROSSING, 결측≠0속도). 바람 결측 노드는 `MISSING_FORCING`.
- 바람 시간축: PSL 파일의 time 좌표를 유효시각으로 본다(파일 long_name "6-Hourly Forecast of U-wind at 10 m"). 이 가정은 매니페스트에 적는다.

## 12. 재현성

- 새 모델 ID/버전: `surface-passive-advection.v2.windage` / `0.1.0`. V1 상수는 건드리지 않는다.
- provenance에 `windageAlpha`, `windDatasetSha256`, `windReaderVersion`, 해류 해시, 모델 소스 해시, 의존성 잠금 해시를 기록. 동일 입력 replay 해시 일치가 시험 항목.
- 결정론(난수 없음). `randomSeed: null`.

## 13~15. 검증 · V1/V2 비교

`fixtures/gdp-hycom-cohort-201501/validation-plan-v2.json` — **계산 전에 단독 커밋**. 기준 C1~C4는 V1과 문자 그대로 동일, C5(짝비교로 V1 72 h 중앙값보다 작음)만 추가. 사전 예측도 적는다: α=0.0007·바람 ~8 m/s면 윈디지 항은 하루 0.5 km 규모라 **72 h 변화가 2 km 미만일 것으로 예상하며, C1은 여전히 실패할 가능성이 크다**. 이 예측이 맞으면 "조용한 환류의 V1 실패는 윈디지 부재 때문이 아니다"가 결론이다.

## 16. 알려진 한계

- 바람 1.9°/6 h — 중규모 바람 없음. 결과가 좋아도 나빠도 바람 해상도 효과와 분리되지 않는다.
- Stokes drift 명시 항 없음. 파랑 자료 없음.
- 코호트 1개(2015-01 북대서양, n=21). 다른 해역·계절·연안은 말할 수 없다.
- 이 ADR은 V2가 "더 낫다"는 주장이 아니다. 판정은 plan-v2의 규칙으로만 한다.

## 출처

- Lumpkin, R., Pazos, M. *Measuring surface currents with Surface Velocity Program drifters* — https://www.aoml.noaa.gov/phod/docs/LumpkinPazos.pdf (Niiler & Paduan 1995 인용).
- Sutherland, G. et al. (2020) *Evaluating the leeway coefficient for different ocean drifters using operational models* — https://arxiv.org/abs/2005.09527 (식 (1), Breivik & Allen 2008 구현).
- NCEP-DOE AMIP-II Reanalysis (Kanamitsu et al. 2002), NOAA PSL — https://psl.noaa.gov/data/gridded/data.ncep.reanalysis2.gaussian.html
