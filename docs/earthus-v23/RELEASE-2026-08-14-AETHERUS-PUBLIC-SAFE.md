# AETHERUS Public Safe 배포 증거

> 배포 시각: 2026-08-14 23:05 KST
>
> 공개 상태 화면: <https://earthus.net/aetherus-lab.html>
>
> 실기기 검증: <https://earthus.net/aetherus-device-qa.html>
>
> CloudFront invalidation: `I4NHZDZJGPT03QI4BM84AO4NW8`

## 결과

AETHERUS 구현 원장 296개를 배포 누락과 외부 관문으로 분리했다.

- `VERIFIED_EXISTING / DEPLOYED_GATED`: 200개
- `BLOCKED_EXTERNAL / BLOCKED_EXTERNAL`: 96개
- `IMPLEMENT`: 0개
- 분류되지 않은 `NOT_RELEASED`: 0개

`DEPLOYED_GATED`는 검증된 정적 계약이 운영 origin에 있다는 뜻이다. 공급자 권리,
실데이터, 실계정 RLS, 운영 AI, 결제, 알림, 원격 관측소와 App Store 승인이 열렸다는 뜻은
아니다. 이 외부 관문은 공개 상태 화면에서도 `BLOCKED_EXTERNAL`로 표시한다.

## 선택 배포 범위

`tools/manifests/aetherus-public-safe-files.tsv`의 57개 파일만 S3 `app/`에 배포했다.

- AETHERUS 공개 상태 HTML/CSS/JS
- AETHERUS Device QA HTML/CSS/JS
- 브라우저 로컬 astrometry feature extractor
- AETHERUS fail-closed 계약 모듈과 정책 JSON
- 서명 astrometry 개발 fixture
- Culture 합성 fixture와 296-sheet 공개 원장

메인 `index.html`, `app.css`, `main.js`, `layerbar.js`, `cosmic3d.js`, 우주사진 catalogue·이미지,
Supabase migration은 이 manifest에 넣지 않았다. 같은 작업 폴더의 다른 진행 중 변경을
부분 배포하지 않기 위한 범위다.

## Astrometry 경계

브라우저가 해독할 수 있는 `image/*`는 기기 안에서 최대 1,048,576 픽셀로 축소한 뒤,
로컬 최대값·centroid 기반 특징을 최대 256개 추출한다.

- 실제 JPEG 브라우저 검증: 특징 256개
- 원본 업로드: 0
- 네트워크 요청: 0
- 원본 파일명 저장: false
- 운영 전천 catalogue: `BLOCKED_EXTERNAL`
- 전천 plate solve: catalogue 권리·서명 artifact 전까지 차단

따라서 임의 사진의 로컬 별 추출은 공개했지만, 제한된 M82 fixture를 전천 운영 솔버로
표시하지 않는다.

## 검증

### 로컬 회귀

- `tools/test_aetherus_*.mjs`: 38개 전부 PASS
- 공개 상태 화면: iPhone 세로·가로, desktop 모두 14/14
- horizontal overflow: 0
- visible control: 최소 44px
- Device QA: 세로 1열, 가로 2열, 카메라 가로 426×240
- 임의 JPEG 별 추출: PASS, 업로드 0, 전천 솔브 BLOCKED
- `git diff --check`: PASS

### 운영 원본 대조

2026-08-14T14:06:45Z에 cache-busting 요청으로 57개를 대조했다.

- HTTP: 57/57 `200`
- 운영 SHA-256 = 로컬 SHA-256: 57/57
- Content-Type: 57/57 일치
- Cache-Control `no-cache`: 57/57 일치

핵심 SHA-256:

| 경로 | SHA-256 |
|---|---|
| `aetherus-lab.html` | `065b63a9c5783e832a8d1a3b3f79ee593699cc40bc16a76dd0f0e32b66792471` |
| `css/aetherus-lab.css` | `11feca80882edbb3b8b879a35b644453bdfb035d9e2fc7399fb20414a3c0b4b8` |
| `js/aetherus-lab.js` | `f27e4d04f70059e93049bce3830d233009a70ae7a920fa7f8781f148d44c7eec` |
| `aetherus-device-qa.html` | `09c01b72ca0e621f751d54129da3620f0c5566206efc18715d8abe14e0798e91` |
| `js/aetherus-device-qa.js` | `bfeca5440c9c34efa4bf716b1dd96b174ecbfae4acb85fd3fec496d58d2109a9` |
| `js/space/astrometry-feature-extractor.js` | `2d926e441619b0da0a52c90accdf4f1e989bd67d9a5e80c5939f04498dee64dc` |
| `data/aetherus/v3-sheet-ledger.json` | `a8c1a0f8a6c7e22b114a314479527778ad501ef46901cc3c46762ff4b49c3b03` |

운영 Chrome 재검사도 공개 상태 화면 3개 viewport 14/14, 임의 사진 로컬 별 추출,
Device QA 세로·가로 배치를 모두 통과했다.

## 롤백

`tools/deploy_aetherus_public_safe.sh`가 읽는 manifest의 직전 커밋 파일만 같은 S3 경로에
다시 올리고 동일 57개 경로를 무효화한다. 이 manifest는 EARTHUS·Ocean·판매·알림·SNS·DB
변경을 포함하지 않는다.
