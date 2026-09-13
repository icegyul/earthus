# RESEARCH-RUNTIME BASELINE — 환경 검증 보고

작성 2026-09-13 · PHASE 3A · `earthus-v2/real-living-earth-render` @ `3c577d15`
대상 `services/research-runtime` (= Simulation Platform 의 구체 구현)
선행 [SIMULATION_PLATFORM_MAPPING.md](SIMULATION_PLATFORM_MAPPING.md)

이 문서는 **검증 보고**다. `services/research-runtime` 코드는 한 줄도 고치지 않았다.
검증 스크립트는 전부 스크래치패드에만 썼다.

---

## 0. 상태 — 두 가지를 분리해 적는다

### 0.1 BASELINE 상태: **PASS**

> 기존 research-runtime 테스트는 이 기계에서 **실행 가능하고 통과한다.**
> 62개 테스트 전부 수집·실행되며, `.deps` 를 PYTHONPATH 에 넣은 25회 실행 중 24회가 OK 다.
> 의존성 40개가 잠금 핀과 정확히 일치하고, OceanParcels 3.1.4 native 경로가 실제로 실행되며,
> 보관된 실자료 결과를 현재 인터프리터로 재계산해 `resultArraySha256` 이 **비트 단위로 일치**했다.

환경 차단(`ENVIRONMENT_BLOCKED`)이 아니다 — 아래 §1 이 항목별 근거다.

### 0.2 별건: **DEFECT-1 — CODE_FAIL 급 결함 1건 확인 (100% 재현)**

> `research_runtime/server.py` 가 요청 본문을 읽기 전에 4xx 를 응답하고 HTTP/1.0 으로 연결을 닫는다.
> 그 결과 **정상 동일출처 클라이언트가 서버가 스스로 정의한 422 오류 메시지를 받지 못한다.**
> 내가 직접 5/5 재현했다. 위조·부하·타이밍 운이 전혀 필요 없다.

이것이 baseline 상태를 `CODE_FAIL` 로 바꾸지는 않는다 — 62개 중 61개는 이 결함과 무관하고
보안 판정 자체는 정상 동작한다. 그러나 **"환경 문제"가 아니다.** §3 이 전부다.

### 0.3 내 초기 분류를 정정한다

세션 초반에 나는 이 실패를 **"Windows 한정 간헐 flake, 문서화하고 넘어간다"** 로 분류했다.
**그 분류는 틀렸다.** 적대 검증 3관점 중 2관점이 이를 반증했고, 나도 직접 재현해 확인했다.
간헐적으로 보이는 이유는 운이 아니라 **TCP 세그먼트 분할 여부**라는 단일 변수이고,
그 변수가 문제가 되는 원인은 **서버가 본문을 배수하지 않는 것**이다.

---

## 1. 환경 검증 — 항목별

### 1.1 Python 버전

| 항목 | 값 |
|---|---|
| PATH 인터프리터 | **3.12.10** · `C:\Users\Dalur\AppData\Local\Programs\Python\Python312\python.exe` |
| `dependencies.lock.txt:1` 이 명시 | **3.12.14** (Windows AMD64) |
| 그 3.12.14 인터프리터 실존 여부 | **있다** — `~\.cache\codex-runtimes\codex-primary-runtime\dependencies\python\python.exe` (`start-research.ps1:5` 의 예비 경로) |
| `.deps` 를 설치한 인터프리터 | **3.12.14** — `.deps/bin/pytest.exe` · `f2py.exe` 바이너리 안에 그 경로가 박혀 있다 |

**패치 버전 차이는 차단 사유가 아니다. 근거 3개:**

1. **코드가 파이썬 버전을 강제하지 않는다.** `models.py:46-50 _check_loaded_source()` 는
   `dependencies.lock.txt` 의 **텍스트 동일성**만 본다. 1번 줄은 주석이라
   `models.py:324` 의 파싱에서도 배제된다(`not line.startswith("#")`).
   저장소 전체에 `sys.version_info` · `python_requires` 검사가 **0건**이다.
   `platform.python_version()` 히트 3건은 전부 provenance **기록용**이다
   (`models.py:340`, `models_v2.py:324`, `:327`).
2. **수치가 같다.** `examples/hycom-2015-atlantic.result.json` (provenance.python=3.12.14,
   resultArraySha256=`50a20011…`) 을 현재 3.12.10 으로 재계산 → **동일 해시**.
   `modelSourceSha256`(`42e5886b…`) · `dependencyLockSha256`(`da01d4fd…`) 도 동일.
   3.12.14 번들 파이썬으로도 같은 해시가 재현됐다.
3. **두 인터프리터 모두 62개를 통과한다.**

⚠️ 다만 패치 차이가 남기는 흔적 하나: provenance 에는 `python: "3.12.10"` 이 찍히는데
같은 증거 묶음에 동봉되는 lock 1번 줄은 `3.12.14` 라고 적혀 있다 — **증거의 자기모순**이다
(`cli.py:49`, `service.py:165,252-255` 가 lock 을 묶음에 그대로 넣는다).
재현 번들을 외부에 내보낼 때는 3.12.14 번들 파이썬으로 돌리는 것이 맞다.

### 1.2 의존성 잠금

| 항목 | 값 |
|---|---|
| `requirements.txt` | `parcels==3.1.4` **한 줄뿐** (직접 의존만 고정) |
| `dependencies.lock.txt` | 2~41줄 = **40개** `name==version` |
| lock 40개 ↔ `parcels==3.1.4` 추이적 폐쇄 | **정확히 일치.** 누락 0, 잉여 0 |
| `.deps` 최상위 항목 | 93개. lock 40개 배포본 **전부** `.deps` 에서 해석되고 버전이 핀과 전부 일치 |
| lock 으로 설치하는 코드 | **없다.** lock 은 해싱·동봉 대상일 뿐 (`pip` 호출 0건) |

`pytest` · `Pygments` · `iniconfig` · `pluggy` 가 lock 에 있는 것은 오염이 아니다 —
`importlib.metadata.distribution('parcels').requires` 에 `pytest` 가 실제로 선언돼 있다.

`.deps` 안의 `scipy-1.18.1-cp312-cp312-win_amd64.whl` 은 **0바이트**이고 무해하다
(scipy 휠이 스스로 RECORD 에 0바이트 항목으로 등재한 것이고, 디렉터리 안의 `.whl` 은 import 경로가 아니다).

### 1.3 과학 의존성 실측 (PYTHONPATH 설정 후)

