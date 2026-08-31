# AETHERUS PR-15 — 발사 순간 캡슐 (Launch Moment Capsule)

> 기준일: 2026-08-31 (Asia/Seoul)
> 상태: `DIRECTIVE_CANONICAL / IMPLEMENTATION_NOT_STARTED / PROVIDER_AND_SERVER_EXTERNAL`
> 선행 기준: `docs/earthus-v23/AETHERUS_LAUNCH_PAYLOAD_FOUNDATION.md` · `docs/earthus-v23/AETHERUS_MISSION_CONTROL_FOUNDATION.md` · `docs/AETHERUS-PR-09-MISSION-MEDIA-REPLAY-2026-08-12.md` · `prototype/js/space/launch-payload-contract.js`(발사 상태 정본) · `docs/greenfield/canonical/EARTHUS_V2_CLAUDE_CODE_FULL_DEVELOPMENT_MASTER_v5.3_KO.md` §17B·STO-009(Event Capsule)·§31.3(Postmortem)·§33.1(Data Depth Passport) · `Aetherus_Orbital_Environment_Codex_Package_v1.2/DATA_CONTRACTS.md`
> 엔진 소유: E18(기록)·E19(재생) additive 책임 확장 — `docs/AETHERUS-V2-V06-ADDENDUM-01-SKY-MEDIA-ENGINES-2026-08-31.md` §1 확장 조항 준거

---

## 0. PD 결정 기록 (2026-08-31)

> "로켓 발사 상황을 저장해둠. 영상 링크도 저장하고, 당시 우주쓰레기, 주변 위성, 발사대 날씨 등 당시 상황을 저장해서 다시 보여주는 유료구독자용. (덕후나 교육자들이 필요할듯)"

발사의 "기록"은 **영상 저장이 아니라 상황 캡슐이다.** 발사 시점을 둘러싼 검증된 상태 — 발사 상태 전이, 공식 중계 링크, 당시 궤도 환경(우주쓰레기·주변 위성), 발사대 기상 — 를 출처·관측시각과 함께 불변 스냅샷으로 보존하고, 유료구독자가 나중에 그 순간을 다시 재생할 수 있게 한다. 대상 사용자: 우주 애호가, 교육자.

## 1. 소유권 — 신규 엔진 없음

v0.6 정본의 기존 엔진이 계약으로 수용한다. 신규 엔진 ID를 발급하지 않는다. 아래 확장은 부록 01 §1의 **additive 책임 확장 조항**(기존 책임의 축소·이전 없이 추가만 허용, 부록 문서로 기록)을 따른다.

| 책임 | 소유자 |
|---|---|
| 캡슐 기록(수집·조립·봉인) | **E18 Mission Timeline & Recorder** additive 확장 |
| 캡슐 재생 | **E19 Mission Replay & Mission-to-Orbit Handover** additive 확장 |
| 중계 링크 해석 | **S06 Media/Live Stream Resolver** |
| 궤도 환경 스냅샷 공급 | E20(전파)·E21(conjunction)·E24(환경/혼잡) — Codex Package 계약 준수 |
| 구독 집행 | S02 Subscription Capability |

EARTHUS 쪽 대응물은 STO-009 Event Capsule Builder다(v5.3: `PRESERVE_AND_REUSE; NO_RENAME; NO_NEW_ENGINE_UNLESS_GAP_EVIDENCE`). 발사 캡슐은 Event Capsule 패턴의 발사 도메인 인스턴스이며 별도 저장 체계를 만들지 않는다.

## 2. 캡슐 계약 — `earthus.launch-capsule.v1`

### 2.1 식별 모델

- **시리즈 ID**: `capsule:<provider>:<launchId>` — 한 발사 시도의 캡슐 계보를 가리킨다.
- **revision 고정 ID**: `capsule:<provider>:<launchId>@<revision>` — 불변 스냅샷 1개를 가리킨다.
- 클라이언트는 시리즈 ID로 요청하면 **최신 revision**을 받고, revision 고정 ID로 요청하면 그 revision을 받는다. 같은 revision 고정 ID 재요청은 언제나 동일 바이트를 반환한다(멱등).
- `launchRef.provider` 허용값은 레지스트리로 관리하며 초기값은 `LL2` 하나다. 열거 밖 provider는 거부한다.

### 2.2 수명 주기

