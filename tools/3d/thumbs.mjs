// Rendert Vorschaubilder je Bewegungsmuster nach /3d/thumbs/<muster>.webp (transparent).
// Aufruf (nach build.mjs): node thumbs.mjs   – braucht Playwright mit Chromium.
import http from 'http'; import fs from 'fs'; import path from 'path'; import { createRequire } from 'module';
const require = createRequire(import.meta.url);
let chromium; try { ({ chromium } = require('playwright')); } catch (e) { ({ chromium } = require(path.join(process.env.NODE_PATH || '/usr/lib/node_modules', 'playwright'))); }
const ROOT = new URL('../../', import.meta.url).pathname;
const src = fs.readFileSync(ROOT + 'src-artifact.html', 'utf8');
// Häufigstes Equipment je Muster aus der Übungsdatenbank der App
const cnt = {}; for (const m of src.matchAll(/\['[^']+','(\w+)','(\w+)'/g)) { const [, p, e] = m; (cnt[p] ||= {})[e] = (cnt[p][e] || 0) + 1; }
const eqOf = Object.fromEntries(Object.entries(cnt).map(([p, o]) => [p, Object.entries(o).sort((a, b) => b[1] - a[1])[0][0]]));
Object.assign(eqOf, { squat: 'LH', lunge: 'KH', row: 'LH', lateral: 'KH', fly: 'KB', curl: 'KH', ohp: 'LH', pullover: 'KH', shrug: 'LH', bench: 'LH', incline: 'LH', facepull: 'KB', pulldown: 'KB', cablerow: 'KB', pushdown: 'KB', ohext: 'KH', dip: 'KG', pullup: 'KG', legpress: 'MA', legext: 'MA', legcurl: 'MA', abduct: 'MA', calf: 'KG', hyperext: 'KG' });
const T = { bench: 0.15, incline: 0.15, deadlift: 0, pushup: 0.25, legpress: 0.4, clean: 1, hipthrust: 1, swing: 0.85, crunch: 1, run: 0, bike: 0.1, hyperext: 1, pulldown: 0.6, cablerow: 0.7, fly: 0.6, row: 1, squat: 1, lunge: 1, dip: 0.6, pullup: 1, legext: 0.7, legcurl: 0.8 };
const types = { '.html': 'text/html', '.js': 'text/javascript', '.glb': 'model/gltf-binary' };

const srv = http.createServer((q, s) => { if (q.url === '/__blank') { s.writeHead(200, { 'content-type': 'text/html' }); s.end('<!doctype html><body>'); return; } const f = path.join(ROOT, decodeURIComponent(q.url.split('?')[0])); fs.readFile(f, (e, d) => { if (e) { s.writeHead(404); s.end(); } else { s.writeHead(200, { 'content-type': types[path.extname(f)] || 'application/octet-stream' }); s.end(d); } }); });
await new Promise((r) => srv.listen(8791, r));
const b = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
const p = await b.newPage(); p.on('pageerror', (e) => console.log('pageerror', e.message));
await p.goto('http://localhost:8791/__blank');
const pats = await p.evaluate(async () => Object.keys((await import('/3d/iron3d.js')).PATTERNS).filter((k) => !k.includes('@')));
fs.mkdirSync(ROOT + '3d/thumbs', { recursive: true });
let total = 0;
for (const k of pats) {
  const data = await p.evaluate(async ([k, eq, t]) => {
    const m = await import('/3d/iron3d.js'); const c = document.createElement('canvas'); c.width = c.height = 200;
    const sc = await m.thumb(c, k, eq, t, 200);
    const url = c.toDataURL('image/webp', 0.86); sc.dispose(); return url;
  }, [k, eqOf[k] || 'KG', T[k] ?? (k === 'plank' || k === 'stretch' || k === 'quad' || k === 'deepsquat' ? 0 : 1)]);
  const buf = Buffer.from(data.split(',')[1], 'base64'); fs.writeFileSync(ROOT + `3d/thumbs/${k}.webp`, buf); total += buf.length;
}
console.log(pats.length, 'Vorschaubilder,', (total / 1024).toFixed(0), 'KB');
await b.close(); srv.close();