```
numpy    2.5.2      .deps/numpy/__init__.py
scipy    1.18.1     .deps/scipy/__init__.py
xarray   2026.7.0   .deps/xarray/__init__.py
dask     2026.8.0   .deps/dask/__init__.py
netCDF4  1.7.4      .deps/netCDF4/__init__.py
zarr     2.18.7     .deps/zarr/__init__.py
parcels  3.1.4      .deps/parcels/__init__.py     ← models.py:21 PARCELS_VERSION 과 일치
(부가: pandas 3.0.5 · cftime 1.6.5 · numcodecs 0.15.1)
```

`models.describe()` → `{"available": true, "availabilityReason": null}`

### 1.4 OceanParcels 부재·불일치 시 동작 — **fail-closed 확인**

`models.py:53-62 _parcels()` 는 예외를 던지지 않고 `(None, None, 이유문)` 을 돌려주고,
`models.py:150-153` 이 그것을 **실행 거부**로 바꾼다:

```
버전 불일치 → "OceanParcels 3.1.4 required; found <ver>"
import 실패 → "OceanParcels 3.1.4 unavailable (ModuleNotFoundError); install requirements.txt in an isolated environment"
→ backend=oceanparcels 또는 비합성 입력이면 ValueError("real forcing requires the pinned OceanParcels adapter")
```

실측: `env -u PYTHONPATH python -c "...describe()"` → `available: False`,
reason = `OceanParcels 3.1.4 unavailable (ModuleNotFoundError)`.
**조용한 대체 실행이 아니다.** 합성 입력(`SYNTHETIC_TEST`)에만 참조 RK4 가 허용된다.

### 1.5 PYTHONPATH — 이것이 이전 세션에서 "환경 문제"로 보였던 원인

```powershell
# tools/research/start-research.ps1:10-11
$env:PYTHONPATH = "<서비스 루트>;<서비스 루트>\.deps" + (기존 PYTHONPATH 가 있으면 ";" + 그것)
```

실측 `sys.path`: `1=서비스 루트` · `2=.deps` · `5~6=stdlib` ·
`7=사용자 site-packages` · `8=전역 site-packages`

이 **순서가 중요하다.** 전역 site-packages 에 `numpy` · `pandas` · `packaging` · `pytest` ·
`typing_extensions` 가, 사용자 site 에 `six` · `dateutil` 이 따로 설치돼 있다.
`.deps` 가 site-packages 보다 앞이라 핀이 가려지지 않는다.
서비스 루트를 먼저 두는 이유는 `python -m research_runtime.server` 모듈 해석이다.

**PYTHONPATH 없이 돌리면:** `FAILED (errors=5, skipped=1)` —
실패 원인 **전부** `OceanParcels 3.1.4 unavailable (ModuleNotFoundError)`.
이것은 숨은 환경 파손이 아니라 `README.md:15` 와
`docs/research/IMPLEMENTATION_STATUS.md` 에 적힌 **정식 절차 누락**이다.

### 1.6 재현성 약점 — 새 클론에서는 재현 불가 (기록)

| 사실 | 근거 |
|---|---|
| `.deps` 는 `.gitignore:2` 로 무시되고 git 추적 파일 **0개** (약 378MB 미추적) | — |
| `requirements.txt` 는 `parcels` 하나만 핀. 나머지 39개는 lock 에만 있고 lock 으로 설치하는 코드가 없다 | §1.2 |
| venv 없음 | `ls -d .venv venv env` → 없음 |

→ **이 기계에서는 PASS 이지만, 새 클론·CI 에서는 그대로 재현되지 않는다.**
차단 사유는 아니고 별도 기록 항목이다. §6-R1.

---

## 2. 테스트 실행 실측

### 2.1 명령

```bash
cd "D:/## APP/EARTHUS v2_APP/services/research-runtime"
export PYTHONPATH="D:\\## APP\\EARTHUS v2_APP\\services\\research-runtime;D:\\## APP\\EARTHUS v2_APP\\services\\research-runtime\\.deps"
python -m unittest discover -s tests
```

⚠️ `README.md:68` 의 명령에는 PYTHONPATH 가 붙어 있지 않다. 그대로 복사하면 5개가 에러난다.

### 2.2 결과 — 25회

| 실행 | 결과 |
|---|---|
| 주 세션 1회차 (콜드) | Ran 62 tests in **27.354s** · **FAILED (errors=1)** |
| 주 세션 재실행 3회 | 26.482s / 17.035s / 12.665s — **3/3 OK** |
| 주 세션 단독 실행 8회 (`tests.test_service.HttpTests.test_api_and_cross_origin_denied`) | **8/8 OK** |
| 검증 에이전트 순차 5회 | 12.509 / 13.837 / 13.242 / 13.820 / 13.659s — **5/5 OK** |
| 검증 에이전트 병렬 4회 동시 | 14.362 / 14.178 / 14.223 / 14.412s — **4/4 OK** |
| 검증 에이전트 고부하 12회 동시 + CPU 점유 24 프로세스 | 48.7~67.2s (기준 대비 5배 저하) — **12/12 OK** |
| 검증 에이전트 추가 3회 | 13.678 / 13.005 / 13.779s — **3/3 OK** |

**합계 전체 스위트 25회 중 실패 1회 ≈ 4%.** 매회 정확히 `Ran 62 tests` — 테스트 수집은 안정적이다.
`skipped` 0건.

⚠️ 부하만으로는 재현되지 않는다. 실패한 콜드 실행(27.354s)보다 **2.4배 더 느린** 고부하 상태(67s)에서도
실패율 0 이었다. 즉 "부하·경합" 가설은 기각됐다 — 실제 원인은 §3 이다.

### 2.3 테스트 인벤토리

| 파일 | 성격 |
|---|---|
| `tests/test_compute.py` | 계산. `:43-45` 가 analytic·oceanparcels **두 백엔드** 모두 실행. `:157` 에 유일한 skip 게이트 `@unittest.skipUnless(_parcels()[0] is not None, …)` — **걸리지 않았다** |
| `tests/test_service.py` | HTTP. `:119 HttpTests` 가 실패한 테스트의 클래스 |
| `tests/test_service_concurrency.py` | 동시성 |
| `tests/test_step10_pipeline.py` | 10단계 파이프라인 |
| `tests/test_v2_windage.py` | v2 windage. **parcels native 필수** (`models_v2.py:95-96` 이 v2 에 analytic 대체가 없다고 못박음). skip 가드 없음 |
| `tests/test_validation.py` | 관측 대조 |

**native parcels 경로가 실제로 실행된다** — skip 0건 + `test_v2_windage` 가 native 필수 + §1.1-② 의 비트 동일 재현.
"parcels 가 설치만 됐다"가 아니라 "같은 숫자를 낸다"까지 검증됐다.

⚠️ 그러나 **62/62 OK 를 "OceanParcels 경로가 건강하다"로 읽어서는 안 된다.**
`test_service` 8개는 parcels 가 있으면 oceanparcels, 없으면 analytic-reference 로
조용히 바뀌며 양쪽 다 통과한다(`models.py:149`). native 를 보증하는 것은 `test_v2_windage` 5개다.

