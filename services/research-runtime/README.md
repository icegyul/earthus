# EARTHUS Research Runtime

기존 v1·v2·AETHERUS 메뉴를 변경하지 않고 실행하는 연구 작업 공간이다. 로컬 단일 사용자용이며 현재 공개 운영 서버가 아니다.

## 실행

저장소 루트의 PowerShell에서:

```powershell
./tools/research/start-research.ps1
```

접속: `http://127.0.0.1:8788/v2-three/research.html`.

일반 Python 환경에서는 서비스 디렉터리에서 `python -m research_runtime.server`로 실행한다. 과학 계산 의존성은 `requirements.txt`에 고정되어 있다. 프로젝트 전용 가상 환경에 설치하고, 현재 세션의 `.deps`를 사용하려면 해당 경로를 PYTHONPATH에 추가한다. Windows 시작 스크립트는 이 경로를 자동으로 사용한다.

서버는 127.0.0.1에만 바인딩한다. 원격 공개·다중 사용자용으로 바인딩을 바꾸지 않는다. 인증·테넌트 격리·운영 작업 큐를 갖춘 별도 배포가 필요하다.

## 실제 기능

- 불변 자료 버전 등록과 JSON 격자 입력 검사.
- 프로젝트·실험 저장 및 실험 사전 검사.
- OceanParcels 3.1.4를 이용한 표층 수동 입자 RK4 계산.
- 합성 수치시험 입력은 `SYNTHETIC_TEST`로 구분. 이 입력에 한해서 엔진 미설치 시 별도 분석용 참조 적분을 허용한다.
- 실제 해류 자료는 고정 OceanParcels가 없으면 실행 거부.
- SQLite 작업 원장, 대기·진행·취소, idempotency key, 재시작 후 중단 작업 표시.
- 2D/3D 궤적, 공통 시간축, 동일 방출 조건의 짝비교와 다른 조건의 집단 요약.
- 원본 결과 해시 검사와 권리 조건에 따른 ZIP 묶음 내보내기.
- CLI 및 표준 라이브러리 Python SDK.

기본 제공 일정 동향류 자료는 실제 바다 자료가 아니다. 실제 자료 예제의 제공자·날짜·격자·권리는 각 manifest에서 확인한다. 표류 계산 성공은 관측 정확도 검증 성공과 다르다.

## API 사용 예

```python
import json
from pathlib import Path
from research_runtime.client import ResearchClient

api = ResearchClient()
dataset = api.datasets()[0]
project = api.project('표류 조건 비교', '동일한 해류장에서 방출 시각 차이를 비교한다.')
spec = json.loads(Path('examples/constant-eastward.experiment.json').read_text())
spec['projectId'] = project['id']
spec['question'] = project['question']
spec['datasetVersions'] = [{'datasetId': dataset['manifest']['datasetId'], 'version': dataset['manifest']['version']}]
experiment = api.experiment(project['id'], dataset['id'], spec)
assert api.preflight(experiment['id'])['ok']
run = api.run(experiment['id'], idempotency_key='my-experiment-0001')
print(api.status(run['id']))
```

브라우저와 SDK는 같은 실험·계산 경로를 사용한다. 계산 조건을 변경하려면 새 실험을 생성한다. 동일 idempotency key에 다른 요청은 오류로 처리한다.

## 자료 형식

`{manifest, grid}` JSON. grid는 `lon`, `lat`, `timeUTC`, 시간×위도×경도의 `u`, `v`, 위도×경도의 boolean `landMask`이다. u는 동향 m/s, v는 북향 m/s이며 육지는 true이다. 시간축은 최소 두 프레임이며 전체 계산 기간을 덮어야 한다.

manifest는 출처·인용·권리, 자료 종류, 버전, 깊이, 격자·좌표·단위·달력, 발행·유효·수집시각, 처리 이력, SHA-256을 포함한다. `examples/constant-eastward.dataset.json`을 구조 예제로 사용하되 실제 자료에 SYNTHETIC_TEST를 붙이지 않는다.

`timeStepSeconds`는 원자료의 시간 간격이다. 모든 프레임 간격이 이 값과 일치해야 하며, 빠진 프레임을 넓은 시간 보간으로 숨기지 않는다.

HYCOM NCSS NetCDF는 `research_runtime/netcdf_reader.py`(`earthus-hycom-netcdf/1`)가 이 JSON 격자로 정규화한다 — 제공자 전용 reader이며 CF 이름·단위·달력·배포 문구·정규 격자·프레임 연속성을 검사하고 결측 노드는 `landMask=true`·`null`로 둔다(0 대체 없음). 일반 NetCDF 파일을 UI에 그대로 올리는 기능은 아직 제공하지 않는다. 제공자별 reader로 원본을 정규화하고 원본 해시·변환 기록을 남긴다. 곡선/C-grid·3차원 흐름·확산·풍압·Stokes drift·유류 풍화는 현재 모델에 포함되지 않는다.

## 검증

```powershell
python -m unittest discover -s tests -v
```

계산 시험과 서비스 시험을 분리한다. 서비스 시험은 자료 버전 충돌, 실행·취소, 중복 제출, 재시작, 결과 위변조, ZIP 해시, 외부 Origin/Host 거부를 검사한다. 수치시험·실자료 실행·관측 검증의 현황은 `../../docs/research/IMPLEMENTATION_STATUS.md`에서 확인한다.

## 보존과 배포

작업 데이터 기본 위치는 `.local-data`이며 Git에 넣지 않는다. 서버 중지 후 작업 폴더를 함께 보관하면 프로젝트·실험·완료 결과를 유지할 수 있다. 기존 엔진 코드나 메뉴를 되돌리는 작업은 수행하지 않는다.

현재 `tools/build-v2-bundle.sh`는 배포 폴더를 재생성하므로, 메뉴 동시 수정 중에는 이 작업의 검증 목적으로 실행하지 않는다. 새 연구 페이지·모듈만 분리 검증하고, 메뉴 담당 작업과 함께 배포할 때 현재 전체 변경을 다시 확인한다.
