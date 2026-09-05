"""Small standard-library SDK for the loopback research API."""
import json
import uuid
from urllib.parse import urlsplit
from urllib.request import Request, urlopen


class ResearchClient:
    def __init__(self, base_url='http://127.0.0.1:8788'):
        url = urlsplit(base_url)
        if url.scheme != 'http' or url.hostname not in ('127.0.0.1','localhost') or url.username or url.password:
            raise ValueError('This SDK release supports the local single-user server only.')
        self.base_url = base_url.rstrip('/') + '/api/research'

    def request(self, path, body=None, idempotency_key=None):
        headers = {'Content-Type':'application/json'}
        if idempotency_key:
            headers['Idempotency-Key'] = idempotency_key
        req = Request(self.base_url + path, headers=headers,
                      data=None if body is None else json.dumps(body,allow_nan=False).encode())
        with urlopen(req,timeout=30) as response:
            return json.load(response)

    def datasets(self):
        return self.request('/datasets')['datasets']

    def register_dataset(self, dataset):
        return self.request('/datasets',dataset)['dataset']

    def project(self, name, question=''):
        return self.request('/projects',{'name':name,'question':question})['project']

    def experiment(self, project_id, dataset_id, spec, name='표류 실험'):
        return self.request('/experiments',{'projectId':project_id,'datasetId':dataset_id,'spec':spec,'name':name})['experiment']

    def preflight(self, experiment_id):
        return self.request(f'/experiments/{experiment_id}/preflight',{})['preflight']

    def run(self, experiment_id, idempotency_key=None):
        return self.request('/runs',{'experimentId':experiment_id},idempotency_key or str(uuid.uuid4()))['run']

    def status(self, run_id):
        return self.request(f'/runs/{run_id}')['run']

    def cancel(self, run_id):
        return self.request(f'/runs/{run_id}/cancel',{})['run']

    def compare(self, run_ids):
        return self.request('/comparisons',{'runIds':run_ids})['comparison']

    def export(self, run_id, destination):
        with urlopen(self.base_url+f'/runs/{run_id}/export',timeout=30) as response:
            data = response.read()
        from pathlib import Path
        path = Path(destination)
        # Do not overwrite another experiment archive by accident.
        with path.open('xb') as output:
            output.write(data)
        return path
