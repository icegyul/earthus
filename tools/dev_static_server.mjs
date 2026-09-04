/* 로컬 개발용 정적 서버 — prototype/ 를 지정 포트로 서빙한다.
 * Windows 로컬에는 Python이 없어 python3 -m http.server 를 대체한다.
 * 배포와 무관한 개발 편의 도구다. */
import http from 'node:http';
import https from 'node:https';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', process.env.EARTHUS_STATIC_ROOT || 'prototype');
const port = Number(process.env.PORT || process.argv[2] || 8777);
const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.webp': 'image/webp',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon',
  '.wasm': 'application/wasm',
  '.bin': 'application/octet-stream',
  '.csv': 'text/csv; charset=utf-8',
  '.txt': 'text/plain; charset=utf-8',
  '.woff2': 'font/woff2',
};

/* AETHERUS 발행 스냅샷은 저장소에 두지 않는다(1MB 넘고 계속 바뀐다).
 * 로컬 백엔드(127.0.0.1:8000)를 안 띄운 채 세 지구를 열어도 우주가 보이게,
 * /aetherus/*.json 요청이 로컬에 없으면 운영에 발행된 파일로 넘겨 준다.
 * ⚠️ 개발 편의일 뿐이다. 운영에서는 같은 출처(/aetherus/, /v2/aetherus/)에 있다. */
const SNAPSHOT_ORIGIN = process.env.EARTHUS_AETHERUS_ORIGIN || 'https://earthus.net';
const SNAPSHOT_RE = /^\/(?:v2\/)?aetherus\/([a-z]+\.json)$/;

function proxySnapshot(name, res) {
  const upstream = `${SNAPSHOT_ORIGIN}/v2/aetherus/${name}`;
  https.get(upstream, (up) => {
    if (up.statusCode !== 200) {
      up.resume();
      res.writeHead(up.statusCode || 502, { 'content-type': 'text/plain' });
      res.end(`aetherus snapshot upstream ${up.statusCode}`);
      return;
    }
    res.writeHead(200, {
      'content-type': 'application/json; charset=utf-8',
      'cache-control': 'no-cache',
      'x-earthus-proxied-from': upstream,
    });
    up.pipe(res);
  }).on('error', (error) => {
    res.writeHead(502, { 'content-type': 'text/plain' });
    res.end(String(error?.message || error));
  });
}

http.createServer((req, res) => {
  try {
    const url = new URL(req.url, `http://${req.headers.host}`);
    let file = path.normalize(path.join(root, decodeURIComponent(url.pathname)));
    if (!file.startsWith(root)) { res.writeHead(403); res.end(); return; }
    let st = fs.existsSync(file) ? fs.statSync(file) : null;
    const snap = !st && SNAPSHOT_RE.exec(url.pathname);
    if (snap) { proxySnapshot(snap[1], res); return; }
    if (st?.isDirectory()) { file = path.join(file, 'index.html'); st = fs.existsSync(file) ? fs.statSync(file) : null; }
    if (!st?.isFile()) { res.writeHead(404, { 'content-type': 'text/plain' }); res.end('404'); return; }
    res.writeHead(200, {
      'content-type': MIME[path.extname(file).toLowerCase()] || 'application/octet-stream',
      'cache-control': 'no-cache',
    });
    fs.createReadStream(file).pipe(res);
  } catch (error) {
    res.writeHead(500, { 'content-type': 'text/plain' });
    res.end(String(error?.message || error));
  }
}).listen(port, '127.0.0.1', () => console.log(`earthus static dev server: http://127.0.0.1:${port}/ (root=${root})`));