### 2.4 CI

`.github/workflows` 8개 중 이 서비스를 돌리는 것이 **하나도 없다**.
62개는 사람이 로컬 Windows 에서 손으로 돌려야만 검증된다.

---

## 3. DEFECT-1 — 조기 4xx 응답 + 본문 미배수

### 3.1 증상

`ConnectionAbortedError: [WinError 10053]` — 클라이언트가 서버가 **이미 보낸** 4xx 응답을 읽지 못한다.

### 3.2 기제 (코드 근거)

```
server.py:12    MAX_BODY = 24 * 1024 * 1024                     ( = 25,165,824 )
server.py:99    self._check_local(method == 'POST')              ← 본문 판독보다 먼저
server.py:107   body = self.body() if method == 'POST' else None ← 여기서야 읽는다
server.py:80-81 if not 0 < size <= MAX_BODY: raise ValueError('BODY_SIZE_LIMIT')
server.py:83    raw = self.rfile.read(size)                      ← 80-81 이 먼저 던지면 호출 안 됨
server.py:157-165  except PermissionError → 403 / ValueError → 422 / 그 밖 → 405·500
protocol_version 정의: grep 결과 0건 → BaseHTTPRequestHandler 기본 HTTP/1.0
                                     → close_connection=True, 매 응답마다 소켓 닫기
```

읽히지 않은 수신 데이터를 남긴 채 `close()` → Windows 가 RST → 클라이언트 수신 버퍼가 폐기되어
**이미 도착한 4xx 가 사라진다.**

`rfile.read` 는 저장소 전체에서 `server.py:83` 한 곳뿐이다(grep 확인). 배수(drain) 코드는 없다.

### 3.3 내가 직접 재현한 것 — 경계가 정확히 드러난다

정상 동일출처 POST (`Host` 정상 · `Origin: http://127.0.0.1:<port>` 정상 ·
`Content-Type: application/json` 정상 · **위조 0**):

| 본문 크기 | `rfile.read` | 결과 |
|---|---|---|
| 정확히 `MAX_BODY` = 25,165,824 B | 호출됨 | **HTTPError 422 정상 전달** (본문이 읽히고 파싱돼 이름 길이 검증까지 감) · 5/5 |
| `MAX_BODY` 초과 = 26,214,399 B | **호출 안 됨** | **`ConnectionAbortedError` 10053 · 5/5** |
| 200 B (대조군) | 호출됨 | HTTP 201 · 3/3 |

스위치가 `rfile.read` 가 호출되지 않는 지점에서 **정확히 뒤집힌다.**
(첫 줄 경계값은 내 재현 스크립트의 off-by-one 덕에 얻었다 — 의도한 것은 아니지만 결과적으로 가장 강한 증거다.)

### 3.4 검증 에이전트가 측정한 용량-반응 곡선

403 경로(실제 테스트와 같은 두 헤더 조합)에 본문 패딩만 키운 결과:

```
≤ 40 KB   →  0%      (0/480)
100 KB    →  0.25%   (1/400)
200 KB    →  1.7%    (2/120)
1 MB      →  47%     (56/120)
2 MB      →  75%     (150/200)
> MAX_BODY→  100%    (5/5, 10/10)
```

그리고 **헤더와 본문을 다른 세그먼트로 보내면** 실제 테스트의 15바이트 본문으로도
`40/40 = 100%` 중단된다. 반대로 한 세그먼트로 보내면 `3/3` 정상 403.

→ 간헐성의 유일한 변수는 **"본문이 헤더 판독 전에 도착하는가"** 다.
`BaseHTTPRequestHandler` 의 버퍼드 `rfile` 이 헤더 `readline` 때 같은 세그먼트의 짧은 본문까지
파이썬 버퍼로 빨아들이면 커널 큐가 비어 정상 FIN 이 된다. 그래서 실제 테스트는 거의 안 깨진다.

### 3.5 왜 "환경 문제"가 아닌가 — 제품 경로가 깨진다

`BODY_SIZE_LIMIT` 은 `rfile.read` **앞**에서 던져진다. 따라서:

> 사용자가 24MB 를 넘는 자료를 정상적으로 등록하려 하면,
> 서버가 스스로 정의한 `422 BODY_SIZE_LIMIT` 메시지를 **절대 받을 수 없다.**
> 대신 연결 중단만 본다 → "서버가 죽었다"고 판단해 같은 업로드를 재시도한다.
> 왜 거부됐는지 알 방법이 없다.

같은 이유로 `Content-Type` 오류 422(`server.py:73-74`)와 정적 경로 POST 의
405(`server.py:102-103`)도 큰 본문에서 전달 불가다.
이 경로에는 헤더 위조가 없고, 보안 로직이 개입하지 않고, 테스트 하네스도 관여하지 않는다.

### 3.6 테스트 쪽 취약점 (같은 결함의 다른 면)

`tests/test_service.py:131-134 request()` 는 `urllib.request.urlopen` 을 그대로 반환하고
`:143` 은 `assertRaises(urllib.error.HTTPError)` 로만 받는다.
`ConnectionAbortedError` 는 `OSError` 계열이라 `HTTPError` 로 잡히지 않아 곧바로 error 가 된다.

### 3.7 고칠 곳 (PHASE 3 에서 사용자 승인 후)

```
server.py 의 4xx 조기 응답 직전에 요청 본문을 배수한다.
  · Content-Length 만큼 읽어 버리되 상한(예: 1MB)을 두고, 넘으면 읽고 버리기를 끊는다
  · 또는 Connection: close 를 명시하고 응답 후 shutdown(SHUT_WR) → 잔여 수신 배수 순서를 지킨다
고칠 곳은 테스트가 아니라 server.py 다.
```

⚠️ 이 수정은 **이번 승인 범위(PHASE 3A = 검증)에 없다.** 보고만 한다.

---

## 4. 모델 진입점 (인벤토리)

### 4.1 등재 모델 — 정확히 2종

| | MODEL_ID | MODEL_VERSION | needsWind | 모듈 |
|---|---|---|---|---|
| 1 | `surface-passive-advection.v1` | `0.1.0` | False | `models.py` |
| 2 | `surface-passive-advection.v2.windage` | `0.1.0` | True | `models_v2.py` |

각 엔트리 키 8개: `module, version, needsWind, preflight, run, snapshot, sha256, describe`

### 4.2 `resolve()` 가 거절하는 것 (전부 `ValueError`)

1. `spec` 이 dict 아님 → `ExperimentSpec must be an object`
2. `modelId` 미등재 → `unknown modelId …; registered: […]`
3. `modelVersion` 불일치(키 부재 포함) → `modelVersion … does not match registered 0.1.0 for …`

