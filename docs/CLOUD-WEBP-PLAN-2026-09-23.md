# 관측 구름 WebP 변형 — 준비 결과와 전환 계획 (2026-09-23)

> 근거 문서: [`PERF-LTE-PLAN-2026-09-23.md`](PERF-LTE-PLAN-2026-09-23.md) V1-6 · V1-6b · V2-3.
> PD 지시: "진행해" = **작은 구름 그림을 준비**까지. 운영 전환은 PD 가 비교판을 본 뒤에 정한다.

## 0. 화면에서 무엇이 바뀌나

- v1·v2 첫 화면에서 가장 큰 파일인 관측 구름 `clouds/global.png`(5.48 MB)를 줄인다.
  - PC: 3.04 MB(55.5 %). 폰 후보: 1.50 MB(27.5 %).
- **구름이 어디 있나(알파)는 한 값도 바뀌지 않는다.** 3072 판은 PNG 와 완전히 같다. 2048 판은 줄인 알파와 완전히 같다.
- 바뀌는 것은 구름 밝기(L)뿐이다. v1 화면에서 원본과의 차이는 평균 0.8/255다. v2 관측 모드는 L 을 흰색으로 눌러 쓰므로 사실상 차이가 없다.
- 폰 2048 판은 확대하면 구름 가장자리가 흐려진다. 채택 여부는 **PD 가 비교판을 보고 정한다**(§6).

지금 상태:
- Lambda 코드는 준비됐고 시험을 통과했다. **배포하지 않았다.**
- 앱(v1·v2)은 **바꾸지 않았다.** 운영은 지금도 PNG 만 쓴다.

비교판: [`build/ux-mockups/cloud-webp-compare-2026-09-23.png`](../build/ux-mockups/cloud-webp-compare-2026-09-23.png)
- 원본 PNG · WebP 3072 · WebP 2048 을 v1 화면처럼 합성해 나란히 놓았다.
- 지역은 넷이다: 한반도·일본, 서태평양 열대저압부 주변, 동태평양 POLO-26, 남극해 극 가장자리.
- 지역마다 두 줄이다: 개관, 그리고 흰 사각형 부분의 확대.

---

## 1. 실측 (운영 파일 1장, 2026-09-23 13:00Z)

입력: `https://earthus.net/clouds/global.png`
- 5,477,495 B, sha256 `fb884152…`, 3072×1844 LA
- 알파 0 인 화소 46.79 %, 알파 255 인 화소 1.80 %

재는 법: `aws/gmgsi-clouds/tests/check_real_png.py`
- `handler.encode_variants` 를 **그대로** 부른다.
- 환경: Windows · Python 3.12.10 · Pillow 12.3.0 · libwebp 1.6.0

| | 바이트 | PNG 대비 | 알파 | 인코딩 |
|---|---:|---:|---|---:|
| `global.png` (지금) | 5,477,495 | 100 % | — | — |
| `global.webp` 3072×1844 | **3,037,640** | 55.5 % | 입력과 완전히 같음 · 0→비0 **0** · 255→비255 **0** | 4.0~5.0 s |
| `global-2048.webp` 2048×1229 | **1,504,350** | 27.5 % | 줄인 입력과 완전히 같음 · 주변이 전부 0 이던 478,752 화소 중 비0 **0** · 주변이 전부 255 이던 6,342 화소 중 변화 **0** | 1.6~2.1 s |

밝기(L) 오차. 단위는 0~255 이고, 알파>0 인 화소만 센다.

| | L 평균 | L 99분위 | L 최대 | v1 화면 차이 평균 | 99분위 | 최대 |
|---|---:|---:|---:|---:|---:|---:|
| WebP 3072 | 3.38 | 14 | 46 | 0.81 | 5.4 | 23.1 |
| WebP 2048 (줄인 입력 대비) | 3.02 | 11 | 24 | 0.73 | 4.9 | 12.3 |

- "v1 화면 차이"의 계산식은 `|LUT(L₁) − LUT(L₀)| × LUT(A)/255` 다.
  - v1 은 L 을 90~255 로 누르고(`CLOUD_LUMA_LUT`), 알파를 0.78 감마로 올려(`CLOUD_ALPHA_LUT`) 얹는다.
