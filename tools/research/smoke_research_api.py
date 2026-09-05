"""Create a clearly named verification project through the real local API."""
import json
from pathlib import Path
import time

from research_runtime.client import ResearchClient
from research_runtime.cli import replay_bundle


def main():
    root = Path(__file__).resolve().parents[2]
    evidence = root/'docs/research/evidence'
    evidence.mkdir(parents=True, exist_ok=True)
    api = ResearchClient()
    dataset = next(d for d in api.datasets() if d['manifest']['datasetId'] == 'hycom-gofs31-53x-atlantic-20150105')
    project = api.project('검증 예제 · HYCOM 72시간', '2015년 1월의 실제 해류 재분석 자료로 표층 수동 입자 9개의 72시간 이동을 재현한다.')
    spec_path = root/'services/research-runtime/examples/hycom-2015-atlantic.experiment.json'
    spec = json.loads(spec_path.read_text(encoding='utf-8'))
    spec['projectId'] = project['id']; spec['question'] = project['question']
    experiment = api.experiment(project['id'],dataset['id'],spec,'기준 · 300초 적분')
    preflight = api.preflight(experiment['id'])
    assert preflight['ok'],preflight
    run = api.run(experiment['id'],'root-hycom-'+experiment['id'])
    deadline = time.monotonic()+120
    while time.monotonic() < deadline:
        run = api.status(run['id'])
        if run['status'] in ('SUCCEEDED','FAILED','CANCELLED'):
            break
        time.sleep(.5)
    assert run['status'] == 'SUCCEEDED',run.get('error',run['status'])
    bundle = evidence/f"hycom-api-{run['id']}.zip"
    api.export(run['id'],bundle)
    replay = replay_bundle(bundle)
    assert replay['matched']
    record = {'projectId':project['id'],'experimentId':experiment['id'],'runId':run['id'],
              'preflight':preflight,'status':run['status'],'qualityStatus':run['qualityStatus'],
              'summary':run['result']['summary'],'provenance':run['result']['provenance'],
              'export':bundle.name,'replayedArraySha256':replay['resultArraySha256'],
              'replayEnvironment':'separate execution, same installed Python dependencies',
              'observationValidation':'NOT_PERFORMED'}
    (evidence/'api-hycom-smoke.json').write_text(json.dumps(record,ensure_ascii=False,indent=2),encoding='utf-8')
    print(json.dumps({k:record[k] for k in ('runId','status','qualityStatus','export','replayedArraySha256')},indent=2))


if __name__ == '__main__':
    main()
