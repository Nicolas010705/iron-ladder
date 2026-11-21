// Nimmt die Bewegungen aller Übungs-Kombinationen (Muster + Gerät aus der App-Datenbank) auf:
// 61 Stellungen t = 0 … 1 je Kombination, Weltlage (Position + Drehung) jedes Knochens der Figur.
// Ausgabe: anim.raw/bake/<muster>-<gerät>.json und anim.raw/bake/_rest.json (Ruhelage).
// Weiter in Blender: blender -b -P tools/blender/build_anims.py   (baut daraus die Animationen)
// Aufruf (nach node build.mjs): node bake.mjs [muster,…]   – braucht Playwright mit Chromium.
import http from 'http'; import fs from 'fs'; import path from 'path'; import { createRequire } from 'module'; import { fileURLToPath } from 'url';
const require = createRequire(import.meta.url);
const { chromium } = require('playwright');
const ROOT = fileURLToPath(new URL('../../', import.meta.url));
const OUT = fileURLToPath(new URL('./anim.raw/bake/', import.meta.url));
export const N = 120;
const src = fs.readFileSync(ROOT + 'src-artifact.html', 'utf8');
const combos = new Set(); for (const m of src.matchAll(/\['[^']+','(\w+)','(KH|LH|KB|KG|MA|SM|SZ|BD|CA|KT)'/g)) combos.add(m[1] + '|' + m[2]);
const only = (process.argv[2] || '').split(',').filter(Boolean);
const list = [...combos].map((c) => c.split('|')).filter(([k]) => !only.length || only.includes(k)).sort();
fs.mkdirSync(OUT, { recursive: true });
const srv = http.createServer((q, s) => { if (q.url === '/__blank') { s.writeHead(200, { 'content-type': 'text/html' }); s.end('<!doctype html><body>'); return; } const f = path.join(ROOT, decodeURIComponent(q.url.split('?')[0])); fs.readFile(f, (e, d) => { if (e) { s.writeHead(404); s.end(); } else { s.writeHead(200, { 'content-type': f.endsWith('.js') ? 'text/javascript' : 'application/octet-stream' }); s.end(d); } }); });
await new Promise((r) => srv.listen(0, r));
const b = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
const p = await b.newPage(); p.on('pageerror', (e) => console.log('pageerror', e.message));
await p.goto(`http://localhost:${srv.address().port}/__blank`);
// Hilfsfunktion im Browser: Weltlage aller Knochen relativ zur Figur-Wurzel
await p.evaluate(() => {
  window.__snap = (fig) => {
    fig.scene.updateMatrixWorld(true);
    const inv = fig.scene.matrixWorld.clone().invert(); const out = {};
    for (const bo of fig.rig.order) {
      const M = inv.clone().multiply(bo.matrixWorld); const e = M.elements;
      const sx = Math.hypot(e[0], e[1], e[2]), sy = Math.hypot(e[4], e[5], e[6]), sz = Math.hypot(e[8], e[9], e[10]);
      if (Math.abs(sx - 1) > 1e-3 || Math.abs(sy - 1) > 1e-3 || Math.abs(sz - 1) > 1e-3) throw new Error('Skalierung an ' + bo.name);
      const pp = { x: e[12], y: e[13], z: e[14] }; const q = { x: 0, y: 0, z: 0, w: 1 };
      // Drehung aus der Matrix (ohne THREE-Import: Formel wie Quaternion.setFromRotationMatrix)
      const m11 = e[0], m12 = e[4], m13 = e[8], m21 = e[1], m22 = e[5], m23 = e[9], m31 = e[2], m32 = e[6], m33 = e[10]; const tr = m11 + m22 + m33;
      if (tr > 0) { const s = 0.5 / Math.sqrt(tr + 1); q.w = 0.25 / s; q.x = (m32 - m23) * s; q.y = (m13 - m31) * s; q.z = (m21 - m12) * s; }
      else if (m11 > m22 && m11 > m33) { const s = 2 * Math.sqrt(1 + m11 - m22 - m33); q.w = (m32 - m23) / s; q.x = 0.25 * s; q.y = (m12 + m21) / s; q.z = (m13 + m31) / s; }
      else if (m22 > m33) { const s = 2 * Math.sqrt(1 + m22 - m11 - m33); q.w = (m13 - m31) / s; q.x = (m12 + m21) / s; q.y = 0.25 * s; q.z = (m23 + m32) / s; }
      else { const s = 2 * Math.sqrt(1 + m33 - m11 - m22); q.w = (m21 - m12) / s; q.x = (m13 + m31) / s; q.y = (m23 + m32) / s; q.z = 0.25 * s; }
      const r = (v) => Math.round(v * 1e6) / 1e6;
      out[bo.name] = [r(pp.x), r(pp.y), r(pp.z), r(q.x), r(q.y), r(q.z), r(q.w)];
    }
    return out;
  };
});
const rest = await p.evaluate(async () => {
  const m = await import('/3d/iron3d.js'); const c = document.createElement('canvas'); c.width = c.height = 64;
  const model = await m.loadModel('/3d/body.glb');
  window.__sc = new m.Scene3D(c, { maxDpr: 1, shadowSize: 256, clips: false }); window.__fig = new m.Figure(model); window.__sc.setFigure(window.__fig);
  const fresh = new m.Figure(model); const names = fresh.rig.order.map((b) => b.name);
  const parents = Object.fromEntries(fresh.rig.order.map((b) => [b.name, b.parent && b.parent.isBone ? b.parent.name : null]));
  return { names, parents, rest: window.__snap(fresh) };
});
fs.writeFileSync(OUT + '_rest.json', JSON.stringify(rest));
let n = 0;
for (const [k, eq] of list) {
  const frames = await p.evaluate(async ([k, eq, N]) => {
    // frische Figur je Übung (wie in der App, wo jede Ansicht neu startet)
    const m = await import('/3d/iron3d.js'); const sc = window.__sc; const fig = new m.Figure(await m.loadModel('/3d/body.glb')); sc.setFigure(fig);
    await sc.setExercise(k, eq, [], [], '#00a86b');
    const fr = []; for (let i = 0; i <= N; i++) { sc.frame(i / N, 0); fr.push(window.__snap(fig)); }
    return { looped: !!sc.pat.loop, frames: fr };
  }, [k, eq, N]);
  fs.writeFileSync(OUT + `${k}-${eq}.json`, JSON.stringify({ k, eq, N, ...frames })); n++;
}
console.log(n, 'Kombinationen aufgenommen nach', OUT);
await b.close(); srv.close();
