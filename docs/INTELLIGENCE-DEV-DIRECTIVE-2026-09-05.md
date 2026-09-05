# EARTHUS V2 인텔리전스 개발지시서 — 최종 보고서(2026-09-05) 대응

기준 스냅샷: `earthus-v2/real-living-earth-render` @ `f5874663` (보고서 스냅샷 `55eaefe7` 이후 커밋 2건: LAB 검증 엔진·벤치마크 보고서). 대상 소스: `prototype/v2-three/`(운영 `/v2`의 원본), `aws/cyclone-analog`, `aws/lab-events`, `aws/typhoon-official`, `aws/earthus-llm`. 운영 배포 경로: `tools/build_information_release.mjs` → `tools/deploy-v2-three.sh` → `s3://earthus-cache-kr/app/v2/` → CloudFront `E193CZEBLWEB56`.

이 문서는 **코드를 고치는 사람에게 주는 지시**다. 각 항목은 ① 현재 코드(파일:함수) ② 문제 ③ 바꿀 것 ④ 데이터 계약 ⑤ 테스트 ⑥ 완료 기준 순으로 적는다. "구현했다"가 아니라 "⑥이 통과했다"가 완료다.

---

## 0. 최종 보고서 평가 — 무엇을 채택하고 무엇을 보정하나

### 0.1 채택 (보고서 판단이 소스에서 확인됨)

| 보고서 | 코드 대조 결과 |
|---|---|
| F01 시각 대체 | `intel-feed.js ingestTC` `whenT: Date.parse(p.todate \|\| p.fromdate) \|\| Date.now()`, `ingestEQ` `whenT: p.time \|\| Date.now()` — 시각이 없으면 **지금**이 된다. 확인 |
| F02 특보 실패→없음 | `event-room.js build`: `if (wn && !wn.__error) {...}` — 실패 시 행이 아예 없고, 마지막 `tl.action` 기본값이 `'발효 특보 없음'`. 확인 |
| F03 지역 연관 | `nearKorea = haversineMeters(it, KOREA) < 1,200,000` + 종류 필터 + `levelRank` 정렬로 대표 특보 선택. 특보 구역과 사건 위치의 교차 없음. 확인 |
| F04 사건 전환 경쟁 | `IntelFeed.select`: `room.build`만 `this.selected !== it` 검사. `loadPast`와 GDACS 트랙 fetch는 검사 없음. 확인 |
| F05 부분 실패 | `settle()`: USGS 실패 플래그 없음, `items.length===0 && !tcPending → 'error'`. 확인 |
| F06 목록 순위 | 태풍 전부 → 지진, 지진 색은 규모 임계값. 확인 |
| F07 배지 경로 | `ui-shell.js evidenceRow`가 `renderBadge(l.state)`(정적 선언) 사용, 사건 방은 `layerBadge(key)`(신선도 반영). 확인 |
| F08 기관 대표값 | 공식 트랙 행: `agencies.join(' · ')`로 기관명은 합치고 값은 `best.ag`(첫 유효 기관) steps. 확인 |
| 첫 완결 사례 = 태풍 | 공식 발표·앙상블·해상관측·유사사례·특보·시뮬레이션 진입점이 다 있음. 채택 |
| 벤치마크 7종 채택 판단 | Copernicus(기준 고정 비교)·Windy(같은 유효시각 나란히+사후검증)·Tomorrow.io(장소→조건→감시)·DestinE(실험 질서)·Earth2Studio(모델 검증 계층). 채택 |

### 0.2 보정 (보고서가 운영을 못 봤거나 최신 커밋을 모름)

| 보고서 | 보정 |
|---|---|
| "운영 직접 확인 미완료" | 2026-09-05 12:40 KST 실측(이 세션): 운영 `/v2`는 **정보 접근성 개편 전 빌드**(탭 FEED/MY/NOW/WHY/NEXT/WHAT IF). 피드 20건(TC 7·EQ 13), SAUDEL-26이 소멸 후 3일째 `ACTIVE`, 사건 방 5줄 중 3줄 "없음", NEXT 0건, 지구에 묻기는 "자료 부족"으로 정확히 거절(도구 제안은 안 함). → **P0-1 정본 정합의 첫 조치는 v2 개편 빌드 배포**다 |
| "변경 이력·사후 검증 미구현" | 2026-09-05 커밋 `55eaefe7`·`168ef94b`로 **회차 원장과 사후 검증은 데이터 층에 이미 생겼다**: `archive/cyclone-sessions.json`(회차별 KMA·JMA·ECMWF·EARTHUS 트랙 26~102회), `ocean/cyclone-reports.json` `detail`(실황 이력·기관 전망·잠정/최종 오차·방향 적중), `analysis/<현상>-reports.json` 8종. **새로 만들 것은 저장이 아니라 Feed·사건 방이 이를 읽는 계약**이다(§D) |
| "인도네시아 기업 = GISACT, 60편" | 저장소·v2_DOC에 원문 없음. 지시서는 GISACT를 "문제 단위 결과 카드" 관점으로만 참조하고 논문 수를 근거로 쓰지 않는다 |
| Intelligence Runtime Browser CI 실패 | 그 테스트는 `prototype/v2`(Cesium)를 겨눈다. §G에서 진입점을 `v2-three`로 재조준 |

---

## A. 시간·실패 상태 계약 (P0 · F01 F02 F03 F05)

### A-1. 사건 시각 분리 — `intel-feed.js`

**현재** `ingestTC`/`ingestEQ`가 `whenT` 하나에 발생·갱신·수집 시각을 뭉치고, 없으면 `Date.now()`.

**바꿀 것** 사건 항목에 시각 객체를 둔다. `whenT`는 정렬용으로만 남기고 화면 문구는 `time`에서 만든다.

