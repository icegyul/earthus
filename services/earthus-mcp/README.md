# EARTHUS MCP — 로컬 전용 (2026-09-20)

읽기 전용 도구 3개. **아직 공개하지 않는다** — 계약 §I: "P3 뒤 · PD 승인 조건부 · 9/30 이후".

| 도구 | 하는 일 |
|---|---|
| `earthus_capabilities` | 현상별 시뮬레이션 능력(available / limited / not_available + 이유 · 지역 한 줄) |
| `earthus_typhoon_intel` | 진행 중 태풍 목록, 또는 한 사건의 인텔 패킷 v1(서술자 모양 — 신뢰 등급만, 빠진 절은 이름만) |
| `earthus_explain_evidence` | 배지 10종의 뜻과 '하지 말 것' |

없는 것(일부러): 시뮬레이션 실행·요청 도구(계산은 EARTHUS 안에서 사람 승인 뒤) · 특보 도구(D-H 결정 전) · 쓰기.

## PD 기기에서 붙여 보기 (Claude Desktop)

`claude_desktop_config.json` 의 `mcpServers` 에:

```json
"earthus": { "command": "node", "args": ["D:\\## APP\\EARTHUS v2_APP\\services\\earthus-mcp\\server.mjs"] }
```

## 공개 전에 PD 가 정할 것

- D-A MCP 를 'Ask Earthus 의 앱 밖 채널(같은 요금표)'로 정의할지 · D-B 실행 자리(토큰 검증 Lambda vs Edge Function) ·
  D-C 공개 접두사 · D-E FREE 한도 · **D-H 외부 AI 의 특보 오독 위험을 받아들일지**
- 법률: 기상법 예보 발표 제한(외부 AI 가 'EARTHUS 예보'로 재서술) · 공공누리 재배포 범위 · 이용 기록의 위치정보 처리

## 시험

`node --test tools/earthus-v53/mcp-server.test.mjs` — 도구 목록·읽기 전용·서술자 모양·경로 조작 방지·실제 stdio 대화.
