# 연구 작업 공간 구현 현황

기준: 2026-09-05. 지침서 `EARTHUS V2 연구용 인텔리전스 전환 개발지침서 v1.0`의 PR 순서에 대조한다. 보고 기준은 지침 §16 그대로다 — "어떤 질문을 어떤 자료와 모델로 실행했고, 어떤 검증을 통과했으며, 무엇이 아직 안 되는가".

## 한 줄 요약

로컬 단일 사용자 범위에서 **질문→자료→계산→비교→재현**은 실제로 돈다(테스트 38/38, HYCOM 실자료 계산, 별도 프로세스 재현 해시 일치). 사전등록한 첫 관측 검증은 **FAIL**로 끝났다 — 2015년 1월 조용한 북대서양 환류에서 HYCOM 15 m 이류가 정지 기준선을 이기지 못했다. 다중 사용자·운영·AI 초안은 미착수.

## PR별 상태

| PR | 상태 | 실제 근거 | 아직 안 된 것 |
|---|---|---|---|
| 00 감사 | 완료 | `capability-inventory.csv` 19항목 | — |
| 01 표시 정정 | 부분 | 해상 카드 `MODEL_SIGNAL` 정정 | WHAT IF 파도 데모 분리, NOW 진단 분리 — 메뉴 파일 동시 편집 중이라 보류 |
| 02 자료 계약 | 부분 | JSON 격자 계약·검사기, HYCOM 0 m fixture(결측 거부 사례 보존), **HYCOM NetCDF reader**(`netcdf_reader.py`), 15 m 영역 자료 2건 | GLORYS 2번째 제품(Copernicus 계정 필요 — 자격증명은 사용자 몫), 일반 NetCDF/Zarr 업로드 |
| 03 모델·CLI | 완료 | ADR-001, OceanParcels 3.1.4 고정, 정지·일정·회전·수렴·날짜변경선·섬·결측 시험 | JIT 전환 조건은 ADR에 명시(아래 성능 참조) |
| 04 API·worker | 완료 | SQLite 원장, idempotency, 취소 3지점, 재시작 표시, 교차 Origin 거부 | 큐 재전달·lease는 단일 프로세스 가정 |
| 05 연구 화면 | 부분 | `research.html` 5단계 작업 공간, 지구 도구줄에 진입 버튼(⚗) | FEED 사건→프로젝트 초안, MY 연결, 기능 플래그 |
| 06 결과·비교 | 완료 | 2D/지구, 공통 시간축, 짝비교·집단 요약, 원본/표시 분리 | — |
| 07 내보내기·재현 | 완료 | ZIP 묶음, `replay` 해시 일치 | 다른 OS/설치본 재현은 미측정 |
| 08 관측 검증 | **실행됨 · FAIL** | 사전등록 `validation-plan.json` → drogue 부착 21기·2해역 → `verdict.json` | 다른 시기·에너지 높은 해역·연안 코호트 |
| 09 권한·운영 | 미착수 | 127.0.0.1 단일 사용자 | 인증·테넌트 격리·자원 상한 |
| 10 AI 초안 | 미착수 | — | — |

## 관측 검증 결과 (PR-08)

- 코호트: NOAA GDP hourly QC, drogue 부착 확인 21기(A 열대 12·B 아열대 9), 2015-01-05 12Z부터 72 h.
- 강제력: HYCOM GOFS 3.1 재분석 **15 m**(drogue 깊이 일치), 3시간, 0.08°.
- 72 h 중앙 분리거리: 모델 24.3 km · 정지 19.2 km · 초기속도 지속 32.2 km (n=21).
- 판정: C1(정지 기준선을 이김) 실패 → **NOT_ACCEPTED**. 기준을 결과 뒤에 넓히지 않았다.
- 해석: 부정적 결과이지 코드 결함이 아니다. v1(결정론 이류, 바람·Stokes·확산 없음)은 이 해역·시기에서 "제자리"보다 못하다. 다음 코호트는 걸프류처럼 이류가 지배적인 해역, 그리고 바람 항 추가 전후 비교가 필요하다.

## 성능 (PR-09 사전 측정)

`evidence/benchmark-particles.json` — Scipy 모드(JIT 없음), 이 기기 기준. 10,000입자×72 h×300 s는 선언된 200만 입자-스텝 예산을 넘어 실행하지 않았다. JIT 또는 큰 적분 간격 없이 1만 입자 72 h 목표는 미충족.

## 재현 방법

```powershell
cd services/research-runtime
$env:PYTHONPATH=".;.deps"
python -m unittest discover -s tests
python ../../tools/research/build_gdp_hycom_cohort.py     # 저장된 .nc/CSV만 사용, 네트워크 없음
python ../../tools/research/verdict_gdp_hycom_cohort.py
```