```js
// intel-feed item.time — 없는 시각은 null. 절대 Date.now()로 채우지 않는다.
time: {
  occurredAt: p.time ? new Date(p.time).toISOString() : null,        // EQ: 발생. TC: null (GDACS는 발생 시각을 안 준다)
  issuedAt:   p.fromdate ? iso(p.fromdate) : null,                    // TC: 기관 최초 발표(GDACS fromdate)
  updatedAt:  p.todate ? iso(p.todate) : (p.updated ? iso(p.updated) : null),
  retrievedAt: new Date().toISOString(),                              // 우리가 받은 시각 — 항상 있음
}
```

- `agoText(null)` → `'시각 없음'`. `facts`의 `fWhen`은 `occurredAt ?? issuedAt`이고 둘 다 없으면 `'시각 미확인'`.
- 정렬 키 `whenT = Date.parse(updatedAt ?? occurredAt ?? issuedAt)`; `NaN`이면 목록 **맨 뒤**로 보내고 카드에 `시각 미확인` 배지.
- 사건 방 EVIDENCE 카드: `갱신: 3일 전` 한 줄을 `발표 {issuedAt} · 갱신 {updatedAt} · 수집 {retrievedAt}` 세 줄로. 각 값은 `source-context.js sourceTimeLabel`과 같은 서식.

**테스트** `tools/test_v2_intel_time_contract.mjs` (node:test, 네트워크 없음 — `ingestTC/ingestEQ`에 고정 JSON 주입)
1. `todate`·`fromdate` 없는 TC → `time.updatedAt===null`, `whenT` NaN, 화면 문구에 `'방금'`·`'분 전'` 없음.
2. `p.time` 없는 EQ → `occurredAt===null`, fWhen `'시각 미확인'`.
3. 정상 입력 → 세 시각이 서로 다른 값으로 유지(수집 시각이 발표 시각을 덮지 않음).

**완료** 세 테스트 통과 + 운영 캡처에서 "갱신: 방금"이 시각 없는 사건에 붙지 않음.

### A-2. 소스 상태 5분법 — `event-room.js`

**현재** 성공/실패만 있고, 실패한 소스는 행이 생략된다. `tl.action` 기본값이 `nearKorea ? '발효 특보 없음' : '한반도 밖…'` — 조회 실패도 "없음"이 된다.

**바꿀 것** 모든 소스 결과를 상태 객체로 받는다.

```js
// event-room.js — 소스 상태. 화면 문구는 이 상태에서만 나온다.
const SOURCE_STATE = Object.freeze({
  OK: 'OK',                 // 응답 성공 + 해당 사건에 맞는 자료 있음
  EMPTY: 'EMPTY',           // 응답 성공 + 수집 범위 안에 해당 자료 0건
  FAILED: 'FAILED',         // 타임아웃/HTTP 오류/파싱 실패 — "확인 불가"
  STALE: 'STALE',           // 응답 성공이나 generated가 SLA 초과
  OUT_OF_SCOPE: 'OUT_OF_SCOPE', // 이 소스의 지리·종류 범위 밖 (한반도 밖 사건의 기상청 특보)
});
// get(id) → { state, data, error, generatedAt, retrievedAt }
```

- 행 렌더 `row()`는 `state`별 문구를 고정한다: FAILED → `'조회 불가 (timeout 15s)'` + 재시도 버튼, EMPTY → `'수집 범위 안 해당 없음 (전체 N건)'`, STALE → 배지 뒤 `STALE · 42분 전 자료`, OUT_OF_SCOPE → `'이 소스의 범위 밖'`.
- `tl.action` 결정표 (특보 소스 기준):

| warn 상태 | nearKorea | tl.action |
|---|---|---|
| OK & 관련 특보 ≥1 | true | `{종류} {등급} 발효 중 — {구역}` (현행) |
| OK & 0건 | true | `관련 유형 특보 없음 (전체 발효 N건 · {generatedAt})` |
| FAILED | true | `특보 조회 불가 — 기상청 원문에서 확인` **(절대 '없음' 아님)** |
| STALE | true | `특보 자료 {n}분 전 것 — 최신 여부 확인 불가` |
| any | false | `한반도 밖 사건 — 기상청 특보 범위 아님` (OUT_OF_SCOPE) |

- 쓰나미·해상관측·침수예상도·앙상블도 같은 표를 따른다. 실패한 소스는 **행을 남기고** 실패라고 적는다(현재 특보만 행이 사라짐).

**테스트** `tools/test_v2_event_room_states.mjs` — `get`을 주입 가능하게 바꾼 뒤(`EventRoom({fetchJson})`) 케이스: (a) warn timeout → action 문구에 `없음` 포함되지 않음, `조회 불가` 포함; (b) warn OK·0건 → `없음`+전체 건수; (c) generatedAt 3시간 전 → STALE 접미; (d) 한반도 밖 → OUT_OF_SCOPE.

**완료** 네 케이스 통과 + 실패 주입 시 운영 화면 캡처에 "발효 특보 없음"이 나오지 않음.

### A-3. 특보 지역 연관 — `event-room.js` + `events/kma-warn-regions.json`

**현재** 반경 1,200 km 원 + 종류 필터. 부산 앞바다 태풍에 강원 산지 강풍특보가 "대표 특보"로 뜰 수 있다.

**바꿀 것** 특보 구역 중심점(`kma-warn-regions.json`: `regionId → {name, lat, lon}` 234개)으로 사건과의 거리를 계산해 두 단계로 나눈다.

