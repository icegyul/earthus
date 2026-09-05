# 시간축 해류와 표류 관측 자료 조사

확인일: 2026-09-05 KST. 자료 카탈로그 설명과 실제 다운로드 결과를 구분한다. 실제 확보한 계산 입력은 **HYCOM 2015-01-05 12Z~01-08 12Z 북대서양 0m 해류**다. 모델 자료이며 현장 관측으로 표시하지 않는다.

## 해류 후보 비교

| 항목 | HYCOM GOFS 3.1 GLBv0.08 expt_53.X | Copernicus GLORYS12V1 |
|---|---|---|
| 자료 종류 | HYCOM+NCODA 재분석 | NEMO 기반 재분석 |
| 수평 격자 | 40°S~40°N 0.08°, 외측 위도 간격 0.04°; 제공 격자로 보간된 제품 | 정규 1/12° 격자 |
| 시간 | 3시간 순간장 | 일평균·월평균; 첫 비교는 일평균만 후보 |
| archive | 1994~2015; 누락 구간 존재 | 1993 이후; 조회 카탈로그의 일별 종료일 2026-06-23 |
| 변수·깊이 | `water_u`, `water_v`, m/s, 동·북향; 내려받은 표층 0m | eastward/northward sea-water velocity; 50수심. 표층의 정확한 수심은 취득 파일에서 확인 필요 |
| 접근 | 공개 THREDDS/OPeNDAP/NCSS, 인증 없이 제한 영역 다운로드 성공 | Toolbox `subset`/`get`와 계정 인증. 이번 작업에서 계정 사용·다운로드하지 않음 |
| 권리·비용 | 원본 파일에 DoD Distribution A, 공개·무제한 배포 문구; 자료 사용료 없음, 실행·전송 운영비 별도 | 공식 도움말은 출처 표기 조건의 상업·비상업 무료 이용 설명. 제품 licence 원문 경로는 이번 web 요청에서 403; 재배포 세부 조항 확보는 미완료 |
| 현재 판정 | 실제 72h 고정 fixture와 reader 검사 확보. 외해 개발 사례 | 두 번째 제품 비교 후보. 취득·자료 검사 전 실행 선택지로 등록하지 않음 |

