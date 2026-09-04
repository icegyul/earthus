"""Private paper-character workspace; only explicit publish writes public globe assets.

Lambda Function URL -> Supabase bearer authentication -> existing admins RLS.
OPENAI_API_KEY is optional. Without it all upload/edit/save/publish features work.
"""
import base64
import hashlib
import json
import math
import os
import re
import struct
import time
import urllib.error
import urllib.request
import uuid

SLOTS = ('master_sheet', 'runtime_3q', 'parts_atlas', 'thumbnail')
PRICES = {'master_sheet': .165, 'runtime_3q': .211, 'parts_atlas': .165}
PRIVATE = 'character-studio/'
PUBLIC = 'app/v3/characters/'
MAX_PNG = int(3.5 * 1024 * 1024)
MAX_GENERATIONS = 12


class ApiError(Exception):
    def __init__(self, message, status=400):
        super().__init__(message)
        self.status = status


class Conflict(ApiError):
    def __init__(self):
        super().__init__('다른 화면에서 저장한 변경이 있습니다. 서버 보관함을 다시 불러와 주세요.', 409)


class S3Store:
    def __init__(self):
        import boto3
        self.s3 = boto3.client('s3', region_name=os.environ.get('CACHE_REGION', 'us-east-2'))
        self.bucket = os.environ.get('CACHE_BUCKET', 'earthus-cache-kr')

    def get(self, key):
        try:
            r = self.s3.get_object(Bucket=self.bucket, Key=key)
            return r['Body'].read(), r['ETag']
        except self.s3.exceptions.NoSuchKey:
            return None, None
        except Exception as e:
            if getattr(e, 'response', {}).get('Error', {}).get('Code') in ('NoSuchKey', '404'):
                return None, None
            raise

    def put(self, key, body, content_type='application/json', expected='any'):
        args = dict(Bucket=self.bucket, Key=key, Body=body, ContentType=content_type,
                    CacheControl='public, max-age=60' if key.startswith(PUBLIC) else 'private, no-store')
        if expected is None:
            args['IfNoneMatch'] = '*'
        elif expected != 'any':
            args['IfMatch'] = expected
        try:
            return self.s3.put_object(**args)['ETag']
        except Exception as e:
            if getattr(e, 'response', {}).get('Error', {}).get('Code') in ('PreconditionFailed', 'ConditionalRequestConflict', '412', '409'):
                raise Conflict() from e
            raise

    def list(self, prefix):
        return [o['Key'] for o in self.s3.list_objects_v2(Bucket=self.bucket, Prefix=prefix, MaxKeys=1000).get('Contents', [])]


def encoded(value):
    return json.dumps(value, ensure_ascii=False, separators=(',', ':'), allow_nan=False).encode('utf-8')


def read_json(store, key, default=None):
    raw, revision = store.get(key)
    return (json.loads(raw) if raw else default), revision


def character_id(value):
    if not isinstance(value, str) or not re.fullmatch(r'[a-z][a-z0-9_-]{1,47}', value):
        raise ApiError('올바른 영문 캐릭터 ID가 필요합니다.')
    return value


def record_key(cid):
    return f'{PRIVATE}records/{character_id(cid)}.json'


def get_record(store, cid):
    c, rev = read_json(store, record_key(cid))
    if c is None:
        raise ApiError('저장된 캐릭터를 찾을 수 없습니다.', 404)
    return c, rev


def number(n, low, high):
    return isinstance(n, (float, int)) and not isinstance(n, bool) and math.isfinite(n) and low <= n <= high


