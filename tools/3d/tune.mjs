// Probiert Varianten eines Posen-Werts aus und meldet die Prüfwerte (wie check.mjs) je Variante.
// Aufruf: node tune.mjs <muster> <equip> '<js: (P) => { … P anpassen … }>' ['<js2>' …]
//   P = PATTERNS[muster] (Objekt aus poses.js, wird im Browser verändert), z. B. "(P)=>{P.v.KH.a.bar.n=[0,1,0]}"
import http from 'http'; import fs from 'fs'; import path from 'path'; import { createRequire } from 'module'; import { fileURLToPath } from 'url';
const require = createRequire(import.meta.url);
const { chromium } = require('playwright');
const ROOT = fileURLToPath(new URL('../../', import.meta.url));
const [k, eq, ...muts] = process.argv.slice(2);
const srv = http.createServer((q, s) => { if (q.url === '/__blank') { s.writeHead(200, { 'content-type': 'text/html' }); s.end('<!doctype html><body>'); return; } const f = path.join(ROOT, decodeURIComponent(q.url.split('?')[0])); fs.readFile(f, (e, d) => { if (e) { s.writeHead(404); s.end(); } else { s.writeHead(200, { 'content-type': f.endsWith('.js') ? 'text/javascript' : 'application/octet-stream' }); s.end(d); } }); });
await new Promise((r) => srv.listen(0, r));
const b = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
const p = await b.newPage(); p.on('pageerror', (e) => console.log('pageerror', e.message));
await p.goto(`http://localhost:${srv.address().port}/__blank`);
for (const mut of muts.length ? muts : ['()=>{}']) {
  const r = await p.evaluate(async ([k, eq, mut]) => {
    const m = await import('/3d/iron3d.js'); const c = document.createElement('canvas'); c.width = c.height = 64;
    const P = m.PATTERNS[k]; const backup = JSON.stringify(P); (0, eval)(mut)(P);
    const model = await m.loadModel('/3d/body.glb'); const sc = new m.Scene3D(c, { maxDpr: 1, shadowSize: 256 }); const fig = new m.Figure(model); sc.setFigure(fig);
    await sc.setExercise(k, eq, [], [], '#00a86b');
    let reach = 0, wrist = 0, at = 0; const prof = [];
    for (let i = 0; i <= 50; i++) {
      sc.frame(i / 50, 0); let wi = 0;
      for (const w of fig.warn) { const mm = w.match(/zu kurz um ([\d.]+)/); if (mm) reach = Math.max(reach, +mm[1]); if (/Handgelenk/.test(w)) { const a = +w.match(/(\d+)°/)[1]; wi = Math.max(wi, a); if (a > wrist) { wrist = a; at = i / 50; } } }
      if (i % 5 === 0) prof.push(wi);
    }
    // Haut unter dem Boden (cm)
    let skin = 0; const v = fig.J('root');
    for (let i = 0; i <= 10; i++) { sc.frame(i / 10, 0); fig.mesh.skeleton.update(); const pos = fig.mesh.geometry.attributes.position; for (let j = 0; j < pos.count; j += 3) { fig.mesh.getVertexPosition(j, v); v.applyMatrix4(fig.mesh.matrixWorld); skin = Math.max(skin, -v.y * 100); } }
    const chest = (() => { sc.frame(1, 0); return +(fig.J('spine02').y * 100).toFixed(1); })();
    Object.keys(P).forEach((key) => delete P[key]); Object.assign(P, JSON.parse(backup)); sc.dispose();
    return { reach, wrist, at, skin: +skin.toFixed(1), chestY1: chest, prof: prof.join(' ') };
  }, [k, eq, mut]);
  console.log(JSON.stringify(r), mut);
}
await b.close(); srv.close();
