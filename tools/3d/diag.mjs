// Diagnose: tiefste Lage jedes Knochens über die Bewegung (cm, negativ = im Boden). Aufruf: node diag.mjs muster:gerät …
import http from 'http'; import fs from 'fs'; import path from 'path'; import { createRequire } from 'module'; import { fileURLToPath } from 'url';
const require = createRequire(import.meta.url);
const { chromium } = require('playwright');
const ROOT = fileURLToPath(new URL('../../', import.meta.url));
const srv = http.createServer((q, s) => { if (q.url === '/__blank') { s.writeHead(200, { 'content-type': 'text/html' }); s.end('<!doctype html><body>'); return; } const f = path.join(ROOT, decodeURIComponent(q.url.split('?')[0])); fs.readFile(f, (e, d) => { if (e) { s.writeHead(404); s.end(); } else { s.writeHead(200, { 'content-type': f.endsWith('.js') ? 'text/javascript' : 'application/octet-stream' }); s.end(d); } }); });
await new Promise((r) => srv.listen(0, r));
const b = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
const p = await b.newPage(); p.on('pageerror', (e) => console.log('pageerror', e.message));
await p.goto(`http://localhost:${srv.address().port}/__blank`);
for (const arg of process.argv.slice(2)) {
  const [k, eq] = arg.split(':');
  const r = await p.evaluate(async ([k, eq]) => {
    const m = await import('/3d/iron3d.js'); const c = document.createElement('canvas'); c.width = c.height = 64;
    const model = await m.loadModel('/3d/body.glb'); const sc = new m.Scene3D(c, { maxDpr: 1, shadowSize: 256, clips: false }); const fig = new m.Figure(model); sc.setFigure(fig);
    await sc.setExercise(k, eq, [], [], '#00a86b'); const low = {};
    for (let i = 0; i <= 50; i++) { sc.frame(i / 50, 0); for (const bo of fig.rig.order) { const y = bo.getWorldPosition(new (fig.J('root').constructor)()).y * 100; if (!(bo.name in low) || y < low[bo.name][0]) low[bo.name] = [+y.toFixed(1), i / 50]; } }
    // auch die Mesh-Unterkante (tiefster Vertex) über die Bewegung
    let meshLow = 1e9, at = 0; const v = new (fig.J('root').constructor)(); const byBone = {};
    const si = fig.mesh.geometry.attributes.skinIndex, sw = fig.mesh.geometry.attributes.skinWeight, bones = fig.mesh.skeleton.bones;
    for (let i = 0; i <= 20; i++) { sc.frame(i / 20, 0); fig.mesh.skeleton.update(); const pos = fig.mesh.geometry.attributes.position; for (let j = 0; j < pos.count; j += 2) { fig.mesh.getVertexPosition(j, v); v.applyMatrix4(fig.mesh.matrixWorld); if (v.y < meshLow) { meshLow = v.y; at = i / 20; }
      if (v.y < -0.01) { let best = 0, bi = 0; for (let q = 0; q < 4; q++) { const w = sw.getComponent(j, q); if (w > best) { best = w; bi = si.getComponent(j, q); } } const n = bones[bi].name; byBone[n] = Math.min(byBone[n] ?? 0, +(v.y * 100).toFixed(1)); } } }
    sc.dispose();
    return { below: Object.entries(low).filter(([, [y]]) => y < 0).sort((a, b) => a[1][0] - b[1][0]).slice(0, 4), meshLow: +(meshLow * 100).toFixed(1), at, meshBy: Object.entries(byBone).sort((a, b) => a[1] - b[1]).slice(0, 6) };
  }, [k, eq]);
  console.log(arg, JSON.stringify(r));
}
await b.close(); srv.close();