그 밖은 검사하지 않는다 — `schemaVersion` · `wind` 존재 여부는 `resolve` 의 관심사가 아니다.

### 4.3 실제 시그니처

```
v1.preflight(spec, dataset)
v1.run_experiment(spec, dataset, progress=None, cancelled=None)
v2.preflight(spec, dataset, wind)
v2.run_experiment(spec, dataset, wind, progress=None, cancelled=None, run_id=None)
레지스트리 어댑터는 둘 다 (spec, dataset, wind=None, **kw) 로 통일
```

⚠️ 어댑터 동작 차이 3건 (통합에서 조용한 불일치가 되는 지점):
- `registry.py:15` — v1 은 `kw` 를 `('progress','cancelled')` 로 걸러 넘긴다 → **`run_id` 가 조용히 버려진다.**
  v2 provenance 에는 `runId` 가 있고 v1 에는 없다.
- `registry.py:14` — v1 `preflight` 어댑터가 `wind` 를 받아서 **버린다** → 항상 wind 를 넘기는 호출자는
  v1 실행에서 wind 가 검증·기록되지 않았다는 사실을 알 수 없다(`ok=True` 가 나온다).
- `needsWind` 는 **선언일 뿐 강제되지 않는다.** v2 에 `wind=None` 을 넘기면
  `wind dataset requires manifest and grid objects` 라는 **자료 형식 오류처럼** 보인다.

### 4.4 v2 windage

```
ALPHA_MIN, ALPHA_MAX = 0.0, 0.05          spec 에 alpha 필수 (암묵 기본값 없음)
WINDAGE_UNIT   = "dimensionless (m/s of drift per m/s of 10 m wind)"
WINDAGE_SOURCE = Niiler & Paduan 1995 / Lumpkin & Pazos / Sutherland 2020 · Breivik & Allen 2008
SNAPSHOT_FILES = __init__, datasets, models, cli, wind, models_v2, registry   (7개)
u_particle = u_HYCOM(15 m) + α · U10
합성 강제자료가 RegularGrid 를 duck-type → V1 의 RK4·경계 이분법·구간 가드가 그대로 돈다
```

### 4.5 **HTTP 서비스는 V1 전용이다** — PHASE 3F 에 직접 영향

`service.py:39` 가 `.models` 만 import 한다.
`service.py` / `server.py` 어디에도 `models_v2` · `registry` · `wind` · `cli_v2` 참조가 **0건**이다.

→ **`surface-passive-advection.v2.windage` 는 CLI(`cli_v2.py`) 경로에서만 실행된다.**
브라우저 · SDK(`ResearchClient`) · HTTP API 로는 v2 를 **부를 수 없다.**

이것은 [SIMULATION_PLATFORM_MAPPING.md](SIMULATION_PLATFORM_MAPPING.md) §6.4 의
"연결은 사람이 로컬에서 돌린 실행을 사건에 등재하는 방향으로 먼저 만든다" 결정을 강화한다 —
v2 는 애초에 API 로 자동 실행할 수 없다.

---

## 5. SQLite 원장 · 계약 (인벤토리 요약)

### 5.1 원장

```
<data-dir>/research.sqlite3
  objects(id TEXT PK, kind TEXT NOT NULL, created TEXT NOT NULL, body TEXT NOT NULL)
  submissions(key TEXT PK, digest TEXT NOT NULL, run_id TEXT NOT NULL)
objects.kind ∈ { dataset, project, experiment, run }
LocalInstanceLock → .service.lock 파일 락 (두 번째 ResearchService 기동만 막는다)
journal_mode = delete (WAL 아님) · 호출마다 연결 개폐 · timeout=15s
foreign_keys OFF · objects.kind 인덱스 없음
```

⚠️ **재현 번들의 진실은 SQLite 가 아니라 `<data-dir>/runs/<runId>/` 에 있다**
(`service.py:246-255`). `research.sqlite3` 만 백업·이관하면 `export` 가
`MODEL_SNAPSHOT_INTEGRITY_FAILURE` 로 전부 막힌다 — **원장과 `runs/` 를 한 단위로 다뤄야 한다.**

### 5.2 계약 인벤토리

```
자료 manifest 필수 텍스트: datasetId, version, evidenceKind, sourceURI, provider, citation, license
                          (+ 깊이·격자·좌표·단위·달력·시각·처리이력·sha256)
evidenceKind ∈ { OBSERVATION, ANALYSIS, REANALYSIS, FORECAST, SYNTHETIC_TEST }
readerVersion        = earthus-json-grid/1        (고정값 강제)
netcdfReaderVersion  = earthus-hycom-netcdf/1     (존재 여부조차 미검사)
MAX_VALUES 2,000,000 · MAX_SAMPLES 1,000,000 · MAX_TRACKS 1000 · MAX_FILE_BYTES 10 MiB
validation.py 는 어떤 경우에도 scientificAcceptance=NOT_EVALUATED,
                observationValidationPassed=False 를 반환한다 (validation.py:206)
  → 유효한 신호는 status 세 값뿐: NOT_VALIDATED / NUMERICAL_TEST_ONLY / COMPARISON_COMPUTED
EvidencePackage.manifest lineage = 질문 → 계획 → 자료 → 모델 → 실행 → 결과 → 판정
```

⚠️ **`evidence_v2` · `validation_v2` · `comparison_v2` 를 부르는 코드가
`research_runtime/` 안에 하나도 없다.** 유일한 생산 호출자는 서비스 루트 밖의
`tools/research/run_v2_cohort.py` 이고 그 밖에는 `tests/test_step10_pipeline.py` 뿐이다.
→ **서버·CLI(`cli.py`) 경로에서는 증거 패키지·판정이 전혀 생성되지 않는다.**

---

## 6. 통합 전에 알아야 하는 위험 — 선별 8건

`DEFECT-1`(§3) 외에, PHASE 3 에 실제로 영향을 주는 것만 골랐다.