- `RELATED`: 사건 중심 ↔ 구역 중심 ≤ 350 km(태풍) / 200 km(지진) → "관련 구역 특보" 행, 거리 표기 `부산 남서해상 태풍경보 · 사건 중심에서 120 km`.
- `DOMESTIC`: 조건 미충족이나 nearKorea → "국내 관련 유형 특보 (구역 교차 미확인)" 행, 굵은 글씨·행동 칸 승격 없음.
- `tl.action`은 RELATED에서만 특보를 싣는다. DOMESTIC이면 `국내에 {종류} 특보 N건 — 이 사건과의 구역 관계는 확인되지 않음`.
- 구역 경계선이 아니라 중심점 근사라는 사실을 `room-sub`에 적는다(자료 note 그대로).

**테스트** 고정 regions 3개 + 사건 좌표로 RELATED/DOMESTIC 분기, 거리 표기 검증.

### A-4. 부분 실패 — `intel-feed.js settle()`

**바꿀 것** `state ∈ {loading, ready, partial, empty, error}` + `sources: {gdacs: {state, count, retrievedAt}, usgs: {...}}`. USGS catch에서 `this.eqFailed = true`. 판정: 둘 다 OK·0건 → `empty`("오늘 수집 범위에 사건 없음"), 하나 실패 → `partial`(성공 소스 목록은 그대로 그리고 머리에 `USGS 조회 불가 · 재시도`), 둘 다 실패 → `error`. 기존 항목이 있는 상태에서 재시도 실패 시 **이전 목록과 그 수집 시각을 유지**하고 `이전 결과 · 12:10 수집` 표기.

**테스트** `tools/test_v2_feed_settle.mjs`: (a) USGS 실패·GDACS 성공 → partial, 카드 수 유지; (b) 둘 다 0건 → empty 문구; (c) 재시도 실패 → 이전 목록 보존.

---

## B. 사건 전환 경쟁 (P0 · F04)

**현재** `select(idx)`: `loadPast(it)`(비동기, 검사 없음) → `room.build(it)`(검사 있음) → GDACS 트랙 fetch(검사 없음). A 선택 → 느린 응답 → B 선택 → A 응답 도착 시 `this.past`·`trackLine`이 A 것으로 덮인다.

**바꿀 것**
```js
// intel-feed.js
this._gen = 0;
select(idx) { const gen = ++this._gen; const it = this.items[idx]; this.selected = it; this._abort?.abort(); this._abort = new AbortController(); ... }
// loadPast·트랙·room.build 모두 (gen, signal)를 받아 응답 후 `if (gen !== this._gen) return;`
// back()·setKind()도 ++this._gen + abort.
```
- `fetch(url, { signal })`로 실제 취소. `Promise.race` 타임아웃은 signal 기반 `AbortSignal.timeout(ms)`로 교체.
- `clearTrack()`은 `select` 시작 시점에 호출(현행)하고, 트랙 응답은 `gen` 검사 뒤에만 `scene.add`.

**테스트** `tools/test_v2_feed_selection_race.mjs`: fetch를 지연 프라미스로 주입 — A 선택(2초 지연) → B 선택(즉시) → A 응답 → `feed.past.kind`·`trackLine`이 B 것(또는 null)인지, A의 `scene.add`가 호출되지 않았는지. `back()` 뒤 늦은 응답이 `view`를 `room`으로 되돌리지 않는지.

**완료** 통과 + 운영에서 사건 두 개를 1초 간격으로 눌러 캡처 비교(트랙 라인 하나만).

---

## C. 배지·대표값 통일 (P1 · F06 F07 F08)

### C-1. WHY/NEXT 배지 — `ui-shell.js evidenceRow`
`renderBadge(l.state)` → `layerBadge(\`${s.id}/${l.id}\`)` (engine-bridge, 신선도 반영). `activeLayers()`가 이미 `getLayerState`를 부르니 `st.freshness`를 같이 넘겨 `STALE·42분 전` 접미가 사건 방과 같게. **계약 테스트** `tools/test_v2_badge_parity.mjs`: 같은 layerKey에 대해 `evidenceRow`와 사건 방 `row()`가 만든 배지 문자열이 동일해야 함(고정 시각 주입).

### C-2. 기관별 행 분리 — `event-room.js` 공식 트랙
한 행에 `KMA · JMA · NHC` 이름을 합치고 값은 첫 기관 것을 쓰는 대신, **기관마다 한 행**: `한국 기상청 · 발표 09:00 KST · +24h 21 m/s · 994 hPa · 유효 09/06 09:00`. `tl.now`/`tl.next`에는 대표 기관명을 굵게 명시(`기상청 발표값`). 기관 간 24h 위치 차이(km)를 `room-sub`에: `JMA 대비 +24h 위치 차 65 km`. 값·단위 정의(10분 평균 vs 1분 평균 풍속)는 `agency.windDef` 필드가 있을 때만 적고 없으면 `풍속 정의 미확인`.

### C-3. 정렬 기준 공개 — `intel-feed.js settle()`
정렬 키를 문서화하고 화면 머리에 `정렬: 공식 경보 등급 → 최근 갱신` 한 줄. 지진 색 임계(6.5/5.5)는 USGS PAGER가 아니므로 `규모 기준 표시색`이라고 툴팁. (importanceReason은 §D-3에서 대체.)

---

## D. 태풍 사건 원장 — 기억·비교·검증 (P1-1·P1-2, 첫 완결 사례)

보고서 15쪽의 7단계 중 1~4·6은 **백엔드 자료가 이미 있다.** 부족한 것은 공개 계약과 화면이다.

### D-1. 공개 사건 패킷 — `aws/cyclone-analog/handler.py`

`update_lifecycle` 끝에서 세션마다 `ocean/cyclone-events/{id}.json`을 쓴다(공개, `max-age=900`). `public_detail`의 결과에 원장을 더한다.

