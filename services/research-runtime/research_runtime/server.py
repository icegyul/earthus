"""Loopback-only research workbench. Not a multi-user/public production server."""
from __future__ import annotations

import argparse
import json
import mimetypes
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from urllib.parse import unquote, urlsplit

from .service import ResearchService, canonical

MAX_BODY = 24 * 1024 * 1024


class Server(ThreadingHTTPServer):
    daemon_threads = True

    def __init__(self, port, directory, seed=True):
        self.service = None
        # Bind first: an occupied port must not trigger metadata recovery or mutate jobs.
        super().__init__(('127.0.0.1', port), Handler)
        self.prototype = Path(__file__).resolve().parents[3] / 'prototype'
        try:
            self.service = ResearchService(directory)
            if seed:
                for filename in ('constant-eastward.dataset.json','hycom-2015-atlantic.dataset.json'):
                    path = Path(__file__).resolve().parents[1] / 'examples' / filename
                    if path.exists():
                        self.service.register_dataset(json.loads(path.read_text(encoding='utf-8-sig')))
        except Exception:
            self.server_close()
            raise

    def server_close(self):
        super().server_close()
        if self.service is not None:
            self.service.close()


class Handler(BaseHTTPRequestHandler):
    server_version = 'EARTHUSResearch/0.1'

    def log_message(self, fmt, *args):
        # Never log request bodies (coordinates may be private).
        print('%s %s' % (self.log_date_time_string(), fmt % args), flush=True)

    def respond(self, status, payload, content_type='application/json; charset=utf-8', headers=None):
        raw = payload if isinstance(payload, bytes) else canonical(payload)
        self.send_response(status)
        self.send_header('Content-Type', content_type)
        self.send_header('Content-Length', str(len(raw)))
        self.send_header('Cache-Control', 'no-store')
        self.send_header('X-Content-Type-Options', 'nosniff')
        self.send_header('Referrer-Policy', 'same-origin')
        for key, value in (headers or {}).items():
            self.send_header(key,value)
        self.end_headers()
        try:
            self.wfile.write(raw)
        except (BrokenPipeError, ConnectionResetError):
            pass

    def _check_local(self, mutation=False):
        expected = {f'127.0.0.1:{self.server.server_port}', f'localhost:{self.server.server_port}'}
        if self.headers.get('Host') not in expected:
            raise PermissionError('LOCAL_HOST_REQUIRED')
        origin = self.headers.get('Origin')
        if origin is not None and origin not in {'http://' + host for host in expected}:
            raise PermissionError('SAME_ORIGIN_REQUIRED')
        if self.headers.get('Sec-Fetch-Site') == 'cross-site':
            raise PermissionError('SAME_ORIGIN_REQUIRED')
        if mutation and self.headers.get('Content-Type','').split(';')[0] != 'application/json':
            raise ValueError('Content-Type application/json이 필요합니다.')

    def body(self):
        try:
            size = int(self.headers.get('Content-Length','0'))
        except ValueError as error:
            raise ValueError('INVALID_CONTENT_LENGTH') from error
        if not 0 < size <= MAX_BODY:
            raise ValueError('BODY_SIZE_LIMIT')
        raw = self.rfile.read(size)
        if len(raw) != size:
            raise ValueError('INCOMPLETE_BODY')
        body = json.loads(raw.decode('utf-8'), parse_constant=lambda x: (_ for _ in ()).throw(ValueError('NON_FINITE_JSON')))
        if not isinstance(body, dict):
            raise ValueError('JSON 객체가 필요합니다.')
        return body

    def do_GET(self):
        self._dispatch('GET')

    def do_POST(self):
        self._dispatch('POST')

    def _dispatch(self, method):
        try:
            self._check_local(method == 'POST')
            path = urlsplit(self.path).path
            if not path.startswith('/api/research/'):
                if method != 'GET':
                    return self.respond(405, {'error': 'METHOD_NOT_ALLOWED'})
                return self.static(path)
            s = self.server.service
            parts = path.removeprefix('/api/research/').strip('/').split('/')
            body = self.body() if method == 'POST' else None
            if parts == ['health'] and method == 'GET':
                return self.respond(200, {'status':'ok', 'mode':'LOCAL_SINGLE_USER', 'multiUserReady':False,
                                          'productionReady':False, 'apiVersion':'0.1.0'})
            if parts == ['datasets','validate'] and method == 'POST':
                try:
                    dataset = s.validate_dataset(body.get('dataset',body))
                    return self.respond(200, {'ok':True, 'manifest':dataset['manifest']})
                except ValueError as error:
                    return self.respond(422, {'ok':False, 'errors':[str(error)]})
            if parts == ['datasets']:
                if method == 'GET':
                    return self.respond(200, {'datasets':s.dataset_index()})
                dataset = s.register_dataset(body.get('dataset',body))
                return self.respond(201, {'dataset':{k:v for k,v in dataset.items() if k != 'document'}})
            if len(parts) == 2 and parts[0] == 'datasets' and method == 'GET':
                return self.respond(200, {'dataset':s.store.get('dataset',parts[1])})
            if parts == ['projects']:
                return self.respond(200, {'projects':s.store.list('project')}) if method == 'GET' else self.respond(201, {'project':s.create_project(body)})
            if parts == ['experiments']:
                return self.respond(200, {'experiments':s.store.list('experiment')}) if method == 'GET' else self.respond(201, {'experiment':s.create_experiment(body)})
            if len(parts) == 3 and parts[0] == 'experiments' and parts[2] == 'preflight' and method == 'POST':
                return self.respond(200, {'preflight':s.preflight(s.store.get('experiment',parts[1]))})
            if parts == ['runs']:
                if method == 'GET':
                    return self.respond(200, {'runs':s.store.list('run')})
                return self.respond(202, {'run':s.submit(body,self.headers.get('Idempotency-Key'))})
            if len(parts) >= 2 and parts[0] == 'runs':
                identifier = parts[1]
                if len(parts) == 2 and method == 'GET':
                    return self.respond(200, {'run':s.get_run(identifier)})
                if len(parts) == 3 and parts[2] == 'cancel' and method == 'POST':
                    return self.respond(200, {'run':s.cancel(identifier)})
                if len(parts) == 3 and parts[2] == 'export' and method == 'GET':
                    return self.respond(200, s.export(identifier), 'application/zip',
                                        {'Content-Disposition':f'attachment; filename="earthus-{identifier}.zip"'})
                if len(parts) == 3 and parts[2] == 'artifacts' and method == 'GET':
                    run = s.get_run(identifier,False)
                    artifacts = [] if run['status'] != 'SUCCEEDED' else [
                        {'name':'result.json','url':f'/api/research/runs/{identifier}/result'},
                        {'name':'experiment.zip','url':f'/api/research/runs/{identifier}/export'}]
                    return self.respond(200, {'artifacts':artifacts})
                if len(parts) == 3 and parts[2] == 'result' and method == 'GET':
                    run = s.get_run(identifier)
                    if run['status'] != 'SUCCEEDED':
                        raise ValueError('RESULT_NOT_READY')
                    return self.respond(200,run['result'])
            if parts == ['comparisons'] and method == 'POST':
                return self.respond(200, {'comparison':s.comparison(body.get('runIds'))})
            return self.respond(404, {'error':'NOT_FOUND'})
        except PermissionError as error:
            self.respond(403, {'error':str(error)})
        except KeyError as error:
            self.respond(404, {'error':str(error)})
        except (ValueError, TypeError, UnicodeDecodeError) as error:
            self.respond(422, {'error':str(error)[:6000]})
        except Exception as error:
            self.log_message('request failed: %s', type(error).__name__)
            self.respond(500, {'error':'INTERNAL_ERROR', 'message':'요청 처리에 실패했습니다. 실행 상태를 확인하세요.'})

    def static(self, path):
        if path in ('/', '/research', '/research/'):
            self.send_response(302)
            self.send_header('Location','/v2-three/research.html')
            self.send_header('Content-Length','0')
            self.end_headers()
            return
        relative = unquote(path).lstrip('/')
        if '\\' in relative or any(p.startswith('.') for p in Path(relative).parts):
            raise PermissionError('INVALID_PATH')
        root = self.server.prototype.resolve()
        target = (root / relative).resolve()
        if not target.is_relative_to(root):
            raise PermissionError('INVALID_PATH')
        if target.is_dir():
            target = (target / 'index.html').resolve()
            if not target.is_relative_to(root):
                raise PermissionError('INVALID_PATH')
        if not target.is_file():
            return self.respond(404, {'error':'FILE_NOT_FOUND'})
        content_type = mimetypes.guess_type(target.name)[0] or 'application/octet-stream'
        if target.suffix in ('.js','.mjs'):
            content_type = 'text/javascript; charset=utf-8'
        self.respond(200,target.read_bytes(),content_type)


def main():
    parser = argparse.ArgumentParser(description='EARTHUS local research workbench (loopback only)')
    parser.add_argument('--port',type=int,default=8788)
    parser.add_argument('--data-dir',default=str(Path(__file__).resolve().parents[1]/'.local-data'))
    parser.add_argument('--no-seed',action='store_true')
    args = parser.parse_args()
    server = Server(args.port,args.data_dir,not args.no_seed)
    print(f'EARTHUS Research: http://127.0.0.1:{server.server_port}/v2-three/research.html',flush=True)
    print('Local single-user only. Observational validation is reported separately.',flush=True)
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        pass
    finally:
        server.server_close()


if __name__ == '__main__':
    main()
