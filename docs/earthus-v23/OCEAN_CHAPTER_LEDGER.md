# Ocean Verticals 0–51장 구현 원장 — 2026-08-14

정본은 `EARTHUS_Ocean_Verticals_Development_Guide_v1.0.docx`다. 아래 판정은 문서 장을 삭제하거나
완료로 재정의하지 않고, 현재 운영 증거와 외부 gate를 연결한다. 2026-08-14 공개 배포 증거는
`RELEASE-2026-08-14-OCEAN-PUBLIC.md`다.

| 장 | 주제 | 현재 판정 | 주 증거/다음 gate |
|---:|---|---|---|
| 0 | 최상위 제품 결정 | PUBLIC_SCOPE_LOCKED | Aetherus와 Ocean 분리, O0–O6 순서 |
| 1 | 사용자와 핵심 과업 | DEPLOYED_PARTIAL | Surf·Fishing·Life·Dive 첫 행동 공개, 개인 기록은 서버 gate |
| 2 | 무료·유료 기능 경계 | FREE_OPEN | `MONETIZATION_MODE=FREE_OPEN`, 결제·구독 UI 없음 |
| 3 | 정보 구조와 전역 내비게이션 | DEPLOYED_FREE | EARTHUS 1단 OCEAN, `?ocean=hub`, `/ocean.html` |
| 4 | 공통 Ocean Core 아키텍처 | DEPLOYED_CONTRACT | observation/safety/provider contracts 운영 배포 |
| 5 | 시간·공간·단위 기준 | DEPLOYED_CONTRACT | UTC, valid/observed, 단위 변환·누락 보존 |
| 6 | 데이터 신뢰도와 출처 UI | DEPLOYED_FREE | 운영 layer/Surf/Fishing에서 source/time/type 표시 |
| 7 | 안전 Hard Gate | DEPLOYED_GATED | 계약·테스트·운영 asset 배포, 미확인 시 판단 차단 |
| 8 | 활동 적합도 공통 엔진 | DEPLOYED_GATED | Fishing/Surf 설명 계약 배포, DRAFT policy 점수 비공개 |
| 9 | 지도 렌더링과 성능 | DEPLOYED_PARTIAL | 실제 지구본·lazy layer·390/768/1280, server bbox 미완료 |
| 10 | 캐시·저장·비용 제어 | BLOCKED_EXTERNAL | provider rights DRAFT, 운영 cache 정책 미승인 |
| 11 | 서핑 제품 정의 | DEPLOYED_FREE | 실제 해변 위치·파고·너울·바람·부이, 추천 문구 없음 |
| 12 | 서핑 포인트 데이터 모델 | DEPLOYED_PARTIAL | 공개 해변 위치·방향 운영, private site DB 미완료 |
| 13 | 서핑 조건 입력과 계산 | DEPLOYED_PARTIAL | 현재 조건 운영, 72시간 DRAFT score는 gated |
| 14 | 서핑 상세 화면 | DEPLOYED_FREE | OCEAN→Surf 실제 지도·상세 화면 |
| 15 | 서핑 세션과 개인 분석 | BLOCKED_SERVER | durable private session/RLS 없음 |
| 16 | 서핑 알림 | BLOCKED_EXTERNAL | dispatch·dedup 운영 승인 없음 |
| 17 | 낚시 제품 정의 | DEPLOYED_FREE | 조건 설명, 조과 보장·출발 CTA 없음 |
| 18 | 낚시 포인트와 어종 모델 | DEPLOYED_PARTIAL | 공개 지점 운영, private/species DB 미완료 |
| 19 | 물때·조류·기상 통합 | DEPLOYED_FREE | 물때·파고·바람 운영, 해류와 조류 구분 |
| 20 | 낚시 적합도와 설명 | DEPLOYED_FREE | 사실 조건 요약·안전 우선·조과 확률 금지 |
| 21 | 낚시 상세 화면과 출조 계획 | DEPLOYED_PARTIAL | OCEAN→Fishing 실제 화면, 서버 계획 저장 미완료 |
| 22 | 개인 포인트와 위치 보호 | LOCAL_CONTRACT | owner exact/shared blur/public region |
| 23 | 조과 기록과 사진 연결 | PARTIAL | private media 기반, catch link 미구현 |
| 24 | 낚시 예약·제휴 경계 | BLOCKED_EXTERNAL | 잔여석·booking CTA 생성 금지 |
| 25 | 해양생물 제품 정의 | DEPLOYED_PARTIAL | 출처 기반 심해 도감·거북·조류 기록 공개, private upload gate |
| 26 | 분류체계와 종 데이터 | LOCAL_CONTRACT | canonical/version/source/human review |
| 27 | 관찰 기록과 검증 상태 | LOCAL_CONTRACT | SUGGESTED/VERIFIED/moderation |
| 28 | 민감종과 위치 흐림 | LOCAL_CONTRACT | public region-only |
| 29 | 사진 업로드와 자동 최적화 | LOCAL_CONTRACT | 30MB metadata, 4 derivative contract |
| 30 | 사진 공개 범위와 전환 | LOCAL_CONTRACT | PRIVATE→PUBLIC→PRIVATE saga |
| 31 | 활동 기록과 사진 자동 연결 | BLOCKED_SERVER | cross-domain link·transaction 없음 |
| 32 | 공개 관찰 지도와 커뮤니티 | DEPLOYED_PARTIAL | 공개 관찰 지도 연결, 사용자 업로드·moderation 서버 gate |
| 33 | 개인 해양생물 도감 | PARTIAL | verified taxonomy count·owner read, DB/export 미완료 |
| 34 | 선박 모듈 v1 범위 | DEPLOYED_GATED | OCEAN에 Vessels 범위·상태 공개 |
| 35 | AIS adapter·license manifest | DEPLOYED_GATED | 운영 asset 배포, provider 전부 DRAFT+OFF |
| 36 | 선박 데이터 없음 UX | DEPLOYED_FREE | UNAVAILABLE·현재 위치 0·가짜 marker 없음 표시 |
| 37 | 공개 AIS·과거 데이터 | BLOCKED_EXTERNAL | fixture history만, 실제 license 없음 |
| 38 | 선박 확장 gate | DEPLOYED_CLOSED | G1–G5 evidence null, capabilities false |
| 39 | My Ocean Control Center | DEPLOYED_READ_ONLY | 6위젯 무료 관제판 공개, 계정 동기화는 server gate |
| 40 | 통합 기록과 타임라인 | BLOCKED_SERVER | 공통 durable timeline 없음 |
| 41 | 알림 센터 | BLOCKED_EXTERNAL | 전송·중복방지·opt-in 운영 미승인 |
| 42 | 핵심 API 계약 | PARTIAL | domain contract만, HTTP/RLS endpoint 없음 |
| 43 | 오류 코드와 복구 | PARTIAL | fail-closed error code, 실제 recovery UI 없음 |
| 44 | 데이터베이스와 보존 정책 | BLOCKED_SERVER | memory fixture만, migration/retention 없음 |
| 45 | 개인정보·보안 | PARTIAL | exact/EXIF/private/no-store 계약, 운영 RLS 없음 |
| 46 | 접근성·모바일·저전력 | DEPLOYED_PARTIAL | 운영 390/768/1280 overflow 0·44px, 실기기·저전력 미완료 |
| 47 | 분석 이벤트와 사업 지표 | BLOCKED_POLICY | G1 측정·동의·event catalog 미승인 |
| 48 | 구현 단계와 의존성 | PUBLIC_PLAN_COMPLETE | O0–O6 순서·종료선·공개 범위 문서화 |
| 49 | 테스트 시나리오 | DEPLOYED_MATRIX | core/unit/media/control/vessel/depth/public layout 통과 |
| 50 | 모듈별 Definition of Done | PARTIAL | 공개 읽기·지도 DoD 통과, 서버·provider·실기기 gate 잔존 |
| 51 | Codex 구현 지시 순서 | FOLLOWED_AND_RELEASED | Core→Fishing→Surf→Media→Control→Vessel→Gate→public hub |

## 정리

공개 가능한 실제 기능은 더 이상 canary에만 있지 않다. EARTHUS 1단 OCEAN에서 해양 레이어,
Surf, Fishing, Marine Life, Dive, My Ocean 읽기 전용 관제판과 Vessels 미지원 상태를 볼 수 있다.
다만 공개 배포는 없는 서버·provider·권리를 만든다는 뜻이 아니다. 개인 기록·사진 업로드·알림·
계정 동기화·AIS 위치는 장 10·15·16·24·29–31·35·37·40–45 gate가 열리기 전까지 실행하지 않는다.