- 풀었을 때 R·G·B 가 갈라지는 폭은 최대 1 이다. 회색 그림에 색이 끼지 않는다.
- v2 관측 모드(`main.js` `tint = rgb / max(max(rgb), 0.2)`)는 L≥51 이면 흰색이 된다.
  - 3072 WebP 에서 tint 가 달라지는 화소는 알파>0 인 3,014,208 화소 중 2,967 개다. 모두 알파가 아주 낮은 화소다.
  - 알파를 곱한 화면 차이는 최대 1/255 다. **v2 는 사실상 같은 그림이다.**
- 폰 판의 해상도 손실은 참고용이고 통과 조건이 아니다. 계산 방법은 다음과 같다.
  - 2048 알파를 3072 로 다시 쌍선형으로 늘려 PNG 알파와 비교했다.
  - 결과는 평균 3.4, 99분위 36, 최대 153 이다. 구름 가장자리가 무뎌지는 양이다. 비교판 셋째 열에서 눈으로 보인다.

인코딩 메모리:
- 인코딩과 되풀어 확인하기를 합쳐 7.8 s 걸렸다.
- tracemalloc 최고는 55 MB 다. 파이썬·numpy 쪽만 잰 값이다.
- 프로세스 최고 작업 집합은 128.0 → 352.8 MB 로 **+225 MB** 늘었다. libwebp 의 C 버퍼까지 들어간 값이다.
- Lambda 에서의 진짜 값은 배포 뒤 CloudWatch `REPORT … Max Memory Used` 로 확인한다(§5).
- handler 는 인코딩 전에 원본 크기 배열(3000×4999 float, 각 60~120 MB)을 놓아 준다.

### 설정을 이렇게 고른 이유

**method = 3**
- 알파 무손실 압축에서 libwebp 는 알파 내부 품질을 `8 × method` 로 잡는다.
- 이 값이 25 이상(method ≥ 4)이면 'TraceBackwards' 가 켜진다.

| method | 3072 바이트 | 인코딩 |
|---|---:|---:|
| 0 | 3,502,850 | 1.2 s |
| 1 | 3,152,454 | 3.1 s |
| 2 | 3,086,874 | 3.0~3.4 s |
| **3** | **3,037,640** | **3.4~4.1 s** |
| 4 (Pillow 기본값) | 3,044,886 | 17.5~23.6 s |
| 6 | 2,981,602 | 173 s |

**크기의 대부분은 알파다**
- 밝기만 손실로 넣으면 0.81 MB 다(method 4, 알파 없음).
- 무손실 알파가 약 2.2 MB 를 차지한다. 그래서 밝기 품질을 올려도 크기는 조금만 는다.

| 밝기 품질 (method 3) | 바이트 | L 평균 / 99분위 / 최대 | v1 화면 차이 평균 / 99분위 / 최대 |
|---|---:|---|---|
| **q80 (적용)** | 3,037,640 | 3.38 / 14 / 46 | 0.81 / 5.4 / 23.1 |
| q85 | 3,200,004 (+162 KB) | 2.34 / 8 / 18 | 0.58 / 3.9 / 9.9 |
| q90 | 3,436,950 | 1.66 / 6 / 14 | 0.41 / 2.9 / 7.7 |
| q95 | 3,775,736 | 1.04 / 4 / 8 | 0.26 / 2.0 / 4.0 |

**exact=False**
- libwebp 가 알파 0 화소 밑의 RGB 를 정리한다.
- v1(`getImageData`)과 v2(canvas → CanvasTexture)는 모두 premultiplied 캔버스를 거친다. 그래서 알파 0 밑의 L 은 지금도 0 으로 버려진다.
- v1 그림자(`cloud-shadow.js`)는 알파만 읽는다.

**알파 손실 압축은 쓰지 않는다**
- 2048 판을 q70·alpha_quality 70 으로 만들면 740,798 B 다.
- 이번 파일에서는 0 과 255 가 유지됐지만, 중간값이 바뀐다.
- 또 "0은 계속 0" 을 모든 시각에 대해 보장할 수 없다. AVIF 가 탈락한 이유가 바로 이것이다.
- 선택지로만 적어 둔다.