def validate(c, complete=False):
    if not isinstance(c, dict):
        raise ApiError('캐릭터 정보가 필요합니다.')
    character_id(c.get('character_id'))
    for field, maximum in [('name', 80), ('prompt', 6000), ('region', 80), ('league', 80)]:
        if not isinstance(c.get(field), str) or len(c[field]) > maximum:
            raise ApiError(f'{field} 입력을 확인하세요.')
    if not c['name'].strip():
        raise ApiError('이름을 입력하세요.')
    placement = c.get('placement', {})
    for field, lo, hi in [('lat', -90, 90), ('lon', -180, 180), ('scale', .015, .3)]:
        if not number(placement.get(field), lo, hi):
            raise ApiError('배치 좌표 또는 크기가 잘못되었습니다.')
    lod = c.get('lod', {})
    if not number(lod.get('exit_px'), 20, 400) or not number(lod.get('enter_px'), 30, 500) or lod['enter_px'] <= lod['exit_px']:
        raise ApiError('거리별 표시 기준을 확인하세요.')
    if c.get('motion') not in ('breathe', 'sway', 'wave', 'still'):
        raise ApiError('지원하지 않는 동작입니다.')
    layers = c.get('layers')
    if not isinstance(layers, list) or not 3 <= len(layers) <= 7:
        raise ApiError('파츠는 3~7개여야 합니다.')
    ids = set()
    for p in layers:
        if not isinstance(p, dict) or not re.fullmatch(r'[a-z][a-z0-9_]{0,31}', str(p.get('id', ''))) or p['id'] in ids:
            raise ApiError('파츠 ID가 잘못되었습니다.')
        ids.add(p['id'])
        rect, pivot = p.get('rect'), p.get('pivot')
        if not isinstance(rect, list) or len(rect) != 4 or not all(number(v, 0, 1) for v in rect) or rect[2] <= 0 or rect[3] <= 0 or rect[0] + rect[2] > 1.000001 or rect[1] + rect[3] > 1.000001:
            raise ApiError('파츠 자르기 영역이 잘못되었습니다.')
        if not isinstance(pivot, list) or len(pivot) != 2 or not all(number(v, 0, 1) for v in pivot):
            raise ApiError('파츠 회전 중심이 잘못되었습니다.')
        for key, lo, hi in [('x', -2, 2), ('y', -1, 3), ('width', .01, 2), ('height', .01, 2), ('depth', -.2, .2), ('rotation', -180, 180)]:
            if not number(p.get(key), lo, hi):
                raise ApiError('파츠 위치 또는 크기가 잘못되었습니다.')
    if not isinstance(c.get('assets'), dict) or not isinstance(c.get('hashes'), dict) or not isinstance(c.get('approvals'), dict) or not isinstance(c.get('references'), dict):
        raise ApiError('제작 파일 정보가 잘못되었습니다.')
    if complete:
        if any(not c['assets'].get(s) for s in SLOTS):
            raise ApiError('이미지 4종을 모두 준비하세요.')
        if not c['hashes'].get('master_sheet') or c['approvals'].get('master') != c['hashes']['master_sheet']:
            raise ApiError('디자인 시트를 확정하세요.')
        if c['references'].get('runtime_3q') != c['hashes']['master_sheet'] or c['references'].get('parts_atlas') != c['hashes'].get('runtime_3q'):
            raise ApiError('현재 기준 이미지로 파츠를 다시 준비하세요.')
        if c['approvals'].get('motion') is not True:
            raise ApiError('파츠와 움직임을 먼저 확인하세요.')


def png_bytes(png):
    if not isinstance(png, str) or len(png) > MAX_PNG * 1.34 + 10:
        raise ApiError('PNG는 3.5MB 이하여야 합니다.')
    try:
        raw = base64.b64decode(png, validate=True)
    except Exception as e:
        raise ApiError('이미지 인코딩이 잘못되었습니다.') from e
    if len(raw) < 33 or len(raw) > MAX_PNG or raw[:8] != b'\x89PNG\r\n\x1a\n' or raw[12:16] != b'IHDR':
        raise ApiError('PNG 이미지가 필요합니다.')
    w, h = struct.unpack('>II', raw[16:24])
    if not 32 <= w <= 4096 or not 32 <= h <= 4096:
        raise ApiError('이미지 크기는 32~4096px여야 합니다.')
    return raw


def put_asset(store, cid, slot, raw):
    if slot not in SLOTS:
        raise ApiError('알 수 없는 파일 종류입니다.')
    digest = hashlib.sha256(raw).hexdigest()
    key = f'{PRIVATE}assets/{cid}/{digest}.png'
    store.put(key, raw, 'image/png')
    return {'key': key, 'hash': digest}


