# EARTHUS V2 INTEGRATION-2 RESULT

```text
STATUS:  PARTIAL
PARENT:  234bd606
```

---

## 요약

새 엔진을 만들지 않았다. INTEGRATION-1 이 이어 놓은 길을 **운영에서 안전한 상태로 고정**했다.

가장 중요한 발견은 감사가 찾았다: **다음 배포가 미승인 초안 8건을 공개 주소로 올릴 뻔했다.**
`deploy-app.sh` 가 `prototype/` 을 통째로 공개 `app/` 로 동기화하는데,
그 안에 개발용으로 쓰인 배포 후보가 들어 있었다 — 그중 하나는 람다가 공개를 거부하는
`eligibility=BLOCKED` 였다. `.gitignore` 는 git 만 막지 sync 는 못 막는다.

---

## REPORT

| | |
|---|---|
| monthly | PASS — `report:2026-08` 팩트 57 · 스토리 20 · 교차도메인 5 |
| quarterly / annual | 구조 PASS · 내용 INSUFFICIENT_DATA (기간이 안 끝났다) |
| outlook (3종) | source-backed only — 덮는 산출물이 없어 비어 있고 사유를 적는다 |

## FORECAST

| | |
|---|---|
| lead-separated | **PASS** — 교차리드 순위를 제거했다 |
| models / variables | GFS · ECMWF IFS / 기온 · 바람 |
| sample size | 조합당 약 59,700 |
| 표시 항목 | 현상 · 모델 · 리드 · 지표 · 값 · 표본 (§3 요구 6종) |

### 무엇이 잘못돼 있었나

```text
cyclone-analog/handler.py:1243  위치오차: 6h~120h 를 한 숫자로 평균
                        :1711  **그 숫자로 기관 순위**            → 이름순으로 교체
                        :1482  방향오차: 같은 방식으로 평균
                        :1521  **그 숫자로 기관 순위**            → 이름순으로 교체
                        :1748  공개 패킷이 리드별 분해를 버림      → byLead 를 싣는다
lab-events/handler.py   오로라: Kp 0~72h 를 한 오차로            → '리드 합산' 명시
prototype/js/lab-report-detail.js  그 숫자로 "가장 가깝게 본 자료" 선언 → 리드별 판정
```

실제 값으로 보면 왜 금지인지 분명하다:

| | 24시간 | 120시간 | 교차리드 평균 |
|---|---:|---:|---:|
| JMA | **40 km** | 400 km | 100 |
| KMA | 60 km | **300 km** | **90** |

평균만 보면 KMA 가 낫다. 그런데 **두 리드의 승자가 다르다.** 뭉친 숫자는 그 사실을 지운다.

## VISUAL

| | |
|---|---|
| assets | 1 |
| verified | 1 (조건 6/6) |
| failed | 0 |
| 기록 항목 | assetId · sourceRoute · cameraState · layerState · capturedAt · viewport · pixelCheck · verified · fileHash |

여섯 조건: 실제 런타임 · 요청 레이어 존재 · 카메라 일치 · 픽셀 분산 · **파일 되읽기** · 메타 일치.
되읽기는 디스크에서 다시 읽어 sha256 을 대조하고 브라우저로 디코딩까지 확인한다.

## CONTENT / SOCIAL

| | |
|---|---|
| generated | 1 (`CNT-2026-000001` MONTHLY_EARTH) |
| ready | 1 (PAYLOAD_READY) |
| card payload | x · instagram 2종 |
| video | **없음** — 영상 생성 경로는 만들지 않았다 |
| approved | 0 — 자동 승인 경로가 없다 |
| published | 0 |

`PAYLOAD_READY ≠ APPROVED ≠ PUBLISHED` 를 코드에서 분리했다(§6).
MOCK 발행은 **PUBLISHED 로 세지 않는다** — 주소가 없는 가짜 글이기 때문이다.

## DRAFT PRIVACY

**FAIL → 부분 PASS**

| 경로 | 상태 |
|---|---|
| `deploy-app.sh` → 공개 `app/` | **고쳤다** — 후보 경로를 sync 에서 제외 |
| `events/social-drafts.json` | **남아 있다** — 인증 화면이 먼저다(인계 E) |
| `events/distribution-content*` | 부분 완화 — 차단·사람전용은 이미 보류 |

