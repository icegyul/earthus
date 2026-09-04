"""Loopback-only development server: staged static files + durable local API.
Local data and publication stay under --data; no AWS calls and no production keys.
"""
import argparse
import base64
import hashlib
import importlib.util
import json
import math
import mimetypes
import struct
import zlib
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
import threading
from urllib.parse import unquote, urlsplit

ROOT = Path(__file__).resolve().parents[2]
spec = importlib.util.spec_from_file_location('studio', ROOT / 'aws/character-studio/handler.py')
studio = importlib.util.module_from_spec(spec); spec.loader.exec_module(studio)


class LocalStore:
    def __init__(self, root):
        self.root = Path(root).resolve(); self.root.mkdir(parents=True, exist_ok=True); self.lock = threading.RLock()

    def path(self, key):
        p = (self.root / key).resolve()
        if not p.is_relative_to(self.root):
            raise studio.ApiError('잘못된 경로입니다.', 403)
        return p

    def get(self, key):
        with self.lock:
            p = self.path(key)
            if not p.is_file():
                return None, None
            data = p.read_bytes(); return data, '"' + hashlib.sha256(data).hexdigest() + '"'

    def put(self, key, body, content_type='application/json', expected='any'):
        with self.lock:
            _, actual = self.get(key)
            if expected != 'any' and expected != actual:
                raise studio.Conflict()
            p = self.path(key); p.parent.mkdir(parents=True, exist_ok=True); p.write_bytes(body)
            return self.get(key)[1]

    def list(self, prefix):
        p = self.path(prefix)
        return [str(f.relative_to(self.root)).replace('\\', '/') for f in p.rglob('*') if f.is_file()] if p.exists() else []


def png(width, height, background, shapes):
    """Deterministic PNG with no image library, so the pipeline can be driven without a paid API."""
    scanlines = []
    for y in range(height):
        row = bytearray(bytes(background) * width)
        for cx, cy, rx, ry, colour in shapes:
            if abs(y - cy) > ry:
                continue
            half = rx * math.sqrt(max(0.0, 1 - ((y - cy) / ry) ** 2))
            x0, x1 = max(0, int(cx - half)), min(width, int(cx + half) + 1)
            if x1 > x0:
                row[x0 * 4:x1 * 4] = bytes(colour) * (x1 - x0)
        scanlines.append(b'\x00' + bytes(row))

    def chunk(tag, payload):
        body = tag + payload
        return struct.pack('>I', len(payload)) + body + struct.pack('>I', zlib.crc32(body) & 0xffffffff)
    return (b'\x89PNG\r\n\x1a\n'
            + chunk(b'IHDR', struct.pack('>IIBBBBB', width, height, 8, 6, 0, 0, 0))
            + chunk(b'IDAT', zlib.compress(b''.join(scanlines), 6)) + chunk(b'IEND', b''))


# Geometric stand-ins, not artwork: each atlas part sits at a different offset inside its cell so
# the automatic crop has something real to measure.
ATLAS_PARTS = [(256, 240, 120, 110), (768, 270, 130, 190), (1290, 250, 46, 160),
               (250, 780, 46, 160), (760, 800, 52, 175), (1280, 800, 52, 175)]
PART_COLOURS = [(214, 179, 134, 255), (99, 136, 88, 255), (133, 164, 197, 255),
                (170, 120, 88, 255), (168, 139, 173, 255), (223, 162, 93, 255)]


def fake_image(character, slot, store, key):
    if slot == 'master_sheet':
        shapes = [(192 + i * 384, 512, 120, 300, PART_COLOURS[i]) for i in range(4)]
        raw = png(1536, 1024, (245, 241, 228, 255), shapes)
    elif slot == 'runtime_3q':
        raw = png(1024, 1024, (0, 0, 0, 0), [(512, 540, 210, 420, PART_COLOURS[1])])
    else:
        raw = png(1536, 1024, (0, 0, 0, 0), [(*part, PART_COLOURS[i]) for i, part in enumerate(ATLAS_PARTS)])
    return studio.png_bytes(base64.b64encode(raw).decode()), {'local_fixture': True}


def main():
    parser = argparse.ArgumentParser(); parser.add_argument('--repo', required=True); parser.add_argument('--data', default=str(ROOT / '.studio-data')); parser.add_argument('--port', type=int, default=8793)
    parser.add_argument('--fake-images', action='store_true', help='본 이미지 대신 도형 PNG로 자동 제작 흐름을 검증한다. OpenAI를 호출하지 않는다.')
    args = parser.parse_args()
    store = LocalStore(args.data); repo = Path(args.repo).resolve()
    if args.fake_images:
        studio.call_openai = fake_image
        print('[fake-images] 도형 PNG로 대체합니다. 실제 이미지 생성 품질은 검증되지 않습니다.', flush=True)

    def enqueue(job_key):
        threading.Thread(target=studio.generate_worker, args=(store, job_key), daemon=True).start()
    class Handler(BaseHTTPRequestHandler):
        def log_message(self, fmt, *values):
            pass

        def send(self, status, data, mime='application/json; charset=utf-8'):
            self.send_response(status); self.send_header('Content-Type', mime); self.send_header('Cache-Control', 'no-store'); self.end_headers(); self.wfile.write(data)

        def do_POST(self):
            if self.path != '/__character-api':
                return self.send(404, b'{}')
            if self.headers.get('Origin') not in (f'http://127.0.0.1:{args.port}', f'http://localhost:{args.port}'):
                return self.send(403, b'{"error":"Local origin required"}')
            try:
                length = int(self.headers.get('Content-Length', 0))
                if not 0 < length < 5 * 1024 * 1024:
                    raise studio.ApiError('요청 크기를 확인하세요.', 413)
                request = json.loads(self.rfile.read(length))
                result = studio.dispatch(store, request, 'local-preview', enqueue=enqueue, key_available=args.fake_images)
                self.send(200, studio.encoded(result))
            except studio.ApiError as e:
                self.send(e.status, studio.encoded({'error': str(e)}))
            except Exception as e:
                self.send(400, studio.encoded({'error': str(e)}))

        def do_GET(self):
            route = unquote(urlsplit(self.path).path)
            if route == '/':
                route = '/v3/character-studio.html'
            if route == '/v3' or route == '/v3/':
                route = '/v3/index.html'
            if route.startswith('/v3/characters/'):
                data, _ = store.get('app' + route)
                if data is not None:
                    return self.send(200, data, 'image/png' if route.endswith('.png') else 'application/json')
                if route.endswith('catalog.json'):
                    return self.send(200, b'{"schema_version":1,"characters":[]}')
            relative = route.lstrip('/').replace('v3/', 'v3-kids/', 1) if route.startswith('/v3/') else route.lstrip('/')
            if any(part.startswith('.') for part in Path(relative).parts):
                return self.send(403, b'403', 'text/plain')
            for base in (ROOT / 'prototype', repo / 'prototype'):
                p = (base / relative).resolve()
                if p.is_relative_to(base.resolve()) and p.is_file():
                    mime = 'text/javascript; charset=utf-8' if p.suffix in ('.js', '.mjs') else mimetypes.guess_type(str(p))[0] or 'application/octet-stream'
                    return self.send(200, p.read_bytes(), mime)
            self.send(404, b'404', 'text/plain')
    print(f'Character studio: http://127.0.0.1:{args.port}/v3/character-studio.html?preview=1', flush=True)
    ThreadingHTTPServer(('127.0.0.1', args.port), Handler).serve_forever()


if __name__ == '__main__':
    main()
