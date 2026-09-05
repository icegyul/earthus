"""Research execution boundary: durable jobs, idempotency, cancellation, exports."""
from __future__ import annotations

import csv
import hashlib
import io
import json
import os
import platform
import threading
import zipfile
from concurrent.futures import ThreadPoolExecutor
from pathlib import Path

from .store import Store, LocalInstanceLock, utc_now


def canonical(value):
    return json.dumps(value, sort_keys=True, separators=(',', ':'), ensure_ascii=False, allow_nan=False).encode('utf-8')


def digest(value):
    return hashlib.sha256(canonical(value)).hexdigest()


def check_name(value, default):
    if value is None:
        return default
    if not isinstance(value, str) or not value.strip() or len(value) > 200:
        raise ValueError('이름은 1~200자여야 합니다.')
    return value.strip()


class ResearchService:
    def __init__(self, directory, workers=1):
        from .datasets import validate_dataset
        from .models import preflight, run_experiment
        self.validate_dataset = validate_dataset
        self.preflight_model = preflight
        self.run_model = run_experiment
        self.model_sources = {name: Path(__file__).with_name(name).read_text(encoding='utf-8')
                              for name in ('models.py','datasets.py','__init__.py','cli.py')}
        self.model_source_hash = digest(self.model_sources)
        lock_path = Path(__file__).resolve().parents[1] / 'dependencies.lock.txt'
        self.dependency_lock = lock_path.read_text(encoding='utf-8') if lock_path.exists() else ''
        self.instance_lock = LocalInstanceLock(directory)
        try:
            self.store = Store(directory)
            self.store.fail_interrupted()
        except Exception:
            self.instance_lock.close()
            raise
        self.pool = ThreadPoolExecutor(max_workers=workers, thread_name_prefix='research')
        self.events = {}
        self.guard = threading.RLock()
        self.closed = False

    def register_dataset(self, payload):
        normalized = self.validate_dataset(payload)
        checksum = digest(normalized)
        with self.guard:
            for existing in self.store.list('dataset'):
                if existing['sha256'] == checksum:
                    return existing
            manifest = normalized['manifest']
            for existing in self.store.list('dataset'):
                if (existing['manifest']['datasetId'], existing['manifest']['version']) == (manifest['datasetId'], manifest['version']):
                    raise ValueError('DATASET_VERSION_CONFLICT: 같은 자료 버전에 다른 파일을 등록할 수 없습니다.')
            return self.store.create('dataset', {'manifest': manifest, 'document': normalized, 'sha256': checksum})

    def dataset_index(self):
        return [{k: v for k, v in d.items() if k != 'document'} for d in self.store.list('dataset')]

    def create_project(self, body):
        question = body.get('question', '')
        if not isinstance(question, str) or len(question) > 2000:
            raise ValueError('질문은 2000자 이하여야 합니다.')
        return self.store.create('project', {'name': check_name(body.get('name'), '표류 연구'), 'question': question})

    def create_experiment(self, body):
        self.store.get('project', body['projectId'])
        dataset = self.store.get('dataset', body['datasetId'])
        spec = body.get('spec')
        if not isinstance(spec, dict):
            raise ValueError('spec 객체가 필요합니다.')
        if spec.get('projectId') != body['projectId']:
            raise ValueError('PROJECT_BINDING_MISMATCH')
        # Reject inconsistent binding instead of silently editing a submitted experiment.
        expected = [{'datasetId': dataset['manifest']['datasetId'], 'version': dataset['manifest']['version']}]
        if spec.get('datasetVersions') != expected:
            raise ValueError('DATASET_BINDING_MISMATCH')
        canonical(spec)
        return self.store.create('experiment', {
            'projectId': body['projectId'], 'datasetId': body['datasetId'],
            'name': check_name(body.get('name'), '표류 실험'), 'spec': spec,
            'specSha256': digest(spec), 'datasetSha256': dataset['sha256'],
        })

    def preflight(self, experiment):
        dataset = self.store.get('dataset', experiment['datasetId'])
        return self.preflight_model(experiment['spec'], dataset['document'])

    def submit(self, body, key):
        if not isinstance(key, str) or not 8 <= len(key) <= 160:
            raise ValueError('8~160자 Idempotency-Key가 필요합니다.')
        prior = self.store.prior_submission(key,digest(body))
        if prior:
            return prior
        experiment = self.store.get('experiment', body['experimentId'])
        check = self.preflight(experiment)
        if not check.get('ok'):
            raise ValueError('PREFLIGHT_FAILED: ' + json.dumps(check, ensure_ascii=False))
        with self.guard:
            if self.closed:
                raise ValueError('SERVICE_STOPPING')
            prior = self.store.prior_submission(key,digest(body))
            if prior:
                return prior
            pending = [r for r in self.store.list('run') if r['status'] in ('QUEUED', 'RUNNING', 'CANCEL_REQUESTED')]
            if len(pending) >= 8:
                raise ValueError('QUEUE_LIMIT: 대기 작업이 가득 찼습니다.')
            run, created = self.store.submit(key, digest(body), {
                'experimentId': experiment['id'], 'projectId': experiment['projectId'],
                'datasetId': experiment['datasetId'], 'spec': experiment['spec'],
                'specSha256': experiment['specSha256'], 'datasetSha256': experiment['datasetSha256'],
                'status': 'QUEUED', 'progress': {'fraction': 0}, 'preflight': check,
            })
            if created:
                event = threading.Event()
                self.events[run['id']] = event
                self.pool.submit(self._execute, run['id'], event)
        return run

    def _execute(self, identifier, cancel):
        try:
            with self.guard:
                if cancel.is_set():
                    self.store.update_run(identifier, status='CANCELLED', finishedAt=utc_now())
                    return
                run = self.store.update_run(identifier, status='RUNNING', startedAt=utc_now())
            dataset = self.store.get('dataset', run['datasetId'])['document']
            current_hash = digest({name:Path(__file__).with_name(name).read_text(encoding='utf-8')
                                   for name in self.model_sources})
            if current_hash != self.model_source_hash:
                raise ValueError('MODEL_SOURCE_CHANGED: 모델 코드가 바뀌었습니다. 계산 서비스를 재시작하세요.')
            def on_progress(value):
                progress = value if isinstance(value, dict) else {'fraction': float(value)}
                self.store.update_run(identifier, progress=progress)
            result = self.run_model(run['spec'], dataset, progress=on_progress, cancelled=cancel.is_set)
            canonical(result)
            with self.guard:
                if cancel.is_set():
                    self.store.update_run(identifier, status='CANCELLED', finishedAt=utc_now())
                    return
                if result.get('qualityStatus') == 'INVALID':
                    raise ValueError('INVALID_RESULT')
                folder = self.store.directory / 'runs' / identifier
                folder.mkdir(parents=True, exist_ok=True)
                if result.get('provenance',{}).get('modelSourceSha256') != self.model_source_hash:
                    raise ValueError('MODEL_SOURCE_CHANGED_DURING_RUN')
                for name, source in self.model_sources.items():
                    (folder / name).write_bytes(source.encode('utf-8'))
                if result.get('provenance',{}).get('dependencyLockSha256') != digest(self.dependency_lock):
                    raise ValueError('DEPENDENCY_LOCK_CHANGED_DURING_RUN')
                (folder / 'dependencies.lock.txt').write_bytes(self.dependency_lock.encode('utf-8'))
                temporary = folder / 'result.json.tmp'
                temporary.write_bytes(canonical(result))
                os.replace(temporary, folder / 'result.json')
                self.store.update_run(identifier, status='SUCCEEDED', finishedAt=utc_now(),
                                      progress={'fraction': 1}, qualityStatus=result.get('qualityStatus'),
                                      resultSha256=digest(result))
        except InterruptedError:
            self.store.update_run(identifier, status='CANCELLED', finishedAt=utc_now())
        except Exception as error:
            self.store.update_run(identifier, status='CANCELLED' if cancel.is_set() else 'FAILED',
                                  finishedAt=utc_now(), error={'code': type(error).__name__, 'message': str(error)[:2000]})
        finally:
            with self.guard:
                self.events.pop(identifier, None)

    def get_run(self, identifier, include_result=True):
        run = self.store.get('run', identifier)
        if include_result and run['status'] == 'SUCCEEDED':
            path = self.store.directory / 'runs' / identifier / 'result.json'
            raw = path.read_bytes()
            if hashlib.sha256(raw).hexdigest() != run['resultSha256']:
                raise ValueError('RESULT_INTEGRITY_FAILURE')
            run['result'] = json.loads(raw)
        return run

    def cancel(self, identifier):
        with self.guard:
            run = self.store.get('run', identifier)
            if run['status'] in ('SUCCEEDED', 'FAILED', 'CANCELLED'):
                return run
            event = self.events.get(identifier)
            if event is None:
                return self.store.update_run(identifier, status='FAILED', error={'code': 'WORKER_UNAVAILABLE'})
            event.set()
            return self.store.update_run(identifier, status='CANCEL_REQUESTED')

    def comparison(self, identifiers):
        if not isinstance(identifiers, list) or len(identifiers) != 2 or identifiers[0] == identifiers[1]:
            raise ValueError('서로 다른 완료 실행 2개를 선택하세요.')
        runs = [self.get_run(i) for i in identifiers]
        if any(r['status'] != 'SUCCEEDED' for r in runs):
            raise ValueError('완료된 실행만 비교할 수 있습니다.')
        from math import asin, cos, radians, sin, sqrt
        specs = [r['spec'] for r in runs]
        paired = all(specs[0].get(k) == specs[1].get(k) for k in ('releaseDefinition','startTimeUTC','particleCount'))
        a, b = [r['result']['trajectories'] for r in runs]
        differences = []
        if paired:
            right = {p['particleId']: p for p in b}
            for particle in a:
                match = right.get(particle['particleId'])
                if match is None:
                    continue
                by_time = {s['timeUTC']: s for s in match['samples']}
                for x in particle['samples']:
                    y = by_time.get(x['timeUTC'])
                    if y is None or x['status'] not in ('ACTIVE','COMPLETED') or y['status'] not in ('ACTIVE','COMPLETED'):
                        continue
                    dl = radians(y['lon']-x['lon']); dp = radians(y['lat']-x['lat'])
                    h = sin(dp/2)**2 + cos(radians(x['lat']))*cos(radians(y['lat']))*sin(dl/2)**2
                    differences.append({'particleId': particle['particleId'], 'timeUTC': x['timeUTC'],
                                        'distanceMeters': 6371000*2*asin(min(1, sqrt(max(0,h))))})
        return {'runIds': identifiers, 'mode': 'PAIRED' if paired else 'GROUP_SUMMARY',
                'summaries': [r['result']['summary'] for r in runs], 'differences': differences,
                'note': '공통 유효시각·입자만 비교' if paired else '방출 조건이 달라 집단 요약만 비교합니다.'}

    def export(self, identifier):
        run = self.get_run(identifier)
        if run['status'] != 'SUCCEEDED':
            raise ValueError('완료된 실행만 내보낼 수 있습니다.')
        dataset = self.store.get('dataset', run['datasetId'])['document']
        files = {
            'experiment.json': canonical(run['spec']),
            'datasets/manifest.json': canonical(dataset['manifest']),
            'results/result.json': canonical(run['result']),
            'model/manifest.json': canonical(run['result'].get('provenance', {})),
            'environment/lock-and-runtime.json': canonical({key:run['result']['provenance'].get(key)
                for key in ('python','platform','dependencies','positionPrecision','forcingPrecision','dependencyLockSha256')}),
            'logs/run.json': canonical({k:v for k,v in run.items() if k != 'result'}),
        }
        folder = self.store.directory / 'runs' / identifier
        saved_sources = {name:(folder / name).read_text(encoding='utf-8') for name in self.model_sources}
        if digest(saved_sources) != run['result']['provenance']['modelSourceSha256']:
            raise ValueError('MODEL_SNAPSHOT_INTEGRITY_FAILURE')
        for name in ('models.py','datasets.py','__init__.py','cli.py'):
            files['model/source/research_runtime/'+name] = (folder/name).read_text(encoding='utf-8').encode('utf-8')
        lock = folder/'dependencies.lock.txt'
        if not lock.exists() or digest(lock.read_text(encoding='utf-8')) != run['result']['provenance'].get('dependencyLockSha256'):
            raise ValueError('DEPENDENCY_SNAPSHOT_INTEGRITY_FAILURE')
        files['environment/dependencies.lock.txt'] = lock.read_text(encoding='utf-8').encode('utf-8')
        manifest = dataset['manifest']
        redistributable = manifest.get('evidenceKind') == 'SYNTHETIC_TEST' or manifest.get('redistributionAllowed') is True
        if redistributable:
            files['datasets/input.json'] = canonical(dataset)
        flat = io.StringIO(newline='')
        writer = csv.writer(flat)
        writer.writerow(['metric','value'])
        for k, v in run['result']['summary'].items():
            writer.writerow([k, json.dumps(v, ensure_ascii=False) if isinstance(v,(list,dict)) else v])
        files['results/summary.csv'] = flat.getvalue().encode('utf-8-sig')
        files['README-reproduce.md'] = (f'# EARTHUS experiment {identifier}\n\n'
            '실행: python -m research_runtime.cli replay <이 ZIP 파일>\n\n'
            + ('입력 파일 포함. 모델 의존성은 model/manifest.json에서 확인하세요.\n' if redistributable else
               '입력 재취득 필요: 자료 이용 조건에 따라 원본을 포함하지 않았습니다. datasets/manifest.json의 불변 식별자와 해시를 확인하세요. 완전한 오프라인 재현 묶음이 아닙니다.\n')).encode('utf-8')
        files['checksums.sha256'] = ''.join(f'{hashlib.sha256(raw).hexdigest()}  {name}\n' for name,raw in sorted(files.items())).encode()
        output = io.BytesIO()
        with zipfile.ZipFile(output, 'w', zipfile.ZIP_DEFLATED) as archive:
            for name, raw in files.items():
                archive.writestr(name,raw)
        return output.getvalue()

    def close(self):
        with self.guard:
            self.closed = True
            for event in self.events.values():
                event.set()
        try:
            self.pool.shutdown(wait=True, cancel_futures=False)
        finally:
            self.instance_lock.close()
