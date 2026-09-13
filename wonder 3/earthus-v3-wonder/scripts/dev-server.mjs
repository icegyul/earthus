// EARTHUS V3 WONDER — 로컬 개발 정적 서버. 루트 = earthus-v3-wonder/ (기존 prototype/ 가 아니다).
// 캐시를 끈다(ES 모듈이 옛 코드를 붙들지 않게). 운영용이 아니다.
//   node scripts/dev-server.mjs [port]          → http://127.0.0.1:8790/apps/web/
//   node scripts/dev-server.mjs [port] --lan    → 같은 Wi-Fi 의 폰에서 http://<이 PC IP>:8790/apps/web/?qa=1 (Device Gate)
//   ⚠️ --lan 은 0.0.0.0 에 묶는다. 첫 실행 때 Windows 방화벽이 물으면 '개인 네트워크' 허용. 위치 권한은 쓰지 않으므로 HTTPS 불필요.
import http from 'node:http';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const args = process.argv.slice(2);
const lan = args.includes('--lan');
const port = Number(process.env.PORT || args.find(a => /^\d+$/.test(a)) || 8790);
const host = lan ? '0.0.0.0' : '127.0.0.1';
const lanIps = () => Object.values(os.networkInterfaces()).flat().filter(i => i && i.family === 'IPv4' && !i.internal).map(i => i.address);
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
}).listen(port, host, () => {
  console.log(`earthus-v3-wonder dev server: http://127.0.0.1:${port}/apps/web/ (root=${root})`);
  if (lan) for (const ip of lanIps()) console.log(`  폰에서: http://${ip}:${port}/apps/web/?qa=1`);
});