**느린 회선에서 줄어드는 시간 (계산값, 실측 아님)**

| 기준 | 3072 | 2048 |
|---|---:|---:|
| 5.4 s/MB (느린 4G) | 약 −13 s | 약 −21 s |
| 200 kB/s (나쁜 LTE) | 27.4 → 15.2 s | 27.4 → 7.5 s |

---

## 2. Lambda 변경 (`aws/gmgsi-clouds/handler.py`, 덧붙이기만 함)

**PNG 는 한 바이트도 바뀌지 않는다.**
- `la` 배열, `save(png, optimize=True)`, `put_object(... "clouds/global.png" ...)` 는 그대로다.
- 시험 `HandlerSourceTest` 가 이것을 고정한다.

**추가한 것**
- `encode_variants(la)`: 최종 LA(uint8)로 WebP 두 장을 만든다.
  - 되풀어서 **알파가 입력과 한 값이라도 다르면 그 변형은 빼고 돌려준다.**
  - 2048 판은 입력이 2048 보다 넓을 때만 만든다. 늘려서 만든 화소는 가짜 화소이기 때문이다.
- `upload_variants(client, bucket, variants)`
  - `ContentType="image/webp"`, `CacheControl="public, max-age=1800"`(PNG 와 같음)로 올린다.
  - 하나라도 실패하면 예외를 낸다.
- `_shrink_la` 는 채널마다 따로 LANCZOS 로 줄인다.
  - Pillow 의 LA.resize 는 알파를 곱했다 되나누는 방식이라 L 이 뭉개진다.
- 2048 판을 원본 float 가 아니라 **최종 LA 로** 만드는 이유가 있다.
  - 운영 `global.png` 한 장으로 로컬 시험이 Lambda 와 같은 바이트를 재현할 수 있다.

**순서**
- ① PNG 저장 → ② 원본 크기 배열 놓기 → ③ WebP 인코딩(try) → ④ PNG 업로드(그대로) → ⑤ WebP 업로드(try) → ⑥ meta.json
- 인코딩을 PNG 업로드 **앞에** 둔다. 'PNG 는 새것 · meta 는 옛것' 틈이 길어지지 않게 하려는 것이다.
- ③·⑤ 에서 **파이썬 예외**가 나면 PNG 와 meta.json 은 예전처럼 나가고, meta 에는 `variants` 가 없다.
- ⚠️ 예외가 아닌 실패는 다르다. ③ 에서 **메모리 초과(OOM)나 300 s 제한시간**에 걸리면 그 시각은 PNG 도 meta 도 나가지 않는다. 앱은 앞 시각 구름을 계속 보여 준다.
  - 이 순서를 고른 이유: CloudFront 가 `?t=` 를 무시하므로, 새 PNG 가 옛 meta 라벨과 섞여 나가는 쪽이 더 나쁘다. 그 시각을 통째로 잃는 쪽이 낫다고 판단했다.
  - 그래서 §5-3 의 기준선 확인을 **배포 조건**으로 둔다.

**meta.json** — 덧붙이기만 한다. v1 이 읽는 `time·format·north·south·credit`, v2 가 읽는 `time·north·south` 는 그대로다.
```json
{ "time": "…", "source": "…", "shading": true, "width": 3072, "height": 1844,
  "north": 72.715…, "south": -72.736…, "credit": "NOAA NESDIS GMGSI", "format": "la8",
  "png": { "key": "clouds/global.png", "bytes": 5477495, "sha256": "…" },
  "variants": {
    "webp":     { "key": "clouds/global.webp",      "type": "image/webp", "width": 3072, "height": 1844,
                  "bytes": 3037640, "sha256": "…", "quality": 80, "alpha": "lossless" },
    "webp2048": { "key": "clouds/global-2048.webp", "type": "image/webp", "width": 2048, "height": 1229,
                  "bytes": 1504350, "sha256": "…", "quality": 80, "alpha": "lossless" } } }
```
- **규칙: `variants` 에 적힌 변형 = 이번 시각에 실제로 올라간 변형.**
- 앱은 `variants` 에 있는 것만 쓰고, 없으면 PNG 를 쓴다.
- 그래서 Lambda 를 되돌리면 앱도 저절로 PNG 로 돌아간다.