| # | 위험 | 근거 | 통합에 주는 영향 |
|---|---|---|---|
| **R1** | **새 클론에서 재현 불가.** `.deps` 미추적 378MB · lock 으로 설치하는 코드 없음 · venv 없음 | §1.6 | CI·다른 기계에서 baseline 을 다시 잡을 수 없다. 어댑터 시험을 이 기계에 묶지 말 것 |
| **R2** | **합성 바람이 실자료 실행을 오염시킬 수 있다** (실측 확인된 구멍) | `wind.py:47` 이 `SYNTHETIC_TEST` 를 허용하는데 `models_v2.py:306-317` provenance 에 바람의 `evidenceKind` 칸이 **없고**, `:217` 경고문이 바람이 무엇이든 무조건 "Wind is NCEP-DOE R2 T62" 를 붙인다. 실행 확인: REANALYSIS 해류 + SYNTHETIC_TEST 바람 → `ok=True`, `provenance.evidenceKind="REANALYSIS"`, 합성 표시 키 0개 | 우리 "값을 지어내지 않는다" 규칙을 정면으로 위반할 수 있다. **어댑터가 `windDataset.evidenceKind` 를 직접 읽어 기록하고, SYNTHETIC 이면 공개 금지 플래그를 강제해야 한다** |
| **R3** | **소스 변경 가드가 17개 .py 중 절반 이하만 덮는다** | v1 스냅샷 4파일(`models.py:27`) · v2 7파일(`models_v2.py:31`). `service.py`·`server.py`·`store.py`·`validation.py`·`validation_v2.py`·`comparison_v2.py`·`evidence_v2.py`·`netcdf_reader.py`·`client.py`·`cli_v2.py` 10개는 어떤 스냅샷에도 없다 | 판정 코드(`validation_v2` C1~C5)·비교 통계·리더를 바꿔도 `modelSourceSha256` 이 그대로다. 어댑터는 `modelSourceSha256` 을 "전체 코드 지문"으로 취급하면 안 된다 |
| **R4** | **lock 핀이 강제되지 않는다** | `models.py:324-325` 는 이름만 뽑아 현재 버전을 **기록**할 뿐 핀과 비교하지 않는다. `parcels` 만 문자열 비교로 강제 | "같은 lock 텍스트 · 다른 실제 환경" 으로 replay 가 통과할 수 있다. 어댑터가 `dependencies{}` 실제 값을 함께 남겨야 한다 |
| **R5** | **서비스 가동 중 4파일 중 하나만 편집해도 이후 모든 실행이 `MODEL_SOURCE_CHANGED`** | `service.py:142-145, 159-160, 163-164` | 통합 중 코드를 만지면 **서비스 재시작 없이는 작업이 하나도 성공하지 않는다** |
| **R6** | **`test_08_v1_immutable` 이 4파일 SHA-256 을 상수로 고정** | `tests/test_v2_windage.py:22-28` | `models.py`·`datasets.py`·`cli.py`·`__init__.py` 를 포매팅·import 정리만 해도 깨진다. 메시지가 `IMPLEMENTATION STOP` 성격이라 단순 갱신으로 넘기면 설계 의도를 훼손한다 — **이 4파일을 건드리지 않는다** |
| **R7** | **인증이 없다. 127.0.0.1 바인딩이 실질적 유일한 경계** | `_check_local` 은 전부 헤더 기반. `Origin`·`Sec-Fetch-Site` 를 둘 다 보내지 않고 `Host: 127.0.0.1:<port>` 로 GET 하면 세 검사를 모두 통과 → `/runs/{id}/result`·`/export` 반출 경로가 남는다 | **공개 경로에 절대 붙이지 않는다.** SIMULATION_PLATFORM_MAPPING §6.1-③ 결정 유지 |
| **R8** | **`store.submit` 이 `with db:` 안에서 명시적 `BEGIN IMMEDIATE`** | `store.py:73` + `:109`. 3.12.10 legacy autocommit 에서는 동작하지만, 연결을 `autocommit=False` 로 바꾸거나 `:110` 앞에 DML 을 한 줄 추가하면 `cannot start a transaction within a transaction` 으로 제출 전체가 깨진다 | `store.py` 를 건드리지 않는다 |

---

## 7. 적대 검증 결과 (투명 기록)

3관점으로 내 PASS 판정을 반증하게 했다. 결과: **2관점이 반증(refuted=true).**

| 관점 | refuted | verdict | 무엇을 찾았나 |
|---|---|---|---|
| 코드 결함 | **true** | PASS | "환경 flake" 분류가 틀렸다. 본문 미배수는 서버 결함이고, 세그먼트 분할 시 6/6 결정론적. BODY_SIZE_LIMIT 제품 경로가 깨진다 |
| 재현 | **true** | **CODE_FAIL** | 21/21 OK 로 "재현 안 됨"은 확인했으나, 용량-반응 곡선으로 100% 재현 조건을 특정. Windows 는 증폭기이지 원인이 아니다 |
| 환경 차단 | false | PASS | ENVIRONMENT_BLOCKED 근거를 못 찾음. native parcels 경로 실행 확인 + 비트 동일 재현으로 자신의 최대 반증 후보가 무너졌다 |

투표: PASS 2 · CODE_FAIL 1 → baseline 은 **PASS**,
결함은 **DEFECT-1 로 별건 기록**(§0.2 · §3). 나는 DEFECT-1 의 핵심 주장을 직접 5/5 재현해 확인했다.

### 7.1 검증자가 지적한 내 진술의 미확인 항목

환경 관점 에이전트가 내 "단독 실행 8회 OK" 의 명령을 확인하지 못해 미확인으로 남겼다.
**확인해 적는다**: 내가 쓴 명령은
`python -m unittest tests.test_service.HttpTests.test_api_and_cross_origin_denied` 이고,
클래스명 `HttpTests`(`tests/test_service.py:119`)가 맞다. 잘못된 dotted name 이면
`AttributeError` 로 즉시 FAILED 가 되므로 8회 OK 는 유효하다.

---

## 8. 이 검증에서 하지 않은 것 (정직한 공백)

- **POSIX 동작 미확인.** DEFECT-1 이 Linux/macOS 에서 어떻게 나타나는지 시험하지 않았다.
  Windows 는 증폭기일 뿐이라는 것이 두 검증자의 판단이지만, 실측하지 않았다.
- **새 클론 검증 미실시.** R1 은 코드·gitignore 근거이고, 실제로 새 클론에서 돌려 보지는 않았다.
- **`netcdf_reader.build_dataset()` · `wind.build_ncep_r2_wind_dataset()` 미실행.**
  원본 NetCDF 없이는 실행 검증이 불가해 코드 읽기로만 판단했다.
- **v2 커널(`AdvectionRK4Windage`) 수치 일치 미대조.** `models_v2.py:118-140` 은 `# pragma: no cover` 이고,
  커널 컴파일 결과가 파이썬 RK4 와 일치한다는 주장은 `test_02`/`test_03` 에 담겨 있으나 별도 대조는 하지 않았다.
- **`tools/research/` 189개 스크립트 미실행.** `python -m unittest discover -s tests` 와의 관계가
  README 에 기술되어 있지 않다.
- **코드 수정 0건.** DEFECT-1 도 R1~R8 도 고치지 않았다. 보고만 한다.

---

## 9. 다음 단계 제안 (승인 대기)

