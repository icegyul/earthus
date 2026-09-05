"""End-to-end local API/lifecycle tests, using the labelled analytic fixture."""
import copy
import hashlib
import io
import json
from pathlib import Path
import tempfile
import threading
import time
import unittest
import urllib.error
import urllib.request
import zipfile

from research_runtime.server import Server
from research_runtime.service import ResearchService, digest


EXAMPLES = Path(__file__).resolve().parents[1] / 'examples'


def fixture():
    return json.loads((EXAMPLES/'constant-eastward.dataset.json').read_text(encoding='utf-8-sig'))


def spec():
    value = json.loads((EXAMPLES/'constant-eastward.experiment.json').read_text(encoding='utf-8-sig'))
    # Service lifecycle coverage uses a short run; full 72h numerics are tested separately.
    value.update(durationSeconds=1800, outputStepSeconds=300)
    return value


class ServiceTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.service = ResearchService(self.temp.name)
        self.dataset = self.service.register_dataset(fixture())
        self.project = self.service.create_project({'name':'수치시험', 'question':'일정 동향류 해석해 검증'})
        self.spec = spec()
        self.spec['projectId'] = self.project['id']
        self.experiment = self.service.create_experiment({
            'projectId':self.project['id'], 'datasetId':self.dataset['id'],
            'spec':self.spec, 'name':'기준 실험'})

    def tearDown(self):
        self.service.close()
        self.temp.cleanup()

    def wait_run(self, identifier):
        for _ in range(800):
            result = self.service.get_run(identifier)
            if result['status'] in ('SUCCEEDED','FAILED','CANCELLED'):
                return result
            time.sleep(.025)
        self.fail('job failed to finish within 20s')

    def test_run_export_and_idempotency(self):
        body = {'experimentId':self.experiment['id']}
        run = self.service.submit(body,'test-one-0001')
        duplicate = self.service.submit(body,'test-one-0001')
        self.assertEqual(run['id'],duplicate['id'])
        result = self.wait_run(run['id'])
        self.assertEqual('SUCCEEDED',result['status'],result.get('error'))
        self.assertIn('trajectories',result['result'])
        raw = self.service.export(run['id'])
        with zipfile.ZipFile(io.BytesIO(raw)) as bundle:
            self.assertIn('datasets/input.json',bundle.namelist())
            for line in bundle.read('checksums.sha256').decode().splitlines():
                checksum,name = line.split('  ',1)
                self.assertEqual(checksum,hashlib.sha256(bundle.read(name)).hexdigest())
            self.assertEqual(self.spec,json.loads(bundle.read('experiment.json')))
        from research_runtime.cli import replay_bundle
        exported = Path(self.temp.name)/'reproduce.zip'
        exported.write_bytes(raw)
        self.assertTrue(replay_bundle(exported)['matched'])
        other = self.service.create_experiment({'projectId':self.project['id'],'datasetId':self.dataset['id'],'spec':self.spec})
        with self.assertRaisesRegex(ValueError,'IDEMPOTENCY_CONFLICT'):
            self.service.submit({'experimentId':other['id']},'test-one-0001')

    def test_binding_and_version_reject(self):
        bad = copy.deepcopy(self.spec); bad['datasetVersions'] = []
        with self.assertRaisesRegex(ValueError,'DATASET_BINDING_MISMATCH'):
            self.service.create_experiment({'projectId':self.project['id'],'datasetId':self.dataset['id'],'spec':bad})
        altered = fixture()
        altered['grid']['u'][0][0][0] += .1
        altered['manifest']['sha256'] = digest(altered['grid'])
        with self.assertRaisesRegex(ValueError,'DATASET_VERSION_CONFLICT'):
            self.service.register_dataset(altered)

    def test_cancel_before_commit(self):
        entered = threading.Event()
        def slow(spec,dataset,progress=None,cancelled=None):
            entered.set()
            while not cancelled():
                time.sleep(.01)
            raise InterruptedError('cancelled')
        self.service.run_model = slow
        run = self.service.submit({'experimentId':self.experiment['id']},'test-cancel-0001')
        self.assertTrue(entered.wait(2))
        self.service.cancel(run['id'])
        self.assertEqual('CANCELLED',self.wait_run(run['id'])['status'])
        with self.assertRaises(ValueError):
            self.service.export(run['id'])

    def test_restart_marks_pending_failed(self):
        run,_ = self.service.store.submit('orphan-0001','digest',{'status':'RUNNING'})
        self.service.store.fail_interrupted()
        self.assertEqual('WORKER_RESTARTED',self.service.get_run(run['id'])['error']['code'])

    def test_result_integrity(self):
        run = self.service.submit({'experimentId':self.experiment['id']},'test-hash-0001')
        self.assertEqual('SUCCEEDED',self.wait_run(run['id'])['status'])
        path = Path(self.temp.name)/'runs'/run['id']/'result.json'
        path.write_text('{}')
        with self.assertRaisesRegex(ValueError,'RESULT_INTEGRITY_FAILURE'):
            self.service.get_run(run['id'])


class HttpTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.server = Server(0,self.temp.name,seed=True)
        self.thread = threading.Thread(target=self.server.serve_forever,daemon=True)
        self.thread.start()
        self.url = 'http://127.0.0.1:'+str(self.server.server_port)

    def tearDown(self):
        self.server.shutdown(); self.server.server_close(); self.thread.join()
        self.temp.cleanup()

    def request(self,path,body=None,headers=None):
        req = urllib.request.Request(self.url+path, data=None if body is None else json.dumps(body).encode(),
                                     headers={'Content-Type':'application/json',**(headers or {})})
        return urllib.request.urlopen(req,timeout=5)

    def test_api_and_cross_origin_denied(self):
        with self.request('/api/research/health') as response:
            self.assertFalse(json.load(response)['multiUserReady'])
        with self.request('/api/research/datasets') as response:
            kinds = {item['manifest']['evidenceKind'] for item in json.load(response)['datasets']}
            self.assertIn('SYNTHETIC_TEST',kinds)
        for headers in ({'Origin':'https://evil.invalid'},{'Host':'evil.invalid'}):
            with self.assertRaises(urllib.error.HTTPError) as error:
                self.request('/api/research/projects',{'name':'bad'},headers)
            self.assertEqual(403,error.exception.code)

    def test_no_path_traversal(self):
        for path in ('/%2e%2e/services/research-runtime/research_runtime/server.py', '/v2-three/..%5c..%5cpackage.json'):
            with self.assertRaises(urllib.error.HTTPError) as error:
                self.request(path)
            self.assertEqual(403,error.exception.code)

    def test_existing_globe_link_remains_reachable(self):
        with self.request('/v2-three/') as response:
            self.assertEqual(200,response.status)
            self.assertIn('text/html',response.headers['Content-Type'])


if __name__ == '__main__':
    unittest.main()
