# Data View 흰색 해안선·다음 리셋 인계 패키지 — 운영 배포 증거

> 배포일: 2026-08-13 KST
> CloudFront: `E193CZEBLWEB56`
> 무효화: `I34HVAHNVVCTGNFMCP1M9N571J`

## 1. 해결한 문제

기존 Esri World Boundaries and Places 참조 타일은 국경·지명·해안선이 한 raster에 묶여
있었다. 국경은 읽혀도 색면 위에서 일본 열도와 복잡한 해안은 약했고, 해안선만 색·굵기를
조절할 수 없었다.

Data/Evidence/Decision View에 별도 Natural Earth coastline 벡터를 추가했다.

- 전지구: 1:110m 일반화 해안선
- 동아시아 110–155°E·15–55°N: 1:10m 상세 해안선
- 표현: 4.4px 어두운 halo 위 1.8px 흰색 선
- 합계: 449 lines, 28,794 points, JSON 540,832 bytes
- 높이: ellipsoid 3,500m; `clampToGround` 없음
- 첫 Earth/Style: 요청·표시 0
- Data View를 나가면 Primitive 제거
- timer·animation·상시 render 없음

## 2. 자료와 권리

Natural Earth vector repository의 commit
`ca96624a56bd078437bca8184e78163e5039ad19`을 build script에 고정했다. 원본 전지구
1:110m과 동아시아 1:10m을 서로 중복되지 않게 잘라 하나의 정적 reference로 만든다.

- Source: Natural Earth coastline
- License: public domain
- 화면 표기: `흰색 해안선 · Natural Earth (public domain)`
- 용도: 위치 판독 reference
- 금지된 해석: 공식 영토, 공식 특보구역, 안전 geometry, 측량급 해안

재생성은 `node tools/build-coastline-reference.mjs`다. source commit·schema·line count·point
count는 자동검사한다.

## 3. 자동검사

- Readability: 31/31
- Continuous Layers: 40/40
- Earth route: 12/12
- Safety Engine: 23/23
- KMA Live: 25/25
- PR-11 gate: TPW 공개, 판매·Decision·자동 게시 닫힘
- AETHERUS foundation: PASS
- 변경 JavaScript syntax와 `git diff --check`: PASS

Safety test의 `main.js` cache revision이 특정 날짜 `20260812`에 고정돼 있어, 다른 기능의
정상 revision 변경만으로 실패하던 테스트 공백도 함께 바로잡았다. Safety CSS와 versioned
entry 계약은 유지하되 2026-08월 날짜 revision을 허용한다.

## 4. 실제 화면 검수

로컬과 운영에서 모두 확인했다.

- 1280×720 도쿄 확대: 혼슈 중부·도쿄만·이즈반도·오사카만·시코쿠·도서 해안이 색면 위에서 판독됨
- 390×844 일본: 흰색 해안선·국가/도시 지명·기온 범례 동시 표시, 가로 overflow 0
- 운영 전지구 Data View: 아시아·일본·필리핀·인도네시아·호주 해안 연속 표시
- 운영 첫 Earth 1280×720: `is-ambient`, 판독 패널 hidden, reference credit 없음
- 출처 문구와 Natural Earth public-domain 표시 확인

## 5. 배포 파일·무결성

| 운영 경로 | Content-Type | Cache-Control | SHA-256 |
|---|---|---|---|
| `/js/readability.js` | `text/javascript; charset=utf-8` | `no-cache` | `9f8a1027aa963caab00a5d93a0291793a842ae143e9ed6f5f43a598cfc34c645` |
| `/js/coastline-reference.js` | `text/javascript; charset=utf-8` | `no-cache` | `0a858ed1790c58441c558c18ffa38b5de426fc34e44cba494ae0170a08bc600d` |
| `/data/coastline-reference.json` | `application/json; charset=utf-8` | `public, max-age=86400` | `f5b4d59cd1cc6e12cdce1effc49466a040a99bcb0fcdf1e54dd82fb787f588f3` |
| `/js/changelog.js` | `text/javascript; charset=utf-8` | `no-cache` | `31fafa26c65d3c2d4604601526da513993af2f87cc968219aa7bcf8ca0e07823` |

네 파일 모두 cache-busting 운영 GET이 로컬과 byte 단위로 일치했다.

## 6. 문서 정본과 다음 개발

TPW 공개 뒤에도 잠김으로 남아 있던 `CURRENT_STATE`, `IMPLEMENTATION_PLAN`, `INDEX`를 운영과
동기화했다. 다음 사용량 리셋 실행 패키지는 [`../earthus-next-reset/README.md`](../earthus-next-reset/README.md)다.

패키지는 현재 정본, 우선순위, 남은 공백·새 아이디어, 개발 기준, 시작/릴리스 체크리스트를
분리한다. 다음 시작은 N0 정본 재확인 뒤 N1 수집기 운영 관제다.

## 7. 롤백

위 정적 네 파일만 이전 커밋으로 복원해 같은 Content-Type/Cache-Control로 배포하고 해당
경로를 무효화한다. KMA Lambda, TPW, Safety, AETHERUS, 판매 flag는 롤백 범위가 아니다.