def asset_bytes(store, cid, asset):
    if not isinstance(asset, dict) or not re.fullmatch(r'[a-f0-9]{64}', str(asset.get('hash', ''))):
        raise ApiError('이미지 정보가 잘못되었습니다.')
    key = f'{PRIVATE}assets/{cid}/{asset["hash"]}.png'
    if asset.get('key') != key:
        raise ApiError('다른 캐릭터의 이미지에는 접근할 수 없습니다.', 403)
    raw, _ = store.get(key)
    if raw is None or hashlib.sha256(raw).hexdigest() != asset['hash']:
        raise ApiError('저장된 이미지가 없거나 손상되었습니다.', 404)
    return raw


def manifest(c):
    result = {k: c[k] for k in ('character_id', 'name', 'prompt', 'region', 'league', 'placement', 'motion', 'lod', 'layers', 'updated_at')}
    result.update(schema_version=1, direction='surface-normal-camera-facing', shadow={'type': 'ellipse', 'opacity': .22})
    cid = c['character_id']
    result['files'] = {s: f'{cid}_{s}.png' for s in SLOTS}
    result['files']['manifest'] = f'{cid}_manifest.json'
    return result


def update_catalog(store, cid, entry):
    for _ in range(5):
        data, revision = read_json(store, PUBLIC + 'catalog.json', {'schema_version': 1, 'characters': []})
        rows = [r for r in data['characters'] if r['character_id'] != cid]
        if entry:
            rows.append(entry)
        if len(rows) > 200:
            raise ApiError('공개 캐릭터는 최대 200개입니다.')
        data['characters'] = rows
        try:
            store.put(PUBLIC + 'catalog.json', encoded(data), expected=revision)
            return
        except Conflict:
            continue
    raise Conflict()


def image_key():
    if os.environ.get('OPENAI_API_KEY'):
        return os.environ['OPENAI_API_KEY']
    path = os.environ.get('OPENAI_KEY_PARAMETER')
    if not path:
        return None
    import boto3
    try:
        return boto3.client('ssm').get_parameter(Name=path, WithDecryption=True)['Parameter']['Value']
    except Exception as e:
        if getattr(e, 'response', {}).get('Error', {}).get('Code') == 'ParameterNotFound':
            return None
        raise ApiError('이미지 생성 키 저장소를 확인하지 못했습니다.', 503) from e


def prompt_for(c, slot):
    text = f"Create a 2.5D layered paper picture-book character named {c['name']}. {c['prompt']}\nSoft paper texture, clean silhouette, no text, no watermark, no ground or cast shadow. Full body with padding. Keep the exact identity, colors and proportions of references. "
    if slot == 'master_sheet':
        return text + 'Four separate evenly spaced columns: front, left side, back, three-quarter view. Plain ivory background. Design reference sheet only.'
    if slot == 'runtime_3q':
        return text + 'One single three-quarter-view full-body character on true transparent alpha background. No painted checkerboard. Use approved design sheet as sole identity reference.'
    return text + 'Exploded paper puppet atlas, true transparent alpha. Exact 3-column by 2-row grid: top row head, torso, character left arm; bottom row character right arm, left leg, right leg. Detached parts with padding inside each cell, no labels, no assembled character. Same three-quarter view. Paint hidden overlaps without holes.'


def call_openai(c, slot, store, key):
    fields = dict(model='gpt-image-2', prompt=prompt_for(c, slot), quality='high', size='1024x1024' if slot == 'runtime_3q' else '1536x1024', output_format='png', background='opaque' if slot == 'master_sheet' else 'transparent')
    headers = {'Authorization': 'Bearer ' + key}
    if slot == 'master_sheet':
        body = encoded(fields); headers['Content-Type'] = 'application/json'; route = 'generations'
    else:
        boundary = 'earthus' + uuid.uuid4().hex
        parts = []
        for name, value in fields.items():
            parts.append(f'--{boundary}\r\nContent-Disposition: form-data; name="{name}"\r\n\r\n{value}\r\n'.encode())
        source = 'master_sheet' if slot == 'runtime_3q' else 'runtime_3q'
        raw = asset_bytes(store, c['character_id'], c['assets'][source])
        parts.extend([f'--{boundary}\r\nContent-Disposition: form-data; name="image"; filename="reference.png"\r\nContent-Type: image/png\r\n\r\n'.encode(), raw, f'\r\n--{boundary}--\r\n'.encode()])
        body = b''.join(parts); headers['Content-Type'] = 'multipart/form-data; boundary=' + boundary; route = 'edits'
    request = urllib.request.Request('https://api.openai.com/v1/images/' + route, data=body, headers=headers)
    try:
        with urllib.request.urlopen(request, timeout=230) as response:
            result = json.load(response)
        return png_bytes(result['data'][0]['b64_json']), result.get('usage')
    except urllib.error.HTTPError as e:
        # Do not relay provider response bodies: they can contain private prompts or credentials.
        raise ApiError(f'이미지 생성 요청이 실패했습니다 ({e.code}). 결제·한도·프롬프트를 확인해 주세요.', 502) from e


