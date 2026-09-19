# SNS FACTORY — 아키텍처 벤치마크 (EARTHUS vs 후보, 2026-09-10)

- 방향: EARTHUS CORE(Globe·Data·Intelligence·Simulation·Reports)는 유지. SNS FACTORY는 아래 서비스층으로만 붙인다.
- 분류: ADOPT(그대로 채택, MIT·GREEN만) / REIMPLEMENT(동작을 EARTHUS식으로 재구현) / REFERENCE(AGPL·YELLOW는 읽기만) / REJECT(불채택)

## 1. 영역별 판정

| 영역 | EARTHUS 현행 | 최선 후보 패턴 | 판정 | 사유 |
|---|---|---|---|---|
| Provider 추상화 | `SnsAdapter` 7종(페이로드까지) | BB `SocialProvider` ABC + PZ 36종 레지스트리 | REIMPLEMENT | 전송분리 철학은 EARTHUS가 더 강함(볼트집중). 인터페이스 규율만 참고 |
| OAuth/볼트 | Edge AES-GCM 볼트, Lambda 무토큰 | BB 암호화필드, TCL 60일 자동갱신 | KEEP+REIMPLEMENT | 비밀 2곳 보관 금지 유지. 갱신 타이밍만 참고 |
| Publisher | 페이로드 생성 + Edge 실전송 | PZ Temporal 워크플로, BB 15초폴 | REIMPLEMENT | 승인후 예약발행 실행기만 새로 만든다. 자동게시는 만들지 않는다 |
| Scheduler/Queue | 생성주기 표 + EventBridge 수집 | BB Queue/Slot+Recurrence, P4U APScheduler | REIMPLEMENT | 경량(Edge cron/DB due-scan). Temporal·Horizon 신규도입 REJECT(1인 운영 과중) |
| Retry/RateLimit | BACKOFF·TEMPORARY/PERMANENT | BB 60/300/1800·3회, MP rate-limit trait | REIMPLEMENT | 플랫폼별 상한 모듈만 신설. EARTHUS 실패분류 유지 |
| Media | 사양+브라우저 렌더 | BB MediaAsset+썸네일, TJS/TCL 컨테이너폴 | REIMPLEMENT | Threads 컨테이너 FINISHED 대기 + 썸네일. 서버 렌더 REJECT(폰트·씬이원화) |
| Approval | 상태기계+사람게이트(강점) | BB 팀승인(유일 완비) | KEEP+REFERENCE | EARTHUS 게이트 유지. 팀단계는 BB를 읽기만(AGPL) |
| Analytics | 기록기초 | PZ 스냅샷+감쇠수집, BB Snapshot | REIMPLEMENT | 지표 자동수집기만 신설. 0채움금지원칙 유지 |
| History | 불변아카이브+publish-log | 공통(전 후보 보유) | KEEP | EARTHUS가 동등. 교체이유 없음 |
| API/MCP | CLI+Edge POST | BB Ninja+MCP, PZ public-api | REJECT(당장) | 공개 API는 상용 gate와 함께 별도 결정. 지금 만들지 않는다 |
| UI | 후보/달력/큐/성과/채널 탭 | BB htmx, PZ Next | KEEP | 게시버튼 없음 유지. 외부 UI 이식 REJECT |
| Threads 발행 | container→publish 실재 | TJS/TCL/TPU 동일흐름 3중 확인 | REIMPLEMENT(MIT 패턴) | MIT 라이브러리 직접 의존도 가능. AGPL 흐름은 읽기만 |

## 2. 전체 프로젝트 판정

- ADOPT WHOLE: REJECT. (AGPL 오염 + EARTHUS provenance/governance 삭제 + Heavy infra)
- ADOPT ARCHITECTURE 통째: REJECT. (참고는 하되 이식은 선별)
- ADOPT SELECTIVE MODULES: 채택. (MIT만, 재구현 중심. 아래 결정문)
- REFERENCE ONLY: AGPL 3종 + Meta 샘플에 적용.
- REJECT: Ddalkkak(NOT_FOUND), 공개 API/MCP 당장 도입, Temporal/Horizon 신규도입.
