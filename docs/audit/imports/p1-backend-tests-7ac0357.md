# IMPORT RECORD — 페이즈 라인 백엔드·테스트 이식 (V2-P1 / ORB-P1)

> 이식일: 2026-09-01 · 소스: 823 `codex/aetherus-v2-v06-integration` @ 7ac0357 (git archive, 체크아웃 없음)

## 이식 대상 (164파일, 블롭 해시 164/164 소스 일치)

| 클러스터 | 내용 |
| --- | --- |
| `backend/` 전체 | ingestion(celestrak·omm·providers·ratelimit·redaction·storage), domain(object_identity), orbit, conjunction, benefit, explore, main.py(페이즈 API), tools(evidence·golden 생성기) |
| `tests/` 전체 | unit·integration·foundation·contract·acceptance·e2e·product + fixtures(celestrak/cdm/golden) |
| `pytest.ini`, `fixtures/` | 테스트 설정·공식 픽스처 |

## 이식 방식에 대한 주석

페이즈 라인은 결합도가 높아(main.py가 전 모듈 라우팅) 클러스터 단위로 일괄 이식했다. **게이트 판정은 파일 존재가 아니라 단계별 테스트·감사 재현으로만** 한다: 이번에 재현·판정한 것은 P0/P1 구간뿐이며, orbit(P2)·conjunction(P4)·benefit(P5)은 이식만 된 상태로 **HISTORICAL/NOT STARTED** — 각 단계에서 심사(특히 P5 엣지삭제형 여부)·테스트 재현 후에만 승격한다. packages/* 제품 라인·tests/product·tests/e2e는 이번 판정 범위 밖.

## 재현 결과 (실행 기반, artifacts/evidence/p1.json)

- **테스트 50/50 PASS** (P0/P1 서브셋 15파일: health·database·migrations·celestrak client·ingestion service/api·catalog_id 6자리+·identity·rejection 격리·partial·provenance·snapshot versioning·identity conflicts)
- **API 가동**: uvicorn `backend.main:app` → `/health` 200, 의존성 인지형(DB healthy, `pc_without_covariance: NOT_COMPUTED`, `benefit_engine: AVAILABLE_IDEALIZED_SIMULATION` 정직 표기)
- **라이브 CelesTrak 수집 관통**: `POST /api/v1/ingestions/celestrak/omm/25544` → SUCCEEDED. ISS(ZARYA)·COSPAR 1998-067A·OMM/TEME/SGP4, 공분산 없음 → `INSUFFICIENT_DATA`/`NOT_COMPUTED`, 한계 3건 명시
- **불변 raw 아티팩트**: `artifacts/raw/celestrak_gp/e3083b30….json` — 파일명 SHA-256과 내용 해시 일치 재검증
- **API 조회 관통**: `GET /api/v1/objects/{id}` → canonical identity·alias 계보·mean elements(경사 51.6314°) 반환

## 한계

- Space-Track 라이브 미검증 (자격증명 부재 — 어댑터 계약·단위 테스트만)
- CI 워크플로·클린클론 부트 재현 미완 (ORB-P0 잔여분)
- raw 스냅샷은 823 정책대로 git 제외 (`services/aetherus-orbital/artifacts/raw/`)