def generate_worker(store, job_key):
    job, revision = read_json(store, job_key)
    if not job or job.get('status') != 'queued':
        return
    job['status'] = 'running'
    try:
        store.put(job_key, encoded(job), expected=revision)
    except Conflict:
        return  # Lambda asynchronous retries must never repeat a paid generation.
    try:
        raw, usage = call_openai(job['character'], job['slot'], store, image_key())
        job.update(status='complete', asset=put_asset(store, job['character_id'], job['slot'], raw), usage=usage)
    except Exception as e:
        job.update(status='failed', error=str(e) if isinstance(e, ApiError) else '이미지 생성이 완료되지 않았습니다. 작업 상태를 확인하고 다시 시도하세요.')
    job.pop('character', None)
    job['finished_at'] = time.time()
    store.put(job_key, encoded(job))


def dispatch(store, request, user_id, enqueue=None, key_available=None):
    action = request.get('action')
    if action == 'status':
        return {'image_generation_ready': bool(image_key()) if key_available is None else key_available, 'max_generations': MAX_GENERATIONS}
    if action == 'list':
        return {'characters': [k.rsplit('/', 1)[-1][:-5] for k in store.list(PRIVATE + 'records/') if k.endswith('.json')]}
    cid = character_id(request.get('character_id') or request.get('character', {}).get('character_id'))
    if action == 'asset_put':
        raw = png_bytes(request.get('png'))
        return put_asset(store, cid, request.get('slot'), raw)
    if action == 'asset_get':
        return {'png': base64.b64encode(asset_bytes(store, cid, request.get('asset'))).decode()}
    if action == 'save':
        c = request.get('character'); validate(c)
        publication, _ = read_json(store, f'{PRIVATE}publishing/{cid}.json')
        if publication and publication.get('until', 0) > time.time():
            raise ApiError('지구에 적용 중입니다. 잠시 후 저장하세요.', 409)
        previous, revision = read_json(store, record_key(cid))
        if request.get('revision') != revision:
            raise Conflict()
        for slot, asset in c['assets'].items():
            if slot not in SLOTS:
                raise ApiError('알 수 없는 파일 종류입니다.')
            asset_bytes(store, cid, asset)
            if c['hashes'].get(slot) != asset['hash']:
                raise ApiError('이미지와 해시가 일치하지 않습니다.')
        for key in ('generation_count', 'estimated_output_usd', 'published_revision', 'last_job_id'):
            c[key] = (previous or {}).get(key, 0 if key in ('generation_count', 'estimated_output_usd') else None)
        c.pop('server_revision', None); c['updated_by'] = user_id
        revision = store.put(record_key(cid), encoded(c), expected=revision)
        return {'revision': revision, 'generation_count': c['generation_count'], 'estimated_output_usd': c['estimated_output_usd']}
    c, revision = get_record(store, cid)
    if action == 'get':
        return {'character': c, 'revision': revision}
    if action in ('publish', 'unpublish'):
        if request.get('revision') != revision:
            raise Conflict()
        # Serialize publication of a character, including a stale-reader retry.
        lock = f'{PRIVATE}publishing/{cid}.json'
        lock_data, lock_rev = read_json(store, lock)
        if lock_data and lock_data.get('until', 0) > time.time():
            raise ApiError('이 캐릭터를 적용 중입니다. 잠시 후 다시 시도하세요.', 409)
        held = store.put(lock, encoded({'until': time.time() + 120}), expected=lock_rev)
        try:
            c['_publication_nonce'] = uuid.uuid4().hex
            revision = store.put(record_key(cid), encoded(c), expected=revision)
            if action == 'publish':
                validate(c, complete=True); m = manifest(c); version = uuid.uuid4().hex
                prefix = f'{PUBLIC}{cid}/versions/{version}/'
                for slot in SLOTS:
                    raw = asset_bytes(store, cid, c['assets'][slot])
                    store.put(prefix + m['files'][slot], raw, 'image/png')
                    store.put(f'{PUBLIC}{cid}/' + m['files'][slot], raw, 'image/png')
                store.put(prefix + m['files']['manifest'], encoded(m))
                store.put(f'{PUBLIC}{cid}/' + m['files']['manifest'], encoded(m))
                entry = {'character_id': cid, 'name': c['name'], 'placement': c['placement'], 'manifest': f'{cid}/versions/{version}/{m["files"]["manifest"]}'}
                update_catalog(store, cid, entry); c['published_revision'] = version
            else:
                update_catalog(store, cid, None); c['published_revision'] = None
            c.pop('_publication_nonce', None)
            revision = store.put(record_key(cid), encoded(c), expected=revision)
            return {'revision': revision, 'published_revision': c['published_revision']}
        finally:
            store.put(lock, encoded({'until': 0}), expected=held)
    if action == 'generate':
        slot = request.get('slot'); request_id = request.get('request_id', '')
        if slot not in PRICES or not re.fullmatch(r'[a-f0-9-]{36}', request_id):
            raise ApiError('생성 요청이 잘못되었습니다.')
        job_key = f'{PRIVATE}jobs/{cid}/{request_id}.json'
        old, _ = read_json(store, job_key)
        if old:
            return {'job_id': request_id, 'status': old['status']}
        if not (bool(image_key()) if key_available is None else key_available):
            raise ApiError('이미지 생성 API 키를 연결하면 사용할 수 있습니다.', 503)
        if not c['prompt'].strip():
            raise ApiError('제작 설명을 입력하세요.')
        if slot != 'master_sheet' and (not c['hashes'].get('master_sheet') or c['approvals'].get('master') != c['hashes']['master_sheet']):
            raise ApiError('디자인 시트를 먼저 확정하세요.')
        if slot == 'parts_atlas' and (not c['assets'].get('runtime_3q') or c['references'].get('runtime_3q') != c['hashes']['master_sheet']):
            raise ApiError('현재 디자인의 단일 이미지를 먼저 준비하세요.')
        if c.get('generation_count', 0) >= MAX_GENERATIONS:
            raise ApiError('이 캐릭터의 생성 한도 12회에 도달했습니다.', 429)
        job = dict(character_id=cid, slot=slot, status='reserving', created_at=time.time(), requested_by=user_id)
        try:
            job_revision = store.put(job_key, encoded(job), expected=None)
        except Conflict:
            return {'job_id': request_id, 'status': 'queued'}
        try:
            c['generation_count'] = c.get('generation_count', 0) + 1
            c['estimated_output_usd'] = round(c.get('estimated_output_usd', 0) + PRICES[slot], 5)
            c['last_job_id'] = request_id
            reserved_revision = store.put(record_key(cid), encoded(c), expected=revision)
            job.update(status='queued', character=c, record_revision=reserved_revision)
            store.put(job_key, encoded(job), expected=job_revision)
            enqueue(job_key)
        except Exception:
            job.update(status='failed', error='작업을 시작하지 못했습니다. 상태를 확인하고 새 요청으로 시도하세요.'); job.pop('character', None); store.put(job_key, encoded(job))
            raise
        return {'job_id': request_id, 'status': 'queued'}
    if action == 'job':
        jid = request.get('job_id', '')
        if not re.fullmatch(r'[a-f0-9-]{36}', jid):
            raise ApiError('작업 ID가 잘못되었습니다.')
        job, _ = read_json(store, f'{PRIVATE}jobs/{cid}/{jid}.json')
        if job is None:
            raise ApiError('작업을 찾을 수 없습니다.', 404)
        if job['status'] in ('reserving', 'queued', 'running') and time.time() - job['created_at'] > 600:
            job.update(status='failed', error='작업 제한 시간이 지났습니다. 생성 결과가 늦게 도착할 수 있으므로 사용량을 확인한 뒤 다시 시도하세요.')
        return {k: v for k, v in job.items() if k != 'character'}
    raise ApiError('지원하지 않는 작업입니다.', 404)


