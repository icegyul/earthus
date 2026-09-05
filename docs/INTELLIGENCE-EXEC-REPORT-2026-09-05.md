# EARTHUS V2 인텔리전스 — 실행 결과 보고 (2026-09-05)

지시서 `docs/INTELLIGENCE-DEV-DIRECTIVE-2026-09-05.md` 의 G-1 → A → B → C → D → H → E → F → G-2 를 실행했다. 각 항목은 지시서가 요구한 다섯 칸(코드 존재 / 실제 데이터 연결 / 로컬 브라우저 / 운영 배포 / 실기기)으로 보고한다.

## 1. 완료 항목

| 항목 | 내용 | 코드 | 데이터 | 로컬 | 운영 | 실기기 |
|---|---|---|---|---|---|---|
| G-1 v2 개편 빌드 배포 | 운영 `/v2` 탭이 사건·내 장소·선택 자료·자료의 근거·예보·예정·가정 실험으로 교체. 41개 파일(v2-deploy 번들 대비 달라진 20 + 신규 9 + 엔트리 HTML), 공개 SHA-256 41/41 일치, 운영 백업 `remote-before/` 보존 | ○ | ○ | ○ | ○ `713727f7` | — |
| A-1 시각 4분법 (F01) | 사건마다 발생·발표·갱신·수집 시각 분리. 없는 시각은 `null`, "방금" 대체 금지. GDACS·USGS 의 시간대 없는 UTC 문자열을 Z 로 읽음(9시간 오차 제거). EVIDENCE 카드 세 줄 | ○ | ○ | ○ | ○ `6558f20a` | — |
| A-2 소스 상태 5분법 (F02) | OK/EMPTY/FAILED/STALE/OUT_OF_SCOPE. 실패한 소스는 행을 남기고 "조회 불가"+재시도. 행동 칸 결정표 — 조회 실패를 "특보 없음"으로 적지 않음 | ○ | ○ | ○ | ○ | — |
| A-3 특보 구역 연관 (F03) | 특보 구역 중심점(234개) 거리 ≤350 km(태풍)/200 km(지진) → RELATED 만 행동 칸에. 아니면 "국내 관련 유형 특보 N건 — 구역 관계 미확인" | ○ | ○ | ○ | ○ | — |
| A-4 부분 실패 (F05) | 피드 상태 loading/ready/partial/empty/error/stale. 한 출처 실패 시 성공 목록 유지 + "USGS 조회 불가 · 재시도". 둘 다 실패 시 직전 목록을 "이전 결과 · 수집 시각"으로 보존 | ○ | ○ | ○ | ○ | — |
| B 사건 전환 경쟁 (F04) | 선택 세대 토큰 + AbortController. A → B 전환 뒤 도착한 A 의 이력·트랙·기관 스택은 버림 | ○ | ○ | ○ | ○ | — |
| C-1 배지 동일성 (F07) | WHY/NEXT 의 근거 줄이 사건 방과 같은 `layerBadge`(신선도 반영) 사용 | ○ | ○ | ○ | ○ | — |
| C-2 기관별 행 (F08) | 공식 트랙을 기관마다 한 행 + 대표 기관 대비 +24h 위치 차 km | ○ | ○ | ○ | ○ | — |
| C-3 정렬 공개 (F06) | 피드 하단에 "정렬: 공식 경보 등급 → 최근 갱신 · 시각 없는 사건은 뒤" | ○ | ○ | ○ | ○ | — |
| D-1 공개 사건 패킷 v1 | `ocean/cyclone-events.json` + `ocean/cyclone-events/{id}.json` — revisions(회차·기관별 h0/h24/h48)·changes(두 회차 모두 값 있을 때만 delta)·importance(이유 목록)·confidence(신선도·일치도)·uncertainty(기관 폭 km, 앙상블 null). status ACTIVE/WATCH/RESOLVED 판정 | ○ | ○ 3시간 주기 | ○ | ○ `fa4ae258` | — |
| D-2 Feed 카드 8필드 + 팔로우 | 무엇·어디·언제·바뀐 것·왜 지금·신뢰·상태·행동 + ★ 팔로우(localStorage). 종료 사건은 "지난 사건 N건 보기" 뒤 | ○ | ○ | ○ | ○ | — |
| D-3 비교·검증·NEXT | 회차 두 개 비교(회색 점선 이전/주황 실선 현재), 검증 카드(기관별 위치·방향 오차 vs EARTHUS 기준선), NEXT 자동 채움 | ○ | ○ | ○ | ○ | — |
| H 지구에 묻기 도구 제안 | 스냅샷에 "켤 수 있는 레이어"(값 없이 이름만) 동봉. 자료 부족 답변의 showLayer 는 실행·폐기 대신 "이 자료를 켜면 답할 수 있습니다: [켜기]" 버튼 — 누르면 켜고 같은 질문 재질의 | ○ | ○ Lambda `earthus-llm` 갱신 | ○ | ○ | — |
| E 내 장소 감시 | 특보구역-관측지점 대응표(711개)로 내 구역 판정(근사 명시) + 구역 특보 행. 감시 조건 3종(내 구역 특보·팔로우 사건 새 회차·400 km 안 M5+) dedupeKey 로 한 번만 기록(localStorage `earthus.watch`). 특보 소스 실패 → "감시 중단 — 안전하다는 뜻이 아닙니다" | ○ | ○ | ○ 부산중부(동래 3 km) | ○ | — |
| F 가정 실험 baseline | 고른 사건의 최신 회차 대표 기관(KMA→JMA→NHC) +24h 를 기준선으로. 슬라이더는 편차(풍속 ±15 m/s, 눈까지 거리). 실험 기록 localStorage `earthus.scenario`. 기준선 없으면 "확인 불가" | ○ | ○ KROVANH-26 KMA r030 | ○ | ○ | — |
| G-2 CI 재조준 | 워크플로가 검사하던 prototype/v2(Cesium FND-017) → 운영이 서빙하는 prototype/v2-three 로. 실소스(S3)로 사건 카드·사건 방 소스 행·행동 칸 문구·기준선 실험을 헤드리스 검사, 증거 업로드 | ○ | ○ | ○ 로컬 통과 | — CI는 push 뒤 | — |