| # | 제안 | 범위 | 이유 |
|---|---|---|---|
| A | **DEFECT-1 수정** — `server.py` 4xx 조기 응답 전 본문 배수 + 회귀 시험 | `research_runtime/server.py` + `tests/test_service.py` 에 시험 추가 | 정상 클라이언트가 422 를 못 받는다. 통합 전에 고치는 편이 낫다 (어댑터가 큰 spec 을 POST 한다) |
| B | **README 테스트 명령에 PYTHONPATH 추가** | `services/research-runtime/README.md` | 이전 세션이 "환경 문제로 실패"로 본 원인. 1줄 |
| C | **R2 수정** — v2 provenance 에 `windDatasetEvidenceKind` 추가 + SYNTHETIC 이면 경고문 변경 | `models_v2.py` | 우리 "값을 지어내지 않는다" 규칙 위반 가능. §9.1 의 대가를 먼저 확인할 것 |
| D | **PHASE 3F 최소 변경 검토** | 조사만 | 사용자 지시가 문장 중간에서 끊겼다. 나머지 지시 필요 |

⚠️ A·B·C 는 **전부 이번 승인 범위(PHASE 3A = 검증)에 없다.** 승인 없이 손대지 않는다.

### 9.1 제안 C 를 하면 따라오는 대가 (실측 확인)

`tests/test_v2_windage.py:23-28 V1_FILE_SHA256` 이 고정하는 것은 **정확히 4개**다:

```
models.py     b772b874b40b4026b51a0ec41ab23ee5cb082dd1d11ac797fe1e1f572c3fe04a
datasets.py   def5e6f7f6535f25cc300ef3b887f945549d85b0b06059515254f8a24f8523bb
cli.py        3a7a80d051e28c9668c6c033828469afd6c277b13cd520b809753c26af9e8f14
__init__.py   366fd795bc0b0bd78a37eb18016a1d93e250c3937a8e4e62ff142b03d56c3f24
V1_MODEL_SOURCE_SHA256 = 42e5886b640b616256dafc036bd4bbceff8a17affab1330947f0a9cb8612e444
```

주석: `# V1 source snapshot captured at STEP 8 start (before any V2 file existed). Any change = IMPLEMENTATION STOP.`

→ **`models_v2.py` 는 이 목록에 없다.** 제안 C 가 `test_08_v1_immutable` 을 깨지 않는다. 확인 완료.

**그러나 대가가 있다.** `models_v2.py` 는 v2 자신의 `SNAPSHOT_FILES`(`models_v2.py:31`, 7개)에 들어 있다.
고치면 v2 의 `modelSourceSha256` 이 바뀌고, **그 이전에 기록된 v2 실행의 replay 가 불일치로 떨어진다.**
그래서 제안 C 는 다음을 함께 해야 한다:

1. 기존 v2 실행 기록이 몇 건인지 먼저 센다 (현 원장에 run 1건뿐으로 관측됨 — 재확인 필요)
2. 바꾸기 전 `modelSourceSha256` 을 문서에 남긴다
3. `resolve_recorded()` 가 옛 해시 기록을 어떻게 다루는지 확인한다

또한 `IMMUTABLE_V1.json` 의 `verdict` 는 **`"FAIL"`** 이다 (`test_08` 이 그 값을 검사한다).
이것은 테스트 실패가 아니라 **과학적 판정 결과**다 — `validation.py:206` 이 어떤 경우에도
`scientificAcceptance=NOT_EVALUATED` 를 반환하는 것과 같은 태도다.
"표류 계산 성공 ≠ 관측 정확도 검증 성공"(README 마지막 문장)이 기록으로 남아 있는 것이다.
**이 값을 통합 중에 바꾸거나 해석해서는 안 된다.**

---

## 10. A·B·C 수정 결과 (2026-09-13 승인 후 실행)

§1~§9 는 **수정 전** 실측 기록이다. 이 절은 승인된 3건을 실제로 적용한 결과다.

### 10.0 제약 준수 확인

| 승인 시 제약 | 준수 |
|---|---|
| `test_08_v1_immutable` 의 고정 SHA 4파일 절대 수정 금지 | **준수.** `models.py` · `datasets.py` · `cli.py` · `__init__.py` 미변경. v1 `model_source_sha256` = `42e5886b…` **불변 확인** |
| DEFECT-1 은 HTTP error delivery 정상화를 위한 최소 수정 | 준수. `server.py` 한 파일, 상수 3개 + 메서드 1개 + 3줄. `protocol_version` 은 건드리지 않았다(연결 의미가 넓게 바뀐다) |
| 기존 정상 POST·실데이터 결과 변경 금지 | **준수.** 실데이터 예제 재계산 → `resultArraySha256` = `50a20011…` **비트 동일**, v1 `modelSourceSha256` 일치. 200 B POST 대조군 201 유지 |
| README 는 실행 명령에 필요한 PYTHONPATH만 보완 | 준수. `## 검증` 절만 수정 |
| R2 는 provenance/data-state 를 명시적으로 구분 | 준수. §10.3 |
| 합성 데이터가 실자료처럼 표시되는 경로 불허 | 준수. §10.3 |

### 10.1 A — DEFECT-1 수정 (`research_runtime/server.py`)

```
+ DRAIN_LIMIT / DRAIN_CHUNK / DRAIN_TIMEOUT_SECONDS     상수 3개
+ Handler._body_bytes_read / _request_drained            클래스 기본값 (AttributeError 방지)
+ Handler._drain_request()                              읽히지 않은 본문을 버린다 (파싱하지 않는다)
~ Handler.respond()                                     status >= 400 이면 응답 전에 배수
~ Handler.body()                                        읽은 바이트 수를 기록 (재판독 금지)
~ Handler._dispatch()                                   요청마다 상태 초기화
```

⚠️ `server.py` 는 v1·v2 **어느 SNAPSHOT_FILES 에도 없다**(실측 확인) → `modelSourceSha256` 불변.

**수정 전 → 후 (같은 시나리오, 같은 스크립트):**

| 시나리오 | 전 | 후 |
|---|---|---|
| 정상 동일출처 POST, `MAX_BODY` 초과 (26,214,399 B) | `ConnectionAbortedError` **5/5** | **`HTTPError 422: BODY_SIZE_LIMIT` 5/5** |
| 정확히 `MAX_BODY` (25,165,824 B) | 422 정상 | 422 정상 (변화 없음) |
| 200 B 정상 POST (대조군) | 201 | 201 (변화 없음) |
| 세그먼트 분할 · `Origin` 위조 · 지연 0.05s | ABORT 20/20 | **403 20/20** |
| 세그먼트 분할 · `Origin` 위조 · 지연 0.20s | ABORT 20/20 | **403 20/20** |
| 세그먼트 분할 · `Host` 위조 · 지연 0.05s/0.20s | ABORT 20/20 | **403 20/20** |
| 세그먼트 분할 · 2MB 본문 | ABORT 47~75% | **403 10/10** |