```text
발사 최초 관측(SCHEDULED 첫 evidence)
→ DRAFT 캡슐 (수집 중, revision 미발급, 구독자 비노출)
→ 종결 상태 전이(SUCCESS | FAILED | SCRUBBED)
→ + 24h 수집 마감 → revision 1로 봉인 (immutable=true)
→ 이후 변경은 정정만: 새 revision + supersedes 참조 (PR-09 assertion 규칙과 동일)
```

- `capturedWindow.fromUtc` = 그 발사의 최초 SCHEDULED evidence 시각, `toUtc` = 종결 상태 전이 + 24시간.
- **SCRUBBED 재순환**: SCRUBBED는 terminal이다(상태 정본). 스크럽된 시도는 그 시도의 캡슐로 봉인하고, replacement 발사는 별도 event ID이므로(Launch·Payload Foundation) **새 시리즈의 새 캡슐**이다. 한 캡슐의 윈도를 늘려 여러 시도를 담지 않는다.
- revision 증가 트리거는 봉인 후 **정정**뿐이다(잘못된 evidence 교정, 권리 상태 변경). 봉인 전 갱신은 DRAFT 안에서 일어나며 revision을 만들지 않는다.

### 2.3 스키마

```json
{
  "schema": "earthus.launch-capsule.v1",
  "capsuleId": "capsule:LL2:<launchId>@1",
  "seriesId": "capsule:LL2:<launchId>",
  "revision": 1,
  "supersedes": null,
  "immutable": true,
  "launchRef": { "provider": "LL2", "id": "…", "name": "…" },
  "capturedWindow": { "fromUtc": "…", "toUtc": "…" },
  "stateTimeline": [
    { "state": "10-state 전이", "assertedUtc": "…", "source": "official|curated", "sourceUrl": "https://…" }
  ],
  "broadcast": [
    { "officialUrl": "https://…", "delivery": "EMBED|LINK", "storedByEarthus": false, "verifiedAt": "봉인 시 확인 UTC" }
  ],
  "orbitalContext": {
    "debris": { "provenance": "Codex provenance envelope", "quality_grade": "PUBLIC_GP 등", "snapshotAt": "…" },
    "nearbySatellites": [ { "catalog_id": "문자열", "cospar_id": "…", "source": "…", "epoch": "…" } ],
    "conjunctionNotes": "PC/MAX_PC/MISS_DISTANCE/DENSITY 채널 분리 유지"
  },
  "padWeather": { "state": "INSUFFICIENT_DATA", "provider": null, "observedAt": null },
  "dataDepthPassport": "v5.3 §33.1 형식 (CURRENT/HISTORY/TRUTH/EXPORT/SOURCE RIGHTS/QUALITY)"
}
```

### 2.4 nearbySatellites 선정 기준

선정 기준의 세 축과 소유자를 이 문서가 고정한다(세부 수치는 구현 검증으로 조정 가능하되 축 변경은 정정 대상):

- **공간**: 발사의 목표 궤도 고도대 ± 50 km 셸 및 발사 방위각 상승 회랑
- **시간**: `capturedWindow` 내 epoch의 궤도해만 사용 (T-0 기준)
- **상한**: conjunction screening 근접 순위 상위 50개, 초과분은 개수만 기록
- **계산 소유자**: E21 Conjunction Screening의 additive 확장. Codex 계약대로 `catalog_id`는 문자열, provenance envelope 필수, 수치 없으면 `UNAVAILABLE`.

## 3. 진실 규칙 (기존 계약 전부 상속)

