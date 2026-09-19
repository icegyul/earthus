# SNS FACTORY — 기능 매트릭스 (실측 기반, 2026-09-10)

- 범례: FULL=실코드로 확인 / PARTIAL=부분·제한적 / NONE=실측 부재 / UNKNOWN=미확인(추측금지)
- 열: E=EARTHUS / BB=BrightBean / MP=Mixpost / PZ=Postiz / TRY=TryPost / P4U=Post4U / TJS=threads.js / TCL=threads-cli / SMS=sm-scheduler / TPU=threads-publisher
- Ddalkkak: NOT_FOUND로 열 없음. 빈칸 0. 커버리지 100%.

| 기능 | E | BB | MP | PZ | TRY | P4U | TJS | TCL | SMS | TPU |
|---|---|---|---|---|---|---|---|---|---|---|
| Threads | FULL | FULL | NONE | FULL | FULL | NONE | FULL | FULL | NONE | FULL |
| Instagram | FULL | FULL | NONE | FULL | FULL | NONE | NONE | NONE | FULL | NONE |
| Facebook | FULL | FULL | FULL | FULL | FULL | NONE | NONE | NONE | FULL | NONE |
| LinkedIn | FULL | FULL | NONE | FULL | FULL | NONE | NONE | NONE | NONE | NONE |
| TikTok | FULL | FULL | NONE | FULL | FULL | NONE | NONE | NONE | FULL | NONE |
| YouTube | FULL | FULL | NONE | FULL | FULL | NONE | NONE | NONE | FULL | NONE |
| Pinterest | NONE | FULL | NONE | FULL | FULL | NONE | NONE | NONE | NONE | NONE |
| Bluesky | NONE | FULL | NONE | FULL | FULL | FULL | NONE | NONE | NONE | NONE |
| Draft | FULL | FULL | FULL | FULL | FULL | FULL | NONE | PARTIAL | PARTIAL | NONE |
| Composer | PARTIAL | FULL | FULL | FULL | FULL | PARTIAL | NONE | NONE | NONE | NONE |
| Calendar | PARTIAL | FULL | FULL | FULL | FULL | NONE | NONE | NONE | PARTIAL | NONE |
| Queue | FULL | FULL | FULL | FULL | FULL | PARTIAL | NONE | NONE | PARTIAL | NONE |
| Scheduler | PARTIAL | FULL | FULL | FULL | FULL | FULL | NONE | NONE | FULL | NONE |
| Recurring | PARTIAL | FULL | UNKNOWN | FULL | FULL | NONE | NONE | NONE | PARTIAL | NONE |
| Approval | FULL | FULL | NONE | PARTIAL | NONE | NONE | NONE | NONE | NONE | NONE |
| Media Library | PARTIAL | FULL | FULL | FULL | FULL | PARTIAL | NONE | NONE | PARTIAL | PARTIAL |
| Image | FULL | FULL | FULL | FULL | FULL | FULL | PARTIAL | PARTIAL | PARTIAL | PARTIAL |
| Video | PARTIAL | FULL | FULL | FULL | FULL | NONE | PARTIAL | PARTIAL | NONE | NONE |
| Carousel | PARTIAL | FULL | NONE | FULL | FULL | NONE | FULL | FULL | NONE | NONE |
| OAuth | FULL | FULL | FULL | FULL | FULL | PARTIAL | PARTIAL | FULL | FULL | FULL |
| Token Refresh | FULL | FULL | PARTIAL | FULL | FULL | UNKNOWN | PARTIAL | FULL | PARTIAL | UNKNOWN |
| Retry | FULL | FULL | PARTIAL | FULL | FULL | FULL | NONE | NONE | FULL | NONE |
| Rate Limit | UNKNOWN | FULL | FULL | FULL | UNKNOWN | PARTIAL | NONE | UNKNOWN | UNKNOWN | NONE |
| Publish History | FULL | FULL | FULL | FULL | FULL | PARTIAL | NONE | PARTIAL | PARTIAL | NONE |
| Analytics | PARTIAL | FULL | PARTIAL | FULL | FULL | NONE | NONE | PARTIAL | NONE | NONE |
| API | PARTIAL | FULL | NONE | FULL | PARTIAL | FULL | PARTIAL | NONE | PARTIAL | NONE |
| AI | NONE | PARTIAL | NONE | FULL | UNKNOWN | NONE | NONE | NONE | NONE | NONE |
| MCP | NONE | FULL | NONE | FULL | UNKNOWN | NONE | NONE | NONE | NONE | NONE |
| Multi-workspace | NONE | PARTIAL | UNKNOWN | FULL | UNKNOWN | NONE | NONE | NONE | NONE | NONE |
| Team Approval | PARTIAL | FULL | NONE | PARTIAL | NONE | NONE | NONE | NONE | NONE | NONE |
| Windows | FULL | PARTIAL | PARTIAL | PARTIAL | PARTIAL | PARTIAL | FULL | PARTIAL | FULL | FULL |
| Docker | UNKNOWN | FULL | FULL | FULL | FULL | FULL | UNKNOWN | UNKNOWN | UNKNOWN | NONE |

## 근거 메모 (E열)

- E FULL(Threads~YouTube): `sns_adapters/*.py` 7종 + `social-admin` publish 7종 실재.
- E Pinterest/Bluesky NONE: `PLATFORMS` 7종에 없음.
- E Scheduler/Recurring PARTIAL: `SCHEDULES`는 생성주기. 게시실행기 없음(의도).
- E Rate Limit UNKNOWN: 미확인. FULL 표기 금지.
- E API PARTIAL: `cli.py`+Edge POST. 공개 REST 없음.
- E Docker UNKNOWN: Dockerfile 미확인.