**신규 회귀 시험 2개** (`tests/test_service.py`):
- `test_oversize_body_error_reaches_the_client` — `MAX_BODY` 초과 POST 가 자기 422 를 읽는다
- `test_error_reaches_the_client_when_body_arrives_after_the_headers` — 본문이 헤더 뒤 세그먼트로 와도 403 을 읽는다

**시험에 teeth 가 있는지 확인:** 런타임에서 `_drain_request` 를 무력화하니
같은 시나리오가 `ConnectionAbortedError` **3/3** → 시험이 실패한다. 즉 이 시험은 결함을 실제로 잡는다.

### 10.2 B — README PYTHONPATH (`services/research-runtime/README.md`)

`## 검증` 절에 PowerShell·Git Bash 두 형태와 경로 순서 이유를 적었다.
문서가 거짓말하지 않도록 **적은 그대로 실행해 확인**했다:
`$env:PYTHONPATH = ".;.deps"` → `Ran 64 tests / OK`.

### 10.3 C — R2 구멍 수정 (`research_runtime/models_v2.py`)

```
~ preflight()        고정 문장 "Wind is NCEP-DOE R2 T62 (~1.9°) 6-hourly" 제거
                     → 실제 wind manifest 에서 datasetId·version·evidenceKind·provider·
                       heightMeters·timeStepSeconds 를 읽어 문장을 만든다
                     + report["windEvidenceKind"]
                     + 바람이 SYNTHETIC_TEST 면 경고 맨 앞에 표시 (models.py:170-171 관용구와 동일)
                     + 해류가 실자료인데 바람만 합성이면 "MIXED INPUTS: … this run is not a
                       real-forcing result." 를 맨 앞에 둔다
~ run_experiment()   provenance 에 두 키 추가
                     + windEvidenceKind
                     + syntheticInputs   (합성인 입력 이름 목록. 전부 실자료일 때만 빈 배열)
```

**수정 전 → 후 (REANALYSIS 해류 + SYNTHETIC_TEST 바람):**

| | 전 | 후 |
|---|---|---|
| `provenance.evidenceKind` | `REANALYSIS` | `REANALYSIS` (그대로 — 해류의 것이다) |
| `provenance.windEvidenceKind` | **키 없음** | `SYNTHETIC_TEST` |
| `provenance.syntheticInputs` | **키 없음** | `["wind"]` |
| `warnings[0]` | `"Wind is NCEP-DOE R2 T62 …"` (거짓) | `"MIXED INPUTS: REANALYSIS current combined with SYNTHETIC_TEST wind; this run is not a real-forcing result."` |
| 합성임을 알리는 키 | **0개** | 2개 + 경고 2줄 |

둘 다 합성인 경우 `syntheticInputs = ["current", "wind"]`.
**전부 실자료일 때만 빈 배열이다** — `evidenceKind` 하나만 읽어 판단하지 않게 했다.

**신규 회귀 시험 1개** (`tests/test_v2_windage.py`):
`test_15_synthetic_wind_is_never_recorded_as_real_forcing` —
`windEvidenceKind` · `syntheticInputs` · `MIXED INPUTS` 경고를 검사하고,
경고에 `NCEP` 문자열이 **없음**을 검사한다(공급자는 manifest 에서 와야 한다).

#### 10.3.1 C 의 대가 — 기록된 v2 번들 4개의 replay

`models_v2.py` 는 v2 `SNAPSHOT_FILES` 7개에 들어 있어 `modelSourceSha256` 이 바뀐다.

```
변경 전 v2 modelSourceSha256 : 306a597613f625e09d0788405b7b7e3b3a944627d4217b8da77e66a74859dee3
변경 후 v2 modelSourceSha256 : 486e9a58532a9d144faaaedaa8bae10fbf296fff3b7d081b6702be1271393c67
v1 modelSourceSha256         : 42e5886b640b616256dafc036bd4bbceff8a17affab1330947f0a9cb8612e444  (불변)
```

`.local-data/v2-bundles/` 의 번들 4개는 `306a5976…` 를 기록하고 있다.
실제로 replay 해 확인한 결과, **설계된 메시지로 거부된다**:

```
ValueError: replay model source differs from the recorded v2 source;
            restore the bundled snapshot before replay          (cli_v2.py:96-97)
```

크래시도 조용한 통과도 아니다. 그리고 그 안내는 **실행 가능하다** — 각 번들이
`model/source/research_runtime/` 에 7개 소스 전부와 `environment/dependencies.lock.txt` 를
동봉하고 있음을 확인했다. 즉 옛 판본으로 replay 하는 경로가 번들 안에 보존돼 있다.

⚠️ `MODEL_VERSION` 은 `0.1.0` 으로 **두었다.** 올리면 `resolve()` 가 기존 `0.1.0` spec 을 거절하고
`resolve_recorded()` 가 기존 번들을 해석하지 못한다. 물리·수치는 바뀌지 않았고
`resultArraySha256` 도 그대로이므로 버전을 올릴 사유가 아니다.

### 10.4 수정 후 baseline 재확인

| 실행 | 결과 |
|---|---|
| `python -m unittest discover -s tests` ×3 | **Ran 65 tests · OK / OK / OK** (13.797s / 13.695s / 13.612s) |
| PowerShell `$env:PYTHONPATH=".;.deps"` 형태 | Ran 64 tests · OK (R2 시험 추가 전 시점) |
| 실데이터 예제 재계산 | `resultArraySha256` 비트 동일 |

**62 → 65.** baseline 62개를 **하나도 지우거나 skip 하지 않았고**, 회귀 시험 3개를 더했다.

### 10.5 남은 것

- DEFECT-1 의 POSIX 동작은 여전히 미확인이다. 수정은 플랫폼과 무관하게 옳은 동작(본문 배수)이지만,
  Linux/macOS 에서 수정 전 증상이 어떻게 나타났는지는 시험하지 않았다.
- `DRAIN_LIMIT`(64 MiB)을 넘는 본문은 여전히 끝까지 읽지 않는다. 그 경우 연결은 거칠게 끊길 수 있다 —
  의도한 선택이다(거부된 요청에 무한정 읽어 주지 않는다). 코드 주석에 적었다.
- §6 의 R1 · R3 · R4 · R5 · R7 · R8 은 **고치지 않았다.** 승인 범위가 A·B·C 였다.

---

## 11. SOURCE HASH 와 RESULT ARRAY HASH — 왜 하나만 바뀌었나 (STEP 5)

C 수정으로 v2 의 `modelSourceSha256` 이 바뀌었다. 실자료의 `resultArraySha256` 은 바뀌지 않았다.
**두 해시는 서로 다른 것을 지문으로 찍는다.** 이 절이 그 구분이다.

### 11.1 두 해시의 정의

