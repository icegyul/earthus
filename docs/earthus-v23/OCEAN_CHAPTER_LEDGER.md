# Ocean Verticals 0–51장 구현 원장 — 2026-08-14

정본은 `EARTHUS_Ocean_Verticals_Development_Guide_v1.0.docx`다. 아래 판정은 문서 장을 삭제하거나
완료로 재정의하지 않고, 현재 로컬 증거와 외부 gate를 연결한다.

| 장 | 주제 | 현재 판정 | 주 증거/다음 gate |
|---:|---|---|---|
| 0 | 최상위 제품 결정 | PLAN_LOCKED | Aetherus와 Ocean 분리, O0–O6 순서 |
| 1 | 사용자와 핵심 과업 | PLAN_LOCKED | 제품별 첫 판단/기록 계약, 실제 사용자 검증은 외부 |
| 2 | 무료·유료 기능 경계 | PARTIAL | 서버 entitlement 원칙, 가격·기능표 미승인 |
| 3 | 정보 구조와 전역 내비게이션 | BLOCKED_PUBLIC_UI | 기존 메뉴 유지, Ocean 신규 route 미연결 |
| 4 | 공통 Ocean Core 아키텍처 | LOCAL_SHADOW | observation/safety/provider contracts |
| 5 | 시간·공간·단위 기준 | LOCAL_SHADOW | UTC, valid/observed, 단위 변환·누락 보존 |
| 6 | 데이터 신뢰도와 출처 UI | LOCAL_UI_SHADOW | shadow source/time/provenance/quality 실브라우저 |
| 7 | 안전 Hard Gate | LOCAL_SHADOW | 공식 adapter·score null·CTA 차단 |
| 8 | 활동 적합도 공통 엔진 | LOCAL_SHADOW | Fishing/Surf explainable result |
| 9 | 지도 렌더링과 성능 | PARTIAL | shadow responsive, 실제 Ocean map lifecycle 미완료 |
| 10 | 캐시·저장·비용 제어 | BLOCKED_EXTERNAL | provider rights DRAFT, 운영 cache 정책 미승인 |
| 11 | 서핑 제품 정의 | LOCAL_SHADOW | Surf candidate, public recommendation 없음 |
| 12 | 서핑 포인트 데이터 모델 | LOCAL_SHADOW | policy axes·orientation fixture |
| 13 | 서핑 조건 입력과 계산 | LOCAL_SHADOW | 72시간×9 metric·input key·confidence |
| 14 | 서핑 상세 화면 | BLOCKED_PUBLIC_UI | shadow result만 존재 |
| 15 | 서핑 세션과 개인 분석 | BLOCKED_SERVER | durable private session/RLS 없음 |
| 16 | 서핑 알림 | BLOCKED_EXTERNAL | dispatch·dedup 운영 승인 없음 |
| 17 | 낚시 제품 정의 | LOCAL_SHADOW | 조건 설명, 조과 보장·출발 CTA 없음 |
| 18 | 낚시 포인트와 어종 모델 | PARTIAL | 위치 policy 있음, 어종·포인트 정본 미승인 |
| 19 | 물때·조류·기상 통합 | LOCAL_SHADOW | tide/current 분리, datum·단위 계약 |
| 20 | 낚시 적합도와 설명 | LOCAL_SHADOW | factual condition summary, safety first |
| 21 | 낚시 상세 화면과 출조 계획 | BLOCKED_PUBLIC_UI | pure decision만 존재 |
| 22 | 개인 포인트와 위치 보호 | LOCAL_CONTRACT | owner exact/shared blur/public region |
| 23 | 조과 기록과 사진 연결 | PARTIAL | private media 기반, catch link 미구현 |
| 24 | 낚시 예약·제휴 경계 | BLOCKED_EXTERNAL | 잔여석·booking CTA 생성 금지 |
| 25 | 해양생물 제품 정의 | LOCAL_SHADOW | private observation/media saga |
| 26 | 분류체계와 종 데이터 | LOCAL_CONTRACT | canonical/version/source/human review |
| 27 | 관찰 기록과 검증 상태 | LOCAL_CONTRACT | SUGGESTED/VERIFIED/moderation |
| 28 | 민감종과 위치 흐림 | LOCAL_CONTRACT | public region-only |
| 29 | 사진 업로드와 자동 최적화 | LOCAL_CONTRACT | 30MB metadata, 4 derivative contract |
| 30 | 사진 공개 범위와 전환 | LOCAL_CONTRACT | PRIVATE→PUBLIC→PRIVATE saga |
| 31 | 활동 기록과 사진 자동 연결 | BLOCKED_SERVER | cross-domain link·transaction 없음 |
| 32 | 공개 관찰 지도와 커뮤니티 | BLOCKED_PUBLIC_UI | moderation·public read contract만 존재 |
| 33 | 개인 해양생물 도감 | PARTIAL | verified taxonomy count·owner read, DB/export 미완료 |
| 34 | 선박 모듈 v1 범위 | LOCAL_SHADOW | current/history/external/unavailable 분리 |
| 35 | AIS adapter·license manifest | LOCAL_SHADOW | 운영 provider 전부 DRAFT+OFF |
| 36 | 선박 데이터 없음 UX | LOCAL_CONTRACT | UNAVAILABLE marker/track 0 |
| 37 | 공개 AIS·과거 데이터 | BLOCKED_EXTERNAL | fixture history만, 실제 license 없음 |
| 38 | 선박 확장 gate | CLOSED | G1–G5 evidence null, capabilities false |
| 39 | My Ocean Control Center | LOCAL_SHADOW | layout/revision/conflict/expiry 권리 |
| 40 | 통합 기록과 타임라인 | BLOCKED_SERVER | 공통 durable timeline 없음 |
| 41 | 알림 센터 | BLOCKED_EXTERNAL | 전송·중복방지·opt-in 운영 미승인 |
| 42 | 핵심 API 계약 | PARTIAL | domain contract만, HTTP/RLS endpoint 없음 |
| 43 | 오류 코드와 복구 | PARTIAL | fail-closed error code, 실제 recovery UI 없음 |
| 44 | 데이터베이스와 보존 정책 | BLOCKED_SERVER | memory fixture만, migration/retention 없음 |
| 45 | 개인정보·보안 | PARTIAL | exact/EXIF/private/no-store 계약, 운영 RLS 없음 |
| 46 | 접근성·모바일·저전력 | PARTIAL | shadow 390/768/1280, 실제 기기·저전력 미완료 |
| 47 | 분석 이벤트와 사업 지표 | BLOCKED_POLICY | G1 측정·동의·event catalog 미승인 |
| 48 | 구현 단계와 의존성 | LOCAL_PLAN_COMPLETE | O0–O6 순서·종료선 문서화 |
| 49 | 테스트 시나리오 | LOCAL_MATRIX_COMPLETE | OT-001–015 local/partial/external 분리 |
| 50 | 모듈별 Definition of Done | PARTIAL | 로컬 shadow DoD만 충족, 운영 DoD 미충족 |
| 51 | Codex 구현 지시 순서 | FOLLOWED | Core→Fishing→Surf→Media→Control→Vessel→Gate |

## 정리

52개 장 중 공개·운영 완료로 판정한 장은 0개다. 로컬 계약·fixture·shadow UI가 닫힌 장과,
서버/공급자/정책/실기기 gate가 남은 장을 분리했다. 다음 공개 작업은 장 3을 바로 여는 것이 아니라
장 10·42·44·45의 provider/HTTP/RLS 증거를 먼저 확보한 뒤 작은 canary로 진행한다.