**시험** (패키지에 들어가지 않는다 — `lambda_package.SKIP_DIRS` 에 `tests`)
- `aws/gmgsi-clouds/tests/test_webp_variants.py` — 네트워크 없이 11건
  - 알파 정확성, 알파가 달라진 변형 제외, 업로드 형식, PNG 경로 불변, 순서
- `aws/gmgsi-clouds/tests/check_real_png.py` — 운영 PNG 로 위 §1 을 잰다.
  - `--live` 는 배포 뒤 확인용이다(§5).
- `aws/gmgsi-clouds/tests/make_compare_board.py` — 비교판을 만든다.

---

## 3. 앱 전환 계획 (**적용하지 않음**)

줄 번호는 2026-09-23 HEAD(`1dcce523`) 기준이다. 다른 세션이 같은 파일을 고치고 있으므로 **글자 앵커로 찾는다.**

### 3-0. 공통 — 알파 있는 손실 WebP 를 풀 수 있나
- Google 공식 판별 그림을 쓴다. 1×1 VP8X+ALPH+VP8 이고, Pillow 로 풀어 1×1 RGBA 로 나오는 것을 확인했다.
- 캔버스 `toDataURL('image/webp')` 로 판별하면 안 된다. 사파리는 WebP 를 **풀 수는 있어도 만들지는 못해서**, iPhone 전부가 PNG 로 빠진다.

```js
let _webpAlphaOk = null;
function canDecodeWebpAlpha() {
  if (!_webpAlphaOk) _webpAlphaOk = new Promise((ok) => {
    const img = new Image();
    img.onload = () => ok(img.width === 1 && img.height === 1);
    img.onerror = () => ok(false);
    img.src = 'data:image/webp;base64,UklGRkoAAABXRUJQVlA4WAoAAAAQAAAAAAAAAAAAQUxQSAwAAAARBxAR/Q9ERP8DAABWUDggGAAAABQBAJ0BKgEAAQAAAP4AAA3AAP7mtQAAAA==';
  });
  return _webpAlphaOk;
}
// 파일 고르기 — variants 에 없으면 PNG. 폰 판은 PD 승인 전까지 꺼 둔다.
function pickCloudFile(meta, { phone, allowPhone2048 }) {
  const v = meta && meta.variants || {};
  const rec = (phone && allowPhone2048 && v.webp2048) || v.webp || null;
  return rec ? rec.key.split('/').pop() : 'global.png';
}
```

### 3-1. v1 — `prototype/js/layers/imagery.js`

| 줄 (앵커) | 지금 | 바꿀 것 |
|---|---|---|
| 모듈 위쪽 (`CLOUD_ALPHA_LUT` 옆) | — | 3-0 의 두 함수 |
| 273-274 `/* ⚠️ 1.2MB 다.` | 틀린 크기 | **지우지 말고** 아래에 `(2026-09-23 정정) PNG 는 5.4~5.5MB 다(S3 head 5,381,747 B). WebP 변형은 3.04MB(PC)·1.50MB(폰, PD 승인 뒤) — docs/CLOUD-WEBP-PLAN-2026-09-23.md` 줄을 더한다 |
| 275-276 `` `${API.CLOUDS}/global.png?t=${…}` `` | PNG 고정 | `const file = (await canDecodeWebpAlpha()) ? pickCloudFile(m, { phone: IS_PHONE, allowPhone2048: false }) : 'global.png';` 로 고르고 `` `${API.CLOUDS}/${file}?t=${encodeURIComponent(m.time)}` `` 로 받는다(`?t=` 는 그대로) |
| 277-289 받기·풀기 블록 | 실패하면 `Error('png')` → 함수 전체 `false` → RealEarth 폴백 | 받기·풀기를 `loadCloud(file)` 로 묶는다. `file !== 'global.png'` 에서 받기·풀기가 실패하면 **한 번만** `loadCloud('global.png')` 로 다시 한다. 그다음 실패만 지금처럼 RealEarth 로 간다 |
| 285 `img.onerror = () => no(new Error('png'))` | 메시지 'png' | `new Error(file)` — 어느 파일이 실패했는지 로그에 남긴다 |
| 662 `new Blob(chunks, { type: 'image/png' })` | 형식 고정 | `new Blob(chunks, { type: r.headers.get('content-type') \|\| 'image/png' })`. 천리안 채널(`:1181`)도 이 함수를 쓴다. 헤더를 따르므로 PNG 는 그대로 PNG 다 |
| 300 "0은 계속 0, 1은 계속 1" · LUT | — | **건드리지 않는다.** 알파가 같으므로 결과도 같다 |

