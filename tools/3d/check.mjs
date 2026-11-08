// Prüft alle Bewegungsmuster (mit den Geräte-Varianten, die die App nutzt) über den ganzen Ablauf:
//   reach  Hand/Fuß erreicht das Ziel nicht (Gerät schwebt neben der Hand), in cm
//   pop    sprunghafte Gelenkbewegung zwischen zwei Schritten (Vielfaches der mittleren Geschwindigkeit)
//   floor  Körperteil unter dem Boden, in cm
//   wrist  Handgelenk stärker als 95° abgeknickt
// Aufruf (nach node build.mjs): node check.mjs [muster,…]   – braucht Playwright mit Chromium.
import http from 'http'; import fs from 'fs'; import path from 'path'; import { createRequire } from 'module';
const require = createRequire(import.meta.url);
let chromium; try { ({ chromium } = require('playwright')); } catch (e) { ({ chromium } = require(path.join(process.env.NODE_PATH || '/usr/lib/node_modules', 'playwright'))); }
const ROOT = new URL('../../', import.meta.url).pathname;
const src = fs.readFileSync(ROOT + 'src-artifact.html', 'utf8');
const combos = new Set(); for (const m of src.matchAll(/\['[^']+','(\w+)','(KH|LH|KB|KG|MA|SM|SZ|BD|CA|KT)'/g)) combos.add(m[1] + '|' + m[2]);
const only = (process.argv[2] || '').split(',').filter(Boolean);
const srv = http.createServer((q, s) => { if (q.url === '/__blank') { s.writeHead(200, { 'content-type': 'text/html' }); s.end('<!doctype html><body>'); return; } const f = path.join(ROOT, decodeURIComponent(q.url.split('?')[0])); fs.readFile(f, (e, d) => { if (e) { s.writeHead(404); s.end(); } else { s.writeHead(200, { 'content-type': f.endsWith('.js') ? 'text/javascript' : 'application/octet-stream' }); s.end(d); } }); });
await new Promise((r) => srv.listen(0, r));
const b = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
const p = await b.newPage(); p.on('pageerror', (e) => console.log('pageerror', e.message));
await p.goto(`http://localhost:${srv.address().port}/__blank`);
const list = [...combos].map((c) => c.split('|')).filter(([k]) => !only.length || only.includes(k)).sort();
const res = await p.evaluate(async (list) => {
  const m = await import('/3d/iron3d.js'); const c = document.createElement('canvas'); c.width = c.height = 64;
  const model = await m.loadModel('/3d/body.glb'); const sc = new m.Scene3D(c, { maxDpr: 1, shadowSize: 256 }); const fig = new m.Figure(model); sc.setFigure(fig);
  const JN = ['wrist.L', 'wrist.R', 'lowerarm01.L', 'lowerarm01.R', 'lowerleg01.L', 'lowerleg01.R', 'foot.L', 'foot.R', 'head', 'upperarm01.L', 'upperarm01.R'];
  const out = [];
  for (const [k, eq] of list) {
    await sc.setExercise(k, eq, [], [], '#00a86b');
    const N = 100; let reach = 0, wrist = 0, floor = 0; const steps = []; let prev = null; const warns = new Set();
    for (let i = 0; i <= N; i++) {
      sc.frame(i / N, 0);
      for (const w of fig.warn) { const mm = w.match(/zu kurz um ([\d.]+)/); if (mm) reach = Math.max(reach, +mm[1]); if (/Handgelenk/.test(w)) wrist = Math.max(wrist, +w.match(/(\d+)°/)[1]); warns.add(w.replace(/[\d.]+/g, '#')); }
      const P = JN.map((n) => fig.J(n));
      for (const v of P) floor = Math.max(floor, -v.y * 100);
      if (prev) steps.push(Math.max(...P.map((v, j) => v.distanceTo(prev[j]))));
      prev = P;
    }
    const sorted = [...steps].sort((a, b) => a - b); const med = sorted[Math.floor(sorted.length / 2)] || 1e-6;
    const mx = sorted[sorted.length - 1]; const at = steps.indexOf(mx) / N;
    out.push({ k, eq, reach: +reach.toFixed(1), wrist, floor: +floor.toFixed(1), pop: +(mx / Math.max(med, 0.002)).toFixed(1), popAt: +at.toFixed(2), popCm: +(mx * 100).toFixed(1) });
  }
  return out;
}, list);
let bad = 0;
for (const r of res) {
  const f = []; if (r.reach > 1) f.push(`reach ${r.reach} cm`); if (r.pop > 4 && r.popCm > 1.5) f.push(`pop ${r.pop}× (${r.popCm} cm bei t=${r.popAt})`); if (r.floor > 1.5) f.push(`floor ${r.floor} cm`); if (r.wrist > 95) f.push(`wrist ${r.wrist}°`); // Liegestütz, Front-Rack usw. brauchen ~90°
  if (f.length) bad++;
  console.log((f.length ? '✗ ' : '✓ ') + `${r.k} ${r.eq}`.padEnd(18) + f.join(', '));
}
console.log(`\n${res.length} Kombinationen, ${bad} mit Auffälligkeiten`);
await b.close(); srv.close();