```json
{
  "schema": 1,
  "eventId": "cyclone:1001318", "name": "KROVANH-26",
  "status": "ACTIVE|WATCH|RESOLVED|VERIFYING|PRELIMINARY_REPORT|FINAL_REPORT",
  "statusReason": "GDACS live=false 52h · 공식 발표 종료",
  "time": { "detectedAt": "...", "lastSeen": "...", "endedAt": null, "retrievedAt": "..." },
  "revisions": [
    { "revisionId": "r026", "issuedAt": "2026-09-05T00:25:00Z",
      "agencies": { "KMA": { "issued": "...", "h0": {"lat":27.7,"lon":126.7,"windMs":24,"hpa":990,"course":"남","speedKmh":14},
                              "h24": {...}, "h48": {...} }, "JMA": {...}, "ECMWF": {...}, "EARTHUS_MULTI_SOURCE": {...} },
      "changes": [
        { "field": "KMA.h0.windMs", "from": 21, "to": 24, "delta": 3 },
        { "field": "KMA.heading24", "from": "남서", "to": "남" },
        { "field": "warnings", "added": ["남해동부먼바다 풍랑경보"], "removed": [] }
      ],
      "changeSummaryKo": "기상청 실황 21→24 m/s 강화 · 24시간 방향 남서→남 · 남해동부 풍랑경보 추가"
    }
  ],
  "importance": {
    "reasons": ["공식 경보 Orange", "한국 특보구역 350 km 안 2개", "최근 회차 강화 +3 m/s", "기관 4곳 자료"],
    "inputs": { "alert": "Orange", "nearestWarnRegionKm": 120, "windTrend12h": 3, "sourceN": 4, "lastRevisionAgeMin": 25 }
  },
  "confidence": { "level": "medium", "sourceN": 4, "agencyAgreement24hKm": 65, "freshnessMin": 25,
                  "note": "기관 2곳 이상·24시간 위치 차 100 km 이하면 high, 하나뿐이거나 3시간 이상 묵으면 low" },
  "uncertainty": { "ensembleSpreadKm": { "24": 60, "48": 130, "72": 260 }, "agencySpreadKm": { "24": 65, "48": 150 },
                   "note": "앙상블 폭은 ECMWF 멤버 분산, 기관 폭은 KMA/JMA/NHC 예보 위치 차. 확률이 아니다" },
  "detail": { "...public_detail 그대로..." }
}
```

- **Revision 규칙**: 회차 id는 세션 스냅샷 순번. `changes`는 직전 회차와 필드별 비교(위치 km·풍속·기압·등급·방향·특보 목록). 값을 만들지 않는다 — 두 회차 모두 값이 있을 때만 `delta`.
- **Confidence 산식**(고정, 문서화): `sourceN≥2 && agreement24h≤100km && freshness≤180min → high; sourceN≥1 && freshness≤360 → medium; else low`. 산식은 `note`에 그대로 적어 화면에 노출.
- **Uncertainty**는 계산하지 않고 **있는 폭을 옮긴다**: ECMWF 멤버 표준편차(있을 때), 기관 간 예보 위치 차. 둘 다 없으면 `null` + `"폭을 잴 자료 없음"`.
- **Status 판정**(GDACS 지연 문제): `live=false` 또는 `lastSeen` 48h 초과 & 공식 발표 없음 → `WATCH`; 5일 초과 → `RESOLVED`(세션은 VERIFYING으로 계속). Feed는 `RESOLVED`를 기본 숨김("지난 사건 N건 보기").
- 목록 `ocean/cyclone-events.json`: `{events:[{eventId,name,status,importance.reasons[0..2],changeSummaryKo,lastRevisionAt,confidence.level}]}` ≤ 30 KB.
- `lab-events`의 8종도 같은 스키마로 `analysis/events/{kind}.json`을 낸다(revisions는 스냅샷 diff, importance는 종류별 규칙).

**테스트** `aws/cyclone-analog/tests/test_event_packet.py`: 세션 2회차 fixture → changes 3건, confidence high/medium/low 경계, status WATCH/RESOLVED 전이, 값 없는 필드는 delta 없음.

### D-2. Feed 카드 계약 — `intel-feed.js`

`load()`에서 GDACS/USGS 뒤에 `ocean/cyclone-events.json`·`analysis/events/earthquake.json`을 받아 **id로 결합**(GDACS eventid ↔ cyclone eventId). 결합되면 카드에:

```
열대저기압 KROVANH-26              [OFFICIAL] [신뢰도 medium]
일본 오키나와 북서 180 km · 갱신 25분 전
무엇이 바뀌었나: 실황 21→24 m/s 강화 · 24h 방향 남서→남 · 남해동부 풍랑경보 추가
왜 지금: 공식 경보 Orange · 한국 특보구역 350 km 안 2개
[사건 열기] [팔로우]
```
- 결합 안 되면 현행 카드 + `변경 이력 없음 (첫 관측)`.
- 정렬: `importance.inputs` 가중치가 아니라 **규칙 순서**: RESOLVED 뒤로 → 공식 경보 등급 → nearestWarnRegionKm 오름차순 → lastRevisionAt 내림차순. 머리에 정렬 기준 문장.
- FOLLOW: `localStorage earthus.follow = [eventId]`. 팔로우한 사건은 목록 최상단 고정 + 새 revision이면 `NEW` 점. (계정 동기화는 P1-3.)

### D-3. 사건 방 — "이전 발표와 비교"·"당시 전망 검증"

