# SNS ANALYTICS STATUS (2026-09-10)

> 실제 응답 없이는 VERIFIED 로 적지 않는다.

| provider | endpoint | 상태 | metric 어휘 | 비고 |
|---|---|---|---|---|
| threads | /{id}/insights (5종) | BRIDGE | views/likes/replies→comments/reposts+quotes→shares | 첫 live 후 확정 |
| instagram | /{id}/insights (UNVERIFIED) | BRIDGE | 있는 키만 (7종 정식内) | shape 첫 live 후 확정 |
| facebook | /{id}/insights (UNVERIFIED) | BRIDGE | 있는 키만 (7종 정식内) | shape 첫 live 후 확정 |
| linkedin | 없음 | MISSING | — | 읽기 경로 없음 (honest) |
| tiktok | 없음 | MISSING | — | scope 밖 (honest) |
| youtube | 없음 | MISSING | — | readonly scope gap (honest) |
| x | 없음 | MISSING | — | tier-dependent (honest) |

## 규칙 (코드 강제)

- `provenance`: live(실제+증거) / stub / unavailable / error / unverified.
- 없는 지표 0 채움 금지. bool·문자 제외.
- 어댑터 어휘 밖 키는 아카이브에 안 담는다 (어휘 확장은 live 후).
- 읽기는 발행 상태를 바꾸지 않는다.
- `views` 는 브릿지 응답에만 유지 (threads/IG).

## EVIDENCE PHASE (2026-09-10)

- 실제 응답 0건 → VERIFIED 0건. BRIDGE/MISSING 유지.
- 필터 2층 확정 (parse 보관 → fetch 여과), 시험 12번이 고정한다.
