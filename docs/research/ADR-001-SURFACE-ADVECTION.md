# ADR-001: 표층 수동 이류 실행 엔진

상태: 로컬 구현에 OceanParcels 3.1.4 채택, 연구 운영 공개 판정과 분리. 2026-09-05.

## 결정

Python 3.12.14 Windows x64에서 고정 `parcels==3.1.4`의 **ScipyParticle + 공식 AdvectionRK4**를 실행한다. v1 범위는 정규 위경도 A-grid의 시간 의존 2차원 수동 이류다. 브라우저 파도 셰이더·화면 품질 설정은 계산에 관여하지 않는다. 합성장 전용 reference backend는 실제 데이터의 대체 엔진이 아니다.

최신 [Parcels 설치 문서](https://docs.oceanparcels.org/en/latest/installation.html)는 Python 3.10 이상과 Windows/macOS/Linux, conda-forge 경로를 지원한다. 이번 환경에서는 기존 Python과 작업 전용 `.deps`를 사용해 3.1.4를 설치했다. 설치된 3.1.4 배포 메타데이터·LICENSE.md에서 MIT를 확인했다. 버전을 고정한 이유는 실행된 코드와 결과를 추적하기 위해서다. 앞으로의 최신 API와 현재 고정 버전이 같다고 가정하지 않는다.

| 후보 | 검토 결과 | 선택 |
|---|---|---|
| OceanParcels 3.1.4 | 기존 고정 Python에서 실제 설치·수치 실행 성공, Scipy 모드로 컴파일러 요구 회피, 공식 RK4 재사용 | 로컬 첫 모델 |
| OpenDrift | conda/mamba와 Docker 경로, 해안 상호작용 선택 제공. 이 환경에서 설치·실행 비교하지 않음 | 대안으로 보류 |

OpenDrift는 [설치 문서](https://opendrift.github.io/install.html), [해안 처리 문서](https://opendrift.github.io/interaction_with_coastline.html), [공식 저장소 licence](https://github.com/OpenDrift/opendrift/blob/master/LICENSE)를 확인했다. 해당 licence 파일은 GPL v2이다. 라이선스와 포장 방식은 후보 선택 기록이며 과학 성능 순위가 아니다. 두 엔진을 함께 제품화하지 않는다.

## 수치·자료 제한

- 외부 좌표는 EPSG:4326 경도·위도다. 실제 수평 계산은 OceanParcels의 구면 근사이며 Geographic 변환은 위도당 111120m와 경도 cosine을 사용한다. WGS84 타원체 운동 방정식이라고 주장하지 않는다.
- 위치는 float64, native forcing은 float32다. 요약 이동 거리와 관측 분리 거리는 반지름 6371008.8m의 haversine으로 계산하므로 적분 좌표 변환과 상수가 다르다. provenance에 둘을 기록한다.
- 4개 노드 전체가 유효해야 공간 보간한다. RK4 중간점과 이동 선분의 유효성 검사, 최초 무효 prefix 탐색으로 육지·결측·영역 이탈을 구분한다. 도달 시각의 불확실성은 적분 간격 범위이며 정밀 해안선 상륙 시각이 아니다.
- 실제 첫 HYCOM 입력은 0m 외해 wet-validity 격자다. 독립 해안선, 바람 직접 작용, Stokes drift, 확산, 수직 혼합이 없다. 해난 수색·유류·침수 예측으로 제공하지 않는다.
- source 발행시각 미상, float 좌표 표현 정규화, 원본 파일과 정규화 hash는 `DATASET_CANDIDATES.md` 및 fixture manifest에 남긴다.

## 검증과 변경 조건

정지·일정/회전 흐름·시간 보간·날짜변경선·결측·경계·원장·취소 시험과 실제 HYCOM 계산, 간격 수렴·별도 프로세스 재현의 성적은 계산 담당의 검증 산출물을 정본으로 사용한다. 설치나 실제 파일 한 건 실행을 관측 검증으로 승격하지 않는다.

실제 관측 comparator는 source와 정규화 궤적 해시, QC, drogue 부착, 깊이, 독립성 근거를 검사한다. 시간은 정확히 일치하는 UTC 시각만 비교한다. 수치 시험은 `NUMERICAL_TEST_ONLY`, 적격 관측이 없으면 `NOT_VALIDATED`이며 과학 수용 기준을 자동 통과시키지 않는다.

10,000입자 성능·서버 격리·다중 사용자·독립 관측 기준을 만족하지 못하면 모델 공개 범위를 확대하지 않는다. JIT 또는 OpenDrift로 변경할 때는 모델 버전과 환경 잠금을 새로 만들고 동일 자료의 수치·경계·재현 시험을 다시 수행한다. 현재 결과의 모델 버전·reader·입력 원본은 보존한다.
