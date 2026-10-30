// MedAtlas 3.0: só arquivos públicos; jamais cachear credenciais ou requisições de autenticação.
const CACHE='estudnexa-shell-v4-0-20261030';
const PREFIXES=['medatlas-shell-','sinapelia-shell-','estudnexa-shell-'];
const SHELL=['./','./index.html','./app.js','./community.js','./auth.js','./styles.css','./manifest.webmanifest','./icon-192.png','./icon-512.png','./privacidade.html','./config.js'];
self.addEventListener('install',e=>e.waitUntil(caches.open(CACHE).then(c=>c.addAll(SHELL)).then(()=>self.skipWaiting())));
self.addEventListener('activate',e=>e.waitUntil(caches.keys().then(keys=>Promise.all(keys.filter(k=>PREFIXES.some(pre=>k.startsWith(pre))&&k!==CACHE).map(k=>caches.delete(k)))).then(()=>self.clients.claim())));
self.addEventListener('fetch',e=>{
 const req=e.request,u=new URL(req.url);
 if(req.method!=='GET'||u.origin!==self.location.origin) return;
 if(u.pathname.endsWith('/config.js')){e.respondWith(fetch(req).catch(()=>caches.match(req)));return;}
 if(req.mode==='navigate'){e.respondWith(fetch(req).then(r=>{if(r.ok){const cp=r.clone();e.waitUntil(caches.open(CACHE).then(c=>c.put(new URL('./index.html',self.registration.scope).href,cp)));}return r;}).catch(()=>caches.match(new URL('./index.html',self.registration.scope).href)));return;}
 e.respondWith(caches.match(req).then(hit=>hit||fetch(req).then(r=>{if(r.ok){const cp=r.clone();e.waitUntil(caches.open(CACHE).then(c=>c.put(req,cp)));}return r;})));
});
