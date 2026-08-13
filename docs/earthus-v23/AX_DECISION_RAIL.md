# AX DECISION RAIL — EARTHUS v2.3 AX-01

> 기준일: 2026-08-14 KST
>
> 상태: 선택 지점 맥락 UI·한국 공식 특보 Safety 연결 완료
>
> 공개 경계: `DECISION_CORE_READY=false`, Activity Score·개인화·예약 행동은 미공개

## 1. 제품 판단

EARTHUS의 AX는 자유 대화형 챗보다 사용자가 지구본에서 선택한 `Place + Time +
Activity`에 공식 근거를 붙이는 경험이다. 사용자가 원하는 것은 AI와 대화하는 자체가
아니라 “이 장소에서 이 시간에 이 활동을 해도 되는지, 무엇을 근거로 판단했는지”다.

따라서 공개 UI의 읽기 순서를 다음으로 고정한다.

```text
아름다운 첫 지구
  → 장소 선택
  → 현재 시각·5개 활동 profile
  → 공식 특보 Safety Hard Gate
  → 5축의 실제 자료 준비 상태
  → 연결된 지구 자료에 더 물어보기
```

## 2. 공개 계약

1. 첫 Earth View에서는 하단 판단 손잡이만 접힌 상태로 보인다.
2. 지구본의 지점을 누르면 정적 선택 링과 판단 레일이 열린다. 링은 위험 영역이
   아니며 특보 polygon으로 표현하지 않는다.
3. 5개 profile ID는 PR-07과 같은 `BASEBALL_SPECTATOR`, `CAMPING`,
   `FUTSAL_OUTDOOR`, `HIKING`, `STARGAZING`다.
4. 기상청 공식 특보는 선택 좌표로 다시 계산한다. 내 현재 위치의 `warn.mine`을 재사용하지
   않는다.
5. 공식 region ID가 정확히 일치한 발효 특보만 `OFFICIAL_WARNING_ACTIVE`로 표시한다.
   이 경우 Activity Score가 높아도 긍정 추천을 먼저 제한한다.
6. 무특보·자료 지연·구역 미매핑·한국 밖은 `SAFE`가 아니라 `UNKNOWN` 또는 적용 범위
   밖이다. 록색 안전 상태를 만들지 않는다.
7. 현재 시각만 지원한다. 선택 장소의 현지 timezone과 해당 시각 예보 snapshot이 없는
   상태에서 미래 시각을 추측하지 않는다.
8. 나머지 4축은 숫자를 만들지 않고 `공개 전 검증`, `실데이터 연결 전`, `확인할
   자료 없음`으로 구분한다.

## 3. 화면과 접근성

- 레일은 지구 장면에서만 보이며 AETHERUS·심해 장면과 다른 시트가 열린 동안은 숨긴다.
- 판단 레일을 펼치면 EARTHUS/AETHERUS 세로 손잡이를 숨겨 본문을 가리지 않는다.
- 모든 활동·닫기·질의 표적은 최소 44×44px이다.
- 390×844에서 패널은 자체 스크롤하고 문서 가로 overflow를 만들지 않는다.
- 동작은 표시 상태 변화만 사용하며 timer·`requestAnimationFrame`·무한 펄스를 추가하지 않는다.

## 4. `물어보기`와의 경계

판단 레일의 `지구 자료에 더 물어보기`는 선택한 지명·좌표·활동을 맥락 표시로만
전달한다. 현재 규칙 라우터는 자유 좌표나 Activity Score를 질의 인자로 이해하지 못하므로
지원하지 않는 문장을 자동 전송하지 않는다. 태풍·지진·수온 등 기존에 연결된 자료만
찾는다는 한계를 패널에 고정한다.

## 5. 구현 파일

- `prototype/js/decision-rail.js`: 상태·지명·Safety·마커·5 profile·질의 연결
- `prototype/css/decision-rail.css`: 하단 레일·데스크톱/모바일·접근성·충돌 방지
- `prototype/js/warn.js#safetyAt`: 선택 좌표 전용 Safety 재평가
- `prototype/js/main.js#onPick`: Cesium 표면 좌표 이벤트
- `prototype/js/ask/panel.js#openContext`: 지원 범위를 숨기지 않는 맥락 전환
- `tools/test_decision_rail.mjs`: 서울 호우경보·한국 밖·Shadow 자산 미요청·44·5축·모바일 실화면

## 6. 다음 공개 gate

AX-02는 한국 `STARGAZING`을 첫 live decision canary 후보로 둔다. 다음을 모두 통과하기
전에는 이번 레일의 상태 문구를 점수로 바꾸지 않는다.

1. profile 곡선·weight·하산 여유 도메인 승인과 revision freeze
2. 실제 source adapter가 source/time/revision/unit/`n`/missing을 보존하는 E2E
3. Forecast Confidence 6차원 실데이터·provider failure·stale replay
4. 활동별 공식 폐쇄·운영·예약 provider와 권리·신선도 승인
5. 한국 밖 지역의 현지 Safety provider. 없는 지역은 지속 `UNKNOWN`
6. canary·rollback rehearsal·실제 Safari/iPhone·VoiceOver·열/배터리 검수
7. PD의 명시적 `DECISION_CORE_READY=true` 승인

개인화는 그 다음이다. 명시적 동의·설정·철회·삭제·RLS·보존기간을 검증한 뒤에도
개인화는 Base Activity Score만 제한된 폭으로 보정하며 Safety·폐쇄·Confidence·혼잡·예약
사실을 바꾸지 못한다.