실기기(iPhone/Android) 칸은 비워 둔다 — 이 세션에서 실기기 캡처를 얻지 못했다.

## 2. 테스트

| 파일 | 케이스 | 결과 |
|---|---|---|
| `tools/test_v2_intel_time_contract.mjs` | 시각 없음→미확인, 4분법 보존, partial, empty, stale 보존 | 5/5 |
| `tools/test_v2_event_room_states.mjs` | 특보 실패→조회 불가, 0건 문구, RELATED/DOMESTIC, OUT_OF_SCOPE, STALE 나이, 기관별 행 | 6/6 |
| `tools/test_v2_feed_selection_race.mjs` | A→B 전환 뒤 늦은 A 응답 폐기, 피드 복귀 뒤 늦은 응답 무시 | 2/2 |
| `tools/test_v2_badge_parity.mjs` | evidenceRow 가 layerBadge 사용, 같은 키 같은 배지 | 2/2 |
| `tools/test_v2_feed_cards.mjs` | 카드 8필드·팔로우 정렬·종료 접기·비교·검증·NEXT | 2/2 |
| `tools/test_v2_watch.mjs` | 내 구역 근사, 소스 실패→SUSPENDED, 구역 특보·dedupe, 팔로우 회차, 400 km M5+ 필터 | 5/5 |
| `tools/test_v2_ask_suggest.mjs` | 자료 부족 제안은 실행 안 함·버튼, 충분하면 즉시 실행, 버튼→켜기→재질의 | 3/3 |
| `tools/test_v2_three_intelligence_browser.mjs` (Playwright, 실소스) | 카드 17장 시각 줄, 사건 방 소스 행 8줄, 조회 실패를 "특보 없음"으로 안 적음, 기준선 실험 슬라이더·기록 | 통과 |
| `aws/cyclone-analog/tests` | public_detail 6 + event_packet 4 + 기존 | 22/22 |
| 기존 v2 테스트 (information-flow·source-context·travel-catalogs) | 회귀 없음 | 28/28 |

## 3. 운영 실측 (2026-09-05 16:5x KST, earthus.net/v2, KROVANH-26 사건 방)

- EVIDENCE: `발표 09-01 06:00Z · 갱신 09-05 00:00Z · 수집 09-05 07:38Z` (이전: "갱신: 17시간 전" 한 줄)
- 기관 스택: GDACS · 한국 기상청·일본 기상청(요약) · **한국 기상청 · 일본 기상청(기관별 행)** · ECMWF · 해양관측 · 침수 예상도 · 기상청 특보
- 행동 칸: `국내에 풍랑 등 특보 37건 — 이 사건과의 구역 관계는 확인되지 않음` (오키나와 부근 태풍 — 350 km 규칙에 따라 DOMESTIC)
- 피드 하단: 정렬 기준 명시
- 콘솔 오류: Supabase `usage_bump` 404 1건(집계 RPC, 기능 무관, 별도 항목)

## 4. 배포 기록

- 도구: `tools/build_information_release.mjs`(manifest) + `tools/upload_information_release.mjs`(신규) — 운영 의존성 55개 HEAD 확인 → `remote-before/` 백업(재실행 시 보존) → manifest MIME·Cache-Control 로 put → 정확한 경로 무효화 → 공개 SHA 검증
- 무효화: 와일드카드 동시 15개 한도(`TooManyInvalidationsInProgress`)에 걸려 정확한 경로 방식으로 전환. `/v2/` 디렉터리 키는 별도 무효화
- 롤백: `out/information-release-20260905/remote-before/` 의 원본 바이트·메타. 신규 객체 9개는 삭제가 롤백

## 5. 커밋

| 커밋 | 내용 |
|---|---|
| `713727f7` | v2 정보 접근성 빌드 운영 배포 + 업로더 |
| `6558f20a` | 지시서 A·B·C-1 구현 + 테스트 4파일 |
| `fa4ae258` | D 사건 원장 — 패킷 백엔드 + 카드·비교·검증·NEXT |
| (본 커밋) | H·E·F·G-2 + 테스트 3파일 + 워크플로 재조준 |
| `2144eacd` `5cc3b108` `3acb47f0` | 지시서(§A~§N) |

## 6. 남은 것

1. N-1 쓰나미 도달시간(√(g·h) 전파, 수심 격자) — 지시서 §N 후순위
2. 사건 패킷 용량(~95 KB → 60 KB 목표), D-4 태풍 공식 발표 원문 보관, `room-retry` 부분 재조회
3. 실기기 캡처(iPhone 390×844) — 위 표의 빈 칸. G-2 CI 는 push 뒤 첫 실행 결과 확인
4. 감시(E)의 푸시 알림 — 지금은 앱을 열었을 때만 판정·기록한다(백그라운드 감시 아님, 화면에 그렇게 적을 것)

## 7. 알려진 한계

- RELATED 판정은 특보 구역 **중심점** 근사다(경계선 자료 없음). 화면에도 그렇게 적었다.
- STALE 판정은 소스 `generated` 필드에 의존한다. 필드가 없는 소스는 나이를 못 잰다.
- `room-retry` 는 캐시를 비우고 사건을 다시 여는 방식이라 성공한 소스도 다시 받는다.