def authenticate(headers):
    token = headers.get('authorization', '')
    if not token.startswith('Bearer ') or len(token) > 10000:
        raise ApiError('관리자 로그인이 필요합니다.', 401)
    url, anon = os.environ.get('SUPABASE_URL', ''), os.environ.get('SUPABASE_ANON_KEY', '')
    if not url.startswith('https://') or not anon:
        raise ApiError('관리자 인증 설정을 준비 중입니다.', 503)
    auth_headers = {'Authorization': token, 'apikey': anon}
    try:
        with urllib.request.urlopen(urllib.request.Request(url.rstrip('/') + '/auth/v1/user', headers=auth_headers), timeout=10) as r:
            user = json.load(r)
        uid = user.get('id', '')
        if not re.fullmatch(r'[a-f0-9-]{36}', uid):
            raise ApiError('로그인을 다시 확인하세요.', 401)
        with urllib.request.urlopen(urllib.request.Request(url.rstrip('/') + f'/rest/v1/admins?select=id&id=eq.{uid}', headers=auth_headers), timeout=10) as r:
            admins = json.load(r)
        if not isinstance(admins, list) or not any(a.get('id') == uid for a in admins):
            raise ApiError('관리자 권한이 없습니다.', 403)
        return uid
    except urllib.error.HTTPError as e:
        raise ApiError('관리자 인증에 실패했습니다.', 401 if e.code == 401 else 403) from e


