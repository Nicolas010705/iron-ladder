// Prüft alle Bewegungsmuster (mit den Geräte-Varianten, die die App nutzt) über den ganzen Ablauf:
//   reach  Hand/Fuß erreicht das Ziel nicht (Gerät schwebt neben der Hand), in cm
//   pop    sprunghafte Gelenkbewegung zwischen zwei Schritten (Vielfaches der mittleren Geschwindigkeit)
//   floor  Körperteil unter dem Boden, in cm
//   wrist  Handgelenk stärker als 95° abgeknickt
// Aufruf (nach node build.mjs): node check.mjs [muster,…]   – braucht Playwright mit Chromium.
import http from 'http'; import fs from 'fs'; import path from 'path'; import { createRequire } from 'module'; import { fileURLToPath } from 'url';
const require = createRequire(import.meta.url);
let chromium; try { ({ chromium } = require('playwright')); } catch (e) { ({ chromium } = require(path.join(process.env.NODE_PATH || '/usr/lib/node_modules', 'playwright'))); }
const ROOT = fileURLToPath(new URL('../../', import.meta.url));
const src = fs.readFileSync(ROOT + 'src-artifact.html', 'utf8');
const combos = new Set(); for (const m of src.matchAll(/\['[^']+','(\w+)','(KH|LH|KB|KG|MA|SM|SZ|BD|CA|KT)'/g)) combos.add(m[1] + '|' + m[2]);
const only = (process.argv[2] || '').split(',').filter(Boolean);
const strict = fs.existsSync(fileURLToPath(new URL('../../3d/anim/', import.meta.url))); // mit Animationsordner muss jede Kombination einen Clip haben
const srv = http.createServer((q, s) => { if (q.url === '/__blank') { s.writeHead(200, { 'content-type': 'text/html' }); s.end('<!doctype html><body>'); return; } const f = path.join(ROOT, decodeURIComponent(q.url.split('?')[0])); fs.readFile(f, (e, d) => { if (e) { s.writeHead(404); s.end(); } else { s.writeHead(200, { 'content-type': f.endsWith('.js') ? 'text/javascript' : 'application/octet-stream' }); s.end(d); } }); });
await new Promise((r) => srv.listen(0, r));
const b = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
const p = await b.newPage(); p.on('pageerror', (e) => console.log('pageerror', e.message));
await p.goto(`http://localhost:${srv.address().port}/__blank`);
const list = [...combos].map((c) => c.split('|')).filter(([k]) => !only.length || only.includes(k)).sort();
const res = await p.evaluate(async (list) => {
  const m = await import('/3d/iron3d.js'); const c = document.createElement('canvas'); c.width = c.height = 64;
  const model = await m.loadModel('/3d/body.glb'); const sc = new m.Scene3D(c, { maxDpr: 1, shadowSize: 256, clips: false });
  // Zweite Szene spielt die Blender-Animation (falls vorhanden) – Vergleich mit der IK-Bewegung
  const c2 = document.createElement('canvas'); c2.width = c2.height = 64;
  const sc2 = new m.Scene3D(c2, { maxDpr: 1, shadowSize: 256 });
  const JN = ['wrist.L', 'wrist.R', 'lowerarm01.L', 'lowerarm01.R', 'lowerleg01.L', 'lowerleg01.R', 'foot.L', 'foot.R', 'head', 'upperarm01.L', 'upperarm01.R'];
  const JC = [...JN, 'root', 'spine01', 'finger3-3.L', 'finger3-3.R', 'toe.L', 'toe.R'];
  const out = [];
  for (const [k, eq] of list) {
    // frische Figuren je Übung (wie in der App, wo jede Ansicht neu startet)
    const fig = new m.Figure(model); sc.setFigure(fig); const fig2 = new m.Figure(model); sc2.setFigure(fig2);
    await sc.setExercise(k, eq, [], [], '#00a86b');
    const hasClip = m.hasClip(k, eq); let clipDev = 0, clipFloor = 0, clipPop = 0, clipOk = true;
    if (hasClip) {
      await sc2.setExercise(k, eq, [], [], '#00a86b'); clipOk = !!sc2.clip;
      const own = /^curl-KH$/.test(k + '-' + eq); // von Hand in Blender animiert: Arme weichen bewusst ab
      let prev = null, prevI = null; const steps = []; let extra = 0;
      for (let i = 0; i <= 100; i++) {
        sc.frame(i / 100, 0); sc2.frame(i / 100, 0);
        const P = JC.map((n) => fig2.J(n)), PI = JC.map((n) => fig.J(n));
        for (let j = 0; j < JC.length; j++) {
          if (own && /arm|wrist|finger/.test(JC[j])) continue;
          clipDev = Math.max(clipDev, PI[j].distanceTo(P[j]) * 100);
        }
        for (const v of P) clipFloor = Math.max(clipFloor, -v.y * 100);
        if (prev) {
          steps.push(Math.max(...P.map((v, j) => v.distanceTo(prev[j]))));
          // Sprung, den die Animation zusätzlich zur IK-Bewegung macht (cm)
          for (let j = 0; j < JC.length; j++) extra = Math.max(extra, (P[j].distanceTo(prev[j]) - PI[j].distanceTo(prevI[j])) * 100);
        }
        prev = P; prevI = PI;
      }
      const s = [...steps].sort((a, b) => a - b); const med = s[Math.floor(s.length / 2)] || 1e-6;
      // von Hand animiert: absoluter Sprung-Test; sonst: kein zusätzlicher Sprung über 0,5 cm gegenüber der IK-Bewegung
      clipPop = own ? (s[s.length - 1] > 0.015 ? s[s.length - 1] / Math.max(med, 0.002) : 0) : (extra > 0.5 ? 99 : 0);
    }
    const N = 100; let reach = 0, wrist = 0, floor = 0; const steps = []; let prev = null; const warns = new Set();
    let meshFloor = 0, meshBone = '', meshAt = 0; const vtx = fig.J('root');
    for (let i = 0; i <= N; i++) {
      sc.frame(i / N, 0);
      for (const w of fig.warn) { const mm = w.match(/zu kurz um ([\d.]+)/); if (mm) reach = Math.max(reach, +mm[1]); if (/Handgelenk/.test(w)) wrist = Math.max(wrist, +w.match(/(\d+)°/)[1]); warns.add(w.replace(/[\d.]+/g, '#')); }
      const P = JC.map((n) => fig.J(n));
      for (const v of P) floor = Math.max(floor, -v.y * 100);
      if (i % 10 === 0) { // Körperoberfläche unter dem Boden (Haut, nicht nur Gelenke)
        fig.mesh.skeleton.update(); const pos = fig.mesh.geometry.attributes.position, sw = fig.mesh.geometry.attributes.skinWeight, si = fig.mesh.geometry.attributes.skinIndex;
        for (let j = 0; j < pos.count; j += 2) { fig.mesh.getVertexPosition(j, vtx); vtx.applyMatrix4(fig.mesh.matrixWorld);
          if (-vtx.y * 100 > meshFloor) { meshFloor = -vtx.y * 100; let best = 0, bi = 0; for (let q = 0; q < 4; q++) { const w = sw.getComponent(j, q); if (w > best) { best = w; bi = si.getComponent(j, q); } } meshBone = fig.mesh.skeleton.bones[bi].name; meshAt = i / N; } }
      }
      if (prev) steps.push(Math.max(...P.map((v, j) => v.distanceTo(prev[j]))));
      prev = P;
    }
    const sorted = [...steps].sort((a, b) => a - b); const med = sorted[Math.floor(sorted.length / 2)] || 1e-6;
    const mx = sorted[sorted.length - 1]; const at = steps.indexOf(mx) / N;
    out.push({ k, eq, reach: +reach.toFixed(1), wrist, floor: +floor.toFixed(1), pop: +(mx / Math.max(med, 0.002)).toFixed(1), popAt: +at.toFixed(2), popCm: +(mx * 100).toFixed(1),
      hasClip, clipOk, clipDev: +clipDev.toFixed(2), clipFloor: +clipFloor.toFixed(1), clipPop: +clipPop.toFixed(1),
      meshFloor: +meshFloor.toFixed(1), meshBone, meshAt });
  }
  return out;
}, list);
let bad = 0;
for (const r of res) {
  const f = []; if (r.reach > 1) f.push(`reach ${r.reach} cm`); if (r.pop > 4 && r.popCm > 1.5) f.push(`pop ${r.pop}× (${r.popCm} cm bei t=${r.popAt})`); if (r.floor > 1.5) f.push(`floor ${r.floor} cm`); if (r.wrist > 95) f.push(`wrist ${r.wrist}°`); // Liegestütz, Front-Rack usw. brauchen ~90°
  if (r.meshFloor > 1.5) f.push(`Haut ${r.meshFloor} cm im Boden (${r.meshBone}, t=${r.meshAt})`);
  // Blender-Animation: muss laden, der IK-Bewegung folgen (< 1 cm), nicht in den Boden und nicht springen
  if (r.hasClip) { if (!r.clipOk) f.push('clip lädt nicht'); if (r.clipDev > 1) f.push(`clip weicht ${r.clipDev} cm ab`); if (r.clipFloor > 1.5) f.push(`clip floor ${r.clipFloor} cm`); if (r.clipPop > 4) f.push(`clip pop ${r.clipPop}×`); }
  else if (strict) f.push('keine Blender-Animation');
  if (f.length) bad++;
  console.log((f.length ? '✗ ' : '✓ ') + `${r.k} ${r.eq}`.padEnd(18) + f.join(', '));
}
console.log(`\n${res.length} Kombinationen, ${bad} mit Auffälligkeiten`);
await b.close(); srv.close();