- `IS_PHONE` 은 v2 와 같은 기기 부류로 맞춘다. 식은 `/Android|iPhone|iPad|iPod/i.test(navigator.userAgent||'') || matchMedia('(pointer: coarse)').matches` 다(v2 `main.js:2391-2395` `terrainLite`).
- 캔버스 크기·그림자(`cloud-shadow.js` 의 `sourceWidth/Height`)·`SingleTileImageryProvider` 의 `tileWidth/Height` 는 모두 **그림 크기**에서 나온다. 2048 판도 그대로 맞는다. `m.width` 를 쓰는 곳은 없다(grep).
- 서비스워커(`sw.js`)는 `/clouds/` 를 가로채지 않는다(grep).

### 3-2. v2 — `prototype/v2-three/js/main.js` (`v2-deploy/` 는 생성물 — 고치지 않는다)

| 줄 (앵커) | 지금 | 바꿀 것 |
|---|---|---|
| 1540-1548 `static loadImg(url)` | 실패하면 reject | 그대로 둔다 |
| 1550-1554 `async loadGmgsi()` … `` `${base}/global.png?t=…` `` | PNG 고정 | `const file = (await canDecodeWebpAlpha()) ? pickCloudFile(meta, { phone: this.phone, allowPhone2048: false }) : 'global.png';` 다음에 `let img; try { img = await CloudManager.loadImg(`${base}/${file}?t=…`); } catch (e) { if (file === 'global.png') throw e; img = await CloudManager.loadImg(`${base}/global.png?t=…`); }` |
| 1555-1566 캔버스·텍스처 | `W = img.width` | 그대로 둔다. 2048 판이면 `W=2048, H=1024` 로 저절로 맞는다 |
| CloudManager 생성 (`terrainLite` 가 정해진 뒤) | — | `clouds.phone = terrainLite` 를 넘긴다. 같은 기기 부류다 |

- v2 는 지금 S3 오하이오에서 직접 받는다. 버킷 CORS 는 버킷 단위라 새 키에도 적용된다. 그래도 §5 에서 `curl -H Origin` 으로 확인한다.
- v2 관측 모드는 L 을 흰색으로 누른다. 그래서 WebP 3072 는 화면상 PNG 와 같다(§1). 폰 판의 차이는 알파 해상도뿐이다.
- 반영 순서: `tools/build-v2-bundle.sh` → `tools/deploy-v2-three.sh`.

### 3-3. 앱 시험 (전환할 때 같이 넣는다)
- 문자열 시험을 넣는다. 두 파일 모두 다음 네 가지가 있어야 한다.
  - `variants` 가 없으면 `global.png`
  - 폰 2048 은 `allowPhone2048` 로만 켜진다
  - PNG 로 다시 받는 길이 있다
  - v1 Blob 형식을 헤더에서 읽는다
- 브라우저 확인은 둘이다.
  - 네트워크 탭에서 `global.webp` 한 건이 받히는지 본다.
  - 판별 그림을 실패시키면(`img.src` 를 깨뜨림) `global.png` 로 가는지 본다.

---

## 4. PD 결정 대기