- **비교 카드**(COMPARE): 회차 선택 두 개(기본 최신·직전) → 기관별 h0/h24/h48 표 + 지구 위 트랙 두 개(이전은 회색 점선). `changes` 목록을 그대로 문장으로. 비교 id = `${eventId}:${rA}:${rB}` — URL 파라미터로 재현 가능(`?event=…&compare=r025,r026`).
- **검증 카드**: `detail.interimScores`·`headingScores`(활동 중, 기관 실황 기준 잠정) / `scores`(종료, IBTrACS 기준). 표 머리에 기준·표본·리드타임 명시. 순위 문구 금지 — "방향을 가장 가깝게 본 자료"는 같은 리드타임·같은 표본에서만.
- **NEXT 자동 채움**: 사건을 열면 그 사건 `revisions[-1].agencies`의 h24/h48을 NEXT 탭에 official/model 구분으로 싣는다(현재 NEXT는 켜진 레이어에만 의존해 기본 0건).
- **REPORT 링크**: 사건 방 하단에 `분석 보고서 열기 → lab-reports.html?report=cyclone:{id}`.

**테스트** `tools/test_v2_event_ledger_ui.mjs`: fixture 패킷으로 카드 문구·정렬·팔로우 고정·비교 표 행 수·검증 표에 "순위" 단어 없음.

### D-4. 공식 발표 원문 보존 — `aws/typhoon-official/handler.py`
현재 `events/typhoon-official.json`은 최신 발표만 남긴다. 세션에 회차가 있지만 비공개다. `events/typhoon-official/archive/{key}/{issue}.json`으로 발표별 원문을 남기고(공개, 불변), 패킷의 각 revision이 이 파일을 `sourceRef`로 가리킨다 → "이전 발표를 다시 열면 당시 값이 보존"(보고서 19쪽 변경 재현).

---

## E. 내 장소 · 관심 조건 · 감시 (P1-3)

- `myEarth.place` ↔ 특보 구역: `kma-warn-stations.json`(지점→구역)로 내 구역 id를 정하고, 사건 방 D-2의 `nearestWarnRegionKm`에 **내 구역 포함 여부**를 더한다: `내 구역(부산 남서해상)에 풍랑경보 발효 중` / `내 구역 특보 없음 (전체 45건)` / `특보 조회 불가`.
- 관심 조건은 3종만 먼저: `내 구역 특보 발생`, `팔로우 사건 revision`, `내 위치 400 km 안 M5+`. 조건 충족 기록 `{conditionId, eventId, revisionId, at, reasonKo, dedupeKey}`를 `localStorage`에 쌓고 패널 "내 장소"에 목록으로. 푸시는 기존 `push.js` 경로에 `dedupeKey`를 실어 중복 방지. 수집 실패 시 `감시 중단 (특보 소스 조회 불가)` 상태를 보여주고 "안전" 문구를 만들지 않는다.
- 공식 경보 배지와 사용자 조건 배지는 다른 색(공식 `off`, 조건 `info`).

**테스트** 조건 판정 순수 함수 `evaluateWatch(place, packet, warn)`에 대한 케이스 6개(발생·해제·실패·중복·범위 밖·재발).

---

## F. 가정 실험 — 기준 고정 (P2)

현재 `getScenario`는 대한해협 고정점 + `OceanSim.setParams({Hs, swellH, windSpeed…})` 데모. 아래만 바꾼다 — 검증된 영향 모델 없이 피해·확률을 만들지 않는다.

- **baseline**: 선택 사건의 `revisions[-1].agencies.KMA.h24`(없으면 JMA) 위치·풍속을 기준으로 지점·바람 파라미터를 채운다. 카드에 `기준: 기상청 09/05 09:00 발표 +24h`.
- **intervention**: 슬라이더 2개만 — 최대풍속 오프셋(−10~+10 m/s), 경로 오프셋(−200~+200 km 횡방향). 파고는 `Hs = 0.0248·U²` 류의 단순 관계식을 쓰되 이름과 출처를 화면에 적고 `SIMULATION_ONLY` 배지.
- **기록**: `{scenarioId, baselineEventId, revisionId, interventions, modelVersion:'sim-ocean@6', seed, createdAt}`를 `localStorage`에. 같은 기록을 다시 열면 같은 파라미터.
- **결과 문구**: `기준 대비 파고 +1.2 m (연출용 파도 모델)` — "연안 침수"·"피해"·"대피" 단어 금지(테스트로 고정).

---

## G. 운영 정합 · 테스트 진입점 (P0-1)

1. **v2 개편 빌드 배포**: `node tools/build_information_release.mjs` → manifest에 `entrypoint: v2-three/index.html`, `commit`, `dataSchema: {cycloneEvents:1}`, `testRun` id → `tools/deploy-v2-three.sh`. 배포 뒤 `curl earthus.net/v2/` 스크립트 해시 = manifest 해시 확인을 `tools/verify_v2_deploy.mjs`로 자동화(현재 수동).
2. **CI 재조준**: `tools/test_v2_intelligence_runtime_browser.mjs`가 `prototype/v2`(Cesium)를 여는 문제 — 진입점을 `prototype/v2-three/index.html`로 바꾸거나 이름을 `test_v2_cesium_*`로 바꿔 **제품 판정에서 분리**. 워크플로 이름의 "Intelligence Runtime"을 제품 경로에만 쓴다.
3. **브라우저 증거 규격**(모든 P0·P1 완료 보고에 첨부): 운영 URL · 배포 SHA · 뷰포트(390×844, 1280×800) · 계정 상태 · 실패 주입 여부 · 콘솔 오류 수 · 네트워크 실패 목록 · 전환 전후 캡처 2장. 로컬 캡처와 운영 캡처를 섞어 보고하지 않는다.

---

## H. 지구에 묻기 — 도구 제안 (P1)

