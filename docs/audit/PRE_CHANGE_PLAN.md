# PRE-CHANGE PLAN — 다음 구현 구간 (V2-P0 완료 직후)

> Orbital v1.2.1 §1이 요구하는 사전 변경 계획. 이 문서 범위 밖의 구현 착수 금지.
> 작성일: 2026-09-01 · 기준: CANONICAL_REPOSITORY_DECISION.md · 감사: artifacts/audit/*

## 정본 경로/브랜치

- 저장소: `D:\## APP\EARTHUS v2_APP` · 브랜치: `earthus-v2/real-living-earth-render`
- 이식 소스: 823 `codex/aetherus-v2-v06-integration` @ 7ac0357 (읽기전용, git archive/show만)

## 이번 커밋(V2-P0 산출물 고정)

| 변경 | 내용 |
| --- | --- |
| 추가 | `docs/aetherus-v2-canonical/` (스펙 정본, docx 제외), `docs/audit/` 결정·계획 문서, `artifacts/audit/` 감사 산출물 6종 |
| 수정 | `.gitignore` (canonical docx 제외 규칙) |
| 마이그레이션 | 없음 |
| 테스트 | 해당 없음(문서·감사) — 무결성 검증은 SHA 대조로 수행 완료 |

## 다음 허용 구간과 순서

1. **[선행] v2-three 커밋** — E34/E35 REUSE 근거가 미추적 상태. 별도 커밋으로 추적 전환 (내용 변경 없음)
2. **V2-P1 Foundation 부분 착수 (Docker 불요 구간)**
   - Python 3.12 venv 구성 (3.14는 numpy 1.26/scipy 1.12 휠 부재)
   - 823에서 `contracts/schemas` 19종 + `config/*.yaml` 9종 선별 이식 → `services/aetherus-orbital/` (imports 기록 의무: `docs/audit/imports/p1-7ac0357.md`)
   - CelesTrak fixtures 기반 수집 파서·불변 raw(SHA-256) 파일 구현 경로 검증 (라이브 영속화는 Docker 후)
3. **V2-P2 SPACE Core 병렬 가능** — v2-three 기반, 차단 없음
4. **ORB-P0 인프라 = BLOCKED** — Docker 미설치. 해제 시 즉시: compose(PostGIS·Redis·MinIO) 기동 → 마이그레이션 단일 체인 결정(§아래) → /health → evidence p1.json

## 예상 리스크/차단

- 마이그레이션 이중 체인(823: 001~008 vs 0001~0003) — 이식 전 단일 체인 재설계 필요, 적용된 마이그레이션 수정 금지 원칙 유지
- MAX_CATALOG_ID_DIGITS 9 vs 10 불일치 — 이식 시 10으로 통일하고 테스트로 고정 (6자리+ 요건 상회)
- Space-Track 자격증명 부재 — P1은 CelesTrak만으로 진행, Space-Track 어댑터는 계약만 구현
- env 변수명 불일치(SPACETRACK_IDENTITY vs SPACE_TRACK_USERNAME) — 이식 시 브랜치 표기 채택

## 증거 계획

- 다음 증거 파일: `artifacts/evidence/p1.json` (orbital_phase: P0~P1 병기) — Docker 해제 전까지는 부분 필드 + BLOCKED 사유 명기
- 판정어 6종 준수. 화면·스크린샷은 증거 아님.
