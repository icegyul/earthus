# 엔진 적대 감사 기록 — E09~E12 / E25·E27~E30 / E38~E44

> 감사일: 2026-09-01 · 방식: 엔진군별 독립 적대 감사 3건(회의적 관점), 전 주장 file:line 근거 + 실행 재현
> 선례: P5 Benefit 엔진 위장 적발 ([P5_BENEFIT_AUDIT_VERDICT.md](P5_BENEFIT_AUDIT_VERDICT.md))
> 조치 커밋: `6cb0eed4`(SPACE), `84dc4e98`(ORBIT·Intelligence)

## 감사 기준

각 엔진을 네 판정으로 분류했다. **FIXTURE_ONLY는 결함이 아니다** — 데이터가 없을 때
정직하게 상태를 반환하는 것은 이 프로젝트의 규칙이다. THEATER가 결함이다.

| 판정 | 뜻 |
| --- | --- |
| REAL | 실제 물리/알고리즘 계산 수행 |
| FIXTURE_ONLY | 정직하게 픽스처/UNAVAILABLE 반환 (합격) |
| THEATER | 계산하는 척하지만 실제로는 아님 (P5형 결함) |
| ABSENT | 구현 없음 |

## 판정 결과

### E09~E12 (SPACE) — MIXED → 교정 완료

| 엔진 | 감사 판정 | 결함 | 조치 |
| --- | --- | --- | --- |
| E09 천체사건 | REAL | 계산불가를 `None`(=사건없음)으로 반환 | `SeparationUndefinedError`로 분리 |
| E10 우주기상 | **THEATER** | 입력 0개에서 f107=100·kp=2 주입 → 밀도계수 1.2 산출(재현됨). 출처 불문 OFFICIAL_PUBLIC | 파생 제거, `INSUFFICIENT_DATA` + 미도출 사유 명시, 기본 등급 UNKNOWN |
| E11 NEO | **THEATER** | 불확실성 필드 존재만으로 VALIDATED_PIPELINE (ANON_TWEET + 0.0 → 공식/검증됨 재현) | 등급→검증상태 표로 유도, VALIDATED_PIPELINE 발급 경로 제거, 클래스명을 실제 역할(Normalizer)로 |
| E12 심우주 | FIXTURE_ONLY | `live_telemetry=True` 자기신고로 승격. 라우트는 이미 403으로 금지하던 것 | `telemetry_evidence_id` 없으면 예외, 모델 정체 날조 제거 |

### E25·E27~E30 (파편·재진입·광도·관측) — MIXED → 교정 완료

| 엔진 | 감사 판정 | 결함 | 조치 |
| --- | --- | --- | --- |
| E25 계보 | FIXTURE_ONLY/REAL | caller 불리언으로 '검증된 파이프라인' 라벨 | 출처 기반으로 교정 |
| E27 재진입 | **THEATER** | 무검증 VALIDATED·OFFICIAL 날인, 계보 전무 | 사전 구성 `source_registry`에서만 등급, provenance(URI·시각·payload 해시) 무결성 검증 |
| E28 광도/회전 | REAL(결함 다수) | 분산 0인 신호에서 주기 생성(`sum(...) or 1e-12`), `uncertainty_s`가 실은 격자 간격, alias가 같은 peak의 이웃이라 검증상태 역전, 'Two-harmonic' 주석과 불일치 | Lomb-Scargle + 오경보확률(FAP>1%면 주기 미반환), `grid_step_s` 분리 후 불확실도는 최소제곱 잔차에서, alias 정의 교정 및 논리 방향 반전, 주석·한계 명시 |
| E29 관측계획 | THEATER/REAL 혼재 | 첫 샘플 마운트레이트 0 대체 | 제거, 계산법을 provenance에 기록 |
| E30 시민QA | REAL | — | — |
| (E26 파편화) | REAL | 이전 감사에서 실물리 확인 | — |

### E38~E44 (Intelligence) — MIXED → 교정 완료

| 엔진 | 감사 판정 | 결함 | 조치 |
| --- | --- | --- | --- |
| E38~E42 | REAL | — | — |
| **E43 신뢰도** | **THEATER** | **UI의 '84% VERY HIGH'가 하드코딩 상수**. 근거의 수·품질·신선도가 값을 바꾸지 못함. 고정 리터럴이 'policy factor' 근거 문구를 달고 나와 **계보 위조**. 진짜 구현은 존재하나 한 번도 호출되지 않음. 누락 인자를 0.0으로 대체하며 가중치는 분모에 잔존 | 무의미 사유 금지 목록으로 거부, 누락 인자는 분모에서 제외하고 '미적용'으로 보고, 산출 불가 시 `CONFIDENCE_NOT_COMPUTABLE` |
| E44 귀속 | REAL/일부 ABSENT | — | 잔여는 아래 참조 |
| LLM 계층 | REAL | 과학값 생성 없음 확인 (절대 규칙 3 준수) | — |

## 검증

- 각 결함이 재발하면 실패하는 정직성 테스트 신설: SPACE 25건 + 궤도 28건 + 신뢰도 16건 = **69건**
- 회귀: acceptance·product·unit·foundation·contract **626 passed / 0 failed**
- 지어낸 값을 고정하고 있던 기존 인수 케이스(E10 2건·E11·E27 4건·E28·E29)도 함께 교정 — 테스트가 거짓을 고정하고 있었다

## 미조치 (별도 판단 필요)

1. **E09 `official_event()`**: 호출자가 넘긴 불리언+문자열만으로 `OFFICIAL` + `VALIDATED_PIPELINE` 발급. E12에서 금지한 자기신고 승격과 구조가 동일하나, 감사 지적 목록에 없었고 파급이 커 이번 범위에서 제외.
2. **E10·E11·E12 데드코드**: 라우트가 라이브 프로바이더를 직접 호출해 이 엔진들은 서빙 경로에 없다. 엔진을 경로에 넣을지, 프로바이더 직결을 정본으로 삼고 엔진을 정리할지는 아키텍처 결정.
3. **웹 UI 근접천체 수 항상 0** (services/web/app.js): 서버는 `approach_count`를 딕셔너리로 주는데 UI가 `Array.isArray(...)?length:0`로 읽어 항상 0. 원인 확정, 파일 소유가 프론트 챗이라 미수정.
4. **E44 일부 ABSENT**: 구현 없음으로 판정된 부분의 범위 확정 필요.
5. E10 `density_factor`는 영구 제거가 아니라 '근거 없음' 상태 — 명명된 밀도모델(NRLMSISE-00/JB2008 등)을 연결하면 `density_factor_status`/`reason` 필드를 통해 되살릴 수 있다.
