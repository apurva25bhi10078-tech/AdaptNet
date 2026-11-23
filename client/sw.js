// Caches the app so it opens even with no connection (needs https or localhost)
const C='adaptnet-v1',SHELL=['/','/index.html','/dashboard.html','/camp.html','/style.css','/manifest.json','/vendor/leaflet.js','/vendor/leaflet.css','/socket.io/socket.io.js'];
self.addEventListener('install',e=>e.waitUntil(caches.open(C).then(c=>c.addAll(SHELL)).then(()=>self.skipWaiting())));
self.addEventListener('activate',e=>e.waitUntil(caches.keys().then(k=>Promise.all(k.filter(x=>x!==C).map(x=>caches.delete(x)))).then(()=>self.clients.claim())));
self.addEventListener('fetch',e=>{
  const u=new URL(e.request.url);
  if(e.request.method!=='GET'||u.origin!==location.origin||u.pathname.startsWith('/api')||(u.pathname.startsWith('/socket.io')&&!u.pathname.endsWith('.js')))return;
  e.respondWith(fetch(e.request).then(r=>{const cp=r.clone();caches.open(C).then(c=>c.put(e.request,cp));return r}).catch(()=>caches.match(e.request)));
});
