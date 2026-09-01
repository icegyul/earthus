const CACHE='aetherus-shell-v0.6-visual-recovery-20260831';
const STATIC=['/app/','/app/styles.css','/app/i18n.js','/app/earth-texture.js','/app/visual-engine.js','/app/app.js','/app/assets/aetherus-icon.svg'];
self.addEventListener('install',e=>e.waitUntil(caches.open(CACHE).then(c=>c.addAll(STATIC)).then(()=>self.skipWaiting())));
self.addEventListener('activate',e=>e.waitUntil(caches.keys().then(keys=>Promise.all(keys.filter(k=>k!==CACHE).map(k=>caches.delete(k)))).then(()=>self.clients.claim())));
self.addEventListener('fetch',e=>{
  const u=new URL(e.request.url);
  if(e.request.method!=='GET'||u.pathname.startsWith('/v1/')||u.pathname.startsWith('/internal/'))return;
  if(u.pathname.startsWith('/app/'))e.respondWith(caches.match(e.request).then(hit=>hit||fetch(e.request)));
});