**현재** 근거 없으면 `자료 부족`으로 끝. §17C.1이 허용한 "승인된 Scene Tool 호출 제안"을 안 쓴다.
**바꿀 것** Lambda 프롬프트에 "답할 수 없으면 `actions`에 필요한 레이어의 `showLayer`를 제안하라(레이어 목록은 스냅샷의 `availableLayers`)"를 추가하고, 브라우저는 `availableLayers=[{id,name,kind}]`를 스냅샷에 싣는다. 답 카드에 `이 자료를 켜면 답할 수 있습니다: [태풍 공식 트랙 켜기]` 버튼(승인 도구 경로 그대로). 켜진 뒤 자동 재질문은 하지 않는다(사용자 클릭).
**테스트** `aws/earthus-llm/tests`: 스냅샷에 태풍 레이어 없음 + 모델 응답 fixture(`showLayer tyoff`) → 브라우저 `dropped`가 아니라 `suggested`로 분류.

---

## I. 순서와 완료 기준

| 순서 | 묶음 | 완료 기준(모두 충족) |
|---|---|---|
| 1 | G-1 v2 개편 빌드 배포 | 운영 `/v2` 탭이 사건·내 장소·선택 자료·자료의 근거·예보·예정·가정 실험 / 해시 일치 로그 |
| 2 | A (F01·F02·F03·F05) | 테스트 4파일 통과 · 실패 주입 운영 캡처에 "없음/방금" 오표기 0 |
| 3 | B (F04) | 경쟁 테스트 통과 · 운영 캡처 트랙 1개 |
| 4 | C (F06~F08) | 배지 동일성 테스트 통과 · 기관별 행 캡처 |
| 5 | D-1·D-4 백엔드 패킷 | `ocean/cyclone-events/*.json` 생성 · 패킷 테스트 통과 · 크기 ≤ 60 KB/사건 |
| 6 | D-2·D-3 화면 | 카드에 변경·이유·신뢰도 / 비교 URL 재현 / 검증 표에 순위 단어 없음 |
| 7 | H | 도구 제안 캡처 |
| 8 | E | 조건 6케이스 통과 · 실패 시 "감시 중단" 캡처 |
| 9 | F | 기록 재현 · 금지 단어 테스트 |
| 10 | G-2·G-3 | CI 진입점 일치 · 증거 규격으로 전 항목 재보고 |

**보고 형식**(항목마다): 코드 존재 / 실제 데이터 연결 / 로컬 브라우저 통과 / 운영 배포 확인 / 실기기 확인 — 다섯 칸을 따로 적고 비어 있는 칸은 비워 둔다.

## J. 하지 않을 일
새 프로젝트·프레임워크 교체·Cesium 회귀·새 인텔리전스 엔진 추가·미검증 정확도 숫자·"AI 분석" 명칭의 유료 벽·확률/피해/대피 문장 생성. 개념도 12장 원칙 10개를 PR 체크리스트로 붙인다.

## K. 이번 지시서에서 새로 확정한 계약 요약
- 사건 시각 4분법(occurred/issued/updated/retrieved), `Date.now()` 대체 금지
- 소스 상태 5분법(OK/EMPTY/FAILED/STALE/OUT_OF_SCOPE)과 `tl.action` 결정표
- 특보 연관 2단계(RELATED ≤350/200 km · DOMESTIC)
- 선택 세대 토큰 + AbortController
- 공개 사건 패킷 v1(revisions·changes·importance·confidence·uncertainty·detail) — 태풍 먼저, 8현상 동일 스키마
- Feed 카드 8필드(제목·장소·시각·상태·변경·이유·진리등급·신뢰도) + 팔로우
- 비교 id·시나리오 기록의 재현성

---

## L. 배치와 디자인 — "후" 화면 규격

현행 토큰을 유지한다: `--panel-bg rgba(10,16,24,.82)` · `--panel-line rgba(120,160,200,.25)` · `--accent #7FB7F5` · `--text-dim #7f95a8`. 인텔 패널은 지금처럼 **우하단 고정, 데스크톱 372px·최대 62vh, 폰은 전폭·52vh 시트**. 새 화면을 만들지 않고 이 패널 안의 카드 문법만 바꾼다.

### L-1. 패널 뼈대 (데스크톱 372px)

```
┌ EARTH INTELLIGENCE ───────────────────────── ✕ ┐
│ [사건] [내 장소] [선택 자료] [근거] [예보] [실험]   │  탭 6개 — 이름 유지
├───────────────────────────────────────────────┤
│ ▸ KROVANH-26 · 오키나와 북서 180 km · 09/05 09:00  │  ← 공통 컨텍스트 바 (sticky, 34px)
│   회차 r026 · 갱신 25분 전 · [팔로우 중]          │     사건·장소·기준 시각·회차 — 모든 탭 공통
├───────────────────────────────────────────────┤
│ (탭 내용 — 카드 스택, 카드 간 8px)                 │
│                                               │
└───────────────────────────────────────────────┘
```
- 컨텍스트 바는 사건을 열었을 때만 나타나고, 탭을 바꿔도 남는다(보고서 15쪽 "네 가지가 모든 탭에서 일치").
- 사건이 없으면 바 대신 `선택 장소: 지도에서 선택 · 켜진 자료 3` 한 줄(현행 정보 접근성 헤더).

### L-2. 사건 카드 (피드)