1. **폰 2048 판을 쓸 것인가** — 비교판 셋째 열을 본다. 쓸 경우 `allowPhone2048: true` 로 바꾼다.
   - 전체 지구 화면에서의 차이는 작다.
     - (추정) 폰 폭 390 CSS px·DPR 3 에서 지구 지름이 화면 폭 절반쯤이면, 지구 가운데 1° 가 약 5 기기 px 다.
     - 2048 은 1° 에 5.7 texel 이라 이 밀도에 겨우 맞는다.
   - 확대하면 구름 가장자리가 무뎌진다. 비교판 확대 줄에서 99분위 화면 차이가 17~25 다.
   - `handler.py:44-51` "2048은 Retina 에서 결이 깨졌다" 는 PC 이야기다. 폰에서도 확대하면 같은 일이 생긴다.
2. **밝기 품질 q80 그대로 둘지, q85 로 올릴지**
   - q85 는 +162 KB 에 최대 오차가 46 → 18 로 준다.
   - 바꾸려면 `WEBP_QUALITY` 한 줄을 고친다.
3. 폰 판을 안 쓰기로 하면 `PHONE_W` 변형을 계속 만들지 정한다. 비용은 Lambda 약 2 s, S3 1.5 MB 다. 앱이 안 쓰면 해는 없다.

---

## 5. 배포 절차 (메인 세션이 PD 승인 뒤 실행 — **확인용으로 배포 스크립트를 돌리지 않는다**)

**배포 전**
1. `PYTHONUTF8=1 python -m unittest discover -s aws/gmgsi-clouds/tests -p "test_*.py"` → 11건 OK
2. `PYTHONUTF8=1 python aws/gmgsi-clouds/tests/check_real_png.py` → `"pass": true`. 그 시각 운영 PNG 로 다시 잰다.
3. 지금 실행 시간·메모리를 기준선으로 남긴다(읽기).
   `PYTHONUTF8=1 aws logs filter-log-events --region ap-northeast-2 --log-group-name /aws/lambda/gmgsi-clouds --filter-pattern REPORT --start-time $(( ($(date +%s) - 86400) * 1000 )) --query 'events[-5:].message' --output text`
   - 제한시간 300 s·메모리 2048 MB(`deploy-python.sh` 가 매번 설정)와 비교한다.
   - 이번 변경으로 **약 +6~12 s(추정), +225 MB 안팎**이 더해진다.
     - 인코딩은 로컬에서 5.6~7.8 s 였다. 이 PC(28코어)는 대표성이 없다 — libwebp 는 단일 스레드이고 Lambda 2048 MB 는 약 1.2 vCPU 다.
     - 인코딩 전에 원본 배열을 놓아 준다.
   - **배포 조건**: 기준선 Duration 이 이미 약 200 s 를 넘거나 Max Memory Used 가 약 1,500 MB 를 넘으면 그대로 배포하지 않는다.
     - `WEBP_METHOD = 2` 로 낮춘다. 실측 3.0~3.4 s, +49 KB 다.
     - 또는 보류한다. OOM·시간 초과는 그 시각 PNG 까지 막는다(§2).
   - Pillow 버전도 확인한다. 이 함수에는 `requirements.txt` 가 없어서, 배포하는 날의 최신 Pillow 가 들어간다.
     - `pip index versions Pillow` 의 첫 값이 12.3.0 이 아니면(특히 13 이상이면) 1·2번을 그 버전으로 다시 돌린 뒤 배포한다.
     - `pip install "Pillow==<그 버전>"` 을 가상환경에서 하고, `-W error::DeprecationWarning` 을 붙인다. 오늘 12.3.0 에서는 경고 0건이었다.
     - 또는 `aws/gmgsi-clouds/requirements.txt` 로 고정한다(`h5py`·`numpy`·`Pillow==12.3.0`).

**배포**
4. Git Bash 에서 `bash aws/deploy-python.sh gmgsi-clouds` 를 실행한다.
   - 리전은 서울로 고정돼 있다. 메모리 2048, 제한시간 300 이다.
   - Pillow 는 최신 manylinux 휠이다. libwebp 가 휠 안에 들어 있다. 오늘 기준 Pillow 12.3.0 이다.
   - 끝의 배포 가드(us-east-2 복사본 없음) PASS 를 확인한다.