HYCOM 해상도·시간·archive·동화 설명의 근거는 [공식 제품 문서](https://www.hycom.org/dataserver/gofs-3pt1/reanalysis), 익명 접근과 배포 조건은 [공식 접근 문서](https://www.hycom.org/dataserver/access-methods/thredds)다. [FAQ](https://www.hycom.org/faqs)는 NCSS 요청을 하루 이하로 제한하도록 안내하고 archive 결측이 있음을 명시한다. 파일 다운로드도 21시간 구간 세 개와 마지막 시각 하나로 나눴다.

GLORYS 규격은 [제품 설명](https://data.marine.copernicus.eu/product/GLOBAL_MULTIYEAR_PHY_001_030/description)과 [자료 접근 목록](https://data.marine.copernicus.eu/product/GLOBAL_MULTIYEAR_PHY_001_030/services), 인증 요건은 [Toolbox credentials](https://help.marine.copernicus.eu/en/articles/8185007-copernicus-marine-toolbox-credentials-configuration), 이용료 설명은 [공식 비용 FAQ](https://help.marine.copernicus.eu/en/articles/4220312-i-just-opened-my-account-but-will-it-still-be-free-in-2-3-or-5-years)를 확인했다. 일평균장이 3시간장보다 연안·조석·빠른 변동에 적합하다고 가정하지 않는다. 목적별 검증 전 제품 우열은 미정이다.

## 실제 HYCOM 고정 입력

`services/research-runtime/examples/hycom-2015-atlantic.dataset.json`의 shape은 `[25,26,26]`, 위도 28~30°N, 경도 60~58°W, 간격 10,800초다. 원본 네 파일 총 80,680바이트를 `fixtures/hycom-2015-atlantic/`에 보존했다. `acquisition.json`에 정확한 URI·원본 SHA-256·변수·유효시각을, `normalization-report.json`에 검사 결과를 둔다. 합성값이나 프레임 반복을 넣지 않았다.

자료 정규화는 NetCDF mask/scale 해석, singleton depth 제거, 시간축 연결이다. float32 좌표 표현 오차는 문서의 0.08° 정규 격자에 맞춰 소수 둘째 자리로 정규화했다. 최대 경도 보정 0.0000293°와 원좌표 배열을 처리 이력에 기록했고 속도값은 공간 보간하지 않았다. `landMask`는 25프레임 모두 유효한 격자 노드의 wet-validity다. 독립 해안선이 없어 이 fixture로 연안 상륙 정확도를 주장하지 않는다.

원본에 분석 발행시각이 없어서 `sourceIssuedAtUTC=null`이다. `issuedAtUTC`는 정규화 fixture의 생성시각이라고 `issuedAtMeaning`으로 명시했다. NCSS 변환 시각을 2015년 분석 발행시각으로 바꾸지 않았다. 다운로드를 다시 하면 서버 변환 메타데이터 때문에 원파일 해시가 달라질 수 있다. 재현에는 저장한 원본을 사용하며, 재취득 파일은 새 버전으로 등록한다.

첫 요청인 2015-01-01 12Z~01-04 12Z는 25개 요청 중 실제 23프레임이었다. 01-03 03Z·12Z가 없어 정규화가 거부했다. 첫 원본도 결측 거부 사례로 보존했고, 전체 2015 시간축에서 연속 25프레임이 있는 첫 구간을 찾아 사용했다. 결측을 임의 보간하여 통과시키지 않았다.

## 실제 관측 후보와 배제 사례

[NOAA GDP hourly 제품](https://www.aoml.noaa.gov/phod/gdp/hourly_data.php)은 품질 관리된 시간별 위치·속도·불확실성과 drogue 분실 메타데이터를 제공한다. [ERDDAP 메타데이터](https://erddap.aoml.noaa.gov/gdp/erddap/info/drifter_hourly_qc/index.html)의 licence는 CC BY 4.0이고 해당 endpoint 버전은 v2.01, 범위는 1987-10-02~2022-10-31로 표기되어 있었다. 익명으로 한 부표·72시간 CSV 73행을 실제 취득했다.

`fixtures/gdp-116362-2015/`는 부표 116362의 2015-01-01 12Z~01-04 12Z 자료다. 제공된 drogue 분실일은 **2014-08-19**이므로 이 표본은 검증에서 제외한다. [NOAA 설명](https://www.aoml.noaa.gov/phod/gdp/faq.php)에 따르면 정상 SVP drogue 중심은 약 15m이며 분실 후 바람·파랑의 영향이 커진다. 표층 0m 모델과 15m drogue를 같은 조건이라고 할 수 없고, 분실된 부표를 표층 수동 입자의 정답으로 취급하지 않는다. HYCOM 선택 구간과도 기간이 다르다. 이 파일은 실제 데이터의 **적격성 거부 시험**이다.

다음 관측 평가에는 drogue 부착 기간이 확정된 독립 궤적, 깊이를 맞춘 강제력, 동화 여부 근거가 필요하다. 제품 동화 설명만 보고 특정 부표의 독립성을 자동 승인하지 않는다. 20개 이상 궤적·두 해역/시기, 기준선, 보류 평가와 도메인 수용 기준은 아직 충족하지 않았다.

## 2026-09-05 사전등록 코호트 — drogue 부착 21기 vs HYCOM 15 m

`fixtures/gdp-hycom-cohort-201501/`. 2015-01-05 12Z에 10~50°N/80~20°W에 있던 GDP 부표 124기 중 `drogue_lost_date`가 비었거나 창 종료(01-08 12Z) 뒤인 54기를 골라, 40°N 남쪽(HYCOM 위도 간격 0.08° 유지)에서 가장 밀집한 10°×14° 창 두 곳을 취했다 — 열대 북대서양 A(13~25°N, 53~37°W) 12기, 아열대 B(25~37°N, 45~29°W) 9기. 강제력은 **HYCOM 15 m**(SVP drogue 중심 깊이)로 다시 받았다(영역당 NCSS 4요청, 원본 8파일 보존, 151×201 격자, 결측 노드 0). 판정 기준·표본 하한·기준선은 `validation-plan.json`에 **계산 전에** 적었다.

결과(`evidence/gdp-hycom-cohort-201501/verdict.json`): 적격 21/21, 세 지평 모두 비교됨. 72 h 중앙 분리거리 — 모델 **24.3 km**, 정지 기준선 **19.2 km**, 초기속도 지속 32.2 km(A: 23.6/20.6/31.1, B: 25.3/18.9/32.2). 사전등록 C1(정지 기준선을 이김) **실패**, C2·C3·C4 충족 → 판정 **FAIL / NOT_ACCEPTED**. 부표들이 72시간에 20 km 남짓만 움직인 조용한 환류에서, 재분석 에디장을 따라가는 추적자가 제자리 입자보다 위치 오차를 더 쌓았다. 수치시험·재현은 그대로 통과하므로 코드 결함이 아니라 이 해역·시기·모델 범위(15 m 결정론 이류, 바람·확산 없음)의 **부정적 검증 결과**다. 연안·예보·에너지 높은 해역은 이 코호트로 말할 수 없다.

관측 독립성은 제공자 설명(NCODA가 고도계·SST·T/S 프로파일 동화, 부표 위치·속도 미동화)을 근거로 기록했고 독립 인증은 아니다. 정규화 자료 JSON(영역당 31 MB)은 재생성 가능해 커밋하지 않는다: `python tools/research/build_gdp_hycom_cohort.py` → `verdict_gdp_hycom_cohort.py`.

