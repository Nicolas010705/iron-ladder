import re, json, hashlib, pathlib
src=pathlib.Path('src-artifact.html').read_text()
out=pathlib.Path('.')
body=re.sub(r'<title>.*?</title>\s*','',src,count=1)
body=re.sub(r'<meta name="claude:viewport-fit-sides"[^>]*>\s*','',body,count=1)
ver=hashlib.sha1(src.encode()).hexdigest()[:8]
head=f'''<!doctype html>
<html lang="de">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover">
<title>Iron Ladder</title>
<meta name="description" content="Gym-Tracker mit Rängen pro Muskelgruppe, Ernährungstracking und Zielen nach Progressive Overload.">
<meta name="theme-color" content="#f2f2f7" media="(prefers-color-scheme: light)">
<meta name="theme-color" content="#000000" media="(prefers-color-scheme: dark)">
<link rel="manifest" href="/manifest.webmanifest">
<link rel="icon" href="/icon.svg" type="image/svg+xml">
<link rel="apple-touch-icon" href="/apple-touch-icon.png">
<meta name="apple-mobile-web-app-capable" content="yes">
<meta name="mobile-web-app-capable" content="yes">
<meta name="apple-mobile-web-app-title" content="Iron Ladder">
<meta name="apple-mobile-web-app-status-bar-style" content="default">
<style>:root{{color-scheme:light;padding-top:env(safe-area-inset-top,0px);padding-bottom:env(safe-area-inset-bottom,0px)}}body{{margin:0;font:14px system-ui,sans-serif}}img{{max-width:100%}}[hidden]{{display:none!important}}</style>
<script>window.IRON_STANDALONE=true;</script>
</head>
<body>
'''
tail=f'''
<script>
if('serviceWorker' in navigator){{window.addEventListener('load',()=>navigator.serviceWorker.register('/sw.js?v={ver}').catch(()=>{{}}));}}
</script>
</body>
</html>
'''
(out/'index.html').write_text(head+body+tail)
(out/'manifest.webmanifest').write_text(json.dumps({
 "name":"Iron Ladder","short_name":"Iron Ladder","lang":"de","start_url":"/","scope":"/","display":"standalone",
 "background_color":"#f2f2f7","theme_color":"#f2f2f7",
 "description":"Gym-Tracker mit Rängen pro Muskelgruppe und Ernährungstracking.",
 "icons":[{"src":"/icon-192.png","sizes":"192x192","type":"image/png"},{"src":"/icon-512.png","sizes":"512x512","type":"image/png"},
          {"src":"/icon-512.png","sizes":"512x512","type":"image/png","purpose":"maskable"},{"src":"/icon.svg","sizes":"any","type":"image/svg+xml"}]
},ensure_ascii=False,indent=1))
(out/'sw.js').write_text(f'''const CACHE='iron-ladder-{ver}';
const SHELL=['/','/manifest.webmanifest','/icon.svg','/icon-192.png'];
self.addEventListener('install',e=>{{e.waitUntil(caches.open(CACHE).then(c=>c.addAll(SHELL)).then(()=>self.skipWaiting()))}});
self.addEventListener('activate',e=>{{e.waitUntil(caches.keys().then(ks=>Promise.all(ks.filter(k=>k!==CACHE).map(k=>caches.delete(k)))).then(()=>self.clients.claim()))}});
self.addEventListener('fetch',e=>{{
 const u=new URL(e.request.url);
 if(e.request.method!=='GET') return;
 if(u.origin===location.origin){{
  e.respondWith(fetch(e.request).then(r=>{{const c=r.clone();caches.open(CACHE).then(x=>x.put(e.request,c));return r}}).catch(()=>caches.match(e.request).then(r=>r||caches.match('/'))));
 }} else if(/fonts\\.(googleapis|gstatic)\\.com$/.test(u.hostname)){{
  e.respondWith(caches.match(e.request).then(r=>r||fetch(e.request).then(res=>{{const c=res.clone();caches.open(CACHE).then(x=>x.put(e.request,c));return res}})));
 }}
}});
''')
(out/'vercel.json').write_text(json.dumps({"headers":[{"source":"/sw.js","headers":[{"key":"Cache-Control","value":"no-cache"}]},
 {"source":"/(.*)","headers":[{"key":"X-Content-Type-Options","value":"nosniff"},{"key":"Referrer-Policy","value":"strict-origin-when-cross-origin"}]}]},indent=1))
print('built',ver)