**배포 뒤** (다음 정시 실행 뒤, 모두 읽기)
5. CloudWatch 를 본다.
   `PYTHONUTF8=1 aws logs tail /aws/lambda/gmgsi-clouds --region ap-northeast-2 --since 2h --format short | grep -E "\[webp\]|\[warn\]|REPORT"`
   - `[webp] clouds/global.webp 3072x1844 3.0xMB …ms 알파일치=True` 가 두 줄 나와야 한다.
   - `[warn]` 이 없어야 한다.
   - `REPORT` 줄의 Duration·Max Memory Used 를 3번의 기준선과 비교한다.
6. `PYTHONUTF8=1 python aws/gmgsi-clouds/tests/check_real_png.py --live` → 종료 코드 0 이어야 한다.
   - 확인하는 것: sha·바이트가 meta 와 같은지, `Content-Type: image/webp` 인지, Cache-Control 이 PNG 와 같은지, 알파가 PNG 와 같은지.
   - 종료 코드 2 = variants 없음(배포 전이거나 이번 시각 변형이 실패함), 3 = 엣지 캐시 시차(몇 분 뒤 다시).
   - 운영 Pillow/libwebp 가 로컬과 다르면 **sha 는 로컬 인코딩과 다를 수 있다.** 그래서 `--live` 는 로컬 인코딩이 아니라 meta 의 sha 와 알파 동일성으로 판정한다.
7. `PYTHONUTF8=1 aws s3api head-object --bucket earthus-cache-kr --key clouds/global-2048.webp --query '{t:ContentType,c:CacheControl,n:ContentLength}'`
8. v2 경로(S3 직접)의 CORS:
   `curl -sI -H "Origin: https://earthus.net" https://earthus-cache-kr.s3.us-east-2.amazonaws.com/clouds/global.webp | grep -iE "access-control|content-type"`
9. 앱 전환(§3)은 **따로 커밋한다.** v1 은 `tools/deploy-v1.sh`, v2 는 번들 → `deploy-v2-three.sh` 다. 커밋 제목은 "무엇이 잘못돼 있었나"를 적는다.
   - 예: "구름 5.4MB PNG 를 WebP 가 있어도 받고 있었다".

**되돌리기**
- 핸들러 커밋을 되돌리고 다시 배포한다. 다음 실행부터 meta 에 `variants` 가 없어지고, 전환된 앱도 저절로 PNG 를 쓴다.
- S3 에 남는 `global*.webp` 는 해가 없다. 지우는 일은 PD 가 한다(분류기가 `s3 rm` 을 막는다).

---

## 6. 남은 위험·모르는 것

- **Lambda 실제 실행 시간·메모리는 재지 않았다.** 로컬 +225 MB·+5.6~7.8 s 가 근거의 전부다. §5-3·5 로 확인한다.
- `try/except` 는 파이썬 예외만 막는다. 인코딩 중 OOM·시간 초과가 나면 그 시각의 PNG·meta 도 나가지 않는다(§2). §5-3 의 배포 조건이 이것을 막는 장치다.
- CloudFront `/clouds/*` 의 캐시 키는 `?t=` 를 무시한다. 새 시각 라벨에 옛 그림이 최대 약 25분 나갈 수 있다(PERF-LTE-PLAN V2-8). PNG 와 **같은 조건**이고 이번 변경으로 나빠지지 않는다.
- 판별 그림이 풀리는데 큰 WebP 풀기가 실패하는 기기가 있을 수 있다(메모리 등). 그래서 §3 에 PNG 재시도를 둔다.
- 비교판의 대역과 생략:
  - 바탕은 v2 자산 Natural Earth II 다. v1 의 GIBS 바탕 대신 썼다.
  - 구름 그림자 층은 생략했다. 그림자는 알파만 쓰고 알파는 같으므로 3072 에서는 차이가 없다.
  - 2048 판의 그림자는 한 단계 거칠어진다(512 폭 → 원래 768 폭). 비교판에는 없다.
