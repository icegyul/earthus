# EARTHUS FINAL DEPLOY MANIFEST (hunk-level)

- 기준 HEAD: 0677707e. 원칙: sweeping commit 금지, 타인 변경 revert 금지.
- 아래 목록의 hunk만 배포 대상으로 묶는다. 파일 단위 통째 배포 금지
  (main.js·ui-shell.js·index.html·deploy 스크립트에 동시편집 혼재).
- 검증 상태는 본 문서 하단 증거와 `docs/verification/` 실측을 따른다.

## A. FINAL EARTHUS FIX (이번 세션 확정)

| # | file | hunk/line | reason | source | verification | safe |
|---|---|---|---|---|---|---|
| A1 | prototype/v2-three/js/main.js | `CountryFocus`: `this.onData = null` + data 도착 통지 | ?c= 부팅 경주 해소(콜백 문) | 작업트리 미커밋 | npm 10/10(신규) + 로컬 #v=2&c=KOR PASS | YES (hunk만) |
| A2 | prototype/v2-three/js/main.js | `pendingLinkCountry` 선언 + `applyLinkCountry()` + `focus.onData` + `o.c` 분기 교체 + 부팅 주석 | 동일 | 작업트리 미커밋 | 동일 + 무효코드 XXX 기존동작 유지 | YES (hunk만) |
| A3 | tools/earthus-v53/master-parallel-fixes.test.mjs | ?c= 경주 2 tests 추가 | 회귀 잠금 | 작업트리 미커밋(untracked) | 10/10 PASS | YES |
| A4 | prototype/v2-three/index.html | 720px 미디어 `min-height: 44px` 1줄+주석 (약 339-340행) | 라이브 42px 해소 | 기존 미커밋(2026-09-10 감사) | 로컬 390/375 KO/EN 44px + 터치탭 on=1 | YES (hunk만) |

## B. EXISTING EARTHUS WORK (유지, 이번 배포 대상 아님)

- AETHERUS_V2/, Earthus v2_5.2/, .worktrees/, EARTHUS_1.0_AUDIT_OUTPUT/,
  research/step* 문서군, 각종 pptx/inspect — 기존 작업물로 유지.
- index.html 내 sculpt-cap 캡션·모바일 압축 hunk, main.js 내 이전 세션 interaction 수정,
  ui-shell/phenomenon-registry/access-mode/deploy-v3-paper/test 2종 수정은
  이전 세션 검증분으로 유지하되, 동시편집과 섞였으므로 이번 manifest 배포 대상에서 제외.
  배포 시 별도 hunk 리뷰 필요.

## C. CONCURRENT / OTHER WORK (손대지 않음)

- 392a86f..0677707e 11커밋: rate_limit/analytics_fetch/scheduled_release,
  provider runbook·health·scoped config·executor·live harness 등. 전부 타인.
- 작업트리 M 중 직접 건드리지 않은 파일 전부:
  social-admin/index.ts, deploy-v3-kids.sh, admin.html, studio.html,
  ocean-solar, tourism-flow, craters.json, sat-aliases.json, water.json,
  pop-sculpture.js, sim-questions.js, validate_catalogs.py 등.

## 증거

- `docs/verification/earthus-v2-browser-matrix.md` B1·B2 addendum (로컬 실측)
- npm 138/138, aws/distribution 173/173, v53 포함, regressions 0
- S3 publish / CloudFront invalidation 미실행 (배포 단계에서 본 manifest 기준으로만)

## DEPLOY RECORD (2026-09-11)

- Pipeline: tools/build-v2-bundle.sh (PASS integrity) -> tools/deploy-v2-three.sh (official).
- Wrote 6 files (rest 991 skipped identical): index.html, js/main.js, js/phenomenon-registry.js, js/pop-sculpture.js, js/sim-questions.js, js/ui-shell.js.
- Byte proof PASS (index.html, main.js, three-r184, country-reference). Root / unchanged.
- Invalidation: IDX1E4NZDKSZD6WU2XFEY5JMO2 (E193CZEBLWEB56, /v2* + /Intelligence*). Convergence PASS.
- Fingerprints: index.html ETag 54b10857 (88863B, no-store), main.js ETag 8878b336 (337394B, max-age=60).
- Live markers: has44=true, pendingLinkCountry+applyLinkCountry present. No code edits after deploy.

