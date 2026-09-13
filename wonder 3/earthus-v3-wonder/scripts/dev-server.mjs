// EARTHUS V3 WONDER — 로컬 개발 정적 서버. 루트 = earthus-v3-wonder/ (기존 prototype/ 가 아니다).
// 캐시를 끈다(ES 모듈이 옛 코드를 붙들지 않게). 운영용이 아니다.
//   node scripts/dev-server.mjs [port]   → http://127.0.0.1:8790/apps/web/
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const port = Number(process.env.PORT || process.argv[2] || 8790);
const MIME = {
  '.html': 'text/html; charset=utf-8', '.mjs': 'text/javascript; charset=utf-8', '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8', '.json': 'application/json; charset=utf-8', '.svg': 'image/svg+xml',
  '.webp': 'image/webp', '.png': 'image/png', '.md': 'text/markdown; charset=utf-8', '.ts': 'text/plain; charset=utf-8',
  '.woff2': 'font/woff2', '.ico': 'image/x-icon',
};

http.createServer((req, res) => {
  const url = new URL(req.url, 'http://x');
  if (url.pathname === '/') { res.writeHead(302, { Location: '/apps/web/' }); res.end(); return; }
  let file = path.normalize(path.join(root, decodeURIComponent(url.pathname)));
  if (!file.startsWith(root)) { res.writeHead(403); res.end(); return; }
  let st = fs.existsSync(file) ? fs.statSync(file) : null;
  if (st?.isDirectory()) {
    if (!url.pathname.endsWith('/')) { res.writeHead(301, { Location: url.pathname + '/' }); res.end(); return; }
    file = path.join(file, 'index.html'); st = fs.existsSync(file) ? fs.statSync(file) : null;
  }
  if (!st) { res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' }); res.end('404 ' + url.pathname); return; }
  res.writeHead(200, {
    'Content-Type': MIME[path.extname(file).toLowerCase()] || 'application/octet-stream',
    'Content-Length': st.size,
    'Cache-Control': 'no-store, no-cache, must-revalidate, max-age=0',
  });
  fs.createReadStream(file).pipe(res);
}).listen(port, '127.0.0.1', () => console.log(`earthus-v3-wonder dev server: http://127.0.0.1:${port}/apps/web/ (root=${root})`));