1. **영상 비저장.** "official broadcast는 HTTPS link/embed이며 Earthus가 영상을 저장하지 않는다"(Launch·Payload Foundation). 캡슐은 링크 + 봉인 시점 `verifiedAt`만 저장한다. **링크 생존 상태는 불변 캡슐 밖의 가변 레코드다** — 재생 진입 시 live-check를 수행해 `VERIFIED | UNREACHABLE_AT_CHECK`를 그 시점 사실로 표시하고, 죽은 링크를 다른 영상으로 대체하지 않는다. 영상 바이트 아카이브가 필요해지면 **별도 권리 협상 지침**이 선행되어야 한다 — 이 문서는 그것을 허가하지 않는다.
2. **상태 전이는 정본 상태기계만.** `launch-payload-contract.js`의 10-state/전이표를 그대로 쓴다. `PLANNED/LIVE_TELEMETRY/ESTIMATED/LAST_CONFIRMED` 혼합 금지, 모든 전이에 source·asserted UTC 필수.
3. **궤도 환경은 Codex 계약으로.** 모든 과학 출력에 provenance envelope(source_ids·snapshot·input hash·model·quality_grade·limitations) 필수. Pc 표기 시 "운영 CDM Pc 아님" 구분(`MaxProbability is not operational CDM Pc`)을 유지한다. 수치를 지어내지 않는다 — 없으면 `UNAVAILABLE/INSUFFICIENT_DATA`.
4. **발사대 날씨는 현재 계약 공백이다.** 저장소에 pad 날씨 provider 계약이 없다(확인: LL2 소비 필드에 기상 필드 없음, EARTH_WEATHER 위젯은 사용자 위치용). LL2 발사 항목의 기상 필드(예: probability) 소비 계약을 검증·추가하기 전까지 `padWeather.state='INSUFFICIENT_DATA'`로 고정한다. placeholder 수치 금지.
5. **재생은 PR-09 패턴.** `MILESTONE_ONLY`, `interpolation=NONE`, cue 사이 `DATA_GAP`, reducer는 timer 비소유, rights/revision 불일치는 `BLOCKED`. 캡슐 재생은 궤적 애니메이션을 지어내지 않는다 — 상태 전이·중계 링크·컨텍스트 패널을 시간축으로 되살릴 뿐이다.

## 4. 요금제와 권리 게이트

- 캡슐 열람·재생: **유료구독자용** (Aetherus+ 이상, S02/서버 entitlement 강제).
- **유료 열람·재생 개시 자체가 provider 권리 검토 통과에 게이트된다.** 캡슐은 provider 데이터의 재배포에 해당할 수 있으므로, `dataDepthPassport.SOURCE RIGHTS`에 provider별 캐시·표시·상업이용 판정을 기록하고 판정이 없는 provider의 데이터는 유료 화면에 내보내지 않는다. EXPORT는 별도로 약관 확인 전 `BLOCKED`.
- 발사의 공식 안전 정보(경고·통제 구역 등 공공 안전에 해당하는 것)는 캡슐과 무관하게 무료다 — "안전/공공 핵심정보는 paywall로 숨기지 않고 깊이/개인화/기록/분석/워크플로우를 과금"(v0.6 정본).
- 현재는 `FREE_OPEN`이므로 판매하지 않는다. 미공개 사유는 유료 잠금이 아니라 **수집기·provider·서버 미구축**으로 기록한다.

## 5. 외부 갭

1. 발사 일정 collector·dedup, 공식 live URL, telemetry provider(Launch·Payload Foundation 명시 미연결)
2. 우주쓰레기·conjunction 데이터의 실제 ingestion (Codex Package P0 — `services/aetherus-orbital`은 잔해 상태로 소스 없음)
3. 발사대 기상 provider 계약 (신규)
4. 캡슐 저장소(서버) + entitlement 서버
5. LL2 등 provider의 캐시·표시·상업이용 권리 검토 — §4 게이트의 전제

## 6. 수용 기준

- 캡슐의 모든 값에 source와 UTC가 있고, 없는 값은 `INSUFFICIENT_DATA`다.
- 영상 바이트가 EARTHUS 스토리지에 0건이다.
- DRAFT 캡슐이 구독자에게 노출되지 않고, 종결 전이 +24h에 봉인된다.
- 재생 중 cue 사이 구간이 보간 없이 `DATA_GAP`으로 표시된다.
- PC/MAX_PC 등 위험 지표가 채널 혼합 없이, 운영 CDM 구분과 함께 표기된다.
- 무자격 사용자는 서버에서 거부되고(UI 숨김만으로 잠그지 않음), 권리 판정 없는 provider 데이터가 유료 화면에 0건이다.
- 재생 진입 시 링크 live-check가 실행되고, 죽은 링크가 대체 영상 없이 정직하게 표시된다.
- 같은 revision 고정 ID 재요청이 동일 바이트를 반환한다(멱등).

## 7. 롤백

캡슐 기능 전체(기록·재생·카탈로그)를 한 단위로 되돌린다. E18/E19의 기존 mission replay 동작(PR-09)만 남는 상태가 유효한 롤백 지점이다.
