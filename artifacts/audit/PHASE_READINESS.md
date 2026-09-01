# PHASE_READINESS — V2 단계별 착수 가능성 매트릭스

작성일: 2026-09-01 · READ-ONLY 감사 산출물
정본 리포: `D:/## APP/EARTHUS v2_APP` 모노레포 (PD 비준 대기 중이나 작업 가정으로 채택)

## 전제 사실 (Ground Truth)

1. **Docker 미설치** — 라이브 PostGIS/Redis/MinIO가 필요한 단계는 전부 Docker Desktop 설치(사용자 결정)에 차단됨. `Aetherus 823_Orbital/aetherus-orbital-environment/docker-compose.yml` 존재 확인 — 인프라 정의는 있으나 실행 불가.
2. **Python 3.14.7 vs 통합 브랜치 고정(pinned) 의존성 불일치 위험** — 823 백엔드 venv는 python3.12 기준(`Aetherus 823_Orbital/.../.venv/lib/python3.12/` 확인). 마이그레이션 시 의존성 재해결 필요.
3. **스펙 패키지 정본 고정(pinning)이 이번 세션에 진행 중** — `docs/earthus-v2/` 하위 MASTER_SPEC·ENGINE·ALGORITHM·FOUNDATION_PACKAGE 등 존재 확인. 스펙 의존 단계는 고정 완료(P0) 이후 착수가 안전.
4. **v2-three 지구가 정본 리포에 라이브** — `prototype/v2-three/` (index.html, js/main.js, ui-shell.js, sim-ocean.js, local-terrain.js, intel-feed.js, assets/brand) 확인.
5. 참고 구조: `services/aetherus-orbital/`(src·tests·migrations·scripts — 브리지 골격 존재), `supabase/`, `llm/`, `AETHERUS_V2/`, `fixtures/` 최상위 디렉터리 확인.

표기: **YES** = 지금 착수 가능 / **AFTER-x** = x 완료 후 착수 / **BLOCKED** = 외부 결정·설치 전 착수 불가.

## 단계별 매트릭스

| 단계 | 즉시 착수? | 차단 요인 | 첫 구체 작업 | 구현 소스 |
|---|---|---|---|---|
| **P0** Audit & Baseline | **YES** (진행 중) | 없음 — 이번 세션의 스펙 고정·감사 자체가 P0 | `artifacts/audit/` 산출물 완성 + 스펙 패키지 SHA 고정 확정 | NEW |
| **P1** Foundation Truth Core (E01–E07) | **AFTER-P0** (부분 YES) | 스펙 고정 미완이면 계약 흔들림. 라이브 DB 영속화 구간만 Docker 차단 | E01–E07 데이터 계약·스키마를 `fixtures/` 기반 파일 구현으로 착수 (DB 어댑터는 인터페이스만) | NEW (스펙: docs/earthus-v2/FOUNDATION_PACKAGE) |
| **P2** SPACE Core (E08–E12) | **YES** | 없음 — v2-three 지구가 정본에 라이브 | `prototype/v2-three/js/main.js`에 E08 진입 씬 계약 매핑, ui-shell 확장 포인트 확정 | v2-three REUSE |
| **P3** Multi-Scale Visual (E34–E37) | **AFTER-P2** | P2 씬 그래프/카메라 계약 확정 선행 | v2-three `local-terrain.js` 기반 스케일 전환(LOD) 스파이크 1건 | v2-three REUSE |
| **P4** Mission Registry (E13–E15) | **AFTER-P1** | E01–E07 진실 코어 계약 필요. 영속화는 Docker 차단(단, `supabase/` 클라우드 경로 검토 여지) | 미션 레지스트리 스키마 초안 + fixture 시드 데이터 작성 | NEW |
| **P5** Mission Tracking (E16–E19) | **AFTER-P4** | 레지스트리 없이는 추적 대상 없음 | E16 추적 상태기계 스펙→테스트 스켈레톤 | NEW |
| **P6** Orbital Core (ORB-P0..P3 게이트 내장) | **BLOCKED** | **Docker 미설치** (PostGIS/Redis 라이브 게이트) + Python 3.14.7 의존성 불일치 | Docker Desktop 설치 결정 획득 → `services/aetherus-orbital/`로 823 백엔드 이식 + venv 재구성(3.12 계열 또는 핀 상향) | 823 MIGRATE |
| **P7** Debris & Observation (E25–E30, ORB-P7..P9) | **BLOCKED** | P6 게이트 통과 전 불가 (동일 Docker 차단) | P6 완료 후 823 잔해 카탈로그 파이프라인 이식 검증 | 823 MIGRATE |
| **P8** Counterfactual Patent Core (E31–E33, ORB-P4..P6) | **BLOCKED** | P6 전파 엔진 선행 + Docker 차단. 단, 반사실 시나리오 **스펙 작업은 지금 가능** (특허 문서: `특허 우주쓰레기/` 존재) | 특허 청구항↔E31–E33 매핑 문서화(코드 착수는 P6 이후) | 823 MIGRATE + NEW |
| **P9–P11** Intelligence (E38–E44) | **AFTER-P4/P5/P7** | 상류 데이터(미션·잔해) 없이는 인텔 파생 불가 | E38 인텔 피드 계약을 v2-three `intel-feed.js` 소비자 관점에서 역설계 | NEW (표시층은 v2-three REUSE) |
| **P12** Personalization / Subscription | **AFTER-P1** | 계정·영속화 필요 — Docker 대신 `supabase/`(클라우드) 경로면 로컬 차단 회피 가능(PD 결정 필요) | supabase 스키마 현황 감사 + 인증 플로우 결정서 1장 | NEW |
| **P13** LLM Layer | **AFTER-P9~P11** (프롬프트 설계는 지금 가능) | 실데이터 인텔 없이는 접지(grounding) 불가 | `llm/` 디렉터리 현황 감사 + 프롬프트 계약 초안 | NEW |
| **P14** Research / Operations (ORB-P10..P11) | **BLOCKED** | P6·P7 산출물 + Docker 차단 | P6 해제 후 823 리서치 노트북·품질 게이트 이식 | 823 MIGRATE |
| **P15** Hardening (ORB-P12 내장) | **BLOCKED** | 전 단계 최후행 + Docker(라이브 스택 부하·보안 테스트 불가) | 선행 전체 완료 후 부하·보안·회귀 게이트 실행 | NEW + 823 MIGRATE |

## 요약 판정

- **지금 당장 움직일 수 있는 트랙**: P0(진행 중) → P2(v2-three 재사용, 차단 없음) → P3. 시각 트랙은 Docker와 무관하게 전진 가능.
- **파일/픽스처 우선으로 부분 착수 가능한 트랙**: P1(계약·스키마), P4(스키마+시드), P8(특허 매핑 문서), P13(프롬프트 설계).
- **Docker Desktop 설치 결정 전에는 절대 열리지 않는 트랙**: P6·P7·P14·P15 전부, P8 코드 구간. 823 MIGRATE 계열은 추가로 Python 3.14.7 vs pinned deps 불일치 해소(3.12 계열 venv 병행 또는 핀 상향)가 선행 조건.
- **PD 결정 필요 2건**: (1) Docker Desktop 설치 여부, (2) 영속화 경로 — 로컬 Docker 스택 vs `supabase/` 클라우드 (P12 및 P4 영속화의 분기점).