| | `modelSourceSha256` | `resultArraySha256` |
|---|---|---|
| 무엇의 지문인가 | **코드** — 소스 파일 스냅샷 | **수치** — 계산된 궤적 배열 |
| 입력 | `model_source_snapshot()` 이 읽은 `.py` 파일들의 텍스트 | `result["trajectories"]` 의 canonical JSON |
| 계산 위치 | `models.py:37-39` / `models_v2.py:37-39` | `models.py:341` / `models_v2.py` provenance |
| v1 이 덮는 파일 (4) | `__init__.py` · `cli.py` · `datasets.py` · `models.py` | — |
| v2 가 덮는 파일 (7) | 위 4개 + `models_v2.py` · `registry.py` · `wind.py` | — |
| 무엇을 보장하나 | "같은 코드로 돌렸다" | "같은 숫자가 나왔다" |
| 무엇을 보장하지 **않나** | 숫자가 같다는 것을 보장하지 않는다 | 코드가 같다는 것을 보장하지 않는다 |

### 11.2 C 수정이 SOURCE HASH 만 바꾼 이유

C 는 `models_v2.py` 두 곳을 고쳤다:

1. `preflight()` — 경고 문장을 고정 문구에서 **wind manifest 에서 생성**하는 것으로
2. `run_experiment()` — provenance 에 `windEvidenceKind` · `syntheticInputs` **두 키 추가**

둘 다 **기록·표시**만 바꾼다. 적분 루프·시간 적분 간격·경계 처리·풍압 항(`u + α·U10`)·
자료 검증 규칙을 한 줄도 건드리지 않았다. 그래서:

- `models_v2.py` 의 **텍스트가 바뀌었다** → `modelSourceSha256` 이 바뀐다 (설계대로 작동한 것이다)
- **궤적 배열은 그대로다** → `resultArraySha256` 은 바뀌지 않는다

```
v2 modelSourceSha256   306a597613f625e09d0788405b7b7e3b3a944627d4217b8da77e66a74859dee3   (수정 전)
                     → 486e9a58532a9d144faaaedaa8bae10fbf296fff3b7d081b6702be1271393c67   (수정 후)

v1 modelSourceSha256   42e5886b640b616256dafc036bd4bbceff8a17affab1330947f0a9cb8612e444   (불변)
   ↑ `models_v2.py` 는 v1 스냅샷 4파일에 없다. 그래서 v1 은 영향을 받지 않는다.
     v1 4파일이 `test_08_v1_immutable` 의 SHA 고정 대상이고, 승인 제약이 금지한 것이 그 4개다.
```

### 11.3 실자료 `resultArraySha256` 이 동일함을 확인한 명령

보관된 실자료 예제(HYCOM 2015 북대서양, `evidenceKind=REANALYSIS`)를 수정 후 코드로
다시 계산해 보관값과 대조한다.

```bash
cd "<저장소>/services/research-runtime"
export PYTHONPATH="<서비스 디렉터리>;<서비스 디렉터리>/.deps"
python - <<'PY'
import json
from pathlib import Path
from research_runtime import models as v1
from research_runtime.datasets import validate_dataset

stored = json.loads(Path('examples/hycom-2015-atlantic.result.json').read_text(encoding='utf-8-sig'))
spec   = json.loads(Path('examples/hycom-2015-atlantic.experiment.json').read_text(encoding='utf-8-sig'))
data   = json.loads(Path('examples/hycom-2015-atlantic.dataset.json').read_text(encoding='utf-8-sig'))
out = v1.run_experiment(spec, validate_dataset(data))
print('stored     ', stored['provenance']['resultArraySha256'])
print('recomputed ', out['provenance']['resultArraySha256'])
print('identical  ', out['provenance']['resultArraySha256'] == stored['provenance']['resultArraySha256'])
PY
```

2026-09-13 실행 결과:

```
stored      50a20011057cc95eaf3c4fcc14f0f1d9e472d9fd473028db9da99cec2f0d6546
recomputed  50a20011057cc95eaf3c4fcc14f0f1d9e472d9fd473028db9da99cec2f0d6546
identical   True
modelSourceSha256  stored == recomputed == 42e5886b…   (v1 이므로 불변)
```

⚠️ 이 예제는 **v1 모델**이다(`surface-passive-advection.v1`). v1 코드를 건드리지 않았으므로
`modelSourceSha256` 도 같다. **v2 실행에 대한 같은 대조는 하지 못했다** —
저장소에 보관된 v2 결과는 `.local-data/v2-bundles/` 의 번들 4개뿐이고, 그 번들은
`modelSourceSha256` 불일치로 replay 가 거부된다(§10.3.1). 그래서 v2 의 수치 불변은
**코드 근거**(적분 경로 미변경)와 `test_v2_windage` 통과로만 뒷받침되고,
비트 단위 재현 대조로는 확인하지 못했다. 그 한계를 여기 적는다.

### 11.4 v2 실행의 수치 불변을 나중에 확인하는 방법

번들 하나를 **동봉된 소스 스냅샷으로** 되돌려 replay 하면 대조가 성립한다.
번들이 `model/source/research_runtime/` 에 7개 파일 전부와
`environment/dependencies.lock.txt` 를 담고 있음을 확인했다(§10.3.1).

```
1. 번들을 임시 폴더에 풀고 model/source/research_runtime/ 을 별도 트리로 꺼낸다
2. 그 트리를 PYTHONPATH 앞에 두고 cli_v2 replay 를 돌린다 → matched=True 여야 한다
3. 그 결과의 resultArraySha256 을, 현재 코드로 같은 spec·dataset·wind 를 돌린 값과 비교한다
4. 같으면 C 수정이 수치를 바꾸지 않았다는 비트 단위 근거가 된다
```

⚠️ 이것은 **아직 하지 않았다.** 원본 해류·풍자료를 다시 갖춰야 하고(번들의 재배포 정책에 따라
입력이 빠져 있을 수 있다), 그 확인은 자료를 다시 받을 수 있을 때 한다.

### 11.5 혼동하면 안 되는 것

| 잘못된 읽기 | 옳은 읽기 |
|---|---|
| "소스 해시가 바뀌었으니 결과도 달라졌다" | 소스 해시는 코드 지문이다. 주석 한 줄만 고쳐도 바뀐다 |
| "결과 해시가 같으니 코드도 같다" | 결과 해시는 수치 지문이다. 기록 칸을 더해도 그대로다 |
| "replay 거부 = 결과가 틀렸다" | replay 거부 = "기록된 코드와 지금 코드가 다르다". 번들 스냅샷으로 되돌리면 대조가 성립한다 |
| "MODEL_VERSION 을 올려야 한다" | 물리·수치가 바뀌지 않았다. 올리면 `resolve()` 가 기존 `0.1.0` spec 을 거절하고 기존 번들을 해석하지 못한다 |