def handler(event, context):
    # Only an IAM-authorized self-invocation can reach this branch; URL payloads remain inside body.
    if 'worker_job' in event and 'requestContext' not in event:
        generate_worker(S3Store(), event['worker_job']); return {'ok': True}
    headers = {k.lower(): v for k, v in event.get('headers', {}).items()}
    origin = headers.get('origin', '')
    response_headers = {'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store'}
    if origin == os.environ.get('ALLOWED_ORIGIN', 'https://earthus.net'):
        response_headers.update({'Access-Control-Allow-Origin': origin, 'Access-Control-Allow-Headers': 'content-type,authorization', 'Access-Control-Allow-Methods': 'POST,OPTIONS', 'Vary': 'Origin'})
    try:
        method = event.get('requestContext', {}).get('http', {}).get('method', '')
        if method == 'OPTIONS':
            return {'statusCode': 204, 'headers': response_headers, 'body': ''}
        if method != 'POST':
            raise ApiError('POST 요청만 지원합니다.', 405)
        uid = authenticate(headers)
        raw = event.get('body') or ''
        if len(raw) > 5 * 1024 * 1024:
            raise ApiError('요청이 너무 큽니다.', 413)
        if event.get('isBase64Encoded'):
            raw = base64.b64decode(raw)
        request = json.loads(raw)
        if not isinstance(request, dict):
            raise ApiError('요청 형식이 잘못되었습니다.')
        def enqueue(key):
            import boto3
            boto3.client('lambda').invoke(FunctionName=context.invoked_function_arn, InvocationType='Event', Payload=encoded({'worker_job': key}))
        result = dispatch(S3Store(), request, uid, enqueue)
        return {'statusCode': 200, 'headers': response_headers, 'body': encoded(result).decode()}
    except ApiError as e:
        return {'statusCode': e.status, 'headers': response_headers, 'body': encoded({'error': str(e)}).decode()}
    except (ValueError, KeyError, TypeError):
        return {'statusCode': 400, 'headers': response_headers, 'body': encoded({'error': '요청 정보를 확인하세요.'}).decode()}
    except Exception:
        return {'statusCode': 503, 'headers': response_headers, 'body': encoded({'error': '제작 서버가 요청을 완료하지 못했습니다. 잠시 후 다시 시도하세요.'}).decode()}
