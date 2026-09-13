# PHASE 1 착수 전 점검 (PD DECISION LOCK 2026-09-13 §5)

| # | 점검 | 결과 | 근거 |
|---|---|---|---|
| 1 | 현재 git status 확인 | 브랜치 `earthus-v2/real-living-earth-render`, 착수 전 HEAD `4191a894`(다른 세션 커밋), 작업 트리 미추적 174 · 수정 54 (전부 다른 세션/기존, wonder 3 밖) | 스냅샷 `scratchpad/git-status-prephase1.txt` 228줄 |
| 2 | Phase 0 baseline commit 확인 | **없었음 → 생성.** `b3796259` "V3 WONDER 를 기존 V3 밖에서 새로 시작한다 — wonder 3 PHASE 0 기준선", 329파일 +18,394줄, `git add -- "wonder 3"` 경로 지정(다른 세션 변경 0건 포함) | `git show --stat b3796259` |
| 3 | working tree 상태 기록 | 커밋 뒤 `git status`: 미추적 173 · 수정 54 · wonder 3 항목 0 → 남의 변경 그대로. 커밋에 포함 안 된 내 변경: `.claude/launch.json` 의 `earthus-v3-wonder` 실행 항목 1개(공유 파일, 다른 세션 hunk 와 섞여 있어 부분 커밋 보류 — partial-stage 함정) | |
| 4 | directory/package naming consistency | canonical `earthus-v3-wonder`: `package.json name` · launch.json 항목명 · registry `schema earthus-v3-wonder/asset-registry@0` · registry `source: earthus-v3-wonder` · 패키지 README `@earthus-v3-wonder/…`. 비정규 표기 `wonder3-static`·`earthus-wonder`·`wonder3` 는 전부 교체. 남은 `WONDER3_…` 는 감사 문서 파일명·지시서 원본 파일명(변경 금지 대상) | `grep -rni "wonder3\|earthus-wonder"` |
| 5 | tools/scripts 충돌 | `tools/` 없음(이동 완료), `scripts/` 4파일(build-registry.mjs · convert-characters-webp.py · benchmark-character-webp.py · dev-server.mjs). 참조 갱신: package.json · tests · docs · launch.json. 삭제 없이 이동, 이동 뒤 테스트 20/20 | |
| 6 | WebP baseline 적용 상태 | **적용 완료.** 124종 × 2 = 248 WebP, PNG 201.9 MB → **28.72 MB**, 734 s. 캐릭터 1024² RGBA q85 · 장면 1024×683 RGB q85. 원본 PNG 삭제 0(읽기만), `content/characters/source/source-manifest.json` 248항목(경로·bytes·sha256)으로 출처 분리 기록, 예외 파일 `runtime-overrides.json`(비어 있음). 레지스트리 286자산 · 캐릭터 그림 124/124 준비 | `scripts/convert-characters-webp.py --force` 로그 |

추가: `wonder 3/.gitattributes`(`* text=auto eol=lf`, 그림 binary) — autocrlf 체크아웃이 JSON 줄끝을 바꿔 레지스트리 sha256 을 깨는 것을 막는다(기준선 커밋 뒤 추가, PHASE 1 커밋에 포함).

**판정: 6/6 PASS → PHASE 1 착수.** AWS 변경 0. 기존 V1/V2/V3/CI/sw.js 무변경.
