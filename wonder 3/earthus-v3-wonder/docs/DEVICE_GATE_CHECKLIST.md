# DEVICE GATE 체크리스트 (PHASE 1-D §3·§4) — Android Chrome · iOS Safari

Claude Code 는 실기기를 만질 수 없다. 이 문서는 **PD(또는 QA 담당)가 폰에서 직접 돌리는 절차**이고, 결과는 오버레이의 "결과 복사" JSON 을 이 문서 아래 표에 붙여 기록한다.
"페이지가 열린다"만으로 PASS 하지 않는다 — 14단계는 실제 상태 변화로만 자동 체크된다.

## 준비 (PC)

```bash
cd "D:\## APP\EARTHUS v2_APP\wonder 3\earthus-v3-wonder"
node scripts/dev-server.mjs 8790 --lan
```

콘솔에 `폰에서: http://<PC IP>:8790/apps/web/?qa=1&device=1` 이 찍힌다(`device=1` 이 있어야 실기기 결과로 저장된다). Windows 방화벽이 물으면 **개인 네트워크** 허용. 폰과 PC 는 같은 Wi-Fi.
(HTTPS 불필요 — 위치 권한을 쓰지 않는다. 서비스워커 없음.)

## 스테이징(HTTPS) 경로 — 2026-09-13 배포, PD 지시

같은 Wi-Fi 가 아니거나 개발 서버를 띄우기 어려우면 스테이징을 쓴다:

`https://earthus.net/wonder/next/apps/web/?qa=1&device=1`

- 커밋 `91bf2330` 의 정적 빌드(`docs/STAGING_DEPLOY_REPORT_2026-09-13.md`). production(`/wonder/`)·`/v3` 와 무관.
- 스테이징에는 개발 서버가 없어 QA 패널 **[저장] 은 실패한다**(`/qa-result` 403). 끝나면 **[복사]** → 메모/카톡으로 PC 에 옮겨 `docs/device-gate/device/<android|ios>-<ISO 시각>.json` 으로 저장(예 `android-2026-09-14T09-30-00-000Z.json`) → PC 에서 `npm test`. JSON 의 `device.source` 가 `device` 여야 한다(주소에 `device=1`).
- LAN 주소(아래 준비 절차)에서는 [저장] 이 파일을 바로 적는다. 둘 중 하나면 된다.

## 폰에서 (Android Chrome → iPhone Safari, 각각 1회씩)

주소 `http://<PC IP>:8790/apps/web/?qa=1&device=1` 을 연다. 왼쪽 아래 QA 패널이 뜬다. 아래 순서로 **손가락으로** 한다.

| # | 할 일 | 자동 체크 조건 |
|---|---|---|
| 1 | 페이지가 열리고 지구가 그려진다 | 첫 프레임 기록 |
| 2 | 한 손가락으로 지구를 끌어 돌린다 | 터치 드래그 ≥ 1 |
| 3 | 두 손가락으로 벌리거나 오므린다 | 터치 핀치 ≥ 1 (줌 단 이동) |
| 4 | 히말라야(에베레스트 부근)·아프리카 동부·아마존 중 하나를 톡 누른다 | 흐름이 earth 를 벗어남 |
| 5 | 종이가 펼쳐지고 라벨·랜드마크·캐릭터가 나타난다 | 흐름 active (first/revisit/reduced 와 unfold ms 기록) |
| 6 | 캐릭터를 톡 누른다 | tap 시퀀스 |
| 7 | (카드 닫은 뒤) 캐릭터를 길게 누른다 | longPress 시퀀스 |
| 8 | 톡 때 특별 동작(예티 wave·사자 jump·전기뱀장어 wiggle)이 보인다 | 시퀀스에 special 포함 |
| 9 | 톡 뒤 이야기 카드가 열린다 | story open |
| 10 | 카드의 [닫기] | story closed (환경 유지) |
| 11 | 카드 또는 상단의 [🌍 지구] | 접힘 → 줌아웃 → earth |
| 12 | 다른 지역(또는 같은 지역)을 한 번 더 들어갔다 나온다 | 방문 합계 ≥ 2 |
| 13 | 폰 세로에서 카드가 하단 시트로 뜬다 | 폭 ≤ 640 & story open |
| 14 | [움직임 줄이기] 체크 후 지역 진입 | plan.mode reduced |

끝나면 패널의 **[저장]** — 개발 서버가 `docs/device-gate/device/<android|ios>-<시각>.json` 으로 바로 적는다(폰에서 클립보드 불필요). 패널 제목 옆에 `device` 라고 떠야 실기기 결과다(`emulated` 면 데스크톱/에뮬레이션으로 분류돼 게이트 근거가 아니다).
[복사] 는 보조 수단(메모 앱) — 스테이징 주소에서는 유일한 수단. 저장 뒤 PC 에서 `npm test` 를 돌리면 `device-gate` 시험이 파일을 읽어 14/14 여부를 출력한다.
이 PC 의 Wi-Fi 주소 예(2026-09-13): `http://192.168.219.115:8790/apps/web/?qa=1&device=1` (서버 콘솔에 찍히는 주소를 쓴다).

## 성능 항목 (오버레이가 같이 적는다)

initial transfer KB/요청 수 · 지역 진입 후 transfer KB/요청 수 · 캐릭터 파일 수(≤ 지역 수 × 3, **124 아님**) · fps(최근 300프레임 평균) · 100ms 넘는 끊김 횟수 · heap(Chrome 만) · 자산 런타임 상주 KB.

## 결과 기록

| 기기 | OS/브라우저 | 날짜 | 14단계 PASS | 첫 그림 ms | 처음 KB/req | 지역 후 KB/req | 캐릭터 파일 | fps / 끊김 | 비고 |
|---|---|---|---|---|---|---|---|---|---|
| (Android) | | | /14 | | | | | | |
| (iPhone) | | | /14 | | | | | | |

JSON 원문은 `docs/device-gate/<기기>-<날짜>.json` 으로 저장한다.

**Claude Code 검증 범위(2026-09-13):** 인앱 Chromium 데스크톱·375×812 에뮬레이션에서 오버레이 자체가 켜지고 단계가 자동 체크되는 것까지. 실기기 결과는 없음.
