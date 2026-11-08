import re, json, hashlib, pathlib
src=pathlib.Path('src-artifact.html').read_text()
out=pathlib.Path('.')
body=re.sub(r'<title>.*?</title>\s*','',src,count=1)
body=re.sub(r'<meta name="claude:viewport-fit-sides"[^>]*>\s*','',body,count=1)
# Inter selbst ausliefern statt von Google Fonts (Datenschutz, offline)
body=re.sub(r'<link rel="preconnect" href="https://fonts\.(googleapis|gstatic)\.com"[^>]*>\s*','',body)
body=re.sub(r'<link rel="stylesheet" href="https://fonts\.googleapis\.com/[^"]*">\s*','',body,count=1)
FONTS='''
<style>
@font-face{font-family:'Inter';font-style:normal;font-display:swap;font-weight:100 900;src:url(/fonts/inter-latin-ext-wght-normal.woff2) format('woff2');unicode-range:U+0100-02BA,U+02BD-02C5,U+02C7-02CC,U+02CE-02D7,U+02DD-02FF,U+0304,U+0308,U+0329,U+1D00-1DBF,U+1E00-1E9F,U+1EF2-1EFF,U+2020,U+20A0-20AB,U+20AD-20C0,U+2113,U+2C60-2C7F,U+A720-A7FF}
@font-face{font-family:'Inter';font-style:normal;font-display:swap;font-weight:100 900;src:url(/fonts/inter-latin-wght-normal.woff2) format('woff2');unicode-range:U+0000-00FF,U+0131,U+0152-0153,U+02BB-02BC,U+02C6,U+02DA,U+02DC,U+0304,U+0308,U+0329,U+2000-206F,U+20AC,U+2122,U+2191,U+2193,U+2212,U+2215,U+FEFF,U+FFFD}
</style>
'''

sbf=out/'supabase.json'
sbcfg=json.loads(sbf.read_text()) if sbf.exists() else {}
d3=out/'3d'
v3d=''
if (d3/'iron3d.js').exists() and (d3/'body.glb').exists():
    h=hashlib.sha1()
    for f in sorted(d3.rglob('*')):
        if f.is_file(): h.update(str(f.relative_to(d3)).encode()); h.update(f.read_bytes())
    v3d=h.hexdigest()[:8]
sbjs=('window.IRON_SB='+json.dumps({'url':sbcfg.get('url',''),'key':sbcfg.get('key','')})+';') if sbcfg.get('url') else ''
ver=hashlib.sha1((src+v3d+FONTS).encode()).hexdigest()[:8]
# Alles, was offline gebraucht wird, landet beim Installieren im Cache (3D: ca. 2 MB)
shell=['/','/manifest.webmanifest','/icon.svg','/icon-192.png','/fonts/inter-latin-wght-normal.woff2','/fonts/inter-latin-ext-wght-normal.woff2']
if v3d: shell+=['/'+str(p.relative_to(out)) for p in sorted(d3.rglob('*')) if p.is_file() and p.suffix in ('.js','.glb','.webp')]
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
{FONTS}<script>window.IRON_STANDALONE=true;{sbjs}{('window.IRON_3D='+json.dumps(v3d)+';') if v3d else ''}</script>
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
const SHELL={json.dumps(shell)};
self.addEventListener('install',e=>{{e.waitUntil(caches.open(CACHE).then(async c=>{{await c.addAll(SHELL.slice(0,6));await Promise.all(SHELL.slice(6).map(u=>c.add(u).catch(()=>{{}})))}}).then(()=>self.skipWaiting()))}});
self.addEventListener('activate',e=>{{e.waitUntil(caches.keys().then(ks=>Promise.all(ks.filter(k=>k!==CACHE).map(k=>caches.delete(k)))).then(()=>self.clients.claim()))}});
self.addEventListener('fetch',e=>{{
 const u=new URL(e.request.url);
 if(e.request.method!=='GET'||u.origin!==location.origin) return;
 /* 3D-Dateien und Schriften ändern sich nur mit einer neuen Version: zuerst Cache, Versions-Parameter ignorieren */
 if(u.pathname.startsWith('/3d/')||u.pathname.startsWith('/fonts/')){{
  e.respondWith(caches.open(CACHE).then(c=>c.match(u.pathname).then(r=>r||fetch(e.request).then(res=>{{if(res.ok)c.put(u.pathname,res.clone());return res}}))));
  return;
 }}
 e.respondWith(fetch(e.request).then(r=>{{if(r.ok){{const c=r.clone();caches.open(CACHE).then(x=>x.put(e.request,c))}}return r}}).catch(()=>caches.match(e.request).then(r=>r||caches.match('/'))));
}});
''')
(out/'vercel.json').write_text(json.dumps({"headers":[{"source":"/sw.js","headers":[{"key":"Cache-Control","value":"no-cache"}]},
 {"source":"/fonts/(.*)","headers":[{"key":"Cache-Control","value":"public, max-age=31536000, immutable"}]},
 {"source":"/(.*)","headers":[{"key":"X-Content-Type-Options","value":"nosniff"},{"key":"Referrer-Policy","value":"strict-origin-when-cross-origin"}]}]},indent=1))
print('built',ver)