`aws/_shared/publication_privacy.py` 가 경계를 한 곳에 모았다. 알려진 구멍도
`allowed=False` 를 돌려준다 — 알려졌다고 허용으로 바꾸지 않는다.

시험이 배포 소스를 훑어 **비공개 상태 파일이 sync 에서 빠지지 않으면 FAIL** 한다.

> 검사기를 한 번 좁혔다. 처음엔 `status:"DRAFT"` 만 보고 AETHERUS 정책 문서 13개를
> 유출로 잡았다 — 그런 검사기는 곧 무시당한다. 이제 콘텐츠/리포트 봉투로 보이는
> 노드만 본다(실제 초안은 그대로 잡는다).

## PUBLICATION / READ-BACK

- `social_publish.publish_platform()` : 준비 → 승인 → 자격증명 → 발행 → **되읽기**
- 결과 기록: platform · contentId · publishedAt · remoteUrl · remoteStatus · requestId · readBack
- 자격증명 없으면 `PUBLISH_BLOCKED_NO_CREDENTIALS`
- 되읽은 글 id 가 다르거나 상태가 발행이 아니면 **PUBLISHED 로 올리지 않는다**
- SNS 어댑터는 **고치지 않았다**(다른 세션 소유) — 그 앞뒤만 감쌌다

## REPORT LINKS

| | |
|---|---|
| REPORT → PHENOMENON | PASS (실제 클릭 확인) |
| REPORT → INTELLIGENCE | PASS (실제 클릭 → `why` 탭) |
| REPORT → SIMULATION | 능력 있을 때만 버튼이 생긴다. 이번 리포트의 현상에는 없어 **미검증** |
| canonical URL | `/reports/2026-08` 표시 |

## BROWSER

| | |
|---|---|
| 1440×900 KO | PASS |
| 1440×900 EN | PASS |
| 375×812 EN | PASS |
| 375×812 KO | **미실행** (INTEGRATION-1 에서 확인) |
| 콘솔 | 동일 출처 전부 200 · 오류 0 |
| 가로 스크롤 | 0 |

## TESTS

```text
report-engine   159   (+36: INTEGRATION-2 35 · 승인 게이트 1)
_shared          37
distribution     71
cyclone-analog   26
lab-events        6
v2 mjs 4종      PASS
번들            소스 = 배포
```

## HANDOFFS

[INTEGRATION-2-HANDOFF.md](INTEGRATION-2-HANDOFF.md) — A~G.
가장 급한 둘:

- **C** `distribution/cli.py:243` 이 FACT_CHECK→REVIEW→APPROVED 를 **자동으로 걸어 준다.**
  사람이 아무것도 보지 않았는데 승인 상태가 된다 — 그러면 승인이 아무 정보도 담지 않는다.
- **E** `events/social-drafts.json` 공개. 인증된 관리 읽기 경로가 필요하다.

## UNRELATED

0 — 다른 세션의 추적 파일 35건 내용 그대로.

## KNOWN LIMITATIONS

- **초안 공개가 완전히 닫히지 않았다.** 배포 경로는 막았지만 S3 직접 경로는 남아 있다.
- REPORT → SIMULATION 을 실제로 눌러 보지 못했다(이번 리포트에 해당 현상이 없다).
- 분석 탭 이동이 **타이밍 재확인에 기댄다.** `main.js` 가 레이어 로딩 뒤
  `showTab('now')` 를 부르기 때문에, 400ms·1200ms 에 원하는 탭을 다시 고른다.
  깔끔한 구조가 아니다 — 레이어 로딩 완료 훅이 생기면 그걸로 바꿔야 한다.
- SNS **영상** 경로 없음. 카드(정지 이미지) 사양만 있다.
- 데이터 차트·지도 이미지 없음. 지구 캡처만 있다.
- 파이썬 시험 299건이 여전히 `npm test` 에 연결돼 있지 않다.
- `lab-events` 의 나머지 계산기(여진·화산재·대기질·표류)도 리드/구간을 합친 평균을 쓴다.
  오로라만 표기를 고쳤고 나머지는 손대지 않았다.

## NEXT

인증된 관리 읽기 경로 → 초안 완전 비공개 →
그 뒤에 PRODUCTION REPORT AUTOMATION · CONTENT CALENDAR · SNS AUTO-DISTRIBUTION.