```
┌──────────────────────────────────────────────┐
│ ● KROVANH-26  열대저기압        [공식 예보] [신뢰 中] │  제목 13px · 배지 2개 우측
│ 오키나와 북서 180 km · 발표 09:00 · 갱신 25분 전     │  11px dim
│ 바뀐 것  실황 21→24 m/s ↑ · 24h 남서→남 · 풍랑경보 +1 │  12px, "바뀐 것" 라벨은 accent
│ 왜 지금  경보 Orange · 한국 특보구역 350 km 안 2개    │  12px, 라벨 dim
│                          [사건 열기 ›]  [☆ 팔로우] │  버튼 min-height 36px
└──────────────────────────────────────────────┘
```
- 좌측 점: 종류색(TC `#ffb36a` · EQ `#d98a6a`), 경보 Red면 글로우(현행).
- **신뢰 배지 색**: 高 `badge.live`(초록) · 中 `badge.off`(파랑) · 低 `badge.stale`(호박). 진리등급 배지와 **항상 두 개 나란히** — 하나는 "무엇으로 아는가", 하나는 "얼마나 믿나".
- `RESOLVED` 사건은 목록 끝 `지난 사건 3건 ▾` 접힘 줄로.
- 팔로우 중 카드는 좌측 2px accent 세로선 + 새 회차면 제목 앞 `NEW` 점(accent).

### L-3. 사건 방 (사건 열기 뒤 — 세로 순서 고정)

```
[← 피드]                                 ☆ 팔로우
━━ 1. 지금 ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
 27.7°N 126.7°E · 오키나와 북서 180 km
 ┌────────┬────────┬────────┬────────┐
 │실황 시각│ 진행   │풍속·기압│ 등급   │   meta 2×2 그리드 (현행 .meta)
 │09:00 KMA│남 14km/h│24·990 │태풍(환산)│
 └────────┴────────┴────────┴────────┘
━━ 2. 기관 스택 ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
 한국 기상청  발표 09:00 · +24h 21 m/s 994 hPa    [공식 예보] [지구에 켜기]
 일본 기상청  발표 09:45 · +24h 18 m/s · 위치차 65km [공식 예보] [지구에 켜기]
 ECMWF 앙상블 50멤버 · +48h 폭 130 km              [모델]     [지구에 켜기]
 기상청 특보  조회 불가 (timeout 15s)              [확인 불가] [재시도]      ← 실패 행은 회색 배경·주황 배지
 해상 관측    반경 600 km 안 없음 (전체 193곳)      [관측]                  ← 없음 행은 dim 텍스트
━━ 3. 이전 발표와 비교 ━━━━━━━━━━━━━━━━━━━━━━━━━
 [r025 09/04 21:00] ⇄ [r026 09/05 09:00]   ← 회차 선택 칩 2개
 실황 21→24 m/s · 24h 남서→남 · 풍랑경보 +1        ← changes 문장
 ┌ 기관 │ h0 위치 │ h24 위치 │ 풍속 ┐  표 (이전 값은 dim, 변한 칸만 accent)
 지구 위: 현재 트랙 실선(주황) · 이전 트랙 회색 점선
━━ 4. 다음 → 행동 ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
 다음  +24h 21 m/s · 오키나와 남서 150 km (기상청)
 행동  관련 구역 특보 없음 (전체 45건 · 09:13 자료)   ← 상태 5분법 문구
━━ 5. 지금까지의 검증 (잠정 · 기상청 실황 기준) ━━━━━━
 방향 오차  JMA 8° · KMA 9° · EARTHUS 15° · ECMWF 18°
 위치 오차  … (n, 리드타임 명시)                      ← 구독 아니면 이 카드만 잠금(lock 박스)
━━ 6. 근거 ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
 발표 09:00 · 갱신 09:13 · 수집 09:38 · 원문 ↗ · 분석 보고서 ↗
```
- 섹션 제목은 12px 대문자 없이 한글, 상단 1px 선(현행 `.rd-sec` 문법).
- "없음"과 "확인 불가"는 색이 다르다: 없음 = dim 텍스트, 확인 불가 = `badge.na` 주황 + 행 배경 `rgba(150,90,70,.08)`.
- 비교 섹션은 회차가 2개 미만이면 `첫 회차 — 비교 대상 없음`으로 자리를 비우지 않는다.

### L-4. 지구 위 표현

| 요소 | 스타일 |
|---|---|
| 현재 공식 트랙 | 실선 `#ffb36a` 폭 2px (현행) |
| 이전 회차 트랙 | 회색 `rgba(200,210,220,.55)` 점선 |
| 불확실성 폭 | +24/+48h 점에 반경 = `uncertainty.agencySpreadKm` 원, 채움 8% 알파 — **확률 원뿔 아님**, 툴팁 "기관 예보 위치 차" |
| 팔로우 사건 마커 | 마커 테두리 accent 링 |
| 내 구역 특보 | 내 장소 마커 위 작은 `off` 배지 |

### L-5. 폰 (≤720px)

- 패널은 현행대로 전폭·52vh 시트. 컨텍스트 바는 시트 최상단 sticky. 사건 방 섹션 1~6은 같은 순서, `.meta` 2열 유지(현행 규칙), 기관 스택 행은 2줄로 접힘(기관·값 / 배지·버튼).
- 비교 표는 가로 스크롤(`.wrap`), 회차 칩은 시트 상단에 고정.
- 글자: 제목 14px · 본문 13px · 보조 11px (현행 10~12px에서 한 단계 올림 — 정보 접근성 보고서 F05와 같은 기준). 버튼 min-height 40px.

### L-6. 상태 색·문구 표 (전 화면 공통)

| 상태 | 배지 | 문구 예 |
|---|---|---|
| OK | 진리등급 배지 그대로 | `+24h 21 m/s` |
| EMPTY | 없음 (dim 텍스트) | `수집 범위 안 없음 (전체 45건)` |
| FAILED | `badge.na` 주황 `확인 불가` | `조회 불가 (timeout 15s)` + 재시도 |
| STALE | 진리등급 + `badge.stale` `42분 전` | `STALE · 42분 전 자료` |
| OUT_OF_SCOPE | dim | `한반도 밖 — 기상청 특보 범위 아님` |
| SIMULATION | `badge.sim` 분홍 | `기준 대비 파고 +1.2 m (연출용 파도 모델)` |
| 잠금 | `.lock` 호박 박스 | `검증 표는 구독·관리자에게` |

