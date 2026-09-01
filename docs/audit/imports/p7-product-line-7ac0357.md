# IMPORT RECORD — v0.6 제품 라인 이식 (V2-P7 / ORB-P7~P9 재검증)

> 이식일: 2026-09-01 · 소스: 823 `codex/aetherus-v2-v06-integration` @ 7ac0357 (git archive, 체크아웃 없음)

## 이식 대상 (블롭 해시 전수 일치: 코드 69 + evidence 84)

| 클러스터 | 경로 | 내용 |
| --- | --- | --- |
| packages 12종 | `services/aetherus-orbital/packages/` | domain·foundation·orbit(E20~E33 v0.6판)·product·providers·intelligence·space·control·visual·llm·platform·integration |
| 통합 앱 | `services/aetherus-orbital/services/api` (v0.6 FastAPI) + `services/web` (한/영 PWA) | 페이즈 API를 "/"에, 제품 API를 함께 마운트하는 통합 표면 |
| 계약 참조 | `openapi/`, `db/` | aetherus-v2.openapi.yaml, 계약형 마이그레이션 원문(READ-ONLY — 실행 금지, MIGRATION_CHAIN_DECISION 참조) |
| HISTORICAL 증거 | `services/aetherus-orbital/artifacts/evidence/` (20MB) | 823의 P0~P5 JSON·v0.6 골든 스크린샷·desktop/mobile 캡처 84파일 — **역사 기록** (정본 V2 증거는 저장소 루트 `artifacts/evidence/p*.json`) |

## 재현 결과 (실행 기반, artifacts/evidence/p7.json)

- **ORB-P7~P9**: test_p7_p8_debris_runtime + test_p9_observation_runtime **4/4 PASS**
- **제품 스위트 전체**: product·foundation·contract·acceptance·v06 무결성/스키마/프로바이더 계약·intelligence lineage·p12 hardening·통합 앱 표면 — **370/370 PASS** (도메인·오케스트레이터 포함 시)
- **저장소 총계**: 640 passed / 0 failed / 11 skipped (E2E·라이브 프로바이더 제외)

## 심사 주석

- **E26 파편화 정독 확인**: 시드 파편 ΔV 생성 + 이체 RK4 전파 + 조우 궤적 근접 스크리닝 — 실물리. `RESEARCH_ONLY`·`observed_debris=False`·`command_path=FORBIDDEN` 명시 (P8 정직성 규칙 부합)
- E25/E27~E30은 823 게이트 테스트 재현으로 검증 — P5식 적대 심층 감사는 후속 항목으로 evidence에 기재
- **플랫폼 잠복 버그 1건 수정**: registry 테스트의 `read_text()` 인코딩 미지정 — 한국어 Windows(cp949)에서 UTF-8 YAML 해독 불가 → `encoding="utf-8"` 명시
- 이중 엔진 주의: phase-line 물리 counterfactual(정본 특허 코어)과 제품 라인 intervention(E31~E33 v0.6판)이 공존 — 일원화는 통합 단계 결정 사항