---

## M. 표기 규칙 추가 — "EARTHUS 추정"은 "기준선"이다

LAB·사건 방·패킷에서 우리 계산(여진 기대수 RJ 일반형, Kp 지속성, 화점 성장, 표류 지속성, 근지점 수명, 다중소스 진로)은 **`EARTHUS 기준선(baseline)`**으로 부른다. 용도는 "기관 예보·관측이 이 기준선보다 얼마나 나은가"를 보이는 것이지 우리 예측을 파는 것이 아니다.

- 배지: `EARTHUS_ANALYSIS`(자체 분석) 그대로 쓰되 표기 문구를 `기준선`으로. 카드 제목 예: `여진 기대수 기준선 (Reasenberg-Jones 일반 매개변수)`.
- 검증 표의 행 이름: `EARTHUS 기준선`. 기관보다 오차가 작게 나와도 "우리가 더 맞았다"는 문장을 만들지 않는다 — `기준선 대비 KMA −40 km` 형식으로만.
- 지역 보정·학습 매개변수를 넣기 전에는 `일반 매개변수`를 반드시 병기한다.
- 테스트: `tools/test_lab_wording.mjs` — 렌더 결과에 `EARTHUS 추정`·`우리 예측`·`더 정확` 문자열이 없어야 한다.

## N. 시뮬레이션이 될 만한 메뉴 — 우리가 실제로 계산해도 되는 곳

원칙: ① 물리가 교과서 수준으로 확정 ② 입력을 이미 갖고 있음 ③ **독립 관측·공식값으로 채점 가능** ④ CPU 몇 초 ⑤ 안전 판단(대피·피해)으로 승격하지 않음. 다섯을 다 만족하는 것만 "시뮬레이션"이라 부른다. 기상 예보·태풍 진로 자체 모델·파도 물리는 ①②는 되지만 ECMWF·기상청과 겨루는 일이라 **하지 않는다.**

| 순위 | 메뉴 | 시뮬레이션 | 입력(있음) | 채점 기준(독립) | 화면 |
|---|---|---|---|---|---|
| 1 | 재해 › 쓰나미 | **도달시간 지도** — 장파 속도 c=√(g·h)로 진원에서 등시선(파면 전파, fast-marching) | ETOPO 격자: 전지구 0.2°, 태평양 ~2.5 km, 한국 ~1.7 km (`bathymetry-manifest`) | PTWC/JMA 게시문의 예상 도달시각(ETA)과 지점별 차이(분) | 지진 사건 방에 등시선 30분 간격, `SIMULATION_ONLY` — 파고·침수 아님 |
| 2 | 우주 › 재진입·위성 | **궤도 전파 + 대기 밀도 시나리오** — SGP4 위에 F10.7/Kp 조건별 잔여수명 폭 | CelesTrak 카탈로그, SWPC 지수(둘 다 수집 중) | SATCAT 실제 붕괴일, Space-Track 없이도 가능 | 재진입 카드에 "조용한 태양/활발한 태양" 두 폭 — 낙하 지점은 절대 계산하지 않음 |
| 3 | 재해 › 지진 | **여진 시퀀스** — RJ → 지역 보정 ETAS (한·일은 JMA/기상청 카탈로그로 b·p 추정) | USGS·quake-asia 카탈로그(수집 중), 25년 카탈로그 18만 건 | 창별 실제 여진 수(이미 LAB에서 채점) | 사건 방 "앞으로 7일 M4+ 기대 N회 · 기준선 대비" |
| 4 | 해양 › 표류 | **라그랑주 표층 이류** — ADR-001이 채택한 OceanParcels RK4, HYCOM 표층류 (+바람 3% 항 옵션) | HYCOM 0 m 격자(ADR fixture), 기상청 **표류부이 13기**(`kma-buoy.json kind=표류부이`) | 표류부이 실제 이동 vs 입자 이동 분리 거리(km/일) — 이미 우리 수집 자료에 정답이 있다 | 해양 사건 방 "이 지점의 24·48·72h 표류 후보" — 수색·유류 용도 표기 금지(ADR 그대로) |
| 5 | 날씨 › 황사·연기 | **바람장 후방/전방 궤적** — GFS/Open-Meteo 850 hPa 바람으로 24~72h 궤적 | wind-grid·pressure-grid(수집 중), FIRMS 화점 | 황사: 에어코리아 PM10 도착 시각 / 연기: 다음 날 FIRMS·GMGSI 위치 | 대기질·산불 사건 방 "어디서 왔나/어디로 가나" 화살, `MODEL_SIGNAL` |
| 6 | 해양 › 해수면·침수 | **노출 셈** — KHOA SSP 상승량 + DEM 욕조 모델로 "잠기는 격자 수·거주 인구(WorldPop)" | KHOA 4 시나리오, Terrarium 고도, WorldPop | 채점 불가(미래) → `SIMULATION_ONLY` 고정, 비교 전용 | 해양 메뉴 SSP 4종 비교 카드 — "피해"·"대피" 단어 금지 |
| — | 해양 › 태풍 해상 시뮬 | 현행 파도 **연출** | — | — | `연출용 파도 표현`으로 이름 변경, 시뮬레이션이라 부르지 않음 |

각 항목은 §F의 기록 규칙(baselineEventId·revisionId·modelVersion·seed)과 §M 표기 규칙을 따른다. 착수 순서는 1(쓰나미 도달시간) → 4(표류, ADR-001 이미 진행) → 3 → 2 → 5 → 6.
